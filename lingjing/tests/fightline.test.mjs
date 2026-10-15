// The crawler's line of play (fightline.js) wins the fights 卷一 asks of a player who plays with
// attention — 三试's 蠪侄 first — so the page crawl can play on past them with real taps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { begin, foeTurn, act } from '../scripts/battle.js';
import { bestMove } from '../scripts/fightline.js';
import { TO_HALL, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const CATALOG = Object.fromEntries(content.cards.cards.map((c) => [c.id, c]));

function play(setup) {
  const st = begin(setup, CATALOG);
  for (let guard = 0; guard < 300 && st.outcome === 'open'; guard++) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const m = bestMove(st);
    act(st, m.kind === 'end' ? { kind: 'end' } : { kind: m.kind, index: m.index, target: m.target }, 'you');
  }
  return st.outcome;
}

test('三试 · 蠪侄: the attentive line wins it most days', () => {
  // The save at 00-longzhi, the fight's own setup, over a run of days (each its own deal).
  const at = walk(newState(content, 'zh', NOW), TO_HALL.slice(0, TO_HALL.findIndex(([v, a]) => v === 'won' && a.id === 'gate-longzhi')), content, NOW);
  assert.equal(at.scene, '00-longzhi');
  let won = 0;
  for (let d = 0; d < 10; d++) {
    const now = new Date(NOW.getTime() + d * 86400000);
    const setup = fightSetup(content, at, content.creatures.creatures.find((c) => c.id === 'longzhi'), now, { id: 'gate-longzhi', kind: 'duel', creature: 'longzhi' }, `gate-longzhi|${d}`);
    if (play(setup) === 'won') won++;
  }
  assert.ok(won >= 6, `won ${won} of 10`);
});
