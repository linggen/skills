// The human-like player for 定风 · 看见它起来 (games/leafding.js; tools/board-bots.mjs).
// Keep still while the leaves spin; step the moment the one leaf rises.
export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  return s.note === 'rise' ? { g: 'step' } : null;
}
