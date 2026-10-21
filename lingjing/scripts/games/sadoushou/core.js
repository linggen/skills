// core.js — 撒豆成兵 · 守山门's engine: the DEFENCE crowd game, a second 撒豆成兵 beside the attack run (games/sadou)
// (Hanli 10-21: 「好像比我们的撒豆成兵好玩一点」, 「好, 做一版. 这个是在防守, 现在的撒豆成兵是在进攻.」).
// Pure and headless: no Phaser, no DOM. The scene (tools/sadoushou/src) draws what this holds; tests and bots run it as is.
//
//   newGame(kit, level, { seed }) → g      aim(g, x, hold)      step(g, dt)      sim(kit, level, bot) → result
//
// Space: the road runs from the wall (z = 0, 小满 behind it) up to the far end (z = TOP); lateral u is −1 (left
// edge) … 1 (right). 小满 holds to scatter beans at his aim; each bean is a 豆兵 that runs UP the road. Crossing a
// gate's row inside its span changes it (+n: n more beside it, ×n: n − 1 more, ÷n / −n: a trap that kills it, by
// turn), so a lane walled with gates multiplies the stream. A 兽潮 wave marches DOWN on its span; a 豆兵 that
// reaches its front strikes one blow (its weight) and is spent: both counts grind down. Near a foe a 豆兵 turns
// toward it (`seek`), so a stream up a safe side lane still meets the horde in the middle. After the waves the
// 大妖 steps out, walks down, and CHARGES: a line on the road `warn` s ahead, then it rushes down that line and
// knocks aside the 豆兵 in its path. A wave or the 大妖 at the wall hurts the wall; the wall at 0 is the loss.
//
// The soldiers are entities in typed arrays (bounded by `cap`): past the cap a new soldier joins one already
// running as its `weight`, so the count stays true and the work per step stays bounded. Events go out on
// g.events: wave · gate · strike · kill · breach · boss · charge_warn · charge · bosshit · low · end.

export const TOP = 100;                  // the road's far end (z)
export const LANES = [[-1, -0.34], [-0.34, 0.34], [0.34, 1]]; // left · middle · right, for the bots and the hints

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

/** A gate's face right now: a 符门 (`alt` + `flip` s) swaps faces on the clock. */
export function faceOf(cell, t) {
  if (!cell.alt || !cell.flip) return cell;
  return Math.floor(t / cell.flip) % 2 ? { ...cell.alt, x: cell.x } : cell;
}
export const isGood = (f) => f.op === '+' || f.op === 'x';
export const opLabel = ({ op, n }) => `${{ '+': '+', '-': '−', x: '×', '/': '÷' }[op]}${n}`;

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
/** How deep a wave's block is (z): its ranks across its span, `rank` apart. */
export const waveDepth = (w, level) => Math.ceil(w.n0 / perRank(w.span, level)) * (level.rank ?? 2.2);
export const perRank = (span, level) => Math.max(4, Math.round((span[1] - span[0]) * (level.perRank ?? 9)));

export function newGame(kit, level, { seed = 'sadoushou' } = {}) {
  const cap = level.cap ?? 700;
  const k = level.difficulty ?? 1;
  return {
    kit, level, seed, rand: seeded(`core|${seed}`),
    t: 0, phase: 'waves',                         // waves · boss · won · lost
    aimX: 0, hold: false, emitAcc: 0,
    // the soldiers: SoA, `n` live; weight > 1 past the cap; `row` = the next gate row to cross; `ph` drawing phase
    s: { n: 0, cap, x: new Float32Array(cap), z: new Float32Array(cap), w: new Int32Array(cap), row: new Int16Array(cap), id: new Int32Array(cap) },
    nextId: 1,
    count: 0, peak: 0,
    rows: [...level.gates].sort((a, b) => a.z - b.z).map((r, i) => ({ ...r, i, cells: r.cells.map((c, k) => ({ ...c, k, coolT: 0, turn: 0 })) })),
    waves: level.waves.map((w, i) => ({ ...w, i, on: false, done: false })),
    live: [],                                      // the waves on the road
    wall: { hp: level.wall, max: level.wall },
    boss: null,
    low: false,
    events: [],
    stats: { beans: 0, made: 0, trapped: 0, killed: 0, struck: 0, charged: 0, breach: 0, bossDmg: 0 },
    k,
  };
}

