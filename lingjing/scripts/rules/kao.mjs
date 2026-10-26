// rules/kao.mjs — 本王考考你: whenever 银月 is awake, she has him draw a thing they have met together
// and names it (Hanli 10-19: 「ai游戏放到游戏中吧……但要结合剧情」, 「AI猜都是Yinyue猜」). At any hour since
// 2026-10-26 (「好, 按这样改」: a clock window players miss): a daily allowance, no night window.
// Part of the rules engine; rules.mjs is its one door.
//
// A light offer (its board stands only on an empty stage, as 二十问 does — stage.mjs), after 入门 only
// (the 灵石 are the story's then), at most the task's `per_day` rounds a calendar day, each counted as it
// begins (`kao open`: the page's tap, a look's tokens are spent from there), whatever its end. The word
// is the rules': one of games.json drawguess `met`, open once the save has passed its `after` scene or
// walks with its `cast` beast, one not yet drawn today, a word never cleared first. The page is the
// only witness to the picture named (as for every board): its win counted (`task done`) pays a word's
// FIRST clear only, by the looks it took (balance.json `boards`: 1 look best, 2 good, more plain).
import { dayKey, pick, seedOf } from '../state.mjs';
import { clone, refuse, spendStamina } from './core.mjs';
import { herNear } from './companion.mjs';
import { isLocked } from './locks.mjs';
import { hashOf } from './travel.mjs';
import { passed } from './world.mjs';

const kaoTask = content => (content.tasks?.tasks ?? []).find(t => t.kao) ?? null;
const metWords = content => (content.games?.games ?? []).find(g => g.id === 'drawguess' && g.data?.met)?.data.met ?? [];

/* Today's rounds (a calendar day, `dayKey`); a save from before 2026-10-26 kept them by `night`. */
const today = (state, now) => ((state.kao?.day ?? state.kao?.night) === dayKey(now) ? state.kao : null);
const capOf = t => t.per_day ?? 3;

/* Whether she may set him one now: any hour, she beside him on her own line — from the 木牌 too: the
   round wakes her (rules/hergame.mjs) — after 入门, out of any instance, run or fight. */
function kaoUp(content, state, now) {
  return Boolean(kaoTask(content)) && herNear(content, state)
    && !isLocked(content, state, 'wealth') && !state.sealed && !state.rerun && !state.fight;
}

/* The things they have met together, as the save stands. */
export function kaoWords(content, state) {
  return metWords(content).filter(w => (!w.after || passed(content, state, w.after)) && (!w.cast || (state.cast ?? []).includes(w.cast)));
}

/* The day's next word: not drawn today, a word never cleared first; seeded by day, save and round. */
function nextWord(content, state, day, n) {
  const all = kaoWords(content, state), drawn = new Set((state.kao?.day ?? state.kao?.night) === day ? state.kao.drawn ?? [] : []);
  const cleared = new Set(state.kao_cleared ?? []);
  const left = all.filter(w => !drawn.has(w.zh));
  const fresh = left.filter(w => !cleared.has(w.zh));
  const pool = fresh.length ? fresh : left.length ? left : all;
  return pool.length ? pool[hashOf(`${day}|${seedOf(state)}|kao|${n}`) % pool.length] : null;
}

/* Look's task list: the board offered while she may set one and the day has rounds left — or one
   is under way (it stands until it ends, whatever the cap). */
export function kaoHosted(content, state, now) {
  const t = kaoTask(content);
  if (!t || !kaoUp(content, state, now)) return {};
  const k = today(state, now), cap = capOf(t);
  if (!k?.open && (k?.n ?? 0) >= cap) return {};
  if (!kaoWords(content, state).length) return {};
  return { [t.id]: { status: 'offered' } };
}
/* A round under way today: its win may be counted. */
export const kaoHere = (content, state, id, now) => kaoTask(content)?.id === id && Boolean(today(state, now)?.open);
/* For the Look row: rounds left today, and whether one is open. */
export function kaoBrief(content, state, now) {
  const t = kaoTask(content), k = today(state, now);
  return t ? { left: Math.max(0, capOf(t) - (k?.n ?? 0)), open: Boolean(k?.open) } : null;
}

/* `kao open` — the page's tap as a round begins: counted, a game's 体力 spent, the word handed back. */
function open(state, content, ctx) {
  const t = kaoTask(content), lang = state.lang;
  if (!t || !kaoUp(content, state, ctx.now)) return refuse('not-here', null);
  const day = dayKey(ctx.now), k = today(state, ctx.now), cap = capOf(t);
  if ((k?.n ?? 0) >= cap) return refuse('cap', pick({ zh: `今天考够了（${cap} 回）。`, en: `Enough for today (${cap} rounds).` }, lang));
  const n = (k?.n ?? 0) + 1, word = nextWord(content, state, day, n);
  if (!word) return refuse('no-words', null);
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, 'game');
  if (empty) return empty;
  s.kao = { day, n, drawn: [...(k?.drawn ?? []), word.zh], open: { word: word.zh, at: ctx.now.toISOString() } };
  return { state: s, result: { ok: true, opened: n, left: cap - n, word } };
}

/* Its win handed in (tasks.mjs taskDone): the round closed, a word's first clear paid by its looks. */
export function kaoDone(state, content, ctx, id) {
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state), word = s.kao.open.word;
  delete s.wins[id];
  s.kao = { ...s.kao, open: null };
  const first = !(s.kao_cleared ?? []).includes(word);
  const paid = { progress: 0, wealth: 0 };
  if (first) {
    s.kao_cleared = [...(s.kao_cleared ?? []), word];
    const stars = s.stars?.[id] ?? 0, rank = stars >= 3 ? 'best' : stars === 2 ? 'good' : 'plain';
    const amount = content.balance?.boards?.[rank] ?? 0;
    if (amount) { s.wealth += amount; s.day.wealth += amount; paid.wealth = amount; paid.board = { rank, wealth: amount }; }
  }
  // Stars are this round's, not a best ever: the next word starts clean.
  if (s.stars) delete s.stars[id];
  return { state: s, result: { ok: true, done: id, word, first, paid, line: null, gives: null } };
}

/* The verb: `kao open` (the page's), `kao info` (anyone's). */
export function kao(state, content, ctx, args = {}) {
  const action = String(args.action ?? 'info');
  if (action === 'open') return open(state, content, ctx);
  if (action === 'info') return { state: null, result: { ok: true, kao: kaoUp(content, state, ctx.now) ? kaoBrief(content, state, ctx.now) : null } };
  return refuse('unknown-action', null, { actions: ['open', 'info'] });
}
