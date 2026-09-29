// atmos.js — the atmosphere over the stage (design.md § 真实世界): a festival's
// dressing on the 小人书 frame and the day's weather, one layer. Pure: it
// names the kinds (content lint checks festivals.json against them) and
// writes the layer's markup; lingjing.css draws it — the frame is CSS only,
// the particles are a few spans CSS animates, and with reduced motion they
// stand still (sparks, which only make sense moving, are not drawn at all).

/// What a festival may hang on the frame.
export const FRAMES = ['chunlian', 'lantern', 'aicao', 'magpie', 'moon', 'zhuyu', 'pine'];
/// What may drift over the stage: a festival's, and the weather's.
export const PARTICLES = ['sparks', 'glow', 'stars', 'leaves', 'snow', 'rain', 'fog'];
/// The weather's kinds (the engine's sense, or 蒙山's seasons) and what each draws.
export const WEATHER = { clear: null, cloudy: null, fog: 'fog', rain: 'rain', storm: 'rain', snow: 'snow' };

const COUNT = { sparks: 14, glow: 12, stars: 18, leaves: 10, snow: 36, rain: 44, fog: 3 };

/* A small deterministic spread, so a redraw lays the same particles. */
function spread(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/// The layer for a day: {frame, particles: [kinds], weather, key}. `dressing`
/// is a festival's (festivals.json), `weather` a kind from WEATHER.
export function atmosOf(dressing = null, weather = null) {
  const frame = FRAMES.includes(dressing?.frame) ? dressing.frame : null;
  const fest = PARTICLES.includes(dressing?.particles) ? dressing.particles : null;
  const wx = Object.hasOwn(WEATHER, weather ?? '') ? weather : null;
  const sky = wx ? WEATHER[wx] : null;
  const particles = [...new Set([sky, fest].filter(Boolean))];
  return { frame, particles, weather: wx, key: `${frame ?? ''}|${particles.join(',')}|${wx ?? ''}` };
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

/// The body's classes for a layer: `fest-<frame>` and `wx-<weather>`.
export const atmosClasses = (a) => [a.frame ? `fest-${a.frame}` : null, a.weather ? `wx-${a.weather}` : null].filter(Boolean);
