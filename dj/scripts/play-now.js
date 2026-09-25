// play-now.js — the first view: one to three rows of music to play right now,
// composed from the library's own facts. Pure (no DOM) so node tests it; the
// page paints it (play-now-view.js).
//
//   recent  songs that arrived in the last two weeks, newest first
//   stale   the playlist that has gone longest unplayed (or never played)
//   phone   what the phone carries
//
// Order: what the user pinned, then the agent's lead (it says why in the
// chat), then the rules' order above. A pin beats the agent.

const DAY = 24 * 3600 * 1000;
export const RECENT_DAYS = 14;
export const STALE_DAYS = 21;
export const MAX_ROWS = 3;
const MAX_TRACKS = 40;

const base = (f) => String(f || '').split('/').pop();
const ms = (iso) => {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : null;
};

function recent(tracks, now) {
  const since = now - RECENT_DAYS * DAY;
  const rows = tracks
    .filter((t) => (ms(t.added_at) ?? 0) >= since)
    .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)));
  if (!rows.length) return null;
  return { id: 'recent', tracks: rows.slice(0, MAX_TRACKS), count: rows.length, newest: rows[0].added_at };
}

/// A playlist's last play is its most recently played song's.
function lastPlayOf(songs) {
  let last = null;
  for (const t of songs) {
    const p = ms(t.last_played);
    if (p !== null && (last === null || p > last)) last = p;
  }
  return last;
}

function stale(tracks, lists, now) {
  const byFile = new Map(tracks.map((t) => [base(t.file), t]));
  let best = null;
  for (const p of lists || []) {
    const songs = (p.files || []).map((f) => byFile.get(base(f))).filter(Boolean);
    if (songs.length < 2) continue;
    const last = lastPlayOf(songs);
    if (last !== null && now - last < STALE_DAYS * DAY) continue;
    // Never played sorts before any date; ties go to the bigger list.
    const key = last ?? -Infinity;
    if (!best || key < best.key || (key === best.key && songs.length > best.tracks.length)) {
      best = { key, name: p.name, tracks: songs, last };
    }
  }
  if (!best) return null;
  return {
    id: 'stale',
    playlist: best.name,
    tracks: best.tracks.slice(0, MAX_TRACKS),
    count: best.tracks.length,
    last_played: best.last === null ? null : new Date(best.last).toISOString(),
  };
}

function phone(tracks) {
  const rows = tracks.filter((t) => t.on_phone);
  if (!rows.length) return null;
  return { id: 'phone', tracks: rows.slice(0, MAX_TRACKS), count: rows.length };
}

/// A playlist the agent led with, or the user pinned, by name.
function named(tracks, lists, name) {
  const p = (lists || []).find((l) => l.name === name);
  if (!p) return null;
  const byFile = new Map(tracks.map((t) => [base(t.file), t]));
  const songs = (p.files || []).map((f) => byFile.get(base(f))).filter(Boolean);
  if (!songs.length) return null;
  return { id: `list:${name}`, playlist: name, tracks: songs.slice(0, MAX_TRACKS), count: songs.length,
    last_played: (() => { const l = lastPlayOf(songs); return l === null ? null : new Date(l).toISOString(); })() };
}

/// The rows, in order. `pins` are row ids the user pinned ('recent', 'stale',
/// 'phone', 'list:<name>'); `lead` is the agent's pick, the same ids or a bare
/// playlist name. Returns at most MAX_ROWS rows, each marked pinned/led.
export function composeRows(lib, { pins = [], lead = null, now = Date.now() } = {}) {
  const tracks = (lib?.tracks || []).filter((t) => t.file);
  const lists = lib?.playlists || [];
  const rules = { recent: recent(tracks, now), stale: stale(tracks, lists, now), phone: phone(tracks) };
  const rowFor = (id) => {
    if (!id) return null;
    if (id in rules) return rules[id];
    return named(tracks, lists, String(id).replace(/^list:/, ''));
  };
  const out = [];
  const add = (row, how) => {
    if (!row || out.length >= MAX_ROWS) return;
    const same = out.find((r) => r.id === row.id || (row.playlist && r.playlist === row.playlist));
    if (same) { same[how] = true; return; }
    out.push({ ...row, [how]: true });
  };
  for (const id of pins) add(rowFor(id), 'pinned');
  add(rowFor(lead), 'led');
  for (const id of ['recent', 'stale', 'phone']) add(rules[id], 'rules');
  return out;
}
