// 射鹿 · 拉弓, the 愤怒小鸟-style prototype (2026-10-16, design.md § 新小游戏): every level in
// games.json has a clean shot the aim search finds, and that shot, drawn and loosed through `act`,
// hits clean in the game at a 10 ms and a 50 ms clock alike (the world steps the same; `flight` is
// the game's own steps); a walking deer is still hit when the hand is 50 ms late; a graze spooks
// the deer and costs the arrow; reeds snap, the branch turns the arrow; a miss puts the next arrow
// on the string at once; an empty quiver lays the level again; the bot wins the whole thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as da from '../scripts/games/deerarc.js';
import { bot, solve } from '../scripts/games/bots/deerarc.js';
import { playOnce } from '../tools/board-bots.mjs';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { newState } from '../scripts/state.mjs';
import { TO_HALL, walk } from './prologue.mjs';

const content = loadContent();
const GAME = content.games.games.find((g) => g.id === 'deerarc');
const LEVELS = GAME.levels;
const PROJ = content.games.projectiles;
const AIMED = LEVELS.filter((l) => !l.smash); // the wind and the deer's levels: the aim search's
const byId = (id) => LEVELS.find((l) => l.id === id);

/** One level: wait to `at` ms on a `step` clock, draw to `aim`, loose, play out. */
function shot(level, aim, { step = 10, at = 0, limit = 8000 } = {}) {
  let s = da.newGame('t', 1, { levels: [level] });
  while (s.clock < at) s = da.tick(s, step);
  const released = s.clock;
  s = da.act(s, { g: 'draw', ...aim }).state;
  s = da.act(s, { g: 'loose' }).state;
  assert.equal(s.phase, 'fly');
  for (let t = 0; t < limit && s.phase === 'fly'; t += step) s = da.tick(s, step);
  return { s, released };
}

test('the levels are the registry\'s: still · wind · walking · reeds and a branch, then the smash three; separate from the story\'s 射鹿', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['still', 'wind', 'walk', 'reeds', 'pile', 'rack', 'yard']);
  assert.deepEqual(LEVELS.filter((l) => l.smash).map((l) => l.id), ['pile', 'rack', 'yard']);
  assert.ok(LEVELS.filter((l) => l.smash).every((l) => !l.story), 'the smash levels are the 游戏厅\'s');
  // The story's 射鹿 plays this board since 2026-10-16 (Hanli: 「好像还不错」 — go).
  assert.equal(GAME.task, 'deer-wind');
  const task = content.tasks.tasks.find((t) => t.id === 'deer-wind');
  assert.equal(task.game, 'deerarc');
  assert.equal(task.stars, 3);
  assert.equal(content.games.games.find((g) => g.id === 'deer').task, undefined, 'the old board is the 游戏厅\'s only');
  for (const l of LEVELS) assert.ok(l.say?.zh && l.say?.en, `${l.id} says what to do in both languages`);
  assert.ok(byId('wind').wind > 0 && byId('wind').hint, 'the wind level hints 「往左偏半寸」');
  assert.ok(byId('walk').deer.walk);
  assert.ok(byId('reeds').things.some((t) => t.kind === 'reed') && byId('reeds').things.some((t) => t.kind === 'branch'));
});

for (const level of AIMED) {
  test(`level ${level.id}: the aim search finds a clean shot, and it hits clean in the game at a 10 ms and a 50 ms clock`, () => {
    for (const step of [10, 50]) {
      // The release lands on the clock's step: solve for the moment it really leaves the string.
      let s = da.newGame('t', 1, { levels: [level] });
      while (s.clock < 700) s = da.tick(s, step);
      const aim = solve(da.levelNow(s), s.clock); // this arrow's rolled wind
      assert.ok(aim, `${level.id}: a clean pull exists at ${s.clock} ms`);
      const r = shot(level, aim, { step, at: s.clock });
      assert.equal(r.s.phase, 'hit', `${level.id} at ${step} ms: ${r.s.phase} (${r.s.said})`);
      assert.equal(r.s.best[0], 3, 'one arrow, three stars');
    }
  });
}

