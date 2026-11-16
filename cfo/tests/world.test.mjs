// CFO's line in the world block carries no money fact: the day of the last
// import and how many are in force, nothing from the ledger. Invented values.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldOf } from '../scripts/world.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = [
  { id: 'imp_a', file: 'alex-chequing-2026-09.csv', account: 'Alex Chequing', added: 41, rows: 41, added_ids: ['x'], at: '2026-10-02T15:00:00Z' },
  { id: 'imp_b', file: 'alex-card-2026-10.csv', account: 'Alex Card 4417', added: 12, rows: 12, added_ids: ['y'], at: '2026-11-12T18:30:00Z' },
  { id: 'imp_c', file: 'alex-card-2026-11.csv', account: 'Alex Card 4417', added: 3, rows: 3, added_ids: ['z'], at: '2026-11-13T09:00:00Z', reverted: true },
  { id: 'imp_d', file: 'alex-card-2026-10b.csv', account: 'Alex Card 4417', added: 5, rows: 5, added_ids: ['w'], at: '2026-10-20T09:00:00Z' },
];

test('the line is the last import\'s day, how many are in force and from how many accounts', () => {
  const world = worldOf(log);
  assert.deepEqual(Object.keys(world), ['last_import', 'imports', 'sources']);
  assert.match(world.last_import, /^2026-11-1[23]$/); // the local day of 2026-11-12T18:30Z, an undone import not counted
  assert.equal(world.imports, 3);
  assert.equal(world.sources, 2);
});

test('nothing from the ledger travels: no file, account, count of rows or id', () => {
  const text = JSON.stringify(worldOf(log));
  for (const secret of ['alex', 'Alex', 'chequing', 'Chequing', '4417', '.csv', 'imp_', 'added', 'rows', 'account', 'file']) {
    assert.ok(!text.includes(secret), secret);
  }
  assert.ok(Object.values(worldOf(log)).every((v) => typeof v === 'string' || Number.isInteger(v)));
});

test('an undone import leaves the line; none in force is no line', () => {
  assert.deepEqual(worldOf([{ ...log[0], reverted: true }]), {});
  assert.deepEqual(worldOf([]), {});
  assert.deepEqual(worldOf(null), {});
  assert.deepEqual(worldOf([{ id: 'x', at: 'not a time' }, null, 7]), {});
  assert.equal(worldOf([log[0], { ...log[1], reverted: true }]).imports, 1);
});

test('the module reads the import log and nothing else', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'scripts', 'world.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/^\s*import /m.test(src), 'no import: it cannot reach the ledger, the report or the quotes');
  for (const word of ['amount', 'balance', 'spend', 'ticker', 'holding', 'shares']) assert.ok(!src.includes(word), word);
});

test('SKILL.md declares the line the code writes, and no activity verb', () => {
  const md = fs.readFileSync(path.join(HERE, '..', 'SKILL.md'), 'utf8');
  assert.match(md, /^ {2}fields: \[last_import, imports, sources\]$/m);
  assert.match(md, /^ {2}file: data\/world\.json$/m);
  assert.ok(!/^activity-verbs:/m.test(md));
  const line = `cfo: ${Object.entries(worldOf(log)).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')} · 59m ago`;
  assert.ok(line.length <= 160);
});
