// rules/happenings.mjs — 观里的事: the small games reach him as things happening in the world, never as a list of games
// (Hanli 2026-11-10: 「小游戏我们有很多种类. 让用户都能玩到」 · 「要放进剧情里, 现在的兽潮是个好例子…再想点其他点子, 加进去」 →
// 「可以，按这个做」). Part of the rules engine; rules.mjs is its one door.
//
// ONE data-driven mechanism (worlds/<id>/happenings.json): a happening is a place, a person who asks, a one-line reason in
// the book's voice (several, one a 时辰), when it may stand (`when`: the 时辰 it leans to, a lock here; `days`: the days of
// the month it comes on, 逢五逢十; `after`: a scene behind him) and the games it may deal (`deals`: task ids). Nothing here
// names a place, a person or a game: a new 卷 adds rows.
//
// · THE DRAW. Each 时辰 (rules/pool.mjs shichenOf) lights up to `draw` of the happenings that may stand now, seeded by the
//   save, the day and the 时辰 — the phone and the Mac draw the same, a reload never changes it — one a place. A happening
//   gone to (its game played: won, lost, put down or kept) leaves the row for the rest of the 时辰; the next 时辰 lights its
//   own. Weighed as the 时辰 began (one not gone to in a day ×2, one of its own days only ×4), so what he does inside it
//   moves nothing.
// · THE DEAL. Standing there, the happening deals ONE of its games, from the save alone (no saved pick, so leaving cannot
//   reroll it): of those he may play now, the kind played least recently first, never the game just played through a
//   happening while it has another. He chooses whether to go, never which game. A game may be dealt when it is:
//   - MET in the story (a board of that kind counted, or a scene that shows one behind him), or hosted by a place on the
//     happening's painted map he may walk to — the reach is both, never only what the map deals today;
//   - repeatable (rules/pool.mjs boardVaries, or a skill kit the data names in `again`: a bout, a run, a wave played
//     again is not a riddle answered again) — a one-answer board stays out;
//   - open (its task's own `after`), and not one dealt `once` already played;
//   - hostable where he plays (`phone: false` on a deal the phone's kit cannot host, tools/phone/board-kit.json; the
//     phone's bundle runs as 'phone', rules/chores.mjs hostOf — the draw is the same, the phone only hides a happening
//     with nothing it can host).
// · THE FOLD. A board a happening deals at its own place no longer stands there by itself (rotation.mjs standingToday), and
//   a painted map (a plate) a happening stands on deals no board of its own (rotation.mjs plateDealt): its boards reach him
//   through the happenings. An errand that asks for one still finds it where it asks (tasks.mjs hostsNow).
// · THE PAY is the game's: its minutes × the rate at the layer, the day's replay share, its 体力 — exactly as a board
//   played anywhere (rules/playpay.mjs); a happening adds nothing. The day's 变着花样 (`variety`) is apart: so many KINDS of
//   game played to an end in a day pay one small game's worth each threshold (`own`, the unit form of gongke.json's).
import { dayKey, pick, seedOf } from '../state.mjs';
import { BRANCH, boardVaries, shichenOf } from './pool.mjs';
import { allPlaces, hiddenRoom, placeName, placeOf, placeOpen, tooHard } from './world.mjs';
import { hostOf, ownXiuwei } from './chores.mjs';
import { lunarOf } from '../calendar.js';
import { needsHold } from './seals.mjs';

const cfgOf = content => content.happenings ?? null;
export const happeningsOf = content => cfgOf(content)?.happenings ?? [];
const DRAW_DEFAULT = 3;
const LATELY_MS = 24 * 3600_000;
const taskOf = (content, id) => (content.tasks?.tasks ?? []).find(t => t.id === id) ?? null;
const plateOf = place => place?.plate?.id ?? place?.id ?? null;

/* A number in (0, 1) from a key (FNV-1a, then a final mix — the pool's coin). */
function coin(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (((h ^ (h >>> 16)) >>> 0) + 1) / 4294967297;
}

