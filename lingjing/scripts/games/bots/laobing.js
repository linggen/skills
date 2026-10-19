// The human-like player for 烙饼 · 一鏊子 (games/laobing.js; tools/board-bots.mjs): it watches every
// bread's down side and taps the one that will be golden — the middle of its golden stretch — when the
// hand lands (`lead` ms on, at the fire's pace), the most pressing first; it feeds the fire once the
// griddle is full. Short of the quota, it bakes another batch.
import { BURN, GOLD, QUOTA, SIDE_MS, heatOf } from '../laobing.js';

export function bot(s, { lead = 200 } = {}) {
  if (s.won) return null;
  if (s.phase === 'over') return s.misses >= s.max_misses ? { g: 'skip' } : { g: 'retry' };
  if (s.phase !== 'play') return null;
  const heat = heatOf(s), aim = (GOLD + BURN) / 2;
  let best = null;
  s.spots.forEach((sp, i) => {
    if (!sp.b) return;
    const d = sp.b.sides[sp.b.down] + (sp.b.rate * heat * lead) / SIDE_MS;
    if (d >= aim && (!best || d > best.d)) best = { i, d };
  });
  if (best) return { g: 'bread', i: String(best.i) };
  const busy = s.spots.filter((sp) => sp.b).length;
  if (s.wood > 0 && busy >= 4 && s.t >= s.hotUntil && s.plate.filter((x) => x === 'gold').length < QUOTA + 3) return { g: 'fire' };
  return null;
}
