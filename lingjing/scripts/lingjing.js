// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only things the page itself reports are a board or a bout the player
// played. Every other tap on the stage — Buy, a place, a practice card — is
// a word to Ling, sent as the player's own line; Ling and the rules do the rest.

import './chat-bridge.js';
import { listSkillSessions, pickResumable, fetchCloud, syncCloud, signIn } from './api.js';
import { verb, content } from './rules.js';
import { newBoard, tap } from './board.js';
import { act, begin, foeStep, idle, missingCards, offers as boutOffers, tokenOf, view } from './battle.js';
import { stageCards } from './stage.mjs';
import { WORDS as BATTLE_WORDS, battleHtml, pickOf } from './battle-card.js';
import { banner, playLog, since } from './battle-anim.js';
import { WORDS, cardHtml, trayHtml, esc, say as fill, yinyueLine } from './cards.js';

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
/// The labels the chat's open question offers; the stage hides its own copies
/// of them while it stands (his, 2026-09-18: 只显示一个).
let asked = null;

let look = null; //       the rules' view of the game — the only source of numbers
let authored = null; //   the world's content files, for the world Look names
/// What Ling just showed, drawn before the rules have written it down — the
/// save is the truth (`look.stage`), this is only the half-second before the
/// next Look catches up.
let focus = [];
let cloud = null; //      the engine's view of the account: {signed_in, meter}; null = no cloud
let tapped = null; //     the stage's words waiting on Ling: that button stays pressed
let casting = false; //   起一卦 tapped: the coins are in the air until the cast lands
let mapView = 'province'; // the map card: 'province' (the player's, up close), 'world', or another province's id
let castSeen; //          the cast last drawn — a new one is drawn line by line, once
let castFresh = false;
let fateOpen = false, fateDraft = '', fateError = false; // the 命格 form: shown again, the date typed, a date refused
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

/// Why the last 出手 did not open, for the card that offered it — the rules'
/// own words (no 体力, the beast already spent, the page's cards out of date).
/// Everything else about a fight is in the save: `duels` here was a second
/// copy of it that only ever drifted.
let duelSay = { id: null, text: null };
const duelFor = (id) => (duelSay.id === id ? duelSay : { say: null });

const ctx = () => ({ look, lang: lang(), words: words(), content: authored, boardFor, duelFor, artBase: `../worlds/${look?.world?.id ?? 'jiuding'}/`, mapView, castFresh, casting, fateOpen, fateDraft, fateError, atlas: atlasPlaces?.provinces ?? null });

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
  tapped = null;
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
    if (look.divination) casting = false;
    await loadContent(look.world);
  } catch (e) {
    console.warn('[lingjing] look', e);
    if (!authored) $('focus').innerHTML = `<div class="loading">${WORDS.zh.offline} · ${WORDS.en.offline}</div>`;
    return;
  }
  // The stage came back with Look — what Ling showed, what the scene was
  // authored with, what the place holds. The optimistic copy has served its
  // purpose.
  focus = [];
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

const clock = (unixSecs) =>
  new Date(unixSecs * 1000).toLocaleTimeString(lang() === 'zh' ? 'zh-CN' : 'en', { hour: 'numeric', minute: '2-digit' });

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
  if (bout) return battleHtml(view(bout.st), boutOffers(bout.st), boutCtx(), bout.picked, bout.openLog, bout.note, bout.help);
  // A line running under his feet takes the stage (his law, 2026-09-18:
  // 「最好左面 webview 显示一个 card，或者在一个故事线或任务中走，显示相关内容」).
  // Standing at the water with the bell in hand, the stage said 摇一摇铃 — and
  // beside it offered him the day's coins, which belong to no part of this.
  // So while the step is his to take HERE, the page adds nothing of its own:
  // Ling's cards are hers to choose, and the quest's card is the line.
  // ONE list, and the rules made it (stage.mjs) — the same one they measured
  // the chat's question against, so nothing stands in both places. Only while
  // Ling's Show is still in flight does the page work it out for itself.
  const cards = focus.length ? stageCards(look, { focus }) : (look.stage ?? []);
  return cards.map((c) => drawCard(c)).join('');
}

/// Four kinds are the page's own — the rest are cards.js's.
const PAGE_CARDS = { building: () => buildingCard(), empty: () => emptyCard(), quest: () => questCard(), goal: () => goalCard(), offer: (c) => offerCard(c.id) };

