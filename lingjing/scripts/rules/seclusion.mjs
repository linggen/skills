// rules/seclusion.mjs — 闭关修炼: time away from the game, spent on ONE thing.
// Part of the rules engine; rules.mjs is its one door.
//
// His, 2026-09-24 (approved, 「one pick」 per seclusion): when 体力 is spent — or
// whenever the player likes — they go into 闭关 on one focus: a 功法 of theirs
// (it gains ★), 修为, or the 本命法宝 (its 重). The hours are real, counted by
// the rules from the save's own stamp and ctx.now, never the page's clock, at
// most `cap_hours`; under `min_hours` nothing grows. While in 闭关 the world
// holds still (`in-seclusion`, like a fight): the only way on is 出关, and the
// stage puts its card first. Playing stays better than sitting — the numbers
// are in rewards.json § seclusion.
import { addStamina, pick } from '../state.mjs';
import { costOf } from '../battle.js';
import { growTreasure, TREASURE_TOP, treasureBrief } from './arms.mjs';
import { cardCatalog, ownedCards, rootsOf, usable } from './cards.mjs';
import { clone, pay, refuse } from './core.mjs';
import { itemOf } from './errands.mjs';

const RULE = content => content.rewards.seclusion ?? null;
const HOUR = 3600_000;
const round1 = n => Math.round(n * 10) / 10;

/* The one-word foci, each with what it grows and whether it may be chosen. */
const FOCI = ['card', 'progress', 'treasure'];

/* A 功法 he holds and can cast, not yet at the top star: what 闭关 can temper. */
function spellsOf(content, state) {
  const catalog = cardCatalog(content), roots = rootsOf(content, state), top = RULE(content).star_top;
  return ownedCards(content, state).map(id => catalog[id])
    .filter(c => c && c.kind === 'spell' && !c.charm && !c._token && usable(c, roots))
    .map(c => ({ c, star: state.card_stars?.[c.id] ?? 0 }))
    .filter(x => x.star < top);
}
/* A spell as the chooser shows it: its 灵力 now (stars counted), what the
   next star does — `cost` (灵力 −1) or `power` (+1, once it costs 1) — and
   the hours still owed for it (his, 2026-09-24: the chips read as levels). */
const spellBrief = (content, state, { c, star }) => {
  const study = round1(state.card_study?.[c.id] ?? 0), cost = costOf({ stars: { [c.id]: star } }, c);
  return {
    id: c.id, name: pick(c.name, state.lang), star, top: RULE(content).star_top, cost, element: c.element ?? null,
    study, left: round1(Math.max(0, RULE(content).star_hours - study)), next: cost > 1 ? 'cost' : 'power',
  };
};
const treasureOpen = (content, state) => Boolean(state.treasure) && state.treasure.level < TREASURE_TOP;

/* The pills that quicken it, held now. */
function pillsOf(content, state) {
  return Object.entries(RULE(content).pills ?? {}).filter(([id]) => state.bag?.[id] > 0)
    .map(([id, mult]) => ({ id, name: pick(itemOf(content, id)?.name, state.lang) ?? id, mult, n: state.bag[id] }));
}

/* What may be chosen going in: the page's 闭关 card reads this. */
function choices(content, state) {
  return {
    spells: spellsOf(content, state).map(x => spellBrief(content, state, x)),
    progress: true,
    treasure: treasureOpen(content, state) ? treasureBrief(content, state) : null,
    pills: pillsOf(content, state),
    rule: RULE(content),
  };
}

/* The hours in: real (capped), and as counted (a pill's multiplier). */
function hoursOf(content, sec, now) {
  const r = RULE(content), real = Math.min(r.cap_hours, Math.max(0, (now - new Date(sec.since)) / HOUR));
  return { real, counted: real * (sec.mult ?? 1), grows: real >= r.min_hours };
}

/* Each focus, grown by `hours`, on the state in hand — one entry per focus,
   so a new focus is a row here, never another branch. */
