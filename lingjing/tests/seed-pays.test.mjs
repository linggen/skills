// A seeded save owes nothing on its first load (2026-10-21, the live review: a save seeded at 01-altar got
// 540 灵石 of 补发 on its first load — the forward run filled each 回's layer but never handed its stage
// quest in). The run hands each one in where a player would (rules/progress.mjs handIn), and a missed
// 渡劫 throw is thrown again after the cooldown, the 修为 it took sat back (one seed in thirty stuck at
// 09-cliff with 「every way taken」: a 95% throw missed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo, targetOf } from '../scripts/rules.mjs';
import { settleStages } from '../scripts/rules/gates.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();

test('a save seeded at any 回 owes no stage quest: the first load pays nothing back', () => {
  const NOW = new Date('2026-10-15T09:00:00+08:00');
  const labels = ['古四', '古六', '古七', '古八', '古九', '01-altar'];
  const seen = new Map();
  playTo(content, newState(content, 'zh', NOW), null, { now: NOW, targets: labels.map((l) => [l, targetOf(content, l)]), onAt: (l, s, r) => seen.set(l, { s, now: r.now }) });
  for (const l of labels) {
    const { s, now } = seen.get(l);
    assert.equal(settleStages(content, s, now), s, `${l}: nothing owed (${(s.stages ?? []).length} handed in)`);
  }
  assert.ok((seen.get('01-altar').s.stages ?? []).length >= 9, 'every gate on the way handed in');
});

test('a missed 筑基 throw is thrown again: the seed that stuck at 09-cliff reaches 01-altar', () => {
  // The clock of the seed that stuck (its save's die missed the 95% throw).
  const now = new Date(Date.parse('2026-10-21T09:00:00+08:00') + 26 * (7 * 3600_000 + 13_000));
  const out = playTo(content, newState(content, 'zh', now), '01-altar', { now });
  assert.equal(out.state.scene, '01-altar');
  assert.ok(out.state.breakthrough?.tries?.foundation >= 2, 'thrown again');
  assert.ok(out.days >= 1, 'the cooldown waited out on the clock');
});
