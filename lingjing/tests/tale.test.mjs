// 今日传闻 — Ling writes the words, the rules own the numbers. These make a
// tale the way Ling would (the shipped example), play it step by step, and
// hold the lint, the pay, the drop, the one-a-day and the nudge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent } from '../scripts/content.mjs';
import { dayKey, migrate, newState } from '../scripts/state.mjs';
import { advance, look, move, progress, quest, tale } from '../scripts/rules.mjs';
import { CARD_KINDS, stageCards, stageHolds } from '../scripts/stage.mjs';
import { notePage } from '../scripts/rules/did.mjs';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const later = (min, from = NOW) => new Date(from.getTime() + min * 60000);
const nextDay = (n = 1) => new Date(NOW.getTime() + n * 864e5);
const ID = dayKey(NOW).replaceAll('-', '');

/* Out of the prologue, at 泗水岸, with the roots set and nothing walking with him. */
function open() {
  const s = newState(content, 'zh', NOW);
  return { ...s, name: '青玄', traits: ['water', 'wood'], scene: null, ended: ['00-prologue'], place: 'sishui', cast: [] };
}
function must(state, args, c = ctx()) {
  const out = tale(state, content, c, args);
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out;
}
function refused(state, args, code, c = ctx()) {
  const out = tale(state, content, c, args);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.refused, code, JSON.stringify(out.result));
  return out.result;
}
const example = () => structuredClone(content.tale.example.zh);
const made = (s = open(), t = example(), c = ctx()) => must(s, { action: 'make', tale: JSON.stringify(t) }, c).state;
const walk = (s, place, c = ctx()) => {
  if (s.place === place) return s;
  const out = move(s, content, c, { place });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out.state;
};
const problems = (t, s = open()) => refused(s, { action: 'make', tale: JSON.stringify(t) }, 'not-playable').problems;

test('the shape is sound: every game a board the page deals or words the rules judge, and the example plays', () => {
  assert.deepEqual(lint(content).filter(p => /tale|seed/.test(p)), []);
  for (const [id, g] of Object.entries(content.tale.games)) assert.ok(g.frames.length >= 2 && g.frames.length <= 3, id);
  assert.ok(made().tale, 'the shipped example is playable');
});

test('seed: today\'s seed of the province, the games with their story uses, the places in reach', () => {
  const r = must(open(), { action: 'seed' }).result;
  assert.match(r.seed.id, /^xu-/);
  assert.ok(r.seed.line && r.seed.source);
  assert.equal(r.here.id, 'sishui');
  assert.ok(r.shape.games.find(g => g.id === 'luoshu').frames.length >= 2);
  assert.ok(r.shape.places.some(p => p.id === 'yunlong'));
  assert.ok(!r.shape.places.some(p => p.id === 'lvliang'), 'not beyond the realm');
  assert.ok(r.shape.haunts.some(h => h.creature === 'fuzhu'));
  assert.equal(must(open(), { action: 'seed' }).result.seed.id, r.seed.id, 'the same day hands back the same seed');
});

