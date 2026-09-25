// rules/pouch.mjs — 储物袋: the bag has room, counted in slots.
// Part of the rules engine; rules.mjs is its one door.
//
// One item id is one slot, however many are stacked in it. A key the story
// still needs (kind `key`, an exit of the open chapter or a taken errand's
// `carry`, her bell) takes no slot. The room grows with the realm
// (rewards.json `pouch.by_tier`) and by a bigger 储物袋 bought at a 坊市
// (items.json `effect.pouch`, used once each, for good). When the pouch is
// full nothing is lost: a drop, a reward or a grant waits at the 洞府 (待取,
// `state.held`) until there is room and he taps it in; a find on the road and
// a purchase are refused instead, so he chooses (Hanli, 2026-09-25).
import { pick } from '../state.mjs';
import { tierRank } from './arms.mjs';
import { companionOf } from './companion.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf, questDoneBefore, questOf } from './errands.mjs';
import { keyInUse } from './travel.mjs';
import { tierIndex } from './world.mjs';

const RULE = content => content.rewards.pouch ?? { by_tier: {} };

/* The room: the highest realm row at or below his, plus every bigger pouch
   he has put to use. A world without the table has no cap. */
function pouchCap(content, state) {
  const rows = Object.entries(RULE(content).by_tier ?? {});
  if (!rows.length) return Infinity;
  const rank = tierIndex(content, state);
  const fits = rows.filter(([tier]) => tierRank(content, tier) <= rank).sort((a, b) => tierRank(content, b[0]) - tierRank(content, a[0]));
  const base = (fits[0] ?? rows.sort((a, b) => tierRank(content, a[0]) - tierRank(content, b[0]))[0])[1];
  const more = (state.pouch ?? []).reduce((n, id) => n + (itemOf(content, id)?.effect?.pouch ?? 0), 0);
  return base + more;
}

/* A thing that takes no slot: a key, one the chapter or a taken errand still
   needs, her bell. */
function freeSlot(content, state, id) {
  const item = itemOf(content, id);
  if (item?.kind === 'key') return true;
  if (companionOf(content)?.bell === id) return true;
  if (keyInUse(content, state, id)) return true;
  return Object.keys(state.quests ?? {}).some(q => !questDoneBefore(state, q)
    && (questOf(content, q)?.need ?? []).some(n => n.kind === 'carry' && n.item === id));
}

const slotsUsed = (content, state) => Object.entries(state.bag ?? {}).filter(([id, n]) => n > 0 && !freeSlot(content, state, id)).length;

/* Room for one more of this: a stack he holds, a free thing, or a slot open. */
const roomFor = (content, state, id) => (state.bag?.[id] ?? 0) > 0 || freeSlot(content, state, id) || slotsUsed(content, state) < pouchCap(content, state);

/* Into the pouch, or — full — into 待取 at the 洞府. What it did, named. */
function stow(content, state, id, n = 1) {
  const name = pick(itemOf(content, id)?.name, state.lang) ?? id;
  if (roomFor(content, state, id)) {
    state.bag[id] = (state.bag[id] ?? 0) + n;
    return { id, name, n: state.bag[id] };
  }
  state.held = { ...(state.held ?? {}), [id]: (state.held?.[id] ?? 0) + n };
  return { id, name, n: state.held[id], stored: true };
}

/* The rules' own line when anything went to 待取: 「储物袋已满，X 存进洞府待取。」 */
function storedLine(state, got) {
  const names = [...new Set((got ?? []).filter(g => g?.stored).map(g => g.name))];
  if (!names.length) return null;
  return state.lang === 'en'
    ? `The storage pouch is full — ${names.join(', ')} ${names.length > 1 ? 'wait' : 'waits'} at the abode.`
    : `储物袋已满，${names.join('、')}存进洞府待取。`;
}

const fullSay = lang => pick({ zh: '储物袋已满，先卖或丢一样。', en: 'The storage pouch is full — sell or drop something first.' }, lang);
const bagFull = (content, state, extra = {}) => refuse('bag-full', fullSay(state.lang), { used: slotsUsed(content, state), cap: pouchCap(content, state), ...extra });

/* The pouch as the panel reads it: used / cap, and what waits at the 洞府. */
function pouchBrief(content, state) {
  const cap = pouchCap(content, state), lang = state.lang;
  const held = Object.entries(state.held ?? {}).filter(([, n]) => n > 0).map(([id, n]) => {
    const item = itemOf(content, id);
    return { id, name: pick(item?.name, lang) ?? id, kind: item?.kind ?? null, art: item?.art ?? null, n };
  });
  return { used: slotsUsed(content, state), cap: Number.isFinite(cap) ? cap : null, held,
    ...((state.pouch ?? []).length ? { grown: state.pouch.map(id => pick(itemOf(content, id)?.name, lang) ?? id) } : {}) };
}

/* Bag — the panel's own verb: `claim` moves a thing waiting at the 洞府 into
   the pouch (all of it, when there is room); `toss` throws one slot away
   (the whole stack), never a thing the story still needs or one he wears. */
const BAG = {
  claim: (content, s, id) => {
    const n = s.held?.[id] ?? 0;
    if (!n) return refuse('not-held', null);
    if (!roomFor(content, s, id)) return bagFull(content, s);
    s.bag[id] = (s.bag[id] ?? 0) + n;
    delete s.held[id];
    if (!Object.keys(s.held).length) delete s.held;
    return { ok: true, claimed: { id, name: pick(itemOf(content, id)?.name, s.lang) ?? id, n } };
  },
  toss: (content, s, id) => {
    const n = s.bag[id] ?? 0;
    if (!n) return refuse('not-in-bag', null);
    if (freeSlot(content, s, id)) return refuse('key-in-use', pick({ zh: '这东西还有用处，先留着。', en: 'You will need that yet — keep it.' }, s.lang));
    if (Object.values(s.wear ?? {}).includes(id)) return refuse('worn', pick({ zh: '先卸下再丢。', en: 'Take it off first.' }, s.lang));
    delete s.bag[id];
    return { ok: true, tossed: { id, name: pick(itemOf(content, id)?.name, s.lang) ?? id, n } };
  },
};
export function bag(state, content, ctx, args) {
  const action = String(args.action ?? ''), id = String(args.id ?? '');
  if (!BAG[action]) return refuse('unknown-action', null, { actions: Object.keys(BAG) });
  const s = clone(state);
  const r = BAG[action](content, s, id);
  if (r.result) return r; // a refusal
  return { state: s, result: { ...r, pouch: pouchBrief(content, s) } };
}

export { bagFull, freeSlot, pouchBrief, pouchCap, roomFor, slotsUsed, stow, storedLine };
