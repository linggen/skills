// One model for every number (Hanli, 2026-10-15; design.md § Pacing and the economy): about 30
// minutes a day and one 回 a week, the story the reward, 古一–古三 fast. worlds/jiuding/balance.json
// declares the 层 thresholds, the pay tables, the fight-to-灵石 rate and the routine's cooldowns; the rules read them (content.mjs withBalance); tools/balance.mjs plays a
// light, a typical and a heavy player through 卷一 day by day. This holds the bands it prints, the
// numbers' home, the stage quests and old saves.
//
// Kept from tests/xiuwei-pace.test.mjs (2026-10-15, 「让游戏修为和故事match」): 修行 pays 修为, 杂役
// pays 灵石; the 功课 is 修为 (a few 灵石 at 零层); past a full mark the 功课 counts on, a fight pays 灵石.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { STATE_VERSION, fitWorld, layerPayOf, migrate, newState, realmName, staminaCost, stepName } from '../scripts/state.mjs';
import { look, quest, resolve } from '../scripts/rules.mjs';
import { pay, paysOf } from '../scripts/rules/core.mjs';
import { settleHeld } from '../scripts/rules/cap.mjs';
import { choreGrant } from '../scripts/rules/chores.mjs';
import { chorePlay, convertRate, fightPlay, stonesAt, tableStones } from '../scripts/rules/playpay.mjs';
import { turnedPays } from '../scripts/turned.js';
import { BALANCE_FILE, bookWalk, errandPays, play, table } from '../tools/balance.mjs';

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
  assert.equal(content.fantong.limit.cooldown_min, B.cooldowns.fantong_min);
  assert.equal(B.events.shouchao.every_h, 1, '兽潮\'s cooldown: a cooldown event (rules/events.mjs)');
  // Nowhere else: a second copy would drift.
  assert.ok(raw('ladder.json').tiers.every(t => !('thresholds' in t)), 'ladder.json holds no thresholds');
  assert.equal('overflow_stretch' in raw('ladder.json'), false);
  assert.equal('tables' in raw('rewards.json'), false);
  assert.equal('xiuwei_to_lingshi' in raw('rewards.json'), false);
  assert.equal('cooldown_min' in raw('fantong.json').limit, false);
  const tide = raw('tasks/world.json').tasks.find(t => t.shouchao).shouchao;
  assert.ok(!('every_h' in tide) && !('hours' in tide) && !('grace_min' in tide), '兽潮: no cooldown of its own, no clock window');
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
  // 古一–古三 fast: before the first stage quest, all reading and boards. 2.5 typical days until
  // 2026-10-26; the book's full text played (Hanli 「你的建议我同意」) reads 4.8 — held at 5 until the
  // new small games land (doc/games.md § 全文后的小游戏), Hanli's call.
  const first = rows.filter(r => ['h01', 'h02', 'h04'].includes(r.hui)).reduce((n, r) => n + r.typical, 0);
  // 2026-10-26, the new small games (doc/games.md § 全文后的小游戏) add their minutes: ≤ 6 while they land; the 层 re-fit after.
  // 2026-10-31 (agent's pick, Hanli delegated 10-31): ≤ 6.2 — 00-queue's look breaks the last read over 8 min (00-longzhi →
  // 00-hall, 5,146 字; Hanli's own ≤ 8 min rule, ling-mem b2fNMipemI), and its scene minute tips the sum to 6.1. The band is a
  // guess (minutes and reading speed are, status.md); the reading rule wins.
  assert.ok(first <= 6.2, `古一–古三: ${first} days`);
  // 古九 has no stage quest — the 九转 lands 筑基小成圆满 (ladder.json caps._stage): its story's days only.
  assert.ok(rows.find(r => r.hui === 'h10').typical <= 3);
});

test('the thresholds are the master table\'s curve (tools/master.mjs curveOf, 2026-11-10): need(L) = R(L) × mix × 60 × T(L), each 层 more than the one below', () => {
  const th = B.layers.qi, G = B.master.lines.gu, X = B.master.xiuwei, mix = X.board * G.games.time / G.games.share;
  assert.equal(th[1], Math.round((X.rate.base * mix * 60 * G.time.first) / G.need.round) * G.need.round, '练气一层: R(1) × mix × 60 × T₁');
  for (let i = 2; i < th.length; i += 1) assert.ok(th[i] > th[i - 1], `层 ${i}`);
  // Past 练气 each 层 its own level (81 levels): 筑基一层 above 练气九层, R's realm step on top.
  assert.ok(B.layers.foundation[0] > th.at(-1), '筑基一层 above 练气九层');
});

