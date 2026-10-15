// rules/rerun.mjs — 刷副本: a sealed instance's outer rooms, open again on a cooldown, rolled anew each run.
// Part of the rules engine; rules.mjs is its one door.
//
// Hanli, 2026-10-15: the first time is the story's run, unchanged; afterwards the
// rooms a beat's `sealed.rerun` names (never the story's inner ones) open again
// `every_h` hours after the last run ended. Entered at its `door`; inside it is the
// same sealed mode as the story's (world.mjs sealedOf hands back the run's instance,
// so the errands, the 令 and the 机缘 freeze and thaw as they do there). Each run is
// drawn from its own seed: the beasts per room (`spawns`, an occasional elite), the
// 拾遗 finds and a hidden cache, and what every beast won drops (rewards.json
// `drop_tables`). Fights pay the haunt table (rules/core.mjs pay: under the 回's cap,
// at 圆满 as 灵石). Leaving, or `lasts_min` gone by, ends the run.
// Nothing here names an instance: the data declares it.
import { pick, seedOf } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { duelBrief } from './look.mjs';
import { stow } from './pouch.mjs';
import { hashOf } from './travel.mjs';
import { beatOf, creatureOf, mapOf, metNow, passed, placeBrief, placeName, placeOf, settlePlace } from './world.mjs';

const HOUR = 3600000, MIN = 60000;

/* Every beat that declares a rerun, with its chapter. */
const RERUNS = new WeakMap();
export function rerunsOf(content) {
  if (RERUNS.has(content)) return RERUNS.get(content);
  const out = Object.values(content.chapters ?? {}).flatMap(ch => (ch.beats ?? []).filter(b => b.sealed?.rerun)
    .map(b => ({ chapter: ch.id, beat: b, rerun: b.sealed.rerun })));
  RERUNS.set(content, out);
  return out;
}
const rerunById = (content, id) => rerunsOf(content).find(r => r.beat.id === id) ?? null;

/* The rerun this save may take: its beat behind him, his chapter still that one. */
export function rerunHere(content, state) {
  if (!state?.chapter || (state.ended ?? []).includes(state.chapter)) return null;
  return rerunsOf(content).find(r => r.chapter === state.chapter && passed(content, state, r.beat.scenes.at(-1))) ?? null;
}

/* Milliseconds until the rooms loosen again: counted from the last run's end (the story's too). */
export function rerunWait(state, r, now) {
  const last = state.reruns?.[r.beat.id]?.ended_at;
  return last ? Math.max(0, Date.parse(last) + r.rerun.every_h * HOUR - now.getTime()) : 0;
}

/* Open now, and he may go: not in a run or another instance, not inside a key beat, no fight. */
export function rerunOpen(content, state, now = new Date()) {
  if (state?.rerun || state?.sealed || state?.fight) return null;
  const r = rerunHere(content, state);
  if (!r || beatOf(content, state) || rerunWait(state, r, now) > 0) return null;
  return r;
}

/* The run's instance, shaped as a story beat's (world.mjs sealedOf). */
export function runSealed(content, state) {
  const r = rerunById(content, state.rerun?.id);
  if (!r) return null;
  const x = r.rerun;
  return { label: x.label, places: x.rooms, home: x.home ?? x.rooms[0], say: x.say, goal: x.goal, roads: x.roads ?? {}, beat: r.beat.id, first: null, run: true };
}
/* The ways between the run's rooms, where the run declares them. */
export const runRoads = (content, state, place) => (state?.rerun ? rerunById(content, state.rerun.id)?.rerun.roads?.[place.id] ?? null : null);

/* ── The roll: one run's beasts, finds and cache, from its seed ── */

/* A number in [0, 1) for a key: mixed, so neighbouring keys do not walk together. */
export function draw(key) {
  const h = hashOf(key), x = Math.imul(h ^ (h >>> 16), 0x45d9f3b), y = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((y ^ (y >>> 16)) >>> 0) / 4294967296;
}
const between = ([lo, hi] = [1, 1], u) => lo + Math.floor(u * (hi - lo + 1));
const byWeight = (list, u) => {
  const all = list.reduce((t, x) => t + (x.weight ?? 1), 0);
  let at = u * all;
  return list.find(x => (at -= x.weight ?? 1) < 0) ?? list.at(-1);
};
/* One arm of a rarity from a drop table's arms. */
const gearOf = (content, table, rarity, u) => {
  const arms = (table?.gear ?? []).filter(id => content.items.items.find(i => i.id === id)?.rarity === rarity);
  return arms.length ? arms[Math.floor(u * arms.length)] : null;
};
const rarityOf = (weights, u) => byWeight(Object.entries(weights ?? {}).map(([id, weight]) => ({ id, weight })), u)?.id ?? null;

