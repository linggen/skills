// The crawler's line of play (fightline.js) wins the fights 卷一 asks of a player who plays with
// attention — 三试's 蠪侄 first — so the page crawl can play on past them with real taps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { fightSetup } from '../scripts/rules.mjs';
import { begin, foeTurn, act } from '../scripts/battle.js';
import { bestMove } from '../scripts/fightline.js';
import { foeOf } from '../scripts/rules/world.mjs';
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
  const game = content.chapters['00-prologue'].scenes['00-longzhi'].exits.find((e) => e.game?.creature === 'longzhi').game;
  assert.ok(at.cards.includes('niangbing') && at.cards.includes('yijian') && at.cards.includes('tuna'), `the road's three: ${at.cards}`);
  let won = 0;
  for (let d = 0; d < 10; d++) {
    const now = new Date(NOW.getTime() + d * 86400000);
    // The scene's own 试 (survive · 一滚 · 石子, cards.md § 4), as the duel's door reads it.
    const setup = fightSetup(content, at, foeOf(content, game), now, game.id, `gate-longzhi|${d}`);
    if (play(setup) === 'won') won++;
  }
  assert.ok(won >= 6, `won ${won} of 10`);
});
