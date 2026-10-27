// The ladder follows 凡人 (story DESIGN § 道统, 2026-10-03), with our one
// exception declared: 练气 has nine 层 — 一至三层 小成, 四至六层 中成, 七至九层
// 大成 — and every realm past it has three steps, 小成 中成 大成 themselves
// (Hanli, 2026-10-09: the Daoist words, 《钟吕传道集》, for 初期/中期/后期). A
// step filled is 圆满 (练气二层圆满, 筑基中成圆满); the realm's last filled,
// 筑基圆满, is the one state a breakthrough is tried from. 巅峰 is the spoken
// word for 圆满, never in a formal table. Saves from the three-step ladder
// (before 2026-10-03) and the nine-层 one (10-03 → 10-09) are carried over
// exactly (state.mjs v6 threeToNine, v7 nineToThree). 法宝 and 本命法宝 begin
// at 结丹. The 筑基丹 is sold nowhere: 全观一年一颗.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, fullName, migrate, newState, nineToThree, paceLayer, peakName, phaseName, realmName, stepName, threeToNine } from '../scripts/state.mjs';
import { boundOf, growTreasure, treasureBrief } from '../scripts/rules/arms.mjs';
import { look, seclude } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-03T12:00:00');
// The three steps as they stood before 2026-10-03 and stand again since 2026-10-09.
const THREE = { foundation: [400, 500, 600], core: [800, 1000, 1200], nascent: [1600, 2000, 2400], deity: [3000, 3600, 4200], void: [5000, 6000, 7000], body: [8000, 9500, 11000], maha: [12500, 14500, 16500], tribulation: [19000, 22000, 25000] };
const pos = ({ step, progress }) => ({ step, progress });

test('练气 has 零层 and nine 层 above it in three phases; every realm above it three steps, 小成 中成 大成; a step filled is 圆满', () => {
  const { tiers, phases, full, layers_were } = content.ladder;
  assert.deepEqual(phases, { zh: ['小成', '中成', '大成'], en: ['Lesser Attainment', 'Middle Attainment', 'Greater Attainment'] });
  assert.deepEqual(full, { zh: '圆满', en: 'Consummation' });
  const [qi, ...above] = tiers;
  // 零层 (Hanli, 2026-10-15): step 0, threshold 0 — no 修为 until the 小周天 lifts him to 一层.
  assert.equal(qi.zero, true);
  assert.equal(qi.thresholds.length, 10);
  assert.equal(qi.thresholds[0], 0);
  assert.deepEqual(qi.steps.zh, ['零层', '一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层']);
  assert.deepEqual(qi.steps.en.slice(0, 2), ['Layer 0', 'Layer 1']);
  for (let i = 2; i < 10; i += 1) assert.ok(qi.thresholds[i] > qi.thresholds[i - 1], `练气 层 ${i} asks more than 层 ${i - 1}`);
  for (const t of above) {
    assert.deepEqual(t.steps, content.ladder.phases, `${t.id}: its steps are the phases`);
    // The three steps it had until state v13 (2026-10-27: the master table's numbers since, balance.json `master`).
    const was = t.thresholds_were['13'];
    assert.deepEqual(was, THREE[t.id], `${t.id}: the three steps`);
    assert.ok(t.thresholds.every((n, k) => k === 0 || n > t.thresholds[k - 1]), `${t.id}: each step more than the one before`);
    // The nine 层 it had 10-03 → 10-09 sum, three by three, to those steps: a realm's whole never changed then.
    for (let p = 0; p < 3; p += 1) assert.equal(layers_were[t.id].slice(p * 3, p * 3 + 3).reduce((a, b) => a + b), was[p], `${t.id} step ${p}`);
  }
  assert.equal(phaseName(content, 'qi', 4, 'zh'), '练气中成', '四层 is 练气中成');
  assert.equal(phaseName(content, 'qi', 3, 'zh'), '练气小成', '三层 is 练气小成');
  assert.equal(phaseName(content, 'qi', 7, 'zh'), '练气大成', '七层 is 练气大成');
  assert.equal(phaseName(content, 'qi', 9, 'zh'), '练气大成');
  assert.equal(phaseName(content, 'qi', 0, 'zh'), '练气零层', '零层 is before the phases');
  assert.equal(stepName(content, 'qi', 0, 'en'), 'Qi Condensation · Layer 0');
  assert.equal(phaseName(content, 'foundation', 0, 'zh'), '筑基小成');
  assert.equal(phaseName(content, 'core', 2, 'en'), 'Core Formation · Greater Attainment');
  assert.equal(stepName(content, 'foundation', 1, 'zh'), '筑基中成');
  assert.equal(stepName(content, 'qi', 4, 'zh'), '练气四层');
  // 圆满 is the full point of any step; the realm's last, short, is the breakthrough's `from`.
  assert.equal(fullName(content, 'qi', 2, 'zh'), '练气二层圆满');
  assert.equal(fullName(content, 'foundation', 1, 'zh'), '筑基中成圆满');
  assert.equal(fullName(content, 'foundation', 2, 'en'), 'Foundation Establishment · Greater Attainment, Consummation');
  assert.equal(peakName(content, 'foundation', 'zh'), '筑基圆满');
  assert.equal(peakName(content, 'qi', 'zh'), '练气圆满');
  assert.equal(realmName(content, { tier: 'qi', step: 2, progress: qi.thresholds[2] - 1 }, 'zh'), '练气二层');
  assert.equal(realmName(content, { tier: 'qi', step: 2, progress: qi.thresholds[2] }, 'zh'), '练气二层圆满');
  assert.equal(realmName(content, { tier: 'qi', step: 0, progress: 0 }, 'zh'), '练气零层', '零层 is never 圆满');
  assert.equal(realmName(content, { tier: 'qi', step: 0, progress: 0 }, 'en'), 'Qi Condensation · Layer 0');
  assert.equal(realmName(content, { tier: 'foundation', step: 2, progress: content.ladder.tiers[1].thresholds[2] }, 'zh'), '筑基大成圆满');
  assert.doesNotMatch(JSON.stringify(content.ladder.tiers), /巅峰|大圆满/, '巅峰 is the spoken word for 圆满, never in a formal table');
  assert.doesNotMatch(JSON.stringify({ tiers, phases, full }), /初期|中期|后期/);
});

