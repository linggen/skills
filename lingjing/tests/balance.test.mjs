// One model for every number (Hanli, 2026-10-15; design.md § Pacing and the economy): about 30
// minutes a day and one 回 a week, the story the reward, 古一–古三 fast. worlds/jiuding/balance.json
// declares the 层 thresholds, the pay tables, the fight-to-灵石 rate, the day's fight bands and the
// routine's cooldowns; the rules read them (content.mjs withBalance); tools/balance.mjs plays a
// light, a typical and a heavy player through 卷一 day by day. This holds the bands it prints, the
// numbers' home, the day's diminishing fights, the stage quests and old saves.
//
// Kept from tests/xiuwei-pace.test.mjs (2026-10-15, 「让游戏修为和故事match」): 修行 pays 修为, 杂役
// pays 灵石; the 功课 is 修为 (a few 灵石 at 零层); past a full mark the 功课 counts on, a fight pays 灵石.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, migrate, newState, realmName } from '../scripts/state.mjs';
import { look, quest, resolve } from '../scripts/rules.mjs';
import { farmShare, pay, paysOf } from '../scripts/rules/core.mjs';
import { choreGrant } from '../scripts/rules/chores.mjs';
import { turnedPays } from '../scripts/turned.js';
import { BALANCE_FILE, bookWalk, errandPays, fit, play, table } from '../tools/balance.mjs';

const content = loadContent();
const B = content.balance, M = B.model;
const NOW = new Date('2026-10-16T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const T = content.rewards.tables;
const WORLD = path.dirname(BALANCE_FILE);
const raw = f => JSON.parse(fs.readFileSync(path.join(WORLD, f), 'utf8'));

test('balance.json is the numbers\' one home: the ladder, the pay tables, the conversion and the cooldowns land where the rules read them, and the old files no longer hold them', () => {
  for (const t of content.ladder.tiers) assert.deepEqual(t.thresholds, B.layers[t.id], `${t.id}'s thresholds`);
  assert.deepEqual(content.rewards.tables, B.pay);
  assert.deepEqual(content.rewards.xiuwei_to_lingshi, B.convert);
  assert.equal(content.ladder.overflow_stretch, B.overflow_stretch);
  const beat = content.chapters['00-waimen'].beats.find(b => b.sealed?.rerun);
  assert.equal(beat.sealed.rerun.every_h, B.cooldowns.rerun_h);
  assert.equal(content.fantong.limit.cooldown_min, B.cooldowns.fantong_min);
  // Nowhere else: a second copy would drift.
  assert.ok(raw('ladder.json').tiers.every(t => !('thresholds' in t)), 'ladder.json holds no thresholds');
  assert.equal('overflow_stretch' in raw('ladder.json'), false);
  assert.equal('tables' in raw('rewards.json'), false);
  assert.equal('xiuwei_to_lingshi' in raw('rewards.json'), false);
  assert.equal('cooldown_min' in raw('fantong.json').limit, false);
  assert.equal('every_h' in raw('chapters/00-waimen/chapter.json').beats.find(b => b.sealed?.rerun).sealed.rerun, false);
});

test('days per 回 (tools/balance.mjs): typical about a week, heavy a little less, light about two — from the 回s the stage quests hold on, 古一–古三 fast', () => {
  const rows = table(content), later = rows.slice(rows.findIndex(r => r.hui === M.later));
  const say = JSON.stringify(rows);
  assert.ok(later.length >= 4, say);
  for (const r of later.filter(x => x.hui !== 'h10')) {
    for (const who of ['light', 'typical', 'heavy']) {
      const [lo, hi] = M.bands.except?.[r.hui]?.[who] ?? M.bands[who];
      assert.ok(r[who] >= lo && r[who] <= hi, `${r.hui} ${who}: ${r[who]} days, the band ${lo}–${hi}\n${say}`);
    }
  }
  // The order holds everywhere: light is never faster than typical, typical never than heavy.
  for (const r of rows) assert.ok(r.light >= r.typical && r.typical >= r.heavy, `${r.hui}: ${r.light} ≥ ${r.typical} ≥ ${r.heavy}`);
  // 古一–古三 fast: before the first stage quest, a typical first sitting or two.
  const first = rows.filter(r => ['h01', 'h02', 'h04'].includes(r.hui)).reduce((n, r) => n + r.typical, 0);
  assert.ok(first <= 2.5, `古一–古三: ${first} days`);
  // 古九 has no stage quest — the 九转 lands 筑基小成圆满 (ladder.json caps._stage): its story's days only.
  assert.ok(rows.find(r => r.hui === 'h10').typical <= 3);
});

test('the thresholds are the model\'s: --fit re-derives the world\'s own, and each 层 asks more than the one below', () => {
  assert.deepEqual(fit(loadContent()), B.layers.qi, 'node tools/balance.mjs --fit was run on these numbers');
  const th = B.layers.qi;
  for (let i = 2; i < th.length; i += 1) assert.ok(th[i] > th[i - 1], `层 ${i}`);
});

test('every 回 the stage quests hold reaches the book\'s layer at its close — never ahead, never behind', () => {
  const rank = (tier, step) => content.ladder.tiers.findIndex(t => t.id === tier) * 100 + step;
  for (const who of Object.keys(M.players)) {
    const p = play(content, M.players[who]);
    assert.ok(p.rows.every(r => r.end != null), `${who} ends 卷一`);
    assert.deepEqual([p.end.tier, p.end.step], ['foundation', 0], `${who}: 筑基小成 at 卷一's end`);
    assert.ok(rank(p.end.tier, p.end.step) <= rank('foundation', 0));
  }
});

test('the book as the model reads it: every 回\'s scenes, a way on from each, minutes and pay from the data', () => {
  const walk = bookWalk(content);
  for (const h of ['h01', 'h02', 'h04', 'h05', 'h07', 'h08', 'h11', 'h09', 'h10']) assert.ok(walk.some(w => w.hui === h), h);
  assert.ok(walk.every(w => w.minutes > 0));
  assert.equal(walk.filter(w => w.gate).length, 8, 'the eight ways a stage quest holds on 卷一\'s line (古七\'s four)');
});

test('every errand and 榜文 says what work it is: 修行 pays 修为 for a fight, 杂役 pays 灵石 only; the model places each 修为 errand in its 回', () => {
  const all = [...content.quests, ...content.notices];
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
  const paying = content.quests.filter(q => errandPays(content, q) > 0).map(q => q.id).sort();
  assert.deepEqual(Object.keys(M.errands_at).sort(), paying, 'balance.json model.errands_at names every errand that pays 修为 or a pill');
});

test('修屋顶 is handed in for 灵石, nothing for 修为; a haunt fight still pays 修为', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-zhoutian'],
    tier: 'qi', step: 1, progress: 10, wealth: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(),
    quests: { 'xu-waimen-roof': { took: '2026-10-15', have: { 0: 1 } } } };
  const turned = quest(s, content, ctx, { action: 'turn', id: 'xu-waimen-roof' });
  assert.ok(turned.state, JSON.stringify(turned.result));
  assert.equal(turned.result.paid.progress, 0);
  assert.equal(turned.result.paid.wealth, 5, '周衡: 「记你五块灵石」');
  const f = structuredClone(s);
  assert.equal(pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth }).progress, T.haunt.progress);
});

