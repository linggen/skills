// The book reads with the player's name: chapters write `{name}`, the reader
// fills it from Look before rendering, and a page with no save reads 周星星.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillHero, heroOf, HERO, renderMarkdown } from '../scripts/read-md.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK = path.join(ROOT, 'story/huxian-bing');

test('fillHero puts the player\'s name where {name} stands, 周星星 without one', () => {
  assert.equal(fillHero('**我**：{name}。\n\n**——{name}**', { name: '秋白' }), '**我**：秋白。\n\n**——秋白**');
  assert.equal(fillHero('我叫{name}。', {}), `我叫${HERO}。`);
  assert.equal(fillHero('我叫{name}。'), '我叫周星星。');
});

test('heroOf reads Look\'s name; no save, no name or a blank one is the drafts\' hero', () => {
  assert.deepEqual(heroOf({ ok: true, name: '秋白', gender: 'female' }), { name: '秋白' });
  for (const seen of [null, undefined, {}, { name: null }, { name: '  ' }, { ok: false, refused: 'x' }]) assert.deepEqual(heroOf(seen), { name: HERO });
});

test('a name is a word, never markup: escaped, and no bold or table split', () => {
  const html = renderMarkdown(fillHero('**{name}**：你好\n\n| a | b |\n|---|---|\n| {name} | 1 |', { name: '<b>*甲|乙*' }));
  assert.match(html, /<b>&lt;b&gt;＊甲｜乙＊<\/b>/);
  assert.match(html, /<td>&lt;b&gt;＊甲｜乙＊<\/td><td>1<\/td>/);
});

test('the chapters name the hero only as {name}: no 周星星 left, every token filled', () => {
  const book = JSON.parse(fs.readFileSync(path.join(BOOK, 'book.json'), 'utf8'));
  let names = 0;
  for (const ch of book.chapters) {
    const md = fs.readFileSync(path.join(BOOK, ch.file), 'utf8');
    assert.doesNotMatch(md, /周星星|——星星/, `${ch.file}: the hero is {name}`);
    names += (md.match(/\{name\}/g) ?? []).length;
    assert.doesNotMatch(fillHero(md, { name: '秋白' }), /\{name\}/, ch.file);
  }
  assert.ok(names >= 15, `the hero is named ${names} times`);
});
