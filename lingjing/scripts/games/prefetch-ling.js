// prefetch-ling.js — 台词预取's one way to 银月 (prefetch.js holds the facts and the checks). The same path 画猜 uses
// (drawguess-ling.js): a turn of hers through POST /api/chat, her reply read back from the session. Not the story's
// own chat: this is a side session of its own, bound to the same save (so the engine answers for her presence as it
// does in the story), with her save tools withheld, and removed once she has answered — her reply is a list of lines
// for the game, never a message the player should read in the chat, and the page never resumes it
// (`PREFETCH_TITLE`, lingjing.js recentSessionId). Her reply ends SILENT, so nothing is said aloud.

import { refusalOf } from './drawguess-rules.js';
import { factsFor, prefetchLines } from './prefetch.js';

const SKILL = 'lingjing';
const POLL_MS = 500;
/** The side session's title: the story page passes over it when it resumes the day's chat. */
export const PREFETCH_TITLE = '台词预取';
/** Her tools in Lingjing (SKILL.md `place.yinyue.tools`): withheld here — writing lines touches nothing. */
export const WITHHELD = ['AppTool', 'Story'];

let apiP = null;
const api = () => (apiP ??= import('/shared/api.js'));
const channel = (url, init) => globalThis.LinggenChannel.fetch(url, init);
const post = (url, body) => channel(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Ask her `text` once in a side session bound to `params` (`{ save }` on a test save, else none). Answers her reply
 * text; throws 'absent' / 'unavailable' when the engine runs no turn for her, or on any failure. `signal` stops the
 * wait, and past `giveUpMs` it stops polling (the session is removed either way).
 */
export async function askHer(text, { params = null, signal, model = null, giveUpMs = 60000 } = {}) {
  const until = Date.now() + giveUpMs;
  const { fetchSessionMessages, removeSkillSession } = await api();
  const bound = params && Object.keys(params).length ? { params } : {};
  const made = await post('/api/sessions', { title: PREFETCH_TITLE, skill: SKILL, withheld_tools: WITHHELD, ...bound });
  if (!made.ok) throw new Error(`session ${made.status}`);
  const { id: sid } = await made.json();
  try {
    const res = await post('/api/chat', { project_root: '', agent_id: 'yinyue', message: text, session_id: sid, skill_name: SKILL, ...(model ? { model_id: model } : {}) });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const refused = refusalOf(await res.json().catch(() => null));
    if (refused) throw new Error(refused);
    for (;;) {
      if (signal?.aborted) throw new Error('left');
      if (Date.now() > until) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, POLL_MS));
      const rows = await fetchSessionMessages(SKILL, sid).catch(() => []);
      const said = rows.find(([m, t]) => m?.from === 'yinyue' && t);
      if (said) return said[1];
    }
  } finally {
    removeSkillSession(SKILL, sid).catch(() => {});
  }
}

/** A dev page's `?prefetch=1` (the 游戏厅, the try page): playAlone's `prefetch` for a game with a level, else null.
    No save there: the side session is unbound, and the main save's 银月 answers if she is awake. */
export function devPrefetch(mod, { data = {}, lang = 'zh', search = globalThis.location?.search ?? '' } = {}) {
  if (new URLSearchParams(search).get('prefetch') !== '1' || typeof mod?.levelOf !== 'function') return null;
  return ({ signal }) => {
    const p = prefetchLines({ facts: factsFor(mod, { data, lang }), ask: (text, o) => askHer(text, o), shape: mod.meta?.lines, signal });
    p?.done.then((r) => { globalThis.__prefetch = r; console.info('[prefetch]', r.ok ? Object.keys(r.got).length : r.why, `${r.ms} ms`, r.got); });
    return p ? { lines: p.lines } : null;
  };
}
