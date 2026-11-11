// rules/tasks.mjs — Tasks and quests: boards, errands handed in, win, duel, 论道.
// Part of the rules engine; rules.mjs is its one door.
import { fightReplay, hauntPlayId, namedRow, playCounted, playGrant, playedRow, stonesAt } from './playpay.mjs';
import { festivalDone } from './festival.mjs';
import { climbWon } from './climb.mjs';
import { battle } from '../battle.js';
import { gameOf } from '../content.mjs';
import { addStamina, boardCost, dayKey, staminaCost, lockedOf, periodKey, pick, settleStamina, seedOf } from '../state.mjs';
import { drop } from './arms.mjs';
import { cardCatalog, fightPill, fightSetup, grantFrom, readOf, winCard } from './cards.mjs';
import { POUCH_MAX } from '../battle.js';
import { clone, gainsOf, pay, refuse, replaying, spendStamina } from './core.mjs';
import { choreCounts, choreGrant, isOnce, ownOf, questDone } from './chores.mjs';
import { payMeaning } from './gongke.mjs';
import { advance, countsOf, questDoneBefore, questOf, taskOf, TIERS_ORDER } from './errands.mjs';
import { errandLine } from './errand-line.mjs';
import { duelBrief, tasksBrief } from './look.mjs';
import { hashOf, move } from './travel.mjs';
import { poolToday, standingToday } from './rotation.mjs';
import { stow, fullLine } from './pouch.mjs';
import { dropKept, keepBoard, leaveBoard, leaveOf, owePart, playKept, sceneBoards, skipBoard, storyBoard } from './skips.mjs';
import { sideLine } from './hui.mjs';
import { tallyBoard } from './cultivation.mjs';
import { boardLine, lineGrant, linePay } from './lines.mjs';
import { writeLedger } from './ledger.mjs';
import { creatureOf, encounterOf, foeOf, huntKey, meetBeast, placeOf, poolOf, poolTally, rememberAt, restAfter, sceneOf } from './world.mjs';
import { strengthen } from './strengthen.mjs';
import { kaoDone, kaoHere } from './kao.mjs';
import { isTide, shouchaoDone, shouchaoFirst, shouchaoHere, shouchaoShut, tonight } from './shouchao.mjs';
import { isMijingFight, keyDrop, mijingBoardDone, mijingBoardHere, mijingDuel } from './mijing.mjs';
import { isBout, qiecuoDone, qiecuoHere, qiecuoOver, qiecuoShut } from './qiecuo.mjs';
import { yaoshouFought, yaoshouShare } from './yaoshou.mjs';
import { claimedAt, happeningHosts } from './happenings.mjs';
import { stampForm, waveHere, waveTask, yaoshouFormOf } from './forms.mjs';
import { yaoshouBatch } from './yaoshou.mjs';

/* Each line its own 修为 (rules/lines.mjs, Hanli 2026-10-27): a board pays the line it belongs to — a 今 board the 今, wherever
   it is replayed; on a 今 scene, the 今 — by the same minutes on that line's ladder, and never 灵石. Null: the 古's own. */
const lineOfBoard = (content, s, id) => boardLine(content, id) ?? sideLine(content, sceneOf(content, s));
/* A board's 体力 as he played it: the row the win wrote down (`play_rows`), else the task's own (state.mjs boardCost). */
const playedCost = (content, s, id, t) => boardCost(content, 'game', playedRow(content, id, t, s.play_rows?.[id] ?? null));
/* A board lost costs what a win does (the coordinator for Hanli, 2026-11-04: 「it was played」): a hosted board its own
   minutes, a 兽潮 night its kit's, 切磋's bout its own (and the bout is over). The story's own boards cost nothing, as
   ever. An empty pool takes what is left — a loss is never refused. Left (✕ · 留) costs nothing: the rules do not know
   the minutes played. */
function boardLost(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t || t.kind !== 'board') return refuse('unknown-task', null);
  const bout = isBout(content, id) ? qiecuoOver(state, content, ctx, id, 'lost') : null;
  if (bout && !bout.state) return bout;
  const s = bout?.state ?? clone(state);
  let cost = 0;
  if (bout) cost = staminaCost(content, t.qiecuo?.cost ?? 'game');
  else if (shouchaoHere(content, state, id, ctx.now)) {
    const night = tonight(content, state);
    cost = boardCost(content, t.shouchao?.cost ?? 'game', (content.games?.games ?? []).find(g => g.id === night?.game && !g.cut && !g.replaced) ?? { id: night?.game });
  } else if (t.hosted && !storyBoard(content, state, id)) cost = playedCost(content, s, id, t);
  // Taken down to 0 at most; on a pool already spent the refusal is dropped (a loss stands whatever the pool).
  const before = s.stamina;
  if (cost) spendStamina(content, s, ctx, 'lost', 1, cost);
  return { state: s, result: { ...(bout?.result ?? { ok: true }), lost: id, stamina: Number.isFinite(before) && Number.isFinite(s.stamina) ? before - s.stamina : 0 } };
}
/* A board's play pay: the grant on its line, and paid there (`linePay`), else the 古's (playGrant, core.mjs pay). */
const boardGrant = (content, s, id, t, now, stars, opts = {}) => {
  const line = lineOfBoard(content, s, id);
  return line ? lineGrant(content, s, line, id, t, now, stars, opts) : playGrant(content, s, id, t, now, stars, opts);
};
const payBoard = (content, s, ctx, grant) => (grant?.line ? linePay(content, s, grant.line, grant) : pay(content, s, ctx, grant));


/* ── Tasks and quests ── */

