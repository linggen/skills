// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only things the page itself reports are a board or a bout the player
// played. Every other tap on the stage — Buy, a place, a practice card — is
// a word to Ling, sent as the player's own line; Ling and the rules do the rest.

import '/shared/chat-bridge.js';
import { listSkillSessions, pickResumable, fetchCloud, syncCloud, signIn } from '/shared/api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { REALMS, act, begin, foeStep, foeTurn, idle, missingCards, offers as boutOffers, tokenOf, view as boutView } from './battle.js';
import { boardDoneToday, stageCards, stageHolds } from './stage.mjs';
import { WORDS as BATTLE_WORDS, battleHtml, pickOf, spoilsHtml } from './battle-card.js';
import { banner, playLog, since } from './battle-anim.js';
import { travelHtml, wayOf, wayPoints } from './travel.js';
import { drainAt, drainOf, trialNudge } from './beats.js';
import { WORDS, say as fill, askBarHtml, bookChipHtml, gearChipHtml, cardHtml, emergedHtml, trayHtml, trialToldHtml, clockOf } from './cards.js';
import { esc } from './esc.js';
import { createVoice, nodeMoment } from './voice.js';
import { LU_WORDS, luChipHtml, luHtml, titleCardHtml } from './lu.js';

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Divine', 'Resolve', 'Practice', 'Tale', 'Lang', 'Summarize', 'Move', 'Trade', 'Tame', 'Make', 'Enter', 'Leave', 'Restart', 'Go', 'Undo', 'Load', 'Build', 'Travel', 'Amend', 'Art', 'Lundao', 'Meet', 'Quest', 'Refine', 'Ring']);

/* A 斗法 in play, held by the page: the setup the rules handed over at the
   door, the fight itself, and every action taken so far. When it ends the page
   sends the actions back and the RULES settle it — the page never decides a
   fight, it only plays one out (design.md § 斗法 v3). */
let bout = null;
let idleTimer = null;
let look = null; //       the rules' view of the game — the only source of numbers
let authored = null; //   the world's content files, for the world Look names
let cloud = null; //      the engine's view of the account: {signed_in, meter}; null = no cloud
let atlasPlaces = null; // every province's places for the map, read by the atlas verb: {key, provinces}
const boards = new Map();
let chat = null;

/* ── 银月's voice — every moment the page tells her goes through one budget
   (voice.js: who, how much it weighs, its cooldown). Facts only; she writes
   her words. Her line lands in this chat (`session`) once she walks with the
   player; a big moment lets Ling answer her once (`converse`). ── */
const IDLE_FACT = { zh: '玩家在这页上静了好一会儿，什么也没动。', en: 'The player has been quiet here a while, not touching anything.' };
const herHere = () => Boolean(look?.companion);
const voice = createVoice({
  post: (id, fact, flags, opts) => postMoment(fact, flags, opts),
  sees: () => ({ fighting: Boolean(bout), present: herHere() }),
});
/// Resolves true when she will hear it; false when nobody will (the pet off
/// answers 503 at once) — a page that waits on her must not wait then.
function postMoment(fact, flags, { mood = null } = {}) {
  const sid = look?.companion ? chat?.getSessionId?.() : null;
  const { converse, ...rest } = flags ?? {};
  // In the game the player has a 道号, and she calls them by it (his screen,
  // 2026-09-24: 「今天也辛苦了，Hanli」 inside 灵境). First, so no cap cuts it.
  const name = look?.name, called = !name ? '' : lang() === 'en' ? `(In the game the player is ${name}.) ` : `（灵境里玩家叫${name}。）`;
  const body = { app: SKILL, text: called + (lang() === 'en' ? fact.en : fact.zh), ...rest, ...(mood ? { mood } : {}), ...(sid ? { session: sid, ...(converse ? { converse } : {}) } : {}) };
  return fetch('/api/yinyue/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((res) => res.ok).catch((e) => { console.warn('[lingjing] yinyue', e); return false; });
}

const lang = () => (look?.lang === 'en' ? 'en' : 'zh');
/// The page's own labels, with the stat names from the world's dictionary
/// on top — the harness names nothing.
const words = () => {
  const w = look?.words ?? {};
  return { ...WORDS[lang()], xw: w.progress ?? WORDS[lang()].xw, ls: w.wealth ?? WORDS[lang()].ls, qi: w.pool ?? WORDS[lang()].qi, yinyue: WORDS[lang()].yinyue };
};

/* The mini-games, one module each (scripts/games/<id>.js — meta, newGame,
   html, act), loaded the first time a place shows one. */
const GAMES = {};
function gameMod(id) {
  if (GAMES[id] !== undefined) return GAMES[id];
  GAMES[id] = null;
  import(`./games/${id}.js`).then((m) => { GAMES[id] = m; render(); })
    .catch((e) => { console.warn('[lingjing] game', id, e); });
  return null;
}
/* 传闻's step board: its own instance, dealt from the step's id and the level
   the rules set — never the day's practice board, never re-dealt by the day. */
function taleBoard(taskId) {
  const b = look?.tale?.step?.board;
  if (!b || b.id !== taskId) return boards.get(taskId) ?? null;
  if (boards.has(taskId)) return boards.get(taskId);
  if (b.page === 'lianliankan') {
    boards.set(taskId, newBoard(authored.herbs.map((h) => ({ id: h.id, tile: h.tile, label: h.name[lang()] })), taskId));
    return boards.get(taskId);
  }
  const mod = gameMod(b.page);
  if (!mod) return null;
  boards.set(taskId, { taskId, mod, day: taskId, state: mod.newGame(`${taskId}|${look.name ?? ''}`, b.level ?? 1) });
  return boards.get(taskId);
}
const isTale = (id) => String(id ?? '').startsWith('tale:');

function boardFor(taskId) {
  if (isTale(taskId)) return taleBoard(taskId);
  const task = look?.tasks?.find((t) => t.id === taskId);
  if (task?.game && task.game !== 'lianliankan') {
    const mod = gameMod(task.game);
    if (!mod) return null;
    const day = new Date().toDateString(), old = boards.get(taskId);
    // A board won and counted, asked for again by another errand the same
    // day, is a new game — not the old one standing there 「你胜了」, never
    // sent again (his 五子 at 桑间, 2026-09-24, after 漳南's was paid).
    const spent = old?.day === day && old.state?.won && old.sent && task.status === 'offered' && !task.won;
    if (!old || old.day !== day || spent) {
      const round = spent ? (old.round ?? 0) + 1 : 0;
      boards.set(taskId, { taskId, mod, day, round, state: mod.newGame(`${day}|${look.name ?? ''}|${taskId}${round ? `|${round}` : ''}`, task.level ?? 1) });
    }
    return boards.get(taskId);
  }
  if (!boards.has(taskId)) {
    const herbs = authored.herbs.map((h) => ({ id: h.id, tile: h.tile, label: h.name[lang()] }));
    boards.set(taskId, newBoard(herbs, taskId));
  }
  return boards.get(taskId);
}

/* A board solved but not yet counted — the rules refused it where it was
   solved (not here, not open) — is sent again once it can count: after the
   draw, never from inside it, and once per place, so a refusal is said and
   not tried again on every frame. */
function sendHeldWins() {
  for (const g of boards.values()) {
    const won = g.state ? g.state.won : g.won;
    if (!won || g.sent) continue;
    const task = look?.tasks?.find((t) => t.id === g.taskId);
    const tale = isTale(g.taskId) && look?.tale?.step?.board?.id === g.taskId && !look.tale.step.won;
    if (!tale && (!task || task.status !== 'offered' || task.won)) continue;
    if (g.refusedAt && g.refusedAt === (look?.place?.id ?? null)) continue;
    // Only a board on the stage now: it counts where it is open.
    const id = CSS.escape(g.taskId);
    if (!document.querySelector(`[data-game="${id}"],[data-board="${id}"]`)) continue;
    g.sent = true;
    run(`win:${g.taskId}`, () => onWin(g.taskId));
  }
}

/* What the page itself holds: everything the player did HERE that the save
   does not know — and nothing the save does. Until 2026-09-21 these were
   eleven loose `let`s, each written from wherever and each write followed (or
   not) by a hand-placed `render()`; a handler that forgot one left the screen
   behind the state. One object now, and one writer: `show(patch)` changes it
   and repaints. `keep(patch)` is the same without the repaint, for the two
   places where a repaint is wrong — a keystroke in a field the repaint would
   replace, and the draw itself. */
const view = {
  /// What Ling just showed, drawn before the rules have written it down — the
  /// save is the truth (`look.stage`), this is only the half-second before the
  /// next Look catches up.
  focus: [],
  tapped: null, //       the stage's words waiting on Ling: that button stays pressed
  /// The labels the chat's open question offers; the stage hides its own copies
  /// of them while it stands (his, 2026-09-18: 只显示一个).
  asked: null,
  casting: false, //     起一卦 tapped: the coins are in the air until the cast lands
  castSeen: undefined, // the cast last drawn — a new one is drawn line by line, once
  castFresh: false,
  mapView: 'province', // the map card: 'province' (the player's, up close), 'world', or another province's id
  fateOpen: false, fateDraft: '', fateError: false, // the 命格 form: shown again, the date typed, a date refused
  refineMat: null, refineName: '', refineNote: null, // 炼化本命 on the card: the material picked, the name typed, a refusal
  /// Why the last 出手 did not open, for the card that offered it — the rules'
  /// own words (no 体力, the beast already spent, the page's cards out of date).
  /// Everything else about a fight is in the save.
  duelSay: { id: null, text: null },
  bookOpen: false, //    the 事 chip's popover
  gearOpen: false, //    the 装备 chip's popover: what he wears and his bag, together
  gear: null, //         the rules' `gear` read behind it, fetched when it opens
  spoils: null, //       what a won fight left: { place, cards, items }, until put away or walked on
  bookSeen: null, //     how many lines the book held when last drawn: one more and the chip says so
  bookFresh: false,
  bookRow: null, //      the line of the book that is open
  offerRow: null, //     the errand on the stage's offer card that is open
  tookOffer: null, //    an errand just taken: its row is stamped 已接下, then goes
  qSkip: [], //          queue keys he put off here with 下一件 ›, oldest first
  doNote: null, //       a page tap the rules refused, in their words, until the next tap
  bookInfo: null, //     what the rules say of it (`Quest info`), read on the tap
  kaifu: null, //        开府 in full (`Quest kaifu`), read when the 事 chip opens
  ask: null, //          the 问询 waiting in the ask bar: its line (「说说夫诸」)
  askHer: false, //      the ask bar speaks to 银月 (`@银月 …`), not to Ling
  choosing: false, //    a 抉择 tapped: its roll is in flight
  trialTold: null, //    the way taken at a 抉择, on the stage until he walks on: { place, success, line, cost }
  gearNote: null, //     a 装备 tap the rules refused, in their words, inside the popover
  opened: null, //       a board he opened from the tray: { id, place } — it stays until he walks on
  walkedOut: null, //    a fight he left that the rules would not settle: it waits on its card, not pulled back in
  luOpen: false, //      the 录 chip's book (九鼎录), over the stage
  lu: null, //           the rules' `story` read behind it, fetched when it opens
  // 闭关 (rules/seclusion.mjs): the chooser open, what it may choose (`seclude
  // info`), the pick and pill, a refusal; `emerged` — 出关's result, counted up
  // on its card until put away; `afterEmerge` — the opening (her greeting,
  // Ling's recap) held until 出关 is tapped (his, 2026-09-24: 出关 first).
  secludeOpen: false, seclude: null, secludeFocus: null, secludePill: null, secludeNote: null,
  emerged: null, afterEmerge: null,
};
const keep = (patch) => Object.assign(view, patch);
function show(patch) { keep(patch); render(); }
const duelFor = (id) => (view.duelSay.id === id ? view.duelSay : { text: null });

/* When each 所得 first stood on the stage — its animation's clock. */
const handedAt = new Map();
function handedAge(id) {
  if (!handedAt.has(id)) handedAt.set(id, performance.now());
  return performance.now() - handedAt.get(id);
}
/* This world's cards, named in the language in play — built once per world
   and language, not on every draw. */
let catalogMemo = { key: null, cards: {} };
function cardCatalog() {
  const key = `${authored?.world}|${authored?.loadedAt}|${lang()}`;
  if (catalogMemo.key !== key) {
    catalogMemo = { key, cards: Object.fromEntries((authored?.cards?.cards ?? []).map((x) => [x.id, { ...x, name: x.name?.[lang()] ?? x.name?.zh ?? x.id }])) };
  }
  return catalogMemo.cards;
}
const artBase = () => `../worlds/${look?.world?.id ?? 'jiuding'}/`;
/// One clock for the page: 14:05, in the game's language.
const clock = (iso) => (iso ? clockOf(new Date(iso), lang()) : '');

const ctx = () => ({ look, handedAge, kaifu: view.kaifu, bookRow: view.bookRow, offerRow: view.offerRow, tookOffer: view.tookOffer, bookInfo: view.bookInfo, qi: qi(), lang: lang(), words: words(), content: authored, boardFor, duelFor, artBase: artBase(), mapView: view.mapView, castFresh: view.castFresh, casting: view.casting, fateOpen: view.fateOpen, fateDraft: view.fateDraft, fateError: view.fateError, refineMat: view.refineMat, refineName: view.refineName, refineNote: view.refineNote, seclude: view.seclude, secludeFocus: view.secludeFocus, secludePill: view.secludePill, secludeNote: view.secludeNote, atlas: atlasPlaces?.provinces ?? null });

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
/// `force` reads a world already loaded again (a creature just painted, a fight
/// dealt cards the page cannot name): the old content stays drawn until the new
/// has arrived, and a board in play is never dealt again for it.
async function loadContent(world, force = false) {
  if (!force && authored?.world === world.id) return;
  const baseDir = world.made ? `worlds/${world.base}` : world.dir;
  const [creatures, herbs, hexagrams, roots, terms, cards] = await Promise.all(
    ['creatures.json', 'herbs.json', 'hexagrams.json', 'traits.json', 'dictionary.json', 'cards.json'].map((f) => content(baseDir, f)),
  );
  let all = creatures.creatures.map((c) => ({ ...c, dir: baseDir }));
  let dictionary = terms;
  if (world.made) {
    const [mine, words] = await Promise.all([content(world.dir, 'creatures.json'), content(world.dir, 'dictionary.json')]);
    all = [...all, ...mine.creatures.map((c) => ({ ...c, dir: world.dir }))];
    dictionary = { ...terms, words: { ...terms.words, ...(words.words ?? {}) }, provinces: { ...terms.provinces, ...(words.provinces ?? {}) } };
  }
  const sameWorld = authored?.world === world.id;
  authored = { world: world.id, dir: baseDir, creatures: all, herbs: herbs.herbs, hexagrams: hexagrams.hexagrams, traits: roots, dictionary, cards, loadedAt: Date.now() };
  if (!sameWorld) boards.clear();
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
  keep({ tapped: null });
  document.querySelectorAll('.busy').forEach((el) => el.classList.remove('busy'));
}

/* One re-read at a time, and one more after it if something asked while it was
   in flight. A turn can run four writers in a row; that used to be four
   overlapping Looks racing to set `look`, each 1.5s after its tool began —
   a guess at when the rules had finished writing. A verb costs about 45ms, so
   there is nothing to save by waiting; what matters is not to stampede. */
let reading = null;
let readNext = null;
function refreshSoon(ms = 400) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, ms);
}
let refreshTimer = null;

