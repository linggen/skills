// shoulu/core.js — 守炉's engine: pure, no DOM, seeded. The page (../shoulu.js) steps it in time and
// paints it (draw.js); the tests (tests/game-shoulu.test.mjs) run it headless through `sim`.
//
// A level is a row of games.json (row `shoulu`, `levels`), declarative: its road, its build spots, its
// furnace, the fliers' line, 银月's post, the towers it allows, its waves. The tuning — what a tower,
// a beast and 银月 are — lives here (TOWERS · BEASTS · HERO), the same on every level.
//
// Waves come on a countdown, never by a tap: wave 1 after the lead-in (`first` s), each next one
// `gap` s after the last beast of the wave before is out on the road. Calling a wave early is the
// player's choice, paid in 灵石 for the seconds left.
import { rng } from '../seeded.js';

export const W = 600, H = 760;
export const EARLY_RATE = 1.5;
export const HP = 10;

/** The four talismans. `air`: can strike a flier. Costs: build, then the 二重 and 三重 upgrades. */
export const TOWERS = {
  jian: { glyph: '剑', color: '#35566e', cost: [60, 60, 90], range: [156, 166, 180], rate: [0.5, 0.45, 0.4], dmg: [10, 14, 20], air: true },
  huo: { glyph: '火', color: '#b0412e', cost: [90, 80, 120], range: [143, 151, 161], rate: [1.6, 1.5, 1.4], dmg: [26, 36, 50], splash: [42, 48, 56], air: false, shot: 160 },
  han: { glyph: '寒', color: '#3f87a6', cost: [80, 70, 100], range: [124, 137, 150], rate: [0.5, 0.5, 0.5], dmg: [2, 3.5, 5.5], slow: [0.5, 0.55, 0.6], air: true },
  lei: { glyph: '雷', color: '#6a4c86', cost: [140, 120, 160], range: [169, 179, 190], rate: [1.5, 1.4, 1.3], dmg: [32, 44, 60], jumps: 3, air: true },
};
export const TORDER = ['jian', 'huo', 'han', 'lei'];

/** The beasts of 卷一 (creatures.json ids). `armor`: 剑阵 does ARMOR of its harm (犰狳 curls up: 见人则眠).
    `fly`: off the road, straight for the furnace. `leap`: too quick for 银月 to hold (狰 bounds past her), and clear of a 火符's
    blast (×`dodge`) unless 寒符 has it slowed. `boss`: one, with a bar. `cry`: 合窳 wails like a baby every `every` s and stands for `for` s; its
    护体灵光 takes `guard` of all harm, and while it wails, `mult`. */
export const ARMOR = 0.4;
export const BEASTS = {
  yezhu: { hp: 55, speed: 42, reward: 5, r: 11, color: '#5b4635', bite: 6 },
  zheng: { hp: 30, speed: 80, reward: 4, r: 9, color: '#8b3a2a', bite: 4, leap: true, dodge: 0.35 },
  qiuyu: { hp: 150, speed: 28, reward: 10, r: 12, color: '#6d7a5a', armor: true, bite: 9 },
  qique: { hp: 40, speed: 46, reward: 7, r: 10, color: '#2a2a31', fly: true },
  heyu: { hp: 2400, speed: 19, reward: 80, r: 24, color: '#c49a3a', boss: true, dmg: 3, bite: 40, cry: { every: 9, for: 3, guard: 0.6, mult: 1.6 } },
};

/** 银月, a hero as in 魔兽争霸 III: orders (move, attack, queued moves), a guard post, and four skills.
    Standing, she holds up to two ground beasts and bites. Idle at her post she wanders a little (`wander`),
    engages a ground beast that comes within `acquire`, and gives up the chase and goes home past `leash`.
    An attack order chases its beast until it falls or gets `lose` away (or further than it was when ordered). */
export const HERO = { hp: [300, 380, 470], dmg: [20, 28, 38], rate: 0.8, speed: 120, reach: 30, block: 2, regen: 12, respawn: 12, xp: [60, 150],
  wander: 25, acquire: 143, leash: 220, lose: 300, meet: true };
/** Her skills (Q W E R). `unlock`: the 重 (hero level, 0…2) it opens at. `aim`: what it needs — null (cast at once), 'point',
    or 'any' (a beast or a point). `range`: how far she casts (out of range, she walks in first). 狐毛 is paid in charges
    (the level row's `hero.hair`), not by level. */
export const SKILLS = {
  q: { id: 'xiaoyue', unlock: 0, aim: null, cd: 12, first: 4, r: 95, stun: 1.6, dmg: [10, 16, 24], auto: true },
  w: { id: 'yueying', unlock: 1, aim: 'any', cd: 12, range: 180, speed: 520, r: 34, dmg: [0, 45, 65] },
  e: { id: 'huhuo', unlock: 2, aim: 'point', cd: 16, range: 200, r: 46, dps: 22, dur: 5, burn: 1.5 },
  r: { id: 'humao', unlock: 0, aim: 'any', cd: 2, range: 240, r: 90, dur: 6, charges: true },
};
export const SKEYS = ['q', 'w', 'e', 'r'];

// ── The road ──────────────────────────────────────────────────────────────────────────────────
export function roadOf(points) {
  const segs = [];
  let len = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i], [x2, y2] = points[i + 1], l = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, x2, y2, l, s: len, nx: -(y2 - y1) / l, ny: (x2 - x1) / l });
    len += l;
  }
  return { points, segs, len };
}
export function posOnPath(road, d, off = 0) {
  const { segs } = road;
  if (d <= 0) { const s = segs[0]; return { x: s.x1 + (s.x2 - s.x1) * d / s.l + s.nx * off, y: s.y1 + (s.y2 - s.y1) * d / s.l + s.ny * off, dx: s.x2 - s.x1 }; }
  for (const s of segs) if (d <= s.s + s.l) { const k = (d - s.s) / s.l; return { x: s.x1 + (s.x2 - s.x1) * k + s.nx * off, y: s.y1 + (s.y2 - s.y1) * k + s.ny * off, dx: s.x2 - s.x1 }; }
  const s = segs[segs.length - 1];
  return { x: s.x2, y: s.y2, dx: 0 };
}
/** The shortest way from a point to the road. */
export function offRoad(road, x, y) {
  let m = 1e9;
  for (const s of road.segs) {
    const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
    const k = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / (s.l * s.l)));
    m = Math.min(m, Math.hypot(x - s.x1 - vx * k, y - s.y1 - vy * k));
  }
  return m;
}

// ── A level, laid ────────────────────────────────────────────────────────────────────────────
/** The level a row describes, with its road built (the row itself stays data). */
/** The difficulty knob, data only: a level's `difficulty` (default 1) × the whole game's (the games.json row's
    `difficulty`, stamped on each level as `globalDifficulty` by `levelsFrom`). It scales every beast's hp and how
    many come in each group (a boss stays one). */
export const difficultyOf = (row) => (row.difficulty ?? 1) * (row.globalDifficulty ?? 1);
/** The levels of a games.json `shoulu` row, each carrying the row's global `difficulty`. */
export const levelsFrom = (gameRow) => (gameRow?.levels ?? []).map((l) => ({ ...l, globalDifficulty: gameRow.difficulty ?? 1 }));
/** A wave group's count at a difficulty. */
export const countAt = (type, n, diff) => (BEASTS[type]?.boss ? n : Math.max(1, Math.round(n * diff)));

