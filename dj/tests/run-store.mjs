// run-store.mjs — library.json as the store: the two views, the cascade, the
// folder as ground truth, and the disk under it (lock, corrupt file, backups).
// Run: node tests/run-store.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PHONE,
  addToList,
  addToPhone,
  createList,
  deleteList,
  deleteTrack,
  filesInList,
  inPhoneView,
  listsForFile,
  listsOf,
  normalize,
  phoneView,
  project,
  pruneMissing,
  removeFromList,
  renameFile,
  removeFromPhone,
  renameList,
  setOrder,
} from '../scripts/store.js';

const ACTIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'actions.mjs');

/// One `actions.mjs` verb in a throwaway DJ dir. Port 1 is nothing, so no
/// real phone is rung.
function actions(dir, verb, ...rest) {
  const opts = typeof rest.at(-1) === 'object' ? rest.pop() : {};
  try {
    const out = execFileSync(process.execPath, [ACTIONS, verb, ...rest], {
      env: { ...process.env, DJ_DIR: dir, LINGGEN_PORT: '1', ...(opts.env || {}) },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    if (!opts.fail) throw e;
    return JSON.parse(String(e.stdout).trim().split('\n').pop());
  }
}

const readLib = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));

function freshLib() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-io-'));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({ tracks: [], playlists: [] }));
  return dir;
}

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`  ok  ${name}`); };

/// A library with the given songs and nothing else in it.
const lib = (...files) => normalize({ tracks: files.map((f) => ({ file: `/Music/DJ/${f}` })) });

// ── playlists ───────────────────────────────────────────────────────────────

ok('a playlist exists before anything is in it', () => {
  const l = lib();
  createList(l, 'Roadtrip');
  assert.deepEqual(listsOf(l), ['Roadtrip']);
  assert.deepEqual(filesInList(l, 'Roadtrip'), []);
});

ok('membership is per song, per playlist', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToList(l, ['/Music/DJ/a.mp3', '/Music/DJ/b.mp3'], 'HK 90s');
  addToList(l, ['/Music/DJ/a.mp3'], 'Karaoke');
  assert.deepEqual(listsForFile(l, 'a.mp3').sort(), ['HK 90s', 'Karaoke']);
  assert.deepEqual(listsForFile(l, '/Music/DJ/b.mp3'), ['HK 90s']);
  assert.deepEqual(filesInList(l, 'HK 90s'), ['a.mp3', 'b.mp3']);
});

ok('a list is a running order — a song lands where it was dropped', () => {
  const l = lib('a.mp3', 'b.mp3', 'c.mp3');
  addToList(l, ['c.mp3', 'a.mp3'], 'Set');
  addToList(l, ['b.mp3'], 'Set');
  assert.deepEqual(filesInList(l, 'Set'), ['c.mp3', 'a.mp3', 'b.mp3'],
    'never the alphabet: the phone appends, and this has to agree');
});

ok('filing the same song twice does not double it', () => {
  const l = lib('a.mp3');
  addToList(l, ['a.mp3'], 'Set');
  addToList(l, ['/Music/DJ/a.mp3'], 'Set');
  assert.deepEqual(filesInList(l, 'Set'), ['a.mp3']);
});

ok('removing from one playlist leaves the others alone', () => {
  const l = lib('a.mp3');
  addToList(l, ['a.mp3'], 'HK 90s');
  addToList(l, ['a.mp3'], 'Karaoke');
  removeFromList(l, ['a.mp3'], 'HK 90s');
  assert.deepEqual(listsForFile(l, 'a.mp3'), ['Karaoke']);
});

ok('deleting a playlist keeps the songs', () => {
  const l = lib('a.mp3');
  addToList(l, ['a.mp3'], 'HK 90s');
  deleteList(l, 'HK 90s');
  assert.deepEqual(listsOf(l), []);
  assert.equal(l.tracks.length, 1, 'the song is untouched');
});

ok('rename carries the members and the order across', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToList(l, ['a.mp3', 'b.mp3'], 'Old');
  setOrder(l, 'Old', ['b.mp3', 'a.mp3']);
  renameList(l, 'Old', 'New');
  assert.deepEqual(listsOf(l), ['New']);
  assert.deepEqual(filesInList(l, 'New'), ['b.mp3', 'a.mp3']);
});

ok('renaming onto a name that exists merges into it', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToList(l, ['a.mp3'], 'Keep');
  addToList(l, ['b.mp3'], 'Fold');
  renameList(l, 'Fold', 'Keep');
  assert.deepEqual(listsOf(l), ['Keep']);
  assert.deepEqual(filesInList(l, 'Keep'), ['a.mp3', 'b.mp3'],
    'what was already there keeps its place');
});