/* 遇 in the mist (Hanli, 2026-09-24; was his 2026-09-22 veil card): an
   arrival with something veiled on the road plays a short ink mist over the
   stage, then the page reveals it itself — Meet `reveal`, a fact of the
   rules, not a turn — and the road card comes up. Ling never builds toward
   it: whoever walked, she is told once, after the reveal (`[scene] arrived`),
   and tells what was revealed. A 抉择 is hers to write: the mist plays, and
   her Meet `offer` reveals it; still unwritten after the mist and a turn of
   hers, the page nudges her ONCE (`[scene] trial waiting`), then lets it be. */
let streaming = false;
const MIST_MS = 2600;
let veiling = null; // the place whose mist has played
let veil = null; //    {place, key, misted, turns}: this mist, for the one nudge
const nudgedTrials = new Set();
const stillMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function inkMist() {
  const view = document.getElementById('view');
  if (!view || stillMotion()) return;
  const el = document.createElement('div');
  el.className = 'inkmist';
  el.setAttribute('aria-hidden', 'true');
  view.appendChild(el);
  setTimeout(() => el.remove(), MIST_MS + 200);
}
async function liftVeil() {
  const r = await write('meet', { action: 'reveal' }).catch(failed);
  await refresh();
  if (r?.ok) await report(`[scene] arrived ${look?.place?.id ?? ''}`);
}
function watchVeil() {
  const m = look?.place?.meet, here = look?.place?.id ?? null;
  if (!m?.veiled || veiling === here) return;
  veiling = here;
  inkMist();
  const wait = stillMotion() ? 300 : MIST_MS;
  if (m.kind !== 'trial') { setTimeout(liftVeil, wait); return; }
  const mine = { place: here, key: `${new Date().toDateString()}|${here}`, misted: false, turns: 0 };
  veil = mine;
  setTimeout(() => { mine.misted = true; nudgeTrial(); }, wait);
}
/// A 抉择 Ling has not written yet: one hidden nudge per meet, never a loop.
function nudgeTrial() {
  const key = trialNudge({ meet: look?.place?.meet, place: look?.place?.id ?? null, veil, nudged: nudgedTrials, busy: streaming || saying || Boolean(bout) });
  if (!key) return;
  nudgedTrials.add(key);
  report('[scene] trial waiting');
}

/// Re-read the game. What it answers was read after the call: a read already
/// in flight began before whatever write asked for this one, so a second read
/// is chained behind it and that is the one returned. Never rejects.
function refresh() {
  if (readNext) return readNext;
  if (reading) {
    readNext = reading.then(() => { readNext = null; return refresh(); });
    return readNext;
  }
  reading = readOnce().catch((e) => console.warn('[lingjing] read', e)).finally(() => { reading = null; });
  return reading;
}

async function readOnce() {
  try {
    const [seen, ,] = await Promise.all([verb('look'), readCloud()]);
    look = seen;
    if (look.divination) keep({ casting: false });
    await loadContent(look.world, contentStale);
    contentStale = false;
  } catch (e) {
    console.warn('[lingjing] look', e);
    if (!authored) $('focus').innerHTML = `<div class="loading">${esc(WORDS.zh.offline)} · ${esc(WORDS.en.offline)}</div>`;
    return;
  }
  // The stage came back with Look — what Ling showed, what the scene was
  // authored with, what the place holds. The optimistic copy has served its
  // purpose; a board he opened himself stays until he walks on.
  const here = look.place?.id ?? null;
  if (view.opened && view.opened.place !== here) keep({ opened: null });
  queueMicrotask(payKeptWins);
  if (view.qPlace !== here) keep({ qSkip: [], qPlace: here });
  keep({ focus: [] });
  // A fight the save still holds open comes back: without this the page shows
  // the world while Ling waits for a fight nobody can see, and she holds still
  // for ever. The rules do not charge the day's 灵气 twice for it. One the
  // player just walked out of, and the rules would not settle, waits on its
  // card for his tap instead of pulling him back in.
  if (look.fight?.open && !bout && look.fight.game !== view.walkedOut) {
    try { await onDuelStart(look.fight.game); } catch (e) { console.warn('[lingjing] fight resume', e); }
  }
  watchVeil();
  watchNode();
  render();
}

/// A creature just painted, or a fight dealt cards the page cannot name: the
/// next read takes the world's content again (and draws the old until then).
let contentStale = false;

/* ── Drawing ── */

/* ── 灵气: the 丹田 ring ── */

/// The 丹田: how much is left, as a state AND as the count. It is the one
/// throttle in the game (design.md § 体力) — a countdown would push, points do
/// not (his, 2026-09-18: 倒计时会带来心里压力), and a number you can see is how
/// a player decides whether there is another fight in the day.
function qi() {
  const q = look?.stamina;
  if (!q || !q.max) return null;
  const { p, st } = qiState(q.now, q.max, Boolean(q.empty));
  // When he can go on again — back to the rest mark (20), not to full. The
  // rules' `rest_at` when they give it, else `returns_at`, which is the same.
  const back = q.rest_at ?? q.returns_at;
  return { st, p, now: q.now, max: q.max, refillAt: back ? Math.floor(new Date(back).getTime() / 1000) : null };
}

function qiState(now, max, empty = now <= 0) {
  const p = Math.max(0, Math.min(100, Math.round((now / max) * 100)));
  return { p, st: empty ? 'empty' : p < 25 ? 'low' : p < 60 ? 'half' : 'full' };
}
const qiWord = (st, w = words()) => ({ full: w.qiFull, half: w.qiHalf, low: w.qiLow, empty: w.qiEmpty, unknown: '' }[st]);

/// The strip's ring. While 体力 drains it is drawn at the count the drain
/// started from; paintRise moves it down frame by frame (the cards read qi()).
function qiHtml() {
  const q = qi();
  if (!q) return '';
  const w = words();
  const d = draining && !draining.landed ? { now: draining.from, ...qiState(draining.from, q.max) } : q;
  // A tap on the pool opens 闭关 (his, 2026-09-24: any time the player chooses).
  const open = look.seclusion ? '' : ` data-seclude-open role="button" tabindex="0"`;
  return `<span class="qi" data-st="${esc(d.st)}" title="${esc(w.qi)} · ${esc(w.secludeOpen)}"${open}><span class="lbl">${esc(w.qi)}</span>
    <i class="ring" style="--p:${Number(d.p) || 0}"></i><span class="st">${esc(qiWord(d.st, w))}</span><span class="cnt"><span data-qi>${esc(d.now)}</span>/${esc(q.max)}</span></span>`;
}

/// One line in the world while the window is spent — and the boards stay:
/// they use no model.
function statusHtml() {
  const w = words();
  const pct = look.next ? Math.min(100, Math.round((look.progress / look.next) * 100)) : 0;
  const name = look.name ? `<span class="daohao">${esc(look.name)}</span>` : '';
  return `${name}<span class="realm">${esc(look.tier.name)}</span>
    <div class="xw"><span class="lbl">${esc(w.xw)}</span><div class="bar"><i style="width:${pct || 0}%"></i></div>
      <span class="num"><span data-count="progress">${esc(look.progress)}</span>/${esc(look.next)}</span></div>
    ${qiHtml()}
    <span class="ls"><span class="lbl">${esc(w.ls)}</span> <b data-count="wealth">${esc(look.wealth)}</b></span>${omenChip()}
    ${bout ? '' : luChipHtml(lang(), view.luOpen)}
    ${bookChipHtml(ctx(), view.bookOpen, view.bookFresh)}
    ${gearChipHtml({ ...ctx(), gear: view.gear, gearNote: view.gearOpen ? view.gearNote : null }, view.gearOpen)}
    <span class="langsw" title="中文 / English">${['zh', 'en'].map((l) => `<button data-lang="${l}" class="${l === lang() ? 'on' : ''}">${l === 'zh' ? '中' : 'En'}</button>`).join('')}</span>`;
}

/// A gain on the strip is seen: the number counts up from where it stood
/// and the gain floats off it (his ask, 2026-09-17). Only a rise within the
/// same world and tier is counted — a breakthrough or a new world starts over.
let drawnStrip = '';
let freshUntil = 0;
let shown = null; // {world, tier, progress, wealth} as last drawn
/* The numbers rising right now: {key: {from, to, start}}. They live out here,
   not on the element — the strip is redrawn whenever anything on it changes,
   and until 2026-09-21 every redraw (a stream token is one) replaced the very
   element the count was running on, so the rise died in its first frame and
   he never saw one (「show animation, when number change on topbar」). Each
   frame finds the element that is there NOW. */
const rising = new Map();
// Slow enough to be seen: at 1.1 s / 2.4 s it ran while the fight room closed and he missed it (2026-09-23).
const RISE_MS = 1600, GAIN_MS = 3600;
let riseAfter = 0; // a rise waits for this moment (the fight room closing)
let travelEnd = 0; // a drain waits for the walk on the map to end
let draining = null; // 体力 counting down: {from, to, spent, start} (beats.js)
let lastQi = null; //   {world, now}: the 体力 the last draw saw
/// 体力 spent counts down once the eye is back on the strip — run before the
/// strip is drawn, so it is drawn at the old count, never the new one first.
function watchDrain() {
  const now = { world: look.world?.id, now: look.stamina?.now };
  const before = lastQi;
  lastQi = now;
  if (!before || before.world !== now.world || !Number.isFinite(now.now) || now.now === before.now) return;
  const t = performance.now();
  draining = drainOf({ from: before.now, to: now.now, shown: draining ? drainAt(draining, t).value : before.now, at: t, holds: [riseAfter, travelEnd], still: stillMotion() });
  if (draining) { console.info('[lingjing] drain', draining.spent); if (!riseFrame) riseFrame = requestAnimationFrame(paintRise); }
}
function riseStats() {
  const now = { world: look.world?.id, tier: look.tier?.id, progress: look.progress, wealth: look.wealth, next: look.next, cast: (look.cast ?? []).map((b) => b.id),
    rank: look.tier?.name, step: look.tier?.step, chapter: look.chapter?.id, stamina: look.stamina?.now, resting: Boolean(look.stamina?.resting) };
  const before = shown;
  shown = now;
  // 大成就: a realm risen, a chapter opened — the stage marks it and 银月 speaks
  // at once (his, 2026-09-23: 境界突破等大成就达成时, 显示一个动画, 并让银月说点什么).
  if (before && before.world === now.world) {
    // The last point spent: 银月 sends him back to the real world to rest —
    // real life is hers, not Ling's (his rule, 2026-09-23).
    if (before.stamina > 0 && now.stamina === 0 && !before.resting) {
      const at = clock(look.stamina?.rest_at ?? look.stamina?.returns_at);
      askHer('spent', `玩家的体力刚刚耗尽了（${at} 可以再出发）。游戏先放一放：请玩家回到现实里歇一歇，起身走走、喝口水。说一两句。`, `The player's stamina just ran out (ready to go again at ${at}). The game waits: send them back to the real world to rest — stand up, walk, drink some water. A line or two.`, 'relaxed');
    }
    if (now.rank && before.rank && now.rank !== before.rank) feat('rise', now.rank, before.rank, false, riseGains(before, now));
    // A cauldron found tells her on its own (the story node, with its facts); the seal still shows.
    else if (now.chapter && before.chapter && now.chapter !== before.chapter) feat('chapter', look.chapter.title, '', nodeFresh(['cauldron', 'chapter']));
  }
  // A beast won over — fed or fought — is a moment of its own: a 收服 seal on
  // the stage and +1 off the 装备 chip, where its card now lives (his ask,
  // 2026-09-23: 收服后应该有个动画, top bar 上显示个 +1).
  if (before && before.world === now.world) {
    const joined = (look.cast ?? []).filter((b) => !before.cast.includes(b.id));
    if (joined.length) wonOver(joined);
  }
  if (before && before.world === now.world) {
    const gained = {};
    for (const key of ['progress', 'wealth']) {
      if (key === 'progress' && before.tier !== now.tier) continue;
      if (now[key] > before[key]) {
        rising.set(key, { from: before[key], to: now[key], start: Math.max(performance.now(), riseAfter), next: now.next });
        gained[key] = now[key] - before[key];
      }
    }
    if (gained.progress || gained.wealth) {
      console.info('[lingjing] gain', gained);
      gainBurst(gained);
    }
  }
  if (rising.size) paintRise();
}
/* 行路: the place changed between two Looks — show the way walked on the map,
   a dot going road by road, then give the stage back (his ask, 2026-09-23). */
