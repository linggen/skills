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
  registerTab, getSource, getActiveTab, onSourceChange, onTabChange, refreshVerbs, openMenu,
} from './shifu-shell.js';
import {
  bash, writeLines, fmtBytes, esc, abbrevPath, relAge, shellEsc, shellPath,
  confirmDialog, showToast, copyText,
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
/** Jobs running now, token -> { kind: 'scan' | 'hash' | 'remove', label }.
    Removals can overlap (each row's ⋯ starts its own); a scan or a hash
    cannot run beside anything, or it would redraw rows that are going. */
const ops = new Map();
const removing = new Set();        // paths whose removal is in flight
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
  // A page reopened on this tab switched to it before this module listened,
  // which left the panel blank. Draw now if it is already the one showing.
  if (getActiveTab() === 'files') render();
}

const filesProvider = {
  panel: 'files-panel',
  verbs: (source) => {
    if (source === 'phone') return phoneVerbs();
    const actions = macVerbs();
    const busy = busyLabel();
    if (busy) for (const k of Object.keys(actions)) actions[k] = { blocked: busy };
    return actions;
  },
  meta: (source) => {
    const busy = busyLabel();
    if (busy) return `<span class="verb-busy">${esc(busy)}</span>`;
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
        run: () => removePaths([...selected], cat),
      }
      : { label: purging ? 'Delete' : 'Trash', blocked: 'Check items to remove them' },
  };
}

function beginOp(kind, label) {
  const token = Symbol(kind);
  ops.set(token, { kind, label });
  refreshVerbs();
  return token;
}

function endOp(token) {
  ops.delete(token);
  refreshVerbs();
}

function busyLabel() {
  let label = null;
  for (const op of ops.values()) label = op.label;
  return label;
}

