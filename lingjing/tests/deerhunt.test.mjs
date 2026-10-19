// 射鹿 · 等风, the hunting-aim board (2026-10-19, games/deerhunt.js; Hanli: 「愤怒小鸟的类型不好玩」): the
// patient hand wins every level at a 10 ms and a 50 ms clock alike; the impatient hand spooks the
// story's deer; the idle hand never wins; the wind carries a gust shot and the line names the side;
// the breath steadies the sight and then it shakes worse; a loose with the head up jumps the string;
// a walking deer wants a lead; stars by heart · first arrow · calm; and a story win would still give
// deer-wind its card — while deer-wind keeps playing deerarc until Hanli has played this in the 游戏厅.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as dh from '../scripts/games/deerhunt.js';
import { handOf } from '../scripts/games/bots/deerhunt.js';
import { loadContent } from '../scripts/content.mjs';
import { task, win } from '../scripts/rules.mjs';
import { newState } from '../scripts/state.mjs';
import { TO_HALL, walk } from './prologue.mjs';

const content = loadContent();
const ROW = content.games.games.find((g) => g.id === 'deerhunt');
const byId = (id) => ROW.levels.find((l) => l.id === id);
const STORY = byId('story');

/** A hand plays the levels on a `step` clock: it looks every 50 ms, its act lands `react` ms later. */
function play(levels, hand, { step = 10, seed = 't', react = 200, limit = 120000 } = {}) {
  let s = dh.newGame(seed, 1, { levels, still: true }), t = 0, pending = null, look = 0;
  const log = { spooks: 0, shots: 0 };
  while (t < limit && !s.won) {
    if (pending && t >= pending.at) {
      const a = pending.a;
      s = dh.act(s, a.hold ? { ...a.hold, g: 'hold' } : a.release ? { g: 'release' } : a).state;
      pending = null;
    }
    if (!pending && t >= look) { const a = hand(s, { lead: react }); if (a) pending = { a, at: t + react }; look = t + 50; }
    s = dh.tick(s, step);
    t += step;
  }
  return { s, ms: t, won: s.won };
}

test('the row: the 游戏厅\'s only — four levels (story · walk · gusty · dusk), 射鹿\'s paintings, 狩猎瞄准; deer-wind still plays deerarc', () => {
  assert.deepEqual(ROW.levels.map((l) => l.id), ['story', 'walk', 'gusty', 'dusk']);
  assert.equal(ROW.task, undefined, 'not wired into the story until Hanli has played it');
  assert.equal(ROW.scene, undefined);
  assert.equal(ROW.art, 'deerarc');
  assert.equal(ROW.mechanic, '狩猎瞄准');
  assert.equal(content.tasks.tasks.find((t) => t.id === 'deer-wind').game, 'deerarc');
  assert.ok(STORY.story && ROW.levels.filter((l) => l.story).length === 1, 'one level for the story');
  for (const l of ROW.levels) assert.ok(l.say?.zh && l.say?.en, `${l.id} says what to do`);
  assert.ok(byId('walk').deer.walk > 0.5 && byId('dusk').dusk > 0);
});

// The coordinator's lesson from the old 射鹿 (10-19): an in-board 往下 read as "done, go on".
test('no in-board step says 往下 · 接着 · 继续; a level step says 下一处', () => {
  let s = dh.newGame('w', 1, { levels: ROW.levels, still: true });
  const words = JSON.stringify(dh.meta) + dh.html(s, 'zh');
  assert.doesNotMatch(words, /往下|接着|继续/);
  const r = play([STORY, byId('walk')], handOf(), { limit: 180000 });
  assert.ok(r.s.li === 1 || r.won, 'the story level was cleared');
  const clear = dh.html({ ...s, phase: 'clear', best: [2, 0, 0, 0] }, 'zh');
  assert.match(clear, /下一处/);
  assert.doesNotMatch(clear, /往下|接着|继续/);
});

for (const level of ROW.levels) {
  test(`level ${level.id}: the patient hand wins at a 10 ms and a 50 ms clock`, () => {
    for (const step of [10, 50]) {
      let won = 0;
      for (const seed of ['a', 'b', 'c']) if (play([level], handOf(), { step, seed }).won) won++;
      assert.ok(won >= 2, `${level.id} at ${step} ms: won ${won}/3`);
    }
  });
}

test('the clock does not matter: the wind and the deer at 6 s are the same on a 10 ms and a 50 ms clock', () => {
  const at = (step) => { let s = dh.newGame('c', 1, { levels: [byId('walk')] }); while (s.clock < 6000) s = dh.tick(s, step); return s; };
  const a = at(10), b = at(50);
  assert.ok(Math.abs(a.clock - b.clock) < 60);
  const a2 = dh.tick(a, 0), sameClock = Math.abs(a.clock - b.clock) < 1;
  if (sameClock) assert.deepEqual(a2.deer, b.deer);
  assert.equal(dh.windAt(STORY, 'c', 4321), dh.windAt(STORY, 'c', 4321));
});

