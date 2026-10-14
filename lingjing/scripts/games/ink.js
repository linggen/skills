// ink.js — the look the opening's play beats share (Hanli, 2026-10-14: 「小游戏的UI太粗糙了，
// 美化一下」): a scene drawn in ink on the stage's paper (an inline SVG in currentColor,
// so light and dark follow the page), the page's own buttons, and a small ink splash
// for a hit or a near miss. Not a game: pure helpers the modules import.
//
// The games that run in time are repainted every step (live-games.js), so nothing
// here leans on a CSS animation that a repaint would restart: what moves is drawn
// where it stands at the state's own clock, and a splash fades by its age.

/** Reduced motion asked for: what drifts on its own (reeds, leaves, a drop, the feather's
    sway) holds still; what the player does still shows. */
export const still = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

/** A number for an SVG attribute: short, never "NaN". */
export const n = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : 0);

/** The page's button, in the game: `main` (the one thing to do) or `soft`. */
export const btn = (label, attrs, kind = 'main', extra = '') => `<button type="button" class="g-btn g-btn-${kind}${extra ? ` ${extra}` : ''}" ${attrs}>${label}</button>`;

/** The quiet way out every beat keeps (batch two, 2026-10-14: a beat never blocks the story):
    `{g:'skip'}` ends the game won, with no grade — so no mark is written and the scene goes on. */
export const skipBtn = (label) => btn(label, 'data-g="skip"', 'quiet');
export const SKIP = { zh: '算了，往下走', en: 'Skip — go on' };
/** The state a skipped game ends in: won, no grade, the module's own `skipped` line. */
export const skipped = (s) => ({ ...s, live: false, won: true, grade: null, note: 'skipped' });

/** A drawing on the paper: `w`×`h` units, scaled to the card's width. */
export const scene = (w, h, inner, cls = '') => `<svg class="g-scene${cls ? ` ${cls}` : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true" focusable="false">${inner}</svg>`;

const SPLASH_MS = 700;
/** An ink splash at (x, y): a blot and a few flecks, fading by its age (ms). `seal` is cinnabar. */
export function splash(x, y, age, { r = 14, seal = false } = {}) {
  if (!(age >= 0 && age < SPLASH_MS)) return '';
  const k = age / SPLASH_MS, o = n(0.5 * (1 - k * 0.6), 2), s = n(0.5 + 0.7 * Math.min(1, k * 2.2), 2);
  const flecks = [[-1.3, -0.6, 0.18], [1.1, -0.9, 0.14], [1.5, 0.5, 0.12], [-0.9, 1.1, 0.16], [0.2, -1.5, 0.1]]
    .map(([dx, dy, rr]) => `<circle cx="${n(dx * r * (0.8 + k))}" cy="${n(dy * r * (0.8 + k))}" r="${n(r * rr)}"/>`).join('');
  return `<g class="g-splash${seal ? ' is-seal' : ''}" transform="translate(${n(x)} ${n(y)}) scale(${s})" opacity="${o}"><path d="M${-r} 0 C${-r} ${-r * 0.7} ${-r * 0.3} ${-r} 0 ${-r * 0.9} C${r * 0.6} ${-r} ${r} ${-r * 0.4} ${r * 0.9} ${r * 0.1} C${r} ${r * 0.7} ${r * 0.3} ${r} ${-r * 0.2} ${r * 0.85} C${-r * 0.8} ${r} ${-r} ${r * 0.5} ${-r} 0Z"/>${flecks}</g>`;
}

/** A brush stroke under a word that landed: a short swept line, drawn in as it ages. */
export function stroke(x, y, w, age) {
  if (!(age >= 0 && age < SPLASH_MS * 1.5)) return '';
  const k = Math.min(1, age / 300), o = n(age < SPLASH_MS ? 0.7 : 0.7 * (1 - (age - SPLASH_MS) / (SPLASH_MS * 0.5)), 2);
  return `<path class="g-stroke" d="M${n(x)} ${n(y)} q${n(w * k * 0.5)} ${-3} ${n(w * k)} 0" opacity="${o}"/>`;
}

/** Reeds by water, leaning with the wind `w` (0 still … 1 a gust), swaying with time `t`. */
export function reeds(xs, base, h, w, t) {
  return xs.map((x, i) => {
    const sway = still() ? 0 : Math.sin(t / 380 + i * 1.7) * (1.2 + w * 3), lean = w * 16 + sway;
    return `<path class="g-reed" d="M${x} ${base} Q${n(x + lean * 0.3)} ${n(base - h * 0.55)} ${n(x + lean)} ${n(base - h - (i % 3) * 3)}"/>`;
  }).join('');
}
