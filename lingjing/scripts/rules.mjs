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
import { MODES, REALMS as CARD_REALMS, battle, shuffle } from './battle.js';
import { askMinusStage, stageCards, stageHolds, stageOwns } from './stage.mjs';
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
  // The haunt's own beast, else the one today's 遇 put on this road.
  const road = meetHere(state, now);
  const cid = place?.has?.creature ?? (road?.kind === 'beast' && !road.veiled ? road.creature : null);
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
      // Where he STANDS counts first. It did not until 2026-09-18, and the
      // quest card sent him two days down the road to 濮阳 for a bell that was
      // on the shelf in front of him at 邺城 (his "坊市在濮阳, 但我在邺城").
      if (test(p)) return { ...placeName(content, state, p), steps };
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

/* ── 差事 — the errands the player takes (design.md § 差事) ──
   接 · 记 · 追 · 交. The world offers, the player takes, the rules count, and
   交差 happens where he stands the moment the count is met — he never walks
   back to the giver (his ruling, 2026-09-18: 不要让用户跑地图). */

export const BOOK_MAX = 3; // a chat game cannot show a log of twenty-five

const questOf = (content, id) => (content.quests ?? []).find(q => q.id === id) ?? noticeOf(content, id);
const questDoneBefore = (state, id) => Boolean(state.quests?.[id]?.done_at);

/* The counts, as they stand. `carry` is not ticked by anything: what is in the
   bag now IS the count, so buying and using it again both show at once. */
function countsOf(content, state, quest) {
  const held = state.quests?.[quest.id];
  return quest.need.map((need, i) => {
    // 降 or 驯, the beast is won over either way (his, 2026-09-23: 喂人参和战斗
    // 都是收服的方式): one that walks with him meets a 降 as well as a 驯.
    const won = (need.kind === 'subdue' || need.kind === 'tame') && (state.cast ?? []).includes(need.creature);
    const have = need.kind === 'carry' ? (state.bag[need.item] ?? 0) : won ? need.n : (held?.have?.[i] ?? 0);
    return { ...need, have: Math.min(have, need.n), done: have >= need.n };
  });
}

const questReady = (content, state, quest) => countsOf(content, state, quest).every(n => n.done);

/* 功课 on the same card (design.md § 差事 ⑥): what the player's apps report,
   as lines of the book. They take no slot — nobody took them, life gave them
   — and one paid for its period leaves, like any errand handed in. */
/* Where a 功课 is done: the page the app declares (`open`, a path under
   /apps/), else the app's own entry as its SKILL.md names it (`app.entry`) —
   `/apps/<app>/` alone is the Linggen shell, not the app (his, 2026-09-23:
   去 Shifu 做 opened the agent UI). No entry found, no link. */
const SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function appEntry(app) {
  if (!/^[a-z0-9-]+$/.test(app ?? '')) return null;
  try {
    const head = fs.readFileSync(path.join(SKILLS_ROOT, app, 'SKILL.md'), 'utf8').split(/^---$/m)[1] ?? '';
    const entry = /^\s+entry:\s*(\S+)\s*$/m.exec(head)?.[1];
    return entry && !entry.includes('..') ? `/apps/${app}/${entry}` : null;
  } catch { return null; }
}
const choreOpen = q => (typeof q.open === 'string' && q.open.startsWith('/apps/') ? q.open : appEntry(q.app));
function choresOf(state, ctx, lang) {
  return (ctx?.quests ?? [])
    .filter(q => (q.due || questDone(q, ctx.now)) && state.chores?.[q.id]?.period !== periodKey(q.period, ctx.now))
    .map(q => {
      const done = questDone(q, ctx.now);
      return { id: q.id, title: pick(q.title, lang), need: [{ kind: 'chore', have: done ? 1 : 0, n: 1 }], ready: done, where: null,
        // Where to do it: the app's own page, as the app declares it (`open`),
        // else its door. Only a path on this host — never a link out.
        chore: { app: q.app, period: q.period, done_at: done ? q.done_at : null, open: choreOpen(q) } };
    });
}

/* Open, in the order taken; then life's own. */
function bookOf(content, state, lang, ctx) {
  return [...errandsOf(content, state, lang), ...choresOf(state, ctx, lang)];
}

function errandsOf(content, state, lang) {
  return Object.keys(state.quests ?? {})
    .filter(id => !questDoneBefore(state, id))
    .map(id => {
      const q = questOf(content, id);
      if (!q) return null;
      const need = countsOf(content, state, q);
      return { id, title: pick(q.title, lang), need: need.map(n => ({ kind: n.kind, have: n.have, n: n.n })), ready: need.every(x => x.done), where: whereFor(content, state, q, need, lang) };
    })
    .filter(Boolean);
}

/* Where the next count is met — a creature's haunt, a place to reach, the
   market that sells it. One line, so the player is never left guessing. */
function whereFor(content, state, quest, need, lang) {
  const open = need.find(n => !n.done);
  if (!open) return null;
  const at = open.kind === 'visit' ? placeOf(content, open.place)
    : open.kind === 'subdue' || open.kind === 'tame' ? Object.values(content.places).flatMap(d => d.places).find(p => p.has?.creature === open.creature)
      : open.kind === 'carry' ? nearestPlace(content, state, new Date(), p => p.has?.shop)
        : null;
  if (!at) return null;
  if (at.id === state.place) return { id: at.id, name: pick(at.name, lang) ?? at.name, here: true };
  const named = at.name ? placeName(content, state, at) : at;
  // The first place on the road there, when it is more than one road away —
  // what Ling used to say after a 接下 (「先去大野泽，再往凫丽山」); the page says it
  // now that 接下 is the page's own tap (his, 2026-09-22).
  const from = placeOf(content, state.place), way = from && at.roads ? pathOf(content, state, from, at, new Date(state.updated ?? Date.now())) : null;
  return way && way.length > 1 ? { ...named, via: placeName(content, state, way[0]).name, roads: way.length } : named;
}

/* 榜文 — templated 差事 (design.md § 差事 ⑤). A market posts one a day: a
   template and a target of its own province. The id says it all —
   `daily-<day>-<template>-<target>` — so the 差事 is rebuilt from its id and
   the save holds nothing more than it does for an authored one. Taken, it
   stays in the book until done or put down; only the posting turns with the day. */
const swap = (pair, words) => Object.fromEntries(['zh', 'en'].map(l => [l, pair[l].replace(/\{(target|place)\}/g, (_, k) => words[k][l])]));

function noticeOf(content, id) {
  const [, day, tid, target] = /^daily-(\d{8})-([a-z]+)-([a-z0-9]+)$/.exec(id ?? '') ?? [];
  const t = (content.notices ?? []).find(x => x.id === tid);
  if (!t) return null;
  const at = allPlaces(content).find(p => (t.kind === 'visit' ? p.id : p.has?.creature) === target);
  const market = at && allPlaces(content).find(p => p.province === at.province && p.has?.shop);
  if (!market) return null;
  const name = t.kind === 'visit' ? at.name : creatureOf(content, target)?.name;
  if (!name) return null;
  const words = { target: name, place: at.name };
  return { id, day, notice: t.id, province: at.province, title: swap(t.title, words), say: swap(t.say, words), from: { place: market.id, who: t.who },
    need: [{ kind: t.kind, n: t.n, ...(t.kind === 'visit' ? { place: target } : { creature: target }) }], grant: t.grant };
}

/* What a market's notice may name today: a haunt not yet fought today, or a
   place to reach — of this province, a few walkable roads from the market. */
const NOTICE_REACH = 3; // roads from the market: an errand, not a pilgrimage

/* The places within so many walkable roads of one. */
function withinRoads(content, state, from, now, max) {
  const walkable = p => p && !tooHard(content, state, p) && provinceOpen(content, p.province, now);
  const seen = new Set([from.id]);
  let edge = [from];
  for (let i = 0; i < max; i += 1) {
    edge = edge.flatMap(p => p.roads).filter(id => !seen.has(id)).map(id => placeOf(content, id)).filter(walkable);
    edge = edge.filter(p => !seen.has(p.id) && seen.add(p.id));
  }
  seen.delete(from.id);
  return seen;
}

function noticeTargets(content, state, market, t, now) {
  const reach = withinRoads(content, state, market, now, NOTICE_REACH);
  const near = allPlaces(content).filter(p => p.province === market.province && reach.has(p.id));
  if (t.kind === 'visit') return near.map(p => p.id);
  // A bounty that cannot be won is a lie: not a beast that walks with him, nor one already met today.
  return near.filter(p => p.has?.creature && !state.cast.includes(p.has.creature) && state.duels?.[p.has.creature]?.day !== dayKey(now)).map(p => p.has.creature);
}

const NOTICES_A_DAY = 3;

function noticeAt(content, state, now) {
  const market = placeOf(content, state.place);
  if (!market?.has?.shop || inMade(state)) return null;
  const day = dayKey(now), stamp = day.replaceAll('-', '');
  // Up to NOTICES_A_DAY at each market, one posted at a time: taking one puts
  // up the next (his, 2026-09-23 — one a day left his book empty 484 修为 short
  // of a cauldron; 体力 is the only limit on a day's play now).
  const today = Object.keys(state.quests ?? {}).filter(id => noticeOf(content, id)?.from.place === market.id && id.startsWith(`daily-${stamp}-`));
  if (today.length >= NOTICES_A_DAY) return null;
  const pool = (content.notices ?? []).flatMap(t => noticeTargets(content, state, market, t, now).map(target => `daily-${stamp}-${t.id}-${target}`))
    .filter(id => !state.quests?.[id]);
  return pool.length ? noticeOf(content, pool[hashOf(`${day}|${state.name ?? ''}|${market.id}|notice|${today.length}`) % pool.length]) : null;
}

/* What may be taken where he stands: the giver is here, it is not in the book
   already, it has not been done, and its gate is open. */
function offersOf(content, state, lang, now) {
  if (state.quests && Object.keys(state.quests).filter(id => !questDoneBefore(state, id)).length >= BOOK_MAX) return [];
  const notice = noticeAt(content, state, now);
  return [...(content.quests ?? []), ...(notice ? [notice] : [])]
    .filter(q => q.from?.place === state.place && !state.quests?.[q.id]
      && (!q.opens?.after || questDoneBefore(state, q.opens.after))
      && (!q.opens?.tier || TIERS_ORDER(content).indexOf(state.tier) >= TIERS_ORDER(content).indexOf(q.opens.tier)))
    .map(q => ({ id: q.id, title: pick(q.title, lang), who: q.from.who ? pick(q.from.who, lang) : null, say: fill(pick(q.say, lang), state), need: q.need.map(n => ({ kind: n.kind, n: n.n })), grant: q.grant }));
}

const TIERS_ORDER = content => content.ladder.tiers.map(t => t.id);

/* Where work is to be had — the nearest place, by road, that offers an errand
   he may take. The rules always knew; nothing said it, and with the spine
   gated and the book empty he stood at 吕梁洪 asking 「我该干点啥？」 (2026-
   09-21). Null while the book is full, or when nothing is on offer anywhere he
   can walk. */
/* No errand anywhere in reach: the nearest beast not yet met today is work
   too (his, 2026-09-23: 剧情卡这里了, 没人给提示, 也没有下一个差事 — 484 修为
   short of a cauldron with an empty book and a goal line that named nothing). */
function beastWork(content, state, ctx, here) {
  const day = dayKey(ctx.now);
  const at = allPlaces(content)
    .filter(p => p.has?.creature && !state.cast.includes(p.has.creature) && state.duels?.[p.has.creature]?.day !== day && !tooHard(content, state, p))
    .map(p => ({ p, way: p.id === here.id ? [] : pathOf(content, state, here, p, ctx.now) }))
    .filter(x => x.way)
    .sort((a, b) => a.way.length - b.way.length)[0];
  if (!at) return null;
  return { kind: 'beast', place: placeName(content, state, at.p), here: at.p.id === here.id, roads: at.way.length, titles: [pick(creatureOf(content, at.p.has.creature)?.name, state.lang)] };
}

function workOf(content, state, ctx) {
  if (inMade(state) || atScene(content, state)) return null;
  const here = placeOf(content, state.place);
  if (!here || errandsOf(content, state, state.lang).length >= BOOK_MAX) return null;
  const at = allPlaces(content)
    .map(p => ({ p, offers: offersOf(content, { ...state, place: p.id }, state.lang, ctx.now) }))
    .filter(x => x.offers.length)
    .map(x => ({ ...x, way: x.p.id === here.id ? [] : pathOf(content, state, here, x.p, ctx.now) }))
    .filter(x => x.way)
    .sort((a, b) => a.way.length - b.way.length)[0];
  if (!at) return beastWork(content, state, ctx, here);
  return { kind: 'errand', place: placeName(content, state, at.p), here: at.p.id === here.id, roads: at.way.length, titles: at.offers.map(o => o.title) };
}

/* One counter, moved by something that actually happened. Every verb that can
   move one calls this and nothing else does — the rules are the only writer,
   and a count nobody can verify is a lie. */
export function advance(content, state, event, ctx = null) {
  for (const id of Object.keys(state.quests ?? {})) {
    if (questDoneBefore(state, id)) continue;
    const q = questOf(content, id);
    if (!q) continue;
    q.need.forEach((need, i) => {
      if (need.kind !== event.kind) return;
      if (need.creature && need.creature !== event.creature) return;
      if (need.place && need.place !== event.place) return;
      if (need.task && need.task !== event.task) return;
      if (need.item && need.item !== event.item) return;
      const held = state.quests[id];
      held.have = { ...held.have, [i]: Math.min(need.n, (held.have?.[i] ?? 0) + 1) };
    });
  }
  return ctx ? settleErrands(content, state, ctx) : [];
}

