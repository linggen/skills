// pulse-app.js — Pulse main page app shell.
//
// Responsibilities:
//   1. Embed Linggen's BareSessions iframe (/sessions?skill=pulse) as the
//      left sidebar. Listen for session_select / session_create postMessage
//      events from it; route by navigating the top window so the chat
//      iframe re-mounts on the chosen session.
//   2. Load the selected session's session.json, hand it to the
//      renderer (page-render.js).
//   3. Mount the Linggen chat iframe in the right column. Forward
//      PageUpdate tool calls from the agent to the renderer.
//   4. Persist the in-memory session back to disk on every body_patch.
//   5. Wire action chips and card actions to chat messages.
//   6. Render the status strip from state/ files.
//
// Schema in design.md. Bash bridge is /api/bash (ungated by Linggen's
// agent permission system, so the page does its own filesystem work).

import { applyPageUpdate, loadSession, getSession, setOnChange, setSelfHandle, setCommentedThreadUrls, getCommentedThreadUrls, setDismissedUrls, addDismissedUrl, getDismissedUrls, resetPage } from './page-render.js';
import { readPulseConfig, replayRuntimeGrants, applyCompactConfig } from './api.js';

const SKILL_DIR = '$HOME/.linggen/skills/pulse';

// ---- App state -----------------------------------------------------------

const state = {
  // Active chat session id (the one the chat panel is attached to).
  // Set after chat-bridge mount; persisted-card storage is keyed by this.
  activeSessionId: null,
  // Currently-viewed session id (may differ from active if user clicked a
  // past session in the sidebar). Cards on the page reflect this.
  viewSessionId: null,
  chat: null,              // chat-bridge controller
  // Boot resolution (set once by resolveBootSession before mountChat):
  //   resumeSid    — session id to attach to, or null to mint a fresh one
  //   isNewSession — true when this open should greet + auto-cascade
  resumeSid: null,
  isNewSession: false,
};

// ---- Bash bridge ---------------------------------------------------------

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

async function readJson(path, fallback = null) {
  const cmd = `[ -f "${path}" ] && cat "${path}" || true`;
  const out = (await runBash(cmd)).trim();
  if (!out) return fallback;
  try { return JSON.parse(out); } catch { return fallback; }
}

// Newest engine session id for this skill, by session.json mtime. Only
// `sess-*` dirs (engine-resumable); legacy date-named dirs are skipped.
// Returns null when no prior session exists.
async function findLatestSessionId() {
  const cmd = `ls -1t "${SKILL_DIR}/data/"sess-*/session.json 2>/dev/null | head -1 || true`;
  const out = (await runBash(cmd)).trim();
  if (!out) return null;
  // .../data/<sid>/session.json → <sid>
  const parts = out.split('/');
  return parts[parts.length - 2] || null;
}

// Decide what this page open should do, before chat mounts:
//   ?session=<id> → resume that session statically
//   ?new=1        → mint a fresh session (greet + cascade), then strip the
//                   marker so a later refresh resumes it instead of re-minting
//   (no params)   → resume the most-recent session; if none exist yet, mint one
async function resolveBootSession() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('session')) {
    state.resumeSid = params.get('session');
    state.isNewSession = false;
    return;
  }
  if (params.get('new')) {
    state.resumeSid = null;
    state.isNewSession = true;
    // Drop ?new=1 so refreshing the freshly-minted session resumes it.
    const url = new URL(window.location.href);
    url.searchParams.delete('new');
    history.replaceState(null, '', url);
    return;
  }
  const latest = await findLatestSessionId();
  state.resumeSid = latest;            // null on first-ever open
  state.isNewSession = !latest;        // nothing to resume → behave like New
}

async function writeJson(path, value) {
  const json = JSON.stringify(value, null, 2);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  const cmd = `mkdir -p "$(dirname "${path}")" && echo "${b64}" | base64 --decode > "${path}"`;
  await runBash(cmd);
}

// ---- Sessions iframe bridge ---------------------------------------------
//
// The sidebar is now Linggen's BareSessions React component loaded via
// `<iframe src="/sessions?skill=pulse&active=<sid>">`. It owns rendering,
// time grouping, running spinner, delete, and batch-select. We only:
//   - point the iframe at /sessions with the right URL params
//   - listen for postMessage events so user clicks navigate the host page
function setupSessionsIframe(activeSid) {
  const ifr = document.getElementById('sessions-iframe');
  if (!ifr) return;
  const params = new URLSearchParams({ skill: 'pulse' });
  if (activeSid) params.set('active', activeSid);
  ifr.src = `/sessions?${params.toString()}`;
}

function handleSessionsMessage(e) {
  if (e.data?.type !== 'linggen-skill-event') return;
  const sid = e.data.payload?.sessionId;
  if (!sid) return;
  if (e.data.event === 'session_select' || e.data.event === 'session_create') {
    selectSession(sid).catch(err => console.warn('[pulse] switch session failed', err));
  }
}

// ---- Session selection ---------------------------------------------------

async function selectSession(sid) {
  // Switch in place: re-point the chat iframe at the session and re-render
  // the section cards for it. No full page reload, so the session sidebar
  // doesn't flash empty. chat-bridge.setSession reloads only the chat iframe.
  if (!sid || sid === state.viewSessionId) return;
  const url = new URL(window.location.href);
  url.searchParams.set('session', sid);
  history.replaceState(null, '', url);
  state.viewSessionId = sid;
  state.activeSessionId = sid;
  setSidebarActive(sid);
  if (state.chat) await state.chat.setSession(sid);
  const sess = await readJson(`${SKILL_DIR}/data/${sid}/session.json`);
  loadSession(sess);
  document.getElementById('session-title').textContent = 'pulse session';
  document.getElementById('session-sub').textContent =
    'Pick a chip above, or type a goal in chat to start.';
}

// Move the sidebar iframe's highlight without reloading it (BareSessions
// listens for this `set_active` message).
function setSidebarActive(sid) {
  const ifr = document.getElementById('sessions-iframe');
  ifr?.contentWindow?.postMessage(
    { type: 'linggen-skill', action: 'set_active', payload: { sessionId: sid } }, '*');
}

// ---- Persistence ---------------------------------------------------------

async function persistSession(session) {
  // Cards are stored per chat-session-id. We only persist for the
  // currently-viewed session — past sessions are read-only browsable.
  if (!state.viewSessionId) return;
  if (state.viewSessionId !== state.activeSessionId) return;
  const sid = state.viewSessionId;
  const path = `${SKILL_DIR}/data/${sid}/session.json`;
  if (!session.session_id) session.session_id = sid;
  if (!session.started_at) session.started_at = new Date().toISOString();
  try {
    await writeJson(path, session);
    notifyRunningChipsFromSession(session);
  } catch (err) {
    console.warn('[pulse] persist failed', err);
  }
}

// Walk session.sections and complete any running chip whose expected
// section has cards now. Conservative: only fires once cards arrive, not
// just on last_updated bumps.
function notifyRunningChipsFromSession(session) {
  if (!session?.sections) return;
  for (const [secId, sec] of Object.entries(session.sections)) {
    if (Array.isArray(sec.cards) && sec.cards.length > 0) {
      completeChipFromSectionUpdate(secId);
    }
  }
}