/** The player's input this step: where the stream goes (−1…1) and whether he holds. */
export function aim(g, x, hold = true) {
  g.aimX = clamp(x, -0.96, 0.96);
  g.hold = Boolean(hold);
}

/* ── soldiers ── */

function addSoldier(g, x, z, w, row) {
  const s = g.s;
  g.count += w;
  g.peak = Math.max(g.peak, g.count);
  if (s.n >= s.cap) {           // full: the new ones run with one already on the road, as its weight
    const j = Math.floor(g.rand() * s.n);
    s.w[j] += w;
    return;
  }
  const i = s.n++;
  s.x[i] = clamp(x, -0.99, 0.99); s.z[i] = z; s.w[i] = w; s.row[i] = row; s.id[i] = g.nextId++;
}

function removeSoldier(g, i) {
  const s = g.s, j = --s.n;
  g.count -= s.w[i];
  if (i !== j) { s.x[i] = s.x[j]; s.z[i] = s.z[j]; s.w[i] = s.w[j]; s.row[i] = s.row[j]; s.id[i] = s.id[j]; }
}

function emit(g, dt) {
  if (!g.hold) { g.emitAcc = 0; return; }
  g.emitAcc += g.level.beans.rate * dt;
  while (g.emitAcc >= 1) {
    g.emitAcc -= 1;
    addSoldier(g, g.aimX + (g.rand() - 0.5) * 0.08, 0.5, 1, 0);
    g.stats.beans += 1;
  }
}

/** A soldier crossing a gate: what it becomes. */
function crossGate(g, i, row, cell) {
  const f = faceOf(cell, g.t), s = g.s, w = s.w[i];
  if (cell.coolT > 0) return true;          // a big gate spent: it lights again after `cool` s
  let add = 0, dies = false;
  if (f.op === '+') add = f.n * w;
  else if (f.op === 'x') add = (f.n - 1) * w;
  else if (f.op === '-') dies = true; // a trap: every one through it is lost
  else if (f.op === '/') dies = ((cell.turn = (cell.turn ?? 0) + 1) % f.n) !== 0; // ÷n: one in n gets through
  if (cell.cool) cell.coolT = cell.cool;
  g.events.push({ t: 'gate', row: row.i, cell: cell.k, op: f.op, n: f.n, x: s.x[i], z: row.z, add, dies });
  if (dies) { g.stats.trapped += w; return false; }
  if (add) {
    const pieces = Math.min(add, 6);           // a big gate adds in a few runners (their weights carry the rest)
    for (let p = 0; p < pieces; p += 1) {
      const share = Math.floor(add / pieces) + (p < add % pieces ? 1 : 0);
      addSoldier(g, s.x[i] + (g.rand() - 0.5) * Math.min(0.3, (cell.x[1] - cell.x[0]) * 0.9), row.z + 0.6 + g.rand() * 1.4, share, s.row[i]);
    }
    g.stats.made += add;
  }
  return true;
}

/** The foe a soldier at (x, z) turns toward: the nearest wave front above it within `seek`, else the 大妖. */
function seekX(g, x, z) {
  const seek = g.level.seek ?? 30;
  let best = null, bd = Infinity;
  for (const w of g.live) {
    const d = w.front - z;
    if (d < -1 || d > seek) continue;
    const [a, b] = w.span;
    const tx = x < a + 0.05 ? a + 0.05 : x > b - 0.05 ? b - 0.05 : x;
    if (d < bd) { bd = d; best = tx; }
  }
  if (best != null) return best;
  const bs = g.boss;
  if (bs?.on && bs.z - z < seek * 1.6 && bs.mode !== 'rush' && bs.mode !== 'warn') return bs.x; // a charge coming: they run straight
  return null;
}

function moveSoldiers(g, dt) {
  const s = g.s, sp = g.level.beans.speed, turn = g.level.turn ?? 0.9;
  for (let i = s.n - 1; i >= 0; i -= 1) {
    const z0 = s.z[i];
    let z = z0 + sp * dt;
    const tx = seekX(g, s.x[i], z);
    if (tx != null) s.x[i] += clamp(tx - s.x[i], -turn * dt, turn * dt);
    // gate rows crossed this step
    let alive = true;
    while (alive && s.row[i] < g.rows.length && g.rows[s.row[i]].z <= z) {
      const row = g.rows[s.row[i]];
      s.row[i] += 1;
      if (row.z < z0) continue;
      const cell = row.cells.find((c) => s.x[i] >= c.x[0] && s.x[i] <= c.x[1]);
      if (cell) alive = crossGate(g, i, row, cell);
    }
    s.z[i] = z;
    if (!alive) { removeSoldier(g, i); continue; }
    if (strike(g, i)) { removeSoldier(g, i); continue; }
    if (z > TOP + 4) removeSoldier(g, i); // ran off the far end (nothing left to fight up there)
  }
}

