// tide.js — 兽潮's night maker for 撒豆成兵 · 守山门 (rules/shouchao.mjs rotates the 游戏厅's tower-defence kits; this
// one deals a night at 沉鼎观's 山门 in the style of the ladder levels — shanmen · songlin · yaoyuan · heisong, never the
// story's 守灶台). Every night is a NEW layout for the save: the seed picks the waves (only beasts of his 回: `open`), their
// timing and width, both side belts of + and red cards, which side holds the stone wall and its gold card, a 纸甲 wall or
// none, the 大妖 and where it stands, the night sky and its tone, the lead's words. `tier` (0 … 1, a plateau at 1) turns up
// only the difficulty knobs: the beasts' count (`difficulty`), speeds, the walls' hp, the charge's clock.
//
// Pure ESM, no fs, no DOM. The night it deals is proven before it is dealt: the kit's own first-time human (core.js
// humanBot, no 结印 — Hanli: 结印 is never needed to win) must win it on most of a few tries and a player who never moves
// must lose it; a layout that fails is eased (fewer beasts) a few times — tests/tide-sadoushou.test.mjs holds the result.
//
//   tide.night(table, { seed, tier, boss, open }) → null | { deal: { lv, over, tide: true }, sig, boss, kinds }
//   tide.prove(table, deal, seed) → boolean (one headless play by the human-like hand, no 结印: won?)
import { seeded, sim, humanBot, BOTS } from './core.js';

const NAME = {
  yezhu: { zh: '野猪', en: 'boars' }, zheng: { zh: '狰', en: 'zheng' }, qiuyu: { zh: '犰狳', en: 'qiuyu' }, qique: { zh: '鬿雀', en: 'qique' },
};
// the walkers' own pace down the road (z/s) at tier 0, as the ladder sends them
const PACE = { yezhu: 4.3, zheng: 4.5, qiuyu: 4.8, qique: 6.2 };
const SKIES = ['clear-night', 'cloudy-night', 'fog-night', 'rain-night', 'snow-night', 'storm-night'];
const TONES = ['#101a33', '#1a2440', '#1b1f3a', '#22183a', '#14243a', '#2a1c2c'];
const SPANS = [[-0.34, 0.34], [-0.3, 0.3], [-0.38, 0.38]]; // a wave always covers the middle column: the squad shoots up it

const GAP = 14; // seconds at least between two waves reaching the 山门
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 2) => +v.toFixed(d);

/** The table's beasts a night may send: walkers (no `name`) and 大妖 (a `name`), never the story's people. */
function beastsOf(table, open) {
  const rows = Object.entries(table.beasts ?? {}).filter(([k, b]) => !k.startsWith('_') && b && !b.person && open(k));
  return { walkers: rows.filter(([k, b]) => !b.name && PACE[k]).map(([k]) => k), bosses: rows.filter(([, b]) => b.name).map(([k]) => k) };
}

/** The ladder row the night lays over (its moments, 结印, squad rules): the one whose 回 its beasts read like. */
function baseOf(table, kinds) {
  const ladder = (table.levels ?? []).filter((l) => !l.story);
  const want = kinds.includes('qique') ? 'heisong' : kinds.some((k) => k === 'qiuyu' || k === 'heyu') ? 'yaoyuan' : kinds.includes('zheng') ? 'songlin' : 'shanmen';
  return ladder.find((l) => l.id === want) ?? ladder[0] ?? null;
}

