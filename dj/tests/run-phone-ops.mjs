// run-phone-ops.mjs — the phone's op log, applied by the one writer.
//
// A phone edits its view while this Mac is asleep, so its edits arrive as
// intents rather than as a state to merge: ops go up, the whole view comes
// down. These drive the real `actions.mjs phone-ops` in a throwaway DJ dir, so
// the lock, the projection, the applied-op ring and library.json are all the
// real ones.
// Run: node tests/run-phone-ops.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACTIONS = path.join(HERE, '..', 'scripts', 'actions.mjs');

let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log(`  ok  ${name}`); };

/// A DJ dir with the given songs in its library, and the audio files to match —
/// `tracks-delete` unlinks, so the files have to be real.
function freshDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-ops-'));
  const music = path.join(dir, 'music');
  fs.mkdirSync(music, { recursive: true });
  const tracks = names.map((n) => {
    const file = path.join(music, n);
    fs.writeFileSync(file, 'ID3');
    return { id: n, artist: '', title: n, file };
  });
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    `${JSON.stringify({ tracks, playlists: [] }, null, 2)}\n`,
  );
  return dir;
}

/// One `phone-ops` round trip, exactly as the phone makes it: base64 in, one
/// JSON line out.
function send(dir, ops) {
  const b64 = Buffer.from(JSON.stringify(ops), 'utf8').toString('base64');
  const out = execFileSync(process.execPath, [ACTIONS, 'phone-ops', b64], {
    // Port 1 is nothing: the announcement fails fast instead of ringing a real
    // daemon's phone during a test run.
    env: { ...process.env, DJ_DIR: dir, LINGGEN_PORT: '1' },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
}

const run = (dir, verb, ...args) => {
  const out = execFileSync(process.execPath, [ACTIONS, verb, ...args], {
    env: { ...process.env, DJ_DIR: dir, LINGGEN_PORT: '1' },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop());
};

const lists = (view) => view.playlists.map((p) => p.name);
const filesIn = (view, name) =>
  (view.playlists.find((p) => p.name === name) || { files: [] }).files;

// ── ops up, state down ──────────────────────────────────────────────────────

ok('an empty batch is the read', () => {
  const dir = freshDir(['a.mp3']);
  const r = send(dir, []);
  assert.equal(r.ok, true);
  assert.equal(r.applied, 0);
  assert.deepEqual(r.view, { files: [], playlists: [] });
  assert.equal(fs.existsSync(path.join(dir, 'data', 'op-ids.json')), false,
    'nothing was spent, so nothing is remembered');
});

ok('a batch applies in order and the whole view comes back', () => {
  const dir = freshDir(['a.mp3', 'b.mp3']);
  const r = send(dir, [
    { id: '1', op: 'playlist-create', name: 'Drive' },
    { id: '2', op: 'playlist-add', name: 'Drive', files: ['b.mp3', 'a.mp3'] },
  ]);
  assert.equal(r.applied, 2);
  assert.deepEqual(lists(r.view), ['Drive']);
  assert.deepEqual(filesIn(r.view, 'Drive'), ['b.mp3', 'a.mp3'],
    'a playlist is a running order — songs stay where they were dropped');
  assert.deepEqual(r.view.files, ['a.mp3', 'b.mp3'],
    'filing into a phone list is also asking to carry the song');
});

ok('the reply is the Mac\'s own state, not the batch echoed back', () => {
  const dir = freshDir(['a.mp3']);
  run(dir, 'phone-add', JSON.stringify(['a.mp3']));
  run(dir, 'playlist-create', 'Mac Only', 'phone');
  const r = send(dir, []);
  assert.deepEqual(r.view.files, ['a.mp3']);
  assert.deepEqual(lists(r.view), ['Mac Only'],
    'an edit made here reaches a phone that had nothing to say');
});

ok('the phone view lands in library.json, where everything else reads it', () => {
  const dir = freshDir(['a.mp3']);
  send(dir, [{ id: '1', op: 'playlist-add', name: 'Drive', files: ['a.mp3'] }]);
  const lib = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.deepEqual(lib.phone.files, ['a.mp3']);
  assert.deepEqual(lib.phone.playlists, [{ name: 'Drive', files: ['a.mp3'] }]);
  assert.deepEqual(lib.playlists, [], 'and never into the Mac\'s own lists');
  assert.equal(lib.tracks[0].on_phone, true);
});

// ── a re-send after a lost acknowledgement ──────────────────────────────────

ok('the same op id twice is applied once', () => {
  const dir = freshDir(['a.mp3', 'b.mp3']);
  const op = { id: 'op-7', op: 'playlist-add', name: 'Drive', files: ['a.mp3'] };
  send(dir, [op]);
  // The phone never heard the reply, so it sends the batch again.
  send(dir, [op, { id: 'op-8', op: 'playlist-add', name: 'Drive', files: ['b.mp3'] }]);
  const again = send(dir, [op]);
  assert.equal(again.results[0].duplicate, true);
  assert.equal(again.applied, 0);
  assert.deepEqual(filesIn(again.view, 'Drive'), ['a.mp3', 'b.mp3']);
});

ok('a reorder re-sent after the list moved on does not resurrect the old order', () => {
  const dir = freshDir(['a.mp3', 'b.mp3']);
  send(dir, [{ id: '1', op: 'playlist-add', name: 'Set', files: ['a.mp3', 'b.mp3'] }]);
  const op = { id: 'r-1', op: 'playlist-reorder', name: 'Set', files: ['b.mp3', 'a.mp3'] };
  send(dir, [op]);
  send(dir, [{ id: '2', op: 'playlist-reorder', name: 'Set', files: ['a.mp3', 'b.mp3'] }]);
  const r = send(dir, [op]);
  assert.deepEqual(filesIn(r.view, 'Set'), ['a.mp3', 'b.mp3'], 'the later order stands');
});

// ── stale ops ───────────────────────────────────────────────────────────────

ok('a song deleted here skips the op that names it, and says so', () => {
  // Liang's probe: the Mac deletes X while an offline phone makes a list and
  // files X into it. The list-create is honest curation and applies; the add
  // cannot, and is named rather than guessed at.
  const dir = freshDir(['x.mp3']);
  run(dir, 'tracks-delete', JSON.stringify(['x.mp3']));
  const r = send(dir, [
    { id: '1', op: 'playlist-create', name: 'L' },
    { id: '2', op: 'playlist-add', name: 'L', files: ['x.mp3'] },
  ]);
  assert.deepEqual(lists(r.view), ['L'], 'offline curation survives');
  assert.equal(r.applied, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /x\.mp3/);
  assert.match(r.skipped[0].reason, /no longer on your Mac/);
  assert.equal(r.results[1].ok, false);
  assert.deepEqual(r.view.files, [], 'and nothing references a song that is gone');
});

ok('a skipped op is still spent', () => {
  const dir = freshDir(['x.mp3']);
  run(dir, 'tracks-delete', JSON.stringify(['x.mp3']));
  const op = { id: 'ghost', op: 'ref-add', files: ['x.mp3'] };
  const first = send(dir, [op]);
  assert.equal(first.skipped.length, 1);
  const second = send(dir, [op]);
  assert.equal(second.results[0].duplicate, true,
    'the phone cleared it on the acknowledgement; a re-send is a no-op');
});

ok('an op naming a playlist this Mac deleted is skipped, not recreated', () => {
  const dir = freshDir(['a.mp3']);
  send(dir, [{ id: '1', op: 'playlist-add', name: 'Set', files: ['a.mp3'] }]);
  run(dir, 'playlist-delete', 'Set', 'phone');
  const r = send(dir, [
    { id: '2', op: 'playlist-remove', name: 'Set', files: ['a.mp3'] },
    { id: '3', op: 'playlist-rename', name: 'Set', to: 'Set 2' },
  ]);
  assert.deepEqual(lists(r.view), []);
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[0].reason, /no longer a playlist/);
});

ok('a later add lands at the end, not in the alphabet', () => {
  const dir = freshDir(['b.mp3', 'c.mp3', 'a.mp3']);
  send(dir, [{ id: '1', op: 'playlist-add', name: 'Set', files: ['b.mp3', 'c.mp3'] }]);
  const r = send(dir, [{ id: '2', op: 'playlist-add', name: 'Set', files: ['a.mp3'] }]);
  assert.deepEqual(filesIn(r.view, 'Set'), ['b.mp3', 'c.mp3', 'a.mp3'],
    'the phone appends locally; this has to agree or the list jumps under them');
});

ok('a partly stale add applies the rest and names what it dropped', () => {
  const dir = freshDir(['a.mp3', 'x.mp3']);
  run(dir, 'tracks-delete', JSON.stringify(['x.mp3']));
  const r = send(dir, [
    { id: '1', op: 'playlist-add', name: 'Set', files: ['a.mp3', 'x.mp3'] },
  ]);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.results[0].missing, ['x.mp3']);
  assert.deepEqual(filesIn(r.view, 'Set'), ['a.mp3']);
});

ok('an unknown op is refused, never half-guessed', () => {
  const dir = freshDir(['a.mp3']);
  const r = send(dir, [{ id: '1', op: 'library-wipe', files: ['a.mp3'] }]);
  assert.equal(r.applied, 0);
  assert.match(r.skipped[0].reason, /unknown op/);
  assert.equal(fs.existsSync(path.join(dir, 'music', 'a.mp3')), true);
});

ok('an op with no id is not applied — it could never be acknowledged', () => {
  const dir = freshDir(['a.mp3']);
  const r = send(dir, [{ op: 'ref-add', files: ['a.mp3'] }]);
  assert.equal(r.applied, 0);
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.view.files, []);
});

