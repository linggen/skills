// composer-app.js — review UI for the composer skill.
//
// Reads the daily draft JSON written by the influencer mission (or
// any on-demand draft run) from ~/.linggen/skills/composer/data/<date>.json
// and renders summary, external sources, and drafts with copy buttons.
//
// No agent runs in this view; data is already on disk from the most
// recent draft pass.

const DATA_DIR = '~/.linggen/skills/composer/data';

// ---- DOM refs ---------------------------------------------------------

const els = {
  dateInput: document.getElementById('date-input'),
  refreshBtn: document.getElementById('refresh-btn'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  empty: document.getElementById('empty'),
  content: document.getElementById('content'),
  summaryList: document.getElementById('summary-list'),
  weightTag: document.getElementById('weight-tag'),
  sourcesCard: document.getElementById('sources-card'),
  sourcesList: document.getElementById('sources-list'),
  draftsSection: document.getElementById('drafts-section'),
  draftsList: document.getElementById('drafts-list'),
};

// ---- Init -------------------------------------------------------------

function todayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function init() {
  const params = new URLSearchParams(location.search);
  const initialDate = params.get('date') || todayLocal();
  els.dateInput.value = initialDate;

  els.refreshBtn.addEventListener('click', () => loadDate(els.dateInput.value));
  els.dateInput.addEventListener('change', () => loadDate(els.dateInput.value));

  loadDate(initialDate);
}

// ---- Data loading -----------------------------------------------------

async function loadDate(date) {
  showOnly('loading');
  try {
    const data = await fetchDraftJson(date);
    if (!data) {
      showEmpty(`No drafts found for ${date}. The composer skill writes to ${DATA_DIR}/${date}.json — run the influencer mission or invoke composer manually to generate.`);
      return;
    }
    if (data.skipped) {
      showSkipped(data);
      return;
    }
    render(data);
  } catch (err) {
    showError(`Failed to load drafts: ${err.message || err}`);
  }
}

async function fetchDraftJson(date) {
  // Read via /api/bash — the skill iframe pattern. Returns file
  // contents on stdout. Empty stdout means no file.
  const cmd = `f="$HOME/.linggen/skills/composer/data/${date}.json"; [ -f "$f" ] && cat "$f" || true`;
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: cmd }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  const stdout = (body.stdout || '').trim();
  if (!stdout) return null;
  return JSON.parse(stdout);
}

// ---- Rendering --------------------------------------------------------

function render(data) {
  // Summary
  els.summaryList.innerHTML = '';
  (data.summary || []).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    els.summaryList.appendChild(li);
  });
  els.weightTag.textContent = data.weight || 'unknown';
  els.weightTag.className = `tag tag-${data.weight || 'unknown'}`;

  // External sources
  if (data.external_sources && data.external_sources.length > 0) {
    els.sourcesCard.hidden = false;
    els.sourcesList.innerHTML = '';
    data.external_sources.forEach((src) => {
      els.sourcesList.appendChild(renderSource(src));
    });
  } else {
    els.sourcesCard.hidden = true;
  }

  // Drafts
  els.draftsList.innerHTML = '';
  if (!data.drafts || data.drafts.length === 0) {
    const p = document.createElement('p');
    p.className = 'state-msg';
    p.textContent = 'No drafts in this output.';
    els.draftsList.appendChild(p);
  } else {
    data.drafts.forEach((draft, i) => {
      els.draftsList.appendChild(renderDraft(draft, i));
    });
  }

  showOnly('content');
}

function renderSource(src) {
  const li = document.createElement('li');
  li.className = 'source-item';
  const score = typeof src.score === 'number' ? src.score.toFixed(2) : '—';
  li.innerHTML = `
    <div class="source-header">
      <a href="${escapeAttr(src.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.title || src.url)}</a>
      <span class="source-meta">${escapeHtml(src.source || '')} · score ${score}</span>
    </div>
    <p class="source-why">${escapeHtml(src.why || '')}</p>
  `;
  return li;
}

function renderDraft(draft, idx) {
  const article = document.createElement('article');
  article.className = `draft draft-${draft.lane || 'unknown'}`;

  const titleCandidates = draft.title_candidates && draft.title_candidates.length > 0
    ? `<div class="draft-titles"><span class="draft-titles-label">title candidates:</span> ${draft.title_candidates.map(t => `<span class="draft-title-pick">${escapeHtml(t)}</span>`).join(' · ')}</div>`
    : '';

  const citations = draft.citations && draft.citations.length > 0
    ? `<details class="draft-citations"><summary>${draft.citations.length} citation${draft.citations.length === 1 ? '' : 's'}</summary><ul>${draft.citations.map(u => `<li><a href="${escapeAttr(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u)}</a></li>`).join('')}</ul></details>`
    : '';

  article.innerHTML = `
    <header class="draft-header">
      <span class="draft-lane tag tag-${draft.lane || 'unknown'}">${escapeHtml(draft.lane || 'unknown')}</span>
      <button class="btn-copy" data-idx="${idx}">Copy</button>
    </header>
    ${titleCandidates}
    <pre class="draft-content" data-idx="${idx}">${escapeHtml(draft.content || '')}</pre>
    ${citations}
  `;

  article.querySelector('.btn-copy').addEventListener('click', async (e) => {
    const text = draft.content || '';
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = 'Copied';
      setTimeout(() => (e.target.textContent = 'Copy'), 1500);
    } catch (_) {
      e.target.textContent = 'Copy failed';
    }
  });

  return article;
}

// ---- States -----------------------------------------------------------

function showOnly(id) {
  ['loading', 'error', 'empty', 'content'].forEach((k) => {
    els[k].hidden = k !== id;
  });
}

function showError(msg) {
  els.error.textContent = msg;
  showOnly('error');
}

function showEmpty(msg) {
  els.empty.textContent = msg;
  showOnly('empty');
}

function showSkipped(data) {
  els.summaryList.innerHTML = '';
  (data.summary || []).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    els.summaryList.appendChild(li);
  });
  els.weightTag.textContent = 'skip';
  els.weightTag.className = 'tag tag-skip';
  els.sourcesCard.hidden = true;
  els.draftsList.innerHTML = `
    <div class="state-msg">
      <strong>Nothing post-worthy from this day.</strong>
      <p>${escapeHtml(data.skip_reason || 'No fresh signal earning a post.')}</p>
      <p class="card-sub">See you tomorrow.</p>
    </div>
  `;
  showOnly('content');
}

// ---- Helpers ----------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
function escapeAttr(s) { return escapeHtml(s); }

init();
