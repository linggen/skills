// Media tab — iPhone + Mac photo/video cleanup workspace.
//
// The iframe owns the whole pipeline (device poll, scan, review, backup,
// remove) via /api/bash -> scripts/media/media.sh; detection is pure scripts.
// The agent narrates milestones (window._chatNotify) but never gates progress.

const MEDIA_SH = '$HOME/.linggen/skills/sys-doctor/scripts/media/media.sh';
const DATA_DIR = '$HOME/.linggen/skills/sys-doctor/data/media';
const TAB_KEY = 'sys-doctor:tab';
const RENDER_CAP = 200; // thumbs per category; selection still covers all items

const CATEGORIES = [
  { key: 'on_mac', label: 'Already on Mac', precheck: true },
  { key: 'dupe', label: 'Duplicates', precheck: true },
  { key: 'blurry', label: 'Blurry', precheck: true },
  { key: 'dark', label: 'Black & dark', precheck: true },
  { key: 'screenshot', label: 'Screenshots', precheck: false },
  { key: 'large_video', label: 'Large videos', precheck: false },
];

let panel = null;
let removals = [];      // permanent removal history (removals.jsonl)
let macIndex = [];      // Mac photo index rows (mac-index.jsonl)
let macSelected = new Set();   // Mac file paths picked for Trash
let source = 'phone';   // review source: 'phone' | 'mac'
let activeMacCat = 'dupe';
let screen = 'connect';
let pollTimer = null;
let device = null;
let flags = null;          // parsed flags.json
let selected = new Set();  // item ids checked for removal
let activeCat = 'dupe';
let blurThreshold = 25;

// ── plumbing ──

function shellEsc(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function bash(command) {
  const resp = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command }),
  });
  return resp.json();
}

async function media(cmd) {
  const res = await bash(`bash ${MEDIA_SH} ${cmd}`);
  try { return JSON.parse(res.stdout || res.output || '{}'); }
  catch { return {}; }
}

function notify(text) {
  if (window._chatNotify) window._chatNotify(`[MEDIA_EVENT] ${text}`);
}