/// 差事 offered where he stands: the giver's own words, what it pays, and one
/// button. Not tapping is declining — a decline needs no button of its own.
function offerCard(id) {
  const o = (look?.offers ?? []).find((x) => x.id === id);
  if (!o) return '';
  const w = words();
  const pays = [o.grant?.progress ? `${w.xw} +${o.grant.progress}` : '', o.grant?.wealth ? `${w.ls} +${o.grant.wealth}` : ''].filter(Boolean).join(' · ');
  return `<div class="card offer"><div class="cardtitle">${esc(o.title)}</div>
    ${o.who ? `<div class="small dim">${esc(o.who)}</div>` : ''}
    <div class="say">${esc(o.say)}</div>
    ${pays ? `<div class="small dim">${esc(pays)}</div>` : ''}
    <div class="acts">
      <button class="act say" data-say="${esc(fill(w.sayTake, { title: o.title }))}">${esc(w.take)}</button>
      <button class="act say" data-say="${esc(fill(w.sayQuestAbout, { title: o.title }))}">${esc(w.about)}</button>
    </div></div>`;
}

/// Where the story waits, and one tap that walks the road to it. The rules
/// have always known (`waypoint`); until 2026-09-18 nothing on screen said it,
/// and he walked four places asking 「where to go, what should do」. One road
/// at a time, because that is how the world is walked.
function goalCard() {
  const g = look?.waypoint;
  if (!g) return '';
  const w = words();
  const where = g.place ? `${g.place.name}${g.province ? ` · ${g.province}` : ''}` : g.province ?? '';
  // A chapter that has not opened yet says so instead of offering a road.
  const shut = g.chapter ? fill(g.opens ? w.goalWait : w.goalOpen, { title: g.title ?? '', opens: g.opens ? new Date(g.opens).toLocaleDateString(lang() === 'zh' ? 'zh-CN' : 'en') : '' }) : '';
  const go = g.toward ? `<button class="act say" data-say="${esc(fill(w.sayGo, { name: g.toward.name }))}">${esc(fill(w.sayGo, { name: g.toward.name }))}</button>` : '';
  return `<div class="card goal"><div class="cardtitle">${esc(w.goalTitle)}</div>
    <div>${esc(g.gate ? fill(w.goalGate, g.gate) : g.text ?? shut)}</div>
    ${where ? `<div class="small dim">${esc(where)}</div>` : ''}
    ${g.gate ? `<div class="small">${esc(fill(w.goalNow, g.gate.now))}</div><div class="small dim">${esc(w.goalGrow)}</div>` : ''}
    <div class="acts">${go}<button class="act say" data-say="${esc(w.sayGoal)}">${esc(w.about)}</button></div>
    ${bookHtml()}</div>`;
}

/// 手上的事 — one line each, with its count and where the next one is met.
/// 交差 the moment it is done, wherever he stands: he never walks back to the
/// giver (his ruling, 2026-09-18).
function bookHtml() {
  const book = look?.book ?? [];
  if (!book.length) return '';
  const w = words();
  const rows = book.map((q) => {
    const counts = q.need.map((n) => `${w.needKinds?.[n.kind] ?? n.kind} ${n.have}/${n.n}`).join(' · ');
    const at = q.chore ? witness(q.chore, w) : q.where ? (q.where.here ? w.needHere : fill(w.needAt, { name: q.where.name })) : '';
    const act = q.ready
      ? `<button class="act say" data-say="${esc(fill(w.sayTurn, { title: q.title }))}">${esc(w.turnIn)}</button>`
      : `<button class="act say" data-say="${esc(fill(w.sayQuestAbout, { title: q.title }))}">${esc(w.about)}</button>`;
    return `<div class="bookrow${q.ready ? ' ready' : ''}"><div><b>${esc(q.title)}</b>
      <span class="small dim">${esc(counts)}${at ? ` · ${esc(at)}` : ''}</span></div>${act}</div>`;
  }).join('');
  return `<div class="book"><div class="small dim">${esc(w.book)}</div>${rows}</div>`;
}
/// A 功课's witness: which app keeps the record, and when it saw it done.
function witness(chore, w) {
  // `apple-shifu` reads as Shifu: the last word is the app's name.
  const name = String(chore.app ?? '').split('-').pop(), app = name ? name[0].toUpperCase() + name.slice(1) : '';
  // The hour when it was today; the day when the period is longer than one.
  const at = chore.done_at ? new Date(chore.done_at) : null, loc = lang() === 'zh' ? 'zh-CN' : 'en';
  const t = !at ? '' : at.toDateString() === new Date().toDateString() ? at.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }) : at.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
  return fill(chore.done_at ? w.questBy : w.questWait, { app, t, when: w.periods?.[chore.period] ?? '' });
}
const drawCard = (c) => (PAGE_CARDS[c.card] ? PAGE_CARDS[c.card](c) : cardHtml(c, ctx()));

