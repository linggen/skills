// Game lobby logic
import { listSkillSessions, removeSkillSession } from './api.js';

const SKILL_NAME = 'game-table';

document.addEventListener('DOMContentLoaded', async () => {
  // Game card clicks
  document.querySelectorAll('.game-card[data-game]').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = `${card.dataset.game}.html`;
    });
  });

  // Load past sessions
  loadSessions();
});

async function loadSessions() {
  const section = document.getElementById('sessions-section');
  const list = document.getElementById('session-list');
  try {
    const sessions = await listSkillSessions(SKILL_NAME);
    if (sessions.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    list.innerHTML = '';
    for (const s of sessions) {
      const item = document.createElement('div');
      item.className = 'session-item';
      const date = new Date(s.created_at * 1000).toLocaleString();
      // Detect game type from session title
      const isGomoku = (s.title || '').startsWith('gomoku');
      const gameLabel = isGomoku ? 'Gomoku' : 'Xiangqi';
      const gamePage = isGomoku ? 'gomoku' : 'xiangqi';

      const info = document.createElement('div');
      info.className = 'session-info';
      info.style.cursor = 'pointer';
      info.innerHTML = `
        <span class="session-title">${gameLabel} — ${s.title || s.id}</span>
        <span class="session-date">${date}</span>
      `;
      info.addEventListener('click', () => {
        window.location.href = `${gamePage}.html?session=${encodeURIComponent(s.id)}`;
      });
      item.appendChild(info);
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        try {
          await removeSkillSession(SKILL_NAME, s.id);
          loadSessions();
        } catch (err) {
          console.error('Failed to delete session:', err);
        }
      });
      item.appendChild(delBtn);
      list.appendChild(item);
    }
  } catch { /* ignore */ }
}
