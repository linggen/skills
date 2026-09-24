// rules/daily.mjs — 问候 and 体力: her greeting on the day's first opening, the pool as the stage draws it.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, staminaReturnsAt, stepName } from '../state.mjs';
import { hasCompanion } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { chanceBrief } from './road.mjs';
import { creatureOf } from './world.mjs';

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

export { staminaBrief };
