// core.js — 撒豆成兵 · 守山门's engine: the DEFENCE crowd game, a second 撒豆成兵 beside the attack run (games/sadou)
// (Hanli 10-21: 「好, 做一版. 这个是在防守, 现在的撒豆成兵是在进攻.」; after his first play: 「一共3列, 要么打野猪,
// 要么打两边的+攻击的卡」 — the cards ride down with the tide, 「还有个墙挡一下, 需要线打墙」).
// Pure and headless: no Phaser, no DOM. The scene (tools/sadoushou/src) draws what this holds; tests and bots run it as is.
//
//   newGame(kit, level, { seed }) → g      aim(g, x, hold)      step(g, dt)      sim(kit, level, bot) → result
//
// The road has THREE columns (COLS): the 兽潮 comes down the MIDDLE; the two SIDE columns are belts of cards coming
// down — + cards, red − cards, and stone walls with an HP number in front of what they hide. 小満's squad stands at the
// wall (z = 0) under his aim and FIRES ON ITS OWN (the genre's rule: the player only moves): a stream of 豆兵 straight up
// its column, denser the bigger the squad (`shot.rate` + `perSoldier` a 豆兵, to `max`), carrying the squad's whole
// attack (`dps` per 豆兵, a second, × the tier's `power`). A 豆兵 strikes the first thing it meets: a card's number goes
// UP a `step` a hit (a −5 shot past zero turns +), and the card pays its number to the squad when it pops at its `cap`
// or when it reaches the line with the squad standing in its column (a red one there costs); a wall loses hp and,
// broken, opens what is behind it (or lifts the squad a tier: 豆兵 → 纸甲兵 → 铜人); a wave loses beasts by power. So
// the choice is moment to moment: pump a card on a side, or kill in the middle while the tide comes closer. After the waves the
// 大妖 steps out, walks down the middle, and CHARGES down the column the squad stands in — a line shown `warn` s ahead —
// knocking aside `kill` of the squad unless it moved off. A wave or the 大妖 at the wall hurts the wall; 0 is the loss.
//
// A level may send MORE THAN ONE 大妖 (`boss` a list, Hanli 10-22: 「可以马小宝, 马三两个boss从中路冲下来, 带一堆家丁等」):
// each walks down at its own place across the middle (`at`), charges on its own clock (`charge.first`, then `every`),
// its own way (`charge.kind`: `roll` comes down the column, `slam` stamps where it stands — the shock runs down the
// column), and may bring a crowd (`crowd`: a wave that comes down with it). The level is won when every one is down and
// the road is clear. A card that `feeds` one (its beast id) stops it `stall` s when the squad takes it. `g.boss` is the
// first — a one-boss level reads exactly as before.
//
// 结印 (Hanli 10-21: 「把结印放到现有的塔防类游戏中」; the camera dock is games/jieyin/helper.js, the page's): a move made
// at the camera always strikes a BEAST (Hanli 10-21: 「接了印后, 火弹没有打怪, 打了一个近处的卡」): the 大妖 when it is
// out, else the nearest wave down the column the dock names (the hand's lane) or the squad's, else the nearest wave in
// any column (auto-aim) — never a card or a stone wall — for `secs` of the squad's attack at once (× `bossMul` on the
// 大妖, at most `bossCap` of its full hp: a big chunk, never the whole fight), then rests `cool` s. No beast on the road
// (a 大妖 still beyond the far end, z ≥ TOP, is not on it yet): nothing flies and the seals are not spent.
// Offered only `when` the level says (boss · waves · always). Never needed: every level is won without it (Hanli:
// 「用户结印失败, 或者不愿意使用摄像头, 塔防游戏也能正常完成」), it only makes the kill faster — ★★★ easier.
//
// Events out on g.events: wave · card_hit · card · block_hit · block · strike · cleared · breach · boss · charge_warn ·
// charge · charge_end · knock · bosshit · bossdown · eat · spell · low · end (a boss's carry `boss`: its index).

