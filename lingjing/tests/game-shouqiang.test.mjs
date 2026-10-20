// 守墙关 (wall defense) — the level file is sound (卷一 beasts only, 8–10 waves, about ten cards, words in both
// languages), the engine plays headless with bots and the balance holds (a sensible build wins, random picks win
// sometimes, never picking loses), the waves come on their own, and what Phaser draws exists: the bundle is current,
// Phaser is the one shared vendored build, every picture it asks for is there, the font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, hurt, newGame, offerCards, open, pick, reachY, setFocus, sim, step, stars } from '../scripts/games/shouqiang/core.js';
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
