// The test-only 体力卡 (Hanli 2026-11-02: 「或者商店里加一个体力卡也行, 测试阶段物品, 正式上线后删除了」 · 「让体力卡重置冷却?」):
// bought cheap at the 沉鼎观's shops, used from the bag — the 体力 pool full at once and every cooldown cleared
// (rules/events.mjs resetCooldowns), the day's counts kept. Flagged `test`: doc/status.md § Before launch deletes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent, lint } from '../scripts/content.mjs';
import { newState, staminaMax } from '../scripts/state.mjs';
import { look, trade } from '../scripts/rules.mjs';
import { cooldownOwners, eventWait, onCooldownReset, resetCooldowns } from '../scripts/rules/events.mjs';
import { coolingUntil } from '../scripts/rules/breakthrough.mjs';

const content = loadContent();
const T0 = new Date('2026-11-02T15:00:00');
const HOUR = 3600_000;
const ctx = (now = T0) => ({ now, quests: [] });
const card = () => content.items.items.find(i => i.id === 'tili-ka');
const day = '2026-11-02';

/* 外门, past 小周天 (外门库房 open), standing in the stewards' hall with stones and a spent pool. */
const atStore = (extra = {}) => ({
  ...newState(content, 'zh', T0), name: '清玄', traits: ['metal', 'wood', 'water', 'fire', 'earth'], tier: 'qi', step: 3, progress: 0,
  chapter: '00-waimen', scene: null, place: 'zhishi', ended: ['00-prologue'], done_scenes: ['wm-zhoutian'],
  wealth: 100, stamina: 0, stamina_at: T0.toISOString(), resting: true, ...extra,
});
/* Every cooldown the world keeps, cooling: the three events just completed (妖兽出没 one fight into a batch is the
   batch's own progress), the 饭桶 just fed, the cauldron shut, a pool rested after its streak. */
const cooling = (s) => ({
  ...s,
  events: {
    shouchao: { at: T0.toISOString(), day, n: 2 },
    qiecuo: { at: T0.toISOString(), day, n: 1 },
    yaoshou: { at: new Date(T0 - 0.5 * HOUR).toISOString(), day, n: 1, taken: 1 },
  },
  fantong: { n: 4, at: T0.toISOString(), day, today: 2 },
  breakthrough: { tries: { foundation: 1 }, until: new Date(T0.getTime() + 6 * HOUR).toISOString() },
  duels: { 'hunt:houshan': { day, outcome: 'won', n: 5, at: T0.toISOString(), streak: 5, last: ['a', 'b'] } },
});

test('the 体力卡 is test-only, cheap, and on the shelves of the 沉鼎观 he passes', () => {
  const c = card();
  assert.equal(c.test, true);
  assert.match(c._about, /before launch/);
  assert.deepEqual(c.effect, { stamina: 'full', reset: 'cooldowns' });
  assert.ok(c.buy > 0 && c.buy <= 20, `cheap: ${c.buy} 灵石`);
  for (const place of ['zhishi', 'fangshi', 'yanwu', 'shiao']) {
    const p = Object.values(content.places).flatMap(d => d.places).find(x => x.id === place);
    const shelf = p.has.shop?.goods ?? p.has.visitor?.goods;
    assert.ok(shelf.includes('tili-ka'), place);
  }
  assert.deepEqual(lint(content), []);
});

test('bought at 外门库房 for its price; used, the pool is full and he rests no more', () => {
  const s = atStore();
  const bought = trade(s, content, ctx(), { action: 'buy', id: 'tili-ka' });
  assert.equal(bought.result.ok, true, JSON.stringify(bought.result));
  assert.equal(bought.state.wealth, 100 - card().buy);
  assert.equal(bought.state.bag['tili-ka'], 1);
  const used = trade(bought.state, content, ctx(), { action: 'use', id: 'tili-ka' });
  assert.equal(used.result.ok, true, JSON.stringify(used.result));
  assert.equal(used.state.stamina, staminaMax(content, used.state));
  assert.equal(used.state.stamina, content.rewards.stamina.max);
  assert.equal(used.result.stamina.gained, content.rewards.stamina.max);
  assert.equal(used.state.resting, undefined);
  assert.equal(used.state.bag['tili-ka'], undefined, 'spent');
  const l = look(used.state, content, ctx());
  assert.equal(l.stamina.now, l.stamina.max);
  assert.equal(l.stamina.empty, false);
  // Under 丹毒 the pool fills to its lowered top, never past it.
  const sick = trade({ ...bought.state, dandu: 8 }, content, ctx(), { action: 'use', id: 'tili-ka' });
  assert.equal(sick.state.stamina, content.rewards.stamina.max - 8);
  // The bag says it can be used.
  assert.ok(!trade(atStore(), content, ctx(), { action: 'use', id: 'tili-ka' }).result.ok, 'not in the bag: refused');
});

