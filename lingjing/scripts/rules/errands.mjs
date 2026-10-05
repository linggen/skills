// rules/errands.mjs — 差事: the errands taken and handed in, the book, the director's brief, the gear panel.
// Part of the rules engine; rules.mjs is its one door.
import { ARM_SLOTS } from '../content.mjs';
import { costOf } from '../battle.js';
import { dayKey, fill, itemName, lockedOf, periodKey, pick, peakName, stepName, threshold, tierOf, seedOf } from '../state.mjs';
import { canPick, cardCatalog, deckFor, gearFight, ownedCards, pickedCards, rootsOf, usable } from './cards.mjs';
import { companionOf, hasCompanion, herCard, nearestPlace } from './companion.mjs';
import { readingOf } from './scrolls.mjs';
import { pay, paysOf } from './core.mjs';
import { nameOf } from './look.mjs';
import { choreOpen, isPool, questDone, todayChores } from './chores.mjs';
import { canMakeTale, taleEvent, taleHanded, taleRow } from './tale.mjs';
import { hashOf } from './travel.mjs';
import { coolingUntil, oddsOf } from './breakthrough.mjs';
import { freeSlot, pouchBrief } from './pouch.mjs';
import { chapterLabel, comingOf } from './hui.mjs';
import { allPlaces, atScene, creatureOf, hauntsOf, huntable, inCorridor, inMade, ofJuan, pathOf, placeName, placeOf, placeOpen, sceneOf, tooHard, towardOf } from './world.mjs';

/* ── 差事 — the errands the player takes (design.md § 差事) ──
   接 · 记 · 追 · 交. The world offers, the player takes, the rules count, and
   交差 happens where he stands the moment the count is met (his ruling,
   2026-09-18: 不要让用户跑地图) — unless the giver is a PERSON (quests
   `from.person`): what is handed to someone is handed where they are (his,
   2026-09-29: 阿禾 at 坊市, not at 渡口). The book shows where to go. */

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

/* Where a person waits to be handed the errand; null when it hands in anywhere. */
const giverAt = quest => (quest?.from?.person ? quest.from.place : null);
const withGiver = (state, quest) => !giverAt(quest) || state.place === giverAt(quest);

/* The giver's words when he tries it elsewhere: in-world, never a code. */
function awayLine(content, state, quest) {
  const who = pick(quest.from.who, 'zh'), whoEn = pick(quest.from.who, 'en'), at = placeOf(content, giverAt(quest));
  return pick({ zh: `这件事得当面交给${who}——${who}在${pick(at?.name, 'zh')}。`, en: `This is for ${whoEn}, in person — ${whoEn} is at ${pick(at?.name, 'en')}.` }, state.lang);
}

/* The errand in the book that asks for this beast (降 or 驯, not yet met):
   the fight's stake says it is fought for that errand. */
function errandFor(content, state, creature) {
  for (const id of Object.keys(state.quests ?? {})) {
    if (questDoneBefore(state, id)) continue;
    const q = questOf(content, id);
    if (q && countsOf(content, state, q).some(n => (n.kind === 'subdue' || n.kind === 'tame') && n.creature === creature && !n.done)) return q;
  }
  return null;
}

/* 功课 on the same card (design.md § 差事 ⑥): what the player's apps report,
   as lines of the book — only today's (chores.mjs: the fixed ones and the
   day's one pick; 开府 has its own section). They take no slot — nobody took
   them, life gave them — and one paid for its period leaves, like any errand
   handed in. */
function choresOf(state, ctx, lang) {
  const now = ctx?.now ?? new Date(), quests = ctx?.quests ?? [];
  return todayChores(state, quests, now)
    .filter(q => state.chores?.[q.id]?.period !== periodKey(q.period, now))
    .map(q => {
      const done = questDone(q, now);
      return { id: q.id, title: pick(q.title, lang), need: [{ kind: 'chore', have: done ? 1 : 0, n: 1 }], ready: done, where: null,
        // Where to do it: the app's own page, as the app declares it (`open`),
        // else its door. Only a path on this host — never a link out.
        chore: { app: q.app, period: q.period, done_at: done ? q.done_at : null, open: choreOpen(q), device: q.device ?? null, kind: isPool(q) ? 'pick' : 'fixed' } };
    });
}

