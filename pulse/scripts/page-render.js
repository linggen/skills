// pulse renderer — turns the per-session state into DOM, applies
// body_patch and status_strip_patch updates from the agent (via
// PageUpdate calls), and persists the session to disk.
//
// Schema lives in design.md (Page state and JSON schema). One file
// per day at ~/.linggen/skills/pulse/data/YYYY-MM-DD/session.json.
// Sections accumulate body_patches across runs through the day.

// Section render order. `progress_drafts` is pinned to the TOP so the
// "Local progress" card (gather-local's narrative + Draft chip output)
// stays visible when new mentions / trend / discovery cards arrive —
// previously it was last in the list and got pushed off-screen.
const SECTION_ORDER = [
  'progress_drafts',
  'mentions',
  'replies_due',
  'discovery',
  'hn_submit',
];

const SECTION_LABELS = {
  progress_drafts: 'Local progress',
  mentions:        'Mentions',
  replies_due:     'Replies due',
  discovery:       'Discovery',
  hn_submit:       'HN submit',
};

const SECTION_HINTS = {
  discovery: 'cold opportunities · matched against brief',
  hn_submit: 'links to submit · lowers your own-post ratio',
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
// Per-source tab state. `pageConfig` tells the renderer which source tabs to
// show even when empty (so the X dashboard still appears on a fresh session);
// `activeTab` persists the user's pick across re-renders + reloads;
// `onTabRenderCallback` lets pulse-app mount the X dashboard + roster card
// into the X tab's #x-tab-extras once it's in the DOM.
let pageConfig = null;
let activeTab = (() => { try { return localStorage.getItem('pulse:tab') || null; } catch (e) { return null; } })();
let onTabRenderCallback = null;
let onRescanCallback = null;
let onDraftCallback = null;

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
      hn_submit:       { cards: [], last_updated: null },
      progress_drafts: { cards: [], last_updated: null },
    },
    last_scan: {},   // tabId -> ISO timestamp of the last content for that tab
    runs: [],
  };
}

// ---- Public API -----------------------------------------------------------

export function setOnChange(cb) { onChangeCallback = cb; }

// Tell the renderer which sources are enabled (so their tabs always show) and
// let pulse-app hook the X tab's extras mount. Both trigger no render on their
// own — the next renderAll() picks them up.
export function setConfig(c) { pageConfig = c || null; }
export function setOnTabRender(cb) { onTabRenderCallback = cb; }
// Per-tab Rescan: the button calls back with the tab id; pulse-app sends a
// source-scoped gather into the CURRENT session (CFO-style, no new session).
export function setOnRescan(cb) { onRescanCallback = cb; }
// Per-tab Draft: source tabs draft for their own lane; Progress drafts all
// enabled lanes. pulse-app maps tab id -> lane and sends the draft goal.
export function setOnDraft(cb) { onDraftCallback = cb; }

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

export function getCommentedThreadUrls() {
  return Array.from(commentedThreadUrls);
}

// URLs the user has explicitly dismissed (× button) — persisted to
// state/dismissed.json across sessions so a dismissed mention doesn't
// keep coming back every time reddit-mentions.sh returns the same item.
// Keyed by normalizeThreadUrl: thread-id for Reddit, rkey for Bluesky.
// For reply_to_me cards this collapses to the thread, so dismissing one
// reply suppresses future replies on the same thread — accept that
// trade-off until it bites.
let dismissedUrls = new Set();

export function setDismissedUrls(urls) {
  const set = new Set();
  for (const u of (urls || [])) {
    if (typeof u === 'string' && u) set.add(normalizeThreadUrl(u));
  }
  dismissedUrls = set;
  renderAll();
}

export function addDismissedUrl(url) {
  if (!url || typeof url !== 'string') return;
  dismissedUrls.add(normalizeThreadUrl(url));
}

export function getDismissedUrls() {
  return Array.from(dismissedUrls);
}

// Post-level mutes — group keys (see mentionGroupKey) the user killed via
// "Dismiss all ×" on a mention-group header. Groups form by TITLE, and a
// busy thread has far more comments than the page ever carded — so
// per-comment url dismissal can never keep the post down; the next scan
// re-forms the group from a fresh comment subset (bit us 2026-07-10 on a
// 159-comment HN thread). Group dismiss therefore means "mute this post":
// the key is persisted and any future mention card mapping to it is
// dropped at render. The per-card × stays inbox-style (that comment only).
let dismissedGroups = new Set();

