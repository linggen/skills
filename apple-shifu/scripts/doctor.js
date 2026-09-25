// Apple Shifu v2 — orchestrator
// Runs the scans the user starts, draws them (system-page.js), and hands the
// agent the facts to comment on (scan-report.js). The agent never lays out a
// scan.

import './legacy-keys.js';
import { listSkillSessions } from '/shared/api.js';
import { runScan, runDeepFileScan, runDiskScan, runSecurityScan, runPerformanceScan, persistScanSnapshot, persistReadout, parseDiskUsage, bash as scanBash } from './scan.js';
import { buildSystemPage, topBar, diskWidget, cleanupWidget, securityWidget, processesWidget } from './system-page.js';
import { scanFacts, mergeFacts, reportPrompt, parseClearableSummary } from './scan-report.js';
import { buildReadout } from './mac-readout.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';
import { calculateHealthScore, saveScoreHistory, getScoreHistory } from './health-score.js';
import { initShell, registerTab, setActiveTab, getActiveTab, getSource, onSourceChange, onTabChange, onBackupChange, refreshVerbs, getBackupSummary } from './shifu-shell.js';
import { renderPhoneSystem, phoneFacts } from './phone-system.js';
import { setFileIndex } from './widget-renderers.js';
import { startLiveTopBar } from './live.js';
import { flashToast, showToast } from './shifu-io.js';
import { overviewCards, parseLayout, orderCards, securityFromReadout } from './overview.js';
import { renderOverview } from './overview-view.js';

const SKILL_NAME = 'apple-shifu';
const params = new URLSearchParams(window.location.search);
// Branded Apple Shifu.app launches with ?app_mode=1, same as core: both ride
// the user's global default model (Settings → Models) unless a per-skill
// localStorage override is set.
const APP_MODE = params.get('app_mode') === '1';
let modelId = params.get('model') || '';
// Check for session in URL — used when resuming or opened from session list
let existingSession = params.get('session') || '';

/** @type {ReturnType<typeof LinggenUI.mount> | null} */
let chat = null;
let scanning = false;

// Disable toolbar buttons while a *local* scan (deep file scan) is running so
// users don't trigger a parallel one. Agent-driven busy state is owned by the
// chat widget (server pushes `busy_sessions`); we don't try to mirror it
// because the skill iframe doesn't receive that signal.
function syncToolbarBusy() {
  refreshVerbs();
  applySysView();
}

// ── The System tab's four verbs ──
//
// Same four in the same order under both sources; what sits behind them
// differs. Back up means one thing everywhere — archive the iPhone roll to
// this Mac — so it never changes meaning when the switch moves.

// What Report asks for. The phone's Ask Shifu button sends Yinyue the same
// shape of question, and for the same reason: the agent pulls the readout with
// its own tool instead of being handed one here, so it works identically when
// the user just types the question into the chat panel.
//
// The honesty clauses are repeated in the prompt rather than left to the
// readout's `notes` alone — it is one line each, and a report is exactly where
// an unreadable row tempts a plausible number.
const REPORT_PROMPT =
  'Write me a report on this Mac.\n\n'
  + 'Call SystemReadout first — everything you need is there, including the '
  + 'score and when the scan ran. Then, in writing:\n\n'
  + '- Say how the machine is doing overall, and what is actually worth acting '
  + 'on. Lead with whatever frees the most space or matters most, not with the '
  + 'first row in the list.\n'
  + '- Quote the real numbers for anything measured.\n'
  + '- For anything the readout marks unreadable, do not guess a value. Say '
  + 'what the scan does not read and give them the path from `where_to_look`.\n'
  + '- Anything you add from elsewhere, or any row marked `looked_up`, is not '
  + 'a reading of their machine — say so plainly.\n\n'
  + 'Short sections, plain prose, no wall of text. Skip the pleasantries and '
  + 'start with the verdict.';

const BUYERS_GUIDE_PROMPT =
  'Should I replace this Mac, or is it fine?\n\n'
  + 'Call SystemReadout first. Ground the answer in what this machine actually '
  + 'is — the chip, the memory, the disk, the battery cycles, how hard it is '
  + 'being worked — and be honest when the answer is "keep it".\n\n'
  + 'The age row is inferred from the chip generation, not read from the '
  + 'machine; treat it as the estimate it is. Anything about current models or '
  + 'prices is yours, not a reading — say which is which, and search the web '
  + 'rather than quoting a price from memory.\n\n'
  + 'If replacing is worth it, say what to buy and what would actually be '
  + 'better about it for the way this one is used. If an upgrade or a cleanup '
  + 'would fix the real complaint for a fraction of the money, say that first.';

