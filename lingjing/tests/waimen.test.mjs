// 外门 — the book's 古五 to 古八 (story/jiuding-lu/04-第四回.md … 06-第六回.md since the 2026-10-02 rename; once 第一章 · 外门, then 第三回 until 卷一 was split into ten, 2026-09-30), as shipped: the prologue
// leads into it; five key beats lock the map and open it again; the area
// around 沉鼎观 is the whole map; 小狰 is the story's — a trial bout at the 药园,
// then the 萝卜 (2026-09-30); the 蛫 guards the 秘境 wall; the 大比's eve is a scene
// (wm-qianye) and no real day is waited; its three duels; 息壤 lifts the realm;
// the chapter ends on 古九's 「第N回 · 即将开放」.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { duel, look, move, quest, resolve, story, tame, task, trade, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { WORDS, bookPopHtml, cardHtml, duelTitle } from '../scripts/cards.js';
import { stageSlots } from '../scripts/stage.mjs';
import { boardsFor, throughJin, TO_OPEN, walk } from './prologue.mjs';
import { huiLabel, huiOf } from '../scripts/rules/hui.mjs';
import { bookNo } from './book-num.mjs';
import { earnedFor } from './earn.mjs';

const content = loadContent();
const CH = content.chapters['00-waimen'];
const DAY1 = new Date('2026-09-29T09:00:00'), DAY2 = new Date('2026-09-30T10:00:00');
const ctx = (now = DAY1) => ({ now, quests: [] });

