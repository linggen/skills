// Isolated Node-only measurement: rewrite the element constants as modules load.
// No content or runtime files are changed; all clash callers see the same values.
import { registerHooks } from 'node:module';
import fs from 'node:fs';
const arg = process.argv.indexOf('--elements');
const pair = arg < 0 ? [1.5, 0.75] : process.argv[arg + 1]?.split(',').map(Number);
if (!pair || pair.length !== 2 || pair.some(n => !Number.isFinite(n) || n <= 0)) throw Error('invalid --elements');
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/scripts/battle.js')) return result;
  let source = String(result.source);
  for (const [name, value] of [['OVER', pair[0]], ['UNDER', pair[1]]]) {
    const pattern = new RegExp(`export const ${name} = [0-9.]+;`);
    if (!pattern.test(source)) throw Error(`missing ${name}`);
    source = source.replace(pattern, `export const ${name} = ${value};`);
  }
  return { ...result, source };
} });
const { encounters, simulate } = await import('./duel-fit-report.mjs');
const { FIT, withRules } = await import('./duel-lines.mjs');
const { BEATS, begin, act, foeStep } = await import('../scripts/battle.js');
const { carefulFor } = await import('../scripts/fightline.js');
const { content } = await import('./story-fights.mjs');
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const seedsArg = process.argv.indexOf('--seeds');
const seeds = seedsArg < 0 ? 40 : Number(process.argv[seedsArg + 1]);
if (!Number.isInteger(seeds) || seeds < 1) throw Error('invalid seeds');
const traceArg = process.argv.indexOf('--trace');
const selected = traceArg < 0 ? null : new Set(JSON.parse(fs.readFileSync(process.argv[traceArg + 1], 'utf8')));
const result = withRules(true, () => encounters().filter(e => !selected || selected.has(e.key)).map((e, i) => {
  const { setup } = e;
  const score = BEATS[setup.you.root] === setup.foe.root ? 1 : BEATS[setup.foe.root] === setup.you.root ? -1 : 0;
  if (!selected) {
    const result = simulate(setup, 'careful', seeds);
    console.error(`${i + 1} ${e.key}: ${result.win}`);
    return { key: e.key, name: e.name, group: e.group, score, roots: [setup.you.root, setup.foe.root], result };
  }
  const games = [];
  for (let k = 0; k < 10; k++) {
    const st = begin({ ...structuredClone(setup), seed: `band|${k}` }, catalog), actions = [];
    for (let n = 0; n < 300 && st.outcome === 'open'; n++) {
      const who = st.whose, start = st.log.length;
      const action = who === 'you' ? carefulFor(st, who) ?? { kind: 'end' } : null;
      if (who === 'foe') foeStep(st); else if (!act(st, action, who).ok) throw Error(`illegal action ${e.key}`);
      actions.push({ turn: st.turn, who, action, events: st.log.slice(start), hp: [st.you.hp, st.foe.hp] });
    }
    games.push({ outcome: st.outcome, actions });
  }
  console.error(`trace ${i + 1} ${e.key}`);
  return { key: e.key, name: e.name, group: e.group, setup, playerCards: setup.you.deck.map(id => catalog[id]), foeCards: setup.foe.deck.map(id => catalog[id]), games };
}), FIT);
console.log(JSON.stringify({ elements: pair, seeds: selected ? 10 : seeds, rows: result }, null, 2));
