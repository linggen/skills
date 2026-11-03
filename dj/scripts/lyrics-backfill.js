// lyrics-backfill.js — the page's two doors onto lyrics-chase.mjs, the one
// chase (it also runs on the Mac whenever a phone lists the library, with no
// page open). Who is asked, how a song is stamped and how politely LRCLIB is
// treated all live there; the page only asks and then shows what changed.

import { SCRIPTS, lastJson, runBash, sq } from './bash.js';
import { loadLibrary } from './library.js';
import { state, toast } from './state.js';
import { t as tr } from './strings.js';

const chase = (...args) =>
  runBash(`bash "${SCRIPTS}/run-js.sh" "${SCRIPTS}/lyrics-chase.mjs" ${args.map(sq).join(' ')}`,
    { timeoutMs: 30 * 60 * 1000 }).then(lastJson);

/// Take the library as the chase left it.
async function reload(onChange) {
  state.library = await loadLibrary();
  onChange?.();
}

/// The background pass, asked for when the page is shown. A run already
/// going (a phone's) folds this ask into one more pass of its own.
export async function backfillLyrics(onChange) {
  try {
    const r = await chase();
    if (r.searched) await reload(onChange);
  } catch { /* lyrics are optional */ }
}

/// The player's "find lyrics" for one song.
export async function fetchTrackLyrics(t, onChange) {
  if (!t.file) { toast(tr('dj.noAudioFileFor')); return null; }
  toast(tr('dj.lookingForLyricsTitle', { title: t.title }));
  try {
    const r = await chase('--file', t.file);
    if (r.ok) t.lrc = r.lrc; // the player holds this row, not the reloaded one
    await reload(onChange);
    if (!r.ok) { toast(tr('dj.noLyricsFoundFor', { title: t.title })); return null; }
    toast(tr('dj.gotLyricsForTitle', { title: t.title }));
    return r.lrc;
  } catch (e) {
    toast(String(e.message || e));
    return null;
  }
}
