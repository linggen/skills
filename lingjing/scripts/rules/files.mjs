// rules/files.mjs — Files: where the data lives, atomic writes, the clock, argument parsing.
// Part of the rules engine; rules.mjs is its one door.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardOf, madeWorldDir, overlayOf } from '../content.mjs';
import { newState } from '../state.mjs';

/* ── Files and the command line ── */

// The scripts folder: this file sits one below it, in rules/.
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = () => path.resolve(HERE, '..');
const dataDir = () => process.env.LINGJING_DATA || path.resolve(HERE, '../data');
const savesDir = () => path.join(dataDir(), 'saves');
const savedFile = id => path.join(savesDir(), `${id}.json`);
const savedFor = id => fs.existsSync(savedFile(id));

/* The made world's folder, from its outline: the card, the words, the new
   creatures, its province, the opening scene. Art comes later, by `art`. */
function writeMadeWorld(outline, now) {
  const dir = madeWorldDir(outline.id);
  const overlay = overlayOf(outline);
  const pid = outline.province.id;
  fs.rmSync(dir, { recursive: true, force: true });
  const put = (rel, doc) => writeAtomic(path.join(dir, rel), JSON.stringify(doc, null, 2));
  put('world.json', cardOf(outline, now));
  put('dictionary.json', overlay.dictionary);
  put('creatures.json', overlay.creatures);
  put(`places/${pid}.json`, overlay.places[pid]);
  put(`scenes/${outline.scene.id}.json`, outline.scene);
}

/* A save begun in a world: a made world's opening scene is entered at
   once — its story starts there, not on a spine. */
function freshState(content, lang, now) {
  const s = newState(content, lang, now);
  if (content.opening && content.world.opening) {
    s.made = { scenes: { ...content.opening }, at: content.world.opening };
  }
  return s;
}
const questsDir = () => process.env.LINGJING_QUESTS || path.join(os.homedir(), '.linggen', 'quests');
const clock = () => (process.env.LINGJING_NOW ? new Date(process.env.LINGJING_NOW) : new Date());
/* How many messages the player has sent this session, the engine's count
   (LINGGEN_USER_TURNS); null on an engine that does not say. */
const userTurn = () => (/^\d+$/.test(process.env.LINGGEN_USER_TURNS ?? '') ? Number(process.env.LINGGEN_USER_TURNS) : null);

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/* ── One writer at a time ──
   Every call reads the save, changes it and writes it back; two at once (the
   page's tap and Ling's tool, a second tab) lost one of the two changes. So
   a call holds `<state.json>.lock` from its read to its last write — for
   every verb, Look's `asked_at` too. The engine keeps the same convention:
   an exclusive create (`wx`) holding the pid; older than 10 s is a crashed
   holder's, removed and tried again; tried every 25 ms for up to 5 s, then
   `busy`. Released in `finally`, whatever the call did. */
const LOCK = { stale_ms: 10_000, retry_ms: 25, wait_ms: 5_000 };
const nap = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const lockAge = file => { try { return Date.now() - fs.statSync(file).mtimeMs; } catch { return 0; } };

function takeLock(lock) {
  const until = Date.now() + LOCK.wait_ms;
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      try { fs.writeSync(fd, String(process.pid)); } finally { fs.closeSync(fd); }
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    if (lockAge(lock) > LOCK.stale_ms) { fs.rmSync(lock, { force: true }); continue; }
    if (Date.now() >= until) return false;
    nap(LOCK.retry_ms);
  }
}

/* Run `fn` holding the lock on `file`; `busy()` answers when it cannot be had. */
function withLock(file, fn, busy) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  if (!takeLock(lock)) return busy();
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

function readQuests() {
  const dir = questsDir();
  if (!fs.existsSync(dir)) return [];
  const quests = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const q of doc.quests ?? []) quests.push({ ...q, app: doc.app });
    } catch { /* an app's half-written file is skipped, never fatal */ }
  }
  return quests;
}

/* `--key=value` (what SKILL.md's templates send: an omitted arg arrives as an
   empty `--key=`, never a missing token) or `--key value` by hand. An empty
   value or a placeholder the agent left unfilled ({{x}}) is dropped. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const joined = /^--([^=]+)=([\s\S]*)$/.exec(argv[i] ?? '');
    const key = joined ? joined[1] : argv[i]?.replace(/^--/, '');
    const raw = joined ? joined[2] : argv[++i];
    if (!key || raw == null || raw === '' || /^\{\{.*\}\}$/.test(raw)) continue;
    args[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
  }
  return args;
}

export { clock, dataDir, freshState, LOCK, readQuests, savedFile, savedFor, savesDir, skillDir, userTurn, withLock, writeAtomic, writeMadeWorld };