let lastPlace = null;
function watchTravel() {
  const p = look?.place;
  if (!p?.id || !look.world?.atlas) return;
  const points = new Map((p.places ?? []).filter((x) => x.map).map((x) => [x.id, x]));
  const prev = lastPlace;
  lastPlace = { id: p.id, points };
  if (!prev || prev.id === p.id || bout) return;
  const all = new Map([...prev.points, ...points]);
  const way = wayOf(all, prev.id, p.id) ?? [prev.id, p.id].filter((id) => all.has(id));
  if (way.length < 2) return;
  playTravel(way.map((id) => all.get(id)));
}
function playTravel(stops) {
  document.querySelector('.travel')?.remove();
  const holder = document.createElement('div');
  holder.innerHTML = travelHtml(stops, look.world);
  const box = holder.firstElementChild;
  $('view')?.appendChild(box);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const legs = stops.length - 1, walk = still ? 0 : Math.min(3200, 900 + legs * 550);
  // 体力 spent on the way counts down once the walk is done (watchDrain).
  travelEnd = performance.now() + walk + 300;
  const pts = wayPoints(stops, look.world);
  const walker = box.querySelector('.walker');
  if (walker && !still) {
    walker.animate(pts.map((q) => ({ left: `${q.left}%`, top: `${q.top}%` })), { duration: walk, easing: 'ease-in-out', fill: 'forwards' });
  } else if (walker) { const q = pts.at(-1); walker.style.left = `${q.left}%`; walker.style.top = `${q.top}%`; }
  box.querySelector('polyline')?.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: walk, easing: 'ease-in-out', fill: 'forwards' });
  setTimeout(() => box.classList.add('gone'), walk + 900);
  setTimeout(() => box.remove(), walk + 1500);
}

/* A gain, where the eye is: 修为 +30 · 灵石 +10 rises in the middle of the
   stage — the strip's count-up alone ran while he read the chat and he never
   saw one (2026-09-23: 还是没看到动画). */
function gainBurst(g) {
  const w = words(), bits = [];
  if (g.progress) bits.push(`<span>${esc(w.xw)} <b>+${g.progress}</b></span>`);
  if (g.wealth) bits.push(`<span>${esc(w.ls)} <b>+${g.wealth}</b></span>`);
  const el = document.createElement('div');
  el.className = 'gainburst';
  el.innerHTML = bits.join('');
  el.style.animationDelay = `${Math.max(0, riseAfter - performance.now())}ms`;
  $('view')?.appendChild(el);
  setTimeout(() => el.remove(), 3400 + Math.max(0, riseAfter - performance.now()));
}

/* What a breakthrough grew in a fight, from the fight's own realm table
   (battle.js REALMS: 气血 by realm + half a point a step, 灵力上限, 一击) —
   only what changed (his, 2026-09-24: 境界提升时, 属性增加吗? → show it on the seal). */
function riseGains(before, now) {
  const stats = (t, step) => { const r = REALMS[t]; return r && { hp: Math.round(r.hp + ((step ?? 1) - 1) * 0.5), mana: r.mana, power: r.power }; };
  const a = stats(before.tier, before.step), b = stats(now.tier, now.step), w = words();
  if (!a || !b) return '';
  return [
    b.hp !== a.hp ? fill(w.featHp, { a: a.hp, b: b.hp }) : '',
    b.mana !== a.mana ? fill(w.featMana, { a: a.mana, b: b.mana }) : '',
    b.power !== a.power ? fill(w.featPower, { n: b.power - a.power }) : '',
  ].filter(Boolean).join(' · ');
}

/// A great moment on the stage: a gold seal, light behind it, held long
/// enough to read — then 银月 speaks, asked, at once.
function feat(kind, name, from = '', quiet = false, gains = '') {
  const w = words();
  const el = document.createElement('div');
  el.className = 'feat';
  el.innerHTML = `<i class="rays"></i><div class="featbox"><b>${esc(kind === 'rise' ? w.featRise : w.featChapter)}</b><span>${esc(name)}</span>${gains ? `<small class="featgain">${esc(gains)}</small>` : ''}</div>`;
  el.style.animationDelay = `${Math.max(0, riseAfter - performance.now())}ms`;
  $('view')?.appendChild(el);
  setTimeout(() => el.remove(), 4200 + Math.max(0, riseAfter - performance.now()));
  if (quiet) return;
  // Warm, not polite: a thing they lived through together, and what lies
  // ahead — and the name the game knows them by.
  const who = look?.name ?? '';
  if (kind === 'rise') askHer('rise',
    `玩家刚刚突破：${from} → ${name}，舞台上金光正亮。这是你们一路一起熬出来的，你是真心为这一刻动容。说两三句带情绪的话：点一件对话里你们刚一起经历过的具体的事，再说说往后的路（或是鼎，或是你自己的心事）。别说「恭喜」「替你高兴」这类客套话。${who ? `在灵境里称呼玩家「${who}」。` : ''}`,
    `The player has just broken through: ${from} → ${name}; the gold is on the stage right now. You two earned this together and it moves you. Say two or three lines with real feeling: one concrete thing you just went through together (it is in the chat), then the road ahead — the cauldrons, or something of your own. No stock "congratulations".${who ? ` In the game, call the player ${who}.` : ''}`, 'happy');
  else askHer('chapter', `新的一章开了：${name}。你陪玩家一路走到这里，说几句。`, `A new chapter opens: ${name}. You have walked with the player to here; say a few words.`, 'happy');
}

function wonOver(beasts) {
  const w = words(), view$ = $('view');
  for (const [i, b] of beasts.entries()) {
    const seal = document.createElement('div');
    seal.className = 'wonseal';
    seal.innerHTML = `<b>${esc(w.wonOver)}</b><span>${esc(b.name)}</span>`;
    seal.style.animationDelay = `${i * 600}ms`;
    view$?.appendChild(seal);
    setTimeout(() => seal.remove(), 2600 + i * 600);
  }
  tellYinyue('tamed', `收服了${beasts.map((b) => b.name).join('、')}，它从此随行`, `Won over ${beasts.map((b) => b.name).join(', ')} — it walks with us now`, { mood: 'happy' });
  const chip = document.querySelector('.gearchip');
  if (!chip) return;
  const gain = document.createElement('span');
  gain.className = 'gain cardgain';
  gain.textContent = `+${beasts.length}`;
  chip.parentElement.appendChild(gain);
  setTimeout(() => gain.remove(), 2400);
}
let riseFrame = null;
function paintRise() {
  if (riseFrame) cancelAnimationFrame(riseFrame);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = performance.now();
  for (const [key, r] of rising) {
    const el = document.querySelector(`[data-count="${key}"]`), age = t - r.start;
    if (age > GAIN_MS) { rising.delete(key); el?.classList.remove('rising'); continue; }
    if (!el) continue;
    const k = still ? 1 : Math.min(1, age / RISE_MS), eased = 1 - (1 - k) ** 3;
    const value = Math.round(r.from + (r.to - r.from) * eased);
    el.textContent = String(value);
    el.classList.toggle('rising', k < 1);
    // The bar fills with the number, not ahead of it.
    const bar = key === 'progress' && r.next ? document.querySelector('.status .xw .bar i') : null;
    if (bar) bar.style.width = `${Math.min(100, (value / r.next) * 100)}%`;
    // The gain floats off the number; redrawn, it picks up where it was.
    if (!el.parentElement.querySelector(`.gain[data-for="${key}"]`)) {
      const gain = document.createElement('span');
      gain.className = 'gain';
      gain.dataset.for = key;
      gain.textContent = `+${r.to - r.from}`;
      gain.style.animationDelay = `-${Math.round(age)}ms`;
      el.after(gain);
    }
  }
  paintDrain(t);
  riseFrame = rising.size || draining ? requestAnimationFrame(paintRise) : null;
  if (!rising.size) document.querySelectorAll('.gain:not(.drain)').forEach((g) => g.remove());
}

/// 体力 down: the count and the ring tick down, −N floats off in the ring's
/// colour. Held at the old count until its moment (the walk, the fight room).
function paintDrain(t) {
  if (!draining) return;
  const d = draining, at = drainAt(d, t), max = look?.stamina?.max;
  const box = document.querySelector('.status .qi'), num = box?.querySelector('[data-qi]');
  if (box && num && max) {
    const { p, st } = qiState(at.value, max, at.done ? Boolean(look.stamina.empty) : at.value <= 0);
    num.textContent = String(at.value);
    num.classList.toggle('draining', !at.held && !at.done);
    box.dataset.st = st;
    box.querySelector('.ring')?.style.setProperty('--p', p);
    const word = box.querySelector('.st');
    if (word) word.textContent = qiWord(st);
    if (!at.held && t - d.start < FLOAT_MS && !box.querySelector('.gain.drain')) {
      const gain = document.createElement('span');
      gain.className = 'gain drain';
      gain.textContent = `−${d.spent}`;
      gain.style.animationDelay = `-${Math.round(t - d.start)}ms`;
      num.parentElement.appendChild(gain);
      setTimeout(() => gain.remove(), FLOAT_MS - (t - d.start));
    }
  }
  // Down: the strip is drawn at the new count (the −N, redrawn, picks up
  // where it was); the drain is let go once the −N has floated off.
  if (at.done && !d.landed) { d.landed = true; render(); }
  if (t - d.start >= FLOAT_MS) draining = null;
}
const FLOAT_MS = 2200;

/// Today's reading on the strip — its element's lean in a fight — so the
/// day's omen is read where it counts, not only on its card (his ask,
/// 2026-09-17). 问卦 is the day's fight luck alone: nothing by 修为 or 灵石.
function omenChip() {
  const d = look?.divination, e = d?.effect;
  if (!e?.root || !e.card) return '';
  const w = words();
  const title = `${w.omen} · ${d.hexagram.name} · ${d.grade.name}`;
  return `<span class="omenchip ${esc(d.grade.id)}" title="${esc(title)}">${esc(d.hexagram.name)} ${esc(`${e.root.name}${e.card > 0 ? '↑' : '↓'}`)}</span>`;
}

/// The game's language, at a tap — the rules' Lang, the same word Ling
/// would use; the page redraws in it and Ling's next reply follows Look.
async function switchLang(to) {
  // The lit one tapped still counts: it pins the game to it (lang_set).
  if (to === lang() && look?.lang_set) return;
  try {
    await write('lang', { lang: to });
  } catch (e) {
    console.warn('[lingjing] lang', e);
  }
  await refresh();
}

/// Ling's cards, else the day's omen — and an open board always beside them:
/// Ling tells the player the board is before them, so it must be.
function focusHtml() {
  // A fight takes the stage: while one is open, nothing else is on it, and the
  // chat beside it keeps talking (design.md § 斗法在主界面里).
  if (bout) return battleHtml(boutView(bout.st), boutOffers(bout.st), boutCtx(), bout.picked, bout.openLog, bout.note, bout.help);
  // Walked on, the spoils are put away by themselves.
  if (view.spoils && view.spoils.place !== (look?.place?.id ?? null)) keep({ spoils: null });
  if (view.trialTold && view.trialTold.place !== (look?.place?.id ?? null)) keep({ trialTold: null });
  if (view.emerged && view.emerged.place !== (look?.place?.id ?? null)) keep({ emerged: null });
  const spoils = titleCard() + (view.doNote ? `<div class="donote">${esc(view.doNote)}</div>` : '') + (view.emerged ? emergedHtml({ ...view.emerged, age: performance.now() - view.emerged.at }, ctx()) : '') + (view.trialTold ? trialToldHtml(view.trialTold, ctx()) : '') + (view.spoils ? spoilsHtml(view.spoils, spoilsCtx()) : '');
  // A line running under his feet takes the stage (his law, 2026-09-18:
  // 「最好左面 webview 显示一个 card，或者在一个故事线或任务中走，显示相关内容」).
  // Standing at the water with the bell in hand, the stage said 摇一摇铃 — and
  // beside it offered him the day's coins, which belong to no part of this.
  // So while the step is his to take HERE, the page adds nothing of its own:
  // Ling's cards are hers to choose, and the quest's card is the line.
  // ONE list, and the rules made it (stage.mjs) — the same one they measured
  // the chat's question against, so nothing stands in both places. Only while
  // Ling's Show is still in flight does the page work it out for itself.
  let cards = view.focus.length ? stageCards(look, { focus: view.focus }) : (look.stage ?? []);
  // A board he opened from the tray stays before him through the next Look
  // and whatever Ling shows, until he walks on.
  if (view.opened && !cards.some((c) => c.card === 'board' && c.id === view.opened.id)) cards = [...cards, { card: 'board', id: view.opened.id }];
  // The errand just taken keeps its card a moment, sealed 已接下.
  if (view.tookOffer && !cards.some((c) => c.card === 'offer')) cards = [...cards, { card: 'offer' }];
  // 闭关's chooser, opened from the pool or the empty card, stands first.
  if (view.secludeOpen && view.seclude && !look.seclusion) cards = [{ card: 'seclude' }, ...cards];
  const { head, queue, tail } = splitStage(cards);
  // In 闭关 the world holds still: no roads under its card.
  const roads = stageHolds(look, cards) && !look.seclusion ? roadsHtml() : '';
  return spoils + head.map(drawCard).join('') + queueHtml(queue) + tail.map(drawCard).join('') + roads;
}

/* 眼前 — one thing to do at a time (his, 2026-09-24: 「用一个队列，一个完成，
   再从队列取出下一个显示，不要都堆放在UI上」). The things that ask a tap wait
   in this order; the first stands on the stage, 下一件 › puts it off to the end
   of the line, and walking on starts the line again. The goal line, an empty
   pool and what Ling showed of the place stay where they are. */
