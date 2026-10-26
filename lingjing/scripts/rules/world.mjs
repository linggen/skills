// rules/world.mjs — Reading the state, and the places: the province as a map.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, seedOf } from '../state.mjs';
import { itemBrief, itemOf } from './errands.mjs';
import { meetBrief, meetHere } from './road.mjs';
import { duelBrief, shelfOf, shopOf, shopOpen, withMap } from './look.mjs';
import { hashOf, provinceOf } from './travel.mjs';
import { buyBack, visitorHere } from './visiting.mjs';
import { huiNow, huiOrder, sceneHui } from './hui.mjs';
import { waitsTheBook } from './codex.mjs';
import { rerunBack, rerunOpen, runEncounter, runRoads, runSealed, staleRun, stampStoryEnd } from './rerun.mjs';

const STORY_WORDS = 300, STORY_CHARS = 600;

/* ── Reading the state ── */

/* The scene the player stands in: a made one when they have stepped into
   one, else the spine's. */
const inMade = state => Boolean(state.made?.at);
const sceneOf = (content, state) => (inMade(state)
  ? state.made.scenes[state.made.at] ?? null
  : content.chapters[state.chapter]?.scenes[state.scene] ?? null);
const creatureOf = (content, id) => content.creatures.creatures.find(c => c.id === id);
/* A scene behind him: played, or its chapter ended (a save may have ended a chapter by a way that skipped it). */
const passed = (content, state, id) => (state?.done_scenes ?? []).includes(id)
  || Object.values(content.chapters).some(c => c.scenes?.[id] && (state?.ended ?? []).includes(c.id));
/* A creature of an open 卷 (world.mjs ofJuan): one of a later 卷 is not met. */
const metNow = (content, id, now) => { const c = creatureOf(content, id); return Boolean(c) && ofJuan(content, c, now); };

/* ── Places: the province as a map ── */

const allPlaces = content => Object.values(content.places).flatMap(doc => doc.places.map(p => ({ ...p, province: doc.province })));
/* placeOf is on every Look's path many times over (tools/explore.mjs, 2026-10-15: 40% of a
   卷一 walk): an index by id, rebuilt whenever a province's list is not the one indexed.
   Each call still hands back a fresh copy, read from the place as it is now. */
const PLACE_INDEX = new WeakMap();
const placeIndex = content => {
  const docs = Object.values(content.places ?? {});
  const was = PLACE_INDEX.get(content);
  if (was && was.docs.length === docs.length && docs.every((d, i) => was.docs[i] === d && was.lists[i] === d.places && was.sizes[i] === d.places.length)) return was.by;
  const by = new Map();
  for (const doc of docs) for (const p of doc.places) if (!by.has(p.id)) by.set(p.id, [doc, p]);
  PLACE_INDEX.set(content, { docs, lists: docs.map(d => d.places), sizes: docs.map(d => d.places.length), by });
  return by;
};
const placeOf = (content, id) => {
  const hit = placeIndex(content).get(id);
  return hit && hit[0].places.includes(hit[1]) ? { ...hit[1], province: hit[0].province } : (allPlaces(content).find(p => p.id === id) ?? null);
};
const tierIndex = (content, state) => content.ladder.tiers.findIndex(t => t.id === state.tier);

/* 卷 — what is built (his, 2026-10-05: 游戏只到卷一，不要有后面各卷的内容、怪、物品).
   A chapter says its 卷 (`juan`, 1 unsaid). A chapter WAITS while it is
   `coming` or its date is still to come; the 卷 open are those below the
   lowest 卷 that waits (never below 1), and every 卷 when none waits.
   Anything of the world — a creature, an item, a seed, an errand, a find —
   may say its 卷 (`juan`, 1 unsaid): one of a 卷 not open is never met,
   sold, dropped, found or told (`ofJuan`). The rules filter by the field,
   never by a name. */
const waits = (c, now) => Boolean(c.coming) || Boolean(c.opens && new Date(c.opens) > now);
function juanOpen(content, now = new Date()) {
  const waiting = Object.values(content.chapters ?? {}).filter(c => waits(c, now)).map(c => c.juan ?? 1);
  return waiting.length ? Math.max(1, Math.min(...waiting) - 1) : Infinity;
}
const ofJuan = (content, thing, now = new Date()) => (thing?.juan ?? 1) <= juanOpen(content, now);
/* A chapter a scene may be stood in by id (Go): neither waiting itself nor of a 卷 behind the wall —
   the same law the road and the chapter's end keep (a coming 兖, 卷二 on, is never entered). */
const chapterOpen = (content, c, now = new Date()) => Boolean(c) && !waits(c, now) && (c.juan ?? 1) <= juanOpen(content, now);

/* A province opens with its chapter: any chapter of it that has opened (or
   never waits) in a 卷 that is open. A province with no such chapter stays
   behind the mist — greyed on the map, its roads refused. */
function provinceOpen(content, province, now = new Date()) {
  const open = juanOpen(content, now);
  return Object.values(content.chapters).some(c => c.province === province && (!c.opens || new Date(c.opens) <= now) && (c.juan ?? 1) <= open);
}

/* The world's line for a road that is not open — a place beyond the map the
   chapter opens (`map.say`), or a province beyond the open 卷 (`map.beyond`,
   else `map.say`). Null when the chapter says none. */
function shutSay(content, state, now, { province = false } = {}) {
  const map = mapOf(content, state, now) ?? content.chapters[state?.chapter]?.map;
  if (!province) return map?.say ?? null;
  // A save standing where no map is declared still hears the last open chapter's line for the 卷 beyond.
  const last = Object.values(content.chapters).filter(c => c.map?.beyond && (c.juan ?? 1) <= juanOpen(content, now)).sort((a, b) => a.id.localeCompare(b.id)).pop();
  return map?.beyond ?? map?.say ?? last?.map.beyond ?? null;
}