// ---- Status strip --------------------------------------------------------

async function loadStatusStrip() {
  // For phase B we read state/account-health.json + state/launches.json
  // and assemble a strip. If state/ doesn't exist yet, the strip stays
  // hidden (renderer handles empty case).
  const health = await readJson(`${SKILL_DIR}/state/account-health.json`, {});
  const launches = await readJson(`${SKILL_DIR}/state/launches.json`, []);
  const items = [];

  for (const [platform, info] of Object.entries(health || {})) {
    if (!info) continue;
    if (info.karma != null && info.karma_threshold) {
      items.push({ label: platform, value: `${info.karma}/${info.karma_threshold}`, tone: 'ok' });
    } else if (info.status) {
      items.push({ label: platform, value: '', tone: info.status === 'warm' ? 'ok' : 'warn' });
    }
  }

  for (const l of (launches || [])) {
    if (l.days_since != null) {
      items.push({ label: `${l.days_since}d since ${l.name}`, tone: 'neutral' });
    }
    if (l.followup_due) {
      items.push({ label: `${l.followup_due} due`, tone: 'due' });
    }
  }

  if (items.length > 0) {
    applyPageUpdate({ status_strip_patch: items });
  }
}

// ---- Pipeline chips -----------------------------------------------------
//
// Three chips, one per pipeline step:
//   - gather-local : runs scripts/gather-local.sh via /api/bash (no agent
//                    cost; result lands as a `progress` card in
//                    `progress_drafts`).
//   - gather-web   : sends a goal sentence to the chat; the agent reads
//                    the local cards already in conversation history,
//                    decides which Fetch* tools to call, and emits
//                    body_patch blocks for mentions/replies_due/
//                    discovery/trend sections.
//   - draft        : sends a goal sentence to draft posts for enabled
//                    target lanes from whatever cards exist; agent emits
//                    body_patch on progress_drafts with `draft` cards.
//
// Chip state machine: idle → running → done | failed. The JS flips state
// based on either the script's return (local) or the renderer's onChange
// signal (web / draft) firing within a CHIP_TIMEOUT_MS window.

const CHIP_TIMEOUT_MS = 120_000;  // 2 min — agent steps can be slow

const PIPELINE_CHIPS = {
  'gather-local': {
    handler: runGatherLocal,
    expects: ['progress_drafts'],   // sections that should update
  },
  'gather-web': {
    handler: runGatherWeb,
    expects: ['mentions', 'replies_due', 'discovery', 'trend'],
  },
  'draft': {
    handler: runDraft,
    expects: ['progress_drafts'],
  },
};

// Tracks chips that are currently running, so onChange can complete them.
const runningChips = new Map();   // chipId → { resolve, reject, timer, expects }

function setChipState(chipId, state) {
  const btn = document.querySelector(`.chip[data-chip="${chipId}"]`);
  if (btn) btn.dataset.state = state;
}

function startChip(chipId, expects) {
  setChipState(chipId, 'running');
  return new Promise((resolve, reject) => {
    const armTimer = () => setTimeout(() => {
      const rec = runningChips.get(chipId);
      if (rec) {
        runningChips.delete(chipId);
        setChipState(chipId, 'failed');
        rec.reject(new Error(`chip "${chipId}" idle for ${CHIP_TIMEOUT_MS}ms`));
      }
    }, CHIP_TIMEOUT_MS);
    runningChips.set(chipId, { resolve, reject, timer: armTimer(), expects, armTimer });
  });
}

// Extend the timeout window on every signal of agent activity (e.g. an
// incoming PageUpdate). Without this, long-but-active Gather-web runs
// trip the wall-clock timeout while the agent is still working through
// 10+ Fetch tools — the chip flips to 'failed' (red !) even though the
// section content arrived a moment later. Adaptive timeout: fail only
// when the agent has been genuinely silent for CHIP_TIMEOUT_MS.
function pingRunningChips() {
  for (const rec of runningChips.values()) {
    clearTimeout(rec.timer);
    rec.timer = rec.armTimer();
  }
}

function completeChipFromSectionUpdate(sectionId) {
  // Walk running chips; if any was expecting this section, mark done.
  for (const [chipId, rec] of runningChips.entries()) {
    if (rec.expects && rec.expects.includes(sectionId)) {
      clearTimeout(rec.timer);
      runningChips.delete(chipId);
      setChipState(chipId, 'done');
      rec.resolve();
    }
  }
}

function failChip(chipId, err) {
  const rec = runningChips.get(chipId);
  if (rec) {
    clearTimeout(rec.timer);
    runningChips.delete(chipId);
    rec.reject(err);
  }
  setChipState(chipId, 'failed');
}

// ── Step 1: Gather local — script collects raw, agent narrates ──
//
// Two phases:
//   1. Script collects raw items (commits, sessions, files) — fast, no LLM.
//   2. Page pushes raw items + session transcripts to chat (hidden) and
//      asks the agent for a NARRATIVE progress card. Agent emits a
//      body_patch that lands as the user-visible card.
//
// Why agent-led: raw `git log` subjects dumped verbatim are noise (8 lines
// of "pulse: simplify ... / filter ... / drop ...") for a single afternoon
// of one repo's work. Sessions add the "why" — what problem the user
// wrestled with — which the script can't extract. The agent has the brief
// + transcripts and can produce one shipped summary line + 2-3 specific
// learned bullets tied to actual discussion.
async function runGatherLocal() {
  const expects = PIPELINE_CHIPS['gather-local'].expects;
  // Hold the chip's "done" promise so the cascade can await it.
  // Previous version fire-and-forgot via `.catch(() => {})`, which let
  // the cascade move to gather-web before the agent had emitted the
  // progress card, queuing prompts and starving the page.
  const chipPromise = startChip('gather-local', expects);
  try {
    const out = await runBash(`bash "${SKILL_DIR}/scripts/gather-local.sh"`);
    let data;
    try { data = JSON.parse(out); }
    catch (e) { throw new Error(`gather-local returned non-JSON: ${out.slice(0, 200)}`); }

    if (!data.items || data.items.length === 0) {
      // Nothing to summarize — render an empty card directly, skip the
      // agent call (no point paying tokens to summarize nothing).
      applyPageUpdate({
        body_patch: { section: 'progress_drafts', last_updated: new Date().toISOString(), cards: [{
          type: 'progress',
          id: `local-empty-${Date.now()}`,
          window: data.window?.expanded_to || '24h',
          items: [{ kind: 'decision', text: 'No local activity in window — try expanding or check workspace path.' }],
        }] },
      });
      completeChipFromSectionUpdate('progress_drafts');
      return chipPromise;
    }

    // Push raw activity + transcripts to chat as hidden context, then ask
    // the agent for the narrative card. Background-refresh own-commented
    // URLs while the agent works.
    await pushLocalContextToChat(data);
    refreshCommentedThreadUrls().catch(() => {});
    sendChatHidden([
      'Based on the CONTEXT BLOCK above (commits + session transcripts + changed files from the last 24 hours), emit ONE `body_patch` on `progress_drafts` with a single `progress` card. Replace mode (default — not append).',
      '',
      'Card shape:',
      '  { type: "progress", id: "local-<ts>", window: "<24h|7d|30d>", items: [',
      '    { kind: "shipped", text: "<ONE-line summary of all commits — group by repo/theme, ~120 chars. e.g. \'Pulse: simplified sidebar, filtered noise cards, dropped OAuth path.\'>" },',
      '    { kind: "learned", text: "<specific insight from a session transcript, ~120 chars. e.g. \'Reddit closed self-service API access in Nov 2025 — pivoted to public-JSON scraping only.\'>" },',
      '    // Up to 3 learned items total, each pulled from a real session transcript above. Skip if no session is worth surfacing.',
      '  ] }',
      '',
      'Hard rules:',
      '- ONE `shipped` line collapsing ALL commits into one phrase. Don\'t list commit subjects individually.',
      '- 1-3 `learned` lines tied to concrete moments in session transcripts (a pivot, a gotcha, a decision). Be specific — not "explored the codebase".',
      '- No "N files changed" line — mechanical noise.',
      '- Match the brief\'s voice. Strip "🚀", "I\'m thrilled", "TL;DR" if they sneak in.',
      '',
      'Emit just the body_patch. No prose response. Stay silent after.',
    ].join('\n'));
    // Chip flips to done when the agent's body_patch arrives on
    // progress_drafts — handled by persistSession → notifyRunningChipsFromSession.
    return chipPromise;
  } catch (err) {
    console.warn('[pulse] gather-local failed', err);
    failChip('gather-local', err);
    throw err;
  }
}

