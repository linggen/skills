// store.js — the Mac mirror's data model. Pure functions, no I/O: ingest.mjs
// owns every read and write, the page reads what it wrote, and these rules are
// unit-testable without a phone.
//
// The mirror is the same shape as the phone's store, one level down under
// `data/`:
//
//   data/state.json                      ledger per type, mirror id, per-device
//                                        sync marks
//   data/samples/<type>/<YYYY-MM>.jsonl  rows exactly as HealthKit gave them,
//                                        append-only; a deletion is a
//                                        {"del": uuid} line, never a rewrite
//   data/<register>.json                 profile, layout, targets, plans/…,
//                                        checklist/…, briefs/… — whole files,
//                                        last writer wins by `written_at`
//
// The phone is the sensor and stays the origin of every sample. The Mac keeps
// them because it is the only side with room for years of them.

/// Which month file a row belongs to. `unknown` rather than a guess: a row
/// with no start has no place on a calendar, and inventing one would put it
/// in a month the user never lived.
export const monthOf = (startIso) =>
  typeof startIso === 'string' && startIso.length >= 7 ? startIso.slice(0, 7) : 'unknown';

/// Split a JSONL body into parsed rows, dropping what cannot be read.
///
/// A torn last line is a write that was interrupted, not a row: every reader
/// on both sides drops it rather than fail the file it sits in.
export function parseLines(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const r = JSON.parse(s);
      if (r && typeof r === 'object') out.push(r);
    } catch {
      /* a torn or corrupt line is skipped, same as the phone does */
    }
  }
  return out;
}

/// The ledger row for one type, folded over the rows just filed.
///
/// `first`/`last` are the span of what is held, `sources` the writers seen (a
/// Watch, a phone, a scale), capped so one noisy app cannot grow the file.
export function fold(entry, rows) {
  const l = {
    count: 0,
    sources: [],
    deleted: 0,
    ...(entry || {}),
  };
  const sources = new Set(l.sources || []);
  for (const r of rows) {
    if (r.del) {
      l.deleted = (l.deleted || 0) + 1;
      continue;
    }
    l.count = (l.count || 0) + 1;
    const start = r.start;
    if (typeof start === 'string') {
      if (!l.first || start < l.first) l.first = start;
      if (!l.last || start > l.last) l.last = start;
    }
    if (typeof r.source === 'string' && r.source && sources.size < 8) {
      sources.add(r.source);
    }
  }
  l.sources = [...sources];
  return l;
}

/// The rows of one batch that this mirror has not already filed, grouped by
/// the file each belongs in.
///
/// A batch is replayed whenever a phone loses the reply it was waiting for, so
/// every row arrives at least once and may arrive twice. `seen` is the uuids
/// already on disk for the months this batch touches — dedup is by uuid, which
/// HealthKit mints, so the same sample from two phones is still one row.
export function planWrite(rows, seen) {
  const files = new Map();
  const counts = { added: 0, deleted: 0, duplicate: 0, unfiled: 0 };
  for (const r of rows) {
    const type = r.type;
    if (typeof type !== 'string' || !type) {
      counts.unfiled += 1;
      continue;
    }
    if (r.del) {
      // A deletion is dated by when it was noticed, not by the sample it
      // retires — the uuid is all HealthKit gives, and readers drop it
      // wherever the row itself sits.
      const key = `${type}/${monthOf(r.at)}`;
      if (seen.has(`${type}:del:${r.del}`)) {
        counts.duplicate += 1;
        continue;
      }
      seen.add(`${type}:del:${r.del}`);
      if (!files.has(key)) files.set(key, []);
      files.get(key).push(r);
      counts.deleted += 1;
      continue;
    }
    if (typeof r.start !== 'string') {
      counts.unfiled += 1;
      continue;
    }
    const id = `${type}:${r.uuid}`;
    if (r.uuid && seen.has(id)) {
      counts.duplicate += 1;
      continue;
    }
    if (r.uuid) seen.add(id);
    const key = `${type}/${monthOf(r.start)}`;
    if (!files.has(key)) files.set(key, []);
    files.get(key).push(r);
    counts.added += 1;
  }
  return { files, counts };
}

/// Which of two versions of a register is current.
///
/// `written_at` is stamped by whichever side wrote, so the newest stamp wins on
/// both and the two converge without a conversation. A file with no stamp
/// loses to one that has it: an unstamped register is either hand-made or from
/// before this lane, and neither should overwrite a dated write.
export function newer(a, b) {
  const at = (x) => (x && typeof x.written_at === 'string' ? x.written_at : '');
  if (!a) return b || null;
  if (!b) return a;
  return at(b) > at(a) ? b : a;
}

/// True when [incoming] should replace what is on disk.
export const wins = (incoming, current) => !!incoming && newer(current, incoming) === incoming;

/// The union of two note logs, oldest first.
///
/// Notes are lines the user typed or said, so neither side may drop one; two
/// notes made in the same second on two devices are two notes, and only an
/// exact repeat of both time and text is the same one arriving twice.
export function mergeNotes(mine, theirs) {
  const out = [];
  const seen = new Set();
  for (const n of [...(mine || []), ...(theirs || [])]) {
    if (!n || typeof n !== 'object') continue;
    const key = `${n.at || ''}|${n.text || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  out.sort((x, y) => String(x.at || '').localeCompare(String(y.at || '')));
  return out;
}

/// The ledger as the page and the agent read it: totals, and the span held.
export function summarize(ledger) {
  const types = Object.entries(ledger || {});
  let samples = 0;
  let first = null;
  let last = null;
  for (const [, l] of types) {
    samples += l.count || 0;
    if (l.first && (!first || l.first < first)) first = l.first;
    if (l.last && (!last || l.last > last)) last = l.last;
  }
  return {
    types: types.filter(([, l]) => (l.count || 0) > 0).length,
    samples,
    first,
    last,
  };
}