import { lookOf } from '../jieyin/flight.js';
export const TOP = 100;                                     // the road's far end (z)
export const COLS = { L: [-1, -0.34], M: [-0.34, 0.34], R: [0.34, 1] };
export const colOf = (x) => (x < COLS.M[0] ? 'L' : x > COLS.M[1] ? 'R' : 'M');
export const colMid = (c) => (COLS[c][0] + COLS[c][1]) / 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** A tiny seeded RNG (mulberry32 over a string hash). */
export function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Beasts still standing in a wave, by kind; the last kind listed is the front rank and falls first. */
export function waveLeft(w) {
  let hp = w.hp;
  return w.units.map((u) => {
    const n = Math.max(0, Math.min(u.n, Math.ceil(Math.max(0, hp) / u.p - 1e-9)));
    hp -= n * u.p;
    return { b: u.b, n };
  });
}
export const waveCount = (w) => waveLeft(w).reduce((s, u) => s + u.n, 0);
export const perRank = (span, level) => Math.max(4, Math.round((span[1] - span[0]) * (level.perRank ?? 9)));
export const waveDepth = (w, level) => Math.ceil(w.n0 / perRank(w.span, level)) * (level.rank ?? 2.2);

/** The belt's things, laid out from the level's lines: cards and walls on a side column, `from` + k·`every` up the
    road (to `until`), riding down at the belt's speed. A line's `cards` cycle, one a row. */
export function beltOf(level) {
  const out = [];
  for (const [li, ln] of (level.belt.lines ?? []).entries()) {
    const until = ln.until ?? level.belt.until ?? 600;
    for (let k = 0, z = ln.from; z <= until; k += 1, z += ln.every) {
      const card = ln.cards ? ln.cards[k % ln.cards.length] : null;
      const kind = ln.wall ? 'block' : 'card';
      const hp = ln.wall ? ln.wall.hp : card.hp;
      out.push({ id: out.length, line: li, kind, col: ln.col, z, hp, hpMax: hp, n: card?.n ?? 0, step: card?.step ?? 1, cap: card?.cap ?? 30,
        gold: Boolean(card?.gold), gives: ln.wall?.gives ?? null, gone: false,
        icon: ln.wall?.icon ?? card?.icon ?? null, feeds: card?.feeds ?? null, stall: card?.stall ?? 0 });
    }
  }
  // a wall stands alone: no card within `clear` of it in its column but the ones its own line lays just behind it
  const clear = level.belt.clear ?? 7;
  const walls = out.filter((it) => it.kind === 'block');
  const kept = out.filter((it) => it.kind === 'block' || !walls.some((w) => w.col === it.col && Math.abs(w.z - it.z) < clear && !(it.gold && it.z > w.z)));
  return kept.sort((a, b) => a.z - b.z).map((it, i) => ({ ...it, id: i }));
}

export function newGame(kit, level, { seed = 'sadoushou', show = false, calm = false } = {}) {
  const k = level.difficulty ?? 1;
  const g = {
    kit, level, seed, rand: seeded(`core|${seed}`),
    t: 0, phase: 'waves',                          // waves · boss · won · lost
    aimX: 0, hold: true, emitAcc: 0, tier: 0, spellCool: 0, casts: 0, show, calm,
    squad: level.squad, peak: level.squad,         // the 豆兵 at the wall: the blue number
    shots: [],                                     // 豆兵 thrown up the road: { x, z, dmg }
    belt: beltOf(level),
    waves: level.waves.map((w, i) => ({ ...w, i, on: false, done: false })),
    live: [],
    wall: { hp: level.wall, max: level.wall },
    boss: null, bosses: [], low: false, events: [], k, jieyin: jieyinOf(kit, level),
    stats: { thrown: 0, cards: 0, gained: 0, blocks: 0, killed: 0, struck: 0, knocked: 0, breach: 0, bossDmg: 0, onSides: 0, onMiddle: 0 },
  };
  return g;
}

/** The player's input this step: where the squad stands (−1…1). It fires on its own; `hold` false only for tests. */
export function aim(g, x, hold = true) {
  g.aimX = clamp(x, -0.92, 0.92);
  g.hold = Boolean(hold);
}

/** The squad's tier (豆兵 → 纸甲兵 → 铜人): its `power` multiplies the attack. */
export const tierOf = (g) => g.level.tiers[Math.min(g.tier, g.level.tiers.length - 1)];
/** The squad's whole attack a second, and its stream's density (豆兵 thrown a second). */
export const dpsOf = (g) => g.squad * (g.level.dps ?? 1) * tierOf(g).power;
export const rateOf = (g) => Math.min(g.level.shot.max, g.level.shot.rate + g.squad * g.level.shot.perSoldier);

/* ── the stream ── */

