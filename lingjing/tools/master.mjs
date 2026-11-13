// master.mjs — 数值系统 phase 2: the master table and what derives from it (Hanli 2026-10-27: 「以后我们调整难度, 进度可以
// 统一调整, 不必单个物品调」 · 「数值系统继续做吧」; design.md § 数值系统).
//
// balance.json `master` holds the knobs; `derive(raw)` computes every number below them from those knobs and returns the
// balance.json they make, with `overrides` (`{path, value, why}`) laid on last. tools/numbers.mjs --apply prints the diff and,
// with --write, writes it. Nothing here names a board, a beast or a 回.
//
// The curve (Hanli 2026-11-10: 「所有和数值相关的都应该有公式推到, 不能手动定」): a line climbs 81 levels — L = realm × 9 + 层,
// L1 its first realm's 一层 (古's 练气一层; 零层 is L0 and asks nothing) — and every 修为 number is read off three curves:
//   T(L) = time.first × time.growth^(L−1)          a layer's hours of play (no step at a realm);
//   R(L) = rate.base × rate.growth^(L−1) × rate.realm^realm   the 修为 one 体力-unit (≈ a minute) is worth (master.xiuwei.rate);
//   need(L) = R(L) × mix × 60 × T(L)               the 层's threshold: what an hour of the play mix pays, × its hours.
// `mix`: the units a minute of the modelled play mix is worth — a small game's (`xiuwei.board`, × R) carries the games' `share`
// of a layer's 修为 over their `time` of it, so a minute of all play is board × time ÷ share. `time.first` is the one free
// constant: solved (tools/balance.mjs --solve) so 卷一's typical player keeps the designed pace. A realm of three steps (今
// above 新生) is three levels a step, its step the sum of their need. Content declares sizes (`units`), never a 修为 number:
// every grant is units × R at the layer it is paid on (rules/playpay.mjs). Nothing here names a board, a beast or a 回.
// Beside it, per line (`master.lines.<line>`): `games`, `errand` (shares over time), `pills` (a 修为 pill by 转, in nights of
// 闭关 — named 转 between them run straight, `below` a realm past its 阶, `xian` a 仙丹's). `difficulty`: the fight bands (story
// · pool), the bot's slack. `economy`: 灵石 a minute of play (`income`), a 修为 pill's price in minutes of income for each night
// of 闭关 it is worth, gear's per point by kind, the buy-back share, the 圆满 → 灵石 rate.

import { hpMaxOf } from '../scripts/rules/cards.mjs';
import { REALMS } from '../scripts/battle.js';
import { incomeAt, rateOfLevel, realmOfLevel } from '../scripts/rules/playpay.mjs';

const round10 = (x, r = 10) => Math.round(x / r) * r;

/* The units a minute of the line's play mix is worth: a small game's (`board`) over the games' share of the 修为 per share of
   the time. */
export const mixOf = (M, line) => (M.xiuwei.board ?? 1) * line.games.time / line.games.share;
/* R(L) at level L of realm r (the master's knobs: the rules read the same from play_pay.xiuwei, playpay.mjs rateAt). */
export const rateOf = (M, L, r) => (L > 0 ? M.xiuwei.rate.base * M.xiuwei.rate.growth ** (L - 1) * (M.xiuwei.rate.realm ?? 1) ** r : 0);
/* T(L): a layer's hours of play. */
export const timeOf = (line, L) => (L > 0 ? line.time.first * line.time.growth ** (L - 1) : 0);
/* need(L), unrounded. */
export const needAt = (M, line, L, r) => rateOf(M, L, r) * mixOf(M, line) * 60 * timeOf(line, L);

/* Each realm's steps on the curve: its thresholds and hours, step by step. `tiers`: the line's, in order, each {id, zero, steps}
   (零层 among the first realm's steps); a realm of nine 层 one level a step, of three steps three. */
