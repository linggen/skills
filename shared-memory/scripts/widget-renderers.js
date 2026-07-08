// Widget renderers — one function per widget type.
// Each returns a DOM node. Top bar widgets are compact cards.
// Body widgets are content panels.

// Linggen route that dispatches a named capability tool against the
// skill's declared HTTP endpoint. Same code path the agent uses, just
// invoked by the webpage via a regular fetch. Works in local and
// remote (WebRTC) mode because /apps/* is proxied by fetchProxy.

// In-page confirm — window.confirm is a silent no-op inside the app shell
// (its WKWebView implements no confirm panel: returns false, no dialog),
// so render a tiny modal instead. Works identically in the browser.
function confirmDialog(message) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#1e293b;border-radius:12px;padding:16px;width:320px;max-width:90vw;font:13px/1.5 -apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.2);';
    if (matchMedia('(prefers-color-scheme: dark)').matches) { card.style.background = '#1c1c1c'; card.style.color = '#e2e8f0'; }
    const msg = document.createElement('div');
    msg.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
    msg.textContent = message;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';
    const done = (ok) => { ov.remove(); resolve(ok); };
    const mk = (label, ok, style) => {
      const b = document.createElement('button');
      b.textContent = label; b.style.cssText = style; b.onclick = () => done(ok);
      return b;
    };
    row.append(
      mk('Cancel', false, 'padding:6px 12px;border-radius:8px;border:0;background:transparent;color:inherit;font-weight:600;cursor:pointer;'),
      mk('OK', true, 'padding:6px 12px;border-radius:8px;border:0;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;'),
    );
    card.append(msg, row);
    ov.append(card);
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    document.body.append(ov);
  });
}

const MEM_CAP_URL = (tool) => `/apps/memory/capability/${tool}`;

// ── Helpers ──

async function callMemoryTool(tool, args) {
  const resp = await fetch(MEM_CAP_URL(tool), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`);
  return resp.json();
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
//
// The memory dashboard only uses `widget: "custom"` cards (one per
// bucket). Any other `widget:` value falls back to the same renderer —
// unknown top-bar types are treated as custom data.

export function renderTopBarWidget(w) {
  return renderCustomWidget(w.data || {});
}

function renderCustomWidget(d) {
  const clr = d.color ? `color:var(--${d.color})` : '';
  const card = el('div', 'card top-bar-card');
  card.innerHTML = `
    <div class="card-label">${esc(d.label || '')}</div>
    <div class="card-value" ${clr ? `style="${clr}"` : ''}>${esc(d.value == null ? '--' : String(d.value))}</div>
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
    'greeting': renderGreeting,
    'fact-list': renderFactList,
    'checklist': renderChecklist,
    'cta': renderCta,
    'action-cards': renderActionCards,
    'bars': renderBars,
    'table': renderTable,
    'scorecard': renderScorecard,
    'info': renderInfo,
    'progress': renderProgress,
    'dream-calendar': renderDreamCalendar,
    'dream-report': renderDreamReport,
  };
  const fn = renderers[w.type];
  if (!fn) {
    console.warn('[memory] Unknown widget type:', w.type);
    return null;
  }
  return fn(w);
}

// ── dream-calendar ──
//
// Apple-Calendar-style month grid of dream-pipeline state. Sun→Sat
// columns, big day cells, today as a red circle, prev/Today/next month
// nav. Each day shows ONE badge — the furthest pipeline stage reached
// (the stages are sequential, so the latest one *is* the state):
//
//   pending    amber, "<n> pending"  — rows await a remember pass
//   remembered green,  "✓ <k>"       — judged; short-term rows remain
//   forgotten  faded,  "✓"           — judged; short-term aged out
//   today      ring + "<n> staged"   — accumulating, not dreamable yet
//
// Clicking a past day opens a small popover with the day's detail and
// a "Dream this day" action (the confirm step — a misclick never burns
// tokens). Built by memory-app.js `buildDreamCalendar()` from the
// daemon's `days` rollup — the single source of truth; no local files.
//
// Shape:
//   { "type": "dream-calendar", "title": "Dream activity",
//     "days": { "2026-07-01": { date, state, rows, unjudged, past_ttl,
//                remembered_at, judged, promoted, forgotten }, ... } }

