// The human-like player for 攀 · 右手抓一根荆条 (games/climb.js; tools/board-bots.mjs).
// Grab the branch in leaf (the screen shows which); top the grip up on the jutting stone.
import { LEDGE, RUNGS } from '../climb.js';

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.rung >= RUNGS) return { g: 'hand' };
  if (s.rung === LEDGE && s.grip < 0.95) return { g: 'rest' };
  return { g: 'grab', side: s.live_side[s.rung] };
}
