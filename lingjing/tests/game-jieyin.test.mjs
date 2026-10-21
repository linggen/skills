// 结印 (games/jieyin.js, Hanli 10-21): the seal judge on made-up hands (pose.js — synthetic, no recorded landmarks
// yet: real-camera recognition is Hanli's to try), the hold / order / 走火 machine, and the camera-less path that
// offers nothing (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打」).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gap, handSeal, makes, pointIndex, reach, sealOf } from '../scripts/games/jieyin/judge.js';
import { buildHand, iconSvg, poseOf } from '../scripts/games/jieyin/pose.js';
import { expected, progress, start, starsOf, step } from '../scripts/games/jieyin/sequence.js';
import { available } from '../scripts/games/jieyin/eye.js';
import { meta, mount, unavailableHtml, levelAsked } from '../scripts/games/jieyin.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const kit = JSON.parse(read('../worlds/jiuding/levels/jieyin.json'));
const { seals, judge: K } = kit;
const IDS = Object.keys(seals);

/* A hand moved as a real one is: turned in the picture's plane, mirrored (the other hand), scaled (nearer or farther). */
const turned = (hand, deg) => { const r = (deg * Math.PI) / 180; return hand.map(({ x, y, z }) => ({ x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r), z })); };
const mirrored = (hand) => hand.map(({ x, y, z }) => ({ x: -x, y, z }));
const scaled = (hand, k) => hand.map(({ x, y, z }) => ({ x: x * k, y: y * k, z: z * k }));

test('points are named as MediaPipe numbers them', () => {
  assert.equal(pointIndex('wrist'), 0);
  assert.equal(pointIndex('thumb.tip'), 4);
  assert.equal(pointIndex('index.mcp'), 5);
  assert.equal(pointIndex('middle.tip'), 12);
  assert.equal(pointIndex('pinky.tip'), 20);
  assert.throws(() => pointIndex('toe.tip'));
});

test('the seals: 4–6, each with a glyph, zh + en name · how · hint, and only rules the judge knows', () => {
  assert.ok(IDS.length >= 4 && IDS.length <= 6);
  for (const [id, s] of Object.entries(seals)) {
    assert.ok(s.glyph && s.name.zh && s.name.en && s.how.zh && s.how.en && s.hint.zh && s.hint.en, id);
    assert.deepEqual(Object.keys(s).filter((k) => !['glyph', 'name', 'how', 'hint', 'ext', 'curl', 'near', 'far'].includes(k)), [], id);
    for (const [a, b] of [...(s.near ?? []), ...(s.far ?? [])]) { pointIndex(a); pointIndex(b); }
  }
  for (const l of kit.levels) {
    assert.ok(l.sequence.every((id) => seals[id]), l.id);
    assert.ok(l.sequence.every((id, i) => id !== l.sequence[i - 1]), `${l.id}: no seal twice in a row`);
    assert.ok(l.title.zh && l.title.en && l.lead.zh && l.lead.en, l.id);
  }
  const fire = kit.levels.find((l) => l.mode === 'sequence');
  assert.equal(fire.sequence.length, 4, 'four seals cast the 火蛋');
  assert.equal(fire.sequence.at(-1), 'wu', 'the last is 午文 — 「火弹，掐午文」 (古六)');
});

test('each seal\'s own hand is that seal and no other — turned, mirrored, near or far', () => {
  for (const id of IDS) {
    const base = poseOf(seals[id]);
    for (const hand of [base, turned(base, 35), turned(base, -50), mirrored(base), scaled(base, 0.6), scaled(turned(mirrored(base), 20), 1.4)]) {
      assert.equal(handSeal(hand, seals, K), id, id);
      assert.deepEqual(IDS.filter((o) => makes(hand, seals[o], K)), [id], `${id} makes only itself`);
    }
  }
});

test('near misses are no seal: a V for 剑诀, a ring finger up, a thumb a little off, a fist, a palm with the thumb in', () => {
  const none = (hand, why) => assert.equal(handSeal(hand, seals, K), null, why);
  none(buildHand({ curl: ['ring', 'pinky'], spread: 14 }), 'V sign: index and middle apart');
  assert.notEqual(handSeal(buildHand({ curl: ['pinky'], together: ['index', 'middle'] }), seals, K), 'jian', 'ring finger up is no 剑诀');
  none(buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] }), 'a fist');
  const palm = buildHand({});
  none(buildHand({ thumbTo: [palm[5].x + 0.5, palm[5].y + 1, -1] }), 'open hand, thumb folded onto the palm');
  const wu = poseOf(seals.wu), tip = wu[12];
  none(buildHand({ pinch: 'middle', thumbTo: [tip.x - 4.5, tip.y + 1, tip.z] }), 'thumb 4.5 cm off the middle tip');
  assert.equal(handSeal(buildHand({ pinch: 'index' }), seals, K), 'si', 'thumb on the index tip is 巳, not 午');
  assert.notEqual(handSeal(buildHand({ pinch: 'ring' }), seals, K), 'wu', 'thumb on the ring tip (未) is not 午');
  none([], 'no points');
});