/** A soldier at a foe strikes once (its weight) and is spent. */
function strike(g, i) {
  const s = g.s, x = s.x[i], z = s.z[i], w = s.w[i];
  for (const wv of g.live) {
    if (z < wv.front || z > wv.front + wv.depth + 2) continue;
    if (x < wv.span[0] - 0.02 || x > wv.span[1] + 0.02) continue;
    const before = waveCount(wv);
    wv.hp -= w;
    wv.dmgRate += w;
    const after = waveCount(wv);
    g.stats.struck += w;
    if (before > after) g.stats.killed += before - after;
    g.events.push({ t: 'strike', wave: wv.i, x, z: wv.front, w, killed: before - after, left: after });
    return true;
  }
  const bs = g.boss;
  if (bs?.on && bs.hp > 0 && Math.abs(x - bs.x) < bs.half && z >= bs.z - 1.5 && z <= bs.z + 6) {
    const d = w * (bs.dmg ?? 1);
    bs.hp = Math.max(0, bs.hp - d);
    g.stats.bossDmg += d;
    g.events.push({ t: 'bosshit', x, z: bs.z, d, hp: bs.hp });
    return true;
  }
  return false;
}

/* ── the 兽潮 ── */

function startWaves(g) {
  for (const w of g.waves) {
    if (w.on || g.t < w.t) continue;
    w.on = true;
    const units = w.beasts.map(([b, n]) => ({ b, n: Math.max(1, Math.round(n * g.k)), p: g.kit.beasts[b].power }));
    const live = { i: w.i, span: w.span ?? [-1, 1], units, hp: units.reduce((s, u) => s + u.n * u.p, 0), front: TOP + 2, speed: w.speed, dmgRate: 0, held: 0 };
    live.n0 = units.reduce((s, u) => s + u.n, 0);
    live.depth = waveDepth(live, g.level);
    g.live.push(live);
    g.events.push({ t: 'wave', i: w.i, beasts: live.n0, span: live.span });
  }
}

function marchWaves(g, dt) {
  const hold = g.level.hold ?? 40;
  for (const w of g.live) {
    // a wave meeting a stream as strong as `hold` beast-power a second stands; a weaker one only slows it
    w.held += (w.dmgRate - w.held) * Math.min(1, dt * 4);
    w.dmgRate = 0;
    const slow = clamp(w.held / dt / hold, 0, 1);
    w.front = Math.max(0, w.front - w.speed * (1 - slow * 0.85) * dt);
    if (w.front <= 0 && w.hp > 0) breach(g, w, dt);
  }
  for (const w of [...g.live]) {
    if (w.hp > 0) continue;
    g.live.splice(g.live.indexOf(w), 1);
    g.waves[w.i].done = true;
    g.events.push({ t: 'cleared', i: w.i });
  }
}

