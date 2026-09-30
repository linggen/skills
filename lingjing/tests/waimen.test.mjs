// 外门 — the book's 第五回 to 第八回 (story/jiuding-lu/05-第五回.md … 08-第八回.md; once 第一章 · 外门, then 第三回 until 卷一 was split into ten, 2026-09-30), as shipped: the prologue
// leads into it; five key beats lock the map and open it again; the area
// around 沉鼎观 is the whole map; 小狰 is the story's — a trial bout at the 药园,
// then the 萝卜 (2026-09-30); the 蛫 guards the 秘境 wall; the 大比's eve is a scene
// (wm-qianye) and no real day is waited; its three duels; 息壤 lifts the realm;
// the chapter ends on 「第九回 · 即将开放」.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { duel, look, move, quest, resolve, story, tame, task, trade, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { WORDS, bookPopHtml, cardHtml, duelTitle } from '../scripts/cards.js';
import { stageSlots } from '../scripts/stage.mjs';
import { TO_OPEN, walk } from './prologue.mjs';
import { huiLabel, huiOf } from '../scripts/rules/hui.mjs';

const content = loadContent();
const CH = content.chapters['00-waimen'];
const DAY1 = new Date('2026-09-29T09:00:00'), DAY2 = new Date('2026-09-30T10:00:00');
const ctx = (now = DAY1) => ({ now, quests: [] });

function must(fn, s, args, now = DAY1) {
  const out = fn(s, content, ctx(now), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}@${s.place}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
}
const refused = (fn, s, args, code, now = DAY1) => {
  const out = fn(s, content, ctx(now), args);
  assert.equal(out.result.refused, code, JSON.stringify(out.result).slice(0, 300));
  return out.result;
};
const fresh = (s) => ({ ...s, stamina: 100, stamina_at: DAY1.toISOString() });
/* The prologue walked to its end, as a boy or a girl. */
// The hero is fixed (沈小满, a boy — 2026-09-30): no name card on the way in.
const opened = (lang = 'zh') => fresh(walk(newState(content, lang, DAY1), TO_OPEN, content, DAY1));
const won = (s, id, now = DAY1) => ({ ...s, wins: { ...s.wins, [id]: now.toISOString() } });
/* A scene exit by its button — 小周天 first plays its 三关 board (the exit waits on it, 2026-09-30). */
function step(s, exit) {
  if (exit === 'breathe') { s = must(win, s, { id: 'zhoutian-sanguan' }); s = must(task, s, { action: 'done', id: 'zhoutian-sanguan' }); }
  return must(resolve, s, { exit });
}

/* The whole chapter, by its buttons and the page's own taps, with the threads done. */
function playThrough() {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = must(move, s, { place: 'waimen' });
  s = must(quest, s, { action: 'take', id: 'xu-yaoyuan-shouye' });
  s = must(move, s, { place: 'yaoyuan' });
  s = must(resolve, won(s, 'yaoyuan-zheng'), { exit: 'tame' });
  s = must(move, s, { place: 'chaifang' });
  s = must(quest, s, { action: 'take', id: 'xu-sun-charm' });
  s = must(win, s, { id: 'qiqiao' }); s = must(task, s, { action: 'done', id: 'qiqiao' });
  assert.ok(s.quests['xu-sun-charm'].done_at, 'the charm mended, the errand hands itself in');
  for (const exit of ['count', 'keep', 'swallow']) s = must(resolve, fresh(s), { exit, ...(exit === 'keep' ? { said: '你这饭桶' } : {}) });
  s = must(move, fresh(s), { place: 'waimen' });
  assert.ok(s.quests['xu-yaoyuan-shouye'].done_at, 'the watch hands itself in at 周衡');
  s = must(move, fresh(s), { place: 'shimen' });
  s = must(resolve, s, { exit: 'refuse' });
  s = must(win, s, { id: 'mijing-wall' }); s = must(task, s, { action: 'done', id: 'mijing-wall' });
  s = must(resolve, won(s, 'mijing-gui'), { exit: 'open' });
  for (const exit of ['go', 'swallow', 'rest']) s = must(resolve, s, { exit });
  s = must(move, fresh(s), { place: 'waimen' });
  s = must(resolve, fresh(s), { exit: 'sleep' });
  s = fresh(s);
  s = must(resolve, s, { exit: 'up' }, DAY2);
  s = must(resolve, s, { exit: 'fall' }, DAY2);
  s = must(resolve, s, { exit: 'on' }, DAY2);
  s = must(resolve, won(s, 'dabi-ma', DAY2), { exit: 'bark' }, DAY2);
  s = must(resolve, won(s, 'dabi-final', DAY2), { exit: 'final' }, DAY2);
  for (const exit of ['follow', 'sign', 'read', 'rest']) s = must(resolve, s, { exit }, DAY2);
  return s;
}

