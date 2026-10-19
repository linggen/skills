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
  // The forts (Hanli 10-19: 「游戏里面没有箱子可以砸碎, 或者树等障碍, 难度比较低」): a woodshed's crates break into
  // planks; bamboo baskets are light (an arrow goes through, a stone smashes them); dressed stone is heavy and only a
  // 五雷符 or a great blow breaks it; river ice slides and shatters; the 山神庙's beams, posts and door.
  crate: { mat: 'wood', density: 0.0016, friction: 0.6, strength: 8, arrow: 'stick', points: 300, shards: 4, cut: 'planks', sound: 'crack', art: 'crate', chamfer: 2 },
  basket: { mat: 'bamboo', density: 0.0006, friction: 0.7, strength: 3, arrow: 'pierce', points: 200, shards: 5, sound: 'straw', art: 'basket', chamfer: 6 },
  beiluo: { mat: 'bamboo', density: 0.0006, friction: 0.7, strength: 3, arrow: 'pierce', points: 200, shards: 5, sound: 'straw', art: 'beiluo', chamfer: 5 },
  block: { mat: 'stone', density: 0.005, friction: 0.8, strength: 26, arrow: 'glance', points: 500, shards: 3, sound: 'stone', art: 'block', chamfer: 2 },
  ice: { mat: 'ice', density: 0.0022, friction: 0.02, frictionStatic: 0.05, strength: 6, arrow: 'glance', points: 300, shards: 5, sound: 'shatter', art: 'ice', chamfer: 2 },
  beam: { mat: 'wood', density: 0.0024, friction: 0.7, strength: 14, arrow: 'stick', points: 250, shards: 3, cut: 'planks', sound: 'crack', art: 'beam' },
  post: { mat: 'wood', density: 0.0024, friction: 0.8, strength: 9, arrow: 'stick', points: 150, shards: 3, cut: 'planks', sound: 'crack', art: 'post' },
  door: { mat: 'wood', density: 0.0018, friction: 0.7, strength: 7, arrow: 'stick', points: 300, shards: 4, cut: 'planks', sound: 'crack', art: 'door' },
  // The trees of 黑松岭: a pine's trunk takes the arrow; its boughs catch an arrow head on and turn one that
  // skims them (lob over the canopy, or find the gap). A dead tree stands rooted until a heavy blow fells it
  // (it hinges at its root and comes down on what stands by). A bush lets a throw through, slowed.
  trunk: { mat: 'wood', still: true, friction: 0.8, strength: null, arrow: 'stick', points: 0, sound: 'wood', art: 'trunk' },
  bough: { mat: 'wood', still: true, friction: 0.8, strength: null, arrow: 'bough', points: 0, sound: 'wood', art: 'bough' },
  deadtree: { mat: 'wood', rooted: true, density: 0.004, friction: 0.9, strength: null, fell: 10, arrow: 'stick', points: 400, sound: 'crack', art: 'deadtree' },
  bush: { mat: 'brush', still: true, sensor: true, strength: null, arrow: 'slow', points: 0, sound: 'grass', art: 'bush' },
};
/** What a 五雷符's burst gives a body at its middle (half that at its reach): enough for dressed stone. */
export const BURST_BLOW = 40;
export const isSmashKind = (kind) => Boolean(KINDS[kind]);

const ARROW_MASS = 0.25; // the arrow's weight in the world's units (a jar ~1.2, a log ~3)
const ARROW_BLOW = 0.5; // an arrow's blow: speed × its `mass` × this (a full draw ~3.6: clay and rotten wood break)
const FLUSH = 0.6, FELL = 1.6; // a blow on the stag's barrel: this flushes it, this fells it
const MAX_FRAGS = 90; // shards alive at once (the old settle out first)

/* ── Build ──────────────────────────────────────────────────────────────────────────────────── */

