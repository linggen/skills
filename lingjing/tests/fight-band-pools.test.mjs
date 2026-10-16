// The pools' beasts (and the 秘境's rooms), each at the first 回 it can be met,
// on the same measure as tests/fight-band.test.mjs: about 60% won the first
// time by a player who thinks a turn ahead. Fewer seeds, a wider band.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, keyOf, rateOf } from '../tools/story-fights.mjs';

const BAND = [0.4, 0.84];
const SEEDS = 40;

for (const f of FIGHTS.filter(f => f.pool)) {
  test(`${f.name} (${f.at}): won about 60% the first time`, () => {
    const r = rateOf(f, SEEDS, 0, 'lookahead');
    assert.ok(r.win >= BAND[0] && r.win <= BAND[1], `${keyOf(f)} wins ${(r.win * 100).toFixed(1)}% (lost ${(r.lost * 100).toFixed(1)}%, ran dry ${(r.withdrew * 100).toFixed(1)}%)`);
  });
}
