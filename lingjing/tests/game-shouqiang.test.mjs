// 守墙关 (wall defense) — the level file is sound (卷一 beasts only, 8–10 waves, about ten cards, words in both
// languages), the engine plays headless with bots and the balance holds (a sensible build wins, random picks win
// sometimes, never picking loses), the waves come on their own, and what Phaser draws exists: the bundle is current,
// Phaser is the one shared vendored build, every picture it asks for is there, the font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, newGame, offerCards, open, pick, setFocus, sim, step, stars } from '../scripts/games/shouqiang/core.js';
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
  assert.ok(greedy.every((r) => r.stars >= 2), 'a sensible build keeps most of the wall');
  assert.ok(greedy.some((r) => r.wallLeft < 0.95), 'and still feels the pressure');
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
