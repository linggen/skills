// rules/pool.mjs — 小游戏池 and the 时辰 draw (Hanli 2026-11-02: 「可以, 按照你设计的做吧」).
// Part of the rules engine; rules.mjs is its one door.
//
// Every repeatable small game declares a pool row in the one registry (rules/aside.mjs PLAY_KINDS `pool`): where it
// is played (its tray entry's places, or anywhere), its gate (the entry exists only once the story opened it), its
// cooldown after a play, the 时辰 it leans to (a weight, never a lock) and its 体力 cost. Each 时辰 — two hours of the
// local clock, 子 from 23:00 — draws THREE of the pool, seeded by the save, the day and the 时辰: the phone and the Mac
// draw the same three and a reload never changes them. The row shows them one at a time, in the draw's order: the
// first not yet played, then the next once it is (Hanli 11-02); a 时辰 ending on one unplayed moves on to the next draw.
// A drawn game leaves the row once played or when the 时辰 ends;
// one played comes back to the pool only after its cooldown. The world's events (兽潮 · 妖兽出没 · 秘境 · 货郎, balance.json
// `events`) and the story's own boards keep their own clocks and are never drawn.
import { dayKey, seedOf } from '../state.mjs';
import { placeOf } from './world.mjs';
import { yiWeightOfEntry } from './fortune.mjs';
import { onCooldownReset } from './events.mjs';

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

/* A verb that plays a pool member: its id stamped on the save that verb wrote. Mutates `next`. */
export function stampPlay(kinds, content, state, next, verb, args, now) {
  for (const k of kinds) {
    const id = k.pool?.plays?.(verb, args, content, state);
    if (id) next.pool_played = { ...(next.pool_played ?? {}), [id]: now.toISOString() };
  }
}

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
export function drawPool(content, state, rows, kinds, now) {
  const sc = shichenOf(now), here = placeOf(content, state.place), plate = here?.plate?.id ?? null;
  const pools = new Map(kinds.filter(k => k.pool).map(k => [k.kind, k.pool]));
  // A kind may hold members and others (银月's: 对对子 and 出题 are drawn, 问卦 is not): a member is an entry its `row` answers.
  const members = rows.filter(e => pools.has(e.kind) && e.seg !== 'cool' && pools.get(e.kind).row(e));
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
  return { shichen: sc, drawn: drawn.map(d => ({ ...d.e, ...(d.played ? { played: true } : {}) })), members: new Set(members.map(e => e.id)), open };
}

/* The 体力卡 (test only) clears the pool's cooldowns too: every game played comes back to the draw at once. */
onCooldownReset('pool-played', (content, state) => {
  if (!state.pool_played || !Object.keys(state.pool_played).length) return false;
  delete state.pool_played;
  return true;
});
