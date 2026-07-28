// Linggen API client for apple-shifu
const API_BASE = '';

// Carry browser state across the 2026-07-28 mac-shifu → apple-shifu rename.
// Score history is 30 scans of trend data and the tab/model choices are the
// user's; a slug change should not silently reset them. Runs once at module
// load — doctor.js imports this before anything reads a key. Idempotent: the
// old keys are removed, so a second pass finds nothing.
(function migrateLegacyKeys() {
  try {
    const legacy = 'mac-shifu:';
    const current = 'apple-shifu:';
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(legacy)) stale.push(k);
    }
    for (const k of stale) {
      const target = current + k.slice(legacy.length);
      if (localStorage.getItem(target) === null) {
        localStorage.setItem(target, localStorage.getItem(k));
      }
      localStorage.removeItem(k);
    }
  } catch (e) { /* private mode / disabled storage — nothing to carry */ }
})();

export async function fetchModels() {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function fetchDefaultModel() {
  const res = await fetch(`${API_BASE}/api/config`);
  if (!res.ok) return null;
  const config = await res.json();
  const defaults = config.routing?.default_models;
  return defaults && defaults.length > 0 ? defaults[0] : null;
}

export async function createSession(title, skill) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, skill }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

export async function listSkillSessions(skill) {
  const res = await fetch(`${API_BASE}/api/skill-sessions?skill=${encodeURIComponent(skill)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions || [];
}

export async function removeSkillSession(skill, sessionId) {
  const res = await fetch(`${API_BASE}/api/skill-sessions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill, session_id: sessionId }),
  });
  if (!res.ok) throw new Error('Failed to delete session');
}

export async function fetchSessionMessages(skill, sessionId) {
  const params = new URLSearchParams({ skill, session_id: sessionId });
  const res = await fetch(`${API_BASE}/api/skill-sessions/state?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}
