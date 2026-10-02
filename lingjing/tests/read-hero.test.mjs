// The hero is fixed since 2026-09-30 (沈小满, male; 阿禾 a girl) and all ten 古 回
// are in the third person. The reader still knows how to fill `{name}` /
// `{男词|女词}` (legacy saves, other books); a page with no hero handed reads 沈小满.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, fillHero, genderBlocks, genderWords, heroOf, HERO, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/jiuding-lu');

test('fillHero puts the name where {name} stands, 沈小满 without one', () => {
  assert.equal(fillHero('**我**：{name}。\n\n**——{name}**', { name: '秋白' }), '**我**：秋白。\n\n**——秋白**');
  assert.equal(fillHero('我叫{name}。', {}), `我叫${HERO}。`);
  assert.equal(fillHero('我叫{name}。'), '我叫沈小满。');
  assert.equal(HERO, '沈小满');
});

test('heroOf reads Look\'s name and gender; no save, no name or no gender is the drafts\' hero', () => {
  assert.deepEqual(heroOf({ ok: true, name: '秋白', gender: 'female' }), { name: '秋白', gender: 'female' });
  assert.deepEqual(heroOf({ ok: true, name: '秋白', gender: 'male' }), { name: '秋白', gender: 'male' });
  assert.deepEqual(heroOf({ ok: true, name: '秋白', gender: 'none' }), { name: '秋白', gender: 'male' });
  for (const seen of [null, undefined, {}, { name: null }, { name: '  ' }, { ok: false, refused: 'x' }]) assert.deepEqual(heroOf(seen), { name: HERO, gender: 'male' });
});

test('{男|女} takes the hero\'s word; unset is male; markdown and escaping stay whole', () => {
  const md = '**我**：猎户家的{独子|独女}。\n\n阿禾把{她|他}的本子合上。\n\n| a | b |\n|---|---|\n| {他|她} | {} |';
  assert.equal(genderWords(md, 'female'), '**我**：猎户家的独女。\n\n阿禾把他的本子合上。\n\n| a | b |\n|---|---|\n| 她 | {} |');
  assert.equal(genderWords(md, 'male'), genderWords(md, undefined));
  assert.match(genderWords(md), /独子.*她的本子/s);
  const html = renderMarkdown(fillHero('{**他**|**她**}说<好>。', { name: '秋白', gender: 'female' }));
  assert.equal(html, '<p><b>她</b>说&lt;好&gt;。</p>');
});

test('a writers\' note (<!-- -->) never reaches the page', () => {
  assert.equal(renderMarkdown('一段。\n\n<!-- 女主变体：\n两行 -->\n\n又一段。'), '<p>一段。</p>\n<p>又一段。</p>');
});

test('a name is a word, never markup: escaped, and no bold or table split', () => {
  const html = renderMarkdown(fillHero('**{name}**：你好\n\n| a | b |\n|---|---|\n| {name} | 1 |', { name: '<b>*甲|乙*' }));
  assert.match(html, /<b>&lt;b&gt;＊甲｜乙＊<\/b>/);
  assert.match(html, /<td>&lt;b&gt;＊甲｜乙＊<\/td><td>1<\/td>/);
});