/* ── The fold ── */
/* A board a happening deals at this very place: it stands there only through the happening. */
export const claimedAt = (content, placeId, id) => happeningsOf(content).some(h => h.place === placeId && (h.deals ?? []).some(d => d.task === id));
/* A painted map a happening stands on: its own deal of boards is the happenings' now. */
export const plateHappens = (content, key) => Boolean(key) && happeningsOf(content).some(h => plateOf(placeOf(content, h.place)) === key);

/* ── What a game is ── */
/* A game's kind: its kit (`game`), else its own kind (a word game). */
export const kindOf = t => t?.game ?? t?.kind ?? null;
/* Played again with sense: its content varies (pool.mjs boardVaries), or it is a skill kit the data names (`again`). */
export const repeatable = (content, t) => Boolean(t) && (boardVaries(t) || (cfgOf(content)?.again ?? []).includes(t.game));
/* The kinds he has met in the story: a board of it counted (or won, or ever played beside the story), or a scene behind
   him that shows one — its board's kind, and the kind its other way plays (结印's `alt`). */
const SCENE_KINDS = new WeakMap();
/* Each scene's boards' kinds, and each chapter's scenes (the content's own, read once). */
function sceneIndex(content) {
  if (SCENE_KINDS.has(content)) return SCENE_KINDS.get(content);
  const scenes = new Map(), chapters = new Map(), tasks = new Map((content.tasks?.tasks ?? []).map(t => [t.id, t]));
  for (const ch of Object.values(content.chapters ?? {})) {
    chapters.set(ch.id, Object.keys(ch.scenes ?? {}));
    for (const [sid, sc] of Object.entries(ch.scenes ?? {})) {
      const kinds = (sc.show ?? []).filter(c => c.card === 'board').flatMap(c => kindsOfTask(tasks.get(c.id)));
      if (kinds.length) scenes.set(sid, kinds);
    }
  }
  const idx = { scenes, chapters };
  SCENE_KINDS.set(content, idx);
  return idx;
}
const kindsOfTask = t => (t ? [kindOf(t), ...(t.alt ?? []).map(a => a.game)].filter(Boolean) : []);
export function metKinds(content, state) {
  const out = new Set(), add = t => { for (const k of kindsOfTask(t)) out.add(k); };
  for (const [id, held] of Object.entries(state.tasks ?? {})) if (held?.status === 'done') add(taskOf(content, id));
  for (const id of [...Object.keys(state.stars ?? {}), ...Object.keys(state.pool_played ?? {}), ...Object.keys(state.happen?.games ?? {})]) add(taskOf(content, id));
  const { scenes, chapters } = sceneIndex(content);
  const behind = [...(state.done_scenes ?? []), ...(state.ended ?? []).flatMap(c => chapters.get(c) ?? [])];
  for (const sid of behind) for (const k of scenes.get(sid) ?? []) out.add(k);
  return out;
}
/* A board open by the story (its task's `after`: that scene behind him, or its chapter ended — tasks.mjs hostedOpen). */
const openByStory = (content, state, t) => !t?.after || (state.done_scenes ?? []).includes(t.after)
  || Object.values(content.chapters ?? {}).some(c => c.scenes?.[t.after] && (state.ended ?? []).includes(c.id));
/* Ever played (a `once` deal: 洛书, Hanli 10-19 「9宫格出现一次就可以了」): through a happening, in the pool, or counted. */
const everPlayed = (state, id) => Boolean(state.happen?.games?.[id] || state.pool_played?.[id] || state.tasks?.[id]?.status === 'done' || state.stars?.[id] != null);

