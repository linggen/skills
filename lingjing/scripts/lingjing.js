// lingjing.js — the Mac scene beside the chat. It shows the game; it never
// decides it. Numbers come from the rules' Look, cards from Ling's Show, and
// the only things the page itself reports are a board or a bout the player
// played. Every other tap on the stage — Buy, a place, a practice card — is
// a word to Ling, sent as the player's own line; Ling and the rules do the rest.

import '/shared/chat-bridge.js';
import { createSession, listSkillSessions, pickResumable, fetchCloud, syncCloud, signIn } from '/shared/api.js';
// And a namespace: a name the served /shared/api.js doesn't export yet
// (`engineUiUrl`) must not fail the whole page.
import * as sharedApi from '/shared/api.js';
import { verb, content, SCRATCH, worldPath } from './rules.js';
import { charsOf, createTracker, trackSender } from './track.js';
import { arcadeGameOf, arcadeRow, arcadeRowOf, isArcadeBoard, withArcade } from './arcade-board.js';
/// A test save with no chat at all (`&chat=off`): the crawlers' opt-out (tools/playtest.mjs,
/// page-crawl.mjs, play-human.mjs) — no Ling, no 银月, a word from the stage only shown. Without it a
/// test save plays like the real game, its chat bound to that save (SKILL.md session-params).
const CHATLESS = Boolean(SCRATCH) && new URLSearchParams(location.search).get('chat') === 'off';
/// The 游戏厅's 试玩 (arcade-board.js): a test save's `&board=<game>` stands that game on the stage.
const ARCADE_GAME = arcadeGameOf(location.search, SCRATCH);
const ARCADE_ROW = arcadeRowOf(location.search, SCRATCH); // a story row's own deal (今's 聊天: one chat a row)
let arcadeDeal = { row: null, title: null };
import { plateHtml } from './plate.js';
import { shopHereHtml, shopsById, shopTagHtml } from './shopmark.js';
import { fightMarkHtml, fightsById } from './fightmark.js';
import { holdPlaceholder } from './invite.js';
import { addressSay, codexHtml, codexOf } from './codex.js';
import { newBoard, tapHeard } from './board.js';
import { sounded } from './games/kit/heard.js';
import { REALMS, begin, missingCards, view as boutView } from './battle.js';
import { fightOdds, oddsKey } from './fightodds.js';
import { withNext, FOOTER, boardDoneToday, cardHoldsWay, companionShown, petStageUrl, sceneGame, slotKey, stageCards, stageSlots, stands, wonWayOn } from './stage.mjs';
import { WORDS as BATTLE_WORDS, boutSays, boutWords, fightKind, spoilsHtml } from './battle-card.js';
import { since } from './battle-anim.js';
import { travelHtml, wayOf, wayPoints } from './travel.js';
import { drainAt, drainOf, trialNudge } from './beats.js';
import { gameOpen, WORDS, say as fill, waitingLine, valueChoice, appearHtml, askBarHtml, bookChipHtml, gearChipHtml, readChipHtml, cardHtml, emergedHtml, handinHtml, panelActsHtml, trayHtml, trialToldHtml, clockOf, isShut, duelTitle, skipButton, threadsAt, asideOpens } from './cards.js';
import { slotNext } from './stuck.js';
import { pouchHtml } from './pouch.js';
import { fantongKailu, kailuPaneHtml } from './fantong-kailu.js';
import { spentBoard } from './board-deal.js';
import { esc } from './esc.js';
import { forInput } from './games/kit/device.js';
import { revealCards } from './card-reveal.js';
import { pickAfter, pickNow } from './danang.js';
import { HANDED_STAY_MS, TURNED_MS, handedStale } from './turned.js';
import { thinker, stillAsked } from './think.js';
import { DUIZI_WORDS, duiziChecksHtml, duiziFormOf } from './aigames-cards.js';
import { createVoice, nodeMoment } from './voice.js';
import { bigPlay, createFightSay, cuesOf, fightFacts, strongFoe } from './fightsay.js';
import { CLOSE_AT, POOR_AT, createHerSay, herMode, wayFacts } from './hersay.js';
import { factsFor, prefetchLines } from './games/prefetch.js';
import { PREFETCH_TITLE, askHer as askHerLines } from './games/prefetch-ling.js';
import { raiseUnease } from './unease.js';
import { keepTogether, LU_WORDS, luChipHtml, luHtml, titleCardHtml } from './lu.js';
import { colourOn, freshMemory, memoryCardHtml, replayOf } from './memory.js';
import { liveBackdrop, liveCreature } from './fx-alive.js';
import { watchMemories } from './fx-memory.js';
import { liveWeather } from './fx-weather.js';
import { huiTurn } from './fx-hui.js';
import { doorsHtml } from './doors.js';
import { HOMING_MS, freshHome, homingCardHtml, inkMapSvg, shapesOf, unrollHtml } from './inkmap.js';
import { frameOf } from './atlas.js';
import { fxTimes, glOK, playHoming as playHomingFx } from './fx.js';
import { atmosClasses, atmosOf, indoorOf, particlesHtml, stagePick, windVars } from './atmos.js';
import { placeArtOf } from './placeart.js';
import { WINDS } from './rules/weather.mjs';
import { parseDay } from './calendar.js';
import { cityNote, draft as skyDraft, wxChipHtml } from './sky.js';
import { advance, asidePlace, atLast, beatKey, choicesUp, readingAt as readingSetAside, current, DLG_WORDS, fitMode, huiAt, keepReading, leadsIn, loadReading, modeAt, sceneOfItem, logHtml, noted, ofPlay, playing, readingFor, sightNow, sightings, storyHolds, storyHtml, wholeBeats, withTold } from './dialogue.js';
import { createLines, keepSpeed, paceOf, SPEEDS, speedNow, voiceOf } from './lines.js';
import { SIGHT_KINDS, artRoom, chatHeard, fitBox, mountChatToggle, paintSight, setAutoFold } from './sight.js';
import { createPager } from './pager.js';
import { EMPTY as NO_AUDIO, clipOf, createListener, createNarrator, hasAudio, listenHtml, loadManifest, setVoice as setDub, voiceOn as dubOn } from './pingshu.js';
import { answered, tapNope, wireLiveGames } from './live-games.js';
import { beatWon, onBeatWon } from './beat-won.js';
import { beatHost, mountOnly } from './beat-host.js';
import { fellBack, probeCaps, withCaps } from './caps.js';
import { anyPaused, forget as forgetShell, frameHtml, isPaused, say as shellSay, setPaused, settle as settleShell, shellFor, timedOf, toolHtml, wireShell } from './games/shell.js';
import { fenceBoards } from './board-fence.js';
import { devArcade } from './dev-arcade.js';
import { carriesPiece, playSetPiece, setpieceBeats, setpieceOf } from './setpiece.js';
import { afterBook, atTurn, atTurnCards, bookAhead, boxGivesWay, gameAlone, huiLineOf, momentMay, momentsHold, trayWaits } from './queue.js';
// 喂饭桶 · 开炉 (fantong-kailu.js): the game is made once here, so every draw may lay it into its host.
const ftKailu = fantongKailu({ feed: (ids, lingshi, press) => feedFantong(ids, lingshi, press), onFed: (r) => fedFantong(r) });

const SKILL = 'lingjing';
const $ = (id) => document.getElementById(id);

/* A preview of the atmosphere, for testing only: `?day=2027-02-06` reads
   Look's `today` (and its season) for that date (a read — the save is never
   written for it), `?weather=snow|rain|fog|clear` draws that sky,
   `?season=autumn` that season, `?wind=gale&winddir=270` that wind. */
const PREVIEW = (() => {
  try {
    const q = new URLSearchParams(location.search);
    const wind = WINDS.find((w) => w.level === q.get('wind'));
    return { day: parseDay(q.get('day')) ? q.get('day') : null, weather: q.get('weather') || null, season: q.get('season') || null,
      wind: wind ? { level: wind.level, force: wind.force, dir: q.get('winddir') ? Number(q.get('winddir')) : undefined } : null };
  } catch { return { day: null, weather: null, season: null, wind: null }; }
})();

// Tools that change the state: the scene re-reads Look once they have run.
const WRITERS = new Set(['Divine', 'Resolve', 'Practice', 'Tale', 'Lang', 'Summarize', 'Move', 'Trade', 'Tame', 'Make', 'Enter', 'Leave', 'Restart', 'Go', 'Undo', 'Load', 'Build', 'Travel', 'Amend', 'Art', 'Lundao', 'Meet', 'Quest', 'Refine', 'Ring', 'Remember', 'Haggle', 'Case', 'Duizi', 'AppTool']);

/* A 斗法 in play, held by the page: the setup the rules handed over at the
   door, the fight itself, and every action taken so far. When it ends the page
   sends the actions back and the RULES settle it — the page never decides a
   fight, it only plays one out (design.md § 斗法 v3). */
let bout = null;
let look = null; //       the rules' view of the game — the only source of numbers
let prevLook = null; //   the scene before this one (leftLook): its header holds while what leads in from it plays
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
/// She is in Lingjing only once the player has found her (the save's
/// `companion.joined`; SKILL.md `place.yinyue.absent_until` — the engine keeps
/// her out of this skill's sessions until then). Every call to her asks this.
/// Asleep in 吴婆婆's fox token (prologue-v3) she still speaks, half asleep (Hanli 2026-10-27:
/// 「yinyue睡着也可以说话」 — the save's `companion.here`, what the engine reads), but has no body on
/// the stage and plays in no game (`herUp`, awake). Not on a line of the book she does not live on
/// (`companion.away`: a 今 interlude, 沈芒's world — the rules drop her presence flag there).
const herHere = () => Boolean(look?.companion?.joined && !look?.companion?.away);
const herUp = () => herHere() && !look?.companion?.asleep;
/// Told to her with every word she is asked for while she sleeps: the state, as a fact.
const SLEEP_NOTE = { zh: '（她睡在木牌里，半梦半醒。）', en: '(She sleeps in the wooden token, half awake.) ' };
const sleepNote = () => (herHere() && look?.companion?.asleep ? SLEEP_NOTE[lang()] : '');
/// Her companion moments (hersay.js) reach her asleep too: from the 木牌, in its voice.
/// 'absent' (not met, or 今线) · 'asleep' · 'awake'.
const herNow = () => herMode(look);
const herNear = () => herNow() !== 'absent';
/* In a fight she speaks only when she stands in its row (party.json: a member from 卷二; asleep in the
   木牌 through 卷一, no 问银月 and no bubble — as her chip reads 「木牌 · 睡着」). */
const herFights = (b) => herNear() && (b?.brief?.setup?.you?.party ?? []).some((m) => m.id === look?.companion?.id);
const voice = createVoice({
  // A test save (?save=) tells her too: its chat is bound to that save (SKILL.md session-params).
  post: (id, fact, flags, opts) => (CHATLESS ? Promise.resolve(false) : postMoment(fact, flags, opts)),
  sees: () => ({ fighting: Boolean(bout), present: herHere() }),
});
/// Resolves true when she will hear it; false when nobody will (the pet off
/// answers 503 at once) — a page that waits on her must not wait then.
function postMoment(fact, flags, { mood = null } = {}) {
  if (!herHere()) return Promise.resolve(false);
  // Her line lands in this chat, and the engine checks her presence against it.
  const sid = chat?.getSessionId?.() ?? null;
  const { converse, ...rest } = flags ?? {};
  // In the game the player has a 名字, and she calls them by it (his screen,
  // 2026-09-24: 「今天也辛苦了，Hanli」 inside 灵境). First, so no cap cuts it.
  const name = look?.name, called = !name ? '' : lang() === 'en' ? `(In the game the player is ${name}.) ` : `（灵境里玩家叫${name}。）`;
  const body = { app: SKILL, text: called + sleepNote() + (lang() === 'en' ? fact.en : fact.zh), ...rest, ...(mood ? { mood } : {}), ...(sid ? { session: sid, ...(converse ? { converse } : {}) } : {}) };
  return fetch('/api/yinyue/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((res) => res.ok).catch((e) => { console.warn('[lingjing] yinyue', e); return false; });
}

/* The game's language is Linggen's own (Hanli, 2026-10-15): Look carries it
   (rules/language.mjs). Before the first Look — the sign-in gate — the
   engine is asked, else the browser. */
const tagLang = (tag) => (/^zh/i.test(String(tag ?? '')) ? 'zh' : 'en');
let pageLang = tagLang(navigator.language);
fetch('/api/user/language').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.language) pageLang = tagLang(d.language); }).catch(() => {});
const lang = () => ((look?.lang ?? pageLang) === 'en' ? 'en' : 'zh');
/// The page's own labels, with the stat names from the world's dictionary
/// on top — the harness names nothing.
const words = () => {
  const w = look?.words ?? {};
  return { ...WORDS[lang()], xw: w.progress ?? WORDS[lang()].xw, ls: w.wealth ?? WORDS[lang()].ls, qi: w.pool ?? WORDS[lang()].qi, yinyue: WORDS[lang()].yinyue };
};

/* The mini-games, one module each (scripts/games/<id>.js — meta, newGame,
   html, act), loaded the first time a place shows one. */
const GAMES = {};
/* The beats on the mount() contract, laid into their hosts after every draw (beat-host.js). */
const beats = beatHost({ boardFor: (id) => boardFor(id), lang: () => lang(), onSettled: (g, r) => beatSettled(g, r), prefetch: (id, g) => prefetchFor(id, g) });
/* 数据埋点 (track.js): the play log, local only — ids, times, outcomes; never what is typed. */
const tracker = createTracker({ send: trackSender(SCRATCH), scratch: SCRATCH });
/* Where a board on the stage came from, for the log: the story's own, the tray, an errand's, the day's, 传闻, the 游戏厅. */
function boardCtx(id) {
  const task = look?.tasks?.find((t) => t.id === id);
  const source = isArcadeBoard(id) ? 'arcade' : isTale(id) ? 'tale' : (look?.scene?.show ?? []).some((c) => c.card === 'board' && c.id === id) ? 'story'
    : view.opened?.id === id ? 'tray' : task?.for_errand ? 'errand' : task?.practice || task?.period === 'day' ? 'today' : 'show';
  const game = task?.game ?? (isTale(id) ? look?.tale?.step?.board?.page : null) ?? (task ? 'lianliankan' : null);
  return { game, level: task?.level ?? null, source, scene: look?.scene?.id ?? null, task: task?.id ?? null };
}
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
  // A game that keeps only the mount() contract (画猜: 银月 reads the picture) is dealt by its own mount, with the step's deal.
  if (mountOnly(mod)) boards.set(taskId, { taskId, mod, day: taskId, data: mountData(b), state: { won: false } });
  else boards.set(taskId, { taskId, mod, day: taskId, state: mod.newGame(`${taskId}|${look.seed ?? ''}`, b.level ?? 1) });
  return boards.get(taskId);
}
/* What a mount-only board is dealt (beat-host.js hands it to mount): the task's deal from Look, the
   game's own chat (`session`: a model turn — 画猜's look — runs there, as hers), and on a 测试存档 the
   opt-in seam (`&her=stub` answers on the page, no model). A deal that names a rules verb (`begin`:
   本王考考你) gets its call. */
function mountData(task) {
  const deal = { ...(task?.deal ?? {}) };
  if (HER_SEAM === 'stub' || CHATLESS) deal.seam = HER_SEAM === 'stub' ? 'stub' : 'off';
  deal.session = () => chat?.getSessionId?.() ?? null;
  // What the save has learned, for a game whose moves are gated by it (守墙关's 结印: shouqiang.json `jieyin.moves` `from`).
  deal.marks ??= [...(look?.marks ?? [])];
  // A board that needs her (Look's `her`: the task or 传闻 game declares `needs: "her"`) wakes her out
  // of the 木牌 as its round begins, and puts her back as it ends (rules/hergame.mjs).
  if (task?.her && task.id) { deal.wake = () => herOut(task.id, true); deal.rest = () => herOut(task.id, false); }
  // 收手 from inside the board (画猜's result card: 下一题 · 收手) puts it down as the card's own 收手 does.
  if (task?.leave && task.id) deal.leave = () => leaveGame(task.id);
  if (deal.begin) {
    const { verb: name, ...args } = deal.begin;
    deal.begin = async ({ next = false } = {}) => {
      const r = await verb(name, { ...args, ...(next ? { next: 1 } : {}) });
      // A round under way stands because he is playing it (the page's `opened`), never by the stage rule: after a
      // reload it waits in the tray, 「继续」 (stage.mjs, Hanli 10-27).
      if (r?.ok && task?.id && view.opened?.id !== task.id) keep({ opened: { id: task.id, place: look?.place?.id ?? null, scene: look?.scene?.id ?? null } });
      return r?.ok ? { ok: true, word: r.word ?? null, n: r.opened ?? null } : { ok: false, say: r?.say ?? null, done: r?.refused === 'cap' };
    };
  }
  return deal;
}
const isTale = (id) => String(id ?? '').startsWith('tale:');
/* 银月 out of the 木牌 for a round of a game that needs her, or back in it (Hanli, 2026-10-19:
   「平时和剧情对齐, 只有在小游戏里需要时醒着」): the rules hold her presence (`companion.awake`, what the
   engine reads) and the chip follows their answer. Awake by the book already, nothing changes. */
async function herOut(taskId, on) {
  const r = await verb('hergame', { hold: on ? 1 : 0, task: taskId }).catch(() => null);
  const c = look?.companion;
  if (!r?.ok || !c) return r;
  if (on && c.asleep) { delete c.asleep; c.out_for = taskId; render(); }
  if (!on && c.out_for) { delete c.out_for; if (r.asleep) c.asleep = true; render(); }
  return r;
}

