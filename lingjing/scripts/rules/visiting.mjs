// rules/visiting.mjs — A visiting shop: a trader who comes up for a day, every few days.
// Part of the rules engine; rules.mjs is its one door.
//
// 货郎上山摆摊 (Hanli, 2026-10-15: 「按A做, 货郎上山摆摊」). While a walled map holds him
// (观内: 外门弟子，无令不得下山) the 坊市 below is shut to him; a place's `has.visitor` is a
// shop that stands there only on its days — `visits: { every, offset }` against the local
// calendar day — and only while the chapter's map is walled (it declares `home`) and holds
// the place. Its shelf is a shop's own shape (`name`, `keeper`, `goods`), plus one of its
// `odd` goods turning with each visit; it buys back what `buys.kinds` names at `buys.rate`
// of the catalog's price. No game stands beside it (no 押宝 inside the 观). The book's
// precedent is 古六's: 外人上不得山, but a trader who pays the 观 its 摊钱 may set up inside.
// (A 「stall」 in tasks.mjs is another thing: a board played at a shop, 钱掌柜's 押宝.)
import { pick } from '../state.mjs';
import { allPlaces, mapOf, placeName } from './world.mjs';

const DAY_MS = 86400000;
/* The local calendar day as a number: the same day for every clock reading on it. */
const dayNo = now => Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
const visitorOf = place => (place?.has?.visitor && typeof place.has.visitor === 'object' ? place.has.visitor : null);
/* In season: the chapter's map is walled (it declares `home`) and holds the place. */
function inSeason(content, state, place, now) {
  const map = state ? mapOf(content, state, now) : null;
  return Boolean(map?.home && (map.places ?? []).includes(place.id));
}
/* Days until it stands again: 0 on its day. */
const daysTo = (visitor, now) => {
  const { every, offset = 0 } = visitor.visits;
  return (((offset - dayNo(now)) % every) + every) % every;
};
/* The visiting shop standing at this place now, or null. */
function visitorHere(content, state, place, now = new Date()) {
  const visitor = visitorOf(place);
  return visitor && inSeason(content, state, place, now) && daysTo(visitor, now) === 0 ? visitor : null;
}
/* Its goods on this visit: its own, and one of its `odd`, turning with each visit. */
function visitorGoods(visitor, now = new Date()) {
  const odd = visitor.odd ?? [];
  const turn = Math.floor(dayNo(now) / visitor.visits.every);
  return [...(visitor.goods ?? []), ...(odd.length ? [odd[turn % odd.length]] : [])];
}
/* What a shop pays for a thing of his: the catalog's `sell`, or — a shop that
   declares `buys` — only the kinds it names, at its rate (rounded down, never
   below 1). Null when it has no price there. */
function buyBack(shop, item) {
  if (item?.sell == null) return null;
  const b = shop?.buys;
  if (!b) return item.sell;
  if (b.kinds && !b.kinds.includes(item.kind)) return null;
  return item.sell > 0 ? Math.max(1, Math.floor(item.sell * (b.rate ?? 1))) : 0;
}
const fillIn = (text, words) => String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (words[k] ?? m));
/* Its own line for when it stands next: today, or in n days. */
function visitorSay(content, state, place, now) {
  const visitor = visitorOf(place), n = daysTo(visitor, now), v = visitor.visits;
  return fillIn(pick(n ? v.later : v.today, state.lang), { place: pick(v.where, state.lang) ?? placeName(content, state, place).name, n });
}
/* Look's `visitors`: each visiting shop in season — where, today or in n days, and its line. */
function visitorsBrief(content, state, now = new Date()) {
  return allPlaces(content).filter(p => visitorOf(p) && inSeason(content, state, p, now)).map(p => {
    const n = daysTo(visitorOf(p), now);
    return { place: placeName(content, state, p), ...(n ? { in: n } : { today: true }), say: visitorSay(content, state, p, now) };
  });
}
/* In season but away today: its line says when it comes (a Trade there is refused with it). */
const visitorAway = (content, state, place, now) => (visitorOf(place) && inSeason(content, state, place, now) && !visitorHere(content, state, place, now) ? visitorSay(content, state, place, now) : null);

export { buyBack, dayNo, visitorAway, visitorGoods, visitorHere, visitorOf, visitorsBrief };
