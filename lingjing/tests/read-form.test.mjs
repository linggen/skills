// The book's form — 《鹿鼎记》's (Hanli 2026-09-29: 「按回卷改，go」): 卷 = one
// province and its 鼎; 回 numbered through the whole book, each with a 回目 of
// two matching seven-character lines; no subheadings inside a 回, a scene
// break only (DESIGN.md § 回目). The reader walks it flat (read-md.js bookEntries).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, cnNumber, entryById, huiLabel, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/huxian-bing');
const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
const hui = bookEntries(book).filter((c) => c.huimu);

test('卷 hold 回; the 回 run 第一回, 第二回 … through the whole book, never restarting', () => {
  assert.deepEqual(book.volumes.map((v) => v.name.zh), ['卷一 · 沉鼎']);
  book.volumes.forEach((v) => assert.ok(v.hui.length <= 10, `${v.name.zh}: a 卷 is ten 回`));
  assert.deepEqual(hui.map((h) => h.n), hui.map((_, i) => i + 1));
  assert.deepEqual(hui.map((h) => h.label.zh), ['第一回', '第二回', '第三回', '第四回']);
  assert.equal(new Set(bookEntries(book).map((c) => c.id)).size, bookEntries(book).length, 'ids unique');
  book.volumes.forEach((v, i) => assert.equal(v.name.zh.startsWith(`卷${cnNumber(i + 1)}`), true, v.name.zh));
  assert.equal(bookEntries(book).at(-1).id, 'tuna', 'the appendix comes last');
  assert.deepEqual([1, 10, 12, 20, 21, 100].map(cnNumber), ['一', '十', '十二', '二十', '二十一', '一百']);
  assert.equal(huiLabel(14), '第十四回');
});

test('each 回目 is two seven-character lines; the file opens with the same title and holds no subheading', () => {
  for (const h of hui) {
    assert.equal(h.huimu.zh.length, 2, h.id);
    for (const line of h.huimu.zh) assert.equal([...line].length, 7, `${h.id}: 「${line}」 is seven characters`);
    assert.equal(h.huimu.en.length, 2, h.id);
    assert.match(h.file, new RegExp(`^${String(h.n).padStart(2, '0')}-${h.label.zh}\\.md$`), h.file);
    const md = fs.readFileSync(path.join(BOOK, h.file), 'utf8');
    assert.equal(md.split('\n')[0], `# ${h.label.zh}　${h.huimu.zh.join('　')}`, `${h.file}: title line`);
    assert.doesNotMatch(md, /^#{2,}\s/m, `${h.file}: no subheadings inside a 回`);
    assert.doesNotMatch(md, /\n---\s*\n\s*\n?---/, `${h.file}: no doubled scene break`);
  }
});

test('an old ?ch= id opens its 回; the 回 title renders centred as number and couplet; a scene break is a quiet ◇', () => {
  assert.deepEqual(['00', '01', '02', '03'].map((id) => entryById(book, id)?.label.zh), ['第一回', '第二回', '第三回', '第四回']);
  assert.equal(entryById(book, 'h03').file, '03-第三回.md');
  assert.equal(entryById(book, 'tuna').id, 'tuna');
  assert.equal(entryById(book, 'nope'), null);
  // read.js finds the 回 it opens by id, never by object identity (entryById builds fresh entries: 2026-09-29, every old link opened 第一回).
  const js = fs.readFileSync(path.join(ROOT, 'scripts/read.js'), 'utf8');
  assert.match(js, /const want = entryById\(book, params\.get\('ch'\)\)\?\.id;\n  const at = Math\.max\(0, all\.findIndex\(\(c\) => c\.id === want\)\);/);
  assert.doesNotMatch(js, /all\.indexOf\(entryById/);
  assert.equal(renderMarkdown('# 第四回　九转一炉藏饭桶　千鱼漳水立龙门\n\n甲。\n\n---\n\n乙。'),
    '<h1 class="huimu"><span class="hui">第四回</span><span class="line">九转一炉藏饭桶</span><span class="line">千鱼漳水立龙门</span></h1>\n<p>甲。</p>\n<hr class="scene">\n<p>乙。</p>');
  assert.equal(renderMarkdown('# 附录 ·《吐纳经》'), '<h1>附录 ·《吐纳经》</h1>', 'a plain title stays plain');
  const css = fs.readFileSync(path.join(ROOT, 'scripts/read.css'), 'utf8');
  assert.match(css, /hr\.scene::before \{ content: '◇'/);
  assert.match(css, /h1\.huimu \{ text-align: center/);
});

test('every 图鉴 first appearance names a 回 of the book', () => {
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds', book.world, 'codex.json'), 'utf8'));
  for (const [id, e] of Object.entries(codex.entries)) if (e.first?.book) assert.ok(hui.some((h) => h.id === e.first.book), `${id}: first.book ${e.first.book}`);
});
