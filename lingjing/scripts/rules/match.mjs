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
import { dayKey, pick, staminaCost } from '../state.mjs';
import { oddsKey, oddsWithin } from '../fightodds.js';
import { cardCatalog, fightSetup } from './cards.mjs';
import { clone, refuse, spendStamina } from './core.mjs';
import { atScene, creatureOf, foeOf, huntKey, huntRules, placeOf, poolOf, poolResting, poolUp, standsAtScene } from './world.mjs';

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

/* Each candidate weighed: { cid, win, met }. A beast sure to fall outside the band stops early (fightodds.js
   oddsWithin: only the in-band ones are picked among). When none lands in it, the nearest is wanted: the beast whose
   share could still lie nearest the target is played on, one at a time, until the nearest found is nearer than any
   other could still be — the same pick, and the same growth, as weighing all of them in full, at a part of the cost (a
   Look at 后山 after a scene's exit weighed 14 beasts × 8 deals: ~6 s on the Mac, ~20 s in the phone's JavaScriptCore,
   no JIT, when none fell in the band).
   Weighed on the day's first deal (n 0), whatever the count fought: a beast's odds against this hand are then the same
   all day, and are kept (the save's `weighed`: the day, the hand's key, each place|beast's deals won of those played) —
   after a fight there the stand is chosen again from what was weighed, little or nothing played out (Hanli 11-04: 6.5 s
   on the phone after every 后山 fight). A new hand or a new day weighs again. */
export const MEMO_FIELD = 'weighed';
const memoOf = (state, now, key) => {
  const m = state[MEMO_FIELD];
  return m?.day === dayKey(now) && m.key === key ? m : { day: dayKey(now), key, of: {} };
};
const D = MATCH.deals;
/* What a part-weighed share is reported as: its end of the range nearest the band (never in it — it stopped outside). */
const shareOf = e => (e.out === 'below' ? (e.won + D - e.k) / D : e.won / D);
/* How near the target a part-weighed share could still end. */
const nearest = e => { const lo = e.won / D, hi = (e.won + D - e.k) / D; return MATCH.target < lo ? lo - MATCH.target : MATCH.target > hi ? MATCH.target - hi : 0; };
/* The last few fought here stand down — as world.mjs poolBeast does: the pool's memory deep, read across days (the record
   of an earlier day still holds `last`), and never all of what is up: one is always left, and the one just fought is
   never it while another is up (Hanli 2026-11-07: 「我玩斗法, 每次都是同样的妖, 应该打完换新的」 — 上山路 with three up
   stood 狼 four fights running: once all three were among the last three, the stand fell back to the whole pool and its
   pick, the same each time, stood the beast just fought). */
export function restOf(content, state, place, up) {
  const keep = Math.max(0, Math.min(huntRules(content, poolOf(content, place)).memory, up.length - 1));
  const shut = new Set(keep ? (state.duels?.[huntKey(place.id)]?.last ?? []).slice(-keep) : []);
  return up.filter(cid => !shut.has(cid));
}
function weigh(content, state, place, now, exclude = [], key = null) {
  const up = poolUp(content, state, place, now).map(b => b.creature).filter(cid => !exclude.includes(cid));
  const fresh = restOf(content, state, place, up);
  const pool = fresh.length ? fresh : up;
  const catalog = cardCatalog(content);
  const memo = memoOf(state, now, key), of = { ...memo.of };
  const setupOf = cid => { const game = poolGame(place, cid, 0); return fightSetup(content, state, foeOf(content, game), now, game.id, game.deal); };
  const at = cid => `${place.id}|${cid}`;
  const keep = (cid, r) => { of[at(cid)] = { won: r.won, k: r.k, out: r.out }; };
  for (const cid of pool) {
    const e = of[at(cid)];
    if (!e || typeof e.k !== 'number') keep(cid, oddsWithin(setupOf(cid), catalog, D, MATCH.low, MATCH.high));
  }
  const inBand = pool.some(cid => of[at(cid)].k === D && !of[at(cid)].out && shareOf(of[at(cid)]) >= MATCH.low && shareOf(of[at(cid)]) <= MATCH.high);
  // None in the band: the nearest, found by playing on only the beasts that could still be nearer.
  while (!inBand) {
    const far = cid => Math.abs(shareOf(of[at(cid)]) - MATCH.target);
    const done = pool.filter(cid => of[at(cid)].k === D).sort((a, b) => far(a) - far(b) || a.localeCompare(b))[0];
    const open = pool.filter(cid => of[at(cid)].k < D).sort((a, b) => nearest(of[at(a)]) - nearest(of[at(b)]) || a.localeCompare(b));
    if (!open.length || (done && far(done) < nearest(of[at(open[0])]))) break;
    keep(open[0], oddsWithin(setupOf(open[0]), catalog, D, -Infinity, Infinity, of[at(open[0])]));
  }
  const weighed = pool.map(cid => ({ cid, win: shareOf(of[at(cid)]), met: Boolean(state.beasts?.[cid]) }));
  return { weighed, memo: { ...memo, of } };
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
  // Where the pool deals (world.mjs encounterOf): off the story, or at a scene a standing pool shares (后山, 11-04). Matched
  // there too — else the scene's beast was a blind draw, and the first Look after its exit weighed the whole pool while
  // the tap waited (Hanli 11-04, 09-suifeng's 「那年入秋」: seconds before the page answered).
  if (!place || place.has?.creature || !poolOf(content, place) || (atScene(content, state) && !standsAtScene(content, state, place)) || state.fight) return state;
  if (poolResting(content, state, place, now)) return state;
  const kept = force ? null : standOf(content, state, place, now);
  const anyUp = poolUp(content, state, place, now)[0];
  if (!anyUp) return state;
  const key = handKey(fightSetup(content, state, foeOf(content, poolGame(place, anyUp.creature, 0)), now));
  if (kept && kept.key === key) return state;
  const { weighed, memo } = weigh(content, state, place, now, exclude, key);
  const pick1 = pickStand(weighed);
  if (!pick1) return state;
  const s = clone(state), k = huntKey(place.id), rec = recOf(state, place, now) ?? { day: dayKey(now), outcome: null, n: 0 };
  s.duels = { ...s.duels, [k]: { ...rec, stand: { cid: pick1.cid, n: nOf(state, place, now), key, win: pick1.win, ...(pick1.scale ? { scale: pick1.scale } : {}) } } };
  s[MEMO_FIELD] = memo;
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
  return { free, ...(free ? {} : { cost: staminaCost(content, 'reroll') }) };
}
