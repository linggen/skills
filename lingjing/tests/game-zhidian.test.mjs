// 隔空指点 (games/zhidian.js, Hanli 10-21: 「如果手指指向屏幕, 是否可行」; after his real-camera try 「往前戳触发攻击, 但
// 自动瞄准也可以」): 剑诀 judged by joint angles on 3D world points (judge3d.js) pointing up AND at the lens, the near-misses
// it refuses, the jab (poke.js) against drift and tremble, the egg's own aim (the tapped beast, else the one nearest the
// bottom), a made-up player through the whole pipe to a win, and the camera-less path that offers one line. Hands are synthetic (pose.js, turned and depth-squashed): real-camera play is Hanli's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makes } from '../scripts/games/jieyin/judge.js';
import { bendOf, gap3d, makes3d, sealOf3d } from '../scripts/games/jieyin/judge3d.js';
import { poseOf } from '../scripts/games/jieyin/pose.js';
import { poke, sizeOf, startPoke } from '../scripts/games/zhidian/poke.js';
import { focus, land, newField, over, starsOf, targetOf, throwEgg, tick } from '../scripts/games/zhidian/core.js';
import { bot, jianHand, pointing, shapes } from '../scripts/games/zhidian/fake.js';
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
  for (const k of ['windowMs', 'grow', 'coolMs', 'fps']) assert.equal(typeof kit.poke[k], 'number', k);
  assert.equal(kit.aim, undefined, 'no 准星 to aim (Hanli 10-21: 「剑诀往前戳, 不好操作」)');
  assert.equal(kit.poke.fps, 30, 'the jab needs the eye at 30 fps');
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
  // judge.js's reach ratio sinks under its 1.2 here (1.03–1.09 squashed): the straight fingers read bent.
  assert.equal(makes(knuckle.map((p) => ({ ...p, z: p.z * 0.5 })), JIAN, sealKit.judge), false);
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
  // …and a held 剑诀's slack does not let the index alone or an open palm in (a V that opens out of a held 剑诀 may
  // stay — loose on purpose, Hanli 10-21: easier).
  for (const name of ['one', 'open', 'fist']) assert.equal(sealOf3d([pointing(shapes[name](), 75, 0.4)], seals, K, 'jian'), null, name);
  assert.equal(sealOf3d([], seals, K), null);
  assert.equal(sealOf3d([[]], seals, K), null, 'a broken hand is no seal');
});

/* A camera's stream of samples: `size(t)` over `ms` at `fps`, the seal held unless said. */
function run({ ms, fps = 30, size, sealed = () => true, knobs = kit.poke }) {
  let s = startPoke();
  const shots = [];
  for (let t = 0; t <= ms; t += 1000 / fps) {
    const r = poke(s, { t, size: size(t), sealed: sealed(t) }, knobs);
    s = r.state;
    if (r.shot) shots.push(r.shot);
  }
  return shots;
}
const jab = (at, dur = 160, k = 1.3, base = 0.3) => (t) => (t < at ? base : t < at + dur ? base * (1 + (k - 1) * ((t - at) / dur)) : base * k);
const wobble = (t, amp = 0.03) => 1 + amp * Math.sin(t / 37) * Math.cos(t / 53);

test('a jab fires once — easy ones too (×1.15 over 0.3 s, ×1.2 over 0.4 s), at 30 and at 15 fps, sideways or not', () => {
  for (const fps of [30, 15]) {
    for (const [k, dur] of [[1.3, 160], [1.15, 300], [1.2, 400]]) {
      const shots = run({ ms: 1500, fps, size: (t) => jab(500, dur, k)(t) * wobble(t, 0.02) });
      assert.equal(shots.length, 1, `×${k} over ${dur} ms at ${fps} fps`);
      assert.ok(shots[0].at >= 500 && shots[0].at <= 500 + dur + 40, `fired ${shots[0].at.toFixed(0)} ms (jab from 500)`);
    }
  }
  // Held forward after the jab: no second shot; a second jab after a draw-back: a second shot.
  const twice = (t) => (t < 1100 ? jab(400)(t) : jab(1400, 160, 1.3, 0.3)(t));
  assert.equal(run({ ms: 2400, size: twice }).length, 2);
});

test('not a jab: a hand drifting nearer (≤30 %/s), a 5 % tremble, rocking ±8 % about once a second, no 剑诀, a slow push', () => {
  const none = (o, why) => assert.equal(run({ ms: 4000, ...o }).length, 0, why);
  none({ size: (t) => 0.2 * (1 + 0.3 * (t / 1000)) * wobble(t) }, 'drifting nearer 30 %/s with a 3 % tremble');
  none({ size: (t) => 0.3 * wobble(t, 0.05) }, 'a 5 % tremble');
  none({ size: (t) => 0.3 * (1 + 0.08 * Math.sin(t / 200)) }, 'rocking ±8 % nearer and back, about once a second');
  none({ size: jab(500), sealed: () => false }, 'no 剑诀');
  none({ size: jab(500, 1200) }, 'pushed forward slowly (1.2 s)');
  assert.equal(poke(startPoke(), { t: 0 }, kit.poke).shot, null, 'no hand');
});

