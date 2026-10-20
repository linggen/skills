// core.js — 守墙关 (wall defense), the engine: pure, seeded, no DOM, no Phaser — the play (shouqiang.min.mjs) draws
// what this holds, and tests/game-shouqiang.test.mjs runs it headless with bots. Every number comes from the level
// file (worlds/jiuding/levels/shouqiang.json): beasts, the heroes' base shots, the cards.
//
// The board is 540×960, y down. Beasts come down from above the top edge to the wall's face (`wallY`), stop there and
// bite the wall. 小满 (on the wall) throws flying swords and, with cards, the talismans; 银月 beside him spits a spirit
// bolt. Phases: lead (the first countdown, the lead-in lines) → wave → pick (the game waits for a card) → count → wave …
// → won | lost. The game never waits for a "start wave" tap; only the pick waits.
//
// What happened in a step is pushed to `g.events` (the play drains it): spawn, hit, kill, boom, chain, strike, howl,
// wail, roar, cast, fade, wall, wave, clear, offer, boss, low, won, lost.
//
// LANE MODE (levels 2–5, the 药园 at night; Hanli 10-20: 「植物大战僵尸方向好, 策略更多」「第一关没有"植物", 后面可以布置
// 植物」): a level with a `grid` is played in lanes. The field is `grid.cols` vertical lanes; beasts walk straight down
// their lane; the player spends 灵气 (`g.ling`) to place talismans (`units`) on the grid's cells in front of the wall —
// a shooter fires up its lane, the 聚灵阵 makes 灵气 orbs, the 土墙符 blocks, the 寒符 slows, the 雷符 bursts once. A beast
// meets the first talisman in its lane and chews it (狰 leaps the first one, 鬿雀 flies over all). 小满 and 银月 only
// guard the wall's foot (`guard` px above its face). Nothing hits above the range line here either. Logic knows
// lanes and distance only: the play lays the same field out in portrait or landscape. Lane-mode events: place, orb,
// collect, chew, unitDie, leap, crack, bomb, shot, huge.

export const W = 540, H = 960;
export const HERO = { x: 270, y: 846 };
export const FOX = { x: 188, y: 868 };
/** 小满's raised hand: his hovering sword waits there, tip up-field, and the volleys launch from it (Hanli 10-20:
 *  「小满手上的剑, 不要剑锋对着自己」 — no blade, painted or flying, ever points at him). */
export const HAND = { x: HERO.x + 40, y: HERO.y - 104 };
const STEP = 1 / 60;

