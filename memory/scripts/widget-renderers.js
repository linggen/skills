// Widget renderers — one function per widget type.
// Each returns a DOM node. Top bar widgets are compact cards.
// Body widgets are content panels.

import { drawDiskBars, drawDonut } from './charts.js';

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
  return fn(w.data || {});
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
  `;
  return card;
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
  };
  const fn = renderers[w.type];
  if (!fn) {
    console.warn('[sys-doctor] Unknown widget type:', w.type);
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

// ── action-cards ──

function renderActionCards(w) {
  const grid = el('div', 'action-cards-grid');
  for (const item of (w.items || [])) {
    const card = el('div', `action-card ${item.active ? 'active' : ''}`);
    card.innerHTML = `
      <div class="action-preview">
        <div class="action-header">
          ${item.icon ? `<span class="action-icon">${esc(item.icon)}</span>` : ''}
          <span class="action-title">${esc(item.title)}</span>
        </div>
        ${item.description ? `<div class="action-desc">${esc(item.description)}</div>` : ''}
      </div>
      <button class="action-start">${item.active ? 'Start' : 'Start'}</button>
    `;
    const btn = card.querySelector('.action-start');
    const msg = item.message || item.title || item.id;
    btn.addEventListener('click', () => {
      if (window._chatSend) window._chatSend(msg);
    });
    // Clicking the card also triggers
    card.addEventListener('click', (e) => {
      if (e.target === btn) return;
      if (window._chatSend) window._chatSend(msg);
    });
    grid.appendChild(card);
  }
  return grid;
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
  const badge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';
  panel.innerHTML = `<div class="panel-header"><h3>${esc(w.title || '')}</h3>${badge}</div>`;

  const items = w.items || [];
  const maxVal = items[0]?.max || Math.max(...items.map(i => i.value || 0), 1);
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  for (const item of items) {
    const pct = Math.min(100, ((item.value || 0) / maxVal) * 100);
    const color = item.color || 'var(--accent)';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:12px;';
    row.innerHTML = `
      <span style="min-width:140px;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(item.label)}</span>
      <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width 0.6s;"></div>
      </div>
      <span style="min-width:50px;font-weight:600;font-variant-numeric:tabular-nums;">${item.value ?? '--'}${item.unit ? ' ' + esc(item.unit) : ''}</span>
    `;
    container.appendChild(row);
  }
  panel.appendChild(container);
  return panel;
}

// ── table ──

function renderTable(w) {
  const panel = el('div', 'panel');
  const panelBadge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';

  // If the title names a memory file, add per-row edit/delete controls.
  const fileMatch = (w.title || '').match(/(user_info|user_feedback|agent_done_week|agent_done_month|agent_done_year)\.md/);
  const memFile = fileMatch ? fileMatch[0] : null;

  // Split rows into "changes this scan" (badge is +, ~, -) and "all facts"
  // (no change badge — gray or empty). Falls back to a single section when
  // the table isn't a memory-file table.
  const isChangeBadge = (b) => b === '+' || b === '~' || b === '−' || b === '-';
  const changeRows = [];
  const restRows = [];
  (w.rows || []).forEach((row, origIdx) => {
    const badgeCell = row.find(c => c && typeof c === 'object' && ('badge' in c || 'color' in c));
    const badgeText = badgeCell ? (badgeCell.badge || '') : '';
    if (memFile && isChangeBadge(badgeText)) changeRows.push({ row, origIdx });
    else restRows.push({ row, origIdx });
  });

  const renderCells = (row) => row.map(cell => {
    if (cell && typeof cell === 'object' && ('badge' in cell || 'color' in cell)) {
      return `<td class="cell-badge"><span class="label-badge ${esc(cell.color || '')}">${esc(cell.badge || '')}</span></td>`;
    }
    return `<td class="cell-fact">${esc(String(cell ?? ''))}</td>`;
  }).join('');

  const actionCell = memFile
    ? (idx) => `<td class="fact-actions-cell">
        <button class="fact-edit-btn" data-idx="${idx}" title="Edit this fact">✎</button>
        <button class="fact-del-btn" data-idx="${idx}" title="Delete this fact">×</button>
      </td>`
    : () => '';

  const renderRow = ({ row, origIdx }) => `<tr data-idx="${origIdx}">${renderCells(row)}${actionCell(origIdx)}</tr>`;

  const cols = (w.columns || []).map(c => `<th>${esc(c)}</th>`).join('') + (memFile ? '<th></th>' : '');

  let body = '';
  if (memFile && changeRows.length > 0) {
    const changesCount = changeRows.length;
    body += `
      <div class="widget-table-section changes-section">
        <div class="widget-table-section-head">Changes this scan (${changesCount})</div>
        <table class="widget-table"><thead><tr>${cols}</tr></thead>
          <tbody>${changeRows.map(renderRow).join('')}</tbody>
        </table>
      </div>`;
  }
  if (restRows.length > 0) {
    const restCount = restRows.length;
    const headText = memFile && changeRows.length > 0 ? `All facts (${restCount})` : '';
    body += `
      <div class="widget-table-section rest-section">
        ${headText ? `<div class="widget-table-section-head">${esc(headText)}</div>` : ''}
        <div class="widget-table-scroll">
          <table class="widget-table"><thead><tr>${cols}</tr></thead>
            <tbody>${restRows.map(renderRow).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  panel.innerHTML = `
    <div class="panel-header"><h3>${esc(w.title || '')}</h3>${panelBadge}</div>
    ${body}
  `;

  if (memFile) {
    // Delete
    panel.querySelectorAll('.fact-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const row = (w.rows || [])[idx];
        if (!row) return;
        const factText = [...row].reverse().find(c => typeof c === 'string');
        if (!factText) return;
        if (!confirm(`Delete from ${memFile}?\n\n"${factText}"`)) return;
        const tr = btn.closest('tr');
        tr.style.opacity = '0.4';
        tr.style.textDecoration = 'line-through';
        btn.disabled = true;
        if (window._chatSend) {
          window._chatSend(`__DELETE_FACT__|${memFile}|${factText}`);
        }
      });
    });
    // Edit — swap the fact cell for an inline textarea with Save/Cancel.
    panel.querySelectorAll('.fact-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const row = (w.rows || [])[idx];
        if (!row) return;
        const tr = btn.closest('tr');
        if (!tr || tr.classList.contains('editing')) return;
        const factCell = tr.querySelector('.cell-fact');
        const actionsCell = tr.querySelector('.fact-actions-cell');
        if (!factCell || !actionsCell) return;
        const oldText = [...row].reverse().find(c => typeof c === 'string') || '';

        tr.classList.add('editing');
        const origFactHtml = factCell.innerHTML;
        const origActionsHtml = actionsCell.innerHTML;
        factCell.innerHTML = `<textarea class="fact-edit-ta" rows="2">${esc(oldText)}</textarea>`;
        actionsCell.innerHTML = `
          <button class="fact-save-btn" title="Save (⌘↵)">Save</button>
          <button class="fact-cancel-btn" title="Cancel (Esc)">Cancel</button>
        `;
        const ta = factCell.querySelector('.fact-edit-ta');
        const saveBtn = actionsCell.querySelector('.fact-save-btn');
        const cancelBtn = actionsCell.querySelector('.fact-cancel-btn');
        // Auto-grow
        const grow = () => {
          ta.style.height = 'auto';
          ta.style.height = (ta.scrollHeight + 2) + 'px';
        };
        ta.addEventListener('input', grow);
        grow();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);

        const restore = () => {
          factCell.innerHTML = origFactHtml;
          actionsCell.innerHTML = origActionsHtml;
          tr.classList.remove('editing');
          // Re-wire this row's buttons since we reset innerHTML.
          const newEdit = actionsCell.querySelector('.fact-edit-btn');
          const newDel = actionsCell.querySelector('.fact-del-btn');
          if (newEdit) newEdit.addEventListener('click', () => btn.click());
          if (newDel) newDel.addEventListener('click', () => {
            const origDel = panel.querySelector(`.fact-del-btn[data-idx="${idx}"]`);
            if (origDel && origDel !== newDel) return; // already wired
          });
        };
        const doSave = () => {
          const newText = ta.value.trim();
          if (!newText) { restore(); return; }
          if (newText === oldText.trim()) { restore(); return; }
          factCell.innerHTML = esc(newText);
          actionsCell.innerHTML = origActionsHtml;
          tr.classList.remove('editing');
          tr.style.opacity = '0.6';
          if (window._chatSend) {
            window._chatSend(`__EDIT_FACT__|${memFile}|${oldText}|${newText}`);
          }
        };
        const doCancel = () => restore();
        saveBtn.addEventListener('click', doSave);
        cancelBtn.addEventListener('click', doCancel);
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
        });
      });
    });
  }

  return panel;
}

