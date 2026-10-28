// npc-ask.js — a character's words, asked in a side session of their own (npc-talk.js's way to the model; the path
// 台词预取 opened, games/prefetch-ling.js): POST /api/sessions bound to the same save, every tool withheld, one
// session for the whole talk (the character remembers what was said) and removed when the talk closes. The story's
// chat never holds a line of it — not the hidden line, not the reply, not a tool call (Hanli 2026-10-28: 「现在看起来
// 像是ling在砍价, 能否改成[货郎]: 客官您好 这么说话, 省掉[ling]的工具调用?」). The page never resumes it
// (`NPC_TITLE`, lingjing.js boundAsPage), and one left by a page closed mid-talk is swept on the next.
//
//   const talk = npcAsk({ params, agent: 'ling' }); await talk.say(line) → reply text; talk.close()

import { refusalOf } from './games/drawguess-rules.js';

const SKILL = 'lingjing';
const POLL_MS = 500;
/** The side session's title: the story page passes over it when it resumes the day's chat. */
export const NPC_TITLE = 'NPC对话';
/** Every tool Lingjing gives Ling or 银月 (SKILL.md `tools`, `allowed-tools`): withheld — a character's words touch
    nothing (tests/npc-talk.test.mjs holds the list to SKILL.md). */
export const NPC_WITHHELD = ['AskUser', 'GenerateImage', 'Look', 'Progress', 'Story', 'Resolve', 'Judge', 'Practice', 'Tale', 'Move', 'Trade',
  'Lundao', 'Duizi', 'Twenty', 'Couplet', 'Tame', 'Refine', 'Ring', 'Divine', 'Lang', 'Make', 'Enter', 'Leave', 'Build', 'Restart', 'Go', 'Undo',
  'Unstick', 'Saves', 'Save', 'Load', 'Forget', 'Worlds', 'Travel', 'Amend', 'Art', 'Meet', 'Quest', 'Show', 'Remember', 'Guide', 'Verb', 'AppTool'];

/** Side sessions a closed page left behind (older than `ageSec`): their ids, each removed. */
export function sweepNpc(sessions, remove, { nowSec = Date.now() / 1000, ageSec = 600 } = {}) {
  const old = (sessions ?? []).filter((x) => x.title === NPC_TITLE && nowSec - (x.created_at ?? 0) > ageSec).map((x) => x.id);
  for (const id of old) Promise.resolve(remove(SKILL, id)).catch(() => {});
  return old;
}

let apiP = null;
const api = () => (apiP ??= import('/shared/api.js'));
const channel = (url, init) => globalThis.LinggenChannel.fetch(url, init);
const post = (url, body) => channel(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * A talk with one character. `params`: the session's binding (`{ save }` on a test save, else none). `say(text)`
 * answers the reply's text, or throws (`far` when the engine cannot be reached; `timeout`; a refusal). The deps
 * (`deps.api`, `deps.post`) are a test's.
 */
export function npcAsk({ params = null, agent = 'ling', model = null, deps = {} } = {}) {
  const getApi = deps.api ?? api, send = deps.post ?? post;
  let sid = null, made = null, closed = false;
  const open = async () => {
    const { listSkillSessions, removeSkillSession } = await getApi();
    sweepNpc(await listSkillSessions(SKILL).catch(() => []), removeSkillSession);
    const bound = params && Object.keys(params).length ? { params } : {};
    const res = await send('/api/sessions', { title: NPC_TITLE, skill: SKILL, withheld_tools: NPC_WITHHELD, ...bound });
    if (!res.ok) throw new Error(`session ${res.status}`);
    sid = (await res.json()).id;
    return sid;
  };
  const said = async () => {
    const { fetchSessionMessages } = await getApi();
    const rows = await fetchSessionMessages(SKILL, sid).catch(() => []);
    return rows.filter(([m, t]) => m?.from === agent && m.to === 'user' && t).map(([, t]) => t);
  };
  async function say(text, { signal, timeoutMs = 45000 } = {}) {
    if (closed) throw new Error('closed');
    if (!globalThis.LinggenChannel?.fetch && !deps.post) throw new Error('far');
    await (made ??= open());
    const seen = (await said()).length;
    const res = await send('/api/chat', { project_root: '', agent_id: agent, message: text, session_id: sid, skill_name: SKILL, ...(model ? { model_id: model } : {}) });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const refused = refusalOf(await res.json().catch(() => null));
    if (refused) throw new Error(refused);
    const until = Date.now() + timeoutMs;
    for (;;) {
      if (signal?.aborted || closed) throw new Error('left');
      if (Date.now() > until) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, deps.pollMs ?? POLL_MS));
      const got = await said();
      if (got.length > seen) return got[seen];
    }
  }
  async function close() {
    closed = true;
    await made?.catch(() => null);
    if (!sid) return;
    const { removeSkillSession } = await getApi();
    await Promise.resolve(removeSkillSession(SKILL, sid)).catch(() => {});
  }
  return { say, close, get session() { return sid; } };
}
