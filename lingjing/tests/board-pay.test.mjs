// A small game's 灵石 (Hanli 2026-10-16; balance.json `boards`, rules/tasks.mjs boardPay):
// after 入门 its first clear pays by grade — plain 5, good 10, best (or all three 灵光) 15 — on top of
// the task's own grant; a replay pays nothing; before 入门 nothing at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { task, win } from '../scripts/rules.mjs';
import { boardRank } from '../scripts/rules/tasks.mjs';
import { crawlRules } from './crawl.mjs';

const content = loadContent();
const B = content.balance.boards;
const crawl = crawlRules(content, { boards: 'skip' });
const ctx = (now) => ({ now, quests: [] });
function at(key) {
  const got = crawl.states.get(key);
  assert.ok(got, `the crawl reached ${key}`);
  return { s: { ...got.s, skipped: [], stamina: 100, stamina_at: got.now.toISOString() }, now: got.now };
}
function clear(s, now, id, grade, stars) {
  const won = win(s, content, ctx(now), { id, grade, stars });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  const done = task(won.state, content, ctx(now), { action: 'done', id });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  return done;
}
// 掐诀 at 千叶 (h08): its grant pays 修为 only, so every 灵石 is the board's.
const ID = 'qianye-qiajue';

test('the table is balance.json\'s: plain 5, good 10, best 15', () => {
  assert.deepEqual(B, { plain: 5, good: 10, best: 15 });
  assert.match(content.balance._boards ?? '', /Hanli 2026-10-16/);
});

test('the rank: `ranks` outright; three 灵光 best; first mark best, last plain, between good; no marks plain', () => {
  const t = content.tasks.tasks.find((x) => x.id === ID);
  assert.equal(boardRank(t, 'tight'), 'best');
  assert.equal(boardRank(t, 'loose'), 'plain');
  assert.equal(boardRank({ marks: { a: 1, b: 1, c: 1 } }, 'b'), 'good');
  assert.equal(boardRank({ marks: { a: 1, b: 1, c: 1 } }, 'c', 3), 'best', 'all three 灵光');
  assert.equal(boardRank({}, null), 'plain', 'a puzzle with no marks');
  assert.equal(boardRank({ marks: { a: 1, b: 1 }, ranks: { a: 'good' } }, 'a', 3), 'good', '`ranks` has the last word');
});

for (const [grade, rank] of [['loose', 'plain'], ['tight', 'best']]) {
  test(`after 入门 a first clear pays by grade: ${grade} → ${rank} ${B[rank]}`, () => {
    const { s, now } = at('00-waimen/wm-qianye');
    const done = clear(s, now, ID, grade);
    assert.equal(done.state.wealth - s.wealth, B[rank]);
    assert.equal(done.result.paid.wealth, B[rank], 'the win line shows it');
    assert.deepEqual(done.result.paid.board, { rank, wealth: B[rank] });
    assert.ok(done.state.boards_paid.includes(ID));
  });
}

test('a replay pays nothing: the board is paid once', () => {
  const { s, now } = at('00-waimen/wm-qianye');
  const first = clear(s, now, ID, 'loose').state;
  assert.equal(first.wealth - s.wealth, B.plain);
  // Stood again as a replay stands a board, and won clean: still no 灵石.
  const again = { ...first, tasks: { ...first.tasks, [ID]: { ...first.tasks[ID], status: 'offered', replay: true } } };
  const done = clear(again, now, ID, 'tight');
  assert.equal(done.state.wealth, first.wealth, 'no 灵石 the second time');
  assert.equal(done.result.paid?.board, undefined);
});

test('a board left (skipped) pays nothing; won later on its replay day, that is its first clear and pays', () => {
  const { s, now } = at('00-waimen/wm-qianye');
  const left = task(s, content, ctx(now), { action: 'skip', id: ID });
  assert.equal(left.result.ok, true, JSON.stringify(left.result));
  assert.equal(left.state.wealth, s.wealth);
  // Stood again as its replay day stands it (tests/skips.test.mjs walks that day itself).
  const tomorrow = new Date(now.getTime() + 864e5), n = left.state;
  const open = { ...n, tasks: { ...n.tasks, [ID]: { ...n.tasks[ID], status: 'offered', replay: true } } };
  const done = clear(open, tomorrow, ID, 'tight');
  assert.equal(done.state.wealth - n.wealth, B.best);
  const twice = clear({ ...done.state, tasks: { ...done.state.tasks, [ID]: { ...done.state.tasks[ID], status: 'offered', replay: true } } }, tomorrow, ID, 'tight');
  assert.equal(twice.state.wealth, done.state.wealth, 'and only once');
});

test('before 入门 nothing is paid, and nothing is marked paid (喂饼 at the cave)', () => {
  const { s, now } = at('00-prologue/00-cave');
  const done = clear(s, now, 'bread-share', 'half', 3);
  assert.equal(done.state.wealth ?? 0, s.wealth ?? 0);
  assert.equal(done.result.paid?.board, undefined);
  assert.ok(!(done.state.boards_paid ?? []).includes('bread-share'), 'still owed nothing later');
});
