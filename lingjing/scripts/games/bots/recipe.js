// The human-like player for 认方 · 三张方子 (games/recipe.js; tools/board-bots.mjs).
// Read the footprints that gave a pill, and feed each pairing once: heap, starter, feed.
import { RECIPES } from '../recipe.js';

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const r = RECIPES.find((x) => !s.found.includes(x.pill));
  if (!r) return null;
  if (s.heap !== r.heap) return { g: 'heap', h: r.heap };
  if (s.yin !== r.yin) return { g: 'yin', y: r.yin };
  return { g: 'feed' };
}
