#!/usr/bin/env node
// tide-prove-sadou.mjs — proves 撒豆成兵's 兽潮 nights (scripts/games/sadou/tide.js) the way the tests do, in parallel
// workers: each night made, checked against the kit's own rules for a level, played by the human-like bot on a few
// seeds, and by the careless bot. tests/tide-sadou.test.mjs runs a sample through `proveAll`; the CLI sweeps more:
//
//   node tools/tide-prove-sadou.mjs [nights=720] [human seeds=6]
//
// (night i: seed `night${i}`, the climb tier = i/240 to a plateau at 1, the open set walking h05 → h07 → h09.)
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { tide } from '../scripts/games/sadou/tide.js';
import { BOTS, humanBot, sim } from '../scripts/games/sadou/core.js';

const at = (p) => new URL(`../${p}`, import.meta.url);
export const table = JSON.parse(readFileSync(at('worlds/jiuding/levels/sadou.json'), 'utf8'));
const creatures = JSON.parse(readFileSync(at('worlds/jiuding/creatures.json'), 'utf8')).creatures;
const huiOf = Object.fromEntries(creatures.map((c) => [c.id, c.hui]));
const num = (h) => Number(String(h ?? '').slice(1));

/** The table's beasts open at a 回 (creatures.json `hui`; h01…h09 run in book order). */
export const openAt = (hui) => Object.keys(table.beasts).filter((k) => !k.startsWith('_') && huiOf[k] && num(huiOf[k]) <= num(hui));

/** What the kit asks of a level (tests/game-sadou.test.mjs), for a dealt night: [] when it holds. */
export function faults(level) {
  const f = [];
  const ats = level.track.map((t) => t.at);
  if (ats.some((v, i) => i && v <= ats[i - 1])) f.push('track out of road order');
  if (ats.at(-1) >= level.boss.at) f.push('an item past the boss');
  const sec = level.boss.at / level.speed;
  if (sec < 55 || sec > 85) f.push(`run of ${sec.toFixed(0)} s`);
  if (!(level.stars[0] > level.stars[1] && level.stars[1] > 0)) f.push('stars');
  if (!(level.lead.at(-1)?.big && level.lead.slice(0, -1).every((l) => !l.big))) f.push('lead: one big line, the last');
  if (!table.beasts[level.boss.beast]?.name) f.push('boss is not a boss');
  for (const m of level.boss.moves ?? []) if (!['half', 'edges', 'middle'].includes(m)) f.push(`move ${m}`);
  if (!((level.difficulty ?? 1) > 0 && (level.difficulty ?? 1) <= 1.5)) f.push('difficulty');
  if (level.tone && !(/^#[0-9a-f]{6}$/i.test(level.tone.color) && level.tone.alpha > 0 && level.tone.alpha < 0.6)) f.push('tone');
  for (const it of level.track) {
    if (!['gates', 'beans', 'hazard', 'horde', 'rocks'].includes(it.type)) f.push(`type ${it.type}`);
    if (it.type === 'gates') {
      if (it.gates.length !== 2 || !it.gates.filter(Boolean).every((g) => ['+', '-', 'x', '/'].includes(g.op) && g.n > 0)) f.push('gate');
      if (it.flip && it.flip < 180) f.push('flip too fast');
    }
    if (it.type === 'rocks' && !(it.falls.length && it.gap >= 180 && it.falls.every((x) => Math.abs(x) <= 0.7))) f.push('rocks');
    if (it.type === 'horde') {
      if (it.span && it.span[1] - it.span[0] > 1.2) f.push('lane too wide');
      if (!it.beasts.every(([b, n]) => table.beasts[b] && !table.beasts[b].name && n >= 1)) f.push('horde beast');
    }
  }
  if (!level.track.some((t) => t.type === 'hazard' || t.type === 'rocks')) f.push('nothing for the careless to walk into');
  return f;
}

/** One night made and proved: a plain summary (it crosses a worker's port). */
export function proveOne({ seed, tier, hui, seeds = 6 }) {
  const open = new Set(openAt(hui));
  const t0 = performance.now();
  const n = tide.night(table, { seed, tier, boss: false, open: (k) => open.has(k) });
  const ms = performance.now() - t0;
  if (!n) return { seed, tier, hui, none: true, ms };
  const level = { ...table.levels.find((l) => l.id === n.deal.lv), ...n.deal.over };
  const human = Array.from({ length: seeds }, (_, j) => sim(table, level, humanBot(`check${j}`), { seed: `check${j}` }).won).filter(Boolean).length;
  const careless = sim(table, level, BOTS.careless);
  const again = tide.night(table, { seed, tier, boss: false, open: (k) => open.has(k) });
  return {
    seed, tier, hui, ms, sig: n.sig, kinds: n.kinds, beast: n.beast, boss: n.boss, lv: n.deal.lv, tide: n.deal.tide,
    open: [...open], faults: faults(level), human, seeds, careless: careless.won, carelessStars: careless.stars,
    good: sim(table, level, BOTS.good).won, prove: tide.prove(table, n.deal, 'check0'),
    same: JSON.stringify(again) === JSON.stringify(n),
    words: JSON.stringify([level.title, level.lead]),
  };
}

/** Many nights over the machine's cores. */
export function proveAll(asks, workers = Math.max(1, Math.min(availableParallelism() - 1, 8))) {
  const chunks = Array.from({ length: workers }, (_, w) => asks.filter((_, i) => i % workers === w)).filter((c) => c.length);
  return Promise.all(chunks.map((chunk) => new Promise((ok, no) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: chunk });
    wk.once('message', ok);
    wk.once('error', no);
  }))).then((rs) => rs.flat());
}

if (!isMainThread && Array.isArray(workerData)) parentPort.postMessage(workerData.map(proveOne));

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const N = Number(process.argv[2] ?? 720), seeds = Number(process.argv[3] ?? 6);
  const asks = Array.from({ length: N }, (_, i) => ({ seed: `night${i}`, tier: Math.min(1, i / 240), hui: i < N / 3 ? 'h05' : i < (2 * N) / 3 ? 'h07' : 'h09', seeds }));
  const t0 = Date.now();
  const rs = await proveAll(asks);
  const got = rs.filter((r) => !r.none);
  const sigs = new Set(got.map((r) => r.sig));
  const band = (lo, hi) => got.filter((r) => r.tier >= lo && r.tier < hi);
  const rate = (xs) => (xs.length ? (xs.reduce((s, r) => s + r.human, 0) / xs.reduce((s, r) => s + r.seeds, 0)).toFixed(3) : '-');
  console.log(`${N} nights in ${((Date.now() - t0) / 1000).toFixed(1)} s · made ${got.length} · null ${rs.length - got.length} · distinct sigs ${sigs.size}`);
  console.log(`human wins: tier<0.34 ${rate(band(0, 0.34))} · <0.67 ${rate(band(0.34, 0.67))} · <1 ${rate(band(0.67, 1))} · =1 ${rate(band(1, 2))} · all ${rate(got)}`);
  console.log(`below half: ${got.filter((r) => r.human * 2 < r.seeds).length} · careless wins ${got.filter((r) => r.careless).length}/${got.length} · careless ★★★ ${got.filter((r) => r.carelessStars === 3).length} · good bot loses ${got.filter((r) => !r.good).length}`);
  console.log(`faults: ${got.filter((r) => r.faults.length).length} · not deterministic: ${got.filter((r) => !r.same).length} · ms/night mean ${(rs.reduce((s, r) => s + r.ms, 0) / rs.length).toFixed(0)} max ${Math.max(...rs.map((r) => r.ms)).toFixed(0)}`);
}
