// 本王考考你: a word cleared before still pays (the builder, 2026-11-16: 「小游戏应该胜了都有奖励, 可以少, 最好别没有」 — from 入门
// on, every small game that is won pays something; the prologue is exempt). The first clear pays its looks' grade as ever; a
// repeat win pays 1 灵石, through the one pay path, shown the way the page reads any board's pay (`paid.wealth`, lingjing.js
// payWin → boardPaid). What bounds repeats: each round costs a board's 体力 at `kao open`, `per_day` rounds a day, 银月 beside him.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { dayKey, newState } from '../scripts/state.mjs';
import { playTo, task, win, VERBS } from '../scripts/rules.mjs';
import { stonesAt } from '../scripts/rules/playpay.mjs';
import { TO_VALLEY, walk } from './prologue.mjs';

process.env.LINGJING_STAMINA_LIMIT = '1';
const content = loadContent();
const K = 'benwang-kao';
const at = (now) => ({ now, quests: [] });
const start = new Date('2026-10-15T09:00:00+08:00');
const PLAYED = playTo(content, newState(content, 'zh', start), 'wm-qianye', { now: start });
const night = () => { const d = new Date(PLAYED.now); d.setDate(d.getDate() + 1); d.setHours(22, 0, 0, 0); return d; };
const awake = (s) => ({ ...s, companion: { ...(s.companion ?? {}), joined: true, asleep: false } });
/* The page's seen-by-the-page boolean for a pay (lingjing.js boardPaid). */
const boardPaid = (r) => Boolean(r.paid?.progress || r.paid?.wealth || (r.paid?.item && !r.paid.offered));

/* A round opened on `word`, won with `stars`, handed in — at the layer given (a save past 入门). */
function round(layer, word, cleared, stars = 3) {
  const now = night();
  let s = awake(structuredClone(PLAYED.state));
  s = { ...s, ...layer, stamina: 100, kao_cleared: cleared };
  const o = VERBS.kao(s, content, at(now), { action: 'open' });
  assert.equal(o.result.ok, true, JSON.stringify(o.result));
  let t = { ...o.state, kao: { ...o.state.kao, open: { ...o.state.kao.open, word } } };
  const spent = s.stamina - o.state.stamina;
  t = win(t, content, at(now), { id: K, stars }).state;
  const before = t.wealth;
  const d = task(t, content, at(now), { action: 'done', id: K });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  return { d, gained: d.state.wealth - before, spent, now, state: d.state };
}
const LAYERS = [{ tier: 'qi', step: 1 }, { tier: 'foundation', step: 1 }];

test('a word cleared before pays 1 灵石 — at 练气一层 and above — and the verb returns it as `paid.wealth`, the page\'s own reading', () => {
  for (const layer of LAYERS) {
    const r = round(layer, '饼', ['饼']);
    assert.equal(r.d.result.first, false);
    assert.equal(r.gained, 1, `${layer.tier}: one 灵石 landed`);
    assert.equal(r.d.result.paid.wealth, 1, `${layer.tier}: and it is in the result`);
    assert.equal(r.d.result.paid.progress, 0);
    assert.ok(boardPaid(r.d.result), 'the page shows a pay when paid.wealth is set');
    assert.equal(r.state.day.wealth >= 1, true, 'counted in the day\'s take');
  }
});

test('a word\'s first clear pays its looks\' grade, unchanged by the repeat pay', () => {
  for (const layer of LAYERS) {
    for (const [stars, rank] of [[3, 'best'], [2, 'good'], [1, 'plain']]) {
      const r = round(layer, '饼', [], stars);
      const want = Math.round(stonesAt(content, { ...PLAYED.state, ...layer }, content.balance.boards[rank]));
      assert.equal(r.d.result.first, true);
      assert.equal(r.gained, want, `${layer.tier} ${rank}`);
      assert.deepEqual(r.d.result.paid, { progress: 0, wealth: want, board: { rank, wealth: want } }, `${layer.tier} ${rank}: shape as before`);
    }
  }
});

test('what bounds repeats: each round costs a board\'s 体力 at the door, and the day allows `per_day` rounds', () => {
  const r = round(LAYERS[0], '饼', ['饼']);
  assert.ok(r.spent > 0, `a round costs 体力 (${r.spent})`);
  const cap = content.tasks.tasks.find((t) => t.id === K).per_day;
  assert.equal(cap, 1);
  // The day's allowance spent, no second round opens however many words are cleared.
  const second = VERBS.kao(r.state, content, at(r.now), { action: 'open', next: 1 });
  assert.equal(second.result.refused, 'cap');
  assert.equal(r.state.kao.day, dayKey(r.now));
});

test('the prologue is exempt and untouched: a prologue board won still pays nothing', () => {
  const now = new Date('2026-10-15T09:00:00+08:00');
  const upTo = TO_VALLEY.findIndex(([v, a]) => v === 'win' && a.id === 'masan-taunt');
  let s = walk(newState(content, 'zh', now), TO_VALLEY.slice(0, upTo), content, now);
  s = { ...s, stamina: 100 };
  const w = win(s, content, at(now), { id: 'masan-taunt', stars: 3 });
  assert.equal(w.result.ok, true, JSON.stringify(w.result));
  const d = task(w.state, content, at(now), { action: 'done', id: 'masan-taunt' });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.ok(!d.result.paid?.progress && !d.result.paid?.wealth, JSON.stringify(d.result.paid));
  assert.equal(d.state.wealth, s.wealth);
  assert.equal(d.state.progress ?? 0, s.progress ?? 0);
});
