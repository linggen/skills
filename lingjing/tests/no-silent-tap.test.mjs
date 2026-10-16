// No tap is ever silent (10-16, tools/play-human.mjs: 洛书's empty cell, 接雨 while the hand was busy,
// a wrong word said twice — each did nothing on the screen): a tap the act refuses, or one that leaves
// the board's picture as it was, rings a seal-red refusal on its control (live-games.js tapNope).
import test from 'node:test';
import assert from 'node:assert/strict';
import { answered, wireLiveGames } from '../scripts/live-games.js';
import * as rain from '../scripts/games/rain.js';

function wired(mod, state) {
  const on = {}, added = [];
  const saved = { document: globalThis.document, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  globalThis.document = {
    addEventListener: (type, fn) => { (on[type] ??= []).push(fn); }, querySelectorAll: () => [], visibilityState: 'visible',
    createElement: () => ({ className: '', style: {}, remove() {} }), body: { appendChild: (el) => added.push(el) },
  };
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = () => 0;
  const g = { taskId: 'b', mod, state };
  wireLiveGames({ boardFor: () => g, lang: () => 'zh', onWon: () => {} });
  const host = { dataset: { game: 'b' }, isConnected: false, closest: () => host };
  const tap = (data) => {
    const btn = { dataset: data, disabled: false, closest: (sel) => (sel === '[data-g]' ? btn : sel === '[data-game]' ? host : null), getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 40 }) };
    for (const fn of on.pointerdown) fn({ target: btn, button: 0, isPrimary: true, clientX: 30, clientY: 30, preventDefault() {}, stopImmediatePropagation() {} });
  };
  const restore = () => Object.assign(globalThis, saved);
  return { g, tap, nopes: () => added.filter((el) => el.className === 'g-tapink is-no').length, restore };
}

test('a refused tap on a live board rings the refusal; an answered one does not', () => {
  // 接雨 live, the hand busy on a wasted trip: the act answers with the same picture if the board
  // has no shake of its own — here a module stripped of it stands for any board that forgets.
  const base = rain.act(rain.newGame('a'), { g: 'start' }).state;
  const quiet = { ...rain, act: (s, d) => (d.g === 'spot' && d.i === '9' ? { state: s, won: false } : rain.act(s, d)) };
  const w = wired(quiet, base);
  try {
    w.tap({ g: 'spot', i: '9' });
    assert.equal(w.nopes(), 1, 'a tap that changed nothing rings');
    const l = base.sched.leaks[0];
    w.g.state = rain.tick(base, l.from - base.t + 50);
    w.tap({ g: 'spot', i: String(l.spot) });
    assert.equal(w.nopes(), 1, 'a basin set: answered, no ring');
  } finally { w.restore(); }
});

test('answered: a changed picture, a verb sent, a turn handed on', () => {
  assert.equal(answered('a', 'a', { state: {} }), false);
  assert.equal(answered('a', 'b', { state: {} }), true);
  assert.equal(answered('a', 'a', { state: {}, send: { verb: 'x' } }), true);
  assert.equal(answered('a', 'a', { state: { wait: true } }), true);
});
