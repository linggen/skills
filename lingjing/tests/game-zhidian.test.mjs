// 隔空指点 (games/zhidian.js, Hanli 10-21: 「如果手指指向屏幕, 是否可行」): 剑诀 judged by joint angles on 3D world points
// (judge3d.js) pointing up AND at the lens, the near-misses it refuses, the 准星's mapping and smoothing, the jab
// (poke.js) against drift, tremble and sweeps, a made-up player through the whole pipe to a win, and the camera-less
// path that offers one line. Hands are synthetic (pose.js, turned and depth-squashed): real-camera play is Hanli's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makes } from '../scripts/games/jieyin/judge.js';
import { bendOf, gap3d, makes3d, sealOf3d } from '../scripts/games/jieyin/judge3d.js';
import { poseOf } from '../scripts/games/jieyin/pose.js';
import { aimPoint, follow, fromField, toField } from '../scripts/games/zhidian/aim.js';
import { poke, sizeOf, startPoke } from '../scripts/games/zhidian/poke.js';
import { land, newField, over, starsOf, struck, throwAt, tick } from '../scripts/games/zhidian/core.js';
import { bot, handsAt, jianHand, pointing, shapes } from '../scripts/games/zhidian/fake.js';
import { meta, mount, unavailableHtml, levelAsked } from '../scripts/games/zhidian.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const kit = JSON.parse(read('../worlds/jiuding/levels/zhidian.json'));
const sealKit = JSON.parse(read('../worlds/jiuding/levels/jieyin.json'));
const JIAN = sealKit.seals[kit.seal];
const seals = { [kit.seal]: JIAN };
const K = kit.judge3d;
const level = kit.levels[0];

/* A little tremble: every point moved up to ±`cm` (seeded, so a failure repeats). */
function noisy(hand, cm, seed = 1) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; };
  return hand.map(({ x, y, z }) => ({ x: x + r() * cm, y: y + r() * cm, z: z + r() * cm }));
}
const mirrored = (hand) => hand.map(({ x, y, z }) => ({ x: -x, y, z }));
const yawed = (hand, deg) => { const a = (deg * Math.PI) / 180; return hand.map(({ x, y, z }) => ({ x: x * Math.cos(a) + z * Math.sin(a), y, z: -x * Math.sin(a) + z * Math.cos(a) })); };

const POSES = [];
for (const deg of [0, 30, 60, 75, 90]) for (const squash of [1, 0.5, 0.3]) POSES.push({ deg, squash });

test('the level: every knob the game reads is data, and the seal is jieyin.json\'s own rule', () => {
  assert.equal(kit.seal, 'jian');
  assert.deepEqual(JIAN.ext, ['index', 'middle']);
  for (const k of ['extDeg', 'curlDeg', 'near', 'far', 'loose', 'graceMs']) assert.equal(typeof K[k], 'number', k);
  for (const k of ['windowMs', 'grow', 'maxShift', 'coolMs', 'fps']) assert.equal(typeof kit.poke[k], 'number', k);
  assert.equal(kit.aim.box.length, 4);
  assert.ok(kit.hint.far < sealKit.hint.far, 'a pointed hand looks short: the hint\'s too-far comes later');
  assert.ok(level.seconds <= 90 && level.stars.length === 3 && level.lead.zh && level.lead.en && level.end.zh && level.end.en);
  assert.ok(level.spawn.foes.every((f) => fs.existsSync(new URL(`../scripts/games/shouqiang/art/${f.id}-walk-1.webp`, import.meta.url))));
  assert.equal(levelAsked(kit, {}, '?lv=1').id, 'shandao');
});

test('剑诀 counts pointing up AND at the lens, depth squashed to 0.3, either hand, turned aside, trembling', () => {
  for (const { deg, squash } of POSES) {
    const h = jianHand(JIAN, deg, squash);
    for (const v of [h, mirrored(h), yawed(h, 25), yawed(h, -25), noisy(h, 0.15, deg * 7 + squash * 10)]) {
      assert.equal(sealOf3d([v], seals, K), 'jian', `${deg}° squash ${squash}: index ${bendOf(v, 'index').toFixed(0)}° ring ${bendOf(v, 'ring').toFixed(0)}° gap ${gap3d(v, 'index.tip', 'middle.tip').toFixed(2)}`);
    }
  }
  // The straight fingers stay far under extDeg and the folded ones far over curlDeg (the margins the numbers have).
  const worst = POSES.map(({ deg, squash }) => jianHand(JIAN, deg, squash));
  assert.ok(Math.max(...worst.flatMap((h) => [bendOf(h, 'index'), bendOf(h, 'middle')])) < K.extDeg / 2);
  assert.ok(Math.min(...worst.flatMap((h) => [bendOf(h, 'ring'), bendOf(h, 'pinky')])) > K.curlDeg * 1.4);
});

