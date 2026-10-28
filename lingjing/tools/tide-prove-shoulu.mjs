// tools/tide-prove-shoulu.mjs — sweep 兽潮's 守炉 nights (scripts/games/shoulu/tide.js) and print how the human-like hand fares.
//   node lingjing/tools/tide-prove-shoulu.mjs [seeds per cell = 10] [sim seeds per night = 4]
// Prints, per tier × boss × open set: nights made, the human hand's win rate (on sim seeds other than the maker's own),
// the nights it wins fewer than half of, `none`'s wins, and the time a night takes to make.
import { readFileSync } from 'node:fs';
import { sim } from '../scripts/games/shoulu/core.js';
import { tide } from '../scripts/games/shoulu/tide.js';

const N = Number(process.argv[2] ?? 10), S = Number(process.argv[3] ?? 4);
const reg = JSON.parse(readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const table = reg.games.find((g) => g.id === 'shoulu' && g.levels);
const OPEN = { h05: ['yezhu', 'zheng'], h07: ['yezhu', 'zheng', 'qiuyu', 'heyu'], h09: ['yezhu', 'zheng', 'qiuyu', 'heyu', 'qique'] };
const SIMS = Array.from({ length: S }, (_, i) => `p${i}`);
let all = 0, won = 0;
for (const [hui, kinds] of Object.entries(OPEN)) for (const tier of [0, 0.5, 1]) for (const boss of [false, true]) {
  let n = 0, w = 0, weak = [], none = 0, ms = 0, hp = 0;
  for (let i = 0; i < N; i += 1) {
    const t0 = Date.now();
    const got = tide.night(table, { seed: `prove|${hui}|${tier}|${boss}|${i}`, tier, boss, open: (k) => kinds.includes(k) });
    ms += Date.now() - t0;
    if (!got) continue;
    const row = got.deal.levels[0];
    const rs = SIMS.map((seed) => sim(row, 'human', { seed }));
    const k = rs.filter((r) => r.result === 'win').length;
    n += 1; w += k; hp += rs.reduce((a, r) => a + r.hp, 0);
    if (k * 2 < S) weak.push(`${row.id}(${k}/${S})`);
    if (sim(row, 'none', { seed: 'p0' }).result === 'win') none += 1;
  }
  all += n * S; won += w;
  console.log(`${hui} tier ${tier} boss ${boss ? 'y' : 'n'}: ${n}/${N} made, human ${Math.round(100 * w / Math.max(1, n * S))}% (fire ${(hp / Math.max(1, n * S)).toFixed(1)}), weak ${weak.length}${weak.length ? ` ${weak.join(' ')}` : ''}, none won ${none}, ${Math.round(ms / N)} ms/night`);
}
console.log(`overall human ${Math.round(100 * won / Math.max(1, all))}%`);
