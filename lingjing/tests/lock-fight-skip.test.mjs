// A story fight may be left from the first moment (Hanli 11-03: 「统一改成右上角的关闭按钮了. 不需要卡住」; first inside a key
// beat's lock, 2026-10-21: 「OK, a」 — no shelf is reachable there): its card's 留 · ✕ pass it,
// the way on a win would take, paying nothing, kept as left (`fights_left`), never as won. Never outside
// a lock. 河伯's 冰夷双龙 (01-rise) stands inside one (老井 and the 大比's bouts are 格斗 boards since 2026-10-31: a board is left
// by the page's own 「算了，往下走」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { duel, look, resolve } from '../scripts/rules.mjs';
import { fightStuck } from '../scripts/rules/skips.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-21T11:40:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const at = playTo(content, newState(content, 'zh', NOW), '01-rise', { now: NOW });
const base = () => structuredClone(at.state);
const GAME = content.chapters['01-ji'].scenes['01-rise'].exits.find(e => e.id === 'stand').game;
const exitOf = s => look(s, content, ctx(at.now)).scene.exits.find(e => e.id === 'stand');

/* One fight of the 双龙 lost: started, then every turn passed until they win. */
function lose(s, now) {
  const started = duel(s, content, ctx(now), { id: GAME.id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const out = duel(started.state, content, ctx(now), { id: GAME.id, picks: Array(80).fill('end').join(',') });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.notEqual(out.result.outcome, 'won');
  return out.state;
}

test('01-rise stands inside a lock, its fight a duel', () => {
  assert.ok(content.chapters['01-ji'].beats.find(b => b.id === 'hebo').scenes.includes('01-rise'));
  assert.equal(GAME.kind, 'duel');
});

test('from the first moment, no fight lost: the card\'s 留 · ✕ stand, and the pass pays nothing while the story goes on (Hanli 11-03)', () => {
  const s = base();
  assert.equal(exitOf(s).stuck, true, 'Look: it may be left now');
  const r = resolve(s, content, ctx(at.now), { exit: 'stand', pass: 1 });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.state.scene, '01-tower');
  assert.ok(!r.state.wins?.[GAME.id], 'never kept as won');
});

test('three fights lost: still the pass, paying nothing, the story going on', () => {
  let s = base();
  for (let d = 0; d < 3; d += 1) s = lose(s, new Date(at.now.getTime() + d * 864e5));
  assert.equal(s.fight_losses[GAME.id], 3);
  assert.equal(exitOf(s).stuck, true, 'Look marks the fight stuck');
  assert.equal(resolve(s, content, ctx(at.now), { exit: 'stand' }).result.stuck, true, 'the refusal says so too');
  const before = { wealth: s.wealth, progress: s.progress, cards: [...s.cards], bag: structuredClone(s.bag) };
  const r = resolve(s, content, ctx(at.now), { exit: 'stand', pass: 1 });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.state.scene, '01-tower', 'the way on a win would take');
  assert.equal(r.result.passed, true); assert.equal(r.result.left_fight, GAME.id);
  assert.equal(r.result.paid, null, 'no exit grant');
  assert.equal(r.state.wealth, before.wealth); assert.equal(r.state.progress, before.progress);
  assert.deepEqual(r.state.cards, before.cards, 'no card');
  assert.deepEqual(r.state.bag, before.bag, 'no drop');
  assert.ok(!r.state.wins?.[GAME.id], 'never kept as won');
  assert.ok(r.state.fights_left?.[GAME.id], 'kept as left');
});

test('outside a lock too, from the first moment (Hanli 2026-10-27: 「确保都能跳过去」; 11-03: 「不需要卡住」); won, never', () => {
  const s = base();
  const open = structuredClone(content);
  for (const b of open.chapters['01-ji'].beats) b.scenes = b.scenes.filter(id => id !== '01-rise');
  assert.equal(fightStuck(open, s, GAME), true);
  assert.equal(fightStuck(open, { ...s, wins: { ...s.wins, [GAME.id]: 'x' } }, GAME), false, 'a fight won is no fight to leave');
  assert.equal(resolve(s, open, ctx(at.now), { exit: 'stand', pass: 1 }).result.ok, true);
});

test('a forward run that cannot win 马小宝 leaves him and goes on (the clock that stuck at wm-juesai)', () => {
  // An instant (the seed is one): as a local wall clock, CI's UTC dealt 马小宝 a hand the bot beats, and nothing was left.
  const now = new Date('2026-10-27T07:00:00-03:00');
  const out = playTo(content, newState(content, 'zh', now), 'wm-laoyin', { now });
  assert.equal(out.state.scene, 'wm-laoyin');
  // 马小宝's bout is a 格斗 board since 2026-10-31: played (or left by the page's clock), it is done either way
  assert.equal(out.state.tasks?.['dabi-ma']?.status, 'done');
});
