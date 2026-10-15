// A story board left, and offered again (Hanli, 2026-10-15 — rules/skips.mjs, scripts/stuck.js):
//   1. 「跳过这个按钮不要一开始就显示, 玩家卡住了才显示」 — the page's gate: never at the start;
//      after STUCK_MS on the stage, or once the game says it is stuck, whichever first;
//   2. 「跳过没有奖励」 — a skip pays nothing (no grant, grade, mark); the story moves on as after a win;
//   3. 「最好后面能自动触发重玩」 — a board left comes back by itself on a later day, the stage idle,
//      one a day; won then it pays in full; put off, it comes back another day;
//   4. 「对游戏进展要确保没有影响」 — every 卷一 scene and exit is reached skipping every board
//      (tests/playtest.test.mjs), a grade-gated way on opens for a skipped board, 修为 keeps the
//      book's pace (tests/xiuwei-pace.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win, pageOnly } from '../scripts/rules.mjs';
import { dayKey } from '../scripts/state.mjs';
import { stageCards, stageSlots, CARD_KINDS } from '../scripts/stage.mjs';
import { STUCK_MS, stampShown, stuckNow } from '../scripts/stuck.js';
import { crawlRules } from './crawl.mjs';

const content = loadContent();
const DAY = 864e5;
const crawl = crawlRules(content, { boards: 'skip' });
/* A save standing at a scene, as the crawl first reached it — the day's 体力 full, nothing left before. */
function at(key) {
  const got = crawl.states.get(key);
  assert.ok(got, `the crawl reached ${key}`);
  return { s: { ...got.s, skipped: [], stamina: 100, stamina_at: got.now.toISOString() }, now: got.now };
}
const ctxAt = (now) => ({ now, quests: [] });
function must(fn, s, now, args) {
  const out = fn(s, content, ctxAt(now), args);
  assert.equal(out.result.ok, true, `${JSON.stringify(args)}: ${JSON.stringify(out.result)}`);
  return out.state ?? s;
}
const later = (now, days = 1) => new Date(now.getTime() + days * DAY);

test('a skip pays nothing: no 修为, no 灵石, no grade, no mark — and the way on opens as after a win', () => {
  const { s: arrived, now } = at('00-waimen/wm-zhoutian');
  // At 一层 (零层 takes no 修为), so the board's grant would land. Won, it pays (the control): 小周天's 三关.
  const s = { ...arrived, step: 1 };
  const won = must(task, must(win, s, now, { id: 'zhoutian-sanguan' }), now, { action: 'done', id: 'zhoutian-sanguan' });
  assert.ok(won.progress > s.progress || won.step > s.step, 'a win pays 修为');
  const left = must(task, s, now, { action: 'skip', id: 'zhoutian-sanguan' });
  assert.deepEqual([left.progress, left.step, left.wealth, left.tier], [s.progress, s.step, s.wealth, s.tier], 'a skip pays nothing');
  assert.deepEqual(left.bag, s.bag, 'no item');
  assert.equal(left.tasks['zhoutian-sanguan'].status, 'done');
  assert.equal(left.tasks['zhoutian-sanguan'].skipped, true, 'recorded as left, not paid');
  assert.equal(left.wins?.['zhoutian-sanguan'], undefined);
  assert.deepEqual(left.skipped.map((e) => [e.task, e.scene, e.day]), [['zhoutian-sanguan', 'wm-zhoutian', dayKey(now)]]);
  const brief = look(left, content, ctxAt(now)).tasks.find((t) => t.id === 'zhoutian-sanguan');
  assert.deepEqual([brief.paid, brief.skipped], [false, true], 'Look: left, not paid');
  // The story goes on exactly as after the win.
  const on = resolve(left, content, ctxAt(now), { exit: 'breathe' });
  assert.equal(on.result.ok, true, JSON.stringify(on.result));
  assert.equal(on.state.scene, 'wm-qingshi');
  // Left once is left: not again, not counted as a win after.
  assert.equal(task(left, content, ctxAt(now), { action: 'skip', id: 'zhoutian-sanguan' }).result.refused, 'already-done');
  assert.equal(task(left, content, ctxAt(now), { action: 'done', id: 'zhoutian-sanguan' }).result.ok, false, 'a skip is never paid after');
});

