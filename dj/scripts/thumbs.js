// thumbs.js — small cover-art thumbnails for the library list. Covers live
// inside each track's ID3 tag (embedded by download.js's --embed-thumbnail),
// and a browser <img> can't read that directly, so we extract a tiny cached
// JPG per track into scripts/.thumbs/ — the daemon already serves the skill's
// scripts/ dir statically (the same mechanism player.js uses for
// .nowplaying.mp3), so a cached file there is reachable with no engine change.

import { home, runBash, sq } from './bash.js';

const thumbKey = (t) => String(t.file || '').split('/').pop().replace(/\.[^.]+$/, '');

export const thumbUrl = (t) =>
  t.file ? `/apps/dj/scripts/.thumbs/${encodeURIComponent(thumbKey(t))}.jpg` : '';

// Extract any missing thumbnails in ONE batched shell pass (cheap to re-call —
// the `[ -f ... ] ||` guard skips ffmpeg entirely for tracks already cached).
// Best-effort: a track with no embedded art just never gets a thumb file, and
// the <img>'s onerror in dj.js hides it gracefully.
// The dir is resolved through home() and NEVER written as a '$HOME/…' literal:
// sq() single-quotes its argument, so a $HOME inside it doesn't expand — that
// exact bug sent every thumbnail to /tmp/'$HOME'/… while the page 404'd.
export async function ensureThumbs(tracks) {
  const todo = (tracks || []).filter((t) => t.file);
  if (!todo.length) return;
  const thumbsDir = `${await home()}/.linggen/skills/dj/scripts/.thumbs`;
  const lines = todo.map((t) => {
    const out = `${thumbsDir}/${thumbKey(t)}.jpg`;
    return (
      `[ -f ${sq(out)} ] || ffmpeg -loglevel quiet -y -i ${sq(t.file)} -an -map 0:v:0 ` +
      `-vf "scale=88:88:force_original_aspect_ratio=increase,crop=88:88" -q:v 6 ${sq(out)} 2>/dev/null || true`
    );
  });
  await runBash(`mkdir -p ${sq(thumbsDir)}\n${lines.join('\n')}`, { timeoutMs: 180_000 });
}
