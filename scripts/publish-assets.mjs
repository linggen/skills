#!/usr/bin/env node
// publish-assets.mjs — the upload half of asset-pack publishing (doc/asset-pack-spec.md, engine repo,
// "Publishing and packaging"). build-assets-manifest.mjs writes a skill's assets.json and, with --objects <dir>,
// lays the fetched files out as <dir>/<aa>/<sha256>.<ext>; this script puts into storage the ones it does not have.
//
// The order, every time:
//   1. node scripts/build-assets-manifest.mjs <skill dir> --packs <...> --objects <dir>
//   2. node scripts/publish-assets.mjs <dir>          — no --yes: prints the plan, uploads nothing
//   3. only after the owner's yes: node scripts/publish-assets.mjs <dir> --yes
//
//   node scripts/publish-assets.mjs <objects dir> [--base <url>] [--bucket <name>] [--prefix <key prefix>]
//                                   [--yes] [--wrangler-cwd <dir>] [--concurrency <n>]
//
//   --base          where the objects are served from (default https://assets.linggen.dev/a/)
//   --bucket        the storage bucket (default linggen-assets)
//   --prefix        the key prefix (default a/); it must be the path part of --base, or the run refuses
//   --yes           upload the missing objects; without it the script only prints the plan
//   --wrangler-cwd  the folder where the Cloudflare CLI is installed (default: the sibling folder ../linggensite)
//   --concurrency   uploads at a time (default 4)
//
// Every file under <objects dir> is an object, with the key <prefix><path relative to the dir>. A file is refused
// (nothing is uploaded) when its name is not <64 hex> or <64 hex>.<1–8 letters or digits>, when it does not sit in
// the folder named by the first two hex digits, or when its content's sha256 is not the name's hash.
// What is already stored is found without credentials, by an HTTP HEAD of <base><relative path>: 200 with the same
// size is present, 404 is missing, 200 with another size is a CONFLICT (never overwritten: the run stops), and
// anything else stops the run — nothing is guessed. Uploads run the Cloudflare CLI as a child process with an
// argument array (no shell); this script never reads or prints a credential, and shows only the CLI's exit code.
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_BASE = 'https://assets.linggen.dev/a/';
export const DEFAULT_BUCKET = 'linggen-assets';
export const DEFAULT_PREFIX = 'a/';
export const DEFAULT_CONCURRENCY = 4;
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const PLAN_CONCURRENCY = 8; // HEADs at a time while planning
const PLAN_LIST = 20; // missing keys shown in the plan

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_WRANGLER_CWD = path.resolve(REPO_ROOT, '..', 'linggensite');

const NAME_RE = /^([0-9a-f]{64})(?:\.([A-Za-z0-9]{1,8}))?$/;
const TYPES = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
  json: 'application/json', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  vrm: 'model/gltf-binary', glb: 'model/gltf-binary', bin: 'application/octet-stream',
};

const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

/* The content type for an object's name, by its extension; unknown or none → application/octet-stream. */
export function contentType(name) {
  const m = NAME_RE.exec(path.posix.basename(name));
  return (m && m[2] && TYPES[m[2].toLowerCase()]) || 'application/octet-stream';
}

/* Why a relative path (forward slashes) is not a valid object name, or null. */
export function nameProblem(rel) {
  const parts = rel.split('/');
  const m = NAME_RE.exec(parts.at(-1));
  if (!m) return 'its name is not <64 hex> or <64 hex>.<extension of 1 to 8 letters or digits>';
  if (parts.length !== 2 || parts[0] !== m[1].slice(0, 2)) return `it is not in the folder ${m[1].slice(0, 2)}/ (the first two hex digits of its name)`;
  return null;
}

/* The key prefix a base URL implies: its path part without the leading slash, with a closing slash. */
export function prefixOfBase(base) {
  const p = new URL(base).pathname.replace(/^\/+/, '');
  return p === '' || p.endsWith('/') ? p : `${p}/`;
}

/* The URL of an object: the base (closing slash added) + the relative path. */
export const objectUrl = (base, rel) => `${base.endsWith('/') ? base : `${base}/`}${rel}`;

/* The object's key in the bucket. */
export const objectKey = (prefix, rel) => `${prefix}${rel}`;

