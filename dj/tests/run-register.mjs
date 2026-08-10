// run-register.mjs — the playlist edit register: the cells, the projection, and
// the merge that lets a phone edit the same library while it's away.
// Run: node tests/run-register.mjs

import assert from 'node:assert';
import {
  PHONE,
  Register,
  addToList,
  addToPhone,
  createList,
  deleteList,
  deleteTrack,
  filesInList,
  inPhoneView,
  isDeleted,
  listsForFile,
  listsOf,
  project,
  reconcileDeleted,
  removeFromList,
  removeFromPhone,
  renameList,
  seedFromTracks,
  seedPhoneView,
  setOrder,
  undeleteTrack,
} from '../scripts/lww.js';

/// The phone view's song set, straight off the register.
const reg2files = (r) => r.entries('ref:').map(([f]) => f).sort();

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`  ok  ${name}`); };

const mac = () => new Register('mac-1');
const phone = () => new Register('phone-1');

// ── cells ───────────────────────────────────────────────────────────────────

ok('a playlist exists before anything is in it', () => {
  const r = mac();
  createList(r, 'Roadtrip');
  assert.deepEqual(listsOf(r), ['Roadtrip']);
  assert.deepEqual(filesInList(r, 'Roadtrip'), []);
});

ok('membership is per song, per playlist', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3', '/Music/DJ/b.mp3'], 'HK 90s');
  addToList(r, ['/Music/DJ/a.mp3'], 'Karaoke');
  assert.deepEqual(listsForFile(r, 'a.mp3').sort(), ['HK 90s', 'Karaoke']);
  assert.deepEqual(listsForFile(r, '/Music/DJ/b.mp3'), ['HK 90s']);
  assert.deepEqual(filesInList(r, 'HK 90s'), ['a.mp3', 'b.mp3']);
});

ok('removing from one playlist leaves the others alone', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3'], 'HK 90s');
  addToList(r, ['/Music/DJ/a.mp3'], 'Karaoke');
  removeFromList(r, ['/Music/DJ/a.mp3'], 'HK 90s');
  assert.deepEqual(listsForFile(r, 'a.mp3'), ['Karaoke']);
});

ok('deleting a playlist keeps the songs', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3'], 'HK 90s');
  deleteList(r, 'HK 90s', filesInList(r, 'HK 90s'));
  assert.deepEqual(listsOf(r), []);
  assert.deepEqual(listsForFile(r, 'a.mp3'), []);
  assert.equal(r.get('del:a.mp3'), undefined, 'the file is untouched');
});

ok('rename carries the members and the order across', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3', '/Music/DJ/b.mp3'], 'Old');
  setOrder(r, 'Old', ['b.mp3', 'a.mp3']);
  renameList(r, 'Old', 'New', filesInList(r, 'Old'));
  assert.deepEqual(listsOf(r), ['New']);
  assert.deepEqual(filesInList(r, 'New'), ['b.mp3', 'a.mp3']);
});

ok('order puts anything filed later on the end, never loses it', () => {
  const r = mac();
  addToList(r, ['a.mp3', 'b.mp3'], 'Set');
  setOrder(r, 'Set', ['b.mp3', 'a.mp3']);
  addToList(r, ['c.mp3'], 'Set'); // arrived after the order was set
  assert.deepEqual(filesInList(r, 'Set'), ['b.mp3', 'a.mp3', 'c.mp3']);
});

// ── merge ───────────────────────────────────────────────────────────────────

ok('two devices adding different songs to one playlist keep both', () => {
  const m = mac(); const p = phone();
  addToList(m, ['a.mp3'], 'Shared');
  addToList(p, ['b.mp3'], 'Shared');
  m.mergeState(p.toState());
  p.mergeState(m.toState());
  assert.deepEqual(filesInList(m, 'Shared'), ['a.mp3', 'b.mp3']);
  assert.deepEqual(filesInList(p, 'Shared'), ['a.mp3', 'b.mp3']);
});

ok('a removal sticks — the tombstone beats the older add', () => {
  const m = mac(); const p = phone();
  addToList(m, ['a.mp3'], 'Shared');
  p.mergeState(m.toState());          // the phone learns about it
  removeFromList(p, ['a.mp3'], 'Shared'); // then takes it out, later
  m.mergeState(p.toState());
  assert.deepEqual(filesInList(m, 'Shared'), [],
    'without a tombstone the Mac would resurrect it');
});

ok('the merge is symmetric and idempotent', () => {
  const m = mac(); const p = phone();
  addToList(m, ['a.mp3'], 'One');
  addToList(p, ['b.mp3'], 'Two');
  setOrder(p, 'Two', ['b.mp3']);
  deleteTrack(p, 'c.mp3');
  for (let i = 0; i < 3; i++) { m.mergeState(p.toState()); p.mergeState(m.toState()); }
  assert.deepEqual(m.toState().reg, p.toState().reg, 'both sides converge');
});