test('the impatient hand (draws at once, looses at full) spooks the story\'s deer; the idle hand never wins', () => {
  let spooked = 0;
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (const seed of seeds) if (play([STORY], handOf({ patient: false }), { seed, limit: 40000 }).s.spooksAll > 0) spooked++;
  assert.ok(spooked >= 6, `spooked in ${spooked}/8`);
  for (const step of [10, 50]) assert.equal(play([STORY], () => null, { step, limit: 120000 }).won, false);
});

/** A fresh story board at `ms`, its deer set by `deer` (a test's own), drawn to full and aimed at `aim`. */
function drawn(over = {}, ms = 0) {
  let s = dh.newGame('x', 1, { levels: [{ ...STORY, wind: null, ...over }], still: true });
  while (s.clock < ms) s = dh.tick(s, 10);
  s = dh.act(s, { g: 'hold' }).state;
  while (dh.powerOf(s) < 1) s = dh.tick(s, 10);
  return s;
}
const fly = (s) => { s = dh.act(s, { g: 'release' }).state; for (let i = 0; i < 300 && s.phase === 'fly'; i++) s = dh.tick(s, 10); return s; };

test('the heart in a calm: a clean hit, three stars, the ink burst; one story level, so the win frame ends it', () => {
  let s = drawn();
  s = dh.act(s, { g: 'aim', x: dh.heartOf(s.deer)[0], y: dh.heartOf(s.deer)[1] }).state;
  s = fly(s);
  assert.equal(s.phase, 'hit');
  assert.equal(s.hitKind, 'clean');
  assert.equal(s.levelStars, 3);
  assert.match(dh.html(s, 'zh'), /正中心口/);
  for (let i = 0; i < 400 && !s.won; i++) s = dh.tick(s, 10);
  assert.equal(s.won, true);
  assert.equal(s.grade, 'clean');
  const end = dh.html(s, 'zh');
  assert.match(end, /is-won/);
  assert.doesNotMatch(end, /<button/, 'the end has no button of its own');
});

test('a gust carries the arrow (in his face: to the right), and the line names it — 往左偏半寸', () => {
  const gust = { first: 'gust', gust: [9000, 9000], lull: [3000, 3000], strength: [1, 1], dirs: [1] };
  let s = drawn({ wind: gust }, 1000);
  const [hx, hy] = dh.heartOf(s.deer);
  s = dh.act(s, { g: 'aim', x: hx, y: hy }).state;
  const shot = dh.shotOf(s);
  assert.ok(shot.drift > 60, `blown right ${shot.drift.toFixed(0)}`);
  s = fly(s);
  assert.notEqual(s.phase, 'hit');
  assert.match(dh.html(s, 'zh'), /往左偏半寸/);
  // The same pull in a lull flies true.
  const calm = { ...gust, first: 'lull', lull: [9000, 9000] };
  let c = drawn({ wind: calm }, 1000);
  c = dh.act(c, { g: 'aim', x: hx, y: hy }).state;
  assert.ok(Math.abs(dh.shotOf(c).drift) < 6);
});

test('the breath: still at full, the sway nearly stops for BREATH_MS, then shakes worse than before', () => {
  let s = drawn();
  const amp = (st, from, len = 600) => { let m = 0; for (let t = from; t < from + len; t += 10) { const [x, y] = dh.swayOf(st, t); m = Math.max(m, Math.hypot(x, y)); } return m; };
  const before = amp(s, s.clock, 300);
  while (!dh.breathing(s)) s = dh.tick(s, 10);
  assert.ok(s.clock - (s.draw.at + dh.FULL_MS) >= dh.STILL_MS - 20, 'still at full a moment first');
  for (let i = 0; i < 30; i++) s = dh.tick(s, 10);
  const held = amp(s, s.clock, 600);
  const after = amp(s, s.draw.breathAt + dh.BREATH_MS + 500);
  assert.ok(held < before * 0.6 && held < 2, `held ${held.toFixed(1)} vs ${before.toFixed(1)}`);
  assert.ok(after > before * 2, `after ${after.toFixed(1)}`);
  assert.match(dh.html(s, 'zh'), /屏住气/);
});

test('a loose with its head up: it jumps the string and bolts (a spook), then comes back to the stream', () => {
  let s = drawn();
  s = { ...s, deer: { ...s.deer, mode: 'wary', lift: 1, until: s.clock + 5000 } };
  s = dh.act(s, { g: 'aim', x: dh.heartOf(s.deer)[0], y: dh.heartOf(s.deer)[1] }).state;
  s = fly(s);
  assert.equal(s.phase, 'wait');
  assert.equal(s.spooks, 1);
  assert.match(dh.html(s, 'zh'), /抬着头/);
  for (let i = 0; i < 2000 && s.deer.mode !== 'graze'; i++) s = dh.tick(s, 10);
  assert.equal(s.deer.mode, 'graze', 'back at the stream, grazing');
});

