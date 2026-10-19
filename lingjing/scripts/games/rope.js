// rope.js — the 割绳子 world the small games share (喂饼 2026-10-16, the 饭桶's daily puzzle the
// same day). Pure physics on matter.js (physics.js), no drawing, no DOM: a level's data in, a world
// that steps at a fixed 1/60 s out, so the page, the bots and the level generator play the same
// world whatever the clock's tick. A game keeps its own rules (what is a win, a miss, a star) and
// its own picture; this holds only what the level declares:
//   bread   [x, y]          the thing that hangs (the 饼, the 饭桶's meal); `r` its radius (19)
//   vines   [{at, slack?, regrow?}]  hung from `at`; `regrow` ms: a cut vine grows back from its
//                           anchor and takes the thing again once it is within the vine's reach
//   stones  [{x, y, w, h, a}]        to bounce or roll on (a: degrees)
//   gust    {at, to, band?, power?}  a puff from `at` blowing `to` across a band of ±band px
//   bubbles [{at, r?}]      灵气泡: the thing that touches one is held in it and lifted; a tap pops it
//   thorns  [{x, y, w, h, a}]        荆棘: the thing touching them breaks
//   springs [{x, y, w, a}]  弹竹: a springy bamboo the thing bounces off, harder than it came
//   seals   [{a: [x, y], b: [x, y], r?}]  双印: a pair of 掐诀 seals — the thing (free of its vines)
//                           that enters one comes out of the other, moving as it was
//   crows   [{v, ms}]       乌鸦: walks down vine `v` from its anchor and reaches the thing after `ms`
//                           — it takes the thing, unless that vine is cut first (the crow flies off)
//   air     the air on a hung thing (AIR_HUNG): a level built on swinging (拽, a man on a rope in the
//           storm, 2026-10-19) lets its swing carry longer, so the moment of a cut matters
//   pack    {len, r?, density?}  坠: a weight hung under the thing on a strap (爹's pack, 2026-10-19) — it
//                           drags the swing (a puff pushes the thing, not the weight) and catches on the
//                           rock it meets; cutting the strap (cutPack) lets it fall away into the drop
// Each element is the same three things for every game: its data here, its physics here, and a
// game's own picture and teaching line (the ELEMENTS table below names them once).
// The world keeps the field names the games' frame painters read: `bread` (the thing), `vines`,
// `wall`, `done`, `acc`.
import { Matter } from './physics.js';

const { Engine, Bodies, Body, Composite, Constraint, Query } = Matter;

export const W = 360;
export const H = 440;
export const FLOOR = 422;
export const ROOF = 22;
export const STEP_MS = 1000 / 60;
export const BREAD_R = 19;
export const BUBBLE_R = 26;
const LINK = 18, GUST_MS = 700, GUST_ACC = 0.0009, GUST_BAND = 70, SETTLE_STEPS = 240;
export const AIR_HUNG = 0.03;
export const AIR_FREE = 0.01;
export const AIR_BUBBLE = 0.06;
const LIFT = 1.25, BUBBLE_GUST = 0.6; // a bubble at the roof drifts along it, never off the board
export { GUST_MS, GUST_BAND };

/** The elements a level may declare, and what a player is taught the first time each appears. */
export const ELEMENTS = {
  gust: { zh: '风', en: 'Draught' },
  bubble: { zh: '灵气泡', en: 'Qi bubble' },
  thorns: { zh: '荆棘', en: 'Thorns' },
  regrow: { zh: '会再长的藤', en: 'Regrowing vine' },
  spring: { zh: '弹竹', en: 'Springy bamboo' },
  seals: { zh: '双印', en: 'Twin seals' },
  crow: { zh: '乌鸦', en: 'Crow' },
  pack: { zh: '坠', en: 'Dead weight' },
};
const SPRING_BOUNCE = 1.15, SEAL_R = 22, SEAL_COOL = 500;

