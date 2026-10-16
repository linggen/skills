// Loads a world's authored content and checks it. Pure reads — nothing here
// writes. `node content.mjs lint [world]` prints every problem and exits 1 on
// any; with no world named it lints every world in `worlds/`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_EFFECTS, ELEMENTS, INTENTS, LEAN_IDS } from './duel.js';
import { LOCKABLE, normalizeAnswer, stepOfLayer } from './state.mjs';
import { EFFECTS } from './battle.js';
import { FRAMES, PARTICLES } from './atmos.js';
import { lintCodex } from './codex.js';
import { bookEntries, idsOf } from './book-order.js';
import { rankOf, storyAllows } from './rules/cap.mjs';
import { rhythm } from './rhythm.mjs';
import { huiOf } from './rules/hui.mjs';
import { KINDS as WEATHER_KINDS, SEASONS, WINDS } from './rules/weather.mjs';
import { FESTIVAL_IDS } from './calendar.js';

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
   else — ladder, rewards, herbs, items, riddles, tasks, the tale's shape — is the
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
/* 零层 (ladder.json `zero`) is left only by a story's rise — the book's 小周天.
   A made world has none of the book's scenes, so its first tier starts at 一层,
   as the base's did before 零层 (2026-10-15). */
const withoutZero = ladder => ({
  ...ladder,
  tiers: ladder.tiers.map(({ zero, _zero, ...t }) => (!zero ? t : { ...t, steps: { zh: t.steps.zh.slice(1), en: t.steps.en.slice(1) }, thresholds: t.thresholds.slice(1) })),
});