ok('same millisecond, different devices — one winner, both agree', () => {
  const m = new Register('mac-1'); const p = new Register('phone-1');
  m.stamp(1000); p.stamp(1000);
  m.set('pl:a.mp3|X', true);
  p.set('pl:a.mp3|X', null);
  const beforeM = m.toState(); const beforeP = p.toState();
  m.mergeState(beforeP); p.mergeState(beforeM);
  assert.equal(m.get('pl:a.mp3|X'), p.get('pl:a.mp3|X'), 'the device id breaks the tie');
});

// ── deletion ────────────────────────────────────────────────────────────────

ok('a deleted song leaves the library and the folder', () => {
  const r = mac();
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3' }, { file: '/Music/DJ/b.mp3' }] };
  deleteTrack(r, '/Music/DJ/a.mp3');
  const gone = project(r, lib);
  assert.deepEqual(gone, ['/Music/DJ/a.mp3']);
  assert.deepEqual(lib.tracks.map((t) => t.file), ['/Music/DJ/b.mp3']);
});

ok('re-downloading a deleted name brings it back for good', () => {
  const r = mac();
  deleteTrack(r, 'a.mp3');
  undeleteTrack(r, 'a.mp3');
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3' }] };
  assert.deepEqual(project(r, lib), [], 'the tombstone lost to the newer arrival');
  assert.equal(lib.tracks.length, 1);
});

// ── projection ──────────────────────────────────────────────────────────────

ok('the projection writes the shapes the page already reads', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3', '/Music/DJ/b.mp3'], 'HK 90s');
  setOrder(r, 'HK 90s', ['b.mp3', 'a.mp3']);
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3' }, { file: '/Music/DJ/b.mp3' }] };
  project(r, lib);
  assert.deepEqual(lib.tracks[0].playlists, ['HK 90s']);
  assert.deepEqual(lib.playlists, [{ name: 'HK 90s', files: ['b.mp3', 'a.mp3'] }]);
});

ok('a library that predates the register keeps its playlists', () => {
  const r = mac();
  const lib = {
    tracks: [
      { file: '/Music/DJ/a.mp3', playlists: ['Disney Essentials'] },
      { file: '/Music/DJ/b.mp3', playlists: ['Disney Essentials', '聽海'] },
    ],
  };
  seedFromTracks(r, lib);
  assert.deepEqual(listsOf(r), ['Disney Essentials', '聽海']);
  assert.deepEqual(filesInList(r, 'Disney Essentials'), ['a.mp3', 'b.mp3']);
});

ok('seeding never resurrects what someone deliberately removed', () => {
  const r = mac();
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3', playlists: ['Gone'] }] };
  seedFromTracks(r, lib);
  removeFromList(r, ['a.mp3'], 'Gone');
  deleteList(r, 'Gone', []);
  seedFromTracks(r, lib); // runs on every load — must be a no-op now
  assert.deepEqual(listsOf(r), [], 'the tombstones held');
});

// ── a delete takes the song's playlists with it ──────────────────────────────

ok('a deleted song is in no playlist', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3', '/Music/DJ/b.mp3'], 'HK 90s');
  deleteTrack(r, '/Music/DJ/a.mp3');
  assert.deepEqual(filesInList(r, 'HK 90s'), ['b.mp3'], 'the dead song left the list');
  assert.deepEqual(listsForFile(r, 'a.mp3'), []);
});

ok('a playlist stops naming songs that no longer exist', () => {
  // The bug this rule closes: the list still named the deleted song, so a phone
  // holding every file it could hold reported "1 of 2 here".
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3', '/Music/DJ/b.mp3'], 'HK 90s');
  deleteTrack(r, '/Music/DJ/a.mp3');
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3' }, { file: '/Music/DJ/b.mp3' }] };
  project(r, lib);
  assert.deepEqual(lib.playlists, [{ name: 'HK 90s', files: ['b.mp3'] }]);
});

ok('a name that comes back is a new song, in no list', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3'], 'HK 90s');
  deleteTrack(r, '/Music/DJ/a.mp3');
  undeleteTrack(r, '/Music/DJ/a.mp3'); // re-downloaded under the same name
  assert.deepEqual(listsForFile(r, 'a.mp3'), [],
    'it must not inherit the dead song\'s places');
});

ok('a delete that predates the rule is repaired, once', () => {
  const r = mac();
  addToList(r, ['/Music/DJ/a.mp3'], 'HK 90s');
  // What the old deleteTrack wrote, and what an un-updated phone still merges in.
  r.set('del:a.mp3', true);
  assert.deepEqual(filesInList(r, 'HK 90s'), ['a.mp3'], 'the stale cell is there');
  assert.equal(reconcileDeleted(r), 1);
  assert.deepEqual(filesInList(r, 'HK 90s'), []);
  assert.equal(reconcileDeleted(r), 0, 'idempotent');
});

// ── the phone view ──────────────────────────────────────────────────────────
// A phone carries references to the Mac's songs, filed into playlists of its
// own. The Mac view is upstream and never downstream: everything a phone can
// reach lives in here.

