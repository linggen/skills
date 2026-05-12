// pulse renderer — turns the per-session state into DOM, applies
// body_patch and status_strip_patch updates from the agent (via
// PageUpdate calls), and persists the session to disk.
//
// Schema lives in design.md (Page state and JSON schema). One file
// per day at ~/.linggen/skills/pulse/data/YYYY-MM-DD/session.json.
// Sections accumulate body_patches across runs through the day.

const SECTION_ORDER = [
  'mentions',
  'replies_due',
  'discovery',
  'signal',
  'progress_drafts',
];

const SECTION_LABELS = {
  mentions:        'Mentions',
  replies_due:     'Replies due',
  discovery:       'Discovery',
  signal:          'Signal',
  progress_drafts: 'Progress + Drafts',
};

const SECTION_HINTS = {
  discovery: 'cold opportunities · matched against brief',
  signal:    'refreshed by research-market',
};

let session = emptySession();
let onChangeCallback = null;

function emptySession() {
  return {
    session_id: null,
    started_at: null,
    last_run_at: null,
    status_strip: [],
    sections: {
      mentions:        { cards: [], last_updated: null },
      replies_due:     { cards: [], last_updated: null },
      discovery:       { cards: [], last_updated: null },
      signal:          { cards: [], last_updated: null },
      progress_drafts: { cards: [], last_updated: null },
    },
    runs: [],
  };
}

// ---- Public API -----------------------------------------------------------

export function setOnChange(cb) { onChangeCallback = cb; }

export function getSession() { return session; }

export function loadSession(sessionData) {
  if (!sessionData) {
    session = emptySession();
  } else {
    // Merge with empty so missing sections don't crash the renderer.
    const fresh = emptySession();
    session = {
      ...fresh,
      ...sessionData,
      sections: {
        ...fresh.sections,
        ...(sessionData.sections || {}),
      },
    };
  }
  renderAll();
}

export function applyPageUpdate(args) {
  if (!args || typeof args !== 'object') return;
  let dirty = false;

  // body_patch can be a single object {section, cards} OR an array.
  if (args.body_patch !== undefined) {
    const patches = Array.isArray(args.body_patch) ? args.body_patch : [args.body_patch];
    for (const p of patches) applyBodyPatch(p);
    dirty = true;
  }

  if (args.status_strip_patch !== undefined) {
    applyStatusStripPatch(args.status_strip_patch);
    dirty = true;
  }

  if (args.run_log !== undefined) {
    appendRunLog(args.run_log);
    dirty = true;
  }

  if (dirty) {
    session.last_run_at = new Date().toISOString();
    renderAll();
    if (onChangeCallback) onChangeCallback(session);
  }
}

export function resetPage() {
  session = emptySession();
  renderAll();
}

// ---- Patch application ---------------------------------------------------

function applyBodyPatch(patch) {
  if (!patch || typeof patch !== 'object' || !patch.section) return;
  const sectionId = patch.section;
  if (!session.sections[sectionId]) {
    session.sections[sectionId] = { cards: [], last_updated: null };
  }
  if (Array.isArray(patch.cards)) {
    // Two modes:
    //   default (replace) — cards in patch fully replace existing cards.
    //                       Used by Gather web's mentions/signal/discovery
    //                       patches and by the page-side gather-local that
    //                       seeds the progress card.
    //   "append"          — concatenate to existing cards, deduping by id.
    //                       Used by the Draft step so newly-generated draft
    //                       cards land alongside the progress card without
    //                       clobbering it.
    if (patch.mode === 'append') {
      const existing = session.sections[sectionId].cards || [];
      const seen = new Set(existing.map(c => c.id).filter(Boolean));
      const additions = patch.cards.filter(c => !c.id || !seen.has(c.id));
      session.sections[sectionId].cards = existing.concat(additions);
    } else {
      session.sections[sectionId].cards = patch.cards;
    }
  }
  session.sections[sectionId].last_updated =
    patch.last_updated || new Date().toISOString();
}

