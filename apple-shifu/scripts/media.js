// Media tab — iPhone + Mac photo/video cleanup workspace.
//
// The iframe owns the whole pipeline (device poll, scan, review, backup,
// remove) via /api/bash -> scripts/media/media.sh; detection is pure scripts.
// The agent narrates milestones (window._chatNotify) but never gates progress.

import {
  registerTab, setSourceInfo, setBackupBadge, getSource, setSource,
  onSourceChange, onTabChange, refreshVerbs,
} from './shifu-shell.js';

const MEDIA_SH = '$HOME/.linggen/skills/apple-shifu/scripts/media/media.sh';
const DATA_DIR = '$HOME/.linggen/skills/apple-shifu/data/media';
const RENDER_CAP = 200; // thumbs per category; selection still covers all items
/** Categories rendered as the month-by-month roll view (whole roll subsets). */
const ROLL_CATS = new Set(['all', 'not_backed']);
const FOLDER_PREVIEW = 30; // Mac "All by folder" tiles before a "+N more" expander

const CATEGORIES = [
  { key: 'all', label: 'All media', precheck: false },
  { key: 'not_backed', label: 'Not backed up', precheck: false },
  { key: 'on_mac', label: '💾 On Mac', precheck: true },
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
let activeMacCat = 'all';
let macFolderExpanded = new Set();  // folder indices shown in full (All-by-folder)
let screen = 'connect';
let pollTimer = null;
let device = null;
let flags = null;          // parsed flags.json
let roll = [];             // EVERY camera-roll item (manifest, Live-MOVs folded)
let archiveRows = [];         // archive.jsonl rows — every hash-verified backup copy
let archiveShas = new Set();  // content hashes with a verified archive copy
let allExpanded = new Set();  // month keys shown in full in the All view
let selected = new Set();  // item ids checked for removal
let activeCat = 'all';
let blurThreshold = 25;

// ── plumbing ──

function shellEsc(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

let serverDownAt = 0;

/** Every pipeline call goes through here. A rejected fetch (daemon restarting
    or stopped) used to unwind the click handler with no trace — the button
    simply did nothing. Say so instead, and hand callers an empty result. */
async function bash(command) {
  try {
    const resp = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_root: '/tmp', command }),
    });
    return await resp.json();
  } catch {
    if (Date.now() - serverDownAt > 5000) {   // one message per outage, not per call
      serverDownAt = Date.now();
      flashToast('Linggen server unreachable — try again in a moment');
    }
    return {};
  }
}

