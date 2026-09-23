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

import { fmtBytes, esc } from './shifu-io.js';

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
// Which paired phone the phone side means. Several can be paired — three
// simulators and a real iPhone here — and the chip used to name whichever was
// paired first, which is how it said "(sim)" while the card named the phone
// that had actually connected.
let phoneDevice = null;          // {id, name} the user picked, or null = the live one
let pairedPhones = [];           // [{id, name}] from /api/pair/info
let livePhone = null;            // {id, name, at} from the phone/tools topic
const deviceListeners = [];
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
  // Tabs register after initShell, so a restored tab + side that don't go
  // together are only knowable now. The tab showing wins; the side moves.
  if (name === activeTab && !tabServes(name, source)) setSource(tabSources(name)[0]);
  applyPanels();
  renderTabs();
  renderSourceSwitch();
  if (name === activeTab) renderToolbar();
}

/** Only the active tab's panel is in the document flow. */
function applyPanels() {
  for (const [name, provider] of providers) {
    const el = provider.panel && document.getElementById(provider.panel);
    if (el) el.hidden = name !== activeTab;
  }
}

/** A tab may serve only one side of the switch — `sources: ['mac']` on its
    provider. The two controls then grey each other: the Files tab dims while
    an iPhone is the side in play, and the iPhone chip dims while Files is
    open. Neither is dropped and each carries the reason, the same bargain the
    toolbar's blocked verbs make. iOS shows no app another app's files, so a
    Files tab under a phone could only ever draw an empty screen. */
function tabSources(name) {
  const declared = providers.get(name)?.sources;
  return Array.isArray(declared) && declared.length ? declared : SOURCES.map((s) => s.key);
}

function tabServes(name, key) {
  return tabSources(name).includes(key);
}

const OFF_REASON = {
  files: 'Files is this Mac — iOS shows no app another app’s files',
  phone: 'Files is this Mac — iOS shows no app another app’s files',
};

/** Grey the tabs the side in play can't serve. */
function renderTabs() {
  for (const tab of document.querySelectorAll('.atab')) {
    const name = tab.dataset.tab;
    if (tab.dataset.title == null) tab.dataset.title = tab.getAttribute('title') || '';
    const off = providers.has(name) && !tabServes(name, source);
    tab.classList.toggle('off', off);
    tab.setAttribute('aria-disabled', off ? 'true' : 'false');
    const why = OFF_REASON[name] || 'Not available for this device';
    if (off) tab.title = why;
    else if (tab.dataset.title) tab.title = tab.dataset.title;
    else tab.removeAttribute('title');
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
  // A link from another app may name the tab to land on (Lingjing's 功课 row
  // opens ?tab=system, where the disk scan lives). It wins over the saved one.
  const asked = new URLSearchParams(window.location.search).get('tab');
  if (asked && document.querySelector(`.atab[data-tab="${CSS.escape(asked)}"]`)) activeTab = asked;

  for (const tab of document.querySelectorAll('.atab')) {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('off')) return;
      setActiveTab(tab.dataset.tab);
    });
  }
  document.getElementById('source-switch')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.src-btn');
    if (!btn || btn.classList.contains('off')) return;
    // First click on a side switches to it; clicking the phone again asks
    // which phone — so one chip both switches and picks, with no second knob.
    if (btn.dataset.src !== source) setSource(btn.dataset.src);
    else if (btn.dataset.src === 'phone') openDeviceMenu(btn);
  });
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) phoneDevice = JSON.parse(saved);
  } catch { /* private mode, or a shape we no longer understand */ }
  loadDevices();
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.verb-menu, .verb-btn, .menu-anchor')) closeMenu();
  });

  setActiveTab(activeTab);
  renderSourceSwitch();
  renderBackupBadge();
}

const DEVICE_KEY = 'shifu:phone-device';

/** The phone the app is talking about: the user's pick, else whichever phone
    last connected, else the first paired. */
export function getPhoneDevice() {
  if (phoneDevice) return phoneDevice;
  if (livePhone) return { id: livePhone.id, name: livePhone.name };
  return pairedPhones[0] || null;
}

export function onPhoneDeviceChange(fn) { deviceListeners.push(fn); }

function setPhoneDevice(dev) {
  phoneDevice = dev;
  try {
    if (dev) localStorage.setItem(DEVICE_KEY, JSON.stringify(dev));
    else localStorage.removeItem(DEVICE_KEY);
  } catch { /* private mode */ }
  renderSourceSwitch();
  for (const fn of deviceListeners) fn(getPhoneDevice());
}

/** Paired phones, and which one last opened Linggen. Both are cheap local
    reads; the topic is what the phone republishes on every connect. */
async function loadDevices() {
  try {
    const info = await (await fetch('/api/pair/info')).json();
    pairedPhones = (info.devices || []).map((d) => ({ id: d.id, name: d.name }));
  } catch { /* daemon busy — keep what we had */ }
  try {
    const doc = await (await fetch('/api/topic/latest?topic=phone&op=tools')).json();
    const at = Date.parse(doc?.payload?.published_at || doc?.retained_at || '');
    const dev = doc?.payload?.device;
    livePhone = dev?.name && Number.isFinite(at) ? { id: dev.id, name: dev.name, at } : null;
  } catch { /* no topic — no live phone */ }
  renderSourceSwitch();
}

const LIVE_MS = 5 * 60 * 1000;

