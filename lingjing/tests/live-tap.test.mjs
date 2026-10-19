// A tap on a game running in time is taken on pointerdown, once (live-games.js), and the
// timing boards are humanly fair (2026-10-15, 黑地十一步: 「怎么都没法落脚」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runsLive, tapGate, wireLiveGames } from '../scripts/live-games.js';
import * as sneeze from '../scripts/games/sneeze.js';
import * as wuziqi from '../scripts/games/wuziqi.js';

test('a pointerdown tap acts once: the click after it is swallowed, once', () => {
  const gate = tapGate(1500);
  gate.down('j07-dark', 1000);
  assert.equal(gate.click('j07-dark', 1080), true, 'the finger-lift click is swallowed');
  assert.equal(gate.click('j07-dark', 1100), false, 'a second click goes the page route');
  gate.down('j07-dark', 2000);
  assert.equal(gate.click('other', 2050), false, 'a click on another board is not swallowed');
  assert.equal(gate.click('j07-dark', 2060), false, 'and it clears the note');
  gate.down('j07-dark', 3000);
  assert.equal(gate.click('j07-dark', 5000), false, 'a stale note does not eat a later click');
  gate.down(null);
  assert.equal(gate.click('j07-dark'), false, 'an untaken pointerdown leaves nothing to swallow');
});

test('only a game running in time takes taps on pointerdown', () => {
  const live = { mod: sneeze, state: walking() };
  assert.equal(runsLive(live), true);
  assert.equal(runsLive({ mod: sneeze, state: { ...live.state, won: true } }), false);
  assert.equal(runsLive({ mod: sneeze, state: sneeze.newGame('t') }), false, 'a board before its start is not live: click path');
  assert.equal(runsLive({ mod: wuziqi, state: wuziqi.newGame('t') }), false, 'no tick: click path');
  assert.equal(runsLive(null), false);
});

test('wired: pointerdown on a live board acts once, the click is stopped; a keyboard click still reaches the page', () => {
  const on = {};
  const saved = { document: globalThis.document, setInterval: globalThis.setInterval };
  globalThis.document = { addEventListener: (type, fn) => { (on[type] ??= []).push(fn); }, querySelectorAll: () => [], visibilityState: 'visible' };
  globalThis.setInterval = () => 0;
  try {
    let acts = 0;
    const mod = { ...sneeze, act: (s, d) => { acts += 1; return sneeze.act(s, d); }, html: () => '' };
    const g = { taskId: 'j07-dark', mod, state: walking() };
    wireLiveGames({ boardFor: () => g, lang: () => 'zh', onWon: () => {} });
    const host = { dataset: { game: 'j07-dark' }, isConnected: false, closest: () => host };
    const btn = { dataset: { g: 'step' }, disabled: false, closest: (sel) => (sel === '[data-g]' ? btn : sel === '[data-game]' ? host : null) };
    const ev = (extra) => ({ target: btn, button: 0, isPrimary: true, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; }, ...extra });
    for (const fn of on.pointerdown) fn(ev());
    assert.equal(acts, 1, 'acted at pointerdown');
    const click = ev({ detail: 1 });
    for (const fn of on.click) fn(click);
    assert.equal(click.stopped, true, 'the finger-lift click never reaches the page route');
    const key = ev({ detail: 0 });
    for (const fn of on.click) fn(key);
    assert.equal(key.stopped, false, 'Enter/Space on a focused button goes the page route');
    // A board not running in time: nothing at pointerdown, the click untouched.
    g.state = { ...g.state, live: false };
    for (const fn of on.pointerdown) fn(ev());
    const click2 = ev({ detail: 1 });
    for (const fn of on.click) fn(click2);
    assert.equal(acts, 1);
    assert.equal(click2.stopped, false);
  } finally { Object.assign(globalThis, saved); }
});

// The 黑地 and 挑水 tests went with their games, deleted 2026-10-19 (「没用在游戏中的, 都删了吧」); any board that runs in time does here.
function walking() { return sneeze.act(sneeze.newGame('t'), { g: 'start' }).state; }
