// rules/pouch.mjs — 储物袋: the bag has room, counted in slots.
// Part of the rules engine; rules.mjs is its one door.
//
// One item id is one slot, however many are stacked in it. A key the story
// still needs (kind `key`, an exit of the open chapter or a taken errand's
// `carry`, her bell) takes no slot. The room grows with the realm
// (rewards.json `pouch.by_tier`) and by the one bigger 储物袋 he wears
// (items.json `effect.pouch`; `state.pouch`, a list of at most one — Hanli 2026-11-04:
// 「储物袋不要叠加了…只能有一个储物袋吧」): 换上 another swaps it, the old one back in
// the bag as a thing to sell or drop, like gear. When the pouch is
// full, the choice is made on the spot (Hanli 2026-11-02: 「待取感觉应该删掉」 —
// the 洞府's 待取 made the pouch's size mean nothing; the shape is the agent's
// pick, Hanli delegated 11-02): a drop, a reward or a grant waits at the door
// (`state.full_offer`, a short queue of { id, n, from }) — Look's 「储物袋满了」
// card — until he drops a stack for it (`bag swap`), takes it once there is
// room (`bag take`), or lets it go (`bag letgo`). Nothing is stashed, nothing
// silently lost, and nothing else waits on it. A find on the road and a
// purchase are refused instead, so he chooses (2026-09-25).
import { pick } from '../state.mjs';
import { tierRank } from './arms.mjs';
import { companionOf } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf, questDoneBefore, questOf } from './errands.mjs';
import { keyInUse } from './travel.mjs';
import { tierIndex } from './world.mjs';

const RULE = content => content.rewards.pouch ?? { by_tier: {} };

/* The room: the highest realm row at or below his, plus the one bigger pouch
   he wears. A world without the table has no cap. */
function baseCap(content, state) {
  const rows = Object.entries(RULE(content).by_tier ?? {});
  if (!rows.length) return Infinity;
  const rank = tierIndex(content, state);
  const fits = rows.filter(([tier]) => tierRank(content, tier) <= rank).sort((a, b) => tierRank(content, b[0]) - tierRank(content, a[0]));
  return (fits[0] ?? rows.sort((a, b) => tierRank(content, a[0]) - tierRank(content, b[0]))[0])[1];
}
const addsOf = (content, id) => (id ? itemOf(content, id)?.effect?.pouch ?? 0 : 0);
/* The bigger pouch he wears, or null (the realm's plain one). One at a time; a save from before 11-04 that still
   lists several (fitPouch moves the rest to the bag on load) counts only its biggest, the first of a tie. */
const wornPouch = (content, state) => (state.pouch ?? []).reduce((best, id) => (best == null || addsOf(content, id) > addsOf(content, best) ? id : best), null);
const pouchCap = (content, state) => baseCap(content, state) + addsOf(content, wornPouch(content, state));
/* The room he would have with this pouch swapped in — his realm's plus its own, never on top of the one he wears (one at a
   time, Hanli 2026-11-04: 「我们定的储物袋不能叠加」) — beside the room he has now. Null in a world with no cap. */
const roomWith = (content, state, id) => {
  const base = baseCap(content, state);
  return Number.isFinite(base) ? { room: base + addsOf(content, id), now: pouchCap(content, state), ...(wornPouch(content, state) === id ? { worn: true } : {}) } : null;
};

/* A thing that takes no slot: a key, a story thing (items.json `story`: kept,
   never sold — 紫须芝 he carries back to 阿禾), one the chapter or a taken
   errand still needs, her bell. */
function freeSlot(content, state, id) {
  const item = itemOf(content, id);
  if (item?.kind === 'key' || item?.story) return true;
  if (companionOf(content)?.bell === id) return true;
  if (keyInUse(content, state, id)) return true;
  return Object.keys(state.quests ?? {}).some(q => !questDoneBefore(state, q)
    && (questOf(content, q)?.need ?? []).some(n => n.kind === 'carry' && n.item === id));
}

/* What he wears is on him, not in the pouch (Hanli 11-03: 「已经佩戴或装备到身上的物品, 应该不占储物袋空间了」):
   a stack takes a slot only for the ones left over after every slot that wears it (`state.wear`). */
const wornOf = (state, id) => Object.values(state.wear ?? {}).filter(w => w === id).length;
const spare = (state, id) => (state.bag?.[id] ?? 0) - wornOf(state, id);
const slotsUsed = (content, state) => Object.keys(state.bag ?? {}).filter(id => spare(state, id) > 0 && !freeSlot(content, state, id)).length;

/* Room for one more of this: a spare stack he holds, a free thing, or a slot open. */
const roomFor = (content, state, id) => spare(state, id) > 0 || freeSlot(content, state, id) || slotsUsed(content, state) < pouchCap(content, state);

