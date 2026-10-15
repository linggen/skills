// A 交差 says what it paid where it was tapped — and a 修为 the cap held back (live, 2026-10-15:
// 开府's 交差 inside the 事 book changed nothing he could see); the stage's 所得 goes by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDED_STAY_MS, TURNED_MS, handedStale, turnedHtml } from '../scripts/turned.js';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const w = { ...WORDS.zh, xw: '修为', ls: '灵石' };

test('the book tops itself with the hand-in: title, 已记, the gains, and the held 修为 said', () => {
  const at = Date.now();
  const html = turnedHtml({ id: 'kaifu-light', title: '请灵', paid: { progress: 0, wealth: 20, hold: { held: 15, cap: true } }, at }, w, 'zh', at + 10);
  assert.match(html, /交差 · 请灵/);
  assert.match(html, /已记 · 灵石 \+20 · 修为已满，未入/);
  assert.doesNotMatch(html, /修为 \+/);
  assert.equal(turnedHtml({ title: 'x', paid: {}, at }, w, 'zh', at + TURNED_MS + 1), '', 'gone after a moment');
});

test('the 事 popover carries the line while it is fresh', () => {
  const html = bookPopHtml({ look: { book: [] }, words: w, lang: 'zh', turned: { id: 'k', title: '入籍', paid: { wealth: 20 }, at: Date.now() } });
  assert.match(html, /bookrow turned/);
  assert.match(html, /交差 · 入籍/);
});

test('所得 is stale once every row has stood its while', () => {
  const ages = { a: HANDED_STAY_MS + 1, b: 100 };
  assert.equal(handedStale([{ id: 'a' }], (id) => ages[id]), true);
  assert.equal(handedStale([{ id: 'a' }, { id: 'b' }], (id) => ages[id]), false);
  assert.equal(handedStale([], () => 1e9), false);
});