const QUEUE = ['handed', 'quest', 'tale', 'road', 'offer', 'duel', 'lundao', 'board'];
const HEAD = new Set(['seclude', 'building', 'empty', 'goal']);
const qKey = (c) => `${c.card}:${c.id ?? ''}`;

function splitStage(cards) {
  const head = cards.filter((c) => HEAD.has(c.card));
  const queued = cards.filter((c) => QUEUE.includes(c.card) && inQueue(c));
  const tail = cards.filter((c) => !HEAD.has(c.card) && !QUEUE.includes(c.card));
  const rank = (c) => {
    const put = view.qSkip.indexOf(qKey(c));
    return put < 0 ? QUEUE.indexOf(c.card) : QUEUE.length + put;
  };
  return { head, queue: [...queued].sort((a, b) => rank(a) - rank(b)), tail };
}

/* The day's practice waits in the tray: a board comes into the line when he
   opens it there, when Ling shows it, or when this place hosts it or an errand
   asks for it here. */
function inQueue(c) {
  if (c.card !== 'board') return true;
  // Done for the day (the tray's 已完成), it never queues — opened, shown or hosted (stage.mjs).
  if (boardDoneToday(look, c.id)) return false;
  if (view.opened?.id === c.id || view.focus.some((f) => f.card === 'board' && f.id === c.id)) return true;
  const task = look?.tasks?.find((t) => t.id === c.id);
  return !task || Boolean(task.hosted || task.for_errand);
}

function queueHtml(queue) {
  if (!queue.length) return '';
  const [now, next] = queue;
  const w = words();
  const bar = next ? `<div class="queuebar"><span class="dim">${esc(w.queueCount.replace('{n}', queue.length))}</span>
    <button class="act" data-qnext="${esc(qKey(now))}">${esc(w.queueNext.replace('{what}', queueLabel(next)))} ›</button></div>` : '';
  return `<div class="queueslot">${bar}${drawCard(now)}</div>`;
}

function queueLabel(c) {
  const w = words();
  if (c.card === 'board') return look?.tasks?.find((t) => t.id === c.id)?.title ?? w.queueKinds.board;
  if (c.card === 'tale') return look?.tale?.label ?? w.queueKinds.tale;
  return w.queueKinds[c.card] ?? c.card;
}

function putOff(key) {
  show({ qSkip: [...view.qSkip.filter((k) => k !== key), key] });
}

function spoilsCtx() {
  return {
    catalog: cardCatalog(), artBase: artBase(), lang: lang(), words: BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh,
  };
}

const drawCard = (c) => cardHtml(c, ctx());

/// While a card holds the stage the chat keeps its question, so the roads stand
/// here instead — quiet must never be stuck (2026-09-18: 「起卦完成, 任务卡住了」;
/// a market had no way out but the map). A tap is the same one Move the chat's
/// option would have been. Drawn ONLY while something holds: the moment nothing
/// does, the question is the chat's and this row is gone — never both.
function roadsHtml() {
  const near = look?.director?.near ?? [];
  if (!near.length) return '';
  const w = words();
  const chips = near.map((p) => `<button class="act go" data-go="${esc(p.id)}">${esc(p.name)}</button>`).join('');
  return `<div class="roadsrow"><span class="lbl">${esc(w.roads)}</span>${chips}</div>`;
}

/* Every writer calls `render()`; the drawing happens once, on the next frame.
   Twenty-six call sites used to mean twenty-six repaints, and a handler that
   forgot one left the screen behind the state. Now a burst — a tap, a Look, a
   Show, a stream token — costs one draw. */
let frame = null;
function render() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; draw(); });
}

/* Drawn this instant. The fight hands the freshly drawn room to the animator
   (`playLog` reaches into `.battle` right after), so there the next frame is
   already too late — it would animate the node that is about to be replaced. */
function drawNow() {
  if (frame) { cancelAnimationFrame(frame); frame = null; }
  draw();
}

/* What had the keyboard's focus is found again after a repaint by what it IS
   — its data attributes — never by where it stood: a redraw replaces every
   node, and a player tabbing through the stage lost his place on each token. */
function focusKey(el) {
  if (!el || el === document.body || !el.attributes) return null;
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'id');
  if (!attrs.length) return null;
  return el.tagName.toLowerCase() + attrs.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
}
function restoreFocus(key) {
  if (!key || document.activeElement && document.activeElement !== document.body) return;
  const el = document.querySelector(key);
  if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
}

function draw() {
  if (!look || !authored) return;
  const had = focusKey(document.activeElement);
  const w = words();
  document.documentElement.lang = lang();
  document.title = `${w.title} · ${look.scene?.place ?? look.place?.name ?? ''}`;
  // An errand just taken went somewhere: the chip shows where, once.
  const lines = look.book?.length ?? 0;
  // The pulse lasts as long as its animation — a flag dropped on the very next
  // draw redrew the strip and cut the pulse off in its first frame.
  if (view.bookSeen !== null && lines > view.bookSeen) { freshUntil = performance.now() + 1300; setTimeout(render, 1350); }
  keep({ bookFresh: performance.now() < freshUntil, bookSeen: lines });
  // Redrawn only when something on it changed: a strip rebuilt on every
  // stream token restarts every animation on it.
  // The walk first: a drain on this same Look waits for it to end.
  watchTravel();
  watchDrain();
  const strip = statusHtml();
  if (strip !== drawnStrip) { $('status').innerHTML = strip; drawnStrip = strip; }
  riseStats();
  // A fight takes the whole column: the backdrop, the tray and Yinyue's own
  // body give way, because she is IN the fight as a card and the cards need
  // the room (his, 2026-09-18). It all comes back when the fight ends.
  document.body.classList.toggle('fighting', Boolean(bout));
  $('place').textContent = look.scene?.place ?? look.place?.name ?? look.chapter?.title ?? '';
  // She is always at the player's side: on the stage whenever the game is
  // open, scene or road, not only where a scene casts her.
  $('stage').hidden = false;
  // She stands there only once she has been found (his rule, 2026-09-17).
  const her = Boolean(look.companion) && !bout;
  stageYinyue(her, Boolean(bout) && Boolean(look.companion));
  $('stageName').textContent = her ? look.companion.name : '';
  $('askHerBtn').hidden = !her;
  if (her) $('askHerBtn').textContent = words().askHer.replace('{name}', look.companion.name);
  const cast = look.divination ? JSON.stringify(look.divination.throws) : null;
  keep({ castFresh: view.castSeen !== undefined && cast !== null && cast !== view.castSeen, castSeen: cast });
  if (view.castFresh) readingByHer(look.divination);
  $('focus').innerHTML = focusHtml();
  keep({ castFresh: false });
  drawLu();
  // The tray holds the world's boards; with none today it is not there at all
  // — 「今日无事」 under a book with things in it was a contradiction.
  $('trayTitle').textContent = w.tray;
  $('tray').innerHTML = trayHtml(ctx());
  $('tray').parentElement.hidden = !$('tray').innerHTML;
  // A turn with nothing left in it ends itself after a beat long enough to
  // read the board — pressing the button is always faster (his, 2026-09-18).
  // Never while a move is being played out: the timer and a tap would both
  // end the turn.
  clearTimeout(idleTimer);
  if (bout && !bout.busy && bout.st.whose === 'you' && bout.st.outcome === 'open' && idle(bout.st) && !bout.picked && !bout.help) {
    const b = bout;
    idleTimer = setTimeout(() => { if (bout === b && !b.busy) endBoutTurn(); }, 1400);
  }
  // Redrawn while Ling takes up a tap, the button stays pressed — never
  // offered to be tapped again.
  if (view.tapped) document.querySelectorAll('[data-say]').forEach((el) => { if (el.dataset.say === view.tapped) el.classList.add('busy'); });
  // One clickable place for one thing: while the chat holds the question, the
  // stage puts away every button that repeats one of its answers.
  if (view.asked?.size) {
    document.querySelectorAll('[data-say],[data-go]').forEach((el) => {
      const label = (el.dataset.say ?? '').trim();
      if (view.asked.has(label) || view.asked.has(el.textContent.trim())) el.classList.add('answered-in-chat');
    });
  }
  restoreFocus(had);
  // Held wins go after the draw, never from inside it.
  sendHeldWins();
}

/* What the fight's card draws itself from: this world's cards, this world's
   pictures, and the words of the language in play. */
function boutCtx() {
  const c = bout.brief.creature;
  return {
    catalog: cardCatalog(), artBase: artBase(),
    lang: lang(), words: BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh,
    board: bout.st.mode.board,
    title: words().subdue ?? '降妖',
    foeName: c.name, foeArt: c.art ? `${artBase()}${c.art}` : null,
    youName: look.name ?? '',
  };
}

/* ── The page's own verbs ──
   A tap that writes goes through ONE queue: one verb in flight at a time, in
   the order tapped, and the same button twice while its first is in flight is
   one tap. Two taps racing each other's Look used to draw whichever answered
   last. Every write that lands keeps the account's copy in step, a beat later. */
let verbChain = Promise.resolve();
const inFlight = new Set();
function run(key, fn) {
  if (inFlight.has(key)) return Promise.resolve();
  inFlight.add(key);
  const done = verbChain.then(fn).catch((e) => {
    console.warn('[lingjing]', key, e);
    keep({ doNote: words().notDone });
    return refresh();
  }).finally(() => inFlight.delete(key));
  verbChain = done.catch(() => {});
  return done;
}

let syncTimer = null;
function syncSoon() {
  if (!cloud?.signed_in) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; syncCloud(SKILL).catch((e) => console.warn('[lingjing] sync', e)); }, 2000);
}

/// A verb that changes the save: the rules' answer, and the cloud told once it lands.
async function write(name, args = {}) {
  const r = await verb(name, args);
  if (r?.ok) syncSoon();
  return r;
}
const failed = (e) => ({ ok: false, error: String(e) });
/// A refusal in the rules' own words, else the page's one line for it.
const refusal = (r) => r?.say || words().refused?.[r?.refused] || words().notDone;

/* ── The board: the one thing the page reports ── */

async function onWin(taskId) {
  if (isTale(taskId)) return taleWon(taskId);
  const r = await write('win', { id: taskId }).catch(failed);
  // Refused (not here, not open), the win is kept on the board and sent again
  // when it can count — never told to Ling as a win he cannot pay (2026-09-23:
  // 洛书 solved at 邺城 showed solved at 碣石 and was never paid). Said once;
  // tried again only from another place.
  if (!r.ok) {
    console.warn('[lingjing] win refused', r);
    const g = boards.get(taskId);
    if (g) { g.sent = false; g.refusedAt = look?.place?.id ?? null; }
    keep({ doNote: refusal(r) });
    await refresh();
    return false;
  }
  // A day's practice is the page's to pay, at once — the strip counts up as
  // the board closes (his, 2026-09-24: 「页面自己结算」; waiting on Ling's turn
  // held the pay back). Only a board the story's scene holds goes to Ling,
  // whose Resolve moves the story on.
  if (isTask(taskId)) await payWin(taskId);
  else await report(`[scene] won ${taskId}`);
  await refresh();
  return true;
}

const isTask = (id) => Boolean(look?.tasks?.some((t) => t.id === id));

/* 传闻: a step's board won, its riddle answered, a kept win counted — the
   rules pay it and open the next step at once, page-side; the story beat is
   Ling's, one hidden line: `[scene] tale step` (the next step opened) or
   `[scene] tale end`. A win kept on an empty pool tells her nothing yet. */
async function taleDone(r) {
  keep({ doNote: r.ok ? null : refusal(r) });
  await refresh();
  if (r.ok && !r.kept && r.ended) taleEnded(r.handed?.[0]?.title);
  if (r.ok && !r.kept && (r.ended || r.step)) await report(`[scene] tale ${r.ended ? 'end' : 'step'}`);
  return r.ok;
}
async function taleWon(id) {
  const r = await write('tale', { action: 'win', board: id }).catch(failed);
  if (!r.ok) { const g = boards.get(id); if (g) { g.sent = false; g.refusedAt = look?.place?.id ?? null; } }
  return taleDone(r);
}
const taleAnswer = async (answer) => taleDone(await write('tale', { action: 'answer', answer }).catch(failed));

/// Practice `done`, from the page. An empty pool keeps the win: it is paid
/// once 体力 is back (payKeptWins, on the next Look that has it).
async function payWin(id) {
  const r = await write('task', { action: 'done', id }).catch(failed);
  if (!r.ok && r.refused !== 'no-stamina') console.warn('[lingjing] practice done refused', r);
  keep({ doNote: r.ok ? null : refusal(r) });
  return r;
}

/// A board won while 体力 was empty, paid now it is back — the same day,
/// as the rules keep it. Once per Look, one at a time.
let payingKept = false;
async function payKeptWins() {
  if (payingKept || !look || look.stamina?.empty || look.fight) return;
  const kept = (look.tasks ?? []).filter((t) => t.won && t.status !== 'done');
  const tale = Boolean(look.tale?.step?.won);
  if (!kept.length && !tale) return;
  payingKept = true;
  try {
    for (const t of kept) await payWin(t.id);
    if (tale) await taleDone(await write('tale', { action: 'turn' }).catch(failed));
  } finally {
    payingKept = false;
  }
  await refresh();
}

/// Tell Ling, unseen: a board or a bout the page played.
const report = (text) => deliver(text, true);

