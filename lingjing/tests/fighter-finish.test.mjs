import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, tick, koClip, KO_FALL_MS, KO_HIT_MS, KO_SEAL_MS } from '../scripts/games/fighter/core.js';

const advance = (s, ms) => tick(s, ms);

test('all hands are ignored as soon as KO or time decides the bout', () => {
  for (const kind of ['ko', 'time']) {
    let s = newGame(kind, 1, { levels: [{ stage: { win: 'yield', timeUp: true }, time: 10 }] });
    if (kind === 'ko') s.foe.bal = 0;
    s = advance(s, 10);
    assert.ok(s.end);
    for (const d of [{ g: 'light' }, { g: 'feijian' }, { g: 'walk', dir: 1 }, { g: 'crouch', on: true }, { g: 'jumpRelease' }, { g: 'run' }]) {
      assert.strictEqual(act(s, d).state, s, `${kind}: ${d.g}`);
    }
  }
});

test('KO loser reels, falls, then the seal follows within 600ms', () => {
  let s = newGame('finish', 1, { levels: [{ stage: { win: 'yield' } }] });
  s.foe.bal = 0;
  s = advance(s, 10);
  assert.equal(koClip(s, 'foe'), 'hit');
  assert.equal(koClip(s, 'me'), null);
  assert.ok(s.freeze > 0 && s.fx.some((f) => f.kind === 'spark'));
  s = advance(s, 100 + KO_HIT_MS);
  assert.equal(koClip(s, 'foe'), 'knock');
  assert.ok(KO_SEAL_MS - KO_FALL_MS <= 600);
  assert.ok(s.t - s.end.at < KO_SEAL_MS);
  s = advance(s, KO_SEAL_MS);
  assert.ok(s.t - s.end.at >= KO_SEAL_MS);
});