/* Open, in the order taken; then the day's 传闻 (tale.mjs); then life's own. */
function bookOf(content, state, lang, ctx) {
  // Before a story gate the book holds nothing it keeps shut (state.mjs lockedOf).
  const shut = lockedOf(content, state), errands = !shut.includes('errands');
  const tale = errands ? taleRow(content, state, { now: ctx?.now ?? new Date() }) : null;
  return [...(errands ? errandsOf(content, state, lang, ctx?.now ?? new Date()) : []), ...(tale ? [tale] : []), ...(shut.includes('chores') ? [] : choresOf(state, ctx, lang))];
}

function errandsOf(content, state, lang, now) {
  return Object.keys(state.quests ?? {})
    .filter(id => !questDoneBefore(state, id))
    .map(id => {
      const q = questOf(content, id);
      if (!q) return null;
      const need = countsOf(content, state, q);
      // A board won while the pool was empty is kept, not yet counted (tasks.mjs
      // taskDone): the row says so, or it reads 0/1 as if nothing happened (his
      // 五子 at 桑间, 2026-09-24 — it looked broken).
      const kept = n => n.kind === 'board' && !n.done && Boolean(state.wins?.[n.task]);
      const ready = need.every(x => x.done), away = ready && !withGiver(state, q);
      return { id, title: pick(q.title, lang), need: need.map(n => ({ kind: n.kind, have: n.have, n: n.n, ...(kept(n) ? { kept: true } : {}) })), ready,
        // Done, but the person it is for is elsewhere: who, and the way there.
        ...(away ? { away: { who: pick(q.from.who, lang) } } : {}),
        where: away ? whereAt(content, state, placeOf(content, giverAt(q)), lang, now) : whereFor(content, state, q, need, lang, now) };
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
    : open.kind === 'subdue' || open.kind === 'tame' ? (hauntsOf(content, open.creature).map(p => placeOf(content, p.id)).find(p => p && placeOpen(content, state, p, now)) ?? hauntsOf(content, open.creature)[0])
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
  // A game notice: one of the place's own games (never the market's 炼丹),
  // by the notice's id — so 稷下's 论道 is asked for as often as its 象棋.
  const games = t.kind === 'board' ? (at.has?.games ?? []).filter(g => g !== 'alchemy-daily') : [];
  const game = games.length ? games[hashOf(id) % games.length] : null;
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
  const walkable = p => p && !tooHard(content, state, p) && placeOpen(content, state, p, now);
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
  return near.filter(p => huntable(content, p, now) && !state.cast.includes(p.has.creature) && state.duels?.[p.has.creature]?.day !== dayKey(now)).map(p => p.has.creature);
}

const NOTICES_A_DAY = 3;
const mixed = h => { const x = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; };

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
  // hashOf multiplies by 31: a pool of 31 (or a multiple) took the same pick
  // every day — the day's digits vanish mod 31. Mixed first (2026-09-29).
  return pool.length ? noticeOf(content, pool[mixed(hashOf(`${day}|${seedOf(state)}|${market.id}|notice|${today.length}`)) % pool.length]) : null;
}

/* What may be taken where he stands: the giver is here, it is not in the book
   already, it has not been done, and its gate is open. */
function offersOf(content, state, lang, now) {
  if (state.quests && Object.keys(state.quests).filter(id => !questDoneBefore(state, id)).length >= BOOK_MAX) return [];
  const notice = noticeAt(content, state, now);
  return [...(content.quests ?? []), ...(notice ? [notice] : [])]
    .filter(q => q.from?.place === state.place && !state.quests?.[q.id] && ofJuan(content, q, now)
      && (!q.opens?.after || questDoneBefore(state, q.opens.after))
      // Story time: after a scene (`done`), or only while it is still ahead (`before`) — 邺城 before and after the 漳水.
      && (!q.opens?.done || (state.done_scenes ?? []).includes(q.opens.done))
      && (!q.opens?.before || !(state.done_scenes ?? []).includes(q.opens.before))
      && (!q.opens?.tier || TIERS_ORDER(content).indexOf(state.tier) >= TIERS_ORDER(content).indexOf(q.opens.tier)))
    .map(q => ({ id: q.id, title: pick(q.title, lang), who: q.from.who ? pick(q.from.who, lang) : null, say: fill(pick(q.say, lang), state, content), need: q.need.map(n => ({ kind: n.kind, n: n.n })), grant: q.grant, pays: paysOf(content, state, now, q.grant) }));
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
    .filter(p => huntable(content, p, ctx.now) && !state.cast.includes(p.has.creature) && state.duels?.[p.has.creature]?.day !== day && !tooHard(content, state, p))
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
  // 传闻's finale: a fight won or a beast tamed ends it (tale.mjs).
  const tale = taleEvent(content, state, event, ctx);
  return ctx ? [...tale, ...settleErrands(content, state, ctx)] : tale;
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
    if (!q || q.need.some(n => n.kind === 'carry') || !questReady(content, s, q) || !withGiver(s, q)) continue;
    out.push(complete(content, s, ctx, id, q));
  }
  if (out.length) s.handed = [...(s.handed ?? []), ...out].slice(-HANDED_KEEP);
  return out.map(h => handedOne(content, s, h));
}

