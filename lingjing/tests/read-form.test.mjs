// The book's form — 《鹿鼎记》's (Hanli 2026-09-29: 「按回卷改，go」), two lines
// (2026-10-01), the 今 as interludes (2026-10-02, 纲要 § 一·四: 「两个线不应该并列写，
// 减轻今线的戏份」): 卷一 is eight 古 回 in four films of two, a 今 interlude
// after each film, the book opening on 古一 and the 卷 ending on its last
// interlude. Only the 古 回 are numbered (第一回 …); an interlude reads 「今 · 一」.
// Numbers and tags are computed from book.json's order; 古 has a 回目 of two
// matching seven-character lines, 今 one line; no subheadings inside a 回, a
// scene break only; `draft` only for one held back (DESIGN.md § 五·五). An id
// folded into another (`absorbs`) opens the entry that holds it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, cnNumber, entryById, huiLabel, huimuHtml, jinLabel, renderMarkdown, resolveId } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/jiuding-lu');
const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
const hui = bookEntries(book).filter((c) => c.huimu);
const raw = book.volumes.flatMap((v) => v.hui);
const gu = hui.filter((h) => h.line === 'gu');
const jin = hui.filter((h) => h.line === 'jin');

test('卷 hold 回; the 古 回 run 第一回, 第二回 … through the whole book; each 今 interlude reads 今 · N and takes no number', () => {
  assert.deepEqual(book.volumes.map((v) => v.name.zh), ['卷一 · 沉鼎']);
  // The published view: each line numbered in turn, no gap — a 回 Hanli holds back (`draft`) left out.
  assert.deepEqual(gu.map((h) => h.n), gu.map((_, i) => i + 1));
  assert.deepEqual(gu.map((h) => h.label.zh), gu.map((_, i) => huiLabel(i + 1)));
  assert.deepEqual(jin.map((h) => h.label.zh), jin.map((_, i) => jinLabel(i + 1)));
  assert.ok(jin.every((h) => !/第.+回/.test(h.label.zh) && !/第.+回/.test(h.title.zh)), 'an interlude never says 第N回');
  assert.ok(hui.every((h) => !h.draft), 'no draft in the published view');
  // 卷一 (2026-10-02): 古一 古二 ‖今一‖ 古三 古四 ‖今二‖ 古五 古六 ‖今三‖ 古七 ‖今四‖ 古八 —
  // the book opens on 古, each film of two 古 回 is followed by one interlude, save the last, which holds 今四 inside so the 卷 ends on 古八.
  const v1 = hui.filter((h) => h.volume.id === 'juan1');
  assert.equal(v1[0].line, 'gu', 'the book opens on 古一');
  assert.deepEqual(v1.map((h) => (h.line === 'jin' ? '今' : '古')).join(''), '古古今古古今古古今古今古');
  assert.deepEqual(v1.map((h) => h.id), ['h01', 'h02', 'j01', 'h04', 'h05', 'j04', 'h07', 'h08', 'j07', 'h09', 'j09', 'h10']);
  assert.equal(new Set(bookEntries(book).map((c) => c.id)).size, bookEntries(book).length, 'ids unique');
  book.volumes.forEach((v, i) => assert.equal(v.name.zh.startsWith(`卷${cnNumber(i + 1)}`), true, v.name.zh));
  assert.equal(bookEntries(book).at(-1).id, 'tuna', 'the appendix comes last');
  assert.deepEqual([1, 10, 12, 20, 21, 100].map(cnNumber), ['一', '十', '十二', '二十', '二十一', '一百']);
  assert.equal(huiLabel(14), '第十四回');
  assert.equal(jinLabel(3), '今 · 三');
  assert.equal(jinLabel(3, 'en'), 'Now · 3');
});

test('ids are stable forever: a folded 回 is absorbed, never reused, and names its absorber', () => {
  const ids = raw.flatMap((h) => [h.id, ...(h.absorbs ?? [])]);
  assert.equal(new Set(ids).size, ids.length, 'no id twice, absorbed or not');
  assert.deepEqual(ids.filter((id) => /^h/.test(id)).sort(), ['h01', 'h02', 'h03', 'h04', 'h05', 'h06', 'h07', 'h08', 'h09', 'h10'], 'every 古 id of the ten-回 book still answers');
  assert.deepEqual(ids.filter((id) => /^j/.test(id)).sort(), ['j01', 'j02', 'j03', 'j04', 'j05', 'j06', 'j07', 'j08', 'j09', 'j10'], 'every 今 id still answers');
  for (const h of raw) for (const id of h.absorbs ?? []) {
    assert.equal(resolveId(book, id), h.id, `${id} → ${h.id}`);
    assert.equal((id[0] === 'h') === (h.line === 'gu'), true, `${id}: absorbed within its own line`);
  }
});

