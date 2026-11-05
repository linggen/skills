// A board put away (✕) or kept for later (留) (Hanli, 2026-10-15 and 11-03 — rules/skips.mjs):
//   1. (11-03, replacing 10-15's stuck gate) 「不需要卡住, 直接就给这个关闭按钮」 — 留 · ✕ from the first moment;
//   2. 「跳过没有奖励」 — a skip pays nothing (no grant, grade, mark); the story moves on as after a win;
//   3. (11-03) 「可能用户想丢掉, 可能想以后玩」 — ✕ puts it away for good; 留 keeps it on 收着的棋局, never offered by
//      itself; taken up and won, it pays in full once;
//   4. 「对游戏进展要确保没有影响」 — every 卷一 scene and exit is reached skipping every board
//      (tests/playtest.test.mjs), a grade-gated way on opens for a skipped board, 修为 keeps the
//      book's pace (tests/balance.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve, task, win, pageOnly } from '../scripts/rules.mjs';
import { dayKey, fitWorld } from '../scripts/state.mjs';
import { stageCards, stageSlots, CARD_KINDS } from '../scripts/stage.mjs';
import { crawlRules } from './crawl.mjs';
import { sceneBoards } from '../scripts/rules/skips.mjs';
import { sceneOf } from '../scripts/rules/world.mjs';

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
  assert.deepEqual(left.skipped ?? [], [], 'put away for good: never offered again by itself (Hanli 11-03)');
  assert.equal(look({ ...left, tell_owed: [] }, content, ctxAt(later(now, 3))).replay, undefined);
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

test('a graded board left writes no grade or mark, owes the rest of the passage, and both grade-gated ways open (wm-qianye, 00-cave 喂饼)', () => {
  // Played in `show` order. No scene stands two boards since 2026-10-20 (09-jiuge's 随叶 told in the 调息 cut, wm-zhaojing's
  // 饭桶 told the same day), so the order is checked on 09-jiuge given a board before 禹步.
  // 09-jiuge stands two boards again since 2026-10-26 (瞿老 on 巽 before 禹步): 禹步 waits on the chat.
  const j = at('00-zhuji/09-jiuge');
  assert.equal(task(j.s, content, ctxAt(j.now), { action: 'skip', id: 'jiuge-yubu' }).result.refused, 'board-waits');
  const said = { ...j.s, tasks: { ...j.s.tasks, 'jiuge-xunsi': { status: 'done' } } };
  assert.notEqual(task(said, content, ctxAt(j.now), { action: 'skip', id: 'jiuge-yubu' }).result.refused, 'board-waits', '禹步 after the chat waits on nothing');
  const h = at('00-waimen/wm-qianye');
  const first = must(task, h.s, h.now, { action: 'skip', id: 'qianye-qiajue' });
  assert.ok((first.tell_owed ?? []).includes('after/wm-qianye'), 'the passage after the first board is owed, as after a win');
  assert.ok(!(first.marks ?? []).some((m) => m.startsWith('qiajue-')), 'no mark');
  const { s, now } = at('00-prologue/00-cave');
  // 守火 is 00-cave's first board since 2026-10-21; 喂饼 its second, after the rest of the passage
  const one = must(task, s, now, { action: 'skip', id: 'cave-fire' });
  assert.ok((one.tell_owed ?? []).includes('after/00-cave'), 'left, 守火 owes the bread passage as a win would');
  const two = must(task, one, now, { action: 'skip', id: 'bread-share' });
  assert.equal(two.grades?.['bread-share'], undefined);
  assert.ok(!(two.marks ?? []).some((m) => m.startsWith('bread-')), 'no mark');
  // 分它一半 (most|half) and 自己吃 (none|little) both wait on a grade: left, both are his to choose.
  for (const exit of ['share', 'keep']) assert.equal(resolve(two, content, ctxAt(now), { exit }).result.ok, true, exit);
  // Won with a grade, only that grade's way opens (the gate still stands for a played board).
  const played = must(task, must(win, one, now, { id: 'bread-share', grade: 'none' }), now, { action: 'done', id: 'bread-share' });
  assert.equal(resolve(played, content, ctxAt(now), { exit: 'share' }).result.ok, false);
  assert.equal(resolve(played, content, ctxAt(now), { exit: 'keep' }).result.ok, true);
});