const DCAL_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DCAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function dcalStartOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dcalAddDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function dcalIso(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// The single state badge for a day cell — used only for TODAY (past
// days render the scan/dream controls instead).
function dcalStateBadge(rec) {
  if (!rec) return null;
  if (rec.state === 'today' && rec.rows > 0) {
    return el('div', 'dcal-chip dcal-chip-staging', `${rec.rows} staged`);
  }
  return null;
}

function dcalAgo(iso) {
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Arm-to-confirm button: first click arms ("scan" → "scan?"), second
// click fires. A stray click never burns tokens; auto-disarms in 3s.
function dcalArmButton(label, title, onFire) {
  const btn = el('button', 'dcal-act', label);
  btn.title = title;
  let armed = null;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (armed) {
      clearTimeout(armed);
      armed = null;
      btn.classList.remove('dcal-armed');
      btn.textContent = label;
      onFire(btn);
      return;
    }
    btn.classList.add('dcal-armed');
    btn.textContent = `${label}?`;
    armed = setTimeout(() => {
      armed = null;
      btn.classList.remove('dcal-armed');
      btn.textContent = label;
    }, 3000);
  });
  return btn;
}

// Kick a day-scoped dream mission run and poll the rollup while it
// works (the mission runs in its own session, so this page gets no
// tool stream from it).
async function dcalTriggerDream(day, btn) {
  btn.disabled = true;
  btn.textContent = 'dreaming…';
  try {
    const res = await fetch('/api/missions/dream/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day }),
    });
    if (res.status === 409) {
      btn.textContent = 'dream running…';
      setTimeout(() => { btn.disabled = false; btn.textContent = 'dream'; }, 5000);
      return;
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'dream';
    return;
  }
  if (window._refreshDreamCalendar) {
    let ticks = 0;
    const timer = setInterval(async () => {
      ticks += 1;
      await window._refreshDreamCalendar();
      if (ticks >= 36) clearInterval(timer); // ~3 min of 5s polls
    }, 5000);
  }
}

// The two per-day controls — `scan | scanned` and `dream | dreamed`.
// Buttons act on THIS day; states come straight from the rollup.
function dcalDayControls(iso, rec) {
  const wrap = el('div', 'dcal-acts');

  if (rec?.harvested_at) {
    const chip = el('div', 'dcal-chip dcal-chip-scanned', 'scanned ✓');
    chip.title = `${iso} · scanned ${dcalAgo(rec.harvested_at)} — this day's session logs were walked and staged.`;
    wrap.appendChild(chip);
  } else {
    wrap.appendChild(dcalArmButton(
      'scan',
      `Walk ${iso}'s session logs (Claude Code, Codex, Linggen) and stage facts not yet in memory. Sessions that already contributed rows are skipped, so this is safe even when live capture was on.`,
      () => { if (window._chatSend) window._chatSend(`/shared-memory scan ${iso}`); },
    ));
  }

  const unjudged = rec?.unjudged || 0;
  if (unjudged > 0) {
    wrap.appendChild(dcalArmButton(
      `dream (${unjudged})`,
      `Run the dream mission scoped to ${iso}: judge its ${unjudged} staged rows — promote durable facts to long-term memory, stamp the day, then evict expired short-term rows.`,
      (btn) => dcalTriggerDream(iso, btn),
    ));
  } else if (rec?.remembered_at) {
    const chip = el('div', 'dcal-chip dcal-chip-remembered',
      `dreamed ✓ ${rec.judged || 0}·${rec.promoted || 0}`);
    chip.title = `${iso} · dreamed ${dcalAgo(rec.remembered_at)} — ${rec.judged || 0} judged, ${rec.promoted || 0} promoted to long-term${rec.forgotten ? `, ${rec.forgotten} aged out` : ''}.`;
    wrap.appendChild(chip);
  } else {
    const dim = el('div', 'dcal-chip dcal-chip-dim', 'dream');
    dim.title = `${iso} · nothing staged to dream — scan first if you worked this day.`;
    wrap.appendChild(dim);
  }

  return wrap;
}

function dcalTooltip(iso, rec) {
  if (!rec) return `${iso} · no memory activity`;
  switch (rec.state) {
    case 'pending':
      return `${iso} · pending · ${rec.unjudged}/${rec.rows} rows to judge — click for details`;
    case 'remembered':
      return `${iso} · remembered · ${rec.promoted} promoted · ${rec.rows} short-term rows kept`;
    case 'forgotten':
      return `${iso} · remembered ${rec.promoted ? `(${rec.promoted} promoted)` : ''} · short-term aged out`;
    case 'today':
      return `${iso} · today · ${rec.rows} rows staging — dreamable after midnight`;
    default:
      return `${iso} · ${rec.state}`;
  }
}

