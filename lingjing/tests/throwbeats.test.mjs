// The throws of 卷一 on the one throwing board (2026-10-16, Hanli: 「投掷类都可以换」): 扔石听声 (caveecho —
// two stones, the echo deep; off 00-cave since 2026-10-19, the 游戏厅's) and 芦苇里那一等 (09-yishui, luwing — the 短飞剑 into the 鯥's wing
// root as it breathes in). Each level is won by the bot's aim at a 10 ms and a 50 ms clock; a stone
// that lands shallow is a hit a star fewer; a blade on the hide is turned; the grades name the
// tasks' marks; the story deals each its levels; the throw moments are listed with the book's lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cave from '../scripts/games/caveecho.js';
import * as lu from '../scripts/games/luwing.js';
import { solve } from '../scripts/games/bots/deerarc.js';
import { bot } from '../scripts/games/bots/caveecho.js';
import { flight, levelNow } from '../scripts/games/deerarc.js';
import { luAt } from '../scripts/games/targets.js';
import { projectileOf } from '../scripts/games/throws.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const PROJ = content.games.projectiles;
const row = (id) => content.games.games.find((g) => g.id === id);
const deal = (levels) => ({ levels, projectiles: PROJ });

/** One throw on a module: wait to `at`, draw, loose, tap at `tapAt` steps, play out on a `step` clock. */
function throwOnce(mod, lv, aim, { step = 10, at = 0 } = {}) {
  let s = mod.newGame('t', 1, deal([lv]));
  while (s.clock < at) s = mod.tick(s, step);
  s = mod.act(mod.act(s, { g: 'draw', ...aim }).state, { g: 'loose' }).state;
  for (let i = 0; i < 2000 && s.phase === 'fly'; i++) {
    if (aim.tapAt != null && s.world.arrow && !s.world.arrow.tapped && s.world.arrow.steps >= aim.tapAt) s = mod.act(s, { g: 'tap' }).state;
    if (s.phase === 'fly') s = mod.tick(s, step);
  }
  return s;
}

test('the throw moments of 卷一 are listed with the book\'s lines; three built (扔石听声, 射鹿, 鯥), the rest proposed', () => {
  const note = content.games._throws;
  for (const line of ['先往里扔了一块石头', '往左偏半寸', '从那块粉红的肉里钻了进去', '往左边黑里一丢', '飞剑头一下奔它的眼睛']) assert.ok(note.includes(line), line);
  assert.equal((note.match(/BUILT/g) ?? []).length, 3);
  assert.ok((note.match(/PROPOSED/g) ?? []).length >= 3);
});

for (const [mod, id] of [[cave, 'caveecho'], [lu, 'luwing']]) {
  for (const lv of row(id).levels) {
    test(`${id} ${lv.id}: a clean throw found, and it lands at a 10 ms and a 50 ms clock`, () => {
      const proj = projectileOf(PROJ, lv.ammo[0]);
      for (const step of [10, 50]) {
        let s = mod.newGame('t', 1, deal([lv]));
        while (s.clock < 600) s = mod.tick(s, step);
        const aim = solve(levelNow(s), s.clock, proj); // this throw's rolled wind
        assert.ok(aim, `${id} ${lv.id}: a clean throw at ${s.clock} ms`);
        const r = throwOnce(mod, lv, aim, { step, at: s.clock });
        assert.equal(r.phase, 'hit', `${id} ${lv.id} at ${step} ms: ${r.phase} (${r.said})`);
      }
    });
  }
}

test('扔石听声: deep is the echo; a stone that comes down shallow is a hit a star fewer; one that bounces off the roof still lands and is judged', () => {
  const lv = row('caveecho').levels[0], stone = projectileOf(PROJ, 'stone');
  let shallow = null;
  for (let a = 4; a <= 60 && !shallow; a += 4) for (let p = 0.15; p <= 1 && !shallow; p += 0.03) if (flight(lv, { a, p }, 0, 600, { proj: stone }).hit === 'body') shallow = { a, p };
  assert.ok(shallow, 'a shallow landing exists');
  const s = cave.tick(throwOnce(cave, lv, shallow), 300);
  assert.equal(s.phase, 'hit');
  assert.equal(s.best[0], 2, 'one stone, shallow: two stars');
  assert.match(cave.html(s, 'zh'), /笃的一声/);
  assert.match(cave.html(s, 'zh'), /g-tg-echo/, 'the echo, not an ink bloom');
  const steep = flight(lv, { a: 60, p: 0.9 }, 0, 600, { proj: stone });
  assert.notEqual(steep.end, 'wall', 'the roof bounces it; it flies on and comes down');
});

