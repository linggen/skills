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
import { STATE_VERSION, fitWorld, layerPayOf, migrate, newState, realmName } from '../scripts/state.mjs';
import { look, quest, resolve } from '../scripts/rules.mjs';
import { pay, paysOf } from '../scripts/rules/core.mjs';
import { choreGrant } from '../scripts/rules/chores.mjs';
import { chorePlay, fightPlay } from '../scripts/rules/playpay.mjs';
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
  assert.equal(content.tasks.tasks.find(t => t.shouchao).shouchao.every_h, B.cooldowns.shouchao_h, '兽潮\'s cooldown');
  // Nowhere else: a second copy would drift.
  assert.ok(raw('ladder.json').tiers.every(t => !('thresholds' in t)), 'ladder.json holds no thresholds');
  assert.equal('overflow_stretch' in raw('ladder.json'), false);
  assert.equal('tables' in raw('rewards.json'), false);
  assert.equal('xiuwei_to_lingshi' in raw('rewards.json'), false);
  assert.equal('cooldown_min' in raw('fantong.json').limit, false);
  assert.equal('every_h' in raw('chapters/00-waimen/chapter.json').beats.find(b => b.sealed?.rerun).sealed.rerun, false);
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
  assert.ok(first <= 6, `古一–古三: ${first} days`);
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

test('修屋顶 is handed in for 灵石 and, since 2026-10-27, its minutes\' 修为 (rules/playpay.mjs); a haunt fight still pays 修为', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-zhoutian'],
    tier: 'qi', step: 1, progress: 10, wealth: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(),
    quests: { 'xu-waimen-roof': { took: '2026-10-15', have: { 0: 1 } } } };
  const turned = quest(s, content, ctx, { action: 'turn', id: 'xu-waimen-roof' });
  assert.ok(turned.state, JSON.stringify(turned.result));
  const e = content.balance.play_pay.errand;
  // 15% of the layer over 10% of its minutes: 5 minutes at 练气一层 (2 h, 470) — 6.25%, 29.
  assert.equal(turned.result.paid.progress, Math.round((e.share * 470 / (e.time * 120)) * e.minutes), 'an errand\'s minutes at 练气一层');
  assert.equal(turned.result.paid.progress, 29);
  assert.equal(turned.result.paid.wealth, 5 + e.wealth, '周衡: 「记你五块灵石」, and the errand\'s own');
  const f = structuredClone(s);
  // A fight won: its minutes of play at the layer's share (play_pay.fight) — 4 minutes at 练气一层, 27.
  assert.equal(pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth }).progress, fightPlay(content, f));
  assert.equal(fightPlay(content, f), 27);
});

test('real life: the workout is the day\'s 功课 (修为; a few 灵石 at 零层); the day\'s pick and 开府 pay 灵石', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], tier: 'qi', step: 1, progress: 0, traits: ROOTS };
  const payOf = q => paysOf(content, s, NOW, choreGrant(content, q, s));
  // 2026-10-27 (Hanli 「按照百分比奖励」): a chore pays a share of the layer by its period — a day's 10%, a week's 20% (练气一层 47 · 94).
  const pp = content.balance.play_pay, at = pct => Math.round(pct * 470);
  assert.deepEqual(payOf({ id: 'health-workout', period: 'day', reward: 20 }), { progress: at(pp.chore.day), wealth: 0 });
  assert.deepEqual(payOf({ id: 'shifu-scan', period: 'week', pool: true, reward: 30 }), { progress: at(pp.chore.week), wealth: T.life.wealth });
  assert.deepEqual([at(pp.chore.day), at(pp.chore.week), at(pp.chore.month)], [47, 94, 141], 'a month\'s 30%: rarer, so more');
  assert.deepEqual(payOf({ id: 'cfo-import', period: 'month', pool: true, reward: 30 }), { progress: at(pp.chore.month), wealth: T.life.wealth });
  assert.equal(chorePlay(content, { ...s, step: 3 }, 'day'), 51, '三层: 10% of 510 — the pay grows with the layer');
  assert.deepEqual(choreGrant(content, { id: 'health-workout', period: 'day', reward: 20 }).progress, 0, 'no save, no layer: nothing read off it');
  assert.deepEqual(payOf({ id: 'linggen-pair', period: 'once', reward: 50 }), { progress: 0, wealth: T.once.wealth });
  const zero = { ...s, step: 0 };
  const workout = { id: 'health-workout', app: 'health', period: 'day', reward: 20, due: true, done_at: NOW.toISOString(), title: { zh: '锻炼', en: 'Workout' } };
  assert.equal(choreGrant(content, workout, zero).table, 'gongke_zero');
  const turned = quest(zero, content, { ...ctx, quests: [workout] }, { action: 'turn', id: 'health-workout' });
  assert.equal(turned.result.paid.wealth, T.gongke_zero.wealth);
  assert.deepEqual(turnedPays(turned.result.paid, { xw: '修为', ls: '灵石' }, 'zh'), [`灵石 +${T.gongke_zero.wealth}`]);
});

