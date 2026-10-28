// master.mjs — 数值系统 phase 2: the master table and what derives from it (Hanli 2026-10-27: 「以后我们调整难度, 进度可以
// 统一调整, 不必单个物品调」 · 「数值系统继续做吧」; design.md § 数值系统).
//
// balance.json `master` holds the knobs; `derive(raw)` computes every number below them from those knobs and returns the
// balance.json they make, with `overrides` (`{path, value, why}`) laid on last. tools/numbers.mjs --apply prints the diff and,
// with --write, writes it. Nothing here names a board, a beast or a 回.
//
// The knobs, per line (`master.lines.<line>`: a line is a ladder of its own — 古 now; 今 and 未来 get their own rows when
// they are built, each with its own pace):
//   need       the 层's 修为 numbers: 练气一层 `first`, ×`layer` a layer, ×`realm` into the next realm (one size a realm's
//              steps); display only — every pay is a share of the layer, so the numbers set no pace;
//   hours      a layer's play hours (the games' rate): 练气 `qi` by 层, each realm above `realm_first` + `realm_step` a realm;
//   games      the small games' and fights' share of a layer's 修为 over their share of its time;
//   errand     an errand's share over its share of the time;
//   wall       a wall's posted 杂役 (quests/wall.json): a day's tags together as a share of the layer, each tag it over
//              the wall's `posts` (rules/playpay.mjs wallGrant) — lighter than an errand: a short fetch-and-deliver chore;
//   chore      人间功课 (古-line income, Hanli 「算古线吧」): a day's and a week's chore as a share of the layer;
//   seclusion  a night of 闭关 (rewards.json seclusion `rest_hours`) as a share of the layer;
//   pills      a 修为 pill's share of the layer by 转 (named 转 between them run straight), `below` a realm past its 阶.
// `difficulty`: the fight bands (story · pool), the bot's slack. `economy`: 灵石 a minute of play (`income`), a 修为 pill's
// price in minutes of income per 1% of a layer, gear's per point by kind, the buy-back share, the 圆满 → 灵石 rate.

const round10 = (x, r = 10) => Math.round(x / r) * r;

/* The 修为 each step asks, tier by tier along the line's ladder: a first realm with 零层 (古's 练气, `zero`) from 0, one
   without (今's 新生) from its 一层; one size a realm above it. */
export function needsOf(line, tiers) {
  const N = line.need, out = {};
  let last = null;
  for (const t of tiers) {
    if (t.id === tiers[0].id) {
      const z = t.zero ? 1 : 0, row = z ? [0] : [];
      for (let l = 1; l <= t.steps - z; l++) row.push(round10(N.first * N.layer ** (l - 1), N.round));
      out[t.id] = row; last = N.first * N.layer ** (t.steps - z - 1);
      continue;
    }
    const first = last * N.realm, row = [];
    for (let k = 0; k < t.steps; k++) row.push(round10(first * N.layer ** k, N.round));
    out[t.id] = row; last = first * N.layer ** (t.steps - 1);
  }
  return out;
}

/* A layer's play hours: the first realm by 层 (its row keyed by its id — 古's `qi`, 零层 0; 今's `xinsheng`), each realm
   above one number, +`realm_step` a realm. */
export function hoursOf(line, tiers) {
  const H = line.hours, out = {};
  tiers.forEach((t, r) => { out[t.id] = r === 0 ? [...H[t.id]] : H.realm_first + H.realm_step * (r - 1); });
  out.default = H.realm_first + H.realm_step * (tiers.length - 1);
  return out;
}