/* The map a chapter opens (his, 2026-09-29: 地图分步打开 — 序章 蒙山, 第一章
   沉鼎观 …): chapter.json `map.places`, in force while the save's chapter is
   that one — ended and waiting on the next too. A chapter that declares none
   opens every province that has opened, as before. */
function mapOf(content, state, now = new Date()) {
  // Inside a sealed instance its rooms are the whole map (sealedMap).
  const sealed = sealedMap(content, state);
  if (sealed) return sealed;
  const ch = content.chapters[state?.chapter], ended = state?.ended ?? [];
  if (!ch?.map) return null;
  if (!ended.includes(ch.id)) return ch.map;
  // Ended: its map holds only while the next chapter waits (a date to come, or still being written).
  const next = Object.values(content.chapters).filter(c => c.id > ch.id && !ended.includes(c.id)).sort((a, b) => a.id.localeCompare(b.id))[0];
  return next && (next.coming || (next.opens && new Date(next.opens) > now)) ? ch.map : null;
}
/* On the chapter's map — or on a way the map lets him walk past it (leaveOf):
   the story's road to its scene, or the 令 in his belt. */
const onMap = (content, state, place, now) => !mapOf(content, state, now)?.places || mapOf(content, state, now).places.includes(place.id) || leaveOf(content, state, now).has(place.id);
/* A place the player may walk to: its province open and the chapter's map holding it. */
const placeOpen = (content, state, place, now) => Boolean(place) && provinceOpen(content, place.province, now) && onMap(content, state, place, now);

/* ── 观内 — 外门弟子，无令不得下山 (Hanli, 2026-10-15: 「可以，按你的建议做」) ──
   A chapter's map (`map.places`) is where he may roam; the 外门's is the 观
   itself. Two things open a way past it, and only the places on that way:
   · the story — the spine's scene standing off the map (石门 for the 秘境):
     the shortest road from the map to it, while that scene is the one ahead;
   · a 令 — taking an errand that declares `pass: {to}` (quests: the
     执事堂's tasks below the mountain) hangs one on his belt (`state.pass`):
     the road from the map to that one place. One at a time; spent once the
     errand is done or put down AND he stands on the map again — never
     stranded halfway down.
   A save standing off every way (from before the 观 was walled, or a 令 lost
   some other way) is put back at the map's `home` with its `back` line. */
const ROAD_CACHE = new WeakMap();
/* The shortest road on the raw road graph (provinces open, the map ignored)
   from any of `from` to `to`: the places after the start, or []. */
function roadFrom(content, from, to, now) {
  const key = `${[...from].sort().join(',')}>${to}`, cache = ROAD_CACHE.get(content) ?? new Map();
  ROAD_CACHE.set(content, cache);
  if (cache.has(key)) return cache.get(key);
  const back = new Map([...from].map(id => [id, null])), queue = [...from];
  let way = [];
  while (queue.length) {
    const id = queue.shift();
    if (id === to) { for (let at = id; back.get(at) !== null; at = back.get(at)) way.unshift(at); if (from.has(to)) way = []; break; }
    for (const next of placeOf(content, id)?.roads ?? []) {
      const p = placeOf(content, next);
      if (p && !back.has(next) && provinceOpen(content, p.province, now)) { back.set(next, id); queue.push(next); }
    }
  }
  cache.set(key, way);
  return way;
}
/* The places a way past the map opens now: the story's road and the 令's. */
function leaveOf(content, state, now) {
  const map = mapOf(content, state, now), open = new Set();
  // Sealed: no way past the rooms — the story's road and the 令 wait outside, frozen.
  if (!map?.places || map.sealed) return open;
  const base = new Set(map.places);
  const scene = !inMade(state) && state.scene ? content.chapters[state.chapter]?.scenes?.[state.scene] : null;
  if (scene?.at && !base.has(scene.at) && !(state.done_scenes ?? []).includes(scene.id)) for (const id of roadFrom(content, base, scene.at, now)) open.add(id);
  for (const id of state.pass?.places ?? []) open.add(id);
  // 刷副本 (rules/rerun.mjs): while the rooms are open again, the road to their door.
  const rerun = rerunOpen(content, state, now);
  if (rerun && !base.has(rerun.rerun.door)) for (const id of roadFrom(content, base, rerun.rerun.door, now)) open.add(id);
  return open;
}
/* A 令 for this errand, when it declares one and the chapter's map walls it
   out: the road from the map to its place — and, standing off the map now
   (a chained 令 handed over below the mountain), the road home too. */
function grantPass(content, state, quest, now = new Date()) {
  // `also`: the other places the same errand sends him (阿禾's interest: 坊市, then a word at 渡口).
  const to = quest?.pass?.to, map = mapOf(content, state, now);
  const all = [to, ...(quest?.pass?.also ?? [])].filter(id => id && !map?.places?.includes(id));
  if (!to || !map?.places || !all.length) return null;
  const base = new Set(map.places), places = new Set(all.flatMap(id => roadFrom(content, base, id, now)));
  if (state.place && !base.has(state.place)) for (const id of [state.place, ...roadFrom(content, new Set([state.place]), map.home ?? map.places[0], now)]) if (!base.has(id)) places.add(id);
  state.pass = { quest: quest.id, to, places: [...places] };
  return state.pass;
}
const passQuest = (content, state) => Object.entries(state.quests ?? {}).find(([id, q]) => !q.done_at && (content.quests ?? []).find(x => x.id === id)?.pass);
/* At every settle: a 令 spent (its errand done or dropped) is let go once he is
   back on the map; an errand of a 令 held without one (an older save) is given
   it; and a save standing where no way runs goes home, told why once. */
