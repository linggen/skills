// lww.js — the edit register: every playlist change the user makes, as one
// last-write-wins cell keyed by a path.
//
// Why a register and not just library.json: the phone edits the same library
// while it's away from this Mac. A file carries one mtime for the whole blob,
// so a merge could only pick a file and throw the other side's edits away. A
// cell carries its own timestamp, so the merge is per-key, symmetric and
// idempotent — order never matters, and adding a song to one playlist here
// while the phone adds a different one there keeps both.
//
// This mirrors linggen-mobile's `lib/services/dj/dj_store.dart` cell for cell
// (same key prefixes, same {v,ts,d} shape, same tiebreak). The two must not
// drift: the phone's state and this one merge into each other verbatim. Copied
// in shape from skills/cfo/scripts/lww.js, which does the same job for money.
//
// Key space (identical on both sides). A song is named by the BASENAME of its
// file — the one thing both devices provably agree on, because the phone got
// its copy under that name:
//
//   pln:<playlist>          true = the playlist exists (null = deleted)
//   pl:<file>|<playlist>    true = that song is in it (null = removed from it)
//   plo:<playlist>          [file, …] the running order
//   del:<file>              true = the song is gone from the library
//
// `pln:` exists so an empty playlist can, too — you make one, then fill it.
// Rename needs no key of its own: it is a delete and a create plus the member
// cells moving, which is what the page has always done to `playlists[]`.

/// One cell. `v === null` is a tombstone: the key is *known to be unset*, which
/// is not the same as absent — a tombstone still competes in the merge, so a
/// removal sticks instead of being resurrected by the other device's older cell.
export class LwwEntry {
  constructor(v, ts, d) {
    this.v = v;
    this.ts = ts;
    this.d = d;
  }

  /// (ts, device) ordering — the device id breaks ties so two devices editing
  /// the same key in the same millisecond still converge on one winner.
  newerThan(o) {
    return this.ts !== o.ts ? this.ts > o.ts : String(this.d) > String(o.d);
  }

  static fromJson(j) {
    return new LwwEntry(j.v === undefined ? null : j.v, Number(j.ts) || 0, String(j.d || ''));
  }

  toJson() {
    return { v: this.v, ts: this.ts, d: this.d };
  }
}

export class Register {
  /**
   * @param {string} deviceId stable per machine; the LWW tiebreak, not a secret
   * @param {object|null} state previously saved `toState()` output
   */
  constructor(deviceId, state) {
    this.deviceId = deviceId;
    this.cells = new Map();
    this.lastTs = 0;
    if (state) this.loadState(state);
  }

  // Strictly-increasing local clock: never goes backward even if the wall clock
  // does, so this device's edits always order after its own previous ones.
  stamp(now = Date.now()) {
    this.lastTs = now > this.lastTs ? now : this.lastTs + 1;
    return this.lastTs;
  }

  set(key, value) {
    this.cells.set(key, new LwwEntry(value === undefined ? null : value, this.stamp(), this.deviceId));
  }

  remove(key) {
    this.set(key, null);
  }

  /// The live value, or undefined when the key was never written here. A
  /// tombstone reads as null — "known to be unset", which callers must treat as
  /// authoritative rather than falling back to what library.json still says.
  get(key) {
    const e = this.cells.get(key);
    return e ? e.v : undefined;
  }

  has(key) {
    return this.cells.has(key);
  }

  get size() {
    return this.cells.size;
  }

  /// Live (non-tombstoned) entries under a prefix, as [suffix, value] pairs.
  entries(prefix) {
    const out = [];
    for (const [k, e] of this.cells) {
      if (k.startsWith(prefix) && e.v !== null) out.push([k.slice(prefix.length), e.v]);
    }
    return out;
  }

  // ── Sync ──
  toState() {
    const reg = {};
    for (const [k, e] of this.cells) reg[k] = e.toJson();
    return { device: this.deviceId, lastTs: this.lastTs, reg };
  }

  loadState(state) {
    this.cells.clear();
    this.lastTs = Number(state.lastTs) || 0;
    for (const [k, ej] of Object.entries(state.reg || {})) this.cells.set(k, LwwEntry.fromJson(ej));
  }

  /// Merge a peer's register: per-key last-write-wins. Symmetric and idempotent.
  mergeState(remote) {
    for (const [k, ej] of Object.entries((remote && remote.reg) || {})) {
      const e = LwwEntry.fromJson(ej);
      const cur = this.cells.get(k);
      if (!cur || e.newerThan(cur)) this.cells.set(k, e);
    }
    // Never let a future local edit collide with a just-merged timestamp.
    for (const e of this.cells.values()) if (e.ts > this.lastTs) this.lastTs = e.ts;
  }
}

// ── Keys ────────────────────────────────────────────────────────────────────
// One place, so a typo can't put the two sides in different key spaces.

export const base = (path) => String(path || '').split('/').pop();

