// rules/world.mjs — Reading the state, and the places: the province as a map.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick } from '../state.mjs';
import { itemBrief, itemOf, meetBrief, meetHere } from './errands.mjs';
import { duelBrief, shelfOf, withMap } from './look.mjs';
import { provinceOf } from './travel.mjs';

const STORY_WORDS = 300, STORY_CHARS = 600;

/* ── Reading the state ── */

/* The scene the player stands in: a made one when they have stepped into
   one, else the spine's. */
const inMade = state => Boolean(state.made?.at);
const sceneOf = (content, state) => (inMade(state)
  ? state.made.scenes[state.made.at] ?? null
  : content.chapters[state.chapter]?.scenes[state.scene] ?? null);
const creatureOf = (content, id) => content.creatures.creatures.find(c => c.id === id);

/* ── Places: the province as a map ── */

const allPlaces = content => Object.values(content.places).flatMap(doc => doc.places.map(p => ({ ...p, province: doc.province })));
const placeOf = (content, id) => allPlaces(content).find(p => p.id === id) ?? null;
const tierIndex = (content, state) => content.ladder.tiers.findIndex(t => t.id === state.tier);

/* A province opens with its chapter: any chapter of it that has opened (or
   never waits). A province with no chapter stays behind the mist. */
function provinceOpen(content, province, now) {
  return Object.values(content.chapters).some(c => c.province === province && (!c.opens || new Date(c.opens) <= now));
}

/* The spine as waypoints: outside a corridor a scene runs only where it
   stands — the player walks to it. */
function atScene(content, state) {
  const scene = sceneOf(content, state);
  if (!scene) return false;
  if (inMade(state) || content.chapters[state.chapter]?.corridor) return true;
  return !scene.at || state.place === scene.at;
}

/* Where the player stands: a corridor's scene carries them to its place;
   elsewhere the save says, and a save from before places starts where its
   province starts. */
function settlePlace(content, state) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  if (scene?.at && content.chapters[state.chapter]?.corridor) state.place = scene.at;
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
function encounterOf(content, state, now) {
  const place = placeOf(content, state.place);
  // The haunt's own beast, else the one today's 遇 put on this road — until
  // it is passed by or beaten, when it has left the road (review, 2026-09-24).
  const road = meetHere(state, now);
  const onRoad = !place?.has?.creature && road?.kind === 'beast' && !road.veiled && !road.done;
  const cid = place?.has?.creature ?? (onRoad ? road.creature : null);
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
    // Beaten once, on any day: only a beast beaten can be won over.
    beaten: Boolean(state.wins?.[game.id]),
    // `fed`: food is fed; a thing (雷神's bell, 狪狪's silk) is offered (his, 2026-09-23: 雷神吃装备吗?)
    likes: item ? { id: item.id, name: pick(item.name, lang), held: state.bag[item.id] ?? 0, fed: item.kind === 'material' } : null,
  };
}

function placeBrief(content, state, now = new Date()) {
  const place = placeOf(content, state.place);
  if (!place) return null;
  const lang = state.lang, doc = content.places[place.province];
  const has = place.has ?? {};
  const shelf = has.shop ? shelfOf(content, place.province, state) : [];
  const show = [
    ...(has.creature ? [{ card: 'creature', id: has.creature }] : []),
    ...(shelf.length ? [{ card: 'item', ids: shelf.map(i => i.id) }] : []),
  ];
  return {
    ...placeName(content, state, place),
    province: { id: place.province, name: pick(content.dictionary.provinces[place.province], lang), start: doc.start },
    tier: place.tier, line: pick(place.line, lang),
    has: {
      creature: has.creature ? { id: has.creature, name: pick(creatureOf(content, has.creature).name, lang) } : null,
      seeds: Boolean(has.seeds), shop: Boolean(has.shop), scene: has.scene ?? null,
    },
    roads: place.roads.map(id => placeOf(content, id)).map(p => ({
      ...placeName(content, state, p), tier: p.tier, too_hard: tooHard(content, state, p),
      province: p.province, closed: !provinceOpen(content, p.province, now),
    })),
    places: doc.places.map(p => ({
      ...placeName(content, state, p), tier: p.tier, roads: p.roads, ...(p.map ? { map: p.map } : {}),
      here: p.id === place.id, road: place.roads.includes(p.id), too_hard: tooHard(content, state, p),
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
  const walkable = p => p && !tooHard(content, state, p) && provinceOpen(content, p.province, now);
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
const inCorridor = (content, state) => !inMade(state) && Boolean(state.scene) && Boolean(content.chapters[state.chapter]?.corridor);

export { allPlaces, atScene, creatureOf, encounterOf, fittingPlace, inCorridor, inMade, pathOf, placeBrief, placeName, placeOf, placeSaid, provinceOpen, sceneOf, settlePlace, STORY_CHARS, STORY_WORDS, tierIndex, tooHard, towardOf };
