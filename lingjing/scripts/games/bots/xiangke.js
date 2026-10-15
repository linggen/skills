// The human-like player for 相克 · 五句 (games/xiangke.js; tools/board-bots.mjs).
// He has the five lines: whatever comes, answer with what eats it.
const EATS = { wall: 'vine', vine: 'blade', blade: 'fire', fire: 'ice', ice: 'wall' };

export function bot(s) {
  if (s.won) return null;
  if (s.phase === 'ready') return { g: 'start' };
  return s.queue[0] ? { g: 'answer', x: EATS[s.queue[0]] } : null;
}