const boardFor = (taskId) => tracker.boardSeen(taskId, dealtBoard(taskId), boardCtx);
function dealtBoard(taskId) {
  if (isTale(taskId)) return taleBoard(taskId);
  const task = look?.tasks?.find((t) => t.id === taskId);
  if (task?.game && task.game !== 'lianliankan') {
    const mod = gameMod(task.game);
    if (!mod) return null;
    const day = new Date().toDateString(), old = boards.get(taskId);
    // A board won and counted, asked for again the same day, is a new game (board-deal.js) — never
    // while its own win is on its way: onWin holds `winning` until Look has caught up.
    const spent = spentBoard(old, task, day);
    if (!old || old.day !== day || spent) {
      const round = spent ? (old.round ?? 0) + 1 : 0;
      // A game that keeps only the mount() contract (beat-host.js) is dealt by its own mount, not here.
      if (mountOnly(mod)) boards.set(taskId, { taskId, mod, day, round, data: mountData(task), state: { won: false } });
      else boards.set(taskId, { taskId, mod, day, round, state: mod.newGame(`${day}|${look.seed ?? ''}|${taskId}${round ? `|${round}` : ''}`, task.level ?? 1, { ...(task.deal ?? {}), ...(task.done_line ? { solved: task.done_line } : {}) }) });
    }
    // A board the rules judge (密室, games/mishi.js `fromLook`): what it is comes from Look, laid in on every draw.
    const g = boards.get(taskId);
    // Here, asleep too (she speaks from the 木牌, half awake — Hanli 2026-10-27): the 密室's 问银月 is hers to answer.
    if (mod.fromLook) g.state = mod.fromLook(g.state, look, { task: taskId, present: herHere() && !CHATLESS });
    return g;
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
    // A board left (skipGame) is never a win to send again.
    if (!won || g.sent || g.skipped) continue;
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
// The 回 lines shown so far, by language and 回 id: the header keeps the old 回's
// line while its last passage is still told (queue.js huiLineOf).
const huiTitles = {};
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
  twentyGuess: '', caseWho: null, caseEv: [], aiNote: null, // AI mini-games (aigames-cards.js): the guess typed, the suspect and proof picked, a refusal
  duiziDraft: '', duiziUp: '', duiziRung: null, duiziRevOpen: false, // 对对子: the 下联 typed, his own 上联 typed, the rung picked, the reverse unfolded
  panelBusy: null, panelNote: null, // a 连环画 panel's choice in flight, or its refusal
  panelSaid: null, //   what a choice that stays in the scene said: { scene, run, lines }
  reading: undefined, // the dialogue box (dialogue.js): the beats drawn in this scene and the one on show; undefined until read back
  logOpen: false, //   its 记录, over the box
  lookBusy: null, // a 看 chip's look in flight (rules/examine.mjs)
  ledgerOpen: false, // the 恩仇簿 chip's popover
  wxOpen: false, wxSense: null, wxNote: null, // the weather chip's popover: the engine's sense as read, a note
  valuePick: null, valueText: '', valueNote: null, // the 名字 card: an offered name tapped, the player's own typed, a refusal
  bornDraft: '', bornError: false, // the 生辰 card: the date typed (never kept past the tap), a date refused
  appearing: null, //    a beast's first sight playing over the stage: its id
  throwNote: null, // 渡劫's card: how a failed throw fell, or a refusal
  /// Why the last 出手 did not open, for the card that offered it — the rules'
  /// own words (no 体力, the beast already spent, the page's cards out of date).
  /// Everything else about a fight is in the save.
  duelSay: { id: null, text: null },
  pillPick: {}, //       丹囊 at a door: the pick he is making, by duel id (danang.js); his last is the rules'
  bookOpen: false, //    the 事 chip's popover
  roadsOpen: false, //   the 去往 chip's list of roads
  shelfOpen: false, //   the 书 chip's popover: 九鼎录 · 读原著
  gearOpen: false, //    the 储物袋 chip's panel over the stage: what he wears and his pouch, together
  gear: null, //         the rules' `gear` read behind it, fetched when it opens
  pouchTab: 'all', //    the panel's tab (pouch.js TABS)
  pouchSel: null, //     the thing tapped, in the detail pane
  pouchToss: null, //    the thing asking 丢? on the pane, until answered
  pouchPane: null, //    'held' (洞府 · 待取), 'deck' (牌组) or 'fantong' (饭桶) in the grid's place
  fantong: null, //      the rules' 饭桶 brief (rules/fantong.mjs), read when its board opens
  handin: null, //       an errand handed in: { place, title, seen, paid }, until put away or walked on
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
  turned: null, //       a 交差 just tapped: { id, title, paid, at } — its line tops the 事 book a moment (turned.js)
  ask: null, //          the 问询 waiting in the ask bar: its line (「说说夫诸」)
  askHer: false, //      the ask bar speaks to 银月 (`@银月 …`), not to Ling
  choosing: false, //    a 抉择 tapped: its roll is in flight
  trialTold: null, //    the way taken at a 抉择, on the stage until he walks on: { place, success, line, cost }
  gearNote: null, //     a 储物袋 tap the rules refused, in their words, inside the panel
  opened: null, //       a board he opened from the tray: { id, place } — it stays until he walks on
  left: [], //           boards he put down (收手): [{ id, place, scene }] — back in the tray, never up again by themselves here
  walkedOut: null, //    a fight he left that the rules would not settle: it waits on its card, not pulled back in
  luOpen: false, //      the 录 chip's book (九鼎录), over the stage
  lu: null, //           the rules' `story` read behind it, fetched when it opens
  mapPv: null, //        the whole map's province tapped: its line (inkmap.js provinceLineHtml)
  homing: null, //       鼎归 · 地图晕开 on the stage (inkmap.js): { province, frame, at, still }
  unfold: null, //       地图展开 on the map card (cards.js atlasMap): { chapter, title, at, still }
  doors: null, //        息壤's five doors opening (doors.js): { node } — main holds it until he taps on
  memory: null, //       银月's memory on the stage (memory.js): { n, i, play, at } — main holds it while it plays
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
/* 难度 on a beast's card (fightodds.js): the door's setup played out over a few deals, once a setup, when the
   page is idle — the card shows it on the next draw; kept by setup, so a Look never waits for it. */
const oddsKept = new Map();
let oddsBusy = null;
function oddsFor(brief) {
  if (!brief?.setup || brief.today?.outcome) return null;
  const key = oddsKey(brief.setup);
  if (oddsKept.has(key)) return oddsKept.get(key);
  if (oddsBusy !== key) {
    oddsBusy = key;
    setTimeout(() => {
      try { oddsKept.set(key, fightOdds(brief.setup, cardCatalog())); } catch (e) { console.warn('[lingjing] odds', e); oddsKept.set(key, null); }
      oddsBusy = null;
      render();
    }, 300);
  }
  return null;
}

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

const ctx = () => ({ look, homeFrom: homePct, boardTitle: (id) => boardTitles.get(id) ?? null, pillPick: view.pillPick, codex: codexNow(), handedAge, kaifu: view.kaifu, turned: view.turned, bookRow: view.bookRow, offerRow: view.offerRow, tookOffer: view.tookOffer, bookInfo: view.bookInfo, qi: qi(), lang: lang(), words: words(), content: authored, boardFor, duelFor, oddsFor, artBase: artBase(), mapView: view.mapView, castFresh: view.castFresh, casting: view.casting, fateOpen: view.fateOpen, fateDraft: view.fateDraft, fateError: view.fateError, refineMat: view.refineMat, refineName: view.refineName, refineNote: view.refineNote, twentyGuess: view.twentyGuess, caseWho: view.caseWho, caseEv: view.caseEv, aiNote: view.aiNote, duiziDraft: view.duiziDraft, duiziUp: view.duiziUp, duiziRung: view.duiziRung, duiziRevOpen: view.duiziRevOpen, duiziTones: tonesNow(), duiziLate: duiziLate(), panelBusy: view.panelBusy, panelNote: view.panelNote, panelSaid: saidHere(), called: calledDuels(), reading: readingHere(), tellPending: Boolean(look?.tell_owed || drawingTold), momentUp: momentUp(), lookBusy: view.lookBusy, valuePick: view.valuePick, valueText: view.valueText, valueNote: view.valueNote, bornDraft: view.bornDraft, bornError: view.bornError, throwNote: view.throwNote, seclude: view.seclude, secludeFocus: view.secludeFocus, secludePill: view.secludePill, secludeNote: view.secludeNote, atlas: atlasPlaces?.provinces ?? null, ink: atlasPlaces?.ink ?? null, inkGeo, mapPv: view.mapPv });

/// The other provinces' places, read once per world, language and realm —
/// only when the player looks past their own province.
async function loadAtlas() {
  // The ink map changes with the chapter's map, the 鼎 home and the province stood in.
  const key = `${look?.world?.id}:${lang()}:${look?.tier?.id}:${look?.chapter?.id}:${look?.jiuding?.homed?.join('') ?? ''}:${look?.place?.province?.id ?? ''}`;
  if (atlasPlaces?.key === key) return;
  try {
    const r = await verb('atlas');
    if (r.ok) atlasPlaces = { key, provinces: r.provinces, ink: r.ink ?? null };
    if (r.ink && look?.world?.atlas) await loadInkGeo(look.world, r.ink.shapes);
  } catch (e) {
    console.warn('[lingjing] atlas', e);
  }
}

/// The ink map's shapes (inkmap.js shapesOf), read from the world's own map
/// file once per world: every province's outline, its rivers and its water.
let inkGeo = null, inkGeoFor = null;
async function loadInkGeo(world, shapes) {
  if (inkGeoFor === world.id || !shapes) return;
  inkGeoFor = world.id;
  try {
    const res = await fetch(worldPath(world.dir, world.atlas.file));
    inkGeo = shapesOf(await res.text(), shapes);
  } catch (e) {
    inkGeoFor = null;
    console.warn('[lingjing] ink map', e);
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
  // 图鉴: the codex and the files it links — the same entries the book draws (codex.js).
  const [codex, people, items, arts] = await Promise.all(['codex.json', 'people.json', 'items.json', 'arts.json'].map((f) => content(baseDir, f).catch(() => null)));
  // The stage's backdrops, by the weather and the hour (atmos.js backdropOf); a world without them keeps the paper.
  const backdrops = await content(baseDir, 'backdrops.json').catch(() => null);
  const sameWorld = authored?.world === world.id;
  authored = { world: world.id, dir: baseDir, creatures: all, herbs: herbs.herbs, hexagrams: hexagrams.hexagrams, traits: roots, dictionary, cards, codexFiles: { codex, people, creatures, items, arts }, backdrops, loadedAt: Date.now() };
  if (!sameWorld) boards.clear();
}

/// The 图鉴 resolved for this reader: the page's language, the hero's gender
/// (阿禾's portrait follows it), the address words filled. Kept until one changes.
let codexMemo = null;
function codexNow() {
  const f = authored?.codexFiles;
  if (!f?.codex) return null;
  const named = look?.named ?? {}; // a thing the player named (小铜炉 · 饭桶), as Look names it
  const key = `${authored.loadedAt}:${lang()}:${look?.gender ?? ''}:${JSON.stringify(named)}`;
  if (codexMemo?.key !== key) {
    const map = codexOf(f, { lang: lang(), gender: look?.gender, say: addressSay(f.people, look?.gender, lang()) });
    for (const [id, name] of Object.entries(named)) if (map.has(id)) map.set(id, { ...map.get(id), name });
    codexMemo = { key, map };
  }
  return codexMemo.map;
}

/// The account as the engine sees it. The meter moves with every model call,
/// so it is read whenever the game is.
async function readCloud() {
  if (SCRATCH) return; // a scratch save is never the account's: no gate, no sync
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

/* 得牌 (card-reveal.js, Hanli 2026-10-16: 同一张牌放大展示, 缩小进背包, 然后下一场战斗出现): a card
   new on this read (in `cards_new`, not in the last one) is shown big over the stage with its one line of
   where it came from (cards.json `from`), then flies into the 物品 chip; in the next fight it wears 新
   until played. Waits while a fight holds the stage; the first read of a page plays nothing. */
const revealQueue = [];
let revealing = false;
// A won beat (beat-won.js) may have given its card (射鹿 → 一箭, 吹鹅毛 → 吐纳): read, then the reveal plays.
onBeatWon(() => refresh().then(() => playReveals()));
function gainedCards(was, now) {
  if (!was) return;
  const before = new Set(was.cards_new ?? []);
  for (const id of now?.cards_new ?? []) if (!before.has(id) && !revealQueue.includes(id)) revealQueue.push(id);
  queueMicrotask(playReveals);
}
async function playReveals() {
  if (revealing || bout || !revealQueue.length || !authored) return;
  revealing = true;
  try {
    const catalog = cardCatalog(), l = lang();
    const cards = revealQueue.splice(0).map(id => catalog[id]).filter(Boolean)
      .map(c => ({ ...c, line: c.from?.[0]?.line?.[l] ?? c.from?.[0]?.line?.zh ?? '' }));
    await revealCards(cards, { host: $('view') ?? document.body, target: () => document.querySelector('.gearchip'), lang: l, artBase: artBase() });
  } finally { revealing = false; }
  if (revealQueue.length) playReveals();
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
    // What the device can do is known before the first Look is drawn: a board with an `alt` (古六's 讲堂 as 结印)
    // is dealt once, as this device plays it (caps.js).
    const [seen, , caps] = await Promise.all([verb('look', PREVIEW.day ? { day: PREVIEW.day } : {}), readCloud(), probeCaps(window)]);
    // The scene just left, kept for its header while its choice's passage is still told.
    if (look?.scene && seen?.scene?.id !== look.scene.id) leftLook(look);
    stageQuestDone(look, seen);
    gainedCards(look, seen);
    look = withArcade(withCaps(seen, caps), ARCADE_GAME, arcadeDeal);
    tracker.watchLook(look, [look.capped ? 'cap' : null, look.stamina?.now === 0 ? 'stamina' : null, ...(look.waits ?? []).map((w) => (w.id ? `wait:${w.id}` : null))]);
    // A cooldown's minutes are as of this Look: kept as the moment it opens, so the row counts down between Looks.
    for (const w of look?.waits ?? []) w.ready_at = Date.now() + (w.wait_min ?? 0) * 60_000;
    if (look?.engine && !engineAt) engineAt = look.engine;
    watchRun();
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
  // …or until the scene moves on: a board left queued must not come up after another scene's play (a tame).
  if (view.opened && (view.opened.place !== here || (view.opened.scene ?? null) !== (look.scene?.id ?? null))) keep({ opened: null });
  if (view.left.length) keep({ left: view.left.filter((l) => l.place === here && (l.scene ?? null) === (look.scene?.id ?? null)) });
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
  watchMemory();
  watchTell();
  watchWayOn();
  if (look.world?.atlas) await loadAtlas();
  watchHoming();
  festivalMoment();
  render();
}

/// A creature just painted, or a fight dealt cards the page cannot name: the
/// next read takes the world's content again (and draws the old until then).
let contentStale = false;
/* The fight engine the page was loaded with (rules/engine.mjs): the stamp its first Look carried. A
   duel answer with another one means an install landed while the page stood open — its battle.js is
   older than the rules', and a fight played on it would be refused 「这一战没记上」 over a blank stage
   (2026-10-15). The page reloads once into the same fight (the save holds it open, its deal kept). */
let engineAt = null;
const ENGINE_KEY = `lingjing.engine-reload.${SCRATCH || 'main'}`;
function engineMoved(r) {
  if (!r?.engine || !engineAt || r.engine === engineAt) return false;
  let tried = null;
  try { tried = sessionStorage.getItem(ENGINE_KEY); } catch { /* no storage */ }
  return tried !== r.engine;
}
function reloadForEngine(r) {
  try { sessionStorage.setItem(ENGINE_KEY, r.engine); } catch { /* no storage: reload anyway */ }
  keep({ walkedOut: null });
  location.reload();
}

/* ── Drawing ── */

/* ── 灵气: the 丹田 ring ── */

/// The 丹田: how much is left, as a state AND as the count. It is the one
/// throttle in the game (design.md § 体力) — a countdown would push, points do
/// not (his, 2026-09-18: 倒计时会带来心里压力), and a number you can see is how
/// a player decides whether there is another fight in the day.
function qi() {
  const q = look?.stamina;
  // 体力 off (state.mjs staminaLimited — off while we test): no pool on the strip at all.
  if (!q || !q.max || q.off) return null;
  const { p, st } = qiState(q.now, q.max, Boolean(q.empty));
  // When the player can go on again: the pool full (rest = max — his,
  // 2026-09-24: 体力为空时, 保障用户离线一定时间, 回复到100才允许再上线; 5 小时).
  // The rules' `rest_at` when they give it, else `returns_at`, which is the same.
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
  // Spent, the pool shows no trickle — only the hour it is whole again.
  const resting = !draining && d.st === 'empty' && d.refillAt;
  const cnt = resting ? `<span class="cnt">${esc(fill(w.qiBackAt, { t: clockOf(new Date(d.refillAt * 1000), lang()) }))}</span>`
    : `<span class="cnt"><span data-qi>${esc(d.now)}</span>/${esc(q.max)}</span>`;
  // A tap on the pool opens 闭关 (his, 2026-09-24: any time the player chooses).
  const open = look.seclusion || isShut(look, 'seclusion') ? '' : ` data-seclude-open role="button" tabindex="0"`;
  return `<span class="qi" data-st="${esc(d.st)}" title="${esc(w.qi)} · ${esc(w.secludeOpen)}"${open}><span class="lbl">${esc(w.qi)}</span>
    <i class="ring" style="--p:${resting ? 0 : Number(d.p) || 0}"></i><span class="st">${esc(qiWord(d.st, w))}</span>${cnt}</span>`;
}

/// Filled to the 回's cap (Look's `capped`, rules/cap.mjs): the bar stands full and a small
/// seal by its count says it waits — the world's line is the seal's title, never a row on the
/// bar (Hanli, 2026-10-15: the line took the strip's room and crushed the name to a column).
const capSay = () => (look.capped?.say ? `<span class="capseal" role="note" title="${esc(look.capped.say)}" aria-label="${esc(look.capped.say)}">${esc(words().capSeal)}</span>` : '');

/// How far past the full mark the 修为 stands, as a share of the bar (0 when it is not; at most the whole bar).
const spillPct = (progress, next) => (next && progress > next ? Math.min(100, Math.round(((progress - next) / next) * 100)) : 0);

/// One line in the world while the window is spent — and the boards stay:
/// they use no model.
function statusHtml() {
  const w = words();
  const pct = look.next ? Math.min(100, Math.round((look.progress / look.next) * 100)) : 0;
  // Past the full mark (Hanli, 2026-10-15: 「230/200」): the bar stands full and the 修为 over it glows on top.
  const over = spillPct(look.progress, look.next);
  // A scene on another line (a 今 interlude) keeps only the language here: the rest is the 古's (stage.mjs FURNITURE).
  // Read off the header that stands (headLook): under 「今 · 二 · 完」 the strip is still the 今's, never the 古's beside 沈芒.
  const head = headLook(), has = (part) => stands(head, part);
  const name = look.name && has('name') ? `<span class="daohao">${esc(look.name)}</span>` : '';
  // Before the prologue's gate (Look's `locked`) a mortal: no realm, no 修为 bar, no 灵石, no coins — not greyed, not there.
  const realm = !has('realm') ? '' : isShut(look, 'cultivation') ? `<span class="realm">${esc(w.mortal)}</span>`
    // 零层 (Look's `tier.bar` false): the realm's name only — the 修为 bar stands from the 小周天 on.
    : look.tier?.bar === false ? `<span class="realm">${esc(look.tier.name)}</span>`
    : `<span class="realm">${esc(look.tier.name)}</span>
    <div class="xw"><span class="lbl">${esc(w.xw)}</span><div class="bar${over ? ' over' : ''}"><i style="width:${pct || 0}%"></i><em class="spill" style="width:${over}%"></em></div>
      <span class="num"><span data-count="progress">${esc(look.progress)}</span>/${esc(look.next)}</span>${capSay()}</div>`;
  const stones = !has('wealth') || isShut(look, 'wealth') ? '' : `<span class="ls"><span class="lbl">${esc(w.ls)}</span> <b data-count="wealth">${esc(look.wealth)}</b></span>`;
  return `${name}${realm}
    ${has('pool') ? qiHtml() : ''}
    ${stones}${has('omen') ? omenChip() : ''}
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
    rank: look.tier?.name, step: look.tier?.step, chapter: look.chapter?.id, hui: look.chapter?.hui ?? look.chapter?.id, stamina: look.stamina?.now, resting: Boolean(look.stamina?.resting),
    her: look.companion?.card ? { atk: look.companion.card.atk, hp: look.companion.card.hp } : null };
  const before = shown;
  shown = now;
  // 大成就: a realm risen, a 回 begun — the stage marks it and 银月 speaks
  // at once (his, 2026-09-23: 境界突破等大成就达成时, 显示一个动画, 并让银月说点什么).
  if (before && before.world === now.world) {
    // The last point spent: 银月 sends him back to the real world to rest —
    // real life is hers, not Ling's (his rule, 2026-09-23).
    if (before.stamina > 0 && now.stamina === 0 && !before.resting) {
      const at = clock(look.stamina?.rest_at ?? look.stamina?.returns_at);
      askHer('spent', `玩家的体力刚刚耗尽了（${at} 可以再出发）。游戏先放一放：请玩家回到现实里歇一歇，起身走走、喝口水。说一两句。`, `The player's stamina just ran out (ready to go again at ${at}). The game waits: send them back to the real world to rest — stand up, walk, drink some water. A line or two.`, 'relaxed');
    }
    if (now.rank && before.rank && now.rank !== before.rank) feat('rise', now.rank, before.rank, false, riseGains(before, now), herGrew(before, now) ? { from: before.her, to: now.her } : null);
    // A cauldron found tells her on its own (the story node, with its facts); the seal still shows.
    // A 回 begun — where the scenes' 回 turns, inside a chapter or across one (rules/hui.mjs).
    else if (now.hui && before.hui && now.hui !== before.hui) feat('chapter', look.chapter.title, '', nodeFresh(['cauldron', 'chapter']));
  }
  // A beast won over — fed or fought — is a moment of its own: a 收服 seal on
  // the stage and +1 off the 装备 chip, where its card now lives (his ask,
  // 2026-09-23: 收服后应该有个动画, top bar 上显示个 +1).
  if (before && before.world === now.world) {
    const joined = (look.cast ?? []).filter((b) => !before.cast.includes(b.id));
    if (joined.length) wonOver(joined);
    // The purse near empty: a light word, once a day (hersay.js poor).
    if (Number.isFinite(before.wealth) && before.wealth >= POOR_AT && now.wealth < POOR_AT) herSay.say('poor', lang() === 'en' ? `${now.wealth} spirit stones left.` : `只剩${now.wealth}块灵石。`);
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
  // A scene card on arrival is what the stage is about: the map never pops over
  // it (his, 2026-09-29) — the story's own step to the next scene is no walk either.
  if (!prev || prev.id === p.id || bout || look.scene?.panel) return;
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
async function gainBurst(g) {
  // After the book and the moments: a gain never floats over her memory or a seal.
  for (let k = 0; k < 720 && (boxAhead() || momentUp() || momentPending.size); k += 1) await pause(250);
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
    herGrew(before, now) ? fill(w.featHer, { name: look?.companion?.name ?? w.yinyue, a: `${before.her.atk}/${before.her.hp}`, b: `${now.her.atk}/${now.her.hp}` }) : '',
  ].filter(Boolean).join(' · ');
}
/* Her card grew with the realm (rules companion.mjs § Beside her: "when you
   are stronger, so is she" — Hanli, 2026-09-24). */
const herGrew = (before, now) => Boolean(before.her && now.her && (before.her.atk !== now.her.atk || before.her.hp !== now.her.hp));

/// A great moment on the stage: a gold seal, light behind it, held long
/// enough to read — then 银月 speaks, asked, at once. One moment at a time
/// (seen live at 09-cliff, 2026-09-30: the 筑基 seal, 古九's 「完」, the new
/// 回's card and the dialogue box all stacked at once): a set piece plays
/// first, then the seal, put away by a tap, then the rest (stageBusy).
let featOn = false;
const CHAPTER_SEAL_MS = 3600;
let riseWaits = false; // a realm risen, its seal not yet up: the 回's ending card and the new 回's title wait for it
// A new 回's seal on its way: the 回's turn (queue.js atTurn) — the box holds the new 回's
// first passage until the seal has played, never the seal until that passage is over.
let sealOwed = false;
/* A realm risen twice before its seal is up (the 秘境: 二层圆满 in the night, 四层 by noon — two Looks) is
   one seal, with the realm he stands in now: live 2026-10-15, 「练气二层」 came up while the strip read 四层. */
let risePending = null;
function feat(...args) {
  const [kind] = args;
  if (kind === 'rise' && risePending) {
    const [, name, , quiet, gains, her] = args;
    risePending.splice(1, 1, name);
    risePending.splice(3, 3, risePending[3] && quiet, [risePending[4], gains].filter(Boolean).join(' · '), her ? { from: risePending[5]?.from ?? her.from, to: her.to } : risePending[5]);
    return;
  }
  if (kind === 'rise') risePending = [...args];
  if (kind === 'chapter') sealOwed = true;
  // A realm risen: its seal comes after the set piece and after the ending 回's last
  // passage (the box plays it first); the 回's ending card and the new title wait behind it.
  // A new 回's seal is its opening: it comes after the old 回's ending card is put away.
  if (kind === 'rise') riseWaits = true;
  setTimeout(async () => {
    // A new 回's seal is its opening: after the old 回's 「完」 is put away.
    await momentTurn('feat', () => (kind === 'rise' ? oldHuiPlaying() : closeUp()));
    featOn = true;
    // Up now: the seal itself holds the box (momentUp) until it goes — and the turn with it
    // (sealOwed stays until the seal is put away, featNow's `gone`): live at 今 · 三 → 古七
    // (2026-10-15) the scene's 「扔进饭桶 ›」 stood under 「新的一回」 before 09-snow's passage.
    if (kind === 'rise') { riseWaits = false; const latest = risePending ?? args; risePending = null; featNow(...latest); return; }
    featNow(...args);
    render();
  }, 0);
}
function featNow(kind, name, from = '', quiet = false, gains = '', her = null) {
  const w = words();
  const el = document.createElement('div');
  el.className = 'feat';
  // A throw that landed against the odds (under the rule's `low`) is marked on the seal.
  const against = kind === 'rise' && thrown?.low ? `<em class="featlow">${esc(w.bt.low)}</em>` : '';
  if (kind === 'rise') thrown = null;
  el.innerHTML = `<i class="rays"></i><div class="featbox${against ? ' low' : ''}">${against}<b>${esc(kind === 'rise' ? w.featRise : w.featChapter)}</b><span>${esc(keepTogether(name))}</span>${gains ? `<small class="featgain">${esc(gains)}</small>` : ''}</div>`;
  el.style.animationDelay = `${Math.max(0, riseAfter - performance.now())}ms`;
  $('view')?.appendChild(el);
  // The page turns under the seal (fx-hui.js); a turn that cannot load leaves the seal alone, no error.
  if (kind === 'chapter') huiTurn($('view'), Math.max(0, riseAfter - performance.now()), el).catch(() => null);
  const gone = () => { if (!el.isConnected) return; el.remove(); featOn = Boolean(document.querySelector('.feat')); if (kind === 'chapter') sealOwed = false; render(); };
  el.addEventListener('click', gone);
  // 「新的一回」 clears by itself in ~3.6 s (Hanli, 2026-10-14 choice 9: the 完 card's 合上 is the one tap); a realm's seal holds longer.
  setTimeout(gone, (kind === 'chapter' ? CHAPTER_SEAL_MS : 6000) + Math.max(0, riseAfter - performance.now()));
  if (quiet) return;
  // A thing they lived through together, and the road ahead — said her way, the proud 妖王's
  // (hersay.js): facts only here; asleep, the 木牌's word.
  const zh = lang() !== 'en';
  // Her card grew with it — a fact for her, never a line (her card, 攻/血).
  const grew = !her ? '' : zh ? `你的牌也跟着长了：${her.from.atk}/${her.from.hp} → ${her.to.atk}/${her.to.hp}。` : `Your card: ${her.from.atk}/${her.from.hp} → ${her.to.atk}/${her.to.hp}.`;
  const odds = against ? (zh ? '这一劫是逆天而成，把握很低。' : 'Against the odds.') : '';
  if (kind === 'rise') herSay.say('rise', zh ? `${from} → ${name}。${odds}${grew}点一件你们刚一起经历过的具体的事（对话里有），再说往后的路。`
    : [`${from} → ${name}.`, odds, grew, 'Recall one thing you just lived through together.'].filter(Boolean).join(' '));
  else herSay.say('hui', zh ? `新的一回开了：${name}。你陪玩家一路走到这里。` : `A new chapter opens: ${name}. You walked with the player to here.`);
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
  herSay.say('tamed', lang() === 'en' ? `Won over ${beasts.map((b) => b.name).join(', ')}.` : `收服了${beasts.map((b) => b.name).join('、')}。`);
  // Its card flies into the 物品 chip by the 得牌 reveal (card-reveal.js): no second +N on the chip.
}
/// Where a gain's count stands `age` ms in: eased from → to over RISE_MS, and
/// the landed number once its time is up. The last frame always writes it: a
/// hidden tab draws no frames, and the strip — redrawn only when its HTML
/// changes — kept 36/60 · 灵石 6 over a save at 55 · 25 (live, 2026-09-29).
function riseValue(r, age, still) {
  const k = still || age >= RISE_MS ? 1 : Math.max(0, age / RISE_MS), eased = 1 - (1 - k) ** 3;
  return { k, value: Math.round(r.from + (r.to - r.from) * eased) };
}
let riseFrame = null;
function paintRise() {
  if (riseFrame) cancelAnimationFrame(riseFrame);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = performance.now();
  for (const [key, r] of rising) {
    const el = document.querySelector(`[data-count="${key}"]`), age = t - r.start;
    if (!el) { if (age > GAIN_MS) rising.delete(key); continue; }
    const { k, value } = riseValue(r, age, still);
    el.textContent = String(value);
    el.classList.toggle('rising', k < 1);
    // The bar fills with the number, not ahead of it.
    const bar = key === 'progress' && r.next ? document.querySelector('.status .xw .bar i') : null;
    if (bar) bar.style.width = `${Math.min(100, (value / r.next) * 100)}%`;
    const spill = key === 'progress' && r.next ? document.querySelector('.status .xw .bar .spill') : null;
    if (spill) { spill.style.width = `${spillPct(value, r.next)}%`; spill.parentElement.classList.toggle('over', value > r.next); }
    if (age > GAIN_MS) { rising.delete(key); continue; }
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
/// would use: it sets Linggen's language (all of it, not only the game); the
/// page redraws in it and Ling's next reply follows Look.
/// On a scratch save (?save=) it stays that save's own, never the global.
async function switchLang(to) {
  if (to === lang()) return;
  try {
    await write('lang', { lang: to });
  } catch (e) {
    console.warn('[lingjing] lang', e);
  }
  await refresh();
}

/// The stage in its FIXED SECTIONS (Hanli, 2026-09-29): 此地 (the header —
/// the place, the people, the goal), 此刻 (ONE thing in main), 行 (the roads,
/// what else waits, the chips). Which card goes where, and which one thing
/// main holds, is the rules' own (stage.mjs stageSlots) — the same list they
/// measured the chat's question against, so nothing stands in both places.
function stageNow() {
  // A line running under his feet takes the stage (his law, 2026-09-18) — the
  // rules made the list. Only while Ling's Show is still in flight does the
  // page work it out for itself.
  let cards = view.focus.length ? stageCards(look, { focus: view.focus }) : (look.stage ?? []);
  // A board he opened from the tray stays before him through the next Look
  // and whatever Ling shows, until he walks on.
  if (view.opened && !cards.some((c) => c.card === 'board' && c.id === view.opened.id)) cards = [...cards, { card: 'board', id: view.opened.id }];
  // A board he put down (收手) is in the tray again, never back up on the stage by itself (a hosted board stands up alone).
  if (view.left.length) cards = cards.filter((c) => !(c.card === 'board' && view.left.some((l) => l.id === c.id)));
  // The errand just taken keeps its card a moment, sealed 已接下 — not where a scene card stands:
  // there it was one of the scene's choices, and it simply leaves them (stage.mjs).
  if (view.tookOffer && !look.scene?.panel && !cards.some((c) => c.card === 'offer')) cards = [...cards, { card: 'offer' }];
  // 所得 goes by itself after a moment (Hanli, 2026-10-15: an old 「交差 · 修屋顶」 stood on through several taps).
  if (handedStale(look.handed, handedAge)) cards = cards.filter((c) => c.card !== 'handed');
  else if (look.handed?.length && !handedTimer) handedTimer = setTimeout(() => { handedTimer = null; render(); }, HANDED_STAY_MS + 100);
  // 闭关's chooser, opened from the pool or the empty card.
  if (view.secludeOpen && view.seclude && !look.seclusion) cards = [{ card: 'seclude' }, ...cards];
  // 银月's memory takes the main slot while it plays (memory.js; stage.mjs MAIN).
  if (view.memory) cards = [{ card: 'memory', id: view.memory.n }, ...cards];
  // 鼎归 · 地图晕开 after her memory (stage.mjs MAIN ranks it second).
  if (view.homing) cards = [{ card: 'homing', id: view.homing.province }, ...cards];
  // 息壤's five doors (stage.mjs MAIN ranks them after 鼎归).
  if (view.doors) cards = [{ card: 'doors' }, ...cards];
  // 地图展开: the chapter's map card unfolding (stage.mjs MAIN ranks it after the doors).
  if (view.unfold) cards = [{ card: 'unfold' }, ...cards.filter((c) => c.card !== 'map')];
  // A chapter's ending card, until he puts it away (合上; kept per save in this browser).
  cards = cards.filter((c) => c.card !== 'closed' || (!closeSeen(look.chapter?.close?.id) && !stageBusy() && !endingWaits()));
  // A scene's fight waits for its words to be chosen (站着，不跪) — or a fight already under way.
  const called = calledDuels();
  cards = cards.filter((c) => c.card !== 'duel' || !(look.scene?.panel?.taps ?? []).some((t) => t.duel === c.id) || called.has(c.id));
  // Met in the header (the people, a tap opens their 图鉴): no first-meet card of the
  // same face in the middle of the stage, pushing the scene's choices under the box.
  const inHead = new Set((look.scene?.people ?? []).map((p) => p.id));
  cards = cards.filter((c) => c.card !== 'meet' || !inHead.has(c.id));
  // 初见: a face the box brings on stands large at that beat (sight.js) — no card of him at the end too.
  const sighted = sightings(readingHere(), firstFaces(), lang());
  cards = cards.filter((c) => c.card !== 'meet' || !sighted.has(c.id));
  // A scene's own game played and counted closes (its last line was read in onWin's pause):
  // the box comes back alone, with the rest of the passage or the choices — never beside it.
  const played = (id) => (look?.scene?.show ?? []).some((c) => c.card === 'board' && c.id === id) && (look?.tasks ?? []).some((t) => t.id === id && t.status === 'done');
  cards = cards.filter((c) => !(c.card === 'board' && played(c.id) && !boards.get(c.id)?.winning));
  // A 回's turn, the new 回's passage still to tell: its 「完」 alone, nothing queued behind it (queue.js atTurnCards).
  cards = atTurnCards(cards, { turn: atHuiTurn(), ahead: storyAhead() });
  // A scene's game waits for the whole passage too — its last beat read and the box put away
  // (live 2026-10-14: at 吹鹅毛 the box hid on its last beat, 「……鸡窝里一阵大乱」, unread).
  // Not under a 回's title card either: the passage is still to be told after it (a fresh 石坳村).
  // A scene's fight too (Hanli, 2026-10-14: the box's 「继续」 under 出手): it stands once the box is
  // put away — or once its words were chosen in the box, which puts the box away (data-panel-duel).
  // Set aside, a board of the tray's (a skipped one played again, 兽潮) stands; the scene's own waits for its passage.
  const ownBoard = (id) => (look?.scene?.show ?? []).some((c) => c.card === 'board' && c.id === id) && !(look?.tasks ?? []).some((t) => t.id === id && t.replay);
  if (storyAhead()) cards = cards.filter((c) => (c.card !== 'board' || c.id === view.opened?.id || (asideOn() && !ownBoard(c.id))) && !(c.card === 'duel' && sceneGame(look, c) && !called.has(c.id)));
  // A board he opened from the tray's 开局 waits for the whole passage (queue.js trayWaits).
  if (view.opened && trayAhead()) cards = cards.filter((c) => !(c.card === 'board' && c.id === view.opened.id));
  // One text box (Hanli, 2026-10-05): while the book is ahead — or the box holds
  // its last beat, the choices inside it (2026-10-14) — no scene card stands.
  if (cardsAhead() || choicesInBox() || asideOn()) cards = cards.filter((c) => c.card !== 'panel');
  // The book first: a game waits until the passage that leads into it is told (queue.js afterBook).
  cards = afterBook(cards, cardsAhead());
  watchAppear(cards);
  // 兽潮 waits in the tray (开局) and stands only opened (stage.mjs sceneGame): the 主页 is the stage's default.
  cards = cards.filter((c) => !(c.card === 'board' && tideBoard(c.id) && view.opened?.id !== c.id && !view.focus.some((f) => f.card === 'board' && f.id === c.id)));
  const queued = cards.filter(inQueue);
  // Never a blank stage (Hanli, 2026-10-15): what the page took off above (a 完 put away, a board
  // played) can leave main empty — then, with no passage to tell, the 下一步 card stands (withNext).
  // A 回's 「完」 only held back while a seal or a set piece plays is not put away: 下一步 waits
  // with it, or it would flash in under the stamp and give way to the 「完」 (queue.js atTurnCards).
  const slots = stageSlots(look, storyAhead() || choicesInBox() ? queued : closeHeld() ? queued.filter((c) => c.card !== 'next') : withNext(look, queued.filter((c) => c.card !== 'next')), { skip: view.qSkip });
  return soloSlots(slots, queued);
}

/* A game up takes the stage alone (queue.js gameAlone; Hanli, 2026-10-26: 「Mac上游戏界面需要独占UI」): the board
   in play in main, or the one he opened from the tray (queued behind the scene card's rank otherwise) — main is
   that board only, no header, nothing counted in the footer; the box steps aside (boxYields), the tray goes
   (draw: `solo`). The rest stands again once it ends. */
/* A popover, sheet or book open over the stage (事 · 物品 · 书 · 天气 · 去往 · 录 · 回看): a board in time waits under
   it (Hanli, 2026-10-26: 交差 tapped over 兽潮) — the shell's own pause, taken off again when the last one shuts, and
   only from the boards it paused (his own pause stays his). Its taps never reach the board (board-fence.js). */
const popOpen = () => Boolean(view.bookOpen || view.gearOpen || view.shelfOpen || view.wxOpen || view.roadsOpen || view.luOpen || view.logOpen);
const popPaused = new Set();
function holdForPops(slots) {
  if (popOpen()) {
    for (const c of slots?.main ?? []) if (c.card === 'board' && timedOf(boards.get(c.id)?.mod) && !isPaused(c.id)) { setPaused(c.id, true); popPaused.add(c.id); }
    return;
  }
  for (const id of popPaused) setPaused(id, false);
  popPaused.clear();
}

function soloSlots(slots, cards) {
  const inMain = new Set(slots.main);
  const alone = gameAlone(cards, { up: (c) => c.card === 'board' && boardOpenNow(c.id) && (inMain.has(c) || c.id === view.opened?.id), chosen: view.opened?.id ?? null });
  if (!alone) return slots;
  return { ...slots, header: [], main: alone, key: slotKey(alone[0]), solo: true, footer: { ...slots.footer, step: true, waiting: 0, next: null } };
}

/// 此刻 — the one thing, and over it the short notes of what just happened
/// (spoils, a 抉择 told, a way out emerged): a toast inside main, never more
/// cards stacked under it.
function focusHtml(slots) {
  // A fight takes the stage: while one is open, nothing else is on it, and the
  // chat beside it keeps talking (design.md § 斗法在主界面里).
  // The room itself is the mounted game's, in the shell's frame (paintFight); the focus is not drawn over it.
  if (bout) return '';
  // A seal owed or up (a realm risen, a new 回) is the one moment: the next card waits for it to go — never
  // stands first with the gold coming late over it (live, 2026-10-15, 突破).
  if (riseWaits || featOn) return '';
  // One thing at a time: a 回's 「完」 stands alone — 所得 and the other notes wait under it.
  // …and a game up stands alone (queue.js gameAlone): the notes wait under it too (live 10-26: 交差's note over 兽潮 cut its foot off).
  const toasts = slots.main.some((c) => c.card === 'closed') || slots.solo ? '' : toastsHtml();
  // 所得 stands before the way on (live, 2026-10-15: 下一步 stood under it and hid its 收起): the 下一步
  // card waits until it is put away.
  if (spoilsUp()) slots = { ...slots, main: slots.main.filter((c) => c.card !== 'next') };
  return (toasts ? `<div class="toasts">${toasts}</div>` : '') + slots.main.map(drawCard).join('');
}

function toastsHtml() {
  // Walked on, the spoils are put away by themselves.
  const here = look?.place?.id ?? null;
  for (const k of ['spoils', 'trialTold', 'emerged', 'handin']) if (view[k] && view[k].place !== here) keep({ [k]: null });
  return titleCard() + (view.doNote ? `<div class="donote">${esc(view.doNote)}</div>` : '')
    + (view.emerged ? emergedHtml({ ...view.emerged, age: performance.now() - view.emerged.at }, ctx()) : '')
    + (view.trialTold ? trialToldHtml(view.trialTold, ctx()) : '') + (spoilsShown() ? spoilsHtml(view.spoils, spoilsCtx()) : '')
    + (view.handin ? handinHtml(view.handin, ctx()) : '');
}

/* After a won fight, one order, every time (live, 2026-10-15: after 蠪侄 either its death passage or the 所得
   card was lost, by which came first): the passage, then 所得, then the way on. 所得 is kept from the fight's
   end (pending until the rules' answer is in and the passage owed is drawn), shown once no passage is ahead,
   and holds the way on (watchWayOn) until it is put away or he takes the way on himself. */
const spoilsUp = () => Boolean(view.spoils && view.spoils.place === (look?.place?.id ?? null));
const spoilsShown = () => spoilsUp() && !view.spoils.pending && !storyAhead();

/// 此地 — the people of the scene and the goal line; the place is its own line.
const headHtml = (slots) => (bout ? '' : slots.header.map(drawCard).join(''));

/// 行 — the roads, while the chat asks nothing (roadsFree). How many more things wait here is
/// on the 事 chip (moreHtml).
function footRowHtml(slots) {
  if (bout) return '';
  // A key beat running (Look's `lock`): 去往 stays, greyed; a tap says why — the page's, no turn.
  if (look?.lock && stands(headLook(), 'roads')) return heldRoadsHtml(look.lock);
  // In 闭关 and inside a corridor (the prologue) the rules keep the roads off (stageSlots).
  return (slots.footer.roads || roadsFree()) && stands(headLook(), 'roads') ? roadsHtml() : '<span></span>';
}

/// 关键剧情锁图 (design.md § 剧情 × 开放世界): the 去往 chip greyed while the beat runs, its
/// pop the beat's title and its own reason (chapter.json beats `say`) — never a road to tap.
function heldRoadsHtml(lock) {
  const w = words(), open = view.roadsOpen;
  const pop = open ? `<div class="bookpop roadspop held" role="dialog"><div class="cardtitle">${esc(lock.title ?? '')}</div><div class="small dim">${esc(lock.say ?? '')}</div></div>` : '';
  return `<span class="bookwrap roadswrap"><button class="bookchip roadschip held" data-roads aria-expanded="${open ? 'true' : 'false'}" title="${esc(lock.say ?? '')}">${esc(w.roadsChip)} ▾</button>${pop}</span>`;
}

/// 还有 N 件 ›, folded onto the 事 chip (Hanli, 2026-10-15: one chip for what is in hand and what
/// waits) — its own button still, one tap. ONE thing to tap (Hanli, 2026-10-14): while main is the
/// way on — or the box holds the scene's choices itself — nothing is counted; else it names what
/// waits (stage.mjs footer.next).
function moreHtml(slots) {
  const w = words(), next = !slots || choicesInBox() ? null : slots.footer.next;
  if (!next) return '';
  const what = queueLabel(next.cards[0]);
  return `<button class="act quiet more" data-qnext="${esc(slots.key)}" title="${esc(fill(w.queueNext, { what: [what.name, what.kind].filter(Boolean).join(' · ') }))}">${esc(waitingLine({ ...what, more: slots.footer.waiting - 1 }, w))} ›</button>`;
}

/// The roads stand whenever no question waits in the chat, not only while a card holds (live,
/// 2026-10-15: after 山门's 抉择 the stage held only the goal, Ling asked nothing, and there was no
/// way on at all). A question open in the chat keeps them there — one place to tap; a scratch save
/// never asks, so its roads always stand. Never in 闭关 or a corridor (the rules keep them off).
const roadsFree = () => !view.asked?.size && !look?.seclusion && !look?.director?.corridor;

/// The chips in the footer, under the stage, as stage.mjs FOOTER lists them: 木牌 · 节日 · 天气 ·
/// 书 · 事 · 物品 (Hanli, 2026-10-15: 「too much widgets」 — one chip each, none on two lines).
/// 恩仇簿 is written no more (2026-10-03): its chip is off the footer; the
/// ledger itself stays in the save and in Look (ledgerChipHtml, cards.js).
/// A scene on another line (a 今 interlude) keeps the 书; the rest is the 古's (stage.mjs FURNITURE).
/// In a fight only 事 and 物品 stand.
const FOOT_CHIPS = {
  her: () => herTokenHtml(),
  festival: () => festChipHtml(),
  weather: () => wxChipHtml(wxHere(), { lang: lang(), open: view.wxOpen, sense: view.wxSense, note: view.wxNote, wind: PREVIEW.wind ?? look?.wind }),
  books: () => shelfChipHtml(),
  errands: (slots) => `<span class="errands">${bookChipHtml(ctx(), view.bookOpen, view.bookFresh)}${moreHtml(slots)}</span>`,
  bag: () => gearChipHtml(ctx(), view.gearOpen ? (view.pouchPane === 'deck' ? 'deck' : 'items') : null),
};
const IN_A_FIGHT = new Set(['errands', 'bag']);
function footChipsHtml(slots) {
  const head = headLook(), has = (part) => (!bout || IN_A_FIGHT.has(part)) && stands(head, part);
  return FOOTER.filter(has).map((part) => FOOT_CHIPS[part](slots)).join('');
}

/* 书: the 九鼎录 and the novel behind one chip (Hanli, 2026-10-15) — a tap opens both. */
function shelfChipHtml() {
  const w = words(), open = view.shelfOpen;
  const pop = open ? `<div class="bookpop shelfpop" role="dialog">${luChipHtml(lang(), view.luOpen)}${readChipHtml(ctx())}</div>` : '';
  return `<span class="bookwrap"><button class="bookchip shelfchip" data-shelf aria-expanded="${open ? 'true' : 'false'}">${esc(w.shelfChip)}</button>${pop}</span>`;
}

/* 银月 in the footer (proto k, 2026-10-14 choice 13): the 木牌 she sleeps in, once she has been
   met — grey while she sleeps, warm while her words are on the stage (companionBeat); a tap
   is a word to her, as the corner chip's 问问银月 was. Never on 今线 (stage.mjs FURNITURE `her`). */
function herTokenHtml() {
  const c = look?.companion;
  if (!c?.joined || c.away) return '';
  const w = words(), e = codexNow()?.get?.(`${c.id}-fox`) ?? codexNow()?.get?.(c.id);
  const dir = look.world?.made ? `worlds/${look.world.base}` : look.world?.dir ?? 'worlds/jiuding';
  const pic = e?.image ? `<img src="${esc(worldPath(dir, e.image))}" alt="">` : '';
  const label = c.asleep ? w.herAsleep : c.name;
  return `<button class="yytoken${c.asleep ? ' sleep' : ''}${herBub ? ' saying' : ''}" data-ask-her title="${esc(w.askHer.replace('{name}', c.name))}">${pic}<span>${esc(label)}</span></button>`;
}

/* The weather chip names where the hero stands (Hanli, 2026-10-05: 「蒙山·晴」
   at 沉鼎观): the place's own name — the sky may be his city's or 蒙山's
   seasons, which the chip's popover says. */
const wxHere = () => (look?.weather ? { ...look.weather, where: look.place?.name ?? look.weather.where } : null);

/* The backdrop (2026-10-14, the approved prototypes: 「底图 = 天气」): the whole stage, a
   painting of the sky over the scene — its own, else the real one (Look's `weather`: the
   scene's `weather` tag, else the engine's weather sense, else 蒙山's seasons) — by day or by
   night, from the world's declared table (backdrops.json, atmos.js backdropOf). A scene may
   declare its own picture (`backdrop`); a set piece's beat lays its painting over this one
   (beatPiece) and a beast's 出场 its own (watchAppear). 今线 keeps its pale modern stage: no
   picture and no weather. Never chosen by name here; a change cross-fades. */
/* The place the stage stands in, with its painting (Hanli, 2026-10-15: one per location, declared
   in backdrops.json `places`, placeart.js): Look's place, its `backdrop` and `indoor` from the spot
   the scene stands at (its zh name; a 今线 scene by its `scape`). */
/* Day or night on the stage: a sealed instance keeps the book's (第二夜), else the sky's, else the clock's. */
const dayOnStage = () => (look?.sealed?.day ? look.sealed.day.unit !== 'night' : look?.weather?.is_day ?? isDayNow());
function placeHere(isDay = dayOnStage()) {
  const scene = look?.scene, jin = scene?.line === 'jin';
  const art = placeArtOf(authored?.backdrops, { at: look?.place?.id ?? null, name: scene?.spot ?? '', scape: jin ? scene?.scape ?? '' : null }, isDay);
  return art ? { ...look?.place, backdrop: art.src, indoor: art.indoor, night: art.night } : look?.place ?? null;
}
let drawnBackdrop = null;
function paintBackdrop() {
  const dir = look?.world?.made ? `worlds/${look.world.base}` : look?.world?.dir ?? 'worlds/jiuding';
  const own = look?.scene?.backdrop ?? null;
  const day = dayOnStage();
  const weather = PREVIEW.weather ? { kind: PREVIEW.weather } : look?.weather;
  const place = placeHere(day);
  const { tier, art } = stagePick({ scene: { ...look?.scene, backdrop: own }, place, weather, festival: look?.today?.festival, term: look?.today?.jieqi, table: authored?.backdrops, isDay: day, sealed: Boolean(look?.sealed) });
  const src = art ? worldPath(dir, art) : null;
  // A place painted only by day is darkened at night by the stage, not repainted.
  const dim = Boolean(src) && (tier === 'place' || tier === 'sealed') && day === false && !place?.night;
  const key = `${src}|${dim}`;
  if (key === drawnBackdrop) return;
  drawnBackdrop = key;
  const el = $('backdrop');
  if (!el) return;
  el.classList.toggle('painted', Boolean(src));
  for (const old of el.querySelectorAll('.bd:not(.going)')) { old.classList.add('going'); setTimeout(() => old.remove(), 1700); }
  if (!src) return;
  const bd = document.createElement('i');
  bd.className = dim ? 'bd dim' : 'bd';
  bd.style.setProperty('--art', `url("${src.replace(/"/g, '%22')}")`);
  el.appendChild(bd);
  liveBackdrop(bd, src, authored?.backdrops, art); // 画活 (fx-alive.js): what the painting's row says moves, moves
}
/* Day or night by the clock here (the sense's own `is_day` wins where Look carries one). */
const isDayNow = (d = new Date()) => d.getHours() >= 6 && d.getHours() < 18;

/* 节日 · 节气: today's festival as a chip — its task a word to Ling (she
   plays it out and pays it) until done — or the 节气's name, just said. */
function festChipHtml() {
  const t = look?.today, f = t?.festival;
  if (f) {
    const title = `${f.name} · ${f.task.what}`;
    return f.task.done
      ? `<span class="bookchip festchip done" title="${esc(title)}">${esc(f.name)}</span>`
      : `<button class="bookchip festchip" data-say="${esc(f.task.label)}" title="${esc(title)}">${esc(f.name)} · ${esc(f.task.label)}</button>`;
  }
  return t?.term ? `<span class="bookchip festchip term">${esc(t.term.name)}</span>` : '';
}

/* The atmosphere over the stage (atmos.js): the festival's dressing and the
   day's weather. The particles are laid again only when the layer changes, so
   a redraw never restarts them. */
let atmosKey = null;
function paintAtmos() {
  // 今线 has no weather (Hanli, 2026-10-14: a pale modern stage) — and no festival dressing of the 古's.
  const jin = look?.scene?.line === 'jin';
  const wind = PREVIEW.wind ?? look?.wind ?? null, indoor = indoorOf(look?.scene, placeHere());
  const sky = { season: PREVIEW.season ?? look?.season?.kind, isDay: look?.weather?.is_day ?? isDayNow(), wind, indoor };
  // Sealed (Look's `sealed`): no festival, weather, season or wind — the rooms as they are.
  const a = jin || look?.sealed ? atmosOf(null, null, look?.sealed ? { indoor: true } : {}) : atmosOf(look?.today?.festival?.dressing, PREVIEW.weather ?? look?.weather?.kind ?? null, sky);
  const v = $('view');
  for (const [k, val] of Object.entries(windVars(wind, { indoor }))) v.style.setProperty(k, val);
  for (const c of [...v.classList]) if (c.startsWith('season-')) v.classList.remove(c);
  for (const c of [...v.classList]) if (c.startsWith('fest-') || c.startsWith('wx-')) v.classList.remove(c);
  v.classList.add(...atmosClasses(a));
  // 今线 (an interlude, Look's scene `line: jin`): a pale modern stage — the scene's `scape` (track, court, stacks …) names which.
  for (const c of [...v.classList]) if (c === 'jin' || c.startsWith('jin-')) v.classList.remove(c);
  if (look?.scene?.line === 'jin') v.classList.add('jin', ...(look.scene.scape ? [`jin-${look.scene.scape}`] : []));
  if (a.key === atmosKey) return;
  atmosKey = a.key;
  $('atmosPts').innerHTML = particlesHtml(a.particles, look?.today?.date ?? '');
  liveWeather($('atmosPts'), a.particles, look?.today?.date ?? '').catch(() => null); // snow, rain, fog in WebGL where it can (fx-weather.js); the CSS spans otherwise
}

/* 天气 — the engine's weather sense (skill-spec § Senses): the city is the
   player's, set here (the chip's popover), and the engine reads the sky;
   the game never goes online. Look carries the result as `weather`. */
async function senseCall(body = null) {
  try {
    const res = await fetch('/api/senses/weather', body ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    return { ok: res.ok, status: res.status, sense: res.ok ? await res.json() : null };
  } catch (e) {
    console.warn('[lingjing] weather', e);
    return { ok: false, status: 0, sense: null };
  }
}
/* The footer's popovers, one open at a time: each opener shuts the rest (2026-10-15 review — 天气 then
   事 left both open, stacked on one anchor; the openers sit before the '*' catch-all, so it never ran). */
const POPOVERS = ['bookOpen', 'roadsOpen', 'shelfOpen', 'wxOpen', 'ledgerOpen', 'gearOpen'];
const othersShut = (open) => Object.fromEntries(POPOVERS.filter((k) => k !== open).map((k) => [k, false]));

async function openWx() {
  show({ wxOpen: !view.wxOpen, wxNote: null, ...othersShut('wxOpen') });
  if (!view.wxOpen) return;
  const r = await senseCall();
  show({ wxSense: r.sense, wxNote: r.ok ? null : cityNote(r, lang()) });
}
async function setSense(body) {
  const r = await senseCall({ ...body, lang: lang() });
  if (r.ok && body.city) skyDraft.city = '';
  show({ wxSense: r.sense ?? view.wxSense, wxNote: cityNote(r, lang()) });
  if (r.ok) await refresh();
  return r;
}

/* 银月 on a festival: she hears the day once (a fact, and the kind of thing
   she might say — festivals.json `her`), in her own words. Never on a preview. */
let festivalsData;
async function festivalMoment() {
  const f = look?.today?.festival;
  if (!f || PREVIEW.day || !herHere()) return;
  const mark = `${look.today.date}:${f.id}`, KEY = 'lingjing:festival-told';
  try { if (localStorage.getItem(KEY) === mark) return; } catch { /* no storage: at most once a load */ }
  if (festivalMoment.told === mark) return;
  festivalMoment.told = mark;
  if (festivalsData === undefined) festivalsData = await content(authored?.dir ?? look.world.dir, 'festivals.json').catch(() => null);
  const her = festivalsData?.festivals?.find((x) => x.id === f.id)?.her;
  const zh = `今天是真实世界里的${f.name}。${her ? `你也许会说：「${her.zh}」——用你自己的话。` : ''}`;
  const en = `Today is ${f.name} in the real world.${her ? ` You might say: “${her.en}” — in your own words.` : ''}`;
  const { verdict } = voice.moment('festival', { zh, en }, { mood: 'happy' });
  if (verdict === 'sent') { try { localStorage.setItem(KEY, mark); } catch { /* fine */ } }
  else festivalMoment.told = null;
}

/* The day's practice waits in the tray: a board comes onto the stage when he
   opens it there, when Ling shows it, or when this place hosts it or an errand
   asks for it here. */
const tideBoard = (id) => Boolean((look?.tasks ?? []).find((t) => t.id === id)?.tide);
function inQueue(c) {
  if (c.card !== 'board') return true;
  // Done for the day (the tray's 已完成), it never queues — opened, shown or hosted (stage.mjs).
  if (boardDoneToday(look, c.id)) return false;
  if (view.opened?.id === c.id || view.focus.some((f) => f.card === 'board' && f.id === c.id)) return true;
  // A scene that stands its board on the stage (the prologue's 二试, the first practice).
  if ((look?.scene?.show ?? []).some((f) => f.card === 'board' && f.id === c.id)) return true;
  const task = look?.tasks?.find((t) => t.id === c.id);
  // …and a board left on an earlier day that he chose to try again (再试一回, rules/skips.mjs).
  return !task || Boolean(task.hosted || task.for_errand || task.replay);
}

/// What waits, by its own name and its kind (「蠪侄 · 图鉴」): a face or a thing from the 图鉴,
/// a board by its task's title, a 传闻 by its label; else the kind alone.
function queueLabel(c) {
  const w = words(), kind = w.queueKinds[c.card] ?? '';
  if (c.card === 'board') return { name: look?.tasks?.find((t) => t.id === c.id)?.title ?? '', kind };
  if (c.card === 'tale') return { name: look?.tale?.label ?? '', kind };
  if (c.id && ['creature', 'codex', 'meet'].includes(c.card)) return { name: codexNow()?.get?.(c.id)?.name ?? '', kind };
  // A kind with no word is never shown raw (live, 2026-10-15: 「还有：next ›」).
  return { name: '', kind };
}

function putOff(key) {
  show({ qSkip: [...view.qSkip.filter((k) => k !== key), key] });
}

function spoilsCtx() {
  return {
    catalog: cardCatalog(), artBase: artBase(), lang: lang(), words: BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh,
  };
}

/* A fight the save holds open that the page is not in (walked out of, or its settle refused, 「这一战没记上」):
   its own card, with the way back in — never a blank stage (2026-10-15: the stage held one 'fight' card
   and nothing drew it). The scene's or the haunt's duel card when it has one; else a card that re-opens it. */
function fightLeftHtml() {
  const id = look?.fight?.game;
  if (!id) return '';
  const own = cardHtml({ card: 'duel', id }, ctx());
  if (own) return own;
  return `<div class="card duel"><div class="cardtitle">${esc(look.fight.creature ?? '')}</div><div class="acts"><button class="act" data-duel-start="${esc(id)}">${esc(words().fightBack)}</button></div></div>`;
}
const PAGE_CARDS = { fight: () => fightLeftHtml(), unfold: () => cardHtml({ card: 'map' }, { ...ctx(), mapView: 'province', unfold: view.unfold }), memory: () => memoryHtml(), homing: () => homingHtml(), doors: () => doorsHtml(view.doors?.node, { lang: lang(), still: stillMotion(), age: performance.now() - (view.doors?.at ?? performance.now()) }) };
const drawCard = (c) => (PAGE_CARDS[c.card] ?? (() => cardHtml(c, ctx())))();
const inkNames = () => Object.fromEntries(Object.keys(look?.world?.atlas?.provinces ?? {}).map((id) => [id, authored?.dictionary?.provinces?.[id]?.[lang()] ?? id]));
const homingHtml = () => (view.homing && atlasPlaces?.ink ? homingCardHtml(inkGeo, atlasPlaces.ink, { province: view.homing.province, frame: view.homing.frame, age: performance.now() - view.homing.at, still: view.homing.still || stillMotion(), lang: lang(), names: inkNames(), labels: look?.world?.atlas?.provinces, paint: inkPaint(), fx: Boolean(view.homing.fx) }) : '');

/* 鼎归 in WebGL (fx.js): one Pixi Application per moment, kept across the stage's
   redraws — its box is put back into the card's empty slot after each one — and
   destroyed when the card goes. If it cannot start, the card draws the SVG moment. */
let fxRun = null; // { homing, ctl, host } while the WebGL moment is on
function holdFx() {
  const slot = document.querySelector('.card.homing .homingmap[data-fx]');
  if (!slot || !view.homing?.fx) { if (fxRun) { fxRun.ctl?.destroy(); fxRun.host?.remove(); fxRun = null; } return; }
  if (fxRun && fxRun.homing === view.homing.at) { if (fxRun.host) slot.appendChild(fxRun.host); return; }
  fxRun?.ctl?.destroy();
  const run = { homing: view.homing.at, ctl: null, host: null };
  fxRun = run;
  const h = view.homing;
  playHomingFx(slot, { geo: inkGeo, ink: atlasPlaces.ink, province: h.province, frame: h.frame, paint: inkPaint(), names: inkNames(), labels: look?.world?.atlas?.provinces, lang: lang(), still: h.still || stillMotion() })
    .then((ctl) => {
      if (fxRun !== run) { ctl.destroy(); return; }
      run.ctl = ctl; run.host = ctl.host;
      if (view.homing?.still) ctl.skip();
      console.info('[lingjing] fx', { pixi_ms: fxTimes.pixi, gsap_ms: fxTimes.gsap });
      const now = document.querySelector('.card.homing .homingmap[data-fx]');
      if (now && ctl.host.parentElement !== now) now.appendChild(ctl.host);
    })
    .catch((e) => {
      console.warn('[lingjing] fx — the SVG moment instead', e);
      if (fxRun === run) fxRun = null;
      if (view.homing?.at === run.homing) show({ homing: { ...view.homing, fx: false } });
    });
}
/// The world's ink painting of the map (world.json atlas.paint), where the 鼎归 map shows it.
const inkPaint = () => (atlasPlaces?.ink?.paint && look?.world?.dir ? { href: worldPath(look.world.dir, atlasPlaces.ink.paint) } : null);
/// 银月's memory: ink blooming into colour, carried on from its age on a redraw.
const memoryHtml = () => (view.memory ? memoryCardHtml(view.memory.play, { i: view.memory.i, age: performance.now() - view.memory.at, still: stillMotion(), artBase: artBase(), lang: lang() }) : '');

/// The roads stand on the page whenever no question waits in the chat (roadsFree, d35307df) —
/// quiet must never be stuck (2026-09-18: 「起卦完成, 任务卡住了」; a market had no way out but
/// the map). A tap is the same one Move the chat's option would have been; a question open in
/// the chat keeps them there — never both.
/// One chip, 「去往 ▾」, its roads in a list over the stage (Hanli, 2026-10-15: six road buttons
/// ran off the footer). The same taps as before, one tap further in.
/// Standing in a painted small area (沉鼎观, 观内 2026-10-15), the list opens on its painting:
/// every place of it a spot (plate.js), and below it only the roads that lead off the painting.
function roadsHtml() {
  const near = look?.director?.near ?? [], plate = look?.place?.plate;
  if (!near.length && !plate) return '';
  const w = words(), open = view.roadsOpen;
  const onPlate = new Set((plate?.spots ?? []).map((s) => s.id));
  const off = near.filter((p) => !onPlate.has(p.id));
  // 铺子 (Look's `shops`): a road to an open shop says its kind after the name (shopmark.js).
  // 斗 (Look's `fights`, rules/fights.mjs): a road to a beast standing now, inked by how hard it is (fightmark.js).
  const shops = shopsById(look), fights = fightsById(look);
  const chips = off.map((p) => `<button class="act go" data-go="${esc(p.id)}">${esc(p.name)}${shopTagHtml(shops.get(p.id))}${fightMarkHtml(fights.get(p.id), oddsFor, lang())}</button>`).join('');
  const painted = plate && look?.world?.dir ? plateHtml(plate, { src: plate.file ? worldPath(look.world.dir, plate.file) : null, here: w.needHere, threads: threadsAt(look), shops, fights, odds: oddsFor, lang: lang() }) : '';
  const pop = open ? `<div class="bookpop roadspop${painted ? ' plated' : ''}" role="dialog"><div class="cardtitle">${esc(painted ? plate.name : w.roads)}</div>${painted}${chips ? `<div class="roadlist">${chips}</div>` : ''}</div>` : '';
  return `<span class="bookwrap roadswrap"><button class="bookchip roadschip" data-roads aria-expanded="${open ? 'true' : 'false'}" title="${esc(near.map((p) => p.name).join(' · '))}">${esc(w.roadsChip)} ▾</button>${pop}</span>`;
}

/* A slot redrawn only when what it holds changed — or what the chat asks,
   which marks the slot's buttons it repeats (draw's answered-in-chat). */
const painted = {};
/* 主页's bar (cards.js homeHtml): drawn where it stood last, then moved to now on the next frame — a gain is seen
   to land (Hanli 10-27: every board, fight, hand-in and 闭关 comes back to it, the bar visibly moved). */
let homePct;
function moveHomeBar() {
  const bar = $('focus').querySelector('.homebar i[data-to]');
  if (!bar) return;
  const to = Number(bar.dataset.to);
  if (homePct === to) return;
  homePct = to;
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${to}%`; }));
}

function paintIf(id, html) {
  const key = `${html}\u0000${[...(view.asked ?? [])].join('|')}`;
  if (painted[id] === key) return;
  painted[id] = key;
  const kept = keptScroll($(id));
  $(id).innerHTML = html;
  kept();
}

/* A repaint of the same beat keeps where its scrolled parts stood (live, 2026-10-15: a 看 chip tapped
   in the box threw its choices back to the top, the finding out of sight). A new beat starts at the top;
   the 回看 log keeps its own rule (logAtEnd). */
const KEEP_SCROLL = ['.story .wayacts', '.story .wholecol'];
function keptScroll(el) {
  const beat = el?.querySelector?.('.story')?.dataset.story;
  const at = beat == null ? [] : KEEP_SCROLL.map((sel) => el.querySelector(sel)?.scrollTop ?? 0);
  return () => {
    if (!at.some(Boolean) || el.querySelector('.story')?.dataset.story !== beat) return;
    KEEP_SCROLL.forEach((sel, i) => { const box = el.querySelector(sel); if (box && at[i]) box.scrollTop = at[i]; });
  };
}

/* Every writer calls `render()`; the drawing happens once, on the next frame.
   Twenty-six call sites used to mean twenty-six repaints, and a handler that
   forgot one left the screen behind the state. Now a burst — a tap, a Look, a
   Show, a stream token — costs one draw. */
let frame = null;
function render() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; draw(); beats.attach(); });
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
  trackReading();
  const had = focusKey(document.activeElement);
  const w = words();
  document.documentElement.lang = lang();
  // The finale's switch (memory.js): the ink comes off every picture at once.
  document.documentElement.classList.toggle('colour', colourOn(look));
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
  // The header — place, caption, people, the sky — changes only when the story gets there: while the
  // box still tells the passage of the choice that left the last scene, that scene's header holds
  // (his, 2026-10-14: 「天快亮」 and 阿禾 over 马小宝's taunt at dusk).
  // The box's reading is the real scene's: read it before the header stands on the held one
  // (live 2026-10-14: read under the held 00-notice it was none, and the 回 line turned to 今 · 一).
  const realLook = look, told = readingHere();
  look = headLook();
  try {
  paintAtmos();
  paintBackdrop();
  // The 回 above the place, as the book names and numbers it (古五: 「卷一 · 沉鼎 · 第十回　古 · 漏勺夜半通三关」 once 今五 is in, rules/hui.mjs).
  // The old 回's last passage still in the box keeps its own 回 line (queue.js huiLineOf).
  // The ended 回's line comes with its close (rules/story.mjs closeOf `line`): a fresh tab at the turn has it too.
  const titles = (huiTitles[lang()] ??= {}), ended = look.chapter?.close;
  if (look.chapter?.hui) titles[look.chapter.hui] = look.chapter.title;
  if (ended?.id && ended.line) titles[ended.id] = ended.line;
  // Under the old 回's 「完」, its own line holds with its header (headLook).
  const closing = closeUp() ? ended?.id ?? null : null;
  $('huiLine').textContent = look.chapter?.hui ? huiLineOf({ hui: look.chapter.hui, title: look.chapter.title, telling: closing ?? huiAt(told), titles }) : '';
  // Inside a sealed instance: 「沉鼎秘境 · 第二夜 · 石室」 — the instance, the book's night, the room (rules/sealed.mjs).
  $('place').textContent = look.sealed ? [look.sealed.header, look.sealed.where].filter(Boolean).join(' · ') : look.scene?.place ?? look.chapter?.close?.place ?? look.place?.name ?? look.chapter?.title ?? '';
  // The scene's caption, small under the place (2026-10-14: never a beat in the box — told three times).
  // The bar is thin now (2026-10-14): the caption keeps its small line where there is room, and is the place's title always.
  $('place').title = (look.scene?.panel?.caption ?? []).join(' ');
  // 「有铺子 · 药铺」 beside the place where he stands at an open shop (shopmark.js; Look's `shops`, steps 0) —
  // only while the header names that place, not a scene's room in it (邺城's 东街市 under 「邺城 · 客栈」).
  const headIsPlace = !look.sealed && !look.chapter?.close?.place && (!look.scene?.place || look.scene.place === look.place?.name);
  $('placeShop').innerHTML = headIsPlace ? shopHereHtml(look, lang()) : '';
  $('placeCap').textContent = (look.scene?.panel?.caption ?? []).join(' ');
  } finally { look = realLook; }
  // She is always at the player's side: on the stage whenever the game is
  // open, scene or road, not only where a scene casts her.
  $('stage').hidden = false;
  // She stands there only once she has been found (his rule, 2026-09-17) —
  // as the moon and her name, never her 3D body: in this world she is the
  // silver fox of the story, and the desktop girl did not fit it (his,
  // 2026-09-29: 「3D 模型就不用放在webUI了吧，和剧情合不上」).
  const her = herUp() && !bout;
  holdHerVoice(herUp());
  tellCompanion(companionShown(look));
  // Her name and the ask are the footer's 木牌 now (footChipsHtml herTokenHtml); the corner chip
  // stays empty — unease.js still draws her price on its frame (#stage .body).
  $('stageName').textContent = '';
  $('askHerBtn').hidden = true;
  const cast = look.divination ? JSON.stringify(look.divination.throws) : null;
  keep({ castFresh: view.castSeen !== undefined && cast !== null && cast !== view.castSeen, castSeen: cast });
  if (view.castFresh) readingByHer(look.divination);
  // The slots stay put; only what fills them changes. The header and the
  // footer are redrawn only when they changed (a stream token must not
  // restart a portrait's fade or reset a chip's pop).
  const slots = bout ? null : stageNow();
  // A game up, or one of the page's moments (a set piece, a seal, her memory…): it stands alone, the tray put
  // away with the rest (queue.js gameAlone) — and the stage takes the tray's height, so no board is cut off.
  const solo = Boolean(slots?.solo) || momentUp();
  document.body.classList.toggle('solo', solo);
  holdForPops(slots);
  { const realLook = look; look = headLook(); try { paintIf('headCards', headHtml(slots && look !== realLook ? { ...slots, header: headOf(look) } : slots)); } finally { look = realLook; } }
  paintIf('footRow', footRowHtml(slots));
  paintIf('footChips', footChipsHtml(slots));
  if (bout) paintFight(bout); else { $('focus').innerHTML = focusHtml(slots); moveHomeBar(); }
  // The story on the full stage (lines.js): the beat's words over the picture, a sentence at a time.
  // 景: a beat marked with its set piece lays the piece's picture under its words (beatPiece).
  matchPace();
  beatPiece(slots);
  const box = dialogBoxHtml(slots);
  paintIf('dlg', box);
  logAtEnd();
  holdBlank(box);
  document.body.classList.toggle('storying', box.includes('data-dlg-on'));
  syncLines();
  companionBeat(box.includes('data-dlg-on'));
  paintHerBub();
  // 初见: his first beat on show, he stands large on the stage (sight.js); at 快, the faces whose
  // 亮相 falls on the page on show, in the upper half over the band (pageSight).
  paintSight($('sight'), !box.includes('data-dlg-on') ? [] : readingHere()?.all?.whole ? pageFaces() : sightNow(readingHere(), firstFaces(), lang()), { src: faceSrc });
  voiceBeat(box.includes('data-dlg-on'));
  // Games, the map and a fight fold the chat away (they want the width); the story keeps it open.
  foldFor(slots);
  holdFx();
  keep({ castFresh: false });
  drawLu();
  drawPouch();
  // The tray holds the world's boards; with none today it is not there at all
  // — 「今日无事」 under a book with things in it was a contradiction.
  $('trayTitle').textContent = w.tray;
  // What already stands on the stage is not listed again in the tray (Hanli, 2026-10-05: the 九宫格 twice).
  // A scene's own game is not at hand before its passage reaches it (his, 2026-10-14: 接雨 in the tray at load).
  const gamesAhead = storyAhead() ? (look.scene?.show ?? []).filter((c) => c.card === 'board').map((c) => c.id) : [];
  $('tray').innerHTML = !solo && stands(headLook(), 'tray') ? trayHtml({ ...ctx(), onStage: [...(slots?.main ?? []).map((c) => c.id).filter(Boolean), ...gamesAhead], trayQueued: view.opened && trayAhead() ? view.opened.id : null }) : '';
  $('tray').parentElement.hidden = !$('tray').innerHTML;
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
  // A won fight's way on, once its passage is read and its 所得 put away (watchWayOn; tried once per exit).
  watchWayOn();
  noteInView();
}

/* A refusal is said where the eye is (2026-10-16: at 390 the 阶段任务 line stood under the choices,
   below the box's fold — a tap that seemed to do nothing). Every refusal note (`.donote`: a scene's
   choice, a tap on the stage, the pouch, the cauldron) is brought into view the draw it first
   appears — `nearest`, so one already in sight never moves the page. */
let noteSeen = '';
function noteInView() {
  const el = [...document.querySelectorAll('.donote')].find((n) => n.offsetParent);
  const text = el?.textContent ?? '';
  if (text && text !== noteSeen) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  noteSeen = text;
}

/* The pills' names and paintings for the fight's 丹囊 tray. */
function pillWords() {
  const items = (authored?.codexFiles?.items?.items ?? []).filter((i) => i.effect?.fight);
  return { pillNames: Object.fromEntries(items.map((i) => [i.id, i.name?.[lang()] ?? i.name?.zh ?? i.id])), pillArt: Object.fromEntries(items.filter((i) => i.art).map((i) => [i.id, i.art])) };
}

/* What the fight's card draws itself from: this world's cards, this world's
   pictures, and the words of the language in play. */
/* Her word on a lost fight's closing card, once it has come (her own, or the 木牌's pool). */
const lossLine = (b) => (b?.lossOut?.id != null && herSay.st.line?.id === b.lossOut.id && herSay.st.line.from !== 'wait' ? herSay.st.line.text : null);
function boutCtx() {
  const c = bout.brief.creature;
  return {
    catalog: cardCatalog(), artBase: artBase(),
    lang: lang(), words: boutWords(BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh, c, lang()),
    board: bout.st.mode.board,
    title: duelTitle(c, words(), lang()),
    foeName: c.name, foeArt: c.art ? `${artBase()}${c.art}` : null,
    youName: look.name ?? '', herName: look.companion?.name ?? null, herCard: look.companion?.id ?? null,
    // 小队 (battle-party.js): who stands beside him, and the cards new since the last fight (新).
    party: bout.brief.setup?.you?.party ?? [], fresh: bout.brief.setup?.you?.fresh ?? [],
    // 丹囊 (danang.js): each pill's name and painting, from the world's items.
    ...pillWords(),
    // The closing card waits for the rules' word, not for the last blow (the room's, games/kapai.js).
    ended: Boolean(boutRoom(bout)?.room().ended),
    // Why this fight, and who speaks in it (the brief carries them when the story gives them). The foe's first
    // word and 银月's lines stand in the shell's bubble over the room (paintHer), not in it.
    stake: bout.brief.stake ?? null, says: { ...(boutSays(bout.brief.says, bout.st.outcome) ?? {}), foe: null, her: lossLine(bout) },
    // 问银月 (fightsay.js): only while she walks with him here, and its count left.
    herAsk: herFights(bout) && bout.say ? { can: bout.say.canAsk(boutView(bout.st)), left: bout.say.asksLeft(), name: look.companion?.name ?? words().yinyue } : null,
  };
}

/* Never a blank stage while the next thing is on its way (live, 2026-10-15: 6–9 s of bare picture after a
   set piece was skipped, ~3 s after 「算了」 — the rules' answer, the passage owed, being drawn): a quiet
   「……」 stands until it comes (it fades in after a moment, so a quick answer never flashes it). Not while
   a fight, a seal or a set piece holds the stage — those are the thing on it. */
const inTransit = () => Boolean(inFlight.size || view.panelBusy || look?.tell_owed || drawingTold || memoryWaits || homingPending);
let blankSince = 0;
function holdBlank(box) {
  const focus = $('focus');
  if (box || bout || riseWaits || featOn || pieceOn || view.appearing || !focus || focus.innerHTML.trim() || !inTransit()) { blankSince = 0; return; }
  // Every draw lays the focus anew: the fade keeps its own clock across them (a negative delay picks it up).
  blankSince ||= performance.now();
  const late = Math.round(700 - (performance.now() - blankSince));
  focus.innerHTML = `<div class="card waitcard" aria-busy="true" style="animation-delay:${late}ms"><span aria-hidden="true">……</span></div>`;
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
  tracker.answer(name, r);
  if (r?.ok) syncSoon();
  // A scene choice's refusal («九个格子还没填对») stands until the next move
  // lands: the board won under it, the note would still say the wall holds.
  if (r?.ok && name !== 'resolve' && view.panelNote) keep({ panelNote: null });
  return r;
}
const failed = (e) => ({ ok: false, error: String(e) });
/// A refusal in the rules' own words, else the page's one line for it.
/* The fights chosen in this scene by their words (look.mjs panelOf `duel`), and any
   fight the save holds open or already met here — those need no choosing again. */
/* A fight's words chosen (站着，不跪 · 三试 · 听真头): its card comes up — and the box, its last
   beat read with the choice in it, is put away, so 出手 never stands over its 「继续」. */
function callDuel(id) {
  const called = [...(view.called ?? []), `${look?.scene?.id}|${id}`];
  const r = readingOfPlay();
  if (playing(r) && atLast(r, lang())) setReading(advance(r, lang()), { called });
  else show({ called });
}
function calledDuels() {
  const here = look?.scene?.id;
  const ids = (view.called ?? []).filter((k) => k.startsWith(`${here}|`)).map((k) => k.slice(here.length + 1));
  if (look?.fight?.game) ids.push(look.fight.game);
  for (const e of look?.scene?.exits ?? []) if (e.game?.kind === 'duel' && (e.won || e.withdrawn)) ids.push(e.game.id);
  return new Set(ids);
}
const refusal = (r) => r?.say || words().refused?.[r?.refused] || words().notDone;

/* ── The board: the one thing the page reports ── */

/* A board's last line is read before it closes (2026-10-01: 「手指一松…轰然倒下」
   never showed — the win took the board off the stage at once). */
const WIN_LINE_MS = 2800;
/* The scene's way on that waited on this board (exit `needs.task`): the win
   is that deed, so it is taken — live, 射鹿 won still offered 往左偏半寸 /
   照直射, 洗髓 still offered 泡进去 / 爬出来. A board that ends with a
   `grade` (2026-10-14's opening beats) takes the exit that waits on that
   grade (`needs.grade`, 喂饼's 分它一半 / 自己吃); and only one way on is ever
   taken for him — two that wait on the same board (算账's 装傻 / 照实说)
   are his to choose. */
// A board left has no grade: every way on that waits on one is his to choose (rules core.mjs meets).
const gradeFits = (e, grade, left = false) => left || e.needs?.grade == null || [e.needs.grade].flat().includes(grade);
// A way on that also waits on a step of the story not yet taken (`needs.mark`: 古八's 入秋 waits on the 大比 too) is not
// the board's deed: the win takes it only once that mark is his — and not the other side of a fork he did not take
// (`needs.no_mark`: 守灶台's raindrop by the way 00-masan went, 2026-10-22).
const markMet = (e) => (!e.needs?.mark || (look?.marks ?? []).includes(e.needs.mark)) && !(look?.marks ?? []).includes(e.needs?.no_mark);
const winExit = (taskId, grade = null, left = false) => {
  const ways = (look?.scene?.exits ?? []).filter((e) => e.needs?.task === taskId && !e.stay && gradeFits(e, grade, left) && markMet(e));
  return ways.length === 1 ? ways[0] : null;
};
/* `winning` holds until Look has caught up with the win (settleWin's refresh), not only through the
   pause: in between Look still says the task is offered and unwon, and a draw would deal the won
   board fresh for a moment (board-deal.js; live 2026-10-16, 算账's beat). */
async function onWin(taskId) {
  // How it went, read off the board that was won — before the pause, while it is still that board.
  const won = boards.get(taskId), grade = won?.state?.grade ?? null;
  if (won) won.winning = true;
  try { await pause(stillMotion() ? 1200 : WIN_LINE_MS); return await settleWin(taskId, won, grade); } finally { if (won) won.winning = false; }
}
async function settleWin(taskId, won, grade) {
  // A board the scene stands on its stage is a story beat (the opening's 接雨, 射鹿 …), not a day's practice.
  const story = (look?.scene?.show ?? []).some((c) => c.card === 'board' && c.id === taskId);
  if (isTale(taskId)) return taleWon(taskId);
  if (isArcadeBoard(taskId)) return arcadeWon(taskId, grade);
  const stars = won?.state?.stars; // a small game's stars (喂饼's corners), kept on the save
  const r = await write('win', { id: taskId, ...(grade ? { grade } : {}), ...(Number.isFinite(stars) ? { stars } : {}) }).catch(failed);
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
  tracker.boardEnd(taskId, 'won', { stars, grade });
  if (isTask(taskId)) await payWin(taskId);
  else await report(`[scene] won ${taskId}`);
  // A won board that is not the scene's own (opened from the tray or 事, an errand's, 兽潮's …) leaves the stage once
  // paid: what it paid (所得), the errand handed in (交差) and the next step stand there instead — never a won board
  // with nothing after it (live 10-27: 周衡's 五子棋 sat 「成了」 with no way on).
  if (!story) leaveWonBoard(taskId);
  await refresh();
  bringWonIntoFocus();
  // The one hook for what follows a won beat (beat-won.js: the 得牌 reveal listens here).
  if (story) beatWon(taskId, { grade });
  const on = winExit(taskId, grade);
  // A passage owed after the game (the rest of the scene's, `story_after`): the box tells it first,
  // and the way on stays his to take — never tapped over the words still to come.
  if (on && !look?.tell_owed) await panelTap(on.id, look?.scene?.panel?.taps?.find((t) => t.id === on.id)?.label ?? on.id);
  return true;
}

/* A won board off the story's own stage: put away — the tray's opened board, Ling's Show of it, its live state. */
function leaveWonBoard(taskId) {
  boardTitles.set(taskId, boardTitles.get(taskId) ?? titleOf(taskId));
  if (view.opened?.id === taskId) keep({ opened: null });
  if (view.focus.some((f) => f.card === 'board' && f.id === taskId)) keep({ focus: view.focus.filter((f) => !(f.card === 'board' && f.id === taskId)) });
  boards.delete(taskId);
}
/* The title a board opened with (its task's), remembered past the win (cards.js keeps it on the card). */
const boardTitles = new Map();
const titleOf = (id) => look?.tasks?.find((t) => t.id === id)?.title ?? null;

/* A 试玩 board won (arcade-board.js): nothing to pay, nothing told to Ling — the grade on the note,
   and the board dealt again. */
function arcadeWon(taskId, grade) {
  tracker.boardEnd(taskId, 'won', { grade });
  boards.delete(taskId);
  keep({ doNote: `${lang() === 'en' ? 'Won' : '成'}${grade ? ` · ${grade}` : ''}` });
  render();
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
  else tracker.boardEnd(id, 'won');
  return taleDone(r);
}
const taleAnswer = async (answer) => taleDone(await write('tale', { action: 'answer', answer }).catch(failed));

/// Practice `done`, from the page. An empty pool keeps the win: it is paid
/// once 体力 is back (payKeptWins, on the next Look that has it).
async function payWin(id) {
  const r = await write('task', { action: 'done', id }).catch(failed);
  if (!r.ok && r.refused !== 'no-stamina') console.warn('[lingjing] practice done refused', r);
  keep({ doNote: r.ok ? null : refusal(r) });
  // A rerun's 拾遗 (rules/rerun.mjs): what it found stands as 所得, with its line.
  if (r.ok && r.found?.length) keep({ spoils: { place: look?.place?.id ?? null, cards: [], items: r.found.filter((d) => !d.stored), paid: null, spent: [], line: r.line ?? null } });
  // Every win shows what it paid (古五, 2026-10-15: a board won moved only the strip): 修为 · 灵石 and the
  // thing granted stand as 所得, with the task's own line.
  else if (r.ok && boardPaid(r)) keep({ spoils: { place: look?.place?.id ?? null, cards: [], items: boardItems(r.paid), paid: r.paid, spent: [], line: r.line ?? null } });
  return r;
}

const boardPaid = (r) => Boolean(r.paid?.progress || r.paid?.wealth || (r.paid?.item && !r.paid.stored));
function boardItems(paid) {
  if (!paid?.item || paid.stored) return [];
  const it = authored?.codexFiles?.items?.items?.find((i) => i.id === paid.item);
  const name = it?.name?.[lang()] ?? it?.name?.zh ?? it?.name;
  return typeof name === 'string' ? [{ id: paid.item, name, n: 1 }] : [];
}

/// 刷副本 (rules/rerun.mjs): in at the door, out from any room — the page's own verb.
async function rerunTap(action) {
  const r = await write('rerun', { action }).catch(failed);
  if (!r.ok) return noteAWhile(refusal(r));
  keep({ spoils: null, doNote: r.say ?? null });
  await refresh();
}

/// A board won while 体力 was empty, paid now it is back — the same day,
/// as the rules keep it. Once per Look, one at a time. Never while 闭关 holds
/// the world, and a refusal never redraws: a refused pay that refreshed ran
/// Look → pay → refused → Look… and the redraw swallowed the 出关 tap
/// (2026-09-25, "出关按钮没有反应" — it took several clicks).
let payingKept = false;
async function payKeptWins() {
  if (payingKept || !look || look.stamina?.empty || look.fight || look.seclusion) return;
  const kept = (look.tasks ?? []).filter((t) => t.won && t.status !== 'done');
  const tale = Boolean(look.tale?.step?.won);
  if (!kept.length && !tale) return;
  payingKept = true;
  let paid = false;
  try {
    for (const t of kept) paid = (await payWin(t.id))?.ok || paid;
    if (tale) {
      const r = await write('tale', { action: 'turn' }).catch(failed);
      if (r.ok) paid = (await taleDone(r)) || paid;
      else keep({ doNote: refusal(r) });
    }
  } finally {
    payingKept = false;
  }
  if (paid) await refresh();
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
  // A chatless test save (`&chat=off`): the word is shown, the turn ends.
  if (CHATLESS) { if (!hidden && !/^\[[a-z]+\]/.test(text)) keep({ doNote: `${SCRATCH_BADGE} · 「${text.split('\n')[0]}」` }); turnEnded(); return; }
  // A hidden report (`[scene] won gate-longzhi`) is Ling's alone: nothing of it on the stage — its code words
  // read as noise there (古九's tester, 2026-10-15). A word he said shows, plain, as said.
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
  // An errand finished by this arrival with what it found (`seen`: the 香烛铺's ledger) — on the stage, with the
  // way back to the story (live, 2026-10-15: the payoff never showed; only Ling was told, and a scratch save
  // tells no one).
  const found = (r.met ?? []).find((m) => m.seen);
  if (found) show({ handin: { place: look?.place?.id ?? null, title: found.title ?? '', seen: found.seen, paid: (r.handed ?? []).find((h) => h.id === found.id)?.paid ?? null } });
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
  if (herHere()) askHer('seclude', `玩家刚入关闭关，专心修${focusFacts(e, true)}${pill.zh}。时辰按真实时间算，至多 ${e.cap} 小时。你在一旁护关。`,
    `The player has just gone into seclusion to work on ${focusFacts(e, false)}${pill.en}. Real hours count, up to ${e.cap}. You keep watch beside them.`, 'relaxed');
}

/* 出关 · 领取: the rules settle it; the card counts up what grew, and the
   strip's own rise runs (riseStats). Then the opening held back for it —
   her greeting, Ling's 前情提要 — goes on as it would have (enter()). */
async function emerge() {
  const art = look?.seclusion?.art ?? null; // the gate that parts before the 出关 card
  const r = await write('seclude', { action: 'leave' }).catch(failed);
  if (!r.ok) { keep({ doNote: refusal(r) }); return refresh(); }
  const e = r.emerged;
  keep({ emerged: { ...e, art, at: performance.now(), place: look?.place?.id ?? null } });
  await refresh();
  countUp();
  const facts = emergeFacts(e);
  const opening = view.afterEmerge;
  keep({ afterEmerge: null });
  if (opening) return opening(facts);
  if (herHere()) askHer('emerge', facts.zh, facts.en, 'happy');
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
const COUNT_MS = 1400, GATE_MS = 900;
function countUp() {
  const start = view.emerged?.at;
  if (start == null) return;
  // Behind the 洞府 gate the count waits for the doors to part (lingjing.css .gateopen).
  const lead = view.emerged.art && !stillMotion() ? GATE_MS : 0;
  const step = () => {
    const t = Math.min(1, Math.max(0, performance.now() - start - lead) / (stillMotion() ? 1 : COUNT_MS));
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
document.addEventListener('input', (e) => { if (e.target.id === 'twenty-guess') keep({ twentyGuess: e.target.value, aiNote: null }); });
// 对对子: the form checked as he types (couplet.js) — redrawn in place, so the field keeps its focus.
document.addEventListener('input', (e) => {
  if (e.target.id === 'duizi-up') { keep({ duiziUp: e.target.value, aiNote: null }); return; }
  if (e.target.id !== 'duizi-down') return;
  keep({ duiziDraft: e.target.value, aiNote: null });
  const d = look?.duizi, r = d?.round;
  if (!r) return;
  const form = duiziFormOf(d, r.up, e.target.value, tonesNow());
  const box = document.getElementById('duizi-checks');
  if (box) box.innerHTML = duiziChecksHtml(form, duiziWords());
  const go = document.querySelector('[data-duizi-submit]');
  if (go) go.disabled = !form.ready;
});

/* 名字 — the card's own (cards.js value): an offered name tapped, or the
   player's own written; the page Resolves the exit with it and the stage
   plays the beat — no chat turn; Ling reads it in `page_did`. Ling never picks the name (his,
   2026-09-28: every player had become 青玄). A keystroke is kept without a
   repaint (the field would be replaced); only the chips and the button follow. */
document.addEventListener('input', (e) => {
  if (e.target.id === 'wx-city') { skyDraft.city = e.target.value; return; }
  if (e.target.id !== 'value-text') return;
  keep({ valueText: e.target.value, valuePick: null, valueNote: null });
  const card = e.target.closest('.valuecard'), chosen = valueChoice(null, e.target.value, Number(e.target.dataset.valueMax));
  card?.querySelectorAll('[data-value-pick]').forEach((el) => { el.classList.remove('on'); el.setAttribute('aria-pressed', 'false'); });
  const go = card?.querySelector('[data-value-go]');
  if (go) { go.disabled = !chosen; go.textContent = chosen ? fill(words().valueGoAs, { v: chosen }) : words().valueGo; }
});
async function valueTap(exitId) {
  const v = (look?.scene?.exits ?? []).find((x) => x.id === exitId)?.value;
  const chosen = v && valueChoice(view.valueText.trim() ? null : view.valuePick, view.valueText, v.max_chars);
  if (!chosen) return;
  const r = await write('resolve', { exit: exitId, value: chosen }).catch(failed);
  keep(r.ok ? { valuePick: null, valueText: '', valueNote: null } : { valueNote: refusal(r) });
  await refresh();
}

/* A scene card's choice (cards.js panel): the page Resolves the exit itself,
   and the stage plays what it owes in the dialogue box — no chat turn: Ling
   reads it in Look's `page_did` (Hanli, 2026-09-29: 「对话框先做，go」).
   Refused (a need not met), the card says why and nothing moves. */
/* What the last choice that stayed in this scene said — never one from another scene or play. */
const saidHere = () => (view.panelSaid && view.panelSaid.scene === (look?.scene?.id ?? null) && view.panelSaid.run === (look?.run ?? null) ? view.panelSaid.lines : null);
async function panelTap(exitId, label, answer, pass = false) {
  keep({ panelBusy: exitId, panelNote: null, panelSaid: null });
  render();
  // `pass`: a riddle left once stuck (「算了，往下走」, cards.js riddleTapHtml) — the way on, no reward.
  const r = await write('resolve', { exit: exitId, said: label, ...(answer != null ? { answer } : {}), ...(pass ? { pass: 1 } : {}) }).catch(failed);
  // A way on that shows the map (00-chushan's tree): the chapter's map unfolds there, the first time.
  if (r?.ok && (r.show ?? []).some((c) => c.card === 'map')) mapAsked = true;
  // A tap on a choice the story already moved past (a second tap in flight) is no refusal to show.
  // A riddle missed: its hint stands under the card (it never shuts; stuck, it may be left).
  keep({ panelNote: r.ok || r.refused === 'unknown-exit' ? null : r.hint && r.refused !== 'wrong-answer' ? `${refusal(r)} · ${r.hint}` : refusal(r) });
  // Another way taken puts back a fight he had chosen and not begun: its choice stands among the ways again (found
  // live 10-26 at 00-fox: 「脱下外衣」 → its 出手 card, then 「别碰」 — a `stay` way — read to its end in the box
  // with 「别碰」 alone under it, the fight's choice gone with its card; tapped again and again, 「别碰」 only came back).
  if (r?.ok) { const here = `${look?.scene?.id}|`; if ((view.called ?? []).some((k) => k.startsWith(here))) keep({ called: view.called.filter((k) => !k.startsWith(here)) }); }
  // A choice that stays in the scene (`stay`: 下水看看, 先逛坊市): its beat stands under the scene card.
  if (r?.ok && !r.summarize && r.beat?.length) keep({ panelSaid: { scene: look?.scene?.id ?? null, run: look?.run ?? null, lines: r.beat.filter((b) => b.text).map((b) => ({ name: b.name ?? null, text: b.text })) } });
  // The choices stay inert (dimmed, cards.js panelTapHtml `busy`) until the page has read what the tap
  // did — not only the write (2026-10-16, the playtest at 断碑: between the write and the re-read the
  // old choices stood live-looking for 0.3–0.7 s and a tap on them was dropped).
  try { await refresh(); } finally { show({ panelBusy: null }); }
}
/* A choice tapped: it and its neighbours go inert in this very frame — before the verb chain gets to
   it — so nothing on the stage looks live that is not (panelTap re-renders them busy until the read). */
function inertNow(el) {
  el.classList.add('busy');
  for (const b of el.closest('.paneltaps, .wayacts')?.querySelectorAll('button') ?? [el]) b.disabled = true;
}

/* ── The dialogue box (dialogue.js) ──
   The book's passages owed (Look's `tell_owed`) are drawn by the page — the
   rules mark them told — and played here beat by beat, whoever moved: a tap,
   a name, a birthday, or Ling Resolving what the player typed. The reading
   is kept per save in this browser, so a reload finds its place. */
let drawingTold = false;
async function watchTell() {
  if (!look?.tell_owed || drawingTold) return;
  drawingTold = true;
  try {
    const t = await write('tell').catch(() => null);
    // Drawn: Look's `tell_owed` is spent (the ending card waits on it, endingWaits).
    if (t?.ok && look) look.tell_owed = false;
    if (t?.ok && t.tell?.length) setReading(withTold(readingNow(), t.tell, look?.scene?.id ?? null, look?.run ?? null, lang()));
  } finally { drawingTold = false; }
  watchWayOn();
}

/* A scene's fight won, its way on not yet taken (stage.mjs wonWayOn): the page
   takes it, as it takes a board's (onWin → panelTap) — for every save, on the
   win and on any later load (2026-10-15, live: 蠪侄 beaten at 00-longzhi, the
   Resolve left to Ling, who told the finish and stopped; Hanli stood stuck
   behind 今日已降). Ling hears `[scene] won <id>` and tells the finish; she
   never Resolves it (guide/fight.md). A passage still owed is drawn first
   (watchTell calls back here), and the exit's own story then plays on in the
   story view. Tried once per play, scene and exit: a refusal (no 体力 for the
   step) is said under the scene card, whose 「接着 ›」 stays his to tap. */
const wayOnTried = new Set();
function watchWayOn() {
  const e = wonWayOn(look);
  // The passage first, then 所得: neither is walked past (spoilsShown). The next draw tries again.
  if (!e || bout || storyAhead() || spoilsUp() || view.panelBusy) return;
  const key = `${look.run ?? ''}|${look.scene?.id ?? ''}|${e.id}`;
  if (wayOnTried.has(key)) return;
  wayOnTried.add(key);
  const label = look.scene?.panel?.taps?.find((t) => t.id === e.id)?.label ?? e.id;
  queueMicrotask(() => panelTap(e.id, label).catch((err) => console.warn('[lingjing] way on', err)));
}
/* The reading, read back from this browser the first time it is asked for. */
function readingNow() {
  if (view.reading === undefined) keep({ reading: loadReading(SCRATCH) });
  return view.reading;
}
/* The reading that belongs on the stage now: this play's (Look's `run`),
   at this scene (or the open world's) — one left from another scene, or from
   a play since replaced (a Restart, an Undo, a Load — even into the same
   scene), is not played over this one. */
function readingHere() {
  const r = readingFor(readingNow(), look?.scene?.id ?? null, look?.run ?? null);
  // The book set aside (Look's `aside`, on the save): a reading this browser still holds of it does not play.
  return r && asideOn() && !r.closed ? { ...r, closed: true } : r;
}
/* This play's reading, at whatever scene it stands (a replaced play's holds nothing back). */
function readingOfPlay() { return ofPlay(readingNow(), look?.run ?? null); }
function setReading(r, patch = {}) {
  keepReading(SCRATCH, r);
  show({ reading: r, ...patch });
}
/* The passage on the stage, for the log (track.js): its place in the reading, its scene and length. */
function trackReading() {
  const r = readingHere();
  const it = playing(r) ? r.items[Math.min(r.i, r.items.length - 1)] : null;
  tracker.reading(it ? `${r.run ?? ''}|${r.i}|${it.id ?? ''}` : null, it ? { scene: sceneOfItem(it) ?? it.of ?? null, chars: charsOf(it, lang()) } : {});
}
/* ── One thing at a time: the box first (queue.js, 2026-10-01) ──
   The passage that leads into a board, a fight, a set piece or a seal
   finishes in the box first; then that thing opens. */
const titlePending = () => { const ch = look?.chapter; return Boolean(ch?.fresh && !bout && !dismissedTitles.has(titleKey(ch.id)) && !titleSeen(ch.id)); };
// At a 回's turn: the old 回's passages told, its 「完」 or the new title still to come.
const atHuiTurn = () => atTurn({ oldPlaying: oldHuiPlaying(), closeUp: closeUp(), titlePending: titlePending(), sealOwed });
/* Is the book still ahead of the stage? Passages owed or being drawn, or the
   box playing this scene's (not paused at a 回's turn). */
const boxAhead = () => bookAhead({ owed: Boolean(look?.tell_owed), drawing: drawingTold, playing: playing(readingHere()), huiTurn: atHuiTurn() });
// The cards that wait for the book come up with the scene's choices — on its last beat (dialogue.js choicesUp).
const cardsAhead = () => bookAhead({ owed: Boolean(look?.tell_owed), drawing: drawingTold, playing: !choicesUp(readingHere(), lang()), huiTurn: atHuiTurn() });
// A board opened from the tray: the box put away first, not only its last beat, nor over a 回's turn.
const trayAhead = () => trayWaits({ owed: Boolean(look?.tell_owed), drawing: drawingTold, playing: playing(readingHere()), huiTurn: atHuiTurn() });
/* The scene's passage still to be told (owed, being drawn, or in the box): its games wait. */
const storyAhead = () => Boolean(look?.tell_owed || drawingTold || playing(readingHere()) || asideOn());
/* 先放一放 (rules/aside.mjs): the book set aside — its place on the save, Look's `aside` — and what may be
   played meanwhile in the tray; the story's own games and the scene's choices wait, as they wait for the box. */
const asideOn = () => Boolean(look?.aside?.on);
/* May the box offer it now? Something to play meanwhile, a passage the rules can key, and the box mid-way —
   not its last beat (the choices are up), not at a 回's turn, not under a moment or a fight. */
const asideMay = (r) => Boolean(look?.aside && !look.aside.on && look.aside.offers?.some(asideOpens) && asidePlace(r) && !atLast(r, lang())
  && !atHuiTurn() && !momentUp() && !piecePlays() && !bout && !look.fight);
async function asideTap() {
  const r = readingHere(), at = asidePlace(r);
  if (!at) return;
  const out = await write('aside', { items: JSON.stringify(at.items), i: at.i, j: at.j }).catch(failed);
  if (!out?.ok) { keep({ doNote: refusal(out) }); return; }
  setReading({ ...r, closed: true });
  await refresh();
}
/* 接着读: the passages again from the rules, at the beat set aside. */
async function resumeTap() {
  const out = await write('resume').catch(failed);
  if (!out?.ok) { keep({ doNote: refusal(out) }); return; }
  await refresh();
  const next = readingSetAside(out.items ?? [], look?.scene?.id ?? out.scene ?? null, look?.run ?? null, out.i ?? 0, out.j ?? 0);
  if (next) setReading(next);
}
/* The look whose header stands now: the last scene's, while the box tells what leads into this one
   — the choice that left it, and a 前情 or that scene's unplayed beats before it (dialogue.js leadsIn;
   live 2026-10-14: a 前情 first in the reading put 00-waimen's people over 00-hall/born); else this one. */
function headLook() {
  const prev = lastLook();
  // …and at a 回's turn, while the old 回's 「完」 stands (proto f, 2026-10-14): its last scene's header and picture
  // hold under the card; they turn with 合上, before the new 回's first words.
  // A sealed instance's header and stage (`sealed`) hold with the scene they belong to.
  // From the moment the 「完」 is owed, not only once the turn is reached: at 今 · 二 → 古五 (2026-10-15)
  // the new scene's picture stood a beat while the old 回's last beat was still the reading's, then the
  // 今 picture came back under 「今 · 二 · 完」, then the 古 again with 合上 (Hanli: 「又跳回了今」).
  const r = readingHere(), left = Boolean(prev?.scene && prev.scene.id !== look?.scene?.id);
  const held = leadsIn(readingHere(), look?.scene?.id, prev?.scene?.id) || Boolean(left && closeUp())
    // The header follows the passage actually shown (live, 2026-10-15: it ran ahead of the box after a choice, and
    // lagged when tapping fast). A move just made, its passage not yet drawn — Look already at the new scene, the
    // box still empty: the scene left holds (only one left in this sitting, never a stale one read back).
    || Boolean(left && prevFresh && (look?.tell_owed || drawingTold) && !playing(r));
  // The beat on show is another scene's — two moves inside one passage: that scene's header, when it was read here.
  const shown = playing(r) ? sceneOfItem(r.items[Math.min(r.i, r.items.length - 1)]) : null;
  const was = shown && shown !== look?.scene?.id ? leftLooks.get(shown) : null;
  if (was) return { ...look, ...was };
  // …and this scene's own passage on show is under this scene's header, whatever else is owed (live, 2026-10-15:
  // 09-qulao's passage, 后山, told under 09-dabi's header and backdrop while a 「完」 was still owed).
  // Not at a 回's turn: there the box waits behind the old 回's 「完」, under the old header, until 合上.
  if (shown && shown === look?.scene?.id && !atHuiTurn()) return look;
  return held ? { ...look, scene: prev.scene, place: prev.place, weather: prev.weather, stage: prev.stage, sealed: prev.sealed } : look;
}
/* Every scene left in this sitting, by id (the last few), for the header of the beat on show (headLook). */
const leftLooks = new Map();
let prevFresh = false;
/* The scene just left, kept per save in this browser beside the reading, so a reload mid-passage holds its header too. */
const HELD_KEY = `lingjing.held.${SCRATCH || 'main'}`;
function leftLook(lk) {
  prevLook = { scene: lk.scene, place: lk.place, weather: lk.weather, stage: lk.stage, sealed: lk.sealed };
  prevFresh = true;
  if (lk.scene?.id) { leftLooks.delete(lk.scene.id); leftLooks.set(lk.scene.id, prevLook); }
  while (leftLooks.size > 8) leftLooks.delete(leftLooks.keys().next().value);
  try { localStorage.setItem(HELD_KEY, JSON.stringify(prevLook)); } catch { /* no storage: this load only */ }
}
function lastLook() {
  if (!prevLook) { try { prevLook = JSON.parse(localStorage.getItem(HELD_KEY) ?? 'null'); } catch { /* none */ } }
  return prevLook;
}
/* A held header's own cards (the people, the goal) from the look it stands on. */
const headOf = (lk) => stageSlots(lk, lk.stage ?? []).header;
const momentUp = () => Boolean(pieceOn || featOn || view.memory || view.homing || view.doors || view.unfold || document.querySelector('.feat'));
/* A game to play on the stage now (a board in main, its task still open): the box steps
   aside for it, wholly (queue.js boxGivesWay `game`; his 「小游戏，和剧情不要同时显示」). */
const boardOpenNow = (id) => (look?.tasks ?? []).some((t) => t.id === id && t.status !== 'done' && !t.won) || Boolean(boards.get(id)?.state && !boards.get(id).sent);
const gameUp = (slots) => Boolean(slots?.main?.some?.((c) => c.card === 'board' && boardOpenNow(c.id)));
const boxYields = (slots) => boxGivesWay({ bout: Boolean(bout), appearing: Boolean(view.appearing), slots: Boolean(slots), up: momentUp(), huiTurn: atHuiTurn(), game: gameUp(slots) });
/* The page's moments in their order — set piece, 息壤's doors, the gold seal,
   her memory, 鼎归 — each waits for the box and for the one before it, so
   two never stand at once (「完」 over 所得, 突破 over 五门俱开, 修为 +60 over
   her memory, live 2026-10-01). `extra` is a moment's own further wait. */
const momentPending = new Set();
/* A set piece is the picture of the choice that brings it (01-deep's seal pressed, the 鼎
   rising): it plays after that choice's own passage and before the next scene's — the box
   steps aside for it on a scene's passage (pieceAhead), and plays that scene on after. */
const pieceAhead = () => { const r = readingHere(); return bookAhead({ owed: Boolean(look?.tell_owed), drawing: drawingTold, playing: playing(r) && r.items[r.i]?.of !== 'scene', huiTurn: atHuiTurn() }); };
async function momentTurn(kind, extra = () => false, after = null) {
  momentPending.add(kind);
  const ahead = after ?? (kind === 'piece' ? pieceAhead : boxAhead);
  try {
    for (let k = 0; k < 2400 && (!momentMay(kind, { ahead: ahead(), up: momentUp(), pending: [...momentPending] }) || extra()); k += 1) await pause(250);
  } finally { momentPending.delete(kind); }
}
/* The box still on a passage of the 回 just ended (the exit that ended it, a scene
   of it): that 回's 「完」, the realm's seal and the new 回's title wait until it is
   told — seen live at 09-cliff (2026-09-30): 古九's last words played under
   古十's banner. Each passage carries its 回 (rules/tell.mjs). */
function oldHuiPlaying() {
  const r = readingOfPlay();
  if (!playing(r)) return false;
  const h = r.items[r.i]?.hui;
  if (!h) return false;
  // A passage of an earlier 回 than the one the save now stands in; or, with a 回's
  // 「完」 standing, that 回's own — the exit that ended it too (卷一's last, at 01-end).
  const now = look?.chapter?.hui, c = look?.chapter?.close;
  return Boolean((now && h !== now) || (c && !closeSeen(c.id) && h === c.id));
}
// …and while passages are owed and not yet drawn (they may be the ending 回's).
const endingWaits = () => oldHuiPlaying() || riseWaits || Boolean(look?.tell_owed || drawingTold);
/* The box is up at its last beat with nothing owed behind it: the scene's
   choices stand inside it (2026-10-14, his: 「那天傍晚 ›」 was a small link mid-stage). */
function choicesInBox() {
  const r = readingHere();
  // …unless the way on is a card of its own (生辰, a name, a fight not called by words — stage.mjs
  // cardHoldsWay): then the box is put away at its end and that card stands (2026-10-15, live at
  // 00-hall: the passage held its last beat with only the 看 list, the 生辰 card hidden behind it).
  // …nor while a won fight's 所得 waits to be seen: the box is put away at its end and 所得 stands first.
  return Boolean(playing(r) && atLast(r, lang()) && !look?.tell_owed && !drawingTold && !boxYields(true) && !gameOpen(look) && !cardHoldsWay(look) && !replayUp(look) && !spoilsUp());
}
/* A board left on an earlier day and chosen again (再试一回): the box is put away at its end, so the board
   stands — beside the scene card, whose ways on stay his to take (stage.mjs sceneGame). */
const replayUp = (l) => (l?.tasks ?? []).some((t) => t.replay && t.status !== 'done');
function dialogBoxHtml(slots) {
  const r = readingHere();
  if (!r) return '';
  const log = view.logOpen ? logHtml(r, { lang: lang() }) : '';
  // A board on the stage puts the box away — not its 回看 (2026-10-15, his: the button above
  // 黑地十一步 did nothing): the log still opens over the board, and the board's clock waits.
  if (boxYields(slots)) return log;
  const voice = hasAudio(audio) ? dubOn() : null;
  const acts = choicesInBox() ? panelActsHtml(ctx(), { inBox: true }) : '';
  const story = playing(r) ? storyHtml(r, { lang: lang(), voice, acts, herId: look.companion?.id ?? null, speed: modeAt(r, speedNow(), lang()), faces: r.all?.whole ? firstFaces() : [], aside: asideMay(r) }) : '';
  return story + log;
}

/* 回看 opens at the latest line, where he is (live, 2026-10-15: it opened at the top of 8000px of earlier
   scenes). Once per painted log: a log he has scrolled is left where he put it until its lines change. */
function logAtEnd() {
  const body = $('dlg')?.querySelector('.dlglogbody:not([data-at-end])');
  if (!body) return;
  body.dataset.atEnd = '1';
  body.scrollTop = body.scrollHeight;
}

/* 开局 from the tray (live, 2026-10-15: tapped while the scene's choices stood in the box, nothing happened —
   and the board came up later, out of nowhere, after a tame). The passage read to its last beat, its choices in
   the box: the box is put away, the board stands now and the choices on the scene card beside it. Mid-passage:
   it waits for the passage, and its tray button says so (cards.js trayHtml trayQueued). */
function openFromTray(id) {
  const inBox = choicesInBox();
  show({ opened: { id, place: look?.place?.id ?? null, scene: look?.scene?.id ?? null }, left: view.left.filter((l) => l.id !== id), qSkip: view.qSkip.filter((k) => k !== `board:${id}`) });
  if (inBox) nextBeat();
}

/* ── The lines' clock (lines.js) ──
   One clock for the beat on show, keyed by the beat (dialogue.js beatKey): a repaint of the
   same beat carries on; a new beat starts at its first sentence. Read through, the page goes
   on by itself — the same `advance` a tap was (dialogue.js), so every order rule holds as it
   did: the 回's turn, the games after the passage, the choices at its last beat. */
// A set piece's beat reads in 自动 whatever his way (dialogue.js modeAt): its words at 自动's pace.
const lines = createLines({ onDone: (key, tapped) => storyDone(key, tapped), f: () => SPEEDS[modeAt(readingHere(), speedNow(), lang())] });
function syncLines() {
  const el = $('dlg')?.querySelector('.story'), r = readingHere();
  if (!el || !playing(r)) { lines.sync(null); pager.sync(null); syncLock(); return; }
  // 跳过 stands on the 回's last beat shown whole, read at once; 快's column is read at once too.
  lines.sync(el, el.dataset.story, { lang: lang(), instant: Boolean(r.all && (r.all.whole || atLast(r, lang()))), gate: pieceGate });
  pager.sync(el);
  syncLock();
}
/* ── The passage holds the page (Hanli, 2026-10-16: 「读剧情, 可以简单点, 把其他都lock, 玩家读完或跳过才能继续」) ──
   While a passage is on the stage and not yet at its end (dialogue.js storyHolds), every other way
   out — the footer's chips and roads, the header's cards, the tray — is dimmed and does nothing but
   say 「读完或跳过」 under the tap; the story's own controls (回看, 自动 · 全文 · 跳过, the pages) and its
   choices stay his. Ended or skipped, all of it is live again. Never a dialog, never a gate on the
   story itself: 跳过 is always in its control. */
const STORY_LOCKED = '#footRow, #footChips, #headCards, .tray';
function syncLock() {
  const on = storyHolds(readingHere(), { shown: Boolean($('dlg')?.querySelector('.story')), lang: lang(), lastPage: pager.last });
  holdLing(on);
  if (on === document.body.classList.contains('storylock')) return;
  document.body.classList.toggle('storylock', on);
  // A popover left open when the passage came on is put away with it.
  if (on && (view.bookOpen || view.gearOpen || view.roadsOpen || view.shelfOpen || view.wxOpen || view.ledgerOpen)) {
    queueMicrotask(() => show({ bookOpen: false, gearOpen: false, roadsOpen: false, shelfOpen: false, wxOpen: false, ledgerOpen: false }));
  }
}
/* …and Ling's hands with it (rules/reading.mjs): the rules hear when a passage holds and when it ends,
   so a line typed in the chat meanwhile is answered in words and nothing moves; renewed while it stands
   (the rules let a hold lapse that nobody ended). Ended with her held meanwhile, she hears 「[scene] read」
   and does what he asked. */
let lingHeld = null, lingHeldAt = 0;
const HOLD_RENEW_MS = 4 * 60 * 1000;
function holdLing(on) {
  if (on === lingHeld && (!on || Date.now() - lingHeldAt < HOLD_RENEW_MS)) return;
  lingHeld = on;
  lingHeldAt = Date.now();
  verb('reading', { hold: on ? 1 : 0 }).then((r) => { if (!on && r?.held) report('[scene] read'); }).catch(() => {});
}
setInterval(() => { if (lingHeld) holdLing(true); }, HOLD_RENEW_MS);
let lockHintTimer = null;
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('storylock') || !e.target.closest?.(STORY_LOCKED)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const foot = $('slotFoot');
  let hint = foot?.querySelector('.lockhint');
  if (foot && !hint) { hint = document.createElement('div'); hint.className = 'lockhint'; hint.setAttribute('role', 'status'); foot.appendChild(hint); }
  if (!hint) return;
  hint.textContent = (DLG_WORDS[lang()] ?? DLG_WORDS.zh).locked;
  clearTimeout(lockHintTimer);
  lockHintTimer = setTimeout(() => hint.remove(), 1600);
}, { capture: true });
/* 快's pages (pager.js; Hanli, 2026-10-15: 「可以用下面半屏显示吗? 可以让用户翻页.」): the band on the
   stage's lower half, paged from its real height; a page's 亮相 comes on above it. */
// The page he is on is kept beside the reading (per save, this browser), so a reload opens on it (2026-10-16).
const PAGE_KEY = `lingjing.page.${SCRATCH || 'main'}`;
const pageStore = {
  load(key) { try { const p = JSON.parse(localStorage.getItem(PAGE_KEY) ?? 'null'); return p?.key === key ? p.page : null; } catch { return null; } },
  save(key, page) { try { localStorage.setItem(PAGE_KEY, JSON.stringify({ key, page })); } catch { /* this load only */ } },
};
const pager = createPager({ onPage: () => { pageSight(); syncLock(); }, keep: pageStore });
const pageFaces = () => { const ids = new Set(pager.faces()); return firstFaces().filter((e) => ids.has(e.id)); };
function pageSight() { if (readingHere()?.all?.whole) paintSight($('sight'), pageFaces(), { src: faceSrc }); }
/* A page on or back: the last page's 下一页 is 「接着往下」 where the reading goes on (storyTap). */
function pageTurn(d) {
  if (pager.turn(d)) return true;
  if (d > 0 && pager.last && $('dlg')?.querySelector('.wholecol [data-dlg-onward]')) { storyTap(); return true; }
  return false;
}
/* A tap on the band's words: the next page — not the end of a selection or of a swipe. */
function wordsTap() {
  if (swiped || String(globalThis.getSelection?.() ?? '').trim()) return true;
  if (!pager.last) pageTurn(1);
  return true;
}
/* A swipe across the band turns a page: leftward on, rightward back. */
let swipeFrom = null, swiped = false;
document.addEventListener('pointerdown', (e) => {
  swiped = false;
  swipeFrom = e.target.closest?.('#dlg .wholecol') ? { x: e.clientX, y: e.clientY } : null;
});
document.addEventListener('pointerup', (e) => {
  if (!swipeFrom) return;
  const dx = e.clientX - swipeFrom.x, dy = e.clientY - swipeFrom.y;
  swipeFrom = null;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  swiped = true;
  setTimeout(() => { swiped = false; }, 400);
  pageTurn(dx < 0 ? 1 : -1);
});
/* The way he reads is read live at every paint (dialogue.js fitMode): 全文 opens whatever passage
   comes on the stage whole — a new one, one tapped to mid-passage, one found on a reload — 自动 over
   a column puts it back to its sentences from the beat in view, and 跳过 stands it at its end, its
   choices up. Before the paint (render), so no beat of it plays, speaks or brings a face on first.
   跳过 moves only the passage on the stage, never one left at another scene. */
function matchPace() {
  const r = readingOfPlay(), mode = speedNow();
  if (!playing(r) || (mode === 'skip' && r !== readingHere())) return;
  const next = fitMode(r, mode, { lang: lang(), at: beatInView() });
  if (next === r) return;
  keepReading(SCRATCH, next);
  keep({ reading: next });
  // The header was painted this frame from the reading before the fit; a choice's passage and the
  // next scene's are one reading, and the fit (全文's column) moves it on to the scene's — so paint
  // again, or the left scene's header stands over the new one's choices (live 2026-10-16 at 1440:
  // 「傍晚」 and 马三 over 00-dawn's 收下鸡蛋, 「第二十七道记号」 over 00-fox, until some later tap).
  // Only when the passage on show is another scene's; the fit is a fixed point after.
  const on = (x) => (playing(x) ? sceneOfItem(x.items[Math.min(x.i, x.items.length - 1)]) : null);
  if (on(next) !== on(r)) render();
}
/* The beat at the top of the page on show — the one he is reading (pager.js). */
const beatInView = () => pager.beat();
/* A beat read (or tapped once read): the next — unless the way on is up (the choices: his
   tap), or something holds the page: 回看 or the book open, a hold, more passages still to
   draw behind the last beat, the 说书人 still telling this one. Then it looks again soon. */
let doneWait = null;
function storyDone(key, tapped = false) {
  clearTimeout(doneWait);
  const r = readingHere();
  if (!playing(r) || beatKey(r, lang()) !== key) return;
  const last = atLast(r, lang());
  if (last && $('dlg')?.querySelector('.story .ways')) { if (tapped) nudgeWays(); return; }
  // 快's column is his to read: it goes on only at his 「接着往下」 (or a key), never by itself —
  // and never past its choices.
  if (r.all?.whole && (!tapped || (last && $('dlg')?.querySelector('.story .wholecol .wayacts')))) return;
  // The set piece under the beat plays to its last frame before the page goes past its paragraph.
  const held = piecePlays() || view.logOpen || view.luOpen || view.gearOpen || lines.paused || document.body.classList.contains('reading')
    || (last && (look?.tell_owed || drawingTold)) || (!tapped && narrator.sounding);
  if (held) { doneWait = setTimeout(() => storyDone(key), 700); return; }
  nextBeat();
}
/* A tap on the read-through passage while its way on is its choices or its 看 chips: never silent
   (live 2026-10-19 at 黑松岭: the last line tapped again and again, nothing moved) — the ways flash once. */
function nudgeWays() {
  const ways = $('dlg')?.querySelector('.story .ways');
  if (!ways) return;
  ways.classList.remove('nudge');
  void ways.offsetWidth; // restart the flash on a second tap
  ways.classList.add('nudge');
  setTimeout(() => ways.classList.remove('nudge'), 1300);
}
/* A tap on the stage: the next sentence now (lines.js); read through, the next beat. */
let holdSwallow = false;
let gateTapAt = 0;
const DOUBLE_TAP_MS = 350;
function storyTap() {
  if (holdSwallow) { holdSwallow = false; return; }
  // A set piece playing under the beat (Hanli, 2026-10-19: 「必须自动才能看到吗?」): a tap brings the next sentence while
  // one is free to come; where the words wait for the picture a tap does nothing — a double tap (or 跳过) brings its last
  // frame, never the next paragraph (the words then go on by themselves).
  if (piecePlays()) {
    if (lines.key && $('dlg')?.querySelector('.story') && lines.tap()) return;
    const now = performance.now();
    if (now - gateTapAt < DOUBLE_TAP_MS) { gateTapAt = 0; pieceToEnd(); } else gateTapAt = now;
    return;
  }
  if (lines.key && $('dlg')?.querySelector('.story')) lines.tap();
  else nextBeat();
}
/* 自动 · 全文 · 跳过 — this viewer's, kept in this browser (lines.js keepSpeed) for every passage;
   the paint fits the passage to it (matchPace, dialogue.js fitMode). */
function setSpeed(v) { if (v === 'skip') return skipPassage(); keepSpeed(v); render(); }
/* 跳过 — once (Hanli, 2026-10-16: 「点一次, 只能跳过一次」): this passage to its end and its choices; the next reads as he reads. */
function skipPassage() {
  // Words only (Hanli, 2026-10-19: 「跳过不能跳过大场面」): during a set piece, its last frame — never past it.
  if (piecePlays()) { pieceToEnd(); return; }
  // 全文: the passage already stands whole as a column; 跳过 turns to its last page (its choices).
  if (pager.on) { while (pager.turn(1)); return; }
  const r = readingHere();
  if (!playing(r)) return;
  const next = fitMode(r, 'skip', { lang: lang(), at: beatInView() });
  if (next !== r) { keepReading(SCRATCH, next); keep({ reading: next }); }
  render();
}
/* Holding the stage down pauses the lines; letting go goes on (and the release is no tap). */
let holdTimer = null, holding = false;
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest?.('#dlg .story') || e.target.closest('button, .ways, .dlglog, .wholecol')) return;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { holding = true; lines.hold(true); }, 380);
});
const letGo = () => { clearTimeout(holdTimer); if (!holding) return; holding = false; holdSwallow = true; lines.hold(false); setTimeout(() => { holdSwallow = false; }, 400); };
document.addEventListener('pointerup', letGo);
// A tab out of sight reads nothing: the lines wait for him to come back (they run on timers).
document.addEventListener('visibilitychange', () => { if (!holding) lines.hold(document.hidden); });
document.addEventListener('pointercancel', letGo);

/* Ling's and 银月's lines in the passage (proto k): played in place, her 木牌 in the footer warm
   while her words are up; 银月's each copied once, quietly, into the chat — no turn, no badge. Ling's 前情
   stays in the box and 回看: copied, a catch-up came into the chat line by line, twenty messages under
   the 前情提要 she had already written there (the 10-15 bug list). */
const copied = new Set();
function companionBeat(shown) {
  const r = readingHere(), herId = look?.companion?.id ?? null;
  // The beat on show — or every beat of 快's column, each copied as if it had played.
  const beats = !shown || !playing(r) ? [] : r.all?.whole ? wholeBeats(r, lang()) : [current(r, lang()).beat];
  const who = (b) => voiceOf(b, herId);
  document.querySelector('.yytoken')?.classList.toggle('warm', beats.length > 0 && who(beats.at(-1)) === 'yy');
  for (const b of beats) {
    if (who(b) !== 'yy') continue;
    const key = `${r.run ?? ''}|${r.scene ?? ''}|${b.i}|${b.j}|${lang()}`;
    if (copied.has(key)) continue;
    copied.add(key);
    quietCopy(`${b.name ?? words().yinyue}：${b.text}`);
  }
}
function quietCopy(line) {
  if (chat) { chat.addMessage('assistant', line); return; }
  // A chatless test save (`&chat=off`): the line goes into its quiet transcript beside the stage.
  const log = document.querySelector('#chat-panel .scratch-lines');
  if (log) { log.insertAdjacentHTML('beforeend', `<div class="scratch-line">${esc(line)}</div>`); log.scrollTop = log.scrollHeight; }
}

/* Games, the map and a fight fold the chat (proto g/h/i: 「对话收起」); the story keeps it open.
   Only the page's own fold: the viewer's handle (sight.js, kept in this browser) is untouched. */
function foldFor(slots) {
  const main = slots?.main ?? [];
  const wide = Boolean(bout) || gameUp(slots) || main.some((c) => c.card === 'map' || c.card === 'unfold') || Boolean(view.unfold);
  setAutoFold(document.querySelector('.shell'), wide);
}

/* 对话框配音 (Hanli, 2026-10-01): the 说书人 tells the beat on show — its own
   clip, cut from the 回's 评书 (pingshu.js; story/jiuding-lu/audio.json, on the CDN). A
   tap or 跳过 moves the box on and the voice with it; the box away, it stops.
   A beat with no clip (a branch, a recap, English) is silent, and so is any
   file that fails. The switch is this viewer's (配音 有声/无声). */
let audio = NO_AUDIO;
const narrator = createNarrator();
loadManifest().then((m) => { audio = m; render(); });
function voiceBeat(shown) {
  const r = readingHere();
  if (!shown || !playing(r) || r.all || !dubOn()) return narrator.sync(null);
  const { beat } = current(r, lang());
  const clip = beat.recap ? null : clipOf(audio, r.items[r.i]?.hui, beat.text);
  narrator.sync(clip?.url ?? null, `${r.scene}|${r.i}|${r.j}|${clip?.url}`);
}
/* The faces whose 亮相 the reading holds — the beats the book marks `{注=id}` (rules/tell.mjs
   beatsOf `notes`) — as their 图鉴 entries: people and creatures, never a thing. A passage is
   told once a play (told_scenes), so each comes on large once, at the book's own point. */
const firstFaces = () => noted(readingHere(), lang()).map((id) => codexNow()?.get?.(id)).filter((e) => e && SIGHT_KINDS.has(e.kind));
const faceSrc = (f) => worldPath(look.world?.made ? `worlds/${look.world.base}` : look.world?.dir ?? 'worlds/jiuding', f);
const nextBeat = () => { const r = readingOfPlay(); if (playing(r)) setReading(advance(r, lang())); };

/* 看 — a hotspot on the scene card (cards.js lookHtml): the rules look
   (`look --at`), free, and the finding stands under the card. No chat turn:
   the page shows the fact, and Ling reads it in Look (`page_did`, `seen`). */
async function lookAt(id) {
  keep({ lookBusy: id });
  render();
  const r = await write('look', { at: id }).catch(failed);
  keep({ lookBusy: null, panelNote: r.ok ? null : refusal(r) });
  await refresh();
}

/* 生辰 → 灵根 — the card's own (cards.js born): the date typed here goes to
   the rules on this machine and nowhere else — not into the chat, not into
   the page's memory past this tap (roots.mjs). Or 不填: the stone reads them.
   The stage plays the rite; Ling reads the roots in `page_did`, never the day. */
document.addEventListener('input', (e) => {
  if (e.target.id !== 'born-date') return;
  keep({ bornDraft: e.target.value, bornError: false });
  const go = e.target.closest('.borncard')?.querySelector('[data-born="birth"]');
  if (go) go.disabled = !e.target.value;
});
async function bornTap(kind) {
  const exit = (look?.scene?.exits ?? []).find((x) => x.born && !x.born.kept);
  if (!exit || (kind === 'birth' && !view.bornDraft)) return;
  const r = await write('resolve', { exit: exit.id, ...(kind === 'birth' ? { birth: view.bornDraft } : { skip: 'true' }) }).catch(failed);
  keep({ bornDraft: '', bornError: !r.ok && r.refused === 'birth-invalid', doNote: r.ok || r.refused === 'birth-invalid' ? null : refusal(r) });
  await refresh();
}

/* A beast's first sight (creatures.json `appear`): played once over the stage
   the first time its card stands there, then kept on the save (`appear`) so
   every later meeting shows one line. A tap on 继续 — or the end — lifts it. */
function watchAppear(cards) {
  if (view.appearing || bout || !authored) return;
  const seen = new Set(look?.appeared ?? []);
  // The creature's card on the stage, or the one the scene brings on (an errand's card may stand in its place).
  const shown = [...cards, ...(look?.scene?.show ?? [])].filter((x) => x.card === 'creature');
  const c = shown.map((x) => authored.creatures.find((k) => k.id === x.id)).find((k) => k?.appear && !seen.has(k.id));
  if (!c) return;
  keep({ appearing: c.id });
  $('view').insertAdjacentHTML('beforeend', appearHtml(c, ctx()));
  const lines = (c.appear[lang()] ?? c.appear.zh).length;
  const el = $('view').querySelector('.appear');
  fitAppear(el);
  if (!stillMotion()) liveCreature(el, authored.backdrops, c.art); // the beast breathes (fx-alive.js)
  // The last line strikes: the whole frame shakes with it.
  if (!stillMotion()) setTimeout(() => el?.classList.add('shaking'), 1200 + (lines - 1) * 2200);
  setTimeout(() => endAppear(c.id), stillMotion() ? 60000 : 1600 + lines * 2200 + 4200);
}
/* The 出场's picture whole (Hanli, 2026-10-15: a plate cut by the stage showed legs, no head): its
   own shape, fitted (sight.js fitBox) into the room the words leave it (artRoom); again on a resize. */
function fitAppear(el) {
  const img = el?.querySelector('.appearart');
  if (!img) return;
  const fit = () => {
    const text = el.querySelector('.appeartext'), sb = el.getBoundingClientRect(), tb = text?.getBoundingClientRect();
    const room = artRoom({ w: sb.width, h: sb.height }, tb && { right: tb.right - sb.left, top: tb.top - sb.top });
    const box = img.naturalWidth && room ? fitBox(room, img.naturalWidth / img.naturalHeight) : null;
    if (!box) return;
    Object.assign(img.style, { left: `${Math.round(room.x + (room.w - box.w) / 2)}px`, top: `${Math.round(room.y + (room.h - box.h) / 2)}px`, width: `${box.w}px`, height: `${box.h}px` });
    img.classList.add('fit');
  };
  if (!img.complete) img.addEventListener('load', fit, { once: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(el);
  fit();
}
/* 跳过 on a beast's 出场 (proto d): the rest at once, the name and the classic's line with it;
   then it goes by itself (or at a second tap). */
function skipAppear(id) {
  const el = $('view').querySelector(`.appear[data-appear="${CSS.escape(id)}"]`);
  if (!el || el.classList.contains('all')) { endAppear(id); return; }
  el.classList.remove('shaking');
  el.classList.add('all');
  setTimeout(() => endAppear(id), 3200);
}
async function endAppear(id) {
  if (view.appearing !== id) return;
  $('view').querySelector('.appear')?.remove();
  keep({ appearing: null });
  const r = await write('appear', { id }).catch(failed);
  if (r.ok) await refresh();
}

/* 渡劫 — the card's own throw (cards.js breakthrough): the rules throw it,
   the card says how a failure fell, the rise seal marks a win against the
   odds, and Ling hears `[scene] breakthrough won|failed` to tell the 雷劫 —
   she never decides it (Hanli, 2026-09-28). */
let thrown = null; // a landed throw, for the rise seal's mark
async function throwTap(exitId) {
  const r = await write('resolve', { exit: exitId }).catch(failed);
  const b = r.ok ? r.breakthrough : null;
  thrown = b?.success ? b : null;
  const fell = b && !b.success ? fill(words().bt.failed, { st: b.lost.stamina, xw: b.lost.progress, at: clock(b.again_at) }) : null;
  keep({ throwNote: r.ok ? fell : refusal(r) });
  await refresh();
  if (!b) return;
  if (!b.success) herSay.say('bt_failed', lang() === 'en' ? `A ${b.chance}% chance; stamina −${b.lost.stamina}, cultivation −${b.lost.progress}; again after ${clock(b.again_at)}.` : `把握${b.chance}%；体力−${b.lost.stamina}，修为−${b.lost.progress}；${clock(b.again_at)}之后可以再试。`);
  await report(`[scene] breakthrough ${b.success ? 'won' : 'failed'} ${b.chance}%`);
}

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
  if (!herHere()) return Promise.resolve(false);
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
  skip: (id) => write('quest', { action: 'skip', id }), // 跳过 on the open 一次 step: the next opens tomorrow
  buy: (id) => write('trade', { action: 'buy', id }),
  sell: (id) => write('trade', { action: 'sell', id }),
  use: (id) => write('trade', { action: 'use', id }),
  // 讨价还价's 成交 / 不买了 (rules/aigames.mjs): the rules' price, his tap.
  'haggle-deal': () => write('haggle', { action: 'deal' }),
  'haggle-walk': () => write('haggle', { action: 'walk' }),
};
async function doTap(action, id) {
  if (!DOES[action]) return;
  const r = await DOES[action](id).catch(failed);
  // A reward that found the 储物袋 full says where it went, in the rules' line.
  keep({ doNote: r.ok ? r.paid?.pouch_full ?? r.pouch_full ?? null : refusal(r) });
  if (r.ok && action === 'take') tookOffer(id);
  await refresh();
  if (r.ok && (action === 'turn' || action === 'skip') && view.bookOpen) await loadKaifu();
  if (r.ok && action === 'turn') showTurned(id, r);
  // A real-life chore that means something in the book (rules/gongke.mjs): she hears the facts and says it her way.
  if (r.ok && action === 'turn' && r.meaning) tellGongke(r);
  // An errand handed in: the book is put away and its payoff stands on the stage, with the way back to the story.
  if (r.ok && action === 'turn' && r.turned) show({ bookOpen: false, handin: { place: look?.place?.id ?? null, title: r.title ?? '', seen: r.seen ?? null, paid: r.paid ?? null } });
  // 交差 on 传闻's line counts a kept win: the next step is the story's.
  if (r.ok && id === 'tale' && r.ended) taleEnded(r.handed?.[0]?.title ?? r.title);
  if (r.ok && id === 'tale' && (r.ended || r.step)) await report(`[scene] tale ${r.ended ? 'end' : 'step'}`);
}
/* 人间功课 handed in: the facts to her — the chore, its meaning in the book, what landed — never a line of ours. */
function tellGongke(r) {
  const m = r.meaning, p = m.paid ?? {};
  const got = (zh) => [p.wealth ? (zh ? `灵石 +${p.wealth}` : `+${p.wealth} spirit stones`) : '', p.progress ? (zh ? `修为 +${p.progress}` : `+${p.progress} cultivation`) : '',
    p.item_name ?? '', m.week?.paid ? (zh ? `${m.week.name}（灵石 +${m.week.paid.wealth}）` : `${m.week.name} (+${m.week.paid.wealth} stones)`) : ''].filter(Boolean).join(zh ? '，' : ', ');
  const zh = `玩家在人间做完了一件功课「${r.title ?? ''}」，在书里算${m.name}：${m.about}${got(true) ? ` 得了：${got(true)}。` : ''}`;
  const en = `The player finished a real-life chore, "${r.title ?? ''}" — in the book it counts as ${m.name}: ${m.about}${got(false) ? ` Gained: ${got(false)}.` : ''}`;
  // Walking with him, she hears the facts and says it her way; asleep in the 木牌, its drowsy word (hersay.js), once a chore a day.
  if (herHere()) tellYinyue('gongke', zh, en, { mood: 'happy' });
  else herSay.say('gongke', lang() === 'en' ? en : zh, { key: `${r.quest ?? ''}|${new Date().toDateString()}` });
}
let handedTimer = null;
/* A 交差 seen where it was tapped: its pay (and a 修为 the cap held) tops the 事 book a moment. */
function showTurned(id, r) {
  const at = Date.now();
  show({ turned: { id, title: r.title ?? '', paid: r.paid ?? r.handed?.[0]?.paid ?? null, at } });
  setTimeout(() => { if (view.turned?.at === at) show({ turned: null }); }, TURNED_MS + 50);
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

/* ── AI mini-games (rules/aigames.mjs) — the page's taps ──
   二十问 opens on his tap (a game's 体力) and the chat carries a word to her;
   the guess box is checked by the rules, then she is told, so she reacts in
   her own words; 断案's look-around and 指认 are his taps, judged by the rules. */
async function aiTap(name, args) {
  const r = await write(name, args).catch(failed);
  keep({ aiNote: r.ok ? null : refusal(r) });
  await refresh();
  return r;
}
async function twentyOpen() {
  const r = await aiTap('twenty', { action: 'open' });
  if (r.ok && r.opened && herHere()) deliver(words().twentyAsk, false);
}
async function twentyGuess() {
  const g = (view.twentyGuess ?? '').trim();
  if (!g) { document.getElementById('twenty-guess')?.focus(); return; }
  const r = await aiTap('twenty', { action: 'guess', guess: g });
  if (r.ok) { keep({ twentyGuess: '' }); if (!r.again && herHere()) deliver(fill(words().twentySaid, { g }), false); }
  // The first win at it ever (hersay.js game_first: once a game) — asleep, from the 木牌; awake the chat carries it.
  if (r.ok && r.right && !herHere()) herSay.say('game_first', lang() === 'en' ? 'Twenty Questions, guessed right.' : '二十问，猜中了。', { key: 'twenty' });
}
async function caseAccuse() {
  const r = await aiTap('case', { action: 'accuse', who: view.caseWho, evidence: (view.caseEv ?? []).join(',') });
  if (r.ok && r.right) herSay.say('game_first', lang() === 'en' ? 'The case, solved — the right culprit, the right proof.' : '断案，指认对了，证据也对。', { key: 'case' });
  if (r.ok) { keep({ caseWho: null, caseEv: [] }); await report(`[scene] case ${r.right ? 'solved' : 'wrong'}`); }
}

/* ── 对对子 (rules/duizi.mjs) — the page's taps ──
   请先生出上联 deals the round (a game's 体力); 对上 sends his 下联 to the rules,
   which check the form, then his line goes to the chat as his own and Ling grades
   it (the card waits, quietly, meanwhile). The reverse: his 上联, Ling answers.
   银月's hint and her own 下联 are asked of her in the chat — only while she is awake. */
const duiziWords = () => DUIZI_WORDS[lang() === 'en' ? 'en' : 'zh'];
let duiziTones; // the 平仄 table (worlds/<id>/tones.json): undefined not asked, null on its way or missing
function tonesNow() {
  if (duiziTones !== undefined || !look?.duizi) return duiziTones ?? null;
  duiziTones = null;
  content(authored?.dir ?? look.world.dir, 'tones.json').then((t) => { duiziTones = t; render(); }).catch((e) => console.warn('[lingjing] tones', e));
  return null;
}
const DUIZI_LATE_MS = 60000;
function duiziLate() {
  const r = look?.duizi?.round;
  return Boolean(r?.pending && Date.now() - Date.parse(r.sent_at ?? 0) > DUIZI_LATE_MS);
}
async function duiziOpen() {
  const r = await aiTap('duizi', { action: 'open', ...(view.duiziRung ? { rung: view.duiziRung } : {}) });
  if (r.ok) keep({ duiziDraft: '' });
}
async function duiziSubmit() {
  const down = (view.duiziDraft ?? '').trim();
  if (!down) { document.getElementById('duizi-down')?.focus(); return; }
  const r = await aiTap('duizi', { action: 'submit', down });
  if (!r.ok || !r.submitted) return;
  show({ duiziDraft: '' });
  deliver(fill(duiziWords().say, { down: r.duizi?.round?.down ?? down }), false);
  // Still waiting a minute on: the card offers to ask again.
  setTimeout(() => { if (look?.duizi?.round?.pending) render(); }, DUIZI_LATE_MS + 500);
}
async function duiziReverse() {
  const up = (view.duiziUp ?? '').trim();
  if (!up) { document.getElementById('duizi-up')?.focus(); return; }
  const r = await aiTap('duizi', { action: 'reverse', up });
  if (r.ok && r.reversed) { show({ duiziUp: '', duiziRevOpen: true }); deliver(fill(duiziWords().revSay, { up: r.duizi?.rev?.up ?? up }), false); }
}
/* A line he sent went unanswered: one more word to Ling, hidden. */
const duiziResend = () => report(`[scene] duizi waiting: 「${look?.duizi?.round?.down ?? ''}」 to 「${look?.duizi?.round?.up ?? ''}」 waits for your grade (Duizi grade)`);
/* 银月 asked, in his words — her tool keeps the count; asleep, the buttons are not there. */
function duiziHer(kind) {
  const up = look?.duizi?.round?.up;
  if (!up || !herHere()) return;
  if (kind === 'hint') tracker.boardHint('duizi');
  deliver(fill(duiziWords()[kind === 'hint' ? 'hintSay' : 'offerSay'], { up }), false);
}

/* 储物袋: putting a thing on, taking a pill, selling at a market, is his own
   tap — the page calls Trade itself and redraws from the rules; no model turn. */
async function useItem(id, action = 'use') {
  const r = await write('trade', { action, id }).catch(failed);
  // A refusal is said where he tapped — a pill kept on a full day said
  // nothing, and looked like a button that did not work.
  await openGear();
  keep({ gearNote: r.ok ? null : refusal(r) });
  await refresh();
}

/* `pane`: null opens the 储物袋, 'deck' the 牌组 — two chips, one panel's read. An open panel on the other one switches. */
async function openGear(pane = null) {
  if (view.gearOpen) return show({ pouchPane: pane, pouchToss: null });
  show({ gearOpen: true, luOpen: false, ...othersShut('gearOpen'), gear: null, pouchToss: null, pouchPane: pane });
  const r = await verb('gear').catch((e) => { console.warn('[lingjing] gear', e); return null; });
  if (view.gearOpen) show({ gear: r?.gear ?? null, gearNote: null });
  if (view.gearOpen && view.pouchPane === 'fantong') await loadFantong();
}

/* 待取 taken in, or a slot thrown away — the panel's own verb (rules/pouch.mjs). */
async function bagTap(action, id) {
  const r = await write('bag', { action, id }).catch(failed);
  await openGear();
  keep({ gearNote: r.ok ? null : refusal(r), pouchToss: null, ...(r.ok && action === 'toss' ? { pouchSel: null } : {}),
    ...(r.ok && action === 'claim' && !r.pouch?.held?.length ? { pouchPane: null } : {}) });
  await refresh();
}

/* The panel in the stage's place while open, like the 录 book: redrawn only
   when it changed, so a stream token never resets its scroll. */
let drawnPouch = null;
function drawPouch() {
  const el = $('pouchbook');
  const open = view.gearOpen && !bout;
  if (open) document.body.classList.add('reading');
  el.hidden = !open;
  if (!open) { drawnPouch = null; ftKailu.stop(); return; }
  const fantongPane = view.pouchPane === 'fantong' ? kailuPaneHtml(lang()) : null;
  const html = pouchHtml({ ...ctx(), gear: view.gear, gearNote: view.gearNote, artBase: artBase(), catalog: cardCatalog(), fantongPane },
    { tab: view.pouchTab, sel: view.pouchSel, toss: view.pouchToss, pane: view.pouchPane });
  if (html !== drawnPouch) { el.innerHTML = html; drawnPouch = html; }
  if (view.pouchPane === 'fantong') ftKailu.show(view.fantong, { lang: lang(), reducedMotion: stillMotion() });
  else ftKailu.stop();
}

/* 喂饭桶 · 开炉 (rules/fantong.mjs): the brief, read when the pane opens and again when the bucket may eat; a feed is
   the page's own verb, sent by the game (fantong-kailu.js) with the pot and the press — no model turn. */
async function loadFantong() {
  const r = await verb('fantong', { action: 'look' }).catch(failed);
  if (view.gearOpen) show({ fantong: r?.fantong ?? null });
}
const feedFantong = (ids, lingshi, press) => write('fantong', { action: 'feed', ids: ids.join(','), lingshi: lingshi || 0, press: press ? 1 : 0 }).catch(failed);
/* What came out lands in the bag: the panel and the page read it again (the game keeps showing its reveal). */
async function fedFantong(r) {
  if (!r?.ok) return;
  keep({ fantong: r.fantong ?? view.fantong });
  const g = await verb('gear').catch(() => null);
  if (view.gearOpen && g?.gear) keep({ gear: g.gear });
  await refresh();
}
/* A cooldown row counts down by the minute (Hanli 10-27: 「这个倒计时好像不变呢, 一直是7刻」 — the minutes were
   the last Look's); the moment one opens, the rules are read again so its board stands ready. */
setInterval(() => {
  const waits = look?.waits ?? [];
  if (!waits.length || document.visibilityState !== 'visible') return;
  if (waits.some((w) => w.ready_at && Date.now() >= w.ready_at)) { refresh(); return; }
  render();
}, 60_000);

/* The bowl fills back while the board is open; the moment it may eat, the brief is read again. */
setInterval(() => {
  const fb = view.fantong;
  if (!view.gearOpen || view.pouchPane !== 'fantong' || !fb || fb.ready) return;
  if (fb.next_at && Date.now() >= new Date(fb.next_at).getTime()) run('fantong:look', loadFantong);
  else render();
}, 15_000);

/* 撂下 is the rules' to do; Ling reads the book in her next Look. */
async function dropErrand(id) {
  const r = await write('quest', { action: 'drop', id }).catch(failed);
  keep({ bookRow: null, bookInfo: null, doNote: r.ok ? null : refusal(r) });
  await refresh();
}

/* The ask bar stands outside the stage's repaint, so a stream of tokens never
   takes the field from under the player's hands. It is 问问银月's alone: 问询
   sends its line without it (askNow, f0603ead). */
function openAsk(line) {
  keep({ ask: line, askHer: true });
  const bar = $('askbar');
  bar.innerHTML = askBarHtml(line, words());
  bar.hidden = false;
  $('askField').focus();
}
/* 问询 goes straight to the chat as its line (「说说狰」) — his, 2026-10-15:
   问询不必用户输入了. The bar stays for 问问银月, where the words are his. */
function askNow(line) {
  if (!line) return;
  tracker.ask('ling', 'wenxun');
  show({ bookOpen: false });
  say(line);
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
  // [Yinyue], and Ling reads the exchange on her next turn. Empty, the
  // player's gentle nudge to talk.
  closeAsk();
  if (!herHere()) return noOne();
  tracker.ask('her', bout ? 'fight' : 'ask', boardWaitsOnHer?.taskId ?? null);
  // In a fight, his words go with the position (fightsay.js) — while asks are left.
  if (bout && askHerInFight(bout, q)) return;
  deliver(`@银月 ${q || words().askHerEmpty}`, false);
  // A board waiting on her (密室): its clock starts with the words sent.
  if (boardWaitsOnHer) herClock(boardWaitsOnHer);
}
/// Rows that open where they lie answer the keyboard as a button does.
const KEY_ROWS = [
  ['[data-bookrow]', (row) => openRow(row.dataset.bookrow)],
  ['[data-offerrow]', (row) => toggleOffer(row.dataset.offerrow)],
];
/* Space or Enter goes on in the dialogue box — unless the keys are the
   player's own: a field, a button, the chat beside the stage. */
const boxKey = (e) => (e.key === ' ' || e.key === 'Enter') && !e.isComposing && !e.repeat && Boolean($('dlg')?.querySelector('[data-dlg-next]'))
  && !view.logOpen && !e.target.closest?.('input, textarea, select, button, [contenteditable], #chat-panel, [data-bookrow], [data-offerrow]');
/* 快's pages by key: → PageDown Space Enter on, ← PageUp back; on the last page Space and Enter
   go on as before (boxKey). */
const PAGE_KEYS = { ArrowRight: 1, PageDown: 1, ' ': 1, Enter: 1, ArrowLeft: -1, PageUp: -1 };
function pageKey(e) {
  const d = PAGE_KEYS[e.key];
  if (!d || !pager.on || e.isComposing || view.logOpen || e.target.closest?.('input, textarea, select, button, [contenteditable], #chat-panel')) return false;
  if ((e.key === ' ' || e.key === 'Enter') && pager.last) return false;
  if (!e.repeat) pageTurn(d);
  return true;
}
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'askField' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendAsk(); }
  if (e.target.id === 'wx-city' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.querySelector('[data-wx-set]')?.click(); }
  if (['duizi-down', 'duizi-up'].includes(e.target.id) && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.closest('.card')?.querySelector(e.target.id === 'duizi-down' ? '[data-duizi-submit]:not(:disabled)' : '[data-duizi-reverse]')?.click(); }
  if (e.target.id === 'value-text' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.closest('.valuecard')?.querySelector('[data-value-go]:not(:disabled)')?.click(); }
  if (e.key === 'Escape' && view.logOpen) { show({ logOpen: false }); lines.hold(false); return; }
  if ((e.key === ' ' || e.key === 'Enter') && !e.isComposing && !e.target.closest?.('input, textarea, select, [contenteditable], #chat-panel') && titleAway()) { e.preventDefault(); return; }
  if (gameKey(e)) { e.preventDefault(); return; }
  if (pageKey(e)) { e.preventDefault(); return; }
  if (boxKey(e)) { e.preventDefault(); storyTap(); return; }
  if (e.key === 'Escape') { if (view.ask) closeAsk(); else if (view.luOpen) show({ luOpen: false }); else if (view.pouchToss) show({ pouchToss: null }); else if (view.bookOpen || view.gearOpen || view.ledgerOpen || view.roadsOpen || view.shelfOpen || view.wxOpen) show({ bookOpen: false, gearOpen: false, ledgerOpen: false, roadsOpen: false, shelfOpen: false, wxOpen: false }); }
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
/* 「算了，往下走」 under a story's board, there once he is stuck (stuck.js): left, not won — the rules
   pay nothing for it (rules/skips.mjs), no win line is read, and the story goes on as after a win.
   A board the rules would not let go is laid again as it was. */
/* 收手 — a board he opened by choice, put down at any moment (Look's task `leave`, rules/skips.mjs leaveOf): its play
   taken down (the canvas, its loop, its window listeners), the board back in the tray, the stage as it stood before it
   — the scene's choices, the tray. The rules write nothing for it, or put a board offered again back with the skipped.
   Nothing is paid and nothing is spent. */
function leaveGame(id) {
  const g = boards.get(id);
  if (g?.sent || g?.state?.won) return true;
  if (g) g.left = true;
  // A rules-judged board that held her out (密室) puts her back; a mounted one does so itself (its `rest`).
  if (g?.mod?.fromLook && look?.companion?.out_for === id) herOut(id, false);
  tracker.boardEnd(id, 'left');
  beats.leave(id);
  boards.delete(id);
  forgetShell(id);
  show({ opened: view.opened?.id === id ? null : view.opened, left: [...view.left.filter((l) => l.id !== id), { id, place: look?.place?.id ?? null, scene: look?.scene?.id ?? null }] });
  run(`leave:${id}`, async () => {
    const r = await write('task', { action: 'leave', id }).catch(failed);
    if (!r?.ok) keep({ doNote: refusal(r) });
    await refresh();
  });
  return true;
}
function skipGame(id) {
  const g = boardFor(id);
  if (!g?.mod || g.state?.won || g.sent || g.skipped) return true;
  g.skipped = true;
  g.state = { ...g.state, live: false };
  render();
  run(`skip:${g.taskId}`, () => onSkip(g));
  return true;
}
async function onSkip(g) {
  const id = g.taskId;
  const r = isTale(id) ? await write('tale', { action: 'skip', board: id }).catch(failed) : await write('task', { action: 'skip', id }).catch(failed);
  if (!r.ok) {
    console.warn('[lingjing] skip refused', r);
    g.skipped = false;
    g.state = { ...g.state, live: true };
    keep({ doNote: refusal(r) });
    await refresh();
    return false;
  }
  tracker.boardEnd(id, 'skipped');
  // An errand's board skipped (跳过 · 酬减半, rules/tasks.mjs errandSkip): counted for the errand at the cut pay — off the
  // stage as a won one leaves it, what it paid as 所得, the errand handed in after it; no word of hers.
  if (r.for === 'errand') return errandSkipped(id, r);
  // Left, not won: a gentle word from her, never guilt (hersay.js skipped, once in 30 min).
  herSay.say('skipped', '');
  if (isTale(id)) return taleDone(r);
  await refresh();
  const on = winExit(id, null, true);
  if (on && !look?.tell_owed) await panelTap(on.id, look?.scene?.panel?.taps?.find((t) => t.id === on.id)?.label ?? on.id);
  return true;
}
async function errandSkipped(id, r) {
  keep({ doNote: null, ...(boardPaid(r) ? { spoils: { place: look?.place?.id ?? null, cards: [], items: [], paid: r.paid, spent: [], line: null } } : {}) });
  leaveWonBoard(id);
  await refresh();
  bringWonIntoFocus();
  return true;
}
/* The skip's slot fills itself the moment he is stuck — the clock, or the game saying so — without
   a repaint of the page: a live game's own repaints never touch it (it is outside [data-game]). */
/* …and empties itself once the board is won or left (stuck.js slotNext). */
function openStuckSlots() {
  for (const slot of document.querySelectorAll('[data-skip-slot]')) {
    const next = slotNext(boards.get(slot.dataset.skipSlot), Date.now(), Boolean(slot.firstElementChild));
    if (next === 'fill') {
      const cut = slot.dataset.skipCut ?? null; // an errand's board: 「跳过 · 酬减半」 (cards.js skipBoard)
      slot.innerHTML = skipButton(slot.dataset.skipSlot, lang(), 'skipIcon' in slot.dataset, cut); // the shell bar's ✕, or the word under a board
      bringIntoFocus(slot.firstElementChild);
      // Stuck: she spurs him once a board, and may point to Ling (hersay.js stuck) — a story board's only; an errand's
      // skip says its cut and nothing more (Hanli 10-27: no 银月 lines for it).
      if (cut == null) herSay.say('stuck', '', { key: slot.dataset.skipSlot });
    } else if (next === 'clear') slot.innerHTML = '';
  }
}
setInterval(openStuckSlots, 1000);
/* The way out shows where he is looking (live 2026-10-19, 喂饼 at 390: 「算了，往下走」 came under the
   stage's fold, cut in half): the stage's own scroller (#focus) moves just enough — never the page.
   Above the view, it moves up to it the same way (a won game's 所得 stands over the cards). */
function bringIntoFocus(el) {
  const box = $('focus');
  if (!el || !box?.contains(el)) return;
  const r = el.getBoundingClientRect(), f = box.getBoundingClientRect();
  const down = r.bottom + 12 - f.bottom, up = r.top - 12 - f.top;
  const by = up < 0 ? up : down > 0 ? Math.min(down, up) : 0;
  if (by) box.scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
/* A game won on the story page: what it paid (所得) or its note is seen, not left over the fold of a tall stage —
   looked for once the redraw that follows the win has landed. */
function bringWonIntoFocus() {
  requestAnimationFrame(() => bringIntoFocus(document.querySelector('#focus .toasts .spoils, #focus .toasts .donote')));
}
/* A board left on an earlier day, offered again (Look's replay): 再试一回 lays it as it was; 改日 puts it off. */
async function replayTap(id, play) {
  const r = await write('task', { action: play ? 'replay' : 'later', id }).catch(failed);
  if (!r.ok) keep({ doNote: refusal(r) });
  await refresh();
}
function gameMove(gmove) {
  // A board's tap outside its host (the card's 问询 on a 密室: `data-gfor`) acts on the board it names.
  const ghost = gmove.closest('[data-game]') ?? (gmove.dataset.gfor ? document.querySelector(`[data-game="${CSS.escape(gmove.dataset.gfor)}"]`) : null);
  if (!ghost || gmove.disabled) return false;
  return gameAct(ghost, { ...gmove.dataset }, gmove);
}
/* A board that names keys (`meta.keys`: 华容道's WASD and arrows) plays by them on the story's stage too, as
   games/mount.js plays them off it (Hanli 10-27: 「华容道让玩家可以wasd移动物品」 — on the stage the keys did nothing). */
function gameKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.target.closest?.('input, textarea, select, [contenteditable], #chat-panel')) return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  for (const ghost of document.querySelectorAll('[data-game]')) {
    const g = boardFor(ghost.dataset.game), action = g?.mod?.meta?.keys?.[key];
    if (!action || g.sent || g.state?.won || !ghost.offsetParent) continue;
    // A `pass` key that would change nothing (华容道's Esc with nothing picked) goes on to the page's own use.
    if (action.pass && g.mod.act(g.state, action).state === g.state) continue;
    gameAct(ghost, { ...action }, ghost);
    return true;
  }
  return false;
}
function gameAct(ghost, action, at) {
  const g = boardFor(ghost.dataset.game);
  if (!g) return true;
  if (g.state.wait) return true; // the rival's turn: taps wait for the reply
  const before = g.mod.html ? g.mod.html(g.state, lang()) : null, was = g.state;
  const r = g.mod.act(g.state, action);
  g.state = r.state;
  let press = 'tap';
  if (before != null && !answered(before, g.mod.html(g.state, lang()), r)) { tapNope(document, at); press = 'nope'; } // never a silent tap
  sounded(shellFor(g.taskId, g.mod.meta?.id), g.mod, was, g.state, press); // its sound, as off the story (games/kit/heard.js)
  render();
  // A board the rules judge hands back a verb to run (`send`) and a turn to 银月 (`her`) — never a win of its own.
  if (r.her) boardAsksHer(g);
  if (r.send) { g.sent = true; run(`send:${g.taskId}:${r.send.args?.action ?? ''}`, () => boardSends(g, r.send)); return true; }
  if (r.won && !g.sent) { g.sent = true; settleShell(g.taskId, { won: true, stars: g.state?.stars ?? null }); forgetShell(g.taskId); run(`win:${g.taskId}`, () => onWin(g.taskId)); }
  if (r.state.wait && g.mod.think) rivalTurn(g);
  return true;
}
/* A rules-judged board's verb (密室: open, try, asked, hint, skip, leave): the answer goes back to the
   module (`heard`), then the save is read again — the room's view, the pay on the strip. Opened, she
   hears that the old pages here are hers to read (her own tool, Mishi, carries them — never this page). */
async function boardSends(g, send) {
  // A board that needs her out of the 木牌 (task `needs: "her"`) wakes her for its round; back in once he is out. Here
  // — awake, or asleep and speaking half awake (the 密室, Hanli 2026-10-27: 「yinyue睡着也可以说话」) — the help is
  // hers to say, no longer read off the board (`alone`).
  const task = look?.tasks?.find((t) => t.id === g.taskId);
  if (send.args?.action === 'hint') tracker.boardHint(g.taskId);
  if (task?.her && !CHATLESS && ['open', 'ask'].includes(send.args?.action) && !herUp()) await herOut(g.taskId, true);
  if (herHere() && !CHATLESS && send.args?.alone) { const { alone, ...rest } = send.args; send = { ...send, args: rest }; }
  const res = await write(send.verb, send.args ?? {}).catch(failed);
  if (task?.her && (res?.out || res?.left)) herOut(g.taskId, false);
  // Answered: the board plays on — its next try, 跳过这一道, and 收手 (cards.js reads `sent`) stand again
  // (Hanli 10-27, 密室: 「这个也没有跳过去的办法」 — `sent` stayed set after 推开看看 and took 收手 away for good).
  g.sent = false;
  const was = g.state;
  if (g.mod.heard) g.state = g.mod.heard(g.state, res);
  sounded(shellFor(g.taskId, g.mod.meta?.id), g.mod, was, g.state);
  render();
  // A help tier opened (问银月, or unasked below): she says it in her own words, from the rules' facts.
  if (res?.ok && res.asked) mishiHelp(g, res);
  // Unasked, she explains the play: a room just opened, a new mechanism up, or a few misses on one (Hanli 10-27:
  // 「关键是问yinyue怎么玩, 她应该告诉玩法才对」). Each opens the next tier, as 问银月 would.
  else if (res?.ok && (res.opened || (res.right && !res.out) || res.offer)) { await refresh(); return boardAsks(g, res.opened ? 'open' : res.offer ? 'offer' : 'next'); }
  // Out of the 密室 with nothing skipped: a rare find, worth her word (hersay.js rare).
  if (res?.ok && res.out && res.escaped) herSay.say('rare', lang() === 'en' ? `Escaped the hidden room, nothing skipped.${res.paid?.wealth ? ` +${res.paid.wealth} stones.` : ''}` : `走出了密室，一道机关都没跳过。${res.paid?.wealth ? `得灵石${res.paid.wealth}。` : ''}`, { key: `mishi|${Date.now()}` });
  await refresh();
}
/* 问银月 from a board: the ask bar turned to her, when she is here to hear it; her clock starts when the words go (sendAsk). Absent, it starts now — the module
   waits out its short wait and offers the torn page itself. */
let boardWaitsOnHer = null;
function boardAsksHer(g) {
  boardWaitsOnHer = g;
  if (herUp() && !CHATLESS) openAsk(words().askHer.replace('{name}', look?.companion?.name ?? words().yinyue));
  else herClock(g);
}
function herClock(g) {
  if (!g?.mod?.heard) return;
  g.state = g.mod.heard(g.state, { her: 'asked' });
  render();
  // Read again after: the room's `hint_at` (when the torn page may be read) is the rules' answer.
  run(`send:${g.taskId}:asked`, () => write('mishi', { action: 'asked' }).catch(failed).then(() => refresh()));
}
/* Her guest turn ended: the board that waited on her stops its clock — she answered in time. */
/* Her reply as she said it: the last paragraph (the spoken one), plain; SILENT is no line. */
const herLast = (text) => { const p = String(text ?? '').split(/\n\s*\n/).map((x) => x.replace(/[*_`]/g, '').trim()).filter(Boolean).at(-1) ?? ''; return /^SILENT$/i.test(p) ? '' : p.replace(/^(银月|Yinyue)\s*[：:]\s*/, ''); };
function herAnswered(text = '') {
  const g = boardWaitsOnHer;
  boardWaitsOnHer = null;
  // Her line stands on the board too (密室): what she said is there when the chat is shut.
  if (g?.mod?.heard) { g.state = g.mod.heard(g.state, { her: 'spoke', text: herLast(text) }); render(); }
}
/* The 密室's next help tier, asked for without a tap (a room opened, a new mechanism, a few misses). */
function boardAsks(g, why) {
  boardFor(g.taskId); // the room as Look has it now (fromLook): the new mechanism's step, never the last one's
  const p = g.state?.view?.puzzles?.find((x) => x.at === 'open');
  if (!p || g.state.busy) return;
  g.askWhy = why;
  const r = g.mod.act(g.state, { g: 'her' });
  g.state = r.state;
  render();
  if (r.send) { g.sent = true; run(`send:${g.taskId}:ask`, () => boardSends(g, r.send)); }
}
/* Her word on the 密室: the room's facts and the tier the rules opened, to say as herself in a line or two; the board
   waits on her (her clock) and shows the tier's words itself only if she lets it run out. */
function mishiHelp(g, res) {
  const why = g.askWhy ?? 'asked';
  g.askWhy = null;
  const last = res.help?.[res.help.length - 1] ?? '';
  const whyZh = { open: '你们刚推开暗门进来，他还不知道这机关怎么玩', next: '前一道机关开了，下一道露了出来', offer: `他试错了${res.wrong}次，还卡着`, asked: '他问你这道机关怎么玩' }[why];
  const whyEn = { open: 'You two just came in; he does not know how the mechanism works yet', next: 'The last mechanism gave way; the next one shows', offer: `He has missed ${res.wrong} times and is stuck`, asked: 'He asks you how this mechanism works' }[why];
  // The engine keeps 300 characters of a moment's facts: the tier first and whole, then what he sees, as room allows.
  const fit = (head, tail, max = herFactsMax()) => { const t = `${head}${tail}`; return [...t].length <= max ? t : head; };
  // Tier 1 is the play alone: nothing on the board goes with it, so she never works a year or an answer out of it
  // (live 10-27: given the needle's 甲子 and 「封后2岁」 she told him 丙寅 — a guess, and wrong).
  const play = res.tier <= 1;
  const zh = fit(`密室第${res.step}道。${whyZh}。用你自己的话一两句告诉他（提示${res.tier}/${res.of}，只说这条，${play ? '只讲怎么玩，不提任何年份、字或答案' : '别越过它，别自己推算'}）：${last}`, play ? '' : `\n他眼前：${res.read ? `铜盘先前停在${res.read}。` : ''}${res.seen}`);
  const enT = fit(`Hidden room, mechanism ${res.step}. ${whyEn}. Tell him in your own words, a line or two (hint ${res.tier}/${res.of}, this only — ${play ? 'how it plays, no year, character or answer' : 'nothing past it, work nothing out yourself'}): ${last}`, play ? '' : `\nBefore him: ${res.read ? `the dial stopped on ${res.read}. ` : ''}${res.seen}`);
  boardWaitsOnHer = g;
  const sid = chat?.getSessionId?.() ?? null, before = herLinesIn(sid);
  askHer('mishi', zh, enT, 'neutral').then(async (heard) => {
    // Nobody will hear it (the pet off, her presence refused): the tier is read off the board at once.
    if (!heard) { if (boardWaitsOnHer === g) boardWaitsOnHer = null; run(`send:${g.taskId}:hint`, () => boardSends(g, { verb: 'mishi', args: { action: 'hint', alone: 1 } })); return; }
    // A moment's answer is spoken by her (the pet) and kept in this chat's session, not streamed to the page:
    // her new line is read from there, so it stands on the board and stops the clock (live 10-27).
    const seen = (await before).length, until = Date.now() + ((g.state.view?.hint_wait_s ?? 25) + 5) * 1000;
    while (boardWaitsOnHer === g && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 1200));
      const lines = await herLinesIn(sid);
      if (lines.length > seen && boardWaitsOnHer === g) { herAnswered(lines.at(-1)); return; }
    }
  });
}
/* Her first line in this chat's session after `before` (herLinesIn as the ask went out), read every 1.2 s for a
   while; never resolves when none comes (the moment's own fallback stands). */
async function herNewLine(sid, before, ms = 25000) {
  if (!sid) return new Promise(() => {});
  const seen = (await before).length, until = Date.now() + ms;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1200));
    const lines = await herLinesIn(sid);
    if (lines.length > seen) return lines.at(-1);
  }
  return new Promise(() => {});
}
/* Her lines to the player in this chat's session, oldest first (the engine keeps them; /shared/api.js). */
async function herLinesIn(sid) {
  if (!sid || typeof sharedApi.fetchSessionMessages !== 'function') return [];
  const rows = await sharedApi.fetchSessionMessages(SKILL, sid).catch(() => []);
  return rows.filter(([m]) => m?.from === 'yinyue' && m.to === 'user').map(([, text]) => String(text ?? ''));
}
/* The rival's turn (a module that `think`s, as 象棋 does): thought in a Worker so
   the page stays live, laid in by the module's `answer` — only if the board is
   still the one it was thought for. */
