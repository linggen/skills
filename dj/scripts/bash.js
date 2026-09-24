// bash.js — the one path the DJ pages use to touch the machine: /api/bash.
// These are USER actions (the user clicked something), so they're ungated.
//
// Quoting rule: anything derived from a name — a song, a path, a title — goes
// through sq(). Only fixed paths built from the DJ_DIR / SCRIPTS constants sit
// in double quotes, because they carry a literal $HOME the shell must expand.

export const DJ_DIR = '$HOME/.linggen/skills/dj';
export const SCRIPTS = `${DJ_DIR}/scripts`;
export const PY = '"${LINGGEN_PY:-python3}"';

// /api/bash joins its own wrapper on with `;`, so a command must not end in a
// newline or a bare `&` — trimmed here, once, for every caller.
export async function runBash(command, { cwd = '/tmp', timeoutMs } = {}) {
  const reqBody = { project_root: cwd, command: String(command).trim() };
  if (timeoutMs) reqBody.timeout_ms = timeoutMs;
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  if (body.exit_code && body.exit_code !== 0) {
    throw new Error(body.stderr?.trim() || `bash exit ${body.exit_code}`);
  }
  return body.stdout || '';
}

// Single-quote a value for safe interpolation into a bash command.
export const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/// The last line of a command's output, parsed.
export const lastJson = (out) => {
  const line = String(out || '').trim().split('\n').filter(Boolean).pop() || '{}';
  try { return JSON.parse(line); } catch { return { ok: false, error: line }; }
};

// Run a library mutation through actions.mjs — the ONE writer. The same verbs
// back the agent's SKILL.md tools.
export async function runAction(verb, ...args) {
  const cmd = `bash "${SCRIPTS}/run-js.sh" "${SCRIPTS}/actions.mjs" ${verb} ${args.map(sq).join(' ')}`;
  const r = lastJson(await runBash(cmd, { timeoutMs: 30000 }));
  if (!r.ok) throw new Error(r.error || 'action failed');
  return r;
}

/// A python script from this skill, with its args single-quoted.
export async function runPy(script, args, timeoutMs) {
  return lastJson(await runBash(`${PY} "${SCRIPTS}/${script}" ${args.map(sq).join(' ')}`, { timeoutMs }));
}

// The real home dir, resolved once, so a config path like "~/Music/DJ" becomes
// an absolute path that is safe to single-quote.
let _home = null;
export async function home() {
  if (_home === null) _home = (await runBash('printf %s "$HOME"')).trim();
  return _home;
}

export async function resolvePath(p) {
  const h = await home();
  return String(p).replace(/^~(?=\/|$)/, h).replace(/^\$HOME(?=\/|$)/, h);
}

// Write UTF-8 text to an absolute path, base64-routed so titles in any
// language and any quoting survive intact.
export async function writeFile(path, content) {
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const p = sq(await resolvePath(path));
  await runBash(`mkdir -p "$(dirname ${p})" && printf %s ${sq(b64)} | openssl base64 -A -d > ${p}`);
}

/// Which of these paths exist, in one round trip.
export async function filesOnDisk(paths) {
  const list = [...new Set((paths || []).filter(Boolean))];
  if (!list.length) return new Set();
  const out = await runBash(`for p in ${list.map(sq).join(' ')}; do [ -f "$p" ] && printf '%s\\n' "$p"; done; true`)
    .catch(() => '');
  return new Set(String(out).split('\n').filter(Boolean));
}

/// Put a file where the daemon serves it: a hard link when it is the same
/// volume (instant, no copy of a whole song), a copy when it isn't. `dst` is a
/// fixed served path the caller owns.
export const serveCopyCmd = (src, dst) => `ln -f ${sq(src)} "${dst}" 2>/dev/null || cp ${sq(src)} "${dst}"`;

/// The ffmpeg this machine has — the same search bin-setup.sh makes, since
/// the daemon's PATH is minimal when launched from the app.
export const FFMPEG_SH =
  'FF=""; for f in "$(command -v ffmpeg 2>/dev/null)" "$HOME/.linggen/bin/ffmpeg" /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg; ' +
  'do if [ -n "$f" ] && [ -x "$f" ]; then FF="$f"; break; fi; done';
