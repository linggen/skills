// A game up takes the stage alone (Hanli, 2026-10-26, at 沉鼎观 · 药园 with the 游戏厅 test save:
// 「Mac上游戏界面需要独占UI, 不能被其他UI给挤出去」). The 兽潮 board stood under the scene's choices, the
// 射鹿 再试一回 inside them, a second 再试一回 card and the tray — and its bottom fell under the footer.
// One rule (queue.js gameAlone, the page's soloSlots): a board up is the whole of main, the tray goes with it.
// And the offer to replay is drawn in ONE place (stage.mjs replayOnCard).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo } from '../scripts/rules.mjs';
import { toldUpTo } from '../scripts/rules/progress.mjs';
import { gameAlone, onStage } from '../scripts/queue.js';
import { replayOnCard, sceneGame, stageCards, stageSlots } from '../scripts/stage.mjs';
import { WORDS, cardHtml, panelActsHtml } from '../scripts/cards.js';

const content = loadContent();
const START = new Date(2026, 9, 25, 9, 0);
const NOW = new Date(2026, 9, 26, 10, 0);
const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');

/* The builder's moment: 药园 at 古四, its 巡夜 over and its passage told, 射鹿 left on an earlier day, 兽潮 open. */
function yaoyuan() {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  let s;
  try { s = playTo(content, newState(content, 'zh', START), 'wm-yaoyuan', { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  s = toldUpTo(content, s);
  s.tell_owed = [];
  s.told_scenes = [...new Set([...(s.told_scenes ?? []), s.scene])];
  s.tasks = { ...s.tasks, 'yaoyuan-xunye': { status: 'done' } };
  s.skipped = [{ task: 'deer-wind', scene: null, line: null, day: '2026-10-24' }];
  s.stamina = 100;
  return look(s, content, { now: NOW, quests: [] });
}
const page = (l) => ({ look: l, lang: 'zh', words: WORDS.zh, content: {}, reading: null });
const replays = (html) => (html.match(/data-replay-play=/g) ?? []).length;

test('gameAlone: a board up is the whole of main; the one he opened first; none up, nothing changes', () => {
  const board = { card: 'board', id: 'shouchao' }, kao = { card: 'board', id: 'benwang-kao' };
  const cards = [{ card: 'meet', id: 'zheng' }, { card: 'panel' }, { card: 'replay', id: 'deer-wind' }, kao, board];
  const up = (c) => c.card === 'board';
  assert.deepEqual(gameAlone(cards, { up }), [kao]);
  assert.deepEqual(gameAlone(cards, { up, chosen: 'shouchao' }), [board], 'the board he opened from the tray');
  assert.equal(gameAlone(cards, { up: () => false }), null);
  // queue.js onStage reads the same: never a game and the box, nor a game and anything else.
  const at = onStage({ cards, ahead: false, playing: true });
  assert.deepEqual([at.cards, at.box], [[kao], false]);
  // …and the 2026-10-01 rule stands: with the book ahead the board waits for its passage, the scene card stands.
  assert.ok(!onStage({ cards, ahead: true }).cards.some(up));
});

test('the page: stageNow ends in soloSlots, the tray and the header go with it, the box steps aside', () => {
  assert.match(PAGE, /return soloSlots\(slots, queued\);/);
  assert.match(PAGE, /const alone = gameAlone\(cards, \{ up: \(c\) => c\.card === 'board' && boardOpenNow\(c\.id\) && \(inMain\.has\(c\) \|\| c\.id === view\.opened\?\.id\), chosen: view\.opened\?\.id \?\? null \}\);/);
  assert.match(PAGE, /return \{ \.\.\.slots, header: \[\], main: alone,/);
  assert.match(PAGE, /const solo = Boolean\(slots\?\.solo\) \|\| momentUp\(\);\n {2}document\.body\.classList\.toggle\('solo', solo\);/);
  assert.match(PAGE, /\$\('tray'\)\.innerHTML = !solo && stands\(headLook\(\), 'tray'\)/);
  // The box yields to the board in main (gameUp reads the soloed slots).
  assert.match(PAGE, /const gameUp = \(slots\) => Boolean\(slots\?\.main\?\.some\?\.\(\(c\) => c\.card === 'board' && boardOpenNow\(c\.id\)\)\);/);
});

test('兽潮 is not the scene\'s game: it waits behind the scene card (the tray\'s 开局), never up beside it', () => {
  const l = yaoyuan();
  assert.ok(l.scene?.panel);
  assert.ok(l.tasks.some((t) => t.id === 'shouchao' && t.tide));
  assert.equal(sceneGame(l, { card: 'board', id: 'shouchao' }), false);
  const slots = stageSlots(l, stageCards(l));
  assert.ok(!slots.main.some((c) => c.card === 'board'), 'no board in main beside the scene card');
  assert.ok(slots.main.some((c) => c.card === 'panel'));
});

test('the offer to replay is drawn once: among the scene\'s choices when a scene card stands, else its own card', () => {
  const l = yaoyuan();
  assert.equal(l.replay?.task, 'deer-wind', 'Look offers 射鹿 again');
  assert.equal(replayOnCard(l), false);
  const cards = stageCards(l);
  assert.ok(!cards.some((c) => c.card === 'replay'), 'no card of its own beside the scene card');
  // The scene card (the box put away) draws its choices — and the offer once; the box's choices, once.
  const stage = cards.map((c) => cardHtml(c, page(l))).join('');
  assert.equal(replays(stage), 1, 'once on the stage');
  assert.equal(replays(panelActsHtml(page(l), { inBox: true })), 1, 'once in the box');
  // No scene card: the offer is its own card, once.
  const bare = { ...l, scene: { ...l.scene, panel: null } };
  assert.equal(replayOnCard(bare), true);
  assert.equal(replays(stageCards(bare).map((c) => cardHtml(c, page(bare))).join('')), 1);
});
