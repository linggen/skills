// shims/fs.mjs — `node:fs` for the phone bundle: an in-memory file system. The rules engine reads the world's
// JSON and keeps the save (state.json, log.jsonl, saves/…) through fs; on the phone there is no Node, so the same
// calls land here. Text files only (the engine writes and reads utf8). `dump()` / `restore()` are how the host keeps
// the player's files between runs; the world's own files are put in with `seed()` and never dumped.
const files = new Map(); // absolute path → text
const world = new Set(); // paths put in by seed(): the shipped content
const dirs = new Set(['/']);
const mtimes = new Map();

const clean = (p) => {
  const out = [];
  for (const part of String(p).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return `/${out.join('/')}`;
};
const parent = (p) => clean(`${p}/..`);
const fail = (code, op, p) => Object.assign(new Error(`${code}: ${op} '${p}'`), { code, errno: code === 'ENOENT' ? -2 : -17, syscall: op, path: String(p) });
const touch = (p) => mtimes.set(p, Date.now());
const mkdirs = (p) => { for (let d = clean(p); d !== '/' && !dirs.has(d); d = parent(d)) dirs.add(d); };

const stat = (p) => {
  const f = clean(p);
  if (files.has(f)) return { isFile: () => true, isDirectory: () => false, size: files.get(f).length, mtimeMs: mtimes.get(f) ?? 0, mtime: new Date(mtimes.get(f) ?? 0) };
  if (dirs.has(f)) return { isFile: () => false, isDirectory: () => true, size: 0, mtimeMs: 0, mtime: new Date(0) };
  throw fail('ENOENT', 'stat', p);
};

const fs = {
  existsSync: (p) => { const f = clean(p); return files.has(f) || dirs.has(f); },
  readFileSync(p) {
    const f = clean(p);
    if (!files.has(f)) throw fail('ENOENT', 'open', p);
    return files.get(f);
  },
  writeFileSync(p, text) {
    const f = clean(p);
    if (dirs.has(f)) throw fail('EISDIR', 'open', p);
    mkdirs(parent(f));
    files.set(f, String(text));
    touch(f);
  },
  appendFileSync(p, text) { const f = clean(p); fs.writeFileSync(f, (files.get(f) ?? '') + String(text)); },
  mkdirSync(p) { mkdirs(p); },
  readdirSync(p) {
    const d = clean(p);
    if (!dirs.has(d)) throw fail('ENOENT', 'scandir', p);
    const names = new Set();
    for (const f of [...files.keys(), ...dirs]) if (f !== d && parent(f) === d) names.add(f.slice(d === '/' ? 1 : d.length + 1));
    return [...names].sort();
  },
  rmSync(p, { recursive = false, force = false } = {}) {
    const f = clean(p), under = `${f}/`;
    if (!files.has(f) && !dirs.has(f)) { if (force) return; throw fail('ENOENT', 'rm', p); }
    files.delete(f);
    if (recursive) {
      for (const k of [...files.keys()]) if (k.startsWith(under)) files.delete(k);
      for (const k of [...dirs]) if (k === f || k.startsWith(under)) dirs.delete(k);
    } else dirs.delete(f);
  },
  unlinkSync(p) { const f = clean(p); if (!files.delete(f)) throw fail('ENOENT', 'unlink', p); },
  renameSync(from, to) {
    const a = clean(from), b = clean(to);
    if (!files.has(a)) throw fail('ENOENT', 'rename', from);
    mkdirs(parent(b));
    files.set(b, files.get(a));
    files.delete(a);
    touch(b);
  },
  copyFileSync(from, to) { fs.writeFileSync(to, fs.readFileSync(from)); },
  statSync: stat,
  realpathSync: (p) => clean(p),
  // The lock file (rules/files.mjs): an exclusive create, then the pid written to the descriptor.
  openSync(p, flags = 'r') {
    const f = clean(p);
    if (String(flags).includes('x') && files.has(f)) throw fail('EEXIST', 'open', p);
    if (!files.has(f)) { mkdirs(parent(f)); files.set(f, ''); touch(f); }
    return { file: f };
  },
  writeSync(fd, text) { files.set(fd.file, files.get(fd.file) + String(text)); return String(text).length; },
  closeSync() {},
};

/** Put the world's shipped files in: { path: text }. They are never part of a dump. */
export function seed(map) {
  for (const [p, text] of Object.entries(map)) { const f = clean(p); mkdirs(parent(f)); files.set(f, text); world.add(f); }
}
/** The player's files under `root`, as { path: text } — what the host keeps. */
export function dump(root) {
  const out = {}, under = `${clean(root)}/`;
  for (const [f, text] of files) if (f.startsWith(under) && !world.has(f) && !f.endsWith('.lock')) out[f] = text;
  return out;
}
/** Put a dump back (the host's kept files). */
export function restore(map) { for (const [p, text] of Object.entries(map)) fs.writeFileSync(p, text); }
/** Every path read since the last call (a build check: the walk reads only what the bundle carries). */
export const stats = () => ({ files: files.size, bytes: [...files.values()].reduce((n, t) => n + t.length, 0) });

export default fs;
export const { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, rmSync, unlinkSync, renameSync, copyFileSync, statSync, realpathSync, openSync, writeSync, closeSync } = fs;
