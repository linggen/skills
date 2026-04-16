// Memory App — orchestrator
// Reads memory files, collects sessions, sends to model for extraction,
// renders model's page JSON as dashboard widgets.

import { fetchDefaultModel, listSkillSessions } from './api.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';

const SKILL_NAME = 'memory';
const MEMORY_DIR = '~/.linggen/memory';
const MEMORY_FILES = ['user_info.md', 'user_feedback.md', 'agent_done_week.md', 'agent_done_month.md', 'agent_done_year.md'];

const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';
const existingSession = params.get('session') || '';

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

  if (!existingSession) {
    let sessions = [];
    try {
      sessions = await listSkillSessions(SKILL_NAME);
      sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      sessions = sessions.slice(0, 5);
    } catch { /* ignore */ }

    if (sessions.length > 0) {
      showWelcomeDialog(sessions);
      return;
    }
  }

  await mountAndStart(existingSession);
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
  };
  if (sessionId) mountOpts.sessionId = sessionId;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  window._chatSend = async (text) => {
    if (!chat) return;
    if (text.toLowerCase().includes('extract')) {
      await startExtraction();
    } else {
      chat.send(text);
    }
  };

  if (sessionId) {
    restoreFromCache(sessionId);
  } else {
    startFresh();
  }
}

// ── Welcome dialog ──

