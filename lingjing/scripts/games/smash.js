// smash.js — the 射鹿 board's things as real bodies (Hanli 10-19: 「射鹿的问题是没有碰撞, 重力, 物理引擎等」,
// 「没有丢东西, 砸碎东西的快感」). Every thing a level stands by the creek is a matter.js body under
// gravity: logs stacked in a 柴垛, a prop stick, a drying rack's poles, clay jars and roof tiles, a
// rotten fence, a 草垛, a river rock. Each has its material (games.json `things[].kind` → KINDS):
// its weight, its friction and how hard a blow must be to break it. A blow hard enough SHATTERS it:
// the body is swapped for pre-cut fragments (each a piece of the same painting), which inherit its
// velocity and tumble; a softer one only knocks it. Blows chain: a toppled log is a striker too.
// Bodies sleep until something touches them, so a level stands the same however long he aims, and
// the world steps only at a fixed 1/60 s (deerarc.js `tick`): every shot plays the same twice.
//
// The arrow is not a matter body (at ~7 units a step it would pass through a reed): its tip is
// swept from one step to the next against every body's outline (`sweep`), and the answer is the
// material's — earth and wood take it (it sticks at its angle, and rides the log it stuck in),
// stone turns it (it glances on, still flying), clay and rotten wood break under it (it flies on,
// slowed), straw swallows it — with the blow's momentum given to the body hit. A stone, a 柴 log
// and a clay pot are real bodies (`real` in games.json `projectiles`): they bounce, roll and knock.
// The stag stays judged by its zones (deerarc.js deerHit, fitted to its painting); a sensor body on
// its barrel hears what falls on it: a light blow flushes it into the open, a heavy one fells it.
import { Matter } from './physics.js';

const { Bodies, Body, Composite, Constraint, Events, Sleeping, Vertices } = Matter;

export const CAT = { GROUND: 0x0004, CHAFF: 0x0008, THING: 0x0010, PROJ: 0x0020, DEER: 0x0040, FRAG: 0x0080 };
export const FILTER = {
  ground: { category: CAT.GROUND, mask: CAT.CHAFF | CAT.THING | CAT.PROJ | CAT.FRAG },
  thing: { category: CAT.THING, mask: CAT.GROUND | CAT.THING | CAT.PROJ | CAT.DEER | CAT.FRAG },
  proj: { category: CAT.PROJ, mask: CAT.GROUND | CAT.THING | CAT.FRAG },
  frag: { category: CAT.FRAG, mask: CAT.GROUND | CAT.THING | CAT.PROJ | CAT.DEER },
  chaff: { category: CAT.CHAFF, mask: CAT.GROUND },
  deer: { category: CAT.DEER, mask: CAT.THING | CAT.FRAG },
};

/* The materials. `strength`: the blow (a closing speed × the striker's weight) that breaks it; null,
   never. `arrow`: what an arrow does there — 'stick' (earth, wood), 'glance' (stone), 'break'
   (clay, rotten wood: it breaks and the arrow flies on), 'swallow' (straw). `points`: a break's
   score. `shards`: how many pieces it breaks into. `sound`: its voice (juice.js). */
export const KINDS = {
  log: { mat: 'wood', density: 0.003, friction: 0.25, frictionStatic: 0.4, strength: 16, arrow: 'stick', points: 200, shards: 4, sound: 'crack', art: 'log' },
  prop: { mat: 'wood', density: 0.0022, friction: 0.8, strength: 7, arrow: 'stick', points: 100, shards: 3, sound: 'crack', art: 'prop' },
  pole: { mat: 'wood', density: 0.0022, friction: 0.8, strength: 8, arrow: 'stick', points: 100, shards: 3, sound: 'crack', art: 'pole' },
  fence: { mat: 'rotten', density: 0.0016, friction: 0.8, strength: 2.6, arrow: 'break', points: 150, shards: 4, sound: 'crack', art: 'fence' },
  jar: { mat: 'clay', density: 0.0022, friction: 0.6, strength: 2.2, arrow: 'break', points: 300, shards: 6, sound: 'shatter', art: 'jar', chamfer: 6 },
  tile: { mat: 'clay', density: 0.0026, friction: 0.7, strength: 1.5, arrow: 'break', points: 150, shards: 4, sound: 'shatter', art: 'tile' },
  hay: { mat: 'straw', density: 0.0009, friction: 1, strength: 5.5, arrow: 'swallow', points: 250, shards: 8, sound: 'straw', art: 'haystack', chamfer: 14 },
  pot: { mat: 'clay', density: 0.006, friction: 0.6, strength: 0.6, arrow: 'break', points: 0, shards: 5, sound: 'shatter', art: 'jar' },
  rock: { mat: 'stone', still: true, friction: 0.7, strength: null, arrow: 'glance', points: 0, sound: 'stone', art: 'rock', chamfer: 10 },
};
export const isSmashKind = (kind) => Boolean(KINDS[kind]);

