// Exercise the standalone installer against a disposable HOME, never the live install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const listed = spawnSync('git', ['ls-files', '-z', 'pulse/'], { cwd: root, encoding: 'utf8' });
assert.equal(listed.status, 0, listed.stderr);
const files = listed.stdout.split('\0').filter(Boolean).map(p => p.slice('pulse/'.length));
const hasJq = spawnSync('jq', ['--version']).status === 0;

function checkInstall(source, home, t) {
  const dest = path.join(home, '.linggen/skills/pulse');
  const write = (rel, text) => { const p = path.join(dest, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  const state = ['data/own.json', 'state/own.json', 'sessions/own.json', '.installed', 'scripts/own.local.js', 'references/brief.md'];
  const contents = rel => `personal ${rel}\n`;
  for (const rel of state) write(rel, contents(rel));
  const defaults = JSON.parse(fs.readFileSync(path.join(source, 'config.example.json'), 'utf8'));
  const defaultKey = Object.keys(defaults)[0];
  assert.ok(defaultKey, 'example config must have a default key');
  const sharedKey = Object.keys(defaults)[1];
  assert.ok(sharedKey, 'example config must have another key to override');
  const personal = { personal: true, anotherPersonalKey: 'keep me', [sharedKey]: 'my value' };
  assert.ok(!(defaultKey in personal));
  write('config.json', JSON.stringify(personal));
  const run = () => spawnSync('bash', [path.join(source, 'install.sh')], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  for (const result of [run(), run()]) assert.equal(result.status, 0, result.stdout + result.stderr);
  const missing = files.filter(rel => !fs.existsSync(path.join(dest, rel)));
  assert.deepEqual(missing, [], `missing tracked files: ${missing.join(', ')}`);
  for (const rel of state) assert.equal(fs.readFileSync(path.join(dest, rel), 'utf8'), contents(rel), rel);
  const config = JSON.parse(fs.readFileSync(path.join(dest, 'config.json'), 'utf8'));
  for (const [key, value] of Object.entries(personal)) assert.deepEqual(config[key], value, key);
  if (hasJq) assert.deepEqual(config[defaultKey], defaults[defaultKey], 'new default key is merged');
  else t.diagnostic('jq not installed: skipping new default key assertion');
}

test('installs every tracked Pulse file and preserves user state on upgrade', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-install-'));
  try { checkInstall(path.join(root, 'pulse'), home, t); }
  finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('installs an archive outside a git checkout and preserves user state', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-archive-'));
  try {
    const source = path.join(temp, 'pulse');
    fs.cpSync(path.join(root, 'pulse'), source, { recursive: true });
    const git = spawnSync('git', ['-C', source, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
    assert.notEqual(git.status, 0, 'archive must be outside a git checkout');
    checkInstall(source, path.join(temp, 'home'), t);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