test('a save from the nine-层 ladder lands on the same 修为: 层 1–3 小成, 4–6 中成, 7–9 大成, the 层 passed added', () => {
  const at = (tier, step, progress) => nineToThree(content, { tier, step, progress, ladder9: true });
  assert.deepEqual(pos(at('core', 0, 222)), { step: 0, progress: 222 }, '结丹一层 · 222 is 结丹小成 · 222');
  assert.deepEqual(pos(at('foundation', 4, 50)), { step: 1, progress: 160 + 50 }, '筑基五层 · 50: 四层 passed');
  assert.deepEqual(pos(at('foundation', 2, 100)), { step: 0, progress: 128 + 133 + 100 });
  const filled = at('foundation', 8, 208);
  assert.deepEqual(pos(filled), { step: 2, progress: 600 }, '筑基九层 filled is 筑基圆满');
  // …on the ladder it was played on; v13 (paceLayer) reads it onto the master table's, 圆满 still.
  assert.equal(realmName(content, paceLayer(content, { ...filled, ladder_pace: 13 }), 'zh'), '筑基大成圆满');
  assert.equal('ladder9' in filled, false);
  // 练气 always had nine: untouched.
  assert.deepEqual(pos(at('qi', 5, 40)), { step: 5, progress: 40 });
  // Through migrate: a v6 save is marked; meeting the world carries it, once.
  const old = { ...newState(content, 'zh', NOW), version: 6, chapter: '03-qing', scene: '03-cauldron', place: 'liubo', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'core', step: 7, progress: 300 };
  const marked = migrate(old);
  assert.equal(marked.ladder9, true);
  const fitted = migrate(marked, content);
  assert.equal(fitted.ladder9, undefined);
  // …and v13 (paceLayer) reads that bar onto the master table's 结丹大成, as full as it stood.
  const core = content.ladder.tiers.find(t => t.id === 'core'), v13 = n => Math.round(n * core.thresholds[2] / core.thresholds_were['13'][2]);
  assert.deepEqual(pos(fitted), { step: 2, progress: v13(384 + 300) }, '结丹八层 · 300 is 结丹大成 · 七层 passed + 300');
  assert.deepEqual(fitWorld(fitted, content), fitted, 'fitting again changes nothing');
  assert.deepEqual(migrate(old, content), fitted, 'one call with the world does the same');
});

test('a save from the three-step ladder (before 2026-10-03) needs nothing: its steps are the steps again', () => {
  const old = { ...newState(content, 'zh', NOW), version: 5, chapter: '03-qing', scene: '03-cauldron', place: 'liubo', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'core', step: 2, progress: 1100 };
  const marked = migrate(old);
  assert.equal(marked.ladder3, true);
  assert.equal('ladder9' in marked, false, 'never taken for a nine-层 save');
  const fitted = migrate(marked, content);
  assert.equal('ladder3' in fitted, false);
  const core = content.ladder.tiers.find(t => t.id === 'core');
  assert.deepEqual(pos(fitted), { step: 2, progress: Math.round(1100 * core.thresholds[2] / core.thresholds_were['13'][2]) }, 'its bar as full as it stood (v13)');
  assert.deepEqual(pos(threeToNine(content, { tier: 'foundation', step: 1, progress: 250, ladder3: true })), { step: 1, progress: 250 });
});

test('no shelf sells the 筑基丹: 全观一年一颗 — the item stays, a gift or the sect\'s', () => {
  for (const id of ['foundation-pill', 'foundation-pill-9']) {
    const item = content.items.items.find(i => i.id === id);
    assert.ok(item, `${id} kept`);
    assert.deepEqual(item.sold ?? [], [], `${id} on no market`);
  }
  for (const i of content.items.items) assert.ok(!/筑基丹/.test(i.name.zh) || !(i.sold ?? []).length, `${i.id} sells a 筑基丹`);
});

test('法宝 begin at 结丹: below it a treasure held is kept but does not show, grow or temper', () => {
  const treasure = { name: '青萍', base: 3, element: 'metal', level: 2 };
  const below = { ...newState(content, 'zh', NOW), tier: 'foundation', step: 2, progress: 0, treasure };
  const at = { ...below, tier: 'core', step: 0 };
  assert.equal(boundOf(content, below), null);
  assert.equal(treasureBrief(content, below), null);
  assert.equal(growTreasure(content, structuredClone(below), 'chapter'), null, 'the story does not grow it yet');
  assert.ok(boundOf(content, at));
  assert.equal(treasureBrief(content, at).level, 2);
  const grown = structuredClone(at);
  if ((content.rewards.growth?.treasure?.chapter ?? 0) > 0) assert.ok(growTreasure(content, grown, 'chapter'), 'from 结丹 it grows');
  const ctx = { now: NOW, quests: [] };
  assert.equal(look(below, content, ctx).treasure, null);
  assert.equal(seclude(below, content, ctx, { action: 'enter', focus: 'treasure' }).result.refused, 'no-treasure', 'no 温养 below 结丹');
});
