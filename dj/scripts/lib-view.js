// lib-view.js — the library the page owns (the agent never paints it): the
// Mac/phone switch, the sidebar of collections, the card grid, the selection
// bar and each card's menu. Every mutation runs through actions.mjs; this
// re-reads what the writer wrote and repaints.

import { runBash, sq, runAction as action } from './bash.js';
import { loadLibrary, trackKey } from './library.js';
import { redownload } from './download.js';
import { fetchTrackLyrics } from './lyrics-backfill.js';
import { openPlayer } from './player.js';
import { phoneDevices, coverage } from './phone.js';
import { closeRowMenu, showRowMenu } from './row-menu.js';
import { state, savedUi, saveUi, setCollection, toast } from './state.js';
import { ensureThumbs, thumbUrl } from './thumbs.js';
import { $, esc, confirmDialog, debounce, plural } from './ui.js';

export async function refreshLibrary() {
  state.library = await loadLibrary();
  renderLibrary();
  // Covers for whatever just arrived, whichever door it came through; only
  // songs not asked about yet cost anything.
  ensureThumbs(state.library.tracks).then((asked) => asked && renderLibrary()).catch(() => {});
}

// ── what the view holds ──────────────────────────────────────────────────────

const onPhoneView = () => state.view === 'phone';
const inPlaylistView = () => state.collection.kind === 'playlist';
const baseOf = (f) => String(f || '').split('/').pop();

const viewLists = () => (onPhoneView() ? state.library.phone?.playlists : state.library.playlists) || [];

/// The playlists of the view you are looking at — separate namespaces, so a
/// name in one is not the list of the same name in the other.
export const playlists = () => viewLists().map((p) => p.name).sort((a, b) => a.localeCompare(b));

const playlistFiles = (name) => viewLists().find((p) => p.name === name)?.files || [];

/// On the phone side, what it carries and nothing else — which is why a
/// playlist there is always whole.
const viewTracks = () => {
  const all = state.library.tracks || [];
  return onPhoneView() ? all.filter((t) => t.on_phone) : all;
};

const COLLECTIONS = {
  // A playlist is stored as its running order; honour it.
  playlist: (all) => {
    const byName = new Map(all.filter((t) => t.file).map((t) => [baseOf(t.file), t]));
    return playlistFiles(state.collection.name).map((f) => byName.get(f)).filter(Boolean);
  },
  recent: (all) => all.slice().sort((a, b) => String(b.added_at || '').localeCompare(String(a.added_at || ''))).slice(0, 60),
  all: (all) => all.slice().reverse(), // newest first
};

/// What the list shows AND the play queue: collection, then search and facet.
export function libraryView() {
  let tracks = (COLLECTIONS[state.collection.kind] || COLLECTIONS.all)(viewTracks());
  const q = state.query.trim().toLowerCase();
  if (q) tracks = tracks.filter((t) => `${t.artist} ${t.title}`.toLowerCase().includes(q));
  if (state.filter.lyrics) tracks = tracks.filter((t) => t.lrc);
  return tracks;
}

// ── painting ─────────────────────────────────────────────────────────────────

export function renderLibrary() {
  renderSource();
  const sync = $('sync-btn');
  if (sync) {
    sync.hidden = !onPhoneView() || !currentDevice();
    sync.onclick = () => syncPhone(sync);
  }
  renderSidebar();
  renderFilters();
  renderSelbar();
  const grid = $('library');
  closeRowMenu(); // a repaint invalidates whatever the open menu pointed at
  if (!(state.library.tracks || []).length) {
    renderLegend([]);
    grid.innerHTML = `<div class="empty">Your downloaded songs show up here. Build a set above to start.</div>`;
    return;
  }
  const tracks = libraryView();
  renderLegend(tracks);
  grid.innerHTML = tracks.length ? tracks.map(rowHtml).join('') : `<div class="empty">Nothing here.</div>`;
}

function renderFilters() {
  const el = $('lib-filters');
  if (!el) return;
  el.innerHTML = `<button class="filt ${state.filter.lyrics ? 'on' : ''}" data-filt="lyrics">♪ Has lyrics</button>`;
  el.querySelector('.filt').onclick = () => {
    state.filter.lyrics = !state.filter.lyrics;
    state.selected.clear();
    renderLibrary();
  };
}

/// Which phone the phone view is about: the user's choice, remembered, else
/// the one that last fetched.
function currentDevice() {
  const list = state.phone;
  return list.find((d) => d.id === savedUi.deviceId) || list[0] || null;
}

