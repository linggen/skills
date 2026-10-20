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
  jian: { glyph: '剑', color: '#35566e', cost: [60, 60, 90], range: [120, 128, 138], rate: [0.5, 0.45, 0.4], dmg: [10, 14, 20], air: true },
  huo: { glyph: '火', color: '#b0412e', cost: [90, 80, 120], range: [110, 116, 124], rate: [1.6, 1.5, 1.4], dmg: [26, 36, 50], splash: [42, 48, 56], air: false, shot: 160 },
  han: { glyph: '寒', color: '#3f87a6', cost: [80, 70, 100], range: [95, 105, 115], rate: [0.5, 0.5, 0.5], dmg: [2, 3.5, 5.5], slow: [0.5, 0.55, 0.6], air: true },
  lei: { glyph: '雷', color: '#6a4c86', cost: [140, 120, 160], range: [130, 138, 146], rate: [1.5, 1.4, 1.3], dmg: [32, 44, 60], jumps: 3, air: true },
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

/** 银月: tap her, then a place. Standing, she holds up to two ground beasts and bites; howls to stun a crowd. */
export const HERO = { hp: [300, 380, 470], dmg: [22, 30, 40], rate: 0.8, speed: 120, reach: 30, block: 2, howlCd: 12, howlR: 95,
  howlStun: 1.6, howlDmg: [10, 16, 24], regen: 12, respawn: 12, xp: [60, 150] };

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
export function layLevel(row) {
  const road = roadOf(row.road);
  const [fx, fy] = row.furnace;
  const air = row.air ? { x: row.air[0], y: row.air[1] } : null;
  return { ...row, road, furn: { x: fx, y: fy }, air, airLen: air ? Math.hypot(fx - air.x, fy - 18 - air.y) : 0,
    towers: row.towers ?? TORDER, unlock: row.unlock ?? {}, gap: row.gap ?? 20, first: row.first ?? 25, hpScale: row.hpScale ?? 0.12, hpMul: row.hpMul ?? 1 };
}
export const beastsOf = (row) => [...new Set(row.waves.flat().map(([t]) => t))];

