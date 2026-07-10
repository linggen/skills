// Memory App — thin client.
//
// JS responsibilities:
//   1. Mount the chat panel (sessions are app-managed, CFO-style).
//   2. On open, paint the dashboard deterministically from disk + the
//      ling-mem daemon's count endpoint. No LLM round-trip required.
//      The agent stays passive until the user clicks Hippocampus
//      or types a chat question.
//   3. Tier-count cards live in top_bar so they persist across any
//      PageUpdate the agent emits later (action reports replace body
//      only).
//   4. Render PageUpdate events from the agent (action reports).
//   5. Forward widget button clicks as plain user messages.
//
// The agent's BOOT_PROMPT is intentionally tiny: JS owns the on-open
// render, so the agent's only job at boot is to be ready in the chat
// panel. Everything heavy moves to the click-driven hippocampus flow
// (SKILL.md slash commands).

import {
  fetchDefaultModel,
  fetchMemoryCount,
  fetchMemoryDays,
  fetchMemoryStats,
  listSkillSessions,
  readJsonFile,
  writeJsonFile,
} from './api.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';

// The REGISTERED skill name — session create resolves the skill's
// declared cwd and binds its permission grants by this exact name.
// ('ling-mem' here silently broke both: no cwd on the session, no
// grants applied, so every scan Bash hit a permission prompt.)
const SKILL_NAME = 'shared-memory';

// Tiny boot prompt — the agent greets, then waits for input. JS already
// drew the dashboard (tier cards + calendar) before this lands.
const BOOT_PROMPT = `You are Ling inside the Memory skill. The dashboard (tier counts + dream calendar) is already painted on screen by JS — don't re-fetch or restate it, and don't emit a PageUpdate on boot.

On boot, send ONE warm, short greeting (≤25 words) introducing yourself and what this skill does: durable memory across all your AI sessions. Mention they can hit "Dream" (or click a pending day) to remember it into long-term memory, or just ask what you remember. No preamble, no bullet lists, no "Done"/"awaiting action" phrasing.

Then wait. When the user acts:
- "/shared-memory dream" or "/shared-memory dream <YYYY-MM-DD>" → follow references/dream-flow.md: remember the pending day(s) via Memory_query/Memory_write (days worklist → day list → cluster → promote → remember_day stamp → sweep). No PageUpdate needed — the page watches the tool stream and repaints the calendar itself; just end with your one-line totals.
- Anything else → answer normally, use Memory_query when relevant.`;

const params = new URLSearchParams(window.location.search);
let modelId = params.get('model') || '';
let chat = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!modelId) {
    try {
      const defaultModel = await fetchDefaultModel();
      modelId = localStorage.getItem('memory:model') || defaultModel || '';
    } catch { /* ignore */ }
  }
  // Opening from the skill card has no `?session=`. Resume the most recent
  // ling-mem session by default instead of spawning a fresh one each time.
  // Sessions are app-managed (CFO-style) — no session list UI.
  const existingSession = params.get('session') || '';
  const initialSession = existingSession || (await latestSkillSession());
  // Reflect a resumed session in the URL so reload/refresh stays put.
  if (!existingSession && initialSession) {
    const url = new URL(window.location);
    url.searchParams.set('session', initialSession);
    history.replaceState(null, '', url);
  }
  await mountAndStart(initialSession || null);
});

// Most recent ling-mem skill session id, or '' if none exists yet or the
// latest is older than 24h (all apps share this rule: latest if < 24h,
// else auto-fresh — CFO/DJ/Sys Doctor/Pulse do the same).
async function latestSkillSession() {
  try {
    const sessions = await listSkillSessions(SKILL_NAME);
    if (!sessions.length) return '';
    // list order isn't guaranteed — pick the newest by created_at.
    const latest = sessions.reduce((a, b) =>
      (b.created_at || 0) > (a.created_at || 0) ? b : a);
    const ageHours = (Date.now() / 1000 - (latest.created_at || 0)) / 3600;
    return ageHours < 24 ? (latest.id || '') : '';
  } catch {
    return '';
  }
}