const ARROW_MASS = 0.25; // the arrow's weight in the world's units (a jar ~1.2, a log ~3)
const ARROW_BLOW = 0.5; // an arrow's blow: speed × its `mass` × this (a full draw ~3.6: clay and rotten wood break)
const FLUSH = 0.9, FELL = 4.5; // a blow on the stag's barrel: this flushes it, this fells it
const MAX_FRAGS = 90; // shards alive at once (the old settle out first)

/* ── Build ──────────────────────────────────────────────────────────────────────────────────── */

/** A thing of a level as a body: `at` its middle, `size` [w, h], `angle` degrees. Asleep until touched. */
export function smashThing(o, i) {
  const k = KINDS[o.kind], [w, h] = o.size, a = ((o.angle ?? 0) * Math.PI) / 180;
  const opts = { angle: a, friction: k.friction, frictionStatic: k.frictionStatic ?? 1, restitution: k.mat === 'stone' ? 0.4 : 0.1, density: k.density ?? 0.002,
    collisionFilter: FILTER.thing, label: o.kind, ...(k.chamfer ? { chamfer: { radius: Math.min(k.chamfer, w / 2 - 1, h / 2 - 1) } } : {}) };
  const body = Bodies.rectangle(o.at[0], o.at[1], w, h, opts);
  if (k.still || o.fixed) Body.setStatic(body, true);
  else Sleeping.set(body, true);
  body.plugin = { thing: i };
  return { kind: o.kind, smash: true, mat: k.mat, size: [w, h], body, broken: false, a: null, b: null, moved: 0, home: [...o.at], home0: a, id: i };
}

/** The stag's barrel as a sensor (a static body moved to it every step): it hears what falls on it. */
export function deerSensor() {
  const b = Bodies.rectangle(-500, -500, 64, 30, { isStatic: true, isSensor: true, collisionFilter: FILTER.deer, label: 'deer' });
  return b;
}

/** The world's ears: every contact's blow, so breaks and the stag's flush are the physics' own. */
export function listen(world) {
  world.queue = [];
  Events.on(world.engine, 'collisionStart', (e) => {
    for (const p of e.pairs) blowOf(world, p.bodyA, p.bodyB, p.collision);
  });
}

function blowOf(world, A, B, col) {
  const n = col?.normal ?? { x: 0, y: -1 };
  const rv = { x: A.velocity.x - B.velocity.x, y: A.velocity.y - B.velocity.y };
  const vn = Math.abs(rv.x * n.x + rv.y * n.y);
  if (vn < 0.4) return;
  const at = col?.supports?.[0] ? [col.supports[0].x, col.supports[0].y] : [(A.position.x + B.position.x) / 2, (A.position.y + B.position.y) / 2];
  for (const [me, other] of [[A, B], [B, A]]) {
    if (me.label === 'deer') { world.queue.push({ deer: true, blow: vn * massOf(other), at }); continue; }
    const t = thingOf(world, me);
    if (!t || t.broken) continue;
    const blow = vn * (other.isStatic ? massOf(me) : Math.min(massOf(other), massOf(me) * 4));
    world.queue.push({ thing: t, blow, at, v: { x: me.velocity.x, y: me.velocity.y }, striker: other.isStatic ? null : other, sv: { x: other.velocity.x, y: other.velocity.y } });
  }
  // A real throw (a stone, a log, a pot) that strikes something: heard, and a pot breaks itself.
  for (const pr of [A, B]) if (pr.label === 'proj' && world.arrow?.body === pr) world.queue.push({ proj: true, blow: vn * massOf(pr), at, other: pr === A ? B : A });
}
const massOf = (b) => (b.isStatic || !Number.isFinite(b.mass) ? 1 : b.mass);
export const thingOf = (world, body) => (body?.plugin?.thing != null ? world.things[body.plugin.thing] : null);

