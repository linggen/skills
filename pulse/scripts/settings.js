// Pulse Settings — load/save config.json + brief.md via /api/bash.
// Same iframe pattern as pulse-app.js (ungated, no permission prompt).

const SKILL_DIR = '$HOME/.linggen/skills/pulse';
const CONFIG_PATH = `${SKILL_DIR}/config.json`;
const CONFIG_EXAMPLE = `${SKILL_DIR}/config.example.json`;
const BRIEF_PATH = `${SKILL_DIR}/references/brief.md`;
const BRIEF_EXAMPLE = `${SKILL_DIR}/references/brief.example.md`;

// Source/target catalog. Each entry describes how the card renders and
// what config fields apply. Keep this list synchronized with the tools
// registered in SKILL.md and the lanes in lane-templates.md.
const SOURCES = [
  {
    id: 'hackernews',
    name: 'Hacker News',
    desc: 'Top 30 current stories. No per-site config.',
    fields: [],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    desc: '25 newest threads from each subreddit you list.',
    fields: [{ kind: 'chips', key: 'subs', label: 'Subreddits' }],
    tag: 'source + target',
  },
  {
    id: 'lobsters',
    name: 'Lobsters',
    desc: 'Lobste.rs newest feed.',
    fields: [],
  },
  {
    id: 'arxiv',
    name: 'arxiv',
    desc: 'Recent CS.AI / CS.LG / CS.CL papers.',
    fields: [],
  },
  {
    id: 'rss',
    name: 'RSS / Atom',
    desc: 'Any feed URLs you paste in.',
    fields: [{ kind: 'chips', key: 'feeds', label: 'Feed URLs' }],
  },
  {
    id: 'google-trends',
    name: 'Google Trends (daily)',
    desc: "Today's trending searches in your region. Free public RSS.",
    fields: [{ kind: 'text', key: 'region', label: 'Region (ISO code, e.g. US, GB, JP)', placeholder: 'US' }],
  },
  {
    id: 'github-trending',
    name: 'GitHub Trending',
    desc: "Today's trending repos. Optional language filter.",
    fields: [{ kind: 'text', key: 'language', label: 'Language (blank = all)', placeholder: 'rust' }],
  },
  {
    id: 'product-hunt',
    name: 'Product Hunt',
    desc: "Today's launches. Useful for spotting competing products.",
    fields: [],
  },
  {
    id: 'wikipedia-pageviews',
    name: 'Wikipedia pageviews',
    desc: 'Real topic-volume trends over the last 60 days. Add the Wikipedia article titles you care about.',
    fields: [{ kind: 'chips', key: 'topics', label: 'Article titles' }],
  },
];

const TARGETS = [
  { id: 'x-post',         name: 'X / Twitter',     desc: 'Single-claim post, ≤ 280 chars.' },
  { id: 'reddit-comment', name: 'Reddit comment',  desc: 'Per-thread, drafted only when a Reddit source surfaces a high-relevance thread.' },
  { id: 'medium',         name: 'Medium',          desc: 'Mid-length article, 500–1000 words.' },
  { id: 'blog',           name: 'Blog',            desc: 'Long-form post, configurable length.',
                          fields: [{ kind: 'range', keys: ['min_words', 'max_words'], label: 'Words' }] },
  { id: 'linkedin',       name: 'LinkedIn',        desc: 'Professional-tone post, ~150–350 words.' },
  { id: 'substack',       name: 'Substack',        desc: 'Newsletter post, 600–1500 words.' },
];

// ---- Bash bridge (matches pulse-app.js pattern) -----------------------

async function runBash(cmd) {
  const res = await fetch('/api/bash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_root: '/tmp', command: cmd }),
  });
  if (!res.ok) throw new Error(`bash ${res.status}`);
  const body = await res.json();
  if (body.exit_code && body.exit_code !== 0) {
    throw new Error(body.stderr || `bash exit ${body.exit_code}`);
  }
  return body.stdout || '';
}

