// pulse-app.js — review UI for the pulse skill.
//
// Reads the daily draft JSON written by a saved Pulse run (or
// any on-demand draft run) from ~/.linggen/skills/pulse/data/<date>.json
// and renders summary, external sources, and drafts with copy buttons.
//
// When the user opens the page (no `source=mission` query param) and
// today's data file is missing, this view auto-starts a drafting
// session in an embedded Linggen chat panel and polls for the JSON to
// land. Saved-run deep-link opens (`source=mission`) skip the auto-trigger
// and just display whatever's already on disk.
//
// Sys-doctor pattern: the page itself runs context-collection bash
// (`scripts/collect.sh`) via /api/bash from the iframe — that path is
// ungated by Linggen's agent permission system, so the user never sees
// an admin prompt. The agent only does themes/external-search/drafting
// and writes the final JSON; SKILL.md's permission block pre-authorizes
// its read+write footprint on ~/.linggen/skills/pulse + /tmp.

import { applyPageUpdate, resetPage } from './page-render.js';

const DATA_DIR = '~/.linggen/skills/pulse/data';

// ---- DOM refs ---------------------------------------------------------

const els = {
  dateInput: document.getElementById('date-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  redraftBtn: document.getElementById('redraft-btn'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  empty: document.getElementById('empty'),
  drafting: document.getElementById('drafting'),
  draftingChat: document.getElementById('drafting-chat'),
  content: document.getElementById('content'),
  summaryList: document.getElementById('summary-list'),
  weightTag: document.getElementById('weight-tag'),
  sourcesCard: document.getElementById('sources-card'),
  sourcesList: document.getElementById('sources-list'),
  draftsSection: document.getElementById('drafts-section'),
  draftsList: document.getElementById('drafts-list'),
};

// Track an in-flight auto-trigger so we don't spawn duplicates on
// rapid date changes / refresh clicks.
let activeDraftRun = null;

// ---- Init -------------------------------------------------------------

function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isMissionTriggered() {
  // Saved-run notifications deep-link with `?source=mission` so the page
  // shows whatever the agent already wrote and never auto-triggers a
  // second run. User-opened paths (skill card click, direct URL) omit
  // this param and may auto-trigger when today's data is missing.
  return new URLSearchParams(location.search).get('source') === 'mission';
}

function init() {
  const params = new URLSearchParams(location.search);
  const initialDate = params.get('date') || todayLocal();
  els.dateInput.value = initialDate;

  els.refreshBtn.addEventListener('click', () => loadDate(els.dateInput.value));
  els.dateInput.addEventListener('change', () => {
    syncRedraftButton();
    loadDate(els.dateInput.value);
  });
  els.redraftBtn.addEventListener('click', () => redraftToday());

  syncRedraftButton();
  loadDate(initialDate);
}

// Re-draft only makes sense for today — collect.sh scans the last 24h
// window relative to wall-clock now, so re-running for a past date
// would produce data tagged with that date but reflecting today's
// activity. Disable the button outside today.
function syncRedraftButton() {
  const isToday = els.dateInput.value === todayLocal();
  els.redraftBtn.disabled = !isToday;
  els.redraftBtn.title = isToday
    ? "Discard today's data and run the drafting agent again"
    : 'Re-draft is only available for today';
}

async function redraftToday() {
  const date = todayLocal();
  // If the existing file has actual drafts, confirm before nuking.
  // Skip files (or no file) go straight through.
  let existing = null;
  try { existing = await fetchDraftJson(date); } catch (_) { /* treat as none */ }
  if (existing && !existing.skipped && (existing.drafts || []).length > 0) {
    const ok = confirm(`Today's data has ${existing.drafts.length} draft(s). Re-drafting will overwrite them. Continue?`);
    if (!ok) return;
  }

  // Delete both today's file and latest.json so the page falls back
  // to the no-data branch and auto-triggers a fresh agent run.
  const cmd = `rm -f "$HOME/.linggen/skills/pulse/data/${date}.json" "$HOME/.linggen/skills/pulse/data/latest.json"`;
  try {
    const res = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_root: '/tmp', command: cmd }),
    });
    if (!res.ok) throw new Error(`bash ${res.status}`);
  } catch (err) {
    showError(`Failed to clear today's data: ${err.message || err}`);
    return;
  }

  els.dateInput.value = date; // snap back to today in case the user navigated away
  loadDate(date); // no-data → today → user-opened → startDraftRun
}

