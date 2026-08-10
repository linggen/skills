// dj.js — the DJ page. Wires the agent's curation (PageUpdate → a proposed
// "set") to the user's local actions (Get → yt-dlp download, Sync → the paired
// Linggen Mobile pulls the library itself; VLC/WebDAV push is the fallback).
//
//   FIXED  — the library grid: the page owns it, the agent never touches it.
//   DYNAMIC — the #set panel: filled ONLY by the agent via PageUpdate.

import './chat-bridge.js'; // sets window.LinggenUI
import { runBash, sq, runAction as action } from './bash.js';
import { listSkillSessions } from './api.js';
import { loadConfig, loadLibrary, trackId, isOwned } from './library.js';
import { ensureBins, downloadTrack } from './download.js';
import { attachLyrics } from './lyrics.js';
import { openPlayer } from './player.js';
import { syncToPhone } from './sync.js';
import { phoneDevices, coverage } from './phone.js';
import { ensureThumbs, thumbUrl } from './thumbs.js';

const SKILL = 'dj';
const params = new URLSearchParams(location.search);
const MODEL_ID = params.get('model') || '';

// ── persisted UI prefs — one versioned blob, restored across restarts ────────
const UI_KEY = 'dj:ui';
const loadUi = () => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } };
const saveUi = (patch) => { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...loadUi(), ...patch, v: 1 })); } catch { /* ignore */ } };
const savedUi = loadUi();

const state = {
  config: { sync_targets: [] },
  library: { tracks: [], playlists: [], phone: { files: [], playlists: [] } },
  phone: [], // paired Linggen Mobile devices with their fetch ledgers
  // Which library you are looking at. 'mac' is everything this machine holds,
  // with the playlists you play here. 'phone' is what a phone carries —
  // references to those same songs, filed into playlists of its own. They are
  // two curations, not two copies, and nothing reconciles them.
  view: savedUi.view === 'phone' ? 'phone' : 'mac',
  set: null, // the currently proposed tracklist
  busy: false,
  // all | recent | playlist (+ name) — the sidebar selection; restored from
  // dj:ui and validated against the library at boot (playlist may be gone).
  collection: savedUi.collection?.kind ? savedUi.collection : { kind: 'all' },
  query: '', // library search text
  filter: { phone: null, lyrics: false }, // facet filters: phone = null|'on'|'off'
  // persisted; the bare dj:shuffle key is the pre-blob fallback
  shuffle: savedUi.shuffle ?? (() => { try { return localStorage.getItem('dj:shuffle') === '1'; } catch { return false; } })(),
  selected: new Set(), // selected track ids (multi-select)
  pendingRemove: null, // track id awaiting a second click to confirm removal
};

const setCollection = (c) => { state.collection = c; saveUi({ collection: c }); };

let chat = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Every library mutation runs through actions.mjs (bash.js runAction) — the
// same verbs the agent's SKILL.md tools call. The page renders; the script
// writes. Re-read what the writer wrote, then repaint.
async function refreshLibrary() {
  state.library = await loadLibrary();
  renderLibrary();
  // Covers too, not just rows. Boot extracted thumbnails for everything it
  // found, and the page's own Get flow does it per track — but a song the
  // AGENT downloaded arrived through neither, so it rendered with a 404'd
  // <img> and stayed blank until the next reload. ensureThumbs is cheap to
  // re-call (a `[ -f ] ||` guard skips ffmpeg for anything already cached),
  // so every refresh can simply cover whatever it just loaded. Which door
  // ordered a song does not decide whether it has a picture.
  ensureThumbs(state.library.tracks).then(renderLibrary).catch(() => {});
}

// ── long-task strip ──────────────────────────────────────────────────────────
// A background errand (an agent-driven download run) publishes progress on the
// retained `tasks` topic; the strip mirrors it while fresh and unfinished —
// the same numbers the phone's relay card shows — then refreshes the library
// once when the run completes, so the new songs appear without a reload.
let taskStripSeen = null;
async function pollTaskStrip() {
  const el = $('task-strip');
  if (!el) return;
  try {
    const r = await fetch('/api/topic/latest?topic=tasks&op=dj');
    if (!r.ok) { el.hidden = true; return; }
    const p = (await r.json()).payload || {};
    const fresh = p.at && Date.now() / 1000 - p.at < 600;
    if (!fresh || p.finished || !p.total) {
      if (fresh && p.finished && taskStripSeen === p.task_id) refreshLibrary();
      taskStripSeen = null;
      el.hidden = true;
      return;
    }
    taskStripSeen = p.task_id;
    el.textContent =
      `⇣ ${p.label || 'Working…'} · ${p.done}/${p.total}` +
      (p.current ? ` · ${p.current}` : '');
    el.hidden = false;
  } catch { el.hidden = true; }
}

// ── boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  // The strip first: it is one cheap topic read, and a mid-download refresh
  // must show the run immediately — reindex below can take many seconds.
  pollTaskStrip();
  setInterval(pollTaskStrip, 5000);
  [state.config, state.library, state.phone] = await Promise.all([loadConfig(), loadLibrary(), phoneDevices()]);
  await seedPhoneViewOnce();
  await reindex(true);
  // A restored playlist selection may point at a playlist that no longer exists.
  if (state.collection.kind === 'playlist' && !playlistsOf().includes(state.collection.name)) {
    setCollection({ kind: 'all' });
  }
  renderLibrary();
  restoreSet();
  wireButtons();
  wireResizer();
  wireBuild();
  wireLibrary();
  await mountChat();
  // Background, non-blocking: extract any missing cover thumbnails, then
  // re-render so they pop in once ready (first run can take a few seconds
  // for a big library; cached on every run after).
  ensureThumbs(state.library.tracks).then(renderLibrary).catch(() => {});
})();

/// Establish the phone view from what a phone is already carrying, once.
///
/// The two views arrived after people already had music on their phones, and
/// an empty phone view would have read as "your phone has nothing" and then
/// made it true on the next sync. The engine's fetch ledger is the only record
/// of what is actually over there, and only this page can read it — hence the
/// seed lives here rather than in the register's own load path.
///
/// The action itself is the guard: it writes a marker and refuses to run twice,
/// so a phone deliberately emptied later stays empty.
async function seedPhoneViewOnce() {
  const dev = state.phone[0];
  if (!dev || !(dev.files || []).length) return;
  try {
    const r = await action('phone-seed', JSON.stringify(dev.files));
    if (r.seeded) {
      state.library = await loadLibrary();
      toast(`Your phone's own library set up from the ${dev.files.length} songs it already has.`);
    }
  } catch { /* the next open tries again; nothing is lost by waiting */ }
}

// ── library: sidebar collections + dense list + multi-select → playlists ─────
const trackKey = (t) => t.id || trackId(t);

// Keep library.json in step with the library folder: adopt files that landed
// outside DJ's flow, retire rows whose file was Finder-deleted. Runs at boot
// (announced) and quietly whenever the page becomes visible again; adopted
// tracks missing lyrics feed the existing background backfill.
let reindexing = false;
async function reindex(announce) {
  if (reindexing) return;
  reindexing = true;
  try {
    const r = await action('reconcile');
    // `pruned` counts too: it rewrites the playlists on disk, and leaving it
    // out is how the page went on showing a list of 11 that the file it had
    // just written said was 9.
    if (r.adopted || r.retired || r.pruned) {
      await refreshLibrary();
      if (announce) {
        const bits = [];
        if (r.adopted) bits.push(`adopted ${r.adopted} song${r.adopted === 1 ? '' : 's'} from the folder`);
        if (r.retired) bits.push(`removed ${r.retired} missing`);
        if (r.pruned) bits.push(`unfiled ${r.pruned} name${r.pruned === 1 ? '' : 's'} pointing at nothing`);
        toast(`Library: ${bits.join(', ')}.`);
      }
      backfillLyrics(state.library.tracks.filter((t) => !t.lrc && t.file).map(trackKey));
    }
  } catch { /* next visibility pass retries */ } finally {
    reindexing = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reindex(false);
});

// "Is it on the phone" used to be guessed from two ledgers — this Mac's old
// VLC/WebDAV push record and the engine's fetch log. Both describe copying that
// has happened. The phone view answers the question the user is actually
// asking, which is what SHOULD be there, so the guess is gone.

// Playlists are tags into the one library: a song can sit in many. So "Remove"
// means different things by context — inside a playlist it untags (file kept);
// in All songs / Recently added it deletes the song from the library (→ Trash).
const inPlaylistView = () => state.collection.kind === 'playlist';

const onPhoneView = () => state.view === 'phone';

/// The playlists of the view you are looking at, straight off the projection.
/// Both sides come from the same register, so a name in one is not the list of
/// the same name in the other.
function playlists() {
  const lib = state.library;
  const rows = onPhoneView() ? lib.phone?.playlists : lib.playlists;
  return (rows || []).map((p) => p.name).sort((a, b) => a.localeCompare(b));
}

const playlistsOf = playlists;

/// The songs of the view you are looking at. On the phone side that is what it
/// carries and nothing else — which is why a playlist here is always whole.
function viewTracks() {
  const all = state.library.tracks || [];
  return onPhoneView() ? all.filter((t) => t.on_phone) : all;
}

/// The files of one playlist in the current view, in its own running order.
function playlistFiles(name) {
  const lib = state.library;
  const rows = onPhoneView() ? lib.phone?.playlists : lib.playlists;
  return (rows || []).find((p) => p.name === name)?.files || [];
}

