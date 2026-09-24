// DJ's quest facts: the menu, each chore's own done time, merged per id and
// written whole — and never which song or list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU, merged, questsDir, stamp, stampCli, stampQuietly, syncFact, witnessSync } from '../scripts/quest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUEST = path.join(HERE, '..', 'scripts', 'quest.mjs');
const NOW = new Date('2026-09-24T15:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dj-quest-'));
const read = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'dj.json'), 'utf8'));
const doneOf = (doc, id) => doc.quests.find((q) => q.id === id)?.done_at;

test('every entry carries the protocol fields, and each chore is modest', () => {
  for (const m of MENU) {
    assert.match(m.id, /^dj-/);
    assert.ok(['day', 'week'].includes(m.period), m.id);
    assert.ok(['mac', 'phone', 'both'].includes(m.device), m.id);
    assert.ok(m.reward >= 20 && m.reward <= 30 && m.stamina >= 10 && m.stamina <= 20, m.id);
    assert.ok(m.title.zh && m.title.en && m.open.startsWith('/apps/dj/'), m.id);
  }
  assert.ok(merged(null, {}).quests.every((q) => q.due === true && q.done_at === null));
});

test('a library kept elsewhere never writes the real quest file', () => {
  const real = path.join('/home/x', '.linggen', 'quests');
  assert.equal(questsDir({ HOME: '/home/x' }), real);
  assert.notEqual(questsDir({ HOME: '/home/x', DJ_DIR: '/tmp/d' }), real);
  assert.equal(questsDir({ HOME: '/home/x', DJ_DIR: '/tmp/d', DJ_QUESTS: '/q' }), '/q');
});

test('a stamp sets its own done_at and keeps every other id, known or not', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'dj.json'), JSON.stringify({
    app: 'dj', quests: [{ id: 'dj-sing', done_at: '2026-09-23T10:00:00.000Z' }, { id: 'elsewhere', x: 1 }],
  }));
  const q = stamp('dj-fetch', { dir, now: NOW });
  assert.equal(q.done_at, NOW.toISOString());
  const doc = read(dir);
  assert.equal(doneOf(doc, 'dj-fetch'), NOW.toISOString());
  assert.equal(doneOf(doc, 'dj-sing'), '2026-09-23T10:00:00.000Z');
  assert.equal(doneOf(doc, 'dj-playlist'), null);
  assert.deepEqual(doc.quests.find((x) => x.id === 'elsewhere'), { id: 'elsewhere', x: 1 });
  assert.deepEqual(fs.readdirSync(dir), ['dj.json'], 'no temp file left behind');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a torn file starts again; an unknown id writes nothing; a failure is silent', () => {
  const dir = tmp();
  assert.throws(() => stamp('dj-nope', { dir, now: NOW }));
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.writeFileSync(path.join(dir, 'dj.json'), '{"app":"dj","que');
  stamp('dj-sing', { dir, now: NOW });
  assert.equal(doneOf(read(dir), 'dj-sing'), NOW.toISOString());
  // The CLI never fails its caller: an unwritable dir is a JSON line and exit 0.
  const out = execFileSync(process.execPath, [QUEST, 'dj-sing'], {
    env: { ...process.env, DJ_QUESTS: '/dev/null/nope' }, encoding: 'utf8',
  });
  assert.equal(JSON.parse(out).ok, false);
  const prev = process.env.DJ_QUESTS;
  process.env.DJ_QUESTS = '/dev/null/nope';
  assert.doesNotThrow(() => stampQuietly('dj-sing'));
  if (prev === undefined) delete process.env.DJ_QUESTS; else process.env.DJ_QUESTS = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dj-sync: a phone that gained songs since DJ last looked, at the engine\'s time', () => {
  const t1 = 1790000000, t2 = 1790003600;
  const first = syncFact({ ph: { files: ['a.mp3', 'a.lrc'], last_fetch: t1 } }, null);
  assert.equal(first.at, null, 'the first look is a baseline');
  assert.deepEqual(first.memo.ph.songs, ['a.mp3'], 'songs only, never sidecars');
  const same = syncFact({ ph: { files: ['a.mp3', 'b.png'], last_fetch: t2 } }, first.memo);
  assert.equal(same.at, null, 'a cover is not a song');
  const grew = syncFact({ ph: { files: ['a.mp3', 'b.mp3'], last_fetch: t2 } }, first.memo);
  assert.equal(grew.at, new Date(t2 * 1000).toISOString());
  const fewer = syncFact({ ph: { files: [], last_fetch: t2 } }, first.memo);
  assert.equal(fewer.at, null, 'a phone letting songs go is not a sync of new ones');
  const other = syncFact({ ph: { files: ['a.mp3'], last_fetch: t1 }, pad: { files: ['z.mp3'], last_fetch: t2 } }, first.memo);
  assert.equal(other.at, null, 'a phone first seen is a baseline too');
});