export function rollRun(content, state, r, seed, now = new Date()) {
  const x = r.rerun, rooms = {}, table = content.rewards.drop_tables?.[x.drops];
  for (const room of x.rooms) {
    const spawn = x.spawns?.[room], place = placeOf(content, room);
    const pool = spawn ? content.places[place?.province]?.pools?.[spawn.pool] : null;
    const beasts = (pool?.beasts ?? []).filter(b => (b.weight ?? 1) > 0 && metNow(content, b.creature, now) && !(state.cast ?? []).includes(b.creature));
    const n = beasts.length ? between(spawn.n, draw(`${seed}|${room}|n`)) : 0;
    const foes = Array.from({ length: n }, (_, i) => {
      const creature = byWeight(beasts, draw(`${seed}|${room}|${i}|kind`)).creature;
      const elite = Boolean(x.elite?.decks?.[creature]) && draw(`${seed}|${room}|${i}|elite`) < 1 / (x.elite.one_in ?? Infinity);
      return { creature, ...(elite ? { elite: true } : {}) };
    });
    const finds = x.finds?.[room];
    const find = finds?.length ? (({ item, n: range, line }) => ({ item, n: between(range, draw(`${seed}|${room}|find|n`)), ...(line ? { line } : {}) }))(byWeight(finds, draw(`${seed}|${room}|find`))) : null;
    rooms[room] = { foes, beaten: 0, ...(find ? { find, found: false } : {}) };
  }
  // A cache, one run in `one_in`: hidden in one room that holds a find, found on a play of `grade`.
  const holders = Object.keys(rooms).filter(id => rooms[id].find);
  if (x.cache && holders.length && draw(`${seed}|cache`) < 1 / x.cache.one_in) {
    const room = holders[Math.floor(draw(`${seed}|cache|room`) * holders.length)];
    const p = byWeight(x.cache.picks, draw(`${seed}|cache|pick`));
    const item = p.gear ? gearOf(content, table, p.gear, draw(`${seed}|cache|arm`)) : p.item;
    if (item) rooms[room].cache = { item, n: p.gear ? 1 : between(p.n, draw(`${seed}|cache|n`)) };
  }
  return rooms;
}

/* ── In and out ── */

/* Enter at the door: the rooms rolled for this run, he stands in the first. */
function enterRun(state, content, ctx) {
  const lang = state.lang, here = rerunHere(content, state);
  if (!here) return refuse('no-rerun', null);
  const x = here.rerun;
  if (state.rerun) return refuse('in-run', null);
  if (state.sealed) return refuse('sealed', null);
  if (beatOf(content, state)) return refuse('corridor', pick(here.beat.say, lang) ?? null);
  const wait = rerunWait(state, here, ctx.now);
  if (wait > 0) return refuse('shut', pick(x.shut, lang) ?? null, { left_min: Math.ceil(wait / MIN) });
  if (state.place !== x.door) return refuse('not-here', null, { door: placeName(content, state, placeOf(content, x.door)) });
  const s = clone(state);
  const n = (state.reruns?.[here.beat.id]?.n ?? 0) + 1, seed = `${seedOf(state)}|${here.beat.id}|run${n}`;
  s.rerun = { id: here.beat.id, n, seed, since: ctx.now.toISOString(), rooms: rollRun(content, state, here, seed, ctx.now) };
  s.reruns = { ...s.reruns, [here.beat.id]: { ...s.reruns?.[here.beat.id], n } };
  s.place = x.home ?? x.rooms[0];
  delete s.returned;
  settlePlace(content, s, ctx.now);
  return { state: s, result: { ok: true, entered: here.beat.id, run: n, say: pick(x.open, lang) ?? null, place: placeBrief(content, s, ctx.now) } };
}

