// lyrics.js — fetch lyrics from LRCLIB (free, open, no key) and drop a .lrc
// sidecar next to the MP3. Players that read sidecars (Evermusic, VLC desktop)
// then show synced lyrics. We go through /api/bash + curl (server-side) to dodge
// CORS, same as the rest of DJ's network calls.

import { runBash, sq, writeFile } from './bash.js';

const UA = 'DJ (Linggen music app) https://linggen.dev';

// Fetch lyrics for a track. Returns { synced, plain } or null.
// Uses LRCLIB's free-text search — the exact artist/track fields miss
// original-language titles, the `q=` query is far more forgiving.
export async function fetchLyrics(track) {
  const q = `${track.artist || ''} ${track.title || ''}`.trim();
  if (!q) return null;
  const cmd =
    `curl -fsS -m 12 -G 'https://lrclib.net/api/search' ` +
    `-H ${sq('User-Agent: ' + UA)} --data-urlencode ${sq('q=' + q)}`;
  let arr;
  try {
    arr = JSON.parse((await runBash(cmd)) || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  // Prefer a result with synced (timed) lyrics; fall back to plain.
  const pick = arr.find((r) => r.syncedLyrics) || arr.find((r) => r.plainLyrics);
  if (!pick) return null;
  return { synced: pick.syncedLyrics || '', plain: pick.plainLyrics || '' };
}

// Fetch + write the sidecar. Returns the .lrc path, or null if no lyrics found.
export async function attachLyrics(track, mp3File) {
  const lyrics = await fetchLyrics(track);
  const body = lyrics && (lyrics.synced || lyrics.plain);
  if (!body || !body.trim()) return null;
  const lrc = mp3File.replace(/\.[^./]+$/, '') + '.lrc';
  await writeFile(lrc, body);
  return lrc;
}
