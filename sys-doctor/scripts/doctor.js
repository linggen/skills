// Sys Doctor dashboard logic
import { fetchModels, fetchDefaultModel } from './api.js';
import { drawDiskBars } from './charts.js';

const SKILL_NAME = 'sys-doctor';
const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';
const scanType = params.get('scan') || 'full';
const existingSession = params.get('session') || '';

/** @type {ReturnType<typeof LinggenUI.mount> | null} */
let chat = null;
let scanning = false;

// Scan progress tracking
const SCAN_STEPS = [
  { key: 'system', label: 'System info', icon: '💻' },
  { key: 'disk', label: 'Disk usage', icon: '💾' },
  { key: 'apps', label: 'App inventory', icon: '📦' },
  { key: 'garbage', label: 'Garbage scan', icon: '🗑️' },
  { key: 'analysis', label: 'AI analysis', icon: '🧠' },
];
let completedSteps = new Set();

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Load models into switcher
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

  // Mount chat
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
    onStreamToken: handleStreamToken,
    onStreamEnd: handleStreamEnd,
  };

  if (existingSession) {
    mountOpts.sessionId = existingSession;
  }

  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Scan button
  document.getElementById('scan-btn').addEventListener('click', () => startScan());

  // Auto-start scan if no existing session
  if (!existingSession) {
    setTimeout(() => {
      startScan();
    }, 300);
  }
});

// ── Scan ──

function startScan() {
  if (scanning || !chat) return;
  scanning = true;
  completedSteps = new Set();
  setScanStatus('scanning', 'Scanning...');
  showScanProgress();
  // Use [BOARD_MOVE] prefix so SDK hides this message from chat UI
  chat.send(`[BOARD_MOVE] [SYS_SCAN] ${scanType}`);
}

function setScanStatus(cls, text) {
  const el = document.getElementById('scan-status');
  el.className = `scan-status ${cls}`;
  el.textContent = text;
}

function showScanProgress() {
  const dashboard = document.getElementById('dashboard');

  // Remove existing progress if any
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

  // Insert at top of dashboard
  dashboard.insertBefore(progressEl, dashboard.firstChild);
}

function markStepDone(key) {
  if (completedSteps.has(key)) return;
  completedSteps.add(key);
  const statusEl = document.getElementById(`step-status-${key}`);
  if (statusEl) {
    statusEl.innerHTML = '<span class="step-check">✓</span>';
  }
  const stepEl = document.getElementById(`step-${key}`);
  if (stepEl) stepEl.classList.add('done');
}

function markStepActive(key) {
  const stepEl = document.getElementById(`step-${key}`);
  if (stepEl && !stepEl.classList.contains('done')) {
    stepEl.classList.add('active');
  }
}

function removeScanProgress() {
  const el = document.getElementById('scan-progress');
  if (el) {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 400);
  }
}

// ── Stream Token Handler (live progress) ──

let lastTokenText = '';

function handleStreamToken(fullText) {
  lastTokenText = fullText;

  // Detect progress from streaming text content
  // The agent mentions these keywords as it runs commands
  const lower = fullText.toLowerCase();

  if (lower.includes('sw_vers') || lower.includes('uname') || lower.includes('sysctl') || lower.includes('os-release') || lower.includes('hostname')) {
    markStepActive('system');
  }
  if (lower.includes('df -h') || lower.includes('du -sh') || lower.includes('disk usage')) {
    markStepActive('disk');
  }
  if (lower.includes('brew') || lower.includes('docker') || lower.includes('npm ls') || lower.includes('pip list')) {
    markStepActive('apps');
  }
  if (lower.includes('.trash') || lower.includes('node_modules') || lower.includes('caches') || lower.includes('deriveddata')) {
    markStepActive('garbage');
  }

  // Check if sections are completing (data appearing in structured tags)
  if (fullText.includes('"system"') && fullText.includes('"os"')) {
    markStepDone('system');
  }
  if (fullText.includes('"disk"') && fullText.includes('"top_dirs"')) {
    markStepDone('disk');
  }
  if (fullText.includes('"apps"')) {
    markStepDone('apps');
  }
  if (fullText.includes('"garbage"')) {
    markStepDone('garbage');
  }
  if (fullText.includes('[RECOMMENDATIONS]')) {
    markStepDone('analysis');
  }

  // Try to parse partial dashboard update for early rendering
  tryPartialUpdate(fullText);
}

// ── Partial Dashboard Updates ──

let lastPartialUpdate = '';

function tryPartialUpdate(text) {
  // Only try if we have a DASHBOARD_UPDATE opening tag
  const startIdx = text.indexOf('[DASHBOARD_UPDATE]');
  if (startIdx === -1) return;

  const jsonStart = startIdx + '[DASHBOARD_UPDATE]'.length;
  const endIdx = text.indexOf('[/DASHBOARD_UPDATE]');

  // If complete, don't do partial — handleStreamEnd will handle it
  if (endIdx !== -1) return;

  // Try to extract partial JSON and parse what we can
  const partial = text.slice(jsonStart).trim();
  if (partial === lastPartialUpdate) return;
  lastPartialUpdate = partial;

  // Try parsing — may fail if JSON is incomplete, that's ok
  try {
    // Attempt to fix incomplete JSON by closing open braces
    const fixed = fixPartialJson(partial);
    if (fixed) {
      const data = JSON.parse(fixed);
      updateDashboard(data);
    }
  } catch {
    // Expected — JSON is still streaming
  }
}