export async function media(cmd) {
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

function abbrevPath(p) {
  return String(p).replace(/^\/Users\/[^/]+/, '~');
}

// ── shell registration ──

export function initMediaTab() {
  panel = document.getElementById('media-panel');
  registerTab('media', mediaProvider);
  onTabChange((name) => { if (name === 'media') resumeMedia(); else stopPolling(); });
  onSourceChange(() => { if (screen === 'review') renderReview(); });
  // Numbers the header shows on every tab, so they can't wait on this one
  // being opened.
  refreshBackupBadge();
}

/** A long op owning the toolbar, e.g. 'Indexing…'. While set, every verb is
    blocked with it as the reason — the buttons used to carry this in their own
    label text, which the shared toolbar has no room for. */
let busyOp = null;

function setBusy(op) {
  busyOp = op;
  refreshVerbs();
}

/** The Media tab's four verbs. Back up means the same thing under both
    sources — archive the iPhone roll onto this Mac — so the switch never
    changes what the button does, only what Scan and Clean act on. */
const mediaProvider = {
  panel: 'media-panel',
  verbs: (source) => {
    const actions = source === 'mac' ? macVerbs() : phoneVerbs();
    if (busyOp) for (const k of Object.keys(actions)) actions[k] = { blocked: busyOp };
    return actions;
  },
  meta: (source) => (busyOp ? `<span class="verb-busy">${busyOp}</span>`
    : source === 'mac' ? macVerbMeta() : phoneVerbMeta()),
};

/** Every pipeline verb needs the venv — say which one-time step is missing
    rather than letting the button fail into a toast. */
const NEEDS_SETUP = 'Install the Media tools first — the card on the Media tab does it';

function setupPending() {
  return statusCache.info?.error === 'setup_required';
}

/** One definition, used under both sources — Back up never changes meaning
    when the device switch moves. The hint names the pile it would copy,
    because the header badge always counts the whole roll and the two figures
    must not look like they disagree. */
function backupVerb() {
  const targets = backupTargets();
  if (!targets.length) {
    return { blocked: selected.size ? 'Everything checked is already backed up' : 'Everything is backed up' };
  }
  const bytes = targets.reduce((s, it) => s + it.size, 0);
  const n = targets.length.toLocaleString();
  const noun = `item${targets.length === 1 ? '' : 's'}`;
  return {
    hint: selected.size
      ? `Archive the ${n} checked ${noun} (${fmtGb(bytes)}) still missing a copy — the header badge counts the whole roll`
      : `Archive ${n} ${noun} (${fmtGb(bytes)}) — everything not backed up yet`,
    run: openBackupFlow,
  };
}

function phoneVerbs() {
  const bytes = selectedBytes();
  return {
    scan: setupPending()
      ? { label: 'Sync', blocked: NEEDS_SETUP }
      : { label: 'Sync', hint: 'Pull new photos and videos off the iPhone', run: syncNow },
    report: screen === 'review'
      ? { hint: 'Ask Ling to summarise the roll', run: () => reportRoll() }
      : { blocked: 'Sync the iPhone first — there is nothing to report on yet' },
    backup: backupVerb(),
    clean: selected.size
      ? {
        hint: `Remove ${selected.size.toLocaleString()} checked (${fmtGb(bytes)}) from the iPhone`,
        run: async () => {
          if (await confirmRemoveDialog(selected)) removeInline(new Set(selected));
        },
      }
      : { blocked: 'Check items to remove them from the iPhone' },
  };
}

function macVerbs() {
  const bytes = macIndex.filter((r) => macSelected.has(r.path))
    .reduce((s, r) => s + (r.size || 0), 0);
  return {
    scan: setupPending()
      ? { label: 'Re-index', blocked: NEEDS_SETUP }
      : { label: 'Re-index', hint: 'Rebuild this Mac\'s photo index', run: reindexMac },
    report: macIndex.length
      ? { hint: 'Ask Ling to summarise the Mac library', run: () => reportMacLibrary() }
      : { blocked: 'No Mac photo index yet — re-index first' },
    backup: backupVerb(),
    clean: macSelected.size
      ? {
        label: 'Trash',
        hint: `Move ${macSelected.size.toLocaleString()} checked (${fmtGb(bytes)}) to the macOS Trash`,
        run: trashSelected,
      }
      : { blocked: 'Check files to move them to the macOS Trash' },
  };
}

function selectedBytes() {
  const byId = allById();
  let bytes = 0;
  for (const id of selected) bytes += byId.get(id)?.size || 0;
  return bytes;
}

/** Backup is one flow wherever it is triggered from — the toolbar on either
    source, or the System tab. */
export async function openBackupFlow() {
  const targets = backupTargets();
  if (!targets.length) return;
  const r = await confirmBackupDialog(targets);
  if (r) backupInline(targets, r.dest);
}

/** Report asks Ling out loud — the counts come from this pane, so the model
    never has to guess at them. */
function ask(msg) {
  if (window._chatSend) window._chatSend(msg);
}

function reportRoll() {
  const cats = CATEGORIES.map((c) => {
    const items = itemsFor(c.key);
    return `${c.label}: ${items.length} items, ${fmtGb(items.reduce((s, it) => s + it.size, 0))}`;
  }).join('; ');
  ask(`Write a short report on my iPhone camera roll. Counts by category — ${cats}. `
    + 'Sort your advice by reclaimable bytes, not item count.');
}

function reportMacLibrary() {
  const bytes = macIndex.reduce((s, r) => s + (r.size || 0), 0);
  const dupes = macDupeGroups().reduce((s, g) => s + g.rows.length - 1, 0);
  ask(`Write a short report on my Mac photo library: ${macIndex.length} indexed files, `
    + `${fmtGb(bytes)}, ${dupes} redundant copies across duplicate groups.`);
}

function phoneVerbMeta() {
  if (screen !== 'review') return '';
  const parts = [`<b>${selected.size.toLocaleString()} selected · ${fmtGb(selectedBytes())}</b>`];
  if (pendingDeletes.size) {
    parts.push(`<span class="abar-queued">⏳ ${pendingDeletes.size.toLocaleString()} queued for iPhone</span>`);
  }
  return parts.join(' ');
}

function macVerbMeta() {
  if (!macSelected.size) return '';
  const bytes = macIndex.filter((r) => macSelected.has(r.path))
    .reduce((s, r) => s + (r.size || 0), 0);
  return `<b>${macSelected.size.toLocaleString()} selected · ${fmtGb(bytes)}</b>`;
}

/** The header's unarchived figure. Computed from the ledger and the manifest,
    so it is the same number the "Not backed up" chip shows and it is known
    before the Media tab has ever been opened. */
async function refreshBackupBadge() {
  if (roll.length) {          // tab is open — reuse what it already loaded
    const pending = roll.filter((it) => !archiveShas.has(it.sha256));
    setBackupBadge({ count: pending.length, bytes: pending.reduce((s, it) => s + it.size, 0) });
    return;
  }
  const [rows, archive] = await Promise.all([loadJsonl('manifest.jsonl'), loadJsonl('archive.jsonl')]);
  const shas = new Set(archive.map((r) => r.sha256));
  const folded = foldLiveMovs(rows);
  if (!folded.length) { setBackupBadge(null); return; }
  const pending = folded.filter((r) => !shas.has(r.sha256));
  setBackupBadge({ count: pending.length, bytes: pending.reduce((s, r) => s + r.size, 0) });
}

// ── device/Mac status strip (visible on every screen after connect) ──

let statusCache = { info: null, st: null };

function statusStripHtml() {
  const { info, st } = statusCache;
  if (!info && !st) return '<span class="media-dim">Loading device status…</span>';
  const dev = (info?.connected ? info : null) || st?.device;
  const photos = info?.photos_gb ?? st?.pull?.dcim_gb;
  const idx = st?.mac_index;
  // A paired phone IS connected — over Wi-Fi. Only call it disconnected when
  // neither transport is there.
  const conn = info?.connected
    ? '<span class="media-chip">USB connected</span>'
    : pairedDevices.length
      ? '<span class="media-chip">Wi-Fi paired</span>'
      : '<span class="media-chip warn">not connected</span>';
  const wirelessName = pairedDevices.map((d) => d.name).find(Boolean);
  const phone = dev
    ? `📱 <b>${esc(dev.name || 'iPhone')}</b> · ${dev.free_gb ?? '?'} GB free of ${dev.total_gb ?? '?'} GB${photos != null ? ` · camera roll ${photos} GB` : ''} ${conn}`
    : wirelessName
      ? `📱 <b>${esc(wirelessName)}</b> ${conn}`
      : '📱 <span class="media-dim">no iPhone seen yet</span>';
  const mac = `💻 <b>This Mac</b> · ${info?.mac_free_gb ?? '?'} GB free${idx ? ` · photo index ${(idx.files ?? 0).toLocaleString()} files · ${idx.gb ?? '?'} GB` : ''}`;
  // Both halves are plain readouts now — picking a device is the header's job,
  // and one switch beats two that can disagree.
  return `<span class="stat">${phone}</span><span class="stat">${mac}</span>`;
}

function statusStripDiv() {
  return `<div class="media-status" id="media-status">${statusStripHtml()}</div>`;
}

/** Feed the header switch. It carries the names and free space; the strip
    keeps the fuller line. Same numbers, drawn once from one cache. */
function publishSourceInfo() {
  const { info, st } = statusCache;
  const dev = (info?.connected ? info : null) || st?.device;
  const wirelessName = pairedDevices.map((d) => d.name).find(Boolean);
  setSourceInfo('phone', {
    label: dev?.name || wirelessName || 'iPhone',
    detail: dev?.free_gb != null ? `${dev.free_gb} GB free` : '',
    title: info?.connected ? 'iPhone connected over USB'
      : pairedDevices.length ? 'iPhone paired over Wi-Fi' : 'No iPhone connected',
  });
  setSourceInfo('mac', {
    label: 'This Mac',
    detail: info?.mac_free_gb != null ? `${info.mac_free_gb} GB free` : '',
    title: 'This Mac',
  });
}

async function refreshStatus() {
  const queuedBefore = [...pendingDeletes].sort().join();
  const [info, st] = await Promise.all([
    media('info'), media('state'), loadPendingDeletes(), loadPairedDevices(),
  ]);
  statusCache = { info, st };
  const el = document.getElementById('media-status');
  if (el) el.innerHTML = statusStripHtml();
  publishSourceInfo();
  // Phone executed (or user unqueued elsewhere) → badges must follow.
  if (screen === 'review' && getSource() === 'phone'
      && [...pendingDeletes].sort().join() !== queuedBefore) renderReview();
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
  media('purge'); // fire-and-forget: expire >30-day restore-area files
  bash(`rm -f ${DATA_DIR}/previews/vid_* 2>/dev/null`); // drop stale video play-links
  const prog = await media('progress');
  if (prog.status === 'running') {
    // backup/remove run inline over the review grid — reattach the toast
    if (prog.op === 'backup' || prog.op === 'remove') {
      const f = await media('flags');
      if (f.items?.length) { flags = f; showReview(); watchInlineOp(prog.op); return; }
    }
    if (prog.op === 'setup') return showConnect();
    return showScanning();
  }
  const f = await media('flags');
  // any completed scan opens the review workspace — even a clean phone still
  // has the All/On-Mac/Removed views and the Mac archive browser to offer
  if (f.generated || f.items?.length) { flags = f; return showReview(); }
  showConnect();
}

/** Re-attach a progress toast to a backup/remove op that is already running
    (tab was closed and reopened mid-op), then refresh the grid on completion. */
async function watchInlineOp(op) {
  const label = op === 'backup' ? 'Backing up' : 'Removing';
  const toast = showToast(`${label}…`, true);
  stopPolling();
  await new Promise((resolve) => {
    const poll = async () => {
      const p = await media('progress');
      if (p.op === op && p.total) toast.update(`${label} ${(p.done || 0).toLocaleString()}/${p.total.toLocaleString()}…`);
      if (p.status === 'done' || p.status === 'error') { stopPolling(); resolve(); }
    };
    poll();
    pollTimer = setInterval(poll, 1000);
  });
  const p = await media('progress');
  flags = await media('flags');
  await Promise.all([loadRoll(), loadRemovals(), loadArchive()]);
  refreshBackupBadge();
  pruneSelected();
  if (screen === 'review' && getSource() === 'phone') renderReview();
  refreshStatus();
  toast.done(p.status === 'error' ? `✕ ${p.error || `${label} failed`}` : `✓ ${label} finished`);
}

// ── screen 1 · connect ──

async function showConnect() {
  setScreen('connect', () => {
    panel.innerHTML = `
      <div class="media-card dashed" id="device-card">
        <h4 class="media-dim">Looking for your iPhone…</h4>
        <div class="media-dim">Wirelessly via Linggen Mobile, or over a cable for the USB workflow.</div>
      </div>
      <div class="media-card" id="phone-card" hidden></div>
      <div class="media-card" id="mac-card" hidden></div>
      <div class="media-card" id="setup-card" hidden></div>`;
  });
  const poll = () => refreshDevice();
  poll();
  pollTimer = setInterval(poll, 5000);
}

/** The wireless half of "is a phone here?" — paired devices and what they
    already sent. Without this the connect screen only knows about cables and
    claims "no iPhone" while Linggen Mobile is paired and syncing. */
async function renderPhoneCard() {
  const el = document.getElementById('phone-card');
  if (!el) return;
  await loadPairedDevices();
  const paired = pairedDevices;
  const rows = await loadJsonl('manifest.jsonl');
  const wireless = rows.filter((r) => (r.path || '').startsWith('wireless/'));
  const size = wireless.reduce((s, r) => s + (r.size || 0), 0);
  el.hidden = false;
  if (!paired.length) {
    el.className = 'media-card dashed';
    el.innerHTML = `
      <h4 class="media-dim">📱 No phone paired</h4>
      <div class="media-dim">Linggen Mobile syncs photos over Wi-Fi — no cable. Pair it in
        <b>Settings → Phone</b>, then open Linggen on the phone.</div>`;
    return;
  }
  const names = paired.map((d) => esc(d.name)).join(', ');
  el.className = 'media-card';
  el.innerHTML = `
    <h4>📱 ${names} <span class="media-chip">paired</span></h4>
    ${wireless.length
      ? `<div class="media-dim"><b>${wireless.length.toLocaleString()}</b> items synced wirelessly · ${fmtGb(size)}</div>`
      : ''}
    <div class="media-dim">Open Linggen on the phone to sync what’s new — no cable needed.</div>
    ${wireless.length ? '<button class="media-cta" id="phone-review-btn">Review synced photos</button>' : ''}`;
  const btn = document.getElementById('phone-review-btn');
  if (btn) {
    btn.onclick = async () => {
      flags = await media('flags');
      await Promise.all([loadRoll(), loadRemovals(), loadArchive(), loadPendingDeletes()]);
      refreshBackupBadge();
      showReview();
    };
  }
}

async function refreshDevice() {
  const [info, st] = await Promise.all([media('info'), media('state')]);
  // The connect screen is the only poller before a scan exists, so it feeds
  // the header switch and the toolbar too — otherwise both sit blank until the
  // review screen is reached.
  statusCache = { info, st };
  publishSourceInfo();
  refreshVerbs();
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
  await renderPhoneCard();

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
      <h4 class="media-dim">🔌 No iPhone on USB</h4>
      <div class="media-dim">Only needed for the cable workflow — plug in, unlock, and tap <b>Trust</b>. Checking every few seconds…</div>`;
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
    <button class="media-cta" id="scan-btn">Sync Photos &amp; Videos</button>`;
  document.getElementById('scan-btn').onclick = startScan;
}

// ── screen 2 · scan ──

async function startScan() {
  await media('start scan-all');
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
      notify(await scanReport());
      showReview();
    } else if (p.status === 'error') {
      renderScanError(p);
    }
  };
  poll();
  pollTimer = setInterval(poll, 2000);
}