// Tracks in the selected sidebar collection (before search).
function collectionTracks() {
  const all = viewTracks().slice();
  const c = state.collection;
  if (c.kind === 'playlist') {
    // The register keeps the running order; honour it rather than the
    // library's own sort, and drop names it no longer resolves.
    const byName = new Map(all.filter((t) => t.file).map((t) => [t.file.split('/').pop(), t]));
    return playlistFiles(c.name).map((f) => byName.get(f)).filter(Boolean);
  }
  if (c.kind === 'recent') {
    return all.slice().sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || ''))).slice(0, 60);
  }
  return all.slice().reverse(); // all songs, newest first
}

// What the list shows AND the play queue: collection + search.
function libraryView() {
  let tracks = collectionTracks();
  const q = state.query.trim().toLowerCase();
  if (q) tracks = tracks.filter((t) => `${t.artist} ${t.title}`.toLowerCase().includes(q));
  const f = state.filter;
  if (f.lyrics) tracks = tracks.filter((t) => t.lrc);
  return tracks;
}

/// The "On phone / Not on phone" chips lived here. They said the same thing the
/// view switch says now, in a second vocabulary and on the same screen — and
/// they described what had been COPIED, where the view describes what is meant
/// to be there. Only the lyrics facet is left, which is about the song.
function renderFilters() {
  const el = $('lib-filters');
  if (!el) return;
  const f = state.filter;
  el.innerHTML = `<button class="filt ${f.lyrics ? 'on' : ''}" data-filt="lyrics">♪ Has lyrics</button>`;
  el.querySelectorAll('.filt').forEach((b) =>
    (b.onclick = () => {
      f.lyrics = !f.lyrics;
      state.selected.clear();
      renderLibrary();
    }),
  );
}

function renderLibrary() {
  const all = state.library.tracks || [];
  renderSource();
  renderSidebar();
  renderFilters();
  renderSelbar();
  const grid = $('library');
  if (!all.length) {
    grid.innerHTML = `<div class="empty">Your downloaded tracks show up here. Build a set above to start.</div>`;
    return;
  }
  const tracks = libraryView();
  if (!tracks.length) { grid.innerHTML = `<div class="empty">Nothing here.</div>`; return; }
  grid.innerHTML = tracks.map(rowHtml).join('');
}

/// The one control that says which library you are in, and what it holds.
///
/// It replaced a chip that reported "46 songs · iPhone 15 Pro 12/46" and gave
/// you nothing to do about it. The two numbers meant different things — one a
/// library, one a transfer — and sat in the same breath.
function renderSource() {
  const el = $('lib-count');
  if (!el) return;
  const macN = (state.library.tracks || []).length;
  const phoneN = (state.library.phone?.files || []).length;
  const dev = state.phone[0];
  // On the phone side, say how far the transfer has got — that is a fact about
  // this device, not about the curation, so it belongs on the button and not
  // in the list.
  const carried = dev ? coverage(viewTracks(), dev).synced : null;
  const behind = onPhoneView() && carried !== null && carried < phoneN;
  const tab = (key, label, n, sub) =>
    `<button class="src ${state.view === key ? 'on' : ''}" data-src="${key}">` +
    `<span class="src-name">${esc(label)}</span>` +
    `<span class="src-n">${n} song${n === 1 ? '' : 's'}${sub ? ` · ${esc(sub)}` : ''}</span></button>`;
  el.innerHTML =
    tab('mac', 'This Mac', macN, '') +
    tab('phone', dev ? dev.name : 'Phone', phoneN,
      behind ? `${carried} here` : dev ? 'up to date' : 'not paired');
  el.querySelectorAll('.src').forEach((b) => (b.onclick = () => setView(b.dataset.src)));
}

/// Switching view changes what every control below means, so the selection and
/// the playlist you were in do not survive it — a name in one view is not the
/// list of the same name in the other.
function setView(v) {
  if (state.view === v) return;
  state.view = v;
  saveUi({ view: v });
  state.selected.clear();
  if (state.collection.kind === 'playlist') setCollection({ kind: 'all' });
  renderLibrary();
}

function renderSidebar() {
  const all = viewTracks();
  const c = state.collection;
  const countOf = (kind, name) =>
    kind === 'all' ? all.length
    : kind === 'recent' ? Math.min(60, all.length)
    : playlistFiles(name).length;
  const item = (kind, name, label) => {
    const on = c.kind === kind && (kind !== 'playlist' || c.name === name);
    const acts = kind === 'playlist'
      ? '<span class="side-acts"><button data-plact="rename" title="Rename / merge">✎</button><button data-plact="del" title="Delete playlist">✕</button></span>'
      : '';
    return `<div class="side-item ${on ? 'on' : ''}" data-kind="${kind}"${name ? ` data-name="${esc(name)}"` : ''}>` +
      `<span class="side-label">${esc(label)}</span><span class="side-count">${countOf(kind, name)}</span>${acts}</div>`;
  };
  const pls = playlistsOf();
  let html = item('all', '', 'All songs') + item('recent', '', 'Recently added');
  html += `<div class="side-head">Playlists</div>`;
  html += pls.length ? pls.map((p) => item('playlist', p, p)).join('') : `<div class="side-empty">none yet</div>`;
  const el = $('lib-sidebar');
  el.innerHTML = html;
  el.querySelectorAll('.side-item').forEach((d) =>
    (d.onclick = (e) => {
      if (e.target.closest('[data-plact]')) return; // an action button — handled below
      setCollection(d.dataset.kind === 'playlist' ? { kind: 'playlist', name: d.dataset.name } : { kind: d.dataset.kind });
      state.selected.clear();
      renderLibrary();
    }),
  );
  el.querySelectorAll('[data-plact]').forEach((b) =>
    (b.onclick = (e) => {
      e.stopPropagation();
      const node = b.closest('.side-item');
      const name = node.dataset.name;
      if (b.dataset.plact === 'del') deletePlaylist(name);
      else startRenamePlaylist(node, name);
    }),
  );
}

