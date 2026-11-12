// rules/fantong-roll.mjs — the 饭桶's roll, pure: no imports, no save, no files. rules/fantong.mjs plays it on a
// save (gating the pools by the 回, the beasts beaten, the once-things, the 卷); the 游戏厅's sample (games/kailu.js)
// plays it in the browser on the bare table. Same seed, same pot, same thing — on either side. Its one import is the pure
// I(L) (rules/income.mjs, batch 2): what a thing is worth to the pot, at its level. The pool a roll draws from is the item book itself
// (items.json), put together by `bookRows` in withWorth: every thing a player may hold, less what must never come out
// (fantong.json `never.out`), the 饭桶-only things (items.json `only: 'fantong'`) at the weights `book.only` gives them.
import { incomeOf, realmOfLevel } from './income.mjs';

export const GRADES = ['junk', 'useful', 'rare', 'best'];
export const LINGSHI = 'lingshi'; // the 灵石: a pot's input; never its output since 2026-11-12 (an old save's 图鉴 may still hold the name)
/* THE GRADE ROLLED vs THE GRADE SHOWN (Hanli 2026-11-12: a 逆天 that was only 124 灵石, 「新!」 on it, and a 储物袋 with no 逆天
   thing in it). `grade` is what the dice said — pity, 压盖, the odds and the tests all read that. `shown` (on every out)
   is what the player is TOLD: the grade of what actually came out. The 饭桶 never gives 灵石: a pot with nothing within
   reach at any grade gives its humblest own thing, told as an ordinary grade (ordinaryOf). */
export const shownOf = o => o.shown ?? o.grade; // an out's told grade (recipes, the story's pot and her gag carry no `shown`: theirs is the grade)
export const ordinaryOf = grade => GRADES[Math.min(Math.max(0, GRADES.indexOf(grade)), 1)]; // 凡 or 有用, never above

/* ── The roll's dice: a small stable hash and a seeded stream — no Math.random. ── */
export function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/* One of `rows` ([key, weight]) by weight. */
export function weighted(u, rows) {
  const total = rows.reduce((n, [, w]) => n + Math.max(0, w), 0);
  let at = u * total;
  for (const [key, w] of rows) { if ((at -= Math.max(0, w)) < 0) return key; }
  return rows.at(-1)[0];
}

/* ── The table read ── */
/* What a thing is, for the pot (fantong.json `kinds`): a kind that lists it, else the kind whose `item_kinds` holds its
   items.json kind, else junk. `info(id)` → { kind, sell } (the rules hand it in from items.json; without it, only the
   listed things are known). */
export function kindOf(t, id, info = null) {
  const kinds = Object.entries(t.kinds ?? {}).filter(([k]) => k !== '_about');
  const listed = kinds.find(([, v]) => (v.items ?? []).includes(id));
  if (listed) return listed[0];
  const k = info?.(id)?.kind;
  return (k && kinds.find(([, v]) => (v.item_kinds ?? []).includes(k))?.[0]) ?? 'junk';
}
export const MIXED = 'mixed';
/* The family a kind leads to (its `family`; a kind with none is a mixed handful). */
export const familyOfKind = (t, kind) => t.kinds?.[kind]?.family ?? MIXED;
/* The family most of a handful leads to — one ahead of every other; a tie is a mixed handful. The board says it before
   开炉 (games/kailu.js, the same rule on the brief's `fam`). */
export function leadOf(counts) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  return rows[1] && rows[1][1] === rows[0][1] ? MIXED : rows[0][0];
}
export function familyOf(t, ids, info = null) {
  const n = {};
  for (const id of ids) { const f = familyOfKind(t, kindOf(t, id, info)); n[f] = (n[f] ?? 0) + 1; }
  return leadOf(n) ?? MIXED;
}
const TIERS = new WeakMap();
/* 品阶 of a thing (fantong.json `tiers`), 0 when unlisted. */
export function tierOfItem(t, id) {
  if (!TIERS.has(t)) {
    const m = new Map();
    for (const [n, ids] of Object.entries(t.tiers ?? {})) if (n !== '_about') for (const x of ids) m.set(x, Number(n));
    TIERS.set(t, m);
  }
  return TIERS.get(t).get(id) ?? 0;
}
const potTier = (t, ids) => Math.max(0, ...ids.map(id => tierOfItem(t, id)));
/* The pot's power: what went in, who feeds it, the 灵石 (fantong.json odds.power). */
export function powerOf(t, { tier = 0, realm = 0, lingshi = 0 }) {
  const p = t.odds?.power ?? {};
  return (p.in ?? 1) * tier + (p.realm ?? 0) * realm + stonePower(p, lingshi);
}
/* The 灵石's share of the power: `lingshi` × ln(1 + 灵石) — each stone lifts the pot less than the one before. */
export const stonePower = (p, n) => (n > 0 ? (p.lingshi ?? 0) * Math.log1p(n) : 0);