const think = thinker(() => new Worker(new URL('./think-worker.js', import.meta.url), { type: 'module' }));
function rivalTurn(g) {
  const asked = g.state;
  think(g.mod, asked)
    .then((m) => { if (stillAsked(boards, g, asked)) { g.state = g.mod.answer(asked, m); sounded(shellFor(g.taskId, g.mod.meta?.id), g.mod, asked, g.state); render(); } })
    .catch((e) => console.warn('[lingjing] rival', g.taskId, e));
}
function tileTap(tile) {
  const host = tile.closest('[data-board]');
  if (!host) return false;
  const board = boardFor(host.dataset.board);
  // The herbs sound as the 游戏厅's lianliankan does (board.js tapHeard), and the furnace made chimes (the shell's settle).
  const { won: cleared, event } = tapHeard(board, Number(tile.dataset.tile));
  shellFor(board.taskId, 'lianliankan').sound(event);
  render();
  if (cleared && !board.sent) { board.sent = true; settleShell(board.taskId, { won: true }); forgetShell(board.taskId); run(`win:${board.taskId}`, () => onWin(board.taskId)); }
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
  ['[data-book]', () => { show({ bookOpen: !view.bookOpen, ...othersShut('bookOpen') }); if (view.bookOpen) loadKaifu(); }],
  ['[data-roads]', () => show({ roadsOpen: !view.roadsOpen, ...othersShut('roadsOpen') })],
  ['[data-shelf]', () => show({ shelfOpen: !view.shelfOpen, ...othersShut('shelfOpen') })],
  ['[data-ledger]', () => show({ ledgerOpen: !view.ledgerOpen, ...othersShut('ledgerOpen') })],
  ['[data-wx]', () => run('wx:open', () => openWx())],
  ['[data-wx-set]', () => { if (skyDraft.city.trim()) run('wx:set', () => setSense({ city: skyDraft.city.trim() })); }],
  ['[data-wx-off]', (el) => run('wx:off', () => setSense({ off: el.dataset.wxOff === 'off' }))],
  ['[data-wx-clear]', () => run('wx:clear', () => setSense({ city: null }))],
  // Any other tap puts an open popover away first, then does what it was for — the story's own
  // controls too: 回看 opened under the 事 book left the book over the log's 合上 (the crawler, 2026-10-15).
  ['*', (el, e) => {
    if (view.bookOpen && !e.target.closest('.bookpop') && !e.target.closest('#askbar')) show({ bookOpen: false });
    if (view.ledgerOpen && !e.target.closest('.ledgerpop')) show({ ledgerOpen: false });
    if (view.wxOpen && !e.target.closest('.wxpop') && !e.target.closest('[data-wx]')) show({ wxOpen: false });
    // A road tapped walks it, and the list closes with it.
    if (view.roadsOpen && (!e.target.closest('.roadspop') || e.target.closest('[data-go]'))) show({ roadsOpen: false });
    if (view.shelfOpen && !e.target.closest('.shelfpop')) show({ shelfOpen: false });
    return false;
  }],
  // AI mini-games (aigames-cards.js): the page's own taps — the rules count and judge;
  // before the stage's own catch-all taps (the next sentence), which would take them.
  ['[data-twenty-open]', () => run('twenty:open', () => twentyOpen())],
  ['[data-twenty-guess]', () => run('twenty:guess', () => twentyGuess())],
  ['[data-twenty-quit]', () => run('twenty:quit', () => aiTap('twenty', { action: 'quit' }))],
  ['[data-case-look]', (el) => run(`case:look:${el.dataset.caseLook}`, () => aiTap('case', { action: 'look', at: el.dataset.caseLook }))],
  ['[data-case-who]', (el) => show({ caseWho: view.caseWho === el.dataset.caseWho ? null : el.dataset.caseWho, aiNote: null })],
  ['[data-case-ev]', (el) => { const id = el.dataset.caseEv, ev = view.caseEv ?? []; show({ caseEv: ev.includes(id) ? ev.filter((x) => x !== id) : [...ev, id], aiNote: null }); }],
  ['[data-case-accuse]', (el) => { if (!el.matches(':disabled')) run('case:accuse', () => caseAccuse()); }],
  ['[data-duizi-open]', () => run('duizi:open', () => duiziOpen())],
  ['[data-duizi-rung]', (el) => show({ duiziRung: el.dataset.duiziRung, aiNote: null })],
  ['[data-duizi-submit]', (el) => { if (!el.matches(':disabled')) run('duizi:submit', () => duiziSubmit()); }],
  ['[data-duizi-skip]', () => run('duizi:skip', () => aiTap('duizi', { action: 'skip' }))],
  ['[data-duizi-reverse]', () => run('duizi:reverse', () => duiziReverse())],
  ['[data-duizi-resend]', () => run('duizi:resend', () => duiziResend())],
  ['[data-duizi-her]', (el) => duiziHer(el.dataset.duiziHer)],
  ['.dzrev > summary', () => { keep({ duiziRevOpen: !view.duiziRevOpen }); }], // the native toggle; kept so a redraw leaves it as he set it
  // The scene's choices (on its card, or inside the box at its last beat) come before the box's own taps.
  ['[data-look-at]', (el) => { if (!el.matches(':disabled')) run(`look:${el.dataset.lookAt}`, () => lookAt(el.dataset.lookAt)); }],
  ['[data-panel-duel]', (el) => { if (!el.matches(':disabled')) callDuel(el.dataset.panelDuel); }],
  ['[data-panel-exit]', (el) => { if (el.matches(':disabled')) return; inertNow(el); run(`panel:${el.dataset.panelExit}`, () => panelTap(el.dataset.panelExit, el.textContent.trim(), el.dataset.panelAnswer, el.dataset.panelPass === '1')); }],
  // The story's quiet controls — 回看, 跳过, 配音, 慢 中 快 — first; then a tap anywhere on the stage (the next sentence).
  // 回看 open, the lines wait under it (proto a: 「回看」 pauses the passage); closed, they go on.
  ['[data-game-skip]', (el) => skipGame(el.dataset.gameSkip)],
  ['[data-board-leave]', (el) => leaveGame(el.dataset.boardLeave)],
  ['[data-fight-tap]', (el) => fightTap(el.dataset.fightTap)],
  ['[data-replay-play]', (el) => { run(`replay:${el.dataset.replayPlay}`, () => replayTap(el.dataset.replayPlay, true)); return true; }],
  ['[data-replay-later]', (el) => { run(`replay:${el.dataset.replayLater}`, () => replayTap(el.dataset.replayLater, false)); return true; }],
  ['[data-dlg-log]', () => { show({ logOpen: !view.logOpen }); lines.hold(view.logOpen); }],
  ['[data-dlg-logclose]', () => { show({ logOpen: false }); lines.hold(false); }],
  ['[data-dlg-voice]', () => { setDub(!dubOn()); render(); }],
  ['[data-dlg-speed]', (el) => { if (el.dataset.dlgSpeed === 'skip') tracker.readSkipped(); return setSpeed(el.dataset.dlgSpeed); }],
  ['[data-dlg-aside]', () => { run('aside', asideTap); return true; }],
  ['[data-aside-resume]', () => { run('resume', resumeTap); return true; }],
  // …but a choice inside the box (its last beat's ways: an errand's 接下, any button there) is that choice's
  // own tap, never the next sentence — the box's catch-all yields to the rest of this list (2026-10-15, live:
  // 外门's 「接下差事：修屋顶」 inside the story view landed here and did nothing).
  // 快's column: 「接着往下」 is its way on; a tap on its words is reading (scrolling, a pause), never the next.
  ['[data-dlg-onward]', () => storyTap()],
  // 快's pages: 上一页 · 下一页, and a tap on the stage turns on (never a selection, never a swipe's end) —
  // the passage goes on only by the last page's 「接着往下」 or a key.
  ['[data-pg]', (el) => { if (!el.disabled) pageTurn(Number(el.dataset.pg)); }],
  ['[data-dlg-next]', (el, e) => (e?.target?.closest?.('.ways button, .wayacts button') ? false : readingHere()?.all?.whole ? wordsTap() : storyTap())],
  ['.dlglog', () => true],
  ['[data-lu]', () => (view.luOpen ? show({ luOpen: false }) : openLu())],
  ['[data-lu-close]', () => show({ luOpen: false, codexOpen: null })],
  // 录: a 回 finished, its whole 评书 (the player takes the button's place).
  ['[data-listen]', (el) => listener.open(el.closest('[data-listen-slot]'), el.dataset.listen, el.dataset.listenUrl)],
  // 录's 图鉴: a met entry's card opens over its grid; a second tap closes it.
  ['[data-codex-big]', (el) => openCodexBig(el.dataset.codexBig)],
  ['[data-codex-open]', (el) => show({ codexOpen: view.codexOpen === el.dataset.codexOpen ? null : el.dataset.codexOpen })],
  // 银月的记忆: the next panel (it blooms again), put away, or replayed from the album in 录.
  ['[data-mem-next]', (el) => show({ memory: view.memory && { ...view.memory, i: Number(el.dataset.memNext), at: performance.now() } })],
  ['[data-mem-close]', () => show({ memory: null })],
  // 鼎归: a tap skips to the last frame; once still, a tap puts it away.
  ['[data-doors]', () => show({ doors: null })],
  ['[data-homing]', () => { const h = view.homing; if (!h) return; if (!(h.still || performance.now() - h.at >= HOMING_MS.end)) fxRun?.ctl?.skip(); show({ homing: h.still || performance.now() - h.at >= HOMING_MS.end ? null : { ...h, still: true } }); }],
  ['[data-map-pv]', (el) => show({ mapPv: view.mapPv === el.dataset.mapPv ? null : el.dataset.mapPv })],
  ['[data-fly]', (el) => run(`fly:${el.dataset.fly}`, () => flyTo(el.dataset.fly))],
  ['[data-lu-album]', () => openLu().then(() => document.querySelector('.lualbum')?.scrollIntoView({ block: 'start' }))],
  ['[data-unroll]', () => closeUnroll()],
  ['[data-unfold]', (el, e) => { if (e?.target?.closest?.('button')) return false; closeUnfold(); return true; }],
  ['[data-mem-replay]', (el) => { const play = replayOf(view.lu?.album, el.dataset.memReplay); if (play) show({ luOpen: false, memory: { n: play.n, i: 0, play, at: performance.now() } }); }],
  ['[data-close-chapter]', (el) => { closeSeen(el.dataset.closeChapter, true); render(); }],
  ['[data-gear]', () => (view.gearOpen && view.pouchPane !== 'deck' ? show({ gearOpen: false }) : openGear())],
  ['[data-deck-open]', () => (view.gearOpen && view.pouchPane === 'deck' ? show({ gearOpen: false }) : openGear('deck'))],
  ['[data-do]', (el) => { if (!el.matches(':disabled')) run(`do:${el.dataset.do}:${el.dataset.id}`, () => doTap(el.dataset.do, el.dataset.id)); }],
  ['[data-deck]', (el) => run(`deck:${el.dataset.deck}`, () => deckTap({ action: 'toggle', id: el.dataset.deck }))],
  ['[data-deck-auto]', busy('deck:auto', () => deckTap({ action: 'auto' }))],
  ['[data-pouch-close]', () => show({ gearOpen: false, pouchToss: null })],
  ['[data-pouch-tab]', (el) => show({ pouchTab: el.dataset.pouchTab, pouchToss: null, pouchPane: null })],
  ['[data-pouch-pane]', (el) => {
    show({ pouchPane: el.dataset.pouchPane || null, pouchToss: null });
    if (el.dataset.pouchPane === 'fantong') run('fantong:look', loadFantong);
  }],
  ['[data-pouch-item]', (el) => show({ pouchSel: el.dataset.pouchItem, pouchToss: null, pouchPane: null })],
  ['[data-sell]', (el) => run(`item:sell:${el.dataset.sell}`, () => useItem(el.dataset.sell, 'sell'))],
  ['[data-toss]', (el) => show({ pouchToss: el.dataset.toss })],
  ['[data-toss-no]', () => show({ pouchToss: null })],
  ['[data-toss-yes]', (el) => run(`bag:toss:${el.dataset.tossYes}`, () => bagTap('toss', el.dataset.tossYes))],
  ['[data-claim]', (el) => run(`bag:claim:${el.dataset.claim}`, () => bagTap('claim', el.dataset.claim))],
  ['[data-wear],[data-use],[data-remove]', (el) => {
    const id = el.dataset.wear ?? el.dataset.use ?? el.dataset.remove, action = el.dataset.remove ? 'remove' : 'use';
    run(`item:${action}:${id}`, () => useItem(id, action));
  }],
  ['[data-spoils-close]', () => show({ spoils: null })],
  ['[data-handin-close]', () => show({ handin: null })],
  ['[data-seclude-open]', () => run('seclude', () => openSeclude())],
  ['[data-seclude-close]', () => show({ secludeOpen: false, secludeNote: null })],
  ['[data-seclude-focus]', (el) => show({ secludeFocus: { focus: el.dataset.secludeFocus, id: el.dataset.id ?? null }, secludeNote: null })],
  ['[data-seclude-pill]', (el) => show({ secludePill: view.secludePill === el.dataset.secludePill ? null : el.dataset.secludePill })],
  ['[data-seclude-go]', () => run('seclude', () => goSeclude())],
  ['[data-emerge]', () => run('emerge', () => emerge())],
  ['[data-emerged-close]', () => show({ emerged: null })],
  // 主页's one way to grow stronger after a loss (rules/home.mjs → strengthen.mjs): the loss card's own verb.
  ['[data-home-way]', (el) => run('home-way', () => takeWay(el.dataset.homeWay === 'todo' ? look?.home?.todo?.find((r) => r.kind === 'strengthen')?.way : look?.home?.next?.way))],
  ['[data-duel-start]', (el) => run(`duel:${el.dataset.duelStart}`, () => { keep({ walkedOut: null }); return onDuelStart(el.dataset.duelStart); })],
  // 丹囊 at the door (danang.js): one more pill packed, or the pouch emptied — the page's own until 出手.
  ['[data-pill-add]', (el) => { const [id, pill] = el.dataset.pillAdd.split('|'); const b = doorBrief(id); if (b) show({ pillPick: { ...view.pillPick, [id]: pickAfter(b, ctx(), pill) } }); }],
  ['[data-pill-clear]', (el) => show({ pillPick: { ...view.pillPick, [el.dataset.pillClear]: [] } })],
  // 问询: the one word that costs a model turn opens the ask bar; nothing is
  // sent until the player says so.
  ['[data-ask]', (el) => askNow(el.dataset.ask)],
  ['[data-ask-her]', () => (!herHere() ? noOne() : view.ask && view.askHer ? closeAsk() : openAsk(words().askHer.replace('{name}', look?.companion?.name ?? words().yinyue)))],
  ['[data-ask-send]', () => sendAsk()],
  ['[data-ask-close]', () => closeAsk()],
  ['[data-meet]', (el) => run(`meet:${el.dataset.meet}`, () => takeMeet(el.dataset.meet))],
  // 去X, 喂它X, 炼化: the page's own verbs — no word to Ling.
  ['[data-go]', (el) => { if (!el.matches(':disabled')) run(`go:${el.dataset.go}`, () => goTo(el.dataset.go)); }],
  ['[data-rerun]', (el) => { if (!el.matches(':disabled')) run(`rerun:${el.dataset.rerun}`, () => rerunTap(el.dataset.rerun)); }],
  ['[data-tame]', (el) => { if (!el.matches(':disabled')) run(`tame:${el.dataset.tame}`, () => tameTap(el.dataset.tame)); }],
  ['[data-refine-mat]', (el) => show({ refineMat: el.dataset.refineMat, refineNote: null })],
  ['[data-value-pick]', (el) => show({ valuePick: el.dataset.valuePick, valueText: '', valueNote: null })],
  ['[data-born]', (el) => { if (!el.matches(':disabled')) run('born', () => bornTap(el.dataset.born)); }],
  ['[data-appear-done]', (el) => skipAppear(el.dataset.appearDone)],
  ['[data-appear]', (el) => skipAppear(el.dataset.appear)],
  ['[data-throw]', (el) => { if (!el.matches(':disabled')) run(`throw:${el.dataset.throw}`, () => throwTap(el.dataset.throw)); }],
  ['[data-value-go]', (el) => { if (!el.matches(':disabled')) run(`value:${el.dataset.valueGo}`, () => valueTap(el.dataset.valueGo)); }],
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
  ['[data-play]', (el) => !el.matches(':disabled') && openFromTray(el.dataset.play)],
  ['[data-qnext]', (el) => putOff(el.dataset.qnext)],
  ['[data-reroll]', () => rerollTap()],
  ['[data-g]', (el) => gameMove(el)],
  ['[data-tile]', (el) => tileTap(el)],
];
// A game that runs in time (a module with `tick`: 暴雨, 射鹿, 洗髓, 小周天) is
// stepped and held here; its win goes the way a tapped win does.
// The shell's pause (games/shell.js) stops a board's clock and hands as 回看 does; its buttons are heard once, here.
wireShell(document);
fenceBoards();
// Its sounds and its kit's bed are the shell's (shellOf, by the module's id), and its win chimes (settle) as every board's does.
wireLiveGames({ boardFor, lang, paused: () => popOpen() || anyPaused(),
  shellOf: (id, g) => shellFor(id, g.mod?.meta?.id), onGone: (id) => forgetShell(id),
  onWon: (g) => { g.sent = true; settleShell(g.taskId, { won: true, stars: g.state?.stars ?? null }); forgetShell(g.taskId); openStuckSlots(); run(`win:${g.taskId}`, () => onWin(g.taskId)); } });