export function setDismissedGroups(keys) {
  dismissedGroups = new Set((keys || []).filter((k) => typeof k === 'string' && k));
  renderAll();
}

export function addDismissedGroup(key) {
  if (key && typeof key === 'string') dismissedGroups.add(key);
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
  // Bluesky: https://bsky.app/profile/<handle-or-did>/post/<rkey>
  // and at://did:plc:.../app.bsky.feed.post/<rkey> share the same rkey,
  // which is unique per post — that's the canonical dedup key.
  m = s.match(/bsky\.app\/profile\/[^/]+\/post\/([^/?#]+)/);
  if (m) return `bsky:${m[1]}`;
  m = s.match(/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/?#]+)/);
  if (m) return `bsky:${m[1]}`;
  // X / Twitter: the status id is the post's unique key across any handle
  // form (x.com/<user>/status/<id>, x.com/i/status/<id>, twitter.com/...,
  // legacy /statuses/<id>). The handle is irrelevant for dedup, so key on id.
  m = s.match(/(?:x|twitter)\.com\/.*?status(?:es)?\/(\d+)/);
  if (m) return `x:${m[1]}`;
  // Hacker News: the item id is the thread key. A story link and its
  // news.ycombinator.com/item?id=<id> discussion share the same id.
  m = s.match(/news\.ycombinator\.com\/item\?id=(\d+)/);
  if (m) return `hn:${m[1]}`;
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
// where they've already weighed in is noise. URLs come from Reddit's
// own_comment endpoint (via FetchRedditMentions), pre-fetched by
// pulse-app. Copy clicks do NOT contribute — see refreshCommentedThreadUrls.
function isAlreadyCommented(card) {
  if (card.type !== 'discovery') return false;
  const url = card.thread_url || card.url;
  if (!url) return false;
  return commentedThreadUrls.has(normalizeThreadUrl(url));
}

// Defensive filter: card whose URL the user dismissed in any prior session.
// Reads from the dismissedUrls set, seeded at init from state/dismissed.json.
// Inbox cards (mention AND reply_to_me — a group renders both) are also
// checked against the post-level group mutes — the same key the group
// renderer uses, so a muted post can never re-form under either type
// (2026-07-10: the mute only gated `mention` and the post came straight
// back as two `reply_to_me` cards).
function isDismissed(card) {
  const inboxTypes = card.type === 'mention' || card.type === 'reply_to_me';
  if (inboxTypes && dismissedGroups.size > 0
      && dismissedGroups.has(mentionGroupKey(card))) {
    return true;
  }
  if (dismissedUrls.size === 0) return false;
  const url = card.url || card.thread_url;
  if (!url) return false;
  return dismissedUrls.has(normalizeThreadUrl(url));
}

function shouldFilterCard(card) {
  return isSelfLatestReply(card)
      || isEmptyReplyCard(card)
      || isAlreadyCommented(card)
      || isDismissed(card);
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
    // Heal persisted sessions whose cards were ingested before ensureCardId
    // existed (or were saved id-less) — otherwise their buttons stay dead.
    for (const sec of Object.values(session.sections)) {
      (sec.cards || []).forEach(ensureCardId);
    }
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

// Every card action (copy/open/dismiss…) resolves its card via
// data-card="<id>" → findCard(id), but models don't reliably emit the
// schema's "<generate>" id — an id-less card renders buttons that silently
// do nothing. Derive a stable id from the card's identity so actions never
// dead-end; content-derived (not a counter) so append-mode dedup still
// recognizes the same thread across gathers.
function ensureCardId(c) {
  if (!c || typeof c !== 'object' || c.id) return c;
  const key = c.url || c.thread_url || c.your_post_url
    || `${c.type || 'card'}|${c.title || c.thread_title || c.content || ''}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  c.id = `auto-${h.toString(36)}`;
  return c;
}

function applyBodyPatch(patch) {
  if (!patch || typeof patch !== 'object' || !patch.section) return;
  const sectionId = patch.section;
  if (!session.sections[sectionId]) {
    session.sections[sectionId] = { cards: [], last_updated: null };
  }
  if (Array.isArray(patch.cards)) {
    // Drop cards the user already dismissed at INGEST, not just at render.
    // The agent re-fetches the same threads on every gather; without this
    // they'd be persisted back into session.json and flash on the next load
    // before the render-time filter hides them. (Seed loads before any
    // gather — see init() — so dismissedUrls is populated by the time a
    // body_patch arrives.)
    const incoming = patch.cards.filter(c => !isDismissed(c)).map(ensureCardId);
    // Two modes:
    //   default (replace) — cards in patch fully replace existing cards.
    //                       Used by Gather web's mentions/trend/discovery
    //                       patches and by the page-side gather-local that
    //                       seeds the progress card.
    //   "append"          — concatenate to existing cards, deduping by id.
    //                       Used by the Draft step so newly-generated draft
    //                       cards land alongside the progress card without
    //                       clobbering it.
    if (patch.mode === 'append') {
      const existing = session.sections[sectionId].cards || [];
      const seen = new Set(existing.map(c => c.id).filter(Boolean));
      const additions = incoming.filter(c => !c.id || !seen.has(c.id));
      session.sections[sectionId].cards = existing.concat(additions);
    } else {
      session.sections[sectionId].cards = incoming;
    }
  }
  const ts = patch.last_updated || new Date().toISOString();
  session.sections[sectionId].last_updated = ts;
  stampTabScan(sectionId, session.sections[sectionId].cards, ts);
}

// Record per-tab "last scanned" so each tab can show when it last got data.
// discovery is cross-source, so stamp by each card's source; the rest map
// section→tab directly.
function stampTabScan(sectionId, cards, ts) {
  if (!session.last_scan) session.last_scan = {};
  const stamp = (id) => { session.last_scan[id] = ts; };
  if (sectionId === 'discovery') {
    for (const c of (cards || [])) {
      if (!c || c.type === 'empty') continue;
      const s = cardSource(c);
      if (s === 'x' || s === 'hn' || s === 'reddit' || s === 'bluesky') stamp(s);
    }
  } else if (sectionId === 'hn_submit') stamp('hn');
  else if (sectionId === 'x_roster') stamp('x');
  else if (sectionId === 'mentions' || sectionId === 'replies_due') stamp('mentions');
  else if (sectionId === 'progress_drafts') stamp('progress');
}

// "3m ago" / "2h ago" / "5d ago" from an ISO timestamp.
// Age for card metas: prefer the tool's verbatim timestamp over the
// model-authored age_hours (models botch date math — a 7d comment once
// rendered as "17h ago").
function cardAge(obj) {
  if (obj?.created_iso) { const t = relTime(obj.created_iso); if (t) return t; }
  return obj?.age_hours != null ? formatAge(obj.age_hours) : '';
}

function relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
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
  enrichHNAges();
}

// ── HN age enrichment — ages come from HN, not the model ────────────────────
// The agent kept inventing age_hours on mention cards (a 7-day-old comment
// rendered "17h", then "27d" across two runs, despite an explicit contract).
// Mechanical invariants are derived page-side: for any HN card missing
// created_iso, fetch the linked item's real timestamp from Algolia once and
// stamp it — cardAge() prefers created_iso, so the meta self-corrects.
const hnAgeFetched = new Set();
async function enrichHNAges() {
  const jobs = [];
  for (const sec of Object.values(session.sections || {})) {
    for (const c of sec.cards || []) {
      const m = String(c.url || c.thread_url || '').match(/news\.ycombinator\.com\/item\?id=(\d+)/);
      if (!m || c.created_iso || hnAgeFetched.has(m[1])) continue;
      hnAgeFetched.add(m[1]);
      jobs.push((async () => {
        try {
          const r = await fetch(`https://hn.algolia.com/api/v1/items/${m[1]}`);
          const item = r.ok ? await r.json() : null;
          if (!item?.created_at) return false;
          c.created_iso = item.created_at;
          // Single-comment threads show that same comment as OP/conversation —
          // stamp those nodes too so their labels stop echoing model junk.
          const conv = Array.isArray(c.conversation) ? c.conversation : [];
          if (conv.length === 1 && !conv[0].created_iso) conv[0].created_iso = item.created_at;
          if (c.original_post && !c.original_post.created_iso && conv.length <= 1) {
            c.original_post.created_iso = item.created_at;
          }
          return true;
        } catch { return false; }
      })());
    }
  }
  if (!jobs.length) return;
  const changed = (await Promise.all(jobs)).some(Boolean);
  if (changed) {
    renderStatusStrip();
    renderSections();
    if (onChangeCallback) onChangeCallback(session);
  }
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
  el.innerHTML = parts.join('');
}

