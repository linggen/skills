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

import { applyPageUpdate, loadSession, getSession, setOnChange, setSelfHandle, setCommentedThreadUrls, resetPage } from './page-render.js';
import { readPulseConfig, replayRuntimeGrants } from './api.js';

const SKILL_DIR = '$HOME/.linggen/skills/pulse';

// ---- App state -----------------------------------------------------------

const state = {
  // Active chat session id (the one the chat panel is attached to).
  // Set after chat-bridge mount; persisted-card storage is keyed by this.
  activeSessionId: null,
  // Currently-viewed session id (may differ from active if user clicked a
  // past session in the sidebar). Cards on the page reflect this.
  viewSessionId: null,
  sessions: [],            // [{ sid, title, created_at, last_run_at, unread_count, section_counts }]
  selectedSessions: new Set(),  // batch-delete: session ids the user has ticked
  chat: null,              // chat-bridge controller
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

// Relative time for individual session entries — "5m" / "2h" / "Yesterday"
// style. Used as the right-aligned timestamp on sidebar items.
function relativeAge(isoOrEpoch) {
  if (!isoOrEpoch) return '';
  const t = typeof isoOrEpoch === 'number' ? isoOrEpoch * 1000 : Date.parse(isoOrEpoch);
  if (isNaN(t)) return '';
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return 'now';
  if (diffMs < 3600_000) return `${Math.floor(diffMs / 60_000)}m`;
  if (diffMs < 86400_000) return `${Math.floor(diffMs / 3600_000)}h`;
  const days = Math.floor(diffMs / 86400_000);
  if (days < 30) return `${days}d`;
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Coarse time-period buckets matching the Linggen main-page sessions
// panel: TODAY / YESTERDAY / THIS WEEK / EARLIER. Avoids the noisy
// "one header per calendar date" layout of small daily clusters.
function sessionDateBucket(isoOrEpoch) {
  const t = typeof isoOrEpoch === 'number' ? isoOrEpoch * 1000 : Date.parse(isoOrEpoch);
  if (isNaN(t)) return { key: 'unknown', label: 'EARLIER', order: 4 };
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tsDate = new Date(t);
  const ts0 = new Date(tsDate.getFullYear(), tsDate.getMonth(), tsDate.getDate()).getTime();
  const dayDiff = Math.round((today0 - ts0) / 86400_000);
  if (dayDiff <= 0)  return { key: 'today',     label: 'TODAY',     order: 0 };
  if (dayDiff === 1) return { key: 'yesterday', label: 'YESTERDAY', order: 1 };
  if (dayDiff < 7)   return { key: 'this-week', label: 'THIS WEEK', order: 2 };
  if (dayDiff < 30)  return { key: 'this-month',label: 'THIS MONTH',order: 3 };
  return { key: 'earlier', label: 'EARLIER', order: 4 };
}

// ---- Sidebar -------------------------------------------------------------

async function loadSidebar() {
  // List all chat sessions created by pulse — scan ~/.linggen/sessions/
  // for session.yaml files with `skill: pulse`. Newest first. The page
  // also keeps its own per-session card store under
  // ~/.linggen/skills/pulse/data/<sess-id>/session.json so we can read
  // cards back for past sessions.
  // session.yaml stores `created_at` as a UNIX epoch (seconds). Pass it
  // through as a number so JS can do math on it directly — converting
  // to ISO in bash and back drops timezone fidelity and causes parsing
  // mismatches (the "UNDEFINED UNDEFINED" date header bug).
  const cmd = `for d in "$HOME"/.linggen/sessions/*/; do
    [ -f "$d/session.yaml" ] || continue
    skill=$(grep -m1 '^skill:' "$d/session.yaml" 2>/dev/null | sed -E 's/^skill:[[:space:]]*//; s/[[:space:]]*#.*$//; s/^"(.*)"$/\\1/; s/^'"'"'(.*)'"'"'$/\\1/')
    [ "$skill" = "pulse" ] || continue
    sid=$(basename "$d")
    title=$(grep -m1 '^title:' "$d/session.yaml" 2>/dev/null | sed 's/^title:[[:space:]]*//; s/^"\\(.*\\)"$/\\1/')
    created_at=$(grep -m1 '^created_at:' "$d/session.yaml" 2>/dev/null | sed 's/^created_at:[[:space:]]*//')
    # Fallback to dir mtime epoch if missing.
    if [ -z "$created_at" ]; then
      if [[ "$(uname)" == "Darwin" ]]; then
        created_at=$(stat -f "%m" "$d" 2>/dev/null)
      else
        created_at=$(stat -c "%Y" "$d" 2>/dev/null)
      fi
    fi
    # Strip non-numeric. Skip if still not a number.
    created_at=$(echo "$created_at" | tr -dc '0-9')
    [ -z "$created_at" ] && continue
    printf '{"sid":"%s","title":%s,"created_at":%s}\\n' "$sid" "$(jq -Rsn --arg t "$title" '$t')" "$created_at"
  done | jq -s 'sort_by(.created_at) | reverse | .[0:50]'`;
  let raw = '';
  try { raw = (await runBash(cmd)).trim(); } catch (e) { console.warn('[pulse] sidebar scan failed', e); }
  const list = raw ? JSON.parse(raw) : [];
  state.sessions = [];
  for (const entry of list) {
    state.sessions.push(await loadSessionMeta(entry));
  }
  // Make sure the active session (just created this page-load) is in the
  // list even if the YAML scan hasn't picked it up yet — it can take a
  // moment for session.yaml to be written.
  if (state.activeSessionId && !state.sessions.find(s => s.sid === state.activeSessionId)) {
    state.sessions.unshift({
      sid: state.activeSessionId,
      title: 'pulse session',
      created_at: new Date().toISOString(),
      last_run_at: null,
      section_counts: {},
      unread_count: 0,
    });
  }
  renderSidebar();
}

async function loadSessionMeta(entry) {
  const sess = await readJson(`${SKILL_DIR}/data/${entry.sid}/session.json`);
  const base = {
    sid: entry.sid,
    title: entry.title || 'pulse session',
    created_at: entry.created_at,
    last_run_at: null,
    section_counts: {},
    unread_count: 0,
  };
  if (!sess) return base;
  const sectionCounts = {};
  let unread = 0;
  for (const [secId, sec] of Object.entries(sess.sections || {})) {
    const n = (sec?.cards || []).filter(c => c.type !== 'empty').length;
    sectionCounts[secId] = n;
    unread += n;
  }
  return {
    ...base,
    last_run_at: sess.last_run_at,
    section_counts: sectionCounts,
    unread_count: unread,
  };
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  el.innerHTML = '';

  const sect = document.createElement('div');
  sect.className = 'side-section';

  const head = document.createElement('div');
  head.className = 'side-head';
  const lbl = document.createElement('div');
  lbl.className = 'side-label';
  lbl.textContent = 'Sessions';
  head.appendChild(lbl);

  if (state.selectedSessions.size > 0) {
    const bar = document.createElement('div');
    bar.className = 'side-batch-bar';
    const count = document.createElement('span');
    count.className = 'side-batch-count';
    count.textContent = `${state.selectedSessions.size} selected`;
    const delBtn = document.createElement('button');
    delBtn.className = 'side-batch-delete';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', deleteSelectedSessions);
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'side-batch-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      state.selectedSessions.clear();
      renderSidebar();
    });
    bar.append(count, delBtn, cancelBtn);
    head.appendChild(bar);
  }

  sect.appendChild(head);

  // Group by time-period bucket. Bucket objects come with .label and
  // .order so we can keep TODAY / YESTERDAY / THIS WEEK / … ordering
  // consistent regardless of session insertion order.
  const groups = new Map();   // key → { bucket, items: [...] }
  for (const s of state.sessions) {
    const bucket = sessionDateBucket(s.created_at);
    if (!groups.has(bucket.key)) groups.set(bucket.key, { bucket, items: [] });
    groups.get(bucket.key).items.push(s);
  }
  const ordered = Array.from(groups.values()).sort((a, b) => a.bucket.order - b.bucket.order);
  for (const { bucket, items } of ordered) {
    sect.appendChild(renderDateHeader(bucket, items));
    for (const s of items) {
      sect.appendChild(renderSidebarItem(s));
    }
  }
  el.appendChild(sect);
}