async function pushLocalContextToChat(data) {
  if (!state.chat || !data) return;
  const items = data.items || [];
  if (items.length === 0) return;
  const byKind = items.reduce((acc, it) => { (acc[it.kind] ||= []).push(it); return acc; }, {});
  const lines = [
    '[CONTEXT BLOCK — gather-local result. NOT a task. Acknowledge silently.',
    'Do not reply with prose, summaries, or "no action needed" notes. Just store',
    'this for the next gather-web / draft step. Your next turn fires only when',
    'a chip goal arrives.]',
    '',
  ];
  if (data.window) {
    lines.push(`Window: ${data.window.since} → ${data.window.until} (${data.window.expanded_to})`);
  }
  if (data.workspace) lines.push(`Workspace: ${data.workspace}`);
  lines.push('');
  if (byKind.commit?.length) {
    lines.push(`Commits (${byKind.commit.length}):`);
    for (const c of byKind.commit.slice(0, 20)) {
      lines.push(`  - [${c.source}] ${c.label}`);
    }
    lines.push('');
  }
  const sessions = (byKind['session-cc'] || []).concat(byKind['session-ling'] || []);
  if (sessions.length) {
    lines.push(`Sessions (${sessions.length}):`);
    for (const s of sessions.slice(0, 10)) {
      lines.push(`  - [${s.source}] ${s.label} — ${s.body}`);
    }
    lines.push('');
    // Extract transcript content for the top 5 sessions so the agent has
    // real material (not just metadata) for both the progress-card
    // narrative AND topic-picking in gather-web. Cap each transcript at
    // ~2k chars to keep the context block bounded (~10k total).
    const topSessions = sessions.slice(0, 5);
    for (const s of topSessions) {
      const excerpt = await extractSessionExcerpt(s);
      if (excerpt) {
        lines.push(`--- Session transcript: ${s.label} (${s.source}) ---`);
        lines.push(excerpt);
        lines.push('--- end transcript ---', '');
      }
    }
  }
  if (byKind.file?.length) {
    lines.push(`Recently changed files (${byKind.file.length}):`);
    for (const f of byKind.file.slice(0, 15)) {
      lines.push(`  - ${f.label}`);
    }
  }
  sendChatHidden(lines.join('\n'));
}

// Pre-fetch the user's recent own_comment URLs from reddit-mentions.sh
// so the renderer's discovery filter knows which threads the user has
// already weighed in on. Runs once at init, after each gather-local, and
// before each gather-web (so the discovery cards the agent is about to
// emit get filtered against fresh data). Public-JSON only — no OAuth.
//
// Reddit's /user/<u>/comments.json is the sole authority — Copy clicks
// do NOT mark threads as committed (Copy ≠ Posted; the user may copy a
// draft and never paste it, and false-positive suppression is worse than
// the 30s lag before Reddit indexes a fresh comment).
async function refreshCommentedThreadUrls() {
  let remote = [];
  try {
    const out = await runBash(`bash "${SKILL_DIR}/scripts/sites/reddit-mentions.sh"`);
    const data = JSON.parse(out);
    remote = (data?.items || [])
      .filter(it => it.kind === 'own_comment' && it.url)
      .map(it => it.url);
  } catch (e) {
    console.warn('[pulse] reddit-mentions own_comment fetch failed', e);
  }
  setCommentedThreadUrls(remote);
}

// Use ling-mem's extract_session.sh to pull a flattened transcript for
// one session, capped at 2000 chars. Best-effort: if extraction fails or
// ling-mem isn't installed, we silently skip the transcript.
async function extractSessionExcerpt(session) {
  const extract = `$HOME/.linggen/skills/ling-mem/scripts/extract_session.sh`;
  const filepath = session.ref;
  const source = session.source;  // "CC" or "Linggen"
  const date = session.ts;
  if (!filepath || !source) return '';
  try {
    const cmd = `[ -x "${extract}" ] && bash "${extract}" "${filepath.replace(/"/g, '\\"')}" "${source}" "${date}" 2000 2>/dev/null | head -c 2000 || true`;
    const out = await runBash(cmd);
    return (out || '').trim();
  } catch {
    return '';
  }
}