// Hanli 10-16 「风不变吗?」: from level 2 each arrow meets its own wind, shown before he pulls.
test('each arrow rolls its own wind (level 2 always in his face, 3–4 either way); 重来 deals the same; every rolled wind has a clean shot', () => {
  const ROLLED = LEVELS.filter((l) => l.roll);
  assert.deepEqual(ROLLED.map((l) => l.id), ['wind', 'walk', 'reeds']);
  for (const [li, level] of LEVELS.entries()) {
    if (!level.roll) continue;
    const winds = [];
    for (const seed of ['a', 'b', 'c']) for (let k = 0; k < da.QUIVER; k++) {
      const w = da.rollWind(level, seed, li, k);
      winds.push(w);
      assert.ok(Math.abs(w) >= level.roll.min - 1e-9 && Math.abs(w) <= level.roll.max + 1e-9, `${level.id}: ${w} in its range`);
      if (level.id === 'wind') assert.ok(w > 0, '「往左偏半寸」: always in his face');
      assert.ok(solve({ ...level, wind: w }, 700), `${level.id} seed ${seed} arrow ${k}: wind ${w} has a clean shot`);
    }
    assert.ok(new Set(winds).size > 4, `${level.id}: the wind changes (${winds.join(' ')})`);
    if (level.id !== 'wind') assert.ok(winds.some((w) => w > 0) && winds.some((w) => w < 0), `${level.id}: both ways`);
  }
  // In play: the next arrow's wind is in the header before he pulls; 重来 deals the first again.
  let s = da.newGame('t', 1, { levels: [byId('wind')] });
  const first = s.windBase;
  assert.equal(first, da.rollWind(byId('wind'), 't', 0, 0));
  const miss = find(da.levelNow(s), (f) => !f.hit && f.end === 'ground');
  s = da.act(da.act(s, { g: 'draw', ...miss }).state, { g: 'loose' }).state;
  for (let i = 0; i < 400 && s.phase === 'fly'; i++) s = da.tick(s, 10);
  assert.equal(s.phase, 'aim');
  assert.equal(s.windBase, da.rollWind(byId('wind'), 't', 0, 1), 'the second arrow, its own wind');
  assert.match(da.html(s, 'zh'), /迎面/);
  s = da.act(s, { g: 'retry' }).state;
  assert.equal(s.windBase, first, '重来: the same first wind');
});

test('the walking deer: a pull found for a moment still hits when the hand is 50 ms late, or early', () => {
  const walk = byId('walk');
  let ok = 0;
  for (const at of [800, 2000, 3500, 5000]) {
    const aim = solve(walk, at);
    if (!aim) continue;
    const late = da.flight(walk, aim, at + 50).hit, early = da.flight(walk, aim, Math.max(0, at - 50)).hit;
    if (late === 'clean' && early === 'clean') ok++;
  }
  assert.ok(ok >= 2, `steady leads: ${ok} of 4`);
});

test('the wind is real: the headwind blows a calm answer well back toward him; the wind level wants it longer', () => {
  const open = { ...byId('still'), deer: { x: -999 } }, calm = solve(byId('still'));
  const still = da.flight(open, calm).tip[0], blown = da.flight({ ...open, wind: byId('wind').wind }, calm).tip[0];
  assert.ok(blown - still > 15, `blown back toward him: ${still.toFixed(0)} → ${blown.toFixed(0)}`);
  const wind = solve(byId('wind'));
  assert.notEqual(da.flight(byId('wind'), { ...wind, p: wind.p - 0.2 }).hit, 'clean', 'a pull short of the answer is not enough');
});