async function mountAndStart(sessionId) {
  const chatPanel = document.getElementById('chat-panel');
  const mountOpts = {
    skillName: SKILL_NAME,
    agentId: 'ling',
    modelId,
    title: 'Memory',
    onSessionCreated: (sid) => {
      const url = new URL(window.location);
      url.searchParams.set('session', sid);
      history.replaceState(null, '', url);
    },
    onStreamEnd: handleLegacyPageBlock,
    onContentBlock: handleContentBlock,
  };
  if (sessionId) mountOpts.sessionId = sessionId;
  chat = await LinggenUI.mount(chatPanel, mountOpts);

  // Widget buttons send plain text — the agent reads the message and
  // decides what to do based on SKILL.md. One exception: a bare
  // `/shared-memory dream` (header button, greeting CTA) routes to the
  // real dream mission instead of the chat session, so every dream
  // trigger shares the mission's agent, in-flight guard, run record
  // and report (memory-spec: one dream executor). Day-scoped dreams go
  // through the calendar buttons, which call the mission directly.
  window._chatSend = (text) => {
    if (typeof text === 'string' && text.trim() === '/shared-memory dream') {
      triggerDreamMission();
      return;
    }
    if (chat) chat.send(text);
  };
  // The calendar widget polls this while a mission run is in flight.
  window._refreshDreamCalendar = () => refreshDaysCalendar().catch(() => {});
  // Local-only chat notice (no LLM turn) — the calendar uses it to tell
  // the user a mission run started in its own session.
  window._chatNotify = (text) => { if (chat) chat.addMessage(text); };
  setupActionBar();

  if (sessionId && await tryRestoreCached(sessionId)) {
    // Resumed session with a cached page — don't re-boot the agent.
    // The cached page comes back via tryRestoreCached; tier counts +
    // day states refresh below so the user sees current data even on
    // resume (the cached calendar may predate a dream run).
    refreshTierCounts().catch(() => {});
    refreshDaysCalendar().catch(() => {});
    return;
  }

  // JS-driven first paint. No LLM round-trip. The agent's boot prompt
  // runs in the background and never touches top_bar / body — JS owns
  // both until the user clicks an action.
  await paintDashboard();

  // WebRTC data-channel setup runs AFTER the iframe's `load` event;
  // sending the boot prompt before the channel is up gets silently
  // dropped. 1.5s matches the working flow used historically.
  setTimeout(() => {
    if (chat) chat.sendHidden(BOOT_PROMPT);
  }, 1500);
}

// ── On-open dashboard ──
//
// Reads three count endpoints + the daemon's per-day dream-state
// rollup in parallel, then paints a deterministic dashboard. The
// greeting line + primary CTA are rule-picked from state — no LLM
// required for the first render. Tier counts go to top_bar so the
// agent's later action-result PageUpdates (body-only) don't blow
// them away.
//
// The calendar is a rendering of the daemon's `days` rollup — the
// single source of truth for the dream pipeline (pending / remembered
// / forgotten per day). The old `.dream-history.jsonl` /
// `.dream-state.json` sidecars are retired.

async function paintDashboard() {
  let coreC, semC, epC, daysData;
  try {
    [coreC, semC, epC, daysData, lastStats] = await Promise.all([
      fetchMemoryCount({ tier: 'core' }),
      fetchMemoryCount({ tier: 'semantic' }),
      fetchMemoryCount({ episodic: true }),
      fetchMemoryDays(),
      fetchMemoryStats(),
    ]);
  } catch (e) {
    console.warn('[memory] paintDashboard fetch failed', e);
    coreC = { count: 0 };
    semC = { count: 0 };
    epC = { count: 0 };
    daysData = null;
    lastStats = null;
  }
  const summary = { coreC, semC, epC, daysData };
  const greeting = pickGreeting(summary);
  const calendar = buildDreamCalendar(daysData);

  applyPageUpdate({
    top_bar: buildTierCards(summary),
    body: [greeting, calendar],
    footer: buildFooter(summary),
  });
  cacheCurrentPage();
}

// Shape the daemon's rollup into the dream-calendar widget: a per-day
// map keyed by ISO date. Always returns a widget — on a fresh box the
// grid renders all-grey with today ringed.
function buildDreamCalendar(daysData) {
  const days = {};
  for (const d of daysData?.days || []) {
    if (d?.date) days[d.date] = d;
  }
  return { type: 'dream-calendar', title: 'Dream activity', days };
}

