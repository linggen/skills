// scripts/publish-assets.mjs, run on a temp objects folder with a fake `head` and a fake `run` (the Cloudflare CLI):
// the plan for present / missing / conflict / error, the dry run uploads nothing, --yes runs the CLI once per missing
// object with exactly the expected arguments and folder, a bad name or hash refuses everything, a prefix that
// disagrees with the base refuses, a failed upload gives a non-zero exit while the others still go, and a second
// run is a no-op. Nothing here touches the network or runs a real wrangler.
//
//   node --test tests/publish-assets.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  main, buildPlan, listObjects, wranglerArgs, contentType, nameProblem, prefixOfBase, objectKey, objectUrl,
  DEFAULT_BASE, DEFAULT_WRANGLER_CWD, CACHE_CONTROL,
} from '../scripts/publish-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const BODIES = { webp: 'near picture', png: 'second chapter', vrm: 'a model', none: 'no extension' };
const NAMES = { webp: `${sha(BODIES.webp)}.webp`, png: `${sha(BODIES.png)}.png`, vrm: `${sha(BODIES.vrm)}.vrm`, none: sha(BODIES.none) };
const relOf = (name) => `${name.slice(0, 2)}/${name}`;
const REL = Object.fromEntries(Object.entries(NAMES).map(([k, n]) => [k, relOf(n)]));
const BASE = 'https://assets.linggen.dev/a/';

/* A temp objects folder holding the four objects, and a temp folder standing for the CLI's. */
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-assets-'));
  TMP.push(dir);
  const objects = path.join(dir, 'objects');
  for (const k of Object.keys(NAMES)) {
    const p = path.join(objects, REL[k]);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, BODIES[k]);
  }
  const cli = path.join(dir, 'cli');
  fs.mkdirSync(cli);
  return { dir, objects, cli };
}

/* A fake storage: `stored` maps a relative path to a size. head answers like a server would; run puts the object in. */
function fakes(stored = {}, { failUpload = new Set(), headError = null, headStatus = {} } = {}) {
  const heads = []; const runs = [];
  const head = async (url) => {
    heads.push(url);
    if (headError && url.includes(headError)) throw new Error('network down');
    const rel = url.slice(BASE.length);
    if (headStatus[rel]) return { status: headStatus[rel], length: null };
    return rel in stored ? { status: 200, length: stored[rel] } : { status: 404, length: null };
  };
  const run = async (cmd, args, opts) => {
    runs.push({ cmd, args, opts });
    const key = args[4].slice('linggen-assets/'.length);
    if (failUpload.has(key)) return 1;
    stored[key.slice('a/'.length)] = fs.statSync(args[6]).size;
    return 0;
  };
  return { head, run, heads, runs, stored };
}

function capture() {
  const lines = { out: [], err: [] };
  return { lines, out: (s) => lines.out.push(s), err: (s) => lines.err.push(s) };
}
const go = (argv, f, c) => main(argv, { head: f.head, run: f.run, out: c.out, err: c.err });

test('the rules for names, keys, urls and types', () => {
  assert.equal(nameProblem(REL.webp), null);
  assert.equal(nameProblem(REL.none), null);
  assert.ok(nameProblem(`${NAMES.webp}`), 'not in a folder');
  assert.ok(nameProblem(`zz/${NAMES.webp}`), 'wrong folder');
  assert.ok(nameProblem(`${NAMES.webp.slice(0, 2)}/${NAMES.webp.toUpperCase()}`), 'upper-case hex');
  assert.ok(nameProblem(`${NAMES.webp.slice(0, 2)}/${NAMES.webp}.gz9`), 'a second extension');
  assert.ok(nameProblem(`${NAMES.webp.slice(0, 2)}/${sha('x').slice(0, 63)}.webp`), 'short hash');
  assert.ok(nameProblem(`${NAMES.webp.slice(0, 2)}/${sha('x')}.toolongext`), 'extension too long');
  assert.equal(objectKey('a/', 'ab/cd.webp'), 'a/ab/cd.webp');
  assert.equal(objectUrl('https://x.test/a', 'ab/cd'), 'https://x.test/a/ab/cd');
  assert.equal(prefixOfBase(DEFAULT_BASE), 'a/');
  assert.equal(prefixOfBase('https://x.test/'), '');
  assert.equal(prefixOfBase('https://x.test/m/n'), 'm/n/');
  const t = { 'a.webp': 'image/webp', 'a.png': 'image/png', 'a.jpg': 'image/jpeg', 'a.jpeg': 'image/jpeg', 'a.svg': 'image/svg+xml', 'a.json': 'application/json', 'a.mp3': 'audio/mpeg', 'a.ogg': 'audio/ogg', 'a.wav': 'audio/wav', 'a.vrm': 'model/gltf-binary', 'a.glb': 'model/gltf-binary', 'a.bin': 'application/octet-stream', a: 'application/octet-stream', 'a.zzz': 'application/octet-stream' };
  for (const [name, type] of Object.entries(t)) assert.equal(contentType(`ab/${sha('q')}${name.slice(1)}`), type, name);
});