/** A string seed → a small fast generator (games/seeded.js's, kept here so the bundle needs nothing else). */
export function rng(seed) {
  let a = 2166136261 >>> 0;
  for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (arr, lv) => (Array.isArray(arr) ? arr[Math.min(lv, arr.length) - 1] : arr);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** A new game on `level` (a row of levels/shouqiang.json), with that file's `kit` (beasts, hero, cards). */
export function newGame(kit, level, { seed = 'x' } = {}) {
  return {
    kit, level, rnd: rng(seed), t: 0, phase: 'lead', timer: level.leadSec ?? 5,
    wave: 0, waves: level.waves.length, wall: level.wall, wallMax: level.wall,
    beasts: [], shots: [], grounds: [], spawns: [], nextId: 1,
    skills: {}, cool: { sword: 0.4, fox: 0.8 }, focus: null, offer: null,
    kills: 0, low: false, events: [],
    beastKit: beastsOf(kit, level),
    ...(level.grid ? laneState(kit, level) : {}),
  };
}

/** The beasts' stats for a level: the kit's, with each lane-mode override (`kit.laneBeasts`) merged on a lane level. */
export function beastsOf(kit, level) {
  if (!level.grid) return kit.beasts;
  return Object.fromEntries(Object.entries(kit.beasts).filter(([k]) => !k.startsWith('_'))
    .map(([k, b]) => [k, { ...b, ...(kit.laneBeasts?.[k] ?? {}) }]));
}

const lv = (g, id) => g.skills[id] ?? 0;
const card = (g, id) => g.kit.cards.find((c) => c.id === id);
const emit = (g, e) => { g.events.push(e); };

// ---- waves -------------------------------------------------------------------------------------------------------

function startWave(g) {
  g.phase = 'wave';
  // `difficulty` (the level's one knob, 1 = as tuned) scales every wave's beast count and hp — never the boss count.
  const k = g.level.difficulty ?? 1, mul = waveMul(g, g.wave) * k;
  g.spawns = g.level.waves[g.wave].flatMap(([kind, n, gap, delay, lane]) =>
    Array.from({ length: g.beastKit[kind].boss ? n : Math.max(1, Math.round(n * k)) }, (_, i) => ({ kind, at: g.t + delay + i * gap, mul, lane })));
  g.wave += 1;
  if (g.level.huge?.includes(g.wave)) emit(g, { t: 'huge', n: g.wave });
  emit(g, { t: 'wave', n: g.wave, of: g.waves });
}

/** The beasts' hp × for wave `i` (0-based): hpMul grown by `growth` a wave. */
const waveMul = (g, i) => (g.level.hpMul ?? 1) * (1 + (g.level.growth ?? 0) * i);

function spawn(g, { kind, mul, lane }, near) {
  const b = g.beastKit[kind];
  let x = near ? Math.max(60, Math.min(W - 60, near.x + (g.rnd() - 0.5) * 140)) : 70 + g.rnd() * (W - 140);
  let y = near ? near.y + 20 : -40 - g.rnd() * 30;
  let col = null;
  if (g.grid) {
    // A lane: the wave's own, else drawn; a wail's calls go to the lanes either side of the caller.
    col = near ? clampCol(g, near.col + (g.rnd() < 0.5 ? -1 : 1)) : Array.isArray(lane) ? lane[Math.floor(g.rnd() * lane.length)] : lane ?? pickLane(g);
    x = laneX(g, col);
    y = near ? near.y : (g.level.spawnY ?? -40) - g.rnd() * 20;
  }
  const hp = Math.round(b.hp * (b.boss ? (g.level.hpMul ?? 1) * (g.level.difficulty ?? 1) : mul));
  const beast = { id: g.nextId++, kind, x, y, col, hp, max: hp, shell: b.shell ? Math.round(hp * (1 - b.shell)) : 0, leapt: false, leap: null,
    speed: b.speed * (0.9 + g.rnd() * 0.2), r: b.r,
    fly: Boolean(b.fly), boss: Boolean(b.boss), slow: 0, slowT: 0, freezeT: 0, stunT: 0, burnT: 0, burn: 0,
    wailT: 0, wailIn: b.wail?.every ?? 0, atWall: false, sway: g.rnd() * 6.28, hitBy: new Set() };
  g.beasts.push(beast);
  emit(g, { t: 'spawn', id: beast.id, kind });
  if (beast.boss) emit(g, { t: 'boss', id: beast.id });
}

function runSpawns(g) {
  while (g.spawns.length && g.spawns[0].at <= g.t) spawn(g, g.spawns.shift());
  g.spawns.sort((a, b) => a.at - b.at);
}

// ---- damage ------------------------------------------------------------------------------------------------------

/** Hurt one beast; `kind` is sword | fire | frost | thunder | fox | howl | ground (armour reads it). */
export function hurt(g, b, dmg, kind, extra = {}) {
  if (!inReach(g, b)) return 0;
  const k = g.beastKit[b.kind];
  let d = dmg * (k.armor?.[kind] ?? 1);
  if (b.freezeT > 0) d *= at(card(g, 'han-freeze').takes, lv(g, 'han-freeze')) ?? 1;
  if (b.wailT > 0) d *= k.wail.takes;
  d = Math.max(0, Math.round(d));
  if (!d) return 0;
  const shelled = b.shell > 0 && b.hp > b.shell;
  b.hp -= d;
  emit(g, { t: 'hit', id: b.id, x: b.x, y: b.y, dmg: d, kind, big: d >= 60 || extra.big, weak: (k.armor?.[kind] ?? 1) < 1 || shelled });
  if (shelled && b.hp <= b.shell && b.hp > 0) emit(g, { t: 'crack', id: b.id, x: b.x, y: b.y });
  if (b.hp <= 0) kill(g, b);
  return d;
}

function kill(g, b) {
  g.kills += 1;
  emit(g, { t: 'kill', id: b.id, kind: b.kind, x: b.x, y: b.y, boss: b.boss });
}

/** The range line: 小满's and 银月's reach ends at `rangeY` (level data). Above it a beast is seen, never hit. */
export const reachY = (g) => g.level.rangeY ?? -Infinity;
const inReach = (g, b) => b.hp > 0 && b.y >= reachY(g);
const alive = (g) => g.beasts.filter((b) => inReach(g, b));

function inRadius(g, x, y, r, { air = true } = {}) {
  return alive(g).filter((b) => (air || !b.fly) && Math.hypot(b.x - x, b.y - y) <= r + b.r * 0.5);
}

// The heroes' reach: the range line; in lane mode only the wall's foot (`guard` px above its face, more with a card).
const heroReach = (g, b) => inReach(g, b) && (!g.grid || b.y >= g.level.wallY - guardOf(g));

// The one to shoot: the focus while it lives, else the one nearest the wall.
function target(g) {
  const f = g.beasts.find((b) => b.id === g.focus && b.hp > 0);
  if (f && heroReach(g, f)) return f;
  if (!f && g.focus) g.focus = null;
  let best = null;
  for (const b of g.beasts) if (heroReach(g, b) && (!best || b.y > best.y)) best = b;
  return best;
}

// Where a blast hurts most: the beast with the most others within r (ties: the one nearer the wall).
function crowd(g, r) {
  const list = alive(g).filter((b) => b.y > 20);
  let best = null, bestN = -1;
  for (const b of list) {
    const n = list.reduce((s, o) => s + (Math.hypot(o.x - b.x, o.y - b.y) < r ? 1 : 0), 0) + b.y / 2000;
    if (n > bestN) { best = b; bestN = n; }
  }
  return best;
}

// ---- shots (things in flight) ------------------------------------------------------------------------------------

function shoot(g, s) {
  const shot = { id: g.nextId++, age: 0, hit: new Set(), ...s };
  notAtHim(shot);
  g.shots.push(shot);
}

function aim(from, to, speed, spread = 0) {
  const a = Math.atan2(to.y - from.y, to.x - from.x) + spread;
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}

function fireSwords(g) {
  const t = target(g);
  if (!t) return;
  const h = g.kit.hero.sword, n = 1 + lv(g, 'jian-more'), pierce = at(card(g, 'jian-pierce').n, lv(g, 'jian-pierce')) ?? 0;
  const dmg = h.dmg + (at(card(g, 'jian-pierce').dmg, lv(g, 'jian-pierce')) ?? 0);
  for (let i = 0; i < n; i += 1) {
    const spread = (i - (n - 1) / 2) * 0.13;
    shoot(g, { kind: 'sword', x: HAND.x + (i - (n - 1) / 2) * 14, y: HAND.y, ...aim(HAND, t, h.speed, spread),
      dmg, r: h.r, pierce: 1 + pierce, home: t.id });
  }
  emit(g, { t: 'cast', who: 'xm', kind: 'sword' });
}

function fireFox(g) {
  const t = target(g);
  if (!t) return;
  const f = lv(g, 'yy-foxfire'), c = card(g, 'yy-foxfire'), h = g.kit.hero.fox;
  const n = f ? at(c.shots, f) : 1;
  const foes = alive(g).filter((b) => b.y > -10).sort((a, b) => b.y - a.y).slice(0, n);
  for (const b of foes.length ? foes : [t]) {
    shoot(g, { kind: f ? 'foxfire' : 'fox', x: FOX.x, y: FOX.y - 20, ...aim(FOX, b, h.speed), dmg: f ? at(c.dmg, f) : h.dmg,
      r: h.r, pierce: 1, splash: f ? at(c.radius, f) : 0, home: b.id });
  }
  emit(g, { t: 'cast', who: 'yy', kind: f ? 'foxfire' : 'fox' });
}

// A talisman lobbed at a spot: lands after `fly` seconds and bursts.
function lob(g, kind, to, extra) {
  shoot(g, { kind, x: HERO.x, y: HERO.y - 30, fromX: HERO.x, fromY: HERO.y - 30, toX: to.x, toY: to.y + 18, fly: 0.45, lob: true, ...extra });
  emit(g, { t: 'cast', who: 'xm', kind });
}

const CASTS = {
  huo(g) {
    const L = lv(g, 'huo-blast'), c = card(g, 'huo-blast');
    const t = crowd(g, at(c.radius, L));
    if (!t) return false;
    lob(g, 'huo', t, { dmg: at(c.dmg, L), radius: at(c.radius, L) });
    return at(c.every, L);
  },
  han(g) {
    const L = lv(g, 'han-slow'), c = card(g, 'han-slow');
    const t = crowd(g, at(c.radius, L));
    if (!t) return false;
    lob(g, 'han', t, { dmg: at(c.dmg, L), radius: at(c.radius, L) });
    return at(c.every, L);
  },
  lei(g) {
    const L = lv(g, 'lei-chain'), c = card(g, 'lei-chain');
    const first = target(g);
    if (!first) return false;
    const pts = [{ x: HERO.x, y: HERO.y - 40 }];
    let cur = first, dmg = at(c.dmg, L);
    const done = new Set();
    for (let j = 0; cur && j <= at(c.jumps, L); j += 1) {
      done.add(cur.id);
      pts.push({ x: cur.x, y: cur.y });
      hurt(g, cur, dmg, 'thunder');
      dmg *= 0.88;
      const from = cur;
      cur = alive(g).filter((b) => !done.has(b.id) && dist(b, from) <= c.reach).sort((a, b) => dist(a, from) - dist(b, from))[0];
    }
    emit(g, { t: 'chain', pts });
    emit(g, { t: 'cast', who: 'xm', kind: 'lei' });
    return at(c.every, L);
  },
  strike(g) {
    const L = lv(g, 'lei-strike'), c = card(g, 'lei-strike');
    const t = alive(g).filter((b) => b.y > 20).sort((a, b) => b.hp - a.hp)[0];
    if (!t) return false;
    emit(g, { t: 'strike', x: t.x, y: t.y, r: c.radius });
    for (const b of inRadius(g, t.x, t.y, c.radius)) {
      hurt(g, b, b === t ? at(c.dmg, L) : at(c.dmg, L) * 0.35, 'thunder', { big: b === t });
      b.stunT = Math.max(b.stunT, c.stun);
    }
    return at(c.every, L);
  },
  howl(g) {
    const L = lv(g, 'yy-howl'), c = card(g, 'yy-howl');
    const foes = alive(g).filter((b) => b.y > -10);
    if (!foes.length) return false;
    emit(g, { t: 'howl', x: FOX.x, y: FOX.y });
    for (const b of foes) {
      if (!b.boss) b.stunT = Math.max(b.stunT, at(c.stun, L));
      hurt(g, b, at(c.dmg, L), 'howl');
    }
    return at(c.every, L);
  },
};
const CAST_NEEDS = { huo: 'huo-blast', han: 'han-slow', lei: 'lei-chain', strike: 'lei-strike', howl: 'yy-howl' };

function burst(g, s) {
  const air = s.kind !== 'huo' || true;
  const hits = inRadius(g, s.x, s.y, s.radius, { air });
  emit(g, { t: 'boom', kind: s.kind, x: s.x, y: s.y, r: s.radius });
  const BURSTS = {
    huo: (b) => hurt(g, b, s.dmg, 'fire'),
    han: (b) => {
      const L = lv(g, 'han-slow'), c = card(g, 'han-slow');
      b.slow = at(c.slow, L); b.slowT = at(c.for, L);
      const F = lv(g, 'han-freeze');
      if (F && !b.boss) b.freezeT = at(card(g, 'han-freeze').for, F);
      hurt(g, b, s.dmg, 'frost');
    },
    foxfire: (b) => hurt(g, b, s.dmg, 'fox'),
  };
  for (const b of hits) BURSTS[s.kind](b);
  const G = lv(g, 'huo-ground');
  if (s.kind === 'huo' && G) {
    const c = card(g, 'huo-ground');
    const ground = { id: g.nextId++, x: s.x, y: s.y, r: s.radius * 0.85, dps: at(c.dps, G), life: at(c.for, G), max: at(c.for, G) };
    g.grounds.push(ground);
    emit(g, { t: 'ground', ...ground });
  }
}

function notAtHim(s) {
  if (s.kind !== 'sword' || !towardHim(s)) return;
  const sp = Math.hypot(s.vx, s.vy);
  s.vy = 0; s.vx = Math.sign(s.vx || 1) * sp;
  if (towardHim(s)) s.vx = -s.vx;
}

/** True when a flying sword's line of flight runs through 小满 (within his body's ~36 px of his chest, ahead of it). */
export function towardHim(s) {
  const dx = HERO.x - s.x, dy = HERO.y - 50 - s.y, sp = Math.hypot(s.vx, s.vy);
  if (!sp) return false;
  const along = (dx * s.vx + dy * s.vy) / sp;
  return along > 0 && Math.abs(dx * s.vy - dy * s.vx) / sp < 36;
}

function moveShot(g, s, dt) {
  s.age += dt;
  if (s.lane != null) return moveBolt(g, s, dt);
  if (s.lob) {
    const k = Math.min(1, s.age / s.fly);
    s.x = s.fromX + (s.toX - s.fromX) * k;
    s.y = s.fromY + (s.toY - s.fromY) * k;
    s.z = Math.sin(k * Math.PI) * 90;
    if (k >= 1) { burst(g, s); s.dead = true; }
    return;
  }
  // Homing a little toward the one it was fired at (a sword that curls in looks alive; misses look broken). A 回旋
  // sword turns harder, so its sideways start bends into an arc.
  const home = g.beasts.find((b) => b.id === s.home && b.hp > 0);
  // In the 药园 the heroes only guard the wall's foot: a shot whose beast is gone fades rather than fly up the beds.
  if (g.grid && !home) return fade(g, s);
  if (home) {
    const want = Math.atan2(home.y - s.y, home.x - s.x), sp = Math.hypot(s.vx, s.vy), turn = s.arcing ? 7 : 6;
    let cur = Math.atan2(s.vy, s.vx), d = want - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cur += Math.max(-turn * dt, Math.min(turn * dt, d));
    s.vx = Math.cos(cur) * sp; s.vy = Math.sin(cur) * sp;
  }
  // A sword never points at 小满 (Hanli 10-20: 「别对着自己」「不要剑锋对着自己」): one whose line of flight would run
  // through him runs level across the road instead. It may dip toward a beast biting the wall beside him (launched from his raised
  // hand, those are a little below it), never at him.
  notAtHim(s);
  if (s.arcing) {
    s.arcAge += dt;
    if (s.arcAge > 1.1) return fade(g, s);
  }
  s.x += s.vx * dt; s.y += s.vy * dt;
  for (const b of g.beasts) {
    if (!heroReach(g, b) || s.hit.has(b.id) || Math.hypot(b.x - s.x, b.y - s.y) > b.r + s.r) continue;
    s.hit.add(b.id);
    if (s.splash) { burst(g, { ...s, radius: s.splash }); s.dead = true; return; }
    const arc = s.arcing ? at(card(g, 'jian-arc').dmg, lv(g, 'jian-arc')) : 1;
    hurt(g, b, s.dmg * arc, s.kind === 'sword' ? 'sword' : 'fox');
    s.pierce -= 1;
    if (s.pierce <= 0) return void arcOrEnd(g, s);
  }
  if (s.y < -60 || s.x < -60 || s.x > W + 60 || s.y > H) s.dead = true;
}

// 剑阵 · 回旋: a sword that has struck swings off sideways in an arc to one more beast (two at L2), never back
// toward the wall, then dissolves in light up the road. No 回旋 (or no beast to swing to): it ends where it hit.
function arcOrEnd(g, s) {
  const L = s.kind === 'sword' && !s.arcing ? lv(g, 'jian-arc') : 0;
  const next = L ? alive(g).filter((b) => !s.hit.has(b.id) && b.y < s.y + 30 && b.y > -10 && dist(b, s) < 320)
    .sort((a, b) => dist(a, s) - dist(b, s))[0] : null;
  if (!next) return s.arcing ? fade(g, s) : void (s.dead = true);
  const sp = Math.hypot(s.vx, s.vy), side = next.x >= s.x ? 1 : -1;
  s.arcing = true; s.arcAge = 0; s.home = next.id;
  s.pierce = at(card(g, 'jian-arc').hits, L);
  s.vx = side * sp * 0.92; s.vy = -sp * 0.4;
  notAtHim(s);
}

function fade(g, s) {
  s.dead = true;
  emit(g, { t: 'fade', x: s.x, y: s.y });
}

// ---- beasts ------------------------------------------------------------------------------------------------------

function moveBeast(g, b, dt) {
  for (const k of ['slowT', 'freezeT', 'stunT', 'burnT', 'wailT']) b[k] = Math.max(0, b[k] - dt);
  const k = g.beastKit[b.kind];
  if (k.wail) wail(g, b, k.wail, dt);
  if (g.grid) return moveLane(g, b, k, dt);
  const held = b.freezeT > 0 || b.stunT > 0;
  const wallY = g.level.wallY - b.r * 0.4;
  if (b.y >= wallY) {
    if (!b.atWall) { b.atWall = true; b.biteIn = 0.3; }
    if (held) return;
    b.biteIn -= dt;
    if (b.biteIn <= 0) {
      b.biteIn = 1;
      const bite = k.bite * (b.slowT > 0 ? 1 - b.slow * 0.5 : 1);
      g.wall = Math.max(0, g.wall - bite);
      emit(g, { t: 'wall', dmg: bite, x: b.x, id: b.id });
    }
    return;
  }
  if (held) return;
  if (k.march && march(g, b, k.march, dt)) return;
  const sp = (k.march && !b.roared ? k.march.speed : b.speed) * (b.slowT > 0 ? 1 - b.slow : 1) * (b.wailT > 0 ? 0 : 1);
  b.sway += dt * 3;
  b.x = Math.max(40, Math.min(W - 40, b.x + Math.sin(b.sway) * (b.fly ? 22 : 8) * dt));
  b.y = Math.min(wallY, b.y + sp * dt);
}

// A boss with a `march` strides down the road in plain view, stops just above the range line and roars for
// `march.roar` seconds (true while it stands), then crawls on into reach.
function march(g, b, m, dt) {
  if (!b.roared && b.y >= reachY(g) - (m.stop ?? 40)) {
    b.roared = true;
    b.roarT = m.roar;
    emit(g, { t: 'roar', id: b.id, x: b.x, y: b.y });
  }
  if (!(b.roarT > 0)) return false;
  b.roarT -= dt;
  return true;
}

function wail(g, b, w, dt) {
  if (b.wailT > 0) return;
  b.wailIn -= dt;
  if (b.wailIn > 0 || !inReach(g, b)) return;
  b.wailIn = w.every;
  b.wailT = w.for;
  emit(g, { t: 'wail', id: b.id, x: b.x, y: b.y });
  const [kind, n] = w.calls;
  for (let i = 0; i < n; i += 1) spawn(g, { kind, mul: waveMul(g, g.wave - 1) * (g.level.difficulty ?? 1) }, b);
}

function burnGrounds(g, dt) {
  for (const z of g.grounds) {
    z.life -= dt;
    z.tick = (z.tick ?? 0) - dt;
    if (z.tick > 0) continue;
    z.tick = 0.5;
    for (const b of inRadius(g, z.x, z.y, z.r, { air: false })) hurt(g, b, z.dps * 0.5, 'ground');
  }
  g.grounds = g.grounds.filter((z) => z.life > 0);
}

// ---- the clock ---------------------------------------------------------------------------------------------------

function heroes(g, dt) {
  for (const k of Object.keys(g.cool)) g.cool[k] -= dt;
  if (g.cool.sword <= 0 && target(g)) { fireSwords(g); g.cool.sword = g.kit.hero.sword.every; }
  if (g.cool.fox <= 0 && target(g)) { fireFox(g); g.cool.fox = g.kit.hero.fox.every; }
  for (const [cast, need] of Object.entries(CAST_NEEDS)) {
    if (!lv(g, need)) continue;
    if ((g.cool[cast] ?? 0) > 0) continue;
    const again = CASTS[cast](g);
    g.cool[cast] = again === false ? 0.25 : again;
  }
}

function tick(g, dt) {
  g.t += dt;
  if (g.grid && g.phase !== 'pick' && g.phase !== 'won' && g.phase !== 'lost') economy(g, dt);
  const TIMED = {
    lead: () => { g.timer -= dt; if (g.timer <= 0) startWave(g); },
    count: () => { g.timer -= dt; if (g.timer <= 0) startWave(g); },
    wave: () => fight(g, dt),
  };
  TIMED[g.phase]?.(dt);
}

function fight(g, dt) {
  runSpawns(g);
  if (g.grid) sortLanes(g);
  heroes(g, dt);
  if (g.grid) unitsAct(g, dt);
  for (const b of g.beasts) if (b.hp > 0) moveBeast(g, b, dt);
  for (const s of g.shots) moveShot(g, s, dt);
  burnGrounds(g, dt);
  if (g.grid) g.units = g.units.filter((u) => u.hp > 0);
  g.shots = g.shots.filter((s) => !s.dead);
  g.beasts = g.beasts.filter((b) => b.hp > 0);
  if (!g.low && g.wall < g.wallMax * 0.3 && g.wall > 0) { g.low = true; emit(g, { t: 'low' }); }
  if (g.wall <= 0) return end(g, false);
  if (!g.spawns.length && !g.beasts.length) {
    g.shots = g.shots.filter((s) => s.lob);
    if (g.grid) collectAll(g);
    emit(g, { t: 'clear', n: g.wave });
    if (g.wave >= g.waves) return end(g, true);
    g.phase = 'pick';
    g.offer = offerCards(g);
    emit(g, { t: 'offer', cards: g.offer });
  }
}

function end(g, won) {
  g.phase = won ? 'won' : 'lost';
  emit(g, { t: won ? 'won' : 'lost', stars: stars(g) });
}

/** Advance the game by `dt` seconds (in fixed steps, so a frame hitch never changes the outcome). */
export function step(g, dt) {
  g.acc = (g.acc ?? 0) + Math.min(dt, 0.25);
  while (g.acc >= STEP) {
    g.acc -= STEP;
    tick(g, STEP);
  }
}

/** Stars from the wall left: 0 when lost. */
export function stars(g) {
  if (g.wall <= 0 || g.phase === 'lost') return 0;
  const left = g.wall / g.wallMax, [three, two] = g.level.stars;
  return left >= three ? 3 : left >= two ? 2 : 1;
}

// ---- cards -------------------------------------------------------------------------------------------------------

/** The cards one could take now: not maxed, and its `needs` held. */
export function open(g) {
  if (g.grid) return (g.kit.unitCards ?? []).filter((c) => lv(g, c.id) < c.max && (!c.unit || g.level.units.includes(c.unit)));
  return g.kit.cards.filter((c) => lv(g, c.id) < c.max && (!c.needs || lv(g, c.needs) > 0));
}

/** Three different cards (fewer if fewer are open), drawn by the seed. */
export function offerCards(g) {
  const pool = open(g).map((c) => c.id);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(g.rnd() * pool.length), 1)[0]);
  return out;
}

