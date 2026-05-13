// pulse renderer — turns the per-session state into DOM, applies
// body_patch and status_strip_patch updates from the agent (via
// PageUpdate calls), and persists the session to disk.
//
// Schema lives in design.md (Page state and JSON schema). One file
// per day at ~/.linggen/skills/pulse/data/YYYY-MM-DD/session.json.
// Sections accumulate body_patches across runs through the day.

// Section render order. `progress_drafts` is pinned to the TOP so the
// "Local progress" card (gather-local's narrative + Draft chip output)
// stays visible when new mentions / signal / discovery cards arrive —
// previously it was last in the list and got pushed off-screen.
const SECTION_ORDER = [
  'progress_drafts',
  'mentions',
  'replies_due',
  'discovery',
  'signal',
];

const SECTION_LABELS = {
  progress_drafts: 'Local progress',
  mentions:        'Mentions',
  replies_due:     'Replies due',
  discovery:       'Discovery',
  signal:          'Signal',
};

const SECTION_HINTS = {
  discovery: 'cold opportunities · matched against brief',
  signal:    'refreshed by research-market',
};

let session = emptySession();
let onChangeCallback = null;
// User's own Reddit handle (lowercased, no "u/" prefix) — used to filter
// out mention cards whose latest reply is by the user themselves. Set
// externally via setSelfHandle(); falls back to checking session.config
// on every render if available.
let selfRedditHandle = null;
// Thread URLs the user has already commented on — discovery cards
// suggesting a comment on these are filtered out. Populated by
// pulse-app from FetchRedditMentions own_comment results.
let commentedThreadUrls = new Set();

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

