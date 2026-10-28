// rules/aigames.mjs — AI mini-games: 砍价 (design.md § AI mini-games; 断案 cut 2026-10-27, 二十问 2026-10-28,
// Hanli 2026-10-15). Part of the rules engine; rules.mjs is its one door.
//
// The model talks, plays roles and judges fuzzy things against a declared
// rubric (worlds/<id>/aigames.json); these rules hold every secret, count
// every turn and decide outcome and pay — capped by the rewards table each
// grant names. Look carries the facts the page draws and never a secret:
// the floor (砍价) reaches no one. A win is never self-reported: a deal is
// checked against the floor.
import { dayKey, personOf, pick } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { forSale, shelfOf, shopOf, shopOpen } from './look.mjs';
import { visitorHere } from './visiting.mjs';
import { itemOf } from './errands.mjs';
import { roomFor } from './pouch.mjs';
import { placeName, placeOf } from './world.mjs';
import { buyAt, buysMany } from './travel.mjs';
import { npcLine, NPC_SYSTEM } from '../npc-line.js';

const cfgOf = content => content.aigames ?? null;
const today = (slot, now) => (slot?.day === dayKey(now) ? slot : null);
const text = v => String(v ?? '').trim();

/* ════════ 二十问 — retired 2026-10-28 ════════
   The player-asks 二十问 is cut (Hanli 10-28: 「AI对话的游戏, 最好让AI提问」 · 「AI猜可以, 但别固定30种动物」): she
   guesses now, on the page (games/jinchat-play.js guessGame — 讨饼债, the 游戏厅's 二十问 · 银月). What stays is 录's list
   of the animals an old save guessed (`state.animals`), named from aigames.json `twenty.animals`. */
const animalOf = (content, id) => (cfgOf(content)?.twenty?.animals ?? []).find(a => a.id === id) ?? null;

/* The animals he has named (录): their names, in the order won. */
export const animalsKnown = (content, state) => (state.animals ?? []).map(id => animalOf(content, id)).filter(Boolean).map(a => ({ id: a.id, name: pick(a.name, state.lang) }));

/* ════════ 砍价 — a button by every shelf item (Hanli 2026-10-28) ════════
   state.haggle = {day, walked: [item], haggled: [item], open: {item, place, list, floor, ask, qty, mood, used: [reason], countered, k},
                   deals: {place: n}, paid: {item: {place, price}}}
   The panel is the page's (npc-talk.js), every tap a call here: `open` · `argue` (a rubric id he holds) · `offer` (a
   price) · `deal` · `walk`. The rules hold every number — the floor never leaves them. Each answer carries `talk`: the
   hidden line the keeper's next words are asked by (npc-line.js), facts only, and his fallback line.
   `deals` (any buy at a place — travel.mjs buyAt) and `paid` (his lowest haggled price for a thing, and where) outlive
   the day: 我常来 and 别家才卖 are his own history. */
const haggleCfg = content => cfgOf(content)?.haggle ?? null;

/* The keeper at this place, while its shop is open: aigames.json's row for the place, else the default (`*`). A
   `person` (people.json) gives the name and the portrait. */
function keeperHere(content, state, now, at = state.place) {
  const cfg = haggleCfg(content), here = placeOf(content, at);
  if (!cfg || !here) return null;
  const open = here.has?.shop ? (shopOf(here) ? shopOpen(shopOf(here), state, content) : true) : visitorHere(content, state, here, now);
  if (!open) return null;
  const k = cfg.keepers?.[at] ?? cfg.keepers?.['*'];
  if (!k) return null;
  const p = k.person ? personOf(content, state, k.person) : null;
  return { ...k, place: at, name: pick(p?.name ?? k.who, state.lang), art: p?.art ?? null };
}
const haggleToday = (state, now) => {
  const t = today(state.haggle, now);
  // An old save's haggle under way (the 讨价还价 card's: `used_reasons`, `turns`) is let go: its item is list price today.
  if (t?.open && !Array.isArray(t.open.used)) return { ...t, open: null, walked: [...new Set([...(t.walked ?? []), t.open.item])] };
  return t;
};
const reasonOf = (content, id) => (haggleCfg(content)?.rubric ?? []).find(r => r.id === id) ?? null;

/* The floor for a thing at this keeper: the item's own, else the keeper's, else the default. */
const floorOf = (content, k, item) => {
  const cfg = haggleCfg(content), share = cfg.floors?.[item.id] ?? k?.floor ?? cfg.floor;
  return Math.max(1, Math.ceil(item.buy * share));
};
const reachOf = (content, list) => Math.max(1, Math.round(list * (haggleCfg(content).counter?.reach ?? 0.05)));