/** After a step: what the step's blows did — breaks (fragments), the stag flushed or felled. */
export function settleBlows(world) {
  const q = world.queue ?? [];
  world.queue = [];
  for (const ev of q) {
    if (ev.deer) {
      if (ev.blow >= FELL) world.deerBlow = Math.max(world.deerBlow ?? 0, ev.blow);
      else if (ev.blow >= FLUSH && !world.flushed) world.flushed = true;
      continue;
    }
    if (ev.proj) { if (ev.blow >= 0.6 && world.arrow) world.arrow.struckHard = true; cue(world, ev.other?.isStatic && ev.other.label !== 'rock' ? 'thud' : soundOf(ev.other), ev.at, Math.min(1, ev.blow / 4)); continue; }
    const t = ev.thing, k = KINDS[t.kind];
    if (ev.blow > 0.5) wakeAround(world, t.body.position, 60);
    if (k.strength != null && ev.blow >= k.strength && !t.broken) {
      shatter(world, t, ev.at, ev.v);
      // What broke it goes on through, most of its way kept (the collision had stopped it).
      if (ev.striker && !ev.striker.isStatic) Body.setVelocity(ev.striker, { x: ev.sv.x * 0.75, y: ev.sv.y * 0.75 });
    }
    else if (ev.blow > 0.8) cue(world, k.mat === 'clay' ? 'clink' : k.mat === 'straw' ? 'straw' : 'wood', ev.at, Math.min(1, ev.blow / (k.strength ?? 6)));
  }
}
const soundOf = (b) => (b?.label && KINDS[b.label] ? (KINDS[b.label].mat === 'stone' ? 'stone' : KINDS[b.label].mat === 'clay' ? 'clink' : 'wood') : 'thud');

/** A cue for the eye and the ear (juice.js reads them in order): a kind, where, how hard 0–1. */
export function cue(world, k, at, power = 1, extra = {}) {
  world.cues = world.cues ?? [];
  world.cueN = (world.cueN ?? 0) + 1;
  world.cues.push({ n: world.cueN, k, at: [Math.round(at[0] * 10) / 10, Math.round(at[1] * 10) / 10], p: Math.round(power * 100) / 100, t: world.t ?? 0, ...extra });
  if (world.cues.length > 40) world.cues.splice(0, world.cues.length - 40);
}

/* ── Breaking: the body out, its pre-cut pieces in ────────────────────────────────────────── */

/** The cut of a w × h piece into `k` convex parts (its own frame, centred), the same every time. */
export function cutOf(w, h, k, seed = 1) {
  const cols = k >= 6 ? 3 : 2, rows = Math.max(1, Math.round(k / cols));
  let r = seed * 9301 + 49297;
  const jit = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 - 0.5; };
  // A grid whose inner points wander a little: every cell stays convex.
  const P = [];
  for (let j = 0; j <= rows; j++) {
    P.push([]);
    for (let i = 0; i <= cols; i++) {
      const inner = i > 0 && i < cols && j > 0 && j < rows, edgeX = i > 0 && i < cols, edgeY = j > 0 && j < rows;
      const x = -w / 2 + (w * i) / cols + (edgeX ? jit() * (w / cols) * 0.45 : 0) * (inner || j === 0 || j === rows ? 1 : 1);
      const y = -h / 2 + (h * j) / rows + (edgeY ? jit() * (h / rows) * 0.45 : 0);
      P[j].push([x, y]);
    }
  }
  const parts = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) parts.push([P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]]);
  return parts;
}

/** Shatter a thing: it leaves the world; its pieces, each a cut of its painting, fly from the blow. */
export function shatter(world, t, at, v = null) {
  const k = KINDS[t.kind], b = t.body, [w, h] = t.size, ang = b.angle;
  t.broken = true;
  world.score = (world.score ?? 0) + k.points;
  world.broke = [...(world.broke ?? []), { kind: t.kind, points: k.points, at: [b.position.x, b.position.y], t: world.t ?? 0 }];
  Composite.remove(world.engine.world, b);
  const vel = v ?? b.velocity, cos = Math.cos(ang), sin = Math.sin(ang);
  const frags = cutOf(w, h, k.shards, t.id + 1).map((poly, i) => {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const world_ = poly.map(([x, y]) => ({ x: b.position.x + x * cos - y * sin, y: b.position.y + x * sin + y * cos }));
    const fb = Bodies.fromVertices(0, 0, [world_], { friction: 0.8, frictionAir: 0.01, restitution: 0.15, density: (k.density ?? 0.002) * 1.2, collisionFilter: FILTER.frag, label: 'frag' });
    if (!fb) return null;
    const c = Vertices.centre(world_);
    Body.setPosition(fb, c);
    // Away from the blow and the middle, with the body's own way on.
    const ox = c.x - at[0], oy = c.y - at[1], ol = Math.hypot(ox, oy) || 1, kick = 1.4 + (i % 3) * 0.5;
    Body.setVelocity(fb, { x: vel.x * 0.8 + (ox / ol) * kick, y: vel.y * 0.8 + (oy / ol) * kick - 1.2 });
    Body.setAngularVelocity(fb, ((i % 2 ? 1 : -1) * (0.08 + (i % 3) * 0.05)));
    Composite.add(world.engine.world, fb);
    return { body: fb, kind: t.kind, poly: poly.map(([x, y]) => [x - cx, y - cy]), off: [cx, cy], size: [w, h], ang0: ang, born: world.t ?? 0 };
  }).filter(Boolean);
  world.frags = [...(world.frags ?? []), ...frags];
  while (world.frags.length > MAX_FRAGS) Composite.remove(world.engine.world, world.frags.shift().body);
  cue(world, k.sound, at, 1, { mat: k.mat, kind: t.kind, big: k.points >= 250 });
  if (k.points >= 250) world.stopUntil = (world.t ?? 0) + 60; // a big break holds a beat
  wakeAround(world, b.position, Math.max(w, h));
}