/// The player's word from the stage: shown in the chat as their own line.
/// A tap while Ling is still talking is not dropped — the engine queues it
/// behind the reply and takes it up next (his "no need to click twice",
/// 2026-09-16). Only the same words twice within a breath are one tap.
let saying = false;
let sayTimer = null;
let lastSaid = { text: '', at: 0 };
async function say(text) {
  if (text === lastSaid.text && Date.now() - lastSaid.at < 2500) return;
  lastSaid = { text, at: Date.now() };
  saying = true;
  // The safety net: a turn that never ends still gives the stage back. One
  // timer, the latest say's.
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { sayTimer = null; if (saying) { streaming = false; turnEnded(); } }, 90000);
  try {
    await deliver(text, false);
  } catch (e) {
    console.warn('[lingjing] say', e);
    turnEnded();
  }
}

/// The turn is over, whatever became of it: the stage stops waiting. Called on
/// a reply, and on an error or a timeout too — before this, only a clean end
/// cleared them, so a failed turn left buttons pressed for ever.
function turnEnded() {
  saying = false;
  clearTimeout(sayTimer);
  sayTimer = null;
  show({ tapped: null, casting: false, asked: null });
}

/// A word from the stage is a message, never the answer to a question
/// waiting in the chat: the question belongs to the chat alone, and the word
/// waits its turn behind it (his "should it queue instead of hiding the ask
/// user widget", 2026-09-17 — the skill declares the queue).
function deliver(text, hidden) {
  if (hidden) chat?.sendHidden(text);
  else chat?.send(text);
}

/* 开府 — the setup milestones, read (no model) when the 事 chip opens. */
async function loadKaifu() {
  const r = await verb('quest', { action: 'kaifu' }).catch(() => null);
  if (r?.ok) show({ kaifu: r.kaifu });
}

/* A line of the book, opened: `Quest info` is a read (45 ms, no model). */
async function openRow(id) {
  if (view.bookRow === id) { show({ bookRow: null }); return; }
  show({ bookRow: id, bookInfo: view.bookInfo?.id === id ? view.bookInfo : null });
  const info = await verb('quest', { action: 'info', id }).catch(() => null);
  if (info?.ok && view.bookRow === id) show({ bookInfo: info });
}

/* 路上: a find or the day's 机缘 taken, or a find left — by the rules at
   once; the bag and the strip show it, and the roads row stands where it
   was. Nothing goes to Ling (his, 2026-09-24): the save's `page_did` tells her
   on her next Look. A 机缘's card stands as spoils, and 银月 hears it (she
   was there for the run to reach it). */
async function takeMeet(action) {
  const where = look?.place?.meet?.kind === 'chance' ? look.place.meet.place?.name ?? look.place?.name ?? '' : null;
  const r = await write('meet', { action }).catch(failed);
  if (!r.ok) { keep({ doNote: refusal(r) }); await refresh(); return; }
  if (r.chance && r.card) keep({ spoils: { place: look?.place?.id ?? null, cards: [r.card], items: [] } });
  if (r.chance) tellYinyue('chance', `赶上了${where}的机缘，得了${r.card?.name ?? '些东西'}`, `Made it to the chance at ${where} in time — ${r.card?.name ?? 'something'} gained`, { mood: 'happy' });
  await refresh();
}

/* 去X — the page walks him itself (his, 2026-09-24): Move, then the walk
   drawn on the map (watchTravel sees the place change). An ordinary arrival
   says nothing to Ling; one where the story takes over — a scene, a veiled
   遇 (told after the page reveals it), her call, an errand's sight — goes to
   her once, unseen, to tell it. A
   refusal is said a moment on the stage. */
const STORY_AT = [(r) => r.stopped, (r) => r.scene, (r) => r.place?.meet?.veiled, (r) => r.quest?.say, (r) => r.met?.some((m) => m.seen)];
const NOTE_MS = 4000;
async function goTo(place) {
  const before = look;
  show({ bookOpen: false });
  const r = await write('move', { place }).catch(failed);
  // A refusal with her word in it (too-hard) is kept on the save as her beat:
  // the next Look raises her moment (watchNode) — the one way she hears it.
  if (!r.ok) { noteAWhile(refusal(r)); if (r.her_beat) await refresh(); return; }
  keep({ doNote: null });
  await refresh();
  cheer(before);
  // Something veiled on the road (not a 抉择, Ling's to write): the page
  // reveals it after the mist and tells her then (liftVeil) — one beat, after.
  const veiled = r.place?.meet?.veiled && r.place.meet.kind !== 'trial';
  if (!r.here && !veiled && STORY_AT.some((f) => f(r))) await report(`[scene] arrived ${r.place?.id ?? place}`);
}
function noteAWhile(text) {
  show({ doNote: text });
  setTimeout(() => { if (view.doNote === text) show({ doNote: null }); }, NOTE_MS);
}

/* 喂它X / 献上X — the page's own Tame (his, 2026-09-24). The cast grows, and
   the 收服 seal comes up by itself (riseStats); 银月 hears the gain. */
async function tameTap(id) {
  const before = look;
  const r = await write('tame', { creature: id }).catch(failed);
  keep({ doNote: r.ok ? null : refusal(r) });
  await refresh();
  if (r.ok) cheer(before);
}

/* 炼化本命 on the card: the material picked there, the name the player typed
   — required, never made up for them — and Refine, from the page. */
async function refineTap(material) {
  const name = (view.refineName ?? '').trim();
  if (!name) { show({ refineNote: words().refineName }); document.getElementById('refine-name')?.focus(); return; }
  const r = await write('refine', { material, name }).catch(failed);
  keep(r.ok ? { refineMat: null, refineName: '', refineNote: null } : { refineNote: refusal(r) });
  await refresh();
}

/* ── 闭关 — the page's own taps (rules/seclusion.mjs) ──
   Choosing, going in and 出关 are the page's: the rules count the hours from
   the save's stamp and settle it; no model turn (his law: the page shows
   facts). 银月 hears the facts once she walks with the player and says her
   own words; Ling reads it off `page_did` at her next Look. */
async function openSeclude() {
  const r = await write('seclude', { action: 'info' }).catch(failed);
  if (!r.ok) return show({ doNote: refusal(r) });
  if (r.seclusion) return refresh(); // one is running: its card is the stage
  show({ secludeOpen: true, seclude: r.choices, secludeFocus: null, secludePill: null, secludeNote: null, bookOpen: false, gearOpen: false });
}

const focusFacts = (e, zh) => (e.focus === 'card' ? e.card?.name : WORDS[zh ? 'zh' : 'en'].secludeFoci[e.focus]);
async function goSeclude() {
  const f = view.secludeFocus;
  if (!f) return show({ secludeNote: words().secludePick });
  const r = await write('seclude', { action: 'enter', focus: f.focus, ...(f.id ? { id: f.id } : {}), ...(view.secludePill ? { pill: view.secludePill } : {}) }).catch(failed);
  if (!r.ok) return show({ secludeNote: refusal(r) });
  keep({ secludeOpen: false, seclude: null, secludeFocus: null, secludePill: null, secludeNote: null });
  await refresh();
  // 银月 sits by the player as they go in — the facts; her words are hers.
  const e = r.entered, pill = e.pill ? { zh: `，服了一粒${e.pill.name}`, en: `, having taken a ${e.pill.name}` } : { zh: '', en: '' };
  if (look?.companion) askHer('seclude', `玩家刚入关闭关，专心修${focusFacts(e, true)}${pill.zh}。时辰按真实时间算，至多 ${e.cap} 小时。你在一旁护关。`,
    `The player has just gone into seclusion to work on ${focusFacts(e, false)}${pill.en}. Real hours count, up to ${e.cap}. You keep watch beside them.`, 'relaxed');
}

/* 出关 · 领取: the rules settle it; the card counts up what grew, and the
   strip's own rise runs (riseStats). Then the opening held back for it —
   her greeting, Ling's 前情提要 — goes on as it would have (enter()). */
async function emerge() {
  const r = await write('seclude', { action: 'leave' }).catch(failed);
  if (!r.ok) { keep({ doNote: refusal(r) }); return refresh(); }
  const e = r.emerged;
  keep({ emerged: { ...e, at: performance.now(), place: look?.place?.id ?? null } });
  await refresh();
  countUp();
  const facts = emergeFacts(e);
  const opening = view.afterEmerge;
  keep({ afterEmerge: null });
  if (opening) return opening(facts);
  if (look?.companion) askHer('emerge', facts.zh, facts.en, 'happy');
}

/* What 出关 grew, as facts for her — the rules' numbers, never a line. */
function emergeFacts(e) {
  const zh = [`玩家刚出关：闭关 ${e.hours} 小时，专心修${focusFacts(e, true)}`], en = [`The player has just come out of seclusion: ${e.hours} h, working on ${focusFacts(e, false)}`];
  const star = e.grows && e.card && e.card.to > e.card.from, layer = e.grows && e.treasure && e.treasure.to > e.treasure.from;
  if (star) { zh.push(`${e.card.name}练到了${e.card.to}星`); en.push(`${e.card.name} reached ${e.card.to} star${e.card.to > 1 ? 's' : ''}`); }
  if (e.grows && e.progress?.paid) { zh.push(`修为 +${e.progress.paid}`); en.push(`cultivation +${e.progress.paid}`); }
  if (layer) { zh.push(`${e.treasure.name}长到了${e.treasure.to}重`); en.push(`${e.treasure.name} grew to layer ${e.treasure.to}`); }
  if (!e.grows) { zh.push('时辰太短，没长什么'); en.push('too short for anything to grow'); }
  if (e.rested) { zh.push('体力回满'); en.push('stamina full'); }
  return { zh: `${zh.join('，')}。`, en: `${en.join('; ')}.` };
}

/* 出关's numbers count up from 0 once (`[data-countup]`): each frame finds
   the elements there NOW, as the strip's rise does, so a redraw mid-count
   never kills it. */
const COUNT_MS = 1400;
function countUp() {
  const start = view.emerged?.at;
  if (start == null) return;
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / (stillMotion() ? 1 : COUNT_MS));
    const ease = 1 - (1 - t) ** 3;
    for (const el of document.querySelectorAll('[data-countup]')) {
      const to = Number(el.dataset.countup);
      el.textContent = Number.isInteger(to) ? String(Math.round(to * ease)) : (to * ease).toFixed(1);
    }
    if (t < 1 && view.emerged?.at === start) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
document.addEventListener('input', (e) => { if (e.target.id === 'refine-name') keep({ refineName: e.target.value, refineNote: null }); });

/* 组牌 — a tap puts a card in the ten or takes it out; the popover redraws
   from the rules' own answer, and a refusal is said inside it. */
async function deckTap(args) {
  const r = await write('deck', args).catch(failed);
  show({ gear: r.ok ? r.gear : view.gear, gearNote: r.ok ? null : refusal(r) });
}

/// A moment she is asked about answers at once. Resolves true when she will
/// hear it; false when nobody will (the pet off answers 503 at once) — a
/// page that waits on her must not wait then.
function askHer(id, zh, en, mood) {
  return voice.moment(id, { zh, en }, { mood }).said;
}
/* 机缘's clock: the row counts down by the minute, and once — with half an
   hour left and him somewhere else — 银月 hears it; she decides whether to
   say so. */
let chanceTold = null;
setInterval(() => {
  const c = look?.chance;
  if (!c || c.taken || c.missed || !c.until) return;
  const left = Math.ceil((new Date(c.until) - Date.now()) / 60000);
  if (left <= 30 && left > 0 && !c.here && chanceTold !== c.until) {
    chanceTold = c.until;
    tellYinyue('chance_late', `${c.place.name}的机缘只剩半个时辰了`, `The chance at ${c.place.name} has half an hour left`, { mood: 'neutral' });
  }
  if (left <= 0) { refresh(); return; }
  render();
}, 60000);

/* 抉择 — the tap is the choice; the rules roll, the stage shows Ling's line
   for the way taken, and the turn goes to her to go on from it. 银月 hears
   how it went. */
async function chooseWay(n) {
  if (view.choosing) return;
  keep({ choosing: true });
  const r = await write('meet', { action: 'choose', n }).catch(failed);
  keep({ choosing: false });
  if (!r.ok) { keep({ doNote: refusal(r) }); await refresh(); return; }
  const w = words();
  const cost = r.lost?.stamina ? w.trialHurt.replace('{n}', r.lost.stamina) : r.lost?.wealth ? w.trialPoorer.replace('{n}', r.lost.wealth) : '';
  keep({ trialTold: { place: look?.place?.id ?? null, success: r.success, line: r.line, cost } });
  await refresh();
  if (r.success) tellYinyue('trial', `路上的抉择成了：${r.line}`, `A choice on the road went well: ${r.line}`, { mood: 'happy' });
  else tellYinyue('trial', `路上的抉择失手了：${r.line}`, `A choice on the road went wrong: ${r.line}`, { mood: 'sad' });
  await report(`[scene] trial ${n} ${r.success ? 'won' : 'lost'}`);
}

/* 接下 · 交差 · 买 · 卖 · 服用 · 佩戴 — taps that only change the save. The page
   calls the rules and redraws; nothing goes to the chat, and Ling reads the
   save on her next Look (his, 2026-09-22: 只有必要的时候, 让agent说话). A
   refusal is said on the stage in the rules' own words. */
const DOES = {
  take: (id) => write('quest', { action: 'take', id }),
  turn: (id) => write('quest', { action: 'turn', id }),
  buy: (id) => write('trade', { action: 'buy', id }),
  sell: (id) => write('trade', { action: 'sell', id }),
  use: (id) => write('trade', { action: 'use', id }),
};
async function doTap(action, id) {
  if (!DOES[action]) return;
  const r = await DOES[action](id).catch(failed);
  keep({ doNote: r.ok ? null : refusal(r) });
  if (r.ok && action === 'take') tookOffer(id);
  await refresh();
  if (r.ok && action === 'turn' && view.bookOpen) await loadKaifu();
  // 交差 on 传闻's line counts a kept win: the next step is the story's.
  if (r.ok && id === 'tale' && r.ended) taleEnded(r.handed?.[0]?.title ?? r.title);
  if (r.ok && id === 'tale' && (r.ended || r.step)) await report(`[scene] tale ${r.ended ? 'end' : 'step'}`);
}
/* 今日传闻 finished — a big moment for her (a fight that ends it is its finale). */
function taleEnded(title, finale = false) {
  const t = title ? `「${title}」` : '';
  tellYinyue(finale ? 'finale' : 'tale_end', `${finale ? '打赢了收尾的一仗，' : ''}今日传闻${t}走完了`, `${finale ? 'Won the closing fight — ' : ''}today's rumor${title ? ` "${title}"` : ''} is finished`, { mood: 'happy' });
}

