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
import { localDay } from '../calendar.js';

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

/* `weather` as Look tells it. */
export function weatherBrief(state, ctx) {
  const lang = state.lang === 'en' ? 'en' : 'zh';
  const reading = ctx.weather === undefined ? senseReading() : ctx.weather;
  const out = reading
    ? { kind: reading.kind, where: reading.city, ...(Number.isFinite(reading.temp_c) ? { temp_c: Math.round(reading.temp_c) } : {}), source: 'city' }
    : { kind: seasonKind(localDay(ctx.now)), where: HOME[lang], source: 'season' };
  const told = state.weather_told;
  return NOTABLE.has(out.kind) && told !== out.kind ? { ...out, new: true } : out;
}
