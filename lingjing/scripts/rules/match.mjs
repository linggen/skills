// match.mjs — a pool's beast matched to the player (Hanli 2026-10-27: 「后山的难度可以按照玩家等级, 进度来安排吗, 等玩家
// 强大后, 可以自动增加难度匹配吗? 最好是可以换一匹战斗对象」).
//
// Which beast stands at a pool is no longer a blind draw: of the beasts the pool holds up now (its 回, its `after`,
// the hour, not walking with him, not one of the last few fought), each is played out against his hand as the door
// would set it (fightodds.js, the bands' careful line) and the one nearest the first-meeting band stands — 相当,
// leaning 稍难 (about 45–60% for a careful player), one not yet met first. As he grows (layer, cards, gear) the
// weaker beasts drop out of the band and the stronger take over; where every beast is too easy, the nearest grows a
// little (its 气血, at most ×1.3). The choice is kept on the save (`duels[hunt:<place>].stand`), so a Look reads it
// for free: it is made again only when the hand changes, a fight is fought there, a day turns, or he asks for
// another (「换一只」, `reroll`: free once a visit, then a little 体力).
import { dayKey, pick } from '../state.mjs';
import { fightOdds, oddsKey } from '../fightodds.js';
import { cardCatalog, fightSetup } from './cards.mjs';
import { clone, refuse, spendStamina } from './core.mjs';
import { atScene, creatureOf, foeOf, huntKey, placeOf, poolOf, poolResting, poolUp } from './world.mjs';

/* The band a stand aims at: a careful player wins about half (tests/fight-band-pools.test.mjs holds ~45%). */
export const MATCH = { target: 0.52, low: 0.4, high: 0.65, deals: 8, grow_max: 1.3 };

const hauntId = cid => `haunt:${cid}`;
/* What decides the fight on his side, not the deal: the stand is chosen again when it changes. */
const handKey = setup => oddsKey({ you: { ...setup.you, pouch: undefined, fresh: undefined }, foe: {} });

/* The record of a pool's day (tasks.mjs duel keeps n, last, the outcome). */
const recOf = (state, place, now) => {
  const rec = state.duels?.[huntKey(place.id)];
  return rec?.day === dayKey(now) ? rec : null;
};
const nOf = (state, place, now) => recOf(state, place, now)?.n ?? 0;

/* The game a pool's beast is fought as (world.mjs encounterOf builds the same), with its growth. */
export const poolGame = (place, cid, n, scale = null) => ({ id: hauntId(cid), kind: 'duel', creature: cid, hunt: place.id, deal: `${hauntId(cid)}|${place.id}|${n}`, ...(scale ? { scale } : {}) });

/* The stand kept for this place, still good now: today's, after the same number of fights, its beast up. */
export function standOf(content, state, place, now) {
  const stand = recOf(state, place, now)?.stand;
  if (!stand || stand.n !== nOf(state, place, now)) return null;
  return poolUp(content, state, place, now).some(b => b.creature === stand.cid) ? stand : null;
}

/* Each candidate weighed: { cid, win, met }. */
function weigh(content, state, place, now, exclude = []) {
  const n = nOf(state, place, now), recent = new Set((recOf(state, place, now)?.last ?? []).slice(-3));
  const up = poolUp(content, state, place, now).map(b => b.creature).filter(cid => !exclude.includes(cid));
  const fresh = up.filter(cid => !recent.has(cid));
  const pool = fresh.length ? fresh : up;
  const catalog = cardCatalog(content);
  return pool.map(cid => {
    const game = poolGame(place, cid, n);
    const setup = fightSetup(content, state, foeOf(content, game), now, game.id, game.deal);
    return { cid, win: fightOdds(setup, catalog, MATCH.deals).win, met: Boolean(state.beasts?.[cid]), setup };
  });
}

/* The pick: in the band, one not met first, then the nearest the target; none in the band, the nearest — and when even
   that is too easy, it grows (its 气血) toward the band, at most ×grow_max. */