export function curveOf(M, line, tiers) {
  const layers = {}, hours = {}, r10 = x => round10(x, line.need?.round ?? 10);
  tiers.forEach((t, r) => {
    const z = t.zero ? 1 : 0, n = t.steps - z, span = 9 / n, need = [], time = [];
    if (z) { need.push(0); time.push(0); }
    for (let k = 0; k < n; k++) {
      const Ls = Array.from({ length: span }, (_, j) => r * 9 + k * span + j + 1);
      need.push(r10(Ls.reduce((a, L) => a + needAt(M, line, L, r), 0)));
      time.push(Math.round(Ls.reduce((a, L) => a + timeOf(line, L), 0) * 1000) / 1000);
    }
    layers[t.id] = need; hours[t.id] = time;
  });
  return { layers, hours };
}


const points = e => (e?.atk ?? 0) + (e?.def ?? 0) + Object.values(e?.ward ?? {}).reduce((a, b) => a + b, 0);
/* A worn thing's fight points from its class (batch 3, master.fight.gear): its 品 × its slot's per-品 points — a pendant's 抗 on
   each root it names (`wards`). The same reading as content.mjs gearFolded (laid on the item at load). */
function gearPoints(G, i) {
  const per = G?.[i?.kind];
  if (!per || !(i.pin > 0)) return null;
  const out = {};
  if (per.atk) out.atk = per.atk * i.pin;
  if (per.def) out.def = per.def * i.pin;
  if (per.ward && i.wards?.length) out.ward = Object.fromEntries(i.wards.map(el => [el, per.ward * i.pin]));
  return out;
}
const GEAR = new Set(['weapon', 'robe', 'pendant', 'shoes']);
const r3 = x => Math.round(x * 1000) / 1000;

/* The world the rules read, as much of it as the formulas need (playpay.mjs incomeAt · rateOfLevel read `balance`). */
const worldOf = raw => ({ balance: { economy: { income: raw.master.economy.income }, play_pay: { xiuwei: { rate: raw.master.xiuwei.rate } } } });

/* A level's 层 on the 古 ladder as derive knows it (`layers` written, `tiers` ladder.json's): its threshold, its realm's tier and
   step (练气 counts from 零层). */
function layerOf(raw, ladder, L) {
  const tiers = ladder.tiers.filter(t => raw.master.lines.gu.tiers.includes(t.id)), r = realmOfLevel(L), t = tiers[r];
  if (!t) return null;
  const step = L - r * 9 - (t.zero ? 0 : 1);
  return { tier: t.id, step, need: raw.layers[t.id]?.[step] ?? null };
}

/* A share table by 转 (一至九): the named 转, and straight between them (as pillNights was). */
export function byZhuan(P) {
  const named = Object.entries(P).filter(([k]) => /^\d$/.test(k)).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let z = 1; z <= 9; z++) {
    const lo = [...named].reverse().find(([k]) => k <= z) ?? named[0], hi = named.find(([k]) => k >= z) ?? named.at(-1);
    const v = lo[0] === hi[0] ? lo[1] : lo[1] + ((hi[1] - lo[1]) * (z - lo[0])) / (hi[0] - lo[0]);
    out.push(Math.round(v * 10000) / 10000);
  }
  return out;
}
/* A family's shares by 转: its own, or another's (`like`) × `step`. */
const sharesOf = (F, f) => (f.share ? byZhuan(f.share) : sharesOf(F, F[f.like]).map(s => Math.round(s * f.step * 10000) / 10000));

/* Every family pill's numbers at its own level (batch 2, Hanli 2026-11-10): a 修为 family's share × need(level), as units at R
   of that level (rules/core.mjs amountsOf: units × R(level)); a heal its share × his 气血 there (rules/cards.mjs hpMaxOf), a
   mana pill its share × his 灵力 cap there (battle.js REALMS); an exception's 修为 beside it. Read by content.mjs withBalance. */