export function overlayWorld(base, card, overlay) {
  const pid = card.province.id;
  return {
    ...base,
    world: { ...card, made: true },
    ladder: withoutZero(base.ladder),
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
const CARDS = new Set(['codex', 'creature', 'traits', 'map', 'board', 'hexagram', 'gate', 'tribulation', 'item', 'duel', 'treasure']);
const GAME_KINDS = new Set(['duel', 'board']);

/* An exit's game, one shape: `{id, kind, creature?}`; a bare string is a
   board known by its id. */
export const gameOf = exit => (exit?.game == null ? null : typeof exit.game === 'string' ? { id: exit.game, kind: 'board' } : exit.game);
export const ITEM_KINDS = new Set(['pill', 'weapon', 'robe', 'pendant', 'gear', 'artifact', 'treasure', 'key', 'material', 'charm', 'scroll', 'pouch']);
/* What a player wears, each its own slot: a 法器 in hand, a 法衣, a 佩. */
export const ARM_SLOTS = new Map([['weapon', 'weapon'], ['robe', 'robe'], ['pendant', 'pendant']]);
export const WEAR_SLOTS = new Set(['yinyue', 'abode']);
const VALUE_FIELDS = new Set(['name']);
const SETTABLE = { traits: new Set(['v1']) };

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

/* The files the 图鉴 resolves over (scripts/codex.js codexOf): the codex and what it links. */
export const codexFiles = content => ({ codex: content.codex, people: content.people, creatures: content.creatures, items: content.items, arts: content.arts });

export function loadContent(dir = worldDir(DEFAULT_WORLD)) {
  const at = file => readJson(path.join(dir, file));
  return withBalance({
    dir,
    world: at('world.json'),
    names: at('names.json'),
    ladder: at('ladder.json'),
    traits: at('traits.json'),
    rewards: at('rewards.json'),
    creatures: at('creatures.json'),
    herbs: at('herbs.json'),
    items: at('items.json'),
    cards: at('cards.json'),
    arts: at('arts.json'),
    hexagrams: at('hexagrams.json'),
    riddles: { zh: at('riddles/zh.json'), en: at('riddles/en.json') },
    tasks: loadTasks(path.join(dir, 'tasks')),
    tale: at('tale.json'),
    seeds: loadSeeds(path.join(dir, 'seeds')),
    quests: loadQuests(path.join(dir, 'quests')),
    notices: loadNotices(path.join(dir, 'quests', 'templates.json')),
    meets: fs.existsSync(path.join(dir, 'meets.json')) ? readJson(path.join(dir, 'meets.json')) : null,
    lundao: fs.existsSync(path.join(dir, 'lundao.json')) ? readJson(path.join(dir, 'lundao.json')) : null,
    // The small games' registry (games.json, 2026-10-16): each standalone module and its levels.
    games: fs.existsSync(path.join(dir, 'games.json')) ? readJson(path.join(dir, 'games.json')) : null,
    // AI mini-games (rules/aigames.mjs): 二十问's animals, 讨价还价's band and rubric, 断案's cases.
    aigames: fs.existsSync(path.join(dir, 'aigames.json')) ? readJson(path.join(dir, 'aigames.json')) : null,
    // 对对子's 平仄 (新韵, tools/tone-table.py): P · Z · B as strings of characters (scripts/couplet.js).
    tones: fs.existsSync(path.join(dir, 'tones.json')) ? readJson(path.join(dir, 'tones.json')) : null,
    // The companion's past, given back chapter by chapter (companion.mjs § 她的来处).
    lore: fs.existsSync(path.join(dir, 'companion.json')) ? readJson(path.join(dir, 'companion.json')) : null,
    // 斗法小队 (party.json, cards.md § 5): who stands beside the lead in a fight, by the 回.
    party: fs.existsSync(path.join(dir, 'party.json')) ? readJson(path.join(dir, 'party.json')) : null,
    // The standing people (people.json): a scene line's `who` may be one of them, or a slot.
    people: fs.existsSync(path.join(dir, 'people.json')) ? readJson(path.join(dir, 'people.json')) : null,
    // 图鉴 (scripts/codex.js): one entry per subject, linked to the files above; the book reads the same.
    codex: fs.existsSync(path.join(dir, 'codex.json')) ? readJson(path.join(dir, 'codex.json')) : null,
    // Scrolls a thing can be read as (rules/scrolls.mjs): 《吐纳经》 and its nine layers.
    scrolls: fs.existsSync(path.join(dir, 'scrolls.json')) ? readJson(path.join(dir, 'scrolls.json')) : null,
    // 节日 (design.md § 真实世界): the real calendar's festivals, one entry each (rules/festival.mjs).
    festivals: fs.existsSync(path.join(dir, 'festivals.json')) ? readJson(path.join(dir, 'festivals.json')) : null,
    // 喂饭桶's free play (rules/fantong.mjs): inputs → pools → outputs, the limit, the 方子.
    fantong: fs.existsSync(path.join(dir, 'fantong.json')) ? readJson(path.join(dir, 'fantong.json')) : null,
    places: loadPlaces(path.join(dir, 'places')),
    templates: { made: at('templates/made-scene.json'), world: at('templates/made-world.json') },
    dictionary: at('dictionary.json'),
    chapters: playedChapters(loadChapters(path.join(dir, 'chapters')), loadBook(path.basename(dir))),
    // The book the world is read from (story/<id>/book.json): its 卷 and 回 name the game's parts (rules/hui.mjs).
    book: loadBook(path.basename(dir)),
    // One model for every number (design.md § Pacing and the economy): folded in by withBalance.
    balance: fs.existsSync(path.join(dir, 'balance.json')) ? readJson(path.join(dir, 'balance.json')) : null,
  });
}

/* One model for every number (Hanli, 2026-10-15): balance.json declares the 层 thresholds, the pay
   tables, the fight-to-灵石 rate and the routine's cooldowns, and they land where the rules read
   them — each tier's `thresholds`, rewards `tables` and `xiuwei_to_lingshi`, the ladder's
   `overflow_stretch`, every rerun's `every_h`, the 饭桶's `limit.cooldown_min`. A world with no
   balance.json keeps its own files' numbers. tools/balance.mjs simulates the players on it. */
export function withBalance(content) {
  const b = content.balance;
  if (!b) return content;
  const c = b.cooldowns ?? {};
  const ladder = { ...content.ladder, ...(b.overflow_stretch != null ? { overflow_stretch: b.overflow_stretch } : {}),
    tiers: content.ladder.tiers.map(t => (b.layers?.[t.id] ? { ...t, thresholds: [...b.layers[t.id]] } : t)) };
  const rewards = { ...content.rewards, ...(b.pay ? { tables: structuredClone(b.pay) } : {}), ...(b.convert ? { xiuwei_to_lingshi: structuredClone(b.convert) } : {}) };
  if (c.rerun_h != null) for (const ch of Object.values(content.chapters ?? {})) for (const beat of ch.beats ?? []) if (beat.sealed?.rerun) beat.sealed.rerun.every_h = c.rerun_h;
  const fantong = content.fantong && c.fantong_min != null ? { ...content.fantong, limit: { ...content.fantong.limit, cooldown_min: c.fantong_min } } : content.fantong;
  // Shop prices (`prices`): every `buy` and `sell` lives here, folded onto its item.
  const items = b.prices && content.items ? { ...content.items, items: content.items.items.map(i => (b.prices[i.id] ? { ...i, ...b.prices[i.id] } : i)) } : content.items;
  return { ...content, ladder, rewards, fantong, items };
}

/* The chapters as played: each 今 interlude spliced in where it stands
   (spliceInterludes) — one the book holds back (`draft`) is not played at all. */
export function playedChapters(chapters, book) {
  const held = new Set((book?.volumes ?? []).flatMap(v => v.hui ?? []).filter(h => h.draft).flatMap(idsOf));
  for (const ch of Object.values(chapters)) {
    for (const sc of Object.values(ch.scenes)) if (held.has(sc.hui) && /^j/.test(sc.hui)) delete ch.scenes[sc.id];
    spliceInterludes(ch);
  }
  return chapters;
}

/* The novel told in a world (story/index.json's books, the one whose `world`
   is this folder's name), or null — a world with no book names its parts by
   its chapters' own titles. */
export const STORY_DIR = path.resolve(WORLDS_DIR, '../story');
function loadBook(world) {
  const index = path.join(STORY_DIR, 'index.json');
  if (!fs.existsSync(index)) return null;
  for (const id of readJson(index).books ?? []) {
    const file = path.join(STORY_DIR, id, 'book.json');
    const book = fs.existsSync(file) ? readJson(file) : null;
    if (book?.world === world) return book;
  }
  return null;
}

export function loadChapters(root) {
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

/* 今线 in the game (Hanli, 2026-10-05: 今线进游戏，做成四段可玩的插曲): an
   interlude (a 回 of book.json's `line: "jin"`) is a few scenes of its own,
   played between two 古 films as the book reads. It stands in the chapter of
   the 古 scene it leads into, and its first scene declares it — `before:
   <scene>` — nothing in the 古 scenes names it. Loading splices it in: every
   road into that scene (an exit's `next`, or the chapter's `first_scene`)
   leads into the interlude instead, and the interlude's last exit names the
   scene. A save before the point plays it; a save already past it is never
   pulled back (it reads the interlude in the book). Returns the heads spliced. */
export function spliceInterludes(chapter) {
  const scenes = Object.values(chapter.scenes ?? {}), heads = scenes.filter(sc => typeof sc.before === 'string');
  for (const head of heads) {
    const own = new Set(scenes.filter(sc => sc.hui === head.hui).map(sc => sc.id));
    for (const sc of scenes) {
      if (own.has(sc.id)) continue;
      for (const e of sc.exits ?? []) if (e.next === head.before) e.next = head.id;
    }
    if (chapter.first_scene === head.before) chapter.first_scene = head.id;
  }
  return heads.map(h => h.id);
}

/* 奇遇 seeds, one file per province: { 徐: { province, seeds } }. */
/* 差事, one file per province (design.md § 差事). They are DATA: Ling writes
   the giver's words around them and never invents the terms or the reward. */
/* The tasks, one file per part of the book (2026-10-15, the per-回 plan: `tasks/world.json`
   holds the world's own, `tasks/h08.json` 古六's boards, and so on): read world.json first, the
   rest in name order, into the one list every reader knows (`content.tasks.tasks`). An id is
   unique across the files (lint). */
function loadTasks(root) {
  const names = fs.readdirSync(root).filter(f => f.endsWith('.json')).sort((a, b) => (a === 'world.json' ? -1 : b === 'world.json' ? 1 : a.localeCompare(b)));
  const docs = names.map(f => readJson(path.join(root, f)));
  return { version: docs[0]?.version ?? 1, _about: docs[0]?._about, tasks: docs.flatMap(d => d.tasks ?? []) };
}

function loadQuests(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.json')).sort()) {
    const doc = readJson(path.join(root, file));
    for (const q of doc.quests ?? []) out.push({ ...q, province: doc.province });
  }
  return out;
}

/* 榜文: the templates a market's daily 差事 is made from. A world without
   the file posts none. */
function loadNotices(file) {
  return fs.existsSync(file) ? readJson(file).templates ?? [] : [];
}

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
/* A made grant is progress and wealth from an allowed table, nothing more:
   an item, a beast, a card or an art named by the model would be a gift the
   model gave itself (review, 2026-09-24 — a well that handed out 息壤 and 应龙). */
export const MADE_GRANT = new Set(['table', 'progress', 'wealth']);

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
    for (const k of Object.keys(exit.grant ?? {})) if (!MADE_GRANT.has(k)) bad(`${where} exit ${exit.id}`, `a grant may not give ${k} — progress and wealth only`);
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

/* Warnings: what the lint lets through for now and lists — the rhythm of a
   chapter's main line (rhythm.mjs: the book read between two play beats). */
export { RHYTHM_CAP } from './rhythm.mjs';
export const warnings = (content, opts = {}) => rhythm(content, opts);

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
  lintFrom(content, bad);
  lintArts(content, bad);
  bilingual(content, 'content', bad);
  for (const [part, node] of Object.entries(content)) {
    if (!['dir', 'world', 'names'].includes(part)) refusedNames(node, content, part, bad);
  }
  lintLadder(content.ladder, bad);
  lintBreakthrough(content, bad);
  lintCaps(content, bad);
  lintCreatures(content, bad);
  lintRiddles(content.riddles, bad);
  lintBook(content, bad);
  lintFate(content, bad);
  for (const task of content.tasks.tasks) lintTask(task, content, ids, bad);
  for (const id of doubled(content.tasks.tasks.map(t => t.id))) bad(`task ${id}`, 'is defined twice (tasks/*.json ids are one namespace)');
  lintTaleShape(content, ids, bad);
  for (const chapter of Object.values(content.chapters)) lintChapter(chapter, content, ids, bad);
  lintSeeds(content, ids, bad);
  lintQuests(content, ids, bad);
  lintNotices(content, bad);
  lintMeets(content, ids, bad);
  lintPlaces(content, ids, bad);
  lintAtlas(content, bad);
  lintLore(content, bad);
  lintPeople(content, bad);
  lintFestivals(content, bad);
  lintWeather(content, bad);
  lintJuan(content, bad);
  if (content.codex) for (const p of lintCodex(codexFiles(content), f => fs.existsSync(path.join(content.dir, f)))) bad('codex', p);
  // A codex entry's first scene is a scene of this world.
  const sceneIds = new Set(Object.values(content.chapters).flatMap(ch => Object.keys(ch.scenes ?? {})));
  for (const [id, e] of Object.entries(content.codex?.entries ?? {})) if (e.first?.scene && !sceneIds.has(e.first.scene)) bad('codex', `${id}: first scene ${e.first.scene} is not a scene`);
  return problems;
}

/* 卷 (world.mjs juanOpen, ofJuan): a `juan` is a 卷 number from 1, on a
   creature, an item, a seed, an errand or a find alike — and a thing of 卷一
   names nothing of a later 卷: a haunt's beast, a pool's, a shop's goods, an
   errand's beast or grant. */
function lintJuan(content, bad) {
  const ok = n => n == null || (Number.isInteger(n) && n >= 1);
  const of = (list, id) => list.find(x => x.id === id)?.juan ?? 1;
  const things = [
    ...content.creatures.creatures.map(x => [`creature ${x.id}`, x]),
    ...content.items.items.map(x => [`item ${x.id}`, x]),
    ...Object.entries(content.seeds ?? {}).flatMap(([p, d]) => (d.seeds ?? []).map(x => [`seed ${p} ${x.id}`, x])),
    ...(content.quests ?? []).map(x => [`quest ${x.id}`, x]),
    ...Object.entries(content.meets?.finds ?? {}).flatMap(([p, l]) => l.map((x, n) => [`find ${p} ${n}`, x])),
  ];
  for (const [where, x] of things) if (!ok(x.juan)) bad(where, `juan ${x.juan} is not a 卷 number`);
  const beasts = content.creatures.creatures, goods = content.items.items;
  for (const q of content.quests ?? []) {
    const j = q.juan ?? 1;
    for (const n of q.need ?? []) if (n.creature && of(beasts, n.creature) > j) bad(`quest ${q.id}`, `asks for ${n.creature}, of a later 卷`);
    if (q.grant?.item && of(goods, q.grant.item) > j) bad(`quest ${q.id}`, `pays ${q.grant.item}, of a later 卷`);
  }
}

/* festivals.json: every festival the calendar names has one entry and no
   other; each has its line, task, gift and her words in both languages
   (bilingual checks the pairs), dressing the page can draw, and a gift no
   bigger than a task's pay — a festival is a treat, not a farm. */
export { FESTIVAL_IDS };
function lintFestivals(content, bad) {
  const list = content.festivals?.festivals;
  if (!list) return;
  const seen = new Set();
  for (const f of list) {
    const where = `festival ${f.id}`;
    if (!FESTIVAL_IDS.includes(f.id)) bad(where, 'is not a festival the calendar knows');
    if (seen.has(f.id)) bad(where, 'twice');
    seen.add(f.id);
    for (const key of ['name', 'line', 'her']) if (!pair(f[key])) bad(where, `${key} needs zh and en`);
    if (!pair(f.task?.label) || !pair(f.task?.what)) bad(where, 'the task needs its label and what, zh and en');
    if (!pair(f.gift?.line) || !(f.gift?.wealth > 0)) bad(where, 'the gift needs a line and some 灵石');
    else if (f.gift.wealth > content.rewards.tables.task.wealth) bad(where, `gift ${f.gift.wealth} is over a task's ${content.rewards.tables.task.wealth}`);
    if (f.dressing?.frame != null && !FRAMES.includes(f.dressing.frame)) bad(where, `unknown frame ${f.dressing.frame}`);
    if (f.dressing?.particles != null && !PARTICLES.includes(f.dressing.particles)) bad(where, `unknown particles ${f.dressing.particles}`);
    if (f.backdrop != null && !fs.existsSync(path.join(content.dir, f.backdrop))) bad(where, `backdrop ${f.backdrop} is missing`);
  }
  for (const id of FESTIVAL_IDS) if (!seen.has(id)) bad('festivals', `${id} has no entry`);
}

/* The people who speak besides the creatures, and the slots that stand for one. */
const peopleIds = content => [...(content.people?.people ?? []).map(p => p.id), ...Object.keys(content.people?.slots ?? {})];

/* people.json: a lowercase id no creature has, a name, role and voice in both
   languages, a home the map knows, a portrait on disk; each slot names a
   person; each address word is a zh + en pair; the hero (fixed, 2026-09-30)
   has a name in both languages and a gender. */
/* A scene's `weather` is the story's sky (rules/weather.mjs): one of KINDS, or absent;
   its `season` one of SEASONS and its `wind` a WINDS level; a 回's `season` (book.json) too. */
function lintWeather(content, bad) {
  const levels = WINDS.map(w => w.level);
  for (const chapter of Object.values(content.chapters)) {
    for (const [id, scene] of Object.entries(chapter.scenes ?? {})) {
      if (scene.weather != null && !WEATHER_KINDS.includes(scene.weather)) bad(`scene ${id}`, `weather ${scene.weather} is not one of ${WEATHER_KINDS.join(' · ')}`);
      if (scene.season != null && !SEASONS.includes(scene.season)) bad(`scene ${id}`, `season ${scene.season} is not one of ${SEASONS.join(' · ')}`);
      if (scene.wind != null && !levels.includes(scene.wind)) bad(`scene ${id}`, `wind ${scene.wind} is not one of ${levels.join(' · ')}`);
    }
  }
  for (const h of bookEntries(content.book ?? {}, { draft: true })) {
    if (h.season != null && !SEASONS.includes(h.season)) bad(`回 ${h.id}`, `season ${h.season} is not one of ${SEASONS.join(' · ')}`);
  }
}

function lintPeople(content, bad) {
  const doc = content.people;
  if (!doc) return;
  const places = new Set(Object.values(content.places).flatMap(d => d.places.map(p => p.id)));
  const creatures = new Set(content.creatures.creatures.map(c => c.id));
  const seen = new Set();
  for (const p of doc.people ?? []) {
    const at = `person ${p.id}`;
    if (!ID.test(p.id ?? '')) bad(at, 'id must be lowercase letters, digits and dashes');
    if (seen.has(p.id) || creatures.has(p.id) || SPEAKERS.has(p.id)) bad(at, 'id is taken');
    seen.add(p.id);
    for (const k of ['name', 'role', 'voice']) if (!pair(p[k])) bad(at, `${k} needs zh and en`);
    // 今线's people (`line: "jin"`, the interludes): no home on the map, and a name card until a portrait is painted.
    if (p.line != null && p.line !== 'jin') bad(at, 'line is jin or absent');
    const jin = p.line === 'jin';
    if (!jin && !places.has(p.home)) bad(at, `home ${p.home} is not a place`);
    if (jin && p.home != null) bad(at, 'a 今 person has no home on the map');
    if (!p.art && !jin) bad(at, 'needs a portrait');
    else if (p.art && !fs.existsSync(path.join(content.dir, p.art))) bad(at, `art ${p.art} is missing`);
  }
  for (const [slot, id] of Object.entries(doc.slots ?? {})) {
    if (seen.has(slot)) bad(`slot ${slot}`, 'shares an id with a person');
    if (!seen.has(id)) bad(`slot ${slot}`, `${id} is no person`);
  }
  for (const [word, v] of Object.entries(doc.address ?? {})) {
    if (typeof v?.zh !== 'string' || typeof v?.en !== 'string') bad(`address ${word}`, 'needs zh and en');
  }
  if (doc.hero && (!pair(doc.hero.name) || !['female', 'male'].includes(doc.hero.gender))) bad('hero', 'needs a name in zh and en and a gender');
}

/* The animations the stage plays for her unease (scripts/unease.js SHOWS). */
export const UNEASE_SHOWS = ['dissolve', 'mist', 'moondark', 'fade', 'telling'];

/* Her lore (companion.json): her fear and want, where she stands when she
   joins, and the secret — its chapters in order, and from the one she
   realizes it to the one she tells it, the price showing (`secret.unease`).
   Her memories are memories.json (rules/memories.mjs lintMemories); the old
   bell-child `thread` was retired 2026-09-29 and is refused if it comes back. */
function lintLore(content, bad) {
  const lore = content.lore;
  if (!lore) return;
  const pair = t => Boolean(t?.zh && t?.en);
  if (lore.id !== content.world.companion?.id) bad('lore', `id ${lore.id} is not the world's companion`);
  for (const k of ['fear', 'want']) if (!pair(lore[k])) bad('lore', `${k} needs zh and en`);
  if (!pair(lore.joined?.knows) || !pair(lore.joined?.feels)) bad('lore', 'joined needs knows and feels');
  if (lore.thread) bad('lore', 'thread is retired — her past is memories.json');
  // The lines she lives on (companion.mjs herAway): lines the book has, and her words for being away.
  if (lore.lines != null) {
    const known = new Set((content.book?.volumes ?? []).flatMap(v => v.hui ?? []).map(h => h.line ?? 'gu'));
    if (!Array.isArray(lore.lines) || !lore.lines.length || lore.lines.some(l => !known.has(l))) bad('lore', 'lines are lines the book has');
    if (!pair(lore.away)) bad('lore', 'away needs zh and en');
  }
  const sec = lore.secret;
  if (!sec) return;
  const chapterId = id => /^\d\d-[a-z]+$/.test(id ?? '');
  if (!pair(sec.text) || !pair(sec.resolved)) bad('lore secret', 'text and resolved need zh and en');
  for (const k of ['realized', 'told', 'whole']) if (!chapterId(sec[k])) bad('lore secret', `${k} is not a chapter id`);
  if (!(sec.realized < sec.told && sec.told < sec.whole)) bad('lore secret', 'realized, told, whole go in chapter order');
  // The price showing (redesign-v2 § 六 item 3): every chapter from the one
  // she realizes it to the one she tells it has its unease — facts for her,
  // an animation the stage knows, one sentence of what she does for Ling.
  const unease = sec.unease ?? {};
  for (const [ch, u] of Object.entries(unease)) {
    const at = `lore ${ch} unease`;
    if (!chapterId(ch)) bad(at, 'not a chapter id');
    else if (ch < sec.realized || ch > sec.told) bad(at, 'outside realized…told');
    if (!pair(u?.fact) || !pair(u?.ling)) bad(at, 'fact and ling need zh and en');
    if (!UNEASE_SHOWS.includes(u?.show)) bad(at, `show ${u?.show} is not one the stage plays (${UNEASE_SHOWS.join(', ')})`);
  }
  // Every chapter of the world between realized and told is covered.
  for (const ch of Object.keys(content.chapters ?? {}).filter(id => id >= sec.realized && id <= sec.told)) {
    if (!unease[ch]) bad(`lore ${ch} unease`, 'missing — every chapter from realized to told shows the price');
  }
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

function lintVisitor(p, itemIds, bad) {
  const st = p.has.visitor, v = st.visits ?? {}, where = `place ${p.id} visitor`;
  if (p.has.shop || p.has.games?.length) bad(where, 'a visiting shop stands alone: no shop, no game beside it');
  if (!pair(st.name) || !pair(st.keeper) || !pair(st.line)) bad(where, 'needs a name, a keeper and a line in zh and en');
  for (const id of [...(st.goods ?? []), ...(st.odd ?? [])]) if (!itemIds.has(id)) bad(where, `unknown item ${id}`);
  if (!(st.goods ?? []).length) bad(where, 'sells nothing');
  if (!(Number.isInteger(v.every) && v.every > 0) || !(Number.isInteger(v.offset ?? 0) && (v.offset ?? 0) >= 0 && (v.offset ?? 0) < v.every)) bad(where, 'visits need every > 0 and 0 <= offset < every');
  if (!pair(v.today) || !pair(v.later)) bad(where, 'visits need today and later lines in zh and en');
  if (st.buys && !(st.buys.rate > 0 && st.buys.rate <= 1)) bad(where, 'buys at a rate in (0, 1]');
}

function lintPlaces(content, ids, bad) {
  // A painted map (`plates`, 观内 2026-10-15): its picture on disk, a name, an aspect; each place on it a spot in 0–1.
  const plates = Object.fromEntries(Object.values(content.places).flatMap(doc => Object.entries(doc.plates ?? {})));
  for (const [id, pl] of Object.entries(plates)) {
    // A plate may be unpainted (drawn in ink, plate.js); one that names a painting must have it.
    if (pl.file && !fs.existsSync(path.join(content.dir, pl.file))) bad(`plate ${id}`, `picture ${pl.file} is missing`);
    if (!pair(pl.name) || !(pl.aspect > 0)) bad(`plate ${id}`, 'needs a name in zh and en and an aspect');
  }
  for (const doc of Object.values(content.places)) for (const p of doc.places) if (p.plate) {
    if (!plates[p.plate.id]) bad(`place ${p.id}`, `on unknown plate ${p.plate.id}`);
    if (!onMap(p.plate.at)) bad(`place ${p.id}`, 'its spot on the plate needs [x, y], fractions 0–1');
  }
  // A visiting shop (rules/visiting.mjs): a shop's shape, its days, its words; never beside a shop or a game.
  const itemIds = new Set(content.items.items.map(i => i.id));
  for (const doc of Object.values(content.places)) for (const p of doc.places) if (p.has?.visitor) lintVisitor(p, itemIds, bad);
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
      // A pool (world.mjs poolBeast): one of its province's, and not beside a haunt of its own.
      if (place.has?.pool != null && !doc.pools?.[place.has.pool]) bad(at, `joins unknown pool ${place.has.pool}`);
      if (place.has?.pool != null && place.has?.creature) bad(at, 'a haunt or a pool, not both');
      // A game a place hosts is a hosted board task with a module to play it.
      for (const g of place.has?.games ?? []) {
        const t = (content.tasks?.tasks ?? []).find(x => x.id === g);
        if (!t) bad(at, `hosts unknown game ${g}`);
        else if (!t.hosted || !['board', 'word'].includes(t.kind)) bad(at, `hosts ${g}, which is not a hosted game`);
      }
      if (place.has?.scene && !scenes.has(place.has.scene)) bad(at, `has unknown scene ${place.has.scene}`);
      if (content.world?.atlas && !onMap(place.map)) bad(at, 'needs map [x, y] on the world map, fractions 0–1 (tools/pin.py)');
    }
    for (const [id, pool] of Object.entries(doc.pools ?? {})) {
      if (!pair(pool.name)) bad(`pool ${id}`, 'needs a name in zh and en');
      if (!(pool.beasts ?? []).length) bad(`pool ${id}`, 'holds no beast');
      for (const b of pool.beasts ?? []) {
        if (!ids.creatures.has(b.creature)) bad(`pool ${id}`, `holds unknown creature ${b.creature}`);
        else if (content.creatures.creatures.find(c => c.id === b.creature)?.person) bad(`pool ${id}`, `${b.creature} is a person, fought in a scene`);
        if (b.weight != null && !(Number.isInteger(b.weight) && b.weight >= 1)) bad(`pool ${id}`, `${b.creature}: weight is a whole number from 1`);
        // The pool's own deck (world.mjs foeOf): a deck of real, dealt cards, standing over the creature's.
        const known = new Set((content.cards?.cards ?? []).filter(c => !c._token).map(c => c.id));
        if (b.deck != null && !(Array.isArray(b.deck) && b.deck.length === 12 && b.deck.every(c => known.has(c)))) bad(`pool ${id}`, `${b.creature}: deck is twelve known cards`);
        // creatures.json `_hunt`: an entry waits for a 回 of the book, and keeps to night or day.
        if (b.from != null && !huiOf(content, b.from)) bad(`pool ${id}`, `${b.creature}: from names no 回 of the book (${b.from})`);
        if (b.when != null && !['night', 'day'].includes(b.when)) bad(`pool ${id}`, `${b.creature}: when is night or day, not ${b.when}`);
      }
      if (pool.memory != null && !(Number.isInteger(pool.memory) && pool.memory >= 0)) bad(`pool ${id}`, 'memory is a whole number from 0');
      if (pool.fresh != null && !(typeof pool.fresh === 'number' && pool.fresh >= 1)) bad(`pool ${id}`, 'fresh is a weight from 1');
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
    if (key.startsWith('_') || key === 'riddles' || key === 'lundao' || key === 'address' || key === 'alias') continue; // per-language lists, not pairs; an address may be empty; an animal's aliases (aigames.json) are per language
    bilingual(value, `${where}.${key}`, bad);
  }
}

/* A seed names a kind the templates know, a province the terms know, and a
   creature only when the creature has its card. */
/* 差事: taken from a place that exists, needing something the rules can SEE
   tick (a counter nobody can verify is a lie), paying from a table that
   exists, and chaining only to a quest that is there. */
export const NEED_KINDS = new Set(['subdue', 'tame', 'carry', 'visit', 'board', 'answer', 'chore']);

function lintQuests(content, ids, bad) {
  const quests = content.quests ?? [];
  const byId = new Set(quests.map(q => q.id));
  const places = new Set(Object.values(content.places).flatMap(d => d.places.map(p => p.id)));
  const seen = new Set();
  for (const q of quests) {
    const where = `quest ${q.id}`;
    if (!ID.test(q.id ?? '')) bad(where, 'id must be lowercase letters, digits and dashes');
    if (seen.has(q.id)) bad(where, 'duplicate id');
    seen.add(q.id);
    if (!pair(q.title)) bad(where, 'title needs zh and en');
    if (!pair(q.say)) bad(where, 'the giver\'s line needs zh and en');
    if (q.seen && !pair(q.seen)) bad(where, 'what is seen there needs zh and en');
    if (!places.has(q.from?.place)) bad(where, `taken at unknown place ${q.from?.place}`);
    if (q.from?.who && !pair(q.from.who)) bad(where, 'the giver needs a name in both languages');
    if (!content.rewards.tables[q.grant?.table]) bad(where, `unknown reward table ${q.grant?.table}`);
    if (q.grant?.item && !ids.items.has(q.grant.item)) bad(where, `gives unknown item ${q.grant.item}`);
    if (q.grant?.card && !(content.cards?.cards ?? []).some(c => c.id === q.grant.card && !c._token)) bad(where, `gives unknown card ${q.grant.card}`);
    if (q.then && !byId.has(q.then)) bad(where, `chains to unknown quest ${q.then}`);
    // A 执事堂 令 (world.mjs grantPass): the one place it opens the road to.
    if (q.pass && !places.has(q.pass.to)) bad(where, `a pass to unknown place ${q.pass?.to}`);
    for (const id of q.pass?.also ?? []) if (!places.has(id)) bad(where, `a pass also to unknown place ${id}`);
    if (q.opens?.after && !byId.has(q.opens.after)) bad(where, `opens after unknown quest ${q.opens.after}`);
    if (q.opens?.tier && !content.ladder.tiers.some(t => t.id === q.opens.tier)) bad(where, `unknown tier ${q.opens.tier}`);
    if (q.opens?.layer && !(content.ladder.tiers.find(t => t.id === q.opens.layer.tier)?.thresholds.length > q.opens.layer.step)) bad(where, `opens at an unknown layer ${JSON.stringify(q.opens.layer)}`);
    // Story time (errands.mjs offersOf): offered once a scene is behind him (`done`), or only before it (`before`).
    const sceneIds = new Set(Object.values(content.chapters).flatMap(ch => Object.keys(ch.scenes ?? {})));
    for (const k of ['done', 'before']) if (q.opens?.[k] != null && !sceneIds.has(q.opens[k])) bad(where, `opens ${k} unknown scene ${q.opens[k]}`);
    const needs = Array.isArray(q.need) ? q.need : [];
    if (!needs.length) bad(where, 'needs at least one thing to do');
    for (const n of needs) {
      if (!NEED_KINDS.has(n?.kind)) bad(where, `unknown need ${n?.kind}`);
      if (!(n?.n > 0)) bad(where, `${n?.kind} needs a count`);
      if (n?.creature && !ids.creatures.has(n.creature)) bad(where, `names unknown creature ${n.creature}`);
      if (n?.item && !ids.items.has(n.item)) bad(where, `names unknown item ${n.item}`);
      if (n?.place && !places.has(n.place)) bad(where, `names unknown place ${n.place}`);
      if (n?.task && !content.tasks.tasks.some(t => t.id === n.task)) bad(where, `names unknown task ${n.task}`);
    }
  }
}

/* 榜文: a template's id rides inside a 差事 id, so it is letters only; its
   kind is one whose target the rules can choose from the map. */
export const NOTICE_KINDS = new Set(['subdue', 'visit', 'board']);

function lintNotices(content, bad) {
  const seen = new Set();
  for (const t of content.notices ?? []) {
    const where = `notice ${t.id}`;
    if (!/^[a-z]+$/.test(t.id ?? '')) bad(where, 'id must be lowercase letters only');
    if (seen.has(t.id)) bad(where, 'duplicate id');
    seen.add(t.id);
    if (!NOTICE_KINDS.has(t.kind)) bad(where, `unknown kind ${t.kind}`);
    if (!(t.n > 0)) bad(where, 'needs a count');
    for (const key of ['title', 'who', 'say']) if (!pair(t[key])) bad(where, `${key} needs zh and en`);
    if (!content.rewards.tables[t.grant?.table]) bad(where, `unknown reward table ${t.grant?.table}`);
  }
}

/* 遇: the road's riddles exist and are never a scene's own; a find names an
   item that exists or a few stones, and says its line in both languages. */
export const MEET_KINDS = ['find', 'riddle', 'beast', 'trial'];

function lintMeets(content, ids, bad) {
  const m = content.meets;
  if (!m) return;
  for (const k of Object.keys(m.weights ?? {})) if (!MEET_KINDS.includes(k)) bad('meets', `unknown kind ${k}`);
  // 抉择: the rules' half of it — marks on the die, and a win and a loss for each.
  if (m.weights?.trial) {
    const t = m.trial;
    if (!t?.die || !t.marks || !t.win || !t.lose || !t.options) bad('meets', 'trial needs die, marks, win, lose and options');
    else for (const d of Object.keys(t.marks)) {
      if (!(t.marks[d] >= 1 && t.marks[d] <= t.die)) bad('meets', `trial mark ${d} is off the die`);
      if (!t.win[d]) bad('meets', `trial ${d} wins nothing`);
      for (const [stake, by] of Object.entries(t.lose)) if (by[d] == null) bad('meets', `trial ${d} has no ${stake} loss`);
      if ((t.win[d]?.progress ?? 0) > content.rewards.tables.trial?.progress || (t.win[d]?.wealth ?? 0) > content.rewards.tables.trial?.wealth) bad('meets', `trial ${d} pays over the trial table`);
    }
  }
  const story = new Set(Object.values(content.chapters).flatMap(c => Object.values(c.scenes)).flatMap(sc => sc.exits ?? []).flatMap(e => (e.key == null ? [] : [].concat(e.key))));
  for (const key of m.riddles ?? []) {
    if (!content.riddles.zh.riddles[key]) bad('meets', `unknown riddle ${key}`);
    if (story.has(key)) bad('meets', `riddle ${key} belongs to a scene — the road would spoil it`);
  }
  for (const p of Object.values(content.places).flatMap(d => d.places)) {
    for (const k of p.meets ?? []) if (!MEET_KINDS.includes(k)) bad(`place ${p.id}`, `may deal unknown 遇 ${k}`);
  }
  for (const [province, finds] of Object.entries(m.finds ?? {})) {
    for (const f of finds) {
      const where = `meets find (${province})`;
      if (!pair(f.line)) bad(where, 'the line needs zh and en');
      if (f.item ? !ids.items.has(f.item) : !(f.wealth > 0)) bad(where, 'names an item that exists, or a few stones');
      if (f.wealth > content.rewards.tables.meet.wealth) bad(where, `pays ${f.wealth}, over the meet table's ${content.rewards.tables.meet.wealth}`);
      for (const id of f.at ?? []) {
        const at = Object.values(content.places).flatMap(d => d.places.map(p => ({ ...p, province: d.province }))).find(p => p.id === id);
        if (!at) bad(where, `lies at unknown place ${id}`);
        else if (province !== '*' && at.province !== province) bad(where, `lies at ${id}, which is not in ${province}`);
      }
    }
  }
}

/* 今日传闻's shape (tale.json) and its pay (rewards.json § tale): every game
   a board the page can deal or a word game the rules judge, two or three
   story uses each; the pay tables and the drops real, each drop of a tier
   the ladder has. A tale Ling writes is linted against this in rules/tale.mjs. */
const TALE_WORD_GAMES = new Set(['riddle', 'lundao']);
function lintTaleShape(content, ids, bad) {
  const t = content.tale, r = content.rewards;
  if (!t) { bad('tale', 'tale.json is missing'); return; }
  if (!(t.steps?.min >= 1 && t.steps.max >= t.steps.min)) bad('tale', 'steps needs min ≤ max');
  if (!(t.kinds_min >= 1 && t.kinds_min <= t.steps?.min)) bad('tale', 'kinds_min must fit the fewest steps');
  for (const [id, g] of Object.entries(t.games ?? {})) {
    if (!TALE_WORD_GAMES.has(id) && !g.page) bad(`tale game ${id}`, 'needs the page board it deals');
    if (g.page && g.page !== 'lianliankan' && !fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'games', `${g.page}.js`))) bad(`tale game ${id}`, `no board scripts/games/${g.page}.js`);
    if (!(g.frames?.length >= 2 && g.frames.length <= 3)) bad(`tale game ${id}`, 'two or three frames');
  }
  for (const k of ['tale', 'tale_end']) if (!r.tables[k]) bad('rewards', `no ${k} table`);
  const tiers = new Set(content.ladder.tiers.map(x => x.id)), cards = new Set((content.cards?.cards ?? []).map(c => c.id));
  for (const d of r.tale?.drops ?? []) {
    if (!tiers.has(d.tier)) bad('tale drop', `unknown tier ${d.tier}`);
    if (d.item ? !ids.items.has(d.item) : !cards.has(d.card)) bad('tale drop', `unknown ${d.item ? 'item' : 'card'} ${d.item ?? d.card}`);
  }
}

