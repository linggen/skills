// 古六 (h08) played (the per-回 plan, 2026-10-15, Hanli 「可以，开工，先做古六」): the eve split into
// three scenes, nine boards each the book's own action, the 刮鞋底 choice, and what each board pays.
// The tasks live in their own file (tasks/h08.json — content.mjs reads every tasks/*.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { fightSetup, readOf } from '../scripts/rules/cards.mjs';
import { foeOf } from '../scripts/rules/world.mjs';
import { TO_OPEN, walk } from './prologue.mjs';
import * as qiajue from '../scripts/games/qiajue.js';
import * as xiangke from '../scripts/games/xiangke.js';
import * as mirror from '../scripts/games/mirrortongpu.js';
import * as fantong from '../scripts/games/fantongqianye.js';
import * as diche from '../scripts/games/diche.js';
import * as sneeze from '../scripts/games/sneeze.js';
import * as zqt from '../scripts/games/zhuqingting.js';
import * as letter from '../scripts/games/letter.js';
import * as kaipian from '../scripts/games/kaipian.js';
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
const BOARDS = { 'wm-qianye': ['qianye-qiajue', 'qianye-xiangke'], 'wm-zhaojing': ['zhaojing-mirror', 'zhaojing-fantong'], 'wm-laba': ['laba-diche'], 'wm-dabi': ['dabi-sneeze'], 'wm-laoyin': ['laoyin-zhuqingting'], 'wm-jiaxin': ['jiaxin-letter'], 'wm-heluo': ['heluo-kaipian'] };

test('tasks/*.json are one list: 古六\'s boards come from tasks/h08.json, and an id defined twice fails the lint', () => {
  for (const id of Object.values(BOARDS).flat()) assert.ok(content.tasks.tasks.some((t) => t.id === id), id);
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
  assert.equal(s.tell_owed.at(-1), 'after/wm-qianye', 'the rest of the lesson is told right after the first board');
  const stones = s.wealth;
  s = play(s, 'qianye-xiangke', 'clean');
  assert.equal(s.wealth, stones + 3);
  assert.ok(s.marks.includes('xiangke'));
  s = must(resolve, s, { exit: 'eve' });
  assert.equal(s.scene, 'wm-zhaojing');
  s = play(play(s, 'zhaojing-mirror', 'still'), 'zhaojing-fantong');
  s = must(resolve, s, { exit: 'sleep' });
  for (const id of ['zipai-jing', 'penti-fu', 'yangyang-zhen', 'niuzhi-ganlu']) assert.ok(s.bag[id] > 0, id);
  assert.equal(s.scene, 'wm-laba');
  s = must(resolve, play(s, 'laba-diche', 'kept'), { exit: 'go' });
  s = must(resolve, play(s, 'dabi-sneeze', 'clean'), { exit: 'up' });
  assert.equal(s.scene, 'wm-lun1');
  s = must(resolve, play({ ...s, scene: 'wm-laoyin', place: 'zhengdian' }, 'laoyin-zhuqingting', 'caught'), { exit: 'final' });
  assert.equal(s.scene, 'wm-jiaxin');
  assert.equal(s.bag['foundation-pill'], undefined, 'no 筑基丹');
  assert.match(CH.scenes['wm-laoyin'].exits[0].story.zh, /……祁长松，胜。/);
  const n = s.ledger.length;
  s = play(s, 'jiaxin-letter');
  assert.equal(s.ledger.length, n + 1);
  assert.match(s.ledger.at(-1).what.zh, /我倒了七回，起来了七回/);
  s = play({ ...s, scene: 'wm-heluo', place: 'houshan' }, 'heluo-kaipian');
  s = must(resolve, s, { exit: 'read' });
  assert.ok(s.bag.heluo > 0);
});

