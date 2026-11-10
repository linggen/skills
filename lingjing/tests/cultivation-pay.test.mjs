// A stretch of cultivation pays (Hanli 2026-11-10: 「如果一段剧情+小游戏是修炼相关的, 那么这一段剧情+小游戏结束后要能获得修为
// 奖励」 · 「入门前不发，冲完三关给一份」 — rules/cultivation.mjs). A scene marked `cultivation: true` in its data, left by an
// exit: a stretch that paid no 修为 (no board, or its board skipped) pays one story step (playpay.mjs storyPlay) at the layer
// he stands on after the exit's own rise; one that paid gets nothing more. Its 所得 (Look gained.progress) carries the
// stretch's whole 修为 once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { look, resolve } from '../scripts/rules.mjs';
import { storyPlay } from '../scripts/rules/playpay.mjs';
import { floorOf, tallyBoard } from '../scripts/rules/cultivation.mjs';
import { crawlRules, prepare } from './crawl.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const crawl = crawlRules(content, { boards: 'skip' });
const ctxAt = now => ({ now, quests: [] });
const sceneOf = id => Object.values(content.chapters).map(ch => ch.scenes?.[id]).find(Boolean);
/* A save standing at a scene as the crawl first reached it, 体力 full, `over` laid on top — and, with `exit`, made ready to
   take it as the page would (crawl.mjs prepare): its boards won (`boards: 'play'`) or left (`'skip'`). */
function at(key, { exit = null, boards = 'skip', ...over } = {}) {
  const got = crawl.states.get(key);
  assert.ok(got, `the crawl reached ${key}`);
  const s0 = { ...got.s, skipped: [], stamina: 100, stamina_at: got.now.toISOString(), ...over };
  const e = exit && sceneOf(s0.scene).exits.find(x => x.id === exit);
  return { s0, s: e ? prepare(content, s0, e, got.now, [], boards) : s0, now: got.now };
}
function must(fn, s, now, args, world = content) {
  const out = fn(s, world, ctxAt(now), args);
  assert.equal(out.result.ok, true, `${JSON.stringify(args)}: ${JSON.stringify(out.result)}`);
  return out;
}
/* The world with one scene's mark taken off: the control. */
function unmarked(sceneId) {
  const w = structuredClone(content);
  for (const ch of Object.values(w.chapters)) if (ch.scenes?.[sceneId]) delete ch.scenes[sceneId].cultivation;
  return w;
}
const gainedOf = (s, now) => look(s, content, ctxAt(now)).gained ?? null;

test('the marks are data: the scenes of 卷一 that practise, are taught or break through — each quoting its line', () => {
  const marked = Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes ?? {})).filter(sc => sc.cultivation === true);
  for (const id of ['wm-jiangtang', 'wm-zhoutian', 'wm-qianye']) assert.ok(marked.some(sc => sc.id === id), id);
  for (const sc of marked) assert.match(sc._cultivation ?? '', /「.+」/, `${sc.id}: its line`);
  assert.ok(marked.every(sc => ['00-prologue', '00-waimen', '00-zhuji'].includes(sc.chapter)), '卷一 only');
});

test('(1) marked, no board: the way on pays exactly one story step, and 所得 shows it', () => {
  const { s, now } = at('00-waimen/wm-jiangtang', { exit: 'can', step: 3 });
  const step = storyPlay(content, s);
  assert.ok(step > 0);
  const r = must(resolve, s, now, { exit: 'can' });
  assert.equal(r.result.paid.progress, step);
  assert.equal(r.state.progress - s.progress, step);
  assert.equal(r.state.gained.progress, step);
  assert.equal(gainedOf(r.state, now).progress, step, 'Look: 剧情所得 · 修为 +n');
  assert.equal(gainedOf(r.state, now).earlier, undefined, 'all of it landed on this step');
});

test('(2) marked, its board won: nothing more — the end card shows the board\'s 修为', () => {
  const { s0, s, now } = at('00-waimen/wm-qianye', { exit: 'eve', boards: 'play' });
  const board = s.progress - s0.progress;
  assert.ok(board > 0, 'the board paid');
  const r = must(resolve, s, now, { exit: 'eve' });
  assert.equal(r.state.progress, s.progress, 'never twice');
  assert.equal(r.state.gained.progress, board, 'the stretch\'s 修为, once');
  assert.equal(gainedOf(r.state, now).earlier, board, 'already on the bar: the page bursts it without a second rise');
  assert.equal(r.state.scene_xiuwei, undefined, 'the tally closes with the stretch');
});

test('(3) marked, its board skipped: the floor', () => {
  const { s0, s, now } = at('00-waimen/wm-qianye', { exit: 'eve', boards: 'skip' });
  assert.equal(s.progress, s0.progress, 'a skip pays nothing');
  const r = must(resolve, s, now, { exit: 'eve' });
  assert.equal(r.state.progress - s.progress, storyPlay(content, s));
  assert.equal(r.state.gained.progress, storyPlay(content, s));
  assert.equal(r.state.gained.earlier, undefined);
});