test('…bent forward at the knuckles too (the palm up, the two fingers at the lens)', () => {
  const up = poseOf(JIAN);
  const knuckle = up.map((p, i) => {
    if (i < 6 || i > 12) return p; // index and middle joints past the root
    const m = up[i < 9 ? 5 : 9], r = -Math.PI / 2, d = { y: p.y - m.y, z: p.z - m.z };
    return { x: p.x, y: m.y + d.y * Math.cos(r) - d.z * Math.sin(r), z: m.z + d.y * Math.sin(r) + d.z * Math.cos(r) };
  });
  for (const squash of [1, 0.5, 0.3]) assert.equal(sealOf3d([knuckle.map((p) => ({ ...p, z: p.z * squash }))], seals, K), 'jian', `squash ${squash}`);
});

test('the reach-ratio judge (judge.js) loses 剑诀 once a pointed hand\'s depth is squashed — why judge3d exists', () => {
  const J = sealKit.judge;
  assert.equal(makes(jianHand(JIAN, 0, 1), JIAN, J), true, 'fingers up: fine');
  assert.equal(makes(jianHand(JIAN, 90, 1), JIAN, J), true, 'at the lens with true depth: fine');
  for (const squash of [0.5, 0.3]) assert.equal(makes(jianHand(JIAN, 90, squash), JIAN, J), false, `at the lens, depth ×${squash}`);
});

test('near-misses are not 剑诀, up or pointed: a V, the index alone, the ring finger up, an open palm, a fist', () => {
  for (const [name, make] of Object.entries(shapes)) {
    for (const { deg, squash } of POSES) {
      const h = pointing(make(), deg, squash);
      assert.equal(makes3d(h, JIAN, K), false, `${name} ${deg}° ×${squash}`);
    }
  }
  // …and a held 剑诀's slack does not let a V or the index alone in.
  for (const name of ['v', 'one']) assert.equal(sealOf3d([pointing(shapes[name](), 75, 0.4)], seals, K, 'jian'), null, name);
  assert.equal(sealOf3d([], seals, K), null);
  assert.equal(sealOf3d([[]], seals, K), null, 'a broken hand is no seal');
});

test('the 准星: the fingertips\' midpoint, mirrored, the inner box stretched to the field, clamped; fromField its inverse', () => {
  const A = kit.aim, [x0, y0, x1, y1] = A.box;
  const h = handsAt({ at: { x: 0.5, y: 0.45 }, size: 0.3, world: jianHand(JIAN) }).image[0];
  const p = aimPoint(h, A);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.45) < 1e-9);
  const near = (a, b) => assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, `${JSON.stringify(a)} ≈ ${JSON.stringify(b)}`);
  near(toField({ x: 0.5, y: (y0 + y1) / 2 }, A), { x: 0.5, y: 0.5 });
  assert.ok(toField({ x: 0.3, y: 0.45 }, A).x > 0.5, 'the hand at the picture\'s left is the player\'s right: as in a mirror');
  assert.deepEqual(toField({ x: 1 - x0, y: y0 }, A), { x: 0, y: 0 });
  assert.deepEqual(toField({ x: 1 - x1, y: y1 }, A), { x: 1, y: 1 });
  assert.deepEqual(toField({ x: 0, y: 1 }, A), { x: 1, y: 1 }, 'clamped');
  for (const f of [{ x: 0.1, y: 0.9 }, { x: 0.73, y: 0.2 }]) {
    const back = toField(fromField(f, A), A);
    assert.ok(Math.abs(back.x - f.x) < 1e-9 && Math.abs(back.y - f.y) < 1e-9);
  }
});

test('the 准星 holds still through a tremble inside the dead zone and settles on a real move within ~4 τ', () => {
  const A = kit.aim;
  let s = { x: 0.5, y: 0.5 };
  for (let i = 0; i < 60; i += 1) s = follow(s, { x: 0.5 + (i % 2 ? 1 : -1) * A.dead * 0.8, y: 0.5 }, 33, A);
  assert.deepEqual(s, { x: 0.5, y: 0.5 }, 'tremble: not a hair');
  let t = 0;
  while (Math.hypot(s.x - 0.8, s.y - 0.3) >= A.dead && t < 2000) { s = follow(s, { x: 0.8, y: 0.3 }, 33, A); t += 33; }
  assert.ok(t <= 4 * A.tauMs + 66, `settled in ${t} ms`);
  assert.deepEqual(follow(null, { x: 0.2, y: 0.2 }, 33, A), { x: 0.2, y: 0.2 }, 'the first sight is taken as is');
});

