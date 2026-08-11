// store.js — library.json IS the store. One writer, plain data.
//
// This replaces the LWW cell register (`data/playlist-edits.json`). That
// register existed for a merge: the phone edited the same playlists while it
// was away, so every fact needed its own timestamp to be reconciled per key
// instead of one side's file winning wholesale. The op-log lane deleted that
// merge — **ops go up, state comes down**, and this Mac is the single applier —
// and with it the last reason for cells, timestamps, device ids and tombstones.
// What was left was two files carrying one set of facts, the register as the
// source and library.json as a projection of it written on every save.
//
// So the projection became the store. Nothing downstream changed shape: the
// page, the ListLibrary tool, the agent and the phone all read exactly what
// they read before.
//
//   playlists[]      {name, files[]}   the Mac's own curation, in order
//   phone.files[]    the songs a phone carries — references, never copies
//   phone.playlists[]                  the phone view's own curation
//   tracks[]         the songs themselves
//
// The two views are separate namespaces on purpose. The Mac's lists curate the
// whole library for playing here; the phone view's curate what a phone carries.
// They are NOT copies of each other and are never reconciled — the same name in
// both is two lists, which is what makes "9 of 11 here" impossible to say.
//
// A song is named by the BASENAME of its file everywhere in here: it is the one
// thing both devices provably agree on, because the phone got its copy under
// that name.

export const base = (path) => String(path || '').split('/').pop();

/// The two views, as the field they live in. Every operation takes one rather
/// than existing twice — the phone view's lists are the same operations over
/// their own array, and one implementation is the only way they cannot drift.
export const MAC = 'mac';
export const PHONE = 'phone';

const listsIn = (lib, view) => (view === PHONE ? lib.phone.playlists : lib.playlists);
const findList = (lib, name, view) => listsIn(lib, view).find((p) => p.name === name);
const byName = (a, b) => a.name.localeCompare(b.name);

/// Order-preserving dedupe. A playlist is a running order, so the FIRST
/// appearance of a song is its place.
const uniq = (files) => [...new Set(files.map(base).filter(Boolean))];

const asLists = (v) =>
  (Array.isArray(v) ? v : [])
    .filter((p) => p && String(p.name ?? '').trim())
    .map((p) => ({ name: String(p.name).trim(), files: uniq(p.files || []) }));

/// Every read below assumes the four fields exist. A library.json written by an
/// older build — or by hand — may be missing any of them, and a `reconcile` on
/// a fresh install starts from `{tracks:[],playlists:[]}`.
export function normalize(lib) {
  lib.tracks ||= [];
  lib.playlists = asLists(lib.playlists);
  lib.phone ||= {};
  lib.phone.files = uniq(lib.phone.files || []);
  lib.phone.playlists = asLists(lib.phone.playlists);
  return lib;
}

// ── Playlists ───────────────────────────────────────────────────────────────

/// Every playlist name in a view, alphabetical — the order the page and the
/// phone have always shown them in.
export const listsOf = (lib, view = MAC) => listsIn(lib, view).map((p) => p.name).sort((a, b) => a.localeCompare(b));

/// The files in a playlist, in the user's order.
export const filesInList = (lib, name, view = MAC) => (findList(lib, name, view)?.files ?? []).slice();

/// The playlists of one view that a file belongs to.
export function listsForFile(lib, file, view = MAC) {
  const f = base(file);
  return listsIn(lib, view).filter((p) => p.files.includes(f)).map((p) => p.name);
}

/// A playlist exists before anything is in it — you make one, then fill it.
export function createList(lib, name, view = MAC) {
  if (!findList(lib, name, view)) listsIn(lib, view).push({ name, files: [] });
}

/// Deleting a playlist unfiles its songs but never touches the files — a song
/// in no playlist is still a song.
export function deleteList(lib, name, view = MAC) {
  const all = listsIn(lib, view);
  const i = all.findIndex((p) => p.name === name);
  if (i >= 0) all.splice(i, 1);
}

/// Renaming onto a name that already exists MERGES into it — the page has
/// always offered that, and the verb reports it. The songs already there keep
/// their places and the arrivals go on the end.
export function renameList(lib, oldName, newName, view = MAC) {
  const src = findList(lib, oldName, view);
  if (!src) return;
  const dst = findList(lib, newName, view);
  if (!dst) {
    src.name = newName;
    return;
  }
  for (const f of src.files) if (!dst.files.includes(f)) dst.files.push(f);
  deleteList(lib, oldName, view);
}

/// Appends, because that is what a person watching a list expects — a song
/// lands where it was dropped rather than in the alphabet.
export function addToList(lib, files, name, view = MAC) {
  createList(lib, name, view);
  const p = findList(lib, name, view);
  for (const f of uniq(files)) if (!p.files.includes(f)) p.files.push(f);
}