/* A pill's share by 转 (一至九): the named 转, and straight between them. */
export function pillShares(P) {
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
const GEAR = new Set(['weapon', 'robe', 'pendant']);

/* Every shop price: a 修为 pill's by its share, gear's by its points, the buy-back of all; the rest as written. */
export function pricesOf(raw, items, shares) {
  const E = raw.master.economy, out = {};
  for (const [id, p] of Object.entries(raw.prices ?? {})) {
    const i = items.find(x => x.id === id), q = { ...p };
    const share = i?.kind === 'pill' && i.of && raw.master.pills_families?.includes(i.of) ? shares[(i.zhuan ?? 1) - 1] : null;
    if (q.buy > 0 && share != null) q.buy = Math.round(share * 100 * E.pill_minutes * E.income);
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
  const raw = structuredClone(raw0), M = raw.master, gu = M.lines.gu;
  const tiers = ladder.tiers.filter(t => gu.tiers.includes(t.id)).map(t => ({ id: t.id, zero: Boolean(t.zero), steps: raw.layers?.[t.id]?.length ?? (t.zero ? 10 : 3) }));
  raw.layers = { ...raw.layers, ...needsOf(gu, tiers) };
  const pp = raw.play_pay;
  pp.hours = hoursOf(gu, tiers);
  // Every other line's ladder (ladder.json `lines`, Hanli 2026-10-27: each line its own 修为): its layers and hours beside
  // 古's (its tier ids are its own), its games' share in `play_pay.lines.<line>` (rules/lines.mjs reads it on that line).
  for (const [id, L] of Object.entries(M.lines).filter(([k]) => k !== 'gu' && !k.startsWith('_'))) {
    const own = ladder.lines?.[id]?.tiers ?? [];
    const lt = own.filter(t => L.tiers.includes(t.id)).map(t => ({ id: t.id, steps: t.steps.zh.length }));
    if (!lt.length) continue;
    raw.layers = { ...raw.layers, ...needsOf(L, lt) };
    const { default: _, ...h } = hoursOf(L, lt);
    Object.assign(pp.hours, h);
    pp.lines = { ...pp.lines, [id]: { games: { share: L.games.share, time: L.games.time } } };
  }
  pp.games = { share: gu.games.share, time: gu.games.time };
  pp.errand = { ...pp.errand, share: gu.errand.share, time: gu.errand.time };
  if (gu.wall) pp.wall = { day: gu.wall.day };
  pp.chore = { ...gu.chore };
  pp.seclusion = { night: gu.seclusion.night };
  // `authored.base` stays the book's yardstick (the 练气一层 its grants were written against, 470): never `need.first`, which is
  // display only — moving it must not move what a story grant is worth.
  for (const t of ['pill']) if (!pp.authored.tables.includes(t)) pp.authored.tables.push(t);
  // 闭关 is a share now (ruling a, 2026-10-27): `layer_pay` scaled it by the layer; nothing does any more.
  delete raw.layer_pay; delete raw._layer_pay;
  const shares = pillShares(gu.pills);
  raw.pills = { families: M.pills_families, table: 'pill', share: shares, below: gu.pills.below };
  // A share pays what it is: the tables it rides on cap nothing.
  raw.pay.pill = { progress: 100000, wealth: 0 };
  raw.pay.seclusion = { progress: 100000, wealth: 0 };
  raw.convert = { ...raw.convert, rate: M.economy.convert };
  raw.prices = pricesOf(raw, items, shares);
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

/* The pace fit (`hours.fit`): every 修为 is a share of the layer, so a 回's days are the book's reading and the hours of
   the layers it holds. In the book's order, each 回 that holds layers (its stage quests' — and the ones just below them
   it grinds through; balance.mjs grindLayers) keeps the curve's hours where the fit player's days already sit inside
   its band (`model.bands`, a 回's own in `except`); else those layers' hours are scaled together until the days reach
   the near edge, `inset` inside it, and never under `floor` hours a layer. A 回 no hours can bring in (its reading alone is past the band) keeps the curve and is told.
   `content`: the world on this balance; `table`: balance.mjs's days per 回. Returns { qi, fitted, unfit }. */
export function fitHours(content, { grindLayers, table, play }) {
  const gu = content.balance.master.lines.gu, F = gu.hours.fit, M = content.balance.model, bands = M.bands;
  const qi = [...gu.hours.qi], fitted = [], unfit = [], waits = [];
  const hours = content.balance.play_pay.hours;
  const groups = [];
  let below = 1;
  for (const g of grindLayers(content)) {
    const top = Math.max(...g.layers), layers = [];
    for (let l = below; l <= top; l++) layers.push(l);
    below = top + 1;
    if (layers.length) groups.push({ hui: g.hui, layers });
  }
  const daysOf = hui => table(content).find(r => r.hui === hui)?.[F.player] ?? null;
  /* The gate rule (Hanli 2026-10-27, at 古五's 渡口: 「渡口前应该让玩家接近2层圆满, 这样渡口这里不用等太久」): the player who plays
     the book straight through (`model.session`: no nights, no 功课) comes to each gate `fit.gates` names at least `arrive`
     full of the layer it asks. Every gate's wait is on the red list (tools/numbers.mjs); this fits the ones decided. */
  const gatesOk = hui => {
    const ses = M.session ? play(content, M.session).gates.filter(g => g.hui === hui && (F.gates ?? []).includes(g.scene)) : [];
    return ses.every(g => !g.below && g.pct >= F.arrive);
  };
  for (const { hui, layers } of groups) {
    // A 回's own band where one is decided (`bands.except`), else the player's.
    const [lo, hi] = bands.except?.[hui]?.[F.player] ?? bands[F.player], want = [lo + F.inset, hi - F.inset];
    let k0 = 1;
    // The floor (`fit.floor`, Hanli 2026-10-28): no layer under it however the fit scales — a layer of a few minutes makes one
    // board half of it. Inside `set`, so the band fit and the gate rule both see the floored hours.
    const set = k => { for (const l of layers) qi[l] = Math.max(F.floor ?? 0, Math.round(gu.hours.qi[l] * k * 1000) / 1000); hours.qi = [...qi]; };
    set(1);
    const d = daysOf(hui);
    let a = F.range[0], b = F.range[1];
    // Never dearer than the curve: a 回 short of its band is short on the book, and stretching its layers would only keep
    // him waiting at its gates (Hanli 10-27: no gate may keep him where there is little to do) — told, not fitted.
    if (d != null && d < lo) unfit.push({ hui, layers, days: d, short: true, reach: [d, d] });
    else if (d != null && d > hi) {
      set(a); const da = daysOf(hui); set(b); const db = daysOf(hui);
      // The inset edge, else the band's own edge where the inset is out of reach.
      const goal = [d < want[0] ? want[0] : want[1], d < want[0] ? lo : hi].find(g => (da - g) * (db - g) <= 0);
      if (goal == null) unfit.push({ hui, layers, days: d, reach: [da, db] });
      else {
        for (let k = 0; k < 24; k++) { const m = Math.sqrt(a * b); set(m); if ((daysOf(hui) - goal) * (da - goal) > 0) a = m; else b = m; }
        k0 = Math.sqrt(a * b);
      }
    }
    set(k0);
    // …then the gate rule: the layers' hours cut further, the least that keeps every gate of the 回 short.
    let k1 = k0;
    if (!gatesOk(hui)) {
      let lo2 = F.range[0], hi2 = k0;
      set(lo2);
      if (gatesOk(hui)) { for (let k = 0; k < 20; k++) { const m = Math.sqrt(lo2 * hi2); set(m); if (gatesOk(hui)) lo2 = m; else hi2 = m; } k1 = lo2; }
      else { k1 = lo2; waits.push({ hui, layers, say: 'no hours keep its gates short: the gate waits on the book, not the pay' }); }
    }
    set(k1);
    const dn = daysOf(hui);
    if (k1 !== 1) fitted.push({ hui, layers, curve: layers.map(l => gu.hours.qi[l]), hours: layers.map(l => qi[l]), days_were: d, days: dn, gate: k1 < k0, out: dn < lo || dn > hi ? [lo, hi] : null });
  }
  return { qi, fitted, unfit, waits };
}

/* A line beside the book's own (今, Hanli 2026-10-27: each line its own 修为): its boards are its whole 修为, so its pace is
   the book's 今 boards played in order. `lineWalk(content, line, stars)` plays them (each at `stars`, its first play, on the
   line's own ladder) and says where he ends and where each 回 leaves him. `fitLine` scales the first realm's hours of the
   layers that walk reaches (`hours.fit.end`: 1.4 = 一层 filled and 二层 four tenths) until a reader at `fit.stars` ends
   there, never under `fit.floor` hours a layer. `walk`: tools/balance.mjs bookWalk. Returns { row, k, end, huis }. */
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
export function fitLine(content, line, walk, rules) {
  const L = content.balance.master.lines[line], F = L.hours.fit, first = content.ladder.lines[line].tiers[0].id;
  const curve = L.hours[first], hours = content.balance.play_pay.hours, reach = Math.ceil(F.end);
  const set = k => { hours[first] = curve.map((h, i) => (i < reach ? Math.max(F.floor ?? 0, Math.round(h * k * 1000) / 1000) : h)); };
  const at = k => { set(k); return lineWalk(content, line, walk, F.stars, rules).climbed; };
  let a = F.range[0], b = F.range[1];
  // Dearer layers climb less: the end falls as k grows. Out of reach, the nearer edge (and it is told).
  const out = at(a) < F.end ? 'short' : at(b) > F.end ? 'over' : null;
  if (!out) for (let i = 0; i < 40; i++) { const m = Math.sqrt(a * b); if (at(m) > F.end) a = m; else b = m; }
  const k = out === 'short' ? a : out === 'over' ? b : Math.sqrt(a * b);
  set(k);
  return { row: [...hours[first]], k: Math.round(k * 1000) / 1000, out, ...lineWalk(content, line, walk, F.stars, rules) };
}
