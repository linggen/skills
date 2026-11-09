import test from 'node:test';
import assert from 'node:assert/strict';
import { encounterOf } from '../scripts/rules/world.mjs';
import { content, NOW, stateAt } from '../tools/story-fights.mjs';
import { duel, look } from '../scripts/rules.mjs';
import { cardCatalog } from '../scripts/rules/cards.mjs';
import { winningPicks } from '../scripts/rules/progress.mjs';
import { WORDS, bookPopHtml, cardHtml } from '../scripts/cards.js';

const id = 'xu-fuli-longzhi', fid = `quest:${id}`, ctx = { now: NOW, quests: [] };
function save(place = 'shanlu') {
  return { ...stateAt('h10'), place, scene: null, cast: [], stamina: 100, stamina_at: NOW.toISOString(),
    quests: { [id]: { taken_at: NOW.toISOString(), have: [0] } },
    duels: { 'hunt:shanlu': { day: '2026-09-29', last: ['longzhi'], stand: { cid: 'lang', n: 0 }, n: 0 } } };
}

test('quest action fights here and walks when away, on book and home', () => {
  const here = look(save(), content, ctx), row = here.book.find(q => q.id === id);
  assert.equal(row.go.does, 'fight');
  assert.equal(row.go.id, fid);
  assert.equal(here.home.todo.find(q => q.id === id).go.does, 'fight');
  assert.match(bookPopHtml({ look: here, words: WORDS.zh, lang: 'zh' }), /data-duel-start="quest:xu-fuli-longzhi"[^>]*>开打/);
  assert.match(cardHtml({ card: 'next' }, { look: here, words: WORDS.zh, lang: 'zh' }), /data-duel-start="quest:xu-fuli-longzhi"[^>]*>开打/);
  const away = look(save('zhishi'), content, ctx);
  assert.equal(away.book.find(q => q.id === id).go.does, 'move');
  assert.equal(away.home.todo.find(q => q.id === id).go.does, 'move');
});

test('quest fight is separate from the daily pool and counts only the quest', () => {
  const s = save(), record = structuredClone(s.duels['hunt:shanlu']);
  assert.equal(encounterOf(content, s, NOW).creature.id, 'lang');
  const door = duel(s, content, ctx, { id: fid });
  assert.equal(door.result.ok, true, JSON.stringify(door.result));
  assert.equal(door.state.fight.creature, 'longzhi');
  assert.deepEqual(door.state.duels['hunt:shanlu'], record);
  const picks = winningPicks(door.state.fight.setup, cardCatalog(content), 60);
  assert.ok(picks, 'winning line');
  const won = duel(door.state, content, ctx, { id: fid, picks: picks.join(',') });
  assert.equal(won.result.outcome, 'won', JSON.stringify(won.result));
  assert.deepEqual(won.state.duels['hunt:shanlu'], record);
  assert.equal(encounterOf(content, won.state, NOW).creature.id, 'lang');
  assert.ok(won.state.quests[id].done_at || won.state.quests[id].have[0] >= 1);
  assert.equal(won.result.paid, undefined);
});
