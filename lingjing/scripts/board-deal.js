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