// Day-detail popover — the confirm step between click and LLM run.
// One popover at a time, dismissed on outside click / Esc / ✕.
function dcalOpenPopover(anchorCell, iso, rec, todayIso) {
  document.querySelectorAll('.dcal-pop').forEach((p) => p.remove());

  const pop = el('div', 'dcal-pop');
  pop.appendChild(el('div', 'dcal-pop-date', iso));

  const state = rec?.state || 'empty';
  const lines = [];
  if (!rec || (!rec.rows && !rec.remembered_at)) {
    lines.push('No memory activity on this day.');
  } else if (state === 'pending') {
    lines.push(`${rec.unjudged} of ${rec.rows} rows await judgment.`);
    if (rec.remembered_at) lines.push('New rows arrived after the last remember.');
  } else if (state === 'remembered') {
    lines.push(`Remembered — ${rec.promoted} promoted, ${rec.rows} short-term rows kept.`);
  } else if (state === 'forgotten') {
    lines.push(`Remembered — ${rec.promoted} promoted, ${rec.forgotten} aged out.`);
  } else if (state === 'today') {
    lines.push(`${rec.rows} rows staging today. Dreamable after midnight.`);
  }
  for (const t of lines) pop.appendChild(el('div', 'dcal-pop-line', t));

  // Detail-only: the scan/dream buttons on the cell own the actions.
  const actions = el('div', 'dcal-pop-actions');
  const close = el('button', 'dcal-pop-btn', 'Close');
  close.addEventListener('click', () => pop.remove());
  actions.appendChild(close);
  pop.appendChild(actions);

  anchorCell.appendChild(pop);
  // Dismiss on outside click (deferred so this click doesn't self-dismiss).
  setTimeout(() => {
    const onDoc = (e) => {
      if (!pop.contains(e.target)) {
        pop.remove();
        document.removeEventListener('click', onDoc, true);
      }
    };
    document.addEventListener('click', onDoc, true);
  }, 0);
}

function renderDreamCalendar(w) {
  const days = w.days || {};
  const today = dcalStartOfDay(new Date());
  const todayIso = dcalIso(today);
  // View state — first of the month currently shown (starts on today's).
  let view = new Date(today.getFullYear(), today.getMonth(), 1);

  const panel = el('div', 'widget-dream-cal');

  function build() {
    panel.innerHTML = '';

    // Header: "May 2026" + prev / Today / next.
    const head = el('div', 'dcal-head');
    head.appendChild(el('div', 'dcal-title',
      `<strong>${DCAL_MONTHS[view.getMonth()]}</strong> ${view.getFullYear()}`));
    const nav = el('div', 'dcal-nav');
    const prev = el('button', 'dcal-navbtn', '‹');
    const todayBtn = el('button', 'dcal-todaybtn', 'Today');
    const next = el('button', 'dcal-navbtn', '›');
    prev.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); build(); });
    next.addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); build(); });
    todayBtn.addEventListener('click', () => { view = new Date(today.getFullYear(), today.getMonth(), 1); build(); });
    nav.append(prev, todayBtn, next);
    head.appendChild(nav);
    panel.appendChild(head);

    // Weekday header (Sun → Sat).
    const wd = el('div', 'dcal-weekdays');
    DCAL_DOW.forEach((name) => wd.appendChild(el('div', 'dcal-wd', name)));
    panel.appendChild(wd);

    // Grid: from the Sunday on/before the 1st, covering whole weeks.
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startOffset = first.getDay();               // Sun = 0
    const gridStart = dcalAddDays(first, -startOffset);
    const lastDate = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((startOffset + lastDate) / 7);

    const grid = el('div', 'dcal-grid');
    grid.style.gridTemplateRows = `repeat(${weeks}, 1fr)`;
    for (let i = 0; i < weeks * 7; i++) {
      const date = dcalAddDays(gridStart, i);
      const iso = dcalIso(date);
      const inMonth = date.getMonth() === view.getMonth();
      const isFuture = date > today;
      const rec = days[iso];

      const cell = el('div', 'dcal-cell');
      if (!inMonth) cell.classList.add('dcal-out');
      if (rec?.state) cell.classList.add(`dcal-state-${rec.state}`);

      const num = el('div', 'dcal-num', String(date.getDate()));
      if (iso === todayIso) num.classList.add('dcal-today-num');
      cell.appendChild(num);

      if (iso === todayIso) {
        // Today only stages; it becomes scannable/dreamable after
        // midnight. Show the staging count, no controls.
        const badge = dcalStateBadge(rec);
        if (badge) {
          const chips = el('div', 'dcal-chips');
          chips.appendChild(badge);
          cell.appendChild(chips);
        }
        cell.title = dcalTooltip(iso, rec);
      } else if (isFuture) {
        cell.classList.add('dcal-future');
      } else {
        cell.appendChild(dcalDayControls(iso, rec));
        cell.classList.add('dcal-clickable');
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          dcalOpenPopover(cell, iso, rec, todayIso);
        });
      }
      grid.appendChild(cell);
    }
    panel.appendChild(grid);

    // Legend — the two functions at a glance.
    const hint = el('div', 'dcal-hint');
    hint.innerHTML = `<strong>scan</strong> stages a day's session logs · `
      + `<strong>dream</strong> judges staged rows &amp; sweeps expired · `
      + `hover a button for details, click twice to run`;
    panel.appendChild(hint);
  }

  build();
  return panel;
}

