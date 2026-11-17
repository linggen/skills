// tests/phone-assets.test.mjs — the phone's asset manifest (tools/phone-assets.mjs): every later chapter's file the app does
// not ship, in exactly one place (the app or the manifest), by content hash, never code; and the run on a fixture of the
// places' paintings writes the manifest, the kept paintings and the upload set together.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE, MANIFEST, main, phoneFetched, placePaintings } from '../tools/phone-assets.mjs';
import { kitPacks } from '../tools/phone-board.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-assets-'));
const placesDir = path.join(tmp, 'places-src');
fs.mkdirSync(placesDir);
// Stand-ins for the phone-sized paintings (the app's build re-encodes them with cwebp): distinct bytes per file.
for (const phone of placePaintings().keys()) fs.writeFileSync(path.join(placesDir, path.basename(phone)), `painting ${phone}`);

test('every place painting is either kept in the app or fetched, never both; the first chapter\'s stay', () => {
  const { rows, kept } = phoneFetched({ placesDir });
  const fetched = new Set(rows.filter((r) => r.path.startsWith('places/')).map((r) => r.path));
  const all = [...placePaintings().keys()];
  for (const p of all) assert.ok(fetched.has(p) !== kept.includes(p), p);
  assert.ok(kept.length > 20 && fetched.size > 20, `${kept.length} kept, ${fetched.size} fetched`);
  // 蒙山 (the prologue's) stays in the app.
  assert.ok(kept.includes('places/mengshan.webp'), 'the first chapter\'s mountain');
});

test('never code, and no path the packs hold', () => {
  const { rows } = phoneFetched({ placesDir });
  const { common, games } = kitPacks();
  const packed = new Set([...common, ...Object.values(games).flat()]);
  for (const r of rows) {
    assert.ok(!CODE.test(r.path), r.path);
    assert.ok(!packed.has(r.path), `${r.path} is in a pack and in the manifest`);
    assert.ok(r.pack.startsWith('ch-') && r.order >= 10, `${r.path} ${r.pack}`);
  }
  assert.equal(new Set(rows.map((r) => r.path)).size, rows.length, 'a path listed once');
});

test('a run writes the manifest, the kept paintings and the upload set, each object named by its hash', () => {
  const out = path.join(tmp, 'out'), objects = path.join(tmp, 'objects');
  fs.mkdirSync(path.join(out, 'places'), { recursive: true });
  fs.writeFileSync(path.join(out, 'places', 'stale.webp'), 'an earlier run\'s');
  assert.equal(main(['--out', out, '--places', placesDir, '--stage', path.join(tmp, 'stage'), '--objects', objects]), 0);
  const m = JSON.parse(fs.readFileSync(path.join(out, MANIFEST), 'utf8'));
  assert.equal(m.version, 1);
  assert.equal(m.base, 'https://assets.linggen.dev/a/');
  const kept = new Set(fs.readdirSync(path.join(out, 'places')));
  assert.ok(!kept.has('stale.webp'), 'a painting no longer kept goes');
  for (const f of m.files) {
    assert.deepEqual(Object.keys(f), ['path', 'sha256', 'size', 'pack', 'order']);
    if (f.path.startsWith('places/')) assert.ok(!kept.has(path.basename(f.path)), `${f.path} fetched and kept`);
    const obj = path.join(objects, f.sha256.slice(0, 2), `${f.sha256}${path.extname(f.path)}`);
    const bytes = fs.readFileSync(obj);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), f.sha256, f.path);
    assert.equal(bytes.length, f.size);
  }
  assert.ok(m.files.some((f) => f.path.startsWith('worlds/jiuding/art/')) && m.files.some((f) => f.path.startsWith('places/')));
  // The board kit's art is the Mac's own bytes: the same object the Mac fetches.
  const mac = new Map(JSON.parse(fs.readFileSync(path.join(SKILL, 'assets.json'), 'utf8')).files.map((f) => [f.path, f.sha256]));
  for (const f of m.files) if (mac.has(f.path)) assert.equal(f.sha256, mac.get(f.path), f.path);
});
