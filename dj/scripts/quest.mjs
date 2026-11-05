// quest.mjs — DJ's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is DJ's MENU — every
// chore a player can do here — and each entry's `done_at` is DJ's own record
// of the last time it saw that chore done; `due` says whether it can be done
// now (a row DJ cannot offer publishes false, and a game hides it). `pool:
// true` offers an entry to the game's one-chore-a-day pick; `device` is where
// the player does it; `kind` is what sort of practice it is (a plain word — a
// game reads it, DJ names no game): every DJ chore is `song`; `how` says in a
// line how it is done.
//
//   dj-listen  one song played to its end — the Mac's player (its `ended`), or
//              the phone's (fact `dj-listen`). Due while the library holds a
//              song with its file.
//   dj-pick    a song the agent suggested, played: a play started from the
//              set it pushed (PageUpdate `play`, or ▶ on its proposed set) —
//              or that song started anywhere in DJ within PICK_HOURS of her
//              naming it (the Mac's player from the library, a phone's play
//              op): her picks are kept beside the library (`pick`), a play
//              start asks (`played`). Always due.
//
//   quest.mjs <id>     stamp <id> done now; prints one JSON line
//   quest.mjs pick <artist|title>…   the agent named these songs, now
//   quest.mjs played <artist|title>…  one song started: dj-pick if she named it
//   quest.mjs due      no stamp: bring the menu and every `due` up to date
//   quest.mjs stamp <id> <at>   the engine's door for a phone fact (SKILL.md
//                      `quests:`): done at <at> (2026-09-24T14:03:11Z); exit
//                      0 once the file holds it or a later time, else 1
//
// Only the fact crosses — due, done, when — never which song, which list or
// what was sung. Read-merge-write: every other entry keeps its `done_at`, a
// retired one leaves, and an entry this menu does not know stays as it is. A
// stamp never moves an entry's `done_at` back. A failure here never fails the
// action it follows: the CLI always exits 0, and callers swallow errors.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPEN = '/apps/dj/scripts/index.html';

export const MENU = [
  {
    id: 'dj-listen', kind: 'song', period: 'day', reward: 20, device: 'both', open: OPEN,
    title: { zh: '琴心 · 听一首歌', en: 'The heart of the zither · hear one song' },
    how: { zh: '在 DJ 里放一首歌，听到最后', en: 'Play one song in DJ through to its end' },
  },
  {
    id: 'dj-pick', kind: 'song', period: 'week', reward: 25, device: 'both', pool: true, open: OPEN,
    title: { zh: '点歌 · 让银月推荐一首歌', en: 'Ask for a song · let Yinyue pick one' },
    how: { zh: '问银月听什么，放她推荐的那首', en: 'Ask Yinyue what to hear; play the song she picks' },
  },
];

/// Rows taken out of the menu (2026-11-02): they leave the file, done or not.
export const RETIRED = ['dj-fetch', 'dj-sing', 'dj-playlist', 'dj-sync', 'dj-karaoke'];

/// Where quest facts live. A library kept elsewhere (DJ_DIR — a test) writes
/// beside itself, so it can never overwrite the real file.
export const questsDir = (env = process.env) =>
  env.DJ_QUESTS ||
  (env.DJ_DIR ? path.join(env.DJ_DIR, 'data', 'quests') : path.join(env.HOME || '', '.linggen', 'quests'));

/// The library DJ reads `due` from.
export const libraryFile = (env = process.env) =>
  path.join(env.DJ_DIR || path.join(env.HOME || '', '.linggen', 'skills', 'dj'), 'library.json');

/// The songs the agent named (a set it proposed, a song it played), kept beside the library — DJ's own data, never
/// in the quests file (only the fact crosses): { picks: [{ key, at }] }, the last PICK_HOURS only.
export const PICK_HOURS = 6;
export const picksFile = (env = process.env) =>
  path.join(env.DJ_DIR || path.join(env.HOME || '', '.linggen', 'skills', 'dj'), 'data', 'picks.json');

/// A song's key, as library.js trackId makes it: artist|title, case- and space-insensitive. A key given whole
/// (「张学友|秋意浓」) is folded the same way.
export const songKey = (t) => (typeof t === 'string'
  ? t.split('|').map((x) => x.toLowerCase().trim()).join('|')
  : `${String(t?.artist ?? '').toLowerCase().trim()}|${String(t?.title ?? '').toLowerCase().trim()}`);

const fresh = (picks, now) => picks.filter((p) => {
  const at = Date.parse(p?.at);
  return Number.isFinite(at) && at <= now.getTime() + 60_000 && now.getTime() - at <= PICK_HOURS * 3600_000;
});

