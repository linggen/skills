// strengthen.mjs — after a fight lost, the ways he can grow stronger now, ranked (Hanli 2026-10-27, lost to
// the 后山's 狼 at 练气一层: 「玩家战败, 卡在这里, 可以让yinyue给一点提示, 去增强战力, 或者得到卡片, 武器, 再来刷怪」).
//
// Facts only, never words: each option says what, where, how far and what it costs; 银月 says it (hersay.js
// `lost`), the result card's one button takes the first (battle-card.js). The 主页 may call it too.
//
//   strengthen(content, state, { now, beat }) → [{ kind, … }], best first
//
// The order is a rule, not a guess, and tests/strengthen.test.mjs holds it to the fight's own numbers
// (tools/story-fights.mjs at the h05g gate): what he holds and has not put on is free and here, so it
// comes first (爷爷的弓 lifted the gate's 野猪 from about 12% to 32%); then a card from a shop he can
// walk to and afford (one of the 外门库房's three takes the 后山 from ~49% to ~63–77%, two to ~90%); then a pill for the
// 丹囊; then the pool's next beast (a pool deals another); then 修为 without a fight — 闭关, the 功课.
//
// Each option also says what the thing is and does (`does`: a card's cost · 攻/血 · keywords · effect, gear's slot and
// what it lends, a pill's fight effect), and the first one he can act on (wear · buy · pills — the 主页's) the fight it
// is for (`for`: the beast or story fight he lost) and the odds there before → after (`odds`: fightodds.js's careful
// line over fixed deals, both sides the same deals) — kept on the save (`strong_odds`, strongFit) as rules/match.mjs
// keeps its stand, so a Look only reads it. `line`: the one fact line of it (wayline.js), for the page and the phone.
// Hanli 2026-10-27: 「去执事堂 · 买铁蒺藜, 如果是推荐玩家变强, 应该让yinyue解释一下, 为什么要买东西? 能增强什么」.
import { dayKey, pick } from '../state.mjs';
import { gameOf } from '../content.mjs';
import { fightOdds, oddsKey } from '../fightodds.js';
import { wayLine } from '../wayline.js';
import { wornOf } from './arms.mjs';
import { cardCatalog, fightSetup, ownedCards, rootsOf, usable } from './cards.mjs';
import { clone } from './core.mjs';
import { shelfOf } from './look.mjs';
import { poolGame } from './match.mjs';
import { allPlaces, creatureOf, foeOf, huntKey, pathOf, placeName, placeOf, sceneOf } from './world.mjs';
import { visitorHere } from './visiting.mjs';

const SLOTS = { weapon: 'weapon', robe: 'robe', pendant: 'pendant' };
const MEND = 'mend-pill';

/* What a worn thing adds, to pick the better of two: a weapon's 攻, a robe's 防, a 佩's 抗 summed. */
const worth = item => (item?.effect?.atk ?? 0) + (item?.effect?.def ?? 0) + Object.values(item?.effect?.ward ?? {}).reduce((a, b) => a + b, 0);

/* 1 · Put on what he holds: a slot empty, or holding less than the bag has. */
function wearable(content, state) {
  const out = [];
  for (const slot of Object.keys(SLOTS)) {
    const on = wornOf(content, state, slot);
    const best = Object.keys(state.bag ?? {}).map(id => content.items.items.find(i => i.id === id))
      .filter(i => i && i.kind === slot && (state.bag[i.id] ?? 0) > 0 && i.id !== on?.id && worth(i) > worth(on))
      .sort((a, b) => worth(b) - worth(a))[0];
    if (best) out.push({ kind: 'wear', item: best.id, name: pick(best.name, state.lang), slot, cost: 0, where: 'here', does: gearDoes(best) });
  }
  return out;
}

/* What worn gear lends: its 攻 · 防 · 抗 · the root it lends. */
const gearDoes = item => Object.fromEntries(['atk', 'def', 'ward', 'root'].filter(k => item.effect?.[k] != null).map(k => [k, item.effect[k]]));
/* What a card is: its cost, its body, its keywords, its effect (cards.json). */
const cardDoes = c => ({ card_kind: c.kind, cost: c.cost ?? 0, ...(c.atk != null ? { atk: c.atk } : {}), ...(c.hp != null ? { hp: c.hp } : {}), ...(c.keywords?.length ? { keywords: c.keywords } : {}), ...(c.effect ? { effect: c.effect } : {}), ...(c.element ? { element: c.element } : {}) });

