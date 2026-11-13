// 品 · 框 (design.md § 斗法 v4 · 品 · 框 · the 卡册): a card's grade is read off where it is found (rules/pin.mjs), never
// typed on the card; and every place a card is drawn wears its grade's frame — a plain (凡) card exactly as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadWorld } from '../scripts/content.mjs';
import { PINS, pinOf, pinsOf } from '../scripts/rules/pin.mjs';
import { act, begin, offers, view } from '../scripts/battle.js';
import { WORDS as BW, battleHtml, cardFaceHtml, spoilsHtml } from '../scripts/battle-card.js';
import { WORDS, deckHtml } from '../scripts/cards.js';
import { revealHtml } from '../scripts/card-reveal.js';

const content = loadWorld('jiuding');
const card = id => content.cards.cards.find(c => c.id === id);
const byPin = () => {
  const out = Object.fromEntries([...PINS, 'none'].map(p => [p, []]));
  for (const c of content.cards.cards) out[pinOf(content, c) ?? 'none'].push(c.id);
  return out;
};

test('today\'s data gives the design\'s split: 凡 21 · 银 26 · 金 9 · 宝石 4 · 钻石 18 = 78 collected, 28 not', () => {
  const g = byPin(), want = { fan: 21, yin: 26, jin: 9, baoshi: 4, zuanshi: 18, none: 28 };
  for (const [pin, n] of Object.entries(want)) assert.equal(g[pin].length, n, `${pin}: ${g[pin].join(' ')}`);
  assert.equal(Object.keys(pinsOf(content)).length, 78);
});

test('no card carries its grade: cards.json holds no pin or rarity key on any card', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/cards.json', import.meta.url), 'utf8'));
  for (const c of raw.cards) for (const k of ['pin', 'rarity', 'grade', 'pin_grade']) assert.ok(!(k in c), `${c.id} carries ${k}`);
});

test('each source kind sets its grade: story · beat · tale · shop 凡, beast 银, a beast\'s own card 金, tame · summon 钻石', () => {
  assert.equal(pinOf(content, card('mucao')), 'fan', 'story');
  assert.equal(pinOf(content, card('yijian')), 'fan', 'beat');
  assert.equal(pinOf(content, card('wudao')), 'fan', 'tale');
  assert.equal(pinOf(content, card('feijian')), 'fan', 'shop');
  assert.equal(pinOf(content, card('talisman')), 'fan', 'a 符 sold is collected though it is a token');
  assert.equal(pinOf(content, card('xiongzai')), 'yin', 'beast');
  assert.equal(pinOf(content, card('luying')), 'yin', 'what a person leaves the first time is 银 too');
  assert.equal(pinOf(content, card('huilang')), 'jin', 'the wolf\'s own');
  assert.equal(pinOf(content, card('zheng')), 'zuanshi', 'tame');
  assert.equal(pinOf(content, card('gui')), 'zuanshi', 'summon');
});

test('a 大妖\'s own card is 宝石: its beast ends a 重 (mijing.json); the same kind of card from a beast that ends none is 金', () => {
  const bosses = new Set(content.mijing.tiers.map(t => t.boss?.creature));
  for (const id of ['longzhi', 'jiushou', 'huoya']) {
    assert.ok(bosses.has(card(id).from[0].creature));
    assert.equal(pinOf(content, card(id)), 'baoshi', id);
  }
  assert.ok(!bosses.has('lang'));
  assert.equal(pinOf(content, card('elang')), 'jin');
  const moved = { ...content, mijing: { tiers: [] } };
  assert.equal(pinOf(moved, card('longzhi')), 'jin', 'read off where the beast stands, never off the card');
});

test('a card with several sources takes the commonest way it can be had', () => {
  const two = { id: 'x', from: [{ kind: 'tame', creature: 'zheng' }, { kind: 'beast', creature: 'xiong' }, { kind: 'foe', creature: 'lang' }] };
  assert.equal(pinOf(content, two), 'yin');
  assert.equal(pinOf(content, { id: 'y', from: [{ kind: 'foe', creature: 'longzhi' }, { kind: 'shop', item: 'x' }] }), 'fan');
  assert.equal(pinOf(content, { id: 'z', from: [{ kind: 'foe', creature: 'foe-zou' }, { kind: 'tame', creature: 'zheng' }] }), 'zuanshi', 'a person\'s row is no way; the other is');
  assert.equal(pinOf(content, card('huiqi')), 'fan', '回气丹: a scene and a tale');
});