/* What a reason takes off the list for this thing — or null when he does not hold it (its `needs`). `o` the haggle
   under way (its ask and qty), else the list price as it stands before one. */
const NEEDS = {
  dealt_here: (c, s, item, o) => (s.haggle?.deals?.[o.place] ?? 0) > 0,
  cheaper_elsewhere: (c, s, item, o) => { const p = s.haggle?.paid?.[item.id]; return Boolean(p && p.place !== o.place && p.price < o.ask); },
  low_grade: (c, s, item) => item.kind === 'pill' && item.zhuan === 1,
  flaw: (c, s, item) => Boolean(haggleCfg(c).flaws?.[item.id]),
  two: (c, s, item, o, r) => buysMany(item) && o.qty === 1 && roomFor(c, { ...s, bag: { ...s.bag, [item.id]: (s.bag[item.id] ?? 0) + 1 } }, item.id)
    && 2 * Math.max(o.floor, o.ask - Math.round(o.list * r.step)) <= s.wealth,
};
const offOf = (r, item, o, s) => (r.needs === 'cheaper_elsewhere' ? o.ask - s.haggle.paid[item.id].price : Math.max(1, Math.round(o.list * (r.step ?? 0))));

/* The arguments he holds for this thing now, as the panel shows them: what each says, what it takes off, used. */
function argsHeld(content, state, item, o) {
  const lang = state.lang;
  return haggleCfg(content).rubric.filter(r => o.used.includes(r.id) || NEEDS[r.needs]?.(content, state, item, o, r)).map(r => {
    const used = o.used.includes(r.id);
    const price = r.needs === 'cheaper_elsewhere' ? state.haggle?.paid?.[item.id]?.price : null;
    return { id: r.id, say: pick(r.say, lang).replace('{price}', price ?? ''), ...(used ? { used: true } : { off: offOf(r, item, o, state) }) };
  });
}

/* A haggle about to open on `item`, as the rules would start it (no state written). */
const fresh = (content, k, item, place) => ({ item: item.id, place, list: item.buy, floor: floorOf(content, k, item), ask: item.buy, qty: 1, mood: haggleCfg(content).mood, used: [], countered: false, k: 0 });

/* How low a haggle he opened now could go with what he holds — every argument but 买两件, and one counter-offer —
   never under the floor. The shelf's 「可砍价」 when that is within his 灵石. */
function lowest(content, state, k, item) {
  let o = fresh(content, k, item, k.place);
  for (const r of haggleCfg(content).rubric) {
    if (r.needs === 'two' || !NEEDS[r.needs]?.(content, state, item, o, r)) continue;
    o = { ...o, ask: Math.max(o.floor, o.ask - offOf(r, item, o, state)) };
  }
  return Math.max(o.floor, o.ask - reachOf(content, o.list));
}

/* Whether haggling at `place` could bring `item` within his 灵石 (the 主页's 「差 X · 可砍价」, rules/strengthen.mjs):
   a keeper there, the thing not haggled over today, and the lowest he could reach. */
export function haggleReach(content, state, place, item, now = new Date()) {
  const k = keeperHere(content, state, now, place), t = haggleToday(state, now);
  if (!k || !(item?.buy > 0) || (t?.walked ?? []).includes(item.id) || (t?.haggled ?? []).includes(item.id)) return false;
  return lowest(content, state, k, item) <= (state.wealth ?? 0);
}

/* Each shelf thing's mark where a keeper stands: `short` (灵石 short of the list price), `can` (a haggle open to it
   today), `reach` ('can' · 'far' — whether haggling could bring it within his 灵石 when he is short). */
function shelfMarks(content, state, k, now) {
  const t = haggleToday(state, now), here = placeOf(content, state.place), out = {};
  for (const item of shelfOf(content, here, state, now)) {
    if (!(item.buy > 0)) continue;
    const short = Math.max(0, item.buy - (state.wealth ?? 0));
    const done = (t?.walked ?? []).includes(item.id) || (t?.haggled ?? []).includes(item.id);
    out[item.id] = { ...(short ? { short } : {}), ...(done ? { done: true } : { can: true }), ...(short && !done ? { reach: lowest(content, state, k, item) <= (state.wealth ?? 0) ? 'can' : 'far' } : {}) };
  }
  return out;
}

