// AI mini-games (rules/aigames.mjs; design.md § AI mini-games, Hanli 2026-10-15):
// 讨价还价 (断案 cut 2026-10-27; the player-asks 二十问 cut 2026-10-28 — she guesses now, games/jinchat-play.js).
// The model talks and judges against a rubric; these check what the RULES own — the floor never in what the page
// or Ling reads, every count and limit, the clamp at the floor. Ling's playing in character cannot be unit-tested:
// guide/haggle.md is its rubric, and the live check plays a round (2026-10-15 report).
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

const H = [0, 1, 2].map(k => new Date(NOW.getTime() + k * 86400000)).find(now => look(at('yanwu'), content, { now, quests: [] }).haggle);
const hc = (extra = {}) => ctx({ now: H, ...extra });
const nextVisit = () => hc({ now: new Date(H.getTime() + 3 * 86400000) });
const market = () => at('yanwu', { wealth: 500, bag: { ...base.bag } });
const hrun = (verb, state, args, c = hc()) => run(verb, state, args, c);
const hmust = (verb, state, args, c = hc()) => must(verb, state, args, c);

test('讨价还价: the floor reaches no one — Look, the card and Ling see the ask, never the floor', () => {
  const s0 = market();
  assert.ok(look(s0, content, hc()).haggle, 'a keeper here: offered');
  const { s, r } = hmust('haggle', s0, { action: 'open', id: 'qi-pill' }, hc({ reader: 'ling' }));
  for (const seen of [r, look(s, content, hc()), forLing(look(s, content, hc()))]) assert.ok(!keysOf(seen).has('floor'));
  assert.equal(r.haggle.ask, 80);
  assert.equal(r.keeper.who, '上山的货郎');
  assert.ok(r.rubric.some(x => x.id === 'flaw'));
  assert.ok(stageCards(look(s, content, hc())).some(c => c.card === 'haggle'));
  assert.match(cardHtml({ card: 'haggle' }, { look: look(s, content, hc()), words: WORDS.zh }), /成交 · 80 灵石/);
});

test('讨价还价: each reason once, stepped by the rubric, clamped at the floor; a bare push sours him', () => {
  let { s } = hmust('haggle', market(), { action: 'open', id: 'qi-pill' });
  const turn = (args) => { const o = hmust('haggle', s, { action: 'turn', ...args }); s = o.s; return o.r; };
  assert.equal(turn({ reason: 'flaw', grade: 2 }).came_down, Math.round(80 * 0.06 * 1.5));
  assert.equal(turn({ reason: 'flaw', grade: 2 }).refused_reason, 'used');
  assert.equal(turn({ reason: 'regular', grade: 2 }).refused_reason, 'not-a-regular', 'no past deal here');
  turn({ reason: 'bulk', grade: 2 });
  assert.equal(s.haggle.open.qty, 2);
  turn({ reason: 'flattery', grade: 2 });
  const floor = Math.ceil(80 * content.aigames.haggle.floors['qi-pill']);
  assert.ok(s.haggle.open.ask >= floor);
  // A thing not in the bag is no trade: the third sour turn, and he stops — that thing is list price today.
  const sour = hrun('haggle', s, { action: 'turn', reason: 'barter', item: 'nope' });
  assert.equal(sour.r.soured, true);
  assert.equal(sour.s.haggle.open, null);
  assert.equal(hrun('haggle', sour.s, { action: 'open', id: 'qi-pill' }).r.refused, 'walked-away');
});

test('讨价还价: the deal buys at the ask; a regular then counts; three a day', () => {
  let { s } = hmust('haggle', market(), { action: 'open', id: 'mend-pill' });
  ({ s } = hmust('haggle', s, { action: 'turn', reason: 'flaw', grade: 1 }));
  const ask = s.haggle.open.ask, held = s.bag['mend-pill'] ?? 0, wealth = s.wealth;
  const deal = hmust('haggle', s, { action: 'deal' });
  assert.equal(deal.r.price, ask);
  assert.equal(deal.s.wealth, wealth - ask);
  assert.equal(deal.s.bag['mend-pill'], held + 1);
  assert.equal(deal.r.saved, s.haggle.open.list - ask, 'off the shelf price (balance.json prices)');
  ({ s } = hmust('haggle', deal.s, { action: 'open', id: 'qi-pill' }));
  assert.notEqual(hrun('haggle', s, { action: 'turn', reason: 'regular', grade: 1 }).r.refused_reason, 'not-a-regular', 'a past deal here: a regular');
  ({ s } = hmust('haggle', s, { action: 'walk' }));
  ({ s } = hmust('haggle', s, { action: 'open', id: 'straw-cloak' }));
  ({ s } = hmust('haggle', s, { action: 'walk' }));
  assert.equal(hrun('haggle', s, { action: 'open', id: 'talisman' }).r.refused, 'haggled-out');
  assert.equal(hmust('haggle', s, { action: 'open', id: 'talisman' }, nextVisit()).r.opened, true);
  // Too poor for the ask: refused, nothing changes.
  const poor = hmust('haggle', { ...market(), wealth: 1 }, { action: 'open', id: 'qi-pill' }).s;
  assert.equal(hrun('haggle', poor, { action: 'deal' }).r.refused, 'no-stones');
});

test('讨价还价: a thing in trade comes off the ask and leaves the bag at the deal', () => {
  let { s } = hmust('haggle', { ...market(), bag: { ...base.bag, ganliang: 2 } }, { action: 'open', id: 'straw-cloak' });
  const r = hmust('haggle', s, { action: 'turn', reason: 'barter', item: 'ganliang', grade: 1 });
  s = r.s;
  assert.equal(r.r.came_down, Math.min(2, Math.floor(20 * 0.3)));
  const deal = hmust('haggle', s, { action: 'deal' });
  assert.equal(deal.s.bag.ganliang, 1);
  assert.equal(deal.r.traded, 'ganliang');
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

test('SKILL.md: no tool hands another the floor; the haggle guide is there', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const block = name => md.slice(md.indexOf(`  - name: ${name}\n`), md.indexOf('\n  - name:', md.indexOf(`  - name: ${name}\n`) + 5));
  for (const name of ['Haggle']) assert.ok(!/floor|play|knows|hides/.test(/others_read: \[(.*)\]/.exec(block(name))[1]), name);
  for (const t of ['haggle']) assert.ok(topics().includes(t) && guideText(t), t);
});

test('the AI games\' pay is declared in data, under a table that caps it', () => {
  const g = content.aigames;
  for (const grant of (g.duizi?.rungs ?? []).map((r) => r.pay).filter(Boolean)) assert.ok(content.rewards.tables[grant.table], grant.table);
  assert.ok(g._pay.includes('balance'));
  assert.equal(dayKey(NOW).length, 10);
});
