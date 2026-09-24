// run-queue.mjs — the Mac's download queue: the verbs in actions.mjs and the
// worker in fetch.py, end to end. DJ_FAKE_FETCH=1 stands a local writer in for
// yt-dlp, the picker and LRCLIB, so nothing here touches the network.
// Run: node tests/run-queue.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..', 'scripts');
const ACTIONS = path.join(SCRIPTS, 'actions.mjs');
const FETCH = path.join(SCRIPTS, 'fetch.py');

let pass = 0;
const ok = async (name, fn) => { await fn(); pass += 1; console.log(`  ok  ${name}`); };

const envFor = (dir) => ({ ...process.env, DJ_DIR: dir, LINGGEN_PORT: '1', DJ_FAKE_FETCH: '1' });

function freshDir(tracks = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-queue-'));
  const music = path.join(dir, 'music');
  fs.mkdirSync(music, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ library_dir: music }));
  const rows = tracks.map((t) => {
    const file = path.join(music, t.name);
    fs.writeFileSync(file, 'old take');
    return { id: `${t.artist}|${t.title}`.toLowerCase(), artist: t.artist, title: t.title, file, ...t.extra };
  });
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({ tracks: rows, playlists: [] }));
  return { dir, music };
}

const act = (dir, verb, ...args) =>
  JSON.parse(execFileSync(process.execPath, [ACTIONS, verb, ...args], { env: envFor(dir), encoding: 'utf8' }).trim().split('\n').pop());

const worker = (dir) =>
  JSON.parse(execFileSync('python3', [FETCH, 'worker'], { env: envFor(dir), encoding: 'utf8' }).trim().split('\n').pop());

const queue = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'data', 'queue.json'), 'utf8')).items;
const library = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await ok('queued songs are drained by the worker and land as library rows', () => {
  const { dir, music } = freshDir();
  const r = act(dir, 'queue-add', JSON.stringify([
    { artist: 'Beyond', title: '海闊天空', year: 1993, playlist: 'HK 90s' },
    { artist: 'Nobody', title: 'FAIL song' },
    { artist: 'Faye Wong', title: '夢中人', for_phone: true },
  ]));
  assert.equal(r.added, 3);
  assert.equal(worker(dir).done, 3);

  const byTitle = Object.fromEntries(queue(dir).map((i) => [i.title, i]));
  assert.equal(byTitle['海闊天空'].status, 'done');
  assert.equal(byTitle['FAIL song'].status, 'error');
  assert.match(byTitle['FAIL song'].error, /no playable source/);

  const lib = library(dir);
  const hk = lib.tracks.find((t) => t.title === '海闊天空');
  assert.equal(hk.file, path.join(music, 'Beyond - 海闊天空.mp3'), 'named by naming.py');
  assert.ok(hk.source_id, 'the source is recorded');
  assert.deepEqual(lib.playlists, [{ name: 'HK 90s', files: ['Beyond - 海闊天空.mp3'] }]);
  assert.deepEqual(lib.phone.files, ['Faye Wong - 夢中人.mp3'], 'for_phone puts it on the phone');
});

await ok('a song already waiting is not queued twice', () => {
  const { dir } = freshDir();
  act(dir, 'queue-add', JSON.stringify([{ artist: 'A', title: 'B' }]));
  const r = act(dir, 'queue-add', JSON.stringify([{ artist: 'a', title: ' b ' }]));
  assert.equal(r.added, 0);
});

await ok('retry puts a failed song back in line; clear drops what finished', () => {
  const { dir } = freshDir();
  act(dir, 'queue-add', JSON.stringify([{ artist: 'X', title: 'FAIL' }, { artist: 'Y', title: 'fine' }]));
  worker(dir);
  const failed = queue(dir).find((i) => i.status === 'error');
  assert.equal(act(dir, 'queue-retry', JSON.stringify([failed.id])).retried, 1);
  assert.equal(queue(dir).find((i) => i.id === failed.id).status, 'pending');
  worker(dir);
  assert.equal(act(dir, 'queue-clear').cleared, 2);
  assert.deepEqual(queue(dir), []);
});