/// The one control that says which library you are in, and what it holds.
function renderSource() {
  const el = $('lib-count');
  if (!el) return;
  const macN = (state.library.tracks || []).length;
  const phoneN = (state.library.phone?.files || []).length;
  const dev = currentDevice();
  // How far the transfer has got is a fact about this device, so it rides on
  // the button, not in the list.
  const carried = dev ? coverage(viewTracks(), dev).synced : null;
  const behind = carried !== null && carried < phoneN;
  const tab = (key, label, n, sub) =>
    `<button class="src ${state.view === key ? 'on' : ''}" data-src="${key}">` +
    `<span class="src-name">${esc(label)}</span>` +
    `<span class="src-n">${plural(n, 'song')}${sub ? ` · ${esc(sub)}` : ''}</span></button>`;
  const others = state.phone.filter((d) => d.id !== dev?.id);
  el.innerHTML =
    tab('mac', 'This Mac', macN, '') +
    tab('phone', dev ? dev.name : 'Phone', phoneN, behind ? `${carried} here` : dev ? 'up to date' : 'not paired') +
    (others.length ? `<button class="src-pick" id="src-pick" title="Another paired phone">▾</button>` : '');
  el.querySelectorAll('.src').forEach((b) => (b.onclick = () => setView(b.dataset.src)));
  const pick = $('src-pick');
  if (pick) pick.onclick = () => showDeviceMenu(others);
}

function showDeviceMenu(others) {
  const menu = $('src-menu');
  if (!menu) return;
  if (!menu.hidden) { menu.hidden = true; return; }
  const away = (e) => {
    if (e.target.closest('#src-menu') || e.target.closest('#src-pick')) return;
    menu.hidden = true;
    document.removeEventListener('click', away, true);
  };
  setTimeout(() => document.addEventListener('click', away, true), 0);
  menu.innerHTML = others
    .map((d) => `<button class="pl-opt" data-dev="${esc(d.id)}">${esc(d.name)}` +
      `<span class="dev-sub">${d.last_fetch ? `${(d.files || []).length} synced` : 'never synced'}</span></button>`)
    .join('');
  menu.hidden = false;
  menu.querySelectorAll('[data-dev]').forEach((b) => (b.onclick = () => {
    saveUi({ deviceId: b.dataset.dev, view: 'phone' });
    menu.hidden = true;
    state.view = 'phone';
    renderLibrary();
  }));
}

/// Ring the phone. It does the fetching, so this says what was sent — never
/// what is on the phone (2026-09-10: reading counts back a moment later made a
/// working button look broken).
async function syncPhone(btn) {
  const dev = currentDevice();
  if (!dev) return;
  btn.disabled = true;
  try {
    const res = await fetch('/api/topic/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'dj', op: 'library-changed', payload: {}, retain: false }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    toast(`Sync sent to ${dev.name}.`);
  } catch (e) {
    toast(`Couldn't reach your phone: ${String(e.message || e)}`);
  } finally {
    btn.disabled = false;
  }
}

/// Switching view changes what every control means, so the selection and the
/// playlist you were in do not survive it.
function setView(v) {
  if (state.view === v) return;
  state.view = v;
  saveUi({ view: v });
  state.selected.clear();
  if (inPlaylistView()) setCollection({ kind: 'all' });
  renderLibrary();
}

function renderSidebar() {
  const all = viewTracks();
  const c = state.collection;
  const countOf = { all: () => all.length, recent: () => Math.min(60, all.length), playlist: (name) => playlistFiles(name).length };
  const item = (kind, name, label) => {
    const on = c.kind === kind && (kind !== 'playlist' || c.name === name);
    const acts = kind === 'playlist'
      ? '<span class="side-acts"><button data-plact="rename" title="Rename / merge">✎</button><button data-plact="del" title="Delete playlist">✕</button></span>'
      : '';
    return `<div class="side-item ${on ? 'on' : ''}" data-kind="${kind}"${name ? ` data-name="${esc(name)}"` : ''}>` +
      `<span class="side-label">${esc(label)}</span><span class="side-count">${countOf[kind](name)}</span>${acts}</div>`;
  };
  const pls = playlists();
  const el = $('lib-sidebar');
  el.innerHTML = item('all', '', 'All songs') + item('recent', '', 'Recently added') +
    `<div class="side-head">Playlists</div>` +
    (pls.length ? pls.map((p) => item('playlist', p, p)).join('') : `<div class="side-empty">none yet</div>`);
  el.querySelectorAll('.side-item').forEach((d) => (d.onclick = (e) => {
    if (e.target.closest('[data-plact]')) return;
    setCollection(d.dataset.kind === 'playlist' ? { kind: 'playlist', name: d.dataset.name } : { kind: d.dataset.kind });
    state.selected.clear();
    renderLibrary();
  }));
  el.querySelectorAll('[data-plact]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const node = b.closest('.side-item');
    if (b.dataset.plact === 'del') deletePlaylist(node.dataset.name);
    else startRenamePlaylist(node, node.dataset.name);
  }));
}

