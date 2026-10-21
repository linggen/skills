// 结印 (games/jieyin.js, Hanli 10-21): the seal judge on made-up hands (pose.js — synthetic, no recorded landmarks
// yet: real-camera recognition is Hanli's to try), the hold / order / 走火 machine, and the camera-less path that
// offers nothing (Hanli 10-21: 「没摄像头时, 就不用用户结印帮打」).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gap, handSeal, handsOf, makes, makesTwo, pointIndex, reach, sealOf } from '../scripts/games/jieyin/judge.js';
import { buildHand, iconSvg, poseOf, posesOf } from '../scripts/games/jieyin/pose.js';
import { sealsFor, sequenceFor, setOf } from '../scripts/games/jieyin/sets.js';
import { expected, progress, start, starsOf, step } from '../scripts/games/jieyin/sequence.js';
import { available } from '../scripts/games/jieyin/eye.js';
import { meta, mount, unavailableHtml, levelAsked } from '../scripts/games/jieyin.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const kit = JSON.parse(read('../worlds/jiuding/levels/jieyin.json'));
const { seals, judge: K } = kit;
const IDS = Object.keys(seals);
const ONE = IDS.filter((id) => handsOf(seals[id]) === 1), TWO = IDS.filter((id) => handsOf(seals[id]) === 2);

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

/* A shape's rules name only points the judge knows. */
function knownShape(s, id) {
  assert.deepEqual(Object.keys(s).filter((k) => !['ext', 'curl', 'near', 'far', 'nearest'].includes(k)), [], id);
  for (const [a, b] of [...(s.near ?? []), ...(s.far ?? [])]) { pointIndex(a); pointIndex(b); }
  for (const [p, to, others] of s.nearest ?? []) [p, to, ...others].forEach(pointIndex);
}

test('the library: one-hand and two-hand seals, each with a glyph, `hands`, zh + en name · how · hint, and only rules the judge knows', () => {
  // Hanli 10-21: 「可以多设计一些"印", mac上可以用双手, iPhone只有单手」
  assert.ok(ONE.length >= 10, `${ONE.length} one-hand seals`);
  assert.ok(TWO.length >= 4, `${TWO.length} two-hand seals`);
  const glyphs = new Set();
  for (const [id, s] of Object.entries(seals)) {
    assert.ok(s.glyph && s.name.zh && s.name.en && s.how.zh && s.how.en && s.hint.zh && s.hint.en, id);
    assert.ok(s.hands === 1 || s.hands === 2, `${id}: hands`);
    assert.ok(!glyphs.has(s.glyph), `${id}: its own glyph`);
    glyphs.add(s.glyph);
    const head = ['glyph', 'hands', 'name', 'how', 'hint'];
    if (s.hands === 1) { knownShape(Object.fromEntries(Object.entries(s).filter(([k]) => !head.includes(k))), id); continue; }
    assert.deepEqual(Object.keys(s).filter((k) => ![...head, 'each', 'a', 'b', 'between', 'layout'].includes(k)), [], id);
    assert.ok(s.each || (s.a && s.b), `${id}: each, or a and b`);
    [s.each, s.a, s.b].filter(Boolean).forEach((x) => knownShape(x, id));
    for (const [kind, pairs] of Object.entries(s.between)) {
      assert.ok(['near', 'far', 'above', 'level', 'column'].includes(kind), `${id}: ${kind}`);
      for (const pq of pairs) for (const n of pq) { assert.match(n, /^[ab]\./, `${id}: ${n}`); pointIndex(n.slice(2)); }
    }
  }
});

