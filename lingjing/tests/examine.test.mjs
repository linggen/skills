// 看 — a scene's hotspots (rules/examine.mjs; his, 2026-09-29: tapping on felt
// like turning pages): small chips on the scene card, a finding in the book's
// voice, free and written on the save; a choice that waits on a clue, and a
// hint for the stuck; what was found goes to 录 and to Ling's Look. With it:
// fewer taps (a transition's one way on is a quiet link in its own words —
// 2026-10-01: never a bare 「接着」 over the book's decision), the chat asks
// 「你想怎么做？」, and the 图鉴 names her only once the hero knows her name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lint, lintLooks, loadContent, LOOK_GIVES } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, resolve, story, VERBS } from '../scripts/rules.mjs';
import { GIVES, STALL_LOOKS } from '../scripts/rules/examine.mjs';
import { newHere, seenOf } from '../scripts/rules/codex.mjs';
import { cardHtml, lookHtml, WORDS } from '../scripts/cards.js';
import { seenHtml, LU_WORDS } from '../scripts/lu.js';
import { codexBookHtml, codexOf } from '../scripts/codex.js';
import { codexFiles } from '../scripts/content.mjs';
import { placeholderFor } from '../scripts/invite.js';
import { TO_VALLEY, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const examine = (s, at) => VERBS.look(s, content, ctx(), { at });
const upTo = (exit) => TO_VALLEY.slice(0, TO_VALLEY.findIndex(([, a]) => a.exit === exit));
/* The save at 黑松岭, the clue not yet found. */
const atHeisong = () => walk(newState(content, 'zh', NOW), upTo('carve').filter(([v]) => v !== 'look'), content, NOW);
const scenes = () => Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes));

test('黑松岭 shows three things to look at — labels only, never a finding before it is found — and no way on yet', () => {
  const s = atHeisong();
  assert.equal(s.scene, '00-heisong');
  const sc = look(s, content, ctx()).scene;
  assert.deepEqual(sc.look.map(h => h.label), ['蹄印', '石上的痕迹', '枯草']);
  assert.ok(sc.look.every(h => !h.found && h.text == null && !h.clue), 'nothing found, nothing told');
  assert.deepEqual(sc.panel.taps, [], 'the chase waits on the clue');
  assert.ok(!sc.buttons.some(b => b.id === 'carve'));
  assert.equal(sc.look_hint, undefined);
  const tried = resolve(s, content, ctx(), { exit: 'carve' });
  assert.equal(tried.result.refused, 'needs');
  assert.match(tried.result.say, /先看清楚/);
});

test('looking is free and written on the save; looked at again, the same line and nothing written; nothing there is refused', () => {
  const s = atHeisong();
  const out = examine(s, 'prints');
  assert.equal(out.result.ok, true);
  assert.equal(out.result.looked.label, '蹄印');
  assert.match(out.result.looked.text, /还不到一个时辰/);
  assert.deepEqual(out.state.looked, ['00-heisong/prints']);
  assert.equal(out.state.stamina, s.stamina, 'no 体力');
  assert.equal(out.state.scene, s.scene, 'the story does not move');
  const again = examine(out.state, 'prints');
  assert.equal(again.state, null);
  assert.equal(again.result.again, true);
  const none = examine(s, 'sky');
  assert.equal(none.result.refused, 'nothing-there');
  assert.deepEqual(none.result.spots, ['prints', 'stone', 'grass']);
});

test('the key clue opens the chase — as a quiet link in its own words, not a big button — and Resolve takes it', () => {
  const found = examine(atHeisong(), 'stone');
  assert.deepEqual(found.result.opens, ['追蹄印，一百步刻一道']);
  assert.equal(found.result.looked.clue, true);
  const sc = look(found.state, content, ctx()).scene;
  assert.deepEqual(sc.panel.taps.map(t => [t.id, t.quiet]), [['carve', 'label']]);
  assert.equal(sc.look.find(h => h.id === 'stone').clue, true);
  const on = resolve({ ...found.state, stamina: 100 }, content, ctx(), { exit: 'carve' });
  assert.equal(on.result.ok, true);
  assert.equal(on.state.scene, '00-storm');
});

