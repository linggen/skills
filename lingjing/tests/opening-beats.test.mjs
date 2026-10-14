// The opening's playable beats (Hanli, 2026-10-14: 「每看一会儿剧情就要有游戏可以玩」):
// 接雨 · 追踪 · 喂饼 · 射鹿 · 算账 · 吹鹅毛. Each board opens, can be finished well and
// badly, and its scene goes on either way; the grade writes its mark and, where the
// exits wait on it, picks the way on. The lint accepts them; the rhythm warns; the
// map unfolds once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent, warnings, RHYTHM_CAP } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { fitWorld, newState } from '../scripts/state.mjs';
import { jiudingBrief, unfolded } from '../scripts/rules/inkmap.mjs';
import { stretchesOf } from '../scripts/rhythm.mjs';
import { TO_HALL, TO_VALLEY, walk } from './prologue.mjs';
import * as rain from '../scripts/games/rain.js';
import * as track from '../scripts/games/track.js';
import * as bread from '../scripts/games/bread.js';
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
  for (const [mod, control] of [[rain, /data-g="start"/], [track, /data-g="sign"/], [bread, /data-g="give"/], [scale, /data-g="hide"/], [feather, /data-g-drag="breath"/]]) {
    assert.ok(mod.meta.name.zh && mod.meta.name.en && mod.meta.how.zh && mod.meta.how.en, mod.meta.id);
    const s = mod.newGame('seed');
    assert.match(mod.html(s, 'zh'), control, mod.meta.id);
    bothLangs(mod, s);
    assert.equal(mod.act(s, { g: 'nonsense' }).won, false, 'an unknown move changes nothing');
  }
});

/* 接雨: a quick hand keeps the floor dry; an idle one lets the fifth watch end it, wet. */
function rainBot(seed, react) {
  let s = rain.act(rain.newGame(seed), { g: 'start' }).state, since = 0;
  while (!s.won) {
    s = rain.tick(s, 100); since += 100;
    if (s.won || since < react) continue;
    since = 0;
    for (let i = 0; i < rain.SPOTS.length && !s.won; i += 1) {
      const b = s.basins[i], drip = rain.leakingAt(s.sched, i, s.t);
      if (b != null && (b >= rain.CAP || (!drip && s.spare + s.hand.length === 0))) s = rain.act(s, { g: 'spot', i }).state;
      if (!s.won && drip && s.basins[i] == null) s = rain.act(s, { g: 'spot', i }).state;
    }
  }
  return s;
}
test('接雨: seventeen basins under the drips — quick hands keep the floor dry, slow ones leave puddles; the rain always stops', () => {
  const well = rainBot('a', 300);
  assert.equal(well.grade, 'dry');
  assert.equal(rain.fullCount(well), rain.NEED);
  assert.ok(well.t < 90000, 'about a minute');
  const slow = rainBot('a', 2500);
  assert.equal(slow.won, true);
  assert.equal(slow.grade, 'wet');
  const idle = play(rain, rain.act(rain.newGame('a'), { g: 'start' }).state, [rain.LIMIT]);
  assert.equal(idle.won, true, 'the fifth watch ends it');
  assert.equal(idle.grade, 'wet');
  assert.match(rain.html(well, 'zh'), /十七个盆，一个不少/);
  assert.match(rain.html(idle, 'en'), /fifth watch/);
  // A basin lifted before it is full goes back to hand, water and all, and down again first.
  let s = rain.act(rain.newGame('b'), { g: 'start' }).state;
  s = rain.act(s, { g: 'spot', i: 0 }).state;
  s = { ...s, basins: [3, ...s.basins.slice(1)] };
  s = rain.act(s, { g: 'spot', i: 0 }).state;
  assert.deepEqual(s.hand, [3]);
  s = rain.act(s, { g: 'spot', i: 1 }).state;
  assert.equal(s.basins[1], 3);
});

test('追踪: read the deer\'s sign, carve at a hundred steps — true, or misread and late; four marks either way', () => {
  let s = track.newGame('z');
  for (let r = 0; r < track.NEED; r += 1) {
    const i = s.rounds[s.r].findIndex(k => ['hoof', 'twig', 'hair'].includes(k));
    s = track.act(s, { g: 'sign', i }).state;
    assert.equal(s.phase, 'walk');
    while (s.steps < 98) s = track.tick(s, 100);
    s = track.act(s, { g: 'carve' }).state;
  }
  assert.equal(s.won, true);
  assert.equal(s.grade, 'true');
  assert.match(track.html(s, 'zh'), /一道不差/);
  let b = track.newGame('z');
  while (!b.won) {
    if (b.phase === 'read') b = track.act(b, { g: 'sign', i: b.rounds[b.r].findIndex(k => !b.tried.includes(k)) }).state;
    else b = track.tick(b, 500);
  }
  assert.equal(b.grade, 'rough');
  assert.ok(b.misreads > 1 && b.cuts.every(c => c === 'late'));
  assert.match(track.html(b, 'en'), /make a line all the same/);
});

test('喂饼: the fox has none, a little, half or most — the corner always kept', () => {
  const give = (n) => play(bread, bread.newGame('x'), [...Array(n).fill({ g: 'give' }), { g: 'rest' }]);
  assert.deepEqual([0, 2, 4, 6].map(n => (n ? give(n) : play(bread, bread.newGame('x'), [{ g: 'eat' }, { g: 'rest' }])).grade), ['none', 'little', 'half', 'most']);
  const most = play(bread, bread.newGame('x'), Array(7).fill({ g: 'give' }));
  assert.equal(most.won, true, 'all seven given: done, the corner wrapped');
  assert.equal(most.grade, 'most');
  assert.match(bread.html(most, 'zh'), /一个小角包好了/);
  assert.match(bread.html(give(4), 'en'), /4 pieces to it/);
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
  const w = win(s, content, ctx(), { id, grade });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  const d = task(w.state, content, ctx(), { action: 'done', id });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  return d.state;
};

const BEATS = [
  ['00-shiao', 'rain-basins', 'begin', ['dry', 'wet'], { dry: 'rain-caught', wet: 'rain-puddled' }],
  ['00-heisong', 'track-marks', 'carve', ['true', 'rough'], { true: 'marks-true', rough: 'marks-rough' }],
  ['00-rent', 'rent-scale', 'dumb', ['exact', 'over'], { exact: 'rent-exact', over: 'rent-over' }],
  ['00-halfyear', 'feather-breath', 'on', ['still', 'shaky'], { still: 'feather-still', shaky: 'feather-shaky' }],
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
  const s = atScene('00-heisong');
  const old = { ...s, tasks: {} };
  assert.equal(fitWorld(old, content).tasks['track-marks'].status, 'offered');
  assert.equal(newState(content, 'zh', NOW).tasks['rain-basins'].status, 'offered', 'the first scene\'s board, from the start');
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
  assert.equal(parts[0].to, '00-shiao', '接雨 opens the game: nothing is read before it');
  assert.equal(parts[0].chars, 0);
  for (const at of ['00-heisong', '00-cave', '00-deer', '00-rent', '00-halfyear']) assert.ok(parts.some(p => p.to === at), `a beat at ${at}`);
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
