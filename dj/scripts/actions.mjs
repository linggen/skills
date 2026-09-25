// actions.mjs — the ONE writer for the DJ library and its download queue.
// Every mutation, whoever asks for it, runs through here: the agent's SKILL.md
// tools call it via run-js.sh, the page's buttons call the same verbs over
// /api/bash, a phone's queued edits arrive as `phone-ops`, and the download
// worker (fetch.py) claims and finishes queue items here. The page renders;
// this file writes.
//
//   io.mjs         paths, JSON, the lock, backups
//   store.js       library.json as plain data: the two views, the cascade
//   phone-ops.mjs  a phone's op log
//   reconcile.mjs  the folder as ground truth
//   queue.mjs      data/queue.json
//
// Runs under bun or node (run-js.sh picks). Usage: actions.mjs <verb> [args…];
// every verb prints one JSON line.

import fs from 'node:fs';
import path from 'node:path';

import {
  project, normalize, base, norm, idOf, resolveTracks,
  createList, deleteList, renameList, addToList, removeFromList, setOrder,
  deleteTrack, listsOf, filesInList, renameFile,
  MAC, PHONE, addToPhone, removeFromPhone, phoneView,
} from './store.js';
import { die, readJson, writeJson, lock, unlock, backupLibrary, LIB, DJ_DIR } from './io.mjs';
import { decodeOps, applyPhoneOps, saveRing } from './phone-ops.mjs';
import { reconcile } from './reconcile.mjs';
import { downloadRefusal, restricted } from './reach.mjs';
import {
  loadQueue, saveQueue, counts, trackItem, enqueue, claim, finish, cancel, retry,
  clearFinished, resetRunning,
} from './queue.mjs';

// The engine substitutes {{arg}} literally when the model omits an arg — a
// placeholder-shaped value is a missing one, never data.
const arg = (v, name) => {
  const s = String(v ?? '').trim();
  if (!s || /^\{\{.*\}\}$/.test(s)) die(`missing ${name}`);
  return s;
};

const jsonOf = (v, name) => {
  const s = arg(v, name);
  try {
    return JSON.parse(s);
  } catch {
    return die(`${name} is not valid JSON: ${s.slice(0, 80)}`);
  }
};

const jsonArg = (v, name) => {
  const parsed = jsonOf(v, name);
  if (!Array.isArray(parsed) || !parsed.length) die(`${name} must be a non-empty JSON array`);
  return parsed;
};

const idsArg = (v) => (String(v ?? '').trim() === 'all' ? 'all' : jsonArg(v, 'ids').map(String));

// ── the store ────────────────────────────────────────────────────────────────

const loadStore = () => normalize(readJson(LIB, {}));

/// Rewrite the derived fields and save — after keeping an hourly copy of what
/// is about to be replaced.
function persist(lib) {
  backupLibrary();
  writeJson(LIB, project(lib));
}

/// Resolve names the agent or the page gave, or say which ones are not songs.
function tracksNamed(lib, wanted) {
  const { hits, missing } = resolveTracks(lib, wanted);
  if (missing.length) die(`not in the library: ${missing.join(', ')} — use the file names ListLibrary returns`);
  return hits;
}

const requireList = (lib, name, view = MAC) => {
  if (!listsOf(lib, view).includes(name)) die(`no playlist named “${name}” — ListLibrary shows the current ones`);
};

/// Which set of playlists a verb is talking about. Every playlist verb takes
/// one instead of existing twice.
const viewArg = (v) => (String(v || '').trim() === 'phone' ? PHONE : MAC);

/// A song's own files. Deleting is the only destruction in the product, and it
/// takes the sidecars with it: once the row is gone nothing can name them.
function unlinkTrack(row) {
  for (const f of [row.file, row.lrc, row.karaoke_audio, row.karaoke_video]) {
    if (f) { try { fs.rmSync(f, { force: true }); } catch { /* already gone */ } }
  }
}