// ── what a phone cannot do ──────────────────────────────────────────────────

ok('dropping a reference keeps the file and the Mac\'s own list', () => {
  const dir = freshDir(['a.mp3']);
  run(dir, 'playlist-add', 'Mac Set', JSON.stringify(['a.mp3']));
  send(dir, [{ id: '1', op: 'ref-add', files: ['a.mp3'] }]);
  const r = send(dir, [{ id: '2', op: 'ref-remove', files: ['a.mp3'] }]);

  assert.deepEqual(r.view.files, []);
  assert.equal(fs.existsSync(path.join(dir, 'music', 'a.mp3')), true,
    'the strongest verb a phone has still destroys nothing');
  const lib = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  assert.deepEqual(lib.playlists, [{ name: 'Mac Set', files: ['a.mp3'] }]);
});

ok('taking a song off the phone unfiles it from every phone list', () => {
  const dir = freshDir(['a.mp3', 'b.mp3']);
  send(dir, [
    { id: '1', op: 'playlist-add', name: 'One', files: ['a.mp3', 'b.mp3'] },
    { id: '2', op: 'playlist-add', name: 'Two', files: ['a.mp3'] },
  ]);
  const r = send(dir, [{ id: '3', op: 'ref-remove', files: ['a.mp3'] }]);
  assert.deepEqual(filesIn(r.view, 'One'), ['b.mp3']);
  assert.deepEqual(filesIn(r.view, 'Two'), []);
  assert.deepEqual(r.view.files, ['b.mp3']);
});

ok('a rename carries the songs and the order across', () => {
  const dir = freshDir(['a.mp3', 'b.mp3']);
  send(dir, [
    { id: '1', op: 'playlist-add', name: 'Old', files: ['a.mp3', 'b.mp3'] },
    { id: '2', op: 'playlist-reorder', name: 'Old', files: ['b.mp3', 'a.mp3'] },
  ]);
  const r = send(dir, [{ id: '3', op: 'playlist-rename', name: 'Old', to: 'New' }]);
  assert.deepEqual(lists(r.view), ['New']);
  assert.deepEqual(filesIn(r.view, 'New'), ['b.mp3', 'a.mp3']);
});

ok('deleting a phone list keeps the songs on the phone', () => {
  const dir = freshDir(['a.mp3']);
  send(dir, [{ id: '1', op: 'playlist-add', name: 'Set', files: ['a.mp3'] }]);
  const r = send(dir, [{ id: '2', op: 'playlist-delete', name: 'Set' }]);
  assert.deepEqual(lists(r.view), []);
  assert.deepEqual(r.view.files, ['a.mp3'], 'a song in no playlist is still a song');
});

console.log(`\n${pass} checks passed`);