function fitLeave(content, state, now = new Date()) {
  if (fitSealed(content, state, now)) return;
  const map = mapOf(content, state, now);
  if (state.returned && state.returned.place !== state.place) delete state.returned;
  if (!map?.places) { if (state.pass) delete state.pass; return; }
  const onBase = map.places.includes(state.place);
  if (state.pass) {
    const held = state.quests?.[state.pass.quest];
    if ((!held || held.done_at) && onBase) delete state.pass;
  }
  if (!state.pass) { const owed = passQuest(content, state); if (owed) grantPass(content, state, (content.quests ?? []).find(q => q.id === owed[0]), now); }
  const here = placeOf(content, state.place);
  if (map.home && here && !inMade(state) && !placeOpen(content, state, here, now)) {
    // Left there by a scene behind him (石门, the 秘境 over), he went back with the others: the story's line, not the rule's.
    const story = Object.values(content.chapters[state.chapter]?.scenes ?? {}).some(sc => sc.at === here.id && (state.done_scenes ?? []).includes(sc.id));
    state.returned = { place: map.home, from: here.id, ...(story ? { story: true } : {}) };
    state.place = map.home;
  }
}
/* A save as it loads, settled the same way (rules.mjs): the same object when
   nothing moved, so an unmoved save is not written for it. */
function leaveFitted(content, state, now = new Date()) {
  if (!state || !content.chapters?.[state.chapter]) return state;
  const s = structuredClone(state);
  settlePlace(content, s, now);
  const same = k => JSON.stringify(s[k] ?? null) === JSON.stringify(state[k] ?? null);
  return same('place') && same('pass') && same('returned') && same('sealed') && same('lock') && same('rerun') && same('reruns') ? state : s;
}
/* The line said once on the place he was put back at (map `back`). */
const returnedLine = (content, state, now) => {
  const map = mapOf(content, state, now);
  if (state.returned?.place !== state.place) return null;
  // Out of a rerun (rules/rerun.mjs): the run's own line.
  const line = (state.returned.rerun && rerunBack(content, state.returned.rerun)) || (state.returned.story && map?.back_story) || map?.back;
  return pick(line, state.lang) ?? null;
};

/* 关键剧情锁图 (his, 2026-09-28): a key beat — chapter.json `beats`, its
   entry scene first — shuts the map from the scene after its entry to its
   last: the scene carries the player as a corridor does. The entry is a
   waypoint, walked to; nothing is stored, the scene is the lock. */
function beatOf(content, state) {
  if (inMade(state) || !state.scene) return null;
  return (content.chapters[state.chapter]?.beats ?? []).find(b => b.scenes.indexOf(state.scene) > 0) ?? null;
}
/* The lock as the save carries it — `lock: {beat, since}` (design.md § 剧情 ×
   开放世界): stamped the first settle inside a key beat, `since` kept while
   the same beat runs, let go the first settle after its last scene. The
   scene stays the truth (beatOf); the stamp only remembers when it shut.
   A sealed beat (the 秘境) is held by its walls and stamps `sealed` instead. */
const lockOf = (content, state) => { const beat = beatOf(content, state); return beat && !beat.sealed ? beat : null; };
function fitLock(content, state, now = new Date()) {
  const beat = lockOf(content, state);
  if (!beat) { delete state.lock; return; }
  state.lock = { beat: beat.id, since: state.lock?.beat === beat.id ? state.lock.since : now.toISOString() };
}
/* A sealed beat holds him by its walls, not by the scene: its scenes stand in their rooms and he walks to them. */
const carried = (content, state) => Boolean(content.chapters[state.chapter]?.corridor) || Boolean(beatOf(content, state) && !beatOf(content, state).sealed);

/* ── 秘境 — a sealed instance (Hanli, 2026-10-15: 「yes」) ──
   A key beat that declares `sealed` (chapter.json) is an instance from the
   scene after its entry through its last: its rooms (`places`) are the whole
   map while he is inside, a room in `opens` hidden until that scene is behind
   him, and a way out refused with `say`. The save carries `sealed: {id, since}`
   while he is in — stamped the first settle inside, let go the first settle
   after, when a 机缘 still live at the door gets back the time it had left
   (rules/sealed.mjs freezes the rest by keeping it out of Look). */
function sealedOf(content, state) {
  // A rerun of an instance's outer rooms (rules/rerun.mjs): the same sealed mode, its rooms the run's.
  if (state?.rerun) return runSealed(content, state);
  if (!state?.scene || inMade(state)) return null;
  const beat = (content.chapters?.[state.chapter]?.beats ?? []).find(b => b.sealed && b.scenes.indexOf(state.scene) > 0);
  return beat ? { ...beat.sealed, beat: beat.id, first: beat.scenes[1] } : null;
}
/* A room is open once the scene its `opens` names is behind him — and always where the story stands now. */
const roomOpen = (content, state, sealed, id) => !sealed.opens?.[id] || (state.done_scenes ?? []).includes(sealed.opens[id]) || sceneOf(content, state)?.at === id;
function sealedMap(content, state) {
  const sealed = sealedOf(content, state);
  return sealed ? { places: sealed.places.filter(id => roomOpen(content, state, sealed, id)), say: sealed.say, sealed: true } : null;
}
/* Every room of every sealed instance — a beat's `places`, and every place on a
   `sealed` plate: a place of the world only while he is inside it. */
