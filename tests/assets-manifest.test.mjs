// scripts/build-assets-manifest.mjs, run on a small fixture skill in a temp dir: the manifest lists only the
// files that are not `core`, the hashes are the files', two runs write the same bytes, --objects lays files
// out by hash and skips what is there, and a packs map naming a file that is not there refuses.
//
//   node --test tests/assets-manifest.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-assets-manifest.mjs');
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const FILES = {
  'art/a/near.webp': 'near picture',
  'art/a/far.webp': 'far picture',
  'art/b/second.png': 'second chapter',
  'art/b/same.png': 'second chapter', // same bytes as the one above: one object
  'art/c/stay.webp': 'stays in the package',
  'art/c/unlisted.webp': 'not in the packs map at all',
};
const PACKS = [
  { path: 'art/b/second.png', pack: 'ch02', order: 20 },
  { path: 'art/a/near.webp', pack: 'ch01', order: 10 },
  { path: 'art/c/stay.webp', pack: 'core', order: 0 },
  { path: 'art/b/same.png', pack: 'ch02', order: 20 },
  { path: 'art/a/far.webp', pack: 'ch01', order: 10 },
];

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-manifest-'));
  TMP.push(dir);
  const skill = path.join(dir, 'skill');
  for (const [rel, text] of Object.entries(FILES)) { const p = path.join(skill, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
  const packs = path.join(dir, 'packs.json');
  fs.writeFileSync(packs, JSON.stringify({ files: PACKS }));
  return { dir, skill, packs };
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('the manifest lists only the files that are not core, sorted by order then path, with the right hashes', () => {
  const { skill, packs } = fixture();
  const r = run(skill, '--packs', packs);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(skill, 'assets.json'), 'utf8'));
  assert.deepEqual(Object.keys(m), ['version', 'base', 'files']);
  assert.equal(m.version, 1);
  assert.equal(m.base, 'https://assets.linggen.dev/a/');
  assert.deepEqual(m.files.map((f) => f.path), ['art/a/far.webp', 'art/a/near.webp', 'art/b/same.png', 'art/b/second.png']);
  for (const f of m.files) {
    assert.deepEqual(Object.keys(f), ['path', 'sha256', 'size', 'pack', 'order']);
    assert.equal(f.sha256, sha(FILES[f.path]));
    assert.equal(f.size, Buffer.byteLength(FILES[f.path]));
  }
  assert.deepEqual(m.files.map((f) => [f.pack, f.order]), [['ch01', 10], ['ch01', 10], ['ch02', 20], ['ch02', 20]]);
  assert.ok(!m.files.some((f) => /stay|unlisted/.test(f.path)), 'core and unlisted files stay in the package');
});

test('--base is used, with a closing slash', () => {
  const { skill, packs } = fixture();
  assert.equal(run(skill, '--packs', packs, '--base', 'https://example.test/x').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(skill, 'assets.json'), 'utf8')).base, 'https://example.test/x/');
});

test('two runs write byte-identical files, whatever order the packs map comes in', () => {
  const { dir, skill, packs } = fixture();
  assert.equal(run(skill, '--packs', packs).status, 0);
  const first = fs.readFileSync(path.join(skill, 'assets.json'));
  fs.writeFileSync(packs, JSON.stringify({ files: [...PACKS].reverse() }));
  assert.equal(run(skill, '--packs', packs).status, 0);
  assert.ok(first.equals(fs.readFileSync(path.join(skill, 'assets.json'))));
  assert.equal(first.at(-1), 0x0a, 'ends with a newline');
  assert.ok(!/\d{4}-\d\d-\d\dT/.test(first.toString()), 'no timestamp');
  void dir;
});

test('--packs may be a command, run in the skill folder', () => {
  const { skill } = fixture();
  fs.writeFileSync(path.join(skill, 'packs.mjs'), `process.stdout.write(JSON.stringify({ files: ${JSON.stringify(PACKS)} }));\n`);
  const r = run(skill, '--packs', 'node packs.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(skill, 'assets.json'), 'utf8')).files.length, 4);
});

test('--objects lays each file out by hash, skips what is there, and the same bytes are one object', () => {
  const { dir, skill, packs } = fixture();
  const out = path.join(dir, 'objects');
  assert.equal(run(skill, '--packs', packs, '--objects', out).status, 0);
  const near = sha(FILES['art/a/near.webp']);
  assert.equal(fs.readFileSync(path.join(out, near.slice(0, 2), `${near}.webp`), 'utf8'), FILES['art/a/near.webp']);
  const two = sha(FILES['art/b/second.png']);
  assert.ok(fs.existsSync(path.join(out, two.slice(0, 2), `${two}.png`)));
  const all = fs.readdirSync(out).flatMap((d) => fs.readdirSync(path.join(out, d)));
  assert.equal(all.length, 3, 'far, near and the one object of the two identical pngs');
  const mtime = fs.statSync(path.join(out, near.slice(0, 2), `${near}.webp`)).mtimeMs;
  const r = run(skill, '--packs', packs, '--objects', out);
  assert.match(r.stderr, /objects: 0 new/);
  assert.equal(fs.statSync(path.join(out, near.slice(0, 2), `${near}.webp`)).mtimeMs, mtime);
});

test('a packs map naming a missing file, an escaping path or a twice-listed path refuses and writes nothing', () => {
  const { skill, packs } = fixture();
  for (const bad of [
    [{ path: 'art/gone.webp', pack: 'ch01', order: 10 }],
    [{ path: '../outside.webp', pack: 'ch01', order: 10 }],
    [{ path: 'art/a/near.webp', pack: 'ch01', order: 10 }, { path: 'art/a/near.webp', pack: 'ch02', order: 20 }],
  ]) {
    fs.writeFileSync(packs, JSON.stringify({ files: bad }));
    const r = run(skill, '--packs', packs);
    assert.notEqual(r.status, 0);
    assert.ok(!fs.existsSync(path.join(skill, 'assets.json')));
  }
});