/* 交差 by itself (his pick, 2026-09-23): a tap that asks no choice is only a
   tap. An errand met pays the moment it is met, and its `then` goes straight
   into the book — the giver hands the next step over, as WoW's NPC does. A
   `carry` waits for his 交差: it spends what is in his bag, and that is his
   to decide. With the book full the next step waits at its giver. */
const HANDED_KEEP = 3;

function complete(content, s, ctx, id, q) {
  for (const need of q.need) {
    if (need.kind !== 'carry') continue;
    s.bag[need.item] = Math.max(0, (s.bag[need.item] ?? 0) - need.n);
    if (!s.bag[need.item]) delete s.bag[need.item]; // the bag lists nothing it does not hold
  }
  s.quests[id] = { ...s.quests[id], done_at: ctx.now.toISOString() };
  const paid = pay(content, s, ctx, q.grant);
  const next = q.then ? questOf(content, q.then) : null;
  const open = Object.keys(s.quests).filter(x => !questDoneBefore(s, x)).length;
  const took = Boolean(next) && !s.quests[next.id] && open < BOOK_MAX;
  if (took) s.quests[next.id] = { took: dayKey(ctx.now), have: {} };
  return { id, place: s.place, at: ctx.now.toISOString(), paid, next: next?.id ?? null, took };
}

function settleErrands(content, s, ctx) {
  const out = [];
  for (const id of Object.keys(s.quests ?? {})) {
    if (questDoneBefore(s, id)) continue;
    const q = questOf(content, id);
    if (!q || q.need.some(n => n.kind === 'carry') || !questReady(content, s, q)) continue;
    out.push(complete(content, s, ctx, id, q));
  }
  if (out.length) s.handed = [...(s.handed ?? []), ...out].slice(-HANDED_KEEP);
  return out.map(h => handedOne(content, s, h));
}

/* One errand handed in, as the stage and Ling tell it. */
function handedOne(content, state, h) {
  const lang = state.lang, q = questOf(content, h.id), next = h.next ? questOf(content, h.next) : null;
  return { id: h.id, title: pick(q?.title, lang), who: q?.from?.who ? pick(q.from.who, lang) : null, paid: h.paid,
    ...(q?.grant?.item ? { gives: pick(itemOf(content, q.grant.item)?.name, lang) } : {}),
    ...(next ? { next: { id: next.id, title: pick(next.title, lang), took: h.took, at: placeName(content, state, placeOf(content, next.from.place)) } } : {}) };
}

/* What was handed in where he stands — the stage's 所得 until he walks on. */
function handedHere(content, state) {
  return (state.handed ?? []).filter(h => h.place === state.place).map(h => handedOne(content, state, h));
}

/* Where the story waits, and the first road toward it — the goal, as the stage
   shows it. It had no card until 2026-09-18: the rules always knew (`thread`),
   Ling said it only when she thought of it, and he walked four places asking
   「where to go, what should do」. `toward` is one road at a time; at the door
   it is the place itself. */
function waypointOf(content, state, ctx) {
  if (atScene(content, state) || inMade(state) || !sceneOf(content, state)) return null;
  const thread = threadOf(content, state, ctx.now);
  if (!thread?.place) return thread;
  // A cauldron that waits on the peak is not a road to walk: the card says
  // what it asks and where he stands, so a blocked spine reads as blocked.
  if (waitsOnPeak(content, state)) return { ...thread, gate: gateOf(content, state) };
  const here = placeOf(content, state.place), goal = placeOf(content, thread.place.id);
  if (!here || !goal || here.id === goal.id) return thread;
  const toward = towardOf(content, state, here, goal, ctx.now);
  return toward ? { ...thread, toward } : thread;
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

/* What a waiting cauldron asks, beside where the player stands now. */
function gateOf(content, state) {
  const need = breakthroughOf(content, state).need;
  return need && { ...need, now: { step: stepName(content, state.tier, state.step, state.lang), progress: state.progress, of: threshold(content, state) } };
}

/* A scene that waits only on a breath the player cannot take yet: the way
   on is the world, not back to the cauldron. */
function waitsOnPeak(content, state) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  const exits = (scene?.buttons ?? []).map(id => scene.exits.find(e => e.id === id));
  return exits.length > 0 && exits.every(e => e?.breakthrough) && !breakthroughOf(content, state).ready;
}

/* ── 遇 — an arrival is never empty (design.md § 遇; his, 2026-09-21: 「can we
   make sure a place triggers an event … instead of just go from a place to
   another」). Where the place holds nothing of its own, the rules deal ONE:
   something found, a traveller's riddle, a beast on the road. Drawn by the
   day, the place and the 道号 — a reload rerolls nothing — and once per place
   per day, so walking to and fro is not a farm. */
const meetsToday = (state, now) => (state.meets?.day === dayKey(now) ? state.meets.places ?? {} : {});
const meetHere = (state, now) => meetsToday(state, now)[state.place] ?? null;

/* What the place holds by itself: a scene, an errand offered, a shelf, a
   beast still to be met. Any of these IS the arrival. A seed is not: 在此逗留
   is one more option in the question, and a place that offered only that was
   the empty arrival he complained of (吕梁洪, 2026-09-21) — it is dealt a 遇
   like any other, and the tale is still there to begin. */
function ownHere(content, state, ctx) {
  const place = placeOf(content, state.place), has = place?.has ?? {};
  if (atScene(content, state) || has.shop) return true;
  if (offersOf(content, state, state.lang, ctx.now).length) return true;
  return Boolean(has.creature && !state.cast.includes(has.creature) && state.duels?.[has.creature]?.day !== dayKey(ctx.now));
}

function meetPool(content, state, ctx) {
  const m = content.meets, place = placeOf(content, state.place);
  // A find may say where it belongs (`at`); one that names no place lies
  // anywhere in its province. A province with none written uses `*`.
  const here = list => (list ?? []).map((f, n) => ({ f, n })).filter(({ f }) => !f.at || f.at.includes(place.id));
  const own = here(m.finds?.[place.province]);
  const finds = own.length ? own.map(x => ({ book: place.province, n: x.n })) : here(m.finds?.['*']).map(x => ({ book: '*', n: x.n }));
  const seen = new Set(state.riddles_seen ?? []);
  const riddles = (m.riddles ?? []).filter(k => !seen.has(k));
  // Creatures move (his, 2026-09-21) — but not across the world: a wandering
  // beast is one of THIS province's haunts, else of a province a road away.
  // Never one that walks with him, was met today, or lives beyond his tier.
  const roams = p => p.has?.creature && p.id !== place.id && !tooHard(content, state, p) && provinceOpen(content, p.province, ctx.now)
    && !state.cast.includes(p.has.creature) && state.duels?.[p.has.creature]?.day !== dayKey(ctx.now);
  const every = allPlaces(content), home = every.filter(p => p.province === place.province && roams(p));
  const nextDoor = new Set(every.filter(p => p.province === place.province).flatMap(p => p.roads).map(id => placeOf(content, id)?.province));
  const beasts = (home.length ? home : every.filter(p => nextDoor.has(p.province) && roams(p))).map(p => p.has.creature);
  // 抉择 needs nothing authored: Ling writes it on the spot.
  return { find: finds, riddle: riddles.length ? riddles : m.riddles ?? [], beast: [...new Set(beasts)], trial: m.trial ? ['live'] : [] };
}

function dealMeet(content, state, ctx) {
  if (!content.meets || inMade(state) || meetHere(state, ctx.now) || ownHere(content, state, ctx)) return null;
  const pool = meetPool(content, state, ctx);
  // A place says which it may deal — a ferry has travellers, a marsh has
  // beasts (`meets` on the place; unsaid, any).
  const allowed = placeOf(content, state.place).meets;
  // 抉择 fits anywhere: Ling writes it to the place.
  const kinds = Object.entries(content.meets.weights).filter(([k, w]) => w > 0 && pool[k]?.length && (!allowed || allowed.includes(k) || k === 'trial'));
  if (!kinds.length) return null;
  const roll = hashOf(`${dayKey(ctx.now)}|${state.name ?? ''}|${state.place}|meet`);
  let at = roll % kinds.reduce((n, [, w]) => n + w, 0);
  const [kind] = kinds.find(([, w]) => (at -= w) < 0);
  // Its own hash: bits of `roll` picked 夔 fifteen times out of fifteen.
  const nth = list => hashOf(`${dayKey(ctx.now)}|${state.place}|${state.name ?? ''}|which`) % list.length;
  const pickOf = list => list[nth(list)];
  // Veiled: the stage shows mist until Ling has set the moment and calls
  // Meet reveal (his, 2026-09-22: 月黑风高…突然…然后webUI出现怪物卡).
  if (kind === 'find') { const f = pickOf(pool.find); return { kind, find: f.book, n: f.n, veiled: true }; }
  if (kind === 'riddle') return { kind, key: pickOf(pool.riddle), tried: [], veiled: true };
  // The dice are thrown now, one per way through, and kept: Ling writes the
  // ways without knowing them, so she cannot set a mark to fit a roll.
  if (kind === 'trial') {
    const die = content.meets.trial.die, max = content.meets.trial.options.max;
    return { kind, rolls: Array.from({ length: max }, (_, i) => (hashOf(`${dayKey(ctx.now)}|${state.place}|${state.name ?? ''}|trial|${i}`) % die) + 1), veiled: true };
  }
  return { kind, creature: pickOf(pool.beast), veiled: true };
}

const findOf = (content, meet) => content.meets.finds[meet.find][meet.n];

/* The 遇 as Look and Move tell it — what Ling speaks, what the stage draws. */
function meetBrief(content, state, now) {
  const meet = meetHere(state, now), lang = state.lang;
  if (!meet || meet.done) return null;
  const brief = meetBriefOf(content, meet, lang);
  return meet.veiled ? { ...brief, veiled: true } : brief;
}
function meetBriefOf(content, meet, lang) {
  if (meet.kind === 'find') {
    const f = findOf(content, meet), item = f.item ? itemOf(content, f.item) : null;
    return { kind: 'find', line: pick(f.line, lang), ...(item ? { item: { id: item.id, name: pick(item.name, lang) } } : { wealth: f.wealth }) };
  }
  if (meet.kind === 'riddle') {
    const r = content.riddles[lang].riddles[meet.key], tried = new Set((meet.tried ?? []).map(normalizeAnswer));
    return { kind: 'riddle', riddle: r.q, choices: r.choices.filter(c => !tried.has(normalizeAnswer(c))), ...(meet.tried?.length ? { hint: r.hint } : {}) };
  }
  if (meet.kind === 'trial') return { kind: 'trial', ...(meet.options ? { options: trialOptions(content, meet) } : { waiting: true }) };
  return { kind: 'beast', creature: { id: meet.creature, name: pick(creatureOf(content, meet.creature).name, lang) } };
}

/* ── 抉择 — Ling writes the ways through, the rules threw the dice ──
   What the page and Ling see of each way: its words, how hard, what it
   risks, and the odds — never the roll, never the outcome lines before the
   choice (those are committed, and shown only for the way taken). */
const TRIAL_BONUS = (content, meet) => (meet.companion ? content.meets.trial.companion : 0);
function trialOptions(content, meet) {
  const t = content.meets.trial;
  return meet.options.map((o, n) => {
    const need = Math.max(1, t.marks[o.difficulty] - TRIAL_BONUS(content, meet));
    return { n, label: o.label, difficulty: o.difficulty, stake: o.stake, chance: Math.round(((t.die - need + 1) / t.die) * 100) };
  });
}
/* What Ling offered, held to the rules' shape — or why not. */
function lintTrial(content, raw) {
  const t = content.meets.trial, lim = t.options;
  let list;
  try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { why: 'options must be JSON' }; }
  if (!Array.isArray(list) || list.length < lim.min || list.length > lim.max) return { why: `${lim.min}–${lim.max} ways through` };
  const text = (v, n) => typeof v === 'string' && v.trim() && [...v.trim()].length <= n;
  for (const o of list) {
    if (!text(o?.label, lim.label)) return { why: `each label: words, at most ${lim.label} characters` };
    if (!t.marks[o.difficulty]) return { why: `difficulty is one of ${Object.keys(t.marks).join(', ')}` };
    if (!t.lose[o.stake]) return { why: `stake is one of ${Object.keys(t.lose).join(', ')}` };
    if (!text(o.win, lim.line) || !text(o.lose, lim.line)) return { why: `win and lose: one line each, at most ${lim.line} characters` };
  }
  if (new Set(list.map(o => o.difficulty)).size < 2) return { why: 'not all the same difficulty — then there is no choice' };
  return { options: list.map(o => ({ label: o.label.trim(), difficulty: o.difficulty, stake: o.stake, win: o.win.trim(), lose: o.lose.trim() })) };
}
function settleTrial(content, s, ctx, here, n) {
  const t = content.meets.trial, o = here.options[n];
  const success = here.rolls[n] + TRIAL_BONUS(content, here) >= t.marks[o.difficulty];
  const lang = s.lang;
  if (success) {
    const win = t.win[o.difficulty];
    const paid = pay(content, s, ctx, { table: 'trial', progress: win.progress ?? 0, wealth: win.wealth ?? 0 });
    return { success, line: o.win, paid };
  }
  if (o.stake === 'coin') {
    const lost = Math.min(s.wealth, t.lose.coin[o.difficulty]);
    s.wealth -= lost;
    return { success, line: o.lose, lost: { wealth: lost } };
  }
  const now = woundsNow(content, s, ctx.now), add = Math.ceil(hpMaxOf(s) * t.lose.wound[o.difficulty]);
  const after = Math.min(hpMaxOf(s), now + add);
  s.wounds = { n: after, at: ctx.now.toISOString() };
  // What it truly took: a wound on a body already near empty takes only what was left.
  return { success, line: o.lose, lost: { hp: after - now }, health: healthBrief(content, s, ctx.now) };
}