test('the prologue leads into 外门 — 卷一 · 第五回 — which sorts between it and 冀, and opens at 外门 with its title card', () => {
  const ids = Object.keys(content.chapters).sort();
  assert.deepEqual(ids.slice(0, 4), ['00-prologue', '00-waimen', '00-zhuji', '01-ji']);
  const s = opened();
  assert.equal(s.chapter, '00-waimen');
  assert.equal(s.scene, CH.first_scene);
  assert.equal(s.place, 'waimen');
  const l = look(s, content, ctx());
  assert.equal(l.chapter.title, huiLabel(content, 'h05', 'zh', 'head'));
  assert.match(l.chapter.title, /^卷一.* · 第五回　漏勺夜半通三关$/, 'the 回 as the book names it, never 章');
  assert.equal(l.chapter.hui, 'h05');
  // 第四回 ended where the scenes turned: its close stands on the first scene of 第五回, until a scene of it is passed.
  const h04 = huiOf(content, 'h04').huimu.zh;
  assert.deepEqual(l.chapter.close, { id: 'h04', title: '第四回 · 完', huimu: h04, next: l.chapter.title });
  const html = cardHtml({ card: 'closed' }, { look: l, lang: 'zh', words: WORDS.zh });
  assert.match(html, new RegExp(`第四回 · 完[\\s\\S]*${h04[0]}[\\s\\S]*${h04[1]}[\\s\\S]*第五回　漏勺夜半通三关[\\s\\S]*data-close-chapter="h04">合上`));
  assert.equal(stageSlots(l, l.stage).main[0].card, 'closed', 'before the scene card');
  assert.equal(look(must(resolve, s, { exit: 'owe' }), content, ctx()).chapter.close, undefined, 'gone once 第五回 is under way');
  assert.equal(look({ ...s, lang: 'en' }, content, ctx()).chapter.close.title, 'Chapter 4 · The End');
  assert.equal(l.chapter.fresh, true);
  assert.equal(l.scene.id, 'wm-ahe');
  assert.equal(l.scene.panel.art, undefined, 'a story moment is not illustrated: the caption and the choices stand alone');
  assert.ok(l.scene.panel.caption.length >= 2 && l.scene.panel.taps.length >= 1);
  assert.equal(story(s, content, ctx()).result.cauldrons.length, 9, 'no cauldron in it: the nine are still the nine');
});

test('every scene is reached, and the chapter ends straight into 第九回 (筑基, built 2026-09-30)', () => {
  for (const gender of ['male']) {
    const s = playThrough();
    assert.ok(s.ended.includes('00-waimen'), gender);
    assert.deepEqual([s.chapter, s.scene], ['00-zhuji', '09-snow'], 'nothing waits: 第九回 opens at once');
    const passed = new Set(s.done_scenes);
    for (const id of Object.keys(CH.scenes)) assert.ok(passed.has(id), `${gender}: ${id}`);
    assert.equal(look(s, content, ctx(DAY2)).chapter.hui, 'h09');
    assert.deepEqual([s.tier, s.step], ['qi', 4], '息壤: 练气五层');
    for (const item of ['danlu', 'foundation-pill', 'huangting', 'heluo']) assert.ok(s.bag[item] > 0, item);
    assert.ok(s.cast.includes('zheng') && s.cards.includes('zheng'), '小狰 walks with the player, its card in the deck');
    assert.ok(s.ledger.some(e => e.who === 'sunergou' && e.kind === '恩'), 'the round given away is in the 恩仇簿');
    assert.ok(s.ledger.some(e => e.who === 'qulao' && e.kind === '恩'));
  }
});

