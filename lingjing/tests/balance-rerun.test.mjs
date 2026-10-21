// 刷副本 in the economy (design.md § Reruns, 2026-10-21): a 秘境 rerun is one slot of the daily routine —
// 3 h after the last run ends — and its beasts, drops and finds feed the player's 修为 and 灵石.
// tools/balance.mjs plays it: the beasts' 修为 on the haunt table (圆满 → 灵石 at the convert rate), the
// spoils (rules/rerun.mjs runsPay, at a shop's sell) partly sold. This holds that runsPay reads the rules'
// own rolls, that the spoils never move a 回's days, and the rerun's share of the day (balance.json
// model.rerun `share` and `spoils`, `_share` says why).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { rerunsOf, rollRun, runSpoils, runsPay } from '../scripts/rules/rerun.mjs';
import { rerunTable, table } from '../tools/balance.mjs';

const content = loadContent();
const R = content.balance.model.rerun;
const NOW = new Date('2026-10-16T12:00:00');
const sell = id => content.items.items.find(i => i.id === id)?.sell ?? 0;
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol * want, `${what}: rolled ${got.toFixed(3)}, the model ${want.toFixed(3)}`);

test('a run\'s worth is the rules\' own rolls: beasts, elites, the find, the cache and the drops, averaged over many seeds', () => {
  const r = rerunsOf(content)[0], [w] = runsPay(content), s = newState(content, 'zh', NOW), N = 3000;
  let beasts = 0, elites = 0, find = 0, cache = 0, drop = 0;
  for (let k = 0; k < N; k++) {
    for (const room of Object.values(rollRun(content, s, r, `run${k}`, NOW))) {
      beasts += room.foes.length; elites += room.foes.filter(f => f.elite).length;
      if (room.find) find += room.find.n * sell(room.find.item);
      if (room.cache) cache += room.cache.n * sell(room.cache.item);
    }
    // A beast won (one in six an elite, as the roll makes them): what the drop table hands over.
    const st = { ...structuredClone(s), rerun: { id: r.beat.id, seed: `drop${k}`, rooms: { x: { beaten: 0, foes: [{}] } } } };
    drop += runSpoils(content, st, { run: { room: 'x', i: 0 }, elite: k % 6 === 0 }).reduce((t, g) => t + g.got * sell(g.id), 0);
  }
  near(beasts / N, w.beasts, 0.05, 'beasts a run');
  near(elites / beasts, w.elite, 0.2, 'elite share');
  near(find / N, w.goods.find, 0.1, 'the 拾遗 find at sell');
  near(cache / N, w.goods.cache, 0.3, 'the cache at sell');
  near(drop / N, w.goods.drop, 0.1, 'a beast\'s drops at sell');
  assert.ok(w.unsold.find > 0, 'a find no shop buys (鼎苔) is counted apart');
});

test('the spoils are 灵石, never 修为: a 回\'s days are the same whatever is sold or found', () => {
  const vary = rerun => { const c = loadContent(); Object.assign(c.balance.model.rerun, rerun); return table(c); };
  const days = table(content);
  assert.deepEqual(vary({ sold: 0, three_stars: 0, found: 0 }), days);
  assert.deepEqual(vary({ sold: 1, three_stars: 1, found: 1 }), days);
});

test('the rerun\'s share of the day: 修为 a slot, never the clock; most of the 灵石 its fights earn, never all; its spoils about its fights\' own 灵石', () => {
  const say = JSON.stringify(rerunTable(content).map(r => ({ who: r.who, xw: r.xw_share.toFixed(2), ls: r.ls_share.toFixed(2) })));
  for (const r of rerunTable(content)) {
    assert.ok(r.days > 0 && r.runs > 0, `${r.who}: the rerun stands open and is run`);
    const [xlo, xhi] = R.share.xw, [llo, lhi] = R.share.ls;
    assert.ok(r.xw_share >= xlo && r.xw_share <= xhi, `${r.who}: the rerun's 修为 ${r.xw_share.toFixed(2)} of the day, the band ${xlo}–${xhi}\n${say}`);
    assert.ok(r.ls_share >= llo && r.ls_share <= lhi, `${r.who}: the rerun's 灵石 ${r.ls_share.toFixed(2)} of the day, the band ${llo}–${lhi}\n${say}`);
  }
  // A run: the spoils at sell (finds and the cache as often as they are won) over its fights' 灵石.
  const [w] = runsPay(content), won = w.beasts * content.balance.model.fight_win_rate;
  const spoils = w.goods.drop * won + R.found * (w.goods.find + R.three_stars * w.goods.cache), cash = won * content.rewards.tables.haunt.wealth;
  const [lo, hi] = R.spoils;
  assert.ok(spoils / cash >= lo && spoils / cash <= hi, `spoils ${spoils.toFixed(1)} over the fights' ${cash.toFixed(1)} 灵石: ${(spoils / cash).toFixed(2)}, the band ${lo}–${hi}`);
});
