// The pools' beasts (and the 秘境's rooms), each at the first 回 it can be met, on the same
// measure as tests/fight-band.test.mjs (2026-10-16: about 45% bare, about 65% with two pills, never
// a wall) — fewer seeds, a wider band. A pool's beast is met roaming, alone (party.json roams_alone).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, keyOf, rateOf, TWO_PILLS } from '../tools/story-fights.mjs';

const BARE = [0.25, 0.68];
const PILLED = [0.45, 0.88];
const SEEDS = 40;

for (const f of FIGHTS.filter(f => f.pool)) {
  test(`${f.name} (${f.at}): won about 45% bare, about 65% with two pills`, () => {
    const bare = rateOf(f, SEEDS, 0, 'lookahead');
    assert.ok(bare.win >= BARE[0] && bare.win <= BARE[1], `${keyOf(f)} bare wins ${(bare.win * 100).toFixed(1)}% (lost ${(bare.lost * 100).toFixed(1)}%, ran dry ${(bare.withdrew * 100).toFixed(1)}%)`);
    const pilled = rateOf(f, SEEDS, 0, 'lookahead', { pills: TWO_PILLS });
    assert.ok(pilled.win >= PILLED[0] && pilled.win <= PILLED[1], `${keyOf(f)} with two pills wins ${(pilled.win * 100).toFixed(1)}%`);
  });
}
