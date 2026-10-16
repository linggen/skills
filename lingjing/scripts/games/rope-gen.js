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
const CALM_MS = 400, LATE_MS = 320, SLOW_MS = 1500, END_MS = 900, LIMIT_MS = 11000, STEP = 1000 / 60;
export const TRIES = 24;
const MAX_PLANS = 8;
/* The work a day's level may take, in physics steps (not time: the same seed makes the same level on
   any machine). Past it, the best level proved so far, else the fallback. */
export const STEP_BUDGET = 36000;
let spent = 0;
export const SEEK = 6;

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
    spent++;
    t += STEP;
    const p = w.bread.position;
    path.push([p.x, p.y]);
    if (ev.broke && i > 0) broke = true;
    still = calm(w) ? still + STEP : 0;
    if (outOf(w)) return { path, end: 'out', broke, done: i >= plan.length };
    if (i >= plan.length) {
      after += STEP;
      if (still >= END_MS) return { path, end: 'rest', broke, done: true };
    }
  }
  return { path, end: 'timeout', broke, done: i >= plan.length };
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
  // One vine hangs near where the thing is; more spread over the roof.
  for (let k = 0; xs.length < n && k < 40; k++) {
    const x = n === 1 ? x0 + round(between(u, -30, 30)) : round(between(u, 34, W - 34));
    if (xs.every((o) => Math.abs(o - x) > 70) && Math.abs(x - x0) < 190) xs.push(x);
  }
  return xs.map((x) => ({ at: [x, 34] }));
}

/** A layout for the day: `els` unlocked, `must` (the new one) always in it, `tier` 0 … 4. */
export function compose(u, { tier = 0, els = [], must = null } = {}) {
  const has = (e) => e === must || (els.includes(e) && chance(u, must ? 0.35 : 0.55));
  // Once the puff is known it is in most layouts: a puff while the thing hangs is the usual extra
  // move a 灵光 off the plain path asks for (earn the stars, 2026-10-16).
  const bubble = has('bubble'), gust = !bubble && (must === 'gust' || (els.includes('gust') && must !== 'thorns' && must !== 'regrow' ? chance(u, 0.8) : has('gust'))), regrow = has('regrow'), thorns = has('thorns');
  const x0 = round(between(u, 90, W - 90)), y0 = round(between(u, 118, 176));
  // A bubble wants two vines: it hangs off to the side, and one cut swings the thing into it.
  const n = must ? (regrow || thorns || bubble ? 2 : 1) : Math.max(bubble ? 2 : 1, Math.min(3, 1 + (tier >= 1 ? 1 : 0) + (tier >= 2 && chance(u, 0.6) ? 1 : 0) + (regrow && tier < 1 ? 1 : 0)));
  const level = { bread: [x0, y0], vines: anchors(u, Math.max(n, regrow ? 2 : 1), x0) };
  if (regrow) level.vines[Math.floor(u() * level.vines.length)].regrow = round(between(u, 1800, 2600));
  if (gust && must !== 'gust' && chance(u, 0.5)) {
    // A puff across where the thing hangs: it swings it, no ledge (an extra move, for a star).
    const right = chance(u, 0.5);
    level.gust = { at: [right ? 24 : W - 24, y0 + 6], to: [right ? 1 : -1, 0], band: 50 };
  } else if (gust) {
    // The ledge under the vine cut last in one of the orders: there the thing comes to rest for the puff.
    const under = level.vines[Math.floor(u() * level.vines.length)].at[0];
    const lw = round(between(u, 90, 130)), ly = round(between(u, y0 + 70, y0 + 120)), lx = Math.max(lw / 2 + 10, Math.min(W - lw / 2 - 10, under + round(between(u, -15, 15))));
    level.stones = [{ x: lx, y: ly, w: lw, h: 14, a: 0 }];
    const right = chance(u, 0.5);
    level.gust = { at: [right ? 24 : W - 24, ly - 30], to: [right ? 1 : -1, 0] };
  } else if (tier >= 2 && !bubble && chance(u, 0.45)) {
    const sw = round(between(u, 120, 190)), a = round(between(u, 12, 22)) * (chance(u, 0.5) ? 1 : -1);
    level.stones = [{ x: round(between(u, 110, W - 110)), y: round(between(u, 250, 300)), w: sw, h: 14, a }];
  }
  if (bubble) {
    // Off the thing's own line: on the arc it swings through once the other vines are cut and it
    // hangs from `keep` — so the player must swing it in, never just drop it.
    const keep = level.vines[Math.floor(u() * level.vines.length)].at;
    const r = Math.hypot(x0 - keep[0], y0 - keep[1]), a0 = Math.atan2(x0 - keep[0], y0 - keep[1]);
    const a = -a0 * between(u, 0.35, 0.7);
    const bx = keep[0] + r * Math.sin(a), by = keep[1] + r * Math.cos(a);
    if (Math.abs(a0) < 0.35 || bx < 40 || bx > W - 40 || Math.hypot(bx - x0, by - y0) < 60) return { level, thorns, unfit: true };
    level.bubbles = [{ at: [round(bx), round(by)] }];
    if (els.includes('gust') && (!must || must === 'bubble') && chance(u, 0.6)) {
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
    } else if (level.gust && level.stones?.length) {
      out.push([...cuts(o), { g: 'gust' }], [{ g: 'gust' }, ...cuts(o), { g: 'gust' }]);
    } else if (level.gust) {
      // The puff where it swings widest: once it hangs from a single vine (after the first cut).
      const c = cuts(o);
      out.push(c, c.length > 1 ? [...c.slice(0, c.length - 1), { g: 'gust' }, c.at(-1)] : [{ g: 'gust' }, ...c]);
    } else out.push(cuts(o));
  }
  return out.slice(0, MAX_PLANS);
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
/* A path's steps, filled in every few px: a fast fall leaves its steps far apart. */
function dense(pts, gap = 4) {
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[k + 1];
    out.push(p);
    if (!q) break;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (let j = 1; j < d / gap; j++) out.push([p[0] + ((q[0] - p[0]) * j * gap) / d, p[1] + ((q[1] - p[1]) * j * gap) / d]);
  }
  return out;
}

