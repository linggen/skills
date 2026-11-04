// rules/skips.mjs — a board put away (✕) or kept for later (留) (Hanli, 2026-10-15; the way out 2026-11-03).
// Part of the rules engine; rules.mjs is its one door (through Task: skip · keep · kept-play · kept-drop · leave).
//
// His ruling, all of it:
//   1. 「跳过, 我们统一改成右上角的关闭按钮了. 不需要卡住, 直接就给这个关闭按钮」 (11-03) — 留 and ✕ on every board from
//      the first moment, no stuck wait (the page's bar, cards.js outHtml);
//   2. 「跳过没有奖励」 — a skip pays NOTHING: no grant, no grade, no mark. The story moves on
//      exactly as after a win (the task stands done, `skipped`, so every `needs.task` is met
//      and the scene's passage after the game is owed as after a win);
//   3. 「还是加一个按钮好一些, 可能用户想丢掉, 可能想以后玩」 (11-03) — ✕ puts it away for good; 留 keeps it on
//      收着的棋局 (below), never offered by itself; taken up and won, it pays its grant once;
//      ✕ never pays, on any board (2026-11-04, Hanli at 执事堂: 「点关闭, 结果给奖励了」 — under rule 2 here): an errand's
//      board is put down by it, the errand still open; the 10-27 跳过 · 酬减半 is gone (rules/tasks.mjs);
//   4. 「对游戏进展要确保没有影响」 — skipping never hurts progress: a way on that waits on the
//      board's grade (`needs.grade`) opens for a skipped board whatever the grade (core.mjs
//      meets — his to choose), and what the story needs from a board is its `gives` (a thing,
//      handed over even on a skip), never its `grant` (the reward, withheld).
import { periodKey, pick } from '../state.mjs';
import { clone, pay, refuse } from './core.mjs';
import { taskOf } from './errands.mjs';
import { stow, fullLine } from './pouch.mjs';
import { sceneOf } from './world.mjs';
import { afterKey, afterParts, partAfterBoard, sceneBoards } from './parts.mjs';

/* A story fight may be left from the first moment (Hanli 11-03: 「统一改成右上角的关闭按钮了. 不需要卡住, 直接就给这个关闭
   按钮」; every story fight since 2026-10-27: 「确保都能跳过去, 不会卡住游戏进程」): its card's 留 · ✕ walk the way on a win
   would take, paying nothing (core.mjs resolve `pass`) — no losses waited for. Named `stuck` on Look still (the phone reads it). */
export function fightStuck(content, state, game) {
  return game?.kind === 'duel' && !state.wins?.[game.id];
}

export { sceneBoards };
/* The part of the scene's passage a board leads into (rules/parts.mjs), owed the moment the board is over — won
   or left. A save that read the scene's passage whole before it was cut through its boards (`read_whole`, state.mjs
   v17) owes none: it has read them. */
export function owePart(s, scene, id) {
  if (partAfterBoard(scene, id) < 0 || s.read_whole === scene.id) return;
  // …and the parts after the boards already over beyond it (a save from before the cut played them in the old order): read on.
  const order = sceneBoards(scene);
  for (let k = partAfterBoard(scene, id); k >= 0 && k < afterParts(scene).length && (k === order.indexOf(id) || boardOver(s, order[k])); k += 1) {
    const key = afterKey(scene.id, k);
    if (!(s.tell_owed ?? []).includes(key)) s.tell_owed = [...(s.tell_owed ?? []), key];
  }
}
/* A board over for the story — won and counted, or skipped. */
export const boardOver = (state, id) => state.tasks?.[id]?.status === 'done';
export const skippedBoard = (state, id) => Boolean(state.tasks?.[id]?.skipped);

/* 「算了，往下走」: the scene's board (or a board offered again) left. */
export function skipBoard(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  const scene = sceneOf(content, state), order = sceneBoards(scene);
  const held = state.tasks?.[id];
  const again = held?.replay && held.status === 'offered';
  if (!order.includes(id) && !again) return refuse('not-here', null);
  if (held?.status === 'done') return refuse('already-done', null);
  if (order.slice(0, Math.max(0, order.indexOf(id))).some(b => !boardOver(state, b))) return refuse('board-waits', null);
  const s = clone(state);
  delete s.wins?.[id];
  s.tasks[id] = { status: 'done', skipped: true, period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  // The part of the scene's passage after this board, owed — as after a win (tasks.mjs taskDone).
  if (!again) owePart(s, scene, id);
  // Put away for good (Hanli 11-03: 「可能用户想丢掉, 可能想以后玩」): it never comes back by itself — 留 keeps it (keepBoard).
  // A thing the story needs from the board (`gives`) is handed over all the same; the reward is not.
  const full = t.gives?.bag ? fullLine(s, [stow(content, s, t.gives.bag, 1, 'task')]) : null;
  return { state: s, result: { ok: true, skipped: id, paid: null, gives: t.gives ?? null, ...(full ? { pouch_full: full } : {}) } };
}

/* 收手 — a board he opened by choice is left at any moment, costing nothing and paying nothing (Hanli, 2026-10-26, at
   兽潮's 先选一门本事: 「兽潮开始了, 不能退出来吗? 必须玩完才行?」). THE one rule of who may: the board's origin. The
   story's own boards — the scene shows it (`show`), or a way on needs it (`needs.task`) — keep their rule (「算了，往下走」
   once stuck, skipBoard); every other board (兽潮, a 秘境 run's, 本王考考你, a hosted or an errand's game, a board
   offered again) is his to put down. Look carries it per task (`leave`); the Mac's card and the phone's ✕ read it. */
export const storyBoard = (content, state, id) => {
  const scene = sceneOf(content, state);
  return sceneBoards(scene).includes(id) || (scene?.exits ?? []).some(e => e.needs?.task === id);
};
const replayHeld = (state, id) => Boolean(state.tasks?.[id]?.replay && state.tasks[id].status === 'offered');
export const leaveOf = (content, state, id) => Boolean(taskOf(content, id)) && (replayHeld(state, id) || !storyBoard(content, state, id));

/* `task --action=leave`: nothing is written for a board offered as it was (兽潮's night is not counted, no cooldown
   starts, no 灵气 is spent: those come with the win, tasks.mjs). A kept story board taken up again (playKept) and put
   down is over for the story, unpaid, for good — nothing handed over again (its `gives` went with the first). */
export function leaveBoard(state, content, ctx, id) {
  if (!taskOf(content, id)) return refuse('unknown-task', null);
  if (!leaveOf(content, state, id)) return refuse('story-board', null);
  if (!replayHeld(state, id)) return { state: null, result: { ok: true, left: id } };
  const t = taskOf(content, id);
  const s = clone(state);
  delete s.wins?.[id];
  // A kept board taken up again and put down: put away for good (留 keeps it again, keepBoard).
  s.tasks[id] = { status: 'done', skipped: true, period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, left: id, again: true } };
}

