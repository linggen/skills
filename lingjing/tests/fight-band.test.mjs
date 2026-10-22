// 卷一's story fights, each the FIRST time a player meets it, with the realm,
// hand and gear the road gives then (tools/story-fights.mjs), by a player who
// thinks a turn ahead (fightline.js lookahead). Hanli, 2026-10-16 (「灵石要有用，
// 战斗难一点」): with no pills a first meeting is won about 45% of the time —
// still really winnable, never a money wall — and with two pills in the 丹囊
// (a 回春丹 and a 回气丹, battle.js § pills) about 65%. The tutorial 三试 sits
// easier. Locked here at 60 fixed seeds with room for the noise. The pools:
// tests/fight-band-pools.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, keyOf, rateOf, TWO_PILLS } from '../tools/story-fights.mjs';

const BARE = [0.3, 0.62];
const PILLED = [0.5, 0.9];
const NEVER_WALL = 0.2;
const SEEDS = 60;

for (const f of FIGHTS.filter(f => !f.pool)) {
  test(`${f.name} (${f.at}): won about 45% bare, about 65% with two pills — never a wall`, () => {
    const bare = rateOf(f, SEEDS, 0, 'lookahead');
    const [lo, hi] = f.band ?? BARE;
    assert.ok(bare.win >= lo && bare.win <= hi, `${keyOf(f)} bare wins ${(bare.win * 100).toFixed(1)}% (band ${lo * 100}–${hi * 100}; lost ${(bare.lost * 100).toFixed(1)}%, ran dry ${(bare.withdrew * 100).toFixed(1)}%)`);
    // Never a money wall: without a single pill it is still won often enough to be played through.
    assert.ok(bare.win >= NEVER_WALL, `${keyOf(f)} won only ${(bare.win * 100).toFixed(1)}% without pills`);
    // A fight not won must sometimes be LOST, not only waited out (Hanli 2026-10-16, 灵草谷's 犰狳: 让他能真的输).
    // …but a teaching fight (`teach`: 00-fox, 2026-10-22) is meant never to be lost.
    if (!f.teach) assert.ok(bare.lost >= 0.08, `${keyOf(f)} is lost only ${(bare.lost * 100).toFixed(1)}% — it never threatens`);
    // A 试 passed by outlasting it is not driven down by force (邹青松's shield, 秦雁's footwork).
    if (f.unforced) assert.ok(bare.forced <= 0.15, `${keyOf(f)} driven to 0 in ${(bare.forced * 100).toFixed(1)}% — a 试 is outlasted, not beaten`);
    if (f.nopills) return; // the 三试: a mortal with no 灵石 and no pill
    const pilled = rateOf(f, SEEDS, 0, 'lookahead', { pills: TWO_PILLS });
    const [plo, phi] = f.pilled ?? PILLED;
    assert.ok(pilled.win >= plo && pilled.win <= phi, `${keyOf(f)} with two pills wins ${(pilled.win * 100).toFixed(1)}% (band ${plo * 100}–${phi * 100})`);
    // Pills never make it harder (within the deals' noise: the line plays them as it sees fit).
    assert.ok(pilled.win >= bare.win - 0.08, `${keyOf(f)}: pills made it harder (${(bare.win * 100).toFixed(1)}% → ${(pilled.win * 100).toFixed(1)}%)`);
  });
}