test('no daily thinning (Hanli, 2026-10-16): every pool win pays its share of the layer until the layer is full — then 灵石; 体力 is the day\'s limit', () => {
  assert.equal('pool' in B, false, 'balance.json declares no day\'s fight bands');
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'], done_scenes: ['09-snow'], tier: 'qi', step: 4, progress: 0, wealth: 0, traits: ROOTS };
  // Each win its minutes of play at the layer's share (play_pay.fight, 2026-10-27) — 四层: 4 ÷ (0.35 × 300) × 60% of 530 ≈ 12.
  const each = fightPlay(content, s), want = [], paid = [], wins = Math.min(6, Math.floor(content.ladder.tiers[0].thresholds[4] / each));
  assert.equal(each, 12);
  assert.ok(wins >= 3, 'the layer holds a few wins');
  for (let k = 0; k < wins; k += 1) { want.push(each); paid.push(pay(content, s, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth }).progress); }
  assert.deepEqual(paid, want);
  // …until the layer is full: the 修为 past the mark is 灵石 at the convert rate (圆满 → 灵石).
  const full = { ...structuredClone(s), progress: content.ladder.tiers[0].thresholds[4] - 5 };
  const last = pay(content, full, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(last.progress, 5);
  assert.deepEqual(last.converted, { progress: each - 5, wealth: Math.round((each - 5) * B.convert.rate) });
});

test('no story jump (2026-10-16): past the mark the 功课 counts on and a fight pays 灵石; 第一路 moves no layer — 二层 is ground', () => {
  const th = content.ladder.tiers[0].thresholds;
  const s = { ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: 'waimen', ended: ['00-prologue'], done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'],
    tier: 'qi', step: 1, progress: th[1], traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString() };
  const g = chorePlay(content, s, 'day'); // the day's 功课, its minutes of board play (2026-10-27)
  assert.equal(pay(content, s, ctx, { table: 'gongke', progress: g }).progress, g, 'the whole 功课 counted');
  assert.deepEqual([s.step, s.progress], [1, th[1] + g]);
  const f = structuredClone(s);
  const won = pay(content, f, ctx, { table: 'haunt', progress: T.haunt.progress, wealth: T.haunt.wealth });
  assert.equal(won.progress, 0, 'no 修为 past the mark from a fight');
  assert.equal(won.wealth, T.haunt.wealth + Math.round(fightPlay(content, f) * content.rewards.xiuwei_to_lingshi.rate));
  // 第一路 (wm-diyilu): once a rise to 二层; now the story moves nothing — 古五's grinding steps him. (Its way on waits on
  // 喂饭桶 · 一根牛骨头 since 2026-10-21: played.)
  const r = resolve({ ...s, scene: 'wm-diyilu', place: 'chaifang', tasks: { ...s.tasks, 'diyilu-niugu': { status: 'done' } } }, content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual([r.state.step, r.state.progress], [s.step, s.progress], 'the story moved nothing');
  assert.equal(r.result.rose, undefined);
});

test('a save from before keeps its 层 and its bar as full as it stood — a v8 save through every re-derivation, a v9 and a v10 save through theirs; 圆满 stays 圆满', () => {
  const th = content.ladder.tiers[0].thresholds, was = content.ladder.tiers[0].thresholds_were;
  const save = (version, extra) => ({ ...newState(content, 'zh', NOW), version, chapter: '00-waimen', scene: 'wm-chaifang', place: 'chaifang', ended: ['00-prologue'],
    done_scenes: ['wm-ahe', 'wm-jiangtang', 'wm-zhoutian'], tier: 'qi', traits: ROOTS, ...extra });
  const v9half = migrate(save(9, { step: 4, progress: was['10'][4] / 2 }), content);
  assert.deepEqual([v9half.step, v9half.progress, v9half.version], [4, Math.round(th[4] / 2), STATE_VERSION]);
  // v11 (before 人间功课 paid its minutes, 2026-10-27): 一层 kept as it stood, a half 二层 bar stays half of the new one.
  assert.deepEqual([migrate(save(11, { step: 1, progress: 146 }), content).progress, migrate(save(11, { step: 2, progress: was['12'][2] / 2 }), content).progress], [146, Math.round(th[2] / 2)]);
  // v10 (the stage quests' ladder, before the story stopped raising 层): his 九层 · 0 stays 九层 · 0; half a bar stays half.
  assert.deepEqual([migrate(save(10, { step: 9, progress: 0 }), content).step, migrate(save(10, { step: 9, progress: 0 }), content).progress], [9, 0]);
  assert.equal(migrate(save(10, { step: 7, progress: was['11'][7] / 2 }), content).progress, Math.round(th[7] / 2));
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
