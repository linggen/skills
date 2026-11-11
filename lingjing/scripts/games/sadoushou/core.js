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
// CARDS WITH POWERS (Hanli 11-10, at 兽潮 第20潮 with a squad of 1002 against a wave of 81: 「两边的卡有点单调, 可以加一些
// 变化吗? 比如打一个卡后攻击变火弹之类的」): a side card may carry `fx` (the kit's `fx` table names what it does) — shot,
// its number grows a `step` a hit like any card (a form's seconds, 雷符's rows, 换命's cost in % coming down) to its
// `cap`; taken at the line it fires: an ATTACK FORM (火弹 huo · 连珠 lian · 分兵 fen · 穿云 chuan) for that many
// seconds — one at a time, a new one replaces the one on (`g.form`); 冰符 bing slows the road; 雷符 lei strikes the front
// rank of every group on the road; 换命 huan gives up a share of the squad for a tier (at the top tier, `boost` the attack).
// A power never pops: shot to its cap it is charged (shots fly past it) and fires only when taken at the line — so
// taking one is always the player's choice, and a 分兵 stream up the sides never swaps the form by itself.
// A level's `cap` is the most the squad can hold: a + card past it pays nothing.
//
// BEASTS WITH ROLES (a level's `roles`, the 兽潮 nights; the ladder and 守灶台 play without): a beast row's `drift` (鬿雀:
// its flock changes column, the squad must follow), `spit` (犰狳: they stand at `stand` and spit, knocking `share` of the
// squad off every `every` s, for `hold` s, then come on), `armor` (合窳: a plain shot does that share; 火弹 · 穿云 · 雷符
// and 结印 open it), `burst` (蠪侄: one that dies within `z` of the wall takes `kill` soldiers with it). A wave's drifting and
// spitting beasts walk as their own group (`g.live` holds groups; a wave is done when its last group is).
//
// Events out on g.events: wave · card_hit · card · block_hit · block · strike · cleared · breach · boss · charge_warn ·
// charge · charge_end · knock · bosshit · bossdown · eat · spell · low · end (a boss's carry `boss`: its index) · form ·
// form_end · bing · lei · huan · spit · burst · drift.

import { lookOf } from '../jieyin/flight.js';
export const TOP = 100;                                     // the road's far end (z)
export const COLS = { L: [-1, -0.34], M: [-0.34, 0.34], R: [0.34, 1] };
export const colOf = (x) => (x < COLS.M[0] ? 'L' : x > COLS.M[1] ? 'R' : 'M');
export const colMid = (c) => (COLS[c][0] + COLS[c][1]) / 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The attack forms: one on at a time (`g.form`), a new one replacing it. The other powers act at once. */
export const FORMS = ['huo', 'lian', 'fen', 'chuan'];
/** A power's numbers (the kit's `fx` row). */
export const fxOf = (g, id) => g.level.fx?.[id] ?? g.kit.fx?.[id] ?? {}; // a night's own rows first (its deal carries them)
/** The beasts as this level sends them: the kit's rows, a 兽潮 night's `roles` over them (what each is on its road). */
export const beastsOf = (kit, level) => (level.roles && typeof level.roles === 'object'
  ? Object.fromEntries(Object.entries(kit.beasts).map(([b, row]) => [b, level.roles[b] ? { ...row, ...level.roles[b] } : row]))
  : kit.beasts);
