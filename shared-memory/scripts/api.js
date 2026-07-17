// Linggen API client for the memory dashboard.
const API_BASE = '';

// Run a shell command through Linggen's /api/bash proxy. The engine's
// BashRequest requires a `project_root` field — commands here use
// absolute paths / curl, so the value is irrelevant but must be
// present (mirrors the pulse skill's `/tmp` convention). Returns the
// raw response (use `.stdout`), or null if the request failed.
async function bashExec(command) {
  const res = await fetch(`${API_BASE}/api/bash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchModels() {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function fetchDefaultModel() {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) return null;
  const config = await res.json();
  const defaults = config.routing?.default_models;
  return defaults && defaults.length > 0 ? defaults[0] : null;
}

export async function createSession(title, skill) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, skill }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

export async function listSkillSessions(skill) {
  const res = await fetch(`${API_BASE}/api/skill-sessions?skill=${encodeURIComponent(skill)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions || [];
}

export async function removeSkillSession(skill, sessionId) {
  const res = await fetch(`${API_BASE}/api/skill-sessions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill, session_id: sessionId }),
  });
  if (!res.ok) throw new Error('Failed to delete session');
}

export async function fetchSessionMessages(skill, sessionId) {
  const params = new URLSearchParams({ skill, session_id: sessionId });
  const res = await fetch(`${API_BASE}/api/skill-sessions/state?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

// ── ling-mem daemon proxy ──
// Cross-origin to 127.0.0.1:9888 isn't allowed from this iframe; route
// through Linggen's /api/bash so the JS can call the daemon without
// CORS headache. Returns {count, latest_created_at} per the daemon's
// count endpoint contract.
export async function fetchMemoryCount(filter = {}) {
  const body = JSON.stringify(filter);
  const cmd = `curl -s -X POST http://127.0.0.1:9888/api/memory/count -H 'Content-Type: application/json' -d ${JSON.stringify(body)}`;
  const out = await bashExec(cmd);
  if (!out) return { count: 0, latest_created_at: null };
  try {
    const parsed = JSON.parse(out.stdout || '{}');
    if (parsed.ok && parsed.data) return parsed.data;
    return { count: 0, latest_created_at: null };
  } catch {
    return { count: 0, latest_created_at: null };
  }
}

// Per-day dream-state rollup from the daemon — the single source of
// truth behind the calendar. Returns the endpoint's data payload:
// { today, ttl_days, days: [{date, state, rows, unjudged, past_ttl,
//   harvested_at, remembered_at, judged, promoted, forgotten}] }
// Per-day verb flags: scanned (logs walked) | dreamed (judged, no late rows).
export async function fetchMemoryDays(filter = {}) {
  const body = JSON.stringify(filter);
  const cmd = `curl -s -X POST http://127.0.0.1:9888/api/memory/days -H 'Content-Type: application/json' -d ${JSON.stringify(body)}`;
  const out = await bashExec(cmd);
  if (!out) return null;
  try {
    const parsed = JSON.parse(out.stdout || '{}');
    return parsed.ok && parsed.data ? parsed.data : null;
  } catch {
    return null;
  }
}

// Store-state summary from the daemon — row counts per tier, disk
// footprint, last dream. Same `stats` payload the ling-mem console
// header and the engine's mission report render.
export async function fetchMemoryStats() {
  const cmd = `curl -s -X POST http://127.0.0.1:9888/api/memory/stats -H 'Content-Type: application/json' -d '{}'`;
  const out = await bashExec(cmd);
  if (!out) return null;
  try {
    const parsed = JSON.parse(out.stdout || '{}');
    return parsed.ok && parsed.data ? parsed.data : null;
  } catch {
    return null;
  }
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
