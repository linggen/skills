// rules/worlds.mjs — Worlds of the player's own: building, made scenes, the save library, art.
// Part of the rules engine; rules.mjs is its one door.
import fs from 'node:fs';
import path from 'node:path';
import { allWorlds, DEFAULT_WORLD, hasWorld, knownWorld, lintAmendCreature, lintAmendPlace, lintMade, lintMadeWorld, listWorlds, loadWorld, MADE, madeWorldDir, ownPlaces, pairsOf, WORLD } from '../content.mjs';
import { layoutRoads, placeWords } from '../roadmap.js';
import { dayKey, migrate, pick } from '../state.mjs';
import { gainCard } from './cards.mjs';
import { callDue, companionOf, companionRiddle } from './companion.mjs';
import { advanceChapter, clone, judgeAnswer, pay, refuse, RIDDLE_TRIES, spendStamina } from './core.mjs';
import { advance, itemOf } from './errands.mjs';
import { savedFile, savedFor, savesDir, skillDir, writeAtomic, writeMadeWorld } from './files.mjs';
import { nameOf, sceneBrief, spoken } from './look.mjs';
import { arriveOnRoad, chanceLive, dealChance, meetHere } from './road.mjs';
import { herBeat, joinNode, withHerBeat } from './story.mjs';
import { hashOf } from './travel.mjs';
import { creatureOf, encounterOf, inMade, placeName, placeOf, settlePlace, tooHard } from './world.mjs';

/* ── Building: a made world's pictures ──
   Only building paints. A made world plays once every creature it made has
   its picture and its map is painted; until then its story waits, and
   every answer that matters says what is left to paint. A picture takes
   twenty seconds — fine while building, never in play. */

const PICTURE_STYLE = 'Traditional Chinese ink wash painting with soft watercolor tints on aged cream paper, muted sepia, moss green and slate blue, loose brushwork, soft mist, faded vignette edges, no text, no writing, no characters, no labels, no border';
const plainEn = t => String(pick(t, 'en') ?? '').trim().replace(/[.。]$/, '');

/* The verbs that move the story, and so wait for the brush. */
export const BUILDING_WAITS = new Set(['resolve', 'judge', 'duel', 'tame', 'tale', 'move', 'trade', 'make', 'enter', 'leave', 'refine']);

/* What a made world still needs painted, as GenerateImage's arguments, each
   with the `creature` Art takes back: its new creatures, then its map. */
export function paintList(content) {
  if (!content.world.made) return [];
  const beasts = content.creatures.creatures.filter(c => c.made && !c.art).map(creaturePaint);
  const map = content.world.map ? null : mapPaint(content);
  return map ? [...beasts, map] : beasts;
}
const building = content => {
  const paint = paintList(content);
  return paint.length ? { building: { paint } } : {};
};
const creaturePaint = c => ({ creature: c.id, name: c.id, shape: 'square', prompt: `${plainEn(c.look)}. ${PICTURE_STYLE}` });

/* The map's picture: the made province seen from above, each place said
   where the road map puts it. English, and no writing asked for — the
   model paints false characters when it is. */
function mapPaint(content) {
  const doc = Object.values(content.places)[0];
  if (!doc) return null;
  const { at } = layoutRoads(doc.places, doc.start);
  const plain = plainEn;
  const reading = [...doc.places].sort((a, b) => at[a.id].y - at[b.id].y || at[a.id].x - at[b.id].x);
  const places = reading.map(p => `${placeWords(at[p.id])}: ${plain(p.name)}. ${plain(p.line)}.`);
  const province = pick(content.dictionary.provinces[doc.province], 'en') ?? doc.province;
  return {
    creature: 'map', name: `${content.world.id}-map`, shape: 'landscape',
    prompt: `A bird's-eye landscape of ${province} painted as an old Chinese map scroll. ${places.join(' ')} Pale footpaths join them. ${PICTURE_STYLE}`,
  };
}

/* When the story waited on a chapter and the chapter has opened, the next
   Look takes the player into it — the one change Look makes. */