test('a scene nobody can reach, or a beat naming a stranger, does not ship: every scene lies on the way from the first', () => {
  const seen = new Set(), todo = [CH.first_scene];
  while (todo.length) {
    const id = todo.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of CH.scenes[id].exits) if (e.next) todo.push(e.next);
  }
  assert.deepEqual([...seen].sort(), Object.keys(CH.scenes).sort());
  assert.equal(Object.keys(CH.scenes).length, 23);
  for (const b of CH.beats) for (const id of b.scenes) assert.ok(CH.scenes[id], id);
  for (const sc of Object.values(CH.scenes)) assert.ok(CH.map.places.includes(sc.at), `${sc.id} at ${sc.at}`);
});

test('a key beat shuts the map from the scene after its entry to its last, in its own words; between beats the area is open', () => {
  let s = opened();
  assert.equal(look(s, content, ctx()).lock, undefined, 'the entry is a waypoint: nothing is shut yet');
  s = must(resolve, s, { exit: 'owe' });
  const l = look(s, content, ctx());
  assert.deepEqual(l.lock, { beat: 'rumen', title: '入门第一课' });
  assert.equal(s.place, 'jiangtang', 'the beat carries the player to its scene');
  assert.equal(l.director.corridor, true, 'the stage keeps the roads off');
  const r = refused(move, s, { place: 'waimen' }, 'corridor');
  assert.equal(r.beat, 'rumen');
  assert.equal(r.say, CH.beats[0].say.zh);
  for (const exit of ['can', 'breathe', 'hide']) s = step(s, exit);
  assert.equal(look(s, content, ctx()).lock, undefined, 'the beat over, the map opens');
  assert.equal(must(move, s, { place: 'waimen' }).place, 'waimen');
  // the next beat waits at its place, a waypoint with the goal's countdown before it
  // 小狰 first (十月初十): the story carries him to the 药园; then the next beat waits at its place
  assert.deepEqual([s.scene, s.place], ['wm-yaoyuan', 'yaoyuan']);
  s = must(resolve, won(s, 'yaoyuan-zheng'), { exit: 'tame' });
  const w = look(s, content, ctx()).waypoint;
  assert.equal(w.scene, 'wm-chaifang');
  assert.equal(w.text, '外门大比 · 腊月初八。路通向沉鼎观 · 柴房。');
});

test('the map is the area around 沉鼎观: the rest of 徐 and the eight provinces refuse with one line and stand greyed', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  for (const far of ['pengcheng', 'yunlong', 'shiao', 'ye', 'leize']) {
    const r = refused(move, s, { place: far }, 'road-closed');
    assert.equal(r.say, CH.map.say.zh, far);
  }
  const l = look(must(move, s, { place: 'waimen' }), content, ctx());
  assert.ok(l.place.places.find(p => p.id === 'pengcheng').closed, 'greyed on the map');
  assert.equal(l.place.places.find(p => p.id === 'jiangtang').closed, undefined);
  assert.ok(!l.director.near.some(p => !CH.map.places.includes(p.id)), 'no road offered past it');
  // the English line too
  const en = { ...s, lang: 'en' };
  assert.equal(refused(move, en, { place: 'pengcheng' }, 'road-closed').say, CH.map.say.en);
});

test('the chapter ended, 第九回 keeps the same mountain on its own map; a save already further along keeps the whole world', () => {
  const done = playThrough();
  const zj = content.chapters['00-zhuji'];
  assert.deepEqual(zj.map.places, CH.map.places, 'the year is spent on the same mountain');
  assert.equal(refused(move, done, { place: 'pengcheng' }, 'road-closed', DAY2).say, zj.map.say.zh);
  // an older save standing in 02-yan: no chapter map, every province it had
  const later = { ...opened(), chapter: '02-yan', scene: null, place: 'pengcheng', ended: ['00-prologue', '01-ji'], tier: 'core' };
  const l = look(later, content, ctx());
  assert.equal(l.place.places.some(p => p.closed), false);
  assert.equal(must(move, later, { place: 'sishui' }).place, 'sishui');
});