test('留 keeps a board: the story goes on as on ✕ (its gives, no grant); never offered by itself; taken up and won, it pays in full once', async () => {
  // 喂饼, 00-cave's second board (守火 first since 2026-10-21): 守火 played, then 喂饼 kept (Hanli 11-03: 「可能想以后玩」).
  const at0 = at('00-prologue/00-cave'), now = at0.now;
  const s = must(task, must(win, at0.s, now, { id: 'cave-fire' }), now, { action: 'done', id: 'cave-fire' });
  const kept = must(task, s, now, { action: 'keep', id: 'bread-share' });
  const skipped = must(task, s, now, { action: 'skip', id: 'bread-share' });
  assert.deepEqual([kept.progress, kept.wealth, kept.tell_owed], [skipped.progress, skipped.wealth, skipped.tell_owed], 'the story goes on exactly as on ✕');
  assert.equal(kept.tasks['bread-share'].skipped, true);
  for (const exit of ['share', 'keep']) assert.equal(resolve(kept, content, ctxAt(now), { exit }).result.ok, true, `${exit}: every way a skip opens`);
  assert.deepEqual(kept.kept.map((e) => [e.task, e.story, e.scene]), [['bread-share', true, '00-cave']]);
  const n = { ...kept, tell_owed: [], told_scenes: [...(kept.told_scenes ?? []), kept.scene] };
  const tomorrow = later(now);
  const lk = look(n, content, ctxAt(tomorrow));
  assert.equal(lk.replay, undefined, 'never offered by itself');
  assert.deepEqual(lk.kept.map((k) => [k.id, k.at]), [['bread-share', now.toISOString()]], 'Look carries it: id, title, where, when');
  assert.ok(lk.kept[0].title);
  // Taken up: off the list, the board stands offered again; its win pays the grant, grade and mark, as on its day.
  const open = must(task, n, tomorrow, { action: 'kept-play', id: 'bread-share' });
  assert.deepEqual(open.kept, []);
  assert.equal(open.tasks['bread-share'].status, 'offered');
  const lo = look(open, content, ctxAt(tomorrow));
  assert.ok(stageCards(lo).some((c) => c.card === 'board' && c.id === 'bread-share'), 'it stands on the stage');
  const paid = task(must(win, open, tomorrow, { id: 'bread-share', grade: 'half', stars: 2 }), content, ctxAt(tomorrow), { action: 'done', id: 'bread-share' });
  assert.equal(paid.result.ok, true, JSON.stringify(paid.result));
  const p = paid.state;
  assert.deepEqual(paid.result.paid, task(must(win, { ...s }, now, { id: 'bread-share', grade: 'half', stars: 2 }), content, ctxAt(now), { action: 'done', id: 'bread-share' }).result.paid, 'the original grant, as on its day');
  assert.equal(p.grades['bread-share'], 'half');
  assert.ok(p.marks.includes('bread-half'), 'its mark');
  assert.equal(p.stars['bread-share'], 2, 'its stars count then');
  assert.equal(p.tasks['bread-share'].skipped, undefined, 'paid now, not left');
  assert.deepEqual(p.tell_owed ?? [], [], 'its passage was told the day it was kept — never again');
  assert.equal(task(p, content, ctxAt(tomorrow), { action: 'done', id: 'bread-share' }).result.ok, false, 'once');
  assert.equal(task(p, content, ctxAt(tomorrow), { action: 'kept-play', id: 'bread-share' }).result.refused, 'not-kept');
  // Taken up and put away again (✕): gone for good; 留 again: back on the list.
  assert.deepEqual(must(task, open, tomorrow, { action: 'skip', id: 'bread-share' }).kept, []);
  assert.deepEqual(must(task, open, tomorrow, { action: 'keep', id: 'bread-share' }).kept.map((e) => e.task), ['bread-share']);
});