// ── dream-report ──
//
// Report card emitted by the dream's Phase 4 PageUpdate. Summarizes the
// scan + consolidation run above the per-record fact-lists. The webview
// auto-appends a refreshed dream-calendar after this widget (see
// memory-app.js `refreshCalendarAfterReport`), so the report does NOT
// include the calendar itself.
//
// Shape:
//   { "type": "dream-report",
//     "title": "Dream complete — 8 new memories",
//     "window": "2026-05-27", "elapsed_s": 152,
//     "scan": { "sessions": 5, "from": "2026-05-27", "to": "2026-05-27" },
//     "encoded": { "core": 0, "semantic": 8, "episodic": 0 },
//     "promoted": 1, "evicted": 1, "dropped": 3 }

function renderDreamReport(w) {
  const panel = el('div', 'widget-dream-report');
  const scan = w.scan || {};
  const enc = w.encoded || {};

  const scanBits = [];
  if (scan.sessions != null) scanBits.push(`${scan.sessions} session${scan.sessions === 1 ? '' : 's'}`);
  if (w.window) scanBits.push(`window ${w.window}`);
  if (scan.from && scan.to) scanBits.push(scan.from === scan.to ? scan.from : `${scan.from} → ${scan.to}`);
  if (w.elapsed_s != null) scanBits.push(`${w.elapsed_s}s`);

  const encBits = [`core ${enc.core || 0}`, `semantic ${enc.semantic || 0}`, `episodic ${enc.episodic || 0}`];

  const consBits = [];
  if (w.promoted != null) consBits.push(`↑ ${w.promoted} promoted`);
  if (w.evicted != null) consBits.push(`− ${w.evicted} evicted`);
  if (w.dropped != null) consBits.push(`${w.dropped} dropped`);

  const statRow = (label, bits) => bits.length
    ? `<div class="drep-stat"><span class="drep-label">${esc(label)}</span><span class="drep-val">${bits.map(esc).join(' · ')}</span></div>`
    : '';

  panel.innerHTML = `
    <div class="drep-head">
      <span class="drep-icon">🧠</span>
      <div class="drep-title">${esc(w.title || 'Dream complete')}</div>
    </div>
    <div class="drep-stats">
      ${statRow('Scanned', scanBits)}
      ${statRow('Encoded', encBits)}
      ${statRow('Consolidated', consBits)}
    </div>`;
  return panel;
}

// ── greeting ──
//
// Hero for State 1/2/4 — agent speaking directly to the user plus inline
// action buttons. Replaces the older "info card + action-cards + CTA"
// triad with a single compact header.
//
// Shape:
//   { "type": "greeting",
//     "icon": "🧠",
//     "title": "Here's what I know about you.",
//     "stats": "42 RAG facts · 5 core bullets · last hippocampus 3h ago, +8 facts",
//     "actions": [
//       { "label": "Run hippocampus", "icon": "🧠", "message": "/shared-memory dream", "kind": "primary" },
//       { "label": "Week",            "message": "/shared-memory dream week" },
//       { "label": "Clean", "icon": "🧹", "message": "Analyze and clean" }
//     ] }

