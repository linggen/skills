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
