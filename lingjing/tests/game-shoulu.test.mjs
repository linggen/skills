// 守炉 · tower defense — the level rows (games.json `shoulu`) are sound, each level brings one new
// thing and climbs, waves come on their own, 银月 goes where she's sent and holds the road, and the
// balance holds: on every level a sensible mixed build wins and no build, a 剑阵-only build and a
// 火符-only build lose (L1, the tutorial, lets 火符 alone through — its herds are 火符's lesson).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BEASTS, HERO, TOWERS, beastsOf, callWave, layLevel, newGame, offRoad, sendHero, sim, step, waves } from '../scripts/games/shoulu/core.js';
import { levelAsked, meta } from '../scripts/games/shoulu.js';

const reg = JSON.parse(readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const row = reg.games.find((g) => g.id === 'shoulu');
const levels = row.levels;
const creatures = new Set(JSON.parse(readFileSync(new URL('../worlds/jiuding/creatures.json', import.meta.url), 'utf8')).creatures.map((c) => c.id));
const places = new Set(['ji', 'jing', 'liang', 'qing', 'xu', 'yan', 'yang', 'yong', 'yu'].flatMap((p) => JSON.parse(readFileSync(new URL(`../worlds/jiuding/places/${p}.json`, import.meta.url), 'utf8')).places.map((x) => x.id)));
const SEEDS = ['a', 'b', 'c', 'd', 'e'];

test('registered: meta, the row in the 游戏厅, five levels', () => {
  assert.equal(meta.id, 'shoulu');
  assert.ok(meta.name.en && meta.how.zh && meta.how.en);
  assert.equal(row.mechanic, '塔防');
  assert.ok(reg.groups.some((g) => g.id === row.group));
  assert.equal(levels.length, 5);
  assert.equal(levelAsked({}, '?dev=1&game=shoulu&lv=3'), 3);
  assert.equal(levelAsked({ lv: 2 }, '?lv=5'), 2);
  assert.equal(levelAsked({}, '?lv=x'), 0);
});

test('every level is sound: its road, its spots, its furnace, its words, 卷一 beasts and places', () => {
  for (const r of levels) {
    const L = layLevel(r);
    assert.ok(r.story === null || typeof r.story === 'string', r.id);
    assert.ok(places.has(r.place), `${r.id}: place ${r.place}`);
    assert.ok(r.name.zh && r.name.en && r.lead.length >= 3 && r.lead.every((l) => l.zh && l.en), r.id);
    assert.ok(r.lead.some((l) => l.big), `${r.id}: the 兽潮来袭 banner`);
    const [sx, sy] = r.road[0];
    assert.ok(sx < 0 || sx > 600 || sy < 0, `${r.id}: the road comes in from off the board`);
    const end = r.road.at(-1);
    assert.ok(Math.hypot(end[0] - r.furnace[0], end[1] - r.furnace[1]) <= 40, `${r.id}: the road ends at the furnace`);
    for (const [x, y] of r.spots) {
      const d = offRoad(L.road, x, y);
      assert.ok(d >= 40 && d <= 95, `${r.id}: spot ${x},${y} is ${Math.round(d)} off the road`);
      assert.ok(x >= 22 && x <= 578 && y >= 70 && y <= 738, `${r.id}: spot ${x},${y} on the board`);
      assert.ok(Math.hypot(x - r.furnace[0], y - r.furnace[1]) > 60, `${r.id}: spot ${x},${y} clear of the furnace`);
    }
    r.spots.forEach(([x, y], i) => r.spots.slice(i + 1).forEach(([x2, y2]) => assert.ok(Math.hypot(x - x2, y - y2) >= 50, `${r.id}: spots ${x},${y} and ${x2},${y2} apart`)));
    for (const b of beastsOf(r)) { assert.ok(BEASTS[b], `${r.id}: beast ${b}`); assert.ok(creatures.has(b), `${r.id}: ${b} in creatures.json`); }
    assert.ok(r.towers.every((k) => TOWERS[k]));
    if (beastsOf(r).some((b) => BEASTS[b].fly)) assert.ok(r.air, `${r.id}: fliers need a start`);
  }
  assert.ok(!levels.some((r) => beastsOf(r).includes('kuiniu')), '夔牛 is 卷七: not in 卷一');
});

test('each level brings exactly one new beast, in the order 野猪 → 狰 → 犰狳 → 鬿雀 → 合窳, and its answer', () => {
  const order = ['yezhu', 'zheng', 'qiuyu', 'qique', 'heyu'];
  const towers = [['jian', 'huo'], ['jian', 'huo', 'han'], ['jian', 'huo', 'han'], ['jian', 'huo', 'han', 'lei'], ['jian', 'huo', 'han', 'lei']];
  let seen = new Set();
  levels.forEach((r, i) => {
    const now = new Set(beastsOf(r)), fresh = [...now].filter((b) => !seen.has(b));
    assert.deepEqual(fresh, [order[i]], `${r.id}: new beasts`);
    assert.equal(r.new.beast, order[i]);
    assert.deepEqual([...r.towers].sort(), [...towers[i]].sort(), `${r.id}: towers`);
    seen = new Set([...seen, ...now]);
  });
  assert.equal(levels[3].unlock.lei, 3, '雷符 opens on 后山 from wave 3');
  assert.ok(beastsOf(levels[4]).filter((b) => BEASTS[b].boss).length === 1 && levels[4].waves.at(-1).some(([b]) => b === 'heyu'), '合窳 in the last wave');
  const n = levels.map((r) => r.waves.length);
  assert.ok(n.every((x, i) => i === 0 || x >= n[i - 1]), `wave counts climb: ${n}`);
});

test('waves start on the countdown, never by a tap; calling early pays', () => {
  const g = newGame(levels[0], { seed: 's', headless: true });
  assert.equal(g.wave, 0);
  for (let t = 0; t < g.L.first - 0.5; t += 0.1) step(g, 0.1);
  assert.equal(g.wave, 0, 'not before the lead-in ends');
  for (let t = 0; t < 1; t += 0.1) step(g, 0.1);
  assert.equal(g.wave, 1, 'wave 1 came by itself');
  const h = newGame(levels[0], { seed: 's', headless: true });
  const money = h.money, bonus = callWave(h, true);
  assert.equal(h.wave, 1);
  assert.ok(bonus > 0 && h.money === money + bonus, 'an early call pays');
});

test('银月 goes where she is sent, and holds two ground beasts there', () => {
  const g = newGame(levels[0], { seed: 'h', headless: true });
  const [x, y] = levels[0].road[2];
  assert.ok(sendHero(g, x, y));
  for (let t = 0; t < 10; t += 1 / 30) step(g, 1 / 30);
  assert.ok(Math.hypot(g.hero.x - x, g.hero.y - y) < 3, 'she is there');
  callWave(g);
  let held = 0;
  for (let t = 0; t < 40 && !g.over; t += 1 / 30) { step(g, 1 / 30); held = Math.max(held, g.hero.held.length); }
  assert.equal(held, HERO.block, 'she held the road');
  assert.ok(g.stats.kills > 0, 'and bit');
});

/* The balance: every seed agrees. */
const run = (r, s) => SEEDS.map((seed) => sim(r, s, { seed }));
const allWin = (rs) => rs.every((x) => x.result === 'win');
const allLose = (rs) => rs.every((x) => x.result === 'lose');
levels.forEach((r, i) => {
  test(`balance L${i + 1} ${r.id}: mixed wins, none and mono lose`, () => {
    const mixed = run(r, 'mixed');
    assert.ok(allWin(mixed), `mixed: ${mixed.map((x) => `${x.result}@${x.wave}`)}`);
    assert.ok(allLose(run(r, 'none')), 'none loses');
    assert.ok(allLose(run(r, 'jian')), '剑阵 alone loses');
    if (i > 0) assert.ok(allLose(run(r, 'huo')), '火符 alone loses');
  });
});
test('balance climbs: the mixed build keeps less fire level by level (L1 → L5)', () => {
  const hp = levels.map((r) => Math.min(...run(r, 'mixed').map((x) => x.hp)));
  assert.equal(hp[0], 10, `L1 is the tutorial: ${hp}`);
  assert.ok(hp[4] < hp[0] && hp[3] < hp[0], `the late levels are harder: ${hp}`);
});
test('the counters: 犰狳 levels beat 剑阵 alone; 鬿雀 levels beat 火符 alone at once', () => {
  for (const i of [2, 3, 4]) assert.ok(beastsOf(levels[i]).includes('qiuyu') && allLose(run(levels[i], 'jian')));
  for (const i of [3, 4]) assert.ok(run(levels[i], 'huo').every((x) => x.leaks.qique > 0));
  assert.equal(waves(newGame(levels[4], { headless: true })), levels[4].waves.length);
});
