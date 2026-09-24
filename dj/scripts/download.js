// download.js — the page's doors into scripts/fetch.py. The page never builds a
// yt-dlp command or names a file itself: fetch.py (with naming.py) does, for
// every door, so the page, GetTracks, GetKaraoke and the queue worker agree on
// what a song is called.

import { runAction, runPy } from './bash.js';

/// Queue songs for the Mac's download worker and make sure it is running. The
/// worker lives in its own session, so closing the page does not stop it.
export async function enqueue(tracks) {
  const r = await runAction('queue-add', JSON.stringify(tracks));
  if (r.added) await startWorker();
  return r;
}

/// Start the worker if it isn't running. A second one exits at once.
export const startWorker = () => runPy('fetch.py', ['start-worker'], 30_000);

export async function queueVerb(verb, ids) {
  const r = await runAction(verb, ids === 'all' ? 'all' : JSON.stringify(ids));
  if (verb === 'queue-retry' && r.retried) await startWorker();
  return r;
}

/// Queue "find another source" for one song; the worker replaces the file in
/// place.
export async function redownload(file) {
  const r = await runAction('track-redownload', file);
  if (r.added) await startWorker();
  return r;
}

/// One song, now: { ok, file, lrc, lrc_timed, source_id } or { ok:false, error }.
export const downloadTrack = (track) => runPy('fetch.py', ['track', JSON.stringify(track)], 900_000);

/// One karaoke render, now: kind 'audio' (instrumental mp3) or 'video'.
export const downloadKaraoke = (track, kind) =>
  runPy('fetch.py', ['karaoke', JSON.stringify({ ...track, kind })], 900_000);
