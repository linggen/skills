// Pulse Settings — load/save config.json + brief.md via /api/bash.
// Same iframe pattern as pulse-app.js (ungated, no permission prompt).

const SKILL_DIR = '$HOME/.linggen/skills/pulse';
const CONFIG_PATH = `${SKILL_DIR}/config.json`;
const CONFIG_EXAMPLE = `${SKILL_DIR}/config.example.json`;
// Legacy brief.md path — read once on first load to migrate users from
// the file-based brief to the structured config.brief field. Never
// written to anymore; the textarea saves directly into config.brief.
const LEGACY_BRIEF_PATH = `${SKILL_DIR}/references/brief.md`;
const LEGACY_BRIEF_EXAMPLE = `${SKILL_DIR}/references/brief.example.md`;

// Unified website catalog: each row in the settings UI is one site, with
// independent Source / Target role checkboxes. `source_id` and `target_id`
// are the slugs in `state.config.sites` and `state.config.targets`
// respectively. Reddit is the only built-in site with both. Source-side
// configuration fields live under `source_fields`; target-side under
// `target_fields`.
const WEBSITES = [
  {
    name: 'Hacker News',
    desc: 'Top 30 current stories.',
    source_id: 'hackernews',
  },
  {
    name: 'Reddit',
    desc: '25 newest threads from each subreddit (Source). Per-thread comment drafts (Target). Set your username to also surface public mentions of u/<handle> in Gather web — uses Reddit\'s public JSON, no auth required.',
    source_id: 'reddit',
    target_id: 'reddit-comment',
    source_fields: [
      { kind: 'chips', key: 'subs', label: 'Subreddits' },
      { kind: 'text', key: 'username', label: 'My Reddit username (for mention monitoring)', placeholder: 'e.g. linggen — without the u/ prefix' },
    ],
  },
  {
    name: 'Lobsters',
    desc: 'Lobste.rs newest feed.',
    source_id: 'lobsters',
  },
  {
    name: 'arxiv',
    desc: 'Recent CS.AI / CS.LG / CS.CL papers.',
    source_id: 'arxiv',
  },
  {
    name: 'RSS / Atom',
    desc: 'Built-in RSS aggregator. Custom feeds added below also flow into this list.',
    source_id: 'rss',
    source_fields: [{ kind: 'chips', key: 'feeds', label: 'Feed URLs' }],
  },
  {
    name: 'Google Trends (daily)',
    desc: "Today's trending searches in your region. Free public RSS.",
    source_id: 'google-trends',
    source_fields: [{ kind: 'text', key: 'region', label: 'Region (ISO code, e.g. US, GB, JP)', placeholder: 'US' }],
  },
  {
    name: 'GitHub Trending',
    desc: "Today's trending repos. Optional language filter.",
    source_id: 'github-trending',
    source_fields: [{ kind: 'text', key: 'language', label: 'Language (blank = all)', placeholder: 'rust' }],
  },
  {
    name: 'Product Hunt',
    desc: "Today's launches. Useful for spotting competing products.",
    source_id: 'product-hunt',
  },
  {
    name: 'Wikipedia pageviews',
    desc: 'Real topic-volume trends over the last 60 days. Add the Wikipedia article titles you care about.',
    source_id: 'wikipedia-pageviews',
    source_fields: [{ kind: 'chips', key: 'topics', label: 'Article titles' }],
  },
  {
    name: 'X / Twitter',
    desc: 'Single-claim post, ≤ 280 chars.',
    target_id: 'x-post',
  },
  {
    name: 'Medium',
    desc: 'Mid-length article, 500–1000 words.',
    target_id: 'medium',
  },
  {
    name: 'Blog',
    desc: 'Long-form post, configurable length.',
    target_id: 'blog',
    target_fields: [{ kind: 'range', keys: ['min_words', 'max_words'], label: 'Words' }],
  },
  {
    name: 'LinkedIn',
    desc: 'Professional-tone post, ~150–350 words.',
    target_id: 'linkedin',
  },
  {
    name: 'Substack',
    desc: 'Newsletter post, 600–1500 words.',
    target_id: 'substack',
  },
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
  config: { workspace_path: '', brief: '', sites: {}, targets: {} },
};

// Dirty tracking. Save is gated on this flag so a freshly-loaded form
// can't re-save the same JSON, and the button visually reflects whether
// there's anything to save. Flipped on by any input/change inside #main
// (delegated listener below), reset by load/save/reset.
let dirty = false;
function markDirty() {
  if (dirty) return;
  dirty = true;
  syncSaveBtn();
}
function markClean() {
  dirty = false;
  syncSaveBtn();
}
function syncSaveBtn() {
  const btn = document.getElementById('save-btn');
  if (!btn) return;
  btn.disabled = !dirty;
}

