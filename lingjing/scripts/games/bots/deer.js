// The human-like player for 射鹿 · 先看风，后看鹿 (games/deer.js; tools/board-bots.mjs).
// Aim half an inch left (爹's lesson, 银月's line), draw while the wind blows, and let go
// once the chip says the wind is still and the bow is full; never hold into the shake.
import { DRAW_MS, SHAKE_MS, TOL, TOL_HINT, windAt } from '../deer.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (!s.drawing && s.aim !== 'left') return { g: 'aim', to: 'left' };
  const still = windAt(s.sched, s.t) <= (s.hint ? TOL_HINT : TOL); // what the wind chip shows
  if (!s.drawing) return still ? null : { hold: {} }; // draw during a gust, ready for the lull
  if (s.held + lead > SHAKE_MS + 100) return { release: true }; // arm shaking: let it go, start over
  return still && s.held + lead >= DRAW_MS ? { release: true } : null;
}