/* Meet — 收下 what was found, answer the traveller, or walk on. */
export function meet(state, content, ctx, args) {
  const s = clone(state), here = meetHere(s, ctx.now), lang = s.lang;
  const action = String(args.action ?? '');
  if (!here || here.done) return refuse('nothing-here', null);
  const close = () => { s.meets.places[s.place] = { ...here, done: true }; };
  // 抉择: Ling's ways through, checked, and the card comes up with them.
  if (here.kind === 'trial' && action === 'offer') {
    if (here.options) return refuse('already-offered', null, { meet: meetBrief(content, s, ctx.now) });
    const linted = lintTrial(content, args.options);
    if (!linted.options) return refuse('not-playable', null, { why: linted.why });
    const { veiled, ...open } = here;
    s.meets.places[s.place] = { ...open, options: linted.options, companion: hasCompanion(s) && !herAway(s, ctx.now) };
    return { state: s, result: { ok: true, offered: linted.options.length, meet: meetBrief(content, s, ctx.now) } };
  }
  if (here.kind === 'trial' && action === 'choose') {
    const n = Number(args.n);
    if (!here.options) return refuse('not-offered', null);
    if (!Number.isInteger(n) || !here.options[n]) return refuse('no-such-way', null, { ways: here.options.length });
    const empty = spendStamina(content, s, ctx, 'trial');
    if (empty) return empty;
    const out = settleTrial(content, s, ctx, here, n);
    s.meets.places[s.place] = { ...here, done: true, chose: n, success: out.success };
    return { state: s, result: { ok: true, chose: n, ...out } };
  }
  // 揭 — the moment has been set; the card comes up and the question with it.
  if (action === 'reveal') {
    if (!here.veiled) return refuse('not-veiled', null);
    // A 抉择 whose ways were never written has nothing to show: it passes.
    if (here.kind === 'trial') { const { veiled, ...open } = here; s.meets.places[s.place] = { ...open, done: true }; return { state: s, result: { ok: true, revealed: 'nothing' } }; }
    const { veiled, ...open } = here;
    s.meets.places[s.place] = open;
    return { state: s, result: { ok: true, revealed: here.kind, meet: meetBrief(content, s, ctx.now) } };
  }
  // Taken, answered or passed by his own word: the mist is gone either way.
  delete here.veiled;
  if (action === 'pass') { close(); return { state: s, result: { ok: true, passed: here.kind } }; }
  if (here.kind === 'find' && action === 'take') {
    const f = findOf(content, here);
    if (f.item) s.bag[f.item] = (s.bag[f.item] ?? 0) + 1;
    const paid = f.item ? null : pay(content, s, ctx, { table: 'meet', wealth: f.wealth });
    close();
    return { state: s, result: { ok: true, took: f.item ? { id: f.item, name: pick(itemOf(content, f.item).name, lang) } : null, paid } };
  }
  if (here.kind === 'riddle' && action === 'answer') {
    const said = normalizeAnswer(args.answer ?? '');
    if (!said) return refuse('needs-answer', null, { choices: meetBrief(content, s, ctx.now).choices });
    const right = ['zh', 'en'].some(l => content.riddles[l].riddles[here.key].a.some(a => normalizeAnswer(a) === said));
    if (!right) {
      s.meets.places[s.place] = { ...here, tried: [...(here.tried ?? []), String(args.answer)] };
      const left = meetBrief(content, s, ctx.now);
      return { state: s, result: { ok: false, refused: 'wrong-answer', hint: left.hint, choices: left.choices } };
    }
    s.riddles_seen = [...new Set([...(s.riddles_seen ?? []), here.key])];
    const paid = pay(content, s, ctx, { table: 'meet', progress: content.rewards.tables.meet.progress });
    close();
    return { state: s, result: { ok: true, answered: true, paid } };
  }
  const actions = { find: ['take', 'pass', 'reveal'], riddle: ['answer', 'pass', 'reveal'], trial: ['offer', 'choose', 'pass'] }[here.kind] ?? ['pass', 'reveal'];
  return refuse('unknown-action', null, { actions });
}

/* A 奇遇 does not keep overnight. His save held one opened 2026-09-14 with no
   turn taken, and for a week it shut every seed out of every place: he
   arrived, nothing was there, and the chat asked where next (2026-09-21). */
const liveBranch = (state, now) => (state.branch && dayKey(new Date(state.branch.opened)) === dayKey(now) ? state.branch : null);

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
  const seed = place.has?.seeds && state.day.branches < content.branches.per_day && !liveBranch(state, ctx.now)
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
    choice: atScene(content, state) ? null : choiceOf(state, here, near, toward ? { ...led, place: toward } : led, Boolean(seed), ctx.said, canWrite(content, state), filler(content, state, ctx.said), bookOf(content, state, state.lang, ctx).filter(q => q.ready), workOf(content, state, ctx)),
  };
}

/* The way forward while the world is open, ready for AskUser as it is: the
   thread's place first, then the other roads, a linger when today's seed
   waits here, and a word to Yinyue so there are always two. Ling offers it
   verbatim; a tapped label is its `move` (Move there at once), `linger`
   (Branch open) or `ask` (Yinyue answers). A scene's own buttons take its
   place while one runs. */