// The phone reports its own device id on the topic; the Mac's pairing row has
// a different id for the same phone. The name is what both agree on, and what
// the user reads.
const samePhone = (a, b) => !!a && !!b && (a.id === b.id || a.name === b.name);

/** The phone chip's own menu: every paired phone, the live one marked, and a
    way back to "whichever is here". */
function openDeviceMenu(anchor) {
  const chosen = getPhoneDevice();
  const items = pairedPhones.map((d) => ({
    label: `${samePhone(d, chosen) ? '✓ ' : ''}${d.name}`,
    hint: samePhone(d, livePhone)
      ? (Date.now() - livePhone.at < LIVE_MS ? 'Linggen open' : 'last connected here')
      : '',
    run: () => setPhoneDevice(d),
  }));
  if (phoneDevice) items.push({ label: 'Whichever phone is here', run: () => setPhoneDevice(null) });
  openMenu(anchor, items.length ? items : [{ label: 'No phone paired', blocked: 'Pair one in Settings → Phone' }]);
}

export function setSource(next) {
  if (next === source) return;
  source = next;
  try { localStorage.setItem(SOURCE_KEY, next); } catch { /* quota */ }
  renderSourceSwitch();
  renderTabs();
  renderToolbar();
  for (const fn of sourceListeners) fn(next);
}

export function setActiveTab(name) {
  activeTab = name;
  // Opening a one-sided tab moves the switch to the side it serves.
  if (!tabServes(name, source)) setSource(tabSources(name)[0]);
  try { localStorage.setItem(TAB_KEY, name); } catch { /* quota */ }
  for (const tab of document.querySelectorAll('.atab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  applyPanels();
  renderTabs();
  renderSourceSwitch();
  renderToolbar();
  for (const fn of tabListeners) fn(name);
}

// ── source switch ──

function renderSourceSwitch() {
  const el = document.getElementById('source-switch');
  if (!el) return;
  const openFor = menuEl && el.contains(menuEl.anchor) ? menuEl.anchor.dataset.src : null;
  el.innerHTML = SOURCES.map((s) => {
    const info = sourceInfo[s.key];
    // The phone chip names the phone in play, not whatever was paired first.
    const device = s.key === 'phone' ? getPhoneDevice() : null;
    const label = device?.name || info?.label || s.fallback;
    const detail = info?.detail ? `<span class="src-detail">${info.detail}</span>` : '';
    const pick = s.key === 'phone' && pairedPhones.length > 1 && s.key === source
      ? '<span class="src-pick">▾</span>' : '';
    const off = !tabServes(activeTab, s.key);
    const title = off ? (OFF_REASON[s.key] || 'Not available on this tab')
      : s.key === 'phone' && pairedPhones.length > 1
        ? `${label} — click again to pick another phone` : (info?.title || label);
    // `menu-anchor` keeps the document's close-on-click-outside from shutting
    // the picker in the same click that opened it.
    return `<button class="src-btn menu-anchor ${s.key === source ? 'on' : ''}${off ? ' off' : ''}" data-src="${s.key}"
      title="${esc(title)}">${s.icon} <span class="src-label">${esc(label)}</span>${detail}${pick}</button>`;
  }).join('');
  // The chip the open picker hangs off was just replaced; point the menu at
  // the new one so it stays open instead of floating over a dead anchor.
  if (openFor) menuEl.anchor = el.querySelector(`.src-btn[data-src="${openFor}"]`) || menuEl.anchor;
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
  // Only a menu hanging off the toolbar being replaced. A tab that polls
  // re-renders every few seconds, and that used to shut the phone picker — or
  // a row's ⋯ — a moment after it opened.
  if (menuEl && el.contains(menuEl.anchor)) closeMenu();
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

// ── menus (a verb that fans out, e.g. Scan → disk / security / …, and a
//    row's ⋯). One menu open at a time, whoever opened it. ──

let menuEl = null;

export function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}

/** Items: { label, hint?, run, blocked?, danger? }. A second click on the same
    anchor closes it. An anchor outside the verb row carries `.menu-anchor` so
    the click that opens the menu does not also close it. */
export function openMenu(anchor, items) {
  const reopening = menuEl?.anchor === anchor;
  closeMenu();
  if (reopening) return;
  menuEl = document.createElement('div');
  menuEl.className = 'verb-menu';
  menuEl.anchor = anchor;
  for (const item of items) {
    const row = document.createElement('button');
    row.className = `verb-menu-item${item.danger ? ' danger' : ''}`;
    row.innerHTML = `<span>${esc(item.label)}</span>${
      item.hint ? `<span class="verb-menu-hint">${esc(item.hint)}</span>` : ''}`;
    if (item.blocked) { row.disabled = true; row.title = item.blocked; }
    else row.onclick = () => { closeMenu(); item.run?.(); };
    menuEl.appendChild(row);
  }
  document.body.appendChild(menuEl);
  // Below and left-aligned by default; flip up or right-align when that would
  // run off the window (a row's ⋯ sits at the right edge, often near the bottom).
  const r = anchor.getBoundingClientRect();
  const m = menuEl.getBoundingClientRect();
  const top = r.bottom + 4 + m.height > window.innerHeight - 8 ? r.top - 4 - m.height : r.bottom + 4;
  const left = r.left + m.width > window.innerWidth - 8 ? r.right - m.width : r.left;
  menuEl.style.top = `${Math.max(8, top)}px`;
  menuEl.style.left = `${Math.max(8, left)}px`;
}

