// 替身草人 · 短飞剑 … bought for their CARD (Hanli 11-10: 「商铺我点买, 在替身草人上, 好像没买成功」): a card is no thing in the
// 储物袋, so a buy looked like nothing and a second one was refused unseen. The rules' shelf row says whether the card is
// his already (`card_held`); the page draws 已有 · 在牌组 in place of 买 and says on the row what a tap came to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { look, trade } from '../scripts/rules.mjs';
import { cardHtml, WORDS } from '../scripts/cards.js';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const NOW = new Date('2026-11-10T10:00:00+08:00');
const ctx = { now: NOW, quests: [] };
const start = { ...fitWorld({ ...newState(content, 'zh', NOW), traits: ['metal', 'wood', 'water', 'fire', 'earth'], chapter: '01-ji', scene: null, place: 'fangshi', wealth: 300, cards: [], ended: ['00-prologue', '00-waimen', '00-zhuji'] }, content), stamina: 100 };
const row = (s, id) => look(s, content, ctx).place.shelf.find(i => i.id === id);

test('the shelf row of a card item says whether the card is his: before the buy, after it; twice is refused', () => {
  assert.equal(row(start, 'feijian-duan').card_held, false);
  assert.equal(row(start, 'mend-pill')?.card_held, undefined, 'a plain thing carries no such flag');
  const out = trade(start, content, ctx, { action: 'buy', id: 'feijian-duan' });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.equal(out.result.cards[0].id, 'feijian');
  assert.ok(out.result.cards[0].name, 'the card is named for the page to say');
  assert.equal(row(out.state, 'feijian-duan').card_held, true);
  assert.equal(row(out.state, 'feijian-duan').held, 0, 'nothing in the bag');
  const again = trade(out.state, content, ctx, { action: 'buy', id: 'feijian-duan' });
  assert.equal(again.result.refused, 'card-held');
  assert.equal(again.result.say, '这张牌你已经有了。');
});

test('the page: a card held draws 已有 · 在牌组 in place of 买; not held, the 买 as before; a row says what its tap came to', () => {
  const lookOf = held => ({
    wealth: 300, world: { dir: 'worlds/jiuding' }, words: {},
    place: { shelf: [{ id: 'feijian-duan', name: '短飞剑', kind: 'treasure', buy: 80, held: 0, card_held: held }, { id: 'mend-pill', name: '回春丹', kind: 'pill', buy: 15, held: 0 }] },
  });
  const draw = (held, more = {}) => cardHtml({ card: 'item', ids: ['feijian-duan', 'mend-pill'] }, { look: lookOf(held), words: WORDS.zh, lang: 'zh', content: {}, ...more });
  const owned = draw(true);
  assert.match(owned, /cardheld">已有 · 在牌组</);
  assert.ok(!/data-do="buy" data-id="feijian-duan"/.test(owned), 'no 买 for a card he has');
  assert.match(owned, /data-do="buy" data-id="mend-pill"/, 'the other row is untouched');
  assert.match(draw(false), /data-do="buy" data-id="feijian-duan">买 80</);
  assert.ok(!/cardheld/.test(draw(false)));
  const said = draw(true, { shelfNote: { id: 'feijian-duan', line: '短飞剑 · 买下了 · 已入牌组' } });
  assert.match(said, /class="donote shelfsaid">短飞剑 · 买下了 · 已入牌组</);
  assert.equal((said.match(/shelfsaid/g) ?? []).length, 1, 'on the tapped row only');
  const en = cardHtml({ card: 'item', ids: ['feijian-duan'] }, { look: lookOf(true), words: WORDS.en, lang: 'en', content: {}, shelfNote: { id: 'feijian-duan', line: 'x' } });
  assert.match(en, /Owned · in your deck/);
  assert.equal(WORDS.zh.boughtCard, '买下了 · 已入牌组');
  assert.equal(WORDS.en.boughtCard, 'Bought · added to your deck');
});
