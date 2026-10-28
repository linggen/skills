// 药园捉虫 — the 药园's practice board (Hanli 2026-10-27: 「可以, 加吧」): the 打地鼠 kit (games/rain.js) on six rungs
// that climb (tasks/world.json yaoyuan-zhuochong `climb`, games.json the daily rain row's levels), each a day's own rain.
// Every rung is won by a sensible hand, a slow hand finds the later rungs harder, idle floods; the board stands in the
// 药园's pool; a win deals the next rung.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as rain from '../scripts/games/rain.js';
import { bot } from '../scripts/games/bots/rain.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';
import { look, task, win } from '../scripts/rules.mjs';
import { placeOf } from '../scripts/rules/world.mjs';
import { gamesEver } from '../scripts/rules/rotation.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const content = loadContent();
const TASK = content.tasks.tasks.find((t) => t.id === 'yaoyuan-zhuochong');
const ROW = content.games.games.find((g) => g.task === 'yaoyuan-zhuochong');
const RUNGS = TASK.climb.map((id) => ROW.levels.find((l) => l.id === id));
const SEEDS = Array.from({ length: 16 }, (_, i) => `2026-10-${10 + i}|s|yaoyuan-zhuochong`);

/* A hand that taps a spot `pace` ms after its leaves start to shake, a tap every 350 ms at most. */
function hand(L, seed, pace) {
  let s = rain.act(rain.newGame(seed, 1, { levels: [L] }), { g: 'start' }).state, next = 0, worst = 0;
  const seen = {};
  for (let t = 0; t < 400000 && !s.won; t += 50) {
    L.spots.forEach((_, i) => { const on = rain.leakingAt(s.sched, i, s.t); seen[i] = on ? seen[i] ?? t : null; });
    const i = L.spots.findIndex((_, k) => s.basins[k] == null && seen[k] != null && t - seen[k] >= pace);
    if (i >= 0 && t >= next) { s = rain.act(s, { g: 'spot', i }).state; next = t + 350; }
    s = rain.tick(s, 50);
    worst = Math.max(worst, s.puddles ?? 0);
    if (s.floods) return { won: false, worst };
  }
  return { won: s.won, worst };
}

test('six rungs, each its own, climbing: more beds, more grubs to catch, quicker, crowded sooner', () => {
  assert.equal(ROW.group, 'daily');
  assert.equal(ROW.mechanic, '打地鼠');
  assert.equal(TASK.game, 'rain');
  assert.deepEqual(TASK.how, RUNGS[0].how, 'the frame\'s how-line is the board\'s own (live 10-27 it read 接雨\'s 「摆盆」)');
  assert.equal(RUNGS.length, 6);
  assert.equal(new Set(TASK.climb).size, TASK.climb.length, 'no rung twice');
  assert.ok(RUNGS.every(Boolean), 'every rung is a level of the row');
  assert.ok(ROW.levels.every((l) => !l.story && !l.realm), 'a practice ladder, no story level in it');
  for (let i = 1; i < RUNGS.length; i += 1) {
    const [a, b] = [RUNGS[i - 1], RUNGS[i]];
    assert.ok(b.need > a.need, `${b.id} asks more than ${a.id}`);
    assert.ok(b.spots.length >= a.spots.length && b.lead < a.lead && b.gap[1] < a.gap[1] && b.three <= a.three, `${b.id} is quicker than ${a.id}`);
  }
  for (const L of RUNGS) {
    for (const k of ['ready', 'go', 'placed', 'wasted', 'flood', 'dry', 'wet', 'short']) assert.ok(L.lines.zh[k] && L.lines.en[k], `${L.id} ${k}`);
    for (const p of Object.values(L.art)) assert.ok(fs.existsSync(new URL(`../worlds/jiuding/art/games/${p}`, import.meta.url)), `${L.id}: ${p} painted`);
  }
  assert.equal(new Set(RUNGS.map((l) => l.lines.zh.ready)).size, 6, 'each rung opens on its own line');
});

