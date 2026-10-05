// breath.js — the breath the 今线 games share (今 · 二 罚球, 今 · 三 领着喘, 今 · 四
// 最后一罚; 2026-10-05). Not a game: a pure helper the game modules import.
// One button held is the in-breath; let go, the out-breath runs until the next
// hold. A breath is counted when the next one starts: how long in, how long
// out. 阿禾's rule (今 · 二): 吸四拍，吐六拍 — out longer than in is the brake.

export const BEAT = 1000; // one 拍, in ms

/** A fresh breath: nothing held yet. */
export const calm = () => ({ phase: 'idle', inMs: 0, outMs: 0, lastIn: 0 });

/** Hold: a new in-breath starts; the one before it, if any, is finished. */
export function holdIn(b) {
  const done = b.phase === 'out' ? { inMs: b.lastIn, outMs: b.outMs } : null;
  return { breath: { ...b, phase: 'in', inMs: 0, outMs: b.phase === 'out' ? 0 : b.outMs }, done };
}

/** Let go: the out-breath starts. */
export function letOut(b) {
  if (b.phase !== 'in') return b;
  return { ...b, phase: 'out', lastIn: b.inMs, outMs: 0 };
}

/** Time passes on whichever half is running. */
export function flow(b, ms) {
  if (b.phase === 'in') return { ...b, inMs: b.inMs + ms };
  if (b.phase === 'out') return { ...b, outMs: b.outMs + ms };
  return b;
}

/** 吸四吐六 or near it: in three to five and a half beats, out at least five and longer than in. */
export const isBrake = ({ inMs, outMs }) => inMs >= 3 * BEAT && inMs <= 5.5 * BEAT && outMs >= 5 * BEAT && outMs > inMs;

/** 憋: an in-breath held past six beats. */
export const isHeld = (b) => b.phase === 'in' && b.inMs > 6 * BEAT;

/** The beat counter the page shows: 「吸 3」 / 「吐 5」. */
export const beatOf = (b) => Math.floor((b.phase === 'in' ? b.inMs : b.outMs) / BEAT) + 1;

/** A small bar for any 0..1 reading. */
export const bar = (label, v, mod = '') => `<div class="g-jin-meter"><span>${label}</span><span class="g-jin-bar ${mod}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span></div>`;