test('every level and move has a sequence for every device set, made only of that set\'s seals; the 火蛋 is four, ending on 午文', () => {
  const sets = kit.sets;
  assert.deepEqual(sets.map((s) => s.hands), [1, 2], 'a phone set (one hand), then a desk set (both)');
  for (const set of sets) {
    const ok = sealsFor(kit, set);
    for (const row of [...kit.levels, ...Object.keys(kit.moves)]) {
      const seq = sequenceFor(kit, row, set), name = `${row.id ?? row} @ ${set.id}`;
      assert.ok(seq.length >= 4, name);
      assert.ok(seq.every((id) => ok[id]), `${name}: only seals this set may judge`);
      assert.ok(seq.every((id, i) => id !== seq[i - 1]), `${name}: no seal twice in a row`);
    }
    const fire = sequenceFor(kit, 'huodan', set);
    assert.equal(fire.length, 4, 'four seals cast the 火蛋');
    assert.equal(fire.at(-1), 'wu', 'the last is 午文 — 「火弹，掐午文」 (古六)');
  }
  assert.ok(sequenceFor(kit, 'huodan', 'desk').some((id) => handsOf(seals[id]) === 2), 'a Mac casts it with both hands');
  for (const l of kit.levels) assert.ok(l.title.zh && l.title.en && l.lead.zh && l.lead.en, l.id);
  // What other modules already call stays as it was: the 火蛋 row's own sequence, and 古六's 讲堂 level.
  assert.deepEqual(kit.levels[0].sequence, ['zhang', 'jian', 'shen', 'wu']);
  assert.deepEqual(kit.levels.find((l) => l.id === 'jiangtang').sequence, ['zhang', 'jian', 'si', 'wu', 'shen']);
  const every = kit.levels.find((l) => l.id === 'wanyin');
  assert.deepEqual([...sequenceFor(kit, every, 'phone')].sort(), [...ONE].sort(), '试印: every one-hand seal on a phone');
  assert.deepEqual([...sequenceFor(kit, every, 'desk')].sort(), [...IDS].sort(), '试印: every seal on a Mac');
});

test('the device set: a phone (coarse pointer, small) gets one-hand seals only, a Mac both; ?dev=1&hands= picks', () => {
  const media = (phone) => (q) => ({ matches: phone && q === kit.sets[0].when });
  assert.equal(setOf(kit, { matchMedia: media(true), search: '' }).id, 'phone');
  assert.equal(setOf(kit, { matchMedia: media(false), search: '' }).id, 'desk');
  assert.equal(setOf(kit, { matchMedia: undefined, search: '' }).id, 'desk', 'no media query → the last');
  assert.equal(setOf(kit, { matchMedia: media(false), search: '?dev=1&hands=1' }).id, 'phone');
  assert.equal(setOf(kit, { matchMedia: media(true), search: '?dev=1&hands=2' }).id, 'desk');
  assert.equal(setOf(kit, { matchMedia: media(true), search: '?hands=2' }).id, 'phone', 'only a dev page picks');
  assert.deepEqual(Object.keys(sealsFor(kit, 'phone')).sort(), [...ONE].sort());
  assert.deepEqual(Object.keys(sealsFor(kit, 'desk')).sort(), [...IDS].sort());
  assert.match(kit.sets[0].when, /pointer: coarse/);
});

