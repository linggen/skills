// pulse-app.js — Pulse main page app shell.
//
// Responsibilities:
//   1. Discover sessions in ~/.linggen/skills/pulse/data/, render the
//      sessions sidebar.
//   2. Load the selected session's session.json, hand it to the
//      renderer (page-render.js).
//   3. Mount the Linggen chat iframe in the right column. Forward
//      PageUpdate tool calls from the agent to the renderer.
//   4. Persist the in-memory session back to disk on every body_patch.
//   5. Wire action chips and card actions to chat messages.
//   6. Render the status strip from state/ files.
//
// Schema in design.md. Bash bridge is /api/bash (ungated by Linggen's
// agent permission system, so the page does its own filesystem work).

import { applyPageUpdate, loadSession, getSession, setOnChange, resetPage } from './page-render.js';
import { readPulseConfig, replayRuntimeGrants } from './api.js';

const SKILL_DIR = '$HOME/.linggen/skills/pulse';

// ---- App state -----------------------------------------------------------

const state = {
  selectedDate: null,
  view: 'session',   // 'session' | 'library-drafts' | 'library-mentions'
  libraryFilters: { lane: '', source: '', search: '', postedStatus: 'all' },
  sessions: [],      // [{ date, started_at, last_run_at, run_count, sample_goal, unread_count }]
  archiveCounts: { drafts: 0, mentions: 0 },  // populated lazily after sidebar renders
  chat: null,        // chat-bridge controller
};

// ---- Bash bridge ---------------------------------------------------------

async function runBash(cmd) {
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command: cmd }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  if (body.exit_code && body.exit_code !== 0) {
    throw new Error(body.stderr || `bash exit ${body.exit_code}`);
  }
  return body.stdout || '';
}

async function readJson(path, fallback = null) {
  const cmd = `[ -f "${path}" ] && cat "${path}" || true`;
  const out = (await runBash(cmd)).trim();
  if (!out) return fallback;
  try { return JSON.parse(out); } catch { return fallback; }
}

async function writeJson(path, value) {
  const json = JSON.stringify(value, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const cmd = `mkdir -p "$(dirname "${path}")" && echo "${b64}" | base64 --decode > "${path}"`;
  await runBash(cmd);
}

// ---- Date helpers --------------------------------------------------------

function todayDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);  // YYYY-MM-DD
}

function dateLabelRelative(dateStr) {
  if (dateStr === todayDate()) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  // Else "May 5" style
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
}

// ---- Sidebar -------------------------------------------------------------

async function loadSidebar() {
  // List directories in data/.
  const cmd = `ls -1 ${SKILL_DIR}/data 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r`;
  const out = (await runBash(cmd)).trim();
  const dirs = out ? out.split('\n').filter(Boolean) : [];

  // Ensure today is always present, even with no data file yet.
  const today = todayDate();
  if (!dirs.includes(today)) dirs.unshift(today);

  // Load metadata for each.
  state.sessions = [];
  for (const date of dirs.slice(0, 30)) {  // cap to most recent 30
    const meta = await loadSessionMeta(date);
    state.sessions.push(meta);
  }

  renderSidebar();
}

async function loadSessionMeta(date) {
  const sess = await readJson(`${SKILL_DIR}/data/${date}/session.json`);
  if (!sess) {
    return { date, run_count: 0, sample_goal: null, unread_count: 0, started_at: null, last_run_at: null };
  }
  const runs = Array.isArray(sess.runs) ? sess.runs : [];
  const unread = Object.values(sess.sections || {}).reduce(
    (acc, sec) => acc + ((sec?.cards || []).filter(c => c.type !== 'empty').length),
    0
  );
  return {
    date,
    run_count: runs.length,
    sample_goal: runs[0]?.goal || null,
    unread_count: unread,
    started_at: sess.started_at,
    last_run_at: sess.last_run_at,
  };
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = '';

  // Section: Sessions
  const sect = document.createElement('div');
  sect.className = 'side-section';
  const lbl = document.createElement('div');
  lbl.className = 'side-label';
  lbl.textContent = 'Sessions';
  sect.appendChild(lbl);

  for (const s of state.sessions) {
    sect.appendChild(renderSidebarItem(s));
  }
  el.appendChild(sect);

  el.appendChild(divider());

  // Section: Aggregate ranges (placeholder counts for now)
  const agg = document.createElement('div');
  agg.className = 'side-section';
  agg.appendChild(staticItem('This week', `${state.sessions.slice(0, 7).reduce((a, s) => a + s.unread_count, 0)}`));
  agg.appendChild(staticItem('This month', `${state.sessions.slice(0, 30).reduce((a, s) => a + s.unread_count, 0)}`));
  el.appendChild(agg);

  el.appendChild(divider());

  // Section: Archives
  const arc = document.createElement('div');
  arc.className = 'side-section';
  const arcLbl = document.createElement('div');
  arcLbl.className = 'side-label';
  arcLbl.textContent = 'Archives';
  arc.appendChild(arcLbl);
  const draftsItem  = staticItem('📝 Drafts',   fmtCount(state.archiveCounts.drafts));
  const mentionsItem = staticItem('@ Mentions', fmtCount(state.archiveCounts.mentions));
  draftsItem.classList.add('clickable');
  mentionsItem.classList.add('clickable');
  if (state.view === 'library-drafts')   draftsItem.classList.add('selected');
  if (state.view === 'library-mentions') mentionsItem.classList.add('selected');
  draftsItem.addEventListener('click', () => showLibrary('drafts'));
  mentionsItem.addEventListener('click', () => showLibrary('mentions'));
  arc.appendChild(draftsItem);
  arc.appendChild(mentionsItem);
  el.appendChild(arc);
}

function fmtCount(n) {
  if (n == null) return '—';
  if (n === 0) return '0';
  return String(n);
}

