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
import { Matter } from '../scripts/games/physics.js';
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
  for (const [a, p, pick, tapAt] of throws) {
    for (let t = 0; t < 3000 && s.phase === 'aim' && s.flushAt != null && s.clock - s.flushAt < da.FLEE_MS + 100; t += step) s = da.tick(s, step);
    if (s.phase !== 'aim') break;
    s = da.act(s, { g: 'pick', p: pick }).state;
    s = da.act(da.act(s, { g: 'draw', a, p }).state, { g: 'loose' }).state;
    for (let t = 0; t < 9000 && ['fly', 'settle'].includes(s.phase); t += step) {
      // A tap on its step (a multiple of 3, so a 10 ms and a 50 ms clock tap on the same world step).
      if (tapAt != null && s.phase === 'fly' && s.world.arrow && !s.world.arrow.tapped && s.world.arrow.steps >= tapAt) s = da.act(s, { g: 'tap' }).state;
      if (['fly', 'settle'].includes(s.phase)) s = da.tick(s, step);
    }
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
      assert.ok(s.world.score > 0 || (s.used === 1 && s.said === 'clean'), 'something knocked down or broken (or one arrow through the gap, to the heart)');
    }
    assert.equal(where(runs[1]), where(runs[2]), 'deterministic: the same shot, the same world');
    assert.equal(runs[0].world.score, runs[1].world.score, 'the clock\'s step changes nothing');
  });
}

