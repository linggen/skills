// 初见 (Hanli, 2026-10-05: 「中间放大显示人物，只在第一次出场的时候就可以，之后不用放大了」):
// a person or a foe the scene brings on for the first time stands large on the
// stage at the beat that first has him — he speaks, or the narration names him —
// and never again. Who is new is read off the save (rules/codex.mjs newHere), so
// an old save never meets again whom it met. Also: the speaker's name over his
// line, the top strip as one line, the chat folding away (the viewer's, and the
// page's own for a game).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { meetsOf, newHere } from '../scripts/rules/codex.mjs';
import { storyHtml, sightings, sightNow, advance, withTold } from '../scripts/dialogue.js';
import { PHONE_QUERY, SIGHT_KINDS, chatHeard, chatHidden, setAutoFold, sightHtml } from '../scripts/sight.js';
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
  // 狰 is the book's to bring on, in the rest of the passage after the board (tests/meet-waits-book.test.mjs).
  assert.ok(!meetsOf(content, s, scene('wm-yaoyuan')).includes('zheng'), 'not before the book reveals it');
  assert.ok(meetsOf(content, { ...s, done_scenes: ['wm-yaoyuan'] }, scene('wm-yaoyuan')).includes('zheng'));
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

test('the speaker\'s name leads his line on the stage; narration has none', () => {
  const spoken = storyHtml(read([{ who: 'qulao', name: '瞿老', text: '来了？' }]));
  assert.match(spoken, /<p class="line spoken"><b class="who">瞿老<\/b><span class="s">来了？<\/span><\/p>/);
  assert.match(storyHtml(read([{ text: '风大。' }])), /<p class="line told"><span class="s">风大。<\/span><\/p>/);
  assert.doesNotMatch(storyHtml(read([{ text: '风大。' }])), /class="who"/);
});

