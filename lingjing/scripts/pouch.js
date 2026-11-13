// pouch.js — 储物袋, the panel the top bar's chip opens over the stage (Hanli,
// 2026-09-25). Pure drawing: the rules' `gear` read in, HTML out, every word
// esc()'d. What he wears is one compact row; below it the pouch — used / cap,
// tabs by kind, a grid of tiles, and the detail of the one tapped with the
// taps it takes (服用 · 佩戴 · 卖 · 丢). The tabs and the grid are one component
// (bagGridHtml): the 饭桶's 开炉 and the 「储物袋满了」 card draw the same bag.
// Every tap is the page's own verb (trade, bag, deck); nothing asks Ling.
import { esc } from './esc.js';
import { closeX } from './card-close.js';
import { kaceHtml, kaceSwitchHtml } from './kace.js';
import { deckHtml, gearFightHtml, herCardHtml, itemDoes, liftSaid, tamesLine } from './cards.js';
import { PANGLU_WORDS, pangluHtml } from './panglu.js';
import { sealsHtml } from './seals-page.js';

export const POUCH_WORDS = {
  zh: {
    title: '储物袋', close: '合上', used: '{used}/{cap} 格', over: '超出 {n} 格：新得的东西要你定夺。',
    fullTitle: '储物袋满了', fullSwap: '丢一样换它', fullTake: '收下', fullLet: '不要了', fullPick: '点一样丢掉，换{name}', fullBack: '先不换',
    tabs: { all: '全部', pill: '丹药', arms: '法器', material: '材料', charm: '符', story: '剧情' },
    deck: '牌组', seals: '印谱', deckNew: '新 {n}', empty: '储物袋是空的。', tabEmpty: '这里还没有东西。', pick: '点一样东西看看。',
    take: '服用', wear: '佩戴', study: '参悟', carry: '换上 · {n} 格', use: '使用', sell: '卖 {n}', toss: '丢',
    tossAsk: '丢掉{name} ×{n}？丢了就找不回了。', tossYes: '丢掉', tossNo: '留着',
    free: '剧情要用 · 不占格', fantong: '饭桶', ftPut: '放进饭桶',
    pouchSlot: '储物袋', pouchPlain: '随身储物袋', pouchCap: '{name} · {n} 格', pouchDup: '这样的储物袋已在身上，换上无益。',
  },
  en: {
    title: 'Storage Pouch', close: 'Close', used: '{used}/{cap} slots', over: '{n} over: new things wait on your choice.',
    fullTitle: 'The pouch is full', fullSwap: 'Drop one for it', fullTake: 'Take it', fullLet: 'Let it go', fullPick: 'Tap a thing to drop for {name}', fullBack: 'Not now',
    tabs: { all: 'All', pill: 'Pills', arms: 'Arms', material: 'Materials', charm: 'Talismans', story: 'Story' },
    deck: 'Deck', seals: 'Seals', deckNew: '{n} new', empty: 'The pouch is empty.', tabEmpty: 'Nothing here yet.', pick: 'Tap a thing to look at it.',
    take: 'Take', wear: 'Wear', study: 'Study', carry: 'Carry it · {n} slots', use: 'Use', sell: 'Sell {n}', toss: 'Drop',
    tossAsk: 'Throw away {name} ×{n}? It is gone for good.', tossYes: 'Throw away', tossNo: 'Keep it',
    free: 'The story needs it · takes no slot', fantong: 'Rice Bucket', ftPut: 'Into the bucket',
    pouchSlot: 'Pouch', pouchPlain: 'Plain pouch', pouchCap: '{name} · {n} slots', pouchDup: 'You carry one like it already; swapping gains nothing.',
  },
};
const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/* A thing's tab: what the story still needs is 剧情 whatever its kind; the
   rest by kind. No search — a pouch holds a few dozen. */
export const TABS = ['all', 'pill', 'arms', 'material', 'charm', 'story'];
const KIND_TAB = { pill: 'pill', weapon: 'arms', robe: 'arms', shoes: 'arms', pendant: 'arms', artifact: 'arms', gear: 'arms', treasure: 'arms', pouch: 'arms',
  material: 'material', charm: 'charm', scroll: 'charm', key: 'story' };
export const tabOf = (i) => (i.free ? 'story' : KIND_TAB[i.kind] ?? 'material');