test(`stuck: ${STALL_LOOKS} looks without the key bring the scene's hint, in the result and on the card`, () => {
  let s = atHeisong();
  s = examine(s, 'prints').state;
  assert.equal(look(s, content, ctx()).scene.look_hint, undefined, 'one look is not stuck');
  const second = examine(s, 'grass');
  assert.match(second.result.hint, /等你看出个名堂来/);
  assert.match(look(second.state, content, ctx()).scene.look_hint, /等你看出个名堂来/);
  assert.equal(look(examine(second.state, 'stone').state, content, ctx()).scene.look_hint, undefined, 'found, the hint goes');
});

test('所见: Look hands Ling what was found and what was passed by; 录 lists it; the page notes the look for her', () => {
  let s = examine(examine(atHeisong(), 'grass').state, 'stone').state;
  const here = look(s, content, ctx()).seen;
  assert.deepEqual(here.map(r => r.scene), ['00-heisong']);
  assert.equal(here[0].missed, undefined, 'the scene he stands in misses nothing yet');
  s = resolve({ ...s, stamina: 100 }, content, ctx(), { exit: 'carve' }).state;
  const seen = forLing(look(s, content, ctx())).seen;
  assert.deepEqual(seen[0].found.map(f => f.label), ['枯草', '石上的痕迹'], 'in the order found');
  assert.deepEqual(seen[0].missed, ['蹄印']);
  const book = story(s, content, ctx(), {}).result;
  assert.deepEqual(book.seen, seen);
  assert.equal(story(s, content, ctx(), { short: 'true' }).result.seen, undefined, 'Ling\'s short book stays short');
  const html = seenHtml(book.seen, LU_WORDS.zh);
  assert.match(html, /所见/);
  assert.match(html, /石上的痕迹/);
  assert.match(html, /未细看：蹄印/);
});

test('the command line: the page\'s 看 is noted in page_did for Ling; Ling\'s own Look --at answers the finding', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-look-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(atHeisong()));
  const page = cli('look', '--at=stone');
  assert.equal(page.looked.id, 'stone');
  const state = JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8'));
  assert.match(state.page_did.at(-1).what, /^looked at 「石上的痕迹」: .*— it opened: 追蹄印/);
  const ling = cli('look', '--at=grass', '--said=看看枯草', '--for=ling');
  assert.match(ling.looked.text, /鹿毛/);
});

test('every hotspot shipped is linted clean; a bad one is caught; the lint knows what a finding may give', () => {
  assert.deepEqual(lint(content).filter(p => /look/.test(JSON.stringify(p))), []);
  const pair = v => Boolean(v?.zh && v?.en), id = x => /^[a-z0-9-]+$/.test(x);
  const bad = lintLooks({ look: [{ id: 'A', label: { zh: '甲' }, text: { zh: '一'.repeat(61), en: 'x' }, clue: 'yes', gives: { bag: 'x' } }, { id: 'A', label: { zh: '乙', en: 'b' }, text: { zh: '乙', en: 'b' } }],
    exits: [{ id: 'on', needs: { seen: ['b'] } }] }, pair, id);
  for (const want of ['repeats a look id', 'an id is lowercase', 'a label in zh and en', 'one line in zh', 'clue is true', 'gives bag', 'waits on b', 'look_hint']) {
    assert.ok(bad.some(p => p.includes(want)), `${want} in ${JSON.stringify(bad)}`);
  }
  assert.deepEqual([...LOOK_GIVES].sort(), Object.keys(GIVES).sort());
});

test('the hotspots written: the prologue and 第一章\'s key scenes, two to four each, and the tracking waits on its clue', () => {
  const have = Object.fromEntries(scenes().filter(s => s.look).map(s => [s.id, s.look.length]));
  for (const id of ['00-masan', '00-chushan', '00-duanbei', '00-heisong', '00-fox', '00-hall', 'wm-jiangtang', 'wm-chaifang', 'wm-danlu', 'wm-wangzuo', 'wm-caowu']) {
    assert.ok(have[id] >= 2 && have[id] <= 4, `${id}: ${have[id]}`);
  }
  assert.deepEqual(content.chapters['00-prologue'].scenes['00-heisong'].exits[0].needs, { seen: ['stone'] });
});

