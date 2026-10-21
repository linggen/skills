// 撒豆成兵 · 守山门 (the DEFENCE crowd game, test-only beside 撒豆成兵) — registered as a second game in the 游戏厅 (main,
// 塔防, tall) and nowhere in the story; three columns (Hanli 10-21: 「一共3列, 要么打野猪, 要么打两边的+攻击的卡」): the
// tide down the middle, belts of cards and stone walls down the sides; the squad fires on its own; a card's number grows
// with every hit and pays at its cap or at the line; a wall breaks open (or lifts the squad a tier); the 大妖 charges the
// squad's column. The level file is sound; the engine's arithmetic holds; the balance holds on every level (a sharp
// player wins, one who never buffs, one who never shoots the tide and one who never moves lose, a first-time human wins
// most and fewer up the ladder); the bundle is current, every picture it asks for is there, the font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, humanBot, waveLeft, waveCount, newGame, aim, step, sim, stars, beltOf, dpsOf, rateOf, colOf, colMid, castJieyin, jieyinState, COLS, TOP } from '../scripts/games/sadoushou/core.js';
import { levelAsked, meta, offerJieyin } from '../scripts/games/sadoushou.js';
import { sourceHash } from '../tools/sadoushou/hash.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = JSON.parse(readFileSync(at('worlds/jiuding/levels/sadoushou.json'), 'utf8'));
const level = kit.levels[0];
const reg = JSON.parse(readFileSync(at('worlds/jiuding/games.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const both = (o) => Boolean(o?.zh && o?.en);
const run = (g, sec, x = 0) => { for (let t = 0; t < sec; t += 1 / 30) { aim(g, x); step(g, 1 / 30); } return g; };
const quiet = (lv, belt) => ({ ...lv, waves: [{ t: 999, beasts: [['yezhu', 1]], speed: 1 }], belt: { ...lv.belt, lines: belt } });

test('registered beside 撒豆成兵 (main, 塔防, tall), test-only: no story scene, no task, not dealt in the 秘境', () => {
  assert.equal(meta.id, 'sadoushou');
  assert.ok(both(meta.name) && both(meta.how) && meta.tall && meta.pause);
  const row = reg.games.find((g) => g.id === 'sadoushou');
  assert.ok(row && row.group === 'main' && row.mechanic === '塔防');
  assert.ok(!row.scene && !row.task && !row.hui, 'not in the story');
  assert.equal(reg.games.indexOf(row), reg.games.findIndex((g) => g.id === 'sadou') + 1, 'tiled right after 撒豆成兵, to compare');
  for (const f of ['worlds/jiuding/qiyu.json', 'worlds/jiuding/tasks/world.json']) assert.doesNotMatch(readFileSync(at(f), 'utf8'), /sadoushou/, f);
  kit.levels.forEach((l, i) => {
    assert.equal(levelAsked(kit, { lv: l.id }, ''), l);
    assert.equal(levelAsked(kit, {}, `?lv=${i + 1}`), l);
  });
  assert.equal(levelAsked(kit, {}, '?lv=99'), level);
  const src = readFileSync(at('scripts/games/sadoushou.js'), 'utf8');
  assert.match(src, /next: nx\.id/, '下一关');
  assert.match(src, /shell\.lead\(said, \{ auto: 'read', lang/, 'the lead card at the story\'s pace');
});

test('a ladder of four, each a 回 later, each beast one the book has shown by its 回 (creatures.json `hui`)', () => {
  assert.equal(kit.levels.length, 4);
  assert.equal(new Set(kit.levels.map((l) => l.id)).size, 4);
  const order = (h) => ({ h01: 1, h02: 2, h03: 3, h04: 4, h05: 5, h06: 6, h11: 7, h07: 7, h09: 8 })[h];
  const hui = Object.fromEntries(creatures.map((c) => [c.id, c.hui]));
  for (let i = 1; i < kit.levels.length; i += 1) assert.ok(order(kit.levels[i].hui) >= order(kit.levels[i - 1].hui));
  for (const l of kit.levels) {
    for (const b of new Set([...l.waves.flatMap((w) => w.beasts.map(([x]) => x)), l.boss.beast])) {
      assert.ok(kit.beasts[b] && hui[b], `${l.id}: ${b}`);
      assert.ok(order(hui[b]) <= order(l.hui), `${l.id} (${l.hui}) sends ${b}, met in ${hui[b]}`);
    }
  }
  assert.deepEqual(kit.levels.map((l) => l.boss.beast), ['longzhi', 'longzhi', 'heyu', 'heyu']);
});

for (const lv of kit.levels) test(`${lv.id}: the level is data — words in both languages, three columns, a tide in the hundreds, a charging 大妖`, () => {
  assert.ok(lv.kit === 'sadoushou' && lv.story === null && both(lv.title));
  assert.ok(lv.lead.length >= 2 && lv.lead.every(both) && lv.lead.at(-1).big && lv.lead.slice(0, -1).every((l) => !l.big));
  assert.ok(lv.leadSec >= 3 && lv.countdown >= 1, 'it starts by itself after the lead-in');
  for (const [k, lines] of Object.entries(lv.moments)) if (!k.startsWith('_')) assert.ok(lines.length && lines.every(both), k);
  assert.ok(lv.stars[0] > lv.stars[1] && lv.par > 0 && lv.wall > 0 && lv.squad >= 5, 'a squad to see from the start');
  assert.ok(lv.tiers.length >= 2 && lv.tiers.every((t) => both(t.name) && t.power >= 1));
  const belt = beltOf(lv);
  assert.ok(belt.every((it) => it.col === 'L' || it.col === 'R'), 'the belt rides the side columns only');
  assert.ok(belt.some((it) => it.kind === 'block'), 'a stone wall to break');
  assert.ok(belt.some((it) => it.gold && it.cap >= 50), 'a gold card behind it');
  for (const w of belt.filter((it) => it.kind === 'block')) {
    assert.ok(!belt.some((it) => it.kind === 'card' && it.col === w.col && Math.abs(it.z - w.z) < 7 && !(it.gold && it.z > w.z)), 'a wall stands clear');
  }
  const total = lv.waves.reduce((s, w) => s + w.beasts.reduce((a, [, n]) => a + n, 0), 0);
  assert.ok(total >= 300 && total <= 3000, `the 兽潮 counts ${total}`);
  assert.ok(lv.waves.every((w) => !w.span), 'the tide comes down the middle');
  const c = lv.boss.charge;
  assert.ok(lv.boss.hp > 0 && c.every > c.warn && c.warn >= 1.2 && c.kill > 0 && c.kill < 1, 'a charge shown long enough to dodge');
});

test('the ladder brings one new thing a level: red cards, then a wall that lifts the squad a tier, then the fast flyers', () => {
  const red = (l) => beltOf(l).some((it) => it.n < 0);
  const tier = (l) => beltOf(l).some((it) => it.gives === 'tier');
  assert.deepEqual(kit.levels.map(red), [false, true, true, true]);
  assert.deepEqual(kit.levels.map(tier), [false, false, true, true]);
  assert.ok(kit.levels.at(-1).waves.some((w) => w.beasts.some(([b]) => kit.beasts[b].fly)));
});

test('the squad fires on its own up its column, denser and harder the bigger it is', () => {
  const g = newGame(kit, quiet(level, []), { seed: 't' });
  assert.equal(g.squad, level.squad, 'a squad stands from the start');
  run(g, 1, colMid('L'));
  assert.ok(g.shots.length > 0 && g.shots.every((s) => colOf(s.x) === 'L'));
  const r0 = rateOf(g), d0 = dpsOf(g);
  g.squad *= 4;
  assert.ok(rateOf(g) > r0 && dpsOf(g) === d0 * 4);
  g.tier = 1;
  assert.ok(dpsOf(g) > d0 * 4, 'a tier hits harder');
});

test('a card\'s number grows a step a hit, a red one shot past zero turns good; it pays at its cap, or at the line to a squad under it', () => {
  // a −5 card on the left, the squad shooting it: it climbs through zero and pays at its cap
  const red = quiet(level, [{ col: 'L', from: 60, every: 999, cards: [{ n: -5, cap: 10 }] }]);
  const g = newGame(kit, red, { seed: 't' });
  const card = g.belt[0];
  let hits = 0, paid = null;
  for (let i = 0; i < 30 * 8 && !paid; i += 1) {
    aim(g, colMid('L')); step(g, 1 / 30);
    for (const e of g.events) { if (e.t === 'card_hit') hits += 1; if (e.t === 'card') paid = e; }
    g.events.length = 0;
  }
  assert.ok(paid && paid.how === 'cap' && paid.n === 10, JSON.stringify(paid));
  assert.equal(hits, 15, 'from −5 to +10, a step a hit');
  assert.equal(g.squad, level.squad + 10);
  assert.ok(card.gone);
  // standing in the other side column: it reaches the line unpumped and pays nothing; under it: it pays its number
  const plain = quiet(level, [{ col: 'R', from: 20, every: 999, cards: [{ n: 3, cap: 50 }] }]);
  const away = run(newGame(kit, plain, { seed: 't' }), 6, colMid('L'));
  assert.equal(away.squad, level.squad);
  const under = run(newGame(kit, plain, { seed: 't' }), 6, colMid('R'));
  assert.ok(under.squad > level.squad + 3, `pumped on the way down, then taken: ${under.squad}`);
  // a red card left alone and stood under costs
  const bad = quiet(level, [{ col: 'R', from: 6, every: 999, cards: [{ n: -6, cap: 10 }] }]);
  const g2 = newGame(kit, bad, { seed: 't' });
  aim(g2, colMid('R'), false);
  for (let i = 0; i < 60; i += 1) step(g2, 1 / 30);
  assert.equal(g2.squad, level.squad - 6);
});

test('a stone wall shields what is behind it until shot down; one lifts the squad a tier', () => {
  const lv = kit.levels.find((l) => beltOf(l).some((it) => it.gives === 'tier'));
  const lines = [{ col: 'R', from: 40, every: 999, wall: { hp: 30, gives: 'tier' } }, { col: 'R', from: 46, every: 999, cards: [{ n: 10, cap: 60, step: 2, gold: true }] }];
  const g = newGame(kit, quiet(lv, lines), { seed: 't' });
  const [wall, gold] = g.belt;
  g.squad = 60; // a squad big enough to break it before it rides past
  let broke = null, goldHit = 0;
  for (let i = 0; i < 30 * 8; i += 1) {
    aim(g, colMid('R')); step(g, 1 / 30);
    for (const e of g.events) { if (e.t === 'block') broke = { at: g.t, ...e }; if (e.t === 'card_hit' && e.id === gold.id) { goldHit += 1; assert.ok(broke, 'nothing reaches the gold before the wall is down'); } }
    g.events.length = 0;
  }
  assert.ok(broke && wall.gone && g.tier === 1 && goldHit > 0);
});

test('the grind: the stream takes beasts by power, the front rank first; a wave at the wall costs it', () => {
  const w = { units: [{ b: 'zheng', n: 2, p: 3 }, { b: 'yezhu', n: 4, p: 1 }], hp: 10 };
  assert.equal(waveCount(w), 6);
  w.hp = 7;
  assert.deepEqual(waveLeft(w), [{ b: 'zheng', n: 2 }, { b: 'yezhu', n: 1 }]);
  const g = run(newGame(kit, { ...level, belt: { ...level.belt, lines: [] } }, { seed: 'grind' }), 40, colMid('L'));
  assert.ok(g.wall.hp < level.wall, 'shooting the side only, the tide reaches the wall');
  const s = run(newGame(kit, level, { seed: 'grind' }), 12, colMid('M'));
  assert.ok(s.stats.killed > 20);
});

test('the 大妖 charges the column the squad stands in: still there, it loses a share; moved off, none', () => {
  const lose = (stay) => {
    const g = newGame(kit, { ...level, waves: [], belt: { ...level.belt, lines: [] } }, { seed: 'charge' });
    step(g, 1 / 30);
    assert.equal(g.phase, 'boss');
    g.boss.hp = 1e9;
    g.squad = 100;
    let x = colMid('M'), end = null;
    for (let i = 0; i < 30 * 30 && !end; i += 1) {
      aim(g, x); step(g, 1 / 30);
      for (const e of g.events) { if (e.t === 'charge_warn') { assert.ok(e.sec >= 1.2); if (!stay) x = colMid('L'); } if (e.t === 'charge_end') end = e; }
      g.events.length = 0;
    }
    assert.equal(end.col, 'M');
    return end.lost;
  };
  assert.ok(lose(true) >= 20, 'stood in it');
  assert.equal(lose(false), 0, 'moved off');
});

// a first-time human (reacts ~0.45 s late, reconsiders every ~1.6 s, turns on the tide early or late by up to 60 %, the
// poorer side one time in four, out of the charge three times in five) wins at least this many of 40; the first forgiving
const HUMAN = { shanmen: 35, songlin: 26, yaoyuan: 18, heisong: 18 };
const SLOPPY = { react: 0.7, judge: 1, wrong: 0.5, dodge: 0.3, look: 2.6 };
const seeds = Array.from({ length: 40 }, (_, i) => `h${i}`);
const wins = {};

for (const lv of kit.levels) {
  test(`${lv.id}: a sharp player wins every seed; never buffing, never shooting the tide, never moving all lose`, () => {
    for (const s of ['sim', 'a', 'b']) {
      const good = sim(kit, lv, BOTS.good, { seed: s });
      assert.ok(good.won, `${s}: ${JSON.stringify({ ...good, stats: undefined })}`);
      assert.ok(good.sec >= 40 && good.sec <= 130, `${good.sec.toFixed(0)} s`);
    }
    for (const b of ['bad', 'greedy', 'idle']) assert.ok(!sim(kit, lv, BOTS[b]).won, b);
  });

  test(`${lv.id}: a first-time human wins ≥ ${HUMAN[lv.id]}/40, stars spread; a sloppy one wins no more`, () => {
    const t0 = Date.now();
    const human = seeds.map((s) => sim(kit, lv, humanBot(s), { seed: s }));
    wins[lv.id] = human.filter((r) => r.won).length;
    assert.ok(wins[lv.id] >= HUMAN[lv.id], `a first-timer wins ${wins[lv.id]}/40`);
    assert.ok(wins[lv.id] < 40 || lv === level, 'not a walkover past the first');
    assert.ok(human.some((r) => r.won && r.stars < 3), 'stars spread');
    const sloppy = seeds.map((s) => sim(kit, lv, humanBot(s, SLOPPY), { seed: s })).filter((r) => r.won).length;
    assert.ok(sloppy <= wins[lv.id], `sloppy ${sloppy} vs ${wins[lv.id]}`);
    assert.ok(Date.now() - t0 < 20000, 'the sims stay quick');
  });
}

test('the ladder climbs: a first-time human wins no more on a later level than the one before (two runs of slack), and fewer at the top', () => {
  const w = kit.levels.map((l) => wins[l.id] ?? seeds.filter((s) => sim(kit, l, humanBot(s), { seed: s }).won).length);
  for (let i = 1; i < w.length; i += 1) assert.ok(w[i] <= w[i - 1] + 2, `${w}`);
  assert.ok(w.at(-1) < w[0], `${w}`);
});

test('结印: offered only once the 大妖 is out, it strikes up the dock\'s lane (else the squad\'s column), then rests', () => {
  const g = newGame(kit, level, { seed: 'jy' });
  assert.equal(jieyinState(g).on, false, 'boss-only: not during the waves');
  assert.equal(castJieyin(g, 'feijian', 'middle'), false);
  const b = newGame(kit, { ...level, waves: [], belt: { ...level.belt, lines: [] } }, { seed: 'jy' });
  step(b, 1 / 30);
  for (let i = 0; i < 90; i += 1) { aim(b, colMid('L')); step(b, 1 / 30); }
  assert.ok(jieyinState(b).ready);
  assert.equal(castJieyin(b, 'feijian', 'left'), false, 'nothing up the left column: not spent');
  const hp = b.boss.hp;
  assert.equal(castJieyin(b, 'huodan', 'middle'), true, 'the hand in the middle: the 大妖');
  assert.ok(b.boss.hp < hp && b.events.some((e) => e.t === 'spell' && e.on === 'boss'));
  assert.ok(!jieyinState(b).ready && jieyinState(b).cool === level.jieyin.cool, 'then the hand rests');
  aim(b, colMid('M'));
  assert.equal(castJieyin(b, 'huodan'), false, 'resting');
});

test('结印 is never needed (every level is won without a cast) but makes ★★★ easier: faster, under par', () => {
  for (const lv of kit.levels) {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const bare = seeds.map((s) => sim(kit, lv, BOTS.good, { seed: s })), cast = seeds.map((s) => sim(kit, lv, BOTS.good, { seed: s, casts: true }));
    assert.ok(bare.every((r) => r.won && r.casts === 0), `${lv.id}: won without a cast`);
    const mean = (rs, f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    assert.ok(mean(cast, (r) => r.sec) < mean(bare, (r) => r.sec) - 5, `${lv.id}: faster with casts`);
    assert.ok(mean(cast, (r) => r.stars) >= mean(bare, (r) => r.stars), `${lv.id}: no fewer stars`);
    assert.ok(cast.filter((r) => r.stars === 3).length > bare.filter((r) => r.stars === 3).length || lv === level, `${lv.id}: ★★★ easier`);
  }
});

test('结印\'s dock is offered only where it can be: no move → null; else the dock hears the game (state, a cast with its lane, a 走火)', async () => {
  const none = await offerJieyin({ jieyin: null }, {}, { lang: 'zh', game: {} });
  assert.equal(none, null);
  let got = null;
  const calls = [];
  const game = { jieyinState: () => ({ on: true, ready: true }), jieyin: (id, lane) => { calls.push([id, lane]); return true; }, fizzle: () => calls.push('fizzle'), paused: () => false, picking: () => false, say: () => {} };
  const box = { ownerDocument: { defaultView: {} } };
  const h = await offerJieyin(level, box, { lang: 'zh', game, marks: [], load: async () => ({ offerSeals: async (o) => { got = o; return { close() {} }; } }) });
  assert.ok(h && got);
  assert.deepEqual(got.moves.map((m) => m.id), ['feijian'], 'before 古六\'s lesson only 剑诀\'s 飞剑 (the save\'s marks gate the rest)');
  assert.ok(got.cast('feijian', 'right'));
  got.fizzle();
  assert.deepEqual(calls, [['feijian', 'right'], 'fizzle']);
  assert.equal(got.state().ready, true);
  await offerJieyin(level, box, { lang: 'zh', game, load: async () => ({ offerSeals: async (o) => { got = o; return null; } }) });
  assert.deepEqual(got.moves.map((m) => m.id), ['feijian', 'huodan'], 'the 游戏厅 (no marks): every move');
});

test('the bundle is current, loads the one shared Phaser, and every picture and word it needs is there', () => {
  const src = JSON.parse(readFileSync(at('scripts/games/sadoushou/source.json'), 'utf8')).source;
  assert.equal(src, sourceHash(new URL('../tools/sadoushou/', import.meta.url).pathname), 'rebuild: cd tools/sadoushou && npm ci && npm run build');
  const bundle = readFileSync(at('scripts/games/sadoushou/sadoushou.min.mjs'), 'utf8');
  assert.match(bundle, /from\s*"\.\.\/\.\.\/vendor\/phaser\.min\.mjs"/);
  assert.match(bundle, /from\s*"\.\/core\.js"/);
  assert.ok(!/Phaser v3\.\d+/.test(bundle) && bundle.length < 120_000, 'Phaser is not bundled in');
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
  const words = JSON.stringify([kit.levels.map((l) => [l.title, l.lead, l.moments, l.tiers]), kit.beasts, meta]) + play;
  for (const ch of words.match(/[　-鿿＀-￯]/g)) assert.ok(chars.includes(ch), `font lacks ${ch}`);
  assert.ok(TOP === 100 && COLS.M[0] < 0 && COLS.M[1] > 0);
});