test('the wrangler argument list is exactly the expected array', () => {
  assert.deepEqual(wranglerArgs({ bucket: 'linggen-assets', key: `a/${REL.webp}`, file: '/some/where/x.webp' }), [
    'wrangler', 'r2', 'object', 'put', `linggen-assets/a/${REL.webp}`, '--file', '/some/where/x.webp', '--remote',
    '--content-type', 'image/webp', '--cache-control', 'public, max-age=31536000, immutable',
  ]);
  assert.equal(CACHE_CONTROL, 'public, max-age=31536000, immutable');
});

test('the default wrangler folder is the sibling folder linggensite of the repo root', () => {
  assert.equal(DEFAULT_WRANGLER_CWD, path.resolve(ROOT, '..', 'linggensite'));
});

test('the plan sorts objects into present, missing, conflict, and a bad answer stops it', async () => {
  const { objects } = fixture();
  const list = listObjects(objects);
  assert.equal(list.length, 4);
  const f = fakes({ [REL.webp]: BODIES.webp.length, [REL.png]: 999 });
  const plan = await buildPlan(list, f.head, { base: BASE });
  assert.deepEqual(plan.present.map((o) => o.rel), [REL.webp]);
  assert.deepEqual(plan.missing.map((o) => o.rel), [REL.none, REL.vrm].sort());
  assert.deepEqual(plan.conflicts.map((c) => [c.o.rel, c.size]), [[REL.png, 999]]);
  assert.equal(plan.error, null);
  for (const bad of [{ headStatus: { [REL.vrm]: 503 } }, { headStatus: { [REL.vrm]: 403 } }, { headError: REL.vrm }]) {
    const p = await buildPlan(list, fakes({}, bad).head, { base: BASE, concurrency: 1 });
    assert.match(p.error, /^stopped: /);
  }
  const p5 = await buildPlan(list, async () => ({ status: 200, length: null }), { base: BASE });
  assert.match(p5.error, /without a content-length/);
});

test('a dry run prints the counts and the missing keys and uploads nothing', async () => {
  const { objects, cli } = fixture();
  const f = fakes({ [REL.webp]: BODIES.webp.length });
  const c = capture();
  assert.equal(await go([objects, '--wrangler-cwd', cli], f, c), 0);
  assert.equal(f.runs.length, 0);
  assert.match(c.lines.out[0], /^4 objects: 1 already there, 3 missing \(0\.0 MB to upload\)$/);
  assert.equal(c.lines.out.filter((l) => l.startsWith('  a/')).length, 3);
  assert.ok(!c.lines.out.some((l) => /… and/.test(l)));
  assert.match(c.lines.out.at(-1), /Nothing uploaded/);
  assert.deepEqual(c.lines.err, []);
});

test('the plan shows the first 20 missing keys, then "… and N more", and the missing size in MB', async () => {
  const { dir } = fixture();
  const objects = path.join(dir, 'many');
  const big = 'x'.repeat(1048576 / 2);
  for (let i = 0; i < 25; i++) {
    const body = `${big}${i}`; const name = `${sha(body)}.bin`;
    fs.mkdirSync(path.join(objects, name.slice(0, 2)), { recursive: true });
    fs.writeFileSync(path.join(objects, name.slice(0, 2), name), body);
  }
  const f = fakes();
  const c = capture();
  assert.equal(await go([objects], f, c), 0);
  assert.match(c.lines.out[0], /^25 objects: 0 already there, 25 missing \(12\.5 MB to upload\)$/);
  assert.equal(c.lines.out.filter((l) => l.startsWith('  a/')).length, 20);
  assert.ok(c.lines.out.includes('  … and 5 more'));
  assert.equal(f.runs.length, 0);
});

