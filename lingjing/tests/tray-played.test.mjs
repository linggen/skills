// A practice board played today stays in the tray, last, as 今日已玩 (Hanli 10-27: 「左下角还是有刚玩完的拼图任务」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { trayHtml, WORDS } from '../scripts/cards.js';

test('a practice board played today stays, last, as 今日已玩 — never 待做', () => {
  const row = (id, extra = {}) => ({ id, kind: 'board', game: id, title: id, status: 'offered', practice: true, ...extra });
  const html = trayHtml({ lang: 'zh', words: WORDS.zh, look: { tasks: [row('pintu', { played_today: 1 }), row('huarong')] } });
  assert.ok(html.indexOf('data-play="huarong"') < html.indexOf('data-play="pintu"'), 'played last');
  assert.match(html, /今日已玩/);
});
