// The human-like player for 顺风溜 · 背后有风 (games/wind.js; tools/board-bots.mjs).
// Read where the wind comes from, face it, step back.
import { windOf } from '../wind.js';

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const w = windOf(s.seed, s.k);
  return s.facing !== w ? { g: 'face', d: w } : { g: 'back' };
}
