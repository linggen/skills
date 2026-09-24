// thumbs.js — small cover thumbnails for the library list. Covers live inside
// each song's ID3 tag, which an <img> can't read, so a tiny JPG per song is
// cut into scripts/.thumbs/ — the daemon serves the skill's scripts/ dir.
//
// The dir comes from home(), never a '$HOME/…' literal: sq() would freeze it.

import { home, runBash, sq, FFMPEG_SH } from './bash.js';

const stemOf = (t) => String(t.file || '').split('/').pop().replace(/\.[^.]+$/, '');

// `v` is the source the file came from: a replaced take gets a fresh URL.
export const thumbUrl = (t) =>
  t.file ? `/apps/dj/scripts/.thumbs/${encodeURIComponent(stemOf(t))}.jpg${t.source_id ? `?v=${encodeURIComponent(t.source_id)}` : ''}` : '';

// Songs already asked about this page load (cut, or no art to cut) — a
// refresh only asks about the new ones.
const done = new Set();
const doneKey = (t) => `${t.file}|${t.source_id || ''}`;

/// Cut any missing thumbnails in ONE shell pass. Resolves true when it asked
/// about anything, so the caller knows a repaint may show new covers.
export async function ensureThumbs(tracks) {
  const todo = (tracks || []).filter((t) => t.file && !done.has(doneKey(t)));
  if (!todo.length) return false;
  todo.forEach((t) => done.add(doneKey(t)));
  const dir = `${await home()}/.linggen/skills/dj/scripts/.thumbs`;
  const lines = todo.map((t) => {
    const out = sq(`${dir}/${stemOf(t)}.jpg`);
    return `[ -f ${out} ] || "$FF" -loglevel quiet -y -i ${sq(t.file)} -an -map 0:v:0 ` +
      `-vf "scale=88:88:force_original_aspect_ratio=increase,crop=88:88" -q:v 6 ${out} 2>/dev/null || true`;
  });
  // No `exit` in here: /api/bash appends its own trailer to the command.
  await runBash(`${FFMPEG_SH}\nif [ -n "$FF" ]; then\nmkdir -p ${sq(dir)}\n${lines.join('\n')}\nfi`, { timeoutMs: 180_000 });
  return true;
}
