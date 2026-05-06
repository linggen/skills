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

const SKILL_DIR = '$HOME/.linggen/skills/pulse';

// ---- App state -----------------------------------------------------------

const state = {
  selectedDate: null,
  sessions: [],   // [{ date, started_at, last_run_at, run_count, sample_goal, unread_count }]
  chat: null,     // chat-bridge controller
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
  arc.appendChild(staticItem('📝 Drafts', countAcrossSessions(s => s.draftCount)));
  arc.appendChild(staticItem('@ Mentions', countAcrossSessions(s => s.mentionCount)));
  el.appendChild(arc);
}

function countAcrossSessions(_) { return '—'; }  // stub: cheap placeholder; fill in later

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
  // Reload session content
  const sess = await readJson(`${SKILL_DIR}/data/${date}/session.json`);
  loadSession(sess);  // renderer applies it
  // Update header
  const meta = state.sessions.find(s => s.date === date);
  document.getElementById('session-title').textContent =
    `${dateLabelRelative(date)} · ${meta?.run_count || 0} runs`;
  document.getElementById('session-sub').textContent = meta?.sample_goal
    ? `Last goal: "${truncate(meta.sample_goal, 80)}"`
    : 'Click + New run, or use a chip above, to start.';
  // Update sidebar selection
  renderSidebar();
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

const CHIP_GOALS = {
  'new-run':        { goal: '', focus: true },
  'refresh':        { goal: 'Re-run today\'s saved goal.' },
  'find-threads':   { goal: 'Find threads worth commenting on across configured Reddit subs and HN.' },
  'check-mentions': { goal: 'Check for mentions of my product or competitors, and triage replies on threads I\'ve posted to.' },
  'recap':          { goal: 'Generate a recap of this week — what shipped, what learned, drafted as a blog or substack post.' },
  'more':           { goal: '' },  // TODO: dropdown
};

function wireChips() {
  document.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.chip;
      const conf = CHIP_GOALS[type];
      if (!conf) return;
      if (conf.goal) {
        sendChatMessage(conf.goal);
      } else if (conf.focus) {
        // "+ New run" — surface the chat without a preset
        focusChat();
      }
    });
  });
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
      markCardPosted(cardId);
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

function markCardPosted(cardId) {
  const sess = getSession();
  const card = findCard(cardId);
  if (!card) return;
  card.posted = true;
  card.posted_at = new Date().toISOString();
  loadSession(sess);
  persistSession(sess);
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
  state.chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
    skillName: 'pulse',
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
}

function sendChatMessage(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.send(text);
}

function focusChat() {
  // No direct "focus iframe input" hook yet; just visually pulse.
  const panel = document.getElementById('chat-panel');
  if (panel) {
    panel.style.transition = 'box-shadow 0.2s';
    panel.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { panel.style.boxShadow = ''; }, 600);
  }
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
  await mountChat();
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
