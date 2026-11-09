// mac-play.js — the page half of PlayInApp / StopInApp (mac-play.mjs). A play
// sent to the Mac (from the phone, a handoff) comes up on the retained
// `dj`/`mac-play` topic with a nonce and a deadline; the DJ page in the
// Linggen app plays it in its own player — lyrics, cover, pause, stop — and
// answers on `dj`/`mac-playing` with what its <audio> really did. The agent
// says "playing" only on that answer.
//
// Only the page inside the app takes it (`in_launcher=1`): that webview starts
// sound with no tap; a browser tab would refuse, and two pages must never both
// play one ask.

import { play, refreshLibrary } from './lib-view.js';
import { stopPlayer } from './player.js';
import { state } from './state.js';

const LATEST = '/api/topic/latest?topic=dj&op=mac-play';
const SEEN_KEY = 'dj.macPlaySeen';
const POLL_MS = 1500;
const IN_APP = new URLSearchParams(location.search).get('in_launcher') === '1';

let seen = (() => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch { return ''; } })();

function markSeen(nonce) {
  seen = nonce;
  try { localStorage.setItem(SEEN_KEY, nonce); } catch { /* memory is enough for this page */ }
}

/// One answer for one ask, retained so the waiting tool reads it whenever it looks.
function answer(nonce, reply) {
  return fetch('/api/topic/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'dj', op: 'mac-playing', payload: { nonce, at: Date.now(), ...reply }, retain: true }),
  }).catch(() => {});
}

/// The asked songs as this page's library rows, by file. A song that landed
/// after the page loaded its library is found on one refresh.
async function rowsFor(tracks) {
  const pick = () => {
    const byFile = new Map((state.library?.tracks || []).filter((t) => t.file).map((t) => [t.file, t]));
    return (tracks || []).map((t) => byFile.get(t?.file)).filter(Boolean);
  };
  const rows = pick();
  if (rows.length === (tracks || []).length) return rows;
  await refreshLibrary().catch(() => {});
  return pick();
}

const label = (t) => ({ artist: t?.artist || '', title: t?.title || '' });

/// Take one ask: a fresh one this page has not taken yet, else nothing.
export async function takeMacPlay(req) {
  if (!IN_APP || !req?.nonce || req.nonce === seen) return;
  if (!(Date.now() < Number(req.deadline))) return; // the tool already gave up — playing now would contradict it
  markSeen(req.nonce);
  if (req.action === 'stop') {
    const had = stopPlayer();
    answer(req.nonce, { state: 'stopped', was_playing: had });
    return;
  }
  const queue = await rowsFor(req.tracks);
  if (!queue.length) {
    answer(req.nonce, { state: 'failed', error: 'none of those songs are in the library this page sees' });
    return;
  }
  play(queue[0], queue, false, {
    onStart: (t) => answer(req.nonce, { state: 'playing', track: label(t), count: queue.length }),
    onRefused: (e) => answer(req.nonce, {
      state: e?.name === 'NotAllowedError' ? 'blocked' : 'failed',
      error: String(e?.message || e || 'the player could not start'),
    }),
  });
}

/// A live push (onSkillEvent) is the fast path; the poll covers a push that
/// came while the page was still booting or its chat was not up.
export function watchMacPlay() {
  if (!IN_APP) return;
  const tick = async () => {
    try {
      const r = await fetch(LATEST);
      if (r.ok) await takeMacPlay((await r.json()).payload);
    } catch { /* the next tick asks again */ }
  };
  tick();
  setInterval(tick, POLL_MS);
}

/// For the chat's onSkillEvent: a `dj`/`mac-play` push, taken at once.
export function onMacPlayEvent(event, payload) {
  if (event !== 'device_topic' || payload?.topic !== 'dj' || payload?.op !== 'mac-play') return;
  takeMacPlay(payload.payload);
}