function renderDateHeader(bucket, items) {
  const hdr = document.createElement('div');
  hdr.className = 'side-date-header';
  const selectable = items.filter(s => s.sid !== state.activeSessionId);
  const selectedInGroup = selectable.filter(s => state.selectedSessions.has(s.sid)).length;
  const allSelected = selectable.length > 0 && selectedInGroup === selectable.length;

  if (selectable.length > 0) hdr.classList.add('clickable');
  if (allSelected) hdr.classList.add('all-selected');
  else if (selectedInGroup > 0) hdr.classList.add('partial-selected');

  const labelEl = document.createElement('span');
  labelEl.className = 'side-date-label';
  labelEl.textContent = bucket.label;
  hdr.appendChild(labelEl);

  if (selectedInGroup > 0) {
    const tag = document.createElement('span');
    tag.className = 'side-date-count';
    tag.textContent = `${selectedInGroup}/${selectable.length} selected`;
    hdr.appendChild(tag);
  }

  if (selectable.length > 0) {
    hdr.addEventListener('click', () => {
      if (allSelected) {
        for (const s of selectable) state.selectedSessions.delete(s.sid);
      } else {
        for (const s of selectable) state.selectedSessions.add(s.sid);
      }
      renderSidebar();
    });
  }
  return hdr;
}