test('小狰 is the story\'s: at the 药园 a trial bout with 狰, fought again at once, then the 萝卜 — it walks with him, and the 守夜 hands itself in at 周衡 (2026-09-30)', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  assert.equal(s.scene, 'wm-yaoyuan');
  s = must(move, s, { place: 'yaoyuan' });
  const l = look(s, content, ctx());
  const e = l.scene.exits.find(x => x.id === 'tame');
  assert.deepEqual([e.game.kind, e.game.creature, e.game.retry], ['duel', 'zheng', true]);
  refused(resolve, s, { exit: 'tame' }, 'game-not-won');
  s = must(resolve, won(s, 'yaoyuan-zheng'), { exit: 'tame' });
  assert.ok(s.cast.includes('zheng') && s.cards.includes('zheng'), 'it walks with him, its card in the deck');
  assert.equal(s.scene, 'wm-chaifang');
  assert.match(tellOf(content, s).tell.map(t => t.text).join('\n'), /萝卜[\s\S]*睡着了/, 'the book\'s passage: the 萝卜, and it sleeps at his feet');
  assert.equal(content.creatures.creatures.find(c => c.id === 'zheng').art, 'art/creatures/zheng.webp');
});

test('the 大比\'s eve is a scene, not a real day: 周衡\'s notice, 大比前夜, then the contest at once — and its three duels', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = must(move, s, { place: 'yaoyuan' });
  s = must(resolve, won(s, 'yaoyuan-zheng'), { exit: 'tame' });
  s = must(move, fresh(s), { place: 'chaifang' });
  for (const exit of ['count', 'keep', 'swallow']) s = must(resolve, fresh(s), { exit, ...(exit === 'keep' ? { said: '你这饭桶' } : {}) });
  s = must(move, fresh(s), { place: 'shimen' });
  s = must(resolve, s, { exit: 'refuse' });
  s = must(win, s, { id: 'mijing-wall' }); s = must(task, s, { action: 'done', id: 'mijing-wall' });
  refused(resolve, s, { exit: 'open' }, 'game-not-won');
  s = must(resolve, won(s, 'mijing-gui'), { exit: 'open' });
  for (const exit of ['go', 'swallow', 'rest']) s = must(resolve, s, { exit });
  assert.equal(s.scene, 'wm-qianye');
  assert.equal(look(s, content, ctx(DAY1)).waypoint.text, '外门大比 · 明日。路通向沉鼎观 · 外门。');
  s = must(move, fresh(s), { place: 'waimen' });
  assert.match(look(s, content, ctx()).scene.setup ?? JSON.stringify(look(s, content, ctx()).scene), /传/, 'the eve carries its rumour');
  s = must(resolve, fresh(s), { exit: 'sleep' });
  s = must(resolve, s, { exit: 'up' }, DAY1);
  // without 孙二狗's charm the round is fought: no giving it away the story never set up
  const l = look(s, content, ctx(DAY2));
  assert.deepEqual(l.scene.buttons.map(b => b.id), ['fight']);
  refused(resolve, s, { exit: 'fall' }, 'needs', DAY2);
  assert.equal(l.scene.exits.find(e => e.id === 'fight').duel.creature.name, '孙二狗');
  // three duels on this path: 孙二狗, 马小宝, the senior — each a trial fought again at once
  for (const [exit, game, foe] of [['fight', 'dabi-sun', 'foe-sunergou'], ['bark', 'dabi-ma', 'foe-maxiaobao'], ['final', 'dabi-final', 'foe-shijie']]) {
    const sc = look(s, content, ctx(DAY2)).scene;
    const e = sc.exits.find(x => x.id === exit);
    assert.equal(e.game.creature, foe);
    assert.equal(e.game.retry, true);
    refused(resolve, s, { exit }, 'game-not-won', DAY2);
    s = must(resolve, won(s, game, DAY2), { exit }, DAY2);
  }
  assert.equal(s.scene, 'wm-baishi');
  assert.ok(s.bag['foundation-pill'] > 0, '筑基丹');
});