/* A game on the mount() contract settles with its result: the board takes it, and a win goes the way every board's does. */
function beatSettled(g, result) {
  if (g.left) return; // put down (收手): nothing to settle
  if (!result?.won && !result?.left) tracker.boardLost(g.taskId);
  if (!result?.won && !g.sent && !g.skipped) fallBackFrom(g, result);
  if (!result?.won || g.sent || g.skipped) return;
  // A game that gives stars but no grade (结印) is graded by its deal's `grades` (stars → grade), as 砸寨 grades itself.
  const graded = result.grade ?? g.data?.grades?.[String(result.stars)] ?? null;
  g.state = { ...g.state, won: true, grade: graded, stars: result.stars ?? null };
  g.sent = true;
  forgetShell(g.taskId);
  openStuckSlots();
  run(`win:${g.taskId}`, () => onWin(g.taskId));
}
/* A board's game left for the board behind it (caps.js fallBack: the camera refused or failing, or 「改用…」 after
   missing): the row's own board is dealt in its place — same task, same pay, the story never waits on a camera. */
async function fallBackFrom(g, result) {
  if (!(await fellBack(g.taskId, result, g.data, window))) return;
  boards.delete(g.taskId);
  forgetShell(g.taskId);
  await refresh();
  render();
}
document.addEventListener('click', (e) => {
  // The 回's title card goes on a tap anywhere, and the tap does nothing else (2026-10-14).
  if (titleAway()) return;
  for (const [sel, handle] of CLICKS) {
    const el = sel === '*' ? e.target : e.target.closest?.(sel);
    if (el && handle(el, e) !== false) return;
  }
});

