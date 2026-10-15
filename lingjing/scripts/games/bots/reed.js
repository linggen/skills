// The human-like player for 芦苇里那一等 (games/reed.js; tools/board-bots.mjs).
// Sit through the charges; let the sword go just as the pink shows (aiming at the window's start).
import { HEAVE, PINK } from '../reed.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.phase !== 'heave') return null;
  const end = HEAVE[s.k % HEAVE.length], at = s.t - s.at + lead;
  return at >= end - PINK + 60 && at < end - 80 ? { g: 'throw' } : null;
}
