// rules/weather.mjs — 天气 (design.md § 真实世界): the day's weather in the
// world. Part of the rules engine; rules.mjs is its one door.
//
// The skill never goes online: the engine's weather sense (SKILL.md
// `senses: [weather]`) hands the reading to every tool call as
// LINGGEN_WEATHER, for the city the player set once. No city, the sense off,
// or no reading yet → 蒙山's seasons: a mild default drawn from the date
// (snow on some winter days). Look carries `weather`; `new` marks a change
// worth one line from Ling — rules.mjs keeps `weather_told`, never logged.
// Weather never makes the game harder: nothing here touches a number.
//
// The plot never follows the real weather (Hanli, 2026-10-14): a scene
// whose book names its sky declares it once in data — `weather`, one of
// KINDS — and while he stands in it Look's `weather` is the story's
// (`source: "story"`: no temperature, since that is the real city's, and
// never `new`, so Ling says nothing of the real sky over the book's).
import { localDay, parseDay, SEASONS, seasonOf } from '../calendar.js';

export const KINDS = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];
/* The kinds worth a line when they arrive. */
const NOTABLE = new Set(['fog', 'rain', 'snow', 'storm']);
const HOME = { zh: '蒙山', en: 'Mengshan' };

/* The engine's reading, or null: {kind, temp_c, city, …} from LINGGEN_WEATHER. */
export function senseReading(raw = process.env.LINGGEN_WEATHER) {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw);
    return r && KINDS.includes(r.kind) ? r : null;
  } catch {
    return null;
  }
}

/* A day's number in [0, 1), the same all day. */
function dayRoll({ y, m, d }) {
  let h = 2166136261;
  for (const ch of `${y}-${m}-${d}:mengshan`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 2246822507); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* 蒙山's seasons: snow on some winter days, spring rain, a summer storm now
   and then, autumn mist. */
export function seasonKind(day) {
  const r = dayRoll(day), m = day.m;
  const table = m === 12 || m <= 2 ? [['snow', 0.35], ['cloudy', 0.5]]
    : m <= 5 ? [['rain', 0.25], ['fog', 0.33], ['cloudy', 0.45]]
      : m <= 8 ? [['storm', 0.06], ['rain', 0.22], ['cloudy', 0.35]]
        : [['fog', 0.15], ['rain', 0.28], ['cloudy', 0.4]];
  return table.find(([, upTo]) => r < upTo)?.[0] ?? 'clear';
}

/* `weather` as Look tells it. `story` is the scene's own sky (storySky, or
   a bare KINDS kind, or nothing): it wins over the reading. */
export function weatherBrief(state, ctx, story = null) {
  const lang = state.lang === 'en' ? 'en' : 'zh';
  const sky = typeof story === 'string' ? story : story?.weather;
  if (KINDS.includes(sky)) return { kind: sky, where: HOME[lang], source: 'story' };
  const reading = ctx.weather === undefined ? senseReading() : ctx.weather;
  const out = reading
    ? { kind: reading.kind, where: reading.city, ...(Number.isFinite(reading.temp_c) ? { temp_c: Math.round(reading.temp_c) } : {}), source: 'city' }
    : { kind: seasonKind(localDay(ctx.now)), where: HOME[lang], source: 'season' };
  const told = state.weather_told;
  return NOTABLE.has(out.kind) && told !== out.kind ? { ...out, new: true } : out;
}

/* 季节 · 风 (Hanli, 2026-10-15): two more dimensions of the same sky, by the
   same rule — the story's first, then the real place's, then a default.
   Season: a scene's own `season`, else its 回's (book.json `season`, where
   the book dates it), else the season where the player is (the sense's
   latitude: half a year round in the south), else 蒙山's (north). Wind: a
   scene may declare its own (`wind`, a WINDS level); where the sky is the
   city's, the city's wind; otherwise a breeze. Wind is never a kind: a clear
   day can blow a gale. Nothing here touches a number of the game. */
export { SEASONS };

/* Wind levels by strength, km/h: the sustained wind or 0.7 of its gusts,
   whichever is more (30 km/h gusting 62 reads as windy). `force` (0–1) is how
   hard the page leans the weather; the levels are the data, never names in
   code. */
export const WINDS = [
  { level: 'calm', upTo: 8, force: 0.08 },
  { level: 'breeze', upTo: 22, force: 0.3 },
  { level: 'windy', upTo: 45, force: 0.7 },
  { level: 'gale', upTo: Infinity, force: 1 },
];
const DEFAULT_WIND = 'breeze';
const windRow = (level) => WINDS.find(w => w.level === level) ?? null;

/// How strong a wind is, km/h: the wind or 0.7 of its gusts, whichever is more.
export const windStrength = (kmh, gust) => Math.max(Number.isFinite(kmh) ? kmh : 0, Number.isFinite(gust) ? gust * 0.7 : 0);

/// The level of a reading's wind, or null when it carries none.
export function windLevel(kmh, gust) {
  if (!Number.isFinite(kmh) && !Number.isFinite(gust)) return null;
  const s = windStrength(kmh, gust);
  return WINDS.find(w => s < w.upTo).level;
}

/* The scene's own sky, as the book sets it: `weather`, `season`, `wind`. */
export function storySky(scene, hui = null) {
  if (!scene) return null;
  return { weather: scene.weather ?? null, season: scene.season ?? hui?.season ?? null, wind: scene.wind ?? null };
}

const readingOf = (ctx) => (ctx.weather === undefined ? senseReading() : ctx.weather);
const dayOfCtx = (ctx) => parseDay(ctx.day) ?? localDay(ctx.now);

/// Look's `season`: {kind, source} — story, city (the place's hemisphere) or home.
export function seasonBrief(ctx, story = null) {
  if (SEASONS.includes(story?.season)) return { kind: story.season, source: 'story' };
  const lat = readingOf(ctx)?.latitude;
  return Number.isFinite(lat) ? { kind: seasonOf(dayOfCtx(ctx), lat), source: 'city' } : { kind: seasonOf(dayOfCtx(ctx)), source: 'home' };
}

/// Look's `wind`: {level, force, source, kmh?, gust_kmh?, dir?}. The city's
/// only where the sky is the city's (a story sky keeps the story's air).
export function windBrief(ctx, story = null) {
  const row = (level, source, extra = {}) => ({ level, force: windRow(level).force, source, ...extra });
  if (windRow(story?.wind)) return row(story.wind, 'story');
  const r = KINDS.includes(story?.weather) ? null : readingOf(ctx);
  const level = r && windLevel(r.wind_kmh, r.gust_kmh);
  if (!level) return row(DEFAULT_WIND, 'default');
  const num = (v) => (Number.isFinite(v) ? Math.round(v) : undefined);
  const extra = Object.fromEntries(Object.entries({ kmh: num(r.wind_kmh), gust_kmh: num(r.gust_kmh), dir: num(r.wind_dir) }).filter(([, v]) => v !== undefined));
  return row(level, 'city', extra);
}
