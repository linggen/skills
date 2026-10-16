// The human-like player for 接雨 · 十七个盆 (games/rain.js; tools/board-bots.mjs).
// 打地鼠: a spot that leaks now (its stain, or its drops) with no basin under it gets one; nothing else is touched.
import { leakingAt } from '../rain.js';

export function bot(s) {
  if (s.won) return null;
  if (!s.live) return { g: 'start' };
  const i = s.basins.findIndex((b, k) => b == null && leakingAt(s.sched, k, s.t));
  return i < 0 ? null : { g: 'spot', i };
}
