// 卷一's fights, each the FIRST time a player meets it, with the realm, hand
// and gear the road gives then (tools/story-fights.mjs). Hanli, 2026-10-15:
// 都太简单了 — a first meeting is won about 60% of the time by the sim's
// careful line (one-ply greedy; it does not read the beast's intent), so a
// careful player wins it reliably and a careless one loses. Tuned at 300
// seeds to 60 ± 8 (the tutorials, 蠪侄 and 小狰, to ~75); locked here at 100
// fixed seeds with room for the noise, so a later change cannot make one
// trivial (or a wall) without this failing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, keyOf, rateOf } from '../tools/story-fights.mjs';

const BAND = [0.47, 0.73];
const SEEDS = 100;

for (const f of FIGHTS) {
  test(`${f.name} (${f.at}): won about 60% the first time`, () => {
    const r = rateOf(f, SEEDS);
    const [lo, hi] = f.band ?? BAND;
    assert.ok(r.win >= lo && r.win <= hi, `${keyOf(f)} wins ${(r.win * 100).toFixed(1)}% (band ${lo * 100}–${hi * 100}; lost ${(r.lost * 100).toFixed(1)}%, ran dry ${(r.withdrew * 100).toFixed(1)}%)`);
    // A fight not won must sometimes be LOST, not only waited out (its twelve cards spent): the beast threatens.
    if (!f.band) assert.ok(r.lost >= 0.08, `${keyOf(f)} is lost only ${(r.lost * 100).toFixed(1)}% — it never threatens`);
    // A 试 passed by outlasting it is not driven down by force (邹青松's shield, 秦雁's footwork).
    if (f.unforced) assert.ok(r.forced <= 0.15, `${keyOf(f)} driven to 0 in ${(r.forced * 100).toFixed(1)}% — a 试 is outlasted, not beaten`);
  });
}