function fixPartialJson(s) {
  // Count open/close braces and brackets
  let braces = 0, brackets = 0;
  let inString = false, escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  // Only try to fix if we have at least one complete top-level key
  if (braces <= 0 && brackets <= 0) return s;
  if (!s.includes(':')) return null;

  // Remove trailing comma or incomplete key
  let fixed = s.replace(/,\s*$/, '').replace(/,\s*"[^"]*"?\s*$/, '');

  // Close open brackets and braces
  while (brackets > 0) { fixed += ']'; brackets--; }
  while (braces > 0) { fixed += '}'; braces--; }

  return fixed;
}

// ── Stream End Handler ──

function handleStreamEnd(text) {
  scanning = false;
  lastPartialUpdate = '';
  setScanStatus('done', 'Done');

  // Mark all steps done
  SCAN_STEPS.forEach(s => markStepDone(s.key));

  // Remove progress after a brief delay
  setTimeout(removeScanProgress, 800);

  // Parse dashboard update (final, complete)
  const dashMatch = text.match(/\[DASHBOARD_UPDATE\]([\s\S]*?)\[\/DASHBOARD_UPDATE\]/);
  if (dashMatch) {
    try {
      const data = JSON.parse(dashMatch[1]);
      updateDashboard(data);
    } catch (e) {
      console.error('Failed to parse DASHBOARD_UPDATE:', e);
    }
  }

  // Parse recommendations
  const recsMatch = text.match(/\[RECOMMENDATIONS\]([\s\S]*?)\[\/RECOMMENDATIONS\]/);
  if (recsMatch) {
    try {
      const recs = JSON.parse(recsMatch[1]);
      renderRecommendations(recs);
    } catch (e) {
      console.error('Failed to parse RECOMMENDATIONS:', e);
    }
  }
}

// ── Dashboard Update ──

function updateDashboard(data) {
  // System cards
  if (data.system) {
    const sys = data.system;
    setText('val-os', sys.os || '--');
    setText('sub-os', [sys.hostname, sys.uptime ? `Up ${sys.uptime}` : ''].filter(Boolean).join(' · '));
    setText('val-cpu', sys.cpu || '--');
  }

  if (data.system?.memory) {
    const mem = data.system.memory;
    setText('val-memory', `${mem.percent || 0}%`);
    setText('sub-memory', `${fmtGb(mem.used_gb)} / ${fmtGb(mem.total_gb)}`);
    setBar('bar-memory', mem.percent, mem.percent > 90 ? 'var(--danger)' : mem.percent > 75 ? 'var(--warning)' : 'var(--accent)');
  }

  // Disk card
  if (data.disk) {
    const d = data.disk;
    setText('val-disk', `${d.percent || 0}%`);
    setText('sub-disk', `${fmtGb(d.used_gb)} / ${fmtGb(d.total_gb)}`);
    setBar('bar-disk', d.percent, d.percent > 90 ? 'var(--danger)' : d.percent > 75 ? 'var(--warning)' : 'var(--accent)');
    setText('disk-badge', `${fmtGb(d.free_gb)} free`);

    // Draw chart
    if (d.top_dirs && d.top_dirs.length > 0) {
      const canvas = document.getElementById('disk-chart');
      const neededH = d.top_dirs.length * 32 + 24;
      canvas.style.height = `${Math.max(neededH, 120)}px`;
      drawDiskBars(canvas, d.top_dirs, d.total_gb);
    }
  }

  // Apps
  if (data.apps) {
    renderApps(data.apps);
  }

  // Garbage
  if (data.garbage && data.garbage.length > 0) {
    renderGarbage(data.garbage);
  }
}

// ── Render Recommendations ──

function renderRecommendations(recs) {
  const panel = document.getElementById('recs-panel');
  const list = document.getElementById('recs-list');
  if (!recs || recs.length === 0) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const totalSavings = recs.reduce((sum, r) => sum + (r.savings_gb || 0), 0);
  setText('recs-badge', `${fmtGb(totalSavings)} reclaimable`);

  list.innerHTML = '';
  for (const rec of recs) {
    const item = document.createElement('div');
    item.className = 'rec-item';
    item.innerHTML = `
      <span class="rec-risk ${rec.risk || 'safe'}">${rec.risk || 'safe'}</span>
      <div class="rec-info">
        <div class="rec-title">${esc(rec.title)}</div>
        <div class="rec-desc">${esc(rec.description || '')}</div>
      </div>
      <span class="rec-savings">${fmtGb(rec.savings_gb)}</span>
      ${rec.command ? `<button class="rec-copy" data-cmd="${esc(rec.command)}" title="Copy command">Copy</button>` : ''}
    `;
    list.appendChild(item);
  }

  // Copy button handlers
  list.querySelectorAll('.rec-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      navigator.clipboard.writeText(cmd).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
      });
    });
  });
}

// ── Render Apps ──

function renderApps(apps) {
  const panel = document.getElementById('apps-panel');
  const grid = document.getElementById('apps-grid');
  panel.style.display = '';
  grid.innerHTML = '';

  const items = [
    { icon: '🍺', name: 'Homebrew', stat: apps.brew ? `${apps.brew.count} pkgs · ${fmtGb(apps.brew.size_gb)}` : null },
    { icon: '🐳', name: 'Docker', stat: apps.docker ? `${apps.docker.images} images · ${fmtGb(apps.docker.size_gb)}` : null },
    { icon: '📦', name: 'npm global', stat: apps.npm_global ? `${apps.npm_global.count} pkgs` : null },
    { icon: '🐍', name: 'pip', stat: apps.pip ? `${apps.pip.count} pkgs` : null },
  ].filter(i => i.stat);

  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'app-item';
    el.innerHTML = `
      <div class="app-icon">${item.icon}</div>
      <div class="app-name">${item.name}</div>
      <div class="app-stat">${item.stat}</div>
    `;
    grid.appendChild(el);
  }
}

// ── Render Garbage ──

function renderGarbage(garbage) {
  const panel = document.getElementById('garbage-panel');
  const list = document.getElementById('garbage-list');
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
