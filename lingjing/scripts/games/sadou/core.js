// core.js — 撒豆成兵's engine: the crowd run (Hanli 10-20: 「对, 做一个撒豆成兵的关卡」; the genre: crowd + math gates).
// Pure and headless: no Phaser, no DOM. The crowd is a NUMBER (count, lateral x), never a list of agents — gates, beans,
// hazards, the clash and the boss are arithmetic on it; the scene draws as many soldiers as it likes from the count.
// Phaser's play (tools/sadou/src) imports this file as an external, and the tests and bots run it as is.
//
//   newGame(kit, level, { seed }) → g        step(g, dt)        steer(g, x)        sim(kit, level, bot) → result
//
// Space: the 山道 runs up the screen; `g.dist` is how far the crowd has come (px). Lateral `x` is −1 (the road's left
// edge) … 1 (its right). Every track item has `at` (px along the road); the crowd's front meets it when g.dist ≥ at.
// Events go out on g.events (drained by the caller each step): gate · beans · hazard · clash · clash_end · boss · hit ·
// slam_warn · slam · low · end.

export const W = 540, H = 960;
export const ROAD = { cx: 270, half: 190 };   // the road's centre and half-width on screen (px)
export const CROWD_Y = 690;                   // where the crowd runs on screen; the world scrolls under it
export const SPACING = 7.2;                    // px between soldiers in the packed crowd (radius = SPACING·√n)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The crowd's half-width in road units (−1…1). */
export function crowdHalf(n) {
  return Math.min(0.9, (SPACING * Math.sqrt(Math.max(1, Math.min(n, 300))) + 10) / ROAD.half);
}

/** A gate's op on a count: + − × ÷ (÷ floors; a count never goes below 0). */
export function applyOp(n, { op, n: v }) {
  if (op === '+') return n + v;
  if (op === '-') return Math.max(0, n - v);
  if (op === 'x') return n * v;
  if (op === '/') return Math.floor(n / v);
  throw new Error(`unknown gate op ${op}`);
}
export const isGood = (gate) => gate.op === '+' || gate.op === 'x';
export const opLabel = ({ op, n }) => `${{ '+': '+', '-': '−', x: '×', '/': '÷' }[op]}${n}`;

/** How much of the crowd [x−h, x+h] lies over the span [a, b]: 0…1. */
export function overlap(x, h, a, b) {
  const lo = Math.max(x - h, a), hi = Math.min(x + h, b);
  return hi > lo ? (hi - lo) / (2 * h) : 0;
}

/** A hazard's span right now (a swinging log moves side to side on the clock). */
export function hazardSpan(hz, t) {
  const c = (hz.x[0] + hz.x[1]) / 2 + (hz.swing ? hz.swing * Math.sin((2 * Math.PI * t) / (hz.period ?? 3)) : 0);
  const half = (hz.x[1] - hz.x[0]) / 2;
  return [c - half, c + half];
}

/** Where along the road the level ends: the boss. */
export const trackEnd = (level) => level.boss.at;

export function newGame(kit, level, { seed = 'sadou' } = {}) {
  const items = level.track.map((it, i) => ({ ...it, i, done: false, left: it.type === 'horde' ? horde(kit, it) : null }));
  return {
    kit, level, seed,
    t: 0,                         // seconds since the run began (after the lead-in)
    phase: 'run',                 // run · clash · boss · won · lost
    dist: 0, speed: level.speed,
    count: level.start, peak: level.start,
    x: 0, target: 0,
    items,
    clash: null,                  // the horde being fought
    boss: { ...level.boss, hpMax: level.boss.hp, slamT: level.boss.slamEvery, warn: null, feed: 0 },
    acc: 0,                       // fractional losses carried between steps
    low: false,
    events: [],
    stats: { gates: 0, good: 0, bad: 0, beans: 0, lostHazard: 0, lostClash: 0, lostSlam: 0, beasts: 0 },
  };
}

function horde(kit, it) {
  const units = it.beasts.map(([b, n]) => ({ b, n, p: kit.beasts[b].power }));
  return { units, hp: units.reduce((s, u) => s + u.n * u.p, 0) };
}

