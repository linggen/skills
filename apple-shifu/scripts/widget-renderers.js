// Widget renderers — one function per widget type.
// Each returns a DOM node. Top bar widgets are compact cards.
// Body widgets are content panels.

import { drawDiskBars, drawDonut } from './charts.js';
import { getScoreHistory } from './health-score.js';
import { copyText, shellPath } from './shifu-io.js';

// ── Helpers ──

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtGb(gb) {
  if (gb == null || isNaN(gb)) return '--';
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (gb >= 0.001) return `${Math.round(gb * 1024)} MB`;
  return '0 MB';
}

function barColor(pct) {
  if (pct > 90) return 'var(--danger)';
  if (pct > 75) return 'var(--warning)';
  return 'var(--accent)';
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// All rescan/scan affordances live in the static tools toolbar in doctor.html.
// We keep `w.action` support so the model can still attach an explicit button
// to a widget if it has a domain-specific reason to (e.g., "View details" on
// a hero card), but we no longer auto-inject by title — that produced
// redundant ↻ Rescan buttons next to the toolbar.
function resolveAction(w) {
  return w.action || null;
}

// Header with title, optional badge, and rescan button (from w.action or auto-resolved).
// Returns the HTML string. Call wireHeaderAction(panel, w) after attaching to DOM.
function panelHeaderHtml(w) {
  const badge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';
  const action = resolveAction(w);
  const actionBtn = action
    ? `<button class="panel-action-btn" type="button" title="${esc(action.label || 'Rescan')}">↻ ${esc(action.label || 'Rescan')}</button>`
    : '';
  return `<div class="panel-header">
    <h3>${esc(w.title || '')}</h3>
    <div class="panel-header-right">${badge}${actionBtn}</div>
  </div>`;
}

function wireHeaderAction(panel, w) {
  const action = resolveAction(w);
  if (!action) return;
  const btn = panel.querySelector('.panel-action-btn');
  if (!btn) return;
  const originalLabel = btn.textContent;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const msg = action.message || action.label || w.title;
    if (!window._chatSend || !msg) return;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = '↻ Scanning…';
    window._chatSend(msg);
    // The button is normally replaced when the widget re-renders.
    // Safety net: if no update arrives in 30s, restore so the button isn't stuck.
    setTimeout(() => {
      if (document.body.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.textContent = originalLabel;
      }
    }, 30000);
  });
}

// ════════════════════════════════════════
// TOP BAR WIDGETS
// ════════════════════════════════════════

export function renderTopBarWidget(w) {
  const renderers = {
    cpu: renderCpuWidget,
    memory: renderMemoryWidget,
    disk: renderDiskWidget,
    battery: renderBatteryWidget,
    network: renderNetworkWidget,
    gpu: renderGpuWidget,
    io: renderIoWidget,
    score: renderScoreWidget,
    custom: renderCustomWidget,
  };
  const fn = renderers[w.widget] || renderCustomWidget;
  const card = fn(w.data || {});
  // The live top row (live.js) finds its cards by widget and keeps the parts
  // that stay the scan's — cycles, the CPU label — from the scan data.
  if (card && renderers[w.widget]) {
    card.dataset.widget = w.widget;
    card._scan = w.data || {};
  }
  return card;
}

function metricCard(label, value, sub, barPct, barClr) {
  const card = el('div', 'card top-bar-card');
  card.innerHTML = `
    <div class="card-label">${esc(label)}</div>
    <div class="card-value" ${barClr && barPct > 75 ? `style="color:${barClr}"` : ''}>${esc(String(value))}</div>
    ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
  `;
  if (barPct != null) {
    const bar = el('div', 'card-bar');
    const fill = el('div', 'card-bar-fill');
    fill.style.width = `${Math.min(100, barPct)}%`;
    fill.style.background = barClr || 'var(--accent)';
    bar.appendChild(fill);
    card.appendChild(bar);
  }
  return card;
}

function renderCpuWidget(d) {
  return metricCard('CPU', `${d.value || 0}%`, d.label || '', d.value, barColor(d.value || 0));
}

function renderMemoryWidget(d) {
  const sub = (d.used != null && d.total != null) ? `${d.used} / ${d.total} GB` : '';
  return metricCard('Memory', `${d.value || 0}%`, sub, d.value, barColor(d.value || 0));
}

function renderDiskWidget(d) {
  const sub = (d.used != null && d.total != null) ? `${d.used} / ${d.total} GB` : '';
  return metricCard('Disk', `${d.value || 0}%`, sub, d.value, barColor(d.value || 0));
}

