// 卷 and 回 (rules/hui.mjs; Hanli, 2026-09-29: 「故事叫回和卷，游戏也需要一致的叫法」).
// Every scene the book tells says which 回 it is (`hui`), from book.json and
// never backwards along a chapter's spine; every label the page and Ling show
// is made from the book — 卷一 · 第三回, 回目 and all — and none says 章.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, story } from '../scripts/rules.mjs';
import { comingOf, endLabel, huiEnded, huiLabel, huiNow, huiOf, zhNumber } from '../scripts/rules/hui.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const TOLD = ['00-prologue', '00-waimen', '00-zhuji', '01-ji']; // the chapters the book tells; the rest wait to be rewritten
const book = new Map(content.book.volumes.flatMap(v => v.hui).map(h => [h.id, h.n]));

test('every scene of the chapters the book tells has a 回 of the book', () => {
  assert.ok(book.size >= 4, 'book.json is loaded with the world');
  for (const id of TOLD) {
    for (const sc of Object.values(content.chapters[id].scenes)) assert.ok(book.has(sc.hui), `${id} ${sc.id}: hui ${sc.hui}`);
  }
});

test('along a chapter\'s spine the 回 never goes back — any exit to a next scene', () => {
  for (const ch of Object.values(content.chapters)) {
    for (const sc of Object.values(ch.scenes)) {
      for (const e of sc.exits ?? []) {
        const next = ch.scenes[e.next];
        if (sc.hui && next?.hui) assert.ok(book.get(next.hui) >= book.get(sc.hui), `${sc.id} → ${next.id}: ${sc.hui} → ${next.hui}`);
      }
    }
  }
  // and across chapters, in id order: a chapter starts no earlier than the one before ends
  let last = 0;
  for (const id of TOLD) {
    const ns = Object.values(content.chapters[id].scenes).map(sc => book.get(sc.hui));
    assert.ok(Math.min(...ns) >= last, id);
    last = Math.max(...ns);
  }
});

test('the prologue is 第一回 up to her daybreak, 第二回 from the cliff, 第三回 the winter, 第四回 the trials; 外门 is 第五回 to 第八回, 冀 第十回 (the ten 回 of 2026-09-30)', () => {
  const p = content.chapters['00-prologue'].scenes;
  assert.equal(p['00-shiao'].hui, 'h01');
  assert.equal(p['00-yinyue'].hui, 'h01');
  assert.equal(p['00-cliff'].hui, 'h02');
  assert.equal(p['00-sleep'].hui, 'h02');
  assert.equal(p['00-halfyear'].hui, 'h03');
  assert.equal(p['00-notice'].hui, 'h03');
  assert.equal(p['00-gate'].hui, 'h04');
  assert.equal(p['00-mijing'].hui, 'h04');
  const w = content.chapters['00-waimen'].scenes;
  assert.deepEqual(['wm-ahe', 'wm-qingshi', 'wm-chaifang', 'wm-diyilu', 'wm-mijing', 'wm-chu', 'wm-dabi', 'wm-jiaxin'].map(id => w[id].hui),
    ['h05', 'h05', 'h06', 'h06', 'h07', 'h07', 'h08', 'h08']);
  for (const sc of Object.values(w)) assert.ok(['h05', 'h06', 'h07', 'h08'].includes(sc.hui), sc.id);
  for (const sc of Object.values(content.chapters['00-zhuji'].scenes)) assert.equal(sc.hui, 'h09', sc.id);
  for (const sc of Object.values(content.chapters['01-ji'].scenes)) assert.equal(sc.hui, 'h10', sc.id);
});

test('the labels are the book\'s: 卷, 回 and 回目 read from book.json, in both languages', () => {
  assert.deepEqual([1, 3, 10, 11, 20, 21, 99].map(zhNumber), ['一', '三', '十', '十一', '二十', '二十一', '九十九']);
  const juan = content.book.volumes[0].name;
  assert.equal(huiLabel(content, 'h05', 'zh', 'short'), '第五回');
  assert.equal(huiLabel(content, 'h10', 'zh', 'short'), '第十回');
  assert.equal(huiLabel(content, 'h05', 'zh'), `${juan.zh} · 第五回`);
  assert.equal(huiLabel(content, 'h05', 'zh', 'head'), `${juan.zh} · 第五回　漏勺夜半通三关`);
  assert.equal(huiLabel(content, 'h05', 'zh', 'book'), `${juan.zh} · 第五回　漏勺夜半通三关　萝卜一根收小狰`);
  assert.equal(huiLabel(content, 'h05', 'en'), `${juan.en} · Chapter 5`);
  assert.equal(huiLabel(content, 'h05', 'en', 'head'), `${juan.en} · Chapter 5 — The Leaky Ladle Opens Three Passes at Midnight`);
  assert.equal(endLabel(content, 'h08', 'zh'), '第八回 · 完');
  // A chapter still being written is named by the 回 the book says opens it: 第九回 opens 筑基
  // (00-zhuji), 第十回 冀 — both built since 2026-09-30, so the label is read, never shown there.
  assert.equal(comingOf(content, content.chapters['00-zhuji'], 'zh'), '第九回 · 即将开放');
  assert.equal(comingOf(content, content.chapters['01-ji'], 'zh'), '第十回 · 即将开放');
  assert.equal(huiLabel(content, 'h99', 'zh'), null, 'a 回 the book does not have');
});