test('息壤 lifts the realm to 练气五层 — once, never down, and a scene played again lifts nothing', () => {
  const sc = CH.scenes['wm-xirang'];
  assert.equal(sc.exits[0].rise, 5);
  let s = { ...opened(), scene: 'wm-xirang', place: 'shimen', done_scenes: ['wm-ahe'] };
  s = must(resolve, s, { exit: 'swallow' });
  assert.deepEqual([s.tier, s.step, s.progress], ['qi', 4, 0]);
  const high = must(resolve, { ...opened(), scene: 'wm-xirang', place: 'shimen', step: 6, progress: 30 }, { exit: 'swallow' });
  assert.deepEqual([high.step, high.progress], [6, 30], 'never down');
});

test('the woodshed is his (the boy\'s: 抱住了头, 血腥味) — the words around the hero are fixed; an old save named a girl reads the same', () => {
  const at = (gender) => {
    let s = { ...opened(), gender };
    for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
    s = must(move, s, { place: 'yaoyuan' });
    s = must(resolve, won(s, 'yaoyuan-zheng'), { exit: 'tame' });
    s = must(move, fresh(s), { place: 'chaifang' });
    s = must(resolve, fresh(s), { exit: 'count' });
    return tellOf(content, s).tell.map(t => t.text).join('\n');
  };
  const his = at('male'), old = at('female');
  assert.ok(his.includes('抱住了头') && his.includes('血腥味') && !his.includes('猪圈'));
  assert.equal(old, his, 'a card-named girl save reads his words');
  assert.doesNotMatch(his, /\{[^}]*\}/, 'every word filled');
});

test('阿禾 walks with him, a girl, and 周衡 calls him 师弟', () => {
  const l = look(opened(), content, ctx());
  assert.equal(l.scene.people.find(p => p.id === 'ahe').name, '阿禾');
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = must(move, s, { place: 'waimen' });
  const offer = look(s, content, ctx()).offers.find(o => o.id === 'xu-yaoyuan-shouye');
  assert.ok(offer.say.startsWith('师弟。'), offer.say);
});

test('the scratch fixture for live checks stands at the chapter\'s first scene (tests/fixtures/saves/waimen.json, ?save=test&seed=waimen)', async () => {
  const fs = await import('node:fs');
  const s = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
  assert.deepEqual([s.chapter, s.scene, s.place, s.name, s.gender], ['00-waimen', 'wm-ahe', 'waimen', '沈小满', 'male']);
  assert.ok(s.ended.includes('00-prologue'));
  assert.equal(look(s, content, ctx()).scene.id, 'wm-ahe');
});

test('the 大比 is a 比试, not a 降妖: its three foes are people, and the fight card says so; a beast stays 降妖 (live, 2026-09-29)', () => {
  const s = { ...opened(), scene: 'wm-lun2', place: 'zhengdian' };
  const l = look(s, content, ctx());
  const exit = l.scene.exits.find(e => e.id === 'bark');
  assert.equal(exit.duel.creature.person, true);
  const html = cardHtml({ card: 'duel', id: 'dabi-ma' }, { look: l, lang: 'zh', words: WORDS.zh, content: {}, artBase: '' });
  assert.match(html, /比试/);
  assert.doesNotMatch(html, /降妖/);
  assert.equal(duelTitle({ id: 'zheng' }, WORDS.zh), '降妖');
  assert.equal(duelTitle({ id: 'foe-shijie', person: true }, WORDS.en), 'Bout');
});

test('a scene waiting on a game stands with it: the round fight and the wall 洛书 sit under the scene card, never behind 还有 1 件 (live, 2026-09-29)', () => {
  const kinds = slots => slots.main.map(c => `${c.card}:${c.id ?? ''}`);
  for (const [scene, place, game, before] of [['wm-lun2', 'zhengdian', 'duel:dabi-ma', 'wm-dabi'], ['wm-lun1', 'zhengdian', 'duel:dabi-sun', 'wm-dabi'], ['wm-juesai', 'zhengdian', 'duel:dabi-final', 'wm-dabi'], ['wm-wangzuo', 'shimen', 'board:mijing-wall', 'wm-mijing']]) {
    const s = { ...opened(), scene, place, tasks: {} };
    s.done_scenes = [...s.done_scenes, 'wm-ahe', before]; // its 回 under way: no close of the 回 before stands over the scene
    const l = look(s, content, ctx());
    const main = kinds(stageSlots(l, l.stage));
    assert.ok(main.includes('panel:'), scene);
    assert.ok(main.includes(game), `${scene}: ${main.join(' ')} · ${JSON.stringify(l.stage)}`);
  }
});

