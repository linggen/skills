// lyrics-chase.mjs — the ONE chase for lyrics a song lacks, on the Mac. The
// engine runs it whenever a phone lists the library (SKILL.md `sync.on-list`),
// so a song gets its lyrics while nobody has the DJ page open; the page runs
// the same script when it is shown, and its "find lyrics" asks for one song.
//
// Who is asked: songs with no sidecar, and songs whose sidecar has no timings
// (every player drops a line without a stamp — 難念的經, 2026-09-18). A song
// searched and found nowhere is stamped by the matcher that searched
// (lyrics_match.py MATCHER) and sits out a month; a stamp from an older
// matcher counts as never searched, so a better matcher asks again at once
// (路虎 听雪落下的声音: stamped 2026-09-18 by an LRCLIB-only matcher, timed on
// NetEase since).
//
// Polite: one run at a time (a pidfile; a run asked for meanwhile is folded
// into one more pass), one song at a time with a pause between, a cap per
// pass. A lookup in which a request failed stamps nothing and stops the run;
// the next runs wait out a backoff (LRCLIB 503 ServerOverloaded, 2026-11-03).
//
// Usage: lyrics-chase.mjs            the background pass
//        lyrics-chase.mjs --file F   one song now, stamps and backoff aside
// Prints one JSON line. Writes go through actions.mjs, the one writer.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readJson, writeJson, DATA, LIB } from './io.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PY = process.env.LINGGEN_PY || 'python3';

export const RETRY_MS = 30 * 24 * 3600 * 1000; // a current stamp sits out a month
export const BACKOFF_MS = 30 * 60 * 1000; // after a failed request, no runs for this
const PAUSE_MS = Number(process.env.DJ_CHASE_PAUSE_MS ?? 2000); // between two songs
const PASS_CAP = 25; // songs per pass; the next run goes on
const SEARCH_MS = 90_000;

const LOCK = path.join(DATA, '.lyrics-chase.pid');
const AGAIN = path.join(DATA, '.lyrics-chase.again');
const STATE = path.join(DATA, 'lyrics-chase.json');

// ── who is asked (pure) ──────────────────────────────────────────────────────

/// A sidecar with at least one line stamp.
export const isTimed = (text) => /^\[\d{1,2}:\d{2}/m.test(String(text || ''));

/// The song was searched lately by this matcher: leave it be.
export const stampCurrent = (t, matcher, now = Date.now()) =>
  !!t.lrc_missing && t.lrc_matcher === matcher && now - Date.parse(t.lrc_missing) < RETRY_MS;

/// The songs to ask about. `timedOf(lrc)` → true / false / null (no file);
/// `exists(file)` → whether the song is on disk.
export function wanted(tracks, matcher, { timedOf, exists, now = Date.now() }) {
  return (tracks || []).filter((t) =>
    t.file && !stampCurrent(t, matcher, now) && exists(t.file) && (!t.lrc || timedOf(t.lrc) !== true));
}

/// What one answer means: `write` the words (timed or not), `stamp` with the
/// matcher, or `stop` — a request failed, so the answer is no answer.
export function verdict(got) {
  const body = got.ok && String(got.body || '').trim() ? got.body : null;
  const settled = got.settled !== false;
  return {
    body,
    timed: !!(body && got.synced),
    stamp: settled ? got.matcher : null,
    stop: !settled,
  };
}

// ── the disk ─────────────────────────────────────────────────────────────────

const loadTracks = () => readJson(LIB, {}).tracks || [];

const exists = (f) => {
  try { return fs.statSync(f).isFile(); } catch { return false; }
};

/// Sidecar timings, cached by mtime in lyrics-chase.json: a run that a phone
/// sync started reads only the sidecars that changed.
function timedReader(cache) {
  return (lrc) => {
    let mtime;
    try { mtime = fs.statSync(lrc).mtimeMs; } catch { return null; }
    const hit = cache[lrc];
    if (hit && hit.mtime === mtime) return hit.timed;
    const timed = isTimed(fs.readFileSync(lrc, 'utf8'));
    cache[lrc] = { mtime, timed };
    return timed;
  };
}

const loadState = () => {
  try { return { timed: {}, ...readJson(STATE, {}) }; } catch { return { timed: {} }; }
};

// ── one run at a time ────────────────────────────────────────────────────────

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/// The run's pidfile, or false when a live run holds it. A dead holder's is
/// taken over.
function takeLock() {
  fs.mkdirSync(DATA, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const holder = Number(fs.readFileSync(LOCK, 'utf8').trim());
    if (holder && alive(holder)) return false;
    fs.rmSync(LOCK, { force: true });
  }
  return false;
}

const dropLock = () => {
  try { if (fs.readFileSync(LOCK, 'utf8').trim() === String(process.pid)) fs.rmSync(LOCK); } catch { /* gone */ }
};

/// A run asked for while one held the lock: taken once by the holder.
const takeAgain = () => {
  try { fs.rmSync(AGAIN); return true; } catch { return false; }
};

// ── asking and recording ─────────────────────────────────────────────────────

const lastLine = (out) => {
  const line = String(out || '').trim().split('\n').filter(Boolean).pop() || '{}';
  try { return JSON.parse(line); } catch { return { ok: false, error: line }; }
};

const matcherNow = () => lastLine(spawnSync(PY, [path.join(HERE, 'lyrics_match.py'), '--version'], { encoding: 'utf8' }).stdout).matcher;

/// lyrics_match.py for one song on disk. A crash or a timeout is no answer.
function search(t) {
  const req = JSON.stringify({
    artist: String(t.artist || '').trim(),
    title: String(t.title || '').trim(),
    version: t.version || 'studio',
    file: t.file,
    other_titles: t.requested_title ? [t.requested_title] : [],
  });
  const r = spawnSync(PY, [path.join(HERE, 'lyrics_match.py'), req], { encoding: 'utf8', timeout: SEARCH_MS });
  const got = lastLine(r.stdout);
  return r.status === 0 && got.matcher ? got : { ok: false, settled: false, error: r.error?.message || 'no answer' };
}

function act(verb, ...args) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'actions.mjs'), verb, ...args.map(String)], { encoding: 'utf8' });
  const got = lastLine(r.stdout);
  if (!got.ok) throw new Error(got.error || `${verb} failed`);
}

