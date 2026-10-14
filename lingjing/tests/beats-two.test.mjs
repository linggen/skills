// The opening's play beats, batch two (2026-10-14, Hanli 「都可以，按你的单子做」): each game
// opens with a control to touch, draws in both languages, can be finished well and badly,
// always ends won within its limit, and can be skipped — won, no grade, no mark — so a beat
// never blocks the story. The scenes' wiring is tests/opening-beats.test.mjs's BEATS.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as taunt from '../scripts/games/taunt.js';
import * as griddle from '../scripts/games/griddle.js';
import * as listen from '../scripts/games/listen.js';
import * as storm from '../scripts/games/storm.js';
import * as stone from '../scripts/games/stone.js';
import * as way from '../scripts/games/way.js';
import * as climb from '../scripts/games/climb.js';
import * as xisui from '../scripts/games/xisui.js';
import * as carry from '../scripts/games/carry.js';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { newState } from '../scripts/state.mjs';
import { boardWaits, sceneGame } from '../scripts/stage.mjs';
import { trayHtml, WORDS } from '../scripts/cards.js';
import { TO_VALLEY, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-10-14T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const atScene = (id) => {
  let s = newState(content, 'zh', NOW);
  for (const step of TO_VALLEY) { if (s.scene === id) return s; s = walk(s, [step], content, NOW); }
  return s.scene === id ? s : null;
};

const GAMES = [[taunt, /data-g="start"/], [griddle, /data-g="start"/], [listen, /data-g="start"/], [storm, /data-g="start"/], [stone, /data-g="hole"/], [way, /data-g="go"/], [climb, /data-g="start"/], [xisui, /data-g-hold="grit"/], [carry, /data-g="start"/]];

test('every batch-two game: meta in both languages, a control at open, both languages drawn, a skip that ends it won with no grade', () => {
  for (const [mod, control] of GAMES) {
    assert.ok(mod.meta.name.zh && mod.meta.name.en && mod.meta.how.zh && mod.meta.how.en, mod.meta.id);
    const s = mod.newGame('seed');
    assert.match(mod.html(s, 'zh'), control, mod.meta.id);
    for (const lang of ['zh', 'en']) {
      const h = mod.html(s, lang);
      assert.ok(h.length > 40, `${mod.meta.id} ${lang}`);
      assert.doesNotMatch(h, /undefined|NaN|\{\w+\}/, `${mod.meta.id} ${lang}`);
      assert.match(h, /data-g="skip"/, `${mod.meta.id}: the quiet way out`);
    }
    assert.equal(mod.act(s, { g: 'nonsense' }).won, false, 'an unknown move changes nothing');
    const sk = mod.act(s, { g: 'skip' });
    assert.equal(sk.won, true, `${mod.meta.id}: skipped is won`);
    assert.equal(sk.state.grade, null, `${mod.meta.id}: skipped writes no grade`);
    for (const lang of ['zh', 'en']) assert.doesNotMatch(mod.html(sk.state, lang), /undefined|NaN/, `${mod.meta.id} skipped ${lang}`);
  }
});

test('忍字: said back piece by piece — word for word keeps the fist open; wrong pieces and time close it; it always ends', () => {
  let s = taunt.act(taunt.newGame('m'), { g: 'start' }).state;
  assert.equal(s.live, true);
  for (let i = 0; i < 4; i += 1) s = taunt.tick(taunt.act(s, { g: 'say', i }).state, 500);
  assert.equal(s.won, true);
  assert.equal(s.grade, 'word');
  assert.match(taunt.html(s, 'zh'), /一个字不差/);
  assert.match(taunt.html(s, 'en'), /Do a dog bark and you can have a lick/);
  // Out of order or a near miss: the fist closes; 「汪！」 closes it most; the same piece is not tried twice.
  let b = taunt.act(taunt.newGame('m'), { g: 'start' }).state;
  b = taunt.act(b, { g: 'say', i: 4 }).state;
  assert.equal(b.note, 'wrong');
  assert.equal(taunt.act(b, { g: 'say', i: 4 }).won, false);
  assert.equal(taunt.act(b, { g: 'say', i: 4 }).state, b, 'a piece tried is not tried again');
  b = taunt.act(b, { g: 'say', i: 7 }).state;
  assert.equal(b.note, 'bark');
  assert.ok(b.fist > taunt.WRONG + 0.3);
  for (const i of [5, 6]) b = taunt.act(b, { g: 'say', i }).state;
  assert.equal(b.won, true, 'a fist closed all the way ends it');
  assert.equal(b.grade, 'fist');
  // Nothing tapped: the fist closes by itself within the limit.
  const idle = taunt.tick(taunt.act(taunt.newGame('m'), { g: 'start' }).state, taunt.RISE_S * 1000);
  assert.equal(idle.won, true);
  assert.equal(idle.grade, 'fist');
  assert.match(taunt.html(idle, 'zh'), /拳头攥得指节发白/);
});

test('烙饼: call the turn when each side is golden — too soon she waits, too late it scorches, silence and she turns it herself', () => {
  const cook = (to) => {
    let s = griddle.act(griddle.newGame('k'), { g: 'start' }).state;
    for (let i = 0; i < griddle.SIDES.length; i += 1) {
      while (s.d < to) s = griddle.tick(s, 100);
      s = griddle.act(s, { g: 'flip' }).state;
    }
    return s;
  };
  const good = cook(0.8);
  assert.equal(good.won, true);
  assert.equal(good.grade, 'golden');
  assert.ok(good.t < 30000, 'under half a minute');
  assert.match(griddle.html(good, 'zh'), /四面黄澄澄的/);
  assert.equal(cook(1.2).grade, 'scorched');
  let early = griddle.tick(griddle.act(griddle.newGame('k'), { g: 'start' }).state, 500);
  early = griddle.act(early, { g: 'flip' }).state;
  assert.equal(early.note, 'raw', 'still white: nothing turned');
  assert.equal(early.side, 0);
  let idle = griddle.act(griddle.newGame('k'), { g: 'start' }).state;
  while (!idle.won) idle = griddle.tick(idle, 100);
  assert.equal(idle.grade, 'scorched');
  assert.ok(idle.t < 30000, 'she finishes it within half a minute');
  assert.match(griddle.html(idle, 'en'), /scorched side in/);
});

test('听: say it the moment the birds stop, then read the sky — a false alarm is only a word from 爹; silence, and 爹 sees it himself', () => {
  let s = listen.act(listen.newGame('h'), { g: 'start' }).state;
  s = listen.act(s, { g: 'wrong' }).state;
  assert.equal(s.note, 'early');
  assert.equal(s.phase, 'listen', 'the birds still sing: nothing happens');
  while (s.t < s.quietAt + 600) s = listen.tick(s, 100);
  s = listen.act(s, { g: 'wrong' }).state;
  assert.equal(s.phase, 'sky');
  s = listen.act(s, { g: 'sign', id: 'cloud' }).state;
  assert.equal(s.won, true);
  assert.equal(s.grade, 'sharp');
  assert.match(listen.html(s, 'zh'), /第三条规矩/);
  let b = listen.act(listen.newGame('h'), { g: 'start' }).state;
  while (b.phase === 'listen') b = listen.tick(b, 100);
  assert.equal(b.note, 'father');
  assert.ok(b.t < 20000);
  b = listen.act(b, { g: 'sign', id: 'tops' }).state;
  assert.equal(b.note, 'topsSay');
  b = listen.act(b, { g: 'sign', id: 'cloud' }).state;
  assert.equal(b.grade, 'late');
  assert.match(listen.html(b, 'en'), /Father has seen it too/);
});

test('拽 (00-fall\'s 暴雨, redrawn in ink): the scene in an SVG, no CSS-animated rain; always over within half a minute', () => {
  const s = storm.act(storm.newGame('f'), { g: 'start' }).state;
  assert.match(storm.html(s, 'zh'), /class="g-scene/);
  assert.doesNotMatch(storm.html(s, 'zh'), /g-storm-rain/);
  assert.ok(storm.LIMIT <= 30000);
  const end = storm.tick(s, storm.LIMIT);
  assert.equal(end.won, true);
  assert.match(storm.html(end, 'en'), /gives way/);
});

test('扔石听声: a stone into each hollow comes back as its sound; the shallow, empty one is the cave — a wrong one only sends him out', () => {
  const s0 = stone.newGame('c');
  const at = (kind) => s0.holes.indexOf(kind);
  let s = stone.act(s0, { g: 'hole', i: at('deep') }).state;
  s = stone.act(s, { g: 'throw' }).state;
  assert.equal(s.note, 'deep');
  s = stone.act(s, { g: 'enter' }).state;
  assert.equal(s.note, 'inDeep');
  assert.equal(s.won, false, 'backed out, never lost');
  s = stone.act(stone.act(s, { g: 'hole', i: at('shallow') }).state, { g: 'throw' }).state;
  s = stone.act(s, { g: 'throw' }).state;
  assert.equal(s.note, 'shallow2', '还是空的');
  s = stone.act(s, { g: 'enter' }).state;
  assert.equal(s.won, true);
  assert.equal(s.grade, 'lucky', 'a wrong hollow first');
  let sure = stone.act(stone.act(s0, { g: 'hole', i: at('shallow') }).state, { g: 'throw' }).state;
  sure = stone.act(sure, { g: 'enter' }).state;
  assert.equal(sure.grade, 'sure');
  assert.match(stone.html(sure, 'zh'), /先生火/);
  assert.equal(stone.act(stone.act(s0, { g: 'hole', i: at('shallow') }).state, { g: 'enter' }).state.grade, 'lucky', 'in without listening');
});

test('two boards in one scene (00-cave): 扔石听声, the rest of the passage, then 喂饼 — in `show` order, on the stage, in the tray and in the rules', () => {
  const sc = content.chapters['00-prologue'].scenes['00-cave'];
  assert.deepEqual(sc.show.filter(c => c.card === 'board').map(c => c.id), ['cave-stone', 'bread-share']);
  let s = atScene('00-cave');
  assert.ok(s, 'walked to the cave');
  s = tellOf(content, s)?.keep ?? s;
  let l = look(s, content, ctx());
  assert.ok(boardWaits(l, 'bread-share'), '喂饼 waits for the stone');
  assert.ok(!boardWaits(l, 'cave-stone'));
  assert.deepEqual(l.stage.filter(c => c.card === 'board').map(c => c.id), ['cave-stone'], 'only the first board stands');
  assert.ok(sceneGame(l, { card: 'board', id: 'cave-stone' }), 'the scene\'s own game though no way on waits on it: it stands with the scene, never queued behind it');
  assert.doesNotMatch(trayHtml({ look: l, words: WORDS.zh, lang: 'zh', onStage: [] }), /喂饼/, 'nor is the second in the tray');
  assert.equal(win(s, content, ctx(), { id: 'bread-share', grade: 'half' }).result.refused, 'board-waits', 'the rules keep the order too');
  s = win(s, content, ctx(), { id: 'cave-stone', grade: 'sure' }).state;
  s = task(s, content, ctx(), { action: 'done', id: 'cave-stone' }).state;
  assert.ok(s.marks.includes('stone-sure'));
  const told = tellOf(content, s);
  assert.deepEqual(told.tell.map(t => [t.of, t.id]), [['after', '00-cave/after']], 'the rest of the passage, right after the stone');
  assert.match(told.tell[0].text, /火镰敲着火石/);
  s = told.keep;
  l = look(s, content, ctx());
  assert.deepEqual(l.stage.filter(c => c.card === 'board').map(c => c.id), ['bread-share'], 'then 喂饼');
  s = task(win(s, content, ctx(), { id: 'bread-share', grade: 'half' }).state, content, ctx(), { action: 'done', id: 'bread-share' }).state;
  assert.equal(tellOf(content, s), null, 'the passage is not owed twice');
  assert.equal(resolve(s, content, ctx(), { exit: 'share' }).state.scene, '00-yinyue');
});

test('认路: his marks along the cliff lead from the cave to the moss — the only way through; a rock only stops him; lost, she points', () => {
  let s = way.newGame('y');
  s = way.act(s, { g: 'go', d: 'left' }).state;
  assert.equal(s.note, 'wall');
  assert.equal(s.moves, 0, 'the cliff costs no step');
  for (const d of ['right', 'up', 'up', 'left', 'up', 'up', 'right', 'right', 'right', 'right', 'right']) s = way.act(s, { g: 'go', d }).state;
  assert.equal(s.won, true);
  assert.equal(s.moves, way.BEST);
  assert.equal(s.grade, 'straight');
  assert.match(way.html(s, 'zh'), /一道都没错/);
  let lost = way.newGame('y');
  for (let i = 0; !lost.won; i += 1) lost = way.act(lost, { g: 'go', d: i % 2 ? 'left' : 'right' }).state;
  assert.equal(lost.moves, way.LEAD);
  assert.equal(lost.grade, 'wandered');
  assert.match(way.html(lost, 'en'), /That way/);
});

test('攀: the living branch holds, the dead one snaps; the grip drains while he hangs, the stone gives it back; past the limit, the rope', () => {
  let s = climb.act(climb.newGame('c'), { g: 'start' }).state;
  const dead = (st) => (st.live_side[st.rung] === 'left' ? 'right' : 'left');
  s = climb.act(s, { g: 'grab', side: dead(s) }).state;
  assert.equal(s.note, 'snapped');
  assert.equal(s.rung, 0);
  while (s.rung < climb.RUNGS) {
    s = climb.tick(s, 600);
    if (s.rung === climb.LEDGE && s.grip < 1) s = climb.act(s, { g: 'rest' }).state;
    s = climb.act(s, { g: 'grab', side: s.live_side[s.rung] }).state;
  }
  assert.equal(s.note, 'top');
  s = climb.act(s, { g: 'hand' }).state;
  assert.equal(s.won, true);
  assert.equal(s.grade, 'steady', 'one snap is forgiven');
  assert.match(climb.html(s, 'zh'), /这一回，它抓住了/);
  // Hanging still: the grip runs out and he slides back — to the ledge once past it, never below.
  let h = climb.act(climb.newGame('c'), { g: 'start' }).state;
  for (let i = 0; i < climb.LEDGE + 1; i += 1) h = climb.act(h, { g: 'grab', side: h.live_side[h.rung] }).state;
  while (h.note !== 'slid') h = climb.tick(h, 500);
  assert.equal(h.rung, climb.LEDGE);
  const idle = climb.tick(climb.act(climb.newGame('c'), { g: 'start' }).state, climb.LIMIT);
  assert.equal(idle.won, true);
  assert.equal(idle.grade, 'scraped');
  assert.match(climb.html(idle, 'en'), /Old Zhou lets the rope down/);
});

test('忍 (00-sleep\'s 洗髓, redrawn in ink): drawn as a scene; never held, the moon goes over and the sticks are burned by the limit', () => {
  const s = xisui.newGame('x');
  assert.match(xisui.html(s, 'zh'), /class="g-scene/);
  const late = xisui.tick(s, xisui.LIMIT);
  assert.equal(late.stick, xisui.STICKS);
  assert.equal(late.note, 'moon');
  assert.match(xisui.html(late, 'zh'), /data-g="jump"/);
  assert.equal(xisui.act(late, { g: 'jump' }).won, true);
});

test('练功: step as the buckets swing through the middle — the water stays in and the breath low; on the swing it slops; it always ends', () => {
  const walk2 = (good) => {
    let s = carry.act(carry.newGame('w'), { g: 'start' }).state;
    while (!s.won) {
      s = carry.tick(s, 50);
      const sw = Math.abs(carry.swayAt(s.t));
      if (good ? sw < 0.1 : sw > 0.95) s = carry.act(s, { g: 'step' }).state;
    }
    return s;
  };
  const even = walk2(true);
  assert.equal(even.grade, 'even');
  assert.equal(even.spills, 0);
  assert.ok(even.t < 30000);
  assert.match(carry.html(even, 'zh'), /只好装喘/);
  const rough = walk2(false);
  assert.equal(rough.grade, 'panting');
  assert.match(carry.html(rough, 'en'), /bellows/);
  const idle = carry.tick(carry.act(carry.newGame('w'), { g: 'start' }).state, carry.LIMIT);
  assert.equal(idle.won, true);
});

test('00-halfyear\'s two boards: 吹鹅毛, the winter, then 练功 — 开春 waits on the second', () => {
  const sc = content.chapters['00-prologue'].scenes['00-halfyear'];
  assert.deepEqual(sc.show.filter(c => c.card === 'board').map(c => c.id), ['feather-breath', 'halfyear-carry']);
  assert.equal(sc.exits.find(e => e.id === 'on').needs.task, 'halfyear-carry');
});