const GROW = {
  card: (content, s, sec, hours) => {
    const r = RULE(content), id = sec.card, catalog = cardCatalog(content);
    const from = s.card_stars?.[id] ?? 0;
    const pool = (s.card_study?.[id] ?? 0) + hours;
    const to = Math.min(r.star_top, from + Math.floor(pool / r.star_hours));
    const left = to >= r.star_top ? 0 : pool - (to - from) * r.star_hours;
    s.card_stars = { ...s.card_stars, [id]: to };
    s.card_study = { ...s.card_study, [id]: round1(left) };
    if (!s.card_study[id]) delete s.card_study[id];
    if (!Object.keys(s.card_study).length) delete s.card_study;
    const c = catalog[id];
    return { card: { id, name: pick(c?.name, s.lang), from, to, cost: costOf({ stars: { [id]: to } }, c), was: c?.cost, study: round1(left), need: r.star_hours } };
  },
  progress: (content, s, sec, hours, ctx) => {
    const r = RULE(content), want = Math.floor(hours * r.progress_per_hour);
    if (!want) return { progress: { paid: 0 } };
    const p = pay(content, s, ctx, { table: 'seclusion', progress: want });
    return { progress: { paid: p.progress, levels: p.levels, ...(p.hold ? { hold: p.hold } : {}) } };
  },
  treasure: (content, s, sec, hours) => {
    const r = RULE(content), from = s.treasure?.level ?? 0;
    if (!s.treasure) return { treasure: null };
    let pool = (s.treasure.tempered ?? 0) + hours;
    while (pool >= r.treasure_hours && growTreasure(content, s, 'seclusion')) pool -= r.treasure_hours;
    const top = s.treasure.level >= TREASURE_TOP;
    s.treasure = { ...s.treasure, tempered: top ? 0 : round1(pool) };
    if (!s.treasure.tempered) { const { tempered, ...t } = s.treasure; s.treasure = t; }
    return { treasure: { name: s.treasure.name, from, to: s.treasure.level, step: treasureBrief(content, s).step, tempered: top ? 0 : round1(pool), need: r.treasure_hours } };
  },
};

/* 出关 on the state in hand (a copy): what grew, and the seclusion closed.
   The same reckoning serves the running card's preview — on a copy — and the
   settle, so what the card says is what lands. */
function emergeOn(content, s, ctx) {
  const sec = s.seclusion, r = RULE(content), h = hoursOf(content, sec, ctx.now);
  delete s.seclusion;
  const grown = h.grows ? GROW[sec.focus](content, s, sec, h.counted, ctx) : {};
  // Rested: a long enough sitting is a full pool, whatever the focus.
  const rested = h.real >= r.rest_hours;
  if (rested) { addStamina(content, s, content.rewards.stamina.max, ctx.now); delete s.resting; }
  return { focus: sec.focus, since: sec.since, hours: round1(h.real), counted: round1(h.counted), cap: r.cap_hours, min: r.min_hours,
    grows: h.grows, ...(sec.pill ? { pill: { id: sec.pill, name: pick(itemOf(content, sec.pill)?.name, s.lang), mult: sec.mult } } : {}),
    ...(rested ? { rested: true } : {}), ...grown };
}

/* Look's `seclusion`: the one running, as it would settle right now. */
export function seclusionBrief(content, state, now) {
  if (!state.seclusion || !RULE(content)) return null;
  const told = emergeOn(content, clone(state), { now });
  return { ...told, running: true, rest_hours: RULE(content).rest_hours };
}

/* 闭关 — `info` (what may be chosen; what is running), `enter` with `focus`
   (card + `id`, progress, treasure) and an optional `pill`, `leave` (出关:
   the rules count the hours and settle). */
