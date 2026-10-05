// chart.js — a stock card's price chart, pure: which points a range covers,
// what it started from, the position's change over it, candles, axis ticks,
// and the drawing as SVG + HTML strings. No DOM, no fetching (stock-chart.js
// holds those), so node tests run every piece.
//
// Points come from market.pl history: daily rows {t: 'YYYY-MM-DD', o, h, l, c}
// oldest first (the 5Y series every daily range is cut from), or intraday
// rows {t, c} for 1D (the last session) and 1W (five sessions). An intraday
// `t` is the exchange's wall clock written as UTC seconds — stockanalysis.com
// stamps the 9:30 New York open as 09:30Z — so it is read in UTC.

export const RANGES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y'];
/// Ranges that offer candles: daily ones; 5Y draws weekly candles.
export const CANDLE_RANGES = new Set(['1M', '3M', 'YTD', '1Y', '5Y']);
const MONTHS_BACK = { '1M': 1, '3M': 3, '1Y': 12, '5Y': 60 };
const SESSION_S = 6.5 * 3600;

// The drawing's own units: the plot is stretched to the card's width.
const W = 1000;
const H = 300;
const PAD = 0.08; // of the price span, above and below

/// The market.pl series a range is cut from.
export const seriesOf = (range) => (range === '1D' || range === '1W' ? range : '5Y');

export const isIntraday = (range) => range === '1D' || range === '1W';

// ── Ranges ─────────────────────────────────────────────────────────────────

/// 'YYYY-MM-DD' moved by whole months, the day clamped to the month's last
/// (Mar 31 − 1 month → Feb 28).
export function shiftMonths(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/// The day a daily range is measured from: the close on or before it is the
/// range's base. YTD starts from last year's final close (Dec 31 or before).
export function rangeStart(range, today) {
  if (range === 'YTD') return `${Number(today.slice(0, 4)) - 1}-12-31`;
  return shiftMonths(today, -(MONTHS_BACK[range] ?? 1));
}

/// A daily range: `base` = the last row on or before the start (the first
/// row when the history is shorter), `points` = base onward.
export function sliceDaily(rows, range, today) {
  if (!rows?.length) return { base: null, points: [] };
  const start = rangeStart(range, today);
  let i = rows.length - 1;
  while (i > 0 && rows[i].t > start) i--;
  return { base: rows[i], points: rows.slice(i) };
}

/// The session day of an intraday time (its wall clock is New York's).
export const nyDay = (t) => NY_DAY.format(new Date(t * 1000));

/// An intraday range: base = the daily close of the session before its
/// first point (so 1D reads against the previous close, as quotes do), else
/// the first point itself.
export function sliceIntraday(rows, daily) {
  if (!rows?.length) return { base: null, points: [] };
  const first = nyDay(rows[0].t);
  const prev = [...(daily || [])].reverse().find((r) => r.t < first);
  return { base: prev ? { t: prev.t, c: prev.c } : rows[0], points: rows };
}

/// Points and base for a range, from whatever series are loaded.
export function rangeView(range, series, today) {
  return isIntraday(range)
    ? sliceIntraday(series[range]?.rows, series['5Y']?.rows)
    : sliceDaily(series['5Y']?.rows, range, today);
}

// ── Money ──────────────────────────────────────────────────────────────────

/// The position's change over a range at today's share count: shares ×
/// (last − base). Not held → the per-share change. `pct` is the price's.
export function positionChange(shares, base, last) {
  if (!Number.isFinite(base) || !Number.isFinite(last)) return null;
  const per = last - base;
  const held = shares > 0;
  return {
    held,
    change: round2(held ? shares * per : per),
    pct: base > 0 ? round2((per / base) * 100) : null,
  };
}

/// The change's tooltip: what it multiplies, and — when the share count was
/// edited inside the range — that the earlier days use today's count.
/// `sharesAt` = the register's shares cell time (ms; ≤ 1 = a seed, no edit).
export function changeNote(shares, startDay, sharesAt, dayLabel) {
  if (!(shares > 0)) return `Price change since ${dayLabel(startDay)}`;
  const base = `${shares} sh × price change since ${dayLabel(startDay)}`;
  const edited = sharesAt > 1 && sharesAt > Date.parse(`${startDay}T00:00:00Z`);
  return edited ? `${base}. Shares changed ${dayLabel(new Date(sharesAt).toISOString().slice(0, 10))} — today's count used throughout` : base;
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── Candles ────────────────────────────────────────────────────────────────

const hasOhlc = (r) => [r.o, r.h, r.l, r.c].every(Number.isFinite);

/// The Monday of a 'YYYY-MM-DD' day's week.
export function mondayOf(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/// Daily rows folded into weekly candles: the week's first open, highest
/// high, lowest low, last close; dated by its first session.
export function weeklyCandles(rows) {
  const weeks = [];
  for (const r of rows.filter(hasOhlc)) {
    const key = mondayOf(r.t);
    const w = weeks[weeks.length - 1];
    if (w && w.key === key) {
      w.h = Math.max(w.h, r.h);
      w.l = Math.min(w.l, r.l);
      w.c = r.c;
    } else {
      weeks.push({ key, t: r.t, o: r.o, h: r.h, l: r.l, c: r.c });
    }
  }
  return weeks.map(({ key, ...c }) => c);
}

/// The candles a range draws: daily, weekly for 5Y. Rows without an
/// open/high/low (a quote-only last day) draw none.
export const candlesOf = (points, range) => (range === '5Y' ? weeklyCandles(points) : points.filter(hasOhlc));

/// Candles make sense for this range and data.
export const candlesOffered = (range, points) => CANDLE_RANGES.has(range) && points.some(hasOhlc);

// ── Axes ───────────────────────────────────────────────────────────────────

/// About `count` round price levels across [min, max]: steps of 1, 2, 2.5 or
/// 5 × a power of ten.
export function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) * 0.02 || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(round(v, 8));
  return { step, ticks: out };
}

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/// Decimals a tick label needs for its step (2.5 → 1, 0.05 → 2).
export function tickDecimals(step) {
  const s = String(round(step, 6));
  return Math.min(2, s.includes('.') ? s.split('.')[1].length : 0);
}

// One Intl formatter per format — building one per point is what's slow.
const utcDate = (day) => new Date(`${day}T12:00:00Z`);
const dailyFmt = (opts) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
  return (p) => f.format(utcDate(p.t));
};
const nyFmt = (opts) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
  return (p) => f.format(new Date(p.t * 1000));
};
const NY_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

