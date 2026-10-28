#!/usr/bin/env node
// tools/tide-levels.mjs — 兽潮's levels: twenty a kit, rising (Hanli 2026-10-28: 「塔防类的可以适当加到20个关卡, 每一种, 撒豆成兵,
// 守城墙, 守炉」). Each 主力 塔防 kit's maker (games/<kit>/tide.js) is asked for level i of 20 at tier i/19, with the beasts
// of the 回 that level is for (古四's first six, 古五's next seven, 古八's last seven) and a 大妖 every third level (its
// kit able); each layout new, and kept only once its human-like hand wins it on at least `--need` of `--seeds` plays it
// never made it on (`prove`, no 结印). Written to worlds/jiuding/levels/tide.json, which rules/shouchao.mjs deals in order
// before the makers' own nights (tests/tide-levels.test.mjs re-proves them).
//
//   node tools/tide-levels.mjs [--kit shouqiang] [--seeds 8] [--need 6] [--dry]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { kitOf } from '../scripts/rules/reveal.mjs';
import { huiOrder } from '../scripts/rules/hui.mjs';
import { TIDES } from '../scripts/games/tide.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 8)), NEED = Number(arg('need', 6)), ONLY = arg('kit', null), DRY = process.argv.includes('--dry');
const OUT = fileURLToPath(new URL('../worlds/jiuding/levels/tide.json', import.meta.url));
const content = loadContent();
const creatures = content.creatures?.creatures ?? [];
const tableOf = (g) => kitOf(content, g) ?? (content.games?.games ?? []).find((x) => x.id === g && Array.isArray(x.levels));
/* The beasts open at a 回 (creatures.json `hui`, in book order). */
const openAt = (h) => new Set(creatures.filter((c) => c.hui && huiOrder(content, c.hui) <= huiOrder(content, h)).map((c) => c.id));
export const BANDS = [{ from: 0, hui: 'h05' }, { from: 6, hui: 'h07' }, { from: 13, hui: 'h09' }];
const huiFor = (i) => BANDS.filter((b) => i >= b.from).at(-1).hui;

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
out._about = 'Twenty 兽潮 levels a 主力 塔防 kit, rising (Hanli 2026-10-28: 「塔防类的可以适当加到20个关卡, 每一种」): written by tools/tide-levels.mjs from each kit\'s maker (games/<kit>/tide.js), every one won by its human-like hand without 结印 on at least `need` of `seeds` plays (`won`); `hui` the 回 whose beasts it plays, `boss` a 大妖 in it. rules/shouchao.mjs deals a kit\'s levels in order (a 大妖\'s night its next boss level), then its maker\'s own nights. tests/tide-levels.test.mjs re-proves them.';
for (const [game, maker] of Object.entries(TIDES)) {
  if (ONLY && game !== ONLY) continue;
  const table = tableOf(game), used = new Set(), levels = [];
  for (let i = 0; i < 20; i += 1) {
    const hui = huiFor(i), open = openAt(hui), tier = Math.round((i / 19) * 1000) / 1000, boss = maker.boss && i % 3 === 2;
    let kept = null;
    for (let t = 0; t < 30 && !kept; t += 1) {
      const n = maker.night(table, { seed: `tide-level|${game}|${i}|${t}`, tier, boss, open: (k) => open.has(k) });
      if (!n || used.has(n.sig)) continue;
      const won = Array.from({ length: SEEDS }, (_, j) => maker.prove(table, n.deal, `lv-prove|${j}`, creatures)).filter(Boolean).length;
      if (won >= NEED) kept = { i: i + 1, tier, hui, boss: n.boss, kinds: n.kinds, sig: n.sig, won: `${won}/${SEEDS}`, deal: n.deal };
      else console.log(`${game} ${i + 1}: try ${t} won ${won}/${SEEDS}, again`);
    }
    if (!kept) throw new Error(`${game} level ${i + 1}: no layout held`);
    used.add(kept.sig);
    levels.push(kept);
    console.log(`${game} ${kept.i}: ${kept.hui} tier ${tier}${kept.boss ? ' 大妖' : ''} ${kept.kinds.join(',')} — won ${kept.won}`);
  }
  out[game] = { seeds: SEEDS, need: NEED, levels };
}
if (!DRY) fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(DRY ? 'dry run' : `written → ${OUT}`);