export function seclude(state, content, ctx, args) {
  if (!RULE(content)) return refuse('no-seclusion', null);
  const action = String(args.action ?? 'info');
  const act = ACTIONS[action];
  if (!act) return refuse('unknown-action', null, { actions: Object.keys(ACTIONS) });
  return act(state, content, ctx, args);
}

const ACTIONS = {
  info: (state, content, ctx) => ({ state: null, result: { ok: true, ...(state.seclusion ? { seclusion: seclusionBrief(content, state, ctx.now) } : { choices: choices(content, state) }) } }),
  enter: enterSeclusion,
  leave: (state, content, ctx) => {
    if (!state.seclusion) return refuse('not-secluded', null);
    const s = clone(state);
    const emerged = emergeOn(content, s, ctx);
    return { state: s, result: { ok: true, emerged } };
  },
};

/* Refused going in, by focus — null when the focus may be taken. */
const FOCUS_CHECK = {
  card: (content, state, args) => {
    const spell = spellsOf(content, state).find(x => x.c.id === String(args.id ?? ''));
    return spell ? null : ['not-a-spell', { zh: '这张牌不能在闭关里温养。', en: 'That card cannot be tempered in seclusion.' }];
  },
  progress: () => null,
  treasure: (content, state) => (treasureOpen(content, state) ? null
    : [state.treasure ? 'treasure-top' : 'no-treasure', state.treasure ? { zh: '本命法宝已是九重。', en: 'Your treasure is at its ninth layer.' } : { zh: '还没有本命法宝。', en: 'No treasure is bound yet.' }]),
};

function enterSeclusion(state, content, ctx, args) {
  const lang = state.lang;
  if (state.seclusion) return refuse('in-seclusion', pick(SAY_IN, lang));
  const focus = String(args.focus ?? '');
  if (!FOCI.includes(focus)) return refuse('no-such-focus', null, { foci: FOCI, choices: choices(content, state) });
  const no = FOCUS_CHECK[focus](content, state, args);
  if (no) return refuse(no[0], pick(no[1], lang), { choices: choices(content, state) });
  const pillId = String(args.pill ?? '').trim();
  const mult = pillId ? RULE(content).pills?.[pillId] : null;
  if (pillId && !mult) return refuse('not-a-seclusion-pill', null, { pills: pillsOf(content, state) });
  if (pillId && !(state.bag?.[pillId] > 0)) return refuse('not-in-bag', null);
  const s = clone(state);
  if (pillId) { s.bag[pillId] -= 1; if (!s.bag[pillId]) delete s.bag[pillId]; }
  s.seclusion = { focus, since: ctx.now.toISOString(), ...(focus === 'card' ? { card: String(args.id) } : {}), ...(pillId ? { pill: pillId, mult } : {}) };
  return { state: s, result: { ok: true, entered: seclusionBrief(content, s, ctx.now) } };
}

const SAY_IN = { zh: '正在闭关。先出关，再做别的。', en: 'You are in seclusion. Come out first.' };

/* ── While in 闭关, the world holds still ──
   The verbs that change the world are refused `in-seclusion` (the simpler
   honest rule: nothing ends a seclusion but 出关, and 出关 is one tap on the
   stage's first card). Reading, Show, the language and the seclusion's own
   verb stand. `true` holds the verb; a function holds only the calls it says. */
const SECLUSION_HOLDS = {
  resolve: true, move: true, go: true, enter: true, leave: true, trade: true, tale: a => !['info', 'seed'].includes(a.action),
  meet: true, tame: true, refine: true, task: a => a.action !== 'list', win: true, duel: true, travel: true, build: true,
  load: true, make: true, amend: true, lundao: true, divine: true, ring: true, deck: true,
  quest: a => !['info', 'kaifu'].includes(a.action),
};
export function seclusionHold(state, verb, args = {}) {
  const hold = state?.seclusion ? SECLUSION_HOLDS[verb] : null;
  if (!hold || (typeof hold === 'function' && !hold(args))) return null;
  return refuse('in-seclusion', pick(SAY_IN, state.lang));
}
