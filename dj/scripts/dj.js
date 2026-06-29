// dj.js — the DJ page. Wires the agent's curation (PageUpdate → a proposed
// "set") to the user's local actions (Get → yt-dlp download, Sync → VLC push).
//
//   FIXED  — the library grid: the page owns it, the agent never touches it.
//   DYNAMIC — the #set panel: filled ONLY by the agent via PageUpdate.

import './chat-bridge.js'; // sets window.LinggenUI
import { runBash, sq } from './bash.js';
import { listSkillSessions } from './api.js';
import { loadConfig, loadLibrary, saveLibrary, trackId, isOwned } from './library.js';
import { ensureBins, downloadTrack } from './download.js';
import { attachLyrics } from './lyrics.js';
import { openPlayer } from './player.js';
import { syncToPhone } from './sync.js';

const SKILL = 'dj';
const params = new URLSearchParams(location.search);
const MODEL_ID = params.get('model') || '';

const state = {
  config: { sync_targets: [] },
  library: { tracks: [], playlists: [] },
  set: null, // the currently proposed tracklist
  busy: false,
  crate: null, // selected playlist filter (null = All)
  query: '', // library search text
  pendingRemove: null, // track id awaiting a second click to confirm removal
};

let chat = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  [state.config, state.library] = await Promise.all([loadConfig(), loadLibrary()]);
  renderLibrary();
  wireButtons();
  wireResizer();
  wireBuild();
  wireLibrary();
  await mountChat();
})();

// ── library manager: search + crate filter + per-track actions ───────────────
const trackKey = (t) => t.id || trackId(t);

function cratesOf(tracks) {
  const set = new Set();
  for (const t of tracks) for (const p of t.playlists || []) set.add(p);
  return [...set];
}

// The filtered + ordered library list — what the grid shows AND the play queue.
function libraryView() {
  let tracks = state.library.tracks || [];
  if (state.crate) tracks = tracks.filter((t) => (t.playlists || []).includes(state.crate));
  const q = state.query.trim().toLowerCase();
  if (q) tracks = tracks.filter((t) => `${t.artist} ${t.title}`.toLowerCase().includes(q));
  return tracks.slice().reverse();
}

function renderLibrary() {
  const all = state.library.tracks || [];
  $('lib-count').textContent = all.length ? `${all.length} track${all.length === 1 ? '' : 's'}` : '';
  const cratesEl = $('lib-crates');
  const grid = $('library');

  if (!all.length) {
    cratesEl.innerHTML = '';
    grid.innerHTML = `<div class="empty">Your downloaded tracks show up here. Build a set above to start.</div>`;
    return;
  }

  // Crate chips: All + each playlist; a per-crate sync button when one is active.
  const crates = cratesOf(all);
  const chip = (label, val) =>
    `<button class="crate ${state.crate === val ? 'on' : ''}" data-crate="${esc(val ?? '')}">${esc(label)}</button>`;
  let cratesHtml = chip('All', null) + crates.map((c) => chip(c, c)).join('');
  if (state.crate) cratesHtml += `<button class="crate sync-crate" data-synccrate="1">⤴ Sync “${esc(state.crate)}” to phone</button>`;
  cratesEl.innerHTML = cratesHtml;

  const tracks = libraryView();
  if (!tracks.length) { grid.innerHTML = `<div class="empty">Nothing matches.</div>`; return; }
  grid.innerHTML = tracks.map(cardHtml).join('');
}

function cardHtml(t) {
  const id = trackKey(t);
  const badges =
    ((t.synced_to || []).length ? `<span class="badge">✓ on phone</span>` : '') +
    (t.lrc ? `<span class="badge">♪ lyrics</span>` : '');
  const pending = state.pendingRemove === id;
  return `<div class="card" data-id="${esc(id)}">
    <div class="card-main">
      <div class="t">${esc(t.title)}</div>
      <div class="a">${esc(t.artist)}${t.year ? ` · ${esc(t.year)}` : ''}</div>
      <div class="badges">${badges}</div>
    </div>
    <div class="card-acts">
      <button data-act="play" title="Play with lyrics">▶</button>
      <button data-act="reveal" title="Show in Finder">⤓</button>
      <button data-act="lyrics" title="${t.lrc ? 'Re-fetch lyrics' : 'Find lyrics'}">♪</button>
      <button data-act="more" title="More like this">🔁</button>
      <button data-act="remove" class="${pending ? 'danger' : ''}" title="Remove from library">${pending ? 'Remove?' : '✕'}</button>
    </div>
  </div>`;
}

