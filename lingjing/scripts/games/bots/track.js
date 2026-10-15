// The human-like player for 追踪 · 一百步刻一道 (games/track.js; tools/board-bots.mjs).
// Read the ground: pick the deer's sign (a split hoofprint, a snapped green twig, red hair on
// a thorn); then watch the count and cut so the knife lands (`lead` ms on) on the hundredth step.
import { PACE } from '../track.js';

const DEER = ['hoof', 'twig', 'hair'];

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'read') {
    const i = s.rounds[s.r].findIndex((k) => DEER.includes(k) && !s.tried.includes(k));
    return i < 0 ? null : { g: 'sign', i: String(i) };
  }
  return s.steps + (PACE * lead) / 1000 >= 100 ? { g: 'carve' } : null;
}
