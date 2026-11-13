import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, act } from '../scripts/battle.js';
import { unseen, honestBest, newCoach, note, summary } from '../scripts/duelcoach.js';

const cards = {
  hit: { id: 'hit', name: 'Hit', kind: 'spell', cost: 2, effect: { damage: 5 } },
  heal: { id: 'heal', name: 'Heal', kind: 'spell', cost: 2, effect: { heal: 2 } },
  idle: { id: 'idle', kind: 'spell', cost: 2, effect: { rally: { atk: 1 } } },
  body: { id: 'body', name: 'Body', kind: 'minion', cost: 0, atk: 1, hp: 2 },
  a: { id: 'a', kind: 'spell', cost: 9 }, b: { id: 'b', kind: 'spell', cost: 9 },
  c: { id: 'c', kind: 'spell', cost: 9 }, d: { id: 'd', kind: 'spell', cost: 9 },
};
const opened = () => begin({ mode: 'pvp', seed: 'coach', you: { tier: 'qi', deck: [] }, foe: { tier: 'qi', deck: [] } }, cards);
const minion = (uid, atk, hp) => ({ id: 'body', uid, atk, hp, hpMax: hp, sick: false, struck: false });

test('unseen preserves visible state, counts and pooled cards, deterministically', () => {
  const st = opened();
  st.you.hand = ['hit']; st.you.deck = ['a', 'b', 'c', 'd'];
  st.foe.hand = ['a', 'b']; st.foe.deck = ['c', 'd'];
  st.you.board = [minion(1, 2, 3)]; st.foe.board = [minion(2, 1, 2)];
  const before = structuredClone(st), a = unseen(st, 1), b = unseen(st, 1);
  assert.deepEqual(a, b); assert.deepEqual(st, before);
  assert.deepEqual(a.you.hand, st.you.hand); assert.deepEqual(a.you.board, st.you.board); assert.deepEqual(a.foe.board, st.foe.board);
  assert.equal(a.foe.hand.length, 2); assert.equal(a.foe.deck.length, 2); assert.equal(a.you.deck.length, 4);
  assert.deepEqual([...a.foe.hand, ...a.foe.deck].sort(), ['a', 'b', 'c', 'd']);
  assert.deepEqual([...a.you.deck].sort(), ['a', 'b', 'c', 'd']);
  assert.ok(Array.from({ length: 8 }, (_, i) => unseen(st, i + 2)).some(x => JSON.stringify([x.foe.hand, x.foe.deck, x.you.deck]) !== JSON.stringify([a.foe.hand, a.foe.deck, a.you.deck])));
});

test('honestBest finds an immediate victory', () => {
  const st = opened(); st.you.hand = ['hit']; st.foe.hp = 5;
  const best = honestBest(st, { samples: 1 });
  const copy = unseen(st, 1); assert.equal(act(copy, best.action).ok, true); assert.equal(copy.outcome, 'won');
});

test('note records kill and the two widest gaps', () => {
  const coach = newCoach();
  for (const hp of [1, 3, 5]) {
    const st = opened(); st.you.hand = ['hit', 'heal']; st.foe.hp = hp; st.you.hp = 1;
    st.foe.board = [minion(2, 10, 10)]; st.foe.tireless = true; st.you.powerUsed = true;
    note(coach, st, { kind: 'play', index: 1 }, { samples: 1 });
  }
  assert.equal(coach.gaps.length, 2); assert.ok(coach.gaps.every(g => g.lesson === 'kill'));
  assert.ok(coach.gaps[0].gap >= coach.gaps[1].gap);
});

test('note identifies unspent and wasted moves', () => {
  const st = opened(); st.you.hand = ['hit', 'heal']; st.foe.hp = 8;
  st.you.hp = 3; st.you.board = [minion(1, 3, 5)]; st.foe.board = [minion(2, 10, 10)];
  const coach = newCoach();
  note(coach, st, { kind: 'end' }, { samples: 1 });
  const wasted = opened(); wasted.you.hand = ['hit', 'idle']; wasted.foe.hp = 12; wasted.you.hp = 2;
  wasted.foe.board = [minion(2, 10, 10)];
  note(coach, wasted, { kind: 'play', index: 1 }, { samples: 1 });
  assert.ok(coach.gaps.some(g => g.lesson === 'unspent'));
  assert.ok(coach.gaps.some(g => g.lesson === 'wasted'));
});

test('note identifies a face attack instead of a necessary trade', () => {
  const st = opened(); st.you.hp = 3; st.you.mana = 0;
  st.you.board = [minion(1, 3, 5)]; st.foe.board = [minion(2, 4, 3)];
  const coach = newCoach(); note(coach, st, { kind: 'attack', index: 0 }, { samples: 1 });
  assert.equal(coach.gaps[0]?.lesson, 'trade');
});

test('summary reports close losses and remaining pills', () => {
  const st = opened(), coach = newCoach(); st.outcome = 'lost'; st.foe.hpMax = 20; st.foe.hp = 5;
  st.you.pouch = [{ id: 'p', heal: 2 }];
  assert.equal(summary(coach, st).near, true); assert.equal(summary(coach, st).pills_left, 1);
  st.foe.hp = 6; assert.equal(summary(coach, st).near, false);
  st.outcome = 'won'; st.foe.hp = 1; assert.equal(summary(coach, st).near, false);
});
