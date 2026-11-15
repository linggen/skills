#!/usr/bin/env node
// build-assets-manifest.mjs — write a skill's assets.json, the manifest of doc/asset-pack-spec.md (engine repo):
// the heavy files a skill does not ship in its package but lets the engine fetch after install.
// General: it names no skill and knows nothing about packs but the one called `core`.
//
//   node scripts/build-assets-manifest.mjs <skill dir> --packs <command | json file> [--base <url>] [--objects <dir>]
//
//   --packs   what each file belongs to: a JSON file, or a shell command (run in the skill dir) that prints JSON —
//             { files: [{ path, pack, order }] } with `path` relative to the skill dir. The skill chooses the
//             pack names and the orders; a skill's tool prints this (lingjing: node tools/art-packs.mjs --json).
//   --base    where the objects will be served from (default https://assets.linggen.dev/a/).
//   --objects a local folder: each listed file is copied to <dir>/<first two hex of sha256>/<sha256>.<ext>, unless it
//             is already there. This is the folder a later, separate step uploads; this tool uploads nothing and
//             makes no network call.
//
// Writes <skill dir>/assets.json: { version: 1, base, files: [{ path, sha256, size, pack, order }] } for every file
// of the packs map whose pack is NOT `core`, sorted by order then path (code-point order), keys in a fixed order,
// two-space indent, a trailing newline, no timestamp — the same input gives the same bytes. A file the packs map
// does not list, or lists as `core`, stays in the package and is not in the manifest.
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE = 'https://assets.linggen.dev/a/';
export const CORE = 'core';

const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/* The packs map from a JSON file or a command's output → [{ path, pack, order }]. */
export function readPacks(spec, skillDir) {
  let text;
  const asFile = path.resolve(process.cwd(), spec);
  if (fs.existsSync(asFile) && fs.statSync(asFile).isFile()) text = fs.readFileSync(asFile, 'utf8');
  else text = execSync(spec, { cwd: skillDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  const doc = JSON.parse(text);
  const files = Array.isArray(doc) ? doc : doc.files;
  if (!Array.isArray(files)) throw new Error('--packs must give { files: [{ path, pack, order }] }');
  return files;
}

function checkPath(skillDir, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.split('/').includes('..')) throw new Error(`bad path in packs: ${JSON.stringify(rel)}`);
  const full = path.join(skillDir, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`packs names a file that is not in the skill: ${rel}`);
  return full;
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/* The manifest object (not yet written). */
export function buildManifest(skillDir, packs, { base = DEFAULT_BASE } = {}) {
  const seen = new Set();
  const files = [];
  for (const p of packs) {
    if (seen.has(p.path)) throw new Error(`packs lists a path twice: ${p.path}`);
    seen.add(p.path);
    if (p.pack === CORE) continue;
    if (typeof p.pack !== 'string' || !p.pack || !Number.isFinite(p.order)) throw new Error(`packs row needs a pack name and a numeric order: ${p.path}`);
    const full = checkPath(skillDir, p.path);
    files.push({ path: p.path, sha256: sha256(full), size: fs.statSync(full).size, pack: p.pack, order: p.order });
  }
  files.sort((a, b) => a.order - b.order || byCode(a.path, b.path));
  return { version: 1, base: base.endsWith('/') ? base : `${base}/`, files };
}

export const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

/* Copy each listed file to <dir>/<aa>/<sha256>.<ext>; returns how many were new. */
export function layOutObjects(skillDir, manifest, dir) {
  let added = 0;
  for (const f of manifest.files) {
    const ext = path.extname(f.path);
    const dest = path.join(dir, f.sha256.slice(0, 2), `${f.sha256}${ext}`);
    if (fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(skillDir, f.path), dest);
    added++;
  }
  return added;
}

function main(argv) {
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const skipValues = new Set(['--packs', '--base', '--objects'].map((n) => argv.indexOf(n) + 1).filter((i) => i > 0));
  const positional = argv.filter((a, i) => !a.startsWith('--') && !skipValues.has(i));
  const skillDir = positional[0] ? path.resolve(positional[0]) : null;
  const spec = val('--packs');
  if (!skillDir || !spec) { process.stderr.write('usage: build-assets-manifest.mjs <skill dir> --packs <command or json file> [--base <url>] [--objects <dir>]\n'); return 2; }
  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) { process.stderr.write(`not a folder: ${skillDir}\n`); return 2; }
  const manifest = buildManifest(skillDir, readPacks(spec, skillDir), { base: val('--base') ?? DEFAULT_BASE });
  fs.writeFileSync(path.join(skillDir, 'assets.json'), manifestText(manifest));
  const bytes = manifest.files.reduce((n, f) => n + f.size, 0);
  process.stderr.write(`assets.json: ${manifest.files.length} files, ${(bytes / 1048576).toFixed(1)} MB\n`);
  if (val('--objects')) process.stderr.write(`objects: ${layOutObjects(skillDir, manifest, path.resolve(val('--objects')))} new in ${val('--objects')}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
