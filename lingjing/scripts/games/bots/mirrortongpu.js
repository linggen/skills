// The human-like player for 藏息 · 镜光扫过来 (games/mirrortongpu.js; tools/board-bots.mjs).
// Start the long slow out-breath just before the light reaches his bunk; let go only once it has passed.
import { STOPS } from '../mirror.js';

const { you, speed } = STOPS.tongpu;

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const ahead = s.p + (speed * lead) / 1000; // where the light will be when the hand lands
  if (!s.out && s.p < you + 0.6 && ahead > you - 0.9) return { hold: { g: 'hold' } };
  if (s.out && s.p > you + 0.65) return { release: true };
  return null;
}
