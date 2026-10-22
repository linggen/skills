// 腾云 on Phaser with real physics (setpieces/tengyun.js, 10-22 — Hanli: 「yinyue飞天那一场, 是否也可以用游戏引擎改,
// 那个支持重力? phraser?」 → 「A」: the same beat, no input). The world is a small matter.js one stepped on the piece's
// own clock: she stands, the cloud on its springs lifts her, rocks at 「晃了一晃」, goes at 「噗」, and she lands on
// the second 「扑通」 waits for — at every frame size, the same every time it is stepped. The piece is a scene of the
// stage's one Phaser game (kit/stage.js layer `piece`), under the beat's words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matter } from '../scripts/games/physics.js';
import * as T from '../scripts/setpieces/tengyun.js';
import { LAYERS, hostFor } from '../scripts/kit/stage.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FRAMES = [[1000, 625], [1000, 562], [1000, 2160], [1000, 1800]]; // 1440×900 and 16:9 desks, 390-wide phones
const STEP = 1 / 60;

test('tengyun: drawn by Phaser, the cues on the world\'s seconds — 「晃了一晃」 at the wobble, 「扑通」 at the landing', () => {
  assert.equal(T.ENGINE, 'phaser');
  const [wobble, thump] = T.CUES;
  assert.equal(wobble.t, T.TIMES.WOBBLE[0]);
  assert.equal(thump.t, T.LAND);
  assert.ok(Math.abs(T.LAND - (T.TIMES.POP + T.FALL)) < 1e-9);
  assert.ok(T.FALL >= 0.36 && T.FALL <= 0.6, 'a real fall, not rushed (「动画太快了」)');
  assert.ok(T.TIMES.END >= 5.5 && T.TIMES.END <= 7, '~6 s, as before');
});

test('tengyun: the world — up on the cloud by the wobble, rocked by it, down on the grass at the cue, the same every time', () => {
  for (const [W, H] of FRAMES) {
    const lay = T.layout(W, H);
    const sky = T.skyOf(Matter, lay);
    sky.to(T.TIMES.RISE[0] - 0.05);
    assert.ok(Math.abs(sky.ground - sky.her().feet) < lay.h * 0.01, `${W}×${H}: standing on the grass before the rise`);
    sky.to(T.TIMES.WOBBLE[0] - 0.02);
    const up = sky.ground - sky.her().feet;
    assert.ok(up > lay.rise * 0.9 && up < lay.rise * 1.1, `${W}×${H}: half a zhang up at the wobble (${(up / lay.rise).toFixed(2)} of the rise)`);
    let swing = 0, lean = 0;
    for (let t = T.TIMES.WOBBLE[0]; t < T.TIMES.POP; t += STEP) {
      sky.to(t);
      swing = Math.max(swing, Math.abs(sky.cloud().a));
      lean = Math.max(lean, Math.abs(sky.her().a));
      assert.ok(sky.ground - sky.her().feet > lay.rise * 0.8, `${W}×${H}: still on the cloud at ${t.toFixed(2)}`);
    }
    assert.ok(swing > 0.1, `${W}×${H}: the cloud really rocks (${(swing * 57.3).toFixed(1)}°)`);
    assert.ok(lean < 0.2, `${W}×${H}: she rocks with it and keeps her feet (${(lean * 57.3).toFixed(1)}°)`);
    sky.to(T.TIMES.END);
    assert.ok(sky.landed, `${W}×${H}: she lands`);
    assert.ok(Math.abs(sky.landed.t - T.LAND) <= STEP + 1e-6, `${W}×${H}: on the cue's second (${sky.landed.t.toFixed(3)} vs ${T.LAND})`);
    assert.ok(Math.abs(sky.ground - sky.her().feet) < lay.h * 0.01, `${W}×${H}: down on the grass at the end, the bounce over`);
    assert.ok(Math.abs(sky.landed.x - lay.x) < lay.h * 0.1, `${W}×${H}: about where she stood`);
    // A function of time: stepped back and again, the same landing.
    const first = { ...sky.landed };
    sky.to(1).to(T.TIMES.END);
    assert.deepEqual(sky.landed, first, `${W}×${H}: deterministic`);
  }
});

