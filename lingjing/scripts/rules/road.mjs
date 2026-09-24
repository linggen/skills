// rules/road.mjs — 路上: what an arrival meets on the road, one thing at most.
// Part of the rules engine; rules.mjs is its one door.
//
// redesign-v2 § 四 (2026-09-24): 遇 · 拾遗 · 抉择 · 机缘 · 拦路 were five names
// for one thing — something met on the road — and are one system now, in this
// one book of rules. An arrival deals AT MOST ONE, veiled until Ling has set
// the moment (Meet reveal), and every kind is answered by the one verb, Meet,
// with one set of refusals. What each kind may be is still read from its old
// sources, which other lanes keep writing: meets.json (finds, riddles, the
// 抉择's dice and stakes, the weights), a place's `meets` (which kinds it may
// deal), and the 机缘's config below with rewards.json's `chance` table.
//
//   kind     what it is                           answered by
//   chance   机缘 — the day's one, where it lies   take (while it lasts)
//   find     拾遗 — a thing or stones by the road  take · pass
//   riddle   路人问 — a traveller's riddle          answer · pass (the chat's question)
//   trial    抉择 — Ling writes the ways            offer · choose · pass
//   beast    拦路 — a beast of the province         the duel card (tasks.mjs duel) · pass
//
// Refusals, every kind: `nothing-here` (nothing met here now, or already
// answered), `gone` (a 机缘 past its hour), `not-veiled`, `unknown-action`
// (with the `actions` this kind takes), and the kind's own: `needs-answer`,
// `wrong-answer`, `riddle-closed`, `not-playable`, `already-offered`,
// `not-offered`, `no-such-way`.
import { dayKey, normalizeAnswer, pick } from '../state.mjs';
import { winCard } from './cards.mjs';
import { hasCompanion } from './companion.mjs';
import { clone, pay, refuse, RIDDLE_TRIES, spendStamina } from './core.mjs';
import { itemOf, offersOf } from './errands.mjs';
import { hashOf } from './travel.mjs';
import { allPlaces, atScene, creatureOf, inMade, placeOf, provinceOpen, tooHard } from './world.mjs';

/* ── 机缘 — the day's one chance, somewhere near, for a few real hours ──
   His pick, 2026-09-23 (觅长生's 过时不候, Lifeline's real clock): once a day,
   the first time the game is opened, the rules set a 机缘 at a place within
   two roads — open, within his realm, not where he stands — for `hours` of
   real time. Arriving there while it lasts, it is that arrival's one thing on
   the road: a card he does not hold and the chance table's pay. Missed, it is
   gone. Never in a made world or before the roots are set. */
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

function dealChance(content, s, ctx) {
  const day = dayKey(ctx.now);
  if (s.chance?.day === day || !s.traits?.length || inMade(s) || !content.rewards.tables.chance) return null;
  const near = nearPlaces(content, s, ctx.now, CHANCE.reach);
  if (!near.length) return null;
  const at = near[hashOf(`${day}|${s.name ?? ''}|chance`) % near.length];
  return { day, place: at.id, until: new Date(ctx.now.getTime() + CHANCE.hours * 3600000).toISOString() };
}
const chanceLive = (state, now) => Boolean(state.chance && !state.chance.taken && dayKey(now) === state.chance.day && now < new Date(state.chance.until));

/* Where today's 机缘 lies and how long it lasts — the rumor Ling may speak and
   the book counts down; `here` when he stands on it. */
function chanceBrief(content, state, now) {
  const c = state.chance;
  if (!c || c.day !== dayKey(now)) return null;
  const place = { id: c.place, name: pick(placeOf(content, c.place)?.name, state.lang) };
  if (c.taken) return { place, taken: true };
  if (now >= new Date(c.until)) return { place, missed: true };
  return { place, until: c.until, minutes_left: Math.ceil((new Date(c.until) - now) / 60000), ...(state.place === c.place ? { here: true } : {}) };
}

/* ── What an arrival meets ──
   Where the place holds nothing of its own, the rules deal ONE: something
   found, a traveller's riddle, a beast on the road, a 抉择 — or, where it
   lies, the day's 机缘, which comes before anything the place holds. Drawn
   by the day, the place and the 道号 — a reload rerolls nothing — and once
   per place per day, so walking to and fro is not a farm (design.md § 路上). */