function startRenamePlaylist(node, name) {
  node.innerHTML = `<input class="side-rename" value="${esc(name)}" />`;
  const inp = node.querySelector('.side-rename');
  inp.focus();
  inp.select();
  let done = false;
  const commit = () => { if (done) return; done = true; renamePlaylist(name, inp.value.trim()); };
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { done = true; renderLibrary(); }
  };
  inp.onblur = commit;
}

/// Run a verb, repaint from what it wrote, and toast its reply — or its error.
async function act(fn, message) {
  try {
    const r = await fn();
    await refreshLibrary();
    const text = typeof message === 'function' ? message(r) : message;
    if (text) toast(text);
    return r;
  } catch (e) {
    toast(String(e.message || e));
    renderLibrary();
    return null;
  }
}

// Renaming onto an existing name MERGES the two.
function renamePlaylist(oldName, newName) {
  if (!newName || newName === oldName) { renderLibrary(); return; }
  act(async () => {
    const r = await action('playlist-rename', oldName, newName, state.view);
    if (inPlaylistView() && state.collection.name === oldName) setCollection({ kind: 'playlist', name: newName });
    return r;
  }, (r) => (r.merged ? `Merged into “${newName}”.` : `Renamed to “${newName}”.`));
}

function deletePlaylist(name) {
  act(async () => {
    const r = await action('playlist-delete', name, state.view);
    if (inPlaylistView() && state.collection.name === name) setCollection({ kind: 'all' });
    return r;
  }, `Deleted playlist “${name}”. Songs kept.`);
}

// ── cards ────────────────────────────────────────────────────────────────────

/// An icon on a card is a STATE, never a verb; every verb is behind the ⋯.
const BADGES = [
  // In the phone view every row is on the phone, so 📱 would say nothing.
  { key: 'phone', icon: '📱', label: 'on your phone', has: (t) => !onPhoneView() && !!t.on_phone },
  { key: 'lyr', icon: '♪', label: 'lyrics', has: (t) => !!t.lrc },
  { key: 'kar', icon: '🎤', label: 'karaoke ready', has: (t) => !!(t.karaoke_audio || t.karaoke_video) },
];

