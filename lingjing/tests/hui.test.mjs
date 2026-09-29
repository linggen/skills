// 卷 and 回 (rules/hui.mjs; Hanli, 2026-09-29: 「故事叫回和卷，游戏也需要一致的叫法」).
// Every scene the book tells says which 回 it is (`hui`), from book.json and
// never backwards along a chapter's spine; every label the page and Ling show
// is made from the book — 卷一 · 第三回, 回目 and all — and none says 章.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, story } from '../scripts/rules.mjs';
import { comingOf, endLabel, huiEnded, huiLabel, huiNow, zhNumber } from '../scripts/rules/hui.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const TOLD = ['00-prologue', '00-waimen', '01-ji']; // the chapters the book tells; the rest wait to be rewritten
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

test('the prologue is 第一回 up to her daybreak and 第二回 from the cliff; 外门 is 第三回, 冀 第四回', () => {
  const p = content.chapters['00-prologue'].scenes;
  assert.equal(p['00-shiao'].hui, 'h01');
  assert.equal(p['00-yinyue'].hui, 'h01');
  assert.equal(p['00-cliff'].hui, 'h02');
  assert.equal(p['00-mijing'].hui, 'h02');
  for (const sc of Object.values(content.chapters['00-waimen'].scenes)) assert.equal(sc.hui, 'h03', sc.id);
  for (const sc of Object.values(content.chapters['01-ji'].scenes)) assert.equal(sc.hui, 'h04', sc.id);
});

test('the labels are the book\'s: 卷, 回 and 回目 read from book.json, in both languages', () => {
  assert.deepEqual([1, 3, 10, 11, 20, 21, 99].map(zhNumber), ['一', '三', '十', '十一', '二十', '二十一', '九十九']);
  const juan = content.book.volumes[0].name;
  assert.equal(huiLabel(content, 'h03', 'zh', 'short'), '第三回');
  assert.equal(huiLabel(content, 'h03', 'zh'), `${juan.zh} · 第三回`);
  assert.equal(huiLabel(content, 'h03', 'zh', 'head'), `${juan.zh} · 第三回　漏勺夜半通三关`);
  assert.equal(huiLabel(content, 'h03', 'zh', 'book'), `${juan.zh} · 第三回　漏勺夜半通三关　五行台上夺头名`);
  assert.equal(huiLabel(content, 'h03', 'en'), `${juan.en} · Chapter 3`);
  assert.equal(huiLabel(content, 'h03', 'en', 'head'), `${juan.en} · Chapter 3 — The Leaky Ladle Opens Three Passes at Midnight`);
  assert.equal(endLabel(content, 'h03', 'zh'), '第三回 · 完');
  assert.equal(comingOf(content, content.chapters['01-ji'], 'zh'), '第四回 · 即将开放');
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
  assert.match(l.chapter.title, /^卷一.* · 第二回　一牌藏梦闻沉鼎$/);
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
