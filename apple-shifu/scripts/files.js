// Files tab — the Mac's own files: Downloads, large files, duplicates, caches.
//
// Everything here is the iframe's own work through `files.sh`; the agent
// narrates but never gates. No venv, so this tab works on a fresh install
// before the Media tools are ever set up.
//
// Two removal postures, and the difference is the point:
//   • Downloads, large files, duplicates -> the macOS Trash. Your data, so it
//     stays recoverable.
//   • Caches -> deleted outright, because a cache in the Trash frees nothing
//     until the Trash is emptied, and reporting "freed 12 GB" at that moment
//     would be false. Caches regenerate, so nothing is lost.
// files.sh refuses to purge anything outside a cache root, so that boundary
// is enforced where it cannot be argued with rather than in this file.

import {
  registerTab, getSource, onSourceChange, onTabChange, refreshVerbs,
} from './shifu-shell.js';
import {
  bash, writeLines, fmtBytes, esc, abbrevPath, relAge,
  confirmDialog, showToast, flashToast,
} from './shifu-io.js';

const FILES_SH = '$HOME/.linggen/skills/apple-shifu/scripts/files.sh';
const WORK_DIR = '$HOME/.linggen/skills/apple-shifu/data/files';
const LARGE_TARGET = 300;   // candidates to pull before the tiering stops
const RENDER_CAP = 200;     // rows drawn per category; selection covers all
const DUPE_HASH_CAP = 60;   // files hashed per pass — full SHA-256 is not free

/** The four piles, in the order they are shown. `trash` says which removal
    posture the pile gets; nothing else in this file branches on category. */
const CATEGORIES = [
  { key: 'downloads', label: 'Downloads', posture: 'trash' },
  { key: 'large', label: 'Large files', posture: 'trash' },
  { key: 'dupe', label: 'Duplicates', posture: 'trash' },
  { key: 'cache', label: 'Caches', posture: 'purge' },
];

let panel = null;
let activeCat = 'downloads';
let selected = new Set();          // absolute paths
let scanned = false;
let busyOp = null;
const rows = { downloads: [], large: [], cache: [] };
let dupeGroups = [];               // [{ sha, size, paths: [] }]
let dupesHashed = false;
/** Piles actually measured this pass. A chip reading "0" before its pile has
    been read would claim the pile is empty when nothing has looked yet. */
const measured = new Set();

// ── registration ──

export function initFilesTab() {
  panel = document.getElementById('files-panel');
  registerTab('files', filesProvider);
  onTabChange((name) => { if (name === 'files') render(); });
  onSourceChange(() => render());
}

const filesProvider = {
  panel: 'files-panel',
  verbs: (source) => {
    if (source === 'phone') return phoneVerbs();
    const actions = macVerbs();
    if (busyOp) for (const k of Object.keys(actions)) actions[k] = { blocked: busyOp };
    return actions;
  },
  meta: (source) => {
    if (busyOp) return `<span class="verb-busy">${esc(busyOp)}</span>`;
    if (source === 'phone' || !selected.size) return '';
    return `<b>${selected.size.toLocaleString()} selected · ${fmtBytes(selectedBytes())}</b>`;
  },
};

/** Under an iPhone this tab has nothing to act on — sending files off the
    phone needs the Files section in Linggen Mobile, which is not built. Every
    verb says so rather than pretending to be armed. */
function phoneVerbs() {
  const why = 'Files on the iPhone need the Files section in Linggen Mobile, which is not built yet';
  return { scan: { blocked: why }, report: { blocked: why }, backup: { blocked: why }, clean: { blocked: why } };
}

