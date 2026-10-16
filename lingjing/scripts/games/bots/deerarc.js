// The human-like player for 射鹿 · 拉弓 (games/deerarc.js; tools/board-bots.mjs). An aim search,
// not answers: for the moment the arrow will leave the string, it flies pulls on a coarse grid
// (`flight`, the game's own steps — the deer as it will be, the wind as it will blow), then looks
// closely around each clean one and takes the pull with the most clean neighbours — the steadiest,
// since a hand is never exact. Then it draws to it and lets go. A level under three stars is
// played once more. Small grids on purpose (a few hundred flights a solve): the host is shared.
import { flight, STEP_MS } from '../deerarc.js';

export const LEAD = 520; // draw → the hand lands → a glance → let go → the hand lands (board-bots)
const round2 = (v) => Math.round(v * 100) / 100;
const range = (from, to, step) => { const out = []; for (let v = from; v <= to + 1e-9; v += step) out.push(round2(v)); return out; };
const COARSE_A = range(4, 68, 4), COARSE_P = range(0.14, 1, 0.03);

/** The cells around (a, p), a degree and a hundredth apart: how many of them fly clean. */
function steadiness(level, at, a, p) {
  let k = 0;
  for (const da of [-2, -1, 0, 1, 2]) for (const dp of [-0.02, -0.01, 0, 0.01, 0.02]) {
    if (flight(level, { a: a + da, p: round2(p + dp) }, at).hit === 'clean') k++;
  }
  return k;
}

/** The steadiest clean pull for a release at `at` ms, or null when none flies clean then. */
export function solve(level, at = 0) {
  const clean = [];
  for (const a of COARSE_A) for (const p of COARSE_P) if (flight(level, { a, p }, at).hit === 'clean') clean.push({ a, p });
  let best = null;
  for (const c of clean.slice(0, 8)) {
    const k = steadiness(level, at, c.a, c.p);
    if (!best || k > best.k) best = { ...c, k };
  }
  return best;
}

let plan = null, lastT = -1, again = 0;

/** A release time ahead, on the world's step, at which some pull flies clean (a walking deer may
    be behind a turn, a gust may be up): the first of a few tries 200 ms apart. */
function planFor(level, clock) {
  for (let d = 0; d < 3000; d += 200) {
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
