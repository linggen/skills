// rope-gen.js — a 割绳子 level made from a seed, and proved before it is shown (the 饭桶's daily
// puzzle, 2026-10-16). Construct, then verify — never a search the player waits on:
//   1. compose a layout from the seed: the thing hung on 1–3 vines, and what the day has unlocked
//      (a ledge and a gust, a 灵气泡, 荆棘, a 会再长的藤);
//   2. try a handful of plans — the orders of the cuts, with the puff and the pop where they fit —
//      each move made only once the thing hangs still (thought, never reflexes), and keep each
//      plan's path (the target is not in the physics, so a path decides win or miss for any target);
//   3. set the 饭桶's mouth where the chosen plan's path comes down through it, keep a level only if
//      that plan still wins with every move made late (the human hand), and — past the first
//      tier — some other order misses; 荆棘 go on a wrong path, clear of the right one;
//   4. three stars along a second winning path when there is one (a better way to find), else
//      along the plan's own path.
// Bounded tries, then a hand-made level that always works. Pure: the same seed, the same level.
import { blowGust, buildWorld, calm, cutVine, dist, outOf, popBubble, stepWorld, BREAD_R, FLOOR, W } from './rope.js';

export const MOUTH_Y = FLOOR - 64;
export const MOUTH_R = 30;
export const STAR_R = 13;
const CALM_MS = 400, LATE_MS = 320, SLOW_MS = 1500, END_MS = 900, LIMIT_MS = 14000, STEP = 1000 / 60;
export const TRIES = 24;
export const SEEK = 1;