/** The first pull on a coarse grid whose flight in a fresh world matches `want`. */
function find(level, want) {
  for (let a = 2; a <= 70; a += 2) for (let p = 0.15; p <= 1; p += 0.02) {
    const f = da.flight(level, { a, p });
    if (want(f)) return { a, p };
  }
  return null;
}

test('a graze spooks the deer: it bolts and comes back, the arrow is spent, the level goes on', () => {
  const still = byId('still'), aim = find(still, (f) => f.hit === 'graze');
  assert.ok(aim);
  let { s } = shot(still, aim);
  assert.equal(s.phase, 'spook');
  assert.match(da.html(s, 'zh'), /鹿角|头/);
  for (let i = 0; i < 60; i++) s = da.tick(s, 50);
  assert.equal(s.phase, 'aim', 'back at the stream');
  assert.equal(s.used, 1, 'the graze cost its arrow');
});

// Hanli 10-16 「射中了也没完成游戏」: he hit the deer's body, it counted as a graze, he never left 静.
test('a hit on the body clears the level too (a star fewer); 下一处 goes on to 风, and the header shows the wind', () => {
  const still = byId('still'), aim = find(still, (f) => f.hit === 'body');
  assert.ok(aim, 'a body hit exists');
  let s = da.newGame('t', 1, { levels: LEVELS });
  s = da.act(da.act(s, { g: 'draw', ...aim }).state, { g: 'loose' }).state;
  for (let i = 0; i < 400 && s.phase === 'fly'; i++) s = da.tick(s, 10);
  assert.equal(s.phase, 'hit');
  assert.match(da.html(s, 'zh'), /中了，偏了些/);
  for (let i = 0; i < 100 && s.phase === 'hit'; i++) s = da.tick(s, 50);
  assert.equal(s.phase, 'clear');
  assert.equal(s.best[0], 2, 'one arrow off the heart: two stars');
  s = da.act(s, { g: 'next' }).state;
  assert.equal(s.li, 1);
  assert.match(da.html(s, 'zh'), /迎面/, 'the wind is in the header');
});

/* The painted stag (stag-drink, the canvas the art agent drew): its barrel in canvas pixels. */
const BARREL_PX = [130, 175, 380, 280];
function paintedBox(level, art) {
  const a = art.drink, d = da.deerAt(level, 0), k = da.DEER_S, gy = da.groundAt(d.x);
  const toScene = ([px, py]) => [d.x + d.face * k * ((px / 640 - a.at[0]) * a.w), gy + k * ((py / 480 - a.at[1]) * a.h)];
  const [p, q] = [toScene([BARREL_PX[0], BARREL_PX[1]]), toScene([BARREL_PX[2], BARREL_PX[3]])];
  return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
}

test('the real sprite: every arrow whose point enters the painted barrel is a hit (heart or body), never a graze or a miss', () => {
  const still = byId('still'), [x0, y0, x1, y1] = paintedBox(still, GAME.art);
  let entered = 0;
  for (let a = 4; a <= 68; a += 4) for (let p = 0.2; p <= 1; p += 0.04) {
    const w = da.shoot(da.build(still), { a, p });
    let inside = false;
    for (let k = 0; k < 400 && !w.arrow.done; k++) {
      da.stepWorld(w, still, k * da.STEP_MS);
      const [x, y] = w.arrow.tip;
      // well inside the barrel (a margin of 4), before anything else could stop it
      if (x > x0 + 4 && x < x1 - 4 && y > y0 + 4 && y < y1 - 4) { inside = true; break; }
    }
    if (!inside) continue;
    entered++;
    const hit = da.flight(still, { a, p }).hit;
    assert.ok(hit === 'clean' || hit === 'body', `a ${a}° p ${p.toFixed(2)}: into the painted barrel, judged ${hit}`);
  }
  assert.ok(entered > 10, `${entered} pulls reach the barrel`);
});