export function wake(state, content, ctx) {
  const s = clone(state);
  if (!state.scene && !inMade(state)) advanceChapter(content, s, ctx.now);
  // The call: at the realm the world names, the search for her opens.
  const called = !s.companion && callDue(content, s);
  if (called) s.companion = {};
  const chance = dealChance(content, s, ctx);
  if (chance) s.chance = chance;
  // Standing on the day's 机缘 with nothing met here (a scene walked him there,
  // or a save from before 路上): it is met now, as an arrival would meet it.
  const lucky = chanceLive(s, ctx.now) && s.place === s.chance.place && !meetHere(s, ctx.now) && arriveOnRoad(content, s, ctx);
  return called || chance || lucky || (s.scene && !state.scene) ? s : null;
}

/* ── Made scenes: the player's own, written by Ling from the template ── */

const strip = node => {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, strip(v)]));
};

/* No scene: the template and the rules of making. With one: check it as
   the lint checks authored content, and keep it with the player. */
export function make(state, content, ctx, args) {
  if (args.scene == null) {
    const t = content.templates.made;
    return { state: null, result: { ok: true, template: strip(t), rules: t._rules, cost: content.rewards.stamina.cost.make, limits: MADE } };
  }
  let scene;
  try { scene = typeof args.scene === 'string' ? JSON.parse(args.scene) : args.scene; } catch { return refuse('not-json', null); }
  scene = strip(scene);
  const s = clone(state);
  s.made ??= { scenes: {}, at: null };
  const others = { ...s.made.scenes }; delete others[scene?.id];
  if (Object.keys(others).length >= MADE.max_scenes) return refuse('made-full', null, { max: MADE.max_scenes });
  const problems = lintMade(scene, others, content);
  if (problems.length) return refuse('not-playable', null, { problems });
  const empty = spendStamina(content, s, ctx, 'make');
  if (empty) return empty;
  s.made.scenes[scene.id] = scene;
  return { state: s, result: { ok: true, made: scene.id, scenes: Object.keys(s.made.scenes) } };
}

/* Tame: at its haunt, the thing it likes from the bag, once — it walks
   with the player from then on. The bag pays; the haunt table pays back. */
export function tame(state, content, ctx, args) {
  const want = String(args.creature ?? '').trim();
  const e = encounterOf(content, state, ctx.now);
  const named = e && (e.creature.id === want || pick(creatureOf(content, e.creature.id).name, 'zh') === want || pick(creatureOf(content, e.creature.id).name, 'en').toLowerCase() === want.toLowerCase());
  if (!e || (want && !named)) return refuse('not-here', null, e ? { creature: e.creature } : {});
  const lang = state.lang, name = e.creature.name;
  if (e.tamed) return refuse('already-tamed', pick({ zh: `${name}已随你同行。`, en: `${name} already walks with you.` }, lang));
  if (!e.likes) return refuse('untameable', pick({ zh: `${name}不为任何东西所动。`, en: `${name} is moved by nothing you could carry.` }, lang));
  // 先降后收 (his, 2026-09-23: 要先能打败, 才能收服): a beast yields only to
  // one who has beaten it; then what it likes seals it.
  if (!e.beaten) return refuse('not-beaten', pick({ zh: `${name}还不服你。先降了它，再献上${e.likes.name}。`, en: `${name} does not yield to you yet. Beat it first, then offer the ${e.likes.name}.` }, lang), { likes: e.likes });
  if (!e.likes.held) return refuse('needs-item', pick({ zh: `${name}闻了闻，退开了。它要的是${e.likes.name}。`, en: `${name} sniffs and draws back. It wants ${e.likes.name}.` }, lang), { likes: e.likes });
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, 'tame');
  if (empty) return empty;
  s.bag[e.likes.id] -= 1;
  if (!s.bag[e.likes.id]) delete s.bag[e.likes.id];
  const paid = pay(content, s, ctx, { table: 'haunt', progress: 20, wealth: 0, cast: e.creature.id });
  const handed = advance(content, s, { kind: 'tame', creature: e.creature.id }, ctx);
  const beat = pick({ zh: `${name}低头衔了${e.likes.name}，随你走了。`, en: `${name} takes the ${e.likes.name} and falls in beside you.` }, lang);
  return { state: s, result: { ok: true, tamed: e.creature, fed: e.likes, beat, paid, ...(handed.length ? { handed } : {}), show: [{ card: 'creature', id: e.creature.id }] } };
}

/* Step into a made scene; the spine keeps its place for the return. */
export function enter(state, content, ctx, args) {
  const id = String(args.scene ?? '');
  if (!state.made?.scenes?.[id]) return refuse('unknown-scene', null, { scenes: Object.keys(state.made?.scenes ?? {}) });
  const s = clone(state);
  s.made.at = id;
  return { state: s, result: { ok: true, scene: sceneBrief(content, s), summarize: true } };
}

