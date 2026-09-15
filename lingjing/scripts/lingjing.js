// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only thing the page itself reports is a board the player won.

import './chat-bridge.js';
import { listSkillSessions, fetchCloud, syncCloud, signIn } from './api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { bout } from './duel.js';
import { WORDS, cardHtml, trayHtml, esc } from './cards.js';

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Look', 'Resolve', 'Practice', 'Branch', 'Lang', 'Summarize', 'Move', 'Trade', 'Make', 'Enter', 'Leave', 'Build', 'Travel', 'Art']);

let look = null; //       the rules' view of the game — the only source of numbers
let authored = null; //   the world's content files, for the world Look names
let focus = []; //        cards on the scene
let focusScene = null; // the scene the focus was last reset for
let cloud = null; //      the engine's view of the account: {signed_in, meter}; null = no cloud
const boards = new Map();
const duels = new Map(); // game id → {status, moves, picks, rounds, outcome, say}
let chat = null;

const lang = () => (look?.lang === 'en' ? 'en' : 'zh');
/// The page's own labels, with the stat names from the world's dictionary
/// on top — the harness names nothing.
const words = () => {
  const w = look?.words ?? {};
  return { ...WORDS[lang()], xw: w.progress ?? WORDS[lang()].xw, ls: w.wealth ?? WORDS[lang()].ls, qi: w.pool ?? WORDS[lang()].qi, yinyue: WORDS[lang()].yinyue };
};

function boardFor(taskId) {
  if (!boards.has(taskId)) {
    const herbs = authored.herbs.map((h) => ({ id: h.id, tile: h.tile, label: h.name[lang()] }));
    boards.set(taskId, newBoard(herbs, taskId));
  }
  return boards.get(taskId);
}

/// The page's side of a bout: idle until begun; open while roots are picked;
/// done once the rules have settled it. Reset when the day's bout in Look
/// says nothing is open.
function duelFor(id) {
  if (!duels.has(id)) duels.set(id, { status: 'idle', moves: [], picks: [], rounds: [], outcome: null, say: null });
  return duels.get(id);
}

const ctx = () => ({ look, lang: lang(), words: words(), content: authored, boardFor, duelFor });

/* ── Reading ── */

/// The content of the world the save plays, read once per world: a save
/// pulled from the cloud may stand in another world than the last one drawn.
/// A made world is its base's files with the player's laid over: its new
/// creatures and its words. Each creature remembers the folder its art is in.
async function loadContent(world) {
  if (authored?.world === world.id) return;
  const baseDir = world.made ? `worlds/${world.base}` : world.dir;
  const [creatures, herbs, hexagrams, roots, terms] = await Promise.all(
    ['creatures.json', 'herbs.json', 'hexagrams.json', 'traits.json', 'dictionary.json'].map((f) => content(baseDir, f)),
  );
  let all = creatures.creatures.map((c) => ({ ...c, dir: baseDir }));
  let dictionary = terms;
  if (world.made) {
    const [mine, words] = await Promise.all([content(world.dir, 'creatures.json'), content(world.dir, 'dictionary.json')]);
    all = [...all, ...mine.creatures.map((c) => ({ ...c, dir: world.dir }))];
    dictionary = { ...terms, words: { ...terms.words, ...(words.words ?? {}) }, provinces: { ...terms.provinces, ...(words.provinces ?? {}) } };
  }
  authored = { world: world.id, dir: baseDir, creatures: all, herbs: herbs.herbs, hexagrams: hexagrams.hexagrams, traits: roots, dictionary };
  boards.clear();
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
    await loadContent(look.world);
  } catch (e) {
    console.warn('[lingjing] look', e);
    if (!authored) $('focus').innerHTML = `<div class="loading">${WORDS.zh.offline} · ${WORDS.en.offline}</div>`;
    return;
  }
  // A scene's cards while one runs; a place's (its creature) when the
  // world is open and the player stands somewhere.
  const sceneId = look.scene?.id ?? (look.place ? `place:${look.place.id}` : null);
  if (sceneId !== focusScene) {
    focusScene = sceneId;
    focus = look.scene?.show ?? look.place?.show ?? [];
    duels.clear();
  }
  render();
}

/* ── Drawing ── */

/* ── 灵气: the 丹田 ring ── */