function wireLibrary() {
  $('lib-search').addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });
  $('lib-crates').addEventListener('click', (e) => {
    const c = e.target.closest('[data-crate]');
    if (c) { state.crate = c.dataset.crate || null; state.pendingRemove = null; renderLibrary(); return; }
    if (e.target.closest('[data-synccrate]')) syncCrate(state.crate);
  });
  $('library').addEventListener('click', onCardAction);
}

async function onCardAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = e.target.closest('.card')?.dataset.id;
  const t = state.library.tracks.find((x) => trackKey(x) === id);
  if (!t) return;
  const act = btn.dataset.act;

  if (act === 'play') { openPlayer(t, { toast, fetchLyrics: () => fetchTrackLyrics(t), queue: libraryView() }); return; }
  if (act === 'reveal') {
    try { await runBash(`open -R ${sq(t.file)}`); } catch (err) { toast(String(err.message || err)); }
    return;
  }
  if (act === 'more') { sendToAgent(`More like ${t.artist} – ${t.title}: build a set in that vein.`); return; }
  if (act === 'lyrics') { await fetchTrackLyrics(t); return; }
  if (act === 'remove') {
    if (state.pendingRemove !== id) { state.pendingRemove = id; renderLibrary(); return; }
    state.pendingRemove = null;
    await removeTrack(t);
  }
}

async function fetchTrackLyrics(t) {
  if (!t.file) { toast('No audio file for this track.'); return; }
  toast(`Looking for lyrics — ${t.title}…`);
  try {
    const lrc = await attachLyrics(t, t.file);
    if (!lrc) { toast(`No lyrics found for “${t.title}”.`); return; }
    t.lrc = lrc;
    await saveLibrary(state.library);
    renderLibrary();
    toast(`Got lyrics for “${t.title}”.`);
    return lrc;
  } catch (e) {
    toast(String(e.message || e));
  }
  return null;
}

async function removeTrack(t) {
  try { if (t.file) await runBash(`rm -f ${sq(t.file)}`); } catch { /* file may already be gone */ }
  state.library.tracks = state.library.tracks.filter((x) => x !== t);
  await saveLibrary(state.library);
  renderLibrary();
  toast(`Removed “${t.title}”.`);
}

async function syncCrate(crate) {
  const target = (state.config.sync_targets || [])[0];
  if (!target) { toast('No phone set up — open ⚙ Settings and add your VLC address.'); return; }
  if (state.busy) return;
  state.busy = true;
  toast(`Open VLC (Sharing via WiFi on)… syncing “${crate}”.`);
  try {
    const r = await syncToPhone(
      target,
      (p) => { if (p.track && !p.finished) toast(`Syncing ${p.done + 1}/${p.total}: ${esc(p.track.title)}`); },
      { filter: (t) => (t.playlists || []).includes(crate) },
    );
    state.library = await loadLibrary();
    renderLibrary();
    toast(`Synced ${r.pushed}/${r.total} from “${crate}”.`);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
  }
}

// ── proposed set (DYNAMIC, from PageUpdate) ──────────────────────────────────
// The model isn't perfectly consistent with the schema: `body` arrives as
// either { tracklist } or [{ tracklist }] (and rarely the bare tracklist).
// Be liberal — pull the tracklist out of whatever shape shows up.
function extractTracklist(args) {
  if (!args) return null;
  const fromBody = (b) => {
    if (!b) return null;
    if (Array.isArray(b)) return b.map((x) => x?.tracklist).find(Boolean) || null;
    return b.tracklist || null;
  };
  return fromBody(args.body) || args.tracklist || fromBody(args);
}

