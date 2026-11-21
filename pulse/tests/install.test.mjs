// Exercise the standalone installer against a disposable HOME, never the live install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('installs every tracked Pulse file and preserves user state on upgrade', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-install-'));
  try {
    const dest = path.join(home, '.linggen/skills/pulse');
    const write = (rel, text) => { const p = path.join(dest, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
    const state = ['config.json', 'data/own.json', 'state/own.json', 'sessions/own.json', '.installed', 'scripts/own.local.js', 'references/brief.md'];
    const contents = rel => rel === 'config.json' ? '{"personal":true}\n' : `personal ${rel}\n`;
    for (const rel of state) write(rel, contents(rel));
    const run = () => spawnSync('bash', [path.join(root, 'pulse/install.sh')], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
    const result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const upgrade = run();
    assert.equal(upgrade.status, 0, upgrade.stdout + upgrade.stderr);
    const listed = spawnSync('git', ['ls-files', '-z', 'pulse/'], { cwd: root, encoding: 'utf8' });
    assert.equal(listed.status, 0, listed.stderr);
    const files = listed.stdout.split('\0').filter(Boolean).map(p => p.slice('pulse/'.length));
    const missing = files.filter(rel => !fs.existsSync(path.join(dest, rel)));
    assert.deepEqual(missing, [], `missing tracked files: ${missing.join(', ')}`);
    for (const rel of state) assert.equal(fs.readFileSync(path.join(dest, rel), 'utf8'), contents(rel), rel);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
