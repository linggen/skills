// What is a person's own file inside an installed skill is decided in ONE place
// per repo, and the repos are held together by one file of cases:
// tests/user-state-cases.json — byte-identical to the engine's
// crates/linggen-engine/src/extensions/user_state_cases.json (the engine's
// marketplace update runs the same cases in its own test).
//
// Here every installer in THIS repo runs the cases against a scratch HOME:
// scripts/install-skill.mjs and pulse/install.sh. The same installed folder,
// with the same person's files in it, must come through an update with those
// files unchanged; shipped files are updated; a file the skill stopped
// shipping is removed (install.sh never deletes — it is rsync without
// --delete, since the 2026-09-10 wipe).
//
//   node --test tests/user-state.test.mjs
//   USER_STATE_TABLE=1 node --test tests/user-state.test.mjs   # print what each installer did
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES_FILE = path.join(ROOT, 'tests', 'user-state-cases.json');
// The engine's test pins the same value (user_state_cases.json). Change the cases
// in BOTH repos, then both pins.
const CASES_SHA256 = '49fd47c8e18f5cc06313b101a719dee704a05801d7647cbe880d7af548d4c1fa';
const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));

const BASES = [];
after(() => { for (const b of BASES) fs.rmSync(b, { recursive: true, force: true }); });

// ── the cases, as files ─────────────────────────────────────────────────────
// v2 is longer than v1: rsync skips a file whose size and time are unchanged.
// Valid JSON for a .json file (pulse/install.sh merges config.json with jq), a comment elsewhere.
const label = (rel, version) => `${rel} ${version === 'v1' ? 'v1' : 'v2, a later release'}`;
const shippedText = (rel, version) => rel.endsWith('.json') ? `{"shipped": "${label(rel, version)}"}\n` : `// ${label(rel, version)}\n`;
const mineText = rel => `{\n  "mine": "${rel}"\n}\n`;

// What a release ships. A kept path is shipped too (a seed, a template): the
// person's copy must still win. SKILL.md carries the declaration.
function releaseTree(version, skillName) {
  const files = new Map();
  files.set('SKILL.md', cases.skill_md.replace('name: demo', `name: ${skillName}`) + `body ${version}\n`);
  for (const rel of [...cases.shipped, ...cases.kept, cases.marker]) files.set(rel, shippedText(rel, version));
  if (version === 'v1') for (const rel of cases.dropped) files.set(rel, shippedText(rel, version));
  return files;
}

const write = (root, rel, text) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const readOrNull = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };

// The person writes their own files into the installed folder.
// The marker is the previous installer's record: a later installer may stamp its own, but never lose it or replace it with the shipped copy.
const personWrites = installDir => {
  for (const rel of cases.kept) write(installDir, rel, mineText(rel));
  write(installDir, cases.marker, '{"by": "an earlier install"}\n');
};

// ── what an update did, per case ────────────────────────────────────────────
function outcomes(installDir) {
  const rows = [];
  for (const rel of cases.kept) {
    const now = readOrNull(installDir, rel);
    rows.push({ rel, kind: 'kept', ok: now === mineText(rel), saw: now === null ? 'LOST' : now === mineText(rel) ? 'kept' : 'OVERWRITTEN' });
  }
  const marker = readOrNull(installDir, cases.marker);
  rows.push({ rel: cases.marker, kind: 'marker', ok: marker !== null && marker !== shippedText(cases.marker, 'v2'), saw: marker === null ? 'LOST' : marker === shippedText(cases.marker, 'v2') ? 'OVERWRITTEN' : 'kept' });
  for (const rel of cases.shipped) {
    const now = readOrNull(installDir, rel);
    rows.push({ rel, kind: 'shipped', ok: now === shippedText(rel, 'v2'), saw: now === null ? 'MISSING' : now === shippedText(rel, 'v2') ? 'updated' : 'STALE' });
  }
  for (const rel of cases.dropped) {
    const now = readOrNull(installDir, rel);
    rows.push({ rel, kind: 'dropped', ok: now === null, saw: now === null ? 'removed' : 'left in place' });
  }
  return rows;
}

function report(installer, rows) {
  if (!process.env.USER_STATE_TABLE) return;
  console.error(`\n== ${installer}`);
  for (const r of rows) console.error(`  ${r.kind.padEnd(8)} ${r.rel.padEnd(26)} ${r.saw}`);
}

