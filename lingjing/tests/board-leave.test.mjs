// 收手 — a board he opened by choice is put down at any moment (Hanli, 2026-10-26, at 兽潮's 先选一门本事: 「兽潮开始了,
// 不能退出来吗? 必须玩完才行?」). One rule, the board's origin (rules/skips.mjs leaveOf): on the story's own boards
// ✕ goes on (gives only) and 留 keeps it; every other board may be left, costing nothing and paying nothing. 兽潮's night is
// not counted and no cooldown starts; a kept board taken up and put down is over for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, task } from '../scripts/rules.mjs';
import { toldUpTo } from '../scripts/rules/progress.mjs';
import { leaveOf, storyBoard } from '../scripts/rules/skips.mjs';
import { asideVerb } from '../scripts/rules/aside.mjs';
import { shouchaoHere } from '../scripts/rules/shouchao.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';

const content = loadContent();
const START = new Date(2026, 9, 25, 9, 0);
const NOW = new Date(2026, 9, 26, 10, 0);
const TOMORROW = new Date(2026, 9, 27, 10, 0);
const ctx = (now = NOW) => ({ now, quests: [] });
const PAGE = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');

/* 药园 at 古四, its passage told: 守炉 · 药园巡夜 (the scene's own board) open or over, 兽潮 open, 射鹿 left on an earlier day. */
function yaoyuan({ ownDone = true } = {}) {
  process.env.LINGJING_STAMINA_LIMIT = '0';
  let s;
  try { s = playTo(content, newState(content, 'zh', START), 'wm-yaoyuan', { now: START }).state; } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  s = toldUpTo(content, s);
  s.tell_owed = [];
  s.quests = { ...(s.quests ?? {}), 'guan-shouchao': { done_at: START.toISOString() } }; // 兽潮's first night (the 执事堂's errand) held: the hourly tide is up
  s.told_scenes = [...new Set([...(s.told_scenes ?? []), s.scene])];
  if (ownDone) s.tasks = { ...s.tasks, 'yaoyuan-xunye': { status: 'done' }, 'yaoyuan-luobo': { status: 'done' } }; // and the 萝卜 (2026-10-26)
  s.tasks = { ...s.tasks, 'deer-wind': { status: 'done', skipped: true } }; // 射鹿 put away on the way
  s.stamina = 100;
  s.stamina_at = NOW.toISOString();
  return s;
}
const leave = (s, id, now = NOW) => task(s, content, ctx(now), { action: 'leave', id });

test('the rule is the board\'s origin: the scene\'s own board is the story\'s, 兽潮 and 本王考考你 are his to put down', () => {
  const s = yaoyuan({ ownDone: false });
  assert.equal(storyBoard(content, s, 'yaoyuan-xunye'), true);
  assert.equal(leaveOf(content, s, 'yaoyuan-xunye'), false, 'the story\'s own: its ✕ goes on as a skip, never 收手');
  assert.equal(leaveOf(content, s, 'shouchao'), true);
  const l = look(s, content, ctx());
  const row = (id) => l.tasks.find((t) => t.id === id);
  assert.equal(row('shouchao').leave, true, 'Look carries it');
  assert.equal(row('yaoyuan-xunye').leave, undefined);
  if (row('benwang-kao')) assert.equal(row('benwang-kao').leave, true);
  const r = leave(s, 'yaoyuan-xunye');
  assert.equal(r.result.ok, false);
  assert.equal(r.result.refused, 'story-board');
});

test('兽潮 put down: nothing written — no 灵气 spent, the night not counted, no cooldown, still offered', () => {
  const s = yaoyuan();
  const r = leave(s, 'shouchao');
  assert.equal(r.result.ok, true);
  assert.equal(r.state, null, 'the save untouched');
  assert.equal(shouchaoHere(content, s, 'shouchao', NOW), true);
  const row = look(s, content, ctx()).tasks.find((t) => t.id === 'shouchao');
  assert.equal(row.status, 'offered');
  assert.equal(row.wait_min, undefined, 'no cooldown');
  assert.equal(s.stamina, 100);
});

test('a kept board taken up again, put down: over for the story for good, nothing handed twice — never back by itself (Hanli 11-03)', () => {
  const left = yaoyuan();
  assert.equal(left.tasks['deer-wind']?.skipped, true, '射鹿 was left on the way');
  // Kept for later (留, rules/skips.mjs keepBoard), then taken up from 收着的棋局.
  const s0 = { ...left, kept: [{ task: 'deer-wind', story: true, scene: null, place: null, chapter: left.chapter, at: START.toISOString() }] };
  assert.equal(look(s0, content, ctx()).replay, undefined, 'never offered by itself');
  const open = task(s0, content, ctx(), { action: 'kept-play', id: 'deer-wind' }).state;
  assert.equal(open.tasks['deer-wind'].replay, true);
  assert.equal(leaveOf(content, open, 'deer-wind'), true);
  const r = leave(open, 'deer-wind');
  assert.equal(r.result.ok, true);
  const s = r.state;
  assert.deepEqual({ status: s.tasks['deer-wind'].status, skipped: s.tasks['deer-wind'].skipped }, { status: 'done', skipped: true });
  assert.deepEqual((s.skipped ?? []).filter((e) => e.task === 'deer-wind'), [], 'put away, not queued again');
  assert.deepEqual(s.bag ?? {}, open.bag ?? {}, 'nothing stowed again');
  assert.equal(s.wealth, open.wealth, 'nothing paid');
  assert.equal(look(s, content, ctx()).replay, undefined, 'not again today');
  assert.equal(look(s, content, ctx(TOMORROW)).replay, undefined, 'nor another day: 留 is what keeps a board');
});

