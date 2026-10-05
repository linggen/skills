// rules/world.mjs — Reading the state, and the places: the province as a map.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, seedOf } from '../state.mjs';
import { itemBrief, itemOf } from './errands.mjs';
import { meetBrief, meetHere } from './road.mjs';
import { duelBrief, shelfOf, shopOf, shopOpen, withMap } from './look.mjs';
import { hashOf, provinceOf } from './travel.mjs';

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
const placeOf = (content, id) => allPlaces(content).find(p => p.id === id) ?? null;
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
  const ch = content.chapters[state?.chapter], ended = state?.ended ?? [];
  if (!ch?.map) return null;
  if (!ended.includes(ch.id)) return ch.map;
  // Ended: its map holds only while the next chapter waits (a date to come, or still being written).
  const next = Object.values(content.chapters).filter(c => c.id > ch.id && !ended.includes(c.id)).sort((a, b) => a.id.localeCompare(b.id))[0];
  return next && (next.coming || (next.opens && new Date(next.opens) > now)) ? ch.map : null;
}
const onMap = (content, state, place, now) => !mapOf(content, state, now)?.places || mapOf(content, state, now).places.includes(place.id);
/* A place the player may walk to: its province open and the chapter's map holding it. */
const placeOpen = (content, state, place, now) => Boolean(place) && provinceOpen(content, place.province, now) && onMap(content, state, place, now);

/* 关键剧情锁图 (his, 2026-09-28): a key beat — chapter.json `beats`, its
   entry scene first — shuts the map from the scene after its entry to its
   last: the scene carries the player as a corridor does. The entry is a
   waypoint, walked to; nothing is stored, the scene is the lock. */
function beatOf(content, state) {
  if (inMade(state) || !state.scene) return null;
  return (content.chapters[state.chapter]?.beats ?? []).find(b => b.scenes.indexOf(state.scene) > 0) ?? null;
}
const carried = (content, state) => Boolean(content.chapters[state.chapter]?.corridor) || Boolean(beatOf(content, state));

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
function settlePlace(content, state) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  if (scene?.at && carried(content, state)) state.place = scene.at;
  if (!state.place || !placeOf(content, state.place)) {
    const province = content.chapters[state.chapter]?.province;
    state.place = content.places[province]?.start ?? null;
  }
}

/* A place by its id, its name or its English. */
function findPlace(content, raw) {
  const said = String(raw ?? '').trim().toLowerCase();
  if (!said) return null;
  return allPlaces(content).find(p => p.id === said || p.name.zh === said || p.name.en.toLowerCase() === said || `the ${p.name.en.toLowerCase()}` === said) ?? null;
}

const tooHard = (content, state, place) => place.tier > tierIndex(content, state);
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
   scene's fight, never a pool's. Only beasts of an open 卷 (metNow). */
const poolOf = (content, place) => (place?.has?.pool ? content.places[place.province]?.pools?.[place.has.pool] ?? null : null);
const huntKey = id => `hunt:${id}`;
function poolBeast(content, state, place, now) {
  const beasts = (poolOf(content, place)?.beasts ?? []).filter(b => (b.weight ?? 1) > 0 && metNow(content, b.creature, now));
  if (!beasts.length) return null;
  const day = dayKey(now), rec = state.duels?.[huntKey(place.id)];
  const n = rec?.day === day ? rec.n ?? 0 : 0;
  // hashOf moves by one as `n` does (its last digit): mixed first, or the draw only walks round the pool.
  const h = hashOf(`${day}|${seedOf(state)}|${place.id}|hunt|${n}`), x = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  let at = ((x ^ (x >>> 16)) >>> 0) % beasts.reduce((t, b) => t + (b.weight ?? 1), 0);
  return beasts.find(b => (at -= b.weight ?? 1) < 0).creature;
}
/* The places a beast is met at: its haunt, and every place whose pool holds it. */
const hauntsOf = (content, id) => allPlaces(content).filter(p => p.has?.creature === id || (poolOf(content, p)?.beasts ?? []).some(b => b.creature === id));

