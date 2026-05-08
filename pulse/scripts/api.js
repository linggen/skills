// Minimal Linggen API client used by pulse's draft auto-trigger.
// Pulse is a review skill first — these endpoints only get used when
// the user opens the page with no data on today's date and we kick off
// a fresh drafting agent session in-iframe.

const API_BASE = '';
const CONFIG_PATH = '$HOME/.linggen/skills/pulse/config.json';

export async function createSession(title, skill) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, skill }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const data = await res.json();
  // Replay user-configured runtime grants (workspace path) onto the new
  // session. Engine starts each session with only SKILL.md grants;
  // user-set values from config.json need to be re-applied per-session.
  // Failures are non-fatal — agent will prompt user via the consent UX.
  try { await replayRuntimeGrants(data.id); } catch (e) {
    console.warn('[pulse] replay runtime grants failed', e);
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
  try {
    const res = await fetch('/api/bash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_root: '/tmp',
        command: `[ -f "${CONFIG_PATH}" ] && cat "${CONFIG_PATH}" || echo ""`,
      }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const text = (body.stdout || '').trim();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function replayRuntimeGrants(sessionId) {
  if (!sessionId) return;
  const cfg = await readPulseConfig();
  const workspacePath = (cfg?.workspace_path || '').trim();
  if (!workspacePath) return;
  // PATCH /api/sessions/permission is the same endpoint the consent
  // prompt calls — see linggen permission-spec "Runtime grants for
  // skill-configured paths".
  const res = await fetch(`${API_BASE}/api/sessions/permission`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, path: workspacePath, mode: 'read' }),
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/sessions/permission ${res.status}`);
  }
}