export function layLevel(row) {
  const road = roadOf(row.road);
  const [fx, fy] = row.furnace;
  const air = row.air ? { x: row.air[0], y: row.air[1] } : null;
  return { ...row, road, furn: { x: fx, y: fy }, air, airLen: air ? Math.hypot(fx - air.x, fy - 18 - air.y) : 0,
    towers: row.towers ?? TORDER, unlock: row.unlock ?? {}, gap: row.gap ?? 20, first: row.first ?? 25, hpScale: row.hpScale ?? 0.12, hpMul: row.hpMul ?? 1, diff: difficultyOf(row) };
}
export const beastsOf = (row) => [...new Set(row.waves.flat().map(([t]) => t))];
/** A row's 银月: `hero` is her post [x, y], or { at: [x, y], hair } — `hair`: 狐毛 charges the story has given her (古五 on). */
export function heroOf(row) {
  const h = row.hero;
  return Array.isArray(h) ? { at: h, hair: 0 } : { at: h.at, hair: h.hair ?? 0 };
}

export function newGame(row, { seed = 'shoulu', headless = false } = {}) {
  const L = layLevel(row);
  const { at: [hx, hy], hair } = heroOf(row);
  return { L, seed, t: 0, hp: HP, money: row.money, wave: 0, queue: [], nextTimer: L.first, beasts: [], towers: row.spots.map(() => null), proj: [], fx: [], fires: [],
    hero: { x: hx, y: hy, tx: hx, ty: hy, hp: HERO.hp[0], lvl: 0, xp: 0, cd: 0, dead: 0, face: -1, anim: 0, say: null, held: [],
      post: { x: hx, y: hy }, orders: [], foe: null, homing: false, dash: null, cast: null, act: null, wanderT: 4, moving: false,
      cds: { q: SKILLS.q.first, w: 0, e: 0, r: 0 }, auto: { q: true }, hair, rnd: rng(`${seed}|yinyue`) },
    home: { x: hx, y: hy }, shake: 0, furnFlash: 0, over: null, headless, uid: 0, seen: {}, events: [], rnd: rng(seed),
    stats: { kills: 0, leaks: {}, built: {} } };
}
const emit = (g, e) => { if (!g.headless) g.events.push(e); };
const addFx = (g, f) => { if (!g.headless) g.fx.push(f); };
export const waves = (g) => g.L.waves.length;
export const locked = (g, type) => !g.L.towers.includes(type) || g.wave < (g.L.unlock[type] ?? 0);

function place(g, b) {
  const L = g.L;
  if (b.fly) {
    const k = b.d / L.airLen;
    b.x = L.air.x + (L.furn.x - L.air.x) * k;
    b.y = L.air.y + (L.furn.y - 18 - L.air.y) * k + Math.sin(b.d * 0.08 + b.id) * 4;
    b.face = L.furn.x >= L.air.x ? 1 : -1;
  } else {
    const p = posOnPath(L.road, b.d, b.off);
    b.x = p.x; b.y = p.y;
    if (p.dx > 0) b.face = 1; else if (p.dx < 0) b.face = -1;
  }
}
function spawn(g, type) {
  const B = BEASTS[type], L = g.L;
  const hp = Math.round(B.hp * L.hpMul * L.diff * (B.boss ? 1 : 1 + L.hpScale * (g.wave - 1)));
  const b = { id: ++g.uid, type, hp, max: hp, speed: B.speed * (0.95 + g.rnd() * 0.1), d: 0, off: B.boss ? 0 : g.rnd() * 16 - 8, fly: Boolean(B.fly),
    armor: Boolean(B.armor), reward: B.reward, dmg: B.dmg || 1, len: B.fly ? L.airLen : L.road.len, slowT: 0, slowF: 0, stunT: 0, held: false,
    flash: 0, face: 1, x: 0, y: 0, dead: false, cry: B.cry ? B.cry.every : 0, crying: 0 };
  place(g, b);
  g.beasts.push(b);
  if (!g.seen[type]) { g.seen[type] = 1; emit(g, { intro: type }); }
}
/** A beast put on its road at `d` (a test's, or a story beat's): returns it. */
export function spawnAt(g, type, d = 0) {
  spawn(g, type);
  const b = g.beasts.at(-1);
  b.d = d; b.off = 0; place(g, b);
  return b;
}
/** The next wave: by the countdown (`early` false) or called early (paid for the seconds left). */
export function callWave(g, early = false) {
  if (g.over || g.wave >= waves(g) || g.queue.length) return -1;
  const bonus = early ? Math.round(g.nextTimer * EARLY_RATE) : 0;
  g.money += bonus;
  g.wave += 1;
  emit(g, { banner: g.wave });
  const q = [];
  for (const [type, n, gap, st] of g.L.waves[g.wave - 1]) for (let i = 0; i < countAt(type, n, g.L.diff); i += 1) q.push({ at: g.t + st + i * gap, type });
  q.sort((a, b) => a.at - b.at);
  g.queue = q;
  g.nextTimer = g.L.gap;
  for (const [type, at] of Object.entries(g.L.unlock)) if (at === g.wave && g.L.towers.includes(type)) emit(g, { unlocked: type });
  emit(g, { sound: 'wave' });
  if (bonus > 0) emit(g, { early: bonus });
  return bonus;
}
export const canBuild = (g, i, type) => !g.towers[i] && !locked(g, type) && g.money >= TOWERS[type].cost[0];
export function build(g, i, type) {
  if (!canBuild(g, i, type)) return false;
  const D = TOWERS[type], [x, y] = g.L.spots[i];
  g.money -= D.cost[0];
  g.towers[i] = { type, lvl: 0, spent: D.cost[0], cd: 0.2, x, y, anim: 0, ang: 0 };
  g.stats.built[type] = (g.stats.built[type] || 0) + 1;
  emit(g, { sound: 'build' });
  return true;
}
export const upgradeCost = (tw) => (tw.lvl < 2 ? TOWERS[tw.type].cost[tw.lvl + 1] : Infinity);
export function upgrade(g, i) {
  const tw = g.towers[i];
  if (!tw || tw.lvl >= 2 || g.money < upgradeCost(tw)) return false;
  const c = upgradeCost(tw);
  g.money -= c; tw.spent += c; tw.lvl += 1;
  emit(g, { sound: 'build' });
  return true;
}
export const refund = (tw) => Math.floor(tw.spent * 0.6);
export function sell(g, i) {
  const tw = g.towers[i];
  if (!tw) return false;
  g.money += refund(tw);
  g.towers[i] = null;
  return true;
}
// ── 银月's orders ─────────────────────────────────────────────────────────────────────────────
const clampX = (x) => Math.max(14, Math.min(W - 14, x)), clampY = (y) => Math.max(70, Math.min(H - 20, y));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** The beast at a board point (a click, a tap): the nearest live one within its size + `slop`. `air`: fliers count too. */
export function beastAt(g, x, y, slop = 14, air = false) {
  let best = null, bd = 1e9;
  for (const b of g.beasts) {
    if (b.dead || (b.fly && !air)) continue;
    const r = BEASTS[b.type].r + slop, d = Math.hypot(b.x - x, b.y - BEASTS[b.type].r * 0.5 - y); // the body stands a little above its feet
    if (d <= r && d < bd) { bd = d; best = b; }
  }
  return best;
}
function issue(g, o, queue) {
  const h = g.hero;
  if (h.dead > 0) return false;
  if (!queue) { h.orders = []; h.foe = null; h.homing = false; }
  h.orders.push(o);
  h.act = null;
  return true;
}
/** Move: she goes there and it becomes her guard post. `queue` (shift): after the orders she has. */
export const orderMove = (g, x, y, queue = false) => issue(g, { k: 'move', x: clampX(x), y: clampY(y) }, queue);
/** Attack a ground beast: she chases it (within reason: `HERO.lose`) and bites until it falls. A flier is out of her reach. */
export function orderAttack(g, b, queue = false) {
  if (!b || b.dead || b.fly) return false;
  return issue(g, { k: 'attack', b, lose: Math.max(HERO.lose, dist(g.hero, b) + 60) }, queue); // a far click still counts
}
/** Kept for the old callers: send 银月 to a place. */
export const sendHero = (g, x, y) => orderMove(g, x, y);