const SYSTEM_VERBS = {
  mac: () => ({
    scan: {
      hint: 'Re-run a system check',
      menu: [
        { label: '↻ Full rescan', hint: 'CPU, memory, disk, battery, security', run: () => startRescan() },
        { label: '💾 Disk', run: () => startSectionScan('disk') },
        { label: '🔒 Security', run: () => startSectionScan('security') },
        { label: '⚡ Performance', run: () => startSectionScan('performance') },
        { label: '📦 Large files', hint: 'walks the filesystem', run: () => send('Find large files and label them') },
      ],
    },
    report: {
      hint: 'Write up what the last scan found',
      menu: [
        { label: '📊 Written report', run: () => send(REPORT_PROMPT) },
        { label: '🛒 Buyer\'s Guide', run: () => send(BUYERS_GUIDE_PROMPT) },
      ],
    },
    backup: backupVerb(),
    // What can be cleared lives in one place — the Files tab's Clearable pile,
    // with a verdict per row — so Clean opens it rather than asking for a list.
    clean: {
      hint: 'What can be cleared, and whether it is safe — opens the Files tab',
      run: () => setActiveTab('files'),
    },
  }),
  phone: () => ({
    // No Scan here, and not because it failed. The panel already probes over
    // the cable on every switch into this source, so the button re-ran the
    // scan that had just drawn it. And the rows a probe cannot reach are the
    // phone's own — which it publishes when it is awake, so asking for them on
    // demand would promise a reading a suspended app cannot give.
    scan: { blocked: 'Readings come from the phone — open Shifu in Linggen Mobile' },
    report: {
      hint: 'Write up what this Mac can see of the iPhone',
      run: () => {
        const f = phoneFacts();
        if (!f) return;
        send(`Write a short report on my iPhone from what this Mac can read: ${JSON.stringify(f)}. `
          + 'Say plainly which checks only the phone can answer, and do not invent readings for them.');
      },
    },
    backup: backupVerb(),
    clean: {
      label: 'Clean',
      hint: 'iPhone cleanup is photos and videos — opens the Media tab',
      run: () => setActiveTab('media'),
    },
  }),
};

/** Back up means the phone's roll onto this Mac under either source. The work
    happens in the Media tab, over the item list that tab has loaded — so this
    one hands off rather than promising a count it would not be the one to
    honour. The number here is the header badge's, and it is the whole roll. */
function backupVerb() {
  const summary = getBackupSummary();
  if (!summary) return { blocked: 'Nothing synced from an iPhone yet — sync in the Media tab first' };
  if (!summary.count) return { blocked: 'Every iPhone item already has a verified copy on this Mac' };
  const n = summary.count.toLocaleString();
  return {
    hint: `${n} iPhone item${summary.count === 1 ? '' : 's'} have no copy on this Mac yet — opens the Media tab`,
    run: () => setActiveTab('media'),
  };
}

function send(msg) {
  if (window._chatSend) window._chatSend(msg);
}

const systemProvider = {
  panel: 'view-panel',
  verbs: (source) => {
    const actions = SYSTEM_VERBS[source]();
    // A local scan owns the toolbar while it runs — no parallel starts.
    if (scanning) {
      for (const key of Object.keys(actions)) actions[key] = { blocked: 'A scan is running' };
    }
    return actions;
  },
  meta: (source) => (source === 'mac' ? lastScanMetaHtml() : ''),
};

/** Swap the System tab between the agent dashboard (💻) and the Mac's read of
    the iPhone (📱). Two panes, one visible — never both drawn at once. */
function applySystemSource(source) {
  const mac = document.getElementById('mac-system');
  const phone = document.getElementById('phone-system');
  if (!mac || !phone) return;
  mac.hidden = source !== 'mac';
  phone.hidden = source !== 'phone';
  if (source === 'phone') refreshPhoneSystem();
}

function refreshPhoneSystem(probe = true) {
  return renderPhoneSystem(document.getElementById('phone-system'), probe);
}

// ── Init ──

/** Settings live in settings.html; the gear opens it over the page (DJ's
    pattern). Inside the unified launcher the shell owns settings, so the gear
    hides rather than giving the user two doors to the same room. */