/* The grade weights at a power: base × growth^power. */
export function gradeWeights(t, power, base = t.odds?.grades) {
  const g = t.odds?.growth ?? {};
  return GRADES.filter(k => base?.[k] != null).map(k => [k, (base[k] ?? 0) * Math.pow(g[k] ?? 1, power)]);
}

/* ── Worth (balance.json `kailu`, folded in as `t.worth`): what a thing would sell for, in 灵石 — its shop `sell`, else
   its 品阶's `worth.tier` (a story pill no shop buys is still worth its tier). A pot is worth what went in plus its 灵石;
   the grade rolled asks for an output worth `x` times that (at least its `floor`), so a pot of junk always gives
   something and a pot of good things gives about their worth back — never a farm. ── */
const lsWorth = t => t.worth?.lingshi ?? 1;
/* Its worth: its shop `sell`, else what the table knows of it (`item_info.worth`: a shop's thing the shop does not buy back, its
   `buy` less the buy-back share; else its 品阶's minutes × I(its level), batch 2, withWorth), else its 品阶's `worth.tier` as
   a number of 灵石. */
export function worthOf(t, id, info = null) {
  if (id === LINGSHI) return lsWorth(t);
  const i = info?.(id), sell = i?.sell;
  return sell > 0 ? sell : i?.worth ?? t.worth?.tier?.[tierOfItem(t, id)] ?? 0;
}
export const potWorth = (t, ids, lingshi = 0, info = null) => ids.reduce((n, id) => n + worthOf(t, id, info), 0) + lingshi * lsWorth(t);
/* A grade's floor: minutes of income at the pot's level (`floor_ls`, batch 2), else a number of 灵石 (`floor`). */
const floorOf = (t, grade) => { const g = t.worth?.grades?.[grade] ?? {}; return g.floor_ls != null ? g.floor_ls * (t.worth?.income ?? 1) : g.floor ?? 0; };
export function targetOf(t, grade, worth) {
  const g = t.worth?.grades?.[grade] ?? {};
  return Math.max(floorOf(t, grade), worth * (g.x ?? 1));
}
/* A row's worth: its own `worth` when the table sets one (a rare thing the shops never price), else its thing's × `n`. */
export const rowWorth = (t, row, info = null) => row.worth ?? worthOf(t, row.item, info) * (row.n ?? 1);
/* A row's weight for a target: its `w`, by how near its worth stands to the target (log scale, `worth.spread`);
   nothing past `worth.reach` times either way. */
export function rowWeight(t, row, target, info = null) {
  const W = t.worth ?? {}, d = Math.log((rowWorth(t, row, info) + 1) / (target + 1));
  if (Math.abs(d) > Math.log(W.reach ?? 3) + 1e-9) return 0;
  return (row.w ?? 1) * Math.exp(-(d * d) / (2 * (W.spread ?? 0.6) ** 2));
}
/* The rows a family draws from: the item book's (`t.book.rows`, withWorth), those of the families it `draw`s on, open for
   this save; when none is within reach, its `then`. Returns the [row, weight] list of the first family in that chain that has
   one, or null. A pot reaches no thing above the realm after its own (`worth.reach_level`, withPotIncome: a pot of 练气 things
   draws to 筑基's top, never a 卷八 琅玕 at its 卷's worth — batch 2). `beyond`: the GLIMPSE's rows — the things above that
   level, and only those (`open(row, true)`: the save's 卷 gate is lifted for them, nothing else). */
export function rowsFor(t, family, target, open = null, info = null, keep = null, beyond = false) {
  const tried = new Set(), top = t.worth?.reach_level ?? Infinity;
  for (let f = family; f && !tried.has(f); f = t.families?.[f]?.then) {
    tried.add(f);
    const draw = t.families?.[f]?.draw ?? [f];
    const rows = (t.book?.rows ?? []).filter(r => draw.includes(r.family) && ((r.level ?? 1) > top) === beyond && (!open || open(r, beyond)) && (!keep || keep(r)));
    const ws = rows.map(r => [r, rowWeight(t, r, target, info)]).filter(([, w]) => w > 0);
    if (ws.length) return { family: f, rows: ws };
  }
  return null;
}
/* THE GLIMPSE (Hanli 2026-11-12: 「可以把未来出现的物品, 让饭桶有机会先开出来, 给个惊喜, 或者预告」): with a small chance
   (`odds.glimpse`) a roll gives ONE thing from further on than the pot reaches — its worth still near what the grade asks (a
   preview, never a windfall: only the level ceiling is lifted, not the worth window), shown as what it is. */
