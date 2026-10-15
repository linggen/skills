// The human-like player for 听 · 鸟忽然全停了 (games/listen.js; tools/board-bots.mjs).
// Listen; the moment the forest goes quiet (the line falls to 「……」), say 不对 — then the cloud on the ridge.
export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.phase === 'listen') return s.t >= s.quietAt ? { g: 'wrong' } : null;
  return s.phase === 'sky' ? { g: 'sign', id: 'cloud' } : null;
}
