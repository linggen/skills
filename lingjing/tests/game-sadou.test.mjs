// 撒豆成兵 (the crowd run) — the level file is sound (卷一 beasts only, the 合窳 boss at the end, a 60–90 s run, words in
// both languages), the engine's arithmetic holds (gates, beans, hazards, the clash, the boss's slam), the balance holds
// (a bot taking the good gates wins, one taking the bad gates loses, one that never steers loses), and what Phaser draws
// exists: the bundle is current, Phaser is the one shared vendored build, every picture it asks for is there, the
// font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, humanBot, applyOp, crowdHalf, hordeCount, hordeLeft, newGame, overlap, sim, stars, steer, step } from '../scripts/games/sadou/core.js';
import { levelAsked, meta } from '../scripts/games/sadou.js';
import { sourceHash } from '../tools/sadou/hash.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = JSON.parse(readFileSync(at('worlds/jiuding/levels/sadou.json'), 'utf8'));
const level = kit.levels[0];
const reg = JSON.parse(readFileSync(at('worlds/jiuding/games.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const both = (o) => Boolean(o?.zh && o?.en);

test('registered: meta, the 游戏厅 row (塔防, featured), the level asked for', () => {
  assert.equal(meta.id, 'sadou');
  assert.ok(both(meta.name) && both(meta.how));
  const row = reg.games.find((g) => g.id === 'sadou');
  assert.ok(row, 'games.json row');
  assert.equal(row.mechanic, '塔防');
  assert.ok(reg.groups.some((g) => g.id === row.group));
  assert.equal(levelAsked(kit, {}, '?dev=1&game=sadou'), level);
  assert.equal(levelAsked(kit, { lv: 'shandao' }, ''), level);
  assert.equal(levelAsked(kit, {}, '?lv=1'), level);
  assert.equal(levelAsked(kit, {}, '?lv=99'), level, 'an unknown level falls back to the first');
});

test('the level is data: kit, title, a lead-in that ends on 撒豆成兵, a countdown, stars, moments in both languages', () => {
  assert.equal(level.kit, 'sadou');
  assert.ok(level.story === null && both(level.title));
  assert.ok(level.lead.length >= 2 && level.lead.every(both));
  assert.ok(level.lead.at(-1).big && level.lead.at(-1).zh.includes('撒豆成兵'));
  assert.ok(level.leadSec >= 3 && level.countdown >= 1, 'it starts by itself after the lead-in — no start tap');
  assert.ok(level.stars[0] > level.stars[1] && level.stars[1] > 0);
  for (const [k, lines] of Object.entries(level.moments)) if (!k.startsWith('_')) assert.ok(lines.length && lines.every(both), k);
  const sec = level.boss.at / level.speed;
  assert.ok(sec >= 55 && sec <= 85, `the run to the boss takes ${sec.toFixed(0)} s`);
  const ats = level.track.map((t) => t.at);
  assert.deepEqual(ats, [...ats].sort((a, b) => a - b), 'the track is in road order');
  assert.ok(ats.at(-1) < level.boss.at);
  for (const it of level.track) {
    assert.ok(['gates', 'beans', 'hazard', 'horde'].includes(it.type), it.type);
    if (it.type === 'gates') {
      assert.equal(it.gates.length, 2);
      for (const g of it.gates.filter(Boolean)) assert.ok(['+', '-', 'x', '/'].includes(g.op) && g.n > 0);
    }
  }
  const kinds = new Set(level.track.filter((t) => t.type === 'gates').flatMap((t) => t.gates.filter(Boolean).map((g) => g.op)));
  assert.deepEqual([...kinds].sort(), ['+', '-', '/', 'x'], 'every kind of gate, the traps too');
});

test('卷一 beasts only (野猪 狰 犰狳 鬿雀, the 合窳 boss), each one a creature of the world, no 夔牛', () => {
  const ids = new Set(creatures.map((c) => c.id));
  const juan = Object.fromEntries(creatures.map((c) => [c.id, c.juan]));
  const used = new Set(level.track.filter((t) => t.type === 'horde').flatMap((t) => t.beasts.map(([b]) => b)));
  used.add(level.boss.beast);
  for (const b of used) {
    assert.ok(kit.beasts[b], `${b}: stats`);
    assert.ok(ids.has(b), `${b}: in creatures.json`);
    assert.ok(!juan[b] || juan[b] === 1, `${b}: not from a later 卷`);
  }
  assert.deepEqual([...used].sort(), ['heyu', 'qique', 'qiuyu', 'yezhu', 'zheng']);
  assert.equal(level.boss.beast, 'heyu');
});

test('the arithmetic: gates, overlap, the horde, stars', () => {
  assert.equal(applyOp(10, { op: '+', n: 5 }), 15);
  assert.equal(applyOp(10, { op: 'x', n: 3 }), 30);
  assert.equal(applyOp(10, { op: '-', n: 15 }), 0, 'never below zero');
  assert.equal(applyOp(11, { op: '/', n: 2 }), 5);
  assert.ok(Math.abs(overlap(0.5, 0.2, 0, 1) - 1) < 1e-9);
  assert.equal(overlap(-0.5, 0.2, 0, 1), 0);
  assert.ok(Math.abs(overlap(0, 0.2, 0, 1) - 0.5) < 1e-9);
  assert.ok(crowdHalf(300) > crowdHalf(10) && crowdHalf(5000) <= 0.9);
  const h = { units: [{ b: 'yezhu', n: 4, p: 2 }, { b: 'qique', n: 3, p: 1 }], hp: 11 };
  assert.equal(hordeCount(h), 7);
  h.hp = 8;
  assert.deepEqual(hordeLeft(h), [{ b: 'yezhu', n: 4 }, { b: 'qique', n: 0 }], 'the last kind listed (the front rank) falls first');
  assert.equal(stars(level, level.stars[0]), 3);
  assert.equal(stars(level, level.stars[1]), 2);
  assert.equal(stars(level, 1), 1);
});

test('a gate is taken by the side the crowd runs on, once', () => {
  const g = newGame(kit, level);
  const first = level.track.find((t) => t.type === 'gates');
  steer(g, -0.6);
  while (g.dist < first.at + 50) step(g, 1 / 30);
  const ev = g.events.filter((e) => e.t === 'gate');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].side, 0);
  assert.equal(g.count, applyOp(level.start, first.gates[0]));
});

test('the clash stops the run and trades soldiers for beasts; the boss slams the side it warned', () => {
  const g = newGame(kit, level);
  const hd = level.track.find((t) => t.type === 'horde');
  g.items.forEach((it) => { if (it.at < hd.at) it.done = true; });
  g.count = 200;
  while (g.phase === 'run' && g.dist < hd.at + 10) { steer(g, 0); step(g, 1 / 30); }
  assert.equal(g.phase, 'clash');
  const d = g.dist, power = hd.beasts.reduce((s, [b, n]) => s + kit.beasts[b].power * n, 0);
  for (let i = 0; i < 300 && g.phase === 'clash'; i += 1) step(g, 1 / 30);
  assert.equal(g.phase, 'run');
  assert.ok(Math.abs(g.dist - d) < 10, 'the crowd held still while fighting');
  assert.ok(Math.abs(200 - g.count - power) <= 2, `lost ${200 - g.count} for ${power} beast-power`);
  // the boss: stand in the warned half and lose soldiers; stand out of it and lose none
  const killed = {};
  for (const dodge of [false, true]) {
    const b = newGame(kit, level);
    b.dist = level.boss.at - 1;
    b.count = 400;
    b.boss.hp = 1e6;                  // a boss that outlasts the slam, so the slam is what's measured
    b.items.forEach((it) => { it.done = true; });
    let warn = null, slam = null;
    while (!slam && b.t < 30 && b.phase === 'boss' || b.phase === 'run' && b.t < 1) {
      step(b, 1 / 30);
      for (const e of b.events) { if (e.t === 'slam_warn') warn = e; if (e.t === 'slam') slam = e; }
      b.events.length = 0;
      if (warn) steer(b, (warn.side === 0) === dodge ? 0.6 : -0.6);
    }
    assert.ok(slam, 'it slams');
    killed[dodge] = slam.killed;
  }
  assert.ok(killed.false > 20, `${killed.false} lost standing under the slam`);
  assert.ok(killed.true * 3 < killed.false, `stepping out saves most (${killed.true} vs ${killed.false}); a big crowd can't clear it all`);
});

test('balance: good gates win ★★★, bad gates lose, never steering loses, careless wins with fewer stars', () => {
  const good = sim(kit, level, BOTS.good);
  assert.ok(good.won, JSON.stringify(good));
  assert.equal(good.stars, 3);
  assert.ok(good.sec >= 60 && good.sec <= 95, `${good.sec.toFixed(0)} s`);
  assert.ok(good.peak >= 250, `the crowd snowballs: peak ${good.peak}`);
  const bad = sim(kit, level, BOTS.bad);
  assert.ok(!bad.won && bad.left === 0, JSON.stringify(bad));
  const idle = sim(kit, level, BOTS.idle);
  assert.ok(!idle.won, JSON.stringify(idle));
  // good gates but careless (walks into every hazard, stands under the slam): a win, with fewer stars
  const careless = sim(kit, level, BOTS.careless);
  assert.ok(careless.won && careless.stars < 3, JSON.stringify(careless));
});

test('a first-time human wins: ~400 ms reactions, a wrong gate one time in five, half the dodges', () => {
  // the lesson from 守墙关 (10-20): a level tuned by perfect bots was too hard for Hanli's first play
  const seeds = Array.from({ length: 40 }, (_, i) => `h${i}`);
  const human = seeds.map((s) => sim(kit, level, humanBot(s), { seed: s }));
  const wins = human.filter((r) => r.won).length;
  assert.ok(wins >= 32, `a first-timer wins ${wins}/40`);
  assert.ok(human.some((r) => r.won && r.stars === 3) && human.some((r) => r.won && r.stars < 3), 'stars spread');
  const sloppy = seeds.map((s) => sim(kit, level, humanBot(s, { react: 0.6, wrong: 0.35, dodge: 0.4, slam: 0.25 }), { seed: s }));
  const sw = sloppy.filter((r) => r.won).length;
  assert.ok(sw >= 10 && sw < wins, `a sloppy player wins ${sw}/40 — playing better pays`);
});

test('the bundle is current, loads the one shared Phaser, and every picture and word it needs is there', () => {
  const src = JSON.parse(readFileSync(at('scripts/games/sadou/source.json'), 'utf8')).source;
  assert.equal(src, sourceHash(new URL('../tools/sadou/', import.meta.url).pathname), 'rebuild: cd tools/sadou && npm run build');
  const bundle = readFileSync(at('scripts/games/sadou/sadou.min.mjs'), 'utf8');
  assert.match(bundle, /from\s*"\.\.\/\.\.\/vendor\/phaser\.min\.mjs"/);
  assert.match(bundle, /from\s*"\.\/core\.js"/);
  assert.ok(!/Phaser v3\.\d+/.test(bundle) && bundle.length < 200_000, 'Phaser is not bundled in');
  assert.ok(existsSync(at('scripts/vendor/phaser.min.mjs')), 'the shared Phaser');
  for (const f of ['units.webp', 'units.json', 'gate-good.webp', 'gate-bad.webp', 'tex-road.webp', 'tex-side.webp', 'edge.webp']) {
    assert.ok(existsSync(at(`scripts/games/sadou/art/${f}`)), f);
  }
  const atlas = JSON.parse(readFileSync(at('scripts/games/sadou/art/units.json'), 'utf8'));
  for (const f of ['soldier-1', 'soldier-2', 'bean', 'pine', 'rock', 'lantern', 'log', 'spikes']) assert.ok(atlas.frames[f], `atlas frame ${f}`);
  for (const [b, k] of Object.entries(kit.beasts)) {
    if (b.startsWith('_')) continue;
    for (const f of [...k.frames, k.hit]) assert.ok(existsSync(at(`scripts/games/shouqiang/art/${b}-${f}.webp`)), `${b}-${f} (守墙关's, shared)`);
  }
  assert.ok(existsSync(at('scripts/games/shouqiang/art/xiaoman-cast.webp')));
  const chars = readFileSync(at('scripts/games/sadou/font/chars.txt'), 'utf8');
  const words = JSON.stringify([level.title, level.lead, level.moments, meta]);
  for (const ch of words.match(/[　-鿿＀-￯]/g)) assert.ok(chars.includes(ch), `font lacks ${ch}`);
  assert.ok(existsSync(at('scripts/games/sadou/font/OFL.txt')));
});
