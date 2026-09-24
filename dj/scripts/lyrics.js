// lyrics.js — lyrics for a song on disk, chosen by scripts/lyrics_match.py (the
// one chooser: it asks LRCLIB every way a song is filed and keeps the timed set
// that fits this file's length), written as a .lrc sidecar beside the song.

import { runPy, writeFile } from './bash.js';

/// { body, timed } for this file, or null.
export async function fetchLyrics(track, file) {
  const req = JSON.stringify({
    artist: String(track.artist || '').trim(),
    title: String(track.title || '').trim(),
    version: track.version || 'studio',
    file: file || '',
    // The title it was asked for, when the catalogue named it otherwise.
    other_titles: track.requested_title ? [track.requested_title] : [],
  });
  try {
    const r = await runPy('lyrics_match.py', [req], 60_000);
    return r.ok && r.body ? { body: r.body, timed: !!r.synced } : null;
  } catch {
    return null;
  }
}

/// Fetch and write the sidecar: { lrc, timed } or null. Words with no timings
/// are still written — better than an empty screen — and reported untimed.
export async function attachLyrics(track, file) {
  const got = await fetchLyrics(track, file);
  if (!got || !got.body.trim()) return null;
  const lrc = `${file.replace(/\.[^./]+$/, '')}.lrc`;
  await writeFile(lrc, got.body.endsWith('\n') ? got.body : `${got.body}\n`);
  return { lrc, timed: got.timed };
}