/* What he wears: 法器 · 法衣 · 佩 · 本命法宝, and hers when she walks with him —
   one compact row, each with 卸下 as the popover had it. */
function wornHtml(g, ctx) {
  const w = ctx.words, t = ctx.look?.treasure;
  const cell = (label, body, off = '') => `<div class="pworn"><span class="lbl">${esc(label)}</span>${body}${off}</div>`;
  const name = (it) => (it ? `<b data-pouch-item="${esc(it.id)}" role="button" tabindex="0">${esc(it.name)}</b>` : `<span class="dim">${esc(w.gearEmpty)}</span>`);
  const slots = g.slots.map((s) => cell(s.name ?? w.gearSlots[s.slot] ?? s.slot, name(s.item), s.item ? `<button class="act quiet" data-remove="${esc(s.item.id)}">${esc(w.gearOff)}</button>` : '')).join('');
  const treasure = t ? cell(w.gearSlots.treasure, `<b>${esc(t.name)}</b><span class="small dim">${esc(t.step)} · ${esc(t.element_name)}</span>`) : '';
  // Hers: the same three (Hanli 11-03 — rules/wear.mjs), each with its own 卸下.
  const herCell = (s) => {
    const lift = s.item ? liftSaid(s.item.effect, w) : '';
    const off = s.item ? `<button class="act quiet" data-remove="${esc(s.item.id)}" data-on="her" data-slot="${esc(s.slot)}">${esc(w.gearOff)}</button>` : '';
    return cell(s.name ?? w.gearSlots[s.slot] ?? s.slot, `${name(s.item)}${lift ? `<span class="small dim">${esc(lift)}</span>` : ''}`, off);
  };
  // One row a person, named (Hanli 11-03: 「每个角色装备栏占1行, 写清楚角色名」): his slots, pouch and treasure,
  // his fight line under them; then hers, her card under hers.
  const row = (who, cells, under) => `<div class="pwho"><div class="pwhoname">${esc(who)}</div><div class="pwornrow">${cells}</div>${under}</div>`;
  const me = row(ctx.look?.name || w.gearMe, `${slots}${pouchCellHtml(g.pouch, ctx)}${treasure}`, gearFightHtml(g.fight, ctx));
  const her = g.her ? row(g.her.name, (g.her.slots ?? []).map(herCell).join(''), herCardHtml(g.her, ctx)) : '';
  return `${me}${her}`;
}

/* 储物袋 — the pouch he carries, a cell of the worn row: the one bigger pouch he wears (rules/pouch.mjs `carried`, a list
   of one — Hanli 11-04: 「只能有一个储物袋吧」), or the realm's plain one, and the room it gives (Hanli 11-02: 「看不出来在身上」).
   No 卸下: another 换上 swaps it. */
function pouchCellHtml(p, ctx) {
  if (p?.cap == null) return '';
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh;
  const name = p.carried?.[0]?.name ?? pw.pouchPlain;
  return `<div class="pworn ppouch"><span class="lbl">${esc(pw.pouchSlot)}</span><b>${esc(say(pw.pouchCap, { name, n: p.cap }))}</b></div>`;
}
/* A spare of the pouch he wears: 换上 gains nothing (rules/pouch.mjs `pouch-used`) — no 换上, said so. It is a thing in the
   bag (it takes a slot), so its tile is not marked as on him. */
const carriedKind = (i, g) => Boolean(i.effect?.pouch && g?.pouch?.carried?.some((c) => c.id === i.id));

const artOf = (i, ctx) => (i.art ? `<img src="${esc((ctx.artBase ?? '') + i.art)}" alt="" loading="lazy">` : '<i class="noart" aria-hidden="true"></i>');