/** Take one of the offered cards (null: take none — the lazy bot) and count down to the next wave. */
export function pick(g, id) {
  if (g.phase !== 'pick') return false;
  if (id != null) {
    if (!g.offer.includes(id)) return false;
    g.skills[id] = lv(g, id) + 1;
    if (g.grid) cardTaken(g, id);
    if (CAST_NEEDS[Object.keys(CAST_NEEDS).find((k) => CAST_NEEDS[k] === id)] && g.skills[id] === 1) {
      g.cool[Object.keys(CAST_NEEDS).find((k) => CAST_NEEDS[k] === id)] = 0.6;
    }
  }
  emit(g, { t: 'picked', id });
  g.offer = null;
  g.phase = 'count';
  g.timer = g.level.between ?? 3;
  return true;
}

/** Click a beast to make it everyone's target (null clears). */
export function setFocus(g, id) {
  g.focus = g.beasts.some((b) => b.id === id && b.hp > 0) ? id : null;
  return g.focus;
}

// ---- lane mode: the 药园 (levels 2–5) -----------------------------------------------------------------------------
//
// The framework is 植物大战僵尸's (Hanli 10-20: 「借用它经过验证的数值框架」), mapped onto ours: 灵气 is the sun (start
// 50; a 聚灵阵 costs 50 and drops 25 every 24 s, the first ~7 s after it is set; the night sky lets fall 25 every ~10 s),
// the talismans cost 50–175 with PvZ's recharges, a shooter's sword does 20 every 1.5 s, a beast chews 100 hp/s, a
// 土墙符 holds 4000, a 雷符 bursts for 1800 over 3×3 cells. Beasts keep PvZ's hp ratios: 野猪 270 (the basic), 狰 500
// (the vaulter: fast until it has leapt), 犰狳 1370 (the bucket: a shell of 1100 over a 270 body), 鬿雀 300 (flies),
// 合窳 3000 (the giant: smashes what it meets). Names, art and story are ours. All numbers live in the level file.

