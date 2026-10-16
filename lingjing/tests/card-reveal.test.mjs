// 得牌's reveal (scripts/card-reveal.js): the timeline and the face, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REVEAL_MS, STILL_MS, revealBeat, revealHtml, revealPlan } from '../scripts/card-reveal.js';

test('a card rises, holds, then flies into the bag', () => {
  const p = revealPlan();
  assert.equal(revealBeat(p, 0), 'rise');
  assert.equal(revealBeat(p, REVEAL_MS.rise + 10), 'hold');
  assert.equal(revealBeat(p, p.fly + 10), 'fly');
  assert.equal(revealBeat(p, p.end + 1), 'done');
});

test('a tap hurries it straight to the flight', () => {
  const p = revealPlan();
  assert.equal(revealBeat(p, 300, 200), 'fly');
  assert.equal(revealBeat(p, 200 + REVEAL_MS.fly + 1, 200), 'done');
});

test('reduced motion: a still card, no rise and no flight', () => {
  const p = revealPlan({ still: true });
  assert.equal(p.end, STILL_MS);
  assert.equal(revealBeat(p, 10), 'hold');
  assert.equal(revealBeat(p, STILL_MS + 1), 'done');
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
