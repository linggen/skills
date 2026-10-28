// AI mini-games (rules/aigames.mjs; design.md § AI mini-games, Hanli 2026-10-15):
// 砍价 (断案 cut 2026-10-27; the player-asks 二十问 cut 2026-10-28 — she guesses now, games/jinchat-play.js).
// The model talks and judges against a rubric; these check what the RULES own — the floor never in what the page
// or Ling reads, every count and limit, the clamp at the floor. The keeper's voice cannot be unit-tested: the live
// check plays a round.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, fitWorld, newState } from '../scripts/state.mjs';
import { forLing, look, playTo, VERBS } from '../scripts/rules.mjs';
import { stageCards } from '../scripts/stage.mjs';
import { cardHtml, WORDS } from '../scripts/cards.js';
import { topics, guideText } from '../scripts/rules/guide.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-10-15T09:00:00+08:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const nextDay = (n = 1) => ctx({ now: new Date(NOW.getTime() + n * 86400000) });

/* 古七's opening: 古四's case behind him, 银月 woken for the test (she sleeps in the token through 卷一). */
const base = (() => {
  const s = playTo(content, newState(content, 'zh', NOW), '古七', { now: NOW }).state;
  const { asleep, ...c } = s.companion;
  return { ...s, companion: { ...c, awake: true } };
})();
const at = (place, extra = {}) => ({ ...base, place, scene: null, ...extra });