const TOKENS = /\{name\}|\{[^{}|\n]*\|[^{}|\n]*\}|::: [男女]|女主变体/;
const published = () => bookEntries(JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'))).filter((c) => c.huimu);

test('the hero is 沈小满, fixed (his, 2026-09-30): all ten 古 回 in the third person, no player tokens', () => {
  const hui = published().filter((c) => c.line === 'gu');
  assert.ok(hui.length >= 8, 'the eight 古 回 of 卷一 (ten folded into eight, 2026-10-02)');
  for (const ch of hui) {
    const md = fs.readFileSync(path.join(BOOK, ch.file), 'utf8');
    assert.doesNotMatch(md, /周星星|——星星/, `${ch.file}: the placeholder name is gone`);
    assert.doesNotMatch(md, TOKENS, `${ch.file}: no {name} or gender marks`);
    assert.match(md, /沈小满/, `${ch.file}: names 沈小满`);
    const html = renderMarkdown(fillHero(md, {}));
    assert.doesNotMatch(html, /[{}]|&lt;!--|女主变体/, `${ch.file}: nothing left to fill, no note shown`);
  }
  const one = fs.readFileSync(path.join(BOOK, '01-第一回.md'), 'utf8');
  assert.match(one, /姓沈，名小满，这一年十二岁[\s\S]*猎户家的独子/);
  assert.match(one, /窗外站着隔壁的阿禾。她比小满小一岁/);
});

test('the 今 回\'s hero is 沈芒 (Hanli, 2026-10-01): third person, no player tokens', () => {
  for (const ch of published().filter((c) => c.line === 'jin')) {
    const md = fs.readFileSync(path.join(BOOK, ch.file), 'utf8');
    assert.doesNotMatch(md, TOKENS, `${ch.file}: no {name} or gender marks`);
    assert.match(md, /沈芒/, `${ch.file}: names 沈芒`);
    const html = renderMarkdown(fillHero(md, {}));
    assert.doesNotMatch(html, /[{}]|&lt;!--/, `${ch.file}: nothing left to fill, no note shown`);
  }
});

test('::: 男 / ::: 女 blocks: the hero\'s stays, the other goes, fences never show', () => {
  const md = '前。\n\n::: 男\n他挨打。\n:::\n::: 女\n她进猪圈。\n:::\n\n后。';
  assert.equal(genderBlocks(md, 'male'), '前。\n\n他挨打。\n\n后。');
  assert.equal(genderBlocks(md, undefined), genderBlocks(md, 'male'));
  assert.equal(genderBlocks(md, 'female'), '前。\n\n她进猪圈。\n\n后。');
  // A lone 女 block vanishes for a male hero; CRLF fences work too.
  assert.equal(genderBlocks('甲。\r\n::: 女\r\n掌柜说话。\r\n:::\r\n乙。', 'male'), '甲。\r\n乙。');
  assert.equal(renderMarkdown(fillHero('::: 女\n**掌柜**：{小子|姑娘}。\n:::', { gender: 'female' })), '<p><b>掌柜</b>：姑娘。</p>');
  assert.equal(renderMarkdown(fillHero('::: 女\n**掌柜**：姑娘。\n:::', { gender: 'male' })), '');
});

test('variant blocks leave ::: 忆 plates alone, inside or outside a block', () => {
  const md = '::: 忆 1 柴房\n::: 女\n::: 忆 2 猪圈\n:::\n尾。';
  assert.equal(genderBlocks(md, 'female'), '::: 忆 1 柴房\n::: 忆 2 猪圈\n尾。');
  assert.equal(genderBlocks(md, 'male'), '::: 忆 1 柴房\n尾。');
  const html = renderMarkdown(fillHero(md, { gender: 'female' }), { memory: (n) => `m${n}.png` });
  assert.match(html, /m1\.png[\s\S]*m2\.png/);
});

test('the kept readings (柴房 — 第五回 since 古六 folded into it — and 第十回 the drummer) are the only ones left', () => {
  const read = (f) => renderMarkdown(fillHero(fs.readFileSync(path.join(BOOK, f), 'utf8'), {}));
  const six = read('05-第五回.md');
  assert.match(six, /蹲下身去，两只胳膊抱住了头/);
  assert.doesNotMatch(six, /猪圈/);
  const ten = read('10-第十回.md');
  assert.match(ten, /打鼓的那个，便是沈小满。/);
  assert.doesNotMatch(ten, /你长得像交不起河伯钱的/);
  assert.match(ten, /「扑通」一声/);
});

test('the placeholder 周星星 is gone from the game and the book (only history may name it)', () => {
  const seen = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['archive', 'node_modules', 'vendor'].includes(e.name)) walk(p); continue; }
      if (!/\.(m?js|json|md|html|css)$/.test(e.name) || p.endsWith('OUTLINE.md') || p.endsWith('read-hero.test.mjs')) continue;
      if (fs.readFileSync(p, 'utf8').includes('周星星')) seen.push(path.relative(ROOT, p));
    }
  };
  for (const d of ['scripts', 'worlds', 'guide', 'story', 'tests']) walk(path.join(ROOT, d));
  assert.deepEqual(seen, []);
});