function applyStatusStripPatch(patch) {
  // Patch can be a full array (replace) OR { items, mode: "merge"|"replace" }.
  if (Array.isArray(patch)) {
    session.status_strip = patch;
    return;
  }
  if (patch && typeof patch === 'object') {
    if (patch.mode === 'merge' && Array.isArray(patch.items)) {
      // Merge by label.
      const byLabel = new Map(session.status_strip.map(i => [i.label, i]));
      for (const item of patch.items) byLabel.set(item.label, item);
      session.status_strip = Array.from(byLabel.values());
    } else if (Array.isArray(patch.items)) {
      session.status_strip = patch.items;
    }
  }
}

function appendRunLog(entry) {
  if (!entry || typeof entry !== 'object') return;
  if (!Array.isArray(session.runs)) session.runs = [];
  session.runs.push(entry);
}

// ---- Rendering -----------------------------------------------------------

export function renderAll() {
  renderStatusStrip();
  renderSections();
}

function renderStatusStrip() {
  const el = document.getElementById('status-strip');
  if (!el) return;
  if (!session.status_strip || session.status_strip.length === 0) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const items = session.status_strip;
  const parts = [];
  items.forEach((it, idx) => {
    const tone = it.tone || 'neutral';
    const dot = tone === 'ok' ? `<span class="ok">●</span> `
              : tone === 'warn' ? `<span class="warn">●</span> `
              : tone === 'due' ? `<span class="due">●</span> ` : '';
    const valueHtml = it.value
      ? `<span>${dot}${escapeHtml(it.label)} ${escapeHtml(it.value)}</span>`
      : `<span class="${tone}">${dot}${escapeHtml(it.label)}</span>`;
    parts.push(valueHtml);
    if (idx < items.length - 1) parts.push('<span class="sep">·</span>');
  });
  parts.push('<span class="refresh" title="Refresh">⟳</span>');
  el.innerHTML = parts.join('');
}

function renderSections() {
  const container = document.getElementById('sections-container');
  if (!container) return;
  container.innerHTML = '';

  let renderedAny = false;
  for (const sectionId of SECTION_ORDER) {
    const sec = session.sections[sectionId];
    if (!sec || !Array.isArray(sec.cards) || sec.cards.length === 0) continue;
    container.appendChild(renderSectionEl(sectionId, sec));
    renderedAny = true;
  }

  if (!renderedAny) {
    const msg = document.createElement('div');
    msg.className = 'state-msg';
    msg.textContent = "No data for this session yet. Pick a chip above, or type a goal in chat to start.";
    container.appendChild(msg);
  }
}

function renderSectionEl(sectionId, sec) {
  const wrap = document.createElement('div');
  wrap.className = 'section';
  wrap.dataset.section = sectionId;

  const head = document.createElement('div');
  head.className = 'section-head';
  head.appendChild(textNode(SECTION_LABELS[sectionId] || sectionId));
  const visibleCards = sec.cards.filter(c => c.type !== 'empty');
  if (visibleCards.length > 0) {
    const cnt = document.createElement('span');
    cnt.className = 'count';
    cnt.textContent = `${visibleCards.length} new`;
    head.appendChild(cnt);
  }
  if (SECTION_HINTS[sectionId]) {
    const right = document.createElement('span');
    right.className = 'right';
    right.textContent = SECTION_HINTS[sectionId];
    head.appendChild(right);
  }
  wrap.appendChild(head);

  for (const card of sec.cards) {
    wrap.appendChild(renderCard(card));
  }

  return wrap;
}

function renderCard(card) {
  switch ((card.type || '').toLowerCase()) {
    case 'mention':   return renderMention(card);
    case 'reply':     return renderReply(card);
    case 'discovery': return renderDiscovery(card);
    case 'signal':    return renderSignal(card);
    case 'progress':  return renderProgress(card);
    case 'draft':     return renderDraft(card);
    case 'empty':     return renderEmpty(card);
    default:          return renderUnknown(card);
  }
}