function rowHtml(t) {
  const id = trackKey(t);
  const sel = state.selected.has(id);
  const badges = BADGES.filter((b) => b.has(t))
    .map((b) => `<span class="badge ${b.key}" title="${esc(b.label)}">${b.icon}</span>`)
    .join('');
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
    <button class="row-menu" data-act="menu" title="More">⋯</button>
  </div>`;
}

/// The key to the badges this view can actually show.
function renderLegend(tracks) {
  const el = $('lib-legend');
  if (!el) return;
  const shown = BADGES.filter((b) => tracks.some((t) => b.has(t)));
  el.hidden = !shown.length;
  el.innerHTML = shown
    .map((b) => `<span class="leg"><span class="badge ${b.key}">${b.icon}</span> ${esc(b.label)}</span>`)
    .join('');
}

// ── the selection ────────────────────────────────────────────────────────────

const selectedFiles = () =>
  (state.library.tracks || []).filter((t) => state.selected.has(trackKey(t)) && t.file).map((t) => t.file);

/// The verbs belong to the view you stand in: "Delete from library" destroys
/// files and exists only on the Mac side; the phone side's strongest verb
/// takes a song off the phone.
function removeLabel() {
  if (inPlaylistView()) return 'Remove from playlist';
  return onPhoneView() ? 'Remove from phone' : 'Delete from library';
}

function renderSelbar() {
  const bar = $('lib-selbar');
  const view = libraryView();
  if (!view.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  const n = state.selected.size;
  const allSel = view.every((t) => state.selected.has(trackKey(t)));
  const danger = !onPhoneView() && !inPlaylistView() ? ' danger' : '';
  bar.hidden = false;
  bar.innerHTML = `
    <label class="sel-all"><input type="checkbox" id="sel-all-chk" ${allSel ? 'checked' : ''} /> Select all</label>
    ${n
      ? `<span class="sel-n">${n} selected</span>
         <button class="btn ghost small" data-sel="add">Add to playlist…</button>
         ${onPhoneView() ? '' : '<button class="btn ghost small" data-sel="tophone">Add to phone</button>'}
         <button class="btn ghost small${danger}" data-sel="remove">${removeLabel()}</button>`
      : ''}
    <span class="sel-menu" id="sel-menu"></span>`;
  $('sel-all-chk').onchange = (e) => {
    if (e.target.checked) view.forEach((t) => state.selected.add(trackKey(t)));
    else state.selected.clear();
    renderLibrary();
  };
  if (!n) return;
  bar.querySelector('[data-sel="remove"]').onclick = removeSelected;
  bar.querySelector('[data-sel="add"]').onclick = showAddMenu;
  const toPhone = bar.querySelector('[data-sel="tophone"]');
  if (toPhone) toPhone.onclick = () => phoneAdd(selectedFiles());
}

/// Songs join what the phone carries — a reference; the phone fetches them.
/// What followed depends on whether the phone is here, so the message is
/// composed after re-reading presence, never from the boot list.
async function phoneAdd(files) {
  if (!files.length) return;
  await act(async () => {
    const r = await action('phone-add', JSON.stringify(files));
    state.selected.clear();
    try { state.phone = await phoneDevices(); } catch { /* keep what we have */ }
    return r;
  }, (r) => {
    const dev = currentDevice();
    return dev?.present
      ? `${plural(r.added, 'song')} on your phone — ${dev.name} is fetching.`
      : `${plural(r.added, 'song')} added — your phone picks ${r.added === 1 ? 'it' : 'them'} up when it wakes.`;
  });
}

/// The phone stops carrying these. Nothing on disk changes.
async function phoneRemove(files) {
  if (!files.length) return;
  await act(async () => {
    const r = await action('phone-remove', JSON.stringify(files));
    state.selected.clear();
    return r;
  }, (r) => `${plural(r.removed, 'song')} off your phone — still on this Mac.`);
}

function showAddMenu() {
  const menu = $('sel-menu');
  menu.innerHTML =
    playlists().map((p) => `<button class="pl-opt" data-pl="${esc(p)}">${esc(p)}</button>`).join('') +
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

function addToPlaylist(name) {
  const files = selectedFiles();
  act(async () => {
    const r = await action('playlist-add', name, JSON.stringify(files), state.view);
    state.selected.clear();
    setCollection({ kind: 'playlist', name });
    return r;
  }, (r) => `Added ${r.added} to “${name}”.`);
}

/// What "remove" means is decided by where you stand: inside a playlist it
/// unfiles, on the phone side it takes songs off the phone, and only in the
/// Mac's own views does it destroy anything.
async function removeSelected() {
  const files = selectedFiles();
  if (!files.length) return;
  if (inPlaylistView()) { await unfile(files, state.collection.name); return; }
  if (onPhoneView()) { await phoneRemove(files); return; }
  if (!(await confirmDialog(`Delete ${plural(files.length, 'song')} from your library?`, 'Delete', true))) return;
  await deleteTracks(files);
}

async function deleteTracks(files) {
  await act(async () => {
    const r = await action('tracks-delete', JSON.stringify(files));
    state.selected.clear();
    return r;
  }, (r) => `Deleted ${plural(r.deleted, 'song')}.`);
}

async function unfile(files, name) {
  const inList = new Set(playlistFiles(name));
  const members = files.filter((f) => inList.has(baseOf(f)));
  if (!members.length) { state.selected.clear(); renderLibrary(); return; }
  await act(async () => {
    const r = await action('playlist-remove', name, JSON.stringify(members), state.view);
    state.selected.clear();
    return r;
  }, (r) => `Removed ${plural(r.removed, 'song')} from “${name}”.`);
}

// ── playing ──────────────────────────────────────────────────────────────────

const lyricsFor = (fallback) => (cur) => fetchTrackLyrics(cur || fallback, renderLibrary);

export function play(start, queue, shuffle = false) {
  openPlayer(start, { toast, fetchLyrics: lyricsFor(start), queue, shuffle });
}

/// Hand a queue to the full-screen karaoke page via localStorage.
export function startKaraoke(start, queue) {
  const view = (queue || libraryView()).filter((t) => t.file);
  if (!view.length) { toast('Nothing to sing here.'); return; }
  try {
    localStorage.setItem('dj:karaoke', JSON.stringify({ ids: view.map(trackKey), start: trackKey(start || view[0]) }));
  } catch { /* private mode: the karaoke page falls back to the whole library */ }
  location.href = `karaoke.html${location.search}`;
}

function playAll() {
  const view = libraryView();
  if (!view.length) { toast('Nothing to play here.'); return; }
  play(state.shuffle ? view[Math.floor(Math.random() * view.length)] : view[0], view, state.shuffle);
}

// ── one card's verbs ─────────────────────────────────────────────────────────

const VERBS = {
  play: (t) => play(t, libraryView()),
  karaoke: (t) => startKaraoke(t, libraryView()),
  reveal: (t) => runBash(`open -R ${sq(t.file)}`).catch((e) => toast(String(e.message || e))),
  tophone: (t) => phoneAdd([t.file]),
  fromphone: (t) => phoneRemove([t.file]),
  unlist: (t) => unfile([t.file], state.collection.name),
  another: (t) => act(() => redownload(t.file), (r) => (r.added ? `Looking for another source for “${t.title}”.` : `“${t.title}” is already queued.`)),
  delete: async (t) => {
    if (await confirmDialog(`Delete “${t.title}” from your library?`, 'Delete', true)) await deleteTracks([t.file]);
  },
};

/// Which verbs exist is decided by the view you stand in — the same question
/// the selection bar answers for many songs.
function rowVerbs(t) {
  const verbs = [
    { act: 'play', label: 'Play', icon: '▶' },
    { act: 'karaoke', label: 'Karaoke', icon: '🎤' },
  ];
  if (onPhoneView()) verbs.push({ act: 'fromphone', label: 'Remove from phone', icon: '📴' });
  else if (!t.on_phone) verbs.push({ act: 'tophone', label: 'Add to phone', icon: '📱' });
  else verbs.push({ act: 'fromphone', label: 'Take off phone', icon: '📴' });
  verbs.push({ act: 'reveal', label: 'Show in Finder', icon: '📂' });
  if (!onPhoneView()) verbs.push({ act: 'another', label: 'Find another source', icon: '↻' });
  if (inPlaylistView()) verbs.push({ act: 'unlist', label: 'Remove from this playlist', icon: '✕', sep: true });
  else if (!onPhoneView()) verbs.push({ act: 'delete', label: 'Delete from library', icon: '🗑', sep: true, danger: true });
  return verbs;
}

function trackOf(el) {
  const id = el?.closest('.lib-row')?.dataset.id;
  return id ? state.library.tracks.find((x) => trackKey(x) === id) : null;
}

const openMenu = (t, anchor) => showRowMenu(trackKey(t), anchor, rowVerbs(t), (verb) => VERBS[verb]?.(t));

/// The whole card plays; the checkbox selects and the ⋯ opens the verbs.
function onRowClick(e) {
  const t = trackOf(e.target);
  if (!t || e.target.closest('.lib-chk')) return;
  const verb = e.target.closest('[data-act]')?.dataset.act || 'play';
  if (verb === 'menu') openMenu(t, e.target.closest('.row-menu'));
  else VERBS[verb]?.(t);
}

function onRowContext(e) {
  const t = trackOf(e.target);
  if (!t) return;
  e.preventDefault();
  openMenu(t, e.target.closest('.lib-row'));
}

/// A tick changes one card and the bar — not the whole grid.
function onRowCheck(e) {
  const chk = e.target.closest('.lib-chk');
  if (!chk) return;
  if (chk.checked) state.selected.add(chk.dataset.id);
  else state.selected.delete(chk.dataset.id);
  chk.closest('.lib-row')?.classList.toggle('sel', chk.checked);
  renderSelbar();
}

function updateModeBtn() {
  const b = $('mode-btn');
  if (b) b.textContent = state.shuffle ? '🔀 Shuffle' : '→ In order';
}

export function wireLibrary() {
  const search = debounce(() => renderLibrary(), 120);
  $('lib-search').addEventListener('input', (e) => { state.query = e.target.value; search(); });
  $('play-all').onclick = playAll;
  $('mode-btn').onclick = () => {
    state.shuffle = !state.shuffle;
    saveUi({ shuffle: state.shuffle });
    updateModeBtn();
  };
  updateModeBtn();
  $('library').addEventListener('click', onRowClick);
  $('library').addEventListener('contextmenu', onRowContext);
  $('library').addEventListener('change', onRowCheck);
}
