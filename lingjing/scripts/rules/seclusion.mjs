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
import { lockedOf, pick, poolSpent, seclusionMsPerPoint, settleStamina, staminaMax, staminaRest } from '../state.mjs';
import { boundOf, growTreasure, TREASURE_TOP, treasureBrief } from './arms.mjs';
import { clone, pay, refuse } from './core.mjs';
import { itemOf } from './errands.mjs';
import { cureDandu, eatPill } from './dandu.mjs';
import { secludeHour } from './playpay.mjs';

const RULE = content => content.rewards.seclusion ?? null;
const HOUR = 3600_000;
const round1 = n => Math.round(n * 10) / 10;

/* The one-word foci, each with what it grows and whether it may be chosen. */
const FOCI = ['progress', 'treasure'];

const treasureOpen = (content, state) => Boolean(boundOf(content, state)) && state.treasure.level < TREASURE_TOP;

/* The pills that quicken it, held now. */
function pillsOf(content, state) {
  return Object.entries(RULE(content).pills ?? {}).filter(([id]) => state.bag?.[id] > 0)
    .map(([id, mult]) => ({ id, name: pick(itemOf(content, id)?.name, state.lang) ?? id, mult, n: state.bag[id] }));
}

/* What may be chosen going in: the page's 闭关 card reads this. */
function choices(content, state) {
  return {
    progress: true,
    // 修为 an hour at the layer he sits on, as it lands (a night's share of the layer over its hours).
    per_hour: Math.round(secludeHour(content, state) ?? 0),
    treasure: treasureOpen(content, state) ? treasureBrief(content, state) : null,
    pills: pillsOf(content, state),
    // The whole pool's hours in 闭关 (rewards.json stamina.refill), for the chooser's rule line — as `rest_hours` too, the
    // field the phone's line reads (「满{rest}小时体力回满」 stays true: linear, whole at that hour).
    rule: { ...RULE(content), fill_hours: content.rewards.stamina.refill?.seclusion_hours ?? null, rest_hours: content.rewards.stamina.refill?.seclusion_hours ?? RULE(content).rest_hours },
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
  progress: (content, s, sec, hours, ctx) => {
    // An hour's share of the layer he sits on (balance.json play_pay.seclusion, rules/playpay.mjs secludeHour).
    const want = Math.floor(hours * (secludeHour(content, s) ?? 0));
    if (!want) return { progress: { paid: 0 } };
    const p = pay(content, s, ctx, { table: 'seclusion', progress: want });
    // Past the cap the rest is 灵石 (rules/cap.mjs landProgress): 出关's card says both.
    return { progress: { paid: p.progress, levels: p.levels, ...(p.hold ? { hold: p.hold } : {}), ...(p.converted ? { converted: p.converted } : {}) } };
  },
  treasure: (content, s, sec, hours) => {
    const r = RULE(content), from = s.treasure?.level ?? 0;
    if (!boundOf(content, s)) return { treasure: null };
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
  // 体力 came back all through the sitting, at the 闭关 rate on real minutes, whatever the focus and under
  // `min_hours` too (state.mjs settleStamina; Hanli 2026-11-02: 「体力不要自动回, 只有闭关才回」) — settled to now.
  const before = s.stamina;
  settleStamina(content, s, ctx.now);
  delete s.seclusion;
  // Kept for the breakthrough's chance: a 闭关 just done steadies it (breakthrough.mjs).
  s.last_seclusion = { at: ctx.now.toISOString(), hours: round1(h.real) };
  const grown = h.grows ? GROW[sec.focus === 'card' ? 'progress' : sec.focus](content, s, sec, h.counted, ctx) : {};
  // 补转: the body makes up the turns a pill's furnace left out, whatever the focus (rules/dandu.mjs).
  const topBefore = staminaMax(content, s), whole = s.stamina >= topBefore;
  const made = cureDandu(content, s, h.real);
  // …and a pool whole at the lowered top rises with it as the turns are made up: the sitting rested him whole.
  if (whole && staminaMax(content, s) > topBefore) s.stamina = staminaMax(content, s);
  const gained = Math.max(0, (s.stamina ?? 0) - (before ?? 0)), rested = gained > 0 && s.stamina >= staminaMax(content, s);
  if (s.resting && s.stamina >= staminaRest(content, s)) delete s.resting;
  return { focus: sec.focus === 'card' ? 'progress' : sec.focus, since: sec.since, hours: round1(h.real), counted: round1(h.counted), cap: r.cap_hours, min: r.min_hours,
    grows: h.grows, ...(sec.pill ? { pill: { id: sec.pill, name: pick(itemOf(content, sec.pill)?.name, s.lang), mult: sec.mult } } : {}),
    stamina: { gained, now: s.stamina, max: staminaMax(content, s) }, ...(rested ? { rested: true } : {}), ...(made ? { buzhuan: { made, left: s.dandu ?? 0 } } : {}), ...grown };
}

/* What is being worked on, from the first minute: its name and level, and
   the hours toward its next step — `pool` of `need`, `at` when it lands (his,
   2026-09-24: the running card said 「闭关中 ·」 and nothing of what or how far). */
const TARGET = {
  progress: (content, s, sec, counted) => ({ now: s.progress, per_hour: Math.round(secludeHour(content, s) ?? 0), pool: counted, need: 1 }),
  treasure: (content, s, sec, counted) => (boundOf(content, s) ? { name: s.treasure.name, level: s.treasure.level, step: treasureBrief(content, s).step,
    pool: (s.treasure.tempered ?? 0) + counted, need: RULE(content).treasure_hours, done: s.treasure.level >= TREASURE_TOP } : null),
};
function targetOf(content, state, now) {
  const sec = state.seclusion, h = hoursOf(content, sec, now), t = TARGET[sec.focus === 'card' ? 'progress' : sec.focus]?.(content, state, sec, h.counted);
  if (!t) return null;
  const into = t.pool % t.need, left = (t.need - into) / (sec.mult ?? 1);
  const cap = new Date(new Date(sec.since).getTime() + RULE(content).cap_hours * HOUR);
  const at = new Date(now.getTime() + left * HOUR);
  return { ...t, into: round1(into), at: t.done || at > cap ? null : at.toISOString() };
}

/* Look's `seclusion`: the one running, as it would settle right now. */
export function seclusionBrief(content, state, now) {
  if (!state.seclusion || !RULE(content)) return null;
  const told = emergeOn(content, clone(state), { now });
  // `art`: the closed 洞府 gate the stage paints behind the running card (his, 2026-09-24).
  // `full_at`: when the pool is whole at the 闭关 rate (null when it is); `fill_hours` the whole pool's hours, for the card.
  const ms = seclusionMsPerPoint(content), max = staminaMax(content, state);
  const left = Math.max(0, max - told.stamina.now), at = ms && left ? new Date(now.getTime() + left * ms).toISOString() : null;
  // `left_min`: the minutes until the pool is whole (0: whole now — 出关 is his whenever he likes), the time left Ling tells.
  const leftMin = at ? Math.max(0, Math.ceil((new Date(at) - now) / 60000)) : 0;
  return { ...told, running: true, fill_hours: content.rewards.stamina.refill?.seclusion_hours ?? null, full_at: at, left_min: leftMin, target: targetOf(content, state, now), ...(RULE(content).art ? { art: RULE(content).art } : {}) };
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
  progress: () => null,
  treasure: (content, state) => (treasureOpen(content, state) ? null
    : [boundOf(content, state) ? 'treasure-top' : 'no-treasure', boundOf(content, state) ? { zh: '本命法宝已是九重。', en: 'Your treasure is at its ninth layer.' } : { zh: '还没有本命法宝。', en: 'No treasure is bound yet.' }]),
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
  if (pillId) { s.bag[pillId] -= 1; if (!s.bag[pillId]) delete s.bag[pillId]; eatPill(content, s, pillId); }
  // `spent`: taken on a spent pool behind a story gate that keeps 闭关 shut — it stands there all the same (rules/locks.mjs).
  const spent = lockedOf(content, state).includes('seclusion') && poolSpent(content, state);
  s.seclusion = { focus, since: ctx.now.toISOString(), ...(pillId ? { pill: pillId, mult } : {}), ...(spent ? { spent: true } : {}) };
  return { state: s, result: { ok: true, entered: seclusionBrief(content, s, ctx.now) } };
}

const SAY_IN = { zh: '正在闭关。先出关，再做别的。', en: 'You are in seclusion. Come out first.' };

/* ── While in 闭关, the world holds still ──
   The verbs that change the world are refused `in-seclusion` (the simpler
   honest rule: nothing ends a seclusion but 出关, and 出关 is one tap on the
   stage's first card). Reading, Show, the language and the seclusion's own
   verb stand. `true` holds the verb; a function holds only the calls it says. 问签 (`divine`) stands too: the day's
   签 is drawn in the morning, often before 出关 (Hanli 11-03: 「闭关也能摇签」). */
const SECLUSION_HOLDS = {
  resolve: true, move: true, go: true, enter: true, leave: true, trade: true, tale: a => !['info', 'seed'].includes(a.action),
  meet: true, tame: true, refine: true, task: a => a.action !== 'list', win: true, duel: true, travel: true, build: true,
  load: true, make: true, amend: true, lundao: true, ring: true, deck: true, fantong: a => a.action === 'feed', haggle: true, duizi: a => ['open', 'reverse'].includes(a.action),
  quest: a => !['info', 'kaifu'].includes(a.action),
};
export function seclusionHold(state, verb, args = {}) {
  const hold = state?.seclusion ? SECLUSION_HOLDS[verb] : null;
  if (!hold || (typeof hold === 'function' && !hold(args))) return null;
  return refuse('in-seclusion', pick(SAY_IN, state.lang));
}
