// 所得 (Hanli 11-02: 「所得收起的卡, 在点之前已经收到奖励了吧, 点了收起好像没变化」): what a win paid lands when the rules
// answer — the bar rises then — so the card says it is already in, and 收起 only puts it away (lingjing.js: spoils null).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORDS, spoilsHtml } from '../scripts/battle-card.js';

test('the card says the pay is already in; 收起 puts it away', () => {
  const html = spoilsHtml({ cards: [], items: [], paid: { progress: 30, wealth: 5 }, spent: [] }, { lang: 'zh', words: WORDS.zh, catalog: {} });
  assert.match(html, /修为 \+30 · 灵石 \+5 <span class="small dim spoilin">· 已入账<\/span>/);
  assert.match(html, /data-spoils-close>收起/);
  assert.doesNotMatch(spoilsHtml({ cards: [], items: [], paid: {}, spent: ['x'] }, { lang: 'zh', words: WORDS.zh, catalog: {} }), /已入账/, 'nothing paid: nothing said in');
  const page = readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /\['\[data-spoils-close\]', \(\) => show\(\{ spoils: null \}\)\]/);
});
