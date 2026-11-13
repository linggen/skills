import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { fightSetup, lendOf, recordDuelOutcome, kaceBrief, gainCard, cardsFrom, deckFor, deck } from '../scripts/rules/cards.mjs';
import { begin, act, endTurn } from '../scripts/battle.js';
import { duelBrief } from '../scripts/rules/look.mjs';
import { parseArgs } from '../scripts/rules/files.mjs';

const content = loadContent(), now = new Date('2026-10-21T11:40:00Z');
const state = newState(content, 'zh', now);
const beast = content.creatures.creatures.find(c => c.deck?.length);
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const ids = ['yy-howl', 'yy-pounce', 'yy-fire', 'yy-fur'];

test('ladder chooses a lesson then fills and caps', () => {
  assert.equal(lendOf(content, 0), null);
  assert.deepEqual(lendOf(content, 1), { cards: ['yy-howl'] });
  assert.deepEqual(lendOf(content, 2, 'trade'), { cards: ['yy-fire', 'yy-howl'] });
  assert.deepEqual(lendOf(content, 9, 'kill'), { cards: ['yy-pounce', 'yy-howl', 'yy-fur'] });
});
test('foe loss count is shared by all duel settlements', () => {
  const s = {}; recordDuelOutcome(s, 'person', 'lost'); recordDuelOutcome(s, 'person', 'lost');
  assert.equal(s.duel_lost.person, 2); recordDuelOutcome(s, 'person', 'won'); assert.equal(s.duel_lost.person, undefined);
});
test('lesson is validated, remembered, shown in the brief and cleared on a win', () => {
  const s = structuredClone(state), id = beast.id;
  recordDuelOutcome(s, id, 'lost', parseArgs(['--lesson=trade']).lesson);
  recordDuelOutcome(s, id, 'lost', 'invalid');
  assert.equal(s.duel_lesson[id], 'trade');
  assert.equal(fightSetup(content, s, beast, now).lend.cards[0], 'yy-fire');
  const brief = duelBrief(content, s, { id: 'test-lesson', creature: id }, now);
  assert.equal(brief.lost, 2);
  assert.deepEqual(brief.lend.names, brief.lend.cards.map(card => catalog[card].name.zh));
  recordDuelOutcome(s, id, 'won');
  assert.equal(s.duel_lost[id], undefined);
  assert.equal(s.duel_lesson[id], undefined);
});
test('borrowed cards start in hand, never the pile; zero leaves setup alone', () => {
  const base = fightSetup(content, state, beast, now);
  assert.deepEqual(base, fightSetup(content, { ...state, duel_lost: {} }, beast, now));
  for (const n of [1, 2, 3]) {
    const setup = fightSetup(content, { ...state, duel_lost: { [beast.id]: n } }, beast, now);
    const fight = begin(setup, catalog);
    for (const id of setup.lend.cards) { assert.ok(fight.you.hand.includes(id)); assert.ok(!fight.you.deck.includes(id)); }
  }
});
test('the four lent cards resolve, including temporary attack and one lethal save', () => {
  const st = begin({ mode: 'pvp', you: { tier: 'qi', deck: [], extra: ids }, foe: { tier: 'qi', deck: [] } }, catalog);
  st.you.mana = 10;
  const body = (id, hp) => ({ id, uid: Math.random(), atk: 1, hp, hpMax: hp });
  st.you.board = [body('a', 5)]; st.foe.board = [body('b', 5), body('c', 5)];
  const play = (id, target) => assert.equal(act(st, { kind: 'play', index: st.you.hand.indexOf(id), ...(target ? { target } : {}) }).ok, true);
  play('yy-howl'); assert.equal(st.you.board[0].atk, 2);
  play('yy-pounce', { kind: 'minion', index: 0 }); assert.equal(st.foe.board[0].hp, 2);
  play('yy-fire'); assert.deepEqual(st.foe.board.map(x => x.hp), [1, 4]);
  play('yy-fur'); assert.equal(st.you.lendWard, 1);
  endTurn(st); assert.equal(st.you.board[0].atk, 1);
  st.foe.hand = ['yy-pounce', 'yy-pounce']; st.foe.mana = 10; st.you.hp = 2;
  assert.equal(act(st, { kind: 'play', index: 0 }, 'foe').ok, true); assert.equal(st.you.hp, 1);
  assert.equal(act(st, { kind: 'play', index: 0 }, 'foe').ok, true); assert.equal(st.outcome, 'lost');
});
test('lent cards are not collected, granted or built into a deck', () => {
  const s = { ...state, cards: [...(state.cards ?? []), ...ids] };
  const book = kaceBrief(content, s); assert.ok(book.cards.every(c => !ids.includes(c.id)));
  assert.ok(deckFor(content, s).every(id => !ids.includes(id)));
  for (const id of ids) {
    assert.equal(gainCard(content, s, id), null);
    assert.equal(deck({ ...s, tier: 'core' }, content, { now }, { action: 'toggle', id }).result.refused, 'not-held');
  }
  assert.ok(cardsFrom(content, 'beast', beast.id).every(c => !c.lent));
});
