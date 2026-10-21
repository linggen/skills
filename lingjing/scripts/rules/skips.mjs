// rules/skips.mjs — a story board left, and offered again later (Hanli, 2026-10-15).
// Part of the rules engine; rules.mjs is its one door (through Task: skip · replay · later).
//
// His ruling, all of it:
//   1. 「跳过这个按钮不要一开始就显示, 玩家卡住了才显示」 — the page's gate (scripts/stuck.js);
//   2. 「跳过没有奖励」 — a skip pays NOTHING: no grant, no grade, no mark. The story moves on
//      exactly as after a win (the task stands done, `skipped`, so every `needs.task` is met
//      and the scene's passage after the game is owed as after a win);
//   3. 「重玩也不应该放到面板里... 最好后面能自动触发重玩」 — no panel entry: a skipped board
//      comes back by itself on a later day, once the stage is idle, as an optional beat in the
//      world's words (Look's `replay`). Played and won, it pays the original grant, grade and
//      mark; declined, it comes back another day. At most one is offered a day;
//   4. 「对游戏进展要确保没有影响」 — skipping never hurts progress: a way on that waits on the
//      board's grade (`needs.grade`) opens for a skipped board whatever the grade (core.mjs
//      meets — his to choose), and what the story needs from a board is its `gives` (a thing,
//      handed over even on a skip), never its `grant` (the reward, withheld).
import { dayKey, periodKey, pick } from '../state.mjs';
import { clone, pay, refuse } from './core.mjs';
import { taskOf } from './errands.mjs';
import { sideLine } from './hui.mjs';
import { stow, storedLine } from './pouch.mjs';
import { owesTell } from './tell.mjs';
import { lockOf, sceneOf } from './world.mjs';

/* A story fight inside a key beat's lock may be left once stuck (Hanli 2026-10-21: 「OK, a」): inside a lock
   no shelf is reachable, so a weak hand with an empty 丹囊 had no way past a 试. From balance.json
   `lock_fight.losses` fights of it not won (lost or run dry — tasks.mjs keeps `fight_losses`), 「算了，往下走」
   walks the way on a win would take, paying nothing (core.mjs resolve `pass`). Never outside a lock. */
export const lockLosses = content => content.balance?.lock_fight?.losses ?? null;
export function fightStuck(content, state, game) {
  if (game?.kind !== 'duel' || state.wins?.[game.id] || !lockOf(content, state)) return false;
  const n = lockLosses(content);
  return n != null && (state.fight_losses?.[game.id] ?? 0) >= n;
}

/* A scene's boards, in the order they are played (its `show`). */
export const sceneBoards = scene => (scene?.show ?? []).filter(c => c.card === 'board').map(c => c.id);
/* A board over for the story — won and counted, or skipped. */
export const boardOver = (state, id) => state.tasks?.[id]?.status === 'done';
export const skippedBoard = (state, id) => Boolean(state.tasks?.[id]?.skipped);

/* The line a scene is told on: a 今 interlude's own, else the book's (null). */
const lineAt = (content, scene) => (scene ? sideLine(content, scene) ?? null : null);

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
  const day = dayKey(ctx.now);
  delete s.wins?.[id];
  s.tasks[id] = { status: 'done', skipped: true, period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  // The rest of the scene's passage, owed after its first board — as after a win (tasks.mjs taskDone).
  if (!again && scene?.story_after && order[0] === id) s.tell_owed = [...(s.tell_owed ?? []), `after/${scene.id}`];
  // Kept to be offered again: where it was left, on which line, on which day.
  // A board offered again and left again keeps where it was first left.
  const from = again ? held.from ?? {} : { scene: scene?.id ?? null, line: lineAt(content, scene) };
  s.skipped = [...(s.skipped ?? []).filter(e => e.task !== id), { task: id, scene: from.scene ?? null, line: from.line ?? null, day }];
  // A thing the story needs from the board (`gives`) is handed over all the same; the reward is not.
  const full = t.gives?.bag ? storedLine(s, [stow(content, s, t.gives.bag)]) : null;
  return { state: s, result: { ok: true, skipped: id, paid: null, gives: t.gives ?? null, ...(full ? { pouch_full: full } : {}) } };
}

/* The skipped board due to be offered again now, or null: one left on an earlier day, not put
   off today, on the line the story stands on, while the stage is idle — no fight, no 闭关, no
   passage owed, no board of the scene's still open, no fight of the scene's still to fight, and
   none offered again already today. The oldest first. */
export function replayDue(content, state, now) {
  const list = state.skipped ?? [];
  if (!list.length || state.fight || state.seclusion) return null;
  const today = dayKey(now);
  if (state.replay_day === today) return null;
  if (Object.values(state.tasks ?? {}).some(t => t.replay && t.status === 'offered')) return null;
  if (owesTell(content, state)) return null;
  const scene = sceneOf(content, state);
  if (sceneBoards(scene).some(b => !boardOver(state, b))) return null;
  if ((scene?.exits ?? []).some(e => e.game?.kind === 'duel' && !state.wins?.[e.game.id])) return null;
  const line = lineAt(content, scene);
  return list.find(e => e.day < today && e.later !== today && (e.line ?? null) === line && taskOf(content, e.task)) ?? null;
}

/* What Look carries of it: the board, and the world's line that offers it — the task's own
   (`replay`), else one made from its title. */
export function replayBrief(content, state, now) {
  const due = replayDue(content, state, now);
  if (!due) return null;
  const t = taskOf(content, due.task), lang = state.lang;
  const title = pick(t.title, lang);
  const line = pick(t.replay, lang) ?? (lang === 'en' ? `"${title}" — left unfinished that time. Try it again?` : `「${title}」——那一回，没走完。再试一回？`);
  return { task: due.task, title, line, ...(t.game ? { game: t.game } : {}) };
}

/* 再试一回: the board offered again stands open, as on the day it was first offered — its win
   is counted and paid as any (tasks.mjs taskDone), grade and mark with it. */
export function replayBoard(state, content, ctx, id) {
  const due = replayDue(content, state, ctx.now);
  if (!due || due.task !== id) return refuse('not-due', null);
  const s = clone(state);
  s.tasks[id] = { status: 'offered', replay: true, from: { scene: due.scene ?? null, line: due.line ?? null } };
  s.skipped = (s.skipped ?? []).filter(e => e.task !== id);
  s.replay_day = dayKey(ctx.now);
  return { state: s, result: { ok: true, replay: id } };
}

/* 改日: put off — it comes back another day. */
export function laterBoard(state, content, ctx, id) {
  const due = replayDue(content, state, ctx.now);
  if (!due || due.task !== id) return refuse('not-due', null);
  const s = clone(state), today = dayKey(ctx.now);
  s.skipped = (s.skipped ?? []).map(e => (e.task === id ? { ...e, later: today } : e));
  s.replay_day = today;
  return { state: s, result: { ok: true, later: id } };
}