const glimpseOf = t => t.odds?.glimpse ?? 0;
/* A TOP ROLL GIVES A THING (Hanli 2026-11-12: 90 灵石 and three pieces of gear rolled 逆天, and 124 灵石 came back).
   A roll of 珍品 or 逆天 that finds no row of its own grade within reach takes the rows within reach of the next grade down
   (珍品, then 有用, then 凡) — none worth more than twice the pot (`FALLBACK_X`: no farm) — and gives a whole number of them
   that brings the worth near the rolled grade's `floor`, never past that twice. Only a pot with no thing in reach at any
   grade gives its humblest own thing (`humblest`). Same stream, same draws: the pick and the count use the dice the plain
   row would have. The thing is shown at ITS grade. */
export const FALLBACK_X = 2;
const fallbackRows = (t, family, grade, worth, open, info) => {
  if (GRADES.indexOf(grade) < 2) return null;
  const keep = r => rowWorth(t, r, info) <= worth * FALLBACK_X;
  for (let k = GRADES.indexOf(grade) - 1; k >= 0; k--) {
    const got = rowsFor(t, family, targetOf(t, GRADES[k], worth), open, info, keep);
    if (got) return { ...got, shown: GRADES[k], rolled: grade };
  }
  return null;
};
/* How many of a fallback row: its worth near the rolled grade's floor, at least one, and (with its count) within twice the pot. */
const fallbackCount = (t, row, grade, worth, info) => {
  const w = rowWorth(t, row, info);
  return w > 0 ? Math.max(1, Math.min(Math.floor(worth * FALLBACK_X / w), Math.round(floorOf(t, grade) / w))) : 1;
};
/* Nothing within reach anywhere: the humblest of the 饭桶's own things (items.json `only: 'fantong'`) — never 灵石. */
const humblest = (t, open, info) => {
  const rows = (t.book?.rows ?? []).filter(r => r.only && (!open || open(r, false)));
  return rows.reduce((low, r) => (!low || rowWorth(t, r, info) < rowWorth(t, low, info) ? r : low), null);
};

/* The pot's level is its highest thing's (items.json `level`, as its 品阶 is its highest — potTier), and its floors are minutes
   of I there (batch 2): what comes out follows what went in, never where he stands, so a pot of low things never pays a high
   level's worth (no farm). */
const withPotIncome = (t, ids, info) => {
  const x = t.worth?.income_of;
  if (!x) return t;
  const L = Math.max(1, ...ids.map(id => info?.(id)?.level ?? 1));
  return { ...t, worth: { ...t.worth, income: incomeOf(x, L), reach_level: (realmOfLevel(L) + 2) * 9 } };
};

/* The roll: what one pot gives. `ids` what went in, `lingshi`, `realm` (his, as a number), `press` (the lid pressed on
   a gold puff), `lift` (a thing that clears the furnace, spent on this pot), `herHere`, `pity` (the 凡 in a row before this), `recipe` (the 方子 row this pot is, or null),
   `story` (the book's fixed pot this is, or null), `open(row, beyond)` (a pool row this save may draw — `beyond`: for the
   glimpse; all, if not given), `info(id)` → { kind, sell } (items.json, for the kinds and the worth). */