const ROOMS = new WeakMap();
const roomsOf = content => {
  if (ROOMS.has(content)) return ROOMS.get(content);
  const plates = new Set(Object.values(content.places ?? {}).flatMap(d => Object.entries(d.plates ?? {}).filter(([, p]) => p.sealed).map(([id]) => id)));
  const rooms = new Set([
    ...Object.values(content.chapters ?? {}).flatMap(c => (c.beats ?? []).flatMap(b => b.sealed?.places ?? [])),
    ...allPlaces(content).filter(p => plates.has(p.plate?.id)).map(p => p.id),
  ]);
  ROOMS.set(content, rooms);
  return rooms;
};
/* A room he is not inside, or has not reached: never drawn, never named. */
const hiddenRoom = (content, state, place) => {
  if (!roomsOf(content).has(place?.id)) return false;
  const sealed = sealedOf(content, state);
  return !(sealed?.places.includes(place.id) && roomOpen(content, state, sealed, place.id));
};
/* Stamped going in, let go coming out. The story carries him as the book
   does: each scene inside, once reached, sets him in its room (「他走进了那道
   墙」) — all but the first, which he walks down to from `home` (the way in).
   Between scenes he roams the rooms open to him. True while sealed. */
function fitSealed(content, state, now = new Date()) {
  // A rerun left standing past its time ends here (rules/rerun.mjs), never mid-fight.
  staleRun(content, state, now);
  const sealed = sealedOf(content, state);
  if (!sealed) { if (state.sealed) { stampStoryEnd(content, state, now); thaw(state, now); } return false; }
  // A rerun: stamped, kept in its rooms — the story outside stays where it is.
  if (sealed.run) {
    state.sealed = { id: sealed.beat, since: state.sealed?.since ?? now.toISOString(), scene: state.scene, run: true };
    if (!sealed.places.includes(state.place)) state.place = sealed.home;
    delete state.returned;
    return true;
  }
  const rooms = sealedMap(content, state).places, at = sceneOf(content, state)?.at;
  const reached = state.sealed?.scene !== state.scene;
  state.sealed = { id: sealed.beat, since: state.sealed?.since ?? now.toISOString(), scene: state.scene };
  if (reached && state.scene !== sealed.first && rooms.includes(at)) state.place = at;
  // The scene's boards stand while he is in it — a save from before a board was declared too (core.mjs offerTasks does it on entry).
  for (const id of sceneOf(content, state)?.offers?.tasks ?? []) { state.tasks ??= {}; state.tasks[id] ??= { status: 'offered' }; }
  if (!rooms.includes(state.place)) state.place = sealed.home ?? rooms[0];
  delete state.returned;
  return true;
}
function thaw(state, now) {
  const since = new Date(state.sealed.since), c = state.chance;
  const left = c && !c.taken && c.day === dayKey(since) ? new Date(c.until) - since : 0;
  if (left > 0) state.chance = { ...c, day: dayKey(now), until: new Date(now.getTime() + left).toISOString() };
  delete state.sealed;
}

/* The spine as waypoints: outside a corridor a scene runs only where it
   stands — the player walks to it. */
function atScene(content, state) {
  const scene = sceneOf(content, state);
  if (!scene) return false;
  if (inMade(state) || carried(content, state)) return true;
  return !scene.at || state.place === scene.at;
}

/* Where the player stands: a corridor's scene carries them to its place;
   elsewhere the save says, and a save from before places starts where its
   province starts. */
function settlePlace(content, state, now = new Date()) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  if (scene?.at && carried(content, state)) state.place = scene.at;
  if (!state.place || !placeOf(content, state.place)) {
    const province = content.chapters[state.chapter]?.province;
    state.place = content.places[province]?.start ?? null;
  }
  fitLeave(content, state, now);
  fitLock(content, state, now);
}

/* A place by its id, its name or its English. */
function findPlace(content, raw) {
  const said = String(raw ?? '').trim().toLowerCase();
  if (!said) return null;
  return allPlaces(content).find(p => p.id === said || p.name.zh === said || p.name.en.toLowerCase() === said || `the ${p.name.en.toLowerCase()}` === said) ?? null;
}

const tooHard = (content, state, place) => place.tier > tierIndex(content, state);
/* A place's roads — inside a rerun, the ways its instance declares between the run's rooms. */
const roadsOf = (content, state, place) => runRoads(content, state, place) ?? place.roads;
const placeName = (content, state, place) => ({ id: place.id, name: pick(place.name, state.lang) });

/* The place as Look tells it: what is there, the roads out, and the whole
   province for the map — here, a road away, or beyond the player's tier. */
/* A creature at its haunt, outside the spine: the bout on the stage once a
   day, and a taming by what it likes from the bag. Nothing while a scene
   runs here — the scene's own exits take over. */
const hauntId = creature => `haunt:${creature}`;
/* A haunt whose beast is fought — a bounty, a road beast, a rumor's finale;
   a beast caught instead (`catch`) is never offered as a fight. */
const huntable = (content, p, now = new Date()) => Boolean(p?.has?.creature) && metNow(content, p.has.creature, now) && !creatureOf(content, p.has.creature)?.catch;
const caughtBy = (state, creature) => Boolean(creature.catch) && state.tasks?.[creature.catch]?.status === 'done';
/* 游荡的怪 (his, 2026-10-05: 一片地方一个游荡怪物池，可重复打): a stretch of country
   shares one pool — places/<province>.json `pools: {id: {name, beasts: [{creature,
   weight}]}}`, a place's `has.pool`. Standing there with no scene running, one
   beast of it is up, drawn by the day, the save, the place and the fights already
   settled there today (`state.duels['hunt:<place>'].n`); every settle — won, lost
   or run dry — draws the next. Fought as often as he likes (体力 is the limit),
   paid by the haunt table each win. Never tamed from a pool; a story's boss is a
   scene's fight, never a pool's. Only beasts of an open 卷 (metNow). A beast he has
   tamed walks with him and is never drawn (Hanli, 2026-10-15: 「怎么卷7又出来狰的战斗,
   不是早就收服了?」 — 药园外's pool kept dealing the 狰 asleep at his feet). */
