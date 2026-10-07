// 附 · 本回典籍 (DESIGN.md § 六·五·一): a classic the 回 names is written
// `《书名》{典=id}`; the reader underlines it like a figure, links it to its entry
// at the chapter's end, and the entry links back. The entries live in one file
// per book (story/<book>/classics.json), each passage copied from a real
// edition with its URL — none written from memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, classicAnchor, fillHero, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/jiuding-lu');
const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
const ALL = JSON.parse(fs.readFileSync(path.join(BOOK, 'classics.json'), 'utf8'));
const CLASSICS = ALL.classics;
const chapters = bookEntries(book).map((c) => ({ ...c, md: fs.readFileSync(path.join(BOOK, c.file), 'utf8') }));
const REF = /(?:《([^》\n]+)》|\[([^\]\n]+)\])\{典=([^{}\n]+)\}/g;
// The renderer's fixture: 神农 (古六 told it in a sentence since 2026-10-01, so it waits in _pending; either shelf serves).
const one = { shennong: CLASSICS.shennong ?? ALL._pending.shennong };

test('《书名》{典=id} links to its entry at the chapter\'s end, and the entry links back', () => {
  const html = renderMarkdown('## 六·五 · 九转\n\n**褚先生**：《神农本草经》{典=shennong}。\n\n又念一遍《神农本草经》{典=shennong}。', { classics: one });
  assert.match(html, /<a class="gloss dianref" href="#dian-shennong" id="dian-shennong-1" data-dian-jump="dian-shennong">《神农本草经》<\/a>/);
  assert.match(html, /id="dian-shennong-2"/, 'each mention its own anchor');
  assert.match(html, /<section class="dian" aria-label="附 · 本回典籍"><h2>附 · 本回典籍<\/h2><article class="dianent" id="dian-shennong">/);
  assert.equal((html.match(/class="dianent"/g) ?? []).length, 1, 'one entry however often it is named');
  assert.match(html, /<a href="#dian-shennong-1" data-dian-jump="dian-shennong-1">↑ 六·五 · 九转 · 第1处<\/a>/, 'back to the spot, named by its section and, named twice, its place');
  assert.match(html, /href="#dian-shennong-2"/);
  assert.ok(html.includes(one.shennong.original), 'the passage, in the edition\'s own text');
  assert.ok(!html.includes('简体') && html.includes('白话'), 'no 简体 line (his, 2026-09-29); the 白话 stays');
  assert.ok(html.includes(`href="${one.shennong.source.url}"`), 'the source it was copied from');
  assert.ok(html.indexOf('附 · 本回典籍') > html.indexOf('又念一遍'), 'inline, at the end');
  assert.equal(classicAnchor('x'), 'dian-x');
  assert.equal(classicAnchor('x', 2), 'dian-x-2');
});

test('an unknown id, no classics at all, or a heading: the 《书名》 alone, and no appendix', () => {
  for (const opts of [{}, { classics: {} }, { classics: one }]) {
    const html = renderMarkdown('他说《不存在的书》{典=nope}。', opts);
    assert.equal(html, '<p>他说《不存在的书》。</p>');
  }
  assert.equal(renderMarkdown('《神农本草经》{典=shennong}', {}), '<p>《神农本草经》</p>');
  assert.equal(renderMarkdown('# 《神农本草经》{典=shennong}', { classics: one }), '<h1>《神农本草经》</h1>');
  assert.equal(renderMarkdown('[x]{典=constructor}', { classics: one }), '<p>x</p>', 'a word-link to no entry reads as its words');
  assert.match(renderMarkdown('[河伯]{典=shennong}', { classics: one }), /data-dian-jump="dian-shennong">河伯<\/a>/, 'a word-link names no book');
  assert.equal(renderMarkdown('《a》{典=constructor}', { classics: one }), '<p>《a》</p>', 'no prototype key is an entry');
  assert.equal(renderMarkdown('《<i>》{典=shennong}', { classics: one }).includes('<i>'), false, 'the words are escaped');
});

