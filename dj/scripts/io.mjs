// io.mjs — the disk under actions.mjs: where things live, reading and writing
// JSON, the one-writer lock, and the rotating library backup. Node/bun only.

import fs from 'node:fs';
import path from 'node:path';

export const HOME = process.env.HOME || '';
export const DJ_DIR = process.env.DJ_DIR || path.join(HOME, '.linggen', 'skills', 'dj');
export const DATA = path.join(DJ_DIR, 'data');
export const LIB = path.join(DJ_DIR, 'library.json');
export const QUEUE = path.join(DATA, 'queue.json');
export const OP_IDS = path.join(DATA, 'op-ids.json');
export const BACKUPS = path.join(DATA, 'backups');

// Thrown, never process.exit(): an exit inside a verb would skip the finally
// that releases the lock.
export const die = (error) => {
  throw new Error(error);
};

// ── JSON ─────────────────────────────────────────────────────────────────────

/// A missing file is the fallback; an unreadable one is NOT. Returning `{}` for
/// a truncated library.json let the next verb persist it — every song and
/// playlist gone in one write. So a parse failure keeps a copy aside and stops
/// the verb before anything is written.
export function readJson(file, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object') return value;
  } catch { /* quarantined below */ }
  return quarantine(file);
}

function quarantine(file) {
  // Named by the broken file's mtime: every retry against the same damage
  // lands on the same copy instead of filling the folder.
  const copy = `${file}.corrupt-${Math.round(fs.statSync(file).mtimeMs)}`;
  if (!fs.existsSync(copy)) fs.copyFileSync(file, copy);
  return die(`${path.basename(file)} is unreadable — nothing was changed; a copy is at ${copy}`);
}

// tmp + rename so a concurrent reader never sees a half-written file.
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// ── the lock ─────────────────────────────────────────────────────────────────
// One mutation at a time: two agent calls, a page call and the queue worker
// must not interleave a read-modify-write. mkdir is the portable atomic lock;
// the holder writes its pid inside.
//
// A waiter takes the lock over only when it is STALE — its holder is dead, or
// it has been held longer than any verb runs. A waiter's own patience running
// out is not staleness: that used to let a slow waiter steal a live holder's
// lock, and the holder's unlock then removed the thief's.

const LOCK = path.join(DATA, '.actions-lock');
const OWNER = path.join(LOCK, 'owner');
const STALE_MS = 30_000;
const WAIT_MS = Number(process.env.DJ_LOCK_WAIT_MS) || 20_000;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

const ownerIn = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, 'owner'), 'utf8').trim();
  } catch {
    return '';
  }
};

/// The owner it was judged on, or null when the lock is live (or gone).
function staleOwner() {
  let st;
  try {
    st = fs.statSync(LOCK);
  } catch {
    return null;
  }
  const owner = ownerIn(LOCK);
  const dead = owner && !alive(Number(owner));
  return dead || Date.now() - st.mtimeMs > STALE_MS ? owner : null;
}

/// Move the stale lock aside, then check it was the one judged: a live holder
/// may have taken the name in between, and then it goes back.
function takeOver(judged) {
  const away = `${LOCK}.stale-${process.pid}-${Date.now()}`;
  try {
    fs.renameSync(LOCK, away);
  } catch {
    return; // another waiter got there first
  }
  if (ownerIn(away) !== judged) {
    try { fs.renameSync(away, LOCK); } catch { /* a new holder already has it */ }
    return;
  }
  fs.rmSync(away, { recursive: true, force: true });
}

export function lock() {
  fs.mkdirSync(DATA, { recursive: true });
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      fs.writeFileSync(OWNER, String(process.pid));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const judged = staleOwner();
    if (judged !== null) {
      takeOver(judged);
      continue;
    }
    if (Date.now() > deadline) die('the library is busy — try again in a moment');
    sleep(50);
  }
}

/// Only ever our own lock.
export function unlock() {
  if (ownerIn(LOCK) === String(process.pid)) fs.rmSync(LOCK, { recursive: true, force: true });
}

// ── backups ──────────────────────────────────────────────────────────────────
// Before a write, when the newest copy is older than an hour, the library as it
// stands goes to data/backups/library-<time>.json. Ten are kept: a bad day's
// edits can be walked back, and the folder never grows.

const BACKUP_EVERY_MS = Number(process.env.DJ_BACKUP_EVERY_MS ?? 3_600_000);
const BACKUPS_KEPT = 10;

const backupNames = () =>
  fs.readdirSync(BACKUPS).filter((n) => /^library-.+\.json$/.test(n)).sort();

export function backupLibrary() {
  if (!fs.existsSync(LIB)) return;
  fs.mkdirSync(BACKUPS, { recursive: true });
  const names = backupNames();
  const newest = names.at(-1);
  const at = newest ? fs.statSync(path.join(BACKUPS, newest)).mtimeMs : 0;
  if (Date.now() - at < BACKUP_EVERY_MS) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(LIB, path.join(BACKUPS, `library-${stamp}.json`));
  for (const old of backupNames().slice(0, -BACKUPS_KEPT)) {
    fs.rmSync(path.join(BACKUPS, old), { force: true });
  }
}