/* Into the pouch, or — full — to the door: one more on the offer queue (merged by id). What it did, named. */
function stow(content, state, id, n = 1, from = null) {
  const name = pick(itemOf(content, id)?.name, state.lang) ?? id;
  // 图鉴's things (his, 2026-10-15: first finds marked new): the first time a thing comes to him
  // by any door it is `new`; `state.found` (id → how many ever came) keeps it, so the 收集 counts
  // and the drop's weighting (arms.mjs lootOf) remember it after it is sold or spent.
  const fresh = !hasFound(state, id);
  state.found = { ...(state.found ?? {}), [id]: (state.found?.[id] ?? 0) + n };
  if (roomFor(content, state, id)) {
    state.bag[id] = (state.bag[id] ?? 0) + n;
    return { id, name, n: state.bag[id], ...(fresh ? { new: true } : {}) };
  }
  const offer = offerAdd(state, id, n, from);
  return { id, name, n: offer.n, offered: true, ...(fresh ? { new: true } : {}) };
}
function offerAdd(state, id, n, from = null) {
  const queue = [...(state.full_offer ?? [])], at = queue.findIndex(o => o.id === id);
  const offer = at >= 0 ? { ...queue[at], n: queue[at].n + n } : { id, n, ...(from ? { from } : {}) };
  if (at >= 0) queue[at] = offer; else queue.push(offer);
  state.full_offer = queue;
  return offer;
}
/* Had it ever: found by a door that stows, or in the bag or at the door now (a save from before `found`). */
const hasFound = (state, id) => Boolean(state.found?.[id] || state.bag?.[id] > 0 || (state.full_offer ?? []).some(o => o.id === id));

/* The rules' own line when anything waits at the door: 「储物袋满了：X 等你定夺。」 */
function fullLine(state, got) {
  const names = [...new Set((got ?? []).filter(g => g?.offered).map(g => g.name))];
  if (!names.length) return null;
  return state.lang === 'en'
    ? `The storage pouch is full — ${names.join(', ')} ${names.length > 1 ? 'wait' : 'waits'} on your choice.`
    : `储物袋满了：${names.join('、')}等你定夺。`;
}

/* A save from before 11-02: what waited at the 洞府 (`state.held`) goes into the pouch while there is room, the
   rest to the door's queue — never dropped. The state itself when there is nothing to move. */
function fitHeld(content, state) {
  if (!state?.held) return state;
  const s = { ...state, bag: { ...(state.bag ?? {}) } };
  delete s.held;
  for (const [id, n] of Object.entries(state.held)) {
    if (!(n > 0) || !itemOf(content, id)) continue;
    if (roomFor(content, s, id)) s.bag[id] = (s.bag[id] ?? 0) + n;
    else offerAdd(s, id, n, 'held');
  }
  return s;
}

/* A save from before 11-04 (Hanli: 「只能有一个储物袋吧」), several pouches put to use: the biggest is worn (the first
   of a tie — the one he put on first), each other goes back into the bag as a thing, or — no room — to the door's
   queue (`from: 'pouch'`). Never dropped. The state itself when there is at most one. */
function fitPouch(content, state) {
  if (!state || (state.pouch?.length ?? 0) <= 1) return state;
  const keep = wornPouch(content, state);
  const s = { ...state, bag: { ...(state.bag ?? {}) }, pouch: [keep] };
  const rest = [...state.pouch];
  rest.splice(rest.indexOf(keep), 1);
  for (const id of rest) {
    if (roomFor(content, s, id)) s.bag[id] = (s.bag[id] ?? 0) + 1;
    else offerAdd(s, id, 1, 'pouch');
  }
  return s;
}

/* 换上 a bigger pouch (travel.mjs trade use): the one he wears comes off, back into the bag as a thing; this one leaves
   the bag for his waist. Refused when it is the one he wears (`pouch-used`), or when it would leave him with fewer slots
   than he uses (`pouch-short`, the shortfall named) — unless it is the bigger one: an old save already over its room
   may always trade up. Mutates `s`; answers the old pouch (named) or null, or a refusal. */
function wearPouch(content, s, item) {
  const lang = s.lang, old = wornPouch(content, s);
  if (old === item.id) return refuse('pouch-used', pick({ zh: '这样的储物袋你已经换上了。', en: 'You already carry a pouch like that.' }, lang));
  const t = { ...s, bag: { ...s.bag }, pouch: [item.id] };
  t.bag[item.id] = (t.bag[item.id] ?? 0) - 1;
  if (t.bag[item.id] <= 0) delete t.bag[item.id];
  if (old) t.bag[old] = (t.bag[old] ?? 0) + 1;
  const short = slotsUsed(content, t) - pouchCap(content, t);
  if (short > 0 && addsOf(content, item.id) <= addsOf(content, old)) {
    return refuse('pouch-short', pick({ zh: `换上它还差 ${short} 格，先卖或丢 ${short} 样。`, en: `That pouch is ${short} ${short > 1 ? 'slots' : 'slot'} short — sell or drop ${short} first.` }, lang), { short });
  }
  s.bag = t.bag;
  s.pouch = t.pouch;
  return { swapped: old ? { id: old, name: pick(itemOf(content, old)?.name, lang) ?? old } : null };
}

