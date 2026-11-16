// What Health tells the world block and the activity log: readings with the
// person's own usual beside them, no verdict words, and a workout that just
// arrived. Invented values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FIELDS, lastWorkout, worldOf, workoutRecords } from '../scripts/world.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INGEST = path.join(HERE, '..', 'scripts', 'ingest.mjs');

const verdict = (type, now, normal, unit, series_to, extra = {}) => ({ type, label: 'x', verdict: 'normal', unit, now, normal, series_to, ...extra });
const review = {
  date: '2026-11-16',
  examined: 8, normal: 6, see: 2, doc: 0,
  verdicts: [
    verdict('HKQuantityTypeIdentifierStepCount', 6240.4, 7123.45, 'count', '2026-11-15'),
    verdict('HKCategoryTypeIdentifierSleepAnalysis', 7.14, 7.02, 'h', '2026-11-16'),
    verdict('HKQuantityTypeIdentifierRestingHeartRate', 58.2, 60, 'bpm', '2026-11-16', { verdict: 'see', headline: 'Low' }),
    verdict('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 27.4, 35.2, 'ms', '2026-11-16'),
    verdict('HKQuantityTypeIdentifierVO2Max', 41, 40, 'ml/kg/min', '2026-11-16'),
  ],
};
const workoutRow = (uuid, end, extra = {}) => ({ uuid, type: 'workouts', start: end, end, duration_s: 2520, activity: 'running', source: 'Watch', ...extra });

test('the review becomes readings with the usual beside them; a day total says its day', () => {
  const world = worldOf({ review, workout: { activity: 'running', minutes: 42, day: '11-14' } });
  assert.deepEqual(world, {
    steps: '6240 on 11-15, usual 7123',
    sleep: '7.1 h, usual 7',
    resting_hr: '58, usual 60',
    hrv: '27 ms, usual 35',
    workout: 'running 42 min on 11-14',
  });
  assert.deepEqual(Object.keys(world), FIELDS);
});

test('no verdict word, count or score travels', () => {
  const text = JSON.stringify(worldOf({ review, workout: null })).toLowerCase();
  for (const word of ['verdict', 'headline', 'examined', 'score', 'low', 'poor', 'recovered', 'worth', 'doctor']) {
    assert.ok(!text.includes(word), word);
  }
  assert.ok(!text.includes('vo2'), 'only the declared measurements travel');
});

test('a reading that is not there is absent, never zero', () => {
  assert.deepEqual(worldOf({}), {});
  assert.deepEqual(worldOf({ review: { date: '2026-11-16', verdicts: [verdict('HKQuantityTypeIdentifierStepCount', null, 5000, 'count', '2026-11-15')] } }), {});
  const noUsual = worldOf({ review: { date: '2026-11-16', verdicts: [{ type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', now: 30, unit: 'ms', series_to: '2026-11-16' }] } });
  assert.deepEqual(noUsual, { hrv: '30 ms' });
});

test('the whole line fits the world block, long values included', () => {
  const worst = worldOf({
    review: { date: '2026-11-16', verdicts: [
      verdict('HKQuantityTypeIdentifierStepCount', 12345, 10234, 'count', '2026-11-15'),
      verdict('HKCategoryTypeIdentifierSleepAnalysis', 7.1, 7.0, 'h', '2026-11-16'),
      verdict('HKQuantityTypeIdentifierRestingHeartRate', 58.2, 60.4, 'bpm', '2026-11-16'),
      verdict('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 27.4, 35.2, 'ms', '2026-11-16'),
    ] },
    workout: { activity: 'functional_strength_training', minutes: 105, day: '11-14' },
  });
  assert.match(worst.workout, /^functional /);
  const line = `health: ${Object.entries(worst).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')} · 59m ago`;
  assert.ok(line.length <= 160, `${line.length}: ${line}`);
  for (const [k, v] of Object.entries(worst)) {
    assert.match(k, /^[a-z0-9_]+$/);
    assert.ok(v.length <= 48, k);
  }
});

test('the last workout is the newest one not deleted', () => {
  const rows = [
    workoutRow('a', '2026-11-10T07:00:00Z'),
    workoutRow('b', '2026-11-14T18:30:00Z', { duration_s: 1800, activity: 'cycling' }),
    workoutRow('c', '2026-11-15T09:00:00Z'),
    { del: 'c', at: '2026-11-15T10:00:00Z' },
  ];
  const w = lastWorkout(rows);
  assert.equal(w.activity, 'cycling');
  assert.equal(w.minutes, 30);
  assert.match(w.day, /^11-1[45]$/);
  assert.equal(lastWorkout([]), null);
});

test('a workout that ended within a day is news; a backfill is not; at most three', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  const fresh = workoutRow('a', '2026-11-16T11:00:00Z');
  const old = [1, 2, 3, 4].map((i) => workoutRow(`o${i}`, `2025-0${i}-10T07:00:00Z`));
  assert.deepEqual(workoutRecords([...old, { type: 'steps', start: '2026-11-16T11:00:00Z', duration_s: 5 }], now), []);
  const [rec] = workoutRecords([...old, fresh], now);
  assert.deepEqual(rec, { by: 'user', app: 'health', verb: 'workout', object: 'running 42 min', detail: { kind: 'running', minutes: 42 } });
  assert.ok(!('seconds' in rec.detail), 'a duration of use would hide the record from the doorbell');
  const many = [1, 2, 3, 4, 5].map((i) => workoutRow(`n${i}`, `2026-11-16T0${i}:00:00Z`));
  assert.equal(workoutRecords(many, now).length, 3);
});

test('SKILL.md declares the line and the verb the code writes', () => {
  const md = fs.readFileSync(path.join(HERE, '..', 'SKILL.md'), 'utf8');
  assert.match(md, /^activity-verbs: \[workout\]$/m);
  const fields = /^ {2}fields: \[(.*)\]$/m.exec(md)[1].split(',').map((s) => s.trim());
  assert.deepEqual(fields, FIELDS);
  assert.match(md, /^ {2}file: data\/world\.json$/m);
});

// ── the writer: world.json beside the mirror, and the post ──────────────────

const b64 = (body) => zlib.gzipSync(Buffer.from(JSON.stringify(body))).toString('base64');
function ingest(dir, verb, body, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [INGEST, verb, b64(body)], { env: { ...process.env, HEALTH_DIR: dir, LINGGEN_PORT: '1', ...env } });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', () => resolve({ out: JSON.parse(out.trim().split('\n').pop()), err }));
  });
}

test('a review that lands writes world.json once; the same facts again leave the file alone; a workout is posted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-world-'));
  const seen = [];
  const door = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      seen.push(body);
      res.statusCode = body.verb === 'workout' ? 200 : 400;
      res.end(JSON.stringify(body.verb === 'workout' ? { ok: true } : { error: 'refused' }));
    });
  });
  await new Promise((r) => door.listen(0, '127.0.0.1', r));
  const port = String(door.address().port);
  const world = path.join(dir, 'data', 'world.json');
  try {
    const pushed = await ingest(dir, 'push', { registers: { 'review/2026-11-16.json': { ...review, written_at: '2026-11-16T05:00:00Z' } } });
    assert.deepEqual(pushed.out.wrote, ['review/2026-11-16.json']);
    const first = JSON.parse(fs.readFileSync(world, 'utf8'));
    assert.equal(first.steps, '6240 on 11-15, usual 7123');
    assert.equal(first.workout, undefined);
    const stamp = fs.statSync(world).mtimeMs;
    await new Promise((r) => setTimeout(r, 25));
    // a batch with no workout changes nothing the line holds
    await ingest(dir, 'samples', { device: 'phone', rows: [{ uuid: 's1', type: 'steps', start: '2026-11-16T08:00:00Z', end: '2026-11-16T08:05:00Z', value: 1 }] });
    assert.equal(fs.statSync(world).mtimeMs, stamp, 'unchanged facts leave the modification time alone');
    // a workout that ended just now: filed, shown on the line, posted (HEALTH_TELL lets the test reach its own door)
    const end = new Date(Date.now() - 10 * 60e3).toISOString();
    const filed = await ingest(dir, 'samples', { device: 'phone', rows: [workoutRow('w1', end, { duration_s: 1800, activity: 'cycling' })] }, { LINGGEN_PORT: port, HEALTH_TELL: '1' });
    assert.equal(filed.out.added, 1);
    assert.match(JSON.parse(fs.readFileSync(world, 'utf8')).workout, /^cycling 30 min on \d\d-\d\d$/);
    assert.equal(seen.length, 1);
    assert.deepEqual([seen[0].app, seen[0].verb, seen[0].object], ['health', 'workout', 'cycling 30 min']);
    // under a test's HEALTH_DIR nothing is posted unless asked
    seen.length = 0;
    await ingest(dir, 'samples', { device: 'phone', rows: [workoutRow('w2', new Date(Date.now() - 5 * 60e3).toISOString())] }, { LINGGEN_PORT: port });
    assert.equal(seen.length, 0);
    // a refusal is said on stderr, in one line
    const refused = await ingest(dir, 'samples', { device: 'phone', rows: [workoutRow('w3', new Date().toISOString())] }, { LINGGEN_PORT: port, HEALTH_TELL: '1' });
    assert.equal(seen.length, 1);
    assert.equal(refused.err, '');
  } finally {
    door.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
