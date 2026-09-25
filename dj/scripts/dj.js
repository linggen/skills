// dj.js — the DJ page: boot, the chat, and the chrome around the two halves.
//
//   FIXED   — the library (lib-view.js): the page owns it, the agent never
//             touches it.
//   DYNAMIC — the set panel (set-panel.js): filled ONLY by the agent via
//             PageUpdate; "Get" queues songs on the Mac's download worker.
//
// Every library write is actions.mjs, the one writer; lyrics fill in behind
// (lyrics-backfill.js).

import '/shared/chat-bridge.js'; // sets window.LinggenUI
import { listSkillSessions } from '/shared/api.js';
import { runAction as action } from './bash.js';
import { loadConfig, loadLibrary } from './library.js';
import { backfillLyrics } from './lyrics-backfill.js';
import { phoneDevices } from './phone.js';
import { applyPageUpdate, onQueueDrained, restoreSet, watchQueue } from './set-panel.js';
import { drainMessage } from './drain.js';
import { refreshLibrary, renderLibrary, playlists, startKaraoke, libraryView, wireLibrary } from './lib-view.js';
import { state, setCollection, toast } from './state.js';
import { ensureThumbs } from './thumbs.js';
import { $, plural } from './ui.js';

const SKILL = 'dj';
const params = new URLSearchParams(location.search);
const MODEL_ID = params.get('model') || '';

// ── long-task strip ──────────────────────────────────────────────────────────
// A download run publishes progress on the retained `tasks` topic — the same
// numbers the phone's relay card shows. Paused while the page is hidden.
let taskStripSeen = null;
async function pollTaskStrip() {
  const el = $('task-strip');
  if (!el || document.hidden) return;
  try {
    const r = await fetch('/api/topic/latest?topic=tasks&op=dj');
    const p = r.ok ? (await r.json()).payload || {} : {};
    const fresh = p.at && Date.now() / 1000 - p.at < 600;
    if (!fresh || p.finished || !p.total) {
      if (fresh && p.finished && taskStripSeen === p.task_id) refreshLibrary();
      taskStripSeen = null;
      el.hidden = true;
      return;
    }
    taskStripSeen = p.task_id;
    el.textContent = `⇣ ${p.label || 'Downloads'} · ${p.done}/${p.total}${p.current ? ` · ${p.current}` : ''}`;
    el.hidden = false;
  } catch {
    el.hidden = true;
  }
}

// ── keeping library.json in step with the folder ────────────────────────────
// Adopt files that landed outside DJ's flow, retire rows whose file went, keep
// a renamed song's places. At boot (announced) and whenever the page is shown.

const drift = (r) => [
  r.adopted && `${plural(r.adopted, 'new song')} found`,
  r.renamed && `${plural(r.renamed, 'song')} renamed`,
  r.retired && `${r.retired} missing removed`,
].filter(Boolean);

let reindexing = false;
async function reindex(announce) {
  if (reindexing) return;
  reindexing = true;
  try {
    const r = await action('reconcile');
    if (r.adopted || r.retired || r.pruned || r.renamed) {
      await refreshLibrary();
      const bits = drift(r);
      if (announce && bits.length) toast(`Library: ${bits.join(', ')}.`);
    }
    backfillLyrics(renderLibrary);
  } catch { /* the next visibility pass retries */ } finally {
    reindexing = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) reindex(false);
});

// ── boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
  // The strip first: one cheap topic read, and a mid-download reload must
  // show the run at once.
  pollTaskStrip();
  setInterval(pollTaskStrip, 5000);
  [state.config, state.library, state.phone] = await Promise.all([loadConfig(), loadLibrary(), phoneDevices()]);
  await reindex(true);
  if (state.collection.kind === 'playlist' && !playlists().includes(state.collection.name)) {
    setCollection({ kind: 'all' });
  }
  renderLibrary();
  restoreSet();
  watchQueue();
  wireButtons();
  wireResizer();
  wireBuild();
  wireLibrary();
  await mountChat();
  ensureThumbs(state.library.tracks).then((asked) => asked && renderLibrary()).catch(() => {});
})();

// ── chrome ───────────────────────────────────────────────────────────────────
function wireButtons() {
  // Inside the unified launcher, settings live in the launcher's shared
  // settings — hide DJ's own gear so there aren't two.
  if (params.get('in_launcher') === '1') {
    const sb = $('settings-btn');
    if (sb) sb.style.display = 'none';
  } else {
    $('settings-btn').onclick = openSettings;
  }
  $('party-btn').onclick = () => startKaraoke(null, libraryView());
}

// ── build bar: describe a vibe → Build ───────────────────────────────────────
const BUILD_EXAMPLE = 'Make a list of 90s English songs';
const LUCKY_PROMPT =
  'Surprise me — build a set from what you know about me: my taste, where I’m ' +
  'from, the eras and artists I’ve loved. Check your memory first and make it ' +
  'personal, not a generic chart. If you truly know nothing about me yet, pick ' +
  'a great crowd-pleasing set and say it’s a starting point.';
const TRENDING_PROMPT =
  'Build a set from what’s popular and trending in music right now. Search the ' +
  'web for current charts and buzzy releases, then give me a fresh set of real, ' +
  'recent tracks — note anything brand-new.';

let chat = null;

