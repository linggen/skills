// download.js — the yt-dlp pipeline. A user action (they tapped Get): finds the
// top match for "Artist Title", extracts a tagged MP3 into the library dir.
// The agent never calls this; it only proposes the list.

import { runBash, sq, resolvePath } from './bash.js';

const DJ_DIR = '$HOME/.linggen/skills/dj';

// Ensure yt-dlp + ffmpeg exist (fetch yt-dlp on first use, self-update on
// demand). Returns { yt_dlp, ffmpeg, ok, note }.
export async function ensureBins(update = false) {
  const out = await runBash(
    `bash "${DJ_DIR}/scripts/bin-setup.sh" ${update ? 'update' : 'ensure'}`,
  );
  const line = out.trim().split('\n').filter(Boolean).pop() || '{}';
  try {
    return JSON.parse(line);
  } catch {
    return { ok: false, note: 'bin-setup: unreadable output' };
  }
}

// Filesystem-safe filename component, and a tag value safe inside dq-quoting.
const safe = (s) => String(s ?? '').replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
const meta = (s) => String(s ?? '').replace(/"/g, '');

// Download one track. Returns { ok, file } or { ok:false, error }.
//
// YouTube's own artist/title metadata is unreliable (artist resolves to the
// uploading channel, title carries "Official MV" junk). The agent already
// curated the CLEAN artist + title, so we name the file and force the ID3 tags
// from those — never from yt-dlp's `%(artist)s`/`%(title)s`.
export async function downloadTrack(bins, cfg, track) {
  const libDir = await resolvePath(cfg.library_dir || '~/Music/DJ');
  const tmpl = cfg.naming_template || '%(artist)s - %(title)s';
  const br = cfg.bitrate || '320';
  const quality = br === 'best' ? '0' : `${br}K`;
  const query = `${track.artist} ${track.title}`.trim();

  // Render the naming template with the KNOWN clean values (not yt-dlp fields).
  const name =
    tmpl
      .replace(/%\(artist\)s/g, safe(track.artist))
      .replace(/%\(title\)s/g, safe(track.title))
      .replace(/%\(year\)s/g, safe(track.year))
      .trim() || `${safe(track.artist)} - ${safe(track.title)}`;
  const outTmpl = `${libDir}/${name}.%(ext)s`;

  // Force ID3 tags to the curated values via the ffmpeg postprocessor.
  const ppa =
    `ffmpeg:-metadata artist="${meta(track.artist)}" -metadata title="${meta(track.title)}"` +
    (track.year ? ` -metadata date="${meta(track.year)}"` : '');

  const cmd = [
    `mkdir -p ${sq(libDir)} &&`,
    sq(bins.yt_dlp),
    `--no-playlist --no-warnings -x --audio-format mp3 --audio-quality ${sq(quality)}`,
    `--embed-thumbnail`,
    `--postprocessor-args ${sq(ppa)}`,
    `--ffmpeg-location ${sq(bins.ffmpeg)}`,
    `--print after_move:filepath`,
    `-o ${sq(outTmpl)}`,
    sq(`ytsearch1:${query}`),
  ].join(' ');

  try {
    const out = await runBash(cmd);
    const file = out.trim().split('\n').filter(Boolean).pop() || '';
    return file ? { ok: true, file } : { ok: false, error: 'no match found' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
