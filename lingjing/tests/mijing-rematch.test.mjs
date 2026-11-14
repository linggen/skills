import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules.mjs';
import { VERBS } from '../scripts/rules/verbs.mjs';
import { mijingBrief, nextRooms } from '../scripts/rules/mijing.mjs';
import { winningPicks } from '../scripts/rules/progress.mjs';
import { cardCatalog } from '../scripts/rules/cards.mjs';

const world = loadContent(), now = new Date(2026, 9, 28, 10), ctx = { now, quests: [] };
const content = { ...world, balance: { ...world.balance, mijing: { ...world.balance.mijing, door: 0, key_on: true } } };
const call = (c, verb, state, args) => VERBS[verb](state, c, ctx, args);
let cached;
function room(kind = 'boss', c = content) {
  if (!cached) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cached = playTo(content, newState(content, 'zh', now), 'wm-yaban', { now }).state; }
    finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  let s = structuredClone(cached); s.place = 'shimen'; s.bag[c.mijing.key] = 3;
  s = call(c, 'mijing', s, { action: 'enter', tier: 1, seed: 'rematch' }).state;
  s.mijing.run.hp = 2;
  const id = nextRooms(s.mijing.run)[0];
  s.mijing.run.map.layers[0].find(x => x.id === id).kind = kind;
  const entered = call(c, 'mijing', s, { action: 'go', room: id });
  assert.ok(entered.result.ok);
  return { s: entered.state, id: `mijing:${id}` };
}
function lose(c, s, id) {
  const door = call(c, 'duel', s, { id }); assert.ok(door.result.ok);
  return call(c, 'duel', door.state, { id, picks: Array(80).fill('end').join(','), lesson: 'trade' });
}
test('first boss loss restores entry hp, remembers lesson and opens a lent rematch', () => {
  const { s, id } = room();
  assert.equal(mijingBrief(content, s, now).rematch_left, 1);
  const out = lose(content, s, id), r = out.state.mijing.run;
  assert.equal(out.result.rematch, true); assert.equal(r.hp, 2); assert.equal(r.rematch, 1);
  assert.equal(r.room.phase, 'fight'); assert.equal(mijingBrief(content, out.state, now).rematch_left, 0);
  assert.equal(out.state.duel_lesson[r.room.foe.creature], 'trade');
  const door = call(content, 'duel', out.state, { id });
  assert.equal(door.result.duel.lend.cards[0], 'yy-fire');
});
test('second boss loss ends with the ordinary dead settlement', () => {
  const { s, id } = room(), first = lose(content, s, id), second = lose(content, first.state, id);
  assert.equal(second.result.ended, 'dead'); assert.equal(second.state.mijing.last.how, 'dead');
  assert.equal(second.state.mijing.run, undefined); assert.ok(second.result.last.paid);
});
test('ordinary room loss ends immediately', () => {
  const { s, id } = room('yao'), out = lose(content, s, id);
  assert.equal(out.result.ended, 'dead'); assert.equal(out.state.mijing.run, undefined);
});
test('zero rematches preserves immediate boss death', () => {
  const c = { ...content, balance: { ...content.balance, mijing: { ...content.balance.mijing, rematch: 0 } } };
  const { s, id } = room('boss', c); assert.equal(mijingBrief(c, s, now).rematch_left, 0);
  assert.equal(lose(c, s, id).result.ended, 'dead');
});
test('winning the boss rematch clears the run', () => {
  const { s, id } = room(), first = lose(content, s, id);
  const retry = first.state; retry.mijing.run.hp = retry.mijing.run.hp_max;
  const door = call(content, 'duel', retry, { id });
  door.state.fight.setup.foe.hp_fixed = 1;
  const picks = winningPicks(door.state.fight.setup, cardCatalog(content), 100);
  assert.ok(picks, 'winning line');
  const out = call(content, 'duel', door.state, { id, picks: picks.join(',') });
  assert.equal(out.result.ended, 'clear'); assert.equal(out.state.mijing.run, undefined);
});
// The page marks its moves as the fight goes (落子记下) and then settles: a mark keeps the moves with the open fight and
// settles nothing, so the settle that follows still finds its fight (2026-11-13: a 秘境 mark settled the fight, the
// page's own settle was refused not-started, and the lost card with its 再战 never showed).
test('a mark on a 秘境 fight settles nothing; the settle after it still lands', () => {
  const { s, id } = room();
  const door = call(content, 'duel', s, { id }); assert.ok(door.result.ok);
  const picks = Array(80).fill('end').join(',');
  const marked = call(content, 'duel', door.state, { id, action: 'mark', picks });
  assert.equal(marked.result.ok, true); assert.equal(marked.result.marked, 80);
  assert.equal(marked.state.fight.game, id); assert.equal(marked.state.mijing.run.room.phase, 'fight');
  assert.equal(marked.state.mijing.run.rematch ?? 0, 0, 'no rematch spent by a mark');
  const out = call(content, 'duel', marked.state, { id, picks, lesson: 'trade' });
  assert.equal(out.result.rematch, true); assert.equal(out.state.mijing.run.rematch, 1);
});
test('a mark with no open 秘境 fight is refused', () => {
  const { s, id } = room();
  const out = call(content, 'duel', s, { id, action: 'mark', picks: 'end' });
  assert.equal(out.result.ok, false); assert.equal(out.result.refused, 'not-started');
});
