// clearables.sh against a fake home: the finders reach any depth, the guard
// refuses whatever does not fit its rule, Ling's tools read the saved tree
// and cannot reach outside ~. Everything happens under a scratch HOME — no
// real file is ever touched.
// Run: node --test apple-shifu/tests/   (SHIFU_TEST_TMP picks the scratch root)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SH = path.join(here, '../scripts/clearables.sh');
const DAY = 86400;

/** A fresh fake home with `layout` — { 'rel/path': contents | { text, bytes,
    size, age } }: `bytes` really written, `size` sparse (a length, no disk).
    A name ending in '/' is a folder. */
function makeHome(layout) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(process.env.SHIFU_TEST_TMP || os.tmpdir(), 'shifu-')));
  const home = path.join(root, 'home');
  for (const [rel, spec] of Object.entries(layout)) {
    const p = path.join(home, rel);
    if (rel.endsWith('/')) { fs.mkdirSync(p, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const s = typeof spec === 'object' ? spec : { text: spec };
    fs.writeFileSync(p, s.bytes ? Buffer.alloc(s.bytes, 1) : s.text || 'x');
    if (s.size) fs.truncateSync(p, s.size);                    // sparse: no real disk used
    if (s.age) fs.utimesSync(p, Date.now() / 1000 - s.age * DAY, Date.now() / 1000 - s.age * DAY);
  }
  return { root, home, data: path.join(root, 'data') };
}

function run(fx, args, env = {}) {
  const res = spawnSync('bash', [SH, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, HOME: fx.home, SHIFU_DATA: fx.data, SHIFU_NO_FINDER: '1',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ...env,
    },
  });
  return { out: res.stdout, err: res.stderr, code: res.status };
}

function git(dir, ...args) {
  spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

function scan(fx, env = {}) {
  const out = path.join(fx.data, 'clearables');
  run(fx, ['scan', out], env);
  const text = fs.readFileSync(path.join(out, 'rows.txt'), 'utf8');
  const rows = text.split('\n').filter((l) => l.startsWith('R|')).map((l) => {
    const f = l.split('|');
    return { rule: f[1], state: f[3], path: f.slice(7).join('|').replace(`${fx.home}/`, '') };
  });
  return { text, rows };
}

function clear(fx, pairs, env = {}) {
  const list = path.join(fx.root, `list-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(list, pairs.map(([rule, rel]) => `${rule}\t${rel.startsWith('/') ? rel : path.join(fx.home, rel)}`).join('\n') + '\n');
  const res = run(fx, ['clear', list], env);
  return JSON.parse(res.out.trim().split('\n').pop());
}

const has = (rows, rule, rel) => rows.some((r) => r.rule === rule && r.path === rel);

test('scan: finders reach any depth, respect .gitignore, and the first rule claims a folder', () => {
  const fx = makeHome({
    'workspace/rust/luffy/Cargo.toml': '[package]',
    'workspace/rust/luffy/target/debug/.fingerprint/a': 'x',
    'workspace/web/app/package.json': '{}',
    'workspace/web/app/.gitignore': 'dist\n',
    'workspace/web/app/node_modules/left-pad/package.json': '{}',
    'workspace/web/app/dist/app.js': 'x',
    'workspace/web/app/build/keep.js': 'x',                  // not ignored → not a row
    'workspace/flut/pubspec.yaml': 'name: flut',
    'workspace/flut/build/app': 'x',
    'workspace/flut/.dart_tool/x': 'x',
    'workspace/tool/CACHEDIR.TAG': 'Signature: 8a477f597d28d172789f06886806bc55',
    'Library/Caches/Homebrew/bottle': 'x',
    'Library/Caches/com.example.app/c': 'x',
    'Downloads/Old.dmg': { text: 'dmg', age: 40 },
    '.npm/_npx/x/package.json': '{}',                         // a pruned tree: not a project
    '.tool/huge.log': { size: 3e9 },
  });
  for (let i = 1; i <= 35; i += 1) {
    const d = new Date(Date.now() - i * DAY * 1000).toISOString().slice(0, 10);
    const p = path.join(fx.home, '.sanji', `sensing_all.${d}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'log');
    fs.utimesSync(p, Date.now() / 1000 - i * DAY, Date.now() / 1000 - i * DAY);
  }
  git(path.join(fx.home, 'workspace/web/app'), 'init', '-q');
  const { rows } = scan(fx);
  assert.ok(has(rows, 'cargo-target', 'workspace/rust/luffy/target'), 'target at depth 4');
  assert.ok(has(rows, 'node-modules', 'workspace/web/app/node_modules'));
  assert.ok(has(rows, 'node-build', 'workspace/web/app/dist'), 'ignored dist');
  assert.ok(!rows.some((r) => r.path === 'workspace/web/app/build'), 'build not in .gitignore stays');
  assert.ok(has(rows, 'flutter-build', 'workspace/flut/build'));
  assert.ok(has(rows, 'flutter-build', 'workspace/flut/.dart_tool'));
  assert.ok(has(rows, 'cachedir-tag', 'workspace/tool'));
  assert.ok(has(rows, 'homebrew-cache', 'Library/Caches/Homebrew'), 'specific rule wins');
  assert.ok(!has(rows, 'library-caches', 'Library/Caches/Homebrew'), 'claimed once');
  assert.ok(has(rows, 'library-caches', 'Library/Caches/com.example.app'));
  assert.ok(has(rows, 'installers', 'Downloads/Old.dmg'));
  assert.ok(has(rows, 'log-series', '.sanji'));
  assert.ok(has(rows, 'big-log', '.tool/huge.log'));
  assert.ok(!rows.some((r) => r.path.startsWith('.npm/_npx/x')), 'pruned trees are not walked');
  assert.ok(rows.every((r) => r.state === 'ok'));
});