export function pickStand(weighed) {
  if (!weighed.length) return null;
  const far = w => Math.abs(w.win - MATCH.target);
  const inBand = weighed.filter(w => w.win >= MATCH.low && w.win <= MATCH.high);
  const best = (inBand.length ? inBand : weighed).slice().sort((a, b) => (inBand.length ? Number(a.met) - Number(b.met) : 0) || far(a) - far(b) || a.cid.localeCompare(b.cid))[0];
  const grow = best.win > MATCH.high ? Math.min(MATCH.grow_max, Math.round((1 + (best.win - MATCH.target)) * 20) / 20) : null;
  return { cid: best.cid, win: best.win, ...(grow && grow > 1 ? { scale: grow } : {}) };
}

/* Fitted as a save is read (rules.mjs): the stand where he is, chosen again when it no longer holds. The same object
   when nothing changes. `exclude`: beasts not to stand (a reroll's current one). */
export function standFit(content, state, now = new Date(), { exclude = [], force = false } = {}) {
  const place = placeOf(content, state?.place);
  if (!place || place.has?.creature || !poolOf(content, place) || atScene(content, state) || state.fight) return state;
  if (poolResting(content, state, place, now)) return state;
  const kept = force ? null : standOf(content, state, place, now);
  const anyUp = poolUp(content, state, place, now)[0];
  if (!anyUp) return state;
  const key = handKey(fightSetup(content, state, foeOf(content, poolGame(place, anyUp.creature, 0)), now));
  if (kept && kept.key === key) return state;
  const pick1 = pickStand(weigh(content, state, place, now, exclude));
  if (!pick1) return state;
  const s = clone(state), k = huntKey(place.id), rec = recOf(state, place, now) ?? { day: dayKey(now), outcome: null, n: 0 };
  s.duels = { ...s.duels, [k]: { ...rec, stand: { cid: pick1.cid, n: nOf(state, place, now), key, win: pick1.win, ...(pick1.scale ? { scale: pick1.scale } : {}) } } };
  return s;
}

/* 「换一只」: another beast of the fitting set stands. Free once a visit (a fight there, or arriving, gives the free one
   back); then it costs 体力 (rewards.json stamina.cost.reroll). Not in a fight, not where no pool deals. */
export function reroll(state, content, ctx) {
  const now = ctx.now ?? new Date();
  const place = placeOf(content, state.place);
  if (!place || !poolOf(content, place) || place.has?.creature) return refuse('no-pool', null);
  if (state.fight) return refuse('in-a-fight', null, { game: state.fight.game });
  if (poolResting(content, state, place, now)) return refuse('resting', null);
  const was = standOf(content, state, place, now)?.cid ?? null;
  const rec = recOf(state, place, now);
  const free = !rec?.rerolled;
  const s = clone(state);
  if (!free) {
    const empty = spendStamina(content, s, ctx, 'reroll');
    if (empty) return empty;
  }
  const fitted = standFit(content, s, now, { exclude: was ? [was] : [], force: true });
  const k = huntKey(place.id), stand = fitted.duels?.[k]?.stand;
  if (!stand || stand.cid === was) return refuse('none-other', pick({ zh: '这里眼下没有别的妖兽。', en: 'No other beast here just now.' }, state.lang));
  fitted.duels[k] = { ...fitted.duels[k], rerolled: (rec?.rerolled ?? 0) + 1 };
  const c = creatureOf(content, stand.cid);
  return { state: fitted, result: { ok: true, stands: stand.cid, name: pick(c?.name, state.lang), free, win: stand.win } };
}

/* What the haunt's card offers (Look's encounter `reroll`): free now, or its 体力. */
export function rerollBrief(content, state, place, now) {
  if (!place || !poolOf(content, place) || place.has?.creature) return null;
  const free = !recOf(state, place, now)?.rerolled;
  return { free, ...(free ? {} : { cost: content.rewards?.stamina?.cost?.reroll ?? 0 }) };
}
