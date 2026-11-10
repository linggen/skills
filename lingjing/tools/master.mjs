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

/* A pill's nights of 闭关 by 转 (一至九): the named 转, and straight between them. */
export function pillNights(P) {
  const named = Object.entries(P).filter(([k]) => /^\d$/.test(k)).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let z = 1; z <= 9; z++) {
    const lo = [...named].reverse().find(([k]) => k <= z) ?? named[0], hi = named.find(([k]) => k >= z) ?? named.at(-1);
    const v = lo[0] === hi[0] ? lo[1] : lo[1] + ((hi[1] - lo[1]) * (z - lo[0])) / (hi[0] - lo[0]);
    out.push(Math.round(v * 10000) / 10000);
  }
  return out;
}

const points = e => (e?.atk ?? 0) + (e?.def ?? 0) + Object.values(e?.ward ?? {}).reduce((a, b) => a + b, 0);
const GEAR = new Set(['weapon', 'robe', 'pendant', 'shoes']);

/* Every shop price: a 修为 pill's by its nights of 闭关, gear's by its points, the buy-back of all; the rest as written. */
export function pricesOf(raw, items, nights) {
  const E = raw.master.economy, out = {};
  for (const [id, p] of Object.entries(raw.prices ?? {})) {
    const i = items.find(x => x.id === id), q = { ...p };
    const n = i?.kind === 'pill' && i.of && raw.master.pills_families?.includes(i.of) ? nights[(i.zhuan ?? 1) - 1] : null;
    if (q.buy > 0 && n != null) q.buy = Math.round(n * E.pill_night_minutes * E.income);
    else if (q.buy > 0 && GEAR.has(i?.kind) && E.gear_minutes?.[i.kind] && points(i.effect)) q.buy = Math.round(points(i.effect) * E.gear_minutes[i.kind] * E.income);
    // The buy-back: a share of the price — where the shop buys it back at all (`sell` 0 or none: it never does).
    if (q.buy > 0 && q.sell > 0) q.sell = Math.max(1, Math.floor(q.buy * E.sell_back + 1e-6));
    out[id] = q;
  }
  return out;
}

/* 秘境探险's numbers (rules/mijing.mjs): the knobs as the rules read them, 灵石 turned from minutes of income to stones. */
export function mijingOf(K, E) {
  const ls = m => Math.max(1, Math.round(m * (E?.income ?? 3)));
  return {
    cap_day: K.key.cap_day, drops: { ...K.key.drops }, pay: { rate: K.pay.rate, short: K.pay.short }, keep_min: K.pay.keep_min,
    hurt: { ...K.hurt }, yield: K.yield, foe_step: K.foe_step, boss_more: K.boss_more, td_step: K.td_step,
    wealth: { room: K.wealth.room.map(ls), chest: K.wealth.chest.map(ls), clear: ls(K.wealth.clear), step: K.wealth.step },
    chest_rolls: K.chest_rolls, offer: K.offer, clear: structuredClone(K.clear),
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

/* The world's balance.json as the master table makes it. `ladder`: ladder.json's tiers (ids, 零层, how many steps); `items`:
   items.json's (kind, 转, family, effect) — read, never written. */
export function derive(raw0, { ladder, items }) {
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
  const nights = pillNights(gu.pills);
  // A 修为 pill is its 转's nights of 闭关 (× `play_pay.seclusion.night` units at R, content.mjs pillPay) — the cards'
  // 「抵N日打坐」 true at every layer by construction. 仙阶 (`xian`, a 阶 off the ladder: no 转): its own, by `by_tier`.
  raw.pills = { families: M.pills_families, table: 'pill', nights, ...(gu.pills.xian != null ? { by_tier: { xian: gu.pills.xian } } : {}), below: gu.pills.below };
  // A size pays what it is: the tables it rides on cap nothing.
  raw.pay.pill = { progress: 100000, wealth: 0 };
  raw.pay.seclusion = { progress: 100000, wealth: 0 };
  raw.convert = { ...raw.convert, rate: M.economy.convert };
  raw.prices = pricesOf(raw, items, nights);
  if (M.mijing) raw.mijing = mijingOf(M.mijing, M.economy);
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
