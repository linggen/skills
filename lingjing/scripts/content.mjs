// Loads a world's authored content and checks it. Pure reads — nothing here
// writes. `node content.mjs lint [world]` prints every problem and exits 1 on
// any; with no world named it lints every world in `worlds/`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_EFFECTS, ELEMENTS } from './duel.js';

/* The worlds ship with the skill, one folder each under `worlds/`; the
   folder's name is the world's id and the save's `world`. */
export const WORLDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../worlds');
export const DEFAULT_WORLD = 'jiuding';

export const worldDir = id => path.join(WORLDS_DIR, id);
export const listWorlds = () => fs.readdirSync(WORLDS_DIR).filter(id => fs.existsSync(path.join(worldDir(id), 'world.json'))).sort();
export const hasWorld = id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && fs.existsSync(path.join(worldDir(id), 'world.json'));

/* ── Made worlds: the player's own, laid over a shipped one ── */

/* They live in the skill's data folder (LINGJING_DATA in tests), one folder
   per world, holding only what Ling wrote: the card, the words that differ,
   new creatures, one province of places, the opening scene. Everything
   else — ladder, rewards, herbs, items, riddles, tasks, branches — is the
   base world's. */
const dataDir = () => process.env.LINGJING_DATA || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
export const madeWorldsDir = () => path.join(dataDir(), 'worlds');
export const madeWorldDir = id => path.join(madeWorldsDir(), id);
export const hasMadeWorld = id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && fs.existsSync(path.join(madeWorldDir(id), 'world.json'));
export const listMadeWorlds = () => (fs.existsSync(madeWorldsDir()) ? fs.readdirSync(madeWorldsDir()).filter(hasMadeWorld).sort() : []);
export const knownWorld = id => hasWorld(id) || hasMadeWorld(id);
export const allWorlds = () => [...listWorlds(), ...listMadeWorlds()];

/* A world by id — shipped or made; an unknown id throws with the ids that
   exist. */
export function loadWorld(id = DEFAULT_WORLD) {
  if (hasWorld(id)) return loadContent(worldDir(id));
  if (hasMadeWorld(id)) return loadMadeWorld(id);
  throw new Error(`unknown world ${id}; worlds: ${allWorlds().join(', ')}`);
}

function loadMadeWorld(id) {
  const dir = madeWorldDir(id);
  const at = file => readJson(path.join(dir, file));
  const card = at('world.json');
  if (!hasWorld(card.base)) throw new Error(`world ${id} is laid over ${card.base}, which is not shipped`);
  const overlay = {
    dictionary: at('dictionary.json'),
    creatures: at('creatures.json'),
    places: loadPlaces(path.join(dir, 'places')),
    scenes: loadMadeScenes(path.join(dir, 'scenes')),
  };
  return overlayWorld(loadContent(worldDir(card.base)), card, overlay);
}

function loadMadeScenes(root) {
  const scenes = {};
  if (!fs.existsSync(root)) return scenes;
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.json')).sort()) {
    const scene = readJson(path.join(root, file));
    scenes[scene.id] = scene;
  }
  return scenes;
}

/* The made world as the rules see it: the base's systems, the made world's
   story. Its one chapter is a stub with no spine scenes — the story is the
   opening scene and whatever Ling makes next — so the province opens at
   once and nothing waits. */
export function overlayWorld(base, card, overlay) {
  const pid = card.province.id;
  return {
    ...base,
    world: { ...card, made: true },
    dictionary: {
      ...base.dictionary,
      words: { ...base.dictionary.words, ...(overlay.dictionary.words ?? {}) },
      provinces: { ...base.dictionary.provinces, ...(overlay.dictionary.provinces ?? {}) },
    },
    creatures: { ...base.creatures, creatures: [...base.creatures.creatures, ...(overlay.creatures.creatures ?? []).map(c => ({ ...c, made: true }))] },
    places: overlay.places,
    seeds: {},
    chapters: { story: { version: 1, id: 'story', province: pid, corridor: false, first_scene: null, title: card.title, scenes: {} } },
    opening: overlay.scenes,
  };
}

/* What the folder holds, from one outline: the card, the words, the new
   creatures, the province, the opening scene. */
export function cardOf(outline, now = new Date()) {
  const { id, base, title, premise, style, sources, province, chapter } = outline;
  return { version: 1, id, base, title, premise, style, sources, province, chapter: chapter ?? null, opening: outline.scene.id, made: true, created: now.toISOString() };
}
export function overlayOf(outline) {
  const pid = outline.province.id;
  return {
    dictionary: { version: 1, words: outline.words ?? {}, provinces: { [pid]: outline.province.name } },
    creatures: { version: 1, creatures: outline.creatures ?? [] },
    places: { [pid]: { version: 1, province: pid, start: outline.start, places: outline.places } },
    scenes: { [outline.scene.id]: outline.scene },
  };
}

