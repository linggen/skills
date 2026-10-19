// 砸寨 — the 游戏厅's 愤怒小鸟 mechanics with 卷一's own things (Hanli 10-19: 「要不然你copy一个愤怒小鸟吧?…
// 现在这个没啥好玩的」, then 「用小妖, 黄鼠狼精寨子」). The 黄鼠狼精 who stole the village's chickens and grain sit
// in a fort of logs, planks, tiles, jars and stone on the hillside; 小满 throws from his ledge at the right.
// What makes it 愤怒小鸟 and not target practice (射鹿 was 「7处, 都是一样的」):
//   - the weasels hide in forts: hit the fort, and its collapse crushes them (they take IMPACT damage, as
//     the pigs do — a falling block, a fall, the throw itself, the thunder — never only a direct hit);
//   - several weasels a level, and what the first throw knocked down stays for the second;
//   - they have a face: smug, taunting a miss (吱), worried as the fort wobbles, 噗 into ink smoke;
//   - each throw its power, and the levels force the pick: 石子 plain; 短飞剑 tapped dashes straight on and
//     cuts through wood; 五雷符 tapped (or on striking) bursts — it breaks stone.
// The world is deerarc.js's (build · shoot · stepWorld, the bank's ground, the slingshot about the hand) and
// smash.js's bodies; this module adds the weasels, the thunder's blast, the sword's cut, the throws' tray,
// the score and the levels' flow. The world steps only at a fixed 1/60 s and stands still between throws,
// so a shot plays the same twice. Levels are data (worlds/jiuding/games.json, row `zhazhai`).
// Pure: newGame / act / tick (node runs them: the bot and the tests); the picture is zhazhai-view.js.
import { Matter } from './physics.js';
import { aimOf, BOW, build, GOES_ON, HAND_REACH, MIN_POWER, shoot, starsForScore, STEP_MS, stepWorld, watch } from './deerarc.js';
import { atRest, cue, FILTER, KINDS, shatter, sweepBody, THING_FALL } from './smash.js';
import { projectileOf, tapNow } from './throws.js';

const { Bodies, Body, Composite, Events, Sleeping } = Matter;

export const meta = {
  id: 'zhazhai',
  name: { zh: '砸寨', en: 'Smash the Fort' },
  how: {
    zh: '往后拉，松手扔出去。砸塌寨子，压住黄鼠狼精。飞剑点一下直冲，五雷符点一下炸开。',
    en: 'Pull back and let go. Bring the fort down on the weasels. Tap: the sword dashes, the talisman bursts.',
  },
};

/* The fort's own materials beside smash.js's (wood: log, prop, pole, fence; clay: jar, tile): a sawn plank,
   and dressed stone — a slab and a block — that a stone only bounces off and an arrow glances from; only
   the thunder, or a heavy fall, breaks it. Registered here, never over a kind smash.js already has. */
const OWN_KINDS = {
  plank: { mat: 'wood', density: 0.0024, friction: 0.7, frictionStatic: 0.9, strength: 9, arrow: 'stick', points: 150, shards: 4, sound: 'crack', art: 'plank' },
  slab: { mat: 'stone', density: 0.0045, friction: 0.8, frictionStatic: 1, strength: 40, arrow: 'glance', points: 400, shards: 5, sound: 'stone', art: 'slab' },
  block: { mat: 'stone', density: 0.0045, friction: 0.8, frictionStatic: 1, strength: 40, arrow: 'glance', points: 400, shards: 6, sound: 'stone', art: 'block' },
};
for (const [k, v] of Object.entries(OWN_KINDS)) if (!KINDS[k]) KINDS[k] = v;

export const WEASEL_R = 11; // a weasel's round body (its painting stands a little taller)
export const HP = 3; //        the damage a weasel takes before it is gone
const HURT_MIN = 0.3; //       a blow under this is a nudge, nothing
export const KILL_PTS = 5000, LEFT_PTS = 2000;
const TAUNT_MS = 1700, WORRY_MS = 700, SETTLE_MIN = 400, SETTLE_MAX = 6000, CLEAR_MS = 1900, HIT_MS = 900;
const CUT = 4; // a dashed sword's weight against what it strikes (games.json `cut` on the sword)

/* ── The weasels ────────────────────────────────────────────────────────────────────────────── */

