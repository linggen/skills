// Health's quest fact: only the newest long-enough workout crosses, and only
// as a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MIN_WORKOUT_S, questOf, questsDir, writeQuest } from '../scripts/quest.mjs';

const NOW = new Date('2026-09-11T18:00:00Z');
const row = (end, minutes) => ({
  type: 'workouts', start: end, end, duration_s: minutes * 60, energy_kcal: 400, activity: 'functionalStrength',
});
const doneAt = (rows) => questOf(rows, NOW).quests[0].done_at;

test('the newest workout of twenty minutes or more is the done time', () => {
  assert.equal(
    doneAt([row('2026-09-10T14:00:00Z', 45), row('2026-09-11T15:00:00Z', 30), row('2026-09-11T16:00:00Z', 10)]),
    '2026-09-11T15:00:00.000Z',
  );
});

test('too short, not yet over, or nothing at all is not done', () => {
  assert.equal(doneAt([row('2026-09-11T15:00:00Z', MIN_WORKOUT_S / 60 - 1)]), null);
  assert.equal(doneAt([row('2026-09-11T19:00:00Z', 60)]), null);
  assert.equal(doneAt([{ end: 'never', duration_s: 3600 }]), null);
  assert.equal(doneAt([]), null);
});

test('only the fact crosses — no duration, energy or kind', () => {
  const text = JSON.stringify(questOf([row('2026-09-11T15:00:00Z', 30)], NOW));
  for (const leak of ['duration', 'kcal', 'energy', 'functionalStrength']) assert.ok(!text.includes(leak), leak);
});

test('a mirror kept elsewhere never writes the real quest file', () => {
  const real = path.join('/home/x', '.linggen', 'quests');
  assert.equal(questsDir({ HOME: '/home/x' }), real);
  assert.notEqual(questsDir({ HOME: '/home/x', HEALTH_DIR: '/tmp/h' }), real);
  assert.equal(questsDir({ HOME: '/home/x', HEALTH_DIR: '/tmp/h', HEALTH_QUESTS: '/q' }), '/q');
});

test('writeQuest reads the newest two months and writes the file whole', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-quest-'));
  const held = path.join(root, 'samples', 'workouts');
  fs.mkdirSync(held, { recursive: true });
  const put = (month, text) => fs.writeFileSync(path.join(held, `${month}.jsonl`), text);
  put('2026-07', `${JSON.stringify(row('2026-09-11T12:00:00Z', 60))}\n`); // too old a file to be read
  put('2026-08', `${JSON.stringify(row('2026-09-11T00:30:00Z', 60))}\n`); // began before midnight
  put('2026-09', `${JSON.stringify(row('2026-09-11T15:00:00Z', 5))}\n{"torn`);
  put('unknown', `${JSON.stringify(row('2026-09-11T17:00:00Z', 60))}\n`);
  const quest = writeQuest(path.join(root, 'samples'), path.join(root, 'quests'), NOW);
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'quests', 'health.json'), 'utf8'));
  assert.equal(doc.app, 'health');
  assert.equal(doc.quests[0].done_at, '2026-09-11T00:30:00.000Z');
  assert.deepEqual(doc.quests[0], quest);
  assert.deepEqual(fs.readdirSync(path.join(root, 'quests')), ['health.json'], 'no temp file left behind');
  fs.rmSync(root, { recursive: true, force: true });
});

// ── the menu beyond the workout ──────────────────────────────────────────────

test('the menu: the workout is the fixed daily, the letter a pool chore — each in the protocol shape', () => {
  const [workout, report] = questOf([], NOW).quests;
  assert.equal(workout.id, 'health-workout');
  assert.equal(workout.pool, undefined, 'the fixed daily is never in the pool');
  assert.equal(report.id, 'health-report');
  assert.equal(report.pool, true);
  for (const q of [workout, report]) {
    assert.equal(q.device, 'phone');
    assert.ok(['day', 'week'].includes(q.period) && q.due === true && q.title.zh && q.title.en, q.id);
    assert.ok(q.open.startsWith('/apps/health/'), q.id);
  }
});

test('health-report: the newest letter the phone marked read, never one from the future', () => {
  const report = (letters) => questOf([], NOW, letters).quests[1].done_at;
  assert.equal(report([{ week: '2026-08-31' }, { week: '2026-09-07', opened_at: '2026-09-08T07:00:00Z' }]), '2026-09-08T07:00:00.000Z');
  assert.equal(report([{ opened_at: '2026-09-12T07:00:00Z' }]), null);
  assert.equal(report([null, { opened_at: 'soon' }]), null);
  const text = JSON.stringify(questOf([], NOW, [{ opened_at: '2026-09-08T07:00:00Z', text: 'Dear Alex', facts: 'x' }]));
  assert.ok(!text.includes('Dear') && !text.includes('facts'), 'not a word of the letter');
});

test('writeQuest keeps the entries it does not know and reads the letters beside the samples', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-quest-'));
  const quests = path.join(root, 'quests');
  fs.mkdirSync(quests, { recursive: true });
  fs.writeFileSync(path.join(quests, 'health.json'), JSON.stringify({
    app: 'health', quests: [{ id: 'health-workout', done_at: 'old' }, { id: 'elsewhere', x: 1 }],
  }));
  fs.mkdirSync(path.join(root, 'letters'), { recursive: true });
  fs.writeFileSync(path.join(root, 'letters', '2026-09-07.json'), JSON.stringify({ week: '2026-09-07', opened_at: '2026-09-08T07:00:00Z' }));
  writeQuest(path.join(root, 'samples'), quests, NOW);
  const doc = JSON.parse(fs.readFileSync(path.join(quests, 'health.json'), 'utf8'));
  assert.deepEqual(doc.quests.map((q) => q.id), ['health-workout', 'health-report', 'elsewhere']);
  assert.equal(doc.quests[0].done_at, null, 'the workout is read from the mirror, not kept');
  assert.equal(doc.quests[1].done_at, '2026-09-08T07:00:00.000Z');
  assert.deepEqual(doc.quests[2], { id: 'elsewhere', x: 1 });
  assert.deepEqual(fs.readdirSync(quests), ['health.json'], 'no temp file left behind');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a pushed letter marked read writes the fact; a failing quest write never fails the push', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-push-'));
  const ingest = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ingest.mjs');
  const run = (verb, body, env = {}) => JSON.parse(execFileSync(process.execPath, [ingest, verb, Buffer.from(JSON.stringify(body)).toString('base64')], {
    env: { ...process.env, HEALTH_DIR: dir, ...env }, encoding: 'utf8',
  }).trim().split('\n').pop());
  const letter = { version: 1, week: '2026-09-14', written_at: '2026-09-21T12:00:00Z', opened_at: '2026-09-21T13:00:00Z', text: 'Dear Alex' };
  const id = run('ledger', {}).mirror_id;
  assert.equal(run('push', { mirror_id: id, registers: { 'letters/2026-09-14.json': letter } }, { HEALTH_QUESTS: '/dev/null/nope' }).ok, true);
  assert.equal(run('push', { mirror_id: id, registers: { 'letters/2026-09-14.json': { ...letter, written_at: '2026-09-21T12:30:00Z' } } }).ok, true);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'quests', 'health.json'), 'utf8'));
  assert.equal(doc.quests.find((q) => q.id === 'health-report').done_at, '2026-09-21T13:00:00.000Z');
  fs.rmSync(dir, { recursive: true, force: true });
});