// ---- Data loading -----------------------------------------------------

async function loadDate(date) {
  // Switching dates while a draft run is in flight: tear it down.
  // The agent session keeps running server-side but we stop watching it.
  if (activeDraftRun) {
    try { activeDraftRun.cancel(); } catch (_) { /* ignore */ }
    activeDraftRun = null;
  }

  showOnly('loading');
  // Surface module-import / runtime issues that would otherwise leave
  // the page blank. If page-render.js failed to load, applyPageUpdate
  // is undefined; better to fail loudly in the error pane than show a
  // mysterious empty viewport.
  if (typeof applyPageUpdate !== 'function' || typeof resetPage !== 'function') {
    showError('Pulse scripts failed to load. Open DevTools → Network and check page-render.js returns 200, then hard-refresh (Cmd+Shift+R).');
    return;
  }
  try {
    const data = await fetchDraftJson(date);
    if (data) {
      if (data.skipped) showSkipped(data);
      else render(data);
      return;
    }

    // No data on disk. Auto-trigger only when (a) the user opened the
    // page (no `source=mission`), and (b) they're looking at today.
    // Past dates with no data stay empty — re-running yesterday's
    // collect.sh window now would scan the wrong 24h.
    if (!isMissionTriggered() && date === todayLocal()) {
      await startDraftRun(date);
      return;
    }

    showEmpty(`No drafts found for ${date}. The pulse skill writes to ${DATA_DIR}/${date}.json — run a saved Pulse run or invoke pulse manually to generate.`);
  } catch (err) {
    showError(`Failed to load drafts: ${err.message || err}`);
  }
}

// Phase ordering for the drafting progress widget. The agent updates
// the widget via PageUpdate(body_patch); these constants are also used
// for the page's own initial seed and the all-done sweep at the end.
const DRAFTING_PHASES = [
  { id: 'gather',   icon: '📥', label: 'Gather context (sessions, commits, memory)' },
  { id: 'themes',   icon: '🧭', label: 'Extract themes' },
  { id: 'external', icon: '🌐', label: 'Find external signal' },
  { id: 'draft',    icon: '✍️', label: 'Draft posts (X / medium / blog)' },
  { id: 'write',    icon: '💾', label: 'Write output JSON' },
];

function buildProgressWidget(activeId, doneIds = new Set()) {
  const idx = DRAFTING_PHASES.findIndex(p => p.id === activeId);
  return {
    type: 'progress',
    title: 'Drafting today\'s posts',
    steps: DRAFTING_PHASES.map((p, i) => ({
      icon: p.icon,
      label: p.label,
      status: doneIds.has(p.id) || (idx >= 0 && i < idx) ? 'done'
            : i === idx ? 'active'
            : 'pending',
    })),
  };
}

function buildAllDoneProgressWidget() {
  return {
    type: 'progress',
    title: 'Drafting today\'s posts',
    steps: DRAFTING_PHASES.map(p => ({ icon: p.icon, label: p.label, status: 'done' })),
  };
}

async function runCollectScript() {
  // Sys-doctor pattern: the page itself runs collect.sh via /api/bash.
  // That call path is ungated by Linggen's agent permission system, so
  // the user never sees an admin prompt for the bash work. The agent
  // gets the resulting manifest path in its kickoff prompt and only
  // does Read+Write+web-search work — fully covered by SKILL.md's
  // permission block.
  const cmd = 'bash "$HOME/.linggen/skills/pulse/scripts/collect.sh"';
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command: cmd }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  const path = (body.stdout || '').trim().split('\n').pop();
  if (!path || !path.includes('pulse-manifest')) {
    throw new Error(`collect.sh produced unexpected output: ${path || '(empty)'}`);
  }
  return path;
}