/* What the page and Ling see — never the floor. Where a keeper stands: who, the shelf's marks; a haggle under way:
   the thing, list and ask, his patience, the arguments he holds, the counter-offer's range. */
export function haggleBrief(content, state, now) {
  const cfg = haggleCfg(content);
  if (!cfg) return null;
  const k = keeperHere(content, state, now);
  if (!k) return null;
  const t = haggleToday(state, now), o = t?.open && t.open.place === state.place ? t.open : null;
  const keeper = { name: k.name, ...(k.art ? { art: k.art } : {}) };
  const base = { keeper, marks: shelfMarks(content, state, k, now) };
  if (!o) return base;
  const item = itemOf(content, o.item);
  return {
    ...base,
    open: {
      item: { id: o.item, name: pick(item?.name, state.lang) ?? o.item, ...(item?.art ? { art: item.art } : {}) },
      list: o.list, ask: o.ask, qty: o.qty, total: o.ask * o.qty, mood: o.mood, max_mood: cfg.mood, wealth: state.wealth ?? 0,
      args: argsHeld(content, state, item, o),
      offer: o.countered ? null : { min: Math.max(1, Math.floor(o.list * (cfg.counter?.min ?? 0.5))), max: Math.max(1, o.ask - 1) },
      ...(o.ask <= o.floor ? { firm: true } : {}),
    },
  };
}

/* The keeper's next words, asked for: facts for the hidden line (npc-line.js) and his fallback line. `event` is
   what just happened; `did` what the player did, in plain facts. */
function talkOf(content, state, k, o, event, did = '') {
  const cfg = haggleCfg(content), lang = state.lang, zh = lang !== 'en';
  const item = itemOf(content, o.item), name = pick(item?.name, lang) ?? o.item;
  const here = placeOf(content, state.place), shop = shopOf(here);
  const where = pick(shop?.name, lang) ?? placeName(content, state, here)?.name ?? '';
  const total = o.ask * o.qty;
  const price = o.qty > 1 ? (zh ? `两件共 ${total}` : `${total} for the two`) : `${o.ask}`;
  const facts = zh
    ? `玩家在讲价：${name}，标价 ${o.list} 灵石${o.qty > 1 ? '，他要买两件' : ''}；你现在开的价是 ${price} 灵石。你的耐性还剩 ${o.mood}/${cfg.mood}。`
    : `The player is haggling over ${name}, marked ${o.list} stones${o.qty > 1 ? ', taking two' : ''}; your price now is ${price} stones. Your patience: ${o.mood}/${cfg.mood}.`;
  const SAY = {
    open: zh ? `招呼他，报标价 ${o.list}。` : `greet him and give the marked price, ${o.list}.`,
    argue: zh ? `你让了一点，现价 ${price}；嘴上可以心疼。` : `you came down a little, to ${price}; grudge it if you like.`,
    firm: zh ? `你让到 ${price}，并且说这已经到头了，再低不行。` : `you came down to ${price}, and say that is as low as it goes.`,
    taken: zh ? `你答应了他还的价：${price}。` : `you accept his offer: ${price}.`,
    low: zh ? `他还的价太低，你不答应，价还是 ${price}；警告他再低要翻脸了。` : `his offer is too low; you refuse, still ${price}; warn him any lower and you are done.`,
    soured: zh ? '你翻脸了：这一样今天不讲价了，只照标价卖。' : 'you have had enough: no more haggling over this today, list price only.',
    deal: zh ? `成交，${price}，送客。` : `the deal is struck at ${price}; see him off.`,
    walk: zh ? '他不买了，放下东西走了；送一句。' : 'he puts it down and walks off; a parting word.',
  };
  const line = npcLine({ who: k.name, voice: pick(k.voice, lang), where, facts, did, say: SAY[event], first: o.k <= 1, lang });
  const fallback = pick(cfg.lines?.[event] ?? cfg.lines?.argue, lang)?.replace('{price}', price) ?? '';
  return { who: k.name, event, line, system: pick(NPC_SYSTEM, lang), fallback };
}

const answer = (content, s, now, k, o, event, did, extra = {}) => {
  o.k = (o.k ?? 0) + 1;
  return { state: s, result: { ok: true, ...extra, haggle: haggleBrief(content, s, now), talk: talkOf(content, s, k, o, event, did) } };
};

