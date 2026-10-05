// weekly.js — the Weekly card's pure parts: which report it shows, the
// week's label, a source link's label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestWeek, weekSpan, hostOf } from '../scripts/weekly.js';

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