function renderSidebarItem(s) {
  const item = document.createElement('div');
  item.className = 'side-item';
  if (s.date === state.selectedDate) item.classList.add('selected');
  item.dataset.date = s.date;
  item.addEventListener('click', () => selectSession(s.date));

  const text = document.createElement('div');
  text.className = 'side-text';
  const name = document.createElement('span');
  name.className = 'side-name';
  name.textContent = (s.date === state.selectedDate ? '● ' : '') + dateLabelRelative(s.date);
  const sub = document.createElement('span');
  sub.className = 'side-sub';
  sub.textContent = s.last_run_at
    ? new Date(s.last_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + (s.sample_goal ? truncate(s.sample_goal, 32) : 'no goal')
    : 'no runs yet';
  text.appendChild(name);
  text.appendChild(sub);
  item.appendChild(text);

  if (s.unread_count > 0) {
    const badge = document.createElement('span');
    badge.className = 'side-badge';
    badge.textContent = String(s.unread_count);
    item.appendChild(badge);
  }
  return item;
}

function staticItem(label, count) {
  const item = document.createElement('div');
  item.className = 'side-item';
  const text = document.createElement('span');
  text.className = 'side-name';
  text.textContent = label;
  item.appendChild(text);
  const cnt = document.createElement('span');
  cnt.className = 'side-count';
  cnt.textContent = String(count);
  item.appendChild(cnt);
  return item;
}

function divider() {
  const d = document.createElement('div');
  d.className = 'side-divider';
  return d;
}

// ---- Session selection ---------------------------------------------------

async function selectSession(date) {
  state.selectedDate = date;
  state.view = 'session';
  // Reload session content
  const sess = await readJson(`${SKILL_DIR}/data/${date}/session.json`);
  loadSession(sess);  // renderer applies it
  // Update header
  const meta = state.sessions.find(s => s.date === date);
  document.getElementById('session-title').textContent =
    `${dateLabelRelative(date)} · ${meta?.run_count || 0} runs`;
  document.getElementById('session-sub').textContent = meta?.sample_goal
    ? `Last goal: "${truncate(meta.sample_goal, 80)}"`
    : 'Pick a chip above, or type a goal in chat to start.';
  // Show session-mode UI elements; hide library-mode
  showSessionUI();
  // Update sidebar selection
  renderSidebar();
}

// ---- Library views -------------------------------------------------------

async function showLibrary(kind) {
  // kind: 'drafts' | 'mentions'
  state.view = kind === 'drafts' ? 'library-drafts' : 'library-mentions';
  state.libraryFilters = { lane: '', source: '', search: '', postedStatus: 'all' };
  // Update header
  document.getElementById('session-title').textContent =
    kind === 'drafts' ? 'Drafts archive' : 'Mentions archive';
  document.getElementById('session-sub').textContent =
    kind === 'drafts'
      ? 'Every draft generated across all sessions. Filter by lane, posted status, or search.'
      : 'Every mention surfaced across all sessions. Filter by source or search the quote text.';
  // Hide session-mode UI; show library-mode
  showLibraryUI();
  // Render initial library
  await renderLibrary();
  // Reflect selection in sidebar
  renderSidebar();
}

function showSessionUI() {
  document.querySelector('.action-chips').style.display = '';
  document.getElementById('status-strip').hidden = false;  // renderer will hide if empty
  // Reset library scaffold if present
  const filters = document.getElementById('library-filters');
  if (filters) filters.remove();
}

function showLibraryUI() {
  document.querySelector('.action-chips').style.display = 'none';
  document.getElementById('status-strip').hidden = true;
}

async function renderLibrary() {
  const container = document.getElementById('sections-container');
  container.innerHTML = '<div class="state-msg">Loading library…</div>';

  const items = state.view === 'library-drafts'
    ? await collectAllDrafts()
    : await collectAllMentions();

  // Render filter bar
  let filtersEl = document.getElementById('library-filters');
  if (!filtersEl) {
    filtersEl = document.createElement('div');
    filtersEl.id = 'library-filters';
    filtersEl.className = 'library-filters';
    container.parentElement.insertBefore(filtersEl, container);
  }
  filtersEl.innerHTML = '';

  if (state.view === 'library-drafts') {
    filtersEl.appendChild(filterSelect('Lane', 'lane', [
      ['', 'All lanes'],
      ['x-post', 'X / Twitter'],
      ['reddit-comment', 'Reddit'],
      ['blog', 'Blog'],
      ['medium', 'Medium'],
      ['linkedin', 'LinkedIn'],
      ['substack', 'Substack'],
    ]));
    filtersEl.appendChild(filterSelect('Status', 'postedStatus', [
      ['all', 'All'],
      ['posted', 'Posted'],
      ['unposted', 'Unposted'],
    ]));
  } else {
    const sources = new Set(items.map(i => i.source).filter(Boolean));
    filtersEl.appendChild(filterSelect('Source', 'source',
      [['', 'All sources'], ...Array.from(sources).sort().map(s => [s, s])]));
  }
  filtersEl.appendChild(filterSearch());

  // Apply filters
  const f = state.libraryFilters;
  let filtered = items;
  if (state.view === 'library-drafts') {
    if (f.lane) filtered = filtered.filter(i => i.lane === f.lane);
    if (f.postedStatus === 'posted')   filtered = filtered.filter(i => !!i.posted);
    if (f.postedStatus === 'unposted') filtered = filtered.filter(i => !i.posted);
    if (f.search) {
      const q = f.search.toLowerCase();
      filtered = filtered.filter(i => (i.content || '').toLowerCase().includes(q));
    }
  } else {
    if (f.source) filtered = filtered.filter(i => i.source === f.source);
    if (f.search) {
      const q = f.search.toLowerCase();
      filtered = filtered.filter(i =>
        (i.quote || '').toLowerCase().includes(q) ||
        (i.thread_title || '').toLowerCase().includes(q) ||
        (i.watched_term || '').toLowerCase().includes(q)
      );
    }
  }

  // Render list
  container.innerHTML = '';
  if (filtered.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'state-msg';
    msg.textContent = items.length === 0
      ? `No ${state.view === 'library-drafts' ? 'drafts' : 'mentions'} yet across any session.`
      : 'No results match the current filters.';
    container.appendChild(msg);
    return;
  }
  const list = document.createElement('div');
  list.className = 'library-list';
  filtered.forEach(item => list.appendChild(state.view === 'library-drafts'
    ? renderDraftRow(item) : renderMentionRow(item)));
  container.appendChild(list);
}

function filterSelect(label, key, options) {
  const wrap = document.createElement('label');
  wrap.className = 'library-filter';
  wrap.innerHTML = `<span>${escapeHtml(label)}</span>`;
  const sel = document.createElement('select');
  options.forEach(([val, lbl]) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = lbl;
    if (state.libraryFilters[key] === val) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    state.libraryFilters[key] = sel.value;
    renderLibrary();
  });
  wrap.appendChild(sel);
  return wrap;
}

