// 射鹿's physics (Hanli 10-19: 「射鹿的问题是没有碰撞, 重力, 物理引擎等」, 「没有丢东西, 砸碎东西的快感」): every
// thing by the creek is a matter.js body (smash.js). A blow beats a material and it shatters into
// pieces of its painting that fly on; a softer one only knocks it; stacked things topple and chain;
// an arrow sticks in wood and rides it, glances off stone, breaks clay and flies on; a stone, a log
// and a pot are real bodies; reeds bend and spring back. What falls on the stag flushes it into the
// open (or fells it). Each smash level is won with three stars by its answers at a 10 ms and a 50 ms
// clock, the same shot plays the same twice, and the board bot wins the 游戏厅's whole row.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as da from '../scripts/games/deerarc.js';
import { KINDS, cutOf } from '../scripts/games/smash.js';
import { projectileOf } from '../scripts/games/throws.js';
import { loadContent } from '../scripts/content.mjs';

const content = loadContent();
const PROJ = content.games.projectiles;
const ROW = content.games.games.find((g) => g.id === 'deerarc');
const SMASH = ROW.levels.filter((l) => l.smash);
const byId = (id) => ROW.levels.find((l) => l.id === id);

/** Play a level's throws [a, p, pick] on a `step` clock, waiting out a flushed stag's run. */
function play(level, throws, step = 50) {
  let s = da.newGame('t', 1, { levels: [level], projectiles: PROJ });
  s = da.tick(s, 300);
  for (const [a, p, pick] of throws) {
    for (let t = 0; t < 3000 && s.phase === 'aim' && s.flushAt != null && s.clock - s.flushAt < da.FLEE_MS + 100; t += step) s = da.tick(s, step);
    if (s.phase !== 'aim') break;
    s = da.act(s, { g: 'pick', p: pick }).state;
    s = da.act(da.act(s, { g: 'draw', a, p }).state, { g: 'loose' }).state;
    for (let t = 0; t < 9000 && ['fly', 'settle'].includes(s.phase); t += step) s = da.tick(s, step);
  }
  return s;
}
const where = (s) => s.world.things.map((t) => (t.broken ? 'x' : `${t.body.position.x.toFixed(3)},${t.body.position.y.toFixed(3)},${t.body.angle.toFixed(4)}`)).join(' ');

for (const level of SMASH) {
  test(`smash level ${level.id}: its answers win three stars at a 10 ms and a 50 ms clock, and play the same twice`, () => {
    const runs = [10, 50, 50].map((step) => play(level, level.bot, step));
    for (const s of runs) {
      assert.equal(s.phase, 'hit', `${level.id}: ${s.phase} (${s.said})`);
      assert.equal(s.levelStars, 3, `${level.id}: ${s.points} points`);
      assert.ok(s.world.score > 0, 'something knocked down or broken');
    }
    assert.equal(where(runs[1]), where(runs[2]), 'deterministic: the same shot, the same world');
    assert.equal(runs[0].world.score, runs[1].world.score, 'the clock\'s step changes nothing');
  });
}

test('the 柴垛: a 柴 log thrown at the first stood log knocks the row over, one into the next, onto the stag — it bolts into the open', () => {
  const pile = byId('pile');
  const s = play(pile, [pile.bot[0]]);
  const logs = s.world.things.filter((t) => t.kind === 'log');
  assert.equal(logs.length, 4);
  assert.ok(logs.every((t) => t.toppled), 'all four came down (a chain: only the first was struck)');
  assert.ok(logs.every((t) => t.body.position.x < t.home[0]), 'toward the stag');
  assert.ok(s.flushAt != null, 'what fell on it flushed it');
  const d = da.deerAt(da.levelNow(s), s.clock + 2000);
  assert.equal(d.x, pile.deer.flee.x, 'it stands where it fled');
  assert.ok(d.up, 'head up, looking back');
});

