// The human-like player for 忍字 · 原样说回去 (games/taunt.js; tools/board-bots.mjs).
// He heard the taunt; tap its next phrase among the pieces (lines are pieces 0–3), never a near miss.
export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  return s.phase === 'say' ? { g: 'say', i: s.said } : null;
}