/** Scan-finished agent event — the one moment the agent reports: full
    breakdown so the report needs no tool round-trip. */
async function scanReport() {
  blurThreshold = flags.blur_default || 25;
  const byId = new Map(flags.items.map((it) => [it.id, it]));
  const cats = CATEGORIES.filter((c) => c.key !== 'all').map((c) => {
    const items = itemsFor(c.key);
    if (!items.length) return null;
    return `${c.label} ${items.length} (${fmtGb(items.reduce((s, it) => s + it.size, 0))})`;
  }).filter(Boolean).join(', ');
  const sugg = suggestedIds();
  const suggBytes = [...sugg].reduce((s, id) => s + (byId.get(id)?.size || 0), 0);
  const st = await media('state');
  const fresh = st?.pull?.pulled ? `${st.pull.pulled} new since last scan, ` : '';
  return `Media scan finished: ${flags.scanned.toLocaleString()} camera-roll files scanned (${fresh}phone ${st?.device?.free_gb ?? '?'} GB free). Flagged ${flags.flagged}: ${cats || 'nothing'}. The suggested cleanup set is ${sugg.size} items (${fmtGb(suggBytes)}) — removing it is user-driven and recoverable for 30 days. Report these findings to the user in 2-4 sentences, leading with the biggest win.`;
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
  if (key === 'all') return roll;
  if (key === 'not_backed') return roll.filter((it) => !archiveShas.has(it.sha256));
  if (key === 'queued') return roll.filter(isQueued);
  if (key === 'on_mac') {
    // one bucket for "a copy exists on this Mac": organic ~/Pictures matches
    // (exact + probable, from the scan) ∪ hash-verified archive copies
    const flagged = flags.items.filter((it) =>
      it.flags.includes('on_mac') || it.flags.includes('probably_on_mac'));
    const seen = new Set(flagged.map((it) => it.id));
    return flagged.concat(roll.filter((it) => archiveShas.has(it.sha256) && !seen.has(it.id)));
  }
  return flags.items.filter((it) =>
    key === 'blurry'
      ? blurEligible(it) && it.blur < blurThreshold
      : it.flags.includes(key));
}

/** The scan's cleanup recommendations: dupes (keeps excluded), blurry, dark,
    exact copies already on Mac. Screenshots and large videos are opt-in. */
function suggestedIds() {
  const ids = new Set();
  for (const cat of CATEGORIES) {
    if (!cat.precheck) continue;
    for (const it of itemsFor(cat.key)) {
      if (cat.key === 'on_mac' && !it.flags.includes('on_mac')) continue; // "probably" never suggested
      if (cat.key === 'dupe' && isKeep(it.id)) continue;
      ids.add(it.id);
    }
  }
  return ids;
}

function applyPrechecks() {
  selected = suggestedIds();
}

/** What Backup would copy: the checked items, or — when nothing is checked —
    the whole roll. Items with a hash-verified archive copy drop out either
    way, so Backup always means "finish the archive", never re-copy it. */
