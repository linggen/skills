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

const content = loadContent();
const GAME = content.games.games.find((g) => g.id === 'deerarc');
const LEVELS = GAME.levels;
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

test('the levels are the registry\'s: four, still · wind · walking · reeds and a branch; separate from the story\'s 射鹿', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ['still', 'wind', 'walk', 'reeds']);
  assert.equal(GAME.task, undefined, 'a prototype: no task, the beat is still games/deer.js');
  assert.equal(content.tasks.tasks.find((t) => t.id === 'deer-wind').game, 'deer');
  for (const l of LEVELS) assert.ok(l.say?.zh && l.say?.en, `${l.id} says what to do in both languages`);
  assert.ok(byId('wind').wind > 0 && byId('wind').hint, 'the wind level hints 「往左偏半寸」');
  assert.ok(byId('walk').deer.walk);
  assert.ok(byId('reeds').things.some((t) => t.kind === 'reed') && byId('reeds').things.some((t) => t.kind === 'branch'));
});

for (const level of LEVELS) {
  test(`level ${level.id}: the aim search finds a clean shot, and it hits clean in the game at a 10 ms and a 50 ms clock`, () => {
    for (const step of [10, 50]) {
      // The release lands on the clock's step: solve for the moment it really leaves the string.
      let s = da.newGame('t', 1, { levels: [level] });
      while (s.clock < 700) s = da.tick(s, step);
      const aim = solve(level, s.clock);
      assert.ok(aim, `${level.id}: a clean pull exists at ${s.clock} ms`);
      const r = shot(level, aim, { step, at: s.clock });
      assert.equal(r.s.phase, 'hit', `${level.id} at ${step} ms: ${r.s.phase} (${r.s.said})`);
      assert.equal(r.s.best[0], 3, 'one arrow, three stars');
    }
  });
}

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

test('the wind is real: the still level\'s answer falls short into the wind, and the wind\'s answer flies longer', () => {
  const calm = solve(byId('still'));
  const windy = { ...byId('still'), wind: byId('wind').wind };
  const r = da.flight(windy, calm);
  assert.notEqual(r.hit, 'clean');
  assert.ok(r.tip[0] > da.flight(byId('still'), calm).tip[0], 'blown back toward him');
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
  assert.match(da.html(s, 'zh'), /擦着了|没中要害/);
  for (let i = 0; i < 60; i++) s = da.tick(s, 50);
  assert.equal(s.phase, 'aim', 'back at the stream');
  assert.equal(s.used, 1, 'the graze cost its arrow');
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
  s = da.act(s, { g: 'hold', x: 300, y: 150 }).state;
  s = da.act(s, { g: 'move', x: 400, y: 200 }).state;
  assert.ok(s.pull.p > 0.9 && s.pull.a > 20 && s.pull.a < 30, 'pulled back and down: a strong shot, up and toward the deer');
  s = da.act(s, { g: 'release' }).state;
  assert.equal(s.phase, 'fly');
  s = da.act(s, { g: 'retry' }).state;
  assert.equal(s.phase, 'aim');
  assert.equal(s.used, 0);
  assert.ok(s.world.things.every((t) => !t.broken));
});

test('stars: one arrow 3, two 2, more 1; the whole by the board bot: won, three stars, clean', () => {
  assert.deepEqual([1, 2, 3, 4].map(da.starsFor), [3, 2, 1, 1]);
  const r = playOnce(da, bot, { seed: 'bot-1', deal: { levels: LEVELS } });
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
  assert.match(da.html(end, 'zh'), /溪边四处/);
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
  // Pulled down-right (shoots up), flat, up-right (shoots down), and steep.
  for (const [x, y] of [[60, 50], [70, 0], [70, -25], [40, 90]]) {
    let s = da.newGame('t', 1, { levels: [still] });
    s = da.act(s, { g: 'hold', x: 300, y: 150 }).state;
    s = da.act(s, { g: 'move', x: 300 + x, y: 150 + y }).state;
    const v = da.velocityOf(s.pull), launch = angleOf([v.x, v.y]);
    assert.ok(near(launch, angleOf([-x, -y])), 'the launch is opposite the pull');
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
  assert.ok(Object.values(art).every((a) => fs.existsSync(new URL(`../worlds/jiuding/art/${a.file}`, import.meta.url))), 'nothing missing is kept');
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
  for (const f of ['bow-rest', 'bow-drawn', 'arrow', 'reed', 'branch']) assert.match(aiming, new RegExp(`${f}\\.webp`), f);
  assert.doesNotMatch(aiming, /g-da-limb|g-da-branch"/, 'no ink where a painting is');
  r = da.act(r, { g: 'draw', a: 18, p: 0.97 }).state;
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
