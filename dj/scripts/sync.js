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
export async function syncToPhone(cfg, onProgress, opts = {}) {
  const target = makeTarget(cfg);

  if (!(await target.test())) {
    throw new Error(
      'Can’t reach the phone — open VLC, turn on Sharing via WiFi, and check you’re on the same network.',
    );
  }

  const lib = await loadLibrary();
  const basename = (p) => String(p).split('/').pop().toLowerCase();

  // Auto-ignore songs the phone ALREADY has: read its file list and skip those
  // (more robust than synced_to bookkeeping). Also reconcile — mark anything
  // already on the device as synced so counts stay honest.
  let onPhone = new Set();
  try { onPhone = new Set((await (target.list?.() || [])).map((n) => n.toLowerCase())); } catch { /* best-effort */ }
  const present = (t) => t.file && onPhone.has(basename(t.file));
  for (const t of lib.tracks) {
    if (present(t) && !(t.synced_to || []).includes(cfg.id)) {
      t.synced_to = [...new Set([...(t.synced_to || []), cfg.id])];
    }
  }

  let pending = lib.tracks.filter(
    (t) => t.file && !(t.synced_to || []).includes(cfg.id) && !present(t),
  );
  if (opts.filter) pending = pending.filter(opts.filter);

  let done = 0;
  for (const t of pending) {
    onProgress?.({ done, total: pending.length, track: t });
    try {
      await target.push(t.file);
      // Lyrics ride along (best-effort) so players that read .lrc show them.
      if (t.lrc) { try { await target.push(t.lrc); } catch { /* lyrics optional */ } }
      t.synced_to = [...new Set([...(t.synced_to || []), cfg.id])];
    } catch (e) {
      onProgress?.({ done, total: pending.length, track: t, error: String(e.message || e) });
    }
    done += 1;
  }

  await saveLibrary(lib);
  onProgress?.({ done, total: pending.length, finished: true });
  return { pushed: done, total: pending.length };
}