export function task(state, content, ctx, args) {
  if (args.action === 'list') return { state: null, result: { ok: true, ...tasksBrief(content, state, ctx) } };
  // The day's festival task (rules/festival.mjs), done in the chat.
  if (args.action === 'done' && args.id === 'festival') return festivalDone(state, content, ctx);
  if (args.action === 'done') return taskDone(state, content, ctx, args.id);
  if (args.action === 'check') return questCheck(state, content, ctx, args.id);
  // A story board left (「算了，往下走」, paid nothing), and offered again later (rules/skips.mjs).
  // A skip never pays (Hanli 11-03; 2026-11-04: 「点关闭, 结果给奖励了」): `skip` on an errand's board puts it down — 收手,
  // nothing paid, the errand still open.
  if (args.action === 'skip') return (errandAsking(content, state, String(args.id ?? ''), state.place) ? skipOrLeave : skipBoard)(state, content, ctx, String(args.id ?? ''));
  // 留: kept for later (收着的棋局, rules/skips.mjs keepBoard) — taken up again, or dropped (丢).
  if (args.action === 'keep') return keepOrPut(state, content, ctx, String(args.id ?? ''));
  if (args.action === 'kept-play') return keptPlay(state, content, ctx, String(args.id ?? ''), Boolean(args.walk));
  if (args.action === 'kept-drop') return dropKept(state, content, ctx, String(args.id ?? ''));
  // 收手: a board he opened by choice, put down (rules/skips.mjs leaveOf).
  // …切磋's bout put down is over (rules/qiecuo.mjs): skipped, its cooldown started.
  if (args.action === 'leave' && isBout(content, String(args.id ?? ''))) return qiecuoOver(state, content, ctx, String(args.id), 'skipped');
  // …妖兽出没's wave lost or put down: the batch's fight is over, unpaid (a duel lost or run dry takes its slot alike).
  if (['lost', 'leave', 'skip'].includes(args.action) && waveTask(content)?.id === String(args.id ?? '')) return yaoshouWaveOver(state, content, ctx, String(args.id), args.action);
  if (args.action === 'leave') return leaveBoard(state, content, ctx, String(args.id ?? ''));
  // A board lost (the page, as it ends unwon): it was played, so it costs its 体力 in full (boardLost) — 切磋's bout is
  // over too, unpaid, its cooldown started.
  if (args.action === 'lost') return boardLost(state, content, ctx, String(args.id ?? ''));
  return refuse('unknown-action', null, { actions: ['list', 'done', 'check', 'skip', 'keep', 'kept-play', 'kept-drop', 'leave', 'lost'] });
}

/* An errand held and not yet met that asks for a win on this board. It
   reopens a board already done: 云龙山的八味 asks a pill of alchemy-first,
   done once in the story, so the furnace never came back and the errand
   could not be met (his, 2026-09-23: 我已经到这里了, 没触发差事). */
export function errandWants(content, state, id, place = null) {
  return Boolean(errandAsking(content, state, id, place));
}
/* …and which errand it is: the board opened for it is titled by it (2026-10-15 play-test:
   码柴 opened 华容道 under the task's own 「走出秘境」). */
