// The human-like player for 下崖 · 一根草也不长 (games/descend.js; tools/board-bots.mjs).
// Listen for the drip at every reach, then take the dry side; breathe when the rib says so.
export function bot(s) {
  if (s.won) return null;
  if (!s.started) return { g: 'start' };
  if (s.stabs >= 3) return { g: 'breathe' };
  if (s.heard == null) return { g: 'listen' };
  return { g: s.heard === 0 ? 'right' : 'left' };
}
