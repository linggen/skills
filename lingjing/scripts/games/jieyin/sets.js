// sets.js — which seals a device may ask for (Hanli 2026-10-21: 「mac上可以用双手, iPhone只有单手」). Pure but for the
// one media query it is handed. The rule is data (worlds/jiuding/levels/jieyin.json `sets`): the first set whose `when`
// matches the page, else the last; `hands` the most a seal may need there. A move (`moves`) or a level names a
// sequence for every set, so everything can be cast on a phone and on a Mac.
//
//   setOf(kit, { matchMedia, search }) → set { id, hands }     (`?hands=1|2` on a dev page picks by hand count)
//   sealsFor(kit, set)                 → the seal table that set may judge (one-hand only on a phone)
//   sequenceFor(kit, level | move, set) → that set's sequence: `sequences[set]`, else the move's, else `sequence`

import { handsOf } from './judge.js';

const FALLBACK = [{ id: 'phone', hands: 1 }];
const setsOf = (kit) => (Array.isArray(kit?.sets) && kit.sets.length ? kit.sets : FALLBACK);

/** The set for this page. `matchMedia` as the window's; none (node, an old host) → the last set. */
export function setOf(kit, { matchMedia = globalThis.matchMedia?.bind(globalThis), search = globalThis.location?.search ?? '' } = {}) {
  const sets = setsOf(kit), q = new URLSearchParams(search);
  const asked = q.get('dev') === '1' ? Number(q.get('hands')) : NaN;
  if (asked === 1 || asked === 2) return sets.find((s) => s.hands === asked) ?? sets.at(-1);
  return sets.find((s) => s.when && matchMedia?.(s.when)?.matches) ?? sets.at(-1);
}

const setId = (set) => (typeof set === 'string' ? set : set?.id);
const handsIn = (kit, set) => (typeof set === 'object' ? set.hands : setsOf(kit).find((s) => s.id === set)?.hands) ?? 1;

/** The seals a set may judge: none needing more hands than it has. */
export function sealsFor(kit, set) {
  const most = handsIn(kit, set);
  return Object.fromEntries(Object.entries(kit.seals).filter(([, s]) => handsOf(s) <= most));
}

/** A level's (or a move's, by id or row) sequence for a set. */
export function sequenceFor(kit, of, set) {
  const id = setId(set);
  const row = typeof of === 'string' ? kit.moves?.[of] : of;
  if (!row) return [];
  return row.sequences?.[id] ?? row[id] ?? (row.move ? sequenceFor(kit, row.move, set) : null) ?? row.sequence ?? [];
}