/// One tile of the bag. `o.attr` is the tap it carries (the panel's data-pouch-item; the 饭桶's, the swap's);
/// `o.off` a short reason it cannot be had here (the rules' words) — dimmed, said on a chip, no tap.
export function tileHtml(i, ctx, o = {}) {
  // `off` '' : resting (a cooldown) — no tap, no chip.
  // `o.look`: a tap still opens its detail when it cannot be had here (the 饭桶's, to say why) — dimmed, not disabled.
  const on = i.worn, attr = o.attr ?? 'data-pouch-item', off = o.off ?? null, dead = off != null, tap = !dead || o.look;
  // A story thing's dashed tile says why on hover (the detail's own line, POUCH_WORDS.free).
  const free = i.free ? ` title="${esc((POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh).free)}"` : '';
  return `<button${o.drag ? ' draggable="true"' : ''} class="ptile${o.sel === i.id ? ' sel' : ''}${on ? ' worn' : ''}${i.free ? ' free' : ''}${i.glow ? ' glow' : ''}${dead ? ' off' : ''}"${free}${tap ? ` ${attr}="${esc(i.id)}"` : ' aria-disabled="true"'} aria-pressed="${o.sel === i.id}">
    ${artOf(i, ctx)}<span class="pname">${esc(i.name)}</span>${zhuanHtml(i.zhuan, ctx.lang)}${i.n > 1 ? `<b class="pn">×${esc(i.n)}</b>` : ''}${on && !off ? `<span class="pmark">${esc(ctx.words.worn)}</span>` : ''}${off ? `<span class="poff">${esc(off)}</span>` : ''}</button>`;
}

/// The bag: tabs by kind with their counts, and one scrolling grid of tiles — the 储物袋's, the 饭桶's and the
/// 「储物袋满了」 swap's alike. `o.tab` the tab shown (data-pouch-tab, the page's one `pouchTab`), `o.tile(i)` each tile.
export function bagGridHtml(items, ctx, o = {}) {
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh, tab = TABS.includes(o.tab) ? o.tab : 'all';
  const count = (t) => (t === 'all' ? items.length : items.filter((i) => tabOf(i) === t).length);
  const tabs = `<div class="ptabs" role="tablist">${TABS.map((t) => `<button role="tab" class="ptab${t === tab ? ' on' : ''}${count(t) ? '' : ' none'}" data-pouch-tab="${t}" aria-selected="${t === tab}">${esc(pw.tabs[t])}<span>${count(t)}</span></button>`).join('')}</div>`;
  const shown = items.filter((i) => tab === 'all' || tabOf(i) === tab);
  const grid = shown.length ? `<div class="pgrid">${shown.map((i) => (o.tile ? o.tile(i) : tileHtml(i, ctx))).join('')}</div>`
    : `<p class="small dim">${esc(items.length ? pw.tabEmpty : pw.empty)}</p>`;
  return { tabs, grid };
}

/// 储物袋满了 — what came while the pouch was full, at the door for his choice (Look's `full_offer`, rules/pouch.mjs;
/// Hanli 11-02: 「待取感觉应该删掉」): the new thing on the bag's own tile, 丢一样换它 (the bag's grid, a tap drops that
/// stack for it) or 不要了; 收下 once there is room. A queue is one card, the first open, the rest counted.
export function fullOfferHtml(offers, ctx, ui = {}) {
  if (!offers?.length) return '';
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh;
  const row = (o) => {
    const acts = o.room ? `<button class="act primary" data-offer-take="${esc(o.id)}">${esc(pw.fullTake)}</button>`
      : `<button class="act primary" data-offer-swap="${esc(o.id)}">${esc(pw.fullSwap)}</button>`;
    const pick = ui.swap === o.id && ctx.gear?.bag ? (() => {
      const { tabs, grid } = bagGridHtml(ctx.gear.bag, ctx, { tab: ui.tab, tile: (i) => tileHtml(i, ctx, { attr: 'data-offer-drop', off: i.free ? pw.free : i.worn ? ctx.words.worn : null, g: ctx.gear }) });
      return `<div class="fullpick"><p class="small">${esc(say(pw.fullPick, { name: o.name }))}</p>${tabs}${grid}<button class="act quiet" data-offer-swap="">${esc(pw.fullBack)}</button></div>`;
    })() : '';
    return `<div class="fullrow" data-full-offer="${esc(o.id)}"><div class="pgrid one">${tileHtml({ ...o, free: false, worn: false }, ctx, { attr: 'data-offer-look' })}</div>
    <div class="acts">${acts}<button class="act quiet" data-offer-letgo="${esc(o.id)}">${esc(pw.fullLet)}</button></div></div>${pick}`;
  };
  return `<div class="card fulloffer" role="status"><b class="lbl">${esc(pw.fullTitle)}</b>${offers.map(row).join('')}</div>`;
}