test('each seal\'s own hand is that seal and no other — turned, mirrored, near or far', () => {
  for (const id of ONE) {
    const base = poseOf(seals[id]);
    for (const hand of [base, turned(base, 35), turned(base, -50), mirrored(base), scaled(base, 0.6), scaled(turned(mirrored(base), 20), 1.4)]) {
      assert.equal(handSeal(hand, seals, K), id, id);
      assert.deepEqual(ONE.filter((o) => makes(hand, seals[o], K)), [id], `${id} makes only itself`);
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
  assert.equal(handSeal(buildHand({ pinch: 'ring' }), seals, K), 'wei', 'thumb on the ring tip is 未, not 午');
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
    assert.equal((svg.match(/<line /g) ?? []).length, 21 * handsOf(s), "a hand drawn per hand the seal needs");
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

test('the camera goes off when the page is hidden, and the probe for WebGL lets its context go', async () => {
  const src = read('../scripts/games/jieyin.js');
  assert.match(src, /addEventListener\?\.\('visibilitychange', seen\)/, 'the page hidden is heard');
  assert.match(src, /if \(doc\.hidden\) \{ eye\.pause\(\)/, 'hidden: the camera off (eye.pause stops its tracks)');
  assert.match(src, /offHide\?\.\(\)/, 'the listener goes with the game');
  let lost = 0;
  const gl = { getExtension: (n) => (n === 'WEBGL_lose_context' ? { loseContext: () => { lost += 1; } } : null) };
  const doc = { createElement: () => ({ getContext: () => gl }) };
  assert.equal(await available({ navigator: { mediaDevices: devices([{ kind: 'videoinput' }]) }, document: doc }), true);
  assert.equal(lost, 1, 'one probe, one context, let go');
});

/* ── The library (Hanli 10-21: 「可以多设计一些"印"」): near misses for every new seal, and two hands ── */

/** A hand whose thumb lies on one joint (the fingers straight unless folded). */
function thumbOn(joint, { curl = [] } = {}) {
  const open = buildHand({ curl }), j = open[pointIndex(joint)];
  return buildHand({ curl, thumbTo: [j.x - 0.3, j.y, j.z - 0.6] });
}

test('掐诀 on the joints: each joint\'s seal, and the joint beside it is not that seal', () => {
  const is = (hand, id, why) => assert.equal(handSeal(hand, seals, K), id, why);
  const not = (hand, id, why) => assert.notEqual(handSeal(hand, seals, K), id, why);
  is(thumbOn('index.pip'), 'mao', '卯: the index\'s middle joint');
  not(thumbOn('index.dip'), 'mao', '辰 (the index\'s top joint) is not 卯');
  not(thumbOn('index.dip'), 'si', '辰 is not 巳 either — the tip is not the nearest');
  is(thumbOn('middle.pip'), 'yuqing', '玉清: the middle finger\'s middle joint');
  not(thumbOn('middle.dip'), 'yuqing', 'one joint up is not 玉清');
  not(thumbOn('middle.dip'), 'wu', 'nor 午');
  is(thumbOn('pinky.dip'), 'you', '酉: the little finger\'s top joint');
  not(thumbOn('pinky.pip'), 'you', '戌 (one joint down) is not 酉');
  not(thumbOn('pinky.dip'), 'shen', '酉 is not 申');
  is(thumbOn('ring.mcp'), 'zi', '子: the ring finger\'s root');
  not(thumbOn('middle.mcp'), 'zi', '丑 (the middle root) is not 子');
  not(thumbOn('pinky.mcp'), 'zi', '亥 (the little root) is not 子');
  is(buildHand({ pinch: 'ring' }), 'wei', '未: the ring tip');
  not(thumbOn('ring.dip'), 'wei', 'the ring\'s top joint is not 未');
});

test('the finger shapes: 单剑指 and 犄角诀, and the hands next to them', () => {
  const is = (hand, id, why) => assert.equal(handSeal(hand, seals, K), id, why);
  is(poseOf(seals.danjian), 'danjian');
  is(buildHand({ curl: ['ring', 'pinky'], together: ['index', 'middle'] }), 'jian', 'a second finger up is 剑诀, not 单剑指');
  assert.notEqual(handSeal(buildHand({ curl: ['ring', 'pinky'] }), seals, K), 'danjian', 'middle up and apart: not 单剑指');
  is(poseOf(seals.jijiao), 'jijiao');
  assert.notEqual(handSeal(buildHand({ curl: ['ring'] }), seals, K), 'jijiao', 'the middle finger up too: not 犄角');
  assert.notEqual(handSeal(buildHand({ curl: ['middle', 'ring', 'pinky'] }), seals, K), 'jijiao', 'the little finger down: not 犄角');
});

/* Two hands moved as a real picture moves them: mirrored, scaled, shifted, the hands in either order. */
const pic = (image, f) => image.map((h) => h.map(f));
const twoOf = (id, layout) => posesOf(layout ? { ...seals[id], layout: { ...seals[id].layout, ...layout } } : seals[id]);
const judgeTwo = ({ world, image }, held = null) => sealOf(world, seals, K, held, { image, aspect: 1 });

test('each two-hand seal: its own two hands make it and no other — mirrored, scaled, moved, either hand first', () => {
  for (const id of TWO) {
    const { world, image } = posesOf(seals[id]);
    const views = [
      image,
      pic(image, ({ x, y, z }) => ({ x: -x, y, z })),
      pic(image, ({ x, y, z }) => ({ x: x * 0.5 + 30, y: y * 0.5 - 10, z })),
    ];
    for (const im of views) {
      assert.equal(judgeTwo({ world, image: im }), id, id);
      assert.equal(judgeTwo({ world: [...world].reverse(), image: [...im].reverse() }), id, `${id}, hands swapped`);
      assert.deepEqual(TWO.filter((o) => makesTwo(world, im, seals[o], K)), [id], `${id} makes only itself`);
    }
  }
});

test('two-hand seals never fire on one hand, without the picture, or on a phone', () => {
  for (const id of TWO) {
    const { world, image } = posesOf(seals[id]);
    assert.notEqual(sealOf([world[0]], seals, K, null, { image: [image[0]] }), id, `${id}: one hand`);
    assert.notEqual(sealOf(world, seals, K), id, `${id}: no picture (the old call)`);
    assert.ok(!TWO.includes(sealOf(world, sealsFor(kit, 'phone'), K, null, { image, aspect: 1 }) ?? ''), `${id}: the phone set judges one-hand seals only`);
  }
});

test('two-hand near misses: too close, out of line, beside not above, tips apart', () => {
  const not = (poses, id, why) => assert.notEqual(judgeTwo(poses), id, why);
  not(twoOf('shuangzhang', { dx: 0.9 }), 'shuangzhang', '双掌: palms nearly touching');
  not(twoOf('shuangzhang', { dx: 2.4, dy: 1.2 }), 'shuangzhang', '双掌: one palm well below the other');
  not(twoOf('shuangzhang', { dx: 2.4, dy: 1.2 }), 'tiandi', '…which is not 天地 either (not stacked)');
  not(twoOf('shuangjian', { dx: 0.9 }), 'shuangjian', '双剑: hands together');
  not(twoOf('tiandi', { dx: 1.8 }), 'tiandi', '天地: the lower palm off to the side');
  not(twoOf('tiandi', { dy: 1.2 }), 'tiandi', '天地: palms overlapping, no gap');
  not(twoOf('chengjian', { dx: 1.6, dy: 0 }), 'chengjian', '承剑: the sword beside the palm, not above');
  const tri = posesOf(seals.lihuo);
  const apart = { world: tri.world, image: [tri.image[0].map((p) => ({ ...p, x: p.x + 3 })), tri.image[1].map((p) => ({ ...p, x: p.x - 3 }))] };
  not(apart, 'lihuo', '离火: the tips 6 cm apart');
  const wrong = { world: [poseOf(seals.zhang), poseOf(seals.zhang)], image: posesOf(seals.shuangjian).image };
  not(wrong, 'shuangjian', '双剑 drawn but both hands open');
});

test('a two-hand seal held is judged looser; the old 4-argument call still judges one hand', () => {
  const near = twoOf('tiandi', { dy: 2.17 }); // the gap between the palms just under `above`
  const unit = 9.52, gapY = (near.image[1][12].y - near.image[0][0].y) / unit;
  assert.ok(gapY < K.pair.above && gapY > K.pair.above / (1 + K.loose), `gap ${gapY.toFixed(2)}`);
  assert.notEqual(judgeTwo(near), 'tiandi');
  assert.equal(judgeTwo(near, 'tiandi'), 'tiandi');
  assert.equal(sealOf([poseOf(seals.wu)], seals, K, null), 'wu');
  assert.equal(handSeal(poseOf(seals.si), seals, K), 'si');
});

/* ── Power (Hanli 10-21: 「好，加上」) ── */

test('eye knobs as data: 15 fps, 320×240, one hand on a phone, two on a Mac only when the sequence needs them; a game may ask for more fps', async () => {
  const { eyeFor } = await import('../scripts/games/jieyin/sets.js');
  const { EYE, due } = await import('../scripts/games/jieyin/eye.js');
  assert.deepEqual({ fps: kit.eye.fps, width: kit.eye.width, height: kit.eye.height }, { fps: 15, width: 320, height: 240 });
  assert.deepEqual(EYE, { fps: 15, width: 320, height: 240, numHands: 2 }, 'the defaults for a caller that passes none');
  const fireDesk = sequenceFor(kit, 'huodan', 'desk'), firePhone = sequenceFor(kit, 'huodan', 'phone');
  assert.equal(eyeFor(kit, 'phone', firePhone).numHands, 1);
  assert.equal(eyeFor(kit, 'phone', fireDesk).numHands, 1, 'never more hands than the set has');
  assert.equal(eyeFor(kit, 'desk', fireDesk).numHands, 2, 'a two-hand seal in play');
  assert.equal(eyeFor(kit, 'desk', ['zhang', 'jian', 'wu']).numHands, 1, 'a Mac playing one-hand seals looks for one');
  assert.deepEqual(eyeFor(kit, 'desk', fireDesk, { fps: 30 }), { fps: 30, width: 320, height: 240, numHands: 2 }, '隔空指点 asks for more fps');
  // 15 fps off a 30 fps camera: every second frame; off a 60 fps one, every fourth.
  const run = (cam, fps) => { let last = -Infinity, n = 0; for (let i = 0; i < cam; i++) { const t = (i * 1000) / cam; if (due(t, last, fps)) { last = t; n += 1; } } return n; };
  assert.equal(run(30, 15), 15);
  assert.equal(run(60, 15), 15);
  assert.equal(run(30, 30), 30);
  const src = read('../scripts/games/jieyin/eye.js');
  assert.match(src, /width: \{ ideal: width \}, height: \{ ideal: height \}/, 'ideal, never exact: a camera that gives more is used');
  assert.match(src, /make\('GPU'\)\.catch\(\(\) => make\('CPU'\)\)/, 'GPU first, CPU behind it');
  assert.match(src, /setOptions\?\.\(\{ numHands \}\)/);
});

test('at 15 fps the hold still counts at 0.3 s, and one lost read (67 ms) does not break it', () => {
  const at15 = (s, seal, ms) => feed(s, seal, ms, 1000 / 15);
  let r = at15(start(fire), 'zhang', K.holdMs + 1000 / 15);
  assert.deepEqual(r.events, ['seal'], 'counted within one read of 0.3 s');
  r = at15(start(fire), 'zhang', 200);
  r = at15(r.s, null, 1000 / 15);
  r = at15(r.s, 'zhang', 140);
  assert.deepEqual(r.events, ['seal'], 'a single empty read is inside graceMs');
  assert.ok(K.graceMs > 2 * (1000 / 15), 'grace covers two lost reads at 15 fps');
});

/* ── The hand hint (Hanli 10-21: 「最好不显示摄像头…手部动作的提示」) ── */

test('the hand hint: mirrored like a mirror; edge, gone (by the edge it left), far, near, two hands, ok', async () => {
  const { cueOf, mirrored } = await import('../scripts/games/jieyin/hint.js');
  const A = 4 / 3, H = kit.hint;
  // A hand in the picture: the template scaled to `len` frame heights, its wrist at (x, y) of the camera's frame.
  const at = (x, y, len = 0.18, seal = seals.zhang) => poseOf(seal).map((p) => ({ x: x + (p.x / 9.52) * len / A, y: y + (p.y / 9.52) * len }));
  const seen = (...hands) => hands.map((h) => mirrored(h, A));
  assert.ok(mirrored(at(0.2, 0.8), A)[0].x > A / 2, 'a hand on the camera\'s left is drawn on the right, as in a mirror');
  assert.deepEqual(cueOf({ seen: seen(at(0.5, 0.8)), aspect: A }, H), { kind: 'ok' });
  assert.deepEqual(cueOf({ seen: [], last: null, aspect: A }, H), { kind: 'none' });
  assert.deepEqual(cueOf({ seen: seen(at(0.5, 0.8, 0.04)), aspect: A }, H), { kind: 'far' });
  assert.deepEqual(cueOf({ seen: seen(at(0.5, 1.2, 0.5)), aspect: A }, H), { kind: 'near' });
  const edgeR = cueOf({ seen: seen(at(0.06, 0.8)), aspect: A }, H);
  assert.deepEqual(edgeR, { kind: 'edge', side: 'right' }, 'the camera\'s left edge is the mirror\'s right');
  const box = (h) => { const m = mirrored(h, A); return { x0: Math.min(...m.map((p) => p.x)), x1: Math.max(...m.map((p) => p.x)), y0: Math.min(...m.map((p) => p.y)), y1: Math.max(...m.map((p) => p.y)) }; };
  const last = { at: 1000, box: box(at(0.92, 0.8)) };
  assert.deepEqual(cueOf({ seen: [], last, now: 1000 + H.lostMs / 2, aspect: A }, H), { kind: 'ok' }, 'a read or two lost is no news');
  assert.deepEqual(cueOf({ seen: [], last, now: 1000 + H.lostMs + 50, aspect: A }, H), { kind: 'gone', side: 'left' }, 'left by the (mirrored) left edge');
  assert.deepEqual(cueOf({ seen: [], last: { at: 0, box: box(at(0.5, 0.75)) }, now: 5000, aspect: A }, H), { kind: 'gone', side: 'middle' });
  assert.deepEqual(cueOf({ seen: seen(at(0.5, 0.8)), aspect: A, want: 2 }, H), { kind: 'two' }, 'a two-hand seal wants both');
  assert.deepEqual(cueOf({ seen: seen(at(0.3, 0.8), at(0.7, 0.8)), aspect: A, want: 2 }, H), { kind: 'ok' });
});

test('the game shows no camera picture: the video only feeds the model; the hint docks in its place, one component for every game', () => {
  const src = read('../scripts/games/jieyin.js'), css = read('../scripts/games/jieyin/jieyin.css'), hint = read('../scripts/games/jieyin/hint.js');
  assert.doesNotMatch(src, /<canvas|jy-cam/, 'no preview');
  assert.match(css, /\.jy-eye \{[^}]*opacity: 0/);
  assert.match(src, /handHint\(/);
  assert.match(hint, /export function handHint\(container, \{ lang = 'zh', size = 'compact', seals = \{\}, knobs = \{\} \} = \{\}\)/);
  assert.doesNotMatch(hint, /<video|srcObject/, 'the hint never touches the camera');
});