function macVerbs() {
  const cat = CATEGORIES.find((c) => c.key === activeCat);
  const purging = cat?.posture === 'purge';
  return {
    scan: { hint: 'Re-read Downloads, large files and caches', run: () => scan(true) },
    report: scanned
      ? { hint: 'Ask Ling what is safe to clear', run: reportFiles }
      : { blocked: 'Run a scan first — there is nothing to report on yet' },
    // Back up keeps its one meaning across the whole app: the iPhone's roll
    // onto this Mac. Mac files are not archived anywhere, and inventing a
    // second meaning here is exactly what the verb row exists to prevent.
    backup: { blocked: 'Back up archives the iPhone roll — Mac files are not archived, they go to the Trash' },
    clean: selected.size
      ? {
        label: purging ? 'Delete' : 'Trash',
        hint: purging
          ? `Delete ${selected.size.toLocaleString()} cache${selected.size === 1 ? '' : 's'} (${fmtBytes(selectedBytes())}) outright — caches regenerate`
          : `Move ${selected.size.toLocaleString()} item${selected.size === 1 ? '' : 's'} (${fmtBytes(selectedBytes())}) to the macOS Trash`,
        run: () => cleanSelected(cat),
      }
      : { label: purging ? 'Delete' : 'Trash', blocked: 'Check items to remove them' },
  };
}

function setBusy(op) {
  busyOp = op;
  refreshVerbs();
}

// ── scan ──

async function lines(cmd) {
  const res = await bash(`bash ${FILES_SH} ${cmd}`);
  return (res.stdout || '').trim().split('\n').filter(Boolean);
}

/** `size|atime|mtime|path` — path last, so a path containing '|' survives. */
function parseFileLine(line) {
  const p = [];
  let rest = line;
  for (let i = 0; i < 3; i += 1) {
    const at = rest.indexOf('|');
    if (at < 0) return null;
    p.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  const size = parseInt(p[0], 10);
  if (!rest || isNaN(size)) return null;
  return { path: rest, size, atime: parseInt(p[1], 10) || 0, mtime: parseInt(p[2], 10) || 0 };
}

/** `size|label|path` */
function parseCacheLine(line) {
  const a = line.indexOf('|');
  const b = line.indexOf('|', a + 1);
  if (a < 0 || b < 0) return null;
  const size = parseInt(line.slice(0, a), 10);
  const path = line.slice(b + 1);
  if (!path || isNaN(size)) return null;
  return { path, size, label: line.slice(a + 1, b), atime: 0, mtime: 0 };
}

async function scan(force = false) {
  if (scanned && !force) return;
  setBusy('Scanning…');
  measured.clear();
  dupesHashed = false;
  dupeGroups = [];
  const toast = showToast('Reading Downloads…', true);
  try {
    const dl = await lines('downloads');
    rows.downloads = dl.map(parseFileLine).filter(Boolean).sort((a, b) => b.size - a.size);
    measured.add('downloads');
    render();

    toast.update('Finding large files…');
    const lg = await lines(`large ${LARGE_TARGET}`);
    rows.large = lg.map(parseFileLine).filter(Boolean).sort((a, b) => b.size - a.size);
    measured.add('large');
    render();

    toast.update('Measuring caches…');
    const ch = await lines('caches');
    rows.cache = ch.map(parseCacheLine).filter(Boolean).sort((a, b) => b.size - a.size);
    measured.add('cache');

    scanned = true;
    pruneSelected();
    render();
    toast.done(`✓ ${rows.downloads.length + rows.large.length} files · ${rows.cache.length} caches`);
  } finally {
    setBusy(null);
  }
}

/**
 * Duplicates, hashed in full.
 *
 * Same size is only a candidate signal. The earlier deep scan compared the
 * first 4 KB, which is fine for a report and NOT fine for a list with a delete
 * button on it — two different large files can share a size and a first block.
 * Nothing reaches this list without a matching full SHA-256.
 */
async function findDuplicates() {
  const pool = [...rows.downloads, ...rows.large];
  const bySize = new Map();
  for (const f of pool) {
    if (!bySize.has(f.size)) bySize.set(f.size, []);
    bySize.get(f.size).push(f);
  }
  const seen = new Set();
  const candidates = [];
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    for (const f of group) {
      if (seen.has(f.path)) continue;   // Downloads and Large overlap
      seen.add(f.path);
      candidates.push(f);
    }
  }
  if (!candidates.length) { dupeGroups = []; dupesHashed = true; return; }

  const capped = candidates.slice(0, DUPE_HASH_CAP);
  const dropped = candidates.length - capped.length;
  setBusy('Hashing…');
  const toast = showToast(`Hashing ${capped.length} same-size files…`, true);
  try {
    await writeLines(WORK_DIR, 'dupe-candidates.txt', capped.map((f) => f.path));
    const out = await lines(`sha "${WORK_DIR}/dupe-candidates.txt"`);
    const sizeByPath = new Map(capped.map((f) => [f.path, f.size]));
    const bySha = new Map();
    for (const line of out) {
      const at = line.indexOf('|');
      if (at < 0) continue;
      const sha = line.slice(0, at);
      const path = line.slice(at + 1);
      if (!bySha.has(sha)) bySha.set(sha, []);
      bySha.get(sha).push(path);
    }
    dupeGroups = [...bySha.entries()]
      .filter(([, paths]) => paths.length > 1)
      .map(([sha, paths]) => ({
        sha,
        size: sizeByPath.get(paths[0]) || 0,
        // Oldest first — the likely original, and the one left unchecked.
        paths: paths.sort((a, b) => (fileByPath(a)?.mtime || 0) - (fileByPath(b)?.mtime || 0)),
      }))
      .sort((a, b) => b.size * (b.paths.length - 1) - a.size * (a.paths.length - 1));
    dupesHashed = true;
    // Never let a cap pass silently as "that's all of them".
    toast.done(dropped
      ? `✓ ${dupeGroups.length} duplicate groups · ${dropped} more candidates not hashed this pass`
      : `✓ ${dupeGroups.length} duplicate groups`);
  } finally {
    setBusy(null);
  }
}

