// The rules engine — the only writer of a player's state. Ling proposes by
// calling a verb; the rules check it against the state and the content and
// either apply it or refuse with a reason Ling can narrate.
//
//   node rules.mjs <verb> [--key value …]
//   verbs: init look resolve judge task win duel tame write refine nourish branch summarize move trade lang make enter leave
//          build worlds travel amend art go saves save load forget undo
//
// Every verb prints one JSON object. A refusal is {ok:false, refused, say}
// and never changes state. The save says which world it plays; `init` begins
// it again — or another with `--world` — and logs the save it replaces. `build` and
// `travel` switch worlds: the save in play is parked under data/saves/ and
// the other world's is restored, or begun.
// Env: LINGJING_DATA, LINGJING_QUESTS, LINGJING_NOW; LINGGEN_USER_TURNS from the engine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARM_SLOTS, CAST, DEFAULT_WORLD, MADE, WORLD, allWorlds, cardOf, gameOf, hasWorld, knownWorld, lintAmendCreature,
  lintAmendPlace, lintMade, lintMadeWorld, listWorlds, loadWorld, madeWorldDir, overlayOf, ownPlaces, pairsOf,
} from './content.mjs';
import { armOf, fight, foeOf } from './duel.js';
import { layoutRoads, placeWords } from './roadmap.js';
import {
  addProgress, dayKey, fill, langOf, migrate, newState, normalizeAnswer, periodKey, periodStart, pick, rollDay,
  payOf, speedOf, stepName, threshold, tierOf,
  addStamina, staminaReturnsAt, settleStamina,
} from './state.mjs';

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
  const cid = place?.has?.creature;
  if (!cid || atScene(content, state)) return null;
  const creature = creatureOf(content, cid);
  if (!creature) return null;
  const lang = state.lang, game = { id: hauntId(cid), kind: 'duel', creature: cid };
  const today = state.duels?.[cid], day = dayKey(now);
  const item = creature.likes ? itemOf(content, creature.likes) : null;
  return {
    creature: { id: cid, name: pick(creature.name, lang) },
    game,
    duel: duelBrief(content, state, game, now),
    won: Boolean(state.wins?.[game.id]) && today?.day === day && today.outcome === 'won',
    withdrawn: today?.day === day && today.outcome === 'lost',
    tamed: state.cast.includes(cid),
    likes: item ? { id: item.id, name: pick(item.name, lang), held: state.bag[item.id] ?? 0 } : null,
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
  };
}

/* The first road on the shortest way from one place to another, walking
   only places the player may enter — or null when no such way runs. */
function towardOf(content, state, from, to, now) {
  const walkable = p => p && !tooHard(content, state, p) && provinceOpen(content, p.province, now);
  if (!walkable(to)) return null;
  const first = new Map(from.roads.map(id => [id, id]));
  const queue = [...from.roads], seen = new Set([from.id, ...from.roads]);
  while (queue.length) {
    const p = placeOf(content, queue.shift());
    if (!walkable(p)) continue;
    if (p.id === to.id) return placeName(content, state, placeOf(content, first.get(p.id)));
    for (const id of p.roads) if (!seen.has(id)) { seen.add(id); first.set(id, first.get(p.id)); queue.push(id); }
  }
  return null;
}

/* The nearest place the player's tier allows: here, else a road out. */
function fittingPlace(content, state, from) {
  if (!tooHard(content, state, from)) return from;
  return from.roads.map(id => placeOf(content, id)).find(p => !tooHard(content, state, p)) ?? from;
}

/* The corridor: a chapter that walks the player scene by scene; the world
   opens when it ends. */
const inCorridor = (content, state) => !inMade(state) && Boolean(state.scene) && Boolean(content.chapters[state.chapter]?.corridor);

/* The thread — the pull: the scene while one runs, else the next chapter
   and when it opens; nothing when the spine has run out. */
/* ── The companion — she is found, not given ──
   A world declares one in `world.json`: who she is, the realm her call comes
   at, the bell that calls her, her riddles and the beat when she joins. Until
   she is found the game never shows her: her lines are the narration's (a
   line may carry `alone` for that), she is not in the cast, her gifts cannot
   be given, and the stage stands empty (his rule, 2026-09-17). */
const companionOf = content => content.world.companion ?? null;
export const hasCompanion = state => Boolean(state.companion?.joined);
const callDue = (content, state) => {
  const c = companionOf(content);
  if (!c) return false;
  const tiers = content.ladder.tiers;
  return tiers.findIndex(t => t.id === state.tier) >= tiers.findIndex(t => t.id === c.from);
};
/* Her riddle, once asked today, stays today's; else one this play has not seen. */
function companionRiddle(content, state, now) {
  const c = companionOf(content), slot = state.companion?.riddle;
  if (slot?.day === dayKey(now) && c.riddles.includes(slot.key)) return slot.key;
  const seen = new Set(state.riddles_seen ?? []);
  const fresh = c.riddles.filter(k => !seen.has(k));
  const pool = fresh.length ? fresh : c.riddles;
  return pool[hashOf(`${dayKey(now)}|${state.name ?? ''}|companion`) % pool.length];
}
const riddleWaiting = (state, now) => {
  const slot = state.companion?.riddle;
  return Boolean(slot?.open && slot.day === dayKey(now));
};
/* The nearest place the player could walk to that answers a test — a market
   for the bell, water for the bell's sound — by the roads, never as the crow
   flies, skipping closed provinces and what is beyond their tier. */
function nearestPlace(content, state, now, test) {
  const here = placeOf(content, state.place);
  if (!here) return null;
  const seen = new Set([here.id]);
  let edge = [here];
  for (let steps = 0; steps < 12 && edge.length; steps += 1) {
    const next = [];
    for (const p of edge) {
      if (steps > 0 && test(p)) return { ...placeName(content, state, p), steps };
      for (const id of p.roads ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const q = placeOf(content, id);
        if (q && provinceOpen(content, q.province, now) && !tooHard(content, state, q)) next.push(q);
      }
    }
    edge = next;
  }
  return test(here) ? { ...placeName(content, state, here), steps: 0 } : null;
}

/* The quest as Look tells it: the step, what it asks, and the line for it. */
function questBrief(content, state, now) {
  const c = companionOf(content);
  if (!c || !state.companion || state.companion.joined) return null;
  const lang = state.lang, bell = itemOf(content, c.bell);
  const here = placeOf(content, state.place);
  const held = (state.bag[c.bell] ?? 0) > 0;
  const step = riddleWaiting(state, now) ? 'riddle' : !held ? 'bell' : here?.water ? 'ring' : 'water';
  return {
    id: c.id, step,
    bell: { id: bell.id, name: pick(bell.name, lang), buy: bell.buy, held },
    line: pick(step === 'bell' || step === 'water' ? c.call : c.water, lang),
    at_water: Boolean(here?.water),
    // Where the step can be taken: the market that sells her bell, the water
    // that holds a moon — the nearest by road (his "not clickable", and no
    // way to know where, 2026-09-17).
    market: step === 'bell' ? nearestPlace(content, state, now, p => p.has?.shop) : null,
    water: step === 'water' ? nearestPlace(content, state, now, p => p.water) : null,
    shop_here: Boolean(here?.has?.shop),
    // The call is heard once: until it has been said, every answer asks for it.
    ...(state.companion.told ? {} : { say: true }),
  };
}

/* A cauldron's breath, as the rules would judge it now: `ready` at the peak
   of the tier this chapter's cauldron lifts from; `need` names that peak and
   the 修为 it asks, and the realm it opens. Resolve refuses on the same terms. */
function breakthroughOf(content, state) {
  const tiers = content.ladder.tiers, tier = tierOf(content, state.tier), next = tiers[tiers.indexOf(tier) + 1];
  const gate = content.chapters[state.chapter]?.gate;
  const peak = state.step === tier.thresholds.length - 1 && state.progress >= threshold(content, state);
  const target = tiers.find(t => t.gate != null && t.gate === gate);
  const source = target ? tiers[tiers.indexOf(target) - 1] : null;
  const last = source ? source.thresholds.length - 1 : 0;
  return {
    ready: Boolean(peak && next && next.gate === gate),
    need: source ? { step: stepName(content, source.id, last, state.lang), progress: source.thresholds[last], to: pick(target.name, state.lang) } : null,
  };
}

/* A scene that waits only on a breath the player cannot take yet: the way
   on is the world, not back to the cauldron. */
function waitsOnPeak(content, state) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  const exits = (scene?.buttons ?? []).map(id => scene.exits.find(e => e.id === id));
  return exits.length > 0 && exits.every(e => e?.breakthrough) && !breakthroughOf(content, state).ready;
}

/* The nearest open road out of a scene's place the player can walk. */
function wayBack(content, state, now) {
  const scene = sceneOf(content, state);
  const here = placeOf(content, scene?.at ?? state.place);
  return (here?.roads ?? []).map(id => placeOf(content, id)).find(p => provinceOpen(content, p.province, now) && !tooHard(content, state, p)) ?? null;
}

function threadOf(content, state, now) {
  const lang = state.lang;
  const scene = inMade(state) ? null : sceneOf(content, state);
  if (scene && atScene(content, state)) return { scene: scene.id, text: fill(pick(scene.setup, lang), state) };
  if (scene) {
    const at = placeOf(content, scene.at);
    return { scene: scene.id, place: placeName(content, state, at), province: pick(content.dictionary.provinces[at.province], lang),
      text: lang === 'zh' ? `路通向${pick(at.name, 'zh')}。` : `The road leads to ${pick(at.name, 'en')}.` };
  }
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return null;
  const opens = next.opens && new Date(next.opens) > now ? next.opens : null;
  const at = next.scenes[next.first_scene]?.at;
  return { chapter: next.id, title: pick(next.title, lang), opens, province: pick(content.dictionary.provinces[next.province], lang), place: at ? placeName(content, state, placeOf(content, at)) : null };
}

const poolOf = (content, state) => {
  const q = content.rewards.stamina, r = state.stamina / q.max;
  return r >= 0.6 ? 'full' : r >= 0.25 ? 'half' : state.stamina >= q.cost.step ? 'low' : 'empty';
};

/* The director's brief: what Ling improvises inside this turn — what is
   near, what is beyond the player, the thread, the pool, today's seed. The
   rules still decide every outcome. */
function directorBrief(content, state, ctx) {
  const place = placeOf(content, state.place);
  if (!place) return null;
  const roads = place.roads.map(id => placeOf(content, id)).filter(p => provinceOpen(content, p.province, ctx.now));
  const closed = place.roads.map(id => placeOf(content, id)).filter(p => !provinceOpen(content, p.province, ctx.now));
  const seed = place.has?.seeds && state.day.branches < content.branches.per_day && !state.branch
    ? pickSeed(content, state, content.branches.templates[0].kind, ctx.now) : null;
  const here = placeName(content, state, place);
  const near = roads.filter(p => !tooHard(content, state, p)).map(p => placeName(content, state, p));
  const thread = threadOf(content, state, ctx.now);
  // The first road on the way to the thread's place, when it is not a road
  // away itself — so the choice leads with the way on, not the way back.
  // A cauldron that waits on the peak is not led to: the player just left it.
  const led = waitsOnPeak(content, state) ? null : thread;
  const goal = led?.place && placeOf(content, led.place.id);
  const toward = goal && !near.some(p => p.id === goal.id) ? towardOf(content, state, place, goal, ctx.now) : null;
  return {
    here,
    near,
    too_hard: roads.filter(p => tooHard(content, state, p)).map(p => placeName(content, state, p)),
    closed: closed.map(p => ({ ...placeName(content, state, p), province: pick(content.dictionary.provinces[p.province], state.lang) })),
    corridor: inCorridor(content, state),
    thread,
    pool: poolOf(content, state),
    seed: seed ? { id: seed.id, line: seed.line } : null,
    choice: atScene(content, state) ? null : choiceOf(state, here, near, toward ? { ...led, place: toward } : led, Boolean(seed), ctx.said, canWrite(content, state), filler(content, state, ctx.said)),
  };
}

/* The way forward while the world is open, ready for AskUser as it is: the
   thread's place first, then the other roads, a linger when today's seed
   waits here, and a word to Yinyue so there are always two. Ling offers it
   verbatim; a tapped label is its `move` (Move there at once), `linger`
   (Branch open) or `ask` (Yinyue answers). A scene's own buttons take its
   place while one runs. */
function choiceOf(state, here, near, thread, seeded, said, write = false, alone = null) {
  const zh = state.lang === 'zh';
  const first = thread?.place && near.find(p => p.id === thread.place.id);
  const places = first ? [first, ...near.filter(p => p.id !== first.id)] : near;
  const options = [];
  // 降妖 and the feeding are on the creature's card, the cast on its coins, the
  // bell on the quest's card: one clickable place each, never asked here too
  // (his law, 2026-09-17 — "user will click twice"). 写符 has no card of its own.
  if (write) options.push({ label: zh ? '写一道符' : 'Write a talisman', write: true });
  options.push(...places.map(p => ({ label: p.name, move: p.id })));
  if (seeded) options.push({ label: zh ? '在此逗留' : 'Linger here', linger: true });
  if (options.length < 2) options.push(alone ?? { label: zh ? '看看四周' : 'Look around', look: true });
  return { header: here.name, question: zh ? '何去何从？' : 'What now?', options };
}

