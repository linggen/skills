// 初见 (Hanli, 2026-10-05: 「中间放大显示人物，只在第一次出场的时候就可以，之后不用放大了」):
// a person or a foe the scene brings on for the first time stands large on the
// stage at the beat that first has him — he speaks, or the narration names him —
// and never again. Who is new is read off the save (rules/codex.mjs newHere), so
// an old save never meets again whom it met. Also: the box's name plate, the top
// strip as one line, the chat folding away.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { meetsOf, newHere } from '../scripts/rules/codex.mjs';
import { dialogHtml, sightings, sightNow, advance, withTold } from '../scripts/dialogue.js';
import { SIGHT_KINDS, sightHtml } from '../scripts/sight.js';
import { codexCompactHtml } from '../scripts/codex.js';

const content = loadContent();
const NOW = new Date('2026-10-05T12:00:00');
const scene = (id) => Object.values(content.chapters).map((ch) => ch.scenes?.[id]).find(Boolean);
const read = (beats) => withTold(null, [{ of: 'scene', id: 'x', beats }], 'x');

const qu = { id: 'qulao', kind: '人物', name: '瞿老', lines: ['扫地的老人。'] };
const ma = { id: 'maxiaobao', kind: '人物', name: '马小宝', lines: [] };

test('his 亮相 beat: the paragraph the book marks {注=id} — never a mention before it, a line he speaks, a recap', () => {
  const r = read([{ text: '山门前，风大。' }, { text: '「前情」瞿老', recap: true, notes: ['qulao'] }, { text: '台阶上坐着瞿老。' }, { text: '那扫地的老头，是瞿老。', notes: ['qulao'] }, { who: 'maxiaobao', name: '马小宝', text: '哼。' }, { text: '这人叫马小宝。', notes: ['maxiaobao'] }]);
  const at = sightings(r, [qu, ma]);
  assert.equal(at.get('qulao'), 3, 'the marked paragraph, not the recap nor the mention before it');
  assert.equal(at.get('maxiaobao'), 5, 'not the line he speaks first: the paragraph that brings him on');
  let x = r;
  const seen = [];
  for (let k = 0; k < 6; k += 1) { seen.push(sightNow(x, [qu, ma]).map((e) => e.id).join()); x = advance(x); }
  assert.deepEqual(seen, ['', '', '', 'qulao', '', 'maxiaobao'], 'large once, at that beat only');
  assert.deepEqual(sightNow(x, [qu, ma]), [], 'the box put away: nothing');
  assert.equal(sightings(read([{ text: 'Elder Qu sweeps the steps.' }]), [{ ...qu, name: 'Elder Qu' }], 'en').size, 0, 'a name alone brings no one on');
});

test('who comes on: the scene\'s people, its cast, its fights\' foes (a foe that is a person is that person) — never her', () => {
  const s = newState(content, 'zh', NOW);
  assert.ok(meetsOf(content, s, scene('wm-wangzuo')).includes('gui'), 'the 秘境\'s 蛫');
  assert.ok(meetsOf(content, s, scene('wm-yaoyuan')).includes('zheng'));
  const dabi = meetsOf(content, s, scene('wm-juesai'));
  assert.ok(dabi.includes('maxiaobao') && !dabi.includes('foe-maxiaobao'), 'the 大比\'s 马小宝 is the 马小宝 already met');
  assert.ok(meetsOf(content, s, scene('00-longzhi')).includes('longzhi'));
});

test('an old save meets no one again: who a scene done brought on is not new', () => {
  const s = newState(content, 'zh', NOW);
  assert.ok(newHere(content, s, scene('00-gate')).includes('qulao'), 'a fresh save meets 瞿老 at the gate');
  const old = { ...s, done_scenes: [...(s.done_scenes ?? []), '00-gate'] };
  assert.ok(!newHere(content, old, scene('00-luoshu')).includes('qulao'), 'met at the gate: not large again');
  assert.deepEqual(newHere(content, old, scene('00-gate')), [], 'a scene done brings no one new');
});