function renderBatteryWidget(d) {
  const parts = [];
  if (d.cycles) parts.push(`${d.cycles} cycles`);
  if (d.status) parts.push(d.status);
  const clr = (d.value || 0) < 50 ? 'var(--danger)' : (d.value || 0) < 80 ? 'var(--warning)' : 'var(--success)';
  return metricCard('Battery', `${d.value || 0}%`, parts.join(' · '), d.value, clr);
}

function renderNetworkWidget(d) {
  return metricCard('Network', d.wifi || d.iface || 'Connected', d.ip || '');
}

function renderGpuWidget(d) {
  return metricCard('GPU', d.cores ? `${d.cores} cores` : '--', d.metal || d.chipset || '');
}

function renderIoWidget(d) {
  return metricCard('Storage IO', d.mb_per_sec ? `${d.mb_per_sec} MB/s` : '--', d.transfers_per_sec ? `${d.transfers_per_sec} ops/s` : '');
}

function renderScoreWidget(d) {
  const card = el('div', 'card top-bar-card score-card');
  const clr = (d.value || 0) >= 80 ? 'var(--success)' : (d.value || 0) >= 60 ? 'var(--warning)' : 'var(--danger)';
  card.innerHTML = `
    <div class="card-label">Health</div>
    <div class="card-value" style="color:${clr}">${d.value || '--'}</div>
    <div class="card-sub">${esc(d.label || '')}</div>
    ${scoreSparkline(clr)}
  `;
  return card;
}

/** Tiny trend line from the locally persisted score history (free, no LLM). */
function scoreSparkline(color) {
  let history = [];
  try { history = getScoreHistory().slice(-12); } catch { return ''; }
  if (history.length < 2) return '';
  const w = 64, h = 14;
  const scores = history.map((p) => p.score);
  const min = Math.min(...scores), max = Math.max(...scores);
  const span = Math.max(1, max - min);
  const pts = history
    .map((p, i) => `${((i / (history.length - 1)) * w).toFixed(1)},${(h - 2 - ((p.score - min) / span) * (h - 4)).toFixed(1)}`)
    .join(' ');
  return `<svg class="score-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="color:${color}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/></svg>`;
}

function renderCustomWidget(d) {
  const clr = d.color ? `color:var(--${d.color})` : '';
  const card = el('div', 'card top-bar-card');
  card.innerHTML = `
    <div class="card-label">${esc(d.label || '')}</div>
    <div class="card-value" ${clr ? `style="${clr}"` : ''}>${esc(String(d.value || '--'))}</div>
    ${d.sub ? `<div class="card-sub">${esc(d.sub)}</div>` : ''}
  `;
  if (d.bar != null) {
    const bar = el('div', 'card-bar');
    const fill = el('div', 'card-bar-fill');
    fill.style.width = `${Math.min(100, d.bar)}%`;
    fill.style.background = d.color ? `var(--${d.color})` : 'var(--accent)';
    bar.appendChild(fill);
    card.appendChild(bar);
  }
  return card;
}

// ════════════════════════════════════════
// BODY WIDGETS
// ════════════════════════════════════════

export function renderBodyWidget(w) {
  const renderers = {
    'action-cards': renderActionCards,
    'bars': renderBars,
    'table': renderTable,
    'scorecard': renderScorecard,
    'recommendations': renderRecommendations,
    'donut': renderDonut,
    'info': renderInfo,
    'progress': renderProgress,
    'hero': renderHero,
    'report': renderReport,
  };
  const fn = renderers[w.type];
  if (!fn) {
    console.warn('[apple-shifu] Unknown widget type:', w.type);
    return null;
  }
  return fn(w);
}

// ── info ──

function renderInfo(w) {
  const panel = el('div', 'panel widget-info');
  let header = '';
  if (w.icon || w.title) {
    header = `<div class="info-header">
      ${w.icon ? `<span class="info-icon">${esc(w.icon)}</span>` : ''}
      <span class="info-title">${esc(w.title)}</span>
    </div>`;
  }
  const fields = (w.fields || []).map(f =>
    `<div class="info-field">
      <span class="info-label">${esc(f.label)}</span>
      <span class="info-value">${esc(f.value)}</span>
    </div>`
  ).join('');
  panel.innerHTML = `${header}<div class="info-fields">${fields}</div>`;
  return panel;
}

