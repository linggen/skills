// 第一回's two retention beats (Hanli 10-22: 「你说的1-6 都是好主意, 按你说的改一遍. 关键是能留住玩家」):
// 二十问 · 银月 at 00-yinyue — the player's first real AI moment, a story board — and the teaching 斗法
// at 00-fox — the card fight met before 第三回's 蠪侄, the book's own face-off with the hurt fox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { duel, fightSetup, playTo, resolve } from '../scripts/rules.mjs';
import { fitPresence, herAwake, hasCompanion, HER_GAME_TTL_MS } from '../scripts/rules/companion.mjs';
import { pageHerGame } from '../scripts/rules/hergame.mjs';
import { foeOf } from '../scripts/rules/world.mjs';
import { act, begin, foeTurn } from '../scripts/battle.js';
import * as twenty from '../scripts/games/twenty.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-01T09:00:00+08:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const scenes = content.chapters['00-prologue'].scenes;
const at = (id) => playTo(content, newState(content, 'zh', NOW), id, { now: NOW }).state;
const task = content.tasks.tasks.find((t) => t.id === 'yinyue-what');

/* ── 二十问 · 银月 ── */

test('二十问 · 银月 stands at 00-yinyue: the passage split word for word after 「烂成这样。」, the way on waits for it', () => {
  const sc = scenes['00-yinyue'];
  assert.deepEqual(sc.show, [{ card: 'board', id: 'yinyue-what' }]);
  assert.deepEqual(sc.offers.tasks, ['yinyue-what']);
  assert.equal(sc.exits.find((e) => e.id === 'follow').needs.task, 'yinyue-what');
  for (const lang of ['zh', 'en']) {
    assert.match(sc.story[lang], lang === 'zh' ? /烂成这样。」$/ : /Rotten through\."$/);
    assert.match(sc.story_after[lang], lang === 'zh' ? /^小满道：「……你是那只狐狸？」/ : /^Xiaoman said, "…Are you that fox\?"/);
    assert.match(sc.story_full[lang], lang === 'zh' ? /烂成这样。」$/ : /Rotten through\."$/);
    assert.match(sc.story_after_full[lang], lang === 'zh' ? /^小满道：「……你是那只狐狸？」/ : /^Xiaoman said/);
  }
  assert.equal(task.game, 'twenty');
  assert.equal(task.needs, 'her');
  assert.ok(content.games.games.some((g) => g.id === 'twenty' && g.task === 'yinyue-what' && g.scene === '00-yinyue'), 'its games.json story row');
  assert.deepEqual(lint(content), []);
});

test('二十问: what counts as the guess is the deal\'s, checked on the player\'s own words — 妖王 is not a guess (she said it)', () => {
  const d = task.deal;
  assert.ok(d.questions >= d.skip_after && d.skip_after >= 1);
  for (const yes of ['你是那只狐狸吗', '你是狐狸精！', '你其实是只狐吧', 'Are you the fox?', 'you are a silver fox']) assert.equal(twenty.names(d, yes), true, yes);
  for (const no of ['你是妖王吗', '你多大了', '你吃饼吗', 'Are you a demon queen?', 'foxglove? no']) assert.equal(twenty.names(d, no), false, no);
  assert.equal(twenty.starsFor(2), 3);
  assert.equal(twenty.starsFor(5), 2);
  assert.equal(twenty.starsFor(9), 1);
  // The round's facts go in brackets on the first line and on the guess; every other line is his own words.
  assert.match(twenty.lineFor(d, '你是谁？', { first: true }), /^@银月 （天亮[\s\S]*）你是谁？$/);
  assert.equal(twenty.lineFor(d, '你几岁？'), '@银月 你几岁？');
  assert.match(twenty.lineFor(d, '你是狐狸！', { guess: true }), /^@银月 （他说中了[\s\S]*）你是狐狸！$/);
  assert.match(twenty.lineFor(d, 'Who are you?', { first: true, lang: 'en' }), /^@Yinyue \(Daybreak[\s\S]*\) Who are you\?$/);
  assert.equal(twenty.meta.stuckClock, false, 'the way out is the questions\', not 75 s');
});

test('unmet at 00-yinyue, she is held on the stage for the round — only there, only for its board; she never joins by it', () => {
  const s = at('00-yinyue');
  assert.equal(s.scene, '00-yinyue');
  assert.equal(hasCompanion(s), false);
  const held = pageHerGame(content, s, { hold: 1, task: 'yinyue-what' }, NOW);
  assert.equal(held.result.ok, true, JSON.stringify(held.result));
  assert.equal(held.keep.her_game.stage, '00-yinyue');
  const fitted = fitPresence(content, held.keep, NOW);
  assert.equal(fitted.companion.awake, true, 'the engine\'s flag: her turn runs');
  assert.equal(hasCompanion(fitted), false, 'not joined');
  assert.equal(herAwake(fitted, NOW), false, 'no moments, no gifts: the round only');
  // The hold lapses, or ends: the flag goes.
  const later = new Date(NOW.getTime() + HER_GAME_TTL_MS + 1000);
  assert.equal(fitPresence(content, fitted, later).companion.awake, undefined);
  const off = pageHerGame(content, fitted, { hold: 0, task: 'yinyue-what' }, NOW);
  assert.equal(fitPresence(content, off.keep, NOW).companion.awake, undefined);
  // Another board, or another scene: no hold.
  assert.equal(pageHerGame(content, s, { hold: 1, task: 'jiaxin-letter' }, NOW).result.ok, false);
  const cave = at('00-cave');
  assert.equal(pageHerGame(content, cave, { hold: 1, task: 'yinyue-what' }, NOW).result.refused, 'no-host');
  // Won (or left), the story goes on and she joins by 带她出谷 as before.
  const done = { ...s, tasks: { ...s.tasks, 'yinyue-what': { status: 'done' } } };
  const on = resolve(done, content, ctx(), { exit: 'follow' });
  assert.equal(on.result.ok, true, JSON.stringify(on.result));
  assert.equal(hasCompanion(on.state), true);
});

/* ── the teaching 斗法 at 00-fox ── */

const foxGame = () => scenes['00-fox'].exits.find((e) => e.id === 'save').game;

test('00-fox: 「受伤的野兽最凶」 — the save exit is a 试 of nerve (survive 3), three cards of the book, the exit\'s passage unchanged', () => {
  const g = foxGame();
  assert.equal(g.kind, 'duel');
  assert.equal(g.creature, 'foe-yinhu');
  assert.equal(g.foe.trial.survive, 3);
  assert.ok(g.foe.trial.goal.zh && g.foe.trial.goal.en);
  assert.deepEqual(g.foe.extra, ['kuzhi', 'waiyi', 'bupa']);
  for (const id of [...g.foe.extra, ...g.foe.deck]) assert.ok(content.cards.cards.find((c) => c.id === id)?._token, `${id}: a trial's card, never in a deck or a reward`);
  assert.match(scenes['00-fox'].exits.find((e) => e.id === 'save').story.zh, /它不咬了。/);
  const s = at('00-fox');
  assert.equal(resolve(s, content, ctx(), { exit: 'save' }).result.refused, 'game-not-won');
});

test('the teaching fight cannot be lost: ending every turn at once still stands three of its turns', () => {
  const s = at('00-fox');
  const g = foxGame();
  const catalog = Object.fromEntries(content.cards.cards.map((c) => [c.id, c]));
  for (let d = 0; d < 10; d += 1) {
    const st = begin(fightSetup(content, s, foeOf(content, g), NOW, g.id, `fox|${d}`), catalog);
    for (let n = 0; n < 40 && st.outcome === 'open'; n += 1) {
      if (st.whose === 'foe') foeTurn(st); else act(st, { kind: 'end' }, 'you');
    }
    assert.equal(st.outcome, 'won', `day ${d}`);
    assert.equal(st.log.find((x) => x.act === 'trial-passed')?.how, 'survive');
    assert.ok(st.you.hp > 0, `day ${d}: ${st.you.hp}/${st.you.hpMax} — not a card played, still standing`);
  }
});

test('won, it pays nothing — no card, no loot, no 修为 — and the story goes on to the cave', () => {
  const s = { ...at('00-fox'), stamina: 100 };
  const r = duel(s, content, ctx(), { id: 'fox-bite' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  const won = { ...s, wins: { ...s.wins, 'fox-bite': NOW.toISOString() } };
  const on = resolve(won, content, ctx(), { exit: 'save' });
  assert.equal(on.result.ok, true, JSON.stringify(on.result));
  assert.equal(on.state.scene, '00-cave');
  assert.deepEqual(on.state.cards, s.cards, 'no card');
  assert.equal(on.state.progress ?? 0, s.progress ?? 0);
  assert.ok(!content.creatures.creatures.find((c) => c.id === 'foe-yinhu').loot, 'no loot');
});
