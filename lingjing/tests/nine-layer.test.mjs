// The nine-层 change (Hanli approved 2026-11-02: 「以后可以仍然按层数算1-3=小成, 4-6=中, 7-9=大」 · 「9层用于计算, 小, 中,
// 大成用于显示」 · 「练气的UI不改了, 保持现在这样吧. 筑基以后再分3段UI吧」): every realm past 练气 counts nine 层 and reads
// them as three 段 — 「筑基 · 中成」.
// 1. the mapping: 一至三层 小成, 四至六层 中成, 七至九层 大成; the thresholds the master table's, nine a realm;
// 2. the names: 「筑基 · 小成」 for every 层 of the 段, 圆满 only on the 段's last 层; 练气 keeps 「练气四层」;
// 3. Look: `tier.realm`, `tier.duan` {id, name, at, marks} and `tier.layer` on 筑基 and above only — the shape the strip's
//    three-段 bar reads (stage.mjs duanOf); 练气's Look as it was;
// 4. the 段 trial into 四层 and 七层: a light throw (no pill) on the pay that carries him over, a failure only an hour;
//    九层 keeps the realm throw; 练气 has none;
// 5. old saves: v14's 小成 · 中成 · 大成 are 三层 · 六层 · 九层, the bar as full as it stood, once;
// 6. a 层 inside a 段 is never told as a rise; the caps' 筑基 is 三层.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { STATE_VERSION, fullName, layerName, migrate, newState, realmName, stageOf, stepName, threshold } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { duanOdds, duanPass } from '../scripts/rules/breakthrough.mjs';
import { duanOf } from '../scripts/stage.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';

const content = loadContent();
const NOW = new Date('2026-11-02T12:00:00');
const ctx = { now: NOW, quests: [] };
const HOUR = 3600_000;
const FD = content.ladder.tiers.find(t => t.id === 'foundation');
const ROOTS = ['wood', 'water', 'fire', 'earth'];
const lookOf = s => { const r = look(s, content, ctx); return r.result ?? r; };
/* 古九 (h10): past the cliff, at 筑基, under its cap (三层). */
const gujiu = (extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '01-ji', scene: '01-arrive', place: 'yecheng', ended: ['00-prologue', '00-waimen', '00-zhuji'],
  tier: 'foundation', step: 0, progress: 0, traits: ROOTS, stamina: content.rewards.stamina.max, stamina_at: NOW.toISOString(), ...extra });
/* The old spine past 邺 (02-yan): no 回, so no cap — the realm's own 层 are his to climb, through the 段 doors. */
const open = (extra = {}) => ({ ...gujiu(), chapter: '02-yan', scene: '02-lake', place: 'leiyuan', ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], ...extra });
/* A save at 三层 (or 六层) one short of its mark, whose 段 trial lands (or fails) on the next pay. */
function atDoor(step, lands, extra = {}) {
  for (let k = 0; k < 500; k += 1) {
    const s = open({ step, progress: FD.thresholds[step] - 1, seed: `ninelayer-${k}`, ...extra });
    if (duanPass(content, s, NOW, 'foundation', step + 1) === lands) return s;
  }
  throw new Error('no seed');
}

test('the mapping: 筑基 and above count nine 层, read as 小成 · 中成 · 大成 three by three; 练气 is as it was', () => {
  for (const t of content.ladder.tiers.slice(1)) {
    assert.equal(t.display, 'stages', t.id);
    assert.equal(t.thresholds.length, 9, `${t.id}: nine thresholds`);
    assert.deepEqual(t.thresholds, content.balance.layers[t.id], `${t.id}: the master table's`);
  }
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => stageOf(content, 'foundation', k).id), ['xiao', 'xiao', 'xiao', 'zhong', 'zhong', 'zhong', 'da', 'da', 'da']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => stageOf(content, 'foundation', k).at), [1, 2, 3, 1, 2, 3, 1, 2, 3]);
  assert.equal(stageOf(content, 'qi', 4), null, '练气 names its 层');
  assert.equal(content.ladder.tiers[0].display, undefined);
  // The 今's realms are its own ladder, three steps each still.
  assert.ok(content.ladder.lines.jin.tiers.every(t => !t.display));
});

