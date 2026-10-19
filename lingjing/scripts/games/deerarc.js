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
import { frame as juiceFrame, muted, muteLabel, viewAttr } from './juice.js';
import { ARROW, fxPicture, projectileOf, shapeOf, tapNow, trayOf, turnsWithFlight } from './throws.js';
import { segCircle, segEllipse, segSeg, targetOf } from './targets.js';
import { arrowAt, atRest, cue, deerSensor, FILTER, firstStruck, heavier, isSmashKind, KINDS, listen, ride, scoreMoves, settleBlows, shatter, smashThing } from './smash.js';

const { Engine, Bodies, Body, Composite, Sleeping } = Matter;

export const meta = {
  id: 'deerarc',
  name: { zh: '射鹿 · 拉弓', en: 'The stag · Draw the bow' },
  how: {
    zh: '往后拉，拉得越长越有劲，松手放箭。先看风，后看鹿；走着的鹿，箭要等它。',
    en: 'Pull back — longer is stronger — and let go. Wind first, then the deer; a walking deer, lead it.',
  },
};

export const W = 480, H = 300;
export const STEP_MS = 1000 / 60;
export const BOW = [378, 164]; // his hand on the near bank, held up out of the grass, clear of the edge
export const MAX_PULL = 120, MIN_POWER = 0.12, MIN_V = 3, MAX_V = 7.2;
export const QUIVER = 4, STUCK_MISSES = 3;
const GRAVITY = 0.36, WIND_ACC = 0.02, ARROW_HALF = 13, TRAIL_EVERY = 3;
const BREAK_V = 5, AFTER_BREAK = 0.88, TURN = 0.32, SLOW = 3, SLOW_STEPS = 12, SLOW_HIT_MS = 450;
const HIT_MS = 1400, SPOOK_MS = 1300, GONE_MS = 700, CLEAR_MS = 1800, ALERT_MS = 1400;

