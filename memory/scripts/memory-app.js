// Memory App — orchestrator
// Always creates a new session, auto-scans last 24h, extracts facts,
// shows report + memory summary. User can expand scan range.

import { fetchDefaultModel } from './api.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';

const SKILL_NAME = 'memory';
const MEMORY_DIR = '~/.linggen/memory';
const MEMORY_FILES = ['user_info.md', 'user_feedback.md', 'agent_done_week.md', 'agent_done_month.md', 'agent_done_year.md'];

const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';

let chat = null;
let scanning = false;
let expectPageBlock = false;

// ── Init ──

document.addEventListener('DOMContentLoaded', async () => {
  if (!modelId) {
    try {
      const defaultModel = await fetchDefaultModel();
      modelId = localStorage.getItem('memory:model') || defaultModel || '';
    } catch { /* ignore */ }
  }

  const existingSession = params.get('session') || '';
  await mountAndStart(existingSession || null);
});

// ── Mount chat panel and start ──

async function mountAndStart(sessionId) {
  const chatPanel = document.getElementById('chat-panel');
  const mountOpts = {
    skillName: SKILL_NAME,
    agentId: 'ling',
    modelId,
    title: 'Memory',
    onSessionCreated: (sid) => {
      const url = new URL(window.location);
      url.searchParams.set('session', sid);
      history.replaceState(null, '', url);
    },
    onStreamEnd: (text) => {
      handleModelResponse(text);
    },
    onContentBlock: (payload) => {
      // Built-in PageUpdate data tool: payload.args is the JSON-stringified
      // tool arguments. The `page` field carries the dashboard layout.
      if (payload?.tool !== 'PageUpdate') return;
      try {
        const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
        const page = args?.page;
        if (page) {
          expectPageBlock = false;
          applyPageUpdate(page);
          cacheCurrentPage();
        }
      } catch (e) {
        console.warn('[memory] failed to parse PageUpdate args', e);
      }
    },
  };
  if (sessionId) mountOpts.sessionId = sessionId;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Expose send for widget click handlers
  window._chatSend = async (text) => {
    if (!chat) return;

    // Per-row delete: "__DELETE_FACT__|<file>|<fact text>"
    if (text.startsWith('__DELETE_FACT__|')) {
      const [, file, factText] = text.split('|');
      if (file && factText) await startDeleteFact(file, factText);
      return;
    }

    const lower = text.toLowerCase();
    if (lower.includes('scan') || lower.includes('extract')) {
      if (lower.includes('all')) await startExtraction('all');
      else if (lower.includes('month')) await startExtraction('month');
      else if (lower.includes('week')) await startExtraction('week');
      else await startExtraction('today');
    } else if (lower.includes('analyze') || lower.includes('clean')) {
      await startAnalyze();
    } else {
      chat.send(text);
    }
  };

  if (sessionId) {
    restoreFromCache(sessionId);
  } else {
    startAutoScan();
  }
}

// ── Auto-scan on open ──

function startAutoScan() {
  applyPageUpdate({
    body: [{
      type: 'progress',
      title: 'Scanning last 24 hours...',
      steps: [
        { label: 'Collecting sessions', status: 'active', icon: '📂' },
        { label: 'Reading memory files', status: 'pending', icon: '📖' },
        { label: 'Extracting facts', status: 'pending', icon: '🔍' },
        { label: 'Building dashboard', status: 'pending', icon: '📊' },
      ],
    }],
  });

  setTimeout(async () => {
    if (chat) {
      chat.sendHidden(
        '[HIDDEN] The user just opened the Memory dashboard. ' +
        'The app is auto-scanning sessions from the last 24 hours. ' +
        'Greet briefly as their Memory agent and say exactly that you are scanning sessions from the last 24 hours. ' +
        '2 sentences. Do NOT emit a <!--page block. Do NOT use tools.'
      );
    }
    await new Promise(r => setTimeout(r, 2000));
    await runAutoScan();
  }, 1000);
}

// ── Run the auto-scan ──