function wireSettingsButton() {
  const btn = document.getElementById('settings-btn');
  if (!btn) return;
  if (params.get('in_launcher') === '1') {
    btn.style.display = 'none';
    return;
  }
  btn.onclick = () => {
    let ov = document.querySelector('.app-mode-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'app-mode-overlay';
      ov.innerHTML = `
        <div class="app-mode-overlay-bar">
          <span class="app-mode-overlay-title">Settings</span>
          <button class="app-mode-overlay-close" aria-label="Close settings">×</button>
        </div>
        <iframe class="app-mode-overlay-frame" src="settings.html" title="Settings"></iframe>`;
      ov.querySelector('.app-mode-overlay-close').onclick =
        () => ov.classList.remove('visible');
      document.body.appendChild(ov);
    }
    ov.classList.add('visible');
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  wireSettingsButton();
  // The shell must exist before any tab registers — media.js registers from
  // its own DOMContentLoaded, which can land while this handler is awaiting.
  initShell();
  registerTab('system', systemProvider);
  onSourceChange((source) => { if (getActiveTab() === 'system') applySystemSource(source); });
  onTabChange((tab) => { if (tab === 'system') applySystemSource(getSource()); });
  // The archive figure arrives from the Media tab after this panel first
  // drew — redraw it so the "Not archived here" row matches the header badge.
  onBackupChange(() => {
    if (getSource() === 'phone') refreshPhoneSystem(false);
    refreshOverview();
  });
  // The Files tab rewrote its Clearable summary (a scan, a clear).
  window.addEventListener('shifu:clearable', () => refreshOverview());
  wireSysViews();
  applySystemSource(getSource());

  // App mode: per-skill override in localStorage('apple-shifu:model') if set.
  // Otherwise leave modelId empty so the engine uses the user's global
  // default model — the fresh-install default is the built-in Linggen Cloud
  // model, so a new user still gets a working scan with no API key.
  if (!modelId && APP_MODE) {
    try { modelId = localStorage.getItem('apple-shifu:model') || ''; }
    catch { /* ignore */ }
  }

  // Resume the latest session inside the window — whoever created it (this
  // page, the app shell, or a phone relay). All apps share this one rule:
  // latest if < 24h, else fresh (CFO/DJ/Pulse/Memory do the same). The
  // dashboard restores independently of chat: the newest session with a
  // locally cached page supplies the widget tree when the resumed session
  // has none.
  let sessions = [];
  let listed = false;
  try {
    sessions = await listSkillSessions(SKILL_NAME);
    sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    listed = true;
  } catch { /* ignore */ }

  // The rule decides, not the address bar. A resume stamps ?session= into the
  // URL, so a tab left open across days — or a bookmark of one — used to pin
  // that session for ever and never roll over (2026-09-18: a two-day-old chat
  // on a tab that had simply stayed open). A session named in the URL is
  // honoured while it is a day to pick up, and let go when it isn't.
  if (existingSession && listed) {
    const pinned = sessions.find((sn) => sn.id === existingSession);
    if (!pinned || !spokenIn(pinned) || sessionAgeMs(pinned) >= RESUME_WINDOW_MS) {
      existingSession = '';
      const url = new URL(window.location);
      url.searchParams.delete('session');
      history.replaceState(null, '', url);
    }
  }

  if (!existingSession) {
    // The newest session SPOKEN IN, not merely the newest: see spokenIn.
    const latest = sessions.find(spokenIn);
    const cached = sessions.find((s) => hasCachedPage(s.id));
    if (latest && sessionAgeMs(latest) < RESUME_WINDOW_MS) {
      seedLastScanAt((cached || latest).created_at);
      const url = new URL(window.location);
      url.searchParams.set('session', latest.id);
      history.replaceState(null, '', url);
      const carry = !hasCachedPage(latest.id) && cached ? readCachedPage(cached.id) : null;
      await mountAndStart(latest.id, carry);
      return;
    }
    if (cached) {
      // Latest is older than the resume window: rotate. Carry the dashboard
      // forward (page restore is local and free) but bind chat to a fresh
      // session so context stays bounded — cross-scan memory lives in
      // data/latest.json, not in the conversation.
      seedLastScanAt(cached.created_at);
      const url = new URL(window.location);
      url.searchParams.delete('session');
      history.replaceState(null, '', url);
      await mountAndStart(null, readCachedPage(cached.id));
      return;
    }
  }

  // Mount chat and start (existing session or true first run)
  await mountAndStart(existingSession);
});

// ── Mount chat panel and start ──

/** The last deep scan's real paths, from disk. A restored Large Files card
    outlives the page that scanned, and its rows still have to name the file
    they would remove. Silence when there is no scan yet — the rows simply
    carry no copy button. */
async function loadFileIndex() {
  try {
    const res = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_root: '/tmp',
        command: 'cat "$HOME/.linggen/skills/apple-shifu/data/files/large-files.json" 2>/dev/null || true',
      }),
    });
    const out = (await res.json()).stdout?.trim();
    if (out) setFileIndex(JSON.parse(out));
  } catch { /* no index — no buttons, nothing broken */ }
}

