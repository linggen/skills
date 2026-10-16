// 射鹿 · 拉弓 — a 愤怒小鸟-style prototype (design.md § 新小游戏, Hanli 2026-10-16: 「愤怒小鸟也
// 可以做一个出来看看」). In the 游戏厅 only: the story's 射鹿 beat is still games/deer.js.
// The book, 第二回: the deer drinks at the stream, 「低着头在喝水，头上的角像一丛冬天的枯树枝」;
// the uncle's lesson, 先看风，后看鹿 — and 「往左偏半寸」. Here he stands on the near bank at the
// right and the deer drinks to the left, so the wind off the stream blows in his face: it pushes
// the arrow back to the right, and the answer is literally half an inch left.
// Drag back from anywhere on the scene to draw (the pull's length is the power, its angle the
// arc), let go to loose. The arrow flies on a physics arc (matter.js, physics.js) with the level's
// wind; a streamer and drifting leaves show it. The deer drinks, lifts its head, walks and stops —
// a declared schedule, so the solver can plan. On the heart: a clean ink burst and the deer is
// off into the reeds; a graze (body, neck, antlers) spooks it — it bolts and comes back; anything
// else sticks in the grass. Reeds in the way snap if the arrow is fast, else turn it; a dead branch
// turns it always. Stars per level by arrows used (one 3, two 2, more 1; a graze costs its arrow);
// an empty quiver lays the level again. Levels are data (worlds/jiuding/games.json, `deerarc`).
// The world steps only in `tick` at a fixed 1/60 s, and nothing moves until an arrow touches it,
// so a shot flies the same whatever the clock's step: `flight` (the same code) is what the bot
// searches. Pure module: newGame / html / act / tick, and mount().
// Every part is painted from games.json `art` (art/games/deer, and the creek of the 00-deer scene
// for the backdrop, the bank and the water); a part whose painting is missing is drawn in ink.
import { Matter } from './physics.js';
import { btn, n, scene, splash, still } from './ink.js';
import { mountPure } from './mount.js';

const { Engine, Bodies, Body, Composite } = Matter;

export const meta = {
  id: 'deerarc',
  name: { zh: '射鹿 · 拉弓（试作）', en: 'The stag · Draw the bow (prototype)' },
  how: {
    zh: '往后拉，拉得越长越有劲，松手放箭。先看风，后看鹿；走着的鹿，箭要等它。',
    en: 'Pull back — longer is stronger — and let go. Wind first, then the deer; a walking deer, lead it.',
  },
};

export const W = 480, H = 300;
export const STEP_MS = 1000 / 60;
export const BOW = [424, 178]; // his hand on the near bank: the bow is held up, half-kneeling
export const MAX_PULL = 120, MIN_POWER = 0.12, MIN_V = 3, MAX_V = 7.2;
export const QUIVER = 4, STUCK_MISSES = 3;
const GRAVITY = 0.36, WIND_ACC = 0.02, ARROW_HALF = 13, TRAIL_EVERY = 3;
const BREAK_V = 5, AFTER_BREAK = 0.88, TURN = 0.32, SLOW = 3, SLOW_STEPS = 12, SLOW_HIT_MS = 450;
const HIT_MS = 1400, SPOOK_MS = 1300, GONE_MS = 700, CLEAR_MS = 1800, ALERT_MS = 1400;

const T = {
  zh: {
    level: '第 {i} / {n} 处', arrows: '箭', wind: ['无风', '微风', '有风', '大风'], face: ' · 迎面', back: ' · 顺风',
    clean: '中了。一团墨花绽开——鹿一跃而起，没进了芦苇深处。',
    graze: ['擦着了。鹿一惊，一溜烟跑了——过了好一会儿，才又回到溪边。', '没中要害。鹿受了惊，蹦开去，又慢慢回来了。'],
    short: '箭扎进了草里。', long: '箭飞过了头，落进了溪里。', turned: '箭碰着了，打着转掉下来。',
    alert: '鹿抬起头，竖着耳朵听了一会儿——又低下头去。',
    snap: '芦苇应声折断。',
    hint: '……风。往左偏半寸。',
    gone: '箭筒空了。鹿走远了。再来。',
    pull: '往后拉……', full: '拉满了 · 松手',
    retry: '重来', next: '往下', again: '再来，争三星',
    clear: '这一处：', end: '溪边四处，都射中了。', stars: '共得 {s} 星。',
    empty: '溪边没有鹿。',
  },
  en: {
    level: 'Spot {i} of {n}', arrows: 'Arrows', wind: ['No wind', 'A breath', 'Wind', 'Strong wind'], face: ' · in your face', back: ' · at your back',
    clean: 'A hit. A bloom of ink — the deer leaps and is gone deep into the reeds.',
    graze: ['A graze. The deer startles and bolts — and only after a long while comes back to the stream.', 'Not the heart. The deer shies away, then creeps back.'],
    short: 'The arrow sticks in the grass.', long: 'Over its back — the arrow drops into the stream.', turned: 'It strikes something and tumbles down.',
    alert: 'The deer lifts its head, listens — and drinks again.',
    snap: 'A reed snaps.',
    hint: '…The wind. Half an inch left.',
    gone: 'The quiver is empty. The deer has wandered off. Again.',
    pull: 'Pull back…', full: 'Full — let go',
    retry: 'Again', next: 'On', again: 'Again, for three stars',
    clear: 'This spot: ', end: 'Four spots by the stream, each one hit.', stars: '{s} stars in all.',
    empty: 'No deer by the stream.',
  },
};

/* ── The bank: ground, water ───────────────────────────────────────────────────────────────── */

export const GROUND = 252, BANK = 222;
/** The ground's height at x: the near bank (his, the right) is higher; the far bank slopes to it. */
export const groundAt = (x) => (x >= 380 ? BANK : x <= 330 ? GROUND : GROUND + ((BANK - GROUND) * (x - 330)) / 50);
const WATER = [[0, 262], [300, 262]];

/* ── The wind: a level's `wind` (+ in his face), and its `gust` rising and falling ─────────── */

const TAU = Math.PI * 2;
/** The wind at `ms`: steady, or breathing — `gust` {amp, period, phase?} on top. */
export function windAt(level, ms) {
  const g = level.gust;
  return (level.wind ?? 0) + (g ? g.amp * Math.sin((TAU * ms) / g.period + (g.phase ?? 0)) : 0);
}
/** How far the wind has carried a leaf by `ms` (its integral), so a leaf never jumps as it changes. */
function windCarried(level, ms) {
  const g = level.gust, ph = g?.phase ?? 0;
  return (level.wind ?? 0) * ms - (g ? ((g.amp * g.period) / TAU) * (Math.cos((TAU * ms) / g.period + ph) - Math.cos(ph)) : 0);
}

/* ── The deer: a declared schedule (where, facing, head down or up) ──────────────────────────── */

const RAMP = 320; // a head comes up (or goes down to the water) over this long, eased
const ease = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };
/** Eased 0 → 1 → 0 across a window [0, len): up over RAMP at its start, down over RAMP at its end. */
const swell = (v, len) => (v < 0 || v >= len ? 0 : ease(Math.min(v, len - v) / RAMP));

/** Where the deer is at `ms` since the level was laid: { x, face, walking, lift (0 drinking … 1
    head up), up, phase }. Every pose eases into the next; the zones follow the same `lift`. */
