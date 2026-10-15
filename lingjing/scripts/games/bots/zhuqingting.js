// The human-like player for 猪蜻蜓 · 等风掉头 (games/zhuqingting.js; tools/board-bots.mjs).
// Don't shove, don't slap early: wait for dusk and the palm, then slap so the hand lands mid back-foot lift.
import { STEP, LIGHT } from '../zhuqingting.js';

export function bot(s, { lead }) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  if (s.phase !== 'close' || s.t - s.at < 1600) return null;
  const at = (s.t + lead - s.at) % STEP; // where his step will be when the hand lands
  return at >= STEP - LIGHT + 120 && at <= STEP - 120 ? { g: 'slap' } : null;
}
