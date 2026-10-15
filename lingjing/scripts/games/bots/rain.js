// The human-like player for 接雨 · 十七个盆 (games/rain.js; tools/board-bots.mjs).
// A drip with no basin gets one first; a full basin goes to the wall; a basin where it stopped comes back to hand.
import { CAP, leakingAt } from '../rain.js';

export function bot(s) {
  if (s.won) return null;
  if (!s.live) return { g: 'start' };
  const drip = (i) => leakingAt(s.sched, i, s.t), all = s.basins.map((b, i) => i);
  const hasBasin = s.spare + s.hand.length > 0;
  let i = all.find((k) => drip(k) && s.basins[k] == null && hasBasin);
  if (i == null) i = all.find((k) => s.basins[k] != null && s.basins[k] >= CAP);
  if (i == null) i = all.find((k) => !drip(k) && s.basins[k] != null && (s.basins[k] > 0 || !hasBasin));
  return i == null ? null : { g: 'spot', i };
}