test('--yes runs wrangler once per missing object, with the expected arguments and folder, and checks each', async () => {
  const { objects, cli } = fixture();
  const f = fakes({ [REL.webp]: BODIES.webp.length });
  const c = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli, '--concurrency', '2'], f, c), 0, c.lines.err.join('\n'));
  assert.equal(f.runs.length, 3);
  const expected = [REL.none, REL.png, REL.vrm].sort();
  assert.deepEqual(f.runs.map((r) => r.args[4]).sort(), expected.map((r) => `linggen-assets/a/${r}`));
  for (const r of f.runs) {
    assert.equal(r.cmd, 'npx');
    assert.deepEqual(r.opts, { cwd: cli });
    const rel = r.args[4].slice('linggen-assets/a/'.length);
    assert.deepEqual(r.args, wranglerArgs({ bucket: 'linggen-assets', key: `a/${rel}`, file: path.join(objects, rel) }));
  }
  const vrm = f.runs.find((r) => r.args[4].endsWith('.vrm'));
  assert.deepEqual(vrm.args, [
    'wrangler', 'r2', 'object', 'put', `linggen-assets/a/${REL.vrm}`, '--file', path.join(objects, REL.vrm), '--remote',
    '--content-type', 'model/gltf-binary', '--cache-control', 'public, max-age=31536000, immutable',
  ]);
  // the check: each uploaded object was asked for again after the plan
  assert.equal(f.heads.length, 4 + 3);
  assert.equal(c.lines.out.at(-1), 'uploaded 3, already there 1, failed 0');
});

test('--bucket and --prefix with a matching --base are used in the key', async () => {
  const { objects, cli } = fixture();
  const stored = {};
  const heads = [];
  const head = async (url) => { heads.push(url); const rel = url.slice('https://cdn.test/m/'.length); return rel in stored ? { status: 200, length: stored[rel] } : { status: 404, length: null }; };
  const run = async (cmd, args) => { stored[args[4].slice('bk/m/'.length)] = fs.statSync(args[6]).size; return 0; };
  const c = capture();
  assert.equal(await main([objects, '--yes', '--base', 'https://cdn.test/m/', '--prefix', 'm/', '--bucket', 'bk', '--wrangler-cwd', cli], { head, run, out: c.out, err: c.err }), 0, c.lines.err.join('\n'));
  assert.equal(c.lines.out.at(-1), 'uploaded 4, already there 0, failed 0');
  assert.ok(heads.every((u) => u.startsWith('https://cdn.test/m/')));
});

test('a name or a hash that does not fit refuses everything, one line per bad file, and uploads nothing', async () => {
  const { objects, cli } = fixture();
  fs.writeFileSync(path.join(objects, REL.webp.split('/')[0], 'notes.txt'), 'x'); // bad name
  const wrong = `${sha('other')}.png`; // content is not its hash
  fs.mkdirSync(path.join(objects, wrong.slice(0, 2)), { recursive: true });
  fs.writeFileSync(path.join(objects, wrong.slice(0, 2), wrong), 'not other');
  const f = fakes();
  const c = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli], f, c), 1);
  assert.equal(f.runs.length, 0);
  assert.equal(f.heads.length, 0);
  assert.equal(c.lines.err.filter((l) => l.startsWith('refused ')).length, 2);
  assert.ok(c.lines.err.some((l) => l.includes('notes.txt')));
  assert.ok(c.lines.err.some((l) => l.includes(wrong) && /sha256/.test(l)));
  assert.deepEqual(c.lines.out, []);
});

test('a file in the wrong folder refuses', async () => {
  const { objects, cli } = fixture();
  fs.mkdirSync(path.join(objects, 'loose'), { recursive: true });
  fs.copyFileSync(path.join(objects, REL.webp), path.join(objects, 'loose', NAMES.webp));
  const f = fakes();
  const c = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli], f, c), 1);
  assert.equal(f.runs.length, 0);
  assert.match(c.lines.err[0], /^refused loose\//);
});