/* One errand handed in, as the stage and Ling tell it. */
function handedOne(content, state, h) {
  if (h.tale) return taleHanded(content, state, h);
  const lang = state.lang, q = questOf(content, h.id), next = h.next ? questOf(content, h.next) : null;
  return { id: h.id, title: pick(q?.title, lang), who: q?.from?.who ? pick(q.from.who, lang) : null, paid: h.paid,
    ...(q?.grant?.item ? { gives: pick(itemOf(content, q.grant.item)?.name, lang) } : {}),
    // The giver's word at the hand-in, when the errand has one (quests `done`).
    ...(q?.done ? { done: fill(pick(q.done, lang), state, content) } : {}),
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
  // The spine run out onto a chapter still being written: its words are the goal line.
  if (!inMade(state) && !sceneOf(content, state)) { const t = threadOf(content, state, ctx.now); return t?.coming ? t : null; }
  if (atScene(content, state) || inMade(state)) return null;
  const thread = threadOf(content, state, ctx.now);
  if (!thread?.place) return thread;
  // A cauldron that waits on the peak is not a road to walk: the card says
  // what it asks and where he stands, so a blocked spine reads as blocked.
  if (waitsOnPeak(content, state, ctx.now)) return { ...thread, gate: gateOf(content, state, ctx.now) };
  const here = placeOf(content, state.place), goal = placeOf(content, thread.place.id);
  if (!here || !goal || here.id === goal.id) return thread;
  const toward = towardOf(content, state, here, goal, ctx.now);
  return toward ? { ...thread, toward } : thread;
}

/* 主线赶路不扣体力 (Hanli, 2026-10-01: 「可以，主线赶路不扣体力」 — 卷一's
   play-through hit two 5–6 h lockouts on the story path). A trip toward the
   place the goal line names (waypointOf, the page's own notion) is free: the
   target is that place, or stands on a shortest road to it. A cauldron that
   waits on the peak names no road (`gate`), so a trip then is not the story's;
   roaming, errands and cultivation still pay. */
function onStoryRoad(content, state, here, target, ctx) {
  const way = waypointOf(content, state, ctx);
  const goal = !way?.gate && way?.place?.id ? placeOf(content, way.place.id) : null;
  if (!goal || !here || !target) return false;
  const far = (a, b) => (a.id === b.id ? 0 : pathOf(content, state, a, b, ctx.now)?.length);
  const all = far(here, goal), to = far(here, target), rest = far(target, goal);
  return all != null && to != null && rest != null && to + rest === all;
}

/* A cauldron's breath, as the rules would judge it now: `ready` at the peak
   of the tier this chapter's cauldron lifts from; `need` names that peak and
   the 修为 it asks, and the realm it opens. Resolve refuses on the same terms. */
function breakthroughOf(content, state, now = new Date()) {
  const tiers = content.ladder.tiers, tier = tierOf(content, state.tier), next = tiers[tiers.indexOf(tier) + 1];
  const gate = content.chapters[state.chapter]?.gate;
  const peak = state.step === tier.thresholds.length - 1 && state.progress >= threshold(content, state);
  const target = tiers.find(t => t.gate != null && t.gate === gate);
  const source = target ? tiers[tiers.indexOf(target) - 1] : null;
  const last = source ? source.thresholds.length - 1 : 0;
  // 渡劫 is a throw (breakthrough.mjs): its chance while this cauldron is his
  // to take, and the hours it stays shut after a failed one.
  const at = Boolean(next && next.gate === gate);
  const cooling = at ? coolingUntil(state, now) : null;
  const odds = at && (peak || cooling) ? oddsOf(content, state, now, next.id) : null;
  return {
    ready: Boolean(peak && at && !cooling),
    need: source ? { step: peakName(content, source.id, state.lang), progress: source.thresholds[last], to: pick(target.name, state.lang) } : null,
    ...(odds ? { odds } : {}), ...(cooling ? { cooling } : {}),
  };
}

/* What a waiting cauldron asks, beside where the player stands now. */
function gateOf(content, state, now) {
  const bt = breakthroughOf(content, state, now), need = bt.need;
  return need && { ...need, now: { step: stepName(content, state.tier, state.step, state.lang), progress: state.progress, of: threshold(content, state) }, ...(bt.cooling ? { again_at: bt.cooling } : {}) };
}

/* A scene that waits only on a breath the player cannot take yet: the way
   on is the world, not back to the cauldron. */
function waitsOnPeak(content, state, now) {
  const scene = inMade(state) ? null : sceneOf(content, state);
  const exits = (scene?.buttons ?? []).map(id => scene.exits.find(e => e.id === id));
  return exits.length > 0 && exits.every(e => e?.breakthrough) && !breakthroughOf(content, state, now).ready;
}

/* The nearest open road out of a scene's place the player can walk. */
function wayBack(content, state, now) {
  const scene = sceneOf(content, state);
  const here = placeOf(content, scene?.at ?? state.place);
  return (here?.roads ?? []).map(id => placeOf(content, id)).find(p => placeOpen(content, state, p, now) && !tooHard(content, state, p)) ?? null;
}

/* The chapter's goal and its countdown (chapter.json `goal`, his 2026-09-28:
   一个目标 + 倒计时): the day it falls in the story (腊月初八) until its eve
   is marked, then 明日 on the eve's day and 今日 after — real local days, as
   the beat's `needs.day_after` counts them. Gone once its scene is passed. */
function goalOf(content, state, now) {
  const g = content.chapters[state.chapter]?.goal, lang = state.lang;
  if (!g || (state.done_scenes ?? []).includes(g.at) || (state.ended ?? []).includes(state.chapter)) return null;
  const eve = state.mark_days?.[g.eve], today = dayKey(now);
  const when = !eve ? pick(g.date, lang) : eve >= today ? pick({ zh: '明日', en: 'tomorrow' }, lang) : pick({ zh: '今日', en: 'today' }, lang);
  return { title: pick(g.title, lang), when, ...(eve ? { eve: true } : {}) };
}
const goalLine = (goal, lang) => (goal ? `${goal.title} · ${goal.when}${lang === 'zh' ? '。' : '. '}` : '');

function threadOf(content, state, now) {
  const lang = state.lang;
  const scene = inMade(state) ? null : sceneOf(content, state);
  if (scene && atScene(content, state)) return { scene: scene.id, text: fill(pick(scene.setup, lang), state, content) };
  if (scene) {
    const at = placeOf(content, scene.at), goal = goalOf(content, state, now);
    return { scene: scene.id, place: placeName(content, state, at), province: pick(content.dictionary.provinces[at.province], lang),
      ...(goal ? { goal } : {}),
      text: goalLine(goal, lang) + (lang === 'zh' ? `路通向${pick(at.name, 'zh')}。` : `The road leads to ${pick(at.name, 'en')}.`) };
  }
  const next = Object.values(content.chapters)
    .filter(c => !state.ended.includes(c.id) && c.id > state.chapter)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!next) return null;
  // A chapter still being written: 「第四回 · 即将开放」 stands as the goal (its first 回, hui.mjs).
  if (next.coming) return { chapter: next.id, coming: true, text: comingOf(content, next, lang) };
  const opens = next.opens && new Date(next.opens) > now ? next.opens : null;
  const at = next.scenes[next.first_scene]?.at;
  return { chapter: next.id, title: chapterLabel(content, state, next, lang), opens, province: pick(content.dictionary.provinces[next.province], lang), place: at ? placeName(content, state, placeOf(content, at)) : null };
}

