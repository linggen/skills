// The human-like player for 禹步 · 九格 (games/yubujiuge.js; tools/board-bots.mjs).
// Left, right round, then the next number's square — unhurried.
export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  return s.beat === 0 ? { g: 'left' } : s.beat === 1 ? { g: 'right' } : { g: 'sq', n: String(s.k + 1) };
}
