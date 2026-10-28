// tide.js — 撒豆成兵's 兽潮 night maker: a new run up the 山道 for each night of 沉鼎观's beast tide (rules/shouchao.mjs
// rotates the four 塔防 kits; this one is the crowd run). 小满 leads the bean soldiers out of the 山门 down the 山道 to
// break the tide. Pure ESM: no fs, no DOM — the rules hand it the parsed level table, it hands back the night.
//
//   tide.night(table, { seed, tier, boss, open }) → null | { deal, sig, boss, kinds, beast }
//   tide.prove(table, deal, seed) → boolean   (one headless run by a first-time human's hand: won?)
//
// `deal` is what games/sadou.js reads as `data`: { lv: <a row of the table>, over: <the whole layout>, tide: true }.
// The phone ships an old copy of the table, so everything new rides in `over` (track, boss, pace, look, words); the row
// named by `lv` only lends what is not overridden — its moments, which name its boss (合窳 rows for 合窳, 黑松岭 for 蠪侄).
// `tide: true` keeps the shell from offering 下一关.
//
// What varies per seed: the track (how many gates, their ops and numbers, which side is good, flipping pairs; bean lines;
// spikes, swinging logs, falls of rock; full-road and lane hordes, their beasts and sizes; the order and the spacing),
// the run's length, its speed and steer, the tone and roadside props, the end beast (an open boss of the table) and its
// slam pattern. `tier` (0…1, plateau at 1) climbs the knobs: the level's `difficulty` (every horde and the boss's hp),
// the boss's hp and slams, the speed, how often a gate flips, how hard the hazards bite. Only `open` beasts come.
//
// Every night is proved before it is handed out: the careful bot (core.js BOTS.good) must win it, the careless one
// (walks into everything, stands under the slam) must not win it with three stars — from tier CARELESS_LOSES on, the
// boss is first made just tough enough that it cannot win at all, kept when the rest still holds — and a fresh panel
// of first-time humans (core.js humanBot) must win at least floorAt(tier) of PROOF.runs; a layout that fails is re-rolled
// (`seed#k`), at most PROOF.tries times, then null. A proved night costs ~0.2–0.7 s of headless play: make it once.
import { BOTS, humanBot, seeded, sim } from './core.js';

// a first-timer's floor: 22 of 24 at tier 0, easing to 20 of 24 at the plateau (the climb is felt, never a wall)
const PROOF = { runs: 24, wins: 22, ease: 2, tries: 24 };
const floorAt = (tier) => Math.round(PROOF.wins - PROOF.ease * tier);
const CARELESS_LOSES = 0.5; // from this tier on, the boss is first tried just past what the careless bot can finish

const TONES = [
  null,
  { color: '#0b1a3a', alpha: 0.42 }, // night
  { color: '#0b1a3a', alpha: 0.3 },
  { color: '#1a1030', alpha: 0.34 }, // a violet night
  { color: '#3a3f46', alpha: 0.18 }, // mist
  { color: '#4a2a08', alpha: 0.16 }, // dusk
  { color: '#0e2a1a', alpha: 0.3 }, // under pines
  { color: '#3a0e0e', alpha: 0.2 }, // a red sky
];

// The frame (every glyph in font/chars.txt — the canvas draws them in its subset font; tests/tide-sadou.test.mjs holds it).
const TITLE = { zh: '兽潮 · 撒豆成兵', en: 'Beast Tide · Beans into Soldiers' };
const OPEN = [
  { zh: '夜里，兽潮压到了山门下。', en: 'Night, and the beast tide is at Chending\'s gate.' },
  { zh: '天黑了，兽潮冲上山道来了。', en: 'Dark has come, and the beast tide is coming up the road.' },
  { zh: '山门前，兽群压了上来。', en: 'Before the gate, the beasts are pressing in.' },
  { zh: '兽潮来了，山道上黑压压的。', en: 'The tide has come; the road is dark with beasts.' },
];
const LEAD = [
  { zh: '小满抓出一把黄豆，带豆兵冲出山门——', en: 'Xiaoman grabs a fistful of beans and leads the soldiers out of the gate —' },
  { zh: '小满带着豆兵，往山道下冲——', en: 'Xiaoman takes the bean soldiers charging down the road —' },
  { zh: '小满开了山门，豆兵们跟我冲！', en: 'Xiaoman throws the gate open. Soldiers, with me!' },
];
const BIG = [
  { zh: '撒豆成兵！', en: 'Beans into soldiers!', big: true },
  { zh: '冲出山门！', en: 'Out of the gate!', big: true },
  { zh: '打退兽潮！', en: 'Break the tide!', big: true },
  { zh: '守住山门！', en: 'Hold the gate!', big: true },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);

