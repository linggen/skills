// 论道 and what a win pays (the builder, 2026-11-16: from 入门 on, every small game that is won pays something).
// The inventory read tasks.mjs `lundao` — a win pays only through the errand (or 传闻 step) that asked for it — as a gap. It is
// not reachable: 论道 is a `word` task, and a word task is hosted only while an errand in the book asks for it
// (tasks.mjs hostedHere; design.md § 小游戏: "never a daily chore"). With no errand the door is shut at every step — `open`,
// `turn`, and the page's `win` — so a 论道 win with no errand asking cannot happen, and no pay branch is added for it.
// These tests pin that, and the pay the notice that asked for it makes today, so a change to either shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS, move, resolve } from '../scripts/rules.mjs';
import { beforeChapterOne, TO_WAIMEN, walk } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
process.env.TZ = 'America/Sao_Paulo';
const content = beforeChapterOne(loadContent());
const NOW = new Date('2026-09-11T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const NOTICE = 'daily-20260911-trial-jixia';

function must(fn, state, args) {
  const out = fn(state, content, ctx(), args);
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out;
}
/* A save past 入门, standing at 稷下 at the layer given, with the market's notice for 论道 in the book (or none). */
function at稷下(tier, { notice = true } = {}) {
  let s = walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW);
  s = must(resolve, s, { exit: 'pay' }).state;
  s = must(resolve, s, { exit: 'rest' }).state;
  s = must(move, s, { place: 'sibei' }).state;
  const { companion, ...rest } = s;
  return { ...rest, step: 1, cards: rest.cards.filter(id => id !== 'yinyue'), place: 'jixia', tier, stamina: 100, quests: notice ? { [NOTICE]: { took: '2026-09-11', have: {} } } : {} };
}
/* A good answer by form, for whichever game was dealt. */
const answerFor = (st, i) => {
  const x = st.lundao;
  return (x.game === 'feihua' ? `${x.prompt}落乌啼霜满天`.slice(0, 7) : x.game === 'duilian' ? '甲'.repeat([...x.prompt].length) : [...x.last].at(-1) + '天动地') + (i ? String(i) : '');
};
function wonRound(s) {
  let st = must(VERBS.lundao, s, { action: 'open' }).state, last = null;
  for (let i = 0; i < content.lundao.need; i += 1) {
    last = must(VERBS.lundao, st, { action: 'turn', answer: answerFor(st, i), ok: 'true' });
    st = last.state;
  }
  return { state: st, result: last.result };
}

test('论道 with no errand asking is shut at every step: open, turn after the errand is gone, and the page\'s win — so no win goes unpaid', () => {
  const bare = at稷下('qi', { notice: false });
  assert.equal(VERBS.lundao(bare, content, ctx(), { action: 'open' }).result.refused, 'not-here');
  assert.equal(VERBS.win(bare, content, ctx(), { id: 'lundao' }).result.refused, 'not-here', 'the page cannot win it either');
  // The errand dropped from the book in the middle of a round: the round cannot go on to a win.
  const open = must(VERBS.lundao, at稷下('qi'), { action: 'open' });
  const dropped = { ...open.state, quests: {} };
  const turn = VERBS.lundao(dropped, content, ctx(), { action: 'turn', answer: answerFor(dropped, 0), ok: 'true' });
  assert.equal(turn.result.refused, 'not-here');
  assert.equal(turn.state, null, 'a refusal changes nothing');
});

test('论道 won for the notice that asked: the notice pays, once, in the verb\'s `paid` — 练气一层 and above (pinned before any change)', () => {
  const pins = { qi: 8, foundation: 15 };
  for (const [tier, wealth] of Object.entries(pins)) {
    const s = at稷下(tier);
    const { state, result } = wonRound(s);
    assert.equal(result.lundao.outcome, 'won');
    assert.deepEqual(result.handed.map(h => h.id), [NOTICE], `${tier}: the notice is what was handed in`);
    assert.equal(result.paid.wealth, wealth, `${tier}: the notice's 灵石`);
    assert.equal(result.paid.progress, 0);
    assert.equal(state.wealth - s.wealth, wealth, `${tier}: and no more landed on the save — one pay`);
    assert.equal(s.stamina - state.stamina, 3, `${tier}: the round cost a hosted game's 体力 at the door`);
    assert.equal(state.tasks.lundao.status, 'done', 'the day is marked done');
  }
});