/* The shops he can walk to now (their shelves open), nearest first, with the steps there. */
export function shopsInReach(content, state, now) {
  const here = placeOf(content, state.place);
  if (!here) return [];
  return allPlaces(content).map(p => {
    const shelf = (p.has?.shop || visitorHere(content, state, p, now)) ? shelfOf(content, p, state, now) : [];
    if (!shelf.length) return null;
    const way = p.id === here.id ? [] : pathOf(content, state, here, p, now);
    return way ? { place: p.id, place_name: placeName(content, state, p).name, steps: way.length, shelf } : null;
  }).filter(Boolean).sort((a, b) => a.steps - b.steps);
}

/* What a card answers, for the pick: a pack of 护主 wants a sweep or a body to stand in front. */
const answers = c => [c.effect?.sweep ? 'guards' : null, c.keywords?.includes('taunt') ? 'blows' : null, (c.cost ?? 9) <= 1 ? 'cheap' : null].filter(Boolean);

/* 2 · A card from a shelf in reach: not held, of a root he has, within his 灵石. A body that stands in
   front first (a 护主 takes the pack's blows: 替身草人 took the gate's 后山 from ~49% to ~77%), then a sweep
   for its 护主 (散火诀 ~67%), then a cheap one (铁蒺藜 ~63%) — tools/story-fights.mjs h05g, 2026-10-27. */
function buyable(content, state, shops) {
  const owned = new Set(ownedCards(content, state)), roots = rootsOf(content, state), catalog = cardCatalog(content);
  const seen = new Set(), out = [];
  for (const shop of shops) for (const item of shop.shelf) {
    const card = catalog[item.effect?.card];
    if (!card || owned.has(card.id) || seen.has(card.id) || !usable(card, roots) || (item.buy ?? Infinity) > (state.wealth ?? 0)) continue;
    seen.add(card.id);
    out.push({ kind: 'buy', item: item.id, card: card.id, name: pick(card.name, state.lang), price: item.buy, place: shop.place, place_name: shop.place_name, steps: shop.steps, answers: answers(card), does: cardDoes(card) });
  }
  const want = ['blows', 'guards', 'cheap'];
  const rank = o => Math.min(...o.answers.map(a => want.indexOf(a)).filter(i => i >= 0), want.length);
  return out.sort((a, b) => rank(a) - rank(b) || a.steps - b.steps || a.price - b.price);
}

/* 3 · 回春丹 for the 丹囊, when none is carried and two are affordable at a shelf in reach. */
function pills(content, state, shops) {
  if ((state.bag?.[MEND] ?? 0) > 0) return [];
  for (const shop of shops) {
    const item = shop.shelf.find(i => i.id === MEND);
    if (item && 2 * item.buy <= (state.wealth ?? 0)) return [{ kind: 'pills', item: MEND, name: pick(item.name, state.lang), n: 2, price: 2 * item.buy, place: shop.place, place_name: shop.place_name, steps: shop.steps, does: { ...(content.items.items.find(i => i.id === MEND)?.effect?.fight ?? {}) } }];
  }
  return [];
}

/* 4 · The pool deals another beast next time (world.mjs poolBeast: the last fought stands down). */
const another = (content, state, game) => (game?.hunt ? [{ kind: 'another', place: game.hunt, place_name: placeName(content, state, placeOf(content, game.hunt))?.name, cost: 0, where: 'here' }] : []);

/* 5 · 修为 without a fight: 闭关 (rewards.json seclusion: so much an hour, to a cap), the day's 功课. */
function quiet(content, state, now) {
  const sec = content.rewards?.seclusion, out = [];
  if (sec && !state.seclusion) out.push({ kind: 'seclude', progress: sec.progress_per_hour * sec.cap_hours, hours: sec.cap_hours });
  const gk = content.rewards?.tables?.gongke;
  if (gk?.progress && state.gongke?.day?.key !== dayKey(now)) out.push({ kind: 'gongke', progress: gk.progress });
  return out;
}

/* ── The fight it is for, and the odds there ── */

/* The fight he lost and has not made good: `game` when the loss is in hand (tasks.mjs lossWay); else a story fight of the
   scene he stands in lost (fight_losses), else a pool lost at more than won — its beast the last it dealt him. */
export function lostFight(content, state, game = null) {
  const of = g => { const c = creatureOf(content, g?.creature); return c ? { game: g.id, creature: c.id, name: pick(c.name, state.lang), ...(g.hunt ? { hunt: g.hunt } : {}) } : null; };
  if (game?.creature) return of(game);
  for (const e of sceneOf(content, state)?.exits ?? []) {
    const g = gameOf(e);
    if (g?.kind === 'duel' && (state.fight_losses?.[g.id] ?? 0) > 0) return of(g);
  }
  const kept = state.strong_odds?.for;
  for (const [place, n] of Object.entries(state.hunt_losses ?? {})) {
    if (n <= (state.hunted?.[place] ?? 0)) continue;
    const rec = state.duels?.[huntKey(place)];
    const cid = (kept?.hunt === place ? kept.creature : null) ?? rec?.last?.at(-1) ?? rec?.stand?.cid;
    if (cid) return of({ id: `haunt:${cid}`, creature: cid, hunt: place });
  }
  return null;
}

