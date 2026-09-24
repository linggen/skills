// rules/errands.mjs — 差事, 遇 and 抉择: the errands taken, what an arrival meets, the ways through.
// Part of the rules engine; rules.mjs is its one door.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARM_SLOTS } from '../content.mjs';
import { dayKey, fill, normalizeAnswer, periodKey, pick, stepName, threshold, tierOf } from '../state.mjs';
import { wornOf } from './arms.mjs';
import { cardCatalog, deckFor, healthBrief, hpMaxOf, ownedCards, pickedCards, usable, WEAPON_POWER, woundsNow } from './cards.mjs';
import { bondBrief, companionOf, hasCompanion, nearestPlace } from './companion.mjs';
import { clone, pay, paysOf, refuse, RIDDLE_TRIES, spendStamina } from './core.mjs';
import { herAway } from './daily.mjs';
import { nameOf } from './look.mjs';
import { canWrite, questDone } from './tasks.mjs';
import { hashOf, pickSeed } from './travel.mjs';
import { allPlaces, atScene, creatureOf, inCorridor, inMade, pathOf, placeName, placeOf, provinceOpen, sceneOf, tooHard, towardOf } from './world.mjs';

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
const SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
  return [...errandsOf(content, state, lang, ctx?.now ?? new Date()), ...choresOf(state, ctx, lang)];
}

function errandsOf(content, state, lang, now) {
  return Object.keys(state.quests ?? {})
    .filter(id => !questDoneBefore(state, id))
    .map(id => {
      const q = questOf(content, id);
      if (!q) return null;
      const need = countsOf(content, state, q);
      return { id, title: pick(q.title, lang), need: need.map(n => ({ kind: n.kind, have: n.have, n: n.n })), ready: need.every(x => x.done), where: whereFor(content, state, q, need, lang, now) };
    })
    .filter(Boolean);
}

/* Where the next count is met — a creature's haunt, a place to reach, the
   market that sells it. One line, so the player is never left guessing.
   `now` is the caller's clock, never the wall's: a test's or a replay's day
   decides which provinces are open (review, 2026-09-24). */
function whereFor(content, state, quest, need, lang, now) {
  const open = need.find(n => !n.done);
  if (!open) return null;
  const at = open.kind === 'visit' ? placeOf(content, open.place)
    : open.kind === 'subdue' || open.kind === 'tame' ? Object.values(content.places).flatMap(d => d.places).find(p => p.has?.creature === open.creature)
      : open.kind === 'carry' ? nearestPlace(content, state, now, p => p.has?.shop)
        // a game: the nearest place that hosts it (his, 2026-09-23: 没有去碣石的按钮)
        : open.kind === 'board' ? (open.at ? placeOf(content, open.at) : nearestPlace(content, state, now, p => (p.has?.games ?? []).includes(open.task)))
          : null;
  if (!at) return null;
  // nearestPlace hands back a name already said; the rest wants the place itself.
  if (at.steps !== undefined) return whereAt(content, state, placeOf(content, at.id), lang, now);
  return whereAt(content, state, at, lang, now);
}

function whereAt(content, state, at, lang, now) {
  if (!at) return null;
  if (at.id === state.place) return { id: at.id, name: pick(at.name, lang) ?? at.name, here: true };
  const named = at.name ? placeName(content, state, at) : at;
  // The first place on the road there, when it is more than one road away —
  // what Ling used to say after a 接下 (「先去大野泽，再往凫丽山」); the page says it
  // now that 接下 is the page's own tap (his, 2026-09-22).
  const from = placeOf(content, state.place), way = from && at.roads ? pathOf(content, state, from, at, now) : null;
  return way && way.length > 1 ? { ...named, via: placeName(content, state, way[0]).name, roads: way.length } : named;
}

/* 榜文 — templated 差事 (design.md § 差事 ⑤). A market posts one a day: a
   template and a target of its own province. The id says it all —
   `daily-<day>-<template>-<target>` — so the 差事 is rebuilt from its id and
   the save holds nothing more than it does for an authored one. Taken, it
   stays in the book until done or put down; only the posting turns with the day. */
const swap = (pair, words) => Object.fromEntries(['zh', 'en'].map(l => [l, pair[l].replace(/\{(target|place|game)\}/g, (_, k) => words[k]?.[l] ?? '')]));

