// 古六 (h08) played (the per-回 plan, 2026-10-15, Hanli 「可以，开工，先做古六」): the eve split into
// three scenes, nine boards each the book's own action, the 刮鞋底 choice, and what each board pays.
// The tasks live in their own file (tasks/h08.json — content.mjs reads every tasks/*.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { checkJieben } from '../scripts/jieben.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { fightSetup, readOf } from '../scripts/rules/cards.mjs';
import { foeOf } from '../scripts/rules/world.mjs';
import { TO_OPEN, walk } from './prologue.mjs';
import * as sneeze from '../scripts/games/sneeze.js';
import { earnedFor } from './earn.mjs';

const content = loadContent();
const CH = content.chapters['00-waimen'];
const NOW = new Date('2026-10-15T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const must = (fn, s, args) => {
  const out = fn(fn === resolve ? earnedFor(content, s, args?.exit) : s, content, ctx(), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
};
const opened = () => ({ ...walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW), stamina: 100, stamina_at: NOW.toISOString() });
// 古六 holds at 练气四层 (息壤 lifted him there in 古五)
const at = (scene, place, extra = {}) => ({ ...opened(), scene, place, step: 4, progress: 0, done_scenes: ['wm-ahe', 'wm-chu'], ...extra });
// a save set down by hand is offered the scene's boards, as arriving does (core.mjs)
const play = (s, id, grade) => must(task, must(win, { ...s, tasks: { [id]: { status: 'offered' }, ...s.tasks } }, { id, ...(grade ? { grade } : {}) }), { action: 'done', id });
const run = (mod, s, verbs) => verbs.reduce((x, d) => mod.act(x, d).state, s);
const liveUntil = (mod, s, step, done = (x) => x.won) => { let x = s; for (let i = 0; i < 4000 && !done(x); i += 1) x = step(mod.tick(x, 100)); return x; };

const H08 = ['wm-qianye', 'wm-zhaojing', 'wm-laba', 'wm-dabi', 'wm-lun1', 'wm-fushi', 'wm-lun2', 'wm-juesai', 'wm-laoyin', 'wm-jiaxin', 'wm-baishi', 'wm-caowu', 'wm-heluo'];
// 2026-10-19 (the standing rule Hanli approved 10-19): 讲堂三日 is a 气走经脉 level (id kept), 相克 cut (a quiz), 底册
// a 大场面 (setpieces/diche.js) — wm-laba has no board; the marks they wrote come with the ways on. 喂饭桶 · 开炉夜
// told since 2026-10-20 (the 饭桶's old play deleted): wm-zhaojing's one board is 藏息.
const BOARDS = { 'wm-qianye': ['qianye-qiajue'], 'wm-zhaojing': ['zhaojing-mirror'], 'wm-dabi': ['dabi-sneeze'], 'wm-jiaxin': ['jiaxin-letter'] };

test('tasks/*.json are one list: 古六\'s boards come from tasks/h08.json, and an id defined twice fails the lint', () => {
  for (const id of [...Object.values(BOARDS).flat(), 'qianye-xiangke', 'laba-diche', 'heluo-kaipian']) assert.ok(content.tasks.tasks.some((t) => t.id === id), id);
  assert.ok(content.tasks.tasks.some((t) => t.id === 'kitchen-griddle'), 'world.json still read');
  assert.deepEqual(lint(content), []);
  const twice = { ...content, tasks: { ...content.tasks, tasks: [...content.tasks.tasks, content.tasks.tasks[0]] } };
  assert.ok(lint(twice).some((p) => /is defined twice/.test(p)));
});

test('古六 runs in the book\'s order on the `next` chain — 13 scenes, every one h08, the eve split into 前夜 and 腊八', () => {
  const chain = [];
  for (let id = 'wm-qianye'; id && CH.scenes[id]?.hui === 'h08';) { chain.push(id); id = CH.scenes[id].exits.map((e) => e.next).find(Boolean); }
  assert.deepEqual(chain, H08);
  for (const [scene, ids] of Object.entries(BOARDS)) {
    const sc = CH.scenes[scene];
    assert.deepEqual(sc.show.filter((c) => c.card === 'board').map((c) => c.id), ids, scene);
    assert.deepEqual(sc.offers.tasks, ids);
    const ways = sc.exits.filter((e) => !e.stay);
    for (const e of ways) assert.equal(e.needs?.task, ids.at(-1), `${scene}/${e.id} waits on its last board`);
    assert.ok(ids.length <= 2, 'two boards a scene at most');
  }
  assert.ok(CH.beats.find((b) => b.id === 'dabi').scenes.includes('wm-zhaojing'));
});