// ---- Tabs ----------------------------------------------------------------
// The card area is split into per-source tabs (X · HN · Reddit · Bluesky ·
// Mentions · Progress) so each source gets room to breathe. Sections are
// keyed by content-type (discovery/mentions/…); a tab pulls the relevant
// sections and, for `discovery`, filters cards to its own source. The X tab
// additionally hosts the roster card + dashboard (mounted by pulse-app into
// #x-tab-extras).
const TABS = [
  { id: 'x',        label: 'X',        siteKey: 'x',          source: 'x',       sections: ['discovery'] },
  { id: 'hn',       label: 'HN',       siteKey: 'hackernews', source: 'hn',      sections: ['discovery', 'hn_submit'] },
  { id: 'reddit',   label: 'Reddit',   siteKey: 'reddit',     source: 'reddit',  sections: ['discovery'] },
  { id: 'bluesky',  label: 'Bluesky',  siteKey: 'bluesky',    source: 'bluesky', sections: ['discovery'] },
  { id: 'mentions', label: 'Mentions', siteKey: null,         source: null,      sections: ['mentions', 'replies_due'] },
  { id: 'progress', label: 'Progress', siteKey: null,         source: null,      sections: ['progress_drafts'] },
];

// Which source a card belongs to. Reddit/Bluesky discovery cards are tagged
// by `sub` (Bluesky's is always "bsky"); X/HN carry an explicit `source`.
function cardSource(c) {
  const s = (c.source || '').toLowerCase();
  const sub = (c.sub || '').toLowerCase();
  if (sub === 'bsky') return 'bluesky';
  if (sub) return 'reddit';
  if (s === 'x' || s === 'twitter') return 'x';
  if (s === 'hn' || s.includes('hacker')) return 'hn';
  if (s === 'reddit' || s.startsWith('r/')) return 'reddit';
  if (s === 'bsky' || s.includes('bluesky')) return 'bluesky';
  return s || 'other';
}