function assertRows(installer, rows, { removesDropped = true } = {}) {
  report(installer, rows);
  const bad = rows.filter(r => !r.ok && !(r.kind === 'dropped' && !removesDropped));
  assert.deepEqual(bad.map(r => `${r.kind} ${r.rel}: ${r.saw}`), [], `${installer}: an update changed what it must not, or missed what it must`);
}

// ── scratch repo + HOME ─────────────────────────────────────────────────────
function scratch() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'user-state-test-'));
  BASES.push(base);
  const repo = path.join(base, 'repo');
  const home = path.join(base, 'home');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(path.join(home, '.linggen', 'skills'), { recursive: true });
  const env = {
    ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', LINGGEN_PORT: '1',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  };
  delete env.LINGGEN_SKILLS_DIR;
  const git = (...args) => { const r = spawnSync('git', ['-C', repo, ...args], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  const commitTree = (skillDir, tree, extra = {}) => {
    fs.rmSync(path.join(repo, skillDir), { recursive: true, force: true });
    for (const [rel, text] of tree) write(path.join(repo, skillDir), rel, text);
    for (const [rel, text] of Object.entries(extra)) write(path.join(repo, skillDir), rel, text);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'release');
  };
  git('init', '-q', '-b', 'main');
  return { base, repo, home, env, git, commitTree };
}

// ── install-skill.mjs ───────────────────────────────────────────────────────
test('install-skill.mjs: an update keeps every file of the person\'s', () => {
  const s = scratch();
  fs.mkdirSync(path.join(s.repo, 'scripts'));
  for (const f of ['install-skill.sh', 'install-skill.mjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(s.repo, 'scripts', f));
  fs.chmodSync(path.join(s.repo, 'scripts', 'install-skill.sh'), 0o755);
  const run = () => spawnSync(path.join(s.repo, 'scripts', 'install-skill.sh'), ['demo', '--ref', 'HEAD'], { env: s.env, encoding: 'utf8' });
  const installDir = path.join(s.home, '.linggen', 'skills', 'demo');

  s.commitTree('demo', releaseTree('v1', 'demo'));
  const first = run();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  for (const rel of cases.shipped) assert.equal(readOrNull(installDir, rel), shippedText(rel, 'v1'), `first install: ${rel}`);

  personWrites(installDir);
  s.commitTree('demo', releaseTree('v2', 'demo'));
  const update = run();
  assert.equal(update.status, 0, update.stdout + update.stderr);
  assertRows('install-skill.mjs', outcomes(installDir));
});

// ── pulse/install.sh ────────────────────────────────────────────────────────
test('pulse/install.sh: an update keeps every file of the person\'s', () => {
  const s = scratch();
  const installDir = path.join(s.home, '.linggen', 'skills', 'pulse');
  const extra = {
    'install.sh': fs.readFileSync(path.join(ROOT, 'pulse', 'install.sh'), 'utf8'),
    'config.example.json': '{}\n',
    'references/brief.example.md': 'brief\n',
  };
  const run = () => spawnSync('bash', [path.join(s.repo, 'pulse', 'install.sh')], { env: s.env, encoding: 'utf8' });

  s.commitTree('pulse', releaseTree('v1', 'pulse'), extra);
  const first = run();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  for (const rel of cases.shipped) assert.equal(readOrNull(installDir, rel), shippedText(rel, 'v1'), `first install: ${rel}`);

  personWrites(installDir);
  s.commitTree('pulse', releaseTree('v2', 'pulse'), extra);
  const update = run();
  assert.equal(update.status, 0, update.stdout + update.stderr);
  // install.sh is rsync without --delete: a dropped file stays (the 2026-09-10 wipe).
  assertRows('pulse/install.sh', outcomes(installDir), { removesDropped: false });
});

// ── the contract is the same file in both repos ─────────────────────────────
test('the cases file is the one the engine runs', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(CASES_FILE)).digest('hex');
  assert.equal(sha, CASES_SHA256, 'tests/user-state-cases.json changed: copy it to linggen/crates/linggen-engine/src/extensions/user_state_cases.json and set the sha256 in both tests');
  // With an engine checkout at hand, compare the bytes themselves.
  const engine = process.env.LINGGEN_ENGINE_DIR;
  if (!engine) return;
  const theirs = fs.readFileSync(path.join(engine, 'crates/linggen-engine/src/extensions/user_state_cases.json'));
  assert.ok(theirs.equals(fs.readFileSync(CASES_FILE)), 'the engine holds a different cases file');
});