/// The search for the one who walks with you: the step the rules name, and
/// the one word that takes it — 摇一摇铃 where water holds a moon.
function questCard() {
  const q = look?.quest;
  if (!q) return '';
  const w = words();
  // Where to take the step — never when it can be taken right here: the card
  // already carries 买银月铃, and a second line naming another town is the card
  // arguing with the shelf beside it (2026-09-18).
  const where = q.step === 'bell' && q.market && !q.shop_here ? fill(w.questAt, { name: q.market.name })
    : q.step === 'water' && q.water && !q.at_water ? fill(w.questWater, { name: q.water.name }) : '';
  const acts = [{ label: w.about, say: w.sayQuest }];
  // The step, as a word to Ling: buy it here, walk to where it can be taken, ring it.
  if (q.step === 'ring') acts.unshift({ label: w.ringBell, say: w.sayRing });
  else if (q.step === 'bell' && q.shop_here) acts.unshift({ label: fill(w.sayBuy, { name: q.bell.name }), say: fill(w.sayBuy, { name: q.bell.name }) });
  else if (q.step === 'bell' && q.market) acts.unshift({ label: q.market.name, say: fill(w.sayGo, { name: q.market.name }) });
  else if (q.step === 'water' && q.water) acts.unshift({ label: q.water.name, say: fill(w.sayGo, { name: q.water.name }) });
  const row = acts.map((a) => `<button class="act say" data-say="${esc(a.say)}">${esc(a.label)}</button>`).join('');
  return `<div class="card quest"><div class="cardtitle">${esc(w.questTitle)}</div>
    <div>${esc(q.line)}</div><div class="small dim">${esc(w.questSteps?.[q.step] ?? '')}${where ? ` · ${esc(where)}` : ''}</div>
    <div class="acts">${row}</div></div>`;
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
  $('status').innerHTML = statusHtml();
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
  castFresh = castSeen !== undefined && cast !== null && cast !== castSeen;
  castSeen = cast;
  $('focus').innerHTML = focusHtml();
  castFresh = false;
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
  if (tapped) document.querySelectorAll('[data-say]').forEach((el) => { if (el.dataset.say === tapped) el.classList.add('busy'); });
  // One clickable place for one thing: while the chat holds the question, the
  // stage puts away every button that repeats one of its answers.
  if (asked?.size) {
    document.querySelectorAll('[data-say]').forEach((el) => {
      const label = (el.dataset.say ?? '').trim();
      if (asked.has(label) || asked.has(el.textContent.trim())) el.classList.add('answered-in-chat');
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
  tapped = null;
  casting = false;
  asked = null;
  render();
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
  if (spoken && !e.target.closest('[data-play],[data-tile],[data-duel-start],[data-spot]')) {
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

/* ── 降妖: the page plays the fight, the rules decide it ── */

async function onDuelStart(id) {
  const r = await verb('duel', { id });
  if (!r.ok) {
    // Its own words, never the refusal's id: 「no-qi」 on the stage is the page
    // talking to itself. The states without words (won today, tamed) are
    // already written on the card by Look.
    duelSay = { id, text: r.say ?? null };
    render();
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
    duelSay = { id, text: (BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh).stale };
    render();
    return;
  }
  duelSay = { id: null, text: null };
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
  const out = pickOf(bout.picked, spot, view(bout.st), boutCatalog());
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
    if (casting && askedQuestion(payload.args) !== words().castAsk) casting = false;
    const offered = askedOptions(payload.args);
    if (offered?.size) asked = offered;
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