/* The second option when the world offers only one: a word to Yinyue, or a
   look around — never the one the player just took, so the same choice is
   not offered twice running (his "that is duplicated", 2026-09-16). */
const FILLERS = {
  zh: [{ label: '问问银月', ask: true }, { label: '看看四周', look: true }],
  en: [{ label: 'Ask Yinyue', ask: true }, { label: 'Look around', look: true }],
};
// Before she is found there is no one to ask: two ways of looking instead.
const ALONE = {
  zh: [{ label: '看看四周', look: true }, { label: '说说此地', look: true }],
  en: [{ label: 'Look around', look: true }, { label: 'Tell me about this place', look: true }],
};
function filler(content, state, said) {
  const pair = (hasCompanion(state) ? FILLERS : ALONE)[state.lang === 'zh' ? 'zh' : 'en'];
  const last = String(said ?? '').trim();
  return pair.find(f => f.label !== last) ?? pair[0];
}
const taskOf = (content, id) => content.tasks.tasks.find(t => t.id === id);
const itemOf = (content, id) => content.items.items.find(i => i.id === id);

/* One effect, as the card tells it. Arms carry the fight's own numbers: 攻
   with the root a weapon lends, 防, 抗 by element. */
const ELEMENT_NAME = (content, lang, el) => pick(content.traits.elements[el], lang);
const EFFECT_BRIEF = {
  key: () => ({ key: true }),
  progress: e => ({ progress: e.progress }),
  wear: e => ({ wear: e.wear }),
  charm: () => ({ charm: true }),
  atk: (e, content, lang) => ({ atk: e.atk, ...(e.root ? { root: e.root, root_name: ELEMENT_NAME(content, lang, e.root) } : {}) }),
  def: e => ({ def: e.def }),
  ward: (e, content, lang) => ({ ward: e.ward, wards: Object.entries(e.ward).map(([el, n]) => ({ id: el, name: ELEMENT_NAME(content, lang, el), n })) }),
  temper: (e, content, lang) => ({ temper: e.temper, ...(e.core ? { core: e.core, core_name: ELEMENT_NAME(content, lang, e.core) } : {}) }),
};
function effectBrief(content, lang, effect) {
  const e = effect ?? {};
  const key = Object.keys(EFFECT_BRIEF).find(k => e[k] != null);
  return key ? EFFECT_BRIEF[key](e, content, lang) : null;
}

/* An item as Look and the card tell it: its words, its prices, its one
   effect, and how many the player holds. */
function itemBrief(content, state, item) {
  const lang = state.lang;
  return {
    id: item.id, kind: item.kind, name: pick(item.name, lang), about: pick(item.about, lang), art: item.art,
    buy: item.buy, sell: item.sell, held: state.bag[item.id] ?? 0,
    effect: effectBrief(content, lang, item.effect),
    worn: Object.values(state.wear ?? {}).includes(item.id),
    ...(item.made?.from ? { made_from: pick(itemOf(content, item.made.from)?.name, lang) } : {}),
  };
}

/* ── 本命法宝: the treasure a cultivator binds at 结丹 ── */

/* What a subdued creature leaves behind: the 妖丹 of the realm it was met at,
   and the one thing this creature carries (creatures.json `drops`). Both go
   into the bag; the catalog owns their words and their worth. */
function drop(content, state, creature) {
  const lang = state.lang, got = [];
  for (const id of [TIER_TEMPER[state.tier], creature.drops].filter(Boolean)) {
    const item = itemOf(content, id);
    if (!item) continue;
    state.bag[id] = (state.bag[id] ?? 0) + 1;
    got.push({ id, name: pick(item.name, lang), n: state.bag[id] });
  }
  return got;
}

/* 一重 … 九重: what each 重 asks in 温养 and 妖丹 before the next. */
export const TREASURE_TOP = 9;
export const NOURISH = 1; // 温养, once a day
const expFor = level => 10 + (level - 1) * 5;
const TIER_TEMPER = { qi: 'yaodan-1', foundation: 'yaodan-1', core: 'yaodan-2', nascent: 'yaodan-3' };
/* The realm a cultivator may bind one at, and the material that names its element. */
const REFINE_TIER = 'core';
const coreOf = (content, id) => content.items.items.find(i => i.id === id && i.effect?.core);
const canRefine = (content, state) => tierRank(content, REFINE_TIER) <= tierIndex(content, state);

/* The treasure as the card and Look tell it. */
function treasureBrief(content, state) {
  const t = state.treasure;
  if (!t) return null;
  const lang = state.lang, steps = content.ladder.treasure_steps ?? null;
  return {
    name: t.name, level: t.level, step: steps ? pick(steps, lang)?.[t.level - 1] ?? String(t.level) : String(t.level),
    element: t.element, element_name: pick(content.traits.elements[t.element], lang),
    atk: t.base + t.level, exp: t.exp, needs: t.level >= TREASURE_TOP ? null : expFor(t.level),
    nourished: state.day?.nourished === dayKey(new Date(state.updated ?? Date.now())) ? true : undefined,
  };
}

/* Feed a treasure: exp in, 重 out. Never past 九重. */
function grow(treasure, exp) {
  const t = { ...treasure, exp: treasure.exp + exp };
  const gained = [];
  while (t.level < TREASURE_TOP && t.exp >= expFor(t.level)) { t.exp -= expFor(t.level); t.level += 1; gained.push(t.level); }
  if (t.level >= TREASURE_TOP) t.exp = 0;
  return { treasure: t, gained };
}

/* 炼化本命 — once, at 结丹: the worn weapon and one core material become the
   player's own treasure, and the player names it as they named their 道号.
   The weapon and the material are spent; a treasure is never lost. */
export function refine(state, content, ctx, args) {
  const lang = state.lang;
  if (state.treasure) return refuse('already-bound', pick({ zh: `你已有本命法宝${state.treasure.name}。`, en: `${state.treasure.name} is already yours.` }, lang), { treasure: treasureBrief(content, state) });
  if (!canRefine(content, state)) {
    const tier = pick(tierOf(content, REFINE_TIER)?.name, lang);
    return refuse('needs-tier', pick({ zh: `炼化本命须结丹之后。`, en: `A treasure is bound at ${tier}, not before.` }, lang), { tier: REFINE_TIER });
  }
  const weapon = wornOf(content, state, 'weapon');
  if (!weapon) return refuse('no-weapon', pick({ zh: '手中无器可炼。', en: 'There is nothing in your hand to refine.' }, lang));
  const material = coreOf(content, String(args.material ?? '').trim());
  if (!material) return refuse('needs-material', pick({ zh: '还须一味天材地宝。', en: 'It wants a material of the five.' }, lang), { materials: content.items.items.filter(i => i.effect?.core).map(i => ({ id: i.id, name: pick(i.name, lang), element: i.effect.core, held: state.bag[i.id] ?? 0 })) });
  if (!(state.bag[material.id] > 0)) return refuse('not-in-bag', null, { needs: { id: material.id, name: pick(material.name, lang) } });
  const name = String(args.name ?? '').trim();
  if (!name || name.length > 12) return refuse('needs-name', pick({ zh: '它还没有名字。', en: 'It has no name yet.' }, lang));
  const s = clone(state);
  s.bag[material.id] -= 1;
  if (!s.bag[material.id]) delete s.bag[material.id];
  s.bag[weapon.id] -= 1;
  if (!s.bag[weapon.id]) delete s.bag[weapon.id];
  if (s.wear?.weapon === weapon.id) delete s.wear.weapon;
  s.treasure = { name, base: weapon.effect?.atk ?? 0, element: material.effect.core, level: 1, exp: 0 };
  return { state: s, result: { ok: true, refined: { from: pick(weapon.name, lang), with: pick(material.name, lang) }, treasure: treasureBrief(content, s), show: [{ card: 'treasure' }] } };
}

/* 温养 — once a day, a quiet hour with it: one breath of growth. The page
   taps it; no model decides it. */
export function nourish(state, content, ctx, args) {
  if (!state.treasure) return refuse('no-treasure', null);
  const day = dayKey(ctx.now);
  if (state.day?.nourished === day) return refuse('nourished-today', null, { treasure: treasureBrief(content, state) });
  if (state.treasure.level >= TREASURE_TOP) return refuse('at-top', null, { treasure: treasureBrief(content, state) });
  const s = clone(state);
  const { treasure, gained } = grow(s.treasure, NOURISH);
  s.treasure = treasure;
  s.day = { ...(s.day ?? {}), key: day, nourished: day };
  return { state: s, result: { ok: true, nourished: NOURISH, ...(gained.length ? { rose: gained } : {}), treasure: treasureBrief(content, s) } };
}

/* ── 功法: the sword, the 符 and the learned arts ── */

const artOf = (content, id) => (content.arts?.arts ?? []).find(a => a.id === id);
const tierRank = (content, id) => content.ladder.tiers.findIndex(t => t.id === id);
const artReady = (content, state, art) => tierRank(content, art.tier) <= tierIndex(content, state);
const charmOf = content => content.items.items.find(i => i.effect?.charm) ?? null;

function artBrief(content, state, art) {
  const lang = state.lang, ready = artReady(content, state, art);
  return {
    id: art.id, name: pick(art.name, lang), about: pick(art.about, lang), source: pick(art.source, lang), effect: art.effect,
    tier: { id: art.tier, name: pick(tierOf(content, art.tier)?.name, lang) }, ready, why: ready ? null : 'art-needs-tier',
  };
}
const artsBrief = (content, state) => (state.arts ?? []).map(id => artOf(content, id)).filter(Boolean).map(a => artBrief(content, state, a));

/* An art learned, never bought: null when unknown or already known. */
function learn(content, state, id) {
  const art = artOf(content, id);
  if (!art || state.arts?.includes(id)) return null;
  state.arts = [...(state.arts ?? []), id];
  return artBrief(content, state, art);
}

/* What the player stands in a fight with — duel.js reads it, the card too:
   their roots and realm, the arms they wear, the 符 in the bag, the arts
   they know, the day's cast and their 日主. */
const wornOf = (content, state, slot) => (state.wear?.[slot] && state.bag[state.wear[slot]] ? itemOf(content, state.wear[slot]) : null);

function kitOf(content, state, now = null) {
  const weapon = wornOf(content, state, 'weapon'), robe = wornOf(content, state, 'robe'), pendant = wornOf(content, state, 'pendant');
  const charm = charmOf(content);
  const arts = {};
  for (const id of state.arts ?? []) { const a = artOf(content, id); if (a) arts[id] = { effect: a.effect, ready: artReady(content, state, a) }; }
  // A 本命法宝 is the weapon from the day it is refined, and lends its own
  // element the way a 法器 lends its root.
  const treasure = state.treasure ? { ...state.treasure } : null;
  return {
    roots: state.traits ?? [], tier: state.tier, step: state.step ?? 0,
    sword: treasure?.element ?? weapon?.effect?.root ?? null,
    weapon: weapon ? { id: weapon.id, atk: weapon.effect?.atk ?? 0 } : null,
    ...(treasure ? { treasure } : {}),
    robe: robe ? { id: robe.id, def: robe.effect.def } : null,
    pendant: pendant ? { id: pendant.id, ward: pendant.effect.ward } : null,
    charm: charm ? { id: charm.id, held: state.bag[charm.id] ?? 0 } : null, arts,
    ...(now && boutFortune(content, state, now) ? { fortune: boutFortune(content, state, now) } : {}),
    ...(state.fate?.element ? { fate: { root: state.fate.element } } : {}),
  };
}

/* The same day, creature and 道号 draw the same creature — an undo cannot
   fish for an easier one. */
const duelSeed = (state, creature, now) => `${dayKey(now)}|${creature.id}|${state.name ?? ''}`;

/* The market's shelf: the catalog sold in this province — and, while the
   companion is still to be found, her bell at every market, since the call
   comes wherever the player stands. */
const shelfOf = (content, province, state = null) => {
  const sold = content.items.items.filter(i => (i.sold ?? []).includes(province));
  const c = companionOf(content);
  const searching = c && state && !state.companion?.joined && (state.companion || callDue(content, state)) && !(state.bag[c.bell] > 0);
  return searching && !sold.some(i => i.id === c.bell) ? [...sold, itemOf(content, c.bell)] : sold;
};
const forSale = (content, state, item, province) => shelfOf(content, province, state).some(i => i.id === item.id);

