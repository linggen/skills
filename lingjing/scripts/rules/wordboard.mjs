// rules/wordboard.mjs — a 对话 board's word game while it is open (Hanli 2026-11-03, the 大比 final's 对子: 「chat里, ling
// 和yinyue说和花无关, 提示里又说是一种花」 · 「问ling或者yinyue, 她俩应该可以告诉吧?」). Part of the rules engine; rules.mjs is
// its one door.
//
// The page plays the game (games/jinchat-play.js) and judges every answer; Ling and 银月 only talk. They were never told
// what the page shows, so asked for a hint in the chat they guessed — and contradicted it. Now:
//   · the page keeps the open game on the save (`word_board`, the page's own verb, never logged): its kind, its face
//     (the 上联, the riddle, the idiom to follow), the hints it has shown so far — and the answer, which never leaves
//     the rules until he asks for it outright;
//   · Look hands Ling the face, the hints shown and one rule (`word_board`): never what the answer is or is not; a
//     hint reworded; Reveal only on an outright ask. Never the answer, never the choices (the answer is among them);
//   · Reveal (Ling's, and 银月's Whisper) hands the answer over and the board is TOLD: over for the story as a skip is
//     (rules/skips.mjs — its `gives` only, no grant, no grade, no stars; offered again on a later day), and the page,
//     watching the save, closes the board with the original shown.
// 二十问 has no hidden answer (the animal is in his head): never kept here. Agent's pick (Hanli delegated 11-03).
import { dayKey } from '../state.mjs';
import { clone } from './core.mjs';
import { skipBoard } from './skips.mjs';

export const WORD_KINDS = new Set(['riddle', 'couplet', 'chain']);
const refuse = (refused) => ({ state: null, result: { ok: false, refused, say: null } });
const listOf = (v) => {
  if (Array.isArray(v)) return v.map(String);
  try { const j = JSON.parse(String(v ?? '')); return Array.isArray(j) ? j.map(String) : []; } catch { return []; }
};

/* The story task a chat is played for (games.json: a `jinchat` row naming the chat in its `data.chat`): one he has
   not yet finished first, else the first. Null for a chat no task plays (the 游戏厅's own). */
export function taskOfChat(content, state, chat) {
  const ids = (content.games?.games ?? []).filter(g => g.id === 'jinchat' && g.task && g.data?.chat === chat).map(g => g.task);
  return ids.find(id => state.tasks?.[id]?.status !== 'done') ?? ids[0] ?? null;
}

/* The board as this day holds it, or null: kept from today only, and not one whose task was finished another way
   since (won, skipped) — a board told stays, for the page to close. */
export function openBoard(state, now) {
  const b = state.word_board;
  if (!b || b.day !== dayKey(now)) return null;
  // Opened at another scene (a reload left it, he walked on): not the board before him.
  if (b.scene !== undefined && b.scene !== (state.scene ?? null)) return null;
  if (!b.told && b.task && state.tasks?.[b.task]?.status === 'done') return null;
  return b;
}

/** The page's verb (`wordboard`, never Ling's): `open` (chat, kind, face, answer, src?) · `step` (hints — JSON, the
    hints shown in order — and for a chain the face and answer anew) · `close` · `peek` (the page's watch: told?). */
export function pageWordBoard(content, state, args, now) {
  const action = String(args.action ?? '');
  const b = state.word_board;
  if (action === 'peek') {
    const o = openBoard(state, now);
    const mine = o && (!args.chat || o.chat === String(args.chat));
    return { result: { ok: true, open: Boolean(mine), told: mine && o.told ? { answer: o.answer ?? '', ...(o.src ? { src: o.src } : {}) } : null } };
  }
  if (action === 'close') {
    if (!b || (args.chat && b.chat !== String(args.chat))) return { result: { ok: true } };
    const s = clone(state);
    delete s.word_board;
    return { keep: s, result: { ok: true } };
  }
  if (action === 'open') {
    const kind = String(args.kind ?? ''), chat = String(args.chat ?? '');
    if (!WORD_KINDS.has(kind) || !chat) return { result: { ok: false, refused: 'not-a-word-board' } };
    const s = clone(state);
    s.word_board = {
      chat, kind, task: taskOfChat(content, state, chat), face: String(args.face ?? ''), hints: listOf(args.hints),
      answer: String(args.answer ?? ''), ...(args.src ? { src: String(args.src) } : {}), scene: state.scene ?? null, day: dayKey(now), at: now.toISOString(),
    };
    return { keep: s, result: { ok: true } };
  }
  if (action === 'step') {
    if (!b || b.told || (args.chat && b.chat !== String(args.chat))) return { result: { ok: false, refused: 'no-word-board' } };
    const s = clone(state);
    s.word_board = { ...b, ...(args.hints != null && args.hints !== '' ? { hints: listOf(args.hints) } : {}),
      ...(args.face ? { face: String(args.face) } : {}), ...(args.answer ? { answer: String(args.answer) } : {}) };
    return { keep: s, result: { ok: true } };
  }
  return { result: { ok: false, refused: 'unknown-action' } };
}

const RULE = 'A word game is open on the stage (`face`); its answer is hidden and you do not know it — never say what it is, nor what it is not. Asked for a hint, reword one of `hints` (the page has shown them) and nudge. Only when the player asks outright for the answer, call {tool} and say it in your own words.';
const TOLD = 'Told: the answer was given (`answer`); the board is over, as a skip. Say it once if not yet said; never a reward.';

/** Look's `word_board` (and 银月's Progress, `tool` Whisper): the open game as they may know it — its kind, face, the hints shown, the rule; never the answer
    before it is told. */
export function wordBoardLook(state, now, tool = 'Reveal') {
  const b = openBoard(state, now);
  if (!b) return {};
  return { word_board: { kind: b.kind, face: b.face, hints: b.hints ?? [], ...(b.told ? { told: true, answer: b.answer, rule: TOLD } : { rule: RULE.replace('{tool}', tool) }) } };
}

/** Reveal (Ling's; 银月's Whisper): the open word game's answer, on his outright ask. The board is told — over for the
    story as a skip (its `gives` only, nothing paid; offered again another day) — where the story holds it; a board of
    no task (the 游戏厅's) or one this scene does not hold only hands the answer over. */
export function reveal(state, content, ctx) {
  const b = openBoard(state, ctx.now);
  if (!b) return refuse('no-word-board');
  const fact = { kind: b.kind, face: b.face, answer: b.answer, ...(b.src ? { src: b.src } : {}) };
  if (b.told) return { state: null, result: { ok: true, ...fact, told: b.task ?? true, again: true } };
  let s = clone(state), gives = null, skipped = false;
  if (b.task && state.tasks?.[b.task]?.status !== 'done') {
    const r = skipBoard(state, content, ctx, b.task);
    if (r.state) {
      s = r.state;
      gives = r.result.gives ?? null;
      skipped = true;
      s.tasks[b.task] = { ...s.tasks[b.task], told: true };
    }
  }
  s.word_board = { ...b, told: ctx.now.toISOString() };
  return { state: s, result: { ok: true, ...fact, told: b.task ?? true, ...(skipped ? { skipped: b.task, paid: null } : {}), gives } };
}