test('every {典=id} in the book is an entry; every entry has a real source and a short passage', () => {
  const used = new Set();
  for (const c of chapters) for (const [, , , id] of c.md.matchAll(REF)) { used.add(id); assert.ok(Object.hasOwn(CLASSICS, id), `${c.file}: 典 ${id}`); }
  for (const [id, c] of Object.entries(CLASSICS)) {
    assert.ok(used.has(id), `${id} is named somewhere in the book`);
    assert.ok(c.title && c.about, `${id}: title and background`);
    // zh.wikipedia only for an excavated inscription no Wikisource/ctext page carries (行气铭; Hanli, 2026-10-01).
    const WIKIPEDIA_OK = new Set(['xingqi-ming']);
    const hosts = WIKIPEDIA_OK.has(id) ? /^https:\/\/zh\.wikipedia\.org\// : /^https:\/\/(zh\.wikisource\.org|ctext\.org)\//;
    assert.match(c.source?.url ?? '', hosts, `${id}: a Wikisource or ctext URL`);
    assert.ok(c.source.edition && c.source.section && c.source.license, `${id}: edition, section, license`);
    assert.ok(c.original && [...c.original].length <= 150, `${id}: the passage, ≤150 characters`);
    assert.ok(Array.isArray(c.plain) && c.plain.length >= 1 && c.plain.length <= 2, `${id}: one or two lines of 白话`);
  }
});

