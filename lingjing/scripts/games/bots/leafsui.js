// The human-like player for 随叶 · 跟着它走 (games/leafsui.js; tools/board-bots.mjs).
// Keep the broom under where the leaf will be when the hand lands; never cut.
import { leafX, SUI } from '../leaf.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  const ahead = Math.max(0.04, Math.min(0.96, leafX(`${s.seed}|${s.drop}`, s.t - s.at + lead) + s.gust));
  const gap = ahead - s.bx, want = Math.abs(gap) < SUI.tip * 0.4 ? 0 : Math.sign(gap);
  if (want === s.dir) return null;
  return want === 0 ? { release: true } : { hold: { g: 'hold', dir: want < 0 ? 'l' : 'r' } };
}
