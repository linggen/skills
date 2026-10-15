// The human-like player for 练功 · 挑水上坡不喘 (games/carry.js; tools/board-bots.mjs).
// Watch the buckets swing; step so the foot lands (`lead` ms on) as they pass the middle;
// stand still while out of breath.
import { swayAt } from '../carry.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.t + lead < s.restUntil) return null;
  return Math.abs(swayAt(s.t + lead)) < 0.12 ? { g: 'step' } : null;
}
