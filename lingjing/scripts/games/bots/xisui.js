// The human-like player for 洗髓 · 疼，别喊 (games/xisui.js; tools/board-bots.mjs).
// Grit through each wave when there is breath for it; let go only as a trough opens; jump after three sticks.
import { painAt, WAVE, STICKS } from '../xisui.js';

export function bot(s) {
  if (s.won) return null;
  if (s.stick >= STICKS) return { g: 'jump' };
  const wave = painAt(s.sched, s.t) > WAVE;
  const seg = s.sched.find((x) => s.t < x.to), since = s.t - seg.from; // how long ago the bar last moved
  if (!s.holding) return (wave ? since < 300 && s.breath > 0.55 : s.breath > 0.97) ? { hold: { g: 'hold' } } : null;
  if (!wave && since < 400 && s.breath < 0.7) return { release: true };
  return null;
}