function fileByPath(p) {
  return rows.downloads.find((f) => f.path === p) || rows.large.find((f) => f.path === p);
}

function allRows() {
  return [...rows.downloads, ...rows.large, ...rows.cache];
}

function sizeOf(path) {
  const hit = allRows().find((f) => f.path === path);
  if (hit) return hit.size;
  for (const g of dupeGroups) if (g.paths.includes(path)) return g.size;
  return 0;
}

function selectedBytes() {
  let bytes = 0;
  for (const p of selected) bytes += sizeOf(p);
  return bytes;
}

function pruneSelected() {
  const live = new Set(allRows().map((f) => f.path));
  for (const g of dupeGroups) for (const p of g.paths) live.add(p);
  for (const p of [...selected]) if (!live.has(p)) selected.delete(p);
}

// ── remove ──

async function cleanSelected(cat) {
  const paths = [...selected];
  if (!paths.length) return;
  const bytes = selectedBytes();
  const purge = cat.posture === 'purge';
  const ok = await confirmDialog(
    purge
      ? `<b>${paths.length.toLocaleString()} cache${paths.length === 1 ? '' : 's'} (${fmtBytes(bytes)})</b>
         will be <b>deleted outright</b>, not moved to the Trash — a cache sitting in the Trash
         frees no space until you empty it. Apps rebuild these on next launch, so nothing of
         yours is lost, but this cannot be undone.`
      : `<b>${paths.length.toLocaleString()} item${paths.length === 1 ? '' : 's'} (${fmtBytes(bytes)})</b>
         will be moved to the macOS Trash. You can restore them from the Trash anytime — the
         space frees when you empty it.`,
    purge ? `Delete ${paths.length.toLocaleString()}` : `Move ${paths.length.toLocaleString()} to Trash`,
    purge);
  if (!ok) return;

  setBusy(purge ? 'Deleting…' : 'Moving to Trash…');
  const toast = showToast(purge ? 'Deleting…' : 'Moving to Trash…', true);
  try {
    await writeLines(WORK_DIR, 'remove-list.txt', paths);
    const res = await bash(`bash ${FILES_SH} ${purge ? 'purge' : 'trash'} "${WORK_DIR}/remove-list.txt"`);
    let r = {};
    try { r = JSON.parse(res.stdout || '{}'); } catch { /* reported below */ }
    // Reclaimed bytes come from the sizes this pane already showed, summed
    // over exactly the paths that went — not from a second measurement, which
    // would let the toast and the row disagree about the same file.
    const gone = await bash(`cat "${WORK_DIR}/remove-list.txt.done" 2>/dev/null || true`);
    const gonePaths = (gone.stdout || '').split('\n').filter(Boolean);
    const freed = gonePaths.reduce((s, p) => s + sizeOf(p), 0);
    const done = r.removed ?? r.trashed ?? gonePaths.length;
    const notes = [];
    if (r.failed) notes.push(`${r.failed} could not be removed`);
    // files.sh refuses non-cache paths; if that ever fires, say so out loud
    // rather than quietly reporting a smaller number.
    if (r.refused) notes.push(`${r.refused} refused — not inside a cache root`);
    for (const p of paths) selected.delete(p);
    await scan(true);
    toast.done(`✓ ${purge ? 'Deleted' : 'Trashed'} ${done.toLocaleString()} · ${fmtBytes(freed)}${
      notes.length ? ` · ${notes.join(' · ')}` : ''}${purge ? '' : ' — empty the Trash to reclaim it'}`);
  } finally {
    setBusy(null);
  }
}

