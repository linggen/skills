// rules/daily.mjs — 机缘 and 问候: the day's chance, her greeting, 体力.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, staminaReturnsAt, stepName } from '../state.mjs';
import { winCard } from './cards.mjs';
import { hasCompanion } from './companion.mjs';
import { clone, pay, refuse } from './core.mjs';
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
  const c = chanceBrief(content, state, ctx.now);
  if (c && !c.taken && !c.missed) facts.push(zh ? `今天${c.place.name}有一份机缘` : `a chance waits at ${c.place.name} today`);
  facts.push(zh ? `玩家如今是${stepName(content, state.tier, state.step, state.lang)}` : `the player stands at ${stepName(content, state.tier, state.step, state.lang)}`);
  s.greeted = day;
  return { state: s, result: { ok: true, first: true, name: state.name ?? null, facts } };
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

export { chanceBrief, chanceLive, dealChance, staminaBrief };