const poolOf = (content, place) => (place?.has?.pool ? content.places[place.province]?.pools?.[place.has.pool] ?? null : null);
const huntKey = id => `hunt:${id}`;
/* A beast beaten here does not stand up again at once (Hanli, 2026-10-15: 「野猪这个也是, 击败了
   出来还在」): the stretch is quiet for the pool's `rest` minutes (else balance.json
   `cooldowns.pool_rest_min`) after a win, then the next one comes. A loss or a beast run dry draws
   the next at once, as before. */
const POOL_REST_MIN = 30;
/* Milliseconds the stretch here still rests (0: a beast stands). */
function poolRestLeft(content, state, place, now) {
  const rec = state.duels?.[huntKey(place.id)];
  if (!rec?.at || rec.outcome !== 'won' || rec.day !== dayKey(now)) return 0;
  const rest = (poolOf(content, place)?.rest ?? content.balance?.cooldowns?.pool_rest_min ?? POOL_REST_MIN) * 60000;
  return Math.max(0, Date.parse(rec.at) + rest - now.getTime());
}
const poolResting = (content, state, place, now) => poolRestLeft(content, state, place, now) > 0;
/* Look's `waits` row for a pool at rest where he stands: its name, the world's line (the pool's `rest_say`, else
   creatures.json `hunt.rest_say`) and the minutes left — the page draws it waiting, never a blank stretch. */
function poolWait(content, state, now) {
  const place = placeOf(content, state.place);
  if (!place || place.has?.creature || !poolOf(content, place) || atScene(content, state)) return null;
  const left = poolRestLeft(content, state, place, now);
  if (!left) return null;
  const pool = poolOf(content, place), lang = state.lang;
  return { id: `pool:${place.id}`, title: pick(pool.name, lang) ?? pick(place.name, lang) ?? place.id,
    shut: pick(pool.rest_say ?? content.creatures?.hunt?.rest_say, lang) ?? null, wait_min: Math.ceil(left / 60000) };
}
/* 不打重复的怪 (Hanli, 2026-10-15: 「要确保有足够的怪……不要打重复的怪」) — creatures.json
   `hunt`: a pool's entry may wait for a 回 (`from`, a 回 id: drawn once the save has reached it,
   hui.mjs huiOrder) and keep to an hour (`when`: "night" | "day", the night by `hunt.night`
   [from, to) in the hours of the day). The draw never deals one of the last `memory` beasts
   fought at this place (kept on `state.duels['hunt:<place>'].last`, across days) while the pool
   has more than those, and weighs a beast never met (state.beasts) `fresh` times. A pool may say
   its own `memory` and `fresh`. Still a hash of the day, the save, the place and the fight's
   number: the same on every device and every reload. */
const HUNT = { memory: 3, fresh: 3, night: [19, 6] };
const huntRules = (content, pool = null) => ({ ...HUNT, ...(content.creatures?.hunt ?? {}), ...(pool?.memory != null ? { memory: pool.memory } : {}), ...(pool?.fresh != null ? { fresh: pool.fresh } : {}) });
function nightNow(content, now) {
  const [from, to] = huntRules(content).night, h = now.getHours();
  return from > to ? h >= from || h < to : h >= from && h < to;
}
/* The furthest 回 the save has reached, as a place in the book: the 回 it stands in, or any
   scene it has passed (a 今 interlude after 古九 does not take 古九 back). A save with none: all open. */
function reachedAt(content, state) {
  const now = huiNow(content, state), all = [now, ...(state.done_scenes ?? []).map(id => sceneHui(content, id))].filter(Boolean);
  return all.length ? Math.max(...all.map(h => huiOrder(content, h))) : Infinity;
}
const fromReached = (content, state, b) => !b.from || reachedAt(content, state) >= huiOrder(content, b.from);
/* An entry up now: its 回 reached, its hour. */
const entryUp = (content, state, b, now) => fromReached(content, state, b)
  && (!b.when || (b.when === 'night') === nightNow(content, now));
/* The beasts of a pool that may be drawn now, before the memory: of an open 卷, not walking with him, up. */
const poolUp = (content, state, place, now) => (poolOf(content, place)?.beasts ?? [])
  .filter(b => (b.weight ?? 1) > 0 && metNow(content, b.creature, now) && !(state.cast ?? []).includes(b.creature) && entryUp(content, state, b, now));
const recentAt = (state, placeId) => state.duels?.[huntKey(placeId)]?.last ?? [];
function poolBeast(content, state, place, now) {
  const up = poolUp(content, state, place, now);
  if (!up.length) return null;
  const rules = huntRules(content, poolOf(content, place));
  const day = dayKey(now), rec = state.duels?.[huntKey(place.id)];
  const n = rec?.day === day ? rec.n ?? 0 : 0;
  // The last few fought here stand down — never all of the pool: one is always left to draw.
  const keep = Math.max(0, Math.min(rules.memory, up.length - 1));
  const shut = new Set(keep ? recentAt(state, place.id).slice(-keep) : []);
  const beasts = up.filter(b => !shut.has(b.creature));
  const from = beasts.length ? beasts : up;
  const weight = b => (b.weight ?? 1) * (state.beasts?.[b.creature] ? 1 : rules.fresh);
  // hashOf moves by one as `n` does (its last digit): mixed first, or the draw only walks round the pool.
  const h = hashOf(`${day}|${seedOf(state)}|${place.id}|hunt|${n}`), x = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  let at = ((x ^ (x >>> 16)) >>> 0) % from.reduce((t, b) => t + weight(b), 0);
  return from.find(b => (at -= weight(b)) < 0).creature;
}
/* 图鉴's count for a stretch (his: a per-area completion count): of the beasts its pool holds
   for this 卷 and 回 — any hour — how many he has fought. */
