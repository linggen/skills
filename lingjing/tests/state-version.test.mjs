// The save's version is the last migration step's number (state.mjs MIGRATIONS), derived, never typed. Reason: the
// migration returns early when a save's version reaches STATE_VERSION, so a step added past a hand-typed constant would
// never run on anyone's save (skills review, 2026-11-20). Locked here: the steps run in order with no gap, the version is
// the last step, SKILL.md's `newest` follows it (sync-further.test.mjs), and a save from every earlier version is carried
// to it. Bumping the rules is adding a step; nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS, STATE_VERSION, migrate } from '../scripts/state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'saves', 'waimen.json'), 'utf8'));
const fixture = () => structuredClone(base.state ?? base);
const numbers = MIGRATIONS.map(([to]) => to);

test('the migration steps are strictly increasing, one per version, no gap from the first to the last', () => {
  assert.ok(numbers.length > 0, 'a table of steps');
  assert.ok(numbers.every(Number.isInteger), 'whole numbers');
  // The first step covers v1–v4 together (state.mjs comment); every step after it is the next number.
  for (let i = 1; i < numbers.length; i++) assert.equal(numbers[i], numbers[i - 1] + 1, `step ${numbers[i]} follows step ${numbers[i - 1]}`);
  assert.ok(MIGRATIONS.every(([, step]) => typeof step === 'function'), 'each step is a function');
});

test('the save version is the last migration step, and the table cannot be changed from outside', () => {
  assert.equal(STATE_VERSION, numbers.at(-1));
  assert.ok(Object.isFrozen(MIGRATIONS), 'frozen: the version is derived once');
});

test('a save from every earlier version is carried to the newest; one at the newest is left as it is', () => {
  for (let v = 1; v < STATE_VERSION; v++) {
    const old = { ...fixture(), version: v };
    const m = migrate(old);
    assert.equal(m.version, STATE_VERSION, `from v${v}`);
    assert.equal(old.version, v, `v${v}: the save handed in is not written`);
  }
  const now = { ...fixture(), version: STATE_VERSION };
  assert.equal(migrate(now), now);
});
