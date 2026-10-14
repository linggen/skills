// 射鹿 · 先看风，后看鹿 — full draw in the still wind, aimed half an inch left, hits;
// short, windy or dead on misses and the stag drinks again; 银月's 「往左偏半寸」
// comes after a miss or a long wait; after four misses the aim goes left by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, DRAW_MS, drawAt, GUIDED, html, meta, newGame, SHAKE_MS, tick, TOL, windAt } from '../scripts/games/deer.js';

const stillAt = (s, from, need) => { for (let t = from; t < 170000; t += 50) { let ok = true; for (let k = 0; k <= need; k += 50) if (windAt(s.sched, t + k) > TOL) { ok = false; break; } if (ok) return t; } return -1; };
const windyAt = (s, from) => { for (let t = from; t < 170000; t += 50) if (windAt(s.sched, t) > 0.5) return t; return -1; };

test('meta; the draw opens, then the wrist shakes it down', () => {
  assert.equal(meta.id, 'deer');
  assert.ok(meta.name.en && meta.how.zh);
  assert.equal(drawAt(DRAW_MS), 1);
  assert.ok(drawAt(SHAKE_MS + 1500) < 1);
  assert.ok(drawAt(60000) >= 0.5);
});

test('drawn full and loosed in the still wind: the stag', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let s = act(newGame(`d${seed}`), { g: 'aim', to: 'left' }).state;
    const at = stillAt(s, 0, 0);
    s = tick(s, Math.max(0, at - DRAW_MS - 100));
    s = act(s, { g: 'hold' }).state;
    s = tick(s, DRAW_MS + 100);
    assert.ok(windAt(s.sched, s.t) <= TOL, `seed ${seed} still at loose`);
    const r = act(s, { g: 'release' });
    assert.ok(r.won, `seed ${seed}`);
    assert.equal(r.state.grade, 'clean', 'the first arrow');
    assert.match(html(r.state, 'zh'), /轰然倒下/);
  }
});

/* Full and in the still: the shot the player can make well or badly. */
function shoot(s) {
  const at = stillAt(s, s.t + DRAW_MS + 100, 0);
  s = tick(s, at - s.t - DRAW_MS - 100);
  s = act(s, { g: 'hold' }).state;
  s = tick(s, DRAW_MS + 100);
  return act(s, { g: 'release' });
}

test('dead on, even in the still, the arrow skims the antlers; her 「往左偏半寸」 then — and the stag always falls', () => {
  let s = newGame('aim');
  let r = shoot(s);
  assert.equal(r.won, false);
  assert.equal(r.state.note, 'wide');
  assert.equal(r.state.hint, true);
  assert.match(html(r.state, 'zh'), /往左偏半寸/);
  assert.match(html(r.state, 'zh'), /is-hinted/, 'the left aim is shown');
  // Stubborn: dead on again and again — at four misses her voice moves his hands.
  for (let i = 1; i < GUIDED; i += 1) { s = r.state; r = shoot(s); }
  assert.equal(r.state.aim, 'left');
  assert.equal(r.state.note, 'guided');
  r = shoot(r.state);
  assert.equal(r.won, true);
  assert.equal(r.state.grade, 'rough', 'after many misses');
  // Told once, and taken: the second arrow.
  r = shoot(act(shoot(newGame('aim')).state, { g: 'aim', to: 'left' }).state);
  assert.equal(r.won, true);
  assert.equal(r.state.grade, 'steady');
  assert.equal(act(newGame('x'), { g: 'aim', to: 'up' }).state.aim, 'straight', 'only the two aims');
});

test('a short draw or a windy loose misses — never an end; a miss brings her hint', () => {
  let s = newGame('m');
  s = act(s, { g: 'hold' }).state;
  s = tick(s, 200);
  let r = act(s, { g: 'release' });
  assert.equal(r.won, false);
  assert.equal(r.state.note, 'short');
  s = r.state;
  s = tick(s, Math.max(0, windyAt(s, s.t) - s.t - DRAW_MS - 100));
  s = act(s, { g: 'hold' }).state;
  s = tick(s, DRAW_MS + 100);
  if (windAt(s.sched, s.t) > 0.5) {
    r = act(s, { g: 'release' });
    assert.equal(r.won, false);
    assert.equal(r.state.note, 'drift');
    assert.equal(r.state.hint, true);
    assert.match(html(r.state, 'zh'), /往左偏半寸/);
  }
});

test('the hint also comes with waiting; a hold is its own control', () => {
  const s = tick(newGame('w'), 16000);
  assert.equal(s.hint, true);
  assert.match(html(newGame('w'), 'en'), /data-g-hold="draw"/);
  assert.equal(act(newGame('w'), { g: 'release' }).won, false);
});
