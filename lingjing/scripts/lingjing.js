// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only thing the page itself reports is a board the player won.

import './chat-bridge.js';
import { listSkillSessions, fetchCloud, syncCloud, signIn } from './api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { WORDS, cardHtml, trayHtml, esc } from './cards.js';

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Look', 'Resolve', 'Practice', 'Branch', 'Lang', 'Summarize']);

let look = null; //       the rules' view of the game — the only source of numbers
let authored = null; //   the content files
let focus = []; //        cards on the scene
let focusScene = null; // the scene the focus was last reset for
let cloud = null; //      the engine's view of the account: {signed_in, meter}; null = no cloud
const boards = new Map();
let chat = null;

const lang = () => (look?.lang === 'en' ? 'en' : 'zh');
const words = () => WORDS[lang()];

function boardFor(taskId) {
  if (!boards.has(taskId)) {
    const herbs = authored.herbs.map((h) => ({ id: h.id, tile: h.tile, label: h.name[lang()] }));
    boards.set(taskId, newBoard(herbs, taskId));
  }
  return boards.get(taskId);
}

const ctx = () => ({ look, lang: lang(), words: words(), content: authored, boardFor });

/* ── Reading ── */

async function loadContent() {
  const [creatures, herbs, hexagrams, roots, terms] = await Promise.all(
    ['creatures.json', 'herbs.json', 'hexagrams.json', 'roots.json', 'terms.json'].map(content),
  );
  authored = { creatures: creatures.creatures, herbs: herbs.herbs, hexagrams: hexagrams.hexagrams, roots, terms };
}

/// The account as the engine sees it. The meter moves with every model call,
/// so it is read whenever the game is.
async function readCloud() {
  try {
    cloud = await fetchCloud(SKILL);
  } catch (e) {
    console.warn('[lingjing] cloud', e);
  }
}

/// Re-read the game. Entering a new scene puts its own cards on the scene,
/// so a creature is pictured even if Ling forgets to Show it.
async function refresh() {
  try {
    [look] = await Promise.all([verb('look'), readCloud()]);
  } catch (e) {
    console.warn('[lingjing] look', e);
    return;
  }
  const sceneId = look.scene?.id ?? null;
  if (sceneId !== focusScene) {
    focusScene = sceneId;
    focus = look.scene?.show ?? [];
  }
  render();
}

/* ── Drawing ── */

/* ── 灵气: the 丹田 ring ── */

/// The window as a state, never a number: full, half, low, empty — or
/// unknown while the engine holds no reading (signed in, the site out of
/// reach). No cloud at all draws no ring.
function qi() {
  if (!cloud) return null;
  const m = cloud.meter;
  if (!m || !m.size) return { st: 'unknown', p: 100, refillAt: null };
  const p = Math.max(0, Math.min(100, Math.round((m.left / m.size) * 100)));
  const st = m.left === 0 ? 'empty' : p < 25 ? 'low' : p < 60 ? 'half' : 'full';
  return { st, p, refillAt: m.refill_at || null };
}