test('lint: places, reach, realm, creatures, cast, variety, length, language — and no numbers', () => {
  const at = (fn) => { const t = example(); fn(t); return problems(t); };
  const has = (list, re) => assert.ok(list.some(p => re.test(p)), list.join('\n'));
  has(at(t => { t.steps[1].at = 'nowhere'; }), /no place nowhere/);
  has(at(t => { t.steps[0].at = 'huaidu'; t.steps[1].at = 'ye'; }), /more than 3 roads/);
  has(at(t => { t.steps[1].at = 'lvliang'; }), /beyond the player's realm/);
  has(at(t => { t.finale.creature = 'dragon'; }), /with a haunt/);
  has(at(t => { t.steps[0].progress = 100; }), /rules own this/);
  has(at(t => { t.steps[0].line = 3; }), /no numbers/);
  has(at(t => { t.steps.push(...example().steps); }), /3–5 steps/);
  has(at(t => { t.steps = t.steps.slice(0, 2); }), /3–5 steps/);
  has(at(t => { t.steps[2].game = 'riddle'; t.steps[2].riddle = t.steps[1].riddle; }), /same game as the step before/);
  has(at(t => { t.steps[2].game = 'alchemy'; }), /at least 3 different games/);
  has(at(t => { t.steps[0].giver = 'stranger'; }), /cast ids/);
  has(at(t => { t.title = 'The Poison'; }), /player's language/);
  has(at(t => { t.hook = '水'.repeat(61); }), /at most 60/);
  has(at(t => { t.cast[0].name = content.names.books[0].names[0]; }), /names /);
  has(at(t => { t.steps[1].riddle.answers = ['石头']; }), /one of the choices/);
  has(at(t => { t.finale = { kind: 'board', game: 'riddle', at: 'sibei', giver: 'xiucai', line: '最后一问。' }; }), /finale\.game/);
  // a beast that walks with him is no fight
  has(problems(example(), { ...open(), cast: ['fuzhu'] }), /walks with the player/);
});

test('one tale a day: made, it stays until done or put down; a missed day costs nothing', () => {
  const s = made();
  refused(s, { action: 'seed' }, 'tale-open');
  refused(s, { action: 'make', tale: JSON.stringify(example()) }, 'tale-open');
  // tomorrow it is still there, where it stood
  const tomorrow = ctx({ now: nextDay() });
  assert.equal(look(s, content, tomorrow).tale.step.n, 1);
  refused(s, { action: 'seed' }, 'tale-open', tomorrow);
  // put down today, the next is tomorrow's; put down on a later day, a new one may be made that day
  const dropped = must(s, { action: 'drop' }).state;
  refused(dropped, { action: 'seed' }, 'tale-today');
  must(dropped, { action: 'seed' }, tomorrow);
  const late = must(s, { action: 'drop' }, tomorrow).state;
  assert.equal(late.tale.dropped, true);
  assert.equal(late.wealth, s.wealth, 'put down, it pays nothing');
  must(late, { action: 'seed' }, tomorrow);
});

test('play: each step a board of its own at its place, handed in there, the next opened — practice untouched', () => {
  let s = made();
  const step = look(s, content, ctx()).tale.step;
  assert.deepEqual([step.n, step.of, step.game, step.at.id, step.at.here], [1, 4, 'alchemy', 'sishui', true]);
  assert.equal(step.board.id, `tale:${ID}:0`, 'its own instance, never the day\'s practice board');
  assert.equal(step.board.level, 1);
  // not the step's board, not here: refused
  refused(s, { action: 'win', board: 'alchemy-daily' }, 'not-this-step');
  refused(walk(s, 'pengcheng'), { action: 'win', board: step.board.id }, 'not-here');
  const before = { tasks: s.tasks, wins: s.wins, stamina: s.stamina };
  const won = must(s, { action: 'win', board: step.board.id });
  s = won.state;
  assert.deepEqual([s.tasks, s.wins], [before.tasks, before.wins], 'the practice and the hosted games are untouched');
  assert.equal(s.stamina, before.stamina - content.rewards.stamina.cost.game, 'a hosted game\'s 体力');
  assert.ok(won.result.handed[0].paid.progress > 0);
  assert.match(won.result.handed[0].title, /^传闻 · 河伯之毒 · 1\/4$/);
  assert.equal(won.result.handed[0].next.title, '传闻 · 河伯之毒 · 2/4');
  assert.equal(won.result.step.game, 'riddle');
  refused(s, { action: 'win', board: step.board.id }, 'not-this-step', ctx());
  // the riddle: a miss is struck from the choices, the answer opens the next step
  s = walk(s, 'sibei');
  const miss = tale(s, content, ctx(), { action: 'answer', answer: '井' });
  assert.equal(miss.result.refused, 'wrong-answer');
  assert.ok(!miss.result.step.riddle.choices.includes('井'));
  assert.ok(!JSON.stringify(look(miss.state, content, ctx()).tale).includes('"answers"'), 'the answer never rides Look');
  s = must(miss.state, { action: 'answer', answer: '枕头' }).state;
  assert.equal(look(s, content, ctx()).tale.step.game, 'luoshu');
  assert.deepEqual(look(s, content, ctx()).tale.clues.length, 2, 'what the steps revealed');
  s = must(walk(s, 'yunlong'), { action: 'win', board: `tale:${ID}:2` }).state;
  // the finale: a fight at 夫诸's haunt — won, the tale ends with the drop, and the people are remembered
  const fin = look(s, content, ctx()).tale.step;
  assert.deepEqual([fin.game, fin.finale, fin.creature.id, fin.at.id], ['duel', true, 'fuzhu', 'sibei']);
  s = walk(s, 'sibei');
  const bag = { ...s.bag }, cards = s.cards;
  const handed = advance(content, s, { kind: 'subdue', creature: 'fuzhu' }, ctx());
  assert.equal(handed[0].ended, true);
  assert.ok(handed[0].gives, 'one drop from the table');
  assert.ok(Object.keys(s.bag).some(id => s.bag[id] !== bag[id]) || s.cards !== cards);
  const t = look(s, content, ctx()).tale;
  assert.equal(t.ended, true);
  assert.equal(t.ending, example().ending);
  assert.deepEqual(s.known.map(k => k.id), ['old-fisher', 'xiucai']);
  assert.equal(s.known[0].where, 'sibei');
  assert.equal(look(s, content, ctx()).book.some(b => b.tale), false, 'done, it leaves the book');
});

test('the pay: the tables\' caps, a fifth step eating into the finale — nothing Ling wrote', () => {
  const r = content.rewards;
  const four = made().tale.grants;
  assert.deepEqual(four.step, { table: 'tale', ...r.tables.tale });
  assert.equal(four.end.progress, r.tables.tale_end.progress);
  const t = example();
  t.steps.push({ game: 'wuziqi', at: 'sibei', giver: 'old-fisher', line: '再下一局。', clue: '老祁说出了实话。' },
    { game: 'qiqiao', at: 'sishui', giver: 'xiucai', line: '拼回这道符。', clue: '符上写着河伯的名字。' });
  const five = made(open(), t).tale.grants;
  assert.equal(5 * five.step.progress + five.end.progress, r.tale.cap.progress);
  assert.ok(5 * five.step.wealth + five.end.wealth <= r.tale.cap.wealth);
});

test('the drop is the table\'s, never above the realm', () => {
  const tiers = content.ladder.tiers.map(x => x.id);
  let s = made();
  for (const [kind, where] of [['win', 'sishui'], ['answer', 'sibei'], ['win', 'yunlong']]) {
    s = walk(s, where);
    s = must(s, kind === 'win' ? { action: 'win', board: `tale:${ID}:${s.tale.n}` } : { action: 'answer', answer: '枕头' }).state;
  }
  advance(content, s, { kind: 'tame', creature: 'fuzhu' }, ctx());
  const d = content.rewards.tale.drops.find(x => (x.item ?? x.card) === s.tale.drop.id);
  assert.ok(d, 'from the table');
  assert.ok(tiers.indexOf(d.tier) <= tiers.indexOf(s.tier), 'never above the realm');
});

test('an empty pool keeps the win; it is counted once 体力 is back, from the book', () => {
  let s = made();
  s = { ...s, stamina: 0, resting: true, stamina_at: NOW.toISOString() };
  const kept = must(s, { action: 'win', board: `tale:${ID}:0` });
  assert.equal(kept.result.kept, true);
  s = kept.state;
  assert.equal(s.tale.n, 0);
  const row = look(s, content, ctx()).book.find(b => b.tale);
  assert.equal(row.ready, true);
  assert.equal(quest(s, content, ctx(), { action: 'turn', id: 'tale' }).result.refused, 'no-stamina');
  const back = quest({ ...s, stamina: 50, resting: undefined }, content, ctx(), { action: 'turn', id: 'tale' });
  assert.equal(back.result.ok, true);
  assert.equal(back.state.tale.n, 1);
  assert.equal(quest(s, content, ctx(), { action: 'info', id: 'tale' }).result.kind, 'tale');
});

test('论道 in a tale: the rules check the form, Ling the meaning; misses begin the round again', () => {
  const t = example();
  t.steps[1] = { game: 'lundao', at: 'sibei', giver: 'xiucai', line: '碑前有位书生，要与你飞花。', clue: '碑文说井底锁着一只河伯的信物。', lundao: { form: 'feihua', prompt: '月' } };
  let s = walk(must(made(open(), t), { action: 'win', board: `tale:${ID}:0` }).state, 'sibei');
  const off = must(s, { action: 'answer', answer: '春风又绿江南岸', ok: 'true' });
  assert.equal(off.result.good, false);
  assert.equal(off.result.form, 'no-keyword');
  // Yinyue's Progress holds the open step, to help with — never an answer
  const help = progress(off.state, content, ctx()).result.lundao;
  assert.equal(help.prompt, '月');
  assert.equal(help.misses, `1/${content.tale.lundao.misses}`);
  s = must(off.state, { action: 'answer', answer: '明月松间照', ok: 'true' }).state;
  assert.equal(s.tale.lundao.good, 1);
  s = must(s, { action: 'answer', answer: '月落乌啼霜满天', ok: 'true' }).state;
  assert.equal(s.tale.n, 2);
  assert.equal(progress(s, content, ctx()).result.lundao, undefined, 'the step done, nothing to help with');
  // a prompt the rules cannot judge is refused
  t.steps[1].lundao.prompt = '明月几时有';
  assert.ok(problems(t).some(p => /not a feihua prompt/.test(p)));
});

test('the step stands on the stage where it is played, and holds it; a fight finale leaves that to the duel card', () => {
  const s = made();
  const here = look(s, content, ctx());
  const cards = stageCards(here);
  assert.ok(cards.some(c => c.card === 'tale'));
  assert.ok(stageHolds(here, [{ card: 'tale' }]));
  assert.equal(typeof CARD_KINDS.tale.holds, 'function');
  assert.ok(!stageCards(look(walk(s, 'pengcheng'), content, ctx())).some(c => c.card === 'tale'), 'elsewhere, the book carries it');
});

test('story_due: no rumor yet today, or the open one quiet a while — said once in the span', () => {
  const s = open();
  const l = look(s, content, ctx());
  assert.equal(l.story_due, true);
  assert.match(l.story_why, /no rumor/);
  assert.equal(look({ ...s, story_told: NOW.toISOString() }, content, ctx({ now: later(10) })).story_due, undefined, 'said once in the span');
  const t = made(s);
  assert.equal(look(t, content, ctx()).story_due, undefined, 'a step just opened');
  const quiet = look(t, content, ctx({ now: later(content.tale.story_due_minutes + 1) }));
  assert.equal(quiet.story_due, true);
  assert.match(quiet.story_why, /quiet/);
});

test('the people of a finished tale are known, and may come back by id alone', () => {
  let s = made();
  for (const [kind, where] of [['win', 'sishui'], ['answer', 'sibei'], ['win', 'yunlong']]) {
    s = walk(s, where);
    s = must(s, kind === 'win' ? { action: 'win', board: `tale:${ID}:${s.tale.n}` } : { action: 'answer', answer: '枕头' }).state;
  }
  advance(content, s, { kind: 'subdue', creature: 'fuzhu' }, ctx());
  const tomorrow = ctx({ now: nextDay() });
  assert.deepEqual(look(s, content, tomorrow).known.map(k => k.name), ['渔翁老祁', '落第书生']);
  const t = example();
  t.title = '老祁又来了';
  t.cast = [{ id: 'old-fisher' }, t.cast[1]];
  const again = must(walk(s, 'sishui', tomorrow), { action: 'make', tale: JSON.stringify(t) }, tomorrow).state;
  assert.equal(again.tale.cast[0].name, '渔翁老祁');
});

test('Progress carries one line of it for Yinyue; an old save\'s 奇遇 is closed quietly', () => {
  const s = made();
  assert.equal(progress(s, content, ctx()).result.tale, '传闻 · 河伯之毒 · 1/4 · 炼丹 · 泗水岸');
  // what the page did is written down for Ling, as every page tap is
  const won = must(s, { action: 'win', board: `tale:${ID}:0` });
  assert.match(notePage('tale', { action: 'win' }, won.result, won.state, content, NOW).page_did.at(-1).what, /rumor's step done .*next: 猜谜 at 泗水北岸/);
  const old = { ...open(), branch: { kind: 'night-tale', turns: 2, opened: NOW.toISOString() } };
  assert.equal('branch' in migrate(old, content), false);
});