/** Beasts still standing in a horde, by kind (the scene shows these). */
export function hordeLeft(h) {
  let hp = h.hp;
  const out = [];
  // the last kind listed falls first (the front rank); the first kind is the back line
  for (const u of h.units) {
    const n = Math.max(0, Math.min(u.n, Math.ceil(Math.max(0, hp) / u.p - 1e-9)));
    out.push({ b: u.b, n });
    hp -= n * u.p;
  }
  return out;
}

export const hordeCount = (h) => hordeLeft(h).reduce((s, u) => s + u.n, 0);

export function steer(g, x) {
  g.target = clamp(x, -1, 1);
}

function lose(g, n, why) {
  // fractional deaths carry over, so a slow drain still costs whole soldiers
  g.acc += n;
  const k = Math.min(g.count, Math.floor(g.acc));
  g.acc -= k;
  if (k > 0) {
    g.count -= k;
    g.stats[why] += k;
  }
  return k;
}

function end(g, won) {
  g.phase = won ? 'won' : 'lost';
  g.events.push({ t: 'end', won, stars: won ? stars(g.level, g.count) : 0, left: g.count });
}

/** Stars by soldiers left at the end: [★★★ at least, ★★ at least]; any win is ★. */
export function stars(level, left) {
  const [three, two] = level.stars;
  return left >= three ? 3 : left >= two ? 2 : 1;
}

function checkLow(g) {
  const low = g.count > 0 && g.count <= (g.level.low ?? 8);
  if (low && !g.low) g.events.push({ t: 'low', count: g.count });
  g.low = low;
  if (g.count <= 0) end(g, false);
}

function moveX(g, dt) {
  const h = crowdHalf(g.count);
  const lim = 1 - h * 0.8;
  const tgt = clamp(g.target, -lim, lim);
  const d = tgt - g.x, v = g.level.steer ?? 3.2;
  g.x += Math.sign(d) * Math.min(Math.abs(d), v * dt);
  g.x = clamp(g.x, -lim, lim);
}

function runItems(g, dt) {
  const h = crowdHalf(g.count);
  for (const it of g.items) {
    if (it.done || g.dist < it.at) continue;
    if (it.type === 'gates') {
      it.done = true;
      const side = g.x < 0 ? 0 : 1;
      const gate = it.gates[side];
      if (!gate) { g.events.push({ t: 'gate_miss', i: it.i, side }); continue; }
      const from = g.count;
      g.count = applyOp(g.count, gate);
      g.peak = Math.max(g.peak, g.count);
      g.stats.gates += 1;
      g.stats[isGood(gate) ? 'good' : 'bad'] += 1;
      g.events.push({ t: 'gate', i: it.i, side, gate, from, to: g.count, good: isGood(gate) });
      checkLow(g);
    } else if (it.type === 'beans') {
      it.done = true;
      const f = overlap(g.x, h, it.x - 0.18, it.x + 0.18) > 0 ? 1 : 0;
      if (f) {
        g.count += it.n;
        g.peak = Math.max(g.peak, g.count);
        g.stats.beans += it.n;
      }
      g.events.push({ t: 'beans', i: it.i, got: Boolean(f), n: it.n });
    } else if (it.type === 'hazard') {
      // the crowd crosses the hazard over `len` px; each step kills the share of the crowd over it
      if (g.dist >= it.at + (it.len ?? 60)) { it.done = true; g.events.push({ t: 'hazard_end', i: it.i }); continue; }
      const [a, b] = hazardSpan(it, g.t);
      const f = overlap(g.x, h, a, b);
      if (f > 0) {
        const k = lose(g, g.count * f * it.kill * ((g.speed * dt) / (it.len ?? 60)), 'lostHazard');
        if (k) g.events.push({ t: 'hazard', i: it.i, killed: k, kind: it.kind });
        checkLow(g);
      }
    } else if (it.type === 'horde') {
      const [a, b] = it.span ?? [-1, 1];
      if (overlap(g.x, h, a, b) <= 0) { it.done = true; g.events.push({ t: 'horde_miss', i: it.i }); continue; }
      it.done = true;
      g.phase = 'clash';
      g.clash = it;
      g.events.push({ t: 'clash', i: it.i, beasts: hordeCount(it.left), count: g.count });
    }
    if (g.phase !== 'run') return;
  }
}

