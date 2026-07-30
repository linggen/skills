// Apple Shifu shell — the chrome every tab shares: which device is selected,
// the four verbs, and how much of the phone is still unarchived.
//
// A tab registers a provider and the shell asks it for verbs whenever anything
// moves, rendering whatever comes back. Nothing in this file knows what a tab
// does, so adding or retiring a verb means editing that tab's provider and
// nothing else.
//
// A verb a tab cannot serve is returned `{ blocked: '<reason>' }` and renders
// greyed with the reason on it. It is never dropped from the row — position is
// the point — and it is never left live with nothing behind it.

const SOURCE_KEY = 'apple-shifu:source';
const TAB_KEY = 'apple-shifu:tab';

/** The four verbs, in the one order they appear in on every tab. */
const VERBS = [
  { key: 'scan', icon: '↻', label: 'Scan' },
  { key: 'report', icon: '📊', label: 'Report' },
  { key: 'backup', icon: '☁️', label: 'Back up' },
  { key: 'clean', icon: '🧹', label: 'Clean' },
];

const SOURCES = [
  { key: 'phone', icon: '📱', fallback: 'iPhone' },
  { key: 'mac', icon: '💻', fallback: 'This Mac' },
];

let source = 'phone';
let activeTab = 'system';
const providers = new Map();          // tab name -> provider
const sourceInfo = { phone: null, mac: null };  // tab-supplied device labels
const sourceListeners = [];
const tabListeners = [];
const backupListeners = [];
let backup = null;                    // { count, bytes } — null until known

// ── registration ──

/**
 * Register a tab.
 * @param {string} name          tab id, matching `data-tab` in the header
 * @param {object} provider
 *   panel          id of the element this tab shows; the shell hides the rest
 *   verbs(source)  -> { scan, report, backup, clean }, each an action:
 *                     { run, hint?, label?, menu?: [{label, hint?, run}] }
 *                     or { blocked: 'why this tab cannot do it here' }
 *   meta?(source)  -> HTML for the trailing slot of the toolbar
 *
 * Tabs register from their own modules and may arrive after `initShell()`, so
 * registering re-applies panel visibility rather than assuming it ran first.
 */
export function registerTab(name, provider) {
  providers.set(name, provider);
  applyPanels();
  if (name === activeTab) renderToolbar();
}

/** Only the active tab's panel is in the document flow. */
function applyPanels() {
  for (const [name, provider] of providers) {
    const el = provider.panel && document.getElementById(provider.panel);
    if (el) el.hidden = name !== activeTab;
  }
}

export function getSource() { return source; }
export function getActiveTab() { return activeTab; }

export function onSourceChange(fn) { sourceListeners.push(fn); }
export function onTabChange(fn) { tabListeners.push(fn); }

/** Tabs own the device facts; the shell only draws them on the switch. */
export function setSourceInfo(key, info) {
  sourceInfo[key] = info;
  renderSourceSwitch();
}

/** The one backup figure, shown in the header on every tab. */
export function setBackupBadge(summary) {
  backup = summary;
  renderBackupBadge();
  renderToolbar();   // Back up reads it, so the verb follows the badge
  for (const fn of backupListeners) fn(summary);
}

/** Panels that print the same figure follow it here, so the badge and the row
    can never say different things about the same archive. */
export function onBackupChange(fn) { backupListeners.push(fn); }

/** `{ count, bytes }`, or null while nothing has measured it yet. */
export function getBackupSummary() { return backup; }

/** Re-ask the active tab for its verbs — call whenever tab state moves. */
export function refreshVerbs() { renderToolbar(); }

// ── init ──

export function initShell() {
  try { source = localStorage.getItem(SOURCE_KEY) || 'phone'; } catch { /* private mode */ }
  if (!SOURCES.some((s) => s.key === source)) source = 'phone';
  try { activeTab = localStorage.getItem(TAB_KEY) || 'system'; } catch { /* private mode */ }

  for (const tab of document.querySelectorAll('.atab')) {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
  }
  document.getElementById('source-switch')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.src-btn');
    if (btn && btn.dataset.src !== source) setSource(btn.dataset.src);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.verb-menu') && !e.target.closest('.verb-btn')) closeMenu();
  });

  setActiveTab(activeTab);
  renderSourceSwitch();
  renderBackupBadge();
}