function filterSearch() {
  const wrap = document.createElement('label');
  wrap.className = 'library-filter library-filter-search';
  wrap.innerHTML = `<span>Search</span>`;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'filter…';
  input.value = state.libraryFilters.search || '';
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.libraryFilters.search = input.value;
      renderLibrary();
    }, 200);
  });
  wrap.appendChild(input);
  return wrap;
}

async function collectAllDrafts() {
  const out = [];
  for (const s of state.sessions) {
    const sess = await readJson(`${SKILL_DIR}/data/${s.date}/session.json`);
    const cards = sess?.sections?.progress_drafts?.cards || [];
    for (const c of cards) {
      if (c.type === 'draft') out.push({ ...c, source_date: s.date });
    }
  }
  // Newest first by source_date.
  out.sort((a, b) => (b.source_date || '').localeCompare(a.source_date || ''));
  return out;
}

async function collectAllMentions() {
  const out = [];
  for (const s of state.sessions) {
    const sess = await readJson(`${SKILL_DIR}/data/${s.date}/session.json`);
    const cards = sess?.sections?.mentions?.cards || [];
    for (const c of cards) {
      if (c.type === 'mention') out.push({ ...c, source_date: s.date });
    }
  }
  out.sort((a, b) => (b.source_date || '').localeCompare(a.source_date || ''));
  return out;
}

async function refreshArchiveCounts() {
  const drafts = await collectAllDrafts();
  const mentions = await collectAllMentions();
  state.archiveCounts.drafts = drafts.length;
  state.archiveCounts.mentions = mentions.length;
  renderSidebar();
}

function renderDraftRow(d) {
  const row = document.createElement('div');
  row.className = 'lib-row';
  row.innerHTML = `
    <div class="lib-row-head">
      <span class="lib-tag">${escapeHtml(d.lane || 'draft')}</span>
      <span class="lib-row-date">${escapeHtml(d.source_date || '')}</span>
      ${d.posted ? '<span class="lib-row-posted">✓ posted</span>' : ''}
      ${d.char_count != null ? `<span class="lib-row-meta">${d.char_count} chars</span>` : ''}
    </div>
    <div class="lib-row-body">${escapeHtml(truncate(d.content || '', 220))}</div>
  `;
  row.addEventListener('click', () => selectSession(d.source_date));
  return row;
}

function renderMentionRow(m) {
  const row = document.createElement('div');
  row.className = 'lib-row';
  row.innerHTML = `
    <div class="lib-row-head">
      <span class="lib-tag">${escapeHtml(m.source || '')}${m.sub ? ' · r/' + escapeHtml(m.sub) : ''}</span>
      <span class="lib-row-date">${escapeHtml(m.source_date || '')}</span>
      ${m.watched_term ? `<span class="lib-row-meta">on <b>${escapeHtml(m.watched_term)}</b></span>` : ''}
      ${m.actor ? `<span class="lib-row-meta">${escapeHtml(m.actor)}</span>` : ''}
    </div>
    <div class="lib-row-body">${escapeHtml(truncate(m.quote || m.thread_title || '', 220))}</div>
  `;
  row.addEventListener('click', () => selectSession(m.source_date));
  return row;
}

// ---- Persistence ---------------------------------------------------------

async function persistSession(session) {
  if (!state.selectedDate) return;
  const path = `${SKILL_DIR}/data/${state.selectedDate}/session.json`;
  if (!session.session_id) session.session_id = `${state.selectedDate}-${Date.now()}`;
  if (!session.started_at) session.started_at = new Date().toISOString();
  try {
    await writeJson(path, session);
    // Refresh sidebar metadata for this session.
    const meta = await loadSessionMeta(state.selectedDate);
    const idx = state.sessions.findIndex(s => s.date === state.selectedDate);
    if (idx >= 0) state.sessions[idx] = meta;
    renderSidebar();
    // Any section update may complete a running chip.
    notifyRunningChipsFromSession(session);
  } catch (err) {
    console.warn('[pulse] persist failed', err);
  }
}

// Walk session.sections and complete any running chip whose expected
// section has cards now. Conservative: only fires once cards arrive, not
// just on last_updated bumps.
function notifyRunningChipsFromSession(session) {
  if (!session?.sections) return;
  for (const [secId, sec] of Object.entries(session.sections)) {
    if (Array.isArray(sec.cards) && sec.cards.length > 0) {
      completeChipFromSectionUpdate(secId);
    }
  }
}

// ---- Status strip --------------------------------------------------------