function errandAsking(content, state, id, place = null, exact = false) {
  for (const qid of Object.keys(state.quests ?? {})) {
    if (questDoneBefore(state, qid)) continue;
    const q = questOf(content, qid);
    if (q && countsOf(content, state, q).some(n => n.kind === 'board' && n.task === id && !n.done && (exact ? n.at === place : !place || !n.at || n.at === place))) return q;
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
function hostedHere(content, state, id, now = new Date()) {
  const t = taskOf(content, id);
  // Open as practice wherever a place hosts it once boards pay by their minutes (rules/playpay.mjs, Hanli 2026-10-27:
  // 「玩的多应该走的快」) — an errand that wants it still takes the win; the replay's falling share is the only limit.
  return Boolean(t?.hosted) && hostsNow(content, state, id, now) && hostedOpen(content, state, t)
    && (errandWants(content, state, id, state.place) || (Boolean(content.balance?.play_pay) && t.kind === 'board' && !t.stall));
}
/* A hosted board that stands only once the story is there (`after`: a scene, Hanli 2026-11-10: 「也可以加一个地点刷其他主力游戏」 —
   演武场's 主力 practice from 古八 on): that scene behind him, or its chapter ended. Open always where it names none. */
const hostedOpen = (content, state, t) => !t?.after || (state.done_scenes ?? []).includes(t.after)
  || Object.values(content.chapters).some(c => c.scenes?.[t.after] && (state.ended ?? []).includes(c.id));
/* The place he stands hosts it now: what stands there (rules/rotation.mjs standingToday: its fixed boards, and the
   plate's one deal when it is here — 2026-11-04, 「只有之前的玩了才发新的」) — or a board an errand in the book asks for:
   the day's of its pool, as before the deal, or any of its pool the errand names at this very place (a wall tag sends him
   to 柴房's 华容道 on a 拼图 day: the tag is what stands it there). */
function hostsNow(content, state, id, now) {
  const place = placeOf(content, state.place);
  if (standingToday(content, state, place, now).includes(id)) return true;
  if (poolToday(place, now).includes(id) && errandAsking(content, state, id, state.place)) return true;
  // A board a happening deals here (rules/happenings.mjs): the one it deals now, lit this 时辰 — or any of its deals an errand
  // asks for here (九节菖蒲's 看炉 at the 药园: the board folded into the happening is still where the errand sends him).
  if (claimedAt(content, state.place, id) && errandAsking(content, state, id, state.place)) return true;
  if (happeningHosts(content, state, id, now)) return true;
  return (place?.has?.games_pool?.from ?? []).includes(id) && Boolean(errandAsking(content, state, id, state.place, true));
}
/* A stall's board (tasks/world.json `stall: true`, 钱掌柜's 押宝): played where a
   place hosts it whenever he stands there, once a period, for its own pay — no
   errand needed. An errand that wants it still takes it first (it pays the errand). */
function stallHere(content, state, id, now) {
  const t = taskOf(content, id);
  return Boolean(t?.stall && t.hosted) && hostsNow(content, state, id, now)
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
  if (isTide(content, id)) return shouchaoHere(content, state, id, now) || (shouchaoFirst(content, state, id) && reopened(content, state, id, now));
  // A 秘境探险 room's board: open while he stands in its room (rules/mijing.mjs).
  if (t.mijing) return mijingBoardHere(content, state, id);
  // 妖兽出没's fight as a wave (rules/forms.mjs): open while the batch's beast here comes as one.
  if (waveTask(content)?.id === id) return waveHere(content, state, id, now);
  // …and 切磋's bout by its own (rules/qiecuo.mjs).
  if (isBout(content, id)) return qiecuoHere(content, state, id, now);
  if (reopened(content, state, id, now) || hostedHere(content, state, id, now) || catchHere(content, state, id) || stallHere(content, state, id, now) || kaoHere(content, state, id, now) || shouchaoHere(content, state, id, now)) return true;
  if (!held) return false;
  // A kept board taken up (rules/skips.mjs playKept `taken`) is played where it was kept, nowhere else (Hanli 11-05: 象棋 taken
  // up at 执事堂 was won again on 后山).
  if (held.taken && held.status !== 'done' && held.taken !== state.place) return false;
  return !(held.status === 'done' && (t.period === 'once' || held.period === periodKey(t.period, now)));
}

function taskDone(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  // 本王考考你 (rules/kao.mjs): a word's first clear, paid by its looks.
  if (kaoHere(content, state, id, ctx.now)) return kaoDone(state, content, ctx, id);
  // A 秘境探险 room's board (rules/mijing.mjs): the 气血 it cost, the room behind him; the run pays at its end.
  if (t.mijing) return mijingBoardHere(content, state, id) ? mijingBoardDone(state, content, ctx, id) : refuse('not-here', null);
  // 妖兽出没's fight as a wave (rules/forms.mjs): settled as the duel's win would be.
  if (waveTask(content)?.id === id) return waveHere(content, state, id, ctx.now) ? yaoshouWaveDone(state, content, ctx, id) : refuse('not-here', null);
  // 兽潮 (rules/shouchao.mjs): the night counted — its 灵气, the pay by stars, the next night.
  if (shouchaoHere(content, state, id, ctx.now)) return shouchaoDone(state, content, ctx, id);
  // 切磋 (rules/qiecuo.mjs): the bout won — its pay by stars and the day's share, the next bout, the cooldown.
  if (qiecuoHere(content, state, id, ctx.now)) return qiecuoDone(state, content, ctx, id);
  const boutShut = qiecuoShut(content, state, id, ctx.now);
  if (boutShut) return boutShut;
  // …and inside its cooldown: refused in the world's words, the minutes left.
  const tideShut = shouchaoShut(content, state, id, ctx.now);
  if (tideShut) return tideShut;
  // …and its first night, the 执事堂's errand (quests/guan.json, `shouchao.intro`): counted as a night of the tide — its pay,
  // night 1 held, the hourly tide begun — and the errand's count met.
  if (shouchaoFirst(content, state, id) && reopened(content, state, id, ctx.now)) {
    const r = shouchaoDone(state, content, ctx, id);
    if (!r.state) return r;
    const handed = advance(content, r.state, { kind: 'board', task: id }, ctx);
    return { state: r.state, result: { ...r.result, for: 'errand', ...(handed.length ? { handed } : {}) } };
  }
  const again = reopened(content, state, id, ctx.now);
  // A hosted game won today is counted wherever he stands when it is handed
  // in: the win was at the place (his 五子棋, 2026-09-23: a queued "go to 彭城"
  // ran before the win's turn, and the pay was refused at 彭城).
  // Kept across midnight: while the errand still asks for it, a win kept on
  // an empty pool counts whenever 体力 is back (the page says so).
  const wonHere = Boolean(t.hosted && state.wins?.[id] && errandWants(content, state, id));
  const stall = stallHere(content, state, id, ctx.now);
  if (!state.tasks[id] && !again && !hostedHere(content, state, id, ctx.now) && !catchHere(content, state, id) && !wonHere && !stall) return refuse('not-offered', null);
  if (!wonHere && !taskOpen(content, state, id, ctx.now)) return refuse('already-done', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state);
  delete s.wins[id];
  // For an errand, the errand pays — not the game or the task a second time.
  // A hosted game costs its minutes in 体力 (rewards.json stamina.cost.game `board`: the board's own, state.mjs boardCost —
  // Hanli 2026-11-04): taken as it is counted, and a win kept while the pool is empty is counted once it refills, the same day.
  if (again || (t.hosted && !stall)) {
    if (t.hosted) {
      const empty = spendStamina(content, s, ctx, 'game', 1, playedCost(content, s, id, t));
      if (empty) return empty;
    }
    // A board pays by its minutes (rules/playpay.mjs, Hanli 2026-10-27) — the errand it was for pays too; a 今 board pays the 今.
    const play = boardGrant(content, s, id, t, ctx.now, s.play_stars?.[id] ?? null);
    const paid = play ? payBoard(content, s, ctx, play) : null;
    if (play) playCounted(s, id, ctx.now);
    boardSettled(s, id);
    const handed = advance(content, s, { kind: 'board', task: id }, ctx);
    return { state: s, result: { ok: true, done: id, paid, gives: null, for: 'errand', ...(handed.length ? { handed } : {}) } };
  }
  // A board left and offered again (rules/skips.mjs) pays in full now — its passage was told the day it was left.
  const replayed = Boolean(state.tasks[id]?.replay);
  s.tasks[id] = { status: 'done', period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  // A game inside its scene's passage (`story_after`, 2026-10-14): the rest of the passage is the
  // scene's, owed the moment the game is counted — told right after it, before the choices.
  const here = sceneOf(content, s);
  // With two boards (batch two: 00-cave, 00-halfyear) the split belongs to the first in `show`; the second comes after the rest.
  // Read through its boards (rules/parts.mjs): each board owes the part after it.
  if (!replayed && here) owePart(s, here, id);
  const full = t.gives?.bag ? fullLine(s, [stow(content, s, t.gives.bag, 1, 'task')]) : null;
  const paid = pay(content, s, ctx, t.grant);
  boardPay(content, s, t, id, paid);
  // A thing the board hands over (the 踏马符 of 喂饭桶 · 一根银毛) is shown big as a story step's gain is (core.mjs resolve `gained`, Hanli 10-27/28).
  const gained = t.grant?.item || t.grant?.more ? gainsOf(t.grant, paid) : null;
  if (gained) s.gained = { n: (state.gained?.n ?? 0) + 1, scene: here?.id ?? null, ...gained };
  // …and by its minutes (rules/playpay.mjs, 2026-10-27): the story's board is a small game too, paid once.
  // Its 灵石 stays the first clear's grade (`boards`, boardPay above); the minutes pay its 修为.
  // A 今 board pays the 今 line's 修为 (rules/lines.mjs): `paid.line` names it, and its 修为 and levels are that line's.
  // Its first clear pays +50% (play_pay.xiuwei.difficulty.first_clear, 2026-11-02): never paid before (`boards_paid`).
  const playFull = replayed ? null : boardGrant(content, s, id, t, ctx.now, s.play_stars?.[id] ?? null, { first: !(state.boards_paid ?? []).includes(id) });
  const play = playFull?.progress ? { ...playFull, wealth: 0 } : null;
  if (play) {
    const more = payBoard(content, s, ctx, play) ?? {};
    if (more.line) paid.line = more.line;
    paid.progress = (paid.progress ?? 0) + (more.progress ?? 0);
    paid.wealth = (paid.wealth ?? 0) + (more.wealth ?? 0);
    if (more.levels?.length) paid.levels = [...(paid.levels ?? []), ...more.levels];
    if (more.hold) paid.hold = more.hold;
    if (more.converted) paid.converted = more.converted;
    playCounted(s, id, ctx.now);
  }
  // A board of the scene he stands in, its 修为 tallied to the scene's stretch (rules/cultivation.mjs): a marked scene's exit
  // pays no floor on top of it, and its 所得 shows it.
  if (here && !paid.line && sceneBoards(here).includes(id)) tallyBoard(s, here.id, paid);
  // A board's own 恩仇簿 line (`ledger`, as an exit writes it — 古六's 写信: 孙二狗's letter).
  const wrote = t.ledger ? writeLedger(content, s, t, ctx) : [];
  const handed = advance(content, s, { kind: 'board', task: id }, ctx);
  return { state: s, result: { ok: true, done: id, paid, gives: t.gives ?? null, line: pick(t.done_line, s.lang), ...(wrote.length ? { ledger: wrote } : {}), ...(full ? { pouch_full: full } : {}), ...(handed.length ? { handed } : {}) } };
}

/* No paid skip (Hanli's rule of 2026-11-03: every board has only ✕ and 留, and 「跳过没有奖励」 — a skip never pays stars or a
   grant). The 10-27 跳过 · 酬减半 for an errand's board (errandSkip, balance.json `play_pay.skip`) is gone (2026-11-04,
   Hanli at 执事堂's 象棋残局: 「点关闭, 结果给奖励了」 — its ✕ went in as that skip and paid half): `skip` or `leave` on an
   errand's board puts it down, nothing paid, the errand still open (he may drop the errand on the wall as ever). An older
   save's `board_losses` (the stuck count of 11-04's first cut) is read by nothing and loads as it is. */

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
  // `apart`: a chore paid on its own (chores.mjs ownOf) took no 修为 share of the day and counts in none.
  s.chores[id] = { period, paid_at: ctx.now.toISOString(), ...(ownOf(content, q) ? { apart: true } : {}) };
  const grant = choreGrant(content, q, state, ctx.now);
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
  // In minutes of income where it would have landed (batch 2: `ls` × I where he stands), or a number the rules built already.
  const cap = content.rewards.tables[grant.table]?.ls ?? 0;
  const n = Math.max(0, Math.round(grant.ls != null ? stonesAt(content, s, Math.min(grant.ls, cap)) : Math.min(grant.wealth ?? 0, stonesAt(content, s, cap))));
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
  // 灵石 is the 古's: a 今 board (or one won on 沈芒's line) pays the 今 its 修为 (rules/lines.mjs) and no 灵石 — found live
  // 10-22, 今三's chat paid 灵石 +5, and so did every 今 board past 入门 since the small-game pay (10-16).
  if (lineOfBoard(content, s, id)) return;
  const rank = boardRank(t, s.grades?.[id] ?? null, s.stars?.[id]);
  // Its rank's minutes of income × I where he stands (batch 2; balance.json `boards`, from master.economy.boards).
  const amount = Math.round(stonesAt(content, s, table[rank] ?? 0));
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
  // A word board told on his ask (rules/wordboard.mjs reveal) is over as a skip: no win comes after it.
  if (state.tasks?.[id]?.told) return refuse('told', null);
  // A board's own 跳过 sent as a win (grade `skipped`: an older phone app, any host) is the skip it is, never a win.
  if (winIsSkip(args)) return ownSkip(state, content, ctx, id);
  const inScene = sceneOf(content, state)?.exits.some(e => gameOf(e)?.id === id && gameOf(e).kind !== 'duel');
  if (!inScene && !taskOpen(content, state, id, ctx.now)) return shouchaoShut(content, state, id, ctx.now) ?? qiecuoShut(content, state, id, ctx.now) ?? refuse('not-here', null);
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
  // This win's own ★, for its pay by the minutes (rules/playpay.mjs): the best ever is the record, this one the pay.
  if (stars != null) s.play_stars = { ...s.play_stars, [id]: stars };
  else if (s.play_stars?.[id] != null) { const { [id]: _, ...rest } = s.play_stars; s.play_stars = rest; }
  // The game it was played as (`row`: the page's — an `alt` on a device with a camera, a games.json row or level id), for
  // its pay by that row's mechanic (rules/playpay.mjs playedRow). A row the task has no such game for is not kept.
  const row = args.row == null ? null : String(args.row);
  if (row && namedRow(content, id, row)) s.play_rows = { ...s.play_rows, [id]: row };
  else if (s.play_rows?.[id] != null) { const { [id]: _, ...rest } = s.play_rows; s.play_rows = rest; }
  // A board that climbs (rules/climb.mjs): the level he was dealt is behind him; the next deal is the one after.
  climbWon(s, content.tasks.tasks.find(t => t.id === id));
  // A board won gives the card its book action is (cards.json `from: {kind: 'beat', task}` —
  // 射鹿 → 一箭 · 偏左半寸, 吹鹅毛 → 吐纳). Won, never skipped: a skip pays nothing (rules/skips.mjs).
  const cards = grantFrom(content, s, 'beat', id, { how: 'beat', day: dayKey(ctx.now) });
  return { state: s, result: { ok: true, won: id, ...(graded ? { grade: graded.grade } : {}), ...(stars != null ? { stars } : {}), ...(cards.length ? { cards } : {}) } };
}

/* 留 on a board that cannot wait on a list — a 切磋 bout (its cooldown), a 秘境 room's (only inside its run), 兽潮's night, 本王考考你
   — does what ✕ does, and says so: never refused (a user's action is never gated), never kept where it could not be played. */
const UNKEPT = { zh: '这一局留不住，收起来了。', en: 'This one cannot be kept; it is put away.' };
function keepOrPut(state, content, ctx, id) {
  const t = taskOf(content, id);
  const put = (r) => (r.result.ok ? { ...r, result: { ...r.result, kept: null, say: pick(UNKEPT, state.lang) } } : r);
  if (t && isBout(content, id)) return put(qiecuoOver(state, content, ctx, id, 'skipped'));
  if (t && (t.mijing || isTide(content, id) || kaoHere(content, state, id, ctx.now))) return put(leaveBoard(state, content, ctx, id));
  return keepBoard(state, content, ctx, id);
}

/* `skip`: the story's board set aside (skipBoard), any board he may put down put down (leaveBoard). */
function skipOrLeave(state, content, ctx, id) {
  const story = skipBoard(state, content, ctx, id);
  return story.result.ok || !leaveOf(content, state, id) ? story : leaveBoard(state, content, ctx, id);
}
/* A board won for its errand: off 收着 if he kept it (rules/skips.mjs). */
function boardSettled(s, id) {
  if ((s.kept ?? []).some(e => e.task === id && !e.story)) s.kept = s.kept.filter(e => e.task !== id);
}

/* The lock (Hanli 11-03: 「跳过 still pays」 — a board's own 跳过 went in as a 1-star win, so a 古 board paid on a skip). */
export const winIsSkip = args => args?.grade === 'skipped' || args?.skipped === true || args?.skipped === 'true';
/* A board's own 跳过, wherever it was played: the story's (or one offered again) set aside for a later day (skips.mjs
   skipBoard: its `gives` only), any other — an errand's too — put down as 收手 (leaveBoard). Never a pay. */
export function ownSkip(state, content, ctx, id) {
  return skipOrLeave(state, content, ctx, id);
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
  // A 秘境探险 room's fight (rules/mijing.mjs): the run's own door and settle.
  if (isMijingFight(id)) return mijingDuel(state, content, ctx, args);
  const exit = sceneOf(content, state)?.exits.find(e => gameOf(e)?.id === id && gameOf(e).kind === 'duel');
  const haunt = !exit && id.startsWith('haunt:') ? encounterOf(content, state, ctx.now) : null;
  const qid = id.startsWith('quest:') ? id.slice(6) : null;
  const quest = qid && state.quests?.[qid] && !questDoneBefore(state, qid) ? questOf(content, qid) : null;
  const needs = quest ? countsOf(content, state, quest) : [];
  const index = needs.findIndex(n => !n.done);
  const step = index >= 0 ? errandLine(content, state, quest, needs, state.lang, ctx.now).steps[index] : null;
  const questGame = step?.at?.here && needs[index]?.kind === 'subdue' && creatureOf(content, needs[index].creature)
    ? { id, kind: 'duel', creature: needs[index].creature, quest: qid } : null;
  if (!exit && !(haunt && haunt.game.id === id) && !questGame) return refuse('not-here', null);
  if (haunt?.tamed) return refuse('tamed', null, { creature: haunt.creature });
  const game = exit ? gameOf(exit) : questGame ?? haunt.game, creature = creatureOf(content, game.creature);
  // A beast that is caught, not fought (`catch`), runs the moment it is struck at.
  if (haunt && !haunt.pool && creature.catch) return refuse('runs', pick(creature.runs, state.lang), { creature: haunt.creature, catch: creature.catch });
  const withdrawnLine = exit ? pick(exit.withdrawn, state.lang)
    : pick({ zh: `${pick(creature.name, 'zh')}退入林影，明日再来。`, en: `${pick(creature.name, 'en')} withdraws into the shadows; come back tomorrow.` }, state.lang);
  const s = clone(state);
  // A pool's fights are kept by the place, numbered through the day (world.mjs huntKey): fought again and again.
  const key = game.hunt ? huntKey(game.hunt) : game.quest ? id : creature.id, hunt = Boolean(game.hunt);
  const day = dayKey(ctx.now), today = s.duels?.[key];

  // ── 落子记下: the moves so far, kept with the open fight (Hanli 11-05: a cold reload at turn 10 began the fight over at
  // turn 1) — the door hands them back on resume, and the room replays them to stand where it stood. Nothing is settled.
  if (args.action === 'mark') {
    if (s.fight?.game !== id || today?.day !== day || today.outcome !== 'open') return refuse('not-started', null, { game: id });
    const picks = String(args.picks ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 400);
    s.fight = { ...s.fight, picks };
    return { state: s, result: { ok: true, marked: picks.length } };
  }
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
    // Every attempt costs a card fight's minutes, a story fight's too (Hanli 2026-11-04: 「剧情里的战斗还是扣体力吧」);
    // spent, the story still walks on past it (its ✕ · 留, rules/skips.mjs).
    if (!resuming) {
      const empty = spendStamina(content, s, ctx, 'duel');
      if (empty) return empty;
    }
    const n = hunt && today?.day === day ? today.n ?? 0 : 0;
    // 丹囊: the pills he picked at the door (`pills`, ids comma-separated; '' carries none) — kept as his
    // pick for the next door, as many as the bag holds (cards.mjs pouchFor).
    if (args.pills != null && !resuming) s.pill_pick = String(args.pills).split(',').map(x => x.trim()).filter(id => fightPill(content, id)).slice(0, POUCH_MAX);
    // A pool's matched beast (rules/match.mjs) stands through its own fight: the settle finds the same one.
    s.duels = { ...s.duels, [key]: { day, outcome: 'open', ...(hunt ? { n, ...(today?.last ? { last: today.last } : {}), ...(today?.day === day && today.stand ? { stand: today.stand } : {}), ...(today?.day === day && today.streak ? { streak: today.streak } : {}) } : {}) } };
    // While this is set, Ling advances NOTHING (SKILL.md § 斗法): she knows
    // from the save, not from a message, because a message can be lost.
    s.fight = resuming ? s.fight : { game: id, creature: creature.id, at: ctx.now.toISOString() };
    // The whole setup is kept with it, so the settle replays what the page
    // is handed now (an older save's open fight takes it on resume).
    if (!s.fight.setup) s.fight.setup = fightSetup(content, s, foeOf(content, game), ctx.now, id, game.deal, readOf(s, game));
    const brief = duelBrief(content, s, game, ctx.now, { door: true });
    // Resumed: the moves already made, for the room to replay (games/kapai.js data.picks / brief.picks).
    const picks = resuming && s.fight.picks?.length ? { picks: [...s.fight.picks] } : {};
    return { state: s, result: { ok: true, started: id, ...(resuming ? { resumed: true } : {}), ...picks, duel: { ...brief, id, ...picks } } };
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
  // A pool's wins in a row (world.mjs poolRestLeft): it rests only after `rest_after` of them; a run that reached it
  // and rested begins again.
  // 妖兽出没 (rules/yaoshou.mjs): the batch's day share, read before this fight takes its slot (the last one completes it).
  const huntAt = hunt ? placeOf(content, game.hunt) : null, batchShare = hunt ? yaoshouShare(content, s, huntAt, ctx.now) : 1;
  // …its form rotates (rules/forms.mjs): a batch's fight fought as the duel is stamped so, the next may come as a wave.
  if (hunt && yaoshouBatch(content, s, ctx.now)?.up && yaoshouFought(content, s, huntAt, ctx.now)) stampForm(s, 'yaoshou', 'duel', ctx.now);
  const streakWas = hunt && (today.streak ?? 0) < restAfter(content, placeOf(content, game.hunt)) ? today.streak ?? 0 : 0;
  s.duels[key] = { day, outcome: played.outcome, ...(hunt ? { n: (today.n ?? 0) + 1, at: ctx.now.toISOString(), streak: streakWas + (played.outcome === 'won' ? 1 : 0), last: rememberAt(content, today, creature.id, poolOf(content, placeOf(content, game.hunt))) } : {}) };
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
  // 妖兽出没 (a pool's beast won) may drop a 秘境令 (rules/mijing.mjs keyDrop, under the day's cap).
  const ling = won && haunt?.pool && !game.run ? keyDrop(content, s, ctx, 'yaoshou') : null;
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
  const dropped = pays && !game.quest ? drop(content, s, creature, ctx.now, { loot: hunt || Boolean(haunt) }) : [];
  const card = pays && !game.quest ? winCard(content, s, creature, ctx.now) : null;
  if (card) dropped.push(card);
  const t = content.rewards.tables.haunt;
  // The same beast beaten again the same day pays the play rules' falling share (balance.json play_pay.replay:
  // 100 · 50 · 10%) — a pool fought without end is never a farm (Hanli 2026-10-27).
  const replay = haunt && pays ? fightReplay(content, s, creature.id, ctx.now) * batchShare : 1;
  const paid = haunt && pays ? pay(content, s, ctx, { table: 'haunt', progress: t.progress, ls: t.ls, share: replay }) : null;
  if (haunt && pays) playCounted(s, hauntPlayId(creature.id), ctx.now);
  const full = fullLine(s, dropped);
  // Not won: what beat him, and the ways to grow stronger now (rules/strengthen.mjs) — facts for 银月's
  // word and the result card's one button (Hanli 2026-10-27: a loss never strands him).
  const way = won || exit ? null : lossWay(content, s, ctx, game, setup, played);
  // A story fight (`retry`) not won is not over: the way on waits on its win, and it is fought again at once (look.mjs `again`).
  const again = game.retry && !won ? { again: true, story_open: true } : {};
  return { state: s, result: { ok: true, ...again, ...(way ? way : {}), outcome: played.outcome, game: id, say, ...(spent.length ? { spent: spent.map(sid => ({ id: sid, name: pick(cardCatalog(content)[sid]?.name, s.lang) ?? sid })) } : {}), you: played.you, foe: played.foe, turns: played.turn, ...(dropped.length ? { dropped } : {}), ...(firsts.first_met ? { first_met: true } : {}), ...(firsts.first_win ? { first_win: true } : {}), ...(hunt ? { tally: poolTally(content, s, placeOf(content, game.hunt), ctx.now) } : {}), ...(full ? { pouch_full: full } : {}), ...(handed.length ? { handed } : {}), ...(paid ? { paid, haunt: haunt.creature } : {}), ...(ling ? { key: ling } : {}) } };
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

/* 收着的棋局 taken up: here, or (`walk`, the page's 玩) walked to where it was kept and taken up there — one call, one
   answer (Hanli 11-05: 5–10 s behind 「…」 when the page walked, looked, took it up and looked again). */
function keptPlay(state, content, ctx, id, walk) {
  const open = s => taskOpen(content, s, id, ctx.now) || hostedHere(content, s, id, ctx.now);
  const here = playKept(state, content, ctx, id, open(state));
  if (here.result.ok || !walk || here.result.refused !== 'not-here' || !here.result.place) return here;
  const went = move(state, content, ctx, { place: here.result.place });
  if (!went.result.ok) return went;
  const s = went.state ?? state, took = playKept(s, content, ctx, id, open(s));
  return took.result.ok ? { state: took.state, result: { ...took.result, walked: here.result.place } } : took;
}

/* ── A fight open: the world holds still ──
   While a fight is open (state.fight) the verbs that change the world are
   refused `in-a-fight` — Ling was told so in SKILL.md, the rules never were,
   and a Move mid-fight left the fight unsettleable (review, 2026-09-24). The
   fight's own verbs stand: Duel settles it (or resumes it), Look, Show and the
   readers work. `true` holds the verb; a function holds only the calls it
   says. Anything not named is left alone. */
const FIGHT_HOLDS = {
  resolve: true, move: true, go: true, enter: true, leave: true, trade: a => a.action === 'buy', tale: a => !['info', 'seed'].includes(a.action),
  meet: true, tame: true, refine: true, task: a => a.action !== 'list',
  win: true, travel: true, build: true, load: true, make: true, amend: true, lundao: true, haggle: true, duizi: a => ['open', 'reverse'].includes(a.action),
  divine: true, fate: true, ring: true, greet: true, deck: true, yaoshou: a => a.action !== 'info', quest: a => !['info', 'kaifu'].includes(a.action), mijing: a => !['info', 'close'].includes(a.action ?? 'info'),
  seclude: a => a.action === 'enter',
};
/* A fight kept for later (留着以后玩) never freezes the pouch (Hanli 11-04: 狼 kept at 上山路, the 饭桶 refused 「斗法未完」):
   the bag, the 饭桶's feed and 穿戴 · 服用 · 卖 go on. Only what the open fight holds stays put — a 符 the door put in
   his hand (setup.you.extra) or a pill in its 丹囊 (setup.you.pouch) — refused `in-the-fight`: the settle takes them. */
const FIGHT_ITEMS = {
  bag: a => [a.id, a.take], trade: a => [a.id],
  fantong: a => (a.action === 'feed' ? (Array.isArray(a.ids) ? a.ids : String(a.ids ?? a.id ?? '').split(',')) : []),
};
const IN_THE_FIGHT = { zh: '这件在{name}的斗法里用着', en: 'That is in use in the fight with {name}' };
const FIGHT_OPEN = { zh: '{name}的斗法还开着', en: 'The fight with {name} is still open' };
const heldByFight = fight => new Set([...(fight?.setup?.you?.extra ?? []), ...(fight?.setup?.you?.pouch ?? []).map(p => p?.id ?? p)].map(String));
function fightName(content, state) {
  const f = state.fight, c = content && f?.creature ? creatureOf(content, f.creature) : null;
  return pick(c?.name, state.lang) ?? f?.creature ?? '';
}
export function fightHold(state, verb, args = {}, content = null) {
  if (!state?.fight) return null;
  const say = (t) => (fightName(content, state) ? t[state.lang === 'en' ? 'en' : 'zh'].replace('{name}', fightName(content, state)) : null);
  const items = FIGHT_ITEMS[verb]?.(args) ?? [];
  const held = heldByFight(state.fight);
  if (items.some(id => id && held.has(String(id).trim()))) return refuse('in-the-fight', say(IN_THE_FIGHT), { game: state.fight.game });
  const hold = FIGHT_HOLDS[verb];
  if (!hold || (typeof hold === 'function' && !hold(args))) return null;
  // Named, so a card that says it is never a bare 「斗法未完」: whose fight, and the page's way back to it is `game`.
  return refuse('in-a-fight', say(FIGHT_OPEN), { game: state.fight.game });
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
  const key = f.game?.startsWith('quest:') ? f.game : f.creature;
  const was = s.duels?.[key];
  if (was?.outcome === 'open') s.duels[key] = { ...was, outcome: 'withdrew' };
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
  if (!cfg || !hostedHere(content, state, 'lundao', ctx.now)) return refuse('not-here', pick({ zh: '这里没有可论道的人。', en: 'There is no one here to debate.' }, lang));
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

/* ── 妖兽出没's fight as a wave (rules/forms.mjs) ── */
/* Won: the duel's settle for a pool beast won, played as the wave — the batch's slot, the pool's record, the 图鉴, the errands
   that count the beast, its drops and card, the 秘境令's chance and the haunt table's pay × the beast's day share × the
   batch's share (tasks.mjs duel above, the same lines); 体力 is the wave's own minutes, as a board's. */
function yaoshouWaveDone(state, content, ctx, id) {
  const f = yaoshouFormOf(content, state, ctx.now);
  if (f?.form !== 'wave') return refuse('not-here', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const t = taskOf(content, id), s = clone(state), now = ctx.now, day = dayKey(now);
  delete s.wins[id];
  const empty = spendStamina(content, s, ctx, 'game', 1, boardCost(content, 'game', (content.games?.games ?? []).find(g => g.id === t.game && !g.cut && !g.replaced) ?? { id: t.game }));
  if (empty) return empty;
  const place = placeOf(content, s.place), cid = f.e.creature.id, creature = creatureOf(content, cid);
  const batchShare = yaoshouShare(content, s, place, now);
  yaoshouFought(content, s, place, now);
  waveSettled(content, s, place, cid, 'won', now);
  const firsts = meetBeast(s, cid, true, now);
  const handed = advance(content, s, { kind: 'subdue', creature: cid }, ctx);
  s.hunted = { ...s.hunted, [place.id]: (s.hunted?.[place.id] ?? 0) + 1 };
  const ling = keyDrop(content, s, ctx, 'yaoshou');
  const dropped = drop(content, s, creature, now, { loot: true });
  const card = winCard(content, s, creature, now);
  if (card) dropped.push(card);
  const table = content.rewards.tables.haunt;
  const paid = pay(content, s, ctx, { table: 'haunt', progress: table.progress, ls: table.ls, share: fightReplay(content, s, cid, now) * batchShare });
  playCounted(s, hauntPlayId(cid), now);
  s.tasks[id] = { status: 'done', period: day, done_at: now.toISOString() };
  const full = fullLine(s, dropped);
  return { state: s, result: { ok: true, done: id, form: 'wave', creature: cid, paid, haunt: cid, ...(dropped.length ? { dropped } : {}), ...(firsts.first_met ? { first_met: true } : {}), ...(firsts.first_win ? { first_win: true } : {}), ...(handed.length ? { handed } : {}), ...(full ? { pouch_full: full } : {}), ...(ling ? { key: ling } : {}), tally: poolTally(content, s, place, now), gives: null, line: pick(t.done_line, s.lang) } };
}
/* Lost or put down: the batch's fight is over, unpaid — the wave's minutes taken when lost, as a board's. */
function yaoshouWaveOver(state, content, ctx, id, action) {
  const f = yaoshouFormOf(content, state, ctx.now);
  if (f?.form !== 'wave') return refuse('not-here', null);
  const t = taskOf(content, id), s = clone(state), now = ctx.now, place = placeOf(content, s.place);
  delete s.wins?.[id];
  const before = s.stamina;
  if (action === 'lost') spendStamina(content, s, ctx, 'lost', 1, boardCost(content, 'game', (content.games?.games ?? []).find(g => g.id === t.game && !g.cut && !g.replaced) ?? { id: t.game }));
  yaoshouFought(content, s, place, now);
  waveSettled(content, s, place, f.e.creature.id, action === 'lost' ? 'lost' : 'withdrew', now);
  s.hunt_losses = { ...s.hunt_losses, [place.id]: (s.hunt_losses?.[place.id] ?? 0) + 1 };
  return { state: s, result: { ok: true, ...(action === 'lost' ? { lost: id } : { left: id }), form: 'wave', creature: f.e.creature.id, stamina: Number.isFinite(before) && Number.isFinite(s.stamina) ? before - s.stamina : 0 } };
}
/* The pool's day record as a duel's settle writes it (the next beast, the streak), and the form stamped. Mutates `s`. */
function waveSettled(content, s, place, cid, outcome, now) {
  const key = huntKey(place.id), day = dayKey(now), today = s.duels?.[key]?.day === day ? s.duels[key] : null;
  const streakWas = (today?.streak ?? 0) < restAfter(content, place) ? today?.streak ?? 0 : 0;
  s.duels = { ...s.duels, [key]: { day, outcome, n: (today?.n ?? 0) + 1, at: now.toISOString(), streak: streakWas + (outcome === 'won' ? 1 : 0), last: rememberAt(content, today ?? {}, cid, poolOf(content, place)) } };
  stampForm(s, 'yaoshou', 'wave', now);
}

export { catchHere, doneThisPeriod, errandAsking, gameLevel, hostedHere, stallHere, lundaoBrief, lundaoForm, lundaoName, questCheck, questDone, reopened };