export function pillsOf(raw, { ladder, items }) {
  const P = raw.master.pills, F = P.families, W = worldOf(raw), out = {};
  const staged = { ladder: { ...ladder, tiers: ladder.tiers.map(t => ({ ...t, thresholds: raw.layers[t.id] ?? [] })) }, balance: { power: raw.master.fight?.power ?? null } };
  const xiuwei = (i, share) => { const at = layerOf(raw, ladder, i.level); return at?.need ? { table: P.table, units: r3((share * at.need) / rateOfLevel(W, i.level)), level: i.level, tier: i.tier } : null; };
  for (const i of items.filter(x => x.kind === 'pill' && x.of && x.level > 0)) {
    const f = F[i.of], z = (i.zhuan ?? 1) - 1, at = layerOf(raw, ladder, i.level);
    if (!f) continue;
    // 仙阶 (a 阶 off the ladder): no 转 — its own share (`xian`).
    const share = f.pays === 'xiuwei' && !ladder.tiers.some(t => t.id === i.tier) && P.xian != null ? P.xian : sharesOf(F, f)[z];
    const e = {};
    if (f.pays === 'xiuwei') Object.assign(e, xiuwei(i, share));
    if (f.pays === 'heal' && at) e.fight = { heal: Math.max(1, Math.round(share * hpMaxOf({ tier: at.tier, step: at.step }, staged))) };
    if (f.pays === 'mana' && at) e.fight = { mana: Math.max(1, Math.round(share * (REALMS[at.tier] ?? REALMS.qi).mana)) };
    const x = P.exceptions?.[i.id];
    if (x?.xiuwei) Object.assign(e, xiuwei(i, x.xiuwei));
    out[i.id] = e;
  }
  return { table: P.table, families: Object.keys(F), ...(P.xian != null ? { off_ladder: ['xian'] } : {}), effects: out };
}

/* The kind a material is to the 饭桶 (fantong.json kinds: herb · beast · ore · paper), else junk; a 天材 that binds an element its own. */
const materialOf = (i, fantong) => (i.effect?.core ? 'tiancai' : Object.entries(fantong?.kinds ?? {}).find(([k, v]) => !k.startsWith('_') && v?.items?.includes(i.id))?.[0] ?? 'junk');
/* A thing's 品阶 to the 饭桶 (fantong.json tiers: 0 凡物 … 4). */
const gradeOf = (i, fantong) => Number(Object.entries(fantong?.tiers ?? {}).find(([k, ids]) => /^\d$/.test(k) && ids.includes(i.id))?.[0] ?? 0);

/* A 储物袋's slots by its 品 (items.json `pin`): base × step^(品−1). */
export const pouchSlots = (P, i) => (P && i?.pin ? P.base * P.step ** (i.pin - 1) : null);