async function loadStatusStrip() {
  // For phase B we read state/account-health.json + state/launches.json
  // and assemble a strip. If state/ doesn't exist yet, the strip stays
  // hidden (renderer handles empty case).
  const health = await readJson(`${SKILL_DIR}/state/account-health.json`, {});
  const launches = await readJson(`${SKILL_DIR}/state/launches.json`, []);
  const items = [];

  for (const [platform, info] of Object.entries(health || {})) {
    if (!info) continue;
    if (info.karma != null && info.karma_threshold) {
      items.push({ label: platform, value: `${info.karma}/${info.karma_threshold}`, tone: 'ok' });
    } else if (info.status) {
      items.push({ label: platform, value: '', tone: info.status === 'warm' ? 'ok' : 'warn' });
    }
  }

  for (const l of (launches || [])) {
    if (l.days_since != null) {
      items.push({ label: `${l.days_since}d since ${l.name}`, tone: 'neutral' });
    }
    if (l.followup_due) {
      items.push({ label: `${l.followup_due} due`, tone: 'due' });
    }
  }

  if (items.length > 0) {
    applyPageUpdate({ status_strip_patch: items });
  }
}

// ---- Pipeline chips -----------------------------------------------------
//
// Three chips, one per pipeline step:
//   - gather-local : runs scripts/gather-local.sh via /api/bash (no agent
//                    cost; result lands as a `progress` card in
//                    `progress_drafts`).
//   - gather-web   : sends a goal sentence to the chat; the agent reads
//                    the local cards already in conversation history,
//                    decides which Fetch* tools to call, and emits
//                    body_patch blocks for mentions/replies_due/
//                    discovery/signal sections.
//   - draft        : sends a goal sentence to draft posts for enabled
//                    target lanes from whatever cards exist; agent emits
//                    body_patch on progress_drafts with `draft` cards.
//
// Chip state machine: idle → running → done | failed. The JS flips state
// based on either the script's return (local) or the renderer's onChange
// signal (web / draft) firing within a CHIP_TIMEOUT_MS window.

const CHIP_TIMEOUT_MS = 120_000;  // 2 min — agent steps can be slow

const PIPELINE_CHIPS = {
  'gather-local': {
    handler: runGatherLocal,
    expects: ['progress_drafts'],   // sections that should update
  },
  'gather-web': {
    handler: runGatherWeb,
    expects: ['mentions', 'replies_due', 'discovery', 'signal'],
  },
  'draft': {
    handler: runDraft,
    expects: ['progress_drafts'],
  },
};

// Tracks chips that are currently running, so onChange can complete them.
const runningChips = new Map();   // chipId → { resolve, reject, timer, expects }

function setChipState(chipId, state) {
  const btn = document.querySelector(`.chip[data-chip="${chipId}"]`);
  if (btn) btn.dataset.state = state;
}

function startChip(chipId, expects) {
  setChipState(chipId, 'running');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const rec = runningChips.get(chipId);
      if (rec) {
        runningChips.delete(chipId);
        setChipState(chipId, 'failed');
        rec.reject(new Error(`chip "${chipId}" timed out after ${CHIP_TIMEOUT_MS}ms`));
      }
    }, CHIP_TIMEOUT_MS);
    runningChips.set(chipId, { resolve, reject, timer, expects });
  });
}

function completeChipFromSectionUpdate(sectionId) {
  // Walk running chips; if any was expecting this section, mark done.
  for (const [chipId, rec] of runningChips.entries()) {
    if (rec.expects && rec.expects.includes(sectionId)) {
      clearTimeout(rec.timer);
      runningChips.delete(chipId);
      setChipState(chipId, 'done');
      rec.resolve();
    }
  }
}

function failChip(chipId, err) {
  const rec = runningChips.get(chipId);
  if (rec) {
    clearTimeout(rec.timer);
    runningChips.delete(chipId);
    rec.reject(err);
  }
  setChipState(chipId, 'failed');
}

// ── Step 1: Gather local — script, no agent ──
async function runGatherLocal() {
  const expects = PIPELINE_CHIPS['gather-local'].expects;
  startChip('gather-local', expects).catch(() => {});  // resolved manually below
  try {
    const out = await runBash(`bash "${SKILL_DIR}/scripts/gather-local.sh"`);
    let data;
    try { data = JSON.parse(out); }
    catch (e) { throw new Error(`gather-local returned non-JSON: ${out.slice(0, 200)}`); }
    const card = buildProgressCardFromLocal(data);
    // Render directly — script-only step, no agent.
    applyPageUpdate({
      body_patch: { section: 'progress_drafts', cards: [card], last_updated: new Date().toISOString() },
    });
    // Inject the local activity into chat history (hidden) so the next
    // step (Gather web) and the Draft step have it in context. Without
    // this, the agent has no visibility into what the script rendered
    // on the page.
    await pushLocalContextToChat(data);
    completeChipFromSectionUpdate('progress_drafts');
  } catch (err) {
    console.warn('[pulse] gather-local failed', err);
    failChip('gather-local', err);
    throw err;
  }
}

