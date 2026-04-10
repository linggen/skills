// Sys Doctor v2 — orchestrator
// Runs hardware probe on open, sends data to model, renders model's page JSON.

import { fetchDefaultModel } from './api.js';
import { runScan, runDeepFileScan } from './scan.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';
import { calculateHealthScore, saveScoreHistory, getLastScore, getScoreHistory, estimateDiskFillRate, estimateBatteryLife } from './health-score.js';

const SKILL_NAME = 'sys-doctor';
const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';
const existingSession = params.get('session') || '';

/** @type {ReturnType<typeof LinggenUI.mount> | null} */
let chat = null;
let scanning = false;
let expectPageBlock = false; // only true right after sending a prompt that should produce a page block

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  // Load default model (chat widget has its own model selector)
  if (!modelId) {
    try {
      const defaultModel = await fetchDefaultModel();
      modelId = localStorage.getItem('sys-doctor:model') || defaultModel || '';
    } catch { /* ignore */ }
  }

  // Mount chat panel
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
    },
    onStreamEnd: (text) => {
      handleModelResponse(text);
    },
  };
  if (existingSession) mountOpts.sessionId = existingSession;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Expose send for widget click handlers.
  // Intercept deep scan triggers to run client-side before sending to model.
  window._chatSend = async (text) => {
    if (!chat) return;
    const lower = text.toLowerCase();
    if (lower.includes('large file') || lower.includes('deep scan') || lower.includes('scan files') || lower.includes('find duplicate')) {
      await runClientDeepScan(text);
    } else {
      chat.send(text);
    }
  };

  // Restore or start fresh
  if (existingSession) {
    const restored = restoreFromCache(existingSession);
    if (!restored) {
      showWelcome();
      startHardwareProbe();
    }
  } else {
    showWelcome();
    startHardwareProbe();
  }
});

// ── Welcome message ──

function showWelcome() {
  if (!chat) return;
  chat.addMessage('assistant',
    "Hi, I'm **Sys Doctor** — your AI system health analyst.\n\n" +
    "I'm scanning your hardware right now — checking CPU, memory, disk, battery, security, and performance. " +
    "This takes about 10 seconds.\n\n" +
    "Once done, I'll show you a health report and suggest what you can do — clean up disk, organise files, check security, or just ask me anything about your system."
  );
}

// ── Hardware probe ──

async function startHardwareProbe() {
  if (scanning) return;
  scanning = true;

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

    // Build and send the opening prompt
    const prompt = buildOpeningPrompt(results);
    expectPageBlock = true;
    chat.send(prompt);
  } catch (err) {
    console.error('Hardware probe error:', err);
    if (chat) chat.send('Please greet me and show the sys-doctor dashboard. I could not collect hardware data automatically.');
  } finally {
    scanning = false;
  }
}

// ── Opening prompt ──

function buildOpeningPrompt(results) {
  const parts = ['[SYS_SCAN_DATA]\n'];

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

  return parts.join('\n');
}

// ── Deep scan (client-side) ──

async function runClientDeepScan(userMessage) {
  if (scanning) {
    if (chat) chat.addMessage('assistant', 'Still scanning — please wait a moment.');
    return;
  }
  scanning = true;

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
  }
}

function buildDeepScanPrompt(deepResults, userMessage) {
  const parts = [`The user asked: "${userMessage}"\n\nHere is the deep file scan data. Analyze it and emit a page block with donut chart, large files table, and duplicates.\n`];

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

// ── Helpers ──

function fmtGb(gb) {
  if (gb == null || isNaN(gb)) return '--';
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (gb >= 0.001) return `${Math.round(gb * 1024)} MB`;
  return '0 MB';
}
