// 丹药 in the game (design.md § 丹药; story DESIGN § 六·五): every pill its 阶 and 转, the 修为 it pays on one tamed
// curve (balance.json `pills` — never the story's ×9 and ×10); 丹毒, the turns a pill's furnace left out, owed off
// the top of the 体力 pool until 闭关 makes them up (补转) or a 九转 clears them; the furnace's 破境丹 one 阶 above
// its owner (fantong.json `breach`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { byZhuan } from '../tools/master.mjs';
import { rateOfLevel } from '../scripts/rules/playpay.mjs';
import { hpMaxOf } from '../scripts/rules/cards.mjs';
import { awayFit, newState, settleStamina, staminaMax } from '../scripts/state.mjs';
import { look, trade, VERBS } from '../scripts/rules.mjs';
import { rollFeed, chances } from '../scripts/rules/fantong.mjs';
import { cureDandu, eatPill } from '../scripts/rules/dandu.mjs';
import { paysOf } from '../scripts/rules/core.mjs';
import { capLook } from '../scripts/rules/cap.mjs';
import { effectGrant } from '../scripts/rules/errands.mjs';

const content = loadContent();
const T0 = new Date('2026-10-21T20:00:00');
const at = h => new Date(T0.getTime() + h * 3600_000);
const ctx = (now = T0) => ({ now, quests: [] });
const item = id => content.items.items.find(i => i.id === id);
const pills = content.items.items.filter(i => i.kind === 'pill');
const D = content.balance.dandu;

/* A 练气 player in the 观 with pills in the bag and the pool full. */
const player = (extra = {}) => ({
  ...newState(content, 'zh', T0), name: '清玄', traits: ['metal', 'wood', 'water', 'fire', 'earth'], tier: 'qi', step: 5, progress: 10,
  chapter: '00-zhuji', scene: null, place: 'houshan', ended: ['00-prologue', '00-waimen'],
  bag: { 'qi-pill': 6, 'qi-pill-9': 1, 'qi-pill-3': 1 }, stamina: content.rewards.stamina.max, stamina_at: T0.toISOString(), ...extra,
});
const eat = (s, id, now = T0) => {
  const r = trade(s, content, ctx(now), { action: 'use', id });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  return r;
};

test('every pill says its 阶, its 转 and its level; a family pays by its level (batch 2: 「丹药, 物品都给一个级别吧」) — 聚气 share × need, 回春 a share of his 气血 there', () => {
  // (仙丹, 仙阶: a 阶 off the ladder and no 转 — tests/xiandan.test.mjs.)
  for (const p of pills.filter(x => x.tier !== 'xian')) {
    assert.ok(content.ladder.tiers.some(t => t.id === p.tier), `${p.id} has a 阶`);
    assert.ok(p.zhuan >= 1 && p.zhuan <= 9, `${p.id} has a 转`);
    assert.ok(p.level >= 1 && p.level <= 81, `${p.id} has a level`);
  }
  // 聚气 (`qi`): share[转] × need(its level), folded as units at R of that level (one night of 闭关 at 练气一层 is 20).
  const P = content.balance.master.pills, need = L => content.ladder.tiers[Math.floor((L - 1) / 9)].thresholds[L - Math.floor((L - 1) / 9) * 9 - (Math.floor((L - 1) / 9) ? 1 : 0)];
  const R = L => rateOfLevel(content, L), share = byZhuan(P.families.qi.share);
  assert.deepEqual([share[0], share[2], share[5], share[8]], [0.0109, 0.0291, 0.0582, 0.1091], 'today\'s 0.3 · 0.8 · 1.6 · 3 nights at 练气一层 (× 20 ÷ 550)');
  for (const id of ['qi-pill', 'qi-pill-2', 'qi-pill-3', 'qi-pill-9']) {
    const i = item(id);
    assert.ok(Math.abs(i.effect.units * R(i.level) - share[i.zhuan - 1] * need(i.level)) < 0.01, `${id}: share × need(${i.level})`);
    assert.equal(i.effect.level, i.level);
  }
  // 九转 is ten 一转s (the shares), at the same level.
  assert.ok(Math.abs(share[8] / share[0] - 10) < 0.05);
  // 回春 (`mend`): heals in a fight — share × his 气血 at its level; 修为 only from the 聚气 family (and the 九转回春丹's declared exception).
  const mend = byZhuan(P.families.mend.share);
  for (const id of ['mend-pill', 'mend-pill-3', 'mend-pill-9']) {
    const i = item(id), hp = hpMaxOf({ tier: 'qi', step: i.level }, content);
    assert.equal(i.effect.fight.heal, Math.max(1, Math.round(mend[i.zhuan - 1] * hp)), id);
  }
  assert.deepEqual([item('mend-pill').effect.fight, item('huiqi-pill').effect.fight], [{ heal: 10 }, { mana: 3 }], 'the shop\'s 一转 heals 10 at 练气一层, as it did');
  assert.equal(item('mend-pill-3').effect.units, undefined, '三转回春丹 heals, no 修为');
  assert.ok(P.exceptions['mend-pill-9'].why.length > 20 && item('mend-pill-9').effect.units > 0, '九转回春丹: its small 修为 a declared exception, with its why');
  for (const p of pills.filter(x => x.of && x.effect.units)) assert.ok(!('progress' in p.effect), `${p.id}: a size, no 修为 number`);
  assert.deepEqual(lint(content).filter(x => /pill|阶|转/.test(x)), []);
});