function fmtGb(bytes) {
  if (!bytes) return '0 KB';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── tab bar ──

export function initMediaTab() {
  panel = document.getElementById('media-panel');
  const tabs = document.querySelectorAll('.atab');
  for (const tab of tabs) {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  }
  activateTab(localStorage.getItem(TAB_KEY) || 'system');
}

function activateTab(name) {
  localStorage.setItem(TAB_KEY, name);
  for (const tab of document.querySelectorAll('.atab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  const system = document.getElementById('view-panel');
  const meta = document.querySelector('.header-meta');
  const isMedia = name === 'media';
  system.hidden = isMedia;
  panel.hidden = !isMedia;
  if (meta) meta.style.visibility = isMedia ? 'hidden' : 'visible';
  if (isMedia) resumeMedia(); else stopPolling();
}

// ── device/Mac status strip (visible on every screen after connect) ──

let statusCache = { info: null, st: null };

function statusStripHtml() {
  const { info, st } = statusCache;
  if (!info && !st) return '<span class="media-dim">Loading device status…</span>';
  const dev = (info?.connected ? info : null) || st?.device;
  const photos = info?.photos_gb ?? st?.pull?.dcim_gb;
  const idx = st?.mac_index;
  const conn = info?.connected
    ? '<span class="media-chip">USB connected</span>'
    : '<span class="media-chip warn">not connected</span>';
  const phone = dev
    ? `📱 <b>${esc(dev.name || 'iPhone')}</b> · ${dev.free_gb ?? '?'} GB free of ${dev.total_gb ?? '?'} GB${photos != null ? ` · camera roll ${photos} GB` : ''} ${conn}`
    : '📱 <span class="media-dim">no iPhone seen yet</span>';
  const mac = `💻 <b>This Mac</b> · ${info?.mac_free_gb ?? '?'} GB free${idx ? ` · photo index ${(idx.files ?? 0).toLocaleString()} files · ${idx.gb ?? '?'} GB` : ''}`;
  return `<span>${phone}</span><span>${mac}</span>`;
}

function statusStripDiv() {
  return `<div class="media-status" id="media-status">${statusStripHtml()}</div>`;
}

async function refreshStatus() {
  const [info, st] = await Promise.all([media('info'), media('state')]);
  statusCache = { info, st };
  const el = document.getElementById('media-status');
  if (el) el.innerHTML = statusStripHtml();
}

// ── screen router ──

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function setScreen(name, renderFn) {
  stopPolling();
  screen = name;
  renderFn();
}

/** On tab open, land on the screen that matches on-disk state. */
async function resumeMedia() {
  const prog = await media('progress');
  if (prog.status === 'running') {
    if (prog.op === 'backup' || prog.op === 'remove') return showApply();
    if (prog.op === 'setup') return showConnect();
    return showScanning();
  }
  const f = await media('flags');
  if (f.items?.length) { flags = f; return showReview(); }
  showConnect();
}

// ── screen 1 · connect ──

async function showConnect() {
  setScreen('connect', () => {
    panel.innerHTML = `
      <div class="media-card dashed" id="device-card">
        <h4 class="media-dim">Looking for your iPhone…</h4>
        <div class="media-dim">Plug in your iPhone with a cable, unlock it, and tap <b>Trust</b> when it asks.</div>
      </div>
      <div class="media-card" id="mac-card" hidden></div>
      <div class="media-card" id="setup-card" hidden></div>`;
  });
  const poll = () => refreshDevice();
  poll();
  pollTimer = setInterval(poll, 5000);
}

async function refreshDevice() {
  const [info, st] = await Promise.all([media('info'), media('state')]);
  if (screen !== 'connect') return;
  device = info;
  const card = document.getElementById('device-card');
  const macCard = document.getElementById('mac-card');
  const setupCard = document.getElementById('setup-card');
  if (!card) return;

  if (info.error === 'setup_required') {
    setupCard.hidden = false;
    setupCard.innerHTML = `
      <h4>One-time setup</h4>
      <div class="media-dim">The Media tab needs its USB + imaging tools (pymobiledevice3, Pillow, numpy) in a private sandbox. ~2 minutes, nothing system-wide.</div>
      <button class="media-cta" id="setup-btn">Install Media tools</button>
      <div class="media-dim" id="setup-note"></div>`;
    document.getElementById('setup-btn').onclick = async () => {
      document.getElementById('setup-btn').disabled = true;
      await media('setup');
      const t = setInterval(async () => {
        const p = await media('progress');
        const note = document.getElementById('setup-note');
        if (note && p.op === 'setup') note.textContent = p.note || p.phase || '';
        if (p.op === 'setup' && (p.status === 'done' || p.status === 'error')) {
          clearInterval(t);
          refreshDevice();
        }
      }, 3000);
    };
    return;
  }
  setupCard.hidden = true;

  if (macCard) {
    const idx = st?.mac_index;
    const idxLine = idx
      ? `Photo index: <b>${(idx.files ?? 0).toLocaleString()}</b> files · <b>${idx.gb ?? '?'} GB</b> · updated ${esc(String(idx.at ?? '').replace('T', ' '))}`
      : 'No photo index yet — it is built during the first scan.';
    macCard.hidden = false;
    macCard.innerHTML = `
      <h4>This Mac · ${info.mac_free_gb ?? '?'} GB free
        <span class="media-chip">room for staging + backup</span></h4>
      <div class="media-dim">${idxLine}</div>
      <div class="media-dim">Free space is checked here and re-checked right before anything copies.</div>`;
  }

  if (!info.connected) {
    card.className = 'media-card dashed';
    card.innerHTML = `
      <h4 class="media-dim">No iPhone detected</h4>
      <div class="media-dim">Plug in your iPhone with a cable, unlock it, and tap <b>Trust</b> when it asks. Checking every few seconds…</div>`;
    return;
  }

  const knowsPhotos = info.photos_gb != null;
  const usedPhotos = info.photos_gb ?? 0;
  const free = info.free_gb ?? 0;
  const total = info.total_gb ?? 0;
  const other = Math.max(total - usedPhotos - free, 0);
  const freeChip = free < total * 0.12
    ? `<span class="media-chip warn">${free} GB free</span>`
    : `<span class="media-chip">${free} GB free</span>`;
  card.className = 'media-card';
  card.innerHTML = `
    <h4>${esc(info.name)} · ${total} GB · iOS ${esc(info.ios)}</h4>
    <div class="media-dim"><span class="media-chip">USB connected</span><span class="media-chip">Trusted</span>${freeChip}</div>
    <div class="stbar" aria-hidden="true">
      <div style="flex:${usedPhotos};background:var(--accent)"></div>
      <div style="flex:${other};background:color-mix(in srgb, var(--accent) 40%, var(--bg-surface))"></div>
      <div style="flex:${free};background:var(--bg-surface)"></div>
    </div>
    <div class="media-legend">
      <span><span class="sw" style="background:var(--accent)"></span>Photos &amp; video <b>${knowsPhotos ? `${usedPhotos} GB` : '— measured on first scan'}</b></span>
      <span><span class="sw" style="background:color-mix(in srgb, var(--accent) 40%, var(--bg-surface))"></span>${knowsPhotos ? 'Apps &amp; system' : 'Used'} <b>${other.toFixed(1)} GB</b></span>
      <span><span class="sw" style="background:var(--bg-surface);border:1px solid var(--border)"></span>Free <b>${free} GB</b></span>
    </div>
    <button class="media-cta" id="scan-btn">Scan Photos &amp; Videos</button>`;
  document.getElementById('scan-btn').onclick = startScan;
}

// ── screen 2 · scan ──

async function startScan() {
  await media('start scan-all');
  notify(`Media scan started on ${device?.name || 'the iPhone'} (${device?.free_gb ?? '?'} GB free). Index Mac photos, pull new camera-roll files, then analyze. Acknowledge in one short sentence.`);
  showScanning();
}

const SCAN_PHASES = [
  { op: 'index', label: 'Index Mac photos' },
  { op: 'pull', label: 'Pull camera roll' },
  { op: 'scan', label: 'Analyze' },
];

function showScanning() {
  let scanPolls = 0;
  setScreen('scanning', () => {
    panel.innerHTML = `
      ${statusStripDiv()}
      ${SCAN_PHASES.map((p, i) => `
        <div class="media-card" id="phase-${p.op}">
          <h4>${i + 1} · ${p.label} <span class="media-chip" hidden></span></h4>
          <div class="media-pbar"><div style="width:0%"></div></div>
          <div class="media-dim"></div>
        </div>`).join('')}
      <button class="media-cta ghost" id="cancel-btn">Cancel scan</button>`;
    document.getElementById('cancel-btn').onclick = async () => {
      await media('cancel');
      showConnect();
    };
  });
  const poll = async () => {
    const p = await media('progress');
    if (screen !== 'scanning') return;
    if (scanPolls++ % 5 === 0) refreshStatus(); // every ~10s; pull moves Mac free space
    renderScanProgress(p);
    if (p.op === 'scan' && p.status === 'done') {
      flags = await media('flags');
      notify(`Media scan finished: ${flags.flagged} of ${flags.scanned} items flagged across duplicates/blurry/dark/screenshots/videos. Summarize in 1-2 sentences; remind the user nothing is removed without a verified backup and their confirm.`);
      showReview();
    } else if (p.status === 'error') {
      renderScanError(p);
    }
  };
  poll();
  pollTimer = setInterval(poll, 2000);
}

function renderScanProgress(p) {
  const idx = SCAN_PHASES.findIndex((s) => s.op === p.op);
  SCAN_PHASES.forEach((s, i) => {
    const card = document.getElementById(`phase-${s.op}`);
    if (!card) return;
    const bar = card.querySelector('.media-pbar > div');
    const chip = card.querySelector('.media-chip');
    const note = card.querySelector('.media-dim');
    if (i < idx || (i === idx && p.status === 'done')) {
      card.classList.add('phase-done');
      bar.style.width = '100%';
      chip.hidden = false;
      chip.textContent = 'done';
    } else if (i === idx) {
      const pct = p.total ? Math.round(((p.done || 0) / p.total) * 100) : 5;
      bar.style.width = `${pct}%`;
      note.textContent = p.total
        ? `${(p.done || 0).toLocaleString()} / ${p.total.toLocaleString()} ${p.note || ''}`
        : (p.note || p.phase || '');
    }
  });
}

function renderScanError(p) {
  stopPolling();
  const card = document.getElementById(`phase-${p.op}`) || panel.firstElementChild;
  if (card) {
    card.querySelector('.media-dim').innerHTML =
      `<span class="media-chip bad">error</span> ${esc(p.error || 'scan failed')}`;
  }
  const cancel = document.getElementById('cancel-btn');
  if (cancel) { cancel.textContent = 'Back'; cancel.onclick = () => showConnect(); }
}

// ── screen 3 · review ──

function blurEligible(it) {
  return it.blur != null && !it.flags.includes('screenshot') && !it.flags.includes('dark');
}

function itemsFor(key) {
  return flags.items.filter((it) =>
    key === 'blurry'
      ? blurEligible(it) && it.blur < blurThreshold
      : it.flags.includes(key) || (key === 'on_mac' && it.flags.includes('probably_on_mac')));
}

function applyPrechecks() {
  selected = new Set();
  for (const cat of CATEGORIES) {
    if (!cat.precheck) continue;
    for (const it of itemsFor(cat.key)) {
      if (cat.key === 'on_mac' && !it.flags.includes('on_mac')) continue; // "probably" never pre-checked
      if (cat.key === 'dupe' && isKeep(it.id)) continue;
      selected.add(it.id);
    }
  }
}

function isKeep(id) {
  return flags.groups.some((g) => g.keep === id);
}

async function loadJsonl(name) {
  const res = await bash(`cat "${DATA_DIR}/${name}" 2>/dev/null || true`);
  return (res.stdout || '').trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

async function loadRemovals() { removals = await loadJsonl('removals.jsonl'); }
async function loadMacIndex() { macIndex = await loadJsonl('mac-index.jsonl'); }

function showReview() {
  blurThreshold = flags.blur_default || 25;
  applyPrechecks();
  setScreen('review', renderReview);
  refreshStatus();
  Promise.all([loadRemovals(), loadMacIndex()])
    .then(() => { if (screen === 'review') renderReview(); });
  pollTimer = setInterval(refreshStatus, 15000);
}

function sourceSwitchHtml() {
  return `<div class="srcswitch">
    <button class="src ${source === 'phone' ? 'active' : ''}" data-src="phone">📱 iPhone</button>
    <button class="src ${source === 'mac' ? 'active' : ''}" data-src="mac">💻 Mac</button></div>`;
}

function wireSourceSwitch() {
  for (const b of panel.querySelectorAll('.srcswitch .src')) {
    b.onclick = () => { source = b.dataset.src; renderReview(); };
  }
}

function renderReview() {
  if (source === 'mac') return renderMacReview();
  let tiles = CATEGORIES.map((c) => {
    const items = itemsFor(c.key);
    const size = items.reduce((s, it) => s + it.size, 0);
    return `<button class="media-tile ${c.key === activeCat ? 'active' : ''}" data-cat="${c.key}">
      <b>${items.length.toLocaleString()}</b>${c.label} <span class="sz">${fmtGb(size)}</span></button>`;
  }).join('');
  tiles += `<button class="media-tile ${activeCat === 'removed' ? 'active' : ''}" data-cat="removed">
    <b>${removals.length.toLocaleString()}</b>Removed <span class="sz">${fmtGb(removals.reduce((s, r) => s + (r.size || 0), 0))}</span></button>`;
  panel.innerHTML = `
    ${statusStripDiv()}
    ${sourceSwitchHtml()}
    <div class="media-tiles">${tiles}</div>
    <div id="cat-pane"></div>
    <div class="selbar">
      <span id="sel-count"></span>
      <span class="media-dim">Nothing is deleted without a verified backup + your confirm</span>
      <button class="media-cta ghost" id="back-btn" style="margin-left:auto">↻ Rescan</button>
      <button class="media-cta" id="apply-btn" style="margin-left:0">Back Up &amp; Remove…</button>
    </div>`;
  for (const tile of panel.querySelectorAll('.media-tile')) {
    tile.onclick = () => { activeCat = tile.dataset.cat; renderReview(); };
  }
  wireSourceSwitch();
  document.getElementById('back-btn').onclick = () => showConnect();
  document.getElementById('apply-btn').onclick = async () => {
    if (selected.size && await confirmRemove(selected)) showApply(true);
  };
  renderCategoryPane();
  updateSelbar();
}

// ── Mac source (browse ~/Pictures index · dupes · Trash cleanup) ──

const MAC_CATS = [
  { key: 'dupe', label: 'Duplicates' },
  { key: 'large', label: 'Large files' },
  { key: 'all', label: 'All by folder' },
];

function jsHamming(a, b) {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d + Math.abs(a.length - b.length) * 4;
}

let macGroupsCache = null; // recomputed when macIndex reloads

function macDupeGroups() {
  if (macGroupsCache && macGroupsCache.n === macIndex.length) return macGroupsCache.groups;
  const groups = [];
  const bySha = {};
  for (const r of macIndex) (bySha[r.sha256] ||= []).push(r);
  const exactMembers = new Set();
  for (const rows of Object.values(bySha)) {
    if (rows.length > 1) {
      groups.push({ kind: 'exact', rows });
      rows.forEach((r) => exactMembers.add(r.path));
    }
  }
  const cand = macIndex.filter((r) => r.dhash && !exactMembers.has(r.path));
  const parent = [...cand.keys()];
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let a = 0; a < cand.length; a += 1) {
    for (let b = a + 1; b < cand.length; b += 1) {
      if (jsHamming(cand[a].dhash, cand[b].dhash) <= 4) parent[find(a)] = find(b);
    }
  }
  const near = {};
  cand.forEach((r, i) => (near[find(i)] ||= []).push(r));
  for (const rows of Object.values(near)) if (rows.length > 1) groups.push({ kind: 'near', rows });
  for (const g of groups) g.rows.sort((x, y) => (x.mtime || 0) - (y.mtime || 0)); // oldest first = likely original
  macGroupsCache = { n: macIndex.length, groups };
  return groups;
}

function macItemsFor(key) {
  if (key === 'dupe') return macDupeGroups().flatMap((g) => g.rows);
  if (key === 'large') return [...macIndex].sort((a, b) => b.size - a.size).slice(0, 50);
  return macIndex;
}

function macThumbHtml(r, checked) {
  const vid = VIDEO_RE.test(r.path);
  return `<div class="media-thumb ${vid ? 'vid' : ''}" data-path="${esc(r.path)}" title="${esc(r.path)}">
    <img src="../data/media/thumbs/${r.sha256.slice(0, 12)}.jpg" loading="lazy" alt="" onerror="this.remove()">
    ${vid ? '<span class="play">▶</span>' : ''}
    <input type="checkbox" ${checked ? 'checked' : ''} aria-label="trash">
    <button class="zoom" title="View full size" aria-label="View full size">⤢</button>
    <span class="score">${fmtGb(r.size)}</span></div>`;
}

const VIDEO_RE = /\.(mov|mp4|m4v|avi|3gp)$/i;

function renderMacReview() {
  const tiles = MAC_CATS.map((c) => {
    const items = macItemsFor(c.key);
    const size = items.reduce((s, r) => s + (r.size || 0), 0);
    return `<button class="media-tile ${c.key === activeMacCat ? 'active' : ''}" data-cat="${c.key}">
      <b>${items.length.toLocaleString()}</b>${c.label} <span class="sz">${fmtGb(size)}</span></button>`;
  }).join('');
  panel.innerHTML = `
    ${statusStripDiv()}
    ${sourceSwitchHtml()}
    <div class="media-tiles">${tiles}</div>
    <div id="cat-pane"></div>
    <div class="selbar">
      <span id="mac-sel-count"></span>
      <span class="media-dim">Mac cleanup goes to the Trash — restore anytime from there</span>
      <button class="media-cta ghost" id="mac-reindex-btn" style="margin-left:auto">↻ Re-index Mac</button>
      <button class="media-cta" id="mac-trash-btn" style="margin-left:0">Move to Trash…</button>
    </div>`;
  for (const tile of panel.querySelectorAll('.media-tile')) {
    tile.onclick = () => { activeMacCat = tile.dataset.cat; renderMacReview(); };
  }
  wireSourceSwitch();
  document.getElementById('mac-reindex-btn').onclick = reindexMac;
  document.getElementById('mac-trash-btn').onclick = trashSelected;
  renderMacPane();
  updateMacSelbar();
}

function renderMacPane() {
  const pane = document.getElementById('cat-pane');
  const bySelected = (r) => macSelected.has(r.path);
  let html = `<div class="catbar">
    <label class="catall"><input type="checkbox" id="mac-all-box"><span></span></label>
    <span class="media-dim">checked files go to the macOS Trash (recoverable) — originals in ~/Pictures</span></div>`;

  if (!macIndex.length) {
    pane.innerHTML = `<div class="media-dim">No Mac photo index yet — it is built during a scan
      (or hit ↻ Re-index Mac below).</div>`;
    return;
  }
  if (activeMacCat === 'dupe') {
    const groups = macDupeGroups();
    html += groups.length ? groups.map((g) => `
      <div class="media-group"><div class="glabel">Group of ${g.rows.length} ·
        ${g.kind === 'exact' ? 'exact byte dupes' : 'near-dupes (pHash)'} · oldest first</div>
      <div class="thumbrow">${g.rows.map((r) => macThumbHtml(r, bySelected(r))).join('')}</div></div>`).join('')
      : '<div class="media-dim">No duplicates found in the Mac index.</div>';
  } else if (activeMacCat === 'large') {
    html += `<div class="thumbrow">${macItemsFor('large').map((r) => macThumbHtml(r, bySelected(r))).join('')}</div>`;
  } else {
    const folders = {};
    for (const r of macIndex) {
      const dir = r.path.split('/').slice(0, -1).join('/');
      (folders[dir] ||= []).push(r);
    }
    html += Object.entries(folders)
      .sort((a, b) => b[1].reduce((s, r) => s + r.size, 0) - a[1].reduce((s, r) => s + r.size, 0))
      .map(([dir, rows]) => `
        <div class="media-group"><div class="glabel">${esc(dir.replace(/^\/Users\/[^/]+/, '~'))} ·
          ${rows.length} files · ${fmtGb(rows.reduce((s, r) => s + r.size, 0))}</div>
        <div class="thumbrow">${rows.slice(0, 30).map((r) => macThumbHtml(r, bySelected(r))).join('')}
        ${rows.length > 30 ? `<span class="media-dim">+${rows.length - 30} more…</span>` : ''}</div></div>`).join('');
  }
  pane.innerHTML = html;

  for (const box of pane.querySelectorAll('.media-thumb input')) {
    box.onchange = (e) => {
      const path = e.target.closest('.media-thumb').dataset.path;
      if (e.target.checked) macSelected.add(path); else macSelected.delete(path);
      updateMacSelbar();
      updateMacCatbar();
    };
  }
  for (const zoom of pane.querySelectorAll('.media-thumb .zoom')) {
    zoom.addEventListener('click', (e) => {
      e.stopPropagation();
      openMacLightbox(e.target.closest('.media-thumb').dataset.path);
    });
  }
  for (const thumb of pane.querySelectorAll('.media-thumb')) {
    thumb.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('zoom')) return;
      openMacLightbox(thumb.dataset.path);
    });
  }
  const allBox = document.getElementById('mac-all-box');
  allBox.onchange = (e) => {
    for (const r of macItemsFor(activeMacCat)) {
      if (e.target.checked) macSelected.add(r.path); else macSelected.delete(r.path);
    }
    renderMacPane();
    updateMacSelbar();
  };
  updateMacCatbar();
}