test('a graded board left writes no grade or mark, owes the rest of the passage, and both grade-gated ways open (00-cave 喂饼)', () => {
  const { s, now } = at('00-prologue/00-cave');
  // Played in `show` order: 扔石听声 before 喂饼.
  assert.equal(task(s, content, ctxAt(now), { action: 'skip', id: 'bread-share' }).result.refused, 'board-waits');
  const one = must(task, s, now, { action: 'skip', id: 'cave-stone' });
  assert.ok((one.tell_owed ?? []).includes('after/00-cave'), 'the passage after the first board is owed, as after a win');
  const two = must(task, one, now, { action: 'skip', id: 'bread-share' });
  assert.equal(two.grades?.['bread-share'], undefined);
  assert.ok(!(two.marks ?? []).some((m) => m.startsWith('bread-') || m.startsWith('stone-')), 'no mark');
  // 分它一半 (most|half) and 自己吃 (none|little) both wait on a grade: left, both are his to choose.
  for (const exit of ['share', 'keep']) assert.equal(resolve(two, content, ctxAt(now), { exit }).result.ok, true, exit);
  // Won with a grade, only that grade's way opens (the gate still stands for a played board).
  const played = must(task, must(win, one, now, { id: 'bread-share', grade: 'none' }), now, { action: 'done', id: 'bread-share' });
  assert.equal(resolve(played, content, ctxAt(now), { exit: 'share' }).result.ok, false);
  assert.equal(resolve(played, content, ctxAt(now), { exit: 'keep' }).result.ok, true);
});

test('a board left comes back by itself on a later day, the stage idle — won then, it pays in full: grant, grade, mark', async () => {
  const { s, now } = at('00-prologue/00-cave');
  const left = must(task, must(task, s, now, { action: 'skip', id: 'cave-stone' }), now, { action: 'skip', id: 'bread-share' });
  // Still at 00-cave, its boards over and its passage read: the stage is idle (the next scene's own
  // board, 00-yinyue's 认路, would hold it — a board of the scene still open is never idle).
  const n = { ...left, tell_owed: [], told_scenes: [...(left.told_scenes ?? []), left.scene] };
  assert.equal(look(resolve(n, content, ctxAt(now), { exit: 'share' }).state, content, ctxAt(later(now))).replay, undefined, 'not over a board still to play');
  assert.equal(look(n, content, ctxAt(now)).replay, undefined, 'never the same day');
  const tomorrow = later(now);
  const lk = look(n, content, ctxAt(tomorrow));
  assert.equal(lk.replay?.task, 'cave-stone', 'the oldest first');
  assert.match(lk.replay.line, /扔石听声|石/);
  // On the stage: under the scene card, never alone without 下一步's way on.
  const cards = stageCards(lk);
  assert.ok(cards.some((c) => c.card === 'replay'));
  // The scene's boards left yesterday stay over: never dealt fresh the next day (live at j07-guan).
  for (const id of ['cave-stone', 'bread-share']) assert.ok(lk.tasks.some((t) => t.id === id && t.status === 'done' && t.skipped), `${id}: Look still knows it is over (the stage never deals it fresh)`);
  assert.equal(CARD_KINDS.replay.holds, false);
  assert.ok(stageSlots(lk, cards), 'it has a slot');
  // Played: the board stands offered again, as on its first day; its win pays the grant, grade and mark.
  const open = must(task, n, tomorrow, { action: 'replay', id: 'cave-stone' });
  assert.deepEqual(open.tasks['cave-stone'], { status: 'offered', replay: true, from: { scene: '00-cave', line: null } });
  assert.ok(look(open, content, ctxAt(tomorrow)).tasks.some((t) => t.id === 'cave-stone' && t.status === 'offered' && t.replay));
  assert.equal(look(open, content, ctxAt(tomorrow)).replay, undefined, 'one at a time');
  // Chosen, it stands with the scene card (so the box steps aside for it), the scene's ways still his.
  const lo = look(open, content, ctxAt(tomorrow));
  assert.ok(stageSlots(lo, stageCards(lo)).main.some((c) => c.card === 'board' && c.id === 'cave-stone'), 'the board stands in main, beside the scene');
  // While the box holds the scene's choices, the box carries the beat too (the stage under it is hidden).
  const { panelActsHtml, WORDS } = await import('../scripts/cards.js');
  const inBox = panelActsHtml({ look: lk, words: WORDS.zh }, { inBox: true });
  assert.match(inBox, /data-replay-play="cave-stone"/);
  assert.match(inBox, /data-replay-later="cave-stone"/);
  assert.doesNotMatch(panelActsHtml({ look: lk, words: WORDS.zh }), /data-replay-play/, 'on the card, the replay is its own card');
  const paid = task(must(win, open, tomorrow, { id: 'cave-stone', grade: 'sure' }), content, ctxAt(tomorrow), { action: 'done', id: 'cave-stone' });
  assert.equal(paid.result.ok, true, JSON.stringify(paid.result));
  const p = paid.state;
  assert.deepEqual(paid.result.paid, task(must(win, { ...s }, now, { id: 'cave-stone', grade: 'sure' }), content, ctxAt(now), { action: 'done', id: 'cave-stone' }).result.paid, 'the original grant, as on its day');
  assert.equal(p.grades['cave-stone'], 'sure');
  assert.ok(p.marks.includes('stone-sure'), 'its mark');
  assert.equal(p.tasks['cave-stone'].status, 'done');
  assert.equal(p.tasks['cave-stone'].skipped, undefined, 'paid now, not left');
  assert.deepEqual(p.skipped.map((e) => e.task), ['bread-share']);
  assert.deepEqual(p.tell_owed ?? [], [], 'its passage was told the day it was left — never again');
  // One a day: the second waits for tomorrow.
  assert.equal(look(p, content, ctxAt(tomorrow)).replay, undefined, 'at most one offered a day');
  assert.equal(look(p, content, ctxAt(later(now, 2))).replay?.task, 'bread-share');
});

