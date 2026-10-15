// A 交差 says what it paid where it was tapped — and a 修为 the cap held back (live, 2026-10-15:
// 开府's 交差 inside the 事 book changed nothing he could see); the stage's 所得 goes by itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDED_STAY_MS, handedStale, turnedPays } from '../scripts/turned.js';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const w = { ...WORDS.zh, xw: '修为', ls: '灵石' };

test('a hand-in\'s pay as a line: the gains, and 零层\'s 修为 said as not taken — never as 「已满」', () => {
  // At 零层 the daily 功课's 20 修为 is not taken (state.mjs addProgress `hold.zero`): said so, not 「修为已满」.
  assert.deepEqual(turnedPays({ progress: 0, wealth: 0, hold: { zero: true, held: 20 } }, w, 'zh'), ['零层 · 修为未入']);
  // A full mark holds nothing back any more (`held` 0): nothing about a cap is said.
  assert.deepEqual(turnedPays({ progress: 15, wealth: 20, hold: { cap: true, held: 0, over: 5 } }, w, 'zh'), ['修为 +15', '灵石 +20']);
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