/* Who speaks besides the creatures. Ling is the world's voice — narration,
   never a named speaker. */
export const CAST = { yinyue: { zh: '银月', en: 'Yinyue' } };
const SPEAKERS = new Set(['ling', ...Object.keys(CAST)]);
const CARDS = new Set(['creature', 'traits', 'map', 'board', 'hexagram', 'gate', 'tribulation', 'item', 'duel']);
const GAME_KINDS = new Set(['duel', 'board']);

/* An exit's game, one shape: `{id, kind, creature?}`; a bare string is a
   board known by its id. */
export const gameOf = exit => (exit?.game == null ? null : typeof exit.game === 'string' ? { id: exit.game, kind: 'board' } : exit.game);
export const ITEM_KINDS = new Set(['pill', 'weapon', 'gear', 'artifact', 'treasure', 'key', 'material', 'charm']);
export const WEAR_SLOTS = new Set(['yinyue', 'abode']);
const VALUE_FIELDS = new Set(['name']);
const SETTABLE = { traits: new Set(['v1']) };

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

export function loadContent(dir = worldDir(DEFAULT_WORLD)) {
  const at = file => readJson(path.join(dir, file));
  return {
    dir,
    world: at('world.json'),
    names: at('names.json'),
    ladder: at('ladder.json'),
    traits: at('traits.json'),
    rewards: at('rewards.json'),
    creatures: at('creatures.json'),
    herbs: at('herbs.json'),
    items: at('items.json'),
    arts: at('arts.json'),
    hexagrams: at('hexagrams.json'),
    riddles: { zh: at('riddles/zh.json'), en: at('riddles/en.json') },
    tasks: at('tasks/world.json'),
    branches: at('branches.json'),
    seeds: loadSeeds(path.join(dir, 'seeds')),
    places: loadPlaces(path.join(dir, 'places')),
    templates: { made: at('templates/made-scene.json'), world: at('templates/made-world.json') },
    dictionary: at('dictionary.json'),
    chapters: loadChapters(path.join(dir, 'chapters')),
  };
}

function loadChapters(root) {
  const chapters = {};
  for (const name of fs.readdirSync(root).sort()) {
    const base = path.join(root, name);
    if (!fs.statSync(base).isDirectory()) continue;
    const chapter = readJson(path.join(base, 'chapter.json'));
    chapter.scenes = {};
    for (const file of fs.readdirSync(path.join(base, 'scenes')).filter(f => f.endsWith('.json')).sort()) {
      const scene = readJson(path.join(base, 'scenes', file));
      chapter.scenes[scene.id] = scene;
    }
    chapters[chapter.id] = chapter;
  }
  return chapters;
}

/* 奇遇 seeds, one file per province: { 徐: { province, seeds } }. */
function loadSeeds(root) {
  const seeds = {};
  if (!fs.existsSync(root)) return seeds;
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.json')).sort()) {
    const doc = readJson(path.join(root, file));
    seeds[doc.province] = doc;
  }
  return seeds;
}

/* The places of a province, one file each: { 徐: { province, start, places } }. */
function loadPlaces(root) {
  const places = {};
  if (!fs.existsSync(root)) return places;
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.json')).sort()) {
    const doc = readJson(path.join(root, file));
    places[doc.province] = doc;
  }
  return places;
}

/* ── Made worlds: the lint ── */

export const WORLD = { max_bytes: 16000, places: [4, 8], cast: [1, 8], new_creatures: 4 };
const ID = /^[a-z0-9-]+$/;
const pair = v => Boolean(v?.zh && v?.en);

/* A world Ling wrote, checked the way authored ones are and as a made
   thing: a shipped base, a province of its own, roads that come back,
   creatures from the bestiary or new with a root, an opening scene in the
   made shape, no novel's names. Returns the problems; none means playable. */
export function lintMadeWorld(outline, base) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  if (!outline || typeof outline !== 'object') return ['not a world'];
  lintWorldCard(outline, base, bad);
  lintWorldProvince(outline, base, bad);
  lintWorldCast(outline, base, bad);
  lintWorldWords(outline, base, bad);
  if (!outline.scene || typeof outline.scene !== 'object') bad('scene', 'needs an opening scene');
  refusedNames(outline, base, 'world', bad);
  bilingual({ ...outline, scene: undefined }, 'world', bad);
  if (problems.length) return problems;
  const merged = overlayWorld(base, cardOf(outline), overlayOf(outline));
  const ids = { creatures: new Set(merged.creatures.creatures.map(c => c.id)), items: new Set(base.items.items.map(i => i.id)), tasks: new Set() };
  lintPlaces({ ...merged, chapters: { story: { scenes: { [outline.scene.id]: outline.scene } } } }, ids, bad);
  for (const p of lintMade(outline.scene, {}, merged)) problems.push(p);
  return problems;
}