export function deerAt(level, ms) {
  const d = level.deer, at = Math.max(0, ms);
  const pos = d.walk ? walkAt(d, at) : { x: d.x, face: d.face ?? 1, walking: false, lift: 0 };
  const lift = Math.max(pos.lift, liftAt(d, at));
  return { ...pos, lift, up: lift > 0.5, phase: at };
}

/** Back and forth along the bank: it starts and stops easily (eased), head up while it walks. */
function walkAt(d, ms) {
  const { to, ms: go, rest = 0 } = d.walk, span = go + rest, u = ms % (2 * span);
  const out = u < span, v = out ? u : u - span, k = ease(v / go);
  const [a, b] = out ? [d.x, to] : [to, d.x];
  return { x: a + (b - a) * k, face: Math.sign(b - a) || 1, walking: v < go, lift: swell(v, go) };
}

const liftAt = (d, ms) => (d.lift ? swell((ms % d.lift.every) - (d.lift.every - d.lift.for), d.lift.for) : 0);

/* The deer's shape in its own frame (facing +x, feet at 0): the zones an arrow is judged by. */
export const DEER_S = 1.8; // the deer's size on the bank, ~155 of 480 (its zones scale with it)
// Fitted to the painted stag (art/games/deer, 2026-10-16; one canvas unit = 0.18 deer units): the
// heart low behind the foreleg, the barrel, the head down at the water or up, and the antlers —
// a great crown above the head (a graze, like the barrel and the neck).
const HEART = [13, -28], HEART_R = 12, PIERCE = 18, BODY = [0, -34, 25, 12];
const DOWN = [44, -12], UP = [33, -47];
const ANTLER_DOWN = [-4, -36], ANTLER_UP = [-15, -16];
/** The head between drinking (0) and up (1). */
const headOf = (lift) => [DOWN[0] + (UP[0] - DOWN[0]) * lift, DOWN[1] + (UP[1] - DOWN[1]) * lift];
const ANTLER_R = 18;

/** What the arrow's point, from `a` to `b` (world), touched on the deer: 'clean', 'graze' or null. */
export function deerHit(level, ms, a, b) {
  const d = deerAt(level, ms), gy = groundAt(d.x);
  const local = ([x, y]) => [((x - d.x) * d.face) / DEER_S, (y - gy) / DEER_S];
  const [p, q] = [local(a), local(b)];
  const head = headOf(d.lift), lerp = (a, b) => a + (b - a) * d.lift;
  const antler = [head[0] + lerp(ANTLER_DOWN[0], ANTLER_UP[0]), head[1] + lerp(ANTLER_DOWN[1], ANTLER_UP[1])];
  if (segEllipse(p, q, BODY)) return pierces(p, q) ? 'clean' : 'graze';
  const grazed = segCircle(p, q, head, 8) || segCircle(p, q, antler, ANTLER_R) || segSeg(p, q, [20, -38], head, 6);
  return grazed ? 'graze' : null;
}

/** Into the body: the arrow's point carried on PIERCE along its way — does it reach the heart? */
function pierces(p, q) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
  return segCircle(p, [q[0] + (dx / l) * PIERCE, q[1] + (dy / l) * PIERCE], HEART, HEART_R);
}

/* ── Geometry ─────────────────────────────────────────────────────────────────────────────── */

function closest(p, q, c) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / l2)) : 0;
  return [p[0] + dx * t, p[1] + dy * t];
}
const segCircle = (p, q, c, r) => { const k = closest(p, q, c); return Math.hypot(k[0] - c[0], k[1] - c[1]) <= r; };
function segEllipse(p, q, [cx, cy, rx, ry]) {
  for (let i = 0; i <= 4; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 4, y = p[1] + ((q[1] - p[1]) * i) / 4;
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) return true;
  }
  return false;
}
/** Segments p–q and a–b come within `r` of each other (sampled along p–q: an arrow step is short). */
function segSeg(p, q, a, b, r) {
  for (let i = 0; i <= 4; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 4, y = p[1] + ((q[1] - p[1]) * i) / 4;
    if (segCircle(a, b, [x, y], r)) return true;
  }
  return false;
}

/* ── The world: the arrow and what stands in its way ─────────────────────────────────────────── */

const NONE = { group: -1, category: 0x0002, mask: 0 };
const GROUND_HIT = { category: 0x0004, mask: 0x0008 };
const GROUNDED = { category: 0x0008, mask: 0x0004 }; // debris falls to the ground, never props on itself

/** A reed or a branch: a static stroke until an arrow snaps it (then it falls, a body). */
function obstacleOf(o) {
  const [a, b] = o.kind === 'reed' ? [o.at, [o.at[0] + (o.lean ?? 0), o.at[1] - o.h]] : [o.from, o.to];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const body = Bodies.rectangle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len, o.kind === 'reed' ? 3 : 6,
    { angle, collisionFilter: GROUNDED, frictionAir: 0.02, density: 0.002, label: o.kind });
  Body.setStatic(body, true); // made static after, so a snap (setStatic false) gets its real mass back
  return { kind: o.kind, a, b, breaks: o.kind === 'reed' ? (o.breaks ?? BREAK_V) : (o.breaks ?? null), body, broken: false };
}

/** A level's world, as it stands before any arrow: the ground and the things in the way. */
export function build(level) {
  const engine = Engine.create({ gravity: { x: 0, y: GRAVITY } });
  const ground = Bodies.rectangle(W / 2, GROUND + 30, W * 2, 60, { isStatic: true, collisionFilter: GROUND_HIT });
  const things = (level.things ?? []).map(obstacleOf);
  Composite.add(engine.world, [ground, ...things.map((t) => t.body)]);
  return { engine, things, arrow: null, acc: 0 };
}

/** The pull → the arrow's velocity: `a` degrees above the level (toward the deer, left), `p` 0–1. */
export function velocityOf({ a, p }) {
  const r = (a * Math.PI) / 180, v = MIN_V + Math.max(0, Math.min(1, p)) * (MAX_V - MIN_V);
  return { x: -Math.cos(r) * v, y: -Math.sin(r) * v };
}

/** An arrow on the string, loosed: a body that only flies (it touches nothing matter knows). */
export function shoot(world, aim) {
  const v = velocityOf(aim);
  const body = Bodies.rectangle(BOW[0], BOW[1], ARROW_HALF * 2, 2, { collisionFilter: NONE, frictionAir: 0, density: 0.001 });
  Composite.add(world.engine.world, body);
  Body.setAngle(body, Math.atan2(v.y, v.x));
  Body.setVelocity(body, v);
  world.arrow = { body, true: true, path: [[BOW[0], BOW[1]]], tip: tipOf(body), steps: 0 };
  return world;
}

function tipOf(body) {
  const a = body.angle;
  return [body.position.x + Math.cos(a) * ARROW_HALF, body.position.y + Math.sin(a) * ARROW_HALF];
}

/** One step of the world (1/60 s): wind on the arrow, matter moves it, then what it struck.
    Returns the arrow's event: null (flying), 'snap', 'turned', 'ground', 'water', 'out'. */
export function stepWorld(world, level, ms = 0) {
  const ar = world.arrow;
  if (ar && ar.true) Body.setVelocity(ar.body, { x: ar.body.velocity.x + WIND_ACC * windAt(level, ms), y: ar.body.velocity.y });
  Engine.update(world.engine, STEP_MS);
  if (!ar || ar.done) return null;
  if (ar.true) Body.setAngle(ar.body, Math.atan2(ar.body.velocity.y, ar.body.velocity.x));
  const from = ar.tip, to = tipOf(ar.body);
  ar.prev = from;
  ar.tip = to;
  ar.steps += 1;
  if (ar.steps % TRAIL_EVERY === 0) ar.path.push([n(to[0]), n(to[1])]);
  return (ar.true ? struck(world, from, to) : null) ?? landed(ar, to);
}