test('real life: the workout is the day\'s 功课 (修为; a few 灵石 at 零层); the day\'s pick and 开府 pay 灵石', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], tier: 'qi', step: 1, progress: 0, traits: ROOTS };
  const payOf = q => paysOf(content, s, NOW, choreGrant(content, q));
  assert.deepEqual(payOf({ id: 'health-workout', period: 'day', reward: 20 }), { progress: T.gongke.progress, wealth: 0 });
  assert.deepEqual(payOf({ id: 'shifu-scan', period: 'week', pool: true, reward: 30 }), { progress: 0, wealth: T.life.wealth });
  assert.deepEqual(payOf({ id: 'linggen-pair', period: 'once', reward: 50 }), { progress: 0, wealth: T.once.wealth });
  const zero = { ...s, step: 0 };
  const workout = { id: 'health-workout', app: 'health', period: 'day', reward: 20, due: true, done_at: NOW.toISOString(), title: { zh: '锻炼', en: 'Workout' } };
  assert.equal(choreGrant(content, workout, zero).table, 'gongke_zero');
  const turned = quest(zero, content, { ...ctx, quests: [workout] }, { action: 'turn', id: 'health-workout' });
  assert.equal(turned.result.paid.wealth, T.gongke_zero.wealth);
  assert.deepEqual(turnedPays(turned.result.paid, { xw: '修为', ls: '灵石' }, 'zh'), [`灵石 +${T.gongke_zero.wealth}`]);
});

