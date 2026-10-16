// swipe.js — what a stroke across [data-g-swipe] controls cuts (割绳子's vines, 2026-10-16), shared by
// live-games.js (the story page) and mount.js (a game alone). Pure: positions and times in, a yes/no out.
//  - only a finger that MOVES cuts: a vine swinging under a finger held still is no swipe;
//  - a quick swipe cuts the first vine it crosses and no more (two vines side by side are not both
//    cut by one flick); a long, deliberate stroke may go on to the next — once it has travelled
//    SECOND_PX and SECOND_MS has passed since the last cut.

export const STILL_PX = 4;
export const SECOND_PX = 48;
export const SECOND_MS = 180;

/** A stroke begun at (x, y); `on` the control it began on (a tap there already cut it), if any. */
export function stroke(x, y, on = null, now = Date.now()) {
  const keyOf = (el) => el?.dataset?.v ?? JSON.stringify(el?.dataset ?? {});
  return { x, y, travelled: 0, lastAt: on ? now : null, cut: new Set(on ? [keyOf(on)] : []), keyOf };
}

/** The pointer moved to (x, y) over `el` (a [data-g-swipe] control, or null): act on it now? */
export function crosses(st, x, y, el, now = Date.now()) {
  const d = Math.hypot(x - st.x, y - st.y);
  if (d < STILL_PX) return false;
  st.x = x; st.y = y; st.travelled += d;
  if (!el) return false;
  const key = st.keyOf(el);
  if (st.cut.has(key)) return false;
  if (st.cut.size && (now - st.lastAt < SECOND_MS || st.travelled < SECOND_PX)) return false;
  st.cut.add(key); st.lastAt = now; st.travelled = 0;
  return true;
}
