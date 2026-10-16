// The pools' beasts (and the 秘境's rooms), each at the first 回 it can be met, on the same
// measure as tests/fight-band.test.mjs (2026-10-16: about 45% bare, about 65% with two pills, never
// a wall) — fewer seeds, a wider band. A pool's beast is met with whoever stands with him in that 回
// (party.json by_hui — Hanli: 「小队是人数跟剧情走」) and grows with them (party.json `roaming`): with a
// party it is still lost now and then (≥ 10%) and seldom outlasted (≤ 20% ran dry). Met alone it holds
// its band too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { content, FIGHTS, keyOf, rateOf, stateAt, TWO_PILLS } from '../tools/story-fights.mjs';
import { partyFor } from '../scripts/rules/cards.mjs';

const BARE = [0.25, 0.68];
const PILLED = [0.45, 0.88];
const SEEDS = 40;
const pct = x => `${(x * 100).toFixed(1)}%`;

function holds(f, opts, who) {
  const bare = rateOf(f, SEEDS, 0, 'lookahead', opts);
  assert.ok(bare.win >= BARE[0] && bare.win <= BARE[1], `${keyOf(f)} ${who} bare wins ${pct(bare.win)} (lost ${pct(bare.lost)}, ran dry ${pct(bare.withdrew)})`);
  const pilled = rateOf(f, SEEDS, 0, 'lookahead', { ...opts, pills: TWO_PILLS });
  assert.ok(pilled.win >= PILLED[0] && pilled.win <= PILLED[1], `${keyOf(f)} ${who} with two pills wins ${pct(pilled.win)}`);
  return bare;
}

for (const f of FIGHTS.filter(f => f.pool)) {
  const party = partyFor(content, stateAt(f.at), {}).map(m => m.id);
  test(`${f.name} (${f.at}${party.length ? ` · with ${party.join(' + ')}` : ''}): won about 45% bare, about 65% with two pills`, () => {
    const bare = holds(f, {}, party.length ? `with ${party.join(' + ')}` : 'alone');
    if (!party.length) return;
    assert.ok(bare.lost >= 0.1, `${keyOf(f)} with the party is lost ${pct(bare.lost)} — the beast must still win now and then`);
    assert.ok(bare.withdrew <= 0.2, `${keyOf(f)} with the party runs dry ${pct(bare.withdrew)} — outlasted, not fought`);
    holds(f, { party: [] }, 'alone');
  });
}
