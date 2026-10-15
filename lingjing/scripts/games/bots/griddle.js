// The human-like player for 烙饼 · 一张厚，一张薄 (games/griddle.js; tools/board-bots.mjs).
// Watch the bread brown; call 「翻！」 so the word lands (`lead` ms on) in the middle of golden.
import { BURN, GOLD, SIDES } from '../griddle.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const rate = SIDES[s.side].rate; // the thick one browns slower — a person sees that
  return s.d + (rate * lead) / 1000 >= (GOLD + BURN) / 2 ? { g: 'flip' } : null;
}