const NO_HIT = { group: -1, category: 0x0002, mask: 0 };
const PACKED = -7; // the thing and its pack never touch each other; both touch the rock
const PACK_R = 13, PACK_DENSITY = 0.004;
export const dist = (p, [x, y]) => Math.hypot(p.x - x, p.y - y);

/* ── Building ─────────────────────────────────────────────────────────────────────────────── */

function vineBodies(ax, ay, bread, len) {
  const { x: bx, y: by } = bread.position;
  const count = Math.max(4, Math.round(len / LINK)), seg = len / count;
  const links = Array.from({ length: count - 1 }, (_, k) => {
    const f = (k + 1) / count;
    return Bodies.circle(ax + (bx - ax) * f, ay + (by - ay) * f, 2.5, { collisionFilter: NO_HIT, density: 0.0008, frictionAir: 0.03 });
  });
  const joint = (opts) => Constraint.create({ length: seg, stiffness: 1, damping: 0.1, ...opts });
  const joints = [joint({ pointA: { x: ax, y: ay }, bodyB: links[0] })];
  for (let k = 0; k < links.length - 1; k++) joints.push(joint({ bodyA: links[k], bodyB: links[k + 1] }));
  joints.push(joint({ bodyA: links.at(-1), bodyB: bread }));
  return { links, joints };
}

function vineOf(v, bread) {
  const [ax, ay] = v.at;
  const len = dist(bread.position, v.at) * (1 + (v.slack ?? 0));
  return { at: [ax, ay], len, ...vineBodies(ax, ay, bread, len), cut: null, ...(v.regrow ? { regrow: v.regrow, cutAt: null } : {}) };
}

// matter.js zeroes a static body's restitution (and sets friction 1) when it is made static, so a 弹竹
// made with `restitution` never bounced (Hanli 10-19: 「这里的弹竹完全不弹」): set them after.
const slab = (s, { restitution, friction, ...opts }) => {
  const b = Bodies.rectangle(s.x, s.y, s.w, s.h, { isStatic: true, angle: ((s.a ?? 0) * Math.PI) / 180, ...opts });
  if (restitution != null) b.restitution = restitution;
  if (friction != null) b.friction = friction;
  return b;
};
const stoneOf = (s) => slab(s, { restitution: s.bounce ?? 0.3, friction: 0.02, label: 'stone' });
const springOf = (s) => slab({ ...s, h: s.h ?? 12 }, { restitution: SPRING_BOUNCE, friction: 0, label: 'spring' });

/* 坠: the weight on its strap under the thing — a short stiff strap, the weight heavier than the thing. */
function packOf(p, bread) {
  const { x, y } = bread.position, len = p.len ?? 40;
  const body = Bodies.circle(x, y + len, p.r ?? PACK_R, { restitution: 0.1, friction: 0.3, frictionAir: AIR_FREE, density: p.density ?? PACK_DENSITY, label: 'pack', collisionFilter: { group: PACKED } });
  const strap = Constraint.create({ bodyA: bread, bodyB: body, length: len, stiffness: 0.9, damping: 0.1 });
  return { body, strap, len, cut: false };
}