async function readFile(path, fallback = null) {
  const cmd = `[ -f "${path}" ] && cat "${path}" || echo ""`;
  const out = await runBash(cmd);
  if (!out.trim()) return fallback;
  return out;
}

async function writeFile(path, content) {
  // Use a base64-encoded heredoc-free path so backticks/quotes in the
  // content don't break the shell command. We pipe stdin via a here-doc
  // marker that we know is unique.
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const cmd = `mkdir -p "$(dirname "${path}")" && echo "${b64}" | base64 --decode > "${path}"`;
  await runBash(cmd);
}

// ---- State ---------------------------------------------------------------

let state = {
  brief: '',
  config: { sites: {}, targets: {}, saved_runs: [] },
};

// Default goal text for the "+ Add saved run" button.
const NEW_SAVED_RUN_TEMPLATE = () => ({
  id: `run-${Date.now().toString(36)}`,
  name: 'New saved run',
  goal: '',
  targets: [],
  cadence: '',
  enabled: false,
});

// ---- Load ----------------------------------------------------------------

async function loadAll() {
  setStatus('Loading…', 'loading');
  try {
    let cfgText = await readFile(CONFIG_PATH);
    if (!cfgText) cfgText = await readFile(CONFIG_EXAMPLE);
    state.config = cfgText ? JSON.parse(cfgText) : { sites: {}, targets: {} };
    if (!state.config.sites) state.config.sites = {};
    if (!state.config.targets) state.config.targets = {};

    let briefText = await readFile(BRIEF_PATH);
    if (briefText === null) briefText = await readFile(BRIEF_EXAMPLE, '');
    state.brief = briefText || '';

    render();
    clearStatus();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'error');
  }
}

// ---- Render --------------------------------------------------------------

function render() {
  document.getElementById('brief-text').value = state.brief;
  renderGrid('sources-grid', SOURCES, state.config.sites);
  renderGrid('targets-grid', TARGETS, state.config.targets);
  renderSavedRuns();
}

// ---- Saved runs ----------------------------------------------------------

function renderSavedRuns() {
  const list = document.getElementById('saved-runs-list');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(state.config.saved_runs)) state.config.saved_runs = [];
  if (state.config.saved_runs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'card-meta';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'No saved runs yet. Click + Add saved run to create one.';
    list.appendChild(empty);
    return;
  }
  state.config.saved_runs.forEach((run, idx) => {
    list.appendChild(renderSavedRunCard(run, idx));
  });
}

function renderSavedRunCard(run, idx) {
  const card = document.createElement('div');
  card.className = 'saved-run';
  if (!run.enabled) card.classList.add('disabled');

  const head = document.createElement('div');
  head.className = 'saved-run-head';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!run.enabled;
  checkbox.addEventListener('change', () => {
    run.enabled = checkbox.checked;
    card.classList.toggle('disabled', !run.enabled);
  });
  head.appendChild(checkbox);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'saved-run-name';
  nameInput.value = run.name || '';
  nameInput.placeholder = 'Saved run name';
  nameInput.addEventListener('input', () => { run.name = nameInput.value; });
  head.appendChild(nameInput);

  const del = document.createElement('button');
  del.className = 'saved-run-delete';
  del.textContent = '×';
  del.title = 'Delete this saved run';
  del.addEventListener('click', () => {
    if (!confirm(`Delete saved run "${run.name}"?`)) return;
    state.config.saved_runs.splice(idx, 1);
    renderSavedRuns();
  });
  head.appendChild(del);

  card.appendChild(head);

  // Goal textarea
  const goalLabel = document.createElement('label');
  goalLabel.textContent = 'Goal';
  card.appendChild(goalLabel);
  const goal = document.createElement('textarea');
  goal.rows = 3;
  goal.value = run.goal || '';
  goal.placeholder = 'e.g. Daily X-post if I shipped or learned something yesterday.';
  goal.addEventListener('input', () => { run.goal = goal.value; });
  card.appendChild(goal);

  // Targets multi-select (chips of available targets)
  const targetsLabel = document.createElement('label');
  targetsLabel.textContent = 'Targets';
  card.appendChild(targetsLabel);
  const tgtRow = document.createElement('div');
  tgtRow.className = 'saved-run-targets';
  TARGETS.forEach(t => {
    const lbl = document.createElement('label');
    lbl.className = 'saved-run-target';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = Array.isArray(run.targets) && run.targets.includes(t.id);
    cb.addEventListener('change', () => {
      if (!Array.isArray(run.targets)) run.targets = [];
      if (cb.checked) {
        if (!run.targets.includes(t.id)) run.targets.push(t.id);
      } else {
        run.targets = run.targets.filter(id => id !== t.id);
      }
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + t.name));
    tgtRow.appendChild(lbl);
  });
  card.appendChild(tgtRow);

  // Cadence input
  const cadLabel = document.createElement('label');
  cadLabel.textContent = 'Cadence (cron, blank = on-demand only)';
  card.appendChild(cadLabel);
  const cad = document.createElement('input');
  cad.type = 'text';
  cad.className = 'saved-run-cadence';
  cad.value = run.cadence || '';
  cad.placeholder = '0 8 * * *';
  cad.addEventListener('input', () => { run.cadence = cad.value.trim(); });
  card.appendChild(cad);

  return card;
}