function startRenamePlaylist(node, name) {
  node.innerHTML = `<input class="side-rename" value="${esc(name)}" />`;
  const inp = node.querySelector('.side-rename');
  inp.focus(); inp.select();
  let done = false;
  const commit = () => { if (done) return; done = true; renamePlaylist(name, inp.value.trim()); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { done = true; renderLibrary(); } };
  inp.onblur = commit;
}

// Rename a playlist; renaming to an existing name MERGES them.
async function renamePlaylist(oldName, newName) {
  if (!newName || newName === oldName) { renderLibrary(); return; }
  try {
    await action('playlist-rename', oldName, newName, state.view);
    if (state.collection.kind === 'playlist' && state.collection.name === oldName) setCollection({ kind: 'playlist', name: newName });
    await refreshLibrary();
    toast(`Renamed to “${newName}”.`);
  } catch (e) { toast(String(e.message || e)); renderLibrary(); }
}

// Remove a playlist (songs stay in the library).
async function deletePlaylist(name) {
  try {
    await action('playlist-delete', name, state.view);
    if (state.collection.kind === 'playlist' && state.collection.name === name) setCollection({ kind: 'all' });
    await refreshLibrary();
    toast(`Removed playlist “${name}” (songs kept).`);
  } catch (e) { toast(String(e.message || e)); }
}

function rowHtml(t) {
  const id = trackKey(t);
  const sel = state.selected.has(id);
  const pending = state.pendingRemove === id;
  // In the phone's own view every row is on the phone, so the badge would be
  // saying nothing. On the Mac side it marks what the phone carries — the
  // reference, which is the decision, not the fetch ledger, which is only how
  // far the copying has got.
  const badges =
    (!onPhoneView() && t.on_phone ? '<span class="badge" title="On your phone">📱</span>' : '') +
    (t.lrc ? '<span class="badge lyr" title="Has lyrics">♪</span>' : '');
  return `<div class="lib-row${sel ? ' sel' : ''}" data-id="${esc(id)}">
    <input type="checkbox" class="lib-chk" data-id="${esc(id)}"${sel ? ' checked' : ''} />
    <span class="card-cover">
      <img class="row-thumb" src="${thumbUrl(t)}" loading="lazy" alt="" onerror="this.classList.add('noart')" />
      <button class="row-play" data-act="play" title="Play">▶</button>
    </span>
    <div class="row-meta">
      <span class="row-t">${esc(t.title)}</span>
      <span class="row-a">${esc(t.artist)}${t.year ? ` · ${esc(t.year)}` : ''} <span class="row-badges">${badges}</span></span>
    </div>
    <div class="row-acts">
      <button data-act="karaoke" title="Karaoke">🎤</button>
      <button data-act="reveal" title="Show in Finder">⤓</button>
      <button data-act="remove" class="${pending ? 'danger' : ''}" title="${inPlaylistView() ? 'Remove from this playlist' : 'Delete from library (to Trash)'}">${pending ? 'Remove?' : '✕'}</button>
    </div>
  </div>`;
}

