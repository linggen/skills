// 喂饼 as a 割绳子-style physics puzzle (2026-10-16, design.md § 新小游戏): every level in
// games.json is won by its answer — the order of cuts and puffs, each made with the 饼 hanging
// still (thought, never reflexes) — and its corner is caught on the way; the wrong order misses
// and the level comes back at once; 重来 any time; stuck after a few misses (the page's skip);
// the same world whatever the clock's step; stars on the save, clamped, best kept; the grade
// always opens 分它一半.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as bread from '../scripts/games/bread.js';
import { plans, bot } from '../scripts/games/bots/bread.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { newState } from '../scripts/state.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-10-16T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const GAME = content.games.games.find(g => g.id === 'bread');
const LEVELS = GAME.levels;

/* One level played by hand: each move once the 饼 has hung still `calmMs`, the clock in `step`s. */
function playLevel(level, moves, { step = 10, calmMs = 400, limit = 20000 } = {}) {
  let s = bread.newGame('t', 1, { levels: [level] }), calm = 0, t = 0, i = 0;
  while (t < limit && s.phase === 'play') {
    if (i < moves.length && calm >= calmMs) {
      const [g, v] = moves[i++];
      const k = g === 'cut' ? String(Math.floor(s.swing.vines[v].joints.length / 2)) : undefined;
      s = bread.act(s, { g, v: v == null ? undefined : String(v), k }).state;
      calm = 0;
    }
    s = bread.tick(s, step);
    t += step;
    calm = s.phase === 'play' && s.swing.bread.speed < 0.12 ? calm + step : 0;
  }
  return s;
}

test('the levels are the registry\'s: three or four, three corners, the beat\'s task names it', () => {
  assert.ok(LEVELS.length >= 3 && LEVELS.length <= 4);
  assert.equal(LEVELS.filter(l => l.piece).length, 3);
  assert.equal(GAME.stars, 3);
  assert.equal(content.tasks.tasks.find(t => t.id === GAME.task)?.game, 'bread');
  assert.equal(content.tasks.tasks.find(t => t.id === 'bread-share').stars, 3);
  for (const l of LEVELS) assert.ok(l.say?.zh && l.say?.en, `${l.id} says what to do in both languages`);
  // A stone, a gust and two vines are each met somewhere.
  assert.ok(LEVELS.some(l => l.stones?.length) && LEVELS.some(l => l.gust) && LEVELS.some(l => l.vines.length > 1));
});

for (const level of LEVELS) {
  test(`level ${level.id}: its answer feeds the fox${level.piece ? ' and catches the corner' : ''}, at a 10 ms and a 50 ms clock alike`, () => {
    const fast = playLevel(level, plans[level.id]);
    assert.notEqual(fast.phase, 'play', 'it ends');
    assert.ok(['eat', 'end'].includes(fast.phase) || fast.won, `${level.id}: fed, not ${fast.phase}`);
    assert.equal(fast.got[0], Boolean(level.piece), 'the corner');
    const slow = playLevel(level, plans[level.id], { step: 50 });
    assert.ok(['eat', 'end'].includes(slow.phase) || slow.won, `${level.id} at 50 ms: ${slow.phase}`);
  });
}

test('thought, not reflexes: an answer made a whole second later than it could be still works', () => {
  for (const level of LEVELS) {
    const s = playLevel(level, plans[level.id], { calmMs: 1400 });
    assert.ok(['eat', 'end'].includes(s.phase) || s.won, level.id);
  }
});

test('the wrong order misses, and the level is back at once — a miss counted', () => {
  const two = LEVELS.find(l => l.id === 'two');
  let s = playLevel(two, [['cut', 1], ['cut', 0]], { limit: 9000 });
  assert.equal(s.phase, 'miss');
  assert.equal(s.misses[0], 1);
  assert.match(bread.html(s, 'zh'), /再来/);
  s = bread.tick(s, 800);
  assert.equal(s.phase, 'play', 'laid again');
  assert.equal(s.moves, 0);
  assert.ok(s.swing.vines.every(v => v.cut == null), 'the vines whole again');
});

test('重来 any time: the 饼 back on its vines; a corner caught before is kept', () => {
  const two = LEVELS.find(l => l.id === 'two');
  let s = bread.newGame('t', 1, { levels: [two] });
  s = bread.act(s, { g: 'cut', v: '0', k: '2' }).state;
  assert.equal(s.swing.vines[0].cut, 2);
  assert.equal(bread.act(s, { g: 'cut', v: '0', k: '3' }).state, s, 'a cut vine is not cut again');
  for (let i = 0; i < 60; i++) s = bread.tick(s, 50);
  assert.equal(s.got[0], true, 'the swing passed the corner');
  s = bread.act(s, { g: 'retry' }).state;
  assert.equal(s.phase, 'play');
  assert.ok(s.swing.vines.every(v => v.cut == null));
  assert.equal(s.got[0], true, 'kept');
});

