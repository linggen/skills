// The ladder follows 凡人 (story DESIGN § 道统, 2026-10-03), with our one
// exception declared: every realm has nine 层 — 一至三层 初期, 四至六层 中期,
// 七至九层 后期 — and the ninth filled is 大圆满, the formal word, the one state
// a breakthrough is tried from. Saves from the three-step ladder are carried
// over exactly (state.mjs v6, threeToNine). 法宝 and 本命法宝 begin at 结丹.
// The 筑基丹 is sold nowhere: 全观一年一颗.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { fitWorld, migrate, newState, peakName, phaseName, stepName, threeToNine } from '../scripts/state.mjs';
import { boundOf, growTreasure, treasureBrief } from '../scripts/rules/arms.mjs';
import { look, seclude } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-10-03T12:00:00');
const OLD = { foundation: [400, 500, 600], core: [800, 1000, 1200], nascent: [1600, 2000, 2400], deity: [3000, 3600, 4200], void: [5000, 6000, 7000], body: [8000, 9500, 11000], maha: [12500, 14500, 16500], tribulation: [19000, 22000, 25000] };

test('every realm has nine 层, rising, in three phases of three, with 大圆满 its formal top', () => {
  const { tiers, phases, peak } = content.ladder;
  assert.deepEqual(phases, { zh: ['初期', '中期', '后期'], en: ['Early', 'Middle', 'Late'] });
  assert.deepEqual(peak, { zh: '大圆满', en: 'Great Perfection' });
  for (const t of tiers) {
    assert.equal(t.thresholds.length, 9, t.id);
    assert.equal(t.steps.zh.length, 9, t.id);
    assert.equal(t.steps.en.length, 9, t.id);
    assert.deepEqual(t.steps.zh, ['一层', '二层', '三层', '四层', '五层', '六层', '七层', '八层', '九层'], t.id);
    for (let i = 1; i < 9; i += 1) assert.ok(t.thresholds[i] > t.thresholds[i - 1], `${t.id} 层 ${i + 1} asks more than 层 ${i}`);
    // Each old step became three 层 summing to it: a realm's whole stays as it was.
    if (OLD[t.id]) for (let p = 0; p < 3; p += 1) assert.equal(t.thresholds.slice(p * 3, p * 3 + 3).reduce((a, b) => a + b), OLD[t.id][p], `${t.id} phase ${p}`);
  }
  assert.equal(phaseName(content, 'foundation', 0, 'zh'), '筑基初期');
  assert.equal(phaseName(content, 'foundation', 3, 'zh'), '筑基中期');
  assert.equal(phaseName(content, 'qi', 3, 'zh'), '练气中期', '四层 is 练气中期');
  assert.equal(phaseName(content, 'core', 8, 'en'), 'Core Formation · Late');
  assert.equal(stepName(content, 'foundation', 3, 'zh'), '筑基四层');
  assert.equal(peakName(content, 'qi', 'zh'), '练气大圆满');
  assert.doesNotMatch(JSON.stringify(content.ladder.tiers), /巅峰/, '巅峰 is only colloquial, never in a formal table');
});

test('a save from the three-step ladder lands on the same 修为: an old 后期 at its peak is 九层, filled', () => {
  const at = (tier, step, progress) => threeToNine(content, { tier, step, progress, ladder3: true });
  const peak = at('foundation', 2, 600);
  assert.deepEqual([peak.step, peak.progress], [8, content.ladder.tiers[1].thresholds[8]], '大圆满');
  assert.equal('ladder3' in peak, false);
  assert.deepEqual((({ step, progress }) => ({ step, progress }))(at('foundation', 1, 250)), { step: 4, progress: 250 - 160 });
  assert.deepEqual((({ step, progress }) => ({ step, progress }))(at('core', 0, 0)), { step: 0, progress: 0 });
  // The first tier always had nine: untouched.
  assert.deepEqual((({ step, progress }) => ({ step, progress }))(at('qi', 5, 40)), { step: 5, progress: 40 });
  // Through migrate: without the world it is only marked; meeting the world carries it, once.
  const old = { ...newState(content, 'zh', NOW), version: 5, chapter: '03-qing', scene: '03-cauldron', place: 'liubo', ended: ['00-prologue', '01-ji', '02-yan'], tier: 'core', step: 2, progress: 1100 };
  const marked = migrate(old);
  assert.equal(marked.ladder3, true);
  const fitted = migrate(marked, content);
  assert.equal(fitted.ladder3, undefined);
  assert.equal(fitted.step, 8, 'old 后期 1100/1200: past 七层 (384) and 八层 (400), into 九层');
  assert.equal(fitted.progress, 1100 - 384 - 400);
  assert.deepEqual(fitWorld(fitted, content), fitted, 'fitting again changes nothing');
  assert.deepEqual(migrate(old, content), fitted, 'one call with the world does the same');
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
  const below = { ...newState(content, 'zh', NOW), tier: 'foundation', step: 8, progress: 0, treasure };
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