test('what is for a person is handed where that person is: 周衡 at 外门, 阿禾 at 坊市 — elsewhere the rules refuse in-world and the book shows the way (his, 2026-09-29)', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = must(move, s, { place: 'waimen' });
  s = must(quest, s, { action: 'take', id: 'xu-yaoyuan-shouye' });
  s = must(move, s, { place: 'yaoyuan' });
  s = must(resolve, won(s, 'yaoyuan-zheng'), { exit: 'tame' });
  assert.equal(s.quests['xu-yaoyuan-shouye'].done_at, undefined, 'tamed at the 药园: 周衡 is not here');
  const row = look(s, content, ctx()).book.find(b => b.id === 'xu-yaoyuan-shouye');
  assert.equal(row.ready, true);
  assert.equal(row.away.who, '周衡');
  assert.match(row.where.name, /外门/);
  const pop = bookPopHtml({ look: look(s, content, ctx()), lang: 'zh', words: WORDS.zh });
  assert.match(pop, /交给周衡/, 'the row names who it is for');
  assert.match(pop, /在沉鼎观 · 外门/, 'and where');
  assert.doesNotMatch(pop, /data-do="turn"[^>]*xu-yaoyuan-shouye/, 'no 交差 away from him');
  const no = refused(quest, s, { action: 'turn', id: 'xu-yaoyuan-shouye' }, 'not-with-giver');
  assert.match(no.say, /周衡/);
  assert.match(no.say, /外门/);
  const wealth = s.wealth;
  s = must(move, fresh(s), { place: 'waimen' });
  assert.ok(s.quests['xu-yaoyuan-shouye'].done_at, 'at 外门 it hands itself in');
  assert.ok(s.wealth >= wealth + 10);
  // 阿禾's interest: a carry, handed by his tap — at 坊市 only
  s = must(move, s, { place: 'fangshi' });
  s = must(quest, s, { action: 'take', id: 'xu-ahe-lixi' });
  s = { ...s, bag: { ...s.bag, luobo: 2 } };
  s = must(move, fresh(s), { place: 'dukou' });
  const ahe = look(s, content, ctx()).book.find(b => b.id === 'xu-ahe-lixi');
  assert.equal(ahe.ready, true);
  assert.equal(ahe.away.who, '阿禾');
  assert.match(ahe.where.name, /坊市/);
  assert.match(refused(quest, s, { action: 'turn', id: 'xu-ahe-lixi' }, 'not-with-giver').say, /阿禾在.*坊市/);
  s = must(move, fresh(s), { place: 'fangshi' });
  s = must(quest, s, { action: 'turn', id: 'xu-ahe-lixi' });
  assert.ok(s.quests['xu-ahe-lixi'].done_at);
  assert.ok(s.bag.talisman > 0, 'the 符 for the 大比');
});

