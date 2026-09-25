// rules/guide.mjs — Ling's rules, handed over when the game gets there.
//
// SKILL.md carried the whole game on every turn — 71 KB, ≈18k tokens — though
// a sitting touches a few parts of it. His ruling (2026-09-25): 没出现的内容，
// 不用一直带着 — SKILL.md keeps the laws and a line for every part; each part's
// detail lives in guide/<topic>.md and reaches Ling two ways:
//   · pushed — the first time in a session the game gets there, the result
//     carries `guide: { <topic>: text }` (the same answer the rules give);
//   · pulled — the Guide tool reads one by name, when Ling needs it.
// Once per session per topic: the save remembers which were handed to which
// session (`guided`), never logged, so Undo takes back moves, not reading.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../guide');
const tag = (said, re) => re.test(String(said ?? '').trim());
const has = (xs) => Array.isArray(xs) && xs.length > 0;

/* When each part becomes live — read from the verb, the player's words or a
   page report (`said`), and the answer about to go back. */
export const TOPICS = {
  look: () => true, // the first answer of a session: what Look carries
  fight: ({ verb, said, result, state }) => Boolean(state?.fight || result?.fight || result?.place?.encounter)
    || ['tame', 'refine', 'duel'].includes(verb) || result?.refused === 'in-a-fight' || tag(said, /^\[scene\] (won|lost|withdrew)\b/),
  road: ({ verb, said, result }) => ['move', 'trade', 'meet'].includes(verb) || Boolean(result?.place?.meet || result?.place?.has?.shop) || tag(said, /^\[scene\] arrived\b|^(去|go to\s)/i),
  trial: ({ said, result }) => result?.place?.meet?.kind === 'trial' || tag(said, /^\[scene\] trial\b/),
  tasks: ({ verb, result }) => ['task', 'quest'].includes(verb) || has(result?.offers) || has(result?.book) || Boolean(result?.handed),
  lundao: ({ verb, result }) => verb === 'lundao' || Boolean(result?.lundao) || (result?.tasks ?? []).some(t => t.kind === 'word' && t.status !== 'done'),
  tale: ({ verb, said, result }) => verb === 'tale' || Boolean(result?.story_due || result?.tale) || tag(said, /^\[scene\] tale\b|今日传闻/),
  her: ({ verb, result }) => verb === 'ring' || Boolean(result?.quest),
  divine: ({ verb, said }) => verb === 'divine' || tag(said, /起一?卦|算一?卦|问卦|命格|生辰|属相|八字|\bdivine\b/i),
  made: ({ verb, said, result }) => ['make', 'build', 'amend', 'art', 'enter', 'leave'].includes(verb) || Boolean(result?.building || result?.made?.at)
    || result?.refused === 'still-building' || tag(said, /造一|自己的(场景|世界)|make (a|my) (scene|world)/i),
  steer: ({ verb, said }) => ['init', 'go', 'undo', 'saves', 'save', 'load', 'forget', 'worlds', 'travel'].includes(verb)
    || tag(said, /重来|从头|存档|读档|悔棋|回到昨|别的世界|restart|begin again|\bsave\b|\bload\b|\bundo\b|another world/i),
  story: ({ verb, said, result }) => verb === 'story' || Boolean(result?.recap_due || result?.chapter?.fresh || result?.summarize || result?.ending) || result?.ended === true
    || tag(said, /^\[scene\] recap\b|前面的故事|九鼎是|上回/),
};

export const topics = () => Object.keys(TOPICS);
export const guideText = (topic) => {
  const file = path.join(DIR, `${topic}.md`);
  return TOPICS[topic] && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

/* Guide — one part by name; with none, the list. */
export function guideVerb(args = {}) {
  const topic = String(args.topic ?? '').trim().toLowerCase();
  const text = guideText(topic);
  return text ? { ok: true, topic, text } : { ok: false, refused: 'unknown-topic', topics: topics() };
}

/* The parts that became live with this answer and were not yet handed to this
   session. Returns the answer with `guide`, and the save's `guided` to keep. */
export function withGuides({ verb, said, result, state, session }) {
  if (!result || typeof result !== 'object' || verb === 'guide') return { result, guided: null };
  const key = String(session ?? 'none');
  const was = state?.guided?.session === key ? state.guided.topics ?? [] : [];
  const live = topics().filter(t => !was.includes(t) && TOPICS[t]({ verb, said, result, state }));
  const guide = Object.fromEntries(live.map(t => [t, guideText(t)]).filter(([, text]) => text));
  if (!Object.keys(guide).length) return { result, guided: null };
  return { result: { ...result, guide }, guided: { session: key, topics: [...was, ...Object.keys(guide)] } };
}
