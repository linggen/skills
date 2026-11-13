// Measure coaching on 30 seeded fights built from the shipped world.
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { fightSetup } from '../scripts/rules/cards.mjs';
import { H10 } from './road-hand.mjs';
import { act, begin, foeTurn, simCopy } from '../scripts/battle.js';
import { careful } from '../scripts/fightline.js';
import { honestBest, killNow, newCoach, note as normalNote } from '../scripts/duelcoach.js';

// ESM bindings cannot be monkey-patched. Load instrumented copies from memory,
// wrapping the actual imports rather than changing any source on disk. Only acts
// on the playout state count (careful also acts on temporary evaluation copies).
const probe = process.argv.includes('--probe');
const stats = { notes: 0, moves: 0, playouts: 0, acts: 0, won: 0, lost: 0, open: 0, withdrew: 0, other: 0 };
let note = normalNote;
if (probe) {
  const battleUrl = new URL('../scripts/battle.js', import.meta.url).href;
  let line = await readFile(new URL('../scripts/fightline.js', import.meta.url), 'utf8');
  line = line.replace("import { act, foeTurn, offers, simCopy } from './battle.js';", `import { act as realAct, foeTurn, offers, simCopy } from '${battleUrl}';\nconst act = (st, ...args) => { if (st === globalThis.__coachProbe.current) globalThis.__coachProbe.stats.acts++; return realAct(st, ...args); };`);
  line = line.replace('export function playOut(st, line) {', 'function realPlayOut(st, line) {');
  assert.ok(line.includes('function realPlayOut(st, line) {'));
  line += `\nexport function playOut(st, line) { const p = globalThis.__coachProbe; p.stats.playouts++; p.current = st; try { return realPlayOut(st, line); } finally { p.current = null; p.stats[st.outcome in p.stats ? st.outcome : 'other']++; } }\n`;
  const lineUrl = `data:text/javascript;base64,${Buffer.from(line).toString('base64')}`;
  let coach = await readFile(new URL('../scripts/duelcoach.js', import.meta.url), 'utf8');
  coach = coach.replace("from './battle.js'", `from '${battleUrl}'`).replace("from './fightline.js'", `from '${lineUrl}'`);
  coach = coach.replace('const all = actions.map(action => {', 'globalThis.__coachProbe.stats.moves += actions.length;\n  const all = actions.map(action => {');
  assert.ok(coach.includes('globalThis.__coachProbe.stats.moves += actions.length;'));
  globalThis.__coachProbe = { stats, current: null };
  ({ note } = await import(`data:text/javascript;base64,${Buffer.from(coach).toString('base64')}`));
}

const content = loadContent(), now = new Date('2026-10-21T11:40:00Z');
const state = newState(content, 'zh', now);
// Match trial-sim's road hand, rather than benchmarking an uninitialised save.
state.cards = H10.filter(id => content.cards.cards.some(card => card.id === id));
const beasts = content.creatures.creatures.filter(c => c.deck?.length);
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const times = { note: [], honestBest: [], killNow: [] };
const time = (name, fn) => { const start = performance.now(); fn(); times[name].push(performance.now() - start); };
for (let i = 0; i < 30; i += 1) {
  const setup = fightSetup(content, structuredClone(state), beasts[i % beasts.length], now);
  const st = begin({ ...setup, seed: `coach-cost|${i}` }, catalog), coach = newCoach();
  for (let step = 0; step < 300 && st.outcome === 'open'; step += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const action = careful(st)?.action ?? { kind: 'end' };
    const copy = simCopy(st);
    time('note', () => note(coach, copy, action));
    if (probe) stats.notes += 1;
    time('honestBest', () => honestBest(copy));
    time('killNow', () => killNow(copy));
    act(st, action, 'you');
  }
  if (st.outcome === 'open') throw new Error(`fight ${i} exceeded 300 steps`);
}
if (probe) {
  const pct = n => (100 * n / stats.playouts).toFixed(2);
  console.log(`probe: notes=${stats.notes} moves/note=${(stats.moves / stats.notes).toFixed(2)} playouts/note=${(stats.playouts / stats.notes).toFixed(2)} acts/playout=${(stats.acts / stats.playouts).toFixed(2)} won=${pct(stats.won)}% lost=${pct(stats.lost)}% open=${pct(stats.open)}% withdrew=${pct(stats.withdrew)}% other=${pct(stats.other)}%`);
}
for (const [name, values] of Object.entries(times)) {
  values.sort((a, b) => a - b);
  const pct = p => values[Math.ceil(values.length * p) - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  console.log(`${name}: n=${values.length} mean=${mean.toFixed(2)} p50=${pct(0.5).toFixed(2)} p95=${pct(0.95).toFixed(2)} max=${values.at(-1).toFixed(2)} ms`);
}