export function removeFromList(lib, files, name, view = MAC) {
  const p = findList(lib, name, view);
  if (!p) return;
  const drop = new Set(uniq(files));
  p.files = p.files.filter((f) => !drop.has(f));
}

/// Reorder what is in the list. Names the caller does not mention keep their
/// relative places on the end, so an order computed against a stale view can
/// never drop a song.
export function setOrder(lib, name, files, view = MAC) {
  const p = findList(lib, name, view);
  if (!p) return;
  const rank = new Map(uniq(files).map((f, i) => [f, i]));
  const known = p.files.filter((f) => rank.has(f)).sort((a, b) => rank.get(a) - rank.get(b));
  p.files = [...known, ...p.files.filter((f) => !rank.has(f))];
}

// ── The phone view ──────────────────────────────────────────────────────────

export const inPhoneView = (lib, file) => lib.phone.files.includes(base(file));

/// Put songs on the phone. A reference, not a copy: the file stays exactly
/// where it is, and the phone fetches it because this says to. Sorted, because
/// a reference set has no order and a stable one keeps the diffs readable.
export function addToPhone(lib, files) {
  lib.phone.files = uniq([...lib.phone.files, ...files]).sort((a, b) => a.localeCompare(b));
}

/// Take songs off the phone. The file is untouched — this is the whole point of
/// the split, and it is why a phone can never destroy anything: every removal a
/// phone can reach is this one.
export function removeFromPhone(lib, files) {
  unfile(lib, files, PHONE);
  const drop = new Set(uniq(files));
  lib.phone.files = lib.phone.files.filter((f) => !drop.has(f));
}

/// Out of the playlists of one view, or of both.
function unfile(lib, files, view) {
  const drop = new Set(uniq(files));
  const lists = view ? listsIn(lib, view) : [...lib.playlists, ...lib.phone.playlists];
  for (const p of lists) p.files = p.files.filter((f) => !drop.has(f));
}

// ── Tracks ──────────────────────────────────────────────────────────────────

/// The song is gone from the library — the row here, and (the caller unlinks)
/// the file and its sidecars. DJ music is reproducible, the whole loop being a
/// brief and then yt-dlp, so this is a plain delete and not a trip through the
/// Trash.
///
/// It cascades all the way down: out of the Mac's lists, off the phone, out of
/// the phone's lists. Nothing downstream can hold a song this Mac no longer
/// has, and a name that comes back is a NEW song arriving in no list rather
/// than inheriting the dead one's places.
///
/// Returns the row, whose file and sidecars are the caller's to unlink — the
/// only destruction in the product, done where the verb is rather than inside
/// a projection nobody reading the call would suspect.
export function deleteTrack(lib, file) {
  const f = base(file);
  const i = lib.tracks.findIndex((t) => t.file && base(t.file) === f);
  const row = i >= 0 ? lib.tracks.splice(i, 1)[0] : null;
  unfile(lib, [f]);
  lib.phone.files = lib.phone.files.filter((x) => x !== f);
  return row;
}

/// A playlist may only name a song the library actually has, and a phone may
/// only reference one. `has` answers that for a basename.
///
/// Deletes cascade, but a name can end up in a list without one ever happening
/// — a file renamed in Finder, a row lost to an old bug, a membership carried
/// over from a library that has since moved on. Those left playlists naming
/// songs that existed nowhere, which is how a phone came to report "9 of 11
/// here" for a list already holding all 9 it would ever hold.
///
/// Touches nothing on any disk, so it is safe on every reconcile. Idempotent.
export function pruneMissing(lib, has) {
  let pruned = 0;
  for (const p of [...lib.playlists, ...lib.phone.playlists]) {
    const before = p.files.length;
    p.files = p.files.filter((f) => has(f));
    pruned += before - p.files.length;
  }
  const before = lib.phone.files.length;
  lib.phone.files = lib.phone.files.filter((f) => has(f));
  return pruned + (before - lib.phone.files.length);
}

// ── What goes out ───────────────────────────────────────────────────────────

/// The phone view as it goes down the wire on a sync: the songs a phone
/// carries and how they are filed there. A copy, so a caller holding the reply
/// cannot reach back into the store.
export const phoneView = (lib) => ({
  files: lib.phone.files.slice(),
  playlists: lib.phone.playlists.map((p) => ({ name: p.name, files: p.files.slice() })),
});

/// Rewrite what each track says about itself. `playlists[]` and `phone` are the
/// store; `tracks[].playlists` and `tracks[].on_phone` are a second view of the
/// same facts, kept because the page and the agent have always read them there.
/// Recomputed on every save, which is the only way two shapes of one fact can
/// never disagree.
export function project(lib) {
  normalize(lib);
  lib.playlists.sort(byName);
  lib.phone.playlists.sort(byName);
  for (const t of lib.tracks) {
    t.playlists = t.file ? listsForFile(lib, t.file) : [];
    t.on_phone = t.file ? inPhoneView(lib, t.file) : false;
  }
  return lib;
}