test('stuck once the same level is missed again and again (the page then lays 「算了，往下走」)', () => {
  let s = bread.newGame('t', 1, { levels: LEVELS });
  assert.equal(bread.stuck(s), false);
  s = { ...s, misses: s.misses.map((m, i) => (i === 0 ? bread.STUCK_MISSES : m)) };
  assert.equal(bread.stuck(s), true);
});

test('the whole beat by the board bot: won, three corners, grade half; the ending is the fox\'s', () => {
  const r = playOnce(bread, bot, { seed: 'bot-1', deal: { levels: LEVELS } });
  assert.equal(r.won, true);
  assert.equal(r.grade, 'half');
  let s = bread.newGame('t', 1, { levels: LEVELS });
  // The ending, drawn: the fox's line from the book and the corners kept.
  s = { ...s, phase: 'end', won: true, live: false, stars: 3, grade: 'half', got: [false, true, true, true] };
  assert.match(bread.html(s, 'zh'), /连个谢字也没有/);
  assert.match(bread.html(s, 'zh'), /省下 3 块饼角/);
  assert.match(bread.html({ ...s, stars: 0 }, 'en'), /All the bread went to the fox/);
  assert.equal(bread.gradeOf(0), 'most');
  assert.equal(bread.gradeOf(2), 'half');
});

test('drawn in both languages: vines to cut (tap or swipe), the puff to tap, 重来; no levels draws a quiet card', () => {
  const s = bread.newGame('t', 1, { levels: LEVELS });
  for (const lang of ['zh', 'en']) {
    const h = bread.html(s, lang);
    assert.match(h, /data-g="cut"[^>]*data-g-swipe/);
    assert.match(h, /data-g="retry"/);
    assert.doesNotMatch(h, /算了，往下走/, 'no skip of its own');
  }
  const gusty = bread.newGame('t', 1, { levels: [LEVELS.find(l => l.gust)] });
  assert.match(bread.html(gusty, 'zh'), /data-g="gust"/);
  const none = bread.newGame('t', 1, {});
  assert.equal(none.live, false);
  assert.match(bread.html(none, 'zh'), /洞里/);
  assert.equal(typeof bread.mount, 'function', 'standalone: mount(container, {levels, lang, reducedMotion})');
});

/* ── the rules: stars on the save, the grade's way on, the skip ── */

const atCave = () => {
  let s = newState(content, 'zh', NOW);
  for (const step of TO_VALLEY) { if (s.scene === '00-cave') break; s = walk(s, [step], content, NOW); }
  assert.equal(s.scene, '00-cave');
  return tellOf(content, s)?.keep ?? s;
};

test('the win keeps its stars (clamped to the task\'s three, the best kept), Look shows them, and 分它一半 opens', () => {
  const cave = atCave();
  const l0 = look(cave, content, ctx());
  const t0 = l0.tasks.find(t => t.id === 'bread-share');
  assert.equal(t0.deal.levels.length, LEVELS.length, 'the levels reach the page through Look');
  assert.equal(t0.stars, 0);
  const r = win(cave, content, ctx(), { id: 'bread-share', grade: 'half', stars: '2' });
  assert.equal(r.result.stars, 2);
  assert.equal(r.state.stars['bread-share'], 2);
  assert.equal(win(r.state, content, ctx(), { id: 'bread-share', grade: 'half', stars: 9 }).state.stars['bread-share'], 3, 'clamped');
  assert.equal(win(r.state, content, ctx(), { id: 'bread-share', grade: 'half', stars: 1 }).state.stars['bread-share'], 2, 'the best kept');
  assert.equal(win(cave, content, ctx(), { id: 'bread-share', grade: 'half' }).state.stars, undefined, 'a win sent without stars keeps none');
  for (const grade of ['half', 'most']) {
    const s = task(win(cave, content, ctx(), { id: 'bread-share', grade, stars: 0 }).state, content, ctx(), { action: 'done', id: 'bread-share' }).state;
    assert.equal(look(s, content, ctx()).tasks.find(t => t.id === 'bread-share').stars, 0);
    assert.equal(resolve(s, content, ctx(), { exit: 'share' }).state.scene, '00-yinyue', grade);
  }
});

test('left (「算了，往下走」): no stars, no grade, both ways open', () => {
  const s = task(atCave(), content, ctx(), { action: 'skip', id: 'bread-share' }).state;
  assert.equal(s.stars?.['bread-share'], undefined);
  assert.equal(s.grades?.['bread-share'], undefined);
  assert.equal(resolve(s, content, ctx(), { exit: 'keep' }).state.scene, '00-yinyue');
});
