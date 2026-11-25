// A spent hand leaves a line of words in the dock, never a bare band (the 2.6.0 review, 2026-11-22; the owner: 「写几个字」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, offers, view } from '../scripts/battle.js';
import { WORDS, battleHtml } from '../scripts/battle-card.js';

const CARDS = { cub: { id: 'cub', kind: 'minion', name: '小妖', cost: 1, element: null, atk: 1, hp: 2 } };

function room(lang, hand = [], { deck, whose, outcome } = {}) {
  const st = begin({ mode: 'pve', seed: 's', you: { tier: 'core', root: null, deck: Array(10).fill('cub') }, foe: { tier: 'core', root: null, deck: Array(12).fill('cub') } }, CARDS);
  st.you.hand = [...hand];
  const v = view(st);
  if (deck !== undefined) v.you.deck = deck;
  if (whose !== undefined) v.whose = whose;
  if (outcome !== undefined) v.outcome = outcome;
  return battleHtml(v, offers(st), { lang, words: WORDS[lang], catalog: CARDS, board: 4 });
}

test('a spent hand says so in the dock, and what comes next on your turn; a hand with cards has no such line', () => {
  const zh = room('zh');
  assert.match(zh, /<div class="bhand"><div class="bhandempty"[^>]*><i[^>]*>牌<\/i><b>手牌已出完<\/b><small>牌库 7 张<\/small><small>结束回合，下回合再抽 1 张<\/small><\/div><\/div>/);
  assert.match(room('en'), /<b>Hand played out<\/b><small>Deck: 7 left<\/small><small>End the turn; you draw 1 next turn<\/small>/);
  assert.doesNotMatch(room('zh', ['cub']), /bhandempty/);
  for (const state of [{ deck: 0 }, { whose: 'foe' }, { outcome: 'won' }]) {
    assert.doesNotMatch(room('zh', [], state), /结束回合，下回合再抽 1 张/);
  }
});