const poolOf = (content, state) => {
  const q = content.rewards.stamina, r = state.stamina / q.max;
  if (state.resting && state.stamina < (q.rest ?? 0)) return 'empty';
  return r >= 0.6 ? 'full' : r >= 0.25 ? 'half' : state.stamina > 0 ? 'low' : 'empty';
};

/* The director's brief: what Ling improvises inside this turn — what is
   near, what is beyond the player, the thread, the pool. The
   rules still decide every outcome. */
function directorBrief(content, state, ctx) {
  const place = placeOf(content, state.place);
  if (!place) return null;
  const roads = place.roads.map(id => placeOf(content, id)).filter(p => placeOpen(content, state, p, ctx.now));
  const closed = place.roads.map(id => placeOf(content, id)).filter(p => !placeOpen(content, state, p, ctx.now));
  // 今日传闻 is offered where the province's lore gathers (a place with seeds).
  const rumor = place.has?.seeds && canMakeTale(state, ctx.now) ? pick(content.dictionary.words.tale_today, state.lang) : null;
  const here = placeName(content, state, place);
  const near = roads.filter(p => !tooHard(content, state, p)).map(p => placeName(content, state, p));
  const thread = threadOf(content, state, ctx.now);
  // The first road on the way to the thread's place, when it is not a road
  // away itself — so the choice leads with the way on, not the way back.
  // A cauldron that waits on the peak is not led to: the player just left it.
  const led = waitsOnPeak(content, state, ctx.now) ? null : thread;
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
    choice: atScene(content, state) ? null : choiceOf(state, here, near, toward ? { ...led, place: toward } : led, rumor, ctx.said, filler(content, state, ctx.said), bookOf(content, state, state.lang, ctx).filter(q => q.ready), workOf(content, state, ctx)),
  };
}

