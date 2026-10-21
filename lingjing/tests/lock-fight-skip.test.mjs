// 「算了，往下走」 for a story fight inside a key beat's lock (Hanli 2026-10-21: 「OK, a」). Inside a lock no
// shelf is reachable, so a weak hand with an empty 丹囊 had no way past a 试 — boards are left once
// stuck, riddles passed; now a fight lost balance.json `lock_fight.losses` times (3) may be left too:
// the way on a win would take, paying nothing, kept as left (`fights_left`), never as won. Never outside
// a lock. 河伯's 老井 (01-laojing) and the 大比's 马小宝 (wm-juesai) are both inside one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { duel, look, resolve } from '../scripts/rules.mjs';
import { fightStuck, lockLosses } from '../scripts/rules/skips.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-10-21T11:40:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const at = playTo(content, newState(content, 'zh', NOW), '01-laojing', { now: NOW });
const base = () => structuredClone(at.state);
const GAME = content.chapters['01-ji'].scenes['01-laojing'].exits.find(e => e.id === 'dodge').game;
const exitOf = s => look(s, content, ctx(at.now)).scene.exits.find(e => e.id === 'dodge');

/* One fight of 老井 lost: started, then every turn passed until he wins. */
function lose(s, now) {
  const started = duel(s, content, ctx(now), { id: GAME.id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const out = duel(started.state, content, ctx(now), { id: GAME.id, picks: Array(80).fill('end').join(',') });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  assert.notEqual(out.result.outcome, 'won');
  return out.state;
}

test('the count is balance.json\'s, and 01-laojing and wm-juesai stand inside a lock', () => {
  assert.equal(lockLosses(content), 3);
  assert.ok(content.chapters['01-ji'].beats.find(b => b.id === 'hebo').scenes.includes('01-laojing'));
  assert.ok(content.chapters['00-waimen'].beats.find(b => b.id === 'dabi').scenes.slice(1).includes('wm-juesai'));
});

test('two fights lost: no way out — the card has none, and a pass is refused', () => {
  let s = base();
  for (let d = 0; d < 2; d += 1) s = lose(s, new Date(at.now.getTime() + d * 864e5));
  assert.equal(s.fight_losses[GAME.id], 2);
  assert.ok(!exitOf(s).stuck);
  const r = resolve(s, content, ctx(at.now), { exit: 'dodge', pass: 1 });
  assert.equal(r.result.refused, 'not-stuck');
});

test('three fights lost: 「算了，往下走」 is offered, and leaving it pays nothing while the story goes on', () => {
  let s = base();
  for (let d = 0; d < 3; d += 1) s = lose(s, new Date(at.now.getTime() + d * 864e5));
  assert.equal(s.fight_losses[GAME.id], 3);
  assert.equal(exitOf(s).stuck, true, 'Look marks the fight stuck');
  assert.equal(resolve(s, content, ctx(at.now), { exit: 'dodge' }).result.stuck, true, 'the refusal says so too');
  const before = { wealth: s.wealth, progress: s.progress, cards: [...s.cards], bag: structuredClone(s.bag) };
  const r = resolve(s, content, ctx(at.now), { exit: 'dodge', pass: 1 });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  assert.equal(r.state.scene, '01-end', 'the way on a win would take');
  assert.equal(r.result.passed, true); assert.equal(r.result.left_fight, GAME.id);
  assert.equal(r.result.paid, null, 'no exit grant');
  assert.equal(r.state.wealth, before.wealth); assert.equal(r.state.progress, before.progress);
  assert.deepEqual(r.state.cards, before.cards, 'no card');
  assert.deepEqual(r.state.bag, before.bag, 'no drop');
  assert.ok(!r.state.wins?.[GAME.id], 'never kept as won');
  assert.ok(r.state.fights_left?.[GAME.id], 'kept as left');
});

test('outside a lock the same three losses offer nothing', () => {
  let s = base();
  for (let d = 0; d < 3; d += 1) s = lose(s, new Date(at.now.getTime() + d * 864e5));
  const open = structuredClone(content);
  for (const b of open.chapters['01-ji'].beats) b.scenes = b.scenes.filter(id => id !== '01-laojing');
  assert.equal(fightStuck(open, s, GAME), false);
  assert.equal(resolve(s, open, ctx(at.now), { exit: 'dodge', pass: 1 }).result.refused, 'not-stuck');
});

test('a forward run that cannot win 马小宝 leaves him and goes on (the clock that stuck at wm-juesai)', () => {
  const now = new Date('2026-10-27T07:00:00');
  const out = playTo(content, newState(content, 'zh', now), 'wm-laoyin', { now });
  assert.equal(out.state.scene, 'wm-laoyin');
  assert.ok(out.state.wins?.['dabi-ma'] || out.state.fights_left?.['dabi-ma']);
});
