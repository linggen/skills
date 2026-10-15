// The human-like player for 罚球 · 吸四吐六 (games/faqiu.js; tools/board-bots.mjs).
// Count it: hold in for about four beats, out for about six; once the heart reads 110 or
// under, shoot in the out-breath.
import { STEADY } from '../faqiu.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  const b = s.breath;
  if (b.phase === 'in') return b.inMs + lead >= 4000 ? { release: true } : null;
  if (b.phase === 'out' && s.hr <= STEADY) return { g: 'shoot' };
  if (b.phase === 'idle' || b.outMs + lead >= 6300) return { hold: { gHold: 'in' } };
  return null;
}