/// Someone asked for 银月 before the player found her: one plain line in the
/// page's own note — no chat message, no turn, nothing sent.
function noOne() {
  show({ doNote: words().noOne });
}

/* ── 银月 hears what happened (engine: POST /api/yinyue/event) ──
   Facts only, in the player's language; she is not woken now. The engine keeps
   them until the player has gone quiet — or, `big`, until the screen settles —
   and then she decides whether a word fits (his, 2026-09-23: 不要每条都回复,
   只在安静了许久的时候出来说一些). Only once she walks with the player. */
function tellYinyue(id, zh, en, { mood = null } = {}) {
  if (!herHere()) return;
  voice.moment(id, { zh, en }, { mood });
}

/* The turn of a fight worth her knowing afterwards: the beast letting its 杀招
   go, once a fight. 气血 running low is her word in the fight (herCues). */
function fightMoments() {
  const st = bout?.st, foe = bout?.brief?.creature?.name ?? '';
  if (!st) return;
  if (st.foe.charge?.phase === 'spent' && !bout.told?.unleash) {
    bout.told = { ...bout.told, unleash: true };
    const sig = st.foe.signature?.name ?? {};
    tellYinyue('unleash', `${foe}放出了杀招「${sig.zh ?? ''}」`, `${foe} let its ${sig.en ?? 'signature'} go`);
  }
}