const meetsToday = (state, now) => (state.meets?.day === dayKey(now) ? state.meets.places ?? {} : {});
const meetHere = (state, now) => meetsToday(state, now)[state.place] ?? null;

/* What the place holds by itself: a scene, an errand offered, a shelf, a
   beast still to be met. Any of these IS the arrival. A seed is not: 今日传闻
   is one more option in the question, and a place that offered only that was
   the empty arrival he complained of (吕梁洪, 2026-09-21). */
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

/* How each drawn kind is laid down — its own hash for which one, so bits of
   the kind's roll never pick the same thing every time (夔 fifteen of fifteen). */
const DEAL = {
  find: (content, pickOf, pool) => { const f = pickOf(pool.find); return { find: f.book, n: f.n }; },
  riddle: (content, pickOf, pool) => ({ key: pickOf(pool.riddle), tried: [] }),
  // The dice are thrown now, one per way through, and kept: Ling writes the
  // ways without knowing them, so she cannot set a mark to fit a roll.
  trial: (content, pickOf, pool, seed) => {
    const die = content.meets.trial.die, max = content.meets.trial.options.max;
    return { rolls: Array.from({ length: max }, (_, i) => (hashOf(`${seed}|trial|${i}`) % die) + 1) };
  },
  beast: (content, pickOf, pool) => ({ creature: pickOf(pool.beast) }),
};

/* The one thing this arrival meets, or null. Veiled: the stage shows mist
   until Ling has set the moment and calls Meet reveal (his, 2026-09-22:
   月黑风高…突然…然后webUI出现怪物卡). */
function dealMeet(content, state, ctx) {
  if (inMade(state) || meetHere(state, ctx.now)) return null;
  // The day's 机缘, where it lies, is the arrival's one thing — before anything the place holds.
  if (chanceLive(state, ctx.now) && state.place === state.chance.place) return { kind: 'chance', veiled: true };
  if (!content.meets || ownHere(content, state, ctx)) return null;
  const pool = meetPool(content, state, ctx);
  // A place says which it may deal — a ferry has travellers, a marsh has
  // beasts (`meets` on the place; unsaid, any). 抉择 fits anywhere.
  const allowed = placeOf(content, state.place).meets;
  const kinds = Object.entries(content.meets.weights).filter(([k, w]) => w > 0 && DEAL[k] && pool[k]?.length && (!allowed || allowed.includes(k) || k === 'trial'));
  if (!kinds.length) return null;
  const roll = hashOf(`${dayKey(ctx.now)}|${state.name ?? ''}|${state.place}|meet`);
  let at = roll % kinds.reduce((n, [, w]) => n + w, 0);
  const [kind] = kinds.find(([, w]) => (at -= w) < 0);
  const nth = list => hashOf(`${dayKey(ctx.now)}|${state.place}|${state.name ?? ''}|which`) % list.length;
  return { kind, ...DEAL[kind](content, list => list[nth(list)], pool, `${dayKey(ctx.now)}|${state.place}|${state.name ?? ''}`), veiled: true };
}

/* Lay down what this arrival meets, on the save being written: nothing when
   an errand met here was the arrival's event (`quiet`). Returns what was dealt. */
function arriveOnRoad(content, s, ctx, quiet = false) {
  const dealt = quiet ? null : dealMeet(content, s, ctx);
  if (dealt) s.meets = { day: dayKey(ctx.now), places: { ...meetsToday(s, ctx.now), [s.place]: dealt } };
  return dealt;
}

const findOf = (content, meet) => content.meets.finds[meet.find][meet.n];

/* ── Telling it: what Ling speaks, what the stage draws ── */

const TRIAL_BONUS = (content, meet) => (meet.companion ? content.meets.trial.companion : 0);
/* What the page and Ling see of each way through: its words, how hard, what
   it risks, and the odds — never the roll, never the outcome lines before
   the choice (those are committed, and shown only for the way taken). */
function trialOptions(content, meet) {
  const t = content.meets.trial;
  return meet.options.map((o, n) => {
    const need = Math.max(1, t.marks[o.difficulty] - TRIAL_BONUS(content, meet));
    return { n, label: o.label, difficulty: o.difficulty, stake: o.stake, chance: Math.round(((t.die - need + 1) / t.die) * 100) };
  });
}