test('every board pays what the plan names: 修为 for cultivation, 灵石 for the lesson, the mark or the 恩仇簿 for the rest', () => {
  const t = (id) => content.tasks.tasks.find((x) => x.id === id);
  for (const id of ['qianye-qiajue', 'zhaojing-mirror', 'dabi-sneeze', 'laoyin-zhuqingting', 'heluo-kaipian']) assert.equal(t(id).grant.progress, 5, id);
  assert.equal(t('qianye-xiangke').grant.wealth, 3);
  assert.equal(t('laba-diche').marks.kept, 'diche');
  assert.equal(t('jiaxin-letter').ledger[0].who, 'sunergou');
  // the 开炉夜's things are the way on's (story things the 大比 spends): a skipped board still hands them over
  const sleep = CH.scenes['wm-zhaojing'].exits.find((e) => e.id === 'sleep');
  assert.deepEqual(sleep.grant, { table: 'scene', item: 'zipai-jing', more: { 'penti-fu': 1, 'yangyang-zhen': 3, 'niuzhi-ganlu': 1 } });
  assert.equal(CH.scenes['wm-qianye'].exits[0].grant, undefined, 'moved off the eve');
});

test('walking 古六 by its boards: 修为 rises at each cultivation board, the items land, the final is still lost', () => {
  let s = at('wm-qianye', 'waimen');
  const before = s.progress;
  s = play(s, 'qianye-qiajue', 'tight');
  assert.ok(s.progress > before, '讲堂三日 raised 修为');
  assert.equal(s.tell_owed.at(-1), 'after/wm-qianye', 'the rest of the lesson is told right after the board');
  assert.ok(!(s.marks ?? []).includes('xiangke'));
  s = must(resolve, s, { exit: 'eve' });
  assert.ok(s.marks.includes('xiangke'), 'the 五句 told, the way on writes the mark the 大比 reads');
  assert.equal(s.scene, 'wm-zhaojing');
  s = play(s, 'zhaojing-mirror', 'still'); // 开炉夜 told since 2026-10-20
  s = must(resolve, s, { exit: 'sleep' });
  for (const id of ['zipai-jing', 'penti-fu', 'yangyang-zhen', 'niuzhi-ganlu']) assert.ok(s.bag[id] > 0, id);
  assert.equal(s.scene, 'wm-laba');
  s = must(resolve, s, { exit: 'go' }); // 底册 is a 大场面 since 2026-10-19: no board before the way on
  assert.ok(s.marks.includes('diche'), 'the page burnt, the way on writes `diche`');
  s = must(resolve, play(s, 'dabi-sneeze', 'clean'), { exit: 'up' });
  assert.equal(s.scene, 'wm-lun1');
  s = must(resolve, { ...s, scene: 'wm-laoyin', place: 'zhengdian' }, { exit: 'final' }); // 猪蜻蜓 cut 2026-10-19: no board before it
  assert.equal(s.scene, 'wm-jiaxin');
  assert.equal(s.bag['foundation-pill'], undefined, 'no 筑基丹');
  assert.match(CH.scenes['wm-laoyin'].exits[0].story.zh, /……祁长松，胜。/);
  const n = s.ledger.length;
  s = play(s, 'jiaxin-letter');
  assert.equal(s.ledger.length, n + 1);
  assert.match(s.ledger.at(-1).what.zh, /我倒了七回，起来了七回/);
  s = must(resolve, { ...s, scene: 'wm-heluo', place: 'houshan' }, { exit: 'read' }); // 念开篇 cut 2026-10-19: the rhyme is the way on's
  assert.ok(s.bag.heluo > 0);
});

test('a way on waits on its board: refused in the world\'s words until the board is counted', () => {
  for (const [scene, place, exit] of [['wm-qianye', 'waimen', 'eve'], ['wm-zhaojing', 'waimen', 'sleep'], ['wm-dabi', 'zhengdian', 'up'], ['wm-jiaxin', 'waimen', 'rest']]) {
    const out = resolve(at(scene, place), content, ctx(), { exit });
    assert.equal(out.result.ok, false, `${scene}/${exit}`);
    assert.ok(out.result.say, `${scene}/${exit} says why`);
  }
});

