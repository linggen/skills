// 心魔 — 秘境探险's heart-demon room (rules/mijing.mjs, worlds/jiuding/mijing.json `deals` · gedou; 2026-10-31): 格斗 against
// 沈小满's own shadow. Its weight in the deal draw, a board in every 重, the room hosting the 格斗 level `xinmo` (the
// mirror: his sheet washed dark, his clips for her moves, his own moves turned on him), and the bout won by a
// human-like hand while a masher, a wall of blocks and an idle hand go down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { mapOf } from '../scripts/rules/mijing.mjs';
import * as F from '../scripts/games/fighter.js';
import { bot } from '../scripts/games/bots/fighter.js';
import { playModule } from '../tools/board-bots.mjs';
import fs from 'node:fs';

const content = loadContent();
const M = content.mijing;
const NOW = new Date(2026, 9, 31, 10, 0);
const ctx = () => ({ now: NOW, quests: [] });
const call = (verb, s, args) => VERBS[verb](s, content, ctx(), args);
const row = content.games.games.find((g) => g.id === 'fighter' && g.task === 'mijing-xinmo');
const L = row.levels[0];

test('心魔 is drawn: 格斗 is a deal of the 秘境 (weight above 0) at level `xinmo` in every 重, its room the 心魔\'s', () => {
  const deal = M.deals.pool.find((d) => d.id === 'gedou');
  assert.ok(deal.weight > 0);
  assert.equal(deal.room, 'xinmo');
  assert.equal(M.kinds.xinmo.play, 'board');
  assert.equal(deal.task, 'mijing-xinmo');
  assert.deepEqual(deal.lv, M.tiers.map(() => 'xinmo'), 'level xinmo in all nine 重');
  const tk = content.tasks.tasks.find((t) => t.id === 'mijing-xinmo');
  assert.deepEqual([tk.kind, tk.game, tk.mijing, tk.period], ['board', 'fighter', true, 'day']);
  assert.equal(L.id, 'xinmo');
  // somewhere in a few maps a 心魔 room comes up
  const seen = M.tiers.flatMap((t) => Array.from({ length: 12 }, (_, i) => mapOf(content, t, `xm-${i}`).layers.flat())).flat();
  assert.ok(seen.some((r) => r.kind === 'xinmo'), 'a 心魔 room in the draw');
});

test('the mirror: 小满\'s own sheet washed dark, his clips for every move she makes, his moves turned on him', () => {
  const look_ = L.foe.look;
  assert.equal(look_.sheet, L.me.look.sheet, 'his own frames');
  assert.equal(look_.tint.length, 4);
  const sheet = JSON.parse(fs.readFileSync(new URL(`../worlds/jiuding/${look_.sheet}.json`, import.meta.url), 'utf8'));
  for (const k of ['poke', 'thrust', 'ice', 'jianqi', 'feijian', 'edge', 'glow', 'hold', 'strike', 'slip', 'block']) assert.ok(sheet.clips[look_.clips[k] ?? k], `${k} → a clip he has`);
  const R = L.foe.rules;
  assert.equal(R.moves.ice.kind, 'palmfire', 'his 掌心火 for her ice');
  assert.equal(R.moves.jianqi.wave, true, 'his 绝\'s fire for her 剑气');
  assert.ok(R.ai.feijian > 0, 'his 飞剑');
  assert.deepEqual([R.ai.edge, R.ai.palmOn], [false, false], 'none of 秦雁\'s tricks');
  assert.equal(L.stage.win, 'yield');
});

test('the shadow casts what he casts: the 掌心火 flies, the 飞剑 comes down, the 绝 runs along the boards', () => {
  let s = F.newGame('mirror', 1, { levels: [L] });
  const kinds = new Set();
  // he stands off at range and never falls (a dummy): the shadow's ranged moves come
  for (let t = 0; t < 90000 && s.live; t += 10) {
    s = F.tick(s, 10);
    for (const x of s.shots) if (x.who === 'foe') kinds.add(x.kind);
    s.me.hp = 100; s.me.down = 0;
    if (s.foe.qi < 100) s.foe.qi += 0.2;
    if (Math.abs(s.foe.x - s.me.x) < 200 && !s.foe.act) s.me.x = s.foe.x > 550 ? s.foe.x - 360 : s.foe.x + 360;
  }
  for (const k of ['palmfire', 'feijian', 'wave']) assert.ok(kinds.has(k), k);
});

test('the bout: a human-like hand wins within three tries, a slower hand too; a masher, a wall of blocks and an idle hand go down', () => {
  const d = { levels: [L] };
  assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000 }).won, 'a human-like hand');
  assert.ok(playModule(F, bot, { tries: 3, deal: d, limit: 180000, reaction: 320 }).won, 'a 320 ms hand');
  const mash = (x) => (x.end ? null : { g: (x.t / 150 | 0) % 2 ? 'light' : 'heavy' });
  const wall = (x) => (x.in.block ? null : { g: 'block', on: true });
  for (const [name, b] of [['mash', mash], ['wall', wall], ['idle', () => null]]) assert.ok(!playModule(F, b, { tries: 3, deal: d, limit: 180000 }).won, `${name} won`);
});

test('a 心魔 room in a run hosts the bout: Look deals the level, a win hands in by its stars', () => {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  let s;
  try { s = playTo(content, newState(content, 'zh', NOW), 'wm-yaban', { now: NOW }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  s.place = 'shimen'; s.bag[M.key] = 2;
  s = call('mijing', s, { action: 'enter', tier: 1, seed: 'xinmo' }).state;
  s.mijing.run.at = '1a'; s.mijing.run.room = { id: '1a', kind: 'yao', phase: 'done' };
  const r2 = s.mijing.run.map.layers[1][0];
  r2.kind = 'xinmo';
  s.mijing.run.map.ways['1a'] = [r2.id];
  s = call('mijing', s, { action: 'go', room: r2.id }).state;
  assert.equal(s.mijing.run.room.board.task, 'mijing-xinmo');
  const t = look(s, content, ctx()).tasks.find((x) => x.id === 'mijing-xinmo');
  assert.ok(t?.deal, 'offered with its deal');
  assert.equal(t.deal.levels?.[0]?.id ?? t.deal.lv, 'xinmo');
  assert.equal(F.pickLevel(content.games, t.deal).id, 'xinmo', 'the mount finds it by the deal');
  const w = win(s, content, ctx(), { id: 'mijing-xinmo', stars: 3 });
  const done = task(w.state, content, ctx(), { action: 'done', id: 'mijing-xinmo' });
  assert.ok(done.result.ok, JSON.stringify(done.result));
  assert.equal(done.state.mijing.run.room.phase === 'done' || done.state.mijing.run.room.phase === 'reward', true);
});
