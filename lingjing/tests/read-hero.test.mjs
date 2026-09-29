// The book reads with the player in it: chapters write `{name}` and
// `{男词|女词}` (keyed on the hero; 阿禾, always the other gender, reads
// `{她|他}`), the reader fills both from Look before rendering, and a page
// with no save reads 周星星, male.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookEntries, fillHero, genderBlocks, genderWords, heroOf, HERO, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/huxian-bing');

test('fillHero puts the player\'s name where {name} stands, 周星星 without one', () => {
  assert.equal(fillHero('**我**：{name}。\n\n**——{name}**', { name: '秋白' }), '**我**：秋白。\n\n**——秋白**');
  assert.equal(fillHero('我叫{name}。', {}), `我叫${HERO}。`);
  assert.equal(fillHero('我叫{name}。'), '我叫周星星。');
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

test('the chapters name the hero only as {name}; every token fills for either hero', () => {
  const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
  let names = 0, words = 0;
  for (const ch of bookEntries(book).filter((c) => c.huimu)) {
    const md = fs.readFileSync(path.join(BOOK, ch.file), 'utf8');
    assert.doesNotMatch(md, /周星星|——星星/, `${ch.file}: the hero is {name}`);
    names += (md.match(/\{name\}/g) ?? []).length;
    words += (md.match(/\{[^{}|\n]*\|[^{}|\n]*\}/g) ?? []).length;
    for (const gender of ['male', 'female']) {
      const html = renderMarkdown(fillHero(md, { name: '秋白', gender }));
      assert.doesNotMatch(html, /[{}]|&lt;!--|女主变体/, `${ch.file} ${gender}: every token filled, no note shown`);
    }
  }
  assert.ok(names >= 15, `the hero is named ${names} times`);
  assert.ok(words >= 30, `${words} gendered words`);
  const her = renderMarkdown(fillHero(fs.readFileSync(path.join(BOOK, '01-第一回.md'), 'utf8'), { name: '秋白', gender: 'female' }));
  assert.match(her, /我叫秋白，今年十二岁[\s\S]*猎户家的独女/);
  assert.match(her, /窗外站着隔壁的阿禾。他比我小一岁/);
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

test('the girl-hero 回 (第三回, 第四回): both readings clean, each told its own way', () => {
  const read = (f, gender) => renderMarkdown(fillHero(fs.readFileSync(path.join(BOOK, f), 'utf8'), { name: '秋白', gender }));
  for (const f of ['03-第三回.md', '04-第四回.md']) {
    for (const gender of ['male', 'female']) assert.doesNotMatch(read(f, gender), /:::|[{}]|女主变体/, `${f} ${gender}`);
  }
  const [hm, hf] = ['male', 'female'].map((g) => read('03-第三回.md', g));
  assert.match(hm, /蹲下身去，抱住了头/);
  assert.doesNotMatch(hm, /猪圈/);
  assert.match(hf, /扔进了伙房后头的猪圈/);
  assert.doesNotMatch(hf, /抱住了头|肿成馒头/);
  assert.match(hf, /嘴里一股泥腥味/);
  const [rm, rf] = ['male', 'female'].map((g) => read('04-第四回.md', g));
  assert.match(rm, /打鼓的那个，便是我。/);
  assert.doesNotMatch(rm, /你长得像交不起河伯钱的|巫祝眯起眼睛/);
  assert.match(rf, /你长得像交不起河伯钱的/);
  assert.match(rf, /巫祝眯起眼睛，把我从头看到脚/);
  assert.doesNotMatch(rf, /打鼓的那个，便是我/);
  for (const html of [rm, rf]) assert.match(html, /「扑通」一声/);
});