test('clear: the guard refuses anything that does not fit its rule', () => {
  const fx = makeHome({
    'w/luffy/Cargo.toml': '[package]',
    'w/luffy/target/debug/big': 'x',
    'w/src/Cargo.toml': '[package]',
    'w/src/target/main.rs': 'fn main() {}',
    'notes/a.txt': 'mine',
    'Library/Caches/com.example.app/c': 'x',
    'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw': 'x',
  });
  git(path.join(fx.home, 'w/src'), 'init', '-q');
  git(path.join(fx.home, 'w/src'), 'add', '-A');
  git(path.join(fx.home, 'w/src'), '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x');
  const outside = fs.mkdtempSync(path.join(fx.root, 'outside-'));
  fs.writeFileSync(path.join(outside, 'precious'), 'x');
  fs.symlinkSync(outside, path.join(fx.home, 'Library/Caches/link'));
  const r = clear(fx, [
    ['cargo-target', 'w/src/target'],                    // git-tracked source
    ['cargo-target', 'notes'],                           // not a target folder
    ['library-caches', 'Library/Caches'],                // the root itself, not a child
    ['library-caches', fx.home],                         // home
    ['library-caches', 'Library/Caches/link'],           // symlink out of home
    ['library-caches', outside],                         // outside home
    ['nonsense', 'notes'],                               // unknown rule
    ['found', 'notes'],                                  // never proposed
    ['docker-disk', 'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw'], // report only
    ['cargo-target', 'w/luffy/target'],                  // fits → cleared (cargo absent → purge)
    ['library-caches', 'Library/Caches/com.example.app'], // fits → cleared
  ]);
  assert.equal(r.refused, 9, JSON.stringify(r.reasons));
  assert.equal(r.removed, 2);
  assert.ok(!fs.existsSync(path.join(fx.home, 'w/luffy/target')));
  assert.ok(fs.existsSync(path.join(fx.home, 'w/src/target/main.rs')), 'tracked source survives');
  assert.ok(fs.existsSync(path.join(outside, 'precious')), 'outside survives');
  assert.ok(fs.existsSync(path.join(fx.home, 'notes/a.txt')));
  assert.ok(r.reasons.some((x) => /git tracks/.test(x)));
  assert.ok(r.reasons.some((x) => /symlink/.test(x)));
});

test('clear: logs and installers go to the Trash, a series only past keep_days', () => {
  const fx = makeHome({ 'Downloads/Old.dmg': { text: 'x', age: 40 } });
  const dir = path.join(fx.home, '.sanji');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 35; i += 1) {
    const d = new Date(Date.now() - i * DAY * 1000).toISOString().slice(0, 10);
    const p = path.join(dir, `ctl_all.${d}`);
    fs.writeFileSync(p, 'log');
    fs.utimesSync(p, Date.now() / 1000 - i * DAY - 3600, Date.now() / 1000 - i * DAY - 3600);
  }
  const r = clear(fx, [['installers', 'Downloads/Old.dmg'], ['log-series', '.sanji']]);
  assert.equal(r.removed, 2, JSON.stringify(r));
  const trash = fs.readdirSync(path.join(fx.home, '.Trash'));
  assert.ok(trash.includes('Old.dmg'));
  const kept = fs.readdirSync(dir).length;
  assert.ok(kept >= 13 && kept <= 15, `recent logs stay (${kept})`);
});

