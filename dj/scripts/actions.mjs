// actions.mjs — the ONE writer for the DJ library. Every mutation, whoever
// asks for it, runs through here: the agent's SKILL.md tools call it via
// run-js.sh, and the page's buttons call the same verbs over /api/bash. The
// page renders; this file writes. (karaoke.js and sync.js still save through
// library.js for their own fields — that path merges the on-disk register
// first, so nothing here can be clobbered.)
//
// Runs under bun or node (run-js.sh picks). Shares lww.js — the exact cell
// vocabulary the page and the paired phone already speak — so a mutation made
// here merges with theirs per-key instead of fighting over files.
//
// Usage: actions.mjs <verb> [args…]; every verb prints one JSON line.

import fs from 'node:fs';
import path from 'node:path';
import {
  Register, project, seedFromTracks,
  createList, deleteList, renameList, addToList, removeFromList, setOrder,
  deleteTrack, undeleteTrack, listsOf, filesInList,
} from './lww.js';

const HOME = process.env.HOME || '';
const DJ_DIR = process.env.DJ_DIR || path.join(HOME, '.linggen', 'skills', 'dj');
const DATA = path.join(DJ_DIR, 'data');
const LIB = path.join(DJ_DIR, 'library.json');
const REG = path.join(DATA, 'playlist-edits.json');

const die = (error) => {
  console.log(JSON.stringify({ ok: false, error }));
  console.error(error); // /api/bash callers surface stderr on a non-zero exit
  process.exit(1);
};

// The engine substitutes {{arg}} literally when the model omits an arg — a
// placeholder-shaped value is a missing one, never data.
const arg = (v, name) => {
  const s = String(v ?? '').trim();
  if (!s || /^\{\{.*\}\}$/.test(s)) die(`missing ${name}`);
  return s;
};

const jsonArg = (v, name) => {
  const s = arg(v, name);
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed) || !parsed.length) die(`${name} must be a non-empty JSON array`);
    return parsed;
  } catch (e) {
    if (e instanceof SyntaxError) die(`${name} is not valid JSON: ${s.slice(0, 80)}`);
    throw e;
  }
};

// ── store io ─────────────────────────────────────────────────────────────────

const readJson = (file, fallback) => {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// tmp + rename so a concurrently-reading page never sees a half-written file.
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
};

