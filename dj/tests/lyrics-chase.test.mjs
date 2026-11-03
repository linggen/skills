// lyrics-chase.mjs — who is asked, what a stamp is worth, and a failed request
// stamping nothing. A fake lyrics_match.py (LINGGEN_PY) stands in for LRCLIB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTimed, stampCurrent, verdict, wanted } from '../scripts/lyrics-chase.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHASE = path.join(HERE, '..', 'scripts', 'lyrics-chase.mjs');
const NOW = Date.parse('2026-11-03T12:00:00Z');
const AGO = (days) => new Date(NOW - days * 86400_000).toISOString();

test('a stamp counts only from this matcher, inside the month', () => {
  assert.equal(stampCurrent({ lrc_missing: AGO(3), lrc_matcher: 2 }, 2, NOW), true);
  assert.equal(stampCurrent({ lrc_missing: AGO(3), lrc_matcher: 1 }, 2, NOW), false);
  assert.equal(stampCurrent({ lrc_missing: AGO(3) }, 2, NOW), false, 'no matcher = an older one');
  assert.equal(stampCurrent({ lrc_missing: AGO(31), lrc_matcher: 2 }, 2, NOW), false);
});

test('songs with no sidecar or an untimed one are asked; timed, stamped and absent ones are not', () => {
  const tracks = [
    { file: '/a.mp3' },
    { file: '/b.mp3', lrc: '/b.lrc' },
    { file: '/c.mp3', lrc: '/c.lrc' },
    { file: '/d.mp3', lrc_missing: AGO(1), lrc_matcher: 2 },
    { file: '/e.mp3', lrc_missing: AGO(1), lrc_matcher: 1 },
    { file: '/gone.mp3' },
    { title: 'no file' },
  ];
  const timedOf = (lrc) => lrc === '/b.lrc';
  const exists = (f) => f !== '/gone.mp3';
  assert.deepEqual(wanted(tracks, 2, { timedOf, exists, now: NOW }).map((t) => t.file), ['/a.mp3', '/c.mp3', '/e.mp3']);
});

test('a failed request is no answer: nothing is stamped, the run stops', () => {
  assert.deepEqual(verdict({ ok: false, settled: false, matcher: 2 }), { body: null, timed: false, stamp: null, stop: true });
  assert.deepEqual(verdict({ ok: false, settled: true, matcher: 2 }), { body: null, timed: false, stamp: 2, stop: false });
  assert.equal(verdict({ ok: true, body: '[00:01.00]x', synced: true, settled: true, matcher: 2 }).timed, true);
  assert.equal(isTimed('words\n[01:02.30]sung'), true);
  assert.equal(isTimed('only words'), false);
});

// ── end to end, on a scratch library ─────────────────────────────────────────

const FAKE_PY = `#!/bin/sh
case "$2" in
  --version) echo '{"ok":true,"matcher":2}' ;;
  *timed*)   printf '%s\\n' '{"ok":true,"body":"[00:01.00]la","synced":true,"settled":true,"matcher":2}' ;;
  *busy*)    echo '{"ok":false,"error":"no lyrics found","settled":false,"matcher":2}' ;;
  *)         echo '{"ok":false,"error":"no lyrics found","settled":true,"matcher":2}' ;;
esac
`;

function scratch(tracks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-chase-'));
  const music = path.join(dir, 'music');
  fs.mkdirSync(music);
  for (const t of tracks) {
    t.file = path.join(music, t.file);
    fs.writeFileSync(t.file, 'mp3');
  }
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({ tracks, playlists: [] }));
  const py = path.join(dir, 'fake-py.sh');
  fs.writeFileSync(py, FAKE_PY, { mode: 0o755 });
  const run = (...args) => {
    const r = spawnSync(process.execPath, [CHASE, ...args], {
      encoding: 'utf8',
      env: { ...process.env, DJ_DIR: dir, LINGGEN_PY: py, DJ_CHASE_PAUSE_MS: '0', DJ_BACKUP_EVERY_MS: '0' },
    });
    return JSON.parse(r.stdout.trim().split('\n').pop());
  };
  const rows = () => JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).tracks;
  return { dir, run, rows };
}

test('a pass writes timed lyrics and stamps the missing with its matcher', () => {
  const s = scratch([
    { id: 'x|timed', artist: 'x', title: 'timed', file: 'timed.mp3', lrc_missing: AGO(40) },
    { id: 'x|none', artist: 'x', title: 'none', file: 'none.mp3', lrc_missing: AGO(1) },
  ]);
  const r = s.run();
  assert.equal(r.searched, 2);
  const [timed, none] = s.rows();
  assert.ok(timed.lrc && !timed.lrc_missing && fs.readFileSync(timed.lrc, 'utf8').startsWith('[00:01.00]'));
  assert.equal(none.lrc_matcher, 2);
  assert.equal(s.run().searched, 0, 'stamped by this matcher: not asked again');
});

test('an overloaded server stamps nothing and backs off', () => {
  const s = scratch([
    { id: 'x|busy', artist: 'x', title: 'busy', file: 'busy.mp3' },
    { id: 'x|timed', artist: 'x', title: 'timed', file: 'timed.mp3' },
  ]);
  const r = s.run();
  assert.deepEqual([r.searched, r.unanswered], [1, 1], 'the run stops at the failure');
  assert.equal(s.rows()[0].lrc_missing, undefined);
  assert.ok(s.run().backoff_until, 'the next run waits');
  assert.equal(s.run('--file', 'timed.mp3').ok, true, 'a person asking is never held back');
});

test('a live run turns a second one away', () => {
  const s = scratch([{ id: 'x|a', artist: 'x', title: 'a', file: 'a.mp3' }]);
  fs.mkdirSync(path.join(s.dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(s.dir, 'data', '.lyrics-chase.pid'), String(process.pid));
  assert.equal(s.run().busy, true);
  fs.writeFileSync(path.join(s.dir, 'data', '.lyrics-chase.pid'), '999999');
  assert.equal(s.run().searched, 1, 'a dead holder is taken over');
});
