// sky-bodies.js — the sun and the moon in the stage's weather layer (design.md § 真实世界; Hanli 2026-11-10:
// 「天气特效, 白天显示太阳, 晚上能显示月亮吗? 月亮能显示正确的圆缺吗? 满月或者偏月」).
//
// Pure, and the phone's twin: lib/services/lingjing/sky_bodies.dart does the same maths and the test on each
// side pins the same dates to the same names. What is here:
//   · the moon's phase for an instant — its age, how much of it is lit, waxing or waning, the name — from the
//     sun's and the moon's longitudes (the elongation; ~0.2°, under an hour), so it agrees with the game's own
//     lunar calendar (calendar.js LUNAR: 初一 new, 十五/十六 full) to within the day;
//   · the lit part's outline (moonPath): waxing lit on the right, waning on the left (the northern view), the
//     terminator half an ellipse;
//   · where each body stands and how plainly (skyOf): by the clock — the day is 6:00–18:00 (the game knows no
//     sunrise or sunset; its day/night is the clock's, lingjing.js isDayNow), the sun crossing left to right
//     (east to west, facing south) by day and the moon by night, a cross-fade through each dusk and dawn —
//     and by the weather (SKY_SHOW: clear shows, haze dims, cloud, fog, rain and snow leave a glow behind the
//     cloud, a storm none; a room, a sealed instance and 今线 show none).
// The drawing is SVG made here — no image files — and laid by applySky into the weather layer (.atmos), which
// sits behind every card and line.
import { sunLongitude } from './calendar.js';

/// The mean synodic month, days: the moon's age is its phase (elongation / 360°) of this.
export const SYNODIC = 29.530588853;
const rad = Math.PI / 180;
const norm = (d) => ((d % 360) + 360) % 360;

/// The Julian Day of an instant (UTC ms since 1970).
export const jdOfMs = (ms) => ms / 86400000 + 2440587.5;

/// The moon's ecliptic longitude, degrees (Meeus ch. 47's principal terms; ~0.1°).
export function moonLongitude(jd) {
  const T = (jd - 2451545) / 36525;
  const L = 218.3164477 + 481267.88123421 * T;
  const D = (297.8501921 + 445267.1114034 * T) * rad, M = (357.5291092 + 35999.0502909 * T) * rad;
  const Mp = (134.9633964 + 477198.8675055 * T) * rad, F = (93.272095 + 483202.0175233 * T) * rad;
  return norm(L + 6.288774 * Math.sin(Mp) + 1.274027 * Math.sin(2 * D - Mp) + 0.658314 * Math.sin(2 * D) + 0.213618 * Math.sin(2 * Mp)
    - 0.185116 * Math.sin(M) - 0.114332 * Math.sin(2 * F) + 0.058793 * Math.sin(2 * D - 2 * Mp) + 0.057066 * Math.sin(2 * D - M - Mp)
    + 0.053322 * Math.sin(2 * D + Mp) + 0.045758 * Math.sin(2 * D - M) - 0.040923 * Math.sin(M - Mp) - 0.03472 * Math.sin(D)
    - 0.030383 * Math.sin(M + Mp));
}

/// The eight phases, new to waning crescent, with the share of the cycle (0–1) each one ends at. The quarters,
/// the new and the full moon are a day's width either side (±0.04 of the cycle); the crescents and gibbous
/// moons between. (The word for the waxing crescent, 蛾眉, is beyond Hanli's seven: his list had one 残月.)
export const PHASES = [
  ['new', 0.04], ['waxing-crescent', 0.21], ['first-quarter', 0.29], ['waxing-gibbous', 0.46],
  ['full', 0.54], ['waning-gibbous', 0.71], ['last-quarter', 0.79], ['waning-crescent', 0.96], ['new', 1],
];
export const phaseNameOf = (p) => PHASES.find(([, upTo]) => p < upTo)[0];