/** A string's hash, base 36 (FNV-1a over two lanes — 64 bits, enough for years of nights). */
function hash(s) {
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 0x85ebca6b) ^ (b >>> 13);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

function dice(seed) {
  const r = seeded(seed);
  const d = {
    r,
    f: (a, b) => a + (b - a) * r(),
    i: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (xs) => xs[Math.floor(r() * xs.length)],
    chance: (p) => r() < p,
  };
  return d;
}

/** The table's beasts split: the bosses (a `name`) and the rank, each kept only when open. */
function beastsOf(table, open) {
  const all = Object.entries(table.beasts ?? {}).filter(([k, b]) => !k.startsWith('_') && b && open(k));
  return { bosses: all.filter(([, b]) => b.name).map(([k]) => k), rank: all.filter(([, b]) => !b.name).map(([k]) => k) };
}

/** A horde worth ~`power` soldiers (before the level's difficulty), of 1–3 open kinds. */
function hordeOf(d, table, rank, power) {
  const kinds = [...rank].sort(() => d.r() - 0.5).slice(0, Math.min(rank.length, d.i(1, 3)));
  const shares = kinds.map(() => 0.5 + d.r());
  const sum = shares.reduce((s, v) => s + v, 0);
  return kinds.map((k, j) => [k, Math.max(1, Math.round((power * shares[j]) / sum / table.beasts[k].power))]);
}

/** A good gate for the stage `s` (0…1 along the road). */
function goodGate(d, s) {
  if (d.chance(0.3)) return { op: 'x', n: s < 0.2 && d.chance(0.5) ? 3 : 2 };
  return { op: '+', n: r5(d.f(8, 20) + s * d.f(30, 45)) };
}
/** A trap gate for the stage `s`. */
function badGate(d, s) {
  if (d.chance(0.25)) return { op: '/', n: 2 };
  return { op: '-', n: r5(d.f(5, 12) + s * d.f(15, 30)) };
}

/** A pair: one good and one trap (either side), now and then two good ones (the bigger one to find). */
function gatePair(d, s, tier) {
  let pair;
  if (d.chance(0.18)) {
    const a = goodGate(d, s);
    let b = goodGate(d, s);
    if (a.op === b.op && a.n === b.n) b = a.op === 'x' ? { op: '+', n: r5(10 + s * 40) } : { op: 'x', n: 2 };
    pair = [a, b];
  } else {
    pair = [goodGate(d, s), badGate(d, s)];
    if (d.chance(0.5)) pair.reverse();
  }
  const it = { type: 'gates', gates: pair };
  if (s > 0.1 && d.chance(0.12 + 0.3 * tier)) it.flip = 10 * d.i(24, 32);
  return it;
}

function hazardOf(d, s, tier) {
  if (d.chance(0.5)) {
    const left = d.chance(0.5);
    return { type: 'hazard', kind: 'spikes', x: left ? [-1, 0] : [0, 1], len: 120, kill: +clamp(d.f(0.3, 0.4) + 0.35 * s + 0.1 * tier, 0.3, 0.8).toFixed(2) };
  }
  const w = d.pick([0.35, 0.4]);
  return { type: 'hazard', kind: 'log', x: [-w, w], len: 90, kill: 0.5, swing: d.pick([0.5, 0.55]), period: d.pick([2.2, 2.4, 2.6]) };
}

function rocksOf(d) {
  const n = d.i(3, 5), falls = [];
  for (let j = 0; j < n; j += 1) {
    let x = d.pick([-0.55, -0.5, -0.45, -0.4, 0, 0.4, 0.45, 0.5, 0.55]);
    if (j && Math.sign(x) === Math.sign(falls[j - 1]) && d.chance(0.6)) x = -x; // mostly side to side
    falls.push(x);
  }
  return { type: 'rocks', gap: 10 * d.i(23, 26), falls, r: 0.26, kill: 0.32 };
}

/** How much road an item takes before the next may stand. */
const room = (it) => (it.type === 'rocks' ? it.gap * it.falls.length + 350 : it.type === 'horde' && it.span ? 600 : 0);