test('a miss: the next arrow is on the string at once, the spent one stays stuck, a near one makes the deer look up', () => {
  const still = byId('still'), aim = find(still, (f) => !f.hit && f.end === 'ground' && Math.abs(f.tip[0] - still.deer.x) < 60);
  assert.ok(aim);
  const { s } = shot(still, aim);
  assert.equal(s.phase, 'aim', 'no reload pause');
  assert.equal(s.stuck.length, 1);
  assert.ok(s.trail?.length > 3, 'the last arrow\'s trail to learn from');
  assert.match(da.html(s, 'zh'), /抬起头/);
  assert.doesNotMatch(da.html({ ...s, pull: { a: 30, p: 0.5 } }, 'zh'), /g-da-guide/, 'the arc hint is for the first arrow only');
  const fresh = da.act(da.newGame('t', 1, { levels: [still] }), { g: 'draw', a: 30, p: 0.5 }).state;
  assert.match(da.html(fresh, 'zh'), /g-da-guide/);
});

test('the wind level\'s miss brings 银月\'s 「往左偏半寸」 and the tick left of the deer', () => {
  const wind = byId('wind'), aim = find(wind, (f) => !f.hit && f.end === 'ground');
  let { s } = shot(wind, aim);
  s = { ...s, said: null };
  assert.match(da.html(s, 'zh'), /往左偏半寸/);
  assert.match(da.html(s, 'zh'), /g-da-hint/);
});

test('reeds snap under a fast arrow (a stub stands, chaff flies); the branch turns an arrow, spent', () => {
  const reeds = byId('reeds');
  const fast = find(reeds, (f) => f.snapped > 0);
  assert.ok(fast);
  let s = da.newGame('t', 1, { levels: [reeds] });
  s = da.act(da.act(s, { g: 'draw', ...fast }).state, { g: 'loose' }).state;
  for (let i = 0; i < 400 && s.phase === 'fly'; i++) s = da.tick(s, 10);
  const snapped = s.world.things.filter((t) => t.broken);
  assert.ok(snapped.length >= 1 && snapped.every((t) => t.stub), 'a stub left');
  assert.ok(s.world.bits.length >= 4, 'chaff');
  const lob = { a: 60, p: 0.75 }; // high over the reeds, into the dead branch
  assert.equal(da.flight(reeds, lob).end, 'turned');
  const w = da.shoot(da.build(reeds), lob);
  let ev = null;
  for (let i = 0; i < 300 && !['turned', 'ground', 'out'].includes(ev); i++) ev = da.stepWorld(w, reeds);
  assert.equal(ev, 'turned');
  assert.equal(w.arrow.true, false, 'spent: it judges nothing now');
  assert.equal(w.things.find((t) => t.shake)?.kind, 'branch');
});

test('an empty quiver: the deer is gone, the level is laid again, counted toward stuck', () => {
  const still = byId('still'), miss = find(still, (f) => !f.hit && f.end === 'ground');
  let s = da.newGame('t', 1, { levels: [still] });
  for (let k = 0; k < da.QUIVER; k++) {
    s = da.act(da.act(s, { g: 'draw', ...miss }).state, { g: 'loose' }).state;
    for (let i = 0; i < 600 && s.phase === 'fly'; i++) s = da.tick(s, 10);
  }
  assert.equal(s.phase, 'gone');
  assert.equal(s.misses[0], 1);
  for (let i = 0; i < 30; i++) s = da.tick(s, 50);
  assert.equal(s.phase, 'aim');
  assert.equal(s.used, 0);
  assert.equal(da.stuck({ ...s, misses: [da.STUCK_MISSES] }), true);
});

