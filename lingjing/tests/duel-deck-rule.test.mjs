import test from 'node:test';
import assert from 'node:assert/strict';
import { content, stateAt } from '../tools/story-fights.mjs';
import { FIT, withRules } from '../tools/duel-lines.mjs';
import { deck, deckBrief, deckFor, deckRule, fairBeastDeck } from '../scripts/rules/cards.mjs';

test('fair decks respect usable kinds, copies, and matched beast size', () => {
  assert.deepEqual(deckRule(content), { size: 10, copies: 2 });
  withRules(true, () => {
    assert.deepEqual(deckRule(content), { size: 15, copies: 2 });
    const base = stateAt('h11');
    const pool = content.cards.cards.filter(c => !c._token && !c.owner && !c.gear && !c.lent && (c.kind !== 'spell' || !c.element || (base.traits ?? []).includes(c.element))).map(c => c.id);
    for (const [n, size] of [[5, 10], [7, 14], [8, 15]]) {
      const state = { ...base, cards: pool.slice(0, n) };
      const deck = deckFor(content, state), beast = fairBeastDeck(content, { deck: pool.slice(0, 8) }, size);
      assert.equal(deckBrief(content, state).size, size); assert.equal(deckBrief(content, state).short_by, 8 - n);
      assert.equal(deck.length, size); assert.equal(beast.length, size);
      for (const id of new Set(deck)) assert.ok(deck.filter(x => x === id).length <= 2);
      for (const id of new Set(beast)) assert.ok(beast.filter(x => x === id).length <= 2);
    }
    assert.deepEqual(fairBeastDeck(content, { deck: pool.slice(0, 2) }, 15).length, 4);
  }, FIT);
});

test('deck edits enforce copies and capacity and auto restores a legal deck', () => withRules(true, () => {
  const base = { ...stateAt('h11'), tier: 'core' };
  base.cards = content.cards.cards.filter(c => !c._token && !c.owner && !c.gear && !c.lent && (c.kind !== 'spell' || !c.element || (base.traits ?? []).includes(c.element))).slice(0, 8).map(c => c.id);
  const initial = deckFor(content, base);
  const twice = initial.find(id => initial.filter(x => x === id).length === 2);
  const single = initial.find(id => initial.filter(x => x === id).length === 1);
  assert.ok(twice && single);
  assert.equal(deck(base, content, {}, { action: 'add', id: twice }).result.refused, 'copy-limit');
  assert.equal(deck(base, content, {}, { action: 'add', id: single }).result.refused, 'deck-full');
  const removed = deck(base, content, {}, { action: 'remove', id: twice });
  assert.equal(removed.result.ok, true);
  assert.equal(removed.state.deck.length, 14);
  const added = deck(removed.state, content, {}, { action: 'add', id: single });
  assert.equal(added.result.ok, true);
  assert.equal(added.state.deck.length, 15);
  const auto = deck(added.state, content, {}, { action: 'auto' });
  const cards = deckFor(content, auto.state);
  assert.equal(cards.length, 15);
  for (const id of cards) assert.ok(cards.filter(x => x === id).length <= 2);
}, FIT));

test("saved ten is filled without mutation", () => withRules(true, () => {
  const state = { ...stateAt("h11"), tier: "core" };
  state.deck = deckFor(content, state).slice(0, 10);
  const before = structuredClone(state);
  assert.equal(deckFor(content, state).length, 15);
  assert.deepEqual(state, before);
  assert.equal(deck(state, content, {}, { action: "auto" }).state.deck, undefined);
}, FIT));