function reportFiles() {
  const line = (c) => {
    const items = c.key === 'dupe' ? dupeGroups : rows[c.key] || [];
    const bytes = c.key === 'dupe'
      ? dupeGroups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0)
      : items.reduce((s, f) => s + f.size, 0);
    return `${c.label}: ${items.length} ${c.key === 'dupe' ? 'groups' : 'items'}, ${fmtBytes(bytes)}`;
  };
  const msg = `Write a short report on the files on this Mac — ${CATEGORIES.map(line).join('; ')}. `
    + 'Sort your advice by reclaimable bytes. Caches are deleted outright because they regenerate; '
    + 'everything else goes to the Trash and only frees space once it is emptied. Say that plainly.';
  if (window._chatSend) window._chatSend(msg);
}

// ── render ──

function itemsFor(key) {
  if (key === 'dupe') return dupeGroups.flatMap((g) => g.paths.slice(1));
  return (rows[key] || []).map((f) => f.path);
}

function bytesFor(key) {
  if (key === 'dupe') return dupeGroups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
  return (rows[key] || []).reduce((s, f) => s + f.size, 0);
}

function render() {
  if (!panel || getSource() !== 'mac') return renderPhone();
  // A scan fills the piles one at a time and redraws after each. Gate the
  // empty state on there being nothing to show, not on the scan having
  // finished — otherwise the panel reads "nothing scanned yet" while rows it
  // already has sit undrawn behind it.
  if (!allRows().length) {
    panel.innerHTML = `<div class="media-card dashed">
      <h4 class="media-dim">${busyOp ? 'Scanning…' : 'Nothing scanned yet'}</h4>
      <div class="media-dim">${busyOp
        ? 'Reading Downloads, the biggest files under your home folder, and app caches.'
        : 'Hit ↻ Scan above to read Downloads, the biggest files under your home folder, and the caches apps have left behind.'}</div></div>`;
    refreshVerbs();
    return;
  }

  const chips = CATEGORIES.map((c) => {
    // Unmeasured piles show a count of "…" rather than 0 — Duplicates until
    // they are hashed, the rest until the scan reaches them.
    const done = c.key === 'dupe' ? dupesHashed : measured.has(c.key);
    const n = c.key === 'dupe' ? dupeGroups.length : (rows[c.key] || []).length;
    const size = bytesFor(c.key);
    return `<button class="media-chip-f ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">
      <b>${done ? n.toLocaleString() : '…'}</b>${c.label}${done && size ? ` · ${fmtBytes(size)}` : ''}</button>`;
  }).join('');

  const cat = CATEGORIES.find((c) => c.key === activeCat);
  const posture = cat.posture === 'purge'
    ? 'caches are deleted outright — they regenerate, and one sitting in the Trash frees nothing'
    : 'checked items go to the macOS Trash — the space frees when you empty it';

  panel.innerHTML = `
    <div class="media-actionbar">
      <span class="abar-meta"><span class="media-dim">${posture}</span></span>
    </div>
    <div class="media-chips">${chips}</div>
    <div id="files-pane"></div>`;

  for (const chip of panel.querySelectorAll('.media-chip-f')) {
    chip.onclick = () => {
      activeCat = chip.dataset.cat;
      if (activeCat === 'dupe' && !dupesHashed) { findDuplicates().then(render); return; }
      render();
    };
  }
  renderPane();
  refreshVerbs();
}