test('the page: the sight on the stage, no first-meet card for a face it showed, one top line with the faces, the chat folds', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../scripts/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  const story = fs.readFileSync(new URL('../scripts/story.css', import.meta.url), 'utf8');
  assert.match(src, /const sighted = sightings\(readingHere\(\), firstFaces\(\), lang\(\)\);\n {2}cards = cards\.filter\(\(c\) => c\.card !== 'meet' \|\| !sighted\.has\(c\.id\)\);/);
  assert.match(src, /paintSight\(\$\('sight'\), !box\.includes\('data-dlg-on'\) \? \[\] : readingHere\(\)\?\.all\?\.whole \? pageFaces\(\) : sightNow\(readingHere\(\), firstFaces\(\), lang\(\)\)/, '快: the 亮相 of a face whose entrance is on the page on show, large above the band (pager.js)');
  assert.match(src, /const firstFaces = \(\) => noted\(readingHere\(\), lang\(\)\)/, 'only the faces the book marks in the reading — no name in code');
  assert.match(html, /<div class="sight" id="sight"><\/div>\s*(<!--[\s\S]*?-->\s*)?<div class="dlgwrap" id="dlg"><\/div>/);
  assert.match(html, /<header class="topbar"><div class="status" id="status"><\/div><div class="titlerow">/);
  assert.match(src, /mountChatToggle\(document\.querySelector\('\.shell'\), lang\);/);
  assert.match(css, /\.shell\.chatfolded \{ grid-template-columns: minmax\(0, 1fr\) 0; \}/);
  // 亮相 (proto c): on the stage's right, his name upright; at the next beat into his face in the header bar.
  assert.match(story, /\.sightcard \{ position: absolute; right: 9%; left: 4%; top: 6%; bottom: 30%;/);
  assert.match(story, /\.sightone figcaption b \{ display: block; font-size: 30px; letter-spacing: \.18em; writing-mode: vertical-rl;/);
  assert.match(html, /<div class="headcards" id="headCards"><\/div><\/header>/, 'the faces he flies to are the top bar\'s');
  // Games, the map and a fight fold the chat; the page's fold keeps nothing of the viewer's.
  assert.match(src, /setAutoFold\(document\.querySelector\('\.shell'\), wide\);/);
  const cls = new Set();
  const shell = { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), remove: (c) => cls.delete(c) } };
  setAutoFold(shell, true);
  assert.ok(cls.has('autofold'));
  setAutoFold(shell, false);
  assert.ok(!cls.has('autofold'));
  assert.match(story, /\.shell\.autofold:not\(\.autoopen\) #chat-panel \{ display: none; \}/);
  // The test badge: small, a tab hanging from the top edge, taking no tap — never over the strip's controls, the footer, 跳过 or a pager's ›.
  assert.match(src, /class="scratch-badge"[^`]*style="position:fixed;top:0;left:8px;[^"]*pointer-events:none"/, 'the test badge never over the top strip or the footer');
  // 2026-10-16: at the top right the badge and the 游戏厅 chip under it covered 中/En at 1440 — both on the top-left row now
  const arcade = fs.readFileSync(new URL('../scripts/dev-arcade.js', import.meta.url), 'utf8');
  assert.match(arcade, /\.dev-arcade\{position:fixed;top:0;left:8px;/);
  assert.match(arcade, /\.scratch-badge~\.dev-arcade\{top:0;left:var\(--after-badge,8px\)\}/, 'beside the badge, never under it');
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

test('the phone (2026-10-15): the stage takes the screen — the chat a bottom sheet behind a slim bar, a dot for what was written unseen', () => {
  const phone = fs.readFileSync(new URL('../scripts/phone.css', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../scripts/index.html', import.meta.url), 'utf8');
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  // One query, the page's and the sheet's: narrow, or short in the stacked layout. Wide screens read none of it.
  assert.ok(phone.includes(`@media ${PHONE_QUERY} {`), 'phone.css and sight.js PHONE_QUERY agree');
  assert.match(html, /<link rel="stylesheet" href="games\/live\.css" \/>[\s\S]*<link rel="stylesheet" href="phone\.css" \/>\s*<\/head>/, 'loaded last, over the rest');
  assert.match(phone, /^\.chattoggle \.barword, \.chattoggle \.unread, \.chatscrim \{ display: none; \}/m, 'off the phone, the bar\'s words and dot never show');
  // The sheet is never display:none (the chat's frame keeps its size), and opens over every fold.
  assert.match(phone, /transform: translateY\(100%\); visibility: hidden;/);
  assert.match(phone, /\.shell\.chatsheet:is\(\*, \.autofold:not\(\.autoopen\)\) #chat-panel \{ transform: none; visibility: visible;/);
  assert.match(phone, /\.shell\.chatsheet \.chatscrim \{ opacity: 1; pointer-events: auto; \}/, 'a tap outside closes it');
  assert.match(phone, /\.shell\.chatunread \.chattoggle \.unread \{ display: block;/);
  // Popovers as bottom sheets; 亮相 ends where the words begin; boards fit the height.
  assert.match(phone, /\.slotfoot \.bookpop, [^{]*\{\s*position: fixed; top: auto; left: 0; right: 0; bottom: calc\(var\(--chatbar-h\) \+ 46px\);/);
  assert.match(phone, /bottom: max\(42%, calc\(100% - var\(--words-top, 58%\) \+ 10px\)\)/);
  assert.match(phone, /\.g-luoshu-board \{ max-width: min\(340px, calc\(100dvh - 460px\)\); \}/);
  // Ling or 银月 wrote: the dot, only while the chat is out of sight.
  assert.match(src, /onStreamEnd: \(_text, info\) => \{\n\s*\/\/[^\n]*\n\s*chatHeard\(document\.querySelector\('\.shell'\)\);/);
  const shellOf = (...on) => { const cls = new Set(on); return { cls, classList: { contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c) } }; };
  assert.equal(chatHidden(shellOf(), true), true, 'a phone opens with the sheet shut');
  assert.equal(chatHidden(shellOf('chatsheet'), true), false);
  assert.equal(chatHidden(shellOf(), false), false, 'wide: the chat stands beside the stage');
  assert.equal(chatHidden(shellOf('autofold'), false), true);
  assert.equal(chatHidden(shellOf('autofold', 'autoopen'), false), false);
  const open = shellOf();
  chatHeard(open); // no matchMedia in node: the wide page, chat in sight
  assert.ok(!open.cls.has('chatunread'));
  const folded = shellOf('chatfolded');
  chatHeard(folded);
  assert.ok(folded.cls.has('chatunread'));
});


// Live 2026-10-15 at 390×844: the folded chat sheet (a scratch save's transcript) caught the stage's taps.
test('phone: the folded chat sheet takes no tap; the open one does', () => {
  const phone = fs.readFileSync(new URL('../scripts/phone.css', import.meta.url), 'utf8');
  const folded = phone.slice(phone.indexOf('.shell #chat-panel, .shell.chatfolded #chat-panel'), phone.indexOf('}', phone.indexOf('.shell #chat-panel, .shell.chatfolded #chat-panel')));
  assert.match(folded, /pointer-events: none/);
  assert.match(phone, /\.shell\.chatsheet:is\(\*, \.autofold:not\(\.autoopen\)\) #chat-panel \{[^}]*pointer-events: auto/);
});