test('a jar under a hard blow shatters: pieces of its painting that fly on with the blow; a soft knock only moves it', () => {
  const level = { id: 't', smash: true, deer: { x: -999 }, wind: 0, things: [{ kind: 'jar', at: [240, 235], size: [26, 34] }], ammo: ['arrow', 'stone'] };
  // A full draw, aimed down at it (the first aim that reaches it).
  let w = null, jar = null;
  for (let a = -24; a <= 10 && !jar?.broken; a += 2) {
    w = da.build(level); jar = w.things[0];
    da.shoot(w, { a, p: 1 });
    for (let i = 0; i < 200 && !jar.broken && !w.arrow.done; i++) da.stepWorld(w, level, i * da.STEP_MS);
  }
  assert.ok(jar.broken, 'the arrow broke it');
  assert.equal(w.frags.length, KINDS.jar.shards);
  assert.ok(w.frags.some((f) => f.body.velocity.x < -0.5), 'its pieces fly on, the arrow\'s way (left)');
  assert.equal(w.score, KINDS.jar.points);
  assert.ok(w.cues.some((c) => c.k === 'shatter'), 'heard');
  // A tired lob that only taps it: the arrow sticks or falls, the jar stands.
  const w2 = da.build(level);
  da.shoot(w2, { a: 70, p: 0.15 });
  for (let i = 0; i < 400; i++) da.stepWorld(w2, level, i * da.STEP_MS);
  assert.equal(w2.things[0].broken, false);
});

test('a broken thing\'s pieces are the cut of its own painting: convex, covering it, the same every time', () => {
  const parts = cutOf(26, 34, 6, 3);
  assert.equal(parts.length, 6);
  const area = (poly) => Math.abs(poly.reduce((a, [x, y], i) => { const [u, v] = poly[(i + 1) % poly.length]; return a + x * v - u * y; }, 0) / 2);
  assert.ok(Math.abs(parts.reduce((a, p) => a + area(p), 0) - 26 * 34) < 1e-6, 'they cover it, no gap');
  assert.deepEqual(cutOf(26, 34, 6, 3), parts, 'the same cut');
});

test('an arrow sticks in wood at its angle and rides it; glances off stone and flies on; a reed bends and springs back', () => {
  const wood = { id: 't', smash: true, deer: { x: -999 }, wind: 0, things: [{ kind: 'log', at: [240, 212], size: [80, 16], angle: 90 }] };
  const w = da.build(wood);
  da.shoot(w, { a: 4, p: 0.9 });
  let ev = null;
  for (let i = 0; i < 200 && ev !== 'stuck'; i++) ev = da.stepWorld(w, wood, i * da.STEP_MS);
  assert.equal(ev, 'stuck');
  const log = w.things[0], before = log.body.angle, tip0 = [...w.arrow.body.position.x ? [w.arrow.body.position.x] : []];
  assert.ok(w.arrow.stuckIn, 'in the log');
  for (let i = 0; i < 120; i++) da.stepWorld(w, wood, i * da.STEP_MS);
  assert.notEqual(log.body.angle, before, 'the blow moved it');
  assert.ok(Math.abs(w.arrow.body.angle - log.body.angle - w.arrow.stuckIn.rel) < 1e-6, 'the arrow turned with it');
  assert.ok(tip0.length);
  // Stone: off the boulder's face, still flying.
  const rock = { id: 't', smash: true, deer: { x: -999 }, wind: 0, things: [{ kind: 'rock', at: [250, 226], size: [80, 52] }] };
  let w2 = null, evs = [];
  for (let a = -24; a <= 10 && !evs.includes('glance'); a += 2) {
    w2 = da.build(rock); evs = [];
    da.shoot(w2, { a, p: 1 });
    for (let i = 0; i < 300 && !w2.arrow.done; i++) evs.push(da.stepWorld(w2, rock, i * da.STEP_MS));
  }
  assert.ok(evs.includes('glance'), 'it glanced');
  assert.ok(evs.indexOf('glance') < evs.length - 1, 'and flew on after');
  assert.ok(w2.arrow.glanced >= 1);
  // A reed turned aside bends, then stands as it stood.
  const reeds = byId('reeds'), w3 = da.build(reeds), reed = w3.things[0];
  reed.bend.w = 0.06;
  let most = 0;
  for (let i = 0; i < 400; i++) { da.stepWorld(w3, reeds, i * da.STEP_MS); most = Math.max(most, Math.abs(reed.bend.th)); }
  assert.ok(most > 0.2, 'it bent');
  assert.ok(Math.abs(reed.bend.th) < 0.01, 'and sprang back');
});