test('收着的棋局: at most 20 — one more refused in the world\'s words; 丢 lets one go; a board he chose is put down onto it', () => {
  const { s: s0, now } = at('00-zhuji/j07-dark');
  const full = { ...s0, kept: Array.from({ length: 20 }, (_, i) => ({ task: `x${i}`, story: false, at: now.toISOString() })) };
  const r = task(full, content, ctxAt(now), { action: 'keep', id: 'jin-chat-dark' });
  assert.equal(r.result.refused, 'kept-full');
  assert.equal(r.result.say, '收着的满了，先玩掉一局或丢一局。');
  const one = must(task, s0, now, { action: 'keep', id: 'jin-chat-dark' });
  assert.equal(task(one, content, ctxAt(now), { action: 'keep', id: 'jin-chat-dark' }).result.refused, 'already-kept');
  assert.deepEqual(must(task, one, now, { action: 'kept-drop', id: 'jin-chat-dark' }).kept, [], '丢');
  assert.equal(task(one, content, ctxAt(now), { action: 'kept-drop', id: 'nope' }).result.refused, 'not-kept');
  // An old save's skipped boards (the old rule: back by themselves) are kept now, on load.
  const old = fitWorld({ ...s0, skipped: [{ task: 'jin-chat-dark', scene: 'j07-dark', line: 'jin', day: '2026-11-01' }] }, content);
  assert.deepEqual([old.skipped, old.kept.map((e) => e.task)], [[], ['jin-chat-dark']]);
  for (const action of ['keep', 'kept-play', 'kept-drop']) assert.equal(pageOnly('task', { action }), true, action);
});

/* The story's boards at a save's scene: its own (`show`) and those a way on waits on (`needs.task`), not yet over. */
const sceneBoardsHere = (s) => { const sc = sceneOf(content, s); return [...new Set([...sceneBoards(sc), ...(sc?.exits ?? []).map((e) => e.needs?.task).filter(Boolean)])].filter((id) => s.tasks?.[id]?.status !== 'done'); };
test('✕ and 留 open every way a skip opens, at every story board of 卷一 (crawl: every board left)', () => {
  let n = 0;
  for (const [key, { s, now }] of crawl.states) {
    for (const id of sceneBoardsHere(s)) {
      const skip = task(s, content, ctxAt(now), { action: 'skip', id });
      if (!skip.result.ok) continue;
      const kept = task(s, content, ctxAt(now), { action: 'keep', id });
      assert.equal(kept.result.ok, true, `${key} ${id}: ${JSON.stringify(kept.result)}`);
      const { kept: list, ...rest } = kept.state;
      const { kept: _, ...skipped } = skip.state;
      assert.deepEqual(rest, skipped, `${key} ${id}: 留 is ✕ and the list`);
      assert.deepEqual(list.map((e) => e.task), [...(s.kept ?? []).map((e) => e.task), id]);
      n += 1;
    }
  }
  assert.ok(n >= 20, `${n} boards`);
});

test('a board not on the stage cannot be left; Ling never leaves or offers one (page-only)', () => {
  const { s, now } = at('00-zhuji/j07-dark');
  assert.equal(task(s, content, ctxAt(now), { action: 'skip', id: 'bread-share' }).result.refused, 'not-here');
  for (const action of ['skip', 'keep', 'kept-play', 'kept-drop']) assert.equal(pageOnly('task', { action }), true, action);
  for (const action of ['replay', 'later']) assert.equal(task(s, content, ctxAt(now), { action, id: 'bread-share' }).result.refused, 'unknown-action', `${action}: the old replay is gone`);
  assert.equal(pageOnly('tale', { action: 'skip' }), true);
  assert.equal(pageOnly('task', { action: 'done' }), false);
});

