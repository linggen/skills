// The human-like player for 算盘 · 一笔一笔地算账 (games/abacus.js; tools/board-bots.mjs).
// Do the sum in the head, push the beads rod by rod to match, then 对账.
import { SUMS } from '../abacus.js';

export function bot(s) {
  if (s.won) return null;
  const want = String(SUMS[s.i].answer).padStart(3, '0').split('').map(Number);
  for (let r = 0; r < 3; r++) {
    const d = want[r], rod = s.rods[r];
    if (rod.five !== d >= 5) return { g: 'five', r: String(r) };
    if (rod.ones !== d % 5) return d % 5 ? { g: 'one', r: String(r), k: String(d % 5) } : { g: 'one', r: String(r), k: String(rod.ones) };
  }
  return { g: 'check' };
}