// ── Step 2: Gather web — agent reads local cards, picks queries ──
async function runGatherWeb() {
  const promise = startChip('gather-web', PIPELINE_CHIPS['gather-web'].expects);
  // Refresh the own-commented set BEFORE the agent emits discovery cards
  // so the renderer's filter has fresh data. The init() refresh is too
  // stale for this — user may have commented mid-session.
  await refreshCommentedThreadUrls();
  // Load the reddit handle so the agent can scan a thread's comment
  // authors and detect old comments (past Reddit's last-15 window that
  // FetchRedditMentions surfaces).
  let redditHandle = '';
  try {
    const cfg = await readPulseConfig();
    redditHandle = (cfg?.sites?.reddit?.username || '').trim().replace(/^u\//, '');
  } catch {}
  // Pre-filter at the agent level: pass the normalized skip set so the
  // agent drops already-commented threads during scoring instead of
  // drafting discovery comments that the renderer then silently hides.
  // Saves ~10-20k tokens per Gather web run when the skip set is full.
  // The renderer's isAlreadyCommented filter stays as defense-in-depth
  // (handles races where the user comments mid-Gather, or the agent
  // forgets the rule).
  const skipKeys = Array.from(new Set([...getCommentedThreadUrls(), ...getDismissedUrls()]));
  const skipBlock = skipKeys.length === 0 ? '' : [
    'SKIP_URLS — threads I have already commented on, marked as committed, or dismissed.',
    'Drop any source-tool result whose normalized post id appears in this',
    'list, BEFORE scoring or drafting. Match by post id, not by slug — for',
    'Reddit use the segment after /comments/<id>; for Bluesky use the post',
    'rkey (last URL segment). Skip applies to `discovery`, `trend`, and',
    '`mentions` sections (including reply_to_me cards). Format: <platform>:<post-id>.',
    ...skipKeys.map(k => `  - ${k}`),
    '',
  ].join('\n');
  const goal = [
    skipBlock,
    'Gather web signal for what I\'m working on right now.',
    '',
    'OUTPUT CONTRACT (read first): this step writes ONLY these four sections — `trend`, `discovery`, `mentions`, `replies_due` — and you MUST emit a body_patch for each one you gathered for. Do NOT emit or re-emit `progress_drafts`: that is Gather local\'s section, it is already on the page, and here it is INPUT you read, never output you write. A run that ends having only touched `progress_drafts` is a FAILED run.',
    '',
    'Read the local cards already in this session (the `progress` card in `progress_drafts` lists my recent commits, sessions, and changed files) — read-only INPUT. Pick 2-3 concrete topics that capture what I\'m actually working on this week.',
    '',
    'Then for each topic, call the relevant configured source tools (FetchReddit, FetchHackerNews, FetchLobsters, FetchArxiv, FetchRSS) in parallel. ALWAYS call FetchGitHubTrending as well — it is the always-on anchor of the `trend` section, so call it every run regardless of any config toggle; emit its repos as `trend` cards. Filter results for direct topical fit (score ≥ 0.6). If sites.x.enabled, also call FetchX with a focused query per topic (it takes a {query}; recent X posts, last ~7 days, costs API credits so keep to your top 1-2 topics) and treat its results like discovery/trend candidates — HN and X are trend supplements alongside GitHub Trending.',
    '',
    'HANDLING X (FetchX) RESULTS — X is NOT Reddit. An X hit has NO comment tree to WebFetch, NO already-commented check, NO reply_target. Do NOT run any of the Reddit-only discovery steps below on it. Instead emit each X hit that clears 0.6 DIRECTLY as a card: as a `discovery` card { source:"x", title:<tweet text>, excerpt:<tweet text>, url:<the x.com status url, REQUIRED>, draft_starter:<your reply in voice> } when it is a post I could reply to; or as a `trend` card { source:"x", title, url } when it is broad "what people are talking about" signal. If FetchX returned hits this run, your `discovery` and/or `trend` body_patch MUST contain X cards — do not silently drop every X result. (X recent-search is noisy/promotional, so it is fine to keep only the few that genuinely fit my category.)',
    '',
    'For mention-watching, also call FetchXMentions if sites.x.enabled — X (Twitter) mentions + replies via the official API; returns the SAME {kind: reply_to_me|mention, ...} shape with parent_comment_body for replies, so emit its items into the `mentions` section exactly like the reply_to_me / mention handling below (author is an @handle, url is an x.com link). It returns {items, count, errors}. If `items` is empty OR `errors` is non-empty (including a missing-credentials note), SKIP X mentions silently — do NOT create any card about it. A tool error/empty is NOT a mention.',
    'NEVER FABRICATE CARDS. Every mention / reply_to_me card MUST come from a real item a Fetch tool actually returned, about a real person. Do NOT invent a "system" mention, a status card, an error card, or a setup-instructions card (e.g. "X mentions unavailable — add credentials in Settings"). If a mention source returns no items or an error, it simply contributes no card. Only if NOTHING across ALL sources produced a real item do you emit ONE `empty` card for `mentions` with a one-line reason. Tool status/errors never become content cards.',
    '',
    'For mention-watching, call FetchRedditMentions — uses Reddit RSS feeds (the private inbox feed token for replies; public search RSS for username mentions). Works whenever sites.reddit.username is set. Returns kind ∈ {mention, reply_to_me} for (a) threads where the handle appears in post/comment text, and (b) direct replies to the user\'s recent comments (the real "someone replied to me" signal — the item is pre-walked and carries BOTH your comment via parent_comment_body and the reply via body). NOTE: a reply to a comment on someone else\'s thread belongs in mentions as reply_to_me — do NOT map it to replies_due (that section is reserved for posts the user broadcast through Pulse\'s Draft chip, tracked via state/posted.json).',
    '',
    'For each "mention" kind result, walk the thread tree (WebFetch <thread_url>.json) and emit a RICH mention card per the schema in SKILL.md: include `original_post`, `conversation` (first reply + latest if deep, with `collapsed_count`), and `draft_reply`.',
    '',
    'For each "reply_to_me" kind result, emit a card in the `mentions` section with `type: "reply_to_me"` — NOT `type: "mention"`. There is no thread chain to summarize: the script already pre-walked the tree and gave you BOTH sides on the item. Fields to emit: `actor` (from item.author, e.g. "u/Chance_Tree9196"), `thread_title` (from item.title), `sub` (item.sub), `url` (item.url), `your_comment: { body: <item.parent_comment_body, verbatim>, url: item.parent_comment_url }`, `reply: { body: <item.body, VERBATIM and COMPLETE — do not split, paraphrase, summarize, or truncate; the renderer shows up to 1200 chars itself>, score: item.score, age_hours: <hours since item.created_iso> }`, and `draft_reply` (your 2-3 sentence response in voice). Do NOT populate `original_post` or `conversation` — those belong to the `mention` shape; using them on a reply_to_me card splits the single reply into fake halves.',
    '',
    'Also run public mention-watching: for each watchlist term (products + competitors + self extracted from brief, plus sites.reddit.username if set), search the same sources and surface threads where the term appears.',
    '',
    'Now emit the body_patch blocks — one per section: `trend`, `discovery`, `mentions`, `replies_due` (NEVER `progress_drafts`). Every section you ran a gatherer for MUST get a body_patch: if it found nothing above the cutoff, emit that section with a single `empty` card and a one-line reason, so the page shows the run completed instead of staying blank. `trend` always gets a card (you always call FetchGitHubTrending).',
    '',
    'For `discovery` cards specifically (Reddit threads you suggest the user comment on): AFTER scoring, BEFORE drafting, WebFetch the FULL thread JSON for each surviving candidate. URL shape: `<thread_url>.json?limit=500&sort=top&raw_json=1` — no `depth` param, so Reddit returns the entire tree (every comment + every nested reply). One round-trip per thread.',
    'Three things to do with that full tree:',
    '  1. ALREADY-COMMENTED CHECK. SKIP_URLS only covers the user\'s last ~15 Reddit comments (Reddit\'s public API window). If the user commented on this thread months ago, it won\'t be in SKIP_URLS. Walk every comment author at every depth; if any equals "' + (redditHandle || '<sites.reddit.username>') + '" (case-insensitive, strip leading "u/"), SKIP this thread — DO NOT emit a discovery card for it. Non-negotiable.',
    '  2. PICK A REPLY TARGET. Scan the tree for the single best comment to engage with: high-signal, raises a specific question or makes a claim the user\'s distinct angle would complement, and is NOT already well-addressed by another commenter. Depth doesn\'t matter — a strong deep-thread comment beats a weak top-level reply. If you find one, emit it as `reply_target: { author: "u/<handle>", body: "<verbatim comment text>", score: <int>, age_hours: <int>, depth: <int>, url: "<full reddit permalink to this comment>" }`. If NO comment clears the bar, OR the OP itself is the strongest hook, leave `reply_target` absent and draft to the OP. Test: "does engaging this comment beat engaging the OP for this user?"',
    '  3. GROUND THE DRAFT. Use the FULL OP body + the entire tree (or at minimum the chain leading to your reply_target) as context. Don\'t parrot existing commenters; offer a distinct angle. If `reply_target` is set, `draft_starter` is the reply TO that comment, not to the OP — address what that specific commenter said.',
    'Then emit the card with `excerpt` (plain-text OP body, ~500 chars; strip markdown/HTML, for UI display), optional `reply_target` (per above), and `draft_starter` (your 2-4 sentence draft in voice). Drafting the discovery starter IS this step\'s job; this is the only place you draft. The separate Draft chip handles broadcast posts, not comment-on-thread starters.',
  ].join('\n');
  sendChatHidden(goal);
  return promise;
}

// ── Step 3: Draft — agent reads all cards, drafts for enabled lanes ──
async function runDraft() {
  const promise = startChip('draft', PIPELINE_CHIPS['draft'].expects);
  const goal = [
    'Draft posts for the enabled target lanes using the local + web cards already in this session.',
    '',
    'BEFORE drafting, Read these two reference files in full — they are the voice contract for this step, not optional:',
    '  - references/style-guide.md (Avoid list, Anti-AI tics, Cadence rules, good/bad examples)',
    '  - references/lane-templates.md (per-lane length, structure, opener pattern)',
    '',
    'Read what\'s on the page: progress card (what I shipped/learned), trend cards (what\'s trending in my space), discovery cards (thread opportunities), mention cards (where I\'ve been mentioned).',
    '',
    'If the x-post lane is enabled AND sites.x.enabled, FIRST call FetchXOwnPosts (my recent X posts + their likes/reposts/replies/views). Use it two ways: (1) do NOT repeat a point a recent post already made — pick a different angle or emit `empty`; (2) lean toward the themes/voice of my highest-`score` posts, since those are what this audience actually engages with. The post content still comes from the progress card or my intent; own-posts is the de-dup + what-works signal, not the source material. Empty + error when X creds are absent — just skip it.',
    '',
    'For each enabled lane in config.targets[*].enabled, generate one draft following references/lane-templates.md constraints. Five passes — do NOT skip:',
    '',
    'Pass 0 — Mode selection. Drafts have three shapes; pick one per lane based on what\'s on the page (see "Lead artifact + mode" in style-guide.md for worked examples).',
    '  - local-led: the progress card has an artifact that\'s publicly legible on its own (a benchmark, a measurable behaviour change, a novel approach, a vivid bug). Open with that artifact. Trend / discovery cards are supporting evidence at most.',
    '  - web-led + local proof (BEST when both available): the local artifact is too insider to open with, but a trend or discovery card sits on an adjacent topic. Open with the web hook (the question the public is already asking), pivot to the local artifact as the proof point ("yesterday I shipped X" / "hit the same wall"). Personal stake + public reach.',
    '  - web-only: no local artifact this lane could honestly carry; only a trend commentary. Use sparingly — posts with no personal stake feel like industry commentary, which dilutes voice. If you\'d reach for this mode twice in a row for the same lane, emit `empty` instead.',
    '',
    'Lead test (apply after picking the mode). Could a stranger in the lane\'s audience (r/<sub> for reddit-comment, the X feed of the user\'s peers for x-post) tell what this post is about in 3 seconds, AND would they care? If "no" on either, drop down one mode (local-led → web-led; web-led → empty). Empty is fine. Fabricating a hook is not.',
    '',
    'Pass 1 — Concrete claim. Now pick the actual lead artifact under the chosen mode: a number, a file path, a function name, a before/after, a metric, OR the specific public question the web cards surface. The draft\'s opening sentence must be that artifact / question, not a principle about it. If the only thing you can come up with is an axiom ("X should not Y", "the boundary between A and B"), emit an `empty` card instead.',
    '',
    'Pass 2 — Voice rewrite. Mirror the brief\'s cadence (sentence length, article use, comma habits, vocabulary). The brief is the voice anchor. Drafts that ignore the brief\'s rhythm will be rejected by the user.',
    '',
    'Pass 3 — Anti-AI tics. Run the draft through every check in style-guide.md\'s "Anti-AI tics" section, top to bottom: aphorism opener, diagnostic opener, symmetric/parallel clauses, triple-slash menus, closing moral, abstract-noun framings ("boundary", "intent", "ownership", "approach"), generic-advisor stance. Strip them. Also strip the hard avoid list ("🚀", "I\'m thrilled", "TL;DR", "Hot take", "game changer", "level up", "AI-powered", opening hashtag, closing "what do you think?").',
    '',
    'Pass 4 — Opener test. Read the first sentence in isolation. Could it open a post about an unrelated project? If yes, rewrite to lead with a specific artifact (number, file, name, moment). Refactor / shipping content opens with what changed, not why it mattered.',
    '',
    'Emit body_patch for `progress_drafts` using `mode: "append"` so the new `draft` cards land alongside the existing progress card from gather-local (without `mode: "append"` the patch replaces the section, clobbering the progress card). Each draft card: { type:"draft", id, lane, content, char_count, char_limit?, title_candidates?, subtitle? }.',
    '',
    'If neither local nor web cards have enough signal to draft honestly (no shipped work, no real-world hook, no thread to comment on), emit one `empty` card with a one-line reason and skip drafting. Do not fabricate.',
  ].join('\n');
  sendChatHidden(goal);
  return promise;
}

function wireChips() {
  document.querySelectorAll('.chip[data-chip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const chipId = btn.dataset.chip;
      const conf = PIPELINE_CHIPS[chipId];
      if (!conf) return;
      // Cancel any in-flight cascade — explicit click takes precedence.
      cancelCascade();
      conf.handler().catch(err => console.warn(`[pulse] ${chipId} failed`, err));
    });
  });
}

