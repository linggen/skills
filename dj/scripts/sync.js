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
// opts.playlist — optional crate name; when set (and the target supports it), an
//   .m3u of that crate is uploaded after the tracks so it lands as a playlist.
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

  let done = 0;
  let lyricsOnly = 0;
  for (const t of work) {
    onProgress?.({ done, total: work.length, track: t });
    try {
      if (!has(t.file)) await target.push(t.file);
      // Push the .lrc if the phone is missing it (covers tracks already on the
      // device whose lyrics were fetched later).
      if (t.lrc && !has(t.lrc)) { await target.push(t.lrc); if (has(t.file)) lyricsOnly += 1; }
      t.synced_to = [...new Set([...(t.synced_to || []), cfg.id])];
    } catch (e) {
      onProgress?.({ done, total: work.length, track: t, error: String(e.message || e) });
    }
    done += 1;
  }

  await saveLibrary(lib);

  // After the tracks, send the crate as a playlist (.m3u) if asked + supported.
  // Lists ALL of the crate's tracks-with-files (not just the ones pushed this
  // run), so the playlist on the device is complete. Best-effort.
  let playlist = false;
  if (opts.playlist && target.pushPlaylist) {
    const inCrate = lib.tracks.filter((t) => t.file && (!opts.filter || opts.filter(t)));
    if (inCrate.length) {
      try { await target.pushPlaylist(opts.playlist, inCrate); playlist = true; }
      catch (e) { onProgress?.({ done, total: work.length, error: `playlist: ${e.message || e}` }); }
    }
  }

  onProgress?.({ done, total: work.length, finished: true });
  return { pushed: done, total: work.length, lyricsOnly, playlist };
}
