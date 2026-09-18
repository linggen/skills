// lyrics.js — fetch lyrics from LRCLIB (free, open, no key) and drop a .lrc
// sidecar next to the MP3. Players that read sidecars (Evermusic, VLC desktop)
// then show synced lyrics. We go through /api/bash + curl (server-side) to dodge
// CORS, same as the rest of DJ's network calls.

import { runBash, sq, writeFile } from './bash.js';

const UA = 'DJ (Linggen music app) https://linggen.dev';

/** Traditional titles, a simplified index. LRCLIB carries these songs under
    simplified characters, so a traditional query finds the odd compilation
    entry — words only, no timings — or nothing at all. 2026-09-18, measured:
    `周華健 難念的經` answered 2 results, none timed; `周华健 难念的经` answered
    20, fourteen of them timed. macOS converts the string itself through ICU,
    so this costs nothing and installs nothing. */
async function toSimplified(lines) {
  const src = lines.join('\n');
  const js = `ObjC.import('Foundation');`
    + ` var s = $.NSMutableString.stringWithString(${JSON.stringify(src)});`
    + ` s.applyTransformReverseRangeUpdatedRange($.NSString.stringWithString('Traditional-Simplified'),`
    + ` false, $.NSMakeRange(0, s.length), $());`
    + ` ObjC.unwrap(s)`;
  try {
    const out = await runBash(`osascript -l JavaScript -e ${sq(js)}`);
    return String(out || '').split('\n').map((s) => s.trim());
  } catch {
    return lines;
  }
}

async function search(q) {
  const cmd =
    `curl -fsS -m 12 -G 'https://lrclib.net/api/search' ` +
    `-H ${sq('User-Agent: ' + UA)} --data-urlencode ${sq('q=' + q)}`;
  try {
    const arr = JSON.parse((await runBash(cmd)) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** The track's own length, so a timed take that runs a minute long isn't
    chosen over the one that matches the recording. `afinfo` is macOS's own —
    0 when it can't say, which simply drops the tie-break. */
async function fileSeconds(mp3File) {
  if (!mp3File) return 0;
  try {
    const out = await runBash(`afinfo ${sq(mp3File)} 2>/dev/null | grep -i 'estimated duration' || true`);
    const m = /([\d.]+)\s*sec/.exec(out || '');
    return m ? Math.round(Number(m[1])) : 0;
  } catch {
    return 0;
  }
}

const closestTimed = (arr, secs) => {
  const timed = arr.filter((r) => r.syncedLyrics);
  if (!timed.length || !secs) return timed[0] || null;
  return timed.reduce((best, r) =>
    Math.abs((r.duration || 0) - secs) < Math.abs((best.duration || 0) - secs) ? r : best);
};

// Fetch lyrics for a track. Returns { synced, plain, from } or null.
// Uses LRCLIB's free-text search — the exact artist/track fields miss
// original-language titles, the `q=` query is far more forgiving.
export async function fetchLyrics(track, mp3File) {
  const artist = String(track.artist || '').trim();
  const title = String(track.title || '').trim();
  const both = `${artist} ${title}`.trim();
  if (!both) return null;
  const [simpBoth, simpTitle] = await toSimplified([both, title]);
  // Widest first, then the two ways a timed take hides: an index written in
  // the other script, and an artist filed in English that poisons the query
  // (`Leon Lai 今夜你會不會來` answers one untimed result; the title alone
  // answers twenty, nine of them timed).
  const queries = [both, simpBoth, title, simpTitle]
    .filter((q, i, all) => q && all.indexOf(q) === i);
  const secs = await fileSeconds(mp3File);
  let fallback = null;
  for (const q of queries) {
    const arr = await search(q);
    if (!arr.length) continue;
    const timed = closestTimed(arr, secs);
    if (timed) return { synced: timed.syncedLyrics, plain: timed.plainLyrics || '', from: q };
    // Words with no timings are worth keeping, but never worth stopping for:
    // a later query may still turn up the sung version.
    const words = arr.find((r) => r.plainLyrics);
    if (words && !fallback) fallback = { synced: '', plain: words.plainLyrics, from: q };
  }
  return fallback;
}

// Write a sidecar next to the MP3. Returns the .lrc path, or null for an empty
// body. Shared so the download path can write the lyrics the source picker
// already fetched instead of asking LRCLIB for them a second time.
export async function writeLrc(body, mp3File) {
  if (!body || !body.trim()) return null;
  const lrc = mp3File.replace(/\.[^./]+$/, '') + '.lrc';
  await writeFile(lrc, body);
  return lrc;
}

// Fetch + write the sidecar. Returns the .lrc path, or null if no lyrics found.
// A body with no timings still gets written — the words are better than an
// empty screen, and every reader tells the two apart by looking for stamps.
export async function attachLyrics(track, mp3File) {
  const lyrics = await fetchLyrics(track, mp3File);
  return writeLrc(lyrics && (lyrics.synced || lyrics.plain), mp3File);
}

/** Does this sidecar carry timings? A file of bare words parses to nothing in
    every player, so callers treat an untimed one as lyrics still missing. */
export const isTimed = (body) => /^\s*\[\d{1,2}:\d{2}/m.test(String(body || ''));