function emit(g, dt) {
  if (!g.hold || g.squad <= 0) { g.emitAcc = 0; return; }
  const rate = rateOf(g);
  g.emitAcc += rate * dt;
  g.stats[colOf(g.aimX) === 'M' ? 'onMiddle' : 'onSides'] += dt;
  while (g.emitAcc >= 1) {
    g.emitAcc -= 1;
    g.shots.push({ x: clamp(g.aimX + (g.rand() - 0.5) * 0.12, -0.99, 0.99), z: 0.5, dmg: dpsOf(g) / rate });
    g.stats.thrown += 1;
  }
}

/** The first thing a 豆兵 at x meets between z0 and z1 (its step), as the belt and the waves come down to meet it. */
function hitOf(g, x, z0, z1, dz) {
  const col = colOf(x);
  let best = null, bz = Infinity;
  for (const it of g.belt) {
    if (it.gone || it.col !== col || it.z > z1 + dz + 1 || it.z < z0 - 2) continue;
    if (it.z < bz && it.z <= z1 + 0.5) { best = it; bz = it.z; }
  }
  for (const w of g.live) {
    if (x < w.span[0] - 0.02 || x > w.span[1] + 0.02) continue;
    if (w.front <= z1 + 0.5 && z1 <= w.front + w.depth + 3 && w.front < bz) { best = w; bz = w.front; }
  }
  for (const bs of g.bosses) if (bs.on && bs.hp > 0 && Math.abs(x - bs.x) < bs.half && bs.z <= z1 + 1 && bs.z < bz) { best = bs; bz = bs.z; }
  return best;
}

function moveShots(g, dt) {
  const sp = g.level.shot.speed, dz = (g.level.belt.speed ?? 0) * dt;
  for (let i = g.shots.length - 1; i >= 0; i -= 1) {
    const s = g.shots[i], z0 = s.z;
    s.z += sp * dt;
    const hit = hitOf(g, s.x, z0, s.z, dz);
    if (hit) { strike(g, s, hit); g.shots.splice(i, 1); continue; }
    if (s.z > TOP + 6) g.shots.splice(i, 1);
  }
}

function strike(g, s, hit) {
  if (hit.isBoss) {
    const d = s.dmg;
    hit.hp = Math.max(0, hit.hp - d);
    g.stats.bossDmg += d;
    g.events.push({ t: 'bosshit', boss: hit.i, x: s.x, z: hit.z, d, hp: hit.hp });
    return;
  }
  if (hit.units) return strikeWave(g, s, hit);
  if (hit.kind === 'card') {           // a hit pumps the card's number up a step; at its cap it pops and pays
    hit.n = Math.min(hit.cap, hit.n + hit.step);
    g.events.push({ t: 'card_hit', id: hit.id, x: s.x, z: hit.z, n: hit.n });
    if (hit.n >= hit.cap) pay(g, hit, 'cap');
    return;
  }
  hit.hp -= s.dmg;
  g.events.push({ t: 'block_hit', id: hit.id, x: s.x, z: hit.z, hp: Math.max(0, hit.hp) });
  if (hit.hp > 0) return;
  hit.gone = true;
  g.stats.blocks += 1;
  if (hit.gives === 'tier' && g.tier < g.level.tiers.length - 1) g.tier += 1;
  g.events.push({ t: 'block', id: hit.id, col: hit.col, z: hit.z, gives: hit.gives, tier: g.tier });
}

/** A card pays its number to the squad (a red one takes; the squad never falls under one). */
function pay(g, it, how) {
  it.gone = true;
  const n = Math.floor(it.n);
  const from = g.squad;
  g.squad = Math.max(1, g.squad + n);
  g.peak = Math.max(g.peak, g.squad);
  g.stats.cards += 1;
  g.stats.gained += g.squad - from;
  g.events.push({ t: 'card', id: it.id, n, how, col: it.col, z: it.z, squad: g.squad });
  if (it.feeds) feed(g, it);
}

/** A card that `feeds` a 大妖 (马小宝's 桂花糕): taken while it walks, it stops `stall` s to eat. */
function feed(g, it) {
  const bs = g.bosses.find((b) => b.beast === it.feeds && b.hp > 0 && b.mode === 'walk');
  if (!bs) return;
  bs.mode = 'eat';
  bs.modeT = it.stall;
  g.events.push({ t: 'eat', boss: bs.i, sec: it.stall });
}

function strikeWave(g, s, w) {
  const before = waveCount(w);
  w.hp -= s.dmg;
  const after = waveCount(w);
  g.stats.struck += s.dmg;
  g.stats.killed += before - after;
  g.events.push({ t: 'strike', wave: w.i, x: s.x, z: w.front, killed: before - after, left: after });
}

/* ── the belt ── */