test('a 修为 pill eaten pays its level\'s number wherever he eats it — a low pill stays what it is (the old quarter a realm past its 阶 is gone)', () => {
  const at = (tier, step) => ({ ...newState(content, 'zh', new Date('2026-10-27T12:00:00')), chapter: '00-waimen', ended: ['00-prologue'], done_scenes: ['wm-zhoutian'], tier, step, progress: 0, traits: ['wood', 'water', 'fire', 'earth', 'metal'] });
  const e = item('qi-pill').effect, want = Math.round(e.units * rateOfLevel(content, e.level));
  assert.equal(want, 6, '一转聚气丹: 6 at 练气一层, its level');
  for (const [tier, step] of [['qi', 1], ['qi', 4], ['qi', 9], ['foundation', 0]]) assert.equal(paysOf(content, at(tier, step), new Date(), effectGrant(e)).progress, want, `${tier}${step}`);
});

test('the lint refuses a pill with no 阶 or 转, or of an unknown family', () => {
  const bad = { ...content, items: { ...content.items, items: content.items.items.map(i => (i.id === 'qi-pill-3' ? { ...i, tier: 'nope', zhuan: 12, of: 'x' } : i)) } };
  const out = lint(bad).filter(x => x.startsWith('item qi-pill-3'));
  assert.equal(out.length, 3, out.join('\n'));
});

test('丹毒: a 一转 聚气丹 owes eight turns — the 体力 pool\'s top drops by eight; Look says it in the world\'s words', () => {
  const r = eat(player(), 'qi-pill');
  assert.deepEqual([r.result.dandu.owed, r.state.dandu], [8, 8]);
  assert.equal(staminaMax(content, r.state), content.rewards.stamina.max - 8);
  const l = look(r.state, content, ctx());
  assert.equal(l.stamina.max, content.rewards.stamina.max - 8);
  assert.equal(l.stamina.top, content.rewards.stamina.max);
  assert.equal(l.dandu.turns, 8);
  assert.match(l.dandu.say, /丹毒.*八|丹毒.*8/);
  // The pool already full stands at the lower top once settled.
  const s = structuredClone(r.state);
  settleStamina(content, s, at(0.1));
  assert.equal(s.stamina, content.rewards.stamina.max - 8);
});

test('丹毒 adds up to the cap; a 三转 owes six; a 九转 clears every turn owed (九转反能化毒)', () => {
  let s = player();
  for (let i = 0; i < 6; i++) s = eat(s, 'qi-pill').state;
  assert.equal(s.dandu, 48);
  assert.equal(staminaMax(content, s), content.rewards.stamina.max - D.cap, 'never more than the cap off the top');
  s = eat(s, 'qi-pill-3').state;
  assert.equal(s.dandu, 54);
  const r = eat(s, 'qi-pill-9');
  assert.deepEqual(r.result.dandu.cleared, 54);
  assert.equal(r.state.dandu, undefined);
  assert.equal(staminaMax(content, r.state), content.rewards.stamina.max);
});

test('闭关 is 补转: the body makes up four turns an hour, whatever the focus; a night clears a handful of pills', () => {
  let s = player();
  for (let i = 0; i < 3; i++) s = eat(s, 'qi-pill').state;
  const seclude = (st, now, args) => VERBS.seclude(st, content, ctx(now), args);
  const inn = seclude(s, T0, { action: 'enter', focus: 'progress' });
  assert.equal(inn.result.ok, true, JSON.stringify(inn.result));
  const out = seclude(inn.state, at(2), { action: 'leave' });
  assert.deepEqual(out.result.emerged.buzhuan, { made: 8, left: 16 });
  assert.equal(out.state.dandu, 16);
  // A night's sitting (8 h): the rest made up, and the pool rests to its whole top.
  const inn2 = seclude(out.state, at(2), { action: 'enter', focus: 'progress' });
  const out2 = seclude(inn2.state, at(10), { action: 'leave' });
  assert.equal(out2.state.dandu, undefined);
  assert.equal(out2.state.stamina, content.rewards.stamina.max);
});