/* A speaker's name in the player's language; Ling narrates, unnamed. */
const nameOf = (content, who, lang) => (who === 'ling' ? null : pick(CAST[who] ?? creatureOf(content, who)?.name, lang));
/* Lines as the scene says them. Before the companion is found, her line is
   the narration's `alone` text, or it is not said at all. */
const spoken = (content, state, lines) => (lines ?? []).flatMap(l => {
  const c = companionOf(content);
  if (c && l.who === c.id && !hasCompanion(state)) {
    return l.alone ? [{ who: 'ling', name: null, text: fill(pick(l.alone, state.lang), state) }] : [];
  }
  return [{ who: l.who, name: nameOf(content, l.who, state.lang), text: fill(pick(l.text, state.lang), state) }];
});

/* A made world is read by its map: its scenes stand at places, so their
   cards end with the province's map, as its places' do. */
const withMap = (content, show) => (content.world.made && !show.some(c => c.card === 'map') ? [...show, { card: 'map' }] : show);

function sceneBrief(content, state, now = new Date()) {
  const scene = sceneOf(content, state);
  if (!scene) return null;
  const ctxNow = now;
  const lang = state.lang, say = pair => fill(pick(pair, lang), state);
  const buttons = scene.buttons ?? [];
  return {
    id: scene.id,
    place: say(scene.place),
    setup: say(scene.setup),
    cast: (scene.cast ?? []).filter(id => id !== companionOf(content)?.id || hasCompanion(state)).map(id => ({ id, name: nameOf(content, id, lang) })),
    show: withMap(content, scene.show ?? []),
    lines: spoken(content, state, scene.lines),
    buttons: buttons.map(id => ({ id, label: say(scene.exits.find(e => e.id === id).label) })),
    exits: scene.exits.map(e => exitBrief(content, state, e, buttons.includes(e.id), ctxNow, scene)),
  };
}

/* The fight as the scene draws it: the creature at the player's own realm —
   its numbers, its lean and the turns it takes — the player's roots and
   arms, and today's fight if one is open or done. */
function duelBrief(content, state, game, now) {
  const creature = creatureOf(content, game.creature);
  const lang = state.lang, today = state.duels?.[game.creature];
  const open = today?.day === dayKey(now) ? today : null;
  return {
    id: game.id, creature: { id: creature.id, name: pick(creature.name, lang), ...(lang === 'zh' && creature.pinyin ? { pinyin: creature.pinyin } : {}), root: creature.root, root_name: pick(content.traits.elements[creature.root], lang) },
    foe: foeOf(creature, state.tier, state.step ?? 0, duelSeed(state, creature, now)),
    roots: (state.traits ?? []).map(e => ({ id: e, name: pick(content.traits.elements[e], lang) })),
    ...duelKitBrief(content, state, now),
    today: open ? { outcome: open.outcome, log: open.log ?? [] } : null,
  };
}

/* The arms worn, the 符 in hand and the arts known, as the card draws them
   beside the player's own roots; `kit` is the same duel.js reads. */
function duelKitBrief(content, state, now = null) {
  const lang = state.lang, kit = kitOf(content, state, now);
  const named = arm => (arm ? { ...arm, name: pick(itemOf(content, arm.id)?.name, lang) } : null);
  const weapon = kit.weapon ? itemOf(content, kit.weapon.id) : null, charm = charmOf(content);
  return {
    sword: weapon ? { id: weapon.id, name: pick(weapon.name, lang), atk: kit.weapon.atk, ...(weapon.effect?.root ? { root: weapon.effect.root, root_name: pick(content.traits.elements[weapon.effect.root], lang) } : {}) } : null,
    ...(kit.treasure ? { treasure: treasureBrief(content, state) } : {}),
    robe: named(kit.robe), pendant: named(kit.pendant),
    charm: charm ? { id: charm.id, name: pick(charm.name, lang), held: kit.charm.held } : null,
    arts: artsBrief(content, state),
    kit,
  };
}

function exitBrief(content, state, exit, button, ctxNow = new Date(), scene = sceneOf(content, state)) {
  const brief = { id: exit.id, means: exit.means, button };
  if (exit.needs) brief.needs = exit.needs;
  if (exit.breakthrough) brief.breakthrough = breakthroughOf(content, state);
  if (exit.key) {
    const key = riddleOf(state, scene, exit, ctxNow);
    const riddle = content.riddles[state.lang].riddles[key], tried = triedToday(state, scene, exit, key, ctxNow);
    const closed = tried.length >= RIDDLE_TRIES;
    Object.assign(brief, { riddle: riddle.q, choices: riddle.choices, tried, closed, ...(!closed && riddleOpen(state, scene, exit, key, ctxNow) ? { waiting: true } : {}) });
  }
  const game = gameOf(exit);
  if (game) {
    Object.assign(brief, { game, won: Boolean(state.wins?.[game.id]) });
    if (game.kind === 'duel') {
      const today = state.duels?.[game.creature];
      brief.withdrawn = today?.day === dayKey(ctxNow) && today.outcome === 'lost';
      brief.duel = duelBrief(content, state, game, ctxNow);
    }
  }
  if (exit.value) brief.value = { field: exit.value.field, max_chars: exit.value.max_chars, offers: exit.value.offers.map(o => pick(o, state.lang)) };
  return brief;
}


function tasksBrief(content, state, ctx) {
  const lang = state.lang;
  // Today's practice: what is offered or won, and what was done today. A
  // task done once on an earlier day is history, not today's (his "what is
  // this task for today?", 2026-09-16, the prologue's alchemy five days on).
  const today = dayKey(ctx.now);
  const tasks = Object.entries(state.tasks)
    .filter(([, t]) => t.status !== 'done' || (t.done_at ? dayKey(new Date(t.done_at)) === today : false))
    .map(([id, t]) => {
      const task = taskOf(content, id);
      return {
        id, title: pick(task.title, lang), kind: task.kind, status: t.status,
        won: Boolean(state.wins?.[id]),
        paid: t.status === 'done', period: t.period ?? task.period ?? null, // done = paid, once or per period
        done_at: t.done_at ?? null,
        // what it asks and what it pays, so Ling can tell the practice
        asks: task.kind === 'board' ? (lang === 'zh' ? '在炉前把八味灵草两两配齐' : 'Pair the eight spirit herbs on the furnace board') : null,
        pays: task.grant?.progress ?? null, gives: task.gives?.bag ? pick(itemOf(content, task.gives.bag)?.name, lang) : null,
      };
    });
  const quests = (ctx.quests ?? []).filter(q => q.due || questDone(q, ctx.now)).map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang),
    done: questDone(q, ctx.now), paid: state.quests[q.id]?.period === periodKey(q.period, ctx.now),
    done_at: questDone(q, ctx.now) ? q.done_at : null, // when its app saw it done — the scene says so
    period: q.period, reward: q.reward ?? null, stamina: q.stamina ?? null, // what it pays, so Ling can tell the practice
  }));
  return { tasks, quests };
}

/* The world's words for the harness's ids, in the player's language — the
   only names Ling, the cards and the lines ever use. */
function wordsOf(content, lang) {
  const words = Object.fromEntries(Object.entries(content.dictionary.words).map(([id, w]) => [id, pick(w, lang)]));
  return {
    ...words,
    tiers: content.ladder.tiers.map(t => pick(t.name, lang)),
    provinces: Object.values(content.dictionary.provinces).map(p => pick(p, lang)),
  };
}

export function look(state, content, ctx) {
  const lang = state.lang;
  state = clone(state);
  settleStamina(content, state, ctx.now);
  settlePlace(content, state);
  rollDay(state, ctx.now);
  const traits = state.traits && {
    ids: state.traits,
    elements: state.traits.map(e => pick(content.traits.elements[e], lang)),
    name: pick(content.traits.names[String(state.traits.length)], lang),
    speed: speedOf(content, state),
  };
  const chapter = content.chapters[state.chapter];
  return {
    then: THEN, ask: askOf(content, state, ctx),
    ok: true, lang, name: state.name,
    world: worldBrief(content, lang),
    ...building(content),
    tier: { id: state.tier, step: state.step + 1, name: stepName(content, state.tier, state.step, lang) },
    progress: state.progress, next: threshold(content, state), wealth: state.wealth,
    traits,
    bag: Object.entries(state.bag).map(([id, n]) => ({ id, name: pick(itemOf(content, id)?.name, lang) ?? id, n })),
    wear: state.wear ?? {},
    arts: artsBrief(content, state),
    treasure: treasureBrief(content, state, ctx.now),
    ...(state.treasure || !canRefine(content, state) ? {} : { can_refine: true }),
    cast: state.cast.map(id => ({ id, name: pick(creatureOf(content, id).name, lang) })),
    chapter: { id: chapter.id, title: pick(chapter.title, lang) },
    scene: atScene(content, state) ? sceneBrief(content, state, ctx.now) : null,
    waypoint: !atScene(content, state) && sceneOf(content, state) && !inMade(state) ? threadOf(content, state, ctx.now) : null,
    place: placeBrief(content, state, ctx.now),
    director: directorBrief(content, state, ctx),
    companion: hasCompanion(state) ? { id: companionOf(content).id, name: nameOf(content, companionOf(content).id, lang), joined: state.companion.joined } : null,
    quest: questBrief(content, state, ctx.now),
    ended: state.ended, branch: state.branch, story: state.story,
    divination: divinationBrief(content, state, ctx.now),
    fate: fateBrief(content, state),
    stamina: staminaBrief(content, state, ctx.now),
    made: { at: state.made?.at ?? null, scenes: Object.keys(state.made?.scenes ?? {}) },
    words: wordsOf(content, lang),
    ...tasksBrief(content, state, ctx),
  };
}

/* The world card as Look tells it — and where its files are, relative to
   the skill, so the page finds a made world's art beside a shipped one's. */
function worldBrief(content, lang) {
  const w = content.world;
  return {
    id: w.id, title: pick(w.title, lang), style: pick(w.style, lang), premise: pick(w.premise, lang) ?? null,
    made: Boolean(w.made), base: w.base ?? null, dir: w.made ? `data/worlds/${w.id}` : `worlds/${w.id}`,
    ...(w.made ? { map: w.map ?? null } : {}),
    ...(w.atlas ? { atlas: { file: w.atlas.file, aspect: w.atlas.aspect, provinces: w.atlas.provinces } } : {}),
  };
}

/* ── Building: a made world's pictures ──
   Only building paints. A made world plays once every creature it made has
   its picture and its map is painted; until then its story waits, and
   every answer that matters says what is left to paint. A picture takes
   twenty seconds — fine while building, never in play. */

const PICTURE_STYLE = 'Traditional Chinese ink wash painting with soft watercolor tints on aged cream paper, muted sepia, moss green and slate blue, loose brushwork, soft mist, faded vignette edges, no text, no writing, no characters, no labels, no border';
const plainEn = t => String(pick(t, 'en') ?? '').trim().replace(/[.。]$/, '');

/* The verbs that move the story, and so wait for the brush. */
export const BUILDING_WAITS = new Set(['resolve', 'judge', 'duel', 'tame', 'branch', 'move', 'trade', 'make', 'enter', 'leave', 'refine']);

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
  return called || (s.scene && !state.scene) ? s : null;
}

/* The pool as the scene draws it: what is there, the top, and — when a story
   step is out of reach — the hour it returns. */
function staminaBrief(content, state, now) {
  const q = content.rewards.stamina;
  const empty = state.stamina < q.cost.step;
  return { now: state.stamina, max: q.max, step: q.cost.step, empty, returns_at: empty ? staminaReturnsAt(content, state, q.cost.step).toISOString() : null };
}

/* ── Changing it ── */

const refuse = (refused, say, extra = {}) => ({ state: null, result: { ok: false, refused, say: say ?? null, ...extra } });
const clone = state => structuredClone(state);

function meets(state, needs) {
  if (needs.bag && !(state.bag[needs.bag] > 0)) return false;
  if (needs.task && state.tasks[needs.task]?.status !== 'done') return false;
  return true;
}

/* Pay a grant: the table capped it when it was authored, the traits speed
   progress, the day caps both — all in base progress — and the tier's `pay`
   scales what is finally added, so a task high on the ladder pays like one. */