function moveBelt(g, dt) {
  const sp = g.level.belt.speed;
  for (const it of g.belt) {
    if (it.gone) continue;
    it.z -= sp * dt;
    // at the line: a card pays the squad if it stands in its column; otherwise (and a wall) it is gone
    if (it.z <= 0) { if (it.kind === 'card' && colOf(g.aimX) === it.col) pay(g, it, 'line'); else it.gone = true; }
  }
}

/* ── the 兽潮 ── */

function startWaves(g) {
  for (const w of g.waves) {
    if (w.on || g.t < w.t) continue;
    w.on = true;
    const units = w.beasts.map(([b, n]) => ({ b, n: Math.max(1, Math.round(n * g.k)), p: g.kit.beasts[b].power }));
    const live = { i: w.i, span: w.span ?? COLS.M, units, hp: units.reduce((s, u) => s + u.n * u.p, 0), front: TOP + 2, speed: w.speed };
    live.n0 = units.reduce((s, u) => s + u.n, 0);
    live.depth = waveDepth(live, g.level);
    g.live.push(live);
    g.events.push({ t: 'wave', i: w.i, beasts: live.n0, ...(w.crowd != null ? { crowd: w.crowd } : {}) });
  }
}

function marchWaves(g, dt) {
  for (const w of g.live) {
    w.front = Math.max(0, w.front - w.speed * dt);
    if (w.front <= 0 && w.hp > 0) breach(g, w, dt);
  }
  for (const w of [...g.live]) {
    if (w.hp > 0) continue;
    g.live.splice(g.live.indexOf(w), 1);
    if (g.waves[w.i]) g.waves[w.i].done = true;
    g.events.push({ t: 'cleared', i: w.i });
  }
}

/** A wave at the wall: its front rank breaks on it, `breach` beasts a second, each its power in wall. */
function breach(g, w, dt) {
  w.acc = (w.acc ?? 0) + (g.level.breach ?? 8) * dt;
  while (w.acc >= 1 && w.hp > 0) {
    w.acc -= 1;
    const front = [...waveLeft(w)].reverse().find((u) => u.n > 0);
    if (!front) { w.hp = 0; break; }      // a sliver of hp, no beast left standing
    const p = w.units.find((u) => u.b === front.b).p;
    w.hp -= p;
    hurtWall(g, p, 'breach', front.b);
  }
}

function hurtWall(g, d, why, who) {
  g.wall.hp = Math.max(0, g.wall.hp - d);
  g.stats.breach += d;
  g.events.push({ t: 'breach', d, hp: g.wall.hp, why, who });
  if (!g.low && g.wall.hp <= g.wall.max * 0.3) { g.low = true; g.events.push({ t: 'low', hp: g.wall.hp }); }
  if (g.wall.hp <= 0) end(g, false);
}

/* ── the 大妖 (one, or several: `boss` a list) ── */

/** The level's 大妖 rows: one (`boss` an object) or several (a list). */
export const bossRows = (level) => [level.boss].flat().filter(Boolean);
/** The ones standing: out, and not yet down. */
export const bossesUp = (g) => g.bosses.filter((b) => b.on && b.hp > 0);
/** The first one gathering itself for a charge, or rushing (what a player looks at to get off its column). */
export const charging = (g) => g.bosses.find((b) => b.hp > 0 && (b.mode === 'warn' || b.mode === 'rush')) ?? null;

function bossIn(g) {
  g.bosses = bossRows(g.level).map((b, i) => {
    const hp = Math.round(b.hp * g.k), home = b.at ?? 0;
    return { ...b, i, isBoss: true, on: true, hp, hpMax: hp, x: home, home, z: TOP + 6, mode: 'enter', modeT: 0, charges: 0,
      chargeT: b.charge.first ?? b.charge.every * 0.6, line: null, half: b.half ?? 0.3, kind: b.charge.kind ?? 'roll' };
  });
  g.boss = g.bosses[0];
  g.phase = 'boss';
  for (const bs of g.bosses) {
    g.events.push({ t: 'boss', boss: bs.i, hp: bs.hp });
    if (bs.crowd) crowdIn(g, bs);
  }
}

/** A 大妖's crowd (马小宝's · 马三's 家丁): a wave down the middle that comes with it. */
function crowdIn(g, bs) {
  const i = g.waves.length;
  g.waves.push({ t: g.t, beasts: bs.crowd.beasts, speed: bs.crowd.speed ?? 4, i, on: false, done: false, crowd: bs.i });
  startWaves(g);
}

