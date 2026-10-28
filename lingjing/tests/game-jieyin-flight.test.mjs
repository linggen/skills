// 结印 seen in flight (Hanli 10-28: 「剑诀可以出来一把飞剑, 飞一圈打中怪物. 显示伤害. 给玩家成就感」): the shared look
// (jieyin/flight.js — a pure path), and a kit's cast that flies before it lands: nothing hurt in the air, then the harm falls
// and the number shown is the harm done. The sims and the tests (no `show`) land a cast at once, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lookOf, lookArts, loopAt, arcAt, fanAt } from '../scripts/games/jieyin/flight.js';
import { jieyinCast, newGame, spawnAt, step, levelsFrom } from '../scripts/games/shoulu/core.js';
import * as sd from '../scripts/games/sadoushou/core.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const kit = read('../worlds/jiuding/levels/jieyin.json');

test('the looks: 剑诀 a loop, 冰 a fan of shards, 火 an arc — each picture is in the kit\'s art, each flight a second at most', () => {
  assert.equal(lookOf('feijian').kind, 'loop');
  assert.equal(lookOf('bingzhui').kind, 'volley');
  assert.equal(lookOf('huodan').kind, 'arc');
  assert.equal(lookOf('dianxue'), null);
  for (const a of lookArts()) assert.ok(fs.existsSync(new URL(`../scripts/games/jieyin/art/${a}.webp`, import.meta.url)), a);
  for (const id of ['feijian', 'jinren', 'bingzhui', 'huodan', 'huodan4']) assert.ok(lookOf(id).fly >= 0.6 && lookOf(id).fly <= 1, id);
});

test('the sword\'s loop: out of 小满\'s hand, up and over the field, down onto the beast; one wide sweep, never off the board', () => {
  const box = { w: 540, h: 960 }, a = { x: 310, y: 740 }, b = { x: 150, y: 250 };
  const s = loopAt(a, b, 0, box), e = loopAt(a, b, 1, box);
  assert.ok(Math.hypot(s.x - a.x, s.y - a.y) < 1, 'it leaves the hand');
  assert.ok(Math.hypot(e.x - b.x, e.y - b.y) < 1, 'it lands on the beast');
  let top = Infinity, minX = Infinity, maxX = -Infinity, len = 0, prev = s;
  for (let k = 0; k <= 1.0001; k += 0.01) {
    const p = loopAt(a, b, k, box);
    top = Math.min(top, p.y); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); len += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p;
    assert.ok(p.x >= 0 && p.x <= box.w && p.y >= 0 && p.y <= box.h, `on the board at ${k}`);
  }
  assert.ok(top < Math.min(a.y, b.y) - 40, 'it rises above both');
  assert.ok(maxX - minX > 0.35 * box.w, 'a wide sweep');
  assert.ok(len > 2 * Math.hypot(a.x - b.x, a.y - b.y), 'a long way round, not the straight line');
  const dive = loopAt(a, b, 0.97, box);
  assert.ok(Math.sin(dive.rot) > 0.5, 'the dive heads down');
  assert.deepEqual(loopAt(a, b, 0.4, box), loopAt(a, b, 0.4, box), 'pure');
});

test('the arc and the fan end on the beast', () => {
  const a = { x: 300, y: 700 }, b = { x: 200, y: 200 };
  assert.ok(Math.hypot(arcAt(a, b, 1).x - b.x, arcAt(a, b, 1).y - b.y) < 1e-6);
  for (let i = 0; i < 3; i += 1) { const p = fanAt(a, b, 1, i, 3); assert.ok(Math.hypot(p.x - b.x, p.y - b.y) < 1e-6); }
  assert.ok(Math.abs(fanAt(a, b, 0.5, 0, 3).x - fanAt(a, b, 0.5, 2, 3).x) > 30, 'fanned apart in the middle');
});

const reg = read('../worlds/jiuding/games.json'), host = kit.hosts.shoulu, levels = levelsFrom(reg.games.find((g) => g.id === 'shoulu' && g.levels));
const cfg = { ...host, ...(host.paces?.intense ?? {}), when: 'always' };