function laneState(kit, level) {
  const gr = level.grid;
  const ch = (gr.bottom - gr.top) / gr.rows;
  const seedCool = {};
  for (const k of level.units) seedCool[k] = kit.units[k].startCool ?? 0;
  return {
    grid: { ...gr, ch, cw: W / gr.cols }, units: [], orbs: [], ling: level.ling ?? 50, seedCool,
    skyIn: level.sky?.first ?? 6, lanes: Array.from({ length: gr.cols }, () => []), lastLane: -1,
  };
}

export const laneX = (g, col) => (col + 0.5) * g.grid.cw;
/** A cell's centre: row 0 is the one against the wall, `rows − 1` the one nearest the range line. */
export const cellY = (g, row) => g.grid.bottom - (row + 0.5) * g.grid.ch;
const clampCol = (g, c) => Math.max(0, Math.min(g.grid.cols - 1, c));
/** The cell under a board point, or null off the grid. */
export function cellAt(g, x, y) {
  if (!g.grid || y < g.grid.top || y > g.grid.bottom || x < 0 || x >= W) return null;
  return { col: Math.floor(x / g.grid.cw), row: Math.min(g.grid.rows - 1, Math.floor((g.grid.bottom - y) / g.grid.ch)) };
}

// A drawn lane, never the same one three times running (a run of one lane reads as a bug, not a horde).
function pickLane(g) {
  let c = Math.floor(g.rnd() * g.grid.cols);
  if (c === g.lastLane && g.rnd() < 0.5) c = (c + 1 + Math.floor(g.rnd() * (g.grid.cols - 1))) % g.grid.cols;
  g.lastLane = c;
  return c;
}

