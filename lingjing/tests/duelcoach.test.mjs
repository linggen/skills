import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, act } from '../scripts/battle.js';
import { unseen, honestBest, newCoach, note, summary, killNow } from '../scripts/duelcoach.js';
import { handle } from '../scripts/duelcoach-worker.js';
import { lookaheadFor, carefulFor } from '../scripts/fightline.js';

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

test('foe unseen preserves its hand and is invariant to hidden rearrangement', () => {
  const st = opened(); st.whose = 'foe'; st.foe.hand = ['hit', 'heal']; st.foe.deck = ['a', 'b', 'c'];
  st.you.hand = ['a', 'b']; st.you.deck = ['c', 'd'];
  const changed = structuredClone(st);
  changed.foe.deck.reverse(); changed.you.hand = ['d', 'c']; changed.you.deck = ['b', 'a'];
  const a = unseen(st, 42, 'foe'), b = unseen(changed, 42, 'foe');
  assert.deepEqual(a, b); assert.deepEqual(a.foe.hand, st.foe.hand);
  assert.equal(a.you.hand.length, 2); assert.equal(a.you.deck.length, 2);
  assert.deepEqual(lookaheadFor(st, 'foe', { depth: 4 }), lookaheadFor(changed, 'foe', { depth: 4 }));
  assert.deepEqual(carefulFor(st, 'foe'), carefulFor(changed, 'foe'));
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
  const st = opened(); st.you.hand = ['hit', 'heal']; st.foe.hp = 20;
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

test('win shares and multi-move lethal are measured on the true position', () => {
  const st = opened(); st.you.hand = ['hit']; st.you.mana = 2; st.foe.hp = 6;
  st.you.board = [minion(1, 1, 2)];
  const line = killNow(st); assert.ok(line && line.length >= 2);
  assert.ok(honestBest(st).all.every(x => x.wins >= 0 && x.wins <= 1));
  const coach = newCoach(); note(coach, st, { kind: 'end' }, { samples: 1 });
  assert.equal(coach.gaps[0]?.lesson, 'kill'); assert.equal(typeof coach.gaps[0].wins_gap, 'number');
});

test('worker handler restores catalog and matches direct seeded coaching', () => {
  const st = opened(); st.you.hand = ['hit', 'heal']; st.foe.hp = 3; st.you.hp = 1;
  st.foe.board = [minion(2, 10, 10)]; st.foe.tireless = true; st.you.powerUsed = true;
  const action = { kind: 'play', index: 1 }, opts = { samples: 1, seed: 17 };
  const direct = newCoach(), worker = {};
  note(direct, st, action, opts);
  assert.ok(direct.gaps.length);
  assert.deepEqual(handle(worker, { type: 'start', catalog: cards }), { type: 'ready' });
  const { catalog, ...copy } = structuredClone(st);
  handle(worker, { type: 'note', copy, action, opts });
  assert.deepEqual(handle(worker, { type: 'summary', st: copy, id: 42 }),
    { type: 'summary', id: 42, summary: summary(direct, st) });
  handle(worker, { type: 'start', catalog: cards });
  assert.deepEqual(handle(worker, { type: 'summary', st: copy, id: 43 }).summary.gaps, []);
});

test('summary reports close losses and remaining pills', () => {
  const st = opened(), coach = newCoach(); st.outcome = 'lost'; st.foe.hpMax = 20; st.foe.hp = 5;
  st.you.pouch = [{ id: 'p', heal: 2 }];
  assert.equal(summary(coach, st).near, true); assert.equal(summary(coach, st).pills_left, 1);
  st.foe.hp = 6; assert.equal(summary(coach, st).near, false);
  st.outcome = 'won'; st.foe.hp = 1; assert.equal(summary(coach, st).near, false);
});
