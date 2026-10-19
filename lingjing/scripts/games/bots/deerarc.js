// The human-like player for 射鹿 · 拉弓 (games/deerarc.js; tools/board-bots.mjs) and the boards built
// on it (the 投掷 kit). An aim search, not answers: for the moment the throw will leave the hand, it
// flies pulls on a coarse grid (`flight`, the game's own steps — the deer as it will be, the wind
// as it will blow, the thing it throws, and for a thing with a tap, when it taps), then looks
// closely around each clean one and takes the one with the most clean neighbours — the steadiest,
// since a hand is never exact (nor a tap's moment). Then it picks, draws, lets go, and taps.
// A level under three stars is played once more. Small grids on purpose: the host is shared.
import { FLEE_MS, flight, levelNow, STEP_MS } from '../deerarc.js';
import { projectileOf } from '../throws.js';

export const LEAD = 520; // draw → the hand lands → a glance → let go → the hand lands (board-bots)
const TAP_LEAD = 12; //     steps a tap lands after the eye says now (200 ms)
const round2 = (v) => Math.round(v * 100) / 100;
const range = (from, to, step) => { const out = []; for (let v = from; v <= to + 1e-9; v += step) out.push(round2(v)); return out; };
const COARSE_A = range(4, 68, 4), COARSE_P = range(0.14, 1, 0.03);
const TAPS = [30, 40, 50, 60, 70, 85];

const hits = (level, at, aim, opts) => flight(level, aim, at, 600, opts).hit === 'clean';

/** The cells around (a, p[, tapAt]): how many fly clean — a degree, a hundredth, three steps apart. */
function steadiness(level, at, { a, p, tapAt }, proj) {
  let k = 0;
  const taps = tapAt == null ? [null] : [tapAt - 3, tapAt, tapAt + 3];
  for (const da of [-2, 0, 2]) for (const dp of [-0.02, 0, 0.02]) for (const t of taps) {
    if (hits(level, at, { a: a + da, p: round2(p + dp) }, { proj, tapAt: t })) k++;
  }
  return k;
}

/** The steadiest clean throw for a release at `at` ms — { a, p, tapAt?, k } — or null. */
export function solve(level, at = 0, proj = undefined) {
  const taps = proj?.ability ? TAPS : [null], clean = [];
  for (const tapAt of taps) for (const a of COARSE_A) for (const p of COARSE_P) {
    if (hits(level, at, { a, p }, { proj, tapAt })) clean.push({ a, p, tapAt });
  }
  let best = null;
  for (const c of clean.filter((_, i) => i % Math.max(1, Math.floor(clean.length / 8)) === 0).slice(0, 8)) {
    const k = steadiness(level, at, c, proj);
    if (!best || k > best.k) best = { ...c, k };
  }
  return best;
}

let plan = null, lastT = -1, again = 0;

/** A release time ahead, on the world's step, and a thing from the tray, with which some throw
    flies clean (a walking deer may be behind a turn, a gust may be up): 200 ms tries apart. */
function planFor(s, level, clock) {
  for (let d = 0; d < 3000; d += 200) {
    const at = Math.round((clock + LEAD + d) / STEP_MS) * STEP_MS;
    for (const id of s.ammo ?? ['arrow']) {
      const aim = solve(level, at, projectileOf(s.kit, id));
      if (aim) return { ...aim, at, pick: id };
    }
  }
  return null;
}

function inFlight(s) {
  const ar = s.world?.arrow;
  if (plan?.tapAt == null || !ar || ar.tapped || ar.done) return null;
  return ar.steps + TAP_LEAD >= plan.tapAt ? { g: 'tap' } : null;
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
  if (s.phase === 'fly') return inFlight(s);
  if (s.phase !== 'aim') { plan = null; return null; }
  const lv = s.levels[s.li];
  if (lv?.smash) return smashTurn(s, lv);
  const level = levelNow(s); // this throw's rolled wind
  if (!plan || plan.li !== s.li || plan.used !== s.used) plan = { ...planFor(s, level, s.clock), li: s.li, used: s.used };
  if (plan.a == null) return null;
  if (plan.pick && s.pick !== plan.pick) return { g: 'pick', p: plan.pick };
  if (!s.pull || s.pull.a !== plan.a || s.pull.p !== plan.p) return { g: 'draw', a: plan.a, p: plan.p };
  // Drawn: let go when the moment comes (the hand takes ~200 ms to land).
  return s.clock + (see.lead ?? 200) >= plan.at ? { g: 'loose' } : null;
}

/* A smash level (things that topple and break) is played from its answers (games.json `bot`: the
   throws [a, p, pick] in order, as a person who has found the trick would play it — the bread.js
   way): its world stands still between throws (bodies asleep, no wind), so only the aim decides; a
   fourth number is the step of the flight it taps on (a multiple of 3: the same world step at any clock);
   the bot waits for a flushed stag to stop running before the next. Beyond the answers it lets go. */
function smashTurn(s, lv) {
  if (s.flushAt != null && s.clock - s.flushAt < FLEE_MS + 200) return null;
  const [a, p, pick, tapAt] = lv.bot?.[s.used] ?? lv.bot?.at(-1) ?? [20, 0.8, 'arrow'];
  // An answer with a tap (the 短飞剑's dash, the 五雷符's burst) taps on its step: `inFlight` reads the plan.
  plan = tapAt == null ? null : { tapAt, li: s.li, used: s.used }; // the eye says now TAP_LEAD early
  if (pick && s.pick !== pick && s.ammo?.includes(pick)) return { g: 'pick', p: pick };
  if (!s.pull || s.pull.a !== a || s.pull.p !== p) return { g: 'draw', a, p };
  return { g: 'loose' };
}