const fullSay = lang => pick({ zh: '储物袋已满，先卖或丢一样。', en: 'The storage pouch is full — sell or drop something first.' }, lang);
const bagFull = (content, state, extra = {}) => refuse('bag-full', fullSay(state.lang), { used: slotsUsed(content, state), cap: pouchCap(content, state), ...extra });

/* What waits at the door, as the card and the panel read it. */
const doorOffers = (content, state) => (state.full_offer ?? []).filter(o => o.n > 0).map(o => {
  const item = itemOf(content, o.id);
  return { id: o.id, name: pick(item?.name, state.lang) ?? o.id, kind: item?.kind ?? null, art: item?.art ?? null, n: o.n, ...(o.from ? { from: o.from } : {}), room: roomFor(content, state, o.id) };
});

/* The pouch as the panel reads it: used / cap, the realm's room (`base`), the one bigger pouch he
   wears (`carried`, a list of one — the shape kept for older readers: what it adds), and what waits at the door (`offers`). */
function pouchBrief(content, state) {
  const cap = pouchCap(content, state), base = baseCap(content, state), lang = state.lang;
  const id = wornPouch(content, state), item = id ? itemOf(content, id) : null;
  const carried = id ? [{ id, name: pick(item?.name, lang) ?? id, art: item?.art ?? null, adds: addsOf(content, id) }] : [];
  const offers = doorOffers(content, state);
  return { used: slotsUsed(content, state), cap: Number.isFinite(cap) ? cap : null, base: Number.isFinite(base) ? base : null,
    ...(offers.length ? { offers } : {}), ...(carried.length ? { carried } : {}) };
}

/* Bag — the panel's own verb. `toss` throws one slot away (the whole stack), never a thing the story still needs
   (`story-keep`) or one he wears. At the door (`state.full_offer`): `swap` drops the stack `id` and takes the offer `take` in its
   place; `take` takes an offer in once there is room; `letgo` lets an offer go. */
const named = (content, s, id, n) => ({ id, name: pick(itemOf(content, id)?.name, s.lang) ?? id, n });
const offerAt = (s, id) => (s.full_offer ?? []).find(o => o.id === id && o.n > 0) ?? null;
const offerGone = (s, id) => {
  s.full_offer = (s.full_offer ?? []).filter(o => o.id !== id);
  if (!s.full_offer.length) delete s.full_offer;
};
/* 剧情要用 (Hanli 11-03: story things never take a slot, are never tossed or sold): one refusal for every door
   that would let a freeSlot thing go — 丢, 换, 卖 (travel.mjs trade). */
const storyKeep = (content, s, id) => (freeSlot(content, s, id)
  ? refuse('story-keep', pick({ zh: '剧情要用，先留着。', en: 'The story needs it — keep it.' }, s.lang)) : null);
const tossRefused = (content, s, id) => {
  if (!(s.bag[id] > 0)) return refuse('not-in-bag', null);
  const keep = storyKeep(content, s, id);
  if (keep) return keep;
  if (Object.values(s.wear ?? {}).includes(id)) return refuse('worn', pick({ zh: '先卸下再丢。', en: 'Take it off first.' }, s.lang));
  return null;
};
const notOffered = () => refuse('not-offered', null);
const BAG = {
  toss: (content, s, id) => {
    const no = tossRefused(content, s, id);
    if (no) return no;
    const n = s.bag[id];
    delete s.bag[id];
    return { ok: true, tossed: named(content, s, id, n) };
  },
  take: (content, s, id) => {
    const o = offerAt(s, id);
    if (!o) return notOffered();
    if (!roomFor(content, s, id)) return bagFull(content, s);
    s.bag[id] = (s.bag[id] ?? 0) + o.n;
    offerGone(s, id);
    return { ok: true, took: named(content, s, id, o.n) };
  },
  swap: (content, s, id, args) => {
    const take = String(args.take ?? ''), o = offerAt(s, take);
    if (!o) return notOffered();
    const no = tossRefused(content, s, id);
    if (no) return no;
    const n = s.bag[id];
    delete s.bag[id];
    s.bag[take] = (s.bag[take] ?? 0) + o.n;
    offerGone(s, take);
    return { ok: true, tossed: named(content, s, id, n), took: named(content, s, take, o.n) };
  },
  letgo: (content, s, id) => {
    const o = offerAt(s, id);
    if (!o) return notOffered();
    offerGone(s, id);
    return { ok: true, let_go: named(content, s, id, o.n) };
  },
};
export function bag(state, content, ctx, args) {
  const action = String(args.action ?? ''), id = String(args.id ?? '');
  if (!BAG[action]) return refuse('unknown-action', null, { actions: Object.keys(BAG) });
  const s = clone(state);
  const r = BAG[action](content, s, id, args);
  if (r.result) return r; // a refusal
  return { state: s, result: { ...r, pouch: pouchBrief(content, s) } };
}

export { hasFound, bagFull, fitHeld, fitPouch, freeSlot, storyKeep, fullLine, doorOffers, pouchBrief, pouchCap, roomFor, roomWith, slotsUsed, stow, wearPouch, wornPouch };