// Cross-tab lock: when a draft run starts we drop a sentinel in
// localStorage; on page load we check for a recent sentinel before
// kicking off a fresh run. Stops a refresh-during-redraft from
// spawning two agents that race to write the same file.
const RUN_LOCK_KEY = 'pulse:draft-run';
const RUN_LOCK_STALE_MS = 12 * 60_000; // longer than the agent timeout

function readRunLock() {
  try {
    const raw = localStorage.getItem(RUN_LOCK_KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw);
    if (!lock || typeof lock !== 'object') return null;
    if (Date.now() - (lock.startedAt || 0) > RUN_LOCK_STALE_MS) return null;
    return lock;
  } catch (_) { return null; }
}

function writeRunLock(date) {
  try {
    localStorage.setItem(RUN_LOCK_KEY, JSON.stringify({ date, startedAt: Date.now() }));
  } catch (_) { /* ignore */ }
}

function clearRunLock() {
  try { localStorage.removeItem(RUN_LOCK_KEY); } catch (_) { /* ignore */ }
}

async function startDraftRun(date) {
  // If another tab / earlier session already has an active run for the
  // same date, don't spawn a duplicate. Show the drafting view, seed
  // the progress widget, and just poll for the file — the in-flight
  // agent will produce it.
  const existingLock = readRunLock();
  const pickUpExisting = existingLock && existingLock.date === date;

  showOnly('drafting');
  els.draftingChat.innerHTML = '';
  resetPage();

  // Seed the left panel immediately so the user sees something while
  // collect.sh runs and the chat iframe boots.
  applyPageUpdate({
    top_bar: [{
      type: 'info',
      icon: '🪄',
      title: 'Pulse',
      subtitle: pickUpExisting
        ? 'Picking up an in-flight drafting run from another tab/session'
        : 'Drafting your posts from the last 24 hours of work',
    }],
    body: [
      buildProgressWidget('gather'),
      {
        type: 'info',
        icon: '⏳',
        title: 'Working',
        body: pickUpExisting
          ? 'A drafting run is already in flight (started in another tab or before this refresh). Waiting for the JSON file to land — this page will swap automatically when it does.'
          : 'The page is collecting your sessions, commits, and memory rows. Then the agent (right panel) will scan external sources and draft posts. This usually takes 1–3 minutes.',
      },
    ],
  });

  let chat = null;
  let cancelled = false;
  let pollTimer = null;

  // Two-stage teardown: stopWatching just halts the poll loop and
  // marks the run inactive. destroyChat additionally rips the iframe
  // out of the DOM. Success path stops watching but leaves the chat
  // intact so the user can scroll back through the agent's messages;
  // only cancel/timeout actually destroys the iframe.
  const stopWatching = () => {
    cancelled = true;
    if (pollTimer) clearTimeout(pollTimer);
    activeDraftRun = null;
    clearRunLock();
  };
  const destroyChat = () => {
    if (chat) {
      try { chat.destroy(); } catch (_) { /* ignore */ }
      chat = null;
    }
  };
  const cleanup = () => { stopWatching(); destroyChat(); };
  activeDraftRun = { cancel: cleanup };

  // If we're picking up an existing run, skip the heavy work
  // (collect.sh, chat mount, kickoff prompt) and jump straight to the
  // file-poll loop. The in-flight agent will write the JSON when done.
  if (pickUpExisting) {
    const startedAt = Date.now();
    const TIMEOUT_MS = 12 * 60_000;
    const tick = async () => {
      if (cancelled) return;
      let data = null;
      try { data = await fetchDraftJson(date); } catch (_) { /* keep polling */ }
      if (cancelled) return;
      if (data) {
        applyPageUpdate({ body_patch: [{ widget: buildAllDoneProgressWidget() }] });
        stopWatching();
        if (data.skipped) showSkipped(data);
        else render(data);
        return;
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        cleanup();
        showError('No JSON appeared from the in-flight run within 12 minutes. The earlier agent may have stalled — click Re-draft to start a fresh run.');
        return;
      }
      pollTimer = setTimeout(tick, 5000);
    };
    pollTimer = setTimeout(tick, 2000);
    return;
  }

  // Fresh run — claim the lock so a parallel refresh picks up.
  writeRunLock(date);

  // Run collect.sh client-side first; we want the manifest path before
  // we send the kickoff prompt so the agent has it from turn 1.
  let manifestPath;
  try {
    manifestPath = await runCollectScript();
  } catch (err) {
    cleanup();
    showError(`Context collection failed: ${err.message || err}`);
    return;
  }
  if (cancelled) return;

  // Track whether the agent has produced any output so we can detect
  // a missed-handshake and retry the kickoff prompt.
  let chatReceived = false;

  try {
    chat = await window.LinggenUI.mount(els.draftingChat, {
      skillName: 'pulse',
      onStreamToken: () => { chatReceived = true; },
      onContentBlock: (payload) => {
        chatReceived = true;
        // The engine auto-injects a `PageUpdate` data tool for app-mode
        // skills. When the agent calls it, the args carry the page
        // partial — forward into the renderer.
        if (payload?.tool === 'PageUpdate' && payload?.args) {
          try {
            const args = typeof payload.args === 'string'
              ? JSON.parse(payload.args)
              : payload.args;
            applyPageUpdate(args);
          } catch (e) {
            console.warn('[pulse] failed to parse PageUpdate args', e);
          }
        }
      },
    });
  } catch (err) {
    cleanup();
    showError(`Failed to start drafting session: ${err.message || err}`);
    return;
  }
  if (cancelled) return;

  // Default goal — used when no explicit goal was passed via the
  // session opener. config.json's `default_goal` overrides; failing
  // that, fall back to the daily-build-in-public default.
  const goalText = (window.PULSE_GOAL || '').trim()
                || (await fetchDefaultGoal())
                || 'Daily X-post if I shipped or learned something yesterday. Skip if nothing meaningful.';

  const trigger = window.PULSE_TRIGGER || 'manual';
  const window_ = window.PULSE_WINDOW || '24h';

  const kickoffPrompt =
    `The user just opened Pulse for ${date}.\n\n` +
    `GOAL: ${goalText}\n` +
    `TRIGGER: ${trigger}\n` +
    `WINDOW: ${window_}\n` +
    `MANIFEST_PATH=${manifestPath}\n` +
    `SESSION_PATH=$HOME/.linggen/skills/pulse/data/${date}/session.json\n` +
    `CONFIG_PATH=$HOME/.linggen/skills/pulse/config.json\n` +
    `BRIEF_PATH=$HOME/.linggen/skills/pulse/references/brief.md\n\n` +
    `Read SKILL.md for the full protocol. Summary:\n` +
    `  1. Read brief.md (load-bearing) + voice-samples.md + lane-templates.md + config.json + the manifest.\n` +
    `  2. Read the GOAL above. Decide which capabilities to invoke (research-market, discover-customers, monitor-mentions, track-progress, draft-content). Default to fewer; only invoke ones the goal needs.\n` +
    `  3. Run capabilities (parallel where possible; draft-content runs last).\n` +
    `  4. Emit one PageUpdate body_patch per section you touched. Sections you didn't touch are NOT in the patch — the page leaves them in place.\n` +
    `  5. Emit a run_log block with run_id, capabilities_invoked, summary, skipped status.\n\n` +
    `Source tools (registered, no permission prompt): FetchHackerNews, FetchReddit, FetchLobsters, FetchArxiv, FetchRSS. Use config.json sites.* to know which are enabled. Don't use WebSearch / WebFetch for sources covered by a registered tool.\n\n` +
    `RIGHT PANEL — you also chat with the user. Before any tool calls, greet them warmly in voice (3–4 sentences, no "I'm thrilled" / rocket / "TL;DR"). Tell them which capabilities you're about to invoke and why, given their goal. Then proceed.\n\n` +
    `When done, final agent message — exactly one line: "body_patches: N · drafts: M" or "skipped: <reason>".`;

  // The embed iframe needs a beat to wire its postMessage listener.
  // Sys-doctor uses 2s, but on slower machines that races — fire at
  // 3.5s, then if no chat activity by 8s, re-send once. The agent
  // dedup'ing within a session is not a concern: a duplicate hidden
  // prompt is a no-op once the agent is already responding.
  setTimeout(() => {
    if (cancelled || !chat) return;
    chat.sendHidden(kickoffPrompt);
  }, 3500);

  setTimeout(() => {
    if (cancelled || !chat || chatReceived) return;
    console.warn('[pulse] kickoff prompt seems lost; resending');
    chat.sendHidden(kickoffPrompt);
  }, 8000);

  // Poll the data dir every 5s. The agent writes the file at the end
  // of Phase 5; once it lands, swap to the rendered view.
  const startedAt = Date.now();
  const TIMEOUT_MS = 10 * 60_000;
  const tick = async () => {
    if (cancelled) return;
    let data = null;
    try { data = await fetchDraftJson(date); } catch (_) { /* keep polling */ }
    if (cancelled) return;
    if (data) {
      applyPageUpdate({ body_patch: [{ widget: buildAllDoneProgressWidget() }] });
      stopWatching();
      if (data.skipped) showSkipped(data);
      else render(data);
      // Leave the chat iframe alive — switching panes via showOnly
      // hides #drafting; the iframe just sits dormant until the user
      // navigates away or starts a new run.
      return;
    }
    if (Date.now() - startedAt > TIMEOUT_MS) {
      cleanup(); // timeout: tear down chat too
      showError('Drafting timed out after 10 minutes. Check the agent session for details, or rerun a saved Pulse run manually.');
      return;
    }
    pollTimer = setTimeout(tick, 5000);
  };
  pollTimer = setTimeout(tick, 5000);
}

