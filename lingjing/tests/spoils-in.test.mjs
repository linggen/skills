// 所得 (Hanli 11-02: 「所得收起的卡, 在点之前已经收到奖励了吧, 点了收起好像没变化」): what a win paid lands when the rules
// answer — the bar rises then — so the card says it is already in, and 收起 only puts it away (lingjing.js: spoils null).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORDS, spoilsHtml } from '../scripts/battle-card.js';

test('the card says the pay is already in; no 收起 button — a tap on it or its ✕, walking on, or his next move puts it away, never a timer (Hanli 11-02; live 11-05)', () => {
  const html = spoilsHtml({ cards: [], items: [], paid: { progress: 30, wealth: 5 }, spent: [] }, { lang: 'zh', words: WORDS.zh, catalog: {} });
  assert.match(html, /修为 \+30 · 灵石 \+5 <span class="small dim spoilin">· 已入账<\/span>/);
  assert.doesNotMatch(html, /<button[^>]*data-spoils-close/, 'no 收起 button');
  assert.match(html, /class="card spoils" data-spoils-close/, 'the card itself puts it away on a tap');
  assert.doesNotMatch(spoilsHtml({ cards: [], items: [], paid: {}, spent: ['x'] }, { lang: 'zh', words: WORDS.zh, catalog: {} }), /已入账/, 'nothing paid: nothing said in');
  const page = readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /\['\[data-spoils-close\]', \(\) => show\(\{ spoils: null \}\)\]/);
  assert.doesNotMatch(page, /SPOILS_MS/, 'it never goes by itself (live 11-05: gone 4–5 s in, before it was read)');
  assert.match(page, /async function onDuelStart\(id\) \{\n[^\n]*\n[^\n]*\n  spoilsAway\(\);/, 'a fight begun puts it away');
  assert.match(page, /skipStaleAsk\(\);\n  spoilsAway\(\);/, 'a board opened puts it away');
  // …nor does the scene's next board deal itself alone over it: a board he did not open waits till it is put away (a3bbb8d).
  assert.match(page, /if \(spoilsUp\(\)\) return \{ \.\.\.slots, main: slots\.main\.filter\(\(c\) => c\.card !== 'board' \|\| c\.id === view\.opened\?\.id\) \};/);
  // …and the big 修为/灵石 burst never floats over the card that already says it.
  assert.match(page, /if \(view\.spoils\?\.paid \|\| spoilsUp\(\)\) return;/);
});