function choiceOf(state, here, near, thread, seeded, said, write = false, alone = null, ready = [], work = null) {
  const zh = state.lang === 'zh';
  const first = thread?.place && near.find(p => p.id === thread.place.id);
  const places = first ? [first, ...near.filter(p => p.id !== first.id)] : near;
  const options = [];
  // 降妖 and the feeding are on the creature's card, the cast on its coins, the
  // bell on the quest's card: one clickable place each, never asked here too
  // (his law, 2026-09-17 — "user will click twice"). 写符 has no card of its own.
  // Something done is handed in before anything else is asked: 交差 where he
  // stands, the moment it is met — and the chat says so, not only a chip.
  options.push(...ready.map(q => ({ label: zh ? `交差：${q.title}` : `Hand in: ${q.title}`, turn: q.id })));
  // Work to be had, a walk away: the way on when the story is waiting.
  if (work && !work.here) options.push({ label: zh ? `${work.place.name} · 有差事` : `${work.place.name} · work to be had`, move: work.place.id });
  if (write) options.push({ label: zh ? '写一道符' : 'Write a talisman', write: true });
  options.push(...places.filter(p => !(work && !work.here && p.id === work.place.id)).map(p => ({ label: p.name, move: p.id })));
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
  mend: e => ({ mend: e.mend }),
  learn: e => ({ learn: e.learn, level: e.level, tier: e.tier }),
  wear: e => ({ wear: e.wear, ...(e.lift ? { lift: e.lift } : {}) }),
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

/* 装备 · 背包 — what he wears and what he carries, as the top bar's 装 chip
   opens it (his ask, 2026-09-22: 需要有个装备的card … 需要同时打开装备和背包).
   The three arms' slots, the 本命法宝, what Yinyue wears, what the fight takes
   from them; then the bag, each thing with where it would go or how it is
   used, so the page draws buttons it can press without guessing. A read the
   page asks for when the chip opens — never in Look: 1.5k characters a turn
   is what Ling would pay for a panel only the player looks at. */
const GEAR_SLOTS = ['weapon', 'robe', 'pendant'];
function gearBrief(content, state) {
  const her = hasCompanion(state) ? companionOf(content) : null;
  const worn = id => (id && state.bag[id] ? itemBrief(content, state, itemOf(content, id)) : null);
  const bag = Object.entries(state.bag).map(([id, n]) => {
    const item = itemOf(content, id);
    if (!item) return { id, name: id, n };
    const e = item.effect ?? {};
    const slot = e.wear ? (e.wear === her?.id ? e.wear : null) : ARM_SLOTS.get(item.kind) ?? null;
    return { ...itemBrief(content, state, item), n, ...(slot ? { slot } : {}), ...(e.progress || e.mend || e.learn ? { usable: true } : {}) };
  });
  return {
    slots: GEAR_SLOTS.map(slot => ({ slot, item: worn(state.wear?.[slot]) })),
    ...(her ? { her: { name: nameOf(content, her.id, state.lang), item: worn(state.wear?.[her.id]), bond: bondBrief(content, state) } } : {}),
    fight: { power: wornOf(content, state, 'weapon') || state.treasure ? WEAPON_POWER : 0 },
    ...(Array.isArray(state.deck) ? { picking: true } : {}),
    bag,
    // 牌 — every card he holds, cheapest first, and which ten a fight deals
    // today (deckFor), 银月 always in hand. Roots he lacks are marked, not hid.
    cards: (() => {
      const catalog = cardCatalog(content), ten = new Set(deckFor(content, state)), roots = new Set(state.traits ?? []), picked = new Set(pickedCards(content, state));
      return ownedCards(content, state).map(id => catalog[id]).filter(Boolean)
        .sort((a, b) => a.cost - b.cost || String(a.element ?? '').localeCompare(String(b.element ?? '')))
        .map(c => ({ id: c.id, name: pick(c.name, state.lang), cost: c.cost, kind: c.kind, element: c.element ?? null,
          // Picking, lit is his and a filled card is only marked; else the ten dealt.
          ...(c.id === 'yinyue' ? { hand: true } : Array.isArray(state.deck) ? (picked.has(c.id) ? { deck: true, picked: true } : ten.has(c.id) ? { fill: true } : {}) : ten.has(c.id) ? { deck: true } : {}),
          ...(!usable(c, roots) ? { off_root: true } : {}) }));
    })(),
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

/* ── 斗法 v3: the ten cards a player takes in ──
   Until the skill tree picks a deck, the deck is WHO THEY ARE: the cards of
   their own roots, and the ones no root claims, ten of them in a stable order.
   Deterministic, so the same player takes the same deck into the same fight —
   and so the rules and the page never disagree about what was held. */
/* 组牌 — the ten he picks himself (his, 2026-09-23). state.deck is his pick,
   kept in the order picked; a card no longer usable drops out, and under ten
   the rules fill the rest along the realm's curve as before. */
export function deckFor(content, state) {
  const auto = autoDeck(content, state);
  if (!Array.isArray(state.deck)) return auto;
  const owned = new Set(ownedCards(content, state)), roots = new Set(state.traits ?? []), catalog = cardCatalog(content);
  const picked = [...new Set(state.deck)].filter(id => owned.has(id) && catalog[id] && id !== 'yinyue' && usable(catalog[id], roots)).slice(0, MODES.pve.deck);
  // A card he took out stays out — the fill never puts it back (seen on a
  // copy of his save, 2026-09-23: 土偶 taken out, filled straight back in).
  const out = new Set(state.deck_out ?? []);
  // The fill is dealt along the curve from what is left: not his picks, not
  // what he took out.
  const left = ownedCards(content, state).filter(id => !out.has(id) && !picked.includes(id));
  const fill = autoDeck(content, { ...state, cards: [...left, ...(ownedCards(content, state).includes('yinyue') ? ['yinyue'] : [])] });
  return [...picked, ...fill].slice(0, MODES.pve.deck);
}
const pickedCards = (content, state) => (Array.isArray(state.deck) ? deckFor(content, state).filter(id => state.deck.includes(id)) : []);

export function deck(state, content, ctx, args) {
  const lang = state.lang, action = String(args.action ?? 'toggle');
  const s = clone(state);
  if (action === 'auto') { delete s.deck; delete s.deck_out; return { state: s, result: { ok: true, gear: gearBrief(content, s) } }; }
  if (action !== 'toggle') return refuse('unknown-action', null, { actions: ['toggle', 'auto'] });
  const id = String(args.id ?? ''), c = cardCatalog(content)[id];
  if (!c || !ownedCards(content, state).includes(id)) return refuse('not-held', null);
  if (id === 'yinyue') return refuse('always-in-hand', pick({ zh: '银月开局就在手上，不占这十张。', en: 'Yinyue starts in hand; she is not one of the ten.' }, lang));
  if (!usable(c, new Set(state.traits ?? []))) return refuse('off-root', pick({ zh: '灵根不合，修不得这门功法。', en: 'A spell of a root you lack.' }, lang));
  // The first pick starts from the ten he has been dealt, not from nothing.
  const now = Array.isArray(s.deck) ? pickedCards(content, s) : deckFor(content, s);
  // Lit is his: a lit card taken out stays out (the fill never puts it
  // back); any other card tapped becomes his, room allowing. (A first cut
  // treated a filled card as lit, and a tap meant to keep it threw it out.)
  if (now.includes(id)) {
    s.deck = now.filter(x => x !== id);
    s.deck_out = [...new Set([...(s.deck_out ?? []), id])];
  } else if (now.length >= MODES.pve.deck) return refuse('deck-full', pick({ zh: '十张已满，先取下一张。', en: 'Ten already — take one out first.' }, lang));
  else {
    s.deck = [...now, id];
    s.deck_out = (s.deck_out ?? []).filter(x => x !== id);
  }
  return { state: s, result: { ok: true, gear: gearBrief(content, s) } };
}

function autoDeck(content, state) {
  // Only what has been obtained (his, 2026-09-22) — 得牌 below.
  const owned = new Set(ownedCards(content, state));
  const pool = (content.cards?.cards ?? []).filter(c => !c._token && c.id !== 'yinyue' && owned.has(c.id));
  const roots = new Set(state.traits ?? []);
  // A root decides which 功法 he can cast, not which beast will follow him:
  // 韩立 had no 金 root and raised 噬金虫 all the same (his, 2026-09-22). So a
  // spell of a root he lacks stays out; a 灵兽 of any element comes in.
  const mine = pool.filter(c => usable(c, roots));
  // A DECK, not a pile. The gate measured the difference and it is the whole
  // game: a curve deck won 84% where ten cards drawn at random won 47%
  // (2026-09-18). So the ten are dealt along a curve, and the curve BENDS WITH
  // THE REALM: 练气 caps at six 灵力 and a fight lasts about six rounds, so a
  // five-cost card there is a card that never gets played — the first curve
  // written (Hearthstone's, for a ten-turn game) lost fights the pile had won.
  const CURVES = {
    qi: [1, 1, 1, 2, 2, 2, 3, 3, 4, 4],
    foundation: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
    core: [1, 2, 2, 2, 3, 3, 4, 4, 5, 5],
    nascent: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  };
  const CURVE = CURVES[state.tier] ?? CURVES.qi;
  const byCost = new Map();
  for (const c of shuffle(mine.map(x => x.id), `deck|${state.name ?? ''}`)) {
    const cost = Math.min(6, Math.max(1, pool.find(x => x.id === c).cost));
    byCost.set(cost, [...(byCost.get(cost) ?? []), c]);
  }
  const deck = [];
  for (const rung of CURVE) {
    // the rung asked for, else the nearest one that still has a card left
    for (const cost of [rung, rung - 1, rung + 1, rung - 2, rung + 2, 1, 2, 3, 4, 5, 6]) {
      const row = byCost.get(cost);
      if (row?.length) { deck.push(row.shift()); break; }
    }
  }
  return deck.slice(0, MODES.pve.deck);
}

/* What goes through the door of a fight, and nothing else (design.md § 副本契约):
   the realm, the main root, the ten cards, the beast's own twelve. 银月 rides
   along in hand when she walks with the player. */
const WEAPON_POWER = 1;

/* ── 伤势 — a fight's cost carried out of it ──
   His call, 2026-09-23, from what the gate measured: a fight begun at full
   气血 every time is a fight no turn of which matters, so the real choices were
   never made. Now what a fight takes stays taken: the next one begins where
   this one ended. It mends on the 灵气 clock (full in `refill_hours`), or at
   once with a mending pill; below a quarter nobody walks into a fight. A loss
   leaves nothing — that is its cost now, where before it had none. */
const FIT_TO_FIGHT = 0.25;

/* ── 羁绊 — what walking together grows ──
   His call, 2026-09-23: the player should feel they play WITH her. The bond
   is the rules' record of it: a win beside her, an elite beaten, a realm
   broken, a wound she tended, a gift she wears, a heart-to-heart Ling marks
   once a day. Capped a day, so it is walked, not farmed. Its level makes her
   card stand taller and her tending mend more (rewards.json `bond`). */
const bondOf = content => content.rewards.bond;
function bondLevel(content, n) {
  const levels = bondOf(content).levels;
  return [...levels].reverse().find(l => n >= l.at) ?? levels[0];
}
function bondBrief(content, state) {
  const n = state.bond?.n ?? 0, lang = state.lang, levels = bondOf(content).levels;
  const level = bondLevel(content, n), next = levels.find(l => l.at > n);
  return { n, level: level.id, name: pick(level.name, lang), ...(next ? { next: next.at, next_name: pick(next.name, lang) } : {}) };
}
/* Grow it by a kind of shared moment; returns what changed, or null. */
function gainBond(content, s, kind, now, key = null) {
  if (!hasCompanion(s)) return null;
  const cfg = bondOf(content), day = dayKey(now);
  s.bond ??= { n: 0 };
  if (key && (s.bond.keys ?? []).includes(key)) return null;
  const today = s.bond.day === day ? s.bond.today ?? 0 : 0;
  const add = Math.min(cfg.gains[kind] ?? 0, cfg.day_cap - today);
  if (add <= 0) return null;
  const before = bondLevel(content, s.bond.n);
  s.bond = { ...s.bond, n: s.bond.n + add, day, today: today + add, ...(key ? { keys: [...(s.bond.keys ?? []), key] } : {}) };
  const after = bondLevel(content, s.bond.n);
  return { kind, gained: add, ...bondBrief(content, s), ...(after.id !== before.id ? { rose: pick(after.name, s.lang) } : {}) };
}
/* Her card, as the bond and what she wears lift it — locked at the door
   with the rest. 齐纨 +1 气血 (his, 2026-09-23: 银月的佩戴都没啥用 — we cannot
   change how she looks, so a number). 银月铃 lifts her 疗伤 instead: a heal
   +1 in the fight measured nothing, and +1 攻 over 同心 failed the gate. */
const bondLifts = (content, state) => {
  if (!hasCompanion(state)) return null;
  const lift = bondLevel(content, state.bond?.n ?? 0).lift ?? {};
  const her = companionOf(content)?.id, worn = her ? wornOf(content, state, her)?.effect?.lift ?? {} : {};
  const sum = { atk: (lift.atk ?? 0) + (worn.atk ?? 0), hp: (lift.hp ?? 0) + (worn.hp ?? 0) };
  return sum.atk || sum.hp ? { yinyue: sum } : null;
};

/* 疗伤 — she tends the wound, once a day, by the bond. A page tap. */
export function tend(state, content, ctx) {
  const lang = state.lang;
  if (!hasCompanion(state)) return refuse('no-companion', null);
  if (herAway(state, ctx.now)) return refuse('away', pick({ zh: '她出门历练去了。', en: 'She is out on her journey.' }, state.lang));
  const n = woundsNow(content, state, ctx.now);
  if (!n) return refuse('not-hurt', pick({ zh: '身上没伤。', en: 'You are not hurt.' }, lang));
  const day = dayKey(ctx.now);
  if (state.tended === day) return refuse('tended-today', pick({ zh: '今日她已替你调理过了。', en: 'She has already tended you today.' }, lang));
  const s = clone(state);
  // 银月铃 on her: its sound settles the breath, and she mends a tenth more.
  const her = companionOf(content)?.id;
  const share = bondLevel(content, s.bond?.n ?? 0).tend + (her ? wornOf(content, s, her)?.effect?.lift?.tend ?? 0 : 0);
  const mended = Math.min(n, Math.ceil(hpMaxOf(s) * share));
  s.wounds = n - mended ? { n: n - mended, at: ctx.now.toISOString() } : undefined;
  if (!s.wounds) delete s.wounds;
  s.tended = day;
  const bond = gainBond(content, s, 'tend', ctx.now);
  return { state: s, result: { ok: true, mended, health: healthBrief(content, s, ctx.now), ...(bond ? { bond } : {}) } };
}

/* 谈心 — Ling marks a real exchange with her, once a day (the talk gain). */
export function bond(state, content, ctx) {
  if (!hasCompanion(state)) return refuse('no-companion', null);
  if (state.bond?.talked === dayKey(ctx.now)) return refuse('talked-today', null);
  const s = clone(state);
  const got = gainBond(content, s, 'talk', ctx.now);
  s.bond = { ...(s.bond ?? { n: 0 }), talked: dayKey(ctx.now) };
  return { state: s, result: { ok: true, bond: got ?? bondBrief(content, s), ...(got ? {} : { capped: true }) } };
}
export const hpMaxOf = state => Math.round((CARD_REALMS[state.tier] ?? CARD_REALMS.qi).hp + (state.step ?? 0) * 0.5);
function woundsNow(content, state, now) {
  const w = state.wounds;
  if (!w?.n) return 0;
  const hours = Math.max(0, (now - new Date(w.at)) / 3600000);
  const mended = Math.floor((hpMaxOf(state) * hours) / content.rewards.stamina.refill_hours);
  return Math.max(0, w.n - mended);
}
/* When the wounds will have mended to `left` or fewer. */
function mendsBy(content, state, now, left) {
  const n = woundsNow(content, state, now);
  if (n <= left) return now;
  const perHour = hpMaxOf(state) / content.rewards.stamina.refill_hours;
  return new Date(now.getTime() + Math.ceil(((n - left) / perHour) * 3600000));
}
function healthBrief(content, state, now) {
  const max = hpMaxOf(state), n = woundsNow(content, state, now);
  return { now: max - n, max, ...(n ? { full_at: mendsBy(content, state, now, 0).toISOString() } : {}) };
}
const fitToFight = (content, state, now) => hpMaxOf(state) - woundsNow(content, state, now) >= Math.ceil(hpMaxOf(state) * FIT_TO_FIGHT);

/* The fight open on the save, when it is THIS one (`game` its id) — a door
   left open on another creature holds nothing for this fight. */
const openFight = (state, game) => (game && state.fight?.game === game ? state.fight : null);

/* Everything a fight is given at the door. Once the door is open it is the
   save's (`state.fight.setup`), not the hour's: a 谈心 that crosses a bond
   threshold, a 问斗法 cast, a scroll learned or an hour of mending between
   the page's play and the settle must not replay the fight against other
   numbers — a different result, or a legal turn refused. A save whose fight
   was opened before the setup was kept falls back to the live reading, with
   its wounds still the door's. */
export function fightSetup(content, state, creature, now, game = null) {
  const open = openFight(state, game);
  if (open?.setup) return open.setup;
  const fortune = now ? boutFortune(content, state, now) : null;
  const boost = fortune?.card ? { element: fortune.root, n: fortune.card } : null;
  const main = state.fate?.element?.id ?? state.fate?.element ?? (state.traits ?? [])[0] ?? 'wood';
  // Out on a 历练, she is not at his side (§ 历练).
  const withHer = ownedCards(content, state).includes('yinyue') && !herAway(state, now ?? new Date());
  return {
    mode: 'pve',
    seed: duelSeed(state, creature, now),
    you: {
      tier: state.tier, step: state.step ?? 0, root: main, deck: deckFor(content, state), extra: withHer ? ['yinyue'] : [],
      // Locked at the door with the rest: the page and the settle replay the
      // same fight even if an hour of mending passes between them.
      wounds: open?.wounds ?? (now ? woundsNow(content, state, now) : 0),
      ...(withHer && bondLifts(content, state) ? { lifts: bondLifts(content, state) } : {}),
      // 望气术: how much of the beast's plan he can read (items `learn`).
      ...(state.insight ? { insight: state.insight } : {}),
      // 法器 stay in the world as gear and give 主灵根一击 +1 (design.md § 斗法
      // v3 牌型) — the sword on the belt, or the 本命法宝 it became.
      ...(wornOf(content, state, 'weapon') || state.treasure ? { power: WEAPON_POWER } : {}),
      // 问斗法: the lower trigram's element, its 功法 lifted or lowered today.
      ...(boost ? { boost } : {}),
    },
    foe: { tier: state.tier, root: creature.root, deck: creature.deck ?? [], ...(creature.signature ? { signature: creature.signature } : {}), ...(creature.elite ? { elite: true } : {}) },
  };
}

const cardCatalog = content => Object.fromEntries((content.cards?.cards ?? []).map(c => [c.id, c]));

/* ── 得牌: a player fights only with the cards they have obtained ──
   His rule, 2026-09-22: 用户只能使用已经获得的牌, 包括银月, 法术, 武器等. Roots
   used to hand out every card of their element — so 精卫, never met, sat in
   his ten while the 夫诸 and 狍鸮 that walk with him did not. Now `state.cards`
   is what he holds: the starter at the root test, 银月 when she joins, a beast
   when it joins, a card from each win, and whatever a grant names. A save
   from before is read as what it would hold (`ownedAtStart`) until the first
   card is gained, and then that is written down. 法器 are worn, not held —
   the sword was always the one on the belt. */
const isBeastCard = (content, id) => Boolean(creatureOf(content, id));
/* A 功法 wants its root; a 灵兽 of any element answers anyone who holds it. */
const usable = (c, roots) => c.kind !== 'spell' || !c.element || roots.has(c.element);
const starterOf = (content, traits) => {
  const catalog = cardCatalog(content), roots = new Set(traits ?? []);
  return (content.cards?.starter ?? []).filter(id => catalog[id] && (!catalog[id].element || roots.has(catalog[id].element)));
};
function ownedAtStart(content, state) {
  const catalog = cardCatalog(content);
  if (!state.traits?.length) return [];
  return [...new Set([
    ...starterOf(content, state.traits),
    ...(hasCompanion(state) && catalog.yinyue ? ['yinyue'] : []),
    ...(state.cast ?? []).filter(id => catalog[id]),
  ])];
}
export const ownedCards = (content, state) => state.cards ?? ownedAtStart(content, state);

/* One card into the hand he keeps; null when it is unknown or already his. */
function gainCard(content, state, id) {
  const card = cardCatalog(content)[id];
  if (!card || card._token) return null;
  const owned = ownedCards(content, state);
  if (owned.includes(id)) { state.cards = owned; return null; }
  state.cards = [...owned, id];
  return { id, name: pick(card.name, state.lang), card: true };
}

/* What a win leaves in the hand: one card not yet his that he can use — a
   灵兽 of any element, a 功法 only of his roots (one he could never cast is no
   gift) — the beast's own element first.
   Never a 山海经 beast — those come only by taming. Stable by the day, the
   beast and the 道号, like everything else a fight deals. */
function winCard(content, state, creature, now, nth = 0) {
  const owned = new Set(ownedCards(content, state)), roots = new Set(state.traits ?? []);
  const open = (content.cards?.cards ?? []).filter(c => !c._token && c.id !== 'yinyue' && !isBeastCard(content, c.id)
    && !owned.has(c.id) && usable(c, roots));
  const own = open.filter(c => c.element === creature.root);
  const pool = own.length ? own : open;
  if (!pool.length) return null;
  return gainCard(content, state, pool[hashOf(`${dayKey(now)}|${creature.id}|${state.name ?? ''}|card${nth ? `|${nth}` : ''}`) % pool.length].id);
}

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
    id: game.id,
    creature: {
      id: creature.id, name: pick(creature.name, lang),
      ...(lang === 'zh' && creature.pinyin ? { pinyin: creature.pinyin } : {}),
      root: creature.root, root_name: pick(content.traits.elements[creature.root], lang),
      lean: creature.lean, art: creature.art ?? null, about: pick(creature.about, lang),
      ...(creature.elite ? { elite: true } : {}),
    },
    health: healthBrief(content, state, now),
    // Everything the fight is given at the door, and nothing else.
    setup: fightSetup(content, state, creature, now, game.id),
    today: open ? { outcome: open.outcome } : null,
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
  // A board an errand reopened stands offered again, whatever it was.
  const again = new Set((content.tasks?.tasks ?? []).map(t => t.id).filter(id => reopened(content, state, id, ctx.now)));
  const held = Object.fromEntries([...again].map(id => [id, { status: 'offered' }]));
  const tasks = Object.entries({ ...state.tasks, ...held })
    .filter(([, t]) => t.status !== 'done' || (t.done_at ? dayKey(new Date(t.done_at)) === today : false))
    .map(([id, t]) => {
      const task = taskOf(content, id);
      return {
        id, title: pick(task.title, lang), kind: task.kind, status: t.status,
        won: Boolean(state.wins?.[id]),
        paid: t.status === 'done', period: t.period ?? task.period ?? null, // done = paid, once or per period
        ...(again.has(id) ? { for_errand: true } : {}),
        done_at: t.done_at ?? null,
        // what it asks and what it pays, so Ling can tell the practice
        asks: task.kind === 'board' ? (lang === 'zh' ? '在炉前把八味灵草两两配齐' : 'Pair the eight spirit herbs on the furnace board') : null,
        // reopened for an errand, the errand pays — not the task again
        pays: again.has(id) ? null : task.grant?.progress ?? null, gives: !again.has(id) && task.gives?.bag ? pick(itemOf(content, task.gives.bag)?.name, lang) : null,
      };
    });
  const quests = (ctx.quests ?? []).filter(q => q.due || questDone(q, ctx.now)).map(q => ({
    id: q.id, app: q.app, title: pick(q.title, lang),
    done: questDone(q, ctx.now), paid: state.chores[q.id]?.period === periodKey(q.period, ctx.now),
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
  const brief = {
    ok: true, lang, name: state.name, ...(state.lang_set ? { lang_set: true } : {}),
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
    // A fight open on the scene: while this is here Ling advances nothing.
    ...(state.fight ? { fight: { open: true, game: state.fight.game, creature: pick(creatureOf(content, state.fight.creature)?.name, state.lang) } } : {}),
    cast: state.cast.map(id => ({ id, name: pick(creatureOf(content, id).name, lang) })),
    chapter: { id: chapter.id, title: pick(chapter.title, lang) },
    scene: atScene(content, state) ? sceneBrief(content, state, ctx.now) : null,
    waypoint: waypointOf(content, state, ctx),
    place: placeBrief(content, state, ctx.now),
    director: directorBrief(content, state, ctx),
    companion: hasCompanion(state) ? { id: companionOf(content).id, name: nameOf(content, companionOf(content).id, lang), joined: state.companion.joined, bond: bondBrief(content, state), ...(state.tended === dayKey(ctx.now) ? { tended: true } : {}), ...(journeyBrief(content, state, ctx.now) ? { journey: journeyBrief(content, state, ctx.now) } : {}), ...(state.journey?.day === dayKey(ctx.now) ? { journeyed: true } : {}) } : null,
    quest: questBrief(content, state, ctx.now),
    // 差事: what is in hand, and what may be taken where he stands.
    book: bookOf(content, state, lang, ctx),
    // 所得: errands that handed themselves in here, until he walks on.
    ...(handedHere(content, state).length ? { handed: handedHere(content, state) } : {}),
    // 机缘: where, and how long it lasts — the page counts it down.
    ...(chanceBrief(content, state, ctx.now) ? { chance: chanceBrief(content, state, ctx.now) } : {}),
    // Where an errand may be taken, when the book has room — so 「what now」 has an answer.
    ...(workOf(content, state, ctx) ? { work: workOf(content, state, ctx) } : {}),
    ...(offersOf(content, state, lang, ctx.now).length ? { offers: offersOf(content, state, lang, ctx.now) } : {}),
    ended: state.ended, branch: liveBranch(state, ctx.now), story: state.story,
    divination: divinationBrief(content, state, ctx.now),
    fate: fateBrief(content, state),
    stamina: staminaBrief(content, state, ctx.now),
    health: healthBrief(content, state, ctx.now),
    made: { at: state.made?.at ?? null, scenes: Object.keys(state.made?.scenes ?? {}) },
    words: wordsOf(content, lang),
    ...tasksBrief(content, state, ctx),
  };
  return { ...onStage(content, state, ctx, {}, brief), ...brief };
}

/* The stage and the question, decided together and never twice (his law,
   2026-09-18: a widget may stand in the chat or on the stage, both sides are
   told, and only one of them shows it).

   `stage` is what Ling can SEE standing there — short strings, `kind` or
   `kind:id`, because her context is not a place to put a card list in (his
   「don't blow ling's context up」). She needs nothing more: the question she
   is handed has already had the stage's own actions taken out of it, so she
   cannot offer one by accident, and the page draws the same list from the same
   reading. */
function onStage(content, state, ctx, result = {}, brief = null) {
  const view = brief ?? look(state, content, ctx);
  const cards = stageCards(view, { focus: shownHere(content, state, view), fight: Boolean(state.fight) });
  const ask = askMinusStage(askOf(content, state, ctx, result), stageOwns(view, cards));
  return { then: thenFor(result, ask), ask, stage: cards };
}

/* What Ling last showed, while she is still in the place she showed it — else
   the cards this scene or place was authored with, so a creature is pictured
   even when she forgets to Show it. Walking away clears the stage by itself. */
function shownHere(content, state, view) {
  if (state.shown?.length && state.shown_at === stageAt(content, state)) {
    // A shelf Ling showed is the shelf as it is NOW — a list kept in the save
    // missed every ware added since (seen 2026-09-23: 回春丹 and 望气术 absent
    // from 彭城's card on his save while the shelf itself held them).
    const live = (view.place?.show ?? []).find(c => c.card === 'item');
    return live ? state.shown.map(c => (c.card === 'item' ? live : c)) : state.shown;
  }
  return view.scene?.show ?? view.place?.show ?? [];
}

/* Where the stage stands: the scene being played, else the place. One
   expression, read by the Show that writes it and the Look that reads it —
   two spellings of this is how the cards went missing the first time. */
const stageAt = (content, state) => (atScene(content, state) ? sceneOf(content, state).id : state.place ? `place:${state.place}` : null);

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
  const chance = dealChance(content, s, ctx);
  if (chance) s.chance = chance;
  return called || chance || (s.scene && !state.scene) ? s : null;
}

/* ── 机缘 — something good, somewhere near, for a few hours of the real day ──
   His pick, 2026-09-23 (觅长生's 过时不候, Lifeline's real clock): once a day,
   the first time the game is opened, the rules set a 机缘 at a place within
   two roads — open, within his realm, not where he stands — for `hours` of
   real time. Reach it in time and it is his: a card he does not hold and the
   chance table's pay. Miss it and it is gone. Never in a made world or before
   the roots are set. */
const CHANCE = { hours: 3, reach: 2 };
/* The places within `reach` roads of where he stands that he may go: open,
   within his realm, never here. */
function nearPlaces(content, s, now, reach) {
  const here = placeOf(content, s.place);
  if (!here) return [];
  const seen = new Set([here.id]);
  let ring = [here];
  const near = [];
  for (let step = 0; step < reach; step += 1) {
    ring = ring.flatMap(p => p.roads ?? []).map(id => placeOf(content, id)).filter(p => p && !seen.has(p.id));
    for (const p of ring) seen.add(p.id);
    near.push(...ring.filter(p => !tooHard(content, s, p) && provinceOpen(content, p.province, now)));
  }
  return near;
}

/* ── 历练 — 银月 goes out on her own, for real hours ──
   His call, 2026-09-23 (Lifeline's clock, the companion's own life): sent
   from the 装备 card for 2, 4 or 8 hours to a place the rules pick within
   three roads, once a day. While she is out she does not fight beside him,
   tend him, or steady his hand in a 抉择 — that is the price. Back, she
   brings what that province's roads give (its finds; more the longer) and,
   after eight hours, a card; the page hands her the journey and she tells it
   herself. Called back early, she brings nothing. */
const JOURNEY = { hours: [2, 4, 8], reach: 3, finds: { 2: 1, 4: 2, 8: 3 }, wealth: { 2: 5, 4: 10, 8: 20 } };
const herAway = (state, now) => Boolean(state.journey && !state.journey.received && now < new Date(state.journey.until));
const herBack = (state, now) => Boolean(state.journey && !state.journey.received && now >= new Date(state.journey.until));
function journeyBrief(content, state, now) {
  const j = state.journey;
  if (!j || j.received) return null;
  const at = placeOf(content, j.place), lang = state.lang;
  const place = { id: j.place, name: pick(at?.name, lang) };
  if (herBack(state, now)) return { place, hours: j.hours, back: true };
  return { place, hours: j.hours, until: j.until, minutes_left: Math.ceil((new Date(j.until) - now) / 60000) };
}
/* ── 问候 — the day's first opening is hers ──
   His pick, 2026-09-23: 银月 greets the player the first time the game is
   opened each day, from what the save knows of yesterday and today; the page
   hands her these facts and she speaks. Marked once a day (state.greeted);
   never before she walks with him. Facts, in the player's language — never
   sentences for the player: she writes the words. */
export function greet(state, content, ctx) {
  if (!hasCompanion(state)) return refuse('no-companion', null);
  const day = dayKey(ctx.now);
  if (state.greeted === day) return { state: null, result: { ok: true, first: false } };
  const s = clone(state), zh = state.lang !== 'en', facts = [];
  const yesterday = dayKey(new Date(ctx.now.getTime() - 86400000));
  // How long since she last saw him, so she never says 许久不见 to yesterday's
  // player (her first reading on his save, 2026-09-23). The last day greeted,
  // else the save's last write.
  const last = state.greeted ?? (state.updated ? dayKey(new Date(state.updated)) : null);
  if (last) {
    const days = Math.round((new Date(`${day}T12:00:00`) - new Date(`${last}T12:00:00`)) / 86400000);
    if (days >= 1) facts.push(zh ? `他上次来是${days === 1 ? '昨天' : `${days} 天前`}` : `he was last here ${days === 1 ? 'yesterday' : `${days} days ago`}`);
  }
  for (const [id, d] of Object.entries(state.duels ?? {})) {
    if (d.day !== yesterday || d.outcome === 'open') continue;
    const name = pick(creatureOf(content, id)?.name, state.lang);
    const how = { won: zh ? '赢了' : 'won against', lost: zh ? '输给了' : 'lost to', withdrew: zh ? '没打完，它遁走了：' : 'was left unfinished by' }[d.outcome];
    facts.push(zh ? `昨天${how}${name}` : `yesterday he ${how} ${name}`);
  }
  const h = healthBrief(content, state, ctx.now);
  if (h.now < h.max) facts.push(zh ? `身上还带着伤，气血 ${h.now}/${h.max}` : `still hurt, Life ${h.now}/${h.max}`);
  const c = chanceBrief(content, state, ctx.now);
  if (c && !c.taken && !c.missed) facts.push(zh ? `今天${c.place.name}有一份机缘` : `a chance waits at ${c.place.name} today`);
  const j = journeyBrief(content, state, ctx.now);
  if (j?.back) facts.push(zh ? `你（银月）从${j.place.name}历练回来了，东西还没交给他` : `you are back from ${j.place.name}, with things not yet handed over`);
  else if (j) facts.push(zh ? `你（银月）还在${j.place.name}历练` : `you are still out at ${j.place.name}`);
  const b = bondBrief(content, state);
  facts.push(zh ? `你们的羁绊：${b.name}` : `your bond: ${b.name}`);
  facts.push(zh ? `他如今是${stepName(content, state.tier, state.step, state.lang)}` : `he stands at ${stepName(content, state.tier, state.step, state.lang)}`);
  s.greeted = day;
  return { state: s, result: { ok: true, first: true, name: state.name ?? null, facts } };
}

/* What she picked up on the road, `n` of them, into the bag (stones are
   counted by the caller). */
function journeyFinds(content, s, j, at, n) {
  const book = content.meets?.finds?.[at?.province]?.length ? content.meets.finds[at.province] : content.meets?.finds?.['*'] ?? [];
  const brought = [];
  for (let i = 0; i < n && book.length; i += 1) {
    const f = book[hashOf(`${j.day}|${j.place}|${s.name ?? ''}|brought|${i}`) % book.length];
    if (f.item && itemOf(content, f.item)) { s.bag[f.item] = (s.bag[f.item] ?? 0) + 1; brought.push({ id: f.item, name: pick(itemOf(content, f.item).name, s.lang), line: pick(f.line, s.lang) }); }
    else if (f.wealth) brought.push({ wealth: f.wealth, line: pick(f.line, s.lang) });
  }
  return brought;
}

export function journey(state, content, ctx, args) {
  const lang = state.lang, action = String(args.action ?? '');
  if (!hasCompanion(state)) return refuse('no-companion', null);
  const s = clone(state), day = dayKey(ctx.now);
  if (action === 'send') {
    const hours = Number(args.hours);
    if (!JOURNEY.hours.includes(hours)) return refuse('bad-hours', null, { hours: JOURNEY.hours });
    if (state.journey && !state.journey.received) return refuse('already-out', null, { journey: journeyBrief(content, state, ctx.now) });
    if (state.journey?.day === day) return refuse('once-a-day', pick({ zh: '她今日已出过门了。', en: 'She has been out once today.' }, lang));
    if (state.fight) return refuse('in-a-fight', null);
    const near = nearPlaces(content, s, ctx.now, JOURNEY.reach);
    if (!near.length) return refuse('nowhere', null);
    const to = near[hashOf(`${day}|${s.name ?? ''}|journey|${hours}`) % near.length];
    s.journey = { day, place: to.id, hours, from: ctx.now.toISOString(), until: new Date(ctx.now.getTime() + hours * 3600000).toISOString() };
    return { state: s, result: { ok: true, sent: journeyBrief(content, s, ctx.now) } };
  }
  if (!state.journey || state.journey.received) return refuse('not-out', null);
  if (action === 'recall') {
    if (!herAway(state, ctx.now)) return refuse('already-back', null);
    s.journey = { ...s.journey, received: ctx.now.toISOString(), recalled: true };
    // Called back, she brings a small part of it (his, 2026-09-23: small
    // portion): stones at half the rate for the time she was out, one find
    // once she was out half the way, never the card or the bond — waiting
    // always pays better. And she tells it (facts; she writes the words).
    const j = state.journey, at = placeOf(content, j.place);
    const out = Math.max(0, Math.round((ctx.now - new Date(j.from)) / 60000));
    const share = Math.min(1, out / (j.hours * 60));
    const brought = share >= 0.5 ? journeyFinds(content, s, j, at, 1) : [];
    const wealth = Math.floor((JOURNEY.wealth[j.hours] ?? 0) * share / 2) + brought.reduce((n, b) => n + (b.wealth ?? 0), 0);
    s.wealth += wealth;
    return { state: s, result: { ok: true, recalled: true, place: { id: j.place, name: pick(at?.name, lang) }, hours: j.hours, out_min: out, brought, wealth } };
  }
  if (action === 'receive') {
    if (!herBack(state, ctx.now)) return refuse('still-out', null, { journey: journeyBrief(content, state, ctx.now) });
    const j = state.journey, at = placeOf(content, j.place);
    const brought = journeyFinds(content, s, j, at, JOURNEY.finds[j.hours] ?? 1);
    const wealth = (JOURNEY.wealth[j.hours] ?? 0) + brought.reduce((n, b) => n + (b.wealth ?? 0), 0);
    s.wealth += wealth;
    const card = j.hours >= 8 ? winCard(content, s, { id: `journey:${j.place}`, root: at?.province ? (s.traits ?? [])[0] : null }, ctx.now, 'journey') : null;
    s.journey = { ...s.journey, received: ctx.now.toISOString() };
    const bond = gainBond(content, s, 'journey', ctx.now);
    return { state: s, result: { ok: true, place: { id: j.place, name: pick(at?.name, lang) }, hours: j.hours, brought, wealth, ...(card ? { card } : {}), ...(bond ? { bond } : {}) } };
  }
  return refuse('unknown-action', null, { actions: ['send', 'recall', 'receive'] });
}
function dealChance(content, s, ctx) {
  const day = dayKey(ctx.now);
  if (s.chance?.day === day || !s.traits?.length || inMade(s) || !content.rewards.tables.chance) return null;
  const near = nearPlaces(content, s, ctx.now, CHANCE.reach);
  if (!near.length) return null;
  const at = near[hashOf(`${day}|${s.name ?? ''}|chance`) % near.length];
  return { day, place: at.id, until: new Date(ctx.now.getTime() + CHANCE.hours * 3600000).toISOString() };
}
const chanceLive = (state, now) => state.chance && !state.chance.taken && dayKey(now) === state.chance.day && now < new Date(state.chance.until);
function chanceBrief(content, state, now) {
  const c = state.chance;
  if (!c || c.day !== dayKey(now)) return null;
  const at = placeOf(content, c.place);
  if (c.taken) return { place: { id: c.place, name: pick(at?.name, state.lang) }, taken: true };
  if (now >= new Date(c.until)) return { place: { id: c.place, name: pick(at?.name, state.lang) }, missed: true };
  return { place: { id: c.place, name: pick(at?.name, state.lang) }, until: c.until, minutes_left: Math.ceil((new Date(c.until) - now) / 60000), ...(state.place === c.place ? { here: true } : {}) };
}

/* 收下 the 机缘 — a page tap, where it lies, while it lasts. */
export function chance(state, content, ctx, args) {
  const lang = state.lang;
  if (String(args.action ?? 'take') !== 'take') return refuse('unknown-action', null, { actions: ['take'] });
  if (!state.chance || state.chance.day !== dayKey(ctx.now)) return refuse('no-chance', null);
  if (state.chance.taken) return refuse('taken', null);
  if (!chanceLive(state, ctx.now)) return refuse('missed', pick({ zh: '来迟了，机缘已散。', en: 'Too late — it is gone.' }, lang));
  if (state.place !== state.chance.place) return refuse('not-here', null, { chance: chanceBrief(content, state, ctx.now) });
  const s = clone(state);
  s.chance = { ...s.chance, taken: ctx.now.toISOString() };
  const t = content.rewards.tables.chance;
  const card = winCard(content, s, { id: `chance:${s.chance.place}`, root: (s.traits ?? [])[0] }, ctx.now, 'chance');
  const paid = pay(content, s, ctx, { table: 'chance', progress: t.progress, wealth: t.wealth });
  return { state: s, result: { ok: true, took: true, ...(card ? { card } : {}), paid } };
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
   progress, and the tier's `pay` scales what is finally added, so a task high
   on the ladder pays like one. No day cap: 灵气 alone limits a day's play (his,
   2026-09-23: 去掉吧，只用体力限制). The 240/60 caps came 2026-09-11, before
   灵气 existed, and after it was kept as a safety net nobody re-decided —
   invisible, it turned his last errand and a pill into +0 with 灵气 to spare.
   `state.day` still counts what the day paid. */
function pay(content, state, ctx, grant) {
  rollDay(state, ctx.now);
  const table = content.rewards.tables[grant.table];
  // The day's cast, when it was asked about this: its grade speeds or slows the gain.
  const pf = fortuneOf(content, state, ctx.now, 'cultivation')?.progress ?? 1;
  const wf = fortuneOf(content, state, ctx.now, 'wealth')?.wealth ?? 1;
  const want = Math.round(Math.min(grant.progress ?? 0, table.progress) * speedOf(content, state) * pf);
  const base = Math.max(0, want);
  const progress = base * payOf(content, state);
  const wealth = Math.max(0, Math.round(Math.min(grant.wealth ?? 0, table.wealth) * wf));
  state.day.progress += base; state.day.wealth += wealth; state.wealth += wealth;
  const { levels, hold } = addProgress(content, state, progress);
  const risen = levels.length ? gainBond(content, state, 'rise', ctx.now) : null;
  if (grant.cast && !state.cast.includes(grant.cast)) state.cast.push(grant.cast);
  // A beast that joins brings its card; a grant may name one outright.
  const cards = [grant.cast, grant.card].map(id => (id ? gainCard(content, state, id) : null)).filter(Boolean);
  if (grant.item) state.bag[grant.item] = (state.bag[grant.item] ?? 0) + 1;
  // An art is taught by a person, in a scene — never by the beast itself.
  const learned = grant.art ? learn(content, state, grant.art) : null;
  const named = levels.map(l => ({ from: stepName(content, l.from.tier, l.from.step, state.lang), to: stepName(content, l.to.tier, l.to.step, state.lang) }));
  // `progress` is what the realm really took; at the peak the rest is held.
  const fortune = (pf !== 1 && grant.progress) || (wf !== 1 && grant.wealth) ? { progress: pf, wealth: wf } : null;
  return { progress: progress - (hold?.held ?? 0), wealth, cast: grant.cast ?? null, item: grant.item ?? null, levels: named, hold, ...(cards.length ? { cards } : {}), ...(learned ? { learned } : {}), ...(fortune ? { fortune } : {}), ...(risen ? { bond: risen } : {}) };
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
const CHAPTER_COSTS = new Set(['step', 'duel', 'elite', 'move']);
const freeHere = (content, s, kind) => CHAPTER_COSTS.has(kind) && !inMade(s)
  && Boolean(content.chapters[s.chapter]?.free) && !s.ended.includes(s.chapter);

/* 体力 is the only limit on a day's play (his, 2026-09-23): moving costs by
   the road, a fight, a 奇遇, a story step, a choice and a taming cost; taps
   that take no time — the market, errands, 炼丹, 起卦, 疗伤, 历练 — cost
   nothing. rewards.json § stamina.cost holds the numbers. `n` is how many. */
function spendStamina(content, s, ctx, kind, n = 1) {
  if (freeHere(content, s, kind)) return null;
  // A dire cast asked about cultivation: each story step waits its rest.
  const rest = kind === 'step' ? fortuneOf(content, s, ctx.now, 'cultivation')?.rest_seconds : null;
  const since = rest && s.last_step_at ? new Date(new Date(s.last_step_at).getTime() + rest * 1000) : null;
  if (since && since > ctx.now) return refuse('resting', null, { returns_at: since.toISOString() });
  settleStamina(content, s, ctx.now);
  const cost = (content.rewards.stamina.cost[kind] ?? 0) * n;
  if (s.stamina >= cost) { s.stamina -= cost; if (kind === 'step') s.last_step_at = ctx.now.toISOString(); return null; }
  const at = staminaReturnsAt(content, s, cost);
  const w = wordsOf(content, s.lang);
  const say = s.lang === 'zh'
    ? `${w.pool}已空，先歇一歇。${hourOf(at, 'zh')} 再来。`
    : `Your ${w.pool.toLowerCase()} is spent — go and rest. Come back at ${hourOf(at, 'en')}.`;
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
  if (exit.set?.traits === 'v1') {
    s.traits = [...content.traits.v1];
    // The root test hands over the starter — the first cards he holds.
    s.cards = [...new Set([...(s.cards ?? []), ...starterOf(content, s.traits)])];
  }
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

/* An errand held and not yet met that asks for a win on this board. It
   reopens a board already done: 云龙山的八味 asks a pill of alchemy-first,
   done once in the story, so the furnace never came back and the errand
   could not be met (his, 2026-09-23: 我已经到这里了, 没触发差事). */
function errandWants(content, state, id) {
  return Object.keys(state.quests ?? {}).some(qid => {
    if (questDoneBefore(state, qid)) return false;
    const q = questOf(content, qid);
    return q ? countsOf(content, state, q).some(n => n.kind === 'board' && n.task === id && !n.done) : false;
  });
}

/* Done before, and open now only for an errand — it pays the errand, not
   the task a second time. */
function reopened(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  const spent = held?.status === 'done' && (t?.period === 'once' || held.period === periodKey(t?.period, now));
  return Boolean(t) && (!held || spent) && errandWants(content, state, id);
}

/* Offered, and not yet done this period — or wanted by an errand. */
function taskOpen(content, state, id, now) {
  const t = taskOf(content, id), held = state.tasks[id];
  if (!t) return false;
  if (reopened(content, state, id, now)) return true;
  if (!held) return false;
  return !(held.status === 'done' && (t.period === 'once' || held.period === periodKey(t.period, now)));
}

function taskDone(state, content, ctx, id) {
  const t = taskOf(content, id);
  if (!t) return refuse('unknown-task', null);
  const again = reopened(content, state, id, ctx.now);
  if (!state.tasks[id] && !again) return refuse('not-offered', null);
  if (!taskOpen(content, state, id, ctx.now)) return refuse('already-done', null);
  if (!state.wins?.[id]) return refuse('not-won', null);
  const s = clone(state);
  delete s.wins[id];
  if (again) {
    const handed = advance(content, s, { kind: 'board', task: id }, ctx);
    return { state: s, result: { ok: true, done: id, paid: null, gives: null, for: 'errand', ...(handed.length ? { handed } : {}) } };
  }
  s.tasks[id] = { status: 'done', period: periodKey(t.period, ctx.now), done_at: ctx.now.toISOString() };
  if (t.gives?.bag) s.bag[t.gives.bag] = (s.bag[t.gives.bag] ?? 0) + 1;
  const paid = pay(content, s, ctx, t.grant);
  const handed = advance(content, s, { kind: 'board', task: id }, ctx);
  return { state: s, result: { ok: true, done: id, paid, gives: t.gives ?? null, line: pick(t.done_line, s.lang), ...(handed.length ? { handed } : {}) } };
}

function questCheck(state, content, ctx, id) {
  const q = (ctx.quests ?? []).find(x => x.id === id);
  if (!q) return refuse('unknown-quest', null);
  const period = periodKey(q.period, ctx.now);
  if (state.chores[id]?.period === period) return refuse('already-paid', null);
  if (!questDone(q, ctx.now)) return refuse('not-done', null, { app: q.app });
  const s = clone(state);
  s.chores[id] = { period, paid_at: ctx.now.toISOString() };
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

  // ── 出手: the door of the instance ──
  if (!args.picks) {
    if (today?.day === day && today.outcome === 'lost') return refuse('withdrawn', withdrawnLine, { game: id });
    if (today?.day === day && today.outcome === 'withdrew') return refuse('spent-today', null, { game: id });
    if (haunt && today?.day === day && today.outcome === 'won') return refuse('subdued-today', null, { game: id });
    if (!s.traits?.length) return refuse('no-traits', null);
    // A page reloaded mid-fight asks again: the same fight comes back, and the
    // day's 灵气 is not taken twice. The seed is the day's, so the cards deal
    // the same way they did.
    const resuming = s.fight?.game === id && today?.day === day && today.outcome === 'open';
    if (!resuming && !fitToFight(content, s, ctx.now)) {
      const at = mendsBy(content, s, ctx.now, hpMaxOf(s) - Math.ceil(hpMaxOf(s) * FIT_TO_FIGHT));
      return refuse('wounded', pick({ zh: `伤还重，${hourOf(at, 'zh')} 再来 —— 或者服一粒丹。`, en: `Too hurt to fight. Come back at ${hourOf(at, 'en')} — or take a pill.` }, state.lang), { health: healthBrief(content, s, ctx.now), returns_at: at.toISOString(), game: id });
    }
    if (!resuming) {
      const empty = spendStamina(content, s, ctx, creature.elite ? 'elite' : 'duel');
      if (empty) return empty;
    }
    s.duels = { ...s.duels, [creature.id]: { day, outcome: 'open' } };
    // While this is set, Ling advances NOTHING (SKILL.md § 斗法): she knows
    // from the save, not from a message, because a message can be lost.
    s.fight = resuming ? s.fight : { game: id, creature: creature.id, at: ctx.now.toISOString(), wounds: woundsNow(content, s, ctx.now) };
    // The whole setup is kept with it, so the settle replays what the page
    // is handed now (an older save's open fight takes it on resume).
    if (!s.fight.setup) s.fight.setup = fightSetup(content, s, creature, ctx.now, id);
    return { state: s, result: { ok: true, started: id, ...(resuming ? { resumed: true } : {}), duel: duelBrief(content, s, game, ctx.now) } };
  }

  // ── 收场: the page hands back what was played, the rules replay it ──
  if (today?.day !== day || today.outcome !== 'open') return refuse('not-started', null, { game: id });
  const setup = fightSetup(content, s, creature, ctx.now, id);
  const actions = String(args.picks).split(',').map(x => x.trim()).filter(Boolean);
  const played = battle(actions, setup, cardCatalog(content));
  if (played.refused) return refuse(played.refused.why, null, { action: played.refused.action });
  if (played.outcome === 'open') return refuse('unfinished', null, { turn: played.turn });
  delete s.fight;
  s.duels[creature.id] = { day, outcome: played.outcome };
  // What the fight took stays taken (§ 伤势); a loss leaves nothing.
  const left = played.outcome === 'lost' ? 0 : played.you.hp;
  s.wounds = left < played.you.hpMax ? { n: played.you.hpMax - left, at: ctx.now.toISOString() } : undefined;
  if (!s.wounds) delete s.wounds;
  const handed = played.outcome === 'won' ? advance(content, s, { kind: 'subdue', creature: creature.id }, ctx) : [];
  if (played.outcome === 'won') s.wins = { ...s.wins, [id]: ctx.now.toISOString() };
  const say = played.outcome === 'lost' ? withdrawnLine
    : played.outcome === 'withdrew' ? pick({ zh: `${pick(creature.name, 'zh')}一口气用尽，转身走了 —— 这一场不算你赢。`, en: `${pick(creature.name, 'en')} runs out of breath and turns away — this one is not a win.` }, state.lang)
      : null;
  // What a subdued creature leaves, and what a haunt pays for it. A fight that
  // ended in 遁走 pays nothing: it has to be WON (design.md § 斗法 v3).
  const dropped = played.outcome === 'won' ? drop(content, s, creature) : [];
  // 精英 pay half again what a plain beast does and leave two cards (his,
  // 2026-09-23: fixed in the world, marked where you can see them — the choice
  // is whether to go, and in what shape). Half again, not twice: at twice the
  // gate found always-elite the best day whatever the wounds, so there was no
  // choice; at 1.5× an elite is worth it whole and a coin toss hurt.
  const elite = Boolean(creature.elite);
  const bonded = played.outcome === 'won' ? gainBond(content, s, elite ? 'elite' : 'win', ctx.now) : null;
  for (let i = 0; played.outcome === 'won' && i < (elite ? 2 : 1); i += 1) {
    const card = winCard(content, s, creature, ctx.now, i);
    if (card) dropped.push(card);
  }
  const paid = haunt && played.outcome === 'won' ? pay(content, s, ctx, { table: elite ? 'elite' : 'haunt', progress: content.rewards.tables[elite ? 'elite' : 'haunt'].progress, wealth: content.rewards.tables[elite ? 'elite' : 'haunt'].wealth }) : null;
  return { state: s, result: { ok: true, outcome: played.outcome, game: id, say, you: played.you, foe: played.foe, turns: played.turn, health: healthBrief(content, s, ctx.now), ...(elite ? { elite: true } : {}), ...(bonded ? { bond: bonded } : {}), ...(dropped.length ? { dropped } : {}), ...(handed.length ? { handed } : {}), ...(paid ? { paid, haunt: haunt.creature } : {}) } };
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
  if (!liveBranch(s, ctx.now)) s.branch = null;
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
  const target = placeSaid(content, raw, here);
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
  // He named where he is going, so he is walked there — the whole road, not
  // one leg and a question at every ford (his, 2026-09-21: 「去泗水」 and the
  // chat asked 何去何从 again). Walking costs nothing. Only a place no open
  // road reaches is refused.
  const way = pathOf(content, s, here, target, ctx.now);
  if (!way) {
    const say = { zh: `从${pick(here.name, 'zh')}没有路通向${pick(target.name, 'zh')}。`, en: `No road runs from ${pick(here.name, 'en')} to ${pick(target.name, 'en')}.` };
    return stay('no-road', pick(say, lang), { near: near() });
  }
  const from = here;
  // The road is paid for before it is walked: 体力 by the road, the whole way
  // (a scene met on the way stops the walk, and the rest is not charged).
  const stopAt = way.findIndex(p => sceneOf(content, s)?.at === p.id && !s.done_scenes.includes(s.scene));
  const roads = stopAt >= 0 ? stopAt + 1 : way.length;
  const tired = spendStamina(content, s, ctx, 'move', roads);
  if (tired) return tired;
  s.handed = []; // walked on, the last place's 所得 is put away
  // The road stops where the story stands: a scene met on the way is not walked past.
  for (const step of way) {
    s.place = step.id;
    advance(content, s, { kind: 'visit', place: step.id });
    if (atScene(content, s) && sceneOf(content, s)?.at === step.id) break;
  }
  const reached = placeOf(content, s.place);
  // What this arrival finished: the errands not ready before and ready now,
  // each with what is SEEN there when its author wrote it — so reaching the
  // place an errand sent him to is an event, not an empty ford.
  const wasReady = new Set(bookOf(content, state, lang, ctx).filter(q => q.ready).map(q => q.id));
  const met = bookOf(content, s, lang, ctx).filter(q => q.ready && !wasReady.has(q.id))
    .map(q => ({ id: q.id, title: q.title, ...(questOf(content, q.id)?.seen ? { seen: fill(pick(questOf(content, q.id).seen, lang), s) } : {}) }));
  const handed = settleErrands(content, s, ctx);
  const via = way.slice(0, way.findIndex(p => p.id === reached.id)).map(p => placeName(content, s, p));
  // Where he STOPS — never a place walked through (his pick, 2026-09-21) — and
  // only when the arrival finished nothing: an errand met is the event.
  // A 机缘 waiting here is the arrival's event, like an errand met.
  const lucky = chanceLive(s, ctx.now) && s.place === s.chance.place;
  const dealt = met.length || lucky ? null : dealMeet(content, s, ctx);
  if (dealt) s.meets = { day: dayKey(ctx.now), places: { ...meetsToday(s, ctx.now), [s.place]: dealt } };
  const left = inMade(s) ? s.made.at : null;
  if (left) s.made.at = null;
  const place = placeBrief(content, s, ctx.now);
  const scene = atScene(content, s) ? sceneBrief(content, s, ctx.now) : null;
  const cards = [...place.show, ...(scene?.show ?? [])];
  const show = cards.filter((c, i) => cards.findIndex(d => JSON.stringify(d) === JSON.stringify(c)) === i);
  // The story is rewritten when something of it happened: a scene entered,
  // a province crossed, a made scene left — not on every road walked (a
  // Summarize is a whole model call; seen live 2026-09-16, one per step).
  const summarize = Boolean(scene) || reached.province !== from.province || Boolean(left);
  return { state: s, result: { ok: true, place, scene, show, ...(via.length ? { via } : {}), ...(met.length ? { met } : {}), ...(handed.length ? { handed } : {}), ...(lucky ? { chance: chanceBrief(content, s, ctx.now) } : {}), ...(reached.id !== target.id ? { stopped: true } : {}), ...(left ? { left } : {}), director: directorBrief(content, s, ctx), summarize } };
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
    // 疗伤: a mending pill takes back a share of what the fights took (§ 伤势).
    if (e.mend) {
      const n = woundsNow(content, s, ctx.now);
      if (!n) return refuse('not-hurt', pick({ zh: '身上没伤，留着吧。', en: 'You are not hurt — keep it.' }, lang));
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      const rest = Math.max(0, n - Math.ceil(hpMaxOf(s) * e.mend));
      s.wounds = rest ? { n: rest, at: ctx.now.toISOString() } : undefined;
      if (!s.wounds) delete s.wounds;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), health: healthBrief(content, s, ctx.now) } };
    }
    // 功法卷 — read once, learned for good: 望气术 (§ 意图) by its 卷, in order,
    // at the realm it asks.
    if (e.learn) {
      const known = s.insight ?? 0;
      if (known >= e.level) return refuse('already-known', pick({ zh: '这一卷你已经通了。', en: 'You already know this part.' }, lang));
      if (known < e.level - 1) return refuse('needs-before', pick({ zh: '须先通上卷。', en: 'Learn the first part first.' }, lang));
      if (tierRank(content, e.tier) > tierIndex(content, s)) return refuse('needs-tier', pick({ zh: `此卷须${pick(content.ladder.tiers.find(t => t.id === e.tier)?.name, lang)}方可习。`, en: `This part wants ${pick(content.ladder.tiers.find(t => t.id === e.tier)?.name, lang)}.` }, lang));
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      s.insight = e.level;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), learned: { id: e.learn, level: e.level } } };
    }
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
      const gift = e.wear && e.wear === companionOf(content)?.id ? gainBond(content, s, 'gift', ctx.now, `gift:${item.id}`) : null;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), wear: s.wear, ...(gift ? { bond: gift } : {}) } };
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
  // 卸下 — an arm taken off, back to the bag. Only his three slots: what
  // Yinyue wears is hers, and the 本命法宝 is bound, not worn.
  if (args.action === 'remove') {
    const slot = GEAR_SLOTS.find(k => s.wear?.[k] === item.id);
    if (!slot) return refuse('not-worn', null);
    delete s.wear[slot];
    return { state: s, result: { ok: true, removed: item.id, slot, wear: s.wear } };
  }
  return refuse('unknown-action', null, { actions: ['buy', 'sell', 'use', 'remove'] });
}