/* Three stars along a path, from just after the first move to just before the mouth. */
function starsOn(path, end) {
  const pts = dense(path.slice((path.first ?? 0) + 4, end - 1)).filter(fromHang(path));
  return pts.length < 4 ? null : spread(pts, 3);
}

/* Three stars on `path`: two where `main` also goes, one where it never does — or null. */
function starsApart(path, end, main, mainEnd) {
  const from = path.first ?? 0, gap = STAR_R + BREAD_R + 16;
  const far = [], shared = [];
  for (const p of dense(path.slice(from + 10, end - 1), 6)) (near(main, p, gap, 0, mainEnd) ? shared : far).push(p);
  const f = far.filter(fromHang(path)), sh = shared.filter(fromHang(path));
  const one = spread(f, 1);
  const two = one && spread(sh, 2, one);
  return two ? [two[0], one[0], two[1]] : null;
}

/** One try: a layout, its plans played, the mouth set, the level kept or not (and why). */
export function attempt(u, opts) {
  const { level, thorns, unfit } = compose(u, opts);
  if (unfit) return { why: 'unfit-layout' };
  const runs = plansOf(level).map((plan) => ({ plan, ...playPlan(level, plan) }));
  const good = runs.filter((r) => r.done && !r.broke && crossing(r.path) != null); // the whole plan played: every move made
  // The plan to teach: the one that uses the most of what the layout holds, the longest first.
  // …but the extra puff before the first cut is for the stars, not the plan to teach: plans that
  // open on a cut come first.
  const extra = (r) => !r.plan.at(-1) || (r.plan.some((m) => m.g === 'gust') && r.plan.at(-1).g === 'cut');
  good.sort((a, b) => extra(a) - extra(b) || b.plan.length - a.plan.length);
  const inside = good.filter((r) => { const x = crossing(r.path); return x > 56 && x < W - 56; });
  if (!inside.length) return { why: 'no-plan' };
  // Two ways down through the same mouth, when the layout has them, are tried first: the mouth between
  // them, so the second (with a star on it) is a better way to find, not luck. Then each plan alone.
  const pairs = inside.flatMap((a) => inside.filter((b) => b !== a && Math.abs(crossing(a.path) - crossing(b.path)) < 40).map((b) => [a, b]));
  const tries = [...pairs.slice(0, 1), ...inside.slice(0, 3).map((a) => [a, null])];
  let why = 'no-plan';
  for (const [main, mate] of tries) {
    const r = prove(structuredClone(level), thorns, runs, main, mate, u, opts);
    if (r.level) return r;
    why = r.why;
  }
  return { why };
}

/* One plan proved on a layout: the mouth set, the thorns laid, the late hands, the stars. */
function prove(level, thorns, runs, main, mate, u, opts) {
  const mouth = [round(mate ? (crossing(main.path) + crossing(mate.path)) / 2 : crossing(main.path)), MOUTH_Y];
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
  // With a vine that grows back, a think longer than its regrowth too: the answer may never be a race.
  const regrowMs = Math.max(0, ...level.vines.map((v) => v.regrow ?? 0));
  for (const late of [LATE_MS, SLOW_MS, ...(regrowMs ? [regrowMs + 600] : [])]) {
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
  return { level, plan: main.plan, starPlan: starRun.plan, better: starRun !== main };
}

/* The level that always works: one vine straight over the mouth. */
export const FALLBACK = { bread: [180, 150], vines: [{ at: [180, 34] }], mouth: [180, MOUTH_Y], stars: [[180, 210], [180, 260], [180, 305]] };

/** The day's level: tries until one is proved, else the fallback. Answers { level, plan, starPlan, tries, ms }. */
export function generate(seed, opts = {}) {
  const t0 = globalThis.performance?.now() ?? Date.now(), u = rng(seed), why = {};
  // From the third tier on, a level with a better way to find is worth a few more tries.
  const seek = (opts.tier ?? 0) >= 1 ? SEEK : 0;
  let kept = null;
  spent = 0;
  for (let k = 1; k <= TRIES && spent < STEP_BUDGET; k++) {
    const r = attempt(u, opts);
    if (r.level) {
      kept ??= { ...r, tries: k };
      if (r.better || k >= kept.tries + seek) return { ...(r.better ? { ...r, tries: k } : kept), ms: round((globalThis.performance?.now() ?? Date.now()) - t0), steps: spent, why };
      continue;
    }
    why[r.why] = (why[r.why] ?? 0) + 1;
  }
  if (kept) return { ...kept, ms: round((globalThis.performance?.now() ?? Date.now()) - t0), steps: spent, why };
  // Out of work for this day's mix: an easier day of the same seed — the first tier, only the new
  // element if there is one — before the one level that always works.
  if (!opts.eased) {
    const used = spent, easy = generate(`${seed}|easy`, { tier: 0, els: opts.must ? [opts.must] : [], must: opts.must ?? null, eased: true });
    if (!easy.fallback) return { ...easy, eased: true, ms: round((globalThis.performance?.now() ?? Date.now()) - t0), steps: used + easy.steps, why };
  }
  return { level: structuredClone(FALLBACK), plan: [{ g: 'cut', v: 0 }], starPlan: [{ g: 'cut', v: 0 }], tries: TRIES, fallback: true, ms: round((globalThis.performance?.now() ?? Date.now()) - t0), steps: spent, why };
}