async function fetchDefaultGoal() {
  // Read default_goal from config.json. Returns empty string if not set
  // or config is missing — caller falls back to a hardcoded default.
  try {
    const cmd = 'jq -r ".default_goal // empty" "$HOME/.linggen/skills/pulse/config.json" 2>/dev/null || true';
    const res = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_root: '/tmp', command: cmd }),
    });
    if (!res.ok) return '';
    const body = await res.json();
    return (body.stdout || '').trim();
  } catch {
    return '';
  }
}

async function fetchDraftJson(date) {
  // Read via /api/bash — the skill iframe pattern. The endpoint requires
  // `project_root` alongside `command` (omitting it returns 422).
  // Returns file contents on stdout; empty stdout means no file.
  const cmd = `f="$HOME/.linggen/skills/pulse/data/${date}.json"; [ -f "$f" ] && cat "$f" || true`;
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command: cmd }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  const stdout = (body.stdout || '').trim();
  if (!stdout) return null;
  return JSON.parse(stdout);
}

// ---- Rendering --------------------------------------------------------

function render(data) {
  // Summary
  els.summaryList.innerHTML = '';
  (data.summary || []).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    els.summaryList.appendChild(li);
  });
  els.weightTag.textContent = data.weight || 'unknown';
  els.weightTag.className = `tag tag-${data.weight || 'unknown'}`;

  // External sources
  if (data.external_sources && data.external_sources.length > 0) {
    els.sourcesCard.hidden = false;
    els.sourcesList.innerHTML = '';
    data.external_sources.forEach((src) => {
      els.sourcesList.appendChild(renderSource(src));
    });
  } else {
    els.sourcesCard.hidden = true;
  }

  // Drafts
  els.draftsList.innerHTML = '';
  if (!data.drafts || data.drafts.length === 0) {
    const p = document.createElement('p');
    p.className = 'state-msg';
    p.textContent = 'No drafts in this output.';
    els.draftsList.appendChild(p);
  } else {
    data.drafts.forEach((draft, i) => {
      els.draftsList.appendChild(renderDraft(draft, i));
    });
  }

  showOnly('content');
}