const clock = (unixSecs) =>
  new Date(unixSecs * 1000).toLocaleTimeString(lang() === 'zh' ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' });

function qiHtml() {
  const q = qi();
  if (!q) return '';
  const w = words();
  const state = { full: w.qiFull, half: w.qiHalf, low: w.qiLow, empty: w.qiEmpty, unknown: '' }[q.st];
  return `<span class="qi" data-st="${q.st}" title="${w.qi}"><span class="lbl">${w.qi}</span>
    <i class="ring" style="--p:${q.p}"></i><span class="st">${esc(state)}</span></span>`;
}

/// One line in the world while the window is spent — and the boards stay:
/// they use no model.
function emptyCard() {
  const q = qi();
  if (q?.st !== 'empty') return '';
  const w = words();
  const line = q.refillAt ? w.emptyLine.replace('{t}', clock(q.refillAt)) : w.emptySoon;
  return `<div class="card empty"><div class="cardtitle">${w.qi} · ${w.qiEmpty}</div>
    <div>${esc(line)}</div><div class="small dim">${w.boardsStay}</div></div>`;
}

function statusHtml() {
  const w = words();
  const pct = look.next ? Math.min(100, Math.round((look.xw / look.next) * 100)) : 0;
  const name = look.daohao ? `<span class="daohao">${esc(look.daohao)}</span>` : '';
  return `${name}<span class="realm">${esc(look.realm.name)}</span>
    <div class="xw"><span class="lbl">${w.xw}</span><div class="bar"><i style="width:${pct}%"></i></div>
      <span class="num">${look.xw}/${look.next}</span></div>
    ${qiHtml()}
    <span class="ls"><span class="lbl">${w.ls}</span> <b>${look.ls}</b></span>`;
}

/// Ling's cards, else the day's omen — and an open board always beside them:
/// Ling tells the player the board is before them, so it must be.
function focusHtml() {
  const cards = focus.length ? [...focus] : [{ card: 'hexagram', id: look.omen?.id }];
  const open = (look.tasks ?? []).find((t) => t.kind === 'board' && t.status !== 'done' && !t.won);
  if (open && !cards.some((c) => c.card === 'board' && c.id === open.id)) cards.push({ card: 'board', id: open.id });
  return emptyCard() + cards.map((c) => cardHtml(c, ctx())).join('');
}

function render() {
  if (!look || !authored) return;
  const w = words();
  document.documentElement.lang = lang();
  document.title = `${w.title} · ${look.scene?.place ?? ''}`;
  $('status').innerHTML = statusHtml();
  $('place').textContent = look.scene?.place ?? look.chapter?.title ?? '';
  const withYinyue = (look.scene?.cast ?? []).some((c) => c.id === 'yinyue');
  $('stage').hidden = !withYinyue;
  $('stageName').textContent = w.yinyue;
  $('focus').innerHTML = focusHtml();
  $('trayTitle').textContent = w.tray;
  $('tray').innerHTML = trayHtml(ctx());
}

/* ── The board: the one thing the page reports ── */

async function onWin(taskId) {
  const r = await verb('win', { id: taskId });
  if (!r.ok) console.warn('[lingjing] win refused', r);
  await report(`[scene] won ${taskId}`);
  // A change the page made itself: keep the account's copy in step now,
  // rather than at the next turn's edge.
  if (cloud?.signed_in) syncCloud(SKILL).catch((e) => console.warn('[lingjing] sync', e));
  await refresh();
}

/// Tell Ling. When Ling is waiting on a question, the win is its answer —
/// a new message would queue behind that question; otherwise a hidden message.
async function report(text) {
  const sid = chat?.getSessionId();
  try {
    const pending = await (await fetch('/api/pending-ask-user')).json();
    const open = pending.find((p) => p.session_id === sid);
    if (open) {
      await fetch('/api/ask-user-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: open.question_id,
          answers: [{ question_index: 0, selected: [], custom_text: text }],
        }),
      });
      return;
    }
  } catch (e) {
    console.warn('[lingjing] pending ask', e);
  }
  chat?.sendHidden(text);
}

document.addEventListener('click', (e) => {
  const play = e.target.closest('[data-play]');
  if (play) {
    focus = [{ card: 'board', id: play.dataset.play }];
    render();
    return;
  }
  const tile = e.target.closest('[data-tile]');
  const host = tile?.closest('[data-board]');
  if (!tile || !host) return;
  const board = boardFor(host.dataset.board);
  const cleared = tap(board, Number(tile.dataset.tile));
  render();
  if (cleared) onWin(board.taskId);
});

/* ── The chat ── */

