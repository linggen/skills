// duel-deck-size.mjs — deck size and copies, measured one thing at a time (斗法 v4, design.md § A deck is fifteen).
// Mirror: both seats hold the same list (drawn per deal from one pool of par cards, along one cost curve scaled to the size),
// on one sheet (20 + level, no root, no gear). The beast's seat is `careful`; his is plain · careful · lookahead (honest). The
// first seat alternates by deal. What changes between rows is the size (or the copies cap) and nothing else: same pool,
// same curve shape, same deals, same lines. Nothing is written.
//
//   node tools/duel-deck-size.mjs [--sizes 10,12,15,20] [--copies 2] [--seeds 200] [--from 0] [--lines plain,careful,lookahead] [--level 10] [--json]
import { pathToFileURL } from 'node:url';
import { act, begin, MODES, shuffle } from '../scripts/battle.js';
import { carefulFor, lookaheadFor, plainFor } from '../scripts/fightline.js';
import { paperTable, sheetSetup } from './duel-audit.mjs';
import { content } from './story-fights.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const LINES = { plain: plainFor, careful: carefulFor, lookahead: lookaheadFor };
// The fifteen's curve at 筑基 (rules/cards.mjs fairDeck `foundation`), scaled to any size by position.
const CURVE15 = [1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5];
export const curveOf = n => Array.from({ length: n }, (_, i) => CURVE15[Math.floor((i * CURVE15.length) / n)]);

/// The pool: plain cards (no owner, no verb that reads a board it may not have) near par points, six of each cost 1–4, four of 5.
export function parPool() {
  const plain = paperTable().filter(r => !r.owner && !/buff|rally|summon|chain|swallow|drought|drain|dodge|bite|draw|heal/.test(r.what));
  const out = [];
  for (const [cost, n] of [[1, 6], [2, 6], [3, 6], [4, 6], [5, 4]]) {
    const row = plain.filter(r => r.cost === cost).sort((a, b) => Math.abs(a.points - 1) - Math.abs(b.points - 1) || a.id.localeCompare(b.id)).slice(0, n);
    out.push(...row.map(r => r.id));
  }
  return out;
}

/// One deal's list: along the curve, a card of that cost drawn from the pool (seeded), at most `copies` of one; a cost with none left takes the nearest.
export function dealList(pool, size, copies, seed) {
  const byCost = new Map(), counts = new Map(), out = [];
  for (const id of shuffle([...pool], `list|${seed}`)) { const c = catalog[id].cost; if (!byCost.has(c)) byCost.set(c, []); byCost.get(c).push(id); }
  for (const rung of curveOf(size)) {
    const near = [rung, rung - 1, rung + 1, rung - 2, rung + 2, rung - 3, rung + 3];
    // Fewest copies first within the cost: kinds are spread before any second copy (so a cap that is not reached changes nothing).
    const row = near.map(c => (byCost.get(c) ?? []).filter(x => (counts.get(x) ?? 0) < copies)).find(r => r.length);
    const id = row && [...row].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
    if (!id) throw new Error(`pool too small for ${size} at ${copies} copies`);
    out.push(id); counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return out;
}

export function fight(list, line, k, level) {
  const mode = MODES.pve, had = mode.youFirst;
  let st;
  try { mode.youFirst = k % 2 === 0; st = begin(sheetSetup(list, list, `size|${k}`, level), catalog); } finally { mode.youFirst = had; }
  let dry = false, n = 0;
  for (; n < 400 && st.outcome === 'open'; n++) {
    const who = st.whose, a = (who === 'you' ? LINES[line] : carefulFor)(st, who);
    act(st, a ?? { kind: 'end' }, who);
    dry ||= st.you.deck.length === 0 || st.foe.deck.length === 0;
  }
  return { won: st.outcome === 'won', open: st.outcome === 'open', dry, plies: n };
}

export function run({ sizes = [10, 12, 15, 20], copies = 2, seeds = 200, from = 0, lines = ['plain', 'careful', 'lookahead'], level = 10 } = {}) {
  const pool = parPool(), rows = [];
  for (const size of sizes) for (const line of lines) {
    let won = 0, dry = 0, plies = 0, open = 0;
    for (let k = from; k < from + seeds; k++) {
      const r = fight(dealList(pool, size, copies, k), line, k, level);
      won += r.won; dry += r.dry; plies += r.plies; open += r.open;
    }
    rows.push({ size, copies, line, win: +(100 * won / seeds).toFixed(1), dry: +(100 * dry / seeds).toFixed(1), plies: +(plies / seeds).toFixed(1), open, seeds });
    console.error(`size ${size} copies ${copies} ${line}: ${rows.at(-1).win}%`);
  }
  return { pool, level, rows };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const out = run({ sizes: get('--sizes', '10,12,15,20').split(',').map(Number), copies: Number(get('--copies', 2)), seeds: Number(get('--seeds', 200)), from: Number(get('--from', 0)), lines: get('--lines', 'plain,careful,lookahead').split(','), level: Number(get('--level', 10)) });
  console.log(JSON.stringify(out, null, args.includes('--json') ? 1 : 0));
}
