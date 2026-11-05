// rules/pool.mjs — 小游戏池 and the 时辰 draw (Hanli 2026-11-02: 「可以, 按照你设计的做吧」).
// Part of the rules engine; rules.mjs is its one door.
//
// Every repeatable small game declares a pool row in the one registry (rules/aside.mjs PLAY_KINDS `pool`): where it
// is played (its tray entry's places, or anywhere), its gate (the entry exists only once the story opened it), its
// cooldown after a play, the 时辰 it leans to (a weight, never a lock) and its 体力 cost. Each 时辰 — two hours of the
// local clock, 子 from 23:00 — draws THREE of the pool, seeded by the save, the day and the 时辰: the phone and the Mac
// draw the same three and a reload never changes them. The row shows them one at a time, in the draw's order: the
// first not yet played, then the next once it is (Hanli 11-02); a 时辰 ending on one unplayed keeps it (2026-11-04, drawPool).
// A drawn game leaves the row once played or when the 时辰 ends;
// one played comes back to the pool only after its cooldown. The world's events (兽潮 · 妖兽出没 · 秘境 · 货郎, balance.json
// `events`) and the story's own boards keep their own clocks and are never drawn.
import { dayKey, seedOf } from '../state.mjs';
import { placeOf } from './world.mjs';
import { yiWeightOfEntry } from './fortune.mjs';

export const DRAW = 3;
/* The weights (agent's pick, Hanli delegated 11-02): not played in a day ×2, its 时辰's lean ×3, where he stands ×2,
   elsewhere on the same painted map (the 观) ×1.5. */
export const WEIGHT = { fresh: 2, lean: 3, here: 2, near: 1.5 };
const LATELY_MS = 24 * 3600_000;

/* The 时辰 of a moment: 0 子 (23–1) … 6 午 (11–13), 7 未 (13–15) … 11 亥 (21–23); its start, its end, and the day it
   belongs to (子 from 23:00 is the next day's first). */
export function shichenOf(now) {
  const h = now.getHours(), i = Math.floor(((h + 1) % 24) / 2);
  const start = new Date(now); start.setMinutes(0, 0, 0); start.setHours(h - ((h + 1) % 2));
  const end = new Date(start.getTime() + 2 * 3600_000);
  return { i, start, end, day: dayKey(new Date(start.getTime() + 3600_000)) };
}
/* Short names for the 时辰's lean: the twelve branches, 子 first. */
export const BRANCH = ['zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu', 'wei', 'shen', 'you', 'xu', 'hai'];

/* When a member was last played (`pool_played`, stamped as a verb plays it — rules/locks.mjs gated). */
export const playedAt = (state, id) => (state.pool_played?.[id] ? new Date(state.pool_played[id]) : null);

/* A verb that plays a pool member: its id stamped on the save that verb wrote — and, a win, on `pool_won` (kept apart:
   `pool_played` is the draw's rest, `pool_won` what he has won). Mutates `next`. */
export function stampPlay(kinds, content, state, next, verb, args, now) {
  for (const k of kinds) {
    const id = k.pool?.plays?.(verb, args, content, state);
    if (id) next.pool_played = { ...(next.pool_played ?? {}), [id]: now.toISOString() };
    const won = k.pool?.won?.(verb, args, content, state);
    if (won) {
      next.pool_won = { ...(next.pool_won ?? {}), [won]: now.toISOString() };
      // …and counted (`pool_wins`): a content pool deals its next by it (poolDeal). Counted on from an older save's
      // backfill, so the first win stamped here is never taken for his first.
      next.pool_wins = { ...(next.pool_wins ?? {}), [won]: winsOf(state, won) + 1 };
    }
  }
}

/* ── A board that plays the same each time leaves the pool once won (Hanli 2026-11-02, on 周衡's 灯谜 won four times:
   「这个人参的灯谜我是否玩过几次了?」) ──
   The pool keeps only boards that differ each play. A board says so in its data, read here in this order:
   · a content pool in its deal (`deal.pool` · `deal.riddles` · `deal.deck`, true or a list) — it varies, whatever else
     it declares: the hook a riddle pool lands on (周衡's 灯谜 comes back the day its deal carries one);
   · `varies: true | false` on the task — a module that deals by its seed or answers as a foe (五子 · 残局 · 配丹), or a
     fixed level said plainly;
   · a ladder (`climb` of two rungs or more, or `deal.levels` of two or more) — it varies.
   Nothing of these: it is one fixed board (tests/pool-varies.test.mjs: every hosted board says which, one way or another). */