export function setSelfHandle(handle) {
  if (!handle || typeof handle !== 'string') { selfRedditHandle = null; return; }
  selfRedditHandle = handle.trim().toLowerCase().replace(/^u\//, '');
}

export function setCommentedThreadUrls(urls) {
  const set = new Set();
  for (const u of (urls || [])) {
    if (typeof u === 'string' && u) set.add(normalizeThreadUrl(u));
  }
  commentedThreadUrls = set;
  renderAll();   // re-render to apply the new filter
}

// Additive variant — the optimistic "user just clicked Copy/Open on a
// discovery card" path: we mark the thread locally before Reddit's
// /user/<u>/comments.json sees the user's new comment (typical 30s+
// lag). Persisted to disk by the caller so refreshes don't lose it.
export function addCommentedThreadUrl(url) {
  if (!url || typeof url !== 'string') return;
  commentedThreadUrls.add(normalizeThreadUrl(url));
  renderAll();
}

export function getCommentedThreadUrls() {
  return Array.from(commentedThreadUrls);
}

// Normalize a Reddit URL to a thread key (post id) so any of these
// forms map to the same canonical value:
//   /r/sub/comments/<id>/<slug>/<commentid>/   ← own_comment permalink
//   /r/sub/comments/<id>/<slug>/               ← thread URL with slug
//   /r/sub/comments/<id>/                      ← thread URL without slug
//   /comments/<id>/                            ← bare thread URL
//   https://redd.it/<id>                        ← short URL
//
// The previous version kept the subreddit + slug in the key, which
// silently broke when the own_comment URL had a slug and the discovery
// card's thread_url didn't (or vice versa). Reducing to just the post
// id is what reddit-mentions.sh's dedup already uses — same key here
// keeps the two callsites in sync.
function normalizeThreadUrl(u) {
  if (!u) return '';
  const s = String(u);
  let m = s.match(/\/comments\/([^/?#]+)/);
  if (m) return `reddit:${m[1]}`;
  m = s.match(/^https?:\/\/(?:www\.)?redd\.it\/([^/?#]+)/);
  if (m) return `reddit:${m[1]}`;
  return s.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

// Defensive filter: agent is instructed to drop mention cards whose
// latest reply is by the user. If it slips, we drop them here too.
function isSelfLatestReply(card) {
  if (!selfRedditHandle) return false;
  if (card.type !== 'mention') return false;
  const conv = Array.isArray(card.conversation) ? card.conversation : [];
  const last = conv[conv.length - 1];
  if (!last || !last.author) return false;
  const author = String(last.author).toLowerCase().replace(/^u\//, '');
  return author === selfRedditHandle;
}

// Defensive filter: drop reply cards with nothing to act on. A reply
// card is "actionable" only if there's an unanswered comment, a fresh
// follow_up event, OR enough activity (score / ratio) the user cares
// about. Cards from "you posted something" with no engagement
// metadata are just noise — they say "Your post: post · posted · 0
// unanswered comments" and the user has to dismiss them by hand.
function isEmptyReplyCard(card) {
  if (card.type !== 'reply') return false;
  const hasFollowup = !!card.follow_up;
  const unanswered = card.unanswered_count || 0;
  const replies = card.replies_count || 0;
  if (hasFollowup) return false;
  if (unanswered > 0) return false;
  if (replies > 0) return false;
  return true;
}

// Defensive filter: discovery cards suggesting a thread the user has
// already commented on — drop them; suggesting a comment on a thread
// where they've already weighed in is noise. URLs come from
// FetchRedditMentions own_comment results, pre-fetched by pulse-app.
function isAlreadyCommented(card) {
  if (card.type !== 'discovery') return false;
  const url = card.thread_url || card.url;
  if (!url) return false;
  return commentedThreadUrls.has(normalizeThreadUrl(url));
}

// Defensive filter: drop signal cards whose URL matches a discovery
// card already on the page. SKILL.md research-market step 6 tells the
// agent to dedupe, but research-market and discover-customers run in
// parallel — the agent can't reliably know what the other capability
// will emit. Discovery is the actionable bucket (draft + Copy + Open);
// signal showing the same thread is a passive dup. Enforced at render
// time so SKILL.md instructions don't have to fire perfectly.
function isDuplicateInDiscovery(card, ctx) {
  if (card.type !== 'signal') return false;
  if (!ctx || !ctx.discoveryUrls || ctx.discoveryUrls.size === 0) return false;
  const u = card.url || card.thread_url;
  if (!u) return false;
  return ctx.discoveryUrls.has(normalizeThreadUrl(u));
}

function shouldFilterCard(card, ctx) {
  return isSelfLatestReply(card)
      || isEmptyReplyCard(card)
      || isAlreadyCommented(card)
      || isDuplicateInDiscovery(card, ctx);
}

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
    // Defensive filters (UX rules enforced at render time, not in
    // agent prompts so SKILL.md stays lean):
    //   - mention cards whose latest reply is by the user themselves
    //     (they had the last word, nothing to do)
    //   - reply cards with no actionable content (0 unanswered + no
    //     follow_up — just empty "Your post: …" stubs)
    //   - discovery cards on threads the user has already commented on
    const filtered = sec.cards.filter(c => !shouldFilterCard(c));
    if (filtered.length === 0) continue;
    const sectionView = { ...sec, cards: filtered };
    container.appendChild(renderSectionEl(sectionId, sectionView));
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
    case 'mention':      return renderMention(card);
    case 'reply_to_me':  return renderReplyToMe(card);
    case 'reply':        return renderReply(card);
    case 'discovery':    return renderDiscovery(card);
    case 'signal':       return renderSignal(card);
    case 'progress':     return renderProgress(card);
    case 'draft':        return renderDraft(card);
    case 'empty':        return renderEmpty(card);
    default:             return renderUnknown(card);
  }
}

// ---- Card renderers ------------------------------------------------------

function renderMention(c) {
  // Mention cards now carry the conversational context, not just the
  // mention quote. Shape:
  //   - original_post: { author, body, age_hours } — the OP of the thread
  //   - conversation:  [{ author, body, age_hours }, ...] — chain leading
  //                    to the mention. Agent emits first + last only when
  //                    the thread is deep; middle nodes are summarized in
  //                    `collapsed_count`.
  //   - collapsed_count: integer — how many comments are between first
  //                      and last that we're not showing.
  //   - draft_reply: agent's suggested reply, shown inline so the user
  //                  can copy + paste back into Reddit.
  // Falls back gracefully to legacy `quote`-only cards.
  const op = c.original_post;
  const conv = Array.isArray(c.conversation) ? c.conversation : [];
  const collapsed = c.collapsed_count || 0;
  const draftHtml = c.draft_reply
    ? `<div class="draft-inline"><div class="draft-inline-label">Draft reply</div><div class="draft-inline-body">${escapeHtml(c.draft_reply)}</div></div>`
    : '';
  const opHtml = op
    ? `<div class="thread-original"><div class="thread-label">Original post${op.author ? ' · ' + escapeHtml(op.author) : ''}${op.age_hours != null ? ' · ' + formatAge(op.age_hours) : ''}</div><div class="thread-body">${escapeHtml(truncateText(op.body || '', 220))}</div></div>`
    : '';
  const convHtml = conv.length > 0
    ? renderConversation(conv, collapsed)
    : (c.quote ? `<div class="quote">${escapeHtml(c.quote)}</div>` : '');
  return cardEl(c, 'unread', `
    <div class="title">${escapeHtml(c.actor || 'Someone')} mentioned <b>${escapeHtml(c.watched_term || c.thread_title || 'your watch')}</b></div>
    <div class="meta">${escapeHtml(c.source || '')}${c.sub ? ' · r/' + escapeHtml(c.sub) : ''} · ${formatAge(c.age_hours)}${c.thread_title ? ' · "' + escapeHtml(truncateText(c.thread_title, 70)) + '"' : ''}</div>
    ${opHtml}
    ${convHtml}
    ${draftHtml}
    ${actionRow(c, ['copy', 'open', 'dismiss'])}
  `);
}

// Reply-to-my-comment card. Shape:
//   - actor / author: replier's u/handle
//   - thread_title:   parent Reddit post title
//   - sub:            subreddit (with or without "r/" prefix)
//   - your_comment:   { body, url? } — the user's comment that got replied to
//   - reply:          { body, age_hours?, score? } — the FULL replier text
//   - draft_reply:    agent's drafted response in voice
//   - url:            link to the reply on Reddit
// Distinct from `mention` because there's no thread chain to summarize —
// just the user's comment and one direct reply. Putting these through the
// `mention` shape forced the agent to fake an `original_post` + `conversation`
// split that fragmented the reply across two cards.
function renderReplyToMe(c) {
  const replyBody = c.reply?.body || c.body || '';
  const replyAge = c.reply?.age_hours;
  const replyScore = c.reply?.score;
  const yourBody = c.your_comment?.body || c.parent_comment_body || '';
  const yourCommentHtml = yourBody
    ? `<div class="thread-original"><div class="thread-label">Your comment${c.your_comment?.age_hours != null ? ' · ' + formatAge(c.your_comment.age_hours) : ''}</div><div class="thread-body">${escapeHtml(truncateText(yourBody, 280))}</div></div>`
    : '';
  const replyMeta = [
    `${escapeHtml(c.actor || c.author || 'Someone')} replied`,
    replyAge != null ? formatAge(replyAge) : null,
    replyScore != null ? `${replyScore} pts` : null,
  ].filter(Boolean).join(' · ');
  const replyHtml = replyBody
    ? `<div class="thread-step latest"><div class="thread-label">${replyMeta}</div><div class="thread-body">${escapeHtml(truncateText(replyBody, 1200))}</div></div>`
    : '';
  const draftHtml = c.draft_reply
    ? `<div class="draft-inline"><div class="draft-inline-label">Draft reply</div><div class="draft-inline-body">${escapeHtml(c.draft_reply)}</div></div>`
    : '';
  const subDisplay = c.sub ? (c.sub.startsWith('r/') ? c.sub : 'r/' + c.sub) : '';
  return cardEl(c, 'unread', `
    <div class="title">${escapeHtml(c.actor || c.author || 'Someone')} replied to your comment</div>
    <div class="meta">${escapeHtml(c.source || 'reddit')}${subDisplay ? ' · ' + escapeHtml(subDisplay) : ''}${c.thread_title ? ' · "' + escapeHtml(truncateText(c.thread_title, 70)) + '"' : ''}</div>
    ${yourCommentHtml}
    ${replyHtml}
    ${draftHtml}
    ${actionRow(c, ['copy', 'open', 'dismiss'])}
  `);
}

function renderConversation(conv, collapsedCount) {
  if (conv.length === 0) return '';
  const parts = [];
  conv.forEach((node, idx) => {
    const isLast = idx === conv.length - 1;
    const labelTxt = idx === 0 && conv.length > 1 ? 'First reply' :
                     isLast ? 'Latest reply' : 'Reply';
    const meta = `${labelTxt}${node.author ? ' · ' + escapeHtml(node.author) : ''}${node.age_hours != null ? ' · ' + formatAge(node.age_hours) : ''}`;
    parts.push(`<div class="thread-step${isLast ? ' latest' : ''}"><div class="thread-label">${meta}</div><div class="thread-body">${escapeHtml(truncateText(node.body || '', 220))}</div></div>`);
    if (idx === 0 && collapsedCount > 0 && conv.length > 1) {
      parts.push(`<div class="thread-collapsed">… ${collapsedCount} ${collapsedCount === 1 ? 'reply' : 'replies'} between …</div>`);
    }
  });
  return parts.join('');
}

function truncateText(s, n) {
  if (!s) return '';
  const stripped = String(s).replace(/<[^>]+>/g, '').trim();
  return stripped.length <= n ? stripped : stripped.slice(0, n - 1) + '…';
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
  // Strip HTML tags from the post body for safety; agent receives Reddit's
  // JSON which sometimes includes formatted markdown — we show plain text.
  const excerpt = (c.excerpt || c.body || '').replace(/<[^>]+>/g, '').trim();
  const truncatedExcerpt = excerpt.length > 400 ? excerpt.slice(0, 397) + '…' : excerpt;
  return cardEl(c, 'cold', `
    <div class="title">${escapeHtml(c.source || '')}${c.sub ? ' · r/' + escapeHtml(c.sub) : ''} · <b>"${escapeHtml(c.thread_title || '')}"</b></div>
    <div class="meta">${c.comments != null ? c.comments + ' comments · ' : ''}${formatAge(c.age_hours)}${c.match_reason ? ' · ' + escapeHtml(c.match_reason) : ''}</div>
    ${truncatedExcerpt ? `<div class="excerpt">${escapeHtml(truncatedExcerpt)}</div>` : ''}
    ${c.draft_starter ? `<div class="draft-inline"><div class="draft-inline-label">Draft comment</div><div class="draft-inline-body">${escapeHtml(c.draft_starter)}</div></div>` : ''}
    ${actionRow(c, ['copy', 'open', 'dismiss'])}
  `);
}

function renderSignal(c) {
  const items = (c.items || []).map(i => `<li>${renderInline(i)}</li>`).join('');
  const metaBits = [];
  if (c.source) metaBits.push(escapeHtml(c.source));
  if (c.age_hours != null) metaBits.push(formatAge(c.age_hours));
  const meta = metaBits.length ? `<div class="meta">${metaBits.join(' · ')}</div>` : '';
  return cardEl(c, 'cold', `
    <div class="title">${escapeHtml(c.title || c.source || 'Signal')}</div>
    ${meta}
    ${items ? `<ul>${items}</ul>` : ''}
    ${c.url ? actionRow(c, ['open-url']) : ''}
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
  // Renderer owns the action set per card type. We deliberately do NOT
  // honor card.actions from the agent — it kept inventing action names
  // like "open_thread" that don't map to any handler, and overrode the
  // default Copy/Open/Dismiss set. The agent's job is to populate card
  // fields; the page's job is to decide what UI actions are available.
  const actions = actionList;
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
