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
import { Buffer } from 'node:buffer';
import {
  Register, project, seedFromTracks, isDeleted,
  createList, deleteList, renameList, addToList, removeFromList, setOrder,
  deleteTrack, undeleteTrack, listsOf, filesInList, reconcileDeleted,
  MAC, PHONE, addToPhone, removeFromPhone, pruneMissing, phoneView, base,
} from './lww.js';

const HOME = process.env.HOME || '';
const DJ_DIR = process.env.DJ_DIR || path.join(HOME, '.linggen', 'skills', 'dj');
const DATA = path.join(DJ_DIR, 'data');
const LIB = path.join(DJ_DIR, 'library.json');
const REG = path.join(DATA, 'playlist-edits.json');
const OP_IDS = path.join(DATA, 'op-ids.json');

// Thrown, never process.exit(): an exit inside a verb would skip the finally
// that releases the lock, and a routine agent error (a stale filename) would
// stall every later caller for the lock-steal deadline.
const die = (error) => {
  throw new Error(error);
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
  const seeded = lib ? seedFromTracks(reg, lib) : 0;
  // A delete now takes the song's playlist membership with it, but deletes
  // written before that rule — and any arriving from a phone still on the old
  // one — left theirs standing, which is what had playlists naming songs that
  // no longer exist. Idempotent, so this costs a scan and nothing else once
  // the register is clean.
  const repaired = reconcileDeleted(reg);
  if (seeded > 0 || repaired > 0) persist(lib, reg);
  return { lib, reg };
}