/* ── The seed ── */
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function rng(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (u, a, b) => a + (b - a) * u();
const chance = (u, p) => u() < p;
const round = (v) => Math.round(v);

/* ── Playing a plan, the way a person does: each move once the thing has hung still ── */

/** Play `plan` ([{g:'cut',v} | {g:'gust'} | {g:'pop',i}]) on a fresh world; every step's place kept. */
export function playPlan(level, plan, { late = 0, limit = LIMIT_MS } = {}) {
  const w = buildWorld(level), path = [];
  let still = 0, i = 0, t = 0, after = 0, broke = false, wait = late;
  while (t < limit) {
    if (i < plan.length && still >= CALM_MS + wait) {
      const m = plan[i++];
      // A pop only of the bubble that holds the thing: a bubble never reached is no move at all.
      const ok = m.g === 'cut' ? cutVine(w, m.v, Math.floor(w.vines[m.v].joints.length / 2))
        : m.g === 'gust' ? blowGust(w, level) : w.bubbles[m.i ?? 0]?.state === 'held' && popBubble(w, m.i ?? 0);
      if (!ok) return { path, end: 'bad-move', moveAt: path.length };
      still = 0;
      if (i === 1) path.first = path.length;
      path.last = path.length;
    }
    const ev = stepWorld(w, level);
    t += STEP;
    const p = w.bread.position;
    path.push([p.x, p.y]);
    if (ev.broke && i > 0) broke = true;
    still = calm(w) ? still + STEP : 0;
    if (outOf(w)) return { path, end: 'out', broke };
    if (i >= plan.length) {
      after += STEP;
      if (still >= END_MS) return { path, end: 'rest', broke };
    }
  }
  return { path, end: 'timeout', broke };
}

/** Where a path first comes down through the mouth's height after its LAST move — every move of
    the plan matters (a puff or a pop after the thing is already in would be decoration). */
function crossing(path) {
  for (let k = Math.max(1, path.last ?? path.first ?? 1); k < path.length; k++) {
    const [x0, y0] = path[k - 1], [x1, y1] = path[k];
    if (y0 < MOUTH_Y && y1 >= MOUTH_Y && y1 > y0) return x0 + ((x1 - x0) * (MOUTH_Y - y0)) / (y1 - y0);
  }
  return null;
}
/** The step a path first enters the mouth, or -1. */
const fedAt = (path, mouth) => path.findIndex(([x, y], k) => k >= (path.first ?? 0) && Math.hypot(x - mouth[0], y - mouth[1]) < MOUTH_R + BREAD_R * 0.4);

/* ── Thorns: a slab, as rope.js lays it; does a path touch it before step `until`? ── */
function touches(path, th, from = 0, until = path.length) {
  const a = (-(th.a ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (let k = from; k < until; k++) {
    const dx = path[k][0] - th.x, dy = path[k][1] - th.y;
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    const qx = Math.max(-th.w / 2, Math.min(th.w / 2, lx)), qy = Math.max(-th.h / 2, Math.min(th.h / 2, ly));
    if (Math.hypot(lx - qx, ly - qy) < BREAD_R) return true;
  }
  return false;
}
const near = (path, [x, y], r, from = 0, until = path.length) => {
  for (let k = from; k < until; k++) if (Math.hypot(path[k][0] - x, path[k][1] - y) < r) return true;
  return false;
};

/* ── Composing a layout ── */

function anchors(u, n, x0) {
  const xs = [];
  for (let k = 0; xs.length < n && k < 40; k++) {
    const x = round(between(u, 34, W - 34));
    if (xs.every((o) => Math.abs(o - x) > 70) && Math.abs(x - x0) < 190) xs.push(x);
  }
  return xs.map((x) => ({ at: [x, 34] }));
}

/** A layout for the day: `els` unlocked, `must` (the new one) always in it, `tier` 0 … 4. */
export function compose(u, { tier = 0, els = [], must = null } = {}) {
  const has = (e) => e === must || (els.includes(e) && chance(u, must ? 0.35 : 0.55));
  const bubble = has('bubble'), gust = !bubble && has('gust'), regrow = has('regrow'), thorns = has('thorns');
  const x0 = round(between(u, 90, W - 90)), y0 = round(between(u, 118, 176));
  const n = must ? (regrow || thorns ? 2 : 1) : Math.min(3, 1 + (tier >= 1 ? 1 : 0) + (tier >= 2 && chance(u, 0.6) ? 1 : 0) + (regrow && tier < 1 ? 1 : 0));
  const level = { bread: [x0, y0], vines: anchors(u, Math.max(n, regrow ? 2 : 1), x0) };
  if (regrow) level.vines[Math.floor(u() * level.vines.length)].regrow = round(between(u, 1800, 2600));
  if (gust) {
    const lw = round(between(u, 90, 130)), ly = round(between(u, y0 + 70, y0 + 120)), lx = Math.max(lw / 2 + 10, Math.min(W - lw / 2 - 10, x0 + round(between(u, -20, 20))));
    level.stones = [{ x: lx, y: ly, w: lw, h: 14, a: 0 }];
    const right = chance(u, 0.5);
    level.gust = { at: [right ? 24 : W - 24, ly - 30], to: [right ? 1 : -1, 0] };
  } else if (tier >= 2 && !bubble && chance(u, 0.45)) {
    const sw = round(between(u, 120, 190)), a = round(between(u, 12, 22)) * (chance(u, 0.5) ? 1 : -1);
    level.stones = [{ x: round(between(u, 110, W - 110)), y: round(between(u, 250, 300)), w: sw, h: 14, a }];
  }
  if (bubble) {
    level.bubbles = [{ at: [x0 + round(between(u, -4, 4)), round(between(u, y0 + 70, y0 + 120))] }];
    if (els.includes('gust') && !must && chance(u, 0.5)) {
      const right = chance(u, 0.5);
      level.gust = { at: [right ? 24 : W - 24, 60], to: [right ? 1 : -1, 0], band: 60 };
    }
  }
  return { level, thorns };
}

/* The plans worth trying for a layout: the orders of the cuts, the puff and the pop where they fit. */
function plansOf(level) {
  const n = level.vines.length, orders = [];
  const perm = (left, done) => (left.length ? left.forEach((v, k) => perm([...left.slice(0, k), ...left.slice(k + 1)], [...done, v])) : orders.push(done));
  perm([...Array(n).keys()], []);
  const cuts = (o) => o.map((v) => ({ g: 'cut', v }));
  const out = [];
  for (const o of orders) {
    if (level.bubbles) {
      out.push([...cuts(o), { g: 'pop', i: 0 }]);
      if (level.gust) out.push([...cuts(o), { g: 'gust' }, { g: 'pop', i: 0 }]);
    } else if (level.gust) {
      out.push([...cuts(o), { g: 'gust' }], [{ g: 'gust' }, ...cuts(o), { g: 'gust' }]);
    } else out.push(cuts(o));
  }
  return out.slice(0, 10);
}

/* Stars stand apart (each its own catch, never a clump) and never where the thing hung at the start
   (a star there is caught for nothing). `spread` picks, in path order, points at least SPACE apart. */
const SPACE = STAR_R * 2 + 12;
const away = (p, others) => others.every((o) => Math.hypot(p[0] - o[0], p[1] - o[1]) >= SPACE);
function spread(pts, n, taken = []) {
  const got = [];
  for (const f of [0.15, 0.5, 0.85, 0.3, 0.7, 0.05, 0.95, 0.4, 0.6]) {
    const p = pts[Math.floor((pts.length - 1) * f)];
    if (p && away(p, [...taken, ...got])) got.push(p);
    if (got.length === n) break;
  }
  if (got.length < n) for (const p of pts) { if (got.length === n) break; if (away(p, [...taken, ...got])) got.push(p); }
  return got.length === n ? got.map((p) => p.map(round)) : null;
}
const fromHang = (path) => (p) => Math.hypot(p[0] - path[0][0], p[1] - path[0][1]) > 44;

/* Three stars along a path, from just after the first move to just before the mouth. */
function starsOn(path, end) {
  const pts = path.slice((path.first ?? 0) + 4, end - 2).filter(fromHang(path));
  return pts.length < 4 ? null : spread(pts, 3);
}

/* Three stars on `path`: two where `main` also goes, one where it never does — or null. */
function starsApart(path, end, main, mainEnd) {
  const from = path.first ?? 0, gap = STAR_R + BREAD_R + 16;
  const far = [], shared = [];
  for (let k = from + 10; k < end - 6; k += 3) (near(main, path[k], gap, 0, mainEnd) ? shared : far).push(path[k]);
  const f = far.filter(fromHang(path)), sh = shared.filter(fromHang(path));
  const one = spread(f, 1);
  const two = one && spread(sh, 2, one);
  return two ? [two[0], one[0], two[1]] : null;
}

/** One try: a layout, its plans played, the mouth set, the level kept or not (and why). */
export function attempt(u, opts) {
  const { level, thorns } = compose(u, opts);
  const runs = plansOf(level).map((plan) => ({ plan, ...playPlan(level, plan) }));
  const good = runs.filter((r) => !r.broke && crossing(r.path) != null);
  // The plan to teach: the one that uses the most of what the layout holds, the longest first.
  good.sort((a, b) => b.plan.length - a.plan.length);
  const inside = good.filter((r) => { const x = crossing(r.path); return x > 56 && x < W - 56; });
  // Two ways down through the same mouth, when the layout has them: the mouth between them, so the
  // second (with the stars on it) is a better way to find, not luck.
  const pair = inside.flatMap((a) => inside.filter((b) => b !== a && Math.abs(crossing(a.path) - crossing(b.path)) < 40).map((b) => [a, b]))[0];
  const main = pair?.[0] ?? inside[0];
  if (!main) return { why: 'no-plan' };
  const mouth = [round(pair ? (crossing(pair[0].path) + crossing(pair[1].path)) / 2 : crossing(main.path)), MOUTH_Y];
  const fedMain = fedAt(main.path, mouth);
  if (fedMain < 0) return { why: 'no-feed' };
  if (fedMain < (main.path.last ?? 0)) return { why: 'in-before-the-last-move' };
  const others = runs.filter((r) => r !== main);
  const wins = (r) => !r.broke && fedAt(r.path, mouth) >= 0;
  const missing = others.filter((r) => !wins(r));
  if ((opts.tier ?? 0) > 0 && level.vines.length > 1 && !missing.length) return { why: 'trivial' };
  // 荆棘 on a wrong path, well clear of the right one (and of where the thing first hangs).
  if (thorns) {
    const wrong = missing.find((r) => r.path.length > (r.path.first ?? 0) + 30) ?? null;
    if (!wrong) return { why: 'no-thorn-spot' };
    const spots = [0.85, 0.7, 0.55, 0.4].map((f) => wrong.path[Math.floor((wrong.path.first ?? 0) + (wrong.path.length - (wrong.path.first ?? 0) - 1) * f)]);
    const spot = spots.find(([x, y]) => y < FLOOR - 30 && y > 70 && !near(main.path, [x, y], BREAD_R + 44, 0, fedMain + 1) && Math.hypot(x - level.bread[0], y - level.bread[1]) > 60);
    if (!spot) return { why: 'no-thorn-spot' };
    level.thorns = [{ x: round(spot[0]), y: round(spot[1]), w: 64, h: 18, a: round(between(u, -25, 25)) }];
    if (touches(main.path, level.thorns[0], 0, fedMain + 1)) return { why: 'thorn-on-plan' };
  }
  level.mouth = mouth;
  // The human hand: every move a little late, and every move slow (a long think while a vine regrows),
  // and it still feeds.
  for (const late of [LATE_MS, SLOW_MS]) {
    const lateRun = playPlan(level, main.plan, { late });
    const lateFed = fedAt(lateRun.path, mouth);
    if (lateFed < 0 || lateRun.broke || (level.thorns && touches(lateRun.path, level.thorns[0], 0, lateFed + 1))) return { why: 'late-misses' };
  }
  // Stars: two on the way every win takes, the third where only a second winning way goes (a better
  // way to find, never luck); with no second way, all three on the plan's own path.
  const clear = (r) => !(level.thorns && touches(r.path, level.thorns[0], 0, fedAt(r.path, mouth) + 1));
  let stars = null, starRun = main;
  for (const r of others.filter((o) => wins(o) && clear(o))) {
    stars = starsApart(r.path, fedAt(r.path, mouth), main.path, fedMain);
    if (stars) { starRun = r; break; }
  }
  stars ??= starsOn(main.path, fedMain);
  if (!stars) return { why: 'no-stars' };
  level.stars = stars;
  const alt = starRun !== main;
  return { level, plan: main.plan, starPlan: starRun.plan, better: Boolean(alt) };
}

/* The level that always works: one vine straight over the mouth. */
export const FALLBACK = { bread: [180, 150], vines: [{ at: [180, 34] }], mouth: [180, MOUTH_Y], stars: [[180, 210], [180, 260], [180, 305]] };

/** The day's level: tries until one is proved, else the fallback. Answers { level, plan, starPlan, tries, ms }. */
export function generate(seed, opts = {}) {
  const t0 = globalThis.performance?.now() ?? Date.now(), u = rng(seed), why = {};
  // From the third tier on, a level with a better way to find is worth a few more tries.
  const seek = (opts.tier ?? 0) >= 2 ? SEEK : 0;
  let kept = null;
  for (let k = 1; k <= TRIES; k++) {
    const r = attempt(u, opts);
    if (r.level) {
      kept ??= { ...r, tries: k };
      if (r.better || k >= kept.tries + seek) return { ...(r.better ? { ...r, tries: k } : kept), ms: round((globalThis.performance?.now() ?? Date.now()) - t0), why };
      continue;
    }
    why[r.why] = (why[r.why] ?? 0) + 1;
  }
  if (kept) return { ...kept, ms: round((globalThis.performance?.now() ?? Date.now()) - t0), why };
  return { level: structuredClone(FALLBACK), plan: [{ g: 'cut', v: 0 }], starPlan: [{ g: 'cut', v: 0 }], tries: TRIES, fallback: true, ms: round((globalThis.performance?.now() ?? Date.now()) - t0), why };
}