test('the 柴房: a stone at the stacked crates brings them down on the stag — felled, one throw', () => {
  const shed = byId('shed');
  const s = play(shed, [shed.bot[0]]);
  assert.equal(s.phase, 'hit');
  assert.equal(s.said, 'felled', 'what fell on it felled it');
  assert.ok(s.world.things.filter((t) => t.kind === 'crate').some((t) => t.toppled || t.broken), 'the stack came down');
  assert.equal(s.used, 1);
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
  for (const level of SMASH) {
    const s = play(level, level.bot);
    assert.equal(s.points, s.world.score + (s.offHeart ? 2000 : 3000) + (level.quiver - s.used) * 500, level.id);
  }
  // The header shows the score; the board shows each break's points popping where it broke.
  const h = da.html(play(byId('camp'), [byId('camp').bot[0]]), 'zh');
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
  const camp = byId('camp');
  let s = da.newGame('t', 1, { levels: [camp], projectiles: PROJ });
  s = da.tick(s, 300);
  s = da.act(s, { g: 'pick', p: 'stone' }).state;
  s = da.act(da.act(s, { g: 'draw', a: 40, p: 0.4 }).state, { g: 'loose' }).state; // a short lob onto the bank: it lands and rolls
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

/* ── The forts' pieces (Hanli 10-19: 「游戏里面没有箱子可以砸碎, 或者树等障碍, 难度比较低」) ──────────── */

const lone = (things) => ({ id: 't', smash: true, deer: { x: -999 }, wind: 0, things });
/** Shoot `proj` (an id) at the first aim in a sweep whose flight says `want` (an event, or a test on
    the world); → { w, evs, aim } or null. */
function shootUntil(level, want, { proj = 'arrow', p = 1, from = -24, to = 40, tapAt = null, steps = 400 } = {}) {
  for (let a = from; a <= to; a += 1) {
    const w = da.build(level), evs = [];
    da.shoot(w, { a, p }, projectileOf(PROJ, proj));
    for (let i = 0; i < steps && !w.arrow.done; i++) {
      if (tapAt != null && (typeof tapAt === 'function' ? tapAt(w) : i === tapAt)) da.tapWorld(w, level, i * da.STEP_MS);
      evs.push(da.stepWorld(w, level, i * da.STEP_MS));
    }
    for (let i = 0; i < 120; i++) da.stepWorld(w, level, (steps + i) * da.STEP_MS); // what was struck comes down
    if (typeof want === 'function' ? want(w, evs) : evs.includes(want)) return { w, evs, aim: a };
  }
  return null;
}

test('a crate: an arrow sticks in it; a thrown stone breaks it into planks', () => {
  const lv = lone([{ kind: 'crate', at: [240, 235], size: [34, 34] }]);
  assert.ok(shootUntil(lv, 'stuck'), 'the arrow bites into the wood');
  assert.equal(shootUntil(lv, 'stuck').w.things[0].broken, false);
  const r = shootUntil(lv, (w) => w.things[0].broken, { proj: 'stone' });
  assert.ok(r, 'a stone breaks it');
  const planks = r.w.frags.filter((f) => f.kind === 'crate');
  assert.equal(planks.length, KINDS.crate.shards);
  // Planks: each piece runs the crate's whole width (strips), not a chunk.
  for (const f of planks) { const xs = f.poly.map(([x]) => x); assert.ok(Math.max(...xs) - Math.min(...xs) > 30, 'a plank spans it'); }
});

test('bamboo: an arrow goes through a basket (flying on, the basket shoved); a stone smashes it', () => {
  const lv = lone([{ kind: 'basket', at: [240, 236], size: [36, 28] }]);
  const r = shootUntil(lv, 'pierced');
  assert.ok(r, 'through the weave');
  const after = r.evs.slice(r.evs.indexOf('pierced') + 1).filter(Boolean);
  assert.ok(!after.includes('stuck'), 'not stopped by it');
  assert.equal(r.w.things[0].broken, false);
  assert.ok(Math.hypot(r.w.things[0].body.position.x - 240, r.w.things[0].body.position.y - 236) > 2, 'it tumbled');
  assert.ok(shootUntil(lv, (w) => w.things[0].broken, { proj: 'stone' }), 'a stone smashes it');
});

test('dressed stone: an arrow glances, a thrown stone only knocks it, a 五雷符 shatters it', () => {
  const lv = lone([{ kind: 'block', at: [240, 240], size: [32, 24] }]);
  assert.ok(shootUntil(lv, 'glance'), 'the arrow glances');
  for (let a = -24; a <= 40; a += 2) {
    const w = da.build(lv);
    da.shoot(w, { a, p: 1 }, projectileOf(PROJ, 'stone'));
    for (let i = 0; i < 500; i++) da.stepWorld(w, lv, i * da.STEP_MS);
    assert.equal(w.things[0].broken, false, `a stone at ${a}° does not break it`);
  }
  const near = (w) => !w.arrow.tapped && Math.hypot(w.arrow.tip[0] - 240, w.arrow.tip[1] - 240) < 16; // tapped as it reaches it
  const r = shootUntil(lv, (w) => w.things[0].broken, { proj: 'talisman', p: 0.6, tapAt: near, from: -24, to: 60 });
  assert.ok(r, 'the thunder breaks it');
  assert.ok(r.w.broke.some((b) => b.kind === 'block'));
});

test('ice: an arrow skids off it; under the same shove it slides much further than a crate', () => {
  const ice = lone([{ kind: 'ice', at: [200, 239], size: [40, 26] }]);
  assert.ok(shootUntil(ice, 'glance'), 'the arrow skids off');
  const slide = (kind) => {
    const lv = lone([{ kind, at: [200, 239], size: [40, 26] }]), w = da.build(lv), b = w.things[0].body;
    Matter.Sleeping.set(b, false);
    Matter.Body.setVelocity(b, { x: -3, y: 0 });
    for (let i = 0; i < 300; i++) da.stepWorld(w, lv, i * da.STEP_MS);
    return 200 - b.position.x;
  };
  assert.ok(slide('ice') > 2 * slide('crate'), `ice ${slide('ice').toFixed(1)} vs crate ${slide('crate').toFixed(1)}`);
});

test('a bush lets the arrow through, slowed; a thrown stone too', () => {
  const lv = lone([{ kind: 'bush', at: [250, 234], size: [56, 36] }]);
  const r = shootUntil(lv, 'brushed');
  assert.ok(r, 'into the bush');
  const w = da.build(lv);
  da.shoot(w, { a: r.aim, p: 1 });
  let before = null, after = null;
  for (let i = 0; i < 300 && !w.arrow.done; i++) {
    const v = Math.hypot(w.arrow.body.velocity.x, w.arrow.body.velocity.y), ev = da.stepWorld(w, lv, i * da.STEP_MS);
    if (ev === 'brushed') { before = v; after = Math.hypot(w.arrow.body.velocity.x, w.arrow.body.velocity.y); break; }
  }
  assert.ok(after < before * 0.6, `slowed: ${before?.toFixed(2)} → ${after?.toFixed(2)}`);
  assert.equal(w.things[0].body.isSensor, true, 'nothing stands on it, nothing breaks on it');
});

test('a pine: its trunk takes the arrow; a bough turns one that meets it at a slant (still flying), catches one head on', () => {
  const trunk = lone([{ kind: 'trunk', at: [240, 167], size: [22, 170] }]);
  assert.ok(shootUntil(trunk, 'stuck'), 'into the trunk');
  const bough = lone([{ kind: 'bough', at: [250, 150], size: [140, 12], angle: 0 }]);
  const r = shootUntil(bough, 'deflect', { from: 0, to: 40, p: 0.9 });
  assert.ok(r, 'a slanting arrow is turned off the bough');
  const i = r.evs.indexOf('deflect');
  assert.ok(r.evs.slice(i + 1).some((e) => e === 'ground' || e === 'out'), 'and flies on, to come down somewhere');
  assert.ok(r.w.arrow.glanced >= 1);
  // Head on (a steep arrow down onto it): caught.
  const steep = lone([{ kind: 'bough', at: [300, 120], size: [60, 12], angle: -60 }]);
  assert.ok(shootUntil(steep, 'stuck', { from: -10, to: 30 }), 'caught head on');
});

test('a dead tree: an arrow sticks and it stands; a stone fells it — it hinges at its root, comes down the way it was struck, and scores', () => {
  const lv = lone([{ kind: 'deadtree', at: [250, 167], size: [16, 170] }]);
  const a = shootUntil(lv, 'stuck');
  assert.ok(a && !a.w.things[0].felled, 'an arrow does not fell it');
  assert.ok(a.w.things[0].body.isStatic, 'rooted');
  const r = shootUntil(lv, (w) => w.things[0].felled, { proj: 'stone', from: 10, to: 60 });
  assert.ok(r, 'a stone fells it');
  const t = r.w.things[0];
  for (let i = 0; i < 300; i++) da.stepWorld(r.w, lv, (600 + i) * da.STEP_MS);
  assert.ok(t.body.angle < -1, `it lies down toward the stag (left): ${t.body.angle.toFixed(2)}`);
  assert.ok(r.w.broke.some((b) => b.kind === 'deadtree' && b.points === KINDS.deadtree.points));
});

test('the 短飞剑\'s tap: straight on, and through the first block it meets (it breaks); the next stops it', () => {
  const lv = lone([{ kind: 'door', at: [260, 210], size: [20, 84], fixed: true }, { kind: 'door', at: [200, 210], size: [20, 84], fixed: true }]);
  // no tap: the sword sticks in the first door
  const plain = shootUntil(lv, 'stuck', { proj: 'sword', from: -6, to: 10 });
  assert.ok(plain && !plain.w.things[0].broken);
  const r = shootUntil(lv, (w) => w.things[0].broken, { proj: 'sword', tapAt: 6, from: -6, to: 10 });
  assert.ok(r, 'the dash breaks through the first');
  assert.equal(r.w.things[1].broken, false, 'one block only');
  assert.ok(r.evs.includes('broke') && r.evs.includes('stuck'), 'through one, into the next');
});

test('a big collapse: the camera is cued to look over it (three breaks or falls within a second)', () => {
  const lv = lone([{ kind: 'post', at: [200, 214], size: [12, 76] }, { kind: 'post', at: [300, 214], size: [12, 76] }, { kind: 'beam', at: [250, 171], size: [130, 10] },
    { kind: 'tile', at: [220, 159], size: [34, 14] }, { kind: 'tile', at: [260, 159], size: [34, 14] }, { kind: 'jar', at: [250, 235], size: [26, 34] }]);
  const r = shootUntil(lv, (w) => w.cues.some((c) => c.k === 'collapse'), { proj: 'stone', from: -10, to: 40 });
  assert.ok(r, 'a collapse is cued');
  const c = r.w.cues.find((x) => x.k === 'collapse');
  assert.ok(c.at[0] > 150 && c.at[0] < 330, 'at the wreck');
});

test('the shards are irregular: a seeded Voronoi of the piece, convex cells that cover it', () => {
  for (const [w, h, k] of [[34, 34, 4], [80, 16, 4], [26, 34, 6], [32, 24, 3]]) {
    const parts = cutOf(w, h, k, 7);
    assert.equal(parts.length, k);
    const area = (poly) => Math.abs(poly.reduce((a, [x, y], i) => { const [u, v] = poly[(i + 1) % poly.length]; return a + x * v - u * y; }, 0) / 2);
    assert.ok(Math.abs(parts.reduce((a, p) => a + area(p), 0) - w * h) < 1e-6, 'no gap, no overlap');
    for (const p of parts) {
      const turns = p.map((a, i) => { const b = p[(i + 1) % p.length], c = p[(i + 2) % p.length]; return Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])); }).filter(Boolean);
      assert.ok(turns.every((t) => t === turns[0]), 'convex');
    }
    // Not a grid: some edge inside the piece runs on a slant.
    const slanted = parts.some((p) => p.some((a, i) => { const b = p[(i + 1) % p.length]; return Math.abs(a[0] - b[0]) > 0.5 && Math.abs(a[1] - b[1]) > 0.5; }));
    assert.ok(slanted, `${w}×${h}: irregular`);
  }
});