/// Lyrics on a row. Words with no timings still count as lyrics, and are
/// stamped as searched so nobody asks LRCLIB about them again for a month.
function setLrc(row, lrc, timed = true) {
  row.lrc = lrc;
  if (timed) delete row.lrc_missing;
  else row.lrc_missing = new Date().toISOString();
}

/// A landed file becomes a library row, or fills the gaps of the row it
/// belongs to. A deleted name that comes back is a new song: the row left with
/// the delete, so there is nothing for it to inherit.
function addTrack(lib, t) {
  const id = t.id || idOf(t);
  let row = lib.tracks.find((x) => x.id === id) || lib.tracks.find((x) => x.file && norm(x.file) === norm(t.file));
  const known = !!row;
  if (!row) {
    row = { id, artist: t.artist || '', title: t.title, year: t.year || undefined, file: t.file, added_at: new Date().toISOString(), playlists: [] };
    lib.tracks.push(row);
  }
  if (row.file !== t.file) row.file = t.file;
  if (t.year && !row.year) row.year = t.year;
  if (t.lrc) setLrc(row, t.lrc, t.lrc_timed !== false);
  if (t.source_id) row.source_id = String(t.source_id);
  // Named by the catalogue, asked for by another title: both stay findable.
  if (t.requested_title && t.requested_title !== row.title) row.requested_title = String(t.requested_title);
  if (t.playlist) addToList(lib, [t.file], t.playlist);
  return { row, added: !known };
}

/// A cached cover belongs to the take it was cut from.
function dropThumbs(file) {
  const stem = base(file).replace(/\.[^.]+$/, '');
  for (const suffix of ['', '-bg']) {
    fs.rmSync(path.join(DJ_DIR, 'scripts', '.thumbs', `${stem}${suffix}.jpg`), { force: true });
  }
}

/// The same song, from a different upload: the file was replaced in place, so
/// only the row's record of where it came from — and its lyrics — change.
function replacedTake(lib, item, r) {
  const [row] = resolveTracks(lib, [item.dest]).hits;
  if (!row) return;
  const tried = [...(row.sources_tried || []), row.source_id].filter(Boolean);
  row.sources_tried = [...new Set(tried)];
  if (r.source_id) row.source_id = String(r.source_id);
  if (r.lrc) setLrc(row, r.lrc, r.lrc_timed !== false);
  dropThumbs(row.file);
}