function pay(content, state, ctx, grant) {
  rollDay(state, ctx.now);
  const table = content.rewards.tables[grant.table];
  const day = content.rewards.day;
  // The day's cast, when it was asked about this: its grade speeds or slows
  // the gain, and a good one lifts the day's cap with it.
  const pf = fortuneOf(content, state, ctx.now, 'cultivation')?.progress ?? 1;
  const wf = fortuneOf(content, state, ctx.now, 'wealth')?.wealth ?? 1;
  const want = Math.round(Math.min(grant.progress ?? 0, table.progress) * speedOf(content, state) * pf);
  const base = Math.max(0, Math.min(want, Math.round(day.progress * Math.max(1, pf)) - state.day.progress));
  const progress = base * payOf(content, state);
  const wealth = Math.max(0, Math.min(Math.round(Math.min(grant.wealth ?? 0, table.wealth) * wf), Math.round(day.wealth * Math.max(1, wf)) - state.day.wealth));
  state.day.progress += base; state.day.wealth += wealth; state.wealth += wealth;
  const { levels, hold } = addProgress(content, state, progress);
  if (grant.cast && !state.cast.includes(grant.cast)) state.cast.push(grant.cast);
  if (grant.item) state.bag[grant.item] = (state.bag[grant.item] ?? 0) + 1;
  // An art is taught by a person, in a scene — never by the beast itself.
  const learned = grant.art ? learn(content, state, grant.art) : null;
  const named = levels.map(l => ({ from: stepName(content, l.from.tier, l.from.step, state.lang), to: stepName(content, l.to.tier, l.to.step, state.lang) }));
  // `progress` is what the realm really took; at the peak the rest is held.
  const fortune = (pf !== 1 && grant.progress) || (wf !== 1 && grant.wealth) ? { progress: pf, wealth: wf } : null;
  return { progress: progress - (hold?.held ?? 0), wealth, cast: grant.cast ?? null, item: grant.item ?? null, levels: named, hold, capped: base < want, ...(learned ? { learned } : {}), ...(fortune ? { fortune } : {}) };
}

/* A riddle is answered wrong at most this many times a day. */
const RIDDLE_TRIES = 2;

/* An exit's riddles: `key` is one riddle or a pool of them. */
const riddlePool = exit => (Array.isArray(exit.key) ? exit.key : [exit.key]);
const riddleSlot = (scene, exit) => `${scene.id}/${exit.id}`;

/* The riddle an exit asks: today's, once asked; else one this play has not
   seen, by the day and the 道号 — never twice in one play (his rule,
   2026-09-17) until the pool is spent, and then never the last one again. */
export function riddleOf(state, scene, exit, now) {
  const pool = riddlePool(exit), slot = state.riddles?.[riddleSlot(scene, exit)];
  if (slot?.day === dayKey(now) && pool.includes(slot.key)) return slot.key;
  const seen = new Set(state.riddles_seen ?? []);
  let fresh = pool.filter(k => !seen.has(k));
  if (!fresh.length) fresh = pool.length > 1 ? pool.filter(k => k !== slot?.key) : pool;
  return fresh[hashOf(`${dayKey(now)}|${state.name ?? ''}|${riddleSlot(scene, exit)}`) % fresh.length];
}
const triedToday = (state, scene, exit, key, now) => {
  const slot = state.riddles?.[riddleSlot(scene, exit)];
  return slot?.day === dayKey(now) && slot.key === key ? slot.tried ?? [] : [];
};
/* The riddle asked is kept: seen for the play, and today's misses. A seen
   one asked on a new day means its pool was spent — the round begins again
   with it. `open`: the riddle is the question on the table until it is
   answered, shut, or set aside. */
function keepRiddle(s, scene, exit, key, now, tried, open = false) {
  const id = riddleSlot(scene, exit), slot = s.riddles?.[id], seen = s.riddles_seen ?? [];
  const today = slot?.day === dayKey(now) && slot.key === key;
  const pool = riddlePool(exit);
  s.riddles_seen = seen.includes(key) && !today ? [...seen.filter(k => !pool.includes(k)), key] : [...new Set([...seen, key])];
  s.riddles = { ...s.riddles, [id]: { day: dayKey(now), key, tried, ...(open ? { open: true } : {}) } };
}
const riddleOpen = (state, scene, exit, key, now) => {
  const slot = state.riddles?.[riddleSlot(scene, exit)];
  return Boolean(slot?.open && slot.day === dayKey(now) && slot.key === key);
};

/* 先不答 on a riddle on the table sets it aside: the scene's own question
   comes back. Null when there is nothing to set aside. */
function setRiddleAside(content, state, ctx) {
  if (!ctx.said || !atScene(content, state)) return null;
  const ask = askOf(content, state, ctx);
  const back = ask.options.some(o => o.answer != null) && ask.options.find(o => o.look && o.label === String(ctx.said).trim());
  if (!back) return null;
  const s = clone(state), prefix = `${sceneOf(content, s).id}/`;
  s.riddles = Object.fromEntries(Object.entries(s.riddles).map(([id, slot]) => [id, id.startsWith(prefix) ? { ...slot, open: undefined } : slot]));
  return s;
}

function judgeAnswer(content, key, answer) {
  const said = normalizeAnswer(answer);
  if (!said) return false;
  return ['zh', 'en'].some(lang => content.riddles[lang].riddles[key].a.some(a => normalizeAnswer(a) === said));
}

const hourOf = (at, lang) => at.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' });

/* An action costs stamina — settled by the clock first. Refused, it says
   when the pool holds enough again, in the world's words, and the state is
   untouched. */
/* A chapter marked `free` (the prologue) asks no 灵气 for its own steps
   and bouts: a new player finishes the opening in one sitting. */
const CHAPTER_COSTS = new Set(['step', 'duel']);
const freeHere = (content, s, kind) => CHAPTER_COSTS.has(kind) && !inMade(s)
  && Boolean(content.chapters[s.chapter]?.free) && !s.ended.includes(s.chapter);

function spendStamina(content, s, ctx, kind) {
  if (freeHere(content, s, kind)) return null;
  // A dire cast asked about cultivation: each story step waits its rest.
  const rest = kind === 'step' ? fortuneOf(content, s, ctx.now, 'cultivation')?.rest_seconds : null;
  const since = rest && s.last_step_at ? new Date(new Date(s.last_step_at).getTime() + rest * 1000) : null;
  if (since && since > ctx.now) return refuse('resting', null, { returns_at: since.toISOString() });
  settleStamina(content, s, ctx.now);
  const cost = content.rewards.stamina.cost[kind] ?? 0;
  if (s.stamina >= cost) { s.stamina -= cost; if (kind === 'step') s.last_step_at = ctx.now.toISOString(); return null; }
  const at = staminaReturnsAt(content, s, cost);
  const w = wordsOf(content, s.lang);
  const say = s.lang === 'zh'
    ? `${w.pool}已空，先去调息。${hourOf(at, 'zh')} 再来。`
    : `Your ${w.pool} is empty — go and rest. Come back at ${hourOf(at, 'en')}.`;
  return refuse('no-stamina', say, { stamina: s.stamina, cost, returns_at: at.toISOString() });
}

function cleanValue(raw, rule) {
  const value = String(raw ?? '').trim();
  const length = [...value].length;
  return length >= 1 && length <= rule.max_chars ? value : null;
}

/* Entering a scene offers its tasks. */
function offerTasks(content, state) {
  const scene = sceneOf(content, state);
  for (const id of scene?.offers?.tasks ?? []) state.tasks[id] ??= { status: 'offered' };
}

/* After a chapter ends, the next one that has opened takes over. */
function advanceChapter(content, state, now) {
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return { waiting: null };
  if (next.opens && new Date(next.opens) > now) return { waiting: { chapter: next.id, opens: next.opens } };
  state.chapter = next.id; state.scene = next.first_scene;
  settlePlace(content, state);
  offerTasks(content, state);
  return { waiting: null };
}

export function resolve(state, content, ctx, args) {
  const scene = sceneOf(content, state);
  if (!scene) return refuse('no-scene', null);
  const exit = scene.exits.find(e => e.id === args.exit);
  if (!exit) return refuse('unknown-exit', null, { exits: scene.exits.map(e => e.id) });
  const s = clone(state), lang = s.lang;
  settlePlace(content, s);
  if (!atScene(content, s)) {
    const at = placeOf(content, scene.at);
    return refuse('not-at-scene', lang === 'zh' ? `你还没到${pick(at.name, 'zh')}。` : `You are not at ${pick(at.name, 'en')} yet.`, { place: placeName(content, s, at) });
  }
  if (exit.needs && !meets(s, exit.needs)) return refuse('needs', pick(exit.refuse, lang));
  let breakthrough = null;
  if (exit.breakthrough) {
    const tier = tierOf(content, s.tier), tiers = content.ladder.tiers, next = tiers[tiers.indexOf(tier) + 1];
    const peak = s.step === tier.thresholds.length - 1 && s.progress >= threshold(content, s);
    const gate = content.chapters[s.chapter]?.gate;
    if (!peak || !next || next.gate !== gate) {
      return refuse('not-at-peak', pick(exit.refuse, lang), { tier: s.tier, step: s.step + 1, progress: s.progress, next: threshold(content, s), peak_step: tier.thresholds.length });
    }
    breakthrough = { from: stepName(content, s.tier, s.step, lang), to: stepName(content, next.id, 0, lang), tier: next.id };
  }
  if (exit.key) {
    const key = riddleOf(s, scene, exit, ctx.now);
    const riddle = content.riddles[lang].riddles[key];
    const tried = triedToday(s, scene, exit, key, ctx.now);
    if (tried.length >= RIDDLE_TRIES) return refuse('riddle-closed', null, { exit: exit.id });
    // Asked is seen: the question stays today's, and the play never asks it again.
    if (args.answer == null) {
      keepRiddle(s, scene, exit, key, ctx.now, tried, true);
      // The riddle is `ask`'s question, never a line to speak: spoken, the
      // reply ended on it with no AskUser (2026-09-17, gpt-5.6-terra).
      return { state: s, result: { ok: false, refused: 'needs-answer', say: null, exit: exit.id, choices: riddle.choices } };
    }
    if (!judgeAnswer(content, key, args.answer)) {
      // A miss is kept: the first brings the hint, the second closes the
      // riddle until tomorrow — guessing costs, and nothing blocks past a day.
      const missed = [...tried, String(args.answer).trim()];
      const closed = missed.length >= RIDDLE_TRIES;
      keepRiddle(s, scene, exit, key, ctx.now, missed, !closed);
      return { state: s, result: { ok: false, refused: closed ? 'riddle-closed' : 'wrong-answer', say: null, ...(closed ? {} : { hint: riddle.hint }), exit: exit.id } };
    }
    keepRiddle(s, scene, exit, key, ctx.now, tried);
  }
  const game = gameOf(exit);
  if (game && !s.wins?.[game.id]) {
    const today = game.kind === 'duel' ? s.duels?.[game.creature] : null;
    if (today?.day === dayKey(ctx.now) && today.outcome === 'lost') return refuse('withdrawn', pick(exit.withdrawn, lang), { game: game.id });
    return refuse('game-not-won', null, { game: game.id });
  }
  if (exit.value) {
    const value = cleanValue(args.value, exit.value);
    if (!value) return refuse('value-invalid', null, { max_chars: exit.value.max_chars });
    s[exit.value.field] = value;
  }
  if (exit.next || exit.ends) {
    const empty = spendStamina(content, s, ctx, 'step');
    if (empty) return empty;
  }
  if (game) delete s.wins[game.id];
  if (exit.take?.bag) {
    s.bag[exit.take.bag] -= 1;
    if (s.bag[exit.take.bag] <= 0) delete s.bag[exit.take.bag];
  }
  if (exit.set?.traits === 'v1') s.traits = [...content.traits.v1];
  if (breakthrough) { s.tier = breakthrough.tier; s.step = 0; s.progress = 0; }
  const paid = exit.grant ? pay(content, s, ctx, exit.grant) : null;
  const beat = spoken(content, s, exit.beat);

  let waiting = null;
  if (inMade(s)) {
    // A made scene leads only to another made scene or back to the spine.
    if (exit.next) s.made.at = exit.next;
    if (exit.ends) s.made.at = null;
  } else {
    if (exit.next || exit.ends) s.done_scenes.push(scene.id);
    if (exit.next) { s.scene = exit.next; settlePlace(content, s); offerTasks(content, s); }
    if (exit.ends) { s.ended.push(exit.ends); s.scene = null; ({ waiting } = advanceChapter(content, s, ctx.now)); }
  }
  const walked = exit.next ? walkOn(content, s, ctx.now) : null;
  return {
    state: s,
    result: {
      ok: true, took: exit.id, beat, paid, breakthrough, show: exit.show ?? [], scene: atScene(content, s) ? sceneBrief(content, s, ctx.now) : null,
      waypoint: !atScene(content, s) && sceneOf(content, s) ? threadOf(content, s, ctx.now) : null, ended: exit.ends ?? null, waiting,
      ...(walked ? { walked } : {}),
      summarize: Boolean(exit.next || exit.ends),
    },
  };
}

/* An exit taken toward the next scene walks the player there when it stands
   one road away, open and within their tier — *去蓬莱* means go; asking
   again which road was the player's "click twice" (2026-09-16). Farther
   off, or beyond them, the road waits as a waypoint. Walking costs nothing,
   as Move costs nothing. */
function walkOn(content, s, now) {
  if (inMade(s) || atScene(content, s)) return null;
  const scene = sceneOf(content, s), here = placeOf(content, s.place);
  const target = scene && placeOf(content, scene.at);
  if (!target || !here?.roads.includes(target.id) || !provinceOpen(content, target.province, now) || tooHard(content, s, target)) return null;
  s.place = target.id;
  return { from: placeName(content, s, here), to: placeName(content, s, target) };
}