/** A unit's number at the card level held now: the card's list (by its level) over the kit's base. */
export function unitStat(g, kind, key) {
  const base = g.kit.units[kind];
  for (const c of g.kit.unitCards ?? []) {
    if (c.unit !== kind || !(key in c) || !lv(g, c.id)) continue;
    return at(c[key], lv(g, c.id));
  }
  return key in base ? base[key] : base.shoot?.[key] ?? base.make?.[key] ?? base.bomb?.[key];
}

const guardOf = (g) => {
  const c = (g.kit.unitCards ?? []).find((x) => x.guard);
  return (c && lv(g, c.id) ? at(c.guard, lv(g, c.id)) : 0) + (g.level.guard ?? 0);
};

/** Why `kind` can't go on (col,row) now — '' when it can. */
export function canPlace(g, kind, col, row) {
  if (!g.grid) return 'no-grid';
  if (!['lead', 'count', 'wave'].includes(g.phase)) return 'phase';
  if (!g.level.units.includes(kind)) return 'locked';
  if (!(col >= 0 && col < g.grid.cols && row >= 0 && row < g.grid.rows)) return 'off-grid';
  if (g.units.some((u) => u.col === col && u.row === row && u.hp > 0)) return 'taken';
  if (g.seedCool[kind] > 0) return 'recharge';
  if (g.ling < unitStat(g, kind, 'cost')) return 'ling';
  return '';
}

/** Set a talisman: spends its 灵气 and starts its recharge. Returns the unit, or null (canPlace says why). */
export function place(g, kind, col, row) {
  if (canPlace(g, kind, col, row)) return null;
  const k = g.kit.units[kind];
  const hp = unitStat(g, kind, 'hp');
  const u = { id: g.nextId++, kind, col, row, x: laneX(g, col), y: cellY(g, row), hp, max: hp,
    cool: k.shoot ? 0.6 : 0, makeIn: k.make?.first ?? 0, fuse: k.bomb?.fuse ?? 0 };
  g.ling -= unitStat(g, kind, 'cost');
  g.seedCool[kind] = unitStat(g, kind, 'recharge');
  g.units.push(u);
  emit(g, { t: 'place', id: u.id, kind, col, row, x: u.x, y: u.y });
  return u;
}

/** Pick up a 灵气 orb (a tap; the bot's hand; or the slow auto-collect). */
export function collect(g, id) {
  const i = g.orbs.findIndex((o) => o.id === id);
  if (i < 0) return 0;
  const [o] = g.orbs.splice(i, 1);
  g.ling += o.amount;
  emit(g, { t: 'collect', id: o.id, x: o.x, y: o.y, amount: o.amount });
  return o.amount;
}

function collectAll(g) {
  while (g.orbs.length) collect(g, g.orbs[0].id);
}

function dropOrb(g, x, y, amount, from) {
  const o = { id: g.nextId++, x, y, amount, age: 0, from };
  g.orbs.push(o);
  emit(g, { t: 'orb', id: o.id, x, y, amount, from });
}

// The clock of the economy: recharges, the 聚灵阵's drops, the night sky's, and orbs left lying collect themselves.
function economy(g, dt) {
  for (const k of Object.keys(g.seedCool)) g.seedCool[k] = Math.max(0, g.seedCool[k] - dt);
  for (const u of g.units) {
    if (g.kit.units[u.kind].make && (u.makeIn -= dt) <= 0) {
      u.makeIn = unitStat(g, 'juling', 'every');
      dropOrb(g, u.x + (g.rnd() - 0.5) * 30, u.y - 20, g.kit.units[u.kind].make.amount, u.id);
    }
  }
  const sky = g.level.sky;
  if (sky && (g.skyIn -= dt) <= 0) {
    g.skyIn = sky.every;
    dropOrb(g, 40 + g.rnd() * (W - 80), g.grid.top + g.rnd() * (g.grid.bottom - g.grid.top), sky.amount, 'sky');
  }
  const auto = g.level.autoCollect ?? 7;
  for (let i = g.orbs.length - 1; i >= 0; i -= 1) if ((g.orbs[i].age += dt) >= auto) collect(g, g.orbs[i].id);
}

