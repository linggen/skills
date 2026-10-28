// A practice board played today leaves the tray till tomorrow (Hanli 10-28: 「玩过一次怎么还有?」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { trayHtml, WORDS } from '../scripts/cards.js';

test('a practice board played today is not in the tray; the others stay', () => {
  const row = (id, extra = {}) => ({ id, kind: 'board', game: id, title: id, status: 'offered', practice: true, ...extra });
  const html = trayHtml({ lang: 'zh', words: WORDS.zh, look: { tasks: [row('pintu', { played_today: 1 }), row('huarong')] } });
  assert.match(html, /data-play="huarong"/);
  assert.doesNotMatch(html, /data-play="pintu"/);
  assert.doesNotMatch(html, /今日已玩/);
});