// ---- Card renderers ------------------------------------------------------

function renderMention(c) {
  return cardEl(c, 'unread', `
    <div class="title">${escapeHtml(c.actor || 'Someone')} mentioned <b>${escapeHtml(c.watched_term || c.thread_title || 'your watch')}</b></div>
    <div class="meta">${escapeHtml(c.source || '')}${c.sub ? ' · r/' + escapeHtml(c.sub) : ''} · ${formatAge(c.age_hours)}${c.replies_count != null ? ' · ' + c.replies_count + ' replies' : ''}</div>
    ${c.quote ? `<div class="quote">"${escapeHtml(c.quote)}"</div>` : ''}
    ${actionRow(c, ['draft-reply', 'open', 'dismiss'])}
  `);
}

function renderReply(c) {
  let followupHtml = '';
  if (c.follow_up) {
    const fu = c.follow_up;
    followupHtml = `
      <div class="followup">
        <div class="label">↳ New reply on a thread you posted in · ${formatAge(fu.age_hours)}</div>
        ${fu.quote ? `<div class="quote">"${escapeHtml(fu.quote)}"</div>` : ''}
        <div class="actions">
          <button class="primary" data-action="reply-back" data-card="${c.id}">✎ Reply back</button>
          ${fu.comment_url ? `<button data-action="open-url" data-url="${escapeAttr(fu.comment_url)}">↗ View</button>` : ''}
          <button class="dismiss" data-action="dismiss-followup" data-card="${c.id}">×</button>
        </div>
      </div>
    `;
  }
  return cardEl(c, 'unread', `
    <div class="title">Your ${escapeHtml(c.platform || 'post')}: <b>"${escapeHtml(c.your_post_title || 'post')}"</b></div>
    <div class="meta">posted ${c.posted_at ? formatAge(hoursSince(c.posted_at)) : ''} · ${c.unanswered_count || 0} unanswered comments${c.score != null ? ' · ' + c.score + ' points' : ''}${c.ratio != null ? ' · ratio ' + c.ratio : ''}</div>
    ${actionRow(c, ['draft-replies', 'open', 'dismiss'])}
    ${followupHtml}
  `);
}

function renderDiscovery(c) {
  return cardEl(c, 'cold', `
    <div class="title">${escapeHtml(c.source || '')}${c.sub ? ' · r/' + escapeHtml(c.sub) : ''} · <b>"${escapeHtml(c.thread_title || '')}"</b></div>
    <div class="meta">${c.comments != null ? c.comments + ' comments · ' : ''}${formatAge(c.age_hours)}${c.match_reason ? ' · ' + escapeHtml(c.match_reason) : ''}</div>
    ${c.draft_starter ? `<div class="quote">${escapeHtml(c.draft_starter)}</div>` : ''}
    ${actionRow(c, ['draft-starter', 'open', 'dismiss'])}
  `);
}

function renderSignal(c) {
  const items = (c.items || []).map(i => `<li>${renderInline(i)}</li>`).join('');
  return cardEl(c, 'cold', `
    <div class="title">${escapeHtml(c.title || c.source || 'Signal')}</div>
    ${items ? `<ul>${items}</ul>` : ''}
    ${actionRow(c, ['expand'])}
  `, 'dense');
}

function renderProgress(c) {
  const items = (c.items || []).map(i => {
    const kind = i.kind ? `<b>${escapeHtml(i.kind)}:</b> ` : '';
    return `<li>${kind}${renderInline(i.text || '')}</li>`;
  }).join('');
  return cardEl(c, 'unread', `
    <div class="title">${windowToHumanLabel(c.window) || 'Progress'} — what shipped + what was learned</div>
    ${items ? `<ul>${items}</ul>` : ''}
  `, 'dense');
}

