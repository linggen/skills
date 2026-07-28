// library.js — the DJ library index + config, persisted under the skill dir.
// library.json is the source of truth the ListLibrary tool also reads, so the
// agent and the page always agree on what's owned.

import { runBash, writeFile, resolvePath, sq } from './bash.js';
import { Register, project, seedFromTracks, undeleteTrack } from './lww.js';

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

// ── the edit register (data/playlist-edits.json) ─────────────────────────────
// Playlist membership, order and deletions live in cells, not in library.json —
// so this Mac and a paired phone merge per-key instead of one side's file
// winning wholesale. library.json keeps a projected COPY in `tracks[].playlists`
// and `playlists[]`, which is what the page, the ListLibrary tool and the agent
// have always read; none of them has to learn about cells. See lww.js.

const DATA = `${DJ_DIR}/data`;

let _reg = null;

/// This machine's id: the LWW tiebreak, not a secret. Written once, next to the
/// register, so it survives across sessions.
async function deviceId() {
  let id = '';
  try {
    id = (await runBash(`cat "${DATA}/device-id" 2>/dev/null; true`)).trim();
  } catch { /* first run */ }
  if (id) return id;
  id = `mac-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await writeFile(`${DATA}/device-id`, `${id}\n`);
  return id;
}

/// The register, loaded once per page.
///
/// Seeded from whatever `tracks[].playlists[]` already holds, so a library that
/// predates this file keeps its playlists. Seeding only fills keys the register
/// has never held, so it re-seeds nothing and resurrects nothing you removed —
/// and it runs on every load, because the register can exist without this Mac
/// ever having migrated: a paired phone creates it the first time it syncs.
export async function register(lib) {
  if (_reg) return _reg;
  let state = null;
  try {
    const raw = await runBash(`cat "${DATA}/playlist-edits.json" 2>/dev/null; true`);
    state = raw.trim() ? JSON.parse(raw) : null;
  } catch { /* absent or half-written — start clean */ }
  _reg = new Register(await deviceId(), state);
  // Persist the seed straight away rather than waiting for an edit — and write
  // the library through with it, so `playlists[]` is never a stale copy of what
  // the register says. A library nobody has touched today still has playlists,
  // and a phone that syncs before the first edit must find them: it has the
  // files, but only this side has the tags to seed from.
  if (lib && seedFromTracks(_reg, lib) > 0) await _persist(lib, _reg);
  return _reg;
}

export async function saveRegister(r) {
  await writeFile(`${DATA}/playlist-edits.json`, `${JSON.stringify(r.toState(), null, 2)}\n`);
}

/// Persist the library AND the register, with the register projected through
/// first. Every mutation goes through here, so the page can never show a
/// playlist it hasn't stored — and a song the register says is gone is gone
/// from the folder too, plainly: DJ music is reproducible, so a delete is a
/// re-download rather than a loss.
export async function saveLibrary(lib) {
  await _persist(lib, await register(lib));
}

/// The write itself, taking the register rather than fetching it — so the seed
/// path can persist before `register()` has returned.
async function _persist(lib, r) {
  for (const file of project(r, lib)) {
    try {
      await runBash(`rm -f ${sq(file)}`);
    } catch { /* already gone */ }
  }
  await writeFile(`${DJ_DIR}/library.json`, JSON.stringify(lib, null, 2));
  await saveRegister(r);
}

/// A song arriving under a name that was deleted before is a NEW song — clear
/// the tombstone so the projection can't delete it again. Called wherever a
/// file enters the library.
export async function adopted(files) {
  const r = await register();
  for (const f of files) undeleteTrack(r, f);
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
