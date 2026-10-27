// A practice board played today rests out of the tray till tomorrow (Hanli 10-27: 「左下角还是有刚玩完的拼图任务」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { trayHtml, WORDS } from '../scripts/cards.js';

test('the tray rests a practice board played today, keeps one not yet played', () => {
  const row = (id, extra = {}) => ({ id, kind: 'board', game: id, title: id, status: 'offered', practice: true, ...extra });
  const html = trayHtml({ lang: 'zh', words: WORDS.zh, look: { tasks: [row('pintu', { played_today: 1 }), row('huarong')] } });
  assert.doesNotMatch(html, /data-play="pintu"/);
  assert.match(html, /data-play="huarong"/);
});