async function pushLocalContextToChat(data) {
  if (!state.chat || !data) return;
  const items = data.items || [];
  if (items.length === 0) return;
  const byKind = items.reduce((acc, it) => { (acc[it.kind] ||= []).push(it); return acc; }, {});
  const lines = [
    '[CONTEXT BLOCK — gather-local result. NOT a task. Acknowledge silently.',
    'Do not reply with prose, summaries, or "no action needed" notes. Just store',
    'this for the next gather-web / draft step. Your next turn fires only when',
    'a chip goal arrives.]',
    '',
  ];
  if (data.window) {
    lines.push(`Window: ${data.window.since} → ${data.window.until} (${data.window.expanded_to})`);
  }
  if (data.workspace) lines.push(`Workspace: ${data.workspace}`);
  lines.push('');
  if (byKind.commit?.length) {
    lines.push(`Commits (${byKind.commit.length}):`);
    for (const c of byKind.commit.slice(0, 20)) {
      lines.push(`  - [${c.source}] ${c.label}`);
    }
    lines.push('');
  }
  const sessions = (byKind['session-cc'] || []).concat(byKind['session-ling'] || []);
  if (sessions.length) {
    lines.push(`Sessions (${sessions.length}):`);
    for (const s of sessions.slice(0, 10)) {
      lines.push(`  - [${s.source}] ${s.label} — ${s.body}`);
    }
    lines.push('');
    // Extract transcript content for the top 3 sessions so the agent has
    // real material (not just metadata) to pick topics from in gather-web.
    // Cap each transcript at ~2k chars to keep the context block bounded.
    const topSessions = sessions.slice(0, 3);
    for (const s of topSessions) {
      const excerpt = await extractSessionExcerpt(s);
      if (excerpt) {
        lines.push(`--- Session transcript: ${s.label} (${s.source}) ---`);
        lines.push(excerpt);
        lines.push('--- end transcript ---', '');
      }
    }
  }
  if (byKind.file?.length) {
    lines.push(`Recently changed files (${byKind.file.length}):`);
    for (const f of byKind.file.slice(0, 15)) {
      lines.push(`  - ${f.label}`);
    }
  }
  state.chat.sendHidden(lines.join('\n'));
}

// Use ling-mem's extract_session.sh to pull a flattened transcript for
// one session, capped at 2000 chars. Best-effort: if extraction fails or
// ling-mem isn't installed, we silently skip the transcript.
async function extractSessionExcerpt(session) {
  const extract = `$HOME/.linggen/skills/ling-mem/scripts/extract_session.sh`;
  const filepath = session.ref;
  const source = session.source;  // "CC" or "Linggen"
  const date = session.ts;
  if (!filepath || !source) return '';
  try {
    const cmd = `[ -x "${extract}" ] && bash "${extract}" "${filepath.replace(/"/g, '\\"')}" "${source}" "${date}" 2000 2>/dev/null | head -c 2000 || true`;
    const out = await runBash(cmd);
    return (out || '').trim();
  } catch {
    return '';
  }
}

function buildProgressCardFromLocal(data) {
  // Reserve fixed budgets per kind so a commit-heavy day doesn't crowd
  // sessions out of the card (which is what user reported when 8 commits
  // hid the CC/Linggen sessions entirely). Commits up to 8, sessions up
  // to 4, files folded into a single summary line.
  const COMMIT_BUDGET = 8;
  const SESSION_BUDGET = 4;
  const items = [];
  const byKind = (data.items || []).reduce((acc, it) => {
    (acc[it.kind] ||= []).push(it);
    return acc;
  }, {});
  for (const c of (byKind.commit || []).slice(0, COMMIT_BUDGET)) {
    items.push({ kind: 'shipped', text: c.label + (c.source ? ` _(${c.source})_` : '') });
  }
  const sessions = (byKind['session-cc'] || []).concat(byKind['session-ling'] || []);
  for (const s of sessions.slice(0, SESSION_BUDGET)) {
    const tag = s.kind === 'session-ling' ? 'Linggen' : 'CC';
    const meta = s.body ? ` _(${tag}, ${s.body})_` : ` _(${tag})_`;
    items.push({ kind: 'learned', text: s.label + meta });
  }
  const fileCount = (byKind.file || []).length;
  if (fileCount > 0) {
    items.push({ kind: 'fixed', text: `${fileCount} files changed in workspace` });
  }
  if (items.length === 0) {
    items.push({ kind: 'decision', text: 'No local activity in window — try expanding or check workspace path.' });
  }
  return {
    type: 'progress',
    id: `local-${Date.now()}`,
    window: data.window?.expanded_to || '24h',
    items,
  };
}

// ── Step 2: Gather web — agent reads local cards, picks queries ──
async function runGatherWeb() {
  const promise = startChip('gather-web', PIPELINE_CHIPS['gather-web'].expects);
  const goal = [
    'Gather web signal for what I\'m working on right now.',
    '',
    'Read the local cards already in this session (the `progress` card in `progress_drafts` lists my recent commits, sessions, and changed files). Pick 2-3 concrete topics that capture what I\'m actually working on this week.',
    '',
    'Then for each topic, call the most relevant configured source tools (FetchReddit, FetchHackerNews, FetchLobsters, FetchArxiv, FetchRSS, FetchGoogleTrendsDaily, FetchGitHubTrending) in parallel. Filter results for direct topical fit (score ≥ 0.6).',
    '',
    'For mention-watching, call FetchRedditMentions — uses public Reddit JSON, no auth required. Works whenever sites.reddit.username is set. Returns kind ∈ {mention, own_post, own_comment} for (a) threads where the handle appears, (b) the user\'s recent posts, (c) the user\'s recent comments. Surface all of these in the mentions section; map own_post / own_comment kinds to replies_due hints (the user wants to know if anyone replied).',
    '',
    'Also run public mention-watching: for each watchlist term (products + competitors + self extracted from brief, plus sites.reddit.username if set), search the same sources and surface threads where the term appears.',
    '',
    'Emit body_patch blocks for `signal`, `discovery`, `mentions`, and `replies_due` sections as appropriate. If nothing scored above the cutoff for a section, emit one `empty` card with a one-line reason.',
    '',
    'For `discovery` cards specifically: include BOTH `excerpt` (plain-text body of the thread, ~250 chars; strip markdown/HTML) AND `draft_starter` (your 2-4 sentence draft comment in voice). The page renders both inline so the user can read what the thread says and what you\'d post — no extra click. Drafting the discovery starter IS this step\'s job; this is the only place you draft. The separate Draft chip handles broadcast posts, not comment-on-thread starters.',
  ].join('\n');
  sendChatHidden(goal);
  return promise;
}