/* The way forward while the world is open, ready for AskUser as it is: the
   thread's place first, then the other roads, 今日传闻 when today's is still
   to be told here, and a word to Yinyue so there are always two. Ling offers
   it verbatim; a tapped label is its `move` (Move there at once), `tale`
   (Tale seed, then make) or `ask` (Yinyue answers). A scene's own buttons
   take its place while one runs. */
function choiceOf(state, here, near, thread, rumor, said, alone = null, ready = [], work = null) {
  const zh = state.lang === 'zh';
  const first = thread?.place && near.find(p => p.id === thread.place.id);
  const places = first ? [first, ...near.filter(p => p.id !== first.id)] : near;
  const options = [];
  // 降妖 and the feeding are on the creature's card, the cast on its coins, the
  // bell on the quest's card: one clickable place each, never asked here too
  // (his law, 2026-09-17 — "user will click twice").
  // Something done is handed in before anything else is asked: 交差 where he
  // stands, the moment it is met — and the chat says so, not only a chip.
  options.push(...ready.map(q => ({ label: zh ? `交差：${q.title}` : `Hand in: ${q.title}`, turn: q.id })));
  // Work to be had, a walk away: the way on when the story is waiting.
  if (work && !work.here) options.push({ label: zh ? `${work.place.name} · 有差事` : `${work.place.name} · work to be had`, move: work.place.id });
  options.push(...places.filter(p => !(work && !work.here && p.id === work.place.id)).map(p => ({ label: p.name, move: p.id })));
  if (rumor) options.push({ label: rumor, tale: true });
  if (options.length < 2) options.push(alone ?? { label: zh ? '看看四周' : 'Look around', look: true });
  return { header: here.name, question: zh ? '何去何从？' : 'What now?', options };
}

