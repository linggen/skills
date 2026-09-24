// queue.mjs — the Mac's download queue, data/queue.json. Plain data; the verbs
// in actions.mjs mutate it under the one lock, and scripts/fetch.py's worker
// drains it in its own session, so a download outlives the page that asked.
//
//   item: { id, kind: track|redownload, artist, title, year?, version?,
//           query_hints?, playlist?, for_phone?, dest?, exclude?, skip_first?,
//           status: pending|running|cancelling|done|error|cancelled,
//           error?, file?, added_at, started_at?, finished_at? }

import crypto from 'node:crypto';

import { readJson, writeJson, QUEUE } from './io.mjs';
import { idOf, base } from './store.js';

const ACTIVE = new Set(['pending', 'running', 'cancelling']);
const FINISHED_KEPT = 100;
const now = () => new Date().toISOString();

export function loadQueue() {
  const q = readJson(QUEUE, { items: [] });
  q.items = Array.isArray(q.items) ? q.items : [];
  return q;
}

/// Everything still in flight, plus the most recent finished ones — enough for
/// the page to show what just happened, never a growing log.
export function saveQueue(q) {
  const finished = q.items.filter((i) => !ACTIVE.has(i.status));
  const drop = new Set(finished.slice(0, Math.max(0, finished.length - FINISHED_KEPT)));
  q.items = q.items.filter((i) => !drop.has(i));
  writeJson(QUEUE, q);
}

export const counts = (q) => ({
  pending: q.items.filter((i) => i.status === 'pending').length,
  running: q.items.filter((i) => i.status === 'running' || i.status === 'cancelling').length,
});

const keyOf = (i) => `${i.kind}|${i.kind === 'redownload' ? base(i.dest) : idOf(i)}`;

const text = (v) => (v === undefined || v === null ? undefined : String(v).trim() || undefined);

/// What a caller may put in an item — nothing else rides along.
export function trackItem(t) {
  return {
    kind: 'track',
    artist: text(t.artist) || '',
    title: text(t.title) || '',
    year: t.year || undefined,
    version: text(t.version),
    query_hints: Array.isArray(t.query_hints) ? t.query_hints.map(String) : undefined,
    playlist: text(t.playlist),
    for_phone: t.for_phone === true || undefined,
  };
}

/// Queue items; one already waiting or running for the same song is not
/// queued twice. Returns the ids of the ones added.
export function enqueue(q, items) {
  const active = new Set(q.items.filter((i) => ACTIVE.has(i.status)).map(keyOf));
  const ids = [];
  for (const item of items) {
    if (!item.title || active.has(keyOf(item))) continue;
    const row = { id: crypto.randomUUID(), ...item, status: 'pending', added_at: now() };
    q.items.push(row);
    active.add(keyOf(row));
    ids.push(row.id);
  }
  return ids;
}

export function claim(q) {
  const item = q.items.find((i) => i.status === 'pending');
  if (!item) return null;
  item.status = 'running';
  item.started_at = now();
  return item;
}

const outcome = (r) => (r.ok ? 'done' : r.cancelled ? 'cancelled' : 'error');

export function finish(q, id, result) {
  const item = q.items.find((i) => i.id === id);
  if (!item) return null;
  item.status = outcome(result);
  item.finished_at = now();
  if (result.ok) {
    delete item.error;
    item.file = base(result.file);
  } else {
    item.error = String(result.error || 'failed');
  }
  return item;
}

const pick = (q, ids) => (ids === 'all' ? q.items : q.items.filter((i) => ids.includes(i.id)));

/// Waiting ones stop now; a running one is told, and its worker kills the
/// download when it next looks.
export function cancel(q, ids) {
  let n = 0;
  for (const i of pick(q, ids)) {
    if (i.status === 'pending') { i.status = 'cancelled'; i.finished_at = now(); n += 1; }
    else if (i.status === 'running') { i.status = 'cancelling'; n += 1; }
  }
  return n;
}

export function retry(q, ids) {
  let n = 0;
  for (const i of pick(q, ids)) {
    if (i.status !== 'error' && i.status !== 'cancelled') continue;
    i.status = 'pending';
    delete i.error;
    delete i.finished_at;
    n += 1;
  }
  return n;
}

export function clearFinished(q) {
  const before = q.items.length;
  q.items = q.items.filter((i) => ACTIVE.has(i.status));
  return before - q.items.length;
}

/// A worker starting up is the only worker, so anything "running" was left by
/// one that died: it runs again, or — if it was being cancelled — it is.
export function resetRunning(q) {
  for (const i of q.items) {
    if (i.status === 'running') i.status = 'pending';
    if (i.status === 'cancelling') { i.status = 'cancelled'; i.finished_at = now(); }
  }
}
