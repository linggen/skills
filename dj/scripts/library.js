// library.js — the DJ library index + config, persisted under the skill dir.
// library.json is the source of truth the ListLibrary tool also reads, so the
// agent and the page always agree on what's owned.

import { runBash, writeFile, sq } from './bash.js';
import { Register, project, seedFromTracks } from './lww.js';

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
/// first. Playlist/track mutations live in actions.mjs now (one writer, called
/// by the agent's tools and the page's buttons alike); this path remains for
/// the fields only the page writes (karaoke files, lyrics, sync ledgers) — and
/// a song the register says is gone is gone from the folder too, plainly:
/// DJ music is reproducible, so a delete is a re-download rather than a loss.
export async function saveLibrary(lib) {
  await _persist(lib, await register(lib));
}

/// The write itself, taking the register rather than fetching it — so the seed
/// path can persist before `register()` has returned.
///
/// Merge the on-disk register in first: actions.mjs (or a phone sync) may have
/// written cells since this page loaded, and toState() would silently drop
/// them. The merge is per-key LWW — this page's own fresh edits still win
/// their keys, everyone else's survive.
async function _persist(lib, r) {
  try {
    const raw = await runBash(`cat "${DATA}/playlist-edits.json" 2>/dev/null; true`);
    if (raw.trim()) r.mergeState(JSON.parse(raw));
  } catch { /* unreadable — write what we have */ }
  for (const file of project(r, lib)) {
    try {
      await runBash(`rm -f ${sq(file)}`);
    } catch { /* already gone */ }
  }
  await writeFile(`${DJ_DIR}/library.json`, JSON.stringify(lib, null, 2));
  await saveRegister(r);
}

// Stable id for a track so dupes collapse and sync state sticks.
export const trackId = (t) =>
  `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;

export const isOwned = (lib, t) => {
  const id = trackId(t);
  return lib.tracks.some((x) => x.id === id || trackId(x) === id);
};

// The folder ⇄ index reconcile moved to actions.mjs (`reconcile`) — the one
// writer — so the agent's downloads register without a page open. The page
// calls the same verb.
