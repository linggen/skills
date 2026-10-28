// Past the top of a climbing board (rules/climb.mjs `climb_top`; the coordinator for Hanli, 10-27: levels never repeat):
// once every rung is won, a task that declares top layouts deals one a day, by the day and the save's seed, walked round so
// none comes two days running; a task without them deals its last rung again, as before. 柴房's 赶黄鼠狼 declares five.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { climbLv, climbWon, dealtOf, topLv } from '../scripts/rules/climb.mjs';
import { loadContent } from '../scripts/content.mjs';
import { look } from '../scripts/rules.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const day = (n, h = 10) => new Date(2026, 9, 27 + n, h);
const T = { id: 'demo', game: 'demo-game', climb: ['r1', 'r2', 'r3'], climb_top: ['t1', 't2', 't3', 't4'] };

test('the rungs first, in order; a loss deals the same rung; then one top layout a day', () => {
  const s = { seed: 'a', climb: {} };
  assert.equal(climbLv(s, T, day(0)), 'r1');
  climbWon(s, T); assert.equal(climbLv(s, T, day(0)), 'r2');
  climbWon(s, T); climbWon(s, T);
  assert.equal(s.climb['demo-game'], 3, 'every rung won');
  assert.ok(T.climb_top.includes(climbLv(s, T, day(0))));
  climbWon(s, T);
  assert.equal(s.climb['demo-game'], 3, 'a top won moves nothing');
  assert.equal(dealtOf(content, s, T, day(0)).lv, topLv(s, T, day(0)));
});

test('the top: never the same layout two days running, every one in turn, the same all day, another save another order', () => {
  for (const seed of ['a', 'b', 'c']) {
    const s = { seed, climb: { 'demo-game': 3 } }, seen = new Set();
    let prev = null;
    for (let n = 0; n < 40; n += 1) {
      const lv = climbLv(s, T, day(n));
      assert.notEqual(lv, prev, `${seed} day ${n}`);
      assert.equal(lv, climbLv(s, T, day(n, 23)), 'the same all day');
      seen.add(lv); prev = lv;
    }
    assert.equal(seen.size, 4, `${seed}: every top layout comes round`);
  }
  const week = (seed) => Array.from({ length: 4 }, (_, n) => climbLv({ seed, climb: { 'demo-game': 3 } }, T, day(n))).join();
  assert.ok(['a', 'b', 'c', 'd'].some((x) => week(x) !== week('a')), 'two saves walk two orders');
});

test('no `climb_top`: the last rung again, as before', () => {
  const t = { ...T, climb_top: undefined };
  assert.equal(climbLv({ seed: 'a', climb: { 'demo-game': 3 } }, t, day(0)), 'r3');
  assert.equal(climbLv({ seed: 'a', climb: { 'demo-game': 9 } }, t, day(5)), 'r3');
});

test('柴房\'s 赶黄鼠狼: five top layouts, each a level of the build; past the top Look deals the day\'s', () => {
  const t = content.tasks.tasks.find((x) => x.id === 'chaifang-huangshulang');
  assert.equal(t.climb_top.length, 5);
  assert.equal(new Set([...t.climb, ...t.climb_top]).size, t.climb.length + t.climb_top.length, 'no layout twice');
  const built = new Set(JSON.parse(fs.readFileSync(new URL('../scripts/games/zhazhai/levels.json', import.meta.url), 'utf8')).levels.map((l) => l.key));
  for (const k of [...t.climb, ...t.climb_top]) assert.ok(built.has(k), `${k} is built`);
  const SAVE = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
  const deals = [];
  for (let n = 0; n < 9; n += 1) {
    const now = day(n), s = { ...SAVE, place: 'chaifang', tier: 'qi', step: 1, progress: 100, stamina: 100, stamina_at: now.toISOString(), climb: { zhazhai: 6 } };
    const row = look(s, content, { now, quests: [] }).tasks.find((x) => x.id === 'chaifang-huangshulang');
    if (row) deals.push([n, row.deal.lv]);
  }
  assert.ok(deals.length >= 2, `up some days of nine: ${JSON.stringify(deals)}`);
  for (const [n, lv] of deals) assert.equal(lv, topLv(SAVE, t, day(n)), `day ${n}`);
  assert.ok(deals.every(([, lv]) => t.climb_top.includes(lv)));
});
