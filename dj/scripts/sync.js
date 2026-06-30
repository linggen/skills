// sync.js — copy the library to the phone, incrementally. Picks the target
// adapter by type, skips tracks already on the device, reports progress, and
// persists per-track sync state so a re-run only pushes what's new.

import { vlcTarget } from './sync/vlc.js';
import { webdavTarget } from './sync/webdav.js';
import { folderTarget } from './sync/folder.js';
import { loadLibrary, saveLibrary } from './library.js';

function makeTarget(cfg) {
  switch (cfg.type) {
    case 'vlc':
      return vlcTarget(cfg);
    case 'webdav':
      return webdavTarget(cfg);
    case 'folder':
      return folderTarget(cfg);
    default:
      throw new Error(`unknown sync target type: ${cfg.type}`);
  }
}

export async function testTarget(cfg) {
  return makeTarget(cfg).test();
}

// onProgress({ done, total, track?, error?, finished? })
// opts.filter — optional (track) => boolean to sync a subset (e.g. one crate).
// opts.playlist — optional single crate name to push as the only .m3u. When
//   omitted, every playlist the synced tracks belong to is pushed as its own
//   .m3u (so a full / multi-crate sync carries all the user's playlists across).
export async function syncToPhone(cfg, onProgress, opts = {}) {
  const target = makeTarget(cfg);

  if (!(await target.test())) {
    throw new Error(
      'Can’t reach the phone — open VLC, turn on Sharing via WiFi, and check you’re on the same network.',
    );
  }

  const lib = await loadLibrary();
  const basename = (p) => String(p).split('/').pop().toLowerCase();

  // What's already on the phone (basenames). Drives BOTH "skip the mp3" and
  // "skip the .lrc" — so a song already on the device that's only missing its
  // lyrics still gets the .lrc pushed. Reconcile synced_to from the live list.
  let onPhone = new Set();
  try { onPhone = new Set((await (target.list?.() || [])).map((n) => n.toLowerCase())); } catch { /* best-effort */ }
  const has = (p) => !!p && onPhone.has(basename(p));
  for (const t of lib.tracks) {
    if (has(t.file) && !(t.synced_to || []).includes(cfg.id)) {
      t.synced_to = [...new Set([...(t.synced_to || []), cfg.id])];
    }
  }

  // A track needs work if its mp3 OR its (existing) .lrc is missing on the phone.
  let work = lib.tracks.filter((t) => t.file && (!has(t.file) || (t.lrc && !has(t.lrc))));
  if (opts.filter) work = work.filter(opts.filter);

  let done = 0; // tracks processed (advances the progress bar even on failure)
  let pushed = 0; // tracks that actually completed without error
  let lyricsOnly = 0;
  for (const t of work) {
    onProgress?.({ done, total: work.length, track: t });
    try {
      if (!has(t.file)) await target.push(t.file);
      // Push the .lrc if the phone is missing it (covers tracks already on the
      // device whose lyrics were fetched later).
      if (t.lrc && !has(t.lrc)) { await target.push(t.lrc); if (has(t.file)) lyricsOnly += 1; }
      t.synced_to = [...new Set([...(t.synced_to || []), cfg.id])];
      pushed += 1;
    } catch (e) {
      onProgress?.({ done, total: work.length, track: t, error: String(e.message || e) });
    }
    done += 1;
  }

  await saveLibrary(lib);

  // Send playlists as .m3u files so crates land as real playlists on the device,
  // not just loose tracks. Which playlists: a single named crate (opts.playlist),
  // otherwise EVERY playlist the synced tracks belong to — so a "sync all" carries
  // all the crates across, not nothing. Each .m3u lists its playlist's full
  // tracks-with-files (complete on the device even if some weren't pushed this
  // run). Best-effort, and only for targets that support it (VLC today).
  let playlists = 0;
  if (target.pushPlaylist) {
    const scope = opts.filter ? lib.tracks.filter(opts.filter) : lib.tracks;
    const names = opts.playlist
      ? [opts.playlist]
      : [...new Set(scope.flatMap((t) => t.playlists || []))].sort();
    for (const name of names) {
      const inCrate = lib.tracks.filter((t) => t.file && (t.playlists || []).includes(name));
      if (!inCrate.length) continue;
      try { await target.pushPlaylist(name, inCrate); playlists += 1; }
      catch (e) { onProgress?.({ done, total: work.length, error: `playlist “${name}”: ${e.message || e}` }); }
    }
  }

  onProgress?.({ done, total: work.length, finished: true });
  return { pushed, total: work.length, lyricsOnly, playlists };
}