async function runAutoScan() {
  const sessionId = chat?.getSessionId();

  // Bootstrap memory files if missing
  const checkResult = await bash(`ls ${MEMORY_DIR}/*.md 2>/dev/null | wc -l`, sessionId);
  if (parseInt((checkResult.stdout || '0').trim()) === 0) {
    const skillCheck = await bash('ls ~/.linggen/skills/memory/scripts/install.sh 2>/dev/null', sessionId);
    if (skillCheck.stdout?.trim()) {
      await bash('SKILL_DIR=~/.linggen/skills/memory bash ~/.linggen/skills/memory/scripts/install.sh', sessionId);
    }
  }

  // Collect today's sessions (NDJSON manifest on stdout)
  updateProgress('Collecting sessions...', 0);
  const collectResult = await bash(
    'bash ~/.linggen/skills/memory/scripts/collect_sessions.sh 2>/dev/null',
    sessionId
  );
  const sessionList = parseManifest(collectResult.stdout);

  // Read current memory files
  updateProgress(`Found ${sessionList.length} sessions — reading memory...`, 1);
  const memoryData = await readMemoryFiles(sessionId);

  const scanInfo = {
    paths: ['~/.claude/projects/', '~/.linggen/sessions/'],
    sessionCount: sessionList.length,
    dateRange: new Date().toISOString().slice(0, 10),
  };

  if (sessionList.length > 0) {
    updateProgress(`Extracting from ${sessionList.length} sessions...`, 2);
    sendExtractionPrompt(sessionList, memoryData, scanInfo, 'today');
  } else {
    updateProgress('Building dashboard...', 3);
    sendOverviewPrompt(memoryData, scanInfo);
  }
}

// ── Parse NDJSON manifest from collect_sessions.sh ──