/** How a charge comes down once its warning is over: `roll` down the column to `to`; `slam` lands at once where it
    stands (the shock runs down the column). True when it has arrived. */
const ARRIVE = {
  roll: (bs, c, dt) => { bs.z = Math.max(c.to ?? 4, bs.z - c.speed * dt); return bs.z <= (c.to ?? 4); },
  slam: () => true,
};

/** A 大妖 in these is charging (or just back from one): another waits its turn — two never come at once. */
const BUSY = new Set(['warn', 'rush', 'back']);

const BOSS_MODE = {
  enter(g, bs, c, dt) {
    bs.z -= bs.speed * 4 * dt;
    if (bs.z <= bs.stand) { bs.z = bs.stand; bs.mode = 'walk'; }
  },
  walk(g, bs, c, dt) {
    bs.z = Math.max(0, bs.z - bs.speed * dt);
    bs.x += clamp(bs.home - bs.x, -0.6 * dt, 0.6 * dt);
    if (bs.z <= 0) { bs.wallAcc = (bs.wallAcc ?? 0) + (bs.crush ?? 10) * dt; const d = Math.floor(bs.wallAcc); if (d) { bs.wallAcc -= d; hurtWall(g, d, 'boss', bs.beast); } return; }
    bs.chargeT -= dt;
    if (bs.chargeT <= c.warn && !g.bosses.some((o) => o !== bs && o.hp > 0 && BUSY.has(o.mode))) warn(g, bs, c); // one charge at a time
  },
  warn(g, bs, c, dt) {
    bs.modeT -= dt;
    bs.x += clamp(bs.line - bs.x, -1.4 * dt, 1.4 * dt);
    if (bs.modeT <= 0) { bs.mode = 'rush'; bs.from = bs.z; if (bs.kind === 'roll') bs.x = bs.line; g.events.push({ t: 'charge', boss: bs.i, col: bs.col, x: bs.line, kind: bs.kind }); }
  },
  rush(g, bs, c, dt) {
    if (!ARRIVE[bs.kind](bs, c, dt)) return;
    bs.mode = 'back';
    const hit = colOf(g.aimX) === bs.col;
    const lost = hit ? Math.min(g.squad - 1, Math.ceil(g.squad * c.kill)) : 0;
    if (lost > 0) { g.squad -= lost; g.stats.knocked += lost; g.events.push({ t: 'knock', boss: bs.i, n: lost, col: bs.col, x: bs.line }); }
    g.events.push({ t: 'charge_end', boss: bs.i, col: bs.col, x: bs.line, z: bs.kind === 'roll' ? bs.z : (c.to ?? 4), kind: bs.kind, lost });
  },
  back(g, bs, c, dt) {
    bs.z = Math.min(bs.from, bs.z + c.speed * 0.35 * dt);
    if (bs.z >= bs.from) { bs.mode = 'walk'; bs.chargeT = c.every; }
  },
  eat(g, bs, c, dt) {
    bs.modeT -= dt;
    if (bs.modeT <= 0) bs.mode = 'walk';
  },
};

/** It marks the column the squad stands in, and (a roll) steps over to its head. */
function warn(g, bs, c) {
  bs.mode = 'warn';
  bs.charges += 1;
  bs.col = colOf(g.aimX);
  bs.line = colMid(bs.col);
  bs.modeT = c.warn;
  if (bs.kind !== 'roll') bs.line = bs.x; // a slam stamps where it stands; the column it marks is the squad's
  g.events.push({ t: 'charge_warn', boss: bs.i, col: bs.col, x: bs.kind === 'roll' ? bs.line : colMid(bs.col), sec: c.warn, from: bs.z, kind: bs.kind });
}

function bossStep(g, bs, dt) {
  if (bs.hp <= 0) {
    if (bs.on) { bs.on = false; bs.mode = 'down'; g.events.push({ t: 'bossdown', boss: bs.i, x: bs.x, z: bs.z }); }
    return;
  }
  BOSS_MODE[bs.mode](g, bs, bs.charge, dt);
}

/** Won: every 大妖 down and the road clear (a crowd still coming is still the fight). */
const bossesDone = (g) => g.bosses.every((b) => b.hp <= 0) && !g.live.length;

/* ── 结印 ── */

/** A level's 结印 moves, from the kit's named sets (`jieyinSets`): its `jieyin.set` (a story level `simple`, else `full`),
    kept to its `only` ids where it names some. Data says it; no level is named here. */
