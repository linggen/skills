// The book's pictures: `::: 画 <panel-id>` puts a 小人书 panel full width in
// the text, and `[words]{注=id}` underlines words whose figure (a note in
// worlds/<world>/notes.json) stands beside the paragraph.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillHero, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/huxian-bing');
const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
const WORLD = path.join(ROOT, 'worlds', book.world);
const NOTES = JSON.parse(fs.readFileSync(path.join(WORLD, 'notes.json'), 'utf8')).notes;
const panel = (id) => `../worlds/jiuding/art/panels/${id}.webp`;
const chapters = [...book.chapters, ...(book.appendix ?? [])].map((c) => ({ ...c, md: fs.readFileSync(path.join(BOOK, c.file), 'utf8') }));

test('::: 画 renders the panel full width, with its caption when it has one', () => {
  const html = renderMarkdown('前一段。\n::: 画 00-masan\n\n::: 画 00-shiao 蒙山脚下，石坳村。\n后一段。', { panel });
  assert.equal(html, [
    '<p>前一段。</p>',
    '<figure class="panel"><img src="../worlds/jiuding/art/panels/00-masan.webp" alt="" loading="lazy"></figure>',
    '<figure class="panel"><img src="../worlds/jiuding/art/panels/00-shiao.webp" alt="蒙山脚下，石坳村。" loading="lazy"><figcaption>蒙山脚下，石坳村。</figcaption></figure>',
    '<p>后一段。</p>',
  ].join('\n'));
  assert.equal(renderMarkdown('::: 画 00-masan <b>', { panel }).match(/<b>/g), null, 'the caption is escaped');
  assert.equal(renderMarkdown('::: 画 00-masan\n\n一段。'), '<p>一段。</p>', 'no resolver: panels are left out, never shown as text');
});

test('{注=…} underlines the words and sets the figure beside its paragraph', () => {
  const html = renderMarkdown('**银月**：[尾闾，夹脊，玉枕]{注=三关}。三道关。', { notes: NOTES, src: (f) => `../worlds/jiuding/${f}` });
  assert.match(html, /^<div class="noted"><p><b>银月<\/b>：<span class="gloss" role="button" tabindex="0" data-note="三关">尾闾，夹脊，玉枕<\/span>。三道关。<\/p><aside class="sidenote" data-note="三关">/);
  assert.match(html, /<img src="\.\.\/worlds\/jiuding\/art\/notes\/neijingtu\.webp" alt="三关"/);
  assert.match(html, /<b>三关<\/b><span>督脉/);
  assert.match(html, /<small>《内经图》/);
  assert.match(renderMarkdown('[a]{注=三关}', { notes: NOTES, lang: 'en' }), /<b>The Three Passes<\/b>/);
});

test('an unknown note, or no notes at all, reads as just the words', () => {
  for (const opts of [{}, { notes: NOTES }, { notes: {} }]) {
    assert.equal(renderMarkdown('他说[三道关]{注=没有这条}。', opts), '<p>他说三道关。</p>');
  }
  assert.equal(renderMarkdown('[x]{注=constructor}', { notes: NOTES }), '<p>x</p>', 'no prototype key is a note');
  assert.equal(renderMarkdown('[<i>]{注=三关}', { notes: NOTES }).includes('<i>'), false, 'the words are escaped');
});

test('every ::: 画 in the book is a panel on disk; every 注 is a note with its picture', () => {
  let panels = 0;
  for (const c of chapters) {
    for (const [, id] of c.md.matchAll(/^:::\s*画\s+([\w-]+)/gm)) {
      panels++;
      assert.ok(fs.existsSync(path.join(WORLD, 'art/panels', `${id}.webp`)), `${c.file}: panel ${id}`);
    }
    for (const [, id] of c.md.matchAll(/\]\{注=([^{}\n]+)\}/g)) assert.ok(Object.hasOwn(NOTES, id), `${c.file}: note ${id}`);
  }
  assert.ok(panels >= 27, `${panels} panels in the book`);
  for (const [id, n] of Object.entries(NOTES)) {
    assert.ok(n.title?.zh && n.lines?.zh?.length >= 2 && n.lines.zh.length <= 3, `${id}: title and 2–3 lines`);
    assert.ok(n.credit?.zh && n.source?.url && n.source?.license, `${id}: credit and source`);
    const img = path.join(WORLD, n.image);
    assert.ok(fs.existsSync(img) && fs.statSync(img).size <= 150_000, `${id}: ${n.image} on disk, small`);
  }
});

test('the prologue\'s panels land in its two chapters, 三关 in 第一章, and the hero still fills', () => {
  const count = (c) => (c.md.match(/^::: 画 /gm) ?? []).length;
  assert.equal(count(chapters[0]) + count(chapters[1]), 28);
  const html = renderMarkdown(fillHero(chapters[2].md, { name: '秋白' }), { panel, notes: NOTES });
  assert.equal((html.match(/class="sidenote"/g) ?? []).length, 1);
  const first = renderMarkdown(fillHero(chapters[0].md, { name: '秋白' }), { panel, notes: NOTES });
  assert.match(first, /我叫秋白。/);
  assert.doesNotMatch(first, /:::|[{}]/);
});