test('a day\'s fights (balance.json pool.daily): the first wins pay full 修为, then half, then 灵石 — counted afresh each day', () => {
  const bands = B.pool.daily, full = bands[0].wins, half = bands[1].wins;
  assert.equal(farmShare(content, 0), 1);
  assert.equal(farmShare(content, full - 1), 1);
  assert.equal(farmShare(content, full), bands[1].share);
  assert.equal(farmShare(content, full + half), 0);
  // Far below any mark (古七, 四层 empty, the 回 grinding to 六层), the pool's wins, one after another.
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'], done_scenes: ['09-snow'], tier: 'qi', step: 4, progress: 0, wealth: 0, traits: ROOTS };
  const rate = content.rewards.xiuwei_to_lingshi.rate, paid = [];
  for (let k = 0; k < full + half + 1; k += 1) paid.push(pay(content, s, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth, farm: true }));
  assert.deepEqual(paid.map(p => p.progress), [...Array(full).fill(T.haunt.progress), ...Array(half).fill(Math.round(T.haunt.progress * bands[1].share)), 0]);
  assert.equal(paid.at(-1).wealth, T.haunt.wealth + Math.round(T.haunt.progress * rate), 'the last one\'s 修为 as 灵石');
  assert.deepEqual(paid.at(-1).farm, { win: full + half + 1, share: 0 });
  assert.equal(s.day.hunts, full + half + 1);
  // The next day, full again.
  const next = pay(content, s, { now: new Date(NOW.getTime() + 86_400_000), quests: [] }, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth, farm: true });
  assert.equal(next.progress, T.haunt.progress);
  // A scene's fight or a board is never farmed.
  assert.equal(pay(content, s, ctx, { table: 'haunt', progress: T.haunt.progress }).progress, T.haunt.progress);
});

test('no story floor: the book\'s jump steps him and carries what was over the mark; past the mark the 功课 counts on and a fight pays 灵石', () => {
  const th = content.ladder.tiers[0].thresholds;
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'],
    tier: 'qi', step: 1, progress: th[1], traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString() };
  const g = T.gongke.progress;
  assert.equal(pay(content, s, ctx, { table: 'gongke', progress: g }).progress, g, 'the whole 功课 counted');
  assert.deepEqual([s.step, s.progress], [1, th[1] + g]);
  const f = structuredClone(s);
  const won = pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(won.progress, 0, 'no 修为 past the mark from a fight');
  assert.equal(won.wealth, T.haunt.wealth + Math.round(T.haunt.progress * content.rewards.xiuwei_to_lingshi.rate));
  // 第一路 (wm-diyilu): 一层圆满 met, the rise carries the 功课 over the mark; 二层 asks half of it more.
  const r = resolve({ ...s, scene: 'wm-diyilu', place: 'chaifang' }, content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual([r.state.step, r.result.rose.carried, r.state.stretch['qi:2']], [2, g, g / 2]);
  assert.equal(look(r.state, content, ctx).next, th[2] + g / 2);
  assert.equal('filled' in r.result.rose, false, 'nothing filled by the story');
});

test('a save from before keeps its 层 and its bar as full as it stood — a v8 save through both re-derivations, a v9 save through the last; 圆满 stays 圆满', () => {
  const th = content.ladder.tiers[0].thresholds, was = content.ladder.tiers[0].thresholds_were;
  const save = (version, extra) => ({ ...newState(content, 'zh', NOW), version, chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
    done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], tier: 'qi', traits: ROOTS, ...extra });
  const v9half = migrate(save(9, { step: 4, progress: was['10'][4] / 2 }), content);
  assert.deepEqual([v9half.step, v9half.progress, v9half.version], [4, Math.round(th[4] / 2), 10]);
  const v9full = migrate(save(9, { step: 1, progress: was['10'][1] }), content);
  assert.deepEqual([v9full.step, v9full.progress, realmName(content, v9full, 'zh')], [1, th[1], '练气一层圆满']);
  const v8 = fitWorld(migrate(save(8, { step: 1, progress: 25 }), content), content);
  assert.deepEqual([v8.step, v8.progress], [1, Math.round(25 * th[1] / was['9'][1])], 'read against the ladder it was played on');
  const cliff = migrate(save(9, { chapter: '00-zhuji', scene: '09-cliff', place: 'houshan', ended: ['00-prologue', '00-waimen'], step: 9, progress: was['10'][9] }), content);
  assert.deepEqual([cliff.step, cliff.progress], [9, th[9]], '九层圆满 waits at the cliff still');
  assert.equal('ladder_pace' in cliff, false, 'the mark goes once carried');
  const zhuji = migrate(save(9, { chapter: '01-ji', scene: null, tier: 'foundation', step: 0, progress: 100 }), content);
  assert.deepEqual([zhuji.tier, zhuji.step, zhuji.progress], ['foundation', 0, 100], 'past 练气: untouched');
});