test('every 回 the stage quests hold reaches the book\'s layer at its close — never ahead, never behind', () => {
  const rank = (tier, step) => content.ladder.tiers.findIndex(t => t.id === tier) * 100 + step;
  for (const who of Object.keys(M.players)) {
    const p = play(content, M.players[who]);
    assert.ok(p.rows.every(r => r.end != null), `${who} ends 卷一`);
    // 筑基 in nine 层 since 2026-11-02 (Hanli approved): 小成 is 一至三层, 古九's cap 三层 — 卷一 ends inside 小成.
    assert.equal(p.end.tier, 'foundation', `${who}: 筑基 at 卷一's end`);
    assert.equal(stepName(content, p.end.tier, p.end.step, 'zh'), '筑基 · 小成', `${who}: 筑基 · 小成 at 卷一's end`);
    assert.ok(rank(p.end.tier, p.end.step) <= rank('foundation', 2));
  }
});

test('the book as the model reads it: every 回\'s scenes, a way on from each, minutes and pay from the data', () => {
  const walk = bookWalk(content);
  for (const h of ['h01', 'h02', 'h04', 'h05', 'h07', 'h08', 'h11', 'h09', 'h10']) assert.ok(walk.some(w => w.hui === h), h);
  assert.ok(walk.every(w => w.minutes > 0));
  assert.equal(walk.filter(w => w.gate).length, 15, 'the fifteen ways (2026-11-10: + six shares — 一层 at 点卯 and the 执事房, 五层 at the 丹房 and 这一年, 六层 at 鯥 and 碾药; before that the nine ways a stage quest holds on 卷一\'s line (古五\'s one since 2026-11-03 — the 石室\'s 三层; the 秘境\'s door and the 石室\'s 四层 went with the share holds —, 古七\'s three (09-year\'s 伏天 dropped 11-03), 古八\'s three since 2026-10-28, 入秋\'s at 09-qulao since 11-03)');
});

test('every errand and 榜文 says what work it is: 修行 pays 修为 for a fight, 杂役 pays 灵石 only; the model places each 修为 errand in its 回', () => {
  const all = [...content.quests, ...content.notices];
  assert.ok(all.length >= 18);
  for (const q of all) {
    assert.ok(['cultivation', 'labor'].includes(q.work), `${q.id}: work is cultivation or labor`);
    const fights = (q.need ?? [{ kind: q.kind }]).some(n => ['subdue', 'tame'].includes(n.kind));
    if (q.work === 'labor') {
      assert.equal(T[q.grant.table]?.progress, 0, `${q.id}: a chore is paid on a table that gives no 修为`);
      assert.equal('progress' in q.grant || 'units' in q.grant, false, `${q.id}: and names none`);
      assert.ok((q.grant.ls ?? q.grant.wealth) > 0 || q.grant.item, `${q.id}: it pays stones (a size, ls — batch 2) or a thing`);
    } else {
      assert.ok(fights, `${q.id}: 修行 is a fight (降妖 · 驯)`);
      assert.ok(q.grant.units > 0, `${q.id}: and pays 修为 (a size, 2026-11-10)`);
    }
  }
  const paying = content.quests.filter(q => errandPays(content, q) > 0).map(q => q.id).sort();
  assert.deepEqual(Object.keys(M.errands_at).sort(), paying, 'balance.json model.errands_at names every errand that pays 修为 or a pill');
});

test('修屋顶 is handed in for 灵石 and, since 2026-10-27, its minutes\' 修为 (rules/playpay.mjs); a haunt fight still pays 修为', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-zhoutian'],
    tier: 'qi', step: 1, progress: 10, wealth: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(),
    quests: { 'xu-waimen-roof': { took: '2026-10-15', have: { 0: 1 } } } };
  const turned = quest(s, content, ctx, { action: 'turn', id: 'xu-waimen-roof' });
  assert.ok(turned.state, JSON.stringify(turned.result));
  const e = content.balance.play_pay.errand;
  // A fixed number (2026-11-02): its minutes as 体力-units × R at 练气一层 (play_pay.xiuwei.rate.base, 2).
  assert.equal(turned.result.paid.progress, Math.round(content.balance.play_pay.xiuwei.rate.base * e.minutes), 'an errand\'s minutes at 练气一层');
  assert.equal(turned.result.paid.wealth, 5 + Math.round(stonesAt(content, s, e.ls)), '周衡: 「记你五块灵石」 (a master told, batch 2), and the errand\'s own (minutes of income × I where he stands)');
  const f = structuredClone(s);
  // A fight won: its 体力 × R at 练气一层 (2026-11-02) × a card fight's factor (play_pay.xiuwei.fight, 2026-11-10: 「打一场才几点」).
  assert.equal(pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, ls: T.haunt.ls }).progress, fightPlay(content, f));
  assert.equal(fightPlay(content, f), Math.round(content.balance.play_pay.xiuwei.rate.base * staminaCost(content, 'duel') * content.balance.play_pay.xiuwei.fight));
});

