// Every cooldown waits the same way (2026-10-26, the coordinator for Hanli): Look's `waits` carries each one in one
// shape — { id, title, shut, wait_min } — and the page's tray draws one row shape (cards.js waitRowHtml), in the
// world's words. 兽潮's is held in tests/shouchao.test.mjs; here a pool at rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { look, playTo } from '../scripts/rules.mjs';
import { WORDS, trayHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00+08:00');
const tray = (waits, lang = 'zh') => trayHtml({ look: { tasks: [], waits }, lang, words: WORDS[lang], qi: { st: 'full' } });

test('a pool at rest: on Look as a wait where he stands, in the world\'s words, gone once it has rested', () => {
  const jiScenes = Object.keys(content.chapters['01-ji'].scenes);
  const base = { ...newState(content, 'zh', NOW), chapter: '01-ji', scene: null, place: 'mengshan', tier: 'foundation', step: 0, progress: 0, wealth: 10,
    traits: ['wood', 'fire'], ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], done_scenes: jiScenes, stamina: 100, stamina_at: NOW.toISOString() };
  const won = (ago) => ({ ...base, duels: { 'hunt:mengshan': { at: new Date(NOW.getTime() - ago * 60000).toISOString(), outcome: 'won', day: dayKey(NOW), n: 1, streak: content.balance.cooldowns.pool_rest_after } } });
  const w = look(won(4), content, { now: NOW, quests: [] }).waits?.find((x) => x.id === 'pool:mengshan');
  assert.deepEqual(w, { id: 'pool:mengshan', title: '蒙山', shut: content.creatures.hunt.rest_say.zh, wait_min: content.balance.cooldowns.pool_rest_min - 4 });
  assert.equal(look(won(content.balance.cooldowns.pool_rest_min + 1), content, { now: NOW, quests: [] }).waits, undefined, 'rested: the beast stands, no wait');
  // The tray's words for a 20-minute wait, whatever the rest is set to.
  const row = { ...w, wait_min: 20 }, html = tray([row]);
  assert.ok(html.includes('data-wait="pool:mengshan"') && html.includes(w.shut) && html.includes('约 2 刻后'), html);
  assert.ok(tray([row], 'en').includes('back in about 20 min'));
});