// Kick the dream mission (nightly protocol: all pending days, then the
// sweep) and poll the rollup while it runs. 409 = already in flight.
async function triggerDreamMission() {
  try {
    const res = await fetch('/api/missions/dream/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status === 409) {
      if (chat) chat.addMessage('A dream run is already in flight — the calendar updates as it works.');
      return;
    }
    if (chat) chat.addMessage('Dream mission started — remembering pending days, then the forget sweep. The calendar updates as it works.');
  } catch {
    if (chat) chat.addMessage('Could not reach the mission API — is the daemon running?');
    return;
  }
  let ticks = 0;
  const timer = setInterval(async () => {
    ticks += 1;
    await refreshDaysCalendar().catch(() => {});
    if (ticks >= 36) clearInterval(timer); // ~3 min of 5s polls
  }, 5000);
}

// Re-fetch the days rollup and swap the calendar widget in place,
// leaving the rest of the body (greeting / report widgets) untouched.
async function refreshDaysCalendar() {
  const daysData = await fetchMemoryDays();
  if (!daysData) return;
  const page = getCurrentPage();
  const body = Array.isArray(page.body) ? page.body : [];
  const calendar = buildDreamCalendar(daysData);
  const rest = body.filter((w) => !(w && w.type === 'dream-calendar'));
  applyPageUpdate({ body: [...rest, calendar], footer: buildFooter({ daysData }) });
  cacheCurrentPage();
}

async function refreshTierCounts() {
  const [coreC, semC, epC] = await Promise.all([
    fetchMemoryCount({ tier: 'core' }),
    fetchMemoryCount({ tier: 'semantic' }),
    fetchMemoryCount({ episodic: true }),
  ]);
  // Top-bar only — body stays as whatever the agent (or cache) put there.
  applyPageUpdate({
    top_bar: buildTierCards({ coreC, semC, epC }),
  });
}

function buildTierCards({ coreC, semC, epC }) {
  return [
    cardWidget('CORE', coreC, null),
    cardWidget('SEMANTIC', semC, null),
    cardWidget('EPISODIC', epC, epC?.count > 50 ? 'amber' : null),
  ];
}

function cardWidget(label, c, alertColor) {
  const value = (c && typeof c.count === 'number') ? c.count : '—';
  const sub = c?.latest_created_at ? `latest ${ageOf(c.latest_created_at)}` : '';
  return { data: { label, value, sub, color: alertColor } };
}

// Latest remember stamp across all days — the "last dream" the footer
// and greeting reason about.
function lastRememberedAt(daysData) {
  let latest = null;
  for (const d of daysData?.days || []) {
    if (d?.remembered_at && (!latest || d.remembered_at > latest)) {
      latest = d.remembered_at;
    }
  }
  return latest;
}

function pendingDays(daysData) {
  return (daysData?.days || []).filter((d) => d?.state === 'pending');
}

// Latest daemon stats snapshot (rows / disk) — refreshed by
// paintDashboard; buildFooter reads it so calendar-only refreshes keep
// the store line without an extra round-trip.
let lastStats = null;

