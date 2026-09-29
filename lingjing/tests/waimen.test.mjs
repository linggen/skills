// 第一章 · 外门 (story/huxian-bing/02-第一章·外门.md), as shipped: the prologue
// leads into it; five key beats lock the map and open it again; the area
// around 沉鼎观 is the whole map; 狰 is caught at the 药园 and never fought; the
// 大比 waits a real day and its three duels; 息壤 lifts the realm; the chapter
// ends on 「第二章 · 即将开放」. Both heroes walk it, and the girl's woodshed is hers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { duel, look, move, quest, resolve, story, tame, task, trade, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { WORDS, bookPopHtml, cardHtml, duelTitle } from '../scripts/cards.js';
import { stageSlots } from '../scripts/stage.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

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
const opened = (gender = 'female', lang = 'zh') => fresh(walk(newState(content, lang, DAY1),
  TO_OPEN.map(([v, a]) => [v, a.exit === 'name' ? { ...a, gender } : a]), content, DAY1));
const won = (s, id, now = DAY1) => ({ ...s, wins: { ...s.wins, [id]: now.toISOString() } });

/* The whole chapter, by its buttons and the page's own taps, with the threads done. */
function playThrough(gender) {
  let s = opened(gender);
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
  s = must(move, s, { place: 'waimen' });
  s = must(quest, s, { action: 'take', id: 'xu-yaoyuan-shouye' });
  s = must(move, s, { place: 'chaifang' });
  s = must(quest, s, { action: 'take', id: 'xu-sun-charm' });
  s = must(win, s, { id: 'qiqiao' }); s = must(task, s, { action: 'done', id: 'qiqiao' });
  assert.ok(s.quests['xu-sun-charm'].done_at, 'the charm mended, the errand hands itself in');
  for (const exit of ['count', 'keep', 'swallow']) s = must(resolve, fresh(s), { exit, ...(exit === 'keep' ? { said: '你这饭桶' } : {}) });
  s = must(move, s, { place: 'fangshi' });
  s = must(trade, { ...s, wealth: Math.max(s.wealth, 5) }, { action: 'buy', id: 'luobo' });
  s = must(trade, s, { action: 'buy', id: 'luobo' });
  s = must(move, s, { place: 'yaoyuan' });
  s = must(win, s, { id: 'shouye' }); s = must(task, s, { action: 'done', id: 'shouye' });
  s = must(tame, s, { creature: 'zheng' });
  s = must(move, fresh(s), { place: 'shimen' });
  s = must(resolve, s, { exit: 'refuse' });
  s = must(win, s, { id: 'mijing-wall' }); s = must(task, s, { action: 'done', id: 'mijing-wall' });
  for (const exit of ['open', 'go', 'swallow', 'rest']) s = must(resolve, s, { exit });
  s = must(move, s, { place: 'zhengdian' });
  s = fresh(s);
  s = must(resolve, s, { exit: 'up' }, DAY2);
  s = must(resolve, s, { exit: 'fall' }, DAY2);
  s = must(resolve, s, { exit: 'on' }, DAY2);
  s = must(resolve, won(s, 'dabi-ma', DAY2), { exit: 'bark' }, DAY2);
  s = must(resolve, won(s, 'dabi-final', DAY2), { exit: 'final' }, DAY2);
  for (const exit of ['follow', 'sign', 'read', 'rest']) s = must(resolve, s, { exit }, DAY2);
  return s;
}

test('the prologue leads into 第一章 · 外门, which sorts between it and 冀, and opens at 外门 with its title card', () => {
  const ids = Object.keys(content.chapters).sort();
  assert.deepEqual(ids.slice(0, 3), ['00-prologue', '00-waimen', '01-ji']);
  const s = opened();
  assert.equal(s.chapter, '00-waimen');
  assert.equal(s.scene, CH.first_scene);
  assert.equal(s.place, 'waimen');
  const l = look(s, content, ctx());
  assert.equal(l.chapter.title, '第一章 · 外门');
  assert.equal(l.chapter.fresh, true);
  assert.equal(l.scene.id, 'wm-ahe');
  assert.equal(l.scene.panel.art, undefined, 'a story moment is not illustrated: the caption and the choices stand alone');
  assert.ok(l.scene.panel.caption.length >= 2 && l.scene.panel.taps.length >= 1);
  assert.equal(story(s, content, ctx()).result.cauldrons.length, 9, 'no cauldron in it: the nine are still the nine');
});

