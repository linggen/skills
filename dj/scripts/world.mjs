// world.mjs — what DJ gives the world block (SKILL.md `world-line`) and the
// activity log (`activity-verbs`): how many songs the library holds, how many
// downloads wait, and the song last played. Readings, as text and numbers; no
// opinion of the music.
//
//   dj: songs 812 · downloads pending 2 · last played 三天三夜 - Beyond, 11-16 14:05 · 5m ago
//
// `last played` is the newest of two records: a play the phone reported (the
// library row's `last_played`) and a play the Mac's DJ page started (the page
// calls `world.mjs played`). A play that ended is not tracked, so it is "last
// played", never "playing now". The file keeps `played_at` (an ISO time) beside
// it, which the line does not show; it is how the next write knows which record
// is newer.
//
//   world.mjs played <artist> <title>   the page started this song
//
// The writer of the library and the queue (actions.mjs, queue.mjs) calls
// refreshWorld where it saves; nothing polls. Runs under bun or node.

import { fileURLToPath } from 'node:url';

import { readJson, writeJson, DJ_DIR, LIB, QUEUE } from './io.mjs';
import path from 'node:path';

export const WORLD = path.join(DJ_DIR, 'data', 'world.json');

const ACTIVE = new Set(['pending', 'running', 'cancelling']);
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (v) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/// `MM-DD HH:MM` in the Mac's own clock.
export function clockOf(iso) {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const nameOf = (t) => [t.title, t.artist].filter((x) => x && String(x).trim()).map((x) => String(x).trim()).join(' - ');

/// The longest value the line carries.
const VALUE_MAX = 48;

/// The last-played value: the song, then when. The song is shortened, never
/// the time, so a long title cannot cut the part that says when.
export function playedText(name, iso) {
  const when = clockOf(iso);
  const room = VALUE_MAX - when.length - 2;
  const song = name.length > room ? `${name.slice(0, Math.max(1, room - 1))}…` : name;
  return `${song}, ${when}`;
}

/// The newest play among the library's rows and the page's last record.
function lastPlayed(tracks, held, note) {
  let best = null;
  const take = (at, name) => {
    const iso = isoOf(at);
    if (iso && name && (!best || iso > best.at)) best = { at: iso, name };
  };
  for (const t of tracks) if (t?.last_played) take(t.last_played, nameOf(t));
  if (held?.played_at && held?.played_name) take(held.played_at, held.played_name);
  if (note) take(note.at, nameOf(note));
  return best;
}

/// The world file's body. Pure. `tracks` are library rows, `items` queue items,
/// `held` the file as it stands, `note` a play just started (`{artist, title,
/// at}`).
export function worldOf({ tracks = [], items = [], held = null, note = null } = {}) {
  const songs = tracks.filter((t) => t && t.file).length;
  const pending = items.filter((i) => ACTIVE.has(i?.status)).length;
  const world = { songs, downloads_pending: pending };
  const last = lastPlayed(tracks, held, note);
  if (last) {
    world.last_played = playedText(last.name, last.at);
    world.played_at = last.at;
    world.played_name = last.name;
  }
  return world;
}

/// Bring data/world.json in step with the library and the queue. `lib` and
/// `items` are what the caller just saved; the other is read from disk. Written
/// only when the body changes (so its modification time means the facts did).
/// Never fails the write it follows.
export function refreshWorld({ lib = null, items = null, note = null } = {}) {
  try {
    const tracks = (lib ?? readJson(LIB, { tracks: [] })).tracks ?? [];
    const queue = items ?? (readJson(QUEUE, { items: [] }).items ?? []);
    const held = readJson(WORLD, null);
    const world = worldOf({ tracks, items: queue, held, note });
    if (held && JSON.stringify(held) === JSON.stringify(world)) return;
    writeJson(WORLD, world);
  } catch {
    /* the next save writes it again */
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli && process.argv[2] === 'played') {
  const [artist = '', title = ''] = process.argv.slice(3);
  if (title.trim()) refreshWorld({ note: { artist, title, at: new Date().toISOString() } });
  console.log(JSON.stringify({ ok: true }));
}
