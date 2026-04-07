// Sys Doctor dashboard — Robot Doctor pattern:
// Phase 1: Client runs bash commands in parallel (fast, no model)
// Phase 2: Send collected data to model for analysis
// Phase 3: Model's recommendations displayed in chat
import { fetchModels, fetchDefaultModel } from './api.js';
import { runScan } from './scan.js';
import { drawDiskBars } from './charts.js';

const SKILL_NAME = 'sys-doctor';
const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';
const scanType = params.get('scan') || 'full';
const existingSession = params.get('session') || '';

/** @type {ReturnType<typeof LinggenUI.mount> | null} */
let chat = null;
let scanning = false;

// Scan progress steps
const SCAN_STEPS = [
  { key: 'system', label: 'System info', icon: '\uD83D\uDCBB' },
  { key: 'disk', label: 'Disk usage', icon: '\uD83D\uDCBE' },
  { key: 'garbage', label: 'Garbage scan', icon: '\uD83D\uDDD1\uFE0F' },
  { key: 'analysis', label: 'AI analysis', icon: '\uD83E\uDDE0' },
];
let completedSteps = new Set();

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Load models
  const modelSwitcher = document.getElementById('model-switcher');
  try {
    const [models, defaultModel] = await Promise.all([fetchModels(), fetchDefaultModel()]);
    modelSwitcher.innerHTML = '';
    if (!modelId) modelId = defaultModel || (models[0] && models[0].id) || '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.id} (${m.provider})`;
      if (m.id === modelId) opt.selected = true;
      modelSwitcher.appendChild(opt);
    }
  } catch {
    modelSwitcher.innerHTML = '<option>No models</option>';
  }
  modelSwitcher.addEventListener('change', () => {
    modelId = modelSwitcher.value;
    if (chat) chat.setOptions({ modelId });
  });

  // Mount chat panel
  const chatPanel = document.getElementById('chat-panel');
  const mountOpts = {
    skillName: SKILL_NAME,
    agentId: 'ling',
    modelId,
    title: 'Diagnosis',
    placeholder: 'Ask about your system...',
    onSessionCreated: (sid) => {
      const url = new URL(window.location);
      url.searchParams.set('session', sid);
      history.replaceState(null, '', url);
    },
    onStreamEnd: (text) => {
      handleModelResponse(text);
    },
  };
  if (existingSession) mountOpts.sessionId = existingSession;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Scan button
  document.getElementById('scan-btn').addEventListener('click', () => startScan());

  // Restore from cache or auto-start
  if (existingSession) {
    restoreFromCache(existingSession);
    // If no recommendations in cache, try to extract from chat history
    tryRestoreRecsFromHistory(existingSession);
  } else {
    setTimeout(() => startScan(), 300);
  }
});

// ── Scan ──

async function startScan() {
  if (scanning || !chat) return;
  scanning = true;
  completedSteps = new Set();
  setScanStatus('scanning', 'Scanning...');
  showScanProgress();

  try {
    const sessionId = chat.getSessionId();

    // Phase 1: Run all bash commands in parallel (no model)
    const results = await runScan(scanType, sessionId, handleScanProgress);

    // Update dashboard with final results
    if (results.system) updateSystemCards(results.system);
    if (results.gpu) updateGpuCard(results.gpu);
    if (results.battery) updateBatteryCard(results.battery);
    if (results.network) updateNetworkCard(results.network);
    if (results.io) updateIoCard(results.io);
    if (results.disk) updateDiskPanel(results.disk);
    if (results.garbage) renderGarbage(results.garbage);

    // Cache for restore on refresh
    cacheDashboardData(results);

    // Mark scan steps done
    markStepDone('system');
    markStepDone('disk');
    if (scanType === 'full') markStepDone('garbage');

    // Phase 2: Send data to model for AI analysis
    markStepActive('analysis');
    const prompt = buildAnalysisPrompt(results);
    chat.send(prompt);

    // Analysis step marked done when model response arrives (in handleModelResponse)
    setScanStatus('done', 'Done');
  } catch (err) {
    console.error('Scan error:', err);
    setScanStatus('error', 'Error');
    // Fallback: let model do the scan the old way
    chat.send(`[SYS_SCAN] ${scanType}`);
  } finally {
    scanning = false;
  }
}