async function mountAndStart(sessionId, carryPage = null) {
  loadFileIndex();
  const chatPanel = document.getElementById('chat-panel');
  const mountOpts = {
    skillName: SKILL_NAME,
    agentId: 'ling',
    modelId,
    title: 'Apple Shifu',
    placeholder: 'Ask me anything...',
    onSessionCreated: (sid) => {
      const url = new URL(window.location);
      url.searchParams.set('session', sid);
      history.replaceState(null, '', url);
      // Re-cache the visible page under the new session id (covers rotation,
      // where the dashboard was carried over from an older session).
      cacheCurrentPage();
    },
    onStreamEnd: (text) => {
      handleModelResponse(text);
    },
    onContentBlock: (payload) => {
      // Ling added or dropped a "Found by Shifu" row: the Files tab re-reads
      // her finds now, and once more after the tool has surely written them.
      // Ling moved the Overview's lead: redraw once the tool has written it.
      if (payload?.tool === 'Lead') setTimeout(refreshOverview, 1200);
      if (payload?.tool === 'ProposeClearable') {
        window.dispatchEvent(new Event('shifu:found'));
        setTimeout(() => window.dispatchEvent(new Event('shifu:found')), 2500);
      }
      // Modern path: agent calls the auto-injected `PageUpdate` data tool
      // (recommended by skill-spec.md and prompted by the engine for app skills).
      // The page fields (top_bar/body/footer) come through as the tool args.
      // The legacy `<!--page-->` text-tag parser in handleModelResponse remains
      // as a fallback for older agent behavior.
      if (payload?.tool === 'PageUpdate' && payload?.args) {
        try {
          const args = typeof payload.args === 'string'
            ? JSON.parse(payload.args)
            : payload.args;
          applyPageUpdate(args);
          cacheCurrentPage();
        } catch (e) {
          console.warn('[apple-shifu] failed to parse PageUpdate args', e, payload.args);
        }
      }
    },
  };
  if (sessionId) mountOpts.sessionId = sessionId;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Expose send for widget click handlers. The agent decides what to do with
  // each message — it has Scan* tools (declared in SKILL.md) for rescan-style
  // requests and runs the deep file scan in-iframe for "Find Large Files".
  // Only the deep file scan stays client-side because it does work that has no
  // tool equivalent (filesystem walk + AI labeling pipeline).
  window._chatSend = async (text) => {
    if (!chat) return;
    const lower = text.toLowerCase();
    if (lower.includes('large file') || lower.includes('deep scan') || lower.includes('scan files') || lower.includes('find duplicate')) {
      await runClientDeepScan(text);
      return;
    }
    chat.send(text);
  };

  // Media tab milestones — hidden prompts so Ling narrates scan/backup/remove
  // events without the raw event text appearing in chat.
  window._chatNotify = (text) => chat?.sendHidden(text);

  refreshVerbs();
  setInterval(refreshVerbs, 60_000);   // keeps "Last scan 3m ago" honest
  // The top row's numbers refresh while the Mac's System tab is in view.
  startLiveTopBar({ getActiveTab, getSource, onTabChange, onSourceChange, isScanning: () => scanning });

  refreshOverview();

  if (sessionId && hasCachedPage(sessionId)) {
    // Restore dashboard from cache — no re-scan, no tokens, no greeting.
    restoreFromCache(sessionId);
    maybeShowStaleBanner();
  } else if (carryPage) {
    // Rotated session: same dashboard, fresh context, still silent.
    restorePage(carryPage);
    maybeShowStaleBanner();
  } else {
    // Fresh session, or resumed session without a usable cache. Only a new
    // session is introduced: one already going is picked up in silence.
    startFresh(!sessionId);
  }
}

// ── Fresh start — agent introduces itself while probe runs in parallel ──

function startFresh(greet = true) {
  // Parity with the other apps (CFO/Pulse): don't auto-scan on open. The page
  // shows where the scan is; the agent introduces itself in its own words.
  applyPageUpdate({
    body: [
      {
        type: 'info',
        icon: '🩺',
        title: 'Apple Shifu',
        fields: [
          { label: '', value: '↻ Scan → Full rescan checks disk, battery, security and performance.' },
        ],
      },
    ],
  });

  // Once per session, the agent introduces itself from the last scan's real
  // figures (SKILL.md "0. Introduce yourself"). The words are its own — this
  // page never writes a sentence into the chat. Reloads can't repeat it: a
  // session that has spoken resumes silently.
  if (!greet) return;
  const sess = new URLSearchParams(location.search).get('session');
  const greetKey = sess ? `apple-shifu:greeted:${sess}` : null;
  if (greetKey && localStorage.getItem(greetKey)) return;
  setTimeout(() => {
    if (!chat) return;
    if (greetKey) localStorage.setItem(greetKey, '1');
    chat.sendHidden(GREETING);
  }, 700);
}

const GREETING =
  'The user just opened Apple Shifu (this message is hidden from them). '
  + 'Introduce yourself now, following "0. Introduce yourself" in your instructions.';

// ── Hardware probe ──

