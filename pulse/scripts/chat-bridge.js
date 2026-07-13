// Chat bridge: mounts the full Linggen chat panel as an iframe.
// Same shape as sys-doctor's chat-bridge.js — see that skill for the
// canonical version. Pulse uses it to drive a one-shot drafting run
// from the review page when today's data is missing.

import { createSession, removeSkillSession } from './api.js';

async function mount(el, options) {
  const {
    skillName,
    onSessionCreated,
    onStreamToken,
    onStreamEnd,
  } = options;

  let modelId = options.modelId || '';
  let sessionId = options.sessionId || null;
  let streamBuffer = '';

  const instanceMeta = document.querySelector('meta[name="linggen-instance"]');
  const isRemote = !!instanceMeta;

  if (!sessionId) {
    const data = await createSession(`${skillName} session`, skillName);
    sessionId = data.id;
    if (onSessionCreated) onSessionCreated(sessionId);
  }

  // Build the embed iframe URL for a session. Used at mount and by
  // setSession() so switching sessions only reloads this chat iframe — not
  // the host page (which would also tear down the session sidebar).
  function buildSrc(sid) {
    const p = new URLSearchParams({ skill: skillName, session: sid, hide_toolbar: '1' });
    if (modelId) p.set('model', modelId);
    if (isRemote) {
      const instanceId = instanceMeta.getAttribute('content') || '';
      const relayOrigin = (document.querySelector('meta[name="linggen-relay-origin"]') || {}).content || window.location.origin;
      return `${relayOrigin}/app/connect/${instanceId}?${p.toString()}&entry=embed`;
    }
    return `/embed?${p.toString()}`;
  }

  const iframe = document.createElement('iframe');
  iframe.src = buildSrc(sessionId);
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.allow = 'clipboard-write';
  el.appendChild(iframe);

  // Resolve the iframe's origin so we can constrain postMessage targetOrigin
  // to it (instead of '*') and reject inbound messages from any other origin.
  // For relative iframe URLs (local mode), this resolves to the parent origin.
  const iframeOrigin = new URL(iframe.src, window.location.href).origin;

  function handleMessage(e) {
    if (e.origin !== iframeOrigin) return;
    if (e.data?.type !== 'linggen-skill-event') return;
    const { event, payload } = e.data;
    switch (event) {
      case 'stream_token':
        streamBuffer += payload?.text || '';
        if (onStreamToken) onStreamToken(streamBuffer);
        break;
      case 'stream_end':
        if (onStreamEnd) onStreamEnd(streamBuffer || payload?.text || '');
        streamBuffer = '';
        break;
      case 'content_block':
        if (options.onContentBlock) options.onContentBlock(payload);
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

  await new Promise((resolve) => {
    iframe.addEventListener('load', resolve, { once: true });
  });

  function send(text) {
    streamBuffer = '';
    iframe.contentWindow?.postMessage({ type: 'linggen-skill', action: 'send', payload: { text } }, '*');
  }

  function sendHidden(text) {
    streamBuffer = '';
    iframe.contentWindow?.postMessage({ type: 'linggen-skill', action: 'send_hidden', payload: { text } }, '*');
  }

  function addMessage(role, text) {
    const mappedRole = (role === 'ai' || role === 'assistant') ? 'assistant' : role;
    iframe.contentWindow?.postMessage({ type: 'linggen-skill', action: 'add_message', payload: { role: mappedRole, text } }, '*');
  }

  return {
    send,
    sendHidden,
    addMessage,
    destroy() {
      window.removeEventListener('message', handleMessage);
      iframe.remove();
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
    /** Re-point the chat iframe at a different session in place. Only this
     *  iframe reloads; the host page (and its session sidebar) stay mounted.
     *  Resolves once the new session's chat has loaded. */
    async setSession(sid) {
      if (!sid || sid === sessionId) return;
      sessionId = sid;
      streamBuffer = '';
      const loaded = new Promise((resolve) => {
        iframe.addEventListener('load', resolve, { once: true });
      });
      iframe.src = buildSrc(sid);
      await loaded;
    },
  };
}

window.LinggenUI = { mount };
