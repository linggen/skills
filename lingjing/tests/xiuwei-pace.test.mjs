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
import { quest } from '../scripts/rules.mjs';
import { pay, paysOf } from '../scripts/rules/core.mjs';
import { choreGrant } from '../scripts/rules/chores.mjs';
import { ERRANDS_AT, ONE_OFFS, PLAY, dayIncome, runJuan1 } from '../tools/xiuwei-model.mjs';

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
  // The model places every 修行 errand in a 回 and nothing else.
  const cult = content.quests.filter(q => q.work === 'cultivation').map(q => q.id).sort();
  assert.deepEqual(Object.keys(ERRANDS_AT).sort(), cult);
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

/* The 回s where the book holds him on a 练气 layer: the cap is a layer, and he leaves it by the story. */
const HELD = ['h05', 'h07', 'h08'];

test('natural play fills each held layer near its 回\'s close — never in the first half', () => {
  const rows = runJuan1(content);
  const day = dayIncome(content);
  assert.ok(day > 100 && day < 170, `a natural day ${day} — under the old 170 of 体力-bound play`);
  for (const id of HELD) {
    const r = rows.find(x => x.hui === id);
    assert.ok(r.full_at != null, `${id}: the layer the book stands on is reached`);
    assert.ok(r.full_at + 1 >= r.scenes / 2, `${id}: full at scene ${r.full_at + 1} of ${r.scenes} — not early`);
  }
  // The close of 卷一: 筑基小成, as the book (the 九转 lands it full).
  const last = rows.at(-1);
  assert.deepEqual([last.end.tier, last.end.step], ['foundation', 0]);
  // Before 2026-10-15 every held layer filled in the 回's first scene or two.
  const old = structuredClone(content.ladder);
  old.tiers[0].thresholds = [0, 50, 60, 70, 80, 90, 100, 110, 120, 130];
  for (const id of HELD) assert.ok(runJuan1(content, { ladder: old }).find(x => x.hui === id).full_at <= 2, `${id} ran ahead on the old ladder`);
});

test('the story and errands alone never fill a held layer: the climb is cultivation, and the cap layer is the book\'s', () => {
  const rows = runJuan1(content, { play: ONE_OFFS });
  for (const id of HELD) assert.equal(rows.find(x => x.hui === id).full_at, null, `${id}: one-offs alone stay under the layer`);
  // And a grinder (ten times the natural day) is held at each 回's cap, never past it.
  const grind = runJuan1(content, { play: { ...PLAY, FIGHTS: 20, TALE: 1, ROAD: 5 } });
  for (const r of grind.filter(x => HELD.includes(x.hui))) {
    const cap = r.cap.story ?? r.cap;
    assert.ok(r.end.step <= cap.layer, `${r.hui}: ${r.end.step} ≤ the 回's story layer ${cap.layer}`);
  }
});

test('the 练气 ladder: each 层 asks more than the one below, and the layers the book holds him on are the model\'s', () => {
  const th = content.ladder.tiers[0].thresholds;
  for (let i = 2; i < th.length; i += 1) assert.ok(th[i] > th[i - 1]);
  const { left } = runJuan1(content);
  // A held layer asks about what natural play carried into it plus its 回's own (±15%).
  for (const step of [1, 2, 4]) assert.ok(Math.abs(left[step] - th[step]) / th[step] < 0.15, `${step}层: held ${Math.round(left[step])} of ${th[step]}`);
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
