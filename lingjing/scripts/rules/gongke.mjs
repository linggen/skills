// rules/gongke.mjs — 人间功课 as cultivation: what a real-life chore means in the book.
// Part of the rules engine; rules.mjs is its one door.
//
// Hanli, 2026-10-22 (「游戏里还要有和其他app如cfo, shifu, health等互动」 → 「可以」): an app names
// each chore's `kind` in its own quest file (a plain word — body, ledger, sweep …); the world's
// table (worlds/<id>/gongke.json) reads that kind into the book: an in-world name for the
// 人间功课 board, facts for 银月, and a little more pay — 灵石, a little 修为, a chore-only thing —
// on top of the chore's own (chores.mjs choreGrant). Capped per day; paid once per occurrence,
// because it rides the chore's own hand-in (tasks.mjs questCheck), which pays once a period.
// A `week` row (宗门月俸) pays once a week when the kind was handed in on enough days of it.
//
// Nothing here names an app or a chore id: a kind the table lacks, or none, means nothing more.
// 开府's one-time milestones never take a meaning.
import { dayKey, periodKey, pick, weekKey, zeroAt } from '../state.mjs';
import { paysOf } from './core.mjs';
import { choreOpen, isOnce } from './chores.mjs';

const kindOf = q => (typeof q?.kind === 'string' ? q.kind : null);

/* The meaning of a chore, or null. */
export function meaningOf(content, q) {
  if (!q || isOnce(q)) return null;
  const k = kindOf(q);
  return k ? content.gongke?.kinds?.[k] ?? null : null;
}

/* What the meanings paid today (state.gongke.day), a fresh one on a new local day. */
function today(state, now) {
  const d = state.gongke?.day;
  return d?.key === dayKey(now) ? d : { key: dayKey(now), wealth: 0, progress: 0, items: 0 };
}

/* The week's record of a kind: the days it was handed in, and whether its 月俸 was paid. */
function weekOf(state, kind, now) {
  const w = state.gongke?.weeks?.[kind];
  return w?.key === weekKey(now) ? w : { key: weekKey(now), days: [], paid: false };
}

/* What the meaning would add now, under the day's cap: {kind, wealth, progress, item, capped, week}. */
export function meaningGrant(content, state, q, now) {
  const m = meaningOf(content, q);
  if (!m) return null;
  const cap = content.gongke.per_day ?? {}, d = today(state, now);
  const room = k => Math.max(0, (cap[k] ?? Infinity) - (d[k] ?? 0));
  const wealth = Math.min(m.wealth ?? 0, room('wealth')), progress = Math.min(m.progress ?? 0, room('progress'));
  const item = m.item && room('items') > 0 ? m.item : null;
  const capped = wealth < (m.wealth ?? 0) || progress < (m.progress ?? 0) || Boolean(m.item && !item);
  let week = null;
  if (m.week) {
    const w = weekOf(state, kindOf(q), now), days = new Set([...w.days, dayKey(now)]);
    week = { days: days.size, of: m.week.days, due: !w.paid && days.size >= m.week.days };
  }
  return { kind: kindOf(q), wealth, progress, item, capped, week };
}

/* Pay the meaning into `s` (a clone, after the chore's own pay): returns the facts for the result. */
export function payMeaning(content, s, ctx, q, payFn) {
  const g = meaningGrant(content, s, q, ctx.now);
  if (!g) return null;
  const m = meaningOf(content, q), lang = s.lang;
  const paid = payFn(content, s, ctx, { table: 'chore_kind', progress: g.progress, wealth: g.wealth, ...(g.item ? { item: g.item } : {}) });
  const d = today(s, ctx.now);
  s.gongke = { ...s.gongke, day: { key: d.key, wealth: d.wealth + paid.wealth, progress: d.progress + g.progress, items: d.items + (g.item ? 1 : 0) } };
  let week = null;
  if (m.week) {
    const w = weekOf(s, g.kind, ctx.now), days = [...new Set([...w.days, dayKey(ctx.now)])];
    let stipend = null;
    if (!w.paid && days.length >= m.week.days) stipend = payFn(content, s, ctx, { table: 'chore_week', wealth: content.rewards.tables.chore_week.wealth });
    s.gongke.weeks = { ...s.gongke.weeks, [g.kind]: { key: w.key, days, paid: w.paid || Boolean(stipend) } };
    week = { name: pick(m.week.name, lang), days: days.length, of: m.week.days, ...(stipend ? { paid: { wealth: stipend.wealth } } : {}) };
  }
  return {
    kind: g.kind, name: pick(m.name, lang), about: pick(m.about, lang),
    paid: { progress: paid.progress, wealth: paid.wealth, ...(paid.item ? { item: paid.item, item_name: itemName(content, paid.item, lang) } : {}), ...(paid.pouch_full ? { pouch_full: paid.pouch_full } : {}) },
    ...(g.capped ? { capped: true } : {}), ...(week ? { week } : {}),
  };
}

const itemName = (content, id, lang) => pick(content.items.items.find(i => i.id === id)?.name, lang);

/* What a meaning would land now (paysOf: the table, the roots, the tier, the gates) — 零层 takes no 修为. */
function landsOf(content, state, now, g) {
  const p = paysOf(content, state, now, { table: 'chore_kind', progress: g.progress, wealth: g.wealth }) ?? { progress: 0, wealth: 0 };
  return { wealth: p.wealth, progress: zeroAt(content, state.tier, state.step) ? 0 : p.progress };
}

/* The 人间功课 board (Look's `gongke`): today's chores as facts — the meaning's name, the app's own
   title, where it is done, done (and when, by the app's record), paid (and when), what the meaning
   adds now, the thing it leaves; the day's meanings against the cap; each week row; the ward
   standing at the abode (a worn thing that came from a meaning). No sentence: she says them. */
export function gongkeBoard(content, state, chores, now, lang, questDone) {
  if (!content.gongke) return null;
  const rows = chores.map(q => {
    const m = meaningOf(content, q), g = m ? meaningGrant(content, state, q, now) : null;
    const paid = state.chores?.[q.id]?.period === periodKey(q.period, now);
    const done = questDone(q, now);
    return {
      id: q.id, kind: kindOf(q), name: m ? pick(m.name, lang) : null, title: pick(q.title, lang), device: q.device ?? null, period: q.period, open: choreOpen(q),
      done, done_at: done ? q.done_at : null, paid, paid_at: paid ? state.chores[q.id].paid_at ?? null : null,
      ...(m && !paid ? { adds: { ...landsOf(content, state, now, g), ...(g.item ? { item: itemName(content, g.item, lang) } : {}) } } : {}),
      ...(m?.item ? { leaves: itemName(content, m.item, lang) } : {}),
    };
  });
  const d = today(state, now), cap = content.gongke.per_day ?? {};
  const weeks = Object.entries(content.gongke.kinds ?? {}).filter(([, m]) => m.week).map(([kind, m]) => {
    const w = weekOf(state, kind, now);
    return { kind, name: pick(m.week.name, lang), days: w.days.length, of: m.week.days, paid: w.paid };
  });
  const wardIds = new Set(Object.values(content.gongke.kinds ?? {}).map(m => m.item).filter(Boolean));
  const abode = state.wear?.abode;
  const ward = abode && wardIds.has(abode) ? { id: abode, name: itemName(content, abode, lang) } : null;
  return { rows, day: { wealth: d.wealth, progress: d.progress, items: d.items, cap }, weeks, ...(ward ? { ward } : {}) };
}
