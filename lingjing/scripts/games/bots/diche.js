// The human-like player for 底册 · 看完烧了 (games/diche.js; tools/board-bots.mjs).
// Read each legible line until it is marked by heart, skip the ant-sized ones, then burn.
import { ROWS, byHeart } from '../diche.js';

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const r = ROWS.find((x) => x.reads && !byHeart(s, x));
  return r ? { g: 'read', r: r.id } : { g: 'burn' };
}