test('nothing seen reveals what the hero does not know yet: before 银月 names herself no finding names her or where she is from', () => {
  const pro = content.chapters['00-prologue'].scenes;
  const before = ['00-masan', '00-chushan', '00-duanbei', '00-heisong', '00-fox'];
  for (const id of before) for (const h of pro[id].look) {
    assert.doesNotMatch(h.text.zh + h.label.zh, /银月|青丘|妖王|九尾|仙/, `${id}/${h.id}`);
    assert.doesNotMatch(h.text.en + h.label.en, /Yinyue|Qingqiu|nine-tailed|immortal/i, `${id}/${h.id}`);
  }
  // …and the token's tails are not counted before the pit, where the book counts them.
  assert.doesNotMatch(pro['00-chushan'].look.find(h => h.id === 'token').text.zh, /九/);
});

test('fewer taps: a transition\'s one way on is quiet (its own words when it ends the day); a real decision keeps its buttons', () => {
  const quietOf = (id, extra = {}) => {
    const sc = content.chapters['00-prologue'].scenes[id] ?? content.chapters['00-waimen'].scenes[id];
    const s = { ...newState(content, 'zh', NOW), chapter: sc.chapter, scene: sc.id, place: sc.at, name: '青玄', ...extra };
    return look(s, content, ctx()).scene.panel.taps;
  };
  assert.deepEqual(quietOf('00-kitchen').map(t => t.quiet), ['label'], 'a lone choice keeps its words (跟爹进山)');
  assert.deepEqual(quietOf('wm-jiangtang').map(t => [t.label, t.quiet]), [['能。', 'label']], 'the book\'s answer, never 「接着」');
  assert.deepEqual(quietOf('00-mijing').map(t => t.quiet), ['label'], '今日到此 keeps its words');
  assert.ok(quietOf('00-masan').every(t => !t.quiet), 'a decision is buttons');
});

test('「也可以直接说你想怎么做」 now and then: on a decision, every third scene played — never on a transition', () => {
  const at = (id, n) => {
    const sc = content.chapters['00-prologue'].scenes[id];
    const s = { ...newState(content, 'zh', NOW), chapter: sc.chapter, scene: sc.id, place: sc.at, name: '青玄', done_scenes: Array.from({ length: n }, (_, i) => `x${i}`) };
    return look(s, content, ctx()).scene.panel.invite ?? false;
  };
  assert.deepEqual([0, 1, 2, 3].map(n => at('00-masan', n)), [true, false, false, true]);
  assert.equal(at('00-kitchen', 3), false);
});