function siteEnabled(siteKey) {
  if (!siteKey) return false;
  return !!(pageConfig && pageConfig.sites && pageConfig.sites[siteKey] && pageConfig.sites[siteKey].enabled);
}

// The visible (post-filter) cards a tab owns, grouped by section.
function collectTabSections(tab) {
  const out = [];
  for (const sectionId of tab.sections) {
    const sec = session.sections[sectionId];
    if (!sec || !Array.isArray(sec.cards)) continue;
    let cards = sec.cards.filter(c => !shouldFilterCard(c));
    if (tab.source && sectionId === 'discovery') {
      cards = cards.filter(c => cardSource(c) === tab.source);
    }
    out.push({ sectionId, original: sec, cards });
  }
  return out;
}

function tabCardCount(tab) {
  return collectTabSections(tab).reduce((n, s) => n + s.cards.length, 0);
}

// A site tab (X/HN/Reddit/Bluesky) shows when its source is configured-on
// (so the X dashboard / "no posts yet" still appears) or when it has cards.
// Mentions/Progress aren't gated by any site config — they're always visible,
// same as an enabled site tab, with their own "nothing yet" state until the
// first gather lands a card.
function tabVisible(tab, count) {
  if (tab.siteKey) return siteEnabled(tab.siteKey) || count > 0;
  return true;
}

function setActiveTab(id) {
  activeTab = id;
  try { localStorage.setItem('pulse:tab', id); } catch (e) { /* ignore */ }
  renderSections();
}

function renderSections() {
  const container = document.getElementById('sections-container');
  if (!container) return;
  container.innerHTML = '';

  const counts = {};
  for (const tab of TABS) counts[tab.id] = tabCardCount(tab);
  const visible = TABS.filter(t => tabVisible(t, counts[t.id]));

  if (visible.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'state-msg';
    msg.textContent = "No data for this session yet. Pick a chip above, or type a goal in chat to start.";
    container.appendChild(msg);
    return;
  }

  // Resolve the active tab: honor the user's last pick if still visible,
  // else prefer X, else the first visible tab.
  if (!activeTab || !visible.some(t => t.id === activeTab)) {
    activeTab = (visible.find(t => t.id === 'x') || visible[0]).id;
  }

  container.appendChild(renderTabBar(visible, counts));
  const body = document.createElement('div');
  body.className = 'tab-body';
  container.appendChild(body);
  renderTabContent(visible.find(t => t.id === activeTab), body);
}

function renderTabBar(visible, counts) {
  const bar = document.createElement('div');
  bar.className = 'tabs';
  for (const tab of visible) {
    const b = document.createElement('button');
    b.className = 'tab' + (tab.id === activeTab ? ' active' : '');
    b.dataset.tab = tab.id;
    b.appendChild(textNode(tab.label));
    if (counts[tab.id] > 0) {
      const c = document.createElement('span');
      c.className = 'tab-count';
      c.textContent = counts[tab.id];
      b.appendChild(c);
    }
    b.addEventListener('click', () => setActiveTab(tab.id));
    bar.appendChild(b);
  }
  return bar;
}

