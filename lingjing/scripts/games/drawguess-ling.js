// drawguess-ling.js — 画猜's one way to the model: a turn in the game's own chat (POST /api/chat with
// `images`, the path every chat surface uses; chat/structured.rs gates the image on the bound model's
// vision). Each look is the player's own line to the guesser in that chat — 「@银月 …」 and the picture,
// her guest turn at Lingjing's table — and her reply lands there as hers (Hanli, 2026-10-19: no
// throwaway session; she sees the dialogue, so a look never restates what she guessed before). The
// engine sends a picture to the model once, with the turn that carries it; later turns read it as a
// numbered note. Sessions and models come from the engine's /shared/api.js.
// The model only ever guesses: what counts as right is drawguess-rules.js's.
// The same one way serves 今's 聊天 (games/jinchat.js, 2026-10-22): a turn to Ling with no picture, a
// longer wait (`timeoutMs`) — the transport is one, never a second copy.

import { refusalOf } from './drawguess-rules.js';

const SKILL = 'lingjing';
const POLL_MS = 500;
export const TIMEOUT_MS = 25000;

let apiP = null;
const api = () => (apiP ??= import('/shared/api.js'));
const channel = (url, init) => globalThis.LinggenChannel.fetch(url, init);
const post = (url, body) => channel(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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

/** The guesser's lines to the player in the session so far (`[row, text]` pairs, oldest first). */
async function linesOf(sid, agent) {
  const { fetchSessionMessages } = await api();
  const rows = await fetchSessionMessages(SKILL, sid).catch(() => []);
  return rows.filter(([m]) => m?.from === agent && m.to === 'user');
}

/** The guesser's first line past the `seen` they had said before this look, or null: the chat holds
    the day, so an earlier line of hers is never taken for this look's answer. */
export const replyPast = (said, seen) => (said.length > seen ? said[seen][1] : null);

async function replyAfter(sid, agent, seen, deadline, signal) {
  while (performance.now() < deadline) {
    if (signal?.aborted) throw new Error('left');
    await new Promise((r) => setTimeout(r, POLL_MS));
    const text = replyPast(await linesOf(sid, agent), seen);
    if (text != null) return { text };
  }
  throw new Error('timeout');
}

/** The turn a look sends: the player's line to the guesser and the picture, in the game's chat. A turn
    with no picture (今's 聊天, games/jinchat.js: a line to Ling only) carries no `images`. */
export const lookTurn = ({ sid, agent, png = null, text, model = null }) => ({
  project_root: '', agent_id: agent, message: text, session_id: sid, skill_name: SKILL, ...(png ? { images: [png] } : {}), ...(model ? { model_id: model } : {}),
});

/**
 * One look in the game's chat `sid`: the PNG (bare base64) and the player's words, to the guesser —
 * `agent` 'yinyue' (her guest turn at Lingjing's table: SKILL.md `place.yinyue`), or 'ling'. Answers
 * { text, ms, model } or { refused: 'absent' | 'unavailable' } when the engine runs no turn for her
 * (not awake in the save the chat is bound to, `absent_until`; or the pet is off).
 * `model`: a model id for the turn instead of the session's (a test's `data.model`).
 */
export async function askInChat({ sid, agent = 'yinyue', png, text, model = null, signal, timeoutMs = TIMEOUT_MS }) {
  const t0 = performance.now();
  const seen = (await linesOf(sid, agent)).length;
  const res = await post('/api/chat', lookTurn({ sid, agent, png, text, model }));
  if (!res.ok) throw new Error(`chat ${res.status}`);
  const refused = refusalOf(await res.json().catch(() => null));
  if (refused) return { refused };
  const got = await replyAfter(sid, agent, seen, t0 + timeoutMs, signal);
  const bound = await boundModel(sid).catch(() => null);
  return { ...got, ms: Math.round(performance.now() - t0), model: bound };
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
