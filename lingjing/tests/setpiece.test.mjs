// 大场面 (setpiece.js, setpieces/zhang.js) — 卷一's one set piece, 漳水立起:
// the beats follow the book in its order, word for word; the runner's steps
// (play, hold for a tap, finish early, skip) are a state machine the page drives;
// a story node carries an exit's `setpiece` to the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART, ASPECT, BEATS, LUOSHU, MARKS, SHOTS, TITLE, coldMatrix, stillSvg } from '../scripts/setpieces/zhang.js';
import { beatRange, beatStepper, setpieceBeats, setpieceOf } from '../scripts/setpiece.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/10-第十回.md'), 'utf8');

test('zhang: seven beats in the book’s order, each line verbatim from 第十回', () => {
  assert.deepEqual(BEATS.map(b => b.id), ['still', 'rise', 'bingyi', 'trial', 'fall', 'seal', 'ding']);
  let at = -1;
  for (const b of BEATS) {
    assert.ok(b.line.en?.length > 10, `${b.id} has an English line`);
    const k = BOOK.indexOf(b.line.zh);
    assert.ok(k >= 0, `${b.id}: 「${b.line.zh}」 is in 10-第十回.md`);
    assert.ok(k > at, `${b.id} comes after the beat before it in the book`);
    at = k;
  }
  assert.equal(TITLE.zh, '漳水立起');
});

test('zhang: slow — 30–45 seconds in all, each beat 4–8 s (his: the camera moves over paintings, slowly)', () => {
  const total = BEATS.reduce((a, b) => a + b.ms, 0);
  assert.ok(total >= 30000 && total <= 45000, `total ${total} ms`);
  for (const b of BEATS) assert.ok(b.ms >= 4000 && b.ms <= 8000, `${b.id} ${b.ms} ms`);
});

