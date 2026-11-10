// tide.js — 兽潮's night maker for 撒豆成兵 · 守山门 (rules/shouchao.mjs rotates the 游戏厅's tower-defence kits; this
// one deals a night at 沉鼎观's 山门 in the style of the ladder levels — shanmen · songlin · yaoyuan · heisong, never the
// story's 守灶台). Every night is a NEW layout for the save: the seed picks the waves (only beasts of his 回: `open`), their
// timing and width, both side belts of + and red cards, which side holds the stone wall and its gold card, a 纸甲 wall or
// none, the 大妖 and where it stands, the night sky and its tone, the lead's words. `tier` (0 … 1, a plateau at 1) turns up
// only the difficulty knobs: the beasts' count (`difficulty`), the squad's ceiling (`cap`), speeds, the walls' hp, the
// charge's clock.
//
// Since 2026-11-10 (Hanli at 第20潮, a squad of 1002 against a wave of 81: 「开始难度还行, 后面太简单, 一直打野猪, 没有其他
// 妖. 两边的卡有点单调…提高下可玩性」 → 「可以，按这个做」): a night has a THEME of 2–3 walking kinds (from the 5th level on
// never a wave of boars alone), each walking as its role says (the table's `walker` rows ride in `roles`: 鬿雀 drift,
// 犰狳 stand and spit, 合窳 armoured, 蠪侄 burst); its belts carry cards with powers (the table's `fx`, unlocked level by
// level: 火弹 · 冰符, 连珠, 雷符, 穿云, 分兵, 换命 — the rows ride in `fx`); the squad has a ceiling (`cap`) that rises with
// the tier, and the beasts are counted against the attack that ceiling allows, so the end stays a fight. `level` (1 … 20,
// tools/tide-levels.mjs) gates the themes and the powers; a night past the twenty (no `level`) has them all.
//
// Pure ESM, no fs, no DOM. The night it deals is proven before it is dealt: the kit's own first-time human (core.js
// humanBot, no 结印 — Hanli: 结印 is never needed to win) must win it on most of a few tries and a player who never moves
// must lose it; a layout that fails is eased (fewer beasts) a few times — tests/tide-sadoushou.test.mjs holds the result.
//
//   tide.night(table, { seed, tier, boss, open, level }) → null | { deal: { lv, over, tide: true }, sig, boss, kinds }
//   tide.prove(table, deal, seed) → boolean (one headless play by the human-like hand, no 结印: won?)
import { seeded, sim, humanBot, BOTS } from './core.js';

const NAME = {
  yezhu: { zh: '野猪', en: 'boars' }, zheng: { zh: '狰', en: 'zheng' }, qiuyu: { zh: '犰狳', en: 'qiuyu' }, qique: { zh: '鬿雀', en: 'qique' },
  heyu: { zh: '合窳', en: 'heyu' }, longzhi: { zh: '蠪侄', en: 'longzhi' },
};
// the walkers' own pace down the road (z/s) at tier 0, as the ladder sends them (合窳 and 蠪侄: the 大妖 kinds, walking
// smaller — their table rows' `walker`)
const PACE = { yezhu: 4.3, zheng: 4.5, qiuyu: 4.8, qique: 6.2, heyu: 4.0, longzhi: 4.6 };
// the powers, in the order the levels open them (`from`: the level; a night past the twenty has every one)
const POWERS = [['huo', 1], ['bing', 1], ['lian', 3], ['lei', 5], ['chuan', 7], ['fen', 10], ['huan', 13]];
const NO_BOARS_ALONE = 5; // from this level on, no wave of boars alone
const SKIES = ['clear-night', 'cloudy-night', 'fog-night', 'rain-night', 'snow-night', 'storm-night'];
const TONES = ['#101a33', '#1a2440', '#1b1f3a', '#22183a', '#14243a', '#2a1c2c'];
const SPANS = [[-0.34, 0.34], [-0.3, 0.3], [-0.38, 0.38]]; // a wave always covers the middle column: the squad shoots up it

const GAP = 14; // seconds at least between two waves reaching the 山门
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 2) => +v.toFixed(d);

/** The table's beasts a night may send: walkers (no `name`) and 大妖 (a `name`), never the story's people. */
function beastsOf(table, open) {
  const rows = Object.entries(table.beasts ?? {}).filter(([k, b]) => !k.startsWith('_') && b && !b.person && open(k));
  const walkers = rows.filter(([k, b]) => PACE[k] && (!b.name || b.walker)).map(([k]) => k);
  // a 大妖 kind walks only beside the plain beasts, never alone (a night of 蠪侄 alone is no night)
  return { walkers: walkers.some((k) => !table.beasts[k].name) ? walkers : [], bosses: rows.filter(([, b]) => b.name).map(([k]) => k) };
}