function backupTargets() {
  const byId = allById();
  const pool = selected.size
    ? [...selected].map((id) => byId.get(id)).filter(Boolean)
    : roll;
  return pool.filter((it) => !archiveShas.has(it.sha256));
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
async function loadArchive() {
  archiveRows = await loadJsonl('archive.jsonl');
  archiveShas = new Set(archiveRows.map((r) => r.sha256));
}

/** localIds queued for on-phone deletion — Remove on wireless rows feeds it,
    the phone's reconcile drains it once the deletion really happened. */
let pendingDeletes = new Set();

/** Phones paired over Wi-Fi — the other half of "is a device here?" next to
    the USB probe. Refreshed with the status strip. */
let pairedDevices = [];

async function loadPendingDeletes() {
  try {
    const r = await fetch('/api/media/pending-deletes');
    if (r.ok) pendingDeletes = new Set((await r.json()).localIds || []);
  } catch { /* daemon unreachable — keep last known */ }
}

async function loadPairedDevices() {
  try {
    const r = await fetch('/api/pair/info');
    if (r.ok) pairedDevices = (await r.json()).devices || [];
  } catch { /* daemon unreachable — keep last known */ }
}

/** The phone's own counters, from this side: what the phone mirrored here and
    how much of it has an archive copy. Same two numbers the phone shows, so
    both screens can be trusted to agree. */
function wirelessSummary() {
  const synced = roll.filter((it) => (it.phone_path || '').startsWith('wireless/'));
  if (!synced.length) return '';
  const backed = synced.filter((it) => archiveShas.has(it.sha256)).length;
  return `<span class="abar-synced">${synced.length.toLocaleString()} synced ·
    ${backed.toLocaleString()} backed up</span>`;
}

function isQueued(it) {
  return !!it?.phone_path?.startsWith('wireless/') && pendingDeletes.has(it.phone_path.slice(9));
}

/** Add to (or cancel from) the phone-delete queue; mirrors locally on success. */
async function setQueued(localIds, cancel = false) {
  const res = await fetch('/api/media/request-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ localIds, ...(cancel ? { cancel: true } : {}) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  for (const id of localIds) cancel ? pendingDeletes.delete(id) : pendingDeletes.add(id);
}

const IMAGE_RE = /\.(heic|heif|jpg|jpeg|png|gif|tiff|webp|dng)$/i;

/** Item id = sha256(phone path)[:12] — must match cmd_scan's derivation. */
async function pathId(p) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
  return [...new Uint8Array(d).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Manifest rows with each Live-Photo MOV folded into its still (same rule as
    the scan): one row per visible item, carrying the pair's combined size.
    Both the roll view and the header's unarchived count derive from this, so
    the two numbers cannot drift apart. */
function foldLiveMovs(manifestRows) {
  const rows = manifestRows.filter((r) => r.staged && (IMAGE_RE.test(r.staged) || VIDEO_RE.test(r.staged)));
  const stem = (p) => p.slice(0, p.lastIndexOf('.')).toLowerCase();
  const stills = new Set(rows.filter((r) => IMAGE_RE.test(r.staged)).map((r) => stem(r.staged)));
  const isMovHalf = (r) => /\.mov$/i.test(r.staged) && stills.has(stem(r.staged));
  const movByStem = new Map();
  for (const r of rows) if (isMovHalf(r)) movByStem.set(stem(r.staged), r);
  return rows.filter((r) => !isMovHalf(r)).map((r) => {
    const mov = IMAGE_RE.test(r.staged) ? movByStem.get(stem(r.staged)) : null;
    return mov ? { ...r, size: r.size + mov.size, live_mov: mov.path } : r;
  });
}

/** Build the All view from manifest.jsonl. Flagged items keep their richer
    flags.json record; the rest get a synthesized flag-shaped item. */
async function loadRoll() {
  if (!crypto.subtle) { roll = []; return; }  // non-secure context — All view unavailable
  const rows = foldLiveMovs(await loadJsonl('manifest.jsonl'));
  const flagsById = new Map((flags?.items || []).map((it) => [it.id, it]));
  const items = await Promise.all(rows.map(async (r) => {
    const id = await pathId(r.path);
    const known = flagsById.get(id);
    if (known) return known;
    return {
      id, phone_path: r.path, staged: r.staged, sha256: r.sha256,
      size: r.size, mtime: r.mtime,
      kind: VIDEO_RE.test(r.staged) ? 'video' : 'image', flags: [],
      thumb: `${r.sha256.slice(0, 12)}.jpg`, ...(r.live_mov ? { live_mov: r.live_mov } : {}),
    };
  }));
  items.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  roll = items;
}

function monthKey(it) {
  return it.mtime ? new Date(it.mtime * 1000).toISOString().slice(0, 7) : 'undated';
}

/** Items in one month group of the active roll view — scoped to the category,
    so a month checkbox in "Not backed up" never grabs archived siblings. */
function monthItems(month) {
  return itemsFor(activeCat).filter((it) => monthKey(it) === month);
}

/** id → item across BOTH the flag list and the whole roll. */
function allById() {
  const m = new Map(roll.map((it) => [it.id, it]));
  for (const it of flags?.items || []) if (!m.has(it.id)) m.set(it.id, it);
  return m;
}

function showReview() {
  blurThreshold = flags.blur_default || 25;
  applyPrechecks();
  setScreen('review', renderReview);
  refreshStatus();
  Promise.all([loadRemovals(), loadMacIndex(), loadRoll(), loadArchive(), loadPendingDeletes()])
    .then(() => { refreshBackupBadge(); if (screen === 'review') renderReview(); });
  pollTimer = setInterval(refreshStatus, 15000);
}

function renderReview() {
  if (getSource() === 'mac') return renderMacReview();
  let chips = CATEGORIES.map((c) => {
    const items = itemsFor(c.key);
    const size = items.reduce((s, it) => s + it.size, 0);
    return `<button class="media-chip-f ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">
      <b>${items.length.toLocaleString()}</b>${c.label}${size ? ` · ${fmtGb(size)}` : ''}</button>`;
  }).join('');
  chips += '<span class="chip-divider"></span>';
  // Waiting on the phone — its own chip so the whole queue is reviewable
  // (and unqueueable) in one place, mirroring the phone's Mac-asks chip.
  if (pendingDeletes.size) {
    const queued = itemsFor('queued');
    chips += `<button class="media-chip-f queued ${activeCat === 'queued' ? 'on' : ''}" data-cat="queued">
      <b>${pendingDeletes.size.toLocaleString()}</b>⏳ Queued for iPhone${queued.length
        ? ` · ${fmtGb(queued.reduce((s, it) => s + it.size, 0))}` : ''}</button>`;
  }
  chips += `<button class="media-chip-f ${activeCat === 'removed' ? 'on' : ''}" data-cat="removed">
    <b>${removals.length.toLocaleString()}</b>🕘 Removed · ${fmtGb(removals.reduce((s, r) => s + (r.size || 0), 0))}</button>`;
  panel.innerHTML = `
    ${statusStripDiv()}
    <div class="media-actionbar">
      <span class="abar-meta">${wirelessSummary()}
        <span class="media-dim">removals recoverable on this Mac for 30 days</span></span>
    </div>
    <div class="media-chips">${chips}</div>
    <div id="cat-pane"></div>`;
  for (const chip of panel.querySelectorAll('.media-chip-f')) {
    chip.onclick = () => { activeCat = chip.dataset.cat; renderReview(); };
  }
  renderCategoryPane();
  updateSelbar();
}

// ── Mac source (browse ~/Pictures index · dupes · Trash cleanup) ──

const MAC_CATS = [
  { key: 'all', label: 'All by folder' },
  { key: 'dupe', label: 'Duplicates' },
  { key: 'video', label: 'Videos' },
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
  if (key === 'video') return macIndex.filter((r) => VIDEO_RE.test(r.path)).sort((a, b) => b.size - a.size);
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

/** Archive folders with Live-Photo MOV halves folded into their stills —
    same rule as the phone views: one tile per photo, sidecar size included. */
function archiveFolders() {
  const stemOf = (p) => { const n = p.split('/').pop(); return n.slice(0, n.lastIndexOf('.')).toLowerCase(); };
  const dirs = new Map();
  for (const r of archiveRows) {
    const dir = r.dest.split('/').slice(0, -1).join('/');
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(r);
  }
  const folded = new Map();
  for (const [dir, rows] of dirs) {
    const stillByStem = new Map();
    const out = [];
    for (const r of rows) {
      if (!IMAGE_RE.test(r.dest)) continue;
      const c = { ...r };
      if (!stillByStem.has(stemOf(r.dest))) stillByStem.set(stemOf(r.dest), c);
      out.push(c);
    }
    for (const r of rows) {
      if (IMAGE_RE.test(r.dest)) continue;
      const still = /\.mov$/i.test(r.dest) ? stillByStem.get(stemOf(r.dest)) : null;
      if (still) still.size = (still.size || 0) + (r.size || 0);  // Live-Photo sidecar
      else out.push({ ...r });
    }
    folded.set(dir, out);
  }
  return folded;
}

/** Archive-copy tile: browse-only (the archive is the recovery guarantee —
    cleanup never touches it here). Click reveals the copy in Finder. */
function archThumbHtml(r) {
  const vid = VIDEO_RE.test(r.dest);
  return `<div class="media-thumb ${vid ? 'vid' : ''}" data-path="${esc(r.dest)}" title="${esc(r.dest)}">
    <img src="../data/media/thumbs/${r.sha256.slice(0, 12)}.jpg" loading="lazy" alt="" onerror="this.remove()">
    ${vid ? '<span class="play">▶</span>' : ''}
    <span class="score">${fmtGb(r.size || 0)}</span></div>`;
}

const VIDEO_RE = /\.(mov|mp4|m4v|avi|3gp)$/i;

function renderMacReview() {
  const chips = MAC_CATS.map((c) => {
    const items = macItemsFor(c.key);
    let count = items.length;
    let size = items.reduce((s, r) => s + (r.size || 0), 0);
    if (c.key === 'all') {  // the archive lives on this Mac too (Live-MOVs folded)
      for (const rows of archiveFolders().values()) {
        count += rows.length;
        size += rows.reduce((s, r) => s + (r.size || 0), 0);
      }
    }
    return `<button class="media-chip-f ${c.key === activeMacCat ? 'on' : ''}" data-cat="${c.key}">
      <b>${count.toLocaleString()}</b>${c.label}${size ? ` · ${fmtGb(size)}` : ''}</button>`;
  }).join('');
  panel.innerHTML = `
    ${statusStripDiv()}
    <div class="media-actionbar">
      <span class="abar-meta">
        <span class="media-dim">Mac cleanup goes to the macOS Trash — restore anytime from there</span></span>
    </div>
    <div class="media-chips">${chips}</div>
    <div id="cat-pane"></div>`;
  for (const chip of panel.querySelectorAll('.media-chip-f')) {
    chip.onclick = () => { activeMacCat = chip.dataset.cat; renderMacReview(); };
  }
  renderMacPane();
  updateMacSelbar();
}

function renderMacPane() {
  const pane = document.getElementById('cat-pane');
  const bySelected = (r) => macSelected.has(r.path);
  const hint = activeMacCat === 'dupe'
    ? 'oldest of each group is likely the original — checked files go to the macOS Trash'
    : 'checked files go to the macOS Trash (recoverable) — originals in ~/Pictures';
  let html = `<div class="catbar">
    <button class="media-cta ghost sm" id="mac-select-btn"></button>
    <button class="media-cta ghost sm" id="mac-clear-btn">Clear</button>
    <span class="media-dim">${hint}</span></div>`;

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
  } else if (activeMacCat === 'video') {
    html += `<div class="thumbrow">${macItemsFor('video').map((r) => macThumbHtml(r, bySelected(r))).join('')}</div>`;
  } else {
    // backup archive first (latest snapshot/month on top), grouped by its
    // date folders — rendered from the ledger, never from the Mac index
    html += [...archiveFolders().entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dir, rows], i) => {
      const key = `arch${i}`;
      const cap = macFolderExpanded.has(key) ? rows.length : FOLDER_PREVIEW;
      const more = rows.length - cap;
      return `<div class="media-group"><div class="glabel">💾 ${esc(abbrevPath(dir))} ·
          ${rows.length} files · ${fmtGb(rows.reduce((s, r) => s + (r.size || 0), 0))} · backup archive</div>
        <div class="thumbrow">${rows.slice(0, cap).map(archThumbHtml).join('')}
        ${more > 0 ? `<button class="media-cta ghost sm show-more" data-fi="${key}">+${more} more…</button>` : ''}</div></div>`;
    }).join('');
    const folders = {};
    for (const r of macIndex) {
      const dir = r.path.split('/').slice(0, -1).join('/');
      (folders[dir] ||= []).push(r);
    }
    const ordered = Object.entries(folders)
      .sort((a, b) => b[1].reduce((s, r) => s + r.size, 0) - a[1].reduce((s, r) => s + r.size, 0));
    html += ordered.map(([dir, rows], fi) => {
      const cap = macFolderExpanded.has(String(fi)) ? rows.length : FOLDER_PREVIEW;
      const more = rows.length - cap;
      return `<div class="media-group"><div class="glabel">${esc(dir.replace(/^\/Users\/[^/]+/, '~'))} ·
          ${rows.length} files · ${fmtGb(rows.reduce((s, r) => s + r.size, 0))}</div>
        <div class="thumbrow">${rows.slice(0, cap).map((r) => macThumbHtml(r, bySelected(r))).join('')}
        ${more > 0 ? `<button class="media-cta ghost sm show-more" data-fi="${fi}">+${more} more…</button>` : ''}</div></div>`;
    }).join('');
  }
  pane.innerHTML = html;
  for (const b of pane.querySelectorAll('.show-more')) {
    b.onclick = () => { macFolderExpanded.add(b.dataset.fi); renderMacPane(); };
  }

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
  const selBtn = document.getElementById('mac-select-btn');
  if (selBtn) selBtn.onclick = () => {
    const next = macSelectNextAction();  // 'recommended' (dupes, keep oldest) | 'all'
    for (const g of activeMacCat === 'dupe' ? macDupeGroups() : [{ rows: macItemsFor(activeMacCat) }]) {
      g.rows.forEach((r, i) => {
        if (next === 'recommended' && i === 0) macSelected.delete(r.path);
        else macSelected.add(r.path);
      });
    }
    renderMacPane();
    updateMacSelbar();
  };
  const clrBtn = document.getElementById('mac-clear-btn');
  if (clrBtn) clrBtn.onclick = () => {
    for (const r of macItemsFor(activeMacCat)) macSelected.delete(r.path);
    renderMacPane();
    updateMacSelbar();
  };
  updateMacCatbar();
}

/** Mirrors the phone's dupe cycle: Select dupes (oldest kept) ↔ Select all. */
function macSelectNextAction() {
  if (activeMacCat !== 'dupe') return 'all';
  const groups = macDupeGroups();
  const rec = groups.flatMap((g) => g.rows.slice(1));
  const keeps = groups.map((g) => g.rows[0]);
  const exactlyRec = rec.length > 0 && rec.every((r) => macSelected.has(r.path))
    && !keeps.some((r) => macSelected.has(r.path));
  return exactlyRec ? 'all' : 'recommended';
}

function updateMacCatbar() {
  const sel = document.getElementById('mac-select-btn');
  if (!sel) return;
  const items = macItemsFor(activeMacCat);
  const next = macSelectNextAction();
  const rec = activeMacCat === 'dupe'
    ? macDupeGroups().reduce((s, g) => s + g.rows.length - 1, 0) : items.length;
  sel.textContent = next === 'recommended'
    ? `Select dupes — keep oldest (${rec.toLocaleString()})`
    : `Select all (${items.length.toLocaleString()})`;
  const clr = document.getElementById('mac-clear-btn');
  if (clr) clr.disabled = !items.some((r) => macSelected.has(r.path));
}

function updateMacSelbar() {
  // The selection count and the Trash verb both live in the shell's toolbar.
  refreshVerbs();
}

async function trashPaths(rawPaths) {
  // Archive copies live in the ledger, not mac-index — include them so a
  // backup file can be pruned too (the pipeline drops its ledger row, so
  // "backed up" never outlives the file).
  const byPath = new Map(macIndex.map((r) => [r.path, r]));
  const archived = new Map(archiveRows.map((r) => [r.dest, r]));
  const paths = rawPaths.filter((p) => byPath.has(p) || archived.has(p));
  if (!paths.length) return false;
  const fromArchive = paths.filter((p) => !byPath.has(p) && archived.has(p));
  const bytes = paths.reduce(
    (s, p) => s + (byPath.get(p)?.size || archived.get(p)?.size || 0), 0);
  const ok = await confirmDialog(
    `<b>${paths.length.toLocaleString()} file${paths.length === 1 ? '' : 's'} (${fmtGb(bytes)})</b>
     will be moved to the macOS Trash. You can restore them from the Trash anytime.
     ${fromArchive.length
       ? `<br><br>${fromArchive.length.toLocaleString()} of them
          ${fromArchive.length === 1 ? 'is a backup copy' : 'are backup copies'}
          of your iPhone photos — removing
          ${fromArchive.length === 1 ? 'it' : 'them'} means those photos count as
          <b>not backed up</b> again.`
       : ''}`, 'Move to Trash');
  if (!ok) return false;
  setBusy('Moving to Trash…');
  const sizes = Object.fromEntries(paths.map(
    (p) => [p, byPath.get(p)?.size || archived.get(p)?.size || 0]));
  await writeJsonFile('trash-selection.json', { paths, sizes });
  await media('trash');
  for (const p of paths) macSelected.delete(p);
  macGroupsCache = null;
  await Promise.all([loadMacIndex(), loadArchive()]);
  setBusy(null);
  refreshStatus();
  refreshBackupBadge();
  return true;
}

async function trashSelected() {
  if (await trashPaths([...macSelected])) renderMacReview();
}

function reindexMac() {
  media('start index');
  setBusy('Indexing…');
  const t = setInterval(async () => {
    if (screen !== 'review' || getSource() !== 'mac') { clearInterval(t); setBusy(null); return; }
    const p = await media('progress');
    if (p.op === 'index' && (p.status === 'done' || p.status === 'error')) {
      clearInterval(t);
      setBusy(null);
      macGroupsCache = null;
      macFolderExpanded.clear();
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

/** Make a ~/Pictures video reachable under the served data dir so <video> can
    play it in-page — a hard link (same inode, 0 extra bytes) rather than a copy
    or a symlink (403'd). Same-volume only; returns null so the caller falls
    back to the poster when the link can't be made (e.g. external drive). */
async function ensureMacVideo(r, path) {
  const ext = path.split('.').pop().toLowerCase();
  const key = `vid_${r.sha256.slice(0, 12)}.${ext}`;
  const res = await bash(
    `mkdir -p "${DATA_DIR}/previews"; rm -f ${DATA_DIR}/previews/vid_* 2>/dev/null; `
    + `ln ${shellEsc(path)} "${DATA_DIR}/previews/${key}" 2>&1 && echo LINKED`);
  return (res.stdout || res.output || '').includes('LINKED') ? PREVIEW_URL + key : null;
}

function showMacPoster(slot, r, path) {
  const poster = `../data/media/thumbs/${r.sha256.slice(0, 12)}.jpg`;
  slot.innerHTML = `<div class="lb-poster"><img src="${poster}" alt=""
      onerror="this.closest('.lb-poster').innerHTML='&lt;div class=media-dim&gt;No preview — use Reveal in Finder.&lt;/div&gt;'">
    <span class="lb-play">▶ open in Finder to play</span></div>`;
  slot.querySelector('.lb-poster')?.addEventListener('click', () => bash(`open -R ${shellEsc(path)}`));
}

/** Rows the Mac lightbox can navigate: archive copies first (as the pane
    renders them), then the organic index rows of the active filter. */
function macLightboxRows() {
  const organic = macItemsFor(activeMacCat);
  if (activeMacCat !== 'all') return organic;
  const arch = [...archiveFolders().entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .flatMap(([, rows]) => rows.map((r) => ({ path: r.dest, sha256: r.sha256, size: r.size || 0, archive: true })));
  return arch.concat(organic);
}

async function openMacLightbox(path) {
  const rows = macLightboxRows();
  const r = rows.find((x) => x.path === path);
  if (!r) return;
  closeLightbox();
  lbOrder = rows.map((x) => x.path);
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
  box.onclick = (e) => {
    const t = e.target;
    if (t === box || t.classList?.contains('lb-body') || t.classList?.contains('lb-media')) {
      closeLightbox();
    }
  };
  document.body.appendChild(box);
  document.addEventListener('keydown', macLightboxKey);
  document.getElementById('lb-close').onclick = closeLightbox;
  document.getElementById('lb-prev').onclick = () => openMacLightbox(lbOrder[lbIdx - 1]);
  document.getElementById('lb-next').onclick = () => openMacLightbox(lbOrder[lbIdx + 1]);
  document.getElementById('lb-open').onclick = () => bash(`open -R ${shellEsc(path)}`);
  // Archive copies can be trashed too — the confirm says what that costs,
  // macOS Trash keeps them recoverable, and the ledger row goes with them.
  const delBtn = document.getElementById('lb-mark');
  delBtn.textContent = '🗑 Delete';
  delBtn.title = r.archive
    ? 'Move this backup copy to the macOS Trash'
    : 'Move this file to the macOS Trash';
  delBtn.onclick = async () => {
    if (await trashPaths([path])) {
      closeLightbox();
      if (screen === 'review' && getSource() === 'mac') renderMacReview();
    }
  };
  const slot = box.querySelector('.lb-media');
  if (VIDEO_RE.test(path)) {
    // hard-link ~/Pictures video into the served dir so it plays in-page;
    // fall back to the poster frame if the link can't be made or won't decode
    const url = await ensureMacVideo(r, path);
    if (url) {
      slot.innerHTML = `<video controls autoplay src="${url}"></video>`;
      slot.querySelector('video').onerror = () => showMacPoster(slot, r, path);
    } else {
      showMacPoster(slot, r, path);
    }
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
  const archived = archiveShas.has(it.sha256);
  const probably = activeCat === 'on_mac' && !it.flags.includes('on_mac') && !archived;
  const queued = isQueued(it);
  // Same vocabulary as the phone: backed up = an archive copy exists;
  // synced = the phone mirrored it here but it isn't archived yet.
  const wireless = (it.phone_path || '').startsWith('wireless/');
  const tag = queued ? '<span class="tag queued" title="Deletes on the iPhone when Linggen opens there">⏳ queued</span>'
    : activeCat === 'dupe' ? '<span class="tag keep-tag">★ KEEP</span>'
    : probably ? '<span class="tag cut">probably</span>'
    : archived ? '<span class="tag">backed up</span>'
    : activeCat === 'on_mac' ? '<span class="tag">on Mac ✓</span>'
    : wireless ? '<span class="tag synced">synced</span>' : '';
  return `<div class="media-thumb ${vid ? 'vid' : ''} ${kept ? 'kept' : ''} ${queued ? 'queued' : ''}" data-id="${it.id}">
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

function daysLeft(expires) {
  return Math.max(0, Math.ceil((new Date(expires) - Date.now()) / 86400000));
}

function removedThumbHtml(r) {
  const img = r.thumb ? `<img src="../data/media/thumbs/${r.thumb}" loading="lazy" alt=""
    onerror="this.remove()">` : '';
  // recovery target: trash (expiring) > restored > archive backup > gone
  const reveal = r.trash || r.restored || r.backup || '';
  const badge = r.trash ? `<span class="score">⏳ ${daysLeft(r.expires)}d</span>`
    : r.restored ? `<span class="score">↩︎ restored</span>`
    : r.backup ? `<span class="score">💾</span>`
    : `<span class="score">gone</span>`;
  const restoreBtn = r.trash
    ? `<button class="zoom" data-sha="${esc(r.sha256 || '')}" title="Restore to ~/Pictures/iPhone Restored">↩︎</button>` : '';
  const title = reveal ? `${esc(r.name)} — reveal in Finder` : `${esc(r.name)} — no copy left (expired)`;
  return `<div class="media-thumb ${reveal ? '' : 'dim'}" data-reveal="${esc(reveal)}" title="${title}">
    ${img}${restoreBtn}${badge}</div>`;
}

function renderRemovedPane(pane) {
  if (!removals.length) {
    pane.innerHTML = `<div class="media-dim">Nothing removed yet. Deleted items land here and stay
      recoverable on this Mac for 30 days; backed-up items are linked to their archive copies.</div>`;
    return;
  }
  const trashRows = removals.filter((r) => r.trash);
  const trashBytes = trashRows.reduce((s, r) => s + (r.size || 0), 0);
  const purgeBar = trashRows.length ? `
    <div class="catbar"><span class="media-dim">${trashRows.length} recoverable items ·
      ${fmtGb(trashBytes)} reclaimable on this Mac (auto-purged after 30 days)</span>
      <button class="media-cta ghost sm" id="purge-all-btn">Purge all now</button></div>` : '';
  const days = {};
  for (const r of removals) (days[(r.at || '').slice(0, 10)] ||= []).push(r);
  pane.innerHTML = `<div class="media-dim" style="margin-bottom:8px">⏳ deleted — restorable for 30 days ·
      💾 backed up — archive copy never expires. Click to reveal in Finder, ↩︎ to restore.
      Restore-to-iPhone arrives with the Linggen mobile app (AirDrop the file back meanwhile).</div>`
    + purgeBar
    + Object.entries(days).sort((a, b) => b[0].localeCompare(a[0])).map(([day, rows]) => `
      <div class="media-group"><div class="glabel">${day} · ${rows.length} removed ·
        ${fmtGb(rows.reduce((s, r) => s + (r.size || 0), 0))}</div>
      <div class="thumbrow">${rows.map(removedThumbHtml).join('')}</div></div>`).join('');
  for (const t of pane.querySelectorAll('.media-thumb')) {
    t.onclick = (e) => {
      if (e.target.classList.contains('zoom')) return;
      if (t.dataset.reveal) bash(`open -R "${t.dataset.reveal}"`);
    };
  }
  for (const b of pane.querySelectorAll('.media-thumb .zoom[data-sha]')) {
    b.onclick = async () => {
      const r = await media(`restore ${b.dataset.sha}`);
      await loadRemovals();
      renderCategoryPane();
    };
  }
  const purgeBtn = document.getElementById('purge-all-btn');
  if (purgeBtn) purgeBtn.onclick = async () => {
    const ok = await confirmDialog(
      `<b>Purge ${trashRows.length} recoverable items (${fmtGb(trashBytes)})?</b>
       <div class="media-dim" style="margin-top:6px">They can no longer be restored afterwards.</div>`,
      'Purge now');
    if (!ok) return;
    const r = await media('purge all');
    await loadRemovals();
    renderCategoryPane();
    refreshStatus();
  };
}

function renderCategoryPane() {
  const pane = document.getElementById('cat-pane');
  if (activeCat === 'removed') return renderRemovedPane(pane);
  const items = itemsFor(activeCat);
  let html = '';

  const hint = activeCat === 'all'
    ? 'suggested = duplicates (best kept), blurry, dark, exact copies on Mac · check months below for a time range'
    : activeCat === 'not_backed' ? 'no archive copy yet — check what you want, then Backup (top)'
    : activeCat === 'dupe' ? 'unchecked = kept on phone'
    : activeCat === 'on_mac' ? 'verified Mac copies (backup or ~/Pictures) are safe to remove from the phone'
    : activeCat === 'queued' ? 'the iPhone deletes these next time Linggen opens there — still cancellable'
    : 'checks follow you across filters — Remove (top) takes everything checked';
  html += `<div class="catbar">
    <button class="media-cta ghost sm" id="cat-select-btn"></button>
    <button class="media-cta ghost sm" id="cat-clear-btn">Clear</button>
    ${activeCat === 'queued'
      ? '<button class="media-cta ghost sm" id="unqueue-all-btn">Unqueue all</button>' : ''}
    <span class="media-dim">${hint}</span></div>`;

  if (activeCat === 'blurry') {
    html += `<div class="sliderrow">Blur sensitivity
      <input type="range" min="5" max="80" value="${blurThreshold}" id="blur-range">
      <output>${items.length} flagged</output></div>`;
  }
  if (activeCat === 'on_mac') {
    html += `<div class="media-dim" style="margin-bottom:8px"><b>A verified copy of these exists on this Mac</b> — 💾 from a backup run, ✓ found in ~/Pictures (byte-identical, pre-checked). Visual-only matches show as “probably” and are never pre-checked.</div>`;
  }
  if (activeCat === 'screenshot') {
    html += `<div class="media-dim" style="margin-bottom:8px">Screenshots default to unchecked — opt in per item, or
      <button class="media-cta ghost" style="margin:0;padding:3px 10px;font-size:11.5px" id="old-shots-btn">select older than 6 months</button></div>`;
  }

  if (activeCat === 'not_backed') {
    html += `<div class="media-dim" style="margin-bottom:8px"><b>These have no verified archive copy yet</b> —
      Backup (top) copies them and skips everything already archived. Back up before removing anything
      that lives only on the phone.</div>`;
  }

  if (ROLL_CATS.has(activeCat)) {
    if (!roll.length) {
      html += `<div class="media-dim">Loading the camera roll…</div>`;
    } else if (!items.length) {
      html += `<div class="media-dim">Nothing here — every item has a verified backup copy.</div>`;
    } else {
      const months = new Map();
      for (const it of items) {
        const key = monthKey(it);
        if (!months.has(key)) months.set(key, []);
        months.get(key).push(it);
      }
      html += [...months.entries()].map(([month, mItems]) => {
        const open = allExpanded.has(month);
        const shown = open ? mItems : mItems.slice(0, FOLDER_PREVIEW);
        const more = mItems.length - shown.length;
        const allSel = mItems.every((it) => selected.has(it.id));
        return `<div class="media-group"><label class="glabel">
            <input type="checkbox" class="month-sel" data-month="${month}" ${allSel ? 'checked' : ''}>
            ${month} · ${mItems.length.toLocaleString()} ·
            ${fmtGb(mItems.reduce((s, it) => s + it.size, 0))}</label>
          <div class="thumbrow">${shown.map((it) => thumbHtml(it, selected.has(it.id))).join('')}
          ${more > 0 ? `<button class="media-cta ghost sm show-more" data-month="${month}">+${more.toLocaleString()} more…</button>` : ''}</div></div>`;
      }).join('');
    }
  } else if (activeCat === 'dupe') {
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
      const mBox = thumbEl.closest('.media-group')?.querySelector('.month-sel');
      if (mBox) mBox.checked = monthItems(mBox.dataset.month).every((x) => selected.has(x.id));
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
  for (const btn of pane.querySelectorAll('.show-more[data-month]')) {
    btn.onclick = () => { allExpanded.add(btn.dataset.month); renderCategoryPane(); };
  }
  for (const box of pane.querySelectorAll('.month-sel')) {
    box.onchange = () => {
      for (const it of monthItems(box.dataset.month)) {
        if (box.checked) selected.add(it.id); else selected.delete(it.id);
      }
      renderCategoryPane();
      updateSelbar();
    };
  }
  document.getElementById('cat-select-btn').onclick = () => {
    const next = catSelectNextAction();  // 'suggested' | 'recommended' | 'all'
    if (next === 'suggested') {
      for (const id of suggestedIds()) selected.add(id);
    } else {
      for (const it of catItems(activeCat)) {
        // 'recommended' skips the dupe keep (dedup); 'all' includes it
        if (next === 'recommended' && isKeep(it.id)) selected.delete(it.id);
        else selected.add(it.id);
      }
    }
    renderCategoryPane();
    updateSelbar();
  };
  document.getElementById('cat-clear-btn').onclick = () => {
    for (const it of catItems(activeCat)) selected.delete(it.id);
    renderCategoryPane();
    updateSelbar();
  };
  const unqueueAll = document.getElementById('unqueue-all-btn');
  if (unqueueAll) {
    unqueueAll.onclick = async () => {
      unqueueAll.disabled = true;
      const t = showToast('Cancelling queued deletions…', true);
      try {
        await setQueued([...pendingDeletes], true);
        activeCat = 'all';
        renderReview();
        t.done('✓ Queue cleared — nothing pending on the iPhone');
      } catch (e) {
        unqueueAll.disabled = false;
        t.done(`✕ Couldn't clear the queue — ${e.message || e}`);
      }
    };
  }
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

/** What the primary select button does NEXT. All = Select suggested (there is
    deliberately NO whole-roll select-all); Duplicates toggles recommended
    (keeps excluded) ↔ all; other filters = scoped Select all. Clear is its
    own button. */
function catSelectNextAction() {
  if (activeCat === 'all') return 'suggested';
  if (activeCat !== 'dupe') return 'all';
  const items = catItems('dupe');
  const rec = items.filter((it) => !isKeep(it.id));
  const exactlyRec = rec.length > 0 && rec.every((it) => selected.has(it.id))
    && !items.some((it) => isKeep(it.id) && selected.has(it.id));
  return exactlyRec ? 'all' : 'recommended';
}

function updateCatbar() {
  const sel = document.getElementById('cat-select-btn');
  if (!sel) return;
  const next = catSelectNextAction();
  if (next === 'suggested') {
    sel.textContent = `Select suggested (${suggestedIds().size.toLocaleString()})`;
  } else {
    const items = catItems(activeCat);
    const recommended = items.filter((it) => !(activeCat === 'dupe' && isKeep(it.id))).length;
    sel.textContent = next === 'all' ? `Select all (${items.length.toLocaleString()})`
      : `Select recommended (${recommended.toLocaleString()})`;
  }
  const clr = document.getElementById('cat-clear-btn');
  if (clr) clr.disabled = !catSelection().size;
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

/** Cleanup delete: every removal is recoverable — the staged copy moves to
    the 30-day restore area. Resolves true or null on cancel. */
function confirmRemoveDialog(ids) {
  const byId = allById();
  const bytes = [...ids].reduce((s, id) => s + (byId.get(id)?.size || 0), 0);
  const n = ids.size.toLocaleString();
  const arch = [...ids].filter((id) => archiveShas.has(byId.get(id)?.sha256)).length;
  const rest = ids.size - arch;
  const recovery = arch && !rest
    ? 'All of these have verified backup copies on this Mac — recoverable from the archive anytime.'
    : arch
      ? `${arch.toLocaleString()} have backup copies (recoverable anytime) · ${rest.toLocaleString()} go to the 30-day restore area.`
      : 'Recoverable on this Mac for 30 days — restore anytime from the Removed tab.';
  const ghostNote = 'Note: USB removal deletes the files only — the Photos app keeps cached entries until you clear them on the iPhone (delete in Photos, then empty Recently Deleted). Deleting directly in the Photos app is the cleaner way when practical — and once the Linggen mobile app ships, removal here becomes fully clean in one step.';
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'media-lightbox';
    box.innerHTML = `
      <div class="media-confirm">
        <div><b>Remove ${n} item${ids.size === 1 ? '' : 's'} (${fmtGb(bytes)}) from the iPhone?</b></div>
        <div class="media-dim" style="margin-top:6px">${recovery}</div>
        <div class="media-dim" style="margin-top:4px">${ghostNote}</div>
        <div class="row">
          <button class="media-cta ghost sm" id="cf-no">Cancel</button>
          <button class="media-cta sm danger" id="cf-yes">Remove ${n}</button>
        </div>
      </div>`;
    const done = (v) => { box.remove(); resolve(v); };
    box.onclick = (e) => { if (e.target === box) done(null); };
    box.querySelector('#cf-no').onclick = () => done(null);
    box.querySelector('#cf-yes').onclick = () => done(true);
    document.body.appendChild(box);
  });
}

/** Archive `targets` to long-term storage — copy-only, never touches the
    phone (removal is its own verb). Resolves {dest} or null. */
async function confirmBackupDialog(targets) {
  const bytes = targets.reduce((s, it) => s + it.size, 0);
  const scope = selected.size ? 'Checked items not backed up yet' : 'Everything not backed up yet';
  let volumes = await media('volumes');
  if (!Array.isArray(volumes)) volumes = [];
  const saved = (await media('get-dest')).dest || '';
  const destOpts = [{ v: '', label: 'This Mac — ~/Pictures/iPhone Backup' }]
    .concat(volumes.map((v) => ({ v: `/Volumes/${v}/iPhone Backup`, label: `${v} (external) — iPhone Backup` })));
  if (saved && !destOpts.some((o) => o.v === saved)) destOpts.push({ v: saved, label: abbrevPath(saved) });
  destOpts.push({ v: '__choose__', label: '📁 Choose folder…' });
  const opts = destOpts.map((o) =>
    `<option value="${esc(o.v)}"${o.v === saved ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'media-lightbox';
    box.innerHTML = `
      <div class="media-confirm">
        <div><b>Back up ${targets.length.toLocaleString()} item${targets.length === 1 ? '' : 's'} · ${fmtGb(bytes)}</b></div>
        <div class="media-dim" style="margin-top:6px">
          ${scope} — already-archived items are skipped. Copies are sorted by year/month and
          re-hash verified, never expire, and nothing is deleted from the iPhone.
        </div>
        <label class="media-dim" style="display:block;margin-top:12px">Destination
          <select id="cf-dest" style="display:block;width:100%;margin-top:4px">${opts}</select></label>
        <div class="row">
          <button class="media-cta ghost sm" id="cf-no">Cancel</button>
          <button class="media-cta sm" id="cf-yes">Back up ${targets.length.toLocaleString()}</button>
        </div>
      </div>`;
    const destSel = box.querySelector('#cf-dest');
    destSel.dataset.prev = saved;
    // "Choose folder…" opens the native macOS picker and pins the result
    destSel.onchange = async () => {
      if (destSel.value !== '__choose__') { destSel.dataset.prev = destSel.value; return; }
      const r = await media('choose-dest');
      if (r && r.path) {
        let opt = [...destSel.options].find((o) => o.value === r.path);
        if (!opt) {
          opt = new Option(abbrevPath(r.path), r.path);
          destSel.add(opt, destSel.querySelector('option[value="__choose__"]'));
        }
        destSel.value = r.path;
        destSel.dataset.prev = r.path;
      } else {
        destSel.value = destSel.dataset.prev || '';  // cancel → revert
      }
    };
    const done = (v) => { box.remove(); resolve(v); };
    box.onclick = (e) => { if (e.target === box) done(null); };
    box.querySelector('#cf-no').onclick = () => done(null);
    box.querySelector('#cf-yes').onclick = () => {
      const dest = destSel.value === '__choose__' ? (destSel.dataset.prev || '') : destSel.value;
      media(`set-dest ${dest ? shellEsc(dest) : "''"}`);  // remember as the default
      done({ dest });
    };
    document.body.appendChild(box);
  });
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
  const it = flags.items.find((x) => x.id === id) || roll.find((x) => x.id === id);
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
        ${isQueued(it) ? '<span class="lb-queued">⏳ deletes on iPhone when Linggen opens there</span>' : ''}
        ${isKeep(it.id) ? '<span class="lb-keep">★ KEEP — recommended</span>' : ''}
        <button class="media-cta sm" id="lb-mark"></button>
        <button class="media-cta ghost sm" id="lb-open">Open on Mac</button>
        <button class="media-cta ghost sm" id="lb-close">✕ Close</button></div></div>
    <button class="lb-nav" id="lb-next" aria-label="Next" ${lbIdx < lbOrder.length - 1 ? '' : 'disabled'}>›</button>`;
  box.onclick = (e) => {
    const t = e.target;
    if (t === box || t.classList?.contains('lb-body') || t.classList?.contains('lb-media')) {
      closeLightbox();
    }
  };
  document.body.appendChild(box);
  document.addEventListener('keydown', lightboxKey);
  document.getElementById('lb-close').onclick = closeLightbox;
  document.getElementById('lb-prev').onclick = () => openLightbox(lbOrder[lbIdx - 1]);
  document.getElementById('lb-next').onclick = () => openLightbox(lbOrder[lbIdx + 1]);
  document.getElementById('lb-open').onclick = () =>
    bash(`open "${DATA_DIR}/staging/${it.staged}"`);
  const delBtn = document.getElementById('lb-mark');
  if (isQueued(it)) {
    // Queued is cancellable intent — the button flips to the undo.
    delBtn.textContent = 'Unqueue';
    delBtn.classList.add('ghost');
    delBtn.title = 'Cancel the pending iPhone deletion';
    delBtn.onclick = async () => {
      try {
        await setQueued([it.phone_path.slice(9)], true);
        renderReview();
        openLightbox(it.id);
      } catch { /* daemon unreachable — leave queued */ }
    };
  } else {
    delBtn.textContent = '🗑 Delete';
    delBtn.title = 'Remove this item from the iPhone (recoverable for 30 days)';
    delBtn.onclick = () => deleteInLightbox(it.id);
  }
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

/** Sync, in place — no screen change. A paired phone pushes its own photos,
    so the Mac's half of "sync" is re-running the analyzers over what is
    staged and reloading the review. With a cable attached it still does the
    full walk (index → pull → scan); without one it skips straight to scan. */
async function syncNow() {
  const usb = statusCache.info?.connected;
  const t = showToast(usb ? 'Syncing over USB…' : 'Refreshing from your Mac…', true);
  await media(usb ? 'start scan-all' : 'start scan');
  stopPolling();
  await new Promise((resolve) => {
    const poll = async () => {
      const p = await media('progress');
      if (p.total) t.update(`${p.phase || 'Working'} ${(p.done || 0).toLocaleString()}/${p.total.toLocaleString()}…`);
      if (p.status === 'done' || p.status === 'error') { stopPolling(); resolve(p); }
    };
    poll();
    pollTimer = setInterval(poll, 1000);
  });
  const p = await media('progress');
  flags = await media('flags');
  await Promise.all([loadRoll(), loadRemovals(), loadArchive(), loadPendingDeletes()]);
  refreshBackupBadge();
  pruneSelected();
  if (screen === 'review') renderReview();
  refreshStatus();
  pollTimer = setInterval(refreshStatus, 15000);
  if (p.status === 'error') {
    t.done(`✕ Sync failed — ${p.error || 'see logs'}`);
    return;
  }
  t.done(usb
    ? `✓ Synced · ${roll.length.toLocaleString()} items`
    : `✓ Up to date · ${roll.length.toLocaleString()} items · open Linggen on the phone to send new ones`);
}

/** Inline single-item delete (iOS-Photos style): remove now, advance to the
    next photo. No confirm — recoverable for 30 days from the Removed tab. */
async function deleteInLightbox(id) {
  const cap = document.querySelector('#media-lightbox .lb-cap');
  const delBtn = document.getElementById('lb-mark');
  if (!cap || !delBtn) return;
  // Wireless-synced photo → queue for on-phone PhotoKit deletion (no AFC).
  // Re-open the same photo so the caption shows the queued state + Unqueue.
  const it = allById().get(id);
  if (it?.phone_path?.startsWith('wireless/')) {
    try {
      await setQueued([it.phone_path.slice(9)]);
      renderReview();
      openLightbox(id);
    } catch (e) {
      cap.insertAdjacentHTML('afterbegin', `<span class="media-chip bad">${esc(`queue failed — ${e.message || e}`)}</span> `);
    }
    return;
  }
  delBtn.disabled = true;
  delBtn.textContent = 'Removing…';
  const res = await media(`remove-one ${id}`);
  if (!res || !res.removed) {
    delBtn.disabled = false;
    delBtn.textContent = '🗑 Delete';
    const msg = res?.icloud_suspected ? 'iCloud Photos blocks USB deletion'
      : (res?.error_samples?.[0] || res?.error || 'iPhone not connected');
    cap.insertAdjacentHTML('afterbegin', `<span class="media-chip bad">${esc(msg)}</span> `);
    return;
  }
  // step to the next surviving photo; reload flags from disk (the remove leg
  // already pruned items+groups there) so the grid behind the lightbox updates
  const nextId = lbOrder[lbIdx + 1] ?? lbOrder[lbIdx - 1] ?? null;
  flags = await media('flags');
  await loadRoll();
  refreshBackupBadge();
  selected.delete(id);
  pruneSelected();
  await loadRemovals();
  renderReview();
  refreshStatus();
  if (nextId && allById().has(nextId)) openLightbox(nextId);
  else closeLightbox();
}

/** Keep the working selection honest: drop ids no longer in flags (removed or
    pruned) so bulk-remove counts and the selbar total never inflate. */
function pruneSelected() {
  const live = new Set([...flags.items, ...roll].map((i) => i.id));
  selected = new Set([...selected].filter((id) => live.has(id)));
}

/** Bulk trash-remove, inline — no apply screen, no report card. Shows a
    progress toast, refreshes the grid in place, then a result toast. */
async function removeInline(ids) {
  // Wireless-synced items can't be touched over AFC — queue them for the
  // phone to delete via PhotoKit (its system confirm is the gate); the cache
  // row stays until reconcile sees the photo gone. USB items keep the
  // pipeline's trash path.
  const byId = allById();
  const wireless = [];
  const rest = new Set();
  for (const id of ids) {
    const it = byId.get(id);
    if (it?.phone_path?.startsWith('wireless/')) wireless.push(it.phone_path.slice(9));
    else rest.add(id);
  }
  if (wireless.length) {
    const t = showToast('Queueing phone deletions…', true);
    try {
      await setQueued(wireless);
      t.done(`⏳ ${wireless.length.toLocaleString()} queued — the iPhone deletes them next time Linggen is open there`);
      for (const id of ids) if (!rest.has(id)) selected.delete(id);
      if (screen === 'review' && getSource() === 'phone') renderReview();
    } catch (e) {
      t.done(`✕ Couldn't queue phone deletions — ${e.message || e}`);
    }
  }
  if (!rest.size) return;
  ids = rest;
  const n = ids.size;
  await writeSelection(ids);
  await media('start remove-trash');
  const toast = showToast(`Removing ${n.toLocaleString()}…`, true);
  stopPolling();
  await new Promise((resolve) => {
    const poll = async () => {
      const p = await media('progress');
      if (p.op === 'remove' && p.total) toast.update(`Removing ${(p.done || 0)}/${p.total}…`);
      if (p.status === 'done' || p.status === 'error') { stopPolling(); resolve(); }
    };
    poll();
    pollTimer = setInterval(poll, 1000);
  });
  const r = await media('remove-result');
  flags = await media('flags');
  await loadRoll();
  pruneSelected();
  refreshBackupBadge();
  await loadRemovals();
  if (screen === 'review' && getSource() === 'phone') renderReview();
  refreshStatus();
  const removed = r?.removed ?? 0;
  const freed = r?.freed_gb ? ` · freed ${r.freed_gb} GB` : '';
  const errs = r?.errors ? ` · ${r.errors} couldn't be deleted` : '';
  const icloud = r?.icloud_suspected ? ' · iCloud Photos blocks USB deletion' : '';
  toast.done(`✓ Removed ${removed.toLocaleString()}${freed} · recoverable 30 days${errs}${icloud}`);
}

/** Archive `targets` to Mac/external — inline progress toast, copy-only
    (never touches the phone). Long-running but non-blocking. */
async function backupInline(targets, dest) {
  const freeBefore = statusCache.info?.mac_free_gb;
  await writeSelection(new Set(targets.map((it) => it.id)), 'backup-selection.json');
  await media(`start backup ${dest ? shellEsc(dest) : '-'}`);
  const toast = showToast(`Backing up ${targets.length.toLocaleString()}…`, true);
  stopPolling();
  await new Promise((resolve) => {
    const poll = async () => {
      const p = await media('progress');
      if (p.op === 'backup' && p.total) toast.update(`Backing up ${(p.done || 0).toLocaleString()}/${p.total.toLocaleString()}…`);
      if (p.status === 'done' || p.status === 'error') { stopPolling(); resolve(); }
    };
    poll();
    pollTimer = setInterval(poll, 1000);
  });
  const p = await media('progress');
  refreshStatus();
  if (p.status === 'error') {
    toast.done(`✕ Backup failed — ${p.error || 'see logs'}`);
    notify(`Backup FAILED: ${p.error || 'unknown error'}. Tell the user in one sentence.`);
    return;
  }
  const failed = p.failed ? ` · ${p.failed} failed` : '';
  await loadArchive();
  refreshBackupBadge();
  if (screen === 'review' && getSource() === 'phone') renderReview();
  toast.done(`✓ Backed up ${(p.verified ?? 0).toLocaleString()} to ${p.dest || 'Mac'}${failed}`, {
    label: 'Free up phone →',
    fn: () => {
      // Land on the PHONE review even if the user wandered to the Mac pane
      // while the backup ran — renderReview() defers to renderMacReview()
      // when the source is 'mac', which made this whole action look like a no-op.
      setSource('phone');
      activeCat = 'on_mac';
      // select only verified copies (archive or byte-identical) — never "probably"
      for (const it of itemsFor('on_mac')) {
        if (archiveShas.has(it.sha256) || it.flags.includes('on_mac')) selected.add(it.id);
      }
      if (screen !== 'review') return;
      renderReview();
      window.scrollTo(0, 0);
      // say what the jump did — the fixed-label buttons no longer announce it
      if (selected.size) {
        flashToast(`${selected.size.toLocaleString()} checked — Remove frees them from the iPhone`);
      }
    },
  });
  const info = await media('info');
  const freeLine = freeBefore != null && info?.mac_free_gb != null
    ? ` Mac free space ${freeBefore} → ${info.mac_free_gb} GB.` : '';
  notify(`Backup finished: ${(p.verified ?? 0).toLocaleString()} files copied to ${p.dest || '~/Pictures/iPhone Backup'} and re-hash verified${p.failed ? `, ${p.failed} FAILED verification (their originals stay on the phone)` : ''}.${freeLine} Backups never expire. Report this to the user in 1-2 sentences.`);
}

/** One-shot toast for an instant result — no progress phase, fades itself. */
function flashToast(msg) {
  const t = showToast(msg);
  t.done(msg);
  return t;
}

/** Lightweight bottom toast. Returns {update, done, close}. `done` swaps to a
    final message and auto-dismisses; pass an {label, fn} action to keep the
    toast up with a button (e.g. "Free up phone" after a backup). */
function showToast(msg, spinner = false) {
  let el = document.getElementById('media-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'media-toast';
    el.className = 'media-toast';
    document.body.appendChild(el);
  }
  const render = (m, sp) => { el.innerHTML = `${sp ? '<span class="media-spin"></span>' : ''}<span>${esc(m)}</span>`; };
  render(msg, spinner);
  return {
    update: (m) => render(m, true),
    done: (m, action = null) => {
      render(m, false);
      if (action) {
        const btn = document.createElement('button');
        btn.className = 'media-cta sm';
        btn.style.margin = '0 0 0 10px';
        btn.textContent = action.label;
        btn.onclick = () => { el.remove(); action.fn(); };
        el.appendChild(btn);
        setTimeout(() => el.remove(), 30000);
      } else {
        setTimeout(() => el.remove(), 4500);
      }
    },
    close: () => el.remove(),
  };
}

/** True if another pre-checked category (not `cat`) still claims this item. */
function heldByOtherCat(it, cat) {
  return CATEGORIES.some((c) => c.precheck && c.key !== cat && it.flags.includes(c.key));
}

function updateSelbar() {
  // Selection count, Back up and Clean all live in the shell's toolbar now.
  // Both verbs keep FIXED labels — the counts live in the meta slot and the
  // confirm sheet, never in churning button text.
  refreshVerbs();
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

/** Remove reads selection.json, backup reads backup-selection.json — separate
    files so a removal can't rewrite a running backup's work-list. */
function writeSelection(ids, name = 'selection.json') {
  return writeJsonFile(name, { ids: [...ids] });
}

document.addEventListener('DOMContentLoaded', initMediaTab);
