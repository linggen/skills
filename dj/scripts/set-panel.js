// set-panel.js — the DYNAMIC half of the page: the set the agent proposes via
// PageUpdate, and getting it. "Get" queues the songs on the Mac's download
// worker (scripts/fetch.py), which keeps going with the page closed; each row
// shows what the queue says about its song.

import { loadQueue, isOwned, ownedRow, trackId, trackKey } from './library.js';
import { enqueue, queueVerb } from './download.js';
import { drainStep } from './drain.js';
import { play, refreshLibrary } from './lib-view.js';
import { state, toast } from './state.js';
import { thumbUrl } from './thumbs.js';
import { $, esc, plural } from './ui.js';

// ── what the queue says about a song ─────────────────────────────────────────

/// The latest queue item per song (downloads only — a re-download is a song
/// already owned).
function queueBySong() {
  const by = new Map();
  for (const i of state.queue) if (i.kind !== 'redownload') by.set(trackId(i), i);
  return by;
}

const QUEUE_STATE = { pending: 'queued', running: 'getting', cancelling: 'stopping', error: 'error' };

function statusOf(t, bySong) {
  if (isOwned(state.library, t)) return { key: 'owned' };
  const item = bySong.get(trackId(t));
  return { key: QUEUE_STATE[item?.status] || 'new', item };
}

// ── the queue, watched ───────────────────────────────────────────────────────

const ACTIVE = new Set(['pending', 'running', 'cancelling']);
let watching = null;
let finishedSeen = -1;
const inRun = new Set();
let onDrained = () => {};

/// Who hears a finished run's facts — dj.js hands them to the agent, who
/// words them. The page never writes that sentence itself.
export function onQueueDrained(fn) { onDrained = fn; }

const finishedCount = () => state.queue.filter((i) => i.status === 'done').length;

/// Re-read the queue; when a song landed since the last look, re-read the
/// library once — that is the whole cost of a landed song.
export async function pollQueue() {
  state.queue = await loadQueue();
  const done = finishedCount();
  if (finishedSeen >= 0 && done !== finishedSeen) await refreshLibrary();
  finishedSeen = done;
  renderSet();
  const facts = drainStep(state.queue, inRun);
  if (facts) onDrained(facts);
  return state.queue.some((i) => ACTIVE.has(i.status));
}

/// Poll every 2 s while something is in flight and the page is visible.
export function watchQueue() {
  if (watching) return;
  const tick = async () => {
    const busy = document.hidden ? true : await pollQueue().catch(() => true);
    watching = busy ? setTimeout(tick, 2000) : null;
  };
  watching = setTimeout(tick, 0);
}

// ── PageUpdate from the agent ────────────────────────────────────────────────

/// The model is not perfectly consistent: `body` arrives as { key } or
/// [{ key }] (and rarely the bare key).
function extractKey(args, key) {
  if (!args) return null;
  const fromBody = (b) => {
    if (!b) return null;
    if (Array.isArray(b)) return b.map((x) => x?.[key]).find(Boolean) || null;
    return b[key] || null;
  };
  return fromBody(args.body) || args[key] || fromBody(args);
}

/// Play owned songs; the agent proposes a set for anything missing.
function applyAgentPlay(pp) {
  const byKey = new Map((state.library.tracks || []).filter((t) => t.file).map((t) => [trackKey(t), t]));
  const queue = (pp.tracks || []).map((t) => byKey.get(trackId(t))).filter(Boolean);
  if (!queue.length) { toast('None of those are downloaded yet.'); return; }
  play(queue[0], queue);
}

export function applyPageUpdate(args) {
  const pp = extractKey(args, 'play');
  if (pp) { applyAgentPlay(pp); return; }
  const tl = extractKey(args, 'tracklist');
  if (!tl || !Array.isArray(tl.tracks)) return;
  state.set = {
    name: tl.name || 'New set',
    brief: tl.brief || '',
    tracks: tl.tracks.map((t) => ({
      artist: t.artist || '', title: t.title || '', year: t.year || '', note: t.note || '', selected: true,
    })),
  };
  renderSet();
}

// ── persistence ──────────────────────────────────────────────────────────────
// PageUpdate is a live stream event: a set proposed from the PHONE has no Mac
// page watching, and a reload loses even one that rendered. The last proposal
// is kept for a day; status is re-read from the library and queue, never saved.

const SET_STORE = 'dj.lastSet';

function saveSet() {
  try { localStorage.setItem(SET_STORE, JSON.stringify({ at: Date.now(), set: state.set })); } catch { /* live-only */ }
}

export function restoreSet() {
  if (state.set) return;
  try {
    const raw = JSON.parse(localStorage.getItem(SET_STORE) || 'null');
    if (!raw?.set?.tracks || Date.now() - raw.at > 24 * 3600 * 1000) return;
    state.set = raw.set;
    renderSet();
  } catch { /* unreadable save — start clean */ }
}

// ── painting ─────────────────────────────────────────────────────────────────

const selected = (t) => t.selected !== false;

