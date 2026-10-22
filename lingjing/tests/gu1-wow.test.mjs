// 第一回's two retention beats (Hanli 10-22: 「你说的1-6 都是好主意, 按你说的改一遍. 关键是能留住玩家」):
// 讨饼债 at 00-yinyue (was 二十问 · 银月 till Hanli's 10-22 play: 「这个设计不太好. 太简单, 反倒不知道是答案.....怎么改一下呢?」 →
// 「可以, 试一下」) — the player's first real AI moment, a story board — and the teaching 斗法
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
import * as bingzhai from '../scripts/games/bingzhai.js';
import { ADMIT } from '../scripts/games/bingzhai-rules.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-01T09:00:00+08:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const scenes = content.chapters['00-prologue'].scenes;
const at = (id) => playTo(content, newState(content, 'zh', NOW), id, { now: NOW }).state;
const task = content.tasks.tasks.find((t) => t.id === 'yinyue-what');

/* ── 讨饼债 ── */

test('讨饼债 stands at 00-yinyue: the passage split word for word after 「烂成这样。」, the way on waits for it', () => {
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
  assert.equal(task.game, 'bingzhai');
  assert.equal(task.needs, 'her');
  assert.deepEqual(task.title, { zh: '讨饼债', en: 'The flatbread debt' });
  assert.ok(content.games.games.some((g) => g.id === 'bingzhai' && g.task === 'yinyue-what' && g.scene === '00-yinyue'), 'its games.json story row');
  assert.ok(!content.games.games.some((g) => g.id === 'twenty' && g.task), 'the 游戏厅\'s 二十问 (group ai) is another game; no story row of it is left');
  // The book owns the debt after the board either way (no new book sentence): the done line is its own.
  for (const lang of ['zh', 'en']) assert.ok(sc.story_after[lang].includes(task.done_line[lang].replace(/^「|」$/g, '').replace(/^"|"$/g, '')), lang);
  assert.deepEqual(lint(content), []);
});

test('讨饼债: the win is HER line owning the debt, page-checked — a negation, an echo or a scoff does not count (zh and en)', () => {
  const yes = [
    '哼……好吧，本王欠你一张饼。', '一言为定。本王，欠你一张饼。', '这张饼，本王记下了。', '算本王欠你的。', '饼债本王认了，别再念了。',
    '不欠！……罢了，欠你一张饼。', '欠你一张饼，行了吧？', '你说得对，本王欠你一张饼。',
    'Agreed. This queen owes you one flatbread.', 'Fine. I owe you a flatbread, mortal.', 'All right — I owe you one.', 'The bread debt is mine, happy?',
  ];
  const no = [
    '本王才不欠你什么饼。', '本王不欠你饼。', '谁说本王欠你饼了！', '你说本王欠你一张饼？做梦。', '本王欠你一张饼？', '欠你一张饼？才怪。',
    '本王欠你一张饼——才怪。', '就算本王欠你一张饼，又如何？', '本王欠你一个人情，饼就别提了。', '你欠我饼！', '本王只是见它孤零零的，顺手收留了。',
    'This queen owes you nothing.', "I don't owe you a flatbread.", 'Who says I owe you a flatbread?', 'Do I owe you a cake?', 'I owe you a favour, perhaps.', '',
  ];
  for (const line of yes) assert.equal(bingzhai.admits(line), true, line);
  for (const line of no) assert.equal(bingzhai.admits(line), false, line);
  assert.ok(ADMIT.zh.length && ADMIT.en.length, 'a data list, both languages');
  assert.equal(bingzhai.starsFor(3), 3);
  assert.equal(bingzhai.starsFor(5), 2);
  assert.equal(bingzhai.starsFor(9), 1);
});

test('讨饼债: the deal — her facts in brackets on the first line only, he is 沈小满 and she gives no name; the way out after 4, over at 10', () => {
  const d = task.deal;
  assert.equal(d.exchanges, 10);
  assert.equal(d.skip_after, 4);
  assert.match(d.context.zh, /沈小满/);
  assert.match(d.context.zh, /别报名字/);
  assert.match(d.context.zh, /本王欠你一张饼/, 'she is asked to own it in the words the page reads');
  assert.ok(bingzhai.admits(d.context.zh.match(/「(本王欠你一张饼)」/)[1]));
  assert.match(d.context.en, /Shen Xiaoman/);
  assert.match(bingzhai.lineFor(d, '你欠我一张饼。', { first: true }), /^@银月 （天亮[\s\S]*）你欠我一张饼。$/);
  assert.equal(bingzhai.lineFor(d, '你嘴边有饼渣。'), '@银月 你嘴边有饼渣。');
  assert.match(bingzhai.lineFor(d, 'You owe me.', { first: true, lang: 'en' }), /^@Yinyue \(Daybreak[\s\S]*\) You owe me\.$/);
  assert.deepEqual(task.marks, { admitted: 'bing-debt', dodged: null });
  assert.equal(bingzhai.meta.id, 'bingzhai');
  assert.equal(bingzhai.meta.ai, true);
  assert.equal(bingzhai.meta.stuckClock, false, 'the way out is the exchanges\', not 75 s');
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
  // Left by 「算了，往下走」 (the page ends no round then): the board done, the flag goes on the next read.
  const left = { ...fitted, tasks: { ...fitted.tasks, 'yinyue-what': { status: 'done', skipped: true } } };
  assert.equal(fitPresence(content, left, NOW).companion.awake, undefined);
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
    assert.ok(!st.log.some((x) => x.kind === 'fatigue'), `day ${d}: no 反噬 in a teaching fight (foe.fatigue: false)`);
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

test('`fatigue: false` is a fight\'s own word, in data: the setup carries it, a dry deck then costs nothing — every other fight still tires', () => {
  const g = foxGame();
  assert.equal(g.foe.fatigue, false);
  const s = at('00-fox');
  assert.equal(fightSetup(content, s, foeOf(content, g), NOW, g.id, 'fox').you.fatigue, false);
  const catalog = Object.fromEntries(content.cards.cards.map((c) => [c.id, c]));
  const plain = (fatigue) => {
    const st = begin({ mode: 'pve', seed: 'f', you: { tier: 'qi', deck: [], extra: [], ...(fatigue === false ? { fatigue } : {}) }, foe: { tier: 'qi', deck: ['ziya', 'ziya', 'ziya', 'ziya', 'ziya', 'ziya', 'ziya', 'ziya'] } }, catalog);
    for (let n = 0; n < 12 && st.outcome === 'open'; n += 1) { if (st.whose === 'foe') foeTurn(st); else act(st, { kind: 'end' }, 'you'); }
    return st.log.filter((x) => x.kind === 'fatigue').length;
  };
  assert.equal(plain(false), 0, 'no 反噬');
  assert.ok(plain(undefined) > 0, 'without the word, a dry deck tires as ever');
  // The 三试 and every other scene fight carry no such word.
  const others = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {})).flatMap((sc) => sc.exits ?? []).filter((e) => e.game?.foe && e.game.id !== 'fox-bite');
  assert.ok(others.length && others.every((e) => e.game.foe.fatigue === undefined));
});