test('a bout with a person speaks of him or her: 他/她 by the person, 认输, 「今日已比过」, 「他退了下去」 — never 妖, 它 or 今日已降 (his, 2026-09-29)', async () => {
  const { WORDS: BW, boutWords, sayEffect, challengeHtml } = await import('../scripts/battle-card.js');
  const l = look({ ...opened(), scene: 'wm-lun2', place: 'zhengdian' }, content, ctx());
  const ma = l.scene.exits.find(e => e.id === 'bark').duel.creature;
  assert.equal(ma.gender, 'male');
  const w = boutWords(BW.zh, ma, 'zh');
  for (const k of ['theirs', 'withdrew', 'wonSay', 'withdrewSay', 'pickCard', 'pickRank', 'pickTarget', 'wonToday', 'lostToday', 'spentToday']) {
    assert.doesNotMatch(w[k], /妖|它|今日已降|雾/, `${k}: ${w[k]}`);
  }
  assert.equal(w.wonSay, '他退了下去。');
  assert.equal(w.wonToday, '今日已比过');
  assert.equal(boutWords(BW.zh, { person: true, gender: 'female' }, 'zh').theirs, '她的阵前');
  assert.equal(boutWords(BW.zh, { person: true }, 'zh').theirs, '对方的阵前', 'no gender said: 对方');
  assert.equal(boutWords(BW.en, { person: true, gender: 'female' }, 'en').wonSay, 'She steps down.');
  assert.equal(boutWords(BW.zh, { id: 'zheng' }, 'zh'), BW.zh, 'a beast keeps its words');
  assert.match(sayEffect({ effect: { sweep: 2 } }, { lang: 'zh', words: w }), /^他阵前每个 2 点/);
  assert.match(sayEffect({ effect: { sweep: 2 } }, { lang: 'zh', words: BW.zh }), /^它阵前/);
  const done = challengeHtml({ id: 'dabi-ma', creature: ma, today: { outcome: 'won' } }, { lang: 'zh', words: w, title: '比试' });
  assert.match(done, /今日已比过/);
  const shijie = look({ ...opened(), scene: 'wm-juesai', place: 'zhengdian' }, content, ctx()).scene.exits.find(e => e.id === 'final').duel.creature;
  assert.equal(shijie.gender, 'female');
});

test('息壤 keeps his 修为 through the jump, and its moment is the five doors opening one by one, in ink (his, 2026-09-29)', async () => {
  const { doorsHtml } = await import('../scripts/doors.js');
  const { MAIN, CARD_KINDS, PAGE_OWNS } = await import('../scripts/stage.mjs');
  const out = resolve({ ...opened(), scene: 'wm-xirang', place: 'shimen', step: 1, progress: 33 }, content, ctx(), { exit: 'swallow' });
  assert.deepEqual([out.state.step, out.state.progress], [4, 33], 'the 修为 goes with him');
  const capped = resolve({ ...opened(), scene: 'wm-xirang', place: 'shimen', step: 3, progress: 79 }, content, ctx(), { exit: 'swallow' }).state;
  assert.ok(capped.progress < content.ladder.tiers[0].thresholds[4], 'short of the new layer: it never jumps twice');
  const node = out.result.node;
  assert.deepEqual(node.doors.map(d => d.el), ['metal', 'wood', 'water', 'fire', 'earth']);
  assert.ok(node.doors.every(d => d.line.startsWith('第')));
  assert.equal(node.rose.to, '练气五层');
  const html = doorsHtml(node, { lang: 'zh' });
  assert.equal((html.match(/class="seal"/g) ?? []).length, 5);
  assert.match(html, /五门俱开[\s\S]*金[\s\S]*木[\s\S]*水[\s\S]*火[\s\S]*土[\s\S]*练气五层/);
  assert.match(html, /style="--i:4"/, 'each door its turn');
  assert.match(doorsHtml(node, { still: true }), /class="card doors still"/, 'reduced motion: the last frame');
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}|color:/i, 'ink only: no colour in the moment');
  assert.equal(doorsHtml({}, {}), '');
  assert.equal(CARD_KINDS.doors.holds, true);
  assert.ok(PAGE_OWNS.has('doors'));
  assert.ok(MAIN.findIndex(r => r.kinds.includes('doors')) < MAIN.findIndex(r => r.kinds.includes('panel')), 'before the next scene card');
  assert.equal(stageSlots({}, [{ card: 'panel' }, { card: 'doors' }]).main[0].card, 'doors');
});

