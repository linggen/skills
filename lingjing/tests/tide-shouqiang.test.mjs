// 守墙关's 兽潮 nights (games/shouqiang/tide.js): bot-proven, distinct, beasts of his 回 only, a small 大妖 on a boss night
// that lights 结印 and is never needed (the human-like hand wins without a cast). The full sweep: tools/tide-prove.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOTS, jieyinState, newGame, pick, sim, step, withRoots } from '../scripts/games/shouqiang/core.js';
import { tide } from '../scripts/games/shouqiang/tide.js';
import { levelDealt } from '../scripts/games/shouqiang.js';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = withRoots(JSON.parse(readFileSync(at('worlds/jiuding/levels/shouqiang.json'), 'utf8')), JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures);
const SETS = { h05: ['yezhu', 'zheng'], h07: ['yezhu', 'zheng', 'qiuyu', 'heyu'], h09: ['yezhu', 'zheng', 'qiuyu', 'heyu', 'qique'] };
const ask = (seed, tier, boss, set) => tide.night(kit, { seed, tier, boss, open: (k) => SETS[set].includes(k) });
const levelOf = (n) => levelDealt(kit, n.deal, '');

test('one ask, one night; 300 seeds, 300 layouts; only his 回\'s beasts; the deal is laid on a row the phone ships', () => {
  assert.deepEqual(ask('a', 0.5, true, 'h07'), ask('a', 0.5, true, 'h07'));
  const sigs = new Set(Array.from({ length: 300 }, (_, i) => ask(`s${i}`, (i % 5) / 4, i % 3 === 0, 'h09').sig));
  assert.equal(sigs.size, 300);
  for (const set of Object.keys(SETS)) for (let i = 0; i < 40; i += 1) {
    const n = ask(`k${i}`, i / 40, true, set);
    assert.ok(n.kinds.every((k) => SETS[set].includes(k)), `${set}: ${n.kinds}`);
    assert.equal(n.boss, set !== 'h05', `${set}: a 大妖 only where one is open`);
    assert.ok(kit.levels.some((l) => l.id === n.deal.lv) && n.deal.tide);
  }
  // A plain night has none; the places come round.
  assert.equal(ask('p', 1, false, 'h09').boss, false);
  const places = new Set(Array.from({ length: 30 }, (_, i) => ask(`q${i}`, 0, false, 'h05').deal.over.place));
  assert.ok(places.size >= 3, [...places].join());
});

test('every sampled night is won by the human-like hand without 结印 (each on most seeds); nothing done loses', () => {
  const rows = [];
  for (const set of Object.keys(SETS)) for (const tier of [0, 0.5, 1]) for (const boss of [false, true]) for (const seed of ['t0', 't1']) {
    const n = ask(`${seed}|${set}|${tier}`, tier, boss, set), lv = levelOf(n);
    const won = ['x0', 'x1', 'x2', 'x3'].filter((x) => sim(kit, lv, BOTS.human, { seed: x }).won).length;
    rows.push({ set, tier, boss, won });
    assert.ok(won >= 2, `${set} tier ${tier}${boss ? ' 大妖' : ''}: the human hand won ${won}/4`);
  }
  const rate = rows.reduce((a, r) => a + r.won, 0) / (rows.length * 4);
  assert.ok(rate >= 0.8, `human ${Math.round(rate * 100)}%`);
  const lazy = levelOf(ask('lz', 0, false, 'h05'));
  assert.ok(['x0', 'x1'].every((x) => !sim(kit, lazy, BOTS.lazy, { seed: x }).won), 'the heroes alone never hold it');
});

test('a 大妖 night: the 大妖 comes in the last wave, small, and 结印 is lit while it is up', () => {
  const n = ask('boss', 0, true, 'h07'), lv = levelOf(n);
  assert.ok(lv.waves.at(-1).some((g) => kit.beasts[g[0]].boss));
  assert.ok(lv.bossHp > 0 && lv.bossHp < 0.5);
  const g = newGame(kit, lv, { seed: 'b' });
  let lit = false;
  for (let t = 0; t < 900 && !['won', 'lost'].includes(g.phase); t += 0.1) {
    if (g.phase === 'pick') pick(g, BOTS.greedy(g));
    step(g, 0.1);
    if (g.beasts.some((b) => b.boss && b.hp > 0)) { lit = jieyinState(g).on; break; }
  }
  assert.ok(lit, '结印 offered while the 大妖 is on the field');
});
