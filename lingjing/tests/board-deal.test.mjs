// A won story board is never dealt fresh while its win is on its way (live 2026-10-16: 算账's 割绳子
// beat showed a new level for half a second before its choices — onWin let go of `winning` after its
// pause, before Look had caught up, and a draw in between found the board spent).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spentBoard } from '../scripts/board-deal.js';

const DAY = 'Fri Oct 16 2026';
const won = (extra = {}) => ({ day: DAY, sent: true, state: { won: true }, ...extra });

test('a won, sent board is spent only once its win is counted and the task offered again', () => {
  const offered = { status: 'offered', won: false };
  assert.equal(spentBoard(won({ winning: true }), offered, DAY), false, 'its win on its way: not spent');
  assert.equal(spentBoard(won(), offered, DAY), true, 'counted and asked for again: a new game');
  assert.equal(spentBoard(won(), { status: 'done', won: true }, DAY), false, 'done: the won board stands');
  assert.equal(spentBoard(won(), offered, 'another day'), false);
  assert.equal(spentBoard(null, offered, DAY), false);
});

test('the page holds `winning` until Look has caught up: released in a finally after the win is written and Look refreshed', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const onWin = src.slice(src.indexOf('async function onWin(taskId)'), src.indexOf('async function settleWin('));
  assert.match(onWin, /won\.winning = true/);
  assert.match(onWin, /try \{ await pause\([^)]*\)[^;]*; return await settleWin\(taskId, won, grade\); \} finally \{ if \(won\) won\.winning = false; \}/,
    'released only after settleWin (the write, the pay, the refresh) is done');
  const settle = src.slice(src.indexOf('async function settleWin('), src.indexOf('const isTask ='));
  assert.ok(settle.indexOf("write('win'") >= 0 && settle.indexOf('await refresh()') > settle.indexOf("write('win'"), 'settleWin writes the win, then refreshes Look');
  assert.doesNotMatch(settle, /winning = false/, 'nothing lets go of it early');
  assert.match(src, /const spent = spentBoard\(old, task, day\);/);
});
