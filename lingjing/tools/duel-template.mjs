// duel-template.mjs — the beasts' decks by template (斗法 v4, design.md § The beasts' decks by template). For every first meeting
// the fair rules reach (tools/duel-fit-report.mjs encounters): the deck he is expected to hold there (rules/cards.mjs deckFor on the
// road's save), and the beast's built against it — the same size, at most two of a card; one or two signature cards that are the
// beast's own (cards.json `from` names it: its `foe` card first, then what it leaves, `beast`), two copies each; every other slot a
// card of the shared pool at his card's cost (±1), weighed to `ratio[standing]` × his card's value (tools/duel-audit.mjs cardPoints:
// damage-equivalents), leaning to cards of its own deck and its root. No pool card is another beast's own.
//
//   node tools/duel-template.mjs [--ratio '{"roaming":1,...}'] [--write]      (writes worlds/jiuding/duel-decks.json with --write)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cardPoints } from './duel-audit.mjs';
import { encounters } from './duel-fit-report.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { content, FIGHTS, foeOf, keyOf } from './story-fights.mjs';
import { deckFor, fightLevel, beastLevel, foeLevel } from '../scripts/rules/cards.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const value = id => cardPoints(catalog[id]).value;
const costOf = id => catalog[id]?.cost ?? 1;
export const RATIO = { roaming: 1, story: 1, room: 1, xiong: 1, boss: 1 };
const OWN_KINDS = ['foe', 'beast', 'tame'];
const sum = ids => ids.reduce((n, id) => n + value(id), 0);

const ownerOf = c => (c.from ?? []).filter(f => f.kind === 'foe').map(f => f.creature);
/// The shared pool: what any seat may field (no owner, token, gear, lent, pill, charm or mortal's own; not a teaching blow).
export const POOL = content.cards.cards.filter(c => !c._token && !c.owner && !c.gear && !c.lent && !c.pill && !c.charm && !c.mortal && c.kind && (c.cost ?? 0) >= 1).map(c => c.id);
const fits = (id, root) => catalog[id].kind !== 'spell' || !catalog[id].element || catalog[id].element === root;

/// Its own cards, best first: `foe` (金/宝石) before `beast` (银) before `tame`, then by how many it holds, then dearer first.
export function signatureOf(creatureId, deck) {
  const n = id => deck.filter(x => x === id).length;
  const own = content.cards.cards.filter(c => !c._token && !c.owner && (c.from ?? []).some(f => OWN_KINDS.includes(f.kind) && f.creature === creatureId) && (c.cost ?? 0) >= 1);
  const rank = c => OWN_KINDS.indexOf((c.from.find(f => OWN_KINDS.includes(f.kind) && f.creature === creatureId)).kind);
  return own.sort((a, b) => rank(a) - rank(b) || n(b.id) - n(a.id) || (b.cost ?? 1) - (a.cost ?? 1) || a.id.localeCompare(b.id)).map(c => c.id);
}