function updateMacCatbar() {
  const box = document.getElementById('mac-all-box');
  if (!box) return;
  const items = macItemsFor(activeMacCat);
  const checked = items.filter((r) => macSelected.has(r.path)).length;
  box.checked = items.length > 0 && checked >= items.length;
  box.indeterminate = checked > 0 && checked < items.length;
  box.parentElement.querySelector('span').textContent = `Select all (${items.length.toLocaleString()})`;
}

function updateMacSelbar() {
  const el = document.getElementById('mac-sel-count');
  if (!el) return;
  const byPath = new Map(macIndex.map((r) => [r.path, r]));
  let bytes = 0;
  for (const p of macSelected) bytes += byPath.get(p)?.size || 0;
  el.innerHTML = `<b>${macSelected.size.toLocaleString()} selected</b> · <b>${fmtGb(bytes)}</b>`;
  const btn = document.getElementById('mac-trash-btn');
  if (btn) {
    btn.disabled = macSelected.size === 0;
    btn.textContent = `Move ${macSelected.size.toLocaleString()} to Trash (${fmtGb(bytes)})`;
  }
}

async function trashSelected() {
  const byPath = new Map(macIndex.map((r) => [r.path, r]));
  const paths = [...macSelected].filter((p) => byPath.has(p));
  if (!paths.length) return;
  const bytes = paths.reduce((s, p) => s + (byPath.get(p)?.size || 0), 0);
  const ok = await confirmDialog(
    `<b>${paths.length.toLocaleString()} files (${fmtGb(bytes)})</b> will be moved to the macOS Trash.
     You can restore them from the Trash anytime.`, 'Move to Trash');
  if (!ok) return;
  const btn = document.getElementById('mac-trash-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Moving to Trash…'; }
  const sizes = Object.fromEntries(paths.map((p) => [p, byPath.get(p)?.size || 0]));
  await writeJsonFile('trash-selection.json', { paths, sizes });
  const res = await media('trash');
  macSelected.clear();
  macGroupsCache = null;
  await loadMacIndex();
  refreshStatus();
  notify(`Mac cleanup: moved ${res.trashed ?? '?'} files (${res.freed_gb ?? '?'} GB) to the Trash${res.errors?.length ? `, ${res.errors.length} errors` : ''}. One short sentence.`);
  renderMacReview();
}

