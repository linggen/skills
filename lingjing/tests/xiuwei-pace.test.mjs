// 修为 tracks the book (Hanli, 2026-10-15: 「让游戏修为和故事match」). 修屋顶 had
// paid 修为 +15 and the bar ran ahead of the story; he ruled:
//   1. each layer asks more — a 回's natural play (its scenes, the errands and
//      fights on offer, the day's 功课) reaches about the book's layer for that
//      回, near its close, not beyond and not early;
//   2. mundane chores (杂役: carrying, mending, errands for people) pay 灵石,
//      maybe an item — 修为 comes from cultivation: the day's 功课, fights,
//      pills, and the story beats that raise a layer.
// The per-回 cap (ladder.json caps.hui, rules/cap.mjs) stays the hard ceiling:
// with 体力 off a grinder fills the cap layer and the rest is held. The model
// of natural play is tools/xiuwei-model.mjs; this runs it on the world's data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, migrate, newState, realmName } from '../scripts/state.mjs';
import { look, quest, resolve } from '../scripts/rules.mjs';
import { pay, paysOf } from '../scripts/rules/core.mjs';
import { choreGrant } from '../scripts/rules/chores.mjs';
import { turnedPays } from '../scripts/turned.js';
import { ALL_SKIPS, ERRANDS_AT, EVERYTHING, NOTHING, ONE_OFFS, budgetTable, dayIncome, errandPays, runJuan1 } from '../tools/xiuwei-model.mjs';

const content = loadContent();
const NOW = new Date('2026-10-15T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const T = content.rewards.tables;
const templates = content.notices;

test('every errand and 榜文 says what work it is: 修行 pays 修为 for a fight, 杂役 pays 灵石 only', () => {
  const all = [...content.quests, ...templates];
  assert.ok(all.length >= 18);
  for (const q of all) {
    assert.ok(['cultivation', 'labor'].includes(q.work), `${q.id}: work is cultivation or labor`);
    const fights = (q.need ?? [{ kind: q.kind }]).some(n => ['subdue', 'tame'].includes(n.kind));
    if (q.work === 'labor') {
      assert.equal(T[q.grant.table]?.progress, 0, `${q.id}: a chore is paid on a table that gives no 修为`);
      assert.equal('progress' in q.grant, false, `${q.id}: and names none`);
      assert.ok(q.grant.wealth > 0 || q.grant.item, `${q.id}: it pays stones or a thing`);
    } else {
      assert.ok(fights, `${q.id}: 修行 is a fight (降妖 · 驯)`);
      assert.ok(Math.min(q.grant.progress, T[q.grant.table].progress) > 0, `${q.id}: and pays 修为`);
    }
  }
  // The model places every errand that pays 修为 or a pill in a 回 (or null: on no 卷一 map) — a new one must say where.
  const paying = content.quests.filter(q => errandPays(content, q) > 0).map(q => q.id).sort();
  assert.deepEqual(Object.keys(ERRANDS_AT).sort(), paying, 'tools/xiuwei-model.mjs ERRANDS_AT names every errand that pays 修为 or a pill');
});

test('修屋顶 is handed in for 灵石, nothing for 修为; a haunt fight still pays 修为', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-zhoutian'],
    tier: 'qi', step: 1, progress: 10, wealth: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(),
    quests: { 'xu-waimen-roof': { took: '2026-10-15', have: { 0: 1 } } } };
  const turned = quest(s, content, ctx, { action: 'turn', id: 'xu-waimen-roof' });
  assert.ok(turned.state, JSON.stringify(turned.result));
  assert.equal(turned.result.paid.progress, 0);
  assert.equal(turned.result.paid.wealth, 5, '周衡: 「记你五块灵石」');
  assert.deepEqual([turned.state.step, turned.state.progress, turned.state.wealth], [1, 10, 5]);
  const f = structuredClone(s);
  const won = pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(won.progress, T.haunt.progress);
});

test('real life: the workout is the day\'s 功课 (修为); the day\'s pick and 开府 pay 灵石', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], tier: 'qi', step: 1, progress: 0, traits: ROOTS };
  const payOf = q => paysOf(content, s, NOW, choreGrant(content, q));
  const workout = payOf({ id: 'health-workout', period: 'day', reward: 20 });
  assert.deepEqual(workout, { progress: T.gongke.progress, wealth: 0 });
  const pick = payOf({ id: 'shifu-scan', period: 'week', pool: true, reward: 30 });
  assert.deepEqual(pick, { progress: 0, wealth: T.life.wealth }, 'a pick: stones, capped');
  const milestone = payOf({ id: 'linggen-pair', period: 'once', reward: 50 });
  assert.deepEqual(milestone, { progress: 0, wealth: T.once.wealth }, '开府: stones');
});

