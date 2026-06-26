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

// Unified website catalog: each row is one site with a SINGLE enable
// checkbox. Enabling a row turns on every role it supports — `source_id`
// (fetch + reply drafting, in `state.config.sites`) and/or `target_id`
// (a draft lane, in `state.config.targets`). Sites that both gather and
// publish (Reddit, X) carry both ids; pure publishing lanes (Blog, Medium,
// …) carry only `target_id`. Per-role config fields live under
// `source_fields` / `target_fields`.
const WEBSITES = [
  {
    name: 'Hacker News',
    desc: 'Add discovery keywords to find recent HN threads on your topics and draft a comment for each (Target) — the way to build karma on a new account before posting. Set your username so threads you\'ve already commented on drop out. Via the public Algolia HN API — no auth. Pulse drafts; you paste manually, never auto-posted.',
    source_id: 'hackernews',
    target_id: 'hn-comment',
    source_fields: [
      { kind: 'chips', key: 'keywords', label: 'Discovery keywords (topics to search, not brand names)' },
      { kind: 'text', key: 'username', label: 'My HN username (drops threads I\'ve already commented on)', placeholder: 'e.g. linggen — case-sensitive, no prefix' },
    ],
  },
  {
    name: 'Reddit',
    desc: 'Newest threads from each subreddit (Source) + per-thread comment drafts (Target), via Reddit\'s public RSS feeds. Reddit closed its anonymous JSON API (Nov 2025), so replies/mentions need a private RSS token (free, no app — see below).',
    source_id: 'reddit',
    target_id: 'reddit-comment',
    source_fields: [
      { kind: 'chips', key: 'subs', label: 'Subreddits' },
      { kind: 'text', key: 'username', label: 'My Reddit username (for mention monitoring)', placeholder: 'e.g. linggen — without the u/ prefix' },
      {
        kind: 'text',
        key: 'private_rss_feed_token',
        label: 'Private RSS feed token (unlocks comment replies & mentions)',
        placeholder: 'paste the whole feed URL, or just the feed=… token',
        hint:
          'Reddit\'s API is closed, but your private RSS feeds still work — no app, no OAuth, free. To get your token:' +
          '<ol>' +
          '<li>Open <a href="https://old.reddit.com/prefs/" target="_blank" rel="noopener">old.reddit.com/prefs</a> → <b>options</b> tab → check <b>“enable private RSS feeds”</b>.</li>' +
          '<li>Go to the <a href="https://old.reddit.com/prefs/feeds/" target="_blank" rel="noopener"><b>RSS feeds</b></a> tab → under <b>“your inbox”</b>, right-click the orange <b>RSS</b> next to <b>“comment replies only”</b> → <b>Copy Link Address</b>.</li>' +
          '<li>Paste that whole URL here (it contains <code>?feed=…&user=…</code>). Pulse extracts the token automatically.</li>' +
          '</ol>' +
          'Keep it private — the token is read-access to your inbox; it\'s invalidated only if you change your Reddit password. Without it, only public username mentions show (not replies).',
      },
    ],
  },
  {
    name: 'X (Twitter)',
    desc: 'Mentions, replies, and topic discovery read from your logged-in x.com session via the free linggen-browser extension — no paid API. Install the extension and stay signed in to X; without it the X section stays empty. Pulse drafts replies and ≤280-char posts; you copy them to X manually — never auto-posted.',
    source_id: 'x',
    target_id: 'x-post',
    source_fields: [
      { kind: 'chips', key: 'target_accounts', label: 'Target accounts — reply early to THEIR fresh posts (the growth engine). Curate mid-tier niche accounts (~2k–200k followers in your space), NOT mega-accounts like Elon/Sam Altman — their replies are saturated and their audience is too general.', placeholder: 'e.g. swyx — handle without @' },
      { kind: 'account_finder', targetKey: 'target_accounts', script: 'x-suggest-accounts.sh', label: 'Find candidates from your following + topic searches' },
      { kind: 'chips', key: 'keywords', label: 'Discovery keywords (topics to search, not brand names)' },
      { kind: 'text', key: 'username', label: 'My X handle (optional, for display)', placeholder: 'e.g. linggen — without the @ prefix' },
    ],
  },
  {
    name: 'Lobsters',
    desc: 'Lobste.rs newest feed.',
    source_id: 'lobsters',
  },
  {
    name: 'Bluesky',
    desc: 'Public AT Proto monitoring — no auth required. Set your handle to surface mentions and replies. Add category keywords (extracted from your brief, NOT brand names) for discovery — Bluesky has no subreddits, so keyword search is how you find threads in your space.',
    source_id: 'bluesky',
    source_fields: [
      { kind: 'text', key: 'handle', label: 'My Bluesky handle (for mention monitoring)', placeholder: 'e.g. yourname.bsky.social — without the @ prefix' },
      { kind: 'chips', key: 'keywords', label: 'Search keywords (categories, not brand names)' },
    ],
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
    name: 'Product Hunt',
    desc: "Today's launches. Useful for spotting competing products.",
    source_id: 'product-hunt',
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
  const ctInput = document.getElementById('compact-threshold');
  if (ctInput) {
    // Stored as fraction 0.10–0.99; UI shows as integer percent.
    const t = typeof state.config.compact_threshold === 'number'
      ? Math.round(state.config.compact_threshold * 100)
      : 70;
    ctInput.value = String(t);
  }
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

  // Single enable checkbox — flips every role the site supports at once.
  const roles = document.createElement('div');
  roles.className = 'website-roles';
  roles.appendChild(siteToggle(site, () => {
    row.classList.toggle('any-enabled', isAnyEnabled(site));
    renderConfig();
  }));
  row.appendChild(roles);

  // Per-role config: shown when the matching role is enabled
  const config = document.createElement('div');
  config.className = 'website-config';
  row.appendChild(config);

  function renderConfig() {
    config.innerHTML = '';
    if (site.source_id && state.config.sites[site.source_id]?.enabled && site.source_fields) {
      const cfg = state.config.sites[site.source_id];
      site.source_fields.forEach((field) => config.appendChild(renderField(cfg, field, renderConfig)));
    }
    if (site.target_id && state.config.targets[site.target_id]?.enabled && site.target_fields) {
      const cfg = state.config.targets[site.target_id];
      site.target_fields.forEach((field) => config.appendChild(renderField(cfg, field, renderConfig)));
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

// One checkbox per site. Checking it enables every role the site supports
// at once — fetch (source) and draft lane (target) — so the user picks
// "use this site", not separate Source/Target roles.
function siteToggle(site, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'role-toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = isAnyEnabled(site);
  cb.addEventListener('change', () => {
    setSiteEnabled(site, cb.checked);
    onChange?.();
  });
  const txt = document.createElement('span');
  txt.textContent = 'Enabled';
  wrap.append(cb, txt);
  return wrap;
}

function setSiteEnabled(site, on) {
  if (site.source_id) {
    if (!state.config.sites[site.source_id]) state.config.sites[site.source_id] = {};
    state.config.sites[site.source_id].enabled = on;
  }
  if (site.target_id) {
    if (!state.config.targets[site.target_id]) state.config.targets[site.target_id] = {};
    state.config.targets[site.target_id].enabled = on;
  }
}

function renderField(cfg, field, rerender) {
  if (field.kind === 'chips')          return renderChipField(cfg, field);
  if (field.kind === 'range')          return renderRangeField(cfg, field);
  if (field.kind === 'text')           return renderTextField(cfg, field);
  if (field.kind === 'account_finder') return renderAccountFinderField(cfg, field, rerender);
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
  input.placeholder = field.placeholder
    || (field.key === 'feeds' ? 'https://example.com/rss.xml'
        : field.key === 'subs' ? 'subreddit-name'
        : field.key === 'keywords' ? 'e.g. local LLM'
        : '');
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

// On-demand account finder (X target accounts). Runs a deterministic script
// — following + keyword harvest, ranked heuristically — and lets the user
// tick candidates into cfg[field.targetKey] (the target_accounts chips).
// No agent: the user is the judge; we just gather + sort. `rerender` rebuilds
// the site's config block so the chips above reflect newly-added handles.
function fmtFollowers(n) {
  n = n || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

function renderAccountFinderField(cfg, field, rerender) {
  const targetKey = field.targetKey || 'target_accounts';
  if (!Array.isArray(cfg[targetKey])) cfg[targetKey] = [];

  const wrap = document.createElement('div');
  wrap.className = 'account-finder';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'finder-btn';
  btn.textContent = '🔍 Suggest accounts';
  wrap.appendChild(btn);

  const results = document.createElement('div');
  results.className = 'finder-results';
  wrap.appendChild(results);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Searching your following + topics…';
    results.innerHTML = '';
    let cands = [];
    try {
      const out = await runBash(`bash "${SKILL_DIR}/scripts/sites/${field.script}"`);
      cands = JSON.parse(out || '[]');
    } catch (e) {
      results.innerHTML = `<div class="finder-empty">Couldn't fetch candidates: ${e.message}. Check that X is set up (credentials + keywords).</div>`;
      btn.disabled = false; btn.textContent = '🔍 Suggest accounts';
      return;
    }
    btn.disabled = false;
    btn.textContent = '🔍 Suggest accounts';

    const existing = new Set(cfg[targetKey].map((h) => String(h).toLowerCase()));
    cands = cands.filter((c) => c.handle && !existing.has(c.handle.toLowerCase()));
    if (cands.length === 0) {
      results.innerHTML = '<div class="finder-empty">No new candidates found. Add discovery keywords above, or curate handles manually.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'finder-list';
    const checks = [];
    cands.forEach((c) => {
      const row = document.createElement('label');
      row.className = 'finder-row' + (c.mega ? ' mega' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = c.handle;
      checks.push(cb);
      const meta = document.createElement('div');
      meta.className = 'finder-meta';
      const top = document.createElement('div');
      top.className = 'finder-top';
      // Display name first (human-readable), then the @handle, then followers.
      // Built with textContent so a name containing < or & can't break markup.
      if (c.name && c.name !== c.handle) {
        const nameEl = document.createElement('span');
        nameEl.className = 'finder-name';
        nameEl.textContent = c.name;
        top.appendChild(nameEl);
      }
      const handleEl = document.createElement('span');
      handleEl.className = 'finder-handle';
      handleEl.textContent = '@' + c.handle;
      top.appendChild(handleEl);
      const folEl = document.createElement('span');
      folEl.className = 'finder-followers';
      folEl.textContent = fmtFollowers(c.followers) + (c.mega ? ' ⚠' : '');
      top.appendChild(folEl);
      const why = document.createElement('div');
      why.className = 'finder-why';
      why.textContent = c.why || '';
      if (c.bio) { why.textContent += c.bio ? ` · ${c.bio}` : ''; }
      const link = document.createElement('a');
      link.href = `https://x.com/${c.handle}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.className = 'finder-open'; link.textContent = '↗';
      meta.appendChild(top); meta.appendChild(why);
      row.appendChild(cb); row.appendChild(meta); row.appendChild(link);
      list.appendChild(row);
    });
    results.appendChild(list);

    const addSel = document.createElement('button');
    addSel.type = 'button';
    addSel.className = 'finder-add';
    const refresh = () => {
      const n = checks.filter((c) => c.checked).length;
      addSel.textContent = n ? `+ Add selected (${n})` : '+ Add selected';
      addSel.disabled = n === 0;
    };
    checks.forEach((c) => c.addEventListener('change', refresh));
    refresh();
    addSel.addEventListener('click', () => {
      const have = new Set(cfg[targetKey].map((h) => String(h).toLowerCase()));
      checks.filter((c) => c.checked).forEach((c) => {
        const h = c.value.trim().replace(/^@/, '');
        if (h && !have.has(h.toLowerCase())) { cfg[targetKey].push(h); have.add(h.toLowerCase()); }
      });
      markDirty();
      if (typeof rerender === 'function') rerender();  // chips above now show them
    });
    results.appendChild(addSel);
  });

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
  if (field.hint) {
    const hint = document.createElement('div');
    hint.className = 'field-hint';
    hint.innerHTML = field.hint; // trusted: static, author-authored guidance
    wrap.appendChild(hint);
  }
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
  saveBtn.textContent = 'Saving…';
  setStatus('Saving…', 'loading');
  try {
    state.config.brief = document.getElementById('brief-text').value;
    const wsInput = document.getElementById('workspace-path');
    if (wsInput) state.config.workspace_path = wsInput.value.trim();
    const ctInput = document.getElementById('compact-threshold');
    if (ctInput && ctInput.value.trim()) {
      const pct = parseInt(ctInput.value, 10);
      if (Number.isFinite(pct) && pct >= 10 && pct <= 99) {
        state.config.compact_threshold = pct / 100;
      }
    }
    await writeFile(CONFIG_PATH, JSON.stringify(state.config, null, 2) + '\n');
    saveBtn.textContent = 'Saved ✓';
    saveBtn.classList.add('saved');
    setStatus('✓ Settings saved', 'ok');
    setTimeout(() => {
      clearStatus();
      saveBtn.textContent = 'Save';
      saveBtn.classList.remove('saved');
    }, 1800);
    markClean();
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, 'error');
    saveBtn.textContent = 'Save';
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
