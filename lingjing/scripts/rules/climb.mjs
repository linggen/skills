// rules/climb.mjs — a board that climbs: each time it is dealt, the next level of its game after the last one he won
// (Hanli 10-20: the 秘境's 撒豆成兵 and short 守炉 — a new, harder level each time he meets the game there).
// Part of the rules engine; rules.mjs is its one door.
//
// A task's `climb` lists the levels its game deals, easiest first (each one the game's own `deal.lv`: a number or
// a level id). The save keeps, per game, how far up he has won (`climb: { <game>: n }`) — tasks that share a game
// share the count, so the story's 撒豆成兵 counts toward the run's. He is dealt the level after it, the last once
// the list is climbed; a loss deals the same level again. Nothing here names a game: the data declares it.

/* The level a climbing task deals now. */
export function climbLv(state, t) {
  const list = t?.climb ?? [];
  if (!list.length) return null;
  return list[Math.min(state.climb?.[t.game] ?? 0, list.length - 1)];
}

/* A task's deal as Look hands it to the page: its own, with the level it climbs to. */
export const dealtOf = (state, t) => (t?.climb?.length ? { ...(t.deal ?? {}), lv: climbLv(state, t) } : t?.deal ?? {});

/* Won: the level he was dealt is behind him (in place on `s`). */
export function climbWon(s, t) {
  const list = t?.climb ?? [];
  if (!list.length || !t.game) return;
  const at = Math.min(s.climb?.[t.game] ?? 0, list.length - 1);
  s.climb = { ...(s.climb ?? {}), [t.game]: Math.max(s.climb?.[t.game] ?? 0, Math.min(at + 1, list.length)) };
}