export function movesOf(kit, level) {
  const c = level.jieyin;
  if (!c) return [];
  const set = c.moves ?? kit.jieyinSets?.[c.set ?? (level.story ? 'simple' : 'full')] ?? [];
  return c.only ? set.filter((m) => c.only.includes(m.id)) : set;
}
/** A level's 结印 with its moves laid in (what the dock and the engine read), and where the dock stands on the board
    (the kit's `jieyinDock`, a level's own `dock` over it). */
export const jieyinOf = (kit, level) => (level.jieyin ? { ...level.jieyin, moves: movesOf(kit, level), dock: level.jieyin.dock ?? kit.jieyinDock ?? null } : null);

const spellKit = (g) => g.jieyin;
const spellOn = (g, c = spellKit(g)) => Boolean(c) && (g.phase === 'waves' || g.phase === 'boss')
  && (c.when === 'always' || (c.when === 'waves' ? g.live.length > 0 || bossesUp(g).length > 0 : bossesUp(g).length > 0));

/** What the dock shows: offered now (`on`), one may fly (`ready`), the rest left (`cool` of `coolOf` s). */
export function jieyinState(g, c = spellKit(g)) {
  const on = spellOn(g, c);
  return { on, soon: !on && jieyinSoon(g, c), ready: on && g.spellCool <= 0, cool: g.spellCool, coolOf: c?.cool ?? 0, boss: null };
}

/** The ready card's moment (Hanli 10-28: 「结手印前给一个提示, 让用户准备好」): a `boss` offer, every wave out on the road and
    the 大妖 next. */
export const jieyinSoon = (g, c = spellKit(g)) => Boolean(c) && (c.when ?? 'boss') === 'boss' && g.phase === 'waves'
  && bossRows(g.level).length > 0 && g.waves.every((w) => w.on) && !g.waves.every((w) => w.done);

const LANE = { left: 'L', middle: 'M', right: 'R' };
const waveU = (w) => (w.span[0] + w.span[1]) / 2;

/** What a 结印 strikes: the 大妖 when it is out on the road; else the nearest wave on the road down `col`; else the nearest wave
    in any column; else null. Cards and stone walls are never a target. */
export function beastFor(g, col) {
  const boss = bossesUp(g).filter((b) => b.z < TOP).reduce((a, b) => (!a || b.z < a.z ? b : a), null);
  if (boss) return boss;  // two out (马小宝 · 马三): the nearer
  const on = g.live.filter((w) => w.hp > 0 && w.front < TOP);
  const nearest = (ws) => ws.reduce((a, w) => (!a || w.front < a.front ? w : a), null);
  return nearest(on.filter((w) => colOf(waveU(w)) === col)) ?? nearest(on);
}

/** A move made at the camera: it strikes a beast (beastFor) — the dock's lane (left · middle · right) first, else
    the squad's column; true when it flew — false when not offered now, resting, or no beast is on the road (the seals
    are not spent). The event carries where it struck (`x` across, `z` up the road) for the 火弹's flight. */
export function castJieyin(g, id, lane = null) {
  const c = spellKit(g), m = c?.moves?.find((x) => x.id === id) ?? c?.moves?.[0];
  if (!m || !jieyinState(g, c).ready) return false;
  const hit = beastFor(g, LANE[lane] ?? colOf(g.aimX));
  if (!hit) return false;
  const boss = Boolean(hit.isBoss);
  const raw = dpsOf(g) * m.secs * (boss ? c.bossMul ?? 1 : 1) + (m.flat ?? 0);
  const dmg = boss ? Math.min(raw, hit.hpMax * (c.bossCap ?? 1)) : raw; // a big chunk of a 大妖, never the whole fight
  g.spellCool = c.cool;
  g.casts += 1;
  // The page's (`show`): it flies first (jieyin/flight.js — 剑诀 one loop over the field, a dive), the harm falls at the
  // landing; the sims and the tests land it at once.
  const fly = g.show ? (g.calm ? 0.2 : lookOf(m.id)?.fly ?? 0.5) : 0;
  const land = () => landSpell(g, hit, dmg, boss);
  if (fly > 0) (g.landing ??= []).push({ at: g.t + fly, land }); else land();
  const x = boss ? hit.x : waveU(hit);
  g.events.push({ t: 'spell', move: m.id, col: colOf(x), x, z: boss ? hit.z : hit.front, dmg: Math.round(dmg), fly, on: boss ? 'boss' : 'wave', ...(boss ? { boss: hit.i } : {}) });
  return true;
}