export function judge(state, content, ctx, args) {
  if (!content.riddles.zh.riddles[args.key]) return refuse('unknown-riddle', null);
  return { state: null, result: { ok: true, right: judgeAnswer(content, args.key, args.answer) } };
}

/* ── Tasks and quests ── */

function questDone(q, now) {
  if (!q.done_at) return false;
  const at = new Date(q.done_at);
  return at >= periodStart(q.period, now) && at <= now;
}

export function task(state, content, ctx, args) {
  if (args.action === 'list') return { state: null, result: { ok: true, ...tasksBrief(content, state, ctx) } };
  if (args.action === 'done') return taskDone(state, content, ctx, args.id);
  if (args.action === 'check') return questCheck(state, content, ctx, args.id);
  return refuse('unknown-action', null, { actions: ['list', 'done', 'check'] });
}

/* Offered, and not yet done this period. */
function taskOpen(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  if (!t || !held) return false;
  return !(held.status === 'done' && (t.period === 'once' || held.period === periodKey(t.period, now)));
}

function taskDone(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  if (!state.tasks[id]) return refuse('not-offered', null);
  if (!taskOpen(content, state, id, ctx.now)) return refuse('already-done', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state);
  delete s.wins[id];
  s.tasks[id] = { status: 'done', period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  if (t.gives?.bag) s.bag[t.gives.bag] = (s.bag[t.gives.bag] ?? 0) + 1;
  const paid = pay(content, s, ctx, t.grant);
  return { state: s, result: { ok: true, done: id, paid, gives: t.gives ?? null, line: pick(t.done_line, s.lang) } };
}

function questCheck(state, content, ctx, id) {
  const q = (ctx.quests ?? []).find(x => x.id === id);
  if (!q) return refuse('unknown-quest', null);
  const period = periodKey(q.period, ctx.now);
  if (state.quests[id]?.period === period) return refuse('already-paid', null);
  if (!questDone(q, ctx.now)) return refuse('not-done', null, { app: q.app });
  const s = clone(state);
  s.quests[id] = { period, paid_at: ctx.now.toISOString() };
  const paid = pay(content, s, ctx, { table: 'task', progress: q.reward ?? 0 });
  settleStamina(content, s, ctx.now);
  const stamina = addStamina(content, s, q.stamina ?? content.rewards.stamina.refill.quest, ctx.now);
  return { state: s, result: { ok: true, quest: id, app: q.app, paid, stamina } };
}

/* The page is the only witness to a board or a duel: it records the win here,
   and Resolve or Task done pays it. Never one of Ling's tools — a win Ling
   could claim would be a self-reported one. */
export function win(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const inScene = sceneOf(content, state)?.exits.some(e => gameOf(e)?.id === id && gameOf(e).kind !== 'duel');
  if (!inScene && !taskOpen(content, state, id, ctx.now)) return refuse('not-here', null);
  const s = clone(state);
  s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  return { state: s, result: { ok: true, won: id } };
}

/* 降妖 — the scene plays the fight turn by turn, the rules decide it.
   `start` checks the creature has not withdrawn today and charges a fight's
   stamina; then, with `picks` — the player's own turns — the rules replay
   the fight and record the outcome: a win the exit can take, or a loss that
   sends the creature into the mist until tomorrow. A loss costs nothing
   else. After a win today a fight is practice: it costs, it pays nothing. */
export function duel(state, content, ctx, args) {
  const id = String(args.id ?? '');
  const exit = sceneOf(content, state)?.exits.find(e => gameOf(e)?.id === id && gameOf(e).kind === 'duel');
  const haunt = !exit && id.startsWith('haunt:') ? encounterOf(content, state, ctx.now) : null;
  if (!exit && !(haunt && haunt.game.id === id)) return refuse('not-here', null);
  if (haunt?.tamed) return refuse('tamed', null, { creature: haunt.creature });
  const game = exit ? gameOf(exit) : haunt.game, creature = creatureOf(content, game.creature);
  const withdrawnLine = exit ? pick(exit.withdrawn, state.lang)
    : pick({ zh: `${pick(creature.name, 'zh')}退入林影，明日再来。`, en: `${pick(creature.name, 'en')} withdraws into the shadows; come back tomorrow.` }, state.lang);
  const s = clone(state);
  const day = dayKey(ctx.now), today = s.duels?.[creature.id];
  const foe = foeOf(creature, s.tier, s.step ?? 0, duelSeed(s, creature, ctx.now));
  if (!args.picks) {
    if (today?.day === day && today.outcome === 'lost') return refuse('withdrawn', withdrawnLine, { game: id });
    if (haunt && today?.day === day && today.outcome === 'won') return refuse('subdued-today', null, { game: id });
    if (!s.traits?.length) return refuse('no-traits', null);
    const empty = spendStamina(content, s, ctx, 'duel');
    if (empty) return empty;
    s.duels = { ...s.duels, [creature.id]: { day, outcome: 'open', log: [] } };
    return { state: s, result: { ok: true, started: id, duel: duelBrief(content, s, game, ctx.now) } };
  }
  if (today?.day !== day || today.outcome !== 'open') return refuse('not-started', null, { game: id });
  const picks = String(args.picks).split(',').map(x => x.trim()).filter(Boolean);
  const kit = kitOf(content, s, ctx.now);
  const played = fight(picks, foe, kit);
  if (played.refused) return refuse(played.refused.why, null, { token: played.refused.token, roots: kit.roots, sword: kit.sword, arts: Object.keys(kit.arts) });
  if (played.outcome === 'open') return refuse('unfinished', null, { log: played.log });
  s.duels[creature.id] = { day, outcome: played.outcome, log: played.log };
  if (played.outcome === 'won') s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  const say = played.outcome === 'lost' ? withdrawnLine : null;
  // A 符 cast is spent, win or lose; 符水 gives its 灵力 back inside the fight.
  if (played.used.charm) {
    s.bag[kit.charm.id] -= 1;
    if (!s.bag[kit.charm.id]) delete s.bag[kit.charm.id];
  }
  // What a subdued creature leaves: its 妖丹, by the realm it was met at,
  // and whatever else this one carries.
  const dropped = played.outcome === 'won' ? drop(content, s, creature) : [];
  // At a haunt no exit will pay the win: the rules pay it here, once a day.
  const paid = haunt && played.outcome === 'won' ? pay(content, s, ctx, { table: 'haunt', progress: 20, wealth: 10 }) : null;
  const used = { ...(played.used.charm ? { charm: kit.charm.id } : {}), ...(played.used.arts.length ? { arts: played.used.arts } : {}) };
  return { state: s, result: { ok: true, outcome: played.outcome, log: played.log, you: played.you, foe: played.foe, game: id, say, ...(Object.keys(used).length ? { used } : {}), ...(dropped.length ? { dropped } : {}), ...(paid ? { paid, haunt: haunt.creature } : {}) } };
}

/* 写符 — one 桑皮纸 becomes one 符: at a market, or anywhere once the
   catalog's `made.anywhere_from` tier is reached; a visit's stamina; one a
   day. The 符 is cast on the scene, in a fight; Ling never plays it. */

/* Whether 写符 would be allowed here today — the choice offers it then. */
function canWrite(content, state) {
  const charm = charmOf(content), paper = charm?.made?.from;
  if (!charm || !paper || !(state.bag[paper] ?? 0) || state.day?.written) return false;
  const here = placeOf(content, state.place);
  const adept = charm.made.anywhere_from != null && tierIndex(content, state) >= tierRank(content, charm.made.anywhere_from);
  return Boolean(here?.has?.[charm.made.at ?? 'shop']) || adept;
}

export function write(state, content, ctx, args) {
  const charm = charmOf(content), paper = charm?.made?.from ? itemOf(content, charm.made.from) : null;
  if (!charm || !paper) return refuse('no-charm-here', null);
  const s = clone(state);
  settlePlace(content, s);
  rollDay(s, ctx.now);
  const lang = s.lang, w = wordsOf(content, lang), paperName = pick(paper.name, lang), charmName = pick(charm.name, lang);
  const here = placeOf(content, s.place);
  const adept = charm.made.anywhere_from != null && tierIndex(content, s) >= tierRank(content, charm.made.anywhere_from);
  const at = charm.made.at ?? 'shop';
  if (!here?.has?.[at] && !adept) {
    const from = charm.made.anywhere_from ? pick(tierOf(content, charm.made.anywhere_from)?.name, lang) : null;
    return refuse('not-here', pick({
      zh: `${w.write}要在${w[at]}里${from ? `，或待${from}之后` : ''}。`,
      en: `A ${charmName} is written at a ${w[at]}${from ? `, or anywhere from ${from} on` : ''}.`,
    }, lang), { at, ...(from ? { anywhere_from: charm.made.anywhere_from } : {}) });
  }
  if (!(s.bag[paper.id] ?? 0)) return refuse('no-paper', pick({ zh: `没有${paperName}，写不得${charmName}。`, en: `No ${paperName} — nothing to write on.` }, lang), { needs: paper.id });
  if (s.day.written) return refuse('written-today', pick({ zh: `今日已写过一${charmName}，朱砂要歇。`, en: `One ${charmName} a day; the cinnabar rests.` }, lang));
  const empty = spendStamina(content, s, ctx, 'shop');
  if (empty) return empty;
  s.bag[paper.id] -= 1;
  if (!s.bag[paper.id]) delete s.bag[paper.id];
  s.bag[charm.id] = (s.bag[charm.id] ?? 0) + 1;
  s.day.written = 1;
  return { state: s, result: { ok: true, written: charm.id, from: paper.id, item: itemBrief(content, s, charm), show: [{ card: 'item', id: charm.id }] } };
}

/* ── Branches, story, travel, language ── */

/* A small stable hash: the same day and name land on the same seed. */
function hashOf(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

/* The seed a 奇遇 grows from: the player's province, this kind, unused
   first; chosen by the day and the 道号, so a day reopens the same seed. A
   province with no seeds grows the tale from the template alone. */
function pickSeed(content, state, kind, now) {
  const province = placeOf(content, state.place)?.province ?? content.chapters[state.chapter]?.province;
  const all = (content.seeds[province]?.seeds ?? []).filter(x => x.kind === kind);
  if (!all.length) return null;
  const used = new Set(state.seeds_used ?? []);
  const pool = all.some(x => !used.has(x.id)) ? all.filter(x => !used.has(x.id)) : all;
  const seed = pool[hashOf(`${dayKey(now)}|${state.name ?? ''}|${kind}`) % pool.length];
  return { id: seed.id, line: pick(seed.line, state.lang), source: pick(seed.source, state.lang), creature: seed.creature ?? null };
}

export function branch(state, content, ctx, args) {
  const s = clone(state);
  rollDay(s, ctx.now);
  if (args.action === 'open') {
    const template = content.branches.templates.find(b => b.kind === args.kind);
    if (!template) return refuse('unknown-branch', null, { kinds: content.branches.templates.map(b => b.kind) });
    if (s.branch) return refuse('branch-open', null, { open: s.branch.kind });
    if (s.day.branches >= content.branches.per_day) return refuse('branch-cap', null);
    const empty = spendStamina(content, s, ctx, 'branch');
    if (empty) return empty;
    const seed = pickSeed(content, s, template.kind, ctx.now);
    s.branch = { kind: template.kind, turns: 0, said: null, opened: ctx.now.toISOString(), seed: seed?.id ?? null, at_turn: ctx.turn ?? null };
    if (seed) s.seeds_used = [...(s.seeds_used ?? []), seed.id];
    s.day.branches += 1;
    const show = seed?.creature ? [{ card: 'creature', id: seed.creature }] : [];
    return { state: s, result: { ok: true, opened: template.kind, min_turns: template.min_turns ?? 0, max_turns: template.max_turns, may_not: template.may_not, seed, show } };
  }
  if (!s.branch) return refuse('no-branch', null);
  const template = content.branches.templates.find(b => b.kind === s.branch.kind);
  // A turn is the player's. The engine counts their messages
  // (LINGGEN_USER_TURNS): the tale's turns are those sent since it opened,
  // whatever Ling remembered to report. Without the count, a turn carries
  // their words, and the same words twice are one turn. A tale closed
  // before the player has taken part in `min_turns` of them pays nothing —
  // the reward is for playing it.
  const counted = () => {
    if (ctx.turn == null || s.branch.at_turn == null) return false;
    s.branch.turns = Math.max(s.branch.turns, ctx.turn - s.branch.at_turn);
    return true;
  };
  if (args.action === 'turn') {
    const said = String(args.said ?? '').trim();
    if (!counted()) {
      if (!said || said === s.branch.said) return refuse('no-player-turn', null, { turns: s.branch.turns });
      s.branch.turns += 1;
    }
    s.branch.said = said;
    return { state: s, result: { ok: true, turns: s.branch.turns, close_now: s.branch.turns >= template.max_turns } };
  }
  if (args.action === 'close') {
    // The words that ended the tale are the player's last turn.
    const said = String(args.said ?? '').trim();
    if (!counted() && said && said !== s.branch.said) { s.branch.turns += 1; s.branch.said = said; }
    const early = s.branch.turns < (template.min_turns ?? 0);
    const paid = early ? null : pay(content, s, ctx, { table: template.table, progress: Number(args.progress) || 0, wealth: Number(args.wealth) || 0 });
    s.branch = null;
    return { state: s, result: { ok: true, closed: template.kind, paid, ...(early ? { unpaid: 'too-soon', min_turns: template.min_turns } : {}), summarize: true } };
  }
  return refuse('unknown-action', null, { actions: ['open', 'turn', 'close'] });
}

export function summarize(state, content, ctx, args) {
  const text = String(args.text ?? '').trim();
  if (!text) return refuse('empty', null);
  const tooLong = state.lang === 'zh' ? [...text].length > STORY_CHARS : text.split(/\s+/).length > STORY_WORDS;
  if (tooLong) return refuse('too-long', null, { max_words: STORY_WORDS, max_zh_chars: STORY_CHARS });
  const s = clone(state);
  s.story = text;
  return { state: s, result: { ok: true, story: text } };
}

/* A province by its character (冀), its name (冀州) or its English (Ji). */
function provinceOf(content, raw) {
  const said = String(raw ?? '').trim().replace(/州$/, '').toLowerCase();
  return Object.keys(content.dictionary.provinces).find(k => k === said || content.dictionary.provinces[k].en.toLowerCase() === said) ?? null;
}

/* Go to a place. The rules check the road and the tier against the player;
   too hard is refused in the mist with a fitting place, so Yinyue's "not
   yet — back to the ford" is the rules' hint, spoken kindly. While the
   corridor runs the scene comes first. A province named instead of a place
   answers as before: here, or a road not yet open. Every refusal says `here`
   — the player went nowhere — and a place with no road from here says
   `toward`, the first road on the way to it. Walking away leaves a made
   scene (`left`); Enter brings it back. */
export function move(state, content, ctx, args) {
  const s = clone(state);
  settlePlace(content, s);
  const here = placeOf(content, s.place);
  const raw = args.place ?? args.province;
  const target = findPlace(content, raw);
  const lang = s.lang;
  const stay = (code, say, extra = {}) => refuse(code, say, { here: here ? placeName(content, s, here) : null, ...extra });
  const near = () => here.roads.map(id => placeName(content, s, placeOf(content, id)));
  if (!target) {
    const p = provinceOf(content, raw);
    if (p && here?.province === p) return { state: null, result: { ok: true, here: true, place: placeBrief(content, s) } };
    if (p || !here) {
      const say = { zh: `${p ?? String(raw ?? '').replace(/州$/, '')}州的路还没开。`, en: 'That road has not opened yet.' };
      return stay('road-closed', pick(say, lang));
    }
    return stay('unknown-place', null, { near: near() });
  }
  if (target.id === here?.id) return { state: null, result: { ok: true, here: true, place: placeBrief(content, s) } };
  // A made scene played inside the corridor does not open the road.
  if (inCorridor(content, { ...s, made: null })) {
    return stay('corridor', pick({ zh: '先把眼前的事做完。', en: 'Finish what is before you first.' }, lang), { scene: s.scene });
  }
  if (!here.roads.includes(target.id)) {
    const say = { zh: `从${pick(here.name, 'zh')}没有路通向${pick(target.name, 'zh')}。`, en: `No road runs from ${pick(here.name, 'en')} to ${pick(target.name, 'en')}.` };
    return stay('no-road', pick(say, lang), { near: near(), toward: towardOf(content, s, here, target, ctx.now) });
  }
  if (!provinceOpen(content, target.province, ctx.now)) {
    const say = { zh: `${target.province}州的路还没开。`, en: 'That road has not opened yet.' };
    return stay('road-closed', pick(say, lang), { province: target.province });
  }
  if (tooHard(content, s, target)) {
    const fitting = fittingPlace(content, s, here);
    const say = { zh: '雾更浓了，看不见路。', en: 'The mist thickens; the road is lost.' };
    const yinyue = { zh: `还不是时候。先回${pick(fitting.name, 'zh')}吧。`, en: `Not yet. Let's go back to ${pick(fitting.name, 'en')}.` };
    return stay('too-hard', pick(say, lang), { tier: target.tier, fitting: placeName(content, s, fitting), yinyue: pick(yinyue, lang) });
  }
  const from = here;
  s.place = target.id;
  const left = inMade(s) ? s.made.at : null;
  if (left) s.made.at = null;
  const place = placeBrief(content, s, ctx.now);
  const scene = atScene(content, s) ? sceneBrief(content, s, ctx.now) : null;
  const cards = [...place.show, ...(scene?.show ?? [])];
  const show = cards.filter((c, i) => cards.findIndex(d => JSON.stringify(d) === JSON.stringify(c)) === i);
  // The story is rewritten when something of it happened: a scene entered,
  // a province crossed, a made scene left — not on every road walked (a
  // Summarize is a whole model call; seen live 2026-09-16, one per step).
  const summarize = Boolean(scene) || target.province !== from.province || Boolean(left);
  return { state: s, result: { ok: true, place, scene, show, ...(left ? { left } : {}), director: directorBrief(content, s, ctx), summarize } };
}

/* A key the story still needs: an exit of the current chapter's scenes not
   yet done asks for it in the bag. */
function keyInUse(content, state, id) {
  if (inMade(state)) return false;
  const chapter = content.chapters[state.chapter];
  if (!chapter || state.ended.includes(chapter.id)) return false;
  return Object.values(chapter.scenes).some(scene => !state.done_scenes.includes(scene.id)
    && scene.exits.some(e => e.needs?.bag === id));
}

/* Buy, sell or use a catalog item. Buying and selling happen at a market
   (a place with a shop) and cost a visit's stamina; the prices are the
   catalog's, never Ling's. Using a pill pays its progress within its table;
   using a wear puts it on Yinyue or the abode; using arms wears them — a
   weapon in hand (and a fight may borrow its root), a 法衣, a 佩. */
export function trade(state, content, ctx, args) {
  const item = itemOf(content, String(args.id ?? ''));
  const s = clone(state);
  settlePlace(content, s);
  const here = placeOf(content, s.place);
  const lang = s.lang, w = wordsOf(content, lang);
  if (!item) return refuse('unknown-item', null, { shelf: here?.has?.shop ? shelfOf(content, here.province).map(i => i.id) : [] });
  const held = s.bag[item.id] ?? 0;
  if (args.action === 'buy' || args.action === 'sell') {
    if (!here?.has?.shop) {
      return refuse('no-market', pick({ zh: `这里没有${w.shop}。`, en: `There is no ${w.shop} here.` }, lang));
    }
    if (args.action === 'buy') {
      if (!forSale(content, s, item, here.province)) return refuse('not-for-sale-here', null, { shelf: shelfOf(content, here.province, s).map(i => i.id) });
      if (s.wealth < item.buy) {
        return refuse('no-stones', pick({ zh: `${w.wealth}不够。`, en: `Not enough ${w.wealth}.` }, lang), { price: item.buy, wealth: s.wealth });
      }
      const empty = spendStamina(content, s, ctx, 'shop');
      if (empty) return empty;
      s.wealth -= item.buy;
      s.bag[item.id] = held + 1;
      return { state: s, result: { ok: true, bought: item.id, item: itemBrief(content, s, item), paid: { wealth: -item.buy }, wealth: s.wealth } };
    }
    if (held < 1) return refuse('not-in-bag', null);
    if (item.sell == null) return refuse('not-for-sale', pick({ zh: '这东西没有市价。', en: 'That has no market price.' }, lang));
    if (item.effect?.key && keyInUse(content, s, item.id)) {
      return refuse('key-in-use', pick({ zh: '这东西还有用处，先留着。', en: 'You will need that yet — keep it.' }, lang));
    }
    const empty = spendStamina(content, s, ctx, 'shop');
    if (empty) return empty;
    s.bag[item.id] = held - 1;
    if (s.bag[item.id] <= 0) delete s.bag[item.id];
    if (s.wear) for (const [slot, id] of Object.entries(s.wear)) if (id === item.id && !s.bag[item.id]) delete s.wear[slot];
    s.wealth += item.sell;
    return { state: s, result: { ok: true, sold: item.id, item: itemBrief(content, s, item), paid: { wealth: item.sell }, wealth: s.wealth } };
  }
  if (args.action === 'use') {
    if (held < 1) return refuse('not-in-bag', null);
    const e = item.effect ?? {};
    if (e.progress) {
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      const paid = pay(content, s, ctx, { table: e.table, progress: e.progress });
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), paid } };
    }
    if (e.wear && e.wear === companionOf(content)?.id && !hasCompanion(s)) {
      return refuse('no-companion', pick({ zh: '还没有人可以佩戴它。', en: 'There is no one to wear it yet.' }, lang));
    }
    // Arms go on the player, each kind in its own slot; a `wear` is Yinyue's
    // or the abode's.
    const slot = e.wear ?? ARM_SLOTS.get(item.kind);
    if (slot) {
      s.wear ??= {};
      s.wear[slot] = item.id;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), wear: s.wear } };
    }
    // 强化 — a 妖丹 or a天材地宝 fed to the 本命法宝. A core material with no
    // treasure yet is kept for the 炼化, not burned.
    if (e.temper) {
      if (!s.treasure) {
        return refuse(e.core ? 'refine-first' : 'no-treasure', pick({ zh: e.core ? '此物待炼本命之用。' : '你还没有本命法宝。', en: e.core ? 'This waits for the day you bind a treasure.' : 'You have no treasure to feed.' }, lang));
      }
      if (s.treasure.level >= TREASURE_TOP) return refuse('at-top', pick({ zh: `${s.treasure.name}已至九重。`, en: `${s.treasure.name} is at its ninth.` }, lang));
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      const { treasure, gained } = grow(s.treasure, e.temper);
      s.treasure = treasure;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), tempered: e.temper, ...(gained.length ? { rose: gained } : {}), treasure: treasureBrief(content, s, ctx.now), show: [{ card: 'treasure' }] } };
    }
    if (e.charm) return refuse('cast-in-a-bout', pick({ zh: `${pick(item.name, lang)}在${w.contest}时掷出，不在此。`, en: `A ${pick(item.name, lang)} is cast in a bout, not here.` }, lang));
    return refuse('not-usable', null);
  }
  return refuse('unknown-action', null, { actions: ['buy', 'sell', 'use'] });
}