const filled = v => (Array.isArray(v) ? v.length > 0 : Boolean(v));
export function boardVaries(t) {
  if (!t) return false;
  if (['pool', 'riddles', 'deck'].some(k => filled(t.deal?.[k]))) return true;
  if (typeof t.varies === 'boolean') return t.varies;
  return (t.climb?.length ?? 0) > 1 || (t.deal?.levels?.length ?? 0) > 1;
}
/* Whether a board has ever been won: the pool's own stamp, else what a win left before it (the best ★ `stars`, kept by
   the page's `win`; the task done in the story). */
export const wonEver = (state, id) => Boolean(state.pool_won?.[id] || state.stars?.[id] != null || state.tasks?.[id]?.status === 'done');
/* A board's wins so far: the count, else (a save from before it) one when it was ever won, else none. */
export const winsOf = (state, id) => state.pool_wins?.[id] ?? (wonEver(state, id) ? 1 : 0);
/* What a deal with a content pool carries (Look's dealOf, the mini-games dev's ask 11-02): the save's seed and `n`, his
   wins before this play — the board deals the pool's `n`th, so a replay never asks again what he has already won. A deal
   without a pool: nothing. */
export const poolDeal = (state, t) => (filled(t?.deal?.pool) ? { seed: seedOf(state), n: winsOf(state, t.id) } : {});

/* A number in (0, 1) from a key: the draw's coin for one member (FNV-1a, then a final mix — rotation.mjs's spread). */
function coin(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (((h ^ (h >>> 16)) >>> 0) + 1) / 4294967297;
}

/* The 时辰's draw over the pool's members (tray entries whose kind declares `pool`): each member's weight, the
   members cooling out, then the three with the highest seeded keys (Efraimidis–Spirakis: u^(1/w)) — so a member
   going out of the pool never reshuffles the others. A member played in this 时辰 still holds its place in the draw
   (it is `played`, out of the row) — else the row would deal another in its stead. A member whose round is still
   open (`resume`) is not out: drawn, it stays in the row unplayed; begun in an earlier 时辰, it is `open`, shown beside. */
/* A 时辰's game waits for him (Hanli 2026-11-04: 「冷却的小游戏」 — 「89 分后换」 changed it whether he had played or not;
   only once it is played comes the next). The row holds ONE game, saved as `pool_hold = { draw, game }` (the 时辰 its
   draw is of, and the game shown): it stands through every 时辰 until that game itself is played — playing another moves
   nothing. Played, the next unplayed of the same draw; all of it played, the draw of the 时辰 after it. rules.mjs pins
   the hold at its door (pinHold) after a pool play, and once for a save that has none (read from `legacyAnchor`).
   Answers the draw with `sc` (its 时辰), `shown` (the one game standing, or null) and `held` (an earlier 时辰's). */
export function drawPool(content, state, rows, kinds, now) {
  const cur = shichenOf(now), hold = state.pool_hold;
  const at = hold?.draw ? new Date(hold.draw) : legacyAnchor(state, cur, now);
  if (!at || Number.isNaN(at.getTime()) || at > now) return shownOf(drawAt(content, state, rows, kinds, cur), null, cur);
  const base = shichenOf(at), d = drawAt(content, state, rows, kinds, base);
  const pinned = hold?.draw && hold.game ? d.members.has(hold.game) && !playedSince(state, hold.game, base.start) ? hold.game : null : null;
  if (pinned || d.drawn.some(x => !x.played)) return shownOf(d, pinned, cur);
  // All of it played: the draw of the 时辰 after it (its own, once that 时辰 has come) — still the draw he is shown till then.
  const after = shichenOf(base.end);
  if (after.start > now || base.start >= cur.start) return shownOf(d, null, cur);
  return shownOf(drawAt(content, state, rows, kinds, after), null, cur);
}
const playedSince = (state, id, start) => { const t = playedAt(state, id); return Boolean(t && t >= start); };
const shownOf = (d, pinned, cur) => ({ ...d, shown: pinned ?? d.drawn.find(x => !x.played)?.id ?? null, ...(d.shichen.start < cur.start ? { held: true } : {}) });
/* A save with no hold (before 2026-11-04's pin): the 时辰 of its last pool play, else the one it began in, read once. */
function legacyAnchor(state, cur, now) {
  const times = Object.values(state.pool_played ?? {}).map(t => new Date(t)).filter(d => !Number.isNaN(d.getTime()) && d <= now);
  const origin = times.length ? new Date(Math.max(...times)) : state.created ? new Date(state.created) : null;
  return origin && !Number.isNaN(origin.getTime()) ? origin : cur.start;
}
/* The hold to write after a verb (rules.mjs): the row's draw and game as Look's `tray_hour` reads them now — when there
   is none yet, or the held game was played (a game played elsewhere, the held one standing, writes nothing). */