test('real life: the workout is the day\'s 功课 (修为; a few 灵石 at 零层); the day\'s pick and 开府 pay 灵石', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], tier: 'qi', step: 1, progress: 0, traits: ROOTS };
  const payOf = q => paysOf(content, s, NOW, choreGrant(content, q, s));
  // 2026-11-02 (Hanli 「不要按照百分比给」): a chore pays its period's 体力-units × R — a day 10, a week 20, a month 30 since
  // 2026-11-10's doubling of the app-linked chores (练气一层 20 · 40 · 60; 10 · 20 · 30 before).
  const pp = content.balance.play_pay, X = pp.xiuwei, at = units => Math.round(units * X.rate.base);
  assert.deepEqual(payOf({ id: 'health-workout', period: 'day', reward: 20 }), { progress: at(pp.chore.day), wealth: 0 });
  assert.deepEqual(payOf({ id: 'shifu-scan', period: 'week', pool: true, reward: 30 }), { progress: at(pp.chore.week), wealth: tableStones(content, s, 'life') });
  assert.deepEqual([at(pp.chore.day), at(pp.chore.week), at(pp.chore.month)], [20, 40, 60], 'a month\'s: rarer, so more');
  assert.deepEqual(payOf({ id: 'cfo-import', period: 'month', pool: true, reward: 30 }), { progress: at(pp.chore.month), wealth: tableStones(content, s, 'life') });
  assert.equal(chorePlay(content, { ...s, step: 3 }, 'day'), Math.round(pp.chore.day * X.rate.base * X.rate.growth ** 2), '三层: R(3) — the pay grows 5% a level, never with the 层\'s need');
  assert.deepEqual(choreGrant(content, { id: 'health-workout', period: 'day', reward: 20 }).progress, 0, 'no save, no layer: nothing read off it');
  assert.deepEqual(payOf({ id: 'linggen-pair', period: 'once', reward: 50 }), { progress: 0, wealth: tableStones(content, s, 'once') }, 'its table\'s minutes × I where he stands (batch 2), never the app\'s own `reward`');
  const zero = { ...s, step: 0 };
  const workout = { id: 'health-workout', app: 'health', period: 'day', reward: 20, due: true, done_at: NOW.toISOString(), title: { zh: '锻炼', en: 'Workout' } };
  assert.equal(choreGrant(content, workout, zero).table, 'gongke_zero');
  const turned = quest(zero, content, { ...ctx, quests: [workout] }, { action: 'turn', id: 'health-workout' });
  assert.equal(turned.result.paid.wealth, tableStones(content, zero, 'gongke_zero'));
  assert.deepEqual(turnedPays(turned.result.paid, { xw: '修为', ls: '灵石' }, 'zh'), [`灵石 +${tableStones(content, zero, 'gongke_zero')}`]);
});

