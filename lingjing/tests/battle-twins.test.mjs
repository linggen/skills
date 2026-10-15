// Two of the same card on one rank are two bodies (Hanli, 2026-10-15: hitting the
// second 夫诸 lit the first). The rules aim by slot; every body also carries its own
// `uid`, written into each log entry about it, so the screen draws the blow on the
// body that took it. And 参悟's 反噬: the card says what a dry deck will cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, battle, begin, offers, view } from '../scripts/battle.js';
import { backlashOf, pickOf } from '../scripts/battle-card.js';

const CARDS = {
  deer: { id: 'deer', kind: 'minion', name: '夫诸', cost: 1, element: 'water', atk: 2, hp: 5 },
  guard: { id: 'guard', kind: 'minion', name: '山鬼', cost: 1, element: 'earth', atk: 1, hp: 4, keywords: ['taunt'] },
  bolt: { id: 'bolt', kind: 'spell', name: '火弹术', cost: 1, element: 'fire', effect: { damage: 2 } },
  grow: { id: 'grow', kind: 'spell', name: '培元', cost: 1, element: 'wood', effect: { buff: { atk: 1, hp: 1 } } },
  lock: { id: 'lock', kind: 'spell', name: '锁', cost: 1, element: 'water', effect: { chain: 1 } },
  gulp: { id: 'gulp', kind: 'spell', name: '吞', cost: 1, element: 'earth', effect: { swallow: 3 } },
  canwu: { id: 'canwu', kind: 'spell', name: '参悟', cost: 1, element: 'earth', effect: { draw: 3 } },
};

const setup = (you = {}, foe = {}) => ({
  mode: 'pve', seed: 'twins',
  you: { tier: 'qi', root: 'fire', deck: ['deer', 'deer', 'deer', 'bolt', 'bolt', 'grow', 'lock', 'gulp', 'canwu', 'bolt'], ...you },
  foe: { tier: 'qi', root: 'wood', deck: ['deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer'], ...foe },
});

/* Both ranks hold two 夫诸, stood through the rules so each has its uid. */
function twins(hand) {
  const st = begin(setup(), CARDS);
  for (const side of [st.you, st.foe]) {
    side.hand = ['deer', 'deer'];
    side.mana = 9;
    st.whose = side.who;
    act(st, { kind: 'play', index: 0 }, side.who);
    act(st, { kind: 'play', index: 0 }, side.who);
  }
  st.whose = 'you';
  st.you.mana = 9;
  for (const m of [...st.you.board, ...st.foe.board]) m.sick = false;
  st.you.hand = [...hand];
  return st;
}
const lastAbout = (st, kind) => [...st.log].reverse().find(t => t.act === kind);

test('every body stands with its own uid, and the view carries it', () => {
  const st = twins([]);
  const uids = [...st.you.board, ...st.foe.board].map(m => m.uid);
  assert.equal(new Set(uids).size, 4, 'four bodies, four numbers');
  assert.deepEqual(view(st).foe.board.map(m => m.uid), st.foe.board.map(m => m.uid));
  assert.deepEqual(begin(setup(), CARDS).uid, 0, 'counted from nothing, never random');
});

test('a spell at the SECOND of two identical beasts hits the second, and the log names it', () => {
  const st = twins(['bolt']);
  const [a, b] = st.foe.board;
  assert.ok(act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 1 } }).ok);
  assert.equal(a.hp, 5, 'the first is untouched');
  assert.ok(b.hp < 5, 'the second took it');
  const hit = lastAbout(st, 'hurt-minion');
  assert.equal(hit.uid, b.uid, 'the log points at the body that was hit, not the first of its card');
  assert.equal(hit.element, 'fire', 'and says the blow\'s root, for the hit effect');
});

test('an attack from your SECOND twin into their SECOND twin: the right two trade, and a withdraw names the right one', () => {
  const st = twins([]);
  st.foe.board[1].hp = 1;
  const [mineA, mineB] = st.you.board, [theirA, theirB] = st.foe.board;
  assert.ok(act(st, { kind: 'attack', index: 1, target: { kind: 'minion', index: 1 } }).ok);
  assert.equal(mineA.struck, false);
  assert.equal(mineB.struck, true, 'the second of yours struck');
  assert.equal(theirA.hp, 5, 'their first stands whole');
  assert.deepEqual(st.foe.board, [theirA], 'their second is driven off');
  assert.equal(lastAbout(st, 'withdrew').uid, theirB.uid);
  const back = st.log.filter(t => t.act === 'hurt-minion' && t.from === 'return');
  assert.deepEqual(back.map(t => t.uid), [mineB.uid], 'the blow back lands on your second');
});

