// rules/tasks.mjs — Tasks and quests: boards, errands handed in, win, duel, 论道.
// Part of the rules engine; rules.mjs is its one door.
import { festivalDone } from './festival.mjs';
import { climbWon } from './climb.mjs';
import { battle } from '../battle.js';
import { gameOf } from '../content.mjs';
import { addStamina, dayKey, lockedOf, periodKey, pick, settleStamina, seedOf } from '../state.mjs';
import { drop } from './arms.mjs';
import { cardCatalog, fightPill, fightSetup, grantFrom, readOf, winCard } from './cards.mjs';
import { POUCH_MAX } from '../battle.js';
import { clone, pay, refuse, replaying, spendStamina } from './core.mjs';
import { choreCounts, choreGrant, isOnce, kaifuAfter, questDone } from './chores.mjs';
import { payMeaning } from './gongke.mjs';
import { advance, countsOf, questDoneBefore, questOf, taskOf, TIERS_ORDER } from './errands.mjs';
import { duelBrief, tasksBrief } from './look.mjs';
import { hashOf } from './travel.mjs';
import { stow, storedLine } from './pouch.mjs';
import { laterBoard, leaveBoard, replayBoard, sceneBoards, skipBoard } from './skips.mjs';
import { sideLine } from './hui.mjs';
import { writeLedger } from './ledger.mjs';
import { creatureOf, encounterOf, foeOf, huntKey, meetBeast, placeOf, poolOf, poolTally, rememberAt, sceneOf } from './world.mjs';
import { runBoardHere, runFindDone, runSpoils } from './rerun.mjs';
import { strengthen } from './strengthen.mjs';
import { kaoDone, kaoHere } from './kao.mjs';
import { qiyuDone, qiyuHere } from './qiyu.mjs';
import { isTide, shouchaoDone, shouchaoHere, shouchaoShut } from './shouchao.mjs';

/* ── Tasks and quests ── */

export function task(state, content, ctx, args) {
  if (args.action === 'list') return { state: null, result: { ok: true, ...tasksBrief(content, state, ctx) } };
  // The day's festival task (rules/festival.mjs), done in the chat.
  if (args.action === 'done' && args.id === 'festival') return festivalDone(state, content, ctx);
  if (args.action === 'done') return taskDone(state, content, ctx, args.id);
  if (args.action === 'check') return questCheck(state, content, ctx, args.id);
  // A story board left (「算了，往下走」, paid nothing), and offered again later (rules/skips.mjs).
  if (args.action === 'skip') return skipBoard(state, content, ctx, String(args.id ?? ''));
  if (args.action === 'replay') return replayBoard(state, content, ctx, String(args.id ?? ''));
  if (args.action === 'later') return laterBoard(state, content, ctx, String(args.id ?? ''));
  // 收手: a board he opened by choice, put down (rules/skips.mjs leaveOf).
  if (args.action === 'leave') return leaveBoard(state, content, ctx, String(args.id ?? ''));
  return refuse('unknown-action', null, { actions: ['list', 'done', 'check', 'skip', 'replay', 'later', 'leave'] });
}

/* An errand held and not yet met that asks for a win on this board. It
   reopens a board already done: 云龙山的八味 asks a pill of alchemy-first,
   done once in the story, so the furnace never came back and the errand
   could not be met (his, 2026-09-23: 我已经到这里了, 没触发差事). */
function errandWants(content, state, id, place = null) {
  return Boolean(errandAsking(content, state, id, place));
}
/* …and which errand it is: the board opened for it is titled by it (2026-10-15 play-test:
   码柴 opened 华容道 under the task's own 「走出秘境」). */
function errandAsking(content, state, id, place = null) {
  for (const qid of Object.keys(state.quests ?? {})) {
    if (questDoneBefore(state, qid)) continue;
    const q = questOf(content, qid);
    if (q && countsOf(content, state, q).some(n => n.kind === 'board' && n.task === id && !n.done && (!place || !n.at || n.at === place))) return q;
  }
  return null;
}

/* Done before, and open now only for an errand — it pays the errand, not
   the task a second time. */
function reopened(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  const spent = held?.status === 'done' && (t?.period === 'once' || held.period === periodKey(t?.period, now));
  // A game a place hosts is played at that place: the errand sends him there
  // (his screen, 2026-09-23: 碣石's 洛书 stood on the stage at 邺城).
  // Where the errand names a place (`at`, 云龙山's eight herbs), there only (2026-10-15: the 令 is what takes him there).
  return Boolean(t) && !t.hosted && (!held || spent) && errandWants(content, state, id, state.place);
}

/* A game the place hosts (places' has.games) is played there when an errand
   in the book asks for it — a market's notice, 「去碣石：洛书」 — never as a
   daily chore (redesign-v2 § 四, 2026-09-24: the practice boards are not
   功课 any more; the mini-games live on as 今日传闻's steps, a scene's
   boards, and the errands that ask for them). */
function hostedHere(content, state, id) {
  const t = taskOf(content, id);
  return Boolean(t?.hosted) && (placeOf(content, state.place)?.has?.games ?? []).includes(id) && errandWants(content, state, id, state.place);
}
/* A stall's board (tasks/world.json `stall: true`, 钱掌柜's 押宝): played where a
   place hosts it whenever he stands there, once a period, for its own pay — no
   errand needed. An errand that wants it still takes it first (it pays the errand). */
