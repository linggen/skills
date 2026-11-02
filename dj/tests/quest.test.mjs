// DJ's quest facts: the menu, each chore's own done time and due, merged per
// id and written whole — and never which song or list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU, RETIRED, dueOf, merged, publishDue, questsDir, stamp, stampCli, stampQuietly } from '../scripts/quest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUEST = path.join(HERE, '..', 'scripts', 'quest.mjs');
const NOW = new Date('2026-09-24T15:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dj-quest-'));
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'dj.json'), 'utf8'));
const rowOf = (doc, id) => doc.quests.find((q) => q.id === id);
const doneOf = (doc, id) => rowOf(doc, id)?.done_at;
const lib = (dir, tracks) => {
  const file = path.join(dir, 'library.json');
  fs.writeFileSync(file, JSON.stringify({ tracks, playlists: [] }));
  return file;
};

test('the menu: a song a day (the daily), one she picks a week (the pool) — each with how', () => {
  assert.deepEqual(MENU.map((m) => m.id), ['dj-listen', 'dj-pick']);
  for (const m of MENU) {
    assert.ok(['day', 'week'].includes(m.period), m.id);
    assert.equal(m.device, 'both', m.id);
    assert.ok(m.reward >= 20 && m.reward <= 30 && m.stamina >= 10 && m.stamina <= 20, m.id);
    assert.ok(m.title.zh && m.title.en && m.open.startsWith('/apps/dj/scripts/'), m.id);
    assert.ok(m.how.zh && m.how.en && m.how.en.split(/\s+/).length <= 20, m.id);
  }
  assert.equal(MENU[0].pool, undefined);
  assert.ok(merged(null, {}).quests.every((q) => q.due === false && q.done_at === null), 'never published: hidden');
});

test('due: a song to hear needs a song with its file; a pick is always there', () => {
  assert.deepEqual(dueOf(null), { 'dj-listen': false, 'dj-pick': true });
  assert.deepEqual(dueOf({ tracks: [{ title: 'x' }] }), { 'dj-listen': false, 'dj-pick': true });
  assert.deepEqual(dueOf({ tracks: [{ title: 'x', file: '/m/x.mp3' }] }), { 'dj-listen': true, 'dj-pick': true });
  const dir = tmp();
  publishDue({ dir, library: lib(dir, [{ file: '/m/x.mp3' }]) });
  assert.equal(rowOf(read(dir), 'dj-listen').due, true);
  assert.equal(doneOf(read(dir), 'dj-listen'), null, 'due stamps nothing');
  publishDue({ dir, library: lib(dir, []) });
  assert.equal(rowOf(read(dir), 'dj-listen').due, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a library kept elsewhere never writes the real quest file', () => {
  const real = path.join('/home/x', '.linggen', 'quests');
  assert.equal(questsDir({ HOME: '/home/x' }), real);
  assert.notEqual(questsDir({ HOME: '/home/x', DJ_DIR: '/tmp/d' }), real);
  assert.equal(questsDir({ HOME: '/home/x', DJ_DIR: '/tmp/d', DJ_QUESTS: '/q' }), '/q');
});

test('a stamp sets its own done_at, drops the retired rows, keeps an id it does not know', () => {
  const dir = tmp(), library = lib(dir, [{ file: '/m/x.mp3' }]);
  fs.writeFileSync(path.join(dir, 'dj.json'), JSON.stringify({
    app: 'dj', quests: [{ id: 'dj-sing', done_at: '2026-09-23T10:00:00.000Z' }, { id: 'elsewhere', x: 1 }],
  }));
  const q = stamp('dj-pick', { dir, now: NOW, library });
  assert.equal(q.done_at, NOW.toISOString());
  const doc = read(dir);
  assert.deepEqual(doc.quests.map((x) => x.id), ['dj-listen', 'dj-pick', 'elsewhere']);
  for (const id of RETIRED) assert.equal(rowOf(doc, id), undefined, id);
  assert.equal(rowOf(doc, 'dj-listen').due, true);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['dj.json', 'library.json'], 'no temp file left behind');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a torn file starts again; an unknown or retired id writes nothing; a failure is silent', () => {
  const dir = tmp();
  assert.throws(() => stamp('dj-nope', { dir, now: NOW }));
  assert.throws(() => stamp('dj-sing', { dir, now: NOW }));
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.writeFileSync(path.join(dir, 'dj.json'), '{"app":"dj","que');
  stamp('dj-listen', { dir, now: NOW });
  assert.equal(doneOf(read(dir), 'dj-listen'), NOW.toISOString());
  const out = execFileSync(process.execPath, [QUEST, 'dj-listen'], { env: { ...process.env, DJ_QUESTS: '/dev/null/nope' }, encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, false);
  const prev = process.env.DJ_QUESTS;
  process.env.DJ_QUESTS = '/dev/null/nope';
  assert.doesNotThrow(() => stampQuietly('dj-listen'));
  if (prev === undefined) delete process.env.DJ_QUESTS; else process.env.DJ_QUESTS = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('only the fact crosses — no song, list or file', () => {
  const text = JSON.stringify(merged(null, { 'dj-listen': NOW.toISOString() }));
  for (const leak of ['.mp3', '"artist', '"file', '"songs']) assert.ok(!text.includes(leak), leak);
});

test('a stamp never moves done_at back; the engine door exits 0 once held, 1 for a bad call', () => {
  const dir = tmp();
  stamp('dj-listen', { dir, now: NOW });
  stamp('dj-listen', { dir, now: new Date('2026-09-20T09:00:00Z') });
  assert.equal(doneOf(read(dir), 'dj-listen'), NOW.toISOString());
  assert.equal(stampCli('dj-listen', '2026-09-25T14:03:11Z', { dir }), 0);
  assert.equal(stampCli('dj-karaoke', '2026-09-24T14:03:11Z', { dir }), 1, 'retired');
  assert.equal(stampCli('dj-listen', '2026-09-24', { dir }), 1);
  const run = (args) => spawnSync(process.execPath, [QUEST, ...args], { env: { ...process.env, DJ_QUESTS: dir } });
  assert.equal(run(['stamp', 'dj-pick', '2026-09-24T10:00:00Z']).status, 0);
  assert.equal(run(['stamp', 'dj-pick', 'soon']).status, 1);
  assert.equal(doneOf(read(dir), 'dj-pick'), '2026-09-24T10:00:00.000Z');
  for (const q of read(dir).quests) assert.equal(q.kind, 'song', q.id);
  fs.rmSync(dir, { recursive: true, force: true });
});