test('the 闭关 pill is eaten too: it owes its turns as the sitting starts, and the sitting makes them up', () => {
  const seclude = (st, now, args) => VERBS.seclude(st, content, ctx(now), args);
  const inn = seclude(player(), T0, { action: 'enter', focus: 'progress', pill: 'qi-pill' });
  assert.equal(inn.result.ok, true, JSON.stringify(inn.result));
  assert.equal(inn.state.dandu, 8);
  const out = seclude(inn.state, at(2), { action: 'leave' });
  assert.equal(out.state.dandu, undefined);
});

test('a spent pool rests to its lowered top, never past it — 丹毒 never keeps him resting for good', () => {
  // Six hours away (time away counts as 闭关 for 体力 — no clock refills it since 2026-11-02).
  const s = awayFit(content, { ...player({ stamina: 0, resting: true, dandu: 40 }), last_seen: T0.toISOString() }, at(6));
  const l = look(s, content, ctx(at(6)));
  assert.ok(content.rewards.stamina.rest <= l.stamina.max, 'what 闭关 brings back plays at once (Hanli 11-02: 「回多少就能玩多少」): no rest mark above the top');
  assert.ok(!l.stamina.resting, 'six hours on, the lowered pool is whole and he plays');
  assert.equal(l.director.pool, 'full', 'and Ling reads it as the page draws it — full, not empty (review 2026-10-21)');
});

test('eatPill and cureDandu: a pill of no 转 or a fight pill\'s door are not counted; hours under one turn make nothing up', () => {
  const s = player();
  assert.equal(eatPill(content, s, 'dingtai'), null, '鼎苔 is no pill');
  assert.equal(eatPill(content, s, 'qi-pill-9'), null, 'nothing owed, nothing cleared');
  eatPill(content, s, 'qi-pill');
  assert.equal(cureDandu(content, s, 0.2), 0);
  assert.equal(cureDandu(content, s, 1), 4);
  assert.equal(s.dandu, 4);
});

test('the furnace\'s 破境丹 is one 阶 above its owner: 筑基丹 while he is 练气, none once he has laid the foundation', () => {
  const t = content.fantong, pot = { ids: ['zixu-zhi', 'lingzhi', 'ginseng'], lingshi: 3, realm: 2.7 };
  const hui = { chapter: '00-zhuji', scene: '09-dabi', done_scenes: ['09-futian'] };
  const qi = { ...player(), ...hui };
  const fd = { ...player({ tier: 'foundation', step: 0 }), ...hui };
  const of = s => chances(t, { ...pot, content, state: s }).items;
  assert.ok(of(qi)['foundation-pill'] > 0 && of(qi)['foundation-pill-9'] > 0, '练气: the 筑基丹 rows are open');
  assert.ok(!of(fd)['foundation-pill'] && !of(fd)['foundation-pill-9'], '筑基: no 筑基丹 out of the pot');
  // And the roll itself never hands a 筑基 owner one, over many pots.
  for (let n = 0; n < 300; n++) {
    const r = rollFeed(t, { ...pot, seed: `breach|${n}`, content, state: fd, press: true });
    for (const o of r.outs) assert.ok(!/^foundation-pill/.test(o.out), o.out);
  }
});

test('圆满 (Hanli 11-03): a 修为 pill would pay nothing — the card says why, and eating it is refused, the pill kept', () => {
  const need = content.ladder.tiers.find(t => t.id === 'qi').thresholds[5];
  const s = player({ progress: need * 2 });
  const brief = look(s, content, ctx()).bag?.items?.find?.(i => i.id === 'qi-pill') ?? null;
  const r = trade(s, content, ctx(), { action: 'use', id: 'qi-pill' });
  if (paysOfFull(s)) {
    assert.equal(r.result.refused, 'xw-full', JSON.stringify(r.result));
    // At the 回's cap the line points to the story (Hanli 11-03, ladder.json caps.pill); else the generic 圆满 line.
    if (capLook(content, s, 'zh')) assert.equal(r.result.say, content.ladder.caps.pill.zh);
    else assert.match(r.result.say, /圆满/);
    assert.equal(s.bag['qi-pill'], 6, 'kept');
    if (brief?.effect) { assert.equal(brief.effect.full, true); assert.equal(Boolean(brief.effect.capped), Boolean(capLook(content, s, 'zh'))); }
  }
  // A 九转 with 丹毒 owed still goes down: it clears the turns.
  const owed = { ...s, dandu: 16 };
  assert.equal(trade(owed, content, ctx(), { action: 'use', id: 'qi-pill-9' }).result.ok, true);
});
function paysOfFull(s) {
  const e = item('qi-pill').effect;
  const p = paysOf(content, structuredClone(s), T0, effectGrant(e));
  assert.equal(p.full, true, 'the state is 圆满');
  return true;
}
