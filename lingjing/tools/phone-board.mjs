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

/** A 大场面's paintings: the `'art/…'` strings its module names, under the world. */
export const pieceArt = (module) => [...fs.readFileSync(path.join(SKILL, module), 'utf8').matchAll(/'(art\/[^']+\.webp)'/g)].map((m) => `worlds/jiuding/${m[1]}`);

/** Every card's and every creature's art (the fight room's: a hand grows across the story), as the tables name it. */
export function fightArt() {
  const rows = ['cards.json', 'creatures.json'].flatMap((t) => { const d = JSON.parse(fs.readFileSync(path.join(SKILL, 'worlds/jiuding', t), 'utf8')); return d.cards ?? d.creatures ?? []; });
  return [...new Set(rows.map((r) => r.art).filter((a) => typeof a === 'string' && fs.existsSync(path.join(SKILL, 'worlds/jiuding', a))).map((a) => `worlds/jiuding/${a}`))];
}

/** The story screen's own files (faces, the pouch's things): `story`, and every file under `storyDirs`. */
export const storyFiles = () => [...(KIT.story ?? []), ...(KIT.storyDirs ?? []).flatMap((d) => filesUnder(path.join(SKILL, d)).map(rel))];

/** Every file `game` needs, as sorted skill-relative paths. */
export function boardFiles(game = 'shouqiang') {
  const g = KIT.games[game];
  if (!g) throw new Error(`no board kit for ${game}`);
  const all = new Set();
  for (const e of [...KIT.entry, g.module, ...(g.modules ?? [])]) for (const f of closure(e)) all.add(f);
  for (const d of g.dirs ?? []) for (const f of filesUnder(path.join(SKILL, d))) all.add(f);
  if (g.art === 'auto') for (const f of pieceArt(g.module)) all.add(path.join(SKILL, f));
  if (g.art === 'cards') for (const f of fightArt()) all.add(path.join(SKILL, f));
  for (const f of g.exclude ?? []) all.delete(path.join(SKILL, f));
  for (const f of [...KIT.shared, ...(g.css ?? []), ...(g.files ?? [])]) {
    const file = path.join(SKILL, f);
    if (!fs.existsSync(file)) throw new Error(`${f} is not in the skill`);
    all.add(file);
  }
  return [...all].map(rel).sort();
}

/** The boards of the kit. */
export const kitGames = () => Object.keys(KIT.games);

/** The host page's table (scripts/games/phone/boards.json): each board's pack and the sheets it links (skill-relative). */
export function boardsTable() {
  return { games: Object.fromEntries(kitGames().map((id) => [id, { pack: `board-${id}.pack`, css: KIT.games[id].css ?? [], ...(KIT.games[id].piece ? { piece: KIT.games[id].piece } : {}), ...(KIT.games[id].ai ? { ai: true } : {}) }])) };
}
export const BOARDS_JSON = 'scripts/games/phone/boards.json';

/** Every board as packs: `common` — the entry, the shared files and whatever two or more boards need — and each
    board's own rest. A file is in exactly one pack. */
export function kitPacks(games = kitGames()) {
  const need = new Map();
  for (const id of games) for (const f of boardFiles(id)) need.set(f, (need.get(f) ?? 0) + 1);
  const base = new Set([...KIT.entry.flatMap((e) => [...closure(e)].map(rel)), ...KIT.shared]);
  const story = new Set(storyFiles());
  for (const f of story) {
    if (!fs.existsSync(path.join(SKILL, f))) throw new Error(`${f} is not in the skill`);
    need.set(f, need.get(f) ?? 0);
  }
  const common = [...need.keys()].filter((f) => base.has(f) || need.get(f) > 1 || story.has(f)).sort();
  const inCommon = new Set(common);
  return { common, games: Object.fromEntries(games.map((id) => [id, boardFiles(id).filter((f) => !inCommon.has(f))])) };
}

/** The pack's bytes for `files`, and its manifest (offsets are from the end of the manifest). */
export function packOf(files, extra = {}) {
  const bodies = files.map((f) => (Object.hasOwn(extra, f) ? Buffer.from(extra[f]) : fs.readFileSync(path.join(SKILL, f))));
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
  if (process.argv.includes('--all')) {
    const packs = kitPacks(), table = boardsTable();
    fs.mkdirSync(out, { recursive: true });
    const write = (name, files, extra) => {
      const { pack } = packOf(files, extra);
      fs.writeFileSync(path.join(out, name), pack);
      console.log(`${name}: ${files.length} files, ${pack.length} B`);
    };
    const json = `${JSON.stringify(table)}\n`;
    write('board-common.pack', [...packs.common, BOARDS_JSON].sort(), { [BOARDS_JSON]: json });
    for (const [id, files] of Object.entries(packs.games)) write(table.games[id].pack, files);
    fs.writeFileSync(path.join(out, 'boards.json'), json);
    fs.rmSync(path.join(out, 'board.pack'), { force: true }); // step 0's one pack, replaced
    process.exit(0);
  }
  const files = boardFiles(game);
  const { pack } = packOf(files);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'board.pack'), pack);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(SKILL, f)).size, 0);
  console.log(`${game}: ${files.length} files, ${bytes} B → ${path.join(out, 'board.pack')} (${pack.length} B)`);
}