/* The player's words set the language. The result carries the scene in it,
   so one call switches and re-reads; asking for the language already in
   use changes nothing. */
export function lang(state, content, ctx, args) {
  if (!['zh', 'en'].includes(args.lang)) return refuse('unknown-lang', null, { langs: ['zh', 'en'] });
  // A language chosen — the page's 中/En, or the player asking Ling — is
  // kept: words never turn it again (his, 2026-09-23: 每次刷新不要重置).
  // A new game's guess from the machine (`auto`) is not a choice.
  const set = args.auto ? Boolean(state.lang_set) : true;
  const s = args.lang === state.lang && Boolean(state.lang_set) === set ? state : { ...clone(state), lang: args.lang, lang_set: set };
  // The scene only where the player stands — Lang once handed Ling chapter
  // 3's opening lines a province early (2026-09-16), and Ling recited them.
  const result = { ok: true, lang: s.lang, changed: args.lang !== state.lang, scene: atScene(content, s) ? sceneBrief(content, s, ctx?.now) : null };
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
  if (state.lang_set || ENGINE_WORDS.test(String(said ?? ''))) return state;
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
  gainCard(content, s, c.id); // 银月 is a card he holds from now on
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
  go, saves, save, load, forget, atlas, divine, fate, ring, show, quest, meet, tend, bond, chance, journey, greet, deck,
  gear: (s, c) => ({ state: null, result: { ok: true, gear: gearBrief(c, s) } }),
};