/* A camera's stream of samples: `size(t)` and `aim(t)` over `ms` at `fps`, the seal held unless said. */
function run({ ms, fps = 30, size, aim = () => ({ x: 0.5, y: 0.5 }), sealed = () => true, knobs = kit.poke }) {
  let s = startPoke();
  const shots = [];
  for (let t = 0; t <= ms; t += 1000 / fps) {
    const r = poke(s, { t, size: size(t), aim: aim(t), sealed: sealed(t) }, knobs);
    s = r.state;
    if (r.shot) shots.push(r.shot);
  }
  return shots;
}
const jab = (at, dur = 160, k = 1.3, base = 0.3) => (t) => (t < at ? base : t < at + dur ? base * (1 + (k - 1) * ((t - at) / dur)) : base * k);
const wobble = (t, amp = 0.03) => 1 + amp * Math.sin(t / 37) * Math.cos(t / 53);

test('a jab fires once, at 30 and at 15 fps; the shot goes where the 准星 stood before the hand grew', () => {
  for (const fps of [30, 15]) {
    const shots = run({ ms: 1500, fps, size: (t) => jab(500)(t) * wobble(t, 0.02), aim: (t) => ({ x: 0.4 + (t > 500 ? 0.04 : 0), y: 0.5 }) });
    assert.equal(shots.length, 1, `${fps} fps`);
    assert.equal(shots[0].aim.x, 0.4, 'aimed before the jab moved the tips');
    assert.ok(shots[0].at >= 500 && shots[0].at <= 700, `fired ${shots[0].at.toFixed(0)} ms (jab from 500)`);
  }
  // Held forward after the jab: no second shot; a second jab after a draw-back: a second shot.
  const twice = (t) => (t < 1100 ? jab(400)(t) : jab(1400, 160, 1.3, 0.3)(t));
  assert.equal(run({ ms: 2400, size: twice }).length, 2);
});

test('not a jab: a hand drifting nearer, a tremble, a sweep across, a lost track, the seal not held, a slow push', () => {
  const none = (o, why) => assert.equal(run({ ms: 4000, ...o }).length, 0, why);
  none({ size: (t) => 0.25 * (1 + 0.3 * (t / 1000)) * wobble(t) }, 'drifting nearer 30 %/s with a 3 % tremble');
  none({ size: (t) => 0.3 * wobble(t, 0.05) }, 'a 5 % tremble');
  none({ size: (t) => 0.3 * (1 + 0.1 * Math.sin(t / 300)) }, 'rocking ±10 % nearer and back, once in ~2 s');
  none({ size: jab(500), aim: (t) => ({ x: 0.2 + 0.6 * Math.min(1, Math.max(0, (t - 450) / 300)), y: 0.5 }) }, 'the hand sweeping across while it grows');
  none({ size: jab(500), sealed: () => false }, 'no 剑诀');
  none({ size: jab(500, 900) }, 'pushed forward slowly (0.9 s)');
  assert.equal(poke(startPoke(), { t: 0 }, kit.poke).shot, null, 'no hand');
});

test('core: beasts come seeded from both sides on the lanes; an egg strikes the nearest within reach, else misses', () => {
  let f = newField(level, 'a');
  for (let i = 0; i < 200; i += 1) f = tick(f, 50);
  assert.ok(f.n >= 4 && f.beasts.length <= level.spawn.max);
  assert.ok(f.beasts.every((b) => level.spawn.lanes.includes(b.y)));
  const g = newField(level, 'a');
  let g2 = g; for (let i = 0; i < 200; i += 1) g2 = tick(g2, 50);
  assert.deepEqual(g2.beasts, f.beasts, 'the same seed, the same beasts');
  const b = f.beasts[0];
  assert.equal(struck(f.beasts, { x: b.x + 0.02, y: b.y }, level.spawn.r), b);
  assert.equal(struck([b], { x: b.x + 0.3, y: b.y }, level.spawn.r), null);
  let s = throwAt({ ...f, beasts: [b] }, { x: b.x, y: b.y });
  assert.equal(land(s).events.length, 0, 'still in the air');
  s = { ...s, t: s.t + level.eggMs, beasts: [b] };
  const r = land(s);
  assert.equal(r.events[0].type, 'hit');
  assert.equal(r.state.hits, f.hits + 1);
  assert.deepEqual([starsOf(5, level.stars), starsOf(6, level.stars), starsOf(10, level.stars), starsOf(14, level.stars)], [0, 1, 2, 3]);
  assert.equal(over({ ...newField(level, 'b'), t: level.seconds * 1000 }), true);
});

