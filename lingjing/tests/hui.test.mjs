// 卷 and 回 (rules/hui.mjs; Hanli, 2026-09-29: 「故事叫回和卷，游戏也需要一致的叫法」).
// Every scene the book tells says which 回 it is (`hui`), from book.json and
// never backwards along a chapter's spine; every label the page and Ling show
// is made from the book — 卷一 · 第三回, 回目 and all — and none says 章.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, story } from '../scripts/rules.mjs';
import { chapterHuis, comingOf, endLabel, firstHui, huiEnded, huiLabel, huiNow, huiOf, juanEndOf, zhNumber } from '../scripts/rules/hui.mjs';
import { bookEntries, idsOf } from '../scripts/book-order.js';
import { TO_VALLEY, walk } from './prologue.mjs';
import { bookNo } from './book-num.mjs';

const content = loadContent();
const NOW = new Date('2026-09-28T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const TOLD = ['00-prologue', '00-waimen', '00-zhuji', '01-ji']; // the chapters the book tells; the rest wait to be rewritten
// The book's order (book-order.js, as the reader walks it): 今 interludes sit between the 古 films, so a 回's place,
// never its `n`. A 回 folded into another (`absorbs`, 2026-10-02: h03 into 古二, h06 into 古四) stands at its absorber's place.
const book = new Map(bookEntries(content.book, { draft: true }).filter(h => h.volume).flatMap((h, at) => idsOf(h).map(id => [id, at])));

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
  assert.equal(p['00-xiuxian'].hui, 'h02');
  // 2026-10-02: old 古三 folded into 古二 — the winter's scenes name h02 now (h03 stays an absorbed id for old saves)
  assert.equal(p['00-sleep'].hui, 'h02');
  assert.equal(p['00-halfyear'].hui, 'h02');
  assert.equal(p['00-notice'].hui, 'h02');
  assert.equal(p['00-gate'].hui, 'h04');
  assert.equal(p['00-mijing'].hui, 'h04');
  const w = content.chapters['00-waimen'].scenes;
  assert.deepEqual(['wm-ahe', 'wm-qingshi', 'wm-chaifang', 'wm-diyilu', 'wm-mijing', 'wm-chu', 'wm-dabi', 'wm-jiaxin'].map(id => w[id].hui),
    ['h05', 'h05', 'h05', 'h05', 'h07', 'h07', 'h08', 'h08']); // h06 folded into 古四 (2026-10-02)
  for (const sc of Object.values(w)) assert.ok(['h05', 'h06', 'h07', 'h08'].includes(sc.hui), sc.id);
  for (const sc of Object.values(content.chapters['00-zhuji'].scenes)) assert.equal(sc.hui, 'h09', sc.id);
  for (const sc of Object.values(content.chapters['01-ji'].scenes)) assert.equal(sc.hui, 'h10', sc.id);
});