// Static toolbar in doctor.html replaced the action-cards widget. Anything the
// model still emits as `action-cards` is silently dropped — historical cached
// pages keep loading without duplicating the toolbar.
function renderActionCards() {
  return null;
}

// ── progress ──

function renderProgress(w) {
  const panel = el('div', 'panel widget-progress');
  const title = w.title ? `<div class="progress-title">${esc(w.title)}</div>` : '';
  const steps = (w.steps || []).map(s => {
    const cls = s.status === 'done' ? 'done' : s.status === 'active' ? 'active' : '';
    const icon = s.status === 'done' ? '✓' : s.status === 'active' ? '' : '';
    return `<div class="scan-step ${cls}">
      <span class="step-icon">${esc(s.icon || '')}</span>
      <span class="step-label">${esc(s.label)}</span>
      <span class="step-status">${s.status === 'active' ? '<span class="step-spinner"></span>' : icon}</span>
    </div>`;
  }).join('');
  panel.innerHTML = `${title}<div class="scan-steps">${steps}</div>`;
  return panel;
}

// ── bars ──

function renderBars(w) {
  const panel = el('div', 'panel');
  panel.innerHTML = panelHeaderHtml(w);
  wireHeaderAction(panel, w);

  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.display = 'block';
  const items = (w.items || []).map(i => ({ path: i.label, size_gb: i.value }));
  const neededH = items.length * 32 + 24;
  canvas.style.height = `${Math.max(neededH, 80)}px`;
  panel.appendChild(canvas);

  requestAnimationFrame(() => {
    const maxVal = w.items?.[0]?.max || Math.max(...items.map(i => i.size_gb));
    drawDiskBars(canvas, items, maxVal);
  });
  return panel;
}

// ── table ──

// ── the files this page scanned, and the command that removes one ──
//
// A table is written by the model, and it shortens a path to fit ("~/Library/
// …/weights.bin"). A remove command built from that text would name the wrong
// file, so the page keeps the scan's own list and matches a row back to it —
// the same rule the Cleanup card follows: never a command from model text.

let fileIndex = [];   // [{path, size}] from the last deep file scan

export function setFileIndex(files) {
  fileIndex = (files || []).filter((f) => typeof f?.path === 'string');
}

/** The real path a table cell stands for, or null when it can't be pinned
    down. Exact text wins. Otherwise the cell is a path the model shortened —
    it drops middles, and sometimes both ends of a name ("…/…urp-sample….tgz")
    — so the pieces it kept must appear, in order, in exactly one scanned file.
    Two candidates means no button: a command has to name the right file. */
