// rules/aigames.mjs — AI mini-games: 讨价还价 (design.md § AI mini-games; 断案 cut 2026-10-27, 二十问 2026-10-28,
// Hanli 2026-10-15). Part of the rules engine; rules.mjs is its one door.
//
// The model talks, plays roles and judges fuzzy things against a declared
// rubric (worlds/<id>/aigames.json); these rules hold every secret, count
// every turn and decide outcome and pay — capped by the rewards table each
// grant names. Look carries the facts the page draws and never a secret:
// the floor (讨价还价) reaches no one. A win is never self-reported: a deal is
// checked against the floor.
import { dayKey, pick } from '../state.mjs';
import { clone, refuse, spendStamina } from './core.mjs';
import { forSale, shopOf } from './look.mjs';
import { visitorHere } from './visiting.mjs';
import { itemBrief, itemOf } from './errands.mjs';
import { bagFull, roomFor } from './pouch.mjs';
import { placeOf } from './world.mjs';

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

/* ════════ 讨价还价 — Ling plays the keeper ════════
   state.haggle = {day, used, walked: [item], open: {item, place, list, floor, ask, qty, turns, mood, used_reasons, barter}, deals: {place: n}}
   `deals` outlives the day (熟客 is a past deal here). */
const haggleCfg = content => cfgOf(content)?.haggle ?? null;

/* The keeper at this place: a market's or a visiting shop's on its day, that
   aigames.json names. */
function keeperHere(content, state, now) {
  const cfg = haggleCfg(content), here = placeOf(content, state.place);
  const k = cfg?.keepers?.[state.place];
  if (!k || !here) return null;
  const open = here.has?.shop ? shopOf(here) : visitorHere(content, state, here, now);
  return open ? { ...k, place: state.place } : null;
}
const haggleToday = (state, now) => today(state.haggle, now);
const reasonOf = (content, id) => (haggleCfg(content)?.rubric ?? []).find(r => r.id === id) ?? null;
const MOODS = { zh: ['翻脸', '不耐烦', '还行', '和气'], en: ['done with you', 'impatient', 'fair', 'amiable'] };
const moodWord = (n, lang) => (MOODS[lang] ?? MOODS.zh)[Math.max(0, Math.min(3, n))];

/* What the page and Ling see of it — never the floor. `firm` once the ask
   has come down as far as it goes: he says so; the number is no secret then. */
export function haggleBrief(content, state, now) {
  const cfg = haggleCfg(content);
  if (!cfg) return null;
  const k = keeperHere(content, state, now), t = haggleToday(state, now), o = t?.open;
  const left = Math.max(0, cfg.per_day - (t?.used ?? 0));
  if (o && o.place === state.place) {
    const item = itemOf(content, o.item);
    return {
      open: true, keeper: pick(k?.who ?? cfg.keepers[o.place]?.who, state.lang), item: { id: o.item, name: pick(item?.name, state.lang) ?? o.item },
      list: o.list, ask: o.ask, qty: o.qty, total: o.ask * o.qty, turns: o.turns, max_turns: cfg.turns, mood: moodWord(o.mood, state.lang),
      reasons: o.used_reasons.map(id => pick(reasonOf(content, id)?.name, state.lang) ?? id), ...(o.barter ? { barter: pick(itemOf(content, o.barter)?.name, state.lang) } : {}),
      ...(o.ask <= o.floor ? { firm: true } : {}), ...(o.turns >= cfg.turns ? { last_word: true } : {}), left,
    };
  }
  if (!k) return null;
  return { open: false, keeper: pick(k.who, state.lang), left, walked: (t?.walked ?? []).map(id => pick(itemOf(content, id)?.name, state.lang) ?? id) };
}

/* Ling's own answer: the brief, the rubric to tag by, his voice — no floor. */
function haggleView(content, state, now, extra = {}) {
  const cfg = haggleCfg(content), k = keeperHere(content, state, now), lang = state.lang;
  return {
    ok: true, ...extra, haggle: haggleBrief(content, state, now),
    ...(k ? { keeper: { who: pick(k.who, lang), voice: pick(k.voice, lang) } } : {}),
    rubric: cfg.rubric.map(r => ({ id: r.id, name: pick(r.name, lang), about: r.about })),
  };
}

/* The floor for a thing at this keeper: the item's own, else the keeper's, else the default. */
const floorOf = (content, k, item) => {
  const cfg = haggleCfg(content), share = cfg.floors?.[item.id] ?? k.floor ?? cfg.floor;
  return Math.max(1, Math.ceil(item.buy * share));
};

