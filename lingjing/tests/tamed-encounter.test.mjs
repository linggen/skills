// A beast tamed is beaten, whatever won it over (live, 2026-10-15: after 药园's
// scene fight 狰 joined the cast, yet Look's encounter said `beaten: false` and
// Ling told the player 「它还未被降服」 beside the stage's 已收服).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const at = (s) => look(s, content, { now: NOW, quests: [] }).place.encounter;

test('狰 tamed by the scene fight reads beaten and tamed at its haunt', () => {
  const s = { ...walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW), place: 'yaoyuan' };
  const before = at(s);
  assert.equal(before?.creature?.id, 'zheng');
  assert.equal(before.tamed, false);
  const e = at({ ...s, cast: [...s.cast, 'zheng'], wins: { ...s.wins, 'yaoyuan-zheng': NOW.toISOString() } });
  assert.equal(e.tamed, true);
  assert.equal(e.beaten, true, 'tamed is beaten');
});
