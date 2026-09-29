// rules.js — the page's one door to the game. It never writes a file: every
// read and every write is a verb on rules.mjs, the same writer Ling's tools
// use, so the scene and the chat can never disagree.

/// A scratch save for live checks (`?save=test`): every verb carries
/// `--save=<name>` and the rules play data/saves/<name>/ — never the player's
/// own save. The page in this mode never opens Ling's chat (lingjing.js).
export const SCRATCH = (() => {
  try {
    const name = new URLSearchParams(globalThis.location?.search ?? '').get('save');
    return name && /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(name) ? name : null;
  } catch {
    return null;
  }
})();
/// The flags a verb is sent with: its own, then the scratch save's.
export const flagsOf = (args, scratch = SCRATCH) => [...Object.entries(args).map(([k, v]) => `--${k}=${v}`), ...(scratch ? [`--save=${scratch}`] : [])];

/// One verb: `verb('win', { id: 'alchemy-first' })`. Prints one JSON object;
/// a refusal comes back as `{ok: false, refused}` rather than a throw. Runs
/// through the skill's declared page tool (`Verb` in SKILL.md): the engine
/// knows what may run, one move at a time.
export async function verb(name, args = {}) {
  const flags = flagsOf(args);
  const res = await fetch('/api/skills/lingjing/tools/Verb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verb: name, flags }),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `${name} ${res.status}`);
  const out = await res.json();
  const line = (out.stdout || '').trim().split('\n').pop();
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(line || out.stderr || `${name} said nothing`);
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
