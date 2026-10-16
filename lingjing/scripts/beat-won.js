// beat-won.js — the one place a won story beat is announced (2026-10-16). The page calls
// `beatWon(id, { grade })` once, after the rules have taken the win (`win` answered ok and the
// pay is on the strip) — never on a skip, never on a refused win, never twice for one board.
// Anything that wants to follow a won beat (the 得牌 card reveal, a sound, a log) listens with
// `onBeatWon(fn)`; nothing here knows a game or a card. A listener that throws never stops the story.

const listeners = new Set();

/** Listen for won beats; answers the function that stops listening. */
export function onBeatWon(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A story beat (a board on the stage, by its task id) was won, with its grade if it has one. */
export function beatWon(id, { grade = null } = {}) {
  if (!id) return;
  for (const fn of [...listeners]) {
    try {
      const r = fn(id, { grade });
      if (r?.catch) r.catch((e) => console.warn('[lingjing] beat-won listener', e));
    } catch (e) {
      console.warn('[lingjing] beat-won listener', e);
    }
  }
}
