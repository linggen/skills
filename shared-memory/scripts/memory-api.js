// The memory dashboard's own calls: Linggen's memory (same origin, /mem)
// and the JSON files it keeps (through /api/bash). Sessions and models come
// from the engine (/shared/api.js).

import { MEM_BASE, MEMORY_PREFIX, memoryPath, readEnvelope } from './memory-path.js';

// Run a shell command through Linggen's /api/bash proxy. The engine's
// BashRequest requires a `project_root` field — commands here use
// absolute paths, so the value is irrelevant but must be
// present (mirrors the pulse skill's `/tmp` convention). Returns the
// raw response (use `.stdout`), or null if the request failed.
async function bashExec(command) {
  const res = await fetch(`/api/bash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Linggen's memory ──
// See memory-path.js: `POST /mem/api/memory/<verb>` on the engine's own origin.
export { MEM_BASE, MEMORY_PREFIX, memoryPath, readEnvelope };

// One memory verb → its envelope's data, or null when the call or the
// answer failed (unreachable, non-JSON, `ok:false`).
async function memoryCall(verb, body = {}) {
  try {
    const res = await fetch(memoryPath(verb), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return readEnvelope(await res.json());
  } catch {
    return null;
  }
}

// Returns {count, latest_created_at} per memory's count verb.
export async function fetchMemoryCount(filter = {}) {
  return (await memoryCall('count', filter)) || { count: 0, latest_created_at: null };
}

// Per-day dream-state rollup from memory — the single source of
// truth behind the calendar. Returns the endpoint's data payload:
// { today, ttl_days, days: [{date, state, rows, unjudged, past_ttl,
//   harvested_at, remembered_at, judged, promoted, forgotten}] }
// Per-day verb flags: scanned (logs walked) | dreamed (judged, no late rows).
export function fetchMemoryDays(filter = {}) {
  return memoryCall('days', filter);
}

// Open review-queue items from memory — what a dream audit could
// not solve with confidence. Returns the endpoint's data payload:
// { open_count, issues: [{id, kind, note, row_ids, created_at, status}] }
// The verb pages (50 by default) — ask for the whole queue; `open_count` is the true size.
export function fetchMemoryIssues(status = 'open') {
  return memoryCall('issues', { status, limit: 1000 });
}

// Store-state summary from memory — row counts per tier, disk
// footprint, last dream. Same `stats` payload the engine's
// mission report renders.
export function fetchMemoryStats() {
  return memoryCall('stats', {});
}

// Expand `~` to $HOME on the shell side, since /api/bash receives a
// command string (not pre-expanded). All readers below feed the path
// through `eval echo` so `~` and `$HOME` both work transparently.
function expandPath(path) {
  // Build a shell snippet that prints the expanded path to a holding
  // variable. JSON.stringify quotes path safely — `~` expands because
  // it's at the start of a word, and $HOME expands inside double
  // quotes as usual.
  return `$(eval echo ${JSON.stringify(path)})`;
}

// Read a small JSON file via /api/bash. Missing file → fallback.
// Used for the dashboard page cache.
export async function readJsonFile(path, fallback = null) {
  const p = expandPath(path);
  const cmd = `f=${p}; [ -f "$f" ] && cat "$f" || true`;
  const out = await bashExec(cmd);
  if (!out) return fallback;
  const txt = (out.stdout || '').trim();
  if (!txt) return fallback;
  try { return JSON.parse(txt); } catch { return fallback; }
}

// Write a JSON file via /api/bash. Creates parent dirs. Best-effort —
// quota-equivalent (e.g. disk-full) failures surface as a rejected
// promise so callers can `.catch(() => {})` and move on.
export async function writeJsonFile(path, value) {
  const p = `$(eval echo ${JSON.stringify(path)})`;
  const json = JSON.stringify(value);
  // Base64 the payload to keep arbitrary content (quotes, backticks,
  // newlines) out of the shell command surface.
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const cmd = `f=${p}; mkdir -p "$(dirname "$f")" && printf '%s' ${JSON.stringify(b64)} | base64 --decode > "$f"`;
  const out = await bashExec(cmd);
  if (!out) throw new Error(`writeJsonFile ${path}: /api/bash request failed`);
}

// Read every line of an NDJSON file, parsing each into an object.
// Malformed lines are skipped. Returns [] when the file is absent.
export async function readJsonl(path) {
  const p = expandPath(path);
  const cmd = `f=${p}; [ -f "$f" ] && cat "$f" || true`;
  const out = await bashExec(cmd);
  if (!out) return [];
  const txt = (out.stdout || '').trim();
  if (!txt) return [];
  const rows = [];
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip malformed */ }
  }
  return rows;
}

// Read the first line (the header object) of an NDJSON file.
export async function readJsonlHeader(path, fallback = null) {
  const p = expandPath(path);
  const cmd = `f=${p}; [ -f "$f" ] && head -n 1 "$f" || true`;
  const out = await bashExec(cmd);
  if (!out) return fallback;
  const txt = (out.stdout || '').trim();
  if (!txt) return fallback;
  try { return JSON.parse(txt); } catch { return fallback; }
}