/** A wave at the wall: its front rank breaks on it, `breach` beasts a second, each its power in wall. */
function breach(g, w, dt) {
  w.acc = (w.acc ?? 0) + (g.level.breach ?? 8) * dt;
  while (w.acc >= 1 && w.hp > 0) {
    w.acc -= 1;
    const left = waveLeft(w), front = [...left].reverse().find((u) => u.n > 0);
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

/* ── the 大妖 ── */

function bossIn(g) {
  const b = g.level.boss;
  const hp = Math.round(b.hp * g.k);
  g.boss = { ...b, on: true, hp, hpMax: hp, x: 0, z: TOP + 6, mode: 'enter', modeT: 0, charges: 0, chargeT: b.charge.every * 0.6, line: null, half: b.half ?? 0.22 };
  g.phase = 'boss';
  g.events.push({ t: 'boss', hp });
}

function bossStep(g, dt) {
  const bs = g.boss, c = bs.charge;
  if (bs.hp <= 0) return end(g, true);
  if (bs.mode === 'enter') {
    bs.z -= (bs.speed * 4) * dt;
    if (bs.z <= bs.stand) { bs.z = bs.stand; bs.mode = 'walk'; }
    return;
  }
  if (bs.mode === 'walk') {
    bs.z = Math.max(0, bs.z - bs.speed * dt);
    bs.x += clamp(0 - bs.x, -0.3 * dt, 0.3 * dt);
    if (bs.z <= 0) { bs.wallAcc = (bs.wallAcc ?? 0) + (bs.crush ?? 10) * dt; const d = Math.floor(bs.wallAcc); if (d) { bs.wallAcc -= d; hurtWall(g, d, 'boss', bs.beast); } return; }
    bs.chargeT -= dt;
    if (bs.chargeT <= c.warn) {
      // it marks the line it will rush down: where the stream runs now
      bs.mode = 'warn';
      bs.charges += 1;
      bs.line = clamp(g.aimX, -0.8, 0.8);
      bs.modeT = c.warn;
      g.events.push({ t: 'charge_warn', x: bs.line, half: c.half, sec: c.warn, from: bs.z });
    }
    return;
  }
  if (bs.mode === 'warn') {
    bs.modeT -= dt;
    bs.x += clamp(bs.line - bs.x, -1.2 * dt, 1.2 * dt); // it steps over to the head of its line
    if (bs.modeT <= 0) { bs.mode = 'rush'; bs.from = bs.z; bs.x = bs.line; g.events.push({ t: 'charge', x: bs.line, from: bs.z }); }
    return;
  }
  if (bs.mode === 'rush') {
    const z1 = Math.max(c.to ?? 6, bs.z - c.speed * dt);
    knockAside(g, bs.line, c.half, z1, bs.z + 3);
    bs.z = z1;
    if (bs.z <= (c.to ?? 6)) { bs.mode = 'back'; g.events.push({ t: 'charge_end', x: bs.line }); }
    return;
  }
  if (bs.mode === 'back') {
    bs.z = Math.min(bs.from, bs.z + c.speed * 0.35 * dt);
    if (bs.z >= bs.from) { bs.mode = 'walk'; bs.chargeT = c.every; }
  }
}

/** The 大妖's rush: the 豆兵 on its line between z0 and z1 are knocked aside (`kill` of them lost). */
function knockAside(g, x, half, z0, z1) {
  const s = g.s, kill = g.boss.charge.kill ?? 0.8;
  let lost = 0;
  for (let i = s.n - 1; i >= 0; i -= 1) {
    if (s.z[i] < z0 || s.z[i] > z1 || Math.abs(s.x[i] - x) > half) continue;
    const k = Math.round(s.w[i] * kill) || (g.rand() < kill ? s.w[i] : 0);
    if (!k) { s.x[i] += Math.sign(s.x[i] - x || 1) * half; continue; }
    g.events.push({ t: 'knock', x: s.x[i], z: s.z[i], w: k });
    lost += k;
    if (k >= s.w[i]) removeSoldier(g, i); else { s.w[i] -= k; g.count -= k; }
  }
  g.stats.charged += lost;
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

const coolGates = (g, dt) => { for (const r of g.rows) for (const c of r.cells) if (c.coolT > 0) c.coolT = Math.max(0, c.coolT - dt); };

export function step(g, dt) {
  if (g.phase === 'won' || g.phase === 'lost') return g;
  g.t += dt;
  coolGates(g, dt);
  emit(g, dt);
  startWaves(g);
  moveSoldiers(g, dt);
  marchWaves(g, dt);
  if (g.phase === 'waves' && g.waves.every((w) => w.done)) bossIn(g);
  if (g.phase === 'boss') bossStep(g, dt);
  return g;
}

/** Beasts on the road now. */
export const hordeNow = (g) => g.live.reduce((s, w) => s + waveCount(w), 0);
/** …and still to come (the big red number counts these too: the whole 兽潮 from the start). */
export const hordeAll = (g) => hordeNow(g) + g.waves.filter((w) => !w.on).reduce((s, w) => s + w.beasts.reduce((a, [, n]) => a + Math.max(1, Math.round(n * g.k)), 0), 0);

// ---------------------------------------------------------------- bots (the levels' balance tests play these)

/** What a stream at x gains on its way up, as it stands now: the product of the gates it would cross below the
    first foe on its line (a spent big gate counts for its share over its cool). */
export function laneValue(g, x) {
  const foe = g.live.filter((w) => x >= w.span[0] - 0.02 && x <= w.span[1] + 0.02).reduce((m, w) => Math.min(m, w.front), TOP);
  let v = 1;
  for (const r of g.rows) {
    if (r.z >= foe) break;
    const c = r.cells.find((cc) => x >= cc.x[0] && x <= cc.x[1]);
    if (!c) continue;
    const f = faceOf(c, g.t + r.z / g.level.beans.speed);
    let m = f.op === '+' ? 1 + f.n : f.op === 'x' ? f.n : f.op === '/' ? 1 / f.n : 0;
    if (c.cool && f.op === '+') m = 1 + Math.min(f.n, f.n / (c.cool * g.level.beans.rate * v));
    v *= m;
  }
  return v;
}

/** The aims a bot weighs: the middle of every gate cell, and each lane's middle. */
function aims(g) {
  const xs = new Set(LANES.map(([a, b]) => (a + b) / 2));
  for (const r of g.rows) for (const c of r.cells) xs.add(Math.round(((c.x[0] + c.x[1]) / 2) * 100) / 100);
  return [...xs];
}

const inCharge = (g, x, margin = 0.08) => {
  const bs = g.boss;
  return bs && (bs.mode === 'warn' || bs.mode === 'rush') && Math.abs(x - bs.line) < bs.charge.half + margin;
};

export const BOTS = {
  /** Aims where the stream multiplies most, and steps out of the 大妖's line. */
  good(g) {
    const xs = aims(g).filter((x) => !inCharge(g, x));
    return xs.sort((a, b) => laneValue(g, b) - laneValue(g, a) || Math.abs(a - g.aimX) - Math.abs(b - g.aimX))[0] ?? g.aimX;
  },
  /** Aims where it multiplies least (into the traps), and stands in the charge. */
  bad(g) {
    if (g.boss?.line != null && (g.boss.mode === 'warn' || g.boss.mode === 'rush')) return g.boss.line;
    return aims(g).sort((a, b) => laneValue(g, a) - laneValue(g, b))[0];
  },
  /** Holds the middle and never moves. */
  idle() { return 0; },
};

/**
 * A first-time human (the lesson from 守墙关 10-20: a level tuned by perfect bots was too hard for Hanli): sees
 * late and acts ~`react` s after, reconsiders the lane only every `look` s, takes a worse lane `wrong` of the
 * time, gets out of the charge's line only `dodge` of the time, and never aims exactly where meant.
 */
export function humanBot(seed, { react = 0.45, look = 2.5, wrong = 0.25, dodge = 0.6, aimErr = 0.06 } = {}) {
  const r = seeded(`human|${seed}`);
  let want = 0, nextLook = 0, seen = 0, at = -1;
  const decided = new Map(); // charge n → whether this player gets out of its line
  return (g) => {
    if (g.t >= nextLook) {
      nextLook = g.t + look * (0.7 + r() * 0.6);
      const xs = aims(g).sort((a, b) => laneValue(g, b) - laneValue(g, a));
      want = (r() < wrong ? xs[1 + Math.floor(r() * Math.max(1, xs.length - 1))] ?? xs[0] : xs[0]) + (r() - 0.5) * 2 * aimErr;
    }
    const bs = g.boss;
    if (bs && bs.mode === 'warn') {
      if (!decided.has(bs.charges)) decided.set(bs.charges, r() < dodge);
      if (decided.get(bs.charges) && Math.abs(want - bs.line) < bs.charge.half + 0.1) want = bs.line > 0 ? bs.line - bs.charge.half - 0.25 : bs.line + bs.charge.half + 0.25;
    }
    if (at < 0 || g.t - at >= react) { seen = want; at = g.t; }
    return seen;
  };
}

/** Plays a whole level with a bot, headless (the bot always holds the stream). */
export function sim(kit, level, bot, { seed = 'sim', dt = 1 / 30, maxSec = 400 } = {}) {
  const g = newGame(kit, level, { seed });
  let ended = null, maxN = 0, maxHorde = 0;
  while (g.t < maxSec && !ended) {
    aim(g, bot(g), true);
    step(g, dt);
    maxN = Math.max(maxN, g.s.n);
    maxHorde = Math.max(maxHorde, hordeNow(g));
    for (const e of g.events) if (e.t === 'end') ended = e;
    g.events.length = 0;
  }
  return { won: Boolean(ended?.won), stars: ended?.stars ?? 0, wall: g.wall.hp, sec: g.t, peak: g.peak, maxN, maxHorde, bossHp: g.boss?.hp ?? null, stats: g.stats, phase: g.phase };
}