test('one rule for every board: no game draws a skip of its own; the page lays 留 and ✕, ungated', async () => {
  const dir = new URL('../scripts/games/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'ink.js' && x !== 'seeded.js')) {
    const mod = await import(new URL(f, dir));
    if (!mod.newGame || !mod.html) continue;
    const s = mod.newGame('s', 1);
    for (const lang of ['zh', 'en']) assert.doesNotMatch(mod.html(s, lang), /data-g="skip"/, `${f}: no skip from the start`);
  }
  const cards = fs.readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8');
  // No stuck wait (Hanli 11-03: 「不需要卡住, 直接就给这个关闭按钮」): the bar's two ways out stand whenever the board is in play.
  const board = cards.slice(cards.indexOf('function board(card, ctx)'), cards.indexOf('/// What an item does'));
  assert.match(board, /const out = !today && !made && !shut && !g\?\.state\?\.won && !g\?\.sent\n\s*\? outHtml\(ctx\.lang, `data-board-keep=/);
  assert.doesNotMatch(board, /stuckNow|skipBoard\(g, id, ctx, \{ icon/, 'no gate, no stuck slot in the bar');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /write\('task', \{ action, id \}\)/, 'a skip is the rules\' skip (or 留), never a win');
  assert.doesNotMatch(page.slice(page.indexOf('function skipGame'), page.indexOf('async function onSkip')), /won: true|onWin/, 'never sent as a win');
  // A board chosen again puts the box away, so it stands (live at j07-guan: the box held 数晨脉 › over it).
  assert.match(page.slice(page.indexOf('function choicesInBox'), page.indexOf('function dialogBoxHtml')), /!replayUp\(look\)/);
  assert.match(page.slice(page.indexOf('function inQueue'), page.indexOf('function inQueue') + 900), /task\.replay/, 'and it queues on the stage');
});

// Live 2026-10-15: 「算了，往下走」 stood on under the won 最后一罚 — the slot was only filled, never emptied.
test('#focus moves to what must be seen, never the page (live 390, 2026-10-19)', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function bringIntoFocus('), src.indexOf('function bringIntoFocus(') + 500);
  assert.match(fn, /const box = \$\('focus'\);/);
  assert.match(fn, /box\.scrollBy\(/);
  assert.doesNotMatch(fn, /scrollIntoView/, 'scrollIntoView would move the hidden .view too');
});

test('a game won on the story page brings its 所得 into sight: #focus moves up or down to it, never the page (2026-10-21)', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /else await report\(`\[scene\] won \$\{taskId\}`\);[\s\S]{0,400}?if \(!story\) leaveWonBoard\(taskId\);\s*await refresh\(\);\s*bringWonIntoFocus\(\);/);
  const fn = src.slice(src.indexOf('function bringIntoFocus('), src.indexOf('function bringIntoFocus(') + 500);
  assert.match(fn, /up = r\.top - 12 - f\.top/, 'above the view, it moves up');
  const won = src.slice(src.indexOf('function bringWonIntoFocus('), src.indexOf('function bringWonIntoFocus(') + 300);
  assert.match(won, /#focus \.toasts \.spoils/);
});

test('a 前情 stays in the box: only 银月\'s lines are copied into the chat, never Ling\'s recap line by line (2026-10-21)', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function companionBeat('), src.indexOf('function quietCopy('));
  assert.match(fn, /if \(who\(b\) !== 'yy'\) continue;/);
  assert.doesNotMatch(fn, /'ling'/);
});

test('收着的棋局 kept where it is hosted: 玩 away names the place (the page walks him there), and there it is his whatever the plate deals today (Hanli 11-05: 「收着的残局, 我点了玩, 没反应」)', () => {
  const { s: s0, now } = at('00-zhuji/j07-dark');
  const kept = { ...s0, place: 'shanmen', kept: [{ task: 'xiangqi', story: false, place: 'zhishi', at: now.toISOString() }] };
  const away = task(kept, content, ctxAt(now), { action: 'kept-play', id: 'xiangqi' }).result;
  assert.equal(away.refused, 'not-here');
  assert.equal(away.place, 'zhishi', 'where to walk');
  assert.match(away.say, /这一局在.*执事堂玩/);
  // At 执事堂, even on a day its plate deals another board: taken up, and it stands there as practice.
  const there = { ...kept, place: 'zhishi' };
  const s1 = must(task, there, now, { action: 'kept-play', id: 'xiangqi' });
  assert.deepEqual(s1.kept, [], 'off the list');
  const t = look(s1, content, ctxAt(now)).tasks.find((x) => x.id === 'xiangqi');
  assert.ok(t && t.status === 'offered', 'the board stands to be opened (openFromTray)');
  // The page: a not-here 玩 walks there and takes it up, and any other refusal closes 事 so its line is seen.
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const fn = page.slice(page.indexOf('async function keptTap('), page.indexOf('function gameMove('));
  assert.match(fn, /r\.refused === 'not-here' && r\.place && !walked[^]*await goTo\(r\.place\)[^]*keptTap\(id, action, true\)/);
  assert.match(fn, /if \(!r\.ok\) \{ keep\(\{ doNote: refusal\(r\) \}\); show\(\{ bookOpen: false \}\); return; \}/);
});