const DRAFT_LABELS = {
  x: '✎ Draft', hn: '✎ Draft', reddit: '✎ Draft', progress: '✎ Draft posts',
};

const RESCAN_LABELS = {
  x: '↻ Rescan X', hn: '↻ Rescan HN', reddit: '↻ Rescan Reddit',
  bluesky: '↻ Rescan Bluesky', mentions: '↻ Check mentions', progress: '↻ Refresh progress',
};

function renderTabContent(tab, body) {
  // Per-tab Rescan — runs a source-scoped gather in the current session.
  const actions = document.createElement('div');
  actions.className = 'tab-actions';
  const scanned = (session.last_scan || {})[tab.id];
  if (scanned) {
    const meta = document.createElement('span');
    meta.className = 'tab-scan';
    meta.textContent = `last scan ${relTime(scanned)}`;
    actions.appendChild(meta);
  }
  const rescan = document.createElement('button');
  rescan.className = 'rescan-btn';
  rescan.textContent = RESCAN_LABELS[tab.id] || '↻ Rescan';
  rescan.addEventListener('click', () => {
    if (typeof onRescanCallback !== 'function') return;
    onRescanCallback(tab.id);
    rescan.disabled = true;
    rescan.textContent = 'Rescanning…';
    setTimeout(() => { rescan.disabled = false; rescan.textContent = RESCAN_LABELS[tab.id] || '↻ Rescan'; }, 4000);
  });
  actions.appendChild(rescan);
  // Draft — only on tabs with something to draft: source tabs with a target
  // lane (x/hn/reddit), and Progress (full multi-lane draft). Bluesky has no
  // lane; Mentions cards carry inline draft replies already.
  const draftLabel = DRAFT_LABELS[tab.id];
  if (draftLabel) {
    const draft = document.createElement('button');
    draft.className = 'rescan-btn';
    draft.textContent = draftLabel;
    draft.addEventListener('click', () => {
      if (typeof onDraftCallback !== 'function') return;
      onDraftCallback(tab.id);
      draft.disabled = true;
      draft.textContent = 'Drafting…';
      setTimeout(() => { draft.disabled = false; draft.textContent = draftLabel; }, 4000);
    });
    actions.appendChild(draft);
  }
  body.appendChild(actions);

  // The X + HN tabs host a dashboard (X: roster + growth; HN: karma + live
  // submissions). pulse-app renders into this mount after each gather (kept
  // across re-renders by id). Other tabs have no extras.
  if (tab.id === 'x' || tab.id === 'hn') {
    const extras = document.createElement('div');
    extras.id = `${tab.id}-tab-extras`;
    extras.className = `${tab.id}-tab-extras tab-extras`;
    body.appendChild(extras);
    if (typeof onTabRenderCallback === 'function') {
      try { onTabRenderCallback(tab.id, extras); } catch (e) { /* ignore */ }
    }
  }

  let renderedAny = false;
  for (const { sectionId, original, cards } of collectTabSections(tab)) {
    if (cards.length === 0) {
      // Section had cards but all were filtered → show why (not silent).
      const hadVisible = original.cards.some(c => c.type !== 'empty');
      if (!hadVisible) continue;
      const placeholder = { type: 'empty', id: `empty-${sectionId}`, message: emptyFilteredMessage(sectionId, original.cards.length) };
      body.appendChild(renderSectionEl(sectionId, { ...original, cards: [placeholder] }));
      renderedAny = true;
      continue;
    }
    body.appendChild(renderSectionEl(sectionId, { ...original, cards }));
    renderedAny = true;
  }

  if (!renderedAny && tab.id !== 'x') {
    const msg = document.createElement('div');
    msg.className = 'state-msg';
    msg.textContent = `Nothing in ${tab.label} yet — run a gather, or type a goal in chat.`;
    body.appendChild(msg);
  }
}

// Group key for mention cards — collapses every mention from the SAME post
// into one tree. `thread_title` is the reliable shared signal (all comments on
// a story carry the same story title); per the "don't trust the model for
// mechanical ids" rule we do NOT depend on the agent mapping story-vs-comment
// urls correctly. Falls back to the normalized thread url, then the card id.
export function mentionGroupKey(card) {
  const title = String(card.thread_title || card.title || '').trim();
  if (title) return 'ttl:' + title.slice(0, 100).toLowerCase();
  const u = card.thread_url || card.story_url || card.url || '';
  return normalizeThreadUrl(u) || ('id:' + (card.id || ''));
}