/* The second option when the world offers only one: two ways of looking —
   never the one the player just took, so the same choice is not offered
   twice running (his "that is duplicated", 2026-09-16). Never a word to
   Yinyue: Ling cannot answer for her, and the stage has her own ask box
   (`@银月 …`) under her name (2026-09-24 — Ling wrote "**银月：**…"). */
const FILLERS = {
  zh: [{ label: '看看四周', look: true }, { label: '说说此地', look: true }],
  en: [{ label: 'Look around', look: true }, { label: 'Tell me about this place', look: true }],
};
function filler(content, state, said) {
  const pair = FILLERS[state.lang === 'zh' ? 'zh' : 'en'];
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
  learn: e => ({ learn: e.learn, level: e.level, tier: e.tier }),
  wear: e => ({ wear: e.wear, ...(e.lift ? { lift: e.lift } : {}) }),
  charm: () => ({ charm: true }),
  pouch: e => ({ pouch: e.pouch }),
  atk: (e, content, lang) => ({ atk: e.atk, ...(e.root ? { root: e.root, root_name: ELEMENT_NAME(content, lang, e.root) } : {}) }),
  def: e => ({ def: e.def }),
  ward: (e, content, lang) => ({ ward: e.ward, wards: Object.entries(e.ward).map(([el, n]) => ({ id: el, name: ELEMENT_NAME(content, lang, el), n })) }),
  core: (e, content, lang) => ({ core: e.core, core_name: ELEMENT_NAME(content, lang, e.core) }),
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
    id: item.id, kind: item.kind, name: itemName(item, state, lang), about: pick(item.about, lang), art: item.art,
    buy: item.buy, sell: item.sell, held: state.bag[item.id] ?? 0,
    effect: effectBrief(content, lang, item.effect),
    worn: Object.values(state.wear ?? {}).includes(item.id),
    // A furnace pill's 转 (丹纹): the card draws that many lines, nine in gold (story/jiuding-lu/DESIGN.md § 丹药等级).
    ...(item.zhuan ? { zhuan: item.zhuan } : {}),
    ...(item.made?.from ? { made_from: pick(itemOf(content, item.made.from)?.name, lang) } : {}),
    ...(tamesOf(content, state, item).length ? { tames: tamesOf(content, state, item) } : {}),
    // A scroll (《吐纳经》): the passage for the layer the player stands on (rules/scrolls.mjs).
    ...(item.reads ? { reads: readingOf(content, state, item.reads) } : {}),
  };
}

/* The beasts not yet won over that this thing wins over — what each `likes`
   (creatures.json; Tame takes it). On the shelf and in the bag, so a player
   buying 灵芝 knows it is for 夫诸 (his, 2026-09-24: 坊市里如果某个物品是收服妖用到的, 显示一下). */