const sidecarOf = (file) => `${file.replace(/\.[^./]+$/, '')}.lrc`;

/// Write what an answer found and stamp what it settled. → the verdict.
function record(t, got) {
  const v = verdict(got);
  if (v.body) {
    const lrc = sidecarOf(t.file);
    fs.writeFileSync(lrc, v.body.endsWith('\n') ? v.body : `${v.body}\n`);
    act('track-set-lrc', t.file, lrc, v.timed ? 'timed' : 'untimed', v.stamp ?? '');
    return { ...v, lrc };
  }
  if (v.stamp) act('track-no-lyrics', t.file, v.stamp);
  return v;
}

// ── the pass ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/// Ask about each wanted song in turn, until the cap or a failed request.
/// The library is read again before each song: a song the page or a download
/// settled meanwhile is not asked twice.
async function pass(matcher, state, tally) {
  const timedOf = timedReader(state.timed);
  const keys = wanted(loadTracks(), matcher, { timedOf, exists }).map((t) => t.file).slice(0, PASS_CAP);
  for (const [i, file] of keys.entries()) {
    const t = wanted(loadTracks(), matcher, { timedOf, exists }).find((x) => x.file === file);
    if (!t) continue;
    if (i) await sleep(PAUSE_MS);
    const v = record(t, search(t));
    tally.searched++;
    tally[v.timed ? 'timed' : v.body ? 'untimed' : v.stop ? 'unanswered' : 'missing']++;
    if (v.stop) return false;
  }
  return true;
}

async function background() {
  const state = loadState();
  if (Date.now() < (state.backoff_until || 0)) return { ok: true, backoff_until: new Date(state.backoff_until).toISOString() };
  if (!takeLock()) {
    fs.writeFileSync(AGAIN, '');
    return { ok: true, busy: true };
  }
  const tally = { searched: 0, timed: 0, untimed: 0, missing: 0, unanswered: 0 };
  try {
    const matcher = matcherNow();
    if (!matcher) return { ok: false, error: 'lyrics_match.py gave no matcher' };
    let calm = await pass(matcher, state, tally);
    if (calm && takeAgain()) calm = await pass(matcher, state, tally);
    if (!calm) state.backoff_until = Date.now() + BACKOFF_MS;
    writeJson(STATE, state);
    return { ok: true, matcher, ...tally };
  } finally {
    dropLock();
  }
}

/// The player's "find lyrics": one song now, whatever its stamp says.
function one(name) {
  const t = loadTracks().find((x) => x.file && (x.file === name || path.basename(x.file) === name));
  if (!t || !exists(t.file)) return { ok: false, error: 'no audio file for that song' };
  const v = record(t, search(t));
  return v.body ? { ok: true, lrc: v.lrc, timed: v.timed } : { ok: false, error: v.stop ? 'unanswered' : 'no lyrics found' };
}

async function main() {
  const [flag, name] = process.argv.slice(2);
  return flag === '--file' ? one(name) : background();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      process.exitCode = 1;
    });
}