// ---- Load ----------------------------------------------------------------

async function loadAll() {
  setStatus('Loading…', 'loading');
  try {
    let cfgText = await readFile(CONFIG_PATH);
    if (!cfgText) cfgText = await readFile(CONFIG_EXAMPLE);
    state.config = cfgText ? JSON.parse(cfgText) : { workspace_path: '', brief: '', sites: {}, targets: {} };
    if (typeof state.config.workspace_path !== 'string') state.config.workspace_path = '';
    if (typeof state.config.brief !== 'string') state.config.brief = '';
    if (!state.config.sites) state.config.sites = {};
    if (!state.config.targets) state.config.targets = {};

    // One-time migration: if config.brief is empty but legacy brief.md
    // has content, seed it. The legacy file is left untouched on disk
    // for now (next save writes config.brief, not brief.md).
    if (!state.config.brief.trim()) {
      let legacy = await readFile(LEGACY_BRIEF_PATH);
      if (legacy === null) legacy = await readFile(LEGACY_BRIEF_EXAMPLE, '');
      if (legacy && legacy.trim()) state.config.brief = legacy;
    }

    render();
    markClean();
    clearStatus();
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'error');
  }
}

// ---- Render --------------------------------------------------------------

function render() {
  document.getElementById('brief-text').value = state.config.brief || '';
  const wsInput = document.getElementById('workspace-path');
  if (wsInput) wsInput.value = state.config.workspace_path || '';
  renderWebsites();
}

// ---- Unified websites list -----------------------------------------------

function renderWebsites() {
  const list = document.getElementById('websites-list');
  if (!list) return;
  list.innerHTML = '';
  WEBSITES.forEach((site) => list.appendChild(renderWebsiteRow(site)));
  // Custom feeds: each entry in sites.rss.feeds becomes a row at the end,
  // marked source-only with a delete button.
  const feeds = (state.config.sites?.rss?.feeds || []);
  feeds.forEach((url, idx) => list.appendChild(renderCustomFeedRow(url, idx)));
}

function renderWebsiteRow(site) {
  const row = document.createElement('div');
  row.className = 'website-row';

  // Info column: name + description
  const info = document.createElement('div');
  info.className = 'website-info';
  const nameEl = document.createElement('strong');
  nameEl.textContent = site.name;
  info.appendChild(nameEl);
  if (site.desc) {
    const desc = document.createElement('span');
    desc.className = 'website-desc';
    desc.textContent = site.desc;
    info.appendChild(desc);
  }
  row.appendChild(info);

  // Roles column: Source + Target checkboxes (only the applicable ones)
  const roles = document.createElement('div');
  roles.className = 'website-roles';
  if (site.source_id) {
    roles.appendChild(roleToggle('Source', state.config.sites, site.source_id, () => {
      row.classList.toggle('any-enabled', isAnyEnabled(site));
      renderConfig();
    }));
  } else {
    roles.appendChild(rolePlaceholder());
  }
  if (site.target_id) {
    roles.appendChild(roleToggle('Target', state.config.targets, site.target_id, () => {
      row.classList.toggle('any-enabled', isAnyEnabled(site));
      renderConfig();
    }));
  } else {
    roles.appendChild(rolePlaceholder());
  }
  row.appendChild(roles);

  // Per-role config: shown when the matching role is enabled
  const config = document.createElement('div');
  config.className = 'website-config';
  row.appendChild(config);

  function renderConfig() {
    config.innerHTML = '';
    if (site.source_id && state.config.sites[site.source_id]?.enabled && site.source_fields) {
      const cfg = state.config.sites[site.source_id];
      site.source_fields.forEach((field) => config.appendChild(renderField(cfg, field)));
    }
    if (site.target_id && state.config.targets[site.target_id]?.enabled && site.target_fields) {
      const cfg = state.config.targets[site.target_id];
      site.target_fields.forEach((field) => config.appendChild(renderField(cfg, field)));
    }
  }

  if (isAnyEnabled(site)) row.classList.add('any-enabled');
  renderConfig();
  return row;
}

function isAnyEnabled(site) {
  return (site.source_id && state.config.sites?.[site.source_id]?.enabled) ||
         (site.target_id && state.config.targets?.[site.target_id]?.enabled);
}

function roleToggle(label, configSection, slug, onChange) {
  if (!configSection[slug]) configSection[slug] = { enabled: false };
  const cfg = configSection[slug];
  const wrap = document.createElement('label');
  wrap.className = 'role-toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!cfg.enabled;
  cb.addEventListener('change', () => {
    cfg.enabled = cb.checked;
    onChange?.();
  });
  const txt = document.createElement('span');
  txt.textContent = label;
  wrap.append(cb, txt);
  return wrap;
}

