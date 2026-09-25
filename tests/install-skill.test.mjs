// scripts/install-skill.sh, run against a throwaway git repo and a fake HOME:
// only committed files land, a broken import refuses the whole install,
// user state is never touched, --check reports drift, and a SKILL.md change
// asks the engine to reload.
//
//   node --test tests/install-skill.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASES = [];
after(() => { for (const b of BASES) fs.rmSync(b, { recursive: true, force: true }); });

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skill-test-'));
  BASES.push(base);
  const repo = path.join(base, 'repo');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(home);
  for (const f of ['install-skill.sh', 'install-skill.mjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(repo, 'scripts', f));
  fs.chmodSync(path.join(repo, 'scripts', 'install-skill.sh'), 0o755);
  const env = {
    ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', LINGGEN_SKILLS_DIR: '',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
    LINGGEN_PORT: '1',
  };
  delete env.LINGGEN_SKILLS_DIR;
  const write = (rel, text) => { const p = path.join(repo, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const git = (...args) => { const r = spawnSync('git', ['-C', repo, ...args], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  const commit = msg => { git('add', '-A'); git('commit', '-q', '-m', msg); };
  const run = (...args) => spawnSync(path.join(repo, 'scripts', 'install-skill.sh'), args, { env, encoding: 'utf8' });
  const runAsync = (extraEnv, ...args) => new Promise(resolve => {
    const p = spawn(path.join(repo, 'scripts', 'install-skill.sh'), args, { env: { ...env, ...extraEnv } });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', status => resolve({ status, out }));
  });
  const installed = rel => path.join(home, '.linggen', 'skills', 'demo', rel);
  const read = rel => fs.readFileSync(installed(rel), 'utf8');

  git('init', '-q', '-b', 'main');
  write('demo/SKILL.md', '---\nname: demo\ndescription: d\ncloud:\n  save: [saves/game.json]\n---\nbody v1\n');
  write('demo/scripts/index.html', '<link rel="stylesheet" href="style.css">\n<script type="module" src="main.mjs"></script>\n');
  write('demo/scripts/style.css', 'body{}\n');
  write('demo/scripts/main.mjs', "import { hello, twice as double } from './lib.mjs';\nimport * as all from './lib.mjs';\nexport { hello };\nconsole.log(hello, double, all);\n");
  write('demo/scripts/lib.mjs', "export function hello() {}\nconst t = 2;\nexport { t as twice };\n");
  write('demo/data/seed.json', '{"from":"repo"}\n');
  write('demo/saves/game.json', '{"from":"repo"}\n');
  commit('v1');
  return { base, repo, home, write, git, commit, run, runAsync, installed, read };
}

test('installs the committed tree, never uncommitted edits', () => {
  const t = setup();
  t.write('demo/scripts/lib.mjs', "export function hello() {}\nexport const twice = 2;\nexport const draft = 1;\n");
  t.write('demo/scripts/wip.mjs', 'export const wip = 1;\n');
  const r = t.run('demo', '--ref', 'HEAD');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(t.read('scripts/lib.mjs'), /t as twice/);
  assert.doesNotMatch(t.read('scripts/lib.mjs'), /draft/);
  assert.ok(!fs.existsSync(t.installed('scripts/wip.mjs')));
  assert.ok(fs.existsSync(t.installed('scripts/index.html')));
  const marker = JSON.parse(t.read('.installed'));
  assert.equal(marker.ref, 'HEAD');
  assert.equal(marker.commit, t.git('rev-parse', 'HEAD').trim());
});

test('a broken import in the ref aborts with nothing installed', () => {
  const t = setup();
  assert.equal(t.run('demo', '--ref', 'HEAD').status, 0);
  const before = t.read('scripts/main.mjs');
  // main.mjs starts importing a name lib.mjs does not export — the blank-page bug.
  t.write('demo/scripts/main.mjs', "import { hello, cauldronsFound } from './lib.mjs';\nconsole.log(hello, cauldronsFound);\n");
  t.write('demo/scripts/extra.mjs', 'export const x = 1;\n');
  t.commit('broken');
  const r = t.run('demo', '--ref', 'HEAD');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /cauldronsFound/);
  assert.match(r.stderr, /nothing installed/);
  assert.equal(t.read('scripts/main.mjs'), before);
  assert.ok(!fs.existsSync(t.installed('scripts/extra.mjs')));

  // A syntax error aborts the same way.
  t.write('demo/scripts/main.mjs', 'export const = ;\n');
  t.commit('syntax');
  const s = t.run('demo', '--ref', 'HEAD');
  assert.notEqual(s.status, 0);
  assert.equal(t.read('scripts/main.mjs'), before);

  // A page pointing at a missing script aborts too.
  t.git('revert', '--no-edit', 'HEAD', 'HEAD~1');
  t.write('demo/scripts/index.html', '<script src="gone.js"></script>\n');
  t.commit('missing asset');
  const m = t.run('demo', '--ref', 'HEAD');
  assert.notEqual(m.status, 0);
  assert.match(m.stderr, /gone\.js/);
});

test('user state (data/, config.json, cloud.save) is never touched; nothing is deleted', () => {
  const t = setup();
  fs.mkdirSync(t.installed('data'), { recursive: true });
  fs.mkdirSync(t.installed('saves'), { recursive: true });
  fs.writeFileSync(t.installed('data/seed.json'), '{"from":"user"}\n');
  fs.writeFileSync(t.installed('saves/game.json'), '{"from":"user"}\n');
  fs.writeFileSync(t.installed('config.json'), '{"key":"secret"}\n');
  fs.mkdirSync(t.installed('scripts'), { recursive: true });
  fs.writeFileSync(t.installed('scripts/old.js'), '// retired from the repo\n');
  const r = t.run('demo', '--ref', 'HEAD');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(t.read('data/seed.json'), '{"from":"user"}\n');
  assert.equal(t.read('saves/game.json'), '{"from":"user"}\n');
  assert.equal(t.read('config.json'), '{"key":"secret"}\n');
  assert.ok(fs.existsSync(t.installed('scripts/old.js')));
  assert.match(r.stdout, /scripts\/old\.js is in the install but not in the ref/);
});

test('--check reports drift and installs nothing; --dry-run changes nothing', () => {
  const t = setup();
  assert.equal(t.run('demo', '--ref', 'HEAD').status, 0);
  const clean = t.run('demo', '--ref', 'HEAD', '--check');
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /in sync/);

  fs.writeFileSync(t.installed('scripts/style.css'), 'body{color:red}\n');
  t.write('demo/scripts/new.js', 'export const n = 1;\n');
  t.commit('add new.js');
  const drift = t.run('demo', '--ref', 'HEAD', '--check');
  assert.notEqual(drift.status, 0);
  assert.match(drift.stdout, /differs\s+scripts\/style\.css/);
  assert.match(drift.stdout, /missing\s+scripts\/new\.js/);
  assert.ok(!fs.existsSync(t.installed('scripts/new.js')));

  // An installed page importing a name its installed neighbour lacks.
  fs.writeFileSync(t.installed('scripts/lib.mjs'), 'export function hello() {}\n');
  const links = t.run('demo', '--ref', 'HEAD', '--check');
  assert.match(links.stdout, /LINK .*twice/);

  const dry = t.run('demo', '--ref', 'HEAD', '--dry-run');
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.match(dry.stdout, /new\s+scripts\/new\.js/);
  assert.ok(!fs.existsSync(t.installed('scripts/new.js')));
});

test('the default ref is origin/main, fetched first', () => {
  const t = setup();
  const origin = path.join(t.base, 'origin.git');
  spawnSync('git', ['init', '-q', '--bare', origin]);
  t.git('remote', 'add', 'origin', origin);
  t.git('push', '-q', 'origin', 'main');
  t.write('demo/scripts/style.css', 'body{margin:0}\n');
  t.commit('local only, not pushed');
  const r = t.run('demo');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(t.read('scripts/style.css'), 'body{}\n');
  assert.equal(JSON.parse(t.read('.installed')).ref, 'origin/main');
});

test('a SKILL.md change asks the engine to reload; an engine that is down is said so', async () => {
  const t = setup();
  const hits = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => { hits.push({ method: req.method, url: req.url, type: req.headers['content-type'], body }); res.end('{}'); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = String(server.address().port);
  try {
    const first = await t.runAsync({ LINGGEN_PORT: port }, 'demo', '--ref', 'HEAD');
    assert.equal(first.status, 0, first.out);
    assert.equal(hits.length, 1, first.out);
    assert.deepEqual(hits[0], { method: 'POST', url: '/api/skills/reload', type: 'application/json', body: '{}' });

    t.write('demo/scripts/style.css', 'body{margin:0}\n');
    t.commit('page only');
    const pageOnly = await t.runAsync({ LINGGEN_PORT: port }, 'demo', '--ref', 'HEAD');
    assert.equal(pageOnly.status, 0, pageOnly.out);
    assert.equal(hits.length, 1, 'no reload when SKILL.md is unchanged');
  } finally {
    server.close();
  }

  t.write('demo/SKILL.md', '---\nname: demo\ndescription: d2\n---\nbody v2\n');
  t.commit('skill v2');
  const down = t.run('demo', '--ref', 'HEAD'); // LINGGEN_PORT=1: nothing listens
  assert.equal(down.status, 0, down.stdout + down.stderr);
  assert.match(down.stdout, /SKILL\.md changed/);
  assert.match(down.stdout, /engine not reachable on port 1/);
  assert.match(t.read('SKILL.md'), /body v2/);
});