function struck(world, from, to) {
  const t = world.things.find((x) => !x.broken && segSeg(from, to, x.a, x.b, x.kind === 'reed' ? 2.5 : 4));
  if (!t) return null;
  const ar = world.arrow, v = ar.body.velocity, speed = Math.hypot(v.x, v.y);
  return t.breaks != null && speed >= t.breaks ? snap(world, t, v) : turn(ar, t, v);
}

function snap(world, t, v) {
  t.broken = true;
  t.stub = t.kind === 'reed' ? [t.a, [t.a[0] + (t.b[0] - t.a[0]) * 0.3, t.a[1] + (t.b[1] - t.a[1]) * 0.3]] : null;
  scatter(world, world.arrow.tip, v);
  Body.setStatic(t.body, false);
  Body.setVelocity(t.body, { x: v.x * 0.25, y: v.y * 0.25 - 0.6 });
  Body.setAngularVelocity(t.body, Math.sign(v.x || 1) * 0.14);
  Body.setVelocity(world.arrow.body, { x: v.x * AFTER_BREAK, y: v.y * AFTER_BREAK });
  return 'snap';
}

/** Chaff: a few bits of reed or bark thrown on with the arrow, falling to the grass. */
function scatter(world, [x, y], v) {
  const bits = [[0.35, -1.2], [0.2, -0.4], [0.5, 0.3], [0.1, -1.8]].map(([k, up], i) => {
    const b = Bodies.rectangle(x, y, 5, 1.5, { collisionFilter: GROUNDED, frictionAir: 0.04, angle: i });
    Body.setVelocity(b, { x: v.x * k, y: v.y * k + up });
    Body.setAngularVelocity(b, 0.2 * (i % 2 ? 1 : -1));
    return b;
  });
  Composite.add(world.engine.world, bits);
  world.bits = [...(world.bits ?? []), ...bits];
}

/** Turned: off the thing's face, slowed; the arrow tumbles and is spent. */
function turn(ar, t, v) {
  const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], l = Math.hypot(ux, uy) || 1, nx = -uy / l, ny = ux / l;
  const dot = v.x * nx + v.y * ny;
  if (t.kind === 'branch') t.shake = 1;
  Body.setVelocity(ar.body, { x: (v.x - 2 * dot * nx) * TURN, y: (v.y - 2 * dot * ny) * TURN });
  Body.setAngularVelocity(ar.body, 0.25);
  ar.true = false;
  return 'turned';
}

function landed(ar, [x, y]) {
  const end = x < -30 || x > W + 30 || y > H + 20 ? 'out' : y >= groundAt(x) ? 'ground' : null;
  if (end) { ar.done = true; Body.setStatic(ar.body, true); }
  return end;
}

/** A shot flown in a fresh world, against the deer as it moves from `at` ms: the bot's search
    and the tests use it — the same steps the game takes. → { hit, steps, tip, snapped } */
export function flight(level, aim, at = 0, limit = 600) {
  const world = shoot(build(level), aim);
  let snapped = 0;
  for (let k = 1; k <= limit; k++) {
    const ev = stepWorld(world, level, at + k * STEP_MS);
    if (ev === 'snap') snapped++;
    const hit = world.arrow.true ? deerHit(level, at + k * STEP_MS, world.arrow.prev, world.arrow.tip) : null;
    if (hit) return { hit, steps: k, tip: world.arrow.tip, snapped };
    if (ev && ev !== 'snap') return { hit: null, end: ev, steps: k, tip: world.arrow.tip, snapped };
  }
  return { hit: null, end: 'out', steps: limit, tip: world.arrow.tip, snapped };
}

/* ── The game ──────────────────────────────────────────────────────────────────────────────── */

const levelOf = (s) => s.levels[s.li];

function lay(s, li) {
  const world = build(s.levels[li]);
  watch(s.seed, world);
  return { ...s, li, phase: 'aim', t: 0, clock: 0, used: 0, pull: null, world, stuck: [], trail: s.li === li ? s.trail : null, said: null, slowAt: null, alertAt: null, hint: s.li === li ? s.hint : false };
}

export function newGame(seed, _level = 1, deal = {}) {
  const levels = Array.isArray(deal?.levels) ? deal.levels : [];
  const s = { seed: String(seed), live: levels.length > 0, levels, li: 0, phase: 'aim', t: 0, clock: 0, wall: 0,
    misses: levels.map(() => 0), best: levels.map(() => 0), used: 0, won: false, stars: 0, grade: null, still: Boolean(deal?.still), art: deal?.art ?? null };
  return levels.length ? lay(s, 0) : { ...s, phase: 'empty' };
}

/** Stars for a level won with `used` arrows: one 3, two 2, more 1. */
export const starsFor = (used) => (used <= 1 ? 3 : used === 2 ? 2 : 1);
/** The beat's stars: the levels' best, averaged and rounded (0 while any is unwon). */
export const starsOf = (s) => (s.best.every((b) => b > 0) ? Math.round(s.best.reduce((a, b) => a + b, 0) / s.best.length) : 0);
export const gradeOf = (stars) => (stars >= 3 ? 'clean' : stars === 2 ? 'steady' : 'rough');
/** Stuck: the same level's quiver emptied again and again. */
export const stuck = (s) => !s.won && (s.misses?.[s.li] ?? 0) >= STUCK_MISSES;

/** The pull from a press at (x0, y0) to a pointer at (x, y): toward the deer, opposite the pull. */
export function aimOf(x0, y0, x, y) {
  const dx = x0 - x, dy = y0 - y, len = Math.hypot(dx, dy);
  return { a: (Math.atan2(-dy, -dx) * 180) / Math.PI, p: Math.min(1, len / MAX_PULL) };
}

const canAim = (s) => s.phase === 'aim';

function hold(s, d) {
  if (!canAim(s) || !Number.isFinite(Number(d.x))) return null;
  return { ...s, press: [Number(d.x), Number(d.y)], pull: { a: 15, p: 0 } };
}
function move(s, d) {
  if (!canAim(s) || !s.press || !Number.isFinite(Number(d.x))) return null;
  return { ...s, pull: aimOf(s.press[0], s.press[1], Number(d.x), Number(d.y)) };
}
/** Drawn directly to an aim (the bot, the tests; a keyboard later): `a` degrees, `p` 0–1. */
function draw(s, d) {
  if (!canAim(s)) return null;
  return { ...s, pull: { a: Math.max(-30, Math.min(85, Number(d.a) || 0)), p: Math.max(0, Math.min(1, Number(d.p) || 0)) } };
}

function loose(s) {
  if (!canAim(s) || !s.pull) return null;
  if (s.pull.p < MIN_POWER) return { ...s, pull: null, press: null };
  const ahead = flight(levelOf(s), s.pull, s.clock);
  shoot(s.world, s.pull);
  const slowAt = ahead.hit === 'clean' ? Math.max(0, ahead.steps - SLOW_STEPS) : null;
  return { ...s, phase: 'fly', t: 0, used: s.used + 1, aimed: s.pull, pull: null, press: null, said: null, slowAt, shots: (s.shots ?? 0) + 1 };
}

