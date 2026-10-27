// 得牌's reveal (scripts/card-reveal.js): the timeline and the face, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REVEAL_MS, revealBeat, revealHtml, revealPlan } from '../scripts/card-reveal.js';

test('a card rises, then holds until he taps — as its 轻点继续 says — then flies into the bag', () => {
  const p = revealPlan();
  assert.equal(revealBeat(p, 0), 'rise');
  assert.equal(revealBeat(p, REVEAL_MS.rise + 10), 'hold');
  assert.equal(revealBeat(p, 60000), 'hold', 'never off by itself (2026-10-16: it flew after 2.4 s)');
  assert.equal(revealBeat(p, 5000 + 10, 5000), 'fly');
  assert.equal(revealBeat(p, 5000 + REVEAL_MS.fly + 1, 5000), 'done');
});

test('a tap during the rise goes straight to the flight', () => {
  const p = revealPlan();
  assert.equal(revealBeat(p, 300, 200), 'fly');
  assert.equal(revealBeat(p, 200 + REVEAL_MS.fly + 1, 200), 'done');
});

test('reduced motion: a still card held until the tap, then gone', () => {
  const p = revealPlan({ still: true });
  assert.equal(revealBeat(p, 10), 'hold');
  assert.equal(revealBeat(p, 60000), 'hold');
  assert.equal(revealBeat(p, 1000 + REVEAL_MS.fade + 1, 1000), 'done');
});

test('the page never sets a clock on the card: only the tap (or a key) sends it on', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'card-reveal.js'), 'utf8');
  const one = src.slice(src.indexOf('function playOne'), src.indexOf('export async function revealCards'));
  assert.doesNotMatch(one, /setTimeout\(fly/);
  assert.match(one, /addEventListener\('pointerdown', fly\)/);
});

test('the face carries the painting, the name and the one line, escaped', () => {
  const html = revealHtml({ id: 'luying', name: { zh: '鹿影', en: 'Deer Shade' }, kind: 'minion', cost: 2, element: 'water', atk: 3, hp: 2, art: 'art/cards/luying.webp' },
    { lang: 'zh', line: '「先看风，后看鹿」<b>', artBase: '../worlds/jiuding/' });
  assert.match(html, /鹿影/);
  assert.match(html, /src="..\/worlds\/jiuding\/art\/cards\/luying.webp"/);
  assert.match(html, /先看风/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /rv-seal/);
});

test('a 随从 says what it is from its own `is`, never 「minion = 灵兽」 (Hanli 10-27: 金刚, a man in armour, printed 灵兽)', async () => {
  const { loadContent } = await import('../scripts/content.mjs');
  const content = loadContent(), isWords = content.cards.is_words, card = (id) => content.cards.cards.find((c) => c.id === id);
  const kindOf = (id, lang = 'zh') => revealHtml(card(id), { lang, isWords }).match(/class="rv-kind">([^<]*)</)[1];
  assert.equal(kindOf('jingang'), '金 · 护法');
  assert.equal(kindOf('toulang'), '金 · 灵兽');
  assert.equal(kindOf('feijian'), '金 · 法器');
  assert.equal(kindOf('fangfeng'), '木 · 人');
  assert.equal(kindOf('jingang', 'en'), 'Metal · Guardian');
  assert.equal(kindOf('huodan'), '火 · 功法');
  assert.equal(revealHtml({ ...card('jingang'), is: undefined }, { isWords }).match(/class="rv-kind">([^<]*)</)[1], '金', 'no `is`: its 五行 alone, never a guess');
});

test('under the card: where it came from, plainly, then the source\'s own words', async () => {
  const { whenceLine } = await import('../scripts/card-reveal.js');
  const { loadContent } = await import('../scripts/content.mjs');
  const content = loadContent(), card = (id) => content.cards.cards.find((c) => c.id === id);
  const creatureOf = (id) => content.creatures.creatures.find((k) => k.id === id);
  const at = (id, lang = 'zh') => whenceLine(card(id).from[0], { lang, creatureOf });
  assert.equal(at('toulang'), '降服狼所得');
  assert.equal(at('toulang', 'en'), 'Won by subduing Wolf');
  assert.equal(at('suijin'), '胜马小宝所得', 'a person beaten is 胜, not 降服');
  assert.equal(at('houtu'), '胜卢方所得');
  assert.equal(at('huodan'), '得自褚先生');
  assert.equal(at('feijian'), '钱掌柜处买来');
  assert.equal(at('yijian'), '赢下一局所得');
  assert.equal(at('jingang'), '', "a foe's own card: no line pretends he won it");
  const html = revealHtml(card('toulang'), { line: at('toulang'), said: '头狼挡在狼群前头' });
  assert.match(html, /<p class="rv-line">降服狼所得<span class="rv-said">头狼挡在狼群前头<\/span><\/p>/);
});