function fight(g, dt) {
  const hd = g.clash.left;
  // both sides fall at once: fast at first, ~1 s for an even fight, never slower than `clashMin` a second
  const rate = Math.max(g.level.clashMin ?? 24, Math.min(g.count, hd.hp) * 1.1);
  const take = Math.min(rate * dt, hd.hp);
  const before = hordeCount(hd);
  hd.hp -= take;
  const killed = before - hordeCount(hd);
  g.stats.beasts += killed;
  const lost = lose(g, take, 'lostClash');
  g.events.push({ t: 'clash_tick', i: g.clash.i, lost, killed, beasts: hordeCount(hd) });
  checkLow(g);
  if (g.phase === 'lost') return;
  if (hd.hp <= 1e-6) {
    g.events.push({ t: 'clash_end', i: g.clash.i, count: g.count });
    g.clash = null;
    g.phase = 'run';
  }
}

function bossFight(g, dt) {
  const bs = g.boss;
  // soldiers charge the boss in a stream; each one that reaches it strikes once and is spent
  bs.feed += Math.max(bs.feedMin ?? 10, g.count * (bs.feedRate ?? 0.7)) * dt;
  const n = Math.min(g.count, Math.floor(bs.feed), Math.ceil(bs.hp / bs.dmg));
  if (n > 0) {
    bs.feed -= n;
    g.count -= n;
    bs.hp = Math.max(0, bs.hp - n * bs.dmg);
    g.events.push({ t: 'hit', n, dmg: n * bs.dmg, hp: bs.hp });
  }
  if (bs.hp <= 0) return end(g, true);
  // the slam: warned `warnSec` ahead on the half the crowd stands in; step out of it
  bs.slamT -= dt;
  if (!bs.warn && bs.slamT <= bs.warnSec) {
    bs.warn = { side: g.x < 0 ? 0 : 1 };
    g.events.push({ t: 'slam_warn', side: bs.warn.side, sec: bs.warnSec });
  }
  if (bs.slamT <= 0) {
    const [a, b] = bs.warn.side === 0 ? [-1, 0] : [0, 1];
    const f = overlap(g.x, crowdHalf(g.count), a, b);
    const k = lose(g, g.count * f * bs.slamKill, 'lostSlam');
    g.events.push({ t: 'slam', side: bs.warn.side, killed: k });
    bs.warn = null;
    bs.slamT = bs.slamEvery;
  }
  checkLow(g);
}

export function step(g, dt) {
  if (g.phase === 'won' || g.phase === 'lost') return g;
  g.t += dt;
  moveX(g, dt);
  if (g.phase === 'run') {
    g.dist += g.speed * dt;
    if (g.dist >= g.boss.at) {
      g.dist = g.boss.at;
      g.phase = 'boss';
      g.events.push({ t: 'boss', hp: g.boss.hp, count: g.count });
    } else runItems(g, dt);
  } else if (g.phase === 'clash') fight(g, dt);
  else if (g.phase === 'boss') bossFight(g, dt);
  return g;
}

// ---------------------------------------------------------------- bots (the level's balance tests play these)

const ahead = (g, type, range) => g.items.find((it) => !it.done && it.type === type && it.at >= g.dist - 1 && it.at - g.dist < range);

/** The x that keeps the crowd off a hazard's span (or the nearer side of it). */
function dodge_(g, hz) {
  const h = crowdHalf(g.count);
  const [a, b] = hazardSpan(hz, g.t + (hz.at - g.dist) / g.speed);
  const left = a - h - 0.05, right = b + h + 0.05;
  const lim = 1 - h * 0.8;
  const opts = [left, right].filter((v) => v >= -lim && v <= lim);
  if (!opts.length) return a + 1 > 1 - b ? -lim : lim;
  return opts.sort((p, q) => Math.abs(p - g.x) - Math.abs(q - g.x))[0];
}

function gateSide(g, it, best) {
  const val = (gate) => (gate ? applyOp(g.count, gate) : g.count);
  const [l, r] = it.gates.map(val);
  return best ? (l >= r ? -0.5 : 0.5) : (l <= r ? -0.5 : 0.5);
}

