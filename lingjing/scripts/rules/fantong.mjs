// rules/fantong.mjs — 喂饭桶, free play: feed the 饭桶 one thing, it spits one thing out.
// Part of the rules engine; rules.mjs is its one door.
//
// Everything is the world's table (worlds/<id>/fantong.json): what is needed to
// play (`needs`), the limit (`limit.cooldown_min` and/or `limit.per_day`), the
// 凡物 always at hand (`around`), which inputs lean where (`kinds`), what 灵石
// moves (`lingshi`), the pools, the book's 方子 (`recipes`) and the 银月 gag
// (`events`). No item id is named here. The roll is the rules', seeded by the
// day, the save's feed count and what went in — the page only shows it. The
// story's own 饭桶 stops (scripts/games/fantong.js) stay the book's; this is
// the bucket between them, in the same voice: every output carries its name and
// one line of small print (`hint`), never its effect.
import { dayKey, itemName, pick } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf, questDoneBefore } from './errands.mjs';
import { isLocked } from './locks.mjs';
import { freeSlot, pouchBrief, stow, storedLine } from './pouch.mjs';

const GRADES = ['junk', 'useful', 'best'];
const tableOf = content => content.fantong ?? null;
const wordsOf = (t, lang) => t.words?.[lang] ?? t.words?.zh ?? {};
const fill = (text, vars) => String(text ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/* Free play opens when he holds the thing `needs` names (the 小铜炉 · 饭桶, 古四). */
export const fantongOpen = (content, state) => {
  const t = tableOf(content);
  return Boolean(t && (state.bag?.[t.needs?.item] ?? 0) > 0);
};

/* ── The roll: a small stable hash and a seeded stream — no Math.random. ── */
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
/* One of `rows` by weight (`w`, or the value itself for a {key: weight} map). */
function weighted(u, rows) {
  const total = rows.reduce((n, [, w]) => n + Math.max(0, w), 0);
  let at = u * total;
  for (const [key, w] of rows) { if ((at -= Math.max(0, w)) < 0) return key; }
  return rows.at(-1)[0];
}

/* ── What may go in ── */
const aroundOf = (t, state) => (t.around?.items ?? []).filter(a => !a.after || questDoneBefore(state, a.after)).map(a => a.id);
const kindOf = (t, id) => Object.entries(t.kinds ?? {}).find(([k, v]) => k !== '_about' && (v.items ?? []).includes(id))?.[0] ?? 'junk';
function feedable(content, state, t, id) {
  if (!id || !itemOf(content, id)) return null;
  if (aroundOf(t, state).includes(id)) return { around: true };
  if (!((state.bag?.[id] ?? 0) > 0) || id === t.needs?.item) return null;
  if (freeSlot(content, state, id) || Object.values(state.wear ?? {}).includes(id)) return null;
  if ((t.never?.kinds ?? []).includes(itemOf(content, id).kind) || (t.never?.items ?? []).includes(id)) return null;
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

/* ── What comes out ── */
function gradesFor(t, kind, recipe, lingshi) {
  const base = recipe?.grades ?? t.kinds?.[kind]?.grades ?? { junk: 70, useful: 25, best: 5 };
  const shift = t.lingshi?.shift ?? {};
  return GRADES.map(g => [g, Math.max(0, (base[g] ?? 0) + (shift[g] ?? 0) * lingshi)]);
}
const poolOf = (t, kind, grade) => t.pools?.[grade === 'junk' ? 'junk' : t.kinds?.[kind]?.[grade]] ?? t.pools?.junk ?? [];

/* The pure roll, for the rules and the tests alike: what one feed gives. */
export function rollFeed(t, { seed, id, lingshi = 0, herHere = false }) {
  const u = stream(hash(seed));
  const ev = (t.events ?? []).find(e => e.id === 'yinyue');
  const gag = u();
  if (ev && herHere && gag < (ev.chance ?? 0) / 100) return { out: ev.out, grade: 'junk', event: ev.id };
  const kind = kindOf(t, id);
  const recipe = (t.recipes?.list ?? []).find(r => r.in === id && (r.lingshi ?? 0) === lingshi) ?? null;
  const grade = weighted(u(), gradesFor(t, kind, recipe, lingshi));
  const pickU = u();
  if (recipe && grade !== 'junk') return { out: grade === 'best' ? recipe.best : recipe.out, grade, recipe: recipe.id, burp: false };
  const row = weighted(pickU, poolOf(t, kind, grade).map(r => [r, r.w ?? 1]));
  return { out: row.item, with: row.with ?? null, grade, burp: grade === 'junk' && u() < 0.25 };
}

/* An item as the board shows it: name, the one line of small print, its picture. */
function outBrief(content, state, got) {
  const item = itemOf(content, got.id);
  return { id: got.id, name: itemName(item, state, state.lang) ?? got.id, hint: pick(item?.hint, state.lang), art: item?.art ?? null,
    ...(item?.zhuan ? { zhuan: item.zhuan } : {}), n: got.n, ...(got.stored ? { stored: true } : {}) };
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

/* The board's reading: may it eat now, when next, what he can feed. */
export function fantongBrief(content, state, now) {
  const t = tableOf(content), lang = state.lang;
  if (!t || !fantongOpen(content, state)) return null;
  const next = nextAt(t, state, now);
  const around = aroundOf(t, state);
  const bagIds = Object.keys(state.bag ?? {}).filter(id => !around.includes(id) && feedable(content, state, t, id));
  const inputs = [...around, ...bagIds].map(id => {
    const item = itemOf(content, id);
    return { id, name: itemName(item, state, lang) ?? id, art: item?.art ?? null, kind: kindOf(t, id), ...(around.includes(id) ? { around: true } : { n: state.bag[id] }) };
  });
  const locked = isLocked(content, state, 'wealth');
  return {
    name: itemName(itemOf(content, t.needs.item), state, lang), ready: !next, ...(next ? { next_at: next.toISOString(), wait: fullSay(t, lang, next, now) } : {}),
    limit: { ...(t.limit?.cooldown_min ? { cooldown_min: t.limit.cooldown_min } : {}), ...(t.limit?.per_day ? { per_day: t.limit.per_day, today: state.fantong?.day === dayKey(now) ? state.fantong.today ?? 0 : 0 } : {}) },
    inputs, lingshi: locked ? null : { max: t.lingshi?.max ?? 0, have: state.wealth ?? 0 },
    recipes: fantongRecipes(content, state), fed: state.fantong?.n ?? 0,
  };
}

const ACTIONS = {
  look: (state, content, ctx) => ({ state: null, result: { ok: true, fantong: fantongBrief(content, state, ctx.now) } }),
  feed: feed,
};

/* Fantong — `look`, or `feed --id=<item> [--lingshi=n]`. */
export function fantong(state, content, ctx, args = {}) {
  const t = tableOf(content);
  if (!t) return refuse('no-fantong', null);
  const action = String(args.action ?? 'look');
  if (!ACTIONS[action]) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  if (!fantongOpen(content, state)) return refuse('no-fantong', wordsOf(t, state.lang).no_bucket ?? null);
  return ACTIONS[action](state, content, ctx, args, t);
}

function feed(state, content, ctx, args, t) {
  const lang = state.lang, w = wordsOf(t, lang), now = ctx.now;
  const id = String(args.id ?? ''), lingshi = Number(args.lingshi ?? 0) || 0;
  const how = feedable(content, state, t, id);
  if (!how) return refuse('not-feedable', w.not_feedable ?? null);
  if (!Number.isInteger(lingshi) || lingshi < 0 || lingshi > (t.lingshi?.max ?? 0)) return refuse('bad-lingshi', null);
  if (lingshi && (isLocked(content, state, 'wealth') || (state.wealth ?? 0) < lingshi)) return refuse('no-lingshi', w.no_lingshi ?? null);
  const next = nextAt(t, state, now);
  if (next) return refuse('full', fullSay(t, lang, next, now), { next_at: next.toISOString() });

  const f = state.fantong ?? {};
  const n = f.n ?? 0, today = dayKey(now);
  const herHere = Boolean(state.companion?.joined && !state.companion?.away);
  const roll = rollFeed(t, { seed: `${state.world}|${state.name ?? ''}|${today}|${n}|${id}|${lingshi}`, id, lingshi, herHere });

  const s = clone(state);
  if (!how.around) { s.bag[id] -= 1; if (s.bag[id] <= 0) delete s.bag[id]; }
  if (lingshi) s.wealth = (s.wealth ?? 0) - lingshi;
  const got = [stow(content, s, roll.out), ...(roll.with ? [stow(content, s, roll.with)] : [])];
  const found = new Set(f.recipes ?? []);
  const discovered = roll.recipe && !found.has(roll.recipe) ? roll.recipe : null;
  if (discovered) found.add(discovered);
  s.fantong = { n: n + 1, at: now.toISOString(), day: today, today: (f.day === today ? f.today ?? 0 : 0) + 1, recipes: [...found],
    last: { in: id, out: roll.out, lingshi, grade: roll.grade } };

  const out = outBrief(content, s, got[0]), extra = got[1] ? outBrief(content, s, got[1]) : null;
  const ev = roll.event ? (t.events ?? []).find(e => e.id === roll.event) : null;
  const line = ev ? pick(ev.say, lang) : fill(roll.burp ? w.burp : w.spit, { name: out.name });
  const say = [line, extra ? fill(w.with, { name: extra.name }) : null, storedLine(s, got)].filter(Boolean).join(' ');
  const nextNow = nextAt(t, s, now);
  return { state: s, result: {
    ok: true, fed: { id, name: itemName(itemOf(content, id), s, lang) ?? id, lingshi }, out, ...(extra ? { with: extra } : {}),
    grade: roll.grade, ...(ev ? { her: true } : {}), say,
    ...(discovered ? { discovered: fantongRecipes(content, s).find(r => r.id === discovered) } : {}),
    ...(nextNow ? { next_at: nextNow.toISOString() } : {}),
    fantong: fantongBrief(content, s, now), pouch: pouchBrief(content, s),
  } };
}