/// What a song is called on disk — naming.py's track_stem, which every
/// download door uses, so a renamed song is named the way a fetched one is.
function songStem(artist, title) {
  const safe = (v) => String(v ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  const cfg = readJson(path.join(DJ_DIR, 'config.json'), {}) || {};
  const tpl = cfg.naming_template || '%(artist)s - %(title)s';
  const stem = tpl.replace('%(artist)s', safe(artist)).replace('%(title)s', safe(title)).replace('%(year)s', '').trim();
  return stem || `${safe(artist)} - ${safe(title)}`;
}

/// Move one of a song's files to its new stem, keeping the folder and the
/// part after the stem (".lrc", " (Karaoke).mp4").
function moveTo(file, oldStem, newStem) {
  if (!file) return file;
  const dir = path.dirname(file);
  const name = base(file);
  if (!name.startsWith(oldStem)) return file;
  const next = path.join(dir, newStem + name.slice(oldStem.length));
  if (next === file) return file;
  if (fs.existsSync(next) && norm(next) !== norm(file)) die(`${base(next)} already exists`);
  fs.renameSync(file, next);
  return next;
}

// ── telling the phone ────────────────────────────────────────────────────────
// The engine's watcher announces the MUSIC FOLDER; the phone view lives in
// library.json, which no file touch reflects. Mark it where the view is
// written and announce once at the end, whoever asked.

let phoneChanged = false;
const markPhone = () => { phoneChanged = true; };

/// This TELLS, it does not deliver: a connected phone syncs on it, one that is
/// away picks it up next time, and neither may fail the write that happened.
async function announcePhone() {
  if (typeof fetch !== 'function') return;
  const port = process.env.LINGGEN_PORT || '9527';
  try {
    await fetch(`http://127.0.0.1:${port}/api/topic/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'dj', op: 'library-changed', payload: {}, retain: false }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* a missed announcement is a delay, not a loss */ }
}

// ── verbs ────────────────────────────────────────────────────────────────────

/// A verb that edits one view's playlists: load, act, save, ring the phone
/// when the view is the phone's.
function listVerb(view, act) {
  if (view === PHONE) markPhone();
  const lib = loadStore();
  const reply = act(lib);
  persist(lib);
  return { ok: true, ...reply };
}

const VERBS = {
  'playlist-create': (a) => {
    const name = arg(a[0], 'name');
    const view = viewArg(a[1]);
    return listVerb(view, (lib) => {
      createList(lib, name, view);
      return { playlist: name };
    });
  },

  'playlist-rename': (a) => {
    const oldName = arg(a[0], 'old_name');
    const newName = arg(a[1], 'new_name');
    if (oldName === newName) return { ok: true, playlist: newName };
    const view = viewArg(a[2]);
    return listVerb(view, (lib) => {
      requireList(lib, oldName, view);
      const merged = listsOf(lib, view).includes(newName);
      renameList(lib, oldName, newName, view);
      return { playlist: newName, merged };
    });
  },

  'playlist-delete': (a) => {
    const name = arg(a[0], 'name');
    const view = viewArg(a[1]);
    return listVerb(view, (lib) => {
      requireList(lib, name, view);
      const kept = filesInList(lib, name, view).length;
      deleteList(lib, name, view);
      return { deleted: name, songs_kept: kept };
    });
  },

  // Filing into a phone list implies carrying the song: a list there may never
  // name something the phone hasn't got.
  'playlist-add': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const view = viewArg(a[2]);
    return listVerb(view, (lib) => {
      const tracks = tracksNamed(lib, files).map((t) => t.file);
      if (view === PHONE) addToPhone(lib, tracks);
      addToList(lib, tracks, name, view);
      return { playlist: name, added: tracks.length };
    });
  },

  'playlist-remove': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const view = viewArg(a[2]);
    return listVerb(view, (lib) => {
      requireList(lib, name, view);
      const tracks = tracksNamed(lib, files);
      removeFromList(lib, tracks.map((t) => t.file), name, view);
      return { playlist: name, removed: tracks.length };
    });
  },

  'playlist-reorder': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const view = viewArg(a[2]);
    return listVerb(view, (lib) => {
      requireList(lib, name, view);
      const tracks = tracksNamed(lib, files);
      setOrder(lib, name, tracks.map((t) => t.file), view);
      return { playlist: name, order: tracks.map((t) => norm(t.file)) };
    });
  },

  // What a phone carries: a reference, never a copy.
  'phone-add': (a) => {
    const files = jsonArg(a[0], 'files');
    return listVerb(PHONE, (lib) => {
      const tracks = tracksNamed(lib, files);
      addToPhone(lib, tracks.map((t) => t.file));
      return { added: tracks.length };
    });
  },

  'phone-remove': (a) => {
    const files = jsonArg(a[0], 'files');
    return listVerb(PHONE, (lib) => {
      const tracks = tracksNamed(lib, files);
      removeFromPhone(lib, tracks.map((t) => t.file));
      return { removed: tracks.length, files_kept: tracks.length };
    });
  },

  // A phone's queued edits, drained in one round trip: base64 of a JSON array
  // in, per-op results plus the whole resulting view out. An empty batch is
  // the read. Persist BEFORE the ring: a write that dies takes the
  // acknowledgement with it, so the phone re-sends and the ops apply once.
  'phone-ops': (a) => {
    const batch = decodeOps(arg(a[0], 'ops'));
    const lib = loadStore();
    const r = applyPhoneOps(lib, batch);
    if (r.dirty) persist(lib);
    if (r.rings) markPhone();
    if (batch.length) saveRing(r.ring);
    return { ok: true, applied: r.applied, results: r.results, skipped: r.skipped, view: phoneView(lib) };
  },

  // The song leaves the library: the row, both views, and the audio file with
  // every sidecar. The store is written FIRST — a delete that dies half way
  // leaves files the next reconcile adopts back, never rows naming nothing.
  'tracks-delete': (a) => {
    const files = jsonArg(a[0], 'files');
    const lib = loadStore();
    const rows = tracksNamed(lib, files).map((t) => deleteTrack(lib, t.file)).filter(Boolean);
    markPhone(); // the cascade reaches the phone view too
    persist(lib);
    rows.forEach(unlinkTrack);
    return { ok: true, deleted: rows.length, files: rows.map((t) => norm(t.file)) };
  },

  // A song gets its real name: the row keeps its plays, lists and phone place
  // (renameFile carries both views), and the file moves with every sidecar.
  // Args: file, title [, artist].
  'track-rename': (a) => {
    const file = arg(a[0], 'file');
    const title = arg(a[1], 'title');
    const lib = loadStore();
    const [row] = tracksNamed(lib, [file]);
    const artist = String(a[2] ?? '').trim() && !/^\{\{.*\}\}$/.test(String(a[2]).trim()) ? String(a[2]).trim() : row.artist;
    const oldStem = base(row.file).replace(/\.[^.]+$/, '');
    const newStem = songStem(artist, title);
    const was = { file: row.file, title: row.title };
    const clash = lib.tracks.find((t) => t !== row && t.id === idOf({ artist, title }));
    if (clash) die(`the library already holds ${base(clash.file)} under that name`);
    if (newStem !== oldStem) {
      const target = path.join(path.dirname(row.file), newStem + path.extname(row.file));
      if (fs.existsSync(target) && norm(target) !== norm(row.file)) die(`${base(target)} already exists`);
      const newFile = moveTo(row.file, oldStem, newStem);
      row.lrc = moveTo(row.lrc, oldStem, newStem) || row.lrc;
      if (row.karaoke_audio) row.karaoke_audio = moveTo(row.karaoke_audio, oldStem, newStem);
      if (row.karaoke_video) row.karaoke_video = moveTo(row.karaoke_video, oldStem, newStem);
      renameFile(lib, row.file, newFile);
      dropThumbs(row.file);
      row.file = newFile;
      markPhone();
    }
    row.title = title;
    row.artist = artist;
    row.id = idOf({ artist, title });
    if (was.title !== title) row.requested_title = was.title;
    persist(lib);
    return { ok: true, file: base(row.file), path: row.file, was: base(was.file), title, artist, lrc: row.lrc ? base(row.lrc) : null };
  },

  'track-add': (a) => {
    const t = jsonOf(a[0], 'track');
    if (!t.file || !t.title) die('track needs at least { title, file }');
    const lib = loadStore();
    const { row, added } = addTrack(lib, t);
    persist(lib);
    return { ok: true, added, id: row.id };
  },

  // [timed|untimed] — words with no timings are kept, and stamped.
  'track-set-lrc': (a) => {
    const file = arg(a[0], 'file');
    const lrc = arg(a[1], 'lrc');
    const lib = loadStore();
    const [t] = tracksNamed(lib, [file]);
    setLrc(t, lrc, String(a[2] || '').trim() !== 'untimed');
    persist(lib);
    return { ok: true };
  },

  // Searched, and the words were nowhere: the backfill leaves it a month.
  'track-no-lyrics': (a) => {
    const file = arg(a[0], 'file');
    const lib = loadStore();
    const [t] = tracksNamed(lib, [file]);
    t.lrc_missing = new Date().toISOString();
    persist(lib);
    return { ok: true };
  },

  'track-set-karaoke': (a) => {
    const file = arg(a[0], 'file');
    const kind = arg(a[1], 'kind');
    const p = arg(a[2], 'path');
    if (kind !== 'audio' && kind !== 'video') die('kind must be audio or video');
    const lib = loadStore();
    const [t] = tracksNamed(lib, [file]);
    t[kind === 'audio' ? 'karaoke_audio' : 'karaoke_video'] = p;
    persist(lib);
    return { ok: true };
  },

  reconcile: () => {
    const lib = loadStore();
    const { changed, ...counts } = reconcile(lib);
    if (changed) persist(lib);
    if (counts.renamed) markPhone();
    return { ok: true, ...counts };
  },

  // ── the download queue ────────────────────────────────────────────────────

  'queue-add': (a) => {
    const items = jsonArg(a[0], 'tracks').filter((t) => t && typeof t === 'object').map(trackItem);
    const q = loadQueue();
    const ids = enqueue(q, items);
    saveQueue(q);
    return { ok: true, added: ids.length, ids, ...counts(q) };
  },

  // "Find another source": the same song, from an upload not tried yet,
  // replacing the file under its own name so every list and phone keeps it.
  // A row with no recorded source skips the picker's first choice instead.
  'track-redownload': (a) => {
    const file = arg(a[0], 'file');
    const [t] = tracksNamed(loadStore(), [file]);
    const exclude = [...new Set([...(t.sources_tried || []), t.source_id].filter(Boolean))];
    const q = loadQueue();
    const ids = enqueue(q, [{
      kind: 'redownload', artist: t.artist || '', title: t.title, year: t.year, version: t.version,
      dest: t.file, exclude, skip_first: !t.source_id || undefined,
    }]);
    saveQueue(q);
    return { ok: true, added: ids.length, ids };
  },

  'queue-claim': () => {
    const q = loadQueue();
    const item = claim(q);
    if (item) saveQueue(q);
    return { ok: true, item, ...counts(q) };
  },

  // The worker's report on one item. A landed song becomes a row at once —
  // lyrics, source and playlist in the same write.
  'queue-finish': (a) => {
    const id = arg(a[0], 'id');
    const result = jsonOf(a[1], 'result');
    const q = loadQueue();
    const item = finish(q, id, result);
    if (!item) return { ok: true, item: null };
    if (result.ok) {
      const lib = loadStore();
      if (item.kind === 'redownload') replacedTake(lib, item, result);
      else addTrack(lib, { ...item, id: undefined, ...result });
      if (item.for_phone) { addToPhone(lib, [result.file]); markPhone(); }
      persist(lib);
    }
    saveQueue(q);
    return { ok: true, item };
  },

  'queue-cancel': (a) => {
    const q = loadQueue();
    const n = cancel(q, idsArg(a[0]));
    saveQueue(q);
    return { ok: true, cancelled: n };
  },

  'queue-retry': (a) => {
    const q = loadQueue();
    const n = retry(q, idsArg(a[0]));
    saveQueue(q);
    return { ok: true, retried: n, ...counts(q) };
  },

  'queue-clear': () => {
    const q = loadQueue();
    const n = clearFinished(q);
    saveQueue(q);
    return { ok: true, cleared: n };
  },

  'queue-reset': () => {
    const q = loadQueue();
    resetRunning(q);
    saveQueue(q);
    return { ok: true, ...counts(q) };
  },
};

// ── main ─────────────────────────────────────────────────────────────────────

// Verbs that put a download on the queue — refused, with a fact, where the
// engine reports YouTube unreachable (reach.mjs).
const DOWNLOAD_VERBS = new Set(['queue-add', 'track-redownload', 'queue-retry']);

const [verb, ...rest] = process.argv.slice(2);
try {
  const run = VERBS[verb];
  if (!run) die(`unknown verb “${verb || ''}” — one of: ${Object.keys(VERBS).join(', ')}`);
  const refusal = DOWNLOAD_VERBS.has(verb) ? downloadRefusal(await restricted()) : null;
  if (refusal) {
    console.log(JSON.stringify(refusal));
    process.exit(0);
  }
  lock();
  let result;
  try {
    result = run(rest);
  } finally {
    unlock();
  }
  // Outside the lock, after the write: the phone is told about something that
  // has already happened, and no other writer waits behind a network call.
  if (phoneChanged) await announcePhone();
  console.log(JSON.stringify(result));
} catch (e) {
  const msg = String(e?.message || e);
  console.log(JSON.stringify({ ok: false, error: msg }));
  console.error(msg); // /api/bash callers surface stderr on a non-zero exit
  process.exitCode = 1;
}
