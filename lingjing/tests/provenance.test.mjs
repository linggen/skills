// 出处 (cards.md, Hanli 2026-10-16: 每张牌都在剧情里收集或者购买): every card a player or a party
// member can hold says where it comes from, each source exists and is reachable, a scene left or a
// board won gives its cards, a win gives the beast's own card and never one at random, a shop sells
// the cards it names, no starter at the root test, and an old save keeps every card it held (the
// renamed ones mapped to the book's).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { cardsFrom, fightSetup, grantFrom, ownedCards, partyFor, winCard } from '../scripts/rules/cards.mjs';
import { fitWorld } from '../scripts/state.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';

const content = loadContent();
const cards = content.cards.cards;
const NOW = new Date('2026-10-16T10:00:00Z');

test('the lint is clean: every 出处 names a thing that exists, every owner a member or a foe', () => {
  assert.deepEqual(lint(content).filter(x => /^card |^party |item .*card/.test(x)), []);
});

test('every card that can be held says where it comes from, 书 or 游戏', () => {
  const none = cards.filter(c => !c._token && !(c.from ?? []).length).map(c => c.id);
  assert.deepEqual(none, []);
  for (const c of cards) for (const f of c.from ?? []) assert.ok(['书', '游戏'].includes(f.src), `${c.id}: ${f.kind} has no 书/游戏`);
});

test("小满's book cards come in the story: 娘的饼 at 00-kitchen, 一箭 on 射鹿, 吐纳 at 00-halfyear (爹's line — 吹鹅毛 was cut 10-16), 褚先生's five at wm-qianye", () => {
  const ids = (kind, key) => cardsFrom(content, kind, key).map(c => c.id).sort();
  assert.deepEqual(ids('story', '00-kitchen'), ['niangbing']);
  assert.deepEqual(ids('beat', 'deer-wind'), ['yijian']);
  assert.deepEqual(ids('beat', 'feather-breath'), [], 'the board was cut: no card hangs on it');
  assert.deepEqual(ids('story', '00-halfyear'), ['tuna']);
  assert.deepEqual(ids('story', 'wm-qianye'), ['bingzhui', 'huodan', 'jinren', 'mutang', 'tuqiang']);
  // reachable: each story scene is a scene of a chapter of 卷一, each beat a board some scene shows
  const shown = new Set(Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes)).flatMap(s => (s.show ?? []).filter(x => x.card === 'board').map(x => x.id)));
  for (const c of cards) for (const f of c.from ?? []) if (f.kind === 'beat') assert.ok(shown.has(f.task), `${c.id}: beat ${f.task} is on no scene's stage`);
});

test("a member's cards are theirs (owner), in their deck; never in his ten", () => {
  for (const [id, m] of Object.entries(content.party.members)) for (const k of m.deck) assert.equal(cards.find(c => c.id === k).owner, id);
  const s = { tier: 'qi', step: 0, traits: ['metal', 'wood', 'water', 'fire', 'earth'], cards: ['qingteng', 'shangen', 'huodan', 'niangbing'], chapter: '00-waimen', scene: 'wm-fushi' };
  const setup = fightSetup(content, s, creatureOf(content, 'foe-lufang'), NOW);
  assert.ok(!setup.you.deck.includes('qingteng') && !setup.you.deck.includes('shangen'));
});

test('a scene left and a board won give their cards, once, each marked 新', () => {
  const s = { cards: [], lang: 'zh' };
  assert.deepEqual(grantFrom(content, s, 'story', '00-kitchen', { how: 'story' }).map(c => c.id), ['niangbing']);
  assert.deepEqual(grantFrom(content, s, 'story', '00-kitchen', { how: 'story' }), [], 'not twice');
  grantFrom(content, s, 'beat', 'deer-wind', { how: 'beat' });
  assert.deepEqual(s.cards, ['niangbing', 'yijian']);
  assert.deepEqual(s.cards_new, ['niangbing', 'yijian']);
});