function applyPageUpdate(args) {
  const tl = extractTracklist(args);
  if (!tl || !Array.isArray(tl.tracks)) return;
  state.set = {
    name: tl.name || 'New set',
    brief: tl.brief || '',
    tracks: tl.tracks.map((t) => ({
      artist: t.artist || '',
      title: t.title || '',
      year: t.year || '',
      note: t.note || '',
      selected: true,
      status: isOwned(state.library, t) ? 'owned' : 'pending',
    })),
  };
  renderSet();
}

function renderSet() {
  const el = $('set');
  if (!state.set) { el.classList.add('hidden'); return; }
  const s = state.set;
  const pending = s.tracks.filter((t) => t.status === 'pending');
  const gettable = pending.filter((t) => t.selected !== false).length;
  const allSel = s.tracks.every((t) => t.selected !== false);
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="set-head">
      <div>
        <h3 class="set-title">${esc(s.name)}</h3>
        ${s.brief ? `<div class="set-brief">${esc(s.brief)}</div>` : ''}
      </div>
      <div class="set-actions">
        <button class="btn ghost small" id="select-all">${allSel ? 'Select none' : 'Select all'}</button>
        <button class="btn small" id="get-all" ${gettable && !state.busy ? '' : 'disabled'}>
          ${gettable ? `Get ${gettable}` : pending.length ? 'None selected' : 'All owned'}
        </button>
      </div>
    </div>
    <div class="set-list">
      ${s.tracks.map((t, i) => trackRow(t, i)).join('')}
    </div>
    <div class="progress"><span id="set-progress"></span></div>`;

  $('get-all').onclick = getAll;
  $('select-all').onclick = () => { const v = !allSel; s.tracks.forEach((t) => { t.selected = v; }); renderSet(); };
  el.querySelectorAll('.set-chk').forEach((c) =>
    (c.onchange = () => { s.tracks[+c.dataset.i].selected = c.checked; renderSet(); }),
  );
  el.querySelectorAll('.set-play').forEach((b) =>
    (b.onclick = () => {
      const st = state.set.tracks[+b.dataset.play];
      const lib = state.library.tracks.find((x) => trackKey(x) === trackId(st));
      if (!lib) { toast('Still preparing this track…'); return; }
      // Queue = the set's already-downloaded tracks, in set order.
      const queue = state.set.tracks
        .filter((x) => x.status === 'done' || x.status === 'owned')
        .map((x) => state.library.tracks.find((l) => trackKey(l) === trackId(x)))
        .filter(Boolean);
      openPlayer(lib, { toast, fetchLyrics: () => fetchTrackLyrics(lib), queue });
    }),
  );
}

function trackRow(t, i) {
  const playable = t.status === 'done' || t.status === 'owned';
  const stateText = { pending: '', owned: '', downloading: 'getting…', error: t.error || 'not found' }[t.status] || '';
  const cls = t.status === 'done' ? 'done' : t.status === 'error' ? 'err' : t.status === 'owned' ? 'owned' : '';
  // A done/owned track is playable right now — no waiting for the rest of the set.
  const stateCell = playable
    ? `<button class="set-play" data-play="${i}" title="Play">▶</button>`
    : `<div class="state">${esc(stateText)}</div>`;
  return `<div class="trackrow ${cls}">
    <input type="checkbox" class="set-chk" data-i="${i}" ${t.selected !== false ? 'checked' : ''} title="Include this track" />
    <div class="idx">${i + 1}</div>
    <div class="meta">
      <div class="t">${esc(t.title)}</div>
      <div class="a">${esc(t.artist)}${t.year ? ` · ${esc(t.year)}` : ''}${t.note ? ` — <span class="note">${esc(t.note)}</span>` : ''}</div>
    </div>
    ${stateCell}
  </div>`;
}

// ── Get all (user action: download via yt-dlp) ───────────────────────────────
async function getAll() {
  if (state.busy || !state.set) return;
  state.busy = true;
  renderSet();

  const bins = await ensureBins();
  if (!bins.ok) {
    toast(bins.note || 'Couldn’t set up the downloader.');
    state.busy = false;
    renderSet();
    return;
  }

  const todo = state.set.tracks.filter((t) => t.status === 'pending' && t.selected !== false);
  const downloadedIds = [];
  let done = 0;
  for (const t of todo) {
    t.status = 'downloading';
    renderSet();
    const r = await downloadTrack(bins, state.config, t);
    if (r.ok) {
      t.status = 'done';
      addToLibrary(t, r.file);
      downloadedIds.push(trackId(t));
      // Persist + show it now — playable immediately, no waiting for the rest,
      // and progress survives if the page closes mid-batch.
      await saveLibrary(state.library);
      renderLibrary();
    } else {
      t.status = 'error';
      t.error = r.error;
    }
    done += 1;
    setProgress(done / todo.length);
    renderSet();
  }

  state.busy = false;
  await saveLibrary(state.library);
  renderLibrary();
  renderSet();
  const ok = todo.filter((t) => t.status === 'done').length;
  toast(`Added ${ok}/${todo.length} to your library.${ok ? ' Hit Sync to phone to copy them across.' : ''}`);

  // Lyrics fill in afterward in the background so downloads aren't blocked.
  backfillLyrics(downloadedIds);
}

// Fetch + attach lyrics for the given tracks, one at a time, in the background.
// Updates the badge as each resolves. Best-effort — no lyrics is fine.
async function backfillLyrics(ids) {
  for (const id of ids) {
    const t = state.library.tracks.find((x) => trackKey(x) === id);
    if (!t || t.lrc || !t.file) continue;
    try {
      const lrc = await attachLyrics(t, t.file);
      if (lrc) { t.lrc = lrc; await saveLibrary(state.library); renderLibrary(); }
    } catch { /* lyrics are optional */ }
  }
}

function addToLibrary(t, file, lrc) {
  const id = trackId(t);
  if (state.library.tracks.some((x) => x.id === id)) return;
  state.library.tracks.push({
    id,
    artist: t.artist,
    title: t.title,
    year: t.year || undefined,
    file,
    lrc: lrc || undefined,
    added_at: new Date().toISOString(),
    playlists: state.set ? [state.set.name] : [],
    synced_to: [],
  });
}

function setProgress(frac) {
  const bar = $('set-progress');
  if (bar) bar.style.width = `${Math.round(frac * 100)}%`;
}

// ── Sync to phone (user action: VLC push) ────────────────────────────────────
async function onSync() {
  if (state.busy) return;
  const target = (state.config.sync_targets || [])[0];
  if (!target) {
    toast('No phone set up yet — open ⚙ Settings and add your VLC address.');
    return;
  }
  const unsynced = state.library.tracks.filter((t) => t.file && !(t.synced_to || []).includes(target.id)).length;
  if (!unsynced) { toast('Everything’s already on your phone.'); return; }

  state.busy = true;
  toast(`Open VLC (Sharing via WiFi on)… syncing ${unsynced} to ${esc(target.name)}.`);
  try {
    const r = await syncToPhone(target, (p) => {
      if (p.track && !p.finished) toast(`Syncing ${p.done + 1}/${p.total}: ${esc(p.track.title)}`);
    });
    state.library = await loadLibrary();
    renderLibrary();
    toast(`Synced ${r.pushed}/${r.total} to ${esc(target.name)}. Play them in VLC → Audio, offline.`);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
  }
}

// ── chrome ───────────────────────────────────────────────────────────────────
function wireButtons() {
  $('sync-btn').onclick = onSync;
  $('settings-btn').onclick = openSettings;
}

// ── Build bar: the primary "describe a vibe → Build" entry point ─────────────
const BUILD_EXAMPLE = 'Make a list of 90s English songs';
const LUCKY_PROMPT =
  'Surprise me — build a set from what you know about me: my taste, where I’m ' +
  'from, the eras and artists I’ve loved. Check your memory first and make it ' +
  'personal, not a generic chart. If you truly know nothing about me yet, pick ' +
  'a great crowd-pleasing set and say it’s a starting point.';
const TRENDING_PROMPT =
  'Build a set from what’s popular and trending in music right now. Search the ' +
  'web for current charts and buzzy releases, then give me a fresh set of real, ' +
  'recent tracks — note anything brand-new.';

function sendToAgent(text) {
  if (!chat) { toast('Connecting to DJ…'); return; }
  chat.send(text);
}

function wireBuild() {
  const input = $('build-input');
  const build = () => {
    const text = input.value.trim() || BUILD_EXAMPLE; // empty → run the example
    sendToAgent(text);
    input.value = '';
    input.blur();
  };
  $('build-btn').onclick = build;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); build(); }
  });
  document.querySelectorAll('#build-chips .chip').forEach((c) => {
    c.onclick = () => { input.value = c.textContent; build(); };
  });
  $('lucky-btn').onclick = () => sendToAgent(LUCKY_PROMPT);
  $('trending-btn').onclick = () => sendToAgent(TRENDING_PROMPT);
}

// Drag the divider to resize the chat; width persists; double-click resets.
// Mirrors CFO's resizer.
function wireResizer() {
  const layout = document.querySelector('.layout');
  const rz = $('pane-resizer');
  if (!layout || !rz) return;
  const clampW = (w) => Math.min(Math.max(w, 300), Math.round(window.innerWidth * 0.6));
  const applyW = (w) => { layout.style.gridTemplateColumns = `1fr 6px ${w}px`; };
  let w = 380;
  try { w = clampW(+localStorage.getItem('dj:chat-width') || 380); } catch { /* ignore */ }
  applyW(w);
  rz.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rz.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev) => { w = clampW(window.innerWidth - ev.clientX - 3); applyW(w); };
    const up = () => {
      document.body.classList.remove('resizing');
      rz.removeEventListener('pointermove', move);
      rz.removeEventListener('pointerup', up);
      try { localStorage.setItem('dj:chat-width', String(Math.round(w))); } catch { /* ignore */ }
    };
    rz.addEventListener('pointermove', move);
    rz.addEventListener('pointerup', up);
  });
  rz.addEventListener('dblclick', () => { w = 380; applyW(w); try { localStorage.setItem('dj:chat-width', '380'); } catch { /* ignore */ } });
}

function openSettings() {
  let ov = document.querySelector('.app-mode-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'app-mode-overlay';
    ov.innerHTML = `
      <div class="app-mode-overlay-bar">
        <span class="app-mode-overlay-title">Settings</span>
        <button class="app-mode-overlay-close" aria-label="Close">×</button>
      </div>
      <iframe class="app-mode-overlay-frame" title="Settings"></iframe>`;
    ov.querySelector('.app-mode-overlay-close').onclick = () => {
      ov.classList.remove('visible');
      reloadConfig();
    };
    document.body.appendChild(ov);
  }
  ov.querySelector('.app-mode-overlay-frame').src = 'settings.html';
  ov.classList.add('visible');
}

async function reloadConfig() {
  state.config = await loadConfig();
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

// ── chat (agent) ─────────────────────────────────────────────────────────────
async function recentSessionId() {
  try {
    const sessions = await listSkillSessions(SKILL);
    if (!sessions.length) return null;
    sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const ageHours = (Date.now() / 1000 - (sessions[0].created_at || 0)) / 3600;
    return ageHours < 24 ? sessions[0].id : null;
  } catch { return null; }
}

const GREETING_TRIGGER =
  'The user just opened the DJ app (this message is hidden from them). Greet them now, following the "0. Greeting" section of your instructions.';

async function mountChat() {
  const resume = await recentSessionId();
  let activity = false;
  try {
    chat = await window.LinggenUI.mount($('chat-panel'), {
      skillName: SKILL,
      agentId: 'ling',
      modelId: MODEL_ID,
      title: 'DJ',
      sessionId: resume || undefined,
      onStreamToken: () => { activity = true; },
      onContentBlock: (payload) => {
        activity = true;
        if (payload?.tool === 'PageUpdate' && payload?.args) {
          try {
            const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
            applyPageUpdate(args);
          } catch (e) { console.warn('[dj] PageUpdate parse', e); }
        }
      },
    });
  } catch (e) {
    console.error('[dj] chat mount failed', e);
    return;
  }

  // Fresh session → one hidden greeting trigger (pulse/cfo pattern); resumed
  // sessions stay silent. Retry once if the embed showed no life.
  if (!resume) {
    setTimeout(() => chat?.sendHidden(GREETING_TRIGGER), 700);
    setTimeout(() => { if (!activity) chat?.sendHidden(GREETING_TRIGGER); }, 4500);
  }
}