/** Build a prompt with all collected data for the model to analyze. */
function buildAnalysisPrompt(results) {
  const parts = ['Here is my system scan data. Please analyze it and provide recommendations.\n'];

  if (results.system) {
    const s = results.system;
    parts.push(`## System\n- OS: ${s.os}\n- CPU: ${s.cpuBrand} (${s.cpuCores} cores, ${s.cpuUsage}% usage)\n- Load: ${(s.loadAvg || []).join(', ')}\n- Memory: ${s.memory.used_gb}/${s.memory.total_gb} GB (${s.memory.percent}%)\n- Uptime: ${s.uptime}\n- Host: ${s.hostname}\n- Arch: ${s.arch}\n`);
  }

  if (results.gpu) {
    const g = results.gpu;
    if (g.chipset) parts.push(`## GPU\n- ${g.chipset}: ${g.cores} cores, ${g.metal}\n`);
  }

  if (results.battery) {
    const b = results.battery;
    if (b.percent != null) {
      parts.push(`## Battery\n- ${b.percent}% (${b.status || 'unknown'}), ${b.source || ''}${b.cycleCount ? `, ${b.cycleCount} cycles` : ''}\n`);
    }
  }

  if (results.io) {
    parts.push(`## Storage IO\n- ${results.io.mb_per_sec} MB/s, ${results.io.transfers_per_sec} ops/s\n`);
  }

  if (results.disk) {
    const d = results.disk;
    parts.push(`## Disk\n- Total: ${fmtGb(d.total_gb)}, Used: ${fmtGb(d.used_gb)}, Free: ${fmtGb(d.free_gb)} (${d.percent}% used)`);
    if (d.top_dirs && d.top_dirs.length > 0) {
      parts.push('- Top directories:');
      for (const dir of d.top_dirs) {
        parts.push(`  - ${dir.path}: ${fmtGb(dir.size_gb)}`);
      }
    }
    parts.push('');
  }

  if (results.caches && results.caches.length > 0) {
    parts.push('## Caches');
    for (const c of results.caches) {
      parts.push(`- ${c.path}: ${fmtGb(c.size_gb)}`);
    }
    parts.push('');
  }

  if (results.garbage && results.garbage.length > 0) {
    parts.push('## Garbage Candidates');
    for (const g of results.garbage) {
      parts.push(`- ${g.path}: ${fmtGb(g.size_gb)} (${g.category})`);
    }
    parts.push('');
  }

  parts.push(`Please provide your analysis in natural language (markdown), then at the very end append a JSON block with structured recommendations for the dashboard. The JSON block MUST be wrapped in \`\`\`json fences. Format:

\`\`\`json
[
  {"title": "Clear Xcode DerivedData", "savings_gb": 7.7, "risk": "safe", "command": "rm -rf ~/Library/Developer/Xcode/DerivedData", "description": "Build artifacts, Xcode regenerates on next build"},
  {"title": "Remove old simulators", "savings_gb": 8.6, "risk": "review", "command": "xcrun simctl delete unavailable", "description": "Only removes unavailable devices"}
]
\`\`\`

Risk values: "safe", "review", or "caution". Include 3-6 recommendations sorted by impact.`);

  return parts.join('\n');
}

// ── Scan progress callbacks ──

function handleScanProgress(step, data) {
  if (data === 'start') {
    markStepActive(step);
    return;
  }
  markStepDone(step);

  // Update dashboard incrementally as data arrives
  if (step === 'system' && data) updateSystemCards(data);
  if (step === 'disk' && data) updateDiskPanel(data);
  if (step === 'garbage' && data) renderGarbage(data);
}

// ── Dashboard updates ──

function updateSystemCards(sys) {
  setText('val-os', sys.os || '--');
  setText('sub-os', [sys.hostname, sys.uptime ? `Up ${sys.uptime}` : ''].filter(Boolean).join(' \u00B7 '));

  // CPU card — show brand, cores, usage
  const cpuLabel = sys.cpuBrand || `${sys.cpuCores} cores`;
  setText('val-cpu', cpuLabel);
  const cpuSub = [`${sys.cpuCores} cores`, sys.cpuUsage ? `${sys.cpuUsage}% usage` : ''].filter(Boolean).join(' \u00B7 ');
  setText('sub-cpu', cpuSub);
  if (sys.cpuUsage) {
    setBar('bar-cpu', sys.cpuUsage, sys.cpuUsage > 90 ? 'var(--danger)' : sys.cpuUsage > 70 ? 'var(--warning)' : 'var(--accent)');
  }

  if (sys.memory) {
    const mem = sys.memory;
    setText('val-memory', `${mem.percent || 0}%`);
    setText('sub-memory', `${fmtGb(mem.used_gb)} / ${fmtGb(mem.total_gb)}`);
    setBar('bar-memory', mem.percent, mem.percent > 90 ? 'var(--danger)' : mem.percent > 75 ? 'var(--warning)' : 'var(--accent)');
  }
}

