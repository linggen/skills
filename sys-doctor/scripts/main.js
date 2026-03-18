// Sys Doctor lobby logic
import { fetchModels, fetchDefaultModel, listSkillSessions, removeSkillSession } from './api.js';

const SKILL_NAME = 'sys-doctor';
const MODEL_STORAGE_KEY = 'sys-doctor:model';

document.addEventListener('DOMContentLoaded', async () => {
  const modelSelect = document.getElementById('model-select');
  const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);

  // Load available models
  try {
    const [models, defaultModel] = await Promise.all([fetchModels(), fetchDefaultModel()]);
    modelSelect.innerHTML = '';
    const preferredModel = savedModel || defaultModel;
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.id} (${m.provider})`;
      if (m.id === preferredModel) opt.selected = true;
      modelSelect.appendChild(opt);
    }
  } catch (err) {
    modelSelect.innerHTML = '<option>Failed to load models</option>';
    console.error('Failed to load models:', err);
  }

  // Save model selection
  modelSelect.addEventListener('change', () => {
    localStorage.setItem(MODEL_STORAGE_KEY, modelSelect.value);
  });

  // Scan card clicks
  document.querySelectorAll('.scan-card[data-scan]').forEach(card => {
    card.addEventListener('click', () => {
      const scan = card.dataset.scan;
      const modelId = modelSelect.value;
      if (!modelId) return;
      localStorage.setItem(MODEL_STORAGE_KEY, modelId);
      window.location.href = `doctor.html?model=${encodeURIComponent(modelId)}&scan=${scan}`;
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

      const info = document.createElement('div');
      info.className = 'session-info';
      info.innerHTML = `
        <span class="session-title">${s.title || 'Scan'}</span>
        <span class="session-date">${date}</span>
      `;
      info.addEventListener('click', () => {
        const modelId = document.getElementById('model-select').value;
        window.location.href = `doctor.html?model=${encodeURIComponent(modelId)}&session=${encodeURIComponent(s.id)}`;
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
