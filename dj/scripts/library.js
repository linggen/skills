// library.js — the DJ library index + config, persisted under the skill dir.
// library.json is the source of truth the ListLibrary tool also reads, so the
// agent and the page always agree on what's owned.

import { runBash, writeFile } from './bash.js';

const DJ_DIR = '$HOME/.linggen/skills/dj';

const DEFAULT_CONFIG = {
  library_dir: '~/Music/DJ',
  bitrate: '320',
  naming_template: '%(artist)s - %(title)s',
  sync_targets: [],
};

export async function loadConfig() {
  try {
    const out = await runBash(
      `cat "${DJ_DIR}/config.json" 2>/dev/null || cat "${DJ_DIR}/config.example.json"`,
    );
    return { ...DEFAULT_CONFIG, ...JSON.parse(out) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(cfg) {
  await writeFile(`${DJ_DIR}/config.json`, JSON.stringify(cfg, null, 2));
}

export async function loadLibrary() {
  try {
    const out = await runBash(
      `cat "${DJ_DIR}/library.json" 2>/dev/null || echo '{"tracks":[],"playlists":[]}'`,
    );
    const lib = JSON.parse(out);
    lib.tracks ||= [];
    lib.playlists ||= [];
    return lib;
  } catch {
    return { tracks: [], playlists: [] };
  }
}

export async function saveLibrary(lib) {
  await writeFile(`${DJ_DIR}/library.json`, JSON.stringify(lib, null, 2));
}

// Stable id for a track so dupes collapse and sync state sticks.
export const trackId = (t) =>
  `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;

export const isOwned = (lib, t) => {
  const id = trackId(t);
  return lib.tracks.some((x) => x.id === id || trackId(x) === id);
};