/** The most the squad can hold on this level (`cap`; none: no ceiling). */
export const capOf = (g) => g.level.cap ?? Infinity;
/** The road's pace now: 冰符 slows every beast on it. */
const slowK = (g) => (g.slowT > 0 ? fxOf(g, 'bing').slow ?? 0.45 : 1);

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
        gold: Boolean(card?.gold), gives: ln.wall?.gives ?? null, gone: false, fx: card?.fx ?? null,
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
    kit, level, seed, rand: seeded(`core|${seed}`), beasts: beastsOf(kit, level),
    t: 0, phase: 'waves',                          // waves · boss · won · lost
    aimX: 0, hold: true, emitAcc: 0, tier: 0, spellCool: 0, casts: 0, show, calm,
    form: null, boost: 1, slowT: 0, parts: 0,      // the attack form on ({ id, t, of }), 换命's boost, 冰符's seconds left
    squad: level.squad, peak: level.squad,         // the 豆兵 at the wall: the blue number
    shots: [],                                     // 豆兵 thrown up the road: { x, z, dmg }
    belt: beltOf(level),
    waves: level.waves.map((w, i) => ({ ...w, i, on: false, done: false })),
    live: [],
    wall: { hp: level.wall, max: level.wall },
    boss: null, bosses: [], low: false, events: [], k, jieyin: jieyinOf(kit, level),
    stats: { thrown: 0, cards: 0, gained: 0, blocks: 0, killed: 0, struck: 0, knocked: 0, breach: 0, bossDmg: 0, onSides: 0, onMiddle: 0, fx: 0, forms: 0, spat: 0, burst: 0, traded: 0 },
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
export const dpsOf = (g) => g.squad * (g.level.dps ?? 1) * tierOf(g).power * (g.boost ?? 1);
export const rateOf = (g) => Math.min(g.level.shot.max, g.level.shot.rate + g.squad * g.level.shot.perSoldier);

/* ── the stream ── */

function emit(g, dt) {
  if (!g.hold || g.squad <= 0) { g.emitAcc = 0; return; }
  const base = rateOf(g), form = g.form?.id ?? null;
  const rate = form === 'lian' ? base * (fxOf(g, 'lian').rate ?? 2) : base; // 连珠: twice the shots, each as hard
  g.emitAcc += rate * dt;
  g.stats[colOf(g.aimX) === 'M' ? 'onMiddle' : 'onSides'] += dt;
  while (g.emitAcc >= 1) {
    g.emitAcc -= 1;
    const dmg = dpsOf(g) / base;
    g.shots.push(form ? { x: clamp(g.aimX + (g.rand() - 0.5) * 0.12, -0.99, 0.99), z: 0.5, dmg, form } : { x: clamp(g.aimX + (g.rand() - 0.5) * 0.12, -0.99, 0.99), z: 0.5, dmg });
    g.stats.thrown += 1;
    if (form !== 'fen') continue;
    // 分兵: a shot up each other column too, at `side` of the attack
    const here = colOf(g.aimX), side = dmg * (fxOf(g, 'fen').side ?? 0.5);
    for (const c of ['L', 'M', 'R']) if (c !== here) g.shots.push({ x: clamp(colMid(c) + (g.rand() - 0.5) * 0.12, -0.99, 0.99), z: 0.5, dmg: side, form });
  }
}

/** The first thing a 豆兵 at x meets between z0 and z1 (its step), as the belt and the waves come down to meet it. */
function hitOf(g, x, z0, z1, dz, past = null, belt = g.belt) {
  const col = colOf(x);
  let best = null, bz = Infinity;
  for (const it of belt) {
    if (it.gone || it.col !== col || it.z > z1 + dz + 1 || it.z < z0 - 2 || (it.fx && it.n >= it.cap)) continue; // a power charged full: shots fly past it
    if (it.z < bz && it.z <= z1 + 0.5) { best = it; bz = it.z; }
  }
  for (const w of g.live) {
    if (x < w.span[0] - 0.02 || x > w.span[1] + 0.02 || past?.has(w)) continue;
    if (w.front <= z1 + 0.5 && z1 <= w.front + w.depth + 3 && w.front < bz) { best = w; bz = w.front; }
  }
  for (const bs of g.bosses) if (bs.on && bs.hp > 0 && Math.abs(x - bs.x) < bs.half && bs.z <= z1 + 1 && bs.z < bz && !past?.has(bs)) { best = bs; bz = bs.z; }
  return best;
}