// The selection toolbar — actions on the checked songs (select before sync, etc.)
function renderSelbar() {
  const bar = $('lib-selbar');
  const view = libraryView();
  if (!view.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  const n = state.selected.size;
  const allSel = view.every((t) => state.selected.has(trackKey(t)));
  bar.hidden = false;
  // The verbs belong to the view you are standing in. "Delete from library"
  // destroys files and is reachable only from the Mac side; from the phone
  // side the strongest thing on offer takes a song off the phone. That is a
  // better guard than a confirm dialog, because the scope is where you are.
  const removeLabel = inPlaylistView()
    ? 'Remove from playlist'
    : onPhoneView() ? 'Remove from phone' : 'Delete from library';
  bar.innerHTML = `
    <label class="sel-all"><input type="checkbox" id="sel-all-chk" ${allSel ? 'checked' : ''} /> Select all</label>
    ${n
      ? `<span class="sel-n">${n} selected</span>
         <button class="btn ghost small" data-sel="add">Add to playlist…</button>
         ${onPhoneView() ? '' : '<button class="btn ghost small" data-sel="tophone">Add to phone</button>'}
         <button class="btn ghost small${onPhoneView() || inPlaylistView() ? '' : ' danger'}" data-sel="remove">${removeLabel}</button>`
      : ''}
    <span class="sel-menu" id="sel-menu"></span>`;
  $('sel-all-chk').onchange = (e) => {
    if (e.target.checked) view.forEach((t) => state.selected.add(trackKey(t)));
    else state.selected.clear();
    renderLibrary();
  };
  if (n) {
    bar.querySelector('[data-sel="remove"]').onclick = () => removeSelected();
    bar.querySelector('[data-sel="add"]').onclick = () => showAddMenu();
    const toPhone = bar.querySelector('[data-sel="tophone"]');
    if (toPhone) toPhone.onclick = () => addToPhone();
  }
}

/// Selected songs join what the phone carries. A reference — the files stay
/// exactly where they are, and the phone fetches them on its next sync.
async function addToPhone() {
  const files = selectedFiles();
  if (!files.length) return;
  try {
    const r = await action('phone-add', JSON.stringify(files));
    state.selected.clear();
    await refreshLibrary();
    toast(`${r.added} song${r.added === 1 ? '' : 's'} added to your phone — it fetches them on the next sync.`);
  } catch (e) { toast(String(e.message || e)); }
}

const selectedFiles = () =>
  (state.library.tracks || [])
    .filter((t) => state.selected.has(trackKey(t)) && t.file)
    .map((t) => t.file);

function showAddMenu() {
  const menu = $('sel-menu');
  const pls = playlistsOf();
  menu.innerHTML =
    pls.map((p) => `<button class="pl-opt" data-pl="${esc(p)}">${esc(p)}</button>`).join('') +
    `<button class="pl-opt new" data-new="1">＋ New playlist…</button>`;
  menu.querySelectorAll('[data-pl]').forEach((b) => (b.onclick = () => addToPlaylist(b.dataset.pl)));
  menu.querySelector('[data-new]').onclick = () => {
    menu.innerHTML = `<input class="pl-name" placeholder="Playlist name" /><button class="btn small" id="pl-save">Save</button>`;
    const inp = menu.querySelector('.pl-name');
    inp.focus();
    const save = () => { const name = inp.value.trim(); if (name) addToPlaylist(name); };
    menu.querySelector('#pl-save').onclick = save;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  };
}

async function addToPlaylist(name) {
  const files = state.library.tracks
    .filter((t) => state.selected.has(trackKey(t)) && t.file)
    .map((t) => t.file);
  try {
    const r = await action('playlist-add', name, JSON.stringify(files), state.view);
    state.selected.clear();
    setCollection({ kind: 'playlist', name });
    await refreshLibrary();
    toast(`Added ${r.added} to “${name}”.`);
  } catch (e) { toast(String(e.message || e)); }
}

// Shared onProgress for all three sync entry points. Track-level events carry
// `track`; the playlist-push step (sync.js) reports failures WITHOUT one — a
// handler that only checked `p.track` silently dropped those, so a failed
// .m3u upload never reached the user. Surface both.
function syncProgress(p) {
  if (p.finished) return;
  if (p.error) { toast(p.track ? `${esc(p.track.title)} failed: ${esc(p.error)}` : `Playlist sync failed: ${esc(p.error)}`); return; }
  if (p.track) toast(`Syncing ${p.done + 1}/${p.total}: ${esc(p.track.title)}`);
}

async function syncSelected() {
  // A paired Linggen Mobile pulls the library itself — nothing to push from
  // here. Tell the user where the sync actually happens.
  if (state.phone.length) {
    const c = coverage(state.library.tracks || [], state.phone[0]);
    toast(c.waiting
      ? `${c.waiting} track${c.waiting === 1 ? '' : 's'} waiting — open DJ on ${esc(state.phone[0].name)} and it syncs itself.`
      : `${esc(state.phone[0].name)} is up to date.`);
    return;
  }
  const target = (state.config.sync_targets || [])[0];
  if (!target) { toast('No phone set up — open ⚙ Settings.'); return; }
  if (state.busy) return;
  const ids = new Set(state.selected);
  state.busy = true;
  toast(`Open VLC (Sharing on)… syncing ${ids.size}.`);
  try {
    const r = await syncToPhone(
      target,
      syncProgress,
      { filter: (t) => ids.has(trackKey(t)) },
    );
    state.library = await loadLibrary();
    state.selected.clear();
    renderLibrary();
    toast(`Synced ${r.pushed}/${r.total} to ${esc(target.name)}.${r.playlists ? ` ${r.playlists} playlist${r.playlists === 1 ? '' : 's'} too.` : ''}`);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
  }
}

/// What "remove" means is decided by where you are standing, in one place.
///
/// Inside a playlist it unfiles. On the phone side it takes songs off the
/// phone and the Mac keeps every file. Only in the Mac's own library views does
/// it destroy anything — the single act in the product that does.
async function removeSelected() {
  if (inPlaylistView()) { await untagSelected(state.collection.name); return; }
  const files = selectedFiles();
  if (!files.length) return;
  try {
    if (onPhoneView()) {
      const r = await action('phone-remove', JSON.stringify(files));
      state.selected.clear();
      await refreshLibrary();
      toast(`${r.removed} song${r.removed === 1 ? '' : 's'} taken off your phone — still here on the Mac.`);
      return;
    }
    const r = await action('tracks-delete', JSON.stringify(files));
    state.selected.clear();
    await refreshLibrary();
    toast(`Deleted ${r.deleted} song${r.deleted === 1 ? '' : 's'} — files, playlists and phone.`);
  } catch (e) { toast(String(e.message || e)); }
}

// Untag the selected songs from the current playlist (files & library untouched).
async function untagSelected(name) {
  const ids = new Set(state.selected);
  const inList = new Set(playlistFiles(name));
  const files = state.library.tracks
    .filter((t) => ids.has(trackKey(t)) && t.file && inList.has(t.file.split('/').pop()))
    .map((t) => t.file);
  if (!files.length) { state.selected.clear(); renderLibrary(); return; }
  try {
    const r = await action('playlist-remove', name, JSON.stringify(files), state.view);
    state.selected.clear();
    await refreshLibrary();
    toast(`Removed ${r.removed} song${r.removed === 1 ? '' : 's'} from “${name}”.`);
  } catch (e) { toast(String(e.message || e)); }
}

function updateModeBtn() {
  const b = $('mode-btn');
  if (b) b.textContent = state.shuffle ? '🔀 Shuffle' : '→ In order';
}

// Karaoke: hand the current view to the full-screen stage page. The queue
// travels via localStorage (handles the filtered/searched view + start track);
// both pages read library.json for the rest. The agent never touches this.
function startKaraoke(start, queue) {
  const view = (queue || libraryView()).filter((t) => t.file);
  if (!view.length) { toast('Nothing to sing here.'); return; }
  const ids = view.map(trackKey);
  const startId = trackKey(start || view[0]);
  try { localStorage.setItem('dj:karaoke', JSON.stringify({ ids, start: startId })); } catch { /* ignore */ }
  location.href = `karaoke.html${location.search}`;
}

// Play the whole current view (sidebar collection + search), honoring the mode.
function playAll() {
  const view = libraryView();
  if (!view.length) { toast('Nothing to play here.'); return; }
  const start = state.shuffle ? view[Math.floor(Math.random() * view.length)] : view[0];
  openPlayer(start, { toast, fetchLyrics: (cur) => fetchTrackLyrics(cur || start), queue: view, shuffle: state.shuffle });
}

function wireLibrary() {
  $('lib-search').addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });
  $('play-all').onclick = playAll;
  $('mode-btn').onclick = () => {
    state.shuffle = !state.shuffle;
    saveUi({ shuffle: state.shuffle });
    updateModeBtn();
  };
  updateModeBtn();
  $('library').addEventListener('click', onRowAction);
  $('library').addEventListener('change', (e) => {
    const chk = e.target.closest('.lib-chk');
    if (!chk) return;
    if (chk.checked) state.selected.add(chk.dataset.id);
    else state.selected.delete(chk.dataset.id);
    renderLibrary();
  });
}