const T = {
  zh: {
    level: '第 {i} / {n} 处', arrows: '箭', wind: ['无风', '微风', '有风', '大风'], face: ' · 迎面', back: ' · 顺风',
    clean: '中了。一团墨花绽开——鹿一跃而起，没进了芦苇深处。',
    body: '中了，偏了些，没中要害。鹿一惊，一跃没进了芦苇。',
    graze: ['擦着鹿角飞过去了。鹿一惊，一溜烟跑了——过了好一会儿，才又回到溪边。', '箭擦过它的头。鹿受了惊，蹦开去，又慢慢回来了。'],
    short: '箭扎进了草里。', long: '箭飞过了头，落进了溪里。', turned: '箭碰着了，打着转掉下来。',
    alert: '鹿抬起头，竖着耳朵听了一会儿——又低下头去。',
    snap: '芦苇应声折断。',
    stuck: '笃的一声，箭钉进了木头里。', flushed: '哗啦一声——鹿惊得蹿了出来，站住了，回头看。', felled: '轰隆一下，砸个正着——鹿倒了。',
    dash: '一点——它直冲出去。', tray: '扔什么',
    glance: '叫它的皮弹开了。等它吸气——翅膀根翻开那一霎。',
    hint: '……风。往左偏半寸。',
    gone: '箭筒空了。鹿走远了。再来。',
    pull: '往后拉……', full: '拉满了 · 松手',
    score: '得分', retry: '重来', next: '下一处', last: '收弓', again: '再来，争三星',
    clear: '这一处：', end: '溪边{n}处，都射中了。', endSmash: '溪边{n}处，都拿下了——该射的射中了，该砸的也砸了个痛快。', one: '溪边那一处，射中了。', stars: '共得 {s} 星。',
    empty: '溪边没有鹿。',
  },
  en: {
    level: 'Spot {i} of {n}', arrows: 'Arrows', wind: ['No wind', 'A breath', 'Wind', 'Strong wind'], face: ' · in your face', back: ' · at your back',
    clean: 'A hit. A bloom of ink — the deer leaps and is gone deep into the reeds.',
    body: 'A hit, but off the heart. The deer starts and is gone into the reeds.',
    graze: ['It skims the antlers. The deer startles and bolts — and only after a long while comes back to the stream.', 'It brushes past its head. The deer shies away, then creeps back.'],
    short: 'The arrow sticks in the grass.', long: 'Over its back — the arrow drops into the stream.', turned: 'It strikes something and tumbles down.',
    alert: 'The deer lifts its head, listens — and drinks again.',
    snap: 'A reed snaps.',
    stuck: 'Thock — the arrow bites into the wood.', flushed: 'A crash — the deer bolts into the open, stops, looks back.', felled: 'Down it comes, square on the deer — it falls.',
    dash: 'A tap — and it shoots straight on.', tray: 'Throw',
    glance: 'The hide turns it. Wait for the breath — the instant the wing root opens.',
    hint: '…The wind. Half an inch left.',
    gone: 'The quiver is empty. The deer has wandered off. Again.',
    pull: 'Pull back…', full: 'Full — let go',
    score: 'Score', retry: 'Again', next: 'Next spot', last: 'Unstring the bow', again: 'Again, for three stars',
    clear: 'This spot: ', end: '{n} spots by the stream, each one hit.', endSmash: '{n} spots by the stream, every one taken — hit where it took an arrow, smashed where it took a stone.', one: 'The spot by the stream: hit.', stars: '{s} stars in all.',
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

/* Each arrow's wind (Hanli 10-16: 「风不变吗?」): a level's `roll` {min, max, dirs?} draws a strength
   (and on some levels a direction: +1 in his face, −1 at his back) for each arrow, seeded by the
   try and the arrow's number — so 重来 deals the same winds again, fair to learn. The level's
   `gust` breathes on top of it. No `roll`: the level's own steady `wind`. */
function rng(key) {
  let a = 2166136261;
  for (const ch of key) a = Math.imul(a ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** The base wind for arrow number `k` (0…) of level `li` in the try seeded `seed`. */
export function rollWind(level, seed, li, k) {
  const r = level.roll;
  if (!r) return level.wind ?? 0;
  const next = rng(`${seed}|${li}|${k}`), dirs = r.dirs ?? [1];
  const strength = r.min + (r.max - r.min) * next();
  return Math.round(strength * dirs[Math.floor(next() * dirs.length) % dirs.length] * 100) / 100;
}
/** The level as this arrow meets it: its wind the arrow's rolled base. */
export const levelNow = (s) => (s.windBase == null && s.flushAt == null ? s.levels[s.li]
  : { ...s.levels[s.li], ...(s.windBase == null ? {} : { wind: s.windBase }), ...(s.flushAt == null ? {} : { flushAt: s.flushAt }) });
const withWind = (s) => ({ ...s, windBase: s.levels[s.li]?.roll ? rollWind(s.levels[s.li], s.seed, s.li, s.used) : null });

/* ── The deer: a declared schedule (where, facing, head down or up) ──────────────────────────── */

const RAMP = 320; // a head comes up (or goes down to the water) over this long, eased
const ease = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };
/** Eased 0 → 1 → 0 across a window [0, len): up over RAMP at its start, down over RAMP at its end. */
const swell = (v, len) => (v < 0 || v >= len ? 0 : ease(Math.min(v, len - v) / RAMP));

/** Where the deer is at `ms` since the level was laid: { x, face, walking, lift (0 drinking … 1
    head up), up, phase }. Every pose eases into the next; the zones follow the same `lift`. */
export function deerAt(level, ms) {
  const d = level.deer, at = Math.max(0, ms);
  if (d.flee && level.flushAt != null && at >= level.flushAt) return fled(d, at - level.flushAt, at);
  const pos = d.walk ? walkAt(d, at) : { x: d.x, face: d.face ?? 1, walking: false, lift: 0 };
  const lift = Math.max(pos.lift, liftAt(d, at));
  return { ...pos, lift, up: lift > 0.5, phase: at };
}

/** Flushed (what fell on it, or near): it bounds to `flee.x`, then stands, head up, looking back. */
export const FLEE_MS = 900;
function fled(d, u, at) {
  const k = ease(u / FLEE_MS), x = d.x + (d.flee.x - d.x) * k, run = u < FLEE_MS;
  return { x, face: run ? Math.sign(d.flee.x - d.x) || -1 : d.flee.face ?? d.face ?? -1, walking: run, running: run, lift: 1, up: true, phase: at };
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
const HEART = [13, -28], HEART_R = 15, PIERCE = 18, BODY = [0, -34, 25, 12];
const DOWN = [44, -12], UP = [33, -47];
const ANTLER_DOWN = [-4, -36], ANTLER_UP = [-15, -16];
/** The head between drinking (0) and up (1). */
const headOf = (lift) => [DOWN[0] + (UP[0] - DOWN[0]) * lift, DOWN[1] + (UP[1] - DOWN[1]) * lift];
const ANTLER_R = 18;
/** The stag's zones (its own frame, deer units), for a board that judges a point, not a flight (deerhunt.js). */
export const STAG = { HEART, BODY, DOWN, UP, ANTLER_DOWN, ANTLER_UP, ANTLER_R };

/** What a throw's point, from `a` to `b`, struck: the stag (below), or the level's `target`. */
export function targetHit(level, ms, a, b) {
  if (level.deer) return deerHit(level, ms, a, b);
  return targetOf(level)?.hit(level, ms, a, b, groundAt) ?? null;
}

/** What the arrow's point, from `a` to `b` (world), touched on the deer: 'clean' (the heart),
    'body' (the barrel or the neck: a hit, off the heart), 'graze' (head, antlers) or null. */
export function deerHit(level, ms, a, b) {
  const d = deerAt(level, ms), gy = groundAt(d.x);
  const local = ([x, y]) => [((x - d.x) * d.face) / DEER_S, (y - gy) / DEER_S];
  const [p, q] = [local(a), local(b)];
  const head = headOf(d.lift), lerp = (a, b) => a + (b - a) * d.lift;
  const antler = [head[0] + lerp(ANTLER_DOWN[0], ANTLER_UP[0]), head[1] + lerp(ANTLER_DOWN[1], ANTLER_UP[1])];
  if (segEllipse(p, q, BODY)) return pierces(p, q) ? 'clean' : 'body';
  if (segSeg(p, q, [20, -38], head, 6)) return 'body'; // the neck: a hit, off the heart
  return segCircle(p, q, head, 8) || segCircle(p, q, antler, ANTLER_R) ? 'graze' : null;
}

/** Into the body: the arrow's point carried on PIERCE along its way — does it reach the heart? */
function pierces(p, q) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
  return segCircle(p, [q[0] + (dx / l) * PIERCE, q[1] + (dy / l) * PIERCE], HEART, HEART_R);
}

/* Geometry (segCircle · segEllipse · segSeg) lives in targets.js, shared with the other targets. */

/* ── The world: the arrow and what stands in its way ─────────────────────────────────────────── */

const NONE = { group: -1, category: 0x0002, mask: 0 };
const GROUND_HIT = FILTER.ground;
const GROUNDED = FILTER.chaff; // reed debris falls to the ground, never props on itself

/** A reed or a branch: a body held where it grows, on a damped angular spring about its root — a
    reed bends under a blow and springs back, a branch swings on its joint and settles — until an
    arrow snaps it (then it is a free body and falls). A reed wall (`breaks` 99) does not give. */
function obstacleOf(o, i) {
  if (isSmashKind(o.kind)) return smashThing(o, i);
  const [a, b] = o.kind === 'reed' ? [o.at, [o.at[0] + (o.lean ?? 0), o.at[1] - o.h]] : [o.from, o.to];
  if (o.kind === 'wall') return { kind: 'wall', a, b, breaks: null, bounce: o.bounce, body: null, broken: false };
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const body = Bodies.rectangle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len, o.kind === 'reed' ? 3 : 6,
    { angle, collisionFilter: GROUNDED, frictionAir: o.kind === 'reed' ? 0.06 : 0.04, density: 0.002, label: o.kind });
  const breaks = o.kind === 'reed' ? (o.breaks ?? BREAK_V) : (o.breaks ?? null);
  Body.setStatic(body, true); // static after, so a snap (setStatic false) gets its real mass back
  const t = { kind: o.kind, a, b, len, angle, breaks, body, broken: false };
  // The spring: a reed is quick and light (it whips back), a branch slow and heavy (it swings).
  if (!(breaks != null && breaks >= 99)) t.bend = { th: 0, w: 0, k: o.kind === 'reed' ? 0.02 : 0.006, c: o.kind === 'reed' ? 0.06 : 0.025 };
  return t;
}

/** One step of every held reed and branch: θ'' = −kθ − cθ', laid about its root. */
function springThings(world) {
  for (const t of world.things) {
    const b = t.bend;
    if (!b || t.broken || (!b.th && !b.w)) continue;
    b.w += -b.k * b.th - b.c * b.w;
    b.th += b.w;
    if (Math.abs(b.th) < 1e-4 && Math.abs(b.w) < 1e-4) { b.th = 0; b.w = 0; }
    const ang = t.angle + b.th, h = t.len / 2;
    Body.setAngle(t.body, ang);
    Body.setPosition(t.body, { x: t.a[0] + Math.cos(ang) * h, y: t.a[1] + Math.sin(ang) * h });
  }
}

/** A reed or branch's line as it stands now (it bends and swings): its root and its tip. */
function lineOf2(t) {
  if (!t.body || !t.bend || t.broken || (!t.bend.th && !t.bend.w)) return [t.a, t.b];
  const { x, y } = t.body.position, c = Math.cos(t.body.angle), s = Math.sin(t.body.angle), h = t.len / 2;
  return [[x - c * h, y - s * h], [x + c * h, y + s * h]];
}

/** A level's world, as it stands before any arrow: the ground and the things in the way. */
export function build(level) {
  const engine = Engine.create({ gravity: { x: 0, y: GRAVITY }, enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  // The ground is the banks' own line: the far bank, the slope up, his bank (groundAt).
  const ground = [Bodies.rectangle(165, GROUND + 30, 390, 60, { isStatic: true, collisionFilter: GROUND_HIT, label: 'ground', friction: 1 }),
    Bodies.rectangle(W / 2 + 230, BANK + 30, 220, 60, { isStatic: true, collisionFilter: GROUND_HIT, label: 'ground', friction: 1 }),
    Bodies.fromVertices(355, (GROUND + BANK) / 2 + 30, [[{ x: 330, y: GROUND }, { x: 380, y: BANK }, { x: 380, y: GROUND + 60 }, { x: 330, y: GROUND + 60 }]], { isStatic: true, collisionFilter: GROUND_HIT, label: 'ground', friction: 1 })];
  const things = (level.things ?? []).map(obstacleOf);
  const sensor = level.deer && !level.target ? deerSensor() : null;
  Composite.add(engine.world, [...ground, ...things.filter((t) => t.body).map((t) => t.body), ...(sensor ? [sensor] : [])]);
  const world = { engine, things, arrow: null, acc: 0, sensor, real: !level.target, score: 0, cues: [], cueN: 0 };
  listen(world);
  return world;
}

/** The pull → the arrow's velocity: `a` degrees above the level (toward the deer, left), `p` 0–1. */
export function velocityOf({ a, p }) {
  const r = (a * Math.PI) / 180, v = MIN_V + Math.max(0, Math.min(1, p)) * (MAX_V - MIN_V);
  return { x: -Math.cos(r) * v, y: -Math.sin(r) * v };
}

/** An arrow on the string, loosed: a body that only flies (it touches nothing matter knows). */
export function shoot(world, aim, proj = ARROW) {
  const v0 = velocityOf(aim), v = { x: v0.x * proj.speed, y: v0.y * proj.speed }, sp = Math.hypot(v.x, v.y) || 1;
  // A stone, a log, a pot by the stream (`real`): a body that strikes, bounces and rolls with the rest.
  const real = Boolean(proj.real && world.real);
  const body = real ? realBody(proj) : Bodies.rectangle(BOW[0], BOW[1], Math.max(4, proj.half * 2), 2, { collisionFilter: NONE, frictionAir: proj.drag, density: 0.001 });
  Composite.add(world.engine.world, body);
  cue(world, 'twang', BOW, Math.max(0.3, aim.p ?? 0.6), { proj: proj.id });
  Body.setAngle(body, Math.atan2(v.y, v.x));
  Body.setVelocity(body, v);
  world.arrow = { body, proj, real, dir: [v.x / sp, v.y / sp], true: true, path: [[BOW[0], BOW[1]]], tip: tipOf(body, proj.half), steps: 0 };
  return world;
}

/** A real throw's body: a stone round, a 柴 log long, a pot round and brittle. */
function realBody(proj) {
  const o = { collisionFilter: FILTER.proj, frictionAir: proj.drag ?? 0, label: 'proj', restitution: proj.restitution ?? 0.35, friction: 0.6, density: proj.density ?? 0.01 };
  const [w, h] = proj.size ?? [12, 12];
  return proj.shape === 'log' ? Bodies.rectangle(BOW[0], BOW[1], w, h, { ...o, chamfer: { radius: 3 } }) : Bodies.circle(BOW[0], BOW[1], w / 2, o);
}

/** The point that strikes: an arrow's or a blade's tip along its flight; a stone's middle. */
function tipOf(body, half = ARROW_HALF) {
  const a = body.angle;
  return [body.position.x + Math.cos(a) * half, body.position.y + Math.sin(a) * half];
}

/** One step of the world (1/60 s): wind on the arrow, matter moves it, then what it struck.
    Returns the arrow's event: null (flying), 'snap', 'turned', 'ground', 'water', 'out'. */
export function stepWorld(world, level, ms = 0) {
  const ar = world.arrow;
  world.t = (world.t ?? 0) + STEP_MS;
  // The wind pushes a light thing more: its accel is over the thing's mass.
  if (ar && ar.true && !ar.done) Body.setVelocity(ar.body, { x: ar.body.velocity.x + (WIND_ACC * windAt(level, ms)) / (ar.proj?.mass ?? 1), y: ar.body.velocity.y });
  if (world.sensor) placeSensor(world.sensor, level, ms);
  springThings(world);
  heavier(world);
  Engine.update(world.engine, STEP_MS);
  settleBlows(world);
  scoreMoves(world);
  if (ar?.stuckIn && !ride(world, ar)) { ar.stuckIn = null; ar.done = true; Body.setStatic(ar.body, true); }
  world.riders = (world.riders ?? []).filter((r) => ride(world, r));
  if (!ar || ar.done) return null;
  if (ar.real) return realStep(world, ar);
  if (ar.true) Body.setAngle(ar.body, Math.atan2(ar.body.velocity.y, ar.body.velocity.x));
  const from = ar.tip, to = tipOf(ar.body, ar.proj?.half ?? ARROW_HALF);
  ar.prev = from;
  ar.tip = to;
  ar.steps += 1;
  if (ar.steps % TRAIL_EVERY === 0) ar.path.push([n(to[0]), n(to[1])]);
  if (ar.stuckIn) return null; // riding what it stuck in
  return (ar.true ? smashed(world, from, to) ?? struck(world, from, to) : null) ?? landed(ar, to, world);
}

/** The stag's sensor follows it (its barrel), so what falls on it is heard. */
function placeSensor(sensor, level, ms) {
  if (!level.deer) return;
  const d = deerAt(level, ms);
  Body.setPosition(sensor, { x: d.x, y: groundAt(d.x) + BODY[1] * DEER_S });
}

/** The arrow's step against the smash bodies (the 柴垛, the rack, jars, the rock): what its material does. */
function smashed(world, from, to) {
  const hit = firstStruck(world, from, to);
  if (!hit) return null;
  const r = arrowAt(world, hit, world.arrow.proj ?? ARROW);
  if (r === 'stuck' || r === 'swallowed' || r === 'skim') { world.arrow.tip = hit.at; return 'stuck'; }
  return r; // 'glance' (off the rock, still flying) · 'broke' (through the clay, flying on)
}

/** A real throw's step: matter moved it and struck what it met; here only the stag, reeds and the end. */
function realStep(world, ar) {
  const from = ar.tip, to = [ar.body.position.x, ar.body.position.y];
  ar.prev = from;
  ar.tip = to;
  ar.steps += 1;
  if (ar.steps % TRAIL_EVERY === 0) ar.path.push([n(to[0]), n(to[1])]);
  if (ar.proj.shatters && ar.struckHard) return potBurst(world, ar);
  const ev = ar.true ? struck(world, from, to) : null;
  if (ev) return ev;
  const v = ar.body.velocity, slow = Math.hypot(v.x, v.y) < 0.12 && Math.abs(ar.body.angularVelocity) < 0.02;
  ar.still = slow ? (ar.still ?? 0) + 1 : 0;
  // Down on the bank it may roll on a while: the throw is over half a second after it lands (the
  // body stays in the world, rolling, a thing like the rest).
  const down = to[1] >= groundAt(to[0]) - (ar.proj.size?.[1] ?? 12) / 2 - 3;
  ar.downFor = down ? (ar.downFor ?? 0) + 1 : ar.downFor ?? 0;
  const out = to[0] < -30 || to[0] > W + 30 || to[1] > H + 20;
  if (out || ar.still > 8 || ar.body.isSleeping || ar.downFor > 30 || ar.steps > 600) {
    ar.done = true;
    ar.true = false;
    if (out) Body.setStatic(ar.body, true);
    return out ? 'out' : 'ground';
  }
  return null;
}

/** The clay pot breaks where it strikes: its shards fly, and what stands near takes the blow. */
function potBurst(world, ar) {
  const at = [ar.body.position.x, ar.body.position.y], v = ar.body.velocity;
  ar.done = true;
  ar.true = false;
  Composite.remove(world.engine.world, ar.body);
  Body.setStatic(ar.body, true);
  const pot = { kind: 'pot', body: ar.body, size: ar.proj.size ?? [16, 18], id: 97, broken: false };
  world.things.push(pot);
  pot.id = world.things.length - 1;
  shatterPot(world, pot, at, v);
  // A splash of what was in it: a short shove outward to every body near.
  for (const t of world.things) {
    if (!t.smash || t.broken || t.body.isStatic) continue;
    const dx = t.body.position.x - at[0], dy = t.body.position.y - at[1], d = Math.hypot(dx, dy);
    if (d < 46) { Sleeping.set(t.body, false); Body.setVelocity(t.body, { x: t.body.velocity.x + (dx / (d || 1)) * 1.6, y: t.body.velocity.y + (dy / (d || 1)) * 1.6 - 0.8 }); }
  }
  for (const t of world.things) if (t.kind === 'reed' && !t.broken && segCircle(...lineOf2(t), at, 26)) snap(world, t, { x: v.x * 0.5, y: -1.2 });
  return 'burst';
}
function shatterPot(world, pot, at, v) {
  // The pot as a smash thing for the moment it breaks (its painting cut, its shards flying).
  pot.smash = true;
  pot.home = at;
  pot.body = Bodies.circle(at[0], at[1], pot.size[0] / 2, { collisionFilter: FILTER.thing });
  shatter(world, pot, at, { x: v.x * 0.5, y: v.y * 0.5 });
}

function struck(world, from, to) {
  const t = world.things.find((x) => !x.smash && !x.broken && segSeg(from, to, ...lineOf2(x), x.kind === 'reed' ? 2.5 : 4));
  if (!t) return null;
  const ar = world.arrow, v = ar.body.velocity, speed = Math.hypot(v.x, v.y), proj = ar.proj ?? ARROW;
  if (t.kind === 'wall') return offWall(ar, t, v);
  // An arrow pierces reeds (up to its `pierce`) at any speed; a heavy stone knocks over what a
  // throw half as fast would snap; else only a fast throw. A reed wall (`breaks` 99) stops them all.
  const pierces = proj.pierce && t.breaks <= proj.pierce; // a reed no thicker than its `pierce`
  return t.breaks != null && (speed >= t.breaks || pierces || (proj.knock && speed >= t.breaks * 0.5)) ? snap(world, t, v) : turn(world, ar, t, v);
}

function snap(world, t, v) {
  t.broken = true;
  t.stub = t.kind === 'reed' ? [t.a, [t.a[0] + (t.b[0] - t.a[0]) * 0.3, t.a[1] + (t.b[1] - t.a[1]) * 0.3]] : null;
  scatter(world, world.arrow.tip, v);
  t.bend = null;
  cue(world, t.kind === 'reed' ? 'snap' : 'crack', world.arrow.tip, 1, { mat: t.kind });
  Sleeping.set(t.body, false);
  Body.setStatic(t.body, false);
  Body.setVelocity(t.body, { x: v.x * 0.25, y: v.y * 0.25 - 0.6 });
  Body.setAngularVelocity(t.body, Math.sign(v.x || 1) * 0.14);
  const proj = world.arrow.proj ?? ARROW, keep = proj.pierce ? 0.97 : proj.knock ? 0.75 : AFTER_BREAK;
  Body.setVelocity(world.arrow.body, { x: v.x * keep, y: v.y * keep });
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

/** Off a wall of rock (the cave's roof, its back): it bounces, slowed by the rock's `bounce`, and
    flies on — a stone in a cave still comes down somewhere and is heard. */
function offWall(ar, t, v) {
  const ux = t.b[0] - t.a[0], uy = t.b[1] - t.a[1], l = Math.hypot(ux, uy) || 1, nx = -uy / l, ny = ux / l;
  const dot = v.x * nx + v.y * ny, k = t.bounce ?? 0.5;
  Body.setVelocity(ar.body, { x: (v.x - 2 * dot * nx) * k, y: (v.y - 2 * dot * ny) * k });
  const [px, py] = ar.tip;
  Body.setPosition(ar.body, { x: ar.body.position.x + nx * Math.sign(-dot || 1) * 2, y: ar.body.position.y + ny * Math.sign(-dot || 1) * 2 });
  ar.fx = [...(ar.fx ?? []), { kind: 'bounce', at: [px, py] }];
  return 'wall';
}

/** Turned: off the thing's face, slowed; the arrow tumbles and is spent. */
function turn(world, ar, t, v) {
  const [ta, tb] = lineOf2(t), ux = tb[0] - ta[0], uy = tb[1] - ta[1], l = Math.hypot(ux, uy) || 1, nx = -uy / l, ny = ux / l;
  const dot = v.x * nx + v.y * ny;
  if (t.kind === 'branch') t.shake = 1;
  // The thing takes the blow: a reed bends and springs back, a branch swings on its joint.
  if (t.bend) t.bend.w += Math.sign(v.x * uy - v.y * ux || 1) * Math.min(0.09, Math.hypot(v.x, v.y) * 0.014) * (t.kind === 'reed' ? 1 : 0.6);
  cue(world, t.kind === 'reed' ? 'grass' : 'wood', ar.tip, 0.6, { mat: t.kind });
  Body.setVelocity(ar.body, { x: (v.x - 2 * dot * nx) * TURN, y: (v.y - 2 * dot * ny) * TURN });
  Body.setAngularVelocity(ar.body, 0.25);
  ar.true = false;
  return 'turned';
}

function landed(ar, [x, y], world = null) {
  const end = x < -30 || x > W + 30 || y > H + 20 ? 'out' : y >= groundAt(x) ? 'ground' : null;
  if (end === 'ground' && bounces(ar)) return 'bounce';
  if (end) { ar.done = true; Body.setStatic(ar.body, true); }
  if (end === 'ground' && world) cue(world, 'thud', [x, groundAt(x)], Math.min(1, Math.hypot(ar.body.velocity.x, ar.body.velocity.y) / 6), { angle: ar.body.angle });
  return end;
}

/** A stone skips once off the ground (its `bounce`), dust where it struck, and rolls on. */
function bounces(ar) {
  const proj = ar.proj ?? ARROW;
  if (!proj.bounce || ar.bounced || !ar.true) return false;
  const v = ar.body.velocity, gy = groundAt(ar.body.position.x);
  ar.bounced = true;
  Body.setPosition(ar.body, { x: ar.body.position.x, y: gy - 2 });
  Body.setVelocity(ar.body, { x: v.x * 0.7, y: -Math.abs(v.y) * proj.bounce });
  ar.tip = tipOf(ar.body, proj.half);
  ar.fx = [...(ar.fx ?? []), { kind: 'bounce', at: [ar.tip[0], gy] }];
  return true;
}

/** The tap in flight (its projectile's ability): a dash on, or a burst where it is — a burst
    snaps every reed in its reach and judges the deer by the radius. → the burst's hit, or null. */
export function tapWorld(world, level, ms) {
  const ar = world.arrow, r = tapNow(ar, ar?.body.velocity);
  if (!r) return null;
  if (r.velocity) Body.setVelocity(ar.body, r.velocity);
  if (r.fx) ar.fx = [...(ar.fx ?? []), { ...r.fx, t: world.t ?? 0 }];
  if (!r.burst) return { kind: 'dash' };
  const [bx, by] = r.burst.at, reach = r.burst.r;
  for (const t of world.things) if (!t.broken && t.kind === 'reed' && segCircle(t.a, t.b, [bx, by], reach)) snap(world, t, { x: 0.5, y: -1.5 });
  ar.true = false;
  ar.done = true;
  Body.setStatic(ar.body, true);
  return { kind: 'burst', hit: burstHit(level, ms, [bx, by], reach) };
}

/** What a burst at `at` with reach `r` (world units) catches of the deer: 'clean' (the heart in
    reach), 'body', or null. */
export function burstHit(level, ms, [x, y], r) {
  if (!level.deer) return null; // only the stag is judged by a burst's reach yet
  const d = deerAt(level, ms), gy = groundAt(d.x);
  const lx = ((x - d.x) * d.face) / DEER_S, ly = (y - gy) / DEER_S, lr = r / DEER_S;
  if (Math.hypot(lx - HEART[0], ly - HEART[1]) <= HEART_R + lr * 0.9) return 'clean';
  const [cx, cy, rx, ry] = BODY;
  return ((lx - cx) / (rx + lr)) ** 2 + ((ly - cy) / (ry + lr)) ** 2 <= 1 ? 'body' : null;
}

/** What a step may say while the throw still flies: a reed snapped, a skip, a glance off rock, clay broken through. */
const GOES_ON = new Set(['snap', 'bounce', 'wall', 'glance', 'broke']);

/** A shot flown in a fresh world, against the deer as it moves from `at` ms: the bot's search
    and the tests use it — the same steps the game takes. → { hit, steps, tip, snapped } */
export function flight(level, aim, at = 0, limit = 600, { proj = ARROW, tapAt = null } = {}) {
  const world = shoot(build(level), aim, proj);
  let snapped = 0;
  for (let k = 1; k <= limit; k++) {
    if (k === tapAt) {
      const r = tapWorld(world, level, at + k * STEP_MS);
      if (r?.kind === 'burst') return { hit: r.hit, end: r.hit ? null : 'burst', steps: k, tip: world.arrow.tip, snapped };
    }
    const ev = stepWorld(world, level, at + k * STEP_MS);
    if (ev === 'snap') snapped++;
    const hit = world.arrow.true ? targetHit(level, at + k * STEP_MS, world.arrow.prev, world.arrow.tip) : null;
    if (hit === 'glance') return { hit: null, end: 'glance', steps: k, tip: world.arrow.tip, snapped };
    if (hit) return { hit, steps: k, tip: world.arrow.tip, snapped };
    const landedHit = ev === 'ground' ? targetOf(level)?.land?.(level, world.arrow.tip) : null; // a stone in the cave
    if (landedHit) return { hit: landedHit, steps: k, tip: world.arrow.tip, snapped };
    if (ev && !GOES_ON.has(ev)) return { hit: null, end: ev, steps: k, tip: world.arrow.tip, snapped, world };
  }
  return { hit: null, end: 'out', steps: limit, tip: world.arrow.tip, snapped };
}

/* ── The game ──────────────────────────────────────────────────────────────────────────────── */

const levelOf = levelNow;

function lay(s, li) {
  const world = build(s.levels[li]);
  watch(s.seed, world);
  const ammo = trayOf(s.levels[li], s.kit, s.owned), pick = ammo.includes(s.pick) ? s.pick : ammo[0];
  return withWind({ ...s, li, ammo, pick, phase: 'aim', t: 0, clock: 0, used: 0, pull: null, world, stuck: [], flushAt: null, points: 0, trail: s.li === li ? s.trail : null, said: null, slowAt: null, alertAt: null, hint: s.li === li ? s.hint : false });
}

export function newGame(seed, _level = 1, deal = {}) {
  const levels = Array.isArray(deal?.levels) ? deal.levels : [];
  const s = { seed: String(seed), live: levels.length > 0, levels, li: 0, phase: 'aim', t: 0, clock: 0, wall: 0,
    misses: levels.map(() => 0), best: levels.map(() => 0), used: 0, won: false, stars: 0, grade: null, still: Boolean(deal?.still), art: deal?.art ?? null,
    kit: deal?.projectiles ?? null, owned: Array.isArray(deal?.owned) ? deal.owned : null, grades: deal?.grades ?? null,
    words: deal?.words ?? null }; // a row's own lines over the deer's (games.json `words`: end, gone — the cave is no stream)
  return levels.length ? lay(s, 0) : { ...s, phase: 'empty' };
}

/** Stars for a level won with `used` arrows: one 3, two 2, more 1. */
export const starsFor = (used) => (used <= 1 ? 3 : used === 2 ? 2 : 1);
/** The beat's stars: the levels' best, averaged and rounded (0 while any is unwon). */
export const starsOf = (s) => (s.best.every((b) => b > 0) ? Math.round(s.best.reduce((a, b) => a + b, 0) / s.best.length) : 0);
export const gradeOf = (stars) => (stars >= 3 ? 'clean' : stars === 2 ? 'steady' : 'rough');
/** Stuck: the same level's quiver emptied again and again. */
export const stuck = (s) => !s.won && (s.misses?.[s.li] ?? 0) >= STUCK_MISSES;

/** The pull from a press at (x0, y0) to a pointer at (x, y): a slingshot about the bow. The hand is
    the string — it is drawn where the hand is — and the shot goes from the hand through the bow:
    the hand below-right of the bow sends it up-left, above-right sends it down-left (Hanli 10-19,
    his pick after the string was drawn on the other side of his hand: 「弹弓式」). A hand toward the
    deer still draws (the pull's length from the press is the power) but never turns the bow round. */
export function aimOf(x0, y0, x, y) {
  const back = Math.abs(x - BOW[0]), down = y - BOW[1], len = Math.hypot(x - x0, y - y0);
  const a = (Math.atan2(down, Math.max(back, 12)) * 180) / Math.PI;
  return { a: Math.max(-30, Math.min(85, a)), p: Math.min(1, len / MAX_PULL) };
}

const canAim = (s) => s.phase === 'aim';

/** While the knocked things still come down he need not wait: past a short beat, a press takes
    up the next throw at once (the bot, which plays by the clock, waits for the world to rest). */
const EAGER_MS = 500;
const takeUp = (s) => (s.phase === 'settle' && s.t >= EAGER_MS ? reload(s) : s);

function hold(s, d) {
  if (s.phase === 'fly') return tap(s); // a press in flight is the tap
  s = takeUp(s);
  if (!canAim(s) || !Number.isFinite(Number(d.x))) return null;
  return { ...s, press: [Number(d.x), Number(d.y)], pull: { a: 15, p: 0 } };
}
function move(s, d) {
  if (!canAim(s) || !s.press || !Number.isFinite(Number(d.x))) return null;
  const pull = aimOf(s.press[0], s.press[1], Number(d.x), Number(d.y));
  // The bow creaks as the string comes back: once at a third, two thirds, and full.
  const notch = (p) => (p >= 0.98 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0);
  if (s.world && notch(pull.p) > notch(s.pull?.p ?? 0)) cue(s.world, 'creak', BOW, pull.p);
  return { ...s, pull };
}
/** Drawn directly to an aim (the bot, the tests; a keyboard later): `a` degrees, `p` 0–1. */
function draw(s, d) {
  if (!canAim(s)) return null;
  return { ...s, pull: { a: Math.max(-30, Math.min(85, Number(d.a) || 0)), p: Math.max(0, Math.min(1, Number(d.p) || 0)) } };
}

function loose(s) {
  if (!canAim(s) || !s.pull) return null;
  if (s.pull.p < MIN_POWER) return { ...s, pull: null, press: null };
  const proj = projectileOf(s.kit, s.pick);
  // The slow beat is foretold only for a throw with no tap: a tap changes the flight.
  const ahead = proj.ability ? null : flight(levelOf(s), s.pull, s.clock, 600, { proj });
  shoot(s.world, s.pull, proj);
  const slowAt = ahead?.hit === 'clean' ? Math.max(0, ahead.steps - SLOW_STEPS) : null;
  return { ...s, phase: 'fly', t: 0, used: s.used + 1, aimed: s.pull, pull: null, press: null, said: null, slowAt, shots: (s.shots ?? 0) + 1 };
}

/** The tap in flight: the projectile's one ability, once. A burst ends the throw where it is. */
function tap(s) {
  if (s.phase !== 'fly') return null;
  const r = tapWorld(s.world, levelOf(s), s.clock);
  if (!r) return null;
  if (r.kind !== 'burst') return { ...s, said: 'dash', saidAt: s.clock };
  return r.hit ? clean(s, r.hit === 'body') : land(s, 'burst');
}

/** Choose what to throw (the tray), between throws. */
const pickVerb = (s, d) => ((s = takeUp(s)), canAim(s) && s.ammo?.includes(d.p) && d.p !== s.pick ? { ...s, pick: d.p, pull: null, press: null } : null);

const VERBS = {
  hold, move, draw, tap, pick: pickVerb,
  release: loose, loose,
  // 重来 keeps the last arrow's trail (as 愤怒小鸟 does): the try before is what the next one learns from.
  retry: (s) => (['aim', 'fly', 'clear', 'gone', 'spook', 'settle'].includes(s.phase) ? lay({ ...s, trail: s.world.arrow?.path ?? s.trail }, s.li) : null),
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
  const hit = ar.true ? targetHit(level, s.clock, ar.prev, ar.tip) : null;
  if (hit === 'glance') return glance(s);
  // By the creek's smash levels a stone or a pot only startles the stag (it bolts, comes back); a
  // thrown 柴 log fells it; the arrow is the hunter's.
  if (hit && level.smash && ar.real) return ar.proj.id === 'log' ? clean({ ...s, said: 'felled' }, true, 'felled') : graze(s);
  if (hit) return hit === 'graze' ? graze(s) : clean(s, hit === 'body');
  if (ev === 'snap') return { ...s, said: 'snap', saidAt: s.clock };
  if (ev === 'turned') return { ...s, said: 'turned', saidAt: s.clock };
  const landedHit = ev === 'ground' ? targetOf(level)?.land?.(level, ar.tip) : null;
  if (landedHit) return clean(s, landedHit === 'body');
  return ev && !GOES_ON.has(ev) ? land(s, ev) : s;
}

/** Stars for the level's hit: by arrows used (one 3, two 2, more 1), a star fewer off the heart. */
export const starsForHit = (used, offHeart = false) => Math.max(1, starsFor(used) - (offHeart ? 1 : 0));

/** A hit: the heart (`offHeart` false) or the body — either way the deer is off and the level done. */
function clean(s, offHeart = false, how = null) {
  const ar = s.world.arrow, level = levelOf(s);
  if (ar) ar.done = true;
  const d = level.deer ? deerAt(level, s.clock) : null;
  const at = ar && how !== 'felled' ? ar.tip : d ? [d.x, groundAt(d.x) + BODY[1] * DEER_S] : [W / 2, H / 2];
  // A smash level scores by what he broke, the stag, and every throw left (愤怒小鸟's way).
  const points = level.score ? (s.world.score ?? 0) + (offHeart ? 2000 : 3000) + Math.max(0, quiverOf(s) - s.used) * 500 : null;
  const won = level.score ? starsForScore(level.score, points) : starsForHit(s.used, offHeart);
  const best = s.best.map((b, i) => (i === s.li ? Math.max(b, won) : b));
  if (s.world) cue(s.world, 'hit', at, offHeart ? 0.7 : 1, { heart: !offHeart, how });
  return { ...s, phase: 'hit', t: 0, best, at, deerGone: d, trail: ar?.path ?? s.trail, said: how ?? (offHeart ? 'body' : 'clean'), offHeart, points, levelStars: won };
}

/** Stars for a smash level's points: its `score` [one, two, three] thresholds (one at least). */
export const starsForScore = (score, points) => Math.max(1, score.filter((x) => points >= x).length);

/** The hide turns the blade (the 鯥): spent, the next at once — wait for the breath. */
function glance(s) {
  const ar = s.world.arrow;
  ar.true = false;
  return land({ ...s, said: 'glance' }, 'glance');
}

function graze(s) {
  const ar = s.world.arrow;
  ar.done = true;
  return { ...s, phase: 'spook', t: 0, at: ar.tip, deerGone: deerAt(levelOf(s), s.clock), trail: ar.path, said: 'graze', grazes: (s.grazes ?? 0) + 1 };
}

/** Landed in the grass (or the stream): no pause — the next arrow is on the string at once; the
    spent one stays where it stuck, and a near one makes the deer look up. */
function land(s, ev) {
  const level = levelOf(s), ar = s.world.arrow, tx = level.deer ? deerAt(level, s.clock).x : level.target?.x ?? midOf(level.target?.deep);
  const near = level.deer && Math.abs(ar.tip[0] - tx) < 80;
  const said = ['turned', 'glance'].includes(s.said) ? s.said : ar.tip[0] < tx ? 'long' : 'short';
  const stuck = ev === 'out' || ev === 'burst' || ar.stuckIn || (ar.real && !ar.body.isStatic) ? s.stuck : [...s.stuck, [n(ar.body.position.x), n(ar.body.position.y), n((ar.body.angle * 180) / Math.PI), ar.proj?.id ?? 'arrow']];
  if (said === 'long' && ev === 'ground' && level.deer) cue(s.world, 'splash', [ar.tip[0], ar.tip[1] + 4], 1);
  const next = { ...s, trail: ar.path, said: ev === 'stuck' ? 'stuck' : said, stuck, alertAt: near ? s.clock : s.alertAt, hint: s.hint || Boolean(level.hint) };
  // A smash level waits for what he knocked to come down before the next throw.
  return smashy(level) ? { ...next, phase: 'settle', t: 0 } : reload(next);
}

const midOf = (r) => (r ? (r[0] + r[1]) / 2 : W / 2);

/** How many throws a level gives: a smash level its own `quiver`, else four. */
export const quiverOf = (s) => s.levels?.[s.li]?.quiver ?? QUIVER;
/** A smash level (things that topple and break): it waits for the world to settle between throws. */
const smashy = (level) => (level?.things ?? []).some((t) => isSmashKind(t.kind));

/** After a shot that did not end the level: aim again, or (the quiver empty) the deer is gone. */
const reload = (s) => (s.used >= quiverOf(s) ? { ...s, phase: 'gone', t: 0, said: 'gone', misses: s.misses.map((m, i) => (i === s.li ? m + 1 : m)) } : withWind(clearArrow({ ...s, phase: 'aim', t: 0 })));

function clearArrow(s) {
  const ar = s.world.arrow;
  // One stuck in a log rides it on (the log may still roll): kept, with the rest it rode.
  if (ar?.stuckIn) s.world.riders = [...(s.world.riders ?? []), ar];
  else if (ar?.real && !ar.body.isStatic) s.world.thrown = [...(s.world.thrown ?? []), ar]; // a stone, a log: still in the world
  else if (ar) Composite.remove(s.world.engine.world, ar.body);
  s.world.arrow = null;
  return s;
}

function advance(s) {
  if (s.li + 1 < s.levels.length) return lay({ ...s, trail: null, hint: false, flushAt: null }, s.li + 1);
  const stars = starsOf(s);
  // A row may name its grades by stars (the task's marks: 扔石听声 sure · lucky, 鯥 still · hasty).
  return { ...s, phase: 'end', live: false, won: true, stars, grade: s.grades?.[stars] ?? gradeOf(stars) };
}

/** The deer bolts and, a while later, is back at the stream where its schedule starts again. */
const backAgain = (s) => withWind(clearArrow({ ...s, phase: s.used >= quiverOf(s) ? 'gone' : 'aim', t: 0, clock: 0, alertAt: null, flushAt: null, said: s.used >= quiverOf(s) ? 'gone' : s.said }));

/** The level's stars ring: a chime, a pop for each star (juice.js plays them). */
function chimed(s) {
  if (s.world) { cue(s.world, 'chime', [W / 2, H / 2], 1); for (let i = 0; i < (s.best[s.li] ?? 0); i++) cue(s.world, 'pop', [W / 2, H / 2], 0.6, { i }); }
  return s;
}
const SETTLE_MIN = 350, SETTLE_MAX = 3500;
const PHASES = {
  aim: (s) => (stepWorld(s.world, levelOf(s), s.clock), s),
  fly: flying,
  // What he knocked comes down; the next throw when it lies still (never more than 3.5 s).
  settle: (s) => (stepWorld(s.world, levelOf(s), s.clock), (s.t >= SETTLE_MIN && atRest(s.world)) || s.t >= SETTLE_MAX ? reload(s) : s),
  spook: (s) => (stepWorld(s.world, levelOf(s), s.clock), s.t < SPOOK_MS ? s : backAgain(s)),
  hit: (s) => (s.t < HIT_MS ? s : chimed({ ...s, phase: 'clear', t: 0 })),
  // Three stars go on by themselves; fewer wait for 下一处 or 再来.
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
    s = felt(s);
    if (s.world) s.world.drift = (s.world.drift ?? 0) + windAt(levelOf(s), s.clock) * STEP_MS;
  }
  s.world.wall = globalThis.performance?.now() ?? 0;
  s.world.clock = s.clock;
  s.world.phase = s.phase;
  s.world.art = s.art;
  s.world.level = levelOf(s);
  s.world.rate = slowness(s);
  return s;
}

const NOISE_R = 140;
/** What fell on the stag: a light blow flushes it (it bolts into the open), a heavy one fells it. */
function felt(s) {
  const w = s.world, level = s.levels[s.li];
  if (!w || !level?.deer || !['aim', 'fly', 'settle'].includes(s.phase)) return s;
  if ((w.deerBlow ?? 0) > 0) {
    w.deerBlow = 0;
    if (s.phase === 'fly') s.world.arrow.done = true;
    return clean({ ...s, said: 'felled' }, true, 'felled');
  }
  // A crash near it (a jar, a stack of tiles, a 草垛 bursting) startles it as surely as a blow.
  const d = deerAt(levelOf(s), s.clock);
  const heard = (w.broke ?? []).slice(w.heardBroke ?? 0).some((b) => !b.topple && Math.abs(b.at[0] - d.x) < NOISE_R);
  w.heardBroke = (w.broke ?? []).length;
  if (heard) w.flushed = true;
  if (w.flushed && s.flushAt == null && level.deer.flee) {
    cue(w, 'bolt', [deerAt(levelOf(s), s.clock).x, groundAt(level.deer.x) - 30], 1);
    return { ...s, flushAt: s.clock, said: 'flushed', saidAt: s.clock };
  }
  return s;
}

const STOP = 7, STOP_MS = 50, BREAK_STOP = 3;
const calm = (s) => Boolean(s?.still) || still();

/** The slow-motion beat (a clean hit): the last steps before the arrow lands, and the burst's first
    moments, take SLOW times as long — only the screen's time; the world steps the same. */
function slowness(s) {
  if (calm(s)) return 1;
  if (s.phase === 'fly' && s.slowAt != null && (s.world.arrow?.steps ?? 0) >= s.slowAt) return SLOW;
  // The heart hit: a beat held (hit-stop), then slow; a big break holds a shorter beat.
  if (s.phase === 'hit' && s.t < STOP_MS && !s.offHeart) return STOP;
  if (s.world?.stopUntil != null && (s.world.t ?? 0) < s.world.stopUntil) return BREAK_STOP;
  return s.phase === 'hit' && s.t < SLOW_HIT_MS ? SLOW : 1;
}

/* ── The picture (PLACEHOLDER strokes for the deer, the bow and the arrow) ─────────────────── */

const groundPts = () => { const pts = []; for (let x = 0; x <= W; x += 20) pts.push(`${x} ${n(groundAt(x))}`); return pts; };
const WATER_D = `M0 ${WATER[0][1] - 4} Q 80 ${WATER[0][1] - 9} 160 ${WATER[0][1] - 4} T 320 ${WATER[0][1] - 4} L330 ${GROUND + 6} V${H} H0Z`;
const bankD = () => `M${groundPts().join(' L')} V${H} H0Z`;

/** The stream and the banks: painted (games.json `art`: `backdrop` the 黑松岭 creek behind,
    `bank` and `water` cut from it into the ground and the stream), else drawn in ink. */
export function bankPicture(s) {
  const a = s.art, id = clipId(s);
  if (!a?.backdrop) return inkBank();
  const clip = (name, d) => `<clipPath id="${id}-${name}"><path d="${d}"/></clipPath>`;
  // The whole board is the painting; a paper wash over its far half quiets it behind the deer.
  return `<defs>${clip('bank', bankD())}${clip('water', WATER_D)}<linearGradient id="${id}-wash" x1="0" y1="0" x2="0" y2="1">`
    + '<stop offset="0" stop-color="#f4ecdc" stop-opacity=".55"/><stop offset=".7" stop-color="#f4ecdc" stop-opacity=".25"/><stop offset="1" stop-color="#f4ecdc" stop-opacity="0"/></linearGradient></defs>'
    + cropped(a.backdrop, 0, 0, W, H, 'g-da-backdrop') + `<rect class="g-da-wash" width="${W}" height="${H}" style="fill:url(#${id}-wash)"/>`
    + localWash(a.backdrop.wash, id)
    + (a.bank ? `<g clip-path="url(#${id}-bank)">${cropped(a.bank, 0, BANK - 30, W, H - BANK + 30, 'g-da-bankart')}</g>` : '')
    + (a.water ? `<g clip-path="url(#${id}-water)">${cropped(a.water, 0, WATER[0][1] - 10, 330, H - WATER[0][1] + 10, 'g-da-waterart')}</g>` : '');
}

function inkBank() {
  const ripples = [40, 120, 210].map((x, i) => `<path class="g-da-ripple" d="M${x} ${WATER[0][1] + 10 + i * 6} q12 -3 24 0"/>`).join('');
  return `<path class="g-da-hill" d="M0 160 C90 130 170 150 260 120 C330 100 400 128 ${W} 112 V${H} H0Z"/>`
    + `<path class="g-da-ground" d="${bankD()}"/><path class="g-line g-thin g-faint" d="M${groundPts().join(' L')}"/>`
    + `<path class="g-da-water" d="${WATER_D}"/>${ripples}`;
}

/** Paper laid lightly where the play must read (Hanli 10-16: 「背景导致看不清弓和轨迹」 — 「但是更好看了」,
    so only there): `archer` {at, r: [rx, ry], o} a feathered round of paper behind the bow, `path`
    {y: [top, bottom], o} a feathered band where the arrows fly. Both from games.json. */
function localWash(w, id) {
  if (!w) return '';
  const fade = (gid, o, radial) => `<${radial ? 'radialGradient' : 'linearGradient x1="0" y1="0" x2="0" y2="1"'} id="${id}-${gid}">`
    + (radial ? `<stop offset="0" stop-color="#f6efe0" stop-opacity="${o}"/><stop offset=".55" stop-color="#f6efe0" stop-opacity="${n(o * 0.7, 2)}"/><stop offset="1" stop-color="#f6efe0" stop-opacity="0"/></radialGradient>`
      : `<stop offset="0" stop-color="#f6efe0" stop-opacity="0"/><stop offset=".5" stop-color="#f6efe0" stop-opacity="${o}"/><stop offset="1" stop-color="#f6efe0" stop-opacity="0"/></linearGradient>`);
  const band = w.path ? `<rect class="g-da-wash" x="0" y="${w.path.y[0]}" width="${W}" height="${w.path.y[1] - w.path.y[0]}" style="fill:url(#${id}-path)"/>` : '';
  const round = w.archer ? `<ellipse class="g-da-wash" cx="${w.archer.at[0]}" cy="${w.archer.at[1]}" rx="${w.archer.r[0]}" ry="${w.archer.r[1]}" style="fill:url(#${id}-archer)"/>` : '';
  return `<defs>${w.path ? fade('path', w.path.o, false) : ''}${w.archer ? fade('archer', w.archer.o, true) : ''}</defs>${band}${round}`;
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
const FAR_TUFTS = [[16, GROUND + 3, 30], [26, GROUND + 3, 38], [296, GROUND + 4, 30], [305, GROUND + 4, 56], [313, GROUND + 4, 34]];
const RAG_REED = FAR_TUFTS[3]; // the red rag: on the far bank, mid-board, never behind the bow

/** The wind, read: a red rag tied to the tallest reed by the stream, the reeds leaning,
    and leaves drifting the way it blows now. No post: the reed is the post. */
export function windPicture(level, s) {
  if (level.indoor) return ''; // in a cave: no rag, no reeds, no leaves
  const t = calm(s) ? 0 : s.clock, w = windAt(level, s.clock), flutter = calm(s) ? 0 : Math.sin(t / 140) * (1 + 3 * Math.abs(w));
  const lean = Math.max(-1, Math.min(1, w)), sway = calm(s) ? 0 : Math.sin(t / 380) * (0.3 + Math.abs(w));
  const tuft = (list) => list.map(([x, y, h], i) => tuftReed(s.art?.reed, x, y, h, lean * 16 + sway * (1 + i * 0.3))).join('');
  const [rx, ry, rh] = RAG_REED, tip = tipOf2(rx, ry, rh, lean * 16 + sway * 1.3);
  // Leaves stream across with the wind: more of them, and faster, the stronger it blows; none in a calm.
  const count = Math.abs(w) < 0.06 ? 0 : Math.min(9, 2 + Math.round(Math.abs(w) * 9));
  const drift = calm(s) ? 0 : s.world?.drift ?? 0;
  const leaves = Array.from({ length: count }, (_, i) => leafAt(i, drift, t, s.art?.leaf)).join('');
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

function leafAt(i, carried, t, art = null) {
  const span = W + 60, x = ((i * 113 + carried * 0.11 * (1 + (i % 3) * 0.25)) % span + span) % span - 30;
  const y = 40 + ((i * 47) % 190) + Math.sin(t / 500 + i) * 8, at = `translate(${n(x)} ${n(y)}) rotate(${n(t / 9 + i * 50)})`;
  if (art?.file) return `<g class="g-da-leaf-art" transform="${at}">${sprite({ ...art, w: 11, h: 11, at: [0.5, 0.5] }, 0.9)}</g>`;
  return `<path class="g-da-leaf" d="M0 0 q5 -5 12 0 q-5 5 -12 0Z" transform="${at}"/>`;
}

function thingPicture(t, s) {
  if (t.smash) return t.broken ? '' : smashPicture(t, s);
  // A wall of rock is the painting's own (the cave); in ink, a faint line where it stands.
  if (t.kind === 'wall') return s.art?.backdrop ? '' : `<path class="g-tg-wall" d="M${n(t.a[0])} ${n(t.a[1])} L${n(t.b[0])} ${n(t.b[1])}"/>`;
  const { x, y } = t.body.position, len = Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1]);
  const sway = t.kind === 'reed' && !t.broken && !calm(s) ? Math.sin(s.clock / 420 + x) * 1.2 : 0;
  const shiver = t.shake && !calm(s) ? Math.sin(s.clock / 30) * 2 * Math.max(0, 1 - (s.t / 600)) : 0;
  const from = t.stub ? -len / 2 + len * 0.3 : -len / 2; // snapped: the top flies, the stub stands
  const deg = (t.body.angle * 180) / Math.PI + sway, art = s.art?.[t.kind];
  const body = art ? lengthSprite(art, from, len / 2, Math.cos(t.body.angle) < 0) : inkThing(t, from, len);
  return `${stubPicture(t, s)}<g transform="translate(${n(x)} ${n(y + shiver)}) rotate(${n(deg)})">${body}</g>`;
}

/** A smash body: its painting (games.json `art`, by KINDS[kind].art) laid on the body, turned with it;
    PLACEHOLDER ink while its painting is missing. `data-body` lets the painter carry it between steps. */
function smashPicture(t, s) {
  const { x, y } = t.body.position, deg = (t.body.angle * 180) / Math.PI, [w, h] = t.size;
  return `<g class="g-sm-thing g-sm-${t.kind}" data-body="${t.id}" transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})">${bodyArt(s, t.kind, w, h)}</g>`;
}
/** A painted piece filling a w × h box about the origin (or its ink stand-in). */
function bodyArt(s, kind, w, h) {
  const a = s.art?.[KINDS[kind]?.art ?? kind];
  if (a?.file) return `<image class="g-da-sprite" href="${artUrl(a.file)}" x="${n(-w / 2 - (a.pad ?? 0) * w)}" y="${n(-h / 2 - (a.padY ?? a.pad ?? 0) * h)}" width="${n(w * (1 + 2 * (a.pad ?? 0)))}" height="${n(h * (1 + 2 * (a.padY ?? a.pad ?? 0)))}" preserveAspectRatio="none"/>`;
  return `<rect class="g-sm-ink is-${KINDS[kind]?.mat ?? 'wood'}" x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" rx="${kind === 'jar' || kind === 'hay' ? n(Math.min(w, h) * 0.4) : 1.5}"/>`;
}

/** The shards of what broke: each a cut of the same painting (clipped to its piece), tumbling. */
function shardsPicture(s) {
  const id = clipId(s);
  return (s.world.frags ?? []).map((f, i) => {
    const { x, y } = f.body.position, deg = ((f.body.angle + f.ang0) * 180) / Math.PI, [w, h] = f.size;
    const pts = f.poly.map(([px, py]) => `${n(px)},${n(py)}`).join(' ');
    return `<g class="g-sm-shard" data-frag="${i}" transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})"><clipPath id="${id}-f${i}"><polygon points="${pts}"/></clipPath>`
      + `<g clip-path="url(#${id}-f${i})"><g transform="translate(${n(-f.off[0])} ${n(-f.off[1])})">${bodyArt(s, f.kind === 'pot' ? 'jar' : f.kind, w, h)}</g></g></g>`;
  }).join('');
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
export const artUrl = (file) => new URL(`../../worlds/jiuding/art/${file}`, import.meta.url).href;
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
export function bowPicture(s) {
  const pull = s.phase === 'aim' ? s.pull : null, p = pull?.p ?? 0;
  // Just loosed: the bow stays on the line it shot along and kicks back, the string ringing.
  const since = s.phase === 'fly' && s.aimed ? s.t : null, kick = since != null && since < RECOIL_MS && !calm(s) ? 1 - since / RECOIL_MS : 0;
  const a = pull ? pull.a : kick ? s.aimed.a : 12;
  // The tension: the limbs bend in and the tips come back as the string stretches; it trembles more
  // the further it comes, and hard at full.
  const back = 4 + p * 30, bend = 14 + p * 12, tipX = 4 - p * 7, tipY = 28 - p * 4;
  const shake = calm(s) || !pull ? 0 : n(Math.sin(s.clock / 23) * (p >= 0.98 ? 1.2 : p * p * 0.6));
  const recoil = kick ? n(-7 * kick * Math.cos(since / 30)) : 0, ring = kick ? n(Math.sin(since / 9) * 2.4 * kick) : 0;
  const nocked = s.phase !== 'aim' ? '' : nockedShape(s, p, back);
  // Painted (bow_rest → bow_drawn, cross-faded by the pull; each painted pointing right, the grip
  // at its `at`), else drawn: the limbs bend in and the string comes back with the pull.
  if (projectileOf(s.kit, s.pick).shape !== 'arrow') return handPicture(s, p, a, back) + (pull && p >= MIN_POWER ? readPicture(p, a) : '');
  const bow = s.art?.bow_rest || s.art?.bow_drawn
    ? paintedBow(s.art, p)
    : `<path class="g-da-limb" d="M${n(tipX)} ${n(-tipY)} Q${n(bend)} 0 ${n(tipX)} ${n(tipY)}"/>`
      + `<path class="g-da-string${p > 0 ? ' is-taut' : ''}" d="M${n(tipX)} ${n(-tipY)} L${n(4 - back)} 0 L${n(tipX)} ${n(tipY)}"/>`;
  // Mirrored (it points left), so the screen's clockwise rotate takes −a: local +x then runs along
  // (−cos a, −sin a), the launch vector (velocityOf) — up for a > 0. Hanli 10-16: it pointed down.
  const strum = kick ? `<path class="g-da-string is-ring" d="M2 -26 Q${n(-3 + ring)} 0 2 26"/>` : '';
  return `<g class="g-da-bow${p >= 0.98 ? ' is-full' : ''}" transform="translate(${BOW[0]} ${n(BOW[1] + shake)}) scale(-1 1) rotate(${n(-a)})${recoil ? ` translate(${recoil} 0)` : ''}">${bow}${nocked}${strum}</g>`
    + (pull && p >= MIN_POWER ? readPicture(p, a) : '');
}
const RECOIL_MS = 200;

/** The pull, read: an ink arc round his hand filling with the power, and the power and angle. */
function readPicture(p, a) {
  const r = 40, from = Math.PI * 0.62, to = from + Math.PI * 0.76 * p, [cx, cy] = [BOW[0] + 6, BOW[1]];
  const pt = (t) => `${n(cx + Math.cos(t) * r)} ${n(cy + Math.sin(t) * r)}`;
  return `<path class="g-da-read-bed" d="M${pt(from)} A${r} ${r} 0 0 1 ${pt(from + Math.PI * 0.76)}"/>`
    + `<path class="g-da-read${p >= 0.98 ? ' is-full' : ''}" d="M${pt(from)} A${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(to)}"/>`
    + `<text class="g-da-read-num" x="${n(cx)}" y="${n(cy + r + 13)}" text-anchor="middle">${Math.round(p * 100)}% · ${Math.round(a)}°</text>`;
}

/** The nocked arrow: fading as the painted drawn bow (which holds its own) comes in, or on the string. */
function nockedShape(s, p, back) {
  return s.art?.bow_drawn ? `<g opacity="${n(Math.max(0, 1 - p * 2.5), 2)}">${arrowShape(s.art, 16)}</g>` : arrowShape(s.art, -back + 16);
}

/** A thing thrown by hand (a stone, a sword, a talisman): no bow — the hand drawn back along the
    pull, the thing in it, an arm's arc, over the same soft light. */
function handPicture(s, p, a, back) {
  const proj = projectileOf(s.kit, s.pick), held = s.phase === 'aim';
  const arm = `<path class="g-tk-arm" d="M10 0 Q${n(-back * 0.4)} ${n(-10 - p * 8)} ${n(-back)} 0"/>`;
  const thing = held ? `<g transform="translate(${n(-back)} 0)">${shapeOf(proj)}</g>` : '';
  return `<g class="g-da-bow g-tk-hand" transform="translate(${BOW[0]} ${BOW[1]}) scale(-1 1) rotate(${n(-a)})"><ellipse class="g-da-halo" cx="-10" cy="0" rx="34" ry="30"/>${arm}${thing}</g>`;
}

/** The painted bow in his hand: at rest until he pulls, then drawn — the drawn painting widening
    from its grip as the pull grows (the string comes back, the limbs bend), never two ghosts. A
    soft light behind it, so it reads over the painted grass. */
function paintedBow(art, p) {
  const drawn = art.bow_drawn && p >= 0.12 ? art.bow_drawn : null, a = drawn ?? art.bow_rest ?? art.bow_drawn;
  const stretch = drawn ? 0.62 + 0.38 * Math.min(1, p) : 1;
  const halo = `<ellipse class="g-da-halo" cx="${n(-a.w * 0.2)}" cy="0" rx="${n(Math.max(30, a.w * 0.8))}" ry="${n(a.h * 0.6)}"/>`;
  return `${halo}<g transform="scale(${n(stretch, 3)} 1)">${sprite(a, 1)}</g>`;
}

/** An arrow along local +x, its middle at `cx`: the `arrow` painting (pointing right), or ink. */
export function arrowShape(art, cx = 0, spent = false) {
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
  const r0 = s.art?.marks?.dot ?? 2.4;
  for (let k = 4; k <= 40; k += 4) dots.push(`<circle class="g-da-guide" cx="${n(BOW[0] + v.x * k)}" cy="${n(BOW[1] + v.y * k + 0.5 * g * k * k)}" r="${n(r0 * (1 - k / 80))}"/>`);
  return dots.join('');
}

/** The spent arrows stuck in the grass this try, and the chaff a snapped reed threw. */
function spentPicture(s) {
  const stuck = (s.stuck ?? []).map(([x, y, a, id]) => `<g class="g-da-spent" transform="translate(${x} ${y}) rotate(${a})">${thrownShape(s, id, true)}</g>`).join('');
  const chaff = s.art?.straw;
  const bits = (s.world.bits ?? []).map((b) => `<g transform="translate(${n(b.position.x)} ${n(b.position.y)}) rotate(${n((b.angle * 180) / Math.PI)})">${chaff ? sprite({ ...chaff, w: 9, h: 5, at: [0.5, 0.5] }, 0.9) : '<path class="g-da-bit" d="M-3 0 L3 0"/>'}</g>`).join('');
  // Arrows stuck in a log ride it as it rolls.
  const riders = (s.world.riders ?? []).map((r) => `<g class="g-da-spent" transform="translate(${n(r.body.position.x)} ${n(r.body.position.y)}) rotate(${n((r.body.angle * 180) / Math.PI)})">${thrownShape(s, r.proj?.id ?? 'arrow', true)}</g>`).join('');
  const thrown = (s.world.thrown ?? []).map((r) => `<g class="g-tk-proj" transform="translate(${n(r.body.position.x)} ${n(r.body.position.y)}) rotate(${n((r.body.angle * 180) / Math.PI)})">${thrownShape(s, r.proj?.id ?? 'stone')}</g>`).join('');
  return stuck + bits + riders + thrown;
}

/** The last arrow's path: a bold ink stroke on a paper rim (`marks.trail` its width), or ink dots. */
function trailPicture(s) {
  const t = s.trail ?? [], w = s.art?.marks?.trail;
  if (!w) return t.map(([x, y], i) => (i % 2 ? '' : `<circle class="g-da-trail" cx="${x}" cy="${y}" r="1.6"/>`)).join('');
  if (t.length < 2) return '';
  const d = `M${t.map(([x, y]) => `${x} ${y}`).join(' L')}`;
  return `<path class="g-da-trail-rim" d="${d}" style="stroke-width:${n(w + 2.4)}"/><path class="g-da-trail-ink" d="${d}" style="stroke-width:${w}"/>`;
}

function arrowPicture(s) {
  const ar = s.world.arrow, fx = (ar?.fx ?? []).map((f) => fxPicture(f, (s.world.t ?? 0) - (f.t ?? s.world.t ?? 0), calm(s))).join('');
  if (!ar || ['hit', 'spook', 'clear'].includes(s.phase)) return fx;
  const { x, y } = ar.body.position, proj = ar.proj ?? ARROW;
  const deg = ar.real || turnsWithFlight(proj) || !ar.true ? (ar.body.angle * 180) / Math.PI : (s.world.t ?? 0) * 0.6; // a stone tumbles
  return `${fx}<g class="g-da-arrow${proj.shape !== 'arrow' ? ' g-tk-proj' : ''}" data-arrow="" transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})">${thrownShape(s, proj.id)}</g>`;
}

/** What he threw, drawn: the arrow (painted or ink), or the kit's shape for the rest. */
function thrownShape(s, id = 'arrow', spent = false) {
  const proj = projectileOf(s.kit, id);
  if (proj.shape === 'arrow') return arrowShape(s.art, 0, spent);
  // A 柴 log or a pot is the scene's own painted log and jar, at its size; a stone its pebble.
  const own = { log: 'log', pot: 'jar', stone: 'pebble', sword: 'sword', talisman: 'talisman' }[proj.shape], [w, h] = proj.size ?? [12, 12];
  if (own && s.art?.[own]?.file) return bodyArt(s, own === 'jar' ? 'jar' : own === 'log' ? 'log' : own, proj.shape === 'sword' ? 30 : proj.shape === 'talisman' ? 8 : w, proj.shape === 'sword' ? 5 : proj.shape === 'talisman' ? 22 : h);
  return shapeOf(proj);
}

/** 「往左偏半寸」: after a miss on a level that hints it, a small tick half an inch left of the deer. */
function hintPicture(level, s) {
  if (!s.hint || !level.hint || !level.deer || s.phase === 'hit') return '';
  const d = deerAt(level, s.clock), x = d.x + d.face * HEART[0] * DEER_S - 14, y = groundAt(d.x) + HEART[1] * DEER_S;
  return `<path class="g-da-hint" d="M${n(x)} ${n(y - 7)} L${n(x)} ${n(y + 7)} M${n(x - 4)} ${n(y)} L${n(x + 4)} ${n(y)}"/>`;
}

/** The look-up after an arrow lands near: eased up and back down, 0 … 1. */
const alerted = (s) => (s.alertAt == null ? 0 : swell(s.clock - s.alertAt, ALERT_MS));

/** The hit zones over the deer, for checking them against the painting — only on a test page
    with ?dev=1&zones=1 (the 游戏厅, the try page): the heart red, the body (a hit) blue, the head
    and antlers (a graze) green. */
const showZones = () => /[?&]dev=1\b/.test(globalThis.location?.search ?? '') && /[?&]zones=1\b/.test(globalThis.location?.search ?? '');
export function zonesPicture(level, s, force = false) {
  if (!(force || showZones()) || !level.deer || !['aim', 'fly'].includes(s.phase)) return '';
  const d = deerAt(level, s.clock), head = headOf(d.lift), lerp = (a, b) => a + (b - a) * d.lift;
  const antler = [head[0] + lerp(ANTLER_DOWN[0], ANTLER_UP[0]), head[1] + lerp(ANTLER_DOWN[1], ANTLER_UP[1])];
  return `<g class="g-da-zones" transform="translate(${n(d.x)} ${n(groundAt(d.x))}) scale(${n(d.face * DEER_S, 2)} ${DEER_S})">`
    + `<ellipse class="is-body" cx="${BODY[0]}" cy="${BODY[1]}" rx="${BODY[2]}" ry="${BODY[3]}"/><path class="is-body" d="M20 -38 L${n(head[0])} ${n(head[1])}"/>`
    + `<circle class="is-heart" cx="${HEART[0]}" cy="${HEART[1]}" r="${HEART_R}"/>`
    + `<circle class="is-graze" cx="${n(head[0])}" cy="${n(head[1])}" r="8"/><circle class="is-graze" cx="${n(antler[0])}" cy="${n(antler[1])}" r="${ANTLER_R}"/></g>`;
}

function deerNow(level, s) {
  if (!level.deer) return targetOf(level)?.picture(level, s, groundAt, sprite) ?? '';
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
  const stars = starsPicture(x, y - 34, s.levelStars ?? starsForHit(s.used, s.offHeart), calm(s) ? 1 : s.t);
  const own = targetOf(levelOf(s))?.burst; // the cave answers with an echo, not ink
  if (own) return own(s, calm(s)) + stars;
  if (calm(s)) return `<circle class="g-da-burst" cx="${n(x)}" cy="${n(y)}" r="14"/>${stars}`;
  // A big bloom of ink, a second one a beat behind, a ring going out — and the stars.
  const ring = s.t < 600 ? `<circle class="g-da-ring" cx="${n(x)}" cy="${n(y)}" r="${n(10 + s.t / 12)}" opacity="${n(1 - s.t / 600, 2)}"/>` : '';
  return inkHit(s.art?.ink_hit, x, y, s.t) + ring + stars;
}

/** The bloom: the `ink_hit` painting opening and fading, or two ink splashes a beat apart. */
export function inkHit(a, x, y, t) {
  if (!a) return splash(x, y, t, { r: 30 }) + splash(x - 8, y + 4, t - 90, { r: 16 });
  if (t > 1100) return '';
  // Wash-strength, not a solid blot: it opens wide and soft over the painted coat, then fades.
  const k = 0.7 + 0.9 * ease(t / 450), o = 0.5 * (t < 650 ? ease(t / 120) : 1 - (t - 650) / 450);
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(k, 2)})">${sprite(a, o)}</g>`;
}

/** The level's stars, stamped one after another over the strike (each pops in, eased with a kick). */
export function starsPicture(x, y, k, t) {
  return [0, 1, 2].map((i) => {
    const age = typeof t === 'number' ? t - 120 - i * 110 : 999, f = age <= 0 ? 0 : Math.min(1, age / 180);
    if (!f) return '';
    const pop = f < 1 ? 0.3 + 1.1 * Math.sin((f * Math.PI) / 1.2) : 1;
    return `<text class="g-da-hitstar${i < k ? ' is-on' : ''}" x="${n(x + (i - 1) * 17)}" y="${n(y)}" text-anchor="middle" transform="translate(${n(x + (i - 1) * 17)} ${n(y)}) scale(${n(pop, 2)}) translate(${n(-(x + (i - 1) * 17))} ${n(-y)})">${i < k ? '★' : '☆'}</text>`;
  }).join('');
}

/** A clean hit settles the scene: a short, damped shake (nothing under reduced motion). */
export function settle(s) {
  if (s.phase !== 'hit' || calm(s) || s.t > 220) return '';
  const k = 1 - s.t / 220;
  return ` style="transform: translate(${n(Math.sin(s.t / 14) * 3 * k)}px, ${n(Math.cos(s.t / 11) * 2 * k)}px)"`;
}

function playScene(s) {
  const level = levelOf(s);
  const drag = `<rect class="g-da-pad" x="0" y="0" width="${W}" height="${H}" data-g-drag="bow"/>`;
  // The camera and the shake (juice.js, at the screen's rate) ride on the world: written here too,
  // so a repaint keeps them; with none (node, reduced motion) a hit's own short settle.
  const view = s.world.view ? ` transform="${viewAttr(s.world.view)}"` : settle(s);
  const svg = scene(W, H, `<g class="g-da-world"${view}>${bankPicture(s) + windPicture(level, s) + trailPicture(s) + hintPicture(level, s) + spentPicture(s)
    + deerNow(level, s) + zonesPicture(level, s) + s.world.things.map((x) => thingPicture(x, s)).join('') + shardsPicture(s) + burstPicture(s) + popsPicture(s) + bowPicture(s) + guidePicture(s)
    + arrowPicture(s)}</g>${drag}`, 'g-da-scene').replace('<svg ', `<svg data-arc="${esc(s.seed)}" `);
  return `<div class="g-da-stage">${svg}<canvas class="g-da-fx" data-fx="" width="960" height="600" aria-hidden="true"></canvas></div>`;
}

/** What each break scored, popping up where it broke and fading (愤怒小鸟's numbers). */
function popsPicture(s) {
  const now = s.world.t ?? 0;
  return (s.world.broke ?? []).filter((b) => now - b.t < 1100).map((b) => {
    const age = now - b.t, k = Math.min(1, age / 160), pop = calm(s) ? 1 : k < 1 ? 0.4 + 0.9 * Math.sin((k * Math.PI) / 1.25) : 1;
    const o = age < 700 ? 1 : 1 - (age - 700) / 400, y = b.at[1] - 16 - (calm(s) ? 0 : age / 40);
    return `<text class="g-sm-pop${b.topple ? ' is-small' : ''}" x="${n(b.at[0])}" y="${n(y)}" text-anchor="middle" opacity="${n(o, 2)}" transform="translate(${n(b.at[0])} ${n(y)}) scale(${n(pop, 2)}) translate(${n(-b.at[0])} ${n(-y)})">+${b.points}</text>`;
  }).join('');
}

/** The wind as it blows now, in a word: how strong, and whether in his face or at his back. */
function windWord(w, t) {
  const k = Math.min(3, Math.ceil(Math.abs(w) / 0.3 - 0.15));
  return k ? `${t.wind[k]}${w > 0 ? t.face : t.back}` : t.wind[0];
}
/** Stars; `pop` stamps each in turn (CSS: .g-da-pop, staggered, still under reduced motion). */
const starRow = (k, pop = false) => [0, 1, 2].map((i) => `<i class="g-da-star${i < k ? ' is-on' : ''}${pop ? ' g-da-pop' : ''}" style="--i:${i}">${i < k ? '★' : '☆'}</i>`).join('');

function head(s, t) {
  const level = levelOf(s), left = Math.max(0, quiverOf(s) - s.used);
  // The count is of what he throws: 箭 at 射鹿, the picked thing in the kit's tray.
  const proj = projectileOf(s.kit, s.pick), what = proj.id === 'arrow' ? t.arrows : proj.name?.[t === T.en ? 'en' : 'zh'] ?? t.arrows;
  const quiver = `<span>${what} <b>${'│'.repeat(left)}</b>${'·'.repeat(quiverOf(s) - left)}</span>`;
  // A smash level shows its points where the wind word would be (its air is still).
  const mid = level.score ? `<span class="g-da-windword g-sm-score">${t.score} <b>${(s.world?.score ?? 0) + 0}</b></span>` : `<span class="g-da-windword">${windWord(windAt(level, s.clock), t)}</span>`;
  return `<div class="g-head g-da-top"><span>${t.level.replace('{i}', String(s.li + 1)).replace('{n}', String(s.levels.length))}</span>`
    + `${mid}${quiver}</div>`;
}

/** The end line, counting the spots he shot (the story deals two, the 游戏厅 all). */
const COUNT_ZH = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
function endLine(s, t, lang) {
  const k = s.levels.length;
  if (k === 1) return t.one;
  const word = lang === 'en' ? (['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][k] ?? String(k)) : (COUNT_ZH[k] ?? String(k));
  // A run with smash levels did not only shoot: its line says so.
  return (s.levels.some((l) => l.smash) ? t.endSmash : t.end).replace('{n}', word);
}

/** A row's own word (games.json row `words`), else null for the deer's. */
const rowWord = (s, key, lang) => s.words?.[key]?.[lang] ?? s.words?.[key]?.zh ?? null;

function lineOf(s, t, lang) {
  const level = levelOf(s);
  const said = { stuck: t.stuck, flushed: t.flushed, felled: t.felled, glance: t.glance, dash: t.dash, clean: t.clean, body: t.body, graze: t.graze[(s.grazes ?? 1) % t.graze.length], short: t.short, long: t.long, turned: t.turned, snap: t.snap, gone: rowWord(s, 'gone', lang) ?? t.gone };
  if (s.phase === 'clear') return `${t.clear}${starRow(s.best[s.li], true)}`;
  if (s.phase === 'aim' && s.pull) return s.pull.p >= 0.98 ? t.full : t.pull;
  const proj = projectileOf(s.kit, s.pick);
  // In flight, the one tap it has, said once: 「飞行中点一下……」.
  if (s.phase === 'fly' && proj.ability && !s.world.arrow?.tapped) return proj.tip?.[lang] ?? proj.tip?.zh ?? '';
  // A miss where she hints it: her 「往左偏半寸」 right after; else the deer's look-up if it was near.
  if (s.phase === 'aim' && !s.pull && s.hint && level.hint && ['short', 'long'].includes(s.said)) return `${said[s.said]}${t.hint}`;
  if (s.phase === 'aim' && !s.pull && s.alertAt != null && s.clock >= s.alertAt && s.clock - s.alertAt < ALERT_MS && ['short', 'long'].includes(s.said)) return `${said[s.said]}${t.alert}`;
  const own = level.words?.[s.said]?.[lang] ?? level.words?.[s.said]?.zh;
  if (own) return own;
  if (s.said && said[s.said]) return said[s.said];
  if (s.hint && level.hint) return t.hint;
  return level.say?.[lang] ?? level.say?.zh ?? '';
}

/** The sound's toggle (juice.js keeps it, per browser): never a game verb. */
const muteBtn = (lang) => { const m = muted(); return `<button type="button" class="g-btn g-btn-quiet g-da-mute" data-da-mute="" data-lang="${lang}" aria-pressed="${m}">${muteLabel(m, lang)}</button>`; };

function controls(s, t, lang = 'zh') {
  if (s.phase === 'clear' && s.best[s.li] < 3) return `<div class="g-pair">${btn(s.li + 1 < s.levels.length ? t.next : t.last, 'data-g="next"', 'main')}${btn(t.again, 'data-g="retry"', 'soft')}</div>`;
  if (['aim', 'fly', 'gone', 'spook', 'settle'].includes(s.phase)) return `<div class="g-bread-row">${btn(t.retry, 'data-g="retry"', 'quiet')}${muteBtn(lang)}</div>`;
  return `<div class="g-bread-row">${muteBtn(lang)}</div>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.phase === 'empty') return `<div class="g-deerarc g-ink"><p class="g-line-say">${t.empty}</p></div>`;
  if (state.won) {
    return `<div class="g-deerarc g-ink is-won"><p class="g-da-stars">${starRow(state.stars)}</p>`
      + `<p class="g-line-say">${rowWord(state, 'end', lang) ?? endLine(state, t, lang)}<br>${t.stars.replace('{s}', String(state.stars))}</p></div>`;
  }
  return `<div class="g-deerarc g-ink">${head(state, t)}${playScene(state)}${trayPicture(state, t, lang)}<p class="g-line-say">${lineOf(state, t, lang)}</p>${controls(state, t, lang)}</div>`;
}

/** The tray: what he holds for this level (only his own things, the card law), when it is more
    than one — each with its name; the chosen one inked. Between throws only. */
function trayPicture(s, t, lang) {
  if (!(s.ammo?.length > 1)) return '';
  const on = s.phase === 'aim';
  const items = s.ammo.map((id) => {
    const proj = projectileOf(s.kit, id), name = proj.name?.[lang] ?? proj.name?.zh ?? id;
    // Painted where the thing has its painting (the arrow, the pebble, the log, the jar…), else ink.
    const own = proj.shape === 'arrow' ? s.art?.arrow : s.art?.[{ log: 'log', pot: 'jar', stone: 'pebble', sword: 'sword', talisman: 'talisman' }[proj.shape]];
    const icon = own?.file ? `<g transform="scale(${proj.shape === 'arrow' ? 0.7 : 1})">${thrownShape(s, id)}</g>`
      : proj.shape === 'arrow' ? '<path class="g-da-shaft" d="M-11 0 L11 0"/><path class="g-da-head-tip" d="M11 0 l-5 -3 l0 6Z"/>' : shapeOf(proj);
    return `<button type="button" class="g-tk-pick${id === s.pick ? ' is-on' : ''}" data-g="pick" data-p="${id}"${on ? '' : ' disabled'}>`
      + `<svg class="g-tk-icon" viewBox="-16 -10 32 20" aria-hidden="true">${icon}</svg><span>${name}</span></button>`;
  }).join('');
  return `<div class="g-tk-tray" role="group" aria-label="${t.tray}">${items}</div>`;
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
  requestAnimationFrame(paintFrame); // first: one bad frame never stops the painter
  for (const svg of document.querySelectorAll('svg[data-arc]')) {
    const w = WORLDS.get(svg.dataset.arc);
    if (!w?.wall) continue;
    const k = Math.min(3, Math.max(0, (performance.now() - w.wall) / (STEP_MS * (w.rate ?? 1))));
    try {
      paintArrow(svg, w, k);
      paintDeer(svg, w, k);
      juiceFrame(svg, w);
    } catch (e) {
      if (!paintFrame.said) { paintFrame.said = true; console.error('deerarc painter', e); }
    }
  }
}

/* ── Standalone: the mount() contract (games/mount.js); alone it reads its row of games.json. */
/** The `art` entries whose files are there (`has(file)` → Promise<boolean>); a missing one is left
    out, so its part is drawn in ink until the painting lands — no code change, nothing broken. */
export async function presentArt(art, has) {
  if (!art) return null;
  const keys = Object.keys(art).filter((k) => !k.startsWith('_') && art[k]?.file);
  const ok = await Promise.all(keys.map((k) => has(art[k].file)));
  // Settings without a file (`marks`) always stay.
  const settings = Object.keys(art).filter((k) => !k.startsWith('_') && art[k] && !art[k].file);
  return Object.fromEntries([...keys.filter((_, i) => ok[i]), ...settings].map((k) => [k, art[k]]));
}
const onServer = async (file) => {
  try { return (await fetch(artUrl(file), { method: 'HEAD' })).ok; } catch { return false; }
};

/** A row of games.json: its levels and paintings (`art`), and the registry's `projectiles`. */
export async function rowOf(id) {
  const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
  const reg = await res.json(), row = reg.games.find((g) => g.id === id) ?? {};
  // `art` may name another row whose paintings it shares (the kit plays on 射鹿's creek).
  const art = typeof row.art === 'string' ? reg.games.find((g) => g.id === row.art)?.art : row.art;
  return { ...row, art, projectiles: reg.projectiles ?? null };
}
/** The mount() contract for a row: alone (the 游戏厅, no save) it reads the row and holds every
    projectile declared; the beat passes its own `data` (Look's deal: levels, art, owned). */
async function mountRow(id, container, opts = {}) {
  return mountRowWith(id, { newGame, act, tick, html }, container, opts);
}
async function mountRowWith(id, view, container, opts = {}) {
  const row = opts.data?.levels ? {} : await rowOf(id);
  const levels = opts.data?.levels ?? row.levels ?? [], art = await presentArt(opts.data?.art ?? row.art, onServer);
  const projectiles = opts.data?.projectiles ?? row.projectiles ?? null, words = opts.data?.words ?? row.words ?? null;
  const quiet = opts.reducedMotion ? { still: true } : {};
  return mountPure(view)(container, { ...opts, data: { ...(opts.data ?? {}), levels, art, projectiles, ...(words ? { words } : {}), ...quiet } });
}
export const mount = (container, opts) => mountRow(meta.id, container, opts);

/** The same board for another row of games.json (投掷 · the kit, 扔石听声, …): its own meta, the
    rest shared. A small wrapper module (games/<id>.js) exports what this answers. */
export function forRow(id, rowMeta, { grades = null } = {}) {
  const fresh = (seed, level, deal = {}) => newGame(seed, level, { ...(deal ?? {}), ...(grades ? { grades } : {}) });
  const view = { newGame: fresh, act, tick, html };
  return { meta: { ...rowMeta, id }, newGame: fresh, act, tick, html, stuck, mount: (container, opts) => mountRowWith(id, view, container, opts) };
}
