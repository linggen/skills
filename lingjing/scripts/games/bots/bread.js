// The human-like player for 喂饼 (games/bread.js; tools/board-bots.mjs).
// No wrong answer: share it as the book does — half to the fox, the rest for himself.
export function bot(s) {
  if (s.won) return null;
  return s.given < 4 ? { g: 'give' } : { g: 'rest' };
}