/* Quest — 接下 · 交差 · 撂下 (design.md § 差事). The world's errands, taken by
   the player and counted by the rules. `take` at the giver; `turn` wherever he
   stands, the moment the counts are met; `drop` is WoW's abandon, no penalty. */
export function quest(state, content, ctx, args) {
  const id = String(args.id ?? ''), lang = state.lang;
  const action = String(args.action ?? 'take');
  // The page's own reading of one line: everything a row expands to. It is
  // asked for on a tap and never rides Look, so it costs Ling nothing (his,
  // 2026-09-21: what the page knows it shows — the model is for telling).
  if (action === 'info') return { state: null, result: questInfo(state, content, ctx, id) };
  // A 功课 is handed in with the same word as any errand; its app is the witness.
  if (action === 'turn' && (ctx.quests ?? []).some(x => x.id === id)) return choreTurn(state, content, ctx, id);
  const q = questOf(content, id);
  if (!q) return refuse('no-such-quest', null, { book: bookOf(content, state, lang, ctx) });
  const s = clone(state);
  s.quests ??= {};

  if (action === 'drop') {
    if (!s.quests[id] || questDoneBefore(s, id)) return refuse('not-taken', null);
    delete s.quests[id];
    return { state: s, result: { ok: true, dropped: id, book: bookOf(content, s, lang, ctx) } };
  }

  if (action === 'take') {
    if (s.quests[id]) return refuse(questDoneBefore(s, id) ? 'already-done' : 'already-taken', null);
    if (q.from?.place !== s.place) return refuse('not-here', null, { at: placeName(content, s, placeOf(content, q.from.place)) });
    if (q.opens?.after && !questDoneBefore(s, q.opens.after)) return refuse('not-yet', null);
    if (Object.keys(s.quests).filter(x => !questDoneBefore(s, x)).length >= BOOK_MAX) {
      return refuse('book-full', pick({ zh: `手上已有${BOOK_MAX}件事，先了一件。`, en: `Three things are already in hand — finish one first.` }, lang), { book: bookOf(content, s, lang, ctx) });
    }
    if (q.notice && noticeAt(content, s, ctx.now)?.id !== id) return refuse('not-posted', null);
    // A notice done on an earlier day has nothing left to say: the save keeps today's only.
    for (const old of Object.keys(s.quests)) if (noticeOf(content, old) && questDoneBefore(s, old) && noticeOf(content, old).day !== q.day) delete s.quests[old];
    s.quests[id] = { took: dayKey(ctx.now), have: {} };
    return { state: s, result: { ok: true, took: id, title: pick(q.title, lang), book: bookOf(content, s, lang, ctx) } };
  }

  if (action !== 'turn') return refuse('unknown-action', null, { actions: ['take', 'turn', 'drop', 'info'] });
  if (!s.quests[id]) return refuse('not-taken', null);
  if (questDoneBefore(s, id)) return refuse('already-done', null);
  if (!questReady(content, s, q)) return refuse('not-done', null, { need: countsOf(content, s, q).map(n => ({ kind: n.kind, have: n.have, n: n.n })) });
  // What the need consumed: a `carry` hands the thing over.
  const h = complete(content, s, ctx, id, q);
  s.handed = [...(s.handed ?? []), h].slice(-HANDED_KEEP);
  const told = handedOne(content, s, h);
  return { state: s, result: { ok: true, turned: id, title: told.title, paid: h.paid, book: bookOf(content, s, lang, ctx),
    ...(told.next ? { then: told.next } : {}) } };
}