const tamesOf = (content, state, item) => content.creatures.creatures
  .filter(c => c.likes === item.id && !(state.cast ?? []).includes(c.id) && ofJuan(content, c))
  .map(c => ({ id: c.id, name: pick(c.name, state.lang) }));

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
    // `free`: a thing the story still needs, which takes no slot of the 储物袋.
    return { ...itemBrief(content, state, item), n, ...(slot ? { slot } : {}), ...(e.progress || e.learn || e.pouch ? { usable: true } : {}),
      ...(freeSlot(content, state, id) ? { free: true } : {}) };
  });
  return {
    slots: GEAR_SLOTS.map(slot => ({ slot, item: worn(state.wear?.[slot]) })),
    // Her card as it stands (companion.mjs herCard): 攻/血, the realm it grew with, her abilities.
    ...(her ? { her: { name: nameOf(content, her.id, state.lang), item: worn(state.wear?.[her.id]), card: herCard(content, state) } } : {}),
    // What the fight takes from them (cards.mjs § 装备入局): 主灵根一击 +power,
    // 护体 armor, 抗 by element, the 符 in hand, and the roots they lend.
    fight: (() => {
      const g = gearFight(content, state), lent = [...rootsOf(content, state)].filter(r => !(state.traits ?? []).includes(r));
      return { power: g.power, armor: g.armor, ...(g.ward ? { ward: g.ward } : {}), ...(g.charm ? { charm: g.charm } : {}), ...(lent.length ? { lends: lent } : {}) };
    })(),
    // 组牌 is his from 结丹 on (`can_pick`); before, the roots deal the ten.
    ...(canPick(content, state) ? { can_pick: true } : {}),
    ...(Array.isArray(state.deck) && canPick(content, state) ? { picking: true } : {}),
    bag,
    // 储物袋: used / cap and what waits at the 洞府 (pouch.mjs); a 卖 is drawn only at a 坊市.
    pouch: pouchBrief(content, state),
    ...(placeOf(content, state.place)?.has?.shop ? { market: true } : {}),
    // 牌 — every card he holds, cheapest first, and which ten a fight deals
    // today (deckFor), 银月 always in hand. Roots he lacks are marked, not hid.
    cards: (() => {
      const catalog = cardCatalog(content), ten = new Set(deckFor(content, state)), roots = rootsOf(content, state), picked = new Set(pickedCards(content, state));
      return ownedCards(content, state).map(id => catalog[id]).filter(Boolean)
        .sort((a, b) => a.cost - b.cost || String(a.element ?? '').localeCompare(String(b.element ?? '')))
        .map(c => ({ id: c.id, name: pick(c.name, state.lang), cost: c.cost, kind: c.kind, element: c.element ?? null,
          // Picking, lit is his and a filled card is only marked; else the ten dealt.
          ...(c.id === 'yinyue' ? { hand: true } : Array.isArray(state.deck) && canPick(content, state) ? (picked.has(c.id) ? { deck: true, picked: true } : ten.has(c.id) ? { fill: true } : {}) : ten.has(c.id) ? { deck: true } : {}),
          ...(!usable(c, roots) ? { off_root: true } : {}),
          // 闭关's ★ (rules/seclusion.mjs), and the 灵力 it costs with them.
          ...(state.card_stars?.[c.id] ? { stars: state.card_stars[c.id], cost: costOf({ stars: state.card_stars }, c) } : {}) }));
    })(),
  };
}

export { awayLine, bookOf, breakthroughOf, complete, countsOf, directorBrief, errandFor, filler, FILLERS, GEAR_SLOTS, gearBrief, HANDED_KEEP, handedHere, handedOne, itemBrief, itemOf, noticeAt, noticeOf, offersOf, questDoneBefore, questOf, questReady, settleErrands, withGiver, taskOf, threadOf, onStoryRoad, TIERS_ORDER, wayBack, waypointOf, whereAt, withinRoads, workOf };