export function haggle(state, content, ctx, args) {
  const cfg = haggleCfg(content), lang = state.lang, now = ctx.now, action = text(args.action) || 'open';
  if (!cfg) return refuse('not-here', null);
  const k = keeperHere(content, state, now);
  const t0 = haggleToday(state, now), o0 = t0?.open && t0.open.place === state.place ? t0.open : null;
  if (!k && !o0) return refuse('not-here', pick({ zh: '这里没有可以讲价的摊子。', en: 'There is no stall here to haggle at.' }, lang));
  const s = clone(state);
  s.haggle = haggleToday(s, now) ?? { day: dayKey(now), used: 0, walked: [], open: null, deals: s.haggle?.deals ?? {} };
  const h = s.haggle;
  if (action === 'open') {
    const item = itemOf(content, text(args.id));
    if (o0) return o0.item === item?.id || !item ? { state: null, result: haggleView(content, state, now, { again: true }) } : refuse('haggling', pick({ zh: '手上这一样还没谈完。', en: 'You are still haggling over the last thing.' }, lang), haggleView(content, state, now));
    if (!item || !item.buy || !forSale(content, s, item, placeOf(content, s.place), now)) return refuse('not-on-shelf', null, haggleView(content, state, now));
    if (h.used >= cfg.per_day) return refuse('haggled-out', pick({ zh: `今天讲价讲够了（${cfg.per_day} 回）。照价买，或明日再来。`, en: `Enough haggling for today (${cfg.per_day}). Pay the list price, or come back tomorrow.` }, lang));
    if (h.walked.includes(item.id)) return refuse('walked-away', pick({ zh: '这一样今天你已经走过一回了，只照价卖。', en: 'You walked away from this one today — list price only.' }, lang));
    h.used += 1;
    h.open = { item: item.id, place: s.place, list: item.buy, floor: floorOf(content, k, item), ask: item.buy, qty: 1, turns: 0, mood: cfg.mood, used_reasons: [], barter: null };
    return { state: s, result: haggleView(content, s, now, { opened: true }) };
  }
  if (!o0) return refuse('not-open', null, haggleView(content, state, now));
  const o = h.open;
  if (action === 'turn') return haggleTurn(content, s, ctx, args, o);
  if (action === 'deal') return haggleDeal(content, s, ctx, o);
  if (action === 'walk') {
    h.walked = [...new Set([...h.walked, o.item])];
    h.open = null;
    return { state: s, result: haggleView(content, s, now, { walked: o.item, line: pick({ zh: '你放下东西走了。这一样今天只照价卖。', en: 'You put it down and walk off. Today it sells at list price only.' }, lang) }) };
  }
  return refuse('unknown-action', null, { actions: ['open', 'turn', 'deal', 'walk'] });
}

/* One argument: Ling tags it (`reason`, a rubric id) and grades it (0 weak ·
   1 fair · 2 strong); the rules apply the rubric's step, clamp at the floor,
   and keep each reason to once. A bare push or a reason used again sours him;
   soured to nothing, he will not haggle on — the list price stands today. */
function haggleTurn(content, s, ctx, args, o) {
  const cfg = haggleCfg(content), lang = s.lang, now = ctx.now;
  if (o.turns >= cfg.turns) return refuse('last-word', pick({ zh: '掌柜的已经报了最后一口价：成交，或者走。', en: 'That was the last word on price: deal, or walk.' }, s.lang), haggleView(content, s, now));
  const r = reasonOf(content, text(args.reason)) ?? reasonOf(content, 'none');
  const grade = Math.max(0, Math.min(2, Math.trunc(Number(args.grade ?? 1)) || 0));
  o.turns += 1;
  let step = 0, why = null;
  const again = r.once && o.used_reasons.includes(r.id);
  if (r.id === 'none' || again || grade === 0) why = again ? 'used' : r.id === 'none' ? 'bare' : 'weak';
  else if (r.needs === 'deal_here' && !(s.haggle.deals?.[o.place] > 0)) why = 'not-a-regular';
  else if (r.needs === 'item') {
    const offered = itemOf(content, text(args.item));
    if (!offered || !(s.bag[offered.id] > 0) || offered.id === o.item || !(offered.sell > 0)) why = 'no-such-thing';
    else {
      o.barter = offered.id;
      step = Math.min(offered.sell, Math.floor(o.list * cfg.barter_cap));
    }
  } else step = Math.round(o.list * r.step * cfg.grades[grade]);
  if (why) o.mood -= 1;
  else {
    o.used_reasons.push(r.id);
    if (r.id === 'bulk') o.qty = 2;
  }
  const before = o.ask;
  o.ask = Math.max(o.floor, o.ask - step);
  if (o.mood <= 0) {
    s.haggle.walked = [...new Set([...s.haggle.walked, o.item])];
    s.haggle.open = null;
    return { state: s, result: haggleView(content, s, now, { soured: true, line: pick({ zh: '掌柜的脸一沉：「不卖了。今天这一样，照价。」', en: 'The keeper\'s face sets: "Not selling. That one is list price today."' }, lang) }) };
  }
  return { state: s, result: haggleView(content, s, now, { came_down: before - o.ask, ...(why ? { refused_reason: why } : {}) }) };
}

/* The deal at the ask he stands at now — the page's 成交 or Ling on the
   player's word. Bought as Trade buys: on the shelf, room in the bag, stones
   enough; a thing offered in trade leaves the bag. */
function haggleDeal(content, s, ctx, o) {
  const lang = s.lang, now = ctx.now, item = itemOf(content, o.item);
  const total = o.ask * o.qty;
  if (s.wealth < total) return refuse('no-stones', pick({ zh: '灵石不够。', en: 'Not enough spirit stones.' }, lang), { price: total, wealth: s.wealth });
  for (let i = 0; i < o.qty; i++) if (!roomFor(content, { ...s, bag: { ...s.bag, [item.id]: (s.bag[item.id] ?? 0) + i } }, item.id)) return bagFull(content, s);
  if (o.barter && !(s.bag[o.barter] > 0)) return refuse('no-such-thing', null);
  const empty = spendStamina(content, s, ctx, 'shop');
  if (empty) return empty;
  s.wealth -= total;
  s.bag[item.id] = (s.bag[item.id] ?? 0) + o.qty;
  if (o.barter) { s.bag[o.barter] -= 1; if (s.bag[o.barter] <= 0) delete s.bag[o.barter]; }
  s.haggle.deals = { ...s.haggle.deals, [o.place]: (s.haggle.deals?.[o.place] ?? 0) + 1 };
  s.haggle.open = null;
  const saved = (o.list - o.ask) * o.qty;
  return { state: s, result: { ok: true, deal: true, bought: item.id, qty: o.qty, price: o.ask, saved, item: itemBrief(content, s, item), paid: { wealth: -total }, wealth: s.wealth, ...(o.barter ? { traded: o.barter } : {}), haggle: haggleBrief(content, s, now) } };
}
