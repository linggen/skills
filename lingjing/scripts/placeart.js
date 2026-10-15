// placeart.js — the painting of the PLACE the stage stands in (Hanli, 2026-10-15: 「go
// indoors images」): the second tier of the stage's picture — a festival's on its day, else
// the place's, else the 节气's, else the weather's (atmos.js stageArt). Pure.
//
// Declared once per location in the world's backdrops.json `places`, never per scene:
//   "<id>": { "at": "<place id>" | "scape": ["<今线 scape>", …],
//             "match": ["<token in the scene's zh place>", …]?,   // a spot within the place
//             "indoor": true|false, "day": "art/…", "night": "art/…"? }
// A scene at `at` takes the entry whose `match` token its zh place name holds (the longest
// token wins: 柴房后面 over 柴房); else the place's own entry (no `match`). Off a scene the
// place's own entry. A 今线 scene goes by its `scape`. No night painting: the day one (the
// stage darkens it); a night-only place (no `day`) shows its night one by day too.

const tokens = (e) => (Array.isArray(e?.match) ? e.match : []);
const longest = (e, name) => Math.max(-1, ...tokens(e).filter((t) => name.includes(t)).map((t) => t.length));

/// The place's painting: { id, src, indoor, night } (night: the painting is a night one), or null.
/// `at` the place id (Look's place), `name` the scene's zh place name, `scape` a 今线 scene's.
export function placeArtOf(table, { at = null, name = '', scape = null } = {}, isDay = true) {
  const rows = Object.entries(table?.places ?? {});
  const here = scape
    ? rows.filter(([, e]) => [].concat(e.scape ?? []).includes(scape))
    : rows.filter(([, e]) => at && e.at === at);
  if (!here.length) return null;
  let best = null, score = -1;
  for (const [id, e] of here) {
    const s = tokens(e).length ? longest(e, String(name ?? '')) : 0;
    if (s > score) { best = [id, e]; score = s; }
  }
  if (!best || score < 0) return null;
  const [id, e] = best;
  const night = isDay === false && e.night ? e.night : null;
  const src = night ?? e.day ?? e.night ?? null;
  return src ? { id, src, indoor: e.indoor === true, night: src === e.night } : null;
}
