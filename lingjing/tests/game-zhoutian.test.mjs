// 小周天 · 冲三关 — pushes in the breath's stillness open 尾闾 and 夹脊 at once
// (银月 dug them) and 玉枕 in three; a push out of time sets 玉枕 back one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, GATES, html, meta, newGame, phaseAt, tick } from '../scripts/games/zhoutian.js';

const toPhase = (s, want) => { let t = s.t; while (phaseAt(s.breath, t) !== want) t += 20; return tick(s, t - s.t + 40); };

test('meta; the figure has the three passes in order up the back', () => {
  assert.equal(meta.id, 'zhoutian');
  assert.deepEqual(GATES.map((g) => g.id), ['尾闾', '夹脊', '玉枕']);
  assert.ok(GATES[0].y > GATES[1].y && GATES[1].y > GATES[2].y);
});

test('five pushes in the stillness open the circuit', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let s = act(newGame(`z${seed}`), { g: 'start' }).state, won = false, n = 0;
    while (!won && n < 10) {
      s = toPhase(toPhase(s, 'in'), 'rest');
      const r = act(s, { g: 'push' });
      s = r.state; won = r.won; n += 1;
    }
    assert.ok(won, `seed ${seed}`);
    assert.equal(n, 5);
    assert.match(html(s, 'zh'), /小周天，通了/);
  }
});

test('a push out of time sets 玉枕 back one, and opens nothing', () => {
  let s = act(newGame('r'), { g: 'start' }).state;
  for (let i = 0; i < 3; i += 1) s = act(toPhase(toPhase(s, 'in'), 'rest'), { g: 'push' }).state;
  assert.equal(s.at, 2);
  assert.equal(s.got, 1);
  s = act(toPhase(s, 'in'), { g: 'push' }).state;
  assert.equal(s.got, 0);
  assert.equal(s.note, 'rush');
});

test('the breath waits for the start; html draws the figure', () => {
  const s = newGame('h');
  assert.equal(tick(s, 3000).t, 0);
  assert.match(html(s, 'zh'), /sanguan\.webp/);
  assert.match(html(s, 'en'), /data-g="start"/);
});