function renderSidebarItem(s) {
  const item = document.createElement('div');
  item.className = 'side-item';
  const isViewed = s.sid === state.viewSessionId;
  const isActive = s.sid === state.activeSessionId;
  if (isViewed) item.classList.add('selected');
  if (state.selectedSessions.has(s.sid)) item.classList.add('checked');
  if (isActive) item.classList.add('active');
  item.dataset.sid = s.sid;
  item.addEventListener('click', () => selectSession(s.sid));

  if (!isActive) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'side-checkbox';
    cb.checked = state.selectedSessions.has(s.sid);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cb.checked) state.selectedSessions.add(s.sid);
      else state.selectedSessions.delete(s.sid);
      renderSidebar();
    });
    item.appendChild(cb);
  }

  // Skill icon (purple sparkle) — matches the Linggen main-page style
  // where every skill-created session gets the same iconography.
  const icon = document.createElement('span');
  icon.className = 'side-icon';
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l1.5 5 5 1.5-5 1.5L12 15l-1.5-5-5-1.5 5-1.5L12 2zm7 11l.8 2.7L22.5 16l-2.7.8L19 19.5l-.8-2.7-2.7-.8 2.7-.8L19 12.5z"/></svg>';
  item.appendChild(icon);

  const text = document.createElement('div');
  text.className = 'side-text';

  const nameRow = document.createElement('div');
  nameRow.className = 'side-name-row';
  const name = document.createElement('span');
  name.className = 'side-name';
  name.textContent = s.title || 'pulse session';
  nameRow.appendChild(name);
  const ts = document.createElement('span');
  ts.className = 'side-timestamp';
  ts.textContent = relativeAge(s.created_at);
  nameRow.appendChild(ts);
  text.appendChild(nameRow);

  const metaRow = document.createElement('div');
  metaRow.className = 'side-meta-row';
  const badge = document.createElement('span');
  badge.className = 'side-skill-badge';
  badge.textContent = 'skill';
  metaRow.appendChild(badge);
  if (s.unread_count > 0) {
    const sub = document.createElement('span');
    sub.className = 'side-sub';
    sub.textContent = sidebarSubText(s);
    metaRow.appendChild(sub);
  }
  text.appendChild(metaRow);

  item.appendChild(text);
  return item;
}