/// The 丹田 as a state, never a number: full, half, low, empty — from the
/// rules' Look, which settles the clock's refill on every read.
function qi() {
  const q = look?.stamina;
  if (!q || !q.max) return null;
  const p = Math.max(0, Math.min(100, Math.round((q.now / q.max) * 100)));
  const st = q.empty ? 'empty' : p < 25 ? 'low' : p < 60 ? 'half' : 'full';
  return { st, p, refillAt: q.returns_at ? Math.floor(new Date(q.returns_at).getTime() / 1000) : null };
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
  const pct = look.next ? Math.min(100, Math.round((look.progress / look.next) * 100)) : 0;
  const name = look.name ? `<span class="daohao">${esc(look.name)}</span>` : '';
  return `${name}<span class="realm">${esc(look.tier.name)}</span>
    <div class="xw"><span class="lbl">${w.xw}</span><div class="bar"><i style="width:${pct}%"></i></div>
      <span class="num">${look.progress}/${look.next}</span></div>
    ${qiHtml()}
    <span class="ls"><span class="lbl">${w.ls}</span> <b>${look.wealth}</b></span>`;
}

/// Ling's cards, else the day's omen — and an open board always beside them:
/// Ling tells the player the board is before them, so it must be.
function focusHtml() {
  const cards = focus.length ? [...focus] : [{ card: 'hexagram', id: look.omen?.id }];
  const open = (look.tasks ?? []).find((t) => t.kind === 'board' && t.status !== 'done' && !t.won);
  if (open && !cards.some((c) => c.card === 'board' && c.id === open.id)) cards.push({ card: 'board', id: open.id });
  // A fight the scene offers is always on the scene, like an open board.
  for (const e of look.scene?.exits ?? []) {
    if (e.game?.kind === 'duel' && !cards.some((c) => c.card === 'duel' && c.id === e.game.id)) cards.push({ card: 'duel', id: e.game.id });
  }
  return emptyCard() + cards.map((c) => cardHtml(c, ctx())).join('');
}

function render() {
  if (!look || !authored) return;
  const w = words();
  document.documentElement.lang = lang();
  document.title = `${w.title} · ${look.scene?.place ?? look.place?.name ?? ''}`;
  $('status').innerHTML = statusHtml();
  $('place').textContent = look.scene?.place ?? look.place?.name ?? look.chapter?.title ?? '';
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

/* ── 降妖: the page plays the bout, the rules decide it ── */

async function onDuelStart(id) {
  const d = duelFor(id);
  const r = await verb('duel', { id });
  if (!r.ok) {
    d.status = 'done'; d.outcome = 'lost'; d.say = r.say || r.refused;
    render();
    return;
  }
  Object.assign(d, { status: 'open', moves: r.moves, picks: [], rounds: [], outcome: null, say: null });
  render();
}

async function onDuelPick(id, root) {
  const d = duelFor(id);
  if (d.status !== 'open') return;
  d.picks.push(root);
  const played = bout(d.picks, d.moves);
  d.rounds = played.rounds;
  render();
  if (played.outcome === 'open') return;
  const r = await verb('duel', { id, picks: d.picks.join(',') });
  d.status = 'done';
  d.outcome = r.ok ? r.outcome : 'lost';
  d.say = r.say || null;
  render();
  await report(`[scene] ${d.outcome} ${id}`);
  if (cloud?.signed_in) syncCloud(SKILL).catch((e) => console.warn('[lingjing] sync', e));
  await refresh();
}

document.addEventListener('click', (e) => {
  const start = e.target.closest('[data-duel-start]');
  if (start) { onDuelStart(start.dataset.duelStart); return; }
  const pick = e.target.closest('[data-duel-pick]');
  if (pick) onDuelPick(pick.dataset.duel, pick.dataset.duelPick);
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
  if (payload?.tool === 'Art') authored = null; // a creature was just painted: read the cards again
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
  const fresh = look && !look.name && look.scene?.id === '00-river' && !look.story;
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
  await readCloud();
  // A cloud declared and no account behind it: the gate. No cloud at all
  // (an older engine) plays from the file here, as before.
  if (cloud && !cloud.signed_in) return gate();
  await enter();
}

window.addEventListener('focus', () => { if (look) refresh(); });
boot();
