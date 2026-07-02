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
  listSkillSessions,
  readJsonFile,
  readJsonl,
  readJsonlHeader,
  writeJsonFile,
} from './api.js';
import { applyPageUpdate, parsePageBlock, getCurrentPage, restorePage } from './page-renderer.js';

const SKILL_NAME = 'ling-mem';

// Tiny boot prompt — the agent greets, then waits for input. JS already
// drew the dashboard (tier cards + calendar) before this lands.
const BOOT_PROMPT = `You are Ling inside the Memory skill. The dashboard (tier counts + dream calendar) is already painted on screen by JS — don't re-fetch or restate it, and don't emit a PageUpdate on boot.

On boot, send ONE warm, short greeting (≤25 words) introducing yourself and what this skill does: durable memory across all your AI sessions — it reads recent cross-host chats and distills who you are. Mention they can hit "Dream" (or click a day) to consolidate, or just ask what you remember. No preamble, no bullet lists, no "Done"/"awaiting action" phrasing.

Then wait. When the user acts:
- "/shared-memory dream [window]" or "Run hippocampus" → follow references/dream-flow.md end-to-end: Phase 0 runs \`Bash bash ~/.linggen/skills/shared-memory/scripts/scan.sh <window>\` (window defaults to 24h; accepts week / month / 14d / 2m / YYYY-MM-DD), then read .scan-output.jsonl, judge, write, consolidate, evict. Emit a final PageUpdate with the report.
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
    agentId: 'ling-mem',
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
  // decides what to do based on SKILL.md. JS knows nothing about ranges,
  // scans, or extraction.
  window._chatSend = (text) => { if (chat) chat.send(text); };
  setupActionBar();

  if (sessionId && await tryRestoreCached(sessionId)) {
    // Resumed session with a cached page — don't re-boot the agent.
    // The cached page comes back via tryRestoreCached; tier counts
    // refresh below so the user sees current numbers even on resume.
    refreshTierCounts().catch(() => {});
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
// Reads three count endpoints + .dream-state.json in parallel, then
// paints a deterministic dashboard. The greeting line + primary CTA
// are rule-picked from state — no LLM required for the first render.
// Tier counts go to top_bar so the agent's later action-result
// PageUpdates (body-only) don't blow them away.

async function paintDashboard() {
  let coreC, semC, epC, dream;
  try {
    [coreC, semC, epC, dream] = await Promise.all([
      fetchMemoryCount({ tier: 'core' }),
      fetchMemoryCount({ tier: 'semantic' }),
      fetchMemoryCount({ episodic: true }),
      readJsonFile(`${homeDir()}/.linggen/memory/.dream-state.json`),
    ]);
  } catch (e) {
    console.warn('[memory] paintDashboard fetch failed', e);
    coreC = { count: 0 };
    semC = { count: 0 };
    epC = { count: 0 };
    dream = null;
  }
  const scanHdr = await readJsonlHeader(`${homeDir()}/.linggen/memory/.scan-output.jsonl`).catch(() => null);
  const history = await readJsonl(`${homeDir()}/.linggen/memory/.dream-history.jsonl`).catch(() => []);
  const summary = { coreC, semC, epC, dream, scanHdr };
  const greeting = pickGreeting(summary);
  const calendar = buildDreamCalendar(history);

  applyPageUpdate({
    top_bar: buildTierCards(summary),
    body: [greeting, calendar],
    footer: buildFooter(summary),
  });
  cacheCurrentPage();
}

// Aggregate the append-only dream history (one row per run) into a
// per-day map the calendar marks green. Each run covers the calendar
// range it scanned ([scanned_from .. scanned_to], inclusive) — so a
// `dream week` greens 7 days, a `dream 2026-05-20` greens one. Always
// returns a widget: on a fresh box the grid renders all-grey with
// today ringed, every cell clickable to dream that day.
function buildDreamCalendar(history) {
  const days = {};
  for (const r of Array.isArray(history) ? history : []) {
    if (!r) continue;
    const encoded = (typeof r.encoded_total === 'number')
      ? r.encoded_total
      : (r.encoded_core || 0) + (r.encoded_semantic || 0) + (r.encoded_episodic || 0);
    const from = r.scanned_from || r.date;
    const to = r.scanned_to || r.date;
    const range = isoRange(from, to);
    range.forEach((iso, i) => {
      const d = days[iso] || (days[iso] = { encoded: 0, runs: 0, core: 0, semantic: 0, episodic: 0, sessions: 0 });
      d.runs += 1;
      // Attribute the run's encoded counts + session count to its last
      // (most recent) day so a multi-day window doesn't multiply totals.
      if (i === range.length - 1) {
        d.encoded += encoded;
        d.core += r.encoded_core || 0;
        d.semantic += r.encoded_semantic || 0;
        d.episodic += r.encoded_episodic || 0;
        d.sessions += r.sessions || 0;
      }
    });
  }
  return { type: 'dream-calendar', title: 'Dream activity', days };
}

// Inclusive list of YYYY-MM-DD strings from `from` to `to` (local
// dates). Capped at 400 days so a malformed row can't run away.
function isoRange(from, to) {
  if (!from || !to) return from ? [from] : [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (isNaN(d) || isNaN(end) || end < d) return from === to ? [from] : [];
  const out = [];
  for (let g = 0; d <= end && g < 400; g++) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${d.getFullYear()}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
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

function homeDir() {
  // The skill's cwd is `~/.linggen` per SKILL.md, and the /api/bash
  // proxy expands `~` to $HOME. Just hard-code the literal here so
  // command strings stay readable.
  return '~';
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

function humanWindow(w) {
  return { '24h': '1-day', '7d': '1-week', '30d': '1-month' }[w] || w;
}

function buildFooter({ dream, scanHdr }) {
  if (!dream?.last_run_at) return { text: 'last dream: never' };
  const parts = [`last dream ${ageOf(dream.last_run_at)}`];
  if (dream.window) parts.push(`${humanWindow(dream.window)} window`);
  const sessions = scanHdr?.sessions_scanned;
  if (typeof sessions === 'number') parts.push(`${sessions} sessions read`);
  return { text: parts.join('   ·   ') };
}

function pickGreeting({ coreC, semC, epC, dream }) {
  const totalRows = (coreC?.count || 0) + (semC?.count || 0) + (epC?.count || 0);
  const lastHippo = dream?.last_run_at;
  const epCount = epC?.count || 0;
  const runDream = { label: 'Run dream', icon: '🧠', message: '/shared-memory dream', kind: 'primary' };

  let title, primary;
  if (totalRows === 0 && !lastHippo) {
    title = "Welcome — your memory's empty. Run dream to read recent sessions.";
    primary = runDream;
  } else if (epCount > 50) {
    title = `Staging is filling up — ${epCount} episodic rows. Time for a dream pass.`;
    primary = runDream;
  } else if (!lastHippo || daysSince(lastHippo) >= 1) {
    title = lastHippo
      ? `Last dream ${ageOf(lastHippo)}. Pull in newer sessions?`
      : 'Run dream to read recent sessions into memory.';
    primary = runDream;
  } else {
    title = `Memory's up to date — ${totalRows} rows across all tiers.`;
    primary = { label: 'Browse all ↗', href: 'http://127.0.0.1:9888', kind: 'primary' };
  }

  return {
    type: 'greeting',
    icon: '🧠',
    title,
    stats: 'Dream reads recent cross-host sessions, judges them, and writes memory — script walk + LLM judgment in one pass.',
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

function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

// ── Top action bar wiring ──
//
// The buttons in memory.html's header send plain chat messages — the
// agent parses them per BOOT_PROMPT and runs the corresponding action.
// Period is on a sibling <select>. After hippocampus, the agent
// emits a PageUpdate with the run report; tier-counts in top_bar
// refresh automatically because the daemon's count endpoint runs after
// every PageUpdate (see handleContentBlock).

function setupActionBar() {
  const dreamBtn = document.getElementById('dream-btn');
  const periodSel = document.getElementById('dream-period');
  if (!dreamBtn) return;

  // Hippocampus runs the whole pass (scan walk → judge → consolidate).
  // The period <select> feeds the dream window: ''=24h, week, month.
  dreamBtn.addEventListener('click', () => {
    const w = periodSel?.value || '';
    window._chatSend(w ? `/shared-memory dream ${w}` : '/shared-memory dream');
  });
}

// ── PageUpdate ingestion ──

function handleContentBlock(payload) {
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
    // After any agent-emitted PageUpdate the row totals may have moved
    // (hippocampus writes + promotes + evicts). Re-fetch the counts so
    // the top_bar reflects post-action state. Best-effort; failures stay
    // silent.
    refreshTierCounts().catch(() => {});
    // A dream just reported — re-read history and re-append a fresh
    // calendar so the dreamed day(s) turn green immediately, without a
    // manual reload. (The report PageUpdate replaces `body` wholesale,
    // which would otherwise drop the calendar JS painted on open.)
    refreshCalendarAfterReport().catch(() => {});
  } catch (e) {
    console.warn('[memory] failed to parse PageUpdate args', e);
  }
}

// When the current body contains a dream-report, rebuild the calendar
// from the freshly-written .dream-history.jsonl and append it below the
// report (dropping any stale calendar first). No-op for non-dream
// PageUpdates, so ordinary chat answers don't grow a calendar.
async function refreshCalendarAfterReport() {
  const page = getCurrentPage();
  const body = Array.isArray(page.body) ? page.body : [];
  if (!body.some((w) => w && w.type === 'dream-report')) return;
  const history = await readJsonl(`${homeDir()}/.linggen/memory/.dream-history.jsonl`).catch(() => []);
  const calendar = buildDreamCalendar(history);
  if (!calendar) return;
  const rest = body.filter((w) => !(w && w.type === 'dream-calendar'));
  applyPageUpdate({ body: [...rest, calendar] });
  cacheCurrentPage();
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
