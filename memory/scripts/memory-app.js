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
      // tool arguments with flat `top_bar`, `body`, and `footer` fields.
      if (payload?.tool !== 'PageUpdate') return;
      try {
        const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
        if (!args || typeof args !== 'object') return;
        const partial = {};
        if (args.top_bar !== undefined) partial.top_bar = args.top_bar;
        if (args.body !== undefined) partial.body = args.body;
        if (args.footer !== undefined) partial.footer = args.footer;
        if (Object.keys(partial).length === 0) return;
        expectPageBlock = false;
        applyPageUpdate(partial);
        cacheCurrentPage();
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

    // Per-row edit: "__EDIT_FACT__|<file>|<old text>|<new text>"
    if (text.startsWith('__EDIT_FACT__|')) {
      const [, file, oldText, newText] = text.split('|');
      if (file && oldText && newText) await startEditFact(file, oldText, newText);
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
        '2 sentences. Do NOT call PageUpdate yet — the app is still collecting data.'
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
You MUST call the \`PageUpdate\` tool to refresh the dashboard. Do NOT emit the
page JSON as text, a code block, or an HTML comment — always pass the sections
as flat top-level arguments:

  PageUpdate({ "top_bar": [...], "body": [...], "footer": { "text": "..." } })

There is NO \`page\` wrapper. Pass \`top_bar\`, \`body\`, and \`footer\` directly.
Omit any section you don't want to change — previous values persist.

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

Extraction: follow the rules in your active SKILL.md (memory). In particular, apply the durability test (WWWW filter) and the Accept/Reject lists when deciding what goes in user_info.md vs user_feedback.md vs agent_done_week.md vs a SUGGEST-for-CLAUDE.md note.

Delegate each session in parallel — spawn ALL Task() calls in a single response:

  Task({ target_agent_id: "ling", task: "Run 'bash ~/.linggen/skills/memory/scripts/extract_session.sh <filepath> <source> <date>' to see the flattened conversation. Extract per the active SKILL.md Phase 2 rules (durability test, Accept/Reject per category, SUGGEST for CLAUDE.md for project-specific facts). DO NOT edit files — return only a structured report." })

Target agent is "ling" (the only registered agent — do NOT pass "general" or "general-purpose").

After all subagents complete:
1. Merge their reports and Edit memory files yourself (SKILL.md Phase 3, single-writer). For agent_done_week.md: one heading per day, one subsection per category per day — merge into existing subsections, never create duplicate \`### Built\` blocks under the same date.
2. Consolidate (SKILL.md Phase 4): dedup user_info/user_feedback, scan agent_done_week.md for duplicate day/subsection headings and bullets, surface any project-specific drift as SUGGEST lines in your final report.
3. Run time-decay compression if needed (SKILL.md Phase 5: week → month → year).
4. Read the updated memory files.
5. Build the dashboard. Scan info: paths=${scanInfo.paths.join(', ')}, sessions=${scanInfo.sessionCount}, range=${rangeLabel}.

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
4. Re-read the file, then call PageUpdate with the dashboard reflecting the new state. Mark the removed fact with a red "−" badge if you include it for one render, or omit it.

${PAGE_LAYOUT_INSTRUCTIONS}`;

  expectPageBlock = true;
  chat.sendHidden(prompt);
}

async function startEditFact(file, oldText, newText) {
  if (!chat) return;
  const prompt = `[EDIT_FACT]

Replace a fact in ~/.linggen/memory/${file}.

OLD:
"${oldText}"

NEW:
"${newText}"

Steps:
1. Read the file.
2. Find the line whose body matches the OLD text (stored as a bullet like "- <fact> (YYYY-MM-DD)" — the dashboard may have stripped the "- " prefix, the section heading, and/or the trailing date).
3. Edit the file to replace just that line's fact text with the NEW text. Preserve the "- " prefix, the section heading context, and the trailing date. Do not modify any other facts. Never touch frontmatter.
4. Re-read the file, then call PageUpdate with the dashboard reflecting the new state. Mark the edited fact with a yellow "~" badge.

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