/** The structure the seed picks (tier-free: the same seed at two tiers is the same night, harder). */
function shapeOf(r, walkers, bossKind, power) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const nW = bossKind ? 3 + Math.floor(r() * 2) : 4 + Math.floor(r() * 2);
  const waves = [];
  let t = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nW; i += 1) {
    // a heavy beast (狰, power 3) never comes alone and never in the front rank: at the 山门 the front breaks on the
    // wall `breach` a second, each its power — a 狰 front takes the wall in seconds (the ladder's rows send them behind)
    const light = walkers.filter((k) => power(k) < 3), mix = walkers.length > 1 && (r() < 0.6 || !light.length);
    const a = pick(mix ? walkers : light.length ? light : walkers);
    const b = mix ? pick(walkers.filter((k) => k !== a)) : null;
    const [back, front] = b ? [a, b].sort((x, y) => power(y) - power(x)) : [null, a];
    waves.push({ t, kinds: back ? [back, front] : [front], share: back ? 0.25 + Math.floor(r() * 4) * 0.1 : 1, span: Math.floor(r() * SPANS.length), weight: 0.8 + Math.floor(r() * 5) * 0.1 });
    t += 15 + Math.floor(r() * 6);
  }
  // a belt's cards, cycled: + 1…3, and red −3…−6 — never more than one red in three, never two in a row
  const cards = (len, reds) => {
    const out = [];
    for (let i = 0; i < len; i += 1) {
      const red = r() < reds && out.filter((n) => n < 0).length + 1 <= len / 3 && !(out.at(-1) < 0) && !(i === len - 1 && out[0] < 0);
      out.push(red ? -(3 + Math.floor(r() * 4)) : 1 + Math.floor(r() * 3));
    }
    return out;
  };
  const goldSide = r() < 0.5 ? 'L' : 'R', other = goldSide === 'L' ? 'R' : 'L';
  const tierWall = r() < 0.65 ? { side: r() < 0.7 ? other : goldSide, from: 70 + Math.floor(r() * 5) * 5, every: 140 + Math.floor(r() * 4) * 10 } : null;
  return {
    waves,
    left: { from: 14 + Math.floor(r() * 9), every: 13 + Math.floor(r() * 5), cards: cards(2 + Math.floor(r() * 4), 0.45), cap: r() < 0.7 ? 10 : 12 },
    right: { from: 26 + Math.floor(r() * 9), every: 14 + Math.floor(r() * 4), cards: cards(2 + Math.floor(r() * 3), 0.4), cap: r() < 0.7 ? 10 : 12 },
    gold: { side: goldSide, from: 55 + Math.floor(r() * 4) * 5, every: 70 + Math.floor(r() * 6) * 5, cap: pick([50, 60]) },
    tierWall,
    boss: bossKind ? { beast: bossKind, at: pick([-0.15, -0.08, 0, 0.08, 0.15]), stand: pick([66, 70, 72, 76]) } : null,
    sky: pick(SKIES), tone: pick(TONES), alpha: pick([0.14, 0.18, 0.22, 0.26]), line: Math.floor(r() * 3),
  };
}

const sigOf = (s) => [
  s.waves.map((w) => `${w.t}:${w.kinds.join('+')}${w.kinds.length > 1 ? `@${w.share.toFixed(2)}` : ''}/${w.span}/${w.weight.toFixed(1)}`).join(','),
  `L${s.left.from}.${s.left.every}.${s.left.cap}[${s.left.cards}]`, `R${s.right.from}.${s.right.every}.${s.right.cap}[${s.right.cards}]`,
  `g${s.gold.side}${s.gold.from}.${s.gold.every}.${s.gold.cap}`, s.tierWall ? `t${s.tierWall.side}${s.tierWall.from}.${s.tierWall.every}` : 't-',
  s.boss ? `b${s.boss.beast}${s.boss.at}.${s.boss.stand}` : 'b-', s.sky, s.tone, s.alpha, s.line,
].join('|');

/** The difficulty the tier asks (plateau at 1), eased by `ease` (the proof's step down). */
function knobsOf(tier, ease) {
  const t = clamp(Number(tier) || 0, 0, 1);
  return {
    k: round((0.78 + 0.22 * t) * ease, 3), // `difficulty`: the beasts' count and the 大妖's hp (core.js)
    pace: round(0.3 * t), // the tide a little quicker
    belt: round(7 + 1 * t), // the side belts' speed (z/s)
    wall: round(1 + 0.5 * t), // the stone walls' hp ×
    every: round(7 - 1.2 * t), // the 大妖's charge clock (s)
    bossHp: Math.round((1000 + 200 * t) / 10) * 10,
  };
}