test('every rung: the bot wins it, a 0.6 s hand wins it, idle floods it; a 0.9 s hand finds the top harder than the first', () => {
  const slow = [];
  for (const L of RUNGS) {
    for (const seed of SEEDS.slice(0, 8)) assert.equal(playOnce(rain, bot, { seed, deal: { levels: [L] } }).won, true, `bot ${L.id} ${seed}`);
    const quick = SEEDS.map((seed) => hand(L, seed, 600));
    assert.ok(quick.every((r) => r.won), `${L.id}: a 0.6 s hand wins every seed`);
    let s = rain.act(rain.newGame('idle', 1, { levels: [L] }), { g: 'start' }).state;
    for (let t = 0; t < 60000 && !s.floods; t += 50) s = rain.tick(s, 50);
    assert.ok(s.floods >= 1, `${L.id}: idle floods within a minute`);
    slow.push(SEEDS.map((seed) => hand(L, seed, 900)));
  }
  const worst = slow.map((rs) => rs.map((r) => (r.won ? r.worst : 99)).sort((a, b) => a - b)[rs.length >> 1]);
  for (let i = 1; i < worst.length; i += 1) assert.ok(worst[i] >= worst[i - 1], `the 0.9 s hand's puddles climb: ${worst}`);
  assert.ok(slow[0].every((r) => r.won), 'the first rung is a 0.9 s hand\'s');
  assert.ok(slow.at(-1).filter((r) => r.won).length < SEEDS.length, 'the top rung asks a quicker hand');
});

test('a deal names its rung (`lv`, rules/climb.mjs): the kit plays that one; a deal with no `lv` plays its first level, as the story\'s', () => {
  const deal = { lv: 'yaoyuan-4', levels: ROW.levels };
  assert.equal(rain.newGame('a', 1, deal).level.id, 'yaoyuan-4');
  assert.equal(rain.newGame('a', 1, { levels: ROW.levels }).level.id, 'yaoyuan-1');
  assert.equal(rain.newGame('a', 1, { lv: 'nope', levels: ROW.levels }).level.id, 'yaoyuan-1');
  assert.notDeepEqual(rain.newGame('2026-10-27|x|yaoyuan-zhuochong', 1, deal).sched, rain.newGame('2026-10-28|x|yaoyuan-zhuochong', 1, deal).sched, 'another day, another rain');
});

test('the 药园 pools it; standing there on a day it is up, Look deals the rung he is on, and a win deals the next', () => {
  const p = placeOf(content, 'yaoyuan');
  assert.ok(gamesEver(p).includes('yaoyuan-zhuochong'));
  const SAVE = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
  let n = 0;
  const day = (k) => new Date(2026, 9, 27 + k, 10);
  const here = (now, extra = {}) => ({ ...SAVE, place: 'yaoyuan', tier: 'qi', step: 1, progress: 100, stamina: 100, stamina_at: now.toISOString(), ...extra });
  let row = null;
  for (; n < 6 && !row; n += 1) row = look(here(day(n)), content, { now: day(n), quests: [] }).tasks.find((t) => t.id === 'yaoyuan-zhuochong');
  assert.ok(row, 'up some day of the six');
  assert.equal(row.practice, true);
  assert.equal(row.deal.lv, 'yaoyuan-1');
  const now = day(n - 1), c = { now, quests: [] };
  const won = win(here(now), content, c, { id: 'yaoyuan-zhuochong', stars: 3 });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  assert.equal(won.state.climb?.rain, 1, 'the first rung behind him');
  const done = task({ ...won.state, stamina: 100 }, content, c, { action: 'done', id: 'yaoyuan-zhuochong' });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  assert.ok(done.state.progress > 100, 'a practice board pays its minutes');
  const tomorrow = day(n + 1), next = look({ ...done.state, stamina: 100, stamina_at: tomorrow.toISOString() }, content, { now: tomorrow, quests: [] }).tasks.find((t) => t.id === 'yaoyuan-zhuochong');
  assert.equal(next?.deal?.lv, 'yaoyuan-2', 'two days on, the next rung');
});
