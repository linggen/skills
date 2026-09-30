// 大场面 (setpiece.js, setpieces/zhang.js) — 卷一's one set piece, 漳水立起:
// the beats follow the book in its order, word for word; the runner's steps
// (play, hold for a tap, finish early, skip) are a state machine the page drives;
// a story node carries an exit's `setpiece` to the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEATS, LUOSHU, TITLE, stillSvg } from '../scripts/setpieces/zhang.js';
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

test('zhang: 20–30 seconds in all, no beat longer than six', () => {
  const total = BEATS.reduce((a, b) => a + b.ms, 0);
  assert.ok(total >= 20000 && total <= 30000, `total ${total} ms`);
  for (const b of BEATS) assert.ok(b.ms >= 2000 && b.ms <= 6000, `${b.id} ${b.ms} ms`);
});

test('zhang: the seal is the 洛书 — every line fifteen, six and eight at the feet', () => {
  const sums = [...LUOSHU.map(r => r[0] + r[1] + r[2]), ...[0, 1, 2].map(c => LUOSHU[0][c] + LUOSHU[1][c] + LUOSHU[2][c]),
    LUOSHU[0][0] + LUOSHU[1][1] + LUOSHU[2][2], LUOSHU[0][2] + LUOSHU[1][1] + LUOSHU[2][0]];
  assert.ok(sums.every(s => s === 15));
  assert.equal(LUOSHU[1][1], 5);
  assert.deepEqual([LUOSHU[2][0], LUOSHU[2][2]], [8, 6]); // 三的底下，是八；七的底下，是六
});

test('zhang: a still frame for every beat, and no numerals painted on the stones', () => {
  for (const b of BEATS) {
    const svg = stillSvg(b.id, { W: 1000, H: 800 });
    assert.match(svg, /^<svg class="spstill"/);
    assert.ok(svg.length > 200, `${b.id} draws something`);
  }
  assert.doesNotMatch(stillSvg('seal'), /<text/);
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
