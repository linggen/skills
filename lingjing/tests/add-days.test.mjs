// A scratch save's clock moves by calendar days, not by 24 h: across a DST change a day is 23 or 25 h, and
// 2026-11-01's 货郎 day, 48 h from just after midnight, landed on the day before his (an empty shelf).
process.env.TZ = 'America/Halifax';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../scripts/rules/files.mjs';

test('n days on is the same local hour n calendar days later, across a DST change either way', () => {
  const fall = addDays(new Date(2026, 10, 1, 0, 30), 2); // clocks went back that night
  assert.deepEqual([fall.getMonth(), fall.getDate(), fall.getHours(), fall.getMinutes()], [10, 3, 0, 30]);
  const spring = addDays(new Date(2026, 2, 8, 0, 30), 1); // and forward in March
  assert.deepEqual([spring.getMonth(), spring.getDate(), spring.getHours()], [2, 9, 0]);
  assert.equal(addDays(new Date(2026, 0, 31, 12), 1).getDate(), 1, 'a month rolls over');
});