/** The night's lead: a 兽潮 at 沉鼎观's 山门 (the last line the big one, as every ladder row ends). */
function leadOf(s, kinds, bossName) {
  const front = NAME[s.waves[0].kinds.at(-1)], many = kinds.filter((k) => NAME[k]).map((k) => NAME[k]);
  const zhAll = many.map((n) => n.zh).join('、'), enAll = many.map((n) => n.en).join(', ');
  const open = [
    { zh: `天黑透了，${front.zh}成群往沉鼎观的山门涌——兽潮来了。`, en: `Full dark, and the ${front.en} pour up the road at Chending's gate — the tide is here.` },
    { zh: `山道上黑压压一片，${zhAll}都冲着沉鼎观的山门来了。`, en: `The mountain road goes black with them — ${enAll}, all coming at Chending's gate.` },
    { zh: `师兄们都守在后山，今夜的山门交给小满。兽潮压下来了。`, en: `The senior disciples hold the back hill; tonight Chending's gate is Xiaoman's. The tide is coming down.` },
  ][s.line];
  const goldZh = s.gold.side === 'L' ? '左' : '右', goldEn = s.gold.side === 'L' ? 'left' : 'right';
  const second = bossName
    ? { zh: `后头还跟着${bossName.zh}——它冲哪一列，就躲开哪一列。`, en: `And behind them, the ${bossName.en} — get off whatever column it charges.` }
    : { zh: `${goldZh}边的石墙后头有金卡，打碎它，队伍就壮了。`, en: `A gold card waits behind the stone wall on the ${goldEn} — break it and the squad grows.` };
  return [open, second, { zh: '撒豆成兵！', en: 'Beans into soldiers!', big: true }];
}

/** The layout as the board reads it (a level row's fields, laid over the base row). */
function overOf(table, s, knobs, kinds) {
  const pow = (b) => table.beasts[b].power;
  let reach = -Infinity; // when the wave before reaches the 山门: a quick wave never lands on a slow one's heels
  const waves = s.waves.map((w, i) => {
    const hp = (320 + 50 * i) * w.weight; // the wave's beasts, in 豆兵 to beat (before `difficulty`)
    const beasts = w.kinds.length > 1
      ? [[w.kinds[0], Math.max(1, Math.round((hp * w.share) / pow(w.kinds[0])))], [w.kinds[1], Math.max(1, Math.round((hp * (1 - w.share)) / pow(w.kinds[1])))]]
      : [[w.kinds[0], Math.max(1, Math.round(hp / pow(w.kinds[0])))]];
    const speed = round(Math.max(...w.kinds.map((k) => PACE[k])) + knobs.pace + 0.1 * (i % 3));
    const t = Math.max(w.t, Math.ceil(reach + GAP - 102 / speed));
    reach = t + 102 / speed;
    return { t, beasts, speed, ...(w.span ? { span: SPANS[w.span] } : {}) };
  });
  const cardsOf = (ln) => ln.cards.map((n) => ({ n, cap: ln.cap }));
  const lines = [
    { col: 'L', from: s.left.from, every: s.left.every, cards: cardsOf(s.left) },
    { col: 'R', from: s.right.from, every: s.right.every, cards: cardsOf(s.right) },
    { col: s.gold.side, from: s.gold.from, every: s.gold.every, wall: { hp: Math.round(50 * knobs.wall) } },
    { col: s.gold.side, from: s.gold.from + 6, every: s.gold.every, cards: [{ n: 10, cap: s.gold.cap, step: 2, gold: true }] },
    ...(s.tierWall ? [{ col: s.tierWall.side, from: s.tierWall.from, every: s.tierWall.every, wall: { hp: Math.round(65 * knobs.wall), gives: 'tier' } }] : []),
  ];
  const last = waves.at(-1).t;
  const bossName = s.boss ? table.beasts[s.boss.beast].name : null;
  return {
    title: { zh: '兽潮 · 守山门', en: 'Beast Tide · Hold the Gate' },
    lead: leadOf(s, kinds, bossName),
    difficulty: knobs.k,
    sky: s.sky, tone: { color: s.tone, alpha: s.alpha },
    belt: { speed: knobs.belt, until: Math.round(knobs.belt * 100), lines },
    waves,
    boss: s.boss ? {
      beast: s.boss.beast, hp: knobs.bossHp, speed: 3.3, stand: s.boss.stand, at: s.boss.at, half: 0.3, crush: 12,
      charge: { every: knobs.every, warn: 1.6, speed: 90, to: 4, kill: 0.35 },
    } : null,
    par: last + (s.boss ? 30 : 18),
  };
}

