// fight-length.mjs — how long each card fight of 卷一 runs, against its realm's ceiling
// (balance.json fight_length; Hanli 2026-11-07: 「一局要玩快10分钟。能控制在3分钟吗」 — about 3 minutes at
// 练气, longer with more cards and higher realms but within about 5).
//
//   node tools/fight-length.mjs [--seeds N] [--json]
//
// Every fight of tools/story-fights.mjs FIGHTS at its first meeting, with the road's hand and party,
// played by the band's player (fightline.js lookahead) over fixed seeds: rounds (his turn and the
// beast's), his moves (each card, strike, attack, pill and 结束回合), the logged moves of both sides
// (what his recording counted: 当康 ≈ 150 ≈ his 「157」), and minutes at `sec_per_round`. A 试
// (`trial`) or a foe that says `long` is listed but not held to the ceiling — its length is the
// story's. tests/fight-length.test.mjs fails a fight over its ceiling.
import { act, begin, foeTurn } from '../scripts/battle.js';
import { lookahead } from '../scripts/fightline.js';
import { lengthRule } from '../scripts/rules/cards.mjs';
import { content, FIGHTS, foeOf, keyOf, roadState, setupOf } from './story-fights.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const MOVES = new Set(['played', 'power', 'hurt', 'hurt-minion', 'hurt-ally', 'withdrew', 'heal', 'pill', 'summoned', 'buff', 'rally']);

/* One fight played whole: its rounds, his moves, both sides' logged moves, the outcome. */
function once(setup) {
  const st = begin(setup, catalog);
  let rounds = 0, mine = 0, last = null;
  for (let g = 0; g < 500 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    if (last !== st.turn) { rounds += 1; last = st.turn; }
    act(st, lookahead(st), 'you');
    mine += 1;
  }
  return { rounds, mine, moves: st.log.filter(e => MOVES.has(e.act)).length, outcome: st.outcome };
}

/* Each fight's length over `seeds` deals, with its realm's ceiling. */
export function lengthOf(f, seeds = 12) {
  const setup = setupOf(f), state = roadState(f), rule = lengthRule(content, state), foe = foeOf(f);
  const sec = content.balance?.fight_length?.sec_per_round ?? 18.6;
  let rounds = 0, mine = 0, moves = 0, won = 0;
  for (let k = 0; k < seeds; k += 1) {
    const r = once({ ...setup, seed: `band|${k}` });
    rounds += r.rounds; mine += r.mine; moves += r.moves; won += r.outcome === 'won' ? 1 : 0;
  }
  const avg = rounds / seeds;
  return {
    key: keyOf(f), name: f.name, at: f.at, tier: state.tier, step: state.step, story: !f.pool,
    held: Boolean(rule) && !foe.trial && !foe.long,
    hp: begin(setup, catalog).foe.hpMax, might: setup.foe.might ?? 1,
    rounds: avg, mine: mine / seeds, moves: moves / seeds, win: won / seeds,
    minutes: (avg * sec) / 60, limit: rule?.minutes ?? null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const seeds = Number(args[args.indexOf('--seeds') + 1]) || 12;
  const rows = FIGHTS.map(f => lengthOf(f, seeds));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else for (const r of rows) {
    const over = r.held && r.minutes > r.limit ? '  OVER' : r.held ? '' : '  (not held: 试/long)';
    console.log(`${r.key.padEnd(30)} ${r.at.padEnd(5)} ${r.tier}${r.step} hp ${String(r.hp).padStart(3)}${r.might > 1 ? ` ×${r.might}` : ''}  rounds ${r.rounds.toFixed(1).padStart(4)}  his ${r.mine.toFixed(0).padStart(3)}  moves ${r.moves.toFixed(0).padStart(3)}  ${r.minutes.toFixed(1)} min / ${r.limit}${over}`);
  }
}
