#!/usr/bin/env node
// tools/tide-prove.mjs — 兽潮's nights walked as the rules deal them (rules/shouchao.mjs), each proven by its kit's human-like
// hand (games/<kit>/tide.js `prove`, no 结印): a save at a scene, `--nights` hourly nights won in a row, every night played
// `--seeds` times. Prints each kit's win rate, the worst nights, and whether every layout was new.
//
//   node tools/tide-prove.mjs [--at 09-qulao] [--nights 720] [--seeds 3] [--every 1]
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo, task, win } from '../scripts/rules.mjs';
import { tonight, wallKit } from '../scripts/rules/shouchao.mjs';
import { kitOf } from '../scripts/rules/reveal.mjs';
import { TIDES } from '../scripts/games/tide.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const AT = arg('at', '09-qulao'), N = Number(arg('nights', 720)), S = Number(arg('seeds', 3)), EVERY = Number(arg('every', 1));
const content = loadContent();
const T = content.tasks.tasks.find((t) => t.shouchao);
const tableOf = (g) => kitOf(content, g) ?? (content.games?.games ?? []).find((x) => x.id === g && Array.isArray(x.levels));
const creatures = content.creatures?.creatures ?? [];
const START = new Date(2026, 9, 20, 9, 0);
process.env.LINGJING_STAMINA_LIMIT = '0';
let s = playTo(content, newState(content, 'zh', START), AT, { now: START }).state;
// its first night (the 执事堂's errand) held, so the hourly tide runs
s = { ...s, place: 'waimen', quests: { ...(s.quests ?? {}), [T.shouchao.intro]: { done_at: START.toISOString() } } };
delete process.env.LINGJING_STAMINA_LIMIT;
let now = new Date(2026, 10, 1, 0, 5);
const per = {}, worst = [], sigs = new Set();
for (let i = 0; i < N; i += 1) {
  const t = tonight(content, s);
  if (sigs.has(t.sig)) console.log(`night ${t.n}: a layout again (${t.sig})`);
  sigs.add(t.sig);
  if (i % EVERY === 0) {
    const deal = t.row ? { lv: t.row.id } : t.deal, kit = t.row ? wallKit(content) : tableOf(t.game);
    const won = Array.from({ length: S }, (_, j) => TIDES[t.game].prove(kit, deal, `prove${j}`, creatures)).filter(Boolean).length;
    const p = (per[t.game] ??= { won: 0, all: 0, nights: 0, boss: 0 });
    p.won += won; p.all += S; p.nights += 1; if (t.boss) p.boss += 1;
    if (won / S < 0.5) worst.push(`${t.n}:${t.game}${t.boss ? '★' : ''} ${won}/${S}`);
  }
  const w = win({ ...s, stamina: 100 }, content, { now, quests: [] }, { id: T.id, stars: 3 });
  if (!w.state) throw new Error(`night ${t.n}: ${JSON.stringify(w.result)}`);
  s = task(w.state, content, { now, quests: [] }, { action: 'done', id: T.id }).state;
  now = new Date(now.getTime() + (content.balance.events?.shouchao?.every_h ?? 1) * 3600_000 + 60_000);
}
for (const [g, p] of Object.entries(per)) console.log(`${g}: ${p.nights} nights proven (${p.boss} with a 大妖), the human hand ${Math.round(100 * p.won / p.all)}%`);
console.log(`${sigs.size}/${N} layouts distinct; nights under half: ${worst.length ? worst.join(' · ') : 'none'}`);
