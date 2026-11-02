// Health's quest facts: only due, done and when cross — steps and sleep from
// the phone's facts, the letter and the doctor's note from the mirror.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MENU, RETIRED, SLEEP_TYPE, STEPS_TYPE, dueOf, questOf, questsDir, stamp, writeQuest } from '../scripts/quest.mjs';

const NOW = new Date('2026-09-11T18:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'health-quest-'));
const byId = (body) => Object.fromEntries(body.quests.map((q) => [q.id, q]));
const fileOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'health.json'), 'utf8'));

test('the menu: steps and sleep are the fixed dailies, the letter and the note pool chores — each with how and kind', () => {
  const q = byId(questOf({}, NOW));
  assert.deepEqual(Object.keys(q), ['health-steps', 'health-sleep', 'health-report', 'health-doctor']);
  assert.deepEqual(Object.fromEntries(MENU.map((m) => [m.id, m.kind])),
    { 'health-steps': 'body', 'health-sleep': 'rest', 'health-report': 'heal', 'health-doctor': 'heal' });
  for (const m of Object.values(q)) {
    assert.equal(m.device, 'phone');
    assert.ok(m.title.zh && m.title.en && m.how.zh && m.how.en, m.id);
    assert.ok(m.how.en.split(/\s+/).length <= 20 && m.how.zh.length <= 30, `${m.id}: how is short`);
    assert.ok(m.open.startsWith('/apps/health/scripts/'), m.id);
  }
  assert.equal(q['health-steps'].pool, undefined);
  assert.equal(q['health-sleep'].pool, undefined);
  assert.equal(q['health-report'].pool, true);
});

test('due: no data, no chore — each row is hidden until the mirror can say it can be done', () => {
  const none = dueOf({}, NOW);
  assert.deepEqual(none, { 'health-steps': false, 'health-sleep': false, 'health-report': false, 'health-doctor': false });
  const due = dueOf({
    stepsAt: '2026-09-11T17:00:00Z', sleepAt: '2026-09-08T07:00:00Z', // sleep last seen 3 days ago: no Watch at night
    letters: [{ written_at: '2026-09-07T12:00:00Z' }],
    reviews: [{ date: '2026-09-11', written_at: '2026-09-11T06:00:00Z', doc: 1 }],
  }, NOW);
  assert.deepEqual(due, { 'health-steps': true, 'health-sleep': false, 'health-report': true, 'health-doctor': true });
});

test('health-doctor is event-driven: due only for a note written after the last read', () => {
  const reviews = [{ date: '2026-09-11', written_at: '2026-09-11T06:00:00Z', doc: 2 }];
  assert.equal(dueOf({ reviews }, NOW, new Map([['health-doctor', '2026-09-11T07:00:00Z']]))['health-doctor'], false, 'read since');
  assert.equal(dueOf({ reviews }, NOW, new Map([['health-doctor', '2026-09-10T07:00:00Z']]))['health-doctor'], true, 'new since');
  assert.equal(dueOf({ reviews: [{ ...reviews[0], doc: 0 }] }, NOW)['health-doctor'], false, 'nothing worth a doctor');
  assert.equal(dueOf({ reviews: [{ ...reviews[0], written_at: '2026-09-01T06:00:00Z' }] }, NOW)['health-doctor'], false, 'too old');
});

test('health-report: the newest letter the phone marked read, never one from the future; not a word of it', () => {
  const report = (letters) => byId(questOf({ letters }, NOW))['health-report'].done_at;
  assert.equal(report([{ week: '2026-08-31' }, { week: '2026-09-07', opened_at: '2026-09-08T07:00:00Z' }]), '2026-09-08T07:00:00.000Z');
  assert.equal(report([{ opened_at: '2026-09-12T07:00:00Z' }]), null);
  const text = JSON.stringify(questOf({ letters: [{ opened_at: '2026-09-08T07:00:00Z', text: 'Dear Alex', facts: 'x' }] }, NOW));
  assert.ok(!text.includes('Dear') && !text.includes('"facts"'), 'not a word of the letter');
});