/** What a skill can do now: { locked, cd, max, ready, charges, auto }. */
export function skillState(g, key) {
  const h = g.hero, S = SKILLS[key];
  const locked = S.charges ? false : h.lvl < S.unlock;
  const charges = S.charges ? h.hair : null;
  return { locked, cd: Math.max(0, h.cds[key]), max: S.cd, charges, auto: Boolean(h.auto[key]),
    ready: !locked && h.dead <= 0 && h.cds[key] <= 0 && !h.dash && (!S.charges || h.hair > 0) };
}
/** Right-click on a skill button: autocast on / off (only 啸月 has one). */
export function toggleAuto(g, key) {
  if (!SKILLS[key].auto) return false;
  g.hero.auto[key] = !g.hero.auto[key];
  return true;
}
/** Cast Q W E R. `at`: { b } (a beast) or { x, y } (a point); none for 啸月. Out of range, she walks in first
    (the cast becomes her order). Returns false when it can't be cast now (locked, cooling, no charge, a bad aim). */
export function cast(g, key, at = null, queue = false) {
  const S = SKILLS[key];
  if (!S || !skillState(g, key).ready) return false;
  if (S.aim && !at) return false;
  if (at?.b && (at.b.dead || at.b.fly)) return false;
  if (S.aim === 'point' && at.b) at = { x: at.b.x, y: at.b.y };
  if (!S.aim) { castNow(g, key, null); return true; }
  const o = { k: 'cast', key, at: at.b ? { b: at.b } : { x: clampX(at.x), y: clampY(at.y) } };
  if (!queue && dist(g.hero, aimPos(o.at)) <= S.range) { castNow(g, key, o.at); return true; }
  return issue(g, o, queue);
}
const aimPos = (at) => (at.b ? at.b : at);

function hurt(g, b, d, src) {
  if (b.dead) return;
  const bare = b.bareT > 0; // 狐毛: its armor and its 护体灵光 are off
  if (src === 'jian' && b.armor && !bare) d *= ARMOR;
  if (src === 'huo' && BEASTS[b.type].dodge && !(b.slowT > 0) && !(b.stunT > 0)) d *= BEASTS[b.type].dodge;
  const C = BEASTS[b.type].cry;
  if (C) d *= b.crying > 0 ? C.mult : bare ? 1 : C.guard;
  b.hp -= d;
  if (src !== 'fox') b.flash = 0.1; // a burn ticks every frame: no flash, or it would glow white the whole time
  if (!g.headless && src !== 'han' && src !== 'fox') addFx(g, { k: 'txt', x: b.x + (Math.random() * 10 - 5), y: b.y - BEASTS[b.type].r - 4, s: String(Math.round(d)), col: src === 'jian' && b.armor ? '#7a7066' : b.crying > 0 ? '#b0412e' : '#2a241d', life: 0.6, max: 0.6, vy: -30, size: b.crying > 0 ? 14 : 11 });
  if (b.hp > 0) return;
  b.dead = true;
  g.money += b.reward;
  g.stats.kills += 1;
  if (src === 'yue' || src === 'fox') heroXp(g, b.reward);
  emit(g, { kill: b.type, x: b.x, y: b.y, reward: b.reward });
}
function pickTarget(g, x, y, R, air) {
  let best = null, bv = 1e9;
  for (const b of g.beasts) {
    if (b.dead || (b.fly && !air)) continue;
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy > R * R) continue;
    const rem = b.len - b.d;
    if (rem < bv) { bv = rem; best = b; }
  }
  return best;
}
function chain(g, tw, t, dmg) {
  const hit = new Set(), pts = [[tw.x, tw.y - 26]];
  let cur = t;
  for (let j = 0; j <= TOWERS.lei.jumps && cur; j += 1) {
    hit.add(cur); pts.push([cur.x, cur.y]); hurt(g, cur, dmg, 'lei'); dmg *= 0.8;
    let nb = null, nd = 95 * 95;
    for (const b of g.beasts) { if (b.dead || hit.has(b)) continue; const dx = b.x - cur.x, dy = b.y - cur.y, dd = dx * dx + dy * dy; if (dd < nd) { nd = dd; nb = b; } }
    cur = nb;
  }
  if (!g.headless) { addFx(g, { k: 'bolt', pts, life: 0.25, max: 0.25 }); emit(g, { sound: 'zap' }); }
}

