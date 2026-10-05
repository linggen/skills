// rules/locks.mjs — Story gates: the verbs a shut system refuses, and what Look leaves out.
// Part of the rules engine; rules.mjs is its one door.
//
// A chapter declares what it keeps shut and the scene that opens it
// (chapter.json `locks`; state.mjs lockedOf). Here the rules keep to it: a
// shut system's verb is refused with `not-yet` and the chapter's own line, and
// Look carries nothing of it — no field, no card, no chip — so neither Ling
// nor the page can offer what the story has not reached.
import { lockedOf, pick } from '../state.mjs';
import { isOnce } from './chores.mjs';

/* A chore by id: the apps' menu (`ctx.quests`), 开府's milestones are its `once` rows. */
const choreSystem = (ctx, id) => {
  const q = (ctx.quests ?? []).find(x => x.id === id);
  return q ? (isOnce(q) ? 'kaifu' : 'chores') : null;
};

/* The system each verb belongs to — given its arguments — or null for a verb
   every save may use (Look, Resolve, the story's own boards and fights …). */
const VERB_SYSTEM = {
  divine: () => 'divine',
  seclude: () => 'seclusion',
  meet: () => 'road',
  tale: () => 'errands',
  trade: () => 'wealth',
  quest: (args, ctx) => (args.action === 'kaifu' ? 'kaifu' : choreSystem(ctx, String(args.id ?? '')) ?? 'errands'),
  task: (args, ctx) => (args.action === 'check' ? choreSystem(ctx, String(args.id ?? '')) ?? 'chores' : null),
};

/* The refusal for a verb whose system is shut here, or null. */
export function lockedVerb(content, state, verb, args = {}, ctx = {}) {
  const shut = lockedOf(content, state);
  if (!shut.length) return null;
  const system = VERB_SYSTEM[verb]?.(args, ctx) ?? null;
  if (!system || !shut.includes(system)) return null;
  const say = pick(content.chapters[state.chapter].locks.say, state.lang) ?? null;
  return { state: null, result: { ok: false, refused: 'not-yet', system, say } };
}

/* Every verb of the table, kept to the gates. */
export const gated = verbs => Object.fromEntries(Object.entries(verbs).map(([verb, fn]) => [verb,
  (state, content, ctx, args) => lockedVerb(content, state, verb, args, ctx) ?? fn(state, content, ctx, args)]));

/* The fields of Look (and Progress) each shut system takes out. The book, the
   chores and 开府 are filtered where they are made (errands.mjs bookOf,
   look.mjs tasksBrief), so every reader of them agrees. */
const HIDES = {
  cultivation: ['tier', 'progress', 'next', 'practice_hint'],
  wealth: ['wealth'],
  divine: ['divination'],
  errands: ['offers', 'work', 'handed', 'tale', 'known', 'story_due', 'story_why', 'lundao'],
  road: ['chance'],
  seclusion: ['seclusion'],
};

/* A reading with every shut system taken out, and `locked` naming them. */
export function withoutLocked(content, state, brief) {
  const shut = lockedOf(content, state);
  if (!shut.length) return brief;
  const out = { ...brief, locked: [...shut] };
  for (const system of shut) for (const key of HIDES[system] ?? []) delete out[key];
  // What the road met is the road's.
  if (shut.includes('road') && out.place?.meet) { const { meet, ...place } = out.place; out.place = place; }
  // A shelf is the 灵石's: before them, a shop (石坳村's 货郎) shows nothing to buy.
  if (shut.includes('wealth') && out.place?.shelf?.length) out.place = { ...out.place, shelf: [], show: (out.place.show ?? []).filter(c => c.card !== 'item') };
  return out;
}

export const isLocked = (content, state, system) => lockedOf(content, state).includes(system);