ok('an order computed against a stale list never drops a song', () => {
  const l = lib('a.mp3', 'b.mp3', 'c.mp3');
  addToList(l, ['a.mp3', 'b.mp3', 'c.mp3'], 'Set');
  setOrder(l, 'Set', ['c.mp3', 'a.mp3']); // the phone hadn't seen b yet
  assert.deepEqual(filesInList(l, 'Set'), ['c.mp3', 'a.mp3', 'b.mp3']);
});

// ── deletion ────────────────────────────────────────────────────────────────

ok('a deleted song leaves the library, and hands back its files', () => {
  const l = lib('a.mp3', 'b.mp3');
  l.tracks[0].lrc = '/Music/DJ/a.lrc';
  const row = deleteTrack(l, '/Music/DJ/a.mp3');
  assert.equal(row.lrc, '/Music/DJ/a.lrc', 'the caller unlinks the sidecars');
  assert.deepEqual(l.tracks.map((t) => t.file), ['/Music/DJ/b.mp3']);
});

ok('a deleted song is in no playlist', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToList(l, ['a.mp3', 'b.mp3'], 'HK 90s');
  deleteTrack(l, '/Music/DJ/a.mp3');
  assert.deepEqual(filesInList(l, 'HK 90s'), ['b.mp3'], 'the dead song left the list');
  assert.deepEqual(listsForFile(l, 'a.mp3'), []);
});

ok('a name that comes back is a new song, in no list', () => {
  const l = lib('a.mp3');
  addToList(l, ['a.mp3'], 'HK 90s');
  deleteTrack(l, 'a.mp3');
  l.tracks.push({ file: '/Music/DJ/a.mp3' }); // re-downloaded under the same name
  project(l);
  assert.deepEqual(l.tracks[0].playlists, [],
    'it must not inherit the dead song\'s places');
});

ok('deleting in the Mac view cascades all the way to the phone', () => {
  const l = lib('a.mp3');
  addToList(l, ['a.mp3'], 'HK 90s');
  addToPhone(l, ['a.mp3']);
  addToList(l, ['a.mp3'], 'Drive', PHONE);

  deleteTrack(l, '/Music/DJ/a.mp3');

  assert.deepEqual(filesInList(l, 'HK 90s'), [], 'out of the Mac list');
  assert.equal(inPhoneView(l, 'a.mp3'), false, 'off the phone');
  assert.deepEqual(filesInList(l, 'Drive', PHONE), [], 'out of the phone list');
});

// ── the phone view ──────────────────────────────────────────────────────────

ok('a reference puts a song on the phone without moving it', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToPhone(l, ['/Music/DJ/a.mp3']);
  assert.equal(inPhoneView(l, 'a.mp3'), true);
  assert.equal(inPhoneView(l, 'b.mp3'), false);
  assert.equal(l.tracks.length, 2, 'both songs are still in the library');
  assert.deepEqual(phoneView(l).files, ['a.mp3']);
});

ok('taking a song off the phone keeps the file', () => {
  const l = lib('a.mp3');
  addToPhone(l, ['a.mp3']);
  addToList(l, ['a.mp3'], 'Drive', PHONE);
  removeFromPhone(l, ['a.mp3']);

  assert.equal(inPhoneView(l, 'a.mp3'), false);
  assert.deepEqual(filesInList(l, 'Drive', PHONE), [], 'and out of the phone list');
  assert.equal(l.tracks.length, 1, 'the library still has it');
});

ok('the two views are separate curations under one name', () => {
  const l = lib('a.mp3', 'b.mp3', 'c.mp3');
  addToList(l, ['a.mp3', 'b.mp3'], 'HK 90s');
  addToPhone(l, ['a.mp3']);
  addToList(l, ['a.mp3'], 'HK 90s', PHONE);

  assert.deepEqual(filesInList(l, 'HK 90s'), ['a.mp3', 'b.mp3']);
  assert.deepEqual(filesInList(l, 'HK 90s', PHONE), ['a.mp3']);

  addToList(l, ['c.mp3'], 'HK 90s');
  assert.deepEqual(filesInList(l, 'HK 90s', PHONE), ['a.mp3'],
    'the phone list is not a subscription');
});

ok('a list stops naming a song the library does not have', () => {
  // Neither deleted nor retired: the row simply never existed for it — a file
  // renamed in Finder, a membership carried over from a library that moved on.
  const l = lib('a.mp3');
  addToList(l, ['a.mp3', 'ghost.mp3'], 'HK 90s');
  addToPhone(l, ['a.mp3', 'ghost.mp3']);
  addToList(l, ['ghost.mp3'], 'Drive', PHONE);

  const onDisk = new Set(['a.mp3']);
  assert.equal(pruneMissing(l, (f) => onDisk.has(f)), 3);

  assert.deepEqual(filesInList(l, 'HK 90s'), ['a.mp3']);
  assert.deepEqual(filesInList(l, 'Drive', PHONE), []);
  assert.equal(inPhoneView(l, 'ghost.mp3'), false);
  assert.equal(inPhoneView(l, 'a.mp3'), true, 'the real song is untouched');
  assert.equal(pruneMissing(l, (f) => onDisk.has(f)), 0, 'idempotent');
});

