// The Play now view: rows from the library's own facts; a pin beats the agent.
import test from 'node:test';
import assert from 'node:assert/strict';

import { composeRows } from '../scripts/play-now.js';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
const song = (name, extra = {}) => ({ artist: 'A', title: name, file: `/m/A - ${name}.mp3`, added_at: day(90), ...extra });

const LIB = {
  tracks: [
    song('New', { added_at: day(2) }),
    song('Old1', { last_played: day(60) }),
    song('Old2'),
    song('Fresh1', { last_played: day(1), on_phone: true }),
    song('Fresh2', { on_phone: true }),
  ],
  playlists: [
    { name: 'Dusty', files: ['A - Old1.mp3', 'A - Old2.mp3'] },
    { name: 'Daily', files: ['A - Fresh1.mp3', 'A - Fresh2.mp3'] },
  ],
};

test('the rules: just in, the longest-unplayed list, the phone', () => {
  const rows = composeRows(LIB, { now: NOW });
  assert.deepEqual(rows.map((r) => r.id), ['recent', 'stale', 'phone']);
  assert.equal(rows[0].count, 1);
  assert.equal(rows[1].playlist, 'Dusty', 'Daily was played yesterday');
  assert.equal(rows[2].count, 2);
});

test('the agent leads; a pin beats it', () => {
  let rows = composeRows(LIB, { now: NOW, lead: 'phone' });
  assert.deepEqual(rows.map((r) => r.id), ['phone', 'recent', 'stale']);
  assert.equal(rows[0].led, true);
  rows = composeRows(LIB, { now: NOW, lead: 'Daily', pins: ['stale'] });
  assert.deepEqual(rows.map((r) => r.id), ['stale', 'list:Daily', 'recent']);
  assert.equal(rows[0].pinned, true);
});

test('never more than three rows, and an empty library has none', () => {
  assert.equal(composeRows(LIB, { now: NOW, pins: ['list:Daily'], lead: 'phone' }).length, 3);
  assert.deepEqual(composeRows({ tracks: [], playlists: [] }, { now: NOW }), []);
});

test('a lead that names nothing is ignored', () => {
  assert.deepEqual(composeRows(LIB, { now: NOW, lead: 'No such list' }).map((r) => r.id), ['recent', 'stale', 'phone']);
});
