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
import { allPlaces, hiddenRoom, placeOpen, tooHard } from './world.mjs';

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

/* Each place of the set whose boards turn, with what stands there — Look's `boards` (the plate's captions, the phone's
   今日棋局; a fixed board, 周衡's 灯谜, is the place's every day and needs no caption): the plate's one deal (above),
   so the list holds one board until it is played (2026-11-04; it held one a place, seven at 沉鼎观, played or not). */
export function boardsToday(content, ids, now, state = null) {
  const want = new Set(ids);
  return allPlaces(content).filter(p => want.has(p.id) && p.has?.games_pool)
    .map(p => ({ id: p.id, games: state ? standingToday(content, state, p, now).filter(g => !(p.has.games ?? []).includes(g)) : poolToday(p, now) }))
    .filter(r => !state || r.games.length);
}

/* ── 今日棋局, dealt one at a time (Hanli 2026-11-04, the phone's list at 沉鼎观: seven boards no one had played, more
   every turn — 「只有之前的玩了才发新的」) ──
   What a place's pool turns up (poolToday above) is what it may host; what stands as practice is one board for the whole
   painted map he stands on (the plate, `place.plate.id`; a place off any plate is its own): the deal. It stays, day after
   day, until it is played — won, lost, put down (✕) or kept (留) — and only then is the next dealt (rules/locks.mjs
   `played` advances it). The deal walks a seeded order of every (place, board) of the plate's pools, the save's own,
   skipping places he may not walk to yet. Saved as `plate_deal[plate] = { n, at, game }` (n deals played); a save with
   none reads its first. A board an errand asks for is hosted where its errand puts it, dealt or not (tasks.mjs hostsNow). */
export const plateKey = place => place?.plate?.id ?? place?.id ?? null;
const walkable = (content, state, now) => p => !hiddenRoom(content, state, p) && placeOpen(content, state, p, now) && !tooHard(content, state, p);
/* The plate's (place, board) pairs in the save's order, those he can reach now. */
function dealOrder(content, state, key, now) {
  const can = walkable(content, state, now);
  const pairs = allPlaces(content).filter(p => p.has?.games_pool && plateKey(p) === key)
    .flatMap(p => (p.has.games_pool.from ?? []).filter(g => !(p.has.games ?? []).includes(g)).map(g => ({ at: p.id, game: g, ok: can(p) })));
  const order = ordered(pairs.map(x => `${x.at}:${x.game}`), `deal|${key}|${seedOf(state)}`);
  const ok = new Set(pairs.filter(x => x.ok).map(x => `${x.at}:${x.game}`));
  return order.filter(x => ok.has(x)).map(x => { const [at, game] = x.split(':'); return { at, game }; });
}
/* The board dealt on the plate now: the saved one while he can still reach it, else the n-th of the order. */
export function plateDealt(content, state, key, now) {
  if (!key) return null;
  const order = dealOrder(content, state, key, now);
  if (!order.length) return null;
  const d = state.plate_deal?.[key];
  const kept = d?.at && order.find(x => x.at === d.at && x.game === d.game);
  return kept ?? order[(d?.n ?? 0) % order.length];
}
/* The next deal, written on `next` (mutated) once the one standing is played: never the same pair twice running. */
export function advanceDeal(content, next, key, now) {
  const order = dealOrder(content, next, key, now);
  if (!order.length) return;
  const was = plateDealt(content, next, key, now), at = order.findIndex(x => x.at === was?.at && x.game === was?.game);
  const n = (next.plate_deal?.[key]?.n ?? 0) + 1, pick = order[(at + 1) % order.length];
  next.plate_deal = { ...(next.plate_deal ?? {}), [key]: { n, at: pick.at, game: pick.game } };
}
/* Does this verb play the board dealt where he stands? A task's win counted, loss, ✕ (`leave`/`skip`) or 留 of it. */
export function playsDeal(content, state, verb, args, now) {
  // …or a board's own 跳过 sent as a win (`grade: skipped`, tasks.mjs winIsSkip): a put-down too.
  const ownSkip = verb === 'win' && (args?.grade === 'skipped' || args?.skipped === true || args?.skipped === 'true');
  if (!ownSkip && (verb !== 'task' || !['done', 'lost', 'leave', 'skip', 'keep'].includes(args?.action))) return null;
  const place = allPlaces(content).find(p => p.id === state.place), key = plateKey(place);
  const d = plateDealt(content, state, key, now);
  return d && d.game === String(args.id ?? '') ? key : null;
}
/* The boards that stand at a place now as practice: its fixed `has.games`, and the plate's deal when it is here. */
export function standingToday(content, state, place, now = new Date()) {
  if (!place) return [];
  const d = place.has?.games_pool ? plateDealt(content, state, plateKey(place), now) : null;
  return [...new Set([...(place.has?.games ?? []), ...(d?.at === place.id ? [d.game] : [])])];
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
