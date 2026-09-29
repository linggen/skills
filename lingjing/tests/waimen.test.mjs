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
  for (const exit of ['count', 'keep', 'swallow']) s = must(resolve, fresh(s), { exit });
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
  for (const exit of ['count', 'keep', 'swallow']) s = must(resolve, fresh(s), { exit });
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
