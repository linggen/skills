// kace.js — 卡册, the book of every card to collect (design.md § 斗法 v4 · 品 · 框 · the 卡册): the 牌组's second view in
// the 储物袋 panel. Facts only, from the rules' `deck book` read (rules/cards.mjs kaceBrief), asked when the view opens:
// a held card is its face in its frame, as the hand draws it; one not held a dim back in its frame with the one line of
// where it is found. Counts by 品 and overall; a companion's cards on their own leaf, shown, never counted. The leaves
// are taps that show; a card is not a button (nothing here changes the save).

import { cardFaceHtml } from './battle-card.js';
import { esc } from './esc.js';
import { pinClass } from './rules/pin.mjs';

export const KACE_WORDS = {
  zh: { deck: '牌组', book: '卡册', all: '全部', companions: '同伴', count: '{held}/{of}', title: '卡册 · 已得 {held}/{of}', fresh: '新',
    note: '框即是品：银，妖兽初降所留；金，妖兽自己的牌；宝石，大妖的牌；钻石，收服的灵兽。暗着的还没得到。',
    compNote: '同伴的牌，由他们自己出，不计入卡册。', none: '这一品还没有牌。' },
  en: { deck: 'Deck', book: 'Collection', all: 'All', companions: 'Companions', count: '{held}/{of}', title: 'Collection · {held}/{of}', fresh: 'new',
    note: "The frame is the grade. Silver: a beast's first leaving. Gold: its own card. Gem: a great beast's. Diamond: tamed. Dim: not yet yours.",
    compNote: "Companions' cards are theirs to play and are not counted.", none: 'No cards of this grade.' },
};
const say = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const LEAVES = ['all', 'fan', 'yin', 'jin', 'baoshi', 'zuanshi', 'companions'];

/// The two views over the 牌组 pane: 牌组 (the cards he holds, the day's ten lit) · 卡册. A tap switches the pane.
export function kaceSwitchHtml(on, lang) {
  const w = KACE_WORDS[lang] ?? KACE_WORDS.zh;
  const b = (pane, label) => `<button role="tab" class="kview${on === pane ? ' on' : ''}" data-pouch-pane="${pane}" aria-selected="${on === pane}">${esc(label)}</button>`;
  return `<div class="kviews" role="tablist">${b('deck', w.deck)}${b('kace', w.book)}</div>`;
}

/* A card held: its face as the hand draws it, in its frame (battle-card.js leafHtml reads ctx.pins). */
const heldHtml = (c, ctx, w) => {
  const leaf = cardFaceHtml(c.id, ctx);
  return leaf ? `<div class="bcard face kcard held el-${esc(c.element ?? 'none')}" data-kace-card="${esc(c.id)}">${leaf}${c.fresh ? `<b class="deckfresh">${esc(w.fresh)}</b>` : ''}</div>`
    : `<div class="bcard face kcard held" data-kace-card="${esc(c.id)}">${backHtml(c, null)}</div>`;
};
/* A card not held: a dim back in its frame, its name, and the one line of where it is found. */
function backHtml(c, pin) {
  const framed = pinClass(pin);
  return `<span class="bleaf kback${framed}">${framed ? '<i class="bpin" aria-hidden="true"></i>' : ''}<span class="kseal" aria-hidden="true"></span><b class="kname">${esc(c.name)}</b>${c.where ? `<small class="kwhere">${esc(c.where)}</small>` : ''}</span>`;
}
const cardHtml = (c, ctx, w) => (c.held ? heldHtml(c, ctx, w) : `<div class="bcard face kcard" data-kace-card="${esc(c.id)}">${backHtml(c, c.pin)}</div>`);

function gradeHtml(k, pin, ctx, w) {
  const row = k.counts.find((x) => x.pin === pin), cards = k.cards.filter((c) => c.pin === pin);
  return `<section class="kgrade" data-kace-grade="${esc(pin)}"><h3><span class="kpin${pinClass(pin, ' kpin-')}" aria-hidden="true"></span>${esc(row?.name ?? pin)} <span class="kcount">${esc(say(w.count, row ?? { held: 0, of: 0 }))}</span></h3>
    ${cards.length ? `<div class="spoils deckfaces kfaces">${cards.map((c) => cardHtml(c, ctx, w)).join('')}</div>` : `<p class="small dim">${esc(w.none)}</p>`}</section>`;
}
function companionsHtml(k, ctx, w) {
  // Theirs, not his to collect: each card face up as they play it, no count.
  const rows = (k.companions ?? []).map((m) => `<section class="kgrade kcomp" data-kace-member="${esc(m.id)}"><h3>${esc(m.name)}</h3>
    <div class="spoils deckfaces kfaces">${m.cards.map((c) => heldHtml(c, ctx, w)).join('')}</div></section>`).join('');
  return `<p class="small dim">${esc(w.compNote)}</p>${rows}`;
}

/// The 卡册. `k` the rules' brief (null while it is read), `leaf` the one shown ('all' · a 品 · 'companions').
export function kaceHtml(k, ctx, leaf = 'all') {
  const w = KACE_WORDS[ctx.lang] ?? KACE_WORDS.zh;
  if (!k) return `${kaceSwitchHtml('kace', ctx.lang)}<div class="loading">…</div>`;
  const on = LEAVES.includes(leaf) ? leaf : 'all';
  const chip = (id, label, count) => `<button role="tab" class="kleaf${on === id ? ' on' : ''}" data-kace-leaf="${id}" aria-selected="${on === id}"><span class="kpin${id !== 'all' && id !== 'companions' ? pinClass(id, ' kpin-') : ''}" aria-hidden="true"></span>${esc(label)}${count ? ` <span class="kcount">${esc(count)}</span>` : ''}</button>`;
  const chips = [chip('all', w.all, say(w.count, k)), ...k.counts.map((r) => chip(r.pin, r.name, say(w.count, r))),
    ...(k.companions?.length ? [chip('companions', w.companions, '')] : [])].join('');
  const body = on === 'companions' ? companionsHtml(k, ctx, w) : (on === 'all' ? k.counts.map((r) => r.pin) : [on]).map((p) => gradeHtml(k, p, ctx, w)).join('');
  return `${kaceSwitchHtml('kace', ctx.lang)}<div class="cardtitle bagtitle">${esc(say(w.title, k))}</div>
    <div class="kleaves" role="tablist">${chips}</div>
    ${on === 'companions' ? '' : `<p class="small dim knote">${esc(w.note)}</p>`}${body}`;
}