// ---- Auto-cascade --------------------------------------------------------
//
// First open of the day: run all three steps in sequence with a tiny
// non-blocking toast. Cancellable. Skipped if today's session already has
// cards (so reopening the tab mid-day doesn't re-fire).

let cascadeStop = false;

function cancelCascade() {
  cascadeStop = true;
  const toast = document.getElementById('cascade-toast');
  if (toast) toast.hidden = true;
}

function showCascadeToast(label) {
  const toast = document.getElementById('cascade-toast');
  if (!toast) return;
  document.getElementById('cascade-toast-label').textContent = label;
  toast.hidden = false;
}

function hideCascadeToast() {
  const toast = document.getElementById('cascade-toast');
  if (toast) toast.hidden = true;
}

async function maybeAutoCascade() {
  // Cascade ONLY when this open minted a fresh session (New button →
  // ?new=1, or first-ever open). Plain opens now resume the most-recent
  // session and resumed sessions are static — chips and chat still work
  // if the user clicks them, but nothing fires automatically. This is what
  // stops a refresh from spawning a competing pulse run.
  if (!state.isNewSession) return;
  const sess = getSession();
  for (const sec of Object.values(sess?.sections || {})) {
    if (Array.isArray(sec.cards) && sec.cards.length > 0) return;
  }
  // Wait for chat to be ready, grants replayed, and init prompt sent
  // before firing agent steps. The first step (Gather local) is
  // script-only and doesn't need this, but steps 2/3 do.
  if (state.grantsReady) {
    try { await state.grantsReady(); } catch {}
  }
  if (state.initReady) {
    try { await state.initReady; } catch {}
  }
  cascadeStop = false;
  // Auto-cascade runs ONLY the two gather steps. Draft is user-triggered
  // because auto-drafting without lane / angle / polish input produces
  // generic posts the user won't use — wastes tokens. Cards from the
  // gather steps stay on the page; user clicks Draft when they have a
  // target in mind.
  const steps = [
    { id: 'gather-local', label: 'Gathering local activity…' },
    { id: 'gather-web',   label: 'Gathering web signal…' },
  ];
  for (const step of steps) {
    if (cascadeStop) break;
    showCascadeToast(step.label);
    try {
      await PIPELINE_CHIPS[step.id].handler();
    } catch (err) {
      console.warn(`[pulse] cascade step ${step.id} failed`, err);
      break;
    }
  }
  hideCascadeToast();
}