test('重来 any time lays the level fresh; a short pull lets the string go without an arrow', () => {
  const reeds = byId('reeds');
  let s = da.newGame('t', 1, { levels: [reeds] });
  s = da.act(s, { g: 'hold', x: 300, y: 150 }).state;
  s = da.act(s, { g: 'move', x: 304, y: 152 }).state;
  s = da.act(s, { g: 'release' }).state;
  assert.equal(s.phase, 'aim');
  assert.equal(s.used, 0, 'too short a pull: nothing loosed');
  s = da.act(s, { g: 'hold', x: da.BOW[0], y: da.BOW[1] }).state;
  s = da.act(s, { g: 'move', x: da.BOW[0] + 100, y: da.BOW[1] - 50 }).state;
  assert.ok(s.pull.p > 0.9 && s.pull.a > 20 && s.pull.a < 30, 'pulled back and up: a strong shot, up and toward the deer (Hanli 10-19: the bow tilts the way the hand goes)');
  s = da.act(s, { g: 'release' }).state;
  assert.equal(s.phase, 'fly');
  s = da.act(s, { g: 'retry' }).state;
  assert.equal(s.phase, 'aim');
  assert.equal(s.used, 0);
  assert.ok(s.world.things.every((t) => !t.broken));
});

test('stars: one arrow 3, two 2, more 1; the whole by the board bot: won, three stars, clean', () => {
  assert.deepEqual([1, 2, 3, 4].map(da.starsFor), [3, 2, 1, 1]);
  const r = playOnce(da, bot, { seed: 'bot-1', deal: { levels: LEVELS, projectiles: PROJ } });
  assert.equal(r.won, true);
  assert.equal(r.grade, 'clean');
  assert.ok(r.ms < 90000, `${r.ms} ms`);
});

test('drawn in both languages: the scene takes the drag, 重来, stars that pop; the end; no levels draws a quiet card', () => {
  const s = da.newGame('t', 1, { levels: LEVELS });
  for (const lang of ['zh', 'en']) {
    const h = da.html(s, lang);
    assert.match(h, /data-g-drag="bow"/);
    assert.match(h, /data-g="retry"/);
  }
  const clear = { ...s, phase: 'clear', best: [2, 0, 0, 0] };
  assert.match(da.html(clear, 'zh'), /g-da-pop/);
  assert.match(da.html(clear, 'zh'), /data-g="next"/);
  const end = { ...s, phase: 'end', won: true, live: false, stars: 3 };
  assert.match(da.html(end, 'zh'), /溪边七处，都拿下了/, 'seven spots, three of them smashed: never 「都射中了」');
  assert.doesNotMatch(da.html(end, 'zh'), /都射中了/);
  assert.match(da.html(end, 'en'), /3 stars/);
  assert.equal(da.newGame('t', 1, {}).live, false);
  assert.match(da.html(da.newGame('t', 1, {}), 'zh'), /溪边没有鹿/);
  assert.equal(typeof da.mount, 'function');
});

/** Where a mirrored, rotated group's local +x points on the screen: scale(-1 1) rotate(r). */
const bowDir = (h) => {
  const m = h.match(/class="g-da-bow[^"]*" transform="translate\([^)]*\) scale\(-1 1\) rotate\(([-\d.]+)\)"/);
  const r = (Number(m[1]) * Math.PI) / 180;
  return [-Math.cos(r), Math.sin(r)];
};
const angleOf = ([x, y]) => Math.atan2(y, x);
const near = (a, b, tol = 0.03) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < tol;