/* The games a happening may deal now, for a device: each `{ task, kind, d }`. */
export function dealable(content, state, h, host = hostOf(), met = metKinds(content, state), day = null, now = new Date()) {
  return (h.deals ?? []).flatMap((d) => {
    const t = taskOf(content, d.task);
    if (!t || !t.hosted || !repeatable(content, t) || !openByStory(content, state, t)) return [];
    if (!met.has(kindOf(t)) && !onPlate(content, state, h, t.id)) return [];
    if (d.once && everPlayed(state, t.id)) return [];
    // A stall's board (押宝) is once a day by its own rule: played today, it is not dealt again today.
    if (t.stall && day && state.tasks?.[t.id]?.status === 'done' && state.tasks[t.id].period === day) return [];
    if (host === 'phone' && d.phone === false) return [];
    // `needs`: a state the deal waits on, named in the data and answered by rules/seals.mjs (师父传印: this week's lesson, a drill's two seals).
    if (!needsHold(content, state, d.needs, now, d.task)) return [];
    return [{ task: t.id, kind: kindOf(t), d }];
  });
}
/* A board some place on the happening's painted map hosts (its `has.games` or its pool's), a place he may walk to: the
   reach is what he has met OR what the map around him holds (Hanli: 「让用户都能玩到」 — not only today's). */
function onPlate(content, state, h, id) {
  const key = plateOf(placeOf(content, h.place));
  return allPlaces(content).some(p => plateOf(p) === key && [...(p.has?.games ?? []), ...(p.has?.games_pool?.from ?? [])].includes(id)
    && !hiddenRoom(content, state, p) && placeOpen(content, state, p) && !tooHard(content, state, p));
}
/* When a kind was last played: through a happening, or as a board of it anywhere (pool.mjs `pool_played`, a counted task). */
function kindAt(content, state, kind) {
  let at = state.happen?.kinds?.[kind] ? Date.parse(state.happen.kinds[kind]) : 0;
  for (const [id, t] of Object.entries(state.pool_played ?? {})) if (kindOf(taskOf(content, id)) === kind) at = Math.max(at, Date.parse(t) || 0);
  return at;
}
/* The game a happening deals, from the save alone: the least recently played kind first, never the game just played through
   a happening while it has another; a tie by the save, the day and the 时辰. Null: nothing it may deal here. */
export function dealOf(content, state, h, sc, host = hostOf(), met) {
  const can = dealable(content, state, h, host, met, sc.day, sc.start);
  if (!can.length) return null;
  const pool = can.length > 1 ? can.filter(c => c.task !== state.happen?.last) : can;
  const key = c => coin(`${seedOf(state)}|${sc.day}|${sc.i}|${h.id}|${c.task}`);
  // `first`: a deal the data puts ahead (the week's lesson, when it is due) — it is dealt before the rotation of kinds.
  return [...pool].sort((a, b) => Number(Boolean(b.d.first)) - Number(Boolean(a.d.first)) || kindAt(content, state, a.kind) - kindAt(content, state, b.kind) || key(a) - key(b) || a.task.localeCompare(b.task))[0];
}

/* ── When it may stand ── */
/* The day of the month a happening's `days` read: the lunar month's (`calendar: 'lunar'`, the game's own table —
   calendar.js lunarOf, as the festivals read it: 逢五逢十 is a market's 初五 · 初十 · 十五 …), else the civil month's. */
function dayOfMonth(h, sc) {
  const [y, m, d] = String(sc.day).split('-').map(Number);
  return h.calendar === 'lunar' ? lunarOf(y, m, d)?.day ?? d : d;
}
/* Its 时辰, its days, its scene, its place open to him (on his map, not a hidden room, not past his strength). */
function stands(content, state, h, sc, now) {
  if ((h.when ?? []).length && !h.when.includes(BRANCH[sc.i])) return false;
  if ((h.days ?? []).length && !h.days.includes(dayOfMonth(h, sc))) return false;
  if (h.after && !openByStory(content, state, { after: h.after })) return false;
  const p = placeOf(content, h.place);
  return Boolean(p) && !hiddenRoom(content, state, p) && placeOpen(content, state, p, now) && !tooHard(content, state, p);
}
const goneAt = (state, id) => (state.happen?.at?.[id] ? new Date(state.happen.at[id]) : null);

/* One 时辰's draw: the happenings that may stand then and deal something on any device, weighed as it began, the highest
   seeded keys (u^(1/w)), one a place, up to `draw`. Each `{ h, played }` (gone to inside this 时辰). */
