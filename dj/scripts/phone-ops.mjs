// phone-ops.mjs — a phone's queued edits, applied by the one writer.
//
// A phone edits its view while this Mac is asleep, so its edits arrive as
// INTENTS — one jsonl line each — rather than as a state to merge. Every op
// lands here under the same lock every other verb takes, and the whole
// resulting view goes back down (see linggen-mobile/doc/dj.md).
//
// An op that can't be carried out — its playlist or its song deleted here in
// the meantime — is SKIPPED and named, never guessed at. It is still spent:
// the phone clears it on the acknowledgement, so a stale intent can't queue
// forever.

import { Buffer } from 'node:buffer';

import {
  PHONE, base, createList, deleteList, renameList, addToList, removeFromList, setOrder,
  addToPhone, removeFromPhone, listsOf, resolveTracks, norm,
} from './store.js';
import { die, readJson, writeJson, OP_IDS } from './io.mjs';

const opName = (o) => {
  const s = String(o.name ?? '').trim();
  if (!s) die('op has no playlist name');
  return s;
};

const opFiles = (o) => [
  ...new Set((Array.isArray(o.files) ? o.files : []).map((f) => base(String(f ?? ''))).filter(Boolean)),
];

const listMissing = (name) => ({ skipped: `“${name}” is no longer a playlist on your Mac` });
const goneHere = (names) => `${names.join(', ')} — no longer on your Mac`;

/// The names that are still songs here, and the ones that aren't. A name it
/// can't place is news to report — never a reason to drop the batch.
function resolveSome(lib, wanted) {
  const { hits, missing } = resolveTracks(lib, wanted);
  return { hits: hits.map((t) => t.file), missing };
}

/// Songs a phone asks to carry or file: none of them here is a skip, some of
/// them here applies to those and names the rest.
function withSongs(lib, o, apply) {
  const files = opFiles(o);
  const { hits, missing } = resolveSome(lib, files);
  if (files.length && !hits.length) return { skipped: goneHere(missing) };
  apply(hits);
  return missing.length ? { missing } : {};
}

function inList(lib, o, apply) {
  const name = opName(o);
  if (!listsOf(lib, PHONE).includes(name)) return listMissing(name);
  apply(name);
  return {};
}

/// One play, counted on the song. Not an edit of the phone view, so it rings
/// no phone; a file this Mac doesn't know is simply spent — a play is a fact
/// about the past, not a request anyone is waiting on.
function trackPlayed(lib, o) {
  const f = norm(String(o.file ?? ''));
  const t = f && lib.tracks.find((x) => x.file && norm(x.file) === f);
  if (!t) return { quiet: true, unchanged: true };
  t.plays = (Number(t.plays) || 0) + 1;
  const at = Date.parse(o.at);
  if (Number.isFinite(at) && !(Date.parse(t.last_played) >= at)) t.last_played = new Date(at).toISOString();
  return { quiet: true };
}

/// One vocabulary, and deliberately a small one: it names the phone view (and
/// the play count) only — no Mac-view verb, no file-destroying verb. A phone
/// structurally cannot reach this Mac's own playlists or its music.
const PHONE_OPS = {
  'playlist-create': (lib, o) => {
    createList(lib, opName(o), PHONE);
    return {};
  },

  'playlist-rename': (lib, o) => {
    const from = opName(o);
    const to = String(o.to ?? '').trim();
    if (!to) die('rename has no new name');
    if (from === to) return {};
    return inList(lib, o, () => renameList(lib, from, to, PHONE));
  },

  // Deleting a list that is already gone is the intent satisfied.
  'playlist-delete': (lib, o) => {
    deleteList(lib, opName(o), PHONE);
    return {};
  },

  // Filing implies carrying — a phone list never names a song the phone
  // hasn't got — and lands the song where it was dropped, as the phone did.
  'playlist-add': (lib, o) => {
    const name = opName(o);
    return withSongs(lib, o, (hits) => {
      addToPhone(lib, hits);
      addToList(lib, hits, name, PHONE);
    });
  },

  // Membership is by basename, so a removal never needs the song to exist.
  'playlist-remove': (lib, o) => inList(lib, o, (name) => removeFromList(lib, opFiles(o), name, PHONE)),

  'playlist-reorder': (lib, o) => inList(lib, o, (name) => setOrder(lib, name, opFiles(o), PHONE)),

  'ref-add': (lib, o) => withSongs(lib, o, (hits) => addToPhone(lib, hits)),

  // The strongest thing a phone can ask for: it stops carrying the song.
  'ref-remove': (lib, o) => {
    removeFromPhone(lib, opFiles(o));
    return {};
  },

  'track-played': trackPlayed,
};

// ── the applied-op ring ─────────────────────────────────────────────────────
// A re-send after a lost acknowledgement must be a no-op. Bounded, because an
// id is only useful until the phone has heard back.
const RING = 1000;

const readRing = () => {
  const ids = readJson(OP_IDS, { ids: [] }).ids;
  return Array.isArray(ids) ? ids.map(String) : [];
};

/// The batch as the phone base64'd it.
export function decodeOps(b64) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return die('ops is not base64 of a JSON array');
  }
  if (!Array.isArray(parsed)) die('ops must be a JSON array');
  return parsed;
}

function tryOp(o) {
  const run = PHONE_OPS[String(o?.op ?? '')];
  if (!run) return () => ({ skipped: `unknown op “${o?.op ?? ''}”` });
  return (lib) => {
    try {
      return run(lib, o);
    } catch (e) {
      return { skipped: String(e?.message || e) };
    }
  };
}

/// Apply a batch to `lib` in place. Returns what the reply needs plus whether
/// anything changed (`dirty`) and whether the phone view did (`rings`) —
/// persisting and ringing the phone are the caller's.
export function applyPhoneOps(lib, batch) {
  const ring = readRing();
  const seen = new Set(ring);
  const results = [];
  const skipped = [];
  let applied = 0;
  let dirty = false;
  let rings = false;

  for (const o of batch) {
    const id = String(o?.id ?? '').trim();
    // Unaddressable: it could never be acknowledged, so it would come back
    // forever.
    if (!id) continue;
    if (seen.has(id)) {
      results.push({ id, ok: true, duplicate: true });
      continue;
    }
    const { quiet, unchanged, ...outcome } = tryOp(o)(lib);
    seen.add(id);
    ring.push(id);
    if (outcome.skipped) {
      results.push({ id, ok: false, skipped: outcome.skipped });
      skipped.push({ id, op: o.op, reason: outcome.skipped });
      continue;
    }
    results.push({ id, ok: true, ...outcome });
    applied += 1;
    dirty ||= !unchanged;
    rings ||= !quiet;
  }
  return { results, skipped, applied, dirty, rings, ring: ring.slice(-RING) };
}

export const saveRing = (ring) => writeJson(OP_IDS, { ids: ring });