/** A thing of a level as a body: `at` its middle, `size` [w, h], `angle` degrees. Asleep until touched. */
export function smashThing(o, i) {
  const k = KINDS[o.kind], [w, h] = o.size, a = ((o.angle ?? 0) * Math.PI) / 180;
  const opts = { angle: a, friction: k.friction, frictionStatic: k.frictionStatic ?? 1, restitution: k.mat === 'stone' ? 0.4 : 0.1, density: k.density ?? 0.002,
    collisionFilter: FILTER.thing, label: o.kind, ...(k.chamfer ? { chamfer: { radius: Math.min(k.chamfer, w / 2 - 1, h / 2 - 1) } } : {}) };
  if (k.sensor) opts.isSensor = true;
  const body = Bodies.rectangle(o.at[0], o.at[1], w, h, opts);
  if (k.still || k.rooted || o.fixed) Body.setStatic(body, true);
  else Sleeping.set(body, true);
  body.plugin = { thing: i };
  // A rooted thing hinges at the middle of its foot (its bottom edge, turned with it) once felled.
  const root = k.rooted ? [o.at[0] - Math.sin(a) * (-h / 2), o.at[1] + Math.cos(a) * (h / 2)] : null;
  return { kind: o.kind, smash: true, mat: k.mat, size: [w, h], body, broken: false, a: null, b: null, moved: 0, home: [...o.at], home0: a, id: i, ...(root ? { root } : {}) };
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
  // A bush lets a thrown stone or a falling thing through, slowed (once each time it enters).
  for (const [me, other] of [[A, B], [B, A]]) {
    if (me.isSensor && KINDS[me.label]?.arrow === 'slow' && !other.isStatic) { Body.setVelocity(other, { x: other.velocity.x * 0.5, y: other.velocity.y * 0.5 }); cue(world, 'grass', [other.position.x, other.position.y], 0.6); return; }
  }
  const n = col?.normal ?? { x: 0, y: -1 };
  const rv = { x: A.velocity.x - B.velocity.x, y: A.velocity.y - B.velocity.y };
  const vn = Math.abs(rv.x * n.x + rv.y * n.y);
  if (vn < 0.4) return;
  const at = col?.supports?.[0] ? [col.supports[0].x, col.supports[0].y] : [(A.position.x + B.position.x) / 2, (A.position.y + B.position.y) / 2];
  for (const [me, other] of [[A, B], [B, A]]) {
    // Shards only startle the stag (its head comes up): what moves it is a whole thing coming down on it.
    if (me.label === 'deer') { world.queue.push({ deer: true, blow: vn * massOf(other), shard: other.label === 'frag', at }); continue; }
    const t = thingOf(world, me);
    if (!t || t.broken || other.isSensor) continue; // the stag's sensor and a bush are not solid: nothing breaks on them
    const blow = vn * (other.isStatic ? massOf(me) : Math.min(massOf(other), massOf(me) * 4));
    world.queue.push({ thing: t, blow, at, v: { x: me.velocity.x, y: me.velocity.y }, striker: other.isStatic ? null : other, sv: { x: other.velocity.x, y: other.velocity.y }, sw: other.angularVelocity });
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
      if (ev.shard) { world.startled = true; continue; }
      if (ev.blow >= FELL) world.deerBlow = Math.max(world.deerBlow ?? 0, ev.blow);
      else if (ev.blow >= FLUSH && !world.flushed) world.flushed = true;
      continue;
    }
    if (ev.proj) { if (ev.blow >= 0.6 && world.arrow) world.arrow.struckHard = true; cue(world, ev.other?.isStatic && ev.other.label !== 'rock' ? 'thud' : soundOf(ev.other), ev.at, Math.min(1, ev.blow / 4)); continue; }
    const t = ev.thing, k = KINDS[t.kind];
    if (k.fell && t.body.isStatic && !t.felled && ev.blow >= k.fell) { fell(world, t, ev.sv ?? { x: -1, y: 0 }, ev.at); continue; }
    if (ev.blow > 0.5) wakeAround(world, t.body.position, 60);
    if (k.strength != null && ev.blow >= k.strength && !t.broken) {
      shatter(world, t, ev.at, ev.v);
      // What broke it goes on through, most of its way kept (the collision had stopped it).
      if (ev.striker && !ev.striker.isStatic) { Body.setVelocity(ev.striker, { x: ev.sv.x * 0.75, y: ev.sv.y * 0.75 }); Body.setAngularVelocity(ev.striker, ev.sw * 0.75); }
    }
    else if (ev.blow > 0.8) cue(world, k.mat === 'clay' ? 'clink' : k.mat === 'straw' ? 'straw' : 'wood', ev.at, Math.min(1, ev.blow / (k.strength ?? 6)));
  }
}
/** A rooted thing (the dead tree) felled: free, hinged at its root, leaning the way the blow went. */
export function fell(world, t, v, at = null) {
  const k = KINDS[t.kind], b = t.body;
  t.felled = true;
  t.felledAt = world.t ?? 0;
  Body.setStatic(b, false);
  Sleeping.set(b, false);
  // It tips about the corner of its foot on the side it falls to (the other corner lifts off the ground).
  const dir = Math.sign(v.x || -1), half = t.size[0] / 2, ca = Math.cos(b.angle), sa = Math.sin(b.angle);
  const rx = t.root[0] + dir * half * ca, ry = t.root[1] + dir * half * sa;
  const c = Math.cos(-b.angle), s = Math.sin(-b.angle), lx = rx - b.position.x, ly = ry - b.position.y;
  t.hinge = Constraint.create({ pointA: { x: rx, y: ry }, bodyB: b, pointB: { x: lx * c - ly * s, y: lx * s + ly * c }, length: 0, stiffness: 0.9 });
  Composite.add(world.engine.world, t.hinge);
  Body.setAngularVelocity(b, dir * 0.07);
  world.score = (world.score ?? 0) + k.points;
  world.broke = [...(world.broke ?? []), { kind: t.kind, points: k.points, at: at ?? [b.position.x, b.position.y], t: world.t ?? 0, fell: true }];
  t.toppled = true; // its fall is its score
  cue(world, k.sound, at ?? [b.position.x, b.position.y], 1, { mat: k.mat, kind: t.kind, big: true });
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

/** The cut of a w × h piece into `k` convex parts (its own frame, centred), the same every time:
    irregular cells, as a thing really breaks (a seeded Voronoi of `k` points, each cell the rectangle
    clipped by the bisectors to the others), or `planks`: strips along its length, cut on a slant. */
export function cutOf(w, h, k, seed = 1, how = 'voronoi') {
  let r = (seed * 9301 + 49297) % 233280;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  if (how === 'planks') return planks(w, h, k, rnd);
  // The points: one in each of k stripes across the long side, wandering within it and across.
  const long = w >= h, L = long ? w : h, S = long ? h : w, pts = [];
  for (let i = 0; i < k; i++) {
    const u = -L / 2 + (L * (i + 0.2 + rnd() * 0.6)) / k, v = (rnd() - 0.5) * S * 0.8;
    pts.push(long ? [u, v] : [v, u]);
  }
  const rect = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return pts.map((p, i) => pts.reduce((poly, q, j) => (j === i ? poly : clipHalf(poly, p, q)), rect));
}

/** Strips along a piece's long side: each cut line crosses it on a slant (a plank splits, never square). */
function planks(w, h, k, rnd) {
  const long = w >= h, L = long ? w : h, S = long ? h : w;
  // Cuts across the short side, the long way along: k strips of the short side.
  const cuts = [-S / 2];
  for (let i = 1; i < k; i++) cuts.push(-S / 2 + (S * i) / k + (rnd() - 0.5) * (S / k) * 0.5);
  cuts.push(S / 2);
  const slant = cuts.map((c, i) => (i === 0 || i === k ? [c, c] : [c + (rnd() - 0.5) * (S / k) * 0.6, c + (rnd() - 0.5) * (S / k) * 0.6]));
  const parts = [];
  for (let i = 0; i < k; i++) {
    const [a0, a1] = slant[i], [b0, b1] = slant[i + 1];
    const quad = [[-L / 2, a0], [L / 2, a1], [L / 2, b1], [-L / 2, b0]];
    parts.push(long ? quad : quad.map(([x, y]) => [y, x]).reverse());
  }
  return parts;
}

/** The part of convex `poly` nearer `p` than `q` (Sutherland–Hodgman against their bisector). */
function clipHalf(poly, p, q) {
  const nx = q[0] - p[0], ny = q[1] - p[1], c = (nx * (p[0] + q[0])) / 2 + (ny * (p[1] + q[1])) / 2;
  const side = ([x, y]) => c - (nx * x + ny * y); // ≥ 0: p's side
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const t = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

/** Shatter a thing: it leaves the world; its pieces, each a cut of its painting, fly from the blow. */
export function shatter(world, t, at, v = null) {
  const k = KINDS[t.kind], b = t.body, [w, h] = t.size, ang = b.angle;
  t.broken = true;
  world.score = (world.score ?? 0) + k.points;
  world.broke = [...(world.broke ?? []), { kind: t.kind, points: k.points, at: [b.position.x, b.position.y], t: world.t ?? 0 }];
  Composite.remove(world.engine.world, b);
  const vel = v ?? b.velocity, cos = Math.cos(ang), sin = Math.sin(ang);
  const frags = cutOf(w, h, k.shards, t.id + 1, k.cut).map((poly, i) => {
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
  const skip = world.arrow?.ignore && world.arrow.steps < world.arrow.ignore.until ? world.arrow.ignore.id : null;
  for (const t of world.things) {
    if (!t.smash || t.broken || t.id === skip) continue;
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

/** What the arrow does at a smash body, by its material → 'stuck' | 'glance' | 'broke' | 'swallowed' |
    'pierced' (through bamboo) | 'brushed' (through a bush, slowed) | 'deflect' (turned off a bough). */
export function arrowAt(world, hit, proj) {
  const ar = world.arrow, t = hit.thing, k = KINDS[t.kind], v = ar.body.velocity, speed = Math.hypot(v.x, v.y);
  const blow = speed * (proj.mass ?? 1) * ARROW_BLOW, mass = ARROW_MASS * (proj.mass ?? 1);
  const [nx, ny] = hit.normal, dot = (v.x * nx + v.y * ny) / (speed || 1); // −1 head on … 0 along the face
  // The 短飞剑 after its tap: straight through the first breakable thing it meets, which breaks.
  if (ar.through && !ar.pierced && k.strength != null) {
    ar.pierced = true;
    shatter(world, t, hit.at, { x: v.x * 0.4, y: v.y * 0.4 });
    Body.setVelocity(ar.body, { x: v.x * 0.85, y: v.y * 0.85 });
    return 'broke';
  }
  // Light bamboo: the arrow goes through the weave, shoving it; a bush: through, slowed.
  if (k.arrow === 'pierce' || k.arrow === 'slow') {
    const keep = k.arrow === 'pierce' ? 0.8 : 0.5;
    if (k.arrow === 'pierce') push(t.body, hit.at, v, mass * 1.2);
    Body.setVelocity(ar.body, { x: v.x * keep, y: v.y * keep });
    ar.ignore = { id: t.id, until: ar.steps + Math.ceil(Math.max(...t.size) / Math.max(1, speed * keep)) + 3 };
    cue(world, k.arrow === 'pierce' ? 'wood' : 'grass', hit.at, Math.min(1, blow / 4));
    return k.arrow === 'pierce' ? 'pierced' : 'brushed';
  }
  // A pine bough: an arrow into it head on is caught; one that meets it at a slant is turned off it.
  const skims = k.arrow === 'bough' ? dot > -0.6 : k.mat === 'wood' && dot > -0.35;
  if (k.arrow === 'bough' && skims) {
    const d = v.x * nx + v.y * ny, out = { x: (v.x - 2 * d * nx) * 0.45, y: (v.y - 2 * d * ny) * 0.45 };
    Body.setVelocity(ar.body, out);
    Body.setAngle(ar.body, Math.atan2(out.y, out.x));
    ar.ignore = { id: t.id, until: ar.steps + 6 };
    t.shake = world.t ?? 0;
    cue(world, 'grass', hit.at, 0.7, { glance: true });
    ar.glanced = (ar.glanced ?? 0) + 1;
    return 'deflect';
  }
  if (k.arrow === 'glance' || skims) {
    // Off its face: the arrow keeps flying, slowed (stone) or spent (a skim along wood).
    const keep = k.arrow === 'glance' ? 0.62 : 0.3, d = v.x * nx + v.y * ny;
    const out = { x: (v.x - 2 * d * nx) * keep, y: (v.y - 2 * d * ny) * keep }, ol = Math.hypot(out.x, out.y) || 1, half = proj.half ?? 13;
    // Off the face: its point laid just outside where it struck, turned along its new way.
    Body.setAngle(ar.body, Math.atan2(out.y, out.x));
    Body.setPosition(ar.body, { x: hit.at[0] + nx * 1.5 - (out.x / ol) * half, y: hit.at[1] + ny * 1.5 - (out.y / ol) * half });
    Body.setVelocity(ar.body, out);
    ar.tip = [hit.at[0] + nx * 1.5, hit.at[1] + ny * 1.5];
    ar.ignore = { id: t.id, until: ar.steps + 6 }; // it does not strike the same face again at once
    if (k.arrow !== 'glance') { ar.true = false; Body.setAngularVelocity(ar.body, 0.25); }
    push(t.body, hit.at, v, mass * 0.3);
    cue(world, k.arrow === 'glance' ? 'stone' : 'wood', hit.at, Math.min(1, blow / 4), { glance: true });
    ar.glanced = (ar.glanced ?? 0) + 1;
    return k.arrow === 'glance' ? 'glance' : 'skim';
  }
  if (k.fell && t.body.isStatic && !t.felled && blow >= k.fell) fell(world, t, v, hit.at);
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

/** A 五雷符's burst at `at`: what it touches near the middle takes BURST_BLOW, fading to nothing at
    BURST_REACH of its reach — what that beats shatters (dressed stone too), a dead tree is felled, the
    rest are thrown outward. A narrow thunder: it opens a wall, not the whole fort. */
export const BURST_REACH = 0.7;
export function burstOn(world, at, reach) {
  const r = reach * BURST_REACH;
  for (const t of world.things) {
    if (!t.smash || t.broken) continue;
    const k = KINDS[t.kind], p = t.body.position, dx = p.x - at[0], dy = p.y - at[1];
    const d = Math.max(0, Math.hypot(dx, dy) - Math.min(...t.size) / 2);
    if (d > r) continue;
    const blow = BURST_BLOW * (1 - d / r), l = Math.hypot(dx, dy) || 1;
    if (k.strength != null && blow >= k.strength) { shatter(world, t, [p.x, p.y], { x: (dx / l) * 3, y: (dy / l) * 3 - 1 }); continue; }
    if (k.fell && t.body.isStatic && !t.felled) { fell(world, t, { x: dx || 1, y: 0 }, [p.x, p.y]); continue; }
    if (t.body.isStatic) continue;
    Sleeping.set(t.body, false);
    const kick = 3 * (1 - d / r);
    Body.setVelocity(t.body, { x: t.body.velocity.x + (dx / l) * kick, y: t.body.velocity.y + (dy / l) * kick - 1 });
  }
}

/** After a big collapse (three breaks or falls inside a second), a cue at their middle: the camera
    looks over the wreck a moment (juice.js) before the next throw. */
export function aftermath(world) {
  const now = world.t ?? 0, recent = (world.broke ?? []).filter((b) => now - b.t < 1000);
  if (recent.length < 3 || now - (world.panAt ?? -1e9) < 2500) return;
  world.panAt = now;
  const x = recent.reduce((a, b) => a + b.at[0], 0) / recent.length, y = recent.reduce((a, b) => a + b.at[1], 0) / recent.length;
  cue(world, 'collapse', [x, y], 1, { big: true });
}

/** The things are heavier than the air the arrow flies in: gravity on them is this much more (a
    tower falls in a beat, not a drift — the arrow's arc keeps its own tuned gravity). */
export const THING_FALL = 1.6;
export function heavier(world) {
  const g = world.engine.gravity, extra = g.y * g.scale * THING_FALL;
  const add = (b) => { if (!b.isStatic && !b.isSleeping) b.force.y += b.mass * extra; };
  for (const t of world.things) if (t.smash && !t.broken) add(t.body);
  // A felled tree keeps going over until it lies on something (it does not doze off mid-fall).
  for (const t of world.things) if (t.felled && !t.broken && Math.abs(t.body.angle - t.home0) < 1.2 && world.t - (t.felledAt ?? 0) < 3000) Sleeping.set(t.body, false);
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