test('a way on waits on its board: refused in the world\'s words until the board is counted', () => {
  for (const [scene, place, exit] of [['wm-qianye', 'waimen', 'eve'], ['wm-zhaojing', 'waimen', 'sleep'], ['wm-laba', 'waimen', 'go'], ['wm-dabi', 'zhengdian', 'up'], ['wm-laoyin', 'zhengdian', 'final'], ['wm-jiaxin', 'waimen', 'rest'], ['wm-heluo', 'houshan', 'read']]) {
    const out = resolve(at(scene, place), content, ctx(), { exit });
    assert.equal(out.result.ok, false, `${scene}/${exit}`);
    assert.ok(out.result.say, `${scene}/${exit} says why`);
  }
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
  for (const mod of [qiajue, xiangke, mirror, fantong, diche, sneeze, zqt, letter, kaipian]) {
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

test('讲堂三日: the right 文 for each spell, all eight lines in order, the fist gripped through the sweat → tight; slips → loose', () => {
  let s = run(qiajue, qiajue.newGame('a'), [{ g: 'start' }]);
  s = run(qiajue, s, s.order.map((id) => ({ g: 'pinch', w: qiajue.SPELLS.find((x) => x.id === id).wen })));
  assert.equal(s.phase, 'chant-ready');
  s = run(qiajue, s, [{ g: 'start' }, { g: 'say', i: qiajue.DECOY }]);
  assert.match(qiajue.html(s, 'zh'), /倒打出一个嗝来/);
  s = run(qiajue, s, [...qiajue.CHANT.keys()].map((i) => ({ g: 'say', i: String(i) })));
  assert.equal(s.phase, 'kou-ready');
  s = liveUntil(qiajue, run(qiajue, s, [{ g: 'start' }]), (x) => (x.note === 'sweat' ? qiajue.act(x, { g: 'grip' }).state : x));
  assert.equal(s.grade, 'tight', 'one burp is forgiven (two slips at most)');
  assert.equal(qiajue.gradeOf({ wrongs: 3, outs: 0 }), 'loose');
  let idle = run(qiajue, qiajue.newGame('b'), [{ g: 'start' }]);
  idle = run(qiajue, idle, idle.order.map((id) => ({ g: 'pinch', w: qiajue.SPELLS.find((x) => x.id === id).wen })));
  idle = run(qiajue, idle, [{ g: 'start' }, ...[...qiajue.CHANT.keys()].map((i) => ({ g: 'say', i: String(i) })), { g: 'start' }]);
  idle = liveUntil(qiajue, idle, (x) => x, (x) => x.phase !== 'kou');
  assert.equal(idle.phase, 'kou-out', 'an ungripped fist leaks out — 白掐一回');
  assert.equal(qiajue.gradeOf({ wrongs: 0, outs: 0 }), 'tight');
});

test('相克: answering each throw with what eats it is clean; a wrong answer gets the 素问 line and the throw comes back', () => {
  let s = run(xiangke, xiangke.newGame('a'), [{ g: 'start' }]);
  const first = s.queue[0], wrong = xiangke.SPELLS.find((x) => x !== xiangke.EATS[first]);
  s = run(xiangke, s, [{ g: 'answer', x: wrong }]);
  assert.equal(s.queue.at(-1), first);
  while (!s.won) s = xiangke.act(s, { g: 'answer', x: xiangke.EATS[s.queue[0]] }).state;
  assert.equal(s.grade, 'clean');
  assert.equal(xiangke.EATS.wall, 'vine', '土得木而达');
  assert.equal(xiangke.EATS.vine, 'blade', '木得金而伐');
});

test('藏息: breathing out long under the light keeps it still; doing nothing flares the token and the light lingers', () => {
  const good = liveUntil(mirror, run(mirror, mirror.newGame('a'), [{ g: 'start' }]), (x) => (Math.abs(x.p - 7) < 0.5 && !x.out ? mirror.act(x, { g: 'hold' }).state : x));
  assert.equal(good.grade, 'still');
  const idle = liveUntil(mirror, run(mirror, mirror.newGame('b'), [{ g: 'start' }]), (x) => x);
  assert.equal(idle.grade, 'shaky');
  assert.ok(idle.flares > 0);
});

test('喂饭桶: the lid gives on the fourth press; the stone waits till the common things are fed; the book\'s outputs', () => {
  let s = run(fantong, fantong.newGame('a'), [{ g: 'press' }, { g: 'press' }, { g: 'press' }]);
  assert.equal(s.phase, 'ready');
  s = run(fantong, s, [{ g: 'press' }, { g: 'feed', f: 'stone' }]);
  assert.equal(s.note, 'wait');
  s = run(fantong, s, ['hair', 'whisker', 'mirror', 'sandal', 'stone'].map((f) => ({ g: 'feed', f })));
  assert.equal(s.won, true);
  const html = fantong.html(s, 'zh');
  assert.match(html, /猪蜻蜓；乘风而起，见木而栖/);
  assert.match(html, /收破烂的/);
});

test('底册: only the book\'s three lines are legible; by heart before the burn is `kept`', () => {
  const html = diche.html(run(diche, diche.newGame('a'), [{ g: 'start' }, { g: 'read', r: 'lufang' }]), 'zh');
  assert.match(html, /使完金刃，要喘一口气/);
  assert.equal((html.match(/is-blur/g) ?? []).length, diche.ROWS.filter((r) => !r.reads).length);
  const kept = run(diche, diche.newGame('a'), [{ g: 'start' }, ...['lufang', 'lufang', 'qinyan', 'qinyan', 'qichangsong'].map((r) => ({ g: 'read', r })), { g: 'burn' }]);
  assert.equal(kept.grade, 'kept');
  assert.equal(run(diche, diche.newGame('a'), [{ g: 'start' }, { g: 'burn' }]).grade, 'hasty');
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

test('猪蜻蜓: shoving bounces; the slap before dusk is held back; after it, on the back foot\'s lift — and the result is still 「……祁长松，胜。」', () => {
  let s = run(zqt, zqt.newGame('a'), [{ g: 'start' }, { g: 'shove' }, { g: 'slap' }]);
  assert.equal(s.early, 1);
  assert.equal(s.phase, 'press');
  s = liveUntil(zqt, s, (x) => (x.phase === 'close' && x.note === 'light' ? zqt.act(x, { g: 'slap' }).state : x));
  assert.ok(['caught', 'late'].includes(s.grade));
  assert.match(zqt.html(s, 'zh'), /……祁长松，胜。/);
});

test('写信: the boasts are rubbed out, the letter signed and 漏勺 added; 孙二狗\'s never names who knocked him down', () => {
  let s = run(letter, letter.newGame('a'), [{ g: 'start' }, { g: 'write', l: 'xian' }, { g: 'write', l: 'ma' }, { g: 'write', l: 'men' }]);
  assert.match(letter.html(s, 'zh'), /<s>娘，我打赢了马小宝<\/s>/);
  s = run(letter, s, [...letter.BODY.map((b) => ({ g: 'write', l: b.id })), { g: 'sign' }, { g: 'add' }, { g: 'write', l: 'who' }, { g: 'write', l: 'qi' }]);
  assert.equal(s.won, true);
  const html = letter.html(s, 'zh');
  assert.match(html, /娘，漏勺也能打水。/);
  assert.match(html, /<s>是内门的卢方把我打倒的。<\/s>/);
});

test('念开篇: his mother\'s rhyme lays the 洛书 — 戴九履一，左三右七，二四为肩，六八为足，五居中央 — every line fifteen', () => {
  let s = run(kaipian, kaipian.newGame('a'), [{ g: 'start' }, { g: 'cell', i: '0' }]);
  assert.equal(s.note, 'wrong', 'the nine is on the head, not the left shoulder');
  for (const n of [9, 1, 3, 7, 2, 4, 6, 8, 5]) s = kaipian.act(s, { g: 'cell', i: String(kaipian.SQUARE.indexOf(n)) }).state;
  assert.equal(s.won, true);
  assert.deepEqual(s.cells, kaipian.SQUARE);
});
