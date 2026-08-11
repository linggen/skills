// run-store.mjs — library.json as the store: the two views, the cascade, and
// the one-shot lift of the register that used to hold all of this.
// Run: node tests/run-store.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  removeFromPhone,
  renameList,
  setOrder,
} from '../scripts/store.js';
import { migrateRegister } from '../scripts/migrate-register.js';

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

// ── the register that used to be the store ──────────────────────────────────

const withRegister = (reg) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-mig-'));
  const file = path.join(dir, 'playlist-edits.json');
  fs.writeFileSync(file, JSON.stringify({ device: 'mac-1', lastTs: 9, reg }));
  return file;
};

const cell = (v) => ({ v, ts: 1, d: 'mac-1' });

ok('the register lifts into the library, both views, in order', () => {
  const file = withRegister({
    'pln:HK 90s': cell(true),
    'pl:a.mp3|HK 90s': cell(true),
    'pl:b.mp3|HK 90s': cell(true),
    'plo:HK 90s': cell(['b.mp3', 'a.mp3']),
    'ppn:Drive': cell(true),
    'ppl:a.mp3|Drive': cell(true),
    'ref:a.mp3': cell(true),
  });
  const l = lib('a.mp3', 'b.mp3');
  assert.equal(migrateRegister(l, file), true);
  assert.deepEqual(l.playlists, [{ name: 'HK 90s', files: ['b.mp3', 'a.mp3'] }]);
  assert.deepEqual(l.phone.playlists, [{ name: 'Drive', files: ['a.mp3'] }]);
  assert.deepEqual(l.phone.files, ['a.mp3']);
});

ok('a tombstone stays dead — it never becomes a live entry', () => {
  const file = withRegister({
    'pln:Gone': cell(null),
    'pln:Here': cell(true),
    'pl:a.mp3|Here': cell(true),
    'pl:b.mp3|Here': cell(null),
    'ref:a.mp3': cell(true),
    'ref:b.mp3': cell(null),
  });
  const l = lib('a.mp3', 'b.mp3');
  migrateRegister(l, file);
  assert.deepEqual(listsOf(l), ['Here']);
  assert.deepEqual(filesInList(l, 'Here'), ['a.mp3']);
  assert.deepEqual(l.phone.files, ['a.mp3']);
});

ok('an empty playlist survives the lift', () => {
  const file = withRegister({ 'ppn:Empty': cell(true) });
  const l = lib();
  migrateRegister(l, file);
  assert.deepEqual(l.phone.playlists, [{ name: 'Empty', files: [] }]);
});

ok('a row that outlived its tombstone leaves with it', () => {
  const file = withRegister({ 'del:a.mp3': cell(true) });
  const l = lib('a.mp3', 'b.mp3');
  migrateRegister(l, file);
  assert.deepEqual(l.tracks.map((t) => t.file), ['/Music/DJ/b.mp3']);
});

ok('no register is not an error — it is every run after the first', () => {
  const l = lib('a.mp3');
  addToList(l, ['a.mp3'], 'Mine');
  assert.equal(migrateRegister(l, '/nowhere/playlist-edits.json'), false);
  assert.deepEqual(listsOf(l), ['Mine'], 'and it touched nothing');
});

console.log(`\n${pass} checks passed`);
