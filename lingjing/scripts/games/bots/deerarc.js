// The human-like player for 射鹿 · 拉弓 (games/deerarc.js; tools/board-bots.mjs). An aim search,
// not answers: for the moment the arrow will leave the string, it flies every pull on a grid
// (`flight`, the game's own steps) against the deer as it will be, and takes the clean one with the
// most clean neighbours — the steadiest, since a hand is never exact. Then it draws to it and lets
// go. A level won under three stars is played once more.
import { flight, STEP_MS } from '../deerarc.js';

export const LEAD = 520; // draw → the hand lands → a glance → let go → the hand lands (board-bots)
const ANGLES = [], POWERS = [];
for (let a = 2; a <= 70; a += 2) ANGLES.push(a);
for (let p = 0.12; p <= 1.0001; p += 0.01) POWERS.push(Math.round(p * 100) / 100);

/** Every pull on the grid, released at `at` ms: a map of 'a|p' → 'clean' · 'graze' · null. */
function chart(level, at) {
  const grid = new Map();
  for (const a of ANGLES) for (const p of POWERS) grid.set(`${a}|${p}`, flight(level, { a, p }, at).hit);
  return grid;
}

const steadiness = (grid, a, p) => {
  let k = 0;
  for (const da of [-2, 0, 2]) for (const dp of [-0.02, -0.01, 0, 0.01, 0.02]) if (grid.get(`${a + da}|${Math.round((p + dp) * 100) / 100}`) === 'clean') k++;
  return k;
};

/** The steadiest clean pull for a release at `at` ms, or null when none flies clean then. */
export function solve(level, at = 0) {
  const grid = chart(level, at);
  let best = null;
  for (const [key, hit] of grid) {
    if (hit !== 'clean') continue;
    const [a, p] = key.split('|').map(Number), k = steadiness(grid, a, p);
    if (!best || k > best.k) best = { a, p, k };
  }
  return best && { a: best.a, p: best.p, k: best.k };
}

let plan = null, lastT = -1, again = 0;

/** A release time ahead, on the world's step, at which some pull flies clean (a walking deer may
    be behind a turn): the first of a few tries a step of 100 ms apart. */
function planFor(level, clock) {
  for (let d = 0; d < 3000; d += 100) {
    const at = Math.round((clock + LEAD + d) / STEP_MS) * STEP_MS, aim = solve(level, at);
    if (aim) return { ...aim, at };
  }
  return null;
}

export function bot(s, see = {}) {
  const t = see.t ?? 0;
  if (t < lastT) { plan = null; again = 0; } // a fresh game
  lastT = t;
  if (s.won || !s.live) return null;
  if (s.phase === 'clear') {
    plan = null;
    if (again < 1 && s.best[s.li] < 3) { again++; return { g: 'retry' }; }
    return { g: 'next' };
  }
  if (s.phase !== 'aim') { plan = null; return null; }
  const level = s.levels[s.li];
  if (!plan || plan.li !== s.li || plan.used !== s.used) plan = { ...planFor(level, s.clock), li: s.li, used: s.used };
  if (plan.a == null) return null;
  if (!s.pull || s.pull.a !== plan.a || s.pull.p !== plan.p) return { g: 'draw', a: plan.a, p: plan.p };
  // Drawn: let go when the moment comes (the hand takes ~200 ms to land).
  return s.clock + (see.lead ?? 200) >= plan.at ? { g: 'loose' } : null;
}
