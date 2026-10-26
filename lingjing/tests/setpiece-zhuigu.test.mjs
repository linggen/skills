// 暴雨坠谷 (setpieces/zhuigu.js; Hanli 10-22: 「1-6 都是好主意, 按你说的改一遍. 关键是能留住玩家」): the cut 拽爹上崖
// board's slot in 00-fall is a ~10 s 大场面 — the storm on the slope, the fall, the vine — laid under the fall's
// paragraph (`{景=zhuigu}`, rules/tell.mjs beatsOf `piece`; lingjing.js beatPiece). No input. The book unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { resolve } from '../scripts/rules.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { ART, BEATS, MARKS, SHOTS, SIZES, TEMPO, TITLE, stillSvg } from '../scripts/setpieces/zhuigu.js';
import { TO_VALLEY, walk } from './prologue.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = loadContent();
const NOW = new Date('2026-10-22T10:00:00');
const fall = content.chapters['00-prologue'].scenes['00-fall'];
const PIECE = /\{景=([a-z]+)\}/g;
const piece = fs.readFileSync(path.join(ROOT, 'scripts/setpieces/zhuigu.js'), 'utf8');

test('three beats, ~10 s, each the book\'s own words in order (paragraph 199 of 第一回, zh and en)', () => {
  assert.deepEqual(BEATS.map((b) => b.id), ['ya', 'gun', 'tai']);
  assert.ok(TITLE.zh && TITLE.en);
  const total = BEATS.reduce((a, b) => a + b.ms, 0) / 1000;
  assert.ok(total >= 8 && total <= 12, `${total} s`);
  for (const lang of ['zh', 'en']) assert.ok(TEMPO[lang] >= 1 && TEMPO[lang] <= 1.1);
  const book = {
    zh: fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/01-第一回.md'), 'utf8').split(/\n+/).find((p) => p.startsWith('小满滚了下去。泥浆')),
    en: fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/en/h01.md'), 'utf8').split(/\n+/).find((p) => p.startsWith('Xiaoman fell. Mud')),
  };
  for (const lang of ['zh', 'en']) {
    assert.ok(book[lang], `${lang}: the paragraph`);
    let at = 0;
    for (const b of BEATS) {
      const i = book[lang].indexOf(b.line[lang], at);
      assert.ok(i >= at, `${lang} ${b.id}: the book's words, in order`);
      at = i + b.line[lang].length;
    }
  }
});

test('painted, not drawn: three paintings on disk, the camera inside each, no shapes in code', () => {
  for (const p of Object.values(ART)) assert.ok(fs.existsSync(path.join(ROOT, 'worlds/jiuding', p)), `${p} is on disk`);
  for (const b of BEATS) {
    assert.ok(ART[b.art] && SIZES[b.art], b.id);
    for (const v of SHOTS[b.id]) assert.ok(v.s >= 1 && v.s <= 3 && v.fx > 0 && v.fx < 1 && v.fy > 0 && v.fy < 1, `${b.id}: inside the painting`);
  }
  assert.ok(SHOTS.gun[1].fy > SHOTS.gun[0].fy + 0.4, 'the camera falls with him down the cliff');
  for (const [u, v] of Object.values(MARKS)) assert.ok(u > 0 && u < 1 && v > 0 && v < 1);
  assert.doesNotMatch(piece, /\.(ellipse|circle|moveTo|lineTo|bezierCurveTo|quadraticCurveTo|poly|roundRect)\(/, 'no strokes or shapes drawn in code');
  assert.doesNotMatch(piece, /\bgsap\.(to|from|fromTo|timeline|delayedCall)\(/, 'its tweens go through the bag');
  assert.match(piece, /destroy\(\) \{\s*bag\.killAll\(\);/);
  const svg = stillSvg('tai', { W: 1000, H: 562 });
  assert.ok(svg.startsWith('<svg class="spstill"') && svg.includes(ART.tai) && !svg.includes('<text'));
});

test('00-fall marks the fall\'s paragraph, zh and en, the book\'s two paragraphs of the fall as one box; no board stands there', () => {
  const way = fall.exits.find((e) => e.id === 'check');
  for (const lang of ['zh', 'en']) {
    for (const k of ['story']) {
      const marked = way[k][lang].split(/\n+/).filter((p) => PIECE.test(p));
      PIECE.lastIndex = 0;
      assert.equal(marked.length, 1, `${k} ${lang}: one paragraph`);
      assert.match(marked[0], /\{景=zhuigu\}$/);
    }
    const full = way.story[lang].split(/\n+/).find((p) => /\{景=zhuigu\}/.test(p)).replace(PIECE, '');
    assert.ok(full.endsWith(BEATS.at(-1).line[lang]), `${lang}: the book's paragraph ends on the snap`);
    const cut = way.story[lang].split(/\n+/).find((p) => /\{景=zhuigu\}/.test(p)).replace(PIECE, '');
    assert.ok(cut.startsWith(lang === 'zh' ? '小满滚了下去。' : 'Xiaoman fell.'), lang);
  }
  assert.ok(!fall.show && !fall.offers, 'the board is gone (拽爹 cut 10-22)');
});

test('the beat carries the piece when the fall is told: once, at its paragraph, the mark never said', () => {
  const s0 = walk(newState(content, 'zh', NOW), TO_VALLEY.slice(0, TO_VALLEY.findIndex(([, a]) => a?.exit === 'check')), content, NOW);
  assert.equal(s0.scene, '00-fall');
  const s = resolve(tellOf(content, s0)?.keep ?? s0, content, { now: NOW, quests: [] }, { exit: 'check' }).state;
  const tell = playOf(content, s, tellOf(content, s).tell);
  for (const t of tell) for (const b of t.beats.zh) assert.doesNotMatch(b.text, /景=/);
  const pieces = tell.flatMap((t) => t.beats.zh.filter((b) => b.piece).map((b) => [t.id, b.piece, b.text]));
  assert.equal(pieces.length, 1);
  assert.deepEqual(pieces[0].slice(0, 2), ['00-fall/check', 'zhuigu']);
  assert.match(pieces[0][2], /^小满滚了下去。/);
  assert.ok(tell.flatMap((t) => t.beats.en).some((b) => b.piece === 'zhuigu'), 'and in English');
});