const VERBS = {
  hold, move, draw,
  release: loose, loose,
  // 重来 keeps the last arrow's trail (as 愤怒小鸟 does): the try before is what the next one learns from.
  retry: (s) => (['aim', 'fly', 'clear', 'gone', 'spook'].includes(s.phase) ? lay({ ...s, trail: s.world.arrow?.path ?? s.trail }, s.li) : null),
  next: (s) => (s.phase === 'clear' ? advance(s) : null),
};

export function act(state, data = {}) {
  if (!state || state.won || !state.live) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── Time ──────────────────────────────────────────────────────────────────────────────────── */

function flying(s) {
  const level = levelOf(s), ev = stepWorld(s.world, level, s.clock), ar = s.world.arrow;
  const hit = ar.true ? deerHit(level, s.clock, ar.prev, ar.tip) : null;
  if (hit) return hit === 'clean' ? clean(s) : graze(s);
  if (ev === 'snap') return { ...s, said: 'snap', saidAt: s.clock };
  if (ev === 'turned') return { ...s, said: 'turned', saidAt: s.clock };
  return ev ? land(s, ev) : s;
}

function clean(s) {
  const ar = s.world.arrow;
  ar.done = true;
  const best = s.best.map((b, i) => (i === s.li ? Math.max(b, starsFor(s.used)) : b));
  return { ...s, phase: 'hit', t: 0, best, at: ar.tip, deerGone: deerAt(levelOf(s), s.clock), trail: ar.path, said: 'clean' };
}

function graze(s) {
  const ar = s.world.arrow;
  ar.done = true;
  return { ...s, phase: 'spook', t: 0, at: ar.tip, deerGone: deerAt(levelOf(s), s.clock), trail: ar.path, said: 'graze', grazes: (s.grazes ?? 0) + 1 };
}

/** Landed in the grass (or the stream): no pause — the next arrow is on the string at once; the
    spent one stays where it stuck, and a near one makes the deer look up. */
function land(s, ev) {
  const level = levelOf(s), ar = s.world.arrow, d = deerAt(level, s.clock);
  const near = Math.abs(ar.tip[0] - d.x) < 80;
  const said = s.said === 'turned' ? 'turned' : ar.tip[0] < d.x ? 'long' : 'short';
  const stuck = ev === 'out' ? s.stuck : [...s.stuck, [n(ar.body.position.x), n(ar.body.position.y), n((ar.body.angle * 180) / Math.PI)]];
  return reload({ ...s, trail: ar.path, said, stuck, alertAt: near ? s.clock : s.alertAt, hint: s.hint || Boolean(level.hint) });
}

/** After a shot that did not end the level: aim again, or (the quiver empty) the deer is gone. */
const reload = (s) => (s.used >= QUIVER ? { ...s, phase: 'gone', t: 0, said: 'gone', misses: s.misses.map((m, i) => (i === s.li ? m + 1 : m)) } : clearArrow({ ...s, phase: 'aim', t: 0 }));

function clearArrow(s) {
  if (s.world.arrow) Composite.remove(s.world.engine.world, s.world.arrow.body);
  s.world.arrow = null;
  return s;
}

function advance(s) {
  if (s.li + 1 < s.levels.length) return lay({ ...s, trail: null, hint: false }, s.li + 1);
  const stars = starsOf(s);
  return { ...s, phase: 'end', live: false, won: true, stars, grade: gradeOf(stars) };
}

/** The deer bolts and, a while later, is back at the stream where its schedule starts again. */
const backAgain = (s) => clearArrow({ ...s, phase: s.used >= QUIVER ? 'gone' : 'aim', t: 0, clock: 0, alertAt: null, said: s.used >= QUIVER ? 'gone' : s.said });

const PHASES = {
  aim: (s) => (stepWorld(s.world, levelOf(s), s.clock), s),
  fly: flying,
  spook: (s) => (stepWorld(s.world, levelOf(s), s.clock), s.t < SPOOK_MS ? s : backAgain(s)),
  hit: (s) => (s.t < HIT_MS ? s : { ...s, phase: 'clear', t: 0 }),
  // Three stars go on by themselves; fewer wait for 往下 or 再来.
  clear: (s) => (s.t < CLEAR_MS || s.best[s.li] < 3 ? s : advance(s)),
  gone: (s) => (s.t < GONE_MS ? s : lay({ ...s }, s.li)),
};

export function tick(state, ms) {
  if (!state?.live || state.won || !state.world) return state;
  let s = state;
  s.world.acc += ms;
  while (s.world.acc >= STEP_MS * slowness(s) && s.live && !s.won) {
    s.world.acc -= STEP_MS * slowness(s);
    s = { ...s, t: s.t + STEP_MS, clock: s.clock + STEP_MS };
    s = PHASES[s.phase]?.(s) ?? s;
  }
  s.world.wall = globalThis.performance?.now() ?? 0;
  s.world.clock = s.clock;
  s.world.level = levelOf(s);
  s.world.rate = slowness(s);
  return s;
}

const calm = (s) => Boolean(s?.still) || still();

/** The slow-motion beat (a clean hit): the last steps before the arrow lands, and the burst's first
    moments, take SLOW times as long — only the screen's time; the world steps the same. */
function slowness(s) {
  if (calm(s)) return 1;
  if (s.phase === 'fly' && s.slowAt != null && (s.world.arrow?.steps ?? 0) >= s.slowAt) return SLOW;
  return s.phase === 'hit' && s.t < SLOW_HIT_MS ? SLOW : 1;
}

/* ── The picture (PLACEHOLDER strokes for the deer, the bow and the arrow) ─────────────────── */

const groundPts = () => { const pts = []; for (let x = 0; x <= W; x += 20) pts.push(`${x} ${n(groundAt(x))}`); return pts; };
const WATER_D = `M0 ${WATER[0][1] - 4} Q 80 ${WATER[0][1] - 9} 160 ${WATER[0][1] - 4} T 320 ${WATER[0][1] - 4} L330 ${GROUND + 6} V${H} H0Z`;
const bankD = () => `M${groundPts().join(' L')} V${H} H0Z`;

/** The stream and the banks: painted (games.json `art`: `backdrop` the 黑松岭 creek behind,
    `bank` and `water` cut from it into the ground and the stream), else drawn in ink. */
function bankPicture(s) {
  const a = s.art, id = clipId(s);
  if (!a?.backdrop) return inkBank();
  const clip = (name, d) => `<clipPath id="${id}-${name}"><path d="${d}"/></clipPath>`;
  // The whole board is the painting; a paper wash over its far half quiets it behind the deer.
  return `<defs>${clip('bank', bankD())}${clip('water', WATER_D)}<linearGradient id="${id}-wash" x1="0" y1="0" x2="0" y2="1">`
    + '<stop offset="0" stop-color="#f4ecdc" stop-opacity=".55"/><stop offset=".7" stop-color="#f4ecdc" stop-opacity=".25"/><stop offset="1" stop-color="#f4ecdc" stop-opacity="0"/></linearGradient></defs>'
    + cropped(a.backdrop, 0, 0, W, H, 'g-da-backdrop') + `<rect class="g-da-wash" width="${W}" height="${H}" style="fill:url(#${id}-wash)"/>`
    + (a.bank ? `<g clip-path="url(#${id}-bank)">${cropped(a.bank, 0, BANK - 30, W, H - BANK + 30, 'g-da-bankart')}</g>` : '')
    + (a.water ? `<g clip-path="url(#${id}-water)">${cropped(a.water, 0, WATER[0][1] - 10, 330, H - WATER[0][1] + 10, 'g-da-waterart')}</g>` : '');
}

function inkBank() {
  const ripples = [40, 120, 210].map((x, i) => `<path class="g-da-ripple" d="M${x} ${WATER[0][1] + 10 + i * 6} q12 -3 24 0"/>`).join('');
  return `<path class="g-da-hill" d="M0 160 C90 130 170 150 260 120 C330 100 400 128 ${W} 112 V${H} H0Z"/>`
    + `<path class="g-da-ground" d="${bankD()}"/><path class="g-line g-thin g-faint" d="M${groundPts().join(' L')}"/>`
    + `<path class="g-da-water" d="${WATER_D}"/>${ripples}`;
}

/** A part of a painting (`crop` [x, y, w, h] in its pixels, of `size` [w, h]) filling a box. */
function cropped(a, x, y, w, h, cls) {
  const [cx, cy, cw, ch] = a.crop, [iw, ih] = a.size;
  return `<svg class="${cls}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="xMidYMid slice"${a.opacity != null ? ` opacity="${a.opacity}"` : ''}>`
    + `<image href="${artUrl(a.file)}" width="${iw}" height="${ih}"/></svg>`;
}
const clipId = (s) => `g-da-${String(s.seed).replace(/[^a-z0-9]/gi, '').slice(-12) || 'x'}`;

// The tuft on his bank, where the red rag is tied: its reeds' bases and heights.
const TUFT = [[452, BANK + 2, 46], [460, BANK + 2, 58], [469, BANK + 2, 40]];
const FAR_TUFTS = [[16, GROUND + 3, 30], [26, GROUND + 3, 38], [300, GROUND + 4, 28], [309, GROUND + 4, 34]];

/** The wind, read: a red rag tied to the tallest reed of the tuft on his bank, the reeds leaning,
    and leaves drifting the way it blows now. No post: the reed is the post. */
function windPicture(level, s) {
  const t = calm(s) ? 0 : s.clock, w = windAt(level, s.clock), flutter = calm(s) ? 0 : Math.sin(t / 140) * (1 + 3 * Math.abs(w));
  const lean = Math.max(-1, Math.min(1, w)), sway = calm(s) ? 0 : Math.sin(t / 380) * (0.3 + Math.abs(w));
  const tuft = (list) => list.map(([x, y, h], i) => tuftReed(s.art?.reed, x, y, h, lean * 16 + sway * (1 + i * 0.3))).join('');
  const [rx, ry, rh] = TUFT[1], tip = tipOf2(rx, ry, rh, lean * 16 + sway * 1.3);
  const moving = level.wind || level.gust;
  const leaves = moving ? [0, 1, 2, 3].map((i) => leafAt(i, windCarried(level, t), t)).join('') : '';
  return tuft(FAR_TUFTS) + tuft(TUFT) + ragPicture(tip, lean, flutter) + leaves;
}

/** One reed standing at (x, y), `h` tall, leaning `deg` (+: the way the wind blows, +x). */
function tuftReed(art, x, y, h, deg) {
  if (!art) return `<path class="g-reed" d="M${x} ${y} Q${n(x + deg * 0.3)} ${n(y - h * 0.55)} ${n(x + deg)} ${n(y - h)}"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${n(deg - 90)})">${lengthSprite(art, 0, h, false)}</g>`;
}
const tipOf2 = (x, y, h, deg) => { const r = (deg * Math.PI) / 180; return [x + Math.sin(r) * h, y - Math.cos(r) * h]; };

/** The red rag on the reed's tip: hanging when still, streaming out the way the wind blows. */
function ragPicture([px, top], lean, flutter) {
  const len = 30, hang = 1 - Math.abs(lean) * 0.95, ex = px + lean * 0.95 * len, ey = top + 4 + hang * len * 0.9;
  const wx = 5 * hang; // hanging, the rag still has its width
  return `<path class="g-da-streamer" d="M${n(px)} ${n(top + 2)} Q${n((px + ex) / 2)} ${n(top + 2 + flutter + hang * 10)} ${n(ex)} ${n(ey + flutter)} L${n(ex + wx)} ${n(ey + 6 + flutter)} Q${n((px + ex) / 2 + wx)} ${n(top + 9 + flutter + hang * 10)} ${n(px + wx)} ${n(top + 8)}Z"/>`;
}

function leafAt(i, carried, t) {
  const span = W + 60, x = ((i * 137 + carried * 0.06 * (1 + i * 0.2)) % span + span) % span - 30;
  const y = 60 + i * 38 + Math.sin(t / 500 + i) * 8;
  return `<path class="g-da-leaf" d="M0 0 q4 -4 9 0 q-4 4 -9 0Z" transform="translate(${n(x)} ${n(y)}) rotate(${n(t / 9 + i * 50)})"/>`;
}

function thingPicture(t, s) {
  const { x, y } = t.body.position, len = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]);
  const sway = t.kind === 'reed' && !t.broken && !calm(s) ? Math.sin(s.clock / 420 + x) * 1.2 : 0;
  const shiver = t.shake && !calm(s) ? Math.sin(s.clock / 30) * 2 * Math.max(0, 1 - (s.t / 600)) : 0;
  const from = t.stub ? -len / 2 + len * 0.3 : -len / 2; // snapped: the top flies, the stub stands
  const deg = (t.body.angle * 180) / Math.PI + sway, art = s.art?.[t.kind];
  const body = art ? lengthSprite(art, from, len / 2, Math.cos(t.body.angle) < 0) : inkThing(t, from, len);
  return `${stubPicture(t, s)}<g transform="translate(${n(x)} ${n(y + shiver)}) rotate(${n(deg)})">${body}</g>`;
}