test('the names: 「筑基 · 中成」 for each 层 of the 段, 圆满 on its last 层; the 层 only as the tooltip names it; 练气 keeps 「练气四层」', () => {
  assert.equal(stepName(content, 'foundation', 0, 'zh'), '筑基 · 小成');
  assert.equal(stepName(content, 'foundation', 4, 'zh'), '筑基 · 中成');
  assert.equal(stepName(content, 'tribulation', 8, 'zh'), '渡劫 · 大成');
  assert.equal(stepName(content, 'foundation', 4, 'en'), 'Foundation Establishment · Middle Attainment');
  assert.equal(stepName(content, 'qi', 4, 'zh'), '练气四层');
  assert.equal(realmName(content, { tier: 'foundation', step: 2, progress: FD.thresholds[2] }, 'zh'), '筑基 · 小成圆满');
  assert.equal(realmName(content, { tier: 'foundation', step: 1, progress: FD.thresholds[1] }, 'zh'), '筑基 · 小成', 'a 层 before the 段\'s last, full: the 段 still');
  assert.equal(fullName(content, 'foundation', 8, 'zh'), '筑基 · 大成圆满');
  assert.equal(realmName(content, { tier: 'qi', step: 4, progress: 0 }, 'zh'), '练气四层');
  assert.deepEqual([layerName(content, 'foundation', 3, 'zh'), layerName(content, 'foundation', 3, 'en')], ['第四层', 'Layer 4']);
});

test('Look: tier.realm, tier.duan {id, name, at, marks} and tier.layer on 筑基 — as the strip\'s three-段 bar reads them; 练气 has none', () => {
  const l = lookOf(gujiu({ step: 1, progress: 100 }));
  assert.deepEqual(l.tier, { id: 'foundation', step: 2, name: '筑基 · 小成', phase: '筑基 · 小成', bar: true, realm: '筑基', layer: '第二层',
    duan: { id: 'xiao', name: '小成', at: 2, marks: FD.thresholds.slice(0, 3) } });
  assert.deepEqual(duanOf(l.tier), { label: '筑基 · 小成', at: 2, layer: '第二层', full: '筑基 · 小成' });
  const en = lookOf(gujiu({ lang: 'en', step: 4, progress: 0 }));
  assert.deepEqual([en.tier.realm, en.tier.duan.name, en.tier.duan.at, en.tier.layer], ['Foundation Establishment', 'Middle Attainment', 2, 'Layer 5']);
  // On the 段's last 层, below the realm's last 段: the trial ahead, its chance.
  const door = lookOf(open({ step: 2, progress: 10 }));
  assert.equal(door.tier.duan.trial.to, '中成');
  assert.equal(door.tier.duan.trial.chance, duanOdds(content, open({ step: 2 }), NOW, 'foundation', 3).chance);
  assert.equal(lookOf(open({ step: 8, progress: 10 })).tier.duan.trial, undefined, '九层 is the realm throw\'s');
  // 练气: as it was — no realm, no 段, no 层 of its own.
  const qi = lookOf({ ...gujiu(), tier: 'qi', step: 4, progress: 10 });
  assert.deepEqual(Object.keys(qi.tier).sort(), ['bar', 'id', 'name', 'phase', 'step']);
  assert.equal(qi.tier.name, '练气四层');
  assert.equal(duanOf(qi.tier), null);
});

test('the 段 trial: into 四层 a light throw on the pay that carries him over — landed, he steps on; failed, the 层 stays full for an hour', () => {
  const rule = content.ladder.breakthrough.duan;
  assert.ok(rule && !('pill' in rule) && !rule.factors.includes('pill'), 'no pill');
  const o = duanOdds(content, open({ step: 2 }), NOW, 'foundation', 3);
  assert.deepEqual(o.parts.map(p => p.id), ['body', 'seclusion', 'element']);
  assert.equal(o.chance, rule.base + content.ladder.breakthrough.body.whole + content.ladder.breakthrough.element.match, 'unhurt, an earth root for 筑基');
  // Landed: through the door, the try written, the result says so — and no 层 inside the 段 told as a rise.
  const win = atDoor(2, true);
  const r = pay(content, win, ctx, { table: 'seclusion', progress: 50 });
  assert.equal(win.step, 3, '四层 — 筑基 · 中成');
  assert.deepEqual([r.duan.success, r.duan.to.name], [true, '中成']);
  assert.deepEqual(r.levels, [{ from: '筑基 · 小成', to: '筑基 · 中成' }]);
  assert.equal(win.duan.tries['foundation:3'], 1);
  // Failed: held at 三层圆满, the 修为 counting on past the mark; the hour starts; nothing else lost.
  const lose = atDoor(2, false), had = lose.stamina;
  const f = pay(content, lose, ctx, { table: 'seclusion', progress: 50 });
  assert.deepEqual([lose.step, lose.progress], [2, FD.thresholds[2] + 49]);
  assert.equal(f.duan.success, false);
  assert.equal(f.hold.duan.success, false);
  assert.equal(lose.stamina, had, 'no wound');
  assert.equal(lose.duan.until, new Date(NOW.getTime() + rule.cooldown_hours * HOUR).toISOString());
  assert.equal(realmName(content, lose, 'zh'), '筑基 · 小成圆满');
  // While it cools no die is thrown: the pay counts on, held.
  const again = pay(content, lose, ctx, { table: 'seclusion', progress: 10 });
  assert.deepEqual([lose.step, again.duan, again.hold.duan.cooling], [2, undefined, true]);
  assert.equal(lose.duan.tries['foundation:3'], 1, 'no new try while it cools');
  assert.ok(lookOf(lose).tier.duan.trial.again_at);
  // The hour past, the next pay throws a new die.
  const later = { ...ctx, now: new Date(NOW.getTime() + 2 * HOUR) };
  pay(content, lose, later, { table: 'seclusion', progress: 10 });
  assert.equal(lose.duan.tries['foundation:3'], 2);
});