/* 接下 seen: the row takes a 已接下 seal and fades, so a second errand rising
   into its place never reads as a tap that did nothing (his, 2026-09-24). */
const TOOK_MS = 1600;
function tookOffer(id) {
  const offer = look?.offers?.find((o) => o.id === id);
  show({ offerRow: null, tookOffer: offer ?? null });
  setTimeout(() => { if (view.tookOffer?.id === id) show({ tookOffer: null }); }, TOOK_MS);
}

/* 装备 · 背包: putting a thing on, or taking a pill, is his own tap — the page
   calls Trade itself and redraws from the rules; no model turn. */
async function useItem(id, action = 'use') {
  const r = await write('trade', { action, id }).catch(failed);
  // A refusal is said where he tapped — a pill kept on a full day said
  // nothing, and looked like a button that did not work.
  await openGear();
  keep({ gearNote: r.ok ? null : refusal(r) });
  await refresh();
}

async function openGear() {
  const r = await verb('gear').catch((e) => { console.warn('[lingjing] gear', e); return null; });
  show({ gearOpen: true, bookOpen: false, gear: r?.gear ?? null, gearNote: null });
}

/* 撂下 is the rules' to do; Ling reads the book in her next Look. */
async function dropErrand(id) {
  const r = await write('quest', { action: 'drop', id }).catch(failed);
  keep({ bookRow: null, bookInfo: null, doNote: r.ok ? null : refusal(r) });
  await refresh();
}

/* The ask bar stands outside the stage's repaint, so a stream of tokens never
   takes the field from under the player's hands. Empty, it sends the line as
   it is (「说说夫诸」); with a question, the line quotes what is asked about. */
function openAsk(line, toHer = false) {
  keep({ ask: line, askHer: toHer });
  const bar = $('askbar');
  bar.innerHTML = askBarHtml(line, words(), toHer ? words().askHerHint : undefined);
  bar.hidden = false;
  $('askField').focus();
}
function closeAsk() {
  keep({ ask: null, askHer: false });
  $('askbar').hidden = true;
  $('askbar').innerHTML = '';
}
function sendAsk() {
  if (!view.ask) return;
  const q = $('askField').value.trim();
  // 问问银月: the words go to her in this chat (`@银月 …`) — she answers as
  // [Yinyue], and Ling reads the exchange on his next turn. Empty, the
  // player's gentle nudge to talk.
  if (view.askHer) {
    closeAsk();
    deliver(`@银月 ${q || words().askHerEmpty}`, false);
    return;
  }
  const line = q ? `${view.ask}${lang() === 'zh' ? '：' : ': '}${q}` : view.ask;
  closeAsk();
  show({ bookOpen: false });
  say(line);
}
/// Rows that open where they lie answer the keyboard as a button does.
const KEY_ROWS = [
  ['[data-bookrow]', (row) => openRow(row.dataset.bookrow)],
  ['[data-offerrow]', (row) => toggleOffer(row.dataset.offerrow)],
];
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'askField' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendAsk(); }
  if (e.key === 'Escape') { if (view.ask) closeAsk(); else if (view.luOpen) show({ luOpen: false }); else if (view.bookOpen || view.gearOpen) show({ bookOpen: false, gearOpen: false }); }
  if (e.key !== 'Enter' && e.key !== ' ') return;
  for (const [sel, open] of KEY_ROWS) {
    const row = e.target.closest?.(sel);
    if (row && e.target === row) { e.preventDefault(); open(row); return; }
  }
});

/* 命格 — set on the 问卦 card, never in the chat. No turn for Ling: she reads it on
   her next Look. 银月 tells him what his sign is, in her own words. */
async function setFate(kind) {
  const args = kind === 'birth' ? { birth: view.fateDraft } : { [kind]: 'true' };
  if (kind === 'birth' && !view.fateDraft) { show({ fateError: true }); return; }
  const r = await write('fate', args).catch(failed);
  if (!r.ok) { show({ fateError: r.refused === 'birth-invalid' }); return; }
  keep({ fateOpen: false, fateDraft: '', fateError: false });
  await refresh();
  const f = look?.fate;
  if (kind === 'decline' || !f?.zodiac) return;
  askHer('fate', `玩家刚在问卦的卡上定了命格：属${f.zodiac.name}，日主${f.stem.name}${f.element.name}，天生亲近${f.element.name}。它给的：斗法时主灵根一击属${f.element.name}；问卦时下卦属${f.element.name}，卦象偏向玩家。用你自己的话告诉玩家，一两句。`,
    `The player has just set their birth sign on the day's reading: year of the ${f.zodiac.name}, day master ${f.stem.name} (${f.element.name}), at home in ${f.element.name}. What it gives: their root strike in a fight is ${f.element.name}; a reading whose lower trigram is ${f.element.name} leans their way. Tell them in your own words, a line or two.`, 'happy');
}
document.addEventListener('input', (e) => { if (e.target.id === 'fate-birth') keep({ fateDraft: e.target.value, fateError: false }); });

function toggleOffer(id) { show({ offerRow: view.offerRow === id ? null : id }); }

/* A game module's move: the rules of the game are the module's; the win is
   the rules' (`win`, then Ling hears `[scene] won`), as for 炼丹. */
function gameMove(gmove) {
  const ghost = gmove.closest('[data-game]');
  if (!ghost || gmove.disabled) return false;
  const g = boardFor(ghost.dataset.game);
  if (!g) return true;
  const r = g.mod.act(g.state, { ...gmove.dataset });
  g.state = r.state;
  render();
  if (r.won && !g.sent) { g.sent = true; run(`win:${g.taskId}`, () => onWin(g.taskId)); }
  return true;
}
function tileTap(tile) {
  const host = tile.closest('[data-board]');
  if (!host) return false;
  const board = boardFor(host.dataset.board);
  const cleared = tap(board, Number(tile.dataset.tile));
  render();
  if (cleared && !board.sent) { board.sent = true; run(`win:${board.taskId}`, () => onWin(board.taskId)); }
  return true;
}
/* A word from the stage, said as his own line in the chat. */
function sayTap(spoken, e) {
  if (e.target.closest('[data-play],[data-tile],[data-g],[data-duel-start],[data-spot]')) return false;
  if (spoken.matches(':disabled')) return true;
  const line = spoken.dataset.say;
  show({ tapped: line, bookOpen: false, ...(line === words().sayCast ? { casting: true } : {}) });
  say(line);
  return true;
}

/* Every tap on the page, by what it lands on — first match wins; a handler
   that answers `false` lets the tap go on down the list. The popovers' own
   taps come first; any other tap puts an open popover away, then does what
   it was for. */
const busy = (key, fn) => () => run(key, fn);
const CLICKS = [
  ['[data-book]', () => { show({ bookOpen: !view.bookOpen, gearOpen: false }); if (view.bookOpen) loadKaifu(); }],
  ['[data-lu]', () => (view.luOpen ? show({ luOpen: false }) : openLu())],
  ['[data-lu-close]', () => show({ luOpen: false })],
  ['[data-titlecard]', (el) => { dismissedTitles.add(el.dataset.titlecard); titleSeen(el.dataset.titlecard, true); render(); }],
  ['[data-gear]', () => (view.gearOpen ? show({ gearOpen: false }) : openGear())],
  ['[data-do]', (el) => { if (!el.matches(':disabled')) run(`do:${el.dataset.do}:${el.dataset.id}`, () => doTap(el.dataset.do, el.dataset.id)); }],
  ['[data-deck]', (el) => run(`deck:${el.dataset.deck}`, () => deckTap({ action: 'toggle', id: el.dataset.deck }))],
  ['[data-deck-auto]', busy('deck:auto', () => deckTap({ action: 'auto' }))],
  ['[data-wear],[data-use],[data-remove]', (el) => {
    const id = el.dataset.wear ?? el.dataset.use ?? el.dataset.remove, action = el.dataset.remove ? 'remove' : 'use';
    run(`item:${action}:${id}`, () => useItem(id, action));
  }],
  ['*', (el, e) => {
    if ((view.bookOpen || view.gearOpen) && !e.target.closest('.bookpop') && !e.target.closest('#askbar')) show({ bookOpen: false, gearOpen: false });
    return false;
  }],
  ['[data-spoils-close]', () => show({ spoils: null })],
  ['[data-seclude-open]', () => run('seclude', () => openSeclude())],
  ['[data-seclude-close]', () => show({ secludeOpen: false, secludeNote: null })],
  ['[data-seclude-focus]', (el) => show({ secludeFocus: { focus: el.dataset.secludeFocus, id: el.dataset.id ?? null }, secludeNote: null })],
  ['[data-seclude-pill]', (el) => show({ secludePill: view.secludePill === el.dataset.secludePill ? null : el.dataset.secludePill })],
  ['[data-seclude-go]', () => run('seclude', () => goSeclude())],
  ['[data-emerge]', () => run('emerge', () => emerge())],
  ['[data-emerged-close]', () => show({ emerged: null })],
  // Inside a fight the stage belongs to the fight: a click is a place on it.
  ['[data-spot]', (el) => {
    if (!bout) return false;
    onBoutTap({ kind: el.dataset.spot, index: Number(el.dataset.index ?? -1) });
  }],
  ['[data-duel-start]', (el) => run(`duel:${el.dataset.duelStart}`, () => { keep({ walkedOut: null }); return onDuelStart(el.dataset.duelStart); })],
  // 问询: the one word that costs a model turn opens the ask bar; nothing is
  // sent until the player says so.
  ['[data-ask]', (el) => openAsk(el.dataset.ask)],
  ['[data-ask-her]', () => (view.ask && view.askHer ? closeAsk() : openAsk(words().askHer.replace('{name}', look?.companion?.name ?? words().yinyue), true))],
  ['[data-ask-send]', () => sendAsk()],
  ['[data-ask-close]', () => closeAsk()],
  ['[data-meet]', (el) => run(`meet:${el.dataset.meet}`, () => takeMeet(el.dataset.meet))],
  // 去X, 喂它X, 炼化: the page's own verbs — no word to Ling.
  ['[data-go]', (el) => { if (!el.matches(':disabled')) run(`go:${el.dataset.go}`, () => goTo(el.dataset.go)); }],
  ['[data-tame]', (el) => { if (!el.matches(':disabled')) run(`tame:${el.dataset.tame}`, () => tameTap(el.dataset.tame)); }],
  ['[data-refine-mat]', (el) => show({ refineMat: el.dataset.refineMat, refineNote: null })],
  ['[data-refine]', (el) => { if (el.dataset.refine) run('refine', () => refineTap(el.dataset.refine)); }],
  ['[data-divine]', () => run('divine', () => castByPage())],
  ['[data-trial]', (el) => run('trial', () => chooseWay(Number(el.dataset.trial)))],
  ['[data-tale-answer]', (el) => run('tale', () => taleAnswer(el.dataset.taleAnswer))],
  ['[data-drop]', (el) => run(`drop:${el.dataset.drop}`, () => dropErrand(el.dataset.drop))],
  // A line of the book opens where it lies — the page reads it from the rules.
  ['[data-offerrow]', (el, e) => { if (e.target.closest('button')) return false; toggleOffer(el.dataset.offerrow); }],
  ['[data-bookrow]', (el, e) => { if (e.target.closest('button, a')) return false; openRow(el.dataset.bookrow); }],
  ['[data-lang]', (el) => run('lang', () => switchLang(el.dataset.lang))],
  // 命格: the birthday is read here, by the rules on this machine — never
  // sent to the chat; Ling hears nothing of it.
  ['[data-fate-open]', () => show({ fateOpen: true })],
  ['[data-fate]', (el) => run('fate', () => setFate(el.dataset.fate))],
  // Near or whole: only how the map is looked at, so the page answers it.
  ['[data-mapview]', (el) => {
    const to = el.dataset.mapview;
    (to === 'province' ? Promise.resolve() : loadAtlas()).then(() => show({ mapView: to }));
  }],
  ['[data-say]', (el, e) => sayTap(el, e)],
  // A board opened from the tray stays on the stage until he walks on.
  // 开局 from the tray puts the board in the line, behind an errand not yet taken.
  ['[data-play]', (el) => !el.matches(':disabled') && show({ opened: { id: el.dataset.play, place: look?.place?.id ?? null }, qSkip: view.qSkip.filter((k) => k !== `board:${el.dataset.play}`) })],
  ['[data-qnext]', (el) => putOff(el.dataset.qnext)],
  ['[data-g]', (el) => gameMove(el)],
  ['[data-tile]', (el) => tileTap(el)],
];
document.addEventListener('click', (e) => {
  for (const [sel, handle] of CLICKS) {
    const el = sel === '*' ? e.target : e.target.closest?.(sel);
    if (el && handle(el, e) !== false) return;
  }
});

/* ── 银月 hears what happened (engine: POST /api/yinyue/event) ──
   Facts only, in the player's language; she is not woken now. The engine keeps
   them until the player has gone quiet — or, `big`, until the screen settles —
   and then she decides whether a word fits (his, 2026-09-23: 不要每条都回复,
   只在安静了许久的时候出来说一些). Only once she walks with the player. */
function tellYinyue(id, zh, en, { mood = null } = {}) {
  if (!look?.companion) return;
  voice.moment(id, { zh, en }, { mood });
}

