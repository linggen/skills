// Files tab — the Mac's own files: what can be cleared, Downloads, large
// files, duplicates.
//
// Everything here is the iframe's own work through `files.sh`; the agent
// narrates but never gates. No venv, so this tab works on a fresh install
// before the Media tools are ever set up.
//
// Removal postures, and the difference is the point:
//   • Downloads, large files, duplicates -> the macOS Trash. Your data, so it
//     stays recoverable.
//   • Clearable -> each row the way its catalog rule says (clearables.json):
//     build output and caches deleted outright or by their own tool (`cargo
//     clean`), because a cache in the Trash frees nothing until the Trash is
//     emptied; logs, backups and Ling's finds to the Trash.
// clearables.sh re-verifies every path against the catalog before it touches
// it, so that boundary is enforced where it cannot be argued with rather
// than in this file.

import {
  registerTab, getActiveTab, onSourceChange, onTabChange, refreshVerbs, openMenu,
} from './shifu-shell.js';
import {
  bash, writeLines, writeJsonFile, fmtBytes, esc, abbrevPath, relAge, shellEsc, shellPath,
  confirmDialog, showToast, copyText,
} from './shifu-io.js';
import {
  parseScan, parseFound, ruleMap, groupRows, headline, summaryText, commandFor,
  notMeasured,
} from './clearables.js';

const FILES_SH = '$HOME/.linggen/skills/apple-shifu/scripts/files.sh';
const WORK_DIR = '$HOME/.linggen/skills/apple-shifu/data/files';
const LARGE_TARGET = 300;   // candidates to pull before the tiering stops
const RENDER_CAP = 200;     // rows drawn per category; selection covers all
const DUPE_HASH_CAP = 60;   // files hashed per pass — full SHA-256 is not free
const CLEAR_SH = '$HOME/.linggen/skills/apple-shifu/scripts/clearables.sh';
const CLEAR_DIR = `${WORK_DIR}/clearables`;
const CLEAR_POLL_MS = 1500;
const GROUP_RENDER_CAP = 60; // rows drawn per Clearable group

/** The piles, in the order they are shown. `posture` says how the pile's
    rows go: `trash`, or `rule` — each row the way its catalog rule says. */
const CATEGORIES = [
  { key: 'clear', label: 'Clearable', posture: 'rule' },
  { key: 'downloads', label: 'Downloads', posture: 'trash' },
  { key: 'large', label: 'Large files', posture: 'trash' },
  { key: 'dupe', label: 'Duplicates', posture: 'trash' },
];

let panel = null;
let activeCat = 'clear';
let selected = new Set();          // absolute paths
let scanned = false;
/** Jobs running now, token -> { kind: 'scan' | 'hash' | 'remove', label }.
    Removals can overlap (each row's ⋯ starts its own); a scan or a hash
    cannot run beside anything, or it would redraw rows that are going. */
const ops = new Map();
const removing = new Set();        // paths whose removal is in flight
const rows = { downloads: [], large: [] };
let dupeGroups = [];               // [{ sha, size, paths: [] }]
let dupesHashed = false;
/** Piles actually measured this pass. A chip reading "0" before its pile has
    been read would claim the pile is empty when nothing has looked yet. */
const measured = new Set();

/** The Clearable pile: the catalog, the last scan as clearables.sh streamed
    it, and Ling's finds. `groups` is derived — verdicts and why lines — and
    rebuilt whenever a source changes. */
const clear = {
  catalog: null, rules: new Map(), scan: parseScan(''), found: [], groups: [],
  byPath: new Map(), running: false, timer: null, loaded: false, loading: null,
};

// ── registration ──

export function initFilesTab() {
  panel = document.getElementById('files-panel');
  registerTab('files', filesProvider);
  onTabChange((name) => { if (name === 'files') { loadClearables().then(resumeClearJob); render(); } });
  // Ling proposed or dropped a row — re-read her finds.
  window.addEventListener('shifu:found', () => readFound());
  // The System Overview's button: open the Clearable pile, and with
  // `selectSafe` check its SAFE rows — exactly what Select all takes. The
  // Clear verb, its confirm sheet and the shell's guard are the same as ever.
  window.addEventListener('shifu:open-clearable', (e) => openClearable(e.detail || {}));
  onSourceChange(() => render());
  // A page reopened on this tab switched to it before this module listened,
  // which left the panel blank. Draw now if it is already the one showing.
  if (getActiveTab() === 'files') { loadClearables().then(resumeClearJob); render(); }
}

/** This Mac only. iOS shows no app another app's files, and the folders a
    person could grant can't be sized before they grant them — which is why
    the phone has System and Media and no Files (2026-07-30). The shell greys
    the pair against each other rather than opening an empty screen here. */
