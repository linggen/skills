// duel-lend-rungs.mjs — what each rung of 银月's lend is worth (design.md § 斗法 v4: about 8–10 points of win rate a rung), with the
// thinking line (`lookahead`, honest) on his seat, on the fitted first meetings only (tools/duel-budget-fit.mjs JSON: a fight at 0% or
// 100% cannot show a rung). Paired: every rung plays the same deals (band|40000…). `--lend '{json}'` weighs a ladder in memory.
//
//   node tools/duel-lend-rungs.mjs --fit fit.json [--seeds 40] [--lesson trade|kill|guard] [--lend '{json}'] [--shard i/n]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { measure } from './duel-fit.mjs';
import { FIT, withRules } from './duel-lines.mjs';
import { units } from './duel-budget-fit.mjs';
import { content, FIGHTS, keyOf, setupOf, NOW } from './story-fights.mjs';
import { fightSetup } from '../scripts/rules/cards.mjs';
import { lendOf } from '../scripts/rules/lend.mjs';

const setupFor = e => (e.creature ? fightSetup(content, e.state, e.creature, NOW) : setupOf(FIGHTS.find(f => keyOf(f) === e.key), { party: [] }));
export function run({ fit, seeds = 40, lesson = null, lend = null, shard = [0, 1], band = [30, 62] }) {
  const rows = fit.filter(r => r.after.lookahead >= band[0] && r.after.lookahead <= band[1]);
  const had = content.balance.duel_lend;
  if (lend) content.balance.duel_lend = { ...had, ...lend };
  content.duel_decks = { decks: Object.fromEntries(rows.map(r => [`${r.id}|${r.group}`, [[r.level, r.deck]]])) };
  try {
    return withRules(true, () => units().filter(u => rows.some(r => r.k === u.k)).filter((_, i) => i % shard[1] === shard[0]).map(u => {
      const e = u.list[0], base = setupFor(e);
      const win = [0, 1, 2, 3].map(n => { const s = structuredClone(base); s.you.extra = [...(s.you.extra ?? []), ...(lendOf(content, n, lesson)?.cards ?? [])]; return measure(s, 'lookahead', seeds, 40000).win; });
      console.error(`${u.k} ${win.map(w => w.toFixed(0)).join(' ')}`);
      return { k: u.k, group: u.group, win };
    }), FIT);
  } finally { content.balance.duel_lend = had; content.duel_decks = null; }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), get = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const fit = get('--fit', null).split(',').flatMap(p => JSON.parse(fs.readFileSync(p, 'utf8')));
  console.log(JSON.stringify(run({ fit, seeds: Number(get('--seeds', 40)), lesson: get('--lesson', null), lend: args.includes('--lend') ? JSON.parse(get('--lend')) : null, shard: get('--shard', '0/1').split('/').map(Number) })));
}
