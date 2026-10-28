// rules/errand-line.mjs — what an errand asks, in words the player can act on (Hanli 2026-10-28, on 彭城的药钱:
// 「没有提示, 玩家不知到怎么做这个差事」 — the row read 「带 0/1 · 就在此处」 and 帮厨 「到 0/1 · 到 0/1」).
// Part of the rules engine; rules.mjs is its one door.
//
// Every need is one step with its own place, named from the rules' facts — never a bare verb and a count:
//   carry  「带一株灵芝」 + where to get it: 「已在囊中」, or the nearest open shop selling it and its price
//   visit  「到藏经阁」, or the need's own words (`do`, a {place} in them): 「先到饭堂提一壶茶 · 再把茶送到讲堂」
//   board  「在柴房玩一局华容道」 (its `at`, else the nearest place hosting it today)
//   subdue · tame 「到上山路降服蠪侄」
// then who it is handed to, where the errand has someone (`to`, or a person giver): 「交给彭城坊市的老丈」.
// `go` is the one next act — the walk, or the buy, the board, the hand-in where he stands — with its label;
// the Mac's 事 book, the 主页's 待办 and the phone all take it as it is (none builds its own need text).
import { itemName, pick } from '../state.mjs';
import { shopsNear } from './shops.mjs';
import { gamesToday } from './rotation.mjs';
import { nearestPlace } from './companion.mjs';
import { creatureOf, hauntsOf, placeName, placeOf, placeOpen } from './world.mjs';

/* 「The woodshed」 mid-sentence: 「at the woodshed」. */
const mid = p => String(p ?? '').replace(/^The /, 'the ');
const stones = n => `${n} ${n === 1 ? 'stone' : 'stones'}`;
const ZH_N = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
const W = {
  zh: {
    carry: (n, unit, item) => `带${n === 1 ? '一' : ZH_N[n] ?? n}${unit ?? '份'}${item}`,
    visit: p => `到${p}`, board: (p, g) => `在${p}玩「${g}」`, subdue: (p, c) => `到${p}降服${c}`, tame: (p, c) => `到${p}驯服${c}`,
    held: '已在囊中', sold: (p, price) => `${p}有卖 · ${price}灵石`, soldHere: price => `这里有卖 · ${price}灵石`,
    first: '先', then: '再', give: (who, p) => (p ? `到${p}交给${who}` : `交给${who}`), sep: ' · ',
    go: p => `去${p}`, buy: (item, price) => `买${item} · ${price}灵石`, play: g => `开局 · ${g}`, turn: '交 差',
  },
  en: {
    carry: (n, unit, item) => (n === 1 ? `Bring ${item}` : `Bring ${n} × ${item}`),
    visit: p => `go to ${mid(p)}`, board: (p, g) => `play “${g}” at ${mid(p)}`, subdue: (p, c) => `subdue the ${c} at ${mid(p)}`, tame: (p, c) => `tame the ${c} at ${mid(p)}`,
    held: 'in your bag', sold: (p, price) => `sold at ${mid(p)} · ${stones(price)}`, soldHere: price => `sold here · ${stones(price)}`,
    first: 'first ', then: 'then ', give: (who, p) => (p ? `hand it to ${who} at ${mid(p)}` : `hand it to ${who}`), sep: ' · ',
    go: p => `Go to ${mid(p)}`, buy: (item, price) => `Buy ${item} · ${stones(price)}`, play: g => `Play · ${g}`, turn: 'Hand it in',
  },
};
const wordsOf = lang => W[lang] ?? W.zh;
const cap = (s, lang) => (lang === 'en' && s ? s[0].toUpperCase() + s.slice(1) : s);
/* 「沉鼎观 · 藏经阁」 → 「藏经阁」: the step names the room, the map names the rest. */
export const bareName = name => String(name ?? '').split(' · ').at(-1);

/* Who the errand is for: a person giver, handed in where they stand (`gates`: errands.mjs withGiver), or the one the
   story brings it to (`to: { place, who }` — 彭城坊市的老丈), named only: 交差 is where he stands (his ruling 2026-09-18,
   不要让用户跑地图 — and the 灵芝 is sold at 彭城, so he hands it in there as he buys it). Null when no one is named. */
export const recipientOf = q => (q?.from?.person ? { place: q.from.place, who: q.from.who, gates: true } : q?.to?.place ? { place: q.to.place, who: q.to.who ?? q.from?.who, gates: false } : null);

const placeRef = (content, state, p) => (p ? { ...placeName(content, state, p), ...(p.id === state.place ? { here: true } : {}) } : null);