test('改日 puts it off to another day; left again, it keeps where it was first left', () => {
  const { s, now } = at('00-zhuji/j07-dark');
  const left = must(task, s, now, { action: 'skip', id: 'jin-dark' });
  assert.equal(left.skipped[0].line, 'jin', 'kept on the line it was left on');
  const idle = { ...left, tell_owed: [], told_scenes: [...(left.told_scenes ?? []), left.scene] };
  const d1 = later(now);
  const offered = look(idle, content, ctxAt(d1)).replay;
  assert.equal(offered?.task, 'jin-dark');
  assert.equal(offered.line, '那夜没走完的十一步……再试一回？', 'the task\'s own line, in the world\'s words');
  const put = must(task, idle, d1, { action: 'later', id: 'jin-dark' });
  assert.equal(look(put, content, ctxAt(d1)).replay, undefined, 'not again today');
  assert.equal(look(put, content, ctxAt(later(now, 2))).replay?.task, 'jin-dark', 'back another day');
  const d2 = later(now, 2);
  const chosen = must(task, put, d2, { action: 'replay', id: 'jin-dark' });
  // On the 今 line too, the board chosen again stands on the stage (live, j07-guan: the side line's filter dropped it).
  const g = at('00-zhuji/j07-guan');
  const guan = must(task, { ...g.s, tell_owed: [], told_scenes: [...(g.s.told_scenes ?? []), 'j07-guan'], tasks: { ...g.s.tasks, 'jin-dark': { status: 'done', skipped: true }, 'jin-pulse': { status: 'done', done_at: d2.toISOString() } }, skipped: [put.skipped[0]], replay_day: null }, d2, { action: 'replay', id: 'jin-dark' });
  const lc = look(guan, content, ctxAt(d2));
  assert.ok(stageSlots(lc, stageCards(lc)).main.some((c) => c.card === 'board' && c.id === 'jin-dark'), 'at the next 今 scene the board chosen again stands');
  const again = must(task, chosen, d2, { action: 'skip', id: 'jin-dark' });
  assert.deepEqual(again.skipped.map((e) => [e.task, e.scene, e.line, e.day]), [['jin-dark', 'j07-dark', 'jin', dayKey(d2)]]);
  assert.equal(again.tasks['jin-dark'].skipped, true);
  // Not offered while the stage is not idle: a passage owed, a fight open, on another line.
  assert.equal(look({ ...idle, tell_owed: ['after/x'] }, content, ctxAt(d1)).replay, undefined, 'a passage owed');
  assert.equal(look({ ...idle, fight: { game: 'x', creature: 'zheng', at: d1.toISOString() } }, content, ctxAt(d1)).replay, undefined, 'a fight open');
  assert.equal(look({ ...idle, skipped: [{ ...idle.skipped[0], line: null }] }, content, ctxAt(d1)).replay, undefined, 'a 古 board is not offered on the 今 line');
  // Only the page offers or leaves a board; refused when nothing is due.
  assert.equal(task(idle, content, ctxAt(now), { action: 'replay', id: 'jin-dark' }).result.refused, 'not-due');
  assert.equal(task(idle, content, ctxAt(now), { action: 'later', id: 'jin-dark' }).result.refused, 'not-due');
});