test('the labels are the book\'s: 卷, 回 and 回目 read from book.json, in both languages — the number the reader\'s', () => {
  assert.deepEqual([1, 3, 10, 11, 20, 21, 99].map(zhNumber), ['一', '三', '十', '十一', '二十', '二十一', '九十九']);
  const juan = content.book.volumes[0].name, h05 = bookNo(content, 'h05'), h05en = bookNo(content, 'h05', 'en');
  // the book opens on 古一 and only the 古 回 take numbers (2026-10-02): 古一 is 第一回, 古三 (h04) 第三回,
  // and a scene still naming a folded 回 (h03, h06) reads as the 回 that absorbed it
  assert.equal(huiLabel(content, 'h01', 'zh', 'short'), '第一回');
  assert.equal(huiLabel(content, 'h04', 'zh', 'short'), '第三回');
  assert.equal(huiLabel(content, 'h03', 'zh', 'short'), '第二回');
  assert.equal(huiLabel(content, 'h06', 'zh', 'short'), '第四回');
  assert.equal(huiLabel(content, 'j01', 'zh', 'short'), '今 · 一', 'an interlude takes no 回 number');
  for (const h of bookEntries(content.book).filter(e => e.volume)) assert.equal(huiLabel(content, h.id, 'zh', 'short'), h.label.zh, `${h.id}: the reader's number`);
  assert.equal(huiLabel(content, 'h05', 'zh'), `${juan.zh} · ${h05}`);
  assert.equal(huiLabel(content, 'h05', 'zh', 'head'), `${juan.zh} · ${h05}　古 · 漏勺夜半通三关`);
  assert.equal(huiLabel(content, 'h05', 'zh', 'book'), `${juan.zh} · ${h05}　古 · 漏勺夜半通三关　萝卜一根收小狰`);
  assert.equal(huiLabel(content, 'h05', 'en'), `${juan.en} · ${h05en}`);
  assert.equal(huiLabel(content, 'h05', 'en', 'head'), `${juan.en} · ${h05en} · Then — The Leaky Ladle Opens Three Passes at Midnight`);
  assert.equal(endLabel(content, 'h08', 'zh'), `${bookNo(content, 'h08')} · 完`);
  // A chapter still being written is named by the 回 the book says opens it: 古九 opens 筑基
  // (00-zhuji), 古十 冀 — both built since 2026-09-30, so the label is read, never shown there.
  assert.equal(comingOf(content, content.chapters['00-zhuji'], 'zh'), `${bookNo(content, 'h09')} · 即将开放`);
  assert.equal(comingOf(content, content.chapters['01-ji'], 'zh'), `${bookNo(content, 'h10')} · 即将开放`);
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
  assert.equal(l.chapter.title, huiLabel(content, 'h02', 'zh', 'head'));
  assert.equal(l.chapter.title.replace(/^.*　古 · /, ''), huiOf(content, 'h02').huimu.zh[0]);
  assert.ok(l.chapter.title.startsWith(`卷一 · 沉鼎 · ${bookNo(content, 'h02')}　古 · `), l.chapter.title);
  assert.deepEqual(l.chapter.close, { id: 'h01', title: `${bookNo(content, 'h01')} · 完`, huimu: ['一只破碗辞残照', '半张烙饼换妖王'], next: l.chapter.title });
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
  assert.equal(l.chapter.hui, 'h02', '00-sleep is 古二 since old 古三 folded into it (2026-10-02)');
  // 2026-10-02: old 古三 (h03) folded into 古二, so 00-sleep is still 古二 — no 「完」 stands between them
  assert.equal(l.chapter.close, undefined, '古二 goes on: nothing has ended');
  assert.equal(huiLabel(content, l.chapter.hui, 'zh', 'short'), bookNo(content, 'h02'));
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
  // Arrived at 漳水南岸 (the scene's passage waits for him there — tell.mjs waitsArrival).
  const s = { ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-arrive', place: 'zhangnan', lang: 'zh', tell_owed: ['09-cliff/take'], done_scenes: ['09-snow', '09-furnace', '09-year', '09-qulao', '09-cliff'] };
  const tell = tellOf(content, s)?.tell ?? [];
  const take = tell.find(t => t.id === '09-cliff/take'), arrive = tell.find(t => t.id === '01-arrive');
  assert.equal(take?.hui, 'h09', 'the exit that ended 古九 is of 古九');
  assert.equal(arrive?.hui, 'h10', 'the new scene is of 古十');
  assert.equal(huiEnded(content, s), 'h09', 'and 古九 is the 回 just ended');
});

test('卷一 ends on its own card: 01-end rest waits on 「卷二 · 即将开放」 under 「卷一 · 沉鼎 · 完」 over 「第十回 · 完」, what he did, and 卷二\'s opening as the teaser', async () => {
  const fs = await import('node:fs');
  const s0 = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/ji-end.json', import.meta.url), 'utf8')).state;
  const end = resolve(s0, content, ctx(), { exit: 'rest' });
  assert.equal(end.result.ok, true);
  assert.deepEqual(end.result.waiting, { chapter: '02-yan', coming: '卷二 · 即将开放' });
  const close = look(end.state, content, ctx()).chapter.close;
  assert.equal(close.title, `${bookNo(content, 'h10')} · 完`, '古十: the game\'s 卷 ends there, though the book\'s ends on 今十');
  assert.equal(close.place, '漳水 · 往柳湾', 'the stage keeps 往柳湾 over the spot\'s map name (漳渊)');
  assert.equal(close.juan, '卷一 · 沉鼎 · 完');
  assert.deepEqual(close.huimu, ['巫祝投河捎口信', '千鱼漳水立龙门']);
  assert.match(close.did, /没有跪/);
  assert.match(close.teaser, /借鼎[\s\S]*散修[\s\S]*利息还没还完/);
  const inner = huiLabel(content, 'h09', 'zh', 'short');
  assert.equal(inner, bookNo(content, 'h09'));
});

/* 《九鼎录》 as it stands since 2026-10-02: 古一 古二 ‖今 · 一‖ 古三 古四 ‖今 · 二‖ …
   古七 古八 ‖今 · 四‖. Only the 古 回 are numbered (第一回 … 第八回); the
   game plays the 古 line, and nothing in it depends on how many 今 are in. */
const withDraft = (id) => {
  const hui = content.book.volumes[0].hui.map(h => (h.id === id ? { ...h, draft: true } : h));
  return { ...content, book: { ...content.book, volumes: [{ ...content.book.volumes[0], hui }, ...content.book.volumes.slice(1)] } };
};

test('the book in four films with an interlude after each: 古 第一回 … 第八回, the 今 unnumbered, the 卷 ends on 古八 for the game, the lint is clean', async () => {
  const c = content;
  const gu = c.book.volumes[0].hui.filter(h => h.line !== 'jin');
  assert.deepEqual(gu.map(h => h.id), ['h01', 'h02', 'h04', 'h05', 'h07', 'h08', 'h09', 'h10']);
  gu.forEach((h, i) => assert.equal(huiLabel(c, h.id, 'zh', 'short'), `第${zhNumber(i + 1)}回`, h.id));
  assert.equal(huiLabel(c, 'h01', 'en', 'short'), 'Chapter 1');
  assert.deepEqual(['j01', 'j04', 'j07', 'j09'].map(id => huiLabel(c, id, 'zh', 'short')), ['今 · 一', '今 · 二', '今 · 三', '今 · 四']);
  assert.equal(huiLabel(c, 'j02', 'zh', 'short'), '今 · 一', 'a folded 今 id names the interlude that holds it');
  assert.equal(endLabel(c, 'h10', 'zh'), '第八回 · 完');
  assert.equal(juanEndOf(c, 'h10', 'zh'), '卷一 · 沉鼎 · 完', 'the 卷 ends for the game at 古八 (h10)');
  assert.equal(juanEndOf(c, 'h09', 'zh'), null);
  assert.equal(juanEndOf(c, 'j09', 'zh'), '卷一 · 沉鼎 · 完', 'and for the 今 line at 今 · 四');
  assert.equal(juanEndOf(c, 'j10', 'zh'), '卷一 · 沉鼎 · 完', 'j10 is folded into 今 · 四');
  assert.equal(comingOf(c, c.chapters['01-ji'], 'zh'), '第八回 · 即将开放');
  assert.deepEqual(chapterHuis(c, c.chapters['00-prologue']).filter(id => id !== 'h03'), ['h01', 'h02', 'h04']);
  assert.equal(firstHui(c, c.chapters['00-waimen']), 'h05');
  // a 回 turning inside the prologue, as before
  const valley = walk(newState(c, 'zh', NOW), TO_VALLEY, c, NOW);
  const cliff = resolve(valley, c, ctx(), { exit: 'follow' }).state;
  assert.equal(huiEnded(c, cliff), 'h01');
  const l = look(cliff, c, ctx());
  assert.equal(l.chapter.close.title, '第一回 · 完');
  assert.ok(l.chapter.title.startsWith('卷一 · 沉鼎 · 第二回　古 · '), l.chapter.title);
  assert.deepEqual(story(cliff, c, ctx()).result.chapters.map(p => p.id), ['h01', 'h02']);
  // the scenes' spine reads the same in book order
  const { lint } = await import('../scripts/content.mjs');
  assert.deepEqual(lint(c), []);
  // and the lint reads the book's order, not `n`: 古三 put before 古二 is a step back along the prologue
  const hui = c.book.volumes[0].hui, i2 = hui.findIndex(h => h.id === 'h02'), i4 = hui.findIndex(h => h.id === 'h04');
  const swapped = [...hui]; [swapped[i2], swapped[i4]] = [swapped[i4], swapped[i2]];
  const back = { ...c, book: { ...c.book, volumes: [{ ...c.book.volumes[0], hui: swapped }] } };
  assert.ok(lint(back).some(p => /goes back from h0[23] to h04|goes back from h04/.test(p)), 'the lint sees the order');
});

test('a draft 回 takes no number, as in the reader: the 古 after it close up', () => {
  const c = withDraft('h04'); // 古三 still a draft
  assert.equal(huiLabel(c, 'h02', 'zh', 'short'), '第二回');
  assert.equal(huiLabel(c, 'h05', 'zh', 'short'), '第三回', 'h01 h02 (h04) h05');
  assert.equal(huiLabel(c, 'h04', 'zh', 'short'), null, 'a draft is named by nothing');
  assert.deepEqual(chapterHuis(c, c.chapters['00-prologue']).filter(id => id !== 'h03'), ['h01', 'h02', 'h04'], 'and still sorts in its place');
  const j = withDraft('j01'); // an interlude held back: the 古 numbers do not move, the next interlude becomes 今 · 一
  assert.equal(huiLabel(j, 'h04', 'zh', 'short'), '第三回');
  assert.equal(huiLabel(j, 'j04', 'zh', 'short'), '今 · 一');
});

test('story travel: a scene roads away keeps its passage owed until he arrives; the choice\'s own passage plays where it was made', async () => {
  const { tellOf, owesTell } = await import('../scripts/rules/tell.mjs');
  const away = { ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-arrive', place: 'houshan', lang: 'zh', tell_owed: ['09-cliff/take'], done_scenes: ['09-snow', '09-furnace', '09-year', '09-qulao', '09-cliff'] };
  const t = tellOf(content, away);
  assert.deepEqual(t.tell.map(i => i.id), ['09-cliff/take'], 'only the throw\'s passage, on the cliff');
  assert.ok(!t.keep.told_scenes.includes('01-arrive'), 'the arrival\'s is not marked told');
  const walking = { ...away, ...t.keep };
  assert.equal(owesTell(content, walking), false, 'nothing to draw on the road (the stage is not held up)');
  const there = { ...walking, place: 'zhangnan' };
  assert.equal(owesTell(content, there), true);
  assert.deepEqual(tellOf(content, there).tell.map(i => i.id), ['01-arrive'], 'told at 漳水南岸');
});

test('story travel by an exit\'s `next`: every 卷一 step to a scene at another place keeps that scene\'s passage owed until arrival', async () => {
  const { tellOf, owesTell } = await import('../scripts/rules/tell.mjs');
  const { atScene } = await import('../scripts/rules/world.mjs');
  const scenes = Object.fromEntries(['00-prologue', '00-waimen', '00-zhuji', '01-ji'].flatMap(c => Object.entries(content.chapters[c].scenes)));
  let n = 0;
  for (const sc of Object.values(scenes)) for (const e of sc.exits ?? []) {
    const to = scenes[e.next];
    if (!to?.story || !to.at || !sc.at || to.at === sc.at || content.chapters[to.chapter]?.corridor) continue;
    const s = { ...newState(content, 'zh', NOW), chapter: to.chapter, scene: to.id, place: sc.at, lang: 'zh', tell_owed: [`${sc.id}/${e.id}`, `scene/${to.id}`] };
    if (atScene(content, s)) continue; // a key beat carries him there itself
    n += 1;
    const t = tellOf(content, s);
    assert.ok(!t.tell.some(i => i.id === to.id), `${sc.id}/${e.id}: ${to.id} is not told at ${sc.at}`);
    assert.ok(t.keep.tell_owed.includes(`scene/${to.id}`), `${to.id} stays owed`);
    assert.ok(tellOf(content, { ...s, ...t.keep, place: to.at }).tell.some(i => i.id === to.id), `${to.id} told at ${to.at}`);
    assert.equal(owesTell(content, { ...s, ...t.keep }), false);
  }
  assert.ok(n > 3, `${n} steps walk to another place`);
});

test('a 回\'s 「完」 card speaks to 你 throughout — what he did and the teaser alike (scene cards say 你; the box plays the book in the third person)', () => {
  for (const id of ['00-waimen', '00-zhuji', '01-ji']) {
    const c = content.chapters[id].close;
    for (const part of [...(c.did ?? []), c.teaser].filter(Boolean)) {
      assert.doesNotMatch(part.zh, /沈小满|小满/, `${id}: ${part.zh}`);
      assert.doesNotMatch(part.en, /Xiaoman/, `${id}: ${part.en}`);
    }
  }
});