function landSpell(g, hit, dmg, boss) {
  if (boss) { hit.hp = Math.max(0, hit.hp - dmg); g.stats.bossDmg += dmg; }
  else { const before = waveCount(hit); hit.hp -= dmg; g.stats.killed += before - waveCount(hit); }
}

/** The casts in the air: the ones whose time has come land. */
function landingStep(g) {
  if (!g.landing?.length) return;
  const due = g.landing.filter((l) => l.at <= g.t);
  g.landing = g.landing.filter((l) => l.at > g.t);
  for (const l of due) l.land();
}

/* ── the run ── */

/** Stars by the share of the wall left, [★★★, ★★]; ★★★ also wants the level done inside `par` s. Any win is ★. */
export function stars(level, wallLeft, sec = 0) {
  const f = wallLeft / level.wall, [three, two] = level.stars;
  return f >= three && sec <= (level.par ?? Infinity) ? 3 : f >= two ? 2 : 1;
}

function end(g, won) {
  if (g.phase === 'won' || g.phase === 'lost') return;
  g.phase = won ? 'won' : 'lost';
  g.events.push({ t: 'end', won, stars: won ? stars(g.level, g.wall.hp, g.t) : 0, wall: g.wall.hp, sec: g.t });
}

export function step(g, dt) {
  if (g.phase === 'won' || g.phase === 'lost') return g;
  g.t += dt;
  g.spellCool = Math.max(0, g.spellCool - dt);
  emit(g, dt);
  startWaves(g);
  moveBelt(g, dt);
  moveShots(g, dt);
  landingStep(g);
  marchWaves(g, dt);
  if (g.phase === 'waves' && g.waves.every((w) => w.done)) bossIn(g);
  if (g.phase === 'boss') {
    for (const bs of g.bosses) bossStep(g, bs, dt);
    if (bossesDone(g)) end(g, true);
  }
  return g;
}

/** Beasts on the road now, and the whole 兽潮 still to beat (the big red number, from the start). */
export const hordeNow = (g) => g.live.reduce((s, w) => s + waveCount(w), 0);
export const hordeAll = (g) => hordeNow(g) + g.waves.filter((w) => !w.on).reduce((s, w) => s + w.beasts.reduce((a, [, n]) => a + Math.max(1, Math.round(n * g.k)), 0), 0);

// ---------------------------------------------------------------- bots (the levels' balance tests play these)

/** What a side column is worth a second right now: a card there to pump grows `step` a hit at the stream's density
    (a red one first pays back its debt); a wall in front costs its hp first and is worth what it hides. */
export function sideValue(g, col) {
  const dps = Math.max(1e-6, dpsOf(g)), rate = rateOf(g);
  const first = g.belt.find((it) => !it.gone && it.col === col && it.z > 3 && it.z < TOP);
  if (!first) return 0;
  if (first.kind === 'block') {
    const behind = g.belt.find((it) => !it.gone && it.col === col && it.z > first.z && it.kind === 'card');
    const worth = first.gives === 'tier' ? g.squad * 0.5 : behind ? behind.cap : 0;
    return worth / (first.hp / dps + 0.5);
  }
  const time = first.z / (g.level.belt.speed + g.level.shot.speed * 0.3);
  const up = Math.min(first.cap - first.n, rate * first.step * time);
  return Math.max(0, first.n + up) / Math.max(0.5, time);
}

/** A pumped card about to reach the line in another column: where to stand to take it (or null). */
function cardAt(g, near = 5) {
  const c = g.belt.find((it) => !it.gone && it.kind === 'card' && it.z <= near && Math.floor(it.n) >= 2);
  return c ? c.col : null;
}

/** Whether to turn on the tide now: when another second of buffing no longer brings the kill sooner (the squad's
    attack grows by what the best side pays), or the nearest wave is `close` s from the wall. `bias` > 1 turns late. */
export function shouldShoot(g, { bias = 1, close = 2.5 } = {}) {
  if (!g.live.length) return false;
  const hp = g.live.reduce((s, w) => s + w.hp, 0);
  const near = Math.min(...g.live.map((w) => w.front / w.speed));
  if (near < close) return true;
  const dps = Math.max(1e-6, dpsOf(g));
  const gain = Math.max(sideValue(g, 'L'), sideValue(g, 'R')) * (g.level.dps ?? 1) * tierOf(g).power * bias;
  const now = hp / dps, later = 1 + hp / (dps + gain);
  return later >= now - (g.level.press ?? 0);  // `press`: the seconds a buff must win back to be worth it
}

