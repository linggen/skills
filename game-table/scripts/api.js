// Linggen API client for game-table skill

const API_BASE = '';  // same-origin

export async function createSession(title, skill) {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, skill }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

// keepalive lets the pagehide cleanup finish after the page is gone.
export async function removeSkillSession(skill, sessionId, { keepalive = false } = {}) {
  const res = await fetch(`${API_BASE}/api/skill-sessions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill, session_id: sessionId }),
    keepalive,
  });
  if (!res.ok) throw new Error(`Failed to remove session: ${res.status}`);
}