// Each lane's live beasts, nearest the wall first — built once a step, read by every unit and bolt.
function sortLanes(g) {
  for (const l of g.lanes) l.length = 0;
  for (const b of g.beasts) if (b.hp > 0 && b.col != null) g.lanes[b.col].push(b);
  for (const l of g.lanes) if (l.length > 1) l.sort((a, b) => b.y - a.y);
}

/** The beast a unit at `u` shoots: the nearest one up its lane, past the range line, not yet past the unit. */
function laneTarget(g, u) {
  for (const b of g.lanes[u.col]) if (b.hp > 0 && b.y < u.y + 8 && inReach(g, b)) return b;
  return null;
}

const UNIT_ACTS = {
  shoot(g, u, k, dt) {
    if ((u.cool -= dt) > 0) return;
    const t = laneTarget(g, u);
    if (!t) { u.cool = 0.1; return; }
    u.cool = unitStat(g, u.kind, 'every');
    const n = unitStat(g, u.kind, 'n') ?? 1;
    for (let i = 0; i < n; i += 1) {
      g.shots.push({ id: g.nextId++, kind: `bolt-${u.kind}`, lane: u.col, x: u.x, y: u.y - 34 + i * 22, vy: -k.shoot.speed,
        dmg: unitStat(g, u.kind, 'dmg'), slow: unitStat(g, u.kind, 'slow') ?? 0, slowFor: k.shoot.for ?? 0, r: k.shoot.r ?? 12, age: 0, hit: null });
    }
    emit(g, { t: 'shot', id: u.id, kind: u.kind });
  },
  bomb(g, u, k, dt) {
    if ((u.fuse -= dt) > 0) return;
    const r = unitStat(g, u.kind, 'radius') ?? k.bomb.radius;
    emit(g, { t: 'bomb', id: u.id, x: u.x, y: u.y, cols: r, rows: k.bomb.rows });
    for (const b of g.beasts) {
      if (b.hp <= 0 || Math.abs(b.col - u.col) > r || Math.abs(b.y - u.y) > k.bomb.rows * g.grid.ch) continue;
      hurt(g, b, unitStat(g, u.kind, 'dmg'), 'thunder', { big: true });
    }
    u.hp = 0;
    emit(g, { t: 'unitDie', id: u.id, kind: u.kind, x: u.x, y: u.y, spent: true });
  },
};

function unitsAct(g, dt) {
  for (const u of g.units) {
    if (u.hp <= 0) continue;
    const k = g.kit.units[u.kind];
    if (k.shoot) UNIT_ACTS.shoot(g, u, k, dt);
    else if (k.bomb) UNIT_ACTS.bomb(g, u, k, dt);
  }
}

// A sword or frost bolt flies straight up its lane and strikes the first beast it reaches (in reach).
function moveBolt(g, s, dt) {
  s.y += s.vy * dt;
  for (const b of g.lanes[s.lane]) {
    if (b.hp <= 0 || !inReach(g, b) || b.y < s.y - b.r - s.r || b.y - b.r * 1.4 > s.y) continue;
    hurt(g, b, s.dmg, s.kind === 'bolt-han' ? 'frost' : 'sword');
    if (s.slow) { b.slow = Math.max(b.slow, s.slow); b.slowT = Math.max(b.slowT, s.slowFor); }
    s.dead = true;
    emit(g, { t: 'boltHit', kind: s.kind, x: s.x, y: b.y - b.r * 0.6 });
    return;
  }
  if (s.y < reachY(g) - 20) s.dead = true;
}

/** The talisman this beast is up against in its lane (the first one below it within touch), or null. */
function blocker(g, b) {
  let best = null;
  for (const u of g.units) {
    if (u.hp <= 0 || u.col !== b.col || g.kit.units[u.kind].bomb) continue;
    const gap = u.y - b.y;
    if (gap > -10 && gap < (g.grid.ch * 0.42) && (!best || u.y < best.y)) best = u;
  }
  return best;
}

function moveLane(g, b, k, dt) {
  if (b.leap) {
    b.leap.t += dt;
    const p = Math.min(1, b.leap.t / b.leap.dur);
    b.y = b.leap.from + (b.leap.to - b.leap.from) * p;
    b.z = Math.sin(p * Math.PI) * 70;
    if (p >= 1) { b.leap = null; b.z = 0; }
    return;
  }
  const held = b.freezeT > 0 || b.stunT > 0;
  const wallY = g.level.wallY - b.r * 0.4;
  const slowK = b.slowT > 0 ? 1 - b.slow : 1;
  if (b.y >= wallY) {
    if (!b.atWall) { b.atWall = true; b.biteIn = 0.3; }
    if (held) return;
    if ((b.biteIn -= dt) <= 0) {
      b.biteIn = 1;
      const bite = k.bite * (b.slowT > 0 ? 1 - b.slow * 0.5 : 1);
      g.wall = Math.max(0, g.wall - bite);
      emit(g, { t: 'wall', dmg: bite, x: b.x, id: b.id });
    }
    return;
  }
  if (held) return;
  if (k.march && march(g, b, k.march, dt)) return;
  const u = k.fly ? null : blocker(g, b);
  if (u) {
    if (k.leap && !b.leapt) {
      b.leapt = true;
      b.leap = { t: 0, dur: k.leap.dur ?? 0.7, from: b.y, to: u.y + g.grid.ch * 0.62 };
      emit(g, { t: 'leap', id: b.id, x: b.x, y: b.y, over: u.id });
      return;
    }
    b.chewing = u.id;
    u.hp -= k.chew * slowK * dt;
    if ((b.chewIn = (b.chewIn ?? 0) - dt) <= 0) { b.chewIn = 0.45; emit(g, { t: 'chew', id: b.id, unit: u.id, x: u.x, y: u.y }); }
    if (u.hp <= 0) { u.hp = 0; b.chewing = null; emit(g, { t: 'unitDie', id: u.id, kind: u.kind, x: u.x, y: u.y }); }
    return;
  }
  b.chewing = null;
  const base = k.leap && !b.leapt ? k.speed : k.leap ? k.leap.after : b.speed;
  const rush = b.y < reachY(g) ? g.level.approach ?? 1 : 1;
  const sp = (k.march && !b.roared ? k.march.speed : base) * rush * slowK * (b.wailT > 0 ? 0 : 1);
  b.y = Math.min(wallY, b.y + sp * dt);
}