// ── scorecard ──

function renderScorecard(w) {
  const panel = el('div', 'panel');
  const badge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';
  const items = (w.items || []).map(i =>
    `<div class="sec-item">
      <span class="sec-dot ${esc(i.status || 'gray')}"></span>
      <span>${esc(i.label)}</span>
      ${i.detail ? `<span class="sec-detail">— ${esc(i.detail)}</span>` : ''}
    </div>`
  ).join('');
  panel.innerHTML = `
    <div class="panel-header"><h3>${esc(w.title || '')}</h3>${badge}</div>
    <div class="scorecard-grid">${items}</div>
  `;
  return panel;
}

// ── recommendations ──

function renderRecommendations(w) {
  const panel = el('div', 'panel');
  const badge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';
  panel.innerHTML = `<div class="panel-header"><h3>${esc(w.title || '')}</h3>${badge}</div>`;

  const list = el('div', 'rec-list');
  for (const r of (w.items || [])) {
    const item = el('div', 'rec-item');
    item.innerHTML = `
      <div class="rec-header">
        <span class="rec-risk ${esc(r.risk || 'review')}">${esc(r.risk || 'review')}</span>
        <div class="rec-info">
          <div class="rec-title">${esc(r.title)}</div>
          ${r.description ? `<div class="rec-desc">${esc(r.description)}</div>` : ''}
        </div>
        ${r.savings_gb ? `<span class="rec-savings">${fmtGb(r.savings_gb)}</span>` : ''}
      </div>
      ${r.command ? `
        <div class="rec-cmd-block">
          <code class="rec-cmd-code">${esc(r.command)}</code>
          <button class="rec-copy" data-cmd="${esc(r.command)}">Copy</button>
        </div>
      ` : ''}
    `;
    // Copy handler
    const copyBtn = item.querySelector('.rec-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(copyBtn.dataset.cmd).then(() => {
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
  const badge = w.badge ? `<span class="panel-badge">${esc(w.badge)}</span>` : '';
  panel.innerHTML = `<div class="panel-header"><h3>${esc(w.title || '')}</h3>${badge}</div>`;

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
