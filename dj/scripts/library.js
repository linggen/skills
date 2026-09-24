// library.js — READ side of the DJ library and its queue, plus config. All
// library writes live in actions.mjs (the one writer, via bash.js runAction);
// this module only loads what it wrote. config.json's single writer is the
// settings page.

import { runBash, writeFile, DJ_DIR } from './bash.js';

const DEFAULT_CONFIG = {
  library_dir: '~/Music/DJ',
  bitrate: '320',
  naming_template: '%(artist)s - %(title)s',
};

export async function loadConfig() {
  try {
    const out = await runBash(`cat "${DJ_DIR}/config.json" 2>/dev/null || cat "${DJ_DIR}/config.example.json"`);
    return { ...DEFAULT_CONFIG, ...JSON.parse(out) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(cfg) {
  await writeFile(`${DJ_DIR}/config.json`, `${JSON.stringify(cfg, null, 2)}\n`);
}

const EMPTY = () => ({ tracks: [], playlists: [], phone: { files: [], playlists: [] } });

export async function loadLibrary() {
  try {
    const lib = JSON.parse(await runBash(`cat "${DJ_DIR}/library.json" 2>/dev/null || echo '{}'`));
    return { ...EMPTY(), ...lib, phone: { ...EMPTY().phone, ...(lib.phone || {}) } };
  } catch {
    return EMPTY();
  }
}

/// data/queue.json as the worker and actions.mjs left it.
export async function loadQueue() {
  try {
    const q = JSON.parse(await runBash(`cat "${DJ_DIR}/data/queue.json" 2>/dev/null || echo '{}'`));
    return Array.isArray(q.items) ? q.items : [];
  } catch {
    return [];
  }
}

// A song's identity before it has a file: artist|title, case- and
// space-insensitive. The same key actions.mjs and the queue use.
export const trackId = (t) =>
  `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;

export const trackKey = (t) => t.id || trackId(t);

/// The library row for a proposed song — by the title it was asked for too,
/// since a download may have named it by the catalogue's.
export const ownedRow = (lib, t) => {
  const id = trackId(t);
  return (lib.tracks || []).find((x) => x.file && (x.id === id || trackId(x) === id ||
    (x.requested_title && trackId({ artist: x.artist, title: x.requested_title }) === id))) || null;
};

export const isOwned = (lib, t) => !!ownedRow(lib, t);
