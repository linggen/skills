// The save's lock (rules/files.mjs): a call the engine's tool timeout killed
// while it held the lock (2026-10-15, two Looks timed out at 8 s under a load
// of ~82) left the lock behind, and the next call waited out its stale age.
// A lock whose holder no longer runs is taken at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { holderGone, withLock } from '../scripts/rules/files.mjs';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lj-lock-'));
// A pid that ran and is gone: a child that has exited.
const deadPid = () => spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout.trim();

test('a lock left by a process that is gone is taken at once, not after its stale age', () => {
  const d = dir(), file = path.join(d, 'state.json'), lock = `${file}.lock`;
  try {
    fs.writeFileSync(lock, deadPid());
    assert.equal(holderGone(lock), true);
    const t = Date.now();
    assert.equal(withLock(file, () => 'ran', () => 'busy'), 'ran');
    assert.ok(Date.now() - t < 1000, 'no wait');
    assert.equal(fs.existsSync(lock), false, 'released after');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('a lock a living process holds is still waited on (and answers busy once the wait runs out)', () => {
  const d = dir(), lock = path.join(d, 'x.lock');
  try {
    fs.writeFileSync(lock, String(process.ppid));
    assert.equal(holderGone(lock), false, 'the parent runs');
    fs.writeFileSync(lock, 'not a pid');
    assert.equal(holderGone(lock), false, 'an unreadable holder is left to the stale age');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