function poolTally(content, state, place, now) {
  const all = [...new Set((poolOf(content, place)?.beasts ?? []).filter(b => (b.weight ?? 1) > 0 && metNow(content, b.creature, now)
    && fromReached(content, state, b)).map(b => b.creature))];
  return { met: all.filter(id => state.beasts?.[id]).length, of: all.length };
}
/* At a pool's settle: the beast is remembered by the place (the draw's memory, `HUNT.memory`
   deep and a little over, so a pool's own larger memory still reads it). */
const rememberAt = (content, rec, cid, pool = null) => {
  const deep = Math.max(huntRules(content, pool).memory, 1) + 2;
  return [...(rec?.last ?? []).filter(id => id !== cid), cid].slice(-deep);
};
/* Every beast fought, by any door: met (each fight settled), won (each win), first (the day of
   the first). 图鉴 reads it (codex.mjs seenOf) — a pool's fights are kept by the place. */
function meetBeast(state, cid, won, now) {
  const was = state.beasts?.[cid];
  state.beasts = { ...state.beasts, [cid]: { met: (was?.met ?? 0) + 1, won: (was?.won ?? 0) + (won ? 1 : 0), first: was?.first ?? dayKey(now) } };
  return { first_met: !was, first_win: won && !(was?.won) };
}
/* A pool's beast fights as its entry says: an entry's `deck` and `hp` stand
   over the creature's own, and its `roaming` over party.json's (how it grows with his party) (design.md § 游荡的怪). 蠪侄 and 狰 are the story's
   fights too (古三's wood, the 药园) — the scene keeps the creature's deck, the
   stretch is weighed apart (tools/story-fights.mjs); a game with no `hunt` is
   never a pool's. */
const poolEntry = (content, placeId, cid) => (poolOf(content, placeOf(content, placeId))?.beasts ?? []).find(b => b.creature === cid) ?? null;
function foeOf(content, game) {
  const creature = creatureOf(content, game.creature);
  // A rerun's elite (rules/rerun.mjs): the harder deck its instance declares.
  if (creature && game.deck) return { ...creature, deck: game.deck };
  const entry = creature && game.hunt ? poolEntry(content, game.hunt, game.creature) : null;
  const base = entry ? { ...creature, ...(entry.deck ? { deck: entry.deck } : {}), ...(entry.hp ? { hp: entry.hp } : {}), ...(entry.roaming ? { roaming: entry.roaming } : {}) } : creature;
  return base && game.foe ? weighed(base, game.foe) : base;
}
/* A scene's fight weighed for where the story meets its beast (the exit game's `foe`: `hp`, `deck`,
   `trial`, `feint` over the creature's own — 2026-10-15, 古七: the 秘境's 犰狳 met again at 灵草谷 three layers
   on, 秦雁 on the 崖顶 where there is no 台边). The creature's row, and every other door to it, stand. */
const weighed = (c, o) => ({ ...c, ...(o.hp ? { hp: o.hp } : {}), ...(o.deck ? { deck: o.deck } : {}), ...(o.trial ? { trial: { ...(c.trial ?? {}), ...o.trial } } : {}), ...(o.feint ? { feint: { ...(c.feint ?? {}), ...o.feint } } : {}),
  // Who stands beside him here (party.json; `[]` alone), and what the scene puts in his hand (三试's 一滚 · 石子).
  ...(o.party ? { party: o.party } : {}), ...(o.extra ? { extra: o.extra } : {}),
  // `fatigue: false`: in this fight his deck run dry costs nothing (no 反噬) — a teaching fight's (00-fox, 2026-10-22).
  ...(o.fatigue === false ? { fatigue: false } : {}) });
/* The places a beast is met at: its haunt, and every place whose pool holds it. */
const hauntsOf = (content, id) => allPlaces(content).filter(p => p.has?.creature === id || (poolOf(content, p)?.beasts ?? []).some(b => b.creature === id));

