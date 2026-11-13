// duel-decks.mjs — make the beasts' tens COMPARABLE to his (design.md § 斗法 v4; the builder's ruling 2026-11-13: the two sides are equal, what differs is how
// well the beast plays). The measure: his ten (bare, as the road leaves it) against the beast's ten, BOTH sides playing the `careful` line, over fixed seeds —
// 58% for him is a coin with the first move (doc/duel-audit-2026-11-12.md, the careful mirror). A fight further than 15 points from it is OUT OF LINE, and a
// PROPOSED deck is built for it: swaps of 1..8 cards (each within two of the cost of the card it replaces), its own cards first (the rest of its twelve), then cards of its root and the neutral ones, by the
// card's mirror delta (the audit's appendix, 400 seeds; none counts 0), within the one budget curve, two of a kind at most; a card named for the beast
// (its own id, or an owner) is never swapped out. Nothing is written: the proposals are a map for `duel-lines.mjs --decks`.
//
//   node tools/duel-decks.mjs [--only key,key] [--seeds 60] [--confirm 100] [--json]
import fs from 'node:fs';
import { FIGHTS, content, foeOf, keyOf, rateOf, roadState, setupOf } from './story-fights.mjs';
import { withRules, withDeck, FIT } from './duel-lines.mjs';
import { beastLevel, beastTen } from '../scripts/rules/cards.mjs';
import { deckable } from './duel-audit.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
export const COIN = 0.58, OUT = 0.15;
/// Everyone plays `careful`, no level step: only the ten differs.
export const SAME_LINE = { ...FIT, ai: { by_standing: Object.fromEntries(['roaming', 'room', 'xiong', 'boss', 'story'].map(s => [s, 'careful'])) } };

/// The mirror delta of each card from the audit's appendix (`| id | name | kind | cost | what | points | delta |`).
export function mirrorDeltas(text = fs.readFileSync(new URL('../doc/duel-audit-2026-11-12.md', import.meta.url), 'utf8')) {
  const out = {};
  for (const m of text.split('## Appendix')[1]?.split('## Follow-up')[0]?.matchAll(/^\| (\w+) \|.*\| ([+-]?\d+(?:\.\d+)?) \|$/gm) ?? []) out[m[1]] = Number(m[2]);
  return out;
}
export const costOf = d => d.reduce((n, id) => n + (catalog[id]?.cost ?? 1), 0);
const count = (d, id) => d.filter(x => x === id).length;

/// Pure: `ten` with up to `swaps` cards exchanged toward stronger (+1) or weaker (-1), from `own` then `pool`; `delta` scores a card, `keep` are never taken out.
export function swapped(ten, swaps, dir, { own, pool, delta, budget, keep = [] }) {
  const d = [...ten], tried = new Set();
  for (let n = 0; n < swaps; n += 1) {
    const order = d.map((id, i) => [id, i]).filter(([id, i]) => !tried.has(i) && !keep.includes(id)).sort((a, b) => dir * (delta(a[0]) - delta(b[0])) || a[1] - b[1]);
    let done = false;
    for (const [out, i] of order) {
      const c = catalog[out].cost;
      const cand = [...own, ...pool].filter(id => id !== out && count(d, id) < 2 && Math.abs(catalog[id].cost - c) <= 2 && costOf(d) - c + catalog[id].cost <= budget && dir * (delta(id) - delta(out)) > 0)
        .sort((a, b) => dir * (delta(b) - delta(a)) || (own.includes(b) ? 1 : 0) - (own.includes(a) ? 1 : 0) || (a < b ? -1 : 1));
      tried.add(i);
      if (cand.length) { d[i] = cand[0]; done = true; break; }
    }
    if (!done) break;
  }
  return d;
}

/// What a fight stands on: his ten, the beast's, its level, the budget, its own cards and its root's.
export function context(f) {
  return withRules(true, () => {
    const st = roadState(f, {}), beast = foeOf(f), L = beastLevel(content, st, beast), k = content.balance.duel_hp.foe.deck, delta = mirrorDeltas();
    const own = [...new Set(beast.deck ?? [])], root = beast.root;
    const pool = Object.values(catalog).filter(c => deckable(c) && !c.owner && (c.element === root || c.element == null) && c.cost <= 5 && !own.includes(c.id)).map(c => c.id).sort();
    return { L, budget: Math.round(k.base + k.per_level * L), ten: beastTen(content, beast, L), his: setupOf(f, { party: [], bare: true }).you.deck, own, pool, delta: id => delta[id] ?? 0, keep: [beast.id ?? f.id, ...own.filter(id => catalog[id]?.owner === (beast.id ?? f.id))] };
  }, SAME_LINE);
}
/// His win over a fixed number of seeds, both sides `careful`, bare, with the beast's ten `deck` (null: as it stands).
export const comparable = (f, deck, seeds) => withDeck(f, deck, () => withRules(true, () => rateOf(f, seeds, 0, 'careful', { party: [], bare: true }).win, SAME_LINE));

/// The proposal for one fight: null when it is in line.
export function propose(f, { seeds = 60, confirm = 100 } = {}) {
  const ctx = context(f), base = comparable(f, null, seeds);
  const row = { key: keyOf(f), level: ctx.L, budget: ctx.budget, his: ctx.his, hisCost: costOf(ctx.his), today: ctx.ten, todayCost: costOf(ctx.ten), before: comparable(f, null, confirm) };
  if (Math.abs(base - COIN) <= OUT) return { ...row, proposed: null };
  const dir = base > COIN ? 1 : -1; // he wins too often: the beast gets stronger
  const cands = [1, 2, 3, 4, 5, 6, 7, 8].map(n => { const deck = swapped(ctx.ten, n, dir, ctx); return { n, deck, win: comparable(f, deck, seeds) }; });
  const best = cands.reduce((a, b) => (Math.abs(b.win - COIN) < Math.abs(a.win - COIN) ? b : a));
  return { ...row, proposed: best.deck, proposedCost: costOf(best.deck), swaps: best.n, curve: cands.map(c => Math.round(c.win * 100)), after: comparable(f, best.deck, confirm) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const only = arg('--only', null)?.split(','), seeds = Number(arg('--seeds', 60)), confirm = Number(arg('--confirm', 100));
  const rows = FIGHTS.filter(f => (!only || only.includes(keyOf(f))) && withRules(true, () => setupOf(f, { party: [] }).even, FIT)).map(f => propose(f, { seeds, confirm }));
  if (args.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else for (const r of rows) console.log(r.key.padEnd(28), `L${r.level}`, `his ${r.hisCost} its ${r.todayCost}`, `${Math.round(r.before * 100)}`, r.proposed ? `-> ${Math.round(r.after * 100)} (${r.swaps} swaps, ${r.proposedCost}) ${r.curve.join('/')}` : 'in line');
}
