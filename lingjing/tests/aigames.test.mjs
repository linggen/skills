// AI mini-games (rules/aigames.mjs; design.md § AI mini-games, Hanli 2026-10-15):
// 二十问 · 讨价还价 · 断案. The model talks and judges against a rubric; these
// check what the RULES own — the secret never in what the page or Ling reads,
// every count and limit, the clamp at the floor, the case judged by ids, the pay.
// 银月's truthfulness and Ling's playing in character cannot be unit-tested:
// guide/twenty.md, guide/haggle.md and guide/case.md are their rubric, and the
// live check plays one round of each (2026-10-15 report).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, fitWorld, newState } from '../scripts/state.mjs';
import { forLing, look, playTo, VERBS } from '../scripts/rules.mjs';
import { guessed } from '../scripts/rules/aigames.mjs';
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

test('二十问 is hers: asleep in the token there is no game and no card', () => {
  const asleep = { ...base, companion: { ...base.companion, asleep: true, awake: undefined } };
  assert.equal(look(asleep, content, ctx()).twenty, undefined);
  assert.equal(run('twenty', asleep, { action: 'open' }).r.refused, 'no-host');
  assert.ok(look(base, content, ctx()).twenty, 'awake: offered');
});

test('二十问: the animal reaches only her tool — never Look, never the page, never Ling', () => {
  const { s, r } = must('twenty', base, { action: 'open' });
  const animal = s.twenty.game.animal;
  const name = content.aigames.twenty.animals.find(a => a.id === animal).name.zh;
  for (const seen of [r, look(s, content, ctx()), forLing(look(s, content, ctx())), run('twenty', s, { action: 'host' }, ctx({ reader: 'ling' })).r]) {
    const keys = keysOf(seen);
    assert.ok(!keys.has('secret') && !keys.has('animal') && !keys.has('alias'), [...keys].filter(k => /secret|animal|alias/.test(k)).join());
  }
  const hers = run('twenty', s, { action: 'host' }, ctx({ reader: 'yinyue' })).r;
  assert.equal(hers.secret.name, name);
  assert.ok(hers.host.includes('NEVER say'), 'her rules of play ride in her answer');
  // Ling reads another member's call by its head (1200 characters, chat/thread.rs): the secret is past it.
  const head = [...JSON.stringify(hers)].slice(0, 1200).join('');
  assert.ok(!head.includes('"secret"'), 'the head Ling may read holds no secret');
  // The stage's card: the count and the guess box — no animal.
  const card = cardHtml({ card: 'twenty' }, { look: look(s, content, ctx()), words: WORDS.zh });
  assert.match(card, /已问 0\/20/);
  assert.match(card, /twenty-guess/);
});

test('二十问: questions counted, a retried call once, a guess named by the longest name', () => {
  let { s } = must('twenty', base, { action: 'open' });
  const y = ctx({ reader: 'yinyue' });
  assert.equal(run('twenty', s, { action: 'ask', question: '会飞吗', answer: 'maybe' }, y).r.refused, 'bad-answer');
  ({ s } = must('twenty', s, { action: 'ask', question: '会飞吗', answer: 'no' }, y));
  const again = run('twenty', s, { action: 'ask', question: '会飞吗', answer: 'no' }, y);
  assert.equal(again.r.again, true);
  assert.equal(look(s, content, ctx()).twenty.count, 1);
  assert.deepEqual(look(s, content, ctx()).twenty.asked, [{ q: '会飞吗', a: 'no' }]);
  // 猫头鹰 is the owl, never the cat; 水牛 is the ox; an animal off the list names none.
  assert.equal(guessed(content, 'zh', '是猫头鹰吗？'), 'owl');
  assert.equal(guessed(content, 'zh', '是猫吧'), 'cat');
  assert.equal(guessed(content, 'zh', '水牛！'), 'ox');
  assert.equal(guessed(content, 'en', 'is it a kitten?'), 'cat');
  assert.equal(guessed(content, 'zh', '大象'), null);
});

