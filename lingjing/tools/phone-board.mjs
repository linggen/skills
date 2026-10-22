#!/usr/bin/env node
// tools/phone-board.mjs — the files a board needs to play in the phone app's local webview, and nothing else.
// tools/phone/board-kit.json names them (the host page, the game's own folder, the shared sound kit, the level and
// creature tables, Phaser); the JS they import is found by walking the static imports. The result mirrors the skill's
// own paths, and is written as ONE pack the app ships as a single asset (`board.pack`):
//
//   [u32 big-endian: manifest length][manifest JSON { "/scripts/…": [offset, length] }][file bytes …]   offsets from the end of the manifest
//
// The app serves the pack's files from memory on 127.0.0.1 (in-process, for the webview only: no network leaves the
// phone, and nothing here touches the Mac). Usage: node tools/phone-board.mjs [--game shouqiang] [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const KIT = JSON.parse(fs.readFileSync(path.join(HERE, 'phone/board-kit.json'), 'utf8'));

const rel = (file) => path.relative(SKILL, file).split(path.sep).join('/');
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g;

/** The files a JS file imports statically, relative specifiers resolved. */
export function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(STATIC_IMPORT)].map((m) => path.resolve(path.dirname(file), m[1] ?? m[2]));
}

/** `file` and everything it imports (statically), as skill-relative paths. */
export function closure(entry, seen = new Set()) {
  const file = path.resolve(SKILL, entry);
  if (seen.has(file)) return seen;
  if (!fs.existsSync(file)) throw new Error(`${entry} is not in the skill`);
  seen.add(file);
  if (/\.(m?js)$/.test(file)) for (const dep of importsOf(file)) closure(rel(dep), seen);
  return seen;
}

const filesUnder = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));

/** Every file `game` needs, as sorted skill-relative paths. */
export function boardFiles(game = 'shouqiang') {
  const g = KIT.games[game];
  if (!g) throw new Error(`no board kit for ${game}`);
  const all = new Set();
  for (const e of [...KIT.entry, g.module]) for (const f of closure(e)) all.add(f);
  for (const d of g.dirs) for (const f of filesUnder(path.join(SKILL, d))) all.add(f);
  for (const f of g.exclude ?? []) all.delete(path.join(SKILL, f));
  for (const f of [...KIT.shared, ...g.files]) {
    const file = path.join(SKILL, f);
    if (!fs.existsSync(file)) throw new Error(`${f} is not in the skill`);
    all.add(file);
  }
  return [...all].map(rel).sort();
}

/** The pack's bytes for `files`, and its manifest (offsets are from the end of the manifest). */
export function packOf(files) {
  const bodies = files.map((f) => fs.readFileSync(path.join(SKILL, f)));
  const manifest = {};
  let at = 0;
  files.forEach((f, i) => { manifest[`/${f}`] = [at, bodies[i].length]; at += bodies[i].length; });
  const json = Buffer.from(JSON.stringify(manifest));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(json.length);
  return { pack: Buffer.concat([len, json, ...bodies]), manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const game = arg('--game', 'shouqiang'), out = path.resolve(arg('--out', 'phone-board'));
  const files = boardFiles(game);
  const { pack } = packOf(files);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'board.pack'), pack);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(SKILL, f)).size, 0);
  console.log(`${game}: ${files.length} files, ${bytes} B → ${path.join(out, 'board.pack')} (${pack.length} B)`);
}