/* The nearest open shop he can walk to that sells this, with its price (rules/shops.mjs). */
function shopFor(content, state, item, now) {
  const s = shopsNear(content, state, now).find(x => x.goods.includes(item.id));
  return s ? { place: placeRef(content, state, placeOf(content, s.id)), price: item.buy } : null;
}

/* One need as a step: its words, its place, and for a thing to obtain where it is got. */
function stepOf(content, state, need, now, w, lang) {
  if (need.kind === 'carry') {
    const item = content.items.items.find(i => i.id === need.item);
    const name = item ? itemName(item, state, lang) : need.item;
    const text = w.carry(need.n, pick(item?.unit, lang), name);
    if (need.done) return { text, get: w.held };
    const shop = item ? shopFor(content, state, item, now) : null;
    if (!shop) return { text };
    return { text, at: shop.place, get: shop.place.here ? w.soldHere(shop.price) : w.sold(bareName(shop.place.name), shop.price), buy: { item: need.item, name, price: shop.price } };
  }
  if (need.kind === 'visit') {
    const at = placeRef(content, state, placeOf(content, need.place));
    const p = bareName(at?.name ?? need.place);
    return { text: need.do ? pick(need.do, lang).replace('{place}', lang === 'en' ? mid(p) : p) : w.visit(p), at };
  }
  if (need.kind === 'board') {
    const task = content.tasks.tasks.find(t => t.id === need.task), game = pick(task?.title, lang) ?? need.task;
    const host = need.at ? placeOf(content, need.at) : nearestPlace(content, state, now, p => gamesToday(content, p, now).includes(need.task));
    const at = host ? placeRef(content, state, placeOf(content, host.id)) : null;
    return { text: at ? w.board(bareName(at.name), game) : cap(w.play(game), lang), at, task: need.task, game };
  }
  if (need.kind === 'subdue' || need.kind === 'tame') {
    const haunts = hauntsOf(content, need.creature);
    const p = haunts.find(x => placeOpen(content, state, x, now)) ?? haunts[0];
    const at = placeRef(content, state, p), c = pick(creatureOf(content, need.creature)?.name, lang) ?? need.creature;
    return { text: w[need.kind](bareName(at?.name), c), at };
  }
  return { text: need.kind };
}

/* The errand's steps, its hand-in and the one next act. `need` is countsOf's (have · done). */
export function errandLine(content, state, q, need, lang, now) {
  const w = wordsOf(lang), many = need.length > 1;
  const steps = need.map((n, i) => {
    const s = stepOf(content, state, n, now, w, lang);
    const lead = many ? (i === 0 ? w.first : w.then) : '';
    const count = n.n > 1 && !n.done ? ` ${n.have}/${n.n}` : '';
    return { kind: n.kind, text: cap(lead + s.text, lang) + count + (s.get ? w.sep + s.get : ''), done: n.done, ...(s.at ? { at: s.at } : {}), ...(s.buy ? { buy: s.buy } : {}), ...(s.task ? { task: s.task, game: s.game } : {}) };
  });
  const r = recipientOf(q), rp = r ? placeRef(content, state, placeOf(content, r.place)) : null;
  const who = r ? pick(r.who, lang) : null, where = rp ? bareName(rp.name) : null;
  // 「到{place}交给…」 only where it must be handed there; else the name alone (it carries its place: 彭城坊市的老丈).
  const hand = r ? { text: cap(w.give(who, r.gates && where && !String(who).includes(where) ? where : null), lang), ...(r.gates ? { at: rp } : {}), who } : null;
  return { steps, ...(hand ? { hand } : {}), go: nextAct(steps, hand, need, w) };
}

/* The next act: the first open step's (the buy where it is sold, the board where it is hosted, else the walk), or —
   every count met — the walk to whoever takes it, or 交差 where he stands. */
function nextAct(steps, hand, need, w) {
  const open = steps.find(s => !s.done);
  if (!open) {
    const carry = need.some(n => n.kind === 'carry');
    if (hand?.at && !hand.at.here) return { does: 'move', place: hand.at, label: w.go(bareName(hand.at.name)) };
    return carry || hand ? { does: 'turn', label: w.turn } : null;
  }
  if (!open.at) return null;
  if (open.at.here && open.buy) return { does: 'buy', place: open.at, item: open.buy.item, label: w.buy(open.buy.name, open.buy.price) };
  if (open.at.here && open.task) return { does: 'play', place: open.at, task: open.task, label: w.play(open.game) };
  if (open.at.here) return null;
  return { does: 'move', place: open.at, label: w.go(bareName(open.at.name)) };
}