export function pinHold(state, before, hour) {
  if (!hour?.draw) return null;
  const hold = state.pool_hold;
  const playedHeld = hold?.game && state.pool_played?.[hold.game] && state.pool_played[hold.game] !== before?.pool_played?.[hold.game];
  if (hold && !playedHeld && hold.game) return null;
  const next = { draw: hour.draw, game: hour.game ?? null };
  return hold && hold.draw === next.draw && hold.game === next.game ? null : next;
}
/* One 时辰's own draw (what drawPool reads, the 时辰 it holds to). */
export function drawAt(content, state, rows, kinds, sc) {
  const here = placeOf(content, state.place), plate = here?.plate?.id ?? null;
  const pools = new Map(kinds.filter(k => k.pool).map(k => [k.kind, k.pool]));
  // A member its kind has retired (`retired`: a fixed board won) is out of the pool and out of the tray's rows — not left
  // standing beside the draw as a non-member would be.
  const retired = new Set(rows.filter(e => pools.get(e.kind)?.retired?.(e, content, state)).map(e => e.id));
  // A kind may hold members and others (银月's: 对对子 and 出题 are drawn, 问卦 is not): a member is an entry its `row` answers.
  const members = rows.filter(e => pools.has(e.kind) && !retired.has(e.id) && e.seg !== 'cool' && pools.get(e.kind).row(e));
  // Weighed as the 时辰 began (`sc.start`), so the draw holds all through it. A member played in it is weighed at the
  // most it could be — its key only rises, so it keeps its place and moves no other; one that has left the pool since
  // (its rounds used) still holds that place.
  const MAX = WEIGHT.fresh * WEIGHT.lean * WEIGHT.here * (content.qian?.weight ?? 2);
  const key = (id, w) => coin(`${seedOf(state)}|${sc.day}|${sc.i}|${id}`) ** (1 / w);
  const scored = members.flatMap((e) => {
    const p = pools.get(e.kind).row(e), at = playedAt(state, e.id);
    // A round under way (`resume`: 本王考考你's word, 对对子's couplet) is played but not over: it holds its slot and
    // stays in the row, 继续, until it ends — a reload mid-round never loses it (Hanli 11-02).
    if (at && at >= sc.start) return [{ e, played: !e.resume, key: key(e.id, MAX) }];
    // Played before this 时辰 and still inside its cooldown (as the 时辰 began): out of the pool — but a round begun
    // then and still open stands beside the draw (`open`), never dealt into it.
    if (at && sc.start - at < p.cooldown_min * 60_000) return [];
    const places = e.places ?? null;
    const w = (!at || sc.start - at > LATELY_MS ? WEIGHT.fresh : 1) * ((p.when ?? []).includes(BRANCH[sc.i]) ? WEIGHT.lean : 1)
      * (!places || places.includes(state.place) ? WEIGHT.here : plate && places.some(id => placeOf(content, id)?.plate?.id === plate) ? WEIGHT.near : 1)
      * yiWeightOfEntry(content, state, sc.start, e); // the day's 签: its 宜 kind weighs more (问签, Hanli 11-02)
    return [{ e, played: false, key: key(e.id, w) }];
  });
  const inRows = new Set(members.map(e => e.id));
  for (const [id, t] of Object.entries(state.pool_played ?? {})) if (!inRows.has(id) && new Date(t) >= sc.start) scored.push({ e: { id, gone: true }, played: true, key: key(id, MAX) });
  const drawn = scored.sort((a, b) => b.key - a.key || String(a.e.id).localeCompare(String(b.e.id))).slice(0, DRAW);
  const inDraw = new Set(drawn.map(d => d.e.id));
  const open = new Set(members.filter(e => e.resume && !inDraw.has(e.id)).map(e => e.id));
  return { shichen: sc, drawn: drawn.map(d => ({ ...d.e, ...(d.played ? { played: true } : {}) })), members: new Set(members.map(e => e.id)), open, retired };
}