const BRIEF = {
  chance: (content, meet, state, now) => ({ kind: 'chance', ...(chanceBrief(content, state, now) ?? {}) }),
  find: (content, meet, state) => {
    const f = findOf(content, meet), item = f.item ? itemOf(content, f.item) : null;
    return { kind: 'find', line: pick(f.line, state.lang), ...(item ? { item: { id: item.id, name: pick(item.name, state.lang) } } : { wealth: f.wealth }) };
  },
  riddle: (content, meet, state) => {
    const r = content.riddles[state.lang].riddles[meet.key], tried = new Set((meet.tried ?? []).map(normalizeAnswer));
    return { kind: 'riddle', riddle: r.q, choices: r.choices.filter(c => !tried.has(normalizeAnswer(c))), ...(meet.tried?.length ? { hint: r.hint } : {}) };
  },
  trial: (content, meet) => ({ kind: 'trial', ...(meet.options ? { options: trialOptions(content, meet) } : { waiting: true }) }),
  beast: (content, meet, state) => ({ kind: 'beast', creature: { id: meet.creature, name: pick(creatureOf(content, meet.creature).name, state.lang) } }),
};

/* What is met here, as Look and Move tell it — null when nothing, or answered. */
function meetBrief(content, state, now) {
  const meet = meetHere(state, now);
  if (!meet || meet.done || !BRIEF[meet.kind]) return null;
  const brief = BRIEF[meet.kind](content, meet, state, now);
  return meet.veiled ? { ...brief, veiled: true } : brief;
}

/* ── 抉择 — Ling writes the ways through, the rules threw the dice ──
   What a way through risks, and what losing it takes. Only a stake named
   here is ever accepted: an unknown one was once read as a wound (review,
   2026-09-24: `toString` passed the lint and took nothing, then NaN). */
