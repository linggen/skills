// bash.js — the one path the Health page uses to touch the machine.
//
// The page never writes a file itself. Every read and every write goes through
// `ingest.mjs`, the same one writer the phone's sync and the agent's tools use,
// so a button and a tool call can never drift.

export async function runBash(command, { cwd = '/tmp', timeoutMs } = {}) {
  const body = { project_root: cwd, command };
  if (timeoutMs) body.timeout_ms = timeoutMs;
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const out = await res.json();
  if (out.exit_code && out.exit_code !== 0) {
    throw new Error(out.stderr?.trim() || `bash exit ${out.exit_code}`);
  }
  return out.stdout || '';
}

// Single-quote a value for safe interpolation. Never used on a path holding
// `$HOME` — single quotes kill the expansion, and the command then writes to a
// folder literally named `$HOME` under the shell's cwd.
export const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const SCRIPTS = '"$HOME/.linggen/skills/health/scripts';

/// One verb on the writer. Its last stdout line is always one JSON object.
export async function verb(name, ...args) {
  const cmd =
    `bash ${SCRIPTS}/run-js.sh" ${SCRIPTS}/ingest.mjs" ` +
    `${name} ${args.map(sq).join(' ')}`;
  const out = await runBash(cmd, { timeoutMs: 30000 });
  const line = out.trim().split('\n').pop();
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    throw new Error(line || `${name} said nothing`);
  }
  if (!r.ok) throw new Error(r.error || `${name} failed`);
  return r;
}
