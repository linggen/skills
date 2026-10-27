// rules/fantong-roll.mjs — the 饭桶's roll, pure: no imports, no save, no files. rules/fantong.mjs plays it on a
// save (gating the pools by the 回, the beasts beaten, the once-things, the 卷); the 游戏厅's sample (games/kailu.js)
// plays it in the browser on the bare table. Same seed, same pot, same thing — on either side.

export const GRADES = ['junk', 'useful', 'rare', 'best'];
export const LINGSHI = 'lingshi'; // what a `wealth` row's output is called on the board and in the 图鉴

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
  return (p.in ?? 1) * tier + (p.realm ?? 0) * realm + (p.lingshi ?? 0) * lingshi;
}

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
export function worthOf(t, id, info = null) {
  if (id === LINGSHI) return lsWorth(t);
  const sell = info?.(id)?.sell;
  return sell > 0 ? sell : t.worth?.tier?.[tierOfItem(t, id)] ?? 0;
}
export const potWorth = (t, ids, lingshi = 0, info = null) => ids.reduce((n, id) => n + worthOf(t, id, info), 0) + lingshi * lsWorth(t);
export function targetOf(t, grade, worth) {
  const g = t.worth?.grades?.[grade] ?? {};
  return Math.max(g.floor ?? 0, worth * (g.x ?? 1));
}
/* A row's worth: its own `worth` when the table sets one (a rare thing the shops never price), else its thing's × `n`;
   a `wealth` row its middle. */
export const rowWorth = (t, row, info = null) => row.worth ?? (row.wealth ? lsWorth(t) * (row.wealth[0] + row.wealth[1]) / 2 : worthOf(t, row.item, info) * (row.n ?? 1));
/* A row's weight for a target: its `w`, by how near its worth stands to the target (log scale, `worth.spread`);
   nothing past `worth.reach` times either way. */
export function rowWeight(t, row, target, info = null) {
  const W = t.worth ?? {}, d = Math.log((rowWorth(t, row, info) + 1) / (target + 1));
  if (Math.abs(d) > Math.log(W.reach ?? 3) + 1e-9) return 0;
  return (row.w ?? 1) * Math.exp(-(d * d) / (2 * (W.spread ?? 0.6) ** 2));
}
/* The rows a family draws from: its `pools`, open for this save; when none is within reach, its `then`. Returns the
   [row, weight] list of the first family in that chain that has one, or null. */
export function rowsFor(t, family, target, open = null, info = null) {
  const tried = new Set();
  for (let f = family; f && !tried.has(f); f = t.families?.[f]?.then) {
    tried.add(f);
    const rows = (t.families?.[f]?.pools ?? [f]).flatMap(p => t.pools?.[p] ?? []).filter(r => !open || open(r));
    const ws = rows.map(r => [r, rowWeight(t, r, target, info)]).filter(([, w]) => w > 0);
    if (ws.length) return { family: f, rows: ws };
  }
  return null;
}
/* Nothing within reach anywhere: its worth in 灵石 (a thing as sold where it lay — creatures.json `_loot`'s way). */
const worthInStones = (t, target) => Math.max(1, Math.round(target / lsWorth(t)));

/* The roll: what one pot gives. `ids` what went in, `lingshi`, `realm` (his, as a number), `press` (the lid pressed on
   a gold puff), `lift` (a thing that clears the furnace, spent on this pot), `herHere`, `pity` (the 凡 in a row before this), `recipe` (the 方子 row this pot is, or null),
   `story` (the book's fixed pot this is, or null), `open(row)` (a pool row this save may draw; all, if not given),
   `info(id)` → { kind, sell } (items.json, for the kinds and the worth). */
