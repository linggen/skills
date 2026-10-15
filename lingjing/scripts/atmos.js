// atmos.js — the atmosphere over the stage (design.md § 真实世界): a festival's
// dressing on the 小人书 frame and the day's weather, one layer. Pure: it
// names the kinds (content lint checks festivals.json against them) and
// writes the layer's markup; lingjing.css draws it — the frame is CSS only,
// the particles are a few spans CSS animates, and with reduced motion they
// stand still (sparks, which only make sense moving, are not drawn at all).

/// Whether the stage's backdrop is a room (its context's `indoor: true`); outdoor otherwise.
export const indoorOf = (...contexts) => contexts.some((c) => c?.indoor === true);

/// What a festival may hang on the frame.
export const FRAMES = ['chunlian', 'lantern', 'aicao', 'magpie', 'moon', 'zhuyu', 'pine', 'willow', 'pumpkin'];
/// What may drift over the stage: a festival's, the weather's, the season's and the wind's.
export const PARTICLES = ['sparks', 'glow', 'stars', 'leaves', 'snow', 'rain', 'fog', 'petals', 'fireflies', 'haze', 'frost', 'twigs', 'gusts'];
/// The weather's kinds (the engine's sense, or 蒙山's seasons) and what each draws.
export const WEATHER = { clear: null, cloudy: null, fog: 'fog', rain: 'rain', storm: 'rain', snow: 'snow' };

const COUNT = { sparks: 14, glow: 12, stars: 18, leaves: 10, snow: 36, rain: 44, fog: 3, petals: 12, fireflies: 14, haze: 2, frost: 1, twigs: 1, gusts: 6 };

