import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEASTS, callWave, eliteKind, jieyinCast, levelsFrom, newGame, spawnAt } from '../scripts/games/shoulu/core.js';
import { eliteMark } from '../scripts/games/shoulu/draw.js';
import { tide } from '../scripts/games/shoulu/tide.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const table = read('../worlds/jiuding/games.json').games.find((g) => g.id === 'shoulu' && g.levels);
const host = read('../worlds/jiuding/levels/jieyin.json').hosts.shoulu;
const levels = levelsFrom(table), kinds = ['qiuyu', 'zheng', 'qique'];
function queued(row) {
  const g = newGame(row, { headless: true }); g.wave = g.L.waves.length - 1; callWave(g);
  return g.queue.filter((b) => b.elite);
}
test('last-wave elites use mythic beasts on every level and sampled tide tier', () => {
  for (const row of levels) for (const b of queued(row)) assert.ok(kinds.includes(b.type), row.id);
  for (const tier of [0, 0.25, 0.5, 0.75, 1]) for (let i = 0; i < 3; i += 1) {
    const got = tide.night(table, { seed: `elite-${tier}-${i}`, tier, boss: false, open: () => true });
    assert.ok(got);
    for (const b of queued(got.deal.levels[0])) assert.ok(kinds.includes(b.type));
  }
  assert.equal(eliteKind({ waves: [[['yezhu', 1, 1, 0]]] }), 'qiuyu');
  assert.equal(eliteKind({ waves: [[['qique', 1], ['zheng', 1], ['qiuyu', 1]]] }), 'qiuyu');
});
test('each aimed elite seal takes its configured share of maximum life at each mastery', () => {
  for (const move of host.moves) for (const mastery of [1, 1.5, 2]) {
    const g = newGame(levels[0], { headless: true });
    const b = spawnAt(g, 'qiuyu', 100); b.elite = true;
    const cfg = { ...host, cool: 0, mastery: { [move.id]: mastery } };
    assert.ok(jieyinCast(g, move.id, cfg));
    assert.ok(Math.abs((b.max - b.hp) / b.max - 0.4 * mastery) < 1e-9);
  }
  const g = newGame(levels[0], { headless: true }); const b = spawnAt(g, 'qiuyu', 100); b.elite = true;
  for (let i = 0; i < 3; i += 1) { assert.ok(jieyinCast(g, 'feijian', { ...host, cool: 0 })); assert.equal(b.dead, i === 2); }
});
test('elite mark describes a named, enlarged figure and pulsing ground ring', () => {
  const b = { type: 'qiuyu', x: 30, y: 100 }; const a = eliteMark(b, { qiuyu: '犰狳' }, 0), z = eliteMark(b, { qiuyu: 'Qiuyu' }, 0.5);
  assert.equal(a.name, '犰狳'); assert.equal(z.name, 'Qiuyu'); assert.equal(a.scale, 1.5);
  assert.ok(a.ringX > BEASTS.qiuyu.r && a.ringY > 0 && a.alpha !== z.alpha && a.barY < b.y);
});