function reindexMac() {
  media('start index');
  const btn = document.getElementById('mac-reindex-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Indexing…'; }
  const t = setInterval(async () => {
    if (screen !== 'review' || source !== 'mac') { clearInterval(t); return; }
    const p = await media('progress');
    if (p.op === 'index' && (p.status === 'done' || p.status === 'error')) {
      clearInterval(t);
      macGroupsCache = null;
      await loadMacIndex();
      refreshStatus();
      renderMacReview();
    }
  }, 2000);
}

async function ensureMacPreview(r) {
  const key = `${r.sha256.slice(0, 12)}.jpg`;
  const dst = `${DATA_DIR}/previews/${key}`;
  await bash(`mkdir -p "${DATA_DIR}/previews"; [ -f "${dst}" ] || sips -s format jpeg "${r.path}" --out "${dst}" --resampleHeightWidthMax 2048 >/dev/null`);
  return PREVIEW_URL + key;
}

async function openMacLightbox(path) {
  const r = macIndex.find((x) => x.path === path);
  if (!r) return;
  closeLightbox();
  lbOrder = macItemsFor(activeMacCat).map((x) => x.path);
  lbIdx = lbOrder.indexOf(path);
  const box = document.createElement('div');
  box.id = 'media-lightbox';
  box.className = 'media-lightbox';
  box.innerHTML = `
    <button class="lb-nav" id="lb-prev" aria-label="Previous" ${lbIdx > 0 ? '' : 'disabled'}>‹</button>
    <div class="lb-body"><div class="lb-media media-dim">Loading…</div>
      <div class="lb-cap"><span>${esc(path.split('/').pop())} · ${fmtGb(r.size)} · ${lbIdx + 1} / ${lbOrder.length}</span>
        <button class="media-cta sm" id="lb-mark"></button>
        <button class="media-cta ghost sm" id="lb-open">Reveal in Finder</button>
        <button class="media-cta ghost sm" id="lb-close">✕ Close</button></div></div>
    <button class="lb-nav" id="lb-next" aria-label="Next" ${lbIdx < lbOrder.length - 1 ? '' : 'disabled'}>›</button>`;
  box.onclick = (e) => { if (e.target === box) closeLightbox(); };
  document.body.appendChild(box);
  document.addEventListener('keydown', macLightboxKey);
  document.getElementById('lb-close').onclick = closeLightbox;
  document.getElementById('lb-prev').onclick = () => openMacLightbox(lbOrder[lbIdx - 1]);
  document.getElementById('lb-next').onclick = () => openMacLightbox(lbOrder[lbIdx + 1]);
  document.getElementById('lb-open').onclick = () => bash(`open -R ${shellEsc(path)}`);
  const markBtn = document.getElementById('lb-mark');
  const refreshMark = () => {
    markBtn.textContent = macSelected.has(path) ? '✓ Marked for Trash' : '🗑 Trash';
  };
  markBtn.onclick = () => {
    if (macSelected.has(path)) macSelected.delete(path); else macSelected.add(path);
    const thumb = document.querySelector(`.media-thumb[data-path="${CSS.escape(path)}"] input`);
    if (thumb) thumb.checked = macSelected.has(path);
    updateMacSelbar();
    updateMacCatbar();
    refreshMark();
  };
  refreshMark();
  const slot = box.querySelector('.lb-media');
  if (VIDEO_RE.test(path)) {
    slot.innerHTML = `<div class="media-dim">Videos preview from Finder — use "Reveal in Finder".</div>`;
  } else {
    try {
      const url = await ensureMacPreview(r);
      slot.innerHTML = `<img src="${url}" alt="">`;
    } catch {
      slot.innerHTML = `<div class="media-dim">Preview failed — use "Reveal in Finder".</div>`;
    }
  }
}