const filesProvider = {
  panel: 'files-panel',
  sources: ['mac'],
  verbs: () => {
    const actions = macVerbs();
    const busy = busyLabel();
    if (busy) for (const k of Object.keys(actions)) actions[k] = { blocked: busy };
    return actions;
  },
  meta: () => {
    const busy = busyLabel();
    if (busy) return `<span class="verb-busy">${esc(busy)}</span>`;
    if (!selected.size) return '';
    return `<b>${selected.size.toLocaleString()} selected · ${fmtBytes(selectedBytes())}</b>`;
  },
};

function macVerbs() {
  const cat = CATEGORIES.find((c) => c.key === activeCat);
  if (cat?.posture === 'rule') return clearVerbs();
  return {
    scan: { hint: 'Find what can be cleared, and re-read Downloads and large files', run: () => scan(true) },
    report: scanned
      ? { hint: 'Ask Ling what is safe to clear', run: reportFiles }
      : { blocked: 'Run a scan first — there is nothing to report on yet' },
    // Back up keeps its one meaning across the whole app: the iPhone's roll
    // onto this Mac. Mac files are not archived anywhere, and inventing a
    // second meaning here is exactly what the verb row exists to prevent.
    backup: { blocked: 'Back up archives the iPhone roll — Mac files are not archived, they go to the Trash' },
    clean: selected.size
      ? {
        label: 'Trash',
        hint: `Move ${selected.size.toLocaleString()} item${selected.size === 1 ? '' : 's'} (${fmtBytes(selectedBytes())}) to the macOS Trash`,
        run: () => removePaths([...selected], cat),
      }
      : { label: 'Trash', blocked: 'Check items to remove them' },
  };
}