function lintWorldCard(o, base, bad) {
  if (!ID.test(o.id ?? '')) bad('world', 'id must be lowercase letters, digits and dashes');
  else if (hasWorld(o.id)) bad('world', `${o.id} is a shipped world`);
  if (o.base !== base.world.id) bad('world', `base must be ${base.world.id}`);
  if (JSON.stringify(o).length > WORLD.max_bytes) bad('world', `over ${WORLD.max_bytes} bytes`);
  for (const k of ['title', 'premise', 'style']) if (!pair(o[k])) bad('world', `${k} needs zh and en`);
  if (!Array.isArray(o.sources) || !o.sources.length) bad('world', 'needs sources — the heritage it draws on');
}

function lintWorldProvince(o, base, bad) {
  const pid = o.province?.id;
  if (!ID.test(pid ?? '')) bad('province', 'id must be lowercase letters, digits and dashes');
  else if (base.dictionary.provinces[pid]) bad('province', `${pid} is a province of ${base.world.id}`);
  if (!pair(o.province?.name)) bad('province', 'name needs zh and en');
  const places = Array.isArray(o.places) ? o.places : [];
  if (places.length < WORLD.places[0] || places.length > WORLD.places[1]) bad('places', `needs ${WORLD.places[0]} to ${WORLD.places[1]} places`);
  if (!o.start) bad('places', 'needs a start');
  for (const p of places) if (!ID.test(p?.id ?? '')) bad(`place ${p?.id ?? '?'}`, 'id must be lowercase letters, digits and dashes');
}

function lintWorldCast(o, base, bad) {
  const baseIds = new Set(base.creatures.creatures.map(c => c.id));
  const news = Array.isArray(o.creatures) ? o.creatures : [];
  const cast = Array.isArray(o.cast) ? o.cast : [];
  if (news.length > WORLD.new_creatures) bad('creatures', `at most ${WORLD.new_creatures} new creatures`);
  if (cast.length + news.length < WORLD.cast[0]) bad('cast', 'needs at least one creature');
  if (cast.length + news.length > WORLD.cast[1]) bad('cast', `at most ${WORLD.cast[1]} creatures in all`);
  for (const id of cast) if (!baseIds.has(id)) bad('cast', `${id} is not in the bestiary`);
  const seen = new Set();
  for (const c of news) {
    lintNewCreature(c, base, seen, bad);
    seen.add(c?.id);
  }
}

/* One creature Ling made: an id of its own, a root, its words — the
   player's language at least, as for a made scene — and no art yet. */
export function lintNewCreature(c, content, taken, bad) {
  const at = `creature ${c?.id ?? '?'}`;
  if (!c || typeof c !== 'object') { bad(at, 'not a creature'); return; }
  if (!ID.test(c.id ?? '')) bad(at, 'id must be lowercase letters, digits and dashes');
  else if (content.creatures.creatures.some(x => x.id === c.id) || taken.has(c.id)) bad(at, 'id already taken');
  else if (c.id === 'map') bad(at, 'map names the world\'s map, not a creature');
  if (!content.traits.elements[c.root]) bad(at, `needs a root the traits know, not ${c.root}`);
  for (const k of ['name', 'quote', 'look']) if (!c[k]?.zh && !c[k]?.en) bad(at, `${k} needs zh or en`);
  if (c.art) bad(at, 'art is drawn later, never written');
  if (c.name?.zh) lintPinyin(c, bad, false);
}

/* Words a model hands over bare — "Nixuan" for a name — are one language's
   words: a Han string is zh, anything else en. Applied to the fields that
   are {zh, en} pairs before the lint, so the lint judges the meaning. */
export function pairsOf(thing, fields) {
  if (!thing || typeof thing !== 'object') return thing;
  const out = { ...thing };
  for (const k of fields) {
    if (typeof out[k] !== 'string') continue;
    out[k] = /\p{Script=Han}/u.test(out[k]) ? { zh: out[k] } : { en: out[k] };
  }
  return out;
}

/* ── Amending a made world in play ── */

/* A creature added to the world in play, and the place it haunts. Checked
   like one written at the outset: the count, the id, the root, the words,
   the names; the place must be the world's and stand empty. */
export function lintAmendCreature(creature, at, content) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const made = content.creatures.creatures.filter(c => c.made);
  if (made.length >= WORLD.new_creatures) bad('creatures', `at most ${WORLD.new_creatures} new creatures`);
  lintNewCreature(creature, content, new Set(), bad);
  refusedNames(creature, content, `creature ${creature?.id ?? '?'}`, bad);
  if (at != null) {
    const place = ownPlaces(content).find(p => p.id === at);
    if (!place) bad('at', `${at} is not a place of this world`);
    else if (place.has?.creature) bad('at', `${at} already has ${place.has.creature}`);
  }
  return problems;
}

