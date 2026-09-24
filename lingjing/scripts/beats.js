// beats.js — when the page shows a change, and when it speaks again. Pure
// timing, no DOM: the page asks, these answer.

/* 体力 spent is seen, not jumped (Hanli, 2026-09-24): the strip holds the old
   count until the eye is back on it — the walk on the map done, the fight
   room closed — then counts down, and −N floats off it. */
export const DRAIN_MS = 1400;

/// The drain to play when 体力 went from `from` to `to`, or null (a rise, no
/// change, reduced motion — shown at once). `shown` is the count on the strip
/// now (a drain still running starts from where it stands); `holds` are the
/// moments it waits for (travel's end, the fight room closing).
export function drainOf({ from, to, shown = from, at, holds = [], still = false }) {
  if (still || !Number.isFinite(from) || !Number.isFinite(to) || to >= from) return null;
  const start = Math.max(at, ...holds.filter(Number.isFinite));
  return { from: Number.isFinite(shown) ? Math.max(shown, to) : from, to, spent: from - to, start };
}

/// The count at time `t`: the old one while held, then down to the new one
/// (ease-out), `done` once there.
export function drainAt(d, t, ms = DRAIN_MS) {
  if (t < d.start) return { value: d.from, held: true, done: false };
  const k = Math.min(1, (t - d.start) / ms), eased = 1 - (1 - k) ** 3;
  return { value: Math.round(d.from + (d.to - d.from) * eased), held: false, done: k >= 1 };
}

/* 抉择 still unwritten (Hanli, 2026-09-24): after the mist and a turn of
   Ling's, a trial with no ways yet gets ONE hidden nudge; after that the page
   gives up quietly — a veiled trial draws nothing, so nothing is stuck. */

/// The key to nudge under, or null. `meet` is Look's place.meet; `veil` is
/// {place, key, misted, turns} — the mist played here, whether it has ended,
/// and the turns Ling finished since; `nudged` the keys already nudged.
export function trialNudge({ meet, place, veil, nudged, busy }) {
  if (busy || !place || !veil || veil.place !== place || !veil.misted || veil.turns < 1) return null;
  if (meet?.kind !== 'trial' || !meet.veiled || meet.options) return null;
  return nudged.has(veil.key) ? null : veil.key;
}