test('the day\'s 功课 at 零层 pays a few 灵石 — 零层 takes no 修为, and the hand-in still shows a gain', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], tier: 'qi', step: 0, progress: 0, traits: ROOTS };
  const workout = { id: 'health-workout', app: 'health', period: 'day', reward: 20, due: true, done_at: NOW.toISOString(), title: { zh: '锻炼', en: 'Workout' } };
  assert.equal(choreGrant(content, workout, s).table, 'gongke_zero', 'declared in rewards.json, not hardcoded');
  assert.ok(T.gongke_zero.wealth > 0 && T.gongke_zero.wealth <= T.labor.wealth && T.gongke_zero.progress === 0, 'a few 灵石, no more than a 杂役 pays');
  assert.deepEqual(paysOf(content, s, NOW, choreGrant(content, workout, s)), { progress: 0, wealth: T.gongke_zero.wealth }, 'the card says it');
  const turned = quest(s, content, { ...ctx, quests: [workout] }, { action: 'turn', id: 'health-workout' });
  assert.ok(turned.result.ok, JSON.stringify(turned.result));
  assert.equal(turned.result.paid.wealth, T.gongke_zero.wealth);
  assert.equal(turned.state.wealth, s.wealth + T.gongke_zero.wealth);
  assert.equal(turned.result.paid.hold, null, 'nothing said as not taken');
  assert.deepEqual(turnedPays(turned.result.paid, { xw: '修为', ls: '灵石' }, 'zh'), [`灵石 +${T.gongke_zero.wealth}`], 'the hand-in line shows it');
  // From 一层 on, the 功课 is 修为 again.
  assert.equal(choreGrant(content, workout, { ...s, step: 1 }).table, 'gongke');
  assert.equal(choreGrant(content, workout).table, 'gongke', 'no save given: the authored table');
});

/* The 回s where the book holds him on a 练气 layer: the cap is a layer, and he leaves it by the story. */
const HELD = ['h05', 'h07', 'h08'];
const rank = (tier, step) => content.ladder.tiers.findIndex(t => t.id === tier) * 100 + step;

test('the budget per 回 (Hanli, 2026-10-15: 「确保用户交差能看到提升」): one who does everything stays at the book\'s layer, filling it near the 回\'s close', () => {
  const table = budgetTable(content);
  const rows = runJuan1(content, { play: EVERYTHING });
  const day = dayIncome(content);
  assert.ok(day > 100 && day < 170, `a natural day ${day}`);
  for (const r of rows) {
    // Never behind the book, never ahead of it: the floor and the cap.
    assert.equal(rank(r.end.tier, r.end.step), rank(r.book.tier, r.book.step), `${r.hui}: at the book's layer\n${table}`);
  }
  for (const id of HELD) {
    const r = rows.find(x => x.hui === id);
    // The layer the 回 holds him on fills — late, not in its first half — and he is not far past it.
    assert.ok(r.full_at == null || r.full_at + 1 >= r.scenes / 2, `${id}: full at scene ${r.full_at + 1} of ${r.scenes} — not early\n${table}`);
  }
  // 古四 and 古六 (the 回s that end on their held layer or rise from it) reach it by their own play.
  for (const id of ['h05', 'h07', 'h08']) assert.notEqual(rows.find(x => x.hui === id).full_at, null, `${id}: everything on offer fills the layer\n${table}`);
  // Before 2026-10-15 every held layer filled in the 回's first scene or two.
  const old = structuredClone(content.ladder);
  old.tiers[0].thresholds = [0, 50, 60, 70, 80, 90, 100, 110, 120, 130];
  for (const id of HELD) assert.ok(runJuan1(content, { ladder: old }).find(x => x.hui === id).full_at <= 2, `${id} ran ahead on the old ladder`);
});

test('one who does nothing is carried by the story\'s floor: never behind the book', () => {
  const table = budgetTable(content);
  for (const r of runJuan1(content, { play: NOTHING })) assert.equal(rank(r.end.tier, r.end.step), rank(r.book.tier, r.book.step), `${r.hui}\n${table}`);
  // The story and errands alone never fill a held layer: the climb is cultivation.
  const rows = runJuan1(content, { play: ONE_OFFS });
  for (const id of ['h07', 'h08']) assert.equal(rows.find(x => x.hui === id).full_at, null, `${id}: one-offs alone stay under the layer\n${table}`);
});

test('one who leaves every story board (a skip pays nothing, 2026-10-15) still stands at the book\'s layer each 回: the story\'s floor carries him', () => {
  const table = budgetTable(content);
  const rows = runJuan1(content, { play: ALL_SKIPS });
  assert.ok(rows.length >= 7);
  for (const r of rows) assert.equal(rank(r.end.tier, r.end.step), rank(r.book.tier, r.book.step), `${r.hui}: every board left\n${table}`);
});

