// Sys Doctor v2 — orchestrator
// Runs hardware probe on open, sends data to model, renders model's page JSON.

import { listSkillSessions } from './api.js';
import { runScan, runDeepFileScan, persistScanSnapshot } from './scan.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';
import { calculateHealthScore, saveScoreHistory, getLastScore, getScoreHistory, estimateDiskFillRate, estimateBatteryLife } from './health-score.js';

const SKILL_NAME = 'sys-doctor';
const params = new URLSearchParams(window.location.search);
// Branded Sys Doctor.app launches with ?app_mode=1, same as core: both ride
// the user's global default model (Settings → Models) unless a per-skill
// localStorage override is set.
const APP_MODE = params.get('app_mode') === '1';
let modelId = params.get('model') || '';
// Check for session in URL — used when resuming or opened from session list
const existingSession = params.get('session') || '';

/** @type {ReturnType<typeof LinggenUI.mount> | null} */
let chat = null;
let scanning = false;
let expectPageBlock = false; // only true right after sending a prompt that should produce a page block

// Disable toolbar buttons while a *local* scan (deep file scan) is running so
// users don't trigger a parallel one. Agent-driven busy state is owned by the
// chat widget (server pushes `busy_sessions`); we don't try to mirror it
// because the skill iframe doesn't receive that signal.
function syncToolbarBusy() {
  for (const btn of document.querySelectorAll('#tools-toolbar .tool-btn')) {
    btn.disabled = scanning;
    btn.classList.toggle('is-busy', scanning);
  }
}

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  // App mode: per-skill override in localStorage('sys-doctor:model') if set.
  // Otherwise leave modelId empty so the engine uses the user's global
  // default model — the fresh-install default is the built-in Linggen Cloud
  // model, so a new user still gets a working scan with no API key.
  if (!modelId && APP_MODE) {
    try { modelId = localStorage.getItem('sys-doctor:model') || ''; }
    catch { /* ignore */ }
  }

  // Resume the most recent session whose dashboard page is cached locally —
  // reopening costs zero tokens and zero scan time (CFO/Pulse pattern). A
  // session without a cached page has nothing to resume *to* (chat history
  // alone has no widget tree) and is skipped. A true first run (nothing
  // resumable) auto-scans — that's the activation moment.
  if (!existingSession) {
    let sessions = [];
    try {
      sessions = await listSkillSessions(SKILL_NAME);
      sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    } catch { /* ignore */ }
    const resumable = sessions.find((s) => hasCachedPage(s.id));
    if (resumable) {
      seedLastScanAt(resumable.created_at);
      const url = new URL(window.location);
      if (sessionAgeMs(resumable) < RESUME_WINDOW_MS) {
        // Recent: resume with full chat continuity.
        url.searchParams.set('session', resumable.id);
        history.replaceState(null, '', url);
        await mountAndStart(resumable.id);
        return;
      }
      // Older than the resume window: rotate. Carry the dashboard forward
      // (page restore is local and free) but bind chat to a fresh session so
      // context stays bounded — cross-scan memory lives in data/latest.json,
      // not in the conversation.
      url.searchParams.delete('session');
      history.replaceState(null, '', url);
      await mountAndStart(null, readCachedPage(resumable.id));
      return;
    }
  }

  // Mount chat and start (existing session or true first run)
  await mountAndStart(existingSession);
});

// ── Mount chat panel and start ──

async function mountAndStart(sessionId, carryPage = null) {
  const chatPanel = document.getElementById('chat-panel');
  const mountOpts = {
    skillName: SKILL_NAME,
    agentId: 'ling',
    modelId,
    title: 'Sys Doctor',
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
          expectPageBlock = false;
        } catch (e) {
          console.warn('[sys-doctor] failed to parse PageUpdate args', e, payload.args);
        }
      }
    },
  };
  if (sessionId) mountOpts.sessionId = sessionId;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Wire up the static tools toolbar. Buttons send pre-set chat messages
  // — the agent picks up the intent (Scan tools / deep scan dispatch).
  for (const btn of document.querySelectorAll('#tools-toolbar .tool-btn')) {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const msg = btn.dataset.msg;
      if (msg && window._chatSend) window._chatSend(msg);
    });
  }

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

  document.getElementById('rescan-btn')?.addEventListener('click', () => startRescan());
  updateScanMeta();
  setInterval(updateScanMeta, 60_000);

  if (sessionId && hasCachedPage(sessionId)) {
    // Restore dashboard from cache — no re-scan, no tokens, no greeting.
    restoreFromCache(sessionId);
    maybeShowStaleBanner();
  } else if (carryPage) {
    // Rotated session: same dashboard, fresh context, still silent.
    restorePage(carryPage);
    maybeShowStaleBanner();
  } else {
    // Fresh session, or resumed session without a usable cache.
    startFresh();
  }
}