/* A small deterministic spread, so a redraw lays the same particles. */
function spread(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/* The season's layer (Hanli, 2026-10-15: a tint and a few drawn things over the
   painting, 水墨淡彩, never 48 paintings): what each season draws by day and by
   night. Still pieces (frost, twigs, haze) stay whatever falls; a moving one
   gives way to the sky's rain or snow and to a festival's own particles. */
export const SEASON_LAYER = {
  spring: { day: ['petals'], night: ['petals'] },
  summer: { day: ['haze'], night: ['fireflies'] },
  autumn: { day: ['leaves'], night: ['leaves'] },
  winter: { day: ['frost', 'twigs'], night: ['frost', 'twigs'] },
};
const STILL = new Set(['frost', 'twigs', 'haze']);
/* A wind this strong draws its gust strokes (rules/weather.mjs WINDS `force`). */
const GUSTS_FROM = 0.6;

/* The season's particles under this sky and festival. */
function seasonParticles(season, isDay, sky, fest) {
  const drawn = SEASON_LAYER[season]?.[isDay === false ? 'night' : 'day'] ?? [];
  return drawn.filter((k) => STILL.has(k) || (!sky && !fest));
}

/// The layer for a day: {frame, particles: [kinds], weather, season, gusts, key}.
/// `dressing` is a festival's (festivals.json), `weather` a kind from WEATHER;
/// `opts` the season (SEASON_LAYER's), day or night, the wind (Look's) and
/// `indoor` (the stage's backdrop is a room: no rain, snow or wind in it, only
/// the season's faint tint — and a festival's dressing; outdoor when unsaid).
export function atmosOf(dressing = null, weather = null, opts = {}) {
  const frame = FRAMES.includes(dressing?.frame) ? dressing.frame : null;
  const fest = PARTICLES.includes(dressing?.particles) ? dressing.particles : null;
  const indoor = opts.indoor === true;
  const wx = !indoor && Object.hasOwn(WEATHER, weather ?? '') ? weather : null;
  const sky = wx ? WEATHER[wx] : null;
  const season = Object.hasOwn(SEASON_LAYER, opts.season ?? '') ? opts.season : null;
  const gusts = !indoor && (opts.wind?.force ?? 0) >= GUSTS_FROM;
  const falls = sky === 'rain' || sky === 'snow' ? sky : null;
  const drawn = indoor ? [] : seasonParticles(season, opts.isDay, falls, fest);
  const particles = [...new Set([sky, fest, ...drawn, gusts ? 'gusts' : null].filter(Boolean))];
  return { frame, particles, weather: wx, season, gusts, ...(indoor ? { indoor } : {}), key: `${frame ?? ''}|${particles.join(',')}|${wx ?? ''}|${season ?? ''}` };
}

/// The wind as the stage's CSS variables: which way it blows across the
/// stage (`--wsign`, +1 to the right), how far a falling thing is carried
/// (`--wdx`, per unit of fall), the rain's lean (`--wa`) and how much faster
/// what drifts goes (`--wk`, a duration factor). No wind given: a light one
/// from the right, the stage's old lean. `dir` is where it blows FROM, degrees.
export function windVars(wind = null, { indoor = false } = {}) {
  const given = Number(wind?.force);
  const force = indoor ? 0 : Math.min(1, Math.max(0, Number.isFinite(given) ? given : 0.3));
  const toward = Number.isFinite(wind?.dir) ? -Math.sin((wind.dir * Math.PI) / 180) : -1;
  const sign = toward >= 0 ? 1 : -1;
  const lean = 6 + 30 * force; // degrees from the vertical
  const dx = Math.tan((lean * Math.PI) / 180);
  return { '--wsign': String(sign), '--wdx': (sign * dx).toFixed(3), '--wa': `${(-sign * lean).toFixed(1)}deg`, '--wk': (1 - 0.5 * force).toFixed(2), '--wf': force.toFixed(2) };
}

/// The particles' markup: one group per kind, each span placed by the seed.
export function particlesHtml(particles, seed = 'lingjing') {
  return particles.map((kind) => {
    const r = spread(`${seed}:${kind}`), n = COUNT[kind] ?? 12;
    const spans = Array.from({ length: n }, (_, i) => {
      const x = (r() * 100).toFixed(1), y = (r() * 100).toFixed(1), delay = (-r() * 12).toFixed(2), dur = (0.6 + r() * 0.8).toFixed(2), size = (0.6 + r() * 0.8).toFixed(2);
      return `<i class="pt" style="--x:${x}%;--y:${y}%;--d:${delay}s;--k:${dur};--s:${size};--i:${i}"></i>`;
    }).join('');
    return `<div class="pts p-${kind}">${spans}</div>`;
  }).join('');
}

/// The body's classes for a layer: `fest-<frame>`, `wx-<weather>` and `season-<season>`.
export const atmosClasses = (a) => [a.frame ? `fest-${a.frame}` : null, a.weather ? `wx-${a.weather}` : null, a.season ? `season-${a.season}` : null].filter(Boolean);

/// The stage's backdrop (2026-10-14): a painting per weather kind, by day and by night, from
/// the world's declared table (worlds/<w>/backdrops.json `kinds` → { day, night }: a file
/// under the world). Swapping a painting in is a data change only. A kind the table lacks
/// falls back to its `clear` row; a world with no table keeps the paper (null).
export const DAYPARTS = ['day', 'night'];
export function backdropOf(table, kind, isDay = true) {
  const rows = table?.kinds;
  if (!rows) return null;
  const row = rows[Object.hasOwn(WEATHER, kind ?? '') ? kind : 'clear'] ?? rows.clear;
  const part = isDay === false ? 'night' : 'day';
  return row?.[part] ?? row?.day ?? null;
}

/// The stage's picture (2026-10-15): one ordered resolver — the first tier that names a
/// picture wins. `scene` its own picture (a set piece's, a scene's `backdrop`); `festival` on its
/// day or days (Look's today.festival.backdrop) unless the book names the scene's sky; `place` the
/// place's own painting (outdoor or a room); a sky the book names, its weather painting; the 节气 in
/// effect (`term`, the world's backdrops.json `terms`) outdoors; the weather's painting last.
/// 今线 has none. The season, weather and wind layers draw over whichever wins (atmosOf).
export const STAGE_TIERS = [
  ['scene', (c) => c.scene?.backdrop],
  ['festival', (c) => (c.weather?.source === 'story' ? null : c.festival?.backdrop)],
  ['place', (c) => c.place?.backdrop],
  ['story', (c) => (c.weather?.source === 'story' ? backdropOf(c.table, c.weather.kind, c.isDay) : null)],
  ['term', (c) => (indoorOf(c.scene, c.place) ? null : c.table?.terms?.[c.term?.id ?? c.term])],
  ['weather', (c) => backdropOf(c.table, c.weather?.kind ?? null, c.isDay)],
];

/// The tier and picture that win: {tier, art}, or {tier: null, art: null}.
export function stagePick(c = {}) {
  if (c.scene?.line === 'jin') return { tier: null, art: null };
  const ctx = { isDay: true, ...c };
  for (const [tier, pick] of STAGE_TIERS) {
    const art = pick(ctx);
    if (art) return { tier, art };
  }
  return { tier: null, art: null };
}

/// The stage's picture (stagePick's art).
export const stageArt = (c = {}) => stagePick(c).art;