/// The two views, as the prefixes their cells live under. Everything below
/// takes a view rather than existing twice: the Mac's playlists and the phone
/// view's playlists are the same operations over different key spaces, and one
/// implementation is the only way they cannot drift apart.
///
/// They are separate namespaces on purpose. The Mac's lists curate the whole
/// library for playing here; the phone view's curate what a phone carries.
/// They are NOT copies of each other and are never reconciled — same name in
/// both is two lists, which is what makes "9 of 11 here" impossible to say.
export const MAC = { list: 'pln', member: 'pl', order: 'plo' };
export const PHONE = { list: 'ppn', member: 'ppl', order: 'ppo' };

export const kList = (name, view = MAC) => `${view.list}:${name}`;
export const kMember = (file, name, view = MAC) => `${view.member}:${base(file)}|${name}`;
export const kOrder = (name, view = MAC) => `${view.order}:${name}`;
export const kDeleted = (file) => `del:${base(file)}`;

/// The phone view's song set: a REFERENCE to a song the Mac holds, never a
/// song of its own. This is the whole of what a phone carries — the sync fetches
/// exactly these, and a phone can add or drop references but can never destroy
/// the file behind one.
export const kRef = (file) => `ref:${base(file)}`;

// ── Edits ───────────────────────────────────────────────────────────────────
// Every playlist mutation the page or the phone can make, in one vocabulary.

export function createList(reg, name, view = MAC) {
  reg.set(kList(name, view), true);
}

/// Deleting a playlist unfiles its songs but never touches the files — a song
/// in no playlist is still a song.
export function deleteList(reg, name, files, view = MAC) {
  for (const f of files) reg.remove(kMember(f, name, view));
  reg.remove(kOrder(name, view));
  reg.remove(kList(name, view));
}

/// Rename = the new list, its members, its order, then the old list gone. Doing
/// it as ordinary cells is what makes it merge: a peer that only ever saw the
/// old name still converges.
export function renameList(reg, oldName, newName, files, view = MAC) {
  reg.set(kList(newName, view), true);
  for (const f of files) {
    reg.remove(kMember(f, oldName, view));
    reg.set(kMember(f, newName, view), true);
  }
  const order = reg.get(kOrder(oldName, view));
  if (Array.isArray(order)) reg.set(kOrder(newName, view), order);
  reg.remove(kOrder(oldName, view));
  reg.remove(kList(oldName, view));
}

export function addToList(reg, files, name, view = MAC) {
  reg.set(kList(name, view), true);
  for (const f of files) reg.set(kMember(f, name, view), true);
}

export function removeFromList(reg, files, name, view = MAC) {
  for (const f of files) reg.remove(kMember(f, name, view));
}

export function setOrder(reg, name, files, view = MAC) {
  reg.set(kOrder(name, view), files.map(base));
}

// ── The phone view ──────────────────────────────────────────────────────────

export const inPhoneView = (reg, file) => reg.get(kRef(file)) === true;

/// Put songs on the phone. A reference, not a copy: the file stays exactly
/// where it is, and the phone fetches it because this cell says to.
export function addToPhone(reg, files) {
  for (const f of files) reg.set(kRef(f), true);
}

/// Take songs off the phone. The file is untouched — this is the whole point
/// of the split, and it is why the phone can never destroy anything: every
/// removal a phone can reach is this one.
export function removeFromPhone(reg, files) {
  for (const f of files) {
    reg.remove(kRef(f));
    for (const name of listsForFile(reg, f, PHONE)) reg.remove(kMember(f, name, PHONE));
  }
}

/// The song is gone from the library — the row and the file both. DJ music is
/// reproducible (the whole loop is a brief, then yt-dlp), so this is a plain
/// delete and not a trip through the Trash.
///
/// A song that is gone is in no playlist, so its membership goes with it. The
/// cells are tombstoned here rather than filtered out wherever membership is
/// read: a name that comes back is a NEW song (see [undeleteTrack]), and it
/// should arrive in no list rather than inherit the dead one's places. Leaving
/// them standing is what left playlists naming songs that no longer exist —
/// a phone then honestly reported "9 of 11 here" for a list of 9.
/// Deleting here is the only destruction in the product, so it cascades all the
/// way down: out of the Mac's lists, off the phone, out of the phone's lists.
/// Nothing downstream can hold a song this Mac no longer has.
export function deleteTrack(reg, file) {
  reg.set(kDeleted(file), true);
  for (const name of listsForFile(reg, file)) reg.remove(kMember(file, name));
  removeFromPhone(reg, [file]);
}

/// Deletes written before the rule above — or merged in from a peer that
/// doesn't know it yet — left their membership cells behind. Clearing them
/// keeps one meaning of "deleted" whoever wrote the tombstone, and the
/// tombstones it writes carry the repair to the other device on the next sync.
/// Idempotent: a second run finds nothing.
export function reconcileDeleted(reg) {
  let cleared = 0;
  for (const [file] of reg.entries('del:')) {
    for (const name of listsForFile(reg, file)) {
      reg.remove(kMember(file, name));
      cleared += 1;
    }
    // The same invariant one level down: a song this Mac destroyed cannot be
    // referenced by a phone. Holds even when the tombstone arrived by merge
    // from a device that never knew about the phone view.
    if (inPhoneView(reg, file) || listsForFile(reg, file, PHONE).length) {
      removeFromPhone(reg, [file]);
      cleared += 1;
    }
  }
  return cleared;
}

