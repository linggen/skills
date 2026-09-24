// reconcile.mjs — the music folder is ground truth for which songs exist.
//
// Adopts files that landed outside DJ's own flow (Finder drops), retires rows
// whose file vanished, keeps a RENAMED song's places, and picks up the
// sidecars that appeared or went: `.lrc` beside a song, and its karaoke
// renders in `.karaoke/` — which is how a GetKaraoke download lights 🎤.

import fs from 'node:fs';
import path from 'node:path';

import { base, norm, idOf, pruneMissing, renameFile } from './store.js';
import { readJson, DJ_DIR, HOME } from './io.mjs';

const AUDIO = new Set(['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac']);
const KARAOKE = { karaoke_audio: 'mp3', karaoke_video: 'mp4' };
const SUFFIX = ' (Karaoke)';

const extOf = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
const stemOf = (n) => (n.lastIndexOf('.') > 0 ? n.slice(0, n.lastIndexOf('.')) : n);

export function libraryDir() {
  const dir = readJson(path.join(DJ_DIR, 'config.json'), {}).library_dir || '~/Music/DJ';
  return dir.startsWith('~') ? path.join(HOME, dir.slice(1)) : dir;
}

const filesIn = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return null;
  }
};

/// "Artist - Title" as a filename says it.
const nameParts = (stem) => {
  const dash = stem.indexOf(' - ');
  return dash > 0 ? { artist: stem.slice(0, dash), title: stem.slice(dash + 3) } : { artist: '', title: stem };
};

/// Who a song is, however its file is spelled: width, case, spacing and the
/// characters a filename can't carry all fold away.
export const songKey = (artist, title) =>
  [artist, title]
    .map((s) => String(s || '').normalize('NFKC').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase())
    .join('|');

/// A tracked file vanished and a file for the same song arrived: that is a
/// rename, not a delete plus a stranger. The row, its play count and its
/// places in every list — on the Mac and on the phone — move to the new name.
function carryRenames(lib, dir, vanished, arrivals) {
  const waiting = new Map();
  for (const t of vanished) {
    const key = songKey(t.artist, t.title);
    if (!waiting.has(key)) waiting.set(key, t);
  }
  const taken = new Set();
  for (const name of arrivals) {
    const { artist, title } = nameParts(stemOf(name));
    const key = songKey(artist, title);
    const row = waiting.get(key);
    if (!row) continue;
    waiting.delete(key);
    renameFile(lib, row.file, name);
    row.file = path.join(dir, name);
    taken.add(name);
  }
  return taken;
}

function adopt(lib, dir, names, sidecar) {
  for (const name of names) {
    const { artist, title } = nameParts(stemOf(name));
    let mtime = Date.now();
    try { mtime = fs.statSync(path.join(dir, name)).mtimeMs; } catch { /* raced away */ }
    const row = { id: idOf({ artist, title }), artist, title, file: path.join(dir, name), added_at: new Date(mtime).toISOString(), playlists: [] };
    const lrc = sidecar(stemOf(name));
    if (lrc) row.lrc = lrc;
    lib.tracks.push(row);
  }
  return names.length;
}

/// `.lrc` beside the song: dropped when it went, picked up when it came.
function syncLrc(t, sidecar, onDisk) {
  let changed = 0;
  if (t.lrc && !onDisk(t.lrc)) { delete t.lrc; changed += 1; }
  if (!t.lrc) {
    const lrc = sidecar(stemOf(base(t.file)));
    if (lrc) { t.lrc = lrc; changed += 1; }
  }
  return changed;
}

/// Karaoke renders in `.karaoke/`, named "<song stem> (Karaoke).<ext>": found
/// ones light the badge, deleted ones stop advertising a button that opens
/// nothing.
function syncKaraoke(t, kdir, karaoke) {
  let changed = 0;
  const stem = stemOf(base(t.file));
  for (const [field, ext] of Object.entries(KARAOKE)) {
    const hit = karaoke.get(norm(`${stem}${SUFFIX}.${ext}`));
    const found = hit ? path.join(kdir, hit) : null;
    if (found && t[field] !== found) { t[field] = found; changed += 1; }
    if (!found && t[field] && !fs.existsSync(t[field])) { delete t[field]; changed += 1; }
  }
  return changed;
}

/// Brings `lib` in line with the folder, in place. `changed` says whether it
/// needs saving.
export function reconcile(lib) {
  const dir = libraryDir();
  const names = filesIn(dir);
  // Unreadable or empty folder → never mass-retire a whole library.
  if (!names || !names.length) return { adopted: 0, retired: 0, pruned: 0, renamed: 0, changed: false };

  const byNorm = new Map(names.map((n) => [norm(n), n]));
  const onDisk = (p) => byNorm.has(norm(p));
  const sidecar = (stem) => {
    const hit = byNorm.get(norm(`${stem}.lrc`));
    return hit ? path.join(dir, hit) : null;
  };

  const known = new Set(lib.tracks.filter((t) => t.file).map((t) => norm(t.file)));
  const arrivals = names.filter((n) => AUDIO.has(extOf(n)) && !known.has(norm(n)));
  const vanished = lib.tracks.filter((t) => t.file && !onDisk(t.file));

  const renamedTo = carryRenames(lib, dir, vanished, arrivals);
  const adopted = adopt(lib, dir, arrivals.filter((n) => !renamedTo.has(n)), sidecar);

  const before = lib.tracks.length;
  lib.tracks = lib.tracks.filter((t) => !t.file || onDisk(t.file));
  const retired = before - lib.tracks.length;
  // Lists and the phone may only name songs that exist. Memberships only: no
  // phone loses a file over this.
  const pruned = pruneMissing(lib, onDisk);

  const kdir = path.join(dir, '.karaoke');
  const karaoke = new Map((filesIn(kdir) || []).map((n) => [norm(n), n]));
  let sidecars = 0;
  for (const t of lib.tracks) {
    if (!t.file) continue;
    sidecars += syncLrc(t, sidecar, onDisk) + syncKaraoke(t, kdir, karaoke);
  }

  const renamed = renamedTo.size;
  return { adopted, retired, pruned, renamed, changed: !!(adopted || retired || pruned || renamed || sidecars) };
}
