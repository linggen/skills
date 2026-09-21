// lyrics.js — fetch lyrics from LRCLIB (free, open, no key) and drop a .lrc
// sidecar next to the MP3. Players that read sidecars (Evermusic, VLC desktop)
// then show synced lyrics. The choosing runs server-side through /api/bash
// (scripts/lyrics_match.py), which also dodges CORS.

import { runBash, sq, writeFile } from './bash.js';

const DJ_DIR = '$HOME/.linggen/skills/dj';

// Fetch lyrics for a track: { synced, plain, duration } or null.
//
// Which lyrics belong to which recording is decided in ONE place,
// scripts/lyrics_match.py — the source picker pairs videos with lyrics through
// it, the headless download fits its files through it, and so does this. It
// asks LRCLIB every way a song is filed (artist+title, simplified, the title
// alone, simplified title), then keeps the timed set whose length is within 5 s
// of this file and whose last line starts before the file ends. Nothing timed
// fits → the words alone, which every player shows as such.
export async function fetchLyrics(track, mp3File) {
  const req = JSON.stringify({
    artist: String(track.artist || '').trim(),
    title: String(track.title || '').trim(),
    version: track.version || 'studio',
    file: mp3File || '',
  });
  try {
    // Double quotes on the path, single on the payload: DJ_DIR carries a
    // literal $HOME that the shell has to expand, and sq() would freeze it.
    const out = await runBash(
      `"\${LINGGEN_PY:-python3}" "${DJ_DIR}/scripts/lyrics_match.py" ${sq(req)}`,
      { timeoutMs: 60_000 }, // four LRCLIB searches in parallel, ~1–2 s
    );
    const r = JSON.parse(String(out || '').trim().split('\n').filter(Boolean).pop() || '{}');
    if (!r.ok || !r.body) return null;
    return { synced: r.synced ? r.body : '', plain: r.synced ? '' : r.body, duration: r.duration };
  } catch {
    return null;
  }
}

// Write a sidecar next to the MP3. Returns the .lrc path, or null for an empty
// body.
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