export function haggle(state, content, ctx, args) {
  const cfg = haggleCfg(content), lang = state.lang, now = ctx.now, action = text(args.action) || 'open', zh = lang !== 'en';
  if (!cfg) return refuse('not-here', null);
  const k = keeperHere(content, state, now);
  if (!k) return refuse('not-here', pick({ zh: '这里没有可以讲价的铺子。', en: 'There is no shop here to haggle at.' }, lang));
  const s = clone(state);
  const t = haggleToday(s, now);
  s.haggle = { deals: s.haggle?.deals ?? {}, paid: s.haggle?.paid ?? {}, ...(t ?? {}), day: dayKey(now), walked: t?.walked ?? [], haggled: t?.haggled ?? [], open: t?.open ?? null };
  const h = s.haggle;
  if (h.open && h.open.place !== s.place) h.open = null; // walked away from the shop with it open: it stands no more
  if (action === 'open') {
    const item = itemOf(content, text(args.id));
    if (h.open) {
      if (h.open.item === item?.id) return { state: null, result: { ok: true, again: true, haggle: haggleBrief(content, s, now), talk: talkOf(content, s, k, h.open, 'open') } };
      // Another thing picked: the one under way is walked off (list price today), as his ✕ would.
      h.walked = [...new Set([...h.walked, h.open.item])];
      h.open = null;
    }
    if (!item || !(item.buy > 0) || !forSale(content, s, item, placeOf(content, s.place), now)) return refuse('not-on-shelf', null);
    if (h.walked.includes(item.id) || h.haggled.includes(item.id)) return refuse('walked-away', pick({ zh: '这一样今天已经讲过价了，只照价卖。', en: 'You haggled over this one today — list price only.' }, lang));
    h.open = fresh(content, k, item, s.place);
    return answer(content, s, now, k, h.open, 'open', '', { opened: true });
  }
  const o = h.open;
  if (!o) return refuse('not-open', null, { haggle: haggleBrief(content, s, now) });
  const item = itemOf(content, o.item);
  if (action === 'argue') {
    const r = reasonOf(content, text(args.reason));
    if (!r || o.used.includes(r.id) || !NEEDS[r.needs]?.(content, s, item, o, r)) return refuse('not-held', null, { haggle: haggleBrief(content, s, now) });
    const said = argsHeld(content, s, item, o).find(a => a.id === r.id)?.say ?? r.id;
    const before = o.ask;
    o.ask = Math.max(o.floor, o.ask - offOf(r, item, o, s));
    o.used.push(r.id);
    if (r.needs === 'two') o.qty = 2;
    return answer(content, s, now, k, o, o.ask <= o.floor ? 'firm' : 'argue', zh ? `说「${said}」。` : `said "${said}".`, { came_down: before - o.ask });
  }
  if (action === 'offer') {
    const price = Math.trunc(Number(args.price));
    if (o.countered) return refuse('countered', null, { haggle: haggleBrief(content, s, now) });
    if (!Number.isFinite(price) || price < 1 || price >= o.ask) return refuse('bad-offer', null, { haggle: haggleBrief(content, s, now) });
    const did = zh ? `还价 ${price} 灵石。` : `offered ${price} stones.`;
    if (price >= Math.max(o.floor, o.ask - reachOf(content, o.list))) {
      const before = o.ask;
      o.ask = price;
      o.countered = true;
      return answer(content, s, now, k, o, 'taken', did, { came_down: before - o.ask, taken: true });
    }
    o.mood -= 1;
    if (o.mood <= 0) {
      h.walked = [...new Set([...h.walked, o.item])];
      h.open = null;
      return answer(content, s, now, k, o, 'soured', did, { soured: true });
    }
    return answer(content, s, now, k, o, 'low', did, { too_low: true });
  }
  if (action === 'deal') {
    const bought = buyAt(content, s, ctx, item, o.ask, o.qty);
    if (!bought.result?.ok) return bought;
    const b = bought.state.haggle;
    const best = b.paid?.[o.item];
    b.paid = { ...(b.paid ?? {}), ...(!best || o.ask < best.price ? { [o.item]: { place: o.place, price: o.ask } } : {}) };
    b.haggled = [...new Set([...(b.haggled ?? []), o.item])];
    b.open = null;
    return answer(content, bought.state, now, k, o, 'deal', '', { ...bought.result, deal: true, price: o.ask, qty: o.qty, saved: (o.list - o.ask) * o.qty });
  }
  if (action === 'walk') {
    h.walked = [...new Set([...h.walked, o.item])];
    h.open = null;
    return answer(content, s, now, k, o, 'walk', '', { walked: o.item });
  }
  return refuse('unknown-action', null, { actions: ['open', 'argue', 'offer', 'deal', 'walk'] });
}
