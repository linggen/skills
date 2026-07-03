// Chat bridge: mounts the full Linggen chat panel as an iframe.
// Drop-in replacement for LinggenUI.mount() — same API surface.
// The iframe loads /embed?skill=... which provides the complete chat UI
// (markdown, tool activity, permissions, plans, subagents).
//
// With `lazy: true` the session and iframe are deferred until the first
// send() — opening a game page costs no session and no LLM until the user
// actually moves or chats. Until then a lightweight local panel shows the
// welcome message and a working input.

import { createSession, removeSkillSession } from './api.js';

/**
 * Mount a chat iframe into the given element.
 * @param {HTMLElement} el
 * @param {{
 *   skillName: string,
 *   agentId?: string,
 *   modelId?: string,
 *   title?: string,
 *   sessionId?: string,
 *   placeholder?: string,
 *   lazy?: boolean,
 *   deleteOnLeave?: boolean,
 *   onSessionCreated?: (sid: string) => void,
 *   onStreamToken?: (fullText: string) => void,
 *   onStreamEnd?: (text: string) => void,
 * }} options
 * @returns {Promise<ChatInstance>}
 */
async function mount(el, options) {
  const {
    skillName,
    onSessionCreated,
    onStreamToken,
    onStreamEnd,
    lazy = false,
    deleteOnLeave = false,
  } = options;

  let modelId = options.modelId || '';
  let sessionId = options.sessionId || null;
  let streamBuffer = '';
  let iframe = null;
  let mounting = null; // ensureMounted's promise — mount exactly once
  let embedAlive = false; // first inbound event from the embed = transport up
  const outbox = []; // posts queued until the embed is provably alive
  const localLog = []; // messages shown before the iframe exists — replayed in

  // Detect remote mode via meta tag (injected by ConnectPage)
  const instanceMeta = document.querySelector('meta[name="linggen-instance"]');
  const isRemote = !!instanceMeta;

  // ── Local placeholder (lazy mode): welcome bubbles + a real input ──
  let localPanel = null;
  function renderLocalMessage(role, text) {
    if (!localPanel) return;
    const bubble = document.createElement('div');
    bubble.style.cssText = 'margin:10px 12px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.5;' +
      (role === 'assistant'
        ? 'background:rgba(255,255,255,.06);color:#e0e0e0;'
        : 'background:#0f3460;color:#fff;margin-left:40px;');
    bubble.textContent = text;
    localPanel.querySelector('.local-log').appendChild(bubble);
  }
  if (lazy) {
    localPanel = document.createElement('div');
    localPanel.style.cssText = 'display:flex;flex-direction:column;height:100%;';
    localPanel.innerHTML = `
      <div class="local-log" style="flex:1;overflow-y:auto;"></div>
      <form class="local-input" style="display:flex;gap:8px;padding:10px 12px;">
        <input type="text" placeholder="Type a message..." style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:inherit;font-size:13px;outline:none;">
        <button type="submit" style="padding:8px 14px;border-radius:8px;border:none;background:#e94560;color:#fff;font-size:13px;cursor:pointer;">Send</button>
      </form>`;
    localPanel.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = localPanel.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      send(text);
    });
    el.appendChild(localPanel);
  }

  function post(msg) {
    if (embedAlive) { iframe.contentWindow?.postMessage(msg, '*'); return; }
    outbox.push(msg);
  }
  function flushOutbox() {
    embedAlive = true;
    while (outbox.length) iframe.contentWindow?.postMessage(outbox.shift(), '*');
  }

  // Listen for events from the iframe
  function handleMessage(e) {
    if (e.data?.type !== 'linggen-skill-event') return;
    if (!embedAlive && iframe) flushOutbox();
    const { event, payload } = e.data;
    switch (event) {
      case 'stream_token':
        streamBuffer += payload?.text || '';
        if (onStreamToken) onStreamToken(streamBuffer);
        break;
      case 'stream_end':
        if (onStreamEnd) onStreamEnd(payload?.text || streamBuffer);
        streamBuffer = '';
        break;
      case 'session_created':
        if (payload?.sessionId) {
          sessionId = payload.sessionId;
          if (onSessionCreated) onSessionCreated(sessionId);
        }
        break;
    }
  }
  window.addEventListener('message', handleMessage);

  async function ensureMounted() {
    if (mounting) return mounting;
    mounting = (async () => {
      if (!sessionId) {
        const data = await createSession(`${skillName} session`, skillName);
        sessionId = data.id;
        if (onSessionCreated) onSessionCreated(sessionId);
      }

      const params = new URLSearchParams({
        skill: skillName,
        session: sessionId,
        hide_toolbar: '1',
      });
      if (modelId) params.set('model', modelId);

      let iframeSrc;
      if (isRemote) {
        // Remote: load embed chat via connect page (establishes its own WebRTC)
        const instanceId = instanceMeta.getAttribute('content') || '';
        const relayOrigin = (document.querySelector('meta[name="linggen-relay-origin"]') || {}).content || window.location.origin;
        iframeSrc = `${relayOrigin}/app/connect/${instanceId}?${params.toString()}&entry=embed`;
      } else {
        // Local: load embed chat directly from the local server
        iframeSrc = `/embed?${params.toString()}`;
      }

      iframe = document.createElement('iframe');
      iframe.src = iframeSrc;
      iframe.style.cssText = 'width:100%;height:100%;border:none;';
      iframe.allow = 'clipboard-write';
      if (localPanel) { localPanel.remove(); localPanel = null; }
      el.appendChild(iframe);

      await new Promise((resolve) => {
        iframe.addEventListener('load', resolve, { once: true });
      });
      // Replay the local welcome so the swap is seamless, then flush queued
      // sends once the embed emits its first event (or after a grace period —
      // a freshly-loaded embed drops postMessages until its transport is up).
      for (const m of localLog) {
        iframe.contentWindow?.postMessage({ type: 'linggen-skill', action: 'add_message', payload: m }, '*');
      }
      setTimeout(() => { if (!embedAlive) flushOutbox(); }, 3000);
    })();
    return mounting;
  }

  if (!lazy) await ensureMounted();

  // Sessions here are one match, never resumed — the last one would leak on
  // every game switch / app close now that the session list UI is gone.
  function onPageHide() {
    if (sessionId) removeSkillSession(skillName, sessionId, { keepalive: true }).catch(() => {});
  }
  if (deleteOnLeave) window.addEventListener('pagehide', onPageHide);

  /** Send a message to the chat (posts to iframe which triggers chat submit). */
  function send(text) {
    streamBuffer = '';
    ensureMounted();
    post({ type: 'linggen-skill', action: 'send', payload: { text } });
  }

  /** Add a local-only message to the chat display. */
  function addMessage(role, text) {
    const mappedRole = (role === 'ai' || role === 'assistant') ? 'assistant' : role;
    if (!iframe) {
      localLog.push({ role: mappedRole, text });
      renderLocalMessage(mappedRole, text);
      return;
    }
    post({ type: 'linggen-skill', action: 'add_message', payload: { role: mappedRole, text } });
  }

  return {
    send,
    addMessage,
    destroy() {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('pagehide', onPageHide);
      if (localPanel) { localPanel.remove(); localPanel = null; }
      if (iframe) iframe.remove();
    },
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

window.LinggenUI = { mount };