/// The agent named these songs at `now`: kept, the stale ones let go.
export function notePicks(keys, { file = picksFile(), now = new Date() } = {}) {
  const held = fresh(Array.isArray(readJson(file)?.picks) ? readJson(file).picks : [], now);
  const add = [...new Set(keys.map(songKey).filter((k) => k !== '|'))];
  const picks = [...held.filter((p) => !add.includes(p.key)), ...add.map((key) => ({ key, at: now.toISOString() }))];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify({ picks })}\n`);
  fs.renameSync(tmp, file);
  return picks;
}

/// One song started playing at `now` (any of its keys: its row's, the title it was asked for): dj-pick stamped
/// when the agent named it in the last PICK_HOURS. Answers whether it counted.
export function playedPick(keys, { file = picksFile(), dir = questsDir(), now = new Date(), library = libraryFile() } = {}) {
  const want = new Set((Array.isArray(keys) ? keys : [keys]).map(songKey));
  const picks = fresh(Array.isArray(readJson(file)?.picks) ? readJson(file).picks : [], now);
  if (!picks.some((p) => want.has(p.key) && Date.parse(p.at) <= now.getTime() + 60_000)) return false;
  stamp('dj-pick', { dir, now, library });
  return true;
}

/// Whether each row can be done now: a song to hear needs a song. Pure.
export function dueOf(library) {
  const songs = Array.isArray(library?.tracks) ? library.tracks.filter((t) => t && t.file) : [];
  return { 'dj-listen': songs.length > 0, 'dj-pick': true };
}

/// The later of two times, either possibly missing or unreadable.
export function later(a, b) {
  const t = (v) => (typeof v === 'string' ? Date.parse(v) : NaN);
  if (Number.isNaN(t(a))) return Number.isNaN(t(b)) ? null : b;
  if (Number.isNaN(t(b))) return a;
  return t(b) > t(a) ? b : a;
}

/// The file's next body: the menu, each entry's `done_at` the later of what
/// the file held and `stamps` — a stamp never moves an entry back — and its
/// `due` from `due`, else as held, else false.
export function merged(doc, stamps, menu = MENU, app = 'dj', due = {}) {
  const held = Array.isArray(doc?.quests) ? doc.quests.filter((q) => q && typeof q === 'object') : [];
  const was = new Map(held.map((q) => [q.id, q]));
  const mine = new Set(menu.map((m) => m.id));
  return {
    app,
    quests: [
      ...menu.map((m) => {
        const had = was.get(m.id)?.done_at ?? null;
        const d = m.id in due ? Boolean(due[m.id]) : was.get(m.id)?.due === true;
        return { ...m, due: d, done_at: m.id in stamps ? later(had, stamps[m.id]) : had };
      }),
      ...held.filter((q) => !mine.has(q.id) && !RETIRED.includes(q.id)),
    ],
  };
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // none yet, or torn — the menu starts it again
  }
};

/// Write the file with `stamps` (id → time), `due` read from the library.
function write(stamps, { dir = questsDir(), library = libraryFile() } = {}) {
  const file = path.join(dir, 'dj.json');
  const body = merged(readJson(file), stamps, MENU, 'dj', dueOf(readJson(library)));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
  fs.renameSync(tmp, file);
  return body;
}

/// Stamp `id` done at `now`, written whole (tmp + rename). Throws on an id
/// the menu does not know — nothing is written then.
export function stamp(id, { dir = questsDir(), now = new Date(), library = libraryFile() } = {}) {
  if (!MENU.some((m) => m.id === id)) throw new Error(`unknown quest ${id}`);
  return write({ [id]: now.toISOString() }, { dir, library }).quests.find((q) => q.id === id);
}

/// Bring every `due` up to date, stamping nothing.
export const publishDue = (opts = {}) => write({}, opts);

/// For a verb that already ran: stamp, and never let the stamp fail it.
export function stampQuietly(id) {
  try {
    stamp(id);
  } catch {
    /* the next time it is done writes it again */
  }
}

const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
const STAMP_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

/// The engine's door: `stamp <id> <at>` → the exit code (0 once held).
export function stampCli(id, at, { dir = questsDir(), library = libraryFile() } = {}) {
  const when = new Date(at);
  if (!STAMP_AT.test(String(at || '')) || Number.isNaN(when.getTime())) return 1;
  try {
    stamp(id, { dir, now: when, library });
    return 0;
  } catch {
    return 1;
  }
}

const isCli = process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url));
if (isCli && (process.argv[2] === 'pick' || process.argv[2] === 'played')) {
  try {
    const keys = process.argv.slice(3);
    const out = process.argv[2] === 'pick' ? { picked: notePicks(keys).length } : { counted: playedPick(keys) };
    console.log(JSON.stringify({ ok: true, ...out }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
} else if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url)) && process.argv[2] === 'stamp') {
  process.exitCode = stampCli(process.argv[3], process.argv[4]);
} else if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  try {
    const id = String(process.argv[2] || '');
    const q = id === 'due' ? (publishDue(), null) : stamp(id);
    console.log(JSON.stringify({ ok: true, id, done_at: q?.done_at ?? null }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
