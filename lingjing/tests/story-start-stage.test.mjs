import test from 'node:test';
import assert from 'node:assert/strict';
import { trayHtml, bookPopHtml, WORDS } from '../scripts/cards.js';
import { openStage } from '../scripts/open-stage.js';

const ctx = { lang: 'zh', words: WORDS.zh, look: {
  place: { id: 'cliff' }, waypoint: { place: { id: 'cliff', name: '崖顶' }, text: '剧情就在此处' },
  tasks: [{ id: 'story', kind: 'board', status: 'offered', game: 'xiangqi', title: '崖顶' }],
  agenda: [{ key: 'way:way', group: 'main', kind: 'way', tray: true }, { key: 'task:story', group: 'main', kind: 'task', id: 'story' }],
} };
test('the goal here carries the same action as the story row', () => {
  assert.match(bookPopHtml(ctx), /data-play="story">开局/);
  assert.match(trayHtml(ctx), /data-play="story">开局/);
});
test('a finished fight closes before opening the story', async () => {
  const events = [];
  assert.equal(await openStage({ fight: 'finished', closeFight: async () => events.push('close'), open: () => events.push('open') }), true);
  assert.deepEqual(events, ['close', 'open']);
});
test('an unfinished fight or board refuses visibly', async () => {
  for (const stage of [{ fight: 'unfinished' }, { board: 'unfinished' }]) {
    const events = [];
    assert.equal(await openStage({ ...stage, note: (code) => events.push(code), open: () => events.push('open') }), false);
    assert.deepEqual(events, [stage.fight ? 'in-a-fight' : 'in-a-board']);
  }
});