/** The code-drawn reed or branch (the fallback until its painting lands), from `from` to len/2. */
function inkThing(t, from, len) {
  const cls = t.kind === 'reed' ? 'g-da-reed' : 'g-da-branch';
  const twig = t.kind === 'branch' ? `<path class="g-da-twig" d="M${n(-len * 0.1)} 0 l-8 -12 M${n(len * 0.2)} 0 l6 -10 M${n(len * 0.32)} 0 l10 8"/>` : '';
  const head = t.kind === 'reed' ? `<path class="g-da-plume" d="M${n(len / 2)} 0 q8 -3 14 -1 q-8 3 -14 1Z"/>` : '';
  return `<path class="${cls}" d="M${n(from)} 0 L${n(len / 2)} 0"/>${twig}${head}`;
}

/** What a snapped reed leaves standing: `reed_stub` art, or a short stroke. */
function stubPicture(t, s) {
  if (!t.stub) return '';
  const [[ax, ay], [bx, by]] = t.stub, len = Math.hypot(bx - ax, by - ay), deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  const art = s.art?.reed_stub;
  if (!art) return `<path class="g-da-reed" d="M${n(ax)} ${n(ay)} L${n(bx)} ${n(by)} l2 -3"/>`;
  return `<g transform="translate(${n(ax)} ${n(ay)}) rotate(${n(deg)})">${lengthSprite(art, 0, len, false)}</g>`;
}

/** The deer: the painted stag when the row has its `art`, else ink; head down drinking or up
    listening, eased between; stepping when it walks. Antlers 「像一丛冬天的枯树枝」. */