/// The newest session, if it is from today's stretch — the app session rule.
async function recentSessionId() {
  try {
    const sessions = await listSkillSessions(SKILL);
    if (!sessions.length) return null;
    sessions.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const ageHours = (Date.now() / 1000 - (sessions[0].created_at || 0)) / 3600;
    return ageHours < 24 ? sessions[0].id : null;
  } catch {
    return null;
  }
}

function onContentBlock(payload) {
  if (payload?.tool === 'Show' && payload.args) {
    try {
      const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
      const cards = (args.cards ?? []).filter((c) => c && c.card);
      if (cards.length) {
        focus = cards;
        render();
      }
    } catch (e) {
      console.warn('[lingjing] Show parse', e);
    }
  }
  if (WRITERS.has(payload?.tool)) setTimeout(refresh, 1500);
}

async function mountChat() {
  let alive = false;
  const resume = await recentSessionId();
  chat = await window.LinggenUI.mount($('chat-panel'), {
    skillName: SKILL,
    agentId: 'ling',
    title: 'Lingjing',
    sessionId: resume || undefined,
    onStreamToken: () => { alive = true; },
    onStreamEnd: () => refresh(),
    onContentBlock: (payload) => { alive = true; onContentBlock(payload); },
  });
  // A reopened day is picked up in silence; a fresh one begins with Ling.
  if (!resume) {
    setTimeout(() => chat?.sendHidden('[scene] opened'), 700);
    setTimeout(() => { if (!alive) chat?.sendHidden('[scene] opened'); }, 4500);
  }
}

/// A brand-new game starts in the language of the machine it is played on.
async function firstLanguage() {
  const fresh = look && !look.daohao && look.scene?.id === '00-river' && !look.story;
  if (!fresh) return;
  const want = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  if (want !== look.lang) {
    await verb('lang', { lang: want });
    await refresh();
  }
}

/* ── The gate: sign in to play ── */

/// The page's language before there is a game to take it from.
const machineLang = () => ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');

/// Signed out, nothing of the game is shown: the save lives with the
/// account, and a turn would be refused anyway. One button; the daemon
/// opens the browser, and the scene enters once the account reports in.
function gate(note = '') {
  const w = WORDS[machineLang()];
  document.documentElement.lang = machineLang();
  document.title = w.title;
  $('status').innerHTML = '';
  $('place').textContent = '';
  $('stage').hidden = true;
  $('tray').innerHTML = '';
  $('trayTitle').textContent = '';
  $('focus').innerHTML = `<div class="card gate-card"><div class="cardtitle">${w.signTitle}</div>
    <p>${w.signBody}</p><button class="act" id="signin">${w.signBtn}</button>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
  $('signin').onclick = async () => {
    const btn = $('signin');
    btn.disabled = true;
    btn.textContent = w.signWait;
    const ok = await signIn().catch(() => false);
    if (ok) return enter();
    gate(w.signFail);
  };
}

/// Into the world: the account's save first, so a new machine — or one
/// another device moved past — reads the game as it stands.
async function enter() {
  $('focus').innerHTML = `<div class="loading">${WORDS.zh.loading} · ${WORDS.en.loading}</div>`;
  try {
    await syncCloud(SKILL);
  } catch (e) {
    console.warn('[lingjing] sync on open', e);
  }
  await refresh();
  await firstLanguage();
  await mountChat();
}

async function boot() {
  $('focus').innerHTML = `<div class="loading">${WORDS.zh.loading} · ${WORDS.en.loading}</div>`;
  try {
    await Promise.all([loadContent(), readCloud()]);
  } catch (e) {
    console.error('[lingjing] boot', e);
    $('focus').innerHTML = `<div class="loading">${WORDS.zh.offline} · ${WORDS.en.offline}</div>`;
    return;
  }
  // A cloud declared and no account behind it: the gate. No cloud at all
  // (an older engine) plays from the file here, as before.
  if (cloud && !cloud.signed_in) return gate();
  await enter();
}

window.addEventListener('focus', () => { if (look) refresh(); });
boot();
