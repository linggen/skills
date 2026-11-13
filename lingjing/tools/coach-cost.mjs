// Measure coaching on 30 seeded fights built from the shipped world.
import { performance } from 'node:perf_hooks';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { fightSetup } from '../scripts/rules/cards.mjs';
import { act, begin, foeTurn, simCopy } from '../scripts/battle.js';
import { careful } from '../scripts/fightline.js';
import { honestBest, killNow, newCoach, note } from '../scripts/duelcoach.js';

const content = loadContent(), now = new Date('2026-10-21T11:40:00Z');
const state = newState(content, 'zh', now);
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
    time('honestBest', () => honestBest(copy));
    time('killNow', () => killNow(copy));
    act(st, action, 'you');
  }
  if (st.outcome === 'open') throw new Error(`fight ${i} exceeded 300 steps`);
}
for (const [name, values] of Object.entries(times)) {
  values.sort((a, b) => a - b);
  const pct = p => values[Math.ceil(values.length * p) - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  console.log(`${name}: n=${values.length} mean=${mean.toFixed(2)} p50=${pct(0.5).toFixed(2)} p95=${pct(0.95).toFixed(2)} max=${values.at(-1).toFixed(2)} ms`);
}