// ── what everything else reads ──────────────────────────────────────────────

ok('the projection writes the shapes the page already reads', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToList(l, ['b.mp3', 'a.mp3'], 'HK 90s');
  addToPhone(l, ['a.mp3']);
  project(l);
  assert.deepEqual(l.tracks[0].playlists, ['HK 90s']);
  assert.equal(l.tracks[0].on_phone, true);
  assert.equal(l.tracks[1].on_phone, false);
  assert.deepEqual(l.playlists, [{ name: 'HK 90s', files: ['b.mp3', 'a.mp3'] }]);
});

ok('a library.json missing every field still loads', () => {
  const l = normalize({});
  assert.deepEqual(l.tracks, []);
  assert.deepEqual(l.playlists, []);
  assert.deepEqual(phoneView(l), { files: [], playlists: [] });
});

ok('a playlist with no name is not a playlist', () => {
  const l = normalize({ playlists: [{ name: '  ', files: ['a.mp3'] }, { files: [] }] });
  assert.deepEqual(l.playlists, []);
});

// ── the folder is ground truth ──────────────────────────────────────────────
// Driving the real `actions.mjs reconcile` in a throwaway DJ dir, because what
// is being checked is what it makes of a folder.

ok('a karaoke render deleted by hand stops being advertised', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-rec-'));
  const music = path.join(dir, 'music');
  fs.mkdirSync(path.join(music, '.karaoke'), { recursive: true });
  fs.writeFileSync(path.join(music, 'a.mp3'), 'ID3');
  const kept = path.join(music, '.karaoke', 'a (Karaoke).mp3');
  fs.writeFileSync(kept, 'ID3');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ library_dir: music }));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({
    tracks: [{
      id: 'a', title: 'a', file: path.join(music, 'a.mp3'),
      karaoke_audio: kept,
      karaoke_video: path.join(music, '.karaoke', 'a (Karaoke).mp4'), // never rendered
    }],
  }));

  execFileSync(process.execPath, [ACTIONS, 'reconcile'], {
    env: { ...process.env, DJ_DIR: dir, LINGGEN_PORT: '1' },
    encoding: 'utf8',
  });

  const [t] = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).tracks;
  assert.equal(t.karaoke_video, undefined, 'a path to nothing is a button that opens nothing');
  assert.equal(t.karaoke_audio, kept, 'and the one that is really there survives the sweep');
});


ok('a render that appears in .karaoke/ lights the song', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-kar-'));
  const music = path.join(dir, 'music');
  fs.mkdirSync(path.join(music, '.karaoke'), { recursive: true });
  fs.writeFileSync(path.join(music, 'Beyond - 海闊天空.mp3'), 'ID3');
  fs.writeFileSync(path.join(music, '.karaoke', 'Beyond - 海闊天空 (Karaoke).mp3'), 'ID3');
  fs.writeFileSync(path.join(music, '.karaoke', 'Beyond - 海闊天空 (Karaoke).mp4'), 'mp4');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ library_dir: music }));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({
    tracks: [{ id: 'beyond|海闊天空', artist: 'Beyond', title: '海闊天空', file: path.join(music, 'Beyond - 海闊天空.mp3') }],
  }));
  actions(dir, 'reconcile');
  const [t] = readLib(dir).tracks;
  assert.equal(t.karaoke_audio, path.join(music, '.karaoke', 'Beyond - 海闊天空 (Karaoke).mp3'));
  assert.equal(t.karaoke_video, path.join(music, '.karaoke', 'Beyond - 海闊天空 (Karaoke).mp4'));
});

ok('a renamed file keeps its song, its playlists and its place on the phone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-ren-'));
  const music = path.join(dir, 'music');
  fs.mkdirSync(music, { recursive: true });
  fs.writeFileSync(path.join(music, 'Beyond - 海闊天空.mp3'), 'ID3'); // renamed in Finder
  fs.writeFileSync(path.join(music, 'other.mp3'), 'ID3');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ library_dir: music }));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({
    tracks: [
      { id: 'beyond|海闊天空', artist: 'ＢＥＹＯＮＤ', title: '海闊天空', plays: 4, file: path.join(music, 'old name.mp3') },
      { id: 'other', artist: '', title: 'other', file: path.join(music, 'other.mp3') },
    ],
    playlists: [{ name: 'HK', files: ['other.mp3', 'old name.mp3'] }],
    phone: { files: ['old name.mp3'], playlists: [{ name: 'Car', files: ['old name.mp3'] }] },
  }));
  const r = actions(dir, 'reconcile');
  assert.equal(r.renamed, 1);
  assert.equal(r.adopted, 0, 'not a stranger');
  const lib = readLib(dir);
  assert.equal(lib.tracks.length, 2);
  const t = lib.tracks.find((x) => x.title === '海闊天空');
  assert.equal(t.file, path.join(music, 'Beyond - 海闊天空.mp3'));
  assert.equal(t.plays, 4, 'the row itself carried over');
  assert.deepEqual(lib.playlists[0].files, ['other.mp3', 'Beyond - 海闊天空.mp3'], 'same place in the list');
  assert.deepEqual(lib.phone.files, ['Beyond - 海闊天空.mp3']);
  assert.deepEqual(lib.phone.playlists[0].files, ['Beyond - 海闊天空.mp3']);
});