/// The moon at an instant: {age (days, 0–29.53), phase (0–1, 0 new · 0.5 full), fraction (lit, 0–1), waxing, name}.
export function moonAt(ms) {
  const jd = jdOfMs(ms);
  const phase = norm(moonLongitude(jd) - sunLongitude(jd)) / 360;
  return { age: phase * SYNODIC, phase, fraction: (1 - Math.cos(2 * Math.PI * phase)) / 2, waxing: phase < 0.5, name: phaseNameOf(phase) };
}

/// The lit part's outline for a disc of radius `r` centred on 0,0, as an SVG path: a half circle on the lit side
/// (right while waxing, left while waning) and the terminator, half an ellipse of x-radius r·|cos(2π·phase)|,
/// bulging into the lit side for a crescent and the dark side for a gibbous moon. '' at the new moon.
export function moonPath(r, phase) {
  const c = Math.cos(2 * Math.PI * phase), rx = +(r * Math.abs(c)).toFixed(3);
  if (phase < 0.0005 || phase > 0.9995) return '';
  const waxing = phase < 0.5, crescent = c > 0;
  // SVG's y runs down: sweep 1 is clockwise. Waxing: top → bottom by the right is clockwise, then back up by the
  // terminator (by the right when a crescent: counter-clockwise; by the left when gibbous: clockwise). Waning mirrors.
  const side = waxing ? 1 : 0, back = waxing ? (crescent ? 0 : 1) : (crescent ? 1 : 0);
  return `M0 ${-r}A${r} ${r} 0 0 ${side} 0 ${r}A${rx} ${r} 0 0 ${back} 0 ${-r}Z`;
}

/* ── Where, and how plainly ── */

/// How the weather lets a body show (Look's kinds: the game has no "partly cloudy" — 阴 is overcast): `full`, the disc
/// and its glow; `dim`, the disc veiled; `glow`, only a glow behind the cloud, `none` no sky body at all. `a` its strength.
export const SKY_SHOW = {
  clear: { mode: 'full', a: 1 },
  cloudy: { mode: 'glow', a: 0.5 },
  fog: { mode: 'glow', a: 0.36 },
  snow: { mode: 'glow', a: 0.3 },
  rain: { mode: 'glow', a: 0.22 },
  storm: { mode: 'none', a: 0 },
};
/// A clear sky with haze in it (the summer day's season layer): the disc veiled.
export const HAZE = { mode: 'dim', a: 0.62 };

