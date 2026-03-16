// Thinking indicator for game chat panels

let thinkingEl = null;
let thinkingStart = 0;
let thinkingTimer = null;

const VERBS = ['Thinking', 'Pondering', 'Analyzing', 'Considering'];

export function showThinking(container) {
  removeThinking();
  thinkingStart = Date.now();
  const verb = VERBS[Math.floor(Math.random() * VERBS.length)];

  thinkingEl = document.createElement('div');
  thinkingEl.className = 'chat-thinking';
  thinkingEl.innerHTML = `
    <span class="thinking-label">${verb}</span>
    <span class="thinking-dots">
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </span>
    <span class="thinking-time"></span>
  `;
  container.appendChild(thinkingEl);
  thinkingEl.scrollIntoView({ block: 'end' });

  // Update elapsed time
  const timeEl = thinkingEl.querySelector('.thinking-time');
  thinkingTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - thinkingStart) / 1000);
    if (elapsed < 60) {
      timeEl.textContent = `${elapsed}s`;
    } else {
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      timeEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
  }, 500);
}

export function removeThinking() {
  if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
  if (thinkingEl) { thinkingEl.remove(); thinkingEl = null; }
}
