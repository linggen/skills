// 射鹿 · 先看风，后看鹿 — full draw in the still wind hits; short or windy misses and
// the stag drinks again; 银月's 「往左偏半寸」 comes after two misses or a long wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, DRAW_MS, drawAt, html, meta, newGame, SHAKE_MS, tick, TOL, windAt } from '../scripts/games/deer.js';

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
    let s = newGame(`d${seed}`);
    const at = stillAt(s, 0, 0);
    s = tick(s, Math.max(0, at - DRAW_MS - 100));
    s = act(s, { g: 'hold' }).state;
    s = tick(s, DRAW_MS + 100);
    assert.ok(windAt(s.sched, s.t) <= TOL, `seed ${seed} still at loose`);
    const r = act(s, { g: 'release' });
    assert.ok(r.won, `seed ${seed}`);
    assert.match(html(r.state, 'zh'), /轰然倒下/);
  }
});

test('a short draw or a windy loose misses — never an end; two misses bring her hint', () => {
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