/** A body gone leaves the ones it held hanging: wake what stood within reach. */
function wakeAround(world, p, r) {
  for (const t of world.things) {
    if (!t.smash || t.broken || t.body.isStatic) continue;
    if (Math.hypot(t.body.position.x - p.x, t.body.position.y - p.y) < r + Math.max(...t.size)) Sleeping.set(t.body, false);
  }
}

/* ── The arrow against the bodies ────────────────────────────────────────────────────────── */

/** Where segment p→q first crosses a body's outline: { t (0–1 along p→q), at, normal } or null. */
export function sweepBody(p, q, body) {
  let best = null;
  const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
  for (const part of parts) {
    const v = part.vertices;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      const hit = segX(p, q, [a.x, a.y], [b.x, b.y]);
      if (hit != null && (!best || hit < best.t)) {
        const ex = b.x - a.x, ey = b.y - a.y, l = Math.hypot(ex, ey) || 1;
        let nx = ey / l, ny = -ex / l; // the outward normal (matter winds clockwise on screen)
        if ((nx * (q[0] - p[0]) + ny * (q[1] - p[1])) > 0) { nx = -nx; ny = -ny; }
        best = { t: hit, at: [p[0] + (q[0] - p[0]) * hit, p[1] + (q[1] - p[1]) * hit], normal: [nx, ny], body };
      }
    }
  }
  // A tip that starts inside (it was laid there, or a body moved onto it) strikes at once.
  if (!best && Vertices.contains(body.vertices, { x: q[0], y: q[1] })) return { t: 1, at: [...q], normal: [-(q[0] - p[0]), -(q[1] - p[1])].map((x, _, arr) => x / (Math.hypot(...arr) || 1)), body };
  return best;
}
function segX(p, q, a, b) {
  const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1], d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / d, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** The first smash body the tip's step crosses. */
export function firstStruck(world, from, to) {
  let best = null;
  for (const t of world.things) {
    if (!t.smash || t.broken) continue;
    const h = sweepBody(from, to, t.body);
    if (h && (!best || h.t < best.t)) best = { ...h, thing: t };
  }
  return best;
}

/** The blow an arrow gives the body it strikes: its momentum at the point (speed × its weight). */
export function push(body, at, v, mass) {
  if (body.isStatic) return;
  Sleeping.set(body, false);
  const m = body.mass, I = body.inertia, jx = v.x * mass, jy = v.y * mass;
  const rx = at[0] - body.position.x, ry = at[1] - body.position.y;
  Body.setVelocity(body, { x: body.velocity.x + jx / m, y: body.velocity.y + jy / m });
  Body.setAngularVelocity(body, body.angularVelocity + (rx * jy - ry * jx) / I);
}

