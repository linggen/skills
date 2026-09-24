// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only things the page itself reports are a board or a bout the player
// played. Every other tap on the stage — Buy, a place, a practice card — is
// a word to Ling, sent as the player's own line; Ling and the rules do the rest.

import '/shared/chat-bridge.js';
import { listSkillSessions, pickResumable, fetchCloud, syncCloud, signIn } from '/shared/api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { act, begin, foeStep, foeTurn, idle, missingCards, offers as boutOffers, tokenOf, view as boutView } from './battle.js';
import { stageCards, stageHolds } from './stage.mjs';
import { WORDS as BATTLE_WORDS, battleHtml, pickOf, spoilsHtml } from './battle-card.js';
import { banner, playLog, since } from './battle-anim.js';
import { travelHtml, wayOf, wayPoints } from './travel.js';
import { WORDS, askBarHtml, bookChipHtml, gearChipHtml, cardHtml, trayHtml, trialToldHtml, clockOf } from './cards.js';
import { esc } from './esc.js';

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Divine', 'Resolve', 'Practice', 'Branch', 'Lang', 'Summarize', 'Move', 'Trade', 'Tame', 'Inscribe', 'Make', 'Enter', 'Leave', 'Restart', 'Go', 'Undo', 'Load', 'Build', 'Travel', 'Amend', 'Art']);

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
function boardFor(taskId) {
  const task = look?.tasks?.find((t) => t.id === taskId);
  if (task?.game && task.game !== 'lianliankan') {
    const mod = gameMod(task.game);
    if (!mod) return null;
    const day = new Date().toDateString();
    if (!boards.has(taskId) || boards.get(taskId).day !== day) {
      boards.set(taskId, { taskId, mod, day, state: mod.newGame(`${day}|${look.name ?? ''}|${taskId}`, task.level ?? 1) });
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
    if (!task || task.status !== 'offered' || task.won) continue;
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
  ask: null, //          the 问询 waiting in the ask bar: its line (「说说夫诸」)
  choosing: false, //    a 抉择 tapped: its roll is in flight
  trialTold: null, //    the way taken at a 抉择, on the stage until he walks on: { place, success, line, cost }
  gearNote: null, //     a 装备 tap the rules refused, in their words, inside the popover
  opened: null, //       a board he opened from the tray: { id, place } — it stays until he walks on
  walkedOut: null, //    a fight he left that the rules would not settle: it waits on its card, not pulled back in
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

const ctx = () => ({ look, handedAge, bookRow: view.bookRow, offerRow: view.offerRow, tookOffer: view.tookOffer, bookInfo: view.bookInfo, qi: qi(), lang: lang(), words: words(), content: authored, boardFor, duelFor, artBase: artBase(), mapView: view.mapView, castFresh: view.castFresh, casting: view.casting, fateOpen: view.fateOpen, fateDraft: view.fateDraft, fateError: view.fateError, atlas: atlasPlaces?.provinces ?? null });

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

/* 遇 in the mist (his, 2026-09-22): Ling sets the moment and calls Meet
   reveal. If her turn ends first, or the page is opened on the mist with no
   turn running, the page lifts it itself — the stage is never stuck in fog. */
let streaming = false;
let veilTimer = null;
async function liftVeil() {
  clearTimeout(veilTimer); veilTimer = null;
  await write('meet', { action: 'reveal' }).catch((e) => console.warn('[lingjing] reveal', e));
  await refresh();
}
function watchVeil() {
  if (!look?.place?.meet?.veiled) { clearTimeout(veilTimer); veilTimer = null; return; }
  if (veilTimer || streaming) return;
  veilTimer = setTimeout(() => { veilTimer = null; if (look?.place?.meet?.veiled && !streaming) liftVeil(); }, 20000);
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
  const p = Math.max(0, Math.min(100, Math.round((q.now / q.max) * 100)));
  const st = q.empty ? 'empty' : p < 25 ? 'low' : p < 60 ? 'half' : 'full';
  // When he can go on again — back to the rest mark (20), not to full. The
  // rules' `rest_at` when they give it, else `returns_at`, which is the same.
  const back = q.rest_at ?? q.returns_at;
  return { st, p, now: q.now, max: q.max, refillAt: back ? Math.floor(new Date(back).getTime() / 1000) : null };
}

function qiHtml() {
  const q = qi();
  if (!q) return '';
  const w = words();
  const state = { full: w.qiFull, half: w.qiHalf, low: w.qiLow, empty: w.qiEmpty, unknown: '' }[q.st];
  return `<span class="qi" data-st="${esc(q.st)}" title="${esc(w.qi)}"><span class="lbl">${esc(w.qi)}</span>
    <i class="ring" style="--p:${Number(q.p) || 0}"></i><span class="st">${esc(state)}</span><span class="cnt">${esc(q.now)}/${esc(q.max)}</span></span>`;
}

/// 气血 on the strip only while a fight's wounds are carried (rules § 伤势):
/// at full it is noise, hurt it is the fact that decides the next fight.
function hpHtml() {
  const h = look?.health;
  if (!h || h.now >= h.max) return '';
  const w = words();
  const t = clock(h.full_at);
  // 疗伤: she tends it, once a day, when she walks with him (rules § 羁绊).
  const tend = look.companion && !look.companion.tended ? ` <button class="act tend" data-tend>${esc(w.tend)}</button>` : '';
  return `<span class="hp" title="${esc(t ? w.mendsAt.replace('{t}', t) : '')}"><span class="lbl">${esc(w.hp)}</span> <b>${esc(h.now)}/${esc(h.max)}</b>${tend}</span>`;
}

/// One line in the world while the window is spent — and the boards stay:
/// they use no model.
function statusHtml() {
  const w = words();
  const pct = look.next ? Math.min(100, Math.round((look.progress / look.next) * 100)) : 0;
  const name = look.name ? `<span class="daohao">${esc(look.name)}</span>` : '';
  return `${name}<span class="realm">${esc(look.tier.name)}</span>
    <div class="xw"><span class="lbl">${esc(w.xw)}</span><div class="bar"><i style="width:${pct || 0}%"></i></div>
      <span class="num"><span data-count="progress">${esc(look.progress)}</span>/${esc(look.next)}</span>${omenChip('progress')}</div>
    ${qiHtml()}
    ${hpHtml()}
    <span class="ls"><span class="lbl">${esc(w.ls)}</span> <b data-count="wealth">${esc(look.wealth)}</b>${omenChip('wealth')}</span>${omenChip('bout')}
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
function riseStats() {
  const now = { world: look.world?.id, tier: look.tier?.id, progress: look.progress, wealth: look.wealth, next: look.next, cast: (look.cast ?? []).map((b) => b.id),
    rank: look.tier?.name, chapter: look.chapter?.id, stamina: look.stamina?.now, resting: Boolean(look.stamina?.resting) };
  const before = shown;
  shown = now;
  // 大成就: a realm risen, a chapter opened — the stage marks it and 银月 speaks
  // at once (his, 2026-09-23: 境界突破等大成就达成时, 显示一个动画, 并让银月说点什么).
  if (before && before.world === now.world) {
    // The last point spent: 银月 sends him back to the real world to rest —
    // real life is hers, not Ling's (his rule, 2026-09-23).
    if (before.stamina > 0 && now.stamina === 0 && !before.resting) {
      const at = clock(look.stamina?.rest_at ?? look.stamina?.returns_at);
      askHer(`玩家的体力刚刚耗尽了（${at} 可以再出发）。游戏先放一放：请玩家回到现实里歇一歇，起身走走、喝口水。说一两句。`, `The player's stamina just ran out (ready to go again at ${at}). The game waits: send them back to the real world to rest — stand up, walk, drink some water. A line or two.`, 'relaxed');
    }
    if (now.rank && before.rank && now.rank !== before.rank) feat('rise', now.rank, before.rank);
    else if (now.chapter && before.chapter && now.chapter !== before.chapter) feat('chapter', look.chapter.title);
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

/// A great moment on the stage: a gold seal, light behind it, held long
/// enough to read — then 银月 speaks, asked, at once.
function feat(kind, name, from = '') {
  const w = words();
  const el = document.createElement('div');
  el.className = 'feat';
  el.innerHTML = `<i class="rays"></i><div class="featbox"><b>${esc(kind === 'rise' ? w.featRise : w.featChapter)}</b><span>${esc(name)}</span></div>`;
  el.style.animationDelay = `${Math.max(0, riseAfter - performance.now())}ms`;
  $('view')?.appendChild(el);
  setTimeout(() => el.remove(), 4200 + Math.max(0, riseAfter - performance.now()));
  if (kind === 'rise') askHer(`玩家刚刚突破了，从${from}到了${name}。这是件大事，你就在玩家身边，说几句。`, `The player has just broken through, from ${from} to ${name}. It is a great moment and you are beside them; say a few words.`, 'happy');
  else askHer(`新的一章开了：${name}。你陪玩家一路走到这里，说几句。`, `A new chapter opens: ${name}. You have walked with the player to here; say a few words.`, 'happy');
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
  tellYinyue(`收服了${beasts.map((b) => b.name).join('、')}，它从此随行`, `Won over ${beasts.map((b) => b.name).join(', ')} — it walks with us now`, { big: true, mood: 'happy' });
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
  riseFrame = rising.size ? requestAnimationFrame(paintRise) : null;
  if (!rising.size) document.querySelectorAll('.gain').forEach((g) => g.remove());
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
    : e.root && e.spell ? `${e.root.name}${e.spell > 0 ? '↑' : '↓'}` : '';
  if (!label) return '';
  const title = `${w.omen} · ${d.hexagram.name} · ${d.grade.name} · ${d.ask.name}`;
  return `<span class="omenchip ${esc(d.grade.id)}" title="${esc(title)}">${esc(d.hexagram.name)} ${esc(label)}</span>`;
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
  const spoils = (view.doNote ? `<div class="donote">${esc(view.doNote)}</div>` : '') + (view.trialTold ? trialToldHtml(view.trialTold, ctx()) : '') + (view.spoils ? spoilsHtml(view.spoils, spoilsCtx()) : '');
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
  const { head, queue, tail } = splitStage(cards);
  return spoils + head.map(drawCard).join('') + queueHtml(queue) + tail.map(drawCard).join('') + (stageHolds(look, cards) ? roadsHtml() : '');
}

/* 眼前 — one thing to do at a time (his, 2026-09-24: 「用一个队列，一个完成，
   再从队列取出下一个显示，不要都堆放在UI上」). The things that ask a tap wait
   in this order; the first stands on the stage, 下一件 › puts it off to the end
   of the line, and walking on starts the line again. The goal line, an empty
   pool and what Ling showed of the place stay where they are. */
const QUEUE = ['handed', 'quest', 'veil', 'find', 'trial', 'chance', 'journey', 'offer', 'duel', 'lundao', 'board'];
const HEAD = new Set(['building', 'empty', 'goal']);
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
  const chips = near.map((p) => `<button class="act say" data-say="${esc(w.sayGo.replace('{name}', p.name))}">${esc(p.name)}</button>`).join('');
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
  const strip = statusHtml();
  if (strip !== drawnStrip) { $('status').innerHTML = strip; drawnStrip = strip; }
  riseStats();
  watchTravel();
  // A fight takes the whole column: the backdrop, the tray and Yinyue's own
  // body give way, because she is IN the fight as a card and the cards need
  // the room (his, 2026-09-18). It all comes back when the fight ends.
  document.body.classList.toggle('fighting', Boolean(bout));
  $('place').textContent = look.scene?.place ?? look.place?.name ?? look.chapter?.title ?? '';
  // She is always at the player's side: on the stage whenever the game is
  // open, scene or road, not only where a scene casts her.
  $('stage').hidden = false;
  // She stands there only once she has been found (his rule, 2026-09-17).
  // Out on a 历练 she is not on the stage; her name says where she went.
  const away = look.companion?.journey && !look.companion.journey.back;
  const her = Boolean(look.companion) && !bout && !away;
  stageYinyue(her, Boolean(bout) && Boolean(look.companion) && !away);
  $('stageName').textContent = her ? look.companion.name : away ? `${look.companion.name} · ${words().journeyAway}` : '';
  const cast = look.divination ? JSON.stringify(look.divination.throws) : null;
  keep({ castFresh: view.castSeen !== undefined && cast !== null && cast !== view.castSeen, castSeen: cast });
  if (view.castFresh) readingByHer(look.divination);
  $('focus').innerHTML = focusHtml();
  keep({ castFresh: false });
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
    document.querySelectorAll('[data-say]').forEach((el) => {
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
  if (!kept.length) return;
  payingKept = true;
  try {
    for (const t of kept) await payWin(t.id);
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

/* A line of the book, opened: `Quest info` is a read (45 ms, no model). */
async function openRow(id) {
  if (view.bookRow === id) { show({ bookRow: null }); return; }
  show({ bookRow: id, bookInfo: view.bookInfo?.id === id ? view.bookInfo : null });
  const info = await verb('quest', { action: 'info', id }).catch(() => null);
  if (info?.ok && view.bookRow === id) show({ bookInfo: info });
}

/* 拾遗: taken or left by the rules at once — the bag and the strip show it. */
async function takeMeet(action) {
  const r = await write('meet', { action }).catch(failed);
  if (!r.ok) keep({ doNote: refusal(r) });
  await refresh();
  // The 遇 is finished, so the turn goes to Ling: a line for what happened,
  // and — nothing holding the stage now — her question where next (his,
  // 2026-09-21: finish the meet first; the last step asks where to go).
  if (r.ok) await report(action === 'take' ? '[scene] meet taken' : '[scene] meet passed');
}

/* 组牌 — a tap puts a card in the ten or takes it out; the popover redraws
   from the rules' own answer, and a refusal is said inside it. */
async function deckTap(args) {
  const r = await write('deck', args).catch(failed);
  show({ gear: r.ok ? r.gear : view.gear, gearNote: r.ok ? null : refusal(r) });
}

/* 历练 — send her, call her back, take what she brought. She says her own
   goodbye and tells her own journey (asked moments: she answers at once). */
/// Resolves true when she will hear it; false when nobody will (the pet off
/// answers 503 at once) — a page that waits on her must not wait then.
function askHer(zh, en, mood) {
  return fetch('/api/yinyue/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'lingjing', text: lang() === 'en' ? en : zh, asked: true, mood }),
  }).then((res) => res.ok).catch((e) => { console.warn('[lingjing] yinyue', e); return false; });
}
async function journeyVerb(action, extra = {}) {
  const r = await write('journey', { action, ...extra }).catch(failed);
  if (!r.ok) keep(view.gearOpen ? { gearNote: refusal(r) } : { doNote: refusal(r) });
  if (view.gearOpen) { const g = await verb('gear', {}).catch(() => null); keep({ gear: g?.gear ?? view.gear }); }
  await refresh();
  return r;
}
async function sendHer(hours) {
  const r = await journeyVerb('send', { hours });
  if (r.ok) askHer(`玩家让你去${r.sent.place.name}历练 ${hours} 个时辰，你这就动身。`, `The player is sending you to ${r.sent.place.name} for ${hours} hours; you set off now.`, 'happy');
}
/* Called back early: she comes home with a little, and tells it her way. */
async function recallHer() {
  const r = await journeyVerb('recall');
  if (!r.ok) return;
  const items = r.brought.filter((b) => b.id).map((b) => ({ id: b.id, name: b.name }));
  if (items.length) keep({ spoils: { place: look?.place?.id ?? null, cards: [], items } });
  const t = r.out_min >= 60 ? `${Math.floor(r.out_min / 60)} 个时辰${r.out_min % 60 ? `${r.out_min % 60} 分` : ''}` : `${r.out_min} 分`;
  const te = r.out_min >= 60 ? `${Math.floor(r.out_min / 60)}h${r.out_min % 60 ? ` ${r.out_min % 60}m` : ''}` : `${r.out_min}m`;
  const seen = r.brought.map((b) => b.line).join(' ');
  const got = [...items.map((i) => i.name), r.wealth ? `${r.wealth} 灵石` : ''].filter(Boolean).join('、');
  const gotEn = [...items.map((i) => i.name), r.wealth ? `${r.wealth} stones` : ''].filter(Boolean).join(', ');
  askHer(`玩家提前把你从${r.place.name}叫了回来：原定 ${r.hours} 个时辰，才走了 ${t}。${seen ? `路上所见：${seen} ` : ''}${got ? `只带回：${got}。` : '这趟什么也没带回。'}今日不能再出门。你回到玩家身边，跟玩家说几句。`,
    `The player called you back early from ${r.place.name}: ${r.hours} hours planned, ${te} gone. ${seen ? `On the road: ${seen} ` : ''}${gotEn ? `You bring only: ${gotEn}.` : 'You bring nothing back.'} No second trip today. You are beside the player again; say a few words to them.`);
  render();
}
async function receiveHer() {
  const r = await journeyVerb('receive');
  if (!r.ok) return;
  const cards = r.card ? [r.card] : [], items = r.brought.filter((b) => b.id).map((b) => ({ id: b.id, name: b.name }));
  keep({ spoils: { place: look?.place?.id ?? null, cards, items } });
  const seen = r.brought.map((b) => b.line).join(' ');
  askHer(`你从${r.place.name}历练回来（${r.hours} 个时辰）。路上所见：${seen} 带回：${[...items.map((i) => i.name), r.card?.name, `${r.wealth} 灵石`].filter(Boolean).join('、')}。讲给玩家听。`,
    `You are back from ${r.place.name} (${r.hours} hours). On the road: ${seen} Brought: ${[...items.map((i) => i.name), r.card?.name, `${r.wealth} stones`].filter(Boolean).join(', ')}. Tell the player.`, 'happy');
  render();
}

/* 机缘 — 收下 is a page tap; what it left stands on the stage, and 银月
   hears it (a big moment: she was there for the run to reach it). */
async function takeChance() {
  const r = await write('chance', { action: 'take' }).catch(failed);
  if (!r.ok) { keep({ doNote: refusal(r) }); await refresh(); return; }
  if (r.card) keep({ spoils: { place: look?.place?.id ?? null, cards: [r.card], items: [] } });
  const where = look?.chance?.place?.name ?? '';
  tellYinyue(`赶上了${where}的机缘，得了${r.card?.name ?? '些东西'}`, `Made it to the chance at ${where} in time — ${r.card?.name ?? 'something'} gained`, { big: true, mood: 'happy' });
  await refresh();
}

/* 机缘's clock: the row counts down by the minute, and once — with half an
   hour left and him somewhere else — 银月 hears it; she decides whether to
   say so. */
let chanceTold = null;
setInterval(() => {
  // She comes back while the page is open: redraw, and the stage shows it.
  const j = look?.companion?.journey;
  if (j?.until && !j.back && new Date(j.until) <= Date.now()) { refresh(); return; }
  const c = look?.chance;
  if (!c || c.taken || c.missed || !c.until) return;
  const left = Math.ceil((new Date(c.until) - Date.now()) / 60000);
  if (left <= 30 && left > 0 && !c.here && chanceTold !== c.until) {
    chanceTold = c.until;
    tellYinyue(`${c.place.name}的机缘只剩半个时辰了`, `The chance at ${c.place.name} has half an hour left`, { mood: 'neutral' });
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
  const cost = r.lost?.hp ? w.trialHurt.replace('{n}', r.lost.hp) : r.lost?.wealth ? w.trialPoorer.replace('{n}', r.lost.wealth) : '';
  keep({ trialTold: { place: look?.place?.id ?? null, success: r.success, line: r.line, cost } });
  await refresh();
  if (r.success) tellYinyue(`路上的抉择成了：${r.line}`, `A choice on the road went well: ${r.line}`, { mood: 'happy' });
  else tellYinyue(`路上的抉择失手了：${r.line}`, `A choice on the road went wrong: ${r.line}`, { mood: 'sad' });
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
function openAsk(line) {
  keep({ ask: line });
  const bar = $('askbar');
  bar.innerHTML = askBarHtml(line, words());
  bar.hidden = false;
  $('askField').focus();
}
function closeAsk() {
  keep({ ask: null });
  $('askbar').hidden = true;
  $('askbar').innerHTML = '';
}
function sendAsk() {
  if (!view.ask) return;
  const q = $('askField').value.trim();
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
  if (e.key === 'Escape') { if (view.ask) closeAsk(); else if (view.bookOpen || view.gearOpen) show({ bookOpen: false, gearOpen: false }); }
  if (e.key !== 'Enter' && e.key !== ' ') return;
  for (const [sel, open] of KEY_ROWS) {
    const row = e.target.closest?.(sel);
    if (row && e.target === row) { e.preventDefault(); open(row); return; }
  }
});

/* 命格 — set on the card, never in the chat. No turn for Ling: she reads it on
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
  askHer(`玩家刚在灵根卡上定了命格：属${f.zodiac.name}，日主${f.stem.name}${f.element.name}，天生亲近${f.element.name}。它给的：斗法时同属${f.element.name}的一击，每场减半一次；起卦时下卦属${f.element.name}，卦象偏向玩家。用你自己的话告诉玩家，一两句。`,
    `The player has just set their birth sign on the roots card: year of the ${f.zodiac.name}, day master ${f.stem.name} (${f.element.name}), at home in ${f.element.name}. What it gives: once a fight, a blow of ${f.element.name} is halved; a cast whose lower trigram is ${f.element.name} leans their way. Tell them in your own words, a line or two.`, 'happy');
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
  ['[data-book]', () => show({ bookOpen: !view.bookOpen, gearOpen: false })],
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
  ['[data-nourish]', busy('nourish', () => onNourish())],
  ['[data-tend]', busy('tend', () => onTend())],
  ['[data-spoils-close]', () => show({ spoils: null })],
  // Inside a fight the stage belongs to the fight: a click is a place on it.
  ['[data-spot]', (el) => {
    if (!bout) return false;
    onBoutTap({ kind: el.dataset.spot, index: Number(el.dataset.index ?? -1) });
  }],
  ['[data-duel-start]', (el) => run(`duel:${el.dataset.duelStart}`, () => { keep({ walkedOut: null }); return onDuelStart(el.dataset.duelStart); })],
  // 问询: the one word that costs a model turn opens the ask bar; nothing is
  // sent until the player says so.
  ['[data-ask]', (el) => openAsk(el.dataset.ask)],
  ['[data-ask-send]', () => sendAsk()],
  ['[data-ask-close]', () => closeAsk()],
  ['[data-meet]', (el) => run(`meet:${el.dataset.meet}`, () => takeMeet(el.dataset.meet))],
  ['[data-divine]', (el) => run('divine', () => castByPage(el.dataset.divine))],
  ['[data-chance]', busy('chance', () => takeChance())],
  ['[data-journey]', (el) => run('journey', () => sendHer(Number(el.dataset.journey)))],
  ['[data-journey-recall]', busy('journey', () => recallHer())],
  ['[data-journey-receive]', busy('journey', () => receiveHer())],
  ['[data-trial]', (el) => run('trial', () => chooseWay(Number(el.dataset.trial)))],
  ['[data-drop]', (el) => run(`drop:${el.dataset.drop}`, () => dropErrand(el.dataset.drop))],
  // A line of the book opens where it lies — the page reads it from the rules.
  ['[data-offerrow]', (el, e) => { if (e.target.closest('button')) return false; toggleOffer(el.dataset.offerrow); }],
  ['[data-bookrow]', (el, e) => { if (e.target.closest('button')) return false; openRow(el.dataset.bookrow); }],
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
  ['[data-play]', (el) => show({ opened: { id: el.dataset.play, place: look?.place?.id ?? null }, qSkip: view.qSkip.filter((k) => k !== `board:${el.dataset.play}`) })],
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
function tellYinyue(zh, en, { big = false, mood = null } = {}) {
  if (!look?.companion) return;
  fetch('/api/yinyue/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'lingjing', text: lang() === 'en' ? en : zh, big, ...(mood ? { mood } : {}) }),
  }).catch((e) => console.warn('[lingjing] yinyue event', e));
}

/* The turns of a fight worth her knowing: the beast letting its 杀招 go, and
   the player's 气血 falling to a quarter — each once a fight. */
function fightMoments() {
  const st = bout?.st, foe = bout?.brief?.creature?.name ?? '';
  if (!st) return;
  if (st.foe.charge?.phase === 'spent' && !bout.told?.unleash) {
    bout.told = { ...bout.told, unleash: true };
    const sig = st.foe.signature?.name ?? {};
    tellYinyue(`${foe}放出了杀招「${sig.zh ?? ''}」`, `${foe} let its ${sig.en ?? 'signature'} go`);
  }
  if (st.outcome === 'open' && st.you.hp * 4 <= st.you.hpMax && !bout.told?.low) {
    bout.told = { ...bout.told, low: true };
    tellYinyue(`斗${foe}，气血只剩不到三成了`, `Fighting ${foe}, down to a quarter of their Life or less`);
  }
}

/* How it ended, for her: a loss and an elite won are the big ones. */
function toldOutcome(brief, outcome) {
  const c = brief?.creature ?? {}, foe = c.name ?? '';
  if (outcome === 'won' && c.elite) return tellYinyue(`打赢了精英${foe}`, `Beat ${foe}, an elite`, { big: true, mood: 'happy' });
  if (outcome === 'won') return tellYinyue(`降服了${foe}`, `Beat ${foe}`, { mood: 'happy' });
  if (outcome === 'lost') return tellYinyue(`输给了${foe}，气血耗尽，只能回去养伤`, `Lost to ${foe}, no Life left — rest before the next`, { big: true, mood: 'sad' });
  if (outcome === 'withdrew') tellYinyue(`${foe}力竭遁走，这一仗不算赢`, `${foe} ran out of breath and left — not a win`);
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
      if (r.refused === 'wounded') tellYinyue('伤太重，没能出手', 'Too hurt to fight', { mood: 'sad' });
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
  toldOutcome(brief, r.outcome);
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
  await report(`[scene] ${r.outcome} ${id}`);
  await refresh();
}

/// 疗伤 — she looks at the wound and mends some of it; then she says what she
/// will, in her own time (a big moment: the screen settles, she speaks).
async function onTend() {
  const r = await write('tend', {}).catch(failed);
  if (r.ok) tellYinyue(`让她看了看伤，她替你调理了一番，气血回了 ${r.mended}`, `Let her look at the wound; she tended it, ${r.mended} Life back`, { big: true, mood: 'relaxed' });
  else keep({ doNote: refusal(r) });
  await refresh();
}

/// 温养 — once a day, a tap. No model decides it and no turn is spent on it:
/// the page asks the rules and re-reads; Ling reads it on her next Look.
async function onNourish() {
  const r = await write('nourish', {}).catch(failed);
  if (!r.ok) keep({ doNote: refusal(r) });
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

function askedQuestion(args) {
  try {
    const a = typeof args === 'string' ? JSON.parse(args) : args;
    return a?.questions?.[0]?.question ?? null;
  } catch {
    return null; // still streaming: the start of the call, before its args are whole
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
    // The cast's own question (所问何事) keeps the coins in the air; any
    // other question means no cast is coming this turn.
    if (view.casting && askedQuestion(payload.args) !== words().castAsk) keep({ casting: false });
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
      streaming = false;
      const before = look;
      // Her turn is over: a 遇 still in the mist is lifted by the page — she
      // set the moment and forgot the reveal, or never got to it.
      refresh().then(() => cheer(before)).then(() => { if (look?.place?.meet?.veiled) liftVeil(); });
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

/// 起卦 from the card: the rules cast, the card shows it, 银月 reads it.
async function castByPage(ask) {
  if (view.casting) return;
  show({ casting: true, bookOpen: false });
  const r = await write('divine', { ask }).catch(failed);
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
  const text = zh
    ? `为「${d.ask.name}」起了一卦：得《${h.name}》${to}，${d.grade.name}。卦辞：${h.judgment}${moving}。`
    : `A cast for "${d.ask.name}": ${h.name}${to}, ${d.grade.name}. The judgment: ${h.judgment}.`;
  const mood = { great: 'happy', good: 'happy', even: 'relaxed', ill: 'sad', dire: 'sad' }[d.grade.id] ?? 'neutral';
  fetch('/api/yinyue/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app: 'lingjing', text, asked: true, mood }),
  }).catch((e) => console.warn('[lingjing] yinyue reading', e));
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
  tellYinyue(`刚才这一段，他得了${zh}`, `Just now he gained ${zh.replace('，', ', ')}`, { mood: 'happy' });
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
  // Her greeting first: when she gives it, it is the opening; Ling waits.
  const greeted = await greetByHer();
  if (fresh) openWith(chat?.getSessionId(), greeted);
}

/// 问候 — the day's first opening is hers (rules § 问候): the rules say
/// whether she has greeted today and hand over what they know; she speaks.
async function greetByHer() {
  if (!look?.companion) return false;
  const r = await write('greet', {}).catch(() => null);
  if (!r?.ok || !r.first) return false;
  const who = r.name ?? '';
  const zh = `${who}今天第一次打开灵境。你知道的：${r.facts.join('；')}。像见到对方那样，打个招呼 —— 挑一两件说，不必都提。`;
  const en = `${who} has just opened Lingjing for the first time today. What you know: ${r.facts.join('; ')}. Greet the player as you would on seeing them — pick one or two, not all.`;
  // Nobody to say it (pet off): Ling opens instead.
  if (!(await askHer(zh, en, 'happy'))) return false;
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
boot();
