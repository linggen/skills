// Health's quest fact: only the newest long-enough workout crosses, and only
// as a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