/** How hard the middle presses: the seconds the squad needs for the waves on the road over the seconds before the
    nearest reaches the wall (> 1: it gets there first). */
export function pressure(g) {
  if (!g.live.length) return 0;
  const hp = g.live.reduce((s, w) => s + w.hp, 0);
  const near = Math.min(...g.live.map((w) => w.front / w.speed));
  return (hp / Math.max(1e-6, dpsOf(g)) + 1.5) / Math.max(0.1, near);
}

const sideBest = (g) => (sideValue(g, 'L') >= sideValue(g, 'R') ? 'L' : 'R');
/** Off the charge's column, to the side worth the most (or the other side). */
function dodgeTo(g, col) {
  const sides = ['L', 'R'].filter((c) => c !== col);
  return colMid(sides.sort((a, b) => sideValue(g, b) - sideValue(g, a))[0]);
}

const sharp = new WeakMap(); // game → its sharp player (a player holds a little memory: when it last looked)

export const BOTS = {
  /** A sharp player: looks often, turns on the tide neither too early nor too late, never takes the poorer side,
      always gets off the charge's column. */
  good(g) {
    if (!sharp.has(g)) sharp.set(g, humanBot(`sharp|${g.seed}`, { react: 0.1, look: 0.3, judge: 0, wrong: 0, dodge: 1, lean: 0.5 }));
    return sharp.get(g)(g);
  },
  /** Never buffs: the middle only, and stands in the charge. */
  bad() { return colMid('M'); },
  /** Buffs forever and never shoots the tide. */
  greedy(g) { return colMid(sideBest(g)); },
  /** Never moves from where he stood. */
  idle() { return 0; },
};

/**
 * A first-time human (the lesson from 守墙关 10-20: a level tuned by perfect bots was too hard for Hanli): sees late,
 * reconsiders only every `look` s, misjudges when to turn on the tide (`judge`: a random spread on the pressure he
 * turns at), goes to the poorer side `wrong` of the time, gets out of the charge's column only `dodge` of the time.
 */
export function humanBot(seed, { react = 0.45, look = 1.6, judge = 0.6, wrong = 0.25, dodge = 0.6, lean = 1 } = {}) {
  const r = seeded(`human|${seed}`);
  let want = 0, nextLook = 0, seen = 0, at = -1;
  const decided = new Map();
  return (g) => {
    const bs = g.bosses.find((b) => b.hp > 0 && b.mode === 'warn');
    if (bs) {
      const key = `${bs.i}|${bs.charges}`;
      if (!decided.has(key)) decided.set(key, r() < dodge);
      if (decided.get(key) && colOf(want) === bs.col) want = dodgeTo(g, bs.col);
    } else if (g.t >= nextLook) {
      nextLook = g.t + look * (0.6 + r() * 0.8);
      if (bossesUp(g).length) want = colMid('M');
      else {
        const bias = lean * (1 + (r() - 0.5) * 2 * judge);   // how early or late this player turns on the tide
        const side = r() < wrong ? (sideBest(g) === 'L' ? 'R' : 'L') : sideBest(g);
        const take = cardAt(g, 8);
        want = take && r() > wrong ? colMid(take) : shouldShoot(g, { bias, close: 2.5 * bias }) ? colMid('M') : colMid(side);
      }
    }
    if (at < 0 || g.t - at >= react) { seen = want; at = g.t; }
    return seen;
  };
}

/** Plays a whole level with a bot, headless (the bot always holds the stream). */
export function sim(kit, level, bot, { seed = 'sim', dt = 1 / 30, maxSec = 400, casts = false } = {}) {
  const g = newGame(kit, level, { seed });
  let ended = null, maxShots = 0, maxHorde = 0;
  while (g.t < maxSec && !ended) {
    aim(g, bot(g), true);
    if (casts && jieyinState(g).ready) castJieyin(g, null, bossesUp(g).length ? 'middle' : null); // a player casting each time it is ready
    step(g, dt);
    maxShots = Math.max(maxShots, g.shots.length);
    maxHorde = Math.max(maxHorde, hordeNow(g));
    for (const e of g.events) if (e.t === 'end') ended = e;
    g.events.length = 0;
  }
  return { won: Boolean(ended?.won), stars: ended?.stars ?? 0, wall: g.wall.hp, sec: g.t, peak: g.peak, squad: g.squad, tier: g.tier, casts: g.casts, maxShots, maxHorde, bossHp: g.boss?.hp ?? null, stats: g.stats, phase: g.phase };
}
