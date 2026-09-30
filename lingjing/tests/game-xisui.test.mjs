// 洗髓 · 疼，别喊 — the incense burns only while held; breathing in the troughs is
// free, letting go on a wave restarts the stick; three sticks, then the jump.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, html, meta, newGame, painAt, STICK_MS, STICKS, tick, WAVE } from '../scripts/games/xisui.js';

/* A patient player: holds, and lets go only in a trough, before a wave could outlast his breath. */
function patient(seed) {
  let s = newGame(seed), steps = 0;
  while (s.stick < STICKS && steps < 20000) {
    const trough = painAt(s.sched, s.t) <= WAVE;
    if (!s.holding && s.breath > 0.9) s = act(s, { g: 'hold' }).state;
    else if (s.holding && s.breath < 0.6 && trough) s = act(s, { g: 'release' }).state;
    s = tick(s, 50);
    steps += 1;
  }
  return s;
}

test('meta in both languages', () => {
  assert.equal(meta.id, 'xisui');
  assert.ok(meta.name.en && meta.how.zh && meta.how.en);
});

test('a patient player burns three sticks without crying out, then jumps into the beam', () => {
  for (let seed = 0; seed < 10; seed += 1) {
    const s = patient(`p${seed}`);
    assert.equal(s.stick, STICKS, `seed ${seed}`);
    assert.equal(s.cries, 0, `seed ${seed}`);
    const r = act(s, { g: 'jump' });
    assert.ok(r.won);
    assert.match(html(r.state, 'zh'), /顶梁/);
  }
});

test('letting go on a wave restarts the stick; in a trough it costs nothing', () => {
  let s = newGame('w');
  const wave = s.sched.find((x) => x.level > WAVE);
  s = act(s, { g: 'hold' }).state;
  s = tick(s, 400);
  const before = s.prog;
  s = act(s, { g: 'release' }).state; // t=400 is in the first trough
  assert.equal(s.prog, before);
  assert.equal(s.cries, 0);
  s = tick(s, wave.from + 200 - s.t);
  s = act(s, { g: 'hold' }).state;
  s = tick(s, 300);
  s = act(s, { g: 'release' }).state;
  assert.equal(s.prog, 0);
  assert.equal(s.cries, 1);
  assert.equal(s.note, 'cry');
});

test('the incense burns only while held; no jump before three', () => {
  let s = tick(newGame('i'), STICK_MS * 2);
  assert.equal(s.stick, 0);
  assert.equal(act(s, { g: 'jump' }).won, false);
  assert.match(html(s, 'en'), /data-g-hold="grit"/);
});
