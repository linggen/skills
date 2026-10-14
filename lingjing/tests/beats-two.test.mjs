// The opening's play beats, batch two (2026-10-14, Hanli 「都可以，按你的单子做」): each game
// opens with a control to touch, draws in both languages, can be finished well and badly,
// always ends won within its limit, and can be skipped — won, no grade, no mark — so a beat
// never blocks the story. The scenes' wiring is tests/opening-beats.test.mjs's BEATS.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as taunt from '../scripts/games/taunt.js';
import * as griddle from '../scripts/games/griddle.js';

const GAMES = [[taunt, /data-g="start"/], [griddle, /data-g="start"/]];

test('every batch-two game: meta in both languages, a control at open, both languages drawn, a skip that ends it won with no grade', () => {
  for (const [mod, control] of GAMES) {
    assert.ok(mod.meta.name.zh && mod.meta.name.en && mod.meta.how.zh && mod.meta.how.en, mod.meta.id);
    const s = mod.newGame('seed');
    assert.match(mod.html(s, 'zh'), control, mod.meta.id);
    for (const lang of ['zh', 'en']) {
      const h = mod.html(s, lang);
      assert.ok(h.length > 40, `${mod.meta.id} ${lang}`);
      assert.doesNotMatch(h, /undefined|NaN|\{\w+\}/, `${mod.meta.id} ${lang}`);
      assert.match(h, /data-g="skip"/, `${mod.meta.id}: the quiet way out`);
    }
    assert.equal(mod.act(s, { g: 'nonsense' }).won, false, 'an unknown move changes nothing');
    const sk = mod.act(s, { g: 'skip' });
    assert.equal(sk.won, true, `${mod.meta.id}: skipped is won`);
    assert.equal(sk.state.grade, null, `${mod.meta.id}: skipped writes no grade`);
    for (const lang of ['zh', 'en']) assert.doesNotMatch(mod.html(sk.state, lang), /undefined|NaN/, `${mod.meta.id} skipped ${lang}`);
  }
});

test('忍字: said back piece by piece — word for word keeps the fist open; wrong pieces and time close it; it always ends', () => {
  let s = taunt.act(taunt.newGame('m'), { g: 'start' }).state;
  assert.equal(s.live, true);
  for (let i = 0; i < 4; i += 1) s = taunt.tick(taunt.act(s, { g: 'say', i }).state, 500);
  assert.equal(s.won, true);
  assert.equal(s.grade, 'word');
  assert.match(taunt.html(s, 'zh'), /一个字不差/);
  assert.match(taunt.html(s, 'en'), /Do a dog bark and you can have a lick/);
  // Out of order or a near miss: the fist closes; 「汪！」 closes it most; the same piece is not tried twice.
  let b = taunt.act(taunt.newGame('m'), { g: 'start' }).state;
  b = taunt.act(b, { g: 'say', i: 4 }).state;
  assert.equal(b.note, 'wrong');
  assert.equal(taunt.act(b, { g: 'say', i: 4 }).won, false);
  assert.equal(taunt.act(b, { g: 'say', i: 4 }).state, b, 'a piece tried is not tried again');
  b = taunt.act(b, { g: 'say', i: 7 }).state;
  assert.equal(b.note, 'bark');
  assert.ok(b.fist > taunt.WRONG + 0.3);
  for (const i of [5, 6]) b = taunt.act(b, { g: 'say', i }).state;
  assert.equal(b.won, true, 'a fist closed all the way ends it');
  assert.equal(b.grade, 'fist');
  // Nothing tapped: the fist closes by itself within the limit.
  const idle = taunt.tick(taunt.act(taunt.newGame('m'), { g: 'start' }).state, taunt.RISE_S * 1000);
  assert.equal(idle.won, true);
  assert.equal(idle.grade, 'fist');
  assert.match(taunt.html(idle, 'zh'), /拳头攥得指节发白/);
});

test('烙饼: call the turn when each side is golden — too soon she waits, too late it scorches, silence and she turns it herself', () => {
  const cook = (to) => {
    let s = griddle.act(griddle.newGame('k'), { g: 'start' }).state;
    for (let i = 0; i < griddle.SIDES.length; i += 1) {
      while (s.d < to) s = griddle.tick(s, 100);
      s = griddle.act(s, { g: 'flip' }).state;
    }
    return s;
  };
  const good = cook(0.8);
  assert.equal(good.won, true);
  assert.equal(good.grade, 'golden');
  assert.ok(good.t < 30000, 'under half a minute');
  assert.match(griddle.html(good, 'zh'), /四面黄澄澄的/);
  assert.equal(cook(1.2).grade, 'scorched');
  let early = griddle.tick(griddle.act(griddle.newGame('k'), { g: 'start' }).state, 500);
  early = griddle.act(early, { g: 'flip' }).state;
  assert.equal(early.note, 'raw', 'still white: nothing turned');
  assert.equal(early.side, 0);
  let idle = griddle.act(griddle.newGame('k'), { g: 'start' }).state;
  while (!idle.won) idle = griddle.tick(idle, 100);
  assert.equal(idle.grade, 'scorched');
  assert.ok(idle.t < 30000, 'she finishes it within half a minute');
  assert.match(griddle.html(idle, 'en'), /scorched side in/);
});