function macLightboxKey(e) {
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft' && lbIdx > 0) openMacLightbox(lbOrder[lbIdx - 1]);
  else if (e.key === 'ArrowRight' && lbIdx >= 0 && lbIdx < lbOrder.length - 1) openMacLightbox(lbOrder[lbIdx + 1]);
}

function thumbHtml(it, checked) {
  const img = it.thumb ? `<img src="../data/media/thumbs/${it.thumb}" loading="lazy" alt=""
    onerror="this.remove()">` : '';
  const vid = it.kind === 'video';
  const score = vid
    ? `${fmtGb(it.size)}${it.duration ? ` · ${Math.floor(it.duration / 60)}:${String(it.duration % 60).padStart(2, '0')}` : ''}`
    : it.blur != null && activeCat === 'blurry' ? `blur ${Math.round(it.blur)}`
    : it.luma != null && activeCat === 'dark' ? `luma ${Math.round(it.luma)}`
    : '';
  const kept = activeCat === 'dupe' && !checked;
  const probably = activeCat === 'on_mac' && !it.flags.includes('on_mac');
  const tag = activeCat === 'dupe' ? '<span class="tag keep-tag">★ KEEP</span>'
    : probably ? '<span class="tag cut">probably</span>'
    : activeCat === 'on_mac' ? '<span class="tag">on Mac ✓</span>' : '';
  return `<div class="media-thumb ${vid ? 'vid' : ''} ${kept ? 'kept' : ''}" data-id="${it.id}">
    ${img}${vid ? '<span class="play">▶</span>' : ''}
    <input type="checkbox" ${checked ? 'checked' : ''} aria-label="remove">
    <button class="zoom" title="View full size" aria-label="View full size">⤢</button>
    ${tag}${score ? `<span class="score">${score}</span>` : ''}</div>`;
}

/** Items the active category pane DISPLAYS (dupe = all group members, keeps included). */
function catItems(cat) {
  if (cat !== 'dupe') return itemsFor(cat);
  const byId = new Map(flags.items.map((it) => [it.id, it]));
  return flags.groups.slice(0, 100).flatMap((g) => g.ids).map((id) => byId.get(id)).filter(Boolean);
}

function catSelection() {
  return new Set(catItems(activeCat).filter((it) => selected.has(it.id)).map((it) => it.id));
}

function removedThumbHtml(r) {
  const img = r.thumb ? `<img src="../data/media/thumbs/${r.thumb}" loading="lazy" alt=""
    onerror="this.remove()">` : '';
  return `<div class="media-thumb" data-backup="${esc(r.backup || '')}"
    title="${esc(r.name)} — reveal the backup in Finder">
    ${img}<span class="score">${fmtGb(r.size || 0)}</span></div>`;
}

function renderRemovedPane(pane) {
  if (!removals.length) {
    pane.innerHTML = `<div class="media-dim">Nothing removed yet. Items you remove land here,
      with their verified Mac backups — kept permanently, no 30-day limit.</div>`;
    return;
  }
  const days = {};
  for (const r of removals) (days[(r.at || '').slice(0, 10)] ||= []).push(r);
  pane.innerHTML = `<div class="media-dim" style="margin-bottom:8px">Every item here was backed up
      and verified before removal — the copies live on your Mac permanently (no 30-day purge).
      Click one to reveal its backup in Finder. Restore-to-iPhone arrives with the Linggen mobile app.</div>`
    + Object.entries(days).sort((a, b) => b[0].localeCompare(a[0])).map(([day, rows]) => `
      <div class="media-group"><div class="glabel">${day} · ${rows.length} removed ·
        ${fmtGb(rows.reduce((s, r) => s + (r.size || 0), 0))}</div>
      <div class="thumbrow">${rows.map(removedThumbHtml).join('')}</div></div>`).join('');
  for (const t of pane.querySelectorAll('.media-thumb')) {
    t.onclick = () => { if (t.dataset.backup) bash(`open -R "${t.dataset.backup}"`); };
  }
}

