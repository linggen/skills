// rules/climb.mjs — a board that climbs: each time it is dealt, the next level of its game after the last one he won
// (Hanli 10-20: the 秘境's 撒豆成兵 and short 守炉 — a new, harder level each time he meets the game there).
// Part of the rules engine; rules.mjs is its one door.
//
// A task's `climb` lists the levels its game deals, easiest first (each one the game's own `deal.lv`: a number or
// a level id). The save keeps, per game, how far up he has won (`climb: { <game>: n }`) — tasks that share a game
// share the count, so the story's 撒豆成兵 counts toward the run's. He is dealt the level after it, the last once
// the list is climbed; a loss deals the same level again. The level comes with only the beasts the book has shown
// him by his 回 (rules/reveal.mjs, Hanli 10-21: 鬿雀 only from 古八) — `deal.over`, when one must stand aside.
// Past the top (every rung won), a task may declare `climb_top`: layouts as hard as its last rung, one a day by the day
// and the save's seed, walked round in a seeded order so no layout comes two days running (Hanli's rule, 10-27: levels
// never repeat; the coordinator's ruling for him that night). Without it the last rung is dealt again, as before.
// Nothing here names a game: the data declares it.
import { dayKey, seedOf } from '../state.mjs';
import { revealedOver } from './reveal.mjs';

/* FNV-1a and a final mix (rules/rotation.mjs's): the order a save walks its top layouts in. */
function mix(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/* The local calendar day as a number (dayKey's day). */
const dayNumber = now => { const [y, m, d] = dayKey(now).split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };

/* The top layout a save is dealt today: its seeded order of `climb_top`, one a day. */
export function topLv(state, t, now = new Date()) {
  const top = t?.climb_top ?? [];
  if (!top.length) return null;
  const order = [...top].sort((a, b) => mix(`${seedOf(state)}|${t.id}|${a}`) - mix(`${seedOf(state)}|${t.id}|${b}`) || String(a).localeCompare(String(b)));
  return order[((dayNumber(now) % order.length) + order.length) % order.length];
}

/* The level a climbing task deals now: the next rung, else (every rung won) the day's top layout, else the last rung. */
export function climbLv(state, t, now = new Date()) {
  const list = t?.climb ?? [];
  if (!list.length) return null;
  const won = state.climb?.[t.game] ?? 0;
  return (won >= list.length ? topLv(state, t, now) : null) ?? list[Math.min(won, list.length - 1)];
}

/* A task's deal as Look hands it to the page: its own, with the level it climbs to — and over it, the beasts of his 回. */
export function dealtOf(content, state, t, now = new Date()) {
  if (!t?.climb?.length) return t?.deal ?? {};
  const lv = climbLv(state, t, now), over = revealedOver(content, state, t.game, lv);
  return { ...(t.deal ?? {}), lv, ...(over ? { over } : {}) };
}

/* Won: the level he was dealt is behind him (in place on `s`). */
export function climbWon(s, t) {
  const list = t?.climb ?? [];
  if (!list.length || !t.game) return;
  const at = Math.min(s.climb?.[t.game] ?? 0, list.length - 1);
  s.climb = { ...(s.climb ?? {}), [t.game]: Math.max(s.climb?.[t.game] ?? 0, Math.min(at + 1, list.length)) };
}
