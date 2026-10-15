// The human-like player for 喂饭桶 · 开炉夜 (games/fantongqianye.js; tools/board-bots.mjs).
// Press the lid till it gives; feed the common things, the spirit stone last.
import { STOPS } from '../fantong.js';

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'press' };
  const next = STOPS.qianye.feeds.find((f) => !f.last && !s.fed.includes(f.id)) ?? STOPS.qianye.feeds.find((f) => !s.fed.includes(f.id));
  return next ? { g: 'feed', f: next.id } : null;
}