function renderCategoryPane() {
  const pane = document.getElementById('cat-pane');
  if (activeCat === 'removed') return renderRemovedPane(pane);
  const items = itemsFor(activeCat);
  let html = '';

  html += `<div class="catbar">
    <label class="catall"><input type="checkbox" id="cat-all-box"><span></span></label>
    <button class="media-cta sm" id="cat-remove-btn"></button>
    <span class="media-dim">only this category's checked items; same verify + confirm flow</span></div>`;

  if (activeCat === 'blurry') {
    html += `<div class="sliderrow">Blur sensitivity
      <input type="range" min="5" max="80" value="${blurThreshold}" id="blur-range">
      <output>${items.length} flagged</output></div>`;
  }
  if (activeCat === 'on_mac') {
    html += `<div class="media-dim" style="margin-bottom:8px"><b>Byte-identical copies already on your Mac</b> are pre-checked — backed up by definition, nothing to copy. Visual-only matches show as “probably” and are never pre-checked.</div>`;
  }
  if (activeCat === 'screenshot') {
    html += `<div class="media-dim" style="margin-bottom:8px">Screenshots default to unchecked — opt in per item, or
      <button class="media-cta ghost" style="margin:0;padding:3px 10px;font-size:11.5px" id="old-shots-btn">select older than 6 months</button></div>`;
  }

  if (activeCat === 'dupe') {
    const groups = flags.groups.slice(0, 100);
    html += groups.map((g) => {
      const members = g.ids.map((id) => flags.items.find((it) => it.id === id)).filter(Boolean);
      if (!members.length) return '';
      const label = g.kind === 'exact' ? 'exact byte dupes' : 'near-dupes (pHash)';
      return `<div class="media-group"><div class="glabel">Group of ${members.length} · ${label} · unchecked = kept on phone</div>
        <div class="thumbrow">${members.map((it) => thumbHtml(it, selected.has(it.id))).join('')}</div></div>`;
    }).join('');
  } else {
    const shown = items.slice(0, RENDER_CAP);
    html += `<div class="thumbrow">${shown.map((it) => thumbHtml(it, selected.has(it.id))).join('')}</div>`;
    if (items.length > RENDER_CAP) {
      html += `<div class="media-dim" style="margin-top:8px">Showing ${RENDER_CAP} of ${items.length.toLocaleString()} — checkboxes above apply per item; the selection already covers the whole category.</div>`;
    }
  }
  pane.innerHTML = html;

  for (const box of pane.querySelectorAll('.media-thumb input')) {
    box.onchange = (e) => {
      const thumbEl = e.target.closest('.media-thumb');
      if (e.target.checked) selected.add(thumbEl.dataset.id); else selected.delete(thumbEl.dataset.id);
      if (activeCat === 'dupe') thumbEl.classList.toggle('kept', !e.target.checked);
      updateSelbar();
      updateCatbar();
    };
  }
  for (const zoom of pane.querySelectorAll('.media-thumb .zoom')) {
    zoom.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox(e.target.closest('.media-thumb').dataset.id);
    });
  }
  for (const thumb of pane.querySelectorAll('.media-thumb')) {
    thumb.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('zoom')) return;
      openLightbox(thumb.dataset.id);
    });
  }
  const catRemove = document.getElementById('cat-remove-btn');
  if (catRemove) catRemove.onclick = async () => {
    const s = catSelection();
    if (s.size && await confirmRemove(s)) showApply(true, s);
  };
  document.getElementById('cat-all-box').onchange = (e) => {
    for (const it of catItems(activeCat)) {
      if (e.target.checked) {
        if (activeCat === 'dupe' && isKeep(it.id)) continue;
        selected.add(it.id);
      } else {
        // explicit user clear wins everywhere — even items other pre-checked
        // categories claim (unlike the blur slider's automatic re-flagging)
        selected.delete(it.id);
      }
    }
    renderCategoryPane();
    updateSelbar();
  };
  updateCatbar();
  const blurRange = document.getElementById('blur-range');
  if (blurRange) {
    blurRange.oninput = () => {
      blurThreshold = parseInt(blurRange.value, 10);
      for (const it of flags.items.filter(blurEligible)) {
        if (it.blur < blurThreshold) selected.add(it.id); else if (!heldByOtherCat(it, 'blurry')) selected.delete(it.id);
      }
      renderReview();
    };
  }
  const oldShots = document.getElementById('old-shots-btn');
  if (oldShots) {
    oldShots.onclick = () => {
      const cutoff = Date.now() / 1000 - 182 * 86400;
      for (const it of itemsFor('screenshot')) if (it.mtime < cutoff) selected.add(it.id);
      renderReview();
    };
  }
}

function updateCatbar() {
  const btn = document.getElementById('cat-remove-btn');
  if (!btn) return;
  const scoped = catSelection();
  const byId = new Map(flags.items.map((it) => [it.id, it]));
  const bytes = [...scoped].reduce((s, id) => s + (byId.get(id)?.size || 0), 0);
  const verb = activeCat === 'on_mac'
    ? `Remove ${scoped.size.toLocaleString()} checked — already backed up`
    : `Back up & remove ${scoped.size.toLocaleString()} checked`;
  btn.textContent = `🗑 ${verb} (${fmtGb(bytes)})`;
  btn.disabled = !scoped.size;
  const box = document.getElementById('cat-all-box');
  if (box) {
    const selectable = catItems(activeCat)
      .filter((it) => !(activeCat === 'dupe' && isKeep(it.id))).length;
    box.checked = selectable > 0 && scoped.size >= selectable;
    box.indeterminate = scoped.size > 0 && scoped.size < selectable;
    box.parentElement.querySelector('span').textContent = `Select all (${selectable.toLocaleString()})`;
  }
}

/** In-page confirm (native confirm() is a no-op in the app shell). */
function confirmDialog(messageHtml, actionLabel) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'media-lightbox';
    box.innerHTML = `
      <div class="media-confirm">
        <div>${messageHtml}</div>
        <div class="row">
          <button class="media-cta ghost sm" id="cf-no">Cancel</button>
          <button class="media-cta sm" id="cf-yes">${actionLabel}</button>
        </div>
      </div>`;
    const done = (v) => { box.remove(); resolve(v); };
    box.onclick = (e) => { if (e.target === box) done(false); };
    box.querySelector('#cf-no').onclick = () => done(false);
    box.querySelector('#cf-yes').onclick = () => done(true);
    document.body.appendChild(box);
  });
}

async function confirmRemove(ids) {
  const byId = new Map(flags.items.map((it) => [it.id, it]));
  const bytes = [...ids].reduce((sum, id) => sum + (byId.get(id)?.size || 0), 0);
  return confirmDialog(
    `<b>${ids.size.toLocaleString()} selected items (${fmtGb(bytes)})</b> will be backed up to your Mac
     and verified, then removed from the iPhone. Continue?`,
    'Back up & remove');
}

