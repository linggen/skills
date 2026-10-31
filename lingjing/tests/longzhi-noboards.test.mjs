// 三试 · 蠪侄 (gate-longzhi) on a save that skipped every board before it: no 一箭 (射鹿's), only the book's 娘的饼 and
// 吐纳 and the 试's own 一滚 · 石子. Never near-impossible (2026-10-31, the agent's pick for Hanli: about 1 in 3 for a
// player who thinks a turn ahead — the fight tuned, not his earned power; the lock's 「算了，往下走」 stays the way on).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIGHTS, stateAt, content, NOW, foeOf } from '../tools/story-fights.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { act, begin, foeTurn } from '../scripts/battle.js';
import { lookahead } from '../tools/trial-sim.mjs';

test('三试 with every board skipped: won about a third of the time by a careful hand', () => {
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
  const f = FIGHTS.find(x => x.id === 'longzhi' && x.scene);
  const st = stateAt(f.at);
  st.cards = ['niangbing', 'tuna'];
  const setup = fightSetup(content, st, foeOf(f), NOW, null);
  const N = 120;
  let won = 0;
  for (let k = 0; k < N; k += 1) {
    const s = begin({ ...setup, seed: `band|${k}` }, catalog);
    for (let g = 0; g < 300 && s.outcome === 'open'; g += 1) { if (s.whose === 'foe') { foeTurn(s); continue; } act(s, lookahead(s), 'you'); }
    if (s.outcome === 'won') won += 1;
  }
  assert.ok(won / N >= 0.2 && won / N <= 0.5, `no-boards 三试 won ${(won / N * 100).toFixed(0)}%`);
});