test('a grinder (ten times the fights) stays only somewhat ahead: never past the book\'s layer, the stretch on each rise', () => {
  const grind = runJuan1(content, { play: { ...EVERYTHING, FIGHTS: 20, TALE: 1, ROAD: 5 } });
  for (const r of grind) assert.ok(rank(r.end.tier, r.end.step) <= rank(r.book.tier, r.book.step), r.hui);
  const h07 = grind.find(x => x.hui === 'h07');
  assert.ok(h07.end.need > content.ladder.tiers[0].thresholds[h07.end.step], 'the layer he rose to asks more: the stretch');
});

test('the 练气 ladder: each 层 asks more than the one below', () => {
  const th = content.ladder.tiers[0].thresholds;
  for (let i = 2; i < th.length; i += 1) assert.ok(th[i] > th[i - 1]);
  assert.equal(content.ladder.overflow_stretch, 0.5);
});

test('past the full mark 修为 keeps counting; a rise carries it and the next 层 asks half of it more; the story fills a 层 he is short of', () => {
  const th = content.ladder.tiers[0].thresholds;
  const at = (scene, extra) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene, place: 'chaifang', ended: ['00-prologue'], done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'],
    tier: 'qi', traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), ...extra });
  // At 古四's cap, full: the day's 功课 still adds, past the mark.
  const s = at(null, { place: 'waimen', step: 1, progress: th[1] });
  const g = T.gongke.progress;
  const done = pay(content, s, ctx, { table: 'gongke', progress: g });
  assert.equal(done.progress, g, 'the whole 功课 counted');
  assert.deepEqual([s.step, s.progress], [1, th[1] + g], '220/200: the bar shows it');
  // A fight there pays 灵石 instead (Hanli, 2026-10-15: 「圆满之后走剧情到下一个阶段. 刷副本或者打怪奖励的修为改为灵石」; rewards.json xiuwei_to_lingshi).
  const f = structuredClone(s);
  const won = pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(won.progress, 0, 'no 修为 past the mark from a fight');
  assert.equal(won.wealth, T.haunt.wealth + Math.round(T.haunt.progress * content.rewards.xiuwei_to_lingshi.rate));
  assert.equal(f.progress, s.progress, 'nothing to carry into the next 层');
  // 第一路 (wm-diyilu): the rise to 二层 carries the 20 over the mark; 二层 asks 10 more.
  const r = resolve({ ...s, scene: 'wm-diyilu', place: 'chaifang' }, content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.state.step, 2);
  assert.equal(r.result.rose.carried, g);
  assert.equal(r.state.stretch['qi:2'], g / 2);
  assert.equal(look(r.state, content, ctx).next, th[2] + g / 2);
  // A save that did nothing: the story fills 一层 for it, then lifts it.
  const bare = resolve(at('wm-diyilu', { step: 1, progress: 0 }), content, ctx, { exit: 'save' });
  assert.equal(bare.result.rose.filled, th[1]);
  assert.equal(bare.state.step, 2);
});

test('a save from before keeps its 层 and its bar as full as it was — 圆满 stays 圆满, so the cliff still throws', () => {
  const v8 = extra => ({ ...newState(content, 'zh', NOW), version: 8, chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
    done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], tier: 'qi', traits: ROOTS, ...extra });
  const th = content.ladder.tiers[0].thresholds;
  // 古四 at the old cap: 一层 50/50 圆满 → 一层 圆满 on the new ladder, never pulled down, never pushed up a 层.
  const capped = fitWorld(migrate(v8({ step: 1, progress: 50 }), content), content);
  assert.deepEqual([capped.step, capped.progress, realmName(content, capped, 'zh')], [1, th[1], '练气一层圆满']);
  const half = fitWorld(migrate(v8({ step: 1, progress: 25 }), content), content);
  assert.deepEqual([half.step, half.progress], [1, th[1] / 2]);
  // 古八's cliff, 九层圆满 waiting for the throw: still 圆满.
  const cliff = fitWorld(migrate(v8({ chapter: '00-zhuji', scene: '09-cliff', place: 'houshan', ended: ['00-prologue', '00-waimen'], step: 9, progress: 130 }), content), content);
  assert.deepEqual([cliff.step, cliff.progress], [9, th[9]]);
  assert.equal('ladder_pace' in cliff, false, 'the mark goes once carried');
  // Past 练气: untouched.
  const zhuji = fitWorld(migrate(v8({ chapter: '01-ji', scene: null, tier: 'foundation', step: 0, progress: 100 }), content), content);
  assert.deepEqual([zhuji.tier, zhuji.step, zhuji.progress], ['foundation', 0, 100]);
});
