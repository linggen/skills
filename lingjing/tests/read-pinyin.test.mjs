// The book's word list (book.json `pinyin`) — a word not read at sight carries
// its pinyin wherever it stands, not only the first time (his, 2026-10-07:
// 只要出现就加拼音; readers forget after the first). read-md.js pinyinAll.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, fillHero, pinyinAll, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/jiuding-lu');
const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
const LIST = { 巽: 'xùn', 尾闾: 'wěi lǘ', 闾: 'lǘ', 蛫: 'guǐ' };
const py = (c, s) => `<ruby class="py">${c}<rt>${s}</rt></ruby>`;
const count = (html, re) => (html.match(re) ?? []).length;

test('every occurrence of a listed word is wrapped, the longest word first', () => {
  const html = renderMarkdown('巽，入也。巽四那一宫。\n\n从尾闾钻进去，闾门。', { pinyin: LIST });
  assert.equal(count(html, /<ruby class="py">巽<rt>xùn<\/rt><\/ruby>/g), 2);
  assert.ok(html.includes(py('尾', 'wěi') + py('闾', 'lǘ')), '尾闾 as a word, not 闾 alone');
  assert.ok(html.includes(`，${py('闾', 'lǘ')}门`));
});

test('never inside a tag or an attribute', () => {
  const html = pinyinAll('<span class="gloss" data-note="巽" title="巽四">巽</span>', LIST);
  assert.equal(html, `<span class="gloss" data-note="巽" title="巽四">${py('巽', 'xùn')}</span>`);
  assert.ok(![...html.matchAll(/<[^>]*>/g)].some((m) => m[0].slice(1).includes('<ruby')));
});

test('no double ruby: an explicit [字]{音=…} mark, or a creature named with its codex pinyin', () => {
  const codex = { gui: { id: 'gui', kind: '生物', name: '蛫', pinyin: 'guǐ', first: { book: 'h99' } } };
  const html = renderMarkdown('[巽]{音=xùn}，巽。[蛫]{注=gui}，蛫。', { pinyin: LIST, codex });
  assert.equal(count(html, /<ruby/g), 4, 'one ruby each: the mark, the listed 巽, the creature name, the bare 蛫');
  assert.ok(!/<ruby[^>]*>[^<]*<ruby|<rt>[^<]*<ruby/.test(html), 'no ruby inside a ruby or its rt');
});

test('inside a gloss, a 回目, a 典 link and a table cell', () => {
  const codex = { xun: { id: 'xun', kind: '人物', name: '尾闾子' } };
  const gloss = renderMarkdown('[尾闾子]{注=xun}来了。', { pinyin: LIST, codex });
  assert.match(gloss, /data-codex="xun"><ruby class="py">尾<rt>wěi<\/rt><\/ruby><ruby class="py">闾/);
  assert.ok(renderMarkdown('# 第一回　巽风入户　尾闾通关\n\n正文。', { pinyin: LIST }).includes(py('巽', 'xùn')));
  const classics = { k: { title: '庄子', original: '巽', source: { url: 'https://example.org' } } };
  assert.match(renderMarkdown('[巽者入也]{典=k}', { pinyin: LIST, classics }), /class="gloss dianref"[^>]*><ruby class="py">巽/);
  assert.ok(renderMarkdown('| 层 | 名 |\n|---|---|\n| 七 | 巽 |', { pinyin: LIST }).includes(`<td>${py('巽', 'xùn')}</td>`));
});

test('no list, or a word whose syllables do not count out: the text as it was', () => {
  assert.equal(renderMarkdown('巽。'), '<p>巽。</p>');
  assert.equal(renderMarkdown('巽。', { pinyin: { 巽: 'xùn sì' } }), '<p>巽。</p>');
});

test('the book: its list one syllable a character, of the 八卦 only 巽 艮 (坎 坤 震 乾 兑 离 readers know), no raw mark, no ruby in a tag', () => {
  const list = book.pinyin;
  for (const [w, s] of Object.entries(list)) assert.equal(s.trim().split(/\s+/).length, [...w].length, w);
  for (const c of ['坎', '坤', '震', '乾', '兑', '离']) assert.ok(!Object.hasOwn(list, c), c);
  for (const c of ['巽', '艮']) assert.ok(Object.hasOwn(list, c), c);
  for (const c of bookEntries(book)) {
    const md = fs.readFileSync(path.join(BOOK, c.file), 'utf8');
    for (const m of md.matchAll(/\[([^\]\n]+)\]\{音=/g)) assert.ok(!Object.hasOwn(list, m[1]), `${c.file}: [${m[1]}] is the list's — no mark needed`);
    const html = renderMarkdown(fillHero(md, {}), { hui: c.huimu ? c : null, pinyin: list });
    assert.ok(!html.includes('{音='), c.file);
    assert.ok(![...html.matchAll(/<[^>]*>/g)].some((m) => m[0].slice(1).includes('<')), `${c.file}: no tag inside a tag`);
    const text = html.replace(/<ruby\b[\s\S]*?<\/ruby>/g, '').replace(/<[^>]*>/g, '');
    for (const w of Object.keys(list)) assert.ok(!text.includes(w), `${c.file}: a bare ${w}`);
  }
});

test('the reader hands the book\'s list to renderMarkdown', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/read.js'), 'utf8'), /pinyin: book\.pinyin \?\? \{\}/);
});