test('each 古 回目 is two seven-character lines, each 今 one line; every file opens with its title and holds no subheading', () => {
  for (const h of raw) {
    assert.ok(['gu', 'jin'].includes(h.line), `${h.id}: line is gu or jin`);
    assert.match(h.id, h.line === 'jin' ? /^j\d\d$/ : /^h\d\d$/, `${h.id}: 今 ids are j01…, 古 h01…`);
    // A held-back draft's file may still be on the writer's desk (uncommitted); a published 回's is in the book.
    if (!h.draft) assert.ok(fs.existsSync(path.join(BOOK, h.file)), `${h.id}: ${h.file} exists`);
    if (h.line === 'jin') {
      assert.equal(h.huimu.zh.length, 1, `${h.id}: a 今 回目 is one line`);
      assert.equal(h.huimu.en.length, 1, h.id);
      // The interludes: 今线/插曲NN.md, their title line 「今 · 一　一句话」 by the line's ordinal.
      assert.equal(h.file, `今线/插曲${String(h.n).padStart(2, '0')}.md`, `${h.id}: file`);
      if (fs.existsSync(path.join(BOOK, h.file))) {
        const md = fs.readFileSync(path.join(BOOK, h.file), 'utf8');
        assert.equal(md.split('\n')[0], `# ${jinLabel(h.n)}　${h.huimu.zh[0]}`, `${h.file}: title line`);
        assert.doesNotMatch(md, /^#{2,}\s/m, `${h.file}: no subheadings inside an interlude`);
      }
    }
  }
  // The line ordinals (`n`) run 1, 2 … within each line, in book order.
  for (const l of ['gu', 'jin']) assert.deepEqual(raw.filter((h) => h.line === l).map((h) => h.n), raw.filter((h) => h.line === l).map((_, i) => i + 1), l);
  for (const h of gu) {
    assert.equal(h.huimu.zh.length, 2, h.id);
    for (const line of h.huimu.zh) assert.equal([...line].length, 7, `${h.id}: 「${line}」 is seven characters`);
    assert.equal(h.huimu.en.length, 2, h.id);
    // A 古 file is named by its line ordinal — 古三 = 03-第三回.md (renamed 2026-10-02) — and its title line
    // carries the same number and the 回目.
    assert.equal(h.file, `${String(h.n).padStart(2, '0')}-${huiLabel(h.n)}.md`, `${h.id}: file`);
    const md = fs.readFileSync(path.join(BOOK, h.file), 'utf8');
    assert.equal(md.split('\n')[0].replace(/^# 第[一二三四五六七八九十]+回　/, ''), h.huimu.zh.join('　'), `${h.file}: title line`);
    assert.match(md.split('\n')[0], new RegExp(`^# ${huiLabel(h.n)}　`), `${h.file}: title line number`);
    assert.doesNotMatch(md, /^#{2,}\s/m, `${h.file}: no subheadings inside a 回`);
    assert.doesNotMatch(md, /\n---\s*\n\s*\n?---/, `${h.file}: no doubled scene break`);
  }
});

test('an old ?ch= id opens its 回; the 回 title renders centred as number and couplet; a scene break is a quiet ◇', () => {
  // 2026-09-30 卷一 split into ten: the old 第一章 · 外门 (02) begins old 古五 (h05), 第二章 (03) old 古九 (h09).
  // An old id names the same 回 by its stable id, under whatever number the book now gives it.
  assert.deepEqual(['00', '01', '02', '03'].map((id) => entryById(book, id)?.id), ['h01', 'h02', 'h05', 'h09']);
  for (const id of ['00', '01', '02', '03']) assert.equal(entryById(book, id).label.zh, hui.find((h) => h.id === entryById(book, id).id).label.zh, id);
  // 2026-10-02: h03 folded into 古二, h06 into 古四; the 今 回 into four interludes.
  assert.deepEqual(['h03', 'h06', 'j02', 'j03', 'j05', 'j06', 'j08', 'j10'].map((id) => entryById(book, id)?.id), ['h02', 'h05', 'j01', 'j01', 'j04', 'j04', 'j07', 'j09']);
  assert.equal(entryById(book, 'h03').label.zh, '第二回');
  assert.equal(entryById(book, 'j10').label.zh, '今 · 四');
  assert.equal(entryById(book, 'tuna').id, 'tuna');
  assert.equal(entryById(book, 'nope'), null);
  // read.js finds the 回 it opens by id, never by object identity (entryById builds fresh entries: 2026-09-29, every old link opened 第一回).
  const js = fs.readFileSync(path.join(ROOT, 'scripts/read.js'), 'utf8');
  assert.match(js, /const want = entryById\(book, params\.get\('ch'\), view\)\?\.id;\n  const at = Math\.max\(0, all\.findIndex\(\(c\) => c\.id === want\)\);/);
  assert.doesNotMatch(js, /all\.indexOf\(entryById/);
  assert.equal(renderMarkdown('# 第四回　九转一炉藏饭桶　千鱼漳水立龙门\n\n甲。\n\n---\n\n乙。'),
    '<h1 class="huimu"><span class="hui">第四回</span><span class="line">九转一炉藏饭桶</span><span class="line">千鱼漳水立龙门</span></h1>\n<p>甲。</p>\n<hr class="scene">\n<p>乙。</p>');
  // An interlude's title line: 「今 · 一」, then one line — no 回 number, never 今 taken for a first line.
  assert.equal(renderMarkdown('# 今 · 一　一千米我跑吐了一回\n\n甲。'),
    '<h1 class="huimu jin"><span class="hui">今 · 一</span><span class="line">一千米我跑吐了一回</span></h1>\n<p>甲。</p>');
  assert.equal(renderMarkdown('# 附录 ·《吐纳经》'), '<h1>附录 ·《吐纳经》</h1>', 'a plain title stays plain');
  const css = fs.readFileSync(path.join(ROOT, 'scripts/read.css'), 'utf8');
  assert.match(css, /hr\.scene::before \{ content: '◇'/);
  assert.match(css, /h1\.huimu \{ text-align: center/);
});

test('every 图鉴 first appearance names a 回 of the book (or one folded into it)', () => {
  const codex = JSON.parse(fs.readFileSync(path.join(ROOT, 'worlds', book.world, 'codex.json'), 'utf8'));
  for (const [id, e] of Object.entries(codex.entries)) if (e.first?.book) assert.ok(hui.some((h) => h.id === resolveId(book, e.first.book)), `${id}: first.book ${e.first.book}`);
});

// ── Two lines, numbered from the order (Hanli 2026-10-01; interludes 2026-10-02) ──
// A made-up book: the order alone decides 第N回, 今 · N and the tag; a draft is
// left out of the published view and its numbering, and shown in place with ?draft=1.
const two = (hui, aliases = {}) => ({ volumes: [{ id: 'juan1', n: 1, name: { zh: '卷一', en: 'Volume One' }, hui }], aliases });
const G = (id, n, extra = {}) => ({ id, line: 'gu', n, huimu: { zh: ['上联上联上联上', '下联下联下联下'], en: ['A', 'B'] }, file: `${id}.md`, ...extra });
const J = (id, n, extra = {}) => ({ id, line: 'jin', n, huimu: { zh: [`今${n}的一句话`], en: [`Now ${n}`] }, file: `j/${id}.md`, ...extra });

test('the label is derived from the order: 古 回 numbered through, the 今 between them 今 · N', () => {
  const b = two([G('h01', 1), G('h02', 2), J('j01', 1), G('h03', 3), G('h04', 4), J('j02', 2)]);
  const all = bookEntries(b);
  assert.deepEqual(all.map((h) => `${h.label.zh}${h.tag.zh}${h.id}`), ['第一回古h01', '第二回古h02', '今 · 一今j01', '第三回古h03', '第四回古h04', '今 · 二今j02']);
  assert.deepEqual(all.map((h) => h.ord), [1, 2, 1, 3, 4, 2], 'book.json n is the ordinal within the line, kept as ord');
  assert.equal(all[1].title.zh, '第二回　古 · 上联上联上联上　下联下联下联下');
  assert.equal(all[2].title.zh, '今 · 一　今1的一句话');
  assert.equal(all[2].title.en, 'Now · 1 · Now 1');
  assert.equal(all[0].title.en, 'Chapter 1 · Then · A / B');
  // Reordering is an edit of the order only: the same ids, new labels.
  const moved = bookEntries(two([J('j01', 1), G('h01', 1), G('h02', 2)]));
  assert.deepEqual(moved.map((h) => `${h.label.zh}${h.id}`), ['今 · 一j01', '第一回h01', '第二回h02']);
  // A 回 with no `line` (the book before 2026-10-01) is 古.
  assert.equal(bookEntries(two([{ id: 'h01', n: 1, huimu: { zh: ['甲', '乙'] }, file: 'x.md' }]))[0].tag.zh, '古');
});

test('drafts are hidden by default; the published view shows no gap; ?draft=1 numbers them in place', () => {
  const b = two([G('h01', 1, { draft: true }), G('h02', 2), J('j01', 1, { draft: true }), G('h03', 3), J('j02', 2)]);
  const pub = bookEntries(b);
  assert.deepEqual(pub.map((h) => h.id), ['h02', 'h03', 'j02']);
  assert.deepEqual(pub.map((h) => h.label.zh), ['第一回', '第二回', '今 · 一'], 'no gap, no dangling 第二回');
  const dr = bookEntries(b, { draft: true });
  assert.deepEqual(dr.map((h) => `${h.label.zh}${h.id}`), ['第一回h01', '第二回h02', '今 · 一j01', '第三回h03', '今 · 二j02']);
  assert.equal(entryById(b, 'j01'), null, 'a draft id names nothing in the published view');
  assert.equal(entryById(b, 'j01', { draft: true }).label.zh, '今 · 一');
  // The 草稿 tag shows in the draft view only; a published 回 never carries it. An interlude carries no 今 tag: 「今 · 一」 says it.
  assert.equal(huimuHtml(dr[2]), '<h1 class="huimu jin"><span class="hui">今 · 一<span class="tag draft">草稿</span></span><span class="line">今1的一句话</span></h1>');
  assert.match(huimuHtml(dr[0]), /^<h1 class="huimu gu"><span class="hui">第一回<span class="tag">古<\/span><span class="tag draft">草稿<\/span><\/span>/);
  assert.equal(huimuHtml(pub[2]), '<h1 class="huimu jin"><span class="hui">今 · 一</span><span class="line">今2的一句话</span></h1>');
  // The real book, whatever it holds back: the draft view is the published view plus exactly its drafts.
  const drafted = bookEntries(book, { draft: true }).filter((c) => c.huimu);
  assert.equal(drafted.length, hui.length + raw.filter((h) => h.draft).length);
  assert.deepEqual(drafted.filter((h) => !h.draft).map((h) => h.id), hui.map((h) => h.id));
});

test('old links still resolve to the same chapter, in either view', () => {
  for (const view of [{}, { draft: true }]) {
    assert.deepEqual(['00', '01', '02', '03', 'h01', 'h03', 'h05', 'h06', 'h10', 'j03'].map((id) => entryById(book, id, view)?.id),
      ['h01', 'h02', 'h05', 'h09', 'h01', 'h02', 'h05', 'h05', 'h10', 'j01']);
  }
  const b = two([G('h01', 1, { absorbs: ['h00'] }), J('j01', 1, { absorbs: ['j02'] })], { '00': 'h01' });
  assert.equal(entryById(b, '00').id, 'h01');
  assert.equal(entryById(b, 'h00').label.zh, '第一回', 'a folded id opens its absorber under its number');
  assert.equal(entryById(b, 'j02').label.zh, '今 · 一');
});

test('the page sets a 回 title from book.json, not from the file\'s own number', () => {
  const [, h01] = bookEntries(two([J('j01', 1), G('h01', 1)]));
  const html = renderMarkdown('# 第三回　上联上联上联上　下联下联下联下\n\n甲。', { hui: h01 });
  assert.equal(html.split('\n')[0], '<h1 class="huimu gu"><span class="hui">第一回<span class="tag">古</span></span><span class="line">上联上联上联上</span><span class="line">下联下联下联下</span></h1>');
  const js = fs.readFileSync(path.join(ROOT, 'scripts/read.js'), 'utf8');
  assert.match(js, /hui: ch\.huimu \? ch : null/);
  assert.match(js, /absorbs: ch\.absorbs/, 'a card whose first appearance names a folded 回 stands in its absorber');
  assert.match(js, /const view = \{ draft: params\.get\('draft'\) === '1' \};/);
  // A file in a folder (今线/…) is fetched by its path, each part encoded.
  assert.match(js, /ch\.file\.split\('\/'\)\.map\(encodeURIComponent\)\.join\('\/'\)/);
  const css = fs.readFileSync(path.join(ROOT, 'scripts/read.css'), 'utf8');
  assert.match(css, /\.jin \.tag \{ color: var\(--jin\); \}/);
  assert.match(css, /\.chapter h1\.huimu\.jin \.hui \{ color: var\(--jin\); \}|h1\.huimu\.jin \.hui \{ color: var\(--jin\); \}/);
});