test('propose: the guard takes a plain find under ~ and refuses the rest; its row clears to the Trash', () => {
  const fx = makeHome({
    '.sanji/old-export.bin': 'x',
    'Documents/a.txt': 'mine',
    'Foo.app/Contents/x': 'x',
    'Library/CloudStorage/Drive/f': 'x',
    'src/lib.rs': 'x',
  });
  git(path.join(fx.home, 'src'), 'init', '-q');
  git(path.join(fx.home, 'src'), 'add', '-A');
  git(path.join(fx.home, 'src'), '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x');
  const ok = run(fx, ['propose', '~/.sanji/old-export.bin', 'an old export | nothing reads it']);
  assert.match(ok.out, /added to Found by Shifu/);
  for (const [p, why] of [
    ['~/Documents', /whole top-level folder/], ['/etc', /outside the home folder|not there/],
    ['~/Foo.app/Contents', /part of an app/], ['~/Library/CloudStorage/Drive', /protected place/],
    ['~/src', /git tracks/], ['~/../x', /not there|outside/],
  ]) {
    const res = run(fx, ['propose', p, 'x']);
    assert.match(res.out, why, `${p}: ${res.out}`);
  }
  const found = fs.readFileSync(path.join(fx.data, 'found.txt'), 'utf8').trim().split('\n');
  assert.equal(found.length, 1);
  assert.match(found[0], /an old export \/ nothing reads it\|/, 'a pipe in why cannot split the path');
  const r = clear(fx, [['found', '.sanji/old-export.bin'], ['found', 'Documents/a.txt']]);
  assert.equal(r.removed, 1);
  assert.equal(r.refused, 1);
  assert.ok(fs.readdirSync(path.join(fx.home, '.Trash')).includes('old-export.bin'));
  assert.equal(fs.readFileSync(path.join(fx.data, 'found.txt'), 'utf8').trim(), '', 'cleared finds drop off');
});

test('tree: small folders fold into "other", rows are leaves, hotspots are tagged', () => {
  const fx = makeHome({
    'w/luffy/Cargo.toml': '[package]',
    'w/luffy/target/debug/big': { bytes: 3_000_000 },
    'photos/raw/a.raw': { bytes: 2_000_000 },
    'photos/raw/tiny/t': 'x',
    'old/stale/blob': { bytes: 1_500_000, age: 800 },
    'many/f': 'x',
  });
  for (let i = 0; i < 8; i += 1) fs.writeFileSync(path.join(fx.home, 'many', `f${i}`), 'x');
  for (let i = 1; i <= 31; i += 1) {
    const d = new Date(Date.now() - i * DAY * 1000).toISOString().slice(0, 10);
    fs.mkdirSync(path.join(fx.home, '.tool'), { recursive: true });
    fs.writeFileSync(path.join(fx.home, '.tool', `run.${d}.log`), 'x');
  }
  // old/stale's own mtime too, so "newest" is old all the way up
  const past = Date.now() / 1000 - 800 * DAY;
  fs.utimesSync(path.join(fx.home, 'old/stale'), past, past);
  const env = {
    SHIFU_TREE_MIN: '1000000', SHIFU_TREE_PRUNE_MIN: '1', SHIFU_BIG_FILE: '1900000',
    SHIFU_STALE_MIN: '1000000', SHIFU_MANY_FILES: '5',
  };
  const { text } = scan(fx, env);
  assert.match(text, /^D\|/m);
  const tree = JSON.parse(fs.readFileSync(path.join(fx.data, 'clearables/disk-tree.json'), 'utf8'));
  const node = (rel) => tree.nodes.find((n) => n.path === path.join(fx.home, rel));
  assert.equal(node('w/luffy/target').rule, 'cargo-target', 'a row is a leaf with its rule');
  assert.equal(node('w/luffy/target').files, 0, 'a leaf is not walked');
  assert.ok(node('photos/raw'), 'a big folder keeps its node');
  assert.ok(!node('photos/raw/tiny'), 'a small one folds into its parent');
  assert.ok(node('photos/raw').other >= 2_000_000, '… as "other"');
  assert.equal(node('').explained, node('w/luffy/target').bytes);
  const kinds = (k) => tree.hotspots.filter((h) => h.kind === k).map((h) => h.path.replace(`${fx.home}/`, ''));
  assert.ok(kinds('big_file').includes('photos/raw/a.raw'));
  assert.ok(kinds('stale').includes('old'), 'topmost stale folder');
  assert.ok(kinds('series').includes('.tool'));
  assert.ok(!kinds('big_file').includes('w/luffy/target/debug/big'), 'nothing inside a leaf');
  // H lines come from the tree
  assert.match(text, new RegExp(`^H\\|\\d+\\|ok\\|${fx.home}/photos$`, 'm'));

  // DiskLook reads it: children biggest first, and the guard
  const look = run(fx, ['look', '~']).out;
  assert.match(look, /^~ — /);
  assert.ok(look.indexOf('| w |') < look.indexOf('| photos |'), 'biggest first');
  assert.match(run(fx, ['look', '~/w/luffy']).out, /listed: cargo-target/);
  assert.match(run(fx, ['look', '/etc']).out, /refused: outside the home folder/);
  assert.match(run(fx, ['look', '~/../..']).out, /refused: path is not plain/);
  assert.match(run(fx, ['look', '~/Library/CloudStorage/x']).out, /refused: protected place/);
  assert.match(run(fx, ['look', '~/nope']).out, /nothing big below/);
  const hot = run(fx, ['hotspots']).out;
  assert.match(hot, /unexplained/);
  assert.match(hot, /big file .*photos\/raw\/a\.raw/);
});

test('look: with no saved tree it says so instead of walking', () => {
  const fx = makeHome({ 'a/b': 'x' });
  assert.match(run(fx, ['look', '~/a']).out, /No disk tree yet/);
  assert.match(run(fx, ['hotspots']).out, /No disk tree yet/);
});
