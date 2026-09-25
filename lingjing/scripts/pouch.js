// pouch.js — 储物袋, the panel the top bar's chip opens over the stage (Hanli,
// 2026-09-25). Pure drawing: the rules' `gear` read in, HTML out, every word
// esc()'d. What he wears is one compact row; below it the pouch — used / cap,
// what waits at the 洞府 (待取), tabs by kind, a grid of tiles, and the
// detail of the one tapped with the taps it takes (服用 · 佩戴 · 卖 · 丢).
// Every tap is the page's own verb (trade, bag, deck); nothing asks Ling.
import { esc } from './esc.js';
import { deckHtml, gearFightHtml, herCardHtml, itemDoes, liftSaid, tamesLine } from './cards.js';

export const POUCH_WORDS = {
  zh: {
    title: '储物袋', close: '合上', used: '{used}/{cap} 格', over: '超出 {n} 格：新得的东西会先存进洞府。',
    held: '待取 {n}', heldTitle: '洞府 · 待取', heldNote: '储物袋满时得的东西在这里等着。有空位就能收进。', claim: '收进', back: '回储物袋',
    tabs: { all: '全部', pill: '丹药', arms: '法器', material: '材料', charm: '符', story: '剧情' },
    deck: '牌组', empty: '储物袋是空的。', tabEmpty: '这里还没有东西。', pick: '点一样东西看看。',
    take: '服用', wear: '佩戴', study: '参悟', carry: '换上', sell: '卖 {n}', toss: '丢',
    tossAsk: '丢掉{name} ×{n}？丢了就找不回了。', tossYes: '丢掉', tossNo: '留着',
    free: '剧情所需，不占格', grown: '已换上：{names}',
  },
  en: {
    title: 'Storage Pouch', close: 'Close', used: '{used}/{cap} slots', over: '{n} over: new things wait at the abode first.',
    held: '{n} waiting', heldTitle: 'The abode · waiting', heldNote: 'What came while the pouch was full waits here. Take it in when there is room.', claim: 'Take in', back: 'Back to the pouch',
    tabs: { all: 'All', pill: 'Pills', arms: 'Arms', material: 'Materials', charm: 'Talismans', story: 'Story' },
    deck: 'Deck', empty: 'The pouch is empty.', tabEmpty: 'Nothing here yet.', pick: 'Tap a thing to look at it.',
    take: 'Take', wear: 'Wear', study: 'Study', carry: 'Carry it', sell: 'Sell {n}', toss: 'Drop',
    tossAsk: 'Throw away {name} ×{n}? It is gone for good.', tossYes: 'Throw away', tossNo: 'Keep it',
    free: 'the story needs it — takes no slot', grown: 'Carried: {names}',
  },
};
const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/* A thing's tab: what the story still needs is 剧情 whatever its kind; the
   rest by kind. No search — a pouch holds a few dozen. */
export const TABS = ['all', 'pill', 'arms', 'material', 'charm', 'story'];
const KIND_TAB = { pill: 'pill', weapon: 'arms', robe: 'arms', pendant: 'arms', artifact: 'arms', gear: 'arms', treasure: 'arms', pouch: 'arms',
  material: 'material', charm: 'charm', scroll: 'charm', key: 'story' };
export const tabOf = (i) => (i.free ? 'story' : KIND_TAB[i.kind] ?? 'material');

/* What he wears: 法器 · 法衣 · 佩 · 本命法宝, and hers when she walks with him —
   one compact row, each with 卸下 as the popover had it. */