/* How it ended, for her: a loss is the big one. A bout with a person is told
   as a 比试 — nobody 降服s 马小宝 (his, 2026-09-29). */
const TOLD = {
  beast: { won: ['降服了{foe}', 'Beat {foe}', 'happy'], lost: ['输给了{foe}，它今日不会再出来了', 'Lost to {foe} — it will not come out again today', 'sad'], withdrew: ['{foe}力竭遁走，这一仗不算赢', '{foe} ran out of breath and left — not a win'] },
  person: { won: ['比试赢了{foe}', 'Won the bout with {foe}', 'happy'], lost: ['比试输给了{foe}', 'Lost the bout to {foe}', 'sad'], withdrew: ['{foe}力竭认输，这一场不算赢', '{foe} yielded, spent — not a win'] },
  // A 试 (battle-card.js fightKind): passed or not stood through — no 比试, no 降服.
  trial: { won: ['过了{foe}这一试', 'Passed the trial of {foe}', 'happy'], lost: ['{foe}这一试没撑过去', 'Did not stand through the trial of {foe}', 'sad'], withdrew: ['{foe}收了手，这一试不算过', '{foe} held back — the trial is not passed'] },
};
function toldOutcome(brief, outcome) {
  const c = brief?.creature ?? {}, kind = fightKind(c), told = TOLD[kind === 'trial' ? 'trial' : kind === 'bout' ? 'person' : 'beast'][outcome];
  if (!told) return;
  const [zh, en, mood] = told.map((t) => t.replace('{foe}', c.name ?? ''));
  tellYinyue(outcome, zh, en, told[2] ? { mood } : undefined);
}

