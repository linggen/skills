// What DJ tells the world block and the activity log: the library's size, the
// downloads waiting, the song last played; a download that landed, songs
// deleted. Invented songs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { playedText, worldOf } from '../scripts/world.mjs';
import { deleteRecord, downloadRecord } from '../scripts/activity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACTIONS = path.join(HERE, '..', 'scripts', 'actions.mjs');
const WORLD_CLI = path.join(HERE, '..', 'scripts', 'world.mjs');

const song = (title, artist, extra = {}) => ({ file: `/Music/DJ/${artist} - ${title}.mp3`, title, artist, ...extra });

test('the library, the queue and the last play become three plain readings', () => {
  const world = worldOf({
    tracks: [song('Harbour Lights', 'Alex Quartet', { last_played: '2026-11-16T14:05:00Z' }), song('Rain Song', 'Alex Quartet'), { title: 'no file' }],
    items: [{ status: 'pending' }, { status: 'running' }, { status: 'done' }, { status: 'error' }],
  });
  assert.equal(world.songs, 2);
  assert.equal(world.downloads_pending, 2);
  assert.match(world.last_played, /^Harbour Lights - Alex Quartet, \d\d-\d\d \d\d:\d\d$/);
  assert.equal(world.played_at, '2026-11-16T14:05:00.000Z');
});

test('no play is no field; the empty library says zero because it is zero', () => {
  assert.deepEqual(worldOf({}), { songs: 0, downloads_pending: 0 });
});

test('the newest of the phone\'s play, the page\'s last record and a new note wins', () => {
  const tracks = [song('A', 'x', { last_played: '2026-11-16T10:00:00Z' })];
  const held = { played_at: '2026-11-16T12:00:00.000Z', played_name: 'B - y' };
  assert.match(worldOf({ tracks, held }).last_played, /^B - y,/);
  assert.match(worldOf({ tracks: [song('A', 'x', { last_played: '2026-11-16T13:00:00Z' })], held }).last_played, /^A - x,/);
  const note = { artist: 'z', title: 'C', at: '2026-11-16T14:00:00.000Z' };
  assert.match(worldOf({ tracks, held, note }).last_played, /^C - z,/);
});

test('a long title is shortened, never the time; the value stays within 48 characters', () => {
  const text = playedText('一'.repeat(80), '2026-11-16T14:05:00Z');
  assert.ok(text.length <= 48, text);
  assert.match(text, /…, \d\d-\d\d \d\d:\d\d$/);
  const world = worldOf({ tracks: [song('T'.repeat(90), 'Artist', { last_played: '2026-11-16T14:05:00Z' })], items: [] });
  const line = `dj: ${Object.entries(world).filter(([k]) => ['songs', 'downloads_pending', 'last_played'].includes(k)).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')} · 59m ago`;
  assert.ok(line.length <= 160, line);
});

test('a download is named by the song; deleting one song names it, several give a count', () => {
  assert.deepEqual(downloadRecord({ title: 'Rain Song', artist: 'Alex Quartet', file: '/x/y.mp3' }), { by: 'user', app: 'dj', verb: 'download', object: 'Rain Song - Alex Quartet' });
  assert.deepEqual(deleteRecord([song('Rain Song', 'Alex Quartet')]), { by: 'user', app: 'dj', verb: 'delete', object: 'Rain Song - Alex Quartet', detail: { count: 1 } });
  const many = deleteRecord([1, 2, 3, 4].map((i) => song(`T${i}`, 'A')));
  assert.equal(many.object, '4 songs');
  assert.deepEqual(many.detail.songs, ['T1 - A', 'T2 - A', 'T3 - A']);
  for (const r of [downloadRecord({}), deleteRecord([{}])]) assert.ok(r.object);
});

test('SKILL.md declares the line and the verbs the code writes', () => {
  const md = fs.readFileSync(path.join(HERE, '..', 'SKILL.md'), 'utf8');
  assert.match(md, /^activity-verbs: \[download, delete\]$/m);
  assert.match(md, /^ {2}fields: \[songs, downloads_pending, last_played\]$/m);
  assert.match(md, /^ {2}file: data\/world\.json$/m);
});

// ── the writer, end to end ──────────────────────────────────────────────────

const run = (dir, args, env = {}) => spawn(process.execPath, args, { env: { ...process.env, DJ_DIR: dir, LINGGEN_PORT: '1', ...env } });
const finish = (p) => new Promise((resolve) => {
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', () => resolve({ out, err }));
});

test('saving the library writes world.json; the same facts again leave the file alone; a delete is posted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-world-'));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({ tracks: [song('Harbour Lights', 'Alex Quartet'), song('Rain Song', 'Alex Quartet')], playlists: [] }));
  const seen = [];
  const door = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (req.url !== '/api/activity') { res.end('{}'); return; } // the phone's ring comes to the same port
      seen.push(JSON.parse(raw));
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'refused' }));
    });
  });
  await new Promise((r) => door.listen(0, '127.0.0.1', r));
  const port = String(door.address().port);
  const world = path.join(dir, 'data', 'world.json');
  try {
    await finish(run(dir, [ACTIONS, 'playlist-create', 'Roadtrip']));
    assert.deepEqual(JSON.parse(fs.readFileSync(world, 'utf8')), { songs: 2, downloads_pending: 0 });
    const stamp = fs.statSync(world).mtimeMs;
    await new Promise((r) => setTimeout(r, 25));
    await finish(run(dir, [ACTIONS, 'playlist-create', 'Quiet']));
    assert.equal(fs.statSync(world).mtimeMs, stamp, 'unchanged facts leave the modification time alone');
    // the page starts a song
    execFileSync(process.execPath, [WORLD_CLI, 'played', 'Alex Quartet', 'Rain Song'], { env: { ...process.env, DJ_DIR: dir } });
    assert.match(JSON.parse(fs.readFileSync(world, 'utf8')).last_played, /^Rain Song - Alex Quartet, /);
    // a delete: the library shrinks, the line follows, and the door is told (it refuses: one plain line)
    const gone = await finish(run(dir, [ACTIONS, 'tracks-delete', JSON.stringify(['Alex Quartet - Rain Song.mp3'])], { LINGGEN_PORT: port, DJ_TELL: '1' }));
    assert.equal(JSON.parse(fs.readFileSync(world, 'utf8')).songs, 1);
    assert.ok(seen.length, JSON.stringify(gone));
    assert.deepEqual([seen[0].app, seen[0].verb, seen[0].object], ['dj', 'delete', 'Rain Song - Alex Quartet']);
    assert.match(gone.err, /^activity log refused the delete record: refused\n$/);
    // under a test's DJ_DIR nothing is posted unless asked
    seen.length = 0;
    await finish(run(dir, [ACTIONS, 'tracks-delete', JSON.stringify(['Alex Quartet - Harbour Lights.mp3'])], { LINGGEN_PORT: port }));
    assert.equal(seen.length, 0);
  } finally {
    door.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