test('外门 ends on its card: 「第八回 · 完」, what this player did, the next teaser in the book\'s voice — standing on 第九回\'s first scene (his, 2026-09-29; 回 renumbered and 第九回 built 2026-09-30)', () => {
  const s = playThrough();
  const l = look(s, content, ctx(DAY2));
  const close = l.chapter.close;
  assert.equal(close.title, '第八回 · 完');
  assert.equal(close.id, 'h08', 'put away once, as the 回 it closes');
  assert.equal(close.did, '你收了药园那只偷萝卜的小狰，大比把第一轮让给了孙二狗，终究赢下了那颗筑基丹，又拜了扫了五十年台阶的瞿老为师。');
  assert.match(close.teaser, /头场雪[\s\S]*玉盒子/);
  assert.ok(l.stage.some(c => c.card === 'closed'), 'on the stage');
  assert.equal(stageSlots(l, l.stage).main[0].card, 'closed', 'first on the stage, before an errand offered where he stands');
  const html = cardHtml({ card: 'closed' }, { look: l, lang: 'zh', words: WORDS.zh });
  assert.match(html, /第八回 · 完[\s\S]*小狰[\s\S]*头场雪[\s\S]*data-close-chapter="h08">合上/);
  // another player's chapter reads his own: no 狰, and the first round fought
  const other = { ...s, cast: s.cast.filter(id => id !== 'zheng'), ledger: s.ledger.filter(e => e.who !== 'sunergou') };
  assert.match(look(other, content, ctx(DAY2)).chapter.close.did, /^药园的贼，你没收成，大比一轮一轮打了上去，/);
  assert.match(look({ ...s, lang: 'en' }, content, ctx(DAY2)).chapter.close.did, /^You took in the little Zheng/);
  // before the end: no card (a scene of 第五回 passed, so not 第四回's either)
  assert.equal(look(must(resolve, opened(), { exit: 'owe' }), content, ctx()).chapter.close, undefined);
});

test('a first-appearance 图鉴 card beside the scene card is compact — a small picture, one line, a tap to open it big — so the choices stay on screen (his, 2026-09-29)', async () => {
  const fs = await import('node:fs');
  const { codexOf } = await import('../scripts/codex.js');
  const json = (f) => JSON.parse(fs.readFileSync(new URL(`../worlds/jiuding/${f}`, import.meta.url), 'utf8'));
  const codex = codexOf({ codex: json('codex.json'), people: json('people.json'), creatures: json('creatures.json'), items: json('items.json'), arts: json('arts.json') });
  const l = look(opened(), content, ctx());
  assert.deepEqual(l.scene.meet, ['sunergou']);
  const c = { look: l, lang: 'zh', words: WORDS.zh, codex };
  const html = cardHtml({ card: 'meet', id: 'sunergou' }, c);
  assert.match(html, /^<div class="card codexwrap compact"><button class="codexcompact" data-codex-big="sunergou"/);
  assert.match(html, /<b>孙二狗<\/b><i>人物<\/i><span>外门弟子/);
  assert.doesNotMatch(html, /<figcaption>/, 'not the full card');
  // Ling's Show, or a meet with no scene card under it: the full card
  assert.match(cardHtml({ card: 'codex', id: 'sunergou' }, c), /class="codexcard"/);
  assert.match(cardHtml({ card: 'meet', id: 'sunergou' }, { ...c, look: { ...l, scene: { ...l.scene, panel: null } } }), /class="codexcard first"/);
  const css = fs.readFileSync(new URL('../scripts/codex.css', import.meta.url), 'utf8');
  assert.match(css, /\.codexcompact \.cpic \{[^}]*height: 76px/, 'the picture is small');
  const js = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(js, /\['\[data-codex-big\]', \(el\) => openCodexBig/);
});

test('the walk map never pops over a scene card on arrival (his, 2026-09-29)', async () => {
  const fs = await import('node:fs');
  const js = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const watch = js.slice(js.indexOf('function watchTravel()'), js.indexOf('function playTravel('));
  assert.match(watch, /if \(!prev \|\| prev\.id === p\.id \|\| bout \|\| look\.scene\?\.panel\) return;/);
});

test('the doors keep playing through the stage\'s redraws: each draw starts the animation as far in as it has run', async () => {
  const { doorsHtml } = await import('../scripts/doors.js');
  assert.match(doorsHtml({ doors: [{ el: 'metal', line: '金' }] }, { age: 2345.6 }), /--age:2346ms/);
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  assert.equal((css.match(/- var\(--age, 0ms\)\)/g) ?? []).length, 3);
});
