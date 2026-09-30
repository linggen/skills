// 筑基天象 (setpiece-zhuji.js): the beats follow the book's 筑基 in order, both
// languages carry every beat, the moment stays mid-size (~10–14 s), and the
// still frames (reduced motion / no WebGL) draw what each beat is about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOOR_WORDS, FIVE, SET_PIECES, ZHUJI_BEATS, beatStarts, starField, stillSvg, totalMs } from '../scripts/setpiece-zhuji.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the beats run in the book\'s order, each in both languages', () => {
  assert.deepEqual(ZHUJI_BEATS.map((b) => b.id), ['gather', 'light', 'tai', 'door', 'zhu', 'stars', 'settle']);
  for (const b of ZHUJI_BEATS) {
    assert.ok(b.zh && b.en, b.id);
    assert.ok(!/你/.test(b.zh), `${b.id}: the moment tells of him, not to you`);
  }
  assert.equal(ZHUJI_BEATS.at(-1).ms, 0, 'the last beat is a resting frame');
});

test('mid-size: about ten seconds, never the 卷\'s big set piece', () => {
  const ms = totalMs();
  assert.ok(ms >= 9000 && ms <= 14000, `total ${ms} ms`);
  const starts = beatStarts();
  assert.equal(starts[0], 0);
  starts.slice(1).forEach((s, i) => assert.ok(s > starts[i]));
});

test('the words are the book\'s: the 锅 of cloud, 勿入 → 今日放学, the four gates of 黄庭, 几道纹', () => {
  const book = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/09-第九回.md'), 'utf8');
  for (const phrase of ['倒扣的大锅', '勿入', '今日放学', '上有黄庭下关元，后有幽阙前命门', '伸手便摘得着', '几道纹']) {
    assert.ok(book.includes(phrase), `the book has ${phrase}`);
    assert.ok(ZHUJI_BEATS.some((b) => b.zh.includes(phrase)), `a beat carries ${phrase}`);
  }
  assert.deepEqual(DOOR_WORDS.zh, ['勿入', '今日放学']);
  assert.deepEqual(FIVE.map((f) => f.zh), ['金', '木', '水', '火', '土']);
});

test('still frames: an svg per beat, drawing that beat', () => {
  for (const b of ZHUJI_BEATS) {
    const s = stillSvg(b.id);
    assert.match(s, /^<svg class="zjstill"/);
    assert.ok(s.includes(`data-beat="${b.id}"`));
  }
  assert.match(stillSvg('light'), /url\(#zjlight\)/, 'the light comes down');
  assert.match(stillSvg('door'), /今日放学/, 'the door\'s words are 爹\'s');
  assert.match(stillSvg('door', 'en'), /NO SCHOOL TODAY/);
  assert.ok((stillSvg('stars').match(/#fdf6e3/g) ?? []).length >= 50, 'the stars hang low');
  assert.ok(!stillSvg('gather').includes('#fdf6e3'), 'no stars before the 锅 bursts');
});

test('the same sky every play', () => {
  assert.deepEqual(starField(), starField());
  assert.equal(starField().length, 72);
});

test('one registry entry, played by id', () => {
  assert.equal(SET_PIECES.zhuji.beats, ZHUJI_BEATS);
  assert.equal(typeof SET_PIECES.zhuji.play, 'function');
});