function deviceId() {
  const file = path.join(DATA, 'device-id');
  try {
    const id = fs.readFileSync(file, 'utf8').trim();
    if (id) return id;
  } catch { /* first run */ }
  const id = `mac-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, `${id}\n`);
  return id;
}

// One mutation at a time: two agent calls (or a page call beside one) must not
// interleave a read-modify-write. mkdir is the portable atomic lock.
const LOCK = path.join(DATA, '.actions-lock');
function lock() {
  fs.mkdirSync(DATA, { recursive: true });
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      return;
    } catch {
      if (Date.now() > deadline) {
        // A crashed run leaves the dir behind; past the deadline, claim it.
        try { fs.rmdirSync(LOCK); } catch { /* raced */ }
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
const unlock = () => { try { fs.rmdirSync(LOCK); } catch { /* already gone */ } };

function loadStore() {
  const lib = readJson(LIB, { tracks: [], playlists: [] });
  lib.tracks ||= [];
  lib.playlists ||= [];
  const reg = new Register(deviceId(), readJson(REG, null));
  if (lib && seedFromTracks(reg, lib) > 0) persist(lib, reg);
  return { lib, reg };
}

// Mirror of the page's old _persist: project the register through the library,
// unlink what it says is gone, write both files.
function persist(lib, reg) {
  for (const file of project(reg, lib)) {
    try { fs.rmSync(file, { force: true }); } catch { /* already gone */ }
  }
  writeJson(LIB, lib);
  writeJson(REG, reg.toState());
}

// ── track resolution ─────────────────────────────────────────────────────────
// Callers name songs by the `file` value ListLibrary returns — full path or
// basename — or by "artist|title". Comparison is NFC-lowercase (macOS stores
// decomposed Unicode); the cell keys keep the raw basename so they stay
// byte-identical with the phone's.

const norm = (s) => String(s || '').split('/').pop().normalize('NFC').toLowerCase();
const idOf = (t) => `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;

function resolveTracks(lib, wanted) {
  const rows = lib.tracks.filter((t) => t.file);
  const byBase = new Map(rows.map((t) => [norm(t.file), t]));
  const byId = new Map(rows.map((t) => [t.id || idOf(t), t]));
  const hits = [];
  const missing = [];
  for (const w of wanted) {
    const key = String(w || '').trim();
    const t = byBase.get(norm(key)) || byId.get(key.toLowerCase());
    if (t) hits.push(t);
    else missing.push(key);
  }
  if (missing.length) die(`not in the library: ${missing.join(', ')} — use the file names ListLibrary returns`);
  return hits;
}

const requireList = (reg, name) => {
  if (!listsOf(reg).includes(name)) die(`no playlist named “${name}” — ListLibrary shows the current ones`);
};

// ── verbs ────────────────────────────────────────────────────────────────────

const VERBS = {
  'playlist-create': (a) => {
    const name = arg(a[0], 'name');
    const { lib, reg } = loadStore();
    createList(reg, name);
    persist(lib, reg);
    return { ok: true, playlist: name };
  },

  'playlist-rename': (a) => {
    const oldName = arg(a[0], 'old_name');
    const newName = arg(a[1], 'new_name');
    if (oldName === newName) return { ok: true, playlist: newName };
    const { lib, reg } = loadStore();
    requireList(reg, oldName);
    const merged = listsOf(reg).includes(newName);
    renameList(reg, oldName, newName, filesInList(reg, oldName));
    persist(lib, reg);
    return { ok: true, playlist: newName, merged };
  },

  'playlist-delete': (a) => {
    const name = arg(a[0], 'name');
    const { lib, reg } = loadStore();
    requireList(reg, name);
    const kept = filesInList(reg, name).length;
    deleteList(reg, name, filesInList(reg, name));
    persist(lib, reg);
    return { ok: true, deleted: name, songs_kept: kept };
  },

  'playlist-add': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    addToList(reg, tracks.map((t) => t.file), name);
    persist(lib, reg);
    return { ok: true, playlist: name, added: tracks.length };
  },

  'playlist-remove': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const { lib, reg } = loadStore();
    requireList(reg, name);
    const tracks = resolveTracks(lib, files);
    removeFromList(reg, tracks.map((t) => t.file), name);
    persist(lib, reg);
    return { ok: true, playlist: name, removed: tracks.length };
  },

  'playlist-reorder': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const { lib, reg } = loadStore();
    requireList(reg, name);
    const tracks = resolveTracks(lib, files);
    setOrder(reg, name, tracks.map((t) => t.file));
    persist(lib, reg);
    return { ok: true, playlist: name, order: tracks.map((t) => norm(t.file)) };
  },

  // The song leaves the library: its cell (what a paired phone merges), its
  // sidecars here, and — via the projection in persist() — the audio file.
  // Reproducible by design, so a plain delete rather than a Trash trip.
  'tracks-delete': (a) => {
    const files = jsonArg(a[0], 'files');
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    for (const t of tracks) {
      deleteTrack(reg, t.file);
      for (const f of [t.lrc, t.karaoke_video]) {
        if (f) { try { fs.rmSync(f, { force: true }); } catch { /* already gone */ } }
      }
    }
    persist(lib, reg);
    return { ok: true, deleted: tracks.length, files: tracks.map((t) => norm(t.file)) };
  },

  // A downloaded file becomes a library row (page's download flow calls this
  // per landed track). Re-downloading a deleted name makes it a new song.
  'track-add': (a) => {
    const t = (() => {
      try { return JSON.parse(arg(a[0], 'track')); } catch { return die('track is not valid JSON'); }
    })();
    if (!t.file || !t.title) die('track needs at least { title, file }');
    const { lib, reg } = loadStore();
    const id = t.id || idOf(t);
    const row = lib.tracks.find((x) => x.id === id);
    const known = !!row;
    if (!known) {
      lib.tracks.push({
        id,
        artist: t.artist || '',
        title: t.title,
        year: t.year || undefined,
        file: t.file,
        lrc: t.lrc || undefined,
        added_at: new Date().toISOString(),
        playlists: [],
        synced_to: [],
      });
    } else {
      // A known song gaining its file (karaoke fetched the original) or
      // filling gaps — never blank an existing value.
      if (t.file && row.file !== t.file) row.file = t.file;
      if (t.year && !row.year) row.year = t.year;
      if (t.lrc && !row.lrc) row.lrc = t.lrc;
    }
    undeleteTrack(reg, t.file);
    if (t.playlist) addToList(reg, [t.file], t.playlist);
    persist(lib, reg);
    return { ok: true, added: !known, id };
  },

  'track-set-lrc': (a) => {
    const file = arg(a[0], 'file');
    const lrc = arg(a[1], 'lrc');
    const { lib, reg } = loadStore();
    const [t] = resolveTracks(lib, [file]);
    t.lrc = lrc;
    persist(lib, reg);
    return { ok: true };
  },

  'track-set-karaoke': (a) => {
    const file = arg(a[0], 'file');
    const kind = arg(a[1], 'kind');
    const p = arg(a[2], 'path');
    if (kind !== 'audio' && kind !== 'video') die('kind must be audio or video');
    const { lib, reg } = loadStore();
    const [t] = resolveTracks(lib, [file]);
    if (kind === 'audio') t.karaoke_audio = p;
    else t.karaoke_video = p;
    persist(lib, reg);
    return { ok: true };
  },

  // The per-device push ledger (VLC/WebDAV legacy path). Union, idempotent.
  'tracks-mark-synced': (a) => {
    const target = arg(a[0], 'target');
    const files = jsonArg(a[1], 'files');
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    for (const t of tracks) t.synced_to = [...new Set([...(t.synced_to || []), target])];
    persist(lib, reg);
    return { ok: true, marked: tracks.length };
  },

  // Folder ⇄ index reconcile (was library.js reconcileLibrary): the folder is
  // ground truth for which files exist — adopt Finder drops, retire rows whose
  // file vanished, pick up .lrc sidecars that appeared.
  reconcile: () => {
    const { lib, reg } = loadStore();
    const cfg = readJson(path.join(DJ_DIR, 'config.json'), {});
    let dir = cfg.library_dir || '~/Music/DJ';
    if (dir.startsWith('~')) dir = path.join(HOME, dir.slice(1));

    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, mtime: fs.statSync(path.join(dir, e.name)).mtimeMs / 1000 }));
    } catch {
      return { ok: true, adopted: 0, retired: 0 };
    }
    // Unreadable/empty folder → never mass-retire a whole library.
    if (!entries.length) return { ok: true, adopted: 0, retired: 0 };

    const AUDIO = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'aac'];
    const ext = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
    const stemOf = (n) => n.slice(0, n.lastIndexOf('.'));
    const byNorm = new Map(entries.map((e) => [norm(e.name), e.name]));
    const sidecar = (stem) => {
      const hit = byNorm.get(norm(`${stem}.lrc`));
      return hit ? path.join(dir, hit) : null;
    };

    const known = new Set(lib.tracks.filter((t) => t.file).map((t) => norm(t.file)));
    let adopted = 0;
    for (const e of entries) {
      if (!AUDIO.includes(ext(e.name)) || known.has(norm(e.name))) continue;
      const stem = stemOf(e.name);
      const dash = stem.indexOf(' - ');
      const artist = dash > 0 ? stem.slice(0, dash) : '';
      const title = dash > 0 ? stem.slice(dash + 3) : stem;
      const row = {
        id: idOf({ artist, title }),
        artist,
        title,
        file: path.join(dir, e.name),
        added_at: new Date(e.mtime * 1000).toISOString(),
        playlists: [],
        synced_to: [],
      };
      const lrc = sidecar(stem);
      if (lrc) row.lrc = lrc;
      lib.tracks.push(row);
      adopted += 1;
    }

    const before = lib.tracks.length;
    lib.tracks = lib.tracks.filter((t) => !t.file || byNorm.has(norm(t.file)));
    const retired = before - lib.tracks.length;

    for (const t of lib.tracks) {
      if (!t.file) continue;
      if (t.lrc && !byNorm.has(norm(t.lrc))) delete t.lrc;
      if (!t.lrc) {
        const lrc = sidecar(stemOf(String(t.file).split('/').pop()));
        if (lrc) t.lrc = lrc;
      }
    }

    if (adopted || retired) {
      // A file that reappeared under a deleted name is a NEW song — the
      // tombstone must lose, or the projection deletes it straight back.
      for (const t of lib.tracks) if (t.file) undeleteTrack(reg, t.file);
      persist(lib, reg);
    }
    return { ok: true, adopted, retired };
  },
};

// ── main ─────────────────────────────────────────────────────────────────────

const [verb, ...rest] = process.argv.slice(2);
const run = VERBS[verb];
if (!run) die(`unknown verb “${verb || ''}” — one of: ${Object.keys(VERBS).join(', ')}`);

lock();
try {
  console.log(JSON.stringify(run(rest)));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  console.error(String(e?.message || e));
  process.exitCode = 1;
} finally {
  unlock();
}
