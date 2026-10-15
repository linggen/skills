// The human-like player for 小周天 · 冲三关 (games/zhoutian.js; tools/board-bots.mjs).
// Learn the breath's rhythm by watching it; push once per stillness, aimed at its middle.
export function bot(s, { lead }) {
  if (s.won) return null;
  if (!s.live) return { g: 'start' };
  const b = s.breath, cyc = b.in + b.out + b.rest, at = s.t + lead;
  if (Math.floor(at / cyc) === s.used) return null;
  return Math.abs((at % cyc) - (b.in + b.out + b.rest / 2)) <= 20 ? { g: 'push' } : null;
}