/** A weasel of a level: `at` its middle (sitting on what is under it), `face` 1 right, −1 left. */
function weaselOf(o, i) {
  const r = o.r ?? WEASEL_R;
  const body = Bodies.circle(o.at[0], o.at[1], r, { friction: 0.9, frictionStatic: 1, frictionAir: 0.02, restitution: 0.08, density: 0.0022, collisionFilter: FILTER.thing, label: 'weasel' });
  Sleeping.set(body, true);
  body.plugin = { weasel: i };
  return { id: i, body, r, hp: HP, dead: false, face: o.face ?? 1, home: [...o.at], hurtAt: null, worryUntil: 0, diedAt: null, at: null };
}

/** The world's ears for the weasels: every contact's blow on one is its damage (the other body's weight
    × the closing speed; the ground's, its own weight) — a falling block, a fall, a thrown stone. */
function hearWeasels(world) {
  Events.on(world.engine, 'collisionStart', (e) => {
    for (const p of e.pairs) for (const [me, other] of [[p.bodyA, p.bodyB], [p.bodyB, p.bodyA]]) {
      const w = me.plugin?.weasel != null ? world.weasels[me.plugin.weasel] : null;
      if (!w || w.dead || other.plugin?.weasel != null) continue;
      const n = p.collision?.normal ?? { x: 0, y: -1 };
      const vn = Math.abs((me.velocity.x - other.velocity.x) * n.x + (me.velocity.y - other.velocity.y) * n.y);
      const dmg = vn * (other.isStatic ? me.mass * 1.4 : Math.min(other.mass, 6));
      if (dmg >= HURT_MIN) hurt(world, w, dmg);
    }
  });
}
function hurt(world, w, dmg) {
  w.hp -= dmg;
  w.hurtAt = world.t ?? 0;
  world.hurtN = (world.hurtN ?? 0) + 1;
  if (w.hp > 0) cue(world, 'squeak', [w.body.position.x, w.body.position.y], Math.min(1, dmg / HP), { hurt: true });
}

/** Gone: 噗 — a puff of ink smoke, its points, and what it held up is let go. */
function poof(world, w, why = 'crush') {
  const { x, y } = w.body.position;
  w.dead = true;
  w.diedAt = world.t ?? 0;
  w.at = [x, y];
  w.why = why;
  Composite.remove(world.engine.world, w.body);
  world.score = (world.score ?? 0) + KILL_PTS;
  world.kills = (world.kills ?? 0) + 1;
  world.broke = [...(world.broke ?? []), { kind: 'weasel', points: KILL_PTS, at: [x, y], t: world.t ?? 0, kill: true }];
  cue(world, 'poof', [x, y], 1, { big: true, kill: true });
  world.stopUntil = (world.t ?? 0) + 70; // a beat held on every one
  wakeNear(world, [x, y], 70);
}

/** Wake what stands near a point: things, and the weasels on them (a weasel asleep never floats). */
function wakeNear(world, [x, y], r) {
  for (const t of world.things) if (t.smash && !t.broken && !t.body.isStatic && Math.hypot(t.body.position.x - x, t.body.position.y - y) < r + Math.max(...t.size)) Sleeping.set(t.body, false);
  for (const w of world.weasels) if (!w.dead && Math.hypot(w.body.position.x - x, w.body.position.y - y) < r + w.r) Sleeping.set(w.body, false);
}

/** A level's world: deerarc's ground and smash bodies, and the weasels in their fort. */
export function buildLevel(level) {
  const world = build(level);
  world.weasels = (level.weasels ?? []).map(weaselOf);
  Composite.add(world.engine.world, world.weasels.map((w) => w.body));
  world.brokeSeen = 0;
  hearWeasels(world);
  return world;
}

/* ── One step of the world ────────────────────────────────────────────────────────────────── */

const alive = (world) => world.weasels.filter((w) => !w.dead);
const speedOf = (b) => Math.hypot(b.velocity.x, b.velocity.y) + Math.abs(b.angularVelocity) * 10;

/** One step (1/60 s): the weasels fall as heavy as the fort, deerarc steps the world, then what it did
    to them: a throw that crossed one, what broke near one, who is gone, who is worried. → the throw's event. */