/** The ladder row the night lays over (its moments, 结印, squad rules): the one whose 回 its beasts read like. */
function baseOf(table, kinds) {
  const ladder = (table.levels ?? []).filter((l) => !l.story);
  const want = kinds.includes('qique') ? 'heisong' : kinds.some((k) => k === 'qiuyu' || k === 'heyu') ? 'yaoyuan' : kinds.includes('zheng') ? 'songlin' : 'shanmen';
  return ladder.find((l) => l.id === want) ?? ladder[0] ?? null;
}

/** The structure the seed picks (tier-free: the same seed at two tiers is the same night, harder). `lvl`: the level
    (1 … 20; past the twenty, 20) — before NO_BOARS_ALONE a wave may be boars alone. */
function shapeOf(r, walkers, bossKind, power, lvl, armour = () => false) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  // the theme: 2–3 kinds the night is about (one at least not a boar, one at least light enough to lead a wave)
  const order = walkers.map((k) => [k, r()]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const size = Math.min(walkers.length, r() < 0.5 ? 2 : 3);
  let theme = order.slice(0, size);
  if (walkers.length > 1 && theme.every((k) => k === 'yezhu')) theme = order.slice(0, 2);
  if (!theme.some((k) => power(k) < 3)) theme = [...theme.slice(0, -1), walkers.find((k) => power(k) < 3) ?? theme.at(-1)];
  const nW = bossKind ? 3 + Math.floor(r() * 2) : 4 + Math.floor(r() * 2);
  const boarsOk = lvl < NO_BOARS_ALONE || theme.length < 2;
  const waves = [];
  let t = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nW; i += 1) {
    // each wave led by the theme's kinds in turn (so every one comes), a second kind with it most times; a heavy beast
    // (power 3 and up) never alone and never in the front rank: at the 山门 the front breaks on the wall `breach` a
    // second, each its power — a heavy front takes the wall in seconds (the ladder's rows send them behind)
    const lead = theme[i % theme.length], others = theme.filter((k) => k !== lead);
    const mixRoll = r(), partner = others.length ? others[Math.floor(r() * others.length)] : null;
    const mix = Boolean(partner) && (mixRoll < 0.6 || power(lead) >= 3 || (lead === 'yezhu' && !boarsOk) || power(partner) >= 3 && power(lead) >= 3);
    let kinds = mix ? [lead, partner].sort((x, y) => power(y) - power(x)) : [lead];
    if (kinds.length > 1 && power(kinds[1]) >= 3) { const light = theme.find((k) => power(k) < 3); kinds = light ? [kinds[0], light] : kinds; }
    waves.push({ t, kinds, share: kinds.length > 1 ? 0.25 + Math.floor(r() * 4) * 0.1 : 1, span: Math.floor(r() * SPANS.length), weight: 0.8 + Math.floor(r() * 5) * 0.1 });
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
  const left = { from: 14 + Math.floor(r() * 9), every: 13 + Math.floor(r() * 5), cards: cards(2 + Math.floor(r() * 4), 0.45), cap: r() < 0.7 ? 10 : 12 };
  const right = { from: 26 + Math.floor(r() * 9), every: 14 + Math.floor(r() * 4), cards: cards(2 + Math.floor(r() * 3), 0.4), cap: r() < 0.7 ? 10 : 12 };
  // the powers' slots (drawn every night, used as the level allows): each a place in its belt's cycle and a draw of
  // the open powers — the left belt one or two, the right one
  const open = POWERS.filter(([, from]) => from <= lvl).map(([id]) => id);
  const slot = (belt) => ({ at: Math.floor(r() * (belt.cards.length + 1)), fx: open[Math.floor(r() * open.length)] });
  const slots = { L: [slot(left), slot(left)], R: [slot(right)] };
  // an armoured kind in the theme (合窳): the left's first power is one that opens it (火弹, or 穿云 where it is open)
  const opener = open.filter((id) => id === 'huo' || id === 'chuan');
  if (theme.some((k) => armour(k)) && opener.length) slots.L[0].fx = opener[slots.L[0].at % opener.length];
  if (lvl < 3) slots.R = []; // the first nights: one power a cycle, on the left
  if (lvl < 10) slots.L = slots.L.slice(0, 1);
  for (const [belt, ss] of [[left, slots.L], [right, slots.R]]) {
    belt.cards = [...belt.cards];
    for (const sl of [...ss].sort((a, b) => b.at - a.at)) belt.cards.splice(Math.min(sl.at, belt.cards.length), 0, sl.fx);
  }
  return {
    theme, waves, left, right,
    gold: { side: goldSide, from: 55 + Math.floor(r() * 4) * 5, every: 70 + Math.floor(r() * 6) * 5, cap: pick([50, 60]) },
    tierWall,
    boss: bossKind ? { beast: bossKind, at: pick([-0.15, -0.08, 0, 0.08, 0.15]), stand: pick([66, 70, 72, 76]) } : null,
    sky: pick(SKIES), tone: pick(TONES), alpha: pick([0.14, 0.18, 0.22, 0.26]), line: Math.floor(r() * 3),
  };
}