export function resolveFilePath(text, files = fileIndex) {
  const shown = String(text || '').trim();
  if (!shown || !shown.includes('/') || !files.length) return null;
  const exact = files.filter((f) => f.path === shown);
  if (exact.length === 1) return exact[0].path;
  if (!/\.{3}|…/.test(shown)) return null;
  const parts = shown.split(/\.{3,}|…/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const hits = files.filter((f) => {
    if (!f.path.startsWith(parts[0])) return false;
    let at = parts[0].length;
    for (const part of parts.slice(1)) {
      const found = f.path.indexOf(part, at);
      if (found < 0) return false;
      at = found + part.length;
    }
    return true;
  });
  return hits.length === 1 ? hits[0].path : null;
}

/** `mv -i <path> ~/.Trash/` — the Trash, so the file stays recoverable, and
    the path shell-quoted with its `~` expanded. Mirrors removeCommand() in
    files.js. */
export const removeCommand = (path) => `mv -i ${shellPath(path)} ~/.Trash/`;

const COPY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">'
  + '<rect x="5.2" y="2.2" width="8.6" height="10.6" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>'
  + '<path d="M10.6 13.8v.4a1.6 1.6 0 0 1-1.6 1.6H3.8a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6h.4"'
  + ' fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

function renderTable(w) {
  const panel = el('div', 'panel');
  const cols = (w.columns || []).map(c => `<th>${esc(c)}</th>`).join('');
  const rows = (w.rows || []).map(row => {
    const cells = row.map(cell => {
      if (cell && typeof cell === 'object' && cell.badge) {
        return `<td><span class="label-badge ${esc(cell.color || '')}">${esc(cell.badge)}</span></td>`;
      }
      const text = String(cell ?? '');
      const path = resolveFilePath(text);
      if (!path) return `<td>${esc(text)}</td>`;
      return `<td class="tbl-file">${esc(text)}<button class="tbl-copy" type="button"
        title="Copy the Trash command" data-path="${esc(path)}">${COPY_ICON}</button></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  panel.innerHTML = `
    ${panelHeaderHtml(w)}
    <table class="widget-table"><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>
  `;
  for (const btn of panel.querySelectorAll('.tbl-copy')) {
    btn.addEventListener('click', async () => {
      if (!(await copyText(removeCommand(btn.dataset.path)))) return;
      btn.innerHTML = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = COPY_ICON; btn.classList.remove('copied'); }, 1400);
    });
  }
  wireHeaderAction(panel, w);
  return panel;
}

// ── scorecard ──

function renderScorecard(w) {
  const panel = el('div', 'panel');
  const items = (w.items || []).map(i =>
    `<div class="sec-item">
      <span class="sec-dot ${esc(i.status || 'gray')}"></span>
      <span>${esc(i.label)}</span>
      ${i.detail ? `<span class="sec-detail">— ${esc(i.detail)}</span>` : ''}
    </div>`
  ).join('');
  panel.innerHTML = `
    ${panelHeaderHtml(w)}
    <div class="scorecard-grid">${items}</div>
  `;
  wireHeaderAction(panel, w);
  return panel;
}

// ── recommendations ──

// The commands a Cleanup card offers, keyed by the item's `id`. The agent
// picks which items to show; the page writes what gets pasted into Terminal.
// A command someone runs as-is is one typo in a path away from deleting the
// wrong folder, so it never comes from model text. The risk is fixed here too,
// so the same cache reads SAFE on this card and on the Files tab.
const CLEANUP_COMMANDS = {
  'library-caches': {
    risk: 'safe',
    command: 'rm -rf ~/Library/Caches/*',
    note: 'Quit your apps first. They rebuild these on next launch.',
  },
  'xcode-derived-data': {
    risk: 'safe',
    command: 'rm -rf ~/Library/Developer/Xcode/DerivedData',
    note: 'Xcode rebuilds it on the next build.',
  },
  'ios-simulators': {
    risk: 'review',
    command: 'xcrun simctl shutdown all && xcrun simctl erase all',
    note: 'Wipes the apps and data inside every simulator. The simulators stay.',
  },
  'npm-cache': {
    risk: 'safe',
    command: 'npm cache clean --force',
    note: 'npm downloads packages again when a project needs them.',
  },
  'empty-trash': {
    risk: 'review',
    command: 'osascript -e \'tell application "Finder" to empty trash\'',
    note: 'Permanent. Look through the Trash first.',
  },
};

// The one shape of command the agent may still write itself: moving an app to
// the Trash, which stays recoverable (Apps to Review).
const AGENT_COMMAND = /^mv -i "\/Applications\/[^"]+\.app" ~\/\.Trash\/$/;

function cleanupEntry(r) {
  const known = CLEANUP_COMMANDS[r.id];
  if (known) return known;
  const agent = typeof r.command === 'string' && AGENT_COMMAND.test(r.command) ? r.command : null;
  return { risk: r.risk || 'review', command: agent, note: null };
}

function renderRecommendations(w) {
  const panel = el('div', 'panel');
  panel.innerHTML = panelHeaderHtml(w);
  wireHeaderAction(panel, w);

  const list = el('div', 'rec-list');
  for (const r of (w.items || [])) {
    const item = el('div', 'rec-item');
    const { risk, command, note } = cleanupEntry(r);
    item.innerHTML = `
      <div class="rec-header">
        <span class="rec-risk ${esc(risk)}">${esc(risk)}</span>
        <div class="rec-info">
          <div class="rec-title">${esc(r.title)}</div>
          ${r.description ? `<div class="rec-desc">${esc(r.description)}</div>` : ''}
        </div>
        ${r.savings_gb ? `<span class="rec-savings">${fmtGb(r.savings_gb)}</span>` : ''}
      </div>
      ${command ? `
        <div class="rec-cmd-block">
          <code class="rec-cmd-code">${esc(command)}</code>
          <button class="rec-copy" type="button">Copy</button>
        </div>
        ${note ? `<div class="rec-cmd-note">${esc(note)}</div>` : ''}
      ` : ''}
    `;
    // Close over the command directly — avoids HTML-attribute escaping
    // pitfalls. esc() doesn't escape `"`, so commands containing quoted
    // paths (e.g. `mv -i "/Applications/Foo.app" ~/.Trash/`) used to break
    // a data-cmd attribute mid-value.
    const copyBtn = item.querySelector('.rec-copy');
    if (copyBtn && command) {
      const cmd = command;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(cmd).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1500);
        });
      });
    }
    list.appendChild(item);
  }
  panel.appendChild(list);
  return panel;
}

