// rules/yaoshou.mjs — 妖兽出没: the beasts of 后山 · 上山路 come in batches (Hanli 2026-10-28: 「按你说的来」 — one of the
// three cooldown events, rules/events.mjs; the 斗法 主力 game at those pools). Part of the rules engine; rules.mjs is its one door.
//
// Before it the pools stood endlessly and rested 10 minutes after 5 wins in a row. Now the pools the event names
// (balance.json `events.yaoshou.pools`) hold a batch of `batch` fights; each fight settled there — won, lost or run
// dry — takes one; the last one taken (or the batch let go, `yaoshou skip`) completes it, and the next batch comes
// `every_h` hours later (world.mjs poolRestLeft reads the wait, so the encounter, 换一只, the match and the errands'
// hints all wait with it). Which beast stands is still matched to his hand (rules/match.mjs), 换一只 as before.
// Pay: a fight's own (tasks.mjs duel — the beast's replay share stays) × the event's day share: the day's first `full`
// batches in full, then play_pay.replay's falling share. Story fights are a scene's, never a pool's: untouched.
import { pick } from '../state.mjs';
import { refuse } from './core.mjs';
import { eventDone, eventKeep, eventOf, eventRec, eventShare, eventUp, eventWait } from './events.mjs';
import { allPlaces, placeName, placeOpen } from './world.mjs';

export const YAOSHOU = 'yaoshou';
const ev = content => eventOf(content, YAOSHOU);

/* A place whose pool the event holds. */
export const yaoshouPlace = (content, place) => Boolean(ev(content)) && (ev(content).pools ?? []).includes(place?.has?.pool);
/* Fights taken from the batch up now. */
const takenOf = state => eventRec(state, YAOSHOU)?.taken ?? 0;
/* The batch now: up (how many left of how many), or waiting (the minutes). Null where the world has no such event. */
export function yaoshouBatch(content, state, now) {
  const e = ev(content);
  if (!e) return null;
  const wait = eventWait(content, state, YAOSHOU, now);
  if (wait > 0) return { up: false, wait_min: Math.ceil(wait / 60_000) };
  return { up: true, left: Math.max(0, e.batch - takenOf(state)), of: e.batch, share: eventShare(content, state, YAOSHOU, now) };
}
/* The share a fight at the event's pools pays now (1 elsewhere). */
export const yaoshouShare = (content, state, place, now) => (yaoshouPlace(content, place) ? eventShare(content, state, YAOSHOU, now) : 1);

/* A fight settled at one of its pools: one taken; the last completes the batch. Mutates `state`. */
export function yaoshouFought(content, state, place, now) {
  const e = ev(content);
  if (!e || !yaoshouPlace(content, place) || !eventUp(content, state, YAOSHOU, now)) return null;
  const taken = takenOf(state) + 1;
  if (taken >= e.batch) return { done: true, rec: eventDone(state, YAOSHOU, now) };
  return { done: false, rec: eventKeep(state, YAOSHOU, { taken }) };
}

/* The places it is met at, open to him now. */
const placesOpen = (content, state, now) => allPlaces(content).filter(p => yaoshouPlace(content, p) && placeOpen(content, state, p, now));

/* Look's `waits` row inside the cooldown, while one of its pools is open to him: its title, the world's line, the minutes. */
export function yaoshouWait(content, state, now) {
  const e = ev(content), b = yaoshouBatch(content, state, now);
  if (!b || b.up || !placesOpen(content, state, now).length) return null;
  return { id: YAOSHOU, title: pick(e.title, state.lang) ?? YAOSHOU, shut: pick(e.shut, state.lang) ?? null, wait_min: b.wait_min };
}
/* Look's `yaoshou`: the batch up and where (said once on the 主页, never nudged), or the wait. Null where none of its pools is open. */
export function yaoshouBrief(content, state, now) {
  const e = ev(content), b = yaoshouBatch(content, state, now), at = b ? placesOpen(content, state, now) : [];
  if (!b || !at.length) return null;
  return { ...b, title: pick(e.title, state.lang) ?? null, ...(b.up ? { say: pick(e.open, state.lang) ?? null } : { shut: pick(e.shut, state.lang) ?? null }),
    places: at.map(p => placeName(content, state, p)), here: at.some(p => p.id === state.place) };
}

/* `yaoshou skip`: the batch let go — the clock starts now, as if fought. `yaoshou info`: the brief. */
export function yaoshou(state, content, ctx, args = {}) {
  const action = String(args.action ?? 'info'), now = ctx.now ?? new Date();
  if (action === 'info') return { state: null, result: { ok: true, yaoshou: yaoshouBrief(content, state, now) } };
  if (action !== 'skip') return refuse('unknown-action', null, { actions: ['info', 'skip'] });
  if (!ev(content)) return refuse('no-event', null);
  if (state.fight) return refuse('in-a-fight', null, { game: state.fight.game });
  if (!eventUp(content, state, YAOSHOU, now)) return refuse('shut', pick(ev(content).shut, state.lang) ?? null, { left_min: Math.ceil(eventWait(content, state, YAOSHOU, now) / 60_000) });
  const s = structuredClone(state);
  // Let go, not fought: the clock starts, the day's count of batches paid in full does not move.
  eventDone(s, YAOSHOU, now, { counted: false });
  return { state: s, result: { ok: true, skipped: YAOSHOU, wait_min: Math.ceil(eventWait(content, s, YAOSHOU, now) / 60_000) } };
}
