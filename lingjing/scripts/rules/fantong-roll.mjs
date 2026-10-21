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
export const kindOf = (t, id) => Object.entries(t.kinds ?? {}).find(([k, v]) => k !== '_about' && (v.items ?? []).includes(id))?.[0] ?? 'junk';
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
/* A pool row's weight: its `w`, the lean of the pot, its tier lifted by the power. */
export function rowWeight(t, row, power, counts) {
  const o = t.odds ?? {}, tier = row.item ? tierOfItem(t, row.item) : 0;
  const lean = row.lean ? 1 + (o.lean ?? 0) * (counts[row.lean] ?? 0) : 1;
  // A higher thing is rarer (`base`^t) and the power lifts it (`growth`^(t·power)) — never above an ordinary row, so at
  // the top of the power the tiers stand level and the grade alone decides.
  return (row.w ?? 1) * lean * Math.min(1, Math.pow(o.tier?.base ?? 1, tier) * Math.pow(o.tier?.growth ?? 1, tier * power));
}

/* The roll: what one pot gives. `ids` what went in, `lingshi`, `realm` (his, as a number), `press` (the lid pressed on
   a gold puff), `herHere`, `pity` (the 凡 in a row before this), `recipe` (the 方子 row this pot is, or null),
   `story` (the book's fixed pot this is, or null), `open(row)` (a pool row this save may draw; all, if not given). */
export function roll(t, { seed, ids, lingshi = 0, realm = 0, press = false, herHere = false, pity = 0, recipe = null, story = null, open = null }) {
  const u = stream(hash(seed));
  if (story) return { out: story.out, grade: 'best', story: story.id, outs: [{ out: story.out, grade: 'best' }] };
  const q = t.quirks ?? {}, quirk = u() * 100, ev = (t.events ?? []).find(e => e.id === 'yinyue');
  if (ev && herHere && quirk < (ev.chance ?? 0)) return { out: ev.out, grade: 'junk', event: ev.id, outs: [{ out: ev.out, grade: 'junk' }] };
  const off = ev && herHere ? ev.chance ?? 0 : 0;
  if (quirk >= off && quirk < off + (q.refuse ?? 0)) return { refused: true, outs: [] };
  const twin = quirk >= off + (q.refuse ?? 0) && quirk < off + (q.refuse ?? 0) + (q.twin ?? 0);
  const counts = {};
  for (const x of ids) counts[kindOf(t, x)] = (counts[kindOf(t, x)] ?? 0) + 1;
  const power = powerOf(t, { tier: potTier(t, ids), realm, lingshi });
  const one = (pityNow) => {
    let grade = weighted(u(), gradeWeights(t, recipe ? 0 : power, recipe?.grades ?? t.odds?.grades));
    const pickU = u(), withU = u(), nU = u();
    if (pityNow && grade === 'junk') grade = 'useful';
    if (press) grade = GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(grade) + 1)];
    // A 方子 may give more than one (`n`: 古八's 九节聚气, 「滚出三颗丹来」).
    if (recipe && grade !== 'junk') return { out: grade === 'useful' ? recipe.out : recipe.best, grade, recipe: recipe.id, ...(recipe.n > 1 ? { n: recipe.n } : {}) };
    // Down a grade when nothing of it is open yet for this save (never up: a pot never gives more than it rolled).
    for (let g = GRADES.indexOf(grade); g >= 0; g--) {
      const rows = (t.pools?.[GRADES[g]] ?? []).filter(r => !open || open(r));
      if (!rows.length) continue;
      const row = weighted(pickU, rows.map(r => [r, rowWeight(t, r, power, counts)]));
      const n = row.wealth ? row.wealth[0] + Math.floor(nU * (row.wealth[1] - row.wealth[0] + 1)) : row.n ?? 1;
      return { out: row.item ?? LINGSHI, ...(row.wealth ? { wealth: n } : n > 1 ? { n } : {}), grade: GRADES[g],
        ...(row.with && withU * 100 < (row.with_chance ?? 100) ? { with: row.with } : {}) };
    }
    return { out: LINGSHI, wealth: 1, grade: 'junk' };
  };
  const first = one(pity >= (t.pity?.after ?? Infinity));
  const outs = [first, ...(twin ? [one(false)] : [])];
  return { ...first, outs, power, ...(twin ? { twin: true } : {}) };
}

/* The exact odds of one pot's first output, before the quirks and the 方子 (the tests' and the tuning's view of
   roll): item id → chance, and grade → chance. */
export function odds(t, { ids, lingshi = 0, realm = 0, press = false, pity = 0, open = null }) {
  const counts = {};
  for (const x of ids) counts[kindOf(t, x)] = (counts[kindOf(t, x)] ?? 0) + 1;
  const power = powerOf(t, { tier: potTier(t, ids), realm, lingshi });
  const gw = gradeWeights(t, power), total = gw.reduce((n, [, w]) => n + w, 0);
  const rolled = Object.fromEntries(GRADES.map(g => [g, 0]));
  for (const [g, w] of gw) {
    let k = GRADES.indexOf(g);
    if (pity >= (t.pity?.after ?? Infinity) && k === 0) k = 1;
    if (press) k = Math.min(GRADES.length - 1, k + 1);
    rolled[GRADES[k]] += w / total;
  }
  const items = {}, grades = Object.fromEntries(GRADES.map(g => [g, 0]));
  for (const [g, p] of Object.entries(rolled)) {
    if (!p) continue;
    for (let k = GRADES.indexOf(g); k >= 0; k--) {
      const rows = (t.pools?.[GRADES[k]] ?? []).filter(r => !open || open(r));
      if (!rows.length) continue;
      const ws = rows.map(r => rowWeight(t, r, power, counts)), sum = ws.reduce((a, b) => a + b, 0);
      rows.forEach((r, i) => { const id = r.item ?? LINGSHI; items[id] = (items[id] ?? 0) + p * ws[i] / sum; });
      grades[GRADES[k]] += p;
      break;
    }
  }
  return { items, grades, power };
}