const sigOf = (s) => [
  `[${s.theme}]`, s.waves.map((w) => `${w.t}:${w.kinds.join('+')}${w.kinds.length > 1 ? `@${w.share.toFixed(2)}` : ''}/${w.span}/${w.weight.toFixed(1)}`).join(','),
  `L${s.left.from}.${s.left.every}.${s.left.cap}[${s.left.cards}]`, `R${s.right.from}.${s.right.every}.${s.right.cap}[${s.right.cards}]`,
  `g${s.gold.side}${s.gold.from}.${s.gold.every}.${s.gold.cap}`, s.tierWall ? `t${s.tierWall.side}${s.tierWall.from}.${s.tierWall.every}` : 't-',
  s.boss ? `b${s.boss.beast}${s.boss.at}.${s.boss.stand}` : 'b-', s.sky, s.tone, s.alpha, s.line,
].join('|');

/** The difficulty the tier asks (plateau at 1), eased by `ease` (the proof's step down). */
function knobsOf(tier, ease, hard = 1) {
  const t = clamp(Number(tier) || 0, 0, 1);
  const cap = Math.round((CAP[0] + (CAP[1] - CAP[0]) * t) / 10) * 10;
  return {
    cap, // the squad's ceiling: a + card past it pays nothing (core.js capOf)
    squad: Math.round(10 + SQUAD * t), // the squad at the start: the one a player of that night is expected to bring
    grow: round(GROW * t * hard, 3), // how much more the later waves bring (the first as ever: the squad is small then)
    k: round((0.78 + 0.22 * t) * ease, 3), // `difficulty`: the beasts' count and the 大妖's hp (core.js)
    pace: round(0.3 * t), // the tide a little quicker
    belt: round(7 + 1 * t), // the side belts' speed (z/s)
    wall: round(1 + 0.5 * t), // the stone walls' hp ×
    every: round(7 - 1.2 * t), // the 大妖's charge clock (s)
    bossHp: Math.round(((1000 + 200 * t) * BOSS_GROW ** t) / 10) * 10, // the fight the ceiling allows
  };
}
// The squad's ceiling at tier 0 and 1, how much the beasts' count grows over the climb (×(1 + GROW) at the top, as the
// ceiling grows ×CAP[1]/CAP[0]), and the 大妖's (tuned by tools/tide-levels.mjs runs: the human-like hand wins most, with
// the 山门 hurt — not a rout).
const CAP = [130, 260];
const GROW = 2;
const SQUAD = 20;
const BOSS_GROW = 1.2;
const ROUT = 0.85;
// the guard: a night with powers and road rules swings more than one of plain cards, so it is judged on 20 plays and
// held fair at 19 of them (the selection over its steps would let a 70% night through at 9 of 10)
const GUARD = 20;
const FAIR = 0.95;

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
  const pow = (b) => table.beasts[b].walker?.power ?? table.beasts[b].power;
  let reach = -Infinity; // when the wave before reaches the 山门: a quick wave never lands on a slow one's heels
  const waves = s.waves.map((w, i) => {
    const hp = (320 + 50 * i) * w.weight * (1 + knobs.grow * Math.min(1, i / 3)); // its beasts, in 豆兵 to beat (before `difficulty`): the later ones as the ceiling allows
    const beasts = w.kinds.length > 1
      ? [[w.kinds[0], Math.max(1, Math.round((hp * w.share) / pow(w.kinds[0])))], [w.kinds[1], Math.max(1, Math.round((hp * (1 - w.share)) / pow(w.kinds[1])))]]
      : [[w.kinds[0], Math.max(1, Math.round(hp / pow(w.kinds[0])))]];
    const speed = round(Math.max(...w.kinds.map((k) => PACE[k])) + knobs.pace + 0.1 * (i % 3));
    const t = Math.max(w.t, Math.ceil(reach + GAP - 102 / speed));
    reach = t + 102 / speed;
    return { t, beasts, speed, ...(w.span ? { span: SPANS[w.span] } : {}) };
  });
  const cardsOf = (ln) => ln.cards.map((n) => (typeof n === 'string' ? { fx: n, ...table.fx[n].card } : { n, cap: ln.cap }));
  const lines = [
    { col: 'L', from: s.left.from, every: s.left.every, cards: cardsOf(s.left) },
    { col: 'R', from: s.right.from, every: s.right.every, cards: cardsOf(s.right) },
    { col: s.gold.side, from: s.gold.from, every: s.gold.every, wall: { hp: Math.round(50 * knobs.wall) } },
    { col: s.gold.side, from: s.gold.from + 6, every: s.gold.every, cards: [{ n: 10, cap: s.gold.cap, step: 2, gold: true }] },
    ...(s.tierWall ? [{ col: s.tierWall.side, from: s.tierWall.from, every: s.tierWall.every, wall: { hp: Math.round(65 * knobs.wall), gives: 'tier' } }] : []),
  ];
  const last = waves.at(-1).t;
  const bossName = s.boss ? table.beasts[s.boss.beast].name : null;
  // what rides in the deal (the phone carries an old copy of the table): each kind's road rules, each power's row
  const used = new Set([...s.left.cards, ...s.right.cards].filter((n) => typeof n === 'string'));
  const roles = Object.fromEntries(s.theme.filter((k) => table.beasts[k].walker).map((k) => [k, table.beasts[k].walker]));
  const fx = Object.fromEntries([...used].map((id) => [id, table.fx[id]]));
  return {
    title: { zh: '兽潮 · 守山门', en: 'Beast Tide · Hold the Gate' },
    lead: leadOf(s, kinds, bossName),
    difficulty: knobs.k,
    cap: knobs.cap,
    squad: knobs.squad,
    roles,
    fx,
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
  let won = 0, wall = 0;
  for (let i = 0; i < tries; i += 1) {
    const r = sim(table, level, humanBot(`${salt}|h${i}`), { seed: `${salt}|s${i}` });
    if (r.won) { won += 1; wall += r.wall / level.wall; }
  }
  return { won, tries, wall: won ? wall / won : 0, idle: sim(table, level, BOTS.idle, { seed: `${salt}|idle` }).won };
}