function fmtBytes(b) {
  if (!b) return null;
  return b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`;
}

function buildFooter({ daysData }) {
  const last = lastRememberedAt(daysData);
  const parts = [last ? `last dream ${ageOf(last)}` : 'last dream: never'];
  const pending = pendingDays(daysData).length;
  if (pending > 0) parts.push(`${pending} day${pending === 1 ? '' : 's'} pending`);
  if (daysData?.ttl_days) parts.push(`short-term keeps ${daysData.ttl_days}d`);
  if (lastStats?.total != null) {
    const disk = fmtBytes(lastStats.disk_bytes?.total);
    parts.push(`${lastStats.total} rows${disk ? ` · ${disk} on disk` : ''}`);
  }
  return { text: parts.join('   ·   ') };
}

function pickGreeting({ coreC, semC, epC, daysData }) {
  const totalRows = (coreC?.count || 0) + (semC?.count || 0) + (epC?.count || 0);
  const pending = pendingDays(daysData);
  const last = lastRememberedAt(daysData);
  const runDream = { label: 'Run dream', icon: '🧠', message: '/shared-memory dream', kind: 'primary' };

  let title, primary;
  if (pending.length > 0) {
    title = pending.length === 1
      ? `1 day is waiting to be remembered (${pending[0].date}).`
      : `${pending.length} days are waiting to be remembered — oldest ${pending[0].date}.`;
    primary = runDream;
  } else if (totalRows === 0) {
    title = "Welcome — your memory's empty. It fills as you work; dream remembers each day.";
    primary = { label: 'Browse all ↗', href: 'http://127.0.0.1:9888', kind: 'primary' };
  } else {
    title = last
      ? `All caught up — last dream ${ageOf(last)}, ${totalRows} rows across all tiers.`
      : `Memory holds ${totalRows} rows — nothing pending tonight.`;
    primary = { label: 'Browse all ↗', href: 'http://127.0.0.1:9888', kind: 'primary' };
  }

  return {
    type: 'greeting',
    icon: '🧠',
    title,
    stats: 'Dream = remember + forget: each day\'s staging is judged once (durable signal promoted to long-term), then judged rows age out after the short-term window.',
    // Single contextual CTA — the header bar already carries the
    // persistent Dream + Browse actions, so don't duplicate them here.
    actions: [primary],
  };
}

function ageOf(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ── Top action bar wiring ──
//
// The buttons in memory.html's header send plain chat messages — the
// agent parses them per BOOT_PROMPT and runs the corresponding action.
// Progress streams in the chat panel; the calendar repaints from the
// daemon rollup as the agent's Memory_write calls land (see
// handleContentBlock).

function setupActionBar() {
  const dreamBtn = document.getElementById('dream-btn');
  if (!dreamBtn) return;

  // Dream = remember every pending day (oldest first) + forget sweep.
  dreamBtn.addEventListener('click', () => {
    window._chatSend('/shared-memory dream');
  });
}

// ── Tool-stream ingestion ──
//
// The chat bridge surfaces every tool call the agent makes. Two kinds
// matter here: PageUpdate (agent-drawn widgets) and Memory_write (a
// remember/sweep just changed store state → repaint counts + calendar
// from the daemon, debounced so a burst of promotes repaints once).

let refreshTimer = null;
function scheduleStateRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshTierCounts().catch(() => {});
    refreshDaysCalendar().catch(() => {});
  }, 1200);
}

function handleContentBlock(payload) {
  // Memory_write on Linggen; Bash on hosts where the agent drives the
  // `ling-mem` CLI instead. Either way the store may have moved.
  if (payload?.tool === 'Memory_write' || payload?.tool === 'Bash') {
    scheduleStateRefresh();
    return;
  }
  if (payload?.tool !== 'PageUpdate') return;
  try {
    const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
    if (!args || typeof args !== 'object') return;
    const partial = {};
    if (args.top_bar !== undefined) partial.top_bar = args.top_bar;
    if (args.body !== undefined) partial.body = args.body;
    if (args.footer !== undefined) partial.footer = args.footer;
    if (Object.keys(partial).length === 0) return;
    applyPageUpdate(partial);
    cacheCurrentPage();
    // Row totals / day states may have moved behind any agent-drawn
    // update — re-sync both from the daemon. Best-effort.
    scheduleStateRefresh();
  } catch (e) {
    console.warn('[memory] failed to parse PageUpdate args', e);
  }
}

// Fallback: some models emit a <!--page ... --> or ```page block in text
// instead of calling the tool. Parse and apply silently — no nag.
function handleLegacyPageBlock(text) {
  const page = parsePageBlock(text);
  if (!page) return;
  applyPageUpdate(page);
  cacheCurrentPage();
  refreshTierCounts().catch(() => {});
}

// ── Cache ──
//
// Per-session page state lives on disk at
// `~/.linggen/skills/shared-memory/data/<sid>/page.json`. Mirrors
// Pulse's pattern so a session opened from a different browser /
// remote-access client sees the same cached widgets. Switched from
// browser localStorage in Phase 6 of the rebuild.

function currentSessionId() {
  return new URLSearchParams(window.location.search).get('session') || '';
}

function pageCachePath(sid) {
  return `~/.linggen/skills/shared-memory/data/${sid}/page.json`;
}

// Fire-and-forget — callers don't await. Failures swallowed so a
// slow disk write never blocks a render.
function cacheCurrentPage() {
  const sid = currentSessionId();
  if (!sid) return;
  writeJsonFile(pageCachePath(sid), getCurrentPage()).catch(() => {});
}

// Async — callers must `await tryRestoreCached(sid)`. Returns true if
// a non-empty cached page was restored, false otherwise (so the
// caller knows whether to paint the on-open dashboard from scratch).
async function tryRestoreCached(sessionId) {
  if (!sessionId) return false;
  const page = await readJsonFile(pageCachePath(sessionId)).catch(() => null);
  if (!page) return false;
  if (!(page.top_bar?.length || page.body?.length)) return false;
  restorePage(page);
  return true;
}
