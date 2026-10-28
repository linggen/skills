#!/usr/bin/env node
// tide-prove-sadoushou.mjs — the bigger sweep behind tests/tide-sadoushou.test.mjs: 兽潮's 守山门 nights
// (scripts/games/sadoushou/tide.js) over many seeds, each played by the kit's first-time human (core.js humanBot, no 结印)
// on fresh bot seeds, and once by a player who never moves. Prints the win rate by tier × boss × 回, the worst nights,
// and how many sigs repeat.
//
//   node tools/tide-prove-sadoushou.mjs [--nights 40] [--tries 6] [--sigs 2000]
import { readFileSync } from 'node:fs';
import { tide, proven } from '../scripts/games/sadoushou/tide.js';
import { sim, humanBot, BOTS } from '../scripts/games/sadoushou/core.js';
import { levelDealt } from '../scripts/games/sadoushou.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const NIGHTS = arg('nights', 40), TRIES = arg('tries', 6), SIGS = arg('sigs', 2000);
const table = JSON.parse(readFileSync(new URL('../worlds/jiuding/levels/sadoushou.json', import.meta.url), 'utf8'));
const creatures = JSON.parse(readFileSync(new URL('../worlds/jiuding/creatures.json', import.meta.url), 'utf8')).creatures;
const ORDER = { h01: 1, h02: 2, h03: 3, h04: 4, h05: 5, h06: 6, h11: 7, h07: 7, h09: 8 };
const hui = Object.fromEntries(creatures.map((c) => [c.id, c.hui]));
const openAt = (h) => (k) => Boolean(hui[k]) && ORDER[hui[k]] <= ORDER[h];

const t0 = Date.now();
let worst = [];
for (const h of ['h05', 'h07', 'h09']) for (const boss of [false, true]) for (const tier of [0, 0.5, 1]) {
  let won = 0, all = 0, idle = 0, ms = 0, unproven = 0;
  for (let n = 0; n < NIGHTS; n += 1) {
    const a = Date.now();
    const night = tide.night(table, { seed: `prove|${h}|${n}`, tier, boss, open: openAt(h) });
    ms += Date.now() - a;
    const level = { ...levelDealt(table, night.deal, ''), jieyin: null };
    const p = proven(table, level, { salt: `tide|prove|${h}|${n}` }); // what the maker's own guard saw on what it dealt
    if (p.won * 10 < p.tries * 9) unproven += 1;
    let w = 0;
    for (let i = 0; i < TRIES; i += 1) w += sim(table, level, humanBot(`cli|${n}|${i}`), { seed: `cli|${i}` }).won ? 1 : 0;
    won += w; all += TRIES;
    idle += sim(table, level, BOTS.idle, { seed: 'cli' }).won ? 1 : 0;
    worst.push({ h, boss, tier, n, rate: w / TRIES });
  }
  console.log(`${h} boss=${boss ? 1 : 0} tier=${tier}: human ${(100 * won / all).toFixed(0)}%  idle wins ${idle}/${NIGHTS}  guard never passed ${unproven}  night() ${(ms / NIGHTS).toFixed(0)} ms`);
}
worst.sort((a, b) => a.rate - b.rate);
console.log('worst:', worst.slice(0, 8).map((w) => `${w.h}/${w.boss ? 'B' : '-'}/${w.tier}/#${w.n}=${(w.rate * 100).toFixed(0)}%`).join(' '));
// the layout alone (no sky, tone, lead line, wave weight): every night a new road, not a new paint
const bare = (sig) => sig.split('|').slice(0, -4).join('|').replace(/\/\d\.\d(?=,|\||$)/g, '');
const sigs = new Set(), bares = new Set();
let proved = 0;
for (let n = 0; n < SIGS; n += 1) {
  const night = tide.night(table, { seed: `sig|${n}`, tier: Math.min(1, n / 360), boss: n % 3 === 0, open: openAt('h09') });
  sigs.add(night.sig); bares.add(bare(night.sig));
  proved += tide.prove(table, night.deal, String(n)) ? 1 : 0; // the rotation's one-play proof
}
console.log(`sigs: ${sigs.size}/${SIGS} distinct, ${bares.size}/${SIGS} by layout alone · tide.prove won ${proved}/${SIGS} single plays · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