test('the large card: his picture or a name card, his name and one line; a tap goes on; only people and creatures', () => {
  const html = sightHtml([{ ...qu, image: 'art/people/qulao.webp' }], { src: (f) => `/w/${f}` });
  assert.match(html, /class="sightcard" data-dlg-next data-sight="qulao"/);
  assert.match(html, /<img class="sightpic" src="\/w\/art\/people\/qulao.webp"/);
  assert.match(html, /<b>瞿老<\/b><span class="sightline">扫地的老人。<\/span>/);
  assert.match(sightHtml([ma]), /class="sightpic namecard"[^>]*><b>马小宝<\/b>/, 'no picture: a name card');
  assert.deepEqual([...SIGHT_KINDS], ['人物', '生物']);
});

test('the name plate hangs on the box (outside its text); narration hangs none', () => {
  const spoken = dialogHtml(read([{ who: 'qulao', name: '瞿老', text: '来了？' }]));
  assert.match(spoken, /<div class="dlgname">瞿老<\/div><div class="dlghead">[\s\S]*<div class="dlgbody"><div class="dlgtext">来了？/);
  assert.doesNotMatch(dialogHtml(read([{ text: '风大。' }])), /dlgname/);
});

test('the page: the sight over the box, no first-meet card for a face it showed, one top line, the chat folds', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../scripts/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  assert.match(src, /const sighted = sightings\(readingHere\(\), firstFaces\(\), lang\(\)\);\n {2}cards = cards\.filter\(\(c\) => c\.card !== 'meet' \|\| !sighted\.has\(c\.id\)\);/);
  assert.match(src, /paintSight\(\$\('sight'\), box\.includes\('data-dlg-on'\) \? sightNow\(readingHere\(\), firstFaces\(\), lang\(\)\) : \[\]/);
  assert.match(src, /const firstFaces = \(\) => noted\(readingHere\(\), lang\(\)\)/, 'only the faces the book marks in the reading — no name in code');
  assert.match(html, /<div class="sight" id="sight"><\/div>\s*(<!--[\s\S]*?-->\s*)?<div class="dlgwrap" id="dlg"><\/div>/);
  assert.match(html, /<header class="topbar"><div class="status" id="status"><\/div><div class="titlerow">/);
  assert.match(src, /mountChatToggle\(document\.querySelector\('\.shell'\), lang\);/);
  assert.match(css, /\.shell\.chatfolded \{ grid-template-columns: minmax\(0, 1fr\) 0; \}/);
  assert.match(css, /\.view:has\(\.sight \.sightcard:not\(\.going\)\) \.dlgface \{ display: none; \}/, 'the large picture up: no small one of him in the box');
  assert.match(src, /class="scratch-badge"[^`]*style="position:fixed;bottom:6px;right:8px;/, 'the test badge never over the top strip');
});

test('a thing\'s first card is big enough to read: its picture large, every line whole (2026-10-14: 狐纹木牌); a face\'s stays a row', () => {
  const token = { id: 'fox-token', kind: '物品', name: '狐纹木牌', image: 'art/items/fox-token.webp', lines: ['吴婆婆塞给沈小满的小木牌，磨得发亮；刻着一只九尾狐。', '第二行。'] };
  const html = codexCompactHtml(token);
  assert.match(html, /class="codexcompact big"/);
  assert.match(html, /<span>吴婆婆塞给沈小满的小木牌，磨得发亮；刻着一只九尾狐。<\/span><span>第二行。<\/span>/, 'every line, whole');
  assert.match(html, /data-codex-big="fox-token"/, 'a tap still opens it full size');
  assert.doesNotMatch(codexCompactHtml(qu), /codexcompact big/, 'a person comes on large over the box instead (初见)');
  const css = fs.readFileSync(new URL('../scripts/codex.css', import.meta.url), 'utf8');
  assert.match(css, /\.codexcompact\.big \.cpic \{ width: 176px; height: 176px; \}/);
  assert.match(css, /\.codexcompact\.big \.ccap \{ white-space: normal;/);
});