function stallHere(content, state, id, now) {
  const t = taskOf(content, id);
  return Boolean(t?.stall && t.hosted) && (placeOf(content, state.place)?.has?.games ?? []).includes(id)
    && !doneThisPeriod(content, state, id, now) && !errandWants(content, state, id, state.place);
}
const doneThisPeriod = (content, state, id, now) => {
  const t = taskOf(content, id), held = state.tasks[id];
  return held?.status === 'done' && (t?.period === 'once' || held.period === periodKey(t?.period, now));
};

/* A game's level by the player's realm: 练气/筑基 1, 结丹/元婴 2, beyond 3. */
function gameLevel(content, state) {
  const i = TIERS_ORDER(content).indexOf(state.tier);
  return i < 2 ? 1 : i < 4 ? 2 : 3;
}

/* The board a beast here is caught with (creatures.json `catch`: 狰's 守夜),
   open at its haunt until it is caught — never fought, never tamed first. A catch board taken off
   (its task `cut`: 守夜 2026-10-19, the story's wm-yaoyuan catches the 狰 with its radish) is never
   offered: the beast still runs from a raised hand (`runs`), and the story brings it in. */
function catchHere(content, state, id) {
  const cid = placeOf(content, state.place)?.has?.creature, c = cid ? creatureOf(content, cid) : null;
  return Boolean(c?.catch === id && !taskOf(content, id)?.cut && !(state.cast ?? []).includes(cid) && state.tasks?.[id]?.status !== 'done');
}

/* Offered, and not yet done this period — or wanted by an errand (reopened,
   or hosted here for one), or the catch of the beast here. */
function taskOpen(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  if (!t) return false;
  // 兽潮 is open by its cooldown alone (rules/shouchao.mjs), never by the generic period: a night counted at 23:00 stays shut the next morning.
  if (isTide(content, id)) return shouchaoHere(content, state, id, now);
  if (reopened(content, state, id, now) || hostedHere(content, state, id) || catchHere(content, state, id) || stallHere(content, state, id, now) || runBoardHere(content, state, id) || kaoHere(content, state, id, now) || qiyuHere(content, state, id) || shouchaoHere(content, state, id, now)) return true;
  if (!held) return false;
  return !(held.status === 'done' && (t.period === 'once' || held.period === periodKey(t.period, now)));
}