test('the 10-19 sweep and the 10-20 调息 cut: 讲堂 plays 砸寨 (讲堂试法), 相克 and 底册 are off the story — their passages told, their marks from the ways on, old saves fine', () => {
  const t = (id) => content.tasks.tasks.find((x) => x.id === id);
  // 气走经脉 · 掐诀 (10-19) gave way to 砸寨 · 讲堂试法 (10-20, Hanli: 「调息感觉太多了」 → 「可以」), in the same slot.
  assert.equal(t('qianye-qiajue').game, 'zhazhai');
  assert.equal(t('qianye-qiajue').deal.lv, 'jiangtang');
  assert.ok(!content.games.games.some((g) => g.id === 'qimai' && g.task === 'qianye-qiajue'), 'no 气走经脉 row names it');
  for (const g of Object.values(t('qianye-qiajue').deal.grades)) assert.ok(Object.hasOwn(t('qianye-qiajue').marks, g), `grade ${g}`);
  assert.equal(t('qianye-xiangke').cut, '2026-10-19');
  assert.equal(t('laba-diche').cut, '2026-10-19');
  const q = CH.scenes['wm-qianye'], l = CH.scenes['wm-laba'];
  assert.match(q.story.zh, /头一天他不教法术，先教手[\s\S]*第二天他教咒。$/, 'day one told before the board');
  assert.match(q.story_after.zh, /^第三天，褚先生教的是扣。[\s\S]*木得金而伐/, 'day three and the 五句 after it');
  assert.equal(q.exits[0].mark, 'xiangke');
  assert.equal(l.show, undefined); assert.equal(l.exits[0].needs, undefined);
  assert.equal(l.exits[0].mark, 'diche');
  for (const k of ['story', 'story_full']) {
    assert.match(l[k].zh, /小满把那张纸凑到灶口，看着它卷起来，黑了。纸上的字，他已经一个一个记进了肚子里。\{景=diche\}$/);
    assert.match(l[k].en, /\{景=diche\}$/);
  }
  // an old save holding the cut boards offered lets them go; the way on is open and writes the marks
  let s = fitWorld({ ...at('wm-qianye', 'waimen'), tasks: { 'qianye-qiajue': { status: 'done' }, 'qianye-xiangke': { status: 'offered' } } }, content);
  assert.equal(s.tasks['qianye-xiangke'], undefined);
  s = must(resolve, s, { exit: 'eve' });
  s = fitWorld({ ...s, scene: 'wm-laba', tasks: { ...s.tasks, 'laba-diche': { status: 'offered' } } }, content);
  assert.equal(s.tasks['laba-diche'], undefined);
  s = must(resolve, s, { exit: 'go' });
  assert.ok(s.marks.includes('xiangke') && s.marks.includes('diche'));
  // 念开篇 cut too (a recall drill): the rhyme is the way on's own passage; an old save holding it offered lets it go.
  assert.equal(t('heluo-kaipian').cut, '2026-10-19');
  const h = CH.scenes['wm-heluo'];
  assert.equal(h.show, undefined); assert.equal(h.exits[0].needs, undefined);
  assert.match(h.exits[0].story.zh, /戴九履一，左三右七，二四为肩，六八为足，五居中央。/);
  const old = fitWorld({ ...at('wm-heluo', 'houshan'), tasks: { 'heluo-kaipian': { status: 'offered' } } }, content);
  assert.equal(old.tasks['heluo-kaipian'], undefined);
  assert.ok(must(resolve, old, { exit: 'read' }).bag.heluo > 0, 'the scroll still comes');
});

test('刮鞋底 at the 草屋: a choice before the 拜师帖 — 瞿老\'s 「两个」 only for a boy who scraped on the steps; either choice hides both', () => {
  const ids = (s) => look(s, content, ctx()).scene.buttons.map((b) => b.id);
  const walked = at('wm-caowu', 'houshan');
  const plain = { ...walked, marks: walked.marks.filter((m) => m !== 'steps-steady') }; // 00-gate's rush: no scrape on the steps
  assert.deepEqual(ids(plain), ['scrape', 'step'], 'no 拜师帖 before the stone; no 「也刮过」 without 古三\'s scrape');
  const scraped = { ...plain, marks: [...plain.marks, 'steps-steady'] };
  assert.deepEqual(ids(scraped), ['scrape-again', 'step']);
  const again = CH.scenes['wm-caowu'].exits.find((e) => e.id === 'scrape-again');
  assert.match(again.story.zh, /九月初九那天，在台阶上，你也刮过/);
  assert.doesNotMatch(CH.scenes['wm-caowu'].exits.find((e) => e.id === 'scrape').story.zh, /也刮过/);
  for (const [s, pickd] of [[plain, 'step'], [scraped, 'scrape-again']]) {
    const on = must(resolve, s, { exit: pickd });
    assert.equal(on.scene, 'wm-caowu');
    assert.deepEqual(ids(on), ['sign']);
    assert.equal(must(resolve, on, { exit: 'sign' }).scene, 'wm-heluo');
  }
});