/// A playlist may only name a song the library actually has, and a phone may
/// only reference one. `has` answers that for a basename.
///
/// Deletes cascade and retires prune, but a name can end up in a list without
/// either ever happening — a file renamed in Finder, a row lost to an old bug,
/// a membership seeded from a library that has since moved on. Those left
/// playlists naming songs that existed nowhere, which is how a phone came to
/// report "9 of 11 here" for a list already holding all 9 it would ever hold.
///
/// Cells only: nothing on any disk is touched, so this is safe to run on every
/// reconcile. Idempotent.
export function pruneMissing(reg, has) {
  let pruned = 0;
  for (const view of [MAC, PHONE]) {
    for (const [rest] of reg.entries(`${view.member}:`)) {
      const file = rest.slice(0, rest.lastIndexOf('|'));
      const name = rest.slice(rest.lastIndexOf('|') + 1);
      if (has(file)) continue;
      reg.remove(kMember(file, name, view));
      pruned += 1;
    }
  }
  for (const [file] of reg.entries('ref:')) {
    if (has(file)) continue;
    reg.remove(kRef(file));
    pruned += 1;
  }
  return pruned;
}

/// A song arriving under a name that was deleted before is a NEW song, so the
/// tombstone has to lose. Called on every download and on adoption; without it
/// a re-download would be deleted again the moment the register was consulted.
export function undeleteTrack(reg, file) {
  if (reg.get(kDeleted(file)) === true) reg.remove(kDeleted(file));
}

// ── Projection ──────────────────────────────────────────────────────────────
// The register is the truth; library.json carries a copy in the shape the page,
// the ListLibrary tool and the agent already speak. Written on every save, so
// nothing downstream has to learn about cells.

/// Every playlist name in a view, live ones only, alphabetical.
export function listsOf(reg, view = MAC) {
  return reg.entries(`${view.list}:`).map(([name]) => name).sort((a, b) => a.localeCompare(b));
}

/// The playlists of one view that a file belongs to.
export function listsForFile(reg, file, view = MAC) {
  const want = `${base(file)}|`;
  return reg
    .entries(`${view.member}:`)
    .filter(([rest]) => rest.startsWith(want))
    .map(([rest]) => rest.slice(want.length));
}

/// The files in a playlist, in the user's order. Anything filed since the order
/// was last set goes on the end rather than vanishing.
export function filesInList(reg, name, view = MAC) {
  const suffix = `|${name}`;
  const members = reg
    .entries(`${view.member}:`)
    .filter(([rest]) => rest.endsWith(suffix))
    .map(([rest]) => rest.slice(0, rest.length - suffix.length));
  const order = reg.get(kOrder(name, view));
  if (!Array.isArray(order)) return members.sort((a, b) => a.localeCompare(b));
  const rank = new Map(order.map((f, i) => [f, i]));
  const known = members.filter((f) => rank.has(f)).sort((a, b) => rank.get(a) - rank.get(b));
  const rest = members.filter((f) => !rank.has(f)).sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

export const isDeleted = (reg, file) => reg.get(kDeleted(file)) === true;

/// Write the register through into `lib` — `tracks[].playlists[]` and the
/// top-level `playlists[]`, which had drifted empty and is now real again.
/// Returns the files the register says are gone, for the caller to unlink.
///
/// `lib.phone` is the second view: which songs a phone carries and how they are
/// filed there. It is projected from the same register rather than kept as its
/// own file, so the page, the agent and the phone all read one truth — and a
/// reference can only ever name a song `tracks` still has, because a Mac-view
/// delete cascades before this runs.
export function project(reg, lib) {
  const gone = [];
  const kept = [];
  for (const t of lib.tracks || []) {
    if (t.file && isDeleted(reg, t.file)) {
      gone.push(t.file);
      continue;
    }
    t.playlists = t.file ? listsForFile(reg, t.file) : [];
    t.on_phone = t.file ? inPhoneView(reg, t.file) : false;
    kept.push(t);
  }
  lib.tracks = kept;
  lib.playlists = listsOf(reg).map((name) => ({ name, files: filesInList(reg, name) }));
  lib.phone = {
    files: reg.entries('ref:').map(([f]) => f).sort((a, b) => a.localeCompare(b)),
    playlists: listsOf(reg, PHONE)
      .map((name) => ({ name, files: filesInList(reg, name, PHONE) })),
  };
  return gone;
}

/// One-time lift of the playlists that already exist as track tags, so nothing
/// is lost the first time a library meets the register. Only fills keys the
/// register has never seen — a deliberate deletion is never undone by it.
export function seedFromTracks(reg, lib) {
  let seeded = 0;
  for (const t of lib.tracks || []) {
    if (!t.file) continue;
    for (const name of t.playlists || []) {
      if (!reg.has(kList(name))) {
        reg.set(kList(name), true);
        seeded += 1;
      }
      const key = kMember(t.file, name);
      if (!reg.has(key)) {
        reg.set(key, true);
        seeded += 1;
      }
    }
  }
  return seeded;
}