// Per range: what makes a new x label (`key`), how it reads (`label`), and
// how a hovered point reads (`tip`).
const AXIS = {
  '1D': { key: nyFmt({ hour: 'numeric', hour12: false }), label: nyFmt({ hour: 'numeric' }), tip: nyFmt({ hour: 'numeric', minute: '2-digit' }) },
  '1W': { key: (p) => nyDay(p.t), label: nyFmt({ weekday: 'short' }), tip: nyFmt({ weekday: 'short', hour: 'numeric', minute: '2-digit' }) },
  '1M': { key: (p) => mondayOf(p.t), label: dailyFmt({ month: 'short', day: 'numeric' }), tip: dailyFmt({ month: 'short', day: 'numeric', year: 'numeric' }) },
  '3M': { key: (p) => p.t.slice(0, 7), label: dailyFmt({ month: 'short' }), tip: dailyFmt({ month: 'short', day: 'numeric', year: 'numeric' }) },
  YTD: { key: (p) => p.t.slice(0, 7), label: dailyFmt({ month: 'short' }), tip: dailyFmt({ month: 'short', day: 'numeric', year: 'numeric' }) },
  '1Y': { key: (p) => p.t.slice(0, 7), label: dailyFmt({ month: 'short' }), tip: dailyFmt({ month: 'short', day: 'numeric', year: 'numeric' }) },
  '5Y': { key: (p) => p.t.slice(0, 4), label: dailyFmt({ year: 'numeric' }), tip: dailyFmt({ month: 'short', day: 'numeric', year: 'numeric' }) },
};

/// A hovered point's time, as the range reads it.
export const tipTime = (p, range) => AXIS[range].tip(p);

/// Sparse x labels: where the range's unit (hour, day, week, month, year)
/// turns over, at most `max` of them, never the very first point.
export function xTicks(points, range, max = 6) {
  const { key, label } = AXIS[range];
  const turns = [];
  for (let i = 1; i < points.length; i++) {
    if (key(points[i]) !== key(points[i - 1])) turns.push(i);
  }
  const every = Math.ceil(turns.length / max) || 1;
  return turns.filter((_, n) => n % every === every - 1).map((i) => ({ i, label: label(points[i]) }));
}

// ── Drawing ────────────────────────────────────────────────────────────────

/// Where each point sits across the plot (0..W). 1D spans the whole session
/// so a morning shows as part of a day; the rest by trading index.
export function xsOf(points, range) {
  const n = points.length;
  if (range === '1D' && n) {
    const open = points[0].t - (points[0].t % 1800), end = Math.max(points[n - 1].t, open + SESSION_S);
    return points.map((p) => ((p.t - open) / (end - open)) * W);
  }
  return points.map((_, i) => (n > 1 ? (i / (n - 1)) * W : W / 2));
}

