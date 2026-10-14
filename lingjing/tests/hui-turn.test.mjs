// A 回's turn comes in the book's order: the old 回's last passage, its 「完」, the new 回's
// seal (新的一回), then the new 回's first passage, then that scene's choices and games.
//
// Live 2026-10-14, 古二 → 今 · 一 (Hanli: 「今线突然从半道出来了… 第二回刚完, 右下角有个按钮,
// 还有一件, 一点, 出来今线, 但不是最开始」; then 「今1看了点故事, 然后跳出来这个」): at the turn
// the j01-track scene card queued behind 「第二回 · 完」 — one tap on 还有 1 件 › put the 「完」
// off and 开课 on the stage with j01-track's 55 beats unplayed; 显示全文 on 古二's last passage
// showed j01-track's beats with it; and the 新的一回 seal waited for the box to go quiet, so it
// came up three scenes on, over the 千米 board. And the board's 起跑 did nothing: the game clock
// laid the same board again every 100 ms, so a real tap never landed on one button.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve } from '../scripts/rules.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { stageSlots } from '../scripts/stage.mjs';
import { atTurn, atTurnCards, bookAhead, boxGivesWay } from '../scripts/queue.js';
import { advance, atLast, emptyReading, showAll, withTold } from '../scripts/dialogue.js';
import { wireLiveGames } from '../scripts/live-games.js';
import * as qianmi from '../scripts/games/qianmi.js';

// 00-notice's village map played (batch two, 2026-10-14): its way on waits on it.
const eveDone = (s) => ({ ...s, tasks: { ...s.tasks, 'village-eve': { status: 'done', period: 'once', done_at: '2026-10-01T00:00:00Z' } } });