export function stepLevel(world, level, ms = 0) {
  const g = world.engine.gravity, extra = g.y * g.scale * THING_FALL;
  for (const w of alive(world)) if (!w.body.isSleeping) w.body.force.y += w.body.mass * extra;
  const ar = world.arrow, flying = Boolean(ar && !ar.done && ar.true && !ar.real);
  const ev = stepWorld(world, level, ms);
  for (const w of alive(world)) Body.setAngularVelocity(w.body, w.body.angularVelocity * 0.94); // they tumble, then sit
  // A broken thing lets go of what stood on it.
  for (const b of (world.broke ?? []).slice(world.brokeSeen)) if (!b.kill) wakeNear(world, b.at, 60);
  world.brokeSeen = (world.broke ?? []).length;
  const struck = flying ? strikeWeasels(world) : null;
  for (const w of alive(world)) {
    const { x, y } = w.body.position;
    if (w.hp <= 0 || y > 330 || x < -40 || x > 520) poof(world, w, w.hp <= 0 ? 'crush' : 'fall');
  }
  worry(world);
  return struck ?? ev;
}

/** A thrown blade or talisman (it touches nothing matter knows) crossed a weasel this step: the blade
    goes through it and on; the talisman bursts there. */
function strikeWeasels(world) {
  const ar = world.arrow;
  if (!ar?.prev) return null;
  for (const w of alive(world)) {
    if (!sweepBody(ar.prev, ar.tip, w.body)) continue;
    if (ar.proj.ability === 'burst') return blastAt(world, [w.body.position.x, w.body.position.y]);
    hurt(world, w, HP * 2);
  }
  return null;
}

/** Worried: something near it moves (or it does) — its eyes go wide for a while after. */
function worry(world) {
  const now = world.t ?? 0, movers = [];
  for (const t of world.things) if (t.smash && !t.broken && !t.body.isSleeping && !t.body.isStatic && speedOf(t.body) > 0.5) movers.push(t.body.position);
  for (const f of world.frags ?? []) if (!f.body.isSleeping && speedOf(f.body) > 0.8) movers.push(f.body.position);
  if (world.arrow && !world.arrow.done) movers.push(world.arrow.body.position);
  for (const w of alive(world)) {
    const p = w.body.position, near = movers.some((m) => Math.hypot(m.x - p.x, m.y - p.y) < 95);
    if (near || (!w.body.isSleeping && speedOf(w.body) > 0.4)) w.worryUntil = now + WORRY_MS;
  }
}

/* ── The throws' powers ───────────────────────────────────────────────────────────────────── */

/** The tap in flight: the sword dashes on and cuts (its weight against what it strikes × `cut`); the
    talisman bursts where it is. → 'dash' | 'burst' | null. */
export function tapThrow(world) {
  const ar = world.arrow, r = tapNow(ar, ar?.body.velocity);
  if (!r) return null;
  if (r.fx) ar.fx = [...(ar.fx ?? []), { ...r.fx, t: world.t ?? 0 }];
  if (r.velocity) {
    Body.setVelocity(ar.body, r.velocity);
    ar.proj = { ...ar.proj, mass: ar.proj.mass * (ar.proj.cut ?? CUT) };
    cue(world, 'dash', [...ar.tip], 1);
    return 'dash';
  }
  return blastAt(world, r.burst.at, r.burst.r);
}

/** 五雷: lightning where the talisman is. What is in its core breaks — stone too; what is in its reach is
    thrown outward; every weasel in its reach is gone. The throw is spent. */
export function blastAt(world, at, r = null) {
  const ar = world.arrow, reach = r ?? ar?.proj?.radius ?? 60, [x, y] = at;
  if (ar) {
    if (!ar.tapped) ar.fx = [...(ar.fx ?? []), { kind: 'burst', at: [x, y], r: reach, t: world.t ?? 0 }];
    ar.tapped = true;
    ar.true = false;
    ar.done = true;
    Body.setStatic(ar.body, true);
    Composite.remove(world.engine.world, ar.body);
  }
  cue(world, 'thunder', [x, y], 1, { big: true });
  world.stopUntil = (world.t ?? 0) + 90;
  for (const t of world.things) {
    if (!t.smash || t.broken || t.body.isStatic) continue;
    const b = t.body.position, dx = b.x - x, dy = b.y - y, d = Math.max(0, Math.hypot(dx, dy) - Math.min(...t.size) / 2), l = Math.hypot(dx, dy) || 1;
    if (d < reach * 0.55) shatter(world, t, [x, y], { x: (dx / l) * 4, y: (dy / l) * 4 - 1 });
    else if (d < reach) {
      Sleeping.set(t.body, false);
      const k = (1 - d / reach) * 5;
      Body.setVelocity(t.body, { x: t.body.velocity.x + (dx / l) * k, y: t.body.velocity.y + (dy / l) * k - k * 0.3 });
    }
  }
  for (const f of world.frags ?? []) {
    const dx = f.body.position.x - x, dy = f.body.position.y - y, d = Math.hypot(dx, dy) || 1;
    if (d < reach) { Sleeping.set(f.body, false); Body.setVelocity(f.body, { x: f.body.velocity.x + (dx / d) * 4, y: f.body.velocity.y + (dy / d) * 4 - 1 }); }
  }
  for (const w of alive(world)) if (Math.hypot(w.body.position.x - x, w.body.position.y - y) < reach + w.r) poof(world, w, 'thunder');
  return 'burst';
}

