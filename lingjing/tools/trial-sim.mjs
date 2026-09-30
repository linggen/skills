// trial-sim.mjs — one story trial, weighed with the deck a real player holds
// when they reach it (design.md § 斗法 v3, balance gate). The field gate
// (battle-sim.mjs) weighs every beast against built decks; a story fight that
// must be won to go on is weighed here against the hand the road actually
// deals: the starter, the tamed 狰, one card from each win before it.
//   node tools/trial-sim.mjs [creature] [--seeds N]
import { act, begin, foeTurn, offers } from '../scripts/battle.js';
import { loadContent } from '../scripts/content.mjs';
import { deckFor, fightSetup } from '../scripts/rules.mjs';
import { gainCard, winCard } from '../scripts/rules/cards.mjs';
import { creatureOf } from '../scripts/rules/world.mjs';
import fs from 'node:fs';

const content = loadContent();
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const args = process.argv.slice(2);
const id = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--seeds') ?? 'foe-shuanglong';
const seeds = Number(args[args.indexOf('--seeds') + 1]) || 400;

/* The road to 第十回, as the rules deal it: the starter at the root test,
   银月 (asleep in the token here: she does not fight), 狰 tamed at the 药园,
   and one card from each fight won on the way. */
const BEFORE = ['longzhi', 'zheng', 'gui', 'foe-sunergou', 'foe-maxiaobao', 'foe-shijie'];
export function roadHand(base, day = new Date('2026-09-29T11:00:00Z')) {
  const s = structuredClone(base);
  s.cards = [...(content.cards.starter ?? []).filter(c => catalog[c]), 'yinyue'];
  gainCard(content, s, 'zheng', { how: 'tame', creature: 'zheng' });
  BEFORE.forEach((c, i) => winCard(content, s, creatureOf(content, c), new Date(day.getTime() - (BEFORE.length - i) * 86400000)));
  return s;
}

/* A careful player: every legal move weighed by what it leaves on the board
   (the gate's attentive line, in small). */
const body = side => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6 + (m.taunt ? 2 : 0), 0);
function careful(st) {
  const can = offers(st).filter(o => o.ok && o.action.kind !== 'end');
  let best = null, top = 0.5;
  for (const o of can) {
    const copy = structuredClone({ ...st, catalog: undefined }); copy.catalog = st.catalog;
    if (!act(copy, o.action, 'you').ok) continue;
    const v = (st.foe.hp - copy.foe.hp) * 2 + (copy.you.hp - st.you.hp) + (body(copy.you) - body(st.you)) * 1.2 + (body(st.foe) - body(copy.foe));
    if (v > top) { top = v; best = o; }
  }
  return best;
}
export function fightOnce(setup) {
  const st = begin(setup, catalog);
  for (let g = 0; g < 200 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const o = careful(st);
    act(st, o ? o.action : { kind: 'end' }, 'you');
  }
  return st;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/saves/ji-altar.json', import.meta.url), 'utf8'));
  const road = roadHand(base);
  const creature = creatureOf(content, id);
  const tally = { won: 0, lost: 0, withdrew: 0, open: 0 }, turns = [];
  for (let k = 0; k < seeds; k += 1) {
    const setup = { ...fightSetup(content, road, creature, new Date('2026-09-29T11:00:00Z')), seed: `trial|${k}` };
    const st = fightOnce(setup);
    tally[st.outcome] += 1;
    turns.push(st.turn);
  }
  const deck = deckFor(content, road);
  console.log(JSON.stringify({ creature: id, held: road.cards, deck, tally, win: +(tally.won / seeds * 100).toFixed(1), turns: +(turns.reduce((a, b) => a + b, 0) / seeds).toFixed(1) }, null, 1));
}