test('a mirror kept elsewhere never writes the real quest file', () => {
  const real = path.join('/home/x', '.linggen', 'quests');
  assert.equal(questsDir({ HOME: '/home/x' }), real);
  assert.notEqual(questsDir({ HOME: '/home/x', HEALTH_DIR: '/tmp/h' }), real);
  assert.equal(questsDir({ HOME: '/home/x', HEALTH_DIR: '/tmp/h', HEALTH_QUESTS: '/q' }), '/q');
});

test('writeQuest reads the mirror, drops the retired workout, keeps what it does not know, leaves no temp file', () => {
  const root = tmp(), quests = path.join(root, 'quests'), samples = path.join(root, 'samples');
  fs.mkdirSync(quests, { recursive: true });
  fs.writeFileSync(path.join(quests, 'health.json'), JSON.stringify({
    app: 'health', quests: [{ id: 'health-workout', done_at: '2026-09-10T00:00:00Z' }, { id: 'elsewhere', x: 1 }],
  }));
  for (const [type, end] of [[STEPS_TYPE, '2026-09-11T17:30:00Z'], [SLEEP_TYPE, '2026-06-06T07:00:00Z']]) {
    fs.mkdirSync(path.join(samples, type), { recursive: true });
    fs.writeFileSync(path.join(samples, type, `${end.slice(0, 7)}.jsonl`), `${JSON.stringify({ end, value: 120 })}\n{"torn`);
  }
  fs.mkdirSync(path.join(root, 'letters'));
  fs.writeFileSync(path.join(root, 'letters', '2026-09-07.json'), JSON.stringify({ week: '2026-09-07', written_at: '2026-09-07T12:00:00Z', opened_at: '2026-09-08T07:00:00Z' }));
  writeQuest(samples, quests, NOW);
  const doc = fileOf(quests), q = byId(doc);
  assert.deepEqual(doc.quests.map((x) => x.id), ['health-steps', 'health-sleep', 'health-report', 'health-doctor', 'elsewhere']);
  assert.ok(RETIRED.includes('health-workout'));
  assert.equal(q['health-steps'].due, true);
  assert.equal(q['health-sleep'].due, false, 'sleep data from June: no chore');
  assert.equal(q['health-report'].done_at, '2026-09-08T07:00:00.000Z');
  assert.deepEqual(q.elsewhere, { id: 'elsewhere', x: 1 });
  assert.deepEqual(fs.readdirSync(quests), ['health.json']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a phone fact stamps steps, sleep or the note: never back, keeps due, survives a rewrite; the CLI door', () => {
  const root = tmp(), quests = path.join(root, 'quests');
  const row = (id) => byId(fileOf(quests))[id];
  assert.equal(stamp('health-steps', '2026-09-11T15:00:00Z', quests), 0);
  assert.equal(row('health-steps').done_at, '2026-09-11T15:00:00.000Z');
  assert.equal(row('health-steps').due, false, 'a stamp alone says nothing of due');
  writeQuest(path.join(root, 'samples'), quests, NOW);
  assert.equal(row('health-steps').done_at, '2026-09-11T15:00:00.000Z', 'the rewrite keeps the stamp');
  assert.equal(stamp('health-steps', '2026-09-11T09:00:00Z', quests), 0, 'a later time stands');
  assert.equal(row('health-steps').done_at, '2026-09-11T15:00:00.000Z');
  for (const id of ['health-sleep', 'health-doctor']) assert.equal(stamp(id, '2026-09-11T07:00:00Z', quests), 0, id);
  assert.equal(stamp('health-report', '2026-09-10T08:00:00Z', quests), 1, 'a row a record keeps is never stamped');
  assert.equal(stamp('health-workout', '2026-09-10T08:00:00Z', quests), 1, 'retired');
  assert.equal(stamp('health-steps', '2026-09-10', quests), 1);
  assert.equal(stamp('health-steps', '2026-09-11T08:00:00Z', '/dev/null/nope'), 1);
  const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'quest.mjs');
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, HEALTH_QUESTS: quests } });
  assert.equal(run(['stamp', 'health-doctor', '2026-09-11T08:00:00Z']).status, 0);
  assert.equal(run(['stamp', 'health-doctor', 'soon']).status, 1);
  assert.equal(row('health-doctor').done_at, '2026-09-11T08:00:00.000Z');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a pushed letter marked read writes the fact; a failing quest write never fails the push', () => {
  const dir = tmp();
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