test('the whole pipe: a made-up player who aims and jabs (fake.js bot → judge3d → 准星 → jab → field) wins ★★★ inside the minute', () => {
  for (const seed of ['s1', 's2', 's3']) {
    let f = newField(level, seed), b = null, shown = null, pk = startPoke(), sealT = -Infinity, last = 0;
    for (let t = 0; !over(f) || f.eggs.length; t += 33) {
      const r = bot(f, b, t, level, kit.aim, JIAN);
      b = r.bot;
      if (sealOf3d(r.hands.world, seals, K, t - sealT <= K.graceMs ? 'jian' : null)) sealT = t;
      const hand = r.hands.image[0];
      shown = follow(shown, toField(aimPoint(hand, kit.aim), kit.aim), t - last, kit.aim);
      last = t;
      const p = poke(pk, { t, size: sizeOf(hand), aim: shown, sealed: t - sealT <= K.graceMs }, kit.poke);
      pk = p.state;
      if (p.shot) f = throwAt(f, p.shot.aim);
      f = land(tick(f, 33)).state;
      if (t > 120000) break;
    }
    assert.equal(starsOf(f.hits, level.stars), 3, `${seed}: ${f.hits} hits of ${f.shots} shots in ${(f.t / 1000).toFixed(0)} s`);
    assert.ok(f.t < level.seconds * 1000, `${seed}: before time`);
  }
});

const canvasDoc = (gl) => ({ createElement: () => ({ getContext: () => (gl ? {} : null) }) });

test('no camera: one plain line that it needs one, nothing to tap, no lead card', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(String(u)), 'utf8')) });
  try {
    for (const lang of ['zh', 'en']) {
      const win = { location: { search: '?dev=1' }, navigator: {}, document: canvasDoc(true), performance: { now: () => 0 } };
      const doc = { defaultView: win, head: { append() {} }, querySelector: () => null, createElement: () => ({ dataset: {} }) };
      const container = { ownerDocument: doc, innerHTML: '' };
      const r = await mount(container, { lang, shell: { lead() { throw new Error('no lead card without a camera'); } } });
      assert.deepEqual(r, { won: false, left: true });
      assert.equal(container.innerHTML, unavailableHtml(lang));
      assert.doesNotMatch(container.innerHTML, /<button|zd-field/);
      assert.match(container.innerHTML, lang === 'en' ? /camera/ : /摄像头/);
    }
  } finally { globalThis.fetch = realFetch; }
});

test('the module: meta, pausable; the camera asked only by eye.js after 开始, off on pause / hidden / end; never shown; nothing from the network', () => {
  assert.equal(meta.name.zh, '隔空指点');
  assert.ok(meta.name.en && meta.how.zh && meta.how.en);
  assert.equal(meta.pause, true);
  const src = read('../scripts/games/zhidian.js');
  const parts = ['aim', 'poke', 'core', 'fake'].map((f) => read(`../scripts/games/zhidian/${f}.js`)).join('') + read('../scripts/games/jieyin/judge3d.js');
  assert.doesNotMatch(src, /getUserMedia/, 'the game never opens the camera itself');
  assert.doesNotMatch(src + parts, /https?:\/\//, 'nothing from the network');
  assert.ok(src.indexOf('shell.lead(') < src.indexOf('eye.start()'), 'the lead card (开始) before the camera');
  assert.match(src, /if \(p\) \{ eye\.pause\(\)/, 'paused: the camera off');
  assert.match(src, /if \(doc\.hidden\) \{ eye\.pause\(\)/, 'hidden: the camera off');
  assert.match(src, /eye\?\.close\(\)/, 'ended or left: closed');
  assert.doesNotMatch(src, /<canvas|drawImage|srcObject/, 'the camera\'s picture is never drawn');
  assert.match(src, /import \{ handHint \} from '\.\/jieyin\/hint\.js';/, 'the shared hand hint stands for the camera\'s view');
  assert.match(src, /fps: kit\.poke\.fps, numHands: 1/, 'the eye asked for the jab\'s rate, one hand');
  assert.match(read('../scripts/games/zhidian/zhidian.css'), /\.zd-eye \{[^}]*opacity: 0;/, 'the video element is there for frames, never seen');
  assert.match(src, /q\.get\('dev'\) === '1' && q\.get\('feed'\) === '1'/, 'the feed only on a dev link');
  const reg = JSON.parse(read('../worlds/jiuding/games.json'));
  assert.ok(reg.games.some((g) => g.id === 'zhidian' && g.group === 'main' && g.mechanic === '结印'));
});
