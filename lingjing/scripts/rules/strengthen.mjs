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
import { dayKey, pick } from '../state.mjs';
import { wornOf } from './arms.mjs';
import { cardCatalog, ownedCards, rootsOf, usable } from './cards.mjs';
import { shelfOf } from './look.mjs';
import { allPlaces, pathOf, placeName, placeOf } from './world.mjs';
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
    if (best) out.push({ kind: 'wear', item: best.id, name: pick(best.name, state.lang), slot, cost: 0, where: 'here' });
  }
  return out;
}

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
    out.push({ kind: 'buy', item: item.id, card: card.id, name: pick(card.name, state.lang), price: item.buy, place: shop.place, place_name: shop.place_name, steps: shop.steps, answers: answers(card) });
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
    if (item && 2 * item.buy <= (state.wealth ?? 0)) return [{ kind: 'pills', item: MEND, name: pick(item.name, state.lang), n: 2, price: 2 * item.buy, place: shop.place, place_name: shop.place_name, steps: shop.steps }];
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

/* The ways, best first. `beat`: what the lost fight showed (tasks.mjs duel → `beat`); `game`: the fight's. */
export function strengthen(content, state, { now = new Date(), beat = null, game = null } = {}) {
  const shops = shopsInReach(content, state, now);
  return [...wearable(content, state), ...buyable(content, state, shops).slice(0, 2), ...pills(content, state, shops), ...another(content, state, game), ...quiet(content, state, now)];
}