test('(4) before 入门 (零层): a marked scene gives nothing and shows nothing', () => {
  const { s, now } = at('00-prologue/00-halfyear', { exit: 'on', boards: 'play' });
  assert.equal(sceneOf('00-halfyear').cultivation, true);
  assert.equal(storyPlay(content, s), 0, '零层 pays 0');
  const r = must(resolve, s, now, { exit: 'on' });
  assert.equal(r.state.progress, s.progress);
  assert.equal(r.result.paid, null, 'no pay, no 「修为 +0」');
  assert.deepEqual(r.state.gained, s.gained, 'no 所得');
});

test('(5) wm-zhoutian: its board pays 0 at 零层; the 三关 night lifts him to 一层 and pays one step there', () => {
  const { s0, s, now } = at('00-waimen/wm-zhoutian', { exit: 'breathe', boards: 'play' });
  assert.equal(s.step, 0);
  assert.equal(s.tasks['zhoutian-sanguan']?.status, 'done', 'the board played');
  assert.equal(s.progress, s0.progress, 'the board at 零层: 0');
  const r = must(resolve, s, now, { exit: 'breathe' });
  const one = storyPlay(content, { ...s, step: 1 });
  assert.equal(r.state.step, 1, 'risen');
  assert.ok(one > 0);
  assert.equal(r.result.paid.progress, one, '冲完三关给一份');
  assert.equal(r.state.gained.progress, one);
});

test('(6) an exit that tells its own gain pays it, no floor on top: 09-shenshi\'s 八层', () => {
  // Its 阶段任务 asks 七层圆满 first (gates.mjs): the bar full where he stands.
  const { s, now } = at('00-zhuji/09-shenshi', { exit: 'winter', boards: 'skip', progress: 836 });
  const marked = must(resolve, s, now, { exit: 'winter' });
  const control = must(resolve, s, now, { exit: 'winter' }, unmarked('09-shenshi'));
  assert.ok(marked.result.paid.progress > 0);
  assert.deepEqual([marked.state.progress, marked.state.step], [control.state.progress, control.state.step], 'the told gain, alone');
});

test('(6b) a story step on the exit counts as paid: 09-dabi', () => {
  const { s, now } = at('00-zhuji/09-dabi', { exit: 'on', boards: 'skip' });
  const marked = must(resolve, s, now, { exit: 'on' });
  const control = must(resolve, s, now, { exit: 'on' }, unmarked('09-dabi'));
  assert.deepEqual([marked.state.progress, marked.state.step], [control.state.progress, control.state.step]);
});

test('(6c) a gain told for the scene it leads into pays that stretch: wm-mingpai\'s 760 into wm-kaikai\'s 埋土 night', () => {
  // Its 阶段任务 asks 三层圆满 first (gates.mjs): the bar full there.
  const qi = content.ladder.tiers.find(t => t.id === 'qi');
  const { s, now } = at('00-waimen/wm-kaikai', { exit: 'sit', boards: 'skip', step: 3, progress: qi.thresholds[3] });
  assert.equal(s.scene_xiuwei?.scene, 'wm-kaikai', 'the told gain marked the stretch paid as he walked in');
  const marked = must(resolve, s, now, { exit: 'sit' });
  const control = must(resolve, s, now, { exit: 'sit' }, unmarked('wm-kaikai'));
  assert.deepEqual([marked.state.progress, marked.state.step], [control.state.progress, control.state.step], 'no floor on top');
  assert.equal(marked.state.scene_xiuwei, undefined);
});

test('(7) an unmarked scene is as it was', () => {
  const { s, now } = at('00-waimen/wm-jiangtang', { exit: 'can', step: 3 });
  const r = must(resolve, s, now, { exit: 'can' }, unmarked('wm-jiangtang'));
  assert.equal(r.result.paid, null);
  assert.equal(r.state.progress, s.progress);
  assert.deepEqual(r.state.gained, s.gained);
});

test('(8) at the 回\'s cap the floor pays what a story step pays there today', () => {
  const { s, now } = at('00-zhuji/09-lingcao', { exit: 'fight' });
  const marked = must(resolve, s, now, { exit: 'fight' });
  const control = must(resolve, s, now, { exit: 'fight' }, unmarked('09-lingcao'));
  // The same step with a story step on its exit, unmarked: what today's rules make of one story step there.
  const world = unmarked('09-lingcao');
  world.chapters['00-zhuji'].scenes['09-lingcao'].exits.find(e => e.id === 'fight').grant = { table: 'story', wealth: 20 };
  const today = must(resolve, s, now, { exit: 'fight' }, world);
  assert.deepEqual([marked.state.progress, marked.state.step, marked.state.wealth], [today.state.progress, today.state.step, today.state.wealth]);
  assert.ok(marked.state.progress >= control.state.progress);
  // At the cap: the bar full where the 回 holds him — what lands, what is held, and any 灵石, as a story step's today.
  const full = { ...s, progress: 1e6 };
  const capped = must(resolve, full, now, { exit: 'fight' });
  const cappedToday = must(resolve, full, now, { exit: 'fight' }, world);
  assert.deepEqual([capped.state.progress, capped.state.step, capped.state.wealth, capped.result.paid.progress], [cappedToday.state.progress, cappedToday.state.step, cappedToday.state.wealth, cappedToday.result.paid.progress]);
  // …and a stretch whose board was turned to 灵石 at a cap counts as paid (the tally reads the converted part).
  const t = {};
  tallyBoard(t, 'x', { progress: 0, converted: { progress: 12, wealth: 4 } });
  assert.equal(floorOf(t, { id: 'x' }, null), null);
});