ok('a reference puts a song on the phone without moving it', () => {
  const r = mac();
  addToPhone(r, ['/Music/DJ/a.mp3']);
  assert.equal(inPhoneView(r, 'a.mp3'), true);
  assert.equal(inPhoneView(r, 'b.mp3'), false);
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3' }, { file: '/Music/DJ/b.mp3' }] };
  assert.deepEqual(project(r, lib), [], 'nothing was destroyed');
  assert.equal(lib.tracks.length, 2, 'both songs are still in the library');
  assert.deepEqual(lib.phone.files, ['a.mp3']);
});

ok('taking a song off the phone keeps the file', () => {
  const r = mac();
  addToPhone(r, ['a.mp3']);
  addToList(r, ['a.mp3'], 'Drive', PHONE);
  removeFromPhone(r, ['a.mp3']);

  assert.equal(inPhoneView(r, 'a.mp3'), false);
  assert.deepEqual(filesInList(r, 'Drive', PHONE), [], 'and out of the phone list');
  assert.equal(isDeleted(r, 'a.mp3'), false, 'the library still has it');
  const lib = { tracks: [{ file: '/Music/DJ/a.mp3' }] };
  assert.deepEqual(project(r, lib), [], 'no file to unlink');
  assert.equal(lib.tracks.length, 1);
});

ok('the two views are separate curations under one name', () => {
  const r = mac();
  addToList(r, ['a.mp3', 'b.mp3'], 'HK 90s');
  addToPhone(r, ['a.mp3']);
  addToList(r, ['a.mp3'], 'HK 90s', PHONE);

  // Same name, different contents, on purpose — nothing reconciles them.
  assert.deepEqual(filesInList(r, 'HK 90s'), ['a.mp3', 'b.mp3']);
  assert.deepEqual(filesInList(r, 'HK 90s', PHONE), ['a.mp3']);

  // Adding to the Mac's list does not reach the phone's.
  addToList(r, ['c.mp3'], 'HK 90s');
  assert.deepEqual(filesInList(r, 'HK 90s', PHONE), ['a.mp3'],
    'the phone list is not a subscription');
});

ok('deleting in the Mac view cascades all the way to the phone', () => {
  const r = mac();
  addToList(r, ['a.mp3'], 'HK 90s');
  addToPhone(r, ['a.mp3']);
  addToList(r, ['a.mp3'], 'Drive', PHONE);

  deleteTrack(r, '/Music/DJ/a.mp3');

  assert.equal(isDeleted(r, 'a.mp3'), true);
  assert.deepEqual(filesInList(r, 'HK 90s'), [], 'out of the Mac list');
  assert.equal(inPhoneView(r, 'a.mp3'), false, 'off the phone');
  assert.deepEqual(filesInList(r, 'Drive', PHONE), [], 'out of the phone list');
});

ok('a phone view cannot outlive the song it points at', () => {
  // The tombstone arrives by merge from a device that never knew about
  // references — the invariant still has to hold.
  const r = mac();
  addToPhone(r, ['a.mp3']);
  addToList(r, ['a.mp3'], 'Drive', PHONE);
  r.set('del:a.mp3', true);

  assert.ok(reconcileDeleted(r) > 0);
  assert.equal(inPhoneView(r, 'a.mp3'), false);
  assert.deepEqual(filesInList(r, 'Drive', PHONE), []);
});

// ── the seed ────────────────────────────────────────────────────────────────

ok('the seed fills the phone view from what the phone already holds', () => {
  const r = mac();
  addToList(r, ['a.mp3', 'b.mp3', 'c.mp3'], 'HK 90s');
  addToList(r, ['c.mp3'], 'Ballads');

  // The phone has two of the three; Ballads is entirely absent from it.
  assert.ok(seedPhoneView(r, ['/wherever/a.mp3', 'b.mp3']) > 0);

  assert.deepEqual(reg2files(r), ['a.mp3', 'b.mp3']);
  assert.deepEqual(filesInList(r, 'HK 90s', PHONE), ['a.mp3', 'b.mp3'],
    'narrowed to what is there — never "2 of 3"');
  assert.deepEqual(listsOf(r, PHONE), ['HK 90s'],
    'a list with nothing on the phone is not created');
  assert.deepEqual(filesInList(r, 'HK 90s'), ['a.mp3', 'b.mp3', 'c.mp3'],
    'the Mac list is untouched');
});

ok('the seed runs once, and never fights the user afterwards', () => {
  const r = mac();
  addToList(r, ['a.mp3'], 'HK 90s');
  seedPhoneView(r, ['a.mp3']);

  // They clear their phone; the next load must not put it back.
  removeFromPhone(r, ['a.mp3']);
  assert.equal(seedPhoneView(r, ['a.mp3']), 0);
  assert.equal(inPhoneView(r, 'a.mp3'), false);
});

ok('the seed does not reference a song that was deleted', () => {
  const r = mac();
  addToList(r, ['a.mp3', 'b.mp3'], 'HK 90s');
  deleteTrack(r, 'a.mp3');
  seedPhoneView(r, ['a.mp3', 'b.mp3']); // a stale ledger still names it

  assert.equal(inPhoneView(r, 'a.mp3'), false);
  assert.deepEqual(filesInList(r, 'HK 90s', PHONE), ['b.mp3']);
});

console.log(`\n${pass} checks passed`);