function updateGpuCard(gpu) {
  if (!gpu || !gpu.chipset) {
    setText('val-gpu', '--');
    return;
  }
  setText('val-gpu', `${gpu.cores} cores`);
  setText('sub-gpu', [gpu.chipset, gpu.metal].filter(Boolean).join(' \u00B7 '));
}

function updateBatteryCard(bat) {
  if (!bat || bat.percent == null) {
    setText('val-battery', 'N/A');
    setText('sub-battery', 'Desktop / no battery');
    return;
  }
  setText('val-battery', `${bat.percent}%`);
  const parts = [bat.status, bat.source].filter(Boolean);
  if (bat.cycleCount) parts.push(`${bat.cycleCount} cycles`);
  if (bat.remaining) parts.push(`${bat.remaining} left`);
  setText('sub-battery', parts.join(' \u00B7 '));
  setBar('bar-battery', bat.percent,
    bat.percent < 20 ? 'var(--danger)' : bat.percent < 50 ? 'var(--warning)' : 'var(--success)');
}

function updateNetworkCard(net) {
  if (!net || !net.ip) {
    setText('val-network', 'Disconnected');
    return;
  }
  setText('val-network', net.wifi || net.iface || 'Connected');
  setText('sub-network', net.ip);
}

function updateIoCard(io) {
  if (!io) {
    setText('val-io', '--');
    return;
  }
  setText('val-io', `${io.mb_per_sec} MB/s`);
  setText('sub-io', `${io.transfers_per_sec} ops/s \u00B7 ${io.kb_per_transfer} KB/op`);
}

function updateDiskPanel(disk) {
  setText('val-disk', `${disk.percent || 0}% used`);
  setText('sub-disk', `${fmtGb(disk.used_gb)} / ${fmtGb(disk.total_gb)}`);
  setBar('bar-disk', disk.percent, disk.percent > 90 ? 'var(--danger)' : disk.percent > 75 ? 'var(--warning)' : 'var(--accent)');
  setText('disk-badge', `${fmtGb(disk.free_gb)} free`);

  const diskPanel = document.getElementById('disk-panel');
  if (disk.top_dirs && disk.top_dirs.length > 0) {
    diskPanel.style.display = '';
    const canvas = document.getElementById('disk-chart');
    const neededH = disk.top_dirs.length * 32 + 24;
    canvas.style.height = `${Math.max(neededH, 120)}px`;
    drawDiskBars(canvas, disk.top_dirs, disk.total_gb);
  } else {
    // Hide the chart panel when no dir data — avoid empty space
    diskPanel.style.display = 'none';
  }
}