await ok('cancel stops a waiting song at once and a running one mid-download', async () => {
  const { dir } = freshDir();
  act(dir, 'queue-add', JSON.stringify([{ artist: 'A', title: 'SLOW one' }, { artist: 'B', title: 'SLOW two' }, { artist: 'C', title: 'waiting' }]));
  const waiting = queue(dir).find((i) => i.title === 'waiting');
  assert.equal(act(dir, 'queue-cancel', JSON.stringify([waiting.id])).cancelled, 1);

  // Detached, the way the page starts it: the call returns at once.
  const started = JSON.parse(execFileSync('python3', [FETCH, 'start-worker'], { env: envFor(dir), encoding: 'utf8' }).trim());
  assert.ok(started.pid);
  for (let i = 0; i < 50 && !queue(dir).some((x) => x.status === 'running'); i += 1) await sleep(100);
  act(dir, 'queue-cancel', 'all');
  for (let i = 0; i < 100 && queue(dir).some((x) => ['running', 'cancelling', 'pending'].includes(x.status)); i += 1) await sleep(100);
  const statuses = queue(dir).map((x) => x.status);
  assert.deepEqual(statuses, ['cancelled', 'cancelled', 'cancelled']);
  assert.equal(library(dir).tracks.length, 0, 'nothing landed');
  for (let i = 0; i < 50 && fs.existsSync(path.join(dir, 'data', '.worker-lock')); i += 1) await sleep(100);
  assert.equal(fs.existsSync(path.join(dir, 'data', '.worker-lock')), false, 'the worker let go when done');
});

await ok('one worker at a time; a dead one is replaced', () => {
  const { dir } = freshDir();
  const lock = path.join(dir, 'data', '.worker-lock');
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid)); // alive
  act(dir, 'queue-add', JSON.stringify([{ artist: 'A', title: 'B' }]));
  assert.equal(worker(dir).running, true, 'a live worker keeps the queue');
  const dead = execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(lock, 'pid'), dead);
  assert.equal(worker(dir).done, 1);
});

await ok('a worker that died mid-song leaves it to the next one', () => {
  const { dir } = freshDir();
  act(dir, 'queue-add', JSON.stringify([{ artist: 'A', title: 'B' }]));
  act(dir, 'queue-claim'); // claimed, then the worker vanished
  assert.equal(queue(dir)[0].status, 'running');
  assert.equal(worker(dir).done, 1);
  assert.equal(queue(dir)[0].status, 'done');
});

await ok('another source replaces the file in place and skips the ones tried', () => {
  const { dir, music } = freshDir([{ artist: 'Beyond', title: '真的愛你', name: 'Beyond - 真的愛你.mp3', extra: { source_id: 'first' } }]);
  const file = path.join(music, 'Beyond - 真的愛你.mp3');
  act(dir, 'playlist-add', 'Love', JSON.stringify([file]));
  const r = act(dir, 'track-redownload', 'Beyond - 真的愛你.mp3');
  assert.equal(r.added, 1);
  const [item] = queue(dir);
  assert.deepEqual(item.exclude, ['first']);
  assert.equal(item.dest, file);
  worker(dir);
  assert.equal(fs.readFileSync(file, 'utf8'), 'ID3', 'the new take is at the old name');
  assert.equal(fs.readdirSync(music).filter((n) => !n.startsWith('.')).length, 1, 'no second file');
  const lib = library(dir);
  const [t] = lib.tracks;
  assert.notEqual(t.source_id, 'first');
  assert.deepEqual(t.sources_tried, ['first']);
  assert.deepEqual(lib.playlists[0].files, ['Beyond - 真的愛你.mp3'], 'the playlist still holds it');
});

await ok('a song with no recorded source skips the picker’s first choice instead', () => {
  const { dir } = freshDir([{ artist: 'A', title: 'B', name: 'A - B.mp3' }]);
  act(dir, 'track-redownload', 'A - B.mp3');
  const [item] = queue(dir);
  assert.equal(item.skip_first, true);
  assert.equal(item.exclude.length, 0);
});

console.log(`\n${pass} checks passed`);