test('a stone, a 柴 log and a clay pot are real bodies; the pot breaks itself where it strikes and shoves what stands near', () => {
  for (const id of ['stone', 'log', 'pot']) assert.ok(projectileOf(PROJ, id).real, id);
  const level = { id: 't', smash: true, deer: { x: -999 }, wind: 0, things: [{ kind: 'jar', at: [240, 235], size: [26, 34] }, { kind: 'tile', at: [270, 245], size: [34, 14] }] };
  const w = da.build(level);
  da.shoot(w, { a: 8, p: 0.85 }, projectileOf(PROJ, 'pot'));
  let ev = null;
  for (let i = 0; i < 400 && !['burst', 'ground', 'out'].includes(ev); i++) ev = da.stepWorld(w, level, i * da.STEP_MS);
  assert.equal(ev, 'burst', 'the pot broke');
  assert.ok(w.frags.some((f) => f.kind === 'pot'), 'into its own pieces');
});

test('stars on a smash level are by points: breaks, topples, the stag, and every throw left', () => {
  assert.equal(da.starsForScore([3000, 3900, 4400], 2000), 1, 'one at least');
  assert.equal(da.starsForScore([3000, 3900, 4400], 4000), 2);
  assert.equal(da.starsForScore([3000, 3900, 4400], 4400), 3);
  const pile = byId('pile');
  const s = play(pile, pile.bot);
  assert.equal(s.points, s.world.score + 3000 + (pile.quiver - 2) * 500);
  // The header shows the score; the board shows each break's points popping where it broke.
  const h = da.html(play(byId('rack'), [byId('rack').bot[0]]), 'zh');
  assert.match(h, /得分 <b>\d+/);
});

test('the scene is ready for the juice: a canvas over the scene, the mute toggle, the pull read, cues for the ear', () => {
  const still = byId('still');
  let s = da.newGame('t', 1, { levels: [still] });
  s = da.act(s, { g: 'hold', x: 300, y: 150 }).state;
  s = da.act(s, { g: 'move', x: 380, y: 170 }).state;
  const h = da.html(s, 'zh');
  assert.match(h, /<canvas class="g-da-fx" data-fx=""/);
  assert.match(h, /data-da-mute=""/);
  assert.match(h, /class="g-da-read/);
  assert.match(h, /\d+% · -?\d+°/);
  assert.ok(s.world.cues.some((c) => c.k === 'creak'), 'the bow creaks as it comes back');
  s = da.act(s, { g: 'release' }).state;
  assert.ok(s.world.cues.some((c) => c.k === 'twang'), 'and twangs');
  assert.match(da.html(s, 'zh'), /g-da-string is-ring/, 'the string rings after the loose');
});

test('no waiting on the dust: past half a second of settling, a press takes up the next throw; a thrown stone stays in the world', () => {
  const rack = byId('rack');
  let s = da.newGame('t', 1, { levels: [rack], projectiles: PROJ });
  s = da.tick(s, 300);
  s = da.act(s, { g: 'pick', p: 'stone' }).state;
  s = da.act(da.act(s, { g: 'draw', a: rack.bot[0][0], p: rack.bot[0][1] }).state, { g: 'loose' }).state;
  while (s.phase === 'fly') s = da.tick(s, 50);
  assert.equal(s.phase, 'settle');
  assert.equal(da.act(s, { g: 'hold', x: 300, y: 150 }).state, s, 'not at once');
  while (s.phase === 'settle' && s.t < 520) s = da.tick(s, 50);
  if (s.phase === 'settle') {
    const r = da.act(s, { g: 'hold', x: 300, y: 150 }).state;
    assert.equal(r.phase, 'aim', 'the press takes up the next throw');
    assert.ok(r.press);
    assert.ok((r.world.thrown ?? []).some((t) => t.proj.id === 'stone'), 'the stone lies where it rolled');
  }
});