document.addEventListener('DOMContentLoaded', () => {
  const stopBtn = document.getElementById('cascade-toast-stop');
  if (stopBtn) stopBtn.addEventListener('click', cancelCascade);
});

// ---- Card actions --------------------------------------------------------

function wireCardActions() {
  const container = document.getElementById('sections-container');
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (btn) {
      handleCardAction(btn.dataset.action, btn.dataset.card, btn);
      return;
    }
    // Click outside any action button: toggle card selection.
    // Single-select — clicking a card deselects siblings. Click again to
    // deselect. Selection is visual only (border highlight via .selected).
    const card = e.target.closest('.card');
    if (!card) return;
    const wasSelected = card.classList.contains('selected');
    container.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
    if (!wasSelected) card.classList.add('selected');
  });
}

function handleCardAction(action, cardId, btn) {
  const card = findCard(cardId);
  if (!card && !['open-url'].includes(action)) return;

  switch (action) {
    case 'draft-reply':
    case 'draft-replies':
    case 'draft-starter':
      sendChatHidden(`Refine the ${card.type} draft for "${truncate(card.thread_title || card.your_post_title || card.title || '?', 60)}". Show the draft as an updated body_patch card so I can iterate.`);
      break;
    case 'reply-back':
      sendChatHidden(`Draft a reply to the new follow-up comment on my "${truncate(card.your_post_title || '?', 60)}" thread. Land it as a body_patch.`);
      break;
    case 'polish':
      sendChatHidden(`Polish the ${card.lane || 'draft'} draft (card id ${card.id}). Re-emit the body_patch with the tightened version.`);
      break;
    case 'open':
    case 'open-url': {
      // If the agent picked a specific reply target in a discovery card,
      // jump to that comment permalink — that's where the user is about
      // to paste, not the thread root.
      const url = btn?.dataset?.url
        || card?.reply_target?.url
        || card?.thread_url || card?.your_post_url || card?.url
        || (card?.follow_up?.comment_url);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      // Open = "let me read the thread", not "I'm about to comment". Leave
      // the card visible so the user can come back to it. Copy is the
      // explicit commit signal (handled below).
      break;
    }
    case 'copy': {
      // Pull the draft text per card type: draft cards → .content; discovery
      // → .draft_starter; mention / reply_to_me → .draft_reply; .quote is a
      // last-ditch fallback.
      const text = card?.content || card?.draft_starter || card?.draft_reply || card?.quote || '';
      if (!text) { flash(btn, 'Nothing to copy'); break; }
      // Fire-and-forget: copyToClipboard resolves true/false so we only
      // claim success when the text actually landed on the clipboard.
      copyToClipboard(text).then((ok) => flash(btn, ok ? 'Copied ✓' : 'Press ⌘C to copy'));
      break;
    }
    case 'mark-posted':
      markCardPosted(cardId, btn);
      break;
    case 'discard':
    case 'dismiss':
    case 'dismiss-followup':
      removeCard(cardId);
      break;
    default:
      console.warn('[pulse] unknown action', action);
  }
}

function findCard(cardId) {
  if (!cardId) return null;
  const sess = getSession();
  for (const sec of Object.values(sess.sections || {})) {
    for (const c of (sec.cards || [])) {
      if (c.id === cardId) return c;
    }
  }
  return null;
}

function removeCard(cardId) {
  const card = findCard(cardId);
  const url = card?.url || card?.thread_url;
  if (url) {
    addDismissedUrl(url);
    appendDismissed(url).catch(e => console.warn('[pulse] persist dismissed failed', e));
  }
  const sess = getSession();
  for (const [secId, sec] of Object.entries(sess.sections || {})) {
    const before = sec.cards?.length || 0;
    sec.cards = (sec.cards || []).filter(c => c.id !== cardId);
    if (sec.cards.length !== before) {
      sec.last_updated = new Date().toISOString();
      // Re-render and persist via the renderer's apply pipe.
      loadSession(sess);
      persistSession(sess);
      return;
    }
  }
}

// Cross-session dismissed-URL log. Why a separate file (not session.json):
// new sessions get a fresh session.json, so dismissals must live outside
// the per-session scope. Why not piggy-back on own-commented.json:
// semantically distinct — "I commented here" ≠ "I don't want to see this
// again", and conflating them means a Reddit own_comment fetch could
// silently un-dismiss something the user explicitly killed.
const DISMISSED_PATH = `${SKILL_DIR}/state/dismissed.json`;

async function loadDismissedSet() {
  const data = await readJson(DISMISSED_PATH, { urls: [] });
  return Array.isArray(data?.urls) ? data.urls : [];
}

async function appendDismissed(url) {
  if (!url) return;
  const data = await readJson(DISMISSED_PATH, { urls: [] });
  const set = new Set(Array.isArray(data?.urls) ? data.urls : []);
  set.add(url);
  await writeJson(DISMISSED_PATH, { urls: Array.from(set), updated_at: new Date().toISOString() });
}