// ── full-size preview (lightbox) ──

const STAGING_URL = '../data/media/staging/';
const PREVIEW_URL = '../data/media/previews/';

let lbOrder = [];
let lbIdx = -1;

function closeLightbox() {
  document.getElementById('media-lightbox')?.remove();
  document.removeEventListener('keydown', lightboxKey);
  document.removeEventListener('keydown', macLightboxKey);
}

function lightboxKey(e) {
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft' && lbIdx > 0) openLightbox(lbOrder[lbIdx - 1]);
  else if (e.key === 'ArrowRight' && lbIdx >= 0 && lbIdx < lbOrder.length - 1) openLightbox(lbOrder[lbIdx + 1]);
}

/** Ids in the order the active category displays them. */
function lightboxOrder() {
  if (activeCat === 'dupe') {
    const byId = new Set(flags.items.map((it) => it.id));
    return flags.groups.slice(0, 100).flatMap((g) => g.ids).filter((id) => byId.has(id));
  }
  return itemsFor(activeCat).map((it) => it.id);
}

/** HEIC can't render in the browser — convert once with macOS sips, cached by content hash. */
async function ensurePreview(it) {
  const key = `${it.sha256.slice(0, 12)}.jpg`;
  const src = `${DATA_DIR}/staging/${it.staged}`;
  const dst = `${DATA_DIR}/previews/${key}`;
  await bash(`mkdir -p "${DATA_DIR}/previews"; [ -f "${dst}" ] || sips -s format jpeg "${src}" --out "${dst}" --resampleHeightWidthMax 2048 >/dev/null`);
  return PREVIEW_URL + key;
}

async function openLightbox(id) {
  const it = flags.items.find((x) => x.id === id);
  if (!it) return;
  closeLightbox();
  lbOrder = lightboxOrder();
  lbIdx = lbOrder.indexOf(id);
  const stagedUrl = STAGING_URL + it.staged.split('/').map(encodeURIComponent).join('/');
  const box = document.createElement('div');
  box.id = 'media-lightbox';
  box.className = 'media-lightbox';
  box.innerHTML = `
    <button class="lb-nav" id="lb-prev" aria-label="Previous" ${lbIdx > 0 ? '' : 'disabled'}>‹</button>
    <div class="lb-body"><div class="lb-media media-dim">Loading…</div>
      <div class="lb-cap"><span>${esc(it.staged.split('/').pop())} · ${fmtGb(it.size)}
          · ${lbIdx + 1} / ${lbOrder.length}</span>
        <button class="media-cta sm" id="lb-mark"></button>
        <button class="media-cta ghost sm" id="lb-open">Open on Mac</button>
        <button class="media-cta ghost sm" id="lb-close">✕ Close</button></div></div>
    <button class="lb-nav" id="lb-next" aria-label="Next" ${lbIdx < lbOrder.length - 1 ? '' : 'disabled'}>›</button>`;
  box.onclick = (e) => { if (e.target === box) closeLightbox(); };
  document.body.appendChild(box);
  document.addEventListener('keydown', lightboxKey);
  document.getElementById('lb-close').onclick = closeLightbox;
  document.getElementById('lb-prev').onclick = () => openLightbox(lbOrder[lbIdx - 1]);
  document.getElementById('lb-next').onclick = () => openLightbox(lbOrder[lbIdx + 1]);
  document.getElementById('lb-open').onclick = () =>
    bash(`open "${DATA_DIR}/staging/${it.staged}"`);
  const markBtn = document.getElementById('lb-mark');
  const refreshMark = () => {
    const on = selected.has(it.id);
    markBtn.textContent = on ? '✓ Marked for removal' : '🗑 Remove';
    markBtn.title = on ? 'Click to keep this one' : 'Check it for the backup & remove set';
  };
  markBtn.onclick = () => {
    if (selected.has(it.id)) selected.delete(it.id); else selected.add(it.id);
    const thumb = document.querySelector(`.media-thumb[data-id="${it.id}"]`);
    if (thumb) {
      const box2 = thumb.querySelector('input');
      if (box2) box2.checked = selected.has(it.id);
      if (activeCat === 'dupe') thumb.classList.toggle('kept', !selected.has(it.id));
    }
    updateSelbar();
    updateCatbar();
    refreshMark();
  };
  refreshMark();
  const slot = box.querySelector('.lb-media');
  const ext = it.staged.split('.').pop().toLowerCase();
  if (it.kind === 'video') {
    slot.innerHTML = `<video controls autoplay src="${stagedUrl}"></video>`;
    slot.querySelector('video').onerror = () => {
      slot.innerHTML = `<div class="media-dim">This codec won't play in the browser — use "Open on Mac".</div>`;
    };
  } else if (ext === 'heic' || ext === 'heif') {
    try {
      const url = await ensurePreview(it);
      slot.innerHTML = `<img src="${url}" alt="">`;
    } catch {
      slot.innerHTML = `<div class="media-dim">Preview failed — use "Open on Mac".</div>`;
    }
  } else {
    slot.innerHTML = `<img src="${stagedUrl}" alt="">`;
  }
}

/** True if another pre-checked category (not `cat`) still claims this item. */
function heldByOtherCat(it, cat) {
  return CATEGORIES.some((c) => c.precheck && c.key !== cat && it.flags.includes(c.key));
}

function updateSelbar() {
  const el = document.getElementById('sel-count');
  if (!el) return;
  const byId = new Map(flags.items.map((it) => [it.id, it]));
  let bytes = 0;
  for (const id of selected) bytes += byId.get(id)?.size || 0;
  el.innerHTML = `<b>${selected.size.toLocaleString()} selected</b> · <b>${fmtGb(bytes)}</b>`;
  const btn = document.getElementById('apply-btn');
  if (btn) {
    btn.disabled = selected.size === 0;
    btn.textContent = `Back Up & Remove ${selected.size.toLocaleString()} (${fmtGb(bytes)})`;
  }
}

// ── screen 4 · back up & remove ──

async function writeJsonFile(name, obj) {
  const json = JSON.stringify(obj);
  const chunks = [];
  for (let i = 0; i < json.length; i += 40000) chunks.push(json.slice(i, i + 40000));
  await bash(`mkdir -p "${DATA_DIR}" && : > "${DATA_DIR}/${name}"`);
  for (const c of chunks) {
    await bash(`printf '%s' ${shellEsc(c)} >> "${DATA_DIR}/${name}"`);
  }
  await bash(`printf '\\n' >> "${DATA_DIR}/${name}"`);
}

function writeSelection(ids) {
  return writeJsonFile('selection.json', { ids: [...ids] });
}

