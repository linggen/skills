// The human-like player for 算账 · 皮抵欠，肉抵租 (games/scale.js; tools/board-bots.mjs).
// Hand over the hide, then do the sum: the biggest cuts that still fit, to exactly twenty; weigh.
import { CUTS, RENT, weightOf } from '../scale.js';

export function bot(s) {
  if (s.won) return null;
  if (!s.hide) return { g: 'hide' };
  const w = weightOf(s.pan);
  if (w === RENT) return { g: 'weigh' };
  if (w > RENT) return { g: 'cut', id: s.pan.at(-1) };
  const next = CUTS.find((c) => !s.pan.includes(c.id) && w + c.jin <= RENT);
  return next ? { g: 'cut', id: next.id } : { g: 'weigh' };
}
