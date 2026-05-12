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
  } catch (err) {
    console.warn('[pulse] persist failed', err);
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

// ---- Action chips --------------------------------------------------------

// Each chip = a preset goal sentence the agent dispatches on. The five
// chips map 1:1 to the five engine-internal capabilities (draft-content
// pairs into Daily post + Recap because it never runs alone).
const CHIP_GOALS = {
  'daily-post':     { goal: 'Daily short post if I shipped or learned something yesterday.' },
  'find-threads':   { goal: 'Find threads worth commenting on across configured Reddit subs and HN.' },
  'check-mentions': { goal: 'Check for mentions of my product or competitors, and triage replies on threads I\'ve posted to.' },
  'scan-signal':    { goal: 'What\'s happening in my space — competitive landscape and trending topics.' },
  'recap':          { goal: 'Generate a recap of this week — what shipped, what learned, drafted as a blog or substack post.' },
};

const MORE_ACTIONS = {
  'refresh':        () => sendChatMessage('Re-run today\'s most recent goal.'),
  'draft-from-url': () => {
    const url = window.prompt('Draft from URL — paste a link to your blog post, GitHub release, or other artifact:');
    if (!url) return;
    sendChatMessage(`Broadcast my artifact at ${url.trim()} — draft posts for the configured target lanes and surface threads where it would land.`);
  },
};

function wireChips() {
  document.querySelectorAll('.chip[data-chip]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.dataset.chip;
      if (type === 'more') {
        e.stopPropagation();
        toggleMoreMenu();
        return;
      }
      const conf = CHIP_GOALS[type];
      if (conf?.goal) sendChatMessage(conf.goal);
    });
  });
  document.querySelectorAll('.chip-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeMoreMenu();
      const action = MORE_ACTIONS[btn.dataset.more];
      if (action) action();
    });
  });
  // Close the menu when clicking elsewhere.
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('chip-more-menu');
    if (menu && !menu.hidden && !e.target.closest('.chip-menu-wrap')) closeMoreMenu();
  });
}

function toggleMoreMenu() {
  const menu = document.getElementById('chip-more-menu');
  if (menu) menu.hidden = !menu.hidden;
}

function closeMoreMenu() {
  const menu = document.getElementById('chip-more-menu');
  if (menu) menu.hidden = true;
}

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
      sendChatMessage(`Refine the ${card.type} draft for "${truncate(card.thread_title || card.your_post_title || card.title || '?', 60)}". Show me the draft and let me iterate.`);
      break;
    case 'reply-back':
      sendChatMessage(`Draft a reply to the new follow-up comment on my "${truncate(card.your_post_title || '?', 60)}" thread.`);
      break;
    case 'polish':
      sendChatMessage(`Polish the ${card.lane || 'draft'} draft below. I'll tell you how I want it tightened in a follow-up.`);
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
      sendChatMessage(`Expand on this signal item: ${card.title || card.source}`);
      break;
    case 'copy':
      if (card?.content) {
        navigator.clipboard.writeText(card.content);
        flash(btn, 'copied');
      }
      break;
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
  setTimeout(async () => {
    try {
      await state.grantsReady();
      await sendInitPrompt();
    } catch (e) {
      console.warn('[pulse] init-prompt failed', e);
    }
  }, 1500);
}

async function sendInitPrompt() {
  if (!state.chat) return;
  const cfg = await readPulseConfig();
  const brief = (cfg?.brief || '').trim();
  const workspace = (cfg?.workspace_path || '').trim();
  if (!brief && !workspace) return;
  const lines = [
    'The user just opened Pulse. You are Ling, operating inside Pulse — an agent-led GTM app for solo founders. You drive the dashboard (via `body_patch` blocks) and the logic (capability dispatch). The chat panel beside the dashboard is how the user talks to you. Treat the following as ground truth for every run in this session.',
  ];
  if (workspace) {
    lines.push('', `Workspace: ${workspace}`,
      'Read README, doc/, and source files there to ground drafts in real product knowledge.');
  }
  if (brief) {
    lines.push('', 'Brief (case description, voice rules, hard rules):', brief);
  }
  lines.push('',
    'Now greet the user — they just opened the app and want to feel a smart personal assistant on the other side of the chat. Follow this shape:',
    '',
    '  Line 1: Introduce yourself as Ling, their personal assistant inside Pulse.',
    '  Line 2: Show you absorbed the brief — reference ONE concrete detail (the product, current launch state, or active context). Not a summary; a specific reference.',
    '  Line 3: Surface 2-3 things you could help with TODAY, chosen from what is actually pertinent to the brief\'s active context — e.g. drafting a daily post if there\'s recent shipping, checking for mentions, triaging replies on threads they posted, surfacing fresh threads worth commenting on, scanning industry signal, or a weekly recap. Phrase as "I can…" options, not a menu.',
    '',
    'Hard constraints on the greeting:',
    '- 3-4 short lines total. Warm but not gushy.',
    '- No "I\'m thrilled", "happy to help", "let me know", "what do you think". No emojis. No closing CTA.',
    '- Do NOT summarize the brief back to them. They wrote it.',
    '- Do NOT list every capability you have. Pick what fits the brief\'s active context right now.',
    '- After this greeting, stay silent until the user types a goal or clicks a chip.');
  state.chat.sendHidden(lines.join('\n'));
}

function sendChatMessage(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.send(text);
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
  await mountChat();
  // Lazy: archive counts after first paint so the sidebar shows real numbers.
  refreshArchiveCounts().catch(err => console.warn('[pulse] archive counts failed', err));
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