test('二十问: a wrong guess counts, the right one wins — paid once, the animal known in 录', () => {
  let { s } = must('twenty', base, { action: 'open' });
  const animal = s.twenty.game.animal;
  const wrong = content.aigames.twenty.animals.find(a => a.id !== animal);
  ({ s } = must('twenty', s, { action: 'guess', guess: wrong.name.zh }));
  assert.equal(look(s, content, ctx()).twenty.count, 1);
  // The page's guess, then her call on the same word: one guess.
  assert.equal(run('twenty', s, { action: 'guess', guess: wrong.name.zh }, ctx({ reader: 'yinyue' })).r.again, true);
  const right = content.aigames.twenty.animals.find(a => a.id === animal);
  const before = s.wealth;
  const won = must('twenty', s, { action: 'guess', guess: `是${right.name.zh}吗` });
  assert.equal(won.r.right, true);
  assert.equal(won.r.twenty.outcome, 'won');
  assert.equal(won.r.twenty.animal, right.name.zh, 'over: the name is a fact');
  assert.equal(won.s.wealth - before, content.aigames.twenty.pay.wealth);
  assert.deepEqual(won.s.animals, [animal]);
  assert.equal(run('twenty', won.s, { action: 'guess', guess: right.name.zh }).r.refused, 'not-open', 'never paid twice');
  assert.deepEqual(run('story', won.s, {}).r.animals, [{ id: animal, name: right.name.zh }]);
});

test('二十问: twenty spent and unguessed is lost — then she says it; rounds a day', () => {
  let { s } = must('twenty', base, { action: 'open' });
  const y = ctx({ reader: 'yinyue' });
  for (let i = 0; i < 20; i++) ({ s } = must('twenty', s, { action: 'ask', question: `问题${i}`, answer: 'no' }, y));
  const t = look(s, content, ctx()).twenty;
  assert.equal(t.outcome, 'lost');
  assert.ok(t.animal, 'lost: the card names it');
  assert.equal(run('twenty', s, { action: 'host' }, y).r.reveal, t.animal);
  ({ s } = must('twenty', s, { action: 'open' }));
  assert.notEqual(s.twenty.game.round, 1);
  ({ s } = must('twenty', s, { action: 'quit' }));
  assert.equal(run('twenty', s, { action: 'open' }).r.refused, 'rounds-done', `${content.aigames.twenty.rounds} a day`);
  assert.equal(must('twenty', s, { action: 'open' }, nextDay()).r.opened, true, 'tomorrow again');
});

/* ════════ 讨价还价 ════════ */

/* The pedlar up the mountain (演武场, every third day while 观内 holds him): a day he stands there. */
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

test('SKILL.md: her Twenty is a pet tool she may call (read tier, page_only for Ling), and no tool hands another the secret', () => {
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const block = name => md.slice(md.indexOf(`  - name: ${name}\n`), md.indexOf('\n  - name:', md.indexOf(`  - name: ${name}\n`) + 5));
  const twenty = block('Twenty');
  assert.match(twenty, /tier: read/);
  assert.match(twenty, /pet: true/);
  assert.match(twenty, /page_only: true/);
  assert.match(twenty, /--for=yinyue/);
  const others = /others_read: \[(.*)\]/.exec(twenty)[1];
  assert.ok(!/secret|reveal/.test(others));
  for (const name of ['Haggle']) assert.ok(!/floor|play|knows|hides/.test(/others_read: \[(.*)\]/.exec(block(name))[1]), name);
  for (const t of ['haggle', 'twenty']) assert.ok(topics().includes(t) && guideText(t), t);
});

test('the AI games\' pay is declared in data, under a table that caps it', () => {
  const g = content.aigames;
  for (const grant of [g.twenty.pay]) assert.ok(content.rewards.tables[grant.table], grant.table);
  assert.ok(g._pay.includes('balance'));
  assert.equal(dayKey(NOW).length, 10);
});
