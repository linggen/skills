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

test("小满's book cards come in the story: 娘的饼 at 00-kitchen, 一箭 on 射鹿, 吐纳 on 吹鹅毛, 褚先生's five at wm-qianye", () => {
  const ids = (kind, key) => cardsFrom(content, kind, key).map(c => c.id).sort();
  assert.deepEqual(ids('story', '00-kitchen'), ['niangbing']);
  assert.deepEqual(ids('beat', 'deer-wind'), ['yijian']);
  assert.deepEqual(ids('beat', 'feather-breath'), ['tuna']);
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
