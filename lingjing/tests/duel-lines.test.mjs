// The instrument that weighs 斗法 v4 (design.md § 「斗法 v4」): in a FAIR fight — both sides one sheet, a dry deck costing
// the beast 反噬 as it costs him — a player who thinks (fightline.js lookahead) beats one who plays carelessly
// (trial-sim.mjs fightOnce), and neither always wins. Measured by tools/duel-lines.mjs with the even switch on in
// memory. The thinking line once played its fights out by a face-rush that read no pile and no board, and LOST to the
// careless one under these rules (絜钩 13% to 98%); its rollout now reads the fight's mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, keyOf, setupOf, content } from '../tools/story-fights.mjs';
import { duel, withRules } from '../tools/duel-lines.mjs';
import { fairMode } from '../scripts/fightline.js';
import { begin } from '../scripts/battle.js';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const SEEDS = 24;
// Fights where the careless line is neither always winning nor always losing, and ones it wins outright.
const MID = ['chihu@yaoyuan-wai', 'mihou@yaoyuan-wai', 'zheng@yaoyuan-wai', 'yezhu@mengshan', 'lingling@yaoyuan-wai', 'cangying@yaoyuan-wai'];
const EASY = ['xiegou@yaoyuan-wai', 'xiong@mengshan'];
const fight = key => FIGHTS.find(f => keyOf(f) === key);

test('even rules: the line that thinks beats the careless one by a wide margin', () => {
  const rows = MID.map(k => ({ k, ...duel(fight(k), { on: true, seeds: SEEDS }) }));
  const gap = rows.reduce((n, r) => n + r.gap, 0) / rows.length;
  assert.ok(gap >= 0.25, `mean gap ${(gap * 100).toFixed(0)} points over ${MID.join(', ')}: ${JSON.stringify(rows)}`);
  for (const r of rows) {
    assert.ok(r.thinking >= r.careless, `${r.k}: thinking ${r.thinking} below careless ${r.careless}`);
    assert.ok(r.careless > 0 && r.careless < 1, `${r.k}: the careless line should neither always win nor always lose`);
  }
});

test('even rules: thinking is never worse where the careless line already wins (絜钩 once 13% to 98%)', () => {
  for (const k of EASY) {
    const r = duel(fight(k), { on: true, seeds: SEEDS });
    assert.ok(r.thinking >= r.careless - 0.05, `${k}: thinking ${r.thinking} vs careless ${r.careless}`);
  }
});

test('the rollout is read off the fight: even sides play out by the careful line, the old rules by the plain one', () => {
  const f = fight(MID[0]);
  assert.equal(withRules(true, () => fairMode(begin(setupOf(f, { party: [] }), catalog))), true);
  assert.equal(withRules(false, () => fairMode(begin(setupOf(f, { party: [] }), catalog))), false);
  assert.equal(fairMode(null), false);
});
