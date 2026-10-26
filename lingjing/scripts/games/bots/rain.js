// The human-like player for the 打地鼠 kit (games/rain.js; tools/board-bots.mjs) — any level.
// A spot of the state's level that leaks now (its stain, or its drops) with no basin under it gets one; nothing else is touched.
import { leakingAt, levelOf } from '../rain.js';

export function bot(s) {
  if (s.won) return null;
  if (!s.live) return { g: 'start' };
  const i = levelOf(s).spots.findIndex((_, k) => s.basins[k] == null && leakingAt(s.sched, k, s.t));
  return i < 0 ? null : { g: 'spot', i };
}