test('the 大比 reads what 古六 taught: 底册 lends 望气 to the 卢方 and 秦雁 bouts, 相克 puts the foe\'s line at the door', () => {
  const lu = CH.scenes['wm-fushi'].exits.find((e) => e.id === 'flip').game;
  const s = at('wm-fushi', 'zhengdian');
  assert.equal(readOf(s, lu), 0);
  assert.equal(fightSetup(content, s, foeOf(content, lu), NOW, lu.id).you.insight ?? 0, 0);
  const read = { ...s, marks: [...s.marks, 'diche', 'xiangke'] };
  assert.equal(fightSetup(content, read, foeOf(content, lu), NOW, lu.id, null, readOf(read, lu)).you.insight, 1);
  const door = look(read, content, ctx()).scene.exits.find((e) => e.id === 'flip').duel;
  assert.equal(door.setup.you.insight, 1);
  assert.ok(door.creature.hints.some((h) => /金得火而缺/.test(h)));
  assert.ok(door.creature.hints.some((h) => /使完金刃，要喘一口气/.test(h)));
  assert.equal(look(s, content, ctx()).scene.exits.find((e) => e.id === 'flip').duel.creature.hints, undefined, 'nothing learned, nothing shown');
});

/* ── the boards themselves ── */

test('no 古六 board draws its own skip (the page lays it, 2026-10-15), and each says what it is in both languages', () => {
  for (const mod of [sneeze]) { // the rest of 古六's old boards deleted 2026-10-19 (「没用在游戏中的, 都删了吧」); 喂饭桶 · 开炉夜 2026-10-20
    const s = mod.newGame('t');
    for (const lang of ['zh', 'en']) {
      assert.doesNotMatch(mod.html(s, lang), /data-g="skip"/);
      assert.ok(mod.meta.name[lang] && mod.meta.how[lang]);
    }
    assert.equal(typeof mod.stuck, 'function');
    // the page's skip: won, no grade — the board still draws a line, never a blank
    const left = { ...mod.act(s, { g: 'start' }).state, won: true, grade: null };
    assert.match(mod.html(left, 'zh'), /g-line-say">[^<]+/);
  }
});

test('开炉夜 told (2026-10-20): the lid on the fourth press and the five feeds read in the book\'s words, after the mirror\'s board', () => {
  const sc = CH.scenes['wm-zhaojing'];
  for (const lang of ['zh', 'en']) assert.ok(checkJieben(sc.story_after[lang], sc.story_after_full[lang], lang).ok, lang);
  assert.match(sc.story_after.zh, /按到第四回，「咔哒」[\s\S]*喷嚏符[\s\S]*痒痒针[\s\S]*自拍镜[\s\S]*「嗝」[\s\S]*猪蜻蜓；乘风而起，见木而栖[\s\S]*收破烂的/);
  const old = fitWorld({ ...at('wm-zhaojing', 'waimen'), tasks: { 'zhaojing-fantong': { status: 'offered' } } }, content);
  assert.equal(old.tasks['zhaojing-fantong'], undefined, 'a save holding the old board offered lets it go');
});

test('喷嚏符: step aside on the shoulder\'s drop, a thread of qi, push on the third sneeze → clean; idle, the fist lands', () => {
  let s = run(sneeze, sneeze.newGame('a'), [{ g: 'start' }]);
  s = liveUntil(sneeze, s, (x) => (x.note === 'tell' ? sneeze.act(x, { g: 'yield' }).state : x), (x) => x.phase !== 'face');
  s = run(sneeze, s, [{ g: 'hold' }]);
  for (let i = 0; i < 5; i += 1) s = sneeze.tick(s, 100);
  s = run(sneeze, s, [{ g: 'release' }]);
  assert.equal(s.phase, 'sneeze');
  s = liveUntil(sneeze, s, (x) => (x.k === 2 && x.part === 'ah' ? sneeze.act(x, { g: 'push' }).state : x));
  assert.equal(s.grade, 'clean');
  let hit = run(sneeze, sneeze.newGame('b'), [{ g: 'start' }]);
  for (let i = 0; i < 30; i += 1) hit = sneeze.tick(hit, 100);
  assert.ok(hit.hits >= 1);
});

test('猪蜻蜓 has left wm-laoyin: no board before 摸出那个油纸包; an old save holding it offered lets it go', () => {
  const sc = CH.scenes['wm-laoyin'];
  assert.ok(!(sc.show ?? []).some((c) => c.id === 'laoyin-zhuqingting') && !(sc.offers?.tasks ?? []).includes('laoyin-zhuqingting'));
  assert.ok(!sc.exits.some((e) => e.needs?.task === 'laoyin-zhuqingting'));
  assert.match(sc.story.zh, /香，烧过一半了。$/);
  assert.equal(content.tasks.tasks.find((t) => t.id === 'laoyin-zhuqingting').cut, '2026-10-19');
  assert.equal(content.games.games.find((g) => g.id === 'zhuqingting' && g.replaced !== 'cut'), undefined, 'its game deleted 2026-10-19; the task id stays, cut');
  const old = fitWorld(at('wm-laoyin', 'zhengdian', { tasks: { 'laoyin-zhuqingting': { status: 'offered' } } }), content);
  assert.equal(old.tasks['laoyin-zhuqingting'], undefined, 'never winnable here now: let go');
  assert.equal(must(resolve, old, { exit: 'final' }).scene, 'wm-jiaxin');
});
