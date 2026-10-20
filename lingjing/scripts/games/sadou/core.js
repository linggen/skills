// core.js — 撒豆成兵's engine: the crowd run (Hanli 10-20: 「对, 做一个撒豆成兵的关卡」; the genre: crowd + math gates).
// Pure and headless: no Phaser, no DOM. The crowd is a NUMBER (count, lateral x), never a list of agents — gates, beans,
// hazards, the clash and the boss are arithmetic on it; the scene draws as many soldiers as it likes from the count.
// Phaser's play (tools/sadou/src) imports this file as an external, and the tests and bots run it as is.
//
//   newGame(kit, level, { seed }) → g        step(g, dt)        steer(g, x)        sim(kit, level, bot) → result
//
// Space: the 山道 runs up the screen; `g.dist` is how far the crowd has come (px). Lateral `x` is −1 (the road's left
// edge) … 1 (its right). Every track item has `at` (px along the road); the crowd's front meets it when g.dist ≥ at.
// Events go out on g.events (drained by the caller each step): gate · beans · hazard · rock · clash · clash_end · boss ·
// hit · slam_warn · slam · low · end.
//
// The ladder's new pieces are data, each one a field a level may use (worlds/jiuding/levels/sadou.json):
//   gates `flip` (px)   the two faces swap every `flip` px of road until the crowd reaches them (翻符门)
//   rocks               falls of 落石 at `at` + i·`gap`, each on [x − r, x + r], shadowed `warn` px ahead
//   horde `span`        a horde on one lane only; the crowd that runs round it fights nothing
//   boss `moves`        the slam's pattern, in turn: half (the half the crowd stands in) · edges · middle
//   `difficulty`        the level's one knob (1 = as tuned): scales every horde's beasts and the boss's hp

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

/** The gates as they stand with the crowd `dist` along: a flipping pair has swapped once per `flip` px still to run. */
export function gatesAt(it, dist) {
  if (!it.flip) return it.gates;
  return Math.floor(Math.max(0, it.at - dist) / it.flip) % 2 ? [it.gates[1], it.gates[0]] : it.gates;
}

/** The slam's zones for a move: spans of the road (−1…1) that the blow lands on. */
export function slamZones(move, x) {
  if (move === 'edges') return [[-1, -0.3], [0.3, 1]];
  if (move === 'middle') return [[-0.42, 0.42]];
  return x < 0 ? [[-1, 0]] : [[0, 1]];
}

const zonesHit = (x, h, zones) => zones.reduce((s, [a, b]) => s + overlap(x, h, a, b), 0);

export function newGame(kit, level, { seed = 'sadou' } = {}) {
  const k = level.difficulty ?? 1;
  const items = level.track.map((it, i) => ({ ...it, i, done: false, next: 0, left: it.type === 'horde' ? horde(kit, it, k) : null }));
  return {
    kit, level, seed,
    t: 0,                         // seconds since the run began (after the lead-in)
    phase: 'run',                 // run · clash · boss · won · lost
    dist: 0, speed: level.speed,
    count: level.start, peak: level.start,
    x: 0, target: 0,
    items,
    clash: null,                  // the horde being fought
    boss: { ...level.boss, hp: Math.round(level.boss.hp * k), hpMax: Math.round(level.boss.hp * k), slamT: level.boss.slamEvery, warn: null, feed: 0, slams: 0 },
    acc: 0,                       // fractional losses carried between steps
    low: false,
    events: [],
    stats: { gates: 0, good: 0, bad: 0, beans: 0, lostHazard: 0, lostRocks: 0, lostClash: 0, lostSlam: 0, beasts: 0 },
  };
}

