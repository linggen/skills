// The opening's play beats, batch two (2026-10-14, Hanli 「都可以，按你的单子做」): each game
// opens with a control to touch, draws in both languages, can be finished well and badly,
// always ends won within its limit, and never blocks the story: once the player is stuck the
// page lays 「算了，往下走」 under it (scripts/stuck.js; a skip pays nothing, rules/skips.mjs). The scenes' wiring is tests/opening-beats.test.mjs's BEATS.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as taunt from '../scripts/games/taunt.js';
import * as griddle from '../scripts/games/griddle.js';
import * as storm from '../scripts/games/storm.js';
import * as way from '../scripts/games/way.js';
import * as xisui from '../scripts/games/xisui.js';
import * as carry from '../scripts/games/carry.js';
import * as vday from '../scripts/games/villageday.js';
import * as vdong from '../scripts/games/villagedong.js';
import * as veve from '../scripts/games/villageeve.js';
import { STOPS } from '../scripts/games/village.js';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { newState } from '../scripts/state.mjs';
import { boardWaits, sceneGame } from '../scripts/stage.mjs';
import { trayHtml, WORDS } from '../scripts/cards.js';
import { TO_HALL, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-10-14T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const atScene = (id) => {
  let s = newState(content, 'zh', NOW);
  for (const step of TO_HALL) { if (s.scene === id) return s; s = walk(s, [step], content, NOW); }
  return s.scene === id ? s : null;
};

const GAMES = [[taunt, /data-g="start"/], [griddle, /data-g="start"/], [storm, /data-g="start"/], [way, /data-g="go"/], [xisui, /data-g-hold="grit"/], [carry, /data-g="start"/], [vday, /data-g="spot"/], [vdong, /data-g="spot"/], [veve, /data-g="spot"/]];

test('every batch-two game: meta in both languages, a control at open, both languages drawn, and no skip of its own — the page\'s stuck gate lays it (2026-10-15)', () => {
  for (const [mod, control] of GAMES) {
    assert.ok(mod.meta.name.zh && mod.meta.name.en && mod.meta.how.zh && mod.meta.how.en, mod.meta.id);
    const s = mod.newGame('seed');
    assert.match(mod.html(s, 'zh'), control, mod.meta.id);
    for (const lang of ['zh', 'en']) {
      const h = mod.html(s, lang);
      assert.ok(h.length > 40, `${mod.meta.id} ${lang}`);
      assert.doesNotMatch(h, /undefined|NaN|\{\w+\}/, `${mod.meta.id} ${lang}`);
      // 「跳过这个按钮不要一开始就显示」: never drawn by the game, at the start or ever (scripts/stuck.js).
      assert.doesNotMatch(h, /data-g="skip"|data-game-skip/, `${mod.meta.id}: no skip from the start`);
    }
    assert.equal(mod.act(s, { g: 'nonsense' }).won, false, 'an unknown move changes nothing');
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

test('拽 (00-fall\'s 暴雨, redrawn in ink): the scene in an SVG, no CSS-animated rain; always over within half a minute', () => {
  const s = storm.act(storm.newGame('f'), { g: 'start' }).state;
  assert.match(storm.html(s, 'zh'), /class="g-scene/);
  assert.doesNotMatch(storm.html(s, 'zh'), /g-storm-rain/);
  assert.ok(storm.LIMIT <= 30000);
  const end = storm.tick(s, storm.LIMIT);
  assert.equal(end.won, true);
  assert.match(storm.html(end, 'en'), /gives way/);
});

// (00-halfyear's two boards — 吹鹅毛 and 练功 — were cut 2026-10-16 before 入门: its passage reads whole.)

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

test('石坳村: the village map — each place a small optional thing; 「回家」 ends it whenever, full when most were done', () => {
  for (const [mod, stop] of [[vday, 'day'], [vdong, 'dong'], [veve, 'eve']]) {
    const spots = STOPS[stop].spots;
    let s = mod.newGame('v');
    assert.equal(mod.act(s, { g: 'home' }).state.grade, 'light', `${stop}: home at once is allowed`);
    for (const id of spots) {
      s = mod.act(s, { g: 'spot', id }).state;
      assert.equal(s.at, id);
      for (let k = 0; k < 40 && s.sub; k += 1) {
        const sub = s.sub;
        if (sub.kind === 'prints') s = mod.act(s, { g: 'pick', id: sub.list[sub.i] }).state;
        else if (sub.kind === 'herb') s = mod.act(s, { g: 'pick', id: 'ai' }).state;
        else if (sub.kind === 'peddler') s = mod.act(s, { g: 'price', p: [1, 3, 5][sub.i] }).state;
        else if (sub.kind === 'tale') s = sub.answered ? mod.act(s, { g: 'heard' }).state : mod.act(s, { g: 'pick', id: sub.id === 'jingwei' ? 'stones' : 'sun' }).state;
        else { s = mod.tick(s, 300); sub.hens.forEach((_, i) => { s = s.sub ? mod.act(s, { g: 'shoo', i }).state : s; }); }
        for (const lang of ['zh', 'en']) assert.doesNotMatch(mod.html(s, lang), /undefined|NaN|\{\w+\}/, `${stop} ${id} ${lang}`);
      }
      assert.ok(s.done.includes(id), `${stop}: ${id} done`);
      assert.equal(mod.act(s, { g: 'spot', id }).won, false, 'a thing done is not done twice');
    }
    const end = mod.act(s, { g: 'home' }).state;
    assert.equal(end.won, true);
    assert.equal(end.grade, 'full', stop);
  }
  // A place left half-done is left: back on the map, nothing written.
  let h = vday.act(vday.newGame('v'), { g: 'spot', id: 'herb' }).state;
  h = vday.act(h, { g: 'leave' }).state;
  assert.equal(h.sub, null);
  assert.deepEqual(h.done, []);
  // The hens: unshooed, they reach the cabbage — a few leaves lost, never a fail.
  let hens = vday.act(vday.newGame('v'), { g: 'spot', id: 'hens' }).state;
  while (hens.sub) hens = vday.tick(hens, 200);
  assert.equal(hens.lost, 6);
  assert.match(vday.html(hens, 'zh'), /被啄掉 6 片叶子/);
  // No 吴婆婆 on the last day: her farewell is 00-notice's way on.
  assert.ok(!STOPS.eve.spots.includes('tale'));
});
