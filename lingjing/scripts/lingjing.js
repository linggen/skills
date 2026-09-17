// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only things the page itself reports are a board or a bout the player
// played. Every other tap on the stage — Buy, a place, a practice card — is
// a word to Ling, sent as the player's own line; Ling and the rules do the rest.

import './chat-bridge.js';
import { listSkillSessions, fetchCloud, syncCloud, signIn } from './api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { bout } from './duel.js';
import { WORDS, cardHtml, trayHtml, esc, yinyueLine } from './cards.js';

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Look', 'Resolve', 'Practice', 'Branch', 'Lang', 'Summarize', 'Move', 'Trade', 'Tame', 'Inscribe', 'Make', 'Enter', 'Leave', 'Restart', 'Go', 'Undo', 'Load', 'Build', 'Travel', 'Amend', 'Art']);

let look = null; //       the rules' view of the game — the only source of numbers
let authored = null; //   the world's content files, for the world Look names
let focus = []; //        cards on the scene
let focusScene = null; // the scene the focus was last reset for
let cloud = null; //      the engine's view of the account: {signed_in, meter}; null = no cloud
let tapped = null; //     the stage's words waiting on Ling: that button stays pressed
let casting = false; //   起一卦 tapped: the coins are in the air until the cast lands
let mapView = 'province'; // the map card: 'province' (the player's, up close), 'world', or another province's id
let castSeen; //          the cast last drawn — a new one is drawn line by line, once
let castFresh = false;
let fateOpen = false, fateDraft = '', fateError = false; // the 命格 form: shown again, the date typed, a date refused
let atlasPlaces = null; // every province's places for the map, read by the atlas verb: {key, provinces}
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

const ctx = () => ({ look, lang: lang(), words: words(), content: authored, boardFor, duelFor, mapView, castFresh, casting, fateOpen, fateDraft, fateError, atlas: atlasPlaces?.provinces ?? null });

/// The other provinces' places, read once per world, language and realm —
/// only when the player looks past their own province.
async function loadAtlas() {
  const key = `${look?.world?.id}:${lang()}:${look?.tier?.id}`;
  if (atlasPlaces?.key === key) return;
  try {
    const r = await verb('atlas');
    if (r.ok) atlasPlaces = { key, provinces: r.provinces };
  } catch (e) {
    console.warn('[lingjing] atlas', e);
  }
}

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

/// Ling has asked and stands waiting: the turn is not over for the chat
/// (no stream end comes until the answer), but for the player it is — the
/// stage's buttons unlock; a tap waits in the chat's queue behind the question.
function waitingOnPlayer() {
  saying = false;
  tapped = null;
  document.querySelectorAll('.busy').forEach((el) => el.classList.remove('busy'));
}

