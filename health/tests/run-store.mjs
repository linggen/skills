// run-store.mjs — the mirror's rules: what a batch files, what it refuses,
// which copy of a register wins, and what a replay costs.
// Run: node tests/run-store.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fold, mergeNotes, monthOf, newer, parseLines, planWrite, summarize, wins } from '../scripts/store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INGEST = path.join(HERE, '..', 'scripts', 'ingest.mjs');

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass += 1;
  console.log(`  ok  ${name}`);
};

const sample = (uuid, type, start, extra = {}) => ({
  uuid,
  type,
  start,
  end: start,
  source: 'Watch',
  value: 1,
  ...extra,
});

// ── the model ────────────────────────────────────────────────────────────────

ok('a row is filed by the month it started in, and a startless one is unknown', () => {
  assert.equal(monthOf('2026-09-03T10:00:00Z'), '2026-09');
  assert.equal(monthOf(undefined), 'unknown');
  assert.equal(monthOf('26'), 'unknown');
});

ok('a torn line is skipped, not fatal', () => {
  const rows = parseLines('{"a":1}\n{"b":2\n{"c":3}\n\n');
  assert.deepEqual(rows, [{ a: 1 }, { c: 3 }]);
});

ok('the ledger folds count, span and sources; deletions count apart', () => {
  const l = fold(undefined, [
    sample('a', 'steps', '2026-09-02T08:00:00Z'),
    sample('b', 'steps', '2026-09-01T08:00:00Z', { source: 'iPhone' }),
    { del: 'a', at: '2026-09-03T08:00:00Z' },
  ]);
  assert.equal(l.count, 2);
  assert.equal(l.deleted, 1);
  assert.equal(l.first, '2026-09-01T08:00:00Z');
  assert.equal(l.last, '2026-09-02T08:00:00Z');
  assert.deepEqual(l.sources.sort(), ['Watch', 'iPhone']);
});

ok('one source cannot grow the ledger without end', () => {
  const rows = [];
  for (let i = 0; i < 40; i += 1) {
    rows.push(sample(`u${i}`, 'steps', '2026-09-02T08:00:00Z', { source: `app-${i}` }));
  }
  assert.equal(fold(undefined, rows).sources.length, 8);
});

ok('a batch splits by type and month, and a uuid already held is not filed twice', () => {
  const seen = new Set(['steps:old']);
  const { files, counts } = planWrite(
    [
      sample('new', 'steps', '2026-09-02T08:00:00Z'),
      sample('old', 'steps', '2026-09-02T09:00:00Z'),
      sample('aug', 'steps', '2026-08-30T09:00:00Z'),
      sample('w1', 'workouts', '2026-09-02T09:00:00Z'),
    ],
    seen,
  );
  assert.equal(counts.added, 3);
  assert.equal(counts.duplicate, 1);
  assert.deepEqual([...files.keys()].sort(), [
    'steps/2026-08',
    'steps/2026-09',
    'workouts/2026-09',
  ]);
});

ok('a row with no type or no start is counted as unfiled, never guessed at', () => {
  const { files, counts } = planWrite(
    [{ uuid: 'x', start: '2026-09-02T08:00:00Z' }, { uuid: 'y', type: 'steps' }],
    new Set(),
  );
  assert.equal(counts.unfiled, 2);
  assert.equal(files.size, 0);
});

ok('a deletion is filed by when it was noticed and is spent once', () => {
  const seen = new Set();
  const first = planWrite([{ type: 'steps', del: 'a', at: '2026-09-03T08:00:00Z' }], seen);
  assert.equal(first.counts.deleted, 1);
  assert.deepEqual([...first.files.keys()], ['steps/2026-09']);
  const again = planWrite([{ type: 'steps', del: 'a', at: '2026-09-03T08:00:00Z' }], seen);
  assert.equal(again.counts.deleted, 0);
  assert.equal(again.counts.duplicate, 1);
});

ok('the newer written_at wins, and an unstamped file never overwrites a dated one', () => {
  const mine = { written_at: '2026-09-03T10:00:00Z', n: 1 };
  const theirs = { written_at: '2026-09-03T11:00:00Z', n: 2 };
  assert.equal(newer(mine, theirs), theirs);
  assert.equal(newer(theirs, mine), theirs);
  assert.equal(newer(null, mine), mine);
  assert.equal(wins({ n: 3 }, mine), false);
  assert.equal(wins(theirs, mine), true);
  assert.equal(wins(mine, null), true);
});

ok('notes are a union, and only the same time AND text is one note twice', () => {
  const merged = mergeNotes(
    [{ at: '2026-09-02T10:00:00Z', text: 'knee sore' }],
    [
      { at: '2026-09-02T10:00:00Z', text: 'knee sore' },
      { at: '2026-09-02T10:00:00Z', text: '4 sets legs' },
      { at: '2026-09-01T10:00:00Z', text: 'protein shake' },
    ],
  );
  assert.deepEqual(merged.map((n) => n.text), ['protein shake', 'knee sore', '4 sets legs']);
});

ok('the summary counts only types that hold something', () => {
  const s = summarize({
    steps: { count: 10, first: '2026-08-01', last: '2026-09-02' },
    sleep: { count: 0 },
    workouts: { count: 3, first: '2026-07-01', last: '2026-09-03' },
  });
  assert.deepEqual(s, { types: 2, samples: 13, first: '2026-07-01', last: '2026-09-03' });
});

