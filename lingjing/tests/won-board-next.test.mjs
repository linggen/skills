// A won board off the story's own stage ends on something to do next (Hanli 10-27, live: 周衡's errand 「陪下一盘」 won,
// the 五子棋 sat 「成了。★★☆」 under the title 「炼丹」 with 问询 and no way on).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look, quest, task, win } from '../scripts/rules.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';
import * as wuziqi from '../scripts/games/wuziqi.js';

const content = loadContent();
const NOW = new Date('2026-10-27T07:00:00-03:00');
const ctx = { now: NOW };
const must = (fn, s, args) => { const r = fn(s, content, ctx, args); assert.ok(r.result.ok, JSON.stringify(r.result).slice(0, 200)); return r.state; };

test('the errand board won: the errand is handed in, the stage holds 交差 and the next step — not the won board', () => {
  // A save at 09-year standing in the 执事堂 (the arcade's fixture, seeded by tools/arcade-saves.mjs).
  let s = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/arcade-duanan.json', import.meta.url), 'utf8')).state;
  assert.equal(s.place, 'zhishi');
  s = must(quest, s, { id: 'guan-zhishi-ledger', action: 'take' });
  s = must(win, s, { id: 'wuziqi' });
  const done = task(s, content, ctx, { action: 'done', id: 'wuziqi' });
  assert.ok(done.result.ok);
  assert.equal(done.result.handed?.[0]?.id, 'guan-zhishi-ledger', 'the errand handed in on the win, 周衡\'s line with it');
  assert.match(done.result.handed[0].done, /眼睛是换过来了/);
  const l = look(done.state, content, ctx);
  const cards = l.stage.map((c) => c.card);
  assert.ok(cards.includes('handed'), '交差 · 陪下一盘 on the stage');
  assert.ok(cards.includes('goal'), 'and what waits next');
  assert.ok(!l.stage.some((c) => c.card === 'board' && c.id === 'wuziqi'), 'the won board is not dealt again');
});

test('a board whose task has left Look keeps its own title, never 「炼丹」', () => {
  const g = { taskId: 'wuziqi', mod: wuziqi, state: wuziqi.newGame('t') };
  const html = cardHtml({ card: 'board', id: 'wuziqi' }, { look: { tasks: [], scene: null }, lang: 'zh', words: WORDS.zh, boardFor: () => g, content: {} });
  assert.match(html, new RegExp(wuziqi.meta.name.zh));
  assert.doesNotMatch(html, /炼丹/);
});

test('the page puts a won board off the story\'s stage away: the tray\'s opened board, Ling\'s Show of it, its live state', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!story\) leaveWonBoard\(taskId\);\n\s*await refresh\(\);/);
  assert.match(src, /function leaveWonBoard\(taskId\) \{[\s\S]*?keep\(\{ opened: null \}\)[\s\S]*?boards\.delete\(taskId\);/);
});
