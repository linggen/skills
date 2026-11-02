// rules/events.mjs — 冷却事件: the world's cooldown-triggered events, one mechanism (Hanli 2026-10-28: 「按你说的来」 —
// exactly three, each on a fun 主力 game: 兽潮 (塔防), 比武切磋 (格斗), 妖兽出没 (斗法 at 后山 · 上山路)).
// Part of the rules engine; rules.mjs is its one door.
//
// The rules all three share, and nothing else (each event's own module says what it plays and where):
//   - the cooldown runs from completion — won, lost or skipped — never from when it came up;
//   - a waiting event waits and never stacks: away a day, he finds one, not sixteen;
//   - announced once (the tray or the 主页), never nudged again;
//   - the day's first `full` pay in full, then play_pay.replay's falling share (100 · 50 · 10%: the third half, the rest a tenth).
// Declared in balance.json `events.<id>` (`every_h`, `full`, and the event's own keys); the save keeps
// `state.events[<id>] = { at, day, n, ... }` — `at` the last completion, `n` how many were completed on `day`.
// Nothing here names an event: an id is handed in.
import { dayKey } from '../state.mjs';

const HOUR = 3600_000;

/* The event's row (balance.json `events.<id>`), or null where the world declares none. */
export const eventOf = (content, id) => content.balance?.events?.[id] ?? null;
/* What the save keeps of it. */
export const eventRec = (state, id) => state?.events?.[id] ?? null;

/* Milliseconds until it comes up again (0: up now) — from the last completion, `every_h` hours. */
export function eventWait(content, state, id, now) {
  const ev = eventOf(content, id), at = eventRec(state, id)?.at;
  if (!ev || !at) return 0;
  return Math.max(0, Date.parse(at) + ev.every_h * HOUR - now.getTime());
}
export const eventUp = (content, state, id, now) => Boolean(eventOf(content, id)) && eventWait(content, state, id, now) === 0;

/* How many were completed today. */
export const eventsToday = (state, id, now) => (eventRec(state, id)?.day === dayKey(now) ? eventRec(state, id).n ?? 0 : 0);

/* The share the one up now pays: the day's first `full` in full, then play_pay.replay's falling share. */
export function eventShare(content, state, id, now) {
  const full = eventOf(content, id)?.full ?? Infinity, fall = content.balance?.play_pay?.replay ?? [1];
  const today = eventsToday(state, id, now);
  return today < full ? 1 : fall[Math.min(today - full + 1, fall.length - 1)];
}

/* Completed (won, lost or skipped): the clock starts now, the day's count moves on, the event's own progress
   (what the event module kept inside the record) is let go. `counted: false` (one let go, never played): the clock starts,
   the day's count of those paid does not move. Mutates `state`. */
export function eventDone(state, id, now, { counted = true } = {}) {
  const n = eventsToday(state, id, now) + (counted ? 1 : 0);
  state.events = { ...state.events, [id]: { at: now.toISOString(), day: dayKey(now), n } };
  return state.events[id];
}

/* The event's own progress inside the one up now (a batch's fights …), kept on its record. Mutates `state`. */
export function eventKeep(state, id, fields) {
  state.events = { ...state.events, [id]: { ...eventRec(state, id), ...fields } };
  return state.events[id];
}

/* ── 重置冷却: every cooldown cleared at once (the test-only 体力卡, items.json `effect.reset: "cooldowns"` — Hanli
   2026-11-02: 「让体力卡重置冷却?」) ──
   One hook, nothing named here: an owner of a cooldown registers how its own clock is cleared, and
   resetCooldowns walks them all. A clear mutates `state`, answers truthy when it cleared something, and leaves the
   day's counts (a day limit — 对对子's three, 问卦's one, the 饭桶's `per_day`, an event's paid-in-full `n` — is no
   cooldown). Registered: `events` (below), `pool-rest` (world.mjs), `fantong` (rules/fantong.mjs), `breakthrough`
   (rules/breakthrough.mjs), `shouchao-clock` (rules/shouchao.mjs, its clock from before rules/events.mjs).
   A new cooldown registers itself where it lives: onCooldownReset('<name>', (content, state, now) => cleared). */
const RESETS = new Map();
export function onCooldownReset(name, clear) {
  RESETS.set(name, clear);
}
/* Every registered cooldown cleared now. Mutates `state`; answers the names that cleared something. */
export function resetCooldowns(content, state, now) {
  const cleared = [];
  for (const [name, clear] of RESETS) if (clear(content, state, now)) cleared.push(name);
  return cleared;
}
/* The cooldown names registered (tests, and a new owner checking it is in). */
export const cooldownOwners = () => [...RESETS.keys()];

/* The world's events: each up now. The record keeps only the day's count (`day`, `n`); its clock and its own
   progress (妖兽出没's `taken` — so a fresh batch stands now) are let go. A record that is missing is left missing. */
onCooldownReset('events', (content, state) => {
  let any = false;
  for (const id of Object.keys(content.balance?.events ?? {})) {
    const rec = eventRec(state, id);
    if (!rec) continue;
    state.events = { ...state.events, [id]: { day: rec.day ?? null, n: rec.n ?? 0 } };
    any = true;
  }
  return any;
});
