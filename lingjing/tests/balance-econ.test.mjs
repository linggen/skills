// The pacing tool taught the economy (design.md § 耗材, 2026-11-12; tools/balance.mjs --econ): four players — light ·
// typical · heavy, and `frugal`, who buys nothing — with the 秘境 runs, the 聚灵阵 and its levels; the old report reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { econTable, playersOf, runMeans, table } from '../tools/balance.mjs';

const content = loadContent();

test('the economy\'s players: the three with their fields laid on, and one who buys nothing', () => {
  const P = playersOf(content, { econ: true }), base = content.balance.model.players;
  assert.deepEqual(Object.keys(P), ['light', 'typical', 'heavy', 'frugal']);
  assert.equal(P.frugal.minutes, base.typical.minutes, 'frugal plays as the typical player');
  assert.deepEqual([P.frugal.lay, P.frugal.arrays, P.frugal.pills], [0, false, 0], '…and buys nothing');
  assert.deepEqual(playersOf(content, { old: true }), base, '--old: the players as they were');
});

test('the old report is reachable: --old plays the players without the economy\'s fields', () => {
  assert.deepEqual(table(content, { old: true }).map(r => Object.keys(r)), table(content, { old: true }).map(() => ['hui', 'light', 'typical', 'heavy']));
});

test('a 秘境 run as the model plays it: 15–25 minutes, its 体力 its rooms\' when the door asks none', () => {
  for (const n of [1, 4, 9]) {
    const r = runMeans(content, n);
    assert.ok(r.minutes >= 15 && r.minutes <= 25, `${n}: ${r.minutes}`);
    assert.ok(r.stamina > 0 && r.stamina <= r.minutes);
    assert.ok(r.wealth > content.balance.mijing.wealth.clear);
  }
});

test('the economy\'s report: per 回 days and 修为 by source; 灵石 in, out and at the end; the buyer of nothing spends none', () => {
  const rows = econTable(content);
  assert.deepEqual(rows.map(r => r.who), ['light', 'typical', 'heavy', 'frugal']);
  for (const r of rows) {
    assert.ok(r.rows.length > 5 && r.rows.every(x => 'src' in x && 'days' in x));
    assert.ok(Math.abs(r.earned - r.spent - r.end) < 1e-6, `${r.who}: in − out = what is left`);
  }
  const f = rows.find(r => r.who === 'frugal');
  assert.equal(f.spent, 0);
  assert.equal(f.src.bought, 0);
});