test('a miss near it spooks it; a wide miss only lifts its head — another arrow', () => {
  let near = drawn();
  near = dh.act(near, { g: "aim", x: near.deer.x + 55, y: 191 }).state;
  near = fly(near);
  assert.equal(near.spooks, 1);
  let wide = drawn();
  wide = dh.act(wide, { g: 'aim', x: 300, y: 60 }).state;
  wide = fly(wide);
  assert.equal(wide.spooks, 0);
  assert.equal(wide.deer.mode, 'wary');
  assert.equal(wide.phase, 'wait');
});

test('a walking deer wants a lead: aimed at its heart now, the arrow comes behind it', () => {
  const lv = { ...byId('walk'), wind: null, deer: { ...byId('walk').deer, first: 0, walk: 1 } };
  let s = dh.newGame('w', 1, { levels: [lv], still: true });
  while (s.deer.mode !== 'walk') s = dh.tick(s, 10);
  for (let i = 0; i < 20; i++) s = dh.tick(s, 10);
  s = dh.act(s, { g: 'hold' }).state;
  while (dh.powerOf(s) < 1 && s.deer.mode === 'walk') s = dh.tick(s, 10);
  if (s.deer.mode !== 'walk') return; // it stopped first — a rare deal; the bot test covers leads
  const [hx, hy] = dh.heartOf(s.deer);
  const at = dh.act(s, { g: 'aim', x: hx, y: hy }).state;
  const r = fly(at);
  assert.notEqual(r.hitKind, 'clean', 'aimed where it was, not where it will be');
});

test('a half draw falls short and low; let go too soon and the bow was never drawn; let go off the scene eases it', () => {
  let s = dh.newGame('h', 1, { levels: [{ ...STORY, wind: null }], still: true });
  s = dh.act(s, { g: 'hold', x: 200, y: 150 }).state;
  for (let i = 0; i < 20; i++) s = dh.tick(s, 10);
  s = dh.act(s, { g: 'release' }).state;
  assert.equal(s.phase, 'wait');
  assert.match(dh.html(s, 'zh'), /弓没拉开/);
  s = dh.act(s, { g: 'hold', x: 200, y: 150 }).state;
  while (dh.powerOf(s) < 0.6) s = dh.tick(s, 10);
  const sh = dh.shotOf(s);
  assert.ok(sh.to[0] - sh.aim[0] > 15 && sh.to[1] - sh.aim[1] > 20, 'short and low');
  s = dh.act(s, { g: 'move', x: 200, y: 340 }).state;
  s = dh.act(s, { g: 'release' }).state;
  assert.equal(s.phase, 'wait');
  assert.equal(s.shots, 0);
  assert.match(dh.html(s, 'zh'), /收了弓/);
});

test('the sight follows the finger from where it was (relative) — never jumps to the press', () => {
  let s = dh.newGame('r', 1, { levels: [STORY], still: true });
  const [x0, y0] = s.aim;
  s = dh.act(s, { g: 'hold', x: 400, y: 260 }).state;
  assert.deepEqual(s.aim, [x0, y0]);
  s = dh.act(s, { g: 'move', x: 380, y: 250 }).state;
  assert.deepEqual(s.aim, [x0 - 20, y0 - 10]);
});

test('a press mid-flight is refused (the same state: the page rings its refusal)', () => {
  let s = drawn();
  s = dh.act(s, { g: 'release' }).state;
  assert.equal(s.phase, 'fly');
  const r = dh.act(s, { g: 'hold', x: 100, y: 100 });
  assert.equal(r.state, s);
});

test('stars: heart · first arrow · calm; grades clean · steady · rough as deerarc\'s', () => {
  assert.equal(dh.starsFor({ heart: true, shots: 1, spooks: 0 }), 3);
  assert.equal(dh.starsFor({ heart: true, shots: 2, spooks: 0 }), 2);
  assert.equal(dh.starsFor({ heart: false, shots: 1, spooks: 0 }), 2);
  assert.equal(dh.starsFor({ heart: true, shots: 3, spooks: 1 }), 1);
  assert.equal(dh.starsFor({ heart: false, shots: 4, spooks: 2 }), 1);
  assert.deepEqual([3, 2, 1].map(dh.gradeOf), ['clean', 'steady', 'rough']);
  const s = { won: false, live: true, spooks: dh.STUCK_SPOOKS, shots: 1 };
  assert.equal(dh.stuck(s), true);
});

/* When Hanli says go: the story would deal the story level alone; the rules take its win as deerarc's. */
const NOW = new Date('2026-10-19T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
test('forward: a story win on this board (one level) gives deer-wind its stars and 一箭 · 偏左半寸', () => {
  let s = newState(content, 'zh', NOW);
  for (const step of TO_HALL) { if (s.scene === '00-deer') break; s = walk(s, [step], content, NOW); }
  assert.equal(s.scene, '00-deer');
  const r = play([STORY], handOf(), { seed: 'story' });
  assert.equal(r.won, true);
  const w = win(s, content, ctx(), { id: 'deer-wind', grade: r.s.grade, stars: r.s.stars });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  const done = task(w.state, content, ctx(), { action: 'done', id: 'deer-wind' }).state;
  assert.ok(done.cards.includes('yijian'));
});
