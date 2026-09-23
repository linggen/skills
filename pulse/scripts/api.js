// Minimal Linggen API client used by pulse's draft auto-trigger.
// Pulse is a review skill first — these endpoints only get used when
// the user opens the page with no data on today's date and we kick off
// a fresh drafting agent session in-iframe.

const API_BASE = '';
const CONFIG_PATH = '$HOME/.linggen/skills/pulse/config.json';

export async function createSession(title, skill) {
  console.log('[pulse] createSession →', { title, skill });
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, skill }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();
  console.log('[pulse] createSession ← session id', data.id);
  // Replay user-configured runtime grants (workspace path) onto the new
  // session. Engine starts each session with only SKILL.md grants;
  // user-set values from config.json need to be re-applied per-session.
  // Failures are non-fatal — agent will prompt user via the consent UX.
  try { await replayRuntimeGrants(data.id); } catch (e) {
    console.warn('[pulse] replay runtime grants failed (from createSession)', e);
  }
  return data;
}

export async function removeSkillSession(skill, sessionId) {
  const res = await fetch(`${API_BASE}/api/skill-sessions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill, session_id: sessionId }),
  });
  if (!res.ok) throw new Error('Failed to delete session');
}

// Read pulse's config.json from the iframe's /api/bash channel. Settings
// UI uses the same shape; centralizing it here so both pulse-app.js's
// init-prompt builder and createSession's grant replay share one read.
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
  const res = await fetch(`${API_BASE}/api/sessions/permission`, {
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
  const res = await fetch(`${API_BASE}/api/chat/compact_config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn('[pulse] applyCompactConfig failed', res.status);
  }
}