export function drawAt(content, state, sc, now = sc.start) {
  const n = cfgOf(content)?.draw ?? DRAW_DEFAULT, met = metKinds(content, state);
  const scored = happeningsOf(content).filter(h => stands(content, state, h, sc, now) && dealable(content, state, h, 'mac', met, sc.day, now).length).map((h) => {
    const at = goneAt(state, h.id), before = at && at < sc.start ? at : null;
    // Not gone to in a day ×2; one that comes only on its days (a market day) ×4 — it has the one day, the others every day.
    const w = (!before || sc.start - before > LATELY_MS ? 2 : 1) * ((h.days ?? []).length ? 4 : 1);
    return { h, played: Boolean(at && at >= sc.start), key: coin(`${seedOf(state)}|${sc.day}|${sc.i}|hap|${h.id}`) ** (1 / w) };
  }).sort((a, b) => b.key - a.key || a.h.id.localeCompare(b.h.id));
  const places = new Set(), out = [];
  for (const x of scored) {
    if (out.length >= n || places.has(x.h.place)) continue;
    places.add(x.h.place); out.push(x);
  }
  return out;
}

/* The 时辰 now and the one before it (a game begun as one 时辰 ended is counted in the next — it waits for no clock). */
const prevOf = sc => shichenOf(new Date(sc.start.getTime() - 60_000));
/* The happening lit where he stands that deals `id` now (this 时辰, or the one before while he plays it), or null. */
export function happeningFor(content, state, id, now = new Date(), host = hostOf()) {
  if (!claimedAt(content, state.place, id)) return null;
  const met = metKinds(content, state);
  for (const sc of [shichenOf(now), prevOf(shichenOf(now))]) {
    for (const x of drawAt(content, state, sc, now)) {
      if (x.played || x.h.place !== state.place) continue;
      const d = dealOf(content, state, x.h, sc, host, met);
      if (d?.task === id) return { h: x.h, deal: d, sc };
    }
  }
  return null;
}
/* tasks.mjs hostsNow: a happening here deals it now. */
export const happeningHosts = (content, state, id, now) => Boolean(happeningFor(content, state, id, now));

/* Look's tasks: the game the happening where he stands deals, offered as practice (it stands on the stage only through it). */
export function happeningHosted(content, state, now = new Date()) {
  const sc = shichenOf(now), met = metKinds(content, state), out = {};
  for (const x of drawAt(content, state, sc, now)) {
    if (x.played || x.h.place !== state.place) continue;
    const d = dealOf(content, state, x.h, sc, hostOf(), met);
    if (d) out[d.task] = { status: 'offered', practice: true };
  }
  return out;
}

/* The person who asks, by name (people.json), in his tongue. */
function whoName(content, state, id) {
  const p = (content.people?.people ?? []).find(x => x.id === id);
  return p ? String(pick(p.name, state.lang) ?? id) : null;
}
/* The reason told this 时辰: one of its lines, by the save, the day and the 时辰. */
const sayOf = (state, h, sc) => {
  const lines = h.say ?? [];
  return lines.length ? pick(lines[Math.floor(coin(`${seedOf(state)}|${sc.day}|${sc.i}|say|${h.id}`) * lines.length)], state.lang) : null;
};

/* 手边的棋局's entries (rules/aside.mjs PLAY_KINDS `happening`): each happening lit and not yet gone to — its place and who
   (`title`), its reason (`say`), its name (`label`); the game it deals only where he stands (`task`, `arg`, `game_title`):
   away, the row names no game (Hanli: the player chooses whether to go, never which game). On the phone a happening with
   nothing it can host is not shown. */
export function happeningTray(content, state, now = new Date(), host = hostOf()) {
  const sc = shichenOf(now), met = metKinds(content, state);
  return drawAt(content, state, sc, now).filter(x => !x.played).flatMap(({ h }) => {
    const d = dealOf(content, state, h, sc, host, met);
    if (!d) return [];
    const where = String(placeName(content, state, placeOf(content, h.place))?.name ?? h.place).split(' · ').pop(), who = whoName(content, state, h.who);
    const row = { id: `hap:${h.id}`, happening: h.id, at: h.place, label: String(pick(h.title, state.lang) ?? h.id), title: [where, who].filter(Boolean).join(' · '),
      ...(who ? { who } : {}), say: sayOf(state, h, sc), places: [h.place], change_min: Math.max(1, Math.ceil((sc.end - now) / 60_000)) };
    if (state.place !== h.place) return [row];
    const t = taskOf(content, d.task);
    return [{ ...row, task: d.task, game: kindOf(t), game_title: String(pick(t.title, state.lang) ?? d.task), opens: 'play', arg: d.task, stage: `board:${d.task}` }];
  });
}