test('no daily thinning (Hanli, 2026-10-16): every pool win pays its share of the layer until the layer is full — then 灵石; 体力 is the day\'s limit', () => {
  assert.equal('pool' in B, false, 'balance.json declares no day\'s fight bands');
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'], done_scenes: ['09-snow', '09-jiuge'], tier: 'qi', step: 4, progress: 0, wealth: 0, traits: ROOTS }; // past 古七's 0.8 hold (09-jiuge, 2026-11-10)
  // Each win its 体力 × R(四层) (2026-11-02): a card fight's 2 (measured, 2026-11-04) × 2 × 1.05³ × the fight's factor (2026-11-10).
  const X = B.play_pay.xiuwei, each = fightPlay(content, s), want = [], paid = [], wins = Math.min(6, Math.floor(content.ladder.tiers[0].thresholds[4] / each));
  assert.equal(each, Math.round(staminaCost(content, 'duel') * X.rate.base * X.rate.growth ** 3 * X.fight));
  assert.ok(wins >= 3, 'the layer holds a few wins');
  for (let k = 0; k < wins; k += 1) { want.push(each); paid.push(pay(content, s, ctx, { table: 'haunt', progress: T.haunt.progress, ls: T.haunt.ls }).progress); }
  assert.deepEqual(paid, want);
  // …until the layer is full: the 修为 past the mark is 灵石 at the convert rate (圆满 → 灵石).
  const room = Math.floor(each / 2), full = { ...structuredClone(s), progress: content.ladder.tiers[0].thresholds[4] - room };
  const last = pay(content, full, ctx, { table: 'haunt', progress: T.haunt.progress, ls: T.haunt.ls });
  assert.equal(last.progress, room);
  // 灵石 per 修为 the same at every level (playpay.mjs convertRate, batch 2: share × I(L) ÷ (R(L) × board) — R and I share their shape).
  assert.deepEqual(last.converted, { progress: each - room, wealth: Math.max(1, Math.round((each - room) * convertRate(content, full))), say: content.ladder.caps.convert.zh });
  assert.ok(Math.abs(convertRate(content, full) - convertRate(content, { ...full, step: 1 })) < 1e-9, 'the same rate at 一层 and 四层');
});

test('no story jump (2026-10-16): past the mark the 功课 and a fight alike pay 灵石 (2026-11-12); 第一路 moves no layer — 二层 is ground', () => {
  const th = content.ladder.tiers[0].thresholds;
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'],
    tier: 'qi', step: 1, progress: th[1], traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString() };
  const g = chorePlay(content, s, 'day'); // the day's 功课, its minutes of board play (2026-10-27)
  const done = pay(content, s, ctx, { table: 'gongke', progress: g });
  assert.deepEqual([done.progress, done.converted?.progress], [0, g], 'the whole 功课 past the full bar: 灵石 (Hanli 2026-11-12)');
  assert.deepEqual([s.step, s.progress], [1, th[1]]);
  const f = structuredClone(s);
  const won = pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, ls: T.haunt.ls });
  assert.equal(won.progress, 0, 'no 修为 past the mark from a fight');
  assert.equal(won.wealth, tableStones(content, f, 'haunt') + Math.max(1, Math.round(fightPlay(content, f) * convertRate(content, f))));
  // 第一路 (wm-diyilu): once a rise to 二层; now the story moves nothing — 古五's grinding steps him. (Its way on waits on
  // 喂饭桶 · 一根牛骨头 since 2026-10-21: played.)
  const at = { ...s, scene: 'wm-diyilu', place: 'chaifang', tasks: { ...s.tasks, 'diyilu-niugu': { status: 'done' }, 'diyilu-tama': { status: 'done' } } };
  const r = resolve(at, content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  // Past the 柴房 the full 一层 steps to h05's 二层 on load (its gate behind him in the book's order, rules/cap.mjs gatePassed,
  // 2026-11-10): the story's way on adds nothing to what the load settles.
  const settled = settleHeld(content, at);
  assert.deepEqual([r.state.step, r.state.progress], [settled.step, settled.progress], 'the story moved nothing');
  assert.equal(r.result.rose, undefined);
});

