// The human-like player for 吹鹅毛 · 吐气，毛不许动 (games/feather.js; tools/board-bots.mjs).
// Press the pad and circle slowly and evenly (about 40 px a second, a little uneven like a
// finger) so the count runs to 120 before the breath is spent; never stop, never rush.
export function bot(s) {
  if (s.won) return null;
  if (s.phase !== 'out') return { hold: {} };
  return { move: 0.4 + 0.08 * Math.sin(s.t / 350) };
}
