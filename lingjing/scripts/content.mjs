// Loads a world's authored content and checks it. Pure reads — nothing here
// writes. `node content.mjs lint [world]` prints every problem and exits 1 on
// any; with no world named it lints every world in `worlds/`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The worlds ship with the skill, one folder each under `worlds/`; the
   folder's name is the world's id and the save's `world`. */
export const WORLDS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../worlds');
export const DEFAULT_WORLD = 'jiuding';

export const worldDir = id => path.join(WORLDS_DIR, id);
export const listWorlds = () => fs.readdirSync(WORLDS_DIR).filter(id => fs.existsSync(path.join(worldDir(id), 'world.json'))).sort();
export const hasWorld = id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id) && fs.existsSync(path.join(worldDir(id), 'world.json'));

/* A world by id; an unknown id throws with the ids that exist. */
export function loadWorld(id = DEFAULT_WORLD) {
  if (!hasWorld(id)) throw new Error(`unknown world ${id}; worlds: ${listWorlds().join(', ')}`);
  return loadContent(worldDir(id));
}

/* Who speaks besides the creatures. Ling is the world's voice — narration,
   never a named speaker. */
export const CAST = { yinyue: { zh: '银月', en: 'Yinyue' } };
const SPEAKERS = new Set(['ling', ...Object.keys(CAST)]);
const CARDS = new Set(['creature', 'traits', 'map', 'board', 'hexagram', 'gate', 'tribulation']);
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
    hexagrams: at('hexagrams.json'),
    riddles: { zh: at('riddles/zh.json'), en: at('riddles/en.json') },
    tasks: at('tasks/world.json'),
    branches: at('branches.json'),
    seeds: loadSeeds(path.join(dir, 'seeds')),
    places: loadPlaces(path.join(dir, 'places')),
    templates: { made: at('templates/made-scene.json') },
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
    herbs: new Set(content.herbs.herbs.map(h => h.id)),
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
    herbs: new Set(content.herbs.herbs.map(h => h.id)),
    tasks: new Set(content.tasks.tasks.map(t => t.id)),
  };
  lintWorld(content.world, bad);
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
  return problems;
}

/* A province's places: roads both ways to places of the same province, a
   tier the ladder has, a creature with its card, a scene that exists, and
   every place reachable from the start. */
function lintPlaces(content, ids, bad) {
  const scenes = new Set(Object.values(content.chapters).flatMap(c => Object.keys(c.scenes)));
  const seen = new Set();
  for (const [province, doc] of Object.entries(content.places)) {
    const where = `places ${province}`;
    if (!content.dictionary.provinces[province]) bad(where, 'unknown province');
    const byId = Object.fromEntries(doc.places.map(p => [p.id, p]));
    if (!byId[doc.start]) bad(where, `start ${doc.start} is not a place`);
    for (const place of doc.places) {
      const at = `place ${place.id}`;
      if (seen.has(place.id)) bad(at, 'duplicate id');
      seen.add(place.id);
      if (!Number.isInteger(place.tier) || place.tier < 0 || place.tier >= content.ladder.tiers.length) bad(at, `tier ${place.tier} is not on the ladder`);
      if (!place.line?.zh || !place.line?.en) bad(at, 'needs a line in both languages');
      for (const road of place.roads ?? []) {
        if (!byId[road]) bad(at, `road to ${road}, which is not a place of ${province}`);
        else if (!byId[road].roads?.includes(place.id)) bad(at, `road to ${road} does not come back`);
      }
      if (place.has?.creature && !ids.creatures.has(place.has.creature)) bad(at, `has unknown creature ${place.has.creature}`);
      if (place.has?.scene && !scenes.has(place.has.scene)) bad(at, `has unknown scene ${place.has.scene}`);
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

function lintCreatures(content, bad) {
  for (const c of content.creatures.creatures) {
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
  if (task.gives?.bag && !ids.herbs.has(task.gives.bag)) bad(where, `gives unknown item ${task.gives.bag}`);
}

function lintGrant(where, grant, content, ids, bad) {
  if (!grant) return;
  const table = content.rewards.tables[grant.table];
  if (!table) { bad(where, `unknown reward table ${grant.table}`); return; }
  for (const [key, cap] of Object.entries(table)) {
    if ((grant[key] ?? 0) > cap) bad(where, `${key} ${grant[key]} is over the ${grant.table} cap of ${cap}`);
  }
  if (grant.cast && !ids.creatures.has(grant.cast)) bad(where, `grants unknown creature ${grant.cast}`);
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
    if (rule?.bag && !ids.herbs.has(rule.bag)) bad(where, `unknown item ${rule.bag}`);
    if (rule?.task && !ids.tasks.has(rule.task)) bad(where, `unknown task ${rule.task}`);
  }
  if (exit.take && !exit.needs) bad(where, 'takes what it never checks for');
  if (exit.needs && !exit.refuse) bad(where, 'a need needs a refusal line');
  if (exit.key && !content.riddles.zh.riddles[exit.key]) bad(where, `unknown riddle ${exit.key}`);
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
