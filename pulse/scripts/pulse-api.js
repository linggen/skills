// Pulse's own calls: its config, the runtime grant replay and the compact
// config. Sessions, models and the chat bridge come from the engine
// (/shared/api.js, /shared/chat-bridge.js).

const CONFIG_PATH = '$HOME/.linggen/skills/pulse/config.json';

// Read pulse's config.json from the iframe's /api/bash channel. Settings
// UI uses the same shape; centralizing it here so both pulse-app.js's
// init-prompt builder and the chat's grant replay share one read.
export async function readPulseConfig() {
  console.log('[pulse] readPulseConfig → POST /api/bash to cat config.json');
  try {
    const res = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_root: '/tmp',
        command: `[ -f "${CONFIG_PATH}" ] && cat "${CONFIG_PATH}" || echo ""`,
      }),
    });
    if (!res.ok) {
      console.warn('[pulse] readPulseConfig ← /api/bash NOT OK', res.status);
      return null;
    }
    const body = await res.json();
    const text = (body.stdout || '').trim();
    console.log('[pulse] readPulseConfig ← /api/bash OK, stdout length', text.length);
    if (!text) {
      console.warn('[pulse] readPulseConfig: stdout empty — config.json missing or unreadable');
      return null;
    }
    try {
      const parsed = JSON.parse(text);
      console.log('[pulse] readPulseConfig ← parsed config; workspace_path =', parsed?.workspace_path);
      return parsed;
    } catch (e) {
      console.warn('[pulse] readPulseConfig: JSON parse failed', e, 'raw:', text.slice(0, 120));
      return null;
    }
  } catch (e) {
    console.warn('[pulse] readPulseConfig: fetch threw', e);
    return null;
  }
}

export async function replayRuntimeGrants(sessionId) {
  console.log('[pulse] replayRuntimeGrants → session', sessionId);
  if (!sessionId) { console.warn('[pulse] replayRuntimeGrants: no sessionId — bail'); return; }
  const cfg = await readPulseConfig();
  const workspacePath = (cfg?.workspace_path || '').trim();
  if (!workspacePath) {
    console.warn('[pulse] replayRuntimeGrants: workspace_path empty — bail');
    return;
  }
  console.log('[pulse] replayRuntimeGrants → PATCH /api/sessions/permission', { sessionId, workspacePath });
  // PATCH /api/sessions/permission — same endpoint the consent prompt
  // calls. See linggen permission-spec "Runtime grants for
  // skill-configured paths".
  const res = await fetch(`/api/sessions/permission`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, path: workspacePath, mode: 'read' }),
  });
  console.log('[pulse] replayRuntimeGrants ← PATCH status', res.status);
  if (!res.ok) {
    throw new Error(`PATCH /api/sessions/permission ${res.status}`);
  }
  console.log('[pulse] replayRuntimeGrants ✓ granted', workspacePath, 'on', sessionId);
}

// What the summary must keep when a Pulse session compacts — card ids, the
// reddit handle, skip/dismissed URLs, draft strategy. WHEN it compacts is the
// global threshold (Linggen Settings → General), never Pulse's own: a skill
// copy silently overrode the user's choice (removed 2026-09-23). Tier-1
// eviction drops old tool results for free first, which is what used to
// make a low threshold eat a gather mid-pass.
//
// Runtime-only on the engine side per the runtime-grants pattern — Pulse
// calls this on every iframe load so a fresh engine session inherits it.
export async function applyCompactConfig(sessionId, opts = {}) {
  if (!sessionId) return;
  const cfg = await readPulseConfig();
  const body = {
    // Current engines key compact config by session only; project_root is
    // kept for engines predating that, which 400 without it ('/tmp' is the
    // same root every /api/bash call in this skill already uses).
    project_root: (cfg?.workspace_path || '').trim() || '/tmp',
    session_id: sessionId,
    // No threshold: the session follows the global one.
    focus: opts.focus ?? [
      'preserve card ids emitted to body_patch (mentions, trend, discovery, replies_due, progress)',
      'preserve the user reddit handle and any skip URLs / dismissed URLs in effect',
      'preserve per-card draft strategy (reply_target choice, voice notes)',
      'drop raw tool-result JSON bodies (Reddit thread trees, HN/Lobsters payloads, mention search results) — the cards already carry the salient excerpts',
    ].join('; '),
  };
  const res = await fetch(`/api/chat/compact_config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn('[pulse] applyCompactConfig failed', res.status);
  }
}