test('a prefix that disagrees with the base refuses before anything is asked', async () => {
  const { objects, cli } = fixture();
  for (const argv of [['--prefix', 'b/'], ['--prefix', 'a'], ['--base', 'https://assets.linggen.dev/other/', '--prefix', 'a/'], ['--prefix', '']]) {
    const f = fakes();
    const c = capture();
    assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli, ...argv], f, c), 2, argv.join(' '));
    assert.equal(c.lines.err.length, 1);
    assert.match(c.lines.err[0], /^refused: --prefix/);
    assert.equal(f.heads.length + f.runs.length, 0);
  }
});

test('a conflict (present with another size) is listed, never overwritten, and exits non-zero', async () => {
  const { objects, cli } = fixture();
  const f = fakes({ [REL.png]: 5 });
  const c = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli], f, c), 1);
  assert.equal(f.runs.length, 0);
  assert.match(c.lines.err[0], new RegExp(`^conflict a/${REL.png}: storage holds 5 bytes`));
  assert.match(c.lines.err.at(-1), /1 conflict, nothing uploaded/);
});

test('a 5xx, a 403 or a network error while asking stops the run with a plain line and uploads nothing', async () => {
  const { objects, cli } = fixture();
  for (const opts of [{ headStatus: { [REL.png]: 503 } }, { headStatus: { [REL.png]: 403 } }, { headError: NAMES.png }]) {
    const f = fakes({}, opts);
    const c = capture();
    assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli], f, c), 1);
    assert.equal(f.runs.length, 0);
    assert.equal(c.lines.err.length, 1);
    assert.match(c.lines.err[0], /^stopped: /);
  }
});

test('a failed upload gives a non-zero exit and the others still go; a check that finds the wrong size fails too', async () => {
  const { objects, cli } = fixture();
  const f = fakes({}, { failUpload: new Set([`a/${REL.png}`]) });
  const c = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli, '--concurrency', '1'], f, c), 1);
  assert.equal(f.runs.length, 4, 'the failure did not stop the rest');
  assert.ok(c.lines.err.some((l) => l.startsWith(`failed a/${REL.png}: wrangler exited with code 1`)));
  assert.equal(c.lines.out.at(-1), 'uploaded 3, already there 0, failed 1');

  // an upload that "succeeds" but the check then finds nothing
  const g = fakes();
  const run = async (cmd, args, opts) => { g.runs.push({ cmd, args, opts }); return 0; };
  const c2 = capture();
  assert.equal(await main([objects, '--yes', '--wrangler-cwd', cli], { head: g.head, run, out: c2.out, err: c2.err }), 1);
  assert.equal(c2.lines.out.at(-1), 'uploaded 0, already there 0, failed 4');
  assert.ok(c2.lines.err.every((l) => /wanted 200 with \d+/.test(l)));

  // the CLI could not start
  const c3 = capture();
  assert.equal(await main([objects, '--yes', '--wrangler-cwd', cli], { head: fakes().head, run: async () => null, out: c3.out, err: c3.err }), 1);
  assert.ok(c3.lines.err.every((l) => /could not start/.test(l)));
});

test('a second run in a row uploads nothing', async () => {
  const { objects, cli } = fixture();
  const f = fakes();
  const c1 = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli], f, c1), 0);
  assert.equal(f.runs.length, 4);
  const c2 = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', cli], f, c2), 0);
  assert.equal(f.runs.length, 4, 'no new upload');
  assert.equal(c2.lines.out.at(-1), 'uploaded 0, already there 4, failed 0');
});

test('--yes with a missing wrangler folder says so plainly and uploads nothing', async () => {
  const { objects, dir } = fixture();
  const f = fakes();
  const c = capture();
  assert.equal(await go([objects, '--yes', '--wrangler-cwd', path.join(dir, 'nope')], f, c), 1);
  assert.equal(f.runs.length, 0);
  assert.match(c.lines.err[0], /^the folder with the Cloudflare CLI is missing: /);
});

test('bad arguments print the usage line', async () => {
  const f = fakes(); const c = capture();
  assert.equal(await go([], f, c), 2);
  assert.match(c.lines.err[0], /^usage: publish-assets\.mjs/);
  const c2 = capture();
  assert.equal(await go(['somewhere', '--nope'], f, c2), 2);
  const { objects } = fixture();
  const c3 = capture();
  assert.equal(await go([objects, '--concurrency', '0'], f, c3), 2);
  assert.equal(f.heads.length, 0);
});
