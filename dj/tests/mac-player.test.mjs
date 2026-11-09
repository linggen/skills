// mac-player: headless playback on the Mac. The resolver and the status read
// are pure; one end-to-end run drives the real runner against a silent
// stand-in for afplay (DJ_PLAYER_BIN), so no sound plays here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveQueue, parseTracks, statusOf } from '../scripts/mac-player.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'mac-player.mjs');

const LIB = {
  tracks: [
    { id: '周杰伦|以父之名', artist: '周杰伦', title: '以父之名', file: '/m/周杰伦 - 以父之名.mp3' },
    { artist: 'Beyond', title: '海闊天空', file: '/m/Beyond - 海闊天空.mp3' },
    { artist: 'Gone', title: 'Lost', file: '/m/Gone - Lost.mp3' },
  ],
  playlists: [],
};
const onDisk = (f) => f !== '/m/Gone - Lost.mp3';

test('resolves artist+title, a file name and a bare string, in the order asked', () => {
  const { queue, missing } = resolveQueue(LIB, [
    { artist: 'beyond', title: '海闊天空' },
    { file: '周杰伦 - 以父之名.mp3' },
    'Beyond - 海闊天空.mp3',
  ], onDisk);
  assert.deepEqual(queue.map((t) => t.title), ['海闊天空', '以父之名', '海闊天空']);
  assert.deepEqual(missing, []);
});

test('names what it cannot play: not in the library, or gone from disk', () => {
  const { queue, missing } = resolveQueue(LIB, [
    { artist: '周杰伦', title: '以父之名' },
    { artist: 'Nobody', title: 'Nothing' },
    { artist: 'Gone', title: 'Lost' },
  ], onDisk);
  assert.equal(queue.length, 1);
  assert.deepEqual(missing, ['Nobody - Nothing: not in the library', 'Gone - Lost: file is missing on disk']);
});

test('tracks arrive as an array, a page-style {tracks}, one object or a file name', () => {
  assert.equal(parseTracks('[{"artist":"a","title":"b"}]').length, 1);
  assert.equal(parseTracks('{"tracks":[{"file":"x"},{"file":"y"}]}').length, 2);
  assert.deepEqual(parseTracks('{"artist":"a","title":"b"}'), [{ artist: 'a', title: 'b' }]);
  assert.deepEqual(parseTracks('A - B.mp3'), ['A - B.mp3']);
  assert.throws(() => parseTracks('{{tracks}}'), /missing tracks/);
  assert.throws(() => parseTracks(''), /missing tracks/);
});

const ST = { token: 't', queue: [{ artist: 'A', title: 'One', file: '/m/1' }], index: 0, runner_pid: 10, player_pid: 11 };
const RUNNER = { stat: 'S', ppid: 1, command: 'bun /x/mac-player.mjs run t' };
const looks = (table) => (pid) => table[pid] || null;

test('status reads the processes, not the hope in the state file', () => {
  const bin = '/usr/bin/afplay';
  const play = { stat: 'S', ppid: 10, command: '/usr/bin/afplay /m/1' };
  assert.equal(statusOf(ST, looks({ 10: RUNNER, 11: play }), bin).state, 'playing');
  assert.equal(statusOf(ST, looks({ 10: RUNNER, 11: { ...play, stat: 'T' } }), bin).state, 'paused');
  assert.equal(statusOf(ST, looks({ 10: RUNNER }), bin).state, 'loading');
  const stale = statusOf(ST, looks({}), bin);
  assert.equal(stale.state, 'stopped');
  assert.equal(stale.playing, false);
  assert.equal(stale.stale, true, 'a dead runner reads as stopped');
  // A reused pid that is someone else's process is not our player.
  assert.equal(statusOf(ST, looks({ 10: RUNNER, 11: { stat: 'S', ppid: 1, command: '/bin/zsh' } }), bin).playing, false);
  // An orphaned player still sounds — say so.
  assert.equal(statusOf(ST, looks({ 11: play }), bin).playing, true);
  assert.equal(statusOf({}, looks({}), bin).state, 'stopped');
});

test('end to end: play, pause, resume, next, stop — against a silent player', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-macplayer-'));
  const music = path.join(dir, 'm');
  fs.mkdirSync(music);
  const files = ['A - One.mp3', 'A - Two.mp3'].map((n) => { const f = path.join(music, n); fs.writeFileSync(f, 'x'); return f; });
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({
    tracks: [{ artist: 'A', title: 'One', file: files[0] }, { artist: 'A', title: 'Two', file: files[1] }],
    playlists: [],
  }));
  const fake = path.join(dir, 'fake-player');
  // A node stand-in, so its command line still names it (as afplay's does).
  fs.writeFileSync(fake, `#!${process.execPath}\nsetTimeout(() => {}, 30000);\n`, { mode: 0o755 });
  const env = { ...process.env, DJ_DIR: dir, DJ_PLAYER_BIN: fake };
  const run = (...a) => JSON.parse(execFileSync(process.execPath, [SCRIPT, ...a], { env, encoding: 'utf8' }).trim().split('\n').pop());
  try {
    let s = run('play', '[{"artist":"A","title":"One"},{"artist":"A","title":"Two"},{"artist":"B","title":"X"}]');
    assert.equal(s.playing, true);
    assert.equal(s.track.title, 'One');
    assert.deepEqual(s.missing, ['B - X: not in the library']);
    assert.equal(run('pause').state, 'paused');
    assert.equal(run('resume').state, 'playing');
    s = run('next');
    assert.equal(s.track.title, 'Two');
    assert.equal(s.playing, true);
    s = run('stop');
    assert.equal(s.state, 'stopped');
    assert.equal(s.stopped.title, 'Two');
    assert.equal(run('status').playing, false);
    assert.equal(run('pause').error, 'nothing is playing');
    assert.equal(run('play', '[{"artist":"No","title":"Such"}]').ok, false);
  } finally {
    try { run('stop'); } catch { /* best effort */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
