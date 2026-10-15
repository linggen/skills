// Layers 1 and 2 of the game's tests (tools/explore.mjs; Hanli, 2026-10-15: 「游戏的分支太多,
// 我们应该怎么测试呢」). Layer 1: 卷一's whole state space from a fresh save — every exit, every
// grade of every board and its skip, every scene fight won and lost-then-retried — the
// health check clean at every save, every scene reached, every exit taken, and 卷一's end
// still ahead of every save. Layer 2: whole plays by policy — all-win, all-skip,
// lose-then-retry, and fifty random players — each ends 卷一 clean, the realm at each 回's
// end inside the book's band.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, stepOfLayer } from '../scripts/state.mjs';
import { rankOf } from '../scripts/rules/cap.mjs';
import { coverage, explore, playBoard, sweep } from '../tools/explore.mjs';
import { resolve } from '../scripts/rules.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '0';
const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');

test('Layer 1: 卷一 explored — 100% of scenes and exits, every grade and fight, no problem, the end ahead of every save', () => {
  const r = explore(content);
  const cov = coverage(r);
  assert.equal(r.cut, false, 'the explorer ran to its end');
  assert.ok(r.reachedEnd, '卷一\'s end is reached');
  assert.deepEqual(cov.scenes.missing, [], 'scenes never reached');
  assert.deepEqual(cov.exits.missing, [], 'exits never taken');
  assert.deepEqual(cov.boards.missing, [], 'boards never played');
  assert.deepEqual(cov.grades.missing, [], 'board outcomes never played');
  assert.deepEqual(cov.fights.missing, [], 'fight outcomes never played');
  assert.deepEqual(r.problems.map(p => `${p.id} @ ${p.at}: ${p.text}`), []);
});

test('a board left with no grade leaves every graded exit to him: 00-cave\'s 喂饼 skipped, both 分它一半 and 留着 stand', () => {
  // The bug the explorer found (2026-10-15): skip 喂饼 and both exits, each waiting on a grade, were shut.
  let at = walk(newState(content, 'zh', NOW), TO_VALLEY.slice(0, TO_VALLEY.findIndex(([, a]) => a?.exit === 'share')), content, NOW);
  assert.equal(at.scene, '00-cave');
  for (const id of ['cave-stone', 'bread-share']) at = playBoard(content, at, id, 'skip', NOW);
  assert.equal(at.grades?.['bread-share'], undefined);
  for (const exit of ['share', 'keep']) assert.equal(resolve(at, content, { now: NOW, quests: [] }, { exit }).result.ok, true, exit);
});

const caps = content.ladder.caps.hui;
const storyRank = hui => { const c = caps[hui]; const at = c?.story ?? c; return at ? rankOf(content, at.tier, stepOfLayer(content, at.tier, at.layer)) : Infinity; };
function played(policy, seed = 1) {
  const r = sweep(content, policy, { seed });
  assert.equal(r.ended, true, `${policy}#${seed} ended 卷一: ${JSON.stringify(r.problems)}`);
  assert.deepEqual(r.problems.map(p => `${p.id} @ ${p.at}: ${p.text}`), [], `${policy}#${seed}`);
  for (const x of r.ranks) assert.ok(rankOf(content, x.tier, x.layer) <= storyRank(x.hui), `${policy}#${seed}: ${x.hui} left at ${x.tier}:${x.layer}, past the book`);
  return r;
}

test('Layer 2: all-win, all-skip and lose-then-retry each end 卷一 clean, the realm per 回 inside the book', () => {
  const ranks = ['all-win', 'all-skip', 'lose-retry'].map(p => played(p).ranks.map(x => `${x.hui}:${x.tier}:${x.layer}`));
  // The story carries every player the same way: no task done or skipped moves the book's rank.
  assert.deepEqual(ranks[1], ranks[0]);
  assert.deepEqual(ranks[2], ranks[0]);
  assert.ok(ranks[0].includes('h09:foundation:0'), '卷一 ends at 筑基');
});

test('Layer 2: fifty random players end 卷一 clean', () => {
  for (let seed = 1; seed <= 50; seed++) played('random', seed);
});