test('not collected: a companion\'s card, a person\'s art, tokens and blows', () => {
  for (const id of ['qingteng', 'shangen', 'tiegu', 'yinyue', 'linmu']) assert.equal(pinOf(content, card(id)), null, `${id} is a companion's`);
  for (const id of ['shanjing', 'tuou', 'wulei', 'fenghuo', 'jinsuo', 'jianying']) assert.equal(pinOf(content, card(id)), null, `${id} is a person's art`);
  for (const id of ['tengmiao_token', 'shewei', 'niaohui', 'yigun', 'shizi', 'huochai']) assert.equal(pinOf(content, card(id)), null, `${id} has no source`);
  assert.equal(pinOf(content, null), null);
});

/* ── The frame on the markup, in every place a card is drawn ── */
const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, { ...x, name: x.name.zh }]));
const pins = pinsOf(content);
const FRAMED = { yin: 'xiongzai', jin: 'huilang', baoshi: 'jiushou', zuanshi: 'zheng' }; // a 随从 of each grade
const ctxOf = (extra = {}) => ({ lang: 'zh', words: BW.zh, catalog, board: 5, artBase: '', ...extra });

/* The plain card's markup, rendered exactly as tests/fixtures/pin-fan-main.json was from main before the frames — from
   the four cards the fixture froze with it (its `catalog`), so a later change to their numbers is not read as a frame's. */
const MAIN = JSON.parse(fs.readFileSync(new URL('./fixtures/pin-fan-main.json', import.meta.url), 'utf8'));
function plainRender(extra = {}) {
  const catalog = Object.fromEntries(MAIN.catalog.map(x => [x.id, { ...x, name: x.name.zh }]));
  const ctxOf = (more = {}) => ({ lang: 'zh', words: BW.zh, catalog, board: 5, artBase: '', ...more });
  const deck = ['mucao', 'huodan', 'mucao', 'huodan', 'tuqiang', 'mucao', 'huodan', 'tuqiang', 'mucao', 'jinren'];
  const st = begin({ mode: 'pve', seed: 'fan-snap', you: { tier: 'qi', root: 'fire', deck }, foe: { tier: 'qi', root: 'wood', deck } }, catalog);
  act(st, { kind: 'play', index: st.you.hand.indexOf('tuqiang') });
  st.whose = 'foe'; st.foe.mana = 6; st.foe.powerUsed = false;
  const fi = st.foe.hand.findIndex(id => catalog[id].kind === 'minion');
  if (fi >= 0) act(st, { kind: 'play', index: fi }, 'foe');
  st.whose = 'you';
  const ctx = () => ctxOf(extra);
  const fight = battleHtml(view(st), offers(st), ctx());
  const face = cardFaceHtml('mucao', ctx());
  const spoils = spoilsHtml({ cards: [{ id: 'huodan' }], items: [] }, { ...ctx(), words: { ...BW.zh, ...WORDS.zh } });
  const g = { cards: [{ id: 'mucao', name: '木草泥马', cost: 1, kind: 'minion', element: 'wood', deck: true }, { id: 'huodan', name: '火弹术', cost: 2, kind: 'spell', element: 'fire' }] };
  const deckView = deckHtml(g, { lang: 'zh', words: WORDS.zh, catalog, look: {}, artBase: '', ...extra });
  const reveal = revealHtml(MAIN.catalog.find(c => c.id === 'mucao'), { lang: 'zh', line: '得自饭桶', artBase: '' });
  const foeFace = cardFaceHtml('mucao', ctx(), st);
  return { catalog: MAIN.catalog, foeFace, mineBoard: st.you.board.length, foeBoard: st.foe.board.length, fight, face, spoils, deck: deckView, reveal };
}

test('a 凡 card is drawn byte for byte as on main, frames or none: the hand, the rank, the beast\'s side, 牌组, 所得, 得牌', () => {
  const main = MAIN;
  assert.deepEqual(plainRender(), main, 'no pins handed');
  assert.deepEqual(plainRender({ pins }), main, 'with every pin handed: plain cards wear nothing');
  assert.equal(main.mineBoard, 1); assert.equal(main.foeBoard, 1);
});