async function onRowAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = e.target.closest('.lib-row')?.dataset.id;
  const t = state.library.tracks.find((x) => trackKey(x) === id);
  if (!t) return;
  const act = btn.dataset.act;

  if (act === 'play') { openPlayer(t, { toast, fetchLyrics: (cur) => fetchTrackLyrics(cur || t), queue: libraryView() }); return; }
  if (act === 'karaoke') { startKaraoke(t, libraryView()); return; }
  if (act === 'reveal') {
    try { await runBash(`open -R ${sq(t.file)}`); } catch (err) { toast(String(err.message || err)); }
    return;
  }
  if (act === 'remove') {
    // Inside a playlist → just untag (file & other playlists untouched), no
    // confirm needed since nothing is destroyed. In All songs / Recently added,
    // ✕ deletes from the library — keep the two-click confirm, then Trash.
    if (inPlaylistView()) { await removeFromPlaylist(t, state.collection.name); return; }
    if (state.pendingRemove !== id) { state.pendingRemove = id; renderLibrary(); return; }
    state.pendingRemove = null;
    await removeTrack(t);
  }
}

// Untag one song from the current playlist. The song stays in the library (and
// in any other playlists); nothing on disk changes.
async function removeFromPlaylist(t, name) {
  try {
    await action('playlist-remove', name, JSON.stringify([t.file]), state.view);
    await refreshLibrary();
    toast(`Removed “${t.title}” from “${name}”.`);
  } catch (e) { toast(String(e.message || e)); }
}