// ── Step 3: Draft — agent reads all cards, drafts for enabled lanes ──
async function runDraft() {
  const promise = startChip('draft', PIPELINE_CHIPS['draft'].expects);
  const goal = [
    'Draft posts for the enabled target lanes using the local + web cards already in this session.',
    '',
    'Read what\'s on the page: progress card (what I shipped/learned), signal cards (industry context), discovery cards (thread opportunities), mention cards (where I\'ve been mentioned).',
    '',
    'For each enabled lane in config.targets[*].enabled, generate one draft per lane following references/lane-templates.md constraints. Pass 1: claim + evidence + structure. Pass 2: voice rewrite against references/voice-samples.md. Pass 3: strip "🚀", "I\'m thrilled", "TL;DR", "Hot take", "game changer", "level up", "AI-powered", opening hashtag, closing "what do you think?".',
    '',
    'Emit body_patch for `progress_drafts` using `mode: "append"` so the new `draft` cards land alongside the existing progress card from gather-local (without `mode: "append"` the patch replaces the section, clobbering the progress card). Each draft card: { type:"draft", id, lane, content, char_count, char_limit?, title_candidates?, subtitle? }.',
    '',
    'If neither local nor web cards have enough signal to draft honestly (no shipped work, no real-world hook, no thread to comment on), emit one `empty` card with a one-line reason and skip drafting. Do not fabricate.',
  ].join('\n');
  sendChatHidden(goal);
  return promise;
}

function wireChips() {
  document.querySelectorAll('.chip[data-chip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const chipId = btn.dataset.chip;
      const conf = PIPELINE_CHIPS[chipId];
      if (!conf) return;
      // Cancel any in-flight cascade — explicit click takes precedence.
      cancelCascade();
      conf.handler().catch(err => console.warn(`[pulse] ${chipId} failed`, err));
    });
  });
}

// ---- Auto-cascade --------------------------------------------------------
//
// First open of the day: run all three steps in sequence with a tiny
// non-blocking toast. Cancellable. Skipped if today's session already has
// cards (so reopening the tab mid-day doesn't re-fire).

let cascadeStop = false;

function cancelCascade() {
  cascadeStop = true;
  const toast = document.getElementById('cascade-toast');
  if (toast) toast.hidden = true;
}

function showCascadeToast(label) {
  const toast = document.getElementById('cascade-toast');
  if (!toast) return;
  document.getElementById('cascade-toast-label').textContent = label;
  toast.hidden = false;
}

function hideCascadeToast() {
  const toast = document.getElementById('cascade-toast');
  if (toast) toast.hidden = true;
}

async function maybeAutoCascade() {
  if (state.selectedDate !== todayDate()) return;     // viewing past session
  const sess = getSession();
  // If any section already has cards, today's pipeline already ran. Skip.
  for (const sec of Object.values(sess?.sections || {})) {
    if (Array.isArray(sec.cards) && sec.cards.length > 0) return;
  }
  // Wait for chat to be ready, grants replayed, and init prompt sent
  // before firing agent steps. The first step (Gather local) is
  // script-only and doesn't need this, but steps 2/3 do.
  if (state.grantsReady) {
    try { await state.grantsReady(); } catch {}
  }
  if (state.initReady) {
    try { await state.initReady; } catch {}
  }
  cascadeStop = false;
  // Auto-cascade runs ONLY the two gather steps. Draft is user-triggered
  // because auto-drafting without lane / angle / polish input produces
  // generic posts the user won't use — wastes tokens. Cards from the
  // gather steps stay on the page; user clicks Draft when they have a
  // target in mind.
  const steps = [
    { id: 'gather-local', label: 'Gathering local activity…' },
    { id: 'gather-web',   label: 'Gathering web signal…' },
  ];
  for (const step of steps) {
    if (cascadeStop) break;
    showCascadeToast(step.label);
    try {
      await PIPELINE_CHIPS[step.id].handler();
    } catch (err) {
      console.warn(`[pulse] cascade step ${step.id} failed`, err);
      break;
    }
  }
  hideCascadeToast();
}

document.addEventListener('DOMContentLoaded', () => {
  const stopBtn = document.getElementById('cascade-toast-stop');
  if (stopBtn) stopBtn.addEventListener('click', cancelCascade);
});

// ---- Card actions --------------------------------------------------------

function wireCardActions() {
  document.getElementById('sections-container').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const cardId = btn.dataset.card;
    handleCardAction(action, cardId, btn);
  });
}

function handleCardAction(action, cardId, btn) {
  const card = findCard(cardId);
  if (!card && !['open-url'].includes(action)) return;

  switch (action) {
    case 'draft-reply':
    case 'draft-replies':
    case 'draft-starter':
      sendChatHidden(`Refine the ${card.type} draft for "${truncate(card.thread_title || card.your_post_title || card.title || '?', 60)}". Show the draft as an updated body_patch card so I can iterate.`);
      break;
    case 'reply-back':
      sendChatHidden(`Draft a reply to the new follow-up comment on my "${truncate(card.your_post_title || '?', 60)}" thread. Land it as a body_patch.`);
      break;
    case 'polish':
      sendChatHidden(`Polish the ${card.lane || 'draft'} draft (card id ${card.id}). Re-emit the body_patch with the tightened version.`);
      break;
    case 'open':
    case 'open-url': {
      const url = btn?.dataset?.url
        || card?.thread_url || card?.your_post_url || card?.url
        || (card?.follow_up?.comment_url);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      break;
    }
    case 'expand':
      sendChatHidden(`Expand on this signal item: ${card.title || card.source}. Emit a body_patch updating the card with more detail.`);
      break;
    case 'copy': {
      // Drafts carry .content; discovery cards carry .draft_starter; mention
      // cards may carry .quote as a fallback.
      const text = card?.content || card?.draft_starter || card?.quote || '';
      if (text) {
        navigator.clipboard.writeText(text);
        flash(btn, 'copied');
      }
      break;
    }
    case 'mark-posted':
      markCardPosted(cardId, btn);
      break;
    case 'discard':
    case 'dismiss':
    case 'dismiss-followup':
      removeCard(cardId);
      break;
    default:
      console.warn('[pulse] unknown action', action);
  }
}