test("a win gives the beast's own card, never one at random; a beast that names none gives nothing", () => {
  const s = { cards: [], lang: 'zh', seed: 'x' };
  assert.equal(winCard(content, s, creatureOf(content, 'yezhu'), NOW)?.id, 'jixiao');
  assert.equal(winCard(content, s, creatureOf(content, 'yezhu'), NOW), null, 'held already');
  assert.equal(winCard(content, s, creatureOf(content, 'longzhi'), NOW), null);
  assert.equal(winCard(content, s, { id: 'chance:x', root: 'wood' }, NOW, 'chance'), null, 'no chance card at random');
});

test('钱掌柜 sells the cards that name his stall; each costs what the card says', () => {
  const shop = Object.values(content.places).flatMap(d => d.places).find(p => p.has?.shop?.name?.zh === '钱掌柜的摊子').has.shop;
  for (const c of cards) for (const f of (c.from ?? []).filter(x => x.kind === 'shop' && x.keeper?.zh === '钱掌柜')) {
    assert.ok(shop.goods.includes(f.item), `${c.id}: ${f.item} not on the stall`);
    assert.equal(content.items.items.find(i => i.id === f.item).buy, f.price);
  }
});

test('bought at 钱掌柜\'s: 短飞剑 and 参悟 are cards in hand (nothing in the bag), 五雷符 a 符 in the bag; a card held is not bought twice', async () => {
  const { trade } = await import('../scripts/rules.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const c = { now: NOW, quests: [] };
  let s = { ...fitWorld({ ...newState(content, 'zh', NOW), traits: ['metal', 'wood', 'water', 'fire', 'earth'], chapter: '01-ji', scene: null, place: 'fangshi', wealth: 300, cards: [], ended: ['00-prologue', '00-waimen', '00-zhuji'] }, content), stamina: 100 };
  for (const [item, card] of [['feijian-duan', 'feijian'], ['canwu-jian', 'canwu']]) {
    const out = trade(s, content, c, { action: 'buy', id: item });
    assert.equal(out.result.ok, true, `${item}: ${JSON.stringify(out.result)}`);
    assert.ok(out.state.cards.includes(card) && out.state.cards_new.includes(card), `${card} in hand, 新`);
    assert.equal(out.state.bag[item], undefined, 'nothing in the bag');
    assert.equal(out.state.wealth, s.wealth - content.items.items.find(i => i.id === item).buy);
    s = out.state;
    assert.equal(trade(s, content, c, { action: 'buy', id: item }).result.refused, 'card-held');
  }
  const fu = trade(s, content, c, { action: 'buy', id: 'wulei-fu' });
  assert.equal(fu.result.ok, true, JSON.stringify(fu.result));
  assert.equal(fu.state.bag['wulei-fu'], 1, 'a 符 in the bag, spent when played');
});

test('no starter at the root test: a new save holds what the road gave, and fights the 三试 with it', () => {
  assert.equal(content.cards.starter, undefined);
  const s = { tier: 'qi', step: 0, traits: [], cards: ['niangbing', 'yijian', 'tuna'], chapter: '00-prologue', scene: '00-longzhi' };
  const game = content.chapters['00-prologue'].scenes['00-longzhi'].exits.find(e => e.game).game;
  const foe = { ...creatureOf(content, 'longzhi'), ...game.foe };
  const setup = fightSetup(content, s, foe, NOW);
  assert.deepEqual([...setup.you.deck].sort(), ['niangbing', 'niangbing', 'tuna', 'tuna', 'yijian', 'yijian'], 'two of each under ten');
  assert.deepEqual(setup.you.extra.slice(0, 2), ['yigun', 'shizi'], "the 试's own 一滚 · 石子");
  assert.equal(setup.foe.trial.survive, 4);
});

test('the party by the 回: 阿禾 and 孙二狗 in 古七, 阿禾 in 古八; a scene says its own; 银月 never in 卷一', () => {
  const at = (chapter, scene) => partyFor(content, { chapter, scene }, {}).map(m => m.id);
  assert.deepEqual(at('00-zhuji', '09-lingcao'), ['ahe', 'sun']);
  assert.deepEqual(at('00-zhuji', '09-dabi'), ['ahe']);
  assert.deepEqual(at('00-waimen', 'wm-fushi'), []);
  assert.deepEqual(partyFor(content, { chapter: '00-waimen', scene: 'wm-xirang' }, { party: ['ahe', 'yinyue'] }).map(m => m.id), ['ahe']);
});

test('a roaming beast (Hanli: 「小队是人数跟剧情走」): the 回\'s party stands with him at a pool too, and the beast grows with it', () => {
  const s = { tier: 'qi', step: 5, chapter: '00-zhuji', scene: '09-lingcao', traits: ['wood'], cards: [], deck: [] };
  const chai = creatureOf(content, 'chai');
  assert.deepEqual(partyFor(content, s, chai, 'haunt:chai').map(m => m.id), ['ahe', 'sun']);
  const r = content.party.roaming, foe = fightSetup(content, s, { ...chai, hp: 2 }, NOW, 'haunt:chai').foe;
  assert.equal(foe.hp, Math.round(2 * (1 + r.hp * 2) * 100) / 100);
  assert.equal(foe.power, r.power * 2);
  assert.equal(foe.deck.length, chai.deck.length + r.cards * 2);
  // a pool entry's own `roaming` stands over party.json's
  assert.equal(fightSetup(content, s, { ...chai, hp: 2, roaming: { hp: 0.5 } }, NOW, 'haunt:chai').foe.hp, 4);
  // alone, or a story fight (its exit weighs the foe with its party already): the beast as written
  const alone = fightSetup(content, { ...s, chapter: '00-waimen', scene: 'wm-fushi' }, { ...chai, hp: 2 }, NOW, 'haunt:chai').foe;
  assert.deepEqual([alone.hp, alone.power, alone.deck.length], [2, undefined, chai.deck.length]);
  // `roaming.extra`: that many of its own cards again, alone too (领胡, 鬿雀 — fought to the end, not outlasted)
  const slow = fightSetup(content, { ...s, chapter: '00-waimen', scene: 'wm-fushi' }, { ...chai, hp: 2, roaming: { extra: 4 } }, NOW, 'haunt:chai').foe;
  assert.deepEqual([slow.hp, slow.deck.length, slow.deck.slice(-4)], [2, chai.deck.length + 4, chai.deck.slice(0, 4)]);
  assert.equal(fightSetup(content, s, { ...chai, hp: 2 }, NOW, 'scene:09-lingcao').foe.hp, 2);
});

test('an old save keeps every card it held: the twelve of the root test written down, the renamed mapped to the book', () => {
  const old = { tier: 'qi', step: 3, traits: ['metal', 'wood', 'water', 'fire', 'earth'], chapter: '00-waimen', scene: 'wm-ahe', cast: ['zheng'], companion: { joined: '2026-09-29', asleep: true }, card_from: { jinzhua: { how: 'starter' } }, deck: ['jinzhua'] };
  const s = fitWorld(old, content);
  for (const id of ['jinren', 'tuqiang', 'bingzhui', 'mucao', 'feijian', 'shangen', 'qingteng', 'huodan', 'huoya', 'huiqi', 'leipu', 'luying', 'yinyue', 'zheng']) assert.ok(s.cards.includes(id), `${id} kept`);
  assert.ok(!s.cards.includes('jinzhua'), '金爪 is 金刃 now');
  assert.ok(s.card_from.jinren && !s.card_from.jinzhua);
  assert.deepEqual(s.deck, ['jinren']);
  // a save with its cards written keeps them, mapped
  const t = fitWorld({ ...old, cards: ['xiaoyao', 'wudao', 'jixiao'] }, content);
  assert.deepEqual(t.cards, ['mucao', 'tuna', 'jixiao']);
  assert.deepEqual(ownedCards(content, t), ['mucao', 'tuna', 'jixiao']);
});
