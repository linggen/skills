// 仙丹 (design.md § 丹药 【已建】; story DESIGN § 六·五: 九转之上是仙丹 — 不分境界，仙气自己找路；没有纹，自己发光):
// 仙阶, a 阶 off the ladder with no 转; its own share of its level's need (master.pills `xian`, batch 2), the same at every
// realm; it clears 丹毒 as a 九转; the 饭桶 gives one only once 卷一's last scene is done (a pool row with `after`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint, offLadderTier } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { trade } from '../scripts/rules.mjs';
import { eatPill } from '../scripts/rules/dandu.mjs';
import { fantongAll, rollFeed } from '../scripts/rules/fantong.mjs';
import { paysOf } from '../scripts/rules/core.mjs';
import { rateOfLevel } from '../scripts/rules/playpay.mjs';

const content = loadContent();
const T0 = new Date('2026-10-31T20:00:00');
const ctx = () => ({ now: T0, quests: [] });
const XIAN = content.items.items.find(i => i.id === 'xian-pill');
const save = (extra = {}) => ({
  ...newState(content, 'zh', T0), name: '清玄', traits: ['metal', 'wood', 'water', 'fire', 'earth'], tier: 'qi', step: 3, progress: 0,
  chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'], stamina: 100, stamina_at: T0.toISOString(), ...extra,
});

test('仙丹 is 仙阶: off the ladder, no 转, a 修为 pill of the 聚气 family; the lint passes it and refuses a 转 on it', () => {
  assert.ok(XIAN);
  assert.equal(XIAN.tier, 'xian');
  assert.equal(XIAN.zhuan, undefined);
  assert.ok(offLadderTier(content, 'xian'));
  assert.ok(!offLadderTier(content, 'qi'));
  assert.deepEqual(lint(content).filter(x => /xian|仙/.test(x)), []);
  const bad = { ...content, items: { ...content.items, items: content.items.items.map(i => (i.id === 'xian-pill' ? { ...i, zhuan: 9 } : i)) } };
  assert.ok(lint(bad).some(x => /xian-pill/.test(x) && /转/.test(x)), 'a 转 on a 仙丹 is refused');
  const off = { ...content, items: { ...content.items, items: content.items.items.map(i => (i.id === 'qi-pill-3' ? { ...i, tier: 'heaven' } : i)) } };
  assert.ok(lint(off).some(x => /qi-pill-3/.test(x)), 'an unknown 阶 off the ladder is still refused');
});

test('its pay: its own share (master.pills.xian) of its level\'s need, above a 九转\'s; the same wherever he eats it, 练气 or 筑基', () => {
  const P = content.balance.master.pills, e = XIAN.effect;
  assert.ok(P.xian > P.families.qi.share['9'], 'above 九转');
  // At its level (筑基一层, L10: the 饭桶 row opens after 卷一's last scene): share × need(10), as units at R(10).
  const need = content.ladder.tiers[1].thresholds[0];
  assert.equal(e.level, 10);
  assert.ok(Math.abs(e.units * rateOfLevel(content, 10) - P.xian * need) < 0.01);
  for (const [tier, step] of [['qi', 3], ['foundation', 0], ['foundation', 5]]) {
    const got = paysOf(content, save({ tier, step }), T0, { table: e.table, units: e.units, tier: e.tier, at_level: e.level }).progress;
    assert.equal(got, Math.round(P.xian * need), `${tier} ${step}: the whole of it`);
  }
});

test('eaten at any realm, it clears every turn of 丹毒 owed, as a 九转 does; on an empty account it owes nothing', () => {
  const s = save({ bag: { 'xian-pill': 1 }, dandu: 14 });
  const r = trade(s, content, ctx(), { action: 'use', id: 'xian-pill' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.ok(r.result.paid.progress > 0);
  assert.equal(r.state.dandu, undefined);
  assert.deepEqual(r.result.dandu.cleared, 14);
  const clean = save();
  assert.equal(eatPill(content, clean, 'xian-pill'), null);
  assert.equal(clean.dandu, undefined);
});

test('the 饭桶: no 仙丹 in 卷一 — its book row opens only once 01-end is done', () => {
  const row = content.fantong.book.rows.find(r => r.item === 'xian-pill');
  assert.equal(row.after, '01-end');
  assert.ok(content.chapters['01-ji'].scenes['01-end'], '卷一\'s last scene');
  const before = save({ bag: { danlu: 1 }, done_scenes: ['09-laba'] }), after = save({ bag: { danlu: 1 }, done_scenes: ['09-laba', '01-end'] });
  assert.ok(!fantongAll(content.fantong, content, before).includes('xian-pill'), 'not in 卷一\'s 图鉴');
  assert.ok(fantongAll(content.fantong, content, after).includes('xian-pill'), 'after 卷一');
  // Rolled a thousand pots of the best herbs before 01-end: never one.
  const pot = { ids: ['lingzhi', 'ginseng', 'heshouwu'], lingshi: 3, realm: 2.7, press: true };
  for (let n = 0; n < 1000; n++) {
    const r = rollFeed(content.fantong, { ...pot, seed: `x${n}`, content, state: before });
    assert.ok(!r.outs.some(o => o.out === 'xian-pill'), `pot ${n}`);
  }
});

test('the pouch shows it glowing, with no 纹', async () => {
  const { gearBrief } = await import('../scripts/rules/errands.mjs');
  const g = gearBrief(content, save({ bag: { 'xian-pill': 1, 'qi-pill-9': 1 } }), T0);
  const x = g.bag.find(i => i.id === 'xian-pill'), nine = g.bag.find(i => i.id === 'qi-pill-9');
  assert.equal(x.glow, true);
  assert.equal(x.zhuan, undefined);
  assert.equal(nine.glow, undefined);
  const { pouchHtml } = await import('../scripts/pouch.js');
  assert.equal(typeof pouchHtml, 'function');
});