test('every scene is reached, and the chapter ends on 「第二章 · 即将开放」, for a boy and for a girl', () => {
  for (const gender of ['male', 'female']) {
    const s = playThrough(gender);
    assert.ok(s.ended.includes('00-waimen'), gender);
    assert.equal(s.scene, null);
    assert.equal(s.chapter, '00-waimen', 'waiting: the next chapter is still being written');
    const passed = new Set(s.done_scenes);
    for (const id of Object.keys(CH.scenes)) assert.ok(passed.has(id), `${gender}: ${id}`);
    assert.equal(look(s, content, ctx(DAY2)).waypoint.text, '第二章 · 即将开放');
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
  assert.equal(Object.keys(CH.scenes).length, 21);
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
  for (const exit of ['can', 'breathe', 'hide']) s = must(resolve, s, { exit });
  assert.equal(look(s, content, ctx()).lock, undefined, 'the beat over, the map opens');
  assert.equal(must(move, s, { place: 'waimen' }).place, 'waimen');
  // the next beat waits at its place, a waypoint with the goal's countdown before it
  const w = look(s, content, ctx()).waypoint;
  assert.equal(w.scene, 'wm-chaifang');
  assert.equal(w.text, '外门大比 · 腊月初八。路通向沉鼎观 · 柴房。');
});

test('the map is the area around 沉鼎观: the rest of 徐 and the eight provinces refuse with one line and stand greyed', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
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

test('the chapter ended, the map holds while 第二章 is being written; a save already further along keeps the whole world', () => {
  const done = playThrough('female');
  assert.equal(refused(move, done, { place: 'pengcheng' }, 'road-closed', DAY2).say, CH.map.say.zh);
  // an older save standing in 02-yan: no chapter map, every province it had
  const later = { ...opened(), chapter: '02-yan', scene: null, place: 'pengcheng', ended: ['00-prologue', '01-ji'], tier: 'core' };
  const l = look(later, content, ctx());
  assert.equal(l.place.places.some(p => p.closed), false);
  assert.equal(must(move, later, { place: 'sishui' }).place, 'sishui');
});

test('the 守夜 and the tame: 狰 runs from a fight, yields to the watch won, and eats the 萝卜', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
  s = must(move, s, { place: 'yaoyuan' });
  const l = look(s, content, ctx());
  assert.equal(l.place.encounter.creature.id, 'zheng');
  assert.equal(l.place.encounter.catch, 'shouye');
  assert.ok(l.tasks.some(t => t.id === 'shouye' && t.game === 'shouye' && t.status === 'offered'), 'the watch stands on the stage as a board');
  assert.ok(l.stage.some(c => c.card === 'board' && c.id === 'shouye'));
  const ran = refused(duel, s, { id: 'haunt:zheng' }, 'runs');
  assert.match(ran.say, /打什么打/);
  refused(tame, s, { creature: 'zheng' }, 'not-beaten');
  s = must(win, s, { id: 'shouye' });
  s = must(task, s, { action: 'done', id: 'shouye' });
  assert.equal(look(s, content, ctx()).place.encounter.beaten, true);
  assert.equal(look(s, content, ctx()).tasks.some(t => t.id === 'shouye' && t.status !== 'done'), false, 'caught once, the board is gone');
  assert.ok(!look(s, content, ctx()).stage.some(c => c.card === 'duel'), 'caught, its 出手 is gone: the creature card offers 收服');
  assert.ok(look(s, content, ctx()).stage.some(c => c.card === 'creature' && c.id === 'zheng'));
  refused(tame, s, { creature: 'zheng' }, 'needs-item');
  s = must(tame, { ...s, bag: { ...s.bag, luobo: 1 } }, { creature: 'zheng' });
  assert.ok(s.cast.includes('zheng'));
  assert.equal(s.bag.luobo, undefined, 'the 萝卜 eaten');
  // never a bounty, a road beast or a rumor's finale
  assert.equal(content.creatures.creatures.find(c => c.id === 'zheng').art, 'art/zheng.webp');
});

test('the 大比 waits a real day: the goal line counts down, the first round refuses today, and 明日 comes', () => {
  let s = opened('male');
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
  s = must(move, s, { place: 'chaifang' });
  for (const exit of ['count', 'keep', 'swallow']) s = must(resolve, fresh(s), { exit, ...(exit === 'keep' ? { said: '你这饭桶' } : {}) });
  s = must(move, fresh(s), { place: 'shimen' });
  s = must(resolve, s, { exit: 'refuse' });
  s = must(win, s, { id: 'mijing-wall' }); s = must(task, s, { action: 'done', id: 'mijing-wall' });
  for (const exit of ['open', 'go', 'swallow', 'rest']) s = must(resolve, s, { exit });
  assert.equal(look(s, content, ctx(DAY1)).waypoint.text, '外门大比 · 明日。路通向沉鼎观 · 正殿。');
  s = must(move, fresh(s), { place: 'zhengdian' });
  const r = refused(resolve, s, { exit: 'up' }, 'needs', DAY1);
  assert.match(r.say, /明日/);
  assert.equal(look({ ...s, place: 'dukou' }, content, ctx(DAY2)).waypoint.text, '外门大比 · 今日。路通向沉鼎观 · 正殿。');
  s = must(resolve, s, { exit: 'up' }, DAY2);
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

test('the girl\'s woodshed is hers (the 猪圈), the boy\'s is his — and the words around the hero follow the name card', () => {
  const at = (gender) => {
    let s = opened(gender);
    for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
    s = must(move, s, { place: 'chaifang' });
    s = must(resolve, s, { exit: 'count' });
    return tellOf(content, s).tell.map(t => t.text).join('\n');
  };
  const girl = at('female'), boy = at('male');
  assert.ok(girl.includes('猪圈') && girl.includes('打姑娘'));
  assert.ok(!girl.includes('抱住了头'));
  assert.ok(boy.includes('抱住了头') && !boy.includes('猪圈'));
  assert.ok(girl.includes('泥腥味') && boy.includes('血腥味'));
  for (const text of [girl, boy]) assert.doesNotMatch(text, /\{[^}]*\}/, 'every word filled');
});

test('阿禾 walks with every hero as the other gender, and 周衡 calls a girl 师妹', () => {
  const girl = look(opened('female'), content, ctx());
  const boy = look(opened('male'), content, ctx());
  assert.equal(girl.scene.people.find(p => p.id === 'ahe').name, '阿禾');
  let s = opened('female');
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
  s = must(move, s, { place: 'waimen' });
  const offer = look(s, content, ctx()).offers.find(o => o.id === 'xu-yaoyuan-shouye');
  assert.ok(offer.say.startsWith('师妹。'), offer.say);
  assert.ok(boy.scene.people.some(p => p.id === 'ahe'));
});

test('the scratch fixture for live checks stands at the chapter\'s first scene (tests/fixtures/saves/waimen.json, ?save=test&seed=waimen)', async () => {
  const fs = await import('node:fs');
  const s = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/waimen.json', import.meta.url), 'utf8'));
  assert.deepEqual([s.chapter, s.scene, s.place, s.gender], ['00-waimen', 'wm-ahe', 'waimen', 'female']);
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
  for (const [scene, place, game] of [['wm-lun2', 'zhengdian', 'duel:dabi-ma'], ['wm-lun1', 'zhengdian', 'duel:dabi-sun'], ['wm-juesai', 'zhengdian', 'duel:dabi-final'], ['wm-wangzuo', 'shimen', 'board:mijing-wall']]) {
    const s = { ...opened(), scene, place, tasks: {} };
    const l = look(s, content, ctx());
    const main = kinds(stageSlots(l, l.stage));
    assert.ok(main.includes('panel:'), scene);
    assert.ok(main.includes(game), `${scene}: ${main.join(' ')} · ${JSON.stringify(l.stage)}`);
  }
});

test('what is for a person is handed where that person is: 周衡 at 外门, 阿禾 at 坊市 — elsewhere the rules refuse in-world and the book shows the way (his, 2026-09-29)', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = must(resolve, s, { exit });
  s = must(move, s, { place: 'waimen' });
  s = must(quest, s, { action: 'take', id: 'xu-yaoyuan-shouye' });
  s = must(move, s, { place: 'yaoyuan' });
  s = must(win, s, { id: 'shouye' }); s = must(task, s, { action: 'done', id: 'shouye' });
  s = must(tame, { ...s, bag: { ...s.bag, luobo: 1 } }, { creature: 'zheng' });
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