test('buff, 锁 and 吞 at the second twin touch only the second', () => {
  let st = twins(['grow']);
  act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 1 } });
  assert.deepEqual(st.you.board.map(m => m.atk), [2, 3]);
  assert.equal(lastAbout(st, 'buff').uid, st.you.board[1].uid);

  st = twins(['lock']);
  act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 1 } });
  assert.deepEqual(st.foe.board.map(m => m.chain ?? 0), [0, 1]);
  assert.equal(lastAbout(st, 'chained').uid, st.foe.board[1].uid);

  st = twins(['gulp']);
  const keep = st.foe.board[0], gone = st.foe.board[1];
  act(st, { kind: 'play', index: 0, target: { kind: 'minion', index: 1 } });
  assert.deepEqual(st.foe.board, [keep]);
  assert.equal(lastAbout(st, 'swallowed').uid, gone.uid);
});

test('the picks stay slots: the same token list replays to the same place, uids and all', () => {
  const picks = ['play:0', 'end', 'end', 'attack:0@e1', 'end', 'attack:0', 'end'];
  const a = battle(picks, setup({ deck: ['deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer'] }), CARDS);
  const b = battle(picks, setup({ deck: ['deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer', 'deer'] }), CARDS);
  assert.deepEqual(a, b);
  // A pick list from before uids (no uid anywhere in it) still replays: the format did not change.
  assert.equal(a.refused, undefined);
});

test('one legal place: the first tap acts; two or more: it asks', () => {
  const st = twins(['bolt', 'grow']);
  const tap = (s, kind, index) => pickOf(null, { kind, index }, view(s), CARDS, offers(s));
  // 护主 alone on their rank: your body must strike it — one place, so the tap strikes.
  const g = twins([]);
  g.foe.board = [{ ...g.foe.board[0], id: 'guard', taunt: true }];
  assert.deepEqual(tap(g, 'mine', 0), { action: { kind: 'attack', index: 0, target: { kind: 'minion', index: 0 } } });
  // Their rank empty: the beast itself is the only place.
  const e = twins(['bolt']);
  e.foe.board = [];
  assert.deepEqual(tap(e, 'mine', 1), { action: { kind: 'attack', index: 1, target: undefined } });
  // Two of theirs (and the beast): a body asks where.
  assert.deepEqual(tap(st, 'mine', 0), { pick: { from: 'board', index: 0 } });
  // A lift with one friend of yours lifts that one at once; with two it asks.
  const one = twins(['grow']);
  one.you.board = [one.you.board[0]];
  assert.deepEqual(tap(one, 'hand', 0), { action: { kind: 'play', index: 0, target: { kind: 'minion', index: 0 } } });
  assert.deepEqual(tap(st, 'hand', 1), { pick: { from: 'hand', index: 1 } });
  // 锁 with one body across: the tap chains it.
  const lk = twins(['lock']);
  lk.foe.board = [lk.foe.board[0]];
  assert.deepEqual(tap(lk, 'hand', 0), { action: { kind: 'play', index: 0, target: { kind: 'minion', index: 0 } } });
  // A damage 功法 with one body across still has two places (the body, the beast): it asks.
  const dm = twins(['bolt']);
  dm.foe.board = [dm.foe.board[0]];
  assert.deepEqual(tap(dm, 'hand', 0), { pick: { from: 'hand', index: 0 } });
});

test('参悟 into a deck of one: the card names the 反噬, and the rules land exactly that', () => {
  const st = begin(setup(), CARDS);
  st.you.hand = ['canwu'];
  st.you.mana = 5;
  st.you.deck = ['bolt'];
  st.you.fatigue = 0;
  const said = backlashOf(view(st).you, CARDS.canwu);
  assert.deepEqual(said, { over: 2, n: 3, deck: 1 }, 'one drawn, then 1 and 2 of 反噬');
  const hp = st.you.hp;
  act(st, { kind: 'play', index: 0 });
  assert.equal(hp - st.you.hp, said.n, 'the number on the card is the number that lands');
  assert.deepEqual(backlashOf({ deck: 5, fatigue: 0 }, CARDS.canwu), { over: 0, n: 0, deck: 5 }, 'a full deck: nothing to say');
});