function renderGreeting(w) {
  const panel = el('div', 'widget-greeting');
  const iconHtml = w.icon ? `<span class="greeting-icon">${esc(w.icon)}</span>` : '';
  const titleHtml = w.title ? `<h2 class="greeting-title">${esc(w.title)}</h2>` : '';
  const statsHtml = w.stats ? `<div class="greeting-stats">${esc(w.stats)}</div>` : '';

  const actions = Array.isArray(w.actions) ? w.actions : [];
  const actionsHtml = actions.length ? `<div class="greeting-actions">${actions.map((a, i) => {
    const classes = ['greeting-action'];
    if (a.kind === 'primary') classes.push('primary');
    const iconSpan = a.icon ? `<span class="greeting-action-icon">${esc(a.icon)}</span>` : '';
    return `<button class="${classes.join(' ')}" data-idx="${i}">${iconSpan}${esc(a.label || '')}</button>`;
  }).join('')
    }</div>` : '';

  panel.innerHTML = `
    <div class="greeting-body">
      ${iconHtml}
      <div class="greeting-content">${titleHtml}${statsHtml}</div>
    </div>
    ${actionsHtml}
  `;

  panel.querySelectorAll('.greeting-action').forEach(btn => {
    const idx = parseInt(btn.dataset.idx, 10);
    const a = actions[idx];
    btn.addEventListener('click', () => {
      if (!a) return;
      // href wins — open in a new tab, don't send a chat message. Used for
      // the "Browse all" link to the daemon's data browser.
      if (a.href) { window.open(a.href, '_blank', 'noopener'); return; }
      if (!window._chatSend) return;
      window._chatSend(a.message || a.label || '');
    });
  });

  return panel;
}

// ── fact-list ──
//
// A list of memory rows with per-row ✎/× affordances. Works for both core
// files (identity.md / style.md, edited via /api/memory/fact) and RAG
// rows (edited agent-mediated via _chatSend).
//
// Shape:
//   { "type": "fact-list",
//     "title": "IDENTITY",       // shown UPPERCASE
//     "meta": "core · identity.md",
//     "count": 3,
//     "source": "identity.md" | "style.md" | "rag:<type>" | "rag:mixed",
//     "actions": ["edit", "delete"],       // ["edit"], ["delete"], or [] OK
//     "items": [
//       { "id": "<uuid, rag only>",
//         "content": "<example fact content>",
//         "context": "code/linggen",       // optional
//         "added": "2d ago",                // optional
//         "badge": "+" | "~" | "−" | null   // optional, for report state
//       }
//     ] }

function renderFactList(w) {
  const panel = el('div', 'widget-fact-list');
  const source = w.source || 'unknown';
  const isCore = source === 'identity.md' || source === 'style.md';
  const isRag = source.startsWith('rag:');
  const ragType = isRag ? source.slice(4) : null;
  const actions = Array.isArray(w.actions) ? w.actions : ['edit', 'delete'];
  const canEdit = actions.includes('edit');
  const canDelete = actions.includes('delete');

  const headerHtml = (w.title || w.meta) ? `
    <div class="fact-list-header">
      ${w.title ? `<div class="fact-list-title"><strong>${esc(w.title)}</strong>${w.count != null ? `<span class="fact-list-count">(${esc(String(w.count))})</span>` : ''
      }</div>` : ''}
      ${w.meta ? `<div class="fact-list-meta">${esc(w.meta)}</div>` : ''}
    </div>
  ` : '';

  const items = Array.isArray(w.items) ? w.items : [];
  const itemsHtml = items.map((item, idx) => {
    const badgeChar = item.badge || '';
    const badgeClass = badgeChar === '+' ? 'badge-plus'
      : badgeChar === '~' ? 'badge-tilde'
        : (badgeChar === '−' || badgeChar === '-') ? 'badge-minus'
          : '';
    const badgeHtml = badgeChar ? `<span class="fact-badge ${badgeClass}">${esc(badgeChar)}</span>` : '<span class="fact-badge-spacer"></span>';

    const metaBits = [];
    if (item.context) metaBits.push(`<span class="fact-context">${esc(item.context)}</span>`);
    if (item.added) metaBits.push(`<span class="fact-added">${esc(item.added)}</span>`);
    const metaHtml = metaBits.length ? `<div class="fact-meta">${metaBits.join('')}</div>` : '';

    // Only show ✎/× on rows with a modifiable source (not on "... +N more" placeholders)
    const rowHasId = (isRag && item.id) || isCore;
    const actionsHtml = (rowHasId && (canEdit || canDelete)) ? `
      <div class="fact-actions">
        ${canEdit ? '<button class="fact-btn fact-edit"   title="Edit">✎</button>' : ''}
        ${canDelete ? '<button class="fact-btn fact-delete" title="Delete">×</button>' : ''}
      </div>
    ` : '';

    return `
      <div class="fact-row" data-idx="${idx}">
        ${badgeHtml}
        <div class="fact-content-wrap">
          <div class="fact-content">${esc(item.content || '')}</div>
          ${metaHtml}
        </div>
        ${actionsHtml}
      </div>
    `;
  }).join('');

  panel.innerHTML = `${headerHtml}<div class="fact-list-body">${itemsHtml || '<div class="fact-list-empty">Empty</div>'}</div>`;

  panel.querySelectorAll('.fact-delete').forEach(btn => {
    const row = btn.closest('.fact-row');
    const idx = parseInt(row.dataset.idx, 10);
    btn.addEventListener('click', () => handleFactDelete(source, isCore, isRag, ragType, items[idx], row, btn));
  });
  panel.querySelectorAll('.fact-edit').forEach(btn => {
    const row = btn.closest('.fact-row');
    const idx = parseInt(row.dataset.idx, 10);
    btn.addEventListener('click', () => handleFactEdit(source, isCore, isRag, ragType, items[idx], row));
  });

  return panel;
}