function showWelcomeDialog(sessions) {
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-dialog">
      <div class="welcome-icon">🧠</div>
      <h2>Memory</h2>
      <p class="welcome-subtitle">Your agent's persistent memory</p>
      <div class="welcome-actions">
        <button class="welcome-btn primary" id="welcome-new">
          <span class="welcome-btn-icon">🔍</span>
          <span>
            <strong>New Session</strong>
            <small>View memory and extract new facts</small>
          </span>
        </button>
        ${sessions.length > 0 ? `
          <button class="welcome-btn secondary" id="welcome-resume">
            <span class="welcome-btn-icon">📋</span>
            <span>
              <strong>Continue Previous</strong>
              <small>Resume your last session</small>
            </span>
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('welcome-new').addEventListener('click', async () => {
    overlay.remove();
    await mountAndStart(null);
  });

  if (document.getElementById('welcome-resume')) {
    document.getElementById('welcome-resume').addEventListener('click', async () => {
      overlay.remove();
      const lastSession = sessions[0];
      const url = new URL(window.location);
      url.searchParams.set('session', lastSession.id);
      history.replaceState(null, '', url);
      await mountAndStart(lastSession.id);
    });
  }
}

// ── Fresh start — load memory overview ──

function startFresh() {
  applyPageUpdate({
    body: [
      {
        type: 'info',
        icon: '🧠',
        title: 'Memory',
        fields: [
          { label: '', value: 'Loading your memory files...' },
        ],
      },
    ],
  });

  // Load memory files and build overview
  setTimeout(async () => {
    await loadMemoryOverview();
  }, 1500);
}

// ── Load and display current memory ──

async function loadMemoryOverview() {
  const sessionId = chat?.getSessionId();
  const memoryData = {};

  // Bootstrap: check if memory files exist, create from templates if not
  const checkResult = await bash(`ls ${MEMORY_DIR}/*.md 2>/dev/null | wc -l`, sessionId);
  const fileCount = parseInt((checkResult.stdout || '0').trim());

  if (fileCount === 0) {
    // No memory files — try to run install script
    applyPageUpdate({
      body: [{
        type: 'info',
        icon: '🧠',
        title: 'Memory',
        fields: [{ label: '', value: 'No memory files found. Initializing...' }],
      }],
    });

    // Find skill dir and run install
    const skillCheck = await bash('ls ~/.linggen/skills/memory/scripts/install.sh 2>/dev/null', sessionId);
    if (skillCheck.stdout?.trim()) {
      await bash('SKILL_DIR=~/.linggen/skills/memory bash ~/.linggen/skills/memory/scripts/install.sh', sessionId);
    }
  }

  // Read each memory file
  for (const file of MEMORY_FILES) {
    const result = await bash(`cat ${MEMORY_DIR}/${file} 2>/dev/null`, sessionId);
    if (result.stdout) {
      const content = result.stdout;
      // Parse body (skip frontmatter)
      const parts = content.split('---');
      const body = parts.length >= 3 ? parts.slice(2).join('---').trim() : content;
      const lines = body.split('\n').filter(l => l.trim());
      memoryData[file] = { content: body, lineCount: lines.length };
    } else {
      memoryData[file] = { content: '', lineCount: 0 };
    }
  }

  // Count facts
  const userFacts = memoryData['user_info.md']?.lineCount || 0;
  const rules = memoryData['user_feedback.md']?.lineCount || 0;
  const weekEntries = memoryData['agent_done_week.md']?.lineCount || 0;
  const totalLines = Object.values(memoryData).reduce((sum, d) => sum + d.lineCount, 0);

  // Send to model to build the overview page
  const prompt = buildOverviewPrompt(memoryData, { userFacts, rules, weekEntries, totalLines });
  expectPageBlock = true;
  chat.sendHidden(prompt);
}

function buildOverviewPrompt(memoryData, stats) {
  const parts = ['[MEMORY_DATA]\n'];
  parts.push('The user just opened the Memory dashboard. Below is the current state of all memory files.');
  parts.push('Build the overview dashboard page.\n');

  parts.push(`## Stats`);
  parts.push(`- Total lines across all files: ${stats.totalLines}`);
  parts.push(`- User facts (user_info): ${stats.userFacts} lines`);
  parts.push(`- Behavior rules (user_feedback): ${stats.rules} lines`);
  parts.push(`- This week's entries (agent_done_week): ${stats.weekEntries} lines`);
  parts.push('');

  for (const file of MEMORY_FILES) {
    const data = memoryData[file];
    parts.push(`## ${file} (${data.lineCount} lines)`);
    if (data.content) {
      // Truncate to keep prompt reasonable
      const truncated = data.content.length > 2000
        ? data.content.slice(0, 2000) + '\n... (truncated)'
        : data.content;
      parts.push(truncated);
    } else {
      parts.push('(empty)');
    }
    parts.push('');
  }

  parts.push('## Instructions');
  parts.push('Build the overview dashboard with a <!--page JSON block. Include:');
  parts.push('- top_bar: custom widgets for Facts count, Rules count, Week entries, Total lines');
  parts.push('- body: info card (user profile summary), table (behavior rules as Do/Don\'t), bars (file sizes), action-cards (Extract Now, Compress, Health Check)');
  parts.push('- footer: last updated date');
  parts.push('Keep chat text to 2-3 sentences. The dashboard shows the details visually.');
  parts.push('');

  return parts.join('\n');
}

// ── Extraction ──

async function startExtraction() {
  if (scanning) {
    if (chat) chat.addMessage('assistant', 'Extraction already in progress...');
    return;
  }
  scanning = true;

  applyPageUpdate({
    body: [{
      type: 'progress',
      title: 'Collecting sessions...',
      steps: [
        { label: 'Collecting sessions', status: 'active', icon: '📂' },
        { label: 'Extracting facts', status: 'pending', icon: '🔍' },
        { label: 'Updating memory', status: 'pending', icon: '📝' },
        { label: 'Compressing', status: 'pending', icon: '🗜️' },
      ],
    }],
  });

  try {
    const sessionId = chat?.getSessionId();

    // Phase 1: Collect sessions
    const collectResult = await bash(
      'bash ~/.linggen/skills/memory/scripts/collect_sessions.sh 2>&1',
      sessionId
    );
    const sessionOutput = collectResult.stdout || '';

    if (sessionOutput.includes('No sessions found')) {
      applyPageUpdate({
        body: [{
          type: 'info',
          icon: '📭',
          title: 'No sessions found',
          fields: [{ label: '', value: 'No conversations from today to extract.' }],
        }],
      });

      // Still run compression
      chat.sendHidden(
        'No new sessions found for today. Check if compression is needed: ' +
        'read agent_done_week.md and compress entries older than 7 days to agent_done_month.md. ' +
        'Then report what you did with a <!--page block showing the report view.'
      );
      expectPageBlock = true;
      scanning = false;
      return;
    }

    // Parse session blocks
    const sessionBlocks = parseSessionBlocks(sessionOutput);

    applyPageUpdate({
      body: [{
        type: 'progress',
        title: `Found ${sessionBlocks.length} sessions`,
        steps: [
          { label: `${sessionBlocks.length} sessions collected`, status: 'done', icon: '📂' },
          { label: 'Extracting facts', status: 'active', icon: '🔍' },
          { label: 'Updating memory', status: 'pending', icon: '📝' },
          { label: 'Compressing', status: 'pending', icon: '🗜️' },
        ],
      }],
    });

    // Phase 2: Send each session to model one at a time
    for (let i = 0; i < sessionBlocks.length; i++) {
      const block = sessionBlocks[i];

      applyPageUpdate({
        body: [{
          type: 'progress',
          title: `Processing ${i + 1}/${sessionBlocks.length}: ${block.label}`,
          steps: [
            { label: `${sessionBlocks.length} sessions collected`, status: 'done', icon: '📂' },
            { label: `Extracting ${i + 1}/${sessionBlocks.length}`, status: 'active', icon: '🔍' },
            { label: 'Updating memory', status: 'pending', icon: '📝' },
            { label: 'Compressing', status: 'pending', icon: '🗜️' },
          ],
        }],
      });

      // Send session to model for extraction
      const extractPrompt = buildExtractionPrompt(block, i + 1, sessionBlocks.length);
      expectPageBlock = (i === sessionBlocks.length - 1); // only expect page on last
      chat.sendHidden(extractPrompt);

      // Wait for model to respond before sending next session
      await waitForResponse();
    }

    // Phase 3: Compress
    applyPageUpdate({
      body: [{
        type: 'progress',
        title: 'Compressing old entries...',
        steps: [
          { label: `${sessionBlocks.length} sessions processed`, status: 'done', icon: '📂' },
          { label: 'Facts extracted', status: 'done', icon: '🔍' },
          { label: 'Memory updated', status: 'done', icon: '📝' },
          { label: 'Compressing', status: 'active', icon: '🗜️' },
        ],
      }],
    });

    expectPageBlock = true;
    chat.sendHidden(
      'Extraction complete. Now:\n' +
      '1. Run compression — check agent_done_week.md for entries older than 7 days, compress to month. Check month for entries older than 30 days, compress to year.\n' +
      '2. Build the final report with a <!--page block showing:\n' +
      '   - top_bar: custom widgets for sessions processed, facts added, conflicts resolved\n' +
      '   - body: scorecard (changes per file), recommendations (conflicts resolved, stale entries removed), bars (file sizes after)\n' +
      '   - footer: date\n' +
      'Keep chat text to 2-3 sentences summarizing the extraction.'
    );
  } catch (err) {
    console.error('Extraction error:', err);
    if (chat) chat.send('Extraction failed: ' + err.message);
  } finally {
    scanning = false;
  }
}

function buildExtractionPrompt(block, index, total) {
  return (
    `[SESSION_DATA ${index}/${total}]\n` +
    `Source: ${block.label}\n` +
    `Messages: ${block.messageCount}\n\n` +
    `${block.content}\n\n` +
    `---\n` +
    `Extract facts from this session and update the memory files at ${MEMORY_DIR}/.\n` +
    `- User info (identity, preferences, hobbies, claims) → Edit user_info.md body\n` +
    `- Behavior rules (corrections, confirmations) → Edit user_feedback.md body\n` +
    `- Agent actions (features built, bugs fixed, deploys) → Edit agent_done_week.md body\n` +
    `Check existing memory first — skip duplicates, update contradictions.\n` +
    `Only edit the body below the --- frontmatter delimiter. Never edit frontmatter.\n` +
    `Report what you found: added, skipped, merged. Be brief.`
  );
}

function parseSessionBlocks(output) {
  const blocks = [];
  const parts = output.split(/^==========/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const firstNewline = part.indexOf('\n');
    if (firstNewline === -1) continue;
    const header = part.slice(0, firstNewline).trim().replace(/=+$/, '').trim();
    const content = part.slice(firstNewline + 1).trim();
    if (!content) continue;
    const messageCount = (content.match(/^\[/gm) || []).length;
    blocks.push({
      label: header,
      content: content.slice(0, 4000), // cap per session
      messageCount,
    });
  }
  return blocks;
}

// ── Wait for model response ──

function waitForResponse() {
  return new Promise((resolve) => {
    const origHandler = handleModelResponse;
    handleModelResponse = (text) => {
      origHandler(text);
      handleModelResponse = origHandler;
      resolve();
    };
  });
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

  if (expectPageBlock && chat) {
    expectPageBlock = false;
    chat.send(
      'Please include a <!--page JSON block in your response to update the dashboard. ' +
      'Refer to your skill instructions for the page layout format.'
    );
  }
}

// ── Cache ──

function cacheCurrentPage() {
  const sid = new URLSearchParams(window.location.search).get('session') || '';
  if (!sid) return;
  try {
    localStorage.setItem(`memory-page:${sid}`, JSON.stringify(getCurrentPage()));
  } catch { /* quota */ }
}

function restoreFromCache(sessionId) {
  try {
    const cached = localStorage.getItem(`memory-page:${sessionId}`);
    if (!cached) return false;
    const page = JSON.parse(cached);
    if (!page.top_bar?.length && !page.body?.length) return false;
    restorePage(page);
    return true;
  } catch {
    return false;
  }
}

// ── Bash helper ──

async function bash(command, sessionId) {
  const body = { project_root: '/tmp', command };
  if (sessionId) body.session_id = sessionId;
  const resp = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}