async function fetchTrackLyrics(t) {
  if (!t.file) { toast('No audio file for this track.'); return; }
  toast(`Looking for lyrics — ${t.title}…`);
  try {
    const lrc = await attachLyrics(t, t.file);
    if (!lrc) { toast(`No lyrics found for “${t.title}”.`); return; }
    await action('track-set-lrc', t.file, lrc);
    t.lrc = lrc;
    renderLibrary();
    toast(`Got lyrics for “${t.title}”.`);
    return lrc;
  } catch (e) {
    toast(String(e.message || e));
  }
  return null;
}

// Delete a song from the library: the file, its sidecars, and its place in every
// playlist. Only reachable from the All songs / Recently added views — playlist
// views untag instead. A plain delete, not the Trash: DJ music is reproducible,
// so this is a re-download rather than a loss.
async function removeTrack(t) {
  if (!t.file) return;
  try {
    await action('tracks-delete', JSON.stringify([t.file]));
    await refreshLibrary();
    toast(`Deleted “${t.title}”.`);
  } catch (e) { toast(String(e.message || e)); }
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
      syncProgress,
      { filter: (t) => (t.playlists || []).includes(crate), playlist: crate },
    );
    state.library = await loadLibrary();
    renderLibrary();
    toast(`Synced ${r.pushed}/${r.total} from “${crate}”.${r.playlists ? ' Playlist sent too.' : ''}`);
  } catch (e) {
    toast(String(e.message || e));
  } finally {
    state.busy = false;
  }
}

// ── PageUpdate from the agent (DYNAMIC) ──────────────────────────────────────
// The model isn't perfectly consistent: `body` arrives as { key } or [{ key }]
// (and rarely the bare key). Be liberal — pull the payload out of any shape.
function extractKey(args, key) {
  if (!args) return null;
  const fromBody = (b) => {
    if (!b) return null;
    if (Array.isArray(b)) return b.map((x) => x?.[key]).find(Boolean) || null;
    return b[key] || null;
  };
  return fromBody(args.body) || args[key] || fromBody(args);
}

const keyOf = (t) => `${(t.artist || '').toLowerCase().trim()}|${(t.title || '').toLowerCase().trim()}`;

// Agent organizes the library into a playlist: { name, tracks:[{artist,title}] }.
// Legacy surface — the agent's real write path is its AddToPlaylist tool now;
// this PageUpdate shape still lands in the same writer when an older session
// uses it.
async function applyAgentPlaylist(pl) {
  if (!pl.name || !Array.isArray(pl.tracks)) return;
  const want = new Set(pl.tracks.map(keyOf));
  const files = state.library.tracks
    .filter((t) => want.has(trackKey(t)) && t.file)
    .map((t) => t.file);
  if (!files.length) { toast('None of those are in the library yet.'); return; }
  try {
    const r = await action('playlist-add', pl.name, JSON.stringify(files));
    setCollection({ kind: 'playlist', name: pl.name });
    await refreshLibrary();
    toast(`DJ made “${pl.name}” — ${r.added} song${r.added === 1 ? '' : 's'}.`);
  } catch (e) { toast(String(e.message || e)); }
}

// Agent plays owned tracks: { tracks:[{artist,title}] }. Only plays what's
// downloaded; the agent proposes a set (tracklist) for anything missing.
function applyAgentPlay(pp) {
  const want = (pp.tracks || []).map(keyOf);
  const queue = want.map((k) => state.library.tracks.find((t) => trackKey(t) === k)).filter((t) => t && t.file);
  if (!queue.length) { toast('None of those are downloaded yet.'); return; }
  openPlayer(queue[0], { toast, fetchLyrics: (cur) => fetchTrackLyrics(cur || queue[0]), queue });
}