function encounterOf(content, state, now) {
  const place = placeOf(content, state.place);
  // Inside a rerun the run's own beasts, room by room (rules/rerun.mjs) — never the place's pool.
  const run = runEncounter(content, state, place, now);
  if (run !== undefined) return run;
  if (place && !place.has?.creature && poolOf(content, place) && !atScene(content, state)) {
    if (poolResting(content, state, place, now)) return null;
    const cid = poolBeast(content, state, place, now);
    const creature = cid ? creatureOf(content, cid) : null;
    if (creature) {
      // `deal`: each fight of the day its own shuffle — the same beast met again is not the same fight again.
      const n = state.duels?.[huntKey(place.id)]?.day === dayKey(now) ? state.duels[huntKey(place.id)].n ?? 0 : 0;
      const game = { id: hauntId(cid), kind: 'duel', creature: cid, hunt: place.id, deal: `${hauntId(cid)}|${place.id}|${n}` };
      return {
        creature: { id: cid, name: pick(creature.name, state.lang) }, game, pool: { id: place.has.pool, name: pick(poolOf(content, place).name, state.lang) ?? null, ...poolTally(content, state, place, now) },
        ...(state.beasts?.[cid] ? {} : { new: true }),
        duel: duelBrief(content, state, game, now), won: false, withdrawn: false, tamed: false,
        beaten: Boolean(state.wins?.[game.id]), likes: null,
      };
    }
  }
  // The haunt's own beast, else the one today's 遇 put on this road — until
  // it is passed by or beaten, when it has left the road (review, 2026-09-24).
  const road = meetHere(state, now);
  // A haunt's beast of a 卷 not open is not there (ofJuan): the place is empty.
  const own = place?.has?.creature && metNow(content, place.has.creature, now) ? place.has.creature : null;
  const onRoad = !own && road?.kind === 'beast' && !road.veiled && !road.done && metNow(content, road.creature, now);
  const cid = own ?? (onRoad ? road.creature : null);
  if (!cid || atScene(content, state)) return null;
  const creature = creatureOf(content, cid);
  if (!creature) return null;
  const lang = state.lang, game = { id: hauntId(cid), kind: 'duel', creature: cid };
  const today = state.duels?.[cid], day = dayKey(now), tamed = state.cast.includes(cid);
  const item = creature.likes ? itemOf(content, creature.likes) : null;
  return {
    creature: { id: cid, name: pick(creature.name, lang) },
    game, ...(onRoad ? { road: true } : {}),
    duel: duelBrief(content, state, game, now),
    won: Boolean(state.wins?.[game.id]) && today?.day === day && today.outcome === 'won',
    withdrawn: today?.day === day && today.outcome === 'lost',
    tamed,
    // Beaten once, on any day: only a beast beaten can be won over. A beast
    // that is caught, never fought (creatures.json `catch`: 狰, the herb
    // thief), yields to the board of that id won here instead. One already
    // tamed was won over, whatever the way — 药园's scene fight (yaoyuan-zheng)
    // left 狰 `tamed` but not `beaten`, and Ling told it 「还未被降服」 (live, 2026-10-15).
    beaten: tamed || Boolean(state.wins?.[game.id]) || caughtBy(state, creature),
    ...(creature.catch ? { catch: creature.catch } : {}),
    // `fed`: food is fed; a thing (雷神's bell, 狪狪's silk) is offered (his, 2026-09-23: 雷神吃装备吗?)
    likes: item ? { id: item.id, name: pick(item.name, lang), held: state.bag[item.id] ?? 0, fed: item.kind === 'material' } : null,
  };
}

/* The beasts the scene he stands in brings on only in the rest of its passage (codex.mjs waitsTheBook): the place
   names none of them until the book has (狰 at the 药园, before 丑时). */
const waitingHere = (content, state) => (atScene(content, state) ? waitsTheBook(state, sceneOf(content, state)) : new Set());
function placeBrief(content, state, now = new Date()) {
  const place = placeOf(content, state.place);
  if (!place) return null;
  const lang = state.lang, doc = content.places[place.province];
  const has = place.has ?? {};
  // a visiting shop on its day (rules/visiting.mjs) is the place's shop for the day.
  const visitor = visitorHere(content, state, place, now);
  const shelf = has.shop || visitor ? shelfOf(content, place, state, now) : [];
  // The shop by its own name and keeper (按店进货, look.mjs shopOf): the shelf card's title.
  const shop = shopOf(place) ?? visitor;
  const show = [
    ...(has.creature && metNow(content, has.creature, now) ? [{ card: 'creature', id: has.creature }] : []),
    ...(shelf.length ? [{ card: 'item', ids: shelf.map(i => i.id) }] : []),
  ];
  return {
    ...placeName(content, state, place),
    province: { id: place.province, name: pick(content.dictionary.provinces[place.province], lang), start: doc.start },
    tier: place.tier, line: pick(visitor?.line ?? place.line, lang),
    // Put back inside the 观 (fitLeave): the world's line, once, where he was set down.
    ...(returnedLine(content, state, now) ? { returned: returnedLine(content, state, now) } : {}),
    // A room that holds the way on, what it still asks (guardOf): its line.
    ...(guardHere(content, state, place) ? { guard: guardHere(content, state, place) } : {}),
    // A 令 in his belt: where it lets him go.
    ...(state.pass ? { pass: { to: placeName(content, state, placeOf(content, state.pass.to)), quest: state.pass.quest } } : {}),
    has: {
      creature: has.creature && metNow(content, has.creature, now) && !waitingHere(content, state).has(has.creature) ? { id: has.creature, name: pick(creatureOf(content, has.creature).name, lang) } : null,
      seeds: Boolean(has.seeds), shop: Boolean(has.shop || visitor), scene: has.scene ?? null,
    },
    ...(shop ? { shop: { name: pick(shop.name, lang) ?? null, keeper: pick(shop.keeper, lang) ?? null, open: shopOpen(shop, state, content), ...(!shopOpen(shop, state, content) && shop.shut ? { shut: pick(shop.shut, lang) } : {}) } } : {}),
    roads: roadsOf(content, state, place).map(id => placeOf(content, id)).filter(p => !hiddenRoom(content, state, p)).map(p => ({
      ...placeName(content, state, p), tier: p.tier, too_hard: tooHard(content, state, p),
      province: p.province, closed: !placeOpen(content, state, p, now),
    })),
    places: doc.places.filter(p => !hiddenRoom(content, state, p)).map(p => ({
      ...placeName(content, state, p), tier: p.tier, roads: roadsOf(content, state, p).filter(id => !hiddenRoom(content, state, placeOf(content, id))), ...(p.map ? { map: p.map } : {}),
      here: p.id === place.id, road: roadsOf(content, state, place).includes(p.id), too_hard: tooHard(content, state, p),
      ...(onMap(content, state, p, now) ? {} : { closed: true }),
    })),
    // The painted map of the small area here (观内, 2026-10-15): what 去往 opens on.
    ...(plateBrief(content, state, place, now) ? { plate: plateBrief(content, state, place, now) } : {}),
    // A shop that buys back at its own rate (`buys`) quotes its own price to sell.
    shelf: shelf.map(i => ({ ...itemBrief(content, state, i), ...(shop?.buys ? { sell: buyBack(shop, i) } : {}) })),
    show: withMap(content, show),
    encounter: encounterOf(content, state, now),
    ...(meetBrief(content, state, now) ? { meet: meetBrief(content, state, now) } : {}),
  };
}