export function roll(t0, { seed, ids, lingshi = 0, realm = 0, press = false, lift = false, herHere = false, pity = 0, recipe = null, story = null, open = null, info = null }) {
  info ??= infoOfTable(t0);
  const t = withPotIncome(t0, ids, info);
  const u = stream(hash(seed));
  if (story) return { out: story.out, grade: 'best', story: story.id, outs: [{ out: story.out, grade: 'best' }] };
  const q = t.quirks ?? {}, quirk = u() * 100, ev = (t.events ?? []).find(e => e.id === 'yinyue');
  if (ev && herHere && quirk < (ev.chance ?? 0)) return { out: ev.out, grade: 'junk', event: ev.id, outs: [{ out: ev.out, grade: 'junk' }] };
  const off = ev && herHere ? ev.chance ?? 0 : 0;
  if (quirk >= off && quirk < off + (q.refuse ?? 0)) return { refused: true, outs: [] };
  const twin = quirk >= off + (q.refuse ?? 0) && quirk < off + (q.refuse ?? 0) + (q.twin ?? 0);
  const power = powerOf(t, { tier: potTier(t, ids), realm, lingshi });
  const family = familyOf(t, ids, info), worth = potWorth(t, ids, lingshi, info);
  let glimpsed = false; // one glimpse to a pot, the twin's included
  const one = (pityNow) => {
    let grade = weighted(u(), gradeWeights(t, recipe ? 0 : power, recipe?.grades ?? t.odds?.grades));
    const pickU = u(), withU = u(), nU = u(), glimpseU = u(), glimpsePickU = u(); // (the glimpse's dice come after the roll's own)
    if (pityNow && grade === 'junk') grade = 'useful';
    if (press) grade = GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(grade) + 1)];
    // A furnace swept clean (items.json effect `kailu: 'lift'`, a 人间功课's 净炉符): one notch more, as a press is.
    if (lift) grade = GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(grade) + 1)];
    // A 方子 may give more than one (`n`: 古八's 九节聚气, 「滚出三颗丹来」).
    if (recipe && grade !== 'junk') return { out: grade === 'useful' ? recipe.out : recipe.best, grade, recipe: recipe.id, ...(recipe.n > 1 ? { n: recipe.n } : {}) };
    const target = targetOf(t, grade, worth);
    const far = !recipe && !glimpsed && glimpseU < glimpseOf(t) ? rowsFor(t, family, target, open, info, null, true) : null;
    if (far) {
      glimpsed = true;
      const row = weighted(glimpsePickU, far.rows);
      return { out: row.item, grade, shown: grade, family: far.family, glimpse: true };
    }
    const plain = rowsFor(t, family, target, open, info), fb = plain ? null : fallbackRows(t, family, grade, worth, open, info);
    const got = plain ?? fb;
    // Nothing within reach: the humblest thing of the bucket's own, told as an ordinary grade.
    if (!got) return { out: humblest(t, open, info)?.item ?? null, grade, shown: ordinaryOf(grade), family, humble: true };
    const row = weighted(pickU, got.rows);
    const n = (row.n ?? 1) * (fb ? fallbackCount(t, row, grade, worth, info) : 1);
    return { out: row.item, ...(n > 1 ? { n } : {}), grade, shown: fb ? fb.shown : grade, family: got.family,
      ...(row.with && withU * 100 < (row.with_chance ?? 100) ? { with: row.with } : {}) };
  };
  const first = one(pity >= (t.pity?.after ?? Infinity));
  const outs = [first, ...(twin ? [one(false)] : [])].filter(o => o.out);
  return { ...first, outs, power, family, worth, ...(twin ? { twin: true } : {}) };
}

/* The exact odds of one pot's first output, before the quirks and the 方子 (the tests' and the tuning's view of
   roll): item id → chance, grade → chance, the family it leans to, what went in is worth (`worth`) and what comes out
   is worth on average (`value`, 灵石; tools/numbers.mjs weighs the two). The glimpse is counted: its share of each grade's
   draws goes to the things above the pot's reach, where there are any within reach of the grade's worth. */
export function odds(t0, { ids, lingshi = 0, realm = 0, press = false, pity = 0, open = null, info = null }) {
  info ??= infoOfTable(t0);
  const t = withPotIncome(t0, ids, info);
  const power = powerOf(t, { tier: potTier(t, ids), realm, lingshi });
  const family = familyOf(t, ids, info), worth = potWorth(t, ids, lingshi, info);
  const gw = gradeWeights(t, power), total = gw.reduce((n, [, w]) => n + w, 0);
  const rolled = Object.fromEntries(GRADES.map(g => [g, 0]));
  for (const [g, w] of gw) {
    let k = GRADES.indexOf(g);
    if (pity >= (t.pity?.after ?? Infinity) && k === 0) k = 1;
    if (press) k = Math.min(GRADES.length - 1, k + 1);
    rolled[GRADES[k]] += w / total;
  }
  const items = {}, grades = Object.fromEntries(GRADES.map(g => [g, 0]));
  let value = 0;
  const give = (got, p, count = () => 1) => {
    const sum = got.rows.reduce((a, [, w]) => a + w, 0);
    for (const [r, w] of got.rows) { items[r.item] = (items[r.item] ?? 0) + p * w / sum; value += p * (w / sum) * rowWorth(t, r, info) * count(r); }
  };
  for (const [g, p] of Object.entries(rolled)) {
    if (!p) continue;
    grades[g] += p;
    const target = targetOf(t, g, worth), plain = rowsFor(t, family, target, open, info), fb = plain ? null : fallbackRows(t, family, g, worth, open, info);
    const far = glimpseOf(t) ? rowsFor(t, family, target, open, info, null, true) : null, share = far ? glimpseOf(t) : 0;
    if (far) give(far, p * share);
    const got = plain ?? fb;
    if (!got) {
      const low = humblest(t, open, info);
      if (low) { items[low.item] = (items[low.item] ?? 0) + p * (1 - share); value += p * (1 - share) * rowWorth(t, low, info); }
      continue;
    }
    give(got, p * (1 - share), r => (fb ? fallbackCount(t, r, g, worth, info) : 1));
  }
  return { items, grades, power, family, worth, value };
}