/* A thing's price in minutes of income at its own level, by its class (master.economy.prices; null: a class with no price). */
export function minutesOf(raw, i, { fantong, cards, effects, ladder }) {
  const C = raw.master.economy.prices, X = raw.master.xiuwei, W = worldOf(raw), e = effects[i.id] ?? i.effect ?? {};
  const bt = raw.master.breakthrough, items = Object.values(ladder?.breakthrough?.pill?.items ?? {}).flat();
  const cost = id => (cards ?? []).find(c => c.id === id)?.cost ?? 0;
  if (i.kind === 'pill') {
    // A pill a breakthrough reaches for: its points on the throw (its own `bonus_of`, else by its 转).
    if (items.includes(i.id)) return C.breakthrough * (bt.pill.bonus_of?.[i.id] ?? zhuanBonus(bt, i.zhuan) ?? bt.pill.bonus);
    if (e.units && e.level) return C.pill_ratio * e.units / (X.board ?? 1); // its 修为 ÷ (R × board) a minute: R cancels at its level
    if (e.fight?.heal) return C.heal * e.fight.heal;
    if (e.fight?.mana) return C.mana * e.fight.mana;
    return null;
  }
  // 开炉's fuel (items.json effect `kailu: 'fuel'`, Hanli 2026-11-12): a price class of its own, minutes of income at its level.
  if (i.effect?.kailu === 'fuel') return C.fuel;
  const g = GEAR.has(i.kind) ? gearPoints(raw.master.fight?.gear, i) ?? i.effect : null;
  if (g && points(g)) return points(g) * C.gear[i.kind];
  if (i.effect?.card) return (C.card?.[i.kind] ?? C.card?.treasure ?? 0) * (cost(i.effect.card) + 1);
  if (i.kind === 'charm') return C.charm * Math.max(1, cost(i.id));
  if (i.kind === 'scroll' && i.effect?.learn) return C.scroll * (i.effect.level ?? 1);
  if (i.kind === 'pouch') return C.pouch * (pouchSlots(raw.master.economy.pouch, i) ?? 0);
  if (i.kind === 'material') { const k = materialOf(i, fantong); return C.material[k] * (k === 'tiancai' ? 1 : C.grade[gradeOf(i, fantong)] ?? 1); }
  return C[i.kind] ?? null;
}
/* A pill's points on the throw by its 转 (master.breakthrough.pill.zhuan): first + step a 转 + pin at each 品 + nine for a 九转. */
export function zhuanBonus(bt, z) {
  const Z = bt?.pill?.zhuan;
  return Z && z ? Z.first + Z.step * (z - 1) + Z.pin * Math.floor((z - 1) / 3) + (z === 9 ? Z.nine : 0) : null;
}

/* Every shop price (batch 2): minutes of income by class × I(the item's level) — `buy` where a shop sells it (a row whose buy is
   above 0: the table's shape is the declaration, its numbers are this), `sell` the buy-back share where it buys back at all. */
export function pricesOf(raw, { items, fantong, cards, effects, ladder }) {
  const E = raw.master.economy, W = worldOf(raw), out = {};
  for (const [id, p] of Object.entries(raw.prices ?? {})) {
    const i = items.find(x => x.id === id), q = { ...p };
    const m = i && q.buy > 0 ? minutesOf(raw, i, { fantong, cards, effects, ladder }) : null;
    if (q.buy > 0 && m != null) q.buy = Math.max(1, Math.round(m * incomeAt(W, i.level)));
    // The buy-back: a share of the price — where the shop buys it back at all (`sell` 0 or none: it never does).
    if (q.buy > 0 && q.sell > 0) q.sell = Math.max(1, Math.floor(q.buy * (E.sell_back_of?.[id] ?? E.sell_back) + 1e-6));
    out[id] = q;
  }
  return out;
}

/* 秘境探险's numbers (rules/mijing.mjs): the knobs as the rules read them — its 灵石 in minutes of income, × I where he
   stands when they land (rules/mijing.mjs). */
export function mijingOf(K) {
  return {
    cap_day: K.key.cap_day, drops: { ...K.key.drops }, door: K.door ?? 0, key_on: K.key.on !== false, pay: { rate: K.pay.rate, short: K.pay.short }, keep_min: K.pay.keep_min,
    hurt: { ...K.hurt }, yield: K.yield, foe_step: K.foe_step, boss_more: K.boss_more, rematch: K.rematch, td_step: K.td_step,
    wealth: { room: [...K.wealth.room], chest: [...K.wealth.chest], clear: K.wealth.clear, step: K.wealth.step },
    chest_rolls: K.chest_rolls, offer: K.offer, clear: structuredClone(K.clear),
  };
}

/* 闭关's 聚灵阵 (master.julin → balance.json `julin`, rules/seclusion.mjs): the share of the layer the 阵 holds at each level
   (`array` first + step a level, `levels` of them), and each level's price in 灵石 — level 2 `first_minutes` of 练气一层's
   income (I(1), never × economy.earn: a price), × `growth` each next; level 1 is his from the start (null). */