test('a seal held is judged looser: a trembling pinch at the edge stays, but is not taken up fresh', () => {
  const wu = poseOf(seals.wu), tip = wu[12], size = Math.hypot(wu[9].x, wu[9].y, wu[9].z);
  const off = K.near * (1 + K.loose / 2) * size; // past `near`, inside `near × (1 + loose)`
  const hand = buildHand({ pinch: 'middle', thumbTo: [tip.x - off, tip.y, tip.z] });
  assert.ok(gap(hand, 'thumb.tip', 'middle.tip') > K.near);
  assert.equal(handSeal(hand, seals, K), null);
  assert.equal(handSeal(hand, seals, K, 'wu'), 'wu');
});

test('two hands: either may make the seal; the held seal wins over the other hand\'s', () => {
  const jian = poseOf(seals.jian), zhang = poseOf(seals.zhang);
  assert.equal(sealOf([buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] }), jian], seals, K), 'jian');
  assert.equal(sealOf([zhang, jian], seals, K, 'jian'), 'jian');
  assert.equal(sealOf([zhang, jian], seals, K), 'zhang');
  assert.equal(sealOf([], seals, K), null);
  assert.ok(reach(zhang, 'index') > K.ext && reach(jian, 'ring') < K.curl);
});

/* The machine, fed one seal for `ms` in frames of 33 ms. */
function feed(s, seal, ms, dt = 33) {
  const events = [];
  for (let t = 0; t < ms; t += dt) { const r = step(s, seal, dt, K); s = r.state; events.push(...r.events.map((e) => e.type)); }
  return { s, events };
}
const fire = kit.levels.find((l) => l.mode === 'sequence');
const teach = kit.levels.find((l) => l.mode === 'one');

test('a seal counts once held holdMs, not before; a flash of a seal is nothing', () => {
  let { s, events } = feed(start(fire), 'zhang', K.holdMs - 40);
  assert.deepEqual(events, []);
  assert.ok(progress(s, K) > 0.7 && progress(s, K) < 1);
  ({ s, events } = feed(s, 'zhang', 80));
  assert.deepEqual(events, ['seal']);
  assert.equal(expected(s), 'jian');
  assert.equal(progress(s, K), 1);
  ({ s, events } = feed(s, 'zhang', 2000));
  assert.deepEqual(events, [], 'held on: counted once');
});

test('a short gap (graceMs) keeps a hold; a longer one lets it go', () => {
  let { s } = feed(start(fire), 'zhang', 200);
  ({ s } = feed(s, null, K.graceMs - 40));
  let r = feed(s, 'zhang', 140);
  assert.deepEqual(r.events, ['seal'], 'the hold carried over the gap');
  ({ s } = feed(start(fire), 'zhang', 200));
  ({ s } = feed(s, null, K.graceMs + 80));
  r = feed(s, 'zhang', 140);
  assert.deepEqual(r.events, [], 'the hold began again');
});

test('the four in order cast the 火蛋, and the round starts over', () => {
  let s = start(fire), all = [];
  for (const id of fire.sequence) { const r = feed(s, id, K.holdMs + 60); s = r.s; all.push(...r.events); ({ s } = feed(s, null, K.graceMs + 60)); }
  assert.deepEqual(all, ['seal', 'seal', 'seal', 'seal', 'cast']);
  assert.equal(s.casts, 1);
  assert.equal(expected(s), fire.sequence[0]);
});

test('走火: a wrong seal held wrongMs fizzles back to the first; passing through one briefly does not; the seal just made is never wrong', () => {
  let { s } = feed(start(fire), 'zhang', K.holdMs + 60);
  let r = feed(s, 'wu', K.wrongMs - 60);
  assert.deepEqual(r.events, [], 'a wrong seal on the way is not yet 走火');
  r = feed(s, 'zhang', 1500);
  assert.deepEqual(r.events, [], 'the seal just made, made again');
  r = feed(s, 'wu', K.wrongMs + 60);
  assert.deepEqual(r.events, ['fizzle']);
  assert.equal(r.s.fizzles, 1);
  assert.equal(expected(r.s), 'zhang');
  assert.ok(K.wrongMs > K.holdMs);
});

