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
// wail, cast, wall, wave, clear, offer, boss, low, won, lost.

export const W = 540, H = 960;
export const HERO = { x: 270, y: 846 };
export const FOX = { x: 188, y: 868 };
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
  };
}

const lv = (g, id) => g.skills[id] ?? 0;
const card = (g, id) => g.kit.cards.find((c) => c.id === id);
const emit = (g, e) => { g.events.push(e); };

// ---- waves -------------------------------------------------------------------------------------------------------

function startWave(g) {
  g.phase = 'wave';
  const grow = 1 + (g.level.growth ?? 0) * g.wave;
  g.spawns = g.level.waves[g.wave].flatMap(([kind, n, gap, delay]) =>
    Array.from({ length: n }, (_, i) => ({ kind, at: g.t + delay + i * gap, mul: (g.level.hpMul ?? 1) * grow })));
  g.wave += 1;
  emit(g, { t: 'wave', n: g.wave, of: g.waves });
}

function spawn(g, { kind, mul }, near) {
  const b = g.kit.beasts[kind];
  const x = near ? Math.max(60, Math.min(W - 60, near.x + (g.rnd() - 0.5) * 140)) : 70 + g.rnd() * (W - 140);
  const y = near ? near.y + 20 : -40 - g.rnd() * 30;
  const hp = Math.round(b.hp * (b.boss ? (g.level.hpMul ?? 1) : mul));
  const beast = { id: g.nextId++, kind, x, y, hp, max: hp, speed: b.speed * (0.9 + g.rnd() * 0.2), r: b.r,
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
  if (b.hp <= 0) return 0;
  const k = g.kit.beasts[b.kind];
  let d = dmg * (k.armor?.[kind] ?? 1);
  if (b.freezeT > 0) d *= at(card(g, 'han-freeze').takes, lv(g, 'han-freeze')) ?? 1;
  if (b.wailT > 0) d *= k.wail.takes;
  d = Math.max(0, Math.round(d));
  if (!d) return 0;
  b.hp -= d;
  emit(g, { t: 'hit', id: b.id, x: b.x, y: b.y, dmg: d, kind, big: d >= 60 || extra.big, weak: (k.armor?.[kind] ?? 1) < 1 });
  if (b.hp <= 0) kill(g, b);
  return d;
}

function kill(g, b) {
  g.kills += 1;
  emit(g, { t: 'kill', id: b.id, kind: b.kind, x: b.x, y: b.y, boss: b.boss });
}

const alive = (g) => g.beasts.filter((b) => b.hp > 0);

function inRadius(g, x, y, r, { air = true } = {}) {
  return alive(g).filter((b) => (air || !b.fly) && Math.hypot(b.x - x, b.y - y) <= r + b.r * 0.5);
}

// The one to shoot: the focus while it lives, else the one nearest the wall.
function target(g) {
  const f = g.beasts.find((b) => b.id === g.focus && b.hp > 0 && b.y > -20);
  if (f) return f;
  if (g.focus) g.focus = null;
  let best = null;
  for (const b of g.beasts) if (b.hp > 0 && b.y > -10 && (!best || b.y > best.y)) best = b;
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
  g.shots.push({ id: g.nextId++, age: 0, hit: new Set(), ...s });
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
    shoot(g, { kind: 'sword', x: HERO.x + (i - (n - 1) / 2) * 14, y: HERO.y - 30, ...aim(HERO, t, h.speed, spread),
      dmg, r: h.r, pierce: 1 + pierce, back: lv(g, 'jian-return') > 0, home: t.id });
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

function moveShot(g, s, dt) {
  s.age += dt;
  if (s.lob) {
    const k = Math.min(1, s.age / s.fly);
    s.x = s.fromX + (s.toX - s.fromX) * k;
    s.y = s.fromY + (s.toY - s.fromY) * k;
    s.z = Math.sin(k * Math.PI) * 90;
    if (k >= 1) { burst(g, s); s.dead = true; }
    return;
  }
  // Homing a little toward the one it was fired at (a sword that curls in looks alive; misses look broken).
  const home = g.beasts.find((b) => b.id === s.home && b.hp > 0);
  if (home && !s.returning) {
    const want = Math.atan2(home.y - s.y, home.x - s.x), sp = Math.hypot(s.vx, s.vy);
    let cur = Math.atan2(s.vy, s.vx), d = want - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cur += Math.max(-6 * dt, Math.min(6 * dt, d));
    s.vx = Math.cos(cur) * sp; s.vy = Math.sin(cur) * sp;
  }
  if (s.returning) {
    const sp = Math.hypot(s.vx, s.vy);
    const a = Math.atan2(HERO.y - 30 - s.y, HERO.x - s.x);
    s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
    if (Math.hypot(HERO.x - s.x, HERO.y - 30 - s.y) < 24) s.dead = true;
  }
  s.x += s.vx * dt; s.y += s.vy * dt;
  for (const b of g.beasts) {
    if (b.hp <= 0 || s.hit.has(b.id) || Math.hypot(b.x - s.x, b.y - s.y) > b.r + s.r) continue;
    s.hit.add(b.id);
    if (s.splash) { burst(g, { ...s, radius: s.splash }); s.dead = true; return; }
    const back = s.returning ? at(card(g, 'jian-return').back, lv(g, 'jian-return')) : 1;
    hurt(g, b, s.dmg * back, s.kind === 'sword' ? 'sword' : 'fox');
    s.pierce -= 1;
    if (s.pierce <= 0) { turnOrDie(s); return; }
  }
  if (s.y < -60 || s.x < -60 || s.x > W + 60 || s.y > H) turnOrDie(s);
}

function turnOrDie(s) {
  if (s.back && !s.returning) {
    s.returning = true;
    s.hit = new Set();
    s.pierce = 99;
  } else if (!s.returning) s.dead = true;
}

// ---- beasts ------------------------------------------------------------------------------------------------------

function moveBeast(g, b, dt) {
  for (const k of ['slowT', 'freezeT', 'stunT', 'burnT']) b[k] = Math.max(0, b[k] - dt);
  const k = g.kit.beasts[b.kind];
  if (k.wail) wail(g, b, k.wail, dt);
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
  const sp = b.speed * (b.slowT > 0 ? 1 - b.slow : 1) * (b.wailT > 0 ? 0 : 1);
  b.sway += dt * 3;
  b.x = Math.max(40, Math.min(W - 40, b.x + Math.sin(b.sway) * (b.fly ? 22 : 8) * dt));
  b.y = Math.min(wallY, b.y + sp * dt);
}

function wail(g, b, w, dt) {
  if (b.wailT > 0) return;
  b.wailIn -= dt;
  if (b.wailIn > 0 || b.y < 40) return;
  b.wailIn = w.every;
  b.wailT = w.for;
  emit(g, { t: 'wail', id: b.id, x: b.x, y: b.y });
  const [kind, n] = w.calls;
  for (let i = 0; i < n; i += 1) spawn(g, { kind, mul: (g.level.hpMul ?? 1) * (1 + (g.level.growth ?? 0) * (g.wave - 1)) }, b);
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
  const TIMED = {
    lead: () => { g.timer -= dt; if (g.timer <= 0) startWave(g); },
    count: () => { g.timer -= dt; if (g.timer <= 0) startWave(g); },
    wave: () => fight(g, dt),
  };
  TIMED[g.phase]?.(dt);
}

function fight(g, dt) {
  runSpawns(g);
  heroes(g, dt);
  for (const b of g.beasts) if (b.hp > 0) moveBeast(g, b, dt);
  for (const s of g.shots) moveShot(g, s, dt);
  burnGrounds(g, dt);
  g.shots = g.shots.filter((s) => !s.dead);
  g.beasts = g.beasts.filter((b) => b.hp > 0);
  if (!g.low && g.wall < g.wallMax * 0.3 && g.wall > 0) { g.low = true; emit(g, { t: 'low' }); }
  if (g.wall <= 0) return end(g, false);
  if (!g.spawns.length && !g.beasts.length) {
    g.shots = g.shots.filter((s) => s.lob);
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

// ---- headless play -----------------------------------------------------------------------------------------------

/** The sensible build (the greedy bot): a wide answer first — fire for herds, thunder for chains, then depth. */
export const GREEDY = ['huo-blast', 'lei-chain', 'jian-more', 'huo-ground', 'han-slow', 'yy-foxfire', 'lei-chain', 'huo-blast',
  'jian-pierce', 'lei-strike', 'han-freeze', 'yy-howl', 'jian-more', 'huo-blast', 'lei-chain', 'yy-foxfire', 'jian-return'];

export const BOTS = {
  lazy: () => null,
  random: (g) => g.offer[Math.floor(g.rnd() * g.offer.length)],
  greedy: (g) => GREEDY.find((id) => g.offer.includes(id)) ?? g.offer[0],
};

/** Play a whole level with a chooser; returns { won, stars, wave, wallLeft, kills, skills }. */
export function sim(kit, level, chooser, { seed = 'sim', limit = 900 } = {}) {
  const g = newGame(kit, level, { seed });
  while (!['won', 'lost'].includes(g.phase) && g.t < limit) {
    if (g.phase === 'pick') pick(g, chooser(g));
    else step(g, 0.1);
    g.events.length = 0;
  }
  return { won: g.phase === 'won', stars: stars(g), wave: g.wave, wallLeft: g.wall / g.wallMax, kills: g.kills, skills: g.skills };
}
