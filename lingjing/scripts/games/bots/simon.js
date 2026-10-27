// The human-like player for 照着走 (games/simon.js; tools/board-bots.mjs): watches the run while it is shown, then taps
// it back square by square — what a person keeps in mind, read here off the dealt run.
export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  return s.phase === 'input' ? { g: 'sq', n: String(s.run[s.i]) } : null;
}