function renderGarbage(garbage) {
  const panel = document.getElementById('garbage-panel');
  const list = document.getElementById('garbage-list');
  if (!garbage || garbage.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const totalGb = garbage.reduce((s, g) => s + (g.size_gb || 0), 0);
  setText('garbage-badge', `${fmtGb(totalGb)} total`);

  list.innerHTML = '';
  const sorted = [...garbage].sort((a, b) => (b.size_gb || 0) - (a.size_gb || 0));
  for (const g of sorted) {
    const el = document.createElement('div');
    el.className = 'garbage-item';
    el.innerHTML = `
      <span class="garbage-risk ${g.risk || 'safe'}">${g.risk || 'safe'}</span>
      <span class="garbage-path" title="${esc(g.path)}">${esc(g.path)}</span>
      <span class="garbage-size">${fmtGb(g.size_gb)}</span>
    `;
    list.appendChild(el);
  }
}

// ── Progress UI ──

function setScanStatus(cls, text) {
  const el = document.getElementById('scan-status');
  el.className = `scan-status ${cls}`;
  el.textContent = text;
}

function showScanProgress() {
  const dashboard = document.getElementById('dashboard');
  const existing = document.getElementById('scan-progress');
  if (existing) existing.remove();

  const steps = scanType === 'quick'
    ? SCAN_STEPS.filter(s => s.key === 'system' || s.key === 'disk' || s.key === 'analysis')
    : scanType === 'disk'
      ? SCAN_STEPS.filter(s => s.key === 'disk' || s.key === 'garbage' || s.key === 'analysis')
      : SCAN_STEPS;

  const progressEl = document.createElement('div');
  progressEl.id = 'scan-progress';
  progressEl.className = 'scan-progress';
  progressEl.innerHTML = `
    <div class="scan-progress-title">Scanning your system...</div>
    <div class="scan-steps">
      ${steps.map(s => `
        <div class="scan-step" id="step-${s.key}">
          <span class="step-icon">${s.icon}</span>
          <span class="step-label">${s.label}</span>
          <span class="step-status" id="step-status-${s.key}">
            <span class="step-spinner"></span>
          </span>
        </div>
      `).join('')}
    </div>
  `;
  dashboard.insertBefore(progressEl, dashboard.firstChild);
}

function markStepDone(key) {
  if (completedSteps.has(key)) return;
  completedSteps.add(key);
  const statusEl = document.getElementById(`step-status-${key}`);
  if (statusEl) statusEl.innerHTML = '<span class="step-check">\u2713</span>';
  const stepEl = document.getElementById(`step-${key}`);
  if (stepEl) stepEl.classList.add('done');
  // Update title when all visible steps are done
  const titleEl = document.querySelector('.scan-progress-title');
  const allSteps = document.querySelectorAll('.scan-step');
  const doneSteps = document.querySelectorAll('.scan-step.done');
  if (titleEl && allSteps.length > 0 && allSteps.length === doneSteps.length) {
    titleEl.textContent = 'Scan complete';
  }
}

function markStepActive(key) {
  const stepEl = document.getElementById(`step-${key}`);
  if (stepEl && !stepEl.classList.contains('done')) stepEl.classList.add('active');
}

function removeScanProgress() {
  const el = document.getElementById('scan-progress');
  if (el) {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 400);
  }
}

// ── Cache ──

function restoreFromCache(sessionId) {
  try {
    const cached = localStorage.getItem(`sys-doctor:${sessionId}`);
    if (!cached) return;
    const data = JSON.parse(cached);
    if (data.system) updateSystemCards(data.system);
    if (data.gpu) updateGpuCard(data.gpu);
    if (data.battery) updateBatteryCard(data.battery);
    if (data.network) updateNetworkCard(data.network);
    if (data.io) updateIoCard(data.io);
    if (data.disk) updateDiskPanel(data.disk);
    if (data.garbage) renderGarbage(data.garbage);
    if (data.recommendations) renderRecommendations(data.recommendations);
    setScanStatus('done', 'Ready');
  } catch { /* cache miss */ }
}