/* The player's words set the language. The result carries the scene in it,
   so one call switches and re-reads; asking for the language already in
   use changes nothing. */
export function lang(state, content, ctx, args) {
  if (!['zh', 'en'].includes(args.lang)) return refuse('unknown-lang', null, { langs: ['zh', 'en'] });
  const s = args.lang === state.lang ? state : { ...clone(state), lang: args.lang };
  // The scene only where the player stands — Lang once handed Ling chapter
  // 3's opening lines a province early (2026-09-16), and Ling recited them.
  const result = { ok: true, lang: s.lang, changed: s !== state, scene: atScene(content, s) ? sceneBrief(content, s, ctx?.now) : null };
  return { state: s === state ? null : s, result };
}

/* The player's words set the language before any verb reads the state, so
   what Ling reads back is already in the language the player wrote. Ling's
   tools pass them as `said`. */
/* Words that are the engine's, not the player's: an empty reply's nudge
   comes back to the model as a user turn and was passed on as `said`,
   flipping a Chinese game to English mid-sitting (2026-09-16). */
const ENGINE_WORDS = /^\s*your response was empty/i;

export function heed(state, said) {
  if (ENGINE_WORDS.test(String(said ?? ''))) return state;
  const lang = langOf(said);
  return lang && lang !== state.lang ? { ...clone(state), lang } : state;
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
  if (!e.likes.held) return refuse('needs-item', pick({ zh: `${name}闻了闻，退开了。它要的是${e.likes.name}。`, en: `${name} sniffs and draws back. It wants ${e.likes.name}.` }, lang), { likes: e.likes });
  const s = clone(state);
  s.bag[e.likes.id] -= 1;
  if (!s.bag[e.likes.id]) delete s.bag[e.likes.id];
  const paid = pay(content, s, ctx, { table: 'haunt', progress: 20, wealth: 0, cast: e.creature.id });
  const beat = pick({ zh: `${name}低头衔了${e.likes.name}，随你走了。`, en: `${name} takes the ${e.likes.name} and falls in beside you.` }, lang);
  return { state: s, result: { ok: true, tamed: e.creature, fed: e.likes, beat, paid, show: [{ card: 'creature', id: e.creature.id }] } };
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

/* ── Ling drives: the player's word moves the game ── */

/* Straight to a scene of the spine, in a chapter that has opened — the
   player asked for it, so the road is not walked. A made scene goes through
   Enter. The chapter's earlier end is forgotten so the story runs from
   here again. */
export function go(state, content, ctx, args) {
  const id = String(args.scene ?? '');
  const chapter = Object.values(content.chapters).find(c => c.scenes[id]);
  if (!chapter) {
    if (state.made?.scenes?.[id]) return enter(state, content, ctx, args);
    const scenes = Object.values(content.chapters).filter(c => !c.opens || new Date(c.opens) <= ctx.now).flatMap(c => Object.keys(c.scenes));
    return refuse('unknown-scene', null, { scenes: [...scenes, ...Object.keys(state.made?.scenes ?? {})] });
  }
  if (chapter.opens && new Date(chapter.opens) > ctx.now) return refuse('not-open', null, { chapter: chapter.id, opens: chapter.opens });
  const s = clone(state);
  s.chapter = chapter.id; s.scene = id;
  s.ended = s.ended.filter(c => c !== chapter.id);
  if (s.made) s.made.at = null;
  const scene = chapter.scenes[id];
  if (scene.at) s.place = scene.at;
  settlePlace(content, s);
  offerTasks(content, s);
  return { state: s, result: { ok: true, scene: sceneBrief(content, s, ctx.now), summarize: true } };
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
  s.wear = { ...(s.wear ?? {}), [c.id]: c.bell };
  const paid = c.grant ? pay(content, s, ctx, c.grant) : null;
  return { state: s, result: { ok: true, joined: { id: c.id, name: nameOf(content, c.id, lang) }, beat: spoken(content, s, c.join), ...(paid ? { paid } : {}), summarize: true } };
}

/* ── 起卦 — the day's cast, by three coins ── */

const TRIGRAM_OF = { 111: 'qian', 110: 'dui', 101: 'li', 100: 'zhen', '011': 'xun', '010': 'kan', '001': 'gen', '000': 'kun' };
const castToday = (state, now) => (state.divination?.day === dayKey(now) ? state.divination : null);

/* A seeded generator: the day's throws are the day's, however often asked. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 三钱法: three coins six times, the bottom line first. A face counts 3, the
   other 2: 9 old yang, 8 young yin, 7 young yang, 6 old yin — the old lines move. */
export function castThrows(seed) {
  const rand = prng(hashOf(seed));
  return Array.from({ length: 6 }, () => [0, 1, 2].map(() => (rand() < 0.5 ? 3 : 2)));
}
const hexagramOf = (content, lines) => content.hexagrams.hexagrams.find(h => h.lines.join('') === lines.join(''));

/* What today's cast does to what it was asked about — null when it was
   not cast, asked about something else, or is even. */
function fortuneOf(content, state, now, ask) {
  const cast = now && castToday(state, now);
  if (!cast || cast.ask !== ask) return null;
  const effect = content.hexagrams.effects[ask]?.[cast.grade] ?? {};
  return Object.keys(effect).length ? effect : null;
}

/* A cast asked about fights lifts — or lowers — the 法术 of the lower
   trigram's root, for the whole day. */
function boutFortune(content, state, now) {
  const effect = fortuneOf(content, state, now, 'bout');
  if (!effect) return null;
  const h = content.hexagrams.hexagrams.find(x => x.id === castToday(state, now).hexagram);
  return { root: content.hexagrams.trigram_roots[TRIGRAM_OF[h.lines.slice(0, 3).join('')]], ...effect };
}

/* Today's cast as Look and the card tell it, or null before it is made. */
export function divinationBrief(content, state, now) {
  const cast = castToday(state, now);
  if (!cast) return null;
  const lang = state.lang, book = content.hexagrams;
  const h = book.hexagrams.find(x => x.id === cast.hexagram);
  const to = cast.changed ? book.hexagrams.find(x => x.id === cast.changed) : null;
  const values = cast.throws.map(t => t[0] + t[1] + t[2]);
  const moving = values.flatMap((v, i) => (v === 6 || v === 9 ? [i] : []));
  const bout = cast.ask === 'bout' ? boutFortune(content, state, now) : null;
  return {
    ask: { id: cast.ask, name: pick(book.asks[cast.ask], lang) },
    throws: cast.throws, values, moving,
    hexagram: {
      id: h.id, name: pick(h.name, lang), lines: h.lines, judgment: pick(h.judgment, lang), image: pick(h.image, lang),
      ...(moving.length && lang === 'zh' && h.yaoci ? { moving_lines: moving.map(i => h.yaoci[i]) } : {}),
    },
    changed: to ? { id: to.id, name: pick(to.name, lang) } : null,
    grade: { id: cast.grade, name: pick(book.grades[cast.grade], lang) },
    ...(cast.fated ? { fated: true } : {}),
    effect: { ...(book.effects[cast.ask]?.[cast.grade] ?? {}), ...(bout ? { root: { id: bout.root, name: pick(content.traits.elements[bout.root], lang) } } : {}) },
  };
}

/* Divine: once a day. Without `ask` the rules ask what the cast is about;
   with it, the coins fall — the same for the day and the 道号, so undo
   cannot fish for another. */
export function divine(state, content, ctx, args) {
  if (castToday(state, ctx.now)) return refuse('cast-today', null, { divination: divinationBrief(content, state, ctx.now) });
  const ask = String(args.ask ?? '').trim();
  if (!content.hexagrams.effects[ask]) return refuse('needs-ask', null, { asks: Object.keys(content.hexagrams.effects) });
  const s = clone(state);
  const throws = castThrows(`${dayKey(ctx.now)}|${s.name ?? ''}|cast`);
  const values = throws.map(t => t[0] + t[1] + t[2]);
  const lines = values.map(v => v % 2);
  const moved = lines.map((b, i) => (values[i] === 6 || values[i] === 9 ? 1 - b : b));
  const h = hexagramOf(content, lines);
  const to = moved.join('') === lines.join('') ? null : hexagramOf(content, moved);
  // A lower trigram of one's own 日主 element leans the grade one's way:
  // a good one to great, an ill one softer; an even one stays even.
  const fated = Boolean(s.fate?.element) && content.hexagrams.trigram_roots[TRIGRAM_OF[lines.slice(0, 3).join('')]] === s.fate.element;
  const grade = fated ? { great: 'great', good: 'great', even: 'even', ill: 'even', dire: 'ill' }[h.grade] : h.grade;
  s.divination = { day: dayKey(ctx.now), ask, throws, hexagram: h.id, changed: to?.id ?? null, grade, ...(fated ? { fated: true } : {}), at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, divination: divinationBrief(content, s, ctx.now) } };
}