function findCard(cardId) {
  if (!cardId) return null;
  const sess = getSession();
  for (const sec of Object.values(sess.sections || {})) {
    for (const c of (sec.cards || [])) {
      if (c.id === cardId) return c;
    }
  }
  return null;
}

function removeCard(cardId) {
  const sess = getSession();
  for (const [secId, sec] of Object.entries(sess.sections || {})) {
    const before = sec.cards?.length || 0;
    sec.cards = (sec.cards || []).filter(c => c.id !== cardId);
    if (sec.cards.length !== before) {
      sec.last_updated = new Date().toISOString();
      // Re-render and persist via the renderer's apply pipe.
      loadSession(sess);
      persistSession(sess);
      return;
    }
  }
}

async function markCardPosted(cardId, btn) {
  const card = findCard(cardId);
  if (!card) return;
  // Inline URL prompt rendered inside the card.
  const cardEl = btn?.closest('.card');
  if (!cardEl) return;
  if (cardEl.querySelector('.posted-prompt')) return;  // already open

  const prompt = document.createElement('div');
  prompt.className = 'posted-prompt';
  prompt.innerHTML = `
    <label>Where did you post it?</label>
    <div class="posted-prompt-row">
      <input type="url" placeholder="https://news.ycombinator.com/item?id=..." />
      <button class="primary" data-confirm>Save</button>
      <button class="dismiss" data-cancel>×</button>
    </div>
    <div class="posted-prompt-hint">Pulse will poll this thread for new replies on its next run.</div>
  `;
  cardEl.querySelector('.body').appendChild(prompt);
  const input = prompt.querySelector('input');
  input.focus();

  const confirm = async () => {
    const url = input.value.trim();
    if (!url) {
      input.style.borderColor = 'var(--red)';
      return;
    }
    const platform = inferPlatform(url);
    await appendPosted({
      id: `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      draft_id: card.id,
      url,
      platform,
      title: card.thread_title || card.your_post_title || (card.content || '').slice(0, 60),
      posted_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
      comment_ids_seen: [],
      responses: [],
    });
    // Update the card in-memory + on disk.
    card.posted = true;
    card.posted_url = url;
    card.posted_at = new Date().toISOString();
    const sess = getSession();
    loadSession(sess);
    persistSession(sess);
  };

  prompt.querySelector('[data-confirm]').addEventListener('click', confirm);
  prompt.querySelector('[data-cancel]').addEventListener('click', () => prompt.remove());
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirm(); });
}

function inferPlatform(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('news.ycombinator.com')) return 'hn';
    if (h.includes('reddit.com')) return 'reddit';
    if (h.includes('lobste.rs')) return 'lobsters';
    if (h === 'x.com' || h === 'twitter.com') return 'x';
    if (h.includes('linkedin.com')) return 'linkedin';
    if (h.includes('substack.com')) return 'substack';
    if (h.includes('medium.com')) return 'medium';
    return 'web';
  } catch { return 'web'; }
}

async function appendPosted(entry) {
  // Read state/posted.json, append the entry, write back.
  const path = `${SKILL_DIR}/state/posted.json`;
  let posted = await readJson(path, { '$schema_version': 1, posts: [] });
  if (!Array.isArray(posted.posts)) posted.posts = [];
  posted.posts.push(entry);
  await writeJson(path, posted);
}

function flash(btn, label) {
  const old = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = old; }, 900);
}

// ---- Chat panel ----------------------------------------------------------

async function mountChat() {
  // Wait for chat-bridge to register window.LinggenUI.
  for (let i = 0; i < 30; i++) {
    if (window.LinggenUI?.mount) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!window.LinggenUI?.mount) {
    console.warn('[pulse] LinggenUI.mount unavailable; chat disabled');
    return;
  }
  // PATCH the workspace grant onto whatever session this chat owns —
  // engine starts each session with SKILL.md grants only. The chat
  // session is separate from the draft session created in api.js, so we
  // must replay the user's configured workspace_path here too. Fires for
  // both fresh-created sessions and ones the iframe handshake assigns
  // mid-mount. Track the in-flight promise so the init prompt and the
  // first chip click can await it — guarantees the agent never sees a
  // permission prompt on a path the user has already configured.
  let pendingGrant = null;
  const grantOnce = (sid) => {
    console.log('[pulse] grantOnce called with', sid);
    if (!sid) { console.warn('[pulse] grantOnce: no sid — bail'); return; }
    pendingGrant = replayRuntimeGrants(sid).catch(e =>
      console.warn('[pulse] replay grants failed (from grantOnce)', e)
    );
  };
  state.grantsReady = () => pendingGrant || Promise.resolve();

  state.chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
    skillName: 'pulse',
    onSessionCreated: grantOnce,
    onContentBlock: (payload) => {
      // Forward PageUpdate tool calls to the renderer.
      if (payload?.tool === 'PageUpdate' && payload?.args) {
        try {
          const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
          applyPageUpdate(args);
        } catch (e) {
          console.warn('[pulse] failed to parse PageUpdate args', e);
        }
      }
    },
  });

  // If the session existed before mount (resumed iframe), onSessionCreated
  // won't fire — replay grants now using whatever id the bridge exposes.
  const fallbackSid = state.chat?.getSessionId?.();
  console.log('[pulse] mountChat post-mount fallback, getSessionId() =', fallbackSid);
  grantOnce(fallbackSid);

  // Inject the user's brief as a hidden init message after the grant
  // PATCH has landed — ensures the agent's first read on workspace_path
  // (which the init prompt invites) passes the permission gate without
  // a consent prompt. Same hidden-chat pattern as sys-doctor doctor.js.
  //
  // Exposed as state.initReady so the auto-cascade can await brief
  // injection before firing the first agent step. Without this, the
  // cascade's Gather web turn runs before the agent has the brief.
  state.initReady = (async () => {
    try {
      await state.grantsReady();
      await sendInitPrompt();
    } catch (e) {
      console.warn('[pulse] init-prompt failed', e);
    }
  })();
}

async function sendInitPrompt() {
  // Seed the agent with brief + workspace + pipeline contract as ground
  // truth, then ask for ONE visible greeting line. After the greeting,
  // the agent stays silent until a chip fires (the page sends each chip
  // goal as a hidden message — the agent's response is the on-page
  // artifact, not chat prose).
  if (!state.chat) return;
  const cfg = await readPulseConfig();
  const brief = (cfg?.brief || '').trim();
  const workspace = (cfg?.workspace_path || '').trim();
  if (!brief && !workspace) return;
  const lines = [
    'You are Ling, operating inside Pulse. Your full role + workflow is in SKILL.md — read it as your operational contract. Quick recap:',
    '- Pulse is NOT a coding task. There is no codebase to modify here.',
    '- You orchestrate a three-step pipeline (Gather local → Gather web → Draft) by emitting PageUpdate body_patch blocks. Cards on the page are the artifact; chat is only your control bus.',
    '- After this init, send ONE visible greeting (2-3 lines: introduce as Ling, reference ONE concrete brief detail, optional "I can help…" tied to active context). Then go silent until a chip goal arrives.',
    '- When a goal arrives, run the step per SKILL.md. Status narration in chat is short factual lines only. NEVER narrate "Done", "No code changes were needed", or acknowledgments of context blocks — silence is correct when there\'s nothing to surface on the page.',
  ];
  if (workspace) {
    lines.push('', `Workspace: ${workspace}`,
      'Read README, doc/, source files there to ground drafts in real product knowledge.');
  }
  if (brief) {
    lines.push('', 'Brief (case description, voice rules, hard rules):', brief);
  }
  state.chat.sendHidden(lines.join('\n'));
}

function sendChatMessage(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.send(text);
}

// sendChatHidden — for chip-fired goals and card-action prompts that
// orchestrate the agent but shouldn't appear as user messages in the
// chat panel. The agent's RESPONSE stays visible (status lines + the
// body_patch artifacts) — only the orchestration prompt is hidden.
// Use this for every internal trigger; reserve sendChatMessage for
// user-typed input that should be visible as theirs.
function sendChatHidden(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.sendHidden(text);
}

// ---- Chat panel drag-to-resize -------------------------------------------

const CHAT_WIDTH_KEY = 'pulse.chatWidth';
const CHAT_WIDTH_MIN = 320;
const CHAT_WIDTH_MAX = 900;

function wireChatResizer() {
  const app = document.querySelector('.app');
  const panel = document.getElementById('chat-panel');
  if (!app || !panel) return;

  // Restore persisted width.
  const saved = parseInt(localStorage.getItem(CHAT_WIDTH_KEY), 10);
  if (Number.isFinite(saved) && saved >= CHAT_WIDTH_MIN && saved <= CHAT_WIDTH_MAX) {
    app.style.setProperty('--chat-width', saved + 'px');
  }

  // Inject the drag handle on the panel's left edge.
  const handle = document.createElement('div');
  handle.className = 'chat-resizer';
  handle.title = 'Drag to resize chat panel';
  panel.prepend(handle);

  let dragging = false;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.classList.add('chat-resizing');
  });

  // Listen on document so the drag survives the cursor leaving the handle.
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, window.innerWidth - e.clientX));
    app.style.setProperty('--chat-width', w + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('chat-resizing');
    // Persist the final width.
    const cs = getComputedStyle(app).getPropertyValue('--chat-width').trim();
    const px = parseInt(cs, 10);
    if (Number.isFinite(px)) localStorage.setItem(CHAT_WIDTH_KEY, String(px));
  });
}

// ---- Settings modal ------------------------------------------------------
// Open settings.html as an in-page iframe overlay rather than navigating
// the top window. Navigating away would unmount the chat iframe and lose
// the conversation; the modal keeps pulse.html alive.

function wireSettingsModal() {
  const link = document.getElementById('settings-link');
  const modal = document.getElementById('settings-modal');
  const iframe = document.getElementById('settings-iframe');
  const closeBtn = document.getElementById('settings-close');
  if (!link || !modal || !iframe || !closeBtn) return;

  const open = (e) => {
    e?.preventDefault();
    // Reload src each open so any concurrent edits show fresh state.
    iframe.src = 'settings.html';
    modal.hidden = false;
  };
  const close = () => {
    modal.hidden = true;
    iframe.src = 'about:blank';  // unload to release any pending fetches
  };

  link.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
}

// ---- Helpers -------------------------------------------------------------

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ---- Init ----------------------------------------------------------------

async function init() {
  setOnChange(persistSession);
  await loadSidebar();
  // Auto-select today.
  const today = todayDate();
  await selectSession(today);
  await loadStatusStrip();
  wireChips();
  wireCardActions();
  wireChatResizer();
  wireSettingsModal();
  // Stop button on the cascade toast.
  document.getElementById('cascade-toast-stop')?.addEventListener('click', cancelCascade);
  await mountChat();
  // Lazy: archive counts after first paint so the sidebar shows real numbers.
  refreshArchiveCounts().catch(err => console.warn('[pulse] archive counts failed', err));
  // Auto-cascade on first open of today. Skipped if today's session already
  // has cards (mid-day reopen) or if the user is viewing a past session.
  maybeAutoCascade().catch(err => console.warn('[pulse] cascade failed', err));
}

init().catch(err => {
  console.error('[pulse] init failed', err);
  const c = document.getElementById('sections-container');
  if (c) c.innerHTML = `<div class="state-msg error">Pulse failed to initialize: ${escapeHtml(err.message || String(err))}</div>`;
});

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