function renderPhone() {
  panel.innerHTML = `<div class="media-card dashed">
    <h4 class="media-dim">📱 Nothing here yet</h4>
    <div class="media-dim">Files on the iPhone need the Files section in Linggen Mobile, and
      that isn't built yet. Most documents on an iPhone live inside other apps' sandboxes,
      where iOS grants no access at all — when this lands it will cover the folders you
      explicitly grant, plus Linggen's own storage.</div>
    <div class="media-dim">Switch to 💻 This Mac for Downloads, large files, duplicates and caches.</div>
  </div>`;
  refreshVerbs();
}

function renderPane() {
  const pane = document.getElementById('files-pane');
  if (!pane) return;
  const pool = itemsFor(activeCat);
  const bar = `<div class="catbar">
      <button class="media-cta ghost sm" id="files-select-btn"></button>
      <button class="media-cta ghost sm" id="files-clear-btn">Clear</button>
      <span class="media-dim">${activeCat === 'dupe'
        ? 'oldest copy of each group is left unchecked — it is the likely original'
        : 'sorted by size, biggest first'}</span></div>`;

  if (!pool.length) {
    pane.innerHTML = `${bar}<div class="media-dim">${
      activeCat === 'dupe'
        ? 'No duplicates among the files scanned — every same-size pair differed once hashed in full.'
        : 'Nothing in this pile.'}</div>`;
    wireBar(pool);
    return;
  }

  pane.innerHTML = bar + (activeCat === 'dupe' ? dupeHtml() : listHtml(activeCat));
  for (const el of pane.querySelectorAll('.file-row')) {
    el.onclick = (e) => {
      if (e.target.tagName === 'A') return;
      const p = el.dataset.path;
      if (selected.has(p)) selected.delete(p); else selected.add(p);
      renderPane();
      refreshVerbs();
    };
  }
  wireBar(pool);
}

function wireBar(pool) {
  const sel = document.getElementById('files-select-btn');
  const clr = document.getElementById('files-clear-btn');
  if (!sel || !clr) return;
  const allOn = pool.length > 0 && pool.every((p) => selected.has(p));
  sel.textContent = allOn ? 'Unselect all' : 'Select all';
  sel.disabled = !pool.length;
  sel.onclick = () => {
    for (const p of pool) if (allOn) selected.delete(p); else selected.add(p);
    renderPane();
    refreshVerbs();
  };
  clr.disabled = !selected.size;
  clr.onclick = () => { selected.clear(); renderPane(); refreshVerbs(); };
}

/** Directory dimmed and truncatable, name always whole. Truncating the tail
    would cut the very part that identifies the file, and a right-to-left
    ellipsis reorders the leading `~` ("~/.cache" drawn as "cache./~"). */
function rowHtml(path, size, meta) {
  const shown = abbrevPath(path);
  const cut = shown.lastIndexOf('/');
  const dir = cut >= 0 ? shown.slice(0, cut + 1) : '';
  const name = cut >= 0 ? shown.slice(cut + 1) : shown;
  return `<div class="file-row ${selected.has(path) ? 'on' : ''}" data-path="${esc(path)}">
    <span class="file-check">${selected.has(path) ? '☑' : '☐'}</span>
    <span class="file-size">${fmtBytes(size)}</span>
    <span class="file-path" title="${esc(path)}"><span class="file-dir">${esc(dir)}</span><span
      class="file-name">${esc(name)}</span></span>
    <span class="file-meta">${esc(meta)}</span></div>`;
}

function listHtml(key) {
  const list = (rows[key] || []).slice(0, RENDER_CAP);
  const more = (rows[key] || []).length - list.length;
  const meta = (f) => (key === 'cache' ? f.label : `last opened ${relAge(f.atime) || '?'} ago`);
  return list.map((f) => rowHtml(f.path, f.size, meta(f))).join('')
    + (more > 0 ? `<div class="media-dim">+${more.toLocaleString()} more not drawn — Select all still covers them.</div>` : '');
}

function dupeHtml() {
  return dupeGroups.map((g) => `
    <div class="media-group">
      <div class="glabel">${g.paths.length} copies · ${fmtBytes(g.size)} each ·
        ${fmtBytes(g.size * (g.paths.length - 1))} reclaimable · verified by full SHA-256</div>
      ${g.paths.map((p, i) => rowHtml(p, g.size, i === 0 ? 'oldest — likely the original' : ''))
    .join('')}
    </div>`).join('');
}

document.addEventListener('DOMContentLoaded', initFilesTab);
