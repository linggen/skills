// The hands for 拽 (fallrope, a 割绳子 story beat with a timed last cut; 2026-10-19). A swing level is
// not won by order alone, so beside the plan bot (tools/board-bots.mjs) this file holds a person's
// hand as a pure decision on what the board shows — the thing, the goal, the ropes' anchors, the strap,
// the puff — used by the node sims (tests/fallrope.test.mjs, `simulate`) and by tools/play-human.mjs
// on the live page (the same `decide`, fed from the DOM). It acts on what it saw `delay` ms ago.
//   casual  thinks a moment before each move, tries the ringed strap first more often than not, learns
//           from a lay that failed (a first move that failed is tried less), cuts the last rope as the
//           swing slows toward the ledge — early or late by its lag and its judgement; now and then
//           puffs the storm's wind into a swing; looks away now and then.
//   sloppy  the same with more lag, worse judgement, less learning.
//   idle    nothing.
import { newGame, act, tick } from '../fallrope.js';

export const HANDS = {
  practised: { delay: 200, jitter: 30, judge: 0.08, think: [500, 900], learn: 1, wind: 0.5, lapse: 0, ring: 3 },
  casual: { delay: 260, jitter: 70, judge: 0.16, think: [700, 1800], learn: 1, wind: 0.3, lapse: 0.08, ring: 2 },
  sloppy: { delay: 340, jitter: 110, judge: 0.26, think: [900, 2400], learn: 0.4, wind: 0.2, lapse: 0.18, ring: 1.2 },
  idle: { idle: true },
};

/* The plain way and the star way, for the plan-shaped checks (the last cut is timed, see `decide`). */
export const plans = { one: [{ g: 'cut', v: 'pack' }, { g: 'cut', v: 0 }, { g: 'cut', v: 1, swing: true }] };
export const starPlans = { one: [{ g: 'cut', v: 'pack' }, { g: 'cut', v: 0 }, { g: 'gust', swing: true }, { g: 'cut', v: 1, swing: true }] };

const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const pick = (r, weights) => {
  const all = Object.entries(weights).filter(([, w]) => w > 0), sum = all.reduce((a, [, w]) => a + w, 0);
  let x = r() * sum;
  for (const [k, w] of all) if ((x -= w) <= 0) return k;
  return all.at(-1)?.[0] ?? null;
};

/** What the board shows, in board units: { t, play, thing: {x, y}, goal: {x, y}, vines: [{ v, at: [x, y] }]
    (the ropes still whole), strap, gust (a puff to tap), retry }. Answers the move: { g: 'cut', v } ·
    { g: 'gust' } · { g: 'retry' } · null. `mem` is the hand's memory across looks and lays. */