/* A painted map of the small area he stands in (places' `plate`, the province's
   `plates`): the painting, and every place on it — where it is painted, whether
   he may walk there now, and where he stands. The 去往 list opens on it
   (scripts/plate.js); a tap is the same Move as a road's. Null off a plate. */
function plateBrief(content, state, place, now) {
  const id = place?.plate?.id, doc = id ? Object.values(content.places).find(d => d.plates?.[id]) : null;
  if (!doc) return null;
  const plate = doc.plates[id];
  const spots = allPlaces(content).filter(p => p.plate?.id === id && !hiddenRoom(content, state, p)).map(p => ({
    ...placeName(content, state, p), at: p.plate.at,
    ...(p.id === place.id ? { here: true } : {}),
    ...(placeOpen(content, state, p, now) && !tooHard(content, state, p) ? {} : { closed: true }),
    // a visiting shop stands there today: the seal gets its mark.
    ...(visitorHere(content, state, p, now) ? { visitor: true } : {}),
  }));
  return { id, name: pick(plate.name, state.lang), ...(plate.file ? { file: plate.file } : {}), aspect: plate.aspect, spots };
}

/* A room that holds the way on (places' `has.guard`, the 秘境's 凶崖): its roads to the places it
   `holds` stay shut until what it asks is done there — `won.n` fights won at its pool
   (state.hunted, tasks.mjs duel), its board `task.id` played. The first thing still asked, with its
   line, or null. Walking through it toward one of them stops there (travel.mjs move). */
const guardHere = (content, state, place) => {
  const g = (place?.has?.guard?.holds ?? []).map(id => guardOf(content, state, place, placeOf(content, id))).find(Boolean);
  return g ? pick(g.say, state.lang) : null;
};
function guardOf(content, state, from, to) {
  const g = from?.has?.guard;
  if (!g || !(g.holds ?? []).includes(to?.id)) return null;
  if (g.won && (state.hunted?.[from.id] ?? 0) < g.won.n) return { place: from.id, say: g.won.say };
  if (g.task && state.tasks?.[g.task.id]?.status !== 'done') return { place: from.id, say: g.task.say };
  return null;
}

/* The shortest way from one place to another, walking only places the player
   may enter — every place on it after `from`, or null when no such way runs. */
function pathOf(content, state, from, to, now) {
  const walkable = p => p && !tooHard(content, state, p) && placeOpen(content, state, p, now);
  if (!walkable(to)) return null;
  const back = new Map([[from.id, null]]), queue = [from];
  while (queue.length) {
    const p = queue.shift();
    if (p.id === to.id) {
      const way = [];
      for (let at = p; at.id !== from.id; at = back.get(at.id)) way.unshift(at);
      return way;
    }
    for (const id of roadsOf(content, state, p)) {
      const next = placeOf(content, id);
      if (!back.has(id) && walkable(next)) { back.set(id, p); queue.push(next); }
    }
  }
  return null;
}

/* Where a tap may take him: the place itself when a way runs to it — Move
   walks the whole road — else nothing. It was the first road on the way while
   Move went one road at a time. */
function towardOf(content, state, from, to, now) {
  const way = pathOf(content, state, from, to, now);
  if (!way) return null;
  // The places walked through on the way (「经 外门」), when it is not the next road.
  const via = way.slice(0, -1).map(p => placeName(content, state, p).name);
  return { ...placeName(content, state, to), ...(via.length ? { via } : {}) };
}

/* A place as the player said it. Exact first — id, name, English. Else the one
   place whose name holds what was said, not counting where he stands: 「去泗水」
   on 泗水岸 means 泗水北岸 (2026-09-21). Two that fit is no answer. */
function placeSaid(content, raw, here) {
  const exact = findPlace(content, raw);
  if (exact) return exact;
  const said = String(raw ?? '').trim().toLowerCase().replace(/^the /, '');
  // A province's name is the province, never a place that happens to hold it (徐 is not 徐山).
  if (said.length < 2 || provinceOf(content, raw)) return null;
  const fits = allPlaces(content).filter(p => p.id !== here?.id && (p.name.zh.includes(said) || p.name.en.toLowerCase().includes(said)));
  return fits.length === 1 ? fits[0] : null;
}

/* The nearest place the player's tier allows: here, else a road out. */
function fittingPlace(content, state, from) {
  if (!tooHard(content, state, from)) return from;
  return from.roads.map(id => placeOf(content, id)).find(p => !tooHard(content, state, p)) ?? from;
}

/* The corridor: a chapter that walks the player scene by scene; the world
   opens when it ends. */
const inCorridor = (content, state) => !inMade(state) && Boolean(state.scene) && carried(content, state);

export { fitLock, lockOf, roadsOf, meetBeast, poolTally, rememberAt, nightNow, poolUp, huntRules, poolResting, poolWait, guardOf, fitSealed, hiddenRoom, sealedOf, plateBrief, fitLeave, grantPass, leaveFitted, leaveOf, passQuest, chapterOpen, passed, foeOf, hauntsOf, huntKey, poolBeast, poolOf, juanOpen, metNow, ofJuan, shutSay, allPlaces, atScene, beatOf, caughtBy, creatureOf, huntable, encounterOf, fittingPlace, inCorridor, inMade, mapOf, onMap, pathOf, placeBrief, placeName, placeOf, placeOpen, placeSaid, provinceOpen, sceneOf, settlePlace, STORY_CHARS, STORY_WORDS, tierIndex, tooHard, towardOf };