/* The arguments after `npx` that upload one object (the bucket's path is <bucket>/<key>). */
export function wranglerArgs({ bucket, key, file }) {
  return ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', file, '--remote',
    '--content-type', contentType(key), '--cache-control', CACHE_CONTROL];
}

/* Every file under dir → [{ rel, file, size }], rel with forward slashes, sorted by code point. Anything that is
   not a plain file or a folder (a link, a socket) is listed too, as { rel, odd: true }, so it gets refused. */
export function listObjects(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const full = path.join(abs, e.name);
      if (e.isDirectory()) walk(full, r);
      else if (e.isFile()) out.push({ rel: r, file: full, size: fs.statSync(full).size });
      else out.push({ rel: r, file: full, size: 0, odd: true });
    }
  };
  walk(dir, '');
  return out.sort((a, b) => byCode(a.rel, b.rel));
}

/* One plain line per file that may not be uploaded (bad name, odd kind, content that is not its name's hash). */
export function checkObjects(objects) {
  const bad = [];
  for (const o of objects) {
    const why = o.odd ? 'it is not a plain file' : nameProblem(o.rel);
    if (why) { bad.push(`refused ${o.rel}: ${why}`); continue; }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(o.file)).digest('hex');
    if (hash !== NAME_RE.exec(path.posix.basename(o.rel))[1]) bad.push(`refused ${o.rel}: its content's sha256 is not the hash in its name`);
  }
  return bad;
}

/* Run fn over items, `limit` at a time; stops starting new ones once `stop()` is true. */
async function pool(items, limit, fn, stop = () => false) {
  let next = 0;
  const worker = async () => { while (next < items.length && !stop()) await fn(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* HEAD every object → { present: [obj], missing: [obj], conflicts: [{ obj, size }], error: string | null }.
   head(url) → { status, length } (length = the content-length number, or null) and may throw.
   The first thing that is not 200 / 404 stops the run: error is set and later objects are not asked. */
export async function buildPlan(objects, head, { base = DEFAULT_BASE, concurrency = PLAN_CONCURRENCY } = {}) {
  const plan = { present: [], missing: [], conflicts: [], error: null };
  await pool(objects, concurrency, async (o) => {
    const url = objectUrl(base, o.rel);
    let r;
    try { r = await head(url); } catch (e) { plan.error ??= `stopped: could not ask ${url} (${e.message})`; return; }
    if (r.status === 404) plan.missing.push(o);
    else if (r.status === 200 && r.length === o.size) plan.present.push(o);
    else if (r.status === 200 && Number.isFinite(r.length)) plan.conflicts.push({ o, size: r.length });
    else plan.error ??= `stopped: ${url} answered ${r.status}${r.status === 200 ? ' without a content-length' : ''}, not 200 or 404`;
  }, () => plan.error !== null);
  const order = (a, b) => byCode(a.rel, b.rel);
  plan.present.sort(order); plan.missing.sort(order); plan.conflicts.sort((a, b) => order(a.o, b.o));
  return plan;
}

/* The plan as the lines the owner reads before saying yes. */
export function planLines(plan, prefix) {
  const bytes = plan.missing.reduce((n, o) => n + o.size, 0);
  const lines = [`${plan.present.length + plan.missing.length} objects: ${plan.present.length} already there, ${plan.missing.length} missing (${mb(bytes)} to upload)`];
  for (const o of plan.missing.slice(0, PLAN_LIST)) lines.push(`  ${objectKey(prefix, o.rel)}`);
  if (plan.missing.length > PLAN_LIST) lines.push(`  … and ${plan.missing.length - PLAN_LIST} more`);
  return lines;
}

/* The real child-process runner: run(cmd, args, { cwd }) → exit code (null when it could not start). No shell;
   the child's output is dropped so nothing it prints reaches the log. */
export function runChild(cmd, args, { cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'ignore'], shell: false });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code));
  });
}

/* The real HEAD: head(url) → { status, length }. Asked for uncompressed: a compressible object (JSON, SVG) is
   otherwise answered with a content-encoding and no content-length, and its size could not be checked. */
export async function headUrl(url) {
  const r = await fetch(url, { method: 'HEAD', headers: { 'accept-encoding': 'identity' } });
  const len = r.headers.get('content-length');
  return { status: r.status, length: len === null ? null : Number(len) };
}