export function julinOf(J, raw) {
  const I1 = incomeAt(worldOf(raw), 1), n = J.levels ?? 1;
  return {
    on: Boolean(J.on), per_stone: J.per_stone, hours: J.hours, per_day: J.per_day, trickle: J.trickle,
    array: Array.from({ length: n }, (_, k) => Math.round((J.array.first + J.array.step * k) * 10000) / 10000),
    costs: Array.from({ length: n }, (_, k) => (k === 0 ? null : Math.max(1, Math.round(J.first_minutes * I1 * J.growth ** (k - 1))))),
  };
}

/* The breakthrough throw's numbers (master.breakthrough → balance.json `breakthrough`, folded onto ladder.json's at load):
   `base` by realm and `pill.by_zhuan` by 转 from their formulas, the rest as the knobs say. `tiers`: the ladder's ids. */
export function breakthroughOf(B, tiers) {
  const at = id => tiers.indexOf(id), plateau = at(B.base.plateau);
  const base = Object.fromEntries(tiers.slice(1).map(id => { const r = at(id); return [id, r === 1 ? B.base.first : B.base.start - B.base.step * (r - 2 - (plateau >= 0 && r >= plateau ? 1 : 0))]; }));
  const { zhuan, ...pill } = B.pill;
  return {
    base, floor: B.floor, cap: B.cap, low: B.low,
    pill: { ...structuredClone(pill), by_zhuan: Object.fromEntries(Array.from({ length: 9 }, (_, k) => [String(k + 1), zhuanBonus(B, k + 1)])) },
    body: { ...B.body }, seclusion: { ...B.seclusion }, her: { ...B.her }, element: { ...B.element }, fail: { ...B.fail }, duan: { ...B.duan },
  };
}

/* A dotted path into the raw balance (`prices.yaodan-1.sell`), set. */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}
export function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }

/* The world's balance.json as the master table makes it. `ladder`: ladder.json's tiers (ids, 零层, how many steps) and its
   breakthrough's pills; `items`: items.json's (kind, level, 转, family, effect); `fantong`: its kinds and 品阶 (a material's
   class); `cards`: cards.json's (a card's cost) — read, never written. `inputsOf(read)` reads them. */
