// 筑基天象 (setpieces/zhuji.js): the beats follow the book's 筑基 in order, both
// languages carry every beat, the moment stays mid-size, and — his ruling
// (2026-09-30, the code-drawn one was 「太假」) — it is painted, not drawn: every
// beat plays on a painting, the camera never shows past it, d1 soaks into d2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART, ASPECT, BEATS, DOOR_WORDS, FIVE, MARKS, SHOTS, TITLE, WORLD, camSeconds, stillSvg } from '../scripts/setpieces/zhuji.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const totalMs = BEATS.reduce((s, b) => s + b.ms, 0);

test('the beats run in the book\'s order, each in both languages', () => {
  assert.deepEqual(BEATS.map((b) => b.id), ['gather', 'light', 'tai', 'door', 'zhu', 'stars', 'settle']);
  for (const b of BEATS) {
    assert.ok(b.line.zh && b.line.en, b.id);
    assert.ok(!/你/.test(b.line.zh), `${b.id}: the moment tells of him, not to you`);
  }
  assert.equal(BEATS.at(-1).ms, 0, 'the last beat is a resting frame');
  assert.equal(TITLE.zh, '筑基天象');
});

test('mid-size: about ten seconds as the book paces it, never the 卷\'s big set piece; no camera move hurried', () => {
  assert.ok(totalMs >= 9000 && totalMs <= 14000, `total ${totalMs} ms`);
  for (const b of BEATS) assert.ok(camSeconds(b) >= 3 && camSeconds(b) <= 4, `${b.id}: ${camSeconds(b)} s`);
});

test('the words are the book\'s: the 锅 of cloud, 勿入 → 今日放学, the four gates of 黄庭, 几道纹', () => {
  const book = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/08-第八回.md'), 'utf8');
  for (const phrase of ['倒扣的大锅', '勿入', '今日放学', '上有黄庭下关元，后有幽阙前命门', '星星比平日亮了一些，近了一些', '几道纹']) {
    assert.ok(book.includes(phrase), `the book has ${phrase}`);
    assert.ok(BEATS.some((b) => b.line.zh.includes(phrase)), `a beat carries ${phrase}`);
  }
  assert.deepEqual(DOOR_WORDS.zh, ['勿入', '今日放学']);
  assert.deepEqual(FIVE.map((f) => f.zh), ['金', '木', '水', '火', '土']);
});

test('painted, not drawn: seven paintings on disk (d and e twice), every beat on one, the camera inside it', () => {
  assert.deepEqual(Object.keys(ART).sort(), ['a', 'b', 'c', 'd1', 'd2', 'e1', 'e2']);
  for (const p of Object.values(ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${p} is on disk`);
  assert.deepEqual(BEATS.map((b) => b.art), ['a', 'b', 'c', 'd1', 'e1', 'e2', 'e2'], 'the frames, beat by beat');
  for (const b of BEATS) {
    for (const v of SHOTS[b.id]) {
      assert.ok(v.s >= 1 && v.s <= 3, `${b.id}: zoom ${v.s} never shows past the painting`);
      assert.ok(v.fx >= 0 && v.fx <= 1 && v.fy >= 0 && v.fy <= 1, `${b.id}: aim inside the painting`);
    }
  }
  const pts = Object.values(MARKS).flatMap((m) => (Array.isArray(m[0]) ? m : [m]));
  for (const [u, v] of pts) assert.ok(u > 0 && u < 1 && v > 0 && v < 1, 'marks inside the painting');
  assert.equal(MARKS.doors.length, 5, 'a glow per door, 金木水火土');
  assert.equal(ASPECT, 9 / 16);
  const src = fs.readFileSync(path.join(ROOT, 'scripts/setpieces/zhuji.js'), 'utf8');
  assert.doesNotMatch(src, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect)\(/, 'no strokes or shapes drawn in code');
  assert.doesNotMatch(src, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'its tweens go through the bag');
  assert.match(src, /destroy\(\) \{\s*bag\.killAll\(\);/);
});

test('the door: d1 soaks into d2 under one camera, and the still ends on 爹\'s note', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/setpieces/zhuji.js'), 'utf8');
  assert.match(src, /use\('d2', 'door', \{ view: L\.door\.view/, 'd2 shares d1\'s camera: only the note changes');
  assert.ok(stillSvg('door').includes(ART.d2));
  assert.ok(!stillSvg('door').includes(ART.d1));
});

test('no WebGL: each beat is its painting, still, cropped where the camera ends; no words drawn', () => {
  for (const b of BEATS) {
    const svg = stillSvg(b.id, { W: 1000, H: 562 });
    assert.match(svg, /^<svg class="spstill"/);
    assert.doesNotMatch(svg, /<text/);
  }
  assert.ok(stillSvg('gather').includes(ART.a));
  assert.ok(stillSvg('settle').includes(ART.e2));
});

test('small on purpose — the first rung (his: 「筑基有一点天象就可以」): no shake or flash, stars only a little brighter, never hanging down', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/setpieces/zhuji.js'), 'utf8');
  assert.doesNotMatch(src, /yoyo|repeat:/, 'no jolts or shakes: the camera only pushes and rises');
  assert.doesNotMatch(src, /\.fill\(PAPER\)/, 'no white flash');
  const stars = BEATS.find((b) => b.id === 'stars').line.zh;
  assert.match(stars, /亮了一些/);
  assert.doesNotMatch(stars, /往下垂|摘得着|轰/);
  const book = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/08-第八回.md'), 'utf8');
  assert.ok(book.includes(stars.replace('那口锅', '那口「锅」')), 'the book says the same');
  for (const k of ['a', 'b', 'e2']) assert.equal(WORLD[k], 'outer', `${k}: the sky outside is monochrome ink, the 天象 kept small`);
});

test('the 台 is inside him (his: 「筑基的图片在小满旁边画了个台子, 其实应该是内景的台子吧」): the zhu beat plays on an inner painting, never one with the cliff', () => {
  assert.deepEqual(Object.keys(WORLD).sort(), Object.keys(ART).sort(), 'every painting is in one world or the other');
  const worldOf = (id) => WORLD[BEATS.find((b) => b.id === id).art];
  assert.equal(worldOf('zhu'), 'inner', 'the four piles and the 台: the small cosmos inside him');
  assert.deepEqual(BEATS.map((b) => worldOf(b.id)), ['outer', 'outer', 'inner', 'inner', 'inner', 'outer', 'outer'],
    'out on the cliff, in through c → d → e1, and out again as he opens his eyes');
  assert.equal(WORLD.d2, 'inner');
  assert.notEqual(BEATS.find((b) => b.id === 'zhu').art, BEATS.find((b) => b.id === 'stars').art, 'the 台 and the cliff never share a painting');
  const src = fs.readFileSync(path.join(ROOT, 'scripts/setpieces/zhuji.js'), 'utf8');
  assert.match(src, /L\.stars = use\('e2', 'stars'\)/, 'the cliff soaks in over the cosmos: its own layer, not a rise over one painting');
});