ok('renameFile swaps a name everywhere, in place', () => {
  const l = lib('a.mp3', 'b.mp3');
  addToList(l, ['a.mp3', 'b.mp3'], 'Set');
  addToPhone(l, ['a.mp3']);
  renameFile(l, '/Music/DJ/a.mp3', '/Music/DJ/z.mp3');
  assert.deepEqual(filesInList(l, 'Set'), ['z.mp3', 'b.mp3']);
  assert.deepEqual(l.phone.files, ['z.mp3']);
});

ok('the old push ledger is shed on load', () => {
  const l = normalize({ tracks: [{ file: 'a.mp3', synced_to: ['iphone'] }] });
  assert.equal('synced_to' in l.tracks[0], false);
});

// ── the disk under the writer ───────────────────────────────────────────────

ok('a truncated library.json is never overwritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-bad-'));
  const broken = '{"tracks":[{"title":"a","file":"/m/a.mp3"}],"playl';
  fs.writeFileSync(path.join(dir, 'library.json'), broken);
  const r = actions(dir, 'playlist-create', 'New', { fail: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /unreadable/);
  assert.equal(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'), broken, 'the damage is left for a person');
  const copies = fs.readdirSync(dir).filter((n) => n.startsWith('library.json.corrupt-'));
  assert.equal(copies.length, 1, 'and a copy is kept aside');
  actions(dir, 'playlist-create', 'New', { fail: true });
  assert.equal(fs.readdirSync(dir).filter((n) => n.startsWith('library.json.corrupt-')).length, 1, 'one copy per damage');
});

const holdLock = (dir, pid, ageMs = 0) => {
  const lockDir = path.join(dir, 'data', '.actions-lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, 'owner'), String(pid));
  if (ageMs) {
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(lockDir, t, t);
  }
  return lockDir;
};

ok('a lock whose holder died is taken over', () => {
  const dir = freshLib();
  const dead = execFileSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).trim();
  holdLock(dir, dead);
  const r = actions(dir, 'playlist-create', 'X');
  assert.equal(r.ok, true);
  assert.equal(fs.existsSync(path.join(dir, 'data', '.actions-lock')), false, 'and released after');
});

ok('a live holder keeps its lock — the waiter gives up, it does not steal', () => {
  const dir = freshLib();
  const lockDir = holdLock(dir, process.pid);
  const r = actions(dir, 'playlist-create', 'X', { fail: true, env: { DJ_LOCK_WAIT_MS: '300' } });
  assert.equal(r.ok, false);
  assert.match(r.error, /busy/);
  assert.equal(fs.readFileSync(path.join(lockDir, 'owner'), 'utf8'), String(process.pid), 'still ours');
  fs.rmSync(lockDir, { recursive: true });
});

ok('a lock held past any verb’s run time is stale even with a live pid', () => {
  const dir = freshLib();
  holdLock(dir, process.pid, 60_000);
  assert.equal(actions(dir, 'playlist-create', 'X').ok, true);
});

ok('a write keeps an hourly backup, ten deep', () => {
  const dir = freshLib();
  const backups = path.join(dir, 'data', 'backups');
  actions(dir, 'playlist-create', 'A');
  assert.equal(fs.readdirSync(backups).length, 1, 'the first write keeps a copy');
  actions(dir, 'playlist-create', 'B');
  assert.equal(fs.readdirSync(backups).length, 1, 'within the hour, no second copy');
  for (let i = 0; i < 12; i += 1) actions(dir, 'playlist-create', `C${i}`, { env: { DJ_BACKUP_EVERY_MS: '0' } });
  const kept = fs.readdirSync(backups);
  assert.equal(kept.length, 10, 'the oldest roll off');
  const newest = JSON.parse(fs.readFileSync(path.join(backups, kept.sort().at(-1)), 'utf8'));
  assert.ok(newest.playlists.some((p) => p.name === 'C10'), 'the copy is the library before the write');
});

console.log(`\n${pass} checks passed`);
