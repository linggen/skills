// lyrics-backfill.js — lyrics chased in the background for songs that lack
// them, and on demand from the player.
//
// Missing lyrics are asked about on every pass, not only when the folder
// changed (2026-09-18: three songs had sat lyric-less since August). A song
// searched for and found nowhere — or found only as words without timings —
// is stamped and sits out a month.

import { runAction, runBash, sq } from './bash.js';
import { trackKey } from './library.js';
import { attachLyrics } from './lyrics.js';
import { state, toast } from './state.js';

const LYRICS_RETRY_MS = 30 * 24 * 3600 * 1000;

const searchedLately = (t) =>
  !!t.lrc_missing && Date.now() - Date.parse(t.lrc_missing) < LYRICS_RETRY_MS;

// lrc path → { mtime, timed }: a sidecar is grepped again only when it changed.
const timedCache = new Map();

/// Sidecars that carry no timings. They look done — ♪ is on — but every player
/// drops a line without a stamp (2026-09-18: 66 lines of 難念的經, not one
/// timing). One stat over the lot, one grep over the ones that changed.
async function untimedLrcTracks(tracks) {
  const withLrc = tracks.filter((t) => t.lrc && t.file && !searchedLately(t));
  if (!withLrc.length) return [];
  const stat = await runBash(`stat -f '%m %N' ${withLrc.map((t) => sq(t.lrc)).join(' ')} 2>/dev/null; true`).catch(() => '');
  const mtimes = new Map(String(stat).split('\n').filter(Boolean).map((l) => {
    const cut = l.indexOf(' ');
    return [l.slice(cut + 1), l.slice(0, cut)];
  }));
  const stale = withLrc.filter((t) => mtimes.has(t.lrc) && timedCache.get(t.lrc)?.mtime !== mtimes.get(t.lrc));
  if (stale.length) {
    const out = await runBash(`grep -LE '^\\[[0-9]{1,2}:[0-9]{2}' ${stale.map((t) => sq(t.lrc)).join(' ')} 2>/dev/null; true`).catch(() => '');
    const bare = new Set(String(out).split('\n').map((l) => l.trim()).filter(Boolean));
    for (const t of stale) timedCache.set(t.lrc, { mtime: mtimes.get(t.lrc), timed: !bare.has(t.lrc) });
  }
  return withLrc.filter((t) => timedCache.get(t.lrc)?.timed === false);
}

/// Record what a search found: timed lyrics clear the stamp, words alone keep
/// them and stamp the song, nothing at all stamps it.
async function record(t, got) {
  if (!got) {
    await runAction('track-no-lyrics', t.file);
    t.lrc_missing = new Date().toISOString();
    return false;
  }
  await runAction('track-set-lrc', t.file, got.lrc, got.timed ? 'timed' : 'untimed');
  t.lrc = got.lrc;
  if (got.timed) delete t.lrc_missing;
  else t.lrc_missing = new Date().toISOString();
  timedCache.delete(got.lrc);
  return true;
}

let busy = false;
let again = false;

/// One backfill at a time: a pass asked for while one runs is folded into one
/// more pass after it, with whatever is still missing — never two searches for
/// one song.
export async function backfillLyrics(onChange) {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do {
      again = false;
      await backfillOnce(onChange);
    } while (again);
  } finally {
    busy = false;
  }
}

async function backfillOnce(onChange) {
  const tracks = state.library.tracks || [];
  const missing = tracks.filter((t) => !t.lrc && t.file && !searchedLately(t));
  const bare = await untimedLrcTracks(tracks);
  for (const key of [...missing, ...bare].map(trackKey)) {
    const t = state.library.tracks.find((x) => trackKey(x) === key);
    if (!t || !t.file) continue;
    try {
      if (await record(t, await attachLyrics(t, t.file))) onChange?.();
    } catch { /* lyrics are optional */ }
  }
}

/// The player's "find lyrics" for one song.
export async function fetchTrackLyrics(t, onChange) {
  if (!t.file) { toast('No audio file for this song.'); return null; }
  toast(`Looking for lyrics — ${t.title}`);
  try {
    const got = await attachLyrics(t, t.file);
    await record(t, got);
    if (!got) { toast(`No lyrics found for “${t.title}”.`); return null; }
    onChange?.();
    toast(`Got lyrics for “${t.title}”.`);
    return got.lrc;
  } catch (e) {
    toast(String(e.message || e));
    return null;
  }
}
