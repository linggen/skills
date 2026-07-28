// library.js — the DJ library index + config, persisted under the skill dir.
// library.json is the source of truth the ListLibrary tool also reads, so the
// agent and the page always agree on what's owned.

import { runBash, writeFile, resolvePath, sq } from './bash.js';

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
  await exportPlaylists(lib);
}

// ── the playlists a paired phone can see ─────────────────────────────────────
//
// library.json lives under the skill dir, and the engine's device sync serves
// the library FOLDER and nothing else — so a phone has never been able to see
// a playlist, only loose files. Every save drops a small derived copy of them
// inside the folder, where sync can already reach it. No engine change: it
// rides the `sync:` declaration DJ already has.
//
// Derived from the per-track tags rather than lib.playlists, because the tags
// are what the sidebar has always read and the top-level array has drifted
// empty. And the names written out are the ones on DISK, not the ones in the
// index: a phone matches what sync handed it, and macOS is free to disagree
// with us about Unicode normalization.
export async function exportPlaylists(lib, dirOverride) {
  try {
    const dir = dirOverride || (await resolvePath((await loadConfig()).library_dir));
    const onDisk = new Map();
    const out = await runBash(`cd ${sq(dir)} 2>/dev/null && ls -1 -- * 2>/dev/null; true`);
    for (const name of out.split('\n').map((l) => l.trim()).filter(Boolean)) {
      onDisk.set(norm(name), name);
    }

    const lists = new Map();
    for (const t of lib.tracks || []) {
      if (!t.file) continue;
      const file = onDisk.get(norm(t.file));
      if (!file) continue; // retired, or not in this folder — not the phone's
      for (const name of t.playlists || []) {
        if (!lists.has(name)) lists.set(name, []);
        lists.get(name).push(file);
      }
    }

    const playlists = [...lists.entries()]
      .map(([name, files]) => ({ name, files }))
      .sort((a, b) => a.name.localeCompare(b.name));
    await writeFile(
      `${dir}/playlists.json`,
      JSON.stringify({ updated_at: new Date().toISOString(), playlists }, null, 2),
    );
  } catch {
    // Best-effort: the phone keeps whatever it last synced. Never let this
    // break the save the user actually asked for.
  }
}

// Stable id for a track so dupes collapse and sync state sticks.
export const trackId = (t) =>
  `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;

export const isOwned = (lib, t) => {
  const id = trackId(t);
  return lib.tracks.some((x) => x.id === id || trackId(x) === id);
};

// ── folder ⇄ index reconcile ─────────────────────────────────────────────────
// The library FOLDER is ground truth for which files exist; library.json is
// the curated view (playlists, sync state). Files can land in the folder
// outside DJ's download flow (Finder drops, other machines) and rows can
// outlive a Finder-deleted file — reconcile adopts the former and retires the
// latter so the page, the agent, and phone sync all agree.

const AUDIO_EXTS = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac'];
const ext = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
const stemOf = (n) => n.slice(0, n.lastIndexOf('.'));
// NFC-normalized basename compare — macOS stores decomposed Unicode.
const norm = (n) => String(n).split('/').pop().normalize('NFC').toLowerCase();

/// Mutates `lib` in place; returns { adopted, retired } counts.
export async function reconcileLibrary(lib, cfg) {
  const dir = await resolvePath(cfg.library_dir || '~/Music/DJ');
  let out = '';
  try {
    out = await runBash(`cd ${sq(dir)} 2>/dev/null && stat -f '%m|%N' -- * 2>/dev/null; true`);
  } catch {
    return { adopted: 0, retired: 0 };
  }
  const entries = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('|'))
    .map((l) => {
      const i = l.indexOf('|');
      return { mtime: Number(l.slice(0, i)), name: l.slice(i + 1) };
    });
  // Unreadable/empty folder → never mass-retire a whole library.
  if (!entries.length) return { adopted: 0, retired: 0 };

  const byNorm = new Map(entries.map((e) => [norm(e.name), e.name]));
  const sidecar = (stem, exts) => {
    for (const x of exts) {
      const hit = byNorm.get(norm(`${stem}.${x}`));
      if (hit) return `${dir}/${hit}`;
    }
    return null;
  };

  const known = new Set(lib.tracks.filter((t) => t.file).map((t) => norm(t.file)));
  let adopted = 0;
  for (const e of entries) {
    if (!AUDIO_EXTS.includes(ext(e.name)) || known.has(norm(e.name))) continue;
    const stem = stemOf(e.name);
    const dash = stem.indexOf(' - ');
    const artist = dash > 0 ? stem.slice(0, dash) : '';
    const title = dash > 0 ? stem.slice(dash + 3) : stem;
    const row = {
      id: trackId({ artist, title }),
      artist,
      title,
      file: `${dir}/${e.name}`,
      added_at: new Date(e.mtime * 1000).toISOString(),
      playlists: [],
      synced_to: [],
    };
    const lrc = sidecar(stem, ['lrc']);
    if (lrc) row.lrc = lrc;
    lib.tracks.push(row);
    adopted += 1;
  }

  const before = lib.tracks.length;
  lib.tracks = lib.tracks.filter((t) => !t.file || byNorm.has(norm(t.file)));
  const retired = before - lib.tracks.length;

  // Existing rows: pick up a .lrc that appeared beside the file, drop one that
  // vanished — same drift, smaller scale.
  for (const t of lib.tracks) {
    if (!t.file) continue;
    if (t.lrc && !byNorm.has(norm(t.lrc))) delete t.lrc;
    if (!t.lrc) {
      const lrc = sidecar(stemOf(String(t.file).split('/').pop()), ['lrc']);
      if (lrc) t.lrc = lrc;
    }
  }

  return { adopted, retired };
}