/** What the arrow does at a smash body, by its material → 'stuck' | 'glance' | 'broke' | 'swallowed'. */
export function arrowAt(world, hit, proj) {
  const ar = world.arrow, t = hit.thing, k = KINDS[t.kind], v = ar.body.velocity, speed = Math.hypot(v.x, v.y);
  const blow = speed * (proj.mass ?? 1) * ARROW_BLOW, mass = ARROW_MASS * (proj.mass ?? 1);
  const [nx, ny] = hit.normal, dot = (v.x * nx + v.y * ny) / (speed || 1); // −1 head on … 0 along the face
  if (k.arrow === 'glance' || (k.mat === 'wood' && dot > -0.35)) {
    // Off its face: the arrow keeps flying, slowed (stone) or spent (a skim along wood).
    const keep = k.arrow === 'glance' ? 0.62 : 0.3, d = v.x * nx + v.y * ny;
    Body.setPosition(ar.body, { x: ar.body.position.x + nx * 2, y: ar.body.position.y + ny * 2 });
    Body.setVelocity(ar.body, { x: (v.x - 2 * d * nx) * keep, y: (v.y - 2 * d * ny) * keep });
    if (k.arrow !== 'glance') { ar.true = false; Body.setAngularVelocity(ar.body, 0.25); }
    push(t.body, hit.at, v, mass * 0.3);
    cue(world, k.arrow === 'glance' ? 'stone' : 'wood', hit.at, Math.min(1, blow / 4), { glance: true });
    ar.glanced = (ar.glanced ?? 0) + 1;
    return k.arrow === 'glance' ? 'glance' : 'skim';
  }
  if (k.strength != null && blow >= k.strength) {
    // It breaks under the arrow, which flies on through it, slowed.
    shatter(world, t, hit.at, { x: v.x * 0.35, y: v.y * 0.35 });
    Body.setVelocity(ar.body, { x: v.x * 0.72, y: v.y * 0.72 });
    return 'broke';
  }
  // Into it: the arrow stays where it went in, at its angle, and the body takes the blow.
  push(t.body, hit.at, v, mass);
  wakeAround(world, t.body.position, 60);
  const b = t.body, rx = hit.at[0] - b.position.x, ry = hit.at[1] - b.position.y, c = Math.cos(-b.angle), s = Math.sin(-b.angle);
  ar.stuckIn = { thing: t.id, local: [rx * c - ry * s, rx * s + ry * c], rel: ar.body.angle - b.angle };
  ar.true = false;
  cue(world, k.mat === 'straw' ? 'straw' : 'wood', hit.at, Math.min(1, blow / 4), { stick: true });
  return k.arrow === 'swallow' ? 'swallowed' : 'stuck';
}

/** An arrow stuck in a body rides it (a log rolling with the arrow in it). */
export function ride(world, ar) {
  const t = world.things[ar.stuckIn.thing];
  if (!t || t.broken) return false;
  const b = t.body, [lx, ly] = ar.stuckIn.local, c = Math.cos(b.angle), s = Math.sin(b.angle);
  Body.setPosition(ar.body, { x: b.position.x + lx * c - ly * s - Math.cos(b.angle + ar.stuckIn.rel) * (ar.proj?.half ?? 13), y: b.position.y + lx * s + ly * c - Math.sin(b.angle + ar.stuckIn.rel) * (ar.proj?.half ?? 13) });
  Body.setAngle(ar.body, b.angle + ar.stuckIn.rel);
  Body.setVelocity(ar.body, { x: 0, y: 0 });
  return true;
}

/** The things are heavier than the air the arrow flies in: gravity on them is this much more (a
    tower falls in a beat, not a drift — the arrow's arc keeps its own tuned gravity). */
export const THING_FALL = 1.6;
export function heavier(world) {
  const g = world.engine.gravity, extra = g.y * g.scale * THING_FALL;
  const add = (b) => { if (!b.isStatic && !b.isSleeping) b.force.y += b.mass * extra; };
  for (const t of world.things) if (t.smash && !t.broken) add(t.body);
  for (const f of world.frags ?? []) add(f.body);
}

/* ── The bodies' bookkeeping ─────────────────────────────────────────────────────────────── */

/** Is everything at rest? (No body awake but the stag's sensor and spent shards.) */
export function atRest(world) {
  for (const t of world.things) if (t.smash && !t.broken && !t.body.isStatic && !t.body.isSleeping && speedOf(t.body) > 0.05) return false;
  for (const f of world.frags ?? []) if (!f.body.isSleeping && speedOf(f.body) > 0.12) return false;
  return true;
}
const speedOf = (b) => Math.hypot(b.velocity.x, b.velocity.y) + Math.abs(b.angularVelocity) * 10;

/** How far each thing has been knocked from where it stood (a topple is scored once). */
export function scoreMoves(world) {
  for (const t of world.things) {
    if (!t.smash || t.broken || t.toppled || t.body.isStatic) continue;
    const d = Math.hypot(t.body.position.x - t.home[0], t.body.position.y - t.home[1]);
    if (d > 18 || Math.abs(t.body.angle - (t.home0 ?? 0)) > 0.9) {
      t.toppled = true;
      world.score = (world.score ?? 0) + 100;
      world.broke = [...(world.broke ?? []), { kind: t.kind, points: 100, at: [t.body.position.x, t.body.position.y], t: world.t ?? 0, topple: true }];
    }
  }
}

export { Constraint };
