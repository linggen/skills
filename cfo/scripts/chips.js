// The buttons above the chat, written by the page from what each tab shows
// right now — no model. Each is a question in the person's own voice about
// one fact on screen, most specific first. A tab with no facts to ask about
// gets one plain question; a chip never restates the page or a page button.
//
// Pure: callers hand in the numbers, tests run it without a page.

import { t, intlLocale, catLabel } from './strings.js';

export const MAX_CHIPS = 4;

// The month in the active language ("Sep", "9月"), worked out when asked.
const monthWord = (ym) => {
  const m = +String(ym).slice(5, 7);
  if (!(m >= 1 && m <= 12)) return ym;
  return new Intl.DateTimeFormat(intlLocale(), { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 15)));
};
// "Sep 14" / "9月14日"
const dayWord = (ymd) => {
  const m = +String(ymd).slice(5, 7), d = +String(ymd).slice(8, 10);
  return new Intl.DateTimeFormat(intlLocale(), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, d)));
};
const pct = (n) => `${Math.abs(n) < 10 ? Math.abs(n).toFixed(1).replace(/\.0$/, '') : Math.round(Math.abs(n))}%`;

/// "NETFLIX.COM" → "Netflix", "ADOBE *CREATIVECLOUD" → "Adobe",
/// "SPOTIFY P2E4F8" → "Spotify". Short enough to sit in a chip.
export function shortName(merchant) {
  const words = String(merchant || '')
    .split('*')[0]
    .replace(/\.(com|ca|net|org)\b.*$/i, '')
    .replace(/[^\p{L}\p{N}&' ]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w))
    .slice(0, 3);
  const name = words.join(' ');
  const shouting = name === name.toUpperCase();
  return shouting ? name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : name;
}

/// The chips, in order, without repeats, at most [MAX_CHIPS]; [fallback]
/// only when nothing on the tab gave a question.
function pick(candidates, fallback) {
  const out = [...new Set(candidates.filter(Boolean))].slice(0, MAX_CHIPS);
  return out.length ? out : fallback;
}

// ── Investments ────────────────────────────────────────────────────────────

/// A Watch line as the question it raises, by what kind of event it is.
const BRIEF_ASKS = {
  move: (i, who) => t('chips.brief.move', { who }),
  high_52w: (i, who) => t('chips.brief.high52', { who }),
  low_52w: (i, who) => t('chips.brief.low52', { who }),
  earnings: (i, who) => t('chips.brief.earnings', { who }),
  analyst: (i, who) => t('chips.brief.analyst', { who }),
  filing: (i, who) => t('chips.brief.filing', { who }),
  insider: (i, who) => t(i.side === 'bought' ? 'chips.brief.insiderBuy' : 'chips.brief.insiderSell', { who }),
  news: (i, who) => t('chips.brief.news', { who }),
  rate: (i) => t(i.bank === 'Fed' ? 'chips.brief.rateFed' : 'chips.brief.rateBoc'),
  fed: () => t('chips.brief.fed'),
  fomc: () => t('chips.brief.fomc'),
  data: () => t('chips.brief.data'),
  fx: () => t('chips.brief.fx'),
  policy: () => t('chips.brief.policy'),
};

/// The top line of a fresh brief (today's or yesterday's), as a question.
export function briefAsk(brief, today) {
  const item = brief?.items?.[0];
  if (!item || !isRecent(brief.day, today, 1)) return null;
  const who = item.symbol || (item.holdings || [])[0] || '';
  return BRIEF_ASKS[item.kind]?.(item, who) || null;
}

function isRecent(day, today, days) {
  const gap = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000;
  return gap >= 0 && gap <= days;
}

const held = (rows) => rows.filter((r) => r.shares > 0 && r.value !== null && !r.stale);

/// The holding that moved most today, when it moved at least 2%.
export function moverAsk(rows) {
  const [top] = held(rows)
    .filter((r) => Math.abs(r.change_pct ?? 0) >= 2)
    .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  return top ? t(top.change_pct > 0 ? 'chips.moverUp' : 'chips.moverDown', { sym: top.symbol, pct: pct(top.change_pct) }) : null;
}

/// Results within a week, for something held or watched.
export function resultsAsk(rows, today) {
  const [next] = rows
    .filter((r) => r.earnings_on && isRecent(today, r.earnings_on, 7))
    .sort((a, b) => a.earnings_on.localeCompare(b.earnings_on));
  if (!next) return null;
  return t('chips.results', { sym: next.symbol, day: dayWord(next.earnings_on) });
}

/// The biggest holding when it is over 20% of its currency's total and
/// there is more than one holding to weigh it against.
export function weightAsk(rows) {
  const byCurrency = {};
  for (const r of held(rows)) (byCurrency[r.currency] ||= []).push(r);
  const heavy = Object.values(byCurrency)
    .filter((list) => list.length > 1)
    .map((list) => {
      const total = list.reduce((s, r) => s + r.value, 0);
      const top = list.reduce((a, b) => (b.value > a.value ? b : a));
      return { symbol: top.symbol, share: total ? top.value / total : 0 };
    })
    .filter((h) => h.share > 0.2)
    .sort((a, b) => b.share - a.share)[0];
  return heavy ? t('chips.weight', { sym: heavy.symbol }) : null;
}

/// A watched ticker, not held, that had a big day (4% or more).
export function watchedAsk(rows) {
  const [top] = rows
    .filter((r) => !(r.shares > 0) && !r.stale && Math.abs(r.change_pct ?? 0) >= 4)
    .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  return top ? t(top.change_pct > 0 ? 'chips.watchedUp' : 'chips.watchedDown', { sym: top.symbol, pct: pct(top.change_pct) }) : null;
}

/// A holding up 25% or more on what was paid.
export function profitAsk(rows) {
  const [top] = held(rows).filter((r) => (r.gain_pct ?? 0) >= 25).sort((a, b) => b.gain_pct - a.gain_pct);
  return top ? t('chips.profit', { sym: top.symbol }) : null;
}

/// The Investments chips. `rows` are positionsOf rows; `brief` is
/// latestBrief(watch.json); `today` is the local YYYY-MM-DD.
export function investChips({ rows = [], brief = null, today }) {
  if (!rows.length) return [t('chips.investEmpty')];
  return pick([
    briefAsk(brief, today),
    moverAsk(rows),
    resultsAsk(rows, today),
    weightAsk(rows),
    watchedAsk(rows),
    profitAsk(rows),
  ], [t('chips.investFallback')]);
}

// ── Spending (Report and Trends) ───────────────────────────────────────────

/// Months with data, oldest first, leaving out the month still in progress
/// (the forecast's month) — half a month always looks like a drop.
export function fullMonths(view) {
  const months = Object.keys(view?.by_month || {}).sort();
  const open = view?.forecast?.month;
  return months[months.length - 1] === open ? months.slice(0, -1) : months;
}

/// A category over its cap this month, or on pace to be.
export function budgetAsk(view, money) {
  const b = (view?.budgets?.categories || []).find((c) => c.state === 'over' || c.state === 'pacing');
  if (!b) return null;
  return t(b.state === 'over' ? 'chips.budgetOver' : 'chips.budgetPacing', { cat: catLabel(b.category), amt: money(b.budget) });
}

/// The category that rose most from one full month to the next — at least
/// $50 and 20% — skipping housing, which moves when rent does.
export function riseAsk(view, money) {
  const [prev, last] = fullMonths(view).slice(-2);
  if (!last || !prev) return null;
  const [top] = Object.entries(view.by_category_monthly || {})
    .filter(([cat]) => cat !== 'housing')
    .map(([cat, m]) => ({ cat, was: m[prev] || 0, now: m[last] || 0 }))
    .filter((c) => c.now - c.was >= 50 && c.now >= c.was * 1.2)
    .sort((a, b) => (b.now - b.was) - (a.now - a.was));
  return top ? t('chips.rise', { cat: catLabel(top.cat), amt: money(top.now - top.was), month: monthWord(last) }) : null;
}

/// The last full month spent more than came in.
export function netAsk(view) {
  const [last] = fullMonths(view).slice(-1);
  return last && view.by_month[last].net < 0 ? t('chips.net', { month: monthWord(last) }) : null;
}

/// The biggest day-to-day category (not rent or bills) as a place to save.
export function cutAsk(view) {
  const skip = new Set(['housing', 'utilities', 'transfer', 'income']);
  const top = (view?.by_category || []).find((c) => !skip.has(c.category) && c.spend > 0);
  return top ? t('chips.cut', { cat: catLabel(top.category) }) : null;
}

const spendAsks = (view, money) => [budgetAsk(view, money), riseAsk(view, money), netAsk(view), cutAsk(view)];

/// Trends: `view` is the full-history report (budgets are this month's,
/// month-over-month needs every month); `money` formats an amount.
export function spendChips({ view, money }) {
  if (!view) return [t('chips.importFirst')];
  return pick(spendAsks(view, money), [t('chips.cutBack')]);
}

/// Report: the first charge its "Worth checking" panel flags, then spending.
export function reportChips({ view, anomalies, money }) {
  if (!view) return [t('chips.importFirst')];
  return pick([anomalyAsks(anomalies, money)[0], ...spendAsks(view, money)], [t('chips.cutBack')]);
}

// ── Transactions ───────────────────────────────────────────────────────────

const ANOMALY_ASKS = {
  double_charge: (a, name) => t('chips.anom.double', { name }),
  new_recurring: (a, name) => t('chips.anom.newRecurring', { name }),
  trial_charge: (a, name) => t('chips.anom.trial', { name }),
  bill_spike: (a, name, money) => t('chips.anom.spike', { name, amt: money(a.amount) }),
};

/// The flagged charges the page shows (dismissed ones already left out),
/// one question per merchant.
export function anomalyAsks(anomalies, money) {
  const seen = new Set();
  return (anomalies || []).flatMap((a) => {
    const name = shortName(a.merchant);
    if (!name || seen.has(name)) return [];
    seen.add(name);
    return ANOMALY_ASKS[a.type]?.(a, name, money) || [];
  });
}

/// The largest one-off charge in the last 30 days of data — three times
/// the usual charge or more — from a merchant not in `known` (bills,
/// subscriptions, already-flagged charges).
export function bigChargeAsk(rows, known, money) {
  const spend = (rows || []).filter((r) => r.amount < 0 && !r.transfer && r.date);
  if (spend.length < 5) return null;
  const last = spend.reduce((m, r) => (r.date > m ? r.date : m), '');
  const cutoff = new Date(Date.parse(`${last}T12:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const sizes = spend.map((r) => -r.amount).sort((a, b) => a - b);
  const usual = sizes[Math.floor(sizes.length / 2)];
  const skip = new Set((known || []).map((s) => s.merchant));
  const [top] = spend
    .filter((r) => r.date >= cutoff && !skip.has(r.merchant) && -r.amount >= usual * 3)
    .sort((a, b) => a.amount - b.amount);
  return top ? t('chips.bigCharge', { amt: money(-top.amount), name: shortName(top.merchant) }) : null;
}

export function txnChips({ anomalies, rows, recurring, money }) {
  if (!rows?.length) return [t('chips.importFirst')];
  // A merchant already flagged is asked about once, by its flag.
  const known = [...(recurring || []), ...(anomalies || [])];
  return pick([...anomalyAsks(anomalies, money), bigChargeAsk(rows, known, money)], [t('chips.txnFallback')]);
}

// ── Commitments ────────────────────────────────────────────────────────────

/// Subscriptions whose price went up.
export function hikeAsks(subs, money) {
  return (subs || [])
    .filter((s) => s.increased && s.active !== false)
    .sort((a, b) => b.increase_amount - a.increase_amount)
    .map((s) => t('chips.hike', { name: shortName(s.merchant), amt: money(s.increase_amount) }));
}

/// The priciest subscription that isn't an essential bill.
export function priciestAsk(subs, money) {
  const [top] = (subs || []).filter((s) => !s.essential && s.active !== false).sort((a, b) => b.monthly - a.monthly);
  return top ? t('chips.priciest', { name: shortName(top.merchant), amt: money(top.monthly) }) : null;
}

/// Fixed costs taking 40% or more of income, and debt when there is some.
export function loadAsks(commitments) {
  const c = commitments || {};
  return [
    c.pct_of_income >= 40 ? t('chips.fixedHigh', { pct: Math.round(c.pct_of_income) }) : null,
    c.split?.debt > 0 ? t('chips.debt') : null,
  ];
}

export function commitChips({ subs, commitments, money }) {
  return pick([...hikeAsks(subs, money), priciestAsk(subs, money), ...loadAsks(commitments)], [t('chips.commitFallback')]);
}