/** One night's layout from one roll (not yet proved). */
function layout(table, ask, roll) {
  const d = dice(`sadou-tide|${roll}`);
  const tier = clamp(Number(ask.tier) || 0, 0, 1);
  const { bosses, rank } = beastsOf(table, ask.open ?? (() => true));
  if (!bosses.length || !rank.length) return null;
  const beast = d.pick(bosses);
  const base = table.levels.find((l) => l.boss?.beast === beast && (beast !== 'heyu' || l.id === 'shandao')) ?? table.levels.find((l) => l.boss?.beast === beast);
  if (!base) return null;

  const speed = Math.round(270 + 25 * tier + d.f(-6, 6));
  const sec = d.f(64, 78);
  const end = speed * sec; // where the boss stands
  // the road's beats, in order: gates, beans, hazards, rocks, hordes (full or a lane, a gate behind a lane)
  const nHordes = d.i(3, 5);
  const track = [];
  let at = 900;
  track.push({ type: 'gates', at, gates: d.chance(0.5) ? [{ op: '+', n: r5(d.f(5, 10)) }, { op: 'x', n: d.pick([2, 3]) }] : [{ op: 'x', n: d.pick([2, 3]) }, { op: '+', n: r5(d.f(5, 10)) }] });
  // the hordes' places, spread along the road (the last before the boss's run-in)
  const hAt = Array.from({ length: nHordes }, (_, j) => 0.2 + (0.66 * (j + d.f(0.2, 0.8))) / nHordes);
  let h = 0, sinceGate = 1, sinceHazard = 2;
  while (true) {
    at += 10 * d.i(65, 92);
    if (at > end - 1100) break;
    const s = at / end;
    let it;
    if (h < nHordes && s >= hAt[h]) {
      const power = (10 + 50 * Math.pow(h / Math.max(1, nHordes - 1), 1.3)) * d.f(0.9, 1.15);
      it = { type: 'horde', beasts: hordeOf(d, table, rank, power) };
      if (h < nHordes - 1 && d.chance(0.3 + 0.2 * tier)) it.span = d.pick([[0, 1], [-1, 0], [-1, 0.2], [-0.2, 1]]);
      h += 1;
    } else if (sinceGate >= 2 || (sinceGate >= 1 && d.chance(0.55))) {
      it = gatePair(d, s, tier);
    } else if (sinceHazard >= 2 && d.chance(0.6)) {
      it = d.chance(0.35 + 0.15 * tier) ? rocksOf(d) : hazardOf(d, s, tier);
    } else {
      it = { type: 'beans', x: +(d.pick([-1, 1]) * d.f(0.4, 0.62)).toFixed(2), n: r5(d.f(8, 12) + s * 12) };
    }
    it.at = at;
    track.push(it);
    sinceGate = it.type === 'gates' ? 0 : sinceGate + 1;
    sinceHazard = it.type === 'hazard' || it.type === 'rocks' ? 0 : sinceHazard + 1;
    if (it.span) { // a lane horde: the gate behind it on the lane side is the sum to do
      at += 600;
      if (at > end - 1100) break;
      const g = gatePair(d, s, 0);
      delete g.flip;
      g.at = at;
      track.push(g);
      sinceGate = 0;
    }
    at += room(it);
  }
  if (!track.some((t) => t.type === 'hazard' || t.type === 'rocks')) return null; // the careless must have something to walk into
  if (track.filter((t) => t.type === 'horde').length < 2) return null;
  const bossAt = Math.round((track.at(-1).at + 10 * d.i(100, 130)) / 10) * 10;

  const pats = beast === 'longzhi' || tier > 0.35
    ? [['half'], ['half', 'edges'], ['half', 'middle'], ['half', 'edges', 'half', 'middle']].slice(0, 1 + Math.round(tier * 3))
    : [['half']];
  const boss = {
    ...base.boss,
    beast, at: bossAt,
    hp: Math.round(90 + 40 * tier + d.f(-5, 5)),
    slamEvery: +(2.4 - 0.3 * tier).toFixed(2),
    warnSec: beast === 'longzhi' ? 1.1 : 1.0,
    slamKill: +(0.2 + 0.12 * tier).toFixed(3),
    moves: d.pick(pats),
  };
  const tone = d.pick(TONES);
  const p = [d.f(0.3, 0.8), d.f(0.1, 0.5), d.f(0.03, 0.35)], ps = p[0] + p[1] + p[2];
  const over = {
    id: `tide-${hash(roll)}`, // the roadside props are seeded by the level's id (tools/sadou/src/play.js)
    title: TITLE,
    lead: [d.pick(OPEN), d.pick(LEAD), d.pick(BIG)],
    leadSec: 4.6,
    speed, steer: +(3.2 + 0.2 * tier).toFixed(2),
    start: 15, low: 8, clashMin: 24 + Math.round(4 * tier),
    difficulty: +(0.58 + 0.3 * tier).toFixed(3),
    ...(tone ? { tone } : {}),
    props: { pine: +(p[0] / ps).toFixed(2), rock: +(p[1] / ps).toFixed(2), lantern: +(p[2] / ps).toFixed(2) },
    track, boss,
    stars: [120, 40], // set from the careful run below
  };
  const sig = hash(JSON.stringify([
    base.id, tone, over.props,
    track.map((t) => [t.type, t.at, t.gates?.map((g) => g && `${g.op}${g.n}`), t.flip ? 1 : 0, t.kind, t.x, t.span, t.falls, t.beasts?.map(([k, n]) => `${k}${n}`)]),
    beast, boss.moves,
  ]));
  return { base, over, sig, beast };
}