/* ── 命格 — the player's lifelong base tone ── */

const jdn = (y, m, d) => {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};

/* 生肖 and 日主 from a birth date (YYYY-MM-DD): the year turns at 立春, by
   the day; the day's stem is its place in the sixty. Null for a date that
   is not one, or outside the 立春 table. */
export function fateOf(content, birth) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  const f = content.traits.fate, lichun = f.lichun.days[y - f.lichun.from];
  if (!lichun) return null;
  const pillar = mo > 2 || (mo === 2 && d >= Number(lichun)) ? y : y - 1;
  const stem = f.stems[(jdn(y, mo, d) + 9) % 10];
  return { zodiac: f.zodiac[(((pillar - 1984) % 12) + 12) % 12].id, stem: stem.id, element: stem.element };
}

/* The 命格 as Look and the card tell it; `{declined}` when the player let it be. */
export function fateBrief(content, state) {
  const f = state.fate;
  if (!f) return null;
  if (!f.zodiac) return { declined: true };
  const book = content.traits.fate, lang = state.lang;
  const stem = book.stems.find(s => s.id === f.stem);
  return {
    zodiac: { id: f.zodiac, name: pick(book.zodiac.find(z => z.id === f.zodiac), lang) },
    stem: { id: f.stem, name: pick(stem, lang) },
    element: { id: f.element, name: pick(content.traits.elements[f.element], lang) },
    source: f.source,
  };
}

/* The page's alone, never a tool: the birthday is typed on the card and
   read here, on this machine; only what it gives is kept. Once set, it
   stays for life; `random` draws one by the 道号; `decline` lets it be. */
export function fate(state, content, ctx, args) {
  if (state.fate?.zodiac) return refuse('fate-set', null, { fate: fateBrief(content, state) });
  const s = clone(state);
  if (args.decline) {
    s.fate = { declined: true };
    return { state: s, result: { ok: true, declined: true } };
  }
  let found;
  if (args.random) {
    const book = content.traits.fate, h = hashOf(`${s.name ?? ''}|${s.created ?? ''}|fate`);
    const stem = book.stems[h % book.stems.length];
    found = { zodiac: book.zodiac[Math.floor(h / book.stems.length) % book.zodiac.length].id, stem: stem.id, element: stem.element, source: 'random' };
  } else {
    const got = fateOf(content, args.birth);
    if (!got || new Date(`${args.birth}T00:00:00`) > ctx.now) return refuse('birth-invalid', null);
    found = { ...got, source: 'birth' };
  }
  s.fate = { ...found, at: ctx.now.toISOString() };
  return { state: s, result: { ok: true, fate: fateBrief(content, s) } };
}

export const VERBS = {
  look: (s, c, x) => {
    const woke = wake(s, c, x);
    // An art taught on waking (a companion from before the arts) is said once.
    const learned = woke ? (woke.arts ?? []).filter(id => !(s.arts ?? []).includes(id)).map(id => artBrief(c, woke, artOf(c, id))) : [];
    const aside = setRiddleAside(c, woke ?? s, x) ?? woke;
    const result = { ...look(aside ?? s, c, x), ...(learned.length ? { learned } : {}) };
    // Said once: the call is marked told the moment it is handed over.
    let next = aside;
    if (result.quest?.say) {
      next = clone(aside ?? s);
      next.companion = { ...next.companion, told: true };
    }
    return { state: next, result };
  },
  resolve, judge, task, win, duel, tame, write, refine, nourish, branch, summarize, move, trade, lang, make, enter, leave, build, worlds, travel, amend, art,
  go, saves, save, load, forget, atlas, divine, fate, ring,
};

/* ── Files and the command line ── */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const skillDir = () => path.resolve(HERE, '..');
const dataDir = () => process.env.LINGJING_DATA || path.resolve(HERE, '../data');
const savesDir = () => path.join(dataDir(), 'saves');
const savedFile = id => path.join(savesDir(), `${id}.json`);
const savedFor = id => fs.existsSync(savedFile(id));

/* The made world's folder, from its outline: the card, the words, the new
   creatures, its province, the opening scene. Art comes later, by `art`. */
function writeMadeWorld(outline, now) {
  const dir = madeWorldDir(outline.id);
  const overlay = overlayOf(outline);
  const pid = outline.province.id;
  fs.rmSync(dir, { recursive: true, force: true });
  const put = (rel, doc) => writeAtomic(path.join(dir, rel), JSON.stringify(doc, null, 2));
  put('world.json', cardOf(outline, now));
  put('dictionary.json', overlay.dictionary);
  put('creatures.json', overlay.creatures);
  put(`places/${pid}.json`, overlay.places[pid]);
  put(`scenes/${outline.scene.id}.json`, outline.scene);
}

/* A save begun in a world: a made world's opening scene is entered at
   once — its story starts there, not on a spine. */
function freshState(content, lang, now) {
  const s = newState(content, lang, now);
  if (content.opening && content.world.opening) {
    s.made = { scenes: { ...content.opening }, at: content.world.opening };
  }
  return s;
}
const questsDir = () => process.env.LINGJING_QUESTS || path.join(os.homedir(), '.linggen', 'quests');
const clock = () => (process.env.LINGJING_NOW ? new Date(process.env.LINGJING_NOW) : new Date());
/* How many messages the player has sent this session, the engine's count
   (LINGGEN_USER_TURNS); null on an engine that does not say. */
const userTurn = () => (/^\d+$/.test(process.env.LINGGEN_USER_TURNS ?? '') ? Number(process.env.LINGGEN_USER_TURNS) : null);

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readQuests() {
  const dir = questsDir();
  if (!fs.existsSync(dir)) return [];
  const quests = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const q of doc.quests ?? []) quests.push({ ...q, app: doc.app });
    } catch { /* an app's half-written file is skipped, never fatal */ }
  }
  return quests;
}

/* `--key=value` (what SKILL.md's templates send: an omitted arg arrives as an
   empty `--key=`, never a missing token) or `--key value` by hand. An empty
   value or a placeholder the agent left unfilled ({{x}}) is dropped. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const joined = /^--([^=]+)=([\s\S]*)$/.exec(argv[i] ?? '');
    const key = joined ? joined[1] : argv[i]?.replace(/^--/, '');
    const raw = joined ? joined[2] : argv[++i];
    if (!key || raw == null || raw === '' || /^\{\{.*\}\}$/.test(raw)) continue;
    args[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
  }
  return args;
}

/* The choice, ready for AskUser, on every answer the rules give: the scene's
   buttons while one runs (a riddle waiting is the question, the other
   buttons the options), the director's choice when the world is open. The
   model copies it and composes nothing — a rule in the prompt alone was not
   enough (2026-09-16, gpt-5.6-terra: Look, Show, narration, silence). */