/* The run over: the clock starts, he is set back at the chapter map's home with the run's line. */
export function endRun(content, state, now) {
  const run = state.rerun, r = rerunById(content, run?.id);
  if (!run) return;
  state.reruns = { ...state.reruns, [run.id]: { ...state.reruns?.[run.id], n: run.n, ended_at: now.toISOString() } };
  delete state.rerun;
  const home = mapOf(content, state, now)?.home ?? r?.rerun.door ?? state.place;
  state.place = home;
  state.returned = { place: home, from: r?.rerun.door ?? null, rerun: run.id };
}
/* A run left standing past `lasts_min` (the page closed) ends at the next settle — never mid-fight. */
export function staleRun(content, state, now) {
  const r = state?.rerun ? rerunById(content, state.rerun.id) : null;
  if (!state?.rerun || state.fight) return false;
  const lasts = (r?.rerun.lasts_min ?? 60) * MIN;
  if (r && now.getTime() - Date.parse(state.rerun.since) < lasts) return false;
  endRun(content, state, now);
  return true;
}
/* The story's own run ended (its seal let go): the rerun's clock starts there. */
export function stampStoryEnd(content, state, now) {
  const r = rerunById(content, state.sealed?.id);
  if (!r || state.sealed?.run || state.reruns?.[r.beat.id]?.ended_at) return;
  state.reruns = { ...state.reruns, [r.beat.id]: { n: 0, ...state.reruns?.[r.beat.id], ended_at: now.toISOString() } };
}
/* The run's line said once where he was set down. */
export const rerunBack = (content, id) => rerunById(content, id)?.rerun.back ?? null;

function leaveRun(state, content, ctx) {
  if (!state.rerun) return refuse('not-in-run', null);
  const s = clone(state), run = state.rerun;
  endRun(content, s, ctx.now);
  settlePlace(content, s, ctx.now);
  const rooms = Object.values(run.rooms);
  return { state: s, result: { ok: true, left: run.id, run: run.n, beaten: rooms.reduce((t, x) => t + x.beaten, 0), of: rooms.reduce((t, x) => t + x.foes.length, 0), say: pick(rerunBack(content, run.id), s.lang) ?? null } };
}

/* The verb: `rerun enter` at the door, `rerun leave` anywhere inside, `rerun info`. */
export function rerun(state, content, ctx, args = {}) {
  const action = String(args.action ?? 'info');
  if (action === 'enter') return enterRun(state, content, ctx);
  if (action === 'leave') return leaveRun(state, content, ctx);
  if (action === 'info') return { state: null, result: { ok: true, rerun: rerunBrief(content, state, ctx.now) } };
  return refuse('unknown-action', null, { actions: ['enter', 'leave', 'info'] });
}

/* ── Fights, drops and finds inside ── */

/* The beast up in this room of the run: the next not yet beaten, or null when the room is clear.
   Undefined outside a run (the place's own pool takes over). */
export function runEncounter(content, state, place, now) {
  if (!state?.rerun) return undefined;
  const room = state.rerun.rooms?.[place?.id], foe = room?.foes?.[room.beaten];
  if (!foe) return null;
  const creature = creatureOf(content, foe.creature), r = rerunById(content, state.rerun.id);
  if (!creature || !r) return null;
  const i = room.beaten, deck = foe.elite ? r.rerun.elite?.decks?.[foe.creature] : null;
  const game = { id: `haunt:${foe.creature}`, kind: 'duel', creature: foe.creature, hunt: place.id, deal: `${state.rerun.seed}|${place.id}|${i}`, run: { room: place.id, i }, ...(deck ? { elite: true, deck } : {}) };
  const pool = r.rerun.spawns?.[place.id]?.pool, named = pool ? content.places[place.province]?.pools?.[pool]?.name : null;
  return {
    creature: { id: foe.creature, name: pick(creature.name, state.lang) }, game,
    pool: { id: pool ?? null, name: pick(named, state.lang) ?? null },
    run: { left: room.foes.length - i, of: room.foes.length }, ...(deck ? { elite: true } : {}),
    duel: duelBrief(content, state, game, now), won: false, withdrawn: false, tamed: false,
    beaten: Boolean(state.wins?.[game.id]), likes: null,
  };
}

const rarityName = (content, item, lang) => pick(content.items.rarities?.[item?.rarity], lang) ?? null;
/* A thing into the bag, said with its rarity when it is an arm. */
function give(content, state, id, n) {
  const item = content.items.items.find(i => i.id === id);
  if (!item) return null;
  const got = stow(content, state, id, n);
  return { ...got, got: n, ...(item.rarity ? { rarity: item.rarity, rarity_name: rarityName(content, item, state.lang), kind: item.kind } : {}) };
}