function clearVerbs() {
  return {
    scan: { hint: 'Find what can be cleared, and re-read Downloads and large files', run: () => scan(true) },
    report: clear.scan.finished || clear.found.length
      ? { hint: 'Ask Ling to walk through what is safe to clear', run: reportFiles }
      : { blocked: 'Run a scan first — there is nothing to report on yet' },
    backup: { blocked: 'Back up archives the iPhone roll — Mac files are not archived' },
    clean: selected.size
      ? {
        label: 'Clear',
        hint: `Clear ${selected.size.toLocaleString()} item${selected.size === 1 ? '' : 's'} (${fmtBytes(selectedBytes())}), each the way its row says`,
        run: () => clearPaths([...selected]),
      }
      : { label: 'Clear', blocked: 'Check items to clear them' },
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

async function scan(force = false) {
  if (scanned && !force) return;
  // The Clearable walk runs in the background and streams; it takes minutes
  // on a big disk, so it never holds the verb row the way the quick piles do.
  startClearScan();
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

    scanned = true;
    pruneSelected();
    render();
    toast.done(`✓ ${rows.downloads.length + rows.large.length} files · Clearable keeps measuring`);
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
  return [...rows.downloads, ...rows.large];
}

function sizeOf(path) {
  const row = clear.byPath.get(path);
  if (row) return row.size;
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
  const live = new Set([...allRows().map((f) => f.path), ...clear.byPath.keys()]);
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
 * Move `paths` to the Trash — the bulk verb and each row's ⋯ both land here
 * for Downloads, Large files and Duplicates. Rows show a spinner while they go
 * and drop the moment files.sh reports them gone; nothing waits on a rescan.
 */
async function removePaths(paths) {
  const blocked = removalBlocked();
  paths = paths.filter((p) => !removing.has(p));
  if (blocked || !paths.length) return;
  // Sizes as drawn now — the rows are gone by the time the toast adds them up.
  const sizes = new Map(paths.map((p) => [p, sizeOf(p)]));
  const bytes = [...sizes.values()].reduce((s, b) => s + b, 0);
  const n = paths.length;
  const what = n === 1
    ? `<b>${esc(abbrevPath(paths[0]).split('/').pop())} (${fmtBytes(bytes)})</b>`
    : `<b>${n.toLocaleString()} items (${fmtBytes(bytes)})</b>`;
  const ok = await confirmDialog(
    `${what} will be moved to the macOS Trash. You can restore ${n === 1 ? 'it' : 'them'}
     from the Trash anytime — the space frees when you empty it.`,
    n === 1 ? 'Move to Trash' : `Move ${n.toLocaleString()} to Trash`,
    false);
  if (!ok || removalBlocked()) return;
  const { gone, result, note } = await runListJob(paths, paths, 'Moving to Trash', sizes,
    (list) => `bash ${FILES_SH} trash "${list}"`);
  const freed = [...gone].reduce((s, p) => s + (sizes.get(p) || 0), 0);
  const notes = result.failed ? ` · ${result.failed} could not be moved` : '';
  note.done(`✓ Trashed ${gone.size.toLocaleString()} · ${fmtBytes(freed)}${notes}${
    gone.size ? ' — empty the Trash to reclaim it' : ''}`);
}

/**
 * Run one list job through the shell: write `lines` to a list file, start
 * `command(list)`, and drop each path the moment it shows up in the job's
 * `.done` list. Reclaimed bytes are then the sizes this pane showed, summed
 * over exactly the paths that went — not a second measurement, which would let
 * the toast and the row disagree about the same file. `background` jobs (a
 * `cargo clean` can outlast any HTTP call) are polled until they write
 * `<list>.result`.
 */
async function runListJob(paths, lines, verb, sizes, command, background = false) {
  const list = `${WORK_DIR}/remove-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const job = startListJob(paths, verb);
  let result = {};
  let lost = false;
  try {
    await writeLines(WORK_DIR, list.split('/').pop(), lines);
    if (background) {
      const pid = await launchBackground(command(list));
      if (pid) {
        // On disk, so a reloaded page picks the job up (resumeClearJob).
        await writeJsonFile(WORK_DIR, JOB_FILE, {
          list, pid, verb, started: Date.now(), sizes: [...sizes],
          trashed: background.trashed || [],
        });
        const res = await waitForJob(pid, list, job, sizes);
        lost = !!res.lost;
        try { result = JSON.parse(res.stdout || '{}'); } catch { /* counted from .done below */ }
      }
    } else {
      const res = await watchWhile(bash(command(list), 30 * 60 * 1000), job, list, sizes);
      try { result = JSON.parse(res.stdout || '{}'); } catch { /* counted from .done below */ }
    }
    await collectDone(job, list, sizes);
    // No answer from the job at all: what did not go failed — never "✓ Cleared 0".
    if (!lost && !Object.keys(result).length) result.failed = paths.length - job.gone.size;
  } finally {
    endListJob(job, list, lost);
  }
  return { gone: job.gone, result, note: job.note, lost };
}

/** The page side of a list job: its rows marked going, the verb row held, and
    a toast that counts what went and how long it has been running. */
function startListJob(paths, verb) {
  for (const p of paths) { removing.add(p); selected.delete(p); }
  const job = {
    paths, verb, n: paths.length, gone: new Set(), started: Date.now(),
    op: beginOp('remove', `${verb}…`), note: showToast(`${verb}…`, true),
  };
  renderPane();
  return job;
}

function endListJob(job, list, lost) {
  for (const p of job.paths) removing.delete(p);
  // A lost job is still running — its list and record stay for the resume.
  if (!lost) bash(`rm -f "${list}" "${list}.done" "${list}.result" "${WORK_DIR}/${JOB_FILE}"`);
  endOp(job.op);
  render();
}

/** Drop each path the moment it shows up in the job's `.done` list. */
async function collectDone(job, list, sizes) {
  const res = await bash(`cat "${list}.done" 2>/dev/null || true`, POLL_TIMEOUT_MS);
  let moved = false;
  for (const p of (res.stdout || '').split('\n')) {
    if (!p || job.gone.has(p) || !sizes.has(p)) continue;
    job.gone.add(p);
    dropPath(p);
    moved = true;
  }
  if (moved) render();
  const count = job.n > 1 ? ` ${job.gone.size.toLocaleString()} of ${job.n.toLocaleString()}` : '';
  job.note.update(`${job.verb}…${count} · ${elapsed(job.started)}`);
}

function elapsed(since) {
  const s = Math.round((Date.now() - since) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Keep the toast and rows moving while a foreground call runs. */
async function watchWhile(promise, job, list, sizes) {
  const timer = setInterval(() => collectDone(job, list, sizes), 800);
  try { return await promise; } finally { clearInterval(timer); }
}

const BACKGROUND_CAP_MS = 3 * 3600 * 1000;   // a job this long has died, not stalled
const POLL_TIMEOUT_MS = 20 * 1000;            // one status read; the job runs on without it
const LOST_AFTER_MS = 3 * 60 * 1000;          // this long with no answer: stop waiting here
const JOB_FILE = 'clear-job.json';
let resuming = false;

/** Start `command` detached; its pid, or 0 when it did not start. */
async function launchBackground(command) {
  // In a subshell: /api/bash appends `; …` to every command, and a bare
  // trailing `&` turned that into `& ;` — a syntax error, so nothing ran.
  const start = await bash(`( nohup ${command} >/dev/null 2>&1 & echo $! )`, POLL_TIMEOUT_MS);
  return parseInt((start.stdout || '').trim(), 10) || 0;
}

/** Wait for a detached job to write `<list>.result`. Only an ANSWERED
    liveness check may call it dead: an unanswered one (daemon restarting,
    request timed out) means "don't know", and waiting goes on — until the
    daemon has been silent for LOST_AFTER_MS, when the page lets go and says
    so. The job keeps running; reopening Files picks it back up. */
async function waitForJob(pid, list, job, sizes) {
  const until = job.started + BACKGROUND_CAP_MS;
  let silentSince = 0;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    await collectDone(job, list, sizes);
    const res = await bash(`cat "${list}.result" 2>/dev/null || true`, POLL_TIMEOUT_MS);
    if ((res.stdout || '').trim()) return res;
    const alive = await bash(`kill -0 ${pid} 2>/dev/null && echo up || echo gone`, POLL_TIMEOUT_MS);
    const said = (alive.stdout || '').trim();
    if (!said) {
      silentSince = silentSince || Date.now();
      if (Date.now() - silentSince > LOST_AFTER_MS) return { lost: true };
      job.note.update(`${job.verb}… · ${elapsed(job.started)} · reconnecting to Linggen`);
      continue;
    }
    silentSince = 0;
    if (said === 'gone') {
      // Gone without a result: stop waiting now, not in three hours.
      const last = await bash(`cat "${list}.result" 2>/dev/null || true`, POLL_TIMEOUT_MS);
      return (last.stdout || '').trim() ? last : {};
    }
  }
  return {};
}

/** A clear still running from before a reload (or after the page lost touch
    with the daemon): hold its rows, re-attach to the job and finish its toast. */
async function resumeClearJob() {
  // Already attached (this page started it, or a resume is under way).
  if (resuming || [...ops.values()].some((op) => op.kind === 'remove')) return;
  resuming = true;
  let rec;
  try {
    const res = await bash(`cat "${WORK_DIR}/${JOB_FILE}" 2>/dev/null || true`, POLL_TIMEOUT_MS);
    rec = JSON.parse(res.stdout || '');
  } catch { rec = null; }
  if (!rec || !rec.list || !rec.pid) { resuming = false; return; }
  const sizes = new Map(rec.sizes || []);
  const job = startListJob([...sizes.keys()].filter((p) => !removing.has(p)), rec.verb || 'Clearing');
  job.started = rec.started || Date.now();
  let result = {};
  let lost = false;
  try {
    const r = await waitForJob(rec.pid, rec.list, job, sizes);
    lost = !!r.lost;
    try { result = JSON.parse(r.stdout || '{}'); } catch { /* counted from .done */ }
    await collectDone(job, rec.list, sizes);
    if (!lost && !Object.keys(result).length) result.failed = job.n - job.gone.size;
  } finally {
    endListJob(job, rec.list, lost);
    resuming = false;
  }
  finishClear(job, result, sizes, new Set(rec.trashed || []), lost);
}

// ── the Clearable pile ──

/** Load the catalog, the last scan and Ling's finds — once per page; a scan
    still streaming from before a reload is picked up where it is. */
function loadClearables() {
  // One load per page; a second caller waits on the first rather than
  // reading a pile that is still arriving.
  clear.loading ??= loadClearablesOnce();
  return clear.loading;
}

async function loadClearablesOnce() {
  clear.loaded = true;
  try {
    const res = await fetch(new URL('./clearables.json', import.meta.url));
    clear.catalog = await res.json();
    clear.rules = ruleMap(clear.catalog);
  } catch {
    clear.catalog = { groups: [], rules: [] };
  }
  await Promise.all([readScan(), readFound()]);
  // A scan that finished while no page was open still owes Ling her summary.
  if (clear.scan.finished) writeSummary();
  if (!clear.scan.finished && clear.scan.started) {
    const alive = await bash(`kill -0 "$(cat "${CLEAR_DIR}/pid" 2>/dev/null)" 2>/dev/null && echo alive`);
    if ((alive.stdout || '').includes('alive')) pollClear();
  }
}

async function startClearScan() {
  if (clear.running) return;
  if (!clear.loaded) await loadClearables();
  clear.running = true;
  clear.scan = parseScan('');
  regroup();
  render();
  await bash(`bash ${CLEAR_SH} start "${CLEAR_DIR}"`);
  pollClear();
}

function pollClear() {
  clear.running = true;
  clearTimeout(clear.timer);
  const tick = async () => {
    await readScan();
    if (clear.scan.finished) {
      clear.running = false;
      writeSummary();
      refreshVerbs();
      return;
    }
    clear.timer = setTimeout(tick, CLEAR_POLL_MS);
  };
  clear.timer = setTimeout(tick, CLEAR_POLL_MS);
}

async function readScan() {
  const res = await bash(`cat "${CLEAR_DIR}/rows.txt" 2>/dev/null || true`);
  clear.scan = parseScan(res.stdout || '');
  regroup();
  if (getActiveTab() === 'files') render();
}

async function readFound() {
  const res = await bash(`cat "${WORK_DIR}/found.txt" 2>/dev/null || true`);
  clear.found = parseFound(res.stdout || '');
  regroup();
  if (clear.scan.finished) writeSummary();
  if (getActiveTab() === 'files') render();
}

/** Rebuild verdicts and why lines from the three sources. A find of Ling's
    that the scan also lists shows once, as the scan's row. */
function regroup() {
  const scanned = new Set(clear.scan.rows.map((r) => r.path));
  const rowsNow = [...clear.scan.rows, ...clear.found.filter((r) => !scanned.has(r.path))];
  clear.groups = groupRows(clear.catalog, rowsNow);
  clear.byPath = new Map(clear.groups.flatMap((g) => g.rows).map((r) => [r.path, r]));
}

/** The facts Ling's Clearables tool reads. The page writes them because the
    verdicts are the page's. */
function writeSummary() {
  if (!clear.catalog) return;
  writeLines(CLEAR_DIR, 'summary.txt', summaryText(clear.catalog, clear.scan, clear.found))
    .then(() => window.dispatchEvent(new Event('shifu:clearable')));
}

async function openClearable({ selectSafe = false } = {}) {
  if (activeCat !== 'clear') selected.clear();
  activeCat = 'clear';
  await loadClearables();
  if (selectSafe && !removalBlocked()) {
    selected.clear();
    for (const p of selectableFor('clear')) selected.add(p);
  }
  render();
}

const METHOD_WORDS = {
  purge: (n) => `${n} deleted outright — they regenerate`,
  tool: (n, tools) => `${n} cleared by their own tool (${tools})`,
  trash: (n) => `${n} moved to the Trash — recoverable until you empty it`,
};

/** Clear Clearable rows — every one the way its rule says. clearables.sh
    re-verifies each path against the catalog and refuses what does not fit. */
async function clearPaths(paths) {
  const blocked = removalBlocked();
  const rowsGoing = paths.map((p) => clear.byPath.get(p))
    .filter((r) => r && r.method !== 'report' && !removing.has(r.path));
  if (blocked || !rowsGoing.length) return;
  const sizes = new Map(rowsGoing.map((r) => [r.path, r.size]));
  const bytes = rowsGoing.reduce((s, r) => s + r.size, 0);
  const by = (m) => rowsGoing.filter((r) => r.method === m);
  const tools = [...new Set(by('tool').map((r) => clear.rules.get(r.rule)?.remove?.cmd?.split(' ').slice(0, 2).join(' ')))]
    .filter(Boolean).join(', ');
  const parts = Object.keys(METHOD_WORDS)
    .filter((m) => by(m).length)
    .map((m) => METHOD_WORDS[m](by(m).length.toLocaleString(), tools));
  const reviews = rowsGoing.filter((r) => r.risk !== 'safe').length;
  const n = rowsGoing.length;
  const what = n === 1
    ? `<b>${esc(abbrevPath(rowsGoing[0].path))} (${fmtBytes(bytes)})</b>`
    : `<b>${n.toLocaleString()} items (${fmtBytes(bytes)})</b>`;
  const ok = await confirmDialog(
    `${what}: ${parts.join('; ')}.${reviews
      ? ` <b>${reviews} marked REVIEW</b> — clearing costs a rebuild, a download, or your data.` : ''}`,
    n === 1 ? 'Clear' : `Clear ${n.toLocaleString()}`,
    true);
  if (!ok || removalBlocked()) return;
  const trashed = by('trash').map((r) => r.path);
  const { gone, result, note, lost } = await runListJob(
    rowsGoing.map((r) => r.path), rowsGoing.map((r) => `${r.rule}\t${r.path}`), 'Clearing', sizes,
    (list) => `bash ${CLEAR_SH} clear "${list}"`, { trashed });
  finishClear({ gone, note }, result, sizes, new Set(trashed), lost);
}

function finishClear({ gone, note }, result, sizes, trashedPaths, lost) {
  writeSummary();
  const freed = [...gone].reduce((s, p) => s + (sizes.get(p) || 0), 0);
  if (lost) {
    note.done(`Lost touch with Linggen after ${fmtBytes(freed)} — the clear keeps going. Reopen Files to pick it up.`);
    return;
  }
  const notes = [];
  if (result.failed) notes.push(`${result.failed} could not be cleared`);
  // The shell's guard said no — say so out loud, with its first reason.
  if (result.refused) notes.push(`${result.refused} refused (${(result.reasons || [])[0] || 'outside its rule'})`);
  const trashed = [...gone].some((p) => trashedPaths.has(p));
  note.done(`✓ Cleared ${gone.size.toLocaleString()} · ${fmtBytes(freed)}${
    notes.length ? ` · ${notes.join(' · ')}` : ''}${trashed ? ' — empty the Trash for the Trash part' : ''}`);
}

async function dismissFound(path) {
  await bash(`bash ${CLEAR_SH} unpropose ${shellEsc(path)}`);
  await readFound();
}

/** Take a removed path out of every pile — Downloads and Large files overlap,
    and a removed folder takes the files listed inside it with it. */
function dropPath(p) {
  const hit = (q) => q === p || q.startsWith(`${p}/`);
  for (const key of Object.keys(rows)) rows[key] = rows[key].filter((f) => !hit(f.path));
  clear.scan.rows = clear.scan.rows.filter((r) => !hit(r.path));
  clear.found = clear.found.filter((r) => !hit(r.path));
  regroup();
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
    if (c.key === 'clear') return `Clearable: ${headline(clear.groups)}`;
    const items = c.key === 'dupe' ? dupeGroups : rows[c.key] || [];
    return `${c.label}: ${items.length} ${c.key === 'dupe' ? 'groups' : 'items'}, ${fmtBytes(bytesFor(c.key))}`;
  };
  const msg = `Write a short report on what can be cleared on this Mac — ${CATEGORIES.map(line).join('; ')}. `
    + 'Read the Clearables tool first. Lead with the biggest SAFE win in plain words; the verdicts are the page\'s. '
    + 'Downloads, large files and duplicates go to the Trash and free space only once it is emptied. Say that plainly.';
  if (window._chatSend) window._chatSend(msg);
}

// ── render ──

function clearRows() {
  return clear.groups.flatMap((g) => g.rows);
}

function itemsFor(key) {
  if (key === 'clear') return clearRows().map((r) => r.path);
  if (key === 'dupe') return dupeGroups.flatMap((g) => g.paths.slice(1));
  return (rows[key] || []).map((f) => f.path);
}

/** What Select all takes: the pile minus CAREFUL rows and rows already going.
    A careful row is still one click to check by hand. On Clearable it takes
    SAFE rows only — a REVIEW row is a decision, never a bulk default. */
function selectableFor(key) {
  if (key === 'clear') {
    return clearRows().filter((r) => r.risk === 'safe' && r.method !== 'report' && !removing.has(r.path))
      .map((r) => r.path);
  }
  return itemsFor(key).filter((p) => !removing.has(p) && tagFor(key, p).risk !== 'careful');
}

function bytesFor(key) {
  if (key === 'clear') return clear.groups.reduce((s, g) => s + g.bytes, 0);
  if (key === 'dupe') return dupeGroups.reduce((s, g) => s + g.size * (g.paths.length - 1), 0);
  return (rows[key] || []).reduce((s, f) => s + f.size, 0);
}

/** Has the pile been read at all? A chip reading "0" before its pile has been
    read would claim the pile is empty when nothing has looked yet. */
const PILE_DONE = {
  clear: () => !!clear.scan.finished,
  dupe: () => dupesHashed,
};
const pileDone = (key) => (PILE_DONE[key] ? PILE_DONE[key]() : measured.has(key));
const pileCount = (key) => (key === 'dupe' ? dupeGroups.length : itemsFor(key).length);

const POSTURE = {
  rule: 'each row clears its own way: caches deleted, build output by its tool, your data to the Trash',
  trash: 'checked items go to the macOS Trash — the space frees when you empty it',
};

function render() {
  // The shell keeps this tab and an iPhone from being chosen together, so the
  // side in play here is always this Mac.
  if (!panel) return;
  const scanning = [...ops.values()].some((op) => op.kind === 'scan') || clear.running;
  // A scan fills the piles one at a time and redraws after each. Gate the
  // empty state on there being nothing to show, not on the scan having
  // finished — otherwise the panel reads "nothing scanned yet" while rows it
  // already has sit undrawn behind it.
  if (!allRows().length && !clearRows().length && !clear.scan.started && (scanning || !scanned)) {
    panel.innerHTML = `<div class="media-card dashed">
      <h4 class="media-dim">${scanning ? 'Scanning…' : 'Nothing scanned yet'}</h4>
      <div class="media-dim">${scanning
        ? 'Finding build output, caches, installers and logs that can go.'
        : 'Hit ↻ Scan above to find what can be cleared — build output, caches, installers, old logs.'}</div></div>`;
    refreshVerbs();
    return;
  }

  const chips = CATEGORIES.map((c) => {
    // Unmeasured piles show "…" — Duplicates until hashed, Clearable until its
    // scan ends, the rest until the scan reaches them.
    const done = pileDone(c.key);
    const n = pileCount(c.key);
    const size = bytesFor(c.key);
    const shown = done || (c.key === 'clear' && n);
    return `<button class="media-chip-f ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">
      <b>${shown ? n.toLocaleString() : '…'}</b>${c.label}${shown && size ? ` · ${fmtBytes(size)}` : ''}${
  done ? '' : shown ? '…' : ''}</button>`;
  }).join('');

  const cat = CATEGORIES.find((c) => c.key === activeCat);
  panel.innerHTML = `
    <div class="media-actionbar">
      <span class="abar-meta"><span class="media-dim">${POSTURE[cat.posture]}</span></span>
    </div>
    <div class="media-chips">${chips}</div>
    <div id="files-pane"></div>`;

  for (const chip of panel.querySelectorAll('.media-chip-f')) {
    chip.onclick = () => {
      // Checks belong to the pile they were made in. Trash and Clear differ
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

const EMPTY = {
  clear: () => (clear.running ? 'Looking for what can be cleared…' : 'Nothing clearable found. Hit ↻ Scan to look again.'),
  dupe: () => (dupesHashed
    ? 'No duplicates among the files scanned — every same-size pair differed once hashed in full.'
    : 'Duplicates are checked once the current job finishes — pick Duplicates again then.'),
};

function renderPane() {
  const pane = document.getElementById('files-pane');
  if (!pane) return;
  const pool = itemsFor(activeCat);
  const bar = barHtml(pool);
  if (!pool.length) {
    pane.innerHTML = `${bar}${activeCat === 'clear' ? clearHeadHtml() : ''}<div class="media-dim">${
      (EMPTY[activeCat] || (() => 'Nothing in this pile.'))()}</div>`;
    wireBar();
    return;
  }
  const body = { clear: clearHtml, dupe: dupeHtml }[activeCat] || (() => listHtml(activeCat));
  pane.innerHTML = bar + body();
  for (const el of pane.querySelectorAll('.file-row')) {
    const p = el.dataset.path;
    el.onclick = (e) => {
      if (e.target.tagName === 'A' || e.target.closest('.file-more, .file-copy') || removing.has(p)) return;
      if (el.classList.contains('fixed')) return;
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

const HINTS = {
  clear: 'biggest first · Select all takes SAFE rows only',
  dupe: 'oldest copy of each group is left unchecked — it is the likely original',
};

function barHtml(pool) {
  const skipsCareful = activeCat !== 'clear' && pool.some((p) => tagFor(activeCat, p).risk === 'careful');
  return `<div class="catbar">
      <button class="media-cta ghost sm" id="files-select-btn">Select all</button>
      <button class="media-cta ghost sm" id="files-unselect-btn">Unselect</button>
      <span class="media-dim">${HINTS[activeCat] || 'sorted by size, biggest first'}${
  skipsCareful ? ' · Select all leaves CAREFUL rows out' : ''}</span></div>`;
}

// ── the remove command, for a terminal ──

const COPY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
  + '<rect x="5.2" y="2.2" width="8.6" height="10.6" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>'
  + '<path d="M10.6 13.8v.4a1.6 1.6 0 0 1-1.6 1.6H3.8a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6h.4"'
  + ' fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

/** The line a row would be removed by in a terminal. A Clearable row's comes
    from its catalog rule; anything else goes to the Trash. The path is
    shell-quoted, so a space, a quote or a `$` in a name is safe. */
export function removeCommand(path) {
  const row = clear.byPath.get(path);
  if (row) return commandFor(clear.rules.get(row.rule), row);
  return `mv -i ${shellPath(path)} ~/.Trash/`;
}

async function copyRemoveCommand(btn, path) {
  const done = await copyText(removeCommand(path));
  if (!done) { showToast('Could not reach the clipboard').done('Could not reach the clipboard'); return; }
  btn.innerHTML = '✓';
  btn.classList.add('copied');
  setTimeout(() => { btn.innerHTML = COPY_ICON; btn.classList.remove('copied'); }, 1400);
}

const CLEAR_HINT = { purge: 'deleted outright', trash: 'to the Trash', tool: 'by its own tool' };

/** A row's ⋯: look first, then remove — the destructive verb last. */
function openRowMenu(anchor, path) {
  const blocked = removalBlocked();
  const row = clear.byPath.get(path);
  const items = [
    { label: 'Show in Finder', run: () => revealInFinder(path) },
    { label: 'Copy command', run: () => copyText(removeCommand(path)) },
  ];
  if (row?.found) items.push({ label: 'Dismiss', hint: 'drop Ling’s find', run: () => dismissFound(path) });
  if (row && row.method !== 'report') {
    items.push({
      label: 'Clear', hint: CLEAR_HINT[row.method], danger: true,
      ...(blocked ? { blocked } : { run: () => clearPaths([path]) }),
    });
  } else if (!row) {
    items.push({
      label: 'Move to Trash', hint: 'recoverable', danger: true,
      ...(blocked ? { blocked } : { run: () => removePaths([path]) }),
    });
  }
  openMenu(anchor, items);
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
function pathHtml(path) {
  const shown = abbrevPath(path);
  const cut = shown.lastIndexOf('/');
  const dir = cut >= 0 ? shown.slice(0, cut + 1) : '';
  const name = cut >= 0 ? shown.slice(cut + 1) : shown;
  return `<span class="file-path" title="${esc(path)}"><span class="file-dir">${esc(dir)}</span><span
      class="file-name">${esc(name)}</span></span>`;
}

function buttonsHtml(going) {
  return going ? '<span class="file-more-slot"></span><span class="file-more-slot"></span>'
    : `<button class="file-copy" type="button" title="Copy the command">${COPY_ICON}</button>
       <button class="file-more menu-anchor" type="button" title="More">⋯</button>`;
}

function checkHtml(path, fixed = false) {
  if (removing.has(path)) return '<span class="media-spin"></span>';
  if (fixed) return '·';
  return selected.has(path) ? '☑' : '☐';
}

function rowHtml(key, path, size, meta, original = false) {
  const going = removing.has(path);
  const tag = tagFor(key, path, original);
  return `<div class="file-row ${selected.has(path) ? 'on' : ''} ${going ? 'removing' : ''}" data-path="${esc(path)}">
    <span class="file-check">${checkHtml(path)}</span>
    <span class="rec-risk ${tag.risk} file-tag" title="${esc(tag.why)}">${tag.risk}</span>
    <span class="file-size">${fmtBytes(size)}</span>
    ${pathHtml(path)}
    <span class="file-meta">${esc(meta)}</span>
    ${buttonsHtml(going)}</div>`;
}

function listHtml(key) {
  const list = (rows[key] || []).slice(0, RENDER_CAP);
  const more = (rows[key] || []).length - list.length;
  return list.map((f) => rowHtml(key, f.path, f.size, `last opened ${relAge(f.atime) || '?'} ago`)).join('')
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

// ── Clearable rows ──

function clearHeadHtml() {
  const s = clear.scan;
  const measuredNow = s.rows.length;
  const status = clear.running ? progressText(s, measuredNow)
    : s.finished ? `scanned ${ago(s.finished)} in ${minutes(s.seconds)}` : '';
  return `<div class="clear-head"><b>${esc(headline(clear.groups))}</b>${
    status ? ` <span class="media-dim">· ${esc(status)}</span>` : ''}</div>`;
}

function progressText(s, n) {
  if (s.tree) return 'Mapping the rest of the disk for Ling…';
  if (!s.total) return 'Finding folders by what they are…';
  return `Measuring ${n.toLocaleString()}${s.total ? ` of ${s.total.toLocaleString()}` : ''}…`;
}

function ago(sec) {
  const m = Math.round((Date.now() / 1000 - sec) / 60);
  if (m < 2) return 'just now';
  if (m < 90) return `${m} min ago`;
  if (m < 2880) return `${Math.round(m / 60)} h ago`;
  return `${relAge(sec)} ago`;
}

function minutes(sec) {
  return sec < 90 ? `${sec}s` : `${Math.round(sec / 60)} min`;
}

function clearRowHtml(r) {
  const going = removing.has(r.path);
  const fixed = r.method === 'report';
  const size = r.state === 'ok' ? fmtBytes(r.size) : '—';
  return `<div class="file-row clear-row ${selected.has(r.path) ? 'on' : ''} ${going ? 'removing' : ''} ${
    fixed ? 'fixed' : ''}" data-path="${esc(r.path)}">
    <span class="file-check">${checkHtml(r.path, fixed)}</span>
    <span class="rec-risk ${r.risk} file-tag">${r.risk}</span>
    <span class="file-size" title="${r.state === 'ok' ? '' : esc(notMeasured(r.state))}">${size}</span>
    <span class="file-body">${pathHtml(r.path)}<span class="file-why${r.found ? ' ling' : ''}">${esc(r.why)}</span></span>
    ${buttonsHtml(going)}</div>`;
}

function clearHtml() {
  return clearHeadHtml() + clear.groups.map((g) => {
    const list = g.rows.slice(0, GROUP_RENDER_CAP);
    const more = g.rows.length - list.length;
    return `<div class="media-group">
      <div class="glabel"><b>${esc(g.label)}</b> · ${fmtBytes(g.bytes)} · ${g.rows.length.toLocaleString()} ${
  g.rows.length === 1 ? 'item' : 'items'}</div>
      ${list.map(clearRowHtml).join('')}
      ${more > 0 ? `<div class="media-dim">+${more.toLocaleString()} smaller not drawn — Select all still covers them.</div>` : ''}
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', initFilesTab);