async function deleteSelectedSessions() {
  const sids = Array.from(state.selectedSessions);
  if (sids.length === 0) return;
  const label = sids.length === 1 ? 'this session' : `${sids.length} sessions`;
  if (!confirm(`Delete ${label} and all their cards? This can't be undone.`)) return;
  // Call the engine's DELETE /api/sessions for each session so the
  // in-memory SessionManager + GlobalSessions cache (which the main
  // Linggen app's session panel reads from) gets updated. Without this,
  // rm -rf'ing the session dirs leaves stale entries showing on the
  // main page until the engine restarts. The engine's delete handler
  // also wipes the per-session disk dir under ~/.linggen/sessions/,
  // so we only need to clean up our own per-session card store.
  const deleteOne = async (sid) => {
    const res = await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_root: '/tmp', session_id: sid }),
    });
    if (!res.ok) throw new Error(`DELETE /api/sessions ${res.status} for ${sid}`);
  };
  try {
    await Promise.all(sids.map(deleteOne));
    // Wipe per-session card folders (the engine doesn't know about these).
    const cardWipes = sids.map(sid => `rm -rf "${SKILL_DIR}/data/${sid}"`).join(' && ');
    await runBash(cardWipes);
  } catch (err) {
    console.warn('[pulse] batch delete failed', err);
    return;
  }
  const deletingViewed = state.selectedSessions.has(state.viewSessionId);
  state.sessions = state.sessions.filter(s => !state.selectedSessions.has(s.sid));
  state.selectedSessions.clear();
  if (deletingViewed) {
    const next = state.activeSessionId || state.sessions[0]?.sid;
    if (next) await selectSession(next);
    else renderSidebar();
  } else {
    renderSidebar();
  }
}

// Per-session subtitle line. Shows the card-section breakdown when the
// session produced output ("5 signal · 3 mention · 2 discovery"); falls
// back to "no cards" when the session is empty (e.g. just opened and
// nothing has run yet).
function sidebarSubText(s) {
  if (s.unread_count > 0 && s.section_counts) {
    const labels = { mentions: 'mention', replies_due: 'reply', discovery: 'discovery', signal: 'signal', progress_drafts: 'progress' };
    const parts = [];
    for (const [secId, n] of Object.entries(s.section_counts)) {
      if (n > 0 && labels[secId]) {
        parts.push(`${n} ${labels[secId]}${n > 1 && secId !== 'progress_drafts' ? 's' : ''}`);
      }
    }
    if (parts.length > 0) return parts.slice(0, 3).join(' · ');
  }
  return 'no cards';
}


// ---- Session selection ---------------------------------------------------

async function selectSession(sid) {
  // If picking a past session, navigate so the chat attaches to it too.
  // Active session = the one chat is currently attached to. Past =
  // anything else; clicking switches via URL param + reload (chat-bridge
  // can't re-mount on a different session mid-page).
  if (state.activeSessionId && sid !== state.activeSessionId) {
    const url = new URL(window.location.href);
    url.searchParams.set('session', sid);
    window.location.href = url.toString();
    return;
  }
  state.viewSessionId = sid;
  const sess = await readJson(`${SKILL_DIR}/data/${sid}/session.json`);
  loadSession(sess);
  const meta = state.sessions.find(s => s.sid === sid);
  const created = meta?.created_at ? new Date(meta.created_at).toLocaleString() : '';
  document.getElementById('session-title').textContent = meta?.title || 'pulse session';
  document.getElementById('session-sub').textContent = created
    ? `Started ${created}. Pick a chip above, or type a goal in chat.`
    : 'Pick a chip above, or type a goal in chat to start.';
  renderSidebar();
}