function horde(kit, it, k = 1) {
  const units = it.beasts.map(([b, n]) => ({ b, n: Math.max(1, Math.round(n * k)), p: kit.beasts[b].power }));
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
      const gate = gatesAt(it, g.dist)[side];
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
    } else if (it.type === 'rocks') {
      // each rock lands as the crowd reaches its place and takes the share of the crowd under it
      while (it.next < it.falls.length && g.dist >= it.at + it.next * it.gap) {
        const j = it.next, x = it.falls[j], r = it.r ?? 0.3;
        it.next += 1;
        const f = overlap(g.x, h, x - r, x + r);
        const k = Math.min(g.count, Math.round(g.count * f * it.kill));
        g.count -= k;
        g.stats.lostRocks += k;
        g.events.push({ t: 'rock', i: it.i, j, x, killed: k });
        checkLow(g);
        if (g.phase !== 'run') return;
      }
      if (it.next >= it.falls.length) it.done = true;
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
    const moves = bs.moves ?? ['half'];
    const move = moves[bs.slams % moves.length];
    bs.slams += 1;
    bs.warn = { side: g.x < 0 ? 0 : 1, move, zones: slamZones(move, g.x) };
    g.events.push({ t: 'slam_warn', side: bs.warn.side, move, zones: bs.warn.zones, sec: bs.warnSec });
  }
  if (bs.slamT <= 0) {
    const f = Math.min(1, zonesHit(g.x, crowdHalf(g.count), bs.warn.zones));
    const k = lose(g, g.count * f * bs.slamKill, 'lostSlam');
    g.events.push({ t: 'slam', side: bs.warn.side, move: bs.warn.move, zones: bs.warn.zones, killed: k });
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
const lim = (g) => 1 - crowdHalf(g.count) * 0.8;

/** The x where the crowd is least under `zones` (ties: the nearest to where it runs now). */
export function safeX(g, zones, worst = false) {
  const h = crowdHalf(g.count), L = lim(g);
  const xs = [g.x, -L, L, 0];
  for (const [a, b] of zones) xs.push(a - h - 0.05, b + h + 0.05);
  const ok = xs.filter((v) => v >= -L && v <= L);
  const cost = (v) => (worst ? -1 : 1) * zonesHit(v, h, zones) + Math.abs(v - g.x) * 1e-3;
  return ok.sort((p, q) => cost(p) - cost(q))[0];
}

/** The x that keeps the crowd off a hazard's span (or the nearer side of it). */
function dodge_(g, hz) {
  return safeX(g, [hazardSpan(hz, g.t + (hz.at - g.dist) / g.speed)]);
}

/** The next rock still to fall within `range` px: { it, j, zone }. */
function rockAhead(g, range) {
  for (const it of g.items) {
    if (it.done || it.type !== 'rocks') continue;
    const j = it.next, land = it.at + j * it.gap;
    if (j < it.falls.length && land - g.dist < range) return { it, j, zone: [it.falls[j] - (it.r ?? 0.3), it.falls[j] + (it.r ?? 0.3)] };
  }
  return null;
}

/** The side to take at a gate pair as it will stand when the crowd reaches it (`shown`: as it stands now). */
function gateSide(g, it, best, shown = false) {
  const val = (gate) => (gate ? applyOp(g.count, gate) : g.count);
  const [l, r] = gatesAt(it, shown ? g.dist : it.at).map(val);
  return best ? (l >= r ? -0.5 : 0.5) : (l <= r ? -0.5 : 0.5);
}

/** A horde on one lane: run through it (and take the gate behind it on that side) or round it (the other gate)? */
function lanePlan(g, hd) {
  const [a, b] = hd.span;
  const through = Math.max(0, g.count - hd.left.hp);
  const side = a + b > 0 ? 1 : 0;
  const gt = g.items.find((it) => !it.done && it.type === 'gates' && it.at > hd.at && it.at - hd.at < 900);
  const val = (n, s) => { const gate = gt && gatesAt(gt, gt.at)[s]; return gate ? applyOp(n, gate) : n; };
  const goThrough = val(through, side) > val(g.count, 1 - side);
  const h = crowdHalf(g.count), L = lim(g);
  const round = side ? Math.max(-L, a - h - 0.05) : Math.min(L, b + h + 0.05);
  return { through: goThrough, x: goThrough ? (a + b) / 2 : round, round };
}
const laneHorde = (g, range) => g.items.find((it) => !it.done && it.type === 'horde' && it.span && it.at - g.dist < range && it.at >= g.dist - 1);

export const BOTS = {
  /** Takes the better gate, steps off hazards and falling rocks, grabs beans, plays a lane horde right, dodges the slam. */
  good(g) {
    if (g.phase === 'boss') return g.boss.warn ? safeX(g, g.boss.warn.zones) : g.x;
    const hz = ahead(g, 'hazard', 220) ?? g.items.find((it) => !it.done && it.type === 'hazard' && g.dist >= it.at);
    if (hz) return dodge_(g, hz);
    const rk = rockAhead(g, 240);
    if (rk) return safeX(g, [rk.zone]);
    const ln = laneHorde(g, 420);
    if (ln) return lanePlan(g, ln).x;
    const gt = ahead(g, 'gates', 420);
    if (gt) return gateSide(g, gt, true);
    const bn = ahead(g, 'beans', 260);
    if (bn) return bn.x;
    return g.x;
  },
  /** Takes the worse gate and walks into everything. */
  bad(g) {
    if (g.phase === 'boss') return g.boss.warn ? safeX(g, g.boss.warn.zones, true) : g.x;
    const gt = ahead(g, 'gates', 420);
    if (gt) return gateSide(g, gt, false);
    const rk = rockAhead(g, 240);
    if (rk) return (rk.zone[0] + rk.zone[1]) / 2;
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
 * Hanli): sees things late and reacts ~`react` s after, picks the worse gate `wrong` of the time (and reads a flipping
 * pair as it stands NOW, not as it will land), steps off a hazard or a falling rock only `dodge` of the time, plays a
 * lane horde wrong `wrong` of the time, goes for beans `beans` of the time, sidesteps the boss's slam `slam` of the
 * time, and never lands exactly where meant.
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
      return once(`slam${slams}`, () => r() < slam) ? safeX(g, g.boss.warn.zones) : null;
    }
    const hz = ahead(g, 'hazard', 200);
    if (hz && once(hz.i, () => r() < dodge)) return dodge_(g, hz);
    const rk = rockAhead(g, 220);
    if (rk && once(`${rk.it.i}.${rk.j}`, () => r() < dodge)) return safeX(g, [rk.zone]);
    const ln = laneHorde(g, 360);
    if (ln) {
      const right = once(`lane${ln.i}`, () => r() >= wrong);
      const p = lanePlan(g, ln);
      return right === p.through ? (ln.span[0] + ln.span[1]) / 2 : p.round;
    }
    const gt = ahead(g, 'gates', 380);
    if (gt) {
      const right = once(gt.i, () => r() >= wrong), off = once(`aim${gt.i}`, () => (r() - 0.5) * 2 * aim);
      return gateSide(g, gt, right, true) + off;
    }
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
