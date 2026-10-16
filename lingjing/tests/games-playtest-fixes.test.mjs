// The 古一/古二 play-test's game fixes (2026-10-15 backlog, items 25 26 27 29 30 31):
// the carry's header at the end, the feather's pace read over a window (the climb's grip went with 攀,
// cut 10-16; the herb tiles, the village pins went with 石坳村's map, cut 10-16).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as carry from '../scripts/games/carry.js';
import * as feather from '../scripts/games/feather.js';
import * as dark from '../scripts/games/dark.js';
import { STUCK_MS, stuckNow } from '../scripts/stuck.js';

test('carry: the header at the end reads 6 / 6 loads and every step, forced or not', () => {
  let s = carry.act(carry.newGame('c'), { g: 'start' }).state;
  s = carry.tick(s, 10 * 60 * 1000); // the time runs out on the first load
  assert.equal(s.won, true);
  const html = carry.html(s, 'zh');
  assert.match(html, /<b>6<\/b> \/ 6/);
  assert.match(html, new RegExp(`<b>${carry.STEPS}</b> / ${carry.STEPS}`));
});

test('feather: a slow stroke stays slow however the ticks fall (a 3 ms catch-up tick never spikes the pace)', () => {
  let s = feather.act(feather.newGame('f'), { g: 'hold' }).state;
  // 60 px/s, delivered as a move every 50 ms with a 3 ms catch-up tick before each
  for (let k = 0; k < 40; k += 1) {
    s = feather.tick(s, 47);
    s = feather.act(s, { g: 'move', d: 3 }).state;
    s = feather.tick(s, 3);
  }
  assert.equal(s.phase, 'out', `still breathing (${s.note})`);
  assert.ok(s.v > feather.VMIN && s.v < feather.VMAX, `pace ${s.v}`);
  assert.ok(s.flutter === 0, 'never shook');
});

test('stuck: a board that opts out of the clock is never left by it; other boards keep it', () => {
  const optOut = { mod: { meta: { stuckClock: false } }, state: { won: false }, shownAt: 0 };
  assert.equal(stuckNow(optOut, STUCK_MS * 3), false, 'no 「算了」 on a board with its own way out');
  const d = { mod: dark, state: dark.newGame('d'), shownAt: 0 };
  assert.equal(stuckNow(d, STUCK_MS), true);
});
