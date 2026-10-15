// stuck.js — when a board may be left (Hanli, 2026-10-15: 「跳过这个按钮不要一开始就显示,
// 玩家卡住了才显示」). One rule for every board the page lays: 「算了，往下走」 is never there
// at the start. It comes when the player is stuck — the board has stood on the stage
// STUCK_MS without a win, or the game itself says so (a module's optional
// `stuck(state)`: fallen again and again in the dark, the deer missed and missed …),
// whichever first. Modules draw no skip of their own (games/ink.js skipBtn is retired);
// a new game gets the gate for free, and adds `stuck` only when it has a clear fail.
// A board with its own way out and nothing to fail (the village maps' 「回家」) opts out of
// the clock with `meta.stuckClock: false` — its own `stuck` still counts.
// Pure: the board object and the clock in, a yes or no out.

/** How long a board stands unwon before it may be left. */
export const STUCK_MS = 75000;

/** The board was first laid on the stage now (kept on the board, so a repaint keeps the clock). */
export function stampShown(g, now) {
  if (g && g.shownAt == null) g.shownAt = now;
}

/** May this board be left now? Never a won or already-left one; never before it was laid. */
export function stuckNow(g, now) {
  if (!g?.mod || g.state?.won || g.skipped || g.shownAt == null) return false;
  if (g.mod.meta?.stuckClock !== false && now - g.shownAt >= STUCK_MS) return true;
  try {
    return Boolean(g.mod.stuck?.(g.state));
  } catch {
    return false;
  }
}

/** What the skip's slot should do now, its button shown or not: fill it once stuck; clear it once the
    board is won, left or gone (live, 2026-10-15: 「算了，往下走」 stood on under the won 最后一罚 —
    the slot was only ever filled, and a live game's win repaints only its own host). */
export function slotNext(g, now, shown) {
  if (shown) return !g || g.state?.won || g.skipped ? 'clear' : null;
  return stuckNow(g, now) ? 'fill' : null;
}
