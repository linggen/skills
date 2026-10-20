// 守墙关 (wall defense) — the level file is sound (卷一 beasts only, 8–10 waves, about ten cards, words in both
// languages), the engine plays headless with bots and the balance holds (a sensible build wins, random picks win
// sometimes, never picking loses), the waves come on their own, and what Phaser draws exists: the bundle is current,
// Phaser is the one shared vendored build, every picture it asks for is there, the font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, W, canPlace, cellAt, collect, hurt, newGame, offerCards, open, pick, place, reachY, setFocus, sim, step, stars } from '../scripts/games/shouqiang/core.js';
import { levelAsked, meta } from '../scripts/games/shouqiang.js';
import { sourceHash } from '../tools/shouqiang/hash.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = JSON.parse(readFileSync(at('worlds/jiuding/levels/shouqiang.json'), 'utf8'));
const level = kit.levels[0];
const reg = JSON.parse(readFileSync(at('worlds/jiuding/games.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const SEEDS = Array.from({ length: 12 }, (_, i) => `s${i}`);
const advance = (g, secs) => { for (let t = 0; t < secs; t += 0.1) step(g, 0.1); };
const run = (bot) => SEEDS.map((seed) => sim(kit, level, BOTS[bot], { seed }));

test('registered: meta, the 游戏厅 row (塔防, plays tall), the level asked for', () => {
  assert.equal(meta.id, 'shouqiang');
  assert.ok(meta.name.zh && meta.name.en && meta.how.zh && meta.how.en);
  const row = reg.games.find((g) => g.id === 'shouqiang');
  assert.ok(row, 'games.json row');
  assert.equal(row.mechanic, '塔防');
  assert.ok(reg.groups.some((g) => g.id === row.group));
  assert.equal(levelAsked(kit, {}, '?dev=1&game=shouqiang'), level);
  assert.equal(levelAsked(kit, { lv: 'shanmen' }, ''), level);
  assert.equal(levelAsked(kit, {}, '?lv=1'), level);
  assert.equal(levelAsked(kit, {}, '?lv=99'), level, 'an unknown level falls back to the first');
});

test('the level is data: kit, title, lead-in with the 兽潮来袭 banner, 8–10 waves, stars, moments in both languages', () => {
  assert.equal(level.kit, 'shouqiang');
  assert.ok(level.story === null && level.title.zh && level.title.en);
  assert.ok(level.lead.length >= 3 && level.lead.every((l) => l.zh && l.en));
  assert.ok(level.lead.some((l) => l.big && l.zh.includes('兽潮来袭')));
  assert.ok(level.leadSec >= 4, 'a lead-in long enough to read before wave 1');
  assert.ok(level.waves.length >= 8 && level.waves.length <= 10, `${level.waves.length} waves`);
  assert.ok(level.stars[0] > level.stars[1] && level.stars[1] > 0);
  for (const lines of Object.values(level.moments)) assert.ok(lines.every((l) => l.zh && l.en));
});

test('卷一 beasts only (野猪 狰 犰狳 鬿雀, the 合窳 boss last), each one a creature of the world', () => {
  const ids = new Set(creatures.map((c) => c.id));
  const juan = Object.fromEntries(creatures.map((c) => [c.id, c.juan]));
  const used = new Set(level.waves.flat().map(([b]) => b));
  for (const b of used) {
    assert.ok(kit.beasts[b], `${b}: stats`);
    assert.ok(ids.has(b), `${b}: in creatures.json`);
    assert.ok(!juan[b] || juan[b] === 1, `${b}: not from a later 卷`);
  }
  assert.deepEqual([...used].sort(), ['heyu', 'qique', 'qiuyu', 'yezhu', 'zheng']);
  assert.ok(!used.has('kuiniu'));
  assert.ok(level.waves.at(-1).some(([b]) => b === 'heyu'), 'the boss closes the level');
  assert.ok(level.waves.slice(0, -1).every((w) => w.every(([b]) => b !== 'heyu')), 'and only there');
});

test('about ten cards across the 守炉 kit, every number list as long as its levels, needs that exist', () => {
  assert.ok(kit.cards.length >= 9 && kit.cards.length <= 12, `${kit.cards.length} cards`);
  assert.deepEqual([...new Set(kit.cards.map((c) => c.family))].sort(), ['han', 'huo', 'jian', 'lei', 'yy']);
  const ids = new Set(kit.cards.map((c) => c.id));
  for (const c of kit.cards) {
    assert.ok(c.name.zh && c.name.en && c.say.zh && c.say.en, c.id);
    assert.ok(!c.needs || ids.has(c.needs), `${c.id} needs ${c.needs}`);
    for (const [k, v] of Object.entries(c)) if (Array.isArray(v)) assert.equal(v.length, c.max, `${c.id}.${k}`);
  }
});

test('the first wave comes on its own after the lead-in; the game only waits on a pick', () => {
  const g = newGame(kit, level, { seed: 'auto' });
  assert.equal(g.phase, 'lead');
  advance(g, level.leadSec + 0.2);
  assert.equal(g.phase, 'wave');
  assert.ok(g.events.some((e) => e.t === 'wave' && e.n === 1));
  for (let i = 0; i < 3000 && g.phase === 'wave'; i += 1) step(g, 0.05);
  assert.equal(g.phase, 'pick', 'wave 1 cleared by the heroes alone → the pick');
  assert.equal(g.offer.length, 3);
  assert.equal(new Set(g.offer).size, 3, 'three different cards');
  const t = g.t;
  advance(g, 5);
  assert.equal(g.phase, 'pick', 'nothing comes while the cards are up');
  assert.ok(!pick(g, 'not-offered'));
  assert.ok(pick(g, g.offer[0]));
  assert.equal(g.phase, 'count');
  advance(g, level.between + 0.2);
  assert.equal(g.phase, 'wave', 'the next wave counts itself in');
  assert.ok(g.t > t);
});

test('cards: a maxed card and one whose need is missing are never offered', () => {
  const g = newGame(kit, level, { seed: 'cards' });
  const blocked = kit.cards.filter((c) => c.needs).map((c) => c.id);
  assert.ok(open(g).every((c) => !blocked.includes(c.id)));
  for (const c of kit.cards) g.skills[c.id] = c.max;
  assert.equal(open(g).length, 0);
  assert.deepEqual(offerCards(g), []);
});

test('focus: a tap on a beast makes it the target; a dead or unknown one clears it', () => {
  const g = newGame(kit, level, { seed: 'focus' });
  advance(g, level.leadSec + 3);
  const b = g.beasts[0];
  assert.equal(setFocus(g, b.id), b.id);
  assert.equal(setFocus(g, 99999), null);
});

test('balance: never picking loses; random picks win some; the sensible build wins every seed', () => {
  const lazy = run('lazy'), random = run('random'), greedy = run('greedy');
  assert.ok(lazy.every((r) => !r.won && r.wave <= 6), `lazy reached waves ${lazy.map((r) => r.wave)}`);
  const rw = random.filter((r) => r.won).length;
  assert.ok(rw >= 2 && rw <= SEEDS.length - 2, `random won ${rw}/${SEEDS.length}: the cards must matter`);
  assert.ok(greedy.every((r) => r.won), `greedy lost on ${greedy.filter((r) => !r.won).length} seeds`);
  assert.ok(greedy.filter((r) => r.stars === 3).length >= SEEDS.length * 0.75, 'a sharp build keeps most of the wall: 3 stars');
  assert.ok(greedy.some((r) => r.wallLeft < 0.95), 'and still feels the pressure');
});

// A first-time human (Hanli 10-20: 「感觉有点难」 at wave 2 with 125 of 1200 left): ~0.4 s late, a card that looks
// good rather than the build list, rarely a focus tap. Today's tuning (「目前难度感觉还行」) must be winnable by it.
test('balance for a human: the human-like bot wins most seeds, never near death early, and still feels it', () => {
  const human = run('human');
  const won = human.filter((r) => r.won && r.stars >= 1).length;
  assert.ok(won >= SEEDS.length * 0.75, `human won ${won}/${SEEDS.length}`);
  for (const r of human) assert.ok(r.walls.slice(0, 3).every((w) => w >= level.wall * 0.6), `waves 1–3 leave most of the wall: ${r.walls.slice(0, 3)}`);
  assert.ok(human.some((r) => r.stars < 3), '3 stars is the challenge');
  assert.ok(run('lazy').every((r) => !r.won), 'never picking still loses');
});

test('difficulty is one knob in the data: more beasts and more hp a wave', () => {
  assert.equal(level.difficulty, 1);
  const wave1 = (k) => {
    const g = newGame(kit, { ...level, difficulty: k }, { seed: 'k' });
    advance(g, level.leadSec + 0.2);
    return { n: g.spawns.length + g.beasts.length, hp: g.spawns[0]?.mul };
  };
  const a = wave1(1), b = wave1(1.5);
  assert.ok(b.n > a.n && b.hp > a.hp, JSON.stringify({ a, b }));
});

// Hanli 10-20: 「让怪出现在攻击范围外, 让玩家能看到」 — the horde walks in above the range line in plain view.
test('the range line: nothing is hurt above it; the boss stops above it to roar, then walks into reach', () => {
  const R = reachY({ level });
  assert.ok(R > 300 && R < 460, `the line ~40% down: ${R}`);
  for (const [seed, bot] of [['r1', BOTS.greedy], ['r2', BOTS.random], ['r3', BOTS.greedy]]) {
    const g = newGame(kit, level, { seed });
    const ys = new Map();
    let roar = null, bossKill = null;
    while (!['won', 'lost'].includes(g.phase) && g.t < 900) {
      for (const b of g.beasts) ys.set(b.id, b.y);
      if (g.phase === 'pick') pick(g, bot(g)); else step(g, 1 / 30);
      for (const e of g.events) {
        if (e.t === 'hit') assert.ok(ys.get(e.id) >= R || e.y >= R, `a hit above the line at y=${e.y}`);
        if (e.t === 'roar') roar = e;
        if (e.t === 'kill' && e.boss) bossKill = e;
      }
      g.events.length = 0;
    }
    if (g.phase === 'won') {
      assert.ok(roar && roar.y < R, 'the boss roared above the line');
      assert.ok(bossKill.y >= R + 40, `and fell well inside reach (y=${Math.round(bossKill.y)})`);
    }
  }
  const g = newGame(kit, level, { seed: 'above' });
  advance(g, level.leadSec + 1);
  const b = g.beasts[0];
  assert.ok(b.y < R);
  assert.equal(hurt(g, b, 999, 'thunder'), 0, 'a beast above the line takes nothing');
});

// Hanli 10-20: 「小满的剑别对着自己, 剑往回飞也不太合理」 — 回剑 became 回旋: a sword that struck arcs on across the road.
test('swords never head back toward 小满; 回旋 arcs to a second beast and dissolves up the road', () => {
  const arc = kit.cards.find((c) => c.id === 'jian-arc');
  assert.ok(arc && !kit.cards.some((c) => c.id === 'jian-return'));
  assert.match(arc.name.zh, /回旋/);
  let swords = 0, arcing = 0, fades = 0, arcHits = 0;
  for (const seed of ['a1', 'a2']) {
    const g = newGame(kit, level, { seed });
    while (!['won', 'lost'].includes(g.phase) && g.t < 900) {
      if (g.phase === 'pick') pick(g, g.offer.includes('jian-arc') ? 'jian-arc' : BOTS.greedy(g)); else step(g, 1 / 60);
      for (const s of g.shots) {
        if (s.kind !== 'sword') continue;
        swords += 1;
        assert.ok(s.vy <= 0, `a sword heading down at ${Math.round(s.x)},${Math.round(s.y)} (vy ${s.vy})`);
        if (s.arcing) arcing += 1;
      }
      for (const e of g.events) { if (e.t === 'fade') fades += 1; }
      arcHits += g.events.filter((e) => e.t === 'hit' && e.kind === 'sword').length;
      g.events.length = 0;
    }
  }
  assert.ok(swords > 1000 && arcing > 100 && fades > 10 && arcHits > 0, JSON.stringify({ swords, arcing, fades }));
});

test('stars come from the wall left', () => {
  const g = newGame(kit, level, { seed: 'stars' });
  const s = (left) => { g.wall = g.wallMax * left; g.phase = 'won'; return stars(g); };
  assert.equal(s(1), 3);
  assert.equal(s(level.stars[0]), 3);
  assert.equal(s(level.stars[0] - 0.01), 2);
  assert.equal(s(level.stars[1] - 0.01), 1);
  g.wall = 0;
  assert.equal(stars(g), 0);
});

test('the play: bundle current, Phaser the one shared vendored build, every picture and the font there', () => {
  const src = JSON.parse(readFileSync(at('scripts/games/shouqiang/source.json'), 'utf8'));
  assert.equal(src.source, sourceHash(new URL('../tools/shouqiang/', import.meta.url).pathname), 'rebuild: cd tools/shouqiang && npm run build');
  const bundle = readFileSync(at('scripts/games/shouqiang/shouqiang.min.mjs'), 'utf8');
  const imports = new Set([...bundle.matchAll(/from"([^"]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...imports].sort(), ['../../vendor/phaser.min.mjs', './core.js'], 'Phaser and the engine stay outside the bundle');
  assert.ok(!/Phaser v3\.\d+/.test(bundle.slice(400)) && bundle.length < 200_000, 'no Phaser copy inside');
  const phaser = readFileSync(at('scripts/vendor/phaser.min.mjs'));
  const vendor = readFileSync(at('scripts/vendor/VENDOR.md'), 'utf8');
  assert.match(vendor, new RegExp(createHash('sha256').update(phaser).digest('hex')), 'VENDOR.md names the vendored file’s sha256');
  assert.ok(existsSync(at('scripts/vendor/LICENSE.phaser.txt')));
  const art = (k) => at(`scripts/games/shouqiang/art/${k}.webp`);
  const want = ['bg', 'wall', 'xiaoman-idle', 'fu-huo', 'fu-han', 'fu-lei', 'sword',
    ...Object.keys(kit.beasts).filter((k) => !k.startsWith('_')).flatMap((b) => [`${b}-walk-1`, `${b}-hit`]),
    ...kit.cards.map((c) => `icon-${c.id}`)];
  for (const k of want) assert.ok(existsSync(art(k)), `art/${k}.webp`);
  for (const k of ['yinyue.webp', 'yinyue-skills.webp', 'yinyue.json']) assert.ok(existsSync(at(`scripts/games/shoulu/art/${k}`)), `银月 (守炉's): ${k}`);
  assert.ok(existsSync(at('scripts/games/shouqiang/font/zcool-kuaile.woff2')));
  assert.match(readFileSync(at('scripts/games/shouqiang/font/OFL.txt'), 'utf8'), /SIL Open Font License/);
  const chars = new Set(readFileSync(at('scripts/games/shouqiang/font/chars.txt'), 'utf8'));
  const words = JSON.stringify(kit).match(/[㐀-鿿]/g);
  for (const ch of words) assert.ok(chars.has(ch), `the font lacks ${ch}: rebuild`);
});

// ---- the 药园 levels (2–5): talismans in lanes ---------------------------------------------------------------------
// Hanli 10-20: 「植物大战僵尸方向好, 策略更多」「第一关没有"植物", 后面可以布置植物」「药园正好符合」. PvZ's numbers, our
// names; one new talisman and one new beast twist a level; the range line still holds; a first-timer wins L2 easily.
const lanes = kit.levels.slice(1);
const laneRun = (lvl, bot, n = 20, extra = {}) => Array.from({ length: n }, (_, i) => sim(kit, { ...lvl, ...extra }, BOTS[bot], { seed: `ln${i}`, limit: 1500 }));
const fresh = (lvl, seed = 'f') => { const g = newGame(kit, lvl, { seed }); g.events.length = 0; return g; };
const beastAt = (g, kind, col, y) => {
  const k = g.beastKit[kind];
  const b = { id: g.nextId++, kind, x: (col + 0.5) * g.grid.cw, y, col, hp: k.hp, max: k.hp, shell: k.shell ? Math.round(k.hp * (1 - k.shell)) : 0,
    leapt: false, leap: null, speed: k.speed, r: k.r, fly: Boolean(k.fly), boss: Boolean(k.boss), slow: 0, slowT: 0, freezeT: 0, stunT: 0,
    burnT: 0, burn: 0, wailT: 0, wailIn: k.wail?.every ?? 0, atWall: false, sway: 0, hitBy: new Set() };
  g.beasts.push(b);
  return b;
};
// Run a hand-built field: the wave phase with nothing more to come.
const fieldOf = (lvl) => { const g = fresh(lvl); g.phase = 'wave'; g.wave = 1; g.spawns = [{ kind: 'yezhu', at: 1e9 }]; g.level = { ...g.level, sky: null }; return g; };

test('药园 levels: L2–L5 in the 药园, one new talisman and one new beast twist a level, 卷一 beasts only', () => {
  assert.deepEqual(lanes.map((l) => l.id), ['yaoyuan-1', 'yaoyuan-2', 'yaoyuan-3', 'yaoyuan-4']);
  assert.equal(level.grid, undefined, 'level 1 stays the 山门, no talismans');
  assert.deepEqual(lanes.map((l) => l.units), [['juling', 'jian'], ['juling', 'jian', 'tu'], ['juling', 'jian', 'tu', 'han'], ['juling', 'jian', 'tu', 'han', 'lei']]);
  assert.deepEqual(lanes.map((l) => l.fresh), ['jian', 'tu', 'han', 'lei']);
  assert.deepEqual(lanes.map((l) => l.twist), ['yezhu', 'zheng', 'qiuyu', 'qique']);
  const juan = Object.fromEntries(creatures.map((c) => [c.id, c.juan]));
  const met = new Set();
  for (const l of lanes) {
    assert.equal(l.place, 'yaoyuan');
    assert.equal(l.kit, 'shouqiang');
    assert.ok(l.title.zh.startsWith('药园') && l.title.en, l.id);
    assert.ok(l.lead.some((x) => x.big && x.zh.includes('兽潮来袭')) && l.lead.every((x) => x.zh && x.en), `${l.id}: lead-in`);
    assert.ok(l.leadSec >= 6 && l.between >= 4, `${l.id}: time to set talismans before each wave`);
    for (const lines of Object.values(l.moments)) assert.ok(lines.every((x) => x.zh && x.en), l.id);
    assert.ok(l.moments.twist && l.moments.huge, `${l.id}: 银月 has a line for the new beast and the huge wave`);
    assert.ok(l.huge.length && l.huge.every((n) => n >= 1 && n <= l.waves.length) && l.huge.includes(l.waves.length), `${l.id}: the last wave is a 一大波`);
    const used = new Set(l.waves.flat().map(([b]) => b));
    for (const b of used) assert.ok(kit.beasts[b] && (!juan[b] || juan[b] === 1), `${l.id}: ${b} is 卷一`);
    const fresh = [...used].filter((b) => !met.has(b) && b !== 'heyu');
    assert.deepEqual(fresh, [l.twist], `${l.id}: exactly one new beast, its twist (met so far: ${[...met]})`);
    for (const b of used) met.add(b);
    assert.ok(l.waves.slice(0, 1).every((w) => w.every(([b]) => b === 'yezhu')), `${l.id}: wave 1 is plain 野猪, to build on`);
  }
  assert.ok(lanes.at(-1).waves.at(-1).some(([b]) => b === 'heyu') && lanes.slice(0, -1).every((l) => !l.waves.flat().some(([b]) => b === 'heyu')), '合窳 closes L5 only');
});

test('PvZ framework numbers, mapped: 灵气 economy, costs 50–175, hp ratios basic : vaulter : cone : giant', () => {
  const u = kit.units;
  assert.deepEqual([u.juling.cost, u.jian.cost, u.tu.cost, u.han.cost, u.lei.cost], [50, 100, 50, 175, 150]);
  assert.deepEqual([u.juling.make.amount, u.juling.make.every], [25, 24]);
  for (const l of lanes) assert.ok(l.ling === 50 && l.sky.amount === 25 && l.sky.every === 10, l.id);
  assert.deepEqual([u.jian.shoot.dmg, u.jian.shoot.every, u.tu.hp, u.lei.bomb.dmg, u.jian.hp], [20, 1.5, 4000, 1800, 300]);
  const lb = kit.laneBeasts;
  assert.deepEqual([lb.yezhu.hp, lb.zheng.hp, lb.qiuyu.hp, lb.heyu.hp], [270, 500, 640, 3000]);
  assert.ok(lb.yezhu.chew === 100 && lb.zheng.chew === 100 && lb.heyu.chew >= 1000);
  // One sword talisman kills a basic in about half the time the basic takes to cross the reach (PvZ's ratio).
  const l = lanes[0];
  const kill = (lb.yezhu.hp / u.jian.shoot.dmg) * u.jian.shoot.every, cross = (l.wallY - l.rangeY) / lb.yezhu.speed;
  assert.ok(kill / cross > 0.35 && kill / cross < 0.55, `kill ${kill.toFixed(1)} s / cross ${cross.toFixed(1)} s`);
  for (const c of kit.unitCards) {
    assert.ok(c.name.zh && c.name.en && c.say.zh && c.say.en && c.icon, c.id);
    assert.ok(!c.unit || u[c.unit], `${c.id}: ${c.unit}`);
    for (const [k, v] of Object.entries(c)) if (Array.isArray(v)) assert.equal(v.length, c.max, `${c.id}.${k}`);
  }
});

test('placement: unlocked kinds only, on the grid below the range line, one per cell, paid for, recharged, never during a pick', () => {
  const l = lanes[0];
  assert.ok(l.grid.top > l.rangeY && l.grid.bottom <= l.wallY, 'the grid lies between the range line and the wall');
  const g = fresh(l);
  assert.equal(g.ling, 50);
  assert.equal(canPlace(g, 'tu', 0, 0), 'locked', 'L2 has no 土墙符 yet');
  assert.equal(canPlace(g, 'juling', 5, 0), 'off-grid');
  assert.equal(canPlace(g, 'juling', 0, 5), 'off-grid');
  assert.equal(canPlace(g, 'jian', 2, 0), 'ling', '100 灵气 for a sword talisman, 50 in hand');
  const a = place(g, 'juling', 2, 0);
  assert.ok(a && g.ling === 0 && g.seedCool.juling === 7.5);
  assert.ok(a.y > l.rangeY && a.x === (2.5 * W) / 5, 'a cell centre in lane 2, below the line');
  g.ling = 500;
  assert.equal(canPlace(g, 'juling', 3, 0), 'recharge');
  assert.equal(canPlace(g, 'jian', 2, 0), 'taken');
  assert.ok(place(g, 'jian', 2, 1));
  advance(g, 7.6);
  assert.equal(canPlace(g, 'juling', 3, 0), '', 'recharged');
  g.phase = 'pick';
  assert.equal(canPlace(g, 'juling', 3, 0), 'phase');
  assert.deepEqual(cellAt(g, 270, l.grid.bottom - 1), { col: 2, row: 0 });
  assert.equal(cellAt(g, 270, l.rangeY), null, 'nothing above the grid');
});

test('the economy: arrays drop 25 a time, the night sky too, a tap or the slow auto-collect picks them up, nothing ticks during a pick', () => {
  const g = fresh(lanes[0]);
  g.level = { ...g.level, sky: null };
  place(g, 'juling', 0, 0);
  advance(g, 6.5);
  assert.equal(g.orbs.length, 0);
  advance(g, 1);
  assert.equal(g.orbs.length, 1, 'the first orb ~7 s after it is set');
  const o = g.orbs[0];
  assert.equal(o.amount, 25);
  assert.equal(collect(g, o.id), 25);
  assert.equal(g.ling, 25);
  advance(g, 24);
  assert.equal(g.orbs.length, 1, 'then every 24 s');
  advance(g, 7.2);
  assert.equal(g.orbs.length, 0, 'left lying, it collects itself');
  assert.equal(g.ling, 50);
  const s = fresh(lanes[0]);
  advance(s, 5.1);
  assert.equal(s.orbs.length, 1, 'the sky drops one ~5 s in');
  s.phase = 'pick';
  const t = s.orbs[0].age;
  advance(s, 20);
  assert.equal(s.orbs[0].age, t, 'frozen while the cards are up');
});

test('blockers: a beast stops at the first talisman in its lane and chews it (100/s); an empty lane leads to the wall', () => {
  const g = fieldOf(lanes[1]);
  g.ling = 999;
  const wall = place(g, 'tu', 2, 3);
  const b = beastAt(g, 'yezhu', 2, wall.y - 120);
  const free = beastAt(g, 'yezhu', 4, wall.y - 120);
  advance(g, 20);
  assert.ok(b.y < wall.y && wall.hp < 4000 && wall.hp > 4000 - 100 * 20, `chewing: wall ${Math.round(wall.hp)}`);
  assert.ok(free.y > wall.y + 60, 'the lane without a talisman: it walks on');
  for (let i = 0; i < 4000 && wall.hp > 0; i += 1) step(g, 0.05);
  advance(g, 4);
  assert.ok(b.y > wall.y, 'through once the wall is chewed down');
});

test('twists: 狰 leaps the first talisman only; 鬿雀 flies over every one; 犰狳 wears a shell; 合窳 smashes and calls', () => {
  // 狰 (L3): over the first, then it must chew the second.
  const g = fieldOf(lanes[1]);
  g.ling = 999;
  const front = place(g, 'tu', 1, 4);
  g.seedCool.tu = 0;
  const back = place(g, 'tu', 1, 1);
  const z = beastAt(g, 'zheng', 1, front.y - 100);
  const leaps = [];
  for (let i = 0; i < 600; i += 1) { step(g, 0.05); leaps.push(...g.events.filter((e) => e.t === 'leap')); g.events.length = 0; }
  assert.equal(leaps.length, 1, 'one leap');
  assert.ok(z.y > front.y && z.y < back.y, `past the first, stopped at the second (y ${Math.round(z.y)})`);
  assert.ok(front.hp === 4000 && back.hp < 4000, 'the first untouched, the second chewed');
  // 鬿雀 (L5): over a wall and a sword talisman, to the wall itself.
  const f = fieldOf(lanes[3]);
  f.ling = 999;
  const t1 = place(f, 'tu', 0, 3);
  const q = beastAt(f, 'qique', 0, t1.y - 60);
  advance(f, 40);
  assert.ok(q.atWall && t1.hp === 4000, 'flew over, never chewed');
  // 犰狳 (L4): its shell takes 370 of its 640; hits show small (weak) until it cracks.
  const a = fieldOf(lanes[2]);
  const qy = beastAt(a, 'qiuyu', 0, 500);
  assert.equal(qy.max / kit.laneBeasts.yezhu.hp > 2 && qy.max, 640);
  hurt(a, qy, 200, 'sword');
  assert.ok(a.events.some((e) => e.t === 'hit' && e.weak));
  a.events.length = 0;
  hurt(a, qy, 200, 'sword');
  assert.ok(a.events.some((e) => e.t === 'crack'), 'the shell cracks');
  // 合窳 (L5 boss): a 土墙 lasts seconds; its wail calls 野猪 into the lanes beside it.
  const h = fieldOf(lanes[3]);
  h.ling = 999;
  const w = place(h, 'tu', 2, 2);
  const boss = beastAt(h, 'heyu', 2, w.y - 36);
  boss.roared = true;
  advance(h, 6);
  assert.ok(w.hp <= 0, `smashed: ${Math.round(w.hp)}`);
  advance(h, 12);
  const called = h.beasts.filter((b) => b.kind === 'yezhu');
  assert.ok(called.length >= 2 && called.every((b) => Math.abs(b.col - boss.col) === 1), 'calls come in beside it');
});

test('lanes: a talisman shoots only up its own lane, frost slows, the thunder bursts once over 3×3 cells', () => {
  const g = fieldOf(lanes[3]);
  g.ling = 9999;
  place(g, 'jian', 0, 1);
  place(g, 'han', 4, 1);
  const own = beastAt(g, 'yezhu', 0, 420), other = beastAt(g, 'yezhu', 1, 420), cold = beastAt(g, 'yezhu', 4, 420);
  advance(g, 4);
  assert.ok(own.hp < own.max && other.hp === other.max, 'lane 0 only');
  assert.ok(cold.slowT > 0 && cold.slow === 0.5, 'frost slows');
  const near = [beastAt(g, 'qiuyu', 2, 520), beastAt(g, 'yezhu', 3, 560), beastAt(g, 'yezhu', 2, 610)];
  const far = beastAt(g, 'yezhu', 2, 330);
  g.seedCool.lei = 0;
  const bomb = place(g, 'lei', 2, 2);
  g.events.length = 0;
  advance(g, 1.2);
  assert.ok(g.events.some((e) => e.t === 'bomb'));
  assert.ok(near.every((b) => b.hp <= 0), 'the nine cells round it');
  assert.ok(far.hp > 0, 'nothing beyond');
  assert.ok(!g.units.includes(bomb), 'spent');
});

test('the range line holds in the 药园: a full game with talismans never hurts a beast above it; heroes guard only the wall foot', () => {
  for (const [i, l] of lanes.entries()) {
    const g = newGame(kit, l, { seed: `rl${i}` });
    const bot = BOTS.sharp.make(`rl${i}`);
    const ys = new Map();
    let hits = 0, heroHits = 0;
    while (!['won', 'lost'].includes(g.phase) && g.t < 900) {
      for (const b of g.beasts) ys.set(b.id, b.y);
      if (g.phase === 'pick') pick(g, bot.pick(g)); else { bot.act(g, 1 / 30); step(g, 1 / 30); }
      for (const e of g.events) {
        if (e.t !== 'hit') continue;
        hits += 1;
        assert.ok(ys.get(e.id) >= l.rangeY || e.y >= l.rangeY, `${l.id}: a hit above the line at y=${Math.round(e.y)}`);
        if (e.kind === 'fox') { heroHits += 1; assert.ok(e.y >= l.wallY - l.guard - 1, `${l.id}: 银月 reached up to y=${Math.round(e.y)}`); }
      }
      g.events.length = 0;
    }
    assert.ok(hits > 100, `${l.id}: ${hits} hits`);
  }
});

test('balance in the 药园: never setting a talisman loses; a first-timer wins L2 comfortably and L5 is a real fight', () => {
  const rate = (rs) => rs.filter((r) => r.won).length / rs.length;
  const target = [[0.95, 1], [0.85, 1], [0.6, 0.95], [0.5, 0.9]];
  const got = [];
  for (const [i, l] of lanes.entries()) {
    assert.ok(laneRun(l, 'lazy', 6).every((r) => !r.won), `${l.id}: the heroes alone never hold it`);
    const human = laneRun(l, 'human'), sharp = laneRun(l, 'sharp', 12);
    got.push(rate(human));
    assert.ok(rate(human) >= target[i][0] && rate(human) <= target[i][1], `${l.id}: the human bot won ${Math.round(rate(human) * 100)}%`);
    assert.ok(rate(sharp) >= 0.9, `${l.id}: a sharp player wins (${Math.round(rate(sharp) * 100)}%)`);
    assert.ok(human.every((r) => r.won || r.wave >= 3), `${l.id}: no first-timer loses in the first two waves`);
  }
  assert.ok(got[0] >= got[3] + 0.1, `L2 is easier than L5: ${got.map((x) => Math.round(x * 100))}`);
  assert.ok(laneRun(lanes[0], 'human').filter((r) => r.stars === 3).length >= 14, 'L2: mostly three stars');
});

test('difficulty is one knob in the data on a 药园 level too: more beasts and more hp, and it bites', () => {
  const l = lanes[1];
  assert.equal(l.difficulty, 1);
  const wave1 = (k) => {
    const g = newGame(kit, { ...l, difficulty: k }, { seed: 'k' });
    advance(g, l.leadSec + 0.2);
    return { n: g.spawns.length + g.beasts.length, hp: g.spawns[0]?.mul };
  };
  const a = wave1(1), b = wave1(1.5);
  assert.ok(b.n > a.n && b.hp > a.hp, JSON.stringify({ a, b }));
  const won = (k) => laneRun(l, 'human', 12, { difficulty: k }).filter((r) => r.won).length;
  assert.ok(won(1.6) < won(1), 'harder at 1.6');
});

test('lane cards: only for the talismans a level has; a thicker wall thickens the standing ones; 月华 pays at once', () => {
  const g = fresh(lanes[0]);
  assert.ok(open(g).every((c) => !c.unit || ['juling', 'jian'].includes(c.unit)), 'L2 offers no 土墙/寒/雷 cards');
  assert.ok(open(g).every((c) => kit.unitCards.includes(c)), 'no 山门 spell cards in the 药园');
  const h = fieldOf(lanes[1]);
  h.ling = 50;
  const w = place(h, 'tu', 0, 3);
  h.phase = 'pick'; h.offer = ['u-tu-thick', 'u-ling'];
  pick(h, 'u-tu-thick');
  assert.ok(w.max === 6000 && w.hp === 6000);
  h.phase = 'pick'; h.offer = ['u-ling'];
  const before = h.ling;
  pick(h, 'u-ling');
  assert.equal(h.ling, before + 75);
});