/* Every key anywhere under `v`. */
const keysOf = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach(x => keysOf(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
};
const run = (verb, state, args, c = ctx()) => {
  const out = VERBS[verb](state, content, c, args);
  return { s: out.state ?? state, r: out.result };
};
const must = (verb, state, args, c) => {
  const out = run(verb, state, args, c);
  assert.equal(out.r.ok, true, `${verb} ${JSON.stringify(args)} → ${JSON.stringify(out.r).slice(0, 300)}`);
  return out;
};

/* ════════ 二十问 ════════ */

/* ════════ 二十问 (player asks) — cut 2026-10-28 ════════ */

test('the player-asks 二十问 is cut (Hanli 10-28: 「最好让AI提问」 · 「AI猜可以, 但别固定30种动物」): no verb, no card, no tool; old saves drop the day, keep 录\'s animals', () => {
  assert.equal(VERBS.twenty, undefined, 'no twenty verb');
  assert.equal(look(base, content, ctx()).twenty, undefined, 'Look carries none');
  assert.ok(!stageCards(look(base, content, ctx())).some((c) => c.card === 'twenty'), 'no stage card');
  assert.ok(!topics().includes('twenty'), 'no guide topic');
  assert.ok(!fs.existsSync(path.join(ROOT, 'guide/twenty.md')));
  assert.ok(!fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8').includes('  - name: Twenty\n'), 'no Twenty tool');
  const kept = fitWorld({ ...base, animals: ['fox'], twenty: { day: dayKey(NOW), played: 1, game: { round: 1, animal: 'cat', asked: [], guesses: [], outcome: null } } }, content);
  assert.equal(kept.twenty, undefined, 'an old save lets its open game go');
  assert.deepEqual(kept.animals, ['fox'], '录 keeps what it guessed');
  // The 游戏厅's 二十问 · 银月 is the reverse form, hers to ask: a jinchat chat, no stage of its own.
  const row = content.games.games.find((g) => g.group === 'ai' && g.name?.zh === '二十问 · 银月');
  assert.equal(row?.id, 'jinchat');
  assert.equal(row.data.chat, 'yinyue-twenty');
  assert.equal(row.stage, undefined);
  assert.ok(!content.games.games.some((g) => g.id === 'twenty'));
  // The table stays only as the offline fallback.
  assert.ok(content.aigames.twenty.reverse && content.aigames.twenty.animals.length);
  assert.equal(content.aigames.twenty.pay, undefined);
});

/* ════════ 砍价 — the shelf's own button (Hanli 2026-10-28) ════════ */

/* The pedlar up the mountain (演武场, every third day while 观内 holds him): a day he stands there. */
const H = [0, 1, 2].map(k => new Date(NOW.getTime() + k * 86400000)).find(now => look(at('yanwu'), content, { now, quests: [] }).haggle);
const hc = (extra = {}) => ctx({ now: H, ...extra });
const market = (extra = {}) => at('yanwu', { wealth: 500, bag: { ...base.bag }, ...extra });
const store = (extra = {}) => at('zhishi', { wealth: 500, bag: { ...base.bag }, haggle: undefined, ...extra });
const hrun = (verb, state, args, c = hc()) => run(verb, state, args, c);
const hmust = (verb, state, args, c = hc()) => must(verb, state, args, c);
const argIds = r => r.haggle.open.args.map(a => a.id);

test('砍价: the floor reaches no one — Look, the answer, the keeper\'s hidden line; 周衡 keeps the 执事堂\'s store', () => {
  const s0 = store();
  const l0 = look(s0, content, ctx());
  assert.equal(l0.haggle.keeper.name, '周衡');
  assert.match(l0.haggle.keeper.art, /zhouheng/);
  const { s, r } = must('haggle', s0, { action: 'open', id: 'caoren-zha' });
  // (a board's own art and lines elsewhere in Look may say `floor`: the haggle's part, and the answer, never do)
  for (const seen of [r, look(s, content, ctx()).haggle, forLing(look(s, content, ctx())).haggle]) assert.ok(!keysOf(seen).has('floor'));
  const floor = Math.ceil(60 * content.aigames.haggle.keepers.zhishi.floor);
  assert.ok(!r.talk.line.includes(String(floor)), 'the line never names the floor');
  assert.match(r.talk.line, /^\[HIDDEN\] \[npc\] /);
  assert.match(r.talk.line, /周衡/);
  assert.equal(r.haggle.open.ask, 60);
  assert.ok(r.haggle.open.offer.min < floor && r.haggle.open.offer.max === 59, 'the slider never shows where the floor is');
  // Every shop has someone to haggle with: a catalog market's 掌柜 (the `*` row).
  assert.ok(content.aigames.haggle.keepers['*']);
  // No stage card: the shelf is where it is played.
  assert.ok(!stageCards(look(s, content, ctx())).some(c => c.card === 'haggle'));
});

test('砍价: an argument is a button only while he holds it (`needs`)', () => {
  // 替身草人 at the 执事堂, nothing bought anywhere: only its flaw (a card: no 买两件; not a pill: no 一转).
  assert.deepEqual(argIds(must('haggle', store(), { action: 'open', id: 'caoren-zha' }).r), ['flaw']);
  // 回春丹 (一转) with the stones for two: 这是一转的 · 买两件.
  assert.deepEqual(argIds(must('haggle', store(), { action: 'open', id: 'mend-pill' }).r), ['grade', 'bulk']);
  // Too poor for two: no 买两件.
  assert.deepEqual(argIds(must('haggle', store({ wealth: 20 }), { action: 'open', id: 'mend-pill' }).r), ['grade']);
  // Bought here once at the list price: 我常来.
  const bought = must('trade', store(), { action: 'buy', id: 'huiqi-pill' }).s;
  assert.equal(bought.haggle.deals.zhishi, 1);
  assert.deepEqual(argIds(must('haggle', bought, { action: 'open', id: 'caoren-zha' }).r), ['regular', 'flaw']);
  // Haggled down at the pedlar's: at the 执事堂, 「别家才卖 N」.
  let { s } = hmust('haggle', market(), { action: 'open', id: 'mend-pill' });
  ({ s } = hmust('haggle', s, { action: 'argue', reason: 'grade' }));
  const paid = s.haggle.open.ask;
  ({ s } = hmust('haggle', s, { action: 'deal' }));
  assert.deepEqual(s.haggle.paid['mend-pill'], { place: 'yanwu', price: paid });
  const there = must('haggle', { ...s, place: 'zhishi', scene: null }, { action: 'open', id: 'mend-pill' }).r;
  const cheaper = there.haggle.open.args.find(a => a.id === 'cheaper');
  assert.equal(cheaper.say, `别家才卖 ${paid}`);
  assert.equal(cheaper.off, 15 - paid);
  // One he does not hold is refused, and changes nothing.
  assert.equal(run('haggle', must('haggle', store(), { action: 'open', id: 'caoren-zha' }).s, { action: 'argue', reason: 'regular' }).r.refused, 'not-held');
});

test('砍价: each argument once, by its step, never under the floor', () => {
  let { s } = must('haggle', store({ haggle: { deals: { zhishi: 1 } } }), { action: 'open', id: 'caoren-zha' });
  const argue = reason => { const o = must('haggle', s, { action: 'argue', reason }); s = o.s; return o.r; };
  assert.equal(argue('regular').came_down, Math.round(60 * 0.05));
  assert.equal(run('haggle', s, { action: 'argue', reason: 'regular' }).r.refused, 'not-held', 'used once');
  const r = argue('flaw');
  assert.equal(r.haggle.open.args.every(a => a.used), true);
  assert.ok(s.haggle.open.ask >= Math.ceil(60 * content.aigames.haggle.keepers.zhishi.floor));
  // At the floor he says it is as low as it goes (`firm`), and the line says so.
  const low = must('haggle', store({ haggle: { paid: { 'caoren-zha': { place: 'yanwu', price: 1 } } } }), { action: 'open', id: 'caoren-zha' }).s;
  const firm = must('haggle', low, { action: 'argue', reason: 'cheaper' }).r;
  assert.equal(firm.haggle.open.ask, Math.ceil(60 * content.aigames.haggle.keepers.zhishi.floor));
  assert.equal(firm.haggle.open.firm, true);
  assert.equal(firm.talk.event, 'firm');
});

test('砍价: one counter-offer is taken within reach; lower costs a bead — three, and he will not haggle on', () => {
  let { s } = must('haggle', store(), { action: 'open', id: 'caoren-zha' });
  const reach = Math.round(60 * content.aigames.haggle.counter.reach);
  // Too low: a bead, the ask stands, 「再低要翻脸了」 is his to say.
  let r = run('haggle', s, { action: 'offer', price: 30 });
  assert.equal(r.r.too_low, true);
  assert.equal(r.r.haggle.open.mood, content.aigames.haggle.mood - 1);
  assert.equal(r.r.haggle.open.ask, 60);
  assert.equal(r.r.talk.event, 'low');
  s = r.s;
  // Within reach: taken, once.
  r = must('haggle', s, { action: 'offer', price: 60 - reach });
  assert.equal(r.r.haggle.open.ask, 60 - reach);
  assert.equal(r.r.haggle.open.offer, null);
  assert.equal(run('haggle', r.s, { action: 'offer', price: 50 }).r.refused, 'countered');
  // Three too low: soured — that thing is list price today.
  ({ s } = must('haggle', store(), { action: 'open', id: 'caoren-zha' }));
  for (let i = 0; i < 3; i++) r = run('haggle', i ? r.s : s, { action: 'offer', price: 31 });
  assert.equal(r.r.soured, true);
  assert.equal(r.s.haggle.open, null);
  assert.equal(run('haggle', r.s, { action: 'open', id: 'caoren-zha' }).r.refused, 'walked-away');
});

test('砍价: the deal buys at the dealt price at once (a card into the hand, two of goods); walk-off is list price for the day', () => {
  // 替身草人 is a card: dealt, it is his, the stones off at the dealt price.
  let { s } = must('haggle', store({ wealth: 57 }), { action: 'open', id: 'caoren-zha' });
  ({ s } = must('haggle', s, { action: 'argue', reason: 'flaw' }));
  const ask = s.haggle.open.ask;
  const deal = must('haggle', s, { action: 'deal' });
  assert.equal(deal.r.price, ask);
  assert.equal(deal.s.wealth, 57 - ask);
  assert.ok(deal.s.cards.includes('caoren'));
  assert.equal(deal.r.saved, 60 - ask);
  assert.equal(deal.r.talk.event, 'deal');
  assert.equal(deal.s.haggle.deals.zhishi, 1, 'a deal here: 我常来 from now on');
  assert.equal(run('haggle', deal.s, { action: 'open', id: 'caoren-zha' }).r.refused, 'walked-away', 'one haggle a thing a day');
  // 买两件: two of goods at the price each.
  ({ s } = must('haggle', store(), { action: 'open', id: 'mend-pill' }));
  ({ s } = must('haggle', s, { action: 'argue', reason: 'bulk' }));
  const two = must('haggle', s, { action: 'deal' });
  assert.equal(two.s.bag['mend-pill'], (store().bag['mend-pill'] ?? 0) + 2);
  assert.equal(two.s.wealth, 500 - 2 * s.haggle.open.ask);
  // Walk-off: list price only today; the next day, again.
  ({ s } = must('haggle', store(), { action: 'open', id: 'bamboo-sword' }));
  const off = must('haggle', s, { action: 'walk' });
  assert.equal(off.r.talk.event, 'walk');
  assert.equal(run('haggle', off.s, { action: 'open', id: 'bamboo-sword' }).r.refused, 'walked-away');
  assert.equal(must('haggle', off.s, { action: 'open', id: 'bamboo-sword' }, nextDay()).r.opened, true);
  assert.equal(must('trade', off.s, { action: 'buy', id: 'bamboo-sword' }).r.paid.wealth, -51, 'the list price stands');
  // Too poor for the ask: refused, nothing changes.
  const poor = must('haggle', store({ wealth: 1 }), { action: 'open', id: 'caoren-zha' }).s;
  assert.equal(run('haggle', poor, { action: 'deal' }).r.refused, 'no-stones');
});

test('砍价: the shelf\'s marks — 差 X, and whether haggling could close it', () => {
  // 50 灵石, 替身草人 60: 差 10; 我常来 + 有瑕疵 + one counter-offer reach 50.
  const can = look(store({ wealth: 50, haggle: { deals: { zhishi: 1 } } }), content, ctx()).haggle.marks['caoren-zha'];
  assert.deepEqual(can, { short: 10, can: true, reach: 'can' });
  // 40: under the floor — no haggle closes 20.
  assert.equal(look(store({ wealth: 40 }), content, ctx()).haggle.marks['caoren-zha'].reach, 'far');
  assert.deepEqual(look(store(), content, ctx()).haggle.marks['caoren-zha'], { can: true });
});

test('砍价: a haggle turn is no chat turn — no guide for Ling, only the outcome in what the page did', () => {
  assert.ok(!topics().includes('haggle'), 'no guide topic');
  assert.ok(!fs.existsSync(path.join(ROOT, 'guide/haggle.md')));
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.ok(!md.includes('  - name: Haggle\n'), 'no Haggle tool: the page alone calls it');
  assert.match(md, /\[npc\]/, 'SKILL.md: the side line is answered with words only');
  // An old save's haggle under the 讨价还价 card is let go: that thing is list price today.
  const old = store({ haggle: { day: dayKey(NOW), used: 1, walked: [], open: { item: 'mend-pill', place: 'zhishi', list: 15, floor: 12, ask: 14, qty: 1, turns: 1, mood: 3, used_reasons: ['flaw'], barter: null }, deals: {} } });
  assert.equal(look(old, content, ctx()).haggle.open, undefined);
  assert.equal(run('haggle', old, { action: 'open', id: 'mend-pill' }).r.refused, 'walked-away');
});

/* ════════ 断案 — cut 2026-10-27 ════════ */

test('断案 is cut (Hanli 10-27: 「紫玉参断案也不好玩, 删了吧, 改成灯谜之类的」): no case, no verb, no card; an old save drops its cases', () => {
  assert.equal(content.aigames.cases, undefined, 'no cases in the data');
  assert.equal(look(at('zhishi'), content, ctx()).case, undefined, 'Look carries none at the 执事堂');
  assert.equal(VERBS.case, undefined, 'no case verb');
  assert.ok(!topics().includes('case'), 'no guide topic');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8').includes('  - name: Case\n'), 'no Case tool');
  const kept = fitWorld({ ...at('zhishi'), cases: { 'yaoyuan-shen': { day: '2026-10-20', asked: 3, clues: ['count'], tries: 0, outcome: null } } }, content);
  assert.equal(kept.cases, undefined, 'an old save lets its cases go');
  // In its place at the 执事堂: 周衡's 灯谜 on the 紫玉参, an errand of his after the same scene, its 10 灵石.
  const q = content.quests.find((x) => x.id === 'guan-zhishi-shen');
  assert.ok(q, 'the errand');
  assert.deepEqual(q.opens, { done: 'wm-diyilu' });
  assert.deepEqual(q.need, [{ kind: 'board', task: 'zhishi-shen', n: 1, at: 'zhishi' }]);
  assert.deepEqual(q.grant, { table: 'labor', wealth: 10 });
});

/* ════════ The door ════════ */

test('SKILL.md: no tool reaches the haggle — the shop panel alone calls it, the keeper is asked aside', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  assert.ok(!/others_read: \[[^\]]*floor/.test(md));
  assert.ok(!topics().includes('haggle') && !guideText('haggle'));
});

test('the AI games\' pay is declared in data, under a table that caps it', () => {
  const g = content.aigames;
  for (const grant of (g.duizi?.rungs ?? []).map((r) => r.pay).filter(Boolean)) assert.ok(content.rewards.tables[grant.table], grant.table);
  assert.ok(g._pay.includes('balance'));
  assert.equal(dayKey(NOW).length, 10);
});