/* ── The world's pieces the roll reads, put together the same way on both sides ── */
/* THE ITEM BOOK AS THE POOL (Hanli 2026-11-12: 「游戏物品有个池子吗? 直接用来作为饭桶的池子吧」): every thing items.json holds,
   less what must never come out — fantong.json `never.out` (its kinds, its things), the book's own fixed pots (`recipes.story`
   in and out), a thing the story flags `story` unless `book.gates` lets the bucket give it from a 回 on. The 饭桶-only things
   (items.json `only: 'fantong'`) are always in, at the weights `book.only` gives them. A row: its thing, the family its kind
   leads to, its weight (the kind's `weight`, else 1), its level (the glimpse's ceiling) and its gates (`book.gates`: hui · beast ·
   after · breach). `infoOf(id)` → { kind } (the table's own kindOf). */
export const outBarred = (t, item) => {
  const N = t.never?.out ?? {}, gates = t.book?.gates ?? {};
  const story = (t.recipes?.story?.list ?? []).some(r => r.out === item.id || r.in.includes(item.id));
  return (N.kinds ?? []).includes(item.kind) || (N.items ?? []).includes(item.id) || story || Boolean(item.story && !gates[item.id]);
};
export function bookRows(t, items, infoOf) {
  const B = t.book ?? {}, own = new Map((B.only ?? []).map(r => [r.item, r]));
  return items.filter(i => own.has(i.id) || (!i.only && !outBarred(t, i))).map(i => {
    const kind = kindOf(t, i.id, infoOf), mine = own.get(i.id), { item, ...rest } = mine ?? {};
    const worth_ls = mine?.worth_ls ?? B.worth_ls?.[i.id];
    return { item: i.id, kind, family: familyOfKind(t, kind), level: i.level ?? 1, w: t.kinds?.[kind]?.weight ?? 1, ...(B.gates?.[i.id] ?? {}),
      ...rest, ...(mine ? { only: true } : {}), ...(worth_ls != null ? { worth_ls } : {}) };
  });
}
/* The table with its worth (balance.json `kailu`) and what it knows of each thing (`item_info`: id → { kind, sell },
   the shop's `sell` from balance.json `prices`): content.mjs withBalance folds both in; the 游戏厅's sample does the same. */
export function withWorth(t, balance, items = null) {
  if (!t) return t;
  // What each thing is worth to the pot (batch 2): its shop `sell`, else — a shop's thing the shop does not buy back — its
  // `buy` less the buy-back share, else its 品阶's minutes (balance.json kailu.tier) × I(its level); a row's own worth
  // (`worth_ls`, a rare thing the shops never price) its minutes × I(its thing's level).
  const x = balance?.economy?.income ?? null, tierM = balance?.kailu?.tier ?? {}, lv = new Map((items ?? []).map(i => [i.id, i.level ?? 1]));
  const back = balance?.master?.economy?.sell_back ?? 1 / 3;
  const of = (id, m) => (x ? Math.round(m * incomeOf(x, lv.get(id) ?? 1)) : m);
  const tbl = { ...t, ...(balance?.kailu ? { worth: { ...balance.kailu, earn: balance?.economy?.earn ?? 1, ...(x ? { income: incomeOf(x, 1), income_of: x } : {}) } } : {}) };
  const info = items ? Object.fromEntries(items.map(i => {
    const sell = balance?.prices?.[i.id]?.sell ?? i.sell ?? 0, buy = balance?.prices?.[i.id]?.buy ?? i.buy ?? 0;
    const worth = sell > 0 ? null : buy > 0 ? Math.max(1, Math.round(buy * back)) : x ? of(i.id, tierM[tierOfItem(tbl, i.id)] ?? 0) : null;
    return [i.id, { kind: i.kind, sell, level: i.level ?? 1, ...(worth != null ? { worth } : {}) }];
  })) : t.item_info;
  const rows = items && t.book ? bookRows(tbl, items, id => info[id]).map(r => (r.worth_ls != null ? { ...r, worth: of(r.item, r.worth_ls) } : r)) : null;
  return { ...tbl, ...(rows ? { book: { ...t.book, rows } } : {}), ...(info ? { item_info: info } : {}) };
}
const infoOfTable = t => (t.item_info ? id => t.item_info[id] ?? null : null);