test('守炉: a cast shown flies first — nothing hurt in the air — then lands, and the number is the harm done', () => {
  const g = newGame(levels.find((l) => l.id === 'heisong'), { seed: 's', show: true });
  const b = spawnAt(g, 'yezhu', 300), hp = b.hp;
  assert.equal(jieyinCast(g, 'feijian', cfg), true);
  const fx = g.fx.find((f) => f.k === 'jy');
  assert.equal(fx.id, 'feijian');
  assert.ok(fx.fly >= 0.8 && fx.fly <= 1);
  assert.equal(b.hp, hp, 'in the air: nothing hurt yet');
  assert.ok(!g.fx.some((f) => f.k === 'txt' && /^-/.test(f.s)), 'no number yet');
  for (let t = 0; t < fx.fly - 0.05; t += 1 / 60) step(g, 1 / 60);
  assert.equal(b.hp, hp, 'still flying');
  for (let t = 0; t < 0.2; t += 1 / 60) step(g, 1 / 60);
  assert.ok(b.hp < hp, 'landed');
  const n = g.fx.filter((f) => f.k === 'txt' && /^-\d+$/.test(f.s));
  assert.equal(n.length, 1);
  assert.equal(Number(n[0].s.slice(1)), Math.round(hp - b.hp), 'the number is what it did');
  assert.ok(g.slowT > 0 && g.shake > 0, 'the slow beat and the shake at the landing');
});

test('守炉: the page\'s reduced motion — a short wait, no shake, no slow beat; and with no `show` a cast lands at once', () => {
  const g = newGame(levels.find((l) => l.id === 'heisong'), { seed: 's', show: true, calm: true });
  const b = spawnAt(g, 'yezhu', 300), hp = b.hp;
  jieyinCast(g, 'feijian', cfg);
  for (let t = 0; t < 0.4; t += 1 / 60) step(g, 1 / 60);
  assert.ok(b.hp < hp);
  assert.ok(!(g.slowT > 0) && g.shake === 0);
  const h = newGame(levels.find((l) => l.id === 'heisong'), { seed: 's', headless: true });
  const c = spawnAt(h, 'yezhu', 300), chp = c.hp;
  jieyinCast(h, 'feijian', cfg);
  assert.ok(c.hp < chp, 'the sim: at once');
});

test('守山门: a cast shown lands after its flight, the event carrying how long it flies; with no `show`, at once', () => {
  const ladder = kit && read('../worlds/jiuding/levels/sadoushou.json'), level = ladder.levels[0];
  const mk = (opt) => {
    const g = sd.newGame(ladder, { ...level, waves: [], belt: { ...level.belt, lines: [] } }, { seed: 'jy', ...opt });
    step2(g, 90);
    return g;
  };
  function step2(g, n) { for (let i = 0; i < n; i += 1) { sd.aim(g, sd.colMid('L')); sd.step(g, 1 / 30); } }
  const now = mk({}), later = mk({ show: true });
  const hp0 = now.boss.hp, hp1 = later.boss.hp;
  for (const g of [now, later]) g.events.length = 0;
  assert.ok(sd.castJieyin(now, 'feijian', 'middle') && sd.castJieyin(later, 'feijian', 'middle'));
  assert.ok(now.boss.hp < hp0, 'no show: at once');
  assert.equal(later.boss.hp, hp1, 'show: in the air');
  const e = later.events.find((x) => x.t === 'spell');
  assert.ok(e.fly >= 0.8 && e.dmg > 0);
  const hpAfter = now.boss.hp;
  step2(later, Math.ceil(e.fly * 30) + 2);
  assert.ok(later.boss.hp < hp1, 'landed');
  assert.ok(Math.abs((hp1 - later.boss.hp) - e.dmg) < 1.01, 'what it took is the number shown');
  assert.ok(hpAfter < hp0);
});