// ── the writer, end to end ───────────────────────────────────────────────────

const run = (dir, verb, body, { gzipped = true } = {}) => {
  const args = [INGEST, verb];
  if (body !== undefined) {
    const json = Buffer.from(JSON.stringify(body));
    args.push((gzipped ? zlib.gzipSync(json) : json).toString('base64'));
  }
  const out = execFileSync(process.execPath, args, {
    env: { ...process.env, HEALTH_DIR: dir },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-mirror-'));

ok('the identity is minted once and kept, so a read never invents one', () => {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'health-id-'));
  const first = run(fresh, 'ledger').mirror_id;
  assert.ok(first);
  assert.equal(run(fresh, 'ledger').mirror_id, first);
  assert.equal(run(fresh, 'report').mirror_id, first);
  // A phone comparing two different ids would reset its positions and re-send
  // its whole history on every sync.
  const onDisk = JSON.parse(fs.readFileSync(path.join(fresh, 'data', 'state.json'), 'utf8'));
  assert.equal(onDisk.mirror_id, first);
  fs.rmSync(fresh, { recursive: true, force: true });
});

ok('a batch lands, and the same batch again adds nothing', () => {
  const rows = [
    sample('a', 'steps', '2026-09-02T08:00:00Z'),
    sample('b', 'steps', '2026-09-02T09:00:00Z'),
  ];
  const first = run(tmp, 'samples', { device: 'phone-1', rows });
  assert.equal(first.ok, true);
  assert.equal(first.added, 2);
  assert.equal(first.held.samples, 2);

  const again = run(tmp, 'samples', { device: 'phone-1', rows, mirror_id: first.mirror_id });
  assert.equal(again.added, 0);
  assert.equal(again.duplicate, 2);
  assert.equal(again.held.samples, 2);

  const file = path.join(tmp, 'data', 'samples', 'steps', '2026-09.jsonl');
  assert.equal(parseLines(fs.readFileSync(file, 'utf8')).length, 2);
});

ok('a phone sending against a mirror that was made again is told, not filed', () => {
  const r = run(tmp, 'samples', {
    device: 'phone-1',
    mirror_id: 'a-mirror-that-is-gone',
    rows: [sample('c', 'steps', '2026-09-02T10:00:00Z')],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /made again/);
  assert.equal(run(tmp, 'ledger').held.samples, 2);
});

ok('registers go up when they are newer and are kept when they are not', () => {
  const id = run(tmp, 'ledger').mirror_id;
  const first = run(tmp, 'push', {
    mirror_id: id,
    registers: { 'profile.json': { written_at: '2026-09-03T10:00:00Z', goal: 'bulking' } },
  });
  assert.deepEqual(first.wrote, ['profile.json']);

  const stale = run(tmp, 'push', {
    mirror_id: id,
    registers: { 'profile.json': { written_at: '2026-09-03T09:00:00Z', goal: 'cutting' } },
  });
  assert.deepEqual(stale.kept, ['profile.json']);

  const back = run(tmp, 'pull', { names: ['profile.json', 'layout.json'] }, { gzipped: false });
  assert.equal(back.registers['profile.json'].goal, 'bulking');
  assert.equal('layout.json' in back.registers, false);
});

ok('notes merge rather than replace, whichever side is newer', () => {
  const id = run(tmp, 'ledger').mirror_id;
  run(tmp, 'push', {
    mirror_id: id,
    registers: { 'notes.jsonl': [{ at: '2026-09-01T10:00:00Z', text: 'knee sore' }] },
  });
  run(tmp, 'push', {
    mirror_id: id,
    registers: { 'notes.jsonl': [{ at: '2026-09-02T10:00:00Z', text: '4 sets legs' }] },
  });
  const back = run(tmp, 'pull', { names: ['notes.jsonl'] }, { gzipped: false });
  assert.deepEqual(back.registers['notes.jsonl'].map((n) => n.text), ['knee sore', '4 sets legs']);
});

ok('a register name that is a path is refused', () => {
  let threw = false;
  try {
    run(tmp, 'push', { registers: { '../../../etc/passwd.json': { a: 1 } } });
  } catch (e) {
    threw = true;
    assert.match(String(e.stderr || e.message), /not a register name/);
  }
  assert.equal(threw, true);
});

ok('a batch may arrive as plain JSON as well as gzipped', () => {
  const id = run(tmp, 'ledger').mirror_id;
  const r = run(
    tmp,
    'samples',
    { device: 'phone-1', mirror_id: id, rows: [sample('d', 'sleep', '2026-09-02T23:00:00Z')] },
    { gzipped: false },
  );
  assert.equal(r.added, 1);
});

ok('the cursor a phone reports comes back to it', () => {
  const id = run(tmp, 'ledger').mirror_id;
  run(tmp, 'samples', {
    device: 'phone-1',
    mirror_id: id,
    cursor: { 'steps/2026-09': 210 },
    rows: [sample('e', 'steps', '2026-09-02T11:00:00Z')],
  });
  const back = run(tmp, 'pull', { device: 'phone-1', names: [] }, { gzipped: false });
  assert.deepEqual(back.cursor, { 'steps/2026-09': 210 });
  assert.equal(run(tmp, 'pull', { device: 'phone-2', names: [] }, { gzipped: false }).cursor, null);
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} checks passed`);
