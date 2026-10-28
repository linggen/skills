// The opening's playable beats (Hanli, 2026-10-14: 「每看一会儿剧情就要有游戏可以玩」):
// 接雨 · 喂饼 · 射鹿 · 算账 · 吹鹅毛 (追踪 cut 10-16, doc/games.md). Each board opens, can be finished well and
// badly, and its scene goes on either way; the grade writes its mark and, where the
// exits wait on it, picks the way on. The lint accepts them; the rhythm warns; the
// map unfolds once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent, warnings, RHYTHM_CAP } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { jiudingBrief, unfolded } from '../scripts/rules/inkmap.mjs';
import { storyChars, stretchesOf } from '../scripts/rhythm.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { TO_HALL, TO_VALLEY, walk } from './prologue.mjs';
import * as rain from '../scripts/games/rain.js';

const content = loadContent();
const NOW = new Date('2026-10-14T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const scenes = content.chapters['00-prologue'].scenes;

/* ── the games, alone ── */

const play = (mod, s, moves) => moves.reduce((st, m) => (typeof m === 'number' ? mod.tick(st, m) : mod.act(st, m).state), s);
const bothLangs = (mod, s) => { for (const lang of ['zh', 'en']) assert.ok(mod.html(s, lang).length > 40, lang); };

test('every game: meta in both languages, opens with a control to touch, draws in both languages', () => {
  // 喂饼 is dealt its levels (games.json, since 2026-10-16); its own tests are bread.test.mjs.
  for (const [mod, control] of [[rain, /data-g="start"/]]) {
    assert.ok(mod.meta.name.zh && mod.meta.name.en && mod.meta.how.zh && mod.meta.how.en, mod.meta.id);
    const s = mod.newGame('seed');
    assert.match(mod.html(s, 'zh'), control, mod.meta.id);
    bothLangs(mod, s);
    assert.equal(mod.act(s, { g: 'nonsense' }).won, false, 'an unknown move changes nothing');
  }
});

/* 接雨 (打地鼠 since 2026-10-16): a quick hand keeps the floor dry; a slow one leaves puddles; idle floods (rain.test.mjs). */
function rainBot(seed, react) {
  let s = rain.act(rain.newGame(seed), { g: 'start' }).state, since = 0;
  while (!s.won) {
    s = rain.tick(s, 100); since += 100;
    if (s.won || since < react) continue;
    since = 0;
    for (let i = 0; i < rain.SPOTS.length; i += 1) if (s.basins[i] == null && rain.leakingAt(s.sched, i, s.t)) s = rain.act(s, { g: 'spot', i }).state;
  }
  return s;
}
test('接雨: seventeen leaks caught — quick hands keep the floor dry, slow ones leave puddles; the fifth watch stops the rain', () => {
  const well = rainBot('a', 300);
  assert.equal(well.grade, 'dry');
  assert.equal(rain.fullCount(well), rain.NEED);
  assert.ok(well.t < 90000, 'about a minute');
  const slow = rainBot('a', 1800); // a glance every 1.8 s, every leaking spot set at once (pairs since 10-19)
  assert.equal(slow.won, true);
  assert.equal(slow.grade, 'wet');
  assert.equal(slow.floods, 0, 'slow but trying: never flooded');
  // Under the flood line to the end: the fifth watch ends it, short.
  const late = rain.act(rain.newGame('a'), { g: 'start' }).state, at = rain.LIMIT - 200;
  const k = late.sched.drips.filter((d) => d.at <= at).length, e = late.sched.leaks.filter((l) => l.to <= at).length;
  const watch = play(rain, { ...late, t: at, k, e }, [400]);
  assert.equal(watch.won, true, 'the fifth watch ends it');
  assert.equal(watch.grade, 'wet');
  assert.match(rain.html(well, 'zh'), /十七个盆，一个不少/);
  assert.match(rain.html(watch, 'en'), /fifth watch/);
});

// 算账 (scale) and 吹鹅毛 (feather): their games deleted 2026-10-19 (「没用在游戏中的, 都删了吧」), their scenes' boards cut 10-16.

/* ── the scenes ── */

const atScene = (id) => {
  const steps = [...TO_HALL];
  let s = newState(content, 'zh', NOW);
  for (const step of steps) {
    if (s.scene === id) return s;
    s = walk(s, [step], content, NOW);
  }
  return s.scene === id ? s : null;
};
/* The board won as the page reports it — with its grade — and handed in. */
const won = (s, id, grade) => {
  // A scene's boards play in `show` order (batch two): any before this one are played first.
  const order = (content.chapters[s.chapter]?.scenes?.[s.scene]?.show ?? []).filter(c => c.card === 'board').map(c => c.id);
  for (const b of order.slice(0, Math.max(0, order.indexOf(id)))) if (s.tasks?.[b]?.status !== 'done') s = won(s, b, Object.keys(content.tasks.tasks.find(t => t.id === b)?.marks ?? {})[0]);
  const w = win(s, content, ctx(), { id, grade });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  const d = task(w.state, content, ctx(), { action: 'done', id });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  return d.state;
};

const BEATS = [
  ['00-shiao', 'rain-basins', 'begin', ['dry', 'wet'], { dry: 'rain-caught', wet: 'rain-puddled' }],
  // 第一回's lineup (2026-10-21, Hanli: 「用塔防作为主力」, then 「按你的建议来」): the two 塔防 boards and 忍字 as a 气走经脉 level —
  // no grade, no mark; the way on only waits.
  ['00-baicai', 'baicai-hens', 'evening', [undefined], {}],
  // The three 割绳子 levels, back 2026-10-20 (Hanli: 「可以, 放宽, 把那三关加进去」): both ways on wait for each, the grade only a mark.
  ['00-masan', 'masan-taunt', 'endure', [undefined], {}],
  ['00-masan', 'masan-taunt', 'strike', [undefined], {}],
  // 守灶台 (守山门, 2026-10-22): the daydream on the floor after the bowl breaks; the way 00-masan took is the one shown
  ['00-zaotai', 'masan-zaotai', 'endure', [undefined], {}],
  ['00-rent', 'rent-scale', 'dumb', ['exact', 'over'], { exact: 'rent-exact', over: 'rent-over' }],
  ['00-rent', 'rent-scale', 'truth', ['exact', 'over'], { exact: 'rent-exact', over: 'rent-over' }],
];

/* Cut 2026-10-16 (Hanli 「入门前的怎么办? 减少数量, 推动剧情」): before 入门 the boards were only 接雨 · 拽 · 喂饼 ·
   射鹿 · 洛书门 (and the village maps, another lane's). Relaxed 2026-10-20 (「可以, 放宽, 把那三关加进去」): the
   built 割绳子 levels 忍字 · 认路 · 算账 are back in their scenes; the old weak boards stay cut — these scenes read
   whole and go on with no board. 00-halfyear's 吹鹅毛 stays cut; the scene has a board again since 2026-10-20 (the
   reading cap): 气走经脉 · 挑水上坡 on the cut 练功's task id — told again 2026-10-20 (the 调息 cut, Hanli: 「调息感觉太多了」),
   the passage whole: the scene has no board — until 2026-10-21 (the 卷一 small-game plan): 雪夜柴垛, a 塔防, at the same split.
   The plan's three 塔防 before 入门 in 古二 and 古三 (Hanli 10-21: thirteen boards before 入门, 「start building」): 抬鹿下山 on
   00-deer's way on (its own scene, 00-tailu), 雪夜柴垛 in 00-halfyear, 泗水路 in 00-gate after the road. */
// 认路 cut again 2026-10-21 (第一回's lineup, Hanli: 「按你的建议来」); 00-yinyue has a board again since 10-22 (二十问 · 银月),
// so it is no longer a scene that reads whole — 认路's own cut is held in the 第一回 lineup test.
// 拽爹上崖 cut 2026-10-22 (Hanli: 「拽爹上崖 有点奇怪」): 00-fall reads whole to 把爹拽回山壁; 守灶台 in 00-zaotai keeps 第一回 at six.
// 太鼓 · 寿宴锣鼓 on 00-chushan 2026-10-28 (Hanli: 太鼓 into the story): 吴婆婆's memory of the 锣鼓, 太鼓's first level.
// 洗髓 back on 00-sleep 2026-10-26 (全文后的小游戏) on a new task (`sleep-xisui`): the old `xisui-hold` stays cut.
const CUT = [['00-kitchen', 'kitchen-griddle', 'go'], ['00-halfyear', 'halfyear-carry', 'on'], ['00-fall', 'fall-storm', 'check']];
const KEPT = { '00-shiao': ['rain-basins'], '00-baicai': ['baicai-hens'], '00-masan': ['masan-taunt'], '00-zaotai': ['masan-zaotai'], '00-chushan': ['chushan-luogu'], '00-cave': ['cave-fire', 'bread-share'], '00-yinyue': ['yinyue-what'], '00-cliff': ['cliff-shangya'], '00-deer': ['deer-wind'], '00-tailu': ['deer-carry'], '00-rent': ['rent-scale'], '00-bluff': ['rent-bluff'], '00-xiuxian': ['xiuxian-xue'], '00-sleep': ['sleep-xisui'], '00-halfyear': ['halfyear-chaiduo'], '00-uncle': ['uncle-jiujiu'], '00-notice': ['notice-shuitong', 'notice-wupo'], '00-gate': ['gate-sishui', 'gate-crowd'], '00-steps': ['steps-sanbai', 'steps-tuifeng'], '00-luoshu': ['gate-luoshu'], '00-linzi': ['longzhi-shidan'], '00-hall': ['hall-celing'] };
const VILLAGE = new Set(['village-day', 'village-dong', 'village-eve']);

test('before 入门 the scenes carry exactly the kept boards (the village maps aside): 接雨 · 守白菜 · 忍字 · 守灶台 · 寿宴锣鼓 · 喂饼 · 守火 · 射鹿 · 抬鹿下山 · 算账 · 雪夜柴垛 · 水桶 · 泗水路 · 洛书门', () => {
  const ch = content.chapters['00-prologue'];
  const boards = {};
  // The 古 line's scenes (the 今 interlude spliced in is its own line, not counted here).
  for (const sc of Object.values(ch.scenes).filter(x => !/^j/.test(x.hui ?? ''))) {
    const ids = (sc.show ?? []).filter(c => c.card === 'board').map(c => c.id).filter(id => !VILLAGE.has(id));
    if (ids.length) boards[sc.id] = ids;
  }
  assert.deepEqual(boards, KEPT);
});

test('a cut board has left its scene — not shown, not offered, no way on waits on it — and the scene goes on with no mark', () => {
  for (const [sid, tid, exit] of CUT) {
    const sc = scenes[sid];
    assert.ok(!(sc.show ?? []).some(c => c.id === tid), `${sid}: not shown`);
    assert.ok(!(sc.offers?.tasks ?? []).includes(tid), `${sid}: not offered`);
    assert.ok(!sc.exits.some(e => e.needs?.task === tid), `${sid}: nothing waits on it`);
    assert.ok(!sc.story_after || KEPT[sid]?.length, `${sid}: the passage reads whole (split only for a board kept there: 00-halfyear's 雪夜柴垛)`);
    let s = atScene(sid);
    assert.ok(s, `walked to ${sid}`);
    assert.equal(s.tasks[tid], undefined, `${sid}: never offered`);
    s = tellOf(content, s)?.keep ?? s;
    for (const kept of KEPT[sid] ?? []) s = won({ ...s, stamina: 100 }, kept); // the board the scene keeps (雪夜柴垛) is played
    const on = resolve(s, content, ctx(), { exit });
    assert.equal(on.result.ok, true, `${sid}: ${JSON.stringify(on.result)}`);
    assert.notEqual(on.state.scene, sid, `${sid}: the story moved on`);
    for (const m of on.state.marks ?? []) assert.doesNotMatch(m, /^(taunt|way|griddle|rent|feather|carry)-/, `${sid}: no cut board's mark`);
  }
  // 吹鹅毛 stays cut in 00-halfyear; 挑水上坡 came and went 2026-10-20 (the 调息 cut); 雪夜柴垛 there since 10-21
  const hy = scenes['00-halfyear'];
  assert.ok(!(hy.show ?? []).some(c => c.id === 'halfyear-carry') && !hy.exits.some(e => e.needs?.task === 'halfyear-carry'), '00-halfyear: 挑水上坡 still cut');
  assert.ok(!(hy.show ?? []).some(c => c.id === 'feather-breath') && !(hy.offers?.tasks ?? []).includes('feather-breath'), '00-halfyear: 吹鹅毛 still cut');
});

test('each scene stands its board on the stage, offers it, and its way on waits for it', () => {
  for (const [sid, tid, exit] of [...BEATS, ['00-cave', 'bread-share', 'share'], ['00-notice', 'notice-wupo', 'go'],
    ['00-tailu', 'deer-carry', 'on'], ['00-bluff', 'rent-bluff', 'on'], ['00-xiuxian', 'xiuxian-xue', 'on'], ['00-sleep', 'sleep-xisui', 'bath'], ['00-gate', 'gate-crowd', 'on'], ['00-steps', 'steps-tuifeng', 'on'], ['00-yinyue', 'yinyue-what', 'follow']]) {
    const sc = scenes[sid];
    assert.ok(sc.show.some(c => c.card === 'board' && c.id === tid), sid);
    assert.ok(sc.offers.tasks.includes(tid), sid);
    assert.equal(sc.exits.find(e => e.id === exit).needs.task, tid, sid);
    const s = atScene(sid);
    assert.ok(s, `walked to ${sid}`);
    assert.equal(s.tasks[tid]?.status, 'offered', `${sid}: offered on entry`);
    const before = resolve(sid === '00-heisong' ? walk(s, [['look', { at: 'stone' }]], content, NOW) : s, content, ctx(), { exit });
    assert.equal(before.result.refused, 'needs', `${sid}: not before the board`);
    assert.ok(before.result.say, `${sid}: in the world's words`);
    const l = look(s, content, ctx());
    assert.ok(l.tasks.some(t => t.id === tid && t.game), `${sid}: Look hands the page its game`);
  }
});

test('well or badly, each scene goes on — the grade only writes its mark', () => {
  for (const [sid, tid, exit, grades, marks] of BEATS) {
    for (const grade of grades) {
      let s = atScene(sid);
      if (sid === '00-heisong') s = walk(s, [['look', { at: 'stone' }]], content, NOW);
      s = won({ ...s, stamina: 100 }, tid, grade);
      if (grade !== undefined) {
        assert.ok(s.marks.includes(marks[grade]), `${sid} ${grade}`);
        assert.equal(s.grades[tid], grade);
      }
      const on = resolve(s, content, ctx(), { exit });
      assert.equal(on.result.ok, true, `${sid} ${grade}: ${JSON.stringify(on.result)}`);
      assert.notEqual(on.state.scene, sid, `${sid} ${grade}: the story moved on`);
    }
  }
});

/* The three 割绳子 levels back before 入门 (2026-10-20): no pay — no 修为, no 灵石, nothing held back for later — and
   算账 plays where 马三 calls 「称肉！」, the rest of the passage (「秤称完了…」) read after it. */
test('守白菜 · 忍字 · 守火 · 算账 pay nothing before 入门: the grade writes its mark, nothing else moves', () => {
  for (const [sid, tid, grade] of [['00-baicai', 'baicai-hens'], ['00-masan', 'masan-taunt'], ['00-zaotai', 'masan-zaotai'], ['00-cave', 'cave-fire'], ['00-rent', 'rent-scale', 'exact']]) {
    const s = { ...atScene(sid), stamina: 100 };
    const after = won(s, tid, grade);
    for (const k of ['progress', 'wealth', 'tier', 'step']) assert.deepEqual(after[k], s[k], `${tid}: ${k} unchanged`);
    assert.deepEqual(after.bag, s.bag, `${tid}: nothing in the bag`);
  }
  const sc = scenes['00-rent'];
  assert.match(sc.story.zh, /……称肉！」$/);
  assert.match(sc.story_after.zh, /^少的那一条腿，他懒得追/);
});

test('喂饼: the grade takes 分它一半 or 自己吃 — the amount a mark for the 恩仇簿 and the story', () => {
  const cave = atScene('00-cave');
  for (const [grade, exit, other] of [['most', 'share', 'keep'], ['half', 'share', 'keep'], ['little', 'keep', 'share'], ['none', 'keep', 'share']]) {
    const s = won(cave, 'bread-share', grade);
    assert.ok(s.marks.includes(`bread-${grade}`));
    assert.equal(resolve(s, content, ctx(), { exit: other }).result.refused, 'needs', `${grade}: not ${other}`);
    const on = resolve(s, content, ctx(), { exit });
    assert.equal(on.result.ok, true);
    assert.equal(on.state.scene, '00-yinyue', 'the dawn either way: she eats the corner');
    assert.ok(on.state.marks.includes(exit === 'share' ? 'shared-bread' : 'kept-bread'));
  }
  // 守火 first (the cave's first board, 2026-10-21): 喂饼 waits for it
  assert.equal(win(cave, content, ctx(), { id: 'bread-share', grade: 'half' }).result.ok, false, '喂饼 waits for 守火');
  const fired = task(win(cave, content, ctx(), { id: 'cave-fire' }).state, content, ctx(), { action: 'done', id: 'cave-fire' }).state;
  assert.equal(win(fired, content, ctx(), { id: 'bread-share', grade: 'all' }).state.grades?.['bread-share'], undefined, 'a grade the task does not name is not kept');
});

// Cut again 2026-10-19 (Hanli approved, with 射鹿 · 等风): 扔石听声 leaves 00-cave the 10-16 way.
test('扔石听声 has left 00-cave: the passage the book\'s, word for word (split since 10-21 for 守火, the first board), 喂饼 after it; an old save holding it offered lets it go', () => {
  const sc = scenes['00-cave'];
  assert.ok(!(sc.show ?? []).some(c => c.id === 'cave-stone') && !(sc.offers?.tasks ?? []).includes('cave-stone'));
  assert.ok(!sc.exits.some(e => e.needs?.task === 'cave-stone'));
  // 守火 (2026-10-21) splits it at 「……野兽便不敢进来。」: the first board; the rest, then 喂饼
  assert.match(sc.story.zh, /先往里扔了一块石头[\s\S]*还是进去了。\n\n他用他爹教的法子[\s\S]*野兽便不敢进来。$/);
  assert.match(sc.story_after.zh, /^然后他从怀里摸出了两样东西[\s\S]*最后的一点白面。$/);
  assert.equal(content.games.games.find(g => g.id === 'caveecho' && g.replaced !== 'cut'), undefined, 'its game deleted 2026-10-19 (「没用在游戏中的, 都删了吧」); the task id stays, cut (the 游戏厅 lists it under 旧版)');
  const s = atScene('00-cave');
  const old = { ...s, tasks: { ...s.tasks, 'cave-stone': { status: 'offered' } }, tell_owed: ['after/00-cave'] };
  const fit = fitWorld(old, content);
  assert.equal(fit.tasks['cave-stone'], undefined, 'never winnable here now: let go');
  assert.equal(fit.tasks['bread-share'].status, 'offered');
  const fed = won(fit, 'bread-share', 'half');
  assert.equal(resolve(fed, content, ctx(), { exit: 'share' }).state.scene, '00-yinyue');
});

test('射鹿 keeps its two ways: the board won takes 往左偏半寸; 照直射 stays, as before', () => {
  const s = atScene('00-deer');
  assert.equal(resolve(s, content, ctx(), { exit: 'left' }).result.refused, 'needs');
  assert.equal(resolve(s, content, ctx(), { exit: 'straight' }).state.scene, '00-deer');
  const on = resolve(won(s, 'deer-wind', 'rough'), content, ctx(), { exit: 'left' });
  assert.equal(on.state.scene, '00-tailu', 'the carry down: 抬鹿下山 (the 卷一 plan, 10-21)');
  assert.match(scenes['00-deer'].exits.find(e => e.id === 'left').story.zh, /那副门板，到底没有白扛，抬了一头鹿。$/, 'the shot\'s passage ends at the door');
});

/* The 卷一 small-game plan (doc/games-plan-juan1.md, 2026-10-21; Hanli: 「start building」): three 塔防 before 入门 in 古二 and
   古三, each where the book's passage is split word for word; nothing paid (the chapter's locks), the story goes on after. */
test('抬鹿下山 · 雪夜柴垛 · 泗水路: each at its book line, the passage split word for word, nothing paid, the story goes on', () => {
  const tailu = scenes['00-tailu'];
  assert.equal(tailu.hui, 'h02');
  assert.match(tailu.story.zh, /^他爹非要抬后头/);
  assert.match(tailu.exits[0].story.zh, /^到得村口，已是傍晚。[\s\S]*到底没捡。$/);
  assert.equal(tailu.exits[0].next, '00-dusk');
  const hy = scenes['00-halfyear'];
  assert.match(hy.story.zh, /夜里坐在柴垛上，手脚也不冷了，便把自己那件旧袄硬披在了起五更淘米的娘身上，自己穿一件单褂。$/);
  assert.match(hy.story_after.zh, /^冬月廿二，马三来收山风钱/);
  const gate = scenes['00-gate'];
  assert.match(gate.story.zh, /^九月初七晌午[\s\S]*几千户人家，赶的是同一个日子。$/);
  assert.match(gate.story_after.zh, /^九月初八傍晚，到了泗水边上。/);
  for (const [sid, tid, exit, next, kit, lv] of [['00-tailu', 'deer-carry', 'on', '00-dusk', 'shouqiang', 'tailu'], ['00-halfyear', 'halfyear-chaiduo', 'on', '00-uncle', 'shoulu', 'chaiduo'], ['00-gate', 'gate-sishui', 'on', '00-shijie', 'shoulu', 'sishui']]) {
    const t = content.tasks.tasks.find(x => x.id === tid);
    assert.deepEqual([t.game, t.deal.lv, t.period], [kit, lv, 'once'], tid);
    const s = { ...atScene(sid), stamina: 100 };
    const after = won(s, tid);
    for (const k of ['progress', 'wealth', 'tier', 'step']) assert.deepEqual(after[k], s[k], `${tid}: ${k} unchanged`);
    // 00-gate's second board comes before its way on too (00-halfyear's 镜光 cut 2026-10-27)
    const ready = sid === '00-gate' ? won(after, 'gate-crowd') : after;
    const on = resolve(tellOf(content, ready)?.keep ?? ready, content, ctx(), { exit });
    assert.equal(on.result.ok, true, `${sid}: ${JSON.stringify(on.result)}`);
    assert.equal(on.state.scene, next, sid);
  }
});

test('a save already standing in a scene that has since been given a board is offered it on load — never shut out', () => {
  for (const [sid, tid] of [['00-cave', 'bread-share'], ['00-masan', 'masan-taunt'], ['00-zaotai', 'masan-zaotai'], ['00-cave', 'cave-fire'], ['00-baicai', 'baicai-hens'], ['00-rent', 'rent-scale']]) {
    const s = atScene(sid);
    const old = { ...s, tasks: Object.fromEntries(Object.entries(s.tasks).filter(([id]) => id !== tid)) };
    assert.equal(fitWorld(old, content).tasks[tid].status, 'offered', sid);
  }
  assert.equal(newState(content, 'zh', NOW).tasks['rain-basins'].status, 'offered', 'the first scene\'s board, from the start');
});

test('a save from before the cut (10-16): a cut board offered is let go, one done stays, a passage owed after it is not owed', () => {
  const s = atScene('00-storm');
  const old = { ...s, tasks: { ...s.tasks, 'storm-listen': { status: 'offered' }, 'cave-stone': { status: 'done', done_at: NOW.toISOString() } }, tell_owed: ['after/00-storm'] };
  const fit = fitWorld(old, content);
  assert.equal(fit.tasks['storm-listen'], undefined, 'never winnable now: let go');
  assert.equal(fit.tasks['cave-stone'].status, 'done', 'what was done stays');
  assert.deepEqual(fit.tell_owed, [], 'a merged passage is owed nowhere');
  const on = resolve(fit, content, ctx(), { exit: 'turn' });
  assert.equal(on.result.ok, true, JSON.stringify(on.result));
});

// The 调息 cut (2026-10-20, Hanli: 「调息感觉太多了」 → 「可以」): 挑水上坡 (on the old 练功 id `halfyear-carry`) told again —
// its row, its level and its board gone. A returning save that met it loads: offered → let go, done → kept.
test('挑水上坡 told again: its row and level gone; a save holding halfyear-carry offered or done loads and goes on (雪夜柴垛 the board since 10-21)', () => {
  assert.equal(content.tasks.tasks.find(t => t.id === 'halfyear-carry'), undefined, 'the row is gone');
  assert.ok(!content.games.games.some(g => g.task === 'halfyear-carry'), 'and its level');
  const s = atScene('00-halfyear');
  const offered = fitWorld({ ...s, tasks: { ...s.tasks, 'halfyear-carry': { status: 'offered' } } }, content);
  assert.equal(offered.tasks['halfyear-carry'], undefined, 'offered: let go');
  assert.equal(offered.tasks['halfyear-chaiduo'].status, 'offered', '雪夜柴垛 is the board now');
  const on = resolve(won({ ...offered, stamina: 100 }, 'halfyear-chaiduo'), content, ctx(), { exit: 'on' }); // 镜光 cut 2026-10-27: 雪夜柴垛 alone
  assert.equal(on.state.scene, '00-uncle', JSON.stringify(on.result));
  const done = fitWorld({ ...s, tasks: { ...s.tasks, 'halfyear-carry': { status: 'done', done_at: NOW.toISOString() } } }, content);
  assert.equal(done.tasks['halfyear-carry'].status, 'done', 'done: kept, for the record');
  assert.equal(resolve(won({ ...done, stamina: 100 }, 'halfyear-chaiduo'), content, ctx(), { exit: 'on' }).state.scene, '00-uncle');
  assert.ok(look(done, content, ctx()).scene, 'it draws');
});

/* 第一回's lineup (Hanli 2026-10-21): 接雨 · 忍字 · 拽爹 · 认路 · 喂饼 kept, two 塔防 boards added — 「用塔防作为主力」,
   「7个游戏可以防止阅读过长」, then 「按你的建议来」: six boards, four kits — 接雨 · 守白菜 · 忍字 (气走经脉) · 拽爹 · 喂饼 · 守火,
   认路 cut. 守白菜 plays where the book's 芦花鸡 pokes through the 篱笆; 守火 at 「火堆挡在洞口，野兽便不敢进来」, before 喂饼 (the 卷一 plan's order: 接雨 · 守白菜 · 忍字 · 拽爹 · 守火 · 喂饼). */
test('第一回 plays eight boards on six kits (二十问 · 银月 the AI one, 10-22; 太鼓 · 寿宴锣鼓 10-28), two of them 塔防: 守白菜 at the cabbage, 守火 at the fire before 喂饼 — each passage split word for word', () => {
  const h01 = Object.values(scenes).filter(sc => sc.hui === 'h01');
  const boards = h01.flatMap(sc => (sc.show ?? []).filter(c => c.card === 'board').map(c => c.id)).sort();
  assert.deepEqual(boards, ['baicai-hens', 'bread-share', 'cave-fire', 'chushan-luogu', 'masan-taunt', 'masan-zaotai', 'rain-basins', 'yinyue-what']);
  const kit = (id) => content.tasks.tasks.find(x => x.id === id).game;
  assert.deepEqual(boards.map(kit), ['shouqiang', 'bread', 'shoulu', 'taiko', 'dash', 'sadoushou', 'rain', 'jinchat']);
  // 寿宴锣鼓 (10-28): 吴婆婆's 锣鼓 memory, the passage split after 「…吃了还饿。」
  assert.match(scenes['00-chushan'].story.zh, /锣鼓敲了一整天[\s\S]*吃了还饿。」$/);
  assert.match(scenes['00-chushan'].story_after.zh, /^她问道：「去黑松岭？」/);
  assert.ok(content.tasks.tasks.find(x => x.id === 'fall-storm').cut, '拽爹 cut (10-22): a save holding it lets it go');
  assert.ok(!(scenes['00-yinyue'].show ?? []).some(c => c.id === 'yinyue-way') && !(scenes['00-yinyue'].offers?.tasks ?? []).includes('yinyue-way'), '认路 stays off 00-yinyue');
  assert.equal(content.games.games.find(g => g.id === 'dash' && g.task === 'masan-taunt')?.data.level, 'renzi-dash', '忍字: the breath pressed down, a run (几何冲刺 since 10-27)');
  assert.ok(content.tasks.tasks.find(x => x.id === 'yinyue-way').cut, '认路 cut: a save holding it lets it go');
  const td = { 'baicai-hens': ['shouqiang', 'baicai'], 'masan-zaotai': ['sadoushou', 'zaotai'], 'cave-fire': ['shoulu', 'shouhuo'] };
  for (const [id, [game, lv]] of Object.entries(td)) {
    const t = content.tasks.tasks.find(x => x.id === id);
    assert.deepEqual([t.game, t.deal.lv, t.kind], [game, lv, 'board'], id);
  }
  const sh = scenes['00-shiao'], bc = scenes['00-baicai'], cave = scenes['00-cave'];
  assert.equal(sh.exits.find(e => e.id === 'begin').next, '00-baicai');
  assert.match(sh.story_after.zh, /也从不空手走。$/);
  assert.match(bc.story.zh, /^喝过一碗[\s\S]*一看便知是守了一整个秋天的。$/);
  assert.match(bc.story_after.zh, /^小满隔着篱笆道：「阿禾，守白菜呢？」[\s\S]*今天这一回不算，还没撵完。/);
  assert.equal(bc.exits[0].next, '00-masan');
  // 守火 before 喂饼 (the 卷一 plan: the two 割绳子 boards not back to back): the cave's first board, at the fire
  assert.deepEqual(cave.show.filter(c => c.card === 'board').map(c => c.id), ['cave-fire', 'bread-share']);
  assert.match(cave.story.zh, /火堆挡在洞口，野兽便不敢进来。$/);
  assert.match(cave.story_after.zh, /^然后他从怀里摸出了两样东西/);
  // played in order: the first board's win owes the rest of the passage, then 喂饼, then the way on
  let s = atScene('00-cave');
  assert.equal(resolve(s, content, ctx(), { exit: 'share' }).result.refused, 'needs');
  const w = win(s, content, ctx(), { id: 'cave-fire' });
  s = task(w.state, content, ctx(), { action: 'done', id: 'cave-fire' }).state;
  assert.ok((s.tell_owed ?? []).includes('after/00-cave'), 'the bread passage told right after 守火');
  s = won(s, 'bread-share', 'half');
  assert.equal(resolve(s, content, ctx(), { exit: 'share' }).state.scene, '00-yinyue');
});

/* 守灶台 (2026-10-22, Hanli: 「就是在第一次收租那里, 马小宝推倒小满后. 加一个塔防类的」): 00-masan's ways on end at the bowl
   broken; 00-zaotai reads 「……一时竟忘了起身。」, plays the board (his daydream on the floor), and the raindrop wakes him —
   the rest of the night by the way he took (its mark), one way shown. 拽爹 cut the same day: 00-fall whole. */
test('守灶台: the passage split word for word after the bowl breaks, the daydream, then the raindrop — either way taken at 00-masan', () => {
  const ma = scenes['00-masan'], zt = scenes['00-zaotai'], fall = scenes['00-fall'];
  for (const e of ma.exits) {
    assert.equal(e.next, '00-zaotai', e.id);
    for (const k of ['story']) if (e[k]) assert.match(e[k].zh, /「啪嚓」一声，碗在地上碎成了七八片。$/, `${e.id} ${k}`);
  }
  assert.equal(zt.story.zh, '小满仰面躺在地下，望着屋顶那个窟窿，一时竟忘了起身。');
  for (const e of zt.exits) {
    assert.match(e.story.zh, /^恰好草顶里存着的一滴隔夜雨从窟窿里漏将下来，不偏不倚，正落在他眉心，凉飕飕的。/, e.id);
    assert.equal(e.next, '00-dawn');
  }
  assert.ok(!fall.show && !fall.offers && !fall.exits.some(e => e.needs?.task), '00-fall reads whole');
  for (const [exit, mark, other] of [['endure', 'kept-count', 'strike'], ['strike', 'clenched', 'endure']]) {
    let s = atScene('00-masan');
    s = won(s, 'masan-taunt');
    s = resolve(s, content, ctx(), { exit }).state;
    assert.equal(s.scene, '00-zaotai');
    assert.ok(s.marks.includes(mark));
    assert.equal(s.tasks['masan-zaotai']?.status, 'offered');
    const l = look(s, content, ctx());
    assert.deepEqual(l.scene.buttons.map(b => b.id), [exit], 'one way shown: the one he took');
    assert.deepEqual(l.scene.panel.taps.map(t => [t.id, t.quiet]), [[exit, 'label']], 'a quiet link, its own words (一滴隔夜雨)');
    assert.equal(resolve(s, content, ctx(), { exit }).result.refused, 'needs', 'not before the board');
    s = won(s, 'masan-zaotai');
    assert.equal(resolve(s, content, ctx(), { exit: other }).result.ok, false, `not ${other}`);
    const on = resolve(s, content, ctx(), { exit });
    assert.equal(on.state.scene, '00-dawn', JSON.stringify(on.result));
  }
});

/* ── the lint, the rhythm, the map ── */

test('the lint accepts the beats, and catches a grade no task names or marks that are not a board\'s', () => {
  assert.deepEqual(lint(content), []);
  const c = loadContent();
  c.chapters['00-prologue'].scenes['00-cave'].exits.find(e => e.id === 'share').needs.grade = ['generous'];
  c.tasks.tasks.find(t => t.id === 'gate-luoshu').marks = { Win: 'x' };
  const bad = lint(c);
  assert.ok(bad.some(p => p.includes('needs grade generous, which task bread-share does not mark')), bad.join('\n'));
  assert.ok(bad.some(p => p.includes('task gate-luoshu') && p.includes('marks are')), bad.join('\n'));
});

test('the rhythm: the main line read between two beats, a board resetting it where it stands; warnings, not errors', () => {
  assert.equal(RHYTHM_CAP, 2200); // 1500 until 2026-10-26: the book's full text played, about five minutes between play
  const ch = content.chapters['00-prologue'];
  const parts = stretchesOf(ch);
  assert.equal(parts[0].from, 'start');
  assert.equal(parts[0].to, '00-shiao', '接雨 opens the game: only its lead is read before it');
  assert.equal(parts[0].chars, storyChars(ch.scenes['00-shiao'].story), 'a board waits for the passage that leads into it');
  assert.equal(parts[1].from, '00-shiao');
  assert.ok(parts[1].chars >= storyChars(ch.scenes['00-shiao'].story_after), 'the rest of a split passage is read after its board');
  // 忍字 · 认路 · 算账 back 10-20; 今一's beat the same day (the reading cap: 00-rent → j01-retest read 11,661);
  // 00-halfyear's 挑水上坡 told again 2026-10-20 (the 调息 cut).
  for (const at of ['00-baicai', '00-masan', '00-zaotai', '00-heisong/carve', '00-cave', '00-deer', '00-tailu', '00-rent', '00-halfyear', '00-notice', 'j01-track', '00-gate']) assert.ok(parts.some(p => p.to === at), `a beat at ${at}`);
  const warn = warnings(content, { chapters: ['00-prologue'] });
  assert.ok(warn.every(w => w.startsWith('00-prologue: ') && w.includes('(cap 2200)')));
  console.log(`rhythm warnings (00-prologue, cap ${RHYTHM_CAP}):\n${warn.join('\n')}`);
});

test('地图展开: a chapter\'s map unfolds once — at its first map card in a corridor, the moment it can be walked outside one', () => {
  const s = newState(content, 'zh', NOW);
  assert.deepEqual(jiudingBrief(content, s).unfold, { chapter: '00-prologue', title: '蒙山', walk: false }, 'the prologue is a corridor: its tree shows the map');
  const r = unfolded(s, content, ctx(), { chapter: '00-prologue' });
  assert.deepEqual(r.state.unfolded, ['00-prologue']);
  assert.equal(jiudingBrief(content, r.state).unfold, undefined, 'never again in this save');
  assert.equal(unfolded(r.state, content, ctx(), { chapter: '00-prologue' }).result.seen, true);
  const waimen = { ...s, chapter: '00-waimen', scene: 'wm-ahe', ended: ['00-prologue'], place: 'waimen' };
  const u = jiudingBrief(content, waimen).unfold;
  assert.equal(u.chapter, '00-waimen');
  assert.equal(u.title, '外门');
  assert.equal(typeof u.walk, 'boolean');
  assert.equal(unfolded(s, content, ctx(), { chapter: 'nowhere' }).result.refused, 'no-map');
});