/** A talisman that strikes something before it is tapped bursts there (a talisman is spent on touch). */
const fuse = (world, ev) => (world.arrow?.proj?.ability === 'burst' && !world.arrow.tapped && ev && ev !== 'burst' && ev !== 'snap' ? blastAt(world, [...world.arrow.tip]) : ev);

/* ── The game ─────────────────────────────────────────────────────────────────────────────── */

/** The throws a level gives: `tray` {id: count} in its order. */
export const trayOf = (level) => Object.entries(level?.tray ?? { stone: 3 }).map(([id, n]) => ({ id, n }));
const leftOf = (s) => Object.values(s.left ?? {}).reduce((a, b) => a + b, 0);

function lay(s, li) {
  const level = s.levels[li], world = buildLevel(level);
  watch(s.seed, world);
  const left = Object.fromEntries(trayOf(level).map(({ id, n }) => [id, n]));
  const pick = left[s.pick] > 0 ? s.pick : trayOf(level)[0]?.id;
  return { ...s, li, world, left, pick, phase: 'aim', t: 0, clock: 0, used: 0, pull: null, press: null, aimed: null, stuck: [],
    trail: s.li === li ? s.trail : null, said: null, saidAt: null, tauntAt: null, points: 0, levelStars: 0, throwKills: 0, throwHurt: 0 };
}

export function newGame(seed, _level = 1, deal = {}) {
  const levels = Array.isArray(deal?.levels) ? deal.levels : [];
  const s = { seed: String(seed), live: levels.length > 0, levels, li: 0, phase: 'aim', t: 0, clock: 0, best: levels.map(() => 0), score: levels.map(() => 0),
    won: false, stars: 0, grade: null, still: Boolean(deal?.still), art: deal?.art ?? null, kit: deal?.projectiles ?? null, losses: levels.map(() => 0) };
  return levels.length ? lay(s, Math.max(0, Math.min(levels.length - 1, Number(deal?.start ?? 0) || 0))) : { ...s, phase: 'empty' };
}

const canAim = (s) => s.phase === 'aim';