test('each 回 ends with its classics (卷一 in ten since 2026-09-30), and the made-up 《吐纳经》 is not one', () => {
  const at = (id) => chapters.find((c) => c.id === id);
  const entries = (id) => [...renderMarkdown(fillHero(at(id).md, {}), { classics: CLASSICS }).matchAll(/<article class="dianent" id="dian-([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(entries('h05'), ['liezi-yugong', 'zhonglv-sishi', 'zhuangzi-dasheng', 'baopu', 'shanhai-zheng']); // 古六 folded in (2026-10-02): its 抱朴子 「九转之丹」 told by 周衡 when he sets the month-end clock; // 真气 (素问) waits for 第九回; 守一's 用志不分 taught after the 小周天 (课随境界, 2026-09-30); 主典 钟吕「煉精生真氣」 = 练气一层, the rest withheld (Hanli 2026-10-01)
  assert.deepEqual(entries('h07'), ['jiuding', 'shanhai-gui', 'shangshu-hongfan', 'shanhai-xirang']); // 主典 洪范五句, 褚先生's 「背！」 on the notebook page, come alive in the 五行 turn (修仙词汇表 B, Hanli 2026-10-01) — moved out of the 困阵 to the third morning, and 鲧 told in the 柴房 that night (修改单-片三 7–8, 2026-10-02)
  assert.deepEqual(entries('h08'), ['laozi-qizhe', 'huangting-linggen']);
  assert.deepEqual(entries('h09'), ['laozi-zhirou', 'shanhai-qiuyu', 'zhuangzi-liezi', 'shanhai-lu', 'zhuangzi-wuhou', 'laozi-piaofeng', 'zhouyi-xun', 'wu-zhuji', 'shanhai-heyu', 'laozi-hebao', 'suwen', 'huangting']); // 2026-10-07 (Hanli, 古七 pass 2): one quoted classic per cliff lesson, each followed by a demonstration — 道德经四十三 (崖顶第一课, 巽为入), 庄子逍遥游 列子御风 (随风; why the 残本 ends at 结丹), 庄子养生主 以无厚入有间 (入隙, the 七层 stall), 道德经二十三 飘风 (定风 = waiting it out), 周易巽初六 爻辞 (进退, 八→九), 道德经六十四 九层之台 (the 八月 落叶); 禹步 paraphrased in 瞿老's mouth, no 典. The 执事堂 missions quote 《山海经》 for the 犰狳 (王家庄), the 鯥 (沂水东岸, 2026-10-07) and the 合窳 (黑松岭), in 阿禾's mouth // 主典 伍冲虚「築者……安神定息之處所也」 read by 褚先生 before his 盖房子, paid off when 神安息定 on the cliff // 恬惔虚无 moved from 第三回 to the eve of 筑基 (课随境界走, 2026-09-30) // 褚先生's 筑基 lecture moved off the cliff into the autumn 讲堂 (2026-09-30)
  assert.deepEqual(entries('h10'), ['neiguan-jing']); // 主典 内观经 十六字, 瞿老's parting lesson, at the bottom of the 漳水; 西门豹·冰夷 stay as story, untagged (修仙词汇表 B, Hanli 2026-10-01)
  // The 今 interludes (2026-10-02) keep every 典 of the 今 回 they fold in (Hanli: 「小课堂与典籍要保留」), each quote verbatim.
  assert.deepEqual(entries('j01'), ['baopu-zhili', 'lingshu-jingmai', 'yangxing-liuzi']); // 今01 气 · 今02 经脉 · 今03 吐纳 (主)
  assert.deepEqual(entries('j04'), ['baopu-huangbai', 'zhuangzi-yangshengzhu', 'shennong-renshen']); // 今04 灵根 · 今05 任督/刹车 (主) · 今06 外丹
  assert.deepEqual(entries('j07'), ['lingshu-jiuzhen', 'baopu-jiyan-shang']); // 今07 穴 · 今08 走火入魔 (主)
  assert.deepEqual(entries('j09'), ['yangxing-changxi', 'qijing-yinqiao']); // 今09 惧/长息 (主) · 今10 内感受
  const old = fs.readdirSync(path.join(BOOK, '今线/旧稿')).map((f) => fs.readFileSync(path.join(BOOK, '今线/旧稿', f), 'utf8')).join('\n');
  // 今线 quotes in 简体 (修改单-插曲 15, 2026-10-02): 旧稿 had two in 繁体, so compare with these few characters folded.
  const simp = (s) => s.replace(/[氣內觀]/g, (ch) => ({ 氣: '气', 內: '内', 觀: '观' })[ch]);
  const oldSimp = simp(old);
  for (const c of chapters.filter((x) => x.line === 'jin')) {
    for (const [whole] of c.md.matchAll(REF)) assert.ok(oldSimp.includes(simp(whole)), `${c.file}: ${whole} is quoted as the 今 回 it came from had it (今线/旧稿)`);
  }
  for (const c of chapters) assert.equal(/《吐纳经》\{典=/.test(c.md), false, `${c.file}: 《吐纳经》 is 银月's own, never a classic`);
  const html = renderMarkdown(fillHero(at('h05').md, {}), { classics: CLASSICS });
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ''), /\{典=/, 'no token shows');
});

test('with no subheadings, 「本回见」 names the 回 — 「第三回」, or 「第三回 · 第2处」 when named twice', () => {
  const md = '# 第三回　漏勺夜半通三关　五行台上夺头名\n\n《神农本草经》{典=shennong}。\n\n---\n\n又是《神农本草经》{典=shennong}。\n\n《抱朴子》{典=baopu}。';
  const html = renderMarkdown(md, { classics: { ...CLASSICS, ...one } });
  assert.match(html, /本回见：<a href="#dian-shennong-1" data-dian-jump="dian-shennong-1">↑ 第三回 · 第1处<\/a>　<a href="#dian-shennong-2" data-dian-jump="dian-shennong-2">↑ 第三回 · 第2处<\/a>/);
  assert.match(html, /<a href="#dian-baopu-1" data-dian-jump="dian-baopu-1">↑ 第三回<\/a>/);
  for (const c of chapters.filter((x) => x.huimu)) {
    // As the page renders it (read.js passes hui): 「本回见」 names the book's number, not the file's line ordinal.
    const out = renderMarkdown(fillHero(c.md, {}), { classics: CLASSICS, hui: c });
    for (const [, where] of out.matchAll(/data-dian-jump="dian-[\w-]+-\d+">↑ ([^<]+)</g)) assert.match(where, new RegExp(`^${c.label.zh}( · 第\\d+处)?$`), `${c.file}: ${where}`);
  }
});