/// The show of a sky: its kind's row, a clear sky with haze veiled; an unknown or no kind is clear.
export const showOf = (kind, { haze = false } = {}) => {
  const row = SKY_SHOW[Object.hasOwn(SKY_SHOW, kind ?? '') ? kind : 'clear'];
  return row === SKY_SHOW.clear && haze ? HAZE : row;
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/// The sun's share of the sky at a clock hour (0–24): up from 5:30 to 6:30, down from 17:30 to 18:30.
export const sunShare = (hour) => smooth(5.5, 6.5, hour) * (1 - smooth(17.5, 18.5, hour));

/// The arc, by the hour: how far along (0 left/east … 1 right/west) the sun's day 6–18 and the moon's night 18–6 each stand.
export const sunT = (hour) => Math.min(1, Math.max(0, (hour - 6) / 12));
export const moonT = (hour) => Math.min(1, Math.max(0, ((hour >= 12 ? hour - 18 : hour + 6)) / 12));

/// A point on the arc as percents of the layer: left 10% → 90%, rising to 7% from the top at noon (17% at the ends).
export const arcAt = (t) => ({ x: +(10 + 80 * t).toFixed(2), y: +(17 - 10 * Math.sin(Math.PI * t)).toFixed(2) });

/// The sky at a moment: { sun: {x, y, alpha, mode} | null, moon: {x, y, alpha, mode, phase, fraction, waxing, name} | null }.
/// `ms` the instant (UTC ms; its local clock hour is the hour unless `hour` says one), `isDay` the stage's day or night
/// when the page knows it (it wins over the clock), `weather` Look's kind, `haze` the season's haze, `none` the stage shows
/// no sky (a room, a sealed instance, 今线, a 中秋 whose festival draws its own moon).
export function skyOf({ ms = Date.now(), hour = null, isDay = null, weather = null, haze = false, none = false, noMoon = false } = {}) {
  const show = showOf(weather, { haze });
  if (none || show.mode === 'none') return { sun: null, moon: null };
  const d = new Date(ms);
  const h = Number.isFinite(hour) ? hour : d.getHours() + d.getMinutes() / 60;
  let sunA = sunShare(h);
  if (typeof isDay === 'boolean' && (sunA > 0.5) !== isDay) sunA = isDay ? 1 : 0; // the stage says otherwise: it wins
  const moonA = 1 - sunA;
  const body = (t, alpha) => ({ ...arcAt(t), alpha: +(alpha * show.a).toFixed(3), mode: show.mode });
  const sunClock = sunShare(h) > 0.5;
  const sun = sunA > 0.001 ? body(sunClock ? sunT(h) : 0.5, sunA) : null;
  const m = moonAt(ms);
  const moon = moonA > 0.001 && !noMoon ? { ...body(sunClock ? 0.5 : moonT(h), moonA), phase: m.phase, fraction: m.fraction, waxing: m.waxing, name: m.name } : null;
  return { sun, moon };
}

/* ── Drawing: SVG, in the ink-wash palette ── */

const R = 36; // the disc's radius in a 200×200 box; the glow runs out to 100
const sunSvg = (mode) => `<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs>
<radialGradient id="skyGlowS"><stop offset="0.3" stop-color="#F1C58A" stop-opacity=".55"/><stop offset="1" stop-color="#F1C58A" stop-opacity="0"/></radialGradient>
<radialGradient id="skyDiscS" cx=".4" cy=".38" r=".75"><stop offset="0" stop-color="#FBE9C6"/><stop offset=".6" stop-color="#EFC186"/><stop offset="1" stop-color="#D88B52"/></radialGradient></defs>
<circle r="100" fill="url(#skyGlowS)"/>${mode === 'glow' ? '' : `<circle r="${R}" fill="url(#skyDiscS)"${mode === 'dim' ? ' opacity=".85" filter="url(#skyVeil)"' : ''}/>`}${mode === 'dim' ? '<filter id="skyVeil"><feGaussianBlur stdDeviation="2.4"/></filter>' : ''}</svg>`;

const moonSvg = (mode, phase, fraction) => `<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs>
<radialGradient id="skyGlowM"><stop offset="0.3" stop-color="#E9E8D8" stop-opacity="${(0.1 + 0.5 * fraction).toFixed(2)}"/><stop offset="1" stop-color="#E9E8D8" stop-opacity="0"/></radialGradient>
<radialGradient id="skyDiscM" cx=".45" cy=".4" r=".8"><stop offset="0" stop-color="#FBF8EA"/><stop offset=".7" stop-color="#EFEAD2"/><stop offset="1" stop-color="#D9D3B8"/></radialGradient></defs>
<circle r="100" fill="url(#skyGlowM)"/>${mode === 'glow' ? '' : `<circle r="${R}" fill="#5F6A72" fill-opacity=".22" stroke="#C9C7B8" stroke-opacity=".28" stroke-width="1"/><path d="${moonPath(R, phase)}" fill="url(#skyDiscM)"/>`}</svg>`;

/// The sky's markup for `sky` (skyOf): the sun and the moon, each a box placed by percents with its alpha, or nothing.
export function skyHtml(sky) {
  const one = (kind, b, svg) => (b ? `<i class="skybody sky-${kind}" data-mode="${b.mode}" style="left:${b.x}%;top:${b.y}%;opacity:${b.alpha}">${svg}</i>` : '');
  return one('sun', sky?.sun, sky?.sun && sunSvg(sky.sun.mode)) + one('moon', sky?.moon, sky?.moon && moonSvg(sky.moon.mode, sky.moon.phase, sky.moon.fraction));
}

/// Lays the sky into `box` (the weather layer's own `.skybox`); the markup is rewritten only when it changed, so a
/// glance a minute never restarts a thing.
export function applySky(box, sky) {
  if (!box) return;
  const html = skyHtml(sky);
  if (box.dataset.sky !== html) { box.dataset.sky = html; box.innerHTML = html; }
}
