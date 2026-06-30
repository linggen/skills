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

  // Loudness-normalize so quiet tracks are pulled up to a consistent level —
  // fixes "too quiet in CarPlay", where the cause is source tracks sitting well
  // below the ~-14 LUFS streaming standard. Single-pass EBU R128 loudnorm, on
  // by default; TP=-1.5 keeps a true-peak ceiling so the boost never clips.
  // Disable with cfg.loudnorm:false; retarget with cfg.loudnorm_lufs.
  const lufs = Number(cfg.loudnorm_lufs);
  const target = Number.isFinite(lufs) ? lufs : -14;
  const loudnorm = cfg.loudnorm === false ? '' : `-af loudnorm=I=${target}:TP=-1.5:LRA=11 `;

  // Force ID3 tags to the curated values via the ffmpeg postprocessor.
  const ppa =
    `ffmpeg:${loudnorm}-metadata artist="${meta(track.artist)}" -metadata title="${meta(track.title)}"` +
    (track.year ? ` -metadata date="${meta(track.year)}"` : '');

  // Search several results and grab the FIRST that actually downloads — the top
  // hit is often region/label-blocked ("video not available", common for
  // Disney/Vevo). --ignore-errors skips the dead ones; --max-downloads 1 stops
  // at the first success. `|| true` because both of those exit non-zero; we
  // judge success by whether a filepath was printed.
  const cmd = [
    `mkdir -p ${sq(libDir)} &&`,
    sq(bins.yt_dlp),
    `--no-warnings --ignore-errors --max-downloads 1`,
    `-x --audio-format mp3 --audio-quality ${sq(quality)}`,
    `--embed-thumbnail`,
    `--postprocessor-args ${sq(ppa)}`,
    `--ffmpeg-location ${sq(bins.ffmpeg)}`,
    `--print after_move:filepath`,
    `-o ${sq(outTmpl)}`,
    sq(`ytsearch5:${query}`),
    `|| true`,
  ].join(' ');

  try {
    const out = await runBash(cmd);
    const lines = out.trim().split('\n').filter(Boolean);
    const file = [...lines].reverse().find((l) => l.endsWith('.mp3')) || '';
    return file ? { ok: true, file } : { ok: false, error: 'no playable source found' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Download a KARAOKE VIDEO for a track — lyrics burned into the picture and the
// lead vocal already removed (the "<song> karaoke" uploads on YouTube). This is
// the preferred karaoke source: it sidesteps both lyric-fetch and vocal removal.
// Returns { ok, file } (an .mp4) or { ok:false, error }.
export async function downloadKaraokeVideo(bins, cfg, track) {
  const libDir = await resolvePath(cfg.library_dir || '~/Music/DJ');
  const name = `${safe(track.artist)} - ${safe(track.title)} (Karaoke)`;
  const outTmpl = `${libDir}/${name}.%(ext)s`;
  const query = `${track.artist} ${track.title} karaoke`.trim();

  // Cap at 720p so files stay reasonable; merge to a single .mp4. Same
  // search-several-grab-first-playable approach as the audio path.
  const cmd = [
    `mkdir -p ${sq(libDir)} &&`,
    sq(bins.yt_dlp),
    `--no-warnings --ignore-errors --max-downloads 1`,
    `-f ${sq('bv*[height<=720]+ba/b[height<=720]/b')}`,
    `--merge-output-format mp4`,
    `--ffmpeg-location ${sq(bins.ffmpeg)}`,
    `--print after_move:filepath`,
    `-o ${sq(outTmpl)}`,
    sq(`ytsearch5:${query}`),
    `|| true`,
  ].join(' ');

  try {
    const out = await runBash(cmd);
    const lines = out.trim().split('\n').filter(Boolean);
    const file = [...lines].reverse().find((l) => /\.(mp4|mkv|webm)$/.test(l)) || '';
    return file ? { ok: true, file } : { ok: false, error: 'no karaoke video found' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
