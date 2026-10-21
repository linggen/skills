// 丹药 in the game (design.md § 丹药; story DESIGN § 六·五): every pill its 阶 and 转, the 修为 it pays on one tamed
// curve (balance.json `pills` — never the story's ×9 and ×10); 丹毒, the turns a pill's furnace left out, owed off
// the top of the 体力 pool until 闭关 makes them up (补转) or a 九转 clears them; the furnace's 破境丹 one 阶 above
// its owner (fantong.json `breach`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint, pillPay } from '../scripts/content.mjs';
import { newState, settleStamina, staminaMax } from '../scripts/state.mjs';
import { look, trade, VERBS } from '../scripts/rules.mjs';
import { rollFeed, chances } from '../scripts/rules/fantong.mjs';
import { cureDandu, eatPill } from '../scripts/rules/dandu.mjs';

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
  bag: { 'qi-pill': 6, 'qi-pill-9': 1, 'qi-pill-3': 1 }, stamina: 100, stamina_at: T0.toISOString(), ...extra,
});
const eat = (s, id, now = T0) => {
  const r = trade(s, content, ctx(now), { action: 'use', id });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  return r;
};

test('every pill says its 阶 and its 转; a family\'s 修为 is the curve — 一转 20 · 三转 30 · 九转 60, the numbers the game had', () => {
  for (const p of pills) {
    assert.ok(content.ladder.tiers.some(t => t.id === p.tier), `${p.id} has a 阶`);
    assert.ok(p.zhuan >= 1 && p.zhuan <= 9, `${p.id} has a 转`);
  }
  assert.deepEqual(['qi-pill', 'qi-pill-3', 'qi-pill-9', 'mend-pill-3', 'mend-pill-9'].map(id => item(id).effect.progress), [20, 30, 60, 30, 60]);
  // Tamed: a 九转 is three 一转s, never 9⁸; a 阶 above adds one 一阶's worth, never ×10.
  assert.equal(pillPay(content.balance, { of: 'qi', zhuan: 9, tier: 'qi' }), 3 * pillPay(content.balance, { of: 'qi', zhuan: 1, tier: 'qi' }));
  assert.equal(pillPay(content.balance, { of: 'qi', zhuan: 1, tier: 'foundation' }), 2 * pillPay(content.balance, { of: 'qi', zhuan: 1, tier: 'qi' }));
  // Each within its table's cap, and the fight pills keep their own numbers (the 丹囊 bands).
  for (const p of pills.filter(x => x.of)) assert.ok(p.effect.progress <= content.rewards.tables[p.effect.table].progress, p.id);
  assert.deepEqual([item('mend-pill').effect.fight, item('huiqi-pill').effect.fight], [{ heal: 10 }, { mana: 3 }]);
  assert.deepEqual(lint(content).filter(x => /pill|阶|转/.test(x)), []);
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
  const s = { ...player({ stamina: 0, resting: true, dandu: 40 }) };
  const l = look(s, content, ctx(at(6)));
  assert.ok(l.stamina.max < content.rewards.stamina.rest, 'the top is under the rest mark');
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