/// 丹纹 — a pill's 转 as lines across it: one per turn, the ninth turn's all
/// gold (story/jiuding-lu/DESIGN.md § 丹药等级: 「九道纹。金的。」). Nothing for a pill with no 转.
export function zhuanHtml(n, lang = 'zh') {
  if (!(n > 0)) return '';
  const label = lang === 'en' ? `${n}-turn · ${n} rings` : `${'一二三四五六七八九'[n - 1] ?? n}转 · ${'一二三四五六七八九'[n - 1] ?? n}道纹`;
  return `<span class="zhuan${n >= 9 ? ' gold' : ''}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${'<i></i>'.repeat(n)}</span>`;
}

/* A scroll (《吐纳经》): the layer the player stands on, its 功课, and its
   passage — the classic's words exactly, 银月's note under them. */
function readsHtml(r, w) {
  if (!r) return '';
  const quotes = r.passage.quotes.map((q) => `<blockquote class="scrollq"><p>${esc(q.text)}</p><cite>${esc(q.source)}</cite>${q.en ? `<p class="small dim">${esc(q.en)}</p>` : ''}</blockquote>`).join('');
  return `<div class="scroll"><div class="small"><b>${esc(say(w.scrollLayer ?? '{name}', { n: r.layer, name: r.name }))}</b>${r.note ? ` · ${esc(r.note)}` : ''}</div>
    <div class="small">${esc(say(w.scrollDaily ?? '{what}', { what: r.gongke }))}</div>
    <div class="small dim">${esc(r.passage.title)}</div>${quotes}<div class="small gloss">${esc(r.passage.gloss)}</div></div>`;
}

/// 所得's gear row (Hanli 11-03 at 09-snow: 「以为只拿到一张牌, 没看到剑」): its slot · name · what it does, then 戴上 · {slot}
/// (and 给银月 · {slot}) wherever the rules' gear read says one lands (`wear_on`) — the 储物袋's own `trade use`.
export function spoilGearHtml(i, ctx) {
  const w = ctx.words, slot = w.gearSlots?.[i.slot] ?? i.slot ?? '';
  const does = i.effect ? itemDoes(i.effect, ctx) : '';
  const acts = (i.wear_on ?? []).map((o) => {
    const at = w.gearSlots?.[o.slot] ?? o.slot;
    return o.on === 'her' ? `<button class="act" data-spoil-wear="${esc(i.id)}" data-on="her">${esc(say(w.gearGive, { name: ctx.her?.name ?? '', slot: at }))}</button>`
      : `<button class="act primary" data-spoil-wear="${esc(i.id)}">${esc(say(w.gearTo, { slot: at }))}</button>`;
  }).join('');
  const worn = !acts && (i.worn_on ?? []).length ? `<span class="chip">${esc(w.worn ?? '')}</span>` : '';
  return `<div class="spoilgear"><div><b>${esc(slot)} · ${esc(i.name ?? i.id)}</b>${does ? ` <span class="small dim">· ${esc(does)}</span>` : ''} ${worn}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}

/// What a thing is and does: its kind · effect, its about, who it wins over — the detail's lines, the 饭桶's info too.
export function itemFactsHtml(i, ctx) {
  const kind = ctx.look?.words?.[i.kind] ?? i.kind ?? '';
  return `<div class="small dim">${esc(kind)}${kind ? ' · ' : ''}${esc(itemDoes(i.effect, ctx))}</div>
    ${i.about ? `<div class="small about">${esc(i.about)}</div>` : ''}${tamesLine(i, ctx)}`;
}

/* The one tapped: what it is, what it does, who it wins over, and its taps.
   The rules decide each one; a button is drawn only where it can land. */
function detailHtml(i, g, ctx, pw, ui) {
  if (!i) return `<div class="pdetail empty small dim">${esc(pw.pick)}</div>`;
  const w = ctx.words, e = i.effect ?? {};
  const acts = [];
  if (e.progress != null) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(pw.take)}</button>`);
  else if (e.learn) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(pw.study)}</button>`);
  // 换上 · N 格: the room he would have with it (the realm's plus this one's) — a swap, never added to the one he wears.
  else if (e.pouch && !carriedKind(i, g)) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(say(pw.carry, { n: (g.pouch?.base ?? 0) + e.pouch }))}</button>`);
  // 戴上 · 佩 and 给银月 · 佩: each place a 戴上 lands now (the rules' `wear_on`); 卸下 for each slot that wears it (`worn_on`).
  for (const o of i.wear_on ?? []) {
    const slot = w.gearSlots[o.slot] ?? o.slot;
    acts.push(o.on === 'her' ? `<button class="act" data-wear="${esc(i.id)}" data-on="her">${esc(say(w.gearGive, { name: g.her?.name ?? '', slot }))}</button>`
      : `<button class="act" data-wear="${esc(i.id)}">${esc(say(w.gearTo, { slot }))}</button>`);
  }
  for (const o of (i.worn_on ?? []).filter((o) => o.slot !== 'abode')) {
    acts.push(o.on === 'her' ? `<button class="act quiet" data-remove="${esc(i.id)}" data-on="her" data-slot="${esc(o.slot)}">${esc(say(w.gearOffHer, { name: g.her?.name ?? '' }))}</button>`
      : `<button class="act quiet" data-remove="${esc(i.id)}">${esc(w.gearOff)}</button>`);
  }
  if (g.market && i.sell > 0 && !i.free) acts.push(`<button class="act quiet" data-sell="${esc(i.id)}">${esc(say(pw.sell, { n: i.sell }))}</button>`);
  if (!i.free && !i.worn) acts.push(`<button class="act quiet danger" data-toss="${esc(i.id)}">${esc(pw.toss)}</button>`);
  // 放进饭桶 (the 饭桶 docked on this page, fantong-kailu.js potOff): the button where it may go in now, else the reason.
  const ft = ui.ftOff ? ui.ftOff(i.id) : undefined;
  if (ft === null) acts.push(`<button class="act" data-ft-put="${esc(i.id)}">${esc(pw.ftPut)}</button>`);
  else if (ft) acts.push(`<span class="poff ftoff">${esc(pw.fantong)} · ${esc(ft)}</span>`);
  // 丢 asks here, on the pane — the page's own confirm, never window.confirm.
  const ask = ui.toss === i.id ? `<div class="ptoss" role="alertdialog"><span>${esc(say(pw.tossAsk, { name: i.name, n: i.n }))}</span>
    <button class="act danger" data-toss-yes="${esc(i.id)}">${esc(pw.tossYes)}</button><button class="act quiet" data-toss-no>${esc(pw.tossNo)}</button></div>` : '';
  // A 仙丹 has no 纹: it glows (`glow`, story DESIGN § 六·五).
  return `<div class="pdetail${i.glow ? ' glow' : ''}">${artOf(i, ctx)}<div class="pdbody"><b class="pdname">${esc(i.name)}</b>${i.n > 1 ? ` <span class="dim">×${esc(i.n)}</span>` : ''}
    ${i.zhuan ? `<div class="pzhuan">${zhuanHtml(i.zhuan, ctx.lang)}</div>` : ''}
    ${itemFactsHtml(i, ctx)}${readsHtml(i.reads, w)}
    ${i.free ? `<div class="small dim">${esc(pw.free)}</div>` : ''}${carriedKind(i, g) ? `<div class="small dim">${esc(pw.pouchDup)}</div>` : ''}
    ${acts.length ? `<div class="acts">${acts.join('')}</div>` : ''}${ask}</div></div>`;
}