test('core: beasts come seeded from both sides on the lanes; the egg aims itself — the tapped beast, else the one nearest the bottom', () => {
  let f = newField(level, 'a');
  for (let i = 0; i < 200; i += 1) f = tick(f, 50);
  assert.ok(f.n >= 4 && f.beasts.length <= level.spawn.max);
  assert.ok(f.beasts.every((b) => level.spawn.lanes.includes(b.y)));
  let g = newField(level, 'a');
  for (let i = 0; i < 200; i += 1) g = tick(g, 50);
  assert.deepEqual(g.beasts, f.beasts, 'the same seed, the same beasts');
  const B = (id, x, y, dir = 1) => ({ id, foe: 'yezhu', x, y, dir, speed: 0.1 });
  const s0 = { ...newField(level, 'c'), beasts: [B(1, 0.5, 0.24), B(2, 0.3, 0.56), B(3, 0.8, 0.56), B(4, 0.99, 0.56)] };
  assert.equal(targetOf(s0).id, 3, 'the bottom lane, and of it the one nearest getting away (4 is out of view)');
  assert.equal(targetOf(focus(s0, 1)).id, 1, 'a tapped beast first');
  assert.equal(targetOf(focus(s0, 4)).id, 3, '…while it is in view');
  assert.equal(focus(s0, 99).focus, null, 'a tap on nothing');
  assert.equal(throwEgg({ ...s0, beasts: [] }).egg, null, 'no beast in view: no egg');
  let { state: s, egg } = throwEgg(focus(s0, 1));
  assert.equal(egg.home, 1);
  assert.ok(Math.abs(egg.to.x - (0.5 + 0.1 * level.eggMs / 1000)) < 1e-9, 'it flies to where the beast will be');
  assert.equal(land(s).events.length, 0, 'still in the air');
  const r = land({ ...s, t: s.t + level.eggMs });
  assert.deepEqual(r.events.map((e) => e.type), ['hit']);
  assert.equal(r.state.hits, 1);
  assert.equal(r.state.focus, null, 'the tapped beast struck: the focus goes');
  const gone = land({ ...s, t: s.t + level.eggMs, beasts: s.beasts.filter((b) => b.id !== 1) });
  assert.equal(gone.events[0].type, 'miss', 'it walked off first');
  assert.deepEqual([starsOf(5, level.stars), starsOf(6, level.stars), starsOf(10, level.stars), starsOf(14, level.stars)], [0, 1, 2, 3]);
  assert.equal(over({ ...newField(level, 'b'), t: level.seconds * 1000 }), true);
});

test('the whole pipe: a made-up player who holds 剑诀 at the lens and jabs (fake.js bot → judge3d → jab → field) wins ★★★ inside the minute', () => {
  for (const seed of ['s1', 's2', 's3']) {
    let f = newField(level, seed), b = null, pk = startPoke(), sealT = -Infinity;
    for (let t = 0; (!over(f) || f.eggs.length) && t < 120000; t += 33) {
      const r = bot(b, t, JIAN);
      b = r.bot;
      if (sealOf3d(r.hands.world, seals, K, t - sealT <= K.graceMs ? 'jian' : null)) sealT = t;
      const p = poke(pk, { t, size: sizeOf(r.hands.image[0]), sealed: t - sealT <= K.graceMs }, kit.poke);
      pk = p.state;
      if (p.shot) f = throwEgg(f).state;
      f = land(tick(f, 33)).state;
    }
    assert.equal(starsOf(f.hits, level.stars), 3, `${seed}: ${f.hits} hits of ${f.shots} eggs in ${(f.t / 1000).toFixed(0)} s`);
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
  const parts = ['poke', 'core', 'fake'].map((f) => read(`../scripts/games/zhidian/${f}.js`)).join('') + read('../scripts/games/jieyin/judge3d.js');
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
  assert.doesNotMatch(src, /zd-sight|准星 follows/, 'no crosshair');
  assert.match(src, /field = focus\(field, Number\(el\.dataset\.id\)\)/, 'a tap on a beast aims the eggs at it');
  const reg = JSON.parse(read('../worlds/jiuding/games.json'));
  assert.ok(reg.games.some((g) => g.id === 'zhidian' && g.group === 'seal' && g.mechanic === '结印'));
});