function renderSource(src) {
  const li = document.createElement('li');
  li.className = 'source-item';
  const score = typeof src.score === 'number' ? src.score.toFixed(2) : '—';
  li.innerHTML = `
    <div class="source-header">
      <a href="${escapeAttr(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title || src.url)}</a>
      <span class="source-meta">${escapeHtml(src.source || '')} · score ${score}</span>
    </div>
    <p class="source-why">${escapeHtml(src.why || '')}</p>
  `;
  return li;
}

function renderDraft(draft, idx) {
  const article = document.createElement('article');
  article.className = `draft draft-${draft.lane || 'unknown'}`;

  const titleCandidates = draft.title_candidates && draft.title_candidates.length > 0
    ? `<div class="draft-titles"><span class="draft-titles-label">title candidates:</span> ${draft.title_candidates.map(t => `<span class="draft-title-pick">${escapeHtml(t)}</span>`).join(' · ')}</div>`
    : '';

  const citations = draft.citations && draft.citations.length > 0
    ? `<details class="draft-citations"><summary>${draft.citations.length} citation${draft.citations.length === 1 ? '' : 's'}</summary><ul>${draft.citations.map(u => `<li><a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a></li>`).join('')}</ul></details>`
    : '';

  article.innerHTML = `
    <header class="draft-header">
      <span class="draft-lane tag tag-${draft.lane || 'unknown'}">${escapeHtml(draft.lane || 'unknown')}</span>
      <button class="btn-copy" data-idx="${idx}">Copy</button>
    </header>
    ${titleCandidates}
    <pre class="draft-content" data-idx="${idx}">${escapeHtml(draft.content || '')}</pre>
    ${citations}
  `;

  article.querySelector('.btn-copy').addEventListener('click', async (e) => {
    const text = draft.content || '';
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = 'Copied';
      setTimeout(() => (e.target.textContent = 'Copy'), 1500);
    } catch (_) {
      e.target.textContent = 'Copy failed';
    }
  });

  return article;
}