function applyPageUpdate(args) {
  const pl = extractKey(args, 'playlist');
  if (pl) { applyAgentPlaylist(pl); return; }
  const pp = extractKey(args, 'play');
  if (pp) { applyAgentPlay(pp); return; }
  const tl = extractKey(args, 'tracklist');
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

// ── Set persistence ─────────────────────────────────────────────────────────
// PageUpdate is a live stream event: only a page open at stream time sees the
// set. A set proposed from the PHONE (Yinyue → ask_mac_app → this session) has
// no Mac page watching, and a reload loses even a set that did render. So the
// last proposal is kept, and a fresh page restores it with ownership re-read
// from today's library.
const SET_STORE = 'dj.lastSet';

function saveSet() {
  try {
    localStorage.setItem(SET_STORE, JSON.stringify({ at: Date.now(), set: state.set }));
  } catch { /* private mode — the set just stays live-only */ }
}

function restoreSet() {
  if (state.set) return;
  try {
    const raw = JSON.parse(localStorage.getItem(SET_STORE) || 'null');
    // Same 24h horizon the session resume uses — an older proposal is stale.
    if (!raw?.set?.tracks || Date.now() - raw.at > 24 * 3600 * 1000) return;
    state.set = raw.set;
    for (const t of state.set.tracks) {
      // Re-derive what the library can answer: a song downloaded since the
      // save must not still read pending, and "downloading" died with the run.
      if (t.status === 'downloading' || t.status === 'pending') {
        t.status = isOwned(state.library, t) ? 'owned' : 'pending';
      }
    }
    renderSet();
  } catch { /* unreadable save — start clean */ }
}

function renderSet() {
  saveSet();
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
      openPlayer(lib, { toast, fetchLyrics: (cur) => fetchTrackLyrics(cur || lib), queue });
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
  // Owned tracks are in the library, so their cover exists — show it; a
  // not-yet-downloaded track keeps its number until it lands.
  const lib = playable
    ? (state.library.tracks || []).find((x) => trackKey(x) === trackId(t))
    : null;
  const face = lib
    ? `<span class="card-cover"><img class="row-thumb" src="${thumbUrl(lib)}" loading="lazy" alt="" onerror="this.classList.add('noart')" /></span>`
    : `<div class="idx">${i + 1}</div>`;
  return `<div class="trackrow ${cls}">
    <input type="checkbox" class="set-chk" data-i="${i}" ${t.selected !== false ? 'checked' : ''} title="Include this track" />
    ${face}
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
      // Register + show it now — playable immediately, no waiting for the
      // rest, and progress survives if the page closes mid-batch. The writer
      // clears any old tombstone and files it under the set's playlist.
      try {
        await action('track-add', JSON.stringify({
          artist: t.artist, title: t.title, year: t.year || undefined,
          file: r.file,
          playlist: state.set ? cleanPlaylistName(state.set.name) : undefined,
        }));
      } catch (e) { toast(String(e.message || e)); }
      downloadedIds.push(trackId(t));
      await refreshLibrary();
      // Thumbnail per-track, not batched at the end of the whole set — a
      // track that's already playable shouldn't sit cover-less for the
      // minutes the rest of a big batch takes to finish downloading.
      const added = state.library.tracks.find((x) => trackKey(x) === trackId(t));
      if (added) ensureThumbs([added]).then(renderLibrary).catch(() => {});
    } else {
      t.status = 'error';
      t.error = r.error;
    }
    done += 1;
    setProgress(done / todo.length);
    renderSet();
  }

  state.busy = false;
  await refreshLibrary();
  renderSet();
  const ok = todo.filter((t) => t.status === 'done').length;
  toast(`Added ${ok}/${todo.length} to your library.${ok ? ' Hit Sync to phone to copy them across.' : ''}`);

  // Lyrics fill in afterward in the background so downloads aren't blocked
  // (thumbnails already fired per-track above, as each download landed).
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
      if (lrc) { await action('track-set-lrc', t.file, lrc); t.lrc = lrc; renderLibrary(); }
    } catch { /* lyrics are optional */ }
  }
}

// Drop a trailing count suffix so "Disney Essentials — 10 Songs" and
// "Disney Essentials" don't become two playlists.
const cleanPlaylistName = (s) => {
  const t = String(s || '').trim();
  return t.replace(/\s*[—\-–]\s*\d+\s*(songs?|tracks?|首)\s*$/i, '').trim() || t;
};

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
    const r = await syncToPhone(target, syncProgress);
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
  // Inside the unified Linggen launcher, settings live in the launcher's shared
  // settings — hide DJ's own gear so there aren't two. Standalone DJ keeps it.
  if (params.get('in_launcher') === '1') {
    const sb = $('settings-btn'); if (sb) sb.style.display = 'none';
  } else {
    $('settings-btn').onclick = openSettings;
  }
  $('party-btn').onclick = () => startKaraoke(null, libraryView());
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
  let w = 480;
  try { w = clampW(+localStorage.getItem('dj:chat-width') || 480); } catch { /* ignore */ }
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
  rz.addEventListener('dblclick', () => { w = 480; applyW(w); try { localStorage.setItem('dj:chat-width', '480'); } catch { /* ignore */ } });
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

// The agent tools that mutate the library (they run the same actions.mjs this
// page calls). One trailing refresh per burst.
const AGENT_WRITERS = new Set([
  'CreatePlaylist', 'RenamePlaylist', 'DeletePlaylist', 'AddToPlaylist',
  'RemoveFromPlaylist', 'ReorderPlaylist', 'DeleteTracks', 'GetTracks',
]);
let agentRefreshTimer = null;
function scheduleAgentRefresh() {
  clearTimeout(agentRefreshTimer);
  agentRefreshTimer = setTimeout(() => { refreshLibrary().catch(() => {}); }, 1200);
}

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
        // The agent's own tools write through actions.mjs beside this page —
        // repaint from disk shortly after one runs so the grid never lags a
        // mutation the user just watched happen in chat.
        if (AGENT_WRITERS.has(payload?.tool)) scheduleAgentRefresh();
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
