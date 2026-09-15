// rules.js — the page's one door to the game. It never writes a file: every
// read and every write is a verb on rules.mjs, the same writer Ling's tools
// use, so the scene and the chat can never disagree.

const SCRIPTS = '"$HOME/.linggen/skills/lingjing/scripts';

// Single-quote a value. Never used on a path holding `$HOME` — single quotes
// kill the expansion.
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

async function runBash(command) {
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command, timeout_ms: 15000 }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const out = await res.json();
  return out.stdout || '';
}

/// One verb: `verb('win', { id: 'alchemy-first' })`. Prints one JSON object;
/// a refusal comes back as `{ok: false, refused}` rather than a throw.
export async function verb(name, args = {}) {
  const flags = Object.entries(args).map(([k, v]) => sq(`--${k}=${v}`)).join(' ');
  const cmd = `bash ${SCRIPTS}/run-js.sh" ${SCRIPTS}/rules.mjs" ${name} ${flags}`;
  const line = (await runBash(cmd)).trim().split('\n').pop();
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(line || `${name} said nothing`);
  }
}

/// A world's folder, relative to the page: art and content live there.
/// `dir` is what Look's `world.dir` says — `worlds/<id>` for a shipped
/// world, `data/worlds/<id>` for one the player made.
export const worldPath = (dir, file) => `../${dir.split('/').map(encodeURIComponent).join('/')}/${file}`;

/// A world's content file, read straight off the skill folder the engine
/// serves.
export async function content(dir, file) {
  const res = await fetch(worldPath(dir, file));
  if (!res.ok) throw new Error(`${dir}/${file} ${res.status}`);
  return res.json();
}
