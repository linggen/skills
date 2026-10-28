// The human-like player for 拼图 (games/pintu.js; tools/board-bots.mjs): look for the first square whose piece is not
// its own, tap the piece that belongs there, then the square — a trade puts it home; once every piece sits home, pick
// each turned one and turn it upright.
export function bot(s) {
  if (!s || s.won) return null;
  const i = s.tiles.findIndex((t, k) => t.id !== k);
  if (i >= 0) {
    const from = s.tiles.findIndex((t) => t.id === i);
    return s.sel === from ? { g: 'tile', i } : { g: 'tile', i: from };
  }
  const k = s.tiles.findIndex((t) => t.r !== 0);
  if (k < 0) return null;
  return s.sel === k ? { g: 'turn' } : { g: 'tile', i: k };
}