const USAGE = 'usage: publish-assets.mjs <objects dir> [--base <url>] [--bucket <name>] [--prefix <key prefix>] [--yes] [--wrangler-cwd <dir>] [--concurrency <n>]';

function parseArgs(argv) {
  const withValue = new Set(['--base', '--bucket', '--prefix', '--wrangler-cwd', '--concurrency']);
  const opts = { yes: false }; const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes') opts.yes = true;
    else if (withValue.has(a)) { if (i + 1 >= argv.length) return null; opts[a.slice(2)] = argv[++i]; }
    else if (a.startsWith('--')) return null;
    else positional.push(a);
  }
  return positional.length === 1 ? { ...opts, dir: positional[0] } : null;
}

/* Upload one object, then HEAD it again; returns null when it is there with the right size, else a plain reason. */
async function uploadOne(o, { bucket, prefix, base, cwd, head, run }) {
  const key = objectKey(prefix, o.rel);
  const code = await run('npx', wranglerArgs({ bucket, key, file: o.file }), { cwd });
  if (code !== 0) return `failed ${key}: wrangler ${code === null ? 'could not start' : `exited with code ${code}`}`;
  let r;
  try { r = await head(objectUrl(base, o.rel)); } catch (e) { return `failed ${key}: uploaded, but the check could not ask the base (${e.message})`; }
  if (r.status !== 200 || r.length !== o.size) return `failed ${key}: uploaded, but the check found ${r.status}${r.length === null ? '' : ` with ${r.length} bytes`}, wanted 200 with ${o.size}`;
  return null;
}

/* The whole run; returns the exit code. head and run are injected by tests; out and err take a line each. */
export async function main(argv, { head = headUrl, run = runChild, out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const a = parseArgs(argv);
  if (!a) { err(USAGE); return 2; }
  const dir = path.resolve(a.dir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { err(`not a folder: ${a.dir}`); return 2; }
  const base = a.base ?? DEFAULT_BASE;
  let basePrefix;
  try { basePrefix = prefixOfBase(base); } catch { err(`--base is not a URL: ${base}`); return 2; }
  const prefix = a.prefix ?? (a.base ? basePrefix : DEFAULT_PREFIX);
  if (prefix !== basePrefix) { err(`refused: --prefix "${prefix}" is not the path part of --base ("${basePrefix}"), so the keys would not be where the base looks`); return 2; }
  const bucket = a.bucket ?? DEFAULT_BUCKET;
  const concurrency = a.concurrency === undefined ? DEFAULT_CONCURRENCY : Number(a.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) { err(`--concurrency must be a whole number of 1 or more: ${a.concurrency}`); return 2; }

  const objects = listObjects(dir);
  if (objects.length === 0) { err(`no files under ${a.dir}`); return 2; }
  const bad = checkObjects(objects);
  if (bad.length) { for (const line of bad) err(line); err(`${bad.length} refused, nothing uploaded`); return 1; }

  const plan = await buildPlan(objects, head, { base });
  if (plan.error) { err(plan.error); return 1; }
  if (plan.conflicts.length) {
    for (const c of plan.conflicts) err(`conflict ${objectKey(prefix, c.o.rel)}: storage holds ${c.size} bytes, the file has ${c.o.size}; never overwritten`);
    err(`${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? '' : 's'}, nothing uploaded`);
    return 1;
  }
  for (const line of planLines(plan, prefix)) out(line);
  if (!a.yes) {
    out(plan.missing.length ? 'Nothing uploaded. Run again with --yes, after the owner says yes, to upload the missing ones.' : 'Nothing to upload.');
    return 0;
  }

  const cwd = path.resolve(a['wrangler-cwd'] ?? DEFAULT_WRANGLER_CWD);
  if (plan.missing.length && (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory())) {
    err(`the folder with the Cloudflare CLI is missing: ${cwd} (pass --wrangler-cwd <dir>)`);
    return 1;
  }
  let uploaded = 0; let failed = 0;
  await pool(plan.missing, concurrency, async (o) => {
    const problem = await uploadOne(o, { bucket, prefix, base, cwd, head, run });
    if (problem) { failed++; err(problem); } else uploaded++;
  });
  out(`uploaded ${uploaded}, already there ${plan.present.length}, failed ${failed}`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${e.message}\n`); process.exitCode = 1; });
}
