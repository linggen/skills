// Memory App — thin client.
//
// JS responsibilities end here:
//   1. Mount the chat panel.
//   2. On first open of a new session, send a [BOOT] hidden prompt.
//      On session resume, restore cached page state and skip the prompt.
//   3. Render PageUpdate events from the agent.
//   4. Forward widget button clicks as plain user messages.
//
// Everything else — greeting, memory fetch, scan orchestration, layout,
// extraction, reports — lives in the agent (SKILL.md). The agent is the
// app; JS is the canvas.

import { fetchDefaultModel } from './api.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';

const SKILL_NAME = 'memory';

const BOOT_PROMPT = `The user just opened the memory dashboard.

CRITICAL: A, B, C below all happen in ONE SINGLE ASSISTANT TURN. Do NOT end
your turn between them. Do NOT wait for user input. After streaming A, you
MUST immediately continue to B's tool calls in the same response.

(A) Stream this text VERBATIM as plain chat output — do not paraphrase, do not
substitute words (it says "memory skill", not "memory agent"):

    Hi! I'm Ling, in your memory skill. Let me check what's already in memory — one moment...

(B) In the same turn, immediately after (A), issue these tool calls IN PARALLEL:
    • Read ~/.linggen/memory/.scan-state.json  (missing file = never scanned)
    • Memory_list for each type: fact, preference, decision, tried, fixed, learned, built (7 calls)

(C) Still the same turn, once (B) returns: call PageUpdate ONCE with
    body = [greeting, fact-list(identity) if non-empty, fact-list(style) if
    non-empty, one fact-list per non-empty RAG type]. Then stream this short
    closing line VERBATIM:

    You can click Scan Today to extract new facts from recent sessions, or Browse all to view everything.

Do NOT emit anything to top_bar. Do not repeat the opening greeting line after
the PageUpdate — the greeting widget already shows stats + actions visually.`;

const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';
let chat = null;

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
    onStreamEnd: handleLegacyPageBlock,
    onContentBlock: handleContentBlock,
  };
  if (sessionId) mountOpts.sessionId = sessionId;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Widget buttons send plain text — the agent reads the message and
  // decides what to do based on SKILL.md. JS knows nothing about ranges,
  // scans, or extraction.
  window._chatSend = (text) => { if (chat) chat.send(text); };

  if (sessionId && tryRestoreCached(sessionId)) {
    // Resumed session with a cached page — don't re-boot the agent.
    return;
  }

  // Paint a placeholder in the left panel while we wait for the agent's
  // first PageUpdate. Without this the page stays blank for the full LLM
  // round-trip (seconds to tens of seconds).
  applyPageUpdate({
    body: [{
      type: 'progress',
      title: 'Starting...',
      steps: [{ label: 'Connecting to memory', status: 'active' }],
    }],
  });

  // WebRTC data-channel setup runs AFTER the iframe's `load` event — the
  // console shows `[WebRTC] connected` only seconds after mount resolves.
  // Sending a hidden message before the channel is up gets silently
  // dropped ("No messages for ling" with nothing on the wire). 1.5s is
  // the pragmatic wait that matches the old working flow; a proper fix
  // would be a `ready` handshake from the embed iframe, but that's a
  // cross-skill change to chat-bridge.
  setTimeout(() => {
    if (chat) chat.sendHidden(BOOT_PROMPT);
  }, 1500);
}

// ── PageUpdate ingestion ──

function handleContentBlock(payload) {
  if (payload?.tool !== 'PageUpdate') return;
  try {
    const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
    if (!args || typeof args !== 'object') return;
    const partial = {};
    if (args.top_bar !== undefined) partial.top_bar = args.top_bar;
    if (args.body !== undefined) partial.body = args.body;
    if (args.footer !== undefined) partial.footer = args.footer;
    if (Object.keys(partial).length === 0) return;
    applyPageUpdate(partial);
    cacheCurrentPage();
  } catch (e) {
    console.warn('[memory] failed to parse PageUpdate args', e);
  }
}

// Fallback: some models emit a <!--page ... --> or ```page block in text
// instead of calling the tool. Parse and apply silently — no nag.
function handleLegacyPageBlock(text) {
  const page = parsePageBlock(text);
  if (!page) return;
  applyPageUpdate(page);
  cacheCurrentPage();
}

// ── Cache ──

function currentSessionId() {
  return new URLSearchParams(window.location.search).get('session') || '';
}

function cacheCurrentPage() {
  const sid = currentSessionId();
  if (!sid) return;
  try {
    localStorage.setItem(`memory-page:${sid}`, JSON.stringify(getCurrentPage()));
  } catch { /* quota */ }
}

function tryRestoreCached(sessionId) {
  try {
    const cached = localStorage.getItem(`memory-page:${sessionId}`);
    if (!cached) return false;
    const page = JSON.parse(cached);
    if (!(page.top_bar?.length || page.body?.length)) return false;
    restorePage(page);
    return true;
  } catch {
    return false;
  }
}