// ── Fresh start — agent introduces itself while probe runs in parallel ──

function startFresh() {
  // Parity with the other apps (CFO/Pulse): don't auto-scan on open. Show a
  // ready state and let the user start the scan with the ↻ Rescan button.
  applyPageUpdate({
    body: [
      {
        type: 'info',
        icon: '🩺',
        title: 'Sys Doctor',
        fields: [
          { label: '', value: 'Click ↻ Full Rescan in the toolbar above to run a full system check — CPU, memory, disk, battery, security, and performance.' },
        ],
      },
    ],
  });

  // Greet the user (no scan). sendHidden shows only the agent's reply. The
  // actual scan runs only when the user clicks ↻ Rescan (startHardwareProbe).
  setTimeout(() => {
    if (chat) {
      chat.sendHidden(
        'The user just opened the Sys Doctor app. You are Ling, operating inside Sys Doctor. ' +
        'Do NOT start a scan and do NOT claim a scan is running. ' +
        'Greet warmly: open with "I\'m Ling, your personal system health assistant inside Sys Doctor." ' +
        'Then invite them to click the ↻ Full Rescan button in the System toolbar whenever they want a full health check of their CPU, memory, disk, battery, security, and performance. ' +
        'Keep it natural, 2-3 sentences. No "I\'m thrilled" / "happy to help" / closing CTA. No emojis. Do NOT emit a <!--page block.'
      );
    }
  }, 2000);
}

// ── Hardware probe ──

async function startHardwareProbe(rescan = false) {
  if (scanning) return;
  scanning = true;
  syncToolbarBusy();
  // Capture the pre-rescan summary so the agent can lead with deltas.
  const prevSummary = rescan ? getLastSummary() : null;

  const steps = [
    { label: 'System info', status: 'active', icon: '💻' },
    { label: 'Disk usage', status: 'pending', icon: '💾' },
    { label: 'Security', status: 'pending', icon: '🔒' },
    { label: 'Performance', status: 'pending', icon: '⚡' },
  ];

  applyPageUpdate({
    body: [{ type: 'progress', title: 'Checking your system...', steps: [...steps] }],
  });

  function updateSteps(doneIdx, activeIdx) {
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
      if (data === 'start') return;
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

    // Build and send the scan data (hidden — user doesn't need to see raw data)
    const prompt = buildOpeningPrompt(results, prevSummary);
    expectPageBlock = true;
    chat.sendHidden(prompt);
  } catch (err) {
    console.error('Hardware probe error:', err);
    if (chat) chat.send('Please greet me and show the sys-doctor dashboard. I could not collect hardware data automatically.');
  } finally {
    scanning = false;
    syncToolbarBusy();
  }
}

// ── Rescan + scan metadata ──

// Resume window: within it, reopening reattaches to the same chat; past it
// the dashboard carries forward into a fresh session (bounded context).
const RESUME_WINDOW_MS = 24 * 3600 * 1000;

function sessionAgeMs(session) {
  try {
    const ts = parseInt(localStorage.getItem(`sys-doctor-page-ts:${session.id}`) || '0', 10);
    if (ts) return Date.now() - ts;
  } catch { /* ignore */ }
  return Date.now() - (session.created_at || 0) * 1000;
}

function readCachedPage(sessionId) {
  try {
    const page = JSON.parse(localStorage.getItem(`sys-doctor-page:${sessionId}`) || 'null');
    return page && (page.top_bar?.length || page.body?.length) ? page : null;
  } catch {
    return null;
  }
}

const LAST_SCAN_KEY = 'sys-doctor:last-scan-at';
const LAST_SUMMARY_KEY = 'sys-doctor:last-summary';
const STALE_MS = 7 * 24 * 3600 * 1000;