function lintSeeds(content, ids, bad) {
  const kinds = new Set(Object.keys(content.tale?.seed_kinds ?? {}));
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

/* The cap per 回 (rules/cap.mjs): a 回 the book has, a tier on the ladder, a
   layer it has, a story reach no lower than the player's own, both words in
   both languages; and no scene of a 回 lifts him (`rise`) or breaks him
   through past where its story reaches. Optional. */
function lintCaps(content, bad) {
  const caps = content.ladder.caps, where = 'ladder caps';
  if (!caps) return;
  if (!caps.say?.zh || !caps.say?.en || !caps.refuse?.zh || !caps.refuse?.en) bad(where, 'say and refuse in zh and en');
  const layerOk = at => { const t = content.ladder.tiers.find(x => x.id === at?.tier); return t && Number.isInteger(at.layer) && stepOfLayer(content, t.id, at.layer) >= 0 && stepOfLayer(content, t.id, at.layer) < t.thresholds.length; };
  for (const [id, e] of Object.entries(caps.hui ?? {})) {
    if (!huiOf(content, id)) bad(where, `${id} is not a 回 of the book`);
    if (!layerOk(e) || (e.story && !layerOk(e.story))) { bad(where, `${id}: a tier the ladder has and a layer of it`); continue; }
    if (e.story && rankOf(content, e.story.tier, stepOfLayer(content, e.story.tier, e.story.layer)) < rankOf(content, e.tier, stepOfLayer(content, e.tier, e.layer))) bad(where, `${id}: story under the player's own reach`);    for (const g of e.gates ?? []) lintGate(content, id, e, g, bad);
  }
  const first = content.ladder.tiers[0].id;
  for (const ch of Object.values(content.chapters ?? {})) for (const sc of Object.values(ch.scenes ?? {})) {
    if (!sc.hui) continue;
    const at = { chapter: ch.id, scene: sc.id, tier: first, step: 0, done_scenes: [] };
    for (const e of sc.exits ?? []) {
      const layer = typeof e.rise === 'object' && e.rise ? e.rise.layer : e.rise;
      if (Number.isInteger(layer) && !storyAllows(content, at, first, stepOfLayer(content, first, layer))) bad(`scene ${sc.id} exit ${e.id}`, `rises past the cap of ${sc.hui}`);
      const into = e.breakthrough ? content.ladder.tiers.find(t => t.gate != null && t.gate === ch.gate) : null;
      if (into && !storyAllows(content, at, into.id, 0)) bad(`scene ${sc.id} exit ${e.id}`, `breaks through past the cap of ${sc.hui}`);
    }
  }
}

/* A 阶段任务 (rules/gates.mjs): a scene of that 回 and ways it has, a layer the tier has, no higher
   than the 回's story reaches, and below any rise it holds back; `stage.refuse` says it in both. */
function lintGate(content, hui, cap, g, bad) {
  const where = `ladder caps ${hui} gate ${g.scene}`, tier = g.tier ?? content.ladder.tiers[0].id;
  const sc = Object.values(content.chapters ?? {}).map(ch => ch.scenes?.[g.scene]).find(Boolean);
  if (!sc || sc.hui !== hui) return bad(where, `no scene ${g.scene} in ${hui}`);
  // Never where he cannot walk away to earn it: inside a key beat's lock (after its entry) or a corridor chapter.
  const ch = Object.values(content.chapters ?? {}).find(c => c.scenes?.[g.scene]);
  if (ch.corridor || (ch.beats ?? []).some(b => b.scenes.indexOf(g.scene) > 0)) bad(where, 'inside a locked beat: he could not leave to earn it');
  for (const x of g.exits ?? []) if (!sc.exits.some(e => e.id === x)) bad(where, `no exit ${x}`);
  if (!(g.exits ?? []).length) bad(where, 'no exits');
  const t = content.ladder.tiers.find(x => x.id === tier), step = stepOfLayer(content, tier, g.layer);
  if (!t || !(step >= 0 && step < t.thresholds.length)) return bad(where, `layer ${g.layer} of ${tier}`);
  const story = cap.story ?? cap;
  if (rankOf(content, tier, step) > rankOf(content, story.tier, stepOfLayer(content, story.tier, story.layer))) bad(where, 'past the 回\'s story reach');
  for (const e of sc.exits.filter(x => (g.exits ?? []).includes(x.id) && x.rise != null)) {
    const layer = typeof e.rise === 'object' ? e.rise.layer : e.rise;
    if (tier === content.ladder.tiers[0].id && layer <= g.layer) bad(where, `exit ${e.id} rises to ${layer}, not past the gate's ${g.layer}`);
  }
  if (!content.ladder.caps?.stage?.refuse?.zh || !content.ladder.caps?.stage?.refuse?.en) bad('ladder caps', 'stage.refuse in zh and en');
}

/* 渡劫's odds (rules/breakthrough.mjs): a base for every realm a cauldron
   opens, a floor under a cap, pills the catalog has, elements the roots know,
   and a failure that costs a share and some hours. Optional: a world without
   it breaks through on the breath alone. */
function lintBreakthrough(content, bad) {
  const r = content.ladder.breakthrough, where = 'ladder breakthrough';
  if (!r) return;
  const pct = n => Number.isInteger(n) && n >= 0 && n <= 100, share = n => typeof n === 'number' && n >= 0 && n <= 1;
  for (const t of content.ladder.tiers.filter(t => t.gate != null)) {
    if (!pct(r.base?.[t.id])) bad(where, `base for ${t.id} is a whole percent`);
    if (r.element?.of?.[t.id] && !content.traits.elements?.[r.element.of[t.id]]) bad(where, `element ${r.element.of[t.id]} for ${t.id} is not one of the five`);
  }
  if (!pct(r.floor) || !pct(r.cap) || r.floor > r.cap) bad(where, 'floor and cap are percents, floor under cap');
  if (!pct(r.low)) bad(where, 'low is a percent');
  // A realm's pill, or a list reached for in order (breakthrough.mjs: the 九转 before the 一转).
  for (const [to, ids] of Object.entries(r.pill?.items ?? {})) for (const id of [].concat(ids)) if (!content.items.items.some(i => i.id === id)) bad(where, `pill for ${to}: unknown item ${id}`);
  for (const id of Object.keys(r.pill?.bonus_of ?? {})) if (!content.items.items.some(i => i.id === id)) bad(where, `pill bonus for unknown item ${id}`);
  if (!share(r.body?.share) || !share(r.fail?.wound) || !share(r.fail?.progress)) bad(where, 'body.share, fail.wound and fail.progress are shares of 0–1');
  if (!(r.fail?.cooldown_hours > 0)) bad(where, 'fail.cooldown_hours is some hours');
}

/* A creature's name is read aloud from its pinyin, one syllable a character:
   蠪侄 is lóng zhí. A shipped creature carries it; a made one may. */
function lintPinyin(c, bad, required) {
  if (c.pinyin == null) { if (required) bad(`creature ${c.id}`, 'needs pinyin, one syllable a character of its name'); return; }
  const chars = [...(c.name?.zh ?? '')].filter(ch => /\p{Script=Han}/u.test(ch)).length;
  if (typeof c.pinyin !== 'string' || c.pinyin.trim().split(/\s+/).length !== chars) bad(`creature ${c.id}`, `pinyin "${c.pinyin}" needs one syllable for each of ${chars} characters`);
}

/* 杀招 (battle.js § 杀招): named in both languages, and only verbs from the
   closed vocabulary — a signature that needs a new verb is a rules change. */
function lintSignature(content, c, bad) {
  const at = `creature ${c.id}`, sig = c.signature;
  if (!sig.id || !sig.name?.zh || !sig.name?.en) bad(at, 'signature needs an id and a name in both languages');
  const verbs = Object.keys(sig.effect ?? {});
  if (!verbs.length) bad(at, 'signature does nothing');
  for (const v of verbs) if (!EFFECTS[v]) bad(at, `signature uses an unknown verb: ${v}`);
  const summon = sig.effect?.summon?.id;
  if (summon && !(content.cards?.cards ?? []).some(x => x.id === summon)) bad(at, `signature summons unknown card ${summon}`);
}

function lintCreatures(content, bad) {
  for (const c of content.creatures.creatures) {
    if (!content.traits.elements[c.root]) bad(`creature ${c.id}`, `needs a root the traits know, not ${c.root}`);
    // A made world writes neither lean nor pattern — its id draws them — but
    // what is written must be one of the ways a creature fights.
    if (c.lean != null && !LEAN_IDS.includes(c.lean)) bad(`creature ${c.id}`, `leans an unknown way: ${c.lean}`);
    for (const i of c.pattern ?? []) if (!INTENTS.includes(i)) bad(`creature ${c.id}`, `fights an unknown way: ${i}`);
    for (const d of [c.drops ?? []].flat()) if (!content.items.items.some(i => i.id === d)) bad(`creature ${c.id}`, `drops unknown item ${d}`);
    // `loot` (creatures.json `_loot`): rows of known things, whole weights, a `dup` that is a thing or 灵石.
    if (c.loot != null && !Array.isArray(c.loot)) bad(`creature ${c.id}`, 'loot is a list of {item, w}');
    for (const r of Array.isArray(c.loot) ? c.loot : []) {
      const item = content.items.items.find(i => i.id === r.item);
      if (!item) bad(`creature ${c.id}`, `loot names unknown item ${r.item}`);
      if (r.w != null && !(Number.isInteger(r.w) && r.w >= 1)) bad(`creature ${c.id}`, `loot ${r.item}: w is a whole number from 1`);
      if (r.n != null && !(Number.isInteger(r.n) && r.n >= 1)) bad(`creature ${c.id}`, `loot ${r.item}: n is a whole number from 1`);
      if (r.dup?.item && !content.items.items.some(i => i.id === r.dup.item)) bad(`creature ${c.id}`, `loot ${r.item}: dup names unknown item ${r.dup.item}`);
      if (item && (item.juan ?? 1) > (c.juan ?? 1)) bad(`creature ${c.id}`, `loot ${r.item} is of a later 卷 than the beast`);
    }
    if (!c.made) lintPinyin(c, bad, true);
    if (c.signature) lintSignature(content, c, bad);
    // Caught, not fought (狰): the board it is caught with, and its line when struck at.
    if (c.catch != null && !(content.tasks?.tasks ?? []).some(t => t.id === c.catch && t.kind === 'board')) bad(`creature ${c.id}`, `caught with unknown board ${c.catch}`);
    if (c.catch != null && !pair(c.runs)) bad(`creature ${c.id}`, 'a beast caught, not fought, needs its runs line in zh and en');
    // A person fought as a foe (the 外门大比): one of people.json, never tamed.
    if (c.person != null && (!peopleIds(content).includes(c.person) || c.likes)) bad(`creature ${c.id}`, `a foe is a person of people.json and likes nothing, not ${c.person}`);
    // `appear`: the first meeting played on the stage, a few lines in both languages.
    if (c.appear != null && !(Array.isArray(c.appear.zh) && Array.isArray(c.appear.en) && c.appear.zh.length && c.appear.zh.length <= 8)) bad(`creature ${c.id}`, 'appear is one to eight lines, zh and en');
    // Not yet painted (2026-10-05: 没有画就先不挂画): `unpainted`, and no picture claimed — the 图鉴 shows its words alone.
    if (c.unpainted === true && !c.art && !c.art_source) continue;
    if (!c.art || !c.art_source) { bad(`creature ${c.id}`, 'needs art and art_source (or `unpainted: true` and neither)'); continue; }
    if (!fs.existsSync(path.join(content.dir, c.art))) bad(`creature ${c.id}`, `art ${c.art} is missing`);
  }
}

/* The Book of Changes: all 64, each once, each graded, both languages; the
   asks' effects graded in full; every trigram with its root. */
function lintBook(content, bad) {
  const book = content.hexagrams;
  if (!book?.hexagrams) return;
  const ids = new Set(book.hexagrams.map(h => h.id)), lines = new Set(book.hexagrams.map(h => (h.lines ?? []).join('')));
  if (book.hexagrams.length !== 64 || ids.size !== 64 || lines.size !== 64) bad('hexagrams', 'needs all 64, each once, each with its own six lines');
  const grades = Object.keys(book.grades ?? {});
  for (const h of book.hexagrams) {
    const at = `hexagram ${h.id}`;
    if (!Array.isArray(h.lines) || h.lines.length !== 6 || h.lines.some(b => b !== 0 && b !== 1)) bad(at, 'needs six lines of 0 and 1');
    if (!grades.includes(h.grade)) bad(at, `grade ${h.grade} is not one of ${grades.join(', ')}`);
    for (const k of ['name', 'judgment', 'image']) if (!h[k]?.zh || !h[k]?.en) bad(at, `${k} needs zh and en`);
  }
  for (const [ask, byGrade] of Object.entries(book.effects ?? {})) {
    if (!book.asks?.[ask]?.zh || !book.asks?.[ask]?.en) bad(`ask ${ask}`, 'needs its words in zh and en');
    for (const g of grades) if (!byGrade[g]) bad(`ask ${ask}`, `no effect for ${g}`);
  }
  for (const t of ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun']) if (!ELEMENTS.includes(book.trigram_roots?.[t])) bad('trigram_roots', `${t} needs a root`);
}

/* 命格: twelve signs, ten stems each with an element, a 立春 day for each year. */
function lintFate(content, bad) {
  const f = content.traits?.fate;
  if (!f) return;
  if (f.zodiac?.length !== 12 || f.zodiac.some(z => !z.id || !z.zh || !z.en)) bad('fate', 'needs twelve signs, each with id, zh and en');
  if (f.stems?.length !== 10 || f.stems.some(s => !s.zh || !s.en || !ELEMENTS.includes(s.element))) bad('fate', 'needs ten stems, each with zh, en and an element');
  if (!Number.isInteger(f.lichun?.from) || !/^[345]+$/.test(f.lichun?.days ?? '')) bad('fate', 'lichun needs a first year and a February day (3–5) for each year');
}

function lintRiddles(riddles, bad) {
  const zh = Object.keys(riddles.zh.riddles), en = Object.keys(riddles.en.riddles);
  for (const key of zh) if (!en.includes(key)) bad(`riddle ${key}`, 'has no English');
  for (const key of en) if (!zh.includes(key)) bad(`riddle ${key}`, 'has no Chinese');
  for (const [lang, file] of Object.entries(riddles)) {
    for (const [key, r] of Object.entries(file.riddles)) {
      if (!r.q || !Array.isArray(r.a) || r.a.length === 0) bad(`riddle ${key} (${lang})`, 'needs q and at least one answer');
      // Answers to tap: three or four, the right one among them, the rest wrong.
      const choices = Array.isArray(r.choices) ? r.choices : [];
      const right = choices.filter(c => (r.a ?? []).some(a => normalizeAnswer(a) === normalizeAnswer(c)));
      if (choices.length < 3 || choices.length > 4 || new Set(choices.map(normalizeAnswer)).size !== choices.length) bad(`riddle ${key} (${lang})`, 'needs three or four different choices');
      else if (right.length !== 1) bad(`riddle ${key} (${lang})`, 'choices need exactly one right answer');
    }
  }
}

const markSet = (content, chapter, m) => [chapter, ...Object.values(content.chapters)].some(ch => Object.values(ch.scenes).some(sc => sc.exits.some(e => e.mark === m)))
  || content.tasks.tasks.some(t => Object.values(t.marks ?? {}).includes(m));
const doubled = list => [...new Set(list.filter((x, i) => list.indexOf(x) !== i))];

function lintTask(task, content, ids, bad) {
  const where = `task ${task.id}`;
  lintGrant(where, task.grant, content, ids, bad);
  // A board's grades, each with the mark it writes (tasks.mjs win).
  if (task.marks != null && !(task.kind === 'board' && task.game && Object.entries(task.marks).length && Object.entries(task.marks).every(([g, m]) => /^[a-z][a-z0-9-]*$/.test(g) && /^[a-z][a-z0-9-]*$/.test(String(m))))) bad(where, 'marks are a game board\'s grades, each to a lowercase mark id');
  if (task.gives?.bag && !ids.items.has(task.gives.bag)) bad(where, `gives unknown item ${task.gives.bag}`);
  // A board's own words (`how`, in place of its game's) and deal (`deal`, handed to the game's newGame).
  if (task.how != null && !(task.kind === 'board' && task.game && pair(task.how))) bad(where, 'how is a game board\'s line, in zh and en');
  if (task.deal != null && !(task.kind === 'board' && task.game && typeof task.deal === 'object' && !Array.isArray(task.deal))) bad(where, 'deal is a game board\'s options object');
  for (const e of task.ledger ?? []) if (!['恩', '仇', '诺'].includes(e.kind) || !pair(e.what) || !(content.people?.people ?? []).some(p => p.id === e.who)) bad(where, 'a ledger line needs a known person, 恩/仇/诺, and its what in zh and en');
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
  if (grant.n != null && !(grant.item && Number.isInteger(grant.n) && grant.n >= 1)) bad(where, `n ${grant.n} needs an item and a count of at least 1`);
  if (grant.card && !(content.cards?.cards ?? []).some(c => c.id === grant.card && !c._token)) bad(where, `grants unknown card ${grant.card}`);
  for (const [id, n] of Object.entries(grant.more ?? {})) {
    if (!ids.items.has(id)) bad(where, `grants unknown item ${id}`);
    if (!(Number.isInteger(n) && n >= 1)) bad(where, `more ${id} needs a count of at least 1`);
  }
}

function lintChapter(chapter, content, ids, bad) {
  const where = `chapter ${chapter.id}`;
  if (!chapter.scenes[chapter.first_scene]) bad(where, `first_scene ${chapter.first_scene} does not exist`);
  for (const scene of Object.values(chapter.scenes)) lintScene(scene, chapter, content, ids, bad);
  for (const id of unreachable(chapter)) bad(`scene ${id}`, 'cannot be reached from the first scene');
  if (!endsSomewhere(chapter)) bad(where, 'no exit ends the chapter');
  lintChapterShape(chapter, content, bad);
  // A story gate (state.mjs lockedOf): a scene of its own that opens it, systems the engine knows, a refusal in both languages.
  const lock = chapter.locks;
  if (lock) {
    if (!chapter.scenes[lock.until]) bad(where, `locks until ${lock.until}, which is not a scene of it`);
    if (lock.until === chapter.first_scene) bad(where, 'locks open on the first scene: nothing is shut');
    for (const sys of lock.systems ?? []) if (!(sys in LOCKABLE)) bad(where, `locks an unknown system ${sys}`);
    if (!lock.systems?.length) bad(where, 'locks no system');
    if (!lock.say?.zh || !lock.say?.en) bad(where, 'locks with no refusal line in zh and en');
  }
}

/* The map a chapter opens, its key beats, its goal, its `coming` words
   (world.mjs mapOf / beatOf, errands.mjs goalOf, core.mjs advanceChapter). */
function lintChapterShape(chapter, content, bad) {
  const where = `chapter ${chapter.id}`, known = new Set(Object.values(content.places).flatMap(d => d.places.map(p => p.id)));
  const map = chapter.map;
  if (map) {
    if (!Array.isArray(map.places) || !map.places.length) bad(where, 'a map opens at least one place');
    for (const id of map.places ?? []) if (!known.has(id)) bad(where, `map opens unknown place ${id}`);
    if (map.say != null && !pair(map.say)) bad(where, 'the map\'s refusal needs zh and en');
    if (map.beyond != null && !pair(map.beyond)) bad(where, 'the map\'s line for a province beyond the open 卷 needs zh and en');
    if (map.back != null && !pair(map.back)) bad(where, 'the map\'s line for a save put back home needs zh and en');
    if (map.back_story != null && !pair(map.back_story)) bad(where, 'the map\'s line for the story\'s walk home needs zh and en');
    if (map.home != null && !(map.places ?? []).includes(map.home)) bad(where, `the map's home ${map.home} is not on it`);
    // A walled map (`home`, 观内 2026-10-15) lets the story walk past it to its own scene (world.mjs leaveOf); else a scene stands on the map.
    for (const sc of Object.values(chapter.scenes)) if (sc.at && map.places && !map.home && !map.places.includes(sc.at)) bad(`scene ${sc.id}`, `at ${sc.at}, beyond the map its chapter opens`);
  }
  const inBeats = new Set();
  for (const b of chapter.beats ?? []) {
    const at = `${where} beat ${b.id}`;
    if (!b.id || !pair(b.title)) bad(at, 'a beat needs an id and a title in zh and en');
    if (!Array.isArray(b.scenes) || b.scenes.length < 2) bad(at, 'a beat is its entry and at least one scene it locks');
    for (const id of b.scenes ?? []) {
      if (!chapter.scenes[id]) bad(at, `names unknown scene ${id}`);
      if (inBeats.has(id)) bad(at, `scene ${id} is in two beats`);
      inBeats.add(id);
    }
    if (b.say != null && !pair(b.say)) bad(at, 'a beat\'s refusal needs zh and en');
  }
  const g = chapter.goal;
  if (g) {
    if (!pair(g.title) || !pair(g.date)) bad(where, 'a goal needs its title and date in zh and en');
    if (!chapter.scenes[g.at]) bad(where, `goal at unknown scene ${g.at}`);
    if (!Object.values(chapter.scenes).some(sc => sc.exits.some(e => e.mark === g.eve))) bad(where, `goal eve ${g.eve} is marked by no exit`);
  }
  // `juan`: the 卷 the chapter is of (world.mjs juanOpen), a whole number from 1.
  if (chapter.juan != null && !(Number.isInteger(chapter.juan) && chapter.juan >= 1)) bad(where, 'juan is a 卷 number, 1 or more');
  // `coming` is a flag: its words are the first 回's (rules/hui.mjs comingOf), never written here.
  if (chapter.coming != null && chapter.coming !== true) bad(where, 'coming is true or absent — its words come from the book');
  if (chapter.close?.title) bad(where, 'a close is named by its 回 (「第三回 · 完」), never by its own title');
  lintHui(chapter, content, bad);
  lintInterludes(chapter, content, bad);
}

/* An interlude (spliceInterludes): its head names a 古 scene of the same
   chapter; it is a 今 回 that the book reads between the 回 that led into that
   scene and the scene's own (book order, book-order.js) — so 今 · 一 stands
   after 古二 and before 古三, as the book prints it; its scenes have no place
   on the map (`at`: they are 沈芒's, played wherever the hero stands); and
   some exit of it leads on into that scene. */
function lintInterludes(chapter, content, bad) {
  const entries = bookEntries(content.book, { draft: true }).filter(h => h.volume);
  const order = new Map(entries.flatMap((h, at) => idsOf(h).map(id => [id, at])));
  const line = id => entries[order.get(id)]?.line ?? null;
  const scenes = Object.values(chapter.scenes);
  for (const sc of scenes) {
    if (line(sc.hui) !== 'jin') continue;
    const where = `scene ${sc.id}`;
    if (sc.at) bad(where, 'an interlude scene stands on no place of the map');
    if (sc.before == null) continue;
    const into = chapter.scenes[sc.before];
    if (!into) { bad(where, `before ${sc.before}, which is not a scene of ${chapter.id}`); continue; }
    if (line(into.hui) !== 'gu' || order.get(into.hui) !== order.get(sc.hui) + 1) bad(where, `before ${sc.before} (${into.hui}), but the book reads ${sc.hui} right before another 回`);
    const own = scenes.filter(x => x.hui === sc.hui);
    if (!own.some(x => x.exits.some(e => e.next === sc.before))) bad(where, `no exit of ${sc.hui} leads on into ${sc.before}`);
  }
  for (const sc of scenes) if (sc.before != null && line(sc.hui) !== 'jin') bad(`scene ${sc.id}`, 'only an interlude (a 今 回) is spliced before a scene');
}

/* 卷 and 回 (rules/hui.mjs): a scene's `hui` is a 回 of the world's book, and
   along a chapter's spine — any exit to a next scene — it never goes back. */
function lintHui(chapter, content, bad) {
  // Book order (book-order.js, the reader's): 今 interludes sit between the 古 films, so a 回's place, not its `n`
  // (its number within its line). A 回 folded into another (`absorbs`: h03 → h02) stands at the place of the one that absorbed it.
  const book = new Map(bookEntries(content.book, { draft: true }).filter(h => h.volume).flatMap((h, at) => idsOf(h).map(id => [id, at])));
  for (const sc of Object.values(chapter.scenes)) {
    if (sc.hui == null) continue;
    if (!book.has(sc.hui)) { bad(`scene ${sc.id}`, `hui ${sc.hui} is no 回 of the book`); continue; }
    for (const e of sc.exits ?? []) {
      const next = chapter.scenes[e.next];
      if (next?.hui && book.get(next.hui) < book.get(sc.hui)) bad(`scene ${sc.id}`, `exit ${e.id} goes back from ${sc.hui} to ${next.hui}`);
    }
  }
}

/* 看 — the lint of a scene's hotspots (rules/examine.mjs; LOOK_GIVES is its
   GIVES table's kinds, kept equal by tests/examine.test.mjs): ids, words in both languages, one line
   each; every clue an exit waits on is a clue of this scene, and a scene that
   waits on one has its hint. `pair` checks a {zh, en}. Returns problems. */
export const LOOK_TEXT_MAX = { zh: 60, en: 200 };
export function lintLooks(scene, pair, isId) {
  const bad = [], spots = Array.isArray(scene.look) ? scene.look : [], ids = spots.map(h => h.id);
  if (scene.look != null && !Array.isArray(scene.look)) return ['look is a list'];
  if (new Set(ids).size !== ids.length) bad.push('repeats a look id');
  if (spots.length > 4) bad.push('at most four things to look at');
  for (const h of spots) {
    const at = `look ${h.id}`;
    if (!isId(String(h.id))) bad.push(`${at}: an id is lowercase`);
    if (!pair(h.label)) bad.push(`${at}: a label in zh and en`);
    if (!pair(h.text)) bad.push(`${at}: a finding in zh and en`);
    else for (const lang of ['zh', 'en']) if ([...h.text[lang]].length > LOOK_TEXT_MAX[lang] || /\n/.test(h.text[lang])) bad.push(`${at}: a finding is one line in ${lang} (≤${LOOK_TEXT_MAX[lang]})`);
    if (h.clue != null && h.clue !== true) bad.push(`${at}: clue is true`);
    for (const kind of Object.keys(h.gives ?? {})) if (!LOOK_GIVES.has(kind)) bad.push(`${at}: gives ${kind}, which it cannot`);
    if (h.gives?.mark != null && !isId(String(h.gives.mark))) bad.push(`${at}: a mark is a lowercase id`);
  }
  const waits = scene.exits.flatMap(e => e.needs?.seen ?? []);
  for (const id of waits) if (!spots.some(h => h.id === id && h.clue)) bad.push(`an exit waits on ${id}, not a clue of this scene`);
  if (waits.length && !pair(scene.look_hint)) bad.push('a scene that waits on a clue has a look_hint in zh and en');
  if (scene.look_hint != null && !waits.length) bad.push('a look_hint, but no exit waits on a clue');
  return bad;
}

export const LOOK_GIVES = new Set(['mark']);

function lintScene(scene, chapter, content, ids, bad) {
  const where = `scene ${scene.id}`;
  if (scene.chapter !== chapter.id) bad(where, `says chapter ${scene.chapter}, lives in ${chapter.id}`);
  const places = content.places[chapter.province]?.places ?? [];
  if (scene.at && !places.some(p => p.id === scene.at)) bad(where, `at ${scene.at}, which is not a place of ${chapter.province}`);
  const speakers = new Set([...SPEAKERS, ...ids.creatures, ...peopleIds(content)]);
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
  if (scene.hui) for (const exit of scene.exits) lintEarned(`${where} exit ${exit.id}`, exit, content, bad);
  // A 连环画 beat (rules/tell.mjs): the passage told in the chat, the panel on the stage.
  lintStory(where, scene.story, bad);
  lintFull(where, scene.story, scene.story_full, bad);
  lintFull(`${where}.story_after`, scene.story_after, scene.story_after_full, bad);
  // The rest of a passage a game stands inside: played after it, the scene's own (tasks.mjs, tell.mjs).
  if (scene.story_after != null) {
    lintStory(`${where}.story_after`, scene.story_after, bad);
    if (!scene.story || !(scene.show ?? []).some(c => c.card === 'board')) bad(where, 'story_after needs a story and a board the passage leads into');
  }
  if (scene.panel) {
    // A story moment is never illustrated (his, 2026-09-29): the scene card is its words; pictures are the 图鉴's.
    if (scene.panel.art) bad(where, 'a scene has no picture — pictures are the 图鉴\'s (codex.json)');
    for (const lang of ['zh', 'en']) {
      const lines = scene.panel.caption?.[lang];
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > 4 || lines.some(l => typeof l !== 'string' || !l.trim())) bad(where, `a panel caption is two to four lines in ${lang}`);
    }
  }
  const persons = new Set(peopleIds(content));
  for (const who of scene.people ?? []) if (!persons.has(who)) bad(where, `names unknown person ${who}`);
  if (scene.her != null && !content.world.companion?.forms?.[scene.her]) bad(where, `her form ${scene.her} is not the companion's`);
  for (const p of lintLooks(scene, pair, id => ID.test(id))) bad(where, p);
}

/* A passage (zh + en), with the companion's words marked ⟪…⟫ alike in both. */
/* The story never raises 修为 or 层 (Hanli, 2026-10-16: 「要让玩家去刷经验/修为等. 不要直接跳层」):
   in a 回 a choice grants no 修为, fills no step (`fill`), and lifts no layer — the book's rises are
   stage quests (ladder.json caps.hui.<回>.gates). One rise stands: 入门, 零层 to 一层 (the 小周天) —
   零层 holds no 修为 (state.mjs addProgress), so it skips nothing. A breakthrough is the player's throw. */
function lintEarned(where, exit, content, bad) {
  const first = content.ladder.tiers[0], r = exit.rise;
  const entry = first.zero && r === 1;
  if (r != null && !entry) bad(where, 'the story raises a layer: make it a stage quest (caps.hui.<回>.gates)');
  if (exit.grant?.progress) bad(where, 'the story grants 修为: it is earned (功课, fights, 秘境, 闭关)');
  if (exit.fill != null) bad(where, 'the story fills a step to 圆满');
  const item = exit.grant?.item ? content.items?.items?.find?.(i => i.id === exit.grant.item) : null;
  if (item?.fill != null) bad(where, `grants ${item.id}, which fills a step to 圆满`);
}

function lintStory(where, story, bad) {
  if (story == null) return;
  if (!pair(story)) { bad(where, 'a story needs zh and en'); return; }
  const marks = t => [(t.match(/⟪/g) ?? []).length, (t.match(/⟫/g) ?? []).length];
  const [zo, zc] = marks(story.zh), [eo, ec] = marks(story.en);
  if (zo !== zc || eo !== ec) bad(where, 'a story\'s ⟪ ⟫ do not pair');
  else if (zo !== eo) bad(where, `a story marks her words ${zo} times in zh, ${eo} in en`);
}

/* 节本 (jieben.mjs): a condensed passage keeps the book's beside it, `…_full`. The cut is
   shorter in both languages and plays the same boxes in each (a switch of language mid-passage
   goes on at the same beat); that every sentence comes from the book is scene-book-sync's. */
function lintFull(where, story, full, bad) {
  if (full == null) return;
  lintStory(`${where} (full)`, full, bad);
  if (!pair(story) || !pair(full)) { bad(where, 'a condensed passage needs its own text and the book\'s, zh and en'); return; }
  const boxes = (t) => t.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (boxes(story.zh) !== boxes(story.en)) bad(where, `a condensed passage plays ${boxes(story.zh)} boxes in zh, ${boxes(story.en)} in en`);
  for (const lang of ['zh', 'en']) if (story[lang].length >= full[lang].length) bad(where, `a condensed passage no shorter than the book's (${lang})`);
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
  // `take.held`: taken if he still holds it, nothing if not (09-snow's 饭桶 and a pawned gourd).
  if (exit.take?.held != null && !(exit.take.held === true && exit.take.bag)) bad(where, 'take.held is true, with a bag item');
  if (exit.take && !exit.needs && !exit.take.held) bad(where, 'takes what it never checks for');
  // A board's grade (tasks.mjs win): a grade of the task it waits on, from the task's `marks`.
  if (exit.needs?.grade != null) {
    const marks = content.tasks.tasks.find(t => t.id === exit.needs.task)?.marks ?? {};
    for (const g of [exit.needs.grade].flat()) if (!Object.hasOwn(marks, g)) bad(where, `needs grade ${g}, which task ${exit.needs.task ?? '(none)'} does not mark`);
  }
  // A choice a thread sets up; a day that must pass since a mark of the chapter.
  if (exit.needs?.quest && !(content.quests ?? []).some(q => q.id === exit.needs.quest)) bad(where, `needs unknown quest ${exit.needs.quest}`);
  if (exit.needs?.day_after && !Object.values(chapter.scenes).some(sc => sc.exits.some(e => e.mark === exit.needs.day_after))) bad(where, `waits a day after ${exit.needs.day_after}, which no exit marks`);
  // The story lifts the realm to a layer of the first tier (core.mjs riseTo).
  const riseLayer = typeof exit.rise === 'object' && exit.rise ? exit.rise.layer : exit.rise;
  // 零层 is never risen to: a rise lifts out of it (state.mjs stepOfLayer).
  const riseStep = Number.isInteger(riseLayer) ? stepOfLayer(content, content.ladder.tiers[0].id, riseLayer) : -1;
  if (exit.rise != null && !(riseLayer >= 1 && riseStep >= 0 && riseStep < content.ladder.tiers[0].thresholds.length)) bad(where, 'rise is a layer of the first tier');
  if (typeof exit.rise === 'object' && exit.rise && exit.rise.full != null && exit.rise.full !== true) bad(where, 'rise.full is true');
  // A step after a step (`needs.mark`): some exit of the chapter sets that mark.
  // A mark another chapter's step set down counts (marks are the run's, not the chapter's): 古六's
  // 刮鞋底 reads 古三's `steps-steady`; so does one a board's grade writes (a task's `marks`).
  for (const m of [exit.needs?.mark, exit.needs?.no_mark].filter(Boolean)) if (!markSet(content, chapter, m)) bad(where, `needs mark ${m}, which no exit sets`);
  if (exit.once != null && !(exit.once === true && exit.mark)) bad(where, 'once is true, with a mark');
  if (exit.take?.wealth != null && !(Number.isInteger(exit.take.wealth) && exit.take.wealth > 0 && exit.needs?.wealth >= exit.take.wealth)) bad(where, 'takes stones it never checks for');
  if (exit.needs?.wealth != null && !(Number.isInteger(exit.needs.wealth) && exit.needs.wealth > 0)) bad(where, 'needs a whole number of stones');
  lintStory(where, exit.story, bad);
  lintFull(where, exit.story, exit.story_full, bad);
  // A choice turned down (core.mjs `snub`): its line, a mark to grey it by, and it stays.
  if (exit.snub != null && !(pair(exit.snub) && exit.mark && exit.stay)) bad(where, 'a snub needs its line in zh and en, a mark, and stay');
  // A name the story gives (core.mjs `names`): the save field, the name, and a refusal for any other.
  if (exit.names != null && !(typeof exit.names.field === 'string' && typeof exit.names.value === 'string' && exit.names.value && pair(exit.refuse))) bad(where, 'names needs field, value and a refuse line');
  // 恩仇簿: who (a person or a slot), 恩 · 仇 · 诺, and what, in both languages;
  // `said: true` keeps the player's last typed line with it (rules/ledger.mjs).
  // `settles` marks a 诺 to that person kept (or `kept: false`, broken).
  const persons = new Set(peopleIds(content));
  for (const e of exit.ledger ?? []) {
    if (!persons.has(e?.who)) bad(where, `a ledger entry names unknown person ${e?.who}`);
    if (!['恩', '仇', '诺'].includes(e?.kind)) bad(where, 'a ledger entry is 恩, 仇 or 诺');
    if (!pair(e?.what)) bad(where, 'a ledger entry needs what, zh and en');
    if (e?.said != null && e.said !== true) bad(where, 'a ledger entry\'s said is true');
  }
  for (const x of exit.settles ?? []) {
    if (!persons.has(x?.who)) bad(where, `settles names unknown person ${x?.who}`);
    if (x?.kept != null && typeof x.kept !== 'boolean') bad(where, 'settles kept is true or false');
  }
  if (exit.joins != null && (exit.joins !== true || !content.world.companion)) bad(where, 'joins is true, in a world with a companion');
  for (const k of ['sleeps', 'wakes']) if (exit[k] != null && (exit[k] !== true || !content.world.companion)) bad(where, `${k} is true, in a world with a companion`);
  if (exit.sleeps && exit.wakes) bad(where, 'sleeps or wakes, not both');
  if (exit.needs && !exit.refuse) bad(where, 'a need needs a refusal line');
  if (exit.breakthrough) {
    if (!exit.refuse) bad(where, 'a breakthrough needs a refusal line for the one not yet at the peak');
    if (chapter.gate == null) bad(where, `a breakthrough in ${chapter.id}, which has no gate`);
    else if (!content.ladder.tiers.some(t => t.gate === chapter.gate)) bad(where, `no tier on the ladder has gate ${chapter.gate}`);
  }
  if (exit.key != null) {
    const pool = Array.isArray(exit.key) ? exit.key : [exit.key];
    if (!pool.length) bad(where, 'a riddle pool needs a riddle');
    for (const key of pool) if (!content.riddles.zh.riddles[key]) bad(where, `unknown riddle ${key}`);
  }
  const game = gameOf(exit);
  if (game) {
    if (typeof game.id !== 'string' || !game.id) bad(where, 'a game needs an id');
    if (!GAME_KINDS.has(game.kind)) bad(where, `unknown game kind ${game.kind}`);
    if (game.kind === 'duel' && !ids.creatures.has(game.creature)) bad(where, `duels unknown creature ${game.creature}`);
    if (game.kind === 'duel' && !exit.withdrawn) bad(where, 'a duel needs a withdrawn line');
    if (game.retry != null && (game.retry !== true || game.kind !== 'duel')) bad(where, 'retry is true, on a duel');
  }
  if (exit.value && !VALUE_FIELDS.has(exit.value.field)) bad(where, `cannot set ${exit.value.field}`);
  if (exit.value?.gender != null) bad(where, 'the hero\'s gender is fixed (people.json hero): a value asks no gender');
  // 生辰 → 灵根 (rules/roots.mjs): read on the page's card, never with `set` or a value beside it.
  if (exit.born != null && (exit.born !== true || exit.value || exit.set)) bad(where, 'born is true, alone — no value, no set');
  // An exit that costs 体力 by itself (the prologue's steps are otherwise free): a whole number.
  if (exit.stamina != null && !(Number.isInteger(exit.stamina) && exit.stamina > 0 && exit.stamina <= content.rewards.stamina.max)) bad(where, 'stamina is a whole number within the pool');
  if (exit.mark != null && !ID.test(String(exit.mark))) bad(where, 'a mark is a lowercase id');
  if (exit.value) {
    // The page card draws `draw` of the pool per save, nothing preselected:
    // every offer a name that fits, in both languages, and never the same twice.
    const pool = exit.value.offers ?? [], n = exit.value.draw ?? pool.length;
    if (!Number.isInteger(exit.value.max_chars) || exit.value.max_chars < 1) bad(where, 'a value needs max_chars');
    if (!Number.isInteger(n) || n < 2 || n > pool.length) bad(where, `a value draws ${n} of ${pool.length} offers`);
    for (const o of pool) if (!o?.zh || !o?.en || [...o.zh].length > exit.value.max_chars) bad(where, `offer ${o?.zh ?? '?'} needs zh + en within max_chars`);
    if (new Set(pool.map(o => o?.zh)).size !== pool.length || new Set(pool.map(o => String(o?.en).toLowerCase())).size !== pool.length) bad(where, 'value offers repeat');
  }
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
   a scene's `grant.art` names one of them. */
function lintArts(content, bad) {
  const seen = new Set();
  for (const art of content.arts?.arts ?? []) {
    const where = `art ${art.id}`;
    if (seen.has(art.id)) bad(where, 'duplicate id');
    seen.add(art.id);
    if (!ART_EFFECTS.includes(art.effect)) bad(where, `unknown effect ${art.effect}`);
    if (!content.ladder.tiers.some(t => t.id === art.tier)) bad(where, `unknown tier ${art.tier}`);
  }
}

/* 出处 (cards.json `from`, cards.md): every card a player or a member can hold says where it comes
   from, and each source names a thing that exists — a scene, a board's task, a creature, an item,
   a party member. A card's `owner` is a member of party.json, or a creature (a foe's own art). */
const FROM_KINDS = { story: 'scene', beat: 'task', beast: 'creature', shop: 'item', tame: 'creature', summon: 'item', member: 'member', foe: 'creature', tale: null };
function lintFrom(content, bad) {
  const scenes = new Set(Object.values(content.chapters ?? {}).flatMap(ch => Object.keys(ch.scenes ?? {})));
  const has = {
    scene: id => scenes.has(id), task: id => content.tasks.tasks.some(t => t.id === id),
    creature: id => content.creatures.creatures.some(c => c.id === id), item: id => content.items.items.some(i => i.id === id),
    member: id => Boolean(content.party?.members?.[id]),
  };
  for (const c of content.cards?.cards ?? []) {
    const where = `card ${c.id}`;
    if (c.owner && !has.member(c.owner) && !has.creature(c.owner)) bad(where, `owned by unknown ${c.owner}`);
    if (!c._token && !(c.from ?? []).length) bad(where, 'says no 出处 (from)');
    for (const f of c.from ?? []) {
      const key = FROM_KINDS[f.kind];
      if (!(f.kind in FROM_KINDS)) { bad(where, `from an unknown kind ${f.kind}`); continue; }
      if (key && !has[key](f[key])) bad(where, `from ${f.kind} names unknown ${key} ${f[key]}`);
      if (!['书', '游戏'].includes(f.src)) bad(where, `from ${f.kind} is neither 书 nor 游戏`);
    }
  }
  for (const [id, m] of Object.entries(content.party?.members ?? {})) {
    for (const k of m.deck ?? []) if (!(content.cards?.cards ?? []).some(c => c.id === k && c.owner === id)) bad(`party ${id}`, `deals ${k}, not a card of theirs`);
  }
}

function lintItems(content, bad) {
  const seen = new Set();
  // balance.json `prices` is every shop price: each names a thing that exists.
  for (const id of Object.keys(content.balance?.prices ?? {})) if (!content.items.items.some(i => i.id === id)) bad(`price ${id}`, 'prices an unknown item');
  for (const item of content.items.items) {
    const where = `item ${item.id}`;
    if (seen.has(item.id)) bad(where, 'duplicate id');
    seen.add(item.id);
    if (!ITEM_KINDS.has(item.kind)) bad(where, `unknown kind ${item.kind}`);
    if (!item.art) bad(where, 'needs art');
    else if (!fs.existsSync(path.join(content.dir, item.art))) bad(where, `art ${item.art} is missing`);
    // A made thing (a 符 from paper) is sold in no province's shop and never bought back;
    // a visiting stall may carry it at its `buy` (Hanli 2026-10-15: the 货郎 sells 符 —
    // 钱掌柜's 符箓 are canon).
    if (item.reads != null && !content.scrolls?.scrolls?.[item.reads]) bad(where, `reads unknown scroll ${item.reads}`);
    if (item.made) {
      if (!content.items.items.some(i => i.id === item.made.from)) bad(where, `made from unknown item ${item.made.from}`);
      if (item.made.anywhere_from && !content.ladder.tiers.some(t => t.id === item.made.anywhere_from)) bad(where, `made anywhere from unknown tier ${item.made.anywhere_from}`);
      if ((item.sold ?? []).length || item.sell != null) bad(where, 'a made thing is not sold');
      if (item.buy != null && (!Number.isInteger(item.buy) || item.buy < 0)) bad(where, 'buy must be a whole number');
    } else if (!Number.isInteger(item.buy) || !Number.isInteger(item.sell) || item.buy < 0 || item.sell < 0) bad(where, 'buy and sell must be whole numbers');
    else if (item.buy < item.sell) bad(where, `buys for ${item.buy}, below its sell price ${item.sell}`);
    for (const province of item.sold ?? []) if (!content.dictionary.provinces[province]) bad(where, `sold in unknown province ${province}`);
    const e = item.effect;
    if (!e) continue;
    // Arms are the fight's own numbers: 攻 on a weapon (with the root it
    // lends), 防 on a 法衣, 抗 on a 佩. Everything else is one plain effect.
    const arms = ['atk', 'def', 'ward'].filter(k => e[k] != null);
    // 伤势 and 强化 were cut (redesign-v2 § 四): no `mend`, no `temper`.
    const kinds = ['key', 'progress', 'wear', 'charm', 'core', 'learn', 'pouch', 'card', 'fight'].filter(k => e[k] != null);
    if (kinds.length + (arms.length ? 1 : 0) !== 1) bad(where, 'an effect is one of key, progress, wear, charm, core, learn, pouch, card, fight, or arms (atk, def, ward)');
    // A pill for the 丹囊 (battle.js § pills): one whole number, 气血 (`heal`) or 灵力 (`mana`), on a pill.
    if (e.fight != null && (item.kind !== 'pill' || Object.keys(e.fight).length !== 1 || !['heal', 'mana'].some(k => Number.isInteger(e.fight[k]) && e.fight[k] > 0))) bad(where, 'a fight effect is a pill\'s heal or mana, a whole number above zero');
    // A thing bought for the card it carries (2026-10-16, cards.md: 每张牌都在剧情里收集或者购买): the card names this item as its shop.
    if (e.card != null) {
      const c = (content.cards?.cards ?? []).find(x => x.id === e.card);
      if (!c || c._token) bad(where, `carries unknown or token card ${e.card}`);
      else if (!(c.from ?? []).some(f => f.kind === 'shop' && f.item === item.id)) bad(where, `card ${e.card} does not name ${item.id} as its shop`);
    }
    // A bigger 储物袋: whole slots, on a thing of the kind (rules/pouch.mjs).
    if (e.pouch != null && (!Number.isInteger(e.pouch) || e.pouch < 1 || item.kind !== 'pouch')) bad(where, 'pouch is a whole number of slots above zero, on a pouch');
    if (e.learn != null && (e.learn !== 'wangqi' || ![1, 2].includes(e.level) || !content.ladder.tiers.some(t => t.id === e.tier))) bad(where, 'learn is wangqi, level 1 or 2, at a tier the ladder knows');
    if (arms.length > 1) bad(where, 'arms are one of 攻, 防 or 抗');
    for (const k of arms) {
      if (k !== 'ward' && (!Number.isInteger(e[k]) || e[k] < 1)) bad(where, `${k} must be a whole number above zero`);
      if (ARM_SLOTS.get(item.kind) !== { atk: 'weapon', def: 'robe', ward: 'pendant' }[k]) bad(where, `${k} belongs to a ${{ atk: 'weapon', def: 'robe', ward: 'pendant' }[k]}, not a ${item.kind}`);
    }
    if (e.ward != null) {
      for (const [el, n] of Object.entries(e.ward)) {
        if (!ELEMENTS.includes(el)) bad(where, `wards unknown element ${el}`);
        if (!Number.isInteger(n) || n < 1) bad(where, `wards ${el} by ${n}, not a whole number above zero`);
      }
    }
    if (e.root != null && !ELEMENTS.includes(e.root)) bad(where, `lends unknown root ${e.root}`);
    if (e.root != null && e.atk == null) bad(where, 'a root is lent by a weapon, which needs its 攻');
    // A 天材地宝: the element it lends the day a treasure is bound with it.
    if (e.core != null && !ELEMENTS.includes(e.core)) bad(where, `binds unknown element ${e.core}`);
    if (e.charm != null && !item.made) bad(where, 'a charm is made, never sold');
    // A 符 goes into a fight as the card of its own id (rules/cards.mjs § 装备入局).
    const charmCard = e.charm != null ? (content.cards?.cards ?? []).find(c => c.id === item.id) : null;
    if (e.charm != null && !(charmCard?.charm && charmCard._token)) bad(where, 'a charm needs a card of its id, marked charm and _token, to be cast in a fight');
    if (e.progress != null) {
      const table = content.rewards.tables[e.table];
      if (!table) bad(where, `unknown reward table ${e.table}`);
      else if (e.progress > table.progress) bad(where, `progress ${e.progress} is over the ${e.table} cap of ${table.progress}`);
    }
    if (e.wear != null && !WEAR_SLOTS.has(e.wear)) bad(where, `cannot wear on ${e.wear}`);
    // What a thing worn by a companion lifts: one point on her card, 攻 or
    // 气血 (+2/+2 won 97%, so kept small).
    if (e.lift != null) {
      if (e.wear == null) bad(where, 'a lift is worn by a companion — it needs wear');
      const keys = Object.keys(e.lift), k = keys[0];
      if (keys.length !== 1 || !((k === 'atk' || k === 'hp') && e.lift[k] === 1)) bad(where, 'a lift is atk or hp by 1');
    }
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