function questInfo(state, content, ctx, id) {
  const lang = state.lang, row = bookOf(content, state, lang, ctx).find(b => b.id === id);
  const chore = (ctx.quests ?? []).find(x => x.id === id);
  if (chore) return { ok: true, id, kind: 'chore', title: pick(chore.title, lang), app: chore.app, period: chore.period, grant: { progress: chore.reward ?? 0, stamina: chore.stamina ?? content.rewards.stamina.refill.quest }, ...(row ? { need: row.need, ready: row.ready } : {}) };
  const q = questOf(content, id);
  if (!q) return { ok: false, refused: 'no-such-quest' };
  const next = q.then ? questOf(content, q.then) : null;
  return { ok: true, id, kind: 'errand', title: pick(q.title, lang), who: q.from.who ? pick(q.from.who, lang) : null, say: fill(pick(q.say, lang), state),
    from: placeName(content, state, placeOf(content, q.from.place)), grant: q.grant, taken: Boolean(row),
    ...(row ? { need: row.need, where: row.where, ready: row.ready } : { need: q.need.map(n => ({ kind: n.kind, have: 0, n: n.n })) }),
    ...(q.grant?.item ? { gives: pick(itemOf(content, q.grant.item)?.name, lang) } : {}),
    // `then` is the wrapper's word to Ling on every result; the next link is `next`.
    ...(next ? { next: pick(next.title, lang) } : {}) };
}

