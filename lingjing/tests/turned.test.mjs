// A 交差 says what it paid where it was tapped — and a 修为 the cap held back (live, 2026-10-15:
// 开府's 交差 inside the 事 book changed nothing he could see); the stage's 所得 goes by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDED_STAY_MS, handedStale, turnedPays } from '../scripts/turned.js';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const w = { ...WORDS.zh, xw: '修为', ls: '灵石' };

test('a hand-in\'s pay as a line: the gains, and the held 修为 said', () => {
  assert.deepEqual(turnedPays({ progress: 0, wealth: 20, hold: { held: 15, cap: true } }, w, 'zh'), ['灵石 +20', '修为已满，未入']);
  assert.deepEqual(turnedPays({ progress: 12 }, w, 'zh'), ['修为 +12']);
  assert.deepEqual(turnedPays(null, w, 'zh'), []);
});

test('the 事 popover carries the line while it is fresh', () => {
  const html = bookPopHtml({ look: { book: [] }, words: w, lang: 'zh', turned: { id: 'k', title: '入籍', paid: { wealth: 20 }, at: Date.now() } });
  assert.match(html, /bookrow trow turned/);
  assert.match(html, /入籍.*已交 ✓ · 灵石 \+20/s, 'the row says what came in, in place');
});

test('所得 is stale once every row has stood its while', () => {
  const ages = { a: HANDED_STAY_MS + 1, b: 100 };
  assert.equal(handedStale([{ id: 'a' }], (id) => ages[id]), true);
  assert.equal(handedStale([{ id: 'a' }, { id: 'b' }], (id) => ages[id]), false);
  assert.equal(handedStale([], () => 1e9), false);
});