function beastsStep(g, dt) {
  for (const b of g.beasts) {
    if (b.dead) continue;
    if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) b.slowF = 0; }
    if (b.stunT > 0) b.stunT -= dt;
    const C = BEASTS[b.type].cry;
    if (C) { // 合窳 cries like a baby: it stands, and its 护体灵光 thins
      if (b.crying > 0) b.crying -= dt;
      else { b.cry -= dt; if (b.cry <= 0) { b.cry = C.every; b.crying = C.for; emit(g, { cry: b.type }); } }
    }
    if (!b.held && !(b.stunT > 0) && !(b.crying > 0)) b.d += b.speed * (1 - b.slowF) * dt;
    b.flash -= dt;
    if (b.d < b.len) { place(g, b); continue; }
    b.dead = true;
    g.hp -= b.dmg;
    g.stats.leaks[b.type] = (g.stats.leaks[b.type] || 0) + 1;
    g.shake = Math.min(16, g.shake + 6 * b.dmg); g.furnFlash = 0.5;
    emit(g, { leak: b.dmg, sound: 'hit' });
    if (g.hp <= 0) { g.hp = 0; g.over = 'lose'; }
  }
}
function towersStep(g, dt) {
  for (const tw of g.towers) {
    if (!tw) continue;
    const D = TOWERS[tw.type], L = tw.lvl, R = D.range[L];
    tw.cd -= dt; tw.anim -= dt;
    if (tw.cd > 0) continue;
    if (tw.type === 'han') {
      let any = false;
      for (const b of g.beasts) {
        if (b.dead) continue;
        const dx = b.x - tw.x, dy = b.y - tw.y;
        if (dx * dx + dy * dy > R * R) continue;
        any = true; b.slowT = 0.6; b.slowF = Math.max(b.slowF, D.slow[L]); hurt(g, b, D.dmg[L], 'han');
      }
      if (any) { tw.cd = D.rate[L]; tw.anim = 0.4; addFx(g, { k: 'frost', x: tw.x, y: tw.y, r: R, life: 0.45, max: 0.45 }); } else tw.cd = 0.1;
      continue;
    }
    const t = pickTarget(g, tw.x, tw.y, R, D.air);
    if (!t) { tw.cd = 0.05; continue; }
    tw.cd = D.rate[L]; tw.anim = 0.25; tw.ang = Math.atan2(t.y - tw.y, t.x - tw.x);
    if (tw.type === 'jian') g.proj.push({ k: 'sword', x: tw.x, y: tw.y - 24, t, lx: t.x, ly: t.y, speed: 560, dmg: D.dmg[L], ang: 0 });
    // 火符 is lobbed at where the mark stood: a fast beast (狰) is gone when it lands, unless 寒符 holds it
    else if (tw.type === 'huo') g.proj.push({ k: 'fire', x: tw.x, y: tw.y - 24, t, lx: t.x, ly: t.y, speed: D.shot, dmg: D.dmg[L], splash: D.splash[L], ang: 0 });
    else if (tw.type === 'lei') { chain(g, tw, t, D.dmg[L]); tw.anim = 0.3; }
  }
}
function projStep(g, dt) {
  for (const p of g.proj) {
    if (p.done) continue;
    if (p.k === 'sword' && p.t && !p.t.dead) { p.lx = p.t.x; p.ly = p.t.y; }
    else if (p.k === 'sword') { // a sword whose mark fell finds the nearest other
      let nb = null, nd = 80 * 80;
      for (const b of g.beasts) { if (b.dead) continue; const dx = b.x - p.x, dy = b.y - p.y, dd = dx * dx + dy * dy; if (dd < nd) { nd = dd; nb = b; } }
      if (nb) { p.t = nb; p.lx = nb.x; p.ly = nb.y; } else { p.done = true; continue; }
    }
    const dx = p.lx - p.x, dy = p.ly - p.y, dist = Math.hypot(dx, dy), mv = p.speed * dt;
    p.ang = Math.atan2(dy, dx);
    if (dist > mv + 4) { p.x += dx / dist * mv; p.y += dy / dist * mv; continue; }
    p.done = true;
    if (p.k === 'sword') { if (p.t && !p.t.dead) hurt(g, p.t, p.dmg, 'jian'); continue; }
    for (const b of g.beasts) {
      if (b.dead || b.fly) continue;
      const ex = b.x - p.lx, ey = b.y - p.ly;
      if (ex * ex + ey * ey <= p.splash * p.splash) hurt(g, b, p.dmg * (b === p.t ? 1 : 0.75), 'huo');
    }
    addFx(g, { k: 'boom', x: p.lx, y: p.ly, r: p.splash, life: 0.45, max: 0.45 });
    emit(g, { sound: 'boom', boom: [p.lx, p.ly] });
  }
  g.proj = g.proj.filter((p) => !p.done);
}

const heroSay = (g, k) => { if (!g.headless) g.hero.say = { k, life: 2.4 }; };
function heroXp(g, n) {
  const h = g.hero;
  h.xp += n;
  if (h.lvl < 2 && h.xp >= HERO.xp[h.lvl]) { h.lvl += 1; h.hp = HERO.hp[h.lvl]; heroSay(g, 'grow'); emit(g, { heroUp: h.lvl }); }
}
function release(h) { for (const b of h.held) b.held = false; h.held = []; }
const groundNear = (g, p, R) => g.beasts.filter((b) => !b.dead && !b.fly && dist(b, p) <= R);

// ── 银月's skills, cast ──
function howl(g) {
  const h = g.hero, S = SKILLS.q;
  for (const b of groundNear(g, h, S.r)) { b.stunT = BEASTS[b.type].boss ? S.stun * 0.4 : S.stun; hurt(g, b, S.dmg[h.lvl], 'yue'); }
  h.cds.q = S.cd; h.cast = { k: 'q', t: 0.6, max: 0.6 };
  addFx(g, { k: 'howl', x: h.x, y: h.y - 8, r: S.r, life: 0.6, max: 0.6 });
  emit(g, { sound: 'howl', skill: 'q' });
  if (!g.howled) { g.howled = 1; heroSay(g, 'howl'); }
}
function castNow(g, key, at) {
  const h = g.hero, S = SKILLS[key];
  if (key === 'q') { howl(g); return; }
  const p = at.b ? { x: at.b.x, y: at.b.y } : at;
  if (Math.abs(p.x - h.x) > 1) h.face = p.x > h.x ? 1 : -1;
  h.cds[key] = S.cd; h.act = null;
  if (key === 'w') { // 月影扑: a dash no bite can touch, the strike on landing
    release(h);
    h.dash = { b: at.b ?? null, x: p.x, y: p.y };
    h.cast = { k: 'w', t: 0.3, max: 0.3 };
    emit(g, { sound: 'pounce', skill: 'w' });
  } else if (key === 'e') { // 狐火: a patch of blue fire on the ground
    g.fires.push({ x: p.x, y: p.y, r: S.r, t: S.dur, max: S.dur, id: ++g.uid });
    h.cast = { k: 'e', t: 0.55, max: 0.55 };
    emit(g, { sound: 'foxfire', skill: 'e' });
  } else if (key === 'r') { // 狐毛: armor and 护体灵光 off, for a while
    h.hair -= 1;
    for (const b of g.beasts) if (!b.dead && dist(b, p) <= S.r) b.bareT = S.dur;
    h.cast = { k: 'r', t: 0.55, max: 0.55 };
    addFx(g, { k: 'hair', x: p.x, y: p.y, r: S.r, life: 0.9, max: 0.9 });
    emit(g, { sound: 'hair', skill: 'r' });
  }
}
function dashStep(g, dt) {
  const h = g.hero, d = h.dash, S = SKILLS.w;
  if (d.b && !d.b.dead) { d.x = d.b.x; d.y = d.b.y; }
  const dx = d.x - h.x, dy = d.y - h.y, L = Math.hypot(dx, dy), stop = d.b ? HERO.reach * 0.6 : 0, mv = S.speed * dt;
  h.tx = d.x; h.ty = d.y;
  if (Math.abs(dx) > 1) h.face = dx > 0 ? 1 : -1;
  if (L - stop > mv) { h.x += dx / L * mv; h.y += dy / L * mv; return; }
  if (L > stop) { h.x += dx / L * (L - stop); h.y += dy / L * (L - stop); }
  h.dash = null; h.anim = 0.25; h.cd = Math.min(h.cd, 0.3);
  const land = { x: d.b ? d.b.x : h.x, y: d.b ? d.b.y : h.y };
  for (const b of groundNear(g, land, S.r)) hurt(g, b, S.dmg[h.lvl] * (b === d.b || !d.b ? 1 : 0.5), 'yue');
  addFx(g, { k: 'pounce', x: land.x, y: land.y, r: S.r, life: 0.4, max: 0.4 });
  emit(g, { sound: 'bite' });
  if (d.b && !d.b.dead && !h.orders.length) h.foe = d.b;
}
function firesStep(g, dt) {
  for (const f of g.fires) {
    f.t -= dt;
    for (const b of g.beasts) if (!b.dead && !b.fly && dist(b, f) <= f.r) b.burnT = SKILLS.e.burn;
  }
  g.fires = g.fires.filter((f) => f.t > 0);
  for (const b of g.beasts) {
    if (b.bareT > 0) b.bareT -= dt;
    if (b.burnT > 0) { b.burnT -= dt; hurt(g, b, SKILLS.e.dps * dt, 'fox'); }
  }
}