test('the bow, the nocked arrow and the hint point along the launch; the flying arrow along its flight (Hanli 10-16: the bow pointed down)', () => {
  const still = byId('still');
  // Pulled up-right (shoots up), flat, down-right (shoots down), steep, and toward the deer (still back).
  for (const [x, y] of [[60, -50], [70, 0], [70, 25], [40, -90], [-70, -30]]) {
    let s = da.newGame('t', 1, { levels: [still] });
    // Pressed at the bow, so the hand's place against the bow is the pull itself (Hanli 10-19).
    s = da.act(s, { g: 'hold', x: da.BOW[0], y: da.BOW[1] }).state;
    s = da.act(s, { g: 'move', x: da.BOW[0] + x, y: da.BOW[1] + y }).state;
    const v = da.velocityOf(s.pull), launch = angleOf([v.x, v.y]);
    // Toward the deer always; up as the hand goes up (Hanli 10-19), never turned round.
    assert.ok(near(launch, angleOf([-Math.max(Math.abs(x), 1), y])), 'the launch: toward the deer, tilted with the hand');
    const h = da.html(s, 'zh');
    assert.ok(near(angleOf(bowDir(h)), launch), `bow along the launch for a pull (${x}, ${y})`);
    const dot = h.match(/class="g-da-guide" cx="([-\d.]+)" cy="([-\d.]+)"/);
    assert.ok(near(angleOf([dot[1] - da.BOW[0], dot[2] - da.BOW[1]]), launch, 0.15), 'the hint\'s first dot');
    s = da.act(s, { g: 'release' }).state;
    for (let i = 0; i < 40 && s.phase === 'fly'; i++) {
      s = da.tick(s, 50);
      const ar = s.world.arrow;
      if (s.phase !== 'fly' || !ar?.true) break;
      const m = da.html(s, 'zh').match(/data-arrow="" transform="translate\([^)]*\) rotate\(([-\d.]+)\)"/);
      assert.ok(near((Number(m[1]) * Math.PI) / 180, angleOf([ar.body.velocity.x, ar.body.velocity.y]), 0.02), 'the arrow flies along its tangent');
    }
  }
});

test('gusts: the wind rises and falls on a gusty level, a tailwind carries the arrow further, a lull and a gust land apart', () => {
  const reeds = byId('reeds'), walk = byId('walk');
  const winds = [0, 700, 1400, 2100].map((ms) => da.windAt(reeds, ms));
  assert.ok(Math.max(...winds) - Math.min(...winds) > 0.5, `it breathes: ${winds.map((w) => w.toFixed(2))}`);
  assert.ok(da.windAt(walk, 0) < 0, 'at his back');
  const aim = { a: 40, p: 0.5 }, open = { ...walk, deer: { x: -999 }, wind: 0, gust: null, things: [] };
  assert.ok(da.flight({ ...open, wind: -0.4 }, aim).tip[0] < da.flight(open, aim).tip[0], 'carried further toward the deer');
  const gusty = { ...reeds, deer: { x: -999 }, things: [] }, g = reeds.gust;
  const at = (k) => ((k - g.phase / (2 * Math.PI)) * g.period + g.period) % g.period; // the sine's quarter k
  const lull = da.flight(gusty, aim, at(0.75)).tip[0], gust = da.flight(gusty, aim, at(0.25)).tip[0];
  assert.ok(lull - gust < -12, `a lull flies further: ${lull.toFixed(0)} vs ${gust.toFixed(0)}`);
});