// A lane card: its effect lands now on what stands already (a thicker 土墙 grows its hp; 灵气 comes at once).
function cardTaken(g, id) {
  const c = g.kit.unitCards.find((x) => x.id === id);
  if (c.ling) g.ling += at(c.ling, lv(g, id));
  if (c.hp) for (const u of g.units) if (u.kind === c.unit) { const max = at(c.hp, lv(g, id)); u.hp += max - u.max; u.max = max; }
}

// ---- headless play -----------------------------------------------------------------------------------------------

/** The sensible build (the greedy bot): a wide answer first — fire for herds, thunder for chains, then depth. */
export const GREEDY = ['huo-blast', 'lei-chain', 'jian-more', 'huo-ground', 'han-slow', 'yy-foxfire', 'lei-chain', 'huo-blast',
  'jian-pierce', 'lei-strike', 'han-freeze', 'yy-howl', 'jian-more', 'huo-blast', 'lei-chain', 'yy-foxfire', 'jian-arc'];

// A first-time human: picks a card that looks good (a rough sense of value plus whim, never the build list), reacts
// ~0.4 s late, and taps a beast now and then (and the boss, sometimes, when it wails) — far from the bots' perfect play.
const LOOKS = { 'huo-blast': 3, 'lei-chain': 3, 'jian-more': 3, 'han-slow': 2.4, 'yy-foxfire': 2.4, 'jian-pierce': 2.2,
  'huo-ground': 2, 'lei-strike': 2, 'yy-howl': 1.6, 'han-freeze': 1.6, 'jian-arc': 2 };
const REACT = 0.4;