test('teaching (`one`): a wrong seal is only a miss; each in turn, then done; nothing after', () => {
  let s = start(teach), all = [];
  let r = feed(s, 'wu', K.wrongMs + 60);
  assert.deepEqual(r.events, ['miss']);
  assert.equal(expected(r.s), teach.sequence[0], 'a miss does not move on');
  s = r.s;
  for (const id of teach.sequence) { r = feed(s, id, K.holdMs + 60); s = r.s; all.push(...r.events); }
  assert.deepEqual(all, [...teach.sequence.map(() => 'seal'), 'done']);
  assert.equal(s.misses, 1);
  assert.deepEqual(feed(s, 'zhang', 1000).events, []);
  assert.equal(starsOf(0, fire.stars), 3);
  assert.equal(starsOf(2, fire.stars), 2);
  assert.equal(starsOf(5, fire.stars), 1);
});

test('the icons are each seal\'s own rule drawn as a hand', () => {
  for (const s of Object.values(seals)) {
    const svg = iconSvg(s);
    assert.match(svg, /^<svg class="jy-hand"/);
    assert.equal((svg.match(/<line /g) ?? []).length, 21);
    assert.doesNotMatch(svg, /NaN/);
  }
});

/* ── No camera: 结印 is not offered ── */

const canvasDoc = (gl) => ({ createElement: () => ({ getContext: () => (gl ? {} : null) }) });
const devices = (list) => ({ getUserMedia() {}, enumerateDevices: async () => list });

test('available(): a camera API, a camera and WebGL — any one missing and 结印 is not offered; nothing is asked of the player', async () => {
  let asked = false;
  const md = { getUserMedia() { asked = true; }, enumerateDevices: async () => [{ kind: 'videoinput' }] };
  assert.equal(await available({ navigator: { mediaDevices: md }, document: canvasDoc(true) }), true);
  assert.equal(asked, false, 'no camera prompt to find out');
  assert.equal(await available({ navigator: {}, document: canvasDoc(true) }), false, 'no camera API');
  assert.equal(await available({ navigator: { mediaDevices: devices([{ kind: 'audioinput' }]) }, document: canvasDoc(true) }), false, 'no camera');
  assert.equal(await available({ navigator: { mediaDevices: devices([{ kind: 'videoinput' }]) }, document: canvasDoc(false) }), false, 'no WebGL');
  assert.equal(await available({ navigator: { mediaDevices: { getUserMedia() {}, enumerateDevices: async () => { throw new Error('x'); } } }, document: canvasDoc(true) }), false);
});

test('mount without a camera: one line that it needs a camera, nothing to tap, and the game leaves', async () => {
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
      assert.doesNotMatch(container.innerHTML, /<button|data-g|jy-slot/, 'no stand-in to tap');
      assert.match(container.innerHTML, lang === 'en' ? /camera/ : /摄像头/);
    }
  } finally { globalThis.fetch = realFetch; }
});

test('the module: the contract\'s meta, pausable, its levels by id or number, and the camera asked only in eye.js on start', () => {
  assert.equal(meta.name.zh, '结印');
  assert.equal(meta.pause, true);
  assert.equal(levelAsked(kit, {}, '?lv=2').id, 'jiangtang');
  assert.equal(levelAsked(kit, { lv: 'huodan' }).id, 'huodan');
  assert.equal(levelAsked(kit, {}, '?lv=9').id, 'huodan');
  const src = read('../scripts/games/jieyin.js'), eye = read('../scripts/games/jieyin/eye.js');
  assert.doesNotMatch(src, /getUserMedia/, 'the game never opens the camera itself');
  assert.match(eye, /getTracks\?\.\(\)[^\n]*\) t\.stop\(\)/, 'the camera is stopped by its tracks');
  assert.doesNotMatch(src + eye, /https?:\/\//, 'nothing from the network');
  // the order in mount: the lead card (开始) comes before the camera is opened
  assert.ok(src.indexOf('shell.lead(') < src.indexOf('eye.start()'));
});

test('the vendored MediaPipe: every file eye.js loads is there, pinned, and phones nowhere', () => {
  const dir = new URL('../scripts/vendor/mediapipe/', import.meta.url);
  for (const f of ['vision_bundle.mjs', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'hand_landmarker.task', 'LICENSE.txt']) {
    assert.ok(fs.existsSync(new URL(f, dir)), f);
  }
  const bundle = fs.readFileSync(new URL('vision_bundle.mjs', dir), 'utf8');
  assert.doesNotMatch(bundle, /odml\.pa\.googleapis|\/v1\/log/, 'no usage-metrics logger (1.x has one — 0.10.35 is pinned)');
  assert.match(read('../scripts/vendor/VENDOR.md'), /@mediapipe\/tasks-vision 0\.10\.35/);
});