test('先放一放: putting a board down never moves the story, so the set-aside book lets it through', () => {
  const s = { ...yaoyuan(), aside: { scene: 'wm-yaoyuan', items: [], i: 0, j: 0 } };
  assert.equal(asideVerb(content, s, 'task', { action: 'leave', id: 'shouchao' }), null);
  assert.equal(asideVerb(content, s, 'task', { action: 'leave', id: 'deer-wind' }), null, 'any board he may put down');
  assert.ok(asideVerb(content, s, 'resolve', { exit: 'x' }), 'a way on is still held');
});

test('the page: 收手 under a board he may leave, never under the story\'s own; leaving takes the play down and puts it in the tray', () => {
  const l = look(yaoyuan({ ownDone: false }), content, ctx());
  const page = { look: l, lang: 'zh', words: WORDS.zh, content: {}, reading: null };
  assert.match(cardHtml({ card: 'board', id: 'shouchao' }, page), /data-board-leave="shouchao"[^>]*>收手</);
  assert.doesNotMatch(cardHtml({ card: 'board', id: 'yaoyuan-xunye' }, page), /data-board-leave/);
  assert.match(PAGE, /\['\[data-board-leave\]', \(el\) => leaveGame\(el\.dataset\.boardLeave\)\]/);
  const body = PAGE.slice(PAGE.indexOf('function leaveGame(id)'), PAGE.indexOf('function skipGame(id)'));
  assert.match(body, /beats\.leave\(id\);\n {2}boards\.delete\(id\);\n {2}forgetShell\(id\);/, 'the play taken down');
  assert.match(body, /write\('task', \{ action: 'leave', id \}\)/, 'the rules asked, one verb');
  assert.match(PAGE, /if \(view\.left\.length\) cards = cards\.filter\(\(c\) => !\(c\.card === 'board' && view\.left\.some\(\(l\) => l\.id === c\.id\)\)\);/, 'never back up by itself');
  assert.match(PAGE, /left: view\.left\.filter\(\(l\) => l\.id !== id\)/, 'opened from the tray again, it stands');
});

/* ── Every board has a way out (Hanli 10-26: 「查一下, 有很多小游戏没有声音和退出」) ──
   Every board: 留 · ✕ from the first moment (Hanli 11-03); ✕ on one he chose is 收手. Never a board the story needs but no scene shows (it would get neither). The card draws
   the way out for every kind of board — a chat (jinchat), the breath kit (qimai, its own mount), a Phaser kit. */

const boardTasks = content.tasks.tasks.filter((t) => t.kind === 'board');
const allScenes = Object.values(content.chapters).flatMap((ch) => Object.values(ch.scenes ?? {}));
const shownIds = new Set(allScenes.flatMap((sc) => (sc.show ?? []).filter((c) => c.card === 'board').map((c) => c.id)));
const gameFile = (g) => new URL(`../scripts/games/${g}.js`, import.meta.url);

test('no board the story needs is left with neither way out: every `needs.task` board is shown by a scene', () => {
  const needed = allScenes.flatMap((sc) => (sc.exits ?? []).map((e) => e.needs?.task).filter(Boolean));
  const hole = [...new Set(needed)].filter((id) => boardTasks.some((t) => t.id === id) && !shownIds.has(id));
  assert.deepEqual(hole, [], 'needed by a way on, shown by no scene: no way out drawn');
});

test('the card draws the way out for every kind of board, as the shell bar\'s 留 · ✕ — the story\'s own and his alike, from the first moment', async () => {
  const kinds = [...new Set(boardTasks.map((t) => t.game).filter((g) => g && fs.existsSync(gameFile(g))))].sort();
  assert.ok(kinds.includes('jinchat') && kinds.includes('qimai') && kinds.includes('shouqiang'));
  for (const game of kinds) {
    const mod = await import(gameFile(game));
    let state = null;
    try { state = mod.html ? mod.newGame('t', 1, {}) : null; } catch { state = null; }
    const g = { mod, state }; // from the first frame: no stuck wait
    const id = `t-${game}`;
    const page = (own) => ({ lang: 'zh', words: WORDS.zh, content: {}, reading: null, boardFor: () => g,
      look: { tasks: [{ id, kind: 'board', game, title: game, ...(own ? {} : { leave: true }) }], scene: own ? { show: [{ card: 'board', id }] } : { show: [] } } });
    const own = cardHtml({ card: 'board', id }, page(true));
    assert.match(own, new RegExp(`class="gshell[^"]*" data-shell="${id}"`), `${game}: the shell's frame (its 🔊)`);
    // The way out is the shell bar's ✕, last at the far right (Hanli 10-27: 「收手按钮改成右上的关闭icon button吧」).
    const bar = (html) => html.slice(html.indexOf('<div class="gshell-tools">'), html.indexOf('</header>'));
    const out = new RegExp(`data-board-keep="${id}">留</button><button type="button" class="gshell-btn gshell-close" title="不玩了" aria-label="不玩了" data-board-close="${id}">✕</button></div>`);
    assert.match(bar(own), out, `${game}: the story's own board: 留 · ✕`);
    const his = cardHtml({ card: 'board', id }, page(false));
    assert.match(bar(his), out, `${game}: his board: 留 · ✕ (✕ puts it down, closeBoard)`);
    assert.doesNotMatch(his, />收手<|>问询<|class="acts gskip"/, `${game}: no words under the board`);
  }
});
