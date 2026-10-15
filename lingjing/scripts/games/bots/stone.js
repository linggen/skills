// The human-like player for 扔石听声 (games/stone.js; tools/board-bots.mjs).
// Go hollow by hollow: throw a stone, listen; one dry knock means shallow and empty — go in.
export function bot(s) {
  if (s.won) return null;
  if (s.at != null && s.thrown[s.at] > 0) {
    if (s.last === 'shallow') return { g: 'enter' }; // heard: one dry "tock"
    const next = [0, 1, 2].find((i) => s.thrown[i] === 0);
    return next == null ? null : { g: 'hole', i: String(next) };
  }
  if (s.at == null) return { g: 'hole', i: '0' };
  return { g: 'throw' };
}