/** A level's world, hung and settled off-stage (the thing is shown at rest). */
export function buildWorld(level) {
  const engine = Engine.create({ positionIterations: 10, velocityIterations: 8, constraintIterations: 12 });
  const [bx, by] = level.bread;
  const bread = Bodies.circle(bx, by, level.r ?? BREAD_R, { restitution: 0.3, friction: 0.04, frictionAir: level.air ?? AIR_HUNG, density: 0.002, label: 'bread', ...(level.pack ? { collisionFilter: { group: PACKED } } : {}) });
  const vines = (level.vines ?? []).map((v) => vineOf(v, bread));
  const pack = level.pack ? packOf(level.pack, bread) : null;
  const stones = [...(level.stones ?? []).map(stoneOf), ...(level.springs ?? []).map(springOf)];
  const floor = Bodies.rectangle(W / 2, FLOOR + 40, W * 3, 80, { isStatic: true, label: 'floor' });
  // A roof only where a bubble may lift the thing to it (喂饼's own levels never had one).
  const roof = level.bubbles?.length ? [Bodies.rectangle(W / 2, ROOF - 40, W * 3, 80, { isStatic: true, label: 'roof' })] : [];
  Composite.add(engine.world, [bread, floor, ...roof, ...stones, ...vines.flatMap((v) => [...v.links, ...v.joints]), ...(pack ? [pack.body, pack.strap] : [])]);
  for (let i = 0; i < SETTLE_STEPS; i++) Engine.update(engine, STEP_MS);
  Body.setVelocity(bread, { x: 0, y: 0 });
  if (pack) Body.setVelocity(pack.body, { x: 0, y: 0 });
  return {
    engine, bread, vines, pack, hungAir: level.air ?? AIR_HUNG, acc: 0, rest: 0, gust: 0, clock: 0,
    bubbles: (level.bubbles ?? []).map((b) => ({ at: [...b.at], r: b.r ?? BUBBLE_R, state: 'free' })),
    thorns: (level.thorns ?? []).map((t) => slab(t, { isSensor: true, label: 'thorns' })),
    seals: (level.seals ?? []).map((p) => ({ a: [...p.a], b: [...p.b], r: p.r ?? SEAL_R, until: 0 })),
    crows: (level.crows ?? []).map((c) => ({ v: c.v, ms: c.ms, at: 0, state: 'walking' })),
  };
}

/* ── What the hand does ───────────────────────────────────────────────────────────────────── */

const held = (w) => w.bubbles.some((b) => b.state === 'held');
const airOf = (w) => (held(w) ? AIR_BUBBLE : w.vines.every((x) => x.cut != null) ? AIR_FREE : w.hungAir ?? AIR_HUNG);

/** Cut vine `v` at joint `k`; false when there is no such joint or it is cut already. */
export function cutVine(w, v, k) {
  const vine = w.vines[v];
  if (!vine || vine.cut != null || !(k >= 0 && k < vine.joints.length)) return false;
  Composite.remove(w.engine.world, vine.joints[k]);
  vine.cut = k;
  w.started = true;
  if (vine.regrow) vine.cutAt = w.clock;
  // On its vines the thing settles soon (a swing is to be watched, not chased); a free one flies true.
  w.bread.frictionAir = airOf(w);
  return true;
}

/** Cut the pack's strap: the weight falls away; false when there is none or it is gone already. */
export function cutPack(w) {
  if (!w.pack || w.pack.cut) return false;
  Composite.remove(w.engine.world, w.pack.strap);
  w.pack.cut = true;
  w.pack.cutAt = w.clock;
  w.pack.body.frictionAir = AIR_FREE;
  w.started = true;
  return true;
}

/** A puff from the level's gust; false while one is still blowing, or when there is none. */
export function blowGust(w, level) {
  if (!level.gust || w.gust > 0) return false;
  w.gust = GUST_MS;
  w.started = true;
  return true;
}

/** Pop bubble `i` (the one holding the thing, or a free one); false if it is gone. */
export function popBubble(w, i) {
  const b = w.bubbles[i];
  if (!b || b.state === 'popped') return false;
  b.state = 'popped';
  w.started = true;
  w.bread.frictionAir = airOf(w);
  return true;
}

/* ── Time ─────────────────────────────────────────────────────────────────────────────────── */

function blow(w, level) {
  const g = level.gust;
  if (!g || w.gust <= 0) return;
  w.gust -= STEP_MS;
  const b = w.bread;
  if (Math.abs(b.position.y - g.at[1]) > (g.band ?? GUST_BAND)) return;
  const [dx, dy] = g.to ?? [1, 0], k = b.mass * GUST_ACC * (g.power ?? 1) * (held(w) ? BUBBLE_GUST : 1);
  Body.applyForce(b, b.position, { x: dx * k, y: dy * k });
}