test('witnessSync keeps its memo in DJ\'s own data and stamps only on growth', () => {
  const root = tmp();
  const ledgerFile = path.join(root, 'sync', 'dj.json');
  const memoFile = path.join(root, 'data', 'quest-sync.json');
  const dir = path.join(root, 'quests');
  fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
  const put = (files, t) => fs.writeFileSync(ledgerFile, JSON.stringify({ ph: { files, last_fetch: t } }));
  assert.equal(witnessSync({ ledgerFile: path.join(root, 'none.json'), memoFile, dir }), null);
  put(['a.mp3'], 1790000000);
  assert.equal(witnessSync({ ledgerFile, memoFile, dir }), null);
  assert.ok(!fs.existsSync(path.join(dir, 'dj.json')));
  put(['a.mp3', 'b.mp3'], 1790003600);
  assert.equal(witnessSync({ ledgerFile, memoFile, dir }).done_at, new Date(1790003600 * 1000).toISOString());
  assert.ok(!fs.readFileSync(path.join(dir, 'dj.json'), 'utf8').includes('.mp3'), 'no song name crosses');
  fs.rmSync(root, { recursive: true, force: true });
});

test('only the fact crosses — no song, list or file', () => {
  const text = JSON.stringify(merged(null, { 'dj-fetch': NOW.toISOString() }));
  for (const leak of ['.mp3', '"artist', '"file', '"songs']) assert.ok(!text.includes(leak), leak);
});

test('a stamp never moves done_at back', () => {
  const dir = tmp();
  stamp('dj-listen', { dir, now: NOW });
  stamp('dj-listen', { dir, now: new Date('2026-09-20T09:00:00Z') });
  assert.equal(doneOf(read(dir), 'dj-listen'), NOW.toISOString());
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the engine door: stamp <id> <at> exits 0 once held, 1 for a bad call', () => {
  const dir = tmp();
  assert.equal(stampCli('dj-karaoke', '2026-09-24T14:03:11Z', { dir }), 0);
  assert.equal(stampCli('dj-karaoke', '2026-09-22T14:03:11Z', { dir }), 0, 'a later time stands');
  assert.equal(doneOf(read(dir), 'dj-karaoke'), '2026-09-24T14:03:11.000Z');
  assert.equal(stampCli('dj-nope', '2026-09-24T14:03:11Z', { dir }), 1);
  assert.equal(stampCli('dj-listen', '2026-09-24', { dir }), 1);
  const run = (args) => spawnSync(process.execPath, [QUEST, ...args], { env: { ...process.env, DJ_QUESTS: dir } });
  assert.equal(run(['stamp', 'dj-listen', '2026-09-24T10:00:00Z']).status, 0);
  assert.equal(run(['stamp', 'dj-listen', 'soon']).status, 1);
  assert.equal(doneOf(read(dir), 'dj-listen'), '2026-09-24T10:00:00.000Z');
  fs.rmSync(dir, { recursive: true, force: true });
});