test('used, every cooldown clears — the events up now (a fresh 妖兽出没 batch), the 饭桶, the cauldron, a pool at rest — and the day\'s counts stay', () => {
  const s = cooling(atStore({ bag: { 'tili-ka': 1 } }));
  for (const id of ['shouchao', 'qiecuo', 'yaoshou']) assert.ok(eventWait(content, s, id, T0) > 0, `${id} cooling before`);
  assert.ok(coolingUntil(s, T0));
  const r = trade(s, content, ctx(), { action: 'use', id: 'tili-ka' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.deepEqual(new Set(r.result.reset), new Set(['events', 'fantong', 'breakthrough', 'pool-rest']));
  for (const id of ['shouchao', 'qiecuo', 'yaoshou']) assert.equal(eventWait(content, r.state, id, T0), 0, `${id} up now`);
  assert.deepEqual(r.state.events, { shouchao: { day, n: 2 }, qiecuo: { day, n: 1 }, yaoshou: { day, n: 1 } }, 'the clock and the batch let go, the day\'s counts kept');
  assert.deepEqual(r.state.fantong, { n: 4, day, today: 2 }, 'the 饭桶 hungry again; its feeds today kept (per_day is a day limit)');
  assert.deepEqual(r.state.breakthrough, { tries: { foundation: 1 } });
  assert.equal(coolingUntil(r.state, T0), null);
  assert.deepEqual(r.state.duels['hunt:houshan'], { day, outcome: 'won', n: 5, at: T0.toISOString(), streak: 0, last: ['a', 'b'] });
  assert.deepEqual(look(r.state, content, ctx()).waits ?? [], [], 'Look waits on nothing');
});

test('a shouchao clock from before rules/events.mjs clears too; nothing cooling, nothing cleared', () => {
  const tide = (content.tasks?.tasks ?? []).find(t => t.shouchao);
  const old = { ...atStore(), shouchao: { at: T0.toISOString(), day: { key: day, count: 2 } }, tasks: { [tide.id]: { status: 'done', done_at: T0.toISOString() } } };
  assert.ok(eventWait(content, { ...old, events: { shouchao: { at: T0.toISOString() } } }, 'shouchao', T0) > 0);
  const s = structuredClone(old);
  assert.deepEqual(resetCooldowns(content, s, T0), ['shouchao-clock']);
  assert.deepEqual(s.events.shouchao, { day, n: 2 });
  const calm = structuredClone(atStore());
  assert.deepEqual(resetCooldowns(content, calm, T0), []);
});

test('the reset is one hook a new cooldown registers with; the lint holds the effect\'s shape', () => {
  for (const name of ['events', 'pool-rest', 'fantong', 'breakthrough', 'shouchao-clock']) assert.ok(cooldownOwners().includes(name), name);
  let seen = null;
  onCooldownReset('test-owner', (c, state) => { seen = state.mark; state.mark = 'cleared'; return true; });
  const s = { mark: 'cooling' };
  assert.ok(resetCooldowns(content, s, T0).includes('test-owner'));
  assert.equal(seen, 'cooling');
  assert.equal(s.mark, 'cleared');
  const withItem = patch => ({ ...content, items: { ...content.items, items: content.items.items.map(i => (i.id === 'tili-ka' ? { ...i, ...patch } : i)) } });
  assert.ok(lint(withItem({ effect: { stamina: 'half' } })).some(x => /stamina is full/.test(x)));
  assert.ok(lint(withItem({ effect: { reset: 'cooldowns' } })).some(x => /reset is cooldowns/.test(x)));
  assert.ok(lint(withItem({ _about: 'a card' })).some(x => /before launch/.test(x)));
});