async function handleFactDelete(source, isCore, isRag, ragType, item, row, btn) {
  if (!item) return;
  const what = isCore ? source : `RAG ${ragType}`;
  if (!(await confirmDialog(`Delete from ${what}?\n\n"${item.content}"`))) return;
  row.style.opacity = '0.4';
  btn.disabled = true;

  try {
    if (isCore) {
      // Agent-mediated: the agent owns writes to identity.md / style.md via
      // Edit/Write. Sending a message keeps that contract — no direct file
      // writes from the webpage, no markdown-parsing server endpoint to keep
      // in sync with the engine.
      if (!window._chatSend) throw new Error('Chat bridge unavailable.');
      window._chatSend(`Delete this bullet from ${source} and re-render the dashboard:\n\n"${item.content}"`);
      row.style.opacity = '0.6';
    } else if (isRag && item.id) {
      // Direct capability dispatch — no LLM roundtrip.
      await callMemoryTool('Memory_write', { verb: 'delete', id: item.id });
      row.remove();
    } else {
      throw new Error('Row has no identifier to delete by.');
    }
  } catch (e) {
    row.style.opacity = '1';
    btn.disabled = false;
    alert(`Delete failed: ${e.message || e}`);
  }
}

function handleFactEdit(source, isCore, isRag, ragType, item, row) {
  if (!item || row.classList.contains('editing')) return;

  const contentEl = row.querySelector('.fact-content');
  const actionsEl = row.querySelector('.fact-actions');
  if (!contentEl) return;

  const origContentHtml = contentEl.innerHTML;
  const origActionsHtml = actionsEl ? actionsEl.innerHTML : '';
  const oldText = (item.content || '').trim();

  row.classList.add('editing');
  contentEl.innerHTML = `<textarea class="fact-edit-ta" rows="2">${esc(item.content || '')}</textarea>`;
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="fact-btn fact-save"   title="Save (⌘↵)">Save</button>
      <button class="fact-btn fact-cancel" title="Cancel (Esc)">Cancel</button>
    `;
  }

  const ta = contentEl.querySelector('.fact-edit-ta');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; };
  ta.addEventListener('input', grow);
  grow();
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  const restore = () => {
    contentEl.innerHTML = origContentHtml;
    if (actionsEl) actionsEl.innerHTML = origActionsHtml;
    row.classList.remove('editing');
    if (actionsEl) {
      const newEdit = actionsEl.querySelector('.fact-edit');
      const newDel = actionsEl.querySelector('.fact-delete');
      if (newEdit) newEdit.addEventListener('click', () => handleFactEdit(source, isCore, isRag, ragType, item, row));
      if (newDel) newDel.addEventListener('click', () => handleFactDelete(source, isCore, isRag, ragType, item, row, newDel));
    }
  };

  const doSave = async () => {
    const newText = ta.value.trim();
    if (!newText) { restore(); return; }
    if (newText === oldText) { restore(); return; }
    row.style.opacity = '0.6';

    try {
      if (isCore) {
        // Agent-mediated (see handleFactDelete for the rationale).
        if (!window._chatSend) throw new Error('Chat bridge unavailable.');
        window._chatSend(`In ${source}, replace this bullet:\n\n"${item.content}"\n\nwith:\n\n"${newText}"\n\nThen re-render the dashboard.`);
        // Optimistic update so the row stays interactive until the
        // agent re-emits PageUpdate.
        contentEl.innerHTML = esc(newText);
        if (actionsEl) actionsEl.innerHTML = origActionsHtml;
        row.classList.remove('editing');
        row.style.opacity = '1';
        item.content = newText;
        if (actionsEl) {
          const e2 = actionsEl.querySelector('.fact-edit');
          const d2 = actionsEl.querySelector('.fact-delete');
          if (e2) e2.addEventListener('click', () => handleFactEdit(source, isCore, isRag, ragType, item, row));
          if (d2) d2.addEventListener('click', () => handleFactDelete(source, isCore, isRag, ragType, item, row, d2));
        }
      } else if (isRag && item.id) {
        // Direct capability dispatch — no LLM roundtrip.
        await callMemoryTool('Memory_write', { verb: 'update', id: item.id, content: newText });
        contentEl.innerHTML = esc(newText);
        if (actionsEl) actionsEl.innerHTML = origActionsHtml;
        row.classList.remove('editing');
        row.style.opacity = '1';
        item.content = newText;
        if (actionsEl) {
          const e2 = actionsEl.querySelector('.fact-edit');
          const d2 = actionsEl.querySelector('.fact-delete');
          if (e2) e2.addEventListener('click', () => handleFactEdit(source, isCore, isRag, ragType, item, row));
          if (d2) d2.addEventListener('click', () => handleFactDelete(source, isCore, isRag, ragType, item, row, d2));
        }
      } else {
        throw new Error('Row has no identifier to edit by.');
      }
    } catch (e) {
      row.style.opacity = '1';
      alert(`Edit failed: ${e.message || e}`);
    }
  };

  if (actionsEl) {
    actionsEl.querySelector('.fact-save').addEventListener('click', doSave);
    actionsEl.querySelector('.fact-cancel').addEventListener('click', restore);
  }
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); restore(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
  });
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

// ── cta ──
//
// A prominent primary-action panel. The agent emits this to ask a single
// high-value question like "Run hippocampus now?" with one big button
// as the answer. Shape:
//   { "type": "cta", "icon": "🧠", "title": "...", "description": "...",
//     "button": { "label": "Run hippocampus", "icon": "🧠", "message": "/shared-memory dream" } }

function renderCta(w) {
  const panel = el('div', 'widget-cta');
  const btn = w.button || {};
  panel.innerHTML = `
    <div class="cta-header">
      ${w.icon ? `<span class="cta-icon">${esc(w.icon)}</span>` : ''}
      <h2 class="cta-title">${esc(w.title || '')}</h2>
    </div>
    ${w.description ? `<p class="cta-description">${esc(w.description)}</p>` : ''}
    <button class="cta-button">
      ${btn.icon ? `<span class="cta-button-icon">${esc(btn.icon)}</span>` : ''}
      <span class="cta-button-label">${esc(btn.label || 'Start')}</span>
      <span class="cta-button-arrow">→</span>
    </button>
  `;
  const buttonEl = panel.querySelector('.cta-button');
  buttonEl.addEventListener('click', () => {
    if (!window._chatSend) return;
    const msg = btn.message || btn.label || 'Start';
    window._chatSend(msg);
  });
  return panel;
}

// ── action-cards ──

function renderActionCards(w) {
  const grid = el('div', 'action-cards-grid');
  for (const item of (w.items || [])) {
    const classes = ['action-card'];
    if (item.active) classes.push('active');
    if (item.pulse) classes.push('pulse');
    const card = el('div', classes.join(' '));
    card.innerHTML = `
      <div class="action-preview">
        <div class="action-header">
          ${item.icon ? `<span class="action-icon">${esc(item.icon)}</span>` : ''}
          <span class="action-title">${esc(item.title)}</span>
        </div>
        ${item.description ? `<div class="action-desc">${esc(item.description)}</div>` : ''}
      </div>
      <button class="action-start">Start</button>
    `;
    const msg = item.message || item.title || item.id;
    const fire = (e) => {
      if (!window._chatSend) return;
      window._chatSend(msg);
      e.stopPropagation();
    };
    card.querySelector('.action-start').addEventListener('click', fire);
    card.addEventListener('click', fire);
    grid.appendChild(card);
  }
  return grid;
}

// ── checklist ──
//
// Multi-step plan with per-item status — shows the WHOLE plan upfront, not
// just a rolling window of recent steps. Use for long multi-phase workflows
// like a memory scan: user sees what's coming, what's done, what's active.
//
// Shape:
//   { "type": "checklist",
//     "title": "SCAN PLAN",
//     "items": [
//       { "label": "Collect session files",       "status": "done",
//         "detail": "7 found · 0.8s" },
//       { "label": "Merge & write candidates",    "status": "active",
//         "detail": "3 of 12",
//         "sub": "Memory_query parallel · writing + / ~ / −" },
//       { "label": "Stamp day harvested",          "status": "pending" }
//     ],
//     "footer": "elapsed 47s · ≈ 1m 30s remaining" }
//
// Status values: "pending" | "active" | "done" | "skipped" | "failed".
// Agent updates this by re-emitting the full checklist on each phase
// transition (PageUpdate with just the body containing this widget).

function renderChecklist(w) {
  const panel = el('div', 'widget-checklist');
  const items = Array.isArray(w.items) ? w.items : [];
  const doneCount = items.filter(i =>
    i.status === 'done' || i.status === 'skipped'
  ).length;
  const total = items.length;

  const sym = (s) => {
    if (s === 'done') return '✓';
    if (s === 'active') return '→';
    if (s === 'skipped') return '—';
    if (s === 'failed') return '✗';
    return '○';
  };

  const itemsHtml = items.map((item) => {
    const status = item.status || 'pending';
    const subHtml = item.sub
      ? `<div class="checklist-sub">${esc(item.sub)}</div>`
      : '';
    const detailHtml = item.detail
      ? `<span class="checklist-detail">${esc(item.detail)}</span>`
      : '';
    return `
      <div class="checklist-item status-${esc(status)}">
        <span class="checklist-symbol">${sym(status)}</span>
        <div class="checklist-text">
          <div class="checklist-row">
            <span class="checklist-label">${esc(item.label || '')}</span>
            ${detailHtml}
          </div>
          ${subHtml}
        </div>
      </div>
    `;
  }).join('');

  const headerHtml = `
    <div class="checklist-header">
      <div class="checklist-title">${esc(w.title || 'CHECKLIST')}</div>
      <span class="checklist-count">${doneCount} of ${total} done</span>
    </div>
  `;
  const footerHtml = w.footer
    ? `<div class="checklist-footer">${esc(w.footer)}</div>`
    : '';

  panel.innerHTML = `${headerHtml}<div class="checklist-body">${itemsHtml}</div>${footerHtml}`;
  return panel;
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

  // If the title names a core memory file, add per-row edit/delete controls.
  // Only identity.md and style.md exist under the current two-layer model.
  const fileMatch = (w.title || '').match(/\b(identity|style)(?:\.md)?\b/);
  const memFile = fileMatch ? `${fileMatch[1]}.md` : null;

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
    // Delete — direct API call (no LLM round-trip).
    panel.querySelectorAll('.fact-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const row = (w.rows || [])[idx];
        if (!row) return;
        const factText = [...row].reverse().find(c => typeof c === 'string');
        if (!factText) return;
        if (!(await confirmDialog(`Delete from ${memFile}?\n\n"${factText}"`))) return;
        const tr = btn.closest('tr');
        tr.style.opacity = '0.4';
        btn.disabled = true;
        try {
          const resp = await fetch('/api/memory/fact', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: memFile, text: factText }),
          });
          if (!resp.ok) throw new Error(await resp.text());
          // Remove the row from the DOM — instant, no dashboard rebuild.
          tr.remove();
        } catch (e) {
          tr.style.opacity = '1';
          btn.disabled = false;
          alert(`Delete failed: ${e.message || e}`);
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
        const doSave = async () => {
          const newText = ta.value.trim();
          if (!newText) { restore(); return; }
          if (newText === oldText.trim()) { restore(); return; }
          tr.style.opacity = '0.6';
          try {
            const resp = await fetch('/api/memory/fact', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file: memFile, old_text: oldText, new_text: newText }),
            });
            if (!resp.ok) throw new Error(await resp.text());
            factCell.innerHTML = esc(newText);
            actionsCell.innerHTML = origActionsHtml;
            tr.classList.remove('editing');
            tr.style.opacity = '1';
          } catch (e) {
            tr.style.opacity = '1';
            alert(`Edit failed: ${e.message || e}`);
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

