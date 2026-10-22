// 守墙关 (wall defense) — the level file is sound (卷一 beasts only, 8–10 waves, about ten cards, words in both
// languages), the engine plays headless with bots and the balance holds (a sensible build wins, random picks win
// sometimes, never picking loses), the waves come on their own, and what Phaser draws exists: the bundle is current,
// Phaser is the one shared vendored build, every picture it asks for is there, the font covers every word.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BOTS, HAND, W, canPlace, firstLane, towardHim, cellAt, collect, hurt, newGame, offerCards, open, opening, pick, place, reachY, setFocus, sim, step, stars } from '../scripts/games/shouqiang/core.js';
import { levelAsked, meta } from '../scripts/games/shouqiang.js';
import { sourceHash } from '../tools/shouqiang/hash.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
const kit = JSON.parse(readFileSync(at('worlds/jiuding/levels/shouqiang.json'), 'utf8'));
const level = kit.levels[0];
const reg = JSON.parse(readFileSync(at('worlds/jiuding/games.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const SEEDS = Array.from({ length: 12 }, (_, i) => `s${i}`);
const advance = (g, secs) => { for (let t = 0; t < secs; t += 0.1) step(g, 0.1); };
const run = (bot, line) => SEEDS.map((seed) => sim(kit, level, BOTS[bot], { seed, open: line }));
const LINES = ['jian', 'huo', 'lei'];
// Through the lead-in and the opening pick (the 剑阵 line unless told), to the first moment of wave 1.
const toWave1 = (g, line = 'jian') => { advance(g, level.leadSec + 0.2); pick(g, `open-${line}`); advance(g, level.countIn + 0.2); return g; };

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

// Hanli 10-20 after playing: 「守墙第一关玩家啥也做不了. 可否上来先选一个基础攻击?」 — the lead-in, then the opening pick
// (小满's main attack: 剑阵, 火符 or 雷符), waiting with nothing on the road; then the 3-2-1 and wave 1.
test('the opening: after the lead-in the game waits on a pick of three main attacks, then counts into wave 1', () => {
  assert.deepEqual(kit.opening.lines.map((l) => l.line), LINES);
  for (const l of kit.opening.lines) {
    assert.ok(l.name.zh && l.name.en && l.say.zh && l.say.en && l.icon, l.id);
    assert.equal(kit.cards.find((c) => c.id === l.gives)?.family, l.line, `${l.id} gives its line's card`);
  }
  assert.ok(kit.levels.filter((l) => l.grid).every((l) => l.opening === false), 'the 药园 is marked off: talismans from the first second');
  assert.ok(level.countIn >= 3 && level.countIn <= 4, 'a 3-2-1 after the pick');
  for (const line of LINES) {
    const g = newGame(kit, level, { seed: `open-${line}` });
    advance(g, level.leadSec + 0.2);
    assert.equal(g.phase, 'pick');
    assert.ok(opening(g));
    assert.deepEqual(g.offer, ['open-jian', 'open-huo', 'open-lei']);
    assert.ok(g.events.some((e) => e.t === 'offer' && e.opening));
    advance(g, 30);
    assert.equal(g.phase, 'pick', 'no timer on it');
    assert.equal(g.wave, 0);
    assert.equal(g.beasts.length + g.spawns.length, 0, 'nothing on the road while it is up');
    assert.ok(pick(g, `open-${line}`));
    assert.equal(g.main, line);
    const gives = kit.opening.lines.find((l) => l.line === line).gives;
    assert.deepEqual(g.skills, { [gives]: 1 }, 'the line at level 1');
    assert.equal(g.phase, 'count');
    advance(g, level.countIn - 0.3);
    assert.equal(g.phase, 'count');
    advance(g, 0.5);
    assert.equal(g.phase, 'wave');
    // Only that line fires: swords on the 剑阵 line alone, the talisman on its own.
    const kinds = new Set();
    for (let i = 0; i < 600 && g.phase === 'wave'; i += 1) { step(g, 1 / 30); for (const e of g.events) if (e.t === 'cast' && e.who === 'xm') kinds.add(e.kind); g.events.length = 0; }
    assert.deepEqual([...kinds], [{ jian: 'sword', huo: 'huo', lei: 'lei' }[line]], `${line}: ${[...kinds]}`);
  }
  // The lazy bot (null), or anything that is not a line, takes the first line: today's swords.
  for (const id of [null, 'huo-blast']) {
    const g = newGame(kit, level, { seed: 'lazy-open' });
    advance(g, level.leadSec + 0.2);
    assert.ok(pick(g, id));
    assert.equal(g.main, 'jian');
  }
});

test('the first wave comes on its own after the opening; the game only waits on a pick', () => {
  const g = newGame(kit, level, { seed: 'auto' });
  assert.equal(g.phase, 'lead');
  toWave1(g);
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

test('the first between-wave offers lean to the opening line: two of its family, then one, then any', () => {
  for (const line of LINES) {
    let first = 0, second = 0;
    for (let i = 0; i < 20; i += 1) {
      const g = toWave1(newGame(kit, level, { seed: `lean-${line}-${i}` }), line);
      const fam = () => offerCards(g).filter((id) => kit.cards.find((c) => c.id === id).family === line).length;
      g.wave = 1; first += fam() >= 2 ? 1 : 0;
      g.wave = 2; second += fam() >= 1 ? 1 : 0;
    }
    assert.equal(first, 20, `${line}: two of its family in the first offer`);
    assert.equal(second, 20, `${line}: one in the second`);
  }
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
  const g = toWave1(newGame(kit, level, { seed: 'focus' }));
  advance(g, 3);
  const b = g.beasts[0];
  assert.equal(setFocus(g, b.id), b.id);
  assert.equal(setFocus(g, 99999), null);
});

test('balance: never picking loses on every opening line; random picks lose some; the sensible build wins every seed', () => {
  for (const line of LINES) {
    const lazy = run('lazy', line);
    assert.ok(lazy.every((r) => !r.won && r.wave <= 6), `lazy on ${line} reached waves ${lazy.map((r) => r.wave)}`);
  }
  const SEEDS40 = Array.from({ length: 40 }, (_, i) => `s${i}`);
  const random = SEEDS40.map((seed) => sim(kit, level, BOTS.random, { seed })), greedy = run('greedy');
  const rw = random.filter((r) => r.won).length, r3 = random.filter((r) => r.stars === 3).length;
  assert.ok(rw <= 39 && r3 <= 32, `random won ${rw}/40, ${r3} with 3 stars: the cards must matter`);
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

// 《向僵尸开炮》's starting weapon: whichever line a first-timer opens with, level 1 is winnable with sensible play.
test('balance per opening line: the sensible build and the human-like bot win level 1 on each of 剑阵, 火符, 雷符', () => {
  const SEEDS30 = Array.from({ length: 30 }, (_, i) => `p${i}`);
  for (const line of LINES) {
    const greedy = SEEDS30.map((seed) => sim(kit, level, BOTS.greedy, { seed, open: line }));
    const human = SEEDS30.map((seed) => sim(kit, level, BOTS.human, { seed, open: line }));
    const gw = greedy.filter((r) => r.won).length, hw = human.filter((r) => r.won).length;
    assert.ok(gw >= 27, `${line}: greedy won ${gw}/30`);
    assert.ok(hw >= 22, `${line}: human won ${hw}/30`);
    assert.ok(human.every((r) => r.main === line));
  }
});

test('difficulty is one knob in the data: more beasts and more hp a wave', () => {
  assert.equal(level.difficulty, 1);
  const wave1 = (k) => {
    const g = newGame(kit, { ...level, difficulty: k }, { seed: 'k' });
    advance(g, level.leadSec + 0.2);
    pick(g, 'open-jian');
    advance(g, level.countIn + 0.05);
    return { n: g.spawns.length + g.beasts.length, hp: g.spawns[0]?.mul };
  };
  const a = wave1(1), b = wave1(1.5);
  assert.ok(b.n > a.n && b.hp > a.hp, JSON.stringify({ a, b }));
});

// Hanli 10-20: 「让怪出现在攻击范围外, 让玩家能看到」 — the horde walks in above the range line in plain view.
test('the range line: nothing is hurt above it; the boss stops above it to roar, then walks into reach', () => {
  const R = reachY({ level });
  // Hanli 10-20: 「攻击范围都有点小, 怪物露头就可以开打了」 — the line sits ~15–20% down: a beast is seen walking in for
  // about a second, then it can be hit.
  assert.ok(R >= 0.15 * 960 && R <= 0.2 * 960, `the line ~17% down: ${R}`);
  const seenFor = (R - 80) / kit.beasts.yezhu.speed; // from under the top bar (~80) to the line
  assert.ok(seenFor > 0.8 && seenFor < 3, `a 野猪 is seen ~1–2 s before it can be hit: ${seenFor.toFixed(1)} s`);
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
  const g = toWave1(newGame(kit, level, { seed: 'above' }));
  advance(g, 0.8);
  const b = g.beasts[0];
  assert.ok(b.y < R);
  assert.equal(hurt(g, b, 999, 'thunder'), 0, 'a beast above the line takes nothing');
});

// Hanli 10-20: 「小满的剑别对着自己, 剑往回飞也不太合理」 — 回剑 became 回旋: a sword that struck arcs on across the road.
test('swords never point at 小满 (they launch from his raised hand); 回旋 arcs to a second beast and dissolves up the road', () => {
  const arc = kit.cards.find((c) => c.id === 'jian-arc');
  assert.ok(arc && !kit.cards.some((c) => c.id === 'jian-return'));
  assert.match(arc.name.zh, /回旋/);
  let swords = 0, arcing = 0, fades = 0, arcHits = 0;
  for (const seed of ['a1', 'a2']) {
    const g = newGame(kit, level, { seed });
    while (!['won', 'lost'].includes(g.phase) && g.t < 900) {
      if (g.phase === 'pick') pick(g, opening(g) ? 'open-jian' : g.offer.includes('jian-arc') ? 'jian-arc' : BOTS.greedy(g)); else step(g, 1 / 60);
      for (const s of g.shots) {
        if (s.kind !== 'sword') continue;
        swords += 1;
        assert.ok(!towardHim(s), `a sword pointing at 小满 from ${Math.round(s.x)},${Math.round(s.y)} (v ${Math.round(s.vx)},${Math.round(s.vy)})`);
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
    ...kit.cards.map((c) => `icon-${c.id}`),
    // the 药园: its field and wall, each talisman's two frames and seed card, the 灵气 orb, every lane card's icon
    ...kit.levels.flatMap((l) => (l.art ? Object.values(l.art).filter((v) => typeof v === 'string') : [])), 'orb',
    // a story level's own cards (守白菜's 竹竿) and its beasts' every frame
    ...kit.levels.flatMap((l) => (l.cards ?? []).map((c) => c.icon)),
    ...Object.keys(kit.units).filter((k) => !k.startsWith('_')).flatMap((u) => [`unit-${u}`, `unit-${u}-2`, `seed-${u}`]),
    ...kit.unitCards.map((c) => c.icon)];
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
const lanes = kit.levels.filter((l) => l.grid && !l.tide && !l.story); // the 药园 levels (兽潮's `tide` rows stand on the 山门, rules/shouchao.mjs; a `story` row is the story's)
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
  for (const x of lanes) {
    assert.ok(x.rangeY >= 0.15 * 960 && x.rangeY <= 0.21 * 960, `${x.id}: the line ~20% down (${x.rangeY})`);
    const seen = (x.rangeY - 160) / (kit.laneBeasts.yezhu.speed * x.approach); // from under the seed bar (~160)
    assert.ok(seen > 0.6 && seen < 2, `${x.id}: seen ~1 s before it can be hit: ${seen.toFixed(1)} s`);
  }
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
  const target = [[0.95, 1], [0.75, 1], [0.55, 0.95], [0.45, 0.9]]; // 40 seeds; measured over 60: see games.md
  const got = [];
  for (const [i, l] of lanes.entries()) {
    assert.ok(laneRun(l, 'lazy', 6).every((r) => !r.won), `${l.id}: the heroes alone never hold it`);
    const human = laneRun(l, 'human', 40), sharp = laneRun(l, 'sharp', 24);
    got.push(rate(human));
    assert.ok(rate(human) >= target[i][0] && rate(human) <= target[i][1], `${l.id}: the human bot won ${Math.round(rate(human) * 100)}%`);
    assert.ok(rate(sharp) >= 0.8, `${l.id}: a sharp player wins (${Math.round(rate(sharp) * 100)}%)`);
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

// Hanli 10-20: 「守药园, 所有开场野猪都走中路呢?」 (option A): a first wave down one fixed bed keeps it, and says so — the
// bed is marked and a line names it. Read from the waves, so any level whose first wave keeps to one bed gets it.
test('the first wave down one bed: read from the wave data, and a level that does it has a line naming it', () => {
  assert.equal(firstLane(level), null, 'the 山门 has no beds');
  assert.equal(firstLane({ grid: {}, waves: [[['yezhu', 3, 12, 24, 1], ['zheng', 1, 1, 30, 1]]] }), 1);
  assert.equal(firstLane({ grid: {}, waves: [[['yezhu', 3, 12, 24, 1], ['zheng', 1, 1, 30, 2]]] }), null, 'two beds');
  assert.equal(firstLane({ grid: {}, waves: [[['yezhu', 3, 12, 24, [1, 2]]]] }), null, 'a drawn bed');
  assert.equal(firstLane({ grid: {}, waves: [[['yezhu', 3, 12, 24]]] }), null, 'no bed given');
  const one = lanes.filter((l) => firstLane(l) != null);
  assert.ok(one.length >= 1);
  for (const l of one) assert.ok(l.moments.lane?.length && l.moments.lane.every((x) => x.zh && x.en), `${l.id}: moments.lane`);
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

// The 调息 cut (2026-10-20, Hanli: 「调息感觉太多了」 → 「可以」): 09-furnace's board is 守墙关's story row 药园巡夜 · 开春.
test('the story row 药园巡夜 · 开春 (09-furnace): 野猪 and 狰 only, off the 兽潮 and the ladder, won by a first-timer most nights', async () => {
  const row = kit.levels.find((l) => l.id === 'yaoyuan-spring');
  assert.equal(row.story, '09-furnace');
  assert.equal(row.tide, undefined, 'never a 兽潮 night');
  const { tideRows } = await import('../scripts/rules/shouchao.mjs');
  assert.ok(!tideRows(kit).includes(row), '兽潮 skips a story row');
  assert.deepEqual([...new Set(row.waves.flat().map(([b]) => b))].sort(), ['yezhu', 'zheng'], '犰狳 first comes at 09-lingcao, the next scene');
  assert.ok(row.lead.some((l) => l.big && l.zh.includes('兽潮来袭')) && row.lead.every((l) => l.zh && l.en));
  assert.ok(kit.levels.slice(kit.levels.indexOf(row)).every((l) => l.story), 'with the story rows, after the ladder: the ladder\'s numbers (lv=1…) stand');
  const t = JSON.parse(readFileSync(at('worlds/jiuding/tasks/h11.json'), 'utf8')).tasks.find((x) => x.id === 'furnace-ding');
  assert.deepEqual([t.game, t.deal.lv], ['shouqiang', 'yaoyuan-spring']);
  const rate = (bot, n) => laneRun(row, bot, n).filter((r) => r.won).length / n;
  assert.ok(laneRun(row, 'lazy', 4).every((r) => !r.won), 'the heroes alone never hold it');
  const human = rate('human', 20);
  assert.ok(human >= 0.8, `a first-timer wins most nights (${Math.round(human * 100)}%)`);
  assert.ok(rate('sharp', 12) >= 0.8, 'a sharp player wins');
});

/* 守白菜 (00-baicai, 2026-10-21, Hanli: 第一回 adds two 塔防 boards — 「用塔防作为主力」): the player's first 塔防. 阿禾's
   芦花鸡 through the 篱笆 toward her cabbage; 阿禾 pokes (the 剑阵 line, named 竹竿), 小满 beside her throws clods (the bolt
   beside the hero); no opening pick, no 结印, a hidden range line; one card after the first wave, of the 竹竿's three. */
test('守白菜: a story row of 00-baicai — hens only, two waves, one pick of the 竹竿\'s three, no opening, no spell', async () => {
  const row = kit.levels.find((l) => l.id === 'baicai');
  assert.equal(row.story, '00-baicai');
  const { tideRows } = await import('../scripts/rules/shouchao.mjs');
  assert.ok(!tideRows(kit).includes(row), '兽潮 skips a story row');
  assert.deepEqual([...new Set(row.waves.flat().map(([b]) => b))], ['luhuaji']);
  assert.ok(kit.beasts.luhuaji.shoo, 'a hen beaten is chased off, not killed');
  assert.equal(row.waves.length, 2);
  assert.equal(opening(newGame(kit, row, { seed: 'b' })), false, 'no opening pick: 阿禾 pokes from the first hen');
  const g = newGame(kit, row, { seed: 'b' });
  advance(g, row.leadSec + 0.2);
  while (g.phase !== 'pick' && g.phase !== 'won' && g.phase !== 'lost') step(g, 0.1);
  assert.equal(g.phase, 'pick', 'one pick, after the first wave');
  assert.deepEqual([...g.offer].sort(), row.cards.map((c) => c.id).sort(), 'the 竹竿\'s three');
  for (const c of row.cards) assert.ok(c.name.zh.includes('竹竿') && c.name.en && c.say.zh && c.say.en && c.icon);
  const t = JSON.parse(readFileSync(at('worlds/jiuding/tasks/world.json'), 'utf8')).tasks.find((x) => x.id === 'baicai-hens');
  assert.deepEqual([t.game, t.deal.lv], ['shouqiang', 'baicai']);
  assert.ok(row.lead.some((l) => l.big) && row.lead.every((l) => l.zh && l.en));
  for (const k of ['won', 'lost', 'wallLeft', 'kills', 'focus']) assert.ok(row.words[k].zh && row.words[k].en, k);
  assert.ok(row.teach.length && Object.keys(row.moments).every((m) => row.teach.includes(m)), 'every line the level\'s own: 银月 is not met yet');
});
test('守白菜, gentle: any card the first-timer takes wins; the sensible hand keeps the cabbage; taking none loses; about a minute', () => {
  const row = kit.levels.find((l) => l.id === 'baicai');
  const S30 = Array.from({ length: 30 }, (_, i) => `bc${i}`);
  const go = (bot) => S30.map((seed) => sim(kit, row, BOTS[bot], { seed }));
  const human = go('human'), random = go('random'), lazy = go('lazy');
  assert.ok(human.every((r) => r.won) && human.filter((r) => r.stars === 3).length >= 24, `human ★ ${human.map((r) => r.stars).join('')}`);
  assert.ok(random.every((r) => r.won), `any card wins: ★ ${random.map((r) => r.stars).join('')}`);
  assert.ok(random.some((r) => r.stars < 3), 'but the pick matters');
  assert.ok(lazy.every((r) => !r.won), 'no card at all: the hens get the cabbage');
  assert.ok(human.every((r) => r.t >= 40 && r.t <= 70), `about a minute: ${human.map((r) => r.t)}`);
});

/* 抬鹿下山 (00-tailu, the 卷一 plan, 2026-10-22; Hanli 10-22: 「按你说的改一遍. 关键是能留住玩家」): the third 塔防 a player
   meets, 第二回's. 00-deer's way on, split at 「那副门板，到底没有白扛，抬了一头鹿。」: 野猪 drawn by the blood down the two trails
   either side of the 溪 (`paths`) at the 门板 with the stag on it; 小满 with 爷爷's bow, 老周 throwing stones beside him; 银月 has
   fainted in his shirt, so every line is the level's own. */
test('抬鹿下山: a story row of 00-tailu — 野猪 down the two trails at the 门板, the bow\'s three cards, no opening, no 结印', async () => {
  const row = kit.levels.find((l) => l.id === 'tailu');
  assert.equal(row.story, '00-tailu');
  const { tideRows } = await import('../scripts/rules/shouchao.mjs');
  assert.ok(!tideRows(kit).includes(row), '兽潮 skips a story row');
  assert.deepEqual([...new Set(row.waves.flat().map(([b]) => b))], ['yezhu']);
  assert.equal(row.paths.length, 2, 'two trails, either side of the stream');
  assert.equal(opening(newGame(kit, row, { seed: 't' })), false, 'no opening pick');
  assert.equal(row.jieyin, false, 'no 结印 before 入门');
  const g = newGame(kit, row, { seed: 't' });
  const xs = new Map();
  for (let t = 0; t < 120 && g.phase !== 'won' && g.phase !== 'lost'; t += 0.1) {
    step(g, 0.1);
    if (g.phase === 'pick') pick(g, g.offer[0]);
    for (const b of g.beasts) if (!xs.has(b.id)) xs.set(b.id, b.x);
  }
  assert.ok(xs.size >= 10, `beasts came: ${xs.size}`);
  for (const [id, x] of xs) assert.ok(row.paths.some((p) => Math.abs(x - p) <= 26), `beast ${id} down a trail (x ${Math.round(x)})`);
  for (const c of row.cards) assert.ok(c.name.zh.includes('爷爷的弓') && c.name.en && c.say.zh && c.say.en && c.icon);
  const t = JSON.parse(readFileSync(at('worlds/jiuding/tasks/world.json'), 'utf8')).tasks.find((x) => x.id === 'deer-carry');
  assert.deepEqual([t.game, t.deal.lv], ['shouqiang', 'tailu']);
  const hall = reg.games.find((x) => x.id === 'shouqiang' && x.task === 'deer-carry');
  assert.ok(hall && hall.scene === '00-tailu' && hall.group === 'h02' && hall.data.lv === 'tailu', 'the 游戏厅 row opens it by id');
  assert.ok(row.lead.some((l) => l.big) && row.lead.every((l) => l.zh && l.en));
  for (const k of ['won', 'lost', 'wallLeft', 'kills', 'focus']) assert.ok(row.words[k].zh && row.words[k].en, k);
  assert.ok(row.teach.length && Object.keys(row.moments).every((m) => row.teach.includes(m)), 'every line the level\'s own: 银月 has fainted');
});
test('抬鹿下山, gentle (第二回): the first-timer\'s hand and any card win; taking none loses; a minute and a half', () => {
  const row = kit.levels.find((l) => l.id === 'tailu');
  const S30 = Array.from({ length: 30 }, (_, i) => `bc${i}`);
  const go = (bot) => S30.map((seed) => sim(kit, row, BOTS[bot], { seed }));
  const human = go('human'), random = go('random'), lazy = go('lazy');
  assert.ok(human.every((r) => r.won) && human.filter((r) => r.stars === 3).length >= 24, `human ★ ${human.map((r) => r.stars).join('')}`);
  assert.ok(random.every((r) => r.won), `any card wins: ★ ${random.map((r) => r.stars).join('')}`);
  assert.ok(lazy.every((r) => !r.won), 'no card at all: the boars overturn the door');
  assert.ok(human.every((r) => r.t >= 60 && r.t <= 120), `a minute and a half: ${human.map((r) => r.t)}`);
});