// ── donut ──

function renderDonut(w) {
  const panel = el('div', 'panel');
  panel.innerHTML = panelHeaderHtml(w);
  wireHeaderAction(panel, w);

  const wrap = el('div', 'donut-wrap');
  const canvas = document.createElement('canvas');
  canvas.width = 280;
  canvas.height = 280;
  canvas.className = 'donut-canvas';
  wrap.appendChild(canvas);

  const legend = el('div', 'donut-legend');
  const legendHtml = (w.items || []).map(item => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${esc(item.color || '#6366f1')}"></span>
      <span>${esc(item.label)}</span>
      <span class="legend-size">${fmtGb(item.value)}</span>
    </div>
  `).join('');
  legend.innerHTML = legendHtml;
  wrap.appendChild(legend);
  panel.appendChild(wrap);

  // Draw donut after DOM insertion
  requestAnimationFrame(() => drawDonut(canvas, w.items || []));
  return panel;
}

// ── report ──
//
// Generic structured-info card. Sections of labeled key/value rows with
// optional source links. Used by Buyer's Guide; reusable for future features
// (Subscriptions Audit, Backup Status, Software Inventory, etc.).
//
// Schema:
//   { type: 'report', icon?, title, badge?, action?,
//     sections: [
//       { title, subtitle?, items: [{ label?, value?, link? }] }
//     ] }

function renderReport(w) {
  const panel = el('div', 'panel widget-report');

  // Custom header — like panelHeaderHtml but supports an icon prefix on the title.
  const badge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';
  const action = resolveAction(w);
  const actionLabel = action?.label || 'Refresh';
  const actionBtn = action
    ? `<button class="panel-action-btn" type="button" title="${esc(actionLabel)}">↻ ${esc(actionLabel)}</button>`
    : '';
  const iconHtml = w.icon ? `<span class="report-icon">${esc(w.icon)}</span> ` : '';
  panel.innerHTML = `
    <div class="panel-header">
      <h3>${iconHtml}${esc(w.title || '')}</h3>
      <div class="panel-header-right">${badge}${actionBtn}</div>
    </div>
  `;
  wireHeaderAction(panel, w);

  const wrap = el('div', 'report-sections');
  for (const section of (w.sections || [])) {
    wrap.appendChild(renderReportSection(section));
  }
  panel.appendChild(wrap);
  return panel;
}

function renderReportSection(section) {
  const sec = el('div', 'report-section');
  const subtitle = section.subtitle
    ? `<span class="report-section-subtitle">${esc(section.subtitle)}</span>`
    : '';
  sec.innerHTML = `
    <div class="report-section-header">
      <h4 class="report-section-title">${esc(section.title || '')}</h4>
      ${subtitle}
    </div>
  `;
  const list = el('div', 'report-items');
  for (const item of (section.items || [])) {
    list.appendChild(renderReportItem(item));
  }
  sec.appendChild(list);
  return sec;
}

function renderReportItem(item) {
  const row = el('div', 'report-item');
  const label = item.label
    ? `<span class="report-item-label">${esc(item.label)}</span>`
    : '';
  const value = item.value != null && item.value !== ''
    ? `<span class="report-item-value">${esc(String(item.value))}</span>`
    : '';
  const link = item.link
    ? `<a class="report-item-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">↗</a>`
    : '';
  row.innerHTML = `${label}${value}${link}`;
  return row;
}

// ── hero ──

function renderHero(w) {
  const card = el('div', 'panel widget-hero');
  card.innerHTML = `
    <div class="hero-header">
      ${w.icon ? `<span class="hero-icon">${esc(w.icon)}</span>` : ''}
      <span class="hero-title">${esc(w.title)}</span>
    </div>
    <div class="hero-body">${esc(w.body || '')}</div>
    ${w.cta ? `<button class="hero-cta">${esc(w.cta.label)}</button>` : ''}
  `;
  if (w.cta) {
    const btn = card.querySelector('.hero-cta');
    btn.addEventListener('click', () => {
      if (window._chatSend) window._chatSend(w.cta.message || w.cta.label);
    });
  }
  return card;
}