// Mirror of the page's old _persist: project the register through the library,
// unlink what it says is gone, write both files. Sidecars ride along with a
// tombstoned row here — whatever wrote the tombstone (this process, or a
// paired phone whose merge landed a del: cell) — because after the projection
// drops the row nothing can ever name them again.
function persist(lib, reg) {
  for (const t of lib.tracks) {
    if (!t.file || !isDeleted(reg, t.file)) continue;
    for (const f of [t.lrc, t.karaoke_audio, t.karaoke_video]) {
      if (f) { try { fs.rmSync(f, { force: true }); } catch { /* already gone */ } }
    }
  }
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

const requireList = (reg, name, view = MAC) => {
  if (!listsOf(reg, view).includes(name)) die(`no playlist named “${name}” — ListLibrary shows the current ones`);
};

/// Which set of playlists a verb is talking about. Every playlist verb takes
/// one instead of existing twice — the phone view's lists are the same
/// operations over their own keys.
const viewArg = (v) => (String(v || '').trim() === 'phone' ? PHONE : MAC);

/// resolveTracks' lenient twin: the names that are still songs here, and the
/// ones that aren't. A phone batch may have been queued while this Mac deleted
/// something, so a name it can't place is news to report — never a reason to
/// throw the rest of the batch away.
function resolveSome(lib, wanted) {
  const byBase = new Map(
    lib.tracks.filter((t) => t.file).map((t) => [norm(t.file), t.file]),
  );
  const hits = [];
  const missing = [];
  for (const w of wanted) {
    const f = byBase.get(norm(w));
    if (f) hits.push(f);
    else missing.push(w);
  }
  return { hits, missing };
}

// ── the phone's op log ───────────────────────────────────────────────────────
// A phone edits its view while this Mac is asleep, so its edits arrive as
// INTENTS — one jsonl line each — rather than as a state to merge. This is the
// single applier: every op lands here, under the same lock every other verb
// takes, and the whole resulting view goes back down. Nothing about a phone's
// curation is inferred from a file image, which is why the phone needs neither
// cells nor tombstones to hold an edit overnight.
//
// An op that can't be carried out — its playlist or its song deleted here in
// the meantime — is SKIPPED and named, never guessed at. It is still spent:
// the phone clears it on the acknowledgement, so a stale intent can't queue
// forever.

const opName = (o) => {
  const s = String(o.name ?? '').trim();
  if (!s) die('op has no playlist name');
  return s;
};

const opFiles = (o) => [
  ...new Set((Array.isArray(o.files) ? o.files : []).map((f) => base(String(f ?? ''))).filter(Boolean)),
];

const listMissing = (name) => ({ skipped: `“${name}” is no longer a playlist on your Mac` });

/// One vocabulary, and deliberately a small one: it names the phone view only,
/// has no Mac-view verb and no file-destroying verb. A phone structurally
/// cannot reach this Mac's own playlists or its music.
const PHONE_OPS = {
  'playlist-create': (lib, reg, o) => {
    createList(reg, opName(o), PHONE);
    return {};
  },

  'playlist-rename': (lib, reg, o) => {
    const from = opName(o);
    const to = String(o.to ?? '').trim();
    if (!to) die('rename has no new name');
    if (from === to) return {};
    if (!listsOf(reg, PHONE).includes(from)) return listMissing(from);
    renameList(reg, from, to, filesInList(reg, from, PHONE), PHONE);
    return {};
  },

  // Deleting a list that is already gone is the intent satisfied, not a stale
  // op: the phone asked for it to not exist, and it doesn't.
  'playlist-delete': (lib, reg, o) => {
    const name = opName(o);
    deleteList(reg, name, filesInList(reg, name, PHONE), PHONE);
    return {};
  },

  // Filing into a phone list implies carrying the song, exactly as the page's
  // own verb does — a list here may never name something the phone hasn't got.
  //
  // The order is written through as well, so a song lands where the user
  // dropped it rather than alphabetically. Without it the phone's own copy —
  // which appends, because that is what a person watching it expects — would
  // disagree with this one until the next sync shuffled the list under them.
  'playlist-add': (lib, reg, o) => {
    const name = opName(o);
    const files = opFiles(o);
    const { hits, missing } = resolveSome(lib, files);
    if (files.length && !hits.length) return { skipped: goneHere(missing) };
    const before = filesInList(reg, name, PHONE);
    addToPhone(reg, hits);
    addToList(reg, hits, name, PHONE);
    const added = hits.map(base).filter((f) => !before.includes(f));
    if (added.length) setOrder(reg, name, [...before, ...added], PHONE);
    return missing.length ? { missing } : {};
  },

  // Removals take the names as given: a membership cell is keyed by basename,
  // so clearing one never needs the library to still have the song.
  'playlist-remove': (lib, reg, o) => {
    const name = opName(o);
    if (!listsOf(reg, PHONE).includes(name)) return listMissing(name);
    removeFromList(reg, opFiles(o), name, PHONE);
    return {};
  },

  'playlist-reorder': (lib, reg, o) => {
    const name = opName(o);
    if (!listsOf(reg, PHONE).includes(name)) return listMissing(name);
    setOrder(reg, name, opFiles(o), PHONE);
    return {};
  },

  'ref-add': (lib, reg, o) => {
    const files = opFiles(o);
    const { hits, missing } = resolveSome(lib, files);
    if (files.length && !hits.length) return { skipped: goneHere(missing) };
    addToPhone(reg, hits);
    return missing.length ? { missing } : {};
  },

  // The strongest thing a phone can ask for: it stops carrying the song. The
  // file stays exactly where it is.
  'ref-remove': (lib, reg, o) => {
    removeFromPhone(reg, opFiles(o));
    return {};
  },
};

const goneHere = (names) => `${names.join(', ')} — no longer on your Mac`;

/// The applied-op ring: a re-send after a lost acknowledgement must be a
/// no-op. Bounded, because an id is only useful until the phone has heard back
/// and it never sends that op again.
const RING = 1000;

const readRing = () => {
  const ids = readJson(OP_IDS, { ids: [] }).ids;
  return Array.isArray(ids) ? ids.map(String) : [];
};

/// The batch, as the phone base64'd it. Ops are pure register mutations, so a
/// malformed one is skipped rather than thrown: it can never succeed on a
/// later attempt either, and failing the batch would strand the good ops
/// behind it.
function decodeOps(b64) {
  let text;
  try {
    text = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return die('ops is not base64');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return die(`ops is not valid JSON: ${text.slice(0, 80)}`);
  }
  if (!Array.isArray(parsed)) die('ops must be a JSON array');
  return parsed;
}

function tryOp(run, lib, reg, o) {
  try {
    return run(lib, reg, o);
  } catch (e) {
    return { skipped: String(e?.message || e) };
  }
}

// ── telling the phone ────────────────────────────────────────────────────────
// The engine's watcher announces the MUSIC FOLDER. Everything the phone view
// is made of — which songs it references, its own playlists — lives in CELLS,
// which no file touch reflects. So a phone view edited here reached the phone
// only when someone pressed the page's ⇅ Sync, and an edit made by the agent
// reached it never. Mark it where the cells are written and announce once at
// the end: whoever asked, page button or tool call, the phone hears the same
// thing.

let phoneChanged = false;
const markPhone = () => { phoneChanged = true; };

/// Announce that what the phone should carry has moved. This TELLS, it does
/// not deliver: a connected phone auto-syncs on this topic, one that is asleep
/// or away picks it up on its next sync, and neither outcome may fail the
/// write that already succeeded.
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
  } catch {
    // No daemon, no phone, no network — all the same here. The phone syncs on
    // its next open either way; a missed announcement is a delay, not a loss.
  }
}

