// pulse-app.js — Pulse main page app shell.
//
// Responsibilities:
//   1. Resolve the boot session (resume most-recent, or mint fresh on
//      ?new=1) — sessions are app-managed, CFO-style; no session list UI.
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

import { applyPageUpdate, loadSession, getSession, setOnChange, setConfig, setOnTabRender, setOnRescan, renderAll, setSelfHandle, setCommentedThreadUrls, getCommentedThreadUrls, setDismissedUrls, addDismissedUrl, getDismissedUrls, resetPage } from './page-render.js';
import { readPulseConfig, replayRuntimeGrants, applyCompactConfig } from './api.js';

const SKILL_DIR = '$HOME/.linggen/skills/pulse';

// ---- App state -----------------------------------------------------------

const state = {
  // Active chat session id (the one the chat panel is attached to).
  // Set after chat-bridge mount; persisted-card storage is keyed by this.
  activeSessionId: null,
  // Currently-viewed session id. Cards on the page reflect this.
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

// Compact follower counts: 1240 → "1.2k", 18 → "18", -30 → "-30".
function fmtCount(n) {
  const a = Math.abs(n);
  if (a >= 1000) {
    const k = n / 1000;
    return (a >= 10000 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')) + 'k';
  }
  return String(n);
}

// Growth vs the snapshot closest to `targetDays` ago. Returns {delta, spanDays}
// using the newest point at least `targetDays` old (falling back to the oldest
// point), so a young store reports its real span rather than a fake "7d".
// null when there aren't two dated points to compare.
function followerDelta(history, targetDays) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const today = history[history.length - 1];
  const cutoff = Date.now() - targetDays * 86400000;
  let base = null;
  for (const p of history) {
    if (new Date(p.date + 'T00:00:00Z').getTime() <= cutoff) base = p;
  }
  if (!base) base = history[0];
  const spanDays = Math.round(
    (new Date(today.date + 'T00:00:00Z') - new Date(base.date + 'T00:00:00Z')) / 86400000,
  );
  if (spanDays < 1) return null;
  return { delta: today.count - base.count, spanDays };
}

// Audience-growth metrics shown in the status strip. Each snapshots ONE number
// per day into account-health.json[key].history and renders a chip with its
// week-over-week delta — the "is the account actually growing?" loop Pulse
// otherwise leaves open. count()/id() pull the number + display handle out of
// the script's JSON. HN karma + Bluesky followers use free public lookups; X
// spends one cheap credit — all are throttled to one snapshot/day.
const AUDIENCE_METRICS = [
  { key: 'x',    label: 'X followers',       script: 'x-followers.sh',
    enabled: c => c?.sites?.x?.enabled,          count: d => d?.followers, id: d => d?.username },
  { key: 'hn',   label: 'HN karma',          script: 'hn-karma.sh',
    enabled: c => c?.sites?.hackernews?.enabled, count: d => d?.karma,     id: d => d?.username },
  { key: 'bsky', label: 'Bluesky followers', script: 'bluesky-followers.sh',
    enabled: c => c?.sites?.bluesky?.enabled,    count: d => d?.followers, id: d => d?.handle },
];

// Run one metric's snapshot script and return {id, count} | null (no creds/handle).
async function fetchAudienceMetric(m) {
  const data = JSON.parse(await runBash(`bash "${SKILL_DIR}/scripts/sites/${m.script}"`));
  const count = m.count(data);
  return typeof count === 'number' ? { id: m.id(data) || '', count } : null;
}

// Append today's audience numbers to account-health.json — one point/day per
// enabled metric, 90-day history. Gated per-metric on its site being enabled;
// skips the lookup entirely once today's point exists.
async function snapshotAudienceMetrics() {
  let cfg;
  try { cfg = await readPulseConfig(); } catch { return; }
  const path = `${SKILL_DIR}/state/account-health.json`;
  const health = (await readJson(path, {})) || {};
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  let changed = false;

  for (const m of AUDIENCE_METRICS) {
    if (!m.enabled(cfg)) continue;
    const entry = health[m.key] || {};
    const history = Array.isArray(entry.history) ? entry.history : [];
    if (history.length && history[history.length - 1].date === today) continue; // 1/day
    let res;
    try {
      res = await fetchAudienceMetric(m);
    } catch (e) {
      console.warn(`[pulse] ${m.key} snapshot failed`, e);
      continue;
    }
    if (!res) continue; // no creds/handle — leave prior state intact
    history.push({ date: today, count: res.count });
    while (history.length > 90) history.shift(); // keep ~3 months
    health[m.key] = { id: res.id || entry.id || '', count: res.count, history };
    changed = true;
  }
  if (changed) await writeJson(path, health);
}

async function loadStatusStrip() {
  // Read the audience-growth metrics (account-health.json) + launches and
  // assemble the strip. Empty state/ → empty strip (renderer hides it).
  const health = await readJson(`${SKILL_DIR}/state/account-health.json`, {});
  const launches = await readJson(`${SKILL_DIR}/state/launches.json`, []);
  const items = [];

  // Audience-growth chips: current value + week-over-week delta.
  for (const m of AUDIENCE_METRICS) {
    const e = health?.[m.key];
    if (!e || typeof e.count !== 'number') continue;
    const d = followerDelta(e.history, 7);
    let value = fmtCount(e.count), tone = 'neutral';
    if (d) {
      const sign = d.delta >= 0 ? '+' : '';
      value = `${fmtCount(e.count)} (${sign}${fmtCount(d.delta)}/${d.spanDays}d)`;
      tone = d.delta > 0 ? 'ok' : d.delta < 0 ? 'warn' : 'neutral';
    }
    items.push({ label: m.label, value, tone });
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

const CHIP_TIMEOUT_MS = 180_000;  // 3 min — agent steps (10+ fetches, many drafts) can be slow

const PIPELINE_CHIPS = {
  'gather-local': {
    handler: runGatherLocal,
    expects: ['progress_drafts'],   // sections that should update
  },
  'gather-web': {
    handler: runGatherWeb,
    expects: ['mentions', 'replies_due', 'discovery'],
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
  const remote = [];
  // Reddit — own_comment thread URLs (free RSS, always fetched).
  try {
    const out = await runBash(`bash "${SKILL_DIR}/scripts/sites/reddit-mentions.sh"`);
    const data = JSON.parse(out);
    remote.push(...(data?.items || [])
      .filter(it => it.kind === 'own_comment' && it.url)
      .map(it => it.url));
  } catch (e) {
    console.warn('[pulse] reddit-mentions own_comment fetch failed', e);
  }
  // X — parent tweets I've already replied to. Same "don't resurface what
  // I've engaged" rule as Reddit. Gated on sites.x.enabled; x-own.sh reads via
  // the linggen-browser bridge ($0). Pull a wide window (100) so older replies
  // still suppress. Bridge/extension unavailable → x-own.sh returns empty.
  try {
    const cfg = await readPulseConfig();
    if (cfg?.sites?.x?.enabled) {
      const out = await runBash(`bash "${SKILL_DIR}/scripts/sites/x-own.sh" 100`);
      const data = JSON.parse(out);
      remote.push(...(data?.replied_to || []));
    }
  } catch (e) {
    console.warn('[pulse] x-own replied_to fetch failed', e);
  }
  // HN — threads I've already commented in (free Algolia API). Gated on
  // sites.hackernews.enabled; no username in config → returns empty.
  try {
    const cfg = await readPulseConfig();
    if (cfg?.sites?.hackernews?.enabled) {
      const out = await runBash(`bash "${SKILL_DIR}/scripts/sites/hn-own-comments.sh"`);
      const data = JSON.parse(out);
      remote.push(...(data?.urls || []));
    }
  } catch (e) {
    console.warn('[pulse] hn own-comments fetch failed', e);
  }
  setCommentedThreadUrls(remote);
}

// Use the shared-memory skill's extract_session.sh to pull a flattened
// transcript for one session, capped at 2000 chars, via /api/bash (ungated).
// This is what lets the agent summarize sessions WITHOUT reading the raw
// ~/.claude/.linggen session files itself (which would trigger a permission
// prompt). Best-effort: if extraction fails, we silently skip the transcript.
// The script moved with the ling-mem → shared-memory rename; resolve the new
// path first, fall back to the old name for unmigrated installs.
async function extractSessionExcerpt(session) {
  const filepath = session.ref;
  const source = session.source;  // "CC" or "Linggen"
  const date = session.ts;
  if (!filepath || !source) return '';
  try {
    const fp = filepath.replace(/"/g, '\\"');
    const cmd = `d="$HOME/.linggen/skills/shared-memory/scripts/extract_session.sh"; [ -x "$d" ] || d="$HOME/.linggen/skills/ling-mem/scripts/extract_session.sh"; [ -x "$d" ] && bash "$d" "${fp}" "${source}" "${date}" 2000 2>/dev/null | head -c 2000 || true`;
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
    'rkey (last URL segment); for X use the status id (the digits after',
    '/status/). Skip applies to `discovery` and `mention`-kind',
    'cards. It does NOT apply to `reply_to_me` cards: a reply_to_me is a',
    'reply to MY OWN comment, so its thread id is necessarily in this list —',
    'matching it here would suppress the "someone replied to me" signal,',
    'which is the entire point of mention-watching. ALWAYS keep reply_to_me',
    'cards regardless of this list. Format: <platform>:<post-id>.',
    ...skipKeys.map(k => `  - ${k}`),
    '',
  ].join('\n');
  const goal = [
    skipBlock,
    'Gather web signal for what I\'m working on right now.',
    '',
    'OUTPUT CONTRACT (read first): this step writes the sections `discovery`, `mentions`, `hn_submit` (when sites.hackernews.enabled), `x_roster` (when sites.x.enabled and the roster is empty/stale), and `replies_due`, and you MUST emit a body_patch for each one you gathered for. `discovery` and `mentions` always run. `replies_due` runs ONLY when state/posted.json has tracked posts (see REPLIES DUE below); when posted.json is empty or missing, omit the section entirely — do not emit an empty replies_due card. Do NOT emit or re-emit `progress_drafts`: that is Gather local\'s section, it is already on the page, and here it is INPUT you read, never output you write. A run that ends having only touched `progress_drafts` is a FAILED run.',
    '',
    'Read the local cards already in this session (the `progress` card in `progress_drafts` lists my recent commits, sessions, and changed files) — read-only INPUT. Pick 2-3 concrete topics that capture what I\'m actually working on this week.',
    '',
    'Then for each topic, call the relevant configured source tools (FetchReddit, FetchHackerNews, FetchLobsters, FetchArxiv, FetchRSS) in parallel. Filter results for direct topical fit (score ≥ 0.6). If sites.x.enabled, X discovery is REACH-FIRST and roster-driven (the goal is follower growth, and a reply only grows the account if it lands early under a post whose audience is my niche). FIRST ensure the target ROSTER is built: if sites.x.roster is empty (or I asked to refresh accounts), build it per the SKILL.md discover-customers "X target roster" procedure — gather candidates from FetchXWhoToFollow (source 1, highest), the authors of on-topic FetchX hits (source 2), and FetchXFollowing <handle> on my strongest existing targets (source 3); tag each `followed` by intersecting FetchXFollowing (no arg = my own following); exclude self + sites.x.ignored_accounts + sites.x.dismissed_suggestions; curate to ~20 with a one-line `why`; and emit a `x_roster` body_patch (cards: { handle, name, followers, bio, followed, source:"1"|"2"|"3"|"following", why }, source-1 first). If the roster already has accounts and I did not ask to refresh, SKIP rebuilding. THEN call FetchXTargets (no arg = whole roster) — it pulls the freshest posts from the roster, the prime reply targets. ONLY if sites.x.keyword_search is true (it is OFF by default — the script returns [] otherwise, since the keyword firehose is mostly tiny/promo accounts), ALSO call FetchX with a focused query per topic as a GATED supplement; keep to the top 1-2 topics. If sites.hackernews.enabled, ALSO call FetchHNSearch with a focused query per topic (it takes "<query>" [days]; recent HN threads on that topic) — these are comment opportunities for building HN karma, handled like Reddit discovery (see HN handling below).',
    '',
    'HANDLING HN (FetchHNSearch) RESULTS — these are HN threads I could COMMENT on to build karma on a young account. Apply the already-commented rule: drop any hit whose id appears in SKIP_URLS as `hn:<id>` (a thread I have already commented in). RANK BY HEAT, then fit: strongly prefer threads with more `points` AND more `num_comments` AND recency (low age_hours) — a hot thread means more readers, which is the whole point of commenting to build karma. DROP cold threads: skip any thread that is not fresh AND has little traction (rule of thumb: age_hours > 24 with points < 10 and num_comments < 3) — a comment there is invisible and earns nothing. Exception: a very fresh thread (age_hours < 3) still on the way up is fine even at low points. For each survivor that clears 0.6 topical fit: call FetchHNThread(id) to read the OP + discussion for GROUNDING only, then draft a TOP-LEVEL reply to the OP/post — do NOT pick a nested comment and do NOT emit reply_target. (Replying to the OP is easiest to post — the reply box is at the top of the thread — and a top-level comment on an active thread gets the most visibility, which is the karma goal. reply_target is only for mentions in my own inbox.) Use the existing comments only to avoid repeating a point someone already made; the draft still answers the OP. Write `draft_starter` as an HN comment following references/lane-templates.md `hn-comment`: substance-first, register (1) IMPLICIT by default (NO product mention — most HN drafts are register 1); mention ling-mem ONLY when the thread is directly about agent memory AND always with disclosure; never a link/CTA/hype. Emit each as a `discovery` card { source:"hn", thread_title:<the HN thread title, REQUIRED — not empty>, author:<the HN submitter handle, from the hit\'s author/by field>, excerpt:<OP body / thread context, ~500 chars>, url:<the news.ycombinator.com/item?id=… url, REQUIRED>, comments?:<num_comments>, age_hours?, draft_starter }. If the only comment you could write is generic ("great point", "interesting"), emit NOTHING for that thread — HN flags low-effort/promo and it tanks a new account, the opposite of the goal.',
    '',
    'HANDLING HN SUBMIT CANDIDATES — separate from HN comments; this BUILDS the account by lowering my own-post ratio (HN auto-filters accounts that submit mostly their own links; the fix is interspersing OTHER people\'s interesting links — comments build karma but do NOT move that ratio). If sites.hackernews.enabled, call FetchHNSubmitCandidates (no args — it returns 3, which is plenty; HN tolerates only a couple of my own submissions a day). It returns fresh third-party ARTICLES to submit to HN (sourced from lobste.rs + quality subreddits) and has ALREADY deduped them against HN. These are submit-this-link items: there is NO comment to draft, and they are NEVER my own work. For each returned item, emit a card into the `hn_submit` section (NOT `discovery`, NOT `trend`): { type:"submit", source:<e.g. "lobste.rs" or "r/rust">, title:<the article title, REQUIRED>, url:<the EXTERNAL article url, REQUIRED — never a news.ycombinator.com link>, score?:<source score>, age_hours?, hn_status:<"fresh" or "unchecked"> }. Emit both "fresh" and "unchecked" items (the card flags "unchecked" ones for me to verify); the tool already removed anything already on HN. If it returns zero items, emit ONE `empty` card in `hn_submit`.',
    '',
    'HANDLING X RESULTS (FetchXTargets + FetchX) — X is NOT Reddit. An X hit has NO comment tree to WebFetch and NO reply_target. Do NOT run any of the Reddit-only discovery steps below on it. Apply the already-commented rule: drop any X hit whose status id (digits after /status/) appears in SKIP_URLS as `x:<id>` — a post I have already replied to. REACH IS THE WHOLE POINT (the goal is follower growth): FetchXTargets hits are my CURATED niche accounts — already vetted, so they BYPASS the 0.6 topical-fit cutoff entirely. Surface EVERY FetchXTargets hit as a `discovery` card (dropping ONLY ones whose status id is in SKIP_URLS as `x:<id>`, i.e. already replied); do NOT score them for topical fit or prune off-topic ones — the whole point is to see everything my curated accounts just posted. Order them FRESHEST first (low age_hours) so I reply early while the slot is visible. For FetchX (keyword firehose) hits, GATE HARD: keep only authors with genuine reach AND live engagement; DROP tiny-follower / ~zero-engagement posts (a reply there reaches nobody). Do NOT chase mega-accounts (hundreds of thousands+ followers) either — their reply sections are saturated and my comment is invisible; the sweet spot is mid-tier niche accounts whose audience is my target user and where a sharp reply is actually seen. For the survivors, emit each X hit DIRECTLY as a `discovery` card { source:"x", title:<tweet text>, author:<the poster\'s @handle>, excerpt:<tweet text>, url:<the x.com status url, REQUIRED>, draft_starter:<your reply in voice> }. If FetchX returned hits this run, your `discovery` body_patch MUST contain X cards — do not silently drop every X result. (X recent-search is noisy/promotional, so it is fine to keep only the few that genuinely fit my category.)',
    '',
    'For mention-watching, also call FetchXMentions if sites.x.enabled — X (Twitter) mentions + replies via the official API; returns the SAME {kind: reply_to_me|mention, ...} shape with parent_comment_body for replies, so emit its items into the `mentions` section exactly like the reply_to_me / mention handling below (author is an @handle, url is an x.com link). It returns {items, count, errors}. If `items` is empty OR `errors` is non-empty (including a missing-credentials note), SKIP X mentions silently — do NOT create any card about it. A tool error/empty is NOT a mention.',
    'NEVER FABRICATE CARDS. Every mention / reply_to_me card MUST come from a real item a Fetch tool actually returned, about a real person. Do NOT invent a "system" mention, a status card, an error card, or a setup-instructions card (e.g. "X mentions unavailable — add credentials in Settings"). If a mention source returns no items or an error, it simply contributes no card. Only if NOTHING across ALL sources produced a real item do you emit ONE `empty` card for `mentions` with a one-line reason. Tool status/errors never become content cards.',
    '',
    'For mention-watching, call FetchRedditMentions — uses Reddit RSS feeds (the private inbox feed token for replies; public search RSS for username mentions). Works whenever sites.reddit.username is set. Returns kind ∈ {mention, reply_to_me, own_comment}. IGNORE every `own_comment` row — those are page-side dedup plumbing (just kind/title/url/created_iso), NEVER a card. The mention/reply_to_me rows cover (a) threads where the handle appears in post/comment text, and (b) direct replies to the user\'s recent comments (the real "someone replied to me" signal — the item is pre-walked and carries BOTH your comment via parent_comment_body and the reply via body). NOTE: a reply to a comment on someone else\'s thread belongs in mentions as reply_to_me — do NOT map it to replies_due (that section is reserved for posts the user broadcast through Pulse\'s Draft chip, tracked via state/posted.json).',
    '',
    'For each "mention" kind result, read the thread with `FetchRedditThread` (do NOT WebFetch `<thread_url>.json` — Reddit\'s JSON is bot-walled and fails; FetchRedditThread is the working RSS reader) and emit a RICH mention card per the schema in SKILL.md: include `original_post`, `conversation` (first reply + latest if deep, with `collapsed_count`), and `draft_reply`. If the thread read fails, still emit the card from the item fields you already have rather than dropping it.',
    '',
    'For each "reply_to_me" kind result, emit a card in the `mentions` section with `type: "reply_to_me"` — NOT `type: "mention"`. There is no thread chain to summarize: the script already pre-walked the tree and gave you BOTH sides on the item. Fields to emit: `actor` (from item.author, e.g. "u/Chance_Tree9196"), `thread_title` (from item.title), `sub` (item.sub), `url` (item.url), `your_comment: { body: <item.parent_comment_body, verbatim>, url: item.parent_comment_url }`, `reply: { body: <item.body, VERBATIM and COMPLETE — do not split, paraphrase, summarize, or truncate; the renderer shows up to 1200 chars itself>, score: item.score, age_hours: <hours since item.created_iso> }`, and `draft_reply` (your 2-3 sentence response in voice). Do NOT populate `original_post` or `conversation` — those belong to the `mention` shape; using them on a reply_to_me card splits the single reply into fake halves.',
    '',
    'Also run public mention-watching: for each watchlist term (products + competitors + self extracted from brief, plus sites.reddit.username if set), search the same sources and surface threads where the term appears.',
    '',
    'REPLIES DUE (state/posted.json) — run this ONLY if state/posted.json exists AND its `posts` array is non-empty. These are threads I broadcast through Pulse and marked Posted; I want NEW activity on them. For each entry: re-fetch the thread with the tool matching entry.platform (FetchRedditThread for "reddit", FetchHNThread for "hn"), diff the thread\'s comment ids against entry.comment_ids_seen, and per SKILL.md monitor-mentions Step 3 emit a `reply` card for any new top-level comments on my post (set unanswered_count) or new direct replies to a comment I made (one `follow_up` block, newest). Then Write state/posted.json back with comment_ids_seen and last_checked updated. If posted.json is empty or missing, do NOT emit a replies_due body_patch at all — skip the section silently (an empty "replies due" every run is noise).',
    '',
    'EMIT INCREMENTALLY — do NOT pack everything into one giant final body_patch. A single huge tool call (e.g. 20-30 discovery cards with drafts) takes minutes to generate, shows nothing until it completes, and stalls the run. Instead: emit `mentions` FIRST (it is quick and lands progress on the page immediately). Then emit `discovery`, and if it has more than ~8 cards, SPLIT it: one `discovery` body_patch with the first ~8 cards (replace), then the remaining cards in further `discovery` body_patch blocks with `mode:"append"` (deduped by id) — so the page fills progressively and no single tool call is enormous.',
    '',
    'Now emit the body_patch blocks — one per section you touched: `x_roster` (only when you (re)built the roster this run), `discovery`, `mentions`, and (only if posted.json had entries) `replies_due` (NEVER `progress_drafts`). Every section you ran a gatherer for MUST get a body_patch: if it found nothing above the cutoff, emit that section with a single `empty` card and a one-line reason, so the page shows the run completed instead of staying blank. EXCEPTION: `replies_due` is omitted entirely (no empty card) when posted.json had nothing to poll.',
    '',
    'For `discovery` cards specifically (Reddit threads you suggest the user comment on): AFTER scoring, BEFORE drafting, read each surviving candidate with `FetchRedditThread`. CRITICAL: do NOT WebFetch `<thread_url>.json?limit=500...` — Reddit\'s JSON endpoint is bot-walled (403) and that WebFetch WILL fail; `FetchRedditThread` (RSS-based) is the ONLY working full-thread reader. If FetchRedditThread errors for a thread, do NOT abandon discovery — emit the card grounded on the OP title + your scoring excerpt. A thin grounded card beats an empty section.',
    'Then, with whatever the thread read returned:',
    '  1. ALREADY-COMMENTED CHECK. Drop any thread whose post id is in SKIP_URLS — that is the authoritative list of threads I have already commented on or dismissed. Additionally, if FetchRedditThread surfaced a comment authored by "' + (redditHandle || '<sites.reddit.username>') + '" (case-insensitive, strip leading "u/"), skip that thread too. But do NOT skip a thread merely because you could not read its full comment tree: SKIP_URLS plus the page\'s render-time already-commented filter already catch those, so a missing/partial thread read is NEVER a reason to emit zero discovery cards.',
    '  2. REPLY TO THE OP — not to a nested comment. The draft is a top-level reply to the post itself: it is the easiest for me to post (the reply box sits at the top of the thread, no hunting for a buried comment) and a top-level comment on an active thread gets far more visibility, which is the point. Do NOT emit `reply_target` for discovery cards. (reply_target is only for `mentions`/reply_to_me, where the comment is in my own inbox.)',
    '  3. GROUND THE DRAFT. Use the OP body + whatever comments FetchRedditThread returned to understand the discussion (at minimum the OP). Don\'t parrot points existing commenters already made — offer a distinct angle — but the draft replies to the OP, not to any one commenter.',
    'Then emit the card with `author` (the OP handle — `u/<name>` from FetchReddit\'s author field, or op.author from FetchRedditThread — so I see who I\'d be replying to), `excerpt` (plain-text OP body, ~500 chars; strip markdown/HTML, for UI display) and `draft_starter` (your 2-4 sentence top-level reply in voice). Drafting the discovery starter IS this step\'s job; this is the only place you draft. The separate Draft chip handles broadcast posts, not comment-on-thread starters.',
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
    'Read what\'s on the page: progress card (what I shipped/learned), discovery cards (thread opportunities + what people in my space are posting), mention cards (where I\'ve been mentioned).',
    '',
    'If the x-post lane is enabled AND sites.x.enabled, FIRST call FetchXOwnPosts (my recent X posts + their likes/reposts/replies/views). Use it two ways: (1) do NOT repeat a point a recent post already made — pick a different angle or emit `empty`; (2) lean toward the themes/voice of my highest-`score` posts, since those are what this audience actually engages with. The post content still comes from the progress card or my intent; own-posts is the de-dup + what-works signal, not the source material. Empty + error when X creds are absent — just skip it.',
    '',
    'For each enabled lane in config.targets[*].enabled, generate one draft following references/lane-templates.md constraints. Five passes — do NOT skip:',
    '',
    'Pass 0 — Mode selection. Drafts have three shapes; pick one per lane based on what\'s on the page (see "Lead artifact + mode" in style-guide.md for worked examples).',
    '  - local-led: the progress card has an artifact that\'s publicly legible on its own (a benchmark, a measurable behaviour change, a novel approach, a vivid bug). Open with that artifact. Discovery cards are supporting evidence at most.',
    '  - web-led + local proof (BEST when both available): the local artifact is too insider to open with, but a discovery card sits on an adjacent topic. Open with the web hook (the question the public is already asking), pivot to the local artifact as the proof point ("yesterday I shipped X" / "hit the same wall"). Personal stake + public reach.',
    '  - web-only: no local artifact this lane could honestly carry; only outside commentary. Use sparingly — posts with no personal stake feel like industry commentary, which dilutes voice. If you\'d reach for this mode twice in a row for the same lane, emit `empty` instead.',
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

// Actions that act ON a card (open/copy its link or text) also select it, so
// acting on a card highlights it just like clicking the card body does.
// Dismiss/draft actions are excluded — they remove or transform the card.
const SELECTING_ACTIONS = ['open', 'open-url', 'copy', 'copy-url'];

function wireCardActions() {
  const container = document.getElementById('sections-container');
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (btn) {
      if (SELECTING_ACTIONS.includes(btn.dataset.action)) {
        const card = btn.closest('.card');
        if (card) selectCard(container, card);
      }
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

// Single-select a card (non-toggle): clear siblings, highlight this one.
function selectCard(container, card) {
  container.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
  card.classList.add('selected');
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
    case 'copy-url': {
      // Copy the card's source URL — same resolution order as `open` so the
      // copied link matches where Open would take you (reply-target permalink
      // when the agent picked one, else thread/post/card url).
      const url = btn?.dataset?.url
        || card?.reply_target?.url
        || card?.thread_url || card?.your_post_url || card?.url
        || card?.follow_up?.comment_url;
      if (!url) { flash(btn, 'No URL'); break; }
      copyToClipboard(url).then((ok) => flash(btn, ok ? 'Copied ✓' : 'Press ⌘C to copy'));
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
    case 'submit-hn': {
      // Open HN's prefilled submit form (url + title). HN expires the form's
      // server-side token quickly ("Unknown or expired link") if you dawdle or
      // the prefill GET goes stale — so copy the URL first as a guaranteed
      // fallback: if HN errors, just open /submit and paste. Submit promptly.
      const u = card?.url;
      const t = card?.title || card?.thread_title || '';
      if (!u) { flash(btn, 'No URL'); break; }
      copyToClipboard(u);
      const submit = `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`;
      window.open(submit, '_blank', 'noopener,noreferrer');
      flash(btn, 'URL copied — submit promptly');
      break;
    }
    case 'mark-posted':
      markCardPosted(cardId, btn);
      break;
    case 'x-posted':
      markXReplyPosted(cardId, btn);
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

  // Pin Pulse's model the same way CFO/sys-doctor do — but ONLY in app mode.
  // Branded Pulse.app launches with ?app_mode=1 → built-in Linggen Cloud model
  // (deepseek-v4-flash) or the per-skill localStorage override. In the core
  // Linggen app (no app_mode) leave it empty → the engine uses the user's own
  // global default model, so running Pulse in core doesn't burn the cloud trial.
  const search = new URLSearchParams(location.search);
  const appMode = search.get('app_mode') === '1';
  let modelId = '';
  try {
    modelId = search.get('model') || (appMode ? (localStorage.getItem('pulse:model') || 'deepseek-v4-flash') : '');
  } catch { modelId = appMode ? 'deepseek-v4-flash' : ''; }

  state.chat = await window.LinggenUI.mount(document.getElementById('chat-panel'), {
    skillName: 'pulse',
    sessionId: resumeSid || undefined,
    modelId,
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
          observeXBodyPatch(args);
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

  // Inside the unified Linggen launcher, settings live in the launcher's shared
  // settings — hide Pulse's own link so there aren't two settings entry points.
  // Standalone Pulse.app (app_mode but not in_launcher) keeps its own link.
  if (new URLSearchParams(location.search).get('in_launcher') === '1') {
    link.style.display = 'none';
    return;
  }

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
    // Hand the config to the renderer so it knows which source tabs to show
    // even before any cards arrive (the X dashboard lives on an empty tab).
    setConfig(cfg);
    // The X tab mounts its dashboard + roster card through this hook.
    setOnTabRender(renderXTab);
    // Per-tab Rescan buttons run a source-scoped gather in the CURRENT session.
    setOnRescan(handleTabRescan);
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
  document.getElementById('cascade-toast-stop')?.addEventListener('click', cancelCascade);
  await mountChat();
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
  await snapshotAudienceMetrics().catch(err => console.warn('[pulse] audience snapshot', err));
  await loadStatusStrip();
  // Prime the X dashboard cache (followers history + activity + roster), then
  // it re-renders the X tab. Fire-and-forget so it never blocks first paint.
  refreshXDashData().catch(err => console.warn('[pulse] x-dash refresh', err));
  // Auto-cascade only when this open minted a fresh session.
  maybeAutoCascade().catch(err => console.warn('[pulse] cascade failed', err));
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

// ============================ X dashboard + roster =========================
// Rendered into the X tab's #x-tab-extras mount (page-render calls
// onTabRender('x', el) on every render). Everything reads from `xDash`, a
// cache refreshed by refreshXDashData() — the render path stays synchronous.
//   followers : account-health.json health.x.history  (real, accruing)
//   activity  : state/x-activity.json  { "YYYY-MM-DD": {drafted, posted} }
//   roster    : config.x.roster (agent-curated, fed by the x_roster body_patch)

const X_ACTIVITY_PATH = `${SKILL_DIR}/state/x-activity.json`;
const CONFIG_PATH = `${SKILL_DIR}/config.json`;
let xDash = { followers: [], activity: {}, roster: [] };
let xDashRange = 30; // hero window in days; chips switch 7/30/90

function todayISO() { return new Date().toISOString().slice(0, 10); }

function lastNDays(n) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function activitySum(field, days) {
  const set = new Set(lastNDays(days));
  let s = 0;
  for (const [d, rec] of Object.entries(xDash.activity || {})) {
    if (set.has(d)) s += (rec[field] || 0);
  }
  return s;
}

// Followers points within `days`, falling back to the last few points so a
// young store still draws a line instead of vanishing (honest clamp-to-span).
function clampFollowers(days) {
  const h = Array.isArray(xDash.followers) ? xDash.followers : [];
  const cutoff = Date.now() - days * 86400000;
  const within = h.filter(p => new Date(p.date + 'T00:00:00Z').getTime() >= cutoff);
  if (within.length >= 2) return within;
  return h.slice(-Math.max(2, Math.min(h.length, 8)));
}

function xPendingDraftCount() {
  const disc = getSession()?.sections?.discovery?.cards || [];
  return disc.filter(c => (c.source || '').toLowerCase() === 'x' && c.draft_starter && !c.posted).length;
}

async function refreshXDashData() {
  try {
    const health = await readJson(`${SKILL_DIR}/state/account-health.json`, {});
    xDash.followers = Array.isArray(health?.x?.history) ? health.x.history.slice() : [];
  } catch { xDash.followers = []; }
  try { xDash.activity = (await readJson(X_ACTIVITY_PATH, {})) || {}; } catch { xDash.activity = {}; }
  try {
    const cfg = await readPulseConfig();
    xDash.roster = Array.isArray(cfg?.sites?.x?.roster) ? cfg.sites.x.roster.slice() : [];
  } catch { xDash.roster = []; }
  try { renderAll(); } catch (e) { /* ignore */ }
}

async function bumpXActivity(field, n) {
  if (!n) return;
  let data = {};
  try { data = (await readJson(X_ACTIVITY_PATH, {})) || {}; } catch { /* fresh */ }
  const day = todayISO();
  const rec = data[day] || { drafted: 0, posted: 0 };
  rec[field] = (rec[field] || 0) + n;
  data[day] = rec;
  const keys = Object.keys(data).sort();
  while (keys.length > 120) delete data[keys.shift()];
  await writeJson(X_ACTIVITY_PATH, data);
  xDash.activity = data;
  try { renderAll(); } catch (e) { /* ignore */ }
}

// Mirror the agent's x_roster body_patch into config.x.roster (authoritative,
// so FetchXTargets + the who-to-follow exclusion can read it next run).
// Honors the user's ignore/dismiss decisions so pruned accounts never return.
async function persistRosterFromPatch(cards) {
  const list = (Array.isArray(cards) ? cards : [])
    .filter(c => c && c.handle && c.type !== 'empty')
    .map(c => ({
      handle: String(c.handle).replace(/^@/, ''),
      name: c.name || '',
      followers: c.followers || 0,
      bio: c.bio || '',
      followed: !!c.followed,
      source: String(c.source || ''),
      why: c.why || '',
    }));
  if (!list.length) return;
  try {
    const cfg = await readPulseConfig();
    const sites = (cfg.sites = cfg.sites || {});
    const x = (sites.x = sites.x || {});
    const blocked = new Set([
      ...(x.ignored_accounts || []),
      ...(x.dismissed_suggestions || []),
    ].map(h => String(h).toLowerCase().replace(/^@/, '')));
    x.roster = list.filter(r => !blocked.has(r.handle.toLowerCase()));
    await writeJson(CONFIG_PATH, cfg);
    xDash.roster = x.roster;
    try { renderAll(); } catch (e) { /* ignore */ }
  } catch (e) { console.warn('[pulse] roster persist failed', e); }
}

// Prune a roster account: ignore (a followed reply-target) or dismiss (a
// not-followed suggestion). Removes it from the roster + records it so it
// never resurfaces.
async function rosterPrune(kind, handle) {
  const h = String(handle).replace(/^@/, '');
  try {
    const cfg = await readPulseConfig();
    const sites = (cfg.sites = cfg.sites || {});
    const x = (sites.x = sites.x || {});
    x.roster = (x.roster || []).filter(r => String(r.handle).toLowerCase() !== h.toLowerCase());
    const key = kind === 'ignore' ? 'ignored_accounts' : 'dismissed_suggestions';
    const set = new Set((x[key] || []).map(s => String(s).replace(/^@/, '')));
    set.add(h);
    x[key] = Array.from(set);
    await writeJson(CONFIG_PATH, cfg);
    xDash.roster = x.roster;
    try { renderAll(); } catch (e) { /* ignore */ }
  } catch (e) { console.warn('[pulse] roster prune failed', e); }
}

function getRoster() {
  if (Array.isArray(xDash.roster) && xDash.roster.length) return xDash.roster;
  const sec = getSession()?.sections?.x_roster;
  if (sec && Array.isArray(sec.cards)) return sec.cards.filter(c => c && c.handle && c.type !== 'empty');
  return [];
}

// ---- SVG charts (hand-rolled, no library — matches CFO's idiom) ----------

// ① Growth vs Activity — followers area+line with posted-reply bars on the
// same timeline. Answers "is engaging growing me?".
function svgGrowthHero() {
  const fol = clampFollowers(xDashRange);
  if (fol.length < 2) {
    const since = (xDash.followers[0] && xDash.followers[0].date) || 'today';
    return `<div class="chart-empty">Followers tracking started ${escapeHtml(since)} — your growth curve fills in over the next few days.</div>`;
  }
  const W = 600, H = 150, PADT = 12, PADB = 16, PADX = 2;
  const xAt = i => PADX + (i / (fol.length - 1)) * (W - 2 * PADX);
  const counts = fol.map(p => p.count);
  let lo = Math.min(...counts), hi = Math.max(...counts);
  if (lo === hi) { lo -= 1; hi += 1; }
  const yAt = v => PADT + (1 - (v - lo) / (hi - lo)) * (H - PADT - PADB);
  const pts = fol.map((p, i) => [xAt(i), yAt(p.count)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `M${pts[0][0].toFixed(1)} ${(H - PADB).toFixed(1)} ` +
    pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts[pts.length - 1][0].toFixed(1)} ${(H - PADB).toFixed(1)} Z`;
  const posted = {};
  for (const [d, rec] of Object.entries(xDash.activity || {})) posted[d] = rec.posted || 0;
  const pmax = Math.max(1, ...fol.map(p => posted[p.date] || 0));
  const bars = fol.map((p, i) => {
    const v = posted[p.date] || 0;
    if (!v) return '';
    const bh = (v / pmax) * (H - PADT - PADB) * 0.55;
    return `<rect x="${(xAt(i) - 2).toFixed(1)}" y="${(H - PADB - bh).toFixed(1)}" width="4" height="${bh.toFixed(1)}" class="bar-posted"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">
    <path d="${area}" class="area-foll"/>
    <path d="${line}" class="line-foll" vector-effect="non-scaling-stroke"/>
    ${bars}
  </svg>`;
}

// ② Cadence — drafted vs posted X replies per day, last 14 days.
function svgCadence() {
  const days = lastNDays(14);
  const data = days.map(d => ({
    drafted: xDash.activity[d]?.drafted || 0,
    posted: xDash.activity[d]?.posted || 0,
  }));
  if (data.every(x => !x.drafted && !x.posted)) {
    return `<div class="chart-empty">No drafted or posted replies yet — run a gather, then mark the ones you post.</div>`;
  }
  const max = Math.max(1, ...data.map(x => Math.max(x.drafted, x.posted)));
  const W = 600, H = 96, PADT = 6, PADB = 4;
  const slot = W / days.length;
  const bw = Math.max(2, (slot - 4) / 2);
  const yAt = v => PADT + (1 - v / max) * (H - PADT - PADB);
  let bars = '';
  data.forEach((x, i) => {
    const x0 = i * slot + 2;
    const dh = (H - PADT - PADB) * (x.drafted / max);
    const ph = (H - PADT - PADB) * (x.posted / max);
    bars += `<rect x="${x0.toFixed(1)}" y="${yAt(x.drafted).toFixed(1)}" width="${bw.toFixed(1)}" height="${dh.toFixed(1)}" class="bar-drafted"/>`;
    bars += `<rect x="${(x0 + bw).toFixed(1)}" y="${yAt(x.posted).toFixed(1)}" width="${bw.toFixed(1)}" height="${ph.toFixed(1)}" class="bar-posted2"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">${bars}</svg>`;
}

// ---- Dashboard + roster DOM ----------------------------------------------

function xDashboardHtml(roster) {
  const fol = xDash.followers;
  const cur = fol.length ? fol[fol.length - 1].count : null;
  const d7 = followerDelta(fol, 7);
  const followed = roster.filter(r => r.followed).length;
  const suggested = roster.length - followed;
  const dStr = d7 ? `<span class="${d7.delta >= 0 ? 'up' : 'down'}">${d7.delta >= 0 ? '+' : ''}${d7.delta}/${d7.spanDays}d</span>` : '';
  const kpi = (label, value, sub) =>
    `<div class="xkpi"><div class="xkpi-v">${value}</div><div class="xkpi-l">${label}</div><div class="xkpi-s">${sub || ''}</div></div>`;
  const chip = n => `<button class="xr-chip${xDashRange === n ? ' active' : ''}" data-range="${n}">${n}d</button>`;
  // ③ roster mix
  const total = roster.length || 1;
  const fp = (followed / total * 100).toFixed(1);
  const sp = (suggested / total * 100).toFixed(1);
  const bySrc = {};
  roster.forEach(r => { if (!r.followed) { const s = r.source || '?'; bySrc[s] = (bySrc[s] || 0) + 1; } });
  const srcLabel = Object.entries(bySrc).sort().map(([s, n]) => `src ${escapeHtml(s)}: ${n}`).join(' · ');
  return `
    <div class="xkpi-strip">
      ${kpi('Followers', cur != null ? fmtCount(cur) : '—', dStr)}
      ${kpi('Posted · 7d', activitySum('posted', 7), '')}
      ${kpi('Pending drafts', xPendingDraftCount(), '')}
      ${kpi('Roster', `${followed}<span class="dot-foll">✓</span> ${suggested}<span class="dot-sugg">+</span>`, '')}
    </div>
    <div class="xchart">
      <div class="xchart-head"><span>Growth vs activity</span><span class="xr-chips">${chip(7)}${chip(30)}${chip(90)}</span></div>
      ${svgGrowthHero()}
      <div class="xchart-legend"><span class="lg-foll">— followers</span> <span class="lg-posted">▮ replies posted</span></div>
    </div>
    <div class="xchart">
      <div class="xchart-head"><span>Reply cadence · 14d</span><span class="xchart-legend"><span class="lg-drafted">▮ drafted</span> <span class="lg-posted">▮ posted</span></span></div>
      ${svgCadence()}
    </div>
    <div class="xchart">
      <div class="xchart-head"><span>Roster mix</span></div>
      <div class="rmix-bar"><div class="rmix-foll" style="width:${fp}%"></div><div class="rmix-sugg" style="width:${sp}%"></div></div>
      <div class="rmix-legend"><span class="dot-foll">●</span> ${followed} following · <span class="dot-sugg">●</span> ${suggested} suggested${srcLabel ? ' · ' + srcLabel : ''}</div>
    </div>
  `;
}

function rosterCardHtml(roster) {
  if (!roster.length) {
    return `<div class="roster-head"><span>X Targets</span></div>
      <div class="roster-empty">No roster yet — run Gather web (or Rescan X) and Pulse will curate ~20 niche accounts from your who-to-follow recs, on-topic posters, and second-degree follows.</div>`;
  }
  // Followed first (reply targets), then suggestions; stable by score order.
  const rows = roster.slice().sort((a, b) => (b.followed === a.followed ? 0 : b.followed ? 1 : -1));
  const rowHtml = r => {
    const h = escapeHtml(r.handle);
    const tag = r.followed
      ? '<span class="r-tag foll" title="You follow this account">✓</span>'
      : '<span class="r-tag sugg" title="Suggested — not followed yet">+</span>';
    const why = r.why ? `<div class="r-why">${escapeHtml(r.why)}</div>` : '';
    const followers = r.followers ? `<span class="r-fol">${fmtCount(r.followers)}</span>` : '';
    // Bio → hover tooltip on the whole cell, to keep cells short.
    const titleAttr = r.bio ? ` title="${escapeHtml(r.bio)}"` : '';
    const actions = r.followed
      ? `<button class="r-act" data-act="open" data-h="${h}">↗ Profile</button><button class="r-act ignore" data-act="ignore" data-h="${h}">Ignore</button>`
      : `<button class="r-act follow" data-act="follow" data-h="${h}">+ Follow ↗</button><button class="r-act ignore" data-act="dismiss" data-h="${h}">Dismiss</button>`;
    return `<div class="r-cell ${r.followed ? 'is-foll' : 'is-sugg'}"${titleAttr}>
      <div class="r-top">${tag} <span class="r-handle">@${h}</span> ${followers}</div>
      ${why}
      <div class="r-actions">${actions}</div>
    </div>`;
  };
  return `<div class="roster-head"><span>X Targets</span><span class="roster-count">${roster.length}</span></div>
    <div class="roster-rows">${rows.map(rowHtml).join('')}</div>`;
}

function renderXTab(tabId, mount) {
  if (tabId !== 'x' || !mount) return;
  const roster = getRoster();

  const dash = document.createElement('div');
  dash.className = 'x-dash';
  dash.innerHTML = xDashboardHtml(roster);
  dash.querySelectorAll('.xr-chip').forEach(b => {
    b.addEventListener('click', () => { xDashRange = +b.dataset.range || 30; renderAll(); });
  });
  mount.appendChild(dash);

  const card = document.createElement('div');
  card.className = 'roster-card';
  card.innerHTML = rosterCardHtml(roster);
  card.querySelectorAll('.r-act').forEach(b => {
    b.addEventListener('click', () => {
      const act = b.dataset.act, h = b.dataset.h;
      if (act === 'open' || act === 'follow') {
        window.open(`https://x.com/${encodeURIComponent(h)}`, '_blank', 'noopener');
        if (act === 'follow') flash(b, 'opened ↗');
      } else if (act === 'ignore') {
        rosterPrune('ignore', h);
      } else if (act === 'dismiss') {
        rosterPrune('dismiss', h);
      }
    });
  });
  mount.appendChild(card);
}

// Per-tab Rescan — a source-scoped gather sent into the CURRENT chat session
// (the CFO model: a button → chat.send, no new session). The agent already
// carries SKILL.md + the Fetch tools, so each prompt stays focused.
const RESCAN_PROMPTS = {
  x: [
    'Refresh my X targets in THIS session.',
    'First ensure the target roster: if sites.x.roster is empty (or I am asking to refresh accounts), rebuild it per the discover-customers "X target roster" procedure — FetchXWhoToFollow (source 1), authors of on-topic FetchX hits (source 2), FetchXFollowing <handle> on my strongest targets (source 3); tag each `followed` via FetchXFollowing (no arg = my own following); exclude self + sites.x.ignored_accounts + sites.x.dismissed_suggestions; curate ~20 with a one-line `why`; emit a `x_roster` body_patch (source-1 first). If the roster already has accounts and I did not ask to refresh, skip rebuilding.',
    'Then call FetchXTargets and emit the freshest posts as `discovery` cards (source:"x") — bypass the 0.6 fit gate (the roster is pre-vetted), drop any whose status id is in SKIP_URLS, freshest first. No prose response.',
  ].join('\n'),
  hn: 'Find fresh Hacker News threads on my topics in THIS session. Call FetchHNSearch per topic (and FetchHackerNews); rank by heat (points + comments + recency); for survivors clearing 0.6 fit, read with FetchHNThread and draft a top-level hn-comment reply; emit `discovery` cards (source:"hn"). Also call FetchHNSubmitCandidates and emit `hn_submit` cards. Drop SKIP_URLS. No prose response.',
  reddit: 'Find fresh Reddit threads in my configured subs on my topics, in THIS session. Call FetchReddit; drop SKIP_URLS; for question / pain-point threads clearing 0.6 fit, read with FetchRedditThread and draft a top-level reddit-comment reply; emit `discovery` cards (source:"reddit"). No prose response.',
  bluesky: 'Find fresh Bluesky posts on my keywords, in THIS session. Call FetchBlueskyKeywords; for on-topic question / pain-point posts, draft a reply and emit `discovery` cards (sub:"bsky"). Drop SKIP_URLS. No prose response.',
  mentions: 'Check my mentions across sources in THIS session. Call FetchRedditMentions (and FetchXMentions / FetchBlueskyMentions if their sites are enabled). Emit `mention` and `reply_to_me` cards into the `mentions` section per SKILL.md. NEVER fabricate — a tool error or empty result contributes no card; only if nothing real exists anywhere, emit one `empty` card. No prose response.',
};

function handleTabRescan(tabId) {
  if (tabId === 'progress') { runGatherLocal(); return; }
  const prompt = RESCAN_PROMPTS[tabId];
  if (prompt) sendChatHidden(prompt);
}

// User marks an X reply card as posted → feed the cadence/posted series.
async function markXReplyPosted(cardId, btn) {
  const card = findCard(cardId);
  if (card) { card.posted = true; const sess = getSession(); loadSession(sess); persistSession(sess); }
  if (btn) flash(btn, '✓ posted');
  await bumpXActivity('posted', 1);
}

// Watch each agent body_patch: mirror the roster, and count newly-drafted X
// replies into the cadence series (deduped by card id so a replace re-emit
// doesn't double-count).
const xDraftedCounted = new Set();
function observeXBodyPatch(args) {
  if (!args || args.body_patch === undefined) return;
  // body_patch may be a single {section,cards} OR an array of them — mirror
  // applyPageUpdate, which iterates both. (Missing the array form is what left
  // config.x.roster unpersisted when the agent batched sections.)
  const patches = Array.isArray(args.body_patch) ? args.body_patch : [args.body_patch];
  for (const bp of patches) {
    if (!bp || !bp.section) continue;
    if (bp.section === 'x_roster') {
      persistRosterFromPatch(bp.cards || []);
    } else if (bp.section === 'discovery') {
      let fresh = 0;
      for (const c of (bp.cards || [])) {
        if (!c || (c.source || '').toLowerCase() !== 'x' || !c.draft_starter) continue;
        const key = c.id || c.url || '';
        if (key && xDraftedCounted.has(key)) continue;
        if (key) xDraftedCounted.add(key);
        fresh++;
      }
      if (fresh) bumpXActivity('drafted', fresh);
    }
  }
}