/** The proof a night is fair: the first-time human wins most of `tries` (no 結印), and a player who never moves loses. */
export function proven(table, level, { tries = 10, salt = 'tide' } = {}) {
  let won = 0;
  for (let i = 0; i < tries; i += 1) won += sim(table, level, humanBot(`${salt}|h${i}`), { seed: `${salt}|s${i}` }).won ? 1 : 0;
  return { won, tries, idle: sim(table, level, BOTS.idle, { seed: `${salt}|idle` }).won };
}

export const tide = {
  game: 'sadoushou',
  boss: true,
  /** table: worlds/jiuding/levels/sadoushou.json as parsed. ask: { seed, tier 0..1, boss, open(beastKind) }.
      → null when nothing fits, else { deal: { lv, over, tide: true }, sig, boss, kinds }. */
  night(table, ask = {}) {
    const open = typeof ask.open === 'function' ? ask.open : () => true;
    const { walkers, bosses } = beastsOf(table, open);
    if (!walkers.length) return null;
    const r = seeded(`tide|sadoushou|${ask.seed ?? ''}`);
    const bossPick = Math.floor(r() * 1e6); // drawn every night, so the shape's draws never hang on `ask.boss`
    const bossKind = ask.boss && bosses.length ? bosses[bossPick % bosses.length] : null;
    const s = shapeOf(r, walkers, bossKind, (k) => table.beasts[k].power);
    const kinds = [...new Set([...s.waves.flatMap((w) => w.kinds), ...(bossKind ? [bossKind] : [])])];
    const base = baseOf(table, kinds);
    if (!base) return null;
    // the proof: eased a step (×0.88 the beasts) until the human wins 9 in 10; never so far that standing still wins
    let over = null;
    for (let ease = 1, n = 0; n < 6; n += 1, ease *= 0.88) {
      const next = overOf(table, s, knobsOf(ask.tier, ease), kinds);
      const p = proven(table, { ...base, ...next }, { salt: `tide|${ask.seed}` });
      if (p.idle && over) break;
      over = next;
      if (p.won * 10 >= p.tries * 9) break;
    }
    return { deal: { lv: base.id, over, tide: true }, sig: sigOf(s), boss: Boolean(bossKind), kinds };
  },
  /** One headless play of a dealt night by the kit's human-like hand (casts=false: no 结印) → won? */
  prove(table, deal, seed = 'prove') {
    const level = dealtOf(table, deal);
    return Boolean(level) && sim(table, level, humanBot(`prove|${seed}`), { seed: `prove|${seed}`, casts: false }).won;
  },
};

/** The level a deal plays, as the mount lays it (sadoushou.js levelDealt): the row by id or ladder number, `over` on it. */
export function dealtOf(table, deal) {
  const ladder = (table.levels ?? []).filter((l) => !l.story), n = Number(deal?.lv);
  const row = table.levels?.find((l) => l.id === deal?.lv) ?? (Number.isInteger(n) && n >= 1 ? ladder[n - 1] : null);
  return row ? { ...row, ...(deal.over ?? {}) } : null;
}
