// duel-template-fit.mjs — the 65 first meetings measured with the beasts' decks by template (tools/duel-template.mjs), the fair rules on
// in memory (FIT). The band (design.md § 斗法 v4 · The measure, tests/fight-band.test.mjs BARE): the thinking line (`lookahead`, honest)
// wins 30–62% bare, about 45%; `careful` and `plain` are shown beside it. `--none`: the beasts' own decks (no template), the before.
//
//   node tools/duel-template-fit.mjs [--ratio '{json}'] [--none] [--lines careful,lookahead] [--seeds 40] [--from 0] [--shard i/n]
import { pathToFileURL } from 'node:url';
import { encounters } from './duel-fit-report.mjs';
import { measure } from './duel-fit.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { build, RATIO, table } from './duel-template.mjs';
import { content } from './story-fights.mjs';

export const BAND = [30, 62];
export function run({ ratio = RATIO, sig = null, noFeint = false, none = false, lines = ['careful', 'lookahead'], seeds = 40, from = 0, shard = [0, 1] } = {}) {
  const had = content.duel_decks;
  content.duel_decks = none ? null : table(build(ratio), ratio);
  try {
    return withRules(true, () => encounters().filter((_, i) => i % shard[1] === shard[0]).map(e => {
      if (sig != null && e.setup.foe.signature?.effect) e.setup.foe.signature = { ...e.setup.foe.signature, effect: Object.fromEntries(Object.entries(e.setup.foe.signature.effect).map(([k, v]) => [k, typeof v === 'number' && ['damage', 'sweep'].includes(k) ? Math.max(1, Math.round(v * sig)) : v])) };
      if (noFeint) delete e.setup.foe.feint;
      const row = { key: e.key, group: e.group, size: e.setup.you.deck.length, foeSize: e.setup.foe.deck.length };
      for (const line of lines) row[line] = measure(e.setup, line, seeds, from).win;
      return row;
    }), FIT);
  } finally { content.duel_decks = had; }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const shard = get('--shard', '0/1').split('/').map(Number);
  console.log(JSON.stringify(run({ ratio: { ...RATIO, ...JSON.parse(get('--ratio', '{}')) }, none: args.includes('--none'), sig: args.includes('--sig') ? Number(get('--sig')) : null, noFeint: args.includes('--no-feint'), lines: get('--lines', 'careful,lookahead').split(','), seeds: Number(get('--seeds', 40)), from: Number(get('--from', 0)), shard })));
}