test('tengyun: a small bounce on landing — up again a little, then down', () => {
  const lay = T.layout(1000, 625), sky = T.skyOf(Matter, lay);
  sky.to(T.LAND);
  let peak = 0;
  for (let t = T.LAND; t < T.LAND + 0.4; t += STEP) peak = Math.max(peak, sky.to(t).ground - sky.her().feet);
  assert.ok(peak > lay.h * 0.005 && peak < lay.h * 0.08, `a bounce of ${(peak / lay.h).toFixed(3)} h`);
});

test('tengyun: the light as functions of time — puffs gather, ride, burst and go; the grass kicked up falls and goes; the sit squashes and springs back', () => {
  const lay = T.layout(1000, 625);
  const puffs = T.puffsOf(lay);
  assert.ok(puffs.some((p) => p.cloudlet) && puffs.some((p) => !p.cloudlet), 'painted cloudlets and soft light');
  for (const p of puffs) {
    assert.equal(T.puffAt(p, T.TIMES.STAMP, lay), null, 'nothing before the stamp');
    const ride = T.puffAt(p, T.TIMES.WOBBLE[0], lay);
    assert.ok(ride && Math.abs(ride.x - p.slot[0]) < 1e-6 + lay.h * 0.001 && ride.a > 0, 'gathered into its place on the cloud');
    const out = T.puffAt(p, T.TIMES.POP + 0.3, lay);
    assert.ok(Math.hypot(out.x - p.slot[0], out.y - p.slot[1]) > lay.h * 0.2, 'flung out at 「噗」');
    assert.equal(T.puffAt(p, T.TIMES.POP + 0.8, lay), null, 'and gone');
  }
  for (const k of T.kickOf(lay)) {
    assert.equal(T.kickAt(k, -0.01, lay), null);
    assert.ok(T.kickAt(k, 0.15, lay).y < 0, 'kicked up');
    assert.equal(T.kickAt(k, k.life + 0.01, lay), null, 'and gone');
  }
  assert.ok(T.squashAt(0)[0] < 0.9 && T.squashAt(0)[1] > 1.05, 'squashed down and wide as she lands');
  assert.ok(Math.abs(T.squashAt(0.8)[0] - 1) < 0.01, 'sprung back');
});

test('tengyun: a scene on the stage\'s one game, under the beat\'s words; the runner ends its layer, never the stage', () => {
  assert.deepEqual(LAYERS.piece, { z: 0, fps: 60, under: '.spback' });
  assert.deepEqual(hostFor(['piece']), { z: 0, fps: 60, under: '.spback' });
  assert.equal(hostFor(['piece', 'moment']).z, LAYERS.moment.z, 'the 回 turn over it');
  const runner = read('scripts/setpiece.js');
  assert.match(runner, /def\.ENGINE === 'phaser'/);
  assert.match(runner, /host\.closest\?\.\('\.spback'\) \? host\.closest\('\.view'\) : null/, 'under a beat it rides the stage\'s game');
  assert.match(runner, /if \(stage\?\.owns\('piece', layer\)\) stage\.stop\('piece'\);/);
  assert.match(runner, /if \(stage && box\.contains\(stage\.el\)\) stage\.destroy\(\);/, 'a box\'s own game goes with the box');
  assert.match(read('scripts/story.css'), /\.view \.spback:has\(\.sphost\.ongl\) \{ background: none; \}/);
  const src = read('scripts/setpieces/tengyun.js');
  assert.match(src, /from '\.\.\/games\/physics\.js'/, 'the games\' own matter.js');
  assert.doesNotMatch(src, /PIXI|gsap|paintedStage/, 'no Pixi, no GSAP');
});
