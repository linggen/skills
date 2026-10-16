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
import { TO_HALL, TO_VALLEY, walk } from './prologue.mjs';
import * as rain from '../scripts/games/rain.js';
import * as scale from '../scripts/games/scale.js';
import * as feather from '../scripts/games/feather.js';

const content = loadContent();
const NOW = new Date('2026-10-14T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const scenes = content.chapters['00-prologue'].scenes;

/* ── the games, alone ── */

const play = (mod, s, moves) => moves.reduce((st, m) => (typeof m === 'number' ? mod.tick(st, m) : mod.act(st, m).state), s);
const bothLangs = (mod, s) => { for (const lang of ['zh', 'en']) assert.ok(mod.html(s, lang).length > 40, lang); };

test('every game: meta in both languages, opens with a control to touch, draws in both languages', () => {
  // 喂饼 is dealt its levels (games.json, since 2026-10-16); its own tests are bread.test.mjs.
  for (const [mod, control] of [[rain, /data-g="start"/], [scale, /data-g="hide"/], [feather, /data-g-drag="breath"/]]) {
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
  const slow = rainBot('a', 1500);
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

test('算账: the hide, then twenty catties on the pan — exact keeps the most at home, over gives the Mas the rest; light is never taken', () => {
  let s = scale.act(scale.newGame('r'), { g: 'hide' }).state;
  for (const id of ['hind', 'fore1', 'loin']) s = scale.act(s, { g: 'cut', id }).state;
  assert.equal(scale.weightOf(s.pan), 15);
  s = scale.act(s, { g: 'weigh' }).state;
  assert.equal(s.won, false);
  assert.equal(s.note, 'light');
  s = scale.act(s, { g: 'cut', id: 'fore2' }).state;
  const exact = scale.act(s, { g: 'weigh' }).state;
  assert.equal(exact.grade, 'exact');
  const over = scale.act(scale.act(s, { g: 'cut', id: 'ribs' }).state, { g: 'weigh' }).state;
  assert.equal(over.grade, 'over');
  assert.match(scale.html(over, 'zh'), /多出来的 4 斤/);
  assert.match(scale.html(exact, 'en'), /twenty catties/);
  assert.equal(scale.act(scale.newGame('r'), { g: 'cut', id: 'hind' }).won, false, 'the hide first');
});

test('吹鹅毛: a slow, even stroke is a long breath out; holding it bursts, rushing it flies — three breaths, the best counts', () => {
  const breathe = (s, pxs, ms) => {
    s = feather.act(s, { g: 'hold' }).state;
    for (let t = 0; t < ms && s.phase === 'out'; t += 100) {
      for (let k = 0; k < 5; k += 1) s = feather.act(s, { g: 'move', d: pxs / 50 }).state;
      s = feather.tick(s, 100);
    }
    return s.phase === 'out' ? feather.act(s, { g: 'release' }).state : s;
  };
  let s = breathe(feather.newGame('f'), 0, 4000);
  assert.equal(s.note, 'burst', 'held: it bursts, as on the first night');
  s = breathe(s, 400, 4000);
  assert.equal(s.note, 'puff', 'rushed: the feather flies');
  s = breathe(s, 45, 30000);
  assert.equal(s.won, true);
  assert.equal(s.grade, 'still');
  assert.ok(s.best >= feather.STILL);
  const poor = [0, 400, 400].reduce((st, v) => breathe(st, v, 4000), feather.newGame('f'));
  assert.equal(poor.won, true, 'three breaths and it is over, whatever the count');
  assert.equal(poor.grade, 'shaky');
  assert.match(feather.html(poor, 'zh'), /鸡窝乱了几回/);
});

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
  // 00-shiao: 接雨 first, then the village map (batch two) — 那天傍晚 waits on the second.
  ['00-shiao', 'village-day', 'begin', ['full', 'light'], { full: 'village-day-full', light: 'village-day-light' }],
  ['00-xiuxian', 'village-dong', 'on', ['full', 'light'], { full: 'village-dong-full', light: 'village-dong-light' }],
  ['00-notice', 'village-eve', 'go', ['full', 'light'], { full: 'village-eve-full', light: 'village-eve-light' }],
  ['00-rent', 'rent-scale', 'dumb', ['exact', 'over'], { exact: 'rent-exact', over: 'rent-over' }],
  // 00-halfyear: 吹鹅毛 first, then 练功 (batch two) — the way on waits on the second.
  ['00-halfyear', 'halfyear-carry', 'on', ['even', 'panting'], { even: 'carry-even', panting: 'carry-panting' }],
  // Batch two (2026-10-14): tests/beats-two.test.mjs plays the games themselves.
  ['00-masan', 'masan-taunt', 'endure', ['word', 'fist'], { word: 'taunt-word', fist: 'taunt-fist' }],
  ['00-yinyue', 'yinyue-way', 'follow', ['straight', 'wandered'], { straight: 'way-straight', wandered: 'way-wandered' }],
  ['00-kitchen', 'kitchen-griddle', 'go', ['golden', 'scorched'], { golden: 'griddle-golden', scorched: 'griddle-scorched' }],
];

test('each scene stands its board on the stage, offers it, and its way on waits for it', () => {
  for (const [sid, tid, exit] of [...BEATS, ['00-cave', 'bread-share', 'share']]) {
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
      assert.ok(s.marks.includes(marks[grade]), `${sid} ${grade}`);
      assert.equal(s.grades[tid], grade);
      const on = resolve(s, content, ctx(), { exit });
      assert.equal(on.result.ok, true, `${sid} ${grade}: ${JSON.stringify(on.result)}`);
      assert.notEqual(on.state.scene, sid, `${sid} ${grade}: the story moved on`);
    }
  }
});

test('算账\'s choice stays the player\'s: both ways on wait for the scale, either may be taken after it', () => {
  const s = won(atScene('00-rent'), 'rent-scale', 'over');
  assert.equal(resolve(s, content, ctx(), { exit: 'truth' }).result.ok, true);
  assert.equal(resolve(s, content, ctx(), { exit: 'dumb' }).result.ok, true);
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
  assert.equal(win(cave, content, ctx(), { id: 'bread-share', grade: 'all' }).state.grades['bread-share'], undefined, 'a grade the task does not name is not kept');
});

test('射鹿 keeps its two ways: the board won takes 往左偏半寸; 照直射 stays, as before', () => {
  const s = atScene('00-deer');
  assert.equal(resolve(s, content, ctx(), { exit: 'left' }).result.refused, 'needs');
  assert.equal(resolve(s, content, ctx(), { exit: 'straight' }).state.scene, '00-deer');
  const on = resolve(won(s, 'deer-wind', 'rough'), content, ctx(), { exit: 'left' });
  assert.equal(on.state.scene, '00-dusk');
});

test('a save already standing in a scene that has since been given a board is offered it on load — never shut out', () => {
  const s = atScene('00-rent');
  const old = { ...s, tasks: {} };
  assert.equal(fitWorld(old, content).tasks['rent-scale'].status, 'offered');
  assert.equal(newState(content, 'zh', NOW).tasks['rain-basins'].status, 'offered', 'the first scene\'s board, from the start');
});

test('a save from before the cut (10-16): a cut board offered is let go, one done stays, a passage owed after it is not owed', () => {
  const s = atScene('00-storm');
  const old = { ...s, tasks: { ...s.tasks, 'storm-listen': { status: 'offered' }, 'cave-stone': { status: 'done', done_at: NOW.toISOString() } }, tell_owed: ['after/00-storm', 'after/00-halfyear'] };
  const fit = fitWorld(old, content);
  assert.equal(fit.tasks['storm-listen'], undefined, 'never winnable now: let go');
  assert.equal(fit.tasks['cave-stone'].status, 'done', 'what was done stays');
  assert.deepEqual(fit.tell_owed, ['after/00-halfyear'], 'a merged passage is owed nowhere; a split one still is');
  const on = resolve(fit, content, ctx(), { exit: 'turn' });
  assert.equal(on.result.ok, true, JSON.stringify(on.result));
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
  assert.equal(RHYTHM_CAP, 1500);
  const ch = content.chapters['00-prologue'];
  const parts = stretchesOf(ch);
  assert.equal(parts[0].from, 'start');
  assert.equal(parts[0].to, '00-shiao', '接雨 opens the game: only its lead is read before it');
  assert.equal(parts[0].chars, storyChars(ch.scenes['00-shiao'].story), 'a board waits for the passage that leads into it');
  assert.equal(parts[1].from, '00-shiao');
  assert.ok(parts[1].chars >= storyChars(ch.scenes['00-shiao'].story_after), 'the rest of a split passage is read after its board');
  for (const at of ['00-heisong/carve', '00-cave', '00-deer', '00-rent', '00-halfyear']) assert.ok(parts.some(p => p.to === at), `a beat at ${at}`);
  const warn = warnings(content, { chapters: ['00-prologue'] });
  assert.ok(warn.every(w => w.startsWith('00-prologue: ') && w.includes('(cap 1500)')));
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
