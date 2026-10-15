// The human-like player for 暴雨 · 拽爹上崖 (games/storm.js; tools/board-bots.mjs).
// Watch the wind meter: pull once when it has dropped into a lull (low, not climbing), then
// wait until a gust has been seen blowing before the next pull.
import { CALM, windAt } from '../storm.js';

let gustSeen = true, lastT = -1;

export function bot(s) {
  if (s.t < lastT) gustSeen = true; // a fresh game
  lastT = s.t;
  if (s.won) return null;
  if (!s.live) return { g: 'start' };
  const w = windAt(s.sched, s.t), rising = w > windAt(s.sched, Math.max(0, s.t - 50)) + 1e-6;
  if (w >= CALM) gustSeen = true;
  if (w < CALM && !rising && gustSeen) { gustSeen = false; return { g: 'pull' }; }
  return null;
}