/// The panel. `ui` is the page's own view of it: `tab`, `sel` (the item
/// tapped), `toss` (the item asking 丢?), `pane` ('deck' | 'kace' | 'seals' | 'panglu' | null), `kaceLeaf` (the 卡册's leaf shown), `ftOff(id)` (may it go into the docked
/// 饭桶: null yes, else why), `ftRun` (the pot chews or reveals).
/// Its head is one row of segments — 储物袋 (the grid, the 饭桶 docked in it) · 旁炉 · 牌组 — and one 合上 at
/// the right; a segment is the way between them, so no pane carries a 「回储物袋」 of its own
/// (Hanli 10-27: 「回储物袋这个按钮和其他几个关系不合理」). The 牌组 is its own panel, off its own chip.
export function pouchHtml(ctx, ui = {}) {
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh, g = ctx.gear;
  const close = closeX(ctx.lang, 'data-pouch-close', pw.close); // the one ✕ (card-close.js)
  if (!g) return `<div class="lu pouch"><header class="luhead"><b>${esc(pw.title)}</b>${close}</header><div class="loading">…</div></div>`;
  const p = g.pouch ?? { used: g.bag.length, cap: null };
  // 人间功课 is the 事 book's (cards.js choreRow; Hanli 11-02: 「人间功课也在物品UI里显示, 应该在任务里吧. 任务里已经有了」).
  // 卡册 (kace.js) is the 牌组's second view: the same segment lit, a switch inside it.
  const pane = (ui.pane === 'deck' || ui.pane === 'kace') && g.cards?.length ? ui.pane : ui.pane === 'panglu' && g.panglu ? 'panglu' : ui.pane === 'seals' && g.seals ? 'seals' : null;
  // 储物袋满了 stands in the panel too, over every pane: the 饭桶's outputs land while he is in here.
  const note = (ctx.gearNote ? `<div class="donote">${esc(ctx.gearNote)}</div>` : '') + fullOfferHtml(ctx.look?.full_offer, ctx, { swap: ui.offerSwap, tab: ui.tab });
  const used = p.cap != null ? `<span class="pused${p.used > p.cap ? ' over' : p.used >= p.cap ? ' full' : ''}">${esc(say(pw.used, p))}</span>` : '';
  const seg = (id, label, extra = '', lit = pane === id) => `<button role="tab" class="pseg${lit ? ' on' : ''}" data-pouch-pane="${id ?? ''}" aria-selected="${lit}">${esc(label)}${extra}</button>`;
  const segs = [seg(null, pw.title, used),
    // 旁炉 (panglu.js): at the 丹房's side furnace once it is his (rules/panglu.mjs) — Look's `panglu`, the last batch the page's.
    g.panglu ? seg('panglu', (PANGLU_WORDS[ctx.lang] ?? PANGLU_WORDS.zh).chip) : '',
    // 牌组 — the last tab (Hanli, 2026-10-27: 「牌组合进储物袋吧, 放到功课后面」), 新 n on cards not yet played.
    // 印谱 (seals-page.js; rules/seals.mjs): the seals the master has passed on, once he has one.
    g.seals ? seg('seals', pw.seals) : '',
    g.cards?.length ? seg('deck', pw.deck, ctx.look?.cards_new?.length ? ` <b class="pnew">${esc(say(pw.deckNew, { n: ctx.look.cards_new.length }))}</b>` : '', pane === 'deck' || pane === 'kace') : ''].join('');
  const head = `<header class="luhead phead"><div class="psegs" role="tablist">${segs}</div>${close}</header>`;
  const shell = (body) => `<div class="lu pouch" role="dialog" aria-label="${esc(pw.title)}">${head}${note}${body}</div>`;
  if (pane === 'panglu') return shell(pangluHtml(ctx.look?.panglu ?? null, ctx.pangluLast ?? null, ctx.lang, ctx.artBase ?? ''));
  if (pane === 'deck') return shell(`<section class="psec">${kaceSwitchHtml('deck', ctx.lang)}${deckHtml(g, ctx)}</section>`);
  if (pane === 'kace') return shell(`<section class="psec kace">${kaceHtml(ctx.kace ?? null, ctx, ui.kaceLeaf)}</section>`);
  if (pane === 'seals') return shell(sealsHtml(ctx.sealBook ?? null));
  const over = p.cap != null && p.used > p.cap ? `<p class="small pover">${esc(say(pw.over, { n: p.used - p.cap }))}</p>` : '';
  // 丹毒 (rules/dandu.mjs): the turns owed and what they take off the 体力 pool, in the rules' words — a fact on the page.
  const dandu = ctx.look?.dandu ? `<p class="small pdandu">${esc(ctx.look.dandu.say)}</p>` : '';
  const worn = `<section class="psec">${wornHtml(g, ctx)}</section>`;
  const sel = g.bag.find((i) => i.id === ui.sel) ?? null;
  const { tabs, grid } = bagGridHtml(g.bag, ctx, { tab: ui.tab, tile: (i) => tileHtml(i, ctx, { sel: ui.sel, g, drag: ui.ftOff?.(i.id) === null }) });
  const bag = `<section class="psec pbag">${over}${dandu}${tabs}<div class="pbody">${grid}${g.bag.length ? detailHtml(sel, g, ctx, pw, ui) : ''}</div></section>`;
  // 饭桶 (fantong-kailu.js kailuDockHtml): docked beside the grid, or under it on a phone held upright — never a tab of its
  // own (Hanli 11-03); while the pot runs (`ui.ftRun`) the grid and the worn row fold away.
  if (ctx.fantongDock) return shell(`<div class="pmain docked${ui.ftRun ? ' run' : ''}">${ui.ftRun ? '' : worn}<div class="pdockrow">${ui.ftRun ? '' : bag}${ctx.fantongDock}</div></div>`);
  return shell(`${worn}${bag}`);
}
