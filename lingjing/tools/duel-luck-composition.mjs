// Three fixed-seed deck comparisons; all rule changes are in memory.
import { encounters } from './duel-fit-report.mjs';
import { legacyEncounters } from './duel-luck.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { content } from './story-fights.mjs';
import { begin, act, foeStep } from '../scripts/battle.js';
import { carefulFor } from '../scripts/fightline.js';
import { strikeOf } from '../scripts/rules/cards.mjs';

const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const targets = { roaming: 65, story: 50, room: 55, xiong: 45, boss: 40 };
const groups = Object.keys(targets);
// Duplicate five existing slots, in deck order. Some baseline decks already have
// duplicates; this control deliberately changes multiplicity, not card identities.
const repeatFive = deck => [...deck, ...deck.slice(0, 5)];
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

export function measure(seeds = 40) {
  return withRules(true, () => {
    const fair = encounters(), old = legacyEncounters();
    // The current setup puts gear strikes in extra; the fit put them in the ten.
    for (const e of old) {
      const strike = strikeOf(content, e.state);
      if (strike) { const i = e.setup.you.extra.lastIndexOf(strike); if (i < 0) throw Error('missing strike'); e.setup.you.extra.splice(i, 1); }
    }
    if (fair.length !== 65 || old.length !== 65 || fair.some((e, i) => e.key !== old[i].key)) throw Error('encounter mismatch');
    const results = [];
    for (const mode of ['fit10', 'rule', 'same-cards']) {
      const rows = [];
      for (let i = 0; i < fair.length; i++) {
        const e = mode === 'rule' ? fair[i] : old[i], cfg = structuredClone(e.setup);
        if (mode === 'same-cards') for (const side of ['you', 'foe']) {
          if (cfg[side].deck.length !== 10) throw Error(`not ten cards: ${e.key} ${side}`);
          cfg[side].deck = repeatFive(cfg[side].deck);
        }
        let wins = 0, plies = 0, dry = 0, unfinished = 0;
        for (let k = 0; k < seeds; k++) {
          const st = begin({ ...cfg, seed: `band|${k}` }, catalog);
          let n = 0, empty = st.you.deck.length === 0 || st.foe.deck.length === 0;
          while (n < 300 && st.outcome === 'open') {
            n++;
            if (st.whose === 'foe') foeStep(st);
            else if (!act(st, carefulFor(st, 'you') ?? { kind: 'end' }, 'you').ok) throw Error('illegal action');
            empty ||= st.you.deck.length === 0 || st.foe.deck.length === 0;
          }
          wins += st.outcome === 'won'; plies += n; dry += empty; unfinished += st.outcome === 'open';
        }
        rows.push({ key: e.key, group: e.group, win: 100 * wins / seeds, plies: plies / seeds, dry: 100 * dry / seeds, unfinished, sizes: [cfg.you.deck.length, cfg.foe.deck.length] });
      }
      const avg = mean(rows.map(r => r.win));
      results.push({ mode, decided: 100 * rows.filter(r => r.win <= 15 || r.win >= 85).length / rows.length, middle: 100 * rows.filter(r => r.win >= 25 && r.win <= 75).length / rows.length, sd: Math.sqrt(mean(rows.map(r => (r.win - avg) ** 2))), groups: Object.fromEntries(groups.map(g => [g, mean(rows.filter(r => r.group === g).map(r => r.win))])), inBand: Object.fromEntries(groups.map(g => [g, rows.filter(r => r.group === g && Math.abs(r.win - targets[g]) <= 8).length])), dry: mean(rows.map(r => r.dry)), plies: mean(rows.map(r => r.plies)), unfinished: rows.reduce((n, r) => n + r.unfinished, 0), rows });
      console.error(`${mode} complete`);
    }
    return { seeds, results };
  }, FIT);
}
console.log(JSON.stringify(measure(), null, 2));
