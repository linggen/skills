// rules/rotation.mjs — what turns with the day inside the walls: a place's boards and a wall's posted errands
// (Hanli 2026-10-27: 「目前就只能战斗刷经验吗? 好像没什么任务能做, 感觉卡在了一个小地图」 → 「可以, 加吧」).
// Part of the rules engine; rules.mjs is its one door.
//
// - **A place's boards** (places' `has.games_pool: {from, today}`): of the pool's boards, `today` stand there each
//   day beside the place's fixed `has.games`. The pick is the day's and the place's alone — every device, every
//   save, every reload agree, and a notice rebuilt from its id (errands.mjs noticeOf) finds the same set.
// - **A wall's errands** (quests/*.json `walls`: 执事堂's east wall, 07-第七回 「杂役，外门也揭得」): `posts` of its
//   pool go up each day, by the day and the save's seed. A posted errand's id says it all — `wall-<day>-<entry>` —
//   so the save holds nothing more than for an authored one; one left undone lapses with its day (lapseWall).
//
// Both are a window on a seeded order: day n takes the next `k` of it. A board pool turns through its order; a wall
// deals a fresh order every few days, its first day kept clear of the last day before it — never the same errand
// two days running. Nothing here names a place or a board: the data declares them.
import { dayKey, seedOf } from '../state.mjs';
import { allPlaces } from './world.mjs';

/* FNV-1a, then a final mix: a spread good enough that each id wins its share of days. */
function mix(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/* The local calendar day as a number, the same all day (state.mjs dayKey's day). */
export const dayNumber = now => Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5);
/* The list in an order fixed by `key`. */
const ordered = (list, key) => [...list].sort((a, b) => mix(`${key}|${a}`) - mix(`${key}|${b}`) || String(a).localeCompare(String(b)));

/* ── A place's boards ── */

/* The day's `today` of the pool: day n takes positions n·k … n·k+k−1 of the place's order, so a pool of two
   alternates and a pool of three walks round. All of it when it asks for as many as it holds. */
export function poolToday(place, now) {
  const pool = place?.has?.games_pool, from = pool?.from ?? [];
  const k = Math.max(0, Math.min(from.length, pool?.today ?? 1));
  if (k >= from.length) return [...from];
  const order = ordered(from, `games|${place.id}`), d = dayNumber(now);
  return Array.from({ length: k }, (_, i) => order[(d * k + i) % order.length]);
}

/* The boards a place hosts today: its fixed `has.games`, then the day's of its pool. */
export function gamesToday(content, place, now = new Date()) {
  if (!place) return [];
  return [...new Set([...(place.has?.games ?? []), ...poolToday(place, now)])];
}

/* Every board a place may ever host (fixed and pooled): for what lints it and for a sim that wants the whole map. */
export const gamesEver = place => [...new Set([...(place?.has?.games ?? []), ...(place?.has?.games_pool?.from ?? [])])];

/* Each place of the set whose boards turn, with the day's of its pool — Look's `boards` (the plate's captions; a fixed
   board, 周衡's 灯谜, is the place's every day and needs no caption). */
export function boardsToday(content, ids, now) {
  const want = new Set(ids);
  return allPlaces(content).filter(p => want.has(p.id) && p.has?.games_pool).map(p => ({ id: p.id, games: poolToday(p, now) }));
}

/* ── A wall's errands ── */

const WALL_ID = /^wall-(\d{8})-([a-z0-9-]+)$/;
const stampOf = now => dayKey(now).replaceAll('-', '');
const wallsOf = content => content.walls ?? [];

/* The wall an entry hangs on, and the entry. */
function entryOf(content, entryId) {
  for (const wall of wallsOf(content)) {
    const entry = (wall.pool ?? []).find(e => e.id === entryId);
    if (entry) return { wall, entry };
  }
  return null;
}

/* A posted errand, rebuilt from its id: the entry, with what the wall gives every tag (who, thread, work, pay). */
export function wallOf(content, id) {
  const [, day, entryId] = WALL_ID.exec(id ?? '') ?? [];
  const found = day ? entryOf(content, entryId) : null;
  if (!found) return null;
  const { wall, entry } = found;
  return {
    id, day, wall: wall.id, province: wall.province, title: entry.title, thread: entry.thread ?? wall.thread ?? 'chore',
    say: entry.say, done: entry.done, from: { place: wall.at, who: entry.who ?? wall.who },
    need: entry.need, work: entry.work ?? wall.work ?? null, grant: entry.grant ?? wall.grant,
  };
}
export const isWallId = id => WALL_ID.test(id ?? '');

/* The day's posts of one wall: `posts` of its pool. A cycle of m = ⌊n/k⌋ days deals its own order of the pool, day j
   of it the j-th k; a cycle's first day trades any tag it shares with the last day before it for one from its own
   middle days (never its last day's, which the next cycle reads raw), so no tag stands two days running. Needs n ≥ 3k (content.mjs lints it). */
export function wallToday(wall, state, now) {
  const ids = (wall.pool ?? []).map(e => e.id), k = Math.min(wall.posts ?? 3, ids.length);
  if (!k) return [];
  const m = Math.floor(ids.length / k), d = dayNumber(now), c = Math.floor(d / m), j = d - c * m;
  const deal = cyc => ordered(ids, `wall|${wall.id}|${seedOf(state)}|${cyc}`);
  // Every day of the cycle reads the same (traded) order, so a tag moved to its first day leaves the day it came from.
  const order = deal(c);
  if (m >= 3) {
    const before = deal(c - 1).slice((m - 1) * k, m * k);
    for (let i = 0; i < k; i += 1) {
      if (!before.includes(order[i])) continue;
      const swap = order.findIndex((x, at) => at >= k && at < (m - 1) * k && !before.includes(x));
      if (swap >= 0) [order[i], order[swap]] = [order[swap], order[i]];
    }
  }
  return order.slice(j * k, j * k + k);
}

/* The errands posted where he stands today (rebuilt quests), none taken yet or taken today. */
export function wallPosts(content, state, now) {
  const stamp = stampOf(now);
  return wallsOf(content).filter(w => w.at === state.place)
    .flatMap(w => wallToday(w, state, now).map(e => wallOf(content, `wall-${stamp}-${e}`)))
    .filter(Boolean);
}

/* An errand of an earlier day's wall — undone, it lapsed with its day; done, it is history the save need not keep. */
export const wallLapsed = (id, now) => { const m = WALL_ID.exec(id ?? ''); return Boolean(m) && m[1] !== stampOf(now); };

/* The save without an earlier day's wall errands (rules.mjs fits every save so, at the door): the same object when
   there is none, so a read writes nothing. A posted tag expires at day's end, taken or not. */
export function lapseWall(state, now) {
  const old = Object.keys(state?.quests ?? {}).filter(id => wallLapsed(id, now));
  if (!old.length) return state;
  const quests = { ...state.quests };
  for (const id of old) delete quests[id];
  return { ...state, quests };
}