function renderDraft(c) {
  const limit = c.char_limit ? ` / ${c.char_limit} chars` : '';
  const charLine = c.char_count != null
    ? `<div class="draft-label">${escapeHtml(c.lane || 'draft')} draft · ${c.char_count}${limit}</div>`
    : '';
  const titleCands = Array.isArray(c.title_candidates) && c.title_candidates.length > 0
    ? `<div class="draft-label">title candidates</div><ul>${c.title_candidates.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';
  return cardEl(c, 'unread', `
    <div class="title">${escapeHtml(c.lane || 'Draft')}${c.posted ? ' <span style="color:var(--green);font-weight:400;font-size:11px;">✓ posted</span>' : ''}</div>
    ${titleCands}
    ${charLine}
    ${c.content ? `<div class="draft-preview">${escapeHtml(c.content)}</div>` : ''}
    ${actionRow(c, c.posted ? ['copy', 'discard'] : ['polish', 'copy', 'mark-posted', 'discard'])}
  `, 'dense');
}

function renderEmpty(c) {
  const el = document.createElement('div');
  el.className = 'card empty';
  el.textContent = c.message || 'Nothing to show in this section.';
  return el;
}

function renderUnknown(c) {
  return cardEl(c, 'cold', `
    <div class="title">[unknown card type: ${escapeHtml(c.type || '?')}]</div>
    <pre style="font-size:11px;color:var(--muted);overflow:auto">${escapeHtml(JSON.stringify(c, null, 2))}</pre>
  `);
}

// ---- Card scaffolding ----------------------------------------------------

function cardEl(card, dotKind, innerHtml, extraClass) {
  const el = document.createElement('div');
  el.className = 'card' + (extraClass ? ' ' + extraClass : '');
  if (card.id) el.dataset.cardId = card.id;
  el.innerHTML = `
    <div class="top">
      <span class="dot ${dotKind}"></span>
      <div class="body">${innerHtml}</div>
    </div>
  `;
  return el;
}

function actionRow(card, actionList) {
  if (!actionList || actionList.length === 0) return '';
  // Use the card's own actions[] if present; otherwise the default list.
  const actions = (Array.isArray(card.actions) && card.actions.length > 0) ? card.actions : actionList;
  const buttons = actions.map(a => {
    const meta = ACTION_LABELS[a] || { label: a, primary: false, dismiss: false };
    const cls = meta.primary ? 'primary' : meta.dismiss ? 'dismiss' : '';
    return `<button class="${cls}" data-action="${escapeAttr(a)}" data-card="${escapeAttr(card.id || '')}">${meta.label}</button>`;
  }).join('');
  return `<div class="actions">${buttons}</div>`;
}

const ACTION_LABELS = {
  'draft-reply':    { label: '✎ Draft reply',    primary: true },
  'draft-replies':  { label: '✎ Draft replies',  primary: true },
  'draft-starter':  { label: '✎ Draft starter',  primary: true },
  'reply-back':     { label: '✎ Reply back',     primary: true },
  'polish':         { label: '✎ Polish',         primary: true },
  'open':           { label: '↗ Open',           primary: false },
  'open-url':       { label: '↗ Open',           primary: false },
  'expand':         { label: '▾ Expand',         primary: false },
  'copy':           { label: '📋 Copy',           primary: false },
  'mark-posted':    { label: '✓ Posted',         primary: false },
  'discard':        { label: '✗ Discard',        dismiss: true },
  'dismiss':        { label: '×',                 dismiss: true },
};

// ---- Helpers -------------------------------------------------------------

function textNode(s) { return document.createTextNode(s); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/["'<>&]/g, c => ({
    '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;', '&': '&amp;',
  })[c]);
}

function renderInline(s) {
  const escaped = escapeHtml(s);
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function formatAge(hours) {
  if (hours == null) return 'just now';
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function hoursSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 3600000);
}

function windowToHumanLabel(w) {
  if (!w) return null;
  const map = { '24h': 'Yesterday', '7d': 'This week', '30d': 'This month' };
  return map[w] || w;
}
