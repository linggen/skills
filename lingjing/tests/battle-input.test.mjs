// The ink fight's input (Hanli, 2026-10-15): tap first, drag as well. A tap lifts;
// a 灵兽 or a 功法 with nothing to aim plays on that tap; a targeted 功法 waits for
// its target, and the same card again — or the bare stage — puts it back. A body of
// yours strikes with tap-own, tap-target. A drag is the same two taps in one gesture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dropOf, pickOf } from '../scripts/battle-card.js';

const CATALOG = {
  cub: { id: 'cub', kind: 'minion', cost: 1, atk: 1, hp: 2 },
  bolt: { id: 'bolt', kind: 'spell', cost: 1, effect: { damage: 2 } },
  heal: { id: 'heal', kind: 'spell', cost: 1, effect: { heal: 3 } },
  lift: { id: 'lift', kind: 'spell', cost: 1, effect: { buff: { atk: 1, hp: 1 } } },
};
const body = (id = 'cub') => ({ id, atk: 1, hp: 2, ready: true });
const st = ({ hand = ['cub', 'bolt', 'heal', 'lift'], mine = [body()], theirs = [body('imp')] } = {}) => ({ you: { hand, board: mine }, foe: { board: theirs } });
const tap = (picked, kind, index = -1, s = st()) => pickOf(picked, { kind, index }, s, CATALOG);

test('a tap on a 灵兽 or an untargeted 功法 plays it there and then', () => {
  assert.deepEqual(tap(null, 'hand', 0), { action: { kind: 'play', index: 0 } });
  assert.deepEqual(tap(null, 'hand', 2), { action: { kind: 'play', index: 2 } });
  // a damage 功法 with no body across asks nothing either
  assert.deepEqual(tap(null, 'hand', 1, st({ theirs: [] })), { action: { kind: 'play', index: 1 } });
});

test('a targeted 功法 lifts, and the second tap says where', () => {
  const held = tap(null, 'hand', 1);
  assert.deepEqual(held, { pick: { from: 'hand', index: 1 } });
  assert.deepEqual(tap(held.pick, 'theirs', 0), { action: { kind: 'play', index: 1, target: { kind: 'minion', index: 0 } } });
  assert.deepEqual(tap(held.pick, 'hero'), { action: { kind: 'play', index: 1, target: undefined } });
  // a lift goes on one of yours, and only a lift does
  const lift = tap(null, 'hand', 3).pick;
  assert.deepEqual(tap(lift, 'mine', 0), { action: { kind: 'play', index: 3, target: { kind: 'minion', index: 0 } } });
  assert.deepEqual(tap(held.pick, 'mine', 0), { clear: true });
});

test('the same card again, or the bare stage, puts it back', () => {
  const held = tap(null, 'hand', 1).pick;
  assert.deepEqual(tap(held, 'hand', 1), { clear: true }, 'never played untargeted by a second tap on itself');
  assert.deepEqual(tap(held, 'stage'), { clear: true });
  assert.deepEqual(tap(null, 'stage'), { clear: true });
  // another card lifts that one instead
  assert.deepEqual(tap(held, 'hand', 0), { action: { kind: 'play', index: 0 } });
  assert.deepEqual(tap(held, 'hand', 3), { pick: { from: 'hand', index: 3 } });
});

test('a body of yours strikes with tap-own, tap-target', () => {
  const own = tap(null, 'mine', 0);
  assert.deepEqual(own, { pick: { from: 'board', index: 0 } });
  assert.deepEqual(tap(own.pick, 'theirs', 0), { action: { kind: 'attack', index: 0, target: { kind: 'minion', index: 0 } } });
  assert.deepEqual(tap(own.pick, 'hero'), { action: { kind: 'attack', index: 0, target: undefined } });
  assert.deepEqual(tap(own.pick, 'mine', 0), { clear: true }, 'tapped again: put back');
  const two = st({ mine: [body(), body('fox')] });
  assert.deepEqual(tap(own.pick, 'mine', 1, two), { pick: { from: 'board', index: 1 } }, 'another of yours: that one lifts');
});

test('主灵根一击: straight at the beast with nothing across, else lifted like a card', () => {
  assert.deepEqual(tap(null, 'power', -1, st({ theirs: [] })), { action: { kind: 'power' } });
  const held = tap(null, 'power');
  assert.deepEqual(held, { pick: { from: 'power' } });
  assert.deepEqual(tap(held.pick, 'theirs', 0), { action: { kind: 'power', target: { kind: 'minion', index: 0 } } });
  assert.deepEqual(tap(held.pick, 'hero'), { action: { kind: 'power', target: undefined } });
  assert.deepEqual(tap(held.pick, 'power'), { clear: true });
});

test('结束回合 and 认输 answer whatever is held', () => {
  assert.deepEqual(tap({ from: 'hand', index: 1 }, 'end'), { action: { kind: 'end' } });
  assert.deepEqual(tap({ from: 'board', index: 0 }, 'quit'), { quit: true });
});

test('a drag is the two taps in one gesture', () => {
  const s = st();
  const drop = (from, to) => dropOf(from, to, s, CATALOG);
  assert.deepEqual(drop({ kind: 'hand', index: 1 }, { kind: 'theirs', index: 0 }), { action: { kind: 'play', index: 1, target: { kind: 'minion', index: 0 } } });
  assert.deepEqual(drop({ kind: 'mine', index: 0 }, { kind: 'hero', index: -1 }), { action: { kind: 'attack', index: 0, target: undefined } });
  assert.deepEqual(drop({ kind: 'hand', index: 0 }, { kind: 'stage', index: -1 }), { action: { kind: 'play', index: 0 } }, 'a 灵兽 dragged out of the hand plays');
  assert.deepEqual(drop({ kind: 'hand', index: 0 }, { kind: 'hand', index: 2 }), { clear: true }, 'let go on the hand: nothing');
  assert.deepEqual(drop({ kind: 'hand', index: 1 }, { kind: 'stage', index: -1 }), { clear: true }, 'a targeted card let go on nothing: nothing');
  assert.deepEqual(drop({ kind: 'mine', index: 0 }, { kind: 'mine', index: 0 }), { clear: true });
});
