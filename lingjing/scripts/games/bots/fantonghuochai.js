// The human-like player for 喂饭桶 · 扔了干净 (games/fantonghuochai.js; tools/board-bots.mjs).
// Open the lid; tip in the gourd, then the shards.
import { STOPS } from '../fantong.js';

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'press' };
  const next = STOPS.huochai.feeds.find((f) => !s.fed.includes(f.id));
  return next ? { g: 'feed', f: next.id } : null;
}