const STAKES = {
  coin: (content, s, ctx, n) => {
    const lost = Math.min(s.wealth, n);
    s.wealth -= lost;
    return { lost: { wealth: lost } };
  },
  // Hurt on the road: 伤势 was cut (redesign-v2 § 四), so a wound is 体力 —
  // the share of the pool (meets.json trial.lose.wound), never below 0.
  wound: (content, s, ctx, share) => {
    const lost = Math.min(s.stamina, Math.ceil(content.rewards.stamina.max * share));
    s.stamina -= lost;
    if (s.stamina === 0) s.resting = true;
    return { lost: { stamina: lost } };
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
  if (success) {
    const win = t.win[o.difficulty];
    const paid = pay(content, s, ctx, { table: 'trial', progress: win.progress ?? 0, wealth: win.wealth ?? 0 });
    return { success, line: o.win, paid };
  }
  return { success, line: o.lose, ...STAKES[o.stake](content, s, ctx, t.lose[o.stake][o.difficulty]) };
}

/* ── Meet — every answer to what the road holds, one verb ──
   Each row takes (content, s, ctx, here, args), `s` a copy it may write; `*`
   rows answer any kind. Taken, answered or passed by his own word, the mist
   is gone either way. */
const put = (s, here) => { s.meets.places[s.place] = here; };
const close = (s, here, extra = {}) => put(s, { ...here, ...extra, done: true });
const unveiled = here => { const { veiled, ...open } = here; return open; };

const ROAD = {
  // 揭 — the moment has been set; the card comes up and the question with it.
  // A 抉择 whose ways were never written has nothing to show: it passes.
  '*:reveal': (content, s, ctx, here) => {
    if (!here.veiled) return refuse('not-veiled', null);
    if (here.kind === 'trial') { close(s, unveiled(here)); return { state: s, result: { ok: true, revealed: 'nothing' } }; }
    put(s, unveiled(here));
    return { state: s, result: { ok: true, revealed: here.kind, meet: meetBrief(content, s, ctx.now) } };
  },
  '*:pass': (content, s, ctx, here) => { close(s, unveiled(here)); return { state: s, result: { ok: true, passed: here.kind } }; },
  // 机缘 — 收下 while it lasts: a card he does not hold and the chance table.
  'chance:take': (content, s, ctx, here) => {
    if (!chanceLive(s, ctx.now) || s.chance.place !== s.place) return refuse('gone', pick({ zh: '来迟了，机缘已散。', en: 'Too late — it is gone.' }, s.lang));
    s.chance = { ...s.chance, taken: ctx.now.toISOString() };
    const t = content.rewards.tables.chance;
    const card = winCard(content, s, { id: `chance:${s.place}`, root: (s.traits ?? [])[0] }, ctx.now, 'chance');
    const paid = pay(content, s, ctx, { table: 'chance', progress: t.progress, wealth: t.wealth });
    close(s, unveiled(here));
    return { state: s, result: { ok: true, took: null, ...(card ? { card } : {}), paid, chance: true } };
  },
  'find:take': (content, s, ctx, here) => {
    const f = findOf(content, here);
    if (f.item) s.bag[f.item] = (s.bag[f.item] ?? 0) + 1;
    const paid = f.item ? null : pay(content, s, ctx, { table: 'meet', wealth: f.wealth });
    close(s, unveiled(here));
    return { state: s, result: { ok: true, took: f.item ? { id: f.item, name: pick(itemOf(content, f.item).name, s.lang) } : null, paid } };
  },
  'riddle:answer': (content, s, ctx, here, args) => {
    const open = unveiled(here), said = normalizeAnswer(args.answer ?? '');
    if (!said) return refuse('needs-answer', null, { choices: BRIEF.riddle(content, open, s).choices });
    const right = ['zh', 'en'].some(l => content.riddles[l].riddles[open.key].a.some(a => normalizeAnswer(a) === said));
    if (!right) {
      const tried = [...(open.tried ?? []), String(args.answer)];
      // A traveller's riddle is missed as often as any other (RIDDLE_TRIES):
      // then he walks on, and the road is quiet (review, 2026-09-24).
      if (tried.length >= RIDDLE_TRIES) { close(s, open, { tried }); return { state: s, result: { ok: false, refused: 'riddle-closed', say: null } }; }
      put(s, { ...open, tried });
      const left = meetBrief(content, s, ctx.now);
      return { state: s, result: { ok: false, refused: 'wrong-answer', hint: left.hint, choices: left.choices } };
    }
    s.riddles_seen = [...new Set([...(s.riddles_seen ?? []), open.key])];
    const paid = pay(content, s, ctx, { table: 'meet', progress: content.rewards.tables.meet.progress });
    close(s, open);
    return { state: s, result: { ok: true, answered: true, paid } };
  },
  // 抉择: Ling's ways through, checked, and the card comes up with them.
  'trial:offer': (content, s, ctx, here, args) => {
    if (here.options) return refuse('already-offered', null, { meet: meetBrief(content, s, ctx.now) });
    const linted = lintTrial(content, args.options);
    if (!linted.options) return refuse('not-playable', null, { why: linted.why });
    put(s, { ...unveiled(here), options: linted.options, companion: hasCompanion(s) });
    return { state: s, result: { ok: true, offered: linted.options.length, meet: meetBrief(content, s, ctx.now) } };
  },
  'trial:choose': (content, s, ctx, here, args) => {
    const n = Number(args.n);
    if (!here.options) return refuse('not-offered', null);
    if (!Number.isInteger(n) || !here.options[n]) return refuse('no-such-way', null, { ways: here.options.length });
    const empty = spendStamina(content, s, ctx, 'trial');
    if (empty) return empty;
    const out = settleTrial(content, s, ctx, here, n);
    close(s, here, { chose: n, success: out.success });
    return { state: s, result: { ok: true, chose: n, ...out } };
  },
};
const actionsFor = kind => Object.keys(ROAD).filter(k => k.startsWith(`${kind}:`) || k.startsWith('*:')).map(k => k.split(':')[1]);

export function meet(state, content, ctx, args) {
  const s = clone(state), here = meetHere(s, ctx.now), action = String(args.action ?? '');
  if (!here || here.done) return refuse('nothing-here', null);
  const row = ROAD[`${here.kind}:${action}`] ?? ROAD[`*:${action}`];
  if (!row) return refuse('unknown-action', null, { actions: actionsFor(here.kind) });
  return row(content, s, ctx, here, args);
}

export { arriveOnRoad, chanceBrief, chanceLive, dealChance, dealMeet, meetBrief, meetHere, meetsToday };