async function markCardPosted(cardId, btn) {
  const card = findCard(cardId);
  if (!card) return;
  // Inline URL prompt rendered inside the card.
  const cardEl = btn?.closest('.card');
  if (!cardEl) return;
  if (cardEl.querySelector('.posted-prompt')) return;  // already open

  const prompt = document.createElement('div');
  prompt.className = 'posted-prompt';
  prompt.innerHTML = `
    <label>Where did you post it?</label>
    <div class="posted-prompt-row">
      <input type="url" placeholder="https://news.ycombinator.com/item?id=..." />
      <button class="primary" data-confirm>Save</button>
      <button class="dismiss" data-cancel>×</button>
    </div>
    <div class="posted-prompt-hint">Pulse will poll this thread for new replies on its next run.</div>
  `;
  cardEl.querySelector('.body').appendChild(prompt);
  const input = prompt.querySelector('input');
  input.focus();

  const confirm = async () => {
    const url = input.value.trim();
    if (!url) {
      input.style.borderColor = 'var(--red)';
      return;
    }
    const platform = inferPlatform(url);
    await appendPosted({
      id: `post-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      draft_id: card.id,
      url,
      platform,
      title: card.thread_title || card.your_post_title || (card.content || '').slice(0, 60),
      posted_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
      comment_ids_seen: [],
      responses: [],
    });
    // Update the card in-memory + on disk.
    card.posted = true;
    card.posted_url = url;
    card.posted_at = new Date().toISOString();
    const sess = getSession();
    loadSession(sess);
    persistSession(sess);
  };

  prompt.querySelector('[data-confirm]').addEventListener('click', confirm);
  prompt.querySelector('[data-cancel]').addEventListener('click', () => prompt.remove());
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') confirm(); });
}

function inferPlatform(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('news.ycombinator.com')) return 'hn';
    if (h.includes('reddit.com')) return 'reddit';
    if (h.includes('lobste.rs')) return 'lobsters';
    if (h === 'x.com' || h === 'twitter.com') return 'x';
    if (h.includes('linkedin.com')) return 'linkedin';
    if (h.includes('substack.com')) return 'substack';
    if (h.includes('medium.com')) return 'medium';
    return 'web';
  } catch { return 'web'; }
}

async function appendPosted(entry) {
  // Read state/posted.json, append the entry, write back.
  const path = `${SKILL_DIR}/state/posted.json`;
  let posted = await readJson(path, { '$schema_version': 1, posts: [] });
  if (!Array.isArray(posted.posts)) posted.posts = [];
  posted.posts.push(entry);
  await writeJson(path, posted);
}

// Copy text to the clipboard from inside the skill iframe. The async
// Clipboard API needs a secure context + clipboard-write permission +
// a focused document, none of which are guaranteed here — so on any
// failure we fall back to the legacy textarea + execCommand('copy')
// trick, which works in more sandboxed-iframe contexts. Returns whether
// the copy succeeded so the caller can give honest feedback.
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function flash(btn, label) {
  const old = btn.textContent;
  btn.textContent = label;
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = old;
    btn.classList.remove('copied');
  }, 1500);
}

// ---- Chat panel ----------------------------------------------------------

async function mountChat() {
  // Wait for chat-bridge to register window.LinggenUI.
  for (let i = 0; i < 30; i++) {
    if (window.LinggenUI?.mount) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (!window.LinggenUI?.mount) {
    console.warn('[pulse] LinggenUI.mount unavailable; chat disabled');
    return;
  }
  // PATCH the workspace grant onto whatever session this chat owns —
  // engine starts each session with SKILL.md grants only. The chat
  // session is separate from the draft session created in api.js, so we
  // must replay the user's configured workspace_path here too. Fires for
  // both fresh-created sessions and ones the iframe handshake assigns
  // mid-mount. Track the in-flight promise so the init prompt and the
  // first chip click can await it — guarantees the agent never sees a
  // permission prompt on a path the user has already configured.
  let pendingGrant = null;
  const grantOnce = (sid) => {
    if (!sid) return;
    state.activeSessionId = sid;
    if (!state.viewSessionId) state.viewSessionId = sid;
    pendingGrant = replayRuntimeGrants(sid).catch(e =>
      console.warn('[pulse] replay grants failed', e)
    );
    // Lower the auto-compact trigger from 95% → 50% for Pulse sessions,
    // and tell the summarizer what to preserve. Runtime-only on the engine
    // side, so we re-apply on every iframe mount.
    applyCompactConfig(sid).catch(e => console.warn('[pulse] applyCompactConfig failed', e));
  };
  state.grantsReady = () => pendingGrant || Promise.resolve();

  // Attach to the resolved session (most-recent on plain open, the URL's
  // ?session=<id> when set) instead of always minting a new one. Only a
  // forced-new / first-ever open (isNewSession) passes undefined so the
  // engine creates a fresh session.
  const resumeSid = state.resumeSid;

  state.chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
    skillName: 'pulse',
    sessionId: resumeSid || undefined,
    onSessionCreated: grantOnce,
    onContentBlock: (payload) => {
      // Any content block (tool call, text streaming, PageUpdate, …) is
      // fresh evidence the agent is still working — bump the running
      // chips' idle timers before processing. Gather-web typically
      // spends the first 60-120s calling Fetch tools BEFORE its first
      // PageUpdate, so gating the ping on PageUpdate alone let the chip
      // time out during the fetch phase. Pinging on every block keeps
      // the chip alive as long as the agent is doing anything.
      pingRunningChips();
      if (payload?.tool === 'PageUpdate' && payload?.args) {
        try {
          const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
          applyPageUpdate(args);
        } catch (e) {
          console.warn('[pulse] failed to parse PageUpdate args', e);
        }
      }
    },
  });

  // If the session existed before mount (resumed iframe), onSessionCreated
  // won't fire — replay grants now using whatever id the bridge exposes.
  const fallbackSid = state.chat?.getSessionId?.();
  grantOnce(fallbackSid);

  // Init prompt (greeting + brief seed) fires ONLY when this open is
  // minting a fresh session. Resumed sessions (most-recent on plain open,
  // or a sidebar pick) already carry the brief in their chat history — no
  // re-sending. Without this gate, every refresh would trigger a greeting
  // LLM call just to view static cards.
  if (!state.isNewSession) {
    state.initReady = Promise.resolve();
  } else {
    state.initReady = (async () => {
      try {
        await state.grantsReady();
        await sendInitPrompt();
      } catch (e) {
        console.warn('[pulse] init-prompt failed', e);
      }
    })();
  }
}

async function sendInitPrompt() {
  // Seed the agent with brief + workspace + pipeline contract as ground
  // truth, then ask for ONE visible greeting line. After the greeting,
  // the agent stays silent until a chip fires (the page sends each chip
  // goal as a hidden message — the agent's response is the on-page
  // artifact, not chat prose).
  if (!state.chat) return;
  const cfg = await readPulseConfig();
  const brief = (cfg?.brief || '').trim();
  const workspace = (cfg?.workspace_path || '').trim();
  if (!brief && !workspace) return;
  const lines = [
    'You are Ling, operating inside Pulse. Your full role + workflow is in SKILL.md — read it as your operational contract. Quick recap:',
    '- Pulse is NOT a coding task. There is no codebase to modify here.',
    '- You orchestrate a three-step pipeline (Gather local → Gather web → Draft) by emitting PageUpdate body_patch blocks. Cards on the page are the artifact; chat is only your control bus.',
    '- After this init, send ONE visible greeting as plain chat text (2-3 lines): introduce PULSE itself — it turns the user\'s recent work + live web signal into review-ready draft posts and comment opportunities (you review, never auto-posted), driven by the chips. Sign off as Ling. Do NOT name or list the user\'s products/brands from the brief — introduce what Pulse does, not what they\'re building.',
    '- The greeting turn is chat-only: do NOT call PageUpdate (or any other tool) on it. Nothing is on the page yet, so an empty/all-null PageUpdate just errors. After the greeting, go silent until a chip goal arrives.',
    '- When a goal arrives, run the step per SKILL.md. Status narration in chat is short factual lines only. NEVER narrate "Done", "No code changes were needed", or acknowledgments of context blocks — silence is correct when there\'s nothing to surface on the page.',
  ];
  if (workspace) {
    lines.push('', `Workspace: ${workspace}`,
      'Read README, doc/, source files there to ground drafts in real product knowledge.');
  }
  if (brief) {
    lines.push('', 'Brief (case description, voice rules, hard rules):', brief);
  }
  sendChatHidden(lines.join('\n'));
}

function sendChatMessage(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.send(text);
}

// sendChatHidden — for chip-fired goals and card-action prompts that
// orchestrate the agent but shouldn't appear as user messages in the
// chat panel. The agent's RESPONSE stays visible (status lines + the
// body_patch artifacts) — only the orchestration prompt is hidden.
// Use this for every internal trigger; reserve sendChatMessage for
// user-typed input that should be visible as theirs.
//
// Sanitizes home-dir paths: `/Users/<username>/foo` → `~/foo`. Small
// local models (qwen3.6, etc.) latch onto the username segment and
// hallucinate GitHub URLs like `github.com/<username>/...` in drafts.
// The username is the OS user, not a handle — strip it before the
// model ever sees it. Discovered after qwen3.6 fabricated
// `github.com/lianghuang/linggen` in a comment draft.
function sendChatHidden(text) {
  if (!state.chat) {
    console.warn('[pulse] chat not ready, queueing not yet implemented');
    return;
  }
  state.chat.sendHidden(sanitizeHomePaths(text));
}

let cachedHomeDir = null;
async function getHomeDir() {
  if (cachedHomeDir != null) return cachedHomeDir;
  try {
    const out = await runBash('printf "%s" "$HOME"');
    cachedHomeDir = (out || '').trim() || null;
  } catch { cachedHomeDir = null; }
  return cachedHomeDir;
}
// Synchronous variant of the substitution. Reads cachedHomeDir; safe
// to call before getHomeDir() resolves (just no-ops on first send).
function sanitizeHomePaths(text) {
  if (!text || !cachedHomeDir) return text;
  // Replace /Users/<name>/ → ~/ and bare /Users/<name> → ~
  const home = cachedHomeDir;
  return text.split(home + '/').join('~/').split(home).join('~');
}
// Kick off home-dir lookup so the cache is populated by the time the
// first hidden push happens.
getHomeDir().catch(() => {});

// ---- Chat panel drag-to-resize -------------------------------------------

const CHAT_WIDTH_KEY = 'pulse.chatWidth';
const CHAT_WIDTH_MIN = 320;
const CHAT_WIDTH_MAX = 900;

function wireChatResizer() {
  const app = document.querySelector('.app');
  const panel = document.getElementById('chat-panel');
  if (!app || !panel) return;

  // Restore persisted width.
  const saved = parseInt(localStorage.getItem(CHAT_WIDTH_KEY), 10);
  if (Number.isFinite(saved) && saved >= CHAT_WIDTH_MIN && saved <= CHAT_WIDTH_MAX) {
    app.style.setProperty('--chat-width', saved + 'px');
  }

  // Inject the drag handle on the panel's left edge.
  const handle = document.createElement('div');
  handle.className = 'chat-resizer';
  handle.title = 'Drag to resize chat panel';
  panel.prepend(handle);

  let dragging = false;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.classList.add('chat-resizing');
  });

  // Listen on document so the drag survives the cursor leaving the handle.
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const w = Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, window.innerWidth - e.clientX));
    app.style.setProperty('--chat-width', w + 'px');
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('chat-resizing');
    // Persist the final width.
    const cs = getComputedStyle(app).getPropertyValue('--chat-width').trim();
    const px = parseInt(cs, 10);
    if (Number.isFinite(px)) localStorage.setItem(CHAT_WIDTH_KEY, String(px));
  });
}

// ---- Settings modal ------------------------------------------------------
// Open settings.html as an in-page iframe overlay rather than navigating
// the top window. Navigating away would unmount the chat iframe and lose
// the conversation; the modal keeps pulse.html alive.

function wireSettingsModal() {
  const link = document.getElementById('settings-link');
  const modal = document.getElementById('settings-modal');
  const iframe = document.getElementById('settings-iframe');
  const closeBtn = document.getElementById('settings-close');
  if (!link || !modal || !iframe || !closeBtn) return;

  const open = (e) => {
    e?.preventDefault();
    // Reload src each open so any concurrent edits show fresh state.
    iframe.src = 'settings.html';
    modal.hidden = false;
  };
  const close = () => {
    modal.hidden = true;
    iframe.src = 'about:blank';  // unload to release any pending fetches
  };

  link.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target.dataset.close) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
}

// ---- Helpers -------------------------------------------------------------

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ---- Init ----------------------------------------------------------------

async function init() {
  setOnChange(persistSession);
  try {
    const cfg = await readPulseConfig();
    const handle = (cfg?.sites?.reddit?.username || '').trim();
    if (handle) {
      setSelfHandle(handle);
      refreshCommentedThreadUrls().catch(err => console.warn('[pulse] own-comments prefetch', err));
    }
  } catch {}
  // Seed the dismissed-URL set BEFORE the first render or auto-cascade.
  // It's a fast local file read; awaiting it (rather than fire-and-forget)
  // guarantees the dismiss filter is populated before a gather's body_patch
  // arrives — otherwise dismissed cards slip through during a long gather.
  try {
    setDismissedUrls(await loadDismissedSet());
  } catch (err) {
    console.warn('[pulse] dismissed prefetch', err);
  }
  // Resolve which session this open should attach to BEFORE mounting chat,
  // so we resume the most-recent session instead of minting a new one.
  await resolveBootSession();
  wireChips();
  wireCardActions();
  wireChatResizer();
  wireSettingsModal();
  wireNewSessionButton();
  document.getElementById('cascade-toast-stop')?.addEventListener('click', cancelCascade);
  // Listen for iframe selections before we point the iframe at /sessions —
  // session_create on a fresh mount races our setup otherwise.
  window.addEventListener('message', handleSessionsMessage);
  // Mount chat first so we know the active session id. The sessions iframe
  // wants `active=<sid>` in its URL so the right row is highlighted on
  // first paint.
  await mountChat();
  setupSessionsIframe(state.viewSessionId || state.activeSessionId);
  // Load cards for the resolved session (resume target, or the freshly
  // minted session id that mountChat just set as active).
  const initialSid = state.resumeSid || state.activeSessionId;
  if (initialSid) {
    state.viewSessionId = initialSid;
    const sess = await readJson(`${SKILL_DIR}/data/${initialSid}/session.json`);
    loadSession(sess);
    document.getElementById('session-title').textContent = 'pulse session';
    document.getElementById('session-sub').textContent = 'Pick a chip above, or type a goal in chat to start.';
  }
  await loadStatusStrip();
  // Auto-cascade only when this open minted a fresh session.
  maybeAutoCascade().catch(err => console.warn('[pulse] cascade failed', err));
}

// "New session" button → reload at ?new=1, which makes resolveBootSession
// mint a fresh session and run the greeting + auto-cascade. A full reload
// (vs in-place) reuses the entire boot path, so New behaves exactly like a
// clean first-open-of-the-day.
function wireNewSessionButton() {
  const btn = document.getElementById('new-session-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    window.location.href = `${window.location.pathname}?new=1`;
  });
}

init().catch(err => {
  console.error('[pulse] init failed', err);
  const c = document.getElementById('sections-container');
  if (c) c.innerHTML = `<div class="state-msg error">Pulse failed to initialize: ${escapeHtml(err.message || String(err))}</div>`;
});

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