test('zhang: painted, not drawn — every beat plays on one of the five paintings, and the code draws no figure', () => {
  assert.deepEqual(Object.keys(ART).sort(), ['a', 'b', 'c', 'e', 'f']);
  for (const p of Object.values(ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${p} is on disk`);
  for (const b of BEATS) {
    assert.ok(ART[b.art], `${b.id} plays on a painting`);
    const [from, to] = SHOTS[b.id];
    for (const v of [from, to]) {
      assert.ok(v.s >= 1 && v.s <= 3, `${b.id}: zoom ${v.s} never shows past the painting`);
      assert.ok(v.fx >= 0 && v.fx <= 1 && v.fy >= 0 && v.fy <= 1, `${b.id}: aim inside the painting`);
    }
  }
  for (const [k, [u, v]] of Object.entries(MARKS)) assert.ok(u > 0 && u < 1 && v > 0 && v < 1, `${k} inside the painting`);
  assert.equal(ASPECT, 9 / 16);
  // His ruling (2026-09-30, 「太不好看, 粗糙, 太假」): no code-drawn figures, fish, stones or dragons.
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'setpieces', 'zhang.js'), 'utf8');
  assert.doesNotMatch(src, /\.(ellipse|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly)\(/, 'no strokes or outlines drawn in code');
  assert.deepEqual(coldMatrix(0), [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0], 'the painting as painted before the river stops');
});

test('zhang: the seal is the 洛书 — every line fifteen, six and eight at the feet', () => {
  const sums = [...LUOSHU.map(r => r[0] + r[1] + r[2]), ...[0, 1, 2].map(c => LUOSHU[0][c] + LUOSHU[1][c] + LUOSHU[2][c]),
    LUOSHU[0][0] + LUOSHU[1][1] + LUOSHU[2][2], LUOSHU[0][2] + LUOSHU[1][1] + LUOSHU[2][0]];
  assert.ok(sums.every(s => s === 15));
  assert.equal(LUOSHU[1][1], 5);
  assert.deepEqual([LUOSHU[2][0], LUOSHU[2][2]], [8, 6]); // 三的底下，是八；七的底下，是六
});

test('zhang: no WebGL — each beat is its painting, still, cropped where the camera ends; no words painted', () => {
  for (const b of BEATS) {
    const svg = stillSvg(b.id, { W: 1000, H: 562 });
    assert.match(svg, /^<svg class="spstill"/);
    assert.ok(svg.includes(ART[b.art]), `${b.id} shows ${ART[b.art]}`);
    assert.doesNotMatch(svg, /<text/);
  }
});

test('stepper: play, hold for a tap, next — and a tap mid-beat finishes it', () => {
  const s = beatStepper(BEATS);
  assert.deepEqual(s.start(), { start: 0 });
  assert.equal(s.phase, 'play');
  assert.deepEqual(s.ended(), { hold: 0 });
  assert.deepEqual(s.tap(), { start: 1 });
  assert.deepEqual(s.tap(), { finish: 1 });
  assert.equal(s.phase, 'hold');
  assert.deepEqual(s.ended(), {}, 'a beat finished early does not end twice');
  for (let i = 2; i < BEATS.length; i += 1) { assert.deepEqual(s.tap(), { start: i }); s.ended(); }
  assert.deepEqual(s.tap(), { done: true });
  assert.equal(s.phase, 'done');
  assert.deepEqual(s.tap(), {});
  assert.equal(s.total, BEATS.reduce((a, b) => a + b.ms, 0));
});

test('stepper: skip ends at once, from anywhere, once', () => {
  const s = beatStepper(BEATS);
  s.start(); s.ended(); s.tap();
  assert.deepEqual(s.skip(), { skip: 1, done: true });
  assert.deepEqual(s.skip(), {});
  assert.equal(s.phase, 'done');
});

test('setpieceOf: a string or {id}, lower-case letters only', () => {
  assert.equal(setpieceOf({ setpiece: 'zhang' }), 'zhang');
  assert.equal(setpieceOf({ setpiece: { id: 'zhang' } }), 'zhang');
  assert.equal(setpieceOf({ setpiece: '../x' }), null);
  assert.equal(setpieceOf({}), null);
  assert.equal(setpieceOf(null), null);
});

test('story node: an exit’s setpiece reaches the page', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/rules/story.mjs'), 'utf8');
  assert.match(src, /exit\.setpiece \? \{ setpiece: exit\.setpiece \}/);
});

test('a run of the piece: {id, beats} plays only those, and the beats before the first stand done', () => {
  assert.deepEqual(setpieceBeats({ setpiece: { id: 'zhang', beats: ['still', 'rise'] } }), ['still', 'rise']);
  assert.equal(setpieceBeats({ setpiece: 'zhang' }), null, 'a bare id plays them all');
  assert.equal(setpieceBeats({ setpiece: { id: 'zhang', beats: [] } }), null);
  const all = beatRange(BEATS, null);
  assert.equal(all.play.length, 7);
  assert.equal(all.before.length, 0);
  const after = beatRange(BEATS, ['seal', 'ding']);
  assert.deepEqual(after.play.map(b => b.id), ['seal', 'ding']);
  assert.deepEqual(after.before.map(b => b.id), ['still', 'rise', 'bingyi', 'trial', 'fall'], 'the picture starts where the river left it');
  assert.deepEqual(beatRange(BEATS, ['ding', 'still']).play.map(b => b.id), ['still', 'ding'], 'always in the book’s order');
  assert.equal(beatRange(BEATS, ['nope']).play.length, 7, 'an unknown run falls back to the whole piece');
  const steps = beatStepper(after.play);
  assert.deepEqual(steps.start(), { start: 0 });
  assert.equal(steps.beat.id, 'seal');
});

test('teardown: every tween a piece makes is in its bag, and killAll leaves none running (seen live 2026-09-30: `Cannot set properties of null (setting \'y\')` after 漳水 closed)', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor', 'gsap-3.15.0.min.js'), 'utf8');
  const exp = {};
  new Function('exports', 'module', src).call(globalThis, exp, { exports: exp });
  const gsap = exp.gsap ?? exp.default;
  const { tweenBag } = await import('../scripts/setpieces/bag.js');
  const bag = tweenBag(gsap), o = { y: 0 };
  bag.timeline({}).to(o, { y: 100, duration: 1 });
  bag.to(o, { y: 50, duration: 1, delay: 0.05 });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(bag.live, 2, 'both running');
  bag.killAll();
  const y = o.y;
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(bag.live, 0);
  assert.equal(bag.size, 0);
  assert.equal(o.y, y, 'nothing writes after the kill');
  // …and the piece makes none outside it.
  const zhang = fs.readFileSync(path.join(ROOT, 'scripts', 'setpieces', 'zhang.js'), 'utf8');
  assert.doesNotMatch(zhang, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'zhang makes its tweens through the bag');
  assert.match(zhang, /destroy\(\) \{\s*bag\.killAll\(\);/);
});
