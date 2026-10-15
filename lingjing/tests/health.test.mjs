// rules/health.mjs — the game's health check, on the states a player can stand in:
// a fresh save, the walk to 外门, a stale fight, 修为 past the book, and the world's
// own needs (Hanli, 2026-10-15: 「游戏的分支太多, 我们应该怎么测试呢」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { health, contentHealth, REPAIRS } from '../scripts/rules/health.mjs';
import { JUAN_ONE } from './crawl.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const ids = (ps, level = 'error') => ps.filter(p => p.level === level).map(p => p.id);
const fresh = () => newState(content, 'zh', NOW);

test('a fresh save is healthy: no error, and the first board stands as an offer to skip', () => {
  const ps = health(content, fresh(), NOW);
  assert.deepEqual(ids(ps), []);
  const offer = ps.find(p => p.id === 'board-open');
  assert.equal(offer.repair.kind, 'skip-board');
  assert.equal(offer.repair.id, 'rain-basins', 'the board on the stage — the first open one in the scene\'s order');
  for (const p of ps) if (p.repair) assert.ok(REPAIRS[p.repair.kind], `${p.repair.kind} is a known repair`);
});

test('卷一\'s content: every need is provided by something in it', () => {
  assert.deepEqual(contentHealth(content, JUAN_ONE), []);
});

test('the walk to 外门 is healthy at every step', () => {
  const s = walk(fresh(), TO_OPEN, content, NOW);
  assert.deepEqual(ids(health(content, s, NOW)), []);
});

test('a fight left open since yesterday is stale', () => {
  const s = { ...fresh(), fight: { game: 'x', creature: 'zheng', at: '2026-09-27T10:00:00' } };
  assert.ok(ids(health(content, s, NOW)).includes('fight-stale'));
});

test('修为 past the 回\'s story cap is found, never pulled down', () => {
  const at = walk(fresh(), TO_OPEN, content, NOW);
  const s = { ...at, tier: 'foundation', step: 3 };
  const p = health(content, s, NOW).find(x => x.id === 'over-cap');
  assert.ok(p);
  assert.equal(p.repair, undefined);
});