export function renderSet() {
  const el = $('set');
  if (!state.set) { el.classList.add('hidden'); return; }
  saveSet();
  const s = state.set;
  const bySong = queueBySong();
  const rows = s.tracks.map((t) => ({ t, st: statusOf(t, bySong) }));
  const gettable = rows.filter((r) => r.st.key === 'new' && selected(r.t)).length;
  const inFlight = rows.filter((r) => ['queued', 'getting'].includes(r.st.key)).map((r) => r.st.item.id);
  const allSel = s.tracks.every(selected);
  const owned = rows.every((r) => r.st.key === 'owned');
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="set-head">
      <div>
        <h3 class="set-title">${esc(s.name)}</h3>
        ${s.brief ? `<div class="set-brief">${esc(s.brief)}</div>` : ''}
      </div>
      <div class="set-actions">
        <button class="btn ghost small" id="select-all">${allSel ? 'Select none' : 'Select all'}</button>
        ${inFlight.length ? `<button class="btn ghost small" id="cancel-all">Stop ${inFlight.length}</button>` : ''}
        <button class="btn small" id="get-all" ${gettable ? '' : 'disabled'}>
          ${gettable ? `Get ${gettable}` : owned ? 'All owned' : inFlight.length ? 'Getting…' : 'None selected'}
        </button>
      </div>
    </div>
    <div class="set-list">${rows.map((r, i) => trackRow(r.t, r.st, i)).join('')}</div>
    <div class="progress"><span id="set-progress" style="width:${progressPct(rows)}%"></span></div>`;
  wireSet(el, inFlight);
}

function progressPct(rows) {
  const touched = rows.filter((r) => r.st.item);
  if (!touched.length) return 0;
  const settled = touched.filter((r) => r.st.key === 'owned' || r.st.key === 'error').length;
  return Math.round((settled / touched.length) * 100);
}

function wireSet(el, inFlight) {
  const s = state.set;
  $('get-all').onclick = getAll;
  $('select-all').onclick = () => {
    const v = !s.tracks.every(selected);
    s.tracks.forEach((t) => { t.selected = v; });
    renderSet();
  };
  const cancelAll = $('cancel-all');
  if (cancelAll) cancelAll.onclick = () => queueAction('queue-cancel', inFlight);
  el.querySelectorAll('.set-chk').forEach((c) => (c.onchange = () => {
    s.tracks[+c.dataset.i].selected = c.checked;
    renderSet();
  }));
  el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => queueAction(b.dataset.q, [b.dataset.id])));
  el.querySelectorAll('.set-play').forEach((b) => (b.onclick = () => playFromSet(+b.dataset.play)));
}

/// Play one song of the set, with the set's owned songs as the queue.
function playFromSet(i) {
  const lib = ownedRow(state.library, state.set.tracks[i]);
  if (!lib) return;
  play(lib, state.set.tracks.map((x) => ownedRow(state.library, x)).filter(Boolean));
}

const CELLS = {
  owned: (t, st, i) => `<button class="set-play" data-play="${i}" title="Play">▶</button>`,
  queued: (t, st) => `<div class="state">queued <button class="q-btn" data-q="queue-cancel" data-id="${esc(st.item.id)}" title="Stop">✕</button></div>`,
  getting: (t, st) => `<div class="state">getting… <button class="q-btn" data-q="queue-cancel" data-id="${esc(st.item.id)}" title="Stop">✕</button></div>`,
  stopping: () => '<div class="state">stopping…</div>',
  error: (t, st) => `<div class="state">${esc(st.item.error || 'not found')} <button class="q-btn" data-q="queue-retry" data-id="${esc(st.item.id)}">Retry</button></div>`,
  new: () => '<div class="state"></div>',
};

function trackRow(t, st, i) {
  const lib = st.key === 'owned' ? ownedRow(state.library, t) : null;
  const face = lib
    ? `<span class="card-cover"><img class="row-thumb" src="${thumbUrl(lib)}" loading="lazy" alt="" onerror="this.classList.add('noart')" /></span>`
    : `<div class="idx">${i + 1}</div>`;
  const cls = { owned: 'owned', error: 'err' }[st.key] || '';
  return `<div class="trackrow ${cls}">
    <input type="checkbox" class="set-chk" data-i="${i}" ${selected(t) ? 'checked' : ''} title="Include this song" />
    ${face}
    <div class="meta">
      <div class="t">${esc(t.title)}</div>
      <div class="a">${esc(t.artist)}${t.year ? ` · ${esc(t.year)}` : ''}${t.note ? ` — <span class="note">${esc(t.note)}</span>` : ''}</div>
    </div>
    ${CELLS[st.key](t, st, i)}
  </div>`;
}

// ── getting ──────────────────────────────────────────────────────────────────

// "Disney Essentials — 10 Songs" and "Disney Essentials" are one playlist.
const cleanPlaylistName = (s) => {
  const t = String(s || '').trim();
  return t.replace(/\s*[—\-–]\s*\d+\s*(songs?|tracks?|首)\s*$/i, '').trim() || t;
};

async function getAll() {
  const bySong = queueBySong();
  const todo = state.set.tracks.filter((t) => selected(t) && statusOf(t, bySong).key === 'new');
  if (!todo.length) return;
  const playlist = cleanPlaylistName(state.set.name);
  try {
    const r = await enqueue(todo.map((t) => ({ artist: t.artist, title: t.title, year: t.year || undefined, playlist })));
    toast(`${plural(r.added, 'song')} queued — they keep downloading if you close DJ.`);
  } catch (e) {
    toast(String(e.message || e));
  }
  await pollQueue().catch(() => {});
  watchQueue();
}

async function queueAction(verb, ids) {
  try {
    await queueVerb(verb, ids);
  } catch (e) {
    toast(String(e.message || e));
  }
  await pollQueue().catch(() => {});
  watchQueue();
}
