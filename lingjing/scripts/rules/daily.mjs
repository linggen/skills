// rules/daily.mjs — 机缘, 历练 and 问候: the day's chances, her journeys, her greeting, 体力.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, staminaReturnsAt, stepName } from '../state.mjs';
import { healthBrief, winCard } from './cards.mjs';
import { bondBrief, gainBond, hasCompanion } from './companion.mjs';
import { clone, pay, refuse } from './core.mjs';
import { itemOf } from './errands.mjs';
import { hashOf } from './travel.mjs';
import { creatureOf, inMade, placeOf, provinceOpen, tooHard } from './world.mjs';

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
    if (days >= 1) facts.push(zh ? `玩家上次来是${days === 1 ? '昨天' : `${days} 天前`}` : `the player was last here ${days === 1 ? 'yesterday' : `${days} days ago`}`);
  }
  for (const [id, d] of Object.entries(state.duels ?? {})) {
    if (d.day !== yesterday || d.outcome === 'open') continue;
    const name = pick(creatureOf(content, id)?.name, state.lang);
    const how = { won: zh ? '赢了' : 'won against', lost: zh ? '输给了' : 'lost to', withdrew: zh ? '没打完，它遁走了：' : 'was left unfinished by' }[d.outcome];
    facts.push(zh ? `昨天${how}${name}` : `yesterday the player ${how} ${name}`);
  }
  const h = healthBrief(content, state, ctx.now);
  if (h.now < h.max) facts.push(zh ? `身上还带着伤，气血 ${h.now}/${h.max}` : `still hurt, Life ${h.now}/${h.max}`);
  const c = chanceBrief(content, state, ctx.now);
  if (c && !c.taken && !c.missed) facts.push(zh ? `今天${c.place.name}有一份机缘` : `a chance waits at ${c.place.name} today`);
  const j = journeyBrief(content, state, ctx.now);
  if (j?.back) facts.push(zh ? `你（银月）从${j.place.name}历练回来了，东西还没交给玩家` : `you are back from ${j.place.name}, with things not yet handed over`);
  else if (j) facts.push(zh ? `你（银月）还在${j.place.name}历练` : `you are still out at ${j.place.name}`);
  const b = bondBrief(content, state);
  facts.push(zh ? `你们的羁绊：${b.name}` : `your bond: ${b.name}`);
  facts.push(zh ? `玩家如今是${stepName(content, state.tier, state.step, state.lang)}` : `the player stands at ${stepName(content, state.tier, state.step, state.lang)}`);
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
   step is out of reach — the hour it returns.
   Three hours, each with its own name, so the page labels the one it shows:
   `rest_at` — back to `rest` (20), when an empty pool plays again (null
     unless empty);
   `full_at` — back to the top (100) (null when full);
   `returns_at` — kept for older pages: when he may play again, which is
     `rest_at` while resting and the first point back otherwise (null unless
     empty). It read as "full" on the page and was not (review, 2026-09-24). */
function staminaBrief(content, state, now) {
  const q = content.rewards.stamina;
  // Empty is 0, or resting after 0 until the pool is back to `rest`: the last
  // point buys one thing once a pool (his, 2026-09-23).
  const resting = Boolean(state.resting) && state.stamina < (q.rest ?? 0);
  const empty = state.stamina <= 0 || resting;
  const at = n => staminaReturnsAt(content, state, n).toISOString();
  return { now: state.stamina, max: q.max, step: q.cost.step, empty, ...(resting ? { resting: true } : {}),
    returns_at: empty ? at(resting ? q.rest : 1) : null,
    rest_at: empty ? at(Math.max(1, q.rest ?? 0)) : null,
    full_at: state.stamina < q.max ? at(q.max) : null };
}

export { chanceBrief, chanceLive, dealChance, herAway, journeyBrief, staminaBrief };
