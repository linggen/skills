// duel-budget-fit.mjs — one dial a beast: its template deck's budget (tools/duel-template.mjs `ratio`, his deck's value × ratio),
// bisected until the thinking line (`lookahead`, honest) wins about 45% bare at that first meeting (design.md § 斗法 v4 · The measure;
// tests/fight-band.test.mjs BARE 30–62). The deck's make (size, two of a card, its signature cards, the pool, the curve) is the template's;
// only the budget moves. Encounters that share a template row (`creature|standing` at one level) are fitted together.
// Fresh seeds confirm: `lookahead` (band|30000…), `careful` and `plain` (band|20000…). Nothing is written but the JSON on stdout.
//
//   node tools/duel-budget-fit.mjs [--seeds 30] [--confirm 60] [--steps 5] [--shard i/n] [--target 45]
import { pathToFileURL } from 'node:url';
import { encounters } from './duel-fit-report.mjs';
import { measure } from './duel-fit.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { template } from './duel-template.mjs';
import { content, FIGHTS, foeOf, keyOf, setupOf, NOW } from './story-fights.mjs';
import { deckFor, fightSetup, beastLevel, foeLevel, fightLevel } from '../scripts/rules/cards.mjs';

const fightOf = key => FIGHTS.find(f => keyOf(f) === key);
const setupFor = e => (e.creature ? fightSetup(content, e.state, e.creature, NOW) : setupOf(fightOf(e.key), { party: [] }));
const creatureFor = e => e.creature ?? foeOf(fightOf(e.key));
const levelFor = e => (e.creature ? beastLevel(content, e.state, e.creature) : foeLevel(content, e.state, creatureFor(e))) ?? fightLevel(content, e.state);

export function units() {
  const by = new Map();
  for (const e of encounters()) {
    const c = creatureFor(e), id = c.id ?? c.creature, k = `${id}|${e.group}|${levelFor(e)}`;
    if (!by.has(k)) by.set(k, { k, id, group: e.group, level: levelFor(e), creature: c, his: deckFor(content, e.state), list: [] });
    by.get(k).list.push(e);
  }
  return [...by.values()];
}
/// The unit's encounters with its template at `ratio` (written into the content in memory for the run of `g`).
function withRatio(u, ratio, g) {
  const deck = template({ id: u.id, root: u.creature.root, deck: u.creature.deck ?? [] }, u.his, ratio), had = content.duel_decks;
  content.duel_decks = { decks: { [`${u.id}|${u.group}`]: [[u.level, deck]] } };
  try { return g(deck); } finally { content.duel_decks = had; }
}
const rate = (u, ratio, line, seeds, from) => withRatio(u, ratio, () => u.list.reduce((n, e) => n + measure(setupFor(e), line, seeds, from).win, 0) / u.list.length);

export function fitUnit(u, { seeds = 30, steps = 5, target = 45, lo = 0.5, hi = 2.6 } = {}) {
  const tried = [];
  let best = null;
  for (let s = 0; s < steps; s++) {
    const r = Math.round(((lo + hi) / 2) * 100) / 100, w = rate(u, r, 'lookahead', seeds, 0);
    tried.push([r, w]);
    if (!best || Math.abs(w - target) < Math.abs(best[1] - target)) best = [r, w];
    if (w > target) lo = r; else hi = r;
  }
  return { ratio: best[0], screen: best[1], tried };
}

export function run({ seeds = 30, confirm = 60, steps = 5, shard = [0, 1], target = 45 } = {}) {
  content.duel_decks = null; // the before: every beast on its own deck
  return withRules(true, () => units().filter((_, i) => i % shard[1] === shard[0]).map(u => {
    const before = { lookahead: u.list.reduce((n, e) => n + measure(setupFor(e), 'lookahead', confirm, 30000).win, 0) / u.list.length };
    const f = fitUnit(u, { seeds, steps, target });
    const after = { lookahead: rate(u, f.ratio, 'lookahead', confirm, 30000), careful: rate(u, f.ratio, 'careful', 200, 20000), plain: rate(u, f.ratio, 'plain', 200, 20000) };
    const deck = withRatio(u, f.ratio, d => d);
    console.error(`${u.k} ${before.lookahead.toFixed(0)} -> ${after.lookahead.toFixed(0)} (ratio ${f.ratio})`);
    return { k: u.k, id: u.id, group: u.group, level: u.level, keys: u.list.map(e => e.key), his: u.his, deck, ...f, before, after };
  }), FIT);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  console.log(JSON.stringify(run({ seeds: Number(get('--seeds', 30)), confirm: Number(get('--confirm', 60)), steps: Number(get('--steps', 5)), target: Number(get('--target', 45)), shard: get('--shard', '0/1').split('/').map(Number) })));
}