/** Try to extract recommendations from chat history (for old sessions without cached recs). */
async function tryRestoreRecsFromHistory(sessionId) {
  // Check if we already have cached recommendations
  try {
    const cached = JSON.parse(localStorage.getItem(`sys-doctor:${sessionId}`) || '{}');
    if (cached.recommendations && cached.recommendations.length > 0) return; // already have them
  } catch { /* ignore */ }

  // Fetch chat messages and look for the last assistant message with a JSON block
  try {
    const { fetchSessionMessages } = await import('./api.js');
    const messages = await fetchSessionMessages(SKILL_NAME, sessionId);
    // Search from newest to oldest for a message with ```json
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.content && msg.content.includes('```json')) {
        const { recs } = parseRecommendations(msg.content);
        if (recs.length > 0) {
          renderRecommendations(recs);
          // Cache for next time
          try {
            const existing = JSON.parse(localStorage.getItem(`sys-doctor:${sessionId}`) || '{}');
            existing.recommendations = recs;
            localStorage.setItem(`sys-doctor:${sessionId}`, JSON.stringify(existing));
          } catch { /* ignore */ }
          break;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to restore recs from history:', e);
  }
}

function cacheDashboardData(results) {
  const sid = new URLSearchParams(window.location.search).get('session') || '';
  if (!sid) return;
  try {
    localStorage.setItem(`sys-doctor:${sid}`, JSON.stringify(results));
  } catch { /* quota exceeded */ }
}

// ── Model response validation + retry ──

let retryCount = 0;
const MAX_RETRIES = 1;

function handleModelResponse(text) {
  markStepDone('analysis');
  const { recs, error } = parseRecommendations(text);

  if (recs.length > 0) {
    retryCount = 0;
    renderRecommendations(recs);
    // Cache recommendations alongside scan data
    const sid = new URLSearchParams(window.location.search).get('session') || '';
    if (sid) {
      try {
        const existing = JSON.parse(localStorage.getItem(`sys-doctor:${sid}`) || '{}');
        existing.recommendations = recs;
        localStorage.setItem(`sys-doctor:${sid}`, JSON.stringify(existing));
      } catch { /* ignore */ }
    }
    return;
  }

  // JSON missing or invalid — ask model to fix it (once)
  if (retryCount < MAX_RETRIES && chat) {
    retryCount++;
    const correction = error
      ? `Your JSON block had an error: ${error}\n\nPlease reply with ONLY a valid \`\`\`json code block containing the recommendations array. Schema:\n[{"title": "string", "savings_gb": number, "risk": "safe|review|caution", "command": "string", "description": "string"}]`
      : 'You forgot to include the ```json recommendation block at the end. Please reply with ONLY a valid ```json code block containing the recommendations array.';
    chat.send(correction);
  }
}

// ── Recommendation parsing (from model's markdown response) ──

/**
 * Extract structured recommendations from the model's response.
 * The prompt asks the model to append a ```json block at the end.
 * Returns { recs: [...], error?: string }.
 */
function parseRecommendations(text) {
  // Find the last ```json ... ``` block in the response
  const jsonBlocks = text.match(/```json\s*\n([\s\S]*?)\n```/g);
  if (!jsonBlocks) return { recs: [], error: null }; // no JSON block — model forgot

  const lastBlock = jsonBlocks[jsonBlocks.length - 1];
  const jsonStr = lastBlock.replace(/```json\s*\n/, '').replace(/\n```$/, '').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return { recs: [], error: 'Expected a JSON array, got ' + typeof parsed };

    // Validate each item has required fields
    const recs = [];
    for (const r of parsed) {
      if (!r.title) continue;
      if (typeof r.savings_gb !== 'number' && r.savings_gb !== undefined) {
        return { recs: [], error: `"savings_gb" must be a number, got "${r.savings_gb}" for "${r.title}"` };
      }
      const risk = String(r.risk || 'review').toLowerCase();
      if (!['safe', 'review', 'caution'].includes(risk)) {
        return { recs: [], error: `"risk" must be "safe", "review", or "caution", got "${r.risk}" for "${r.title}"` };
      }
      recs.push({
        title: String(r.title),
        description: String(r.description || ''),
        savings_gb: Number(r.savings_gb || 0),
        risk,
        command: String(r.command || ''),
      });
    }
    return { recs, error: null };
  } catch (e) {
    return { recs: [], error: `JSON parse error: ${e.message}` };
  }
}

/** Render recommendation cards on the dashboard. */
function renderRecommendations(recs) {
  const panel = document.getElementById('recs-panel');
  const list = document.getElementById('recs-list');
  if (!recs || recs.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const totalSavings = recs.reduce((sum, r) => sum + (r.savings_gb || 0), 0);
  setText('recs-badge', `~${fmtGb(totalSavings)} reclaimable`);

  list.innerHTML = '';
  for (const rec of recs) {
    const item = document.createElement('div');
    item.className = 'rec-item';
    item.innerHTML = `
      <div class="rec-header">
        <span class="rec-risk ${rec.risk || 'review'}">${esc(rec.risk || 'review')}</span>
        <div class="rec-info">
          <div class="rec-title">${esc(rec.title)}</div>
          <div class="rec-desc">${esc(rec.description)}</div>
        </div>
        ${rec.savings_gb ? `<span class="rec-savings">${fmtGb(rec.savings_gb)}</span>` : ''}
      </div>
      ${rec.command ? `
        <div class="rec-cmd-block">
          <code class="rec-cmd-code">${esc(rec.command)}</code>
          <button class="rec-copy" data-cmd="${esc(rec.command)}" title="Copy command">Copy</button>
        </div>
      ` : ''}
    `;
    list.appendChild(item);
  }

  // Copy button handlers
  list.querySelectorAll('.rec-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.cmd).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
      });
    });
  });
}

// ── Helpers ──

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

function setBar(id, percent, color) {
  const el = document.getElementById(id);
  if (el) {
    el.style.width = `${Math.min(100, percent || 0)}%`;
    el.style.background = color || 'var(--accent)';
  }
}

function fmtGb(gb) {
  if (gb == null || isNaN(gb)) return '--';
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (gb >= 0.001) return `${Math.round(gb * 1024)} MB`;
  return '0 MB';
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