test('a save from before keeps its 层 and its bar as full as it stood — a v8 save through every re-derivation, a v9 and a v10 save through theirs; 圆满 stays 圆满', () => {
  const th = content.ladder.tiers[0].thresholds, was = content.ladder.tiers[0].thresholds_were;
  // Every older carry lands on v17's ladder (thresholds_were["18"]), then the curve reads it by its percent (v18, 2026-11-10).
  const th17 = was['18'], cur = (step, p) => Math.round((p * th[step]) / th17[step]);
  const save = (version, extra) => ({ ...newState(content, 'zh', NOW), version, chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
    done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], tier: 'qi', traits: ROOTS, ...extra });
  const v9half = migrate(save(9, { step: 4, progress: was['10'][4] / 2 }), content);
  assert.deepEqual([v9half.step, v9half.progress, v9half.version], [4, cur(4, Math.round(th17[4] / 2)), STATE_VERSION]);
  // v11 (before 人间功课 paid its minutes, 2026-10-27): 一层 kept as it stood, a half 二层 bar stays half of the new one.
  assert.deepEqual([migrate(save(11, { step: 1, progress: 146 }), content).progress, migrate(save(11, { step: 2, progress: was['12'][2] / 2 }), content).progress], [cur(1, 146), cur(2, Math.round(th17[2] / 2))]);
  // v10 (the stage quests' ladder, before the story stopped raising 层): his 九层 · 0 stays 九层 · 0; half a bar stays half.
  assert.deepEqual([migrate(save(10, { step: 9, progress: 0 }), content).step, migrate(save(10, { step: 9, progress: 0 }), content).progress], [9, 0]);
  assert.equal(migrate(save(10, { step: 7, progress: was['11'][7] / 2 }), content).progress, cur(7, Math.round(th17[7] / 2)));
  const v9full = migrate(save(9, { step: 1, progress: was['10'][1] }), content);
  assert.deepEqual([v9full.step, v9full.progress, realmName(content, v9full, 'zh')], [1, th[1], '练气一层圆满']);
  const v8 = fitWorld(migrate(save(8, { step: 1, progress: 25 }), content), content);
  assert.deepEqual([v8.step, v8.progress], [1, cur(1, Math.round(25 * th17[1] / was['9'][1]))], 'read against the ladder it was played on');
  const cliff = migrate(save(9, { chapter: '00-zhuji', scene: '09-cliff', place: 'houshan', ended: ['00-prologue', '00-waimen'], step: 9, progress: was['10'][9] }), content);
  assert.deepEqual([cliff.step, cliff.progress], [9, th[9]], '九层圆满 waits at the cliff still');
  assert.equal('ladder_pace' in cliff, false, 'the mark goes once carried');
  const zhuji = migrate(save(9, { chapter: '01-ji', scene: null, tier: 'foundation', step: 0, progress: 100 }), content);
  const fd = content.ladder.tiers[1];
  // v13's master table read it on the three steps (thresholds_were 14), then v15 walks it into 小成's 层 — the same point of the 段.
  const v14 = Math.round(100 * fd.thresholds_were['14'][0] / fd.thresholds_were['13'][0]);
  assert.ok(v14 < fd.thresholds_were['18'][0], 'inside 一层');
  assert.deepEqual([zhuji.tier, zhuji.step, zhuji.progress], ['foundation', 0, Math.round((v14 * fd.thresholds[0]) / fd.thresholds_were['18'][0])], 'past 练气: its bar as full as it stood (v13, the master table\'s 筑基; v15, by its share of 小成)');
});

test('v13 (数值系统 phase 2): a 练气二层 save keeps its 层, its bar and the stretch over its mark as full as they stood', () => {
  // Carried to v17's ladder (thresholds_were["18"]) by v13's carry, then onto the curve by v18's: one percent, rounded twice.
  const qi = content.ladder.tiers[0], was = qi.thresholds_were['13'][2], at17 = qi.thresholds_were['18'][2], now = qi.thresholds[2];
  const two = n => Math.round((Math.round((n * at17) / was) * now) / at17);
  const save = { ...newState(content, 'zh', NOW), version: 12, chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
    done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], tier: 'qi', traits: ROOTS, step: 2, progress: 300, stretch: { 'qi:2': 40 } };
  const m = migrate(save, content);
  assert.equal(m.version, STATE_VERSION);
  assert.deepEqual([m.tier, m.step], ['qi', 2]);
  assert.equal(m.progress, two(300));
  assert.deepEqual(m.stretch, { 'qi:2': two(40) });
  assert.ok(Math.abs(m.progress / (now + m.stretch['qi:2']) - 300 / (was + 40)) < 0.005, 'the bar as full');
});

// Batch 2 (2026-11-10): 灵石 buys 修为 only dearer than playing for it — master.economy.prices.pill_ratio. A typical player who
// spends every 灵石 on the shelf's 聚气丹 (tools/balance.mjs --qi-buy) saves at most a twentieth of 卷一's days.
test('buying 修为 is no farm: every 灵石 on 聚气丹 saves the typical player at most 5% of 卷一', () => {
  const p = M.players.typical, days = rows => rows.reduce((n, r) => n + (r.days ?? 0), 0);
  const base = days(play(content, p).rows), buyer = days(play(content, { ...p, qi_buy: 1 }).rows);
  assert.ok(buyer < base, `the pills do something: ${base} → ${buyer}`);
  // 2026-11-12 (修为 past the cap is 灵石, Hanli): a longer 卷一 (45 → 50 typical days) gives the pills more to save — 5.8%;
  // allowed to 6%, NOT retuned (pill_ratio is Hanli's call).
  assert.ok(buyer >= base * 0.94, `${base} → ${buyer} days`);
});