async function startHardwareProbe() {
  if (scanning) return;
  scanning = true;
  syncToolbarBusy();
  const before = JSON.parse(JSON.stringify(getCurrentPage()));

  const steps = [
    { label: 'System info', status: 'active', icon: '💻' },
    { label: 'Disk usage', status: 'pending', icon: '💾' },
    { label: 'Security', status: 'pending', icon: '🔒' },
    { label: 'Performance', status: 'pending', icon: '⚡' },
  ];

  applyPageUpdate({
    body: [{ type: 'progress', title: 'Checking your system...', steps: [...steps] }],
  });

  // Redraw only when a step actually moves: every redraw rebuilds the card and
  // replays its entry fade, so a repeat of the same state reads as a flash.
  let shown = '';
  function updateSteps(doneIdx, activeIdx) {
    const key = `${doneIdx}:${activeIdx}`;
    if (key === shown) return;
    shown = key;
    const updated = steps.map((s, i) => ({
      ...s,
      status: i < doneIdx ? 'done' : i === activeIdx ? 'active' : 'pending',
    }));
    applyPageUpdate({ body: [{ type: 'progress', title: 'Checking your system...', steps: updated }] });
  }

  try {
    const sessionId = chat?.getSessionId();

    // Run full scan (system + disk + garbage + security + performance)
    const results = await runScan('full', sessionId, (step, data) => {
      // 'start' and the disk's per-folder `measuring` ticks are not a step
      // finishing — only a step's result moves the card on.
      if (data === 'start' || data?.measuring) return;
      if (step === 'system') updateSteps(1, 1);
      if (step === 'disk') updateSteps(2, 2);
      if (step === 'security') updateSteps(3, 3);
      if (step === 'performance') updateSteps(4, -1);
    });

    // Calculate health score
    const { score, breakdown } = calculateHealthScore(results);
    results.healthScore = score;
    results.scoreBreakdown = breakdown;

    // Save score history
    const diskFree = results.disk ? results.disk.free_gb : null;
    saveScoreHistory(score, diskFree);

    // Persist the compact summary: header timestamp, future deltas, and the
    // agent's LastScan tool all read from it.
    const summary = buildScanSummary(results);
    markScanComplete(summary);
    persistScanSnapshot(summary, sessionId).catch(() => {});

    // And the whole readout, from the same results this page was built from,
    // so a question three turns later is answered from the scan the user is
    // looking at rather than from nine summary numbers.
    persistReadout(buildReadout(results, score, breakdown), sessionId)
      .catch(() => {});

    // The page draws the scan itself — every figure as it was measured — and
    // the agent only comments on it (SKILL.md "After a scan").
    applyPageUpdate(buildSystemPage(results));
    cacheCurrentPage();
    await reportScan('full', scanFacts(results));
  } catch (err) {
    console.error('Hardware probe error:', err);
    restorePage(before);
    flashToast(`The scan stopped: ${err?.message || err}. Try ↻ Scan → Full rescan again.`);
  } finally {
    scanning = false;
    syncToolbarBusy();
  }
}

// ── Rescan + scan metadata ──

// Resume window: within it, reopening reattaches to the same chat; past it
// the dashboard carries forward into a fresh session (bounded context).
const RESUME_WINDOW_MS = 24 * 3600 * 1000;

/** A session created and never spoken in is not a day to pick up. The engine
    takes `updated_at` from the transcript's own mtime, so an unused session
    carries its creation time — which is what a lost kickoff, or a tab closed
    in the same breath, leaves behind. Three of this skill's own sessions are
    exactly that. Resuming one is silent by the rule, and silence over nothing
    is a page that opens onto a dead panel (Lingjing hit it 2026-09-18). */
function spokenIn(s) {
  return (s?.updated_at || 0) > (s?.created_at || 0);
}

function sessionAgeMs(session) {
  try {
    const ts = parseInt(localStorage.getItem(`apple-shifu-page-ts:${session.id}`) || '0', 10);
    if (ts) return Date.now() - ts;
  } catch { /* ignore */ }
  return Date.now() - (session.created_at || 0) * 1000;
}

function readCachedPage(sessionId) {
  try {
    const page = JSON.parse(localStorage.getItem(`apple-shifu-page:${sessionId}`) || 'null');
    return page && (page.top_bar?.length || page.body?.length) ? page : null;
  } catch {
    return null;
  }
}

const LAST_SCAN_KEY = 'apple-shifu:last-scan-at';
const LAST_SUMMARY_KEY = 'apple-shifu:last-summary';
const STALE_MS = 7 * 24 * 3600 * 1000;

async function startRescan() {
  if (scanning) return;
  hideStaleBanner();
  await startHardwareProbe();
}

function buildScanSummary(results) {
  return {
    date: new Date().toISOString().slice(0, 10),
    score: results.healthScore ?? null,
    disk_free_gb: results.disk?.free_gb ?? null,
    disk_percent: results.disk?.percent ?? null,
    mem_percent: results.system?.memory?.percent ?? null,
    security_passing: results.security?.passing ?? null,
    security_total: results.security?.total ?? null,
    battery_percent: results.battery?.percent ?? null,
    cycle_count: results.battery?.cycleCount ?? null,
  };
}

function getLastScanAt() {
  try {
    const stored = parseInt(localStorage.getItem(LAST_SCAN_KEY) || '0', 10) || 0;
    if (stored) return stored;
    // Fallback for scans that predate the timestamp: the score history's
    // last entry carries the scan date (day precision).
    const hist = getScoreHistory();
    if (hist.length) {
      const t = Date.parse(hist[hist.length - 1].date);
      if (!isNaN(t)) return t;
    }
    return 0;
  } catch { return 0; }
}

/** Backfill the scan timestamp from a resumed session's creation time —
 *  that's when its dashboard data was actually gathered. */
function seedLastScanAt(createdAtSec) {
  if (!createdAtSec || getLastScanAt()) return;
  try { localStorage.setItem(LAST_SCAN_KEY, String(createdAtSec * 1000)); } catch { /* quota */ }
}

function markScanComplete(summary) {
  try {
    localStorage.setItem(LAST_SCAN_KEY, String(Date.now()));
    localStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary));
  } catch { /* quota */ }
  refreshVerbs();
}