function humanBot(seed) {
  const r = rng(`human|${seed}`);
  let tap = null, think = 0;
  return {
    pick: (g) => g.offer.map((id) => [id, (LOOKS[id] ?? 2) + (g.skills[id] ? 0.4 : 0) + r() * 2.2]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    act(g, dt) {
      if (tap && (tap.in -= dt) <= 0) { setFocus(g, tap.id); tap = null; }
      if ((think -= dt) > 0 || tap) return;
      think = 1;
      const boss = g.beasts.find((b) => b.boss && b.wailT > 0);
      const near = alive(g).reduce((m, b) => (!m || b.y > m.y ? b : m), null);
      const want = boss && r() < 0.5 ? boss : near && r() < 0.03 ? near : null;
      if (want) tap = { id: want.id, in: REACT };
    },
  };
}

// ---- lane bots ------------------------------------------------------------------------------------------------------
//
// One planner, two hands. The SHARP bot reacts at once, picks every orb up, never misplaces. The HUMAN bot is a
// first-timer (守墙关's lesson, 10-20: perfect-bot tuning was too hard for Hanli): it looks every ~1–1.6 s, sets one
// talisman a look, answers a beast's lane with a shooter only after it has seen it, now and then puts it in the wrong
// bed, lets one orb in six lie (it collects itself), builds a few arrays (not the 6–8 a veteran would), and notices a
// bunch for the 雷符 only some of the time. Cards by how they look, not by a build list.
const LANE_LOOKS = { 'u-jian-more': 3, 'u-jian-sharp': 2.4, 'u-juling-rich': 2.2, 'u-tu-thick': 2, 'u-han-deep': 2.2, 'u-lei-quick': 1.8, 'u-ling': 2.6, 'u-guard': 1.8 };
const SHARP_CARDS = ['u-jian-more', 'u-juling-rich', 'u-jian-more', 'u-jian-sharp', 'u-han-deep', 'u-jian-sharp', 'u-tu-thick', 'u-lei-quick', 'u-guard', 'u-ling'];

const nArrNow = (g) => g.units.filter((u) => u.kind === 'juling').length;

function freeRow(g, col, rows) {
  for (const r of rows) if (r < g.grid.rows && !g.units.some((u) => u.col === col && u.row === r && u.hp > 0)) return r;
  return null;
}

const CENTER_OUT = [2, 1, 3, 0, 4];

function laneBot(seed, { look, miss, skipOrb, arrays, noticeBomb, sharp }) {
  const r = rng(`lanebot|${seed}`);
  let think = 0;
  const seen = new Set();
  const want = () => arrays;
  return {
    pick: sharp
      ? (g) => SHARP_CARDS.find((id) => g.offer.includes(id)) ?? g.offer[0] ?? null
      : (g) => g.offer.map((id) => [id, (LANE_LOOKS[id] ?? 2) + r() * 2.2]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    act(g, dt) {
      // Orbs: one look's worth late; some left to collect themselves.
      for (const o of g.orbs) {
        if (seen.has(o.id) || o.age < (sharp ? 0 : 0.8)) continue;
        seen.add(o.id);
        if (sharp || r() > skipOrb) collect(g, o.id);
      }
      if ((think -= dt) > 0) return;
      think = sharp ? 0.2 : look[0] + r() * (look[1] - look[0]);
      for (let n = sharp ? 4 : 1; n > 0 && laneMove(g, r, { miss, noticeBomb, sharp, arrays: want(g) }); n -= 1);
    },
  };
}

// One placement, the most pressing first (a PvZ player's habits): a shooter for a lane whose beast has no answer,
// set BEHIND that beast; arrays early, against the wall; a sword in every lane; a 雷符 on a bunch or the boss; a wall
// in front where a 狰 runs; frost where the armour is; then more swords where the lanes are thin.
function laneMove(g, r, { miss, noticeBomb, sharp, arrays }) {
  const has = (k) => g.level.units.includes(k);
  const ready = (k) => has(k) && g.seedCool[k] <= 0 && g.ling >= unitStat(g, k, 'cost');
  const seenB = g.beasts.filter((b) => b.hp > 0 && b.y > 150 && b.col != null);
  const cols = g.grid.cols;
  const shooters = (c) => g.units.filter((u) => u.col === c && (u.kind === 'jian' || u.kind === 'han')).length;
  const threat = Array.from({ length: cols }, (_, c) => seenB.filter((b) => b.col === c).reduce((s, b) => s + b.hp, 0));
  const front = Array.from({ length: cols }, (_, c) => seenB.filter((b) => b.col === c && !b.fly).reduce((m, b) => Math.max(m, b.y), -1e9));
  // Rows a shooter can still use in lane c: behind its front beast by a cell, front-most first (more time to shoot).
  const behind = (c, rows) => rows.filter((row) => cellY(g, row) > front[c] + g.grid.ch * 0.9);
  const put = (k, c, rows) => {
    const col = !sharp && r() < miss ? Math.floor(r() * cols) : c;
    const row = freeRow(g, col, k === 'juling' || k === 'tu' ? rows : behind(col, rows));
    return row != null && place(g, k, col, row);
  };
  const nArr = g.units.filter((u) => u.kind === 'juling').length;
  // 1. A beast with no answer in its lane.
  const bare = [...CENTER_OUT].filter((c) => threat[c] > 0 && !shooters(c)).sort((a, b) => front[b] - front[a])[0];
  if (bare != null && ready('jian') && put('jian', bare, [2, 1, 3, 0])) return true;
  // 1b. Armour (银月 says so when it first shows): frost in its lane, else one more sword there; keep 灵气 for it.
  const armoured = [...CENTER_OUT].filter((c) => seenB.some((b) => b.col === c && b.kind === 'qiuyu' && b.y > reachY(g) - 60))
    .sort((a, b) => threat[b] - threat[a])[0];
  if (armoured != null) {
    if (ready('han') && put('han', armoured, [3, 2, 1])) return true;
    if (!has('han') || g.seedCool.han > 2) {
      if (ready('jian') && shooters(armoured) < 3 && put('jian', armoured, [3, 2, 1])) return true;
    } else if (g.ling < unitStat(g, 'han', 'cost') && nArrNow(g) >= 2) return false;
  }
  // 2. Arrays early (never in a lane a beast walks down unanswered — it would only feed it).
  const arrayAt = () => {
    const safe = (x) => !(threat[x] > 0 && !shooters(x));
    const c = CENTER_OUT.find((x) => safe(x) && freeRow(g, x, [0]) != null) ?? CENTER_OUT.find((x) => safe(x) && freeRow(g, x, [1]) != null);
    return c != null && put('juling', c, [0, 1]);
  };
  const early = Math.min(arrays, 2 + g.wave);
  if (bare == null && nArr < early && ready('juling') && arrayAt()) return true;
  // 3. A sword in every lane once the first wave is on.
  const unarmed = CENTER_OUT.find((c) => !shooters(c));
  if (unarmed != null && g.wave >= 1 && ready('jian') && put('jian', unarmed, [2, 1, 3, 0])) return true;
  if (bare == null && nArr < arrays && ready('juling') && arrayAt()) return true;
  // 4. 雷符 on a bunch (or the boss) in reach.
  if (ready('lei') && (sharp || r() < noticeBomb)) {
    const inGrid = seenB.filter((b) => b.y >= Math.max(reachY(g), g.grid.top) && b.y < g.grid.bottom);
    const best = inGrid.map((b) => [b, inGrid.filter((o) => Math.abs(o.col - b.col) <= 1 && Math.abs(o.y - b.y) < g.grid.ch * 1.4)
      .reduce((s, o) => s + o.hp, 0)]).sort((a, b) => b[1] - a[1])[0];
    if (best && (best[1] >= 1200 || best[0].boss)) {
      const cell = cellAt(g, best[0].x, best[0].y);
      for (const dc of [0, -1, 1]) {
        const c = clampCol(g, cell.col + dc);
        const rr = freeRow(g, c, [cell.row, cell.row - 1, cell.row + 1].filter((x) => x >= 0));
        if (rr != null && place(g, 'lei', c, rr)) return true;
      }
    }
  }
  // 5. A wall in front of an armed lane, where a 狰 runs or the push is coming.
  if (ready('tu')) {
    const open4 = (c) => shooters(c) && !g.units.some((u) => u.col === c && u.kind === 'tu');
    const zc = CENTER_OUT.find((c) => open4(c) && seenB.some((b) => b.col === c && b.kind === 'zheng' && !b.leapt));
    const c = zc ?? (g.ling >= 125 ? CENTER_OUT.slice().sort((a, b) => threat[b] - threat[a]).find(open4) : null);
    if (c != null && put('tu', c, [4, 3])) return true;
  }
  // 6. Frost where the armour is, else the busiest lane once the base stands.
  if (ready('han')) {
    const armoured = CENTER_OUT.filter((c) => seenB.some((b) => b.col === c && b.kind === 'qiuyu')).sort((a, b) => threat[b] - threat[a])[0];
    const c = armoured ?? (nArr >= arrays && g.ling >= 250 ? CENTER_OUT.slice().sort((a, b) => threat[b] - threat[a])[0] : null);
    if (c != null && put('han', c, [2, 3, 1])) return true;
  }
  // 7. More swords: the lane with the most threat per shooter (a spare 灵气 kept for a 雷符 once it is in hand).
  const keep = has('lei') && g.seedCool.lei <= 8 ? 150 : 0;
  if (ready('jian') && g.ling >= 100 + keep && nArr >= Math.min(arrays, 3)) {
    const need = (c) => (threat[c] + 200) / (1 + shooters(c));
    const c = CENTER_OUT.slice().sort((a, b) => need(b) - need(a)).find((x) => freeRow(g, x, behind(x, [3, 2, 1])) != null);
    if (c != null && put('jian', c, [3, 2, 1])) return true;
  }
  return false;
}

const humanLane = (seed) => laneBot(seed, { look: [1, 1.6], miss: 0.12, skipOrb: 1 / 6, arrays: 5, noticeBomb: 0.5 });
const sharpLane = (seed) => laneBot(seed, { arrays: 8, sharp: true, miss: 0, skipOrb: 0, noticeBomb: 1 });

// The 山门 (level 1) bots choose cards; the 药园's (lane levels) also place and collect. `human` and `greedy` play
// either kind of level; `lazy` never picks a card and never sets a talisman.
const either = (wall, lane) => ({ make: (seed) => { let b = null; return {
  pick: (g) => (b ??= g.grid ? lane(seed) : wall.make ? wall.make(seed) : { pick: wall }).pick(g),
  act: (g, dt) => (b ??= g.grid ? lane(seed) : wall.make ? wall.make(seed) : { pick: wall }).act?.(g, dt),
}; } });

export const BOTS = {
  lazy: () => null,
  random: (g) => g.offer[Math.floor(g.rnd() * g.offer.length)],
  greedy: (g) => GREEDY.find((id) => g.offer.includes(id)) ?? g.offer[0],
  human: either({ make: humanBot }, humanLane),
  sharp: either((g) => GREEDY.find((id) => g.offer.includes(id)) ?? g.offer[0], sharpLane),
  humanLane: { make: humanLane },
};

/** Play a whole level with a bot (a chooser `(g) → card id`, or `{ make(seed) → { pick, act } }`); returns
 *  { won, stars, wave, wallLeft, walls (the wall after each wave), kills, skills, bossY (where the boss fell) }. */
export function sim(kit, level, chooser, { seed = 'sim', limit = 900 } = {}) {
  const g = newGame(kit, level, { seed });
  const bot = chooser.make ? chooser.make(seed) : { pick: chooser };
  const walls = [], placed = {};
  let bossY = null;
  while (!['won', 'lost'].includes(g.phase) && g.t < limit) {
    if (g.phase === 'pick') pick(g, bot.pick(g));
    else {
      if (g.phase === 'wave' || (g.grid && g.phase !== 'pick')) bot.act?.(g, 0.1);
      step(g, 0.1);
    }
    for (const e of g.events) {
      if (e.t === 'clear' || e.t === 'lost') walls.push(Math.round(g.wall));
      if (e.t === 'kill' && e.boss) bossY = Math.round(e.y);
      if (e.t === 'place') placed[e.kind] = (placed[e.kind] ?? 0) + 1;
    }
    g.events.length = 0;
  }
  return { won: g.phase === 'won', stars: stars(g), wave: g.wave, wallLeft: g.wall / g.wallMax, walls, kills: g.kills, skills: g.skills, bossY,
    units: g.grid ? placed : undefined, t: Math.round(g.t) };
}
