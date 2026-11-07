// 斗法 within its realm's minutes (balance.json fight_length; Hanli 2026-11-07: 「一局要玩快10分钟。能控制在
// 3分钟吗」 — about 3 minutes at 练气, longer with more cards and higher realms but within about 5).
// Every fight of 卷一 at its first meeting, by the band's player (tools/fight-length.mjs); a beast too long
// for its realm's ceiling fails here. A 试 (`trial`) or a foe that says `long` is the story's length.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, foeTurn } from '../scripts/battle.js';
import { fightLength, lengthRule } from '../scripts/rules/cards.mjs';
import { lengthOf } from '../tools/fight-length.mjs';
import { content, FIGHTS, stateAt } from '../tools/story-fights.mjs';

const rule = content.balance.fight_length;

test('the curve: about 3 minutes at 练气, rising, never past the cap', () => {
  const tiers = content.ladder.tiers.map(t => lengthRule(content, { tier: t.id, step: 0 }).minutes);
  assert.equal(tiers[0], 3);
  for (let i = 1; i < tiers.length; i += 1) assert.ok(tiers[i] >= tiers[i - 1], `minutes fall at ${content.ladder.tiers[i].id}`);
  assert.ok(Math.max(...tiers) <= rule.cap && rule.cap <= 5, `a fight may run ${Math.max(...tiers)} min`);
});

test('the door cuts a beast too strong for the realm\'s rounds, and its blows carry what was cut', () => {
  const state = stateAt('h05'), r = lengthRule(content, state);
  const out = fightLength(content, state, { hp: 99 }, { hp: 99 });
  const share = 20 * 0.7;
  assert.ok(out.hp * share <= r.hp + 1, `cut to ${out.hp * share}, the rule's ${r.hp}`);
  assert.ok(out.might > 1, 'its blows carry what its 气血 lost');
  assert.equal(out.heals, rule.heals);
  // A frail beast keeps its own 气血; a 试 and a `long` foe are left as they are.
  assert.equal(fightLength(content, state, { hp: 1 }, { hp: 1 }).hp, 1);
  assert.deepEqual(fightLength(content, state, { hp: 99, trial: { survive: 3 } }, { hp: 99 }), { hp: 99 });
  assert.deepEqual(fightLength(content, state, { hp: 99, long: true }, { hp: 99 }), { hp: 99 });
});

test('a beast heals as often as the door says, and never past its most', () => {
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  const setup = { mode: 'pve', seed: 'heal', you: { tier: 'qi', root: 'wood', deck: Array(10).fill('mutang') }, foe: { tier: 'qi', root: 'earth', deck: Array(12).fill('zhuguang'), heals: 1, healMax: 3 } };
  const st = begin(setup, catalog);
  st.foe.hp = 2;
  for (let g = 0; g < 40 && st.outcome === 'open' && st.turn < 12; g += 1) {
    if (st.whose === 'foe') foeTurn(st); else act(st, { kind: 'end' }, 'you');
  }
  const heals = st.log.filter(e => e.act === 'heal' && e.who === 'foe');
  assert.equal(heals.length, 1, `healed ${heals.length} times`);
  assert.ok(heals[0].amount <= 3);
});

for (const f of FIGHTS) {
  test(`${f.name} (${f.at}): within its realm's minutes`, () => {
    const r = lengthOf(f, 10);
    if (!r.held) return;
    assert.ok(r.minutes <= r.limit, `${r.key} runs ${r.rounds.toFixed(1)} rounds ≈ ${r.minutes.toFixed(1)} min at ${r.tier} (ceiling ${r.limit}) — cut its 气血 or let balance.json fight_length cut it`);
  });
}