// Which mention groups the user has expanded. Multi-card groups start
// COLLAPSED — the whole point: a front-page post shouldn't flood the inbox.
// The header shows the post + comment count; one click reveals the tree.
const expandedMentionGroups = new Set();
export function toggleMentionGroup(key) {
  if (expandedMentionGroups.has(key)) { expandedMentionGroups.delete(key); return false; }
  expandedMentionGroups.add(key);
  return true;
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

  // The mentions inbox groups cards from the same post into a collapsible
  // tree (dismiss the whole post, or a single comment). Other sections stay
  // flat.
  if (sectionId === 'mentions') {
    renderMentionsGrouped(wrap, sec.cards);
  } else {
    for (const card of sec.cards) wrap.appendChild(renderCard(card));
  }

  return wrap;
}

// Group the mentions section by post. Singletons render flat (no tree chrome);
// posts with 2+ mentions get one collapsible group. First-seen order is
// preserved so the inbox order doesn't jump around.
function renderMentionsGrouped(wrap, cards) {
  const groups = new Map();
  const order = [];
  for (const c of cards) {
    if (c.type === 'empty') { wrap.appendChild(renderCard(c)); continue; }
    const k = mentionGroupKey(c);
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k).push(c);
  }
  for (const k of order) {
    const gc = groups.get(k);
    if (gc.length === 1) wrap.appendChild(renderCard(gc[0]));
    else wrap.appendChild(renderMentionGroup(k, gc));
  }
}

function renderMentionGroup(key, cards) {
  const first = cards[0];
  const title = first.thread_title || first.title || 'thread';
  const source = first.source || 'mentions';
  const n = cards.length;
  const expanded = expandedMentionGroups.has(key);
  const g = document.createElement('div');
  g.className = 'mgroup' + (expanded ? '' : ' collapsed');
  g.dataset.group = key;
  g.innerHTML = `
    <div class="mgroup-head">
      <button class="mgroup-toggle" data-action="toggle-group" data-group="${escapeAttr(key)}">
        <span class="mgroup-chev">▸</span>
        <span class="mgroup-title">${escapeHtml(truncateText(title, 80))}</span>
        <span class="mgroup-count">${n}</span>
      </button>
      <span class="mgroup-meta">${escapeHtml(source)}</span>
      <button class="mgroup-dismiss" data-action="dismiss-group" data-group="${escapeAttr(key)}" title="Dismiss all ${n}">Dismiss all ×</button>
    </div>
    <div class="mgroup-body"></div>
  `;
  const bodyEl = g.querySelector('.mgroup-body');
  for (const c of cards) bodyEl.appendChild(renderCard(c));
  return g;
}

