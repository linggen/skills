// The prologue as a 小人书 (Hanli, 2026-09-28: 「右边不要放小说内容, 右边尽量放图片,
// 战斗, 小游戏……像小人书。左边chat里放剧情。」): each beat a painted panel with a
// caption and its choices on the stage, and the source passage owed to Ling in
// the chat (rules/tell.mjs); 银月's words hers while she is present; the 恩仇簿;
// 《吐纳经》 read in the pouch; and the book itself, read in the game's frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORDS, cardHtml, ledgerChipHtml, readChipHtml } from '../scripts/cards.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, resolve } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { readingOf } from '../scripts/rules/scrolls.mjs';
import { stageOwns } from '../scripts/stage.mjs';
import { bookEntries, renderMarkdown } from '../scripts/read-md.js';
import { TO_HALL, TO_VALLEY, TO_WAIMEN, walk } from './prologue.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const start = (lang = 'zh') => newState(content, lang, NOW);
const upTo = (steps, exit) => steps.slice(0, steps.findIndex(([, a]) => a.exit === exit));
const page = (l, extra = {}) => ({ look: l, lang: l.lang, words: WORDS[l.lang], content: {}, ...extra });

/* ── The scene card (his, 2026-09-29: 「不用小人书的方式了」 — no picture) ── */

