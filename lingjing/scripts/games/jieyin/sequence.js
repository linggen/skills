// sequence.js — seals in order, as time passes (pure; the judge's answer each frame goes in, what happened comes out).
//
//   start(level) → state      step(state, sealId | null, dtMs, knobs) → { state, events }
//
// A seal counts once it is held `knobs.holdMs` (a hand passes through other shapes between seals; a flash of one is
// nothing); a WRONG seal must be held longer (`knobs.wrongMs`) before it is a mistake — the way from one seal to the
// next can pass through a third. A frame or two with no seal (`knobs.graceMs`) does not break a hold. The seal just counted, held on or
// made again, is never a mistake. Two modes (the level's `mode`):
//   sequence  the big move: every seal of `sequence` in order casts it ('cast'); a wrong seal held = 走火 ('fizzle'),
//             back to the first seal — a comic puff, no other cost.
//   one       teaching: one seal at a time, its hint shown; a wrong seal held is only 'miss' (try again); the last
//             one done = 'done'.
// A level with `forgive` (古六's 讲堂, its closing 火蛋) keeps a sequence's order and cast, but a wrong seal is only
// 'miss' there too: no 走火, the seal wanted stays the same.
// Events: { type: 'seal' | 'cast' | 'fizzle' | 'miss' | 'done', seal, at }.

export function start(level) {
  return { mode: level.mode === 'one' ? 'one' : 'sequence', seq: [...level.sequence], at: 0, cur: null, held: 0, gap: 0, latched: false, last: null, casts: 0, fizzles: 0, misses: 0, done: false, forgive: Boolean(level.forgive) };
}

/** The seal the player should make next. */
export const expected = (s) => (s.done ? null : s.seq[s.at] ?? null);

/** How far the seal in hand is held, 0…1 (1 once it counted). */
export const progress = (s, knobs) => (s.cur == null ? 0 : s.latched ? 1 : Math.min(1, s.held / needs(s, knobs)));

/** How long the seal in hand must be held to count: the one wanted (or just made) `holdMs`, any other `wrongMs`. */
const needs = (s, knobs) => (s.cur === expected(s) || s.cur === s.last ? knobs.holdMs : knobs.wrongMs ?? knobs.holdMs);

function hold(s, seal, dt, knobs) {
  if (seal == null) {
    const gap = s.gap + dt;
    return gap > knobs.graceMs ? { ...s, cur: null, held: 0, gap: 0, latched: false } : { ...s, gap };
  }
  if (seal !== s.cur) return { ...s, cur: seal, held: 0, gap: 0, latched: false };
  return { ...s, held: s.held + dt, gap: 0 };
}

function counted(s) {
  const seal = s.cur, ev = (type) => ({ type, seal, at: s.at });
  if (seal === expected(s)) {
    const at = s.at + 1;
    if (at < s.seq.length) return { state: { ...s, at, last: seal }, events: [ev('seal')] };
    if (s.mode === 'one') return { state: { ...s, at, last: seal, done: true }, events: [ev('seal'), ev('done')] };
    return { state: { ...s, at: 0, last: seal, casts: s.casts + 1 }, events: [ev('seal'), ev('cast')] };
  }
  if (seal === s.last) return { state: s, events: [] }; // the one just counted, made again
  if (s.mode === 'one' || s.forgive) return { state: { ...s, misses: s.misses + 1 }, events: [ev('miss')] };
  return { state: { ...s, at: 0, last: null, fizzles: s.fizzles + 1 }, events: [ev('fizzle')] };
}

export function step(state, seal, dt, knobs) {
  if (state.done) return { state, events: [] };
  const s = hold(state, seal, dt, knobs);
  if (s.cur == null || s.latched || s.held < needs(s, knobs)) return { state: s, events: [] };
  return counted({ ...s, latched: true });
}

/** Stars from mistakes (走火, or a teaching level's misses): the level's `stars` [most for ★★★, most for ★★]. */
export const starsOf = (fizzles, [three = 0, two = 2] = []) => (fizzles <= three ? 3 : fizzles <= two ? 2 : 1);