function choreTurn(state, content, ctx, id) {
  const checked = questCheck(state, content, ctx, id);
  if (!checked.state) return checked;
  const q = ctx.quests.find(x => x.id === id);
  return { state: checked.state, result: { ...checked.result, turned: id, title: pick(q.title, state.lang), book: bookOf(content, checked.state, state.lang, ctx) } };
}

/* Show — the cards Ling puts before the player, WRITTEN DOWN. It was a
   declarative tool until 2026-09-18: the page read the call off the chat
   stream and nobody else ever knew what stood on the stage, so the rules could
   not keep the question off it and a reload wiped it. Now the save holds it,
   which is what lets one reading serve both sides (his law: a widget stands in
   the chat or on the stage, both are told, only one shows it).

   Kept for the scene it was shown at, so walking away clears the stage by
   itself. */
export function show(state, content, ctx, args) {
  let cards = args.cards ?? [];
  if (typeof cards === 'string') { try { cards = JSON.parse(cards); } catch { return refuse('bad-cards', null); } }
  cards = (Array.isArray(cards) ? cards : []).filter(c => c && typeof c.card === 'string').map(c => ({ ...c }));
  if (!cards.length) return refuse('no-cards', null);
  const s = clone(state);
  s.shown = cards;
  s.shown_at = stageAt(content, s);
  return { state: s, result: { ok: true, shown: cards } };
}

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
export function askOf(content, state, ctx, result = {}, ungated = false) {
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
  const road = meetBrief(content, state, ctx.now);
  if (road?.kind === 'riddle' && !road.veiled && !atScene(content, state)) {
    return {
      header: String(placeBrief(content, state, ctx.now)?.name ?? ''), question: road.riddle,
      options: [...road.choices.map(c => ({ label: c, meet: 'answer', answer: c })), { label: zh ? '不答，赶路' : 'Walk on', meet: 'pass' }],
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
  // 台上有事，聊天不问去处 (his ruling, 2026-09-18). The stage was holding out a
  // 坊市 with 银月铃 on the shelf while the chat asked 何去何从 — two places
  // pulling at once, and the one he had not chosen won. So while something
  // here waits to be taken, the question stays away; the roads are still on
  // the map, in the director's brief for Ling's own line, and in anything he
  // types.
  //
  // Asked ONCE where he stands. The rules write down that they asked here
  // (`asked_at`), so a question he passed on is not put back a turn later —
  // his "I clicked skip in askuser widget in chat, it shows again". Anything
  // that MOVES the world re-arms it: a road walked, a cast thrown, a thing
  // bought. Only a bare Look, at a spot already asked, says nothing — which is
  // the difference between quiet and stuck (he cast the coins, the turn ended
  // with no way on, 2026-09-18: 「起卦完成, 任务卡住了」).
  if (!ungated) {
    if (state.fight) return null; // a fight is running: Ling advances nothing
    if (stageHeld(content, state, ctx)) return null;
    // Something moved the world — a road walked, a cast thrown, a thing
    // bought — so the question is worth putting again. Otherwise it is asked
    // only where it has not been asked yet.
    const moved = Boolean(result.director) || (ctx.verb && ctx.verb !== 'look');
    if (!moved && state.asked_at === stageAt(content, state)) return null;
  }
  const choice = directorBrief(content, state, ctx)?.choice;
  if (choice) return choice;
  return { header: header(placeBrief(content, state, ctx.now)?.name), question, options: FILLERS[zh ? 'zh' : 'en'] };
}

/* Is the stage holding something out to him? Asked of the very list that is
   drawn (stage.mjs CARD_KINDS) — this was `stageWaiting`, a list of its own,
   and every card it forgot put two things to tap on screen at once. */
function stageHeld(content, state, ctx) {
  if (atScene(content, state)) return false;
  // Only what a holding card reads — the whole Look computes the question
  // itself, and asking it here is a loop.
  const view = { quest: questBrief(content, state, ctx.now), offers: offersOf(content, state, state.lang, ctx.now), place: placeBrief(content, state, ctx.now), tasks: [] };
  return stageHolds(view, stageCards(view, { focus: shownHere(content, state, view), fight: Boolean(state.fight) }));
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
/* No question this time: the stage has the thing in front of him, or nothing
   has changed since the last one. End on words — never invent a question the
   rules withheld (his law, 2026-09-18). */
const THEN_VEIL = 'Something waits on this road (`place.meet`, still veiled — the stage shows only mist). Set the moment first: two or three short lines in the world that build toward it — the light, the air, a sound — and stop at the edge ("突然——"), never naming what it is. Then call Meet {action: reveal}: its answer puts the card on the stage and carries the question; follow its own `then`.';
const THEN_QUIET = 'No question this time — the stage holds what is before him, or he has already been asked here. End on your words: name a way on in the line if it is worth naming, and do NOT call AskUser.';
export const thenFor = (result, ask = undefined) => (result?.place?.meet?.veiled ? THEN_VEIL : (result?.quest?.say ? THEN_CALL : '')
  + (ask === null ? THEN_QUIET : won(result) ? THEN_CHEER : THEN));
const withAsk = (result, content, state, ctx) => ({ ...onStage(content, state, ctx, result), ...result });

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
  turn: o => `Quest {action: turn, id: ${o.turn}}`,
  meet: o => `Meet {action: ${o.meet}${o.answer ? `, answer: ${o.answer}` : ''}}`,
  divine: o => (o.divine === true ? 'Divine' : `Divine {ask: ${o.divine}}`),
};
// A place chip on the map says 去X / Go to X (cards.js sayGo).
const GO = /^(去|go to\s+)/i;
// The day's cast asked for in words — the coins on the stage say 请银月起一卦
// (cards.js sayCast); typed, 起一卦 / 算一卦 / 问卦. Look alone let the scene's
// question win: 起一卦 tapped twice, 何去何从 asked twice (2026-09-17).
const CAST_WORDS = /起一?卦|算一?卦|问卦|\bcast the coins\b|\bdivine\b/i;
export function tapThen(ask, said) {
  const words = String(said ?? '').trim();
  if (CAST_WORDS.test(words) && !ask?.options?.some(o => o.label === words)) {
    return 'The player asks for the day\'s cast — call Divine now, with no `ask`; this Look changed nothing. Then AskUser exactly the `ask` that tool returns. The reply ends only there.';
  }
  const options = words ? ask?.options ?? [] : [];
  const option = options.find(o => o.label === words) ?? options.find(o => o.move && o.label === words.replace(GO, ''));
  const kind = option && Object.keys(TAPS).find(k => option[k]);
  if (!kind) return null;
  return `The player tapped "${option.label}" — call ${TAPS[kind](option)} now; this Look changed nothing. Then follow that tool's own \`then\`: AskUser its \`ask\` when it carries one, and end on your words when it is null.`;
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
  const asking = next ?? state;
  const answer = withAsk(result, content, asking, { now, quests: readQuests(), said: args.said, verb });
  // Written down, so the next bare Look does not ask it again. Cleared by
  // walking somewhere, because `asked_at` is the place it was asked at.
  const here = stageAt(content, asking);
  if (answer.ask && !atScene(content, asking) && asking.asked_at !== here) {
    asking.asked_at = here;
    writeAtomic(stateFile, JSON.stringify(asking));
  }
  // A tapped label is matched against the question whether or not it was
  // asked: the roads are on the map card even when the chat holds its tongue,
  // and a tap on one must still become a Move.
  const tapCtx = { now, quests: readQuests(), said: args.said };
  const tap = verb === 'look' && tapThen(answer.ask ?? askOf(content, next ?? state, tapCtx, {}, true), args.said);
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

/* What Ling is handed is not what the page draws (his, 2026-09-18: 「don't
   blow ling's context up」). Ling's tools ask with --for=ling (SKILL.md) and
   get the result with the page's own drawing data taken out; the page, and
   anything else, gets it all (an open page on old code never loses its map): every place of the province for the map, and a
   shelf's pictures. The rest of the shelf she keeps — what a thing is
   (`kind`, `about`), what it does (`effect`, its root), both prices, how
   many are held and whether one is worn: SKILL.md has her tell a thing from
   its `about` and `effect` and speak prices only as the shelf gives them.
   Measured 2026-09-23 on his save at 彭城: Look 10.3k chars, 4.2k of them
   places, pictures and blurbs. The rules never read it back, so it cannot
   change a decision. */
const shelfForLing = i => {
  if (!i || typeof i !== 'object') return i;
  const { art, ...kept } = i; // the picture is the page's; the words and prices are hers
  return kept;
};

export function forLing(value) {
  if (Array.isArray(value)) return value.map(forLing);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'places' && Array.isArray(v) && 'roads' in value) continue;
    if (k === 'shelf' && Array.isArray(v)) { out.shelf = v.map(shelfForLing); continue; }
    out[k] = forLing(v);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [verb, ...rest] = process.argv.slice(2);
  try {
    const { for: reader, ...args } = parseArgs(rest);
    const result = run(verb ?? 'look', args);
    console.log(JSON.stringify(reader === 'ling' ? forLing(result) : result));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, refused: 'error', error: String(err?.message ?? err) }));
    process.exit(1);
  }
}