export function deerPicture(d, { alert = 0, gone = 0, art = null } = {}) {
  const lift = Math.max(d.lift ?? 0, alert), up = lift > 0.5;
  // Bolting: away from the bank, left, in long bounds — never toward him.
  const face = gone ? -1 : d.face, leap = gone ? ` translate(${n(-gone * gone * 160)} ${n(-Math.abs(Math.sin(gone * Math.PI * 1.6)) * 22)}) rotate(${n(Math.sin(gone * Math.PI * 3.2) * 8)})` : '';
  const inner = art?.drink ? spriteDeer(art, d, lift, gone) : inkDeer(d, lift);
  return `<g class="g-da-deer${up ? ' is-up' : ''}${gone ? ' is-gone' : ''}" data-deer="" transform="translate(${n(d.x)} ${n(groundAt(d.x))})${leap} scale(${n(face * DEER_S, 2)} ${DEER_S})">${inner}</g>`;
}

/* The painted deer (games.json `art`, when the sprites land): each pose an image in the deer's own
   frame (facing +x, feet at 0) — `file` under worlds/jiuding/art, `w` × `h` in deer units, `at` the
   point in the picture (fractions) that stands on the deer's origin, `flip` if it faces left.
   The poses cross-fade by `lift`: drinking → looking (or walking, on the move; or bolting). */
const artUrl = (file) => new URL(`../../worlds/jiuding/art/${file}`, import.meta.url).href;
function sprite(a, opacity) {
  if (!a || opacity < 0.02) return '';
  const flip = a.flip ? -1 : 1, x = -a.at[0] * a.w, y = -a.at[1] * a.h;
  return `<image class="g-da-sprite" href="${artUrl(a.file)}" x="${n(x)}" y="${n(y)}" width="${a.w}" height="${a.h}" opacity="${n(opacity, 2)}"${flip < 0 ? ` transform="scale(-1 1)"` : ''} preserveAspectRatio="none"/>`;
}
/** A painting laid along a length in its frame (local +x, from `from` to `to`): its long axis
    (`axis`: "up" — painted standing, like a reed; else "right", like a branch) from its `at`.
    `w` × `h` give only its shape; the length sets its size. `mirror` keeps it right way up when
    the thing runs leftward. */
function lengthSprite(a, from, to, mirror) {
  const L = Math.max(1, to - from), up = a.axis === 'up';
  const [w, h] = up ? [(L * a.w) / a.h, L] : [L, (L * a.h) / a.w];
  const turn = up ? ' rotate(90)' : mirror ? ' scale(1 -1)' : '';
  return `<g transform="translate(${n(from)} 0)${turn}">${sprite({ ...a, w: n(w), h: n(h) }, 1)}</g>`;
}

function spriteDeer(art, d, lift, gone) {
  const moving = gone && art.bolt ? art.bolt : (gone || d.walking) && art.walk ? art.walk : art.look ?? art.walk;
  const bob = d.walking && !gone ? n(Math.abs(Math.sin(d.phase / 160)) * -1.2) : 0; // a step's rise
  return `<g transform="translate(0 ${bob})">${sprite(art.drink, 1 - lift) + sprite(moving, lift)}</g>`;
}

/** The PLACEHOLDER ink deer, posed by `lift` (0 drinking … 1 head up). */
function inkDeer(d, lift) {
  const [hx, hy] = headOf(lift);
  const stride = d.walking ? Math.sin(d.phase / 120) * 4 * Math.min(1, (d.lift ?? 1) * 1.5) : 0;
  const leg = (x, s) => `<path class="g-da-leg" d="M${x} -26 Q${x + s * 0.5} -12 ${x + s} 0"/>`;
  const legs = leg(-17, -2 + stride) + leg(-10, 1 - stride) + leg(13, -1 - stride) + leg(19, 2 + stride);
  const neck = `<path class="g-da-neck" d="M14 -40 Q${n((14 + hx) / 2 + 6 - 8 * lift)} ${n((-40 + hy) / 2 - 10 + 6 * lift)} ${n(hx)} ${n(hy)}"/>`;
  const tilt = 55 - 70 * lift;
  const antlers = `<g transform="translate(${n(hx)} ${n(hy)}) rotate(${n(tilt)})"><path class="g-da-antler" d="M-2 -5 L-8 -16 L-15 -22 M-8 -16 L-6 -25 M-11 -19 L-19 -18 M1 -6 L4 -17 L1 -26 M4 -17 L11 -22 M3 -13 L9 -13"/>`
    + '<ellipse class="g-da-head" cx="4" cy="0" rx="8" ry="4.6"/><path class="g-da-ear" d="M-3 -3 l-7 -3 l5 4Z"/></g>';
  const body = `<ellipse class="g-da-body" cx="0" cy="-34" rx="25" ry="11.5"/><path class="g-da-back" d="M-24 -38 Q0 -50 22 -40"/><path class="g-da-tail" d="M-24 -39 l-5 4"/>`;
  return legs + body + neck + antlers;
}

/** The bow by his bank, drawn back along the pull, the arrow nocked toward the deer. */
function bowPicture(s) {
  const pull = s.phase === 'aim' ? s.pull : null, p = pull?.p ?? 0, a = pull ? pull.a : 12;
  // The tension: the limbs bend in and the tips come back as the string stretches; full, it trembles.
  const back = 4 + p * 30, bend = 14 + p * 12, tipX = 4 - p * 7, tipY = 28 - p * 4;
  const shake = p >= 0.98 && !calm(s) ? n(Math.sin(s.clock / 23) * 0.8) : 0;
  const nocked = s.phase !== 'aim' ? '' : s.art?.bow_drawn ? `<g opacity="${n(Math.max(0, 1 - p * 2.5), 2)}">${arrowShape(s.art, 16)}</g>` : arrowShape(s.art, -back + 16);
  // Painted (bow_rest → bow_drawn, cross-faded by the pull; each painted pointing right, the grip
  // at its `at`), else drawn: the limbs bend in and the string comes back with the pull.
  const bow = s.art?.bow_rest || s.art?.bow_drawn
    ? paintedBow(s.art, p)
    : `<path class="g-da-limb" d="M${n(tipX)} ${n(-tipY)} Q${n(bend)} 0 ${n(tipX)} ${n(tipY)}"/>`
      + `<path class="g-da-string${p > 0 ? ' is-taut' : ''}" d="M${n(tipX)} ${n(-tipY)} L${n(4 - back)} 0 L${n(tipX)} ${n(tipY)}"/>`;
  // Mirrored (it points left), so the screen's clockwise rotate takes −a: local +x then runs along
  // (−cos a, −sin a), the launch vector (velocityOf) — up for a > 0. Hanli 10-16: it pointed down.
  return `<g class="g-da-bow${p >= 0.98 ? ' is-full' : ''}" transform="translate(${BOW[0]} ${n(BOW[1] + shake)}) scale(-1 1) rotate(${n(-a)})">${bow}${nocked}</g>`;
}

/** The painted bow in his hand: at rest until he pulls, then drawn — the drawn painting widening
    from its grip as the pull grows (the string comes back, the limbs bend), never two ghosts. A
    soft light behind it, so it reads over the painted grass. */