export function setSource(next) {
  if (next === source) return;
  source = next;
  try { localStorage.setItem(SOURCE_KEY, next); } catch { /* quota */ }
  renderSourceSwitch();
  renderToolbar();
  for (const fn of sourceListeners) fn(next);
}

export function setActiveTab(name) {
  activeTab = name;
  try { localStorage.setItem(TAB_KEY, name); } catch { /* quota */ }
  for (const tab of document.querySelectorAll('.atab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  applyPanels();
  renderToolbar();
  for (const fn of tabListeners) fn(name);
}

// ── source switch ──

function renderSourceSwitch() {
  const el = document.getElementById('source-switch');
  if (!el) return;
  el.innerHTML = SOURCES.map((s) => {
    const info = sourceInfo[s.key];
    const label = info?.label || s.fallback;
    const detail = info?.detail ? `<span class="src-detail">${info.detail}</span>` : '';
    return `<button class="src-btn ${s.key === source ? 'on' : ''}" data-src="${s.key}"
      title="${esc(info?.title || label)}">${s.icon} <span class="src-label">${esc(label)}</span>${detail}</button>`;
  }).join('');
}

// ── backup badge ──

function renderBackupBadge() {
  const el = document.getElementById('backup-badge');
  if (!el) return;
  if (!backup) { el.hidden = true; el.textContent = ''; return; }
  if (!backup.count) {
    el.hidden = false;
    el.className = 'backup-badge clear';
    el.textContent = '☁️ everything archived';
    el.title = 'Every item on the iPhone has a hash-verified copy on this Mac.';
    return;
  }
  el.hidden = false;
  el.className = 'backup-badge';
  el.textContent = `☁️ ${backup.count.toLocaleString()} unarchived · ${fmtBytes(backup.bytes)}`;
  el.title = 'iPhone items with no verified copy on this Mac yet.';
}

// ── the four verbs ──

function renderToolbar() {
  const el = document.getElementById('verbs-toolbar');
  if (!el) return;
  closeMenu();
  const provider = providers.get(activeTab);
  const actions = provider?.verbs?.(source) || {};
  el.innerHTML = '';
  for (const verb of VERBS) {
    el.appendChild(verbButton(verb, actions[verb.key]));
  }
  const meta = document.createElement('span');
  meta.className = 'verb-meta';
  meta.id = 'verb-meta';
  meta.innerHTML = provider?.meta?.(source) || '';
  el.appendChild(meta);
}

function verbButton(verb, action) {
  const btn = document.createElement('button');
  btn.className = 'verb-btn';
  btn.dataset.verb = verb.key;
  const label = action?.label || verb.label;
  const caret = action?.menu?.length ? '<span class="verb-caret">▾</span>' : '';
  btn.innerHTML = `<span class="verb-icon">${verb.icon}</span>
    <span class="verb-label">${esc(label)}</span>${caret}`;
  if (!action || action.blocked) {
    btn.disabled = true;
    btn.title = action?.blocked || 'Not available here';
    return btn;
  }
  btn.title = action.hint || label;
  btn.onclick = () => {
    if (action.menu?.length) openMenu(btn, action.menu);
    else action.run?.();
  };
  return btn;
}

// ── verb menu (a verb that fans out, e.g. Scan → disk / security / …) ──

let menuEl = null;

function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}

function openMenu(anchor, items) {
  const reopening = menuEl?.dataset.verb === anchor.dataset.verb;
  closeMenu();
  if (reopening) return;
  menuEl = document.createElement('div');
  menuEl.className = 'verb-menu';
  menuEl.dataset.verb = anchor.dataset.verb;
  for (const item of items) {
    const row = document.createElement('button');
    row.className = 'verb-menu-item';
    row.innerHTML = `<span>${esc(item.label)}</span>${
      item.hint ? `<span class="verb-menu-hint">${esc(item.hint)}</span>` : ''}`;
    if (item.blocked) { row.disabled = true; row.title = item.blocked; }
    else row.onclick = () => { closeMenu(); item.run?.(); };
    menuEl.appendChild(row);
  }
  const r = anchor.getBoundingClientRect();
  menuEl.style.top = `${r.bottom + 4}px`;
  menuEl.style.left = `${r.left}px`;
  document.body.appendChild(menuEl);
}

// ── shared formatting ──

export function fmtBytes(bytes) {
  if (!bytes) return '0 KB';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