/* A place added to the world in play: its own id, a tier on the ladder, a
   line in both languages, roads to places that exist (the rules lay the
   road back), and the map still whole. */
export function lintAmendPlace(place, content) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const at = `place ${place?.id ?? '?'}`;
  if (!place || typeof place !== 'object') return ['not a place'];
  const places = ownPlaces(content);
  if (places.length >= WORLD.places[1]) bad('places', `at most ${WORLD.places[1]} places`);
  if (!ID.test(place.id ?? '')) bad(at, 'id must be lowercase letters, digits and dashes');
  else if (places.some(p => p.id === place.id)) bad(at, 'id already taken');
  if (!pair(place.name)) bad(at, 'name needs zh and en');
  if (!Array.isArray(place.roads) || !place.roads.length) bad(at, 'needs at least one road');
  for (const r of place.roads ?? []) if (!places.some(p => p.id === r)) bad(at, `road to ${r}, which is not a place of this world`);
  refusedNames(place, content, at, bad);
  if (problems.length) return problems;
  const pid = content.world.province.id;
  const doc = content.places[pid];
  const withRoads = doc.places.map(p => (place.roads.includes(p.id) ? { ...p, roads: [...new Set([...p.roads, place.id])] } : p));
  const ids = { creatures: new Set(content.creatures.creatures.map(c => c.id)), items: new Set(content.items.items.map(i => i.id)), tasks: new Set() };
  lintPlaces({ ...content, places: { [pid]: { ...doc, places: [...withRoads, place] } }, chapters: { story: { scenes: {} } } }, ids, bad);
  return problems;
}

/* The made world's own places — the one province it has. */
export const ownPlaces = content => content.places[content.world.province?.id]?.places ?? [];

/* Words a world renames: only ids the base has, each in both languages. */
function lintWorldWords(o, base, bad) {
  for (const [id, w] of Object.entries(o.words ?? {})) {
    if (!base.dictionary.words[id]) bad(`word ${id}`, 'is not an id the harness has');
    if (!pair(w)) bad(`word ${id}`, 'needs zh and en');
  }
}

/* ── Made scenes ── */

export const MADE = { chapter: 'made', max_scenes: 10, max_bytes: 3000, max_exits: 4, max_buttons: 3, tables: ['branch'] };
const MADE_FORBIDDEN = ['set', 'value', 'key', 'game'];

/* A scene Ling wrote, checked the way authored ones are — against the
   player's other made scenes as its chapter — plus what a made scene may
   not do. Returns the problems; none means playable. */
export function lintMade(scene, madeScenes, content) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const where = `scene ${scene?.id ?? '?'}`;
  if (!scene || typeof scene !== 'object') return ['not a scene'];
  if (typeof scene.id !== 'string' || !scene.id.startsWith('made-')) bad(where, 'id must start with made-');
  if (JSON.stringify(scene).length > MADE.max_bytes) bad(where, `over ${MADE.max_bytes} bytes`);
  if (!Array.isArray(scene.exits) || scene.exits.length < 1 || scene.exits.length > MADE.max_exits) bad(where, `needs 1 to ${MADE.max_exits} exits`);
  if ((scene.buttons ?? []).length > MADE.max_buttons) bad(where, `at most ${MADE.max_buttons} buttons`);
  if (scene.offers) bad(where, 'a made scene offers no tasks');
  for (const [k, v] of Object.entries({ place: scene.place, setup: scene.setup })) {
    if (!v?.zh && !v?.en) bad(where, `${k} needs zh or en`);
  }
  for (const exit of scene.exits ?? []) {
    for (const f of MADE_FORBIDDEN) if (exit[f] != null) bad(`${where} exit ${exit.id}`, `may not use ${f}`);
    if (exit.grant && !MADE.tables.includes(exit.grant.table)) bad(`${where} exit ${exit.id}`, `grant only from ${MADE.tables.join(', ')}`);
    if (exit.ends != null && exit.ends !== MADE.chapter) bad(`${where} exit ${exit.id}`, 'ends must be "made"');
  }
  refusedNames(scene, content, where, bad);
  if (problems.length) return problems;
  const ids = {
    creatures: new Set(content.creatures.creatures.map(c => c.id)),
    items: new Set(content.items.items.map(i => i.id)),
    tasks: new Set(),
  };
  const chapter = { id: MADE.chapter, scenes: { ...madeScenes, [scene.id]: scene } };
  lintScene({ ...scene, chapter: MADE.chapter }, chapter, content, ids, bad);
  return problems;
}

/* ── Lint ── */