function taskDone(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  // A rerun's 拾遗 (rules/rerun.mjs): paid by the room's find, not the task's grant.
  if (runBoardHere(content, state, id)) return runFindDone(state, content, ctx, id);
  // 本王考考你 (rules/kao.mjs): a word's first clear, paid by its looks.
  if (kaoHere(content, state, id, ctx.now)) return kaoDone(state, content, ctx, id);
  // 兽潮 (rules/shouchao.mjs): the night counted — its 灵气, the pay by stars, the next night.
  if (shouchaoHere(content, state, id, ctx.now)) return shouchaoDone(state, content, ctx, id);
  // …and inside its cooldown: refused in the world's words, the minutes left.
  const tideShut = shouchaoShut(content, state, id, ctx.now);
  if (tideShut) return tideShut;
  // A 秘境 rerun's 奇遇 (rules/qiyu.mjs): paid by a find of the run's, and its first clear's 灵石.
  if (qiyuHere(content, state, id)) return qiyuDone(state, content, ctx, id, (s, t, paid) => boardPay(content, s, t, id, paid));
  const again = reopened(content, state, id, ctx.now);
  // A hosted game won today is counted wherever he stands when it is handed
  // in: the win was at the place (his 五子棋, 2026-09-23: a queued "go to 彭城"
  // ran before the win's turn, and the pay was refused at 彭城).
  // Kept across midnight: while the errand still asks for it, a win kept on
  // an empty pool counts whenever 体力 is back (the page says so).
  const wonHere = Boolean(t.hosted && state.wins?.[id] && errandWants(content, state, id));
  const stall = stallHere(content, state, id, ctx.now);
  if (!state.tasks[id] && !again && !hostedHere(content, state, id) && !catchHere(content, state, id) && !wonHere && !stall) return refuse('not-offered', null);
  if (!wonHere && !taskOpen(content, state, id, ctx.now)) return refuse('already-done', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state);
  delete s.wins[id];
  // For an errand, the errand pays — not the game or the task a second time.
  // A hosted game costs a little 体力, as a step does (rewards.json
  // stamina.cost.game — his, 2026-09-24): taken as it is counted, and a win
  // kept while the pool is empty is counted once it refills, the same day.
  if (again || (t.hosted && !stall)) {
    if (t.hosted) {
      const empty = spendStamina(content, s, ctx, 'game');
      if (empty) return empty;
    }
    const handed = advance(content, s, { kind: 'board', task: id }, ctx);
    return { state: s, result: { ok: true, done: id, paid: null, gives: null, for: 'errand', ...(handed.length ? { handed } : {}) } };
  }
  // A board left and offered again (rules/skips.mjs) pays in full now — its passage was told the day it was left.
  const replayed = Boolean(state.tasks[id]?.replay);
  s.tasks[id] = { status: 'done', period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  // A game inside its scene's passage (`story_after`, 2026-10-14): the rest of the passage is the
  // scene's, owed the moment the game is counted — told right after it, before the choices.
  const here = sceneOf(content, s);
  // With two boards (batch two: 00-cave, 00-halfyear) the split belongs to the first in `show`; the second comes after the rest.
  if (!replayed && here?.story_after && sceneBoards(here)[0] === id) s.tell_owed = [...(s.tell_owed ?? []), `after/${here.id}`];
  const full = t.gives?.bag ? storedLine(s, [stow(content, s, t.gives.bag)]) : null;
  const paid = pay(content, s, ctx, t.grant);
  boardPay(content, s, t, id, paid);
  // A board's own 恩仇簿 line (`ledger`, as an exit writes it — 古六's 写信: 孙二狗's letter).
  const wrote = t.ledger ? writeLedger(content, s, t, ctx) : [];
  const handed = advance(content, s, { kind: 'board', task: id }, ctx);
  return { state: s, result: { ok: true, done: id, paid, gives: t.gives ?? null, line: pick(t.done_line, s.lang), ...(wrote.length ? { ledger: wrote } : {}), ...(full ? { pouch_full: full } : {}), ...(handed.length ? { handed } : {}) } };
}

/* A real-life chore handed in: today's pick, a fixed one, or a 开府
   milestone (chores.mjs). A pool chore that is not today's pick pays nothing,
   done or not — one a day (redesign-v2). A milestone's period is 'once', so
   its record in the synced save pays it once ever, on any device. */
function questCheck(state, content, ctx, id) {
  const quests = ctx.quests ?? [], q = quests.find(x => x.id === id);
  if (!q) return refuse('unknown-quest', null);
  const period = periodKey(q.period, ctx.now);
  if (state.chores[id]?.period === period) return refuse('already-paid', null);
  if (!choreCounts(state, quests, q, ctx.now, content)) return refuse(isOnce(q) ? 'not-open' : 'not-today', null, { app: q.app });
  if (!questDone(q, ctx.now)) return refuse('not-done', null, { app: q.app });
  const s = clone(state);
  s.chores[id] = { period, paid_at: ctx.now.toISOString() };
  // 开府 drips: the open one handed in, the next opens tomorrow (chores.mjs).
  if (isOnce(q)) s.kaifu = kaifuAfter(state, content, quests, ctx.now, id);
  const grant = choreGrant(content, q, state);
  const paid = pay(content, s, ctx, grant);
  // 开府 may open before the 灵石 are his (chapter `locks`, Hanli 2026-10-22: 开府 on meeting 银月):
  // what it would have paid is owed, and lands the move the gate opens (core.mjs landOwed).
  const owed = isOnce(q) && lockedOf(content, s).includes('wealth') ? owe(content, s, grant) : 0;
  // What the chore means in the book (rules/gongke.mjs): a little more, by its kind, capped by the day.
  const meaning = payMeaning(content, s, ctx, q, pay);
  settleStamina(content, s, ctx.now);
  const stamina = addStamina(content, s, grant.stamina, ctx.now);
  return { state: s, result: { ok: true, quest: id, app: q.app, paid, stamina, ...(meaning ? { meaning } : {}), ...(owed ? { owed: { wealth: owed } } : {}) } };
}

/* 灵石 a grant would have paid, kept in `owed` while the gate keeps them shut. */
function owe(content, s, grant) {
  const n = Math.max(0, Math.round(Math.min(grant.wealth ?? 0, content.rewards.tables[grant.table]?.wealth ?? 0)));
  if (n) s.owed = { ...s.owed, wealth: (s.owed?.wealth ?? 0) + n };
  return n;
}

/* A small game's 灵石 (Hanli 2026-10-16; balance.json `boards`): its first clear only, by how it went.
   The task's `ranks` names a grade's rank outright; else all three stars is best, and of its listed
   marks the first (the clean clear) is best, the last plain, one between good; a board with no marks
   (a puzzle solved or not) pays plain. Never before 入门 (lockedOf shuts wealth: nothing paid,
   nothing marked paid). Added to what the task's grant paid, so the win line shows it. */
export function boardRank(t, grade, stars) {
  if (t.ranks?.[grade]) return t.ranks[grade];
  if ((stars ?? 0) >= 3) return 'best';
  const marks = Object.keys(t.marks ?? {}), at = marks.indexOf(grade);
  if (at < 0 || marks.length < 2) return 'plain';
  return at === 0 ? 'best' : at === marks.length - 1 ? 'plain' : 'good';
}
function boardPay(content, s, t, id, paid) {
  const table = content.balance?.boards;
  if (!table || t.kind !== 'board' || !t.game || (s.boards_paid ?? []).includes(id)) return;
  if (lockedOf(content, s).includes('wealth')) return;
  // The 今 never pays the 古 (Hanli: 不跨线): a board won on a side line (沈芒's 今) earns no 灵石 — found live 10-22,
  // 今三's chat paid 灵石 +5, and so did every 今 board past 入门 since the small-game pay (10-16).
  if (sideLine(content, sceneOf(content, s))) return;
  const rank = boardRank(t, s.grades?.[id] ?? null, s.stars?.[id]);
  const amount = table[rank] ?? 0;
  s.boards_paid = [...(s.boards_paid ?? []), id];
  if (!amount) return;
  s.wealth += amount; s.day.wealth += amount;
  paid.wealth = (paid.wealth ?? 0) + amount;
  paid.board = { rank, wealth: amount };
}

/* The page is the only witness to a board or a duel: it records the win here,
   and Resolve or Task done pays it. Never one of Ling's tools — a win Ling
   could claim would be a self-reported one. */
export function win(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const inScene = sceneOf(content, state)?.exits.some(e => gameOf(e)?.id === id && gameOf(e).kind !== 'duel');
  if (!inScene && !taskOpen(content, state, id, ctx.now)) return shouchaoShut(content, state, id, ctx.now) ?? refuse('not-here', null);
  // A scene's boards are played in `show` order: a later one waits for those before it.
  const scene = sceneOf(content, state), order = sceneBoards(scene);
  if (order.slice(0, Math.max(0, order.indexOf(id))).some(b => state.tasks?.[b]?.status !== 'done')) return refuse('board-waits', null);
  const s = clone(state);
  s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  // How the board went (the game's `grade`, 2026-10-14's opening beats): kept
  // by the task, and the task's `marks` for it written — a grade the task
  // does not name is not kept. The scene's exits may wait on it (`needs.grade`).
  const graded = gradeOf(content, id, args.grade);
  if (graded) {
    s.grades = { ...s.grades, [id]: graded.grade };
    if (graded.mark) s.marks = [...new Set([...(s.marks ?? []), graded.mark])];
  }
  // Stars (the new small games, 2026-10-16: 喂饼's corners caught): kept by the task that declares
  // how many it has, his best ever — a knob pay can scale on later (balance.json), paid on nothing yet.
  const stars = starsOf(content, id, args.stars);
  if (stars != null) s.stars = { ...s.stars, [id]: Math.max(stars, s.stars?.[id] ?? 0) };
  // A board that climbs (rules/climb.mjs): the level he was dealt is behind him; the next deal is the one after.
  climbWon(s, content.tasks.tasks.find(t => t.id === id));
  // A board won gives the card its book action is (cards.json `from: {kind: 'beat', task}` —
  // 射鹿 → 一箭 · 偏左半寸, 吹鹅毛 → 吐纳). Won, never skipped: a skip pays nothing (rules/skips.mjs).
  const cards = grantFrom(content, s, 'beat', id, { how: 'beat', day: dayKey(ctx.now) });
  return { state: s, result: { ok: true, won: id, ...(graded ? { grade: graded.grade } : {}), ...(stars != null ? { stars } : {}), ...(cards.length ? { cards } : {}) } };
}

/* A board's stars, clamped to the most its task declares (`stars`); none for a task without. */
function starsOf(content, id, stars) {
  const most = content.tasks.tasks.find(t => t.id === id)?.stars;
  const got = Math.trunc(Number(stars));
  return most > 0 && Number.isFinite(got) ? Math.max(0, Math.min(most, got)) : null;
}


/* A board's grade as its task names it: `marks` (grade → mark) lists the grades it keeps. */
function gradeOf(content, id, grade) {
  const marks = content.tasks.tasks.find(t => t.id === id)?.marks;
  const g = String(grade ?? '');
  return marks && Object.hasOwn(marks, g) ? { grade: g, mark: marks[g] } : null;
}

/* 降妖 — the scene plays the fight turn by turn, the rules decide it.
   `start` checks the creature has not withdrawn today and charges a fight's
   stamina; then, with `picks` — the player's own turns — the rules replay
   the fight and record the outcome: a win the exit can take, or a loss that
   sends the creature into the mist until tomorrow. A loss costs nothing
   else. A creature beaten today is subdued until tomorrow — a scene's as
   much as a haunt's, and one whose exit waits to be taken is not fought
   again at all: every win drops and deals a card, so a
   second win was a farm (review, 2026-09-24). A scene played again (Go
   back into a chapter done) is fought for the story and pays nothing.
   One fight at a time: while one is open no other starts, and only its
   own picks settle it. */
export function duel(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const exit = sceneOf(content, state)?.exits.find(e => gameOf(e)?.id === id && gameOf(e).kind === 'duel');
  const haunt = !exit && id.startsWith('haunt:') ? encounterOf(content, state, ctx.now) : null;
  if (!exit && !(haunt && haunt.game.id === id)) return refuse('not-here', null);
  if (haunt?.tamed) return refuse('tamed', null, { creature: haunt.creature });
  const game = exit ? gameOf(exit) : haunt.game, creature = creatureOf(content, game.creature);
  // A beast that is caught, not fought (`catch`), runs the moment it is struck at.
  if (haunt && !haunt.pool && creature.catch) return refuse('runs', pick(creature.runs, state.lang), { creature: haunt.creature, catch: creature.catch });
  const withdrawnLine = exit ? pick(exit.withdrawn, state.lang)
    : pick({ zh: `${pick(creature.name, 'zh')}退入林影，明日再来。`, en: `${pick(creature.name, 'en')} withdraws into the shadows; come back tomorrow.` }, state.lang);
  const s = clone(state);
  // A pool's fights are kept by the place, numbered through the day (world.mjs huntKey): fought again and again.
  const key = game.hunt ? huntKey(game.hunt) : creature.id, hunt = Boolean(game.hunt);
  const day = dayKey(ctx.now), today = s.duels?.[key];

  // ── 出手: the door of the instance ──
  if (!args.picks) {
    // A trial fight (`retry`, the prologue's 三试) is fought again at once — a
    // new player is never shut out of the gate for the day by one loss.
    const again = game.retry && today?.day === day && ['lost', 'withdrew'].includes(today.outcome);
    if (!hunt && !again && today?.day === day && today.outcome === 'lost') return refuse('withdrawn', withdrawnLine, { game: id });
    if (!hunt && !again && today?.day === day && today.outcome === 'withdrew') return refuse('spent-today', null, { game: id });
    if (!hunt && today?.day === day && today.outcome === 'won') return refuse('subdued-today', null, { game: id });
    if (exit && s.wins?.[id]) return refuse('won-already', null, { game: id, exit: exit.id });
    if (s.fight && s.fight.game !== id) return refuse('in-a-fight', null, { game: s.fight.game });
    // Roots unread, only a trial is fought (the 三试, before the 入门仪式): with the rootless starter (cards.mjs fightSetup).
    if (!s.traits?.length && !game.retry) return refuse('no-traits', null);
    // A page reloaded mid-fight asks again: the same fight comes back, and the
    // day's 灵气 is not taken twice. The seed is the day's, so the cards deal
    // the same way they did.
    const resuming = s.fight?.game === id && today?.day === day && today.outcome === 'open';
    if (!resuming) {
      const empty = spendStamina(content, s, ctx, 'duel');
      if (empty) return empty;
    }
    const n = hunt && today?.day === day ? today.n ?? 0 : 0;
    // 丹囊: the pills he picked at the door (`pills`, ids comma-separated; '' carries none) — kept as his
    // pick for the next door, as many as the bag holds (cards.mjs pouchFor).
    if (args.pills != null && !resuming) s.pill_pick = String(args.pills).split(',').map(x => x.trim()).filter(id => fightPill(content, id)).slice(0, POUCH_MAX);
    s.duels = { ...s.duels, [key]: { day, outcome: 'open', ...(hunt ? { n, ...(today?.last ? { last: today.last } : {}) } : {}) } };
    // While this is set, Ling advances NOTHING (SKILL.md § 斗法): she knows
    // from the save, not from a message, because a message can be lost.
    s.fight = resuming ? s.fight : { game: id, creature: creature.id, at: ctx.now.toISOString() };
    // The whole setup is kept with it, so the settle replays what the page
    // is handed now (an older save's open fight takes it on resume).
    if (!s.fight.setup) s.fight.setup = fightSetup(content, s, foeOf(content, game), ctx.now, id, game.deal, readOf(s, game));
    return { state: s, result: { ok: true, started: id, ...(resuming ? { resumed: true } : {}), duel: duelBrief(content, s, game, ctx.now, { door: true }) } };
  }

  // ── 收场: the page hands back what was played, the rules replay it ──
  if (today?.day !== day || today.outcome !== 'open' || s.fight?.game !== id) return refuse('not-started', null, { game: id });
  // The setup the page was handed at the door, not one made again now.
  const setup = s.fight.setup ?? fightSetup(content, s, foeOf(content, game), ctx.now, id, game.deal, readOf(s, game));
  const actions = String(args.picks).split(',').map(x => x.trim()).filter(Boolean);
  const played = battle(actions, setup, cardCatalog(content));
  if (played.refused) return refuse(played.refused.why, null, { action: played.refused.action });
  if (played.outcome === 'open') return refuse('unfinished', null, { turn: played.turn });
  delete s.fight;
  // A loss costs nothing but the beast, gone for the day (伤势 was cut, redesign-v2 § 四).
  // A pool remembers the beast it dealt (world.mjs poolBeast: the last few stand down), and every
  // beast fought is the 图鉴's (state.beasts) — a first meeting, a first win, said on the result.
  s.duels[key] = { day, outcome: played.outcome, ...(hunt ? { n: (today.n ?? 0) + 1, at: ctx.now.toISOString(), last: rememberAt(content, today, creature.id, poolOf(content, placeOf(content, game.hunt))) } : {}) };
  const firsts = creature.person ? {} : meetBeast(s, creature.id, played.outcome === 'won', ctx.now);
  // 新 is gone once a card is played, win or lose (cards.mjs gainCard).
  unmark(s, played.log);
  // A pill taken is gone from the bag, win or lose (battle.js § pills).
  const ate = played.log.filter(e => e.act === 'pill' && e.who === 'you').map(e => e.id);
  for (const id of ate) { s.bag[id] = Math.max(0, (s.bag[id] ?? 0) - 1); if (!s.bag[id]) delete s.bag[id]; }
  // A 符 played is a 符 spent, win or lose (cards.mjs § 装备入局).
  const spent = spentCharms(content, setup, played);
  for (const id of spent) { s.bag[id] = Math.max(0, (s.bag[id] ?? 0) - 1); if (!s.bag[id]) delete s.bag[id]; }
  const won = played.outcome === 'won';
  // A scene played again is fought for the story: the exit opens, nothing else pays.
  const pays = won && !(exit && replaying(content, s, sceneOf(content, s)));
  const handed = pays ? advance(content, s, { kind: 'subdue', creature: creature.id }, ctx) : [];
  if (won) s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  // A scene's fight not won (lost, or run dry) is counted: inside a key beat's lock, enough of them and it
  // may be left (rules/skips.mjs fightStuck). A win clears the count.
  if (exit && !won) s.fight_losses = { ...s.fight_losses, [id]: (s.fight_losses?.[id] ?? 0) + 1 };
  if (exit && won && s.fight_losses?.[id] != null) { const { [id]: _, ...rest } = s.fight_losses; if (Object.keys(rest).length) s.fight_losses = rest; else delete s.fight_losses; }
  // A pool's fights won, by the place (a guarded room counts them, world.mjs guardOf).
  if (won && hunt) s.hunted = { ...s.hunted, [game.hunt]: (s.hunted?.[game.hunt] ?? 0) + 1 };
  // …and those not won there: a guard lost to often enough lets him by (world.mjs guardOf, 2026-10-27).
  if (!won && hunt) s.hunt_losses = { ...s.hunt_losses, [game.hunt]: (s.hunt_losses?.[game.hunt] ?? 0) + 1 };
  // A beast met on the road, beaten, has been met: it leaves the road.
  if (won && haunt?.road) s.meets.places[s.place] = { ...s.meets.places[s.place], done: true };
  const say = played.outcome === 'lost' ? withdrawnLine
    : played.outcome === 'withdrew' ? pick({ zh: `${pick(creature.name, 'zh')}一口气用尽，转身走了 —— 这一场不算你赢。`, en: `${pick(creature.name, 'en')} runs out of breath and turns away — this one is not a win.` }, state.lang)
      : null;
  // What a subdued creature leaves, and what a haunt pays for it. A fight that
  // ended in 遁走 pays nothing: it has to be WON (design.md § 斗法 v3). An
  // elite pays as any beast: its harder deck is all it is (redesign-v2 § 四).
  const dropped = pays ? drop(content, s, creature, ctx.now, { loot: hunt || Boolean(haunt) }) : [];
  // A rerun's beast (rules/rerun.mjs): the room moves on, and its drop table rolls.
  if (pays && game.run) dropped.push(...runSpoils(content, s, game));
  const card = pays ? winCard(content, s, creature, ctx.now) : null;
  if (card) dropped.push(card);
  const t = content.rewards.tables.haunt;
  const paid = haunt && pays ? pay(content, s, ctx, { table: 'haunt', progress: t.progress, wealth: t.wealth }) : null;
  const full = storedLine(s, dropped);
  // Not won: what beat him, and the ways to grow stronger now (rules/strengthen.mjs) — facts for 银月's
  // word and the result card's one button (Hanli 2026-10-27: a loss never strands him).
  const way = won ? null : lossWay(content, s, ctx, game, setup, played);
  return { state: s, result: { ok: true, ...(way ? way : {}), outcome: played.outcome, game: id, say, ...(spent.length ? { spent } : {}), you: played.you, foe: played.foe, turns: played.turn, ...(dropped.length ? { dropped } : {}), ...(firsts.first_met ? { first_met: true } : {}), ...(firsts.first_win ? { first_win: true } : {}), ...(hunt ? { tally: poolTally(content, s, placeOf(content, game.hunt), ctx.now) } : {}), ...(full ? { pouch_full: full } : {}), ...(handed.length ? { handed } : {}), ...(paid ? { paid, haunt: haunt.creature } : {}) } };
}

/* A fight not won: `beat` — the beast's 护主 (bodies it stood up), its 气血 left, the turns he lasted —
   and `way`, strengthen()'s options, best first. */
function lossWay(content, s, ctx, game, setup, played) {
  const catalog = cardCatalog(content);
  const guards = played.log.filter(e => e.who === 'foe' && (e.act === 'summoned' || (e.act === 'played' && catalog[e.id]?.kind === 'minion'))).length;
  const beat = { guards, foe_hp: played.foe.hp, foe_hp_max: played.foe.hpMax, you_hp_max: played.you.hpMax, turns: played.turn, deck: setup.you.deck.length };
  return { beat, way: strengthen(content, s, { now: ctx.now, beat, game }) };
}

/* The cards he played in this fight lose their 新. */
function unmark(s, log) {
  const played = new Set(log.filter(e => e.act === 'played' && e.who === 'you').map(e => e.id));
  const left = (s.cards_new ?? []).filter(id => !played.has(id));
  if (left.length) s.cards_new = left; else delete s.cards_new;
}

/* The 符 the door put in his hand that the fight saw him play — each is
   taken from the bag at the settle. Read off the log the replay wrote, so the
   page and the rules agree on it as they agree on the rest. */
const spentCharms = (content, setup, played) => {
  const catalog = cardCatalog(content), held = new Set((setup.you?.extra ?? []).filter(id => catalog[id]?.charm));
  return [...new Set(played.log.filter(e => e.act === 'played' && e.who === 'you' && held.has(e.id)).map(e => e.id))];
};

/* ── A fight open: the world holds still ──
   While a fight is open (state.fight) the verbs that change the world are
   refused `in-a-fight` — Ling was told so in SKILL.md, the rules never were,
   and a Move mid-fight left the fight unsettleable (review, 2026-09-24). The
   fight's own verbs stand: Duel settles it (or resumes it), Look, Show and the
   readers work. `true` holds the verb; a function holds only the calls it
   says. Anything not named is left alone. */
const FIGHT_HOLDS = {
  resolve: true, move: true, go: true, enter: true, leave: true, trade: true, tale: a => !['info', 'seed'].includes(a.action),
  meet: true, tame: true, refine: true, task: a => a.action !== 'list',
  win: true, travel: true, build: true, load: true, make: true, amend: true, lundao: true, twenty: a => a.action === 'open', haggle: true, case: true, duizi: a => ['open', 'reverse'].includes(a.action),
  divine: true, fate: true, ring: true, greet: true, deck: true, bag: true, fantong: a => a.action === 'feed', quest: a => !['info', 'kaifu'].includes(a.action), rerun: a => a.action !== 'info',
  seclude: a => a.action === 'enter',
};
export function fightHold(state, verb, args = {}) {
  const hold = state?.fight ? FIGHT_HOLDS[verb] : null;
  if (!hold || (typeof hold === 'function' && !hold(args))) return null;
  return refuse('in-a-fight', null, { game: state.fight.game });
}

/* A fight left open on an earlier day is over: the creature went, nobody
   won, nothing is paid (a withdrawal). Closed on the next call, whatever it
   is, so a page closed mid-fight never holds the world still overnight.
   Returns the state to go on with, a copy when anything was closed. */
export function closeStaleFight(state, now) {
  const f = state?.fight;
  if (!f || dayKey(new Date(f.at)) === dayKey(now)) return state;
  const s = clone(state);
  delete s.fight;
  const was = s.duels?.[f.creature];
  if (was?.outcome === 'open') s.duels[f.creature] = { ...was, outcome: 'withdrew' };
  return s;
}

/* 论道 — word games with the scholar at 稷下 (his, 2026-09-23: build the
   mini-games), played when an errand asks for them there (a notice's game,
   never a daily chore — redesign-v2) or as a step of 今日传闻 (tale.mjs). The rules deal the prompt and check the form: the keyword is
   in the line (飞花令), the idiom chains from the last character (成语接龙),
   the lower line is as long as the upper (对对联). Ling judges the meaning —
   a real verse, a real idiom, a fitting couplet — and says it as `ok`, and
   speaks for the scholar. Three good answers win; three misses and he rises
   for the day. It costs a hosted game's 体力 at the door (`open`), as the
   boards do (rewards.json stamina.cost.game). */
const hanOf = s => [...String(s ?? '')].filter(c => /\p{Script=Han}/u.test(c));
const lundaoToday = (state, now) => (state.lundao?.day === dayKey(now) ? state.lundao : null);

const LUNDAO_NAMES = { feihua: { zh: '飞花令', en: 'Flying-flower verses' }, chengyu: { zh: '成语接龙', en: 'Word chain' }, duilian: { zh: '对对联', en: 'Matching couplets' } };
const lundaoName = (game, lang) => pick(LUNDAO_NAMES[game], lang) ?? game;

function lundaoBrief(content, state, now) {
  const l = lundaoToday(state, now);
  if (!l) return null;
  const cfg = content.lundao, lang = state.lang;
  return { game: l.game, name: lundaoName(l.game, lang), prompt: l.prompt, last: l.last, good: l.good, misses: l.misses, need: cfg.need, max_misses: cfg.misses, outcome: l.outcome ?? 'open' };
}

function lundaoForm(game, lang, l, answer) {
  const a = String(answer ?? '').trim();
  if (!a) return 'empty';
  if (l.used.includes(a)) return 'used';
  if (game === 'feihua') {
    if (lang === 'zh') { const n = hanOf(a).length; return !a.includes(l.prompt) ? 'no-keyword' : n < 4 || n > 10 ? 'not-a-line' : null; }
    return !new RegExp(`\\b${l.prompt}`, 'i').test(a) ? 'no-keyword' : a.split(/\s+/).length < 3 ? 'not-a-line' : null;
  }
  if (game === 'chengyu') {
    if (lang === 'zh') { const h = hanOf(a); return h.length !== 4 ? 'not-four' : h[0] !== hanOf(l.last).at(-1) ? 'no-chain' : null; }
    const w = a.toLowerCase().replace(/[^a-z]/g, '');
    return w.length < 3 ? 'not-a-word' : w[0] !== l.last.toLowerCase().replace(/[^a-z]/g, '').at(-1) ? 'no-chain' : null;
  }
  if (game === 'duilian') return hanOf(a).length !== hanOf(l.prompt).length ? 'not-matched' : a === l.prompt ? 'used' : null;
  return 'unknown-game';
}

/* 对对联's reference lower line, for Ling's judging only (his, 2026-09-24:
   Ling read it out as the next upper line — the player's answer, spoken).
   Nested and named so it never passes for a line to say; the line to say
   is `say`, the card's prompt. 飞花令 and 成语接龙 carry no answer at all. */
const judgeOf = down => ({ reference_down: down, note: 'For judging only — never say it, hint at it or paraphrase it. Read `say` (the card\'s prompt) aloud.' });

export function lundao(state, content, ctx, args) {
  const cfg = content.lundao, lang = state.lang, action = String(args.action ?? 'open');
  if (!cfg || !hostedHere(content, state, 'lundao')) return refuse('not-here', pick({ zh: '这里没有可论道的人。', en: 'There is no one here to debate.' }, lang));
  const s = clone(state), today = lundaoToday(s, ctx.now);
  if (action === 'open') {
    if (today?.outcome === 'lost') return refuse('lost-today', pick({ zh: '先生已起身，明日再来。', en: 'The scholar has risen for the day. Come back tomorrow.' }, lang));
    if (today && !today.outcome) return { state: null, result: { ok: true, say: today.game === 'chengyu' ? today.last : today.prompt, lundao: lundaoBrief(content, s, ctx.now), ...(today.model ? { judge: judgeOf(today.model) } : {}) } };
    const empty = spendStamina(content, s, ctx, 'game');
    if (empty) return empty;
    const day = dayKey(ctx.now);
    const games = lang === 'zh' ? ['feihua', 'chengyu', 'duilian'] : ['feihua', 'chengyu'];
    const game = games[hashOf(`${day}|${seedOf(s)}|lundao`) % games.length];
    const list = game === 'duilian' ? cfg.duilian.zh : cfg[game][lang === 'zh' ? 'zh' : 'en'];
    const dealt = list[hashOf(`${day}|${seedOf(s)}|lundao|${game}`) % list.length];
    const prompt = game === 'duilian' ? dealt.up : dealt;
    s.lundao = { day, game, prompt, last: prompt, good: 0, misses: 0, used: [prompt], ...(game === 'duilian' ? { model: dealt.down } : {}) };
    return { state: s, result: { ok: true, opened: true, say: prompt, lundao: lundaoBrief(content, s, ctx.now), ...(game === 'duilian' ? { judge: judgeOf(dealt.down) } : {}) } };
  }
  if (action !== 'turn') return refuse('unknown-action', null, { actions: ['open', 'turn'] });
  if (!today || today.outcome) return refuse('not-open', null);
  const l = s.lundao, form = lundaoForm(l.game, lang, l, args.answer);
  const judged = String(args.ok ?? '') === 'true';
  const good = !form && judged;
  const answer = String(args.answer ?? '').trim();
  if (good) {
    l.good += 1; l.used.push(answer);
    // The chain goes on from the scholar's reply when it chains, else from the answer.
    const reply = String(args.reply ?? '').trim();
    l.last = l.game === 'chengyu' && reply && !lundaoForm('chengyu', lang, { ...l, last: answer }, reply) ? reply : answer;
    if (l.game === 'chengyu' && reply) l.used.push(reply);
    // 对对联: a fresh upper line each round; 飞花令 keeps its keyword.
    if (l.game === 'duilian' && l.good < cfg.need) {
      const next = cfg.duilian.zh[hashOf(`${l.day}|${seedOf(s)}|lundao|duilian|${l.good}`) % cfg.duilian.zh.length];
      l.prompt = next.up; l.model = next.down;
    }
  } else l.misses += 1;
  // A good turn in 对对联 deals a fresh upper line: Ling reads it out as `say`.
  const fresh = good && l.game === 'duilian' && l.good < cfg.need;
  let paid = null;
  let handed = [];
  if (l.good >= cfg.need) {
    // Won: the errand that asked for it is counted, and it pays its own grant.
    l.outcome = 'won';
    // Marked done for the day, so the tray says 已完成 (his screen, 2026-09-24:
    // 「论道 · 待做」 after a win); a notice that asks again offers it anew.
    s.tasks = { ...s.tasks, lundao: { status: 'done', period: l.day, done_at: ctx.now.toISOString() } };
    handed = advance(content, s, { kind: 'board', task: 'lundao' }, ctx);
    paid = handed.find(h => h.paid)?.paid ?? null;
  } else if (l.misses >= cfg.misses) l.outcome = 'lost';
  return { state: s, result: { ok: true, good, ...(form ? { form } : {}), ...(!form && !judged ? { judged: false } : {}), lundao: lundaoBrief(content, s, ctx.now), ...(fresh ? { say: l.prompt } : {}), ...(l.model && !l.outcome ? { judge: judgeOf(l.model) } : {}), ...(l.outcome === 'won' ? { line: pick(taskOf(content, 'lundao').done_line, lang), ...(paid ? { paid } : {}), ...(handed.length ? { handed } : {}) } : {}) } };
}

export { catchHere, doneThisPeriod, errandAsking, gameLevel, hostedHere, stallHere, lundaoBrief, lundaoForm, lundaoName, questCheck, questDone, reopened };