export const tide = {
  game: 'sadoushou',
  boss: true,
  bossEvery: 5, // its twenty levels: a 大妖 on every fifth (tools/tide-levels.mjs; Hanli 11-10's plan)
  /** table: worlds/jiuding/levels/sadoushou.json as parsed. ask: { seed, tier 0..1, boss, open(beastKind) }.
      → null when nothing fits, else { deal: { lv, over, tide: true }, sig, boss, kinds }. */
  night(table, ask = {}) {
    const open = typeof ask.open === 'function' ? ask.open : () => true;
    const { walkers, bosses } = beastsOf(table, open);
    if (!walkers.length) return null;
    const r = seeded(`tide|sadoushou|${ask.seed ?? ''}`);
    const bossPick = Math.floor(r() * 1e6); // drawn every night, so the shape's draws never hang on `ask.boss`
    const bossKind = ask.boss && bosses.length ? bosses[bossPick % bosses.length] : null;
    const lvl = clamp(Math.round(Number(ask.level) || 20), 1, 20);
    const power = (k) => table.beasts[k].walker?.power ?? table.beasts[k].power;
    const s = shapeOf(r, walkers, bossKind, power, lvl, (k) => Boolean(table.beasts[k].walker?.armor));
    const kinds = [...new Set([...s.waves.flatMap((w) => w.kinds), ...(bossKind ? [bossKind] : [])])];
    const base = baseOf(table, kinds);
    if (!base) return null;
    // the proof: eased a step (×0.88 the beasts) until the human wins 19 in 20 (GUARD · FAIR); never so far that standing still wins.
    // A rout (every try won with the 山门 nearly whole: `ROUT`) turns the later waves up a step (`hard` ×1.25) instead, at
    // most five times, kept only while the human still wins 19 in 20 — the end of a night stays a fight (Hanli 11-10:
    // 「后面太简单」).
    let over = null, ease = 1, hard = 1, up = 0, held = false, rout = false;
    for (let n = 0; n < 9; n += 1) {
      const next = overOf(table, s, knobsOf(ask.tier, ease, hard), kinds);
      const p = proven(table, { ...base, ...next }, { salt: `tide|${ask.seed}`, tries: GUARD });
      const fair = p.won >= p.tries * FAIR;
      if (up && !fair) break; // turned up too far: the last one held
      if (p.idle && over) break;
      over = next;
      held = fair || held;
      rout = fair && p.won === p.tries && p.wall >= ROUT;
      if (fair && p.won === p.tries && p.wall >= ROUT && up < 5 && Number(ask.tier) > 0) { up += 1; hard *= 1.25; continue; }
      if (fair) break;
      ease *= 0.88;
    }
    // `fair`: the guard passed (a night it never passed is still dealt — it is the easiest it could make — but the
    // twenty levels, tools/tide-levels.mjs, keep only fair ones)
    // `rout`: still won every play with the 山门 nearly whole after the last turn-up (the twenty skip those past the 4th)
    return { deal: { lv: base.id, over, tide: true }, sig: sigOf(s), boss: Boolean(bossKind), kinds, fair: held, rout };
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