async function startRescan() {
  if (scanning) return;
  hideStaleBanner();
  await startHardwareProbe(true);
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

function getLastSummary() {
  try { return JSON.parse(localStorage.getItem(LAST_SUMMARY_KEY) || 'null'); }
  catch { return null; }
}

function markScanComplete(summary) {
  try {
    localStorage.setItem(LAST_SCAN_KEY, String(Date.now()));
    localStorage.setItem(LAST_SUMMARY_KEY, JSON.stringify(summary));
  } catch { /* quota */ }
  updateScanMeta();
}

function relTime(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function updateScanMeta() {
  const label = document.getElementById('last-scan-label');
  if (!label) return;
  const at = getLastScanAt();
  if (!at) { label.textContent = ''; label.title = ''; return; }
  label.textContent = `Last scan ${relTime(Date.now() - at)}`;
  label.title = `Data gathered ${new Date(at).toLocaleString()}`;
  label.classList.toggle('stale', Date.now() - at > STALE_MS);
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

// ── Opening prompt ──

function buildOpeningPrompt(results, prevSummary = null) {
  const parts = ['[SYS_SCAN_DATA]\n'];

  if (prevSummary) {
    parts.push(`## Previous Scan Summary (${prevSummary.date || 'earlier'})`);
    if (prevSummary.score != null) parts.push(`- Health score: ${prevSummary.score}/100`);
    if (prevSummary.disk_free_gb != null) parts.push(`- Disk free: ${fmtGb(prevSummary.disk_free_gb)} (${prevSummary.disk_percent}% used)`);
    if (prevSummary.mem_percent != null) parts.push(`- Memory: ${prevSummary.mem_percent}%`);
    if (prevSummary.security_passing != null) parts.push(`- Security: ${prevSummary.security_passing}/${prevSummary.security_total} passing`);
    if (prevSummary.battery_percent != null) parts.push(`- Battery: ${prevSummary.battery_percent}%${prevSummary.cycle_count ? ` (${prevSummary.cycle_count} cycles)` : ''}`);
    parts.push('');
    parts.push('## RESCAN — lead with what changed');
    parts.push('The user hit Rescan on an existing dashboard. In your 2-3 sentence chat text, lead with the most meaningful CHANGES vs the previous summary above (disk freed/used, score moves, new security findings, memory pressure). If nothing moved meaningfully, say the system is steady since the last scan. Then emit the full page block as usual.');
    parts.push('');
  }

  if (results.system) {
    const s = results.system;
    parts.push(`## System`);
    parts.push(`- OS: ${s.os}`);
    parts.push(`- CPU: ${s.cpuBrand} (${s.cpuCores} cores, ${s.cpuUsage}% usage)`);
    if (s.loadAvg?.length) parts.push(`- Load: ${s.loadAvg.join(', ')}`);
    parts.push(`- Memory: ${s.memory.used_gb}/${s.memory.total_gb} GB (${s.memory.percent}%)`);
    parts.push(`- Uptime: ${s.uptime}`);
    parts.push(`- Host: ${s.hostname}`);
    parts.push(`- Arch: ${s.arch}`);
    parts.push('');
  }

  if (results.gpu?.chipset) {
    parts.push(`## GPU`);
    parts.push(`- ${results.gpu.chipset}: ${results.gpu.cores} cores, ${results.gpu.metal}`);
    parts.push('');
  }

  if (results.battery?.percent != null) {
    const b = results.battery;
    parts.push(`## Battery`);
    parts.push(`- ${b.percent}% (${b.status || 'unknown'}), ${b.source || ''}${b.cycleCount ? `, ${b.cycleCount} cycles` : ''}`);
    parts.push('');
  }

  if (results.network?.ip) {
    parts.push(`## Network`);
    parts.push(`- IP: ${results.network.ip}`);
    if (results.network.wifi) parts.push(`- WiFi: ${results.network.wifi}`);
    parts.push('');
  }

  if (results.io) {
    parts.push(`## Storage IO`);
    parts.push(`- ${results.io.mb_per_sec} MB/s, ${results.io.transfers_per_sec} ops/s`);
    parts.push('');
  }

  if (results.disk) {
    const d = results.disk;
    parts.push(`## Disk`);
    parts.push(`- Total: ${fmtGb(d.total_gb)}, Used: ${fmtGb(d.used_gb)}, Free: ${fmtGb(d.free_gb)} (${d.percent}% used)`);
    if (d.top_dirs?.length) {
      parts.push('- Top directories:');
      for (const dir of d.top_dirs) {
        parts.push(`  - ${dir.path}: ${fmtGb(dir.size_gb)}`);
      }
    }
    parts.push('');
  }

  if (results.caches?.length) {
    parts.push(`## Caches`);
    for (const c of results.caches) {
      parts.push(`- ${c.path}: ${fmtGb(c.size_gb)}`);
    }
    parts.push('');
  }

  if (results.garbage?.length) {
    parts.push(`## Garbage Candidates`);
    for (const g of results.garbage) {
      parts.push(`- ${g.path}: ${fmtGb(g.size_gb)} (${g.category})`);
    }
    parts.push('');
  }

  if (results.applicationsRaw) {
    // Use the `=== APPLICATIONS ===` marker the SKILL.md "Apps to Review"
    // trigger watches for. Markdown headers are not recognized.
    parts.push(`=== APPLICATIONS ===`);
    parts.push(results.applicationsRaw);
    parts.push('');
  }

  if (results.security) {
    const s = results.security;
    parts.push(`## Security (${s.passing}/${s.total} passing)`);
    for (const c of s.checks) {
      parts.push(`- ${c.label}: ${c.detail} (${c.status})`);
    }
    if (s.ports?.length) {
      parts.push(`- Open ports: ${s.ports.length} listening`);
    }
    parts.push('');
  }

  if (results.performance) {
    const p = results.performance;
    parts.push(`## Performance`);
    if (p.memProcs?.length) {
      parts.push('- Top memory processes:');
      for (const proc of p.memProcs.slice(0, 5)) {
        parts.push(`  - ${proc.name}: ${proc.memory_mb} MB`);
      }
    }
    if (p.launchAgents) parts.push(`- Launch agents: ${p.launchAgents}`);
    if (p.swapUsedMb > 0) parts.push(`- Swap used: ${Math.round(p.swapUsedMb)} MB`);
    parts.push('');
  }

  // Hardware model + age
  if (results.hardware) {
    const hw = results.hardware;
    parts.push(`## Hardware`);
    if (hw.modelName) parts.push(`- Model: ${hw.modelName}`);
    if (hw.chip) parts.push(`- Chip: ${hw.chip}`);
    if (hw.modelId) parts.push(`- Model ID: ${hw.modelId}`);
    parts.push(`- Architecture: ${hw.isAppleSilicon ? 'Apple Silicon' : 'Intel'}`);
    if (hw.year) parts.push(`- Approximate year: ${hw.year}`);
    if (hw.age != null) parts.push(`- Approximate age: ${hw.age} years`);
    parts.push('');
  }

  // Usage pattern
  if (results.usage) {
    const u = results.usage;
    parts.push(`## Usage Profile: ${u.profile}`);
    if (u.summary) {
      const s = u.summary;
      const detected = [];
      if (s.hasXcode) detected.push('Xcode');
      if (s.hasDocker) detected.push('Docker');
      if (s.hasVSCode) detected.push('VS Code');
      if (s.hasBrew) detected.push('Homebrew');
      if (s.hasNode) detected.push('Node.js');
      if (s.hasOllama) detected.push('Ollama');
      if (s.hasCreative) detected.push('Creative apps');
      if (detected.length) parts.push(`- Detected tools: ${detected.join(', ')}`);
    }
    if (u.apps?.length) {
      parts.push(`- Installed apps: ${u.apps.slice(0, 15).join(', ')}${u.apps.length > 15 ? ` (+${u.apps.length - 15} more)` : ''}`);
    }
    parts.push('');
  }

  // Health score
  if (results.healthScore != null) {
    parts.push(`## Health Score: ${results.healthScore}/100`);
    if (results.scoreBreakdown) {
      for (const [key, b] of Object.entries(results.scoreBreakdown)) {
        parts.push(`- ${key}: ${b.score}/100 (weight: ${b.weight}%)`);
      }
    }
    const history = getScoreHistory();
    if (history.length > 1) {
      const prev = history[history.length - 2];
      parts.push(`- Previous score: ${prev.score} on ${prev.date}`);
    }
    parts.push('');
  }

  // Disk fill rate projection
  const diskRate = estimateDiskFillRate();
  if (diskRate) {
    parts.push(`## Disk Trajectory`);
    parts.push(`- Growing at ~${diskRate.gbPerDay} GB/day`);
    parts.push(`- Currently ${fmtGb(diskRate.currentFreeGb)} free`);
    parts.push(`- Estimated ${diskRate.daysUntilFull} days until full at current rate`);
    parts.push('');
  }

  // Battery lifespan estimate
  if (results.battery?.cycleCount) {
    const battLife = estimateBatteryLife(results.battery.cycleCount, results.battery.percent);
    if (battLife) {
      parts.push(`## Battery Lifespan`);
      parts.push(`- Cycles: ${battLife.cycleCount} / 1000 rated`);
      parts.push(`- Remaining: ~${battLife.remainingCycles} cycles`);
      parts.push(`- Trend: ${battLife.healthTrend}`);
      parts.push(`- ${battLife.recommendation}`);
      parts.push('');
    }
  }

  // Smart advisor hints for the model
  parts.push(`## Advisor Notes`);
  parts.push(`Use the data above to give personalized advice. Key things to consider:`);
  if (results.hardware?.age >= 5) {
    parts.push(`- Machine is ${results.hardware.age} years old. Consider showing a hero widget with upgrade advice if performance is struggling.`);
  }
  if (results.hardware && !results.hardware.isAppleSilicon) {
    parts.push(`- This is an Intel Mac. Apple Silicon offers 2-3x performance and battery life. Worth mentioning if machine is slow.`);
  }
  if (results.disk?.percent >= 85) {
    parts.push(`- Disk is critically full (${results.disk.percent}%). Prioritize cleanup recommendations.`);
  }
  if (results.battery?.percent != null && results.battery.percent < 80) {
    parts.push(`- Battery health below 80%. Warn the user about declining battery life.`);
  }
  if (results.usage?.profile === 'developer' || results.usage?.profile === 'ai-developer') {
    parts.push(`- User is a ${results.usage.profile}. Tailor advice for development workflows (Docker, node_modules, build caches).`);
  }
  parts.push('');
  parts.push(`## IMPORTANT: Response format`);
  parts.push(`You MUST include a <!--page JSON block in your response to build the dashboard.`);
  parts.push(`The left panel renders your page block as visual widgets (top_bar, info card, action-cards).`);
  parts.push(`Keep your chat text to 2-3 sentences — the dashboard shows the details visually.`);
  parts.push(`Do NOT echo or repeat the raw data above in your chat response.`);
  parts.push('');

  return parts.join('\n');
}

// ── Deep scan (client-side) ──

async function runClientDeepScan(userMessage) {
  if (scanning) {
    if (chat) chat.addMessage('assistant', 'Still scanning — please wait a moment.');
    return;
  }
  scanning = true;
  syncToolbarBusy();

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

    // Build prompt with deep scan data and send to model
    const prompt = buildDeepScanPrompt(deepResults, userMessage);
    expectPageBlock = true;
    chat.send(prompt);
  } catch (err) {
    console.error('Deep scan error:', err);
    chat.send(userMessage + '\n\n(Client-side file scan failed. Please use Bash to scan manually.)');
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

function handleModelResponse(text) {
  const pageBlock = parsePageBlock(text);

  if (pageBlock) {
    expectPageBlock = false;
    applyPageUpdate(pageBlock);
    cacheCurrentPage();
    return;
  }

  // Only retry if we were expecting a page block (after probe/scan prompt)
  if (expectPageBlock && chat) {
    expectPageBlock = false; // don't retry more than once
    chat.send(
      'Please include a ```page JSON block in your response to update the dashboard. ' +
      'Refer to your skill instructions for the page layout format.'
    );
  }
  // Otherwise: model just answered a question without view change — that's fine.
}

// ── Cache ──

function cacheCurrentPage() {
  const sid = new URLSearchParams(window.location.search).get('session') || '';
  if (!sid) return;
  try {
    localStorage.setItem(`sys-doctor-page:${sid}`, JSON.stringify(getCurrentPage()));
    localStorage.setItem(`sys-doctor-page-ts:${sid}`, String(Date.now()));
  } catch { /* quota */ }
}

function restoreFromCache(sessionId) {
  try {
    const cached = localStorage.getItem(`sys-doctor-page:${sessionId}`);
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
    const cached = localStorage.getItem(`sys-doctor-page:${sessionId}`);
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
