// fights.mjs — where he can fight, on the map (Hanli 2026-10-27: 「打怪的后山, 加一个战斗icon, 让玩家能看出来啊」).
// Every place he can walk to where a beast stands now — a pool's (the one it deals next) or a haunt's — with the
// roads there and the fight as its door would set it up, so the page grades it against his power (fightodds.js)
// and the map, the plate and 去往 wear a small 斗 seal. Facts only; the page draws.
//
//   fightsNear(content, state, now) → [{ id, name, steps, creature: { id, name }, game, pool?, setup }], nearest first
import { allPlaces, encounterOf, hiddenRoom, pathOf, placeName, placeOf } from './world.mjs';

/* Roads away worth showing: the stretch he can reach on foot this sitting (the 观's plate, a town's streets). */
export const FIGHTS_MAX_STEPS = 8;

export function fightsNear(content, state, now = new Date()) {
  const here = placeOf(content, state?.place);
  if (!here || state.fight) return [];
  const out = [];
  for (const p of allPlaces(content)) {
    if (!(p.has?.pool != null || p.has?.creature) || hiddenRoom(content, state, p)) continue;
    const steps = p.id === here.id ? 0 : pathOf(content, state, here, p, now)?.length ?? null;
    if (steps == null || steps > FIGHTS_MAX_STEPS) continue;
    // The beast as he would meet it there now (world.mjs encounterOf: the pool's draw, its rest; the haunt's beast).
    const e = encounterOf(content, { ...state, place: p.id, scene: p.id === here.id ? state.scene : null }, now);
    if (!e?.duel || e.tamed || e.won || e.withdrawn || (e.catch && !e.beaten) || e.duel.today?.outcome) continue;
    out.push({ ...placeName(content, state, p), steps, creature: e.creature, game: e.game, ...(e.pool ? { pool: e.pool.name } : {}), setup: e.duel.setup });
  }
  return out.sort((a, b) => a.steps - b.steps);
}