export function lint(content) {
  const problems = [];
  const bad = (where, msg) => problems.push(`${where}: ${msg}`);
  const ids = {
    creatures: new Set(content.creatures.creatures.map(c => c.id)),
    items: new Set(content.items.items.map(i => i.id)),
    tasks: new Set(content.tasks.tasks.map(t => t.id)),
  };
  lintWorld(content.world, bad);
  lintItems(content, bad);
  lintArts(content, bad);
  bilingual(content, 'content', bad);
  for (const [part, node] of Object.entries(content)) {
    if (!['dir', 'world', 'names'].includes(part)) refusedNames(node, content, part, bad);
  }
  lintLadder(content.ladder, bad);
  lintCreatures(content, bad);
  lintRiddles(content.riddles, bad);
  for (const task of content.tasks.tasks) lintTask(task, content, ids, bad);
  for (const b of content.branches.templates) {
    if (!content.rewards.tables[b.table]) bad(`branch ${b.kind}`, `unknown reward table ${b.table}`);
    if (!b.may_not?.includes('spine')) bad(`branch ${b.kind}`, 'must not touch the spine');
  }
  for (const chapter of Object.values(content.chapters)) lintChapter(chapter, content, ids, bad);
  lintSeeds(content, ids, bad);
  lintPlaces(content, ids, bad);
  lintAtlas(content, bad);
  return problems;
}

/* A province's places: roads both ways to places anywhere in the world (a
   road into another province opens with that province's chapter), a tier
   the ladder has, a creature with its card, a scene that exists, and every
   place reachable from the start. */
const onMap = at => Array.isArray(at) && at.length === 2 && at.every(v => typeof v === 'number' && v >= 0 && v <= 1);

/* The world map: its file on disk, and each province's name somewhere on it. */
function lintAtlas(content, bad) {
  const atlas = content.world?.atlas;
  if (!atlas) return;
  if (!atlas.file || !fs.existsSync(path.join(content.dir, atlas.file))) bad('atlas', `map ${atlas.file} is missing`);
  if (!(atlas.aspect > 0)) bad('atlas', 'needs the map\'s aspect, width over height');
  for (const [province, at] of Object.entries(atlas.provinces ?? {})) {
    if (!content.dictionary.provinces[province]) bad('atlas', `unknown province ${province}`);
    if (!onMap(at)) bad('atlas', `province ${province} needs [x, y], fractions 0–1`);
  }
}

function lintPlaces(content, ids, bad) {
  const scenes = new Set(Object.values(content.chapters).flatMap(c => Object.keys(c.scenes)));
  const byId = Object.fromEntries(Object.values(content.places).flatMap(doc => doc.places.map(p => [p.id, p])));
  const seen = new Set();
  for (const [province, doc] of Object.entries(content.places)) {
    const where = `places ${province}`;
    if (!content.dictionary.provinces[province]) bad(where, 'unknown province');
    if (!doc.places.some(p => p.id === doc.start)) bad(where, `start ${doc.start} is not a place`);
    for (const place of doc.places) {
      const at = `place ${place.id}`;
      if (seen.has(place.id)) bad(at, 'duplicate id');
      seen.add(place.id);
      if (!Number.isInteger(place.tier) || place.tier < 0 || place.tier >= content.ladder.tiers.length) bad(at, `tier ${place.tier} is not on the ladder`);
      if (!place.line?.zh || !place.line?.en) bad(at, 'needs a line in both languages');
      for (const road of place.roads ?? []) {
        if (!byId[road]) bad(at, `road to ${road}, which is not a place`);
        else if (!byId[road].roads?.includes(place.id)) bad(at, `road to ${road} does not come back`);
      }
      if (place.has?.creature && !ids.creatures.has(place.has.creature)) bad(at, `has unknown creature ${place.has.creature}`);
      if (place.has?.scene && !scenes.has(place.has.scene)) bad(at, `has unknown scene ${place.has.scene}`);
      if (content.world?.atlas && !onMap(place.map)) bad(at, 'needs map [x, y] on the world map, fractions 0–1 (tools/pin.py)');
    }
    const reached = new Set();
    const walk = id => { if (!byId[id] || reached.has(id)) return; reached.add(id); (byId[id].roads ?? []).forEach(walk); };
    walk(doc.start);
    for (const place of doc.places) if (!reached.has(place.id)) bad(`place ${place.id}`, 'no road reaches it from the start');
  }
}

/* The world card: an id that matches its folder, a title and a style in
   both languages. */
function lintWorld(world, bad) {
  if (!/^[a-z0-9-]+$/.test(world.id ?? '')) bad('world', 'id must be lowercase letters, digits and dashes');
  for (const k of ['title', 'style']) if (!world[k]?.zh || !world[k]?.en) bad('world', `${k} needs zh and en`);
}

/* The names a world refuses — a novel's — found anywhere in its strings.
   Notes (keys starting with _) are skipped: they may name the book. */
