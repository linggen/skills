// stuck.js — when a board may be left (Hanli, 2026-10-15: 「跳过这个按钮不要一开始就显示,
// 玩家卡住了才显示」). One rule for every board the page lays: 「算了，往下走」 is never there
// at the start. It comes when the player is stuck — the board has stood on the stage
// STUCK_MS without a win, or the game itself says so (a module's optional
// `stuck(state)`: fallen again and again in the dark, the deer missed and missed …),
// whichever first. Modules draw no skip of their own (games/ink.js skipBtn is retired);
// a new game gets the gate for free, and adds `stuck` only when it has a clear fail.
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
  if (now - g.shownAt >= STUCK_MS) return true;
  try {
    return Boolean(g.mod.stuck?.(g.state));
  } catch {
    return false;
  }
}

