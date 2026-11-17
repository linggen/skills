#!/usr/bin/env node
// tools/phone-assets.mjs — the phone's asset manifest (doc/asset-pack-spec.md in the engine repo, § The phone): what the
// iPhone app does NOT ship of 灵境 but fetches after install, by content hash, from the same storage as the Mac.
//
// Two kinds of file, both a later chapter's art (tools/art-packs.mjs: a pack named `ch-<chapter>`):
//   - the board kit's art the packs leave out (phone-board.mjs kitPacks `fetched`): the Mac's own bytes, at their skill
//     path (`worlds/jiuding/art/…`, where the board's page and the story screen ask for it);
//   - the places' paintings at phone size (re-encoded by the app's build, tool/lingjing_assets.sh): objects of their own,
//     at `places/<file>` (where the app's stage asks, under its assets/lingjing/).
// The first chapter's and the whole game's (`core`) and the `unplaced` stay in the app: the safe side.
//
//   node tools/phone-assets.mjs --out <app assets/lingjing> --places <folder of the phone-sized paintings>
//                               --stage <scratch folder> [--objects <upload folder>] [--base <url>]
//
// Writes <out>/lingjing-assets.json (the manifest: { version: 1, base, files: [{ path, sha256, size, pack, order }] },
// scripts/build-assets-manifest.mjs's shape and rules), copies the kept paintings into <out>/places/ (and removes any
// other painting there), and with --objects lays the fetched files out as <dir>/<aa>/<sha256>.<ext> — the set
// scripts/publish-assets.mjs uploads (after the owner's yes). It uploads nothing and makes no network call.
// The manifest and the upload set come from the same run: a painting re-encoded by another cwebp is another object.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, layOutObjects, manifestText, DEFAULT_BASE } from '../../scripts/build-assets-manifest.mjs';
import { buildArtPacks } from './art-packs.mjs';
import { kitPacks } from './phone-board.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, '..');
const WORLD = 'worlds/jiuding';
export const MANIFEST = 'lingjing-assets.json';

/** Code is never fetched (App Store rule): a manifest row with a code file's extension is a bug. */
export const CODE = /\.(?:m?js|wasm|html?|css)$/i;

/** The places' paintings, by phone path (`places/<file>`) → the source's skill path (backdrops.json `places`, day and night;
    the same table tool/lingjing_assets.sh re-encodes). */
export function placePaintings(skill = SKILL) {
  const table = JSON.parse(fs.readFileSync(path.join(skill, WORLD, 'backdrops.json'), 'utf8')).places ?? {};
  const out = new Map();
  for (const e of Object.values(table)) for (const src of [e.day, e.night]) if (src) out.set(`places/${path.basename(src)}`, `${WORLD}/${src}`);
  return out;
}

/** What the phone fetches: [{ path, pack, order, from }] — `from` the file the bytes come from. `placesDir` holds the
    phone-sized paintings by file name. Also `kept`: the phone paths of the paintings the app ships. */
export function phoneFetched({ placesDir, skill = SKILL } = {}) {
  const packOf = new Map(buildArtPacks(skill).files.map((f) => [f.path, f]));
  const rows = kitPacks().fetched.map((f) => ({ path: f.path, pack: f.pack, order: f.order, from: path.join(skill, f.path) }));
  const kept = [];
  for (const [phone, src] of placePaintings(skill)) {
    const p = packOf.get(src);
    if (p?.pack.startsWith('ch-')) rows.push({ path: phone, pack: p.pack, order: p.order, from: path.join(placesDir, path.basename(phone)) });
    else kept.push(phone);
  }
  for (const r of rows) if (CODE.test(r.path)) throw new Error(`code is never fetched: ${r.path}`);
  return { rows, kept };
}

export function main(argv) {
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const out = val('--out'), placesDir = val('--places'), stage = val('--stage');
  if (!out || !placesDir || !stage) { process.stderr.write('usage: phone-assets.mjs --out <dir> --places <dir> --stage <dir> [--objects <dir>] [--base <url>]\n'); return 2; }
  const { rows, kept } = phoneFetched({ placesDir: path.resolve(placesDir) });
  // The stage: every fetched file at its manifest path, so the manifest builder reads it as a skill folder.
  fs.rmSync(stage, { recursive: true, force: true });
  for (const r of rows) {
    const dst = path.join(stage, r.path);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(r.from, dst);
  }
  const manifest = buildManifest(path.resolve(stage), rows.map(({ path: p, pack, order }) => ({ path: p, pack, order })), { base: val('--base') ?? DEFAULT_BASE });
  fs.writeFileSync(path.join(out, MANIFEST), manifestText(manifest));
  // The app's own paintings: exactly the kept ones.
  const placesOut = path.join(out, 'places');
  fs.mkdirSync(placesOut, { recursive: true });
  const keep = new Set(kept.map((p) => path.basename(p)));
  for (const f of fs.readdirSync(placesOut)) if (!keep.has(f)) fs.rmSync(path.join(placesOut, f));
  for (const f of keep) {
    const src = path.join(placesDir, f), dst = path.join(placesOut, f);
    if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(src).mtimeMs) fs.copyFileSync(src, dst);
  }
  const mb = (n) => (n / 1e6).toFixed(1);
  const bytes = manifest.files.reduce((n, f) => n + f.size, 0);
  process.stderr.write(`${MANIFEST}: ${manifest.files.length} files fetched after install, ${mb(bytes)} MB; ${keep.size} paintings kept in the app\n`);
  if (val('--objects')) process.stderr.write(`objects: ${layOutObjects(path.resolve(stage), manifest, path.resolve(val('--objects')))} new in ${val('--objects')}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