document.getElementById('add-saved-run-btn')?.addEventListener('click', () => {
  if (!Array.isArray(state.config.saved_runs)) state.config.saved_runs = [];
  state.config.saved_runs.push(NEW_SAVED_RUN_TEMPLATE());
  renderSavedRuns();
});

function renderGrid(elementId, catalog, configSection) {
  const grid = document.getElementById(elementId);
  grid.innerHTML = '';
  catalog.forEach((item) => {
    grid.appendChild(renderCard(item, configSection));
  });
}

function renderCard(item, configSection) {
  if (!configSection[item.id]) configSection[item.id] = { enabled: false };
  const cfg = configSection[item.id];

  const card = document.createElement('div');
  card.className = 'site-card';
  if (!cfg.enabled) card.classList.add('disabled');

  const head = document.createElement('div');
  head.className = 'site-head';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !!cfg.enabled;
  checkbox.addEventListener('change', () => {
    cfg.enabled = checkbox.checked;
    card.classList.toggle('disabled', !cfg.enabled);
  });
  const name = document.createElement('span');
  name.className = 'site-name';
  name.textContent = item.name;
  head.appendChild(checkbox);
  head.appendChild(name);
  if (item.tag) {
    const tag = document.createElement('span');
    tag.className = 'site-tag';
    tag.textContent = item.tag;
    head.appendChild(tag);
  }
  card.appendChild(head);

  const desc = document.createElement('div');
  desc.className = 'site-desc';
  desc.textContent = item.desc;
  card.appendChild(desc);

  (item.fields || []).forEach((field) => {
    if (field.kind === 'chips') {
      card.appendChild(renderChipField(cfg, field));
    } else if (field.kind === 'range') {
      card.appendChild(renderRangeField(cfg, field));
    } else if (field.kind === 'text') {
      card.appendChild(renderTextField(cfg, field));
    }
  });

  return card;
}

function renderChipField(cfg, field) {
  if (!Array.isArray(cfg[field.key])) cfg[field.key] = [];
  const wrap = document.createElement('div');

  const label = document.createElement('label');
  label.textContent = field.label;
  wrap.appendChild(label);

  const chipRow = document.createElement('div');
  chipRow.className = 'chip-row';
  const renderChips = () => {
    chipRow.innerHTML = '';
    cfg[field.key].forEach((value, idx) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const text = document.createElement('span');
      text.textContent = value;
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.title = 'Remove';
      remove.addEventListener('click', () => {
        cfg[field.key].splice(idx, 1);
        renderChips();
      });
      chip.appendChild(text);
      chip.appendChild(remove);
      chipRow.appendChild(chip);
    });
  };
  renderChips();
  wrap.appendChild(chipRow);

  const addRow = document.createElement('div');
  addRow.className = 'add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = field.key === 'feeds' ? 'https://example.com/rss.xml' : 'subreddit-name';
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add';
  const doAdd = () => {
    const v = input.value.trim();
    if (!v) return;
    cfg[field.key].push(v);
    input.value = '';
    renderChips();
  };
  addBtn.addEventListener('click', doAdd);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') doAdd(); });
  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  wrap.appendChild(addRow);

  return wrap;
}

