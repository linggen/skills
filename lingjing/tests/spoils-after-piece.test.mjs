// 所得 after the 大场面, the gear first (Hanli 11-03 at 古七's 09-snow, 喂饭桶 · 扔了干净: 「是在饭桶动画场面前给的, 应该是在饭桶
// 大场面动画后给」 · 「以为只拿到一张牌, 没看到剑」).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent, lint } from '../scripts/content.mjs';
import { fitWorld } from '../scripts/state.mjs';
import { resolve } from '../scripts/rules.mjs';
import { spoilsHtml } from '../scripts/battle-card.js';
import { spoilGearHtml } from '../scripts/pouch.js';
import { WORDS } from '../scripts/cards.js';
import { crawlRules } from './crawl.mjs';

const content = loadContent();
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const name = (x) => x?.zh ?? x;

test('所得 lists the gear first with its 戴上 (and 给银月 where the rules allow), then the cards and the rest', () => {
  const ctx = { lang: 'zh', words: WORDS.zh, her: { name: '银月' } };
  const sword = { id: 'huochai-jian', name: '火柴', slot: 'weapon', effect: { atk: 3, root: 'fire', root_name: '火' }, wear_on: [{ on: 'me', slot: 'weapon' }] };
  const row = spoilGearHtml(sword, ctx);
  assert.match(row, /<b>法器 · 火柴<\/b>/);
  assert.match(row, /器攻 \+3 · 佩之借火/);
  assert.match(row, /data-spoil-wear="huochai-jian">戴上 · 法器</);
  assert.match(spoilGearHtml({ ...sword, wear_on: [{ on: 'her', slot: 'weapon' }] }, ctx), /data-spoil-wear="huochai-jian" data-on="her">给银月 · 法器</);
  const html = spoilsHtml({ items: [{ id: 'gan', name: '干粮' }, sword], cards: [{ id: 'mucao' }] }, {
    lang: 'zh', words: { spoils: '所得', spoilsCard: '牌', spoilsBag: '入袋：', spoilsClose: '收起', spentTitle: '', spoilsIn: '' }, catalog: {}, gearRow: (i) => spoilGearHtml(i, ctx),
  });
  assert.ok(html.indexOf('spoilgear') < html.indexOf('干粮'), 'the gear before the rest');
  assert.ok(!/入袋：[^<]*火柴/.test(html), 'not listed twice');
});

test('the page shows a step\'s 所得 after its 大场面: held from the read that brings it, let go when the piece closes', () => {
  const page = read('../scripts/lingjing.js');
  assert.match(page, /if \(n\?\.at && n\.at !== was\.story_node\?\.at && setpieceOf\(n\)\) pieceDue = \{ id: setpieceOf\(n\), at: Date\.now\(\) \};/, 'held from the read');
  assert.match(page, /function revealHeld\(\) \{\n {2}if \(bout \|\| pieceOn\) return true;/);
  assert.match(page, /if \(revealing \|\| revealHeld\(\) \|\| !revealQueue\.length \|\| !authored\) return;/, 'the reveals wait');
  assert.match(page, /if \(pieceDue\?\.id === id\) pieceDue = null; render\(\); queueMicrotask\(playReveals\);/, 'played once it closes');
  assert.match(page, /\.sort\(\(a, b\) => Number\(Boolean\(b\.slot\)\) - Number\(Boolean\(a\.slot\)\)\)/, 'gear first in the reveals');
  assert.match(page, /\['\[data-spoil-wear\]'[^\n]*\n\s*\['\[data-spoils-close\]'/, '戴上 heard before the card\'s own close');
  assert.match(page, /write\('trade', \{ action: 'use', id, \.\.\.\(on \? \{ on \} : \{\}\) \}\)/, 'the 储物袋\'s trade use');
});

test('09-snow: its 景 is a beat of the passage — 所得 is held until that beat has been shown (dialogue.js pieceStillAhead)', async () => {
  const { pieceStillAhead, current, advance, withTold, emptyReading } = await import('../scripts/dialogue.js');
  const { playOf, tellOf } = await import('../scripts/rules/tell.mjs');
  const crawl = crawlRules(content);
  const got = crawl.states.get('00-zhuji/09-snow');
  const s = resolve({ ...got.s, stamina: 100, stamina_at: got.now.toISOString() }, content, { now: got.now, quests: [] }, { exit: 'feed' }).state;
  const t = { result: { tell: playOf(content, s, tellOf(content, s).tell) } };
  let r = withTold(emptyReading('09-snow'), t.result.tell, s.scene);
  assert.ok(pieceStillAhead(r, 'zh'), 'the passage starts: the piece is ahead, 所得 waits');
  let k = 0;
  for (; k < 200 && current(r, 'zh').beat.piece !== 'huochai'; k += 1) r = advance(r, 'zh');
  assert.equal(current(r, 'zh').beat.piece, 'huochai', 'the 景 beat reached');
  assert.ok(pieceStillAhead(r, 'zh'), 'on the 景 beat: still held');
  r = advance(r, 'zh');
  assert.equal(pieceStillAhead(r, 'zh'), false, 'past it: 所得 shows');
});
