// rules/fantong.mjs — 喂饭桶 · 开炉: up to three things and 0–3 灵石 into the 饭桶, a press on the lid, and it
// spits something out. Part of the rules engine; rules.mjs is its one door.
//
// Everything is the world's table (worlds/<id>/fantong.json): what is needed to play (`needs`), the limit
// (`limit.cooldown_min` and/or `limit.per_day`), the 凡物 always at hand (`around`), what never goes in
// (`never`), each thing's 品阶 (`tiers`), the lean of each kind (`kinds`), the odds (`odds`: four grades,
// lifted smoothly by power — the pot's tier, his realm, the 灵石), the pools, the pity, the quirks, the
// 方子 (`recipes`, `pages`), the book's fixed outputs (`recipes.story`) and the 银月 gag (`events`). No item id
// is named here. The roll is the rules', seeded by the day, the save's feed count, what went in and the 灵石 —
// never the press (the page's timing result), so timing can't re-roll; the press only lifts the grade a
// notch. The page only shows (games/kailu.js): every output carries its name and one line of small print
// (`hint`), never its effect.
import { dayKey, itemName, pick } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf, questDoneBefore } from './errands.mjs';
import { huiNow, huiOrder } from './hui.mjs';
import { isLocked } from './locks.mjs';
import { freeSlot, hasFound, pouchBrief, stow, storedLine } from './pouch.mjs';

export const GRADES = ['junk', 'useful', 'rare', 'best'];
const LINGSHI = 'lingshi'; // what a `wealth` row's output is called on the board and in the 图鉴
const tableOf = content => content.fantong ?? null;
const wordsOf = (t, lang) => t.words?.[lang] ?? t.words?.zh ?? {};
const fill = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/* Free play opens when he holds the thing `needs` names (the 小铜炉 · 饭桶, 古四). */
export const fantongOpen = (content, state) => {
  const t = tableOf(content);
  return Boolean(t && (state.bag?.[t.needs?.item] ?? 0) > 0);
};