export function roll(t, { seed, ids, lingshi = 0, realm = 0, press = false, lift = false, herHere = false, pity = 0, recipe = null, story = null, open = null, info = null }) {
  const u = stream(hash(seed));
  info ??= infoOfTable(t);
  if (story) return { out: story.out, grade: 'best', story: story.id, outs: [{ out: story.out, grade: 'best' }] };
  const q = t.quirks ?? {}, quirk = u() * 100, ev = (t.events ?? []).find(e => e.id === 'yinyue');
  if (ev && herHere && quirk < (ev.chance ?? 0)) return { out: ev.out, grade: 'junk', event: ev.id, outs: [{ out: ev.out, grade: 'junk' }] };
  const off = ev && herHere ? ev.chance ?? 0 : 0;
  if (quirk >= off && quirk < off + (q.refuse ?? 0)) return { refused: true, outs: [] };
  const twin = quirk >= off + (q.refuse ?? 0) && quirk < off + (q.refuse ?? 0) + (q.twin ?? 0);
  const power = powerOf(t, { tier: potTier(t, ids), realm, lingshi });
  const family = familyOf(t, ids, info), worth = potWorth(t, ids, lingshi, info);
  const stones = !open || open({ wealth: [1, 1] });
  const one = (pityNow) => {
    let grade = weighted(u(), gradeWeights(t, recipe ? 0 : power, recipe?.grades ?? t.odds?.grades));
    const pickU = u(), withU = u(), nU = u();
    if (pityNow && grade === 'junk') grade = 'useful';
    if (press) grade = GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(grade) + 1)];
    // A furnace swept clean (items.json effect `kailu: 'lift'`, a 人间功课's 净炉符): one notch more, as a press is.
    if (lift) grade = GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(grade) + 1)];
    // A 方子 may give more than one (`n`: 古八's 九节聚气, 「滚出三颗丹来」).
    if (recipe && grade !== 'junk') return { out: grade === 'useful' ? recipe.out : recipe.best, grade, recipe: recipe.id, ...(recipe.n > 1 ? { n: recipe.n } : {}) };
    const target = targetOf(t, grade, worth), got = rowsFor(t, family, target, open, info);
    if (!got) return stones ? { out: LINGSHI, wealth: worthInStones(t, target), grade, family } : { out: LINGSHI, wealth: 1, grade, family };
    const row = weighted(pickU, got.rows);
    const n = row.wealth ? row.wealth[0] + Math.floor(nU * (row.wealth[1] - row.wealth[0] + 1)) : row.n ?? 1;
    return { out: row.item ?? LINGSHI, ...(row.wealth ? { wealth: n } : n > 1 ? { n } : {}), grade, family: got.family,
      ...(row.with && withU * 100 < (row.with_chance ?? 100) ? { with: row.with } : {}) };
  };
  const first = one(pity >= (t.pity?.after ?? Infinity));
  const outs = [first, ...(twin ? [one(false)] : [])];
  return { ...first, outs, power, family, worth, ...(twin ? { twin: true } : {}) };
}

/* The exact odds of one pot's first output, before the quirks and the 方子 (the tests' and the tuning's view of
   roll): item id → chance, grade → chance, the family it leans to, what went in is worth (`worth`) and what comes out
   is worth on average (`value`, 灵石; tools/numbers.mjs weighs the two). */
export function odds(t, { ids, lingshi = 0, realm = 0, press = false, pity = 0, open = null, info = null }) {
  info ??= infoOfTable(t);
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
  const stones = !open || open({ wealth: [1, 1] });
  const items = {}, grades = Object.fromEntries(GRADES.map(g => [g, 0]));
  let value = 0;
  for (const [g, p] of Object.entries(rolled)) {
    if (!p) continue;
    grades[g] += p;
    const target = targetOf(t, g, worth), got = rowsFor(t, family, target, open, info);
    if (!got) { items[LINGSHI] = (items[LINGSHI] ?? 0) + p; value += p * (stones ? worthInStones(t, target) : 1) * lsWorth(t); continue; }
    const sum = got.rows.reduce((a, [, w]) => a + w, 0);
    for (const [r, w] of got.rows) { const id = r.item ?? LINGSHI; items[id] = (items[id] ?? 0) + p * w / sum; value += p * (w / sum) * rowWorth(t, r, info); }
  }
  return { items, grades, power, family, worth, value };
}

/* ── The world's pieces the roll reads, put together the same way on both sides ── */
/* The table with its worth (balance.json `kailu`) and what it knows of each thing (`item_info`: id → { kind, sell },
   the shop's `sell` from balance.json `prices`): content.mjs withBalance folds both in; the 游戏厅's sample does the same. */
export function withWorth(t, balance, items = null) {
  if (!t) return t;
  const info = items ? Object.fromEntries(items.map(i => [i.id, { kind: i.kind, sell: balance?.prices?.[i.id]?.sell ?? i.sell ?? 0 }])) : t.item_info;
  return { ...t, ...(balance?.kailu ? { worth: balance.kailu } : {}), ...(info ? { item_info: info } : {}) };
}
const infoOfTable = t => (t.item_info ? id => t.item_info[id] ?? null : null);