function parseManifest(stdout) {
  if (!stdout) return [];
  return stdout.trim().split('\n').filter(l => l.trim()).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

// ── Read all memory files ──

async function readMemoryFiles(sessionId) {
  const memoryData = {};
  for (const file of MEMORY_FILES) {
    const result = await bash(`cat ${MEMORY_DIR}/${file} 2>/dev/null`, sessionId);
    if (result.stdout) {
      const parts = result.stdout.split('---');
      const body = parts.length >= 3 ? parts.slice(2).join('---').trim() : result.stdout;
      const factLines = body.split('\n').filter(l => l.trim().startsWith('- '));
      memoryData[file] = { content: body, lineCount: factLines.length };
    } else {
      memoryData[file] = { content: '', lineCount: 0 };
    }
  }
  return memoryData;
}

// ── Progress helper ──

function updateProgress(title, doneCount) {
  const steps = [
    { label: 'Collecting sessions', icon: '📂' },
    { label: 'Reading memory', icon: '📖' },
    { label: 'Extracting facts', icon: '🔍' },
    { label: 'Building dashboard', icon: '📊' },
  ].map((s, i) => ({
    ...s,
    status: i < doneCount ? 'done' : i === doneCount ? 'active' : 'pending',
  }));
  applyPageUpdate({ body: [{ type: 'progress', title, steps }] });
}

// ── PAGE LAYOUT INSTRUCTIONS (shared across all prompts) ──

const PAGE_LAYOUT_INSTRUCTIONS = `
You MUST respond with a <!--page JSON block to build the dashboard.
Use <!--page and --> delimiters (HTML comment format).

The dashboard has these sections:

## top_bar — one card per memory file showing fact count + change delta
Each card: { "widget": "custom", "data": { "label": "<filename without .md>", "value": "<fact_count>", "sub": "<delta text>", "bar": <pct> } }
- "sub" shows the change: "▲ +3 added" (green change) or "— no change" or "▼ -2 removed"
- Include ALL 5 files: user_info, user_feedback, agent_done_week, agent_done_month, agent_done_year
- "bar" = percentage of max (user_info max=200, user_feedback max=100, week max=150, month max=200, year max=100)

## body — widgets in this order:

### 1. File cards — one table per memory file that has facts
For each memory file that has content, show a table widget:
{ "type": "table", "title": "<filename> (<count> facts)", "badge": "<delta>", "columns": ["", "Fact"], "rows": [...] }
- Each row: [status_badge, fact_text]
- status_badge: { "badge": "+", "color": "green" } for newly added, { "badge": "~", "color": "yellow" } for updated/merged, { "badge": "−", "color": "red" } for removed, { "badge": "", "color": "gray" } for unchanged
- If this is the initial scan (no extraction done), mark all existing facts as unchanged (gray)
- Skip files with 0 facts entirely — don't show empty file cards

### 2. Scan Report
{ "type": "info", "icon": "📂", "title": "Scan Report", "fields": [
  { "label": "Paths", "value": "<scanned paths>" },
  { "label": "Sessions", "value": "<count> files scanned" },
  { "label": "Date range", "value": "<date or range>" },
  { "label": "Added", "value": "<n> facts" },
  { "label": "Merged", "value": "<n> conflicts" },
  { "label": "Skipped", "value": "<n> duplicates" }
]}
- Only include fields that are relevant. If no extraction was done, just show Paths/Sessions/Date.

### 3. Actions
{ "type": "action-cards", "items": [
  { "id": "scan-today", "icon": "🔍", "title": "Scan Today", "description": "Extract from last 24 hours", "active": true, "message": "Scan today" },
  { "id": "scan-week", "icon": "📅", "title": "Scan This Week", "description": "Extract from last 7 days", "active": true, "message": "Scan this week" },
  { "id": "scan-month", "icon": "📆", "title": "Scan This Month", "description": "Extract from last 30 days", "active": true, "message": "Scan this month" },
  { "id": "scan-all", "icon": "📚", "title": "Scan All Time", "description": "Extract from all sessions", "active": true, "message": "Scan all" },
  { "id": "analyze", "icon": "🧹", "title": "Analyze & Clean", "description": "Dedup, fix conflicts, merge, compress. Make memory brief.", "active": true, "message": "Analyze and clean" }
]}

## footer
{ "text": "<scan date or status>" }

Keep chat text to 2-3 sentences. The dashboard shows details visually.
`;

// ── Send overview prompt (no extraction) ──

function sendOverviewPrompt(memoryData, scanInfo) {
  const parts = ['[MEMORY_DATA]\n'];
  parts.push(`Scanned: ${scanInfo.paths.join(', ')}`);
  parts.push(`Sessions found: ${scanInfo.sessionCount}`);
  parts.push(`Date: ${scanInfo.dateRange}\n`);

  for (const file of MEMORY_FILES) {
    const data = memoryData[file];
    parts.push(`## ${file} (${data.lineCount} facts)`);
    if (data.content) {
      parts.push(data.content.length > 2000 ? data.content.slice(0, 2000) + '\n...' : data.content);
    } else {
      parts.push('(empty)');
    }
    parts.push('');
  }

  parts.push('No extraction was performed — just showing current memory state.');
  parts.push('Mark all existing facts as unchanged (gray badge) in the file cards.');
  parts.push(PAGE_LAYOUT_INSTRUCTIONS);

  expectPageBlock = true;
  chat.sendHidden(parts.join('\n'));
}

// ── Send extraction prompt ──

function sendExtractionPrompt(sessionList, memoryData, scanInfo, rangeLabel) {
  const sessionLines = sessionList.map((s, i) =>
    `  ${i + 1}. filepath=${s.filepath} source=${s.source} date=${s.date} (${s.label})`
  ).join('\n');

  const memSummary = Object.entries(memoryData)
    .map(([f, d]) => `${f}: ${d.lineCount} facts`)
    .join(', ');

  const prompt = `[MEMORY_EXTRACT]

Current memory before extraction: ${memSummary}

${sessionList.length} session(s) to extract:
${sessionLines}

For each session, spawn a Task subagent in parallel. Delegate to the 'ling' agent (the only registered agent — do NOT pass 'general' or 'general-purpose'):

  Task({ target_agent_id: "ling", task: "Run 'bash ~/.linggen/skills/memory/scripts/extract_session.sh <filepath> <source> <date>' to see the flattened conversation (user + assistant text only — tool calls are stripped).

  Extract facts and update memory files at ~/.linggen/memory/ via Edit (body only, never frontmatter).

  ## user_info.md — cross-project user facts only
  Identity, role, preferences, hobbies, habits, claims. Include date: '- Prefers dark mode (YYYY-MM-DD)'.
  SKIP project-specific facts (paths, commands tied to one repo) — those belong in the project's CLAUDE.md, not global memory.

  ## user_feedback.md — behavior rules the user gave
  Under ## Do or ## Don't. Include *why* if the user explained it.

  ## agent_done_week.md — what the agent accomplished
  Under a '## YYYY-MM-DD (Day)' heading, with these subsections (omit any empty ones):
    ### Built — features/components shipped (1 line each)
    ### Fixed — bugs, each as:
      '- <one-line summary>. Symptoms: <keywords>. Root cause: <cause>. Fix: <what>. Files: <paths>.'
    ### Decided — architectural choices with reasoning ('chose X over Y because ...')
    ### Tried (didn't work) — failed attempts with why (prevents re-trying)
    ### Learned — cross-project env/tool gotchas (skip project-specific ones)

  Rules:
  - Outcomes only, not narration. Skip 'I'm reading...', 'Let me check...' filler.
  - Check existing entries — skip duplicates, update contradictions.
  - Never touch frontmatter.
  - If you see a project-specific fact worth saving, note it in your final report as 'SUGGEST for CLAUDE.md' — do NOT write it to global memory.

  Report briefly: files updated, items added, duplicates skipped, any CLAUDE.md suggestions." })

After all subagents complete:
1. Run compression — entries > 7 days in agent_done_week.md → compress into agent_done_month.md.
2. Read the updated memory files.
3. Build the dashboard. Scan info: paths=${scanInfo.paths.join(', ')}, sessions=${scanInfo.sessionCount}, range=${rangeLabel}.

In the file cards: mark newly-added facts with green "+", updated with yellow "~", removed with red "−", unchanged with gray.
${PAGE_LAYOUT_INSTRUCTIONS}`;

  expectPageBlock = true;
  chat.sendHidden(prompt);
}

// ── Manual extraction with date range ──

async function startExtraction(range) {
  if (scanning) {
    if (chat) chat.addMessage('assistant', 'Extraction already in progress...');
    return;
  }
  scanning = true;

  const rangeLabel = range === 'all' ? 'all time'
    : range === 'month' ? 'this month'
    : range === 'week' ? 'this week' : 'today';

  updateProgress(`Scanning ${rangeLabel}...`, 0);

  try {
    const sessionId = chat?.getSessionId();

    // Build date list for the range
    const dayCount = range === 'all' ? 365 : range === 'month' ? 30 : range === 'week' ? 7 : 1;
    const dates = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(Date.now() - i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }
    const cmd = dates
      .map(d => `bash ~/.linggen/skills/memory/scripts/collect_sessions.sh ${d} 2>/dev/null`)
      .join(' ; ');

    const collectResult = await bash(cmd, sessionId);
    const collected = parseManifest(collectResult.stdout);

    // Dedup by filepath+date (same file scanned across dates would otherwise duplicate)
    const seen = new Set();
    const allSessions = [];
    for (const s of collected) {
      const key = `${s.filepath}|${s.date}`;
      if (!seen.has(key)) { seen.add(key); allSessions.push(s); }
    }

    if (allSessions.length === 0) {
      applyPageUpdate({
        body: [{
          type: 'info', icon: '📭', title: `No sessions found for ${rangeLabel}`,
          fields: [{ label: '', value: 'No conversations to extract in this range.' }],
        }],
      });
      scanning = false;
      return;
    }

    updateProgress(`Found ${allSessions.length} sessions — extracting...`, 2);

    const memoryData = await readMemoryFiles(sessionId);
    const scanInfo = {
      paths: ['~/.claude/projects/', '~/.linggen/sessions/'],
      sessionCount: allSessions.length,
      dateRange: rangeLabel,
    };

    sendExtractionPrompt(allSessions, memoryData, scanInfo, rangeLabel);
  } catch (err) {
    console.error('Extraction error:', err);
    if (chat) chat.send('Extraction failed: ' + err.message);
  } finally {
    scanning = false;
  }
}

// ── Delete a single fact ──

async function startDeleteFact(file, factText) {
  if (!chat) return;
  const prompt = `[DELETE_FACT]

Remove this fact from ~/.linggen/memory/${file}:

"${factText}"

Steps:
1. Read the file.
2. Find the line whose body matches the fact text (usually a bullet like "- <fact text> (YYYY-MM-DD)" — the stored line may have a "- " prefix and/or trailing date that the dashboard didn't show).
3. Edit the file to delete that one line. Delete the full line including its trailing newline. Do not modify any other facts. Never touch frontmatter.
4. Re-read the file, then emit the dashboard page block reflecting the new state. Mark the removed fact with a red "−" badge if you include it for one render, or omit it.

${PAGE_LAYOUT_INSTRUCTIONS}`;

  expectPageBlock = true;
  chat.sendHidden(prompt);
}

// ── Analyze & Clean ──

async function startAnalyze() {
  if (scanning) {
    if (chat) chat.addMessage('assistant', 'Already working...');
    return;
  }
  scanning = true;

  updateProgress('Analyzing memory files...', 2);

  try {
    const sessionId = chat?.getSessionId();
    const memoryData = await readMemoryFiles(sessionId);

    const memContents = MEMORY_FILES.map(file => {
      const data = memoryData[file];
      return `## ${file} (${data.lineCount} facts)\n${data.content || '(empty)'}\n`;
    }).join('\n');

    expectPageBlock = true;
    chat.sendHidden(
      '[MEMORY_ANALYZE]\n\n' +
      'Analyze all memory files below. For each file:\n' +
      '1. Remove duplicate facts (keep the most recent or most complete version)\n' +
      '2. Resolve conflicts (e.g. "likes Rust" vs "Rust is hard" → merge into one nuanced fact)\n' +
      '3. Merge similar entries into concise single lines\n' +
      '4. Compress verbose facts into brief ones\n' +
      '5. Remove outdated or stale entries\n\n' +
      'Use Edit to update each file (body only, never frontmatter).\n' +
      'Then read the cleaned files and build the dashboard showing what changed.\n\n' +
      'Current memory files:\n' + memContents + '\n' +
      'In the dashboard, mark cleaned/merged facts with yellow "~" badge, removed with red "−" badge.\n' +
      PAGE_LAYOUT_INSTRUCTIONS
    );
  } catch (err) {
    console.error('Analyze error:', err);
    if (chat) chat.send('Analysis failed: ' + err.message);
  } finally {
    scanning = false;
  }
}

// ── Cache ──

function cacheCurrentPage() {
  const sid = params.get('session') || new URLSearchParams(window.location.search).get('session') || '';
  if (!sid) return;
  try {
    localStorage.setItem(`memory-page:${sid}`, JSON.stringify(getCurrentPage()));
  } catch { /* quota */ }
}

function restoreFromCache(sessionId) {
  try {
    const cached = localStorage.getItem(`memory-page:${sessionId}`);
    if (cached) {
      const page = JSON.parse(cached);
      if (page.top_bar?.length || page.body?.length) {
        restorePage(page);
        return;
      }
    }
  } catch { /* ignore */ }
  startAutoScan();
}

// ── Model response handling ──

function handleModelResponse(text) {
  // Backward compat: older skill responses may still include a <!--page-->
  // text tag. The preferred path is the PageUpdate tool (see onContentBlock
  // above). If the model forgets to call the tool, we do NOT nag — silent
  // is better than a queued "Please include..." message per turn.
  const pageBlock = parsePageBlock(text);
  if (pageBlock) {
    expectPageBlock = false;
    applyPageUpdate(pageBlock);
    cacheCurrentPage();
  }
}

// ── Bash helper ──

async function bash(command, sessionId) {
  const body = { project_root: '~/.linggen/memory', command };
  if (sessionId) body.session_id = sessionId;
  const resp = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}
