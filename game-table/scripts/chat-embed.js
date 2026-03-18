// Drop-in replacement for the old LinggenUI SDK.
// Renders a simple chat panel and drives it via api.js + SSE.

import { createSession, sendChat, connectSSE, removeSkillSession } from './api.js';
import { renderMarkdown } from './markdown.js';
import { showThinking, removeThinking } from './thinking.js';

// ---------------------------------------------------------------------------
// CSS (injected once)
// ---------------------------------------------------------------------------

const STYLE_ID = 'chat-embed-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ce-root {
      display: flex; flex-direction: column; height: 100%;
      background: var(--bg-surface, #16213e); border-left: 1px solid var(--border, #2a3a5c);
      font-family: inherit; font-size: 14px; color: var(--text, #e0e0e0);
    }
    .ce-header {
      padding: 10px 14px; font-weight: 600; font-size: 14px;
      border-bottom: 1px solid var(--border, #2a3a5c);
      color: var(--text-muted, #8899aa);
    }
    .ce-messages {
      flex: 1; overflow-y: auto; padding: 10px 14px; display: flex;
      flex-direction: column; gap: 8px;
    }
    .ce-messages::-webkit-scrollbar { width: 6px; }
    .ce-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    .ce-msg {
      padding: 8px 12px; border-radius: 10px; max-width: 92%; line-height: 1.45;
      word-wrap: break-word; overflow-wrap: break-word;
    }
    .ce-msg p { margin: 0; }
    .ce-msg-user { background: var(--accent, #e94560); color: #fff; align-self: flex-end; border-bottom-right-radius: 2px; }
    .ce-msg-ai { background: var(--bg-card, #0f3460); align-self: flex-start; border-bottom-left-radius: 2px; }
    .ce-msg-system { background: transparent; color: var(--text-muted, #8899aa); font-size: 12px; align-self: center; text-align: center; padding: 4px 8px; }
    .ce-msg .md-h { margin: 4px 0 2px; font-size: 14px; }
    .ce-msg .md-list { margin: 4px 0; padding-left: 18px; }
    .ce-msg .md-code { background: rgba(255,255,255,0.1); padding: 1px 4px; border-radius: 3px; font-size: 13px; }
    .ce-msg .md-p { margin: 2px 0; }
    .ce-input-bar {
      display: flex; padding: 8px 10px; gap: 6px;
      border-top: 1px solid var(--border, #2a3a5c);
    }
    .ce-input {
      flex: 1; padding: 8px 12px; border-radius: 8px;
      border: 1px solid var(--border, #2a3a5c);
      background: var(--bg, #1a1a2e); color: var(--text, #e0e0e0);
      font-size: 14px; outline: none; resize: none; min-height: 36px; max-height: 120px;
    }
    .ce-input:focus { border-color: var(--accent, #e94560); }
    .ce-send-btn {
      padding: 8px 14px; border-radius: 8px; border: none;
      background: var(--accent, #e94560); color: #fff; cursor: pointer;
      font-size: 14px; font-weight: 500;
    }
    .ce-send-btn:hover { background: var(--accent-hover, #ff6b81); }
    .ce-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    /* Thinking indicator */
    .chat-thinking {
      display: flex; align-items: center; gap: 6px; padding: 6px 12px;
      color: var(--text-muted, #8899aa); font-size: 13px;
    }
    .thinking-dots { display: flex; gap: 3px; }
    .thinking-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-muted, #8899aa);
      animation: ce-dot-pulse 1.2s ease-in-out infinite;
    }
    .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes ce-dot-pulse { 0%,80%,100% { opacity: 0.3; } 40% { opacity: 1; } }
    .thinking-time { font-size: 12px; color: var(--text-muted, #8899aa); margin-left: auto; }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

/**
 * Mount a chat panel into the given element.
 * Returns a ChatInstance with send(), addMessage(), destroy(), etc.
 *
 * @param {HTMLElement} el
 * @param {{
 *   skillName: string,
 *   agentId?: string,
 *   modelId?: string,
 *   title?: string,
 *   placeholder?: string,
 *   sessionId?: string,
 *   onSessionCreated?: (sid: string) => void,
 *   onStreamEnd?: (text: string) => void,
 * }} options
 */
async function mount(el, options) {
  injectStyles();

  const {
    skillName,
    agentId = 'ling',
    title = 'Chat',
    placeholder = 'Type a message...',
    onSessionCreated,
    onStreamEnd,
  } = options;

  let modelId = options.modelId || '';
  let sessionId = options.sessionId || null;
  let evtSource = null;
  let streamBuffer = '';
  let streamingMsgEl = null;
  let isSending = false;

  // ── DOM ──

  const root = document.createElement('div');
  root.className = 'ce-root';
  root.innerHTML = `
    <div class="ce-header">${title}</div>
    <div class="ce-messages"></div>
    <div class="ce-input-bar">
      <textarea class="ce-input" rows="1" placeholder="${placeholder}"></textarea>
      <button class="ce-send-btn">Send</button>
    </div>
  `;
  el.appendChild(root);

  const messagesEl = root.querySelector('.ce-messages');
  const inputEl = root.querySelector('.ce-input');
  const sendBtn = root.querySelector('.ce-send-btn');

  // ── Helpers ──

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMsgEl(role, html) {
    const cls = role === 'user' ? 'ce-msg-user'
      : role === 'system' ? 'ce-msg-system'
      : 'ce-msg-ai';
    const div = document.createElement('div');
    div.className = `ce-msg ${cls}`;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function addMessage(role, text) {
    const mappedRole = role === 'ai' || role === 'assistant' ? 'ai' : role;
    appendMsgEl(mappedRole, renderMarkdown(text));
  }

  // ── Session ──

  async function ensureSession() {
    if (sessionId) return;
    const data = await createSession(`${skillName} chat`, skillName);
    sessionId = data.id;
    if (onSessionCreated) onSessionCreated(sessionId);
  }

  // ── SSE ──

  function connectEvents() {
    if (evtSource) evtSource.close();
    evtSource = connectSSE(sessionId, (evt) => {
      if (evt.kind === 'token' && evt.text) {
        if (!streamingMsgEl) {
          removeThinking();
          streamingMsgEl = appendMsgEl('ai', '');
          streamBuffer = '';
        }
        streamBuffer += evt.text;
        streamingMsgEl.innerHTML = renderMarkdown(streamBuffer);
        scrollToBottom();
      } else if (evt.kind === 'turn_complete' || (evt.kind === 'activity' && evt.data?.status === 'idle')) {
        removeThinking();
        if (streamingMsgEl) {
          const finalText = streamBuffer;
          streamingMsgEl = null;
          streamBuffer = '';
          isSending = false;
          sendBtn.disabled = false;
          if (onStreamEnd) onStreamEnd(finalText);
        } else {
          isSending = false;
          sendBtn.disabled = false;
        }
      }
    });
  }

  // ── Send ──

  async function send(text) {
    if (!text.trim()) return;
    await ensureSession();
    if (!evtSource) connectEvents();

    isSending = true;
    sendBtn.disabled = true;
    showThinking(messagesEl);

    try {
      await sendChat(skillName, agentId, sessionId, modelId, text);
    } catch (err) {
      removeThinking();
      addMessage('system', `Error: ${err.message}`);
      isSending = false;
      sendBtn.disabled = false;
    }
  }

  // ── Input handlers ──

  sendBtn.addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text || isSending) return;
    addMessage('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    send(text);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  // ── Init session + SSE ──

  await ensureSession();
  connectEvents();

  // ── ChatInstance ──

  return {
    send,
    addMessage,
    destroy() {
      if (evtSource) evtSource.close();
      removeThinking();
      root.remove();
    },
    /** Delete the current session from disk. Call before destroy() to clean up. */
    async deleteSession() {
      if (sessionId) {
        try { await removeSkillSession(skillName, sessionId); } catch { /* ignore */ }
        sessionId = null;
      }
    },
    getSessionId() { return sessionId; },
    setOptions(opts) {
      if (opts.modelId) modelId = opts.modelId;
    },
  };
}

// Expose as global so <script> tags can use it like the old SDK
window.LinggenUI = { mount };
