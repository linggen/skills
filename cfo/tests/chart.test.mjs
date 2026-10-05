// chart.js — a stock card's chart, pure: range slicing, YTD's start, the
// position's change, weekly candles, axis ticks, and a drawing per range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGES, shiftMonths, rangeStart, sliceDaily, sliceIntraday, rangeView, positionChange, changeNote,
  mondayOf, weeklyCandles, candlesOf, candlesOffered, niceTicks, tickDecimals, xTicks, xsOf, chartView, nearestIndex,
} from '../scripts/chart.js';

// Weekday closes from 2025-12-22 to 2026-10-02, rising a dollar a session.
function dailyRows() {
  const rows = [];
  const d = new Date(Date.UTC(2025, 11, 22, 12));
  let c = 100;
  while (d <= new Date(Date.UTC(2026, 9, 2, 12))) {
    if (d.getUTCDay() % 6) rows.push({ t: d.toISOString().slice(0, 10), o: c - 0.5, h: c + 1, l: c - 1, c: c++ });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return rows;
}

// Friday 2026-10-02's session by the minute: 9:30 to 16:00 New York, as the
// source stamps it (the wall clock written as UTC).
const OPEN = Date.UTC(2026, 9, 2, 9, 30) / 1000;
const intraday = Array.from({ length: 391 }, (_, i) => ({ t: OPEN + i * 60, c: 300 + Math.sin(i / 30) }));

test('months back clamp to the month’s last day', () => {
  assert.equal(shiftMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(shiftMonths('2026-01-15', -3), '2025-10-15');
  assert.equal(shiftMonths('2026-10-05', -60), '2021-10-05');
});

test('YTD starts from last year’s final close; the others count back', () => {
  assert.equal(rangeStart('YTD', '2026-10-05'), '2025-12-31');
  assert.equal(rangeStart('1M', '2026-10-05'), '2026-09-05');
  assert.equal(rangeStart('1Y', '2026-10-05'), '2025-10-05');
});

test('a daily range starts at the last close on or before its start', () => {
  const rows = dailyRows();
  const m = sliceDaily(rows, '1M', '2026-10-05');
  assert.equal(m.base.t, '2026-09-04', 'Sep 5 is a Saturday: Friday’s close is the base');
  assert.equal(m.points[0], m.base);
  assert.equal(m.points.at(-1).t, '2026-10-02');
  const ytd = sliceDaily(rows, 'YTD', '2026-10-05');
  assert.equal(ytd.base.t, '2025-12-31');
  const y5 = sliceDaily(rows, '5Y', '2026-10-05');
  assert.equal(y5.base, rows[0], 'a history shorter than the range starts at its first row');
  assert.deepEqual(sliceDaily([], '1M', '2026-10-05'), { base: null, points: [] });
});

test('an intraday range reads against the previous session’s close', () => {
  const rows = dailyRows();
  const d = sliceIntraday(intraday, rows);
  assert.equal(d.base.t, '2026-10-01');
  assert.equal(d.points, intraday);
  assert.equal(sliceIntraday(intraday, []).base, intraday[0], 'no daily rows → its own first point');
  const view = rangeView('1D', { '5Y': { rows }, '1D': { rows: intraday } }, '2026-10-05');
  assert.equal(view.base.c, rows.find((r) => r.t === '2026-10-01').c);
});

test('the position’s change is shares × the price change over the range', () => {
  assert.deepEqual(positionChange(20, 224.07, 232.95), { held: true, change: 177.6, pct: 3.96 });
  assert.deepEqual(positionChange(0, 50, 45), { held: false, change: -5, pct: -10 });
  assert.equal(positionChange(10, null, 5), null);
});

test('the change’s note says when shares changed inside the range', () => {
  const label = (d) => d;
  assert.equal(changeNote(20, '2026-09-04', 1, label), '20 sh × price change since 2026-09-04');
  const edited = changeNote(20, '2026-09-04', Date.UTC(2026, 8, 20), label);
  assert.match(edited, /Shares changed 2026-09-20 — today's count used throughout/);
  assert.equal(changeNote(20, '2026-09-04', Date.UTC(2026, 7, 1), label), '20 sh × price change since 2026-09-04');
  assert.equal(changeNote(0, '2026-09-04', 0, label), 'Price change since 2026-09-04');
});

test('weekly candles: first open, highest high, lowest low, last close', () => {
  assert.equal(mondayOf('2026-10-02'), '2026-09-28');
  assert.equal(mondayOf('2026-09-28'), '2026-09-28');
  const days = [
    { t: '2026-09-28', o: 10, h: 12, l: 9, c: 11 },
    { t: '2026-09-29', o: 11, h: 15, l: 10, c: 14 },
    { t: '2026-10-02', o: 14, h: 14, l: 8, c: 9 },
    { t: '2026-10-05', o: 9, h: 10, l: 9, c: 10 },
    { t: '2026-10-06', c: 10.5 },
  ];
  assert.deepEqual(weeklyCandles(days), [
    { t: '2026-09-28', o: 10, h: 15, l: 8, c: 9 },
    { t: '2026-10-05', o: 9, h: 10, l: 9, c: 10 },
  ]);
  assert.equal(candlesOf(days, '1M').length, 4, 'a close-only day draws no candle');
  assert.equal(candlesOf(days, '5Y').length, 2);
  assert.equal(candlesOffered('1W', days), false);
  assert.equal(candlesOffered('1M', [{ t: '2026-10-06', c: 1 }]), false);
  assert.equal(candlesOffered('3M', days), true);
});

test('price ticks are round steps inside the span', () => {
  assert.deepEqual(niceTicks(221.3, 238.9), { step: 5, ticks: [225, 230, 235] });
  assert.deepEqual(niceTicks(47.6, 48.1).ticks, [47.6, 47.8, 48, 48.2].filter((v) => v <= 48.1));
  assert.equal(tickDecimals(2.5), 1);
  assert.equal(tickDecimals(0.05), 2);
  assert.equal(tickDecimals(10), 0);
});

test('x labels are sparse and fall where the unit turns over', () => {
  const rows = dailyRows();
  const { points } = sliceDaily(rows, '1Y', '2026-10-05');
  const ticks = xTicks(points, '1Y');
  assert.ok(ticks.length <= 6 && ticks.length >= 4, JSON.stringify(ticks));
  for (const { i } of ticks) assert.notEqual(points[i].t.slice(0, 7), points[i - 1].t.slice(0, 7));
  assert.deepEqual(xTicks(sliceDaily(rows, '5Y', '2026-10-05').points, '5Y').map((x) => x.label), ['2026']);
  assert.deepEqual(xTicks(intraday, '1D').map((x) => x.label), ['11 AM', '1 PM', '3 PM'], 'session hours, New York');
  assert.deepEqual(xTicks(intraday, '1W').map((x) => x.label), [], 'one session: no day turns over');
});

test('1D spans the whole session; a half day sits on the left', () => {
  const half = intraday.slice(0, 100);
  const xs = xsOf(half, '1D');
  assert.equal(xs[0], 0);
  assert.ok(xs.at(-1) < 300, String(xs.at(-1)));
  assert.equal(xsOf(intraday, '1D').at(-1), 1000);
  assert.deepEqual(xsOf([{ t: '2026-10-01' }, { t: '2026-10-02' }], '1M'), [0, 1000]);
});

test('every range draws, green when up and red when down', () => {
  const rows = dailyRows();
  const series = { '5Y': { rows }, '1D': { rows: intraday }, '1W': { rows: intraday } };
  for (const range of RANGES) {
    for (const kind of ['line', 'candle']) {
      const { base, points } = rangeView(range, series, '2026-10-05');
      const v = chartView({ points, base, range, kind, id: 'ch-T', price: (n) => `$${n.toFixed(2)}` });
      assert.match(v.html, /<svg /, `${range} ${kind}`);
      const candles = kind === 'candle' && candlesOffered(range, points);
      assert.equal(/<rect /.test(v.html), candles, `${range} ${kind} candles`);
      assert.equal(/class="ch-line"/.test(v.html), !candles, `${range} ${kind} line`);
      assert.ok(v.hover.xs.length === v.hover.tips.length && v.hover.tips.length > 1);
      assert.ok(!/NaN/.test(v.html), `${range} ${kind} has no NaN`);
    }
  }
  const up = chartView({ points: rows.slice(0, 5), base: rows[0], range: '1M', kind: 'line', id: 'a', price: String });
  assert.equal(up.up, true);
  assert.match(up.html, /ch-up/);
  const down = chartView({ points: rows.slice(0, 5).reverse(), base: rows[4], range: '1M', kind: 'line', id: 'b', price: String });
  assert.match(down.html, /ch-down/);
  const w = chartView({ ...rangeView('5Y', series, '2026-10-05'), range: '5Y', kind: 'candle', id: 'c', price: String });
  assert.ok(w.hover.xs[0] > 0 && w.hover.xs.at(-1) < 1, 'the edge candles sit inside the plot');
  assert.equal(w.hover.tips.length, weeklyCandles(rangeView('5Y', series, '2026-10-05').points).length, '5Y candles are weekly');
});

test('hover finds the nearest point', () => {
  const xs = [0, 0.25, 0.5, 1];
  assert.equal(nearestIndex(xs, 0.1), 0);
  assert.equal(nearestIndex(xs, 0.2), 1);
  assert.equal(nearestIndex(xs, 0.8), 3);
  assert.equal(nearestIndex([0.5], 0.9), 0);
});