/* ── 银月 in a fight (fightsay.js; Hanli, 2026-10-15) ──
   问银月 and her word at a key moment: the position goes to her as facts
   (view(st) — what the page shows), her line comes back on the chat's guest
   stream and stands in her bubble beside his plate. The fight never waits:
   nobody to hear it → the fallback at once; slow → the fallback at WAIT_MS,
   and her own line takes its place if it still lands while the fight is open. */
let herWaiter = null;
/// Her next line in this chat (a guest stream end) — the answer to a fight word.
function herNextLine() {
  return new Promise((done) => { herWaiter = done; });
}
function herLineCame(text) {
  const w = herWaiter;
  herWaiter = null;
  w?.(text);
}
/* 测试存档 only, opt-in: `&her=stub` answers each fight word after 1.5 s with a
   marked stub line (the model path's plumbing, no model), `&her=slow` never
   answers (the timeout's fallback). Without it a test save asks the real her. */
const HER_SEAM = SCRATCH ? new URLSearchParams(location.search).get('her') : null;
let herFactsSent = null; // the last facts, for the scratch seam's checks
const HER_MOOD = { ask: 'neutral', charge: 'neutral', low: 'sad', big: 'happy', won: 'happy', lost: 'sad' };
function herFightAsk(kind, facts) {
  herFactsSent = { kind, facts };
  // Asleep in the 木牌 the engine keeps her model away (SKILL.md absent_until: companion.awake →
  // 409): nobody will hear it, so the 木牌's own pool answers at once.
  if (herNow() !== 'awake') return { sent: Promise.resolve(false), line: new Promise(() => {}) };
  if (HER_SEAM === 'stub' || HER_SEAM === 'slow') {
    const line = HER_SEAM === 'slow' ? new Promise(() => {}) : new Promise((done) => setTimeout(() => done(`[stub] ${kind} · ${[...facts].length}`), 1500));
    return { sent: Promise.resolve(true), line };
  }
  const line = herNextLine();
  const r = voice.moment(kind === 'ask' ? 'fight_ask' : 'fight_cue', { zh: facts, en: facts }, { mood: HER_MOOD[kind] ?? null });
  return { sent: r.said, line };
}
/* The name line postMoment puts in front, so the facts fit the engine's 300. */
function herFactsMax() {
  const name = look?.name ?? '';
  const called = !name ? '' : lang() === 'en' ? `(In the game the player is ${name}.) ` : `（灵境里玩家叫${name}。）`;
  return 296 - [...called].length - [...sleepNote()].length;
}
const herFactsCtx = (b) => ({ ...boutCtx(), tiers: { you: b.setup?.you?.tier, foe: b.setup?.foe?.tier }, max: herFactsMax() });
function fightSayFor(b) {
  return createFightSay({
    ask: herFightAsk, lang, mode: herNow,
    onLine: (line) => {
      b.her = line;
      // The fallback is the page's: copied into the chat as hers (her own line lands there by itself).
      if (line.from === 'fallback') quietCopy(`${look?.companion?.name ?? words().yinyue}：${line.text}`);
      paintHer(b);
    },
  });
}
/// Her bubble's words: '…' while she is thinking, else her line.
function herSays(b) {
  if (!b?.her || !herFights(b)) return null;
  return b.her.from === 'wait' ? '…' : b.her.text;
}
/* Her line in the shell's bubble over the room (games/shell.js say) — painted in place, so a blow being
   drawn is never redrawn under it; the room is drawn again only between moves (问银月's count, its dim). */
const HER_FIGHT_MS = 6500;
function paintHer(b) {
  if (bout !== b) return;
  const t = herSays(b);
  if (t) shellSay(fightShell(b), look?.companion?.name ?? words().yinyue, t, b.her?.from === 'wait' ? HER_FIGHT_MS * 2 : HER_FIGHT_MS);
  const k = boutRoom(b);
  if (k && !k.busy()) k.draw();
}
/// 问银月 — true when it was asked (the ask bar falls back to the chat otherwise).
function askHerInFight(b, said = '') {
  if (!b?.say || !herFights(b) || boutYielded(b)) return false;
  const v = boutView(b.st);
  if (!b.say.canAsk(v)) return false;
  b.say.ask(v, fightFacts(v, herFactsCtx(b), 'ask', { words: said }));
  return true;
}
/* Her word at a key moment of the move just played out (fightsay.js cuesOf,
   bigPlay); the limits are fightsay's. `mine`: the move was his. */
function herCues(b, before, mark, mine) {
  if (!b?.say || !herFights(b) || boutYielded(b)) return;
  const after = boutView(b.st), log = since(b.st.log, mark);
  const kinds = cuesOf(before, after, log, { strong: strongFoe(b.brief) });
  const big = mine ? bigPlay(log, after, lang()) : null;
  if (big) kinds.push('big');
  if (kinds.length) b.say.cue(kinds, after, (k) => fightFacts(after, herFactsCtx(b), k, { what: big }));
}

/* ── 台词预取 (games/prefetch.js; Hanli 10-20: 「台词预取, 好主意! 就这么做」) ──
   A game with moments (its module reads its level: `levelOf`) is mounted with `lines`: she is asked once, as it
   mounts, for a short line at each of its moments, and the game shows each the instant its moment comes. Asleep in
   the 木牌, absent, or a chatless test save: no call, the level's own lines stand — as they do when she is late,
   fails, or answers something unusable. `&her=stub` / `&her=slow` (test saves) as for the fight. */
let prefetchLog = null;
const stubLines = (text) => JSON.stringify(Object.fromEntries([...text.matchAll(/^- ([a-z_]+)/gm)].map(([, m]) => [m, [`（桩）${m}`]])));
function prefetchFor(id, g) {
  if (typeof g?.mod?.levelOf !== 'function' || CHATLESS || herNow() === 'absent') return null;
  const ask = HER_SEAM === 'slow' ? () => new Promise(() => {})
    : HER_SEAM === 'stub' ? (text) => new Promise((done) => setTimeout(() => done(`${stubLines(text)}\nSILENT`), 1500))
      : (text, o) => askHerLines(text, { ...o, params: CHAT_PARAMS });
  const asleep = Boolean(look?.companion?.asleep);
  const p = prefetchLines({ facts: factsFor(g.mod, { data: g.data ?? {}, lang: lang() })?.then((f) => (f && asleep ? { ...f, asleep } : f)), ask, shape: g.mod.meta?.lines });
  if (!p) return null;
  prefetchLog = { id, asking: true };
  p.done.then((r) => { prefetchLog = { id, ...r }; console.info('[lingjing] 台词预取', id, r.ok ? `${Object.keys(r.got).length} moments` : r.why, `${r.ms} ms`); });
  return { lines: p.lines };
}

/* ── 银月 as companion (hersay.js; Hanli, 2026-10-15) ──
   Every won fight and every loss, a realm risen, a 回 done, a beast tamed, a
   rare find, a first win, a failed 渡劫, a board left or stuck on: the page
   gives the facts, she says it as the proud 妖王 — asleep, from the 木牌
   (its pool: the engine keeps her model away then). Her line stands in a
   bubble over the 木牌 and goes into the chat; nothing waits on her. */
const HER_MOMENT_ID = { rise: 'rise', hui: 'chapter', tamed: 'tamed' };
function herMomentAsk(kind, facts, { mode, mood }) {
  herFactsSent = { kind, facts };
  // Asleep in the 木牌 she is asked too (her model writes the murmur; the pool answers only when she is late or offline).
  if (mode === 'absent') return { sent: Promise.resolve(false), line: new Promise(() => {}) };
  if (HER_SEAM === 'stub') return { sent: Promise.resolve(true), line: new Promise((done) => setTimeout(() => done(`[stub] ${kind} · ${[...facts].length}`), 1500)) };
  if (HER_SEAM === 'slow') return { sent: Promise.resolve(true), line: new Promise(() => {}) };
  if (CHATLESS) return { sent: Promise.resolve(false), line: new Promise(() => {}) };
  // Her answer to a moment is spoken by her and kept in this chat's session, not always streamed to the page
  // (the 密室's finding, 10-27): the first new line of hers there, or her stream, whichever comes first.
  const sid = chat?.getSessionId?.() ?? null;
  const line = Promise.race([herNextLine(), herNewLine(sid, herLinesIn(sid))]);
  const id = HER_MOMENT_ID[kind] ?? (mood === 'sad' ? 'comfort' : 'cheer');
  const r = voice.moment(id, { zh: facts, en: facts }, { mood });
  return { sent: r.said, line };
}
/* The day's counts (first win today, the streak, the last short word) — this
   browser's, per save; never the save. */
const herKey = () => `lingjing:hersay:${look?.world?.id ?? ''}:${SCRATCH ? `${SCRATCH}:` : ''}${look?.seed ?? look?.name ?? ''}`;
const herStore = { get: () => JSON.parse(localStorage.getItem(herKey()) ?? '{}'), set: (o) => localStorage.setItem(herKey(), JSON.stringify(o)) };
const HER_BUB_MS = 6500;
let herBub = null; // {text, at, asleep, wait}: her bubble over the 木牌
const herSay = createHerSay({
  ask: herMomentAsk, mode: herNow, lang, store: herStore, max: () => herFactsMax(),
  onLine: (line) => {
    if (line.from === 'wait') { if (line.mode === 'awake') showHerBub('…', line, true); return; }
    // The pool's words are the page's: copied into the chat as hers (her own line lands there by itself).
    if (line.from === 'fallback') quietCopy(`${look?.companion?.name ?? words().yinyue}${line.mode === 'asleep' ? (lang() === 'en' ? ' (from the tablet)' : '（木牌里）') : ''}：${line.text}`);
    showHerBub(line.text, line);
    // A loss's word stands on the fight's closing card too (boutCtx says.her).
    if (bout?.lossOut) boutRoom(bout)?.draw?.();
  },
});
function showHerBub(text, line, wait = false) {
  herBub = { text, at: performance.now(), asleep: line.mode === 'asleep', wait };
  paintHerBub();
  const mine = herBub;
  setTimeout(() => { if (herBub === mine) { herBub = null; paintHerBub(); } }, wait ? HER_BUB_MS * 2 : HER_BUB_MS);
}
function herBubHtml() {
  if (!herBub) return '';
  const age = Math.round(performance.now() - herBub.at);
  return `<span class="yysay${herBub.asleep ? ' sleep' : ''}${herBub.wait ? ' wait' : ''}" style="animation-delay:-${age}ms" aria-live="polite">${esc(herBub.text)}</span>`;
}
/* Painted in place over the 木牌 — in the footer itself, so the chips' scroller never clips it — on
   its own and after every render; a repaint keeps its fade where it was (animation-delay). */
function paintHerBub() {
  const foot = document.querySelector('.slotfoot');
  foot?.querySelector(':scope > .yysay')?.remove();
  const tok = foot?.querySelector('.yytoken');
  tok?.classList.toggle('saying', Boolean(herBub));
  if (!herBub || !tok) return;
  foot.insertAdjacentHTML('beforeend', herBubHtml());
  const a = tok.getBoundingClientRect(), f = foot.getBoundingClientRect();
  foot.lastElementChild.style.left = `${Math.round(a.left + a.width / 2 - f.left)}px`;
}
/* A moment another part of the game raises (the 修行 stage quest's reward,
   a 密室 escaped): `lingjing:her` with { kind, what, key } — hersay.js MOMENTS. */
document.addEventListener('lingjing:her', (e) => { const d = e.detail ?? {}; if (d.kind) herSay.say(d.kind, d.what ?? '', { key: d.key ?? null }); });
/* 阶段任务 (rules/gates.mjs, Look's `stage_quest`): the layer filled while the page watched — her
   word, once for that gate (hersay.js MOMENTS.quest, `once: 'key'`). Read across two Looks, so a
   save opened already full says nothing. */
function stageQuestDone(was, now) {
  const a = was?.stage_quest, b = now?.stage_quest;
  if (!a || !b || a.met || !b.met || a.scene !== b.scene) return;
  const what = lang() === 'en' ? `Cultivated to ${b.step}: the stage quest is done, the story goes on.` : `修炼到了${b.step}，阶段任务成了，故事往下走。`;
  document.dispatchEvent(new CustomEvent('lingjing:her', { detail: { kind: 'quest', what, key: `stage|${b.hui}|${b.scene}` } }));
}
/* A settled fight, for her: every win and every loss, weighed (hersay.js weighWin). */
function herFightOver(b, r) {
  const c = b.brief?.creature ?? {}, v = boutView(b.st), zh = lang() !== 'en';
  const repeat = Boolean(r.tally) || String(b.id).startsWith('haunt:');
  const close = r.outcome === 'won' && v.you.hp < v.you.hpMax * CLOSE_AT;
  const hp = zh ? `气血剩${v.you.hp}/${v.you.hpMax}` : `${v.you.hp}/${v.you.hpMax} Life left`;
  const what = r.outcome === 'won'
    ? (zh ? `胜了${c.name ?? ''}，${v.turn}回合，${hp}${close ? '，险胜' : ''}${r.first_win ? '，头一回赢它' : ''}。` : `Beat ${c.name ?? ''} in ${v.turn} turns, ${hp}${close ? ', a close one' : ''}${r.first_win ? ', the first win over it' : ''}.`)
    // The step first: her facts are cut from the end under the cap (hersay.js momentFacts).
    : wayFacts(r.way, zh) + (zh ? `输给了${c.name ?? ''}，撑了${v.turn}回合；它还剩气血${v.foe.hp}/${v.foe.hpMax}${r.beat?.guards ? `，叫出${r.beat.guards}个护主` : ''}。` : ` Lost to ${c.name ?? ''} after ${v.turn} turns; it had ${v.foe.hp}/${v.foe.hpMax} Life left${r.beat?.guards ? `, ${r.beat.guards} guards called` : ''}.`);
  const out = herSay.fight({ outcome: r.outcome, way: r.outcome === 'won' ? null : r.way?.[0]?.kind ?? null, story: Boolean(c.goal || c.person || c.elite || c.title), strong: strongFoe(b.brief), close, newBeast: Boolean(r.first_win), repeat, what, saidInFight: Boolean(b.say?.st.told.has(r.outcome)) });
  // A 稀有 arm out of the fight: a rare find (hersay.js rare).
  const rare = (r.dropped ?? []).find((d) => d.rarity === 'rare');
  if (r.outcome === 'won' && rare) herSay.say('rare', zh ? `${c.name ?? ''}掉了一件稀有的${rare.name ?? ''}。` : `${c.name ?? ''} dropped a rare ${rare.name ?? ''}.`, { key: `drop|${b.id}|${Date.now()}` });
  return out;
}

/* ── 降妖: the page plays the fight, the rules decide it ── */

/// The fight's door: the rules charge it and hand over the setup. One at a
/// time — a Look and a tap both asking opened two rooms on one fight.
let starting = false;
/* The door's brief for a duel id: the scene's exit, or the beast up here. */
const doorBrief = (id) => (look?.scene?.exits ?? []).find((x) => x.game?.id === id)?.duel ?? (look?.place?.encounter?.game?.id === id ? look.place.encounter.duel : null);
async function onDuelStart(id) {
  if (bout || starting) return;
  starting = true;
  try {
    // 丹囊: the pick made at this door, else his last (the rules remember it).
    const b = doorBrief(id), pills = b?.pouch ? pickNow(b, ctx()) : null;
    const r = await write('duel', { id, ...(pills ? { pills: pills.join(',') } : {}) });
    if (!r.ok) {
      // Its own words, never the refusal's id: 「no-qi」 on the stage is the page
      // talking to itself. The states without words (won today, tamed) are
      // already written on the card by Look.
      show({ duelSay: { id, text: r.say ?? null } });
      return;
    }
    // Rules newer than the page: reload into this fight before a turn is played on the old engine.
    if (engineMoved(r)) return reloadForEngine(r);
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
    // The story's record of the fight; the room itself is mounted on the next draw (paintFight).
    bout = { id, brief, setup: brief.setup, st: begin(brief.setup, cardCatalog()), actions: [], her: null };
    const odds = oddsKept.get(oddsKey(brief.setup));
    tracker.fightOpen(id, { beast: brief.creature?.id ?? null, place: look?.place?.id ?? null, hand: brief.setup?.you?.deck?.length ?? brief.setup?.you?.hand?.length ?? null, source: look?.scene?.id ?? null, ...(odds ? { chip: odds.grade, odds: odds.win } : {}) });
    bout.say = fightSayFor(bout);
    render();
  } catch (e) {
    console.warn('[lingjing] duel', e);
    show({ duelSay: { id, text: words().notDone } });
  } finally {
    starting = false;
  }
}

/* ── The room: 斗法 mounted in the shell (games/kapai.js; Hanli 10-22: 「故事里的对战迁移可以开」) ──
   The fight plays inside the one shell every small game wears, the 游戏厅's own adapter: it plays the
   rules, draws the room, takes the taps and the Mac's drag, ends a turn left with nothing in it, holds the
   beast's turn while paused, and stands the closing card. It is mounted ONCE per fight into a node of its
   own and laid into the frame the focus draws (paintFight), so a redraw never restarts it. The story keeps
   what the fight means, as the hooks' bodies (boutHooks): the picks the rules replay, 银月's words, and
   the settle — the closing card waits for the rules' answer (writeBout), then settleBout. */
const fightShell = (b) => `duel:${b.id}`;
/* The room's module, loaded once and early — by import(), as every game is: imported statically it would be
   inlined into the page's one script by the relay, where its `mount` clashes with the engine's helpers. */
let kapai = null;
const kapaiReady = import('./games/kapai.js').then((m) => { kapai = m; return m; });
/// The mounted room's door (games/kapai.js `host.kapai`): its state, busy, held, draw.
const boutRoom = (b) => b?.node?.querySelector('.g-kapai')?.kapai ?? null;
const boutYielded = (b) => Boolean(boutRoom(b)?.room().yielded);
function boutHooks(b) {
  return {
    ctx: () => (bout === b ? boutCtx() : {}),
    onMove: (token) => b.actions.push(token),
    onStep: () => { if (bout === b) fightMoments(); },
    onPlayed: ({ before, mark, mine }) => herCues(b, before, mark, mine),
    onAsk: () => askHerInFight(b),
    // A loss with a way forward: her word comes as the closing card stands, on it beside the button (boutCtx).
    settle: async () => {
      const r = await writeBout(b);
      if (r?.ok && r.outcome === 'lost' && r.way?.length) b.lossOut = herFightOver(b, r);
      return r;
    },
    // The closing card (won · lost · withdrew, battle-card.js endHtml) stands long enough to be read —
    // longer with the beast's last word in it — or until 收起. Never a gate: the report goes by itself.
    // A loss with a way forward (rules/strengthen.mjs) stands until he takes it or puts it away.
    holdMs: (end, r) => (r?.way?.length && r.outcome !== 'won' ? WAY_HOLD_MS : end ? SEAL_SAID_MS : SEAL_HOLD_MS),
  };
}
function mountBout(b) {
  const node = document.createElement('div');
  node.className = 'g-mountnode g-fightnode';
  b.node = node;
  forgetShell(fightShell(b));
  const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  Promise.resolve(kapai.mount(node, { data: { setup: b.setup, brief: b.brief, st: b.st, catalog: cardCatalog() }, lang: lang(), reducedMotion, shell: shellFor(fightShell(b), 'kapai'), story: boutHooks(b) }))
    .then((out) => settleBout(b, out))
    .catch((e) => { console.warn('[lingjing] the fight room', e); return settleBout(b, { r: failed(e) }); });
}
/// The shell's frame round the room: drawn once a fight, then left standing — the room and the shell's own
/// layer (pause, 银月's bubble) paint themselves in place.
function paintFight(b) {
  const focus = $('focus'), id = fightShell(b);
  if (!kapai) { kapaiReady.then(() => render()); return; }
  if (!b.node) mountBout(b);
  const frame = [...focus.children].find((el) => el.matches('.gshell') && el.dataset.shell === id);
  if (frame?.contains(b.node)) return;
  // 怎么玩 (?) and 认输 (✕) are the bar's icons, top right, as every board's (Hanli 10-27: 「全局统一改」); the room's
  // own pair under them steps aside (battle.css), and the bar's taps reach the room through its door (fightTap).
  const bw = boutWords(BATTLE_WORDS[lang()] ?? BATTLE_WORDS.zh, b.brief.creature, lang());
  focus.innerHTML = frameHtml({ id, title: duelTitle(b.brief.creature, words(), lang()), kind: kapai.meta.name[lang()] ?? kapai.meta.name.zh, how: forInput(kapai.meta.how[lang()] ?? kapai.meta.how.zh), timed: timedOf(kapai), lang: lang(), body: '<div class="g-mounthost g-fighthost"></div>',
    ask: toolHtml('ask', bw.how, 'data-fight-tap="help"'), close: toolHtml('close', bw.quit, 'data-fight-tap="quit"') });
  focus.querySelector('.g-fighthost')?.replaceChildren(b.node);
}

/* The bar's ? and ✕ over the room: its 怎么玩 and its 认输, as its own buttons did. 认输 under the pause veil is
   still 认输 — the pause lifts and the room yields (the room ignores taps while paused). */
function fightTap(kind) {
  const room = boutRoom(bout);
  if (!room) return;
  if (kind === 'quit' && isPaused(fightShell(bout))) setPaused(fightShell(bout), false);
  room.tap({ kind, index: -1 });
}

/* The rules settle it, and the scene reports it — the scene is still the only
   witness to a fight (design.md § 降妖). The whole list of moves goes to the rules, which replay them and
   settle — win, loss, or the beast walking away; the room's closing card waits for this answer. */
const SEAL_HOLD_MS = 3000, SEAL_SAID_MS = 4200, WAY_HOLD_MS = 20000;
async function writeBout(b) {
  const r = await write('duel', { id: b.id, picks: b.actions.join(',') }).catch(failed);
  return r ?? failed('no answer');
}
/* The room has closed (its closing card read, or the rules refused): what the fight left. The room closes
   whatever the answer: a refusal is said on the stage, and Ling hears only what the rules decided. */
async function settleBout(b, out = {}) {
  if (!b || b.settled) return;
  b.settled = true;
  const { id, brief } = b, r = out.r ?? failed('no answer');
  tracker.fightEnd(id, { outcome: r.ok ? r.outcome : 'refused', turns: r.turns });
  if (bout === b) bout = null;
  forgetShell(fightShell(b));
  b.say?.close();
  render();
  queueMicrotask(playReveals); // a card won waits for the room to close, then lands in the bag
  if (!r.ok && engineMoved(r)) return reloadForEngine(r);
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
  // Every win and every loss gets her (hersay.js) — the closing word said in the fight is not said
  // twice; a beast that walked off is told to her quietly, as before.
  else if ((r.outcome === 'won' || r.outcome === 'lost') && !b.lossOut) herFightOver(b, r);
  else if (!b.say?.st.told.has(r.outcome)) toldOutcome(brief, r.outcome);
  // 所得: the room closes, and what it left stands on the stage — the card he
  // now holds is seen, not only told.
  // What waits at the 洞府 (储物袋 full) is not 所得 in hand: the rules' line says where it went.
  const got = r.outcome === 'won' ? (r.dropped ?? []).filter((d) => !d.stored) : [];
  if (r.pouch_full) keep({ doNote: r.pouch_full });
  const paid = r.outcome === 'won' && (r.paid?.progress || r.paid?.wealth) ? r.paid : null;
  // A 符 played is spent from the bag, won or lost: the card says so (page fact).
  const spent = r.spent ?? [];
  if (got.length || paid || spent.length) keep({ spoils: { place: look?.place?.id ?? null, cards: got.filter((d) => d.card), items: got.filter((d) => !d.card), paid, spent, pending: true } });
  // The strip counts up once the room has closed and the eye is back on it.
  riseAfter = performance.now() + 600;
  keep({ walkedOut: null });
  // A fight that ended today's rumor is its ending: one beat, the tale's.
  const ended = (r.handed ?? []).some((h) => h.tale && h.ended);
  await report(ended ? '[scene] tale end' : `[scene] ${r.outcome} ${id}`);
  await refresh();
  // The rules' Look is in and any passage owed is drawn (watchTell): 所得 may stand, after it.
  if (view.spoils?.pending) show({ spoils: { ...view.spoils, pending: false } });
  // The loss card's way forward, tapped (battle-card.js endHtml): taken now, by the page's own verb.
  if (out.go && r.outcome !== 'won') await takeWay(out.go);
}

/* 「换一只」 (rules/match.mjs reroll): another beast of his measure stands at this pool — the rules choose, the page redraws. */
async function rerollTap() {
  const r = await write('reroll', {}).catch(failed);
  keep({ doNote: r.ok ? null : refusal(r) });
  await refresh();
}

/* A way to grow stronger (rules/strengthen.mjs), taken from the loss card: put on, walk to the shelf,
   fight the pool's next beast, 闭关, the day's 功课 — each the page's own verb, no model turn. */
const WAYS_TAKEN = {
  wear: (o) => useItem(o.item),
  buy: (o) => goTo(o.place),
  pills: (o) => goTo(o.place),
  another: () => { const id = look?.place?.encounter?.game?.id; return id ? onDuelStart(id) : null; },
  seclude: () => openSeclude(),
  gongke: () => show({ bookOpen: true, ...othersShut('bookOpen') }),
};
async function takeWay(o) {
  await WAYS_TAKEN[o?.kind]?.(o);
}

/* ── The chat ── */

/// The day's chat to pick up: the newest one spoken in, within today's
/// stretch — the app session rule. An empty session is no day.
/* The chat this page is bound as (SKILL.md session-params): a test save's (`{save}`) or the main
   save's (none). The main page never picks up a test save's chat, nor a test save the main one. */
