// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only things the page itself reports are a board or a bout the player
// played. Every other tap on the stage — Buy, a place, a practice card — is
// a word to Ling, sent as the player's own line; Ling and the rules do the rest.

import './chat-bridge.js';
import { listSkillSessions, pickResumable, fetchCloud, syncCloud, signIn } from './api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { act, begin, foeStep, idle, missingCards, offers as boutOffers, tokenOf, view as boutView } from './battle.js';
import { stageCards, stageHolds } from './stage.mjs';
import { WORDS as BATTLE_WORDS, battleHtml, pickOf } from './battle-card.js';
import { banner, playLog, since } from './battle-anim.js';
import { WORDS, askBarHtml, bookChipHtml, cardHtml, trayHtml, esc, yinyueLine } from './cards.js';

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Look', 'Resolve', 'Practice', 'Branch', 'Lang', 'Summarize', 'Move', 'Trade', 'Tame', 'Inscribe', 'Make', 'Enter', 'Leave', 'Restart', 'Go', 'Undo', 'Load', 'Build', 'Travel', 'Amend', 'Art']);

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

function boardFor(taskId) {
  if (!boards.has(taskId)) {
    const herbs = authored.herbs.map((h) => ({ id: h.id, tile: h.tile, label: h.name[lang()] }));
    boards.set(taskId, newBoard(herbs, taskId));
  }
  return boards.get(taskId);
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
  bookSeen: null, //     how many lines the book held when last drawn: one more and the chip says so
  bookFresh: false,
  bookRow: null, //      the line of the book that is open
  bookInfo: null, //     what the rules say of it (`Quest info`), read on the tap
  ask: null, //          the 问询 waiting in the ask bar: its line (「说说夫诸」)
};
const keep = (patch) => Object.assign(view, patch);
function show(patch) { keep(patch); render(); }
const duelFor = (id) => (view.duelSay.id === id ? view.duelSay : { text: null });

const ctx = () => ({ look, bookRow: view.bookRow, bookInfo: view.bookInfo, qi: qi(), lang: lang(), words: words(), content: authored, boardFor, duelFor, artBase: `../worlds/${look?.world?.id ?? 'jiuding'}/`, mapView: view.mapView, castFresh: view.castFresh, casting: view.casting, fateOpen: view.fateOpen, fateDraft: view.fateDraft, fateError: view.fateError, atlas: atlasPlaces?.provinces ?? null });

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
  authored = { world: world.id, dir: baseDir, creatures: all, herbs: herbs.herbs, hexagrams: hexagrams.hexagrams, traits: roots, dictionary, cards };
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
  keep({ tapped: null });
  document.querySelectorAll('.busy').forEach((el) => el.classList.remove('busy'));
}

/// Re-read the game. Entering a new scene puts its own cards on the scene,
/// so a creature is pictured even if Ling forgets to Show it.
/* One re-read at a time, and one more after it if something asked while it was
   in flight. A turn can run four writers in a row; that used to be four
   overlapping Looks racing to set `look`, each 1.5s after its tool began —
   a guess at when the rules had finished writing. A verb costs about 45ms, so
   there is nothing to save by waiting; what matters is not to stampede. */
let reading = null;
let readAgain = false;
function refreshSoon(ms = 400) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, ms);
}
let refreshTimer = null;

function refresh() {
  if (reading) { readAgain = true; return reading; }
  reading = readOnce().finally(() => {
    reading = null;
    if (readAgain) { readAgain = false; refresh(); }
  });
  return reading;
}

async function readOnce() {
  try {
    [look] = await Promise.all([verb('look'), readCloud()]);
    if (look.divination) keep({ casting: false });
    await loadContent(look.world);
  } catch (e) {
    console.warn('[lingjing] look', e);
    if (!authored) $('focus').innerHTML = `<div class="loading">${WORDS.zh.offline} · ${WORDS.en.offline}</div>`;
    return;
  }
  // The stage came back with Look — what Ling showed, what the scene was
  // authored with, what the place holds. The optimistic copy has served its
  // purpose.
  keep({ focus: [] });
  // A fight the save still holds open comes back: without this the page shows
  // the world while Ling waits for a fight nobody can see, and she holds still
  // for ever. The rules do not charge the day's 灵气 twice for it.
  if (look.fight?.open && !bout) await onDuelStart(look.fight.game);
  render();
}

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
  return { st, p, now: q.now, max: q.max, refillAt: q.returns_at ? Math.floor(new Date(q.returns_at).getTime() / 1000) : null };
}