export function newGame(row, { seed = 'shoulu', headless = false } = {}) {
  const L = layLevel(row);
  const [hx, hy] = row.hero;
  return { L, t: 0, hp: HP, money: row.money, wave: 0, queue: [], nextTimer: L.first, beasts: [], towers: row.spots.map(() => null), proj: [], fx: [],
    hero: { x: hx, y: hy, tx: hx, ty: hy, hp: HERO.hp[0], lvl: 0, xp: 0, cd: 0, howl: 4, dead: 0, face: -1, anim: 0, say: null, held: [] },
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
  const hp = Math.round(B.hp * L.hpMul * (B.boss ? 1 : 1 + L.hpScale * (g.wave - 1)));
  const b = { id: ++g.uid, type, hp, max: hp, speed: B.speed * (0.95 + g.rnd() * 0.1), d: 0, off: B.boss ? 0 : g.rnd() * 16 - 8, fly: Boolean(B.fly),
    armor: Boolean(B.armor), reward: B.reward, dmg: B.dmg || 1, len: B.fly ? L.airLen : L.road.len, slowT: 0, slowF: 0, stunT: 0, held: false,
    flash: 0, face: 1, x: 0, y: 0, dead: false, cry: B.cry ? B.cry.every : 0, crying: 0 };
  place(g, b);
  g.beasts.push(b);
  if (!g.seen[type]) { g.seen[type] = 1; emit(g, { intro: type }); }
}
/** The next wave: by the countdown (`early` false) or called early (paid for the seconds left). */
export function callWave(g, early = false) {
  if (g.over || g.wave >= waves(g) || g.queue.length) return -1;
  const bonus = early ? Math.round(g.nextTimer * EARLY_RATE) : 0;
  g.money += bonus;
  g.wave += 1;
  emit(g, { banner: g.wave });
  const q = [];
  for (const [type, n, gap, st] of g.L.waves[g.wave - 1]) for (let i = 0; i < n; i += 1) q.push({ at: g.t + st + i * gap, type });
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
/** Send 银月 to a place (clamped to the board). */
export function sendHero(g, x, y) {
  const h = g.hero;
  if (h.dead > 0) return false;
  h.tx = Math.max(14, Math.min(W - 14, x));
  h.ty = Math.max(70, Math.min(H - 20, y));
  return true;
}

function hurt(g, b, d, src) {
  if (b.dead) return;
  if (src === 'jian' && b.armor) d *= ARMOR;
  if (src === 'huo' && BEASTS[b.type].dodge && !(b.slowT > 0) && !(b.stunT > 0)) d *= BEASTS[b.type].dodge;
  const C = BEASTS[b.type].cry;
  if (C) d *= b.crying > 0 ? C.mult : C.guard;
  b.hp -= d;
  b.flash = 0.1;
  if (!g.headless && src !== 'han') addFx(g, { k: 'txt', x: b.x + (Math.random() * 10 - 5), y: b.y - BEASTS[b.type].r - 4, s: String(Math.round(d)), col: src === 'jian' && b.armor ? '#7a7066' : b.crying > 0 ? '#b0412e' : '#2a241d', life: 0.6, max: 0.6, vy: -30, size: b.crying > 0 ? 14 : 11 });
  if (b.hp > 0) return;
  b.dead = true;
  g.money += b.reward;
  g.stats.kills += 1;
  if (src === 'yue') heroXp(g, b.reward);
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
function heroStep(g, dt) {
  const h = g.hero;
  if (h.dead > 0) {
    h.dead -= dt;
    if (h.dead <= 0) { h.dead = 0; h.hp = HERO.hp[h.lvl]; h.x = h.tx = g.home.x; h.y = h.ty = g.home.y; heroSay(g, 'back'); }
    return;
  }
  h.anim -= dt; h.cd -= dt; h.howl -= dt;
  h.held = h.held.filter((b) => !b.dead);
  const dx = h.tx - h.x, dy = h.ty - h.y, dist = Math.hypot(dx, dy);
  if (dist > 2) {
    for (const b of h.held) b.held = false;
    h.held = [];
    const mv = Math.min(dist, HERO.speed * dt);
    h.x += dx / dist * mv; h.y += dy / dist * mv;
    if (Math.abs(dx) > 1) h.face = dx > 0 ? 1 : -1;
    return;
  }
  for (const b of g.beasts) {
    if (h.held.length >= HERO.block) break;
    if (b.dead || b.fly || b.held || BEASTS[b.type].leap) continue;
    if (Math.hypot(b.x - h.x, b.y - h.y) < HERO.reach) { b.held = true; h.held.push(b); }
  }
  if (!h.held.length) h.hp = Math.min(HERO.hp[h.lvl], h.hp + HERO.regen * dt);
  for (const b of h.held) h.hp -= (BEASTS[b.type].bite || 0) * dt;
  if (h.cd <= 0) {
    let t = h.held[0] || null;
    if (!t) {
      let bd = (HERO.reach + 12) ** 2;
      for (const b of g.beasts) { if (b.dead || b.fly) continue; const d2 = (b.x - h.x) ** 2 + (b.y - h.y) ** 2; if (d2 < bd) { bd = d2; t = b; } }
    }
    if (t) { h.face = t.x >= h.x ? 1 : -1; h.anim = 0.25; h.cd = HERO.rate; hurt(g, t, HERO.dmg[h.lvl], 'yue'); emit(g, { sound: 'bite' }); } else h.cd = 0.1;
  }
  if (h.howl <= 0) {
    const near = g.beasts.filter((b) => !b.dead && !b.fly && Math.hypot(b.x - h.x, b.y - h.y) < HERO.howlR);
    if (near.length >= 3 || near.some((b) => BEASTS[b.type].boss)) {
      for (const b of near) { b.stunT = BEASTS[b.type].boss ? HERO.howlStun * 0.4 : HERO.howlStun; hurt(g, b, HERO.howlDmg[h.lvl], 'yue'); }
      h.howl = HERO.howlCd;
      addFx(g, { k: 'howl', x: h.x, y: h.y - 8, r: HERO.howlR, life: 0.6, max: 0.6 });
      emit(g, { sound: 'howl' });
      if (!g.howled) { g.howled = 1; heroSay(g, 'howl'); }
    } else h.howl = 0.4;
  }
  if (h.hp <= 0) {
    h.hp = 0; h.dead = HERO.respawn; h.say = null;
    for (const b of h.held) b.held = false;
    h.held = [];
    emit(g, { heroDown: HERO.respawn });
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
  towersStep(g, dt);
  projStep(g, dt);
  g.beasts = g.beasts.filter((b) => !b.dead);
  if (!g.over && g.wave === waves(g) && !g.queue.length && !g.beasts.length) g.over = 'win';
  return g;
}
export const starsOf = (hp) => (hp >= HP ? 3 : hp >= 6 ? 2 : 1);
/** Waves held: all on a win; else the ones fully past. */
export const cleared = (g) => (g.over === 'win' ? waves(g) : (g.queue.length || g.beasts.length) ? Math.max(0, g.wave - 1) : g.wave);

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
export const STRATS = {
  none: () => {},
  jian: recipe(Array(12).fill('jian')),
  huo: recipe(Array(12).fill('huo')),
  mixed: (g) => mixed[beastsOf(g.L).some((t) => BEASTS[t].fly) ? 1 : 0](g),
  // a thin first-timer: two talismans, then only upgrades them
  thin: recipe(['jian', 'huo'], { cap: 2 }),
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