/** A first-timer's proof at a boss hp: the careful bot wins (its soldiers left set the stars), the careless one never
    wins ★★★ (`careless: 'lose'`: never wins), and humanBot wins `need` of PROOF.runs. → { stars, hp } or null. */
function provedAt(table, base, over, hp, careless, roll, need) {
  const at = (stars) => ({ ...base, ...over, stars, boss: { ...over.boss, hp } });
  const won = sim(table, at(over.stars), BOTS.good);
  if (!won.won || won.left < 10) return null;
  const stars = [Math.max(3, Math.round(won.left * 0.7)), Math.max(2, Math.round(won.left * 0.25))];
  const lv = at(stars);
  const c = sim(table, lv, BOTS.careless);
  if (c.won && (c.stars >= 3 || careless === 'lose')) return null;
  // a fresh panel of first-timers per roll: one fixed panel, lucky or not, would pass every night it happens to like
  const panel = (tag) => {
    let wins = 0;
    for (let i = 0; i < PROOF.runs; i += 1) {
      if (sim(table, lv, humanBot(`${roll}|${tag}${i}`), { seed: `${roll}|${tag}${i}` }).won) wins += 1;
      if (wins >= need) return true;
      if (wins + (PROOF.runs - i - 1) < need) return false;
    }
    return false;
  };
  if (!panel('p')) return null;
  return { stars, hp };
}

/** The least boss hp (to ~4%) the careless bot cannot bring down, a little past it; null past any sane hp. */
function carelessEdge(table, base, over) {
  const wins = (hp) => sim(table, { ...base, ...over, boss: { ...over.boss, hp } }, BOTS.careless).won;
  let lo = over.boss.hp, hi = lo;
  if (!wins(lo)) return lo;
  while (wins(hi)) { lo = hi; hi *= 1.6; if (hi > 2000) return null; }
  while (hi - lo > lo * 0.04) { const mid = (lo + hi) / 2; if (wins(mid)) lo = mid; else hi = mid; }
  return Math.ceil(hi * 1.03);
}

/** The night's proof, and its last knob: from tier CARELESS_LOSES on, the boss is first tried just tough enough that
    the careless bot (walks into every hazard, stands under every slam) cannot finish it — kept only if a first-timer
    still wins it; else (and below that tier) the boss as rolled, where the careless bot may win, never with ★★★. */
function proved(table, base, over, tier, roll) {
  if (tier >= CARELESS_LOSES) {
    const hp = carelessEdge(table, base, over);
    const hard = hp && hp <= over.boss.hp * 2.5 ? provedAt(table, base, over, hp, 'lose', roll, floorAt(tier)) : null;
    if (hard) return hard;
  }
  return provedAt(table, base, over, over.boss.hp, null, roll, floorAt(tier));
}

export const tide = {
  game: 'sadou',
  boss: false, // no 结印 here: the rotation never puts a 结印 boss night on this kit (the run still ends on its 大妖)
  /** table: worlds/jiuding/levels/sadou.json as parsed. ask: { seed, tier 0…1, boss (ignored), open(kind) → bool }.
      → null when nothing fits (no open boss or no open rank beast, or no roll proved), else
        { deal: { lv, over, tide: true }, sig, boss: false, kinds: [the beasts it plays, the end beast too], beast } */
  night(table, ask) {
    if (!table?.levels?.length || !table.beasts) return null;
    for (let k = 0; k < PROOF.tries; k += 1) {
      const roll = k ? `${ask.seed}#${k}|${ask.tier}` : `${ask.seed}|${ask.tier}`;
      const made = layout(table, ask, roll);
      if (!made) { if (!beastsOf(table, ask.open ?? (() => true)).bosses.length) return null; continue; }
      const ok = proved(table, made.base, made.over, clamp(Number(ask.tier) || 0, 0, 1), roll);
      if (!ok) continue;
      const over = { ...made.over, stars: ok.stars, boss: { ...made.over.boss, hp: ok.hp } };
      const kinds = [...new Set([...over.track.filter((t) => t.type === 'horde').flatMap((t) => t.beasts.map(([b]) => b)), made.beast])];
      return { deal: { lv: made.base.id, over, tide: true }, sig: made.sig, boss: false, kinds, beast: made.beast };
    }
    return null;
  },
  /** Plays a dealt night headless once with a first-time human's hand (core.js humanBot); true when it was won. */
  prove(table, deal, seed) {
    const row = table?.levels?.find((l) => l.id === deal?.lv);
    if (!row || !deal.over) return false;
    return sim(table, { ...row, ...deal.over }, humanBot(String(seed)), { seed: String(seed) }).won;
  },
};