/* A beast of the run won: the room's count moves on, and the drop table rolls for it. */
export function runSpoils(content, state, game) {
  const run = state.rerun, room = run?.rooms?.[game.run?.room];
  if (!room || room.beaten !== game.run.i) return [];
  room.beaten += 1;
  const r = rerunById(content, run.id), table = content.rewards.drop_tables?.[r?.rerun.drops];
  const key = `${run.seed}|${game.run.room}|${game.run.i}|drop`, elite = Boolean(game.elite), got = [];
  (table?.rolls ?? []).forEach((roll, k) => {
    const chance = elite ? roll.elite_chance ?? roll.chance : roll.chance;
    if (draw(`${key}|${k}`) >= chance) return;
    if (roll.gear) {
      const rarity = rarityOf(elite ? table.elite_rarity ?? table.rarity : table.rarity, draw(`${key}|${k}|rarity`));
      const id = gearOf(content, table, rarity, draw(`${key}|${k}|arm`));
      if (id) got.push(give(content, state, id, 1));
      return;
    }
    const p = byWeight(roll.items, draw(`${key}|${k}|pick`));
    got.push(give(content, state, p.item, between(p.n, draw(`${key}|${k}|n`))));
  });
  return got.filter(Boolean);
}

/* The run's 拾遗 board, while in a run. */
export const rerunBoardId = (content, state) => (state?.rerun ? rerunById(content, state.rerun.id)?.rerun.board ?? null : null);
/* The run's 拾遗 stands in a room that holds a find not yet taken. */
export function runBoardHere(content, state, id) {
  const run = state?.rerun, r = run ? rerunById(content, run.id) : null;
  const room = run?.rooms?.[state.place];
  return Boolean(r && r.rerun.board === id && room?.find && !room.found);
}
/* Its win handed in: the room's find, and the cache under it on a play of the cache's grade. */
export function runFindDone(state, content, ctx, id) {
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state), r = rerunById(content, s.rerun.id), room = s.rerun.rooms[s.place];
  delete s.wins[id];
  room.found = true;
  const grade = s.grades?.[id] ?? null;
  const got = [give(content, s, room.find.item, room.find.n)];
  const lines = [pick(room.find.line, s.lang)];
  if (room.cache && r.rerun.cache?.grade && grade === r.rerun.cache.grade) {
    got.push(give(content, s, room.cache.item, room.cache.n));
    lines.push(pick(r.rerun.cache.line, s.lang));
    room.cache_found = true;
  }
  const found = got.filter(Boolean);
  return { state: s, result: { ok: true, done: id, paid: { progress: 0, wealth: 0, item: found[0]?.id ?? null }, found, ...(room.cache_found ? { cache: true } : {}), line: lines.filter(Boolean).join(''), gives: null } };
}

/* ── What Look carries ── */

/* Inside: the run's rooms, what each still holds. Outside: open (the door and the line) or
   shut (how long), while this save may take it. Null otherwise. */
export function rerunBrief(content, state, now) {
  const lang = state.lang;
  if (state.rerun) {
    const r = rerunById(content, state.rerun.id);
    if (!r) return null;
    const rooms = r.rerun.rooms.map(id => {
      const room = state.rerun.rooms[id] ?? { foes: [], beaten: 0 };
      return { ...placeName(content, state, placeOf(content, id)), beasts: room.foes.length - room.beaten, of: room.foes.length, ...(room.find ? { find: !room.found } : {}) };
    });
    return { inside: true, id: r.beat.id, run: state.rerun.n, label: pick(r.rerun.label, lang), rooms };
  }
  const r = rerunHere(content, state);
  if (!r || state.sealed || beatOf(content, state)) return null;
  const door = placeName(content, state, placeOf(content, r.rerun.door));
  const wait = rerunWait(state, r, now);
  if (wait > 0) return { open: false, id: r.beat.id, wait_min: Math.ceil(wait / MIN), say: pick(r.rerun.shut, lang) ?? null, door };
  return { open: true, id: r.beat.id, say: pick(r.rerun.open, lang) ?? null, door, here: state.place === r.rerun.door, runs: state.reruns?.[r.beat.id]?.n ?? 0 };
}

/* What one run is worth on average, read from the data, for the 修为 model (tools/xiuwei-model.mjs)
   and the economy: beasts per run, the 修为 they pay below 圆满 (haunt table), the finds. */
export function runsPay(content) {
  const haunt = content.rewards.tables.haunt;
  return rerunsOf(content).map(r => {
    const mean = ([lo, hi] = [0, 0]) => (lo + hi) / 2;
    const beasts = Object.values(r.rerun.spawns ?? {}).reduce((t, sp) => t + mean(sp.n), 0);
    const finds = Object.keys(r.rerun.finds ?? {}).length;
    return { beat: r.beat.id, chapter: r.chapter, every_h: r.rerun.every_h, beasts, progress: beasts * haunt.progress, wealth: beasts * haunt.wealth, finds };
  });
}

