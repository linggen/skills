// stock-chart.js — the chart on a stock card: range chips, line or candles,
// the position's change over the range, hover. Series come from market.pl
// history (cached in data/history/); this keeps them in memory too, so a chip
// click redraws without a fetch. The chosen range and style are this
// viewer's (localStorage). Drawing and every number are chart.js's.

import {
  RANGES, seriesOf, isIntraday, rangeView, positionChange, changeNote, candlesOffered, chartView, nearestIndex, nyDay,
} from './chart.js';

const MARKET = '"$HOME/.linggen/skills/cfo/scripts/market.pl"';
const FRESH_MS = 5 * 60 * 1000;
const RANGE_KEY = 'cfo.chart.range';
const KIND_KEY = 'cfo.chart.kind';

let deps = null;
const series = new Map(); // `${sym}|${series}` -> {at, rows, error, busy}
const hovers = new Map(); // sym -> {xs, ys, tips} of the drawn chart
let range = pref(RANGE_KEY, '1M', RANGES);
let kind = pref(KIND_KEY, 'line', ['line', 'candle']);

/**
 * @param {object} d
 * @param {(cmd: string) => Promise<string>} d.runBash
 * @param {(s: string) => string} d.esc
 * @param {(n: number, currency: string, digits?: number) => string} d.money
 * @param {(n: number, currency: string, pct: number|null, digits?: number) => string} d.moveHtml
 * @param {(sym: string) => number} d.sharesAt the shares cell's edit time (ms)
 * @param {() => void} d.redraw
 */
export function initStockChart(d) {
  deps = d;
}

function pref(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private window: this visit only */ }
}

// ── Data ───────────────────────────────────────────────────────────────────

const seriesFor = (sym) => ({
  '5Y': series.get(`${sym}|5Y`),
  '1D': series.get(`${sym}|1D`),
  '1W': series.get(`${sym}|1W`),
});

/// Load what the card's range needs (the daily series always: it is every
/// daily range and the intraday ranges' previous close). Fresh in memory →
/// nothing fetched.
export function loadChart(sym) {
  const wanted = ['5Y', ...(isIntraday(range) ? [seriesOf(range)] : [])];
  for (const s of wanted) fetchSeries(sym, s);
}

async function fetchSeries(sym, name) {
  const key = `${sym}|${name}`;
  const have = series.get(key);
  if (have?.busy || (have?.rows && Date.now() - have.at < FRESH_MS)) return;
  series.set(key, { ...have, busy: true });
  let next;
  try {
    const doc = JSON.parse(await deps.runBash(`perl ${MARKET} history ${sym} ${name}`));
    next = doc.rows?.length ? { at: Date.now(), rows: doc.rows } : { at: Date.now(), rows: have?.rows, error: doc.error || 'no data' };
  } catch (err) {
    console.warn('[cfo] chart history', sym, name, err);
    next = { at: Date.now(), rows: have?.rows, error: 'unreachable' };
  }
  series.set(key, next);
  deps.redraw();
}

// ── Drawing ────────────────────────────────────────────────────────────────

/// The chart block for a card. `r` is the card's position row.
export function stockChartHtml(r) {
  const { esc } = deps;
  const sym = r.symbol;
  const today = new Date().toLocaleDateString('en-CA');
  const loaded = seriesFor(sym);
  const { base, points } = rangeView(range, loaded, today);
  const chips = RANGES.map((g) => `<button class="ch-chip${g === range ? ' on' : ''}" data-act="chart-range" data-sym="${esc(sym)}" data-range="${g}">${g}</button>`).join('');
  const candle = candlesOffered(range, points)
    ? `<button class="ch-chip${kind === 'candle' ? ' on' : ''}" data-act="chart-kind" data-sym="${esc(sym)}" title="Candles: open, high, low, close${range === '5Y' ? ' — one a week' : ' — one a day'}">Candles</button>`
    : '';
  const ready = base && points.length > 1;
  const view = ready ? chartView({ points, base, range, kind, id: `ch-${sym.replace(/\W/g, '-')}`, price: (n) => deps.money(n, r.currency) }) : null;
  if (view) hovers.set(sym, view.hover); else hovers.delete(sym);
  return `<div class="ch" data-sym="${esc(sym)}">
    <div class="ch-head"><div class="ch-chips">${chips}</div>${ready ? changeHtml(r, base, points) : ''}<span class="spacer"></span>${candle}</div>
    ${view ? view.html : `<p class="hint ch-empty">${esc(emptyNote(sym))}</p>`}
  </div>`;
}

/// "+$177.60 (+3.95%)" — the position over the range, at today's shares.
function changeHtml(r, base, points) {
  const move = positionChange(r.shares, base.c, points[points.length - 1].c);
  if (!move) return '';
  const day = typeof base.t === 'number' ? nyDay(base.t) : base.t;
  const note = changeNote(r.shares, day, deps.sharesAt(r.symbol), dayLabel);
  return `<span class="ch-change" title="${deps.esc(note)}">${deps.moveHtml(move.change, r.currency, move.pct)}</span>`;
}

const dayLabel = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

function emptyNote(sym) {
  const s = seriesFor(sym);
  const need = isIntraday(range) ? [s['5Y'], s[range]] : [s['5Y']];
  if (need.some((x) => !x || x.busy)) return 'Loading chart…';
  return 'No chart for this range — stockanalysis.com sent no prices';
}

// ── Actions ────────────────────────────────────────────────────────────────

/// A chart chip was tapped. True when it was one.
export function onChartAct(act, btn) {
  const acts = {
    'chart-range': () => { range = btn.dataset.range; remember(RANGE_KEY, range); loadChart(btn.dataset.sym); },
    'chart-kind': () => { kind = kind === 'candle' ? 'line' : 'candle'; remember(KIND_KEY, kind); },
  };
  if (!acts[act]) return false;
  acts[act]();
  deps.redraw();
  return true;
}

/// Hover (or a finger along the plot): a crosshair, a dot and the point's
/// time and price.
export function onChartHover(e) {
  const plot = e.target.closest?.('.ch-plot');
  if (!plot) return;
  const hover = hovers.get(plot.closest('.ch').dataset.sym);
  if (!hover?.xs.length) return;
  const box = plot.getBoundingClientRect();
  const i = nearestIndex(hover.xs, Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  const left = `${(hover.xs[i] * 100).toFixed(2)}%`;
  const [cross, dot, tip] = ['.ch-cross', '.ch-dot', '.ch-tipbox'].map((s) => plot.querySelector(s));
  cross.style.left = left;
  dot.style.left = left;
  dot.style.top = `${(hover.ys[i] * 100).toFixed(2)}%`;
  tip.textContent = hover.tips[i];
  tip.style.left = `${Math.min(85, Math.max(15, hover.xs[i] * 100)).toFixed(2)}%`;
  for (const el of [cross, dot, tip]) el.hidden = false;
}

export function onChartLeave(e) {
  const plot = e.target.closest?.('.ch-plot');
  if (!plot || plot.contains(e.relatedTarget)) return;
  for (const el of plot.querySelectorAll('.ch-cross, .ch-dot, .ch-tipbox')) el.hidden = true;
}