function wornHtml(g, ctx) {
  const w = ctx.words, t = ctx.look?.treasure;
  const cell = (label, body, off = '') => `<div class="pworn"><span class="lbl">${esc(label)}</span>${body}${off}</div>`;
  const name = (it) => (it ? `<b data-pouch-item="${esc(it.id)}" role="button" tabindex="0">${esc(it.name)}</b>` : `<span class="dim">${esc(w.gearEmpty)}</span>`);
  const slots = g.slots.map((s) => cell(w.gearSlots[s.slot] ?? s.slot, name(s.item), s.item ? `<button class="act quiet" data-remove="${esc(s.item.id)}">${esc(w.gearOff)}</button>` : '')).join('');
  const treasure = t ? cell(w.gearSlots.treasure, `<b>${esc(t.name)}</b><span class="small dim">${esc(t.step)} · ${esc(t.element_name)}</span>`) : '';
  const lift = g.her?.item ? liftSaid(g.her.item.effect, w) : '';
  const her = g.her ? cell(say(w.gearHer, { name: g.her.name }), `${name(g.her.item)}${lift ? `<span class="small dim">${esc(lift)}</span>` : ''}`) : '';
  return `<div class="pwornrow">${slots}${treasure}${her}</div>${gearFightHtml(g.fight, ctx)}${g.her ? herCardHtml(g.her, ctx) : ''}`;
}

const artOf = (i, ctx) => (i.art ? `<img src="${esc((ctx.artBase ?? '') + i.art)}" alt="" loading="lazy">` : '<i class="noart" aria-hidden="true"></i>');

function tileHtml(i, ctx, sel) {
  return `<button class="ptile${sel === i.id ? ' sel' : ''}${i.worn ? ' worn' : ''}${i.free ? ' free' : ''}" data-pouch-item="${esc(i.id)}" aria-pressed="${sel === i.id}">
    ${artOf(i, ctx)}<span class="pname">${esc(i.name)}</span>${i.n > 1 ? `<b class="pn">×${esc(i.n)}</b>` : ''}${i.worn ? `<span class="pmark">${esc(ctx.words.worn)}</span>` : ''}</button>`;
}

/* The one tapped: what it is, what it does, who it wins over, and its taps.
   The rules decide each one; a button is drawn only where it can land. */