test('the paintings: only the entries whose files are there are used (the stag now); each part falls back to ink alone; every part takes its painting when it lands', async () => {
  const fs = await import('node:fs');
  const has = async (file) => fs.existsSync(new URL(`../worlds/jiuding/art/${file}`, import.meta.url));
  const art = await da.presentArt(GAME.art, has);
  for (const pose of ['drink', 'look', 'walk']) assert.ok(art[pose], `${pose} is painted`);
  assert.ok(Object.values(art).filter((a) => a.file).every((a) => fs.existsSync(new URL(`../worlds/jiuding/art/${a.file}`, import.meta.url))), 'nothing missing is kept');
  assert.deepEqual(art.marks, GAME.art.marks, 'settings without a file stay');
  // Hanli 10-16 「背景导致看不清弓和轨迹」: bigger inked aim dots, the trail a bold stroke, paper behind the bow.
  let m = da.act(da.newGame('t', 1, { levels: [byId('still')], art }), { g: 'draw', a: 30, p: 0.6 }).state;
  const firstDot = Number(da.html(m, 'zh').match(/class="g-da-guide" cx="[-\d.]+" cy="[-\d.]+" r="([\d.]+)"/)[1]);
  assert.ok(firstDot >= 4, `dot r ${firstDot}`);
  assert.match(da.html(m, 'zh'), /id="[^"]+-archer"/, 'a feathered wash behind the bow');
  m = da.act(m, { g: 'loose' }).state;
  for (let i = 0; i < 400 && m.phase === 'fly'; i++) m = da.tick(m, 10);
  if (m.trail) assert.match(da.html({ ...m, phase: 'aim' }, 'zh'), /g-da-trail-ink/);
  const drinking = da.html(da.newGame('t', 1, { levels: [byId('still')], art }), 'zh');
  assert.match(drinking, /stag-drink\.webp/);
  if (!art.bow_rest) assert.match(drinking, /g-da-limb/, 'the bow in ink until its painting lands');
  let s = da.newGame('t', 1, { levels: [byId('walk')], art });
  for (let i = 0; i < 30; i++) s = da.tick(s, 50);
  assert.match(da.html(s, 'zh'), /stag-walk\.webp/);
  assert.doesNotMatch(da.html(da.newGame('t', 1, { levels: [byId('still')] }), 'zh'), /\.webp/, 'no art: all ink');
  // Every entry as if landed: each part is drawn from its file.
  const all = await da.presentArt(GAME.art, async () => true);
  let r = da.newGame('t', 1, { levels: [byId('reeds')], art: all });
  r = da.act(r, { g: 'draw', a: 30, p: 0.5 }).state;
  const aiming = da.html(r, 'zh');
  for (const f of ['bow-drawn', 'arrow', 'reed', 'branch', 'heisong-creek']) assert.match(aiming, new RegExp(`${f}\\.webp`), f);
  assert.doesNotMatch(aiming, /bow-rest\.webp/, 'drawn, the bow at rest is gone — never two ghosts');
  assert.match(da.html(da.newGame('t', 1, { levels: [byId('reeds')], art: all }), 'zh'), /bow-rest\.webp/, 'at rest before he pulls');
  assert.doesNotMatch(aiming, /g-da-limb|g-da-branch"/, 'no ink where a painting is');
  r = da.act(r, { g: 'draw', ...find(byId('reeds'), (f) => f.snapped > 0) }).state;
  r = da.act(r, { g: 'loose' }).state;
  for (let i = 0; i < 400 && r.phase === 'fly'; i++) r = da.tick(r, 10);
  const after = da.html(r, 'zh');
  assert.match(after, /reed-stub\.webp/, 'a snapped reed\'s stub');
  if (r.phase === 'hit') { r = da.tick(r, 200); assert.match(da.html(r, 'zh'), /ink-hit\.webp/); }
  const bolting = { ...r, phase: 'spook', t: 600, deerGone: da.deerAt(byId('reeds'), 0), at: [100, 200] };
  assert.match(da.html(bolting, 'zh'), /stag-bolt\.webp/);
});

test('the deer eases between poses: its head and its feet never jump from one frame to the next', () => {
  for (const level of LEVELS) {
    let last = da.deerAt(level, 0);
    for (let ms = 17; ms < 12000; ms += 17) {
      const d = da.deerAt(level, ms);
      assert.ok(Math.abs(d.lift - last.lift) < 0.1, `${level.id}: the head at ${ms}`);
      assert.ok(Math.abs(d.x - last.x) < 1.5, `${level.id}: the feet at ${ms}`);
      last = d;
    }
  }
});

/* ── The story's 射鹿 (00-deer) plays this board (2026-10-16) ── */

const NOW = new Date('2026-10-16T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
function atDeer() {
  let s = newState(content, 'zh', NOW);
  for (const step of TO_HALL) { if (s.scene === '00-deer') break; s = walk(s, [step], content, NOW); }
  assert.equal(s.scene, '00-deer');
  return s;
}

test('the story: Look deals 射鹿 its levels and paintings; a win keeps its stars, gives 一箭 · 偏左半寸, and 往左偏半寸 goes on to 00-dusk', () => {
  const s = atDeer();
  const t = look(s, content, ctx()).tasks.find((x) => x.id === 'deer-wind');
  assert.equal(t.game, 'deerarc');
  // Hanli 10-19: the story plays two spots, 静 then 风 (the book's 「往左偏半寸」); the 游戏厅 keeps all.
  assert.deepEqual(t.deal.levels.map((l) => l.id), ['still', 'wind'], 'the story deals 静 and 风 only');
  assert.ok(t.deal.art?.drink && t.deal.art?.backdrop, 'and the paintings');
  // The bot wins the board as the page would deal it, and the rules take its grade and stars.
  const r = playOnce(da, bot, { seed: 'story', deal: t.deal });
  assert.equal(r.won, true);
  const w = win(s, content, ctx(), { id: 'deer-wind', grade: r.grade, stars: 3 });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  assert.equal(w.state.stars['deer-wind'], 3);
  const done = task(w.state, content, ctx(), { action: 'done', id: 'deer-wind' }).state;
  assert.ok(done.cards.includes('yijian'), 'the card the book names for this beat');
  assert.equal(resolve(done, content, ctx(), { exit: 'left' }).state.scene, '00-dusk');
});

test('an old save on the old board: a win sent with the old grades and no stars still takes the beat and its card', () => {
  const s = atDeer();
  for (const grade of ['clean', 'steady', 'rough']) {
    const w = win(s, content, ctx(), { id: 'deer-wind', grade });
    assert.equal(w.result.ok, true, grade);
    const done = task(w.state, content, ctx(), { action: 'done', id: 'deer-wind' }).state;
    assert.ok(done.cards.includes('yijian'));
    assert.equal(resolve(done, content, ctx(), { exit: 'left' }).state.scene, '00-dusk');
  }
});

test('the story\'s two spots: the step on reads 下一处 (never 往下 · 接着 · 继续), the last 收弓, the end counts two', () => {
  const deal = { levels: LEVELS.filter((l) => l.story) };
  assert.deepEqual(deal.levels.map((l) => l.id), ['still', 'wind']);
  let s = da.newGame('t', 1, deal);
  // A two-arrow win on 静 stops at 「这一处」 with its buttons.
  s = { ...s, phase: 'clear', best: [2, 0] };
  for (const lang of ['zh', 'en']) {
    const h = da.html(s, lang);
    assert.ok(!/往下|接着|继续/.test(h), lang);
  }
  assert.match(da.html(s, 'zh'), /data-g="next"[^>]*>下一处</);
  assert.match(da.html({ ...s, li: 1 }, 'zh'), /data-g="next"[^>]*>收弓</);
  const end = da.html({ ...s, won: true, stars: 3 }, 'zh');
  assert.match(end, /溪边两处/);
  assert.ok(!/往下|接着|继续/.test(end));
});

test('the tilt is the hand against the bow, wherever the press began (Hanli 10-19: 「当鼠标在弓右边的时候, 上划的时候, 石头往下走」)', () => {
  const still = byId('still');
  let s = da.newGame('t', 1, { levels: [still] });
  // Pressed low and right of the bow, then swept up to above it: it aims up.
  s = da.act(s, { g: 'hold', x: da.BOW[0] + 40, y: da.BOW[1] + 60 }).state;
  s = da.act(s, { g: 'move', x: da.BOW[0] + 90, y: da.BOW[1] - 30 }).state;
  assert.ok(s.pull.a > 10, `above the bow aims up (${s.pull.a})`);
  s = da.act(s, { g: 'move', x: da.BOW[0] + 90, y: da.BOW[1] + 40 }).state;
  assert.ok(s.pull.a < 0, `below the bow aims down (${s.pull.a})`);
});