export const BOTS = {
  /** Takes the better gate, steps off hazards, grabs beans, sidesteps the boss's slam. */
  good(g) {
    if (g.phase === 'boss') return g.boss.warn ? (g.boss.warn.side === 0 ? 0.6 : -0.6) : g.x;
    const hz = ahead(g, 'hazard', 220) ?? g.items.find((it) => !it.done && it.type === 'hazard' && g.dist >= it.at);
    if (hz) return dodge_(g, hz);
    const gt = ahead(g, 'gates', 420);
    if (gt) return gateSide(g, gt, true);
    const bn = ahead(g, 'beans', 260);
    if (bn) return bn.x;
    return g.x;
  },
  /** Takes the worse gate and walks into everything. */
  bad(g) {
    if (g.phase === 'boss') return g.boss.warn ? (g.boss.warn.side === 0 ? -0.5 : 0.5) : g.x;
    const gt = ahead(g, 'gates', 420);
    if (gt) return gateSide(g, gt, false);
    const hz = ahead(g, 'hazard', 220);
    if (hz) { const [a, b] = hazardSpan(hz, g.t); return (a + b) / 2; }
    return g.x;
  },
  /** Takes the better gate but walks into hazards and stands under the slam. */
  careless(g) {
    if (g.phase === 'boss') return g.x;
    const gt = ahead(g, 'gates', 420);
    return gt ? gateSide(g, gt, true) : g.x;
  },
  /** Never steers: runs the middle of the road (every gate's right half, by the x ≥ 0 rule). */
  idle() { return 0; },
};

/** A tiny seeded RNG (mulberry32 over a string hash) for the human-like bot. */
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

/**
 * A first-time human (the coordinator's lesson from 守墙关 10-20: a level tuned by perfect bots was too hard for
 * Hanli): sees things late and reacts ~`react` s after, picks the worse gate `wrong` of the time, steps off a hazard
 * only `dodge` of the time, goes for beans `beans` of the time, sidesteps the boss's slam `slam` of the time, and
 * never lands exactly where meant.
 */
export function humanBot(seed, { react = 0.4, wrong = 0.2, dodge = 0.65, beans = 0.5, slam = 0.5, aim = 0.12 } = {}) {
  const r = seeded(`human|${seed}`);
  const plan = new Map();         // item index (or 'slam'+n) → this player's decision, made once
  const once = (k, f) => { if (!plan.has(k)) plan.set(k, f()); return plan.get(k); };
  const hist = [];
  let slams = 0, warned = false;
  const wants = (g) => {
    if (g.phase === 'boss') {
      if (!g.boss.warn) return null;
      const k = `slam${slams}`;
      return once(k, () => (r() < slam ? (g.boss.warn.side === 0 ? 0.6 : -0.6) : null));
    }
    const hz = ahead(g, 'hazard', 200);
    if (hz && once(hz.i, () => r() < dodge)) return dodge_(g, hz);
    const gt = ahead(g, 'gates', 380);
    if (gt) return once(gt.i, () => gateSide(g, gt, r() >= wrong) + (r() - 0.5) * 2 * aim);
    const bn = ahead(g, 'beans', 240);
    if (bn && once(bn.i, () => r() < beans)) return bn.x;
    return null;
  };
  return (g) => {
    if (Boolean(g.boss.warn) !== warned) { warned = Boolean(g.boss.warn); if (warned) slams += 1; }
    const w = wants(g);
    hist.push([g.t, w]);
    while (hist.length > 1 && hist[1][0] <= g.t - react) hist.shift();
    const seen = hist[0][0] <= g.t - react ? hist[0][1] : null;
    return seen ?? g.target;
  };
}

/** Plays a whole level with a bot, headless. */
export function sim(kit, level, bot, { seed = 'sim', dt = 1 / 30, maxSec = 300 } = {}) {
  const g = newGame(kit, level, { seed });
  let ended = null;
  while (g.t < maxSec && !ended) {
    steer(g, bot(g));
    step(g, dt);
    for (const e of g.events) if (e.t === 'end') ended = e;
    g.events.length = 0;
  }
  return { won: Boolean(ended?.won), stars: ended?.stars ?? 0, left: g.count, peak: g.peak, sec: g.t, stats: g.stats, phase: g.phase, bossHp: g.boss.hp };
}