/** Why a removal cannot start right now, or null when it can. */
function removalBlocked() {
  for (const op of ops.values()) {
    if (op.kind !== 'remove') return 'Wait for the scan to finish';
  }
  return null;
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
  const op = beginOp('scan', 'Scanning…');
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
    endOp(op);
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
  const op = beginOp('hash', 'Hashing…');
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
    endOp(op);
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

// ── tags ──
//
// Every row answers "is this safe?" before anyone has to ask, in the same
// three words the System tab's Cleanup card uses. The page sets the tag from
// where the file sits, never from the agent, so a file reads the same way
// every time it is drawn.

/** The folders whose files belong to an app or a tool rather than to the
    person, and what removing one costs. First match wins. */
const CAREFUL_PLACES = [
  { re: /^~\/Library\/(CloudStorage|Mobile Documents)\//,
    why: 'Synced. Trashing it deletes it from your cloud drive on every device.' },
  { re: /^~\/Library\//, why: 'App data. Removing it can break the app that owns it.' },
  { re: /^~\/\.[^/]+\//, why: 'Tool data. Removing it can break the tool that owns it.' },
  { re: /\.app\//, why: 'Part of an app. Removing it breaks the app.' },
  { re: /\/(miniconda3|anaconda3|miniforge3|mambaforge|site-packages|\.venv|venv)\//,
    why: 'Python environment. Removing it breaks that environment.' },
  { re: /\/bin\/cache\//, why: 'SDK files. The SDK breaks until it downloads them again.' },
];

/** `{ risk: 'safe' | 'review' | 'careful', why }` for a row in pile `key`.
    `original` marks the oldest copy in a duplicate group. */
function tagFor(key, path, original = false) {
  if (key === 'cache') return { risk: 'safe', why: 'A cache. Apps rebuild it on next launch.' };
  const shown = abbrevPath(path);
  const place = CAREFUL_PLACES.find((c) => c.re.test(shown));
  if (place) return { risk: 'careful', why: place.why };
  if (key === 'dupe') {
    return original
      ? { risk: 'review', why: 'Likely the original. Keep at least one copy.' }
      : { risk: 'safe', why: 'An identical copy stays on this Mac.' };
  }
  return { risk: 'review', why: 'Your file. It goes to the Trash, recoverable until you empty it.' };
}

// ── remove ──

/**
 * Remove `paths` from pile `cat` — the bulk verb and each row's ⋯ both land
 * here. Rows show a spinner while they go and drop the moment files.sh
 * reports them gone, read from its `.done` list as it grows; nothing waits on
 * a rescan. Each call gets its own list file, so removals started from
 * different rows can overlap.
 */
async function removePaths(paths, cat) {
  const blocked = removalBlocked();
  paths = paths.filter((p) => !removing.has(p));
  if (blocked || !paths.length) return;
  const purge = cat.posture === 'purge';
  // Sizes as drawn now — the rows are gone by the time the toast adds them up.
  const sizes = new Map(paths.map((p) => [p, sizeOf(p)]));
  const bytes = [...sizes.values()].reduce((s, b) => s + b, 0);
  const n = paths.length;
  const what = n === 1
    ? `<b>${esc(abbrevPath(paths[0]).split('/').pop())} (${fmtBytes(bytes)})</b>`
    : `<b>${n.toLocaleString()} ${purge ? 'caches' : 'items'} (${fmtBytes(bytes)})</b>`;
  const ok = await confirmDialog(
    purge
      ? `${what} will be <b>deleted outright</b>, not moved to the Trash — a cache sitting in the
         Trash frees no space until you empty it. Apps rebuild caches on next launch, so nothing
         of yours is lost, but this cannot be undone.`
      : `${what} will be moved to the macOS Trash. You can restore ${n === 1 ? 'it' : 'them'}
         from the Trash anytime — the space frees when you empty it.`,
    purge ? (n === 1 ? 'Delete' : `Delete ${n.toLocaleString()}`)
      : (n === 1 ? 'Move to Trash' : `Move ${n.toLocaleString()} to Trash`),
    purge);
  if (!ok || removalBlocked()) return;

  const verb = purge ? 'Deleting' : 'Moving to Trash';
  for (const p of paths) { removing.add(p); selected.delete(p); }
  const op = beginOp('remove', `${verb}…`);
  renderPane();
  const toast = showToast(`${verb}…`, true);
  const list = `remove-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const listPath = `${WORK_DIR}/${list}`;
  const gone = new Set();
  const collect = async () => {
    const res = await bash(`cat "${listPath}.done" 2>/dev/null || true`);
    let moved = false;
    for (const p of (res.stdout || '').split('\n')) {
      if (!p || gone.has(p) || !sizes.has(p)) continue;
      gone.add(p);
      dropPath(p);
      moved = true;
    }
    if (moved) {
      render();
      if (n > 1) toast.update(`${verb}… ${gone.size.toLocaleString()} of ${n.toLocaleString()}`);
    }
  };
  let r = {};
  try {
    await writeLines(WORK_DIR, list, paths);
    const timer = setInterval(collect, 800);
    let res;
    try {
      res = await bash(`bash ${FILES_SH} ${purge ? 'purge' : 'trash'} "${listPath}"`);
    } finally {
      clearInterval(timer);
    }
    try { r = JSON.parse(res.stdout || '{}'); } catch { /* counted from .done below */ }
    await collect();
  } finally {
    for (const p of paths) removing.delete(p);
    bash(`rm -f "${listPath}" "${listPath}.done"`);
    endOp(op);
    render();
  }

  // Reclaimed bytes are the sizes this pane showed, summed over exactly the
  // paths that went — not a second measurement, which would let the toast and
  // the row disagree about the same file.
  const freed = [...gone].reduce((s, p) => s + (sizes.get(p) || 0), 0);
  const notes = [];
  if (r.failed) notes.push(`${r.failed} could not be removed`);
  // files.sh refuses non-cache paths; if that ever fires, say so out loud
  // rather than quietly reporting a smaller number.
  if (r.refused) notes.push(`${r.refused} refused — not inside a cache root`);
  toast.done(`✓ ${purge ? 'Deleted' : 'Trashed'} ${gone.size.toLocaleString()} · ${fmtBytes(freed)}${
    notes.length ? ` · ${notes.join(' · ')}` : ''}${purge || !gone.size ? '' : ' — empty the Trash to reclaim it'}`);
}

/** Take a removed path out of every pile — Downloads and Large files overlap,
    and a removed folder takes the files listed inside it with it. */
function dropPath(p) {
  const hit = (q) => q === p || q.startsWith(`${p}/`);
  for (const key of Object.keys(rows)) rows[key] = rows[key].filter((f) => !hit(f.path));
  dupeGroups = dupeGroups
    .map((g) => ({ ...g, paths: g.paths.filter((q) => !hit(q)) }))
    .filter((g) => g.paths.length > 1);
  for (const q of [...selected]) if (hit(q)) selected.delete(q);
}

function revealInFinder(path) {
  bash(`open -R ${shellEsc(path)}`);
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

/** What Select all takes: the pile minus CAREFUL rows and rows already going.
    A careful row is still one click to check by hand. */
function selectableFor(key) {
  return itemsFor(key).filter((p) => !removing.has(p) && tagFor(key, p).risk !== 'careful');
}

function bytesFor(key) {
  if (key === 'dupe') return dupeGroups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
  return (rows[key] || []).reduce((s, f) => s + f.size, 0);
}

function render() {
  if (!panel || getSource() !== 'mac') return renderPhone();
  const scanning = [...ops.values()].some((op) => op.kind === 'scan');
  // A scan fills the piles one at a time and redraws after each. Gate the
  // empty state on there being nothing to show, not on the scan having
  // finished — otherwise the panel reads "nothing scanned yet" while rows it
  // already has sit undrawn behind it.
  if (!allRows().length && (scanning || !scanned)) {
    panel.innerHTML = `<div class="media-card dashed">
      <h4 class="media-dim">${scanning ? 'Scanning…' : 'Nothing scanned yet'}</h4>
      <div class="media-dim">${scanning
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
      // Checks belong to the pile they were made in. Trash and Delete differ
      // by pile, so a check carried across would be removed the other way.
      if (chip.dataset.cat !== activeCat) selected.clear();
      activeCat = chip.dataset.cat;
      if (activeCat === 'dupe' && !dupesHashed && !ops.size) { findDuplicates().then(render); return; }
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
  const skipsCareful = pool.some((p) => tagFor(activeCat, p).risk === 'careful');
  const hint = activeCat === 'dupe'
    ? 'oldest copy of each group is left unchecked — it is the likely original'
    : 'sorted by size, biggest first';
  const bar = `<div class="catbar">
      <button class="media-cta ghost sm" id="files-select-btn">Select all</button>
      <button class="media-cta ghost sm" id="files-unselect-btn">Unselect</button>
      <span class="media-dim">${hint}${skipsCareful ? ' · Select all leaves CAREFUL rows out' : ''}</span></div>`;

  if (!pool.length) {
    const empty = activeCat === 'dupe' && !dupesHashed
      ? 'Duplicates are checked once the current job finishes — pick Duplicates again then.'
      : activeCat === 'dupe'
        ? 'No duplicates among the files scanned — every same-size pair differed once hashed in full.'
        : 'Nothing in this pile.';
    pane.innerHTML = `${bar}<div class="media-dim">${empty}</div>`;
    wireBar();
    return;
  }

  pane.innerHTML = bar + (activeCat === 'dupe' ? dupeHtml() : listHtml(activeCat));
  for (const el of pane.querySelectorAll('.file-row')) {
    const p = el.dataset.path;
    el.onclick = (e) => {
      if (e.target.tagName === 'A' || e.target.closest('.file-more, .file-copy') || removing.has(p)) return;
      if (selected.has(p)) selected.delete(p); else selected.add(p);
      renderPane();
      refreshVerbs();
    };
    const more = el.querySelector('.file-more');
    if (more) more.onclick = () => openRowMenu(more, p);
    const copy = el.querySelector('.file-copy');
    if (copy) copy.onclick = () => copyRemoveCommand(copy, p);
  }
  wireBar();
}

// ── the remove command, for a terminal ──

const COPY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
  + '<rect x="5.2" y="2.2" width="8.6" height="10.6" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>'
  + '<path d="M10.6 13.8v.4a1.6 1.6 0 0 1-1.6 1.6H3.8a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6h.4"'
  + ' fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

const copyTitle = () =>
  (CATEGORIES.find((c) => c.key === activeCat)?.posture === 'purge'
    ? 'Copy the delete command' : 'Copy the Trash command');

/** The line this file would be removed by in a terminal — the same posture the
    buttons use: your files go to the Trash, a cache is deleted outright. The
    path is shell-quoted, so a space, a quote or a `$` in a name is safe. */
export function removeCommand(path, posture) {
  return posture === 'purge' ? `rm -rf ${shellPath(path)}` : `mv -i ${shellPath(path)} ~/.Trash/`;
}

async function copyRemoveCommand(btn, path) {
  const cat = CATEGORIES.find((c) => c.key === activeCat);
  const done = await copyText(removeCommand(path, cat?.posture));
  if (!done) { showToast('Could not reach the clipboard').done('Could not reach the clipboard'); return; }
  btn.innerHTML = '✓';
  btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = COPY_ICON; btn.classList.remove('copied'); }, 1400);
}

/** A row's ⋯: look first, then remove — the destructive verb last. */
function openRowMenu(anchor, path) {
  const cat = CATEGORIES.find((c) => c.key === activeCat);
  const purge = cat.posture === 'purge';
  const blocked = removalBlocked();
  openMenu(anchor, [
    { label: 'Show in Finder', run: () => revealInFinder(path) },
    {
      label: purge ? 'Delete' : 'Move to Trash',
      hint: purge ? 'caches regenerate' : 'recoverable',
      danger: true,
      ...(blocked ? { blocked } : { run: () => removePaths([path], cat) }),
    },
  ]);
}

function wireBar() {
  const sel = document.getElementById('files-select-btn');
  const uns = document.getElementById('files-unselect-btn');
  if (!sel || !uns) return;
  const pool = selectableFor(activeCat);
  sel.disabled = !pool.length || pool.every((p) => selected.has(p));
  sel.onclick = () => {
    for (const p of pool) selected.add(p);
    renderPane();
    refreshVerbs();
  };
  uns.disabled = !selected.size;
  uns.onclick = () => { selected.clear(); renderPane(); refreshVerbs(); };
}

/** Directory dimmed and truncatable, name always whole. Truncating the tail
    would cut the very part that identifies the file, and a right-to-left
    ellipsis reorders the leading `~` ("~/.cache" drawn as "cache./~"). */
function rowHtml(key, path, size, meta, original = false) {
  const shown = abbrevPath(path);
  const cut = shown.lastIndexOf('/');
  const dir = cut >= 0 ? shown.slice(0, cut + 1) : '';
  const name = cut >= 0 ? shown.slice(cut + 1) : shown;
  const going = removing.has(path);
  const on = selected.has(path);
  const tag = tagFor(key, path, original);
  return `<div class="file-row ${on ? 'on' : ''} ${going ? 'removing' : ''}" data-path="${esc(path)}">
    <span class="file-check">${going ? '<span class="media-spin"></span>' : on ? '☑' : '☐'}</span>
    <span class="rec-risk ${tag.risk} file-tag" title="${esc(tag.why)}">${tag.risk}</span>
    <span class="file-size">${fmtBytes(size)}</span>
    <span class="file-path" title="${esc(path)}"><span class="file-dir">${esc(dir)}</span><span
      class="file-name">${esc(name)}</span></span>
    <span class="file-meta">${esc(meta)}</span>
    ${going ? '<span class="file-more-slot"></span><span class="file-more-slot"></span>'
    : `<button class="file-copy" type="button" title="${copyTitle()}">${COPY_ICON}</button>
       <button class="file-more menu-anchor" type="button" title="More">⋯</button>`}</div>`;
}

function listHtml(key) {
  const list = (rows[key] || []).slice(0, RENDER_CAP);
  const more = (rows[key] || []).length - list.length;
  const meta = (f) => (key === 'cache' ? f.label : `last opened ${relAge(f.atime) || '?'} ago`);
  return list.map((f) => rowHtml(key, f.path, f.size, meta(f))).join('')
    + (more > 0 ? `<div class="media-dim">+${more.toLocaleString()} more not drawn — Select all still covers them.</div>` : '');
}

function dupeHtml() {
  return dupeGroups.map((g) => `
    <div class="media-group">
      <div class="glabel">${g.paths.length} copies · ${fmtBytes(g.size)} each ·
        ${fmtBytes(g.size * (g.paths.length - 1))} reclaimable · verified by full SHA-256</div>
      ${g.paths.map((p, i) => rowHtml('dupe', p, g.size, i === 0 ? 'oldest — likely the original' : '', i === 0))
    .join('')}
    </div>`).join('');
}

document.addEventListener('DOMContentLoaded', initFilesTab);