function noticeOf(content, id) {
  const [, day, tid, target] = /^daily-(\d{8})-([a-z]+)-([a-z0-9]+)$/.exec(id ?? '') ?? [];
  const t = (content.notices ?? []).find(x => x.id === tid);
  if (!t) return null;
  const at = allPlaces(content).find(p => (t.kind === 'visit' || t.kind === 'board' ? p.id : p.has?.creature) === target);
  const market = at && allPlaces(content).find(p => p.province === at.province && p.has?.shop);
  if (!market) return null;
  // A game notice: the place's own game (not the market's 炼丹), won anywhere.
  const game = t.kind === 'board' ? (at.has?.games ?? []).find(g => g !== 'alchemy-daily') : null;
  if (t.kind === 'board' && !game) return null;
  const name = t.kind === 'visit' || t.kind === 'board' ? at.name : creatureOf(content, target)?.name;
  if (!name) return null;
  const words = { target: name, place: at.name, game: game ? taskOf(content, game)?.title : null };
  const worded = x => swap(x, { ...words, game: words.game ?? { zh: '', en: '' } });
  return { id, day, notice: t.id, province: at.province, title: worded(t.title), say: worded(t.say), from: { place: market.id, who: t.who },
    need: [{ kind: t.kind, n: t.n, ...(t.kind === 'visit' ? { place: target } : t.kind === 'board' ? { task: game, at: target } : { creature: target }) }], grant: t.grant };
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
  if (t.kind === 'board') return near.filter(p => (p.has?.games ?? []).some(g => g !== 'alchemy-daily')).map(p => p.id);
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
    .map(q => ({ id: q.id, title: pick(q.title, lang), who: q.from.who ? pick(q.from.who, lang) : null, say: fill(pick(q.say, lang), state), need: q.need.map(n => ({ kind: n.kind, n: n.n })), grant: q.grant, pays: paysOf(content, state, now, q.grant) }));
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
  if (!here || errandsOf(content, state, state.lang, ctx.now).length >= BOOK_MAX) return null;
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
/* What a way through risks, and what losing it takes. Only a stake named
   here is ever accepted: an unknown one was once read as a wound (review,
   2026-09-24: `toString` passed the lint and took nothing, then NaN). */
const STAKES = {
  coin: (content, s, ctx, n) => {
    const lost = Math.min(s.wealth, n);
    s.wealth -= lost;
    return { lost: { wealth: lost } };
  },
  wound: (content, s, ctx, share) => {
    const now = woundsNow(content, s, ctx.now), add = Math.ceil(hpMaxOf(s) * share);
    const after = Math.min(hpMaxOf(s), now + add);
    s.wounds = { n: after, at: ctx.now.toISOString() };
    // What it truly took: a wound on a body already near empty takes only what was left.
    return { lost: { hp: after - now }, health: healthBrief(content, s, ctx.now) };
  },
};
const stakesOf = t => Object.keys(t.lose).filter(k => Object.hasOwn(STAKES, k));

/* What Ling offered, held to the rules' shape — or why not. */
function lintTrial(content, raw) {
  const t = content.meets.trial, lim = t.options;
  let list;
  try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { why: 'options must be JSON' }; }
  if (!Array.isArray(list) || list.length < lim.min || list.length > lim.max) return { why: `${lim.min}–${lim.max} ways through` };
  const text = (v, n) => typeof v === 'string' && v.trim() && [...v.trim()].length <= n;
  for (const o of list) {
    if (!text(o?.label, lim.label)) return { why: `each label: words, at most ${lim.label} characters` };
    if (!Object.hasOwn(t.marks, o?.difficulty)) return { why: `difficulty is one of ${Object.keys(t.marks).join(', ')}` };
    if (!Object.hasOwn(STAKES, o?.stake) || !Object.hasOwn(t.lose, o.stake)) return { why: `stake is one of ${stakesOf(t).join(', ')}` };
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
  return { success, line: o.lose, ...STAKES[o.stake](content, s, ctx, t.lose[o.stake][o.difficulty]) };
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
      const tried = [...(here.tried ?? []), String(args.answer)];
      // A traveller's riddle is missed as often as any other (RIDDLE_TRIES):
      // then he walks on, and the road is quiet (review, 2026-09-24).
      if (tried.length >= RIDDLE_TRIES) {
        s.meets.places[s.place] = { ...here, tried, done: true };
        return { state: s, result: { ok: false, refused: 'riddle-closed', say: null } };
      }
      s.meets.places[s.place] = { ...here, tried };
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
  if (state.resting && state.stamina < (q.rest ?? 0)) return 'empty';
  return r >= 0.6 ? 'full' : r >= 0.25 ? 'half' : state.stamina > 0 ? 'low' : 'empty';
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

export { bookOf, breakthroughOf, complete, countsOf, dealMeet, directorBrief, filler, FILLERS, GEAR_SLOTS, gearBrief, HANDED_KEEP, handedHere, handedOne, itemBrief, itemOf, liveBranch, meetBrief, meetHere, meetsToday, noticeAt, noticeOf, offersOf, questDoneBefore, questOf, questReady, settleErrands, taskOf, threadOf, TIERS_ORDER, wayBack, waypointOf, workOf };