/* ── Played ── */
const PLAYS = new Set(['done', 'lost', 'leave', 'skip', 'keep']);
/* The task a verb plays to an end or puts down: `task done|lost|leave|skip|keep`, or a board's own 跳过 sent as a win. */
const playedTask = (verb, args) => ((verb === 'task' && PLAYS.has(args?.action)) || (verb === 'win' && (args?.grade === 'skipped' || args?.skipped === true || args?.skipped === 'true')) ? String(args.id ?? '') : null);
/* Does this verb play the game a happening here deals? (pool.mjs's board stamp leaves such a play to the happening.) */
export const playsHappening = (content, state, verb, args, now = new Date()) => {
  const id = playedTask(verb, args);
  return id ? happeningFor(content, state, id, now) : null;
};
/* Stamp a happening's play on `next` (mutated): gone to (`at`), the game and its kind's last play, the game just played. */
export function stampHappening(content, state, next, verb, args, now) {
  const hit = playsHappening(content, state, verb, args, now);
  if (!hit) return false;
  const iso = now.toISOString(), h = next.happen ?? {};
  next.happen = { ...h, at: { ...(h.at ?? {}), [hit.h.id]: iso }, games: { ...(h.games ?? {}), [hit.deal.task]: iso }, kinds: { ...(h.kinds ?? {}), [hit.deal.kind]: iso }, last: hit.deal.task };
  return true;
}

/* ── 变着花样: the day's kinds of game ── */
/* The kind a verb played to an end beside the story (counted or lost — a put-down is no play): a board played again (a
   hosted board, 兽潮's night, 切磋's bout, 妖兽出没's wave), a beast fought at a haunt or a pool. The story's own boards and
   fights are the book's pace, never this (its numbers are the story's). */
const BESIDE = t => Boolean(t && (t.hosted || t.shouchao || t.qiecuo));
function kindPlayed(content, verb, args, result) {
  const id = String(args?.id ?? '');
  if (verb === 'task' && ['done', 'lost'].includes(args?.action)) { const t = taskOf(content, id); return BESIDE(t) || t?.id === cfgOf(content)?.forms?.yaoshou?.wave?.task ? kindOf(t) : null; }
  if (verb === 'duel' && result?.outcome && args?.picks != null && id.startsWith('haunt:')) return 'duel';
  return null;
}
/* The day's kinds so far (a new day, none). */
export const varietyToday = (state, now) => (state.variety?.day === dayKey(now) ? state.variety : { day: dayKey(now), kinds: [], paid: [] });
/* After a verb: its kind joins the day's; reaching a threshold not yet paid today pays its `own` (one small game's worth at
   his layer — chores.mjs ownXiuwei) on `next` (mutated). Answers what was paid, or null. `payFn`: core.mjs pay. */
export function varietyAfter(content, state, next, verb, args, result, ctx, payFn) {
  const v = cfgOf(content)?.variety, kind = v ? kindPlayed(content, verb, args, result) : null;
  if (!kind) return null;
  const now = ctx.now ?? new Date(), day = varietyToday(next, now);
  if (day.kinds.includes(kind)) return null;
  const kinds = [...day.kinds, kind], hit = (v.at ?? []).find(n => kinds.length >= n && !day.paid.includes(n));
  next.variety = { day: day.day, kinds, paid: hit ? [...day.paid, hit] : day.paid };
  if (!hit || !content.rewards?.tables?.[v.own?.table]) return null;
  const progress = Math.round(ownXiuwei(content, next, v.own));
  const paid = progress > 0 ? payFn(content, next, ctx, { table: v.own.table, progress, wealth: 0 }) : null;
  return { kinds: kinds.length, at: hit, ...(paid ? { paid } : {}) };
}
