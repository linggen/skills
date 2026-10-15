// The 古一/古二 play-test's game fixes (2026-10-15 backlog, items 25 26 27 29 30 31):
// the herb tiles drawn, the carry's header at the end, the village pins tappable, the feather's
// pace read over a window, the village maps out of the stuck clock, the climb's grip held at the foot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as carry from '../scripts/games/carry.js';
import * as climb from '../scripts/games/climb.js';
import * as feather from '../scripts/games/feather.js';
import * as vday from '../scripts/games/villageday.js';
import * as dark from '../scripts/games/dark.js';
import { STUCK_MS, stuckNow } from '../scripts/stuck.js';

test('herb tiles (青蒿, 野菊) are drawn as lines, not filled blank', () => {
  let s = vday.act(vday.newGame('h'), { g: 'spot', id: 'herb' }).state;
  const html = vday.html(s, 'zh');
  const paths = [...html.matchAll(/<path class="([^"]+)" d="M0 12 V-(?:12 M0 4|4 M-4)/g)].map((m) => m[1]);
  assert.equal(paths.length, 2, html.slice(0, 400));
  for (const cls of paths) assert.match(cls, /g-line/);
});

test('carry: the header at the end reads 6 / 6 loads and every step, forced or not', () => {
  let s = carry.act(carry.newGame('c'), { g: 'start' }).state;
  s = carry.tick(s, 10 * 60 * 1000); // the time runs out on the first load
  assert.equal(s.won, true);
  const html = carry.html(s, 'zh');
  assert.match(html, /<b>6<\/b> \/ 6/);
  assert.match(html, new RegExp(`<b>${carry.STEPS}</b> / ${carry.STEPS}`));
});

test('village: a pin not yet done is a tap like its button; a done one is not', () => {
  const s = vday.newGame('v');
  const html = vday.html(s, 'zh');
  assert.match(html, /<g class="g-spotmark" data-g="spot" data-id="[a-z]+">/);
  const id = html.match(/data-g="spot" data-id="([a-z]+)"/)[1];
  const done = vday.html({ ...s, done: [id] }, 'zh');
  assert.match(done, /<g class="g-spotmark is-done">/);
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

test('stuck: the village maps opt out of the clock; other boards keep it', () => {
  const v = { mod: vday, state: vday.newGame('v'), shownAt: 0 };
  assert.equal(vday.meta.stuckClock, false);
  assert.equal(stuckNow(v, STUCK_MS * 3), false, 'no 「算了」 on an optional map');
  const d = { mod: dark, state: dark.newGame('d'), shownAt: 0 };
  assert.equal(stuckNow(d, STUCK_MS), true);
});

test('climb: standing at the cliff foot the grip holds; it drains from the first reach on', () => {
  let s = climb.act(climb.newGame('c'), { g: 'start' }).state;
  s = climb.tick(s, 5000);
  assert.equal(s.grip, 1, 'at the foot');
  s = climb.act(s, { g: 'grab', side: s.live_side[0] }).state;
  s = climb.tick(s, 1000);
  assert.ok(s.grip < 1, 'hanging');
});