// ── 银月's will: her orders, else her post (engage, leash, wander) ──
const go = (p, speed = HERO.speed) => ({ x: p.x, y: p.y, speed });
function ordersGoal(g) {
  const h = g.hero;
  while (h.orders.length) {
    const o = h.orders[0];
    if (o.k === 'move') {
      if (dist(h, o) > 2) return go(o);
      h.post = { x: o.x, y: o.y }; h.orders.shift(); h.wanderT = 3; continue;
    }
    if (o.k === 'attack') {
      // done with it, she goes back to her post — a tower defense wants her on her choke point, not where it fell (Hanli 10-20)
      if (o.b.dead || dist(h, o.b) > o.lose) { h.orders.shift(); if (!h.orders.length) h.homing = true; h.foe = null; continue; }
      h.foe = o.b;
      return dist(h, o.b) > HERO.reach ? go(o.b) : null;
    }
    // a cast she walks into range for
    const S = SKILLS[o.key], p = aimPos(o.at);
    if ((o.at.b && o.at.b.dead) || !skillState(g, o.key).ready) { h.orders.shift(); continue; }
    if (dist(h, p) > S.range) return go(p);
    h.orders.shift(); castNow(g, o.key, o.at);
    return null;
  }
  return undefined;
}
function idleGoal(g, dt) {
  const h = g.hero, post = h.post;
  if (h.homing) { if (dist(h, post) > 2) return go(post); h.homing = false; }
  if (dist(h, post) > HERO.leash) { h.foe = null; h.homing = true; return go(post); }
  if (h.held.length) { h.foe = h.held.includes(h.foe) ? h.foe : h.held[0]; return null; }
  if (h.foe && (h.foe.dead || h.foe.fly || dist(h.foe, h) > HERO.acquire * 1.3)) h.foe = null;
  if (!h.foe) { // acquire: the nearest ground beast in sight, and inside the leash
    let bd = 1e9;
    for (const b of g.beasts) {
      if (b.dead || b.fly || dist(b, post) > HERO.acquire || dist(b, h) > HERO.acquire) continue;
      const v = HERO.meet ? b.d : dist(b, h); // the guard's choice: meet the one still coming, not chase the one gone by
      if (v < bd) { bd = v; h.foe = b; }
    }
  }
  if (h.foe) { h.act = null; h.wanderTo = null; return dist(h, h.foe) > HERO.reach ? go(h.foe) : null; }
  if (dist(h, post) > HERO.wander + 4 && !h.wanderTo) return go(post);
  // nothing near: she wanders a little, sniffs, sits, flicks her tail
  if (h.wanderTo) {
    if (dist(h, h.wanderTo) > 1.5) return go(h.wanderTo, HERO.speed * 0.3);
    h.wanderTo = null;
    h.act = { k: ['sniff', 'sit', 'flick'][Math.floor(h.rnd() * 3)], t: 1.2 + h.rnd() * 1.6 };
  }
  if (h.act) { h.act.t -= dt; if (h.act.t <= 0) h.act = null; }
  h.wanderT -= dt;
  if (h.wanderT <= 0) {
    h.wanderT = 3 + h.rnd() * 4;
    const a = h.rnd() * Math.PI * 2, r = (0.4 + h.rnd() * 0.6) * HERO.wander;
    h.wanderTo = { x: clampX(post.x + Math.cos(a) * r), y: clampY(post.y + Math.sin(a) * r * 0.6) };
  }
  return null;
}
/** Standing: she holds up to two ground beasts in reach, bites her foe (or one she holds, or the nearest), and is bitten. */
function fight(g, dt) {
  const h = g.hero;
  for (const b of g.beasts) {
    if (h.held.length >= HERO.block) break;
    if (b.dead || b.fly || b.held || BEASTS[b.type].leap) continue;
    if (dist(b, h) < HERO.reach) { b.held = true; h.held.push(b); }
  }
  if (!h.held.length) h.hp = Math.min(HERO.hp[h.lvl], h.hp + HERO.regen * dt);
  for (const b of h.held) h.hp -= (BEASTS[b.type].bite || 0) * dt;
  if (h.cd <= 0) {
    let t = h.foe && !h.foe.dead && dist(h.foe, h) < HERO.reach + 12 ? h.foe : h.held[0] || null;
    if (!t) {
      let bd = HERO.reach + 12;
      for (const b of g.beasts) { if (b.dead || b.fly) continue; const d = dist(b, h); if (d < bd) { bd = d; t = b; } }
    }
    if (t) { h.face = t.x >= h.x ? 1 : -1; h.anim = 0.25; h.cd = HERO.rate; hurt(g, t, HERO.dmg[h.lvl], 'yue'); emit(g, { sound: 'bite' }); } else h.cd = 0.1;
  }
}
function heroStep(g, dt) {
  const h = g.hero;
  for (const k of SKEYS) h.cds[k] = Math.max(0, h.cds[k] - dt); // cooldowns run even while she is away
  if (h.cast) { h.cast.t -= dt; if (h.cast.t <= 0) h.cast = null; }
  if (h.dead > 0) {
    h.dead -= dt;
    if (h.dead <= 0) {
      h.dead = 0; h.hp = HERO.hp[h.lvl]; h.x = h.tx = g.home.x; h.y = h.ty = g.home.y;
      h.post = { ...g.home }; h.orders = []; h.foe = null; h.homing = false; heroSay(g, 'back');
    }
    return;
  }
  if (h.hp <= 0 && !h.dash) { heroDown(g); return; }
  h.anim -= dt; h.cd -= dt;
  h.held = h.held.filter((b) => !b.dead);
  if (h.dash) { h.moving = true; dashStep(g, dt); return; }
  if (h.auto.q && h.cds.q <= 0) { // 啸月 on autocast: a crowd of three, or the boss
    const n = groundNear(g, h, SKILLS.q.r);
    if (n.length >= 3 || n.some((b) => BEASTS[b.type].boss)) howl(g);
  }
  let goal = ordersGoal(g);
  if (h.dash) { h.moving = true; return; }
  if (goal === undefined) goal = idleGoal(g, dt);
  if (goal && dist(h, goal) > 1) {
    release(h);
    const dx = goal.x - h.x, dy = goal.y - h.y, L = Math.hypot(dx, dy), mv = Math.min(L, goal.speed * dt);
    h.x += dx / L * mv; h.y += dy / L * mv; h.tx = goal.x; h.ty = goal.y;
    if (Math.abs(dx) > 1) h.face = dx > 0 ? 1 : -1;
    h.moving = true;
    return;
  }
  h.moving = false; h.tx = h.x; h.ty = h.y;
  fight(g, dt);
  if (h.hp <= 0) heroDown(g);
}
function heroDown(g) {
  const h = g.hero;
  h.hp = 0; h.dead = HERO.respawn; h.say = null; h.cast = null; h.act = null; h.dash = null; h.moving = false;
  release(h); h.orders = []; h.foe = null; h.homing = false; h.wanderTo = null;
  emit(g, { heroDown: HERO.respawn });
}