const CHAT_PARAMS = SCRATCH ? { save: SCRATCH } : undefined;
// 台词预取's side session (games/prefetch-ling.js) is never the day's chat, should one outlive its ask.
const notPrefetch = (list) => list.filter((s) => s.title !== PREFETCH_TITLE);
const boundAsPage = (list) => notPrefetch(sharedApi.boundTo ? sharedApi.boundTo(list, CHAT_PARAMS ?? {}) : SCRATCH ? [] : list);
async function recentSessionId() {
  try {
    return pickResumable(boundAsPage(await listSkillSessions(SKILL)));
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
  // The book's passages are the stage's (the dialogue box): the opening carries none.
  if (!greeted) report('[scene] opened');
  else greetWaits = { sid, text: greetText };
}

/* A new play, a new chat (approved 2026-10-14: 「可以，按表做」) — as Claude
   Code's /clear: a Restart or a Load (Look's `run` new, `run_by` init or
   load) opens a fresh session with Ling; the old one is kept in the list,
   never deleted. An Undo keeps the chat (one step back; the talk still
   holds). A Restart Ling runs herself happens inside her turn: the switch
   waits for that turn to end, so her reply is never cut off. */
const FRESH_BY = new Set(['init', 'load']);
const FRESH_LINE = { zh: '—— 新的一局 ——', en: '— A new game —' };
let runSeen; // undefined until the first Look: nothing old opens a chat
let freshOwed = false;
function watchRun() {
  const run = look?.run ?? null;
  if (runSeen !== undefined && run && run !== runSeen && FRESH_BY.has(look?.run_by)) freshOwed = true;
  runSeen = run;
  freshChatWhenFree();
}
async function freshChatWhenFree() {
  if (!freshOwed || streaming || saying || !chat) return;
  freshOwed = false;
  try {
    const { id } = await createSession('Lingjing', SKILL, CHAT_PARAMS);
    if (!id) return;
    await chat.setSession(id);
    chat.addMessage('assistant', FRESH_LINE[lang()]);
    chatHeard(document.querySelector('.shell'));
    openWith(id);
  } catch (e) {
    console.warn('[lingjing] fresh chat', e);
  }
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
  if (chat && chat.getSessionId?.() === g.sid) report('[scene] opened');
}

/// Mounts the chat; answers whether it is a fresh session (not a day picked up).
async function mountChat() {
  // The chat folds away on a handle at the seam; the stage then has the whole width (sight.js).
  mountChatToggle(document.querySelector('.shell'), lang);
  // A test save (?save=) has a real chat too, bound to that save: Ling's and 银月's tools there play
  // data/saves/<name>/ only (SKILL.md `--save={{session.save}}`), never the main save.
  if (CHATLESS) { $('chat-panel').innerHTML = `<div class="scratch-chat" style="padding:24px 16px;color:#8a7a66;font-size:13px;line-height:1.8;text-align:center">${esc(SCRATCH_BADGE)} · chat=off</div><div class="scratch-lines"></div>`; return false; }
  const resume = await recentSessionId();
  chat = await window.LinggenUI.mount($('chat-panel'), {
    skillName: SKILL,
    agentId: 'ling',
    title: 'Lingjing',
    // 「你想怎么做？」 — every scene can be answered in words (invite.js).
    placeholder: words().chatHint,
    sessionId: resume || undefined,
    params: CHAT_PARAMS,
    // A new chat begun from the panel's own button, after the page is up.
    onSessionCreated: (sid) => { if (mounted && sid !== resume) openWith(sid); },
    // Her guest turns (`@银月 …`) stream in this chat too. Only Ling's stream
    // is the game's turn — it ends the turn, counts the veil, tells the recap
    // and reads the save again. Hers only counts as a line spoken, so the
    // voice budget stays quiet after she talks. A bridge that names no agent
    // (`info` absent) streams Ling alone.
    guestStreams: true,
    onStreamToken: (_text, info) => { if (info?.own !== false) streaming = true; },
    onStreamEnd: (_text, info) => {
      // Ling or 银月 wrote: on a phone with the sheet shut, a dot on the chat's bar (sight.js).
      chatHeard(document.querySelector('.shell'));
      if (info?.own === false) { voice.heard(); herLineCame(_text); herAnswered(_text); return; }
      turnEnded();
      voice.heard();
      streaming = false;
      if (recapSent !== null) recapTold();
      const before = look;
      if (veil) veil.turns += 1;
      refresh().then(() => { cheer(before); nudgeTrial(); });
    },
    // Her tool blocks (`info.own === false`) are hers alone: no turn, no card,
    // no marked options, no coins. A bridge that names no agent is Ling's.
    onContentBlock: (payload, info) => {
      if (info?.own === false) return;
      streaming = true;
      onContentBlock(payload);
    },
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
      // Words for someone not in Lingjing yet (`@银月` before the player
      // finds her: SKILL.md `place.yinyue.absent_until`). The engine ran no
      // turn and kept nothing; the page says one plain line, never as hers.
      if (event === 'agent_absent') noOne();
      // An asked moment nobody will answer (the pet is off).
      if (event === 'device_topic' && payload?.topic === 'yinyue' && payload?.op === 'unanswered' && payload?.payload?.app === SKILL) greetUnanswered(payload.payload.text);
    },
  });
  holdPlaceholder($('chat-panel'), () => words().chatHint);
  mounted = true;
  // The bridge holds what is sent until the embed is listening, so one send
  // is enough — the old second `[scene] opened` 4.5 s later was a duplicate.
  return !resume;
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
  if (!d || !herHere()) return;
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
  if (!before || !look || !herHere() || before.world?.id !== look.world?.id) return;
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
  show({ luOpen: true, bookOpen: false, gearOpen: false, shelfOpen: false });
  const r = await verb('story').catch((e) => { console.warn('[lingjing] story', e); return null; });
  if (view.luOpen) show({ lu: r });
}
let drawnLu = null;
// 听书: one player for the 录's 回, kept across its repaints (pingshu.js).
const listener = createListener();
function drawLu() {
  const el = $('lubook');
  const open = view.luOpen && !bout;
  document.body.classList.toggle('reading', open);
  el.hidden = !open;
  if (!open) { drawnLu = null; return; }
  // Redrawn only when it changed: a stream token must not reset the scroll.
  const listen = (hui) => listenHtml(audio, hui, lang(), esc);
  const html = view.lu ? luHtml(view.lu, { lang: lang(), her: look?.companion?.name ?? null, artBase: artBase(), codex: codexNow(), codexKinds: authored?.codexFiles?.codex?.kinds, codexOpen: view.codexOpen ?? null, listen }) : `<div class="lu"><div class="loading">${esc(WORDS[lang()].loading)}</div></div>`;
  if (html !== drawnLu) { el.innerHTML = html; drawnLu = html; listener.remount(el); }
}

/* The chapter's title card: on the stage when a chapter has just begun
   (Look's `chapter.fresh`), until tapped away — once per chapter. */
// Per save: its seed (state.mjs seedOf) — with the hero's name fixed (沈小满, 2026-09-30) a name
// would share every title and ending card put away across saves; an old save's seed is its old
// name, so what it put away stays put away.
// A scratch save is its own too: every save seeded from one fixture shares its seed, so a 「完」 put
// away in one never stood again in the next (2026-10-01: 古九's 「完」 never appeared on the cliff).
const titleKey = (id) => `lingjing:title:${look?.world?.id ?? ''}:${SCRATCH ? `${SCRATCH}:` : ''}${look?.seed ?? look?.name ?? ''}:${id}`;
function titleSeen(id, mark = false) {
  try {
    if (mark) localStorage.setItem(titleKey(id), '1');
    return Boolean(localStorage.getItem(titleKey(id)));
  } catch {
    return mark;
  }
}
// Keyed as the mark is (titleKey): a Restart without a reload is a new seed, and its 第一回 stands again.
const dismissedTitles = new Set();
/* The chapter's ending card, put away once (合上): remembered like the title card. */
function closeSeen(id, mark = false) {
  if (!id) return true;
  try {
    if (mark) localStorage.setItem(titleKey(`close:${id}`), '1');
    return Boolean(localStorage.getItem(titleKey(`close:${id}`)));
  } catch {
    return mark;
  }
}
/* The 回's title card has no button (2026-10-14, his: 「且看」 was one more
   tap): once it is on the stage it fades by itself after TITLE_MS, or goes
   on a tap anywhere or Space. The queue rules hold: it is timed only once it
   actually shows, never over the box. */
const TITLE_MS = 2000, TITLE_FADE_MS = 600;
const titleFading = new Map(); // titleKey → 'up' | 'fading'
function titleCard() {
  const ch = look?.chapter;
  if (!ch?.fresh || bout || dismissedTitles.has(titleKey(ch.id)) || titleSeen(ch.id)) return '';
  if (stageBusy() || closeUp() || endingWaits()) return ''; // after the moments, the ending 回's last words and its ending card
  // …and after the new 回's seal, on its way or up: one card at a time — 「新的一回」, then the chapter's own
  // title (live 2026-10-15 at 09-snow, back from 今 · 三: the two stood one over the other).
  if (sealOwed || momentUp()) return '';
  const key = titleKey(ch.id), id = ch.id;
  if (!titleFading.has(key)) {
    titleFading.set(key, 'up');
    setTimeout(() => { if (titleFading.get(key) !== 'up') return; titleFading.set(key, 'fading'); render(); setTimeout(() => dismissTitle(id, key), TITLE_FADE_MS); }, TITLE_MS);
  }
  return titleCardHtml(ch, lang(), { fading: titleFading.get(key) === 'fading' });
}
function dismissTitle(id, key = titleKey(id)) {
  if (dismissedTitles.has(key)) return;
  titleFading.set(key, 'gone');
  dismissedTitles.add(key);
  titleSeen(id, true);
  render();
}
/* A title card on the stage is put away (a tap anywhere, Space): true when one was. */
function titleAway() {
  const card = document.querySelector('.titlecard[data-titlecard]');
  if (!card) return false;
  dismissTitle(card.dataset.titlecard);
  return true;
}

/* Story nodes — a scene passed, a cauldron found, a memory come back. The
   rules keep the last one on the save (Look's `story_node`), whoever moved;
   the page raises it once, as facts for 银月, and Ling may answer her once
   (`converse`): they talk over what it means. Never a line to recite. The
   first read only notes where things stand — nothing old is raised. */
/* 银月的记忆 (memory.js): a memory just come back — from a tap or from Ling's
   Resolve — plays once in the main slot, from the album the rules' `story`
   holds. The first read only notes where things stand: nothing old plays. */
let memorySeen;
function watchMemory() {
  const at = look?.memories?.last?.at ?? null;
  if (memorySeen === undefined) { memorySeen = at; return; }
  const last = freshMemory(look, memorySeen);
  memorySeen = at;
  if (last) playMemory(last.n);
}
/* 大场面 · 筑基天象 (setpiece.js, one runner for both): a box over the whole stage.
   A tap plays the next beat (with the dialogue box's rhythm), 跳过 brings its last frame, and
   after the last beat a tap (or a while) puts it away. The book's line for each
   beat is said under the picture, in DOM; reduced motion plays still frames. */
let pieceOn = null;
let homingPending = false; // a 鼎 come home, its map not yet on the stage
/* The page's own moments in their order — set piece, seal, her memory, 鼎归 —
   and while any is up or on its way, the 回's ending card, the new 回's title
   card and the dialogue box wait (one thing at a time, each put away by a tap). */
// A seal on its way is not counted: the realm's waits through riseWaits, and a new 回's waits on the 「完」 itself.
// …nor what waits behind it (queue.js momentsHold).
const stageBusy = () => momentsHold({ up: momentUp(), pending: [...momentPending], waits: memoryWaits || homingPending });
const closeUp = () => Boolean(look?.chapter?.close && !closeSeen(look.chapter.close.id));
/* The 回's 「完」 is due but held back a moment — a seal, a set piece or the ending's passages first. */
const closeHeld = () => closeUp() && (stageBusy() || endingWaits());
async function playPiece(id, beats = null) {
  if (pieceOn) return;
  const en = lang() === 'en';
  const box = document.createElement('div');
  box.className = 'spstage';
  box.dataset.piece = id;
  box.innerHTML = `<div class="sphold"></div><p class="spline" aria-live="polite"></p><p class="sphint">${en ? 'Tap to go on' : '轻触继续'}</p><button class="spskip" type="button">${en ? 'Skip' : '跳过'}</button>`;
  // In the stage (2026-10-14: the header and the footer are thin bars that stay; the chat stays beside).
  ($('view') ?? document.body).appendChild(box);
  const mine = pieceOn = { id, box, ctl: null, over: false };
  const close = () => { if (pieceOn !== mine) return; mine.ctl?.destroy?.(); box.remove(); pieceOn = null; render(); };
  render(); // up: the stage under it is drawn again, so what waits for it (the scene's choices, queue.js choicesStand) steps out
  box.addEventListener('click', (e) => {
    // 跳过 here is its last frame (Hanli, 2026-10-19: 「跳过不能跳过大场面」); once over, a tap puts it away.
    if (mine.over) close();
    else if (e.target.closest('.spskip')) mine.ctl?.skip?.();
    else mine.ctl?.tap?.();
  });
  try {
    const line = box.querySelector('.spline');
    // A picture held at a beat's end goes on by itself at 中 and 快, after its line's reading time (古九's
    // tester, 2026-10-15: never, even at 快, and nothing said a tap was wanted) — 中's pace at least, a
    // picture wants looking at; at 慢 it waits for the tap, and 「轻触继续」 says so while it waits.
    const auto = speedNow() !== 'slow';
    mine.ctl = await playSetPiece(box.querySelector('.sphold'), id, {
      lang: lang(), still: stillMotion(), beats, auto,
      hold: (b) => paceOf(line.textContent || b.text || '', { f: SPEEDS.mid, last: true, lang: lang() }),
      onHold: () => box.classList.add('held'),
      onBeat: (i, b) => { box.classList.remove('held'); line.textContent = b.text ?? b.line?.[lang()] ?? ''; },
      onDone: () => { mine.over = true; box.classList.add('over'); setTimeout(close, 9000); },
    });
    if (pieceOn !== mine) mine.ctl?.destroy?.();
  } catch (e) { console.warn('[lingjing] set piece', id, e); close(); }
}

/* 景 — a set piece tied to a beat of the scene's own passage (rules/tell.mjs `{景=id}`, beatsOf
   `piece`: 00-gate's 「沉鼎山并不怎么高」 → 沉鼎山). Since 2026-10-14 (proto e) the piece IS the stage
   at that beat: its painting under the beat's words — the camera moving on it, its name upright in
   the corner — while the words come up over it as any beat's do (lines.js), never a box of its own.
   Only where the story shows the beat (after the 回's turn and every beat before it: the box
   yields there), nothing else up or on its way. The camera moves once a save (kept in this browser
   beside the reading); a reload there shows its painting still. The next beat takes it away. */
const PIECES_KEY = `lingjing.pieces.${SCRATCH || 'main'}`;
let piecesPlayed = null;
const playedPieces = () => {
  if (!piecesPlayed) { try { piecesPlayed = new Set(JSON.parse(localStorage.getItem(PIECES_KEY) ?? '[]')); } catch { piecesPlayed = new Set(); } }
  return piecesPlayed;
};
let beatBack = null; // { key, box, ctl, def, again, at, ff } — the piece under the beat on show
/* Is the piece under the beat still playing (first time here; its last frame not yet up)? The page waits for it:
   its paragraph's words that wait for a picture (the piece's `CUES`), the paragraph's end, a tap, 跳过. A piece
   seen before on this save shows still and holds nothing; one whose paintings never come holds 5 s at most. */
const PIECE_LOAD_MS = 5000;
const piecePlays = () => Boolean(beatBack && !beatBack.again && (beatBack.ctl ? !beatBack.ctl.ended : performance.now() - beatBack.at < PIECE_LOAD_MS));
/* A tap (or 跳过) during the piece: its last frame now; the words then go on by themselves. */
function pieceToEnd() {
  const b = beatBack;
  if (!b) return;
  if (b.ctl) b.ctl.skip(); else b.ff = true;
}
/* lines.js's gate: a sentence (its text) — or the paragraph's end (null) — waits while the piece has not reached it. */
function pieceGate(text) {
  if (!piecePlays()) return false;
  const b = beatBack;
  if (!b.ctl) return true;
  if (text == null) return true;
  const cue = (b.def?.CUES ?? []).find((c) => text.includes(c.text?.[lang()] ?? c.text?.zh));
  return Boolean(cue) && !b.ctl.reached(cue);
}
function beatPiece(slots) {
  const r = readingHere();
  if (pieceOn || !playing(r) || boxYields(slots) || momentPending.size || stageBusy()) return dropBeatPiece();
  // 全文's column holds no piece (dialogue.js wholeOf ends it before one): the piece's beat reads in 自动.
  const beat = r.all?.whole ? null : current(r, lang()).beat;
  if (!beat?.piece || beat.recap) return dropBeatPiece();
  const key = `${look?.run ?? ''}|${r.items[beat.i ?? r.i]?.id}|${beat.piece}`;
  if (beatBack?.key === key) return;
  dropBeatPiece();
  const done = playedPieces(), again = done.has(key);
  done.add(key);
  try { localStorage.setItem(PIECES_KEY, JSON.stringify([...done].slice(-40))); } catch { /* no storage: this load only */ }
  layBeatPiece(key, beat.piece, again);
}
function dropBeatPiece() {
  if (!beatBack) return;
  const b = beatBack;
  beatBack = null;
  b.box.classList.add('going');
  setTimeout(() => { b.ctl?.destroy?.(); b.box.remove(); }, 900);
}
async function layBeatPiece(key, id, still) {
  const view$ = $('view');
  if (!view$) return;
  const box = document.createElement('div');
  box.className = 'spback';
  box.dataset.piece = id;
  view$.insertBefore(box, view$.querySelector('.shade')?.nextSibling ?? null);
  const mine = beatBack = { key, box, ctl: null, def: null, again: still, at: performance.now(), ff: false };
  try {
    const def = mine.def = await import(`./setpieces/${id}.js`);
    const name = def.TITLE?.[lang()] ?? def.TITLE?.zh;
    if (name) box.insertAdjacentHTML('beforeend', `<div class="sptitle"><b>${esc(name)}</b></div>`);
    // `auto`: beat after beat at the piece's own pace (setpieces/<id>.js TEMPO), never the words'.
    mine.ctl = await playSetPiece(box, id, { lang: lang(), still: still || stillMotion(), cover: true, auto: true, hold: 600 });
    if (beatBack !== mine) mine.ctl?.destroy?.();
    else if (mine.ff) mine.ctl.skip();
  } catch (e) { console.warn('[lingjing] set piece', id, e); if (beatBack === mine) dropBeatPiece(); }
}

let memoryWaits = false; // a memory come back, not yet on the stage (鼎归 waits for it)
async function playMemory(n) {
  memoryWaits = true;
  try { await playMemoryNow(n); } finally { memoryWaits = false; }
}
async function playMemoryNow(n) {
  const r = await verb('story').catch((e) => { console.warn('[lingjing] memory', e); return null; });
  const play = replayOf(r?.album, n);
  // After the box, the set piece and the gold seal (the 鼎 rises in 漳水立起 before she remembers).
  await momentTurn('memory');
  if (play) show({ memory: { n, i: 0, play, at: performance.now() } });
}

/* 鼎归 · 地图晕开 (inkmap.js): a 鼎 just come home — Look's `jiuding.homed`
   grew — plays once in the main slot, after the realm's gold seal and her
   memory (which the same beat brings). The first read only notes where
   things stand. */
let homedSeen = null;
async function watchHoming() {
  const now = look?.jiuding?.homed ?? null;
  const fresh = freshHome(homedSeen, look);
  homedSeen = now ? [...now] : homedSeen;
  if (fresh) playHoming(fresh);
  watchUnroll();
  watchUnfold();
}

/* 地图展开 (2026-10-14; the way 《原神》 opens a new region): a chapter's map
   unfolds on its map card once per save — when it can first be walked (Look's
   `jiuding.unfold.walk`), or the first time its map card comes on the stage
   (00-chushan's tree: 蒙山 from the top). After the box and the moments before
   it (queue.js MOMENTS); a tap finishes it; then the rules mark it unfolded. */
const UNFOLD_MS = 4200;
let unfoldFor = null;
let mapAsked = false; // a choice just taken showed the map (its `show`)
const mapOnStage = () => mapAsked || [...(look?.stage ?? []), ...view.focus].some((c) => c.card === 'map');
async function watchUnfold() {
  const u = look?.jiuding?.unfold;
  if (!u || unfoldFor === u.chapter || !look?.world?.atlas) return;
  if (!u.walk && !mapOnStage()) return;
  unfoldFor = u.chapter;
  // Shown by a choice (the tree): after that choice's passage, before the next scene's — as a set piece.
  const byChoice = mapAsked;
  mapAsked = false;
  // …and after the 回's 「完」, put away (queue.js AFTER_CLOSE): the turn reads 完 → seal → map, never the map first.
  await momentTurn('unfold', () => closeUp(), byChoice ? pieceAhead : null);
  if (look?.jiuding?.unfold?.chapter !== u.chapter) return;
  const mine = { chapter: u.chapter, title: u.title, at: performance.now(), still: stillMotion() };
  show({ unfold: mine, mapView: 'province' });
  write('unfolded', { chapter: u.chapter }).catch(failed);
  setTimeout(() => { if (view.unfold === mine) show({ unfold: { ...mine, still: true } }); }, UNFOLD_MS);
  setTimeout(() => { if (view.unfold?.at === mine.at) closeUnfold(); }, UNFOLD_MS + 2600);
}
/* A tap on the unfolding map: the rest at once, then a second tap (or the wait) puts it away. */
function closeUnfold() {
  const u = view.unfold;
  if (!u) return;
  if (!u.still) { show({ unfold: { ...u, still: true } }); return; }
  show({ unfold: null });
}
let homingFor = null; // the province whose moment is on its way: one moment per 鼎, never two
async function playHoming(province) {
  if (homingFor === province) return;
  homingFor = province;
  homingPending = true;
  setTimeout(() => { if (homingFor === province) homingFor = null; }, 60000);
  // Her memory first: wait for the gold seal and the memory the beat brings to be over.
  // The 新的一回 seal goes up on the first draw of the read that brought the 鼎 home
  // (riseStats notes the chapter in `shown`): wait for that draw, then for the seal and her memory to go.
  const sealed = () => shown?.chapter === look?.chapter?.id;
  await pause(600);
  for (let k = 0; k < 160 && !sealed(); k += 1) await pause(250);
  await momentTurn('homing', () => memoryWaits); // the box, the set piece, the seal, her memory — then the map
  await loadAtlas();
  const places = atlasPlaces?.provinces?.[province]?.places ?? [];
  const pts = places.map((p) => p.map).filter(Boolean);
  const home = atlasPlaces?.ink?.provinces?.[province]?.home;
  // The find spot stands well inside the frame: the drop, the spread's heart and the moon are there.
  const at = home?.map ?? look.world.atlas.provinces[province];
  const frame = frameOf([...pts, at, [at[0], at[1] + 0.06], [at[0] - 0.04, at[1]], [at[0] + 0.04, at[1]]], look.world.atlas.aspect);
  homingPending = false;
  if (!inkGeo) { render(); return; }
  // WebGL when there is WebGL and motion is welcome (fx.js); else the SVG moment.
  show({ homing: { province, frame, at: performance.now(), still: false, fx: glOK() && !stillMotion() && Boolean(inkPaint()) } });
  // Its words come in at the end: a redraw then shows 收起; it goes by itself a while later.
  const mine = view.homing;
  setTimeout(() => { if (view.homing === mine) render(); }, HOMING_MS.end + 50);
  setTimeout(() => { if (view.homing === mine) show({ homing: null }); }, HOMING_MS.end + 6000);
}

/// 御剑 from the map card: the rules say yes (1 体力) or why not.
async function flyTo(province) {
  const r = await write('fly', { province }).catch(failed);
  if (!r.ok) { keep({ doNote: refusal(r) }); render(); return; }
  show({ mapPv: null, mapView: 'province' });
  await refresh();
}

/* 卷轴 — the whole 九州 unrolled (第三章 · 下山): Look's `jiuding.unroll` asks
   for it once (chapter.json `unroll`), and the page marks it played. A
   scratch save may preview it (?save=test&unroll=1). */
let unrollFor = null;
function watchUnroll() {
  const preview = SCRATCH && new URLSearchParams(location.search).has('unroll');
  const id = look?.jiuding?.unroll ?? (preview ? 'preview' : null);
  if (!id || unrollFor === id || !inkGeo || !atlasPlaces?.ink) return;
  unrollFor = id;
  const box = document.createElement('div');
  box.innerHTML = unrollHtml(inkMapSvg(inkGeo, atlasPlaces.ink, { names: inkNames(), labels: look.world.atlas.provinces, lang: lang(), id: 'unroll', paint: inkPaint() }), { still: stillMotion(), label: lang() === 'en' ? 'The Nine Provinces' : '九州' });
  box.firstElementChild.dataset.chapter = id;
  $('view')?.appendChild(box.firstElementChild);
}
function closeUnroll() {
  const el = document.querySelector('.unroll');
  if (!el) return;
  el.remove();
  if (el.dataset.chapter && el.dataset.chapter !== 'preview') write('unrolled', { chapter: el.dataset.chapter }).catch(failed);
}

/* A 图鉴 card opened full size over the page from its compact card on the stage:
   closes on ×, Esc or a tap outside it (the book's pop-up, read.js). */
function openCodexBig(id) {
  const entry = codexNow()?.get?.(id);
  if (!entry) return;
  const box = document.createElement('div');
  box.className = 'codexbox';
  box.innerHTML = `<div class="boxcard" role="dialog"><button class="boxclose" aria-label="×">×</button>${codexHtml(entry, { src: (f) => worldPath(look?.world?.made ? `worlds/${look.world.base}` : look?.world?.dir ?? 'worlds/jiuding', f), lang: lang() })}</div>`;
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (k) => { if (k.key === 'Escape') close(); };
  box.addEventListener('click', (c) => { if (c.target === box || c.target.closest('.boxclose')) close(); });
  addEventListener('keydown', onKey);
  document.body.append(box);
}

let nodeSeen;
function watchNode() {
  const n = look?.story_node, at = n?.at ?? null;
  if (nodeSeen === undefined) { nodeSeen = at; return; }
  if (!n || at === nodeSeen) return;
  nodeSeen = at;
  storyMoment(n);
}
const nodeFresh = (kinds) => Boolean(look?.story_node && kinds.includes(look.story_node.kind) && Date.now() - Date.parse(look.story_node.at) < 60000);
async function pieceOfChoice(piece, beats) {
  for (let k = 0; k < 240 && (look?.tell_owed || drawingTold); k += 1) await pause(250);
  if (carriesPiece(readingOfPlay(), piece)) return;
  await momentTurn('piece');
  playPiece(piece, beats);
}
function storyMoment(n) {
  // A set piece (哇时刻 ②, an exit's `setpiece`: 漳水立起, 筑基天象): the whole stage plays
  // it first; her memory and 鼎归 wait for it to end (playMemoryNow, playHoming).
  const piece = setpieceOf(n);
  // Once: a passage that lays the same piece under its words (a `{景=id}` beat) shows it there (carriesPiece) —
  // looked at once that passage is drawn, before the piece waits its turn (a piece waiting holds the beat's).
  if (piece) pieceOfChoice(piece, setpieceBeats(n));
  // A realm lifted with its doors (息壤): the five open on the stage, one by one — after the box.
  if (n.doors?.length) momentTurn('doors').then(() => show({ doors: { node: n, at: performance.now() } }));
  const m = nodeMoment(n);
  // Her price showing (unease.js): the stage shows it on her, then she says it.
  if (m && n.unease && herHere()) return void raiseUnease(n.unease, () => tellYinyue(m.id, m.zh, m.en, { mood: m.mood }), { still: stillMotion() });
  if (m) tellYinyue(m.id, m.zh, m.en, { mood: m.mood });
}

/* 前情提要 — back after a while (Look's `recap_due`), Ling tells what came
   before in two or three lines. One sequence with her greeting, never two
   greetings: she greets (told Ling tells the story next), the page sends Ling
   one hidden `[scene] recap` once the greeting has settled, and after her
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
  if (q === null || !herHere()) return;
  const zh = `Ling 刚讲完前情提要${q ? `，眼下悬着的谜：「${q}」` : ''}。你已经打过招呼了，别再问候；若有感触，说一句，没有就不说。`;
  const en = `Ling has just told what came before${q ? `; the riddle still open: “${q}”` : ''}. You have greeted already — no second greeting; one feeling if you have one, else nothing.`;
  voice.moment('recap', { zh, en }, { mood: 'relaxed' });
}


/* Her voice while the game is open: the engine's pet view as a voice-only
   stage (`body=0`) — it holds her, so the desktop corner's 3D girl steps
   aside while the player is in the story, and her lines are spoken here; it
   draws nothing (his, 2026-09-29: app里的3D模型 hidden while playing). Loaded
   once she is found and awake; unloading it gives her back to the corner. */
function holdHerVoice(on) {
  if (CHATLESS) on = false;
  const f = $('herVoice');
  if (!on) { if (f.dataset.on) { delete f.dataset.on; f.src = 'about:blank'; } return; }
  if (f.dataset.on) return;
  f.dataset.on = '1';
  f.src = petStageUrl(sharedApi, location.origin);
}

/* Whether the app shows its companion's body while this page is open — the
   app-mode message to the host (skill-spec § App-mode, `linggen:companion`):
   always hidden in the game (stage.mjs companionShown; 「游戏里不需要3D模型」).
   Said on every change, and the first time always; a scratch save says it too,
   as it is only what the screen shows. */
let companionSaid = null;
function tellCompanion(shown) {
  const companion = shown ? 'shown' : 'hidden';
  if (companion === companionSaid || window.parent === window) return;
  companionSaid = companion;
  window.parent.postMessage({ type: 'linggen:companion', companion }, location.origin);
}

/* ── The gate: sign in to play ── */

/// The page's language before there is a game to take it from: Linggen's (pageLang).
const machineLang = () => pageLang;

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
  holdHerVoice(false);
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
    if (!SCRATCH) await syncCloud(SKILL);
  } catch (e) {
    console.warn('[lingjing] sync on open', e);
  }
  await refresh();
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
  if (!greeted && grew && herHere()) await askHer('emerge', grew.zh, grew.en, 'happy');
  if (fresh) openWith(chat?.getSessionId(), greeted);
  // Ling opening a fresh chat herself tells the 前情提要 in her opening.
  if (!fresh || greeted) recapWhenSettled(greeted);
}

/// 问候 — the day's first opening is hers (rules § 问候): the rules say
/// whether she has greeted today and hand over what they know; she speaks.
/// `grew`: 出关's facts, when the sitting opened on one — one greeting, not two.
async function greetByHer(grew = null) {
  if (!herHere()) return false;
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

/* 测试存档 — a scratch save for live checks (?save=test; rules.js SCRATCH):
   a badge on the page; `&seed=fresh|real|<fixture>` begins it once and
   `&days=N` moves its clock N days ahead, then the URL forgets both so a
   reload plays on. */
const SCRATCH_BADGE = SCRATCH ? `测试存档 · ${SCRATCH}` : '';
const SCRATCH_NOTE = 'Ling 和 银月 都在，只读写 data/saves/' + (SCRATCH ?? '') + '/ — 不碰主存档，不同步云端';
async function scratchBoot() {
  // Low in the right corner (2026-10-05): over the top strip it hid the 回 and the place.
  document.body.insertAdjacentHTML('beforeend', `<div class="scratch-badge" title="${esc(SCRATCH_NOTE)}" style="position:fixed;top:0;left:8px;z-index:99;padding:0 6px;border:1px solid #b33a2b;border-top:0;border-radius:0 0 3px 3px;background:#fff8ef;color:#b33a2b;font:600 10px/1.4 var(--ui, sans-serif);letter-spacing:.06em;opacity:.75;pointer-events:none">${esc(SCRATCH_BADGE)}</div>`);
  const url = new URL(location.href), from = url.searchParams.get('seed'), days = url.searchParams.get('days');
  if (!from && days == null) return;
  if (from) {
    const r = await verb('seed', { from }).catch(failed);
    if (!r.ok) console.warn('[lingjing] seed', r);
    // A save begun again reads nothing of the last one's dialogue box.
    else keepReading(SCRATCH, null);
  }
  // `&days=N`: the scratch save's clock N days ahead (rules.mjs shift) — the 大比's real day in a check.
  if (days != null) {
    const r = await verb('shift', { days }).catch(failed);
    if (!r.ok) console.warn('[lingjing] shift', r);
  }
  url.searchParams.delete('seed');
  url.searchParams.delete('days');
  history.replaceState(null, '', url);
}

/* 测试存档 only — the playtest crawler's seam (tools/playtest.mjs). It reads what a board or a
   fight stands at, and ends a board won the very way a played win ends (onWin): the crawler
   checks every hand-off after a game without playing forty games by hand — the games' own play
   is tests/game-*.test.mjs's. Never on the player's own save. */
if (SCRATCH) {
  const { bestMove } = await import('./fightline.js');
  globalThis.__lingjingPlay = {
    board: (id) => { const g = boards.get(id); return g ? { won: Boolean(g.state?.won ?? g.cleared), sent: Boolean(g.sent), grade: g.state?.grade ?? null, stars: g.state?.stars ?? null } : null; },
    // The board's state as the screen draws it, and its module's id — for the human-like bots (tools/page-crawl.mjs).
    state: (id) => { const g = boards.get(id); return g ? { state: g.state ?? null, game: g.mod?.meta?.id ?? null } : null; },
    win: (id, grade = null) => {
      const g = boardFor(id);
      if (!g || g.sent) return false;
      if (g.state) g.state = { ...g.state, won: true, live: false, grade };
      g.sent = true;
      settleShell(id, { won: true, stars: g.state?.stars ?? null }); // its chime, as a played win's (a mount board's beat-host settles it)
      render();
      run(`win:${id}`, () => onWin(id));
      return true;
    },
    // The stuck gate opened at once (stuck.js), and the board left the way the player leaves it.
    stuck: (id) => { const g = boardFor(id); if (!g) return false; g.shownAt = 0; openStuckSlots(); return true; },
    skip: (id) => { const g = boardFor(id); if (!g?.mod) return false; g.shownAt = 0; return skipGame(id); },
    // 银月 in the fight (fightsay.js): her bubble, the counts, the last facts sent.
    // 台词预取: the last level's ask — its state, her lines by moment, how long it took.
    prefetch: () => prefetchLog,
    her: () => ({ line: bout?.her ?? null, asks: bout?.say?.st.asks ?? null, cues: bout?.say?.st.cues ?? null, told: [...(bout?.say?.st.told ?? [])], facts: herFactsSent }),
    // 银月 as companion (hersay.js): her mode, her last line and bubble, the day's counts.
    companion: () => ({ mode: herNow(), line: herSay.st.line, bubble: herBub?.text ?? null, shown: document.querySelector('.slotfoot > .yysay')?.textContent ?? null, mem: herSay.mem, facts: herFactsSent }),
    bout: () => (bout ? { outcome: bout.st.outcome, whose: bout.st.whose, you: bout.st.you.hp, foe: bout.st.foe.hp, busy: Boolean(boutRoom(bout)?.busy()), picked: boutRoom(bout)?.picked() ?? null } : null),
    // The attentive move now (fightline.js), for the crawler to make with real taps.
    move: () => (bout && boutRoom(bout) && !boutRoom(bout).busy() ? bestMove(bout.st) : null),
    // Why the stage holds what it holds — the crawler writes it beside a blank-stage finding.
    why: () => ({ storyAhead: storyAhead(), cardsAhead: cardsAhead(), choicesInBox: choicesInBox(), huiTurn: atHuiTurn(), closeUp: closeUp(),
      stageBusy: stageBusy(), endingWaits: endingWaits(), pending: [...momentPending], memoryWaits, homingPending, riseWaits, sealOwed,
      unfold: Boolean(view.unfold), memory: Boolean(view.memory), homing: Boolean(view.homing), doors: Boolean(view.doors), stage: look?.stage ?? null }),
  };
}

/* 试玩: the game's registry row (its deal) and its name, before the first Look stands it. */
async function arcadeBoot() {
  const [reg, mod] = await Promise.all([
    fetch('../worlds/jiuding/games.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    import(`./games/${ARCADE_GAME}.js`).catch(() => null),
  ]);
  const name = mod?.meta?.name;
  arcadeDeal = { row: arcadeRow(reg, ARCADE_GAME, ARCADE_ROW), title: name ? `${name.zh}${name.en ? ` · ${name.en}` : ''}` : ARCADE_GAME };
}

async function boot() {
  tracker.start({ status: () => verb('track', { action: 'status' }) });
  if (SCRATCH) await scratchBoot();
  if (ARCADE_GAME) await arcadeBoot();
  devArcade({ scratch: SCRATCH }); // the builder's test-arcade chip: developer or scratch only
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
watchMemories(); // her memories soak into colour in WebGL (fx-memory.js); the CSS bloom otherwise