/* Back to the spine, wherever the made scene stood. */
export function leave(state, content) {
  if (!inMade(state)) return refuse('not-in-made', null);
  const s = clone(state);
  s.made.at = null;
  return { state: s, result: { ok: true, scene: sceneBrief(content, s), summarize: true } };
}

/* ── The library: every game the player keeps ──
   data/saves/<id>.json = { id, kind, title, at, state }. `day` is written by
   the rules when a new day's first move finds yesterday's closing state;
   `named` on the player's word; `world` parks the save of a world left by
   Travel. An older parked save (a bare state) reads as `world`. */
const DAY_SAVES_KEPT = 14;

function readSave(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc.state) return { ...doc, state: migrate(doc.state) };
  const state = migrate(doc);
  return { id: state.world, kind: 'world', title: null, at: state.updated, state };
}
const saveFiles = () => (fs.existsSync(savesDir()) ? fs.readdirSync(savesDir()).filter(f => f.endsWith('.json')).map(f => path.join(savesDir(), f)) : []);
const allSaves = () => saveFiles().map(readSave).sort((a, b) => String(b.at).localeCompare(String(a.at)));
const saveOf = id => (savedFor(id) ? readSave(savedFile(id)) : null);
function keepSave(kind, id, state, at, title = null) {
  writeAtomic(savedFile(id), JSON.stringify({ id, kind, title, at, state }));
}

/* A new day's first move: yesterday's closing state is kept as that day's
   save, and the oldest day saves beyond the shelf go. */
function keepDay(saved, now) {
  const day = dayKey(new Date(saved.updated));
  if (day === dayKey(now) || savedFor(day)) return;
  keepSave('day', day, saved, saved.updated);
  for (const old of allSaves().filter(x => x.kind === 'day').slice(DAY_SAVES_KEPT)) fs.rmSync(savedFile(old.id), { force: true });
}

/* One save as Saves tells it: where it stood, in the player's words. */
function saveBrief(save, lang) {
  const st = save.state;
  const content = knownWorld(st.world) ? loadWorld(st.world) : null;
  const scene = content ? (st.made?.at ? st.made.scenes[st.made.at] : content.chapters[st.chapter]?.scenes[st.scene]) : null;
  const place = content ? placeOf(content, st.place) : null;
  return {
    id: save.id, kind: save.kind, title: save.title, at: save.at,
    world: content ? pick(content.world.title, lang) : st.world,
    chapter: content?.chapters[st.chapter] ? pick(content.chapters[st.chapter].title, lang) : null,
    where: scene ? pick(scene.place, lang) : place ? pick(place.name, lang) : null,
    name: st.name, tier: st.tier, step: st.step, progress: st.progress,
  };
}

export function saves(state) {
  return { state: null, result: { ok: true, saves: allSaves().map(x => saveBrief(x, state.lang)), playing: { world: state.world, at: state.updated } } };
}

export function save(state, content, ctx, args) {
  const title = String(args.title ?? '').trim();
  if (!title) return refuse('no-title', null);
  const id = `n-${ctx.now.getTime().toString(36)}`;
  keepSave('named', id, state, ctx.now.toISOString(), title);
  return { state: null, result: { ok: true, saved: saveBrief(saveOf(id), state.lang) } };
}

export function forget(state, content, ctx, args) {
  const found = saveOf(String(args.id ?? ''));
  if (!found) return refuse('unknown-save', null, { saves: allSaves().map(x => x.id) });
  if (found.kind !== 'named') return refuse('not-named', null, { kind: found.kind });
  fs.rmSync(savedFile(found.id), { force: true });
  return { state: null, result: { ok: true, forgot: found.id } };
}

/* Take up a kept save: the runner parks the game in play if the save is of
   another world, and logs it so undo brings it back. */
export function load(state, content, ctx, args) {
  const found = saveOf(String(args.id ?? ''));
  if (!found) return refuse('unknown-save', null, { saves: allSaves().map(x => x.id) });
  return { state: null, result: { ok: true, load: found } };
}

/* ── Worlds: the player's own ── */

/* A world of the player's. With nothing: the template, the rules of making
   and the cost. With `world` — one outline in that shape — the rules check
   it against the base it names, keep it under data/worlds/, and the runner
   travels there: a fresh save, the opening scene entered. A world whose
   save exists is never rebuilt under it. */