export function refusedNames(node, content, where, bad) {
  const names = (content.names?.books ?? []).flatMap(b => b.names.map(n => ({ name: n, book: b.title })));
  const walk = (n, at) => {
    if (typeof n === 'string') {
      for (const { name, book } of names) if (n.includes(name)) bad(at, `names ${name} (${book})`);
      return;
    }
    if (Array.isArray(n)) { n.forEach((x, i) => walk(x, `${at}[${i}]`)); return; }
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) if (!k.startsWith('_')) walk(v, `${at}.${k}`);
  };
  walk(node, where);
}

/* Every {zh, en} pair carries both, non-empty, and arrays of equal length. */
function bilingual(node, where, bad) {
  if (Array.isArray(node)) { node.forEach((x, i) => bilingual(x, `${where}[${i}]`, bad)); return; }
  if (!node || typeof node !== 'object') return;
  if ('zh' in node || 'en' in node) {
    const empty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty(node.zh) || empty(node.en)) bad(where, 'needs both zh and en');
    else if (Array.isArray(node.zh) && node.zh.length !== node.en.length) bad(where, 'zh and en differ in length');
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('_') || key === 'riddles') continue;
    bilingual(value, `${where}.${key}`, bad);
  }
}

/* A seed names a kind the templates know, a province the terms know, and a
   creature only when the creature has its card. */
function lintSeeds(content, ids, bad) {
  const kinds = new Set(content.branches.templates.map(b => b.kind));
  const seen = new Set();
  for (const [province, doc] of Object.entries(content.seeds)) {
    if (!content.dictionary.provinces[province]) bad(`seeds ${province}`, 'unknown province');
    for (const seed of doc.seeds) {
      const where = `seed ${seed.id}`;
      if (seen.has(seed.id)) bad(where, 'duplicate id');
      seen.add(seed.id);
      if (!kinds.has(seed.kind)) bad(where, `unknown kind ${seed.kind}`);
      if (!seed.line?.zh || !seed.line?.en) bad(where, 'needs a line in both languages');
      if (seed.creature && !ids.creatures.has(seed.creature)) bad(where, `names unknown creature ${seed.creature}`);
    }
  }
}

function lintLadder(ladder, bad) {
  for (const t of ladder.tiers) {
    const n = t.thresholds.length;
    if (t.steps.zh.length !== n) bad(`tier ${t.id}`, `${t.steps.zh.length} steps but ${n} thresholds`);
  }
}

/* A creature's name is read aloud from its pinyin, one syllable a character:
   蠪侄 is lóng zhí. A shipped creature carries it; a made one may. */
function lintPinyin(c, bad, required) {
  if (c.pinyin == null) { if (required) bad(`creature ${c.id}`, 'needs pinyin, one syllable a character of its name'); return; }
  const chars = [...(c.name?.zh ?? '')].filter(ch => /\p{Script=Han}/u.test(ch)).length;
  if (typeof c.pinyin !== 'string' || c.pinyin.trim().split(/\s+/).length !== chars) bad(`creature ${c.id}`, `pinyin "${c.pinyin}" needs one syllable for each of ${chars} characters`);
}

function lintCreatures(content, bad) {
  for (const c of content.creatures.creatures) {
    if (!content.traits.elements[c.root]) bad(`creature ${c.id}`, `needs a root the traits know, not ${c.root}`);
    if (!c.made) lintPinyin(c, bad, true);
    if (!c.art || !c.art_source) { bad(`creature ${c.id}`, 'needs art and art_source'); continue; }
    if (!fs.existsSync(path.join(content.dir, c.art))) bad(`creature ${c.id}`, `art ${c.art} is missing`);
  }
}

function lintRiddles(riddles, bad) {
  const zh = Object.keys(riddles.zh.riddles), en = Object.keys(riddles.en.riddles);
  for (const key of zh) if (!en.includes(key)) bad(`riddle ${key}`, 'has no English');
  for (const key of en) if (!zh.includes(key)) bad(`riddle ${key}`, 'has no Chinese');
  for (const [lang, file] of Object.entries(riddles)) {
    for (const [key, r] of Object.entries(file.riddles)) {
      if (!r.q || !Array.isArray(r.a) || r.a.length === 0) bad(`riddle ${key} (${lang})`, 'needs q and at least one answer');
    }
  }
}

function lintTask(task, content, ids, bad) {
  const where = `task ${task.id}`;
  lintGrant(where, task.grant, content, ids, bad);
  if (task.gives?.bag && !ids.items.has(task.gives.bag)) bad(where, `gives unknown item ${task.gives.bag}`);
}

function lintGrant(where, grant, content, ids, bad) {
  if (!grant) return;
  const table = content.rewards.tables[grant.table];
  if (!table) { bad(where, `unknown reward table ${grant.table}`); return; }
  for (const [key, cap] of Object.entries(table)) {
    if ((grant[key] ?? 0) > cap) bad(where, `${key} ${grant[key]} is over the ${grant.table} cap of ${cap}`);
  }
  if (grant.cast && !ids.creatures.has(grant.cast)) bad(where, `grants unknown creature ${grant.cast}`);
  if (grant.item && !ids.items.has(grant.item)) bad(where, `grants unknown item ${grant.item}`);
}