function detailHtml(i, g, ctx, pw, ui) {
  if (!i) return `<div class="pdetail empty small dim">${esc(pw.pick)}</div>`;
  const w = ctx.words, e = i.effect ?? {};
  const kind = ctx.look?.words?.[i.kind] ?? i.kind ?? '';
  const acts = [];
  if (e.progress) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(pw.take)}</button>`);
  else if (e.learn) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(pw.study)}</button>`);
  else if (e.pouch) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(pw.carry)}</button>`);
  if (i.slot && !i.worn) acts.push(`<button class="act" data-wear="${esc(i.id)}">${esc(say(w.gearTo, { slot: w.gearSlots[i.slot] ?? g.her?.name ?? i.slot }))}</button>`);
  if (i.worn && (g.slots ?? []).some((s) => s.item?.id === i.id)) acts.push(`<button class="act quiet" data-remove="${esc(i.id)}">${esc(w.gearOff)}</button>`);
  if (g.market && i.sell != null && !i.free) acts.push(`<button class="act quiet" data-sell="${esc(i.id)}">${esc(say(pw.sell, { n: i.sell }))}</button>`);
  if (!i.free && !i.worn) acts.push(`<button class="act quiet danger" data-toss="${esc(i.id)}">${esc(pw.toss)}</button>`);
  // 丢 asks here, on the pane — the page's own confirm, never window.confirm.
  const ask = ui.toss === i.id ? `<div class="ptoss" role="alertdialog"><span>${esc(say(pw.tossAsk, { name: i.name, n: i.n }))}</span>
    <button class="act danger" data-toss-yes="${esc(i.id)}">${esc(pw.tossYes)}</button><button class="act quiet" data-toss-no>${esc(pw.tossNo)}</button></div>` : '';
  return `<div class="pdetail">${artOf(i, ctx)}<div class="pdbody"><b class="pdname">${esc(i.name)}</b>${i.n > 1 ? ` <span class="dim">×${esc(i.n)}</span>` : ''}
    <div class="small dim">${esc(kind)}${kind ? ' · ' : ''}${esc(itemDoes(e, ctx))}</div>
    ${i.about ? `<div class="small about">${esc(i.about)}</div>` : ''}${tamesLine(i, ctx)}
    ${i.free ? `<div class="small dim">${esc(pw.free)}</div>` : ''}
    ${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}${ask}</div></div>`;
}

/* 待取 — what came while the pouch was full, each with its 收进. */
function heldHtml(p, ctx, pw) {
  const rows = p.held.map((h) => `<div class="pheld">${artOf(h, ctx)}<b>${esc(h.name)}</b>${h.n > 1 ? ` <span class="dim">×${esc(h.n)}</span>` : ''}
    <button class="act" data-claim="${esc(h.id)}">${esc(pw.claim)}</button></div>`).join('');
  return `<section class="psec"><h3>${esc(pw.heldTitle)}</h3><p class="small dim">${esc(pw.heldNote)}</p>${rows}</section>`;
}

/// The panel. `ui` is the page's own view of it: `tab`, `sel` (the item
/// tapped), `toss` (the item asking 丢?), `pane` ('held' | 'deck' | null).
export function pouchHtml(ctx, ui = {}) {
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh, g = ctx.gear;
  const close = `<button class="act quiet" data-pouch-close>${esc(pw.close)}</button>`;
  if (!g) return `<div class="lu pouch"><header class="luhead"><b>${esc(pw.title)}</b>${close}</header><div class="loading">…</div></div>`;
  const p = g.pouch ?? { used: g.bag.length, cap: null, held: [] };
  const heldN = p.held.reduce((n, h) => n + h.n, 0);
  const pane = ui.pane === 'held' && heldN ? 'held' : ui.pane === 'deck' && g.cards?.length ? 'deck' : null;
  const head = `<header class="luhead phead"><b>${esc(pw.title)}</b>
    ${p.cap != null ? `<span class="pused${p.used > p.cap ? ' over' : p.used >= p.cap ? ' full' : ''}">${esc(say(pw.used, p))}</span>` : ''}
    ${heldN ? `<button class="pchip${pane === 'held' ? ' on' : ''}" data-pouch-pane="held">${esc(say(pw.held, { n: heldN }))}</button>` : ''}
    ${g.cards?.length ? `<button class="pchip${pane === 'deck' ? ' on' : ''}" data-pouch-pane="deck">${esc(pw.deck)}</button>` : ''}${close}</header>`;
  const note = ctx.gearNote ? `<div class="donote">${esc(ctx.gearNote)}</div>` : '';
  const over = p.cap != null && p.used > p.cap ? `<p class="small pover">${esc(say(pw.over, { n: p.used - p.cap }))}</p>` : '';
  const grown = p.grown?.length ? `<p class="small dim">${esc(say(pw.grown, { names: p.grown.join(ctx.lang === 'en' ? ', ' : '、') }))}</p>` : '';
  const worn = `<section class="psec">${wornHtml(g, ctx)}</section>`;
  if (pane) {
    const body = pane === 'held' ? heldHtml(p, ctx, pw) : `<section class="psec">${deckHtml(g, ctx)}</section>`;
    return `<div class="lu pouch" role="dialog" aria-label="${esc(pw.title)}">${head}${note}${worn}
      <button class="act quiet pback" data-pouch-pane="">${esc(pw.back)}</button>${body}</div>`;
  }
  const tab = TABS.includes(ui.tab) ? ui.tab : 'all';
  const count = (t) => (t === 'all' ? g.bag.length : g.bag.filter((i) => tabOf(i) === t).length);
  const tabs = `<div class="ptabs" role="tablist">${TABS.map((t) => `<button role="tab" class="ptab${t === tab ? ' on' : ''}${count(t) ? '' : ' none'}" data-pouch-tab="${t}" aria-selected="${t === tab}">${esc(pw.tabs[t])}<span>${count(t)}</span></button>`).join('')}</div>`;
  const shown = g.bag.filter((i) => tab === 'all' || tabOf(i) === tab);
  const sel = g.bag.find((i) => i.id === ui.sel) ?? null;
  const grid = shown.length ? `<div class="pgrid">${shown.map((i) => tileHtml(i, ctx, ui.sel)).join('')}</div>`
    : `<p class="small dim">${esc(g.bag.length ? pw.tabEmpty : pw.empty)}</p>`;
  return `<div class="lu pouch" role="dialog" aria-label="${esc(pw.title)}">${head}${note}${worn}
    <section class="psec">${over}${grown}${tabs}<div class="pbody">${grid}${g.bag.length ? detailHtml(sel, g, ctx, pw, ui) : ''}</div></section></div>`;
}
