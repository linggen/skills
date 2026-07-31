// bash.js — the one path the DJ page uses to touch the machine: /api/bash.
// Every file read/write, yt-dlp run, and VLC upload goes through here. These
// are USER actions (the user clicked Get / Sync), so they're ungated — the
// agent has no shell or file tools of its own.

// timeoutMs overrides /api/bash's 30s default — pass a generous value for slow
// jobs (yt-dlp downloads, binary fetches, large VLC uploads) or they get killed
// mid-run with "Command timed out".
export async function runBash(command, { cwd = '/tmp', timeoutMs } = {}) {
  const reqBody = { project_root: cwd, command };
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

// Run a library mutation through actions.mjs — the ONE writer (see that file).
// Every page (dj, karaoke, sync) calls this instead of writing library.json;
// the same verbs back the agent's SKILL.md tools.
export async function runAction(verb, ...args) {
  const cmd =
    `bash "$HOME/.linggen/skills/dj/scripts/run-js.sh" ` +
    `"$HOME/.linggen/skills/dj/scripts/actions.mjs" ${verb} ${args.map(sq).join(' ')}`;
  const out = await runBash(cmd, { timeoutMs: 30000 });
  const line = out.trim().split('\n').pop();
  let r;
  try { r = JSON.parse(line); } catch { throw new Error(line || 'action failed'); }
  if (!r.ok) throw new Error(r.error || 'action failed');
  return r;
}

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
  // Create the parent first: writers are free to keep their files in a subdir
  // (the edit register lives in data/), and a bare `>` fails on a missing one.
  await runBash(
    `mkdir -p "$(dirname "${path}")" && printf %s ${sq(b64)} | openssl base64 -A -d > "${path}"`,
  );
}

// Move a file to the macOS Trash (recoverable, supports Finder "Put Back") —
// never a permanent rm, so a deleted song can be restored. Uses Finder via
// osascript; if that's unavailable (automation denied), falls back to moving
// into ~/.Trash. Safe no-op if the file is already gone.
export async function trashFile(file) {
  const osa =
    `osascript -e 'on run {p}' ` +
    `-e 'tell application "Finder" to delete (POSIX file p as alias)' ` +
    `-e 'end run' ${sq(file)}`;
  try {
    await runBash(osa);
  } catch {
    await runBash(`mkdir -p "$HOME/.Trash" && mv -f ${sq(file)} "$HOME/.Trash/" 2>/dev/null || true`);
  }
}