// ── verbs ────────────────────────────────────────────────────────────────────

const VERBS = {
  'playlist-create': (a) => {
    const name = arg(a[0], 'name');
    const view = viewArg(a[1]);
    if (view === PHONE) markPhone();
    const { lib, reg } = loadStore();
    createList(reg, name, view);
    persist(lib, reg);
    return { ok: true, playlist: name };
  },

  'playlist-rename': (a) => {
    const oldName = arg(a[0], 'old_name');
    const newName = arg(a[1], 'new_name');
    if (oldName === newName) return { ok: true, playlist: newName };
    const view = viewArg(a[2]);
    if (view === PHONE) markPhone();
    const { lib, reg } = loadStore();
    requireList(reg, oldName, view);
    const merged = listsOf(reg, view).includes(newName);
    renameList(reg, oldName, newName, filesInList(reg, oldName, view), view);
    persist(lib, reg);
    return { ok: true, playlist: newName, merged };
  },

  'playlist-delete': (a) => {
    const name = arg(a[0], 'name');
    const view = viewArg(a[1]);
    if (view === PHONE) markPhone();
    const { lib, reg } = loadStore();
    requireList(reg, name, view);
    const kept = filesInList(reg, name, view).length;
    deleteList(reg, name, filesInList(reg, name, view), view);
    persist(lib, reg);
    return { ok: true, deleted: name, songs_kept: kept };
  },

  'playlist-add': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const view = viewArg(a[2]);
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    // Filing into a phone list implies carrying the song: a list here may
    // never name something the phone hasn't got, which is the whole reason it
    // never has to say "9 of 11".
    if (view === PHONE) { markPhone(); addToPhone(reg, tracks.map((t) => t.file)); }
    addToList(reg, tracks.map((t) => t.file), name, view);
    persist(lib, reg);
    return { ok: true, playlist: name, added: tracks.length };
  },

  'playlist-remove': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const view = viewArg(a[2]);
    if (view === PHONE) markPhone();
    const { lib, reg } = loadStore();
    requireList(reg, name, view);
    const tracks = resolveTracks(lib, files);
    removeFromList(reg, tracks.map((t) => t.file), name, view);
    persist(lib, reg);
    return { ok: true, playlist: name, removed: tracks.length };
  },

  'playlist-reorder': (a) => {
    const name = arg(a[0], 'name');
    const files = jsonArg(a[1], 'files');
    const view = viewArg(a[2]);
    if (view === PHONE) markPhone();
    const { lib, reg } = loadStore();
    requireList(reg, name, view);
    const tracks = resolveTracks(lib, files);
    setOrder(reg, name, tracks.map((t) => t.file), view);
    persist(lib, reg);
    return { ok: true, playlist: name, order: tracks.map((t) => norm(t.file)) };
  },

  // ── the phone view ────────────────────────────────────────────────────────
  // What a phone carries. Adding is a reference, not a copy; removing takes the
  // reference back and never the file. Destruction is `tracks-delete` and lives
  // in the Mac's view alone.

  'phone-add': (a) => {
    const files = jsonArg(a[0], 'files');
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    addToPhone(reg, tracks.map((t) => t.file));
    markPhone();
    persist(lib, reg);
    return { ok: true, added: tracks.length };
  },

  'phone-remove': (a) => {
    const files = jsonArg(a[0], 'files');
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    removeFromPhone(reg, tracks.map((t) => t.file));
    markPhone();
    persist(lib, reg);
    return { ok: true, removed: tracks.length, files_kept: tracks.length };
  },

  // A phone's queued edits, drained in one round trip. Takes base64 of a JSON
  // array so a title in any script survives the shell that carries it, and
  // gives back per-op results plus the whole resulting view — the phone
  // replaces its copy with that and clears exactly the ops named here.
  //
  // An empty batch is the read: a phone with nothing to say still gets the
  // current view, which is the only way it learns of an edit made here.
  'phone-ops': (a) => {
    const batch = decodeOps(arg(a[0], 'ops'));
    const { lib, reg } = loadStore();
    const ring = readRing();
    const seen = new Set(ring);
    const results = [];
    const skipped = [];
    let applied = 0;

    for (const o of batch) {
      const id = String(o?.id ?? '').trim();
      // Unaddressable: we could apply it, but never acknowledge it, so the
      // phone would send it again forever.
      if (!id) continue;
      if (seen.has(id)) {
        results.push({ id, ok: true, duplicate: true });
        continue;
      }
      const run = PHONE_OPS[String(o?.op ?? '')];
      const outcome = run
        ? tryOp(run, lib, reg, o)
        : { skipped: `unknown op “${o?.op ?? ''}”` };
      seen.add(id);
      ring.push(id);
      if (outcome.skipped) {
        results.push({ id, ok: false, skipped: outcome.skipped });
        skipped.push({ id, op: o.op, reason: outcome.skipped });
      } else {
        results.push({ id, ok: true, ...outcome });
        applied += 1;
      }
    }

    // Persist BEFORE the ring: a write that dies takes the acknowledgement
    // with it, so the phone re-sends and the ops apply once, not never.
    if (applied > 0) {
      markPhone();
      persist(lib, reg);
    }
    if (batch.length) writeJson(OP_IDS, { ids: ring.slice(-RING) });

    return { ok: true, applied, results, skipped, view: phoneView(reg) };
  },

  // The song leaves the library: its cell (what a paired phone merges), and —
  // via persist()'s projection — the audio file and every sidecar.
  // Reproducible by design, so a plain delete rather than a Trash trip.
  'tracks-delete': (a) => {
    const files = jsonArg(a[0], 'files');
    const { lib, reg } = loadStore();
    const tracks = resolveTracks(lib, files);
    for (const t of tracks) deleteTrack(reg, t.file);
    // A Mac delete cascades over there too, so the phone needs telling even
    // though nobody touched its view by name.
    markPhone();
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
    const adoptedFiles = [];
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
      adoptedFiles.push(row.file);
      adopted += 1;
    }

    const before = lib.tracks.length;
    lib.tracks = lib.tracks.filter((t) => !t.file || byNorm.has(norm(t.file)));
    const retired = before - lib.tracks.length;
    // The folder is ground truth for which songs exist, so it is also ground
    // truth for which songs a list may name and a phone may reference. Retiring
    // used to drop the row and stop there, leaving playlists pointing at
    // nothing — the reason a phone could report "9 of 11 here" for a list
    // already holding all 9 it would ever hold. Cells only: no phone loses a
    // file over this.
    const pruned = pruneMissing(reg, (f) => byNorm.has(norm(f)));

    let lrcChanged = 0;
    for (const t of lib.tracks) {
      if (!t.file) continue;
      if (t.lrc && !byNorm.has(norm(t.lrc))) { delete t.lrc; lrcChanged += 1; }
      if (!t.lrc) {
        const lrc = sidecar(stemOf(String(t.file).split('/').pop()));
        if (lrc) { t.lrc = lrc; lrcChanged += 1; }
      }
    }

    // Persist on ANY drift — an .lrc that appeared beside an unchanged audio
    // file is a real change too, not something to recompute-and-discard on
    // every pass until an unrelated adopt happens to save it.
    if (adopted || retired || lrcChanged || pruned) {
      // A file that reappeared under a deleted name is a NEW song — the
      // tombstone must lose, or the projection deletes it straight back.
      // Only for files adopted THIS pass: clearing every track's tombstone
      // would also undo a phone's delete that had just merged in.
      for (const f of adoptedFiles) undeleteTrack(reg, f);
      persist(lib, reg);
    }
    return { ok: true, adopted, retired, pruned };
  },
};

// ── main ─────────────────────────────────────────────────────────────────────

const [verb, ...rest] = process.argv.slice(2);
try {
  const run = VERBS[verb];
  if (!run) die(`unknown verb “${verb || ''}” — one of: ${Object.keys(VERBS).join(', ')}`);
  lock();
  let result;
  try {
    result = run(rest);
  } finally {
    unlock();
  }
  // Outside the lock: telling the phone is a network call, and no other writer
  // should wait behind it. After the write, too — the phone is being told about
  // something that has already happened.
  if (phoneChanged) await announcePhone();
  console.log(JSON.stringify(result));
} catch (e) {
  const msg = String(e?.message || e);
  console.log(JSON.stringify({ ok: false, error: msg }));
  console.error(msg); // /api/bash callers surface stderr on a non-zero exit
  process.exitCode = 1;
}