test('the trial stands at 六层 too; 一层 → 二层 inside a 段 throws nothing; 练气 throws none; 古九\'s cap keeps 三层', () => {
  const six = atDoor(5, true);
  pay(content, six, ctx, { table: 'seclusion', progress: 50 });
  assert.deepEqual([six.step, stepName(content, 'foundation', six.step, 'zh')], [6, '筑基 · 大成']);
  const inside = open({ step: 0, progress: FD.thresholds[0] - 1 });
  const r = pay(content, inside, ctx, { table: 'seclusion', progress: 50 });
  assert.deepEqual([inside.step, r.duan, r.levels, inside.duan], [1, undefined, [], undefined], 'a 层 inside a 段: the bar\'s, no die, no rise told');
  assert.equal(duanOdds(content, open({ tier: 'qi', step: 3 }), NOW, 'qi', 4), null, '练气: no 段 trial');
  // 古九: 小成 is his to grind whole, then the cap — no trial is thrown past a shut door.
  const s = gujiu();
  for (let i = 0; i < 60; i += 1) pay(content, s, ctx, { table: 'seclusion', progress: 90 });
  assert.deepEqual([s.step, s.duan], [2, undefined]);
  assert.equal(lookOf(s).tier.name, '筑基 · 小成圆满');
  assert.equal(lookOf(s).tier.duan.trial, undefined, 'the cap shuts the door: no trial promised');
  assert.equal(content.ladder.caps.hui.h10.layer, 3);
  assert.deepEqual(content.ladder.caps.hui.h09.story, { tier: 'foundation', layer: 3 });
});

test('old saves: v14\'s 小成 · 中成 · 大成 are 三层 · 六层 · 九层, the bar and the stretch as full as they stood — once', () => {
  const was = FD.thresholds_were['14'];
  const v14 = (step, progress, extra = {}) => ({ ...gujiu(), version: 14, step, progress, lines: { jin: { tier: 'xinsheng', step: 0, progress: 0 } }, ...extra });
  const pos = s => [s.tier, s.step, s.progress];
  assert.deepEqual(pos(migrate(v14(0, 655), content)), ['foundation', 2, Math.round(655 * FD.thresholds[2] / was[0])], '小成 halfway: 三层 halfway');
  assert.deepEqual(pos(migrate(v14(1, 0), content)), ['foundation', 5, 0], '中成 · 0: 六层 · 0');
  const peak = migrate(v14(2, was[2]), content);
  assert.deepEqual(pos(peak), ['foundation', 8, FD.thresholds[8]], '筑基圆满 waits at the cliff still');
  assert.equal(realmName(content, peak, 'zh'), '筑基 · 大成圆满');
  const st = migrate(v14(0, 1400, { stretch: { 'foundation:0': 100, 'qi:9': 7 } }), content);
  assert.deepEqual(st.stretch, { 'qi:9': 7, 'foundation:2': Math.round(100 * FD.thresholds[2] / was[0]) }, 'the stretch on its new key');
  const m = migrate(v14(1, 700), content);
  assert.equal(m.version, STATE_VERSION);
  assert.equal('ladder_stages' in m, false, 'the mark goes once carried');
  assert.deepEqual(migrate(m, content), m, 'fitted once: the same again');
  // 练气 untouched; a new save at 筑基一层 is never carried.
  assert.deepEqual(pos(migrate({ ...v14(0, 0), tier: 'qi', step: 4, progress: 300 }, content)), ['qi', 4, 300]);
  const fresh = gujiu({ step: 0, progress: 10 });
  assert.deepEqual(pos(migrate(fresh, content)), ['foundation', 0, 10]);
});
