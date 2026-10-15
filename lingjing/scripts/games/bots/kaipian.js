// The human-like player for 念开篇 · 洛书 (games/kaipian.js; tools/board-bots.mjs).
// He knows the rhyme: 戴九履一，左三右七，二四为肩，六八为足 — each number to its square (4 9 2 / 3 5 7 / 8 1 6).
import { PHRASES, SQUARE } from '../kaipian.js';

const ORDER = PHRASES.flatMap((p) => p.nums);

export function bot(s) {
  if (s.won || s.phase === 'done') return null;
  if (s.phase === 'ready') return { g: 'start' };
  return { g: 'cell', i: String(SQUARE.indexOf(ORDER[s.k])) };
}