function hold(s, d) {
  if (s.phase === 'fly') return tap(s); // a press in flight is the tap
  if (!canAim(s) || !Number.isFinite(Number(d.x))) return null;
  return { ...s, press: [Number(d.x), Number(d.y)], pull: { a: 15, p: 0 } };
}
function move(s, d) {
  if (!canAim(s) || !s.press || !Number.isFinite(Number(d.x))) return null;
  const pull = aimOf(s.press[0], s.press[1], Number(d.x), Number(d.y));
  const notch = (p) => (p >= 0.98 ? 3 : p >= 0.66 ? 2 : p >= 0.33 ? 1 : 0);
  if (notch(pull.p) > notch(s.pull?.p ?? 0)) cue(s.world, 'creak', BOW, pull.p);
  const dx = Number(d.x) - BOW[0], dy = Number(d.y) - BOW[1], r = Math.hypot(dx, dy), k = r > HAND_REACH ? HAND_REACH / r : 1;
  return { ...s, pull: { ...pull, hand: [BOW[0] + dx * k, BOW[1] + dy * k] } };
}
/** Drawn straight to an aim (the bot, the tests, a keyboard): `a` degrees, `p` 0–1. */
function draw(s, d) {
  if (!canAim(s)) return null;
  return { ...s, pull: { a: Math.max(-30, Math.min(85, Number(d.a) || 0)), p: Math.max(0, Math.min(1, Number(d.p) || 0)) } };
}
function loose(s) {
  if (!canAim(s) || !s.pull) return null;
  if (s.pull.p < MIN_POWER || !(s.left[s.pick] > 0)) return { ...s, pull: null, press: null };
  const proj = projectileOf(s.kit, s.pick);
  shoot(s.world, s.pull, proj);
  s.world.hurtN = 0;
  const kills = s.world.kills ?? 0;
  return { ...s, phase: 'fly', t: 0, used: s.used + 1, left: { ...s.left, [s.pick]: s.left[s.pick] - 1 }, aimed: s.pull, pull: null, press: null, said: null, killsBefore: kills };
}
function tap(s) {
  if (s.phase !== 'fly') return null;
  const r = tapThrow(s.world);
  if (!r) return null;
  return r === 'burst' ? { ...s, phase: 'settle', t: 0, said: 'burst', saidAt: s.clock, trail: s.world.arrow?.path ?? s.trail } : { ...s, said: 'dash', saidAt: s.clock };
}
function pickVerb(s, d) {
  if (!canAim(s) || !(s.left?.[d.p] > 0) || d.p === s.pick) return null;
  return { ...s, pick: d.p, pull: null, press: null };
}
const retry = (s) => (['aim', 'fly', 'settle', 'clear', 'lost'].includes(s.phase) ? lay({ ...s, trail: s.world?.arrow?.path ?? s.trail }, s.li) : null);
/** Straight to a level (the level-select): one he has reached — the first, or one after a level won. */
export const reached = (s, li) => li === 0 || (s.best?.[li - 1] ?? 0) > 0 || (s.best?.[li] ?? 0) > 0;
const go = (s, d) => { const li = Number(d.li); return Number.isInteger(li) && li >= 0 && li < s.levels.length && reached(s, li) && s.phase !== 'fly' ? lay({ ...s, trail: null }, li) : null; };

const VERBS = { hold, move, draw, tap, pick: pickVerb, release: loose, loose, retry, go, next: (s) => (s.phase === 'clear' ? advance(s) : null) };