// ---- Persistence ---------------------------------------------------------

async function persistSession(session) {
  // Cards are stored per chat-session-id. We only persist for the
  // currently-viewed session — past sessions are read-only browsable.
  if (!state.viewSessionId) return;
  if (state.viewSessionId !== state.activeSessionId) return;
  const sid = state.viewSessionId;
  const path = `${SKILL_DIR}/data/${sid}/session.json`;
  if (!session.session_id) session.session_id = sid;
  if (!session.started_at) session.started_at = new Date().toISOString();
  try {
    await writeJson(path, session);
    const meta = state.sessions.find(s => s.sid === sid);
    const updated = await loadSessionMeta({
      sid,
      title: meta?.title || 'pulse session',
      created_at: meta?.created_at || new Date().toISOString(),
    });
    const idx = state.sessions.findIndex(s => s.sid === sid);
    if (idx >= 0) state.sessions[idx] = updated;
    else state.sessions.unshift(updated);
    renderSidebar();
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

// ── Step 1: Gather local — script collects raw, agent narrates ──
//
// Two phases:
//   1. Script collects raw items (commits, sessions, files) — fast, no LLM.
//   2. Page pushes raw items + session transcripts to chat (hidden) and
//      asks the agent for a NARRATIVE progress card. Agent emits a
//      body_patch that lands as the user-visible card.
//
// Why agent-led: raw `git log` subjects dumped verbatim are noise (8 lines
// of "pulse: simplify ... / filter ... / drop ...") for a single afternoon
// of one repo's work. Sessions add the "why" — what problem the user
// wrestled with — which the script can't extract. The agent has the brief
// + transcripts and can produce one shipped summary line + 2-3 specific
// learned bullets tied to actual discussion.
async function runGatherLocal() {
  const expects = PIPELINE_CHIPS['gather-local'].expects;
  // Hold the chip's "done" promise so the cascade can await it.
  // Previous version fire-and-forgot via `.catch(() => {})`, which let
  // the cascade move to gather-web before the agent had emitted the
  // progress card, queuing prompts and starving the page.
  const chipPromise = startChip('gather-local', expects);
  try {
    const out = await runBash(`bash "${SKILL_DIR}/scripts/gather-local.sh"`);
    let data;
    try { data = JSON.parse(out); }
    catch (e) { throw new Error(`gather-local returned non-JSON: ${out.slice(0, 200)}`); }

    if (!data.items || data.items.length === 0) {
      // Nothing to summarize — render an empty card directly, skip the
      // agent call (no point paying tokens to summarize nothing).
      applyPageUpdate({
        body_patch: { section: 'progress_drafts', last_updated: new Date().toISOString(), cards: [{
          type: 'progress',
          id: `local-empty-${Date.now()}`,
          window: data.window?.expanded_to || '24h',
          items: [{ kind: 'decision', text: 'No local activity in window — try expanding or check workspace path.' }],
        }] },
      });
      completeChipFromSectionUpdate('progress_drafts');
      return chipPromise;
    }

    // Push raw activity + transcripts to chat as hidden context, then ask
    // the agent for the narrative card. Background-refresh own-commented
    // URLs while the agent works.
    await pushLocalContextToChat(data);
    refreshCommentedThreadUrls().catch(() => {});
    sendChatHidden([
      'Based on the CONTEXT BLOCK above (yesterday\'s commits + session transcripts + changed files), emit ONE `body_patch` on `progress_drafts` with a single `progress` card. Replace mode (default — not append).',
      '',
      'Card shape:',
      '  { type: "progress", id: "local-<ts>", window: "<24h|7d|30d>", items: [',
      '    { kind: "shipped", text: "<ONE-line summary of all commits — group by repo/theme, ~120 chars. e.g. \'Pulse: simplified sidebar, filtered noise cards, dropped OAuth path.\'>" },',
      '    { kind: "learned", text: "<specific insight from a session transcript, ~120 chars. e.g. \'Reddit closed self-service API access in Nov 2025 — pivoted to public-JSON scraping only.\'>" },',
      '    // Up to 3 learned items total, each pulled from a real session transcript above. Skip if no session is worth surfacing.',
      '  ] }',
      '',
      'Hard rules:',
      '- ONE `shipped` line collapsing ALL commits into one phrase. Don\'t list commit subjects individually.',
      '- 1-3 `learned` lines tied to concrete moments in session transcripts (a pivot, a gotcha, a decision). Be specific — not "explored the codebase".',
      '- No "N files changed" line — mechanical noise.',
      '- Match the brief\'s voice. Strip "🚀", "I\'m thrilled", "TL;DR" if they sneak in.',
      '',
      'Emit just the body_patch. No prose response. Stay silent after.',
    ].join('\n'));
    // Chip flips to done when the agent's body_patch arrives on
    // progress_drafts — handled by persistSession → notifyRunningChipsFromSession.
    return chipPromise;
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
    // Extract transcript content for the top 5 sessions so the agent has
    // real material (not just metadata) for both the progress-card
    // narrative AND topic-picking in gather-web. Cap each transcript at
    // ~2k chars to keep the context block bounded (~10k total).
    const topSessions = sessions.slice(0, 5);
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
  sendChatHidden(lines.join('\n'));
}

// Pre-fetch the user's recent own_comment URLs from reddit-mentions.sh
// so the renderer's discovery filter knows which threads the user has
// already weighed in on. Runs once at init and after each gather-local
// (which is when fresh comments are most likely to have landed). Public-
// JSON only — no OAuth dependency. Failures are silent; the discovery
// filter just becomes a no-op.
async function refreshCommentedThreadUrls() {
  try {
    const out = await runBash(`bash "${SKILL_DIR}/scripts/sites/reddit-mentions.sh"`);
    const data = JSON.parse(out);
    const urls = (data?.items || [])
      .filter(it => it.kind === 'own_comment' && it.url)
      .map(it => it.url);
    setCommentedThreadUrls(urls);
  } catch (e) {
    console.warn('[pulse] refreshCommentedThreadUrls failed', e);
  }
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
    'For mention-watching, call FetchRedditMentions — uses public Reddit JSON, no auth required. Works whenever sites.reddit.username is set. Returns kind ∈ {mention, own_post, own_comment} for (a) threads where the handle appears, (b) the user\'s recent posts, (c) the user\'s recent comments.',
    '',
    'For each "mention" kind result, walk the thread tree (WebFetch <thread_url>.json) and emit a RICH mention card per the schema in SKILL.md: include `original_post`, `conversation` (first reply + latest if deep, with `collapsed_count`), and `draft_reply`. Map own_post / own_comment kinds to replies_due hints.',
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
  // Only cascade for a freshly-created session — i.e. the user opened
  // pulse without a ?session=<id> URL param. Clicking a past session in
  // the sidebar resumes it via ?session=<id>; that path is purely
  // static (cards + chat history from local storage; chips and chat
  // input still work if the user clicks them, but nothing fires
  // automatically). Without this gate, clicking an old session with no
  // cards would re-trigger the whole pipeline.
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('session')) return;
  if (state.viewSessionId !== state.activeSessionId) return;
  const sess = getSession();
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
    if (!sid) return;
    state.activeSessionId = sid;
    if (!state.viewSessionId) state.viewSessionId = sid;
    pendingGrant = replayRuntimeGrants(sid).catch(e =>
      console.warn('[pulse] replay grants failed', e)
    );
  };
  state.grantsReady = () => pendingGrant || Promise.resolve();

  // If URL has ?session=<id>, attach the chat panel to that session
  // instead of creating a new one. Lets the user click a past pulse
  // session in the sidebar and have chat reattach to it on reload.
  const urlParams = new URLSearchParams(window.location.search);
  const resumeSid = urlParams.get('session');

  state.chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
    skillName: 'pulse',
    sessionId: resumeSid || undefined,
    onSessionCreated: grantOnce,
    onContentBlock: (payload) => {
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
  grantOnce(fallbackSid);

  // Init prompt (greeting + brief seed) fires ONLY on freshly-created
  // sessions. Resumed past sessions (URL has ?session=<id>) already have
  // the brief in their chat history from the original session — no
  // re-sending. Without this gate, clicking any past session in the
  // sidebar would trigger a greeting LLM call, burning tokens (and
  // potentially hitting rate limits) just to view static cards.
  if (resumeSid) {
    state.initReady = Promise.resolve();
  } else {
    state.initReady = (async () => {
      try {
        await state.grantsReady();
        await sendInitPrompt();
      } catch (e) {
        console.warn('[pulse] init-prompt failed', e);
      }
    })();
  }
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
  sendChatHidden(lines.join('\n'));
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
//
// Sanitizes home-dir paths: `/Users/<username>/foo` → `~/foo`. Small
// local models (qwen3.6, etc.) latch onto the username segment and
// hallucinate GitHub URLs like `github.com/<username>/...` in drafts.
// The username is the OS user, not a handle — strip it before the
// model ever sees it. Discovered after qwen3.6 fabricated
// `github.com/lianghuang/linggen` in a comment draft.
function sendChatHidden(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.sendHidden(sanitizeHomePaths(text));
}

let cachedHomeDir = null;
async function getHomeDir() {
  if (cachedHomeDir != null) return cachedHomeDir;
  try {
    const out = await runBash('printf "%s" "$HOME"');
    cachedHomeDir = (out || '').trim() || null;
  } catch { cachedHomeDir = null; }
  return cachedHomeDir;
}
// Synchronous variant of the substitution. Reads cachedHomeDir; safe
// to call before getHomeDir() resolves (just no-ops on first send).
function sanitizeHomePaths(text) {
  if (!text || !cachedHomeDir) return text;
  // Replace /Users/<name>/ → ~/ and bare /Users/<name> → ~
  const home = cachedHomeDir;
  return text.split(home + '/').join('~/').split(home).join('~');
}
// Kick off home-dir lookup so the cache is populated by the time the
// first hidden push happens.
getHomeDir().catch(() => {});

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
  try {
    const cfg = await readPulseConfig();
    const handle = (cfg?.sites?.reddit?.username || '').trim();
    if (handle) {
      setSelfHandle(handle);
      refreshCommentedThreadUrls().catch(err => console.warn('[pulse] own-comments prefetch', err));
    }
  } catch {}
  wireChips();
  wireCardActions();
  wireChatResizer();
  wireSettingsModal();
  document.getElementById('cascade-toast-stop')?.addEventListener('click', cancelCascade);
  // Mount chat first so we know the active session id. Sidebar load
  // depends on it (the active session is pinned to the top of the list
  // even before its session.yaml has been written).
  await mountChat();
  await loadSidebar();
  // Select the session indicated by ?session=<id>, else the active one.
  const urlParams = new URLSearchParams(window.location.search);
  const initialSid = urlParams.get('session') || state.activeSessionId;
  if (initialSid) {
    state.viewSessionId = initialSid;
    const sess = await readJson(`${SKILL_DIR}/data/${initialSid}/session.json`);
    loadSession(sess);
    const meta = state.sessions.find(s => s.sid === initialSid);
    document.getElementById('session-title').textContent = meta?.title || 'pulse session';
    document.getElementById('session-sub').textContent = 'Pick a chip above, or type a goal in chat to start.';
    renderSidebar();
  }
  await loadStatusStrip();
  // Auto-cascade only on the active session (not on a resumed past session).
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