function relTime(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** The System tab's trailing slot in the verb toolbar. */
function lastScanMetaHtml() {
  const at = getLastScanAt();
  if (!at) return '';
  const stale = Date.now() - at > STALE_MS ? ' stale' : '';
  return `<span class="last-scan${stale}" title="Data gathered ${
    new Date(at).toLocaleString()}">Last scan ${relTime(Date.now() - at)}</span>`;
}

// Stale policy: suggest, don't run. The dashboard restores instantly either
// way; this banner is the only nudge.
function maybeShowStaleBanner() {
  const at = getLastScanAt();
  if (!at || Date.now() - at <= STALE_MS) return;
  const banner = document.getElementById('stale-banner');
  if (!banner) return;
  const days = Math.round((Date.now() - at) / 86400000);
  banner.hidden = false;
  banner.innerHTML = `
    <span>This scan is ${days} days old — your system may have changed.</span>
    <span class="stale-actions">
      <button id="stale-rescan">↻ Rescan now</button>
      <button id="stale-dismiss">Dismiss</button>
    </span>`;
  document.getElementById('stale-rescan').onclick = () => startRescan();
  document.getElementById('stale-dismiss').onclick = hideStaleBanner;
}

function hideStaleBanner() {
  const banner = document.getElementById('stale-banner');
  if (banner) { banner.hidden = true; banner.innerHTML = ''; }
}

// ── The Overview: the System tab's first view ──
//
// Composed by overview.js from facts this page holds — the Clearable pile's
// safe total, the iPhone items with no copy here, the first security gap, and
// the disk when under 10% free. The agent may move one card to the lead (its
// Lead tool) and says why in the chat; the user's pin or hide beats it.

const VIEW_KEY = 'apple-shifu:sys-view';
const SHIFU_SCRIPTS = '"$HOME"/.linggen/skills/apple-shifu/scripts';
const SHIFU_DATA = '"$HOME"/.linggen/skills/apple-shifu/data';

function getSysView() {
  try { return localStorage.getItem(VIEW_KEY) === 'details' ? 'details' : 'overview'; }
  catch { return 'overview'; }
}

/** A scan draws its progress in Details, so Details shows while one runs. */
function applySysView() {
  const view = scanning ? 'details' : getSysView();
  const show = (id, on) => { const n = document.getElementById(id); if (n) n.hidden = !on; };
  show('overview-area', view === 'overview');
  show('body-area', view === 'details');
  show('footer-area', view === 'details');
  for (const b of document.querySelectorAll('.sys-view')) b.classList.toggle('on', b.dataset.view === view);
}

function wireSysViews() {
  for (const b of document.querySelectorAll('.sys-view')) {
    b.onclick = () => {
      if (scanning) return;
      try { localStorage.setItem(VIEW_KEY, b.dataset.view); } catch { /* quota */ }
      applySysView();
    };
  }
  applySysView();
}

async function readoutSecurity() {
  try {
    const res = await scanBash(`cat ${SHIFU_DATA}/readout.json 2>/dev/null || true`);
    return securityFromReadout(JSON.parse(res.stdout || '{}'));
  } catch { return null; }
}

const OVERVIEW_ACTIONS = {
  clear: () => {
    // The reviewed Clear flow, unchanged: the Clearable pile with its SAFE
    // rows checked. Nothing goes until the user presses Clear and agrees to
    // the sheet, and clearables.sh re-checks every path against its rule.
    window.dispatchEvent(new CustomEvent('shifu:open-clearable', { detail: { selectSafe: true } }));
    setActiveTab('files');
  },
  files: () => {
    window.dispatchEvent(new CustomEvent('shifu:open-clearable', { detail: {} }));
    setActiveTab('files');
  },
  media: () => setActiveTab('media'),
};

async function changeLayout(cmd, id = '') {
  await scanBash(`bash ${SHIFU_SCRIPTS}/layout.sh ${cmd} ${id}`);
  refreshOverview();
}

let overviewRun = 0;

/** Redraw the Overview from what is on disk now; returns the card order (ids)
    for the report, with the user's pin marked. */
async function refreshOverview() {
  const run = ++overviewRun;
  const [layoutRes, clearable, df] = await Promise.all([
    scanBash(`bash ${SHIFU_SCRIPTS}/layout.sh read`).catch(() => ({})),
    readClearable(),
    scanBash('df -k /System/Volumes/Data 2>/dev/null || df -k /').catch(() => ({})),
  ]);
  const facts = readFacts();
  const security = facts?.security || await readoutSecurity();
  const layout = parseLayout(layoutRes.stdout || '');
  const all = overviewCards({
    disk: parseDiskUsage(df.stdout || ''), clearable, backup: getBackupSummary(), security,
  });
  const cards = orderCards(all, layout);
  if (run !== overviewRun) return cards.map((c) => c.id);
  renderOverview(document.getElementById('overview-area'), {
    cards, layout, hiddenCount: all.length - cards.length,
    scanned: Boolean(facts || security || getLastScanAt()),
    onAction: (c) => OVERVIEW_ACTIONS[c.action.kind]?.(),
    onLayout: changeLayout,
  });
  return cards.map((c) => (c.id === layout.pinned ? `${c.id} (pinned by the user)` : c.id));
}

// ── Section scans and the report after any scan ──

const FACTS_KEY = 'apple-shifu:facts';

function readFacts() {
  try { return JSON.parse(localStorage.getItem(FACTS_KEY) || 'null'); } catch { return null; }
}

function writeFacts(f) {
  try { localStorage.setItem(FACTS_KEY, JSON.stringify(f)); } catch { /* quota */ }
}

/** The Files tab's Clearable totals as it last wrote them; null before its
    first scan. */
async function readClearable() {
  try {
    const res = await scanBash('sed -n 1,2p ~/.linggen/skills/apple-shifu/data/files/clearables/summary.txt 2>/dev/null');
    return parseClearableSummary(res.stdout || '');
  } catch { return null; }
}

/** After any scan the user started: keep the facts for the next comparison,
    and hand the agent what changed. It reports unprompted — one line when
    nothing moved — in its own words; the page has already drawn the figures. */
async function reportScan(kind, facts) {
  const prev = readFacts();
  const now = mergeFacts(prev, facts);
  writeFacts(now);
  const clearable = await readClearable();
  const order = await refreshOverview();
  if (chat) chat.sendHidden(reportPrompt({ kind, prev, now, clearable, backup: getBackupSummary(), order }));
}

/** Scan → Disk / Security / Performance: the page runs the same scan the
    full rescan runs for that section and swaps only its cards. */
const SECTION_SCANS = {
  disk: {
    label: 'Measuring the disk…',
    run: async (sid) => {
      const r = await runDiskScan(sid);
      const bar = topBar({ disk: r.disk })[0];
      const top = getCurrentPage().top_bar || [];
      if (bar) applyPageUpdate({ top_bar: top.some((w) => w.widget === 'disk') ? top.map((w) => (w.widget === 'disk' ? bar : w)) : [...top, bar] });
      applyPageUpdate({ body_patch: [diskWidget(r.disk), cleanupWidget(r.caches)].filter(Boolean) });
      return { disk: r.disk };
    },
  },
  security: {
    label: 'Checking security…',
    run: async (sid) => {
      const security = await runSecurityScan(sid);
      applyPageUpdate({ body_patch: [securityWidget(security)].filter(Boolean) });
      return { security };
    },
  },
  performance: {
    label: 'Reading processes…',
    run: async (sid) => {
      const performance = await runPerformanceScan(sid);
      applyPageUpdate({ body_patch: [processesWidget(performance)].filter(Boolean) });
      return { performance };
    },
  },
};

async function startSectionScan(kind) {
  if (scanning) return;
  const section = SECTION_SCANS[kind];
  scanning = true;
  syncToolbarBusy();
  const toast = showToast(section.label, true);
  try {
    const r = await section.run(chat?.getSessionId());
    cacheCurrentPage();
    toast.close();
    const facts = scanFacts(r);
    delete facts.score;
    await reportScan(kind, facts);
  } catch (err) {
    toast.done(`The ${kind} scan stopped: ${err?.message || err}`);
  } finally {
    scanning = false;
    syncToolbarBusy();
  }
}

// ── Deep scan (client-side) ──

async function runClientDeepScan(userMessage) {
  if (scanning) {
    flashToast('A scan is already running.');
    return;
  }
  scanning = true;
  syncToolbarBusy();
  // The progress card takes the body; a scan that fails puts the page back.
  const before = JSON.parse(JSON.stringify(getCurrentPage()));

  // Show progress
  applyPageUpdate({
    body: [{
      type: 'progress',
      title: 'Deep scanning your files...',
      steps: [
        { label: 'Indexing files', status: 'active', icon: '📂' },
        { label: 'Finding large files', status: 'pending', icon: '📦' },
        { label: 'Checking duplicates', status: 'pending', icon: '🔍' },
        { label: 'AI analysis', status: 'pending', icon: '🧠' },
      ],
    }],
  });

  // Show user message in chat
  chat.addMessage('user', userMessage);

  try {
    const sessionId = chat?.getSessionId();
    let fileCount = 0;

    const deepResults = await runDeepFileScan(sessionId, (phase, data) => {
      if (phase === 'indexing' && data !== 'start') {
        fileCount = data.fileCount || 0;
        applyPageUpdate({
          body: [{
            type: 'progress',
            title: `Indexed ${fileCount.toLocaleString()} files...`,
            steps: [
              { label: `Indexing files (${fileCount.toLocaleString()})`, status: 'done', icon: '📂' },
              { label: 'Finding large files', status: 'active', icon: '📦' },
              { label: 'Checking duplicates', status: 'pending', icon: '🔍' },
              { label: 'AI analysis', status: 'pending', icon: '🧠' },
            ],
          }],
        });
      }
      if (phase === 'large_files' && data !== 'start') {
        applyPageUpdate({
          body: [{
            type: 'progress',
            title: `Found ${data.length} large files...`,
            steps: [
              { label: `Indexed ${fileCount.toLocaleString()} files`, status: 'done', icon: '📂' },
              { label: `${data.length} large files found`, status: 'done', icon: '📦' },
              { label: 'Checking duplicates', status: 'active', icon: '🔍' },
              { label: 'AI analysis', status: 'pending', icon: '🧠' },
            ],
          }],
        });
      }
      if (phase === 'duplicates' && data !== 'start') {
        applyPageUpdate({
          body: [{
            type: 'progress',
            title: 'Sending to AI for analysis...',
            steps: [
              { label: `Indexed ${fileCount.toLocaleString()} files`, status: 'done', icon: '📂' },
              { label: `Large files found`, status: 'done', icon: '📦' },
              { label: `${data.length} duplicate sets`, status: 'done', icon: '🔍' },
              { label: 'AI analysis', status: 'active', icon: '🧠' },
            ],
          }],
        });
      }
    });

    // The card the model is about to write shortens its paths; the rows can
    // still offer a remove command because the page keeps the scan's own list.
    setFileIndex(deepResults.largeFiles);

    // Build prompt with deep scan data and send to model
    const prompt = buildDeepScanPrompt(deepResults, userMessage);
    chat.send(prompt);
  } catch (err) {
    // The page says it stopped; nothing goes to the chat. Asking the agent to
    // walk the disk itself would be the raw Bash this app never grants it.
    console.error('Deep scan error:', err);
    restorePage(before);
    flashToast(`Large-file scan stopped: ${err?.message || err}. Try ↻ Scan → Large files again.`);
  } finally {
    scanning = false;
    syncToolbarBusy();
  }
}

function buildDeepScanPrompt(deepResults, userMessage) {
  const parts = [
    `The user asked: "${userMessage}"`,
    ``,
    `Here is the deep file scan data — this is the COMPLETE result of the client-side filesystem walk. Analyze ONLY this data and emit a PageUpdate with the body containing a donut chart, large files table, and duplicates.`,
    ``,
    `IMPORTANT — do NOT call Bash, find, du, or any other tool to gather more files. The scan below is authoritative; if it is empty or sparse, that's the answer. Say so in chat (one sentence) and emit a body with whatever data we do have. The user can re-run if they want a different scope.`,
    ``,
  ];

  if (deepResults.typeBreakdown?.length) {
    parts.push(`## File Type Breakdown (${deepResults.totalFiles?.toLocaleString()} files, ${fmtGb(deepResults.totalSizeGb)})`);
    for (const t of deepResults.typeBreakdown) {
      parts.push(`- ${t.label}: ${fmtGb(t.value)}`);
    }
    parts.push('');
  }

  if (deepResults.largeFiles?.length) {
    parts.push(`## Large Files (${deepResults.largeFiles.length} files over 50MB)`);
    for (const f of deepResults.largeFiles.slice(0, 20)) {
      parts.push(`- ${f.size} | ${f.path} | ${f.age} | ${f.category}`);
    }
    parts.push('');
  }

  if (deepResults.duplicates?.length) {
    parts.push(`## Duplicates (${deepResults.duplicates.length} sets, ${fmtGb(deepResults.totalWastedGb)} wasted)`);
    for (const d of deepResults.duplicates.slice(0, 10)) {
      parts.push(`- ${d.name}: ${d.copies} copies (${d.sizeEach} each, ${fmtGb(d.wastedGb)} wasted)`);
      for (const f of d.files) {
        parts.push(`  - ${f}`);
      }
    }
    parts.push('');
  }

  parts.push('For each large file, label it: safe (delete without worry), backup (valuable but should backup first), review (might be important), or keep (active/recent).');
  parts.push('Use context: .iso/.dmg installers after app is installed = safe. Old recordings = backup. Recent documents = keep.');

  return parts.join('\n');
}

// ── Model response handling ──

/** A legacy `<!--page-->` block in the reply still lands on the page. A reply
    without one is simply a reply — the page never nags for a layout in the
    user's name. */
function handleModelResponse(text) {
  const pageBlock = parsePageBlock(text);
  if (!pageBlock) return;
  applyPageUpdate(pageBlock);
  cacheCurrentPage();
}

// ── Cache ──

function cacheCurrentPage() {
  const sid = new URLSearchParams(window.location.search).get('session') || '';
  if (!sid) return;
  try {
    localStorage.setItem(`apple-shifu-page:${sid}`, JSON.stringify(getCurrentPage()));
    localStorage.setItem(`apple-shifu-page-ts:${sid}`, String(Date.now()));
  } catch { /* quota */ }
}

function restoreFromCache(sessionId) {
  try {
    const cached = localStorage.getItem(`apple-shifu-page:${sessionId}`);
    if (!cached) return false;
    const page = JSON.parse(cached);
    if (!page.top_bar?.length && !page.body?.length) return false;
    restorePage(page);
    return true;
  } catch {
    return false;
  }
}

/** True if a non-empty cached page exists for this session in localStorage. */
function hasCachedPage(sessionId) {
  if (!sessionId) return false;
  try {
    const cached = localStorage.getItem(`apple-shifu-page:${sessionId}`);
    if (!cached) return false;
    const page = JSON.parse(cached);
    return Boolean(page.top_bar?.length || page.body?.length);
  } catch {
    return false;
  }
}

// ── Helpers ──

function fmtGb(gb) {
  if (gb == null || isNaN(gb)) return '--';
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (gb >= 0.001) return `${Math.round(gb * 1024)} MB`;
  return '0 MB';
}
