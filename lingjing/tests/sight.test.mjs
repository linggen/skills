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

const content = loadContent();
const NOW = new Date('2026-10-05T12:00:00');
const scene = (id) => Object.values(content.chapters).map((ch) => ch.scenes?.[id]).find(Boolean);
const read = (beats) => withTold(null, [{ of: 'scene', id: 'x', beats }], 'x');

const qu = { id: 'qulao', kind: '人物', name: '瞿老', lines: ['扫地的老人。'] };
const ma = { id: 'maxiaobao', kind: '人物', name: '马小宝', lines: [] };

test('his first beat: the narration names him, or he speaks — never a later one, never a recap', () => {
  const r = read([{ text: '山门前，风大。' }, { text: '「前情」瞿老', recap: true }, { text: '台阶上坐着瞿老。' }, { who: 'qulao', name: '瞿老', text: '来了？' }, { who: 'maxiaobao', name: '马小宝', text: '哼。' }]);
  const at = sightings(r, [qu, ma]);
  assert.equal(at.get('qulao'), 2, 'the narration that names him, not the recap before it');
  assert.equal(at.get('maxiaobao'), 4, 'he speaks');
  let x = r;
  const seen = [];
  for (let k = 0; k < 5; k += 1) { seen.push(sightNow(x, [qu, ma]).map((e) => e.id).join()); x = advance(x); }
  assert.deepEqual(seen, ['', '', 'qulao', '', 'maxiaobao'], 'large once, at that beat only');
  assert.deepEqual(sightNow(advance(advance(advance(advance(advance(r))))), [qu, ma]), [], 'the box put away: nothing');
  // English names are matched without case
  const en = read([{ text: 'Elder qu sweeps the steps.' }]);
  assert.equal(sightings(en, [{ ...qu, name: 'Elder Qu' }], 'en').get('qulao'), 0);
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
  assert.match(spoken, /<div class="dlgname">瞿老<\/div><div class="dlgbody"><div class="dlgtext">来了？/);
  assert.doesNotMatch(dialogHtml(read([{ text: '风大。' }])), /dlgname/);
});

test('the page: the sight over the box, no first-meet card for a face it showed, one top line, the chat folds', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../scripts/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  assert.match(src, /const sighted = sightings\(readingHere\(\), firstFaces\(\), lang\(\)\);\n {2}cards = cards\.filter\(\(c\) => c\.card !== 'meet' \|\| !sighted\.has\(c\.id\)\);/);
  assert.match(src, /paintSight\(\$\('sight'\), box\.includes\('data-dlg-next'\) \? sightNow\(readingHere\(\), firstFaces\(\), lang\(\)\) : \[\]/);
  assert.match(src, /const firstFaces = \(\) => \(look\?\.scene\?\.meet \?\? \[\]\)/, 'only whom Look says is new here — no name in code');
  assert.match(html, /<div class="sight" id="sight"><\/div>\s*(<!--[\s\S]*?-->\s*)?<div class="dlgwrap" id="dlg"><\/div>/);
  assert.match(html, /<header class="topbar"><div class="status" id="status"><\/div><div class="titlerow">/);
  assert.match(src, /mountChatToggle\(document\.querySelector\('\.shell'\), lang\);/);
  assert.match(css, /\.shell\.chatfolded \{ grid-template-columns: minmax\(0, 1fr\) 0; \}/);
  assert.match(css, /\.view:has\(\.sight \.sightcard:not\(\.going\)\) \.dlgface \{ display: none; \}/, 'the large picture up: no small one of him in the box');
  assert.match(src, /class="scratch-badge"[^`]*style="position:fixed;bottom:6px;right:8px;/, 'the test badge never over the top strip');
});