test('a board not on the stage cannot be left; Ling never leaves or offers one (page-only)', () => {
  const { s, now } = at('00-zhuji/j07-dark');
  assert.equal(task(s, content, ctxAt(now), { action: 'skip', id: 'bread-share' }).result.refused, 'not-here');
  for (const action of ['skip', 'replay', 'later']) assert.equal(pageOnly('task', { action }), true, action);
  assert.equal(pageOnly('tale', { action: 'skip' }), true);
  assert.equal(pageOnly('task', { action: 'done' }), false);
});

test('the stuck gate (scripts/stuck.js): never at the start; after STUCK_MS, or once the game says it is stuck', async () => {
  const dark = await import('../scripts/games/dark.js');
  const g = { mod: dark, state: dark.newGame('s') };
  assert.equal(stuckNow(g, 0), false, 'never before it was laid');
  stampShown(g, 1000);
  stampShown(g, 5000);
  assert.equal(g.shownAt, 1000, 'the clock is kept across repaints');
  assert.equal(stuckNow(g, 1000), false, 'not at the start');
  assert.equal(stuckNow(g, 1000 + STUCK_MS - 1), false);
  assert.equal(stuckNow(g, 1000 + STUCK_MS), true, 'stood unwon long enough');
  assert.ok(STUCK_MS >= 60000 && STUCK_MS <= 90000);
  // Fallen twice in the dark: stuck at once.
  assert.equal(stuckNow({ ...g, state: { ...g.state, falls: 2 } }, 1001), true);
  assert.equal(stuckNow({ ...g, state: { ...g.state, falls: 2, won: true } }, 1001), false, 'never once won');
  assert.equal(stuckNow({ ...g, skipped: true }, 1000 + STUCK_MS), false, 'never once left');
  // The games with a clear fail say when they are stuck.
  const fails = { dark: { falls: 2 }, deer: { misses: 3 }, lastshot: { misses: 3 }, climb: { slips: 2 }, abacus: { wrongs: 4 }, stone: { wrong: 2 }, qianmi: { tries: 2 } };
  for (const [id, at] of Object.entries(fails)) {
    const mod = await import(`../scripts/games/${id}.js`);
    const s = mod.newGame('s');
    assert.equal(mod.stuck(s), false, `${id}: not at the start`);
    assert.equal(mod.stuck({ ...s, ...at }), true, `${id}: stuck after ${JSON.stringify(at)}`);
  }
});

test('one rule for every board: no game draws a skip of its own; the page lays it, gated', async () => {
  const dir = new URL('../scripts/games/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'ink.js' && x !== 'seeded.js')) {
    const mod = await import(new URL(f, dir));
    if (!mod.newGame || !mod.html) continue;
    const s = mod.newGame('s', 1);
    for (const lang of ['zh', 'en']) assert.doesNotMatch(mod.html(s, lang), /data-g="skip"/, `${f}: no skip from the start`);
  }
  const cards = fs.readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8');
  assert.match(cards, /data-skip-slot="\$\{esc\(id\)\}">\$\{stuckNow\(g, now\) \? skipButton\(id, ctx\.lang\) : ''\}/, 'the page\'s skip waits on the gate');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /write\('task', \{ action: 'skip', id \}\)/, 'a skip is the rules\' skip, never a win');
  assert.doesNotMatch(page.slice(page.indexOf('function skipGame'), page.indexOf('async function onSkip')), /won: true|onWin/, 'never sent as a win');
});
