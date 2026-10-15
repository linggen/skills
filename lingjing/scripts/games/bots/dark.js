// The human-like player for 黑地十一步 · 领着喘 (games/dark.js; tools/board-bots.mjs).
// Walk: the mark swings; aim the foot where it will be when the hand lands (`lead` ms on) —
// press when that point is near the middle. Lead: hold about three beats in, let out about
// five — out well longer than in — as 阿禾 says.
import { STEPS } from '../dark.js';

const swayAt = (s, ms) => Math.sin((2 * Math.PI * (s.st + ms)) / s.swing[Math.min(s.step, STEPS - 1)]);

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.phase === 'walk') return Math.abs(swayAt(s, lead)) < 0.12 ? { g: 'step' } : null;
  const b = s.breath;
  if (b.phase === 'in') return b.inMs + lead >= 2800 ? { release: true } : null;
  if (b.phase === 'idle' || b.outMs + lead >= 4800) return { hold: { g: 'hold' } };
  return null;
}