/** The sim's 银月: a plain autocast policy (啸月 is on autocast already). 狐毛 on the boss or a knot of 犰狳; 月影扑 on the
    ground beast nearest her; 狐火 where three or more stand close. She keeps her post; the bot never moves her. */
export function heroBot(g) {
  const h = g.hero;
  if (h.dead > 0 || h.dash || h.orders.length) return;
  const inR = (R) => groundNear(g, h, R);
  const crowd = (list, R, pick = () => true) => {
    let best = null, bn = 0;
    for (const b of list) { const n = list.filter((c) => pick(c) && dist(b, c) <= R).length; if (n > bn) { bn = n; best = b; } }
    return { best, n: bn };
  };
  if (skillState(g, 'r').ready) {
    const list = inR(SKILLS.r.range), boss = list.find((b) => BEASTS[b.type].boss), arm = crowd(list, SKILLS.r.r, (b) => b.armor);
    const t = boss ?? (arm.n >= 3 ? arm.best : null);
    if (t) cast(g, 'r', { b: t });
  }
  if (skillState(g, 'e').ready) {
    const c = crowd(inR(SKILLS.e.range), SKILLS.e.r);
    if (c.best && (c.n >= 3 || BEASTS[c.best.type].boss)) cast(g, 'e', { x: c.best.x, y: c.best.y });
  }
  if (skillState(g, 'w').ready) {
    const list = inR(SKILLS.w.range);
    if (list.length) cast(g, 'w', { b: list.reduce((a, b) => (dist(b, h) < dist(a, h) ? b : a)) });
  }
}

/** One step of `dt` seconds: the countdown, the spawns, the beasts, 银月, the towers, the shots. */
export function step(g, dt) {
  if (g.over) return g;
  g.t += dt;
  while (g.queue.length && g.queue[0].at <= g.t) spawn(g, g.queue.shift().type);
  if (g.wave < waves(g) && !g.queue.length) { g.nextTimer -= dt; if (g.nextTimer <= 0) callWave(g, false); }
  beastsStep(g, dt);
  heroStep(g, dt);
  firesStep(g, dt);
  towersStep(g, dt);
  projStep(g, dt);
  g.beasts = g.beasts.filter((b) => !b.dead);
  if (!g.over && g.wave === waves(g) && !g.queue.length && !g.beasts.length) g.over = 'win';
  return g;
}
export const starsOf = (hp) => (hp >= HP ? 3 : hp >= 6 ? 2 : 1);
/** Waves held: all on a win; else the ones fully past. */
export const cleared = (g) => (g.over === 'win' ? waves(g) : (g.queue.length || g.beasts.length) ? Math.max(0, g.wave - 1) : g.wave);

// ── The board's input, as 魔兽争霸 III reads it (pure, so a later shell keeps it) ──────────────────
// `sel`: { hero, spot, aim } — 银月 selected; the build spot / talisman whose menu is open (-1 none); the skill being aimed.
// She stays selected through her orders; selecting a spot, clicking her again, Esc, or (mouse) a click on empty ground ends it.
export const noSel = () => ({ hero: false, spot: -1, aim: null });
const heroHit = (h, p, touch) => h.dead <= 0 && Math.hypot(p.x - h.x, p.y - (h.y - 20)) < (touch ? 40 : 34);
function spotHit(g, p) {
  let hit = -1, bd = 34 * 34;
  g.L.spots.forEach(([x, y], i) => { const dx = p.x - x, dy = p.y - (g.towers[i] ? y - 12 : y), d = dx * dx + dy * dy; if (d < bd) { bd = d; hit = i; } });
  return hit;
}
/** A selection that still holds: she can't stay selected while she is away (and isn't reselected when she's back). */
export const keepSel = (g, sel) => (sel.hero && g.hero.dead > 0 ? { ...sel, hero: false, aim: null } : sel);
/** Aim a skill (Q W E R): one that needs no aim is cast at once. Returns { sel, did }: 'cast' · 'aim' · 'no' (locked, cooling, no charge). */
export function pressSkill(g, sel, key) {
  if (!skillState(g, key).ready) return { sel, did: 'no' };
  if (!SKILLS[key].aim) { cast(g, key); return { sel: { ...sel, hero: true, spot: -1, aim: null }, did: 'cast' }; }
  return { sel: { ...sel, hero: true, spot: -1, aim: key }, did: 'aim' };
}
/** A key: q w e r (skills), 1 / F1 (select her; twice quickly: centre on her), Escape. `t`: now, in seconds. */
export function pressKey(g, sel, key, t = 0) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (SKILLS[k]) return pressSkill(g, sel, k);
  if (k === '1' || k === 'F1') {
    if (g.hero.dead > 0) return { sel, did: null };
    const twice = sel.hero && t - (sel.at ?? -9) < 0.4;
    return { sel: { hero: true, spot: -1, aim: null, at: t }, did: twice ? 'centre' : 'select' };
  }
  if (k === 'Escape') return { sel: sel.aim ? { ...sel, aim: null } : noSel(), did: 'cancel' };
  return { sel, did: null };
}
/** A click or a tap on the board. `p`: { x, y, button (0 left / 2 right), shift, touch }. Returns { sel, did, spot? }:
    did 'select' · 'deselect' · 'move' · 'attack' · 'cast' · 'spot' (open its menu) · 'cancel' · null. */
export function pointer(g, sel, p) {
  const h = g.hero, alive = h.dead <= 0;
  if (sel.aim) { // aiming: a left click casts there, a right click cancels
    if (p.button === 2) return { sel: { ...sel, aim: null }, did: 'cancel' };
    const b = SKILLS[sel.aim].aim === 'any' ? beastAt(g, p.x, p.y, p.touch ? 22 : 14) : null;
    const ok = cast(g, sel.aim, b ? { b } : { x: p.x, y: p.y }, p.shift);
    return { sel: { ...sel, aim: null }, did: ok ? 'cast' : 'no' };
  }
  if (p.button === 2) { // right click: her order, wherever the selection was
    if (!alive) return { sel, did: null };
    const b = beastAt(g, p.x, p.y);
    const did = b ? (orderAttack(g, b, p.shift) ? 'attack' : orderMove(g, p.x, p.y, p.shift) && 'move') : (orderMove(g, p.x, p.y, p.shift) && 'move');
    return { sel: { ...sel, hero: true, spot: -1 }, did };
  }
  if (heroHit(h, p, p.touch)) return { sel: { ...sel, hero: !sel.hero, spot: -1 }, did: sel.hero ? 'deselect' : 'select' };
  const s = spotHit(g, p);
  if (s >= 0) return s === sel.spot ? { sel: { ...sel, spot: -1 }, did: 'deselect' } : { sel: { ...sel, hero: false, spot: s }, did: 'spot', spot: s };
  if (p.touch && sel.hero && alive) { // the phone: tap her, then each tap is an order
    const b = beastAt(g, p.x, p.y, 22);
    if (b && orderAttack(g, b, p.shift)) return { sel, did: 'attack' };
    orderMove(g, p.x, p.y, p.shift);
    return { sel, did: 'move' };
  }
  return { sel: noSel(), did: sel.hero || sel.spot >= 0 ? 'deselect' : null };
}

