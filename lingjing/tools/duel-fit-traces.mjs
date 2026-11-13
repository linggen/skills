// Capture complete, reproducible fight traces for the extreme roaming encounters.
// The fair switch is applied only in memory; no game content or save is changed.
import fs from 'node:fs';
import { FIGHTS, content, keyOf, setupOf } from './story-fights.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { begin, act, foeStep, clash } from '../scripts/battle.js';
import { carefulFor } from '../scripts/fightline.js';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const file = process.argv[2] ?? '/tmp/duel-fit-2026-11-13.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const road = data.rows.filter(r => r.group === 'roaming').sort((a, b) => a.result.win - b.result.win);
const chosen = [...road.slice(0, 6), ...road.slice(-6)];
const traces = withRules(true, () => chosen.map(row => {
  const fight = FIGHTS.find(f => keyOf(f) === row.key);
  if (!fight) throw Error(`No encounter ${row.key}`);
  const setup = setupOf(fight, { party: [] });
  const games = [];
  for (let k = 0; k < 10; k++) {
    const st = begin({ ...structuredClone(setup), seed: `band|${k}` }, catalog);
    const actions = [];
    for (let n = 0; n < 300 && st.outcome === 'open'; n++) {
      const who = st.whose, start = st.log.length;
      const action = who === 'you' ? carefulFor(st, who) ?? { kind: 'end' } : null;
      if (who === 'foe') foeStep(st);
      else if (!act(st, action, who).ok) throw Error(`Illegal action in ${row.key}`);
      actions.push({ turn: st.turn, who, action, events: st.log.slice(start), hp: [st.you.hp, st.foe.hp] });
    }
    games.push({ seed: `band|${k}`, outcome: st.outcome, turns: st.turn, actions });
  }
  return { key: row.key, name: row.name, win: row.result.win, setup,
    matchup: { youRootToFoe: clash(setup.you.root, setup.foe.root), foeRootToYou: clash(setup.foe.root, setup.you.root), playerCardElements: Object.fromEntries([...new Set(setup.you.deck.map(id => catalog[id]?.element).filter(Boolean))].map(el => [el, clash(el, setup.foe.root)])), foeCardElements: Object.fromEntries([...new Set(setup.foe.deck.map(id => catalog[id]?.element).filter(Boolean))].map(el => [el, clash(el, setup.you.root)])) },
    playerCards: setup.you.deck.map(id => catalog[id]), foeCards: setup.foe.deck.map(id => catalog[id]), games };
}), FIT);
console.log(JSON.stringify({ seeds: 10, traces }, null, 2));