/// The price span drawn: the points (their highs and lows for candles) and
/// the base, padded.
function domainOf(points, base, candles) {
  const vals = candles ? candles.flatMap((c) => [c.h, c.l]) : points.map((p) => p.c);
  const lo = Math.min(...vals, base), hi = Math.max(...vals, base);
  const pad = (hi - lo) * PAD || Math.abs(hi) * 0.01 || 1;
  return { lo: lo - pad, hi: hi + pad };
}

const f1 = (n) => n.toFixed(1);

/**
 * The chart for one range, ready to drop into a card.
 * @param {object} v
 * @param {Array} v.points  from rangeView
 * @param {object} v.base   the range's starting row ({c})
 * @param {string} v.range
 * @param {'line'|'candle'} v.kind
 * @param {string} v.id     unique per card (the gradient's id)
 * @param {(n: number) => string} v.price  a price as the card shows it
 * @returns {{html: string, hover: {xs: number[], ys: number[], tips: string[]}, up: boolean}}
 */
export function chartView({ points, base, range, kind, id, price }) {
  const up = points[points.length - 1].c >= base.c;
  const candles = kind === 'candle' && candlesOffered(range, points) ? candlesOf(points, range) : null;
  const drawn = candles || points;
  const { lo, hi } = domainOf(points, base.c, candles);
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const xs = candles ? inset(xsOf(drawn, range), W / candles.length / 2) : xsOf(drawn, range);
  const { step, ticks } = niceTicks(lo, hi);
  const dec = tickDecimals(step);
  const grid = ticks.map((v) => `<line class="ch-grid" x1="0" x2="${W}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>`).join('');
  const baseline = range === '1D' ? `<line class="ch-base" x1="0" x2="${W}" y1="${f1(y(base.c))}" y2="${f1(y(base.c))}"/>` : '';
  const marks = candles ? candlesSvg(candles, xs, y) : lineSvg(points, xs, y, id);
  const yLabels = ticks.map((v) => `<span style="top:${f1((y(v) / H) * 100)}%">${v.toFixed(dec)}</span>`).join('');
  const xLabels = xTicks(drawn, range).map(({ i, label }) => `<span style="left:${f1((xs[i] / W) * 100)}%">${label}</span>`).join('');
  const html = `<div class="ch-body ${up ? 'ch-up' : 'ch-down'}">
    <div class="ch-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grid}${baseline}${marks}</svg>
      <div class="ch-cross" hidden></div><div class="ch-dot" hidden></div><div class="ch-tipbox" hidden></div>
    </div>
    <div class="ch-y">${yLabels}</div>
    <div class="ch-x">${xLabels}</div>
  </div>`;
  const tips = drawn.map((p) => `${tipTime(p, range)} · ${candles ? ohlcText(p, price) : price(p.c)}`);
  return { html, up, hover: { xs: xs.map((x) => x / W), ys: drawn.map((p) => y(p.c) / H), tips } };
}

function lineSvg(points, xs, y, id) {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${f1(xs[i])} ${f1(y(p.c))}`).join('');
  const area = `${d}L${f1(xs[xs.length - 1])} ${H}L${f1(xs[0])} ${H}Z`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="ch-stop" stop-opacity="0.28"/><stop offset="1" class="ch-stop" stop-opacity="0"/></linearGradient></defs>
    <path class="ch-area" d="${area}" fill="url(#${id})"/>
    <path class="ch-line" d="${d}" fill="none"/>`;
}

/// Candles keep half a slot from each edge, so the first and last aren't cut.
const inset = (xs, m) => xs.map((x) => m + (x / W) * (W - 2 * m));

function candlesSvg(candles, xs, y) {
  const w = Math.max(1, (W / Math.max(candles.length, 1)) * 0.65);
  return candles.map((c, i) => {
    const x = xs[i], top = y(Math.max(c.o, c.c)), bottom = y(Math.min(c.o, c.c));
    const cls = c.c >= c.o ? 'ch-c-up' : 'ch-c-down';
    return `<g class="${cls}"><line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(y(c.h))}" y2="${f1(y(c.l))}"/>`
      + `<rect x="${f1(x - w / 2)}" y="${f1(top)}" width="${f1(w)}" height="${f1(Math.max(bottom - top, 1))}"/></g>`;
  }).join('');
}

const ohlcText = (c, price) => `O ${price(c.o)} H ${price(c.h)} L ${price(c.l)} C ${price(c.c)}`;

/// The nearest drawn point to a fraction across the plot.
export function nearestIndex(xs, frac) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < frac) lo = mid; else hi = mid;
  }
  return Math.abs(xs[hi] - frac) < Math.abs(xs[lo] - frac) ? hi : lo;
}