test('a 回 ends where the scenes turn, inside the prologue: 「第一回 · 完」 on the cliff, gone once it is passed', () => {
  const valley = walk(newState(content, 'zh', NOW), TO_VALLEY, content, NOW);
  assert.equal(valley.scene, '00-yinyue');
  assert.equal(huiNow(content, valley), 'h01');
  assert.equal(look(valley, content, ctx()).chapter.close, undefined);
  const cliff = resolve(valley, content, ctx(), { exit: 'follow' }).state;
  assert.equal(cliff.scene, '00-cliff');
  assert.equal(huiEnded(content, cliff), 'h01');
  const l = look(cliff, content, ctx());
  assert.equal(l.chapter.id, '00-prologue', 'the same chapter: the map, the locks, all as they were');
  assert.equal(l.chapter.hui, 'h02');
  assert.equal(l.chapter.title.replace(/^.* · 第二回　/, ''), huiOf(content, 'h02').huimu.zh[0]);
  assert.match(l.chapter.title, /^卷一.* · 第二回　/);
  assert.deepEqual(l.chapter.close, { id: 'h01', title: '第一回 · 完', huimu: ['一只破碗辞残照', '半张烙饼换妖王'], next: l.chapter.title });
  assert.ok(l.stage.some(c => c.card === 'closed'));
  const on = resolve(cliff, content, ctx(), { exit: 'climb' }).state;
  assert.equal(look(on, content, ctx()).chapter.close, undefined);
  // 九鼎录: the prologue as its two 回, the intro on the first, the riddle on the one being played
  const lu = story(on, content, ctx()).result.chapters;
  assert.deepEqual(lu.map(c => [c.id, c.state]), [['h01', 'done'], ['h02', 'current']]);
  assert.ok(lu[0].recap.length >= 5 && lu[1].recap.length >= 1);
});

test('an old save loads as it was: ids unchanged, its 回 read from where it stands', () => {
  // his save on 2026-09-29 stood at 00-sleep with no 回 field anywhere in it
  const old = { ...newState(content, 'zh', NOW), scene: '00-sleep', place: 'shiao', done_scenes: ['00-shiao', '00-masan', '00-yinyue', '00-cliff', '00-deer'] };
  const l = look(old, content, ctx());
  assert.equal(l.chapter.id, '00-prologue');
  assert.equal(l.chapter.hui, 'h02');
  assert.equal(l.chapter.close, undefined, '第二回 is under way');
});

test('no 章 is shown: chapter titles, closes and the page\'s words say 回 and 卷', async () => {
  for (const ch of Object.values(content.chapters)) {
    for (const lang of ['zh', 'en']) {
      assert.doesNotMatch(ch.title[lang], /章|Chapter|Prologue/, `${ch.id} title`);
      assert.equal(ch.close?.title, undefined, `${ch.id}: a close is named by its 回`);
    }
    assert.ok(ch.coming === undefined || ch.coming === true, `${ch.id} coming`);
  }
  const { WORDS } = await import('../scripts/cards.js');
  assert.doesNotMatch(JSON.stringify(WORDS.zh), /章/);
});

test('a passage carries its 回, so the page plays an ending 回\'s last words before its 「完」 (seen live at 09-cliff, 2026-09-30)', async () => {
  const { tellOf } = await import('../scripts/rules/tell.mjs');
  const s = { ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-arrive', place: 'yecheng', lang: 'zh', tell_owed: ['09-cliff/take'], done_scenes: ['09-snow', '09-furnace', '09-year', '09-qulao', '09-cliff'] };
  const tell = tellOf(content, s)?.tell ?? [];
  const take = tell.find(t => t.id === '09-cliff/take'), arrive = tell.find(t => t.id === '01-arrive');
  assert.equal(take?.hui, 'h09', 'the exit that ended 第九回 is of 第九回');
  assert.equal(arrive?.hui, 'h10', 'the new scene is of 第十回');
  assert.equal(huiEnded(content, s), 'h09', 'and 第九回 is the 回 just ended');
});

test('卷一 ends on its own card: 01-end rest waits on 「卷二 · 即将开放」 under 「卷一 · 沉鼎 · 完」 over 「第十回 · 完」, what he did, and 卷二\'s opening as the teaser', async () => {
  const fs = await import('node:fs');
  const s0 = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/ji-end.json', import.meta.url), 'utf8')).state;
  const end = resolve(s0, content, ctx(), { exit: 'rest' });
  assert.equal(end.result.ok, true);
  assert.deepEqual(end.result.waiting, { chapter: '02-yan', coming: '卷二 · 即将开放' });
  const close = look(end.state, content, ctx()).chapter.close;
  assert.equal(close.title, '第十回 · 完');
  assert.equal(close.juan, '卷一 · 沉鼎 · 完');
  assert.deepEqual(close.huimu, ['巫祝投河捎口信', '千鱼漳水立龙门']);
  assert.match(close.did, /没有跪/);
  assert.match(close.teaser, /借鼎[\s\S]*散修[\s\S]*利息还没还完/);
  const inner = huiLabel(content, 'h09', 'zh', 'short');
  assert.equal(inner, '第九回');
});