/* The turns of a fight worth her knowing: the beast letting its 杀招 go, and
   the player's 气血 falling to a quarter — each once a fight. */
function fightMoments() {
  const st = bout?.st, foe = bout?.brief?.creature?.name ?? '';
  if (!st) return;
  if (st.foe.charge?.phase === 'spent' && !bout.told?.unleash) {
    bout.told = { ...bout.told, unleash: true };
    const sig = st.foe.signature?.name ?? {};
    tellYinyue('unleash', `${foe}放出了杀招「${sig.zh ?? ''}」`, `${foe} let its ${sig.en ?? 'signature'} go`);
  }
  if (st.outcome === 'open' && st.you.hp * 4 <= st.you.hpMax && !bout.told?.low) {
    bout.told = { ...bout.told, low: true };
    tellYinyue('hurt', `斗${foe}，气血只剩不到三成了`, `Fighting ${foe}, down to a quarter of their Life or less`);
  }
}

/* How it ended, for her: a loss is the big one. */
function toldOutcome(brief, outcome) {
  const c = brief?.creature ?? {}, foe = c.name ?? '';
  if (outcome === 'won') return tellYinyue('won', `降服了${foe}`, `Beat ${foe}`, { mood: 'happy' });
  if (outcome === 'lost') return tellYinyue('lost', `输给了${foe}，它今日不会再出来了`, `Lost to ${foe} — it will not come out again today`, { mood: 'sad' });
  if (outcome === 'withdrew') tellYinyue('withdrew', `${foe}力竭遁走，这一仗不算赢`, `${foe} ran out of breath and left — not a win`);
}

/* ── 降妖: the page plays the fight, the rules decide it ── */

/// The fight's door: the rules charge it and hand over the setup. One at a
/// time — a Look and a tap both asking opened two rooms on one fight.
let starting = false;
async function onDuelStart(id) {
  if (bout || starting) return;
  starting = true;
  try {
    const r = await write('duel', { id });
    if (!r.ok) {
      // Its own words, never the refusal's id: 「no-qi」 on the stage is the page
      // talking to itself. The states without words (won today, tamed) are
      // already written on the card by Look.
      show({ duelSay: { id, text: r.say ?? null } });
      return;
    }
    const brief = r.duel;
    // The page has to be able to NAME every card the door locked in. If it
    // cannot, its content is older than the fight — read the world again, and if
    // they are still strangers say so on the card rather than open a room where
    // the hand is dealt and nothing in it can be played (2026-09-18: that fight
    // cost him twenty taps, a day's 体力 and the day's beast, in silence). The
    // fight stays open in the save, so coming back after a refresh spends no
    // second 体力.
    if (missingCards(brief.setup, cardCatalog()).length) await loadContent(look.world, true);
    const unknown = missingCards(brief.setup, cardCatalog());
    if (unknown.length) {
      console.error('[lingjing] no card row for', unknown.join(', '));
      show({ duelSay: { id, text: (BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh).stale } });
      return;
    }
    keep({ duelSay: { id: null, text: null }, walkedOut: null });
    bout = { id, brief, setup: brief.setup, st: begin(brief.setup, cardCatalog()), actions: [], picked: null, openLog: false, help: false, note: null, busy: false };
    render();
  } catch (e) {
    console.warn('[lingjing] duel', e);
    show({ duelSay: { id, text: words().notDone } });
  } finally {
    starting = false;
  }
}

/* A move being played out holds the fight: `busy` keeps the idle timer and a
   second tap from ending the same turn twice, and every await checks the room
   is still the same one — 认输 may have closed it meanwhile. */
const gone = (b) => bout !== b || b.yielded;

/* One tap inside the fight. The page plays it out and draws it; only when the
   fight is over does it hand the whole list of actions to the rules, which
   replay them and settle — win, loss, or the beast walking away. */
async function onBoutTap(spot) {
  const b = bout;
  if (!b) return;
  if (spot.kind === 'help' || spot.kind === 'help-bg') { b.help = !b.help; return drawNow(); }
  if (spot.kind === 'more') { b.openLog = !b.openLog; return drawNow(); }
  // 认输 answers at any moment, the beast's turn included.
  if (spot.kind === 'quit') return yieldBout();
  if (b.busy || b.st.outcome !== 'open') return;
  b.note = null;
  const out = pickOf(b.picked, spot, boutView(b.st), cardCatalog());
  if (out.quit) return yieldBout();
  if (out.clear) { b.picked = null; return drawNow(); }
  if (out.pick) { b.picked = out.pick; return drawNow(); }
  if (out.action.kind === 'end') return endBoutTurn();
  const mark = b.st.log.length;
  const res = act(b.st, out.action, 'you');
  b.picked = null;
  if (!res.ok) { b.note = res.why; return drawNow(); }
  b.actions.push(tokenOf(out.action));
  b.busy = true;
  try {
    drawNow();
    await playLog(document.querySelector('.battle'), since(b.st.log, mark), { words: boutCtx().words });
  } finally {
    b.busy = false;
  }
  if (gone(b)) return;
  fightMoments();
  if (b.st.outcome !== 'open') return settleBout(b);
  drawNow();
}

/* The creature answers a move at a time, drawn as each lands. */
async function endBoutTurn() {
  const b = bout;
  if (!b || b.busy || b.st.outcome !== 'open' || b.st.whose !== 'you') return;
  const mark = b.st.log.length;
  if (!act(b.st, { kind: 'end' }, 'you').ok) return;
  b.actions.push('end');
  b.busy = true;
  try {
    drawNow();
    await playLog(document.querySelector('.battle'), since(b.st.log, mark), { words: boutCtx().words });
    if (gone(b)) return;
    fightMoments();
    if (b.st.whose === 'foe' && b.st.outcome === 'open') {
      await banner(document.querySelector('.battle'), `${b.brief.creature.name}${lang() === 'en' ? "'s turn" : '的回合'}`, 'foe');
      for (let guard = 0; guard < 40 && !gone(b) && b.st.whose === 'foe' && b.st.outcome === 'open'; guard += 1) {
        const step = b.st.log.length;
        const did = foeStep(b.st);
        drawNow();
        await playLog(document.querySelector('.battle'), since(b.st.log, step), { words: boutCtx().words });
        if (gone(b)) return;
        fightMoments();
        if (!did || did.kind === 'end') break;
      }
    }
  } finally {
    b.busy = false;
  }
  if (gone(b)) return;
  if (b.st.outcome !== 'open') return settleBout(b);
  drawNow();
}

/* 认输 — the rules settle only a fight played to its end, so yielding is played
   to its end: he passes every turn and the beast takes its own, exactly as the
   rules will replay it. Nothing is invented; the rules still decide. */
function yieldBout() {
  const b = bout;
  if (!b || b.settling || b.yielded) return;
  b.yielded = true;
  const st = b.st;
  for (let guard = 0; guard < 600 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    if (!act(st, { kind: 'end' }, 'you').ok) break;
    b.actions.push('end');
  }
  return settleBout(b);
}

/* The rules settle it, and the scene reports it — the scene is still the only
   witness to a fight (design.md § 降妖). The room closes whatever the answer:
   a refusal is said on the stage, and Ling hears only what the rules decided. */
async function settleBout(b = bout) {
  if (!b || b.settling) return;
  b.settling = true;
  clearTimeout(idleTimer);
  const { id, actions, brief } = b;
  const r = await write('duel', { id, picks: actions.join(',') }).catch(failed);
  if (bout === b) bout = null;
  if (!r.ok) {
    console.warn('[lingjing] the rules refused the fight', r);
    // The save may still hold it open: it waits on its card for his tap, and
    // the next Look does not pull him back into it.
    keep({ walkedOut: id, doNote: r.say || words().fightRefused });
    await refresh();
    return;
  }
  const finale = (r.handed ?? []).find((h) => h.tale && h.ended);
  if (finale && r.outcome === 'won') taleEnded(finale.title, true);
  else toldOutcome(brief, r.outcome);
  // 所得: the room closes, and what it left stands on the stage — the card he
  // now holds is seen, not only told.
  const got = r.outcome === 'won' ? r.dropped ?? [] : [];
  const paid = r.outcome === 'won' && (r.paid?.progress || r.paid?.wealth) ? r.paid : null;
  // A 符 played is spent from the bag, won or lost: the card says so (page fact).
  const spent = r.spent ?? [];
  if (got.length || paid || spent.length) keep({ spoils: { place: look?.place?.id ?? null, cards: got.filter((d) => d.card), items: got.filter((d) => !d.card), paid, spent } });
  // The strip counts up once the room has closed and the eye is back on it.
  riseAfter = performance.now() + 600;
  keep({ walkedOut: null });
  // A fight that ended today's rumor is its ending: one beat, the tale's.
  const ended = (r.handed ?? []).some((h) => h.tale && h.ended);
  await report(ended ? '[scene] tale end' : `[scene] ${r.outcome} ${id}`);
  await refresh();
}

/* ── The chat ── */

/// The day's chat to pick up: the newest one spoken in, within today's
/// stretch — the app session rule. An empty session is no day.
async function recentSessionId() {
  try {
    return pickResumable(await listSkillSessions(SKILL));
  } catch {
    return null;
  }
}

/// What the open question offers, by label. The chat owns the question (his
/// law, 2026-09-17), so while one is open the stage does not offer the same
/// choices a second time — one clickable place for one thing. Anything the
/// question does NOT name (说说, 起一卦, a card's own action) stays.
function askedOptions(args) {
  try {
    const a = typeof args === 'string' ? JSON.parse(args) : args;
    const opts = a?.questions?.[0]?.options ?? [];
    return new Set(opts.map(o => String(o?.label ?? o ?? '').trim()).filter(Boolean));
  } catch {
    return null; // still streaming
  }
}

function onContentBlock(payload) {
  if (payload?.tool === 'AskUser') {
    // A question means no cast is coming this turn: the coins land.
    if (view.casting) keep({ casting: false });
    const offered = askedOptions(payload.args);
    if (offered?.size) keep({ asked: offered });
    waitingOnPlayer();
    render();
    return;
  }
  if (payload?.tool === 'Show' && payload.args) {
    try {
      const args = typeof payload.args === 'string' ? JSON.parse(payload.args) : payload.args;
      const cards = (args.cards ?? []).filter((c) => c && c.card);
      if (cards.length) {
        // A map Ling shows opens on the player's province.
        show({ focus: cards, ...(cards.some((c) => c.card === 'map') ? { mapView: 'province' } : {}) });
      }
    } catch (e) {
      console.warn('[lingjing] Show parse', e);
    }
  }
  // A creature was just painted: the next read takes the content again, and
  // until it lands the stage keeps drawing what it has (boards in play too).
  if (payload?.tool === 'Art') { contentStale = true; refreshSoon(); }
  if (WRITERS.has(payload?.tool)) refreshSoon();
}

/// The opening of a fresh chat: ONE model turn, never two. Once Yinyue walks
/// with him the day's first greeting is hers (greetByHer) and Ling says
/// nothing until he does; otherwise — a stranger at the river, or a new chat
/// later in a day already greeted — Ling opens with `[scene] opened`. A
/// reopened day is picked up in silence. Once per session, and only once the
/// chat is there to carry it.
let openedFor = null;
let mounted = false;
function openWith(sid, greeted = false) {
  if (!sid || openedFor === sid || !chat) return;
  openedFor = sid;
  if (!greeted) chat.sendHidden('[scene] opened');
  else greetWaits = { sid, text: greetText };
}

/* Her greeting stands in for Ling's opening. If nobody will say it (the pet
   is off: `device_topic` yinyue/unanswered, or the event refused at once),
   Ling opens after all — the chat never waits on a silence. */
let greetWaits = null; // { sid, text } while the opening is hers
let greetText = null; //  her greeting as the engine holds it (trimmed, 300 chars)
function greetUnanswered(text = null) {
  const g = greetWaits;
  if (!g || (text && g.text && text !== g.text)) return;
  greetWaits = null;
  if (chat && chat.getSessionId?.() === g.sid) chat.sendHidden('[scene] opened');
}

/// Mounts the chat; answers whether it is a fresh session (not a day picked up).
async function mountChat() {
  const resume = await recentSessionId();
  chat = await window.LinggenUI.mount($('chat-panel'), {
    skillName: SKILL,
    agentId: 'ling',
    title: 'Lingjing',
    sessionId: resume || undefined,
    // A new chat begun from the panel's own button, after the page is up.
    onSessionCreated: (sid) => { if (mounted && sid !== resume) openWith(sid); },
    onStreamToken: () => { streaming = true; },
    onStreamEnd: () => {
      turnEnded();
      voice.heard();
      streaming = false;
      if (recapSent !== null) recapTold();
      const before = look;
      if (veil) veil.turns += 1;
      refresh().then(() => { cheer(before); nudgeTrial(); });
    },
    onContentBlock: (payload) => { streaming = true; onContentBlock(payload); },
    // The engine says the save changed under the page (`save_changed`: the
    // account's copy was pulled over it): read it again. It is global, so
    // only this skill's.
    onSkillEvent: (event, payload) => {
      if (event === 'save_changed' && (!payload?.skill || payload.skill === SKILL)) {
        // Changes made here that the pull replaced are kept as copies: say so.
        if (payload?.conflicts?.length) keep({ doNote: words().saveConflicts });
        refreshSoon(200);
      }
      // An app wrote its quest facts (a workout mirrored from the phone):
      // the 功课 card reads them again — a Look, no turn.
      if (event === 'quests_changed') refreshSoon(300);
      // An asked moment nobody will answer (the pet is off).
      if (event === 'device_topic' && payload?.topic === 'yinyue' && payload?.op === 'unanswered' && payload?.payload?.app === SKILL) greetUnanswered(payload.payload.text);
    },
  });
  mounted = true;
  // The bridge holds what is sent until the embed is listening, so one send
  // is enough — the old second `[scene] opened` 4.5 s later was a duplicate.
  return !resume;
}