function renderTextField(cfg, field) {
  if (cfg[field.key] == null) cfg[field.key] = '';
  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = field.label;
  wrap.appendChild(label);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = cfg[field.key] || '';
  input.placeholder = field.placeholder || '';
  input.addEventListener('input', () => { cfg[field.key] = input.value.trim(); });
  wrap.appendChild(input);
  return wrap;
}

function renderRangeField(cfg, field) {
  const [minKey, maxKey] = field.keys;
  if (cfg[minKey] == null) cfg[minKey] = '';
  if (cfg[maxKey] == null) cfg[maxKey] = '';

  const wrap = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = field.label;
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'range-row';
  const minInput = document.createElement('input');
  minInput.type = 'number';
  minInput.value = cfg[minKey] || '';
  minInput.placeholder = 'min';
  minInput.addEventListener('input', () => { cfg[minKey] = parseInt(minInput.value, 10) || ''; });
  const dash = document.createElement('span');
  dash.textContent = '–';
  const maxInput = document.createElement('input');
  maxInput.type = 'number';
  maxInput.value = cfg[maxKey] || '';
  maxInput.placeholder = 'max';
  maxInput.addEventListener('input', () => { cfg[maxKey] = parseInt(maxInput.value, 10) || ''; });
  row.appendChild(minInput);
  row.appendChild(dash);
  row.appendChild(maxInput);
  const unit = document.createElement('span');
  unit.textContent = 'words';
  row.appendChild(unit);
  wrap.appendChild(row);

  return wrap;
}

// ---- Save ---------------------------------------------------------------

async function save() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  setStatus('Saving…', 'loading');
  try {
    state.brief = document.getElementById('brief-text').value;
    await writeFile(BRIEF_PATH, state.brief);
    await writeFile(CONFIG_PATH, JSON.stringify(state.config, null, 2) + '\n');
    // Regenerate cron-scheduled missions for any saved_runs that
    // changed (added / enabled / cadence-edited / disabled / removed).
    // Idempotent — generate-missions.sh handles add+update+cleanup.
    setStatus('Saved. Regenerating missions…', 'loading');
    await runBash(`bash "${SKILL_DIR}/scripts/generate-missions.sh"`);
    setStatus('Saved.', 'ok');
    setTimeout(clearStatus, 2500);
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function resetDefaults() {
  if (!confirm('Reset brief and site configuration to defaults? Your edits will be lost.')) return;
  setStatus('Resetting…', 'loading');
  try {
    const exampleCfg = await readFile(CONFIG_EXAMPLE);
    const exampleBrief = await readFile(BRIEF_EXAMPLE);
    state.config = exampleCfg ? JSON.parse(exampleCfg) : { sites: {}, targets: {} };
    state.brief = exampleBrief || '';
    render();
    setStatus('Reset to defaults (not yet saved).', 'ok');
  } catch (err) {
    setStatus(`Reset failed: ${err.message}`, 'error');
  }
}

// ---- Status banner ------------------------------------------------------

function setStatus(text, kind) {
  const el = document.getElementById('status-banner');
  el.textContent = text;
  el.className = `state-msg ${kind || ''}`.trim();
  el.hidden = false;
}

function clearStatus() {
  const el = document.getElementById('status-banner');
  el.hidden = true;
  el.textContent = '';
}

// ---- Init ---------------------------------------------------------------

document.getElementById('save-btn').addEventListener('click', save);
document.getElementById('reset-btn').addEventListener('click', resetDefaults);

loadAll();