/** A free bubble the thing touches takes it: its swing slowed, lifted from then on. */
function bubbles(w) {
  const b = w.bread, events = [];
  for (const [i, bub] of w.bubbles.entries()) {
    if (bub.state === 'free' && dist(b.position, bub.at) < bub.r + b.circleRadius * 0.4) {
      bub.state = 'held';
      Body.setVelocity(b, { x: b.velocity.x * 0.3, y: b.velocity.y * 0.3 });
      b.frictionAir = AIR_BUBBLE;
      events.push({ caught: i });
    }
    if (bub.state === 'held') {
      bub.at = [b.position.x, b.position.y];
      Body.applyForce(b, b.position, { x: 0, y: -b.mass * w.engine.gravity.y * w.engine.gravity.scale * LIFT });
    }
  }
  return events;
}

/** A cut vine with `regrow` grows back once its time is up and the thing is within its reach. */
function regrow(w) {
  for (const v of w.vines) {
    if (!v.regrow || v.cut == null || w.clock - v.cutAt < v.regrow) continue;
    if (dist(w.bread.position, v.at) > v.len) continue;
    Composite.remove(w.engine.world, [...v.links, ...v.joints]);
    Object.assign(v, vineBodies(v.at[0], v.at[1], w.bread, Math.max(dist(w.bread.position, v.at), 8)), { cut: null, cutAt: null, grew: w.clock });
    Composite.add(w.engine.world, [...v.links, ...v.joints]);
    w.bread.frictionAir = airOf(w);
  }
}

/* 双印: a free thing entering one seal of a pair comes out of the other, moving as it was. */
function seals(w) {
  const b = w.bread;
  if (w.vines.some((v) => v.cut == null)) return null;
  for (const pair of w.seals) {
    if (w.clock < pair.until) continue;
    for (const [from, to] of [[pair.a, pair.b], [pair.b, pair.a]]) {
      if (dist(b.position, from) > pair.r) continue;
      Body.setPosition(b, { x: to[0], y: to[1] });
      pair.until = w.clock + SEAL_COOL;
      return { from, to };
    }
  }
  return null;
}

/* 乌鸦: each step a crow walks on down its vine; a cut vine sends it off; reaching the thing, it takes it. */
function crows(w) {
  let stolen = false;
  for (const c of w.crows) {
    if (c.state !== 'walking' || !w.started) continue; // it sets off at the first move, not while he reads
    if (w.vines[c.v]?.cut != null) { c.state = 'flown'; continue; }
    c.at = Math.min(1, c.at + STEP_MS / c.ms);
    if (c.at >= 1) { c.state = 'took'; stolen = true; }
  }
  return stolen;
}
/** Where a crow stands: the point `at` (0 anchor … 1 the thing) along its vine. */
export function crowAt(w, c) {
  const v = w.vines[c.v], pts = [{ x: v.at[0], y: v.at[1] }, ...v.links.map((l) => l.position), w.bread.position];
  const f = c.at * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
  return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
}

/** One fixed step. Answers what happened: { broke } when the thing touched thorns, { caught } bubbles. */
export function stepWorld(w, level) {
  Engine.update(w.engine, STEP_MS);
  w.clock += STEP_MS;
  w.wall = globalThis.performance?.now() ?? 0;
  blow(w, level);
  const caught = w.bubbles.length ? bubbles(w) : [];
  if (w.vines.some((v) => v.regrow)) regrow(w);
  const broke = w.thorns.length > 0 && Query.collides(w.bread, w.thorns).length > 0;
  const through = w.seals.length ? seals(w) : null;
  const stolen = w.crows.length ? crows(w) : false;
  return { broke, caught, through, stolen };
}

/** Still enough to think: slow, and not turning. */
export const calm = (w) => w.bread.speed < 0.12 && Math.abs(w.bread.angularSpeed) < 0.02;
/** Off the board, or on the floor. */
export function outOf(w) {
  const p = w.bread.position, r = w.bread.circleRadius;
  return p.x < -40 || p.x > W + 40 || p.y > H + 40 || p.y < -60 || p.y + r >= FLOOR - 1;
}