/* The deals both sides play — the same fixed ones, so before and after differ by the step alone. */
export const STRONG_DEALS = 16;
const gameFor = (content, f) => (f.hunt ? poolGame(placeOf(content, f.hunt), f.creature, 0) : { id: f.game, kind: 'duel', creature: f.creature });
function setupFor(content, state, f, now) {
  const g = gameFor(content, f);
  return { ...fightSetup(content, { ...state, fight: undefined }, foeOf(content, g), now, g.id, g.deal), seed: `strong|${f.creature}` };
}
/* The save as it would be with the step taken: worn, the card held (new), the pills in the bag and picked for the 丹囊. */
function taken(state, o) {
  const s = clone(state);
  if (o.kind === 'wear') s.wear = { ...s.wear, [o.slot]: o.item };
  if (o.kind === 'buy') { s.cards = [...(s.cards ?? []), o.card]; s.cards_new = [...(s.cards_new ?? []), o.card]; }
  if (o.kind === 'pills') { s.bag = { ...s.bag, [o.item]: (s.bag?.[o.item] ?? 0) + o.n }; s.pill_pick = [...new Set([...(s.pill_pick ?? []), o.item])]; }
  return s;
}
const ACTS = ['wear', 'buy', 'pills'];
const keyOf = (setup, o, f) => JSON.stringify([oddsKey({ you: { ...setup.you, fresh: undefined }, foe: setup.foe }), o.kind, o.item, f.game]);

/* The odds kept for this option, when they still hold (the same hand, the same step, the same fight). */
function keptOdds(content, state, o, f, now) {
  const k = state.strong_odds;
  if (!k || k.key !== keyOf(setupFor(content, state, f, now), o, f)) return null;
  return { before: k.before, after: k.after };
}
/* The odds weighed now: { key, for, before, after }. */
export function weighOdds(content, state, o, f, now = new Date(), deals = STRONG_DEALS) {
  const catalog = cardCatalog(content), setup = setupFor(content, state, f, now);
  const before = fightOdds(setup, catalog, deals).win, after = fightOdds(setupFor(content, taken(state, o), f, now), catalog, deals).win;
  return { key: keyOf(setup, o, f), for: f, before, after };
}

/* Fitted as a save is read (rules.mjs, after match.mjs standFit): the odds for the first step he can act on against the
   fight he lost, weighed again only when they no longer hold. The same object when nothing changes. */
export function strongFit(content, state, now = new Date(), { game = null } = {}) {
  if (!state || state.fight) return state;
  const f = lostFight(content, state, game);
  const o = f ? ways(content, state, now, game).find(x => ACTS.includes(x.kind)) : null;
  if (!o) {
    if (!state.strong_odds) return state;
    const s = clone(state);
    delete s.strong_odds;
    return s;
  }
  if (keptOdds(content, state, o, f, now)) return state;
  const s = clone(state);
  s.strong_odds = weighOdds(content, state, o, f, now);
  return s;
}

function ways(content, state, now, game) {
  const shops = shopsInReach(content, state, now);
  return [...wearable(content, state), ...buyable(content, state, shops).slice(0, 2), ...pills(content, state, shops), ...another(content, state, game), ...quiet(content, state, now)];
}

/* The first step he can act on, told the fight it is for and the odds kept for it (a fight in progress: none);
   every step that is a thing, its fact line. In place; returns `way`. */
export function oddsOn(content, state, way, now = new Date(), game = null) {
  const top = way.find(o => ACTS.includes(o.kind)), f = top ? lostFight(content, state, game) : null;
  if (top && f) {
    top.for = f;
    const odds = state.fight ? null : keptOdds(content, state, top, f, now);
    if (odds) top.odds = odds; else delete top.odds;
  }
  for (const o of way) { const line = wayLine(o, state.lang); if (line) o.line = line; }
  return way;
}

/* The ways, best first. `beat`: what the lost fight showed (tasks.mjs duel → `beat`); `game`: the fight's. */
export function strengthen(content, state, { now = new Date(), beat = null, game = null } = {}) {
  return oddsOn(content, state, ways(content, state, now, game), now, game);
}