// ── The sim: a player's build, headless ────────────────────────────────────────────────────────
/** How much road (and flier line, for a tower that strikes the air) a spot sees at a range. */
export function coverage(L, x, y, R, air = 0) {
  let n = 0;
  for (let d = 0; d < L.road.len; d += 8) { const p = posOnPath(L.road, d); if ((p.x - x) ** 2 + (p.y - y) ** 2 <= R * R) n += 1; }
  if (air && L.air) for (let d = 0; d < L.airLen; d += 8) {
    const k = d / L.airLen, ax = L.air.x + (L.furn.x - L.air.x) * k, ay = L.air.y + (L.furn.y - 18 - L.air.y) * k;
    if ((ax - x) ** 2 + (ay - y) ** 2 <= R * R) n += air;
  }
  return n;
}
// a flier is only an air talisman's to stop: its line counts thrice
function bestSpot(g, type) {
  const D = TOWERS[type], fliers = beastsOf(g.L).some((t) => BEASTS[t].fly);
  let bi = -1, bv = -1;
  g.L.spots.forEach(([x, y], i) => { if (g.towers[i]) return; const v = coverage(g.L, x, y, D.range[0], D.air && fliers ? 3 : 0); if (v > bv) { bv = v; bi = i; } });
  return bi;
}
function upgradeCheapest(g, only) {
  let bi = -1, bc = 1e9;
  g.towers.forEach((tw, i) => { if (!tw || tw.lvl >= 2 || (only && !only.has(i))) return; const c = upgradeCost(tw); if (c < bc) { bc = c; bi = i; } });
  if (bi >= 0 && g.money >= bc) upgrade(g, bi);
}
/** A build order played greedily: each talisman to the free spot that sees the most road; a talisman
    not yet unlocked waits its wave (the next one goes first); when the order is done, or the spots are
    full, the cheapest upgrade. `cap`: build no more than that many, then only upgrade them. */
function recipe(order, { cap = Infinity, first = 4 } = {}) {
  return (g) => {
    g._done = g._done || new Set();
    const built = g.towers.filter(Boolean).length;
    // past the first few, every other spend is an upgrade
    if (built >= first && g._up) { const before = g.money; upgradeCheapest(g); if (g.money < before) g._up = false; else if (!g.towers.some((t) => t && t.lvl < 2)) g._up = false; return; }
    if (built < cap) {
      const i = order.findIndex((t, k) => !g._done.has(k) && g.L.towers.includes(t) && !locked(g, t));
      const k = order.findIndex((t, k2) => !g._done.has(k2) && g.L.towers.includes(t));
      if (i >= 0) {
        const s = bestSpot(g, order[i]);
        if (s < 0) g._done.add(i);
        else if (build(g, s, order[i])) { g._done.add(i); g._up = true; }
        return;
      }
      if (k >= 0) return; // saving for one still locked
    }
    upgradeCheapest(g);
  };
}
export const MIXED = ['huo', 'jian', 'han', 'huo', 'lei', 'jian', 'lei', 'huo', 'han', 'jian', 'lei', 'jian'];
// a level with fliers: the swords come first (the wave preview shows them coming)
export const MIXED_AIR = ['jian', 'huo', 'jian', 'han', 'lei', 'huo', 'lei', 'jian', 'han', 'huo', 'lei', 'jian'];
const mixed = [recipe(MIXED), recipe(MIXED_AIR)];

/* A human-like player — the bot the balance is tuned for (Hanli 10-20: a game tuned by perfect bots alone, never by
   an open-source game's players, must lean gentle). Not optimal, on purpose: one of a few sensible plans, the spot
   picked among the better ones, not always the best; each build and upgrade 1–2 s after it could have been made;
   银月 moved only now and then (every ~10 s, toward the busiest stretch of road); her skills cast late (0.5–1 s after
   ready), 月影扑 and 狐火 sometimes forgotten for a while; 狐毛 kept for the boss; never a wave called early. */