test('a beat stands as a scene card in words: the place, its caption, the choices under it — its new faces\' 图鉴 cards first', () => {
  for (const lang of ['zh', 'en']) {
    const s = walk(start(lang), [['resolve', { exit: 'name', value: '墨白', gender: 'male' }]], content, NOW);
    const l = look(s, content, ctx());
    assert.equal(l.scene.panel.art, undefined, 'a story moment is never illustrated');
    assert.deepEqual(l.scene.meet, ['masan', 'maxiaobao'], '马三 and 马小宝 come on here for the first time (爹 met at home; a bow is a bow — no entry)');
    assert.deepEqual(l.stage.slice(0, 3).map(c => c.card), ['meet', 'meet', 'panel']);
    assert.deepEqual(l.scene.panel.taps.map(t => t.id), ['endure', 'strike']);
    const html = cardHtml({ card: 'panel' }, page(l));
    assert.doesNotMatch(html, /<img/);
    assert.match(html, lang === 'zh' ? /<div class="sceneplace">石坳村 · 你家 · 傍晚<\/div>/ : /<div class="sceneplace">Shi&#39;ao village/);
    assert.match(html, lang === 'zh' ? /<p>马三来了，一脚踹开柴门。<\/p>/ : /<p>Ma San comes, and kicks the gate open\.<\/p>/);
    assert.match(html, lang === 'zh' ? /data-panel-exit="endure">照他的话，原样说回去</ : /data-panel-exit="endure">Say his words straight back</);
    assert.doesNotMatch(html, /undefined|\{\w+\}|NaN/);
    assert.match(cardHtml({ card: 'panel' }, page(l, { panelBusy: 'strike' })), /paneltap busy" data-panel-exit="strike" disabled/);
    assert.match(cardHtml({ card: 'panel' }, page(l, { panelNote: '手里没有鹿皮。' })), /class="donote">手里没有鹿皮。</);
    // the scene card owns its choices: the chat asks nothing
    assert.ok(stageOwns(l, l.stage).has('exit:endure'));
    assert.equal(l.ask, null);
    assert.equal(forLing(l).scene.panel, undefined);
    assert.ok(!l.stage.some(c => c.card === 'hexagram'), 'a beat is not an empty stage');
  }
});

test('a face is new once: the next scene brings on only who it has not met; a replay brings no one', () => {
  const s = walk(start('zh'), [['resolve', { exit: 'name', value: '墨白', gender: 'male' }], ['resolve', { exit: 'endure' }]], content, NOW);
  const l = look(s, content, ctx());
  assert.equal(l.scene.id, '00-dawn');
  assert.ok(!(l.scene.meet ?? []).includes('masan'), '马三 was met');
  assert.ok((l.scene.meet ?? []).includes('ahe'), '阿禾 comes on at dawn');
});

test('no prologue scene has a picture; every person\'s portrait is on disk or a name card', () => {
  for (const scene of Object.values(content.chapters['00-prologue'].scenes)) assert.equal(scene.panel?.art, undefined, scene.id);
  for (const p of content.people.people) assert.ok(fs.existsSync(path.join(content.dir, p.art)), p.id);
  for (const f of Object.values(content.world.companion.forms)) assert.ok(fs.existsSync(path.join(content.dir, f.art)), f.art);
});

/* ── The story owed to Ling ── */

test('the command line: Ling is handed each passage once — a new game\'s first, the tap\'s outcome and the next scene', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-tell-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  try {
    cli('init', '--lang=zh');
    const first = cli('look', '--said=[scene] opened', '--for=ling');
    assert.deepEqual(first.tell.map(t => t.id), ['00-shiao']);
    assert.match(first.tell[0].text, /石坳村一共十七户人家/);
    assert.match(first.then, /^Tell the story first/);
    assert.equal(first.guide.tell.includes('小人书'), true, 'the guide comes with the first passage');
    assert.equal(cli('look', '--said=你好', '--for=ling').tell, undefined, 'told once');
    // the page names the player and taps a choice; Ling's next Look owes both beats
    cli('resolve', '--exit=name', '--value=墨白', '--gender=male');
    cli('resolve', '--exit=strike', '--said=攥紧拳头');
    const told = cli('look', '--said=[scene] took 攥紧拳头', '--for=ling');
    assert.deepEqual(told.tell.map(t => t.id), ['00-masan/strike', '00-dawn']);
    assert.match(told.tell[0].text, /你攥紧了拳头/);
    assert.match(told.tell[1].text, /是隔壁的阿禾/, 'a boy walks with 阿禾');
    assert.deepEqual(told.page_did.map(d => d.what).filter(w => /chose/.test(w)), ['chose 「攥紧拳头」 under the picture — 恩仇簿: 仇 maxiaobao, 仇 masan']);
    // Ling's own Resolve carries its passages at once
    const egg = cli('resolve', '--exit=egg', '--said=收下鸡蛋', '--for=ling');
    assert.deepEqual(egg.tell.map(t => t.id), ['00-dawn/egg', '00-kitchen']);
    assert.deepEqual(egg.ledger, [{ who: 'ahe', kind: '恩', what: { zh: '天没亮，隔着窗塞给你一个煮鸡蛋：「记账，以后还我。」', en: 'Before dawn, pushed a boiled egg through your window: "Keep count. Pay me back."' }, chapter: '00-prologue', day: '2026-09-28', at: '00-dawn' }]);
    assert.equal(cli('look', '--for=ling').tell, undefined);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('her words are hers while she is present: marked for Ling, handed to her; asleep, the story tells them', () => {
  const valley = walk(start(), TO_VALLEY, content, NOW);
  assert.equal(valley.scene, '00-yinyue');
  // at dawn she is not yet with the player: Ling tells her words
  assert.match(tellOf(content, valley).tell.at(-1).text, /\*\*她\*\*：（嚼）难吃。/);
  const out = resolve(valley, content, ctx(), { exit: 'follow' });
  assert.deepEqual(out.result.joined, { id: 'yinyue' });
  assert.deepEqual(out.state.companion, { joined: '2026-09-28', awake: true });
  const cliff = tellOf(content, out.state).tell.at(-1);
  assert.equal(cliff.id, '00-cliff');
  assert.match(cliff.text, /懒洋洋地抬了抬下巴。\n\n〔银月〕/);
  assert.doesNotMatch(cliff.text, /让开/);
  assert.match(out.result.her_beat.facts.line, /让开/);
  assert.deepEqual(Object.keys(forLing(out.result).her_beat.facts), ['happened'], 'Ling never gets her line');
  // she faints at the deer, wakes at night, sleeps in the token after the bath
  let s = walk(out.state, [['resolve', { exit: 'climb' }], ['resolve', { exit: 'left' }]], content, NOW);
  assert.deepEqual(s.companion, { joined: '2026-09-28', asleep: true });
  assert.equal(look(s, content, ctx()).companion.asleep, true);
  s = walk(s, [['resolve', { exit: 'dumb' }], ['resolve', { exit: 'visit' }]], content, NOW);
  assert.equal(s.companion.awake, true);
  s = walk(s, [['resolve', { exit: 'on' }], ['resolve', { exit: 'bath' }]], content, NOW);
  assert.deepEqual(s.companion, { joined: '2026-09-28', asleep: true });
  // asleep: the token's one word at the 蠪侄 is the story's, told by Ling; no beat for her; no card of hers in the fight
  const trial = walk(start(), upTo(TO_HALL, 'subdue'), content, NOW);
  const fight = look({ ...trial, wins: { 'gate-longzhi': NOW.toISOString() } }, content, ctx()).scene.exits.find(e => e.id === 'subdue');
  assert.deepEqual(fight.duel.setup.you.extra, [], 'asleep, she fights nothing');
  const won = resolve({ ...trial, wins: { 'gate-longzhi': NOW.toISOString() } }, content, ctx(), { exit: 'subdue' });
  assert.equal(won.result.her_beat, undefined);
  assert.match(tellOf(content, won.state).tell.find(t => t.id === '00-longzhi/subdue').text, /……左边/);
});

test('an old save found her by the bell: awake, and the engine reads it so', () => {
  const s = { ...start(), companion: { joined: '2026-09-18' } };
  const fitted = look(s, content, ctx());
  assert.equal(fitted.companion.asleep, undefined);
});

/* ── 恩仇簿 ── */

test('恩仇簿: the choices write who and what, once each; Look names them; the chip opens the list', () => {
  const s = walk(start(), TO_WAIMEN, content, NOW);
  const l = look(s, content, ctx());
  assert.deepEqual(l.ledger.map(e => [e.name, e.kind]), [['马小宝', '仇'], ['马三', '仇'], ['阿禾', '恩'], ['老周', '恩']]);
  assert.match(l.ledger[2].what, /记账，以后还我/);
  assert.equal(l.ledger[0].chapter, '序章 · 蒙山');
  const w = { look: l, lang: 'zh', words: WORDS.zh };
  assert.match(ledgerChipHtml(w, false), /data-ledger aria-expanded="false">恩仇簿 4</);
  const open = ledgerChipHtml(w, true);
  assert.match(open, /ledgerrow chou"><span class="ledgerkind">仇<\/span><div><b>马小宝<\/b>/);
  assert.match(open, /ledgerrow en"><span class="ledgerkind">恩<\/span><div><b>阿禾<\/b>/);
  assert.equal(ledgerChipHtml({ look: look(start(), content, ctx()), words: WORDS.zh }, false), '', 'nothing written: no chip');
  const en = look({ ...s, lang: 'en' }, content, ctx());
  assert.match(ledgerChipHtml({ look: en, lang: 'en', words: WORDS.en }, true), /Ledger 4[\s\S]*Ma Xiaobao[\s\S]*Shoved you into the stove/);
  const paid = resolve(s, content, ctx(), { exit: 'pay' });
  assert.equal(paid.state.ledger.length, 5, 'the 公中 is written too');
});

/* ── 《吐纳经》 ── */

test('《吐纳经》: the pouch reads the passage for the layer, the classic\'s words exact; Look hands Ling the day\'s 功课', () => {
  const s = walk(start(), TO_WAIMEN, content, NOW);
  const r = readingOf(content, s, 'tuna');
  assert.equal(r.layer, 1);
  assert.equal(r.name, '引气');
  assert.equal(r.gongke, '子时吐纳一刻，气沉到小腹');
  assert.equal(r.passage.quotes[0].text, '行气，深则蓄，蓄则伸，伸则下，下则定，定则固，固则萌，萌则长，长则退，退则天。天几舂在上，地几舂在下。顺则生，逆则死。');
  const seventh = readingOf(content, { ...s, step: 6 }, 'tuna');
  assert.equal(seventh.passage.quotes[1].text, '真人之息以踵，众人之息以喉。');
  assert.equal(readingOf(content, { ...s, tier: 'foundation', step: 0 }, 'tuna').layer, 9, 'past 练气: the last layer');
  const en = readingOf(content, { ...s, lang: 'en' }, 'tuna');
  assert.equal(en.passage.quotes[0].text, r.passage.quotes[0].text, 'the classic stays in its own words');
  assert.match(en.passage.quotes[0].en, /To move the breath/);
  assert.deepEqual(look(s, content, ctx()).practice_hint, { scroll: '吐纳经', layer: 1, name: '引气', gongke: '子时吐纳一刻，气沉到小腹' });
  assert.equal(look(start(), content, ctx()).practice_hint, undefined, 'no scroll, no hint');
});

/* ── 书 — the book in the game's frame ── */

test('书: every chapter the book names exists and renders; the reader and its chip stay in the frame', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'story/index.json'), 'utf8'));
  assert.ok(index.books.length);
  for (const id of index.books) {
    const dir = path.join(ROOT, 'story', id);
    const book = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'), 'utf8'));
    assert.ok(book.title?.zh && book.title?.en, id);
    for (const ch of bookEntries(book)) {
      const file = path.join(dir, ch.file);
      assert.ok(fs.existsSync(file), `${id}/${ch.file}`);
      assert.ok(ch.title?.zh && ch.title?.en, ch.id);
      const html = renderMarkdown(fs.readFileSync(file, 'utf8'));
      assert.match(html, /^<h1[ >]/, ch.file);
      if (ch.huimu) assert.equal(html.split('\n')[0], `<h1 class="huimu"><span class="hui">${ch.label.zh}</span><span class="line">${ch.huimu.zh[0]}</span><span class="line">${ch.huimu.zh[1]}</span></h1>`, `${ch.file}: its title line is book.json's 回目`);
      assert.doesNotMatch(html, /\*\*|^#/m, `${ch.file}: no markdown left raw`);
    }
  }
  assert.equal(renderMarkdown('# 题\n\n一段**粗**话。\n第二行\n\n> 引文\n> 两行\n\n| a | b |\n|---|---|\n| 1 | <2> |'),
    '<h1>题</h1>\n<p>一段<b>粗</b>话。<br>第二行</p>\n<blockquote><p>引文</p><p>两行</p></blockquote>\n<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>&lt;2&gt;</td></tr></tbody></table>');
  const html = fs.readFileSync(path.join(ROOT, 'scripts/read.html'), 'utf8');
  for (const asset of [...html.matchAll(/(?:src|href)="([^"/][^":]*?)"/g)].map(m => m[1]).filter(a => !a.startsWith('index.html'))) assert.ok(fs.existsSync(path.join(ROOT, 'scripts', asset)), asset);
  const reader = fs.readFileSync(path.join(ROOT, 'scripts/read.js'), 'utf8');
  assert.doesNotMatch(reader, /window\.open|target="_blank"/, 'the frame is sandboxed: navigate in place');
  assert.match(readChipHtml({ lang: 'en', words: WORDS.en }), /<a class="luchip readchip" href="read\.html\?lang=en" title="Read the book">Book<\/a>/);
});

test('a scene choice refused says why until the next move lands: winning the board it waited on clears the note (live, 2026-09-29)', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const write = src.slice(src.indexOf('async function write('), src.indexOf('\n}\n', src.indexOf('async function write(')));
  assert.match(write, /if \(r\?\.ok && name !== 'resolve' && view\.panelNote\) keep\(\{ panelNote: null \}\);/);
});