function renderCard(card) {
  switch ((card.type || '').toLowerCase()) {
    case 'mention':      return renderMention(card);
    case 'reply_to_me':  return renderReplyToMe(card);
    case 'reply':        return renderReply(card);
    case 'discovery':    return renderDiscovery(card);
    case 'submit':
    case 'hn_submit':    return renderSubmit(card); // models emit the section name
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
  // Link-only thread roots (typical HN story) have no text of their own, so
  // the agent echoes the mention comment into original_post despite the
  // SKILL.md rule. An OP block that repeats a conversation node is noise.
  const opBody = String(op?.body || '').trim();
  const opIsEcho = !opBody
    || conv.some(step => String(step?.body || '').trim() === opBody);
  const opHtml = op && !opIsEcho
    ? `<div class="thread-original"><div class="thread-label">Original post${op.author ? ' · ' + escapeHtml(op.author) : ''}${cardAge(op) ? ' · ' + cardAge(op) : ''}</div><div class="thread-body">${escapeHtml(truncateText(op.body || '', 220))}</div></div>`
    : '';
  const convHtml = conv.length > 0
    ? renderConversation(conv, collapsed)
    : (c.quote ? `<div class="quote">${escapeHtml(c.quote)}</div>` : '');
  return cardEl(c, 'unread', `
    <div class="title">${escapeHtml(c.actor || 'Someone')} mentioned <b>${escapeHtml(c.watched_term || c.thread_title || 'your watch')}</b></div>
    <div class="meta">${escapeHtml(c.source || '')}${c.sub ? ' · r/' + escapeHtml(c.sub) : ''} · ${cardAge(c)}${c.thread_title ? ' · "' + escapeHtml(truncateText(c.thread_title, 70)) + '"' : ''}</div>
    ${opHtml}
    ${convHtml}
    ${draftHtml}
    ${actionRow(c, ['copy', 'open', 'copy-url', 'dismiss'])}
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
  const replyAge = cardAge(c.reply) || cardAge(c);
  const replyScore = c.reply?.score;
  const yourBody = c.your_comment?.body || c.parent_comment_body || '';
  const yourCommentHtml = yourBody
    ? `<div class="thread-original"><div class="thread-label">Your comment${c.your_comment?.age_hours != null ? ' · ' + formatAge(c.your_comment.age_hours) : ''}</div><div class="thread-body">${escapeHtml(truncateText(yourBody, 280))}</div></div>`
    : '';
  const replyMeta = [
    `${escapeHtml(c.actor || c.author || 'Someone')} replied`,
    replyAge || null,
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
    ${actionRow(c, ['copy', 'open', 'copy-url', 'dismiss'])}
  `);
}

function renderConversation(conv, collapsedCount) {
  if (conv.length === 0) return '';
  const parts = [];
  conv.forEach((node, idx) => {
    const isLast = idx === conv.length - 1;
    const labelTxt = idx === 0 && conv.length > 1 ? 'First reply' :
                     isLast ? 'Latest reply' : 'Reply';
    const meta = `${labelTxt}${node.author ? ' · ' + escapeHtml(node.author) : ''}${cardAge(node) ? ' · ' + cardAge(node) : ''}`;
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
          ${fu.comment_url ? `<button data-action="copy-url" data-card="${c.id}" data-url="${escapeAttr(fu.comment_url)}">🔗 Copy URL</button>` : ''}
          <button class="dismiss" data-action="dismiss-followup" data-card="${c.id}">×</button>
        </div>
      </div>
    `;
  }
  return cardEl(c, 'unread', `
    <div class="title">Your ${escapeHtml(c.platform || 'post')}: <b>"${escapeHtml(c.your_post_title || 'post')}"</b></div>
    <div class="meta">posted ${c.posted_at ? formatAge(hoursSince(c.posted_at)) : ''} · ${c.unanswered_count || 0} unanswered comments${c.score != null ? ' · ' + c.score + ' points' : ''}${c.ratio != null ? ' · ratio ' + c.ratio : ''}</div>
    ${actionRow(c, ['draft-replies', 'open', 'copy-url', 'dismiss'])}
    ${followupHtml}
  `);
}

function renderDiscovery(c) {
  // Strip HTML tags from the post body for safety; agent receives Reddit's
  // JSON which sometimes includes formatted markdown — we show plain text.
  const excerpt = (c.excerpt || c.body || '').replace(/<[^>]+>/g, '').trim();
  const truncatedExcerpt = excerpt.length > 800 ? excerpt.slice(0, 797) + '…' : excerpt;
  // Optional reply target: when the agent picks a specific comment in the
  // thread to engage with (rather than replying to the OP), it emits
  // reply_target with the comment's author + body + meta. We render that
  // block between the OP excerpt and the draft so the user sees what the
  // draft is actually responding to.
  const t = c.reply_target;
  const targetBody = (t?.body || '').replace(/<[^>]+>/g, '').trim();
  const targetTruncated = targetBody.length > 1200 ? targetBody.slice(0, 1197) + '…' : targetBody;
  // Safety net: if the picked comment just restates the OP (common on Show HN,
  // where the submitter's first comment IS the product blurb), don't render a
  // redundant block — the prompt is told not to pick these, this catches slips.
  const norm = (s) => (s || '').slice(0, 120).toLowerCase().replace(/\s+/g, ' ').trim();
  const targetDupesExcerpt = !!targetBody && norm(targetBody) === norm(excerpt);
  const targetMeta = t ? [
    t.author ? escapeHtml(t.author) + ' replied' : 'Replied',
    t.age_hours != null ? formatAge(t.age_hours) : null,
    t.score != null ? `${t.score} pts` : null,
    t.depth != null && t.depth > 1 ? `depth ${t.depth}` : null,
  ].filter(Boolean).join(' · ') : '';
  const targetHtml = t && targetTruncated && !targetDupesExcerpt
    ? `<div class="thread-step latest"><div class="thread-label">↳ ${targetMeta}</div><div class="thread-body">${escapeHtml(targetTruncated)}</div></div>`
    : '';
  // Renderer reads thread_title; accept title too (HN/X cards emit title).
  const threadTitle = c.thread_title || c.title || '';
  const draftLabel = (t && !targetDupesExcerpt) ? 'Draft reply' : 'Draft comment';
  // X reply cards get a "Mark posted" action so the user can log which replies
  // they actually posted — that feeds the X dashboard's posted-per-day series.
  const isX = (c.source || '').toLowerCase() === 'x';
  const discActions = (isX && c.draft_starter && !c.posted)
    ? ['copy', 'open', 'copy-url', 'x-posted', 'dismiss']
    : ['copy', 'open', 'copy-url', 'dismiss'];
  const postedBadge = c.posted ? ' · <span class="posted-badge">✓ posted</span>' : '';
  return cardEl(c, 'cold', `
    <div class="title">${escapeHtml(c.source || '')}${c.sub ? ' · r/' + escapeHtml(c.sub) : ''}${threadTitle ? ' · <b>"' + escapeHtml(threadTitle) + '"</b>' : ''}</div>
    <div class="meta">${c.author ? 'by ' + escapeHtml(c.author) + ' · ' : ''}${c.comments != null ? c.comments + ' comments · ' : ''}${formatAge(c.age_hours)}${c.match_reason ? ' · ' + escapeHtml(c.match_reason) : ''}${postedBadge}</div>
    ${truncatedExcerpt ? `<div class="excerpt">${escapeHtml(truncatedExcerpt)}</div>` : ''}
    ${targetHtml}
    ${c.draft_starter ? `<div class="draft-inline"><div class="draft-inline-label">${draftLabel}</div><div class="draft-inline-body">${escapeHtml(c.draft_starter)}</div></div>` : ''}
    ${actionRow(c, discActions)}
  `);
}

// HN submit candidate — a third-party article to SUBMIT to HN (lowers the
// own-post ratio). NO draft: it's a title + url to post. The primary action
// opens HN's prefilled submitlink form; the url shown is the external article
// (never a news.ycombinator.com link). hn_status "fresh" = verified not on HN;
// "unchecked" = Algolia was unreachable, so flag it for a manual check.
function renderSubmit(c) {
  const title = c.title || c.thread_title || '(untitled)';
  const statusBit = c.hn_status === 'unchecked'
    ? '⚠ verify on hn.algolia.com first'
    : '✓ not on HN';
  const metaBits = [
    c.source ? escapeHtml(c.source) : null,
    c.score ? `${c.score} pts` : null,
    c.age_hours != null ? formatAge(c.age_hours) : null,
    statusBit,
  ].filter(Boolean).join(' · ');
  return cardEl(c, 'cold', `
    <div class="title"><b>${escapeHtml(title)}</b></div>
    <div class="meta">${metaBits}</div>
    ${c.url ? `<div class="excerpt">${escapeHtml(c.url)}</div>` : ''}
    ${actionRow(c, ['submit-hn', 'open-url', 'copy-url', 'dismiss'])}
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

// One-line explanation when a section's cards were all filtered by
// shouldFilterCard. Section-specific because the reason differs:
// discovery → already-commented; mentions → self-latest-reply;
// replies_due → empty reply stubs.
function emptyFilteredMessage(sectionId, originalCount) {
  const n = originalCount;
  const s = n === 1 ? '' : 's';
  switch (sectionId) {
    case 'discovery':
      return `Found ${n} opportunit${n === 1 ? 'y' : 'ies'} — all on threads you've already commented on. No fresh leads this run.`;
    case 'mentions':
      return `Found ${n} mention${s} — all by you or already answered.`;
    case 'replies_due':
      return `Found ${n} reply card${s} — none with actionable activity.`;
    default:
      return `Found ${n} item${s} — all filtered.`;
  }
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
  'draft-post':     { label: '✎ Draft post',     primary: true },
  'submit-hn':      { label: '↗ Submit on HN',   primary: true },
  'reply-back':     { label: '✎ Reply back',     primary: true },
  'polish':         { label: '✎ Polish',         primary: true },
  'open':           { label: '↗ Open',           primary: false },
  'open-url':       { label: '↗ Open',           primary: false },
  'copy':           { label: '📋 Copy',           primary: false },
  'copy-url':       { label: '🔗 Copy URL',       primary: false },
  'mark-posted':    { label: '☐ Mark posted',    primary: false },
  'x-posted':       { label: '☐ Mark posted',    primary: false },
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
  const map = { '24h': 'Last 24 hours', '7d': 'This week', '30d': 'This month' };
  return map[w] || w;
}
