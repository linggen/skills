// weekly.js — the Weekly card's pure parts: which report it shows, the
// week's label, a source link's label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestWeek, weekSpan, hostOf, totalsHtml, statusLine } from '../scripts/weekly.js';
import { shownRun, skippedText } from '../scripts/investments.js';
import { setLanguage } from '../scripts/strings.js';

test('the card shows the latest week, none before the first', () => {
  const w = { week: '2026-W40' };
  assert.equal(latestWeek({ latest: '2026-W40', weeks: { '2026-W40': w } }), w);
  assert.equal(latestWeek({}), null);
  assert.equal(latestWeek({ latest: '2026-W41', weeks: {} }), null);
});

test('a week reads Monday to Friday', () => {
  assert.equal(weekSpan('2026-09-28', '2026-10-02'), 'Sep 28 – Oct 2, 2026');
});

test('a source is labelled by its site', () => {
  assert.equal(hostOf('https://www.statcan.gc.ca/en/daily'), 'statcan.gc.ca');
  assert.equal(hostOf('not a url'), '');
});

test('the portfolio is one line, a total per currency — no per-holding table', () => {
  const esc = (s) => String(s);
  const html = totalsHtml({
    holdings: [{ symbol: 'RY.TO' }],
    totals: [
      { currency: 'CAD', value: 13700, value_change: -93.6, change_pct: -0.68, missing: [] },
      { currency: 'USD', value: 19500, value_change: 116.8, change_pct: 0.6, missing: [] },
    ],
  }, esc);
  const text = html.replace(/<[^>]+>/g, '');
  // The currency sign is the viewer's locale's ($ / CA$ / US$).
  assert.match(text, /^CAD −\D*93\.60 \(−0\.68%\) · USD \+\D*116\.80 \(\+0\.60%\)$/, text);
  assert.doesNotMatch(html, /RY\.TO/);
  assert.match(totalsHtml({ totals: [{ currency: 'CAD', value: null, value_change: null, missing: ['RY.TO'] }] }, esc), /no total — RY\.TO had no closes/);
  assert.match(totalsHtml({}, esc), /No holdings this week/);
});

// ── The mission's status line ──────────────────────────────────────────────

const sunday = Math.floor(new Date(2026, 9, 11, 19, 0).getTime() / 1000);
const saidNo = { status: 'skipped', skipped: true, skip: 'run-if', reason: 'no holdings', triggered_at: sunday };

test('a run-if skip is shown; a busy skip is not', () => {
  assert.equal(shownRun(saidNo), true);
  assert.equal(shownRun({ status: 'skipped', skipped: true, skip: 'busy' }), false);
  assert.equal(shownRun({ status: 'skipped', skipped: true }), false);
  assert.equal(shownRun({ status: 'completed', skipped: false }), true);
});

test('the card says a run-if skip as a fact, in the page language', () => {
  setLanguage('en');
  assert.equal(statusLine({ enabled: true }, saidNo, 'en-US'), 'On · Sundays at 19:00 · Skipped Sunday: no holdings');
  assert.equal(skippedText({ ...saidNo, reason: 'feed down' }, 'en-US'), 'Skipped Sunday: feed down');
  setLanguage('zh-Hans');
  assert.equal(skippedText(saidNo, 'zh-CN'), '星期日已跳过：没有持仓');
  setLanguage('en');
});

test('an unfinished run and a plain success keep their lines', () => {
  setLanguage('en');
  assert.equal(statusLine({ enabled: false }, { status: 'failed', skipped: false }), 'Off · the last run didn’t finish');
  assert.equal(statusLine({ enabled: true }, { status: 'completed', skipped: false }), 'On · Sundays at 19:00');
  assert.equal(statusLine({ enabled: true }, null), 'On · Sundays at 19:00');
});
