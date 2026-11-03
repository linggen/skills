// A board replayed inside a sealed instance pays in full (balance.json `play_pay.replay_sealed`, Hanli approved 2026-11-02:
// 「可以, 按你说的做」, option b — 38d5d800): the room's boards are all there is to play while its gates wait, so no falloff
// there. Outside, the same board the same day falls off by `play_pay.replay` (100 · 50 · 10%). The deployer's hand check:
// a 3rd same-day play inside wm-xiongya paid 修为 7 · 灵石 10, outside 1 · 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { playGrant } from '../scripts/rules/playpay.mjs';

const content = loadContent();
const NOW = new Date('2026-11-02T12:00:00');
const PP = content.balance.play_pay;
const BOARD = 'wangzuo-xiongya'; // the cliff's board, wm-xiongya (古五's 秘境, the first room past the door)
const task = content.tasks.tasks.find(t => t.id === BOARD);
/* 古五 at 二层, at `scene`, `n` plays of the board already paid today. */
const at = (scene, place, n) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene, place, ended: ['00-prologue'], tier: 'qi', step: 2, progress: 40,
  plays: { day: dayKey(NOW), ids: { [BOARD]: n } } });
const pays = g => [g?.progress ?? 0, g?.wealth ?? 0];

test('replay_sealed is declared: no falloff inside; the day\'s falloff outside', () => {
  assert.deepEqual(PP.replay_sealed, [1]);
  assert.deepEqual(PP.replay, [1, 0.5, 0.1]);
  assert.ok(task, `${BOARD} is a board`);
});

test('a 3rd same-day play inside wm-xiongya pays as the first; outside the 秘境 it pays the falling share', () => {
  const first = pays(playGrant(content, at('wm-xiongya', 'mijing-duanya', 0), BOARD, task, NOW));
  const inside = pays(playGrant(content, at('wm-xiongya', 'mijing-duanya', 2), BOARD, task, NOW));
  assert.ok(first[0] > 0 && first[1] > 0, `the first play pays: ${first}`);
  assert.deepEqual(inside, first, 'inside: full, every time');
  // The door's own scene (wm-mijing, the beat's first) is not inside: the day's falloff, 10% on the 3rd play.
  const outside = pays(playGrant(content, at('wm-mijing', 'shimen', 2), BOARD, task, NOW));
  const fresh = pays(playGrant(content, at('wm-mijing', 'shimen', 0), BOARD, task, NOW));
  assert.deepEqual(outside, fresh.map(n => Math.round(n * PP.replay[2])), 'outside: the 3rd play at its share');
  assert.ok(outside[0] < inside[0] && outside[1] < inside[1]);
  // The hand check (2026-11-02) read 7 · 10 inside, 1 · 1 outside on its own save (its ★ and 层); here, at 二层 with no ★, the
  // first play's numbers inside and a tenth of them outside.
  assert.deepEqual(outside, [1, 1]);
});