function encounterOf(content, state, now) {
  const place = placeOf(content, state.place);
  if (place && !place.has?.creature && poolOf(content, place) && !atScene(content, state)) {
    const cid = poolBeast(content, state, place, now);
    const creature = cid ? creatureOf(content, cid) : null;
    if (creature) {
      // `deal`: each fight of the day its own shuffle — the same beast met again is not the same fight again.
      const n = state.duels?.[huntKey(place.id)]?.day === dayKey(now) ? state.duels[huntKey(place.id)].n ?? 0 : 0;
      const game = { id: hauntId(cid), kind: 'duel', creature: cid, hunt: place.id, deal: `${hauntId(cid)}|${place.id}|${n}` };
      return {
        creature: { id: cid, name: pick(creature.name, state.lang) }, game, pool: { id: place.has.pool, name: pick(poolOf(content, place).name, state.lang) ?? null },
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
  const today = state.duels?.[cid], day = dayKey(now);
  const item = creature.likes ? itemOf(content, creature.likes) : null;
  return {
    creature: { id: cid, name: pick(creature.name, lang) },
    game, ...(onRoad ? { road: true } : {}),
    duel: duelBrief(content, state, game, now),
    won: Boolean(state.wins?.[game.id]) && today?.day === day && today.outcome === 'won',
    withdrawn: today?.day === day && today.outcome === 'lost',
    tamed: state.cast.includes(cid),
    // Beaten once, on any day: only a beast beaten can be won over. A beast
    // that is caught, never fought (creatures.json `catch`: 狰, the herb
    // thief), yields to the board of that id won here instead.
    beaten: Boolean(state.wins?.[game.id]) || caughtBy(state, creature),
    ...(creature.catch ? { catch: creature.catch } : {}),
    // `fed`: food is fed; a thing (雷神's bell, 狪狪's silk) is offered (his, 2026-09-23: 雷神吃装备吗?)
    likes: item ? { id: item.id, name: pick(item.name, lang), held: state.bag[item.id] ?? 0, fed: item.kind === 'material' } : null,
  };
}

function placeBrief(content, state, now = new Date()) {
  const place = placeOf(content, state.place);
  if (!place) return null;
  const lang = state.lang, doc = content.places[place.province];
  const has = place.has ?? {};
  const shelf = has.shop ? shelfOf(content, place, state, now) : [];
  // The shop by its own name and keeper (按店进货, look.mjs shopOf): the shelf card's title.
  const shop = shopOf(place);
  const show = [
    ...(has.creature && metNow(content, has.creature, now) ? [{ card: 'creature', id: has.creature }] : []),
    ...(shelf.length ? [{ card: 'item', ids: shelf.map(i => i.id) }] : []),
  ];
  return {
    ...placeName(content, state, place),
    province: { id: place.province, name: pick(content.dictionary.provinces[place.province], lang), start: doc.start },
    tier: place.tier, line: pick(place.line, lang),
    has: {
      creature: has.creature && metNow(content, has.creature, now) ? { id: has.creature, name: pick(creatureOf(content, has.creature).name, lang) } : null,
      seeds: Boolean(has.seeds), shop: Boolean(has.shop), scene: has.scene ?? null,
    },
    ...(shop ? { shop: { name: pick(shop.name, lang) ?? null, keeper: pick(shop.keeper, lang) ?? null, open: shopOpen(shop, state, content), ...(!shopOpen(shop, state, content) && shop.shut ? { shut: pick(shop.shut, lang) } : {}) } } : {}),
    roads: place.roads.map(id => placeOf(content, id)).map(p => ({
      ...placeName(content, state, p), tier: p.tier, too_hard: tooHard(content, state, p),
      province: p.province, closed: !placeOpen(content, state, p, now),
    })),
    places: doc.places.map(p => ({
      ...placeName(content, state, p), tier: p.tier, roads: p.roads, ...(p.map ? { map: p.map } : {}),
      here: p.id === place.id, road: place.roads.includes(p.id), too_hard: tooHard(content, state, p),
      ...(onMap(content, state, p, now) ? {} : { closed: true }),
    })),
    shelf: shelf.map(i => itemBrief(content, state, i)),
    show: withMap(content, show),
    encounter: encounterOf(content, state, now),
    ...(meetBrief(content, state, now) ? { meet: meetBrief(content, state, now) } : {}),
  };
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
    for (const id of p.roads) {
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
  return pathOf(content, state, from, to, now) ? placeName(content, state, to) : null;
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

export { passed, hauntsOf, huntKey, poolBeast, poolOf, juanOpen, metNow, ofJuan, shutSay, allPlaces, atScene, beatOf, caughtBy, creatureOf, huntable, encounterOf, fittingPlace, inCorridor, inMade, mapOf, onMap, pathOf, placeBrief, placeName, placeOf, placeOpen, placeSaid, provinceOpen, sceneOf, settlePlace, STORY_CHARS, STORY_WORDS, tierIndex, tooHard, towardOf };