test('鯥: the hide turns the blade while the wing root is shut; the next throw at once, and the words say wait', () => {
  const lv = row('luwing').levels[0], sword = projectileOf(PROJ, 'sword');
  const shutAt = [0, 200, 400].find((ms) => luAt(lv, ms + 600).open < 0.1);
  let glance = null;
  for (let a = 4; a <= 60 && !glance; a += 2) for (let p = 0.2; p <= 1 && !glance; p += 0.02) if (flight(lv, { a, p }, shutAt, 600, { proj: sword }).end === 'glance') glance = { a, p };
  assert.ok(glance);
  const s = throwOnce(lu, lv, glance, { at: shutAt });
  assert.equal(s.phase, 'aim', 'turned: no pause');
  assert.match(lu.html(s, 'zh'), /弹开了/);
  assert.ok(luAt(lv, 2400 - 700 + 300).open > 0.5 && luAt(lv, 100).open === 0, 'it opens, briefly, every breath');
});

test('the grades name the tasks\' marks: 扔石听声 sure · lucky, 鯥 still · hasty', () => {
  for (const [mod, id, three, one] of [[cave, 'caveecho', 'sure', 'lucky'], [lu, 'luwing', 'still', 'hasty']]) {
    const task = content.tasks.tasks.find((t) => t.game === id);
    assert.ok(task.marks[three] && task.marks[one], `${id}: ${Object.keys(task.marks)}`);
    let s = mod.newGame('t', 1, deal(row(id).levels));
    s = { ...s, best: s.best.map(() => 3), li: s.levels.length - 1, phase: 'clear', t: 0 };
    assert.equal(mod.act(s, { g: 'next' }).state.grade, three);
    s = { ...s, best: s.best.map(() => 1) };
    assert.equal(mod.act(s, { g: 'next' }).state.grade, one);
  }
});

test('the story deals the 鯥 at 09-yishui with the 短飞剑; 扔石听声 is the 游戏厅\'s only since 2026-10-19 (00-cave plays 喂饼 alone)', () => {
  const caveScene = content.chapters['00-prologue'].scenes['00-cave'];
  assert.deepEqual(caveScene.show.filter((c) => c.card === 'board').map((c) => c.id), ['bread-share']);
  assert.ok(caveScene.story.zh.includes('火镰'), 'the passage whole: the stones, then the fire');
  assert.equal(row('caveecho').task, 'cave-stone', 'the row and its task stay');
  assert.equal(content.tasks.tasks.find((t) => t.id === 'yishui-reed').game, 'luwing');
  assert.equal(row('reed').task, undefined, 'the old reed board is the 游戏厅\'s only');
});

test('the whole cave by the bot', () => {
  const r = playOnce(cave, bot, { seed: 'cave-1', deal: deal(row('caveecho').levels) });
  assert.equal(r.won, true);
  assert.ok(['sure', 'lucky'].includes(r.grade));
});

test('a throw row says its own end and its own empty hand — the cave is no stream of deer (2026-10-19 live play)', () => {
  for (const [mod, id] of [[cave, 'caveecho'], [lu, 'luwing']]) {
    const r = row(id);
    let s = mod.newGame('t', 1, { ...deal(r.levels), words: r.words });
    s = { ...s, won: true, stars: 3 };
    const end = mod.html(s, 'zh');
    assert.ok(end.includes(r.words.end.zh), `${id}: its own end line`);
    assert.ok(!/溪边.处/.test(end), `${id}: not the deer's`);
    assert.ok(mod.html(s, 'en').includes(r.words.end.en), `${id}: en`);
  }
});