function rolePlaceholder() {
  const span = document.createElement('span');
  span.className = 'role-placeholder';
  span.textContent = '—';
  span.title = 'Not applicable for this site';
  return span;
}

function renderField(cfg, field) {
  if (field.kind === 'chips')  return renderChipField(cfg, field);
  if (field.kind === 'range')  return renderRangeField(cfg, field);
  if (field.kind === 'text')   return renderTextField(cfg, field);
  return document.createDocumentFragment();
}

function renderCustomFeedRow(url, idx) {
  const row = document.createElement('div');
  row.className = 'website-row custom any-enabled';

  const info = document.createElement('div');
  info.className = 'website-info';
  const nameEl = document.createElement('strong');
  nameEl.textContent = displayHostFromUrl(url);
  info.appendChild(nameEl);
  const desc = document.createElement('span');
  desc.className = 'website-desc';
  desc.textContent = url;
  info.appendChild(desc);
  row.appendChild(info);

  const roles = document.createElement('div');
  roles.className = 'website-roles';
  const tag = document.createElement('span');
  tag.className = 'site-tag';
  tag.textContent = 'Custom · Source';
  roles.appendChild(tag);
  row.appendChild(roles);

  const actions = document.createElement('div');
  actions.className = 'website-config';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'custom-feed-delete';
  del.textContent = 'Remove';
  del.addEventListener('click', () => {
    state.config.sites.rss.feeds.splice(idx, 1);
    renderWebsites();
  });
  actions.appendChild(del);
  row.appendChild(actions);
  return row;
}

function displayHostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function addCustomFeed() {
  const input = document.getElementById('add-website-url');
  const url = (input?.value || '').trim();
  if (!url) return;
  try { new URL(url); } catch { setStatus('Invalid URL', 'error'); return; }
  if (!state.config.sites) state.config.sites = {};
  if (!state.config.sites.rss) state.config.sites.rss = { enabled: true, feeds: [] };
  if (!Array.isArray(state.config.sites.rss.feeds)) state.config.sites.rss.feeds = [];
  if (state.config.sites.rss.feeds.includes(url)) {
    setStatus('Feed already added', 'error');
    return;
  }
  state.config.sites.rss.feeds.push(url);
  // Auto-enable the RSS source so the new feed actually flows through.
  state.config.sites.rss.enabled = true;
  input.value = '';
  renderWebsites();
  clearStatus();
}

document.getElementById('add-website-btn')?.addEventListener('click', addCustomFeed);
document.getElementById('add-website-url')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCustomFeed();
  }
});

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
    state.config.brief = document.getElementById('brief-text').value;
    const wsInput = document.getElementById('workspace-path');
    if (wsInput) state.config.workspace_path = wsInput.value.trim();
    await writeFile(CONFIG_PATH, JSON.stringify(state.config, null, 2) + '\n');
    setStatus('✓ Settings saved', 'ok');
    setTimeout(clearStatus, 2500);
    markClean();
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, 'error');
    saveBtn.disabled = false;
  }
}

async function resetDefaults() {
  if (!confirm('Reset brief and site configuration to defaults? Your edits will be lost.')) return;
  setStatus('Resetting…', 'loading');
  try {
    const exampleCfg = await readFile(CONFIG_EXAMPLE);
    state.config = exampleCfg
      ? JSON.parse(exampleCfg)
      : { workspace_path: '', brief: '', sites: {}, targets: {} };
    if (typeof state.config.brief !== 'string') state.config.brief = '';
    // If the example config doesn't carry a brief, fall back to the
    // legacy brief.example.md content so users who reset still see
    // something meaningful in the textarea.
    if (!state.config.brief.trim()) {
      const legacy = await readFile(LEGACY_BRIEF_EXAMPLE, '');
      if (legacy && legacy.trim()) state.config.brief = legacy;
    }
    render();
    markDirty();
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
syncSaveBtn();

// Delegated dirty tracking. Catches every input field, checkbox toggle,
// chip add/remove (which rebuilds DOM under #main), and custom-feed
// edits without each renderer having to remember to call markDirty.
// Bubbling 'input' covers textareas + text/number inputs; 'change'
// covers checkboxes. 'click' covers chip × buttons and custom-feed
// Remove, which mutate state without firing input/change.
const mainEl = document.getElementById('main');
if (mainEl) {
  mainEl.addEventListener('input', markDirty);
  mainEl.addEventListener('change', markDirty);
  mainEl.addEventListener('click', (e) => {
    if (e.target.closest('button')) markDirty();
  });
}

loadAll();
