// 撒豆成兵 · 守山门 (the DEFENCE crowd game, test-only beside 撒豆成兵) — registered as a second game in the 游戏厅 (main,
// 塔防, tall) and nowhere in the story; the level file is sound (four levels, each a 回's beasts, the lanes a safe +1
// wall · a 符门 middle · a rich +99 lane, waves with a count in the hundreds, a 大妖 that charges); the engine's
// arithmetic holds (gates and traps per 豆兵, the cool of a big gate, the grind, the breach, the charge's line); the
// balance holds on every level (a player aiming where the stream multiplies wins, one aiming into the traps loses, one
// who never moves loses, a first-time human wins most runs and fewer up the ladder); the bundle is current, Phaser is the
// one shared build, every picture it asks for is there, the font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, humanBot, faceOf, waveLeft, waveCount, newGame, aim, step, sim, stars, laneValue, TOP } from '../scripts/games/sadoushou/core.js';
import { levelAsked, meta } from '../scripts/games/sadoushou.js';
import { sourceHash } from '../tools/sadoushou/hash.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = JSON.parse(readFileSync(at('worlds/jiuding/levels/sadoushou.json'), 'utf8'));
const level = kit.levels[0];
const reg = JSON.parse(readFileSync(at('worlds/jiuding/games.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const both = (o) => Boolean(o?.zh && o?.en);
const run = (g, sec, x = 0, hold = true) => { for (let t = 0; t < sec; t += 1 / 30) { aim(g, x, hold); step(g, 1 / 30); } return g; };

test('registered beside 撒豆成兵 (main, 塔防, tall), test-only: no story scene, no task, not dealt in the 秘境', () => {
  assert.equal(meta.id, 'sadoushou');
  assert.ok(both(meta.name) && both(meta.how) && meta.tall && meta.pause);
  const row = reg.games.find((g) => g.id === 'sadoushou');
  assert.ok(row && row.group === 'main' && row.mechanic === '塔防');
  assert.ok(!row.scene && !row.task && !row.hui, 'not in the story');
  assert.ok(reg.games.find((g) => g.id === 'sadou'), 'the attack run stays');
  assert.ok(reg.games.indexOf(row) === reg.games.findIndex((g) => g.id === 'sadou') + 1, 'tiled right after it, to compare');
  for (const f of ['worlds/jiuding/qiyu.json', 'worlds/jiuding/tasks/world.json']) assert.doesNotMatch(readFileSync(at(f), 'utf8'), /sadoushou/, `${f}: not dealt in the story or the 秘境`);
  assert.equal(levelAsked(kit, {}, '?dev=1&game=sadoushou'), level);
  kit.levels.forEach((l, i) => {
    assert.equal(levelAsked(kit, { lv: l.id }, ''), l);
    assert.equal(levelAsked(kit, {}, `?lv=${i + 1}`), l);
  });
  assert.equal(levelAsked(kit, {}, '?lv=99'), level);
  assert.match(readFileSync(at('scripts/games/sadoushou.js'), 'utf8'), /next: nx\.id/, '下一关');
  assert.match(readFileSync(at('scripts/games/sadoushou.js'), 'utf8'), /shell\.lead\(said, \{ auto: 'read', lang/, 'the lead card at the story\'s pace');
});

test('a ladder of four, each a 回 later and each beast one the book has shown by its 回 (creatures.json `hui`)', () => {
  assert.equal(kit.levels.length, 4);
  assert.equal(new Set(kit.levels.map((l) => l.id)).size, 4);
  const order = (h) => ({ h01: 1, h02: 2, h03: 3, h04: 4, h05: 5, h06: 6, h11: 7, h07: 7, h09: 8 })[h];
  const hui = Object.fromEntries(creatures.map((c) => [c.id, c.hui]));
  for (let i = 1; i < kit.levels.length; i += 1) assert.ok(order(kit.levels[i].hui) >= order(kit.levels[i - 1].hui));
  for (const l of kit.levels) {
    const used = new Set([...l.waves.flatMap((w) => w.beasts.map(([b]) => b)), l.boss.beast]);
    for (const b of used) {
      assert.ok(kit.beasts[b], `${l.id}: ${b} stats`);
      assert.ok(hui[b], `${b}: a creature of the world`);
      assert.ok(order(hui[b]) <= order(l.hui), `${l.id} (${l.hui}) sends ${b}, met in ${hui[b]}`);
    }
  }
  assert.deepEqual(kit.levels.map((l) => l.boss.beast), ['longzhi', 'longzhi', 'heyu', 'heyu']);
  for (const b of ['heyu', 'longzhi']) assert.ok(both(kit.beasts[b].name));
});

for (const lv of kit.levels) test(`${lv.id}: the level is data — words in both languages, lanes, waves in the hundreds, a charging 大妖`, () => {
  assert.equal(lv.kit, 'sadoushou');
  assert.ok(lv.story === null && both(lv.title));
  assert.ok(lv.lead.length >= 2 && lv.lead.every(both) && lv.lead.at(-1).big && lv.lead.slice(0, -1).every((l) => !l.big));
  assert.ok(lv.leadSec >= 3 && lv.countdown >= 1, 'it starts by itself after the lead-in');
  for (const [k, lines] of Object.entries(lv.moments)) if (!k.startsWith('_')) assert.ok(lines.length && lines.every(both), k);
  assert.ok(lv.stars[0] > lv.stars[1] && lv.stars[1] > 0 && lv.par > 0 && lv.wall > 0);
  assert.ok(lv.beans.rate > 0 && lv.beans.speed > 0 && lv.cap >= 300);
  for (const r of lv.gates) {
    assert.ok(r.z > 0 && r.z < TOP);
    for (const c of r.cells) {
      assert.ok(c.x[0] < c.x[1] && c.x[0] >= -1 && c.x[1] <= 1);
      for (const f of [c, c.alt].filter(Boolean)) assert.ok(['+', '-', 'x', '/'].includes(f.op) && f.n > 0);
      if (c.alt) assert.ok(c.flip >= 2, 'a 符门 slow enough to read');
    }
  }
  // the three lanes: a wall of small +1s on the left, the middle's decision gate, a rich +99 (with a cool) on the right
  const cells = lv.gates.flatMap((r) => r.cells.map((c) => ({ ...c, z: r.z })));
  assert.ok(cells.filter((c) => c.x[1] < -0.3 && c.op === '+' && c.n <= 2).length >= 4, 'the safe lane is walled with small gates');
  assert.ok(cells.some((c) => c.x[0] > 0.3 && c.op === '+' && c.n >= 99 && c.cool > 0), 'the rich lane');
  assert.ok(cells.some((c) => c.x[0] >= -0.34 && c.x[1] <= 0.34 && c.op === 'x'), 'the middle multiplies');
  const total = lv.waves.reduce((s, w) => s + w.beasts.reduce((a, [, n]) => a + n, 0), 0);
  assert.ok(total >= 500 && total <= 2500, `the 兽潮 counts ${total}`);
  assert.ok(lv.waves.every((w) => w.speed > 0 && w.span[0] < w.span[1]));
  const c = lv.boss.charge;
  assert.ok(lv.boss.hp > 0 && c.every > c.warn && c.warn >= 1.2 && c.half > 0 && c.half <= 0.3 && c.kill > 0, 'a charge shown long enough to dodge, a line narrow enough to dodge');
});

test('the ladder brings one new thing a level: a 符门, then a trap and a wave down the rich lane, then the fast flyers', () => {
  const hasFu = (l) => l.gates.some((r) => r.cells.some((c) => c.alt));
  const hasTrap = (l) => l.gates.some((r) => r.cells.some((c) => c.op === '-' || c.op === '/'));
  const richLaneWave = (l) => l.waves.some((w) => w.span[0] >= 0);
  assert.deepEqual(kit.levels.map(hasFu), [false, true, true, true]);
  assert.deepEqual(kit.levels.map(hasTrap), [false, false, true, true]);
  assert.equal(kit.levels.findIndex(richLaneWave), 2, 'a wave down the rich lane alone from the third level');
  assert.ok(kit.levels.at(-1).waves.some((w) => w.beasts.some(([b]) => kit.beasts[b].fly)));
});

test('the arithmetic: gates per 豆兵, a trap, a big gate\'s cool, a 符门\'s faces, the stars', () => {
  // one bean through the left lane's three rows of +1: 1 → 8
  const lv = { ...level, waves: [{ t: 999, beasts: [['yezhu', 1]], span: [-1, 1], speed: 1 }] };
  const g = newGame(kit, lv, { seed: 't' });
  aim(g, -0.82, true); step(g, 1 / 4); aim(g, -0.82, false);
  assert.equal(g.count, 1);
  run(g, 1.8, -0.82, false);
  assert.equal(g.count, 8, 'three rows of +1 make one into eight');
  // a trap: every one through a − gate is lost
  const tl = kit.levels.find((l) => l.gates.some((r) => r.cells.some((c) => c.op === '-')));
  const trap = tl.gates.flatMap((r) => r.cells.map((c) => ({ ...c, z: r.z }))).find((c) => c.op === '-');
  const t = newGame(kit, { ...tl, gates: [{ z: trap.z, cells: [trap] }], waves: lv.waves }, { seed: 't' });
  run(t, 2, (trap.x[0] + trap.x[1]) / 2, true); aim(t, 0, false); run(t, 3, 0, false);
  assert.equal(t.count, 0);
  assert.ok(t.stats.trapped > 0);
  // a big gate gives its +99 once, then needs its cool
  const big = { z: 30, cells: [{ x: [0.38, 0.98], op: '+', n: 99, cool: 3 }] };
  const b = newGame(kit, { ...level, gates: [big], waves: lv.waves }, { seed: 't' });
  run(b, 1, 0.68, true); aim(b, 0.68, false); run(b, 2, 0.68, false);
  assert.equal(b.count, level.beans.rate * 1 + 99, 'one +99 a cool, the rest of the stream passes plain');
  // a 符门 swaps its faces on the clock
  const fu = kit.levels[1].gates.flatMap((r) => r.cells).find((c) => c.alt);
  assert.equal(faceOf(fu, 0).op, fu.op);
  assert.equal(faceOf(fu, fu.flip + 0.01).op, fu.alt.op);
  assert.equal(faceOf(fu, 2 * fu.flip + 0.01).op, fu.op);
  // stars: the wall left, and ★★★ only inside par
  assert.equal(stars(level, level.wall, 10), 3);
  assert.equal(stars(level, level.wall, level.par + 1), 2);
  assert.equal(stars(level, level.wall * level.stars[1], 10), 2);
  assert.equal(stars(level, 1, 10), 1);
});

test('the grind: a 豆兵 at a wave\'s front strikes once, its weight; beasts fall by power, the front rank first; the wall takes the rest', () => {
  const w = { units: [{ b: 'zheng', n: 2, p: 3 }, { b: 'yezhu', n: 4, p: 1 }], hp: 10 };
  assert.equal(waveCount(w), 6);
  w.hp = 7;
  assert.deepEqual(waveLeft(w), [{ b: 'zheng', n: 2 }, { b: 'yezhu', n: 1 }], 'the last kind listed (the front rank) falls first');
  // nobody scatters: the first wave walks into the wall and costs it
  const g = run(newGame(kit, level, { seed: 'grind' }), 40, 0, false);
  assert.ok(g.wall.hp < level.wall, 'the wall took the breach');
  // a stream meets the wave and both counts fall
  const s = newGame(kit, level, { seed: 'grind' });
  run(s, 10, -0.82, true);
  assert.ok(s.stats.struck > 50 && s.stats.killed > 50);
  assert.ok(s.live[0].front > 20, 'held off up the road');
});

test('the 大妖 charges down the line it showed: the 豆兵 on it are knocked aside, those off it are not', () => {
  const lose = (stay) => {
    const g = newGame(kit, { ...level, waves: [] }, { seed: 'charge' });
    step(g, 1 / 30); // no waves: the 大妖 steps out
    assert.equal(g.phase, 'boss');
    g.boss.hp = 1e6;
    let warned = null, ended = false, x = 0.68; // up the rich lane: a thick stream on the line
    for (let i = 0; i < 30 * 30 && !ended; i += 1) {
      aim(g, x, true);
      step(g, 1 / 30);
      for (const e of g.events) {
        if (e.t === 'charge_warn') { warned = e; if (!stay) x = e.x > 0 ? e.x - e.half - 0.45 : e.x + e.half + 0.45; }
        if (e.t === 'charge_end') ended = true;
      }
      g.events.length = 0;
    }
    assert.ok(warned && ended, 'warned, then charged');
    assert.ok(warned.sec >= 1.2);
    return g.stats.charged;
  };
  const stood = lose(true), moved = lose(false);
  assert.ok(stood > 10, `standing on the line: ${stood} lost`);
  assert.ok(moved * 2 < stood, `getting off it saves most (${moved} vs ${stood}; the 豆兵 already up the line still go)`);
});

test('the rich lane pays only while the tide is off it: a wave down the right shuts its gates', () => {
  const lv = kit.levels.find((l) => l.waves.some((w) => w.span[0] >= 0));
  const g = newGame(kit, lv, { seed: 'v' });
  const open = laneValue(g, 0.68);
  assert.ok(open > laneValue(g, 0), 'with the road clear the rich lane is worth the most');
  g.live.push({ i: 99, span: [0.1, 1], units: [{ b: 'qiuyu', n: 10, p: 2 }], hp: 20, front: 10, depth: 4, dmgRate: 0, held: 0, n0: 10 });
  assert.ok(laneValue(g, 0.68) < open / 10, 'a wave in front of the gates shuts them');
});

// a first-time human (reacts ~0.45 s late, reconsiders every ~2.5 s, a worse aim one time in four, out of the charge's
// line three times in five) wins at least this many of 40 — fewer as the ladder climbs; the first level forgiving
const HUMAN = { shanmen: 37, songlin: 28, yaoyuan: 28, heisong: 18 };
const SLOPPY = { react: 0.7, wrong: 0.5, dodge: 0.3, look: 4 };
const seeds = Array.from({ length: 40 }, (_, i) => `h${i}`);
const wins = {};

for (const lv of kit.levels) {
  test(`${lv.id}: aiming where it multiplies wins ★★ or better on every seed; into the traps loses; never moving loses`, () => {
    for (const s of ['sim', 'a', 'b']) {
      const good = sim(kit, lv, BOTS.good, { seed: s });
      assert.ok(good.won && good.stars >= 2, `${s}: ${JSON.stringify(good)}`);
      assert.ok(good.sec >= 40 && good.sec <= 120, `${good.sec.toFixed(0)} s`);
    }
    assert.ok(!sim(kit, lv, BOTS.bad).won, 'bad');
    assert.ok(!sim(kit, lv, BOTS.idle).won, 'idle');
  });

  test(`${lv.id}: a first-time human wins ≥ ${HUMAN[lv.id]}/40, stars spread; a sloppy one wins fewer`, () => {
    const t0 = Date.now();
    const human = seeds.map((s) => sim(kit, lv, humanBot(s), { seed: s }));
    wins[lv.id] = human.filter((r) => r.won).length;
    assert.ok(wins[lv.id] >= HUMAN[lv.id], `a first-timer wins ${wins[lv.id]}/40`);
    assert.ok(human.some((r) => r.stars === 3) && human.some((r) => r.won && r.stars < 3), 'stars spread');
    const sloppy = seeds.map((s) => sim(kit, lv, humanBot(s, SLOPPY), { seed: s })).filter((r) => r.won).length;
    assert.ok(sloppy < wins[lv.id], `sloppy ${sloppy} vs ${wins[lv.id]} — playing better pays`);
    assert.ok(Date.now() - t0 < 15000, 'the sims stay quick');
  });
}

test('the ladder climbs: a first-time human wins no more on a later level than the one before (one run of slack), and fewer at the top', () => {
  const w = kit.levels.map((l) => wins[l.id] ?? seeds.filter((s) => sim(kit, l, humanBot(s), { seed: s }).won).length);
  for (let i = 1; i < w.length; i += 1) assert.ok(w[i] <= w[i - 1] + 1, `${w}`);
  assert.ok(w.at(-1) < w[0], `${w}`);
});

test('the soldiers stay bounded: past the cap they run as weight, the count stays true', () => {
  const lv = { ...level, cap: 40, waves: [{ t: 999, beasts: [['yezhu', 1]], span: [-1, 1], speed: 1 }] };
  const g = run(newGame(kit, lv, { seed: 'cap' }), 2.5, 0.68, true);
  let sum = 0;
  for (let i = 0; i < g.s.n; i += 1) sum += g.s.w[i];
  assert.ok(g.s.n <= 40);
  assert.equal(sum, g.count);
  assert.ok(g.count > 100);
});

test('the bundle is current, loads the one shared Phaser, and every picture and word it needs is there', () => {
  const src = JSON.parse(readFileSync(at('scripts/games/sadoushou/source.json'), 'utf8')).source;
  assert.equal(src, sourceHash(new URL('../tools/sadoushou/', import.meta.url).pathname), 'rebuild: cd tools/sadoushou && npm ci && npm run build');
  const bundle = readFileSync(at('scripts/games/sadoushou/sadoushou.min.mjs'), 'utf8');
  assert.match(bundle, /from\s*"\.\.\/\.\.\/vendor\/phaser\.min\.mjs"/);
  assert.match(bundle, /from\s*"\.\/core\.js"/);
  assert.ok(!/Phaser v3\.\d+/.test(bundle) && bundle.length < 120_000, 'Phaser is not bundled in');
  // the art is shared: 撒豆成兵's 豆兵 and road, 守墙关's wall, beasts and 小满, 守炉's 银月, the story's ink mountains
  for (const f of ['units.webp', 'units.json', 'tex-road.webp', 'tex-side.webp']) assert.ok(existsSync(at(`scripts/games/sadou/art/${f}`)), f);
  for (const f of ['wall.webp', 'xiaoman-cast.webp']) assert.ok(existsSync(at(`scripts/games/shouqiang/art/${f}`)), f);
  for (const f of ['yinyue.webp', 'yinyue.json']) assert.ok(existsSync(at(`scripts/games/shoulu/art/${f}`)), f);
  for (const l of kit.levels) assert.ok(existsSync(at(`worlds/jiuding/art/backdrop/${l.sky ?? 'cloudy-day'}.webp`)), l.id);
  for (const [b, k] of Object.entries(kit.beasts)) {
    if (b.startsWith('_')) continue;
    const dir = k.art === 'sadou' ? 'sadou' : 'shouqiang';
    for (const f of [...k.frames, k.hit]) assert.ok(existsSync(at(`scripts/games/${dir}/art/${b}-${f}.webp`)), `${b}-${f}`);
  }
  const chars = readFileSync(at('scripts/games/sadoushou/font/chars.txt'), 'utf8');
  const play = ['play.js', 'hud.js'].map((f) => readFileSync(at(`tools/sadoushou/src/${f}`), 'utf8')).join('');
  const words = JSON.stringify([kit.levels.map((l) => [l.title, l.lead, l.moments]), kit.beasts, meta]) + play;
  for (const ch of words.match(/[　-鿿＀-￯]/g)) assert.ok(chars.includes(ch), `font lacks ${ch}`);
  assert.ok(existsSync(at('scripts/games/sadoushou/font/OFL.txt')));
});