function lintChapter(chapter, content, ids, bad) {
  const where = `chapter ${chapter.id}`;
  if (!chapter.scenes[chapter.first_scene]) bad(where, `first_scene ${chapter.first_scene} does not exist`);
  for (const scene of Object.values(chapter.scenes)) lintScene(scene, chapter, content, ids, bad);
  for (const id of unreachable(chapter)) bad(`scene ${id}`, 'cannot be reached from the first scene');
  if (!endsSomewhere(chapter)) bad(where, 'no exit ends the chapter');
}

function lintScene(scene, chapter, content, ids, bad) {
  const where = `scene ${scene.id}`;
  if (scene.chapter !== chapter.id) bad(where, `says chapter ${scene.chapter}, lives in ${chapter.id}`);
  const places = content.places[chapter.province]?.places ?? [];
  if (scene.at && !places.some(p => p.id === scene.at)) bad(where, `at ${scene.at}, which is not a place of ${chapter.province}`);
  const speakers = new Set([...SPEAKERS, ...ids.creatures]);
  for (const line of scene.lines ?? []) if (!speakers.has(line.who)) bad(where, `unknown speaker ${line.who}`);
  for (const card of scene.show ?? []) lintCard(where, card, ids, bad);
  for (const t of scene.offers?.tasks ?? []) if (!ids.tasks.has(t)) bad(where, `offers unknown task ${t}`);

  const exitIds = scene.exits.map(e => e.id);
  if (new Set(exitIds).size !== exitIds.length) bad(where, 'repeats an exit id');
  for (const b of scene.buttons ?? []) {
    const exit = scene.exits.find(e => e.id === b);
    if (!exit) bad(where, `button ${b} is not an exit`);
    else if (!exit.label) bad(`${where} exit ${b}`, 'a button needs a label');
  }
  for (const exit of scene.exits) lintExit(`${where} exit ${exit.id}`, exit, chapter, content, ids, speakers, bad);
}

function lintExit(where, exit, chapter, content, ids, speakers, bad) {
  if (!exit.means || typeof exit.means !== 'string') bad(where, 'needs plain-words means');
  const ways = ['next', 'stay', 'ends'].filter(k => exit[k] != null);
  if (ways.length !== 1) bad(where, 'needs exactly one of next, stay, ends');
  if (exit.next && !chapter.scenes[exit.next]) bad(where, `next ${exit.next} does not exist`);
  if (exit.ends && exit.ends !== chapter.id) bad(where, `ends ${exit.ends}, not its own chapter`);
  for (const rule of [exit.needs, exit.take]) {
    if (rule?.bag && !ids.items.has(rule.bag)) bad(where, `unknown item ${rule.bag}`);
    if (rule?.task && !ids.tasks.has(rule.task)) bad(where, `unknown task ${rule.task}`);
  }
  if (exit.take && !exit.needs) bad(where, 'takes what it never checks for');
  if (exit.needs && !exit.refuse) bad(where, 'a need needs a refusal line');
  if (exit.breakthrough) {
    if (!exit.refuse) bad(where, 'a breakthrough needs a refusal line for the one not yet at the peak');
    if (chapter.gate == null) bad(where, `a breakthrough in ${chapter.id}, which has no gate`);
    else if (!content.ladder.tiers.some(t => t.gate === chapter.gate)) bad(where, `no tier on the ladder has gate ${chapter.gate}`);
  }
  if (exit.key && !content.riddles.zh.riddles[exit.key]) bad(where, `unknown riddle ${exit.key}`);
  const game = gameOf(exit);
  if (game) {
    if (typeof game.id !== 'string' || !game.id) bad(where, 'a game needs an id');
    if (!GAME_KINDS.has(game.kind)) bad(where, `unknown game kind ${game.kind}`);
    if (game.kind === 'duel' && !ids.creatures.has(game.creature)) bad(where, `duels unknown creature ${game.creature}`);
    if (game.kind === 'duel' && !exit.withdrawn) bad(where, 'a duel needs a withdrawn line');
  }
  if (exit.value && !VALUE_FIELDS.has(exit.value.field)) bad(where, `cannot set ${exit.value.field}`);
  for (const [field, value] of Object.entries(exit.set ?? {})) {
    if (!SETTABLE[field]?.has(value)) bad(where, `cannot set ${field} to ${value}`);
  }
  for (const card of exit.show ?? []) lintCard(where, card, ids, bad);
  for (const line of exit.beat ?? []) if (!speakers.has(line.who)) bad(where, `unknown speaker ${line.who}`);
  lintGrant(where, exit.grant, content, ids, bad);
}