test('the page: 看 chips, the finding under the card, the hint; the quiet link; the invite; the chat asks 你想怎么做', () => {
  const s = examine(examine(atHeisong(), 'prints').state, 'grass').state;
  const lk = look(s, content, ctx());
  const html = lookHtml(lk.scene, null, WORDS.zh);
  assert.match(html, /data-look-at="stone"/);
  assert.match(html, /class="lookchip found"[^>]*data-look-at="prints"[^>]*disabled/);
  assert.match(html, /<li><b>蹄印<\/b>印子边上的泥还湿着/);
  assert.doesNotMatch(html, /青苔刮掉/, 'the clue unfound is not on the page');
  assert.match(html, /class="lookhint"/);
  const on = look(examine(s, 'stone').state, content, ctx());
  const card = cardHtml({ card: 'panel' }, { look: on, words: WORDS.zh, lang: 'zh' });
  assert.match(card, /class="quietnext"[^>]*data-panel-exit="carve"[^>]*>追蹄印，一百步刻一道 ›</);
  assert.doesNotMatch(card, /class="act paneltap"/);
  const masan = { ...newState(content, 'zh', NOW), chapter: '00-prologue', scene: '00-masan', place: 'shiao', name: '青玄', done_scenes: [] };
  assert.match(cardHtml({ card: 'panel' }, { look: look(masan, content, ctx()), words: WORDS.zh, lang: 'zh' }), /也可以直接说你想怎么做/);
  assert.equal(WORDS.zh.chatHint, '你想怎么做？');
  assert.equal(WORDS.en.chatHint, 'What do you do?');
  assert.equal(placeholderFor('Message... (/ for skills)', '你想怎么做？'), '你想怎么做？');
  assert.equal(placeholderFor('去泗水   ⇥ Tab', '你想怎么做？'), '去泗水   ⇥ Tab', 'the engine\'s own hint stays');
  const page = fs.readFileSync(path.resolve(import.meta.dirname, '../scripts/lingjing.js'), 'utf8');
  assert.match(page, /placeholder: words\(\)\.chatHint/);
  assert.match(page, /holdPlaceholder\(\$\('chat-panel'\)/);
  assert.match(page, /\['\[data-look-at\]'/);
});

test('guide `tell` has Ling resolve typed words against the exits, then the hotspots, then nothing', () => {
  const guide = fs.readFileSync(path.resolve(import.meta.dirname, '../guide/tell.md'), 'utf8');
  assert.match(guide, /Typed actions/);
  assert.match(guide, /\*\*An exit\*\*/);
  assert.match(guide, /\*\*A hotspot\*\*.*\*\*Look with `at`\*\*/s);
  assert.match(guide, /`seen`/);
  const md = fs.readFileSync(path.resolve(import.meta.dirname, '../SKILL.md'), 'utf8');
  assert.match(md, /look --said=\{\{said\}\} --at=\{\{at\}\} --for=ling/);
});

test('图鉴 at the pit: 「小银狐 · 生物」 — no name, nothing of 青丘; 银月 · 人物 only at dawn, when she names herself; 录 folds one into the other', () => {
  const pro = content.chapters['00-prologue'].scenes;
  const base = { ...newState(content, 'zh', NOW), bag: {}, duels: {} };
  const pit = newHere(content, { ...base, done_scenes: ['00-fall'] }, pro['00-fox']);
  assert.deepEqual(pit, ['yinyue-fox']);
  const codex = codexOf(codexFiles(content), { lang: 'zh' });
  const fox = codex.get('yinyue-fox');
  assert.equal(fox.name, '小银狐');
  assert.equal(fox.kind, '生物');
  assert.doesNotMatch(fox.lines.join(''), /银月|青丘|妖王/);
  const cave = { ...base, done_scenes: ['00-fall', '00-fox', '00-cave'] };
  assert.ok(!newHere(content, cave, pro['00-cave']).includes('yinyue'), 'the cave: still the nameless fox');
  assert.deepEqual(newHere(content, cave, pro['00-yinyue']), ['yinyue']);
  assert.equal(content.codex.entries.yinyue.first.scene, '00-yinyue');
  const before = new Set(seenOf(content, cave));
  assert.ok(before.has('yinyue-fox') && !before.has('yinyue'));
  const after = new Set(seenOf(content, { ...cave, done_scenes: [...cave.done_scenes, '00-yinyue'] }));
  assert.ok(after.has('yinyue') && !after.has('yinyue-fox'), 'known by her name now');
  const kinds = content.codex.kinds;
  const count = (seen) => /生物 <span class="dim">(\d+)\/(\d+)/.exec(codexBookHtml(codex, seen, { kinds }))?.slice(1).map(Number);
  const creatures = [...codex.values()].filter(e => e.kind === '生物' && !e.becomes).length;
  assert.deepEqual(count(after), [0, creatures], 'the fox is no empty slot of its own');
  assert.deepEqual(count(before), [1, creatures + 1]);
});

test('a riddle choice is its question on the card: 01-deep\'s 读封 · 填中格 shows the riddle and its answers, and a tap answers it', () => {
  const base = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/ji-altar.json', import.meta.url), 'utf8'));
  const s = { ...base, scene: '01-deep', place: 'zhangyuan' };
  const lk = look(s, content, ctx());
  const card = cardHtml({ card: 'panel' }, { look: lk, words: WORDS.zh, lang: 'zh' });
  assert.match(card, /居中者何/, 'the question stands on the card');
  for (const c of ['一', '九', '十五', '五']) assert.match(card, new RegExp(`data-panel-exit="seal" data-panel-answer="${c}"`));
  assert.doesNotMatch(card, />接着 ›</, 'never a bare 接着 the rules refuse');
  const r = resolve(s, content, ctx(), { exit: 'seal', answer: '五' });
  assert.equal(r.result.ok, true);
  assert.equal(r.state.scene, '01-cauldron');
});