test('a framed card wears its grade on the leaf in the hand, the 牌组, the spoils and the beast\'s shown card', () => {
  for (const [pin, id] of Object.entries(FRAMED)) {
    assert.equal(pins[id], pin);
    const st = begin({ mode: 'pve', seed: `pin-${id}`, you: { tier: 'qi', root: 'fire', deck: Array(10).fill(id) }, foe: { tier: 'qi', root: 'wood', deck: Array(10).fill(id) } }, catalog);
    const hand = battleHtml(view(st), offers(st), ctxOf({ pins }));
    assert.match(hand, new RegExp(`<button class="bcard[^"]*"[^>]*data-id="${id}"[^>]*>\\s*<span class="bleaf pin-${pin}"><i class="bpin" aria-hidden="true"></i>`), `${pin} in the hand`);
    assert.match(cardFaceHtml(id, ctxOf({ pins }), st), new RegExp(`class="bleaf pin-${pin}"`), `${pin} on the beast's shown card`);
    const deck = deckHtml({ cards: [{ id, name: catalog[id].name, cost: catalog[id].cost, kind: catalog[id].kind, element: catalog[id].element, deck: true }] }, { lang: 'zh', words: WORDS.zh, catalog, pins, look: {}, artBase: '' });
    assert.match(deck, new RegExp(`class="bleaf pin-${pin}"`), `${pin} in the 牌组`);
    assert.match(spoilsHtml({ cards: [{ id }], items: [] }, { ...ctxOf({ pins }), words: { ...BW.zh, ...WORDS.zh } }), new RegExp(`class="bleaf pin-${pin}"`), `${pin} in 所得`);
    assert.match(revealHtml({ ...content.cards.cards.find(c => c.id === id), pin }, { lang: 'zh' }), new RegExp(`class="rv-card pin-${pin}"[^>]*>\\s*<div class="rv-paper"><i class="rv-frame"`), `${pin} on 得牌`);
  }
});

test('a body on the rank wears its frame on either side — a beast\'s card on the beast\'s side too', () => {
  const st = begin({ mode: 'pve', seed: 'pin-rank', you: { tier: 'qi', root: 'fire', deck: Array(10).fill('zheng') }, foe: { tier: 'qi', root: 'wood', deck: Array(10).fill('jiushou') } }, catalog);
  st.you.mana = 6; act(st, { kind: 'play', index: 0 });
  st.whose = 'foe'; st.foe.mana = 6; st.foe.powerUsed = false; act(st, { kind: 'play', index: 0 }, 'foe'); st.whose = 'you';
  const html = battleHtml(view(st), offers(st), ctxOf({ pins }));
  assert.match(html, /<button class="bminion mine el-[a-z]+ pin-zuanshi[^"]*"[^>]*>\s*<i class="bpin" aria-hidden="true"><\/i><span class="bface-wrap">/);
  assert.match(html, /<button class="bminion theirs el-[a-z]+ pin-baoshi[^"]*"[^>]*>\s*<i class="bpin"/);
});

test('a card\'s numbers read the same in every frame: the frame adds a mark, never changes cost, 攻 or 血', () => {
  const strip = html => html.replace(/ pin-[a-z]+/g, '').replace(/<i class="bpin" aria-hidden="true"><\/i>/g, '');
  for (const id of Object.values(FRAMED)) assert.equal(strip(cardFaceHtml(id, ctxOf({ pins }))), cardFaceHtml(id, ctxOf()));
});

test('the frames are drawn in CSS on the card itself — no picture asset, the mark out of the leaf\'s flow', () => {
  const css = fs.readFileSync(new URL('../scripts/battle.css', import.meta.url), 'utf8');
  const rv = fs.readFileSync(new URL('../scripts/card-reveal.css', import.meta.url), 'utf8');
  assert.match(css, /\.bpin \{ position: absolute;/);
  assert.match(rv, /\.rv-frame \{ position: absolute;/);
  for (const pin of ['yin', 'jin', 'baoshi', 'zuanshi']) { assert.match(css, new RegExp(`pin-${pin}`)); assert.match(rv, new RegExp(`pin-${pin}`)); }
  const framing = [...css.matchAll(/[^}]*pin-[a-z]+[^{]*\{[^}]*\}/g), ...rv.matchAll(/[^}]*(?:pin-|rv-frame)[^{]*\{[^}]*\}/g)].map(m => m[0]).join('\n');
  assert.doesNotMatch(framing, /url\(/, 'no image in a frame');
  assert.doesNotMatch(framing, /padding|font-size/, 'a frame never moves the words');
});