function must(fn, s, args, now = DAY1) {
  const out = fn(fn === resolve ? earnedFor(content, s, args?.exit) : s, content, ctx(now), args);
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
/* The 秘境's rooms played as a player plays them (tests/sealed.test.mjs plays them for real): the
   凶崖's 犰狳 beaten and its 下崖 board, the 困阵's 洛书 — the way down and the way on are open. */
const clearRooms = (s) => ({ ...s, hunted: { ...s.hunted, 'mijing-xiongya': 1 }, tasks: { ...s.tasks, 'mijing-descend': { status: 'done' }, 'mijing-zhenyan': { status: 'done' } } });
/* A scene exit by its button — 小周天 first plays its 三关 board (the exit waits on it, 2026-09-30). */
function step(s, exit) {
  if (exit === 'breathe') { s = must(win, s, { id: 'zhoutian-sanguan' }); s = must(task, s, { action: 'done', id: 'zhoutian-sanguan' }); }
  s = must(resolve, before(s, exit), { exit });
  // 一拳's night over, the 讲堂's month (wm-dianmao, 2026-10-27: its eight boards), then 周衡's office (全文后的小游戏
  // 2026-10-26): the token, then the map as before
  return exit === 'hide' ? on(must(move, on(must(move, s, { place: 'jiangtang' }), 'on'), { place: 'waimen' }), 'patrol') : s;
}

/* 古六's boards (the per-回 plan, 2026-10-15): the board each way on waits on, played (won, counted) before it. */
const BOARD_BEFORE = { eve: ['qianye-qiajue', 'qianye-xiangke'], sleep: ['zhaojing-mirror'], go: ['laba-diche'], up: ['dabi-sneeze'], rest: ['jiaxin-zhouheng', 'jiaxin-letter'], read: ['heluo-kaipian'],
  // the reading cap (2026-10-20): 息壤 · 五门 before the second night (喂息珠 told since 10-20; 后山 told again 10-20, the 调息 cut)
  sit: ['xirang-wumen'],
  // 暗河's throw (2026-10-20, 砸寨 anhe-dark): the swallow passage split at its stone
  light: ['anhe-dark'],
  // 守炉's first story level (2026-10-20): the 药园's second night, before the 狰 shows and the 萝卜
  tame: ['yaoyuan-xunye'],
  // 喂饭桶 · 一根牛骨头 (2026-10-21, the reading cap): the 饭桶's first feed, before 第一路's way on
  save: ['diyilu-niugu'] };
function before(s, exit, now = DAY1) {
  // a save set down in a scene by hand (not walked in) has not been offered its boards yet: offer them, as arriving does
  for (const id of BOARD_BEFORE[exit] ?? []) s = must(task, must(win, { ...s, tasks: { [id]: { status: 'offered' }, ...s.tasks } }, { id }, now), { action: 'done', id }, now);
  // and whatever else the way on waits on, in the scene's `show` order (全文后的小游戏 2026-10-26: 一拳, 周衡, 萝卜, 第一路's split)
  for (const [verb, args] of boardsFor(s, content, exit)) s = must(verb === 'win' ? win : task, s, args, now);
  return s;
}
const on = (s, exit, now = DAY1) => must(resolve, before(s, exit, now), { exit }, now);
/* To the 秘境's door and in (全文后的小游戏 第二批 2026-10-26): 老蔫 at wm-mijing, 阿禾's 口子 and 孙二狗 at wm-kouzi, the hall's 翻板 at wm-shiting. */
const intoRealm = (s) => ['refuse', 'gate', 'cleft'].reduce((x, exit) => must(resolve, before(fresh(x), exit), { exit }), s);
/* The 大比's eve, now three scenes (wm-qianye · wm-zhaojing · wm-laba), each by its boards. */
const throughEve = (s, now = DAY1) => ['lecture', 'eve', 'night', 'sleep', 'go'].reduce((x, exit) => on(x, exit, now), s); // + wm-yaban's lecture, wm-koujue's night (2026-10-26)
/* A way on taken after the boards it waits on (its scene's `show` order) — no other scene's (全文后的小游戏 第二批 2026-10-26). */
const pass = (s, exit, now = DAY1) => must(resolve, boardsFor(s, content, exit).reduce((x, [verb, args]) => must(verb === 'win' ? win : task, x, args, now), s), { exit }, now);

/* The whole chapter, by its buttons and the page's own taps, with the threads done. */
function playThrough() {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = must(move, s, { place: 'waimen' });
  s = must(quest, s, { action: 'take', id: 'xu-yaoyuan-shouye' });
  s = must(move, s, { place: 'yaoyuan' });
  s = on(won(s, 'yaoyuan-zheng'), 'tame');
  s = must(move, s, { place: 'chaifang' });
  s = must(quest, s, { action: 'take', id: 'xu-sun-charm' });
  s = must(win, s, { id: 'pintu' }); s = must(task, s, { action: 'done', id: 'pintu' });
  assert.ok(s.quests['xu-sun-charm'].done_at, 'the charm mended, the errand hands itself in');
  for (const exit of ['count', 'keep', 'save', 'morning', 'reckoning', 'realm', 'enter']) s = must(resolve, before(fresh(s), exit), { exit, ...(exit === 'keep' ? { said: '你这饭桶' } : {}) });
  s = throughJin(fresh(s), content, DAY1); // 今 · 二, between 古四 and 古五 (2026-10-05)
  s = must(move, fresh(s), { place: 'waimen' });
  assert.ok(s.quests['xu-yaoyuan-shouye'].done_at, 'the watch hands itself in at 周衡');
  s = must(move, fresh(s), { place: 'shimen' });
  s = intoRealm(s);
  // Through the door the 秘境 is sealed (chapter.json beat `sealed`): he stands in its forking hall and walks down to the wall.
  assert.equal(s.place, 'mijing-kou');
  s = clearRooms(s);
  s = must(move, fresh(s), { place: 'mijing-duanya' });
  s = on(fresh(s), 'down'); // the cliff's board (wm-xiongya, 2026-10-26), then the ledge
  // The wall is the 蛫 itself (古五, 2026-10-02): prying is turned down in-world, the water opens it.
  const pried = resolve(s, content, ctx(DAY1), { exit: 'pry' });
  assert.equal(pried.result.refused, 'snubbed');
  assert.match(pried.result.say, /咬/, 'it bites; the wall stays shut');
  assert.equal(pried.state.scene, 'wm-wangzuo');
  assert.equal(s.bag.luobo, 1, 'into the 秘境 with a radish in the bundle (古七)');
  s = must(resolve, won(s, 'mijing-gui'), { exit: 'open' });
  // The 困阵 has one way, the book's: 「三天。」 (the 萝卜 branch was cut, 修改单-片三 6, 2026-10-02)
  assert.equal(refused(resolve, s, { exit: 'radish' }, 'unknown-exit').refused, 'unknown-exit');
  // The chase is a trial he cannot win by force (古五, 2026-10-02: 邹青松, foe-zou); the turn is the story's.
  // 2026-10-26: the chamber's 隐身符 (wm-shishi · wait), the ledge's 踏马符 and 谷粒 (wm-tama · after), 阿禾 on the mudflat (wm-hetan · rest), the 萝卜 (wm-luobo · on)
  for (const exit of ['go', 'wait', 'swallow', 'light', 'after', 'sit', 'draw', 'out', 'rest', 'on']) s = must(resolve, exit === 'swallow' ? won(s, 'mijing-zou') : exit === 'go' ? s : boardsFor(fresh(s), content, exit).reduce((x, [verb, args]) => must(verb === 'win' ? win : task, x, args), fresh(s)), { exit });
  s = must(move, fresh(s), { place: 'waimen' });
  s = throughEve(fresh(s));
  s = fresh(s);
  s = on(s, 'up', DAY2);
  s = must(resolve, s, { exit: 'hold' }, DAY2);
  s = pass(must(resolve, won(s, 'dabi-lu', DAY2), { exit: 'flip' }, DAY2), 'up', DAY2); // 秦雁 at the vat (wm-shuigang)
  s = pass(must(resolve, won(s, 'dabi-shijie', DAY2), { exit: 'dodge' }, DAY2), 'on', DAY2); // 迎剑 (wm-yingjian)
  s = pass(must(resolve, won(s, 'dabi-ma', DAY2), { exit: 'face' }, DAY2), 'on', DAY2); // 接镜 (wm-jiejing)
  s = pass(on(s, 'final', DAY2), 'down', DAY2); // 祁长松's chat, then the wind (wm-fengtou) // 掌心的烙印, then the final lost (wm-laoyin, 古六)
  for (const exit of ['rest', 'follow', 'step', 'sign', 'read']) s = on(s, exit, DAY2); // 刮鞋底 or not, before the 拜师帖 (古六, 2026-10-15)
  return s;
}

test('the prologue leads into 外门 — 卷一 · 古五 — which sorts between it and 冀, and opens at 外门 with its title card', () => {
  const ids = Object.keys(content.chapters).sort();
  assert.deepEqual(ids.slice(0, 4), ['00-prologue', '00-waimen', '00-zhuji', '01-ji']);
  const s = opened();
  assert.equal(s.chapter, '00-waimen');
  assert.equal(s.scene, CH.first_scene);
  assert.equal(s.place, 'waimen');
  const l = look(s, content, ctx());
  assert.equal(l.chapter.title, huiLabel(content, 'h05', 'zh', 'head'));
  assert.equal(l.chapter.title, `卷一 · 沉鼎 · ${bookNo(content, 'h05')}　古 · 泥里挨足廿三下`, 'the 回 as the book names it, never 章');
  assert.equal(l.chapter.hui, 'h05');
  // 古四 ended where the scenes turned: its close stands on the first scene of 古五, until a scene of it is passed.
  const h04 = huiOf(content, 'h04').huimu.zh;
  assert.deepEqual(l.chapter.close, { id: 'h04', title: `${bookNo(content, 'h04')} · 完`, huimu: h04, line: huiLabel(content, 'h04', 'zh', 'head'), next: l.chapter.title });
  const html = cardHtml({ card: 'closed' }, { look: l, lang: 'zh', words: WORDS.zh });
  assert.match(html, new RegExp(`${bookNo(content, 'h04')} · 完[\\s\\S]*${h04[0]}[\\s\\S]*${h04[1]}[\\s\\S]*${bookNo(content, 'h05')}　古 · 泥里挨足廿三下[\\s\\S]*data-close-chapter="h04">合上`));
  assert.equal(stageSlots(l, l.stage).main[0].card, 'closed', 'before the scene card');
  assert.equal(look(must(resolve, s, { exit: 'owe' }), content, ctx()).chapter.close, undefined, 'gone once 古五 is under way');
  assert.equal(look({ ...s, lang: 'en' }, content, ctx()).chapter.close.title, `${bookNo(content, 'h04', 'en')} · The End`);
  assert.equal(l.chapter.fresh, true);
  assert.equal(l.scene.id, 'wm-ahe');
  assert.equal(l.scene.panel.art, undefined, 'a story moment is not illustrated: the caption and the choices stand alone');
  assert.ok(l.scene.panel.caption.length >= 2 && l.scene.panel.taps.length >= 1);
  assert.equal(story(s, content, ctx()).result.cauldrons.length, 9, 'no cauldron in it: the nine are still the nine');
});

test('every scene is reached, and the chapter ends straight into 古九 (筑基, built 2026-09-30)', () => {
  for (const gender of ['male']) {
    const s = playThrough();
    assert.ok(s.ended.includes('00-waimen'), gender);
    assert.deepEqual([s.chapter, s.scene], ['00-zhuji', 'j07-ankle'], 'nothing waits: 今 · 三, then 古九 (2026-10-05)');
    const passed = new Set(s.done_scenes);
    for (const id of Object.keys(CH.scenes)) assert.ok(passed.has(id), `${gender}: ${id}`);
    assert.equal(look(s, content, ctx(DAY2)).chapter.hui, 'j07', 'standing in 今 · 三, before 古七');
    assert.deepEqual([s.tier, s.step], ['qi', 4], '息壤: 练气四层');
    for (const item of ['danlu', 'huangting', 'heluo']) assert.ok(s.bag[item] > 0, item);
    assert.equal(s.bag['foundation-pill'], undefined, 'the final was lost: the 筑基丹 is 祁长松\'s (古六, 2026-10-03)');
    assert.ok(s.cast.includes('zheng') && s.cards.includes('zheng'), '小狰 walks with the player, its card in the deck');
    assert.ok(s.ledger.some(e => e.who === 'sunergou' && e.kind === '恩'), 'pulling 孙二狗 up from the steps is in the 恩仇簿');
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
  assert.equal(Object.keys(CH.scenes).length, 52); // + wm-xiqi (古五's 石室 cut at its two layers, 2026-10-31); + wm-dianmao (the 讲堂's month, 2026-10-27); + wm-yaban, wm-koujue, wm-shuigang, wm-yingjian, wm-jiejing, wm-fengtou (第六回, 2026-10-26); + wm-kouzi, wm-shiting, wm-xiongya, wm-shishi, wm-tama, wm-hetan (全文后的小游戏 第二批 2026-10-26: 古五's splits); + j04-trial (今二's tryouts, 2026-10-26); + wm-zhishi, wm-xunye, wm-duizhang, wm-yan, wm-baoming (全文后的小游戏 2026-10-26: 古四's splits); + wm-anhe (暗河, 砸寨's anhe-dark: the swallow passage split at its throw, 2026-10-20); + wm-zhaojing, wm-laba (古六's eve split, 2026-10-15); + wm-luobo (喂息珠, the reading cap, 2026-10-20)
  // // + wm-kaikai (老蔫, 古五) and wm-laoyin (the brand, 古六); + 今 · 二's three (2026-10-05)
  for (const b of CH.beats) for (const id of b.scenes) assert.ok(CH.scenes[id], id);
  // 观内 (2026-10-15): every scene stands in the 观 — but the 秘境's, at 石门, whose road the story itself opens (world.mjs leaveOf).
  for (const sc of Object.values(CH.scenes)) assert.ok(sc.hui === 'j04' ? !sc.at : CH.map.places.includes(sc.at) || sc.at === 'shimen' || CH.beats.some(b => b.sealed?.places.includes(sc.at)), `${sc.id} at ${sc.at}`);
});

test('a key beat shuts the map from the scene after its entry to its last, in its own words; between beats the area is open', () => {
  let s = opened();
  assert.equal(look(s, content, ctx()).lock, undefined, 'the entry is a waypoint: nothing is shut yet');
  s = must(resolve, s, { exit: 'owe' });
  const l = look(s, content, ctx());
  // the save carries the lock (world.mjs fitLock): the beat and since when; Look gives the beat's own reason
  assert.deepEqual(s.lock, { beat: 'rumen', since: s.lock.since });
  assert.deepEqual(l.lock, { beat: 'rumen', title: '入门第一课', say: CH.beats[0].say.zh, since: s.lock.since });
  assert.equal(s.place, 'jiangtang', 'the beat carries the player to its scene');
  assert.equal(l.director.corridor, true, 'the stage keeps the roads off');
  const r = refused(move, s, { place: 'waimen' }, 'corridor');
  assert.equal(r.beat, 'rumen');
  assert.equal(r.say, CH.beats[0].say.zh);
  for (const exit of ['can', 'breathe', 'hide']) s = step(s, exit);
  assert.equal(look(s, content, ctx()).lock, undefined, 'the beat over, the map opens');
  assert.equal(s.lock, undefined, 'and the save lets the lock go');
  assert.equal(must(move, s, { place: 'waimen' }).place, 'waimen');
  // the next beat waits at its place, a waypoint with the goal's countdown before it
  // 小狰 first (十月初十): the story carries him to the 药园; then the next beat waits at its place
  // (周衡's office at 外门 first since 2026-10-26: the token, then the story carries him on to the 药园)
  assert.deepEqual([s.scene, s.place], ['wm-yaoyuan', 'yaoyuan']);
  s = on(won(s, 'yaoyuan-zheng'), 'tame');
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

test('the chapter ended, 古九 keeps the same mountain on its own map; a save already further along keeps the whole world', () => {
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

test('小狰 is the story\'s: at the 药园 the 萝卜, not a fight (cards.md § 1, 第四回) — it walks with him, and the 守夜 hands itself in at 周衡 (2026-09-30)', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  assert.equal(s.scene, 'wm-yaoyuan');
  s = must(move, s, { place: 'yaoyuan' });
  const l = look(s, content, ctx());
  const e = l.scene.exits.find(x => x.id === 'tame');
  assert.equal(e.game, undefined, 'no fight: a 萝卜 set down');
  s = on(s, 'tame');
  assert.ok(s.cast.includes('zheng') && s.cards.includes('zheng'), 'it walks with him, its card in the deck');
  assert.equal(s.scene, 'wm-chaifang');
  assert.match(tellOf(content, s).tell.map(t => t.text).join('\n'), /萝卜[\s\S]*睡着了/, 'the book\'s passage: the 萝卜, and it sleeps at his feet');
  assert.equal(content.creatures.creatures.find(c => c.id === 'zheng').art, 'art/creatures/zheng.webp');
});

test('the 大比\'s eve is a scene, not a real day: 周衡\'s notice, 大比前夜, then the contest at once — and its three duels (卢方, 秦雁, 马小宝; the bracket of 2026-10-03)', () => {
  let s = opened();
  for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
  s = must(move, s, { place: 'yaoyuan' });
  s = on(won(s, 'yaoyuan-zheng'), 'tame');
  s = must(move, fresh(s), { place: 'chaifang' });
  for (const exit of ['count', 'keep', 'save', 'morning', 'reckoning', 'realm', 'enter']) s = must(resolve, before(fresh(s), exit), { exit, ...(exit === 'keep' ? { said: '你这饭桶' } : {}) });
  s = throughJin(fresh(s), content, DAY1); // 今 · 二, between 古四 and 古五 (2026-10-05)
  s = must(move, fresh(s), { place: 'shimen' });
  s = intoRealm(s);
  // Through the door the 秘境 is sealed (chapter.json beat `sealed`): he stands in its forking hall and walks down to the wall.
  assert.equal(s.place, 'mijing-kou');
  s = clearRooms(s);
  s = must(move, fresh(s), { place: 'mijing-duanya' });
  s = on(fresh(s), 'down'); // the cliff's board (wm-xiongya, 2026-10-26), then the ledge
  refused(resolve, s, { exit: 'open' }, 'game-not-won');
  s = must(resolve, won(s, 'mijing-gui'), { exit: 'open' });
  // The chase is a trial he cannot win by force (古五, 2026-10-02: 邹青松, foe-zou); the turn is the story's.
  // 2026-10-26: the chamber's 隐身符 (wm-shishi · wait), the ledge's 踏马符 and 谷粒 (wm-tama · after), 阿禾 on the mudflat (wm-hetan · rest), the 萝卜 (wm-luobo · on)
  for (const exit of ['go', 'wait', 'swallow', 'light', 'after', 'sit', 'draw', 'out', 'rest', 'on']) s = must(resolve, exit === 'swallow' ? won(s, 'mijing-zou') : exit === 'go' ? s : boardsFor(fresh(s), content, exit).reduce((x, [verb, args]) => must(verb === 'win' ? win : task, x, args), fresh(s)), { exit });
  assert.equal(s.scene, 'wm-yaban'); // 钱掌柜 and the pulse pillow before the lesson (2026-10-26)
  // The 秘境 over, he walks back up with the others (观内, 2026-10-15): set down at 外门 in the story's words, where the eve stands.
  const back = look(s, content, ctx(DAY1));
  assert.equal(back.place.id, 'waimen');
  assert.match(back.place.returned, /回了外门/);
  s = must(move, fresh(s), { place: 'waimen' });
  assert.match(look(s, content, ctx()).scene.setup ?? JSON.stringify(look(s, content, ctx()).scene), /传/, 'the eve carries its rumour');
  s = throughEve(fresh(s));
  s = on(s, 'up', DAY1);
  // round one is his quick win over 何七 (the exit's passage); 孙二狗 vs 卢方 is watched — no giving a round away, no 复试
  const l = look(s, content, ctx(DAY2));
  assert.equal(s.scene, 'wm-lun1');
  assert.deepEqual(l.scene.buttons.map(b => b.id), ['hold']);
  for (const gone of ['fall', 'fight']) refused(resolve, s, { exit: gone }, 'unknown-exit', DAY2);
  s = must(resolve, s, { exit: 'hold' }, DAY2);
  assert.ok(s.ledger.some(e => e.who === 'sunergou' && e.kind === '恩'), 'he pulls 孙二狗 up from the steps');
  assert.equal(look(s, content, ctx(DAY2)).scene.exits.find(e => e.id === 'flip').duel.creature.name, '卢方');
  // three duels on this path: 卢方 (内门六层), 秦雁 (外门排头), 马小宝 in the semi — each fought again at once
  for (const [exit, game, foe] of [['flip', 'dabi-lu', 'foe-lufang'], ['dodge', 'dabi-shijie', 'foe-shijie'], ['face', 'dabi-ma', 'foe-maxiaobao']]) {
    const sc = look(s, content, ctx(DAY2)).scene;
    const e = sc.exits.find(x => x.id === exit);
    assert.equal(e.game.creature, foe);
    assert.equal(e.game.retry, true);
    refused(resolve, s, { exit }, 'game-not-won', DAY2);
    s = must(resolve, won(s, game, DAY2), { exit }, DAY2);
    s = pass(s, { flip: 'up', dodge: 'on', face: 'on' }[exit], DAY2); // the vat, 迎剑, 接镜 (2026-10-26)
  }
  s = pass(on(s, 'final', DAY2), 'down', DAY2); // 掌心的烙印, then the final (wm-laoyin, 古六)
  assert.equal(s.scene, 'wm-jiaxin', 'the night of the contest, before the master');
  assert.equal(s.bag['foundation-pill'], undefined, 'the final is lost: no 筑基丹');
});

test('the 大比 final is a loss told as a passage: 「……祁长松，胜。」, no exit of 古六 grants the 筑基丹 (2026-10-03)', () => {
  const final = CH.scenes['wm-laoyin'].exits.find(e => e.id === 'final');
  assert.equal(final.game, undefined, 'no duel for the final');
  assert.equal(final.grant, undefined, 'the final grants nothing');
  // the final's telling goes on in wm-fengtou (风掉头, 全文后的小游戏 第二批 2026-10-26)
  const told = CH.scenes['wm-fengtou'].story_after;
  assert.match(told.zh, /……祁长松，胜。/);
  assert.doesNotMatch(told.zh, /沈小满，胜。」\s*$/);
  for (const sc of Object.values(CH.scenes)) for (const e of sc.exits) {
    assert.notEqual(e.grant?.item, 'foundation-pill', `${sc.id}/${e.id} grants no 筑基丹`);
  }
  const o = opened(), at = { ...o, scene: 'wm-laoyin', place: 'zhengdian', tasks: { ...o.tasks, 'laoyin-qi': { status: 'offered' }, 'fengtou-pig': { status: 'offered' } } };
  const s = pass(on(at, 'final', DAY2), 'down', DAY2);
  assert.equal(s.bag['foundation-pill'], undefined);
  assert.match(CH.scenes['wm-jiaxin'].story.zh, /四层了。过了年，搬到内门去。/);
  assert.match(CH.scenes['wm-jiaxin'].story_after.zh, /我押的那一文，输了。」[^]*拿炭条一笔一笔地写/); // 周衡's chat before it (2026-10-26) // the line itself surfaces in 古七 (Hanli 2026-10-06)
  assert.doesNotMatch(JSON.stringify(CH.scenes), /复试|第十七条|当票|往后一倒/);
});

test('息壤 lifts no layer since 2026-10-16 (「不要直接跳层」): 三层 and 四层 are ground in 古六, behind the 大比\'s eve; never down', () => {
  const sc = CH.scenes['wm-xirang'];
  assert.equal(sc.exits[0].rise, undefined);
  assert.equal(sc.exits[0].was_rise, 4, 'the layer the book once lifted him to, kept');
  let s = { ...opened(), scene: 'wm-xirang', place: 'shimen', done_scenes: ['wm-ahe'], step: 2, progress: 33 };
  s = must(resolve, won(s, 'mijing-zou'), { exit: 'swallow' });
  assert.deepEqual([s.tier, s.step, s.progress], ['qi', 2, 33]);
  const high = must(resolve, won({ ...opened(), scene: 'wm-xirang', place: 'shimen', step: 7, progress: 30 }, 'mijing-zou'), { exit: 'swallow' });
  assert.deepEqual([high.step, high.progress], [7, 30], 'never down');
});

test('the woodshed is his (the boy\'s: 抱住了头, 血腥味) — the words around the hero are fixed; an old save named a girl reads the same', () => {
  const at = (gender) => {
    let s = { ...opened(), gender };
    for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit);
    s = must(move, s, { place: 'yaoyuan' });
    s = on(won(s, 'yaoyuan-zheng'), 'tame');
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
  const s = { ...opened(), scene: 'wm-juesai', place: 'zhengdian' };
  const l = look(s, content, ctx());
  const exit = l.scene.exits.find(e => e.id === 'face');
  assert.equal(exit.duel.creature.person, true);
  // 卢方 has no portrait yet, so no people.json row: his fight names itself a bout
  const lu = look({ ...opened(), scene: 'wm-fushi', place: 'zhengdian' }, content, ctx()).scene.exits.find(e => e.id === 'flip').duel.creature;
  assert.equal(duelTitle(lu, WORDS.zh, 'zh'), '比试');
  const html = cardHtml({ card: 'duel', id: 'dabi-ma' }, { look: l, lang: 'zh', words: WORDS.zh, content: {}, artBase: '' });
  assert.match(html, /比试/);
  assert.doesNotMatch(html, /降妖/);
  assert.equal(duelTitle({ id: 'zheng' }, WORDS.zh), '降妖');
  assert.equal(duelTitle({ id: 'foe-shijie', person: true }, WORDS.en), 'Bout');
  // A fight that names itself: 冰夷's dragons test him — no 降妖 (2026-09-30).
  assert.equal(duelTitle({ id: 'foe-shuanglong', title: { zh: '冰夷之试', en: "Bingyi's Trial" } }, WORDS.zh, 'zh'), '冰夷之试');
  assert.equal(duelTitle({ id: 'foe-shuanglong', title: { zh: '冰夷之试', en: "Bingyi's Trial" } }, WORDS.en), "Bingyi's Trial");
  assert.equal(duelTitle({ id: 'foe-shuanglong', title: '冰夷之试' }, WORDS.zh), '冰夷之试', 'the brief carries it already picked');
});

test('a scene waiting on a game stands with it: the round fight and the 蛫 at the wall sit under the scene card, never behind 还有 1 件 (live, 2026-09-29)', () => {
  const kinds = slots => slots.main.map(c => `${c.card}:${c.id ?? ''}`);
  for (const [scene, place, game, before] of [['wm-lun2', 'zhengdian', 'duel:dabi-shijie', 'wm-dabi'], ['wm-fushi', 'zhengdian', 'duel:dabi-lu', 'wm-dabi'], ['wm-juesai', 'zhengdian', 'duel:dabi-ma', 'wm-dabi'], ['wm-wangzuo', 'mijing-duanya', 'duel:mijing-gui', 'wm-mijing']]) {
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
  s = on(won(s, 'yaoyuan-zheng'), 'tame');
  assert.equal(s.quests['xu-yaoyuan-shouye'].done_at, undefined, 'tamed at the 药园: 周衡 is not here');
  const row = look(s, content, ctx()).book.find(b => b.id === 'xu-yaoyuan-shouye');
  assert.equal(row.ready, true);
  assert.equal(row.away.who, '周衡');
  assert.match(row.where.name, /外门/);
  const pop = bookPopHtml({ look: look(s, content, ctx()), lang: 'zh', words: WORDS.zh });
  assert.match(pop, /周衡/, 'the row names who it is for');
  // …and its one tap is the walk to him (2026-10-15: the 「交给周衡」 chip was no button).
  assert.match(pop, /data-go="waimen">去沉鼎观 · 外门</);
  assert.match(pop, /到外门交给周衡/, 'and where');
  assert.doesNotMatch(pop, /data-do="turn"[^>]*xu-yaoyuan-shouye/, 'no 交差 away from him');
  const no = refused(quest, s, { action: 'turn', id: 'xu-yaoyuan-shouye' }, 'not-with-giver');
  assert.match(no.say, /周衡/);
  assert.match(no.say, /外门/);
  const wealth = s.wealth;
  s = must(move, fresh(s), { place: 'waimen' });
  assert.ok(s.quests['xu-yaoyuan-shouye'].done_at, 'at 外门 it hands itself in');
  assert.ok(s.wealth >= wealth + 10);
  // 阿禾's interest: a carry, handed by his tap — at 坊市 only. 坊市 is below the mountain (观内, 2026-10-15):
  // an 外门 disciple is refused it, so this half is walked as a save past the wall (01-ji's map).
  assert.match(refused(move, s, { place: 'fangshi' }, 'road-closed').say, /无令不得下山/);
  s = { ...s, chapter: '01-ji', scene: '01-arrive', ended: [...(s.ended ?? []), '00-waimen', '00-zhuji'] };
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

test('卢方, a person with no people.json row yet, is one by his own gender: the win card says 他退了下去, never 它退入雾中', async () => {
  const { WORDS: BW, boutWords } = await import('../scripts/battle-card.js');
  const lu = look({ ...opened(), scene: 'wm-fushi', place: 'zhengdian' }, content, ctx()).scene.exits.find(e => e.id === 'flip').duel.creature;
  assert.equal(lu.person, true);
  assert.equal(lu.gender, 'male');
  assert.equal(boutWords(BW.zh, lu, 'zh').wonSay, '他退了下去。');
  assert.equal(boutWords(BW.en, lu, 'en').wonSay, 'He steps down.');
  assert.ok(content.creatures.creatures.find(c => c.id === 'foe-zou').gender, '邹青松 too');
  assert.ok(!content.creatures.creatures.find(c => c.id === 'foe-shuanglong').gender, "冰夷's dragons stay beasts");
});

test('a bout with a person speaks of him or her: 他/她 by the person, 认输, 「今日已比过」, 「他退了下去」 — never 妖, 它 or 今日已降 (his, 2026-09-29)', async () => {
  const { WORDS: BW, boutWords, sayEffect, challengeHtml } = await import('../scripts/battle-card.js');
  const l = look({ ...opened(), scene: 'wm-juesai', place: 'zhengdian' }, content, ctx());
  const ma = l.scene.exits.find(e => e.id === 'face').duel.creature;
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
  const shijie = look({ ...opened(), scene: 'wm-lun2', place: 'zhengdian' }, content, ctx()).scene.exits.find(e => e.id === 'dodge').duel.creature;
  assert.equal(shijie.gender, 'female');
});

test('息壤 keeps his 修为 and lifts nothing; its moment is the five doors opening one by one, in ink (his, 2026-09-29)', async () => {
  const { doorsHtml } = await import('../scripts/doors.js');
  const { MAIN, CARD_KINDS, PAGE_OWNS } = await import('../scripts/stage.mjs');
  // Since 2026-10-20 the moment rides wm-kaikai's way on (the 息壤 paragraphs and 息壤 · 五门 moved there): after the soil has grown in.
  const swallowed = resolve(won({ ...opened(), scene: 'wm-xirang', place: 'shimen', step: 2, progress: 33 }, 'mijing-zou'), content, ctx(), { exit: 'swallow' });
  assert.equal(swallowed.result.node?.doors, undefined, 'not before the earth is scattered');
  // The dry river's throw first (wm-anhe, 2026-10-20: 砸寨 anhe-dark), then 息壤 · 五门.
  const lit0 = resolve(before(swallowed.state, 'light'), content, ctx(), { exit: 'light' }).state;
  const lit = resolve(before(lit0, 'after'), content, ctx(), { exit: 'after' }).state; // wm-tama's 踏马符 and 谷粒 (2026-10-26)
  // 息壤 · 五门 won: its own pay, the board's — and the 石室's stage quests earned (三层圆满, then 四层圆满; 2026-10-31)
  const noon = resolve(earnedFor(content, before(lit, 'sit'), 'sit'), content, ctx(), { exit: 'sit' });
  assert.equal(noon.result.ok, true, JSON.stringify(noon.result).slice(0, 200));
  assert.equal(noon.result.node?.doors, undefined, 'not at noon of the second day: the soil has not cracked open');
  const played = earnedFor(content, noon.state, 'draw');
  const out = resolve(played, content, ctx(), { exit: 'draw' });
  // No story rise (Hanli, 2026-10-16: 「要让玩家去刷经验/修为等. 不要直接跳层」): the realm stands as he earned it.
  assert.deepEqual([swallowed.state.step, swallowed.state.progress], [2, 33], 'the swallow moved nothing');
  assert.deepEqual([out.state.step, out.state.progress, out.result.rose], [played.step, played.progress, undefined], 'the story moved nothing');
  const node = out.result.node;
  assert.deepEqual(node.doors.map(d => d.el), ['metal', 'wood', 'water', 'fire', 'earth']);
  assert.ok(node.doors.every(d => d.line.startsWith('第')));
  assert.equal(node.rose, undefined, 'no layer named: none was given');
  const html = doorsHtml(node, { lang: 'zh' });
  assert.equal((html.match(/class="seal"/g) ?? []).length, 5);
  assert.match(html, /五门俱开[\s\S]*金[\s\S]*木[\s\S]*水[\s\S]*火[\s\S]*土/);
  assert.doesNotMatch(html, /doorsto/);
  assert.match(html, /style="--i:4"/, 'each door its turn');
  assert.match(doorsHtml(node, { still: true }), /class="card doors still"/, 'reduced motion: the last frame');
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}|color:/i, 'ink only: no colour in the moment');
  assert.equal(doorsHtml({}, {}), '');
  assert.equal(CARD_KINDS.doors.holds, true);
  assert.ok(PAGE_OWNS.has('doors'));
  assert.ok(MAIN.findIndex(r => r.kinds.includes('doors')) < MAIN.findIndex(r => r.kinds.includes('panel')), 'before the next scene card');
  assert.equal(stageSlots({}, [{ card: 'panel' }, { card: 'doors' }]).main[0].card, 'doors');
});

test('外门 ends on its card: 「古八 · 完」 by the book\'s number, what this player did, the next teaser in the book\'s voice — standing on 古九\'s first scene (his, 2026-09-29; 回 renumbered and 古九 built 2026-09-30)', () => {
  const s = playThrough();
  const l = look(s, content, ctx(DAY2));
  const close = l.chapter.close;
  assert.equal(close.title, `${bookNo(content, 'h08')} · 完`);
  assert.equal(close.id, 'h08', 'put away once, as the 回 it closes');
  assert.equal(close.did, '你收了药园那只偷萝卜的小狰，大比台下把站不起来的孙二狗拉了起来，以四层把内门的六层扔下了台，一路打进决赛，输给了九层的祁长松，那颗筑基丹没拿着，名字进了内门名册，又拜了扫了五十年台阶的瞿老为师。');
  assert.match(close.teaser, /大比第二天[\s\S]*内门西廊[\s\S]*木牌/);
  assert.ok(l.stage.some(c => c.card === 'closed'), 'on the stage');
  assert.equal(stageSlots(l, l.stage).main[0].card, 'closed', 'first on the stage, before an errand offered where he stands');
  const html = cardHtml({ card: 'closed' }, { look: l, lang: 'zh', words: WORDS.zh });
  assert.match(html, new RegExp(`${bookNo(content, 'h08')} · 完[\\s\\S]*小狰[\\s\\S]*内门西廊[\\s\\S]*data-close-chapter="h08">合上`));
  // another player's chapter reads his own: no 狰, and 孙二狗 not pulled up
  const other = { ...s, cast: s.cast.filter(id => id !== 'zheng'), ledger: s.ledger.filter(e => e.who !== 'sunergou') };
  assert.match(look(other, content, ctx(DAY2)).chapter.close.did, /^药园的贼，你没收成，以四层把内门的六层扔下了台，/);
  assert.match(look({ ...s, lang: 'en' }, content, ctx(DAY2)).chapter.close.did, /^You took in the little Zheng/);
  // before the end: no card (a scene of 古五 passed, so not 古四's either)
  assert.equal(look(must(resolve, opened(), { exit: 'owe' }), content, ctx()).chapter.close, undefined);
});

test('a first-appearance 图鉴 card beside the scene card is compact — a small picture, one line, a tap to open it big — so the choices stay on screen (his, 2026-09-29)', async () => {
  const fs = await import('node:fs');
  const { codexOf } = await import('../scripts/codex.js');
  const json = (f) => JSON.parse(fs.readFileSync(new URL(`../worlds/jiuding/${f}`, import.meta.url), 'utf8'));
  const codex = codexOf({ codex: json('codex.json'), people: json('people.json'), creatures: json('creatures.json'), items: json('items.json'), arts: json('arts.json') });
  const l = look(opened(), content, ctx());
  assert.deepEqual(l.scene.meet, ['sunergou', 'zhouheng'], '周衡 is met here since 2026-09-30 (the refectory morning moved to 古五)');
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


test('古五\'s chase (2026-10-02): 邹青松 is a trial outlasted, 踏马的符 is in hand at its door and calls the 蛫 as a guard, and the knife is picked up after', async () => {
  const { fightSetup } = await import('../scripts/rules/cards.mjs');
  const { begin, act } = await import('../scripts/battle.js');
  const zou = content.creatures.creatures.find(c => c.id === 'foe-zou');
  assert.equal(zou.trial.outlast, true);
  assert.equal(zou.trial.yield, undefined, 'never driven down: the turn is the story\'s');
  assert.equal(zou.says.won.zh, '你这踏马的符是哪来的！？');
  let s = clearRooms({ ...opened(), scene: 'wm-wangzuo', place: 'mijing-duanya' });
  s = must(resolve, won(s, 'mijing-gui'), { exit: 'open' });
  assert.equal(s.bag['tama-fu'], 1, '古四\'s 饭桶 spat it out; in his belt since');
  s = must(resolve, s, { exit: 'go' });
  s = must(resolve, before(fresh(s), 'wait'), { exit: 'wait' }); // wm-shishi: 阿禾's 隐身符 first (2026-10-26)
  const e = CH.scenes['wm-xirang'].exits.find(x => x.id === 'swallow');
  assert.deepEqual([e.game.creature, e.game.retry, e.rise, e.was_rise], ['foe-zou', true, undefined, 4]);
  refused(resolve, s, { exit: 'swallow' }, 'game-not-won');
  const setup = fightSetup(content, s, zou, DAY1);
  assert.ok(setup.you.extra.includes('tama-fu'), 'in hand at the door');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  const st = begin({ ...setup, you: { ...setup.you, extra: ['tama-fu'] } }, catalog);
  if (st.whose !== 'you') act(st, { kind: 'end' }, 'foe');
  st.you.mana = 9;
  const played = act(st, { kind: 'play', index: st.you.hand.indexOf('tama-fu') }, 'you');
  assert.ok(played.ok, JSON.stringify(played));
  assert.ok(st.you.board.some(m => m.id === 'gui' && m.taunt), 'the 蛫 stands guard: a 杀招 takes it first');
  s = must(resolve, won(s, 'mijing-zou'), { exit: 'swallow' });
  assert.equal(s.bag['duan-dao'], 1, 'the knife from the dry underground river');
});

test('杀人必摸尸 (古五, 2026-10-03): 邹青松 killed leaves his 储物袋 — the gourd he fought with, 敛息符, 回春丹, 紫须芝 — and the gourd\'s fire snakes as a card', async () => {
  const { drop } = await import('../scripts/rules/arms.mjs');
  const { winCard } = await import('../scripts/rules/cards.mjs');
  const { pouchBrief } = await import('../scripts/rules/pouch.mjs');
  const zou = content.creatures.creatures.find(c => c.id === 'foe-zou');
  const s = { ...opened(), bag: {} };
  const got = drop(content, s, zou, DAY1);
  const by = Object.fromEntries(got.map(g => [g.id, g.n]));
  for (const [id, n] of Object.entries({ 'pouch-low': 1, 'chitong-hulu': 1, 'lianxi-fu': 2, 'mend-pill': 3, 'zixu-zhi': 1 })) assert.ok(by[id] >= n, `${id} ×${n} in 所得: ${JSON.stringify(by)}`);
  assert.equal(new Set(got.map(g => g.id)).size, got.length, 'an id twice is one line in 所得');
  const items = Object.fromEntries(content.items.items.map(i => [i.id, i]));
  // 摸到的兵器，须是打斗里亮过相的: the gourd is his fire-snake weapon.
  assert.deepEqual([items['chitong-hulu'].kind, items['chitong-hulu'].effect.root], ['weapon', 'fire']);
  assert.ok(items['pouch-low'].effect.pouch < items['pouch-mid'].effect.pouch);
  // Story things take no slot.
  const before = pouchBrief(content, s).used;
  assert.equal(before, Object.keys(s.bag).filter(id => !items[id].story && items[id].kind !== 'key').length);
  const card = winCard(content, { ...s, cards: [] }, zou, DAY1);
  assert.equal(card?.id, 'huoshe', 'the win deals the gourd\'s fire snake (火蛇, 2026-10-27; it was 火鸦)');
  const e = CH.scenes['wm-xirang'].exits.find(x => x.id === 'swallow');
  assert.equal(e.grant.wealth, 9, 'the 钱袋: seven from the fat 公子, two from the underground river');
  // the 回气丹 bottle: its card is the scene's own (cards.json from: story wm-xirang), given as he leaves it
  assert.ok(content.cards.cards.find(c => c.id === 'huiqi').from.some(f => f.kind === 'story' && f.scene === 'wm-xirang'), 'the 回气丹 bottle');
  // 穷人家的孩子，见了宝，都拿走: the dead 九层's pills and map, the 鼎苔 scraped clean — all stowed by the exit.
  assert.deepEqual(e.grant.more, { 'qi-pill': 5, dingtai: 3, 'neimen-map': 1 });
  let t = { ...opened(), scene: 'wm-xirang', place: 'shimen', bag: {} };
  t = must(resolve, won(t, 'mijing-zou'), { exit: 'swallow' });
  assert.deepEqual([t.bag['qi-pill'], t.bag.dingtai, t.bag['neimen-map'], t.bag['duan-dao']], [5, 3, 1, 1]);
});

/* 守炉's first story level (Hanli 2026-10-20: 守炉 is the main game, a new level a 回 from 古四 on, at its climax). */
const bookParas = (file) => fs.readFileSync(path.join(import.meta.dirname, '..', 'story/jiuding-lu', file), 'utf8').split(/\n\s*\n/).map(normBook).filter(Boolean);
function normBook(t) { return t.replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1').replace(/\{[^}\n]*\}/g, '').replace(/\*\*|⟪|⟫/g, '').replace(/^#.*$/gm, '').replace(/^>\s?/gm, '').replace(/---/g, '').replace(/\s+/g, ''); }
const atYaoyuan = () => { let s = opened(); for (const exit of ['owe', 'can', 'breathe', 'hide']) s = step(s, exit); return fresh(must(move, s, { place: 'yaoyuan' })); };

test('药园巡夜: the second night\'s passage stops on the book\'s 「天地再大，他只认得脸上的风。」; the 守炉 board; then 丑时 and the 狰 (the scene\'s own `story_after`); then the 萝卜', () => {
  const sc = CH.scenes['wm-yaoyuan'];
  const paras = bookParas('04-第四回.md'), last = (p) => normBook(p.zh.split('\n\n').at(-1)), first = (p) => normBook(p.zh.split('\n\n')[0]);
  assert.match(sc.story.zh, /天地再大，他只认得脸上的风。$/, 'the passage ends on the book\'s own sentence');
  const at = paras.indexOf(last(sc.story));
  assert.ok(at > 0, 'the book\'s paragraph, word for word');
  assert.equal(paras[at + 1], first(sc.story_after), 'the rest starts on the book\'s next paragraph');
  assert.equal(paras[at + 2], first(sc.exits.find((e) => e.id === 'tame').story), 'and the 萝卜 right after it');
  assert.match(sc.story_after.zh, /^丑时过了一半/);
  // the 萝卜 is played between the 狰 and its passage (时机 `luobo`, 2026-10-26)
  assert.deepEqual(sc.show, [{ card: 'board', id: 'yaoyuan-xunye' }, { card: 'board', id: 'yaoyuan-luobo' }]);
  assert.deepEqual(sc.offers, { tasks: ['yaoyuan-xunye', 'yaoyuan-luobo'] });
  // the lead card: never a line the box just read. Its two book lines (the pawprints, the dark west end) were the
  // ones the 节本 cut left out; the box reads the book's full text now (2026-10-26), so the card sets the night and cries.
  const row = content.games.games.find((g) => g.id === 'shoulu' && g.levels).levels.find((l) => l.id === 'yaoyuan-xunye');
  assert.ok(row.lead[1].big && !row.lead[0].big, 'the night set in one line, then 「崖根底下，有动静！」');
  for (const l of row.lead) assert.ok(!sc.story.zh.includes(l.zh) && !sc.story.en.includes(l.en), `not read twice: ${l.zh}`);
  assert.match(sc.story.zh, /爪印是从西头的崖根底下来的，又回崖根底下去。/, 'the pawprints are the box\'s');
});

test('药园巡夜 is offered at the scene and the 萝卜 waits on it; won, the rest is told, then the way on', () => {
  let s = atYaoyuan();
  assert.equal(s.scene, 'wm-yaoyuan');
  const l = look(s, content, ctx());
  const t = l.tasks.find((x) => x.id === 'yaoyuan-xunye');
  assert.ok(t && t.status === 'offered' && t.game === 'shoulu', JSON.stringify(t));
  assert.deepEqual(t.deal?.lv, 'yaoyuan-xunye', 'dealt its level by id');
  assert.ok(!t.deal.levels || t.deal.levels.every((x) => x.story), 'the story is dealt no ladder level');
  assert.equal(resolve(s, content, ctx(), { exit: 'tame' }).result.refused, 'needs', 'the 萝卜 waits on the board');
  s = must(task, must(win, s, { id: 'yaoyuan-xunye', stars: 3 }), { action: 'done', id: 'yaoyuan-xunye' });
  const told = tellOf(content, s).tell;
  assert.ok(told.some((x) => x.of === 'after' && x.id === 'wm-yaoyuan/after' && /丑时过了一半/.test(x.text)), 'the rest of the night, the scene\'s own');
  assert.equal(resolve(s, content, ctx(), { exit: 'tame' }).result.refused, 'needs', 'and the 萝卜 itself is played');
  s = must(task, must(win, s, { id: 'yaoyuan-luobo' }), { action: 'done', id: 'yaoyuan-luobo' });
  s = must(resolve, s, { exit: 'tame' });
  assert.equal(s.scene, 'wm-chaifang');
  assert.ok(s.cast.includes('zheng'), 'the 狰 is still the 萝卜\'s');
});

test('药园巡夜 pays as 古四\'s boards: progress, and the board\'s 灵石 by its 灵光 — three best, else plain; once', () => {
  const B = content.balance.boards;
  for (const [stars, rank] of [[3, 'best'], [2, 'plain'], [1, 'plain']]) {
    const s = atYaoyuan();
    const done = must(task, must(win, s, { id: 'yaoyuan-xunye', stars }), { action: 'done', id: 'yaoyuan-xunye' });
    assert.equal(done.wealth - s.wealth, B[rank], `${stars}★ → ${rank}`);
    assert.ok(done.progress > s.progress || done.step > s.step, 'its 修为 lands');
    assert.ok(done.boards_paid.includes('yaoyuan-xunye'));
  }
});
