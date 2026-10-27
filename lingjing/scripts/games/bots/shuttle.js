// The human-like player for 嘀声 · 二十米往返跑 (games/shuttle.js; tools/board-bots.mjs).
// It learns the beat as a runner does: it taps 转身 when the beep is a hand's delay away (see.lead), once a length.
export function bot(s, see = {}) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.mark) return null;
  return s.next - s.t <= (see.lead ?? 200) ? { g: 'turn' } : null;
}