/// A brand-new game starts in the language of the machine it is played on.
async function firstLanguage() {
  const fresh = look && !look.name && look.scene?.id === '00-river' && !look.story;
  if (!fresh) return;
  const want = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  if (want !== look.lang) {
    await write('lang', { lang: want, auto: true }).catch((e) => console.warn('[lingjing] lang', e));
    await refresh();
  }
}

/* ── 银月 on the stage: the cast, the rise, her body ── */

/// 问卦 from the card: the rules cast, the card shows it, 银月 reads it.
async function castByPage() {
  if (view.casting) return;
  show({ casting: true, bookOpen: false });
  const r = await write('divine', {}).catch(failed);
  if (!r.ok) { console.warn('[lingjing] divine', r); keep({ doNote: refusal(r) }); }
  await refresh();
  show({ casting: false });
}

/// A cast just landed (the page's or Ling's): 银月 gives the reading — she
/// was asked, so she answers at once (engine: `asked`). The facts go to her;
/// the words are hers (his rule: Yinyue writes every message).
function readingByHer(d) {
  if (!d || !look?.companion) return;
  const h = d.hexagram, zh = lang() !== 'en';
  const moving = h.moving_lines?.length ? (zh ? `；动爻：${h.moving_lines.join(' ')}` : '') : '';
  const to = d.changed ? (zh ? `，之卦《${d.changed.name}》` : `, changing to ${d.changed.name}`) : '';
  const e = d.effect ?? {};
  const does = zh
    ? [e.card ? `今日斗法${e.root?.name ?? ''}法术${e.card > 0 ? `+${e.card}` : e.card}` : '今日斗法无增无减', e.sight ? '看得出妖下回合的架势' : ''].filter(Boolean).join('，')
    : [e.card ? `in fights today ${e.root?.name ?? ''} spells ${e.card > 0 ? `+${e.card}` : e.card}` : 'no gain, no loss in fights today', e.sight ? "the beast's next move can be read" : ''].filter(Boolean).join('; ');
  const text = zh
    ? `为玩家问了今日一卦：得《${h.name}》${to}，${d.grade.name}。卦辞：${h.judgment}${moving}。它给的：${does}。`
    : `The day's reading: ${h.name}${to}, ${d.grade.name}. The judgment: ${h.judgment}. What it gives: ${does}.`;
  const mood = { great: 'happy', good: 'happy', even: 'relaxed', ill: 'sad', dire: 'sad' }[d.grade.id] ?? 'neutral';
  askHer('reading', text, text, mood);
}

/// Something won in Ling's turn — 修为, or 灵石 not from a sale: 银月 hears the
/// rise as facts and says what she will, in her own words (his rule: Yinyue
/// writes every message; the page never speaks a line Ling wrote for her). A
/// realm risen is the stage's own moment (`feat`), told to her there.
function cheer(before) {
  if (!before || !look || !look.companion || before.world?.id !== look.world?.id) return;
  if (look.tier?.id !== before.tier?.id || look.tier?.step !== before.tier?.step) return;
  const held = (l) => (l.bag ?? []).reduce((n, b) => n + (b.n ?? 0), 0);
  const progress = Math.max(0, (look.progress ?? 0) - (before.progress ?? 0));
  const wealth = look.wealth > before.wealth && held(look) >= held(before) ? look.wealth - before.wealth : 0;
  if (!progress && !wealth) return;
  const w = words();
  const zh = [progress ? `${w.xw} +${progress}` : '', wealth ? `${w.ls} +${wealth}` : ''].filter(Boolean).join('，');
  tellYinyue('gain', `刚才这一段，玩家得了${zh}`, `Just now the player gained ${zh.replace('，', ', ')}`, { mood: 'happy' });
}

/* ── 九鼎录 — the story as a book (redesign-v2 § 六) ──
   The 录 chip opens it over the stage: the rules' `story` read (45 ms, no
   model), drawn by lu.js. Read-only: nothing in it writes or asks Ling. */
async function openLu() {
  show({ luOpen: true, bookOpen: false, gearOpen: false });
  const r = await verb('story').catch((e) => { console.warn('[lingjing] story', e); return null; });
  if (view.luOpen) show({ lu: r });
}
let drawnLu = null;
function drawLu() {
  const el = $('lubook');
  const open = view.luOpen && !bout;
  document.body.classList.toggle('reading', open);
  el.hidden = !open;
  if (!open) { drawnLu = null; return; }
  // Redrawn only when it changed: a stream token must not reset the scroll.
  const html = view.lu ? luHtml(view.lu, { lang: lang(), her: look?.companion?.name ?? null }) : `<div class="lu"><div class="loading">${esc(WORDS[lang()].loading)}</div></div>`;
  if (html !== drawnLu) { el.innerHTML = html; drawnLu = html; }
}

/* The chapter's title card: on the stage when a chapter has just begun
   (Look's `chapter.fresh`), until tapped away — once per chapter. */
const titleKey = (id) => `lingjing:title:${look?.world?.id ?? ''}:${look?.name ?? ''}:${id}`;
function titleSeen(id, mark = false) {
  try {
    if (mark) localStorage.setItem(titleKey(id), '1');
    return Boolean(localStorage.getItem(titleKey(id)));
  } catch {
    return mark;
  }
}
const dismissedTitles = new Set();
function titleCard() {
  const ch = look?.chapter;
  if (!ch?.fresh || bout || dismissedTitles.has(ch.id) || titleSeen(ch.id)) return '';
  return titleCardHtml(ch, lang());
}

/* Story nodes — a scene passed, a cauldron found, a memory come back. The
   rules keep the last one on the save (Look's `story_node`), whoever moved;
   the page raises it once, as facts for 银月, and Ling may answer her once
   (`converse`): they talk over what it means. Never a line to recite. The
   first read only notes where things stand — nothing old is raised. */
let nodeSeen;
function watchNode() {
  const n = look?.story_node, at = n?.at ?? null;
  if (nodeSeen === undefined) { nodeSeen = at; return; }
  if (!n || at === nodeSeen) return;
  nodeSeen = at;
  storyMoment(n);
}
const nodeFresh = (kinds) => Boolean(look?.story_node && kinds.includes(look.story_node.kind) && Date.now() - Date.parse(look.story_node.at) < 60000);
function storyMoment(n) {
  const m = nodeMoment(n);
  if (m) tellYinyue(m.id, m.zh, m.en, { mood: m.mood });
}

/* 前情提要 — back after a while (Look's `recap_due`), Ling tells what came
   before in two or three lines. One sequence with her greeting, never two
   greetings: she greets (told Ling tells the story next), the page sends Ling
   one hidden `[scene] recap` once the greeting has settled, and after his
   telling she may add one feeling. A chat Ling opens herself needs none of
   this — her opening Look carries the recap (SKILL.md § 九鼎录). */
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
let recapSent = null; // the riddle the recap ended on, while Ling tells it
async function recapWhenSettled(greeted) {
  if (!look?.recap_due || !chat) return;
  const until = Date.now() + 45000;
  await pause(greeted ? 7000 : 1500);
  while ((streaming || saying) && Date.now() < until) await pause(1000);
  await refresh();
  if (!look?.recap_due || streaming || saying) return;
  recapSent = look.recap?.mystery ?? '';
  chat.sendHidden('[scene] recap');
}
function recapTold() {
  const q = recapSent;
  recapSent = null;
  if (q === null || !look?.companion) return;
  const zh = `Ling 刚讲完前情提要${q ? `，眼下悬着的谜：「${q}」` : ''}。你已经打过招呼了，别再问候；若有感触，说一句，没有就不说。`;
  const en = `Ling has just told what came before${q ? `; the riddle still open: “${q}”` : ''}. You have greeted already — no second greeting; one feeling if you have one, else nothing.`;
  voice.moment('recap', { zh, en }, { mood: 'relaxed' });
}

/* Yinyue on the stage: the engine's pet view, loaded as a stage so it
   outranks the desktop corner. Loaded while the game is open — the gate
   unloads it, which releases her, and she goes back to wherever she was.
   The moon stands in until the view has loaded. */
function stageYinyue(on, keep = false) {
  const pet = $('pet');
  const moon = document.querySelector('.stage .moon');
  // In a fight she is a card, so her body steps aside — but her view stays
  // loaded: unloaded, it gave up the presenter and she walked into the other
  // Linggen tab mid-fight (his screen, 2026-09-23: 进战斗后, 银月跑回主页面了).
  if (!on && keep && pet.dataset.on) { pet.style.visibility = 'hidden'; return; }
  pet.style.visibility = '';
  if (!on) { pet.hidden = true; moon.hidden = false; if (pet.dataset.on) { delete pet.dataset.on; delete pet.dataset.told; pet.src = 'about:blank'; } return; }
  if (pet.dataset.on) return;
  pet.dataset.on = '1';
  // The view is transparent, so it can lie over the moon while she is on her
  // way: the frame's load is only its HTML — the peer, the presenter lock and
  // her model all come after, and until 2026-09-21 that gap showed nothing at
  // all (his: 「Yinyue's 3D model is not show」). The moon goes when the view
  // says she is drawn (`petSays`). An engine too old to say so gets the old
  // behaviour late — she has been seen to take longer than eight seconds, and
  // a moon standing a while beats a stage with nobody on it.
  pet.onload = () => { pet.hidden = false; setTimeout(() => { if (pet.dataset.on && !pet.dataset.told) moon.hidden = true; }, 30000); };
  pet.src = `${location.origin}/?pet=1&stage=1`;
}
function petSays(e) {
  const pet = $('pet');
  if (e.source !== pet.contentWindow || e.data?.type !== 'linggen-pet') return;
  pet.dataset.told = '1';
  document.querySelector('.stage .moon').hidden = e.data.event === 'ready';
}
window.addEventListener('message', petSays);

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
  drawnStrip = '';
  $('place').textContent = '';
  $('stage').hidden = true;
  stageYinyue(false);
  $('tray').innerHTML = '';
  $('trayTitle').textContent = '';
  $('focus').innerHTML = `<div class="card gate-card"><div class="cardtitle">${esc(w.signTitle)}</div>
    <p>${esc(w.signBody)}</p><button class="act" id="signin">${esc(w.signBtn)}</button>
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
  $('focus').innerHTML = `<div class="loading">${esc(WORDS.zh.loading)} · ${esc(WORDS.en.loading)}</div>`;
  try {
    await syncCloud(SKILL);
  } catch (e) {
    console.warn('[lingjing] sync on open', e);
  }
  await refresh();
  await firstLanguage();
  const fresh = await mountChat();
  // In 闭关: 出关 is the first thing on the stage, and the opening waits for
  // its tap (his, 2026-09-24) — then goes on with what grew in it.
  if (look?.seclusion) { keep({ afterEmerge: (grew) => openSitting(fresh, grew) }); return; }
  await openSitting(fresh, null);
}

/// The sitting's opening: her greeting first — when she gives it, it is the
/// opening and Ling waits; else, back from 闭关, she hears what grew.
async function openSitting(fresh, grew) {
  const greeted = await greetByHer(grew);
  if (!greeted && grew && look?.companion) await askHer('emerge', grew.zh, grew.en, 'happy');
  if (fresh) openWith(chat?.getSessionId(), greeted);
  // Ling opening a fresh chat herself tells the 前情提要 in her opening.
  if (!fresh || greeted) recapWhenSettled(greeted);
}

/// 问候 — the day's first opening is hers (rules § 问候): the rules say
/// whether she has greeted today and hand over what they know; she speaks.
/// `grew`: 出关's facts, when the sitting opened on one — one greeting, not two.
async function greetByHer(grew = null) {
  if (!look?.companion) return false;
  const r = await write('greet', {}).catch(() => null);
  if (!r?.ok || !r.first) return false;
  const who = r.name ?? '';
  const facts = grew ? [...r.facts, grew.zh.replace(/。$/, '')] : r.facts, factsEn = grew ? [...r.facts, grew.en.replace(/\.$/, '')] : r.facts;
  const zh = `${who}今天第一次打开灵境。你知道的：${facts.join('；')}。像见到对方那样，打个招呼 —— 挑一两件说，不必都提。`;
  const en = `${who} has just opened Lingjing for the first time today. What you know: ${factsEn.join('; ')}. Greet the player as you would on seeing them — pick one or two, not all.`;
  // Back after a while: Ling tells the story next — she only greets (one sequence, not two greetings).
  const recap = look?.recap_due ? { zh: '接着 Ling 会讲前情提要，故事留给 Ling，你只打招呼。', en: ' Ling tells what came before right after you: leave the story to Ling and only greet.' } : { zh: '', en: '' };
  // Nobody to say it (pet off): Ling opens instead.
  if (!(await askHer('greet', zh + recap.zh, en + recap.en, 'happy'))) return false;
  greetText = [...(lang() === 'en' ? en : zh).trim()].slice(0, 300).join('');
  return true;
}

async function boot() {
  $('focus').innerHTML = `<div class="loading">${esc(WORDS.zh.loading)} · ${esc(WORDS.en.loading)}</div>`;
  await readCloud();
  // A cloud declared and no account behind it: the gate. No cloud at all
  // (an older engine) plays from the file here, as before.
  if (cloud && !cloud.signed_in) return gate();
  await enter();
}

window.addEventListener('focus', () => { if (look) refresh(); });
// The voice budget's senses: a tap or a key is play; every 5 s the held
// moments are weighed and the idle word considered (voice.js).
document.addEventListener('pointerdown', () => voice.input(), { capture: true, passive: true });
document.addEventListener('keydown', () => voice.input(), { capture: true, passive: true });
setInterval(() => voice.tick({ visible: document.visibilityState === 'visible', busy: streaming || saying || Boolean(view.ask), idleFact: IDLE_FACT }), 5000);
boot();
