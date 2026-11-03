// board-deal.js — when the page deals a board fresh (lingjing.js boardFor). Pure.
// A board won and counted, asked for again by another errand the same day, is a new game — not the
// old one standing there 「你胜了」, never sent again (his 五子 at 桑间, 2026-09-24). Never while its
// own win is on its way (`winning`): from the win until Look has caught up with it, Look still says
// the task is offered and unwon, and a draw in that window dealt the won board fresh for a moment
// (live 2026-10-16: 算账's 割绳子 beat showed a new level for half a second before its choices).

/** Is the board `old` (won, sent) spent, so that a fresh one is dealt for `task` today? */
export function spentBoard(old, task, day) {
  return Boolean(old && old.day === day && old.state?.won && old.sent && !old.winning && task?.status === 'offered' && !task.won);
}

/* A word board told in the chat (Ling's Reveal, 银月's Whisper; rules/wordboard.mjs) is held the way a win is (Hanli 11-03:
   the 大比 final's 对子 — the page read Look right after her turn and took the told board's card off before its own 6 s
   watch showed 原句, which reached him only in her reply). The page keeps what was told on the board the first time it
   sees it — Look's `word_board` (told, its task) or the game's own end ({ told, answer }) — and the card stands, 「原句：…」
   and 往下走, until he puts it away. */

/** What was told, from Look (`word_board.told` with its task), or null. */
export const toldInLook = (look) => {
  const b = look?.word_board;
  return b?.told && b.task ? { task: b.task, kind: b.kind ?? null, answer: b.answer ?? '', src: b.src ?? null } : null;
};
/** Keep it on the board, once: the first word stands (the game's own end, or Look's — whichever came first). */
export function catchTold(g, told) {
  if (!g || g.told || !told) return false;
  g.told = { kind: told.kind ?? null, answer: told.answer ?? '', src: told.src ?? null };
  return true;
}
/** Held: told and not yet put away. */
export const toldHeld = (g) => Boolean(g?.told && !g.toldDone);
/** The stage's cards with every held told board standing — after the page's filters took the played and the waiting off. */
export function holdTold(cards, heldIds) {
  const missing = heldIds.filter((id) => !cards.some((c) => c.card === 'board' && c.id === id));
  return missing.length ? [...cards, ...missing.map((id) => ({ card: 'board', id }))] : cards;
}