/* ── 收着的棋局 (Hanli 11-03: 「还是加一个按钮好一些, 可能用户想丢掉, 可能想以后玩」) ──
   Two ways out of every board, side by side from the first moment: ✕ puts it away (above: skipBoard · leaveBoard — an
   errand's put down, unpaid, since 2026-11-04), 留 keeps it for later; kept, Look marks the task `kept` and the stage
   never deals it by itself (stage.mjs). Kept, a story board goes on exactly as on ✕ — its `gives` handed over, no
   grant — and waits on `kept`; any other board is put down and waits there too. Never offered by itself: he takes one
   up from the 事 book or the tray's 「收着 n」. Taken up, it stands as on its first day; won, it pays its grant once and
   is off the list. At most KEPT_MAX; each may be dropped (丢). */
export const KEPT_MAX = 20;
export const KEPT_SAY = { zh: '收着的满了，先玩掉一局或丢一局。', en: 'Your kept games are full: play one or drop one first.' };
export const keptOf = state => state.kept ?? [];
export function keepBoard(state, content, ctx, id) {
  if (!taskOf(content, id)) return refuse('unknown-task', null);
  // Kept already and taken up again from the tray's 开局 (not 收着's 玩): 留 puts it down again, on the list as it was
  // (2026-11-04 — a refusal here left the card standing: 「点留没有用」 once more).
  if (keptOf(state).some(e => e.task === id)) return !storyBoard(content, state, id) && !replayHeld(state, id) ? { state: null, result: { ok: true, left: id, kept: id } } : refuse('already-kept', null);
  if (keptOf(state).length >= KEPT_MAX) return refuse('kept-full', pick(KEPT_SAY, state.lang));
  const story = storyBoard(content, state, id) || replayHeld(state, id);
  const base = story ? skipBoard(state, content, ctx, id) : { state: clone(state), result: { ok: true, left: id } };
  if (!base.result.ok) return base;
  const s = base.state;
  s.kept = [...keptOf(s), { task: id, story, scene: state.scene ?? null, place: state.place ?? null, chapter: state.chapter ?? null, at: ctx.now.toISOString() }];
  return { state: s, result: { ...base.result, kept: id } };
}
/* 丢: off the list, for good. */
export function dropKept(state, content, ctx, id) {
  if (!keptOf(state).some(e => e.task === id)) return refuse('not-kept', null);
  const s = clone(state);
  s.kept = keptOf(s).filter(e => e.task !== id);
  return { state: s, result: { ok: true, dropped: id } };
}
/* Taken up from the list: off it; a story board stands offered again (won, tasks.mjs taskDone pays it in full, once). A
   board the place hosts is the page's to open (its tray's 开局); one not open here is refused and stays kept. */
export function playKept(state, content, ctx, id, openHere) {
  const e = keptOf(state).find(x => x.task === id);
  if (!e) return refuse('not-kept', null);
  const story = state.tasks?.[id]?.status === 'done' && state.tasks[id].skipped;
  if (!story && !openHere) return refuse('not-here', pick({ zh: '这一局不在这里玩。', en: 'That game is not played here.' }, state.lang));
  const s = clone(state);
  s.kept = keptOf(s).filter(x => x.task !== id);
  if (story) s.tasks[id] = { status: 'offered', replay: true, kept: true, from: { scene: e.scene ?? null, line: null } };
  return { state: s, result: { ok: true, play: id, story: Boolean(story) } };
}
/* Look's `kept`: each kept board's title, where it was kept and when — the Mac's 事 book and tray chip, the phone's list. */
export function keptBrief(content, state, placeName) {
  return keptOf(state).filter(e => taskOf(content, e.task)).map(e => ({
    id: e.task, title: pick(taskOf(content, e.task).title, state.lang), where: placeName(e.place) ?? null, at: e.at, story: Boolean(e.story),
    // The task's own line for taking it up again (`replay`, the world's words: 「马家寿宴的锣鼓……再听一回？」).
    ...(taskOf(content, e.task).replay ? { line: pick(taskOf(content, e.task).replay, state.lang) } : {}),
  }));
}