function paintedBow(art, p) {
  const drawn = art.bow_drawn && p >= 0.12 ? art.bow_drawn : null, a = drawn ?? art.bow_rest ?? art.bow_drawn;
  const stretch = drawn ? 0.62 + 0.38 * Math.min(1, p) : 1;
  const halo = `<ellipse class="g-da-halo" cx="${n(-a.w * 0.2)}" cy="0" rx="${n(Math.max(26, a.w * 0.75))}" ry="${n(a.h * 0.55)}"/>`;
  return `${halo}<g transform="scale(${n(stretch, 3)} 1)">${sprite(a, 1)}</g>`;
}

/** An arrow along local +x, its middle at `cx`: the `arrow` painting (pointing right), or ink. */
function arrowShape(art, cx = 0, spent = false) {
  if (art?.arrow) return `<g transform="translate(${n(cx)} 0)">${sprite(art.arrow, 1)}</g>`;
  const t = cx - ARROW_HALF, h = cx + ARROW_HALF;
  return `<path class="g-da-shaft" d="M${n(t)} 0 L${n(spent ? h - 4 : h)} 0"/>${spent ? '' : `<path class="g-da-head-tip" d="M${n(h)} 0 l-6 -3 l0 6Z"/>`}`
    + `<path class="g-da-fletch" d="M${n(t)} 0 l-4 -3 M${n(t + 3)} 0 l-4 -3 M${n(t)} 0 l-4 3 M${n(t + 3)} 0 l-4 3"/>`;
}

/** While drawing the level's first arrow only: the first stretch of the arc, as if there were no
    wind — the wind is his to read; after that, the last arrow's trail is the teacher. */
function guidePicture(s) {
  if (s.phase !== 'aim' || !s.pull || s.pull.p < MIN_POWER || s.used > 0 || s.trail) return '';
  const v = velocityOf(s.pull), g = GRAVITY * 0.001 * STEP_MS * STEP_MS, dots = [];
  for (let k = 4; k <= 40; k += 4) dots.push(`<circle class="g-da-guide" cx="${n(BOW[0] + v.x * k)}" cy="${n(BOW[1] + v.y * k + 0.5 * g * k * k)}" r="${n(2.4 - k / 22)}"/>`);
  return dots.join('');
}

/** The spent arrows stuck in the grass this try, and the chaff a snapped reed threw. */
function spentPicture(s) {
  const stuck = (s.stuck ?? []).map(([x, y, a]) => `<g class="g-da-spent" transform="translate(${x} ${y}) rotate(${a})">${arrowShape(s.art, 0, true)}</g>`).join('');
  const bits = (s.world.bits ?? []).map((b) => `<path class="g-da-bit" d="M-3 0 L3 0" transform="translate(${n(b.position.x)} ${n(b.position.y)}) rotate(${n((b.angle * 180) / Math.PI)})"/>`).join('');
  return stuck + bits;
}

function trailPicture(s) {
  return (s.trail ?? []).map(([x, y], i) => (i % 2 ? '' : `<circle class="g-da-trail" cx="${x}" cy="${y}" r="1.6"/>`)).join('');
}

function arrowPicture(s) {
  const ar = s.world.arrow;
  if (!ar || ['hit', 'spook', 'clear'].includes(s.phase)) return '';
  const { x, y } = ar.body.position, deg = (ar.body.angle * 180) / Math.PI;
  return `<g class="g-da-arrow" data-arrow="" transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})">${arrowShape(s.art)}</g>`;
}

/** 「往左偏半寸」: after a miss on a level that hints it, a small tick half an inch left of the deer. */
function hintPicture(level, s) {
  if (!s.hint || !level.hint || s.phase === 'hit') return '';
  const d = deerAt(level, s.clock), x = d.x + d.face * HEART[0] * DEER_S - 14, y = groundAt(d.x) + HEART[1] * DEER_S;
  return `<path class="g-da-hint" d="M${n(x)} ${n(y - 7)} L${n(x)} ${n(y + 7)} M${n(x - 4)} ${n(y)} L${n(x + 4)} ${n(y)}"/>`;
}

/** The look-up after an arrow lands near: eased up and back down, 0 … 1. */
const alerted = (s) => (s.alertAt == null ? 0 : swell(s.clock - s.alertAt, ALERT_MS));

function deerNow(level, s) {
  if (['hit', 'spook'].includes(s.phase)) {
    // A beat of stillness (the burst), then the bound away; reduced motion: simply gone.
    const gone = Math.max(0, Math.min(1.4, (s.t - 250) / 700));
    return calm(s) && gone > 0 ? '' : deerPicture(s.deerGone, { gone, alert: ease(s.t / 200), art: s.art }).replace(' data-deer=""', '');
  }
  if (s.phase === 'gone' || s.phase === 'clear') return ''; // off into the reeds
  return deerPicture(deerAt(level, s.clock), { alert: alerted(s), art: s.art });
}

function burstPicture(s) {
  if (!['hit', 'spook'].includes(s.phase) || !s.at) return '';
  const [x, y] = s.at;
  if (s.phase === 'spook') return calm(s) ? '' : splash(x, y, s.t, { r: 8 });
  const stars = starsPicture(x, y - 34, starsFor(s.used), calm(s) ? 1 : s.t);
  if (calm(s)) return `<circle class="g-da-burst" cx="${n(x)}" cy="${n(y)}" r="14"/>${stars}`;
  // A big bloom of ink, a second one a beat behind, a ring going out — and the stars.
  const ring = s.t < 600 ? `<circle class="g-da-ring" cx="${n(x)}" cy="${n(y)}" r="${n(10 + s.t / 12)}" opacity="${n(1 - s.t / 600, 2)}"/>` : '';
  return inkHit(s.art?.ink_hit, x, y, s.t) + ring + stars;
}

/** The bloom: the `ink_hit` painting opening and fading, or two ink splashes a beat apart. */
function inkHit(a, x, y, t) {
  if (!a) return splash(x, y, t, { r: 30 }) + splash(x - 8, y + 4, t - 90, { r: 16 });
  if (t > 1100) return '';
  // Wash-strength, not a solid blot: it opens wide and soft over the painted coat, then fades.
  const k = 0.7 + 0.9 * ease(t / 450), o = 0.72 * (t < 650 ? ease(t / 120) : 1 - (t - 650) / 450);
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(k, 2)})">${sprite(a, o)}</g>`;
}

/** The level's stars, stamped one after another over the strike (each pops in, eased with a kick). */
function starsPicture(x, y, k, t) {
  return [0, 1, 2].map((i) => {
    const age = typeof t === 'number' ? t - 120 - i * 110 : 999, f = age <= 0 ? 0 : Math.min(1, age / 180);
    if (!f) return '';
    const pop = f < 1 ? 0.3 + 1.1 * Math.sin((f * Math.PI) / 1.2) : 1;
    return `<text class="g-da-hitstar${i < k ? ' is-on' : ''}" x="${n(x + (i - 1) * 17)}" y="${n(y)}" text-anchor="middle" transform="translate(${n(x + (i - 1) * 17)} ${n(y)}) scale(${n(pop, 2)}) translate(${n(-(x + (i - 1) * 17))} ${n(-y)})">${i < k ? '★' : '☆'}</text>`;
  }).join('');
}

/** A clean hit settles the scene: a short, damped shake (nothing under reduced motion). */
function settle(s) {
  if (s.phase !== 'hit' || calm(s) || s.t > 220) return '';
  const k = 1 - s.t / 220;
  return ` style="transform: translate(${n(Math.sin(s.t / 14) * 3 * k)}px, ${n(Math.cos(s.t / 11) * 2 * k)}px)"`;
}