/* ── The roll's dice: a small stable hash and a seeded stream — no Math.random. ── */
function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/* One of `rows` ([key, weight]) by weight. */
function weighted(u, rows) {
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
/* His realm as a number: a whole realm counts `realm_per_tier`, a step inside it its share (练气九层 2.7, 筑基 3+). */
export function realmOf(content, state, t = tableOf(content)) {
  const per = t?.odds?.realm_per_tier ?? 3, tiers = content.ladder?.tiers ?? [];
  const at = Math.max(0, tiers.findIndex(x => x.id === state.tier));
  const steps = Math.max(1, tiers[at]?.thresholds?.length ?? 1);
  return per * (at + Math.min(1, (state.step ?? 0) / steps));
}
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
function rowWeight(t, row, power, counts) {
  const o = t.odds ?? {}, tier = row.item ? tierOfItem(t, row.item) : 0;
  const lean = row.lean ? 1 + (o.lean ?? 0) * (counts[row.lean] ?? 0) : 1;
  // A higher thing is rarer (`base`^t) and the power lifts it (`growth`^(t·power)) — never above an ordinary row, so at
  // the top of the power the tiers stand level and the grade alone decides.
  return (row.w ?? 1) * lean * Math.min(1, Math.pow(o.tier?.base ?? 1, tier) * Math.pow(o.tier?.growth ?? 1, tier * power));
}

/* ── What exists for this save: the 回 reached, the beasts beaten, the 卷 open, a once-thing not had ── */
function rowOpen(content, state, t, row) {
  if (!state || !content) return true; // the bare roll (tests, the 游戏厅's sample) sees every row
  if (row.hui && huiOrder(content, row.hui) > huiOrder(content, huiNow(content, state))) return false;
  if (row.beast && !(state.beasts?.[row.beast]?.won > 0)) return false;
  if (row.wealth) return !isLocked(content, state, 'wealth'); // no 灵石 out while 灵石 are not his yet
  if (!row.item) return true;
  const item = itemOf(content, row.item);
  if (!item || (item.juan ?? 1) > 1) return false;
  if ((t.once?.kinds ?? []).includes(item.kind) && hasFound(state, row.item)) return false;
  return true;
}
const poolFor = (content, state, t, grade) => (t.pools?.[grade] ?? []).filter(r => rowOpen(content, state, t, r));

/* ── The book's fixed outputs and the 方子 ── */
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const liveStory = (content, t) => (t.recipes?.story?.list ?? []).filter(r => !content || r.in.every(id => itemOf(content, id)));
const storyFor = (content, t, ids) => liveStory(content, t).find(r => sameSet(r.in, ids)) ?? null;
const storyIn = (content, t, ids) => liveStory(content, t).filter(r => ids.some(id => r.in.includes(id)));
const recipeFor = (t, ids, lingshi, found = null, content = null, state = null) => (ids.length === 1
  ? (t.recipes?.list ?? []).find(r => r.in === ids[0] && (r.lingshi ?? 0) === lingshi && (!r.pages || found?.includes(r.id))
    && rowOpen(content, state, t, { hui: r.hui })) ?? null : null);

/* The pure roll, for the rules, the tests and the 游戏厅's sample alike: what one pot gives.
   `ids` what went in, `lingshi`, `realm` (realmOf), `press` (the lid pressed on a gold puff), `herHere`,
   `pity` (the 凡 in a row before this), `found` (the 方子 known), and — for the save's roll only — `content`
   and `state`, which gate the pools by the 回, the beasts beaten and the once-things. */
export function rollFeed(t, { seed, ids, id, lingshi = 0, realm = 0, press = false, herHere = false, pity = 0, found = null, content = null, state = null }) {
  ids = ids ?? (id ? [id] : []);
  const u = stream(hash(seed));
  const story = storyFor(content, t, ids);
  if (story) return { out: story.out, grade: 'best', story: story.id, outs: [{ out: story.out, grade: 'best' }] };
  const q = t.quirks ?? {}, quirk = u() * 100, ev = (t.events ?? []).find(e => e.id === 'yinyue');
  if (ev && herHere && quirk < (ev.chance ?? 0)) return { out: ev.out, grade: 'junk', event: ev.id, outs: [{ out: ev.out, grade: 'junk' }] };
  const off = ev && herHere ? ev.chance ?? 0 : 0;
  if (quirk >= off && quirk < off + (q.refuse ?? 0)) return { refused: true, outs: [] };
  const twin = quirk >= off + (q.refuse ?? 0) && quirk < off + (q.refuse ?? 0) + (q.twin ?? 0);
  const counts = {};
  for (const x of ids) counts[kindOf(t, x)] = (counts[kindOf(t, x)] ?? 0) + 1;
  const power = powerOf(t, { tier: potTier(t, ids), realm, lingshi });
  const recipe = recipeFor(t, ids, lingshi, found, content, state);
  const one = (pityNow) => {
    let grade = weighted(u(), gradeWeights(t, recipe ? 0 : power, recipe?.grades ?? t.odds?.grades));
    const pickU = u(), withU = u(), nU = u();
    if (pityNow && grade === 'junk') grade = 'useful';
    if (press) grade = GRADES[Math.min(GRADES.length - 1, GRADES.indexOf(grade) + 1)];
    if (recipe && grade !== 'junk') return { out: grade === 'useful' ? recipe.out : recipe.best, grade, recipe: recipe.id };
    // Down a grade when nothing of it is open yet for this save (never up: a pot never gives more than it rolled).
    for (let g = GRADES.indexOf(grade); g >= 0; g--) {
      const rows = poolFor(content, state, t, GRADES[g]);
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

/* The exact odds of one pot's first output, before the quirks (the tests' and the tuning's view of rollFeed):
   item id → chance, and grade → chance. Same options as rollFeed. */
export function chances(t, { ids, lingshi = 0, realm = 0, press = false, pity = 0, content = null, state = null }) {
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
      const rows = poolFor(content, state, t, GRADES[k]);
      if (!rows.length) continue;
      const ws = rows.map(r => rowWeight(t, r, power, counts)), sum = ws.reduce((a, b) => a + b, 0);
      rows.forEach((r, i) => { const id = r.item ?? LINGSHI; items[id] = (items[id] ?? 0) + p * ws[i] / sum; });
      grades[GRADES[k]] += p;
      break;
    }
  }
  return { items, grades, power };
}

/* ── What may go in ── */
const aroundOf = (t, state) => (t.around?.items ?? []).filter(a => !a.after || questDoneBefore(state, a.after)).map(a => a.id);
function feedable(content, state, t, id) {
  if (!id || !itemOf(content, id)) return null;
  if (aroundOf(t, state).includes(id)) return { around: true };
  if (!((state.bag?.[id] ?? 0) > 0) || id === t.needs?.item) return null;
  if (freeSlot(content, state, id) || Object.values(state.wear ?? {}).includes(id)) return null;
  if ((t.never?.kinds ?? []).includes(itemOf(content, id).kind) || (t.never?.items ?? []).includes(id)) return null;
  // The book's own pot: its inputs wait for the scene that feeds them (recipes.story `after`).
  if (storyIn(content, t, [id]).some(r => !(state.done_scenes ?? []).includes(r.after))) return null;
  return { around: false };
}

/* ── The limit: when the bucket may eat again (null = now). ── */
function nextAt(t, state, now) {
  const L = t.limit ?? {}, f = state.fantong ?? {};
  let next = 0;
  if (L.cooldown_min > 0 && f.at) next = Math.max(next, new Date(f.at).getTime() + L.cooldown_min * 60_000);
  if (L.per_day > 0 && f.day === dayKey(now) && (f.today ?? 0) >= L.per_day) {
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    next = Math.max(next, midnight.getTime());
  }
  return next > now.getTime() ? new Date(next) : null;
}
const ZH_N = ['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
/* How long, in the world's words: 刻 (a quarter hour) under two hours, else 时辰. */
export function waitWords(ms, lang) {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (lang === 'en') return min < 120 ? `in ${min} minute${min === 1 ? '' : 's'}` : `in about ${Math.ceil(min / 60)} hours`;
  return min < 120 ? `${ZH_N[Math.ceil(min / 15)]}刻` : `${ZH_N[Math.min(12, Math.ceil(min / 120))]}个时辰`;
}
const fullSay = (t, lang, next, now) => fill(wordsOf(t, lang).full, { when: waitWords(next - now, lang) });

/* An output as the board shows it: name, the one line of small print, its picture, its grade. */
function outBrief(content, state, t, got, grade) {
  if (got.id === LINGSHI) return { id: LINGSHI, name: wordsOf(t, state.lang).lingshi ?? '灵石', n: got.n, wealth: true, grade };
  const item = itemOf(content, got.id);
  return { id: got.id, name: itemName(item, state, state.lang) ?? got.id, hint: pick(item?.hint, state.lang), art: item?.art ?? null, grade,
    ...(item?.zhuan ? { zhuan: item.zhuan } : {}), n: got.n, ...(got.stored ? { stored: true } : {}), ...(got.new ? { new: true } : {}) };
}

/* The 方子 found so far, as 录 and the board read them. */
export function fantongRecipes(content, state) {
  const t = tableOf(content), lang = state.lang;
  if (!t) return [];
  const found = state.fantong?.recipes ?? [];
  return (t.recipes?.list ?? []).filter(r => found.includes(r.id)).map(r => ({
    id: r.id, in: itemName(itemOf(content, r.in), state, lang) ?? r.in, lingshi: r.lingshi ?? 0, out: itemName(itemOf(content, r.out), state, lang) ?? r.out,
  }));
}

/* Every thing the table can give: the pools, the 方子, the gag, the book's two. With `content` and `state`, only
   what this save can get by the lottery — the 图鉴's whole (rows its 回 and 卷 open, never the book's two, which the
   story hands over; a thing it has already had stays counted). */
export function fantongAll(t, content = null, state = null) {
  const ids = new Set(), save = Boolean(content && state);
  for (const g of GRADES) for (const r of t.pools?.[g] ?? []) {
    if (save && !rowOpen(content, state, t, r) && !hasFound(state, r.item)) continue;
    ids.add(r.item ?? LINGSHI); if (r.with) ids.add(r.with);
  }
  for (const r of t.recipes?.list ?? []) if (!save || rowOpen(content, state, t, { hui: r.hui })) { ids.add(r.out); ids.add(r.best); }
  for (const e of t.events ?? []) ids.add(e.out);
  if (!save) for (const r of t.recipes?.story?.list ?? []) ids.add(r.out);
  return [...ids];
}
/* 饭桶图鉴: what has come out, in the order it first did, with its grade; and how many the table holds. */
export function fantongBook(content, state) {
  const t = tableOf(content), lang = state.lang;
  if (!t) return null;
  const seen = state.fantong?.seen ?? [];
  if (!seen.length && !state.fantong?.n) return null;
  return {
    seen: seen.map(s => (s.id === LINGSHI ? { id: LINGSHI, name: wordsOf(t, lang).lingshi, grade: s.grade }
      : { id: s.id, name: itemName(itemOf(content, s.id), state, lang) ?? s.id, hint: pick(itemOf(content, s.id)?.hint, lang), grade: s.grade })),
    of: new Set([...fantongAll(t, content, state), ...seen.map(s => s.id)]).size, grades: wordsOf(t, lang).grades ?? {},
  };
}

/* The board's reading: may it eat now, when next, what he can feed, the lean colours. */
export function fantongBrief(content, state, now) {
  const t = tableOf(content), lang = state.lang;
  if (!t || !fantongOpen(content, state)) return null;
  const next = nextAt(t, state, now);
  const around = aroundOf(t, state);
  const bagIds = Object.keys(state.bag ?? {}).filter(id => !around.includes(id) && feedable(content, state, t, id));
  const inputs = [...around, ...bagIds].map(id => {
    const item = itemOf(content, id);
    return { id, name: itemName(item, state, lang) ?? id, art: item?.art ?? null, kind: kindOf(t, id), tier: tierOfItem(t, id), ...(around.includes(id) ? { around: true } : { n: state.bag[id] }) };
  });
  const locked = isLocked(content, state, 'wealth');
  const tints = Object.fromEntries(Object.entries(t.kinds ?? {}).filter(([k]) => k !== '_about').map(([k, v]) => [k, v.tint ?? null]));
  return {
    name: itemName(itemOf(content, t.needs.item), state, lang), ready: !next, ...(next ? { next_at: next.toISOString(), wait: fullSay(t, lang, next, now) } : {}),
    limit: { ...(t.limit?.cooldown_min ? { cooldown_min: t.limit.cooldown_min } : {}), ...(t.limit?.per_day ? { per_day: t.limit.per_day, today: state.fantong?.day === dayKey(now) ? state.fantong.today ?? 0 : 0 } : {}) },
    inputs, max_in: t.max_in ?? 3, tints, grades: wordsOf(t, lang).grades ?? {}, quips: wordsOf(t, lang).quips ?? {},
    lingshi: locked ? null : { max: t.lingshi?.max ?? 0, have: state.wealth ?? 0 },
    recipes: fantongRecipes(content, state), fed: state.fantong?.n ?? 0, seen: (state.fantong?.seen ?? []).length, of: new Set([...fantongAll(t, content, state), ...(state.fantong?.seen ?? []).map(s => s.id)]).size,
  };
}

const ACTIONS = {
  look: (state, content, ctx) => ({ state: null, result: { ok: true, fantong: fantongBrief(content, state, ctx.now) } }),
  feed: feed,
};

/* Fantong — `look`, or `feed --ids=a,b,c [--lingshi=n] [--press=1]` (`--id=x` is a pot of one). */
export function fantong(state, content, ctx, args = {}) {
  const t = tableOf(content);
  if (!t) return refuse('no-fantong', null);
  const action = String(args.action ?? 'look');
  if (!ACTIONS[action]) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  if (!fantongOpen(content, state)) return refuse('no-fantong', wordsOf(t, state.lang).no_bucket ?? null);
  return ACTIONS[action](state, content, ctx, args, t);
}

const idsOf = args => (Array.isArray(args.ids) ? args.ids : String(args.ids ?? args.id ?? '').split(',')).map(x => String(x).trim()).filter(Boolean);

function feed(state, content, ctx, args, t) {
  const lang = state.lang, w = wordsOf(t, lang), now = ctx.now;
  const ids = idsOf(args), lingshi = Number(args.lingshi ?? 0) || 0, press = Number(args.press ?? 0) > 0;
  if (!ids.length) return refuse('not-feedable', w.not_feedable ?? null);
  if (ids.length > (t.max_in ?? 3)) return refuse('too-many', w.too_many ?? null);
  // Each thing in the pot must be fed — and a stack must hold as many as the pot asks of it.
  const need = {};
  for (const id of ids) need[id] = (need[id] ?? 0) + 1;
  const how = {};
  for (const [id, n] of Object.entries(need)) {
    how[id] = feedable(content, state, t, id);
    if (!how[id] || (!how[id].around && (state.bag[id] ?? 0) < n)) return refuse('not-feedable', w.not_feedable ?? null, { id });
  }
  if (!Number.isInteger(lingshi) || lingshi < 0 || lingshi > (t.lingshi?.max ?? 0)) return refuse('bad-lingshi', null);
  if (lingshi && (isLocked(content, state, 'wealth') || (state.wealth ?? 0) < lingshi)) return refuse('no-lingshi', w.no_lingshi ?? null);
  const next = nextAt(t, state, now);
  if (next) return refuse('full', fullSay(t, lang, next, now), { next_at: next.toISOString() });
  // The book's pot, once its thing is his: refused, nothing spent.
  const story = storyFor(content, t, ids);
  if (story && (hasFound(state, story.out) || Object.values(state.wear ?? {}).includes(story.out))) return refuse('had', w.had ?? null);

  const f = state.fantong ?? {};
  const n = f.n ?? 0, today = dayKey(now);
  const herHere = Boolean(state.companion?.joined && !state.companion?.away);
  const roll = rollFeed(t, {
    seed: `${state.world}|${state.name ?? ''}|${today}|${n}|${[...ids].sort().join('+')}|${lingshi}${f.spat ? `|${f.spat}` : ''}`, ids, lingshi, press, herHere,
    realm: realmOf(content, state, t), pity: f.dry ?? 0, found: f.recipes ?? [], content, state,
  });
  // It chews and spits the pot back whole: nothing spent, no wait — the gag, not a loss.
  // (Counted, so the next try is a fresh roll, not the same 「呸」.)
  if (roll.refused) {
    const s = clone(state);
    s.fantong = { ...f, spat: (f.spat ?? 0) + 1 };
    return { state: s, result: { ok: true, spat_back: true, say: w.spat_back, fed: { ids, lingshi }, outs: [], fantong: fantongBrief(content, s, now) } };
  }

  const s = clone(state);
  for (const [id, k] of Object.entries(need)) if (!how[id].around) { s.bag[id] -= k; if (s.bag[id] <= 0) delete s.bag[id]; }
  if (lingshi) s.wealth = (s.wealth ?? 0) - lingshi;
  // Into the pouch: every output (the twin too), and a thing's companion (含笑半步颠 · 止笑丸).
  const landed = [];
  const land = (id, grade, k = 1, wealth = 0) => {
    if (wealth) { s.wealth = (s.wealth ?? 0) + wealth; landed.push({ got: { id: LINGSHI, n: wealth }, grade }); return; }
    landed.push({ got: stow(content, s, id, k), grade });
  };
  for (const o of roll.outs) { land(o.out, o.grade, o.n ?? 1, o.wealth ?? 0); if (o.with) land(o.with, o.grade); }
  const found = new Set(f.recipes ?? []);
  const discovered = roll.recipe && !found.has(roll.recipe) ? roll.recipe : null;
  if (discovered) found.add(discovered);
  // 方子残页: counted; at `need` its 方子 is worked out.
  const P = t.pages, pages = (f.pages ?? 0) + (P ? landed.filter(l => l.got.id === P.item).length : 0);
  const paged = P && pages >= P.need && !found.has(P.recipe) ? P.recipe : null;
  if (paged) found.add(paged);
  // 图鉴: the first time each thing comes out.
  const seen = [...(f.seen ?? [])];
  const fresh = [];
  for (const l of landed) if (!seen.some(x => x.id === l.got.id)) { seen.push({ id: l.got.id, grade: l.grade, at: today }); fresh.push(l.got.id); }
  const dry = roll.outs.every(o => o.grade === 'junk') && !roll.event ? (f.dry ?? 0) + 1 : 0;
  s.fantong = { ...f, n: n + 1, at: now.toISOString(), day: today, today: (f.day === today ? f.today ?? 0 : 0) + 1, recipes: [...found],
    seen, dry, spat: 0, ...(P ? { pages } : {}),
    last: { in: ids, out: roll.out, lingshi, grade: roll.grade, press } };
  delete s.fantong.stars;

  const briefs = landed.map(l => outBrief(content, s, t, l.got, l.grade));
  const out = briefs[0], extra = roll.outs[0]?.with ? briefs[1] : null, twin = roll.twin ? briefs.at(-1) : null;
  const ev = roll.event ? (t.events ?? []).find(e => e.id === roll.event) : null;
  const named = o => (o.wealth ? `${o.name} ×${o.n}` : o.name);
  const line = ev ? pick(ev.say, lang) : fill(w.spit, { name: named(out) });
  const pageLine = P && pages > (f.pages ?? 0) && !paged ? fill(w.page, { n: Math.min(pages, P.need), need: P.need }) : null;
  const say = [line, extra ? fill(w.with, { name: named(extra) }) : null, twin ? fill(w.twin, { name: named(twin) }) : null, pageLine,
    storedLine(s, landed.map(l => l.got))].filter(Boolean).join(' ');
  const nextNow = nextAt(t, s, now);
  const newRecipe = discovered ?? paged;
  return { state: s, result: {
    ok: true, fed: { ids, id: ids[0], names: ids.map(id => itemName(itemOf(content, id), s, lang) ?? id), name: ids.map(id => itemName(itemOf(content, id), s, lang) ?? id).join('、'), lingshi, press },
    out, ...(extra ? { with: extra } : {}), ...(twin ? { twin } : {}), outs: briefs,
    grade: roll.grade, grade_name: wordsOf(t, lang).grades?.[roll.grade] ?? roll.grade,
    ...(ev ? { her: true } : {}), ...(roll.story ? { story: roll.story } : {}), ...(fresh.length ? { first: fresh } : {}), say,
    ...(newRecipe ? { discovered: fantongRecipes(content, s).find(r => r.id === newRecipe) } : {}),
    ...(nextNow ? { next_at: nextNow.toISOString() } : {}),
    fantong: fantongBrief(content, s, now), pouch: pouchBrief(content, s),
  } };
}