export function build(state, content, ctx, args) {
  if (args.world == null) {
    const t = content.templates.world;
    return { state: null, result: { ok: true, template: strip(t), rules: t._rules, cost: content.rewards.stamina.cost.build, limits: WORLD } };
  }
  let outline;
  try { outline = jsonOf(args.world); } catch { return refuse('not-json', null); }
  outline = withDefaults(strip(outline));
  if (!hasWorld(outline.base)) return refuse('not-playable', null, { problems: [`world: base must be one of ${listWorlds().join(', ')}`] });
  const base = loadWorld(outline.base);
  const problems = lintMadeWorld(outline, base);
  if (problems.length) return refuse('not-playable', null, { problems, hint: 'Build with nothing returns the template; the outline must be in exactly that shape.' });
  if (outline.id === state.world || savedFor(outline.id)) return refuse('world-in-play', null, { world: outline.id });
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, 'build');
  if (empty) return empty;
  writeMadeWorld(outline, ctx.now);
  return { state: s, result: { ok: true, built: outline.id, travel: outline.id } };
}

/* JSON as a model hands it over: parsed, or already an object; a string
   whose quotes arrived escaped (\") is unescaped once and parsed again. */
function jsonOf(raw) {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/\\"/g, '"')); }
}

/* What an outline may leave out because only one answer exists: the base
   (the one shipped world) and the id (the title, made folder-shaped). */
function withDefaults(outline) {
  if (!outline || typeof outline !== 'object') return outline;
  const o = { ...outline };
  if (o.base == null && listWorlds().length === 1) o.base = DEFAULT_WORLD;
  if (o.id == null && o.title) o.id = slugOf(o.title.en ?? o.title.zh);
  return o;
}

/* A folder-shaped id from a title: ascii letters and digits, dashes
   between; a title with none (all Chinese) hashes instead. */
function slugOf(title) {
  const slug = String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || `world-${hashOf(String(title)).toString(36).slice(0, 6)}`;
}

/* Every world there is — shipped and made — and which one the save plays. */
export function worlds(state) {
  const lang = state.lang;
  const list = allWorlds().map(id => {
    const w = loadWorld(id).world;
    return { id, title: pick(w.title, lang), style: pick(w.style, lang), made: Boolean(w.made), playing: id === state.world, saved: id === state.world || savedFor(id) };
  });
  return { state: null, result: { ok: true, worlds: list } };
}

/* Go to another world: the runner parks this save and restores that one,
   or begins it. */
export function travel(state, content, ctx, args) {
  const id = String(args.world ?? '');
  if (!knownWorld(id)) return refuse('unknown-world', null, { worlds: allWorlds() });
  if (id === state.world) return { state: null, result: { ok: true, here: true, world: id } };
  return { state: null, result: { ok: true, travel: id } };
}

/* Add to the world in play — a made one: a creature, and the place it
   haunts; or a place, with its roads laid both ways. The rules check it as
   they check an outline, write the world's files, and charge the save. */
export function amend(state, content, ctx, args) {
  if (!content.world.made) return refuse('not-a-made-world', null);
  if (args.creature == null && args.place == null) return refuse('nothing-to-add', null, { takes: ['creature', 'place'] });
  let creature = null, place = null;
  try {
    creature = args.creature == null ? null : pairsOf(strip(jsonOf(args.creature)), ['name', 'quote', 'look']);
    place = args.place == null ? null : pairsOf(strip(jsonOf(args.place)), ['name', 'line']);
  } catch { return refuse('not-json', null); }
  let at = args.at == null ? null : String(args.at);
  // "add the beast at the reed bank" arrives as the existing place under
  // `place`: that is where, not a new place.
  if (creature && place && ownPlaces(content).some(p => p.id === place.id)) { at ??= place.id; place = null; }
  if (creature && at == null && place == null) return refuse('not-playable', null, { problems: ['at: a creature needs the place it haunts'] });
  const problems = [
    ...(creature ? lintAmendCreature(creature, at, content) : []),
    ...(place ? lintAmendPlace(place, content) : []),
  ];
  if (problems.length) return refuse('not-playable', null, { problems });
  const s = clone(state);
  const empty = spendStamina(content, s, ctx, 'amend');
  if (empty) return empty;
  const dir = madeWorldDir(content.world.id);
  const pid = content.world.province.id;
  const placesFile = path.join(dir, `places/${pid}.json`);
  const doc = JSON.parse(fs.readFileSync(placesFile, 'utf8'));
  if (place) {
    for (const p of doc.places) if (place.roads.includes(p.id) && !p.roads.includes(place.id)) p.roads.push(place.id);
    doc.places.push(place);
  }
  if (creature) {
    const file = path.join(dir, 'creatures.json');
    const beasts = JSON.parse(fs.readFileSync(file, 'utf8'));
    beasts.creatures.push(creature);
    writeAtomic(file, JSON.stringify(beasts, null, 2));
    if (at) {
      const home = doc.places.find(p => p.id === at);
      home.has = { ...(home.has ?? {}), creature: creature.id };
    }
  }
  writeAtomic(placesFile, JSON.stringify(doc, null, 2));
  const added = { creature: creature?.id ?? null, at, place: place?.id ?? null };
  const show = creature && at === s.place ? [{ card: 'creature', id: creature.id }] : [];
  return { state: s, result: { ok: true, added, show, ...(creature ? { paint: [creaturePaint(creature)] } : {}) } };
}