export function act(state, data = {}) {
  if (!state || state.won || !state.live) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── Time ─────────────────────────────────────────────────────────────────────────────────── */

function flying(s) {
  const level = s.levels[s.li], ev = fuse(s.world, stepLevel(s.world, level, s.clock));
  if (!ev || GOES_ON.has(ev)) return s;
  if (ev === 'burst') return { ...s, phase: 'settle', t: 0, said: 'burst', saidAt: s.clock, trail: s.world.arrow?.path ?? s.trail };
  // The throw is spent (stuck, down, out): what it moved comes down.
  const ar = s.world.arrow, stuck = ar && !ar.real && ev !== 'out' && !ar.body.isStatic === false && ev !== 'burst'
    ? [...s.stuck, [ar.body.position.x, ar.body.position.y, (ar.body.angle * 180) / Math.PI, ar.proj.id]] : s.stuck;
  return { ...s, phase: 'settle', t: 0, trail: ar?.path ?? s.trail, stuck };
}

const weaselsStill = (world) => alive(world).every((w) => w.body.isSleeping || speedOf(w.body) < 0.08);

function settling(s) {
  stepLevel(s.world, s.levels[s.li], s.clock);
  const done = (s.t >= SETTLE_MIN && atRest(s.world) && weaselsStill(s.world)) || s.t >= SETTLE_MAX;
  return done ? afterThrow(s) : s;
}

/** After a throw has come to rest: all gone → the level won; the tray empty → lost; else aim again (a
    throw that touched none of them, the weasels jeer). */
function afterThrow(s) {
  const w = s.world, left = alive(w).length;
  clearThrow(w);
  if (!left) return won(s);
  if (!leftOf(s)) return { ...s, phase: 'lost', t: 0, said: 'lost', losses: s.losses.map((k, i) => (i === s.li ? k + 1 : k)) };
  const missed = (w.kills ?? 0) === (s.killsBefore ?? 0) && !(w.hurtN > 0);
  if (missed) cue(w, 'squeak', [alive(w)[0].body.position.x, alive(w)[0].body.position.y], 1, { taunt: true });
  const pick = s.left[s.pick] > 0 ? s.pick : Object.keys(s.left).find((k) => s.left[k] > 0);
  return { ...s, phase: 'aim', t: 0, pick, tauntAt: missed ? s.clock : null, said: missed ? 'taunt' : (w.kills ?? 0) > (s.killsBefore ?? 0) ? 'got' : 'shook', saidAt: s.clock, tauntN: (s.tauntN ?? 0) + (missed ? 1 : 0) };
}

/** A spent throw: a stone stays in the world, a blade stuck in wood rides it, the rest is taken away. */
function clearThrow(world) {
  const ar = world.arrow;
  if (!ar) return;
  if (ar.stuckIn) world.riders = [...(world.riders ?? []), ar];
  else if (ar.real && !ar.body.isStatic) world.thrown = [...(world.thrown ?? []), ar];
  else Composite.remove(world.engine.world, ar.body);
  world.arrow = null;
}

/** Points for a level won: what broke and toppled, every weasel, and every throw left in the tray. */
export const pointsOf = (s) => (s.world?.score ?? 0) + leftOf(s) * LEFT_PTS;

function won(s) {
  const level = s.levels[s.li], points = pointsOf(s), stars = level.score ? starsForScore(level.score, points) : 3;
  const best = s.best.map((b, i) => (i === s.li ? Math.max(b, stars) : b)), score = s.score.map((b, i) => (i === s.li ? Math.max(b, points) : b));
  cue(s.world, 'chime', [240, 150], 1);
  for (let i = 0; i < stars; i++) cue(s.world, 'pop', [240, 150], 0.7, { i, star: true });
  return { ...s, phase: 'clear', t: 0, points, levelStars: stars, best, score, said: 'clear' };
}

function advance(s) {
  if (s.li + 1 < s.levels.length) return lay({ ...s, trail: null }, s.li + 1);
  const stars = Math.round(s.best.reduce((a, b) => a + b, 0) / s.best.length);
  return { ...s, phase: 'end', live: false, won: true, stars, grade: stars >= 3 ? 'clean' : stars === 2 ? 'steady' : 'rough' };
}

const PHASES = {
  aim: (s) => (stepLevel(s.world, s.levels[s.li], s.clock), s),
  fly: flying,
  settle: settling,
  // Three stars go on by themselves; fewer wait for 下一关 or 再来.
  clear: (s) => (s.t < CLEAR_MS || s.best[s.li] < 3 || s.hold ? s : advance(s)),
  lost: (s) => s,
};

/** The slow beats: a weasel gone or a big break holds a moment; a collapse (three things in half a second) runs slow. */
function slowness(s) {
  if (s.still) return 1;
  const w = s.world, now = w?.t ?? 0;
  if (w?.stopUntil != null && now < w.stopUntil) return 3;
  const recent = (w?.broke ?? []).filter((b) => now - b.t < 500).length;
  return recent >= 3 && s.phase !== 'aim' ? 1.8 : 1;
}

export function tick(state, ms) {
  if (!state?.live || state.won || !state.world) return state;
  let s = state;
  s.world.acc += ms;
  while (s.world.acc >= STEP_MS * slowness(s) && s.live && !s.won) {
    s.world.acc -= STEP_MS * slowness(s);
    s = { ...s, t: s.t + STEP_MS, clock: s.clock + STEP_MS };
    s = PHASES[s.phase]?.(s) ?? s;
  }
  // What the painter (deerarc.js, juice.js) reads between steps.
  Object.assign(s.world, { wall: globalThis.performance?.now() ?? 0, clock: s.clock, phase: s.phase, art: s.art, level: s.levels[s.li], rate: slowness(s) });
  return s;
}

/** Stuck: the same level lost again and again. */
export const stuck = (s) => !s.won && (s.losses?.[s.li] ?? 0) >= 3;

/* ── What the picture reads ───────────────────────────────────────────────────────────────── */

/** A weasel's look now: 'poof' (gone, its puff still there), 'hit' (just hurt), 'worried', 'taunt', 'idle'. */
export function lookOf(s, w) {
  const now = s.world?.t ?? 0;
  if (w.dead) return now - w.diedAt < 700 ? 'poof' : null;
  if (w.hurtAt != null && now - w.hurtAt < 380) return 'hit';
  if (now < w.worryUntil || s.phase === 'fly') return s.phase === 'fly' && now >= w.worryUntil ? 'worried' : 'worried';
  if (s.tauntAt != null && s.clock - s.tauntAt < TAUNT_MS) return 'taunt';
  return 'idle';
}
export { HIT_MS, TAUNT_MS };
export { html, mount } from './zhazhai-view.js';