export function decide(view, mem, r, H) {
  if (H.idle) return null;
  const t = view.t;
  mem.hist ??= [];
  if (!view.play) { mem.hist = []; mem.layDone = true; return null; }
  // A fresh lay (after a miss or a retry): what the last one showed is learnt — the swing snagged with
  // the pack on (the strap first), or the first rope cut swung him away from the ledge (the other first).
  const whole = view.vines.length + (view.strap ? 1 : 0);
  if (mem.whole != null && whole > mem.whole) {
    for (const k of mem.saw ?? []) if (r() < H.learn) mem.knows = { ...mem.knows, [k]: true };
    Object.assign(mem, { saw: [], hist: [], peak: 0, puffed: false, still: null, nextAt: t + think(r, H) });
  }
  mem.knows ??= {};
  mem.saw ??= [];
  mem.whole = whole;
  mem.hist.push({ t, x: view.thing.x, y: view.thing.y });
  while (mem.hist.length > 2 && mem.hist[1].t <= t - H.delay - 300) mem.hist.shift();
  if (t < (mem.awayUntil ?? 0)) return null;
  if (r() < H.lapse * 0.03) { mem.awayUntil = t + 600 + r() * 1400; return null; }
  // What it saw a moment ago, and how it was moving then (px per ms).
  const lag = Math.max(60, H.delay + gauss(r) * H.jitter);
  const o = [...mem.hist].reverse().find((h) => h.t <= t - lag) ?? mem.hist[0];
  const p = [...mem.hist].reverse().find((h) => h.t <= o.t - 80) ?? mem.hist[0];
  const vx = p !== o ? (o.x - p.x) / (o.t - p.t) : 0, vy = p !== o ? (o.y - p.y) / (o.t - p.t) : 0;
  const speed = Math.hypot(vx, vy);
  mem.still = speed < 0.02 ? (mem.still ?? o.t) : null;
  const stillFor = mem.still != null ? o.t - mem.still : 0;
  const deliberate = t >= (mem.nextAt ?? 0);
  const move = (m) => { mem.nextAt = t + think(r, H); mem.peak = 0; mem.puffed = false; return m; };
  const far = [...view.vines].sort((a, b) => Math.abs(b.at[0] - view.goal.x) - Math.abs(a.at[0] - view.goal.x));

  // Everything whole: the first move — the ringed strap weighed up, then what was learnt.
  if (view.vines.length === 2 && view.strap) {
    if (!deliberate) return null;
    const k = mem.knows.strap ? 'pack' : pick(r, { pack: H.ring, far: mem.knows.far ? 2 : 1, near: mem.knows.far ? 0.2 : 1 });
    return move({ g: 'cut', v: k === 'pack' ? 'pack' : k === 'far' ? far[0].v : far[1].v });
  }
  if (view.vines.length === 2) {
    // The strap gone, two ropes: the one holding him out (its anchor farther from the ledge) — a guess
    // until a lay has shown it.
    if (!deliberate) return null;
    return move({ g: 'cut', v: (mem.knows.far || r() < 0.6 ? far[0] : far[1]).v });
  }
  if (view.vines.length === 1) {
    const ax = view.vines[0].at[0], side = Math.sign(view.goal.x - ax) || 1, d = (o.x - ax) * side, toward = vx * side;
    // The one rope left holds him on the far side of the drop: the other should have gone first.
    if (Math.abs(ax - view.goal.x) > Math.abs(view.thing.x - view.goal.x) + 60 && !mem.saw.includes('far')) mem.saw.push('far');
    // Hanging still: it snagged (the strap still on) or the swing died.
    if (stillFor > 900 && view.strap && !mem.saw.includes('strap')) mem.saw.push('strap');
    if (stillFor > 900 && deliberate) {
      if (view.strap && r() < 0.7) return move({ g: 'cut', v: 'pack' });
      if (view.gust && r() < 0.5) return move({ g: 'gust' });
      return view.retry ? move({ g: 'retry' }) : null;
    }
    if (toward > 0) mem.peak = Math.max(mem.peak ?? 0, toward);
    else if (toward < -0.02) { mem.peak = 0; mem.puffed = false; }
    // The storm's wind into the swing as he starts in toward the cliff.
    if (view.gust && !mem.puffed && toward > 0.05 && d < 0 && t >= (mem.nextAt ?? 0) - 400) {
      mem.puffed = true;
      if (r() < H.wind) return { g: 'gust' };
    }
    // The last cut: on the ledge's side, the swing slowing — its judgement of when is noisy.
    const when = 0.42 + gauss(r) * H.judge;
    if (d > 20 && toward > 0 && mem.peak > 0.05 && toward < mem.peak * when) return move({ g: 'cut', v: view.vines[0].v });
    return null;
  }
  return null;
}
const think = (r, H) => H.think[0] + r() * (H.think[1] - H.think[0]);

/** The board as the hand sees it, from a game state (the node side). */
export function viewOf(s, t) {
  const w = s.swing;
  return {
    t, play: s.phase === 'play' && !s.won,
    thing: { x: w.bread.position.x, y: w.bread.position.y },
    goal: { x: s.level.mouth[0], y: s.level.mouth[1] },
    vines: w.vines.map((v, i) => ({ v: i, at: v.at, cut: v.cut })).filter((v) => v.cut == null),
    strap: Boolean(w.pack && !w.pack.cut), gust: Boolean(s.level.gust) && w.gust <= 0, retry: true,
  };
}

/** One run of the level by a hand, on a `step` ms clock, up to `limit` ms: { won, ms, stars, grade, misses, moves }. */
export function simulate(level, hand = HANDS.casual, { seed = 'sim', step = 16, limit = 120000, look = 33, r } = {}) {
  r ??= seeded(`${seed}|${level.id}`);
  let s = newGame(seed, 1, { levels: [level], level }), t = 0, nextLook = 0, moves = 0;
  const mem = {};
  while (t < limit && !s.won) {
    if (t >= nextLook) {
      nextLook = t + look;
      const m = decide(viewOf(s, t), mem, r, hand);
      if (m) {
        const d = m.g === 'cut' ? { g: 'cut', v: String(m.v), k: m.v === 'pack' ? '0' : String(Math.floor(s.swing.vines[m.v].joints.length / 2)) } : { g: m.g };
        const got = act(s, d);
        if (got.state !== s) moves++;
        s = got.state;
      }
    }
    s = tick(s, step);
    t += step;
  }
  return { won: Boolean(s.won), ms: t, stars: s.stars ?? 0, grade: s.grade ?? null, misses: s.misses, moves };
}

function seeded(seed) {
  let a = 0;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/* The board-bots player (tools/board-bots.mjs): the practised hand, deciding on what it sees each look
   (its own lag inside `decide`; board-bots adds the reaction on top, so this one aims a little early). */
let botMem = {}, botR = seeded('bot'), botT = -1;
export function bot(s, see = {}) {
  const t = see.t ?? 0;
  if (t < botT) { botMem = {}; botR = seeded('bot'); }
  botT = t;
  if (s.won || !s.live) return null;
  const m = decide(viewOf(s, t), botMem, botR, { ...HANDS.practised, delay: 0, jitter: 10, judge: 0.04, think: [400, 600] });
  if (!m) return null;
  if (m.g === 'cut') return { g: 'cut', v: String(m.v), k: m.v === 'pack' ? '0' : String(Math.floor(s.swing.vines[m.v].joints.length / 2)) };
  return { g: m.g };
}