async function showApply(fresh = false, scopeIds = null) {
  const ids = scopeIds || selected;
  const byId = fresh ? new Map(flags.items.map((it) => [it.id, it])) : null;
  const count = fresh ? ids.size : null;
  const bytes = fresh ? [...ids].reduce((s, id) => s + (byId.get(id)?.size || 0), 0) : null;

  setScreen('apply', () => {
    panel.innerHTML = `
      ${statusStripDiv()}
      <div class="media-card">
        <h4 id="apply-title">${fresh ? `Back up &amp; remove ${count.toLocaleString()} items (${fmtGb(bytes)})` : 'Back up &amp; remove'}</h4>
        <div class="media-dim" id="preflight-note"></div>
        <div class="media-flow">
          <div class="fstep" id="step-backup"><span class="fnum">1</span>
            <div><b>Back up to Mac</b> <span class="media-chip" hidden></span><br>
            <span class="media-dim">→ ~/Pictures/iPhone Backup/ · sorted by year/month · originals untouched</span>
            <div class="media-pbar" style="max-width:300px"><div style="width:0%"></div></div></div></div>
          <div class="fstep" id="step-verify"><span class="fnum">2</span>
            <div><b>Verify</b> <span class="media-chip" hidden></span><br>
            <span class="media-dim">every copy re-hashed against the phone original; skipped ones re-checked against the Mac index</span></div></div>
          <div class="fstep" id="step-remove"><span class="fnum">3</span>
            <div><b>Remove from iPhone</b> <span class="media-chip" hidden></span><br>
            <span class="media-dim" id="remove-note">runs only after you confirm below</span>
            <div class="media-pbar" style="max-width:300px" hidden><div style="width:0%"></div></div></div></div>
        </div>
        <div id="apply-actions"></div>
      </div>
      <div class="media-card icloud-note" hidden id="icloud-card">
        <h4>iCloud Photos is on</h4>
        <div class="media-dim">iOS blocks USB-side deletion when iCloud Photos is enabled. Your backup is safe and verified. To free the space: open Photos on the phone → select the flagged items (the report card lists them by date) → delete, then empty Recently Deleted. Duplicates merge fastest via Photos' built-in Duplicates album.</div>
      </div>
      <div class="media-card dashed" hidden id="report-card"></div>`;
  });

  if (fresh) {
    await writeSelection(ids);
    await media('start backup');
  }
  pollApply();
}

function stepEls(id) {
  const step = document.getElementById(id);
  return { step, chip: step.querySelector('.media-chip'), bar: step.querySelector('.media-pbar') };
}

function pollApply() {
  let applyPolls = 0;
  const poll = async () => {
    const p = await media('progress');
    if (screen !== 'apply') return;
    if (applyPolls++ % 5 === 0) refreshStatus(); // backup/remove move both free-space numbers
    if (p.op === 'backup') renderBackupProgress(p);
    if (p.op === 'remove') renderRemoveProgress(p);
    if (p.status === 'error') {
      stopPolling();
      document.getElementById('preflight-note').innerHTML =
        `<span class="media-chip bad">error</span> ${esc(p.error)} <button class="media-cta ghost" id="apply-back">Back to review</button>`;
      document.getElementById('apply-back').onclick = () => showReview();
    }
  };
  poll();
  pollTimer = setInterval(poll, 2000);
}

function renderBackupProgress(p) {
  const backup = stepEls('step-backup');
  const verify = stepEls('step-verify');
  if (p.status === 'running') {
    const pct = p.total ? Math.round(((p.done || 0) / p.total) * 100) : 5;
    backup.bar.firstElementChild.style.width = `${pct}%`;
    if (p.skipped_on_mac) {
      document.getElementById('preflight-note').textContent =
        `${p.skipped_on_mac} items already on Mac — verified against the index, no copy needed.`;
    }
    return;
  }
  if (p.status !== 'done') return;
  stopPolling();
  backup.step.classList.add('done');
  backup.bar.firstElementChild.style.width = '100%';
  backup.chip.hidden = false;
  backup.chip.textContent = `${p.verified ?? 0} verified`;
  verify.step.classList.add('done');
  verify.chip.hidden = false;
  verify.chip.textContent = p.failed
    ? `${p.verified} ok · ${p.failed} failed — failed items will NOT be removed`
    : `${p.verified} / ${p.verified} hashes match`;
  if (p.failed) verify.chip.classList.add('warn');
  notify(`Backup done: ${p.verified} items verified to ${p.dest}${p.failed ? `, ${p.failed} failed verification (kept on phone)` : ''}. One short sentence.`);
  const actions = document.getElementById('apply-actions');
  actions.innerHTML = `
    <button class="media-cta danger" id="remove-btn">Remove ${p.verified} verified items from iPhone</button>
    <button class="media-cta ghost" id="skip-remove">Keep them — back up only</button>`;
  document.getElementById('remove-btn').onclick = async () => {
    actions.innerHTML = '';
    await media('start remove');
    pollApply();
  };
  document.getElementById('skip-remove').onclick = () => showReview();
}

async function renderRemoveProgress(p) {
  const remove = stepEls('step-remove');
  remove.bar.hidden = false;
  document.getElementById('remove-note').textContent = 'deleting over USB…';
  if (p.status === 'running') {
    const pct = p.total ? Math.round(((p.done || 0) / p.total) * 100) : 5;
    remove.bar.firstElementChild.style.width = `${pct}%`;
    return;
  }
  if (p.status !== 'done') return;
  stopPolling();
  remove.step.classList.add('done');
  remove.bar.firstElementChild.style.width = '100%';
  remove.chip.hidden = false;
  remove.chip.textContent = `${p.removed} removed`;
  if (p.icloud_suspected) document.getElementById('icloud-card').hidden = false;
  const before = device?.free_gb;
  const info = await media('info');
  const report = document.getElementById('report-card');
  report.hidden = false;
  report.innerHTML = `
    <h4>Report card</h4>
    <div class="media-dim">Freed <b>${p.freed_gb} GB</b> on iPhone${before && info.free_gb ? ` — free space ${before} → <b>${info.free_gb} GB</b>` : ''}
      · ${p.errors ? `${p.errors} items could not be deleted (see note above)` : 'every verified item removed'}
      · backup + hash log in ~/.linggen/skills/sys-doctor/data/media/. Undo = copy back from the backup folder.</div>
    <button class="media-cta" id="done-btn">Done</button>`;
  notify(`Removal done: freed ${p.freed_gb} GB on the iPhone (${p.removed} items)${p.icloud_suspected ? '; deletions were blocked — iCloud Photos looks ON, guided on-device cleanup shown' : ''}. Celebrate in one short sentence with the before/after free space.`);
  document.getElementById('done-btn').onclick = () => { flags = null; showConnect(); };
}

document.addEventListener('DOMContentLoaded', initMediaTab);