const content = loadContent();
const ctx = { now: new Date('2026-10-05T10:00:00'), quests: [] };
const save = name => { const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${name}.json`, import.meta.url), 'utf8')); return d.state ?? d; };
const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');

/* 古二's last choice taken: the save on j01-track, 今 · 一's first scene. */
function turned() {
  const s = resolve(eveDone(save('jin-notice')), content, ctx, { exit: 'go' }).state;
  return { s, l: look(s, content, ctx) };
}

test('at the turn the 「完」 stands alone: no scene card, no game, nothing behind it to put it off with', () => {
  const { l } = turned();
  assert.equal(l.scene.id, 'j01-track');
  assert.equal(l.chapter.hui, 'j01');
  assert.ok(l.chapter.close, '「第二回 · 完」 is owed here');
  const cards = l.stage ?? [];
  assert.ok(cards.some(c => c.card === 'panel'), 'the scene card is the rules\' (it waits for the passage)');
  // The page: the turn (the 「完」 not yet put away), the new 回's passage still to tell.
  const turn = atTurn({ oldPlaying: false, closeUp: true });
  const held = atTurnCards(cards, { turn, ahead: true });
  for (const skip of [[], ['closed:h02'], [`closed:${l.chapter.close.id}`]]) {
    const slots = stageSlots(l, held, { skip });
    assert.deepEqual(slots.main.map(c => c.card), ['closed'], `the 「完」 in main (skip ${skip})`);
    assert.equal(slots.footer.waiting, 0, 'no 还有 N 件 ›');
    assert.deepEqual(slots.queue, []);
  }
  assert.ok(stageSlots(l, held).header.some(c => c.card === 'people'), 'whoever is in the scene stays in the header');
  // The passage told (or none to tell), the turn holds nothing back.
  assert.deepEqual(atTurnCards(cards, { turn, ahead: false }), cards);
  assert.deepEqual(atTurnCards(cards, { turn: false, ahead: true }), cards);
});

test('the turn lasts until the new 回\'s seal has played: the box holds the passage for it, never the seal for the passage', () => {
  // The old 回's last words still in the box: not the turn yet — they come first.
  assert.equal(atTurn({ oldPlaying: true, closeUp: true, sealOwed: true }), false);
  // The 「完」 up, then put away with the seal still to come: still the turn.
  assert.equal(atTurn({ closeUp: true, sealOwed: true }), true);
  assert.equal(atTurn({ sealOwed: true }), true, 'after 合上, the seal is the turn\'s');
  assert.equal(atTurn({ titlePending: true }), true);
  assert.equal(atTurn({}), false, 'all of it played: the box tells on');
  // While it is the turn, the box (on the new 回's first beat) is not "ahead" of the seal,
  // and it steps aside for it.
  const huiTurn = atTurn({ sealOwed: true });
  assert.equal(bookAhead({ playing: true, huiTurn }), false);
  assert.equal(boxGivesWay({ huiTurn }), true);
  // The page wires it so: the seal on its way is part of atHuiTurn, and the turn's rule runs on the stage.
  assert.match(src, /const atHuiTurn = \(\) => atTurn\(\{ oldPlaying: oldHuiPlaying\(\), closeUp: closeUp\(\), titlePending: titlePending\(\), sealOwed \}\);/);
  assert.match(src, /if \(kind === 'chapter'\) sealOwed = true;/);
  assert.match(src, /cards = atTurnCards\(cards, \{ turn: atHuiTurn\(\), ahead: storyAhead\(\) \}\);/);
});

test('显示全文 never runs past a 回\'s turn: 古二\'s last passage shows whole, 今 · 一\'s begins after the turn from its first beat', () => {
  const before = save('jin-notice');
  const { s } = turned();
  // What the page draws at j01-track: the choice's passage (古二's) and the scene's (今 · 一's).
  const tell = playOf(content, s, tellOf(content, s).tell);
  // (A 前情 may lead in: a recap of earlier 回s, read with the passage it leads into.)
  assert.deepEqual(tell.filter(t => t.of !== 'catchup').map(t => [t.of, t.hui]), [['choice', 'h02'], ['scene', 'j01']]);
  const gu = tell.findIndex(t => t.of === 'choice');
  const r = withTold(emptyReading(before.scene), tell, s.scene);
  assert.equal(r.i, 0);
  const all = showAll(r);
  assert.equal(all.i, gu, '古二\'s passage (and the 前情 before it) only');
  assert.equal(atLast(all), false, 'no choice yet: the turn comes first');
  assert.equal(showAll(all), all, 'and 显示全文 again goes no further');
  const on = advance(all);
  assert.deepEqual([on.i, on.j], [gu + 1, 0], 'a tap: 今 · 一\'s first beat — where the turn holds the box');
  assert.equal(on.items[on.i].hui, 'j01');
  const rest = showAll(on);
  assert.equal(atLast(rest), true, 'inside 今 · 一, 显示全文 shows the rest and the choices');
});

test('a game on the clock lays its board again only when it changed: 起跑 stays one button until it is tapped', async () => {
  // Idle before 起跑, and over after a fall: the clock changes nothing on the board.
  const idle = qianmi.newGame('x');
  assert.equal(qianmi.html(qianmi.tick(idle, 100)), qianmi.html(idle));
  // The clock, on a stand-in host.
  let writes = 0, html = '';
  const host = { dataset: { game: 'jin-qianmi' }, isConnected: true, get innerHTML() { return html; }, set innerHTML(v) { writes += 1; html = v; } };
  const g = { taskId: 'jin-qianmi', mod: qianmi, state: qianmi.newGame('x') };
  const was = { document: globalThis.document };
  const timers = [];
  const realSet = globalThis.setInterval;
  globalThis.document = { visibilityState: 'visible', querySelectorAll: () => [host], querySelector: () => host, addEventListener: () => {} };
  globalThis.setInterval = (fn, ms) => { const t = realSet(fn, ms); timers.push(t); return t; };
  try {
    wireLiveGames({ boardFor: () => g, lang: () => 'zh', onWon: () => {}, step: 10 });
    await new Promise(r => setTimeout(r, 120));
    assert.equal(writes, 0, 'the page\'s own board stands: no button laid over it under the finger');
    g.state = qianmi.act(g.state, { g: 'start' }).state;
    await new Promise(r => setTimeout(r, 120));
    assert.ok(writes > 0, 'running, the metres move');
    assert.match(html, /data-g-hold="out"/);
  } finally {
    timers.forEach(clearInterval);
    globalThis.setInterval = realSet;
    globalThis.document = was.document;
  }
});