function moveShots(g, dt) {
  const sp = g.level.shot.speed, dz = (g.level.belt.speed ?? 0) * dt;
  // the belt's things a shot can meet this step (a shot is gone past TOP + 6): the rest are far up the road
  const reach = TOP + 8 + sp * dt + dz;
  const belt = g.shots.length ? g.belt.filter((it) => !it.gone && it.z <= reach) : null;
  for (let i = g.shots.length - 1; i >= 0; i -= 1) {
    const s = g.shots[i], z0 = s.z;
    s.z += sp * dt;
    const hit = hitOf(g, s.x, z0, s.z, dz, s.past, belt);
    if (hit) {
      strike(g, s, hit);
      // 穿云: through a group of beasts (or the 大妖) and on up the road; a card or a wall still stops it
      if (s.form === 'chuan' && (hit.units || hit.isBoss)) { (s.past ??= new Set()).add(hit); continue; }
      g.shots.splice(i, 1);
      continue;
    }
    if (s.z > TOP + 6) g.shots.splice(i, 1);
  }
}

function strike(g, s, hit) {
  if (hit.isBoss) {
    const d = s.form === 'huo' || s.form === 'chuan' ? s.dmg * (fxOf(g, s.form).boss ?? 1) : s.dmg;
    hit.hp = Math.max(0, hit.hp - d);
    g.stats.bossDmg += d;
    g.events.push({ t: 'bosshit', boss: hit.i, x: s.x, z: hit.z, d, hp: hit.hp });
    return;
  }
  if (hit.units) return strikeWave(g, s, hit);
  if (hit.kind === 'card') {           // a hit pumps the card's number up a step; at its cap it pops and pays
    hit.n = Math.min(hit.cap, hit.n + hit.step);
    g.events.push({ t: 'card_hit', id: hit.id, x: s.x, z: hit.z, n: hit.n, ...(hit.fx && hit.n >= hit.cap ? { full: true } : {}) });
    if (hit.n >= hit.cap && !hit.fx) pay(g, hit, 'cap'); // a power never pops: charged, it waits to be taken at the line
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

/** A card pays its number to the squad (a red one takes; the squad never falls under one, nor grows past the level's
    `cap`); a card with a power fires it instead. */
function pay(g, it, how) {
  it.gone = true;
  if (it.fx) return power(g, it, how);
  const n = Math.floor(it.n);
  const from = g.squad;
  g.squad = clamp(g.squad + n, 1, Math.max(from, capOf(g)));
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
  const f = s.form;
  let killed;
  if (!f) killed = hurtGroup(g, w, s.dmg, 'shot');
  else if (f === 'chuan') killed = hurtGroup(g, w, s.dmg * (fxOf(g, 'chuan').mul ?? 1.5), 'open'); // a line of beasts
  else if (f === 'huo') {  // it bursts: the group it hit takes more, and any group beside it some
    const fx = fxOf(g, 'huo');
    killed = hurtGroup(g, w, s.dmg * (1 + (fx.splash ?? 0.6)), 'open');
    for (const o of g.live) {
      if (o === w || o.hp <= 0 || Math.abs(o.front - w.front) > (fx.reach ?? 10) || o.span[0] > w.span[1] + 0.4 || o.span[1] < w.span[0] - 0.4) continue;
      killed += hurtGroup(g, o, s.dmg * (fx.near ?? 0.4), 'open');
    }
  } else killed = hurtGroup(g, w, s.dmg, 'shot');
  g.stats.struck += s.dmg;
  g.events.push({ t: 'strike', wave: w.i, g: w.id, x: s.x, z: w.front, killed, left: waveCount(w), ...(f ? { form: f } : {}) });
}

/** The kind in a group's front rank (the first to fall). */
export function frontOf(w) {
  let hp = w.hp, front = null;
  for (const u of w.units) { // as waveLeft: the hp fills the back ranks first
    const n = Math.max(0, Math.min(u.n, Math.ceil(Math.max(0, hp) / u.p - 1e-9)));
    hp -= n * u.p;
    if (n > 0) front = u.b;
  }
  return front;
}

/** Harm to a group of beasts: `how` 'shot' (a plain 豆兵: an armoured front rank takes its `armor` share) or 'open'
    (火弹 · 穿云 · 雷符 · 结印); the ones that die near the wall may burst (`burst`). → how many fell. */
function hurtGroup(g, w, d, how = 'shot') {
  if (w.hp <= 0) return 0;
  const before = w.burst ? waveLeft(w) : null, n0 = waveCount(w);
  if (w.armor && how === 'shot') { const a = g.beasts[frontOf(w)]?.armor; if (a) d *= a; }
  w.hp -= d;
  const killed = n0 - waveCount(w);
  g.stats.killed += killed;
  if (before && killed) burstOf(g, w, before);
  return killed;
}

/** 蠪侄: the ones that fell within `z` of the wall burst, each taking `kill` 豆兵 with it. */
function burstOf(g, w, before) {
  const after = waveLeft(w);
  before.forEach((u, i) => {
    const b = g.beasts[u.b]?.burst, died = u.n - after[i].n;
    if (!b || died <= 0 || w.front > b.z) return;
    const lost = Math.max(0, Math.min(g.squad - 1, Math.ceil(died * b.kill)));
    g.squad -= lost;
    g.stats.burst += lost;
    g.events.push({ t: 'burst', g: w.id, b: u.b, n: died, lost, x: waveU(w), z: w.front });
  });
}

/* ── the powers (a card's `fx`) ── */

/** The `n` front beasts of a group struck down (雷符): their hp, through any armour. */
function killFront(g, w, n) {
  let d = 0, left = n;
  for (const u of [...waveLeft(w)].reverse()) {
    if (left <= 0) break;
    const k = Math.min(u.n, left);
    d += k * w.units.find((x) => x.b === u.b).p;
    left -= k;
  }
  return d > 0 ? hurtGroup(g, w, d, 'open') : 0;
}

const POWER = {
  /** 冰符: every beast on the road at `slow` of its pace for `n` s. */
  bing(g, it) {
    g.slowT = Math.max(g.slowT, it.n);
    g.events.push({ t: 'bing', sec: it.n, col: it.col, z: it.z });
  },
  /** 雷符: lightning on the front `n` ranks of every group on the road (and a bite of each 大妖 out). */
  lei(g, it, fx) {
    const rows = Math.max(1, Math.floor(it.n)), hits = [];
    for (const w of [...g.live]) {
      if (w.hp <= 0 || w.front >= TOP) continue;
      const killed = killFront(g, w, rows * perRank(w.span, g.level));
      hits.push({ x: waveU(w), z: w.front, killed });
    }
    for (const bs of bossesUp(g)) {
      if (bs.z >= TOP) continue;
      const d = Math.min(bs.hp, bs.hpMax * (fx.boss ?? 0.04) * rows);
      bs.hp -= d;
      g.stats.bossDmg += d;
      hits.push({ x: bs.x, z: bs.z, boss: bs.i, d });
    }
    g.events.push({ t: 'lei', rows, hits, col: it.col, z: it.z });
  },
  /** 换命: `n`% of the squad given up (n is negative: shooting it brings the cost down) for a tier; at the top, `boost`. */
  huan(g, it, fx) {
    const cost = clamp(-it.n / 100, 0, 0.9);
    const lost = Math.max(0, Math.min(g.squad - 1, Math.round(g.squad * cost)));
    g.squad -= lost;
    g.stats.traded += lost;
    const up = g.tier < g.level.tiers.length - 1;
    if (up) g.tier += 1; else g.boost = Math.min(fx.max ?? 1.69, g.boost * (fx.boost ?? 1.3));
    g.events.push({ t: 'huan', lost, cost: Math.round(cost * 100), up, tier: g.tier, boost: g.boost, col: it.col, z: it.z });
  },
};

/** A card's power fires (taken at the line): a form for `n` s, replacing the one on; else at once. */
function power(g, it, how) {
  g.stats.cards += 1;
  g.stats.fx += 1;
  if (FORMS.includes(it.fx)) {
    const was = g.form?.id ?? null;
    g.form = { id: it.fx, t: it.n, of: it.n };
    g.stats.forms += 1;
    g.events.push({ t: 'form', form: it.fx, sec: it.n, was, how, id: it.id, col: it.col, z: it.z });
    return;
  }
  POWER[it.fx]?.(g, it, fxOf(g, it.fx));
  g.events.push({ t: 'card', id: it.id, n: 0, fx: it.fx, how, col: it.col, z: it.z, squad: g.squad });
}

function formStep(g, dt) {
  g.slowT = Math.max(0, g.slowT - dt);
  if (!g.form) return;
  g.form.t -= dt;
  if (g.form.t > 0) return;
  g.events.push({ t: 'form_end', form: g.form.id });
  g.form = null;
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

/** A beast's role (on a level with `roles`): drift · spit, or none (armor and burst act on any group). */
const roleOfKind = (g, b) => (g.beasts[b]?.drift ? 'drift' : g.beasts[b]?.spit ? 'spit' : null);
/** A wave's beasts by the groups they walk in: the drifting and the spitting ones apart (`roles` levels), else one. */
function groupsOf(g, units) {
  if (!g.level.roles) return [{ role: null, units }];
  const by = new Map();
  for (const u of units) { const r = roleOfKind(g, u.b); if (!by.has(r)) by.set(r, []); by.get(r).push(u); }
  return [...by].map(([role, us]) => ({ role, units: us }));
}

function startWaves(g) {
  for (const w of g.waves) {
    if (w.on || g.t < w.t) continue;
    w.on = true;
    const units = w.beasts.map(([b, n]) => ({ b, n: Math.max(1, Math.round(n * g.k)), p: g.beasts[b].power }));
    let n0 = 0;
    for (const grp of groupsOf(g, units)) {
      const span = [...(w.span ?? COLS.M)];
      const live = { id: g.parts++, i: w.i, span, units: grp.units, hp: grp.units.reduce((s, u) => s + u.n * u.p, 0), front: TOP + 2, speed: w.speed, role: grp.role };
      live.n0 = grp.units.reduce((s, u) => s + u.n, 0);
      live.depth = waveDepth(live, g.level);
      if (g.level.roles) { live.armor = grp.units.some((u) => g.beasts[u.b].armor); live.burst = grp.units.some((u) => g.beasts[u.b].burst); }
      if (grp.role) ROLE_IN[grp.role](g, live, g.beasts[grp.units[0].b][grp.role]);
      g.live.push(live);
      n0 += live.n0;
    }
    g.events.push({ t: 'wave', i: w.i, beasts: n0, ...(w.crowd != null ? { crowd: w.crowd } : {}) });
  }
}

const ROLE_IN = {
  drift(g, w, d) { w.cx = (w.span[0] + w.span[1]) / 2; w.half = (w.span[1] - w.span[0]) / 2; w.to = w.cx; w.driftT = d.first ?? d.every; },
  spit(g, w, d) { w.stand = d.stand; w.held = 0; w.spitT = d.every * 0.6; },
};

/** 鬿雀's flock: every `every` s (give or take) it makes for another column, `speed` across a second. */
function driftStep(g, w, dt) {
  const d = g.beasts[w.units[0].b].drift;
  w.driftT -= dt;
  if (w.driftT <= 0 && w.front > 6) {
    w.driftT = d.every * (0.7 + g.rand() * 0.6);
    const here = colOf(w.to), other = ['L', 'M', 'R'].filter((c) => c !== here);
    w.to = colMid(other[Math.floor(g.rand() * other.length)]);
    g.events.push({ t: 'drift', g: w.id, col: colOf(w.to) });
  }
  w.cx += clamp(w.to - w.cx, -d.speed * dt, d.speed * dt);
  w.span = [w.cx - w.half, w.cx + w.half];
}

/** 犰狳: they walk to `stand` and spit for `hold` s, each `every` s knocking `share` of the squad off; then come on.
    → true while it stands (or walks to its place). */
function spitStep(g, w, dt) {
  const sp = g.beasts[w.units[0].b].spit;
  if (w.held >= (sp.hold ?? 14)) return false;
  if (w.front > w.stand) { w.front = Math.max(w.stand, w.front - w.speed * slowK(g) * dt); return true; }
  w.held += dt;
  w.spitT -= dt;
  if (w.spitT <= 0) {
    w.spitT += sp.every;
    const lost = Math.max(0, Math.min(g.squad - 1, Math.max(1, Math.round(g.squad * sp.share))));
    g.squad -= lost;
    g.stats.spat += lost;
    g.events.push({ t: 'spit', g: w.id, n: lost, x: waveU(w), z: w.front });
  }
  return true;
}

function marchWaves(g, dt) {
  const k = slowK(g);
  for (const w of g.live) {
    if (w.role === 'spit' && spitStep(g, w, dt)) continue;
    if (w.role === 'drift') driftStep(g, w, dt * k);
    w.front = Math.max(0, w.front - w.speed * k * dt);
    if (w.front <= 0 && w.hp > 0) breach(g, w, dt);
  }
  for (const w of [...g.live]) {
    if (w.hp > 0) continue;
    g.live.splice(g.live.indexOf(w), 1);
    if (g.waves[w.i] && !g.live.some((o) => o.i === w.i)) g.waves[w.i].done = true; // its last group down
    g.events.push({ t: 'cleared', i: w.i, g: w.id });
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
    bs.z -= bs.speed * 4 * slowK(g) * dt;
    if (bs.z <= bs.stand) { bs.z = bs.stand; bs.mode = 'walk'; }
  },
  walk(g, bs, c, dt) {
    bs.z = Math.max(0, bs.z - bs.speed * slowK(g) * dt);
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
  // 师父传印: the seal's mastery (`jieyin.mastery[move id]` = 1 + power, from the 印谱; none → 1) lends the spell its strength.
  const K = c.mastery?.[m.id] > 0 ? c.mastery[m.id] : 1;
  const raw = (dpsOf(g) * m.secs * (boss ? c.bossMul ?? 1 : 1) + (m.flat ?? 0)) * K;
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
  else hurtGroup(g, hit, dmg, 'open');
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
  formStep(g, dt);
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
  const room = Math.max(0, capOf(g) - g.squad); // a + card past the cap pays nothing
  if (first.kind === 'block') {
    const behind = g.belt.find((it) => !it.gone && it.col === col && it.z > first.z && it.kind === 'card');
    const worth = first.gives === 'tier' ? g.squad * 0.5 : behind ? (behind.fx ? fxWorth(g, behind, behind.cap) : Math.min(room, behind.cap)) : 0;
    return worth / (first.hp / dps + 0.5);
  }
  const time = first.z / (g.level.belt.speed + g.level.shot.speed * 0.3);
  const up = Math.min(first.cap - first.n, rate * first.step * time);
  if (first.fx) return fxWorth(g, first, first.n + up) / Math.max(0.5, time);
  return Math.max(0, Math.min(room, first.n + up)) / Math.max(0.5, time);
}

// What a power is worth, in 豆兵 (the bots' one currency): a form its extra attack over its seconds, spread over the next
// HORIZON s (an armoured front makes 火弹 · 穿云 worth more; one on is worth what is left of it); 冰符 half the squad for its
// seconds; 雷符 the beasts it would strike; 换命 the squad after the trade, tiered up, less the squad now.
const HORIZON = 12;
const FORM_MUL = { huo: 1.6, lian: 2, fen: 1.4, chuan: 1.5 };
const armoured = (g) => g.live.some((w) => w.armor && w.front < TOP && g.beasts[frontOf(w)]?.armor);
/** The attack's multiplier on the beasts while a form is on (1: none). */
export function formMul(g, form = g.form?.id) {
  if (!form) return 1;
  return FORM_MUL[form] + ((form === 'huo' || form === 'chuan') && armoured(g) ? 1 : 0);
}
export function fxWorth(g, it, n = it.n) {
  n = Math.min(it.cap, n);
  const sq = g.squad, onRoad = g.live.some((w) => w.front < TOP) || bossesUp(g).length > 0;
  if (FORMS.includes(it.fx)) {
    const now = g.form ? (formMul(g) - 1) * g.form.t : 0;
    return Math.max(0, sq * ((formMul(g, it.fx) - 1) * n - now) / HORIZON) * (onRoad ? 1 : 0.5);
  }
  if (it.fx === 'bing') return g.live.length ? (sq * 0.5 * n) / HORIZON : 0;
  if (it.fx === 'lei') {
    const rows = Math.floor(n), per = (g.level.dps ?? 1) * tierOf(g).power * (g.boost ?? 1);
    const hp = g.live.filter((w) => w.front < TOP).reduce((s, w) => s + Math.min(w.hp, rows * perRank(w.span, g.level) * w.units.at(-1).p), 0);
    return hp / Math.max(1e-6, per * HORIZON);
  }
  if (it.fx === 'huan') {
    const cost = clamp(-n / 100, 0, 0.9), tiers = g.level.tiers;
    const up = g.tier < tiers.length - 1 ? tiers[g.tier + 1].power / tierOf(g).power : Math.min(fxOf(g, 'huan').boost ?? 1.3, (fxOf(g, 'huan').max ?? 1.69) / (g.boost ?? 1));
    return Math.max(0, sq * (1 - cost) * up - sq);
  }
  return 0;
}

/** A card about to reach the line in another column, worth standing under: a pumped + card (the squad under its cap),
    a power worth having. Its column, or null. */
function cardAt(g, near = 5) {
  const c = g.belt.find((it) => !it.gone && it.kind === 'card' && it.z <= near && (it.fx ? fxWorth(g, it) > 0 : Math.floor(it.n) >= 2 && g.squad < capOf(g)));
  return c ? c.col : null;
}

/** The seconds before a group must be dealt with: its walk to the wall — to `stand` for 犰狳 (0 once spitting), to the
    burst line for 蠪侄. */
export function etaOf(g, w) {
  if (w.role === 'spit' && w.held < (g.beasts[w.units[0].b].spit.hold ?? 14)) return w.front <= w.stand + 0.5 ? 0 : (w.front - w.stand) / w.speed;
  if (w.burst) {
    const b = waveLeft(w).find((u) => u.n > 0 && g.beasts[u.b]?.burst);
    if (b) return Math.max(0, w.front - g.beasts[b.b].burst.z) / w.speed;
  }
  return w.front / w.speed;
}

/** The column to shoot: the one the most pressing group is in (the middle where nothing presses). */
export function fireCol(g) {
  let best = null, eta = Infinity;
  for (const w of g.live) { if (w.hp <= 0 || w.front >= TOP + 2) continue; const e = etaOf(g, w); if (e < eta) { eta = e; best = w; } }
  return best ? colOf(waveU(best)) : 'M';
}

/** Whether to turn on the tide now: when another second of buffing no longer brings the kill sooner (the squad's
    attack grows by what the best side pays), or the nearest wave is `close` s from the wall. `bias` > 1 turns late. */
export function shouldShoot(g, { bias = 1, close = 2.5 } = {}) {
  if (!g.live.length) return false;
  const hp = g.live.reduce((s, w) => s + w.hp, 0);
  const near = Math.min(...g.live.map((w) => etaOf(g, w)));
  if (near < close) return true;
  const dps = Math.max(1e-6, dpsOf(g) * formMul(g));
  const gain = Math.max(sideValue(g, 'L'), sideValue(g, 'R')) * (g.level.dps ?? 1) * tierOf(g).power * (g.boost ?? 1) * bias;
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
        want = take && r() > wrong ? colMid(take) : shouldShoot(g, { bias, close: 2.5 * bias }) ? colMid(fireCol(g)) : colMid(side);
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
  return { won: Boolean(ended?.won), stars: ended?.stars ?? 0, wall: g.wall.hp, sec: g.t, peak: g.peak, squad: g.squad, tier: g.tier, casts: g.casts, maxShots, maxHorde, bossHp: g.boss?.hp ?? null, stats: g.stats, phase: g.phase, boost: g.boost };
}