// ---- States -----------------------------------------------------------

function showOnly(id) {
  ['loading', 'error', 'empty', 'drafting', 'content'].forEach((k) => {
    els[k].hidden = k !== id;
  });
}

function showError(msg) {
  els.error.textContent = msg;
  showOnly('error');
}

function showEmpty(msg) {
  els.empty.textContent = msg;
  showOnly('empty');
}

function showSkipped(data) {
  els.summaryList.innerHTML = '';
  (data.summary || []).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    els.summaryList.appendChild(li);
  });
  els.weightTag.textContent = 'skip';
  els.weightTag.className = 'tag tag-skip';
  els.sourcesCard.hidden = true;
  els.draftsList.innerHTML = `
    <div class="state-msg">
      <strong>Nothing post-worthy from this day.</strong>
      <p>${escapeHtml(data.skip_reason || 'No fresh signal earning a post.')}</p>
      <p class="card-sub">See you tomorrow.</p>
    </div>
  `;
  showOnly('content');
}

// ---- Helpers ----------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
function escapeAttr(s) { return escapeHtml(s); }

// Surface unhandled errors in the page itself so a stray exception
// doesn't leave the user staring at a blank viewport.
window.addEventListener('error', (e) => {
  console.error('[pulse]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[pulse] unhandled rejection:', e.reason);
});

try {
  init();
} catch (err) {
  console.error('[pulse] init failed:', err);
  if (els.error) {
    els.error.textContent = `Pulse init failed: ${err.message || err}`;
    showOnly('error');
  }
}