/* A picture for a creature of this made world — the file GenerateImage
   wrote, moved beside the world and written into its card. */
export function art(state, content, ctx, args) {
  if (!content.world.made) return refuse('not-a-made-world', null);
  const id = String(args.creature ?? '');
  if (id === 'map') return mapArt(content, args);
  const creature = creatureOf(content, id);
  if (!creature?.made) return refuse('not-a-made-creature', null, { creatures: content.creatures.creatures.filter(c => c.made).map(c => c.id) });
  if (args.file == null) return { state: null, result: { ok: true, paint: creaturePaint(creature) } };
  const src = insideSkill(args.file);
  if (!src) return refuse('no-such-file', null, { file: args.file ?? null });
  const dir = madeWorldDir(content.world.id);
  const rel = `art/${id}${path.extname(src) || '.png'}`;
  fs.mkdirSync(path.join(dir, 'art'), { recursive: true });
  fs.copyFileSync(src, path.join(dir, rel));
  const file = path.join(dir, 'creatures.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = doc.creatures.find(c => c.id === id);
  entry.art = rel;
  entry.art_source = 'Drawn on this machine by the local picture model, for this world.';
  entry.art_caption = { zh: '灵境所绘', en: 'Drawn in Lingjing' };
  writeAtomic(file, JSON.stringify(doc, null, 2));
  return { state: null, result: { ok: true, creature: id, art: rel, url: servedAt(path.join(dir, rel)), ...leftToPaint(content, id) } };
}

/* After a picture is kept: what is still to paint, or ready to play. */
function leftToPaint(content, done) {
  const paint = paintList(content).filter(p => p.creature !== done);
  return paint.length ? { paint } : { ready: true };
}

/* The world's map: with no file, the arguments to paint it; with the file
   GenerateImage wrote, kept beside the world with the positions it was
   painted for, so a place added later never moves the ones on the picture. */
function mapArt(content, args) {
  if (args.file == null) return { state: null, result: { ok: true, paint: mapPaint(content) } };
  const src = insideSkill(args.file);
  if (!src) return refuse('no-such-file', null, { file: args.file });
  const dir = madeWorldDir(content.world.id);
  const rel = `art/map${path.extname(src) || '.png'}`;
  fs.mkdirSync(path.join(dir, 'art'), { recursive: true });
  fs.copyFileSync(src, path.join(dir, rel));
  const doc = Object.values(content.places)[0];
  const { at } = layoutRoads(doc.places, doc.start);
  const cardFile = path.join(dir, 'world.json');
  const card = JSON.parse(fs.readFileSync(cardFile, 'utf8'));
  card.map = { file: rel, at: Object.fromEntries(Object.entries(at).map(([id, p]) => [id, [p.x, p.y]])) };
  writeAtomic(cardFile, JSON.stringify(card, null, 2));
  return { state: null, result: { ok: true, map: rel, url: servedAt(path.join(dir, rel)), ...leftToPaint(content, 'map') } };
}

/* Where the page serves a file of the skill's folder: the URL Ling shows
   the picture by, exactly as given. */
const servedAt = file => `/apps/lingjing/${path.relative(skillDir(), file).split(path.sep).join('/')}`;

/* A file the tool may read: the path GenerateImage returned, or its URL
   under /apps/lingjing/ — inside the skill's folder, nowhere else. */
function insideSkill(raw) {
  const said = String(raw ?? '').trim().replace(/^\/apps\/lingjing\//, '');
  if (!said) return null;
  const candidate = path.isAbsolute(said) ? said : path.resolve(skillDir(), said);
  if (!fs.existsSync(candidate)) return null;
  const real = fs.realpathSync(candidate);
  return real.startsWith(fs.realpathSync(skillDir()) + path.sep) ? real : null;
}

/* The world map past the player's province — the page's alone, never a
   tool: each province's places where the map puts them. Here and the roads
   are Look's, for the province the player stands in. */
export function atlas(state, content) {
  const provinces = Object.fromEntries(Object.entries(content.places).map(([id, doc]) => [id, {
    name: pick(content.dictionary.provinces[id], state.lang),
    places: doc.places.filter(p => p.map).map(p => ({ ...placeName(content, state, p), map: p.map, too_hard: tooHard(content, state, p) })),
  }]));
  return { state: null, result: { ok: true, provinces } };
}

/* 摇铃 — the bell rung where water holds a moon: she answers with a riddle of
   her own and joins when it is answered. A miss brings the hint, a second
   shuts the bell until tomorrow, as every riddle does. */
export function ring(state, content, ctx, args) {
  const c = companionOf(content), lang = state.lang;
  if (!c || !state.companion || state.companion.joined) return refuse('not-yet', null);
  const s = clone(state);
  settlePlace(content, s);
  const here = placeOf(content, s.place);
  if (!here?.water) return refuse('not-water', pick({ zh: '这里没有水照月。', en: 'No water here to hold a moon.' }, lang), { place: here ? placeName(content, s, here) : null });
  const bell = itemOf(content, c.bell);
  if (!(s.bag[c.bell] > 0)) return refuse('no-bell', pick({ zh: `手里没有${pick(bell.name, 'zh')}。`, en: `You have no ${pick(bell.name, 'en')}.` }, lang), { needs: bell.id, buy: bell.buy });
  const key = companionRiddle(content, s, ctx.now);
  const riddle = content.riddles[lang].riddles[key];
  const slot = s.companion.riddle?.day === dayKey(ctx.now) && s.companion.riddle.key === key ? s.companion.riddle : null;
  const tried = slot?.tried ?? [];
  if (tried.length >= RIDDLE_TRIES) return refuse('riddle-closed', null);
  const keep = (t, open) => {
    s.companion = { ...s.companion, riddle: { day: dayKey(ctx.now), key, tried: t, ...(open ? { open: true } : {}) } };
    s.riddles_seen = [...new Set([...(s.riddles_seen ?? []), key])];
  };
  if (args.answer == null) {
    keep(tried, true);
    return { state: s, result: { ok: false, refused: 'needs-answer', say: pick(c.meet, lang), choices: riddle.choices } };
  }
  if (!judgeAnswer(content, key, args.answer)) {
    const missed = [...tried, String(args.answer).trim()];
    const closed = missed.length >= RIDDLE_TRIES;
    keep(missed, !closed);
    return { state: s, result: { ok: false, refused: closed ? 'riddle-closed' : 'wrong-answer', ...(closed ? {} : { hint: riddle.hint }) } };
  }
  s.companion = { joined: dayKey(ctx.now) };
  gainCard(content, s, c.id, { how: 'companion', day: dayKey(ctx.now) }); // 银月 is a card he holds from now on
  s.wear = { ...(s.wear ?? {}), [c.id]: c.bell };
  const paid = c.grant ? pay(content, s, ctx, c.grant) : null;
  // What the cauldrons already gave back comes to her at once: a story node (story.mjs).
  const node = joinNode(content, s, ctx.now);
  if (node) s.node = node;
  // Her first words are hers too: the join's line goes to her, Ling narrates the rest.
  const beat = spoken(content, s, c.join);
  const her = herBeat(content, s, { id: `join/${c.id}`, lines: c.join, happened: [pick(c.meet, lang), ...beat.map(b => b.text)] });
  if (her) s.node = withHerBeat(node, her, ctx.now);
  return { state: s, result: { ok: true, joined: { id: c.id, name: nameOf(content, c.id, lang) }, beat, ...(paid ? { paid } : {}), ...(node ? { node } : {}), ...(her ? { her_beat: her } : {}), summarize: true } };
}

export { building, keepDay, keepSave, readSave };
