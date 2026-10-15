// The human-like player for 闻焦 · 半口气 (games/huohousmell.js; tools/board-bots.mjs).
// Wait through the bitter and the sweet; speak the moment the scorch shows.
export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  return s.note === 'jiao' ? { g: 'say' } : null;
}