export function askOf(content, state, ctx, result = {}) {
  const zh = state.lang === 'zh';
  const yinyue = filler(content, state, ctx.said);
  // Her riddle, while it waits, is the question — wherever the player stands.
  const her = companionOf(content);
  if (her && riddleWaiting(state, ctx.now)) {
    const key = state.companion.riddle.key, riddle = content.riddles[state.lang].riddles[key];
    const tried = new Set((state.companion.riddle.tried ?? []).map(normalizeAnswer));
    const where = atScene(content, state) ? sceneBrief(content, state, ctx.now)?.place : placeBrief(content, state, ctx.now)?.name;
    return {
      header: String(where ?? ''), question: riddle.q,
      options: [
        ...riddle.choices.filter(a => !tried.has(normalizeAnswer(a))).map(a => ({ label: a, ring: true, answer: a })),
        { label: zh ? '先不答' : 'Not yet', look: true },
      ],
    };
  }
  const header = s => String(s ?? '');
  const question = zh ? '何去何从？' : 'What now?';
  if (result.refused === 'needs-ask') {
    // 所问何事: the cast is a question held in mind — what it does, it does to that.
    const book = content.hexagrams;
    const where = atScene(content, state) ? sceneBrief(content, state, ctx.now)?.place : placeBrief(content, state, ctx.now)?.name;
    return {
      header: header(where), question: zh ? '所问何事？' : 'What do you ask about?',
      options: [...Object.keys(book.effects).map(id => ({ label: pick(book.asks[id], state.lang), divine: id })), { label: zh ? '先不问' : 'Not now', look: true }],
    };
  }
  if (atScene(content, state)) {
    const scene = sceneBrief(content, state, ctx.now);
    // A creature that withdrew today is not offered again until tomorrow — as
    // at its haunt; asked anyway, the same refusal came back each time
    // (2026-09-17: 降妖 · 五行 tapped three times at 蓬莱).
    const gone = new Set(scene.exits.filter(e => (e.withdrawn && !e.won) || e.closed).map(e => e.id));
    // A breath the player cannot take yet is not a button: the way back to
    // the world is (his "way back until ready", 2026-09-17 — 化婴 offered at
    // 结丹初期, tapped, refused).
    const unready = new Set(scene.exits.filter(e => e.breakthrough && !e.breakthrough.ready).map(e => e.id));
    // One clickable place for one thing (his law, 2026-09-17): an exit whose
    // game is played on its own card — a bout, a board — is not asked here
    // too; winning it moves the story by itself.
    const played = new Set(scene.exits.filter(e => e.game && !e.won).map(e => e.id));
    let options = scene.buttons.filter(b => !gone.has(b.id) && !unready.has(b.id) && !played.has(b.id)).map(b => ({ label: b.label, exit: b.id }));
    const back = unready.size ? wayBack(content, state, ctx.now) : null;
    // Named by the place it walks to — the story never spoke of leaving for
    // any other world (his "why now return to 人间", 2026-09-17).
    if (back) options.push({ label: zh ? `先回${pick(back.name, 'zh')}` : `Back to ${pick(back.name, 'en')} for now`, move: back.id });
    let asked = question;
    // A riddle on the table stays the question for every answer after it —
    // a word to Yinyue, a Look — so no screen offers the question the player
    // already answered (2026-09-17: 读封 tapped, Ling stopped on the riddle,
    // the stage offered 读封 again).
    const waiting = !result.refused && scene.exits.find(e => e.waiting);
    if (result.refused === 'needs-answer' || result.refused === 'wrong-answer' || waiting) {
      // The riddle's own answers to pick from — a tap is the answer — and a
      // way back to the scene (his "options are not related to the question").
      const riddle = waiting || scene.exits.find(e => e.riddle && (!result.exit || e.id === result.exit));
      if (riddle && !riddle.closed) {
        asked = riddle.riddle;
        const tried = new Set(riddle.tried.map(normalizeAnswer));
        options = [
          ...riddle.choices.filter(c => !tried.has(normalizeAnswer(c))).map(c => ({ label: c, exit: riddle.id, answer: c })),
          { label: zh ? '先不答' : 'Not yet', look: true },
        ];
      }
    }
    if (options.length < 2) options.push(yinyue);
    return { header: header(scene.place), question: asked, options };
  }
  const choice = directorBrief(content, state, ctx)?.choice;
  if (choice) return choice;
  return { header: header(placeBrief(content, state, ctx.now)?.name), question, options: FILLERS[zh ? 'zh' : 'en'] };
}
const THEN = 'Now AskUser exactly `ask` — header, question, options as they are. The reply ends only there.';
/* Something won: Yinyue's own glad line closes the narration. The stage
   speaks the reply's last Yinyue line, and a scene entered on a win brings
   lines of its own — so hers comes last, or the story is what she says
   (2026-09-17: the 青鼎 rose, she spoke "我想起第三件事" and no one was glad). */
const THEN_CHEER = 'Something was won: the last line before the AskUser is Yinyue\'s own, glad for the player in her voice — `**银月：**…` / `**Yinyue:** …` — after any scene lines, never the numbers. ' + THEN;
const won = r => {
  const p = r?.paid;
  if (!r?.ok || r.sold || r.bought) return false;
  return Boolean(r.breakthrough || r.learned?.length || p?.cast || p?.item || p?.levels?.length || (p?.progress ?? 0) > 0 || (p?.wealth ?? 0) > 0);
};
const THEN_CALL = 'The search has just opened: say `quest.line` in the world, in a line of its own, before the question. ';
export const thenFor = result => (result?.quest?.say ? THEN_CALL : '') + (won(result) ? THEN_CHEER : THEN);
const withAsk = (result, content, state, ctx) => ({ then: thenFor(result), ask: askOf(content, state, ctx, result), ...result });

/* The player's words are an option of the question on screen — a tap on a
   card arrives as words, and Look is where Ling takes them. Look names the
   one tool that option is, so the tap is done now, not asked again (seen
   2026-09-17: 蓬莱 tapped, Look, the same choice asked twice). */
const TAPS = {
  move: o => `Move {place: ${o.move}}`,
  exit: o => `Resolve {exit: ${o.exit}${o.answer ? `, answer: ${o.answer}` : ''}}`,
  // Inscribe, not Write: the engine's own file tool is Write, and took the
  // call (2026-09-17: 写一道符 → "missing field `path`").
  write: () => 'Inscribe',
  ring: o => (o.answer ? `Ring {answer: ${o.answer}}` : 'Ring'),
  tame: o => `Tame {creature: ${o.tame}}`,
  linger: () => 'Branch {action: open}',
  divine: o => (o.divine === true ? 'Divine' : `Divine {ask: ${o.divine}}`),
};
// A place chip on the map says 去X / Go to X (cards.js sayGo).
const GO = /^(去|go to\s+)/i;
// The day's cast asked for in words — the coins on the stage say 请银月起一卦
// (cards.js sayCast); typed, 起一卦 / 算一卦 / 问卦. Look alone let the scene's
// question win: 起一卦 tapped twice, 何去何从 asked twice (2026-09-17).
const CAST_WORDS = /起一?卦|算一?卦|问卦|\bcast the coins\b|\bdivine\b/i;
function tapThen(ask, said) {
  const words = String(said ?? '').trim();
  if (CAST_WORDS.test(words) && !ask?.options?.some(o => o.label === words)) {
    return 'The player asks for the day\'s cast — call Divine now, with no `ask`; this Look changed nothing. Then AskUser exactly the `ask` that tool returns. The reply ends only there.';
  }
  const options = words ? ask?.options ?? [] : [];
  const option = options.find(o => o.label === words) ?? options.find(o => o.move && o.label === words.replace(GO, ''));
  const kind = option && Object.keys(TAPS).find(k => option[k]);
  if (!kind) return null;
  return `The player tapped "${option.label}" — call ${TAPS[kind](option)} now; this Look changed nothing. Then AskUser exactly the \`ask\` that tool returns. The reply ends only there.`;
}

function run(verb, args) {
  const stateFile = path.join(dataDir(), 'state.json');
  const logFile = path.join(dataDir(), 'log.jsonl');
  const now = clock();
  const saved = fs.existsSync(stateFile) ? migrate(JSON.parse(fs.readFileSync(stateFile, 'utf8'))) : null;

  if (verb === 'undo') return undo(stateFile, logFile);
  // `init` begins the world in play again (or the one named), in the
  // language in use; the save it replaces is logged so `undo` brings it back.
  const worldId = verb === 'init' ? args.world ?? saved?.world ?? DEFAULT_WORLD : saved?.world ?? DEFAULT_WORLD;
  if (!knownWorld(worldId)) return { ok: false, refused: 'unknown-world', world: worldId, worlds: allWorlds() };
  const content = loadWorld(worldId);
  const state = verb === 'init' || !saved ? freshState(content, args.lang ?? saved?.lang, now) : saved;
  if (verb === 'init' || !saved) writeAtomic(stateFile, JSON.stringify(state));
  if (verb === 'init') {
    if (saved) fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: saved }) + '\n');
    return { ...look(state, content, { now, quests: readQuests() }), restarted: !!saved };
  }

  const fn = VERBS[verb];
  if (!fn) return { ok: false, refused: 'unknown-verb', verbs: ['init', ...Object.keys(VERBS), 'undo'] };
  if (BUILDING_WAITS.has(verb)) {
    const paint = paintList(content);
    if (paint.length) return { ok: false, refused: 'still-building', say: null, paint };
  }
  if (saved) keepDay(saved, now);
  const heard = heed(state, args.said);
  const out = fn(heard, content, { now, quests: readQuests(), turn: userTurn(), said: args.said }, args);
  if (out.result?.load) return loadSave(out.result.load, state, { stateFile, logFile, now });
  const next = out.state ?? (heard !== state ? heard : null);
  if (next) {
    next.updated = now.toISOString();
    writeAtomic(stateFile, JSON.stringify(next));
    fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb, args, before: state }) + '\n');
  }
  if (out.result?.travel) return travelTo(out.result.travel, next ?? state, { stateFile, logFile, now, verb });
  const result = heard !== state ? { ...out.result, lang_set: heard.lang } : out.result;
  const answer = withAsk(result, content, next ?? state, { now, quests: readQuests(), said: args.said });
  const tap = verb === 'look' && tapThen(answer.ask, args.said);
  return tap ? { ...answer, then: tap } : answer;
}

/* Park the save in play under its world and take up the other world's —
   restored where it stood, or begun. The answer is the new world's Look,
   with `travelled` saying where from and whether the save is fresh. */
function travelTo(id, current, { stateFile, logFile, now, verb }) {
  keepSave('world', current.world, current, now.toISOString());
  const content = loadWorld(id);
  const parked = savedFor(id) ? readSave(savedFile(id)).state : null;
  if (parked) fs.rmSync(savedFile(id), { force: true }); // in play now, not kept
  const state = parked ?? freshState(content, current.lang, now);
  state.updated = now.toISOString();
  writeAtomic(stateFile, JSON.stringify(state));
  fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb: 'travel', args: { world: id, by: verb }, before: current }) + '\n');
  return { ...look(state, content, { now, quests: readQuests() }), travelled: { from: current.world, to: id, fresh: !parked } };
}

/* The kept save becomes the game in play. Another world's: the game in play
   is parked under its world first, and that world's parked copy — now in
   play — is let go. The answer is its Look, with `loaded` saying which. */
function loadSave(found, current, { stateFile, logFile, now }) {
  const state = found.state;
  if (state.world !== current.world) keepSave('world', current.world, current, now.toISOString());
  if (found.kind === 'world') fs.rmSync(savedFile(found.id), { force: true });
  state.updated = now.toISOString();
  writeAtomic(stateFile, JSON.stringify(state));
  fs.appendFileSync(logFile, JSON.stringify({ at: now.toISOString(), verb: 'load', args: { id: found.id }, before: current }) + '\n');
  const content = loadWorld(state.world);
  return { ...look(state, content, { now, quests: readQuests() }), loaded: { id: found.id, kind: found.kind, title: found.title, at: found.at } };
}

function undo(stateFile, logFile) {
  const lines = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : [];
  if (!lines.length) return { ok: false, refused: 'nothing-to-undo' };
  const last = JSON.parse(lines.pop());
  writeAtomic(stateFile, JSON.stringify(last.before));
  writeAtomic(logFile, lines.length ? lines.join('\n') + '\n' : '');
  return { ok: true, undid: last.verb, at: last.at };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    console.log(JSON.stringify(run(verb ?? 'look', parseArgs(rest))));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) }));
    process.exit(1);
  }
}
