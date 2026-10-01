// 主线赶路不扣体力 (Hanli, 2026-10-01: 「可以，主线赶路不扣体力」). 卷一's
// play-through hit two 5–6 h 体力 lockouts on the story path. A trip toward the
// place the page's goal line names (Look's `waypoint`) costs nothing; roaming
// off it, errands and cultivation still pay. rules/errands.mjs onStoryRoad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, move } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-09-30T12:00:00');
const ctx = { now: NOW, quests: [] };
const cost = content.rewards.stamina.cost.move;
const trip = n => Math.min(cost.max, cost.base + (n - 1) * cost.per_road);

/* 第十回 with 01-cauldron waiting at 漳源 (sibei › zhangnan › hebo › zhangyuan). */
const atSibei = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-cauldron', place: 'sibei',
  ended: ['00-prologue', '00-waimen', '00-zhuji'], done_scenes: ['01-arrive', '01-ye', '01-altar', '01-rise'],
  tier: 'foundation', step: 0, traits: ['wood'], stamina: 100, stamina_at: NOW.toISOString(), ...extra,
});
const walk = (s, place) => {
  const r = move(s, content, ctx, { place });
  assert.equal(r.result.ok, true, `${place}: ${JSON.stringify(r.result)}`);
  return r.state;
};

test('the goal line names the scene\'s place: walking there is free, the whole road', () => {
  const s = atSibei();
  assert.equal(look(s, content, ctx).waypoint.place.id, 'zhangyuan', 'the page\'s goal line');
  const there = walk(s, 'zhangyuan');
  assert.equal(there.place, 'zhangyuan');
  assert.equal(there.stamina, 100, '主线赶路不扣体力');
});

test('a place on the shortest road to the story is free too; one off it is roaming and pays', () => {
  const s = atSibei();
  assert.equal(walk(s, 'zhangnan').stamina, 100, 'the first road on the way');
  assert.equal(walk(s, 'hebo').stamina, 100, 'two roads on the way');
  // 邺城 is two roads from here and two from 漳源: four, not the story's three.
  assert.equal(walk(s, 'ye').stamina, 100 - trip(2), 'a detour pays by the road');
  assert.equal(walk(s, 'sishui').stamina, 100 - trip(1), 'away from the story pays');
});

test('an empty pool still walks the story\'s road, and refuses a roam', () => {
  const s = atSibei({ stamina: 0, resting: true });
  assert.equal(walk(s, 'zhangyuan').place, 'zhangyuan', 'the story never locks him out');
  assert.equal(move(s, content, ctx, { place: 'sishui' }).result.refused, 'no-stamina');
});

test('standing at the scene, walking away is roaming and pays', () => {
  const s = atSibei({ place: 'zhangyuan' });
  assert.equal(look(s, content, ctx).waypoint, null, 'at the scene the goal line names no road');
  assert.equal(walk(s, 'hebo').stamina, 100 - trip(1));
});
