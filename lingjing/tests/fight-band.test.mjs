// 卷一's story fights, each the FIRST time a player meets it, with the realm,
// hand and gear the road gives then (tools/story-fights.mjs). Hanli,
// 2026-10-15: 都太简单了 — a first meeting is won about 60% of the time
// (balance.json's 52–68 band) by a player who thinks a turn ahead
// (fightline.js lookahead — it plays as a careful person did by hand, who won
// 卢方 at 22/22 when the one-ply `careful` line said 60%). The tutorials,
// 蠪侄 and 小狰, about 75%. Tuned at 60 seeds; locked here at 60 fixed seeds
// with room for the noise, so a later change cannot make one trivial (or a
// wall) without this failing. The pools: tests/fight-band-pools.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, keyOf, rateOf } from '../tools/story-fights.mjs';

const BAND = [0.44, 0.8];
const SEEDS = 60;

for (const f of FIGHTS.filter(f => !f.pool)) {
  test(`${f.name} (${f.at}): won about 60% the first time`, () => {
    const r = rateOf(f, SEEDS, 0, 'lookahead');
    const [lo, hi] = f.band ?? BAND;
    assert.ok(r.win >= lo && r.win <= hi, `${keyOf(f)} wins ${(r.win * 100).toFixed(1)}% (band ${lo * 100}–${hi * 100}; lost ${(r.lost * 100).toFixed(1)}%, ran dry ${(r.withdrew * 100).toFixed(1)}%)`);
    // A 试 passed by outlasting it is not driven down by force (邹青松's shield, 秦雁's footwork).
    if (f.unforced) assert.ok(r.forced <= 0.15, `${keyOf(f)} driven to 0 in ${(r.forced * 100).toFixed(1)}% — a 试 is outlasted, not beaten`);
  });
}
