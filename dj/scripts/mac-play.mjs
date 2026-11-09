// mac-play.mjs — play on the Mac through the DJ page in the Linggen app. Backs
// the PlayInApp and StopInApp tools: a play asked for from the phone (or any
// handoff) sounds where the user can see it and stop it — the app's DJ page,
// with its lyrics, cover and controls — never a headless process.
//
//   play <tracks>   resolve against library.json, ask the page, wait for its answer
//   stop            ask the page to stop, wait for its answer
//
// The ask goes up on the retained `dj`/`mac-play` topic with a nonce and a
// deadline; the page (mac-play.js) answers on `dj`/`mac-playing` with what its
// <audio> really did. "playing" is the page's word, never this script's hope:
// no answer by the deadline is a plain failure, and the page ignores an ask
// whose deadline has passed, so a late page never plays what was reported failed.
//
// LINGGEN_PORT picks the engine (9527); DJ_MAC_PLAY_WAIT_MS the wait (10 s).
// Runs under bun or node (run-js.sh picks). Prints one JSON line.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveTracks } from './store.js';
import { readJson, LIB } from './io.mjs';

const WAIT_MS = Number(process.env.DJ_MAC_PLAY_WAIT_MS) || 10_000;
const POLL_MS = 250;
const BASE = `http://127.0.0.1:${process.env.LINGGEN_PORT || 9527}`;
const placeholder = (s) => /^\{\{.*\}\}$/.test(String(s ?? '').trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const NO_PAGE =
  'No DJ page in the Linggen app answered — Linggen may be closed, or its DJ tab not open. Nothing is playing; ask them to open Linggen → DJ and try again.';

// ── resolving what to play ───────────────────────────────────────────────────

/// The asked-for songs as library rows that exist on disk, in the order asked,
/// and the asks that name nothing playable. Same names ListLibrary gives and a
/// page `play` takes: {artist, title}, {file}, or a bare file name.
export function resolveQueue(lib, wanted, exists = fs.existsSync) {
  const queue = [];
  const missing = [];
  for (const w of wanted) {
    const key = typeof w === 'string' ? w
      : w?.file ? String(w.file)
        : (w?.artist || w?.title) ? `${String(w.artist || '').trim()}|${String(w.title || '').trim()}`.toLowerCase()
          : '';
    const label = w && typeof w === 'object'
      ? [w.artist, w.title].filter(Boolean).join(' - ') || w.file || '?'
      : String(w);
    const [row] = key ? resolveTracks(lib, [key]).hits : [];
    if (!row) missing.push(`${label}: not in the library`);
    else if (!exists(row.file)) missing.push(`${label}: file is missing on disk`);
    else queue.push({ artist: row.artist || '', title: row.title || '', file: row.file });
  }
  return { queue, missing };
}

export function parseTracks(raw) {
  const s = String(raw ?? '').trim();
  if (!s || placeholder(s)) throw new Error('missing tracks');
  let v;
  try { v = JSON.parse(s); } catch { v = s; } // a bare file name
  if (v && !Array.isArray(v) && typeof v === 'object' && Array.isArray(v.tracks)) v = v.tracks;
  const list = Array.isArray(v) ? v : [v];
  if (!list.length) throw new Error('tracks must name at least one song');
  return list;
}

// ── the page's answer ────────────────────────────────────────────────────────

/// What the tool returns for the page's reply to this ask (null: not yet).
export function resultOf(reply, nonce) {
  if (!reply || reply.nonce !== nonce) return null;
  switch (reply.state) {
    case 'playing': return { ok: true, playing: true, track: reply.track, count: reply.count };
    case 'stopped': return { ok: true, playing: false, stopped: true, was_playing: !!reply.was_playing };
    case 'blocked': return { ok: false, playing: false, error: 'The app refused to start sound without a tap; the DJ page shows "Tap to play".' };
    default: return { ok: false, playing: false, error: `The DJ page could not play it: ${reply.error || reply.state}` };
  }
}

/// The engine's topic door, over loopback. Injected in tests.
export const http = {
  async publish(op, payload) {
    const r = await fetch(`${BASE}/api/topic/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'dj', op, payload, retain: true }),
    });
    if (!r.ok) throw new Error(`publish HTTP ${r.status}`);
  },
  async latest(op) {
    const r = await fetch(`${BASE}/api/topic/latest?topic=dj&op=${op}`);
    return r.ok ? (await r.json()).payload : null;
  },
};

/// Send one ask to the page and wait for its answer to that ask, by nonce —
/// a retained answer from an earlier ask never counts.
export async function ask(body, { io = http, wait = WAIT_MS, now = Date.now } = {}) {
  const nonce = crypto.randomUUID();
  const deadline = now() + wait;
  try {
    await io.publish('mac-play', { ...body, nonce, at: now(), deadline });
  } catch (e) {
    return { ok: false, playing: false, error: `Could not reach Linggen on this Mac (${e.message || e}).` };
  }
  while (now() < deadline) {
    const got = resultOf(await io.latest('mac-playing').catch(() => null), nonce);
    if (got) return got;
    await sleep(POLL_MS);
  }
  return { ok: false, playing: false, error: NO_PAGE };
}

export async function main(argv, opts = {}) {
  const [verb, arg] = argv;
  if (verb === 'stop') return ask({ action: 'stop' }, opts);
  if (verb !== 'play') return { ok: false, error: `unknown verb ${verb ?? ''}; use play or stop` };
  let wanted;
  try { wanted = parseTracks(arg); } catch (e) { return { ok: false, playing: false, error: e.message }; }
  const lib = opts.lib ?? readJson(LIB, { tracks: [] });
  const { queue, missing } = resolveQueue(lib, wanted, opts.exists);
  if (!queue.length) return { ok: false, playing: false, error: 'None of those songs are in the library on this Mac.', missing };
  const res = await ask({ action: 'play', tracks: queue }, opts);
  return missing.length ? { ...res, missing } : res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2))
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => console.log(JSON.stringify({ ok: false, playing: false, error: String(e?.message || e) })));
}