/// Re-read the game. Entering a new scene puts its own cards on the scene,
/// so a creature is pictured even if Ling forgets to Show it.
async function refresh() {
  try {
    [look] = await Promise.all([verb('look'), readCloud()]);
    if (look.divination) casting = false;
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
      <span class="num"><span data-count="progress">${look.progress}</span>/${look.next}</span>${omenChip('progress')}</div>
    ${qiHtml()}
    <span class="ls"><span class="lbl">${w.ls}</span> <b data-count="wealth">${look.wealth}</b>${omenChip('wealth')}</span>${omenChip('bout')}
    <span class="langsw" title="中文 / English">${['zh', 'en'].map((l) => `<button data-lang="${l}" class="${l === lang() ? 'on' : ''}">${l === 'zh' ? '中' : 'En'}</button>`).join('')}</span>`;
}

/// A gain on the strip is seen: the number counts up from where it stood
/// and the gain floats off it (his ask, 2026-09-17). Only a rise within the
/// same world and tier is counted — a breakthrough or a new world starts over.
let shown = null; // {world, tier, progress, wealth} as last drawn
function riseStats() {
  const now = { world: look.world?.id, tier: look.tier?.id, progress: look.progress, wealth: look.wealth };
  const before = shown;
  shown = now;
  if (!before || before.world !== now.world) return;
  for (const key of ['progress', 'wealth']) {
    const from = before[key], to = now[key];
    if (key === 'progress' && before.tier !== now.tier) continue;
    if (!(to > from)) continue;
    const el = document.querySelector(`[data-count="${key}"]`);
    if (!el) continue;
    const gain = document.createElement('span');
    gain.className = 'gain';
    gain.textContent = `+${to - from}`;
    el.after(gain);
    gain.addEventListener('animationend', () => gain.remove());
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) continue;
    el.classList.add('rising');
    const start = performance.now(), span = 900;
    const step = (t) => {
      const k = Math.min(1, (t - start) / span);
      if (!el.isConnected) return;
      el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
      else el.classList.remove('rising');
    };
    requestAnimationFrame(step);
  }
}

/// Today's cast beside the number it changes — 修为 ×1.2 by the 修为 bar,
/// 灵石 ×1.5 by the 灵石, a bout's lean on its own — so the day's omen is
/// read where it counts, not only on its card (his ask, 2026-09-17).
function omenChip(kind) {
  const d = look?.divination, e = d?.effect;
  if (!e) return '';
  const w = words();
  const label = kind === 'progress' ? (e.progress ? `×${e.progress}` : '')
    : kind === 'wealth' ? (e.wealth ? `×${e.wealth}` : '')
    : e.root && (e.draws_win || e.wins_draw) ? `${e.root.name}${e.draws_win ? '↑' : '↓'}` : '';
  if (!label) return '';
  const title = `${w.omen} · ${d.hexagram.name} · ${d.grade.name} · ${d.ask.name}`;
  return `<span class="omenchip ${esc(d.grade.id)}" title="${esc(title)}">${esc(d.hexagram.name)} ${esc(label)}</span>`;
}

/// The game's language, at a tap — the rules' Lang, the same word Ling
/// would use; the page redraws in it and Ling's next reply follows Look.
async function switchLang(to) {
  if (to === lang()) return;
  try {
    await verb('lang', { lang: to });
  } catch (e) {
    console.warn('[lingjing] lang', e);
  }
  await refresh();
}

/// Ling's cards, else the day's omen — and an open board always beside them:
/// Ling tells the player the board is before them, so it must be.
function focusHtml() {
  const cards = focus.length ? [...focus] : [{ card: 'hexagram' }];
  const open = (look.tasks ?? []).find((t) => t.kind === 'board' && t.status !== 'done' && !t.won);
  if (open && !cards.some((c) => c.card === 'board' && c.id === open.id)) cards.push({ card: 'board', id: open.id });
  // A fight the scene offers is always on the scene, like an open board.
  for (const e of look.scene?.exits ?? []) {
    if (e.game?.kind === 'duel' && !cards.some((c) => c.card === 'duel' && c.id === e.game.id)) cards.push({ card: 'duel', id: e.game.id });
  }
  // A creature at its haunt, no scene running: its bout is on the scene too.
  const haunt = look.place?.encounter;
  if (haunt && !haunt.tamed && !cards.some((c) => c.card === 'duel' && c.id === haunt.game.id)) cards.push({ card: 'duel', id: haunt.game.id });
  return buildingCard() + emptyCard() + cards.map((c) => cardHtml(c, ctx())).join('');
}

/// A made world still being painted: the story waits for the brush, so the
/// scene says how many pictures are left — from Look, never counted here.
function buildingCard() {
  const left = look.building?.paint?.length;
  if (!left) return '';
  const w = words();
  return `<div class="card building"><div class="cardtitle">${w.building}</div>
    <div>${esc(w.buildingLine.replace('{n}', left))}</div></div>`;
}

function render() {
  if (!look || !authored) return;
  const w = words();
  document.documentElement.lang = lang();
  document.title = `${w.title} · ${look.scene?.place ?? look.place?.name ?? ''}`;
  $('status').innerHTML = statusHtml();
  riseStats();
  $('place').textContent = look.scene?.place ?? look.place?.name ?? look.chapter?.title ?? '';
  // She is always at the player's side: on the stage whenever the game is
  // open, scene or road, not only where a scene casts her.
  $('stage').hidden = false;
  stageYinyue(true);
  $('stageName').textContent = w.yinyue;
  const cast = look.divination ? JSON.stringify(look.divination.throws) : null;
  castFresh = castSeen !== undefined && cast !== null && cast !== castSeen;
  castSeen = cast;
  $('focus').innerHTML = focusHtml();
  castFresh = false;
  $('trayTitle').textContent = w.tray;
  $('tray').innerHTML = trayHtml(ctx());
  // Redrawn while Ling takes up a tap, the button stays pressed — never
  // offered to be tapped again.
  if (tapped) document.querySelectorAll('[data-say]').forEach((el) => { if (el.dataset.say === tapped) el.classList.add('busy'); });
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

/// Tell Ling, unseen: a board or a bout the page played.
const report = (text) => deliver(text, true);

/// The player's word from the stage: shown in the chat as their own line.
/// A tap while Ling is still talking is not dropped — the engine queues it
/// behind the reply and takes it up next (his "no need to click twice",
/// 2026-09-16). Only the same words twice within a breath are one tap.
let saying = false;
let lastSaid = { text: '', at: 0 };
async function say(text) {
  if (text === lastSaid.text && Date.now() - lastSaid.at < 2500) return;
  lastSaid = { text, at: Date.now() };
  saying = true;
  setTimeout(() => { saying = false; }, 90000);
  await deliver(text, false);
}

/// A word from the stage is a message, never the answer to a question
/// waiting in the chat: the question belongs to the chat alone, and the word
/// waits its turn behind it (his "should it queue instead of hiding the ask
/// user widget", 2026-09-17 — the skill declares the queue).
function deliver(text, hidden) {
  if (hidden) chat?.sendHidden(text);
  else chat?.send(text);
}

async function setFate(kind) {
  const args = kind === 'birth' ? { birth: fateDraft } : { [kind]: 'true' };
  if (kind === 'birth' && !fateDraft) { fateError = true; render(); return; }
  const r = await verb('fate', args).catch((e) => ({ ok: false, error: String(e) }));
  if (!r.ok) { fateError = r.refused === 'birth-invalid'; render(); return; }
  fateOpen = false; fateDraft = ''; fateError = false;
  await refresh();
  await report(kind === 'decline' ? '[scene] fate declined' : '[scene] fate set');
}
document.addEventListener('input', (e) => { if (e.target.id === 'fate-birth') { fateDraft = e.target.value; fateError = false; } });

document.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-lang]');
  if (sw) { switchLang(sw.dataset.lang); return; }
  // 命格: the birthday is read here, by the rules on this machine — never
  // sent to the chat; Ling hears only that it was set.
  if (e.target.closest('[data-fate-open]')) { fateOpen = true; render(); return; }
  const fateBtn = e.target.closest('[data-fate]');
  if (fateBtn) { setFate(fateBtn.dataset.fate); return; }
  // Near or whole: only how the map is looked at, so the page answers it.
  const view = e.target.closest('[data-mapview]');
  if (view) {
    const to = view.dataset.mapview;
    (to === 'province' ? Promise.resolve() : loadAtlas()).then(() => { mapView = to; render(); });
    return;
  }
  const spoken = e.target.closest('[data-say]');
  if (spoken && !e.target.closest('[data-play],[data-tile],[data-duel-start],[data-duel-pick],[data-duel-stand]')) {
    if (spoken.matches(':disabled')) return;
    tapped = spoken.dataset.say;
    if (tapped === words().sayCast) casting = true;
    render();
    say(tapped);
    return;
  }
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

/// The bout's brief from Look: the scene's exit, or the haunt's encounter.
function duelBriefFor(id) {
  const exit = (look?.scene?.exits || []).find((x) => x.game?.id === id && x.game.kind === 'duel');
  if (exit) return exit.duel;
  const e = look?.place?.encounter;
  return e && e.game?.id === id ? e.duel : null;
}

/// A pick: a root, the sword's root, the 符 or an art — duel.js says what may
/// come, the rules settle it. A decided bout that an art could still turn
/// waits (`rescue`) for the player's word: the art, or "let it stand".
async function onDuelPick(id, token) {
  const d = duelFor(id);
  if (d.status !== 'open' && d.status !== 'rescue') return;
  const kit = duelBriefFor(id)?.kit ?? {};
  const played = bout([...d.picks, token], d.moves, kit);
  if (played.refused) return;
  d.picks.push(token);
  d.rounds = played.rounds;
  d.status = played.outcome === 'open' ? 'open' : played.rescue ? 'rescue' : d.status;
  render();
  if (played.outcome === 'open' || played.rescue) return;
  await settleDuel(id);
}

async function settleDuel(id) {
  const d = duelFor(id);
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
  if (pick) { onDuelPick(pick.dataset.duel, pick.dataset.duelPick); return; }
  const stand = e.target.closest('[data-duel-stand]');
  if (stand) settleDuel(stand.dataset.duelStand);
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

function askedQuestion(args) {
  try {
    const a = typeof args === 'string' ? JSON.parse(args) : args;
    return a?.questions?.[0]?.question ?? null;
  } catch {
    return null; // still streaming: the start of the call, before its args are whole
  }
}

function onContentBlock(payload) {
  if (payload?.tool === 'AskUser') {
    // The cast's own question (所问何事) keeps the coins in the air; any
    // other question means no cast is coming this turn.
    if (casting && askedQuestion(payload.args) !== words().castAsk) casting = false;
    waitingOnPlayer();
    render();
    return;
  }
  if (payload?.tool === 'Show' && payload.args) {
    try {
      const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
      const cards = (args.cards ?? []).filter((c) => c && c.card);
      if (cards.length) {
        focus = cards;
        // A map Ling shows opens on the player's province.
        if (cards.some((c) => c.card === 'map')) mapView = 'province';
        render();
      }
    } catch (e) {
      console.warn('[lingjing] Show parse', e);
    }
  }
  if (payload?.tool === 'Art') authored = null; // a creature was just painted: read the cards again
  if (WRITERS.has(payload?.tool)) setTimeout(refresh, 1500);
}

/// Ling speaks first. A fresh day's chat, and a new chat begun from the
/// panel's own button, open with `[scene] opened` — Ling greets and sets the
/// scene; a reopened day is picked up in silence. Once per session.
let openedFor = null;
function openWith(sid) {
  if (!sid || openedFor === sid) return;
  openedFor = sid;
  chat?.sendHidden('[scene] opened');
}

async function mountChat() {
  let alive = false;
  const resume = await recentSessionId();
  chat = await window.LinggenUI.mount($('chat-panel'), {
    skillName: SKILL,
    agentId: 'ling',
    title: 'Lingjing',
    sessionId: resume || undefined,
    onSessionCreated: (sid) => { if (sid !== resume) setTimeout(() => openWith(sid), 500); },
    onStreamToken: () => { alive = true; },
    onStreamEnd: (text) => {
      saying = false; tapped = null; casting = false;
      const before = look;
      refresh().then(() => cheer(before, text));
    },
    onContentBlock: (payload) => { alive = true; onContentBlock(payload); },
  });
  if (!resume) {
    setTimeout(() => openWith(chat?.getSessionId()), 700);
    // Posted before the embed listened? Say it again once it is surely up.
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
/// Something won just now — 修为 or a realm gained, or 灵石 not from a sale —
/// and Yinyue says her own line from Ling's reply aloud on the stage, glad.
/// The words are the reply's; with no line of hers she stays quiet (his
/// ask, 2026-09-17: "now yinyue is out of the game").
function cheer(before, text) {
  if (!before || !look || before.world?.id !== look.world?.id) return;
  const held = (l) => (l.bag ?? []).reduce((n, b) => n + (b.n ?? 0), 0);
  const rose = look.progress > before.progress
    || look.tier?.id !== before.tier?.id || (look.tier?.step ?? 0) > (before.tier?.step ?? 0)
    || (look.wealth > before.wealth && held(look) >= held(before));
  // A cast just made: she reads it aloud too, her face as the grade falls.
  const cast = !before.divination && look.divination;
  const line = rose || cast ? yinyueLine(text) : null;
  if (!line) return;
  const emotion = cast ? ({ great: 'happy', good: 'happy', even: 'relaxed', ill: 'sad', dire: 'sad' })[look.divination.grade.id] ?? 'neutral' : 'happy';
  fetch('/api/yinyue/say', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: line, emotion }),
  }).catch((e) => console.warn('[lingjing] yinyue say', e));
}

/* Yinyue on the stage: the engine's pet view, loaded as a stage so it
   outranks the desktop corner. Loaded while the game is open — the gate
   unloads it, which releases her, and she goes back to wherever she was.
   The moon stands in until the view has loaded. */
function stageYinyue(on) {
  const pet = $('pet');
  const moon = document.querySelector('.stage .moon');
  if (!on) { pet.hidden = true; moon.hidden = false; if (pet.dataset.on) { delete pet.dataset.on; pet.src = 'about:blank'; } return; }
  if (pet.dataset.on) return;
  pet.dataset.on = '1';
  pet.onload = () => { pet.hidden = false; moon.hidden = true; };
  pet.src = `${location.origin}/?pet=1&stage=1`;
}
function gate(note = '') {
  const w = WORDS[machineLang()];
  document.documentElement.lang = machineLang();
  document.title = w.title;
  $('status').innerHTML = '';
  $('place').textContent = '';
  $('stage').hidden = true;
  stageYinyue(false);
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