export const inputsOf = read => ({ ladder: read('ladder.json'), items: read('items.json').items, fantong: read('fantong.json'), cards: read('cards.json').cards });
export function derive(raw0, { ladder, items, fantong = null, cards = null }) {
  const raw = structuredClone(raw0), M = raw.master, gu = M.lines.gu, pp = raw.play_pay;
  // Every realm counts nine 层 (Hanli 2026-11-02: 「9层用于计算, 小, 中, 大成用于显示」) — one level each since 2026-11-10 (L =
  // realm × 9 + 层): a realm shown in 段 is display only, each of its 层 its own threshold on the curve.
  const tiers = ladder.tiers.filter(t => gu.tiers.includes(t.id)).map(t => ({ id: t.id, zero: Boolean(t.zero), steps: t.steps.zh.length }));
  const c = curveOf(M, gu, tiers);
  raw.layers = { ...raw.layers, ...c.layers };
  pp.hours = { ...c.hours };
  // Every other line's ladder (ladder.json `lines`, Hanli 2026-10-27: each line its own 修为): the same curve on its own
  // `time.first` and its own games' share (`play_pay.lines.<line>`, rules/lines.mjs reads it on that line).
  for (const [id, L] of Object.entries(M.lines).filter(([k]) => k !== 'gu' && !k.startsWith('_'))) {
    const lt = (ladder.lines?.[id]?.tiers ?? []).filter(t => L.tiers.includes(t.id)).map(t => ({ id: t.id, zero: false, steps: t.steps.zh.length }));
    if (!lt.length) continue;
    const lc = curveOf(M, L, lt);
    raw.layers = { ...raw.layers, ...lc.layers };
    Object.assign(pp.hours, lc.hours);
    pp.lines = { ...pp.lines, [id]: { games: { share: L.games.share, time: L.games.time } } };
  }
  pp.games = { share: gu.games.share, time: gu.games.time };
  pp.errand = { ...pp.errand, share: gu.errand.share, time: gu.errand.time };
  // 修为 a fixed number (Hanli 2026-11-02: 「不要按照百分比给」, and the formula 「这套公式基本可以」): R · units · difficulty · gap
  // (rules/playpay.mjs xiuweiOf). `board`: a small game's on top (Hanli, confirmed 2026-11-10: ×1.5).
  const X = M.xiuwei;
  pp.xiuwei = { rate: { ...X.rate }, difficulty: { ...X.difficulty }, gap: { ...X.gap }, ...(X.board != null ? { board: X.board } : {}), ...(X.fight != null ? { fight: X.fight } : {}) };
  pp.wall = { day: X.units.wall_day };
  // An errand's work (rules/playpay.mjs errandGrant; a wall tag's minutes too): its units, the master's (2026-11-12 — it was
  // written once in play_pay by hand).
  if (X.units.errand != null) pp.errand = { ...pp.errand, minutes: X.units.errand };
  pp.chore = { ...X.units.chore };
  pp.seclusion = { night: X.units.seclusion_night };
  // A story step's 修为 (rules/playpay.mjs storyPlay, Hanli 2026-11-09): one small game's 体力 at R.
  pp.story = { units: X.units.story };
  // What a table pays where the rules build the grant from the table alone (今日传闻's step and end, a 奇遇, a 路遇): its units.
  pp.sized = { ...X.units.tables };
  // The one 修为 number written by hand (`told`, each with its why): a lump the book tells, paid as written (content.mjs toldOf).
  pp.told = structuredClone(X.told ?? {});
  delete pp.authored;
  // 闭关 is units at R now: nothing scales by the layer any more.
  delete raw.layer_pay; delete raw._layer_pay;
  // 丹药 by family at each pill's own level (batch 2, master.pills; content.mjs withBalance folds `effects` onto items.json).
  raw.pills = pillsOf(raw, { ladder, items });
  // A size pays what it is: the tables it rides on cap nothing.
  raw.pay.pill = { progress: 100000, ls: 0 };
  raw.pay.seclusion = { progress: 100000, ls: 0 };
  // 灵石 (batch 2, master.economy): I(L), and every size in minutes of income — the pay tables', a board's rank, a kind's play,
  // an errand's work, the 圆满 share, 开炉's worth by 品阶. Priced where they land (rules/playpay.mjs stonesAt).
  const E = M.economy;
  raw.economy = { earn: E.earn ?? 1, income: { ...E.income }, ...(E.pouch ? { pouch: { ...E.pouch } } : {}) };
  for (const [t, p] of Object.entries(raw.pay)) { const { wealth, ...rest } = p; raw.pay[t] = { ...rest, ls: E.tables[t] ?? 0 }; }
  raw.boards = { ...E.boards };
  pp.wealth = { ...E.play };
  const { wealth: _w, ...errand } = pp.errand;
  pp.errand = { ...errand, ls: E.errand };
  // 修为 past the cap → 灵石 (Hanli 2026-11-12: every source, so no `tables` list): 灵石 a 修为 = share × I(L) ÷ (R(L) × board),
  // read by the rules at his level (playpay.mjs convertRate) — a minute of small-game play past the cap pays `share` of a
  // minute's income. R and I share growth and realm, so it is one number at every level: share × income.first ÷ (rate.base × board).
  raw.convert = { share: E.convert_share };
  raw.kailu = { ...raw.kailu, tier: { ...E.kailu_tier }, ...(E.kailu_floor ? { grades: Object.fromEntries(Object.entries(raw.kailu.grades).map(([g, v]) => { const { floor, ...rest } = v; return [g, { ...rest, floor_ls: E.kailu_floor[g] ?? 0 }]; })) } : {}) };
  raw.prices = pricesOf(raw, { items, fantong, cards, effects: raw.pills.effects, ladder });
  if (M.duel_lend) raw.duel_lend = structuredClone(M.duel_lend);
  if (M.duel_deck) raw.duel_deck = structuredClone(M.duel_deck);
  if (M.mijing) raw.mijing = mijingOf(M.mijing);
  if (M.julin) raw.julin = julinOf(M.julin, raw);
  // 斗法 on the level (batch 3, master.fight): P(L)'s knobs for the rules (rules/power.mjs) and fight_length's cap on P.
  if (M.fight) { raw.duel_hp = { ...M.fight.duel_hp }; raw.power = { ...M.fight.power }; raw.fight_length = structuredClone(M.fight.length); }
  if (M.fight?.gear) raw.gear = Object.fromEntries(Object.entries(M.fight.gear).filter(([k]) => !k.startsWith('_')));
  // The breakthrough throw's numbers (master.breakthrough; ladder.json keeps its pills and elements).
  if (M.breakthrough) raw.breakthrough = breakthroughOf(M.breakthrough, ladder.tiers.map(t => t.id));
  // 冷却事件 (rules/events.mjs): a completion pays `batch_plays` plays of its table, spread over its `batch` fights.
  for (const [id, E] of Object.entries(M.events ?? {}).filter(([k]) => !k.startsWith('_'))) {
    if (E.batch_plays != null && raw.events?.[id]?.batch) raw.events[id].fight_scale = Math.round((E.batch_plays / raw.events[id].batch) * 10000) / 10000;
  }
  for (const o of raw.overrides ?? []) setPath(raw, o.path, structuredClone(o.value));
  return raw;
}

