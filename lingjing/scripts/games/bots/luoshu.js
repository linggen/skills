// The human-like player for 洛书九宫 (games/luoshu.js; tools/board-bots.mjs).
// Think it through: of the eight Lo Shu squares, the one that fits the givens; then pick a number, set it.
import { allSquares } from '../luoshu.js';

export function bot(s) {
  if (s.won) return null;
  const sol = allSquares().find((g) => s.givens.every((i) => g[i] === s.cells[i]));
  const wrong = s.cells.findIndex((n, i) => n && n !== sol[i]);
  if (wrong >= 0) return { g: 'cell', i: wrong }; // lift a misplaced one
  const i = s.cells.findIndex((n) => !n);
  if (i < 0) return null;
  return s.pick === sol[i] ? { g: 'cell', i } : { g: 'pick', n: sol[i] };
}