function playScene(s) {
  const level = levelOf(s);
  const drag = `<rect class="g-da-pad" x="0" y="0" width="${W}" height="${H}" data-g-drag="bow"/>`;
  return scene(W, H, `<g class="g-da-world"${settle(s)}>${bankPicture(s) + windPicture(level, s) + trailPicture(s) + hintPicture(level, s) + spentPicture(s)
    + deerNow(level, s) + s.world.things.map((x) => thingPicture(x, s)).join('') + burstPicture(s) + bowPicture(s) + guidePicture(s)
    + arrowPicture(s)}</g>${drag}`, 'g-da-scene').replace('<svg ', `<svg data-arc="${esc(s.seed)}" `);
}

/** The wind as it blows now, in a word: how strong, and whether in his face or at his back. */
function windWord(w, t) {
  const k = Math.min(3, Math.ceil(Math.abs(w) / 0.3 - 0.15));
  return k ? `${t.wind[k]}${w > 0 ? t.face : t.back}` : t.wind[0];
}
/** Stars; `pop` stamps each in turn (CSS: .g-da-pop, staggered, still under reduced motion). */
const starRow = (k, pop = false) => [0, 1, 2].map((i) => `<i class="g-da-star${i < k ? ' is-on' : ''}${pop ? ' g-da-pop' : ''}" style="--i:${i}">${i < k ? '★' : '☆'}</i>`).join('');

function head(s, t) {
  const level = levelOf(s), left = Math.max(0, QUIVER - s.used);
  const quiver = `<span>${t.arrows} <b>${'│'.repeat(left)}</b>${'·'.repeat(QUIVER - left)}</span>`;
  return `<div class="g-head g-da-top"><span>${t.level.replace('{i}', String(s.li + 1)).replace('{n}', String(s.levels.length))}</span>`
    + `<span class="g-da-windword">${windWord(windAt(level, s.clock), t)}</span>${quiver}</div>`;
}

function lineOf(s, t, lang) {
  const level = levelOf(s);
  const said = { clean: t.clean, graze: t.graze[(s.grazes ?? 1) % t.graze.length], short: t.short, long: t.long, turned: t.turned, snap: t.snap, gone: t.gone };
  if (s.phase === 'clear') return `${t.clear}${starRow(s.best[s.li], true)}`;
  if (s.phase === 'aim' && s.pull) return s.pull.p >= 0.98 ? t.full : t.pull;
  // A miss where she hints it: her 「往左偏半寸」 right after; else the deer's look-up if it was near.
  if (s.phase === 'aim' && !s.pull && s.hint && level.hint && ['short', 'long'].includes(s.said)) return `${said[s.said]}${t.hint}`;
  if (s.phase === 'aim' && !s.pull && s.alertAt != null && s.clock >= s.alertAt && s.clock - s.alertAt < ALERT_MS && ['short', 'long'].includes(s.said)) return `${said[s.said]}${t.alert}`;
  if (s.said && said[s.said]) return said[s.said];
  if (s.hint && level.hint) return t.hint;
  return level.say?.[lang] ?? level.say?.zh ?? '';
}

function controls(s, t) {
  if (s.phase === 'clear' && s.best[s.li] < 3) return `<div class="g-pair">${btn(t.next, 'data-g="next"', 'main')}${btn(t.again, 'data-g="retry"', 'soft')}</div>`;
  if (['aim', 'fly', 'gone', 'spook'].includes(s.phase)) return `<div class="g-bread-row">${btn(t.retry, 'data-g="retry"', 'quiet')}</div>`;
  return '<div class="g-bread-row"></div>';
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.phase === 'empty') return `<div class="g-deerarc g-ink"><p class="g-line-say">${t.empty}</p></div>`;
  if (state.won) {
    return `<div class="g-deerarc g-ink is-won"><p class="g-da-stars">${starRow(state.stars)}</p>`
      + `<p class="g-line-say">${t.end}<br>${t.stars.replace('{s}', String(state.stars))}</p></div>`;
  }
  return `<div class="g-deerarc g-ink">${head(state, t)}${playScene(state)}<p class="g-line-say">${lineOf(state, t, lang)}</p>${controls(state, t)}</div>`;
}

/* ── Between the clock's steps: the painter (as 喂饼's) — the arrow carried on by its velocity
   and the walking deer by its schedule, so the flight reads smooth at the screen's rate. Draws
   only; nothing here runs in node. */
const WORLDS = new Map();
const esc = (v) => String(v).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);

function watch(seed, world) {
  if (typeof requestAnimationFrame !== 'function') return;
  WORLDS.set(String(seed), world);
  if (!watch.on) { watch.on = true; requestAnimationFrame(paintFrame); }
}

function paintArrow(svg, w, k) {
  const ar = w.arrow, el = svg.querySelector('[data-arrow]');
  if (!ar || ar.done || !el) return;
  const { position: p, velocity: v } = ar.body, deg = (ar.body.angle * 180) / Math.PI;
  el.setAttribute('transform', `translate(${n(p.x + v.x * k)} ${n(p.y + v.y * k)}) rotate(${n(deg)})`);
}

function paintDeer(svg, w, k) {
  const el = svg.querySelector('[data-deer]');
  if (!el || !w.level?.deer?.walk || !el.closest('svg')) return;
  const d = deerAt(w.level, w.clock + k * STEP_MS);
  el.setAttribute('transform', el.getAttribute('transform').replace(/^translate\([^)]*\) scale\([^)]*\)/, `translate(${n(d.x)} ${n(groundAt(d.x))}) scale(${n(d.face * DEER_S, 2)} ${DEER_S})`));
}

function paintFrame() {
  for (const svg of document.querySelectorAll('svg[data-arc]')) {
    const w = WORLDS.get(svg.dataset.arc);
    if (!w?.wall) continue;
    const k = Math.min(3, Math.max(0, (performance.now() - w.wall) / (STEP_MS * (w.rate ?? 1))));
    paintArrow(svg, w, k);
    paintDeer(svg, w, k);
  }
  requestAnimationFrame(paintFrame);
}

/* ── Standalone: the mount() contract (games/mount.js); alone it reads its row of games.json. */
/** The `art` entries whose files are there (`has(file)` → Promise<boolean>); a missing one is left
    out, so its part is drawn in ink until the painting lands — no code change, nothing broken. */
export async function presentArt(art, has) {
  if (!art) return null;
  const keys = Object.keys(art).filter((k) => !k.startsWith('_') && art[k]?.file);
  const ok = await Promise.all(keys.map((k) => has(art[k].file)));
  return Object.fromEntries(keys.filter((_, i) => ok[i]).map((k) => [k, art[k]]));
}
const onServer = async (file) => {
  try { return (await fetch(artUrl(file), { method: 'HEAD' })).ok; } catch { return false; }
};

/** Its own row of games.json: the levels, and the painted sprites (`art`) once they land. */
async function ownRow() {
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  return (await res.json()).games.find((g) => g.id === meta.id) ?? {};
}
export async function mount(container, opts = {}) {
  const row = opts.data?.levels ? {} : await ownRow();
  const levels = opts.data?.levels ?? row.levels ?? [], art = await presentArt(opts.data?.art ?? row.art, onServer);
  const quiet = opts.reducedMotion ? { still: true } : {};
  return mountPure({ newGame, act, tick, html })(container, { ...opts, data: { ...(opts.data ?? {}), levels, art, ...quiet } });
}