function sendToAgent(text) {
  if (!chat) { toast('Connecting to DJ…'); return; }
  chat.send(text);
}

function wireBuild() {
  const input = $('build-input');
  const build = () => {
    sendToAgent(input.value.trim() || BUILD_EXAMPLE);
    input.value = '';
    input.blur();
  };
  $('build-btn').onclick = build;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); build(); }
  });
  document.querySelectorAll('#build-chips .chip').forEach((c) => {
    c.onclick = () => { input.value = c.textContent; build(); };
  });
  $('lucky-btn').onclick = () => sendToAgent(LUCKY_PROMPT);
  $('trending-btn').onclick = () => sendToAgent(TRENDING_PROMPT);
}

// Drag the divider to resize the chat; width persists; double-click resets.
function wireResizer() {
  const layout = document.querySelector('.layout');
  const rz = $('pane-resizer');
  if (!layout || !rz) return;
  const clampW = (w) => Math.min(Math.max(w, 300), Math.round(window.innerWidth * 0.6));
  const applyW = (w) => { layout.style.gridTemplateColumns = `1fr 6px ${w}px`; };
  const saveW = (w) => { try { localStorage.setItem('dj:chat-width', String(Math.round(w))); } catch { /* ignore */ } };
  let w = 480;
  try { w = clampW(+localStorage.getItem('dj:chat-width') || 480); } catch { /* ignore */ }
  applyW(w);
  rz.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    rz.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = (ev) => { w = clampW(window.innerWidth - ev.clientX - 3); applyW(w); };
    const up = () => {
      document.body.classList.remove('resizing');
      rz.removeEventListener('pointermove', move);
      rz.removeEventListener('pointerup', up);
      saveW(w);
    };
    rz.addEventListener('pointermove', move);
    rz.addEventListener('pointerup', up);
  });
  rz.addEventListener('dblclick', () => { w = 480; applyW(w); saveW(w); });
}

function openSettings() {
  let ov = document.querySelector('.app-mode-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'app-mode-overlay';
    ov.innerHTML = `
      <div class="app-mode-overlay-bar">
        <span class="app-mode-overlay-title">Settings</span>
        <button class="app-mode-overlay-close" aria-label="Close">×</button>
      </div>
      <iframe class="app-mode-overlay-frame" title="Settings"></iframe>`;
    ov.querySelector('.app-mode-overlay-close').onclick = async () => {
      ov.classList.remove('visible');
      state.config = await loadConfig();
    };
    document.body.appendChild(ov);
  }
  ov.querySelector('.app-mode-overlay-frame').src = 'settings.html';
  ov.classList.add('visible');
}

// ── chat (agent) ─────────────────────────────────────────────────────────────
async function recentSessionId() {
  try {
    const sessions = await listSkillSessions(SKILL);
    if (!sessions.length) return null;
    sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const ageHours = (Date.now() / 1000 - (sessions[0].created_at || 0)) / 3600;
    return ageHours < 24 ? sessions[0].id : null;
  } catch { return null; }
}

const GREETING_TRIGGER =
  'The user just opened the DJ app (this message is hidden from them). Greet them now, following the "0. Greeting" section of your instructions.';

// The agent tools that write the library (the same actions.mjs this page
// calls, or a download that registers through it). One refresh per burst.
const AGENT_WRITERS = new Set([
  'CreatePlaylist', 'RenamePlaylist', 'DeletePlaylist', 'AddToPlaylist',
  'RemoveFromPlaylist', 'ReorderPlaylist', 'DeleteTracks',
  'AddToPhone', 'RemoveFromPhone', 'GetKaraoke',
]);
let agentRefreshTimer = null;
function scheduleAgentRefresh() {
  clearTimeout(agentRefreshTimer);
  agentRefreshTimer = setTimeout(() => { refreshLibrary().catch(() => {}); }, 1200);
}

function onContentBlock(payload) {
  if (payload?.tool === 'PageUpdate' && payload?.args) {
    try {
      applyPageUpdate(typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args);
    } catch (e) { console.warn('[dj] PageUpdate parse', e); }
  }
  if (AGENT_WRITERS.has(payload?.tool)) scheduleAgentRefresh();
}

async function mountChat() {
  const resume = await recentSessionId();
  let activity = false;
  try {
    chat = await window.LinggenUI.mount($('chat-panel'), {
      skillName: SKILL,
      agentId: 'ling',
      modelId: MODEL_ID,
      title: 'DJ',
      sessionId: resume || undefined,
      onStreamToken: () => { activity = true; },
      onContentBlock: (payload) => { activity = true; onContentBlock(payload); },
    });
  } catch (e) {
    console.error('[dj] chat mount failed', e);
    return;
  }
  // A Get run that finished while this page watched: the facts go to the
  // agent, hidden, and the agent tells the user in its own words.
  onQueueDrained((facts) => { if (!facts.for_phone) chat?.sendHidden(drainMessage(facts)); });
  // Fresh session → one hidden greeting trigger; resumed sessions stay
  // silent. Retry once if the embed showed no life.
  if (!resume) {
    setTimeout(() => chat?.sendHidden(GREETING_TRIGGER), 700);
    setTimeout(() => { if (!activity) chat?.sendHidden(GREETING_TRIGGER); }, 4500);
  }
}
