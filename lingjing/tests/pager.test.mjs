// 快's pages and the whole picture (Hanli, 2026-10-15, live at 古七's 药园): 「可以用下面半屏显示吗?
// 可以让用户翻页.」 — the passage in the stage's lower half, page by page, paged from the band's real
// height (pager.js pageBreaks over measured boxes); and a creature's plate shown whole in its 亮相
// and 出场 — contain, never cover (sight.js fitBox, artRoom).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pageBreaks, pageOf } from '../scripts/pager.js';
import { artRoom, fitBox } from '../scripts/sight.js';

const ROOT = path.resolve(import.meta.dirname, '..');

/* A column laid out as the band would: paragraphs of sentences, each sentence `lines` lines of
   `lh` px, sentences flowing on in a paragraph, `gap` px between paragraphs. */
function layout(paras, { lh = 30, gap = 18 } = {}) {
  const units = [];
  let y = 0;
  paras.forEach((ss, p) => {
    ss.forEach((lines, k) => {
      units.push({ p, k, top: y, bottom: y + lines * lh, end: k === ss.length - 1 });
      y += lines * lh;
    });
    y += gap;
  });
  return units;
}
const pages = (units, starts) => starts.map((s, k) => units.slice(s, starts[k + 1] ?? units.length));

test('a page ends at a paragraph\'s end where one falls in its lower half', () => {
  // three paragraphs of 3 one-line sentences: 90 px each, 18 between
  const u = layout([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  const starts = pageBreaks(u, 220);
  assert.deepEqual(starts, [0, 6], 'two paragraphs (90 + 18 + 90 = 198) fit 220; the third goes on');
  for (const pg of pages(u, starts)) assert.ok(pg.at(-1).end, 'every page ends with a paragraph');
});

test('a paragraph too long for what is left breaks at a sentence\'s end — never mid-sentence', () => {
  const u = layout([[1, 1], [2, 2, 2, 2, 2]]); // 60, then 300 px in five 60 px sentences
  const cap = 200;
  const starts = pageBreaks(u, cap);
  for (const pg of pages(u, starts)) {
    assert.ok(pg.at(-1).bottom - pg[0].top <= cap, 'each page fits the band');
    assert.ok(pg.length >= 1);
  }
  assert.deepEqual(starts, [0, 4], 'the short paragraph and two sentences of the long one fill page one (60+18+120 = 198)');
  assert.equal(u[starts[1]].k, 2, 'page two picks up at the next sentence of the same paragraph');
  // every unit on exactly one page, in order
  assert.deepEqual(pages(u, starts).flat(), u);
});

test('one sentence taller than the band is a page of its own (it scrolls there)', () => {
  const u = layout([[1], [12], [1, 1]]);
  const starts = pageBreaks(u, 200);
  assert.deepEqual(starts, [0, 1, 2]);
  assert.equal(pages(u, starts)[1].length, 1);
});

test('the page count is stable for a given size, and follows the size', () => {
  const u = layout([[2, 1, 3], [1, 1], [4, 2, 1, 1], [1], [3, 3, 3]]);
  const a = pageBreaks(u, 240), b = pageBreaks(u, 240);
  assert.deepEqual(a, b, 'same boxes, same pages');
  assert.ok(pageBreaks(u, 480).length < a.length, 'a taller band, fewer pages');
  assert.equal(pageBreaks(u, 100000).length, 1, 'all of it fits: one page, no pager');
  assert.deepEqual(pageBreaks([], 200), []);
  assert.deepEqual(pageBreaks(u, 0), [0], 'no band measured yet: one page');
  // the reader's sentence after a resize: the page that holds it
  assert.equal(pageOf(a, a[2]), 2);
  assert.equal(pageOf(a, a[2] + 1 < (a[3] ?? Infinity) ? a[2] + 1 : a[2]), 2);
});

test('the choices are a block of their own: never split, on the last page', () => {
  const u = layout([[1, 1, 1], [1, 1]]);
  const top = u.at(-1).bottom + 14;
  u.push({ block: true, top, bottom: top + 50, end: true });
  const starts = pageBreaks(u, 200);
  const last = pages(u, starts).at(-1);
  assert.ok(last.at(-1).block, 'the last page holds the choices');
});

test('the last page is never the way on alone: the page before gives up its last paragraph', () => {
  // 00-masan at 390 (2026-10-16): three full pages of words, then a page of 「接着往下」 only
  const u = layout([[1, 1], [1, 1], [1, 1]]); // 60 · 18 · 60 · 18 · 60 = 216
  const top = u.at(-1).bottom + 14;
  u.push({ block: true, top, bottom: top + 50, end: true });
  const starts = pageBreaks(u, 220);
  const ps = pages(u, starts);
  assert.ok(ps.at(-1).length > 1 && ps.at(-1).at(-1).block, 'the block stands under words');
  assert.equal(ps.at(-1)[0].k, 0, 'the moved words begin a paragraph');
  for (const pg of ps) assert.ok(pg.at(-1).bottom - pg[0].top <= 220, 'each page still fits the band');
  assert.deepEqual(ps.flat(), u, 'every unit once, in order');
  // nothing fits beside the block: left as it was
  const big = layout([[7]]);
  big.push({ block: true, top: 214, bottom: 264, end: true });
  assert.deepEqual(pageBreaks(big, 220), [0, 1]);
});

test('the whole picture: contain, never cover — a 3:2 woodcut in a portrait room, an upright one in a wide room', () => {
  const qiuyu = 960 / 640, fuzhu = 960 / 1152, face = 2 / 3;
  // the 亮相's room on a desktop stage: wide; a 3:2 plate fills the width, the whole beast in it
  const a = fitBox({ w: 800, h: 556 }, qiuyu);
  assert.deepEqual(a, { w: 800, h: 533 });
  // the old frame was 2:3 at the card's height — a crop to its middle; contain in that frame shows it all, smaller
  const b = fitBox({ w: 371, h: 556 }, qiuyu);
  assert.ok(b.w <= 371 && b.h <= 556 && Math.abs(b.w / b.h - qiuyu) < 0.01);
  const c = fitBox({ w: 800, h: 556 }, fuzhu);
  assert.equal(c.h, 556, 'upright: the height bounds it');
  assert.ok(c.w < 800);
  assert.deepEqual(fitBox({ w: 800, h: 556 }, face), { w: 370, h: 556 }, 'a 2:3 portrait stands at full height, as before — the whole figure');
  assert.equal(fitBox({ w: 0, h: 500 }, qiuyu), null);
  assert.equal(fitBox({ w: 400, h: 500 }, 0), null);
});

test('a 出场\'s room: beside the words on a wide stage, above them on a tall one', () => {
  const wide = artRoom({ w: 1026, h: 870 }, { right: 513, top: 520 });
  assert.ok(wide.x > 513, 'right of the words');
  assert.ok(wide.x + wide.w <= 1026 && wide.y + wide.h <= 870);
  const tall = artRoom({ w: 390, h: 700 }, { right: 390, top: 420 });
  assert.ok(tall.y + tall.h <= 420, 'above the words');
  assert.ok(tall.w > 300);
  // words across a wide stage leave no room beside them: above instead
  const full = artRoom({ w: 1026, h: 870 }, { right: 980, top: 600 });
  assert.ok(full.y + full.h <= 600 && full.w > 900);
  for (const room of [wide, tall, full]) {
    const box = fitBox(room, 1.5);
    assert.ok(box.w <= room.w && box.h <= room.h, 'the plate inside its room');
  }
});

test('the page wires it: the band, the pager, keys, swipe, and the fitted pictures', () => {
  const js = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(js, /pager\.sync\(el\);/, 'paged after every paint of the story');
  assert.match(js, /\['\[data-pg\]', \(el\) => \{ if \(!el\.disabled\) pageTurn\(Number\(el\.dataset\.pg\)\); \}\]/);
  assert.match(js, /readingHere\(\)\?\.all\?\.whole \? wordsTap\(\) : storyTap\(\)/, 'at 快 a tap on the stage turns a page, never the passage');
  assert.match(js, /const PAGE_KEYS = \{ ArrowRight: 1, PageDown: 1, ' ': 1, Enter: 1, ArrowLeft: -1, PageUp: -1 \};/);
  assert.match(js, /const beatInView = \(\) => pager\.beat\(\);/, '快 → 中 picks up at the page\'s first beat');
  assert.match(js, /fitAppear\(el\);/, 'the 出场 plate is fitted');
  const sight = fs.readFileSync(path.join(ROOT, 'scripts/sight.js'), 'utf8');
  assert.match(sight, /if \(card\) fitCard\(card\);/, 'every 亮相 picture is fitted');
  assert.match(sight, /e\.kind === '生物' \? ' plate' : ''/, 'a creature\'s plate keeps the ink fade at its edges');
  const css = fs.readFileSync(path.join(ROOT, 'scripts/story.css'), 'utf8');
  assert.match(css, /\.sightcard img\.sightpic\.fit[^{]*\{[^}]*object-fit: contain/);
  assert.match(css, /\.appear \.appearart\.fit \{[^}]*object-fit: contain/);
  assert.match(css, /\.story \.wholecol \.pg-off[^{]*\{ display: none; \}/);
});