/// The beast's deck against `his` (ids): signatures, then a pool card per remaining slot of his.
export function template({ id, root, deck = [] }, his, ratio = 1, { kinds = 2 } = {}) {
  // A beast with no card of its own (its `from` names none) keeps its most-held card as its mark (its own deck, still).
  const n = x => deck.filter(y => y === x).length, held = [...new Set(deck)].filter(x => POOL.includes(x) && fits(x, root)).sort((a, b) => n(b) - n(a) || costOf(b) - costOf(a) || a.localeCompare(b));
  const owned = signatureOf(id, deck).filter(x => fits(x, root));
  const size = his.length, sig = (owned.length ? owned : held.includes(id) ? [id] : held.slice(0, 1)).slice(0, kinds);
  const out = [];
  for (const s of sig) for (let i = 0; i < 2 && out.length < Math.min(4, Math.floor(size / 3)); i++) out.push(s);
  // His slots, dearest first; the slots the signatures take are those of the nearest cost.
  const slots = [...his].sort((a, b) => costOf(b) - costOf(a) || a.localeCompare(b));
  for (const s of out) { const at = slots.reduce((best, h, i) => (Math.abs(costOf(h) - costOf(s)) < Math.abs(costOf(slots[best]) - costOf(s)) ? i : best), 0); slots.splice(at, 1); }
  const others = new Set(content.creatures.creatures.map(c => c.id).filter(x => x !== id));
  const pool = POOL.filter(x => fits(x, root) && !ownerOf(catalog[x]).some(o => others.has(o)) && !sig.includes(x));
  const counts = new Map(out.map(x => [x, out.filter(y => y === x).length])), mine = new Set(deck);
  for (const h of slots) {
    // Mirror (MIRROR=1, a measurement only): his own card where the beast may field it.
    if (process.env.MIRROR === '1' && fits(h, root) && (counts.get(h) ?? 0) < 2) { out.push(h); counts.set(h, (counts.get(h) ?? 0) + 1); continue; }
    const want = ratio * value(h);
    const best = pool.filter(x => (counts.get(x) ?? 0) < 2 && Math.abs(costOf(x) - costOf(h)) <= 1)
      .map(x => ({ x, s: Math.abs(value(x) - want) + 0.5 * Math.abs(costOf(x) - costOf(h)) - (mine.has(x) ? 0.6 : 0) - (catalog[x].element === root ? 0.3 : 0) }))
      .sort((a, b) => a.s - b.s || a.x.localeCompare(b.x))[0]?.x;
    if (!best) continue;
    out.push(best); counts.set(best, (counts.get(best) ?? 0) + 1);
  }
  // The budget: swap one pool slot at a time (same cost ±1 as the card it holds) while it brings the deck's value nearer the target.
  const target = ratio * sum(his), fixed = out.length - slots.length;
  for (let guard = 0; guard < (process.env.MIRROR === '1' ? 0 : 40); guard++) {
    const diff = sum(out) - target;
    if (Math.abs(diff) <= 1) break;
    let swap = null;
    for (let i = fixed; i < out.length; i++) for (const x of pool) {
      if (x === out[i] || (counts.get(x) ?? 0) >= 2 || Math.abs(costOf(x) - costOf(out[i])) > 1) continue;
      const d = Math.abs(diff - value(out[i]) + value(x));
      if (d < Math.abs(diff) - 0.2 && (!swap || d < swap.d)) swap = { i, x, d };
    }
    if (!swap) break;
    counts.set(out[swap.i], counts.get(out[swap.i]) - 1); counts.set(swap.x, (counts.get(swap.x) ?? 0) + 1); out[swap.i] = swap.x;
  }
  return out;
}

/// Every encounter's template under `ratio` (by standing): rows { key, group, creature, level, his, deck, sig, own }.
export function build(ratio = RATIO) {
  return withRules(true, () => encounters().map(e => {
    const creature = e.creature ?? foeOf(FIGHTS.find(f => keyOf(f) === e.key)), cid = creature.id ?? creature.creature;
    const his = deckFor(content, e.state), L = (e.creature ? beastLevel(content, e.state, e.creature) : foeLevel(content, e.state, creature)) ?? fightLevel(content, e.state);
    const deck = template({ id: cid, root: creature.root, deck: creature.deck ?? [] }, his, ratio[e.group] ?? 1);
    const own = signatureOf(cid, creature.deck ?? []);
    return { key: e.key, group: e.group, creature: cid, level: L, his, deck, sig: deck.filter(x => own.includes(x)), hisValue: +sum(his).toFixed(1), value: +sum(deck).toFixed(1) };
  }), FIT);
}

/// The data the rules read (rules/cards.mjs templateDeck): by `creature|standing`, rows [from level, ids], earliest level first.
export function table(rows, ratio) {
  const decks = {};
  for (const r of [...rows].sort((a, b) => a.level - b.level)) {
    const k = `${r.creature}|${r.group}`, list = (decks[k] ??= []);
    if (!list.some(([L]) => L === r.level)) list.push([r.level, r.deck]);
  }
  return { _about: 'Written by tools/duel-template.mjs (斗法 v4, design.md § The beasts\' decks by template), never by hand. Read only where the fair rules stand (balance.json duel_hp.foe): a beast\'s deck by `creature|standing`, the row of the highest level at or below the beast\'s. Off, every beast fights its own deck as before.', ratio, decks };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), i = args.indexOf('--ratio'), ratio = { ...RATIO, ...(i < 0 ? {} : JSON.parse(args[i + 1])) };
  const rows = build(ratio);
  for (const r of rows) console.log(`${r.key.padEnd(28)} ${r.group.padEnd(8)} L${String(r.level).padEnd(3)} ${r.his.length}/${r.deck.length} value ${r.hisValue}/${r.value} sig ${[...new Set(r.sig)].join(',') || '-'}`);
  if (args.includes('--write')) fs.writeFileSync(new URL('../worlds/jiuding/duel-decks.json', import.meta.url), JSON.stringify(table(rows, ratio), null, 1) + '\n');
}
