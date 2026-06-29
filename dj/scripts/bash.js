// bash.js — the one path the DJ page uses to touch the machine: /api/bash.
// Every file read/write, yt-dlp run, and VLC upload goes through here. These
// are USER actions (the user clicked Get / Sync), so they're ungated — the
// agent has no shell or file tools of its own.

export async function runBash(command, { cwd = '/tmp' } = {}) {
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: cwd, command }),
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

// The real home dir, resolved once. Lets us turn a config path like
// "~/Music/DJ" into a concrete absolute path that's safe to single-quote
// (single-quoting "$HOME/..." would block expansion).
let _home = null;
export async function home() {
  if (_home === null) _home = (await runBash('printf %s "$HOME"')).trim();
  return _home;
}

// Resolve a leading ~ to the real home dir → absolute path, safe to single-quote.
export async function resolvePath(p) {
  const h = await home();
  return String(p).replace(/^~(?=\/|$)/, h);
}

// Write arbitrary (UTF-8) text to a path, base64-routed so titles in any
// language and any quoting survive intact. openssl is always present on macOS.
export async function writeFile(path, content) {
  const b64 = btoa(unescape(encodeURIComponent(content)));
  await runBash(`printf %s ${sq(b64)} | openssl base64 -A -d > "${path}"`);
}
