// The breakthrough throw's numbers are the master's (batch 2, Hanli 2026-11-10: 「所有和数值相关的都应该有公式推到」):
// balance.json master.breakthrough → `breakthrough` (tools/master.mjs breakthroughOf), laid onto ladder.json's (which keeps
// the pills, the elements and the 段's factors) at load. Re-expressed, never retuned: the table it makes is the one that stood.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { breakthroughOf, zhuanBonus } from '../tools/master.mjs';

const content = loadContent();
// ladder.json's breakthrough on main before batch 2 (its numbers).
const WAS = {
  base: { foundation: 10, core: 55, nascent: 50, deity: 45, void: 40, body: 40, maha: 35, tribulation: 30 },
  floor: 5, cap: 95, low: 50,
  pill: { bonus: 20, bonus_of: { dingtai: 10 }, by_zhuan: { 1: 25, 2: 30, 3: 35, 4: 45, 5: 50, 6: 55, 7: 65, 8: 70, 9: 80 } },
  body: { share: 0.5, whole: 5, hurt: -10 }, seclusion: { hours: 24, bonus: 10 }, her: { joined: 5, per_gift: 3 },
  element: { match: 10, feeds: 5 }, fail: { wound: 0.3, progress: 0.3, cooldown_hours: 6 }, duan: { base: 75, cooldown_hours: 1 },
};

test('the throw as the master makes it is the table that stood: base by realm, a pill by 转, every factor', () => {
  const b = content.ladder.breakthrough;
  assert.deepEqual(b.base, WAS.base);
  assert.deepEqual(Object.fromEntries(Object.entries(b.pill.by_zhuan).map(([k, v]) => [Number(k), v])), WAS.pill.by_zhuan);
  for (const k of ['floor', 'cap', 'low']) assert.equal(b[k], WAS[k], k);
  for (const k of ['body', 'seclusion', 'her', 'fail']) assert.deepEqual(b[k], WAS[k], k);
  assert.deepEqual([b.pill.bonus, b.pill.bonus_of], [WAS.pill.bonus, WAS.pill.bonus_of]);
  assert.deepEqual([b.element.match, b.element.feeds, b.duan.base, b.duan.cooldown_hours], [10, 5, 75, 1]);
  // …and ladder.json's own parts still there.
  assert.ok(b.pill.items.foundation.includes('foundation-pill-9') && b.element.of.foundation === 'earth' && b.duan.factors.length === 4);
});

test('the formulas: 筑基 its own, then 55 less 5 a realm with 体修 level with 炼虚; a pill 25 + 5 a 转 + 5 a 品 + 5 for a 九转', () => {
  const B = content.balance.master.breakthrough;
  assert.deepEqual(breakthroughOf(B, content.ladder.tiers.map(t => t.id)).base, WAS.base);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => zhuanBonus(B, z)), [25, 30, 35, 45, 50, 55, 65, 70, 80]);
  // A knob moves the curve: one more a 转 lifts every 转 above the first.
  assert.equal(zhuanBonus({ ...B, pill: { ...B.pill, zhuan: { ...B.pill.zhuan, step: 6 } } }, 9), 88);
});