/* What changed, path by path (numbers and arrays of numbers whole). */
export function diffOf(a, b, path = '', out = []) {
  if (path.split('.').at(-1)?.startsWith('_')) return out;
  const leaf = x => x == null || typeof x !== 'object' || (Array.isArray(x) && x.every(v => typeof v !== 'object'));
  if (leaf(a) || leaf(b)) { if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path: path.slice(1), was: a, now: b }); return out; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffOf(a[k], b[k], `${path}.${k}`, out);
  return out;
}

/* A line beside the book's own (今, Hanli 2026-10-27: each line its own 修为): its boards are its whole 修为, so its pace is
   the book's 今 boards played in order. `lineWalk(content, line, stars)` plays them (each at `stars`, its first play, on the
   line's own ladder) and says where he ends and where each 回 leaves him — the walk the line's `time.first` is solved on
   (tools/balance.mjs --solve: a reader at `solve.stars` ends `solve.end` layers up). `walk`: tools/balance.mjs bookWalk. */
export function lineWalk(content, line, walk, stars, { lineGrant, linePay, lineStart, now }) {
  const tasks = walk.filter(w => w.line === line);
  const s = { lang: 'zh', plays: null, lines: { [line]: lineStart(content, line) } }, huis = [];
  const tiers = content.ladder.lines[line].tiers, climbed = () => {
    const v = s.lines[line], t = tiers.find(x => x.id === v.tier);
    return tiers.slice(0, tiers.indexOf(t)).reduce((n, x) => n + x.thresholds.length, 0) + v.step + Math.min(1, v.progress / t.thresholds[v.step]);
  };
  for (const w of tasks) {
    let row = huis.find(h => h.hui === w.hui);
    if (!row) huis.push(row = { hui: w.hui, boards: 0, minutes: 0, progress: 0 });
    for (const t of w.line_tasks ?? []) {
      const g = lineGrant(content, s, line, t.id, t, now, stars);
      const paid = g ? linePay(content, s, line, g) : null;
      row.boards += 1; row.minutes += g?.minutes ?? 0; row.progress += paid?.progress ?? 0;
    }
    Object.assign(row, { at: { ...s.lines[line] }, climbed: Math.round(climbed() * 100) / 100 });
  }
  return { end: { ...s.lines[line] }, climbed: Math.round(climbed() * 1000) / 1000, huis };
}