const HUMAN_PLANS = [
  ['huo', 'jian', 'han', 'huo', 'jian', 'lei', 'huo', 'jian', 'lei', 'han', 'huo', 'jian'],
  ['jian', 'huo', 'jian', 'huo', 'han', 'lei', 'jian', 'huo', 'lei', 'jian', 'han', 'huo'],
  ['huo', 'huo', 'jian', 'han', 'jian', 'lei', 'huo', 'lei', 'jian', 'han', 'huo', 'jian'],
];
// fliers on the level: the lead-in says fire can't reach them, so a sword or two goes up early
const HUMAN_PLANS_AIR = [
  ['jian', 'huo', 'jian', 'han', 'huo', 'lei', 'jian', 'lei', 'huo', 'han', 'jian', 'huo'],
  ['huo', 'jian', 'jian', 'huo', 'lei', 'han', 'jian', 'lei', 'huo', 'jian', 'han', 'huo'],
  ['jian', 'jian', 'huo', 'han', 'lei', 'huo', 'jian', 'lei', 'huo', 'han', 'jian', 'huo'],
];
function humanOf(g) {
  if (g._hb) return g._hb;
  const rnd = rng(`${g.seed}|human`), air = beastsOf(g.L).some((t) => BEASTS[t].fly);
  const plans = air ? HUMAN_PLANS_AIR : HUMAN_PLANS;
  g._hb = { rnd, plan: plans[Math.floor(rnd() * plans.length)], next: 0, act: null, moveT: 8 + rnd() * 4, sk: {} };
  return g._hb;
}
/** A free spot for a talisman: among the three that see the most road, the better ones likelier. */
function humanSpot(g, type, rnd, o) {
  const D = TOWERS[type], fliers = beastsOf(g.L).some((t) => BEASTS[t].fly);
  const free = g.L.spots.map(([x, y], i) => ({ i, v: g.towers[i] ? -1 : coverage(g.L, x, y, D.range[0], D.air && fliers ? 3 : 0) }))
    .filter((s) => s.v >= 0).sort((a, b) => b.v - a.v).slice(0, 3);
  if (!free.length) return -1;
  const r = o.best ? 0 : rnd();
  return free[r < 0.55 || free.length === 1 ? 0 : r < 0.85 || free.length === 2 ? 1 : 2].i;
}
/** What the player means to do next: the plan's next talisman (the next one open, if that one is locked), or an upgrade. */
// what a player builds when a beast gets through: a sword for what flies, fire for what's armored, frost for what leaps
const answerTo = (B) => (B.fly ? 'jian' : B.armor ? 'huo' : B.leap ? 'han' : null);
function humanWant(g, hb) {
  // the furnace was hit: the answer to what hit it goes to the front of the plan (once for each two that got through)
  for (const [type, n] of Object.entries(g.stats.leaks)) {
    const a = answerTo(BEASTS[type]), seen = hb.leaks?.[type] ?? 0;
    if (!a || n < seen + 2 || !g.L.towers.includes(a)) continue;
    (hb.leaks ??= {})[type] = n;
    hb.plan = [a, ...hb.plan];
  }
  const built = g.towers.filter(Boolean).length, full = built >= g.L.spots.length || hb.next >= hb.plan.length;
  const ups = g.towers.map((tw, i) => (tw && tw.lvl < 2 ? i : -1)).filter((i) => i >= 0);
  if (!full && (built < 3 || !ups.length || hb.rnd() < 0.55)) {
    for (let k = hb.next; k < hb.plan.length; k += 1) {
      const t = hb.plan[k];
      if (!g.L.towers.includes(t)) continue;
      if (locked(g, t)) continue;
      return { k: 'build', type: t, idx: k };
    }
  }
  if (!ups.length) return null;
  // the cheapest upgrade, now and then just the one she likes
  const i = hb.rnd() < 0.7 ? ups.reduce((a, b) => (upgradeCost(g.towers[b]) < upgradeCost(g.towers[a]) ? b : a)) : ups[Math.floor(hb.rnd() * ups.length)];
  return { k: 'up', i };
}
function humanBuild(g, hb, o) {
  if (!hb.act) { hb.act = humanWant(g, hb); hb.at = null; if (!hb.act) return; }
  const a = hb.act;
  const cost = a.k === 'build' ? TOWERS[a.type].cost[0] : g.towers[a.i] ? upgradeCost(g.towers[a.i]) : Infinity;
  if (a.k === 'up' && (!g.towers[a.i] || g.towers[a.i].lvl >= 2)) { hb.act = null; return; }
  if (g.money < cost) { hb.at = null; return; }
  if (hb.at === null) { hb.at = g.t + (o.delay ? 1 + hb.rnd() : 0); if (o.delay) return; } // she notices she can afford it, a beat later
  if (g.t < hb.at) return;
  if (a.k === 'build') {
    const s = humanSpot(g, a.type, hb.rnd, o);
    if (s >= 0 && build(g, s, a.type)) { hb.plan = [...hb.plan]; hb.plan.splice(a.idx, 1); }
    else if (s < 0) hb.next = hb.plan.length;
  } else upgrade(g, a.i);
  hb.act = null;
}
/** The busiest stretch of the road's lower half: the ground beast (past 40% of its road) with the most others within 80. */
function busiest(g) {
  const list = g.beasts.filter((b) => !b.dead && !b.fly && b.d > b.len * 0.4); // the ones that got past the first talismans
  let best = null, bn = 0;
  for (const b of list) { const n = list.filter((c) => dist(b, c) <= 80).length; if (n > bn) { bn = n; best = b; } }
  return best;
}
function humanHero(g, hb, o) {
  const h = g.hero;
  if (h.dead > 0) return;
  hb.moveT -= 0.25;
  if (o.move && hb.moveT <= 0) {
    hb.moveT = 8 + hb.rnd() * 4;
    // not while she has beasts in her jaws, nor when the crowd is coming to her anyway; else onto the road where it is
    const b = h.held.length ? null : busiest(g);
    // she stays about her stretch of road: a player doesn't send the guard across the board
    if (b && dist(b, h.post) > HERO.acquire) {
      const p = posOnPath(g.L.road, b.d), k = Math.min(1, 120 / Math.max(1, dist(p, g.home)));
      orderMove(g, g.home.x + (p.x - g.home.x) * k, g.home.y + (p.y - g.home.y) * k);
    }
  }
  if (h.dash || h.orders.length) return;
  const groundIn = (R) => groundNear(g, h, R);
  for (const key of ['r', 'e', 'w']) {
    const st = skillState(g, key), sk = (hb.sk[key] ??= { at: null });
    if (!st.ready) { sk.at = null; continue; }
    if (sk.at === null) sk.at = o.late ? g.t + 0.5 + hb.rnd() * 0.5 + (key !== 'r' && hb.rnd() < 0.3 ? 4 + hb.rnd() * 6 : 0) : g.t; // late, and now and then forgotten
    if (g.t < sk.at) continue;
    if (key === 'r') { // 狐毛: the boss wave only
      const boss = groundIn(SKILLS.r.range).find((b) => BEASTS[b.type].boss);
      if (boss) cast(g, 'r', { b: boss });
    } else if (key === 'e') {
      const list = groundIn(SKILLS.e.range);
      let best = null, bn = 0;
      for (const b of list) { const n = list.filter((c) => dist(b, c) <= SKILLS.e.r).length; if (n > bn) { bn = n; best = b; } }
      if (best && (bn >= 3 || BEASTS[best.type].boss)) cast(g, 'e', { x: best.x, y: best.y });
    } else {
      const list = groundIn(SKILLS.w.range);
      if (list.length) cast(g, 'w', { b: list[Math.floor(hb.rnd() * list.length)] });
    }
    if (!skillState(g, key).ready) sk.at = null;
  }
}
/** The human-like player, called four times a second like every strategy. */
export const humanBot = (opts = {}) => {
  const o = { move: true, delay: true, best: false, late: true, ...opts };
  return (g) => { const hb = humanOf(g); humanBuild(g, hb, o); humanHero(g, hb, o); };
};
export const human = humanBot();

// every build but `none` plays 银月's skills too (`none`: she is left on 啸月's autocast alone)
const withHero = (pol) => (g) => { pol(g); heroBot(g); };
export const STRATS = {
  none: () => {},
  jian: withHero(recipe(Array(12).fill('jian'))),
  huo: withHero(recipe(Array(12).fill('huo'))),
  mixed: withHero((g) => mixed[beastsOf(g.L).some((t) => BEASTS[t].fly) ? 1 : 0](g)),
  // a thin first-timer: two talismans, then only upgrades them
  thin: withHero(recipe(['jian', 'huo'], { cap: 2 })),
  human,
};
/** Play a level headless: `strategy` a STRATS name or (g) => void, called four times a second. */
export function sim(row, strategy = 'mixed', { seed = 'sim', dt = 1 / 30 } = {}) {
  const pol = typeof strategy === 'function' ? strategy : STRATS[strategy];
  if (!pol) throw new Error(`unknown strategy ${strategy} (have: ${Object.keys(STRATS).join(',')})`);
  const g = newGame(row, { seed, headless: true });
  let lp = -1;
  while (!g.over && g.t < 4000) { if (g.t - lp >= 0.25) { pol(g); lp = g.t; } step(g, dt); }
  return { strategy: typeof strategy === 'string' ? strategy : 'custom', result: g.over || 'timeout', wave: g.wave, waves: waves(g), cleared: cleared(g),
    hp: g.hp, stars: g.over === 'win' ? starsOf(g.hp) : 0, time: Math.round(g.t), money: g.money, kills: g.stats.kills, leaks: g.stats.leaks,
    towers: g.towers.map((t) => (t ? `${t.type}${t.lvl + 1}` : '·')).join(' ') };
}