function qiHtml() {
  const q = qi();
  if (!q) return '';
  const w = words();
  const state = { full: w.qiFull, half: w.qiHalf, low: w.qiLow, empty: w.qiEmpty, unknown: '' }[q.st];
  return `<span class="qi" data-st="${q.st}" title="${w.qi}"><span class="lbl">${w.qi}</span>
    <i class="ring" style="--p:${q.p}"></i><span class="st">${esc(state)}</span><span class="cnt">${q.now}/${q.max}</span></span>`;
}

/// One line in the world while the window is spent — and the boards stay:
/// they use no model.
function statusHtml() {
  const w = words();
  const pct = look.next ? Math.min(100, Math.round((look.progress / look.next) * 100)) : 0;
  const name = look.name ? `<span class="daohao">${esc(look.name)}</span>` : '';
  return `${name}<span class="realm">${esc(look.tier.name)}</span>
    <div class="xw"><span class="lbl">${w.xw}</span><div class="bar"><i style="width:${pct}%"></i></div>
      <span class="num"><span data-count="progress">${look.progress}</span>/${look.next}</span>${omenChip('progress')}</div>
    ${qiHtml()}
    <span class="ls"><span class="lbl">${w.ls}</span> <b data-count="wealth">${look.wealth}</b>${omenChip('wealth')}</span>${omenChip('bout')}
    ${bookChipHtml(ctx(), view.bookOpen, view.bookFresh)}
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
const RISE_MS = 1100, GAIN_MS = 2400;
function riseStats() {
  const now = { world: look.world?.id, tier: look.tier?.id, progress: look.progress, wealth: look.wealth, next: look.next };
  const before = shown;
  shown = now;
  if (before && before.world === now.world) {
    for (const key of ['progress', 'wealth']) {
      if (key === 'progress' && before.tier !== now.tier) continue;
      if (now[key] > before[key]) rising.set(key, { from: before[key], to: now[key], start: performance.now(), next: now.next });
    }
  }
  if (rising.size) paintRise();
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
  // A fight takes the stage: while one is open, nothing else is on it, and the
  // chat beside it keeps talking (design.md § 斗法在主界面里).
  if (bout) return battleHtml(boutView(bout.st), boutOffers(bout.st), boutCtx(), bout.picked, bout.openLog, bout.note, bout.help);
  // A line running under his feet takes the stage (his law, 2026-09-18:
  // 「最好左面 webview 显示一个 card，或者在一个故事线或任务中走，显示相关内容」).
  // Standing at the water with the bell in hand, the stage said 摇一摇铃 — and
  // beside it offered him the day's coins, which belong to no part of this.
  // So while the step is his to take HERE, the page adds nothing of its own:
  // Ling's cards are hers to choose, and the quest's card is the line.
  // ONE list, and the rules made it (stage.mjs) — the same one they measured
  // the chat's question against, so nothing stands in both places. Only while
  // Ling's Show is still in flight does the page work it out for itself.
  const cards = view.focus.length ? stageCards(look, { focus: view.focus }) : (look.stage ?? []);
  return cards.map((c) => drawCard(c)).join('') + (stageHolds(look, cards) ? roadsHtml() : '');
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

function draw() {
  if (!look || !authored) return;
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
  stageYinyue(her);
  $('stageName').textContent = her ? look.companion.name : '';
  const cast = look.divination ? JSON.stringify(look.divination.throws) : null;
  keep({ castFresh: view.castSeen !== undefined && cast !== null && cast !== view.castSeen, castSeen: cast });
  $('focus').innerHTML = focusHtml();
  keep({ castFresh: false });
  // The tray holds the world's boards; with none today it is not there at all
  // — 「今日无事」 under a book with things in it was a contradiction.
  $('trayTitle').textContent = w.tray;
  $('tray').innerHTML = trayHtml(ctx());
  $('tray').parentElement.hidden = !$('tray').innerHTML;
  // A turn with nothing left in it ends itself after a beat long enough to
  // read the board — pressing the button is always faster (his, 2026-09-18).
  clearTimeout(idleTimer);
  if (bout && idle(bout.st) && !bout.picked && !bout.help) idleTimer = setTimeout(() => endBoutTurn(), 1400);
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
}

/* What the fight's card draws itself from: this world's cards, this world's
   pictures, and the words of the language in play. */
function boutCtx() {
  const c = bout.brief.creature;
  return {
    catalog: Object.fromEntries((authored?.cards?.cards ?? []).map(x => [x.id, { ...x, name: x.name?.[lang()] ?? x.name?.zh ?? x.id }])),
    artBase: `../worlds/${look.world?.id ?? 'jiuding'}/`,
    lang: lang(), words: BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh,
    board: bout.st.mode.board,
    title: words().subdue ?? '降妖',
    foeName: c.name, foeArt: c.art ? `../worlds/${look.world?.id ?? 'jiuding'}/${c.art}` : null,
    youName: look.name ?? '',
  };
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
  setTimeout(() => { if (saying) turnEnded(); }, 90000);
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
  const r = await verb('meet', { action }).catch((e) => ({ ok: false, error: String(e) }));
  await refresh();
  // The 遇 is finished, so the turn goes to Ling: a line for what happened,
  // and — nothing holding the stage now — her question where next (his,
  // 2026-09-21: finish the meet first; the last step asks where to go).
  if (r.ok) await report(action === 'take' ? '[scene] meet taken' : '[scene] meet passed');
}

/* 撂下 is the rules' to do; Ling reads the book in her next Look. */
async function dropErrand(id) {
  await verb('quest', { action: 'drop', id }).catch((e) => console.warn('[lingjing] drop', e));
  keep({ bookRow: null, bookInfo: null });
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
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'askField' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendAsk(); }
  if (e.key === 'Escape') { if (view.ask) closeAsk(); else if (view.bookOpen) show({ bookOpen: false }); }
  const row = e.target.closest?.('[data-bookrow]');
  if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); openRow(row.dataset.bookrow); }
});

async function setFate(kind) {
  const args = kind === 'birth' ? { birth: view.fateDraft } : { [kind]: 'true' };
  if (kind === 'birth' && !view.fateDraft) { show({ fateError: true }); return; }
  const r = await verb('fate', args).catch((e) => ({ ok: false, error: String(e) }));
  if (!r.ok) { show({ fateError: r.refused === 'birth-invalid' }); return; }
  keep({ fateOpen: false, fateDraft: '', fateError: false });
  await refresh();
  await report(kind === 'decline' ? '[scene] fate declined' : '[scene] fate set');
}
document.addEventListener('input', (e) => { if (e.target.id === 'fate-birth') keep({ fateDraft: e.target.value, fateError: false }); });

document.addEventListener('click', (e) => {
  // The 事 chip opens its popover; a tap anywhere else puts it away, and then
  // does whatever it was for.
  if (e.target.closest('[data-book]')) { show({ bookOpen: !view.bookOpen }); return; }
  if (view.bookOpen && !e.target.closest('.bookpop') && !e.target.closest('#askbar')) show({ bookOpen: false });
  // 问询: the one word that costs a model turn opens the ask bar; nothing is
  // sent until the player says so.
  const asking = e.target.closest('[data-ask]');
  if (asking) { openAsk(asking.dataset.ask); return; }
  if (e.target.closest('[data-ask-send]')) { sendAsk(); return; }
  if (e.target.closest('[data-ask-close]')) { closeAsk(); return; }
  const found = e.target.closest('[data-meet]');
  if (found) { takeMeet(found.dataset.meet); return; }
  const dropped = e.target.closest('[data-drop]');
  if (dropped) { dropErrand(dropped.dataset.drop); return; }
  // A line of the book opens where it lies — the page reads it from the rules.
  const row = e.target.closest('[data-bookrow]');
  if (row && !e.target.closest('button')) { openRow(row.dataset.bookrow); return; }
  const sw = e.target.closest('[data-lang]');
  if (sw) { switchLang(sw.dataset.lang); return; }
  // 命格: the birthday is read here, by the rules on this machine — never
  // sent to the chat; Ling hears only that it was set.
  if (e.target.closest('[data-fate-open]')) { show({ fateOpen: true }); return; }
  const fateBtn = e.target.closest('[data-fate]');
  if (fateBtn) { setFate(fateBtn.dataset.fate); return; }
  // Near or whole: only how the map is looked at, so the page answers it.
  const lens = e.target.closest('[data-mapview]');
  if (lens) {
    const to = lens.dataset.mapview;
    (to === 'province' ? Promise.resolve() : loadAtlas()).then(() => show({ mapView: to }));
    return;
  }
  const spoken = e.target.closest('[data-say]');
  if (spoken && !e.target.closest('[data-play],[data-tile],[data-duel-start],[data-spot]')) {
    if (spoken.matches(':disabled')) return;
    const line = spoken.dataset.say;
    show({ tapped: line, bookOpen: false, ...(line === words().sayCast ? { casting: true } : {}) });
    say(line);
    return;
  }
  const play = e.target.closest('[data-play]');
  if (play) {
    show({ focus: [{ card: 'board', id: play.dataset.play }] });
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

/* ── 降妖: the page plays the fight, the rules decide it ── */

async function onDuelStart(id) {
  const r = await verb('duel', { id });
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
  if (missingCards(brief.setup, boutCatalog()).length) {
    authored = null;
    await loadContent(look.world);
  }
  const unknown = missingCards(brief.setup, boutCatalog());
  if (unknown.length) {
    console.error('[lingjing] no card row for', unknown.join(', '));
    show({ duelSay: { id, text: (BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh).stale } });
    return;
  }
  keep({ duelSay: { id: null, text: null } });
  bout = { id, brief, setup: brief.setup, st: begin(brief.setup, boutCatalog()), actions: [], picked: null, openLog: false, help: false, note: null };
  render();
}

const boutCatalog = () => Object.fromEntries((authored?.cards?.cards ?? []).map(x => [x.id, { ...x, name: x.name?.[lang()] ?? x.name?.zh ?? x.id }]));

/* One tap inside the fight. The page plays it out and draws it; only when the
   fight is over does it hand the whole list of actions to the rules, which
   replay them and settle — win, loss, or the beast walking away. */
async function onBoutTap(spot) {
  if (!bout) return;
  if (spot.kind === 'help' || spot.kind === 'help-bg') { bout.help = !bout.help; return drawNow(); }
  if (spot.kind === 'more') { bout.openLog = !bout.openLog; return drawNow(); }
  if (bout.st.outcome !== 'open') return;
  bout.note = null;
  const out = pickOf(bout.picked, spot, boutView(bout.st), boutCatalog());
  if (out.quit) return settleBout('lost');
  if (out.clear) { bout.picked = null; return drawNow(); }
  if (out.pick) { bout.picked = out.pick; return drawNow(); }
  if (out.action.kind === 'end') return endBoutTurn();
  const mark = bout.st.log.length;
  const res = act(bout.st, out.action, 'you');
  bout.picked = null;
  if (!res.ok) { bout.note = res.why; return drawNow(); }
  bout.actions.push(tokenOf(out.action));
  drawNow();
  await playLog(document.querySelector('.battle'), since(bout.st.log, mark), { words: boutCtx().words });
  if (bout.st.outcome !== 'open') return settleBout(bout.st.outcome);
  drawNow();
}

/* The creature answers a move at a time, drawn as each lands. */
async function endBoutTurn() {
  const mark = bout.st.log.length;
  if (!act(bout.st, { kind: 'end' }, 'you').ok) return;
  bout.actions.push('end');
  drawNow();
  await playLog(document.querySelector('.battle'), since(bout.st.log, mark), { words: boutCtx().words });
  if (bout.st.whose === 'foe' && bout.st.outcome === 'open') {
    await banner(document.querySelector('.battle'), `${bout.brief.creature.name}${lang() === 'en' ? "'s turn" : '的回合'}`, 'foe');
    for (let guard = 0; guard < 40 && bout.st.whose === 'foe' && bout.st.outcome === 'open'; guard += 1) {
      const step = bout.st.log.length;
      const did = foeStep(bout.st);
      drawNow();
      await playLog(document.querySelector('.battle'), since(bout.st.log, step), { words: boutCtx().words });
      if (!did || did.kind === 'end') break;
    }
  }
  if (bout.st.outcome !== 'open') return settleBout(bout.st.outcome);
  drawNow();
}

/* The rules settle it, and the scene reports it — the scene is still the only
   witness to a fight (design.md § 降妖). */
async function settleBout(outcome) {
  const { id, actions } = bout;
  const r = await verb('duel', { id, picks: actions.join(',') });
  bout = null;
  if (!r.ok) console.warn('[lingjing] the rules refused the fight', r);
  await report(`[scene] ${r.outcome ?? outcome} ${id}`);
  if (cloud?.signed_in) syncCloud(SKILL).catch((e) => console.warn('[lingjing] sync', e));
  await refresh();
}

/// The fight's brief from Look: the scene's exit, or the haunt's encounter.
/// 温养 — once a day, a tap. No model decides it, so the page asks the rules
/// and re-reads; Ling hears about it on the next Look.
async function onNourish() {
  const r = await verb('nourish', {});
  if (r.ok && r.rose?.length) await report(`[scene] treasure ${r.treasure.step}`);
  await refresh();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-nourish]')) { onNourish(); return; }
  // Inside a fight the stage belongs to the fight: a click is a place on it.
  const spot = e.target.closest('[data-spot]');
  if (bout && spot) { onBoutTap({ kind: spot.dataset.spot, index: Number(spot.dataset.index ?? -1) }); return; }
  const start = e.target.closest('[data-duel-start]');
  if (start) { onDuelStart(start.dataset.duelStart); return; }
});

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
  if (payload?.tool === 'Art') authored = null; // a creature was just painted: read the cards again
  if (WRITERS.has(payload?.tool)) refreshSoon();
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
      turnEnded();
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
  if (!before || !look || !look.companion || before.world?.id !== look.world?.id) return;
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
