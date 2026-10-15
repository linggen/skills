// The human-like player for 拾遗 · 石缝里的灵草 (games/gather.js; tools/board-bots.mjs).
// Read the glows: gold first, then green, then copper, dark last.
const RANK = { high: 0, mid: 1, low: 1, ore: 2, none: 3 }; // as the glow shows: gold, green, green, copper, dark

export function bot(s) {
  if (s.won) return null;
  const open = s.cracks.map((k, i) => i).filter((i) => !s.taken.includes(i));
  open.sort((a, b) => RANK[s.cracks[a]] - RANK[s.cracks[b]]);
  return open.length ? { g: 'pull', i: String(open[0]) } : null;
}
