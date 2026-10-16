// drawguess-ling.js — 画猜's one way to the model: Ling, through the engine's own chat (POST
// /api/chat with `images`, the path every chat surface uses; chat/structured.rs gates the image on
// the bound model's vision). Sessions and models come from the engine's /shared/api.js; only the
// calls that are this game's own live here.
// A round has a skill session of its own (`openRound`), emptied before every look so no earlier
// picture rides along a second time, and removed when the round ends (`closeRound`) — so nothing
// it said is ever the player's day chat (pickResumable takes the newest spoken lingjing session).
// (Live 10-16 on gpt-6-luna: ~8.7k prompt tokens a look — Ling's lingjing prompt and tools, the
// picture ~250 — none of it served from the provider's cache, whether a look had a session of its
// own or shared the round's.)
// The model only ever guesses: what counts as right is drawguess-rules.js's.

import { refusalOf } from './drawguess-rules.js';

const SKILL = 'lingjing';
const TITLE = 'Lingjing 画猜';
const POLL_MS = 400;
export const TIMEOUT_MS = 25000;

let apiP = null;
const api = () => (apiP ??= import('/shared/api.js'));
const channel = (url, init) => globalThis.LinggenChannel.fetch(url, init);
const post = (url, body) => channel(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const open = new Set(); // sessions made and not yet removed

/** The model a session is bound to, as the engine assembles its prompt: { provider, id }. */
async function boundModel(sid) {
  const res = await channel(`/api/chat/system-prompt?project_root=&agent_id=ling&session_id=${encodeURIComponent(sid)}`);
  if (!res.ok) return null;
  const { provider, model_id } = await res.json();
  return { provider, id: model_id };
}

/** The default model's own config says it cannot see (`no-vision`): no call needed to know. */
export async function declaredBlind() {
  const { fetchModels, fetchDefaultModel } = await api();
  const [models, id] = await Promise.all([fetchModels(), fetchDefaultModel()]);
  const m = models.find((x) => x.id === id);
  return m && (m.tags ?? []).some((t) => /^no-vision$/i.test(t)) ? id : null;
}

/** A round's session. */
export async function openRound() {
  const { createSession } = await api();
  const { id } = await createSession(TITLE, SKILL);
  open.add(id);
  return id;
}

/** The round is over: its session goes. */
export async function closeRound(sid, { keepalive = false } = {}) {
  if (!sid || !open.delete(sid)) return;
  const { removeSkillSession } = await api();
  await removeSkillSession(SKILL, sid, { keepalive }).catch(() => {});
}

/** The guesser's reply in a session: their first line to the user after ours. */
async function replyIn(sid, agent, deadline, signal) {
  const { fetchSessionMessages } = await api();
  while (performance.now() < deadline) {
    if (signal?.aborted) throw new Error('left');
    await new Promise((r) => setTimeout(r, POLL_MS));
    const rows = await fetchSessionMessages(SKILL, sid).catch(() => []);
    const hers = rows.filter(([m]) => m?.from === agent);
    const said = hers.find(([m]) => m.to === 'user');
    if (said) return { text: said[1], tools: hers.length - 1 };
  }
  throw new Error('timeout');
}

/**
 * One look in the round's session: the PNG (bare base64) and the words, to the guesser — `agent`
 * 'ling', or 'yinyue' (her guest turn at Lingjing's table: SKILL.md `place.yinyue`, her tools there
 * Voice · AppTool · Story, no memory). Answers { text, ms, model, tools } — `tools` > 0 means a tool
 * was reached for (they are asked not to) — or { refused: 'absent' | 'unavailable' } when the
 * engine runs no turn for her (not met yet in the save, `absent_until`; or the pet is off).
 * `model`: a model id for the session instead of the default (a test's `data.model`).
 */
export async function askLing({ sid, agent = 'ling', png, prompt, model = null, signal, timeoutMs = TIMEOUT_MS }) {
  const t0 = performance.now();
  await post('/api/chat/clear', { session_id: sid });
  const body = { project_root: '', agent_id: agent, message: prompt, session_id: sid, skill_name: SKILL, images: [png], ...(model ? { model_id: model } : {}) };
  const res = await post('/api/chat', body);
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const refused = refusalOf(await res.json().catch(() => null));
  if (refused) return { refused };
  const got = await replyIn(sid, agent, t0 + timeoutMs, signal);
  const bound = await boundModel(sid).catch(() => null);
  return { ...got, ms: Math.round(performance.now() - t0), model: bound };
}

/** One look in a session made and removed for it (the opening look, once a page). */
export async function askOnce(o) {
  const sid = await openRound();
  try {
    return await askLing({ ...o, sid });
  } finally {
    closeRound(sid);
  }
}

/** The page is going: remove what is still open (a pagehide cleanup). */
export function dropOpen() {
  for (const id of [...open]) closeRound(id, { keepalive: true });
}

/** Whether the page has a way to the engine at all. */
export async function reachable() {
  try {
    await api();
    return Boolean(globalThis.LinggenChannel?.fetch);
  } catch {
    return false;
  }
}