function lintCard(where, card, ids, bad) {
  if (!CARDS.has(card.card)) bad(where, `unknown card ${card.card}`);
  if (card.card === 'creature' && !ids.creatures.has(card.id)) bad(where, `shows unknown creature ${card.id}`);
  if (card.card === 'item') for (const id of card.ids ?? [card.id]) if (!ids.items.has(id)) bad(where, `shows unknown item ${id}`);
}

/* The catalog: a known kind, a picture on disk, a price never below its
   sell price, provinces the world knows, and one effect of the three —
   a key, a pill within its table, a wear on a slot the game has. */
/* The arts: one effect duel.js knows, a tier on the ladder, and every
   creature's `teaches` names one of them. */
function lintArts(content, bad) {
  const seen = new Set();
  for (const art of content.arts?.arts ?? []) {
    const where = `art ${art.id}`;
    if (seen.has(art.id)) bad(where, 'duplicate id');
    seen.add(art.id);
    if (!ART_EFFECTS.includes(art.effect)) bad(where, `unknown effect ${art.effect}`);
    if (!content.ladder.tiers.some(t => t.id === art.tier)) bad(where, `unknown tier ${art.tier}`);
  }
  for (const c of content.creatures.creatures) if (c.teaches && !seen.has(c.teaches)) bad(`creature ${c.id}`, `teaches unknown art ${c.teaches}`);
}

function lintItems(content, bad) {
  const seen = new Set();
  for (const item of content.items.items) {
    const where = `item ${item.id}`;
    if (seen.has(item.id)) bad(where, 'duplicate id');
    seen.add(item.id);
    if (!ITEM_KINDS.has(item.kind)) bad(where, `unknown kind ${item.kind}`);
    if (!item.art) bad(where, 'needs art');
    else if (!fs.existsSync(path.join(content.dir, item.art))) bad(where, `art ${item.art} is missing`);
    // A made thing (a 符 from paper) has no price and is sold nowhere.
    if (item.made) {
      if (!content.items.items.some(i => i.id === item.made.from)) bad(where, `made from unknown item ${item.made.from}`);
      if (item.made.anywhere_from && !content.ladder.tiers.some(t => t.id === item.made.anywhere_from)) bad(where, `made anywhere from unknown tier ${item.made.anywhere_from}`);
      if ((item.sold ?? []).length || item.buy != null || item.sell != null) bad(where, 'a made thing is not sold');
    } else if (!Number.isInteger(item.buy) || !Number.isInteger(item.sell) || item.buy < 0 || item.sell < 0) bad(where, 'buy and sell must be whole numbers');
    else if (item.buy < item.sell) bad(where, `buys for ${item.buy}, below its sell price ${item.sell}`);
    for (const province of item.sold ?? []) if (!content.dictionary.provinces[province]) bad(where, `sold in unknown province ${province}`);
    const e = item.effect;
    if (!e) continue;
    const kinds = ['key', 'progress', 'wear', 'root', 'charm'].filter(k => e[k] != null);
    if (kinds.length !== 1) bad(where, 'an effect is one of key, progress, wear, root, charm');
    if (e.root != null && !ELEMENTS.includes(e.root)) bad(where, `lends unknown root ${e.root}`);
    if (e.charm != null && !item.made) bad(where, 'a charm is made, never sold');
    if (e.progress != null) {
      const table = content.rewards.tables[e.table];
      if (!table) bad(where, `unknown reward table ${e.table}`);
      else if (e.progress > table.progress) bad(where, `progress ${e.progress} is over the ${e.table} cap of ${table.progress}`);
    }
    if (e.wear != null && !WEAR_SLOTS.has(e.wear)) bad(where, `cannot wear on ${e.wear}`);
  }
}

function unreachable(chapter) {
  const seen = new Set();
  const walk = id => {
    if (!id || seen.has(id) || !chapter.scenes[id]) return;
    seen.add(id);
    for (const exit of chapter.scenes[id].exits) walk(exit.next);
  };
  walk(chapter.first_scene);
  return Object.keys(chapter.scenes).filter(id => !seen.has(id));
}

function endsSomewhere(chapter) {
  return Object.values(chapter.scenes).some(s => s.exits.some(e => e.ends === chapter.id));
}

/* ── CLI ── */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, world] = process.argv.slice(2);
  if (verb !== 'lint') { console.error('usage: node content.mjs lint [world]'); process.exit(2); }
  let total = 0;
  for (const id of world ? [world] : listWorlds()) {
    const problems = lint(loadWorld(id));
    for (const p of problems) console.log(`${id}: ${p}`);
    console.log(problems.length ? `${id}: ${problems.length} problem(s)` : `${id}: world ok`);
    total += problems.length;
  }
  process.exit(total ? 1 : 0);
}
