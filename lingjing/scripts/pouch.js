// pouch.js — 储物袋, the panel the top bar's chip opens over the stage (Hanli,
// 2026-09-25). Pure drawing: the rules' `gear` read in, HTML out, every word
// esc()'d. What he wears is one compact row; below it the pouch — used / cap,
// tabs by kind, a grid of tiles, and the detail of the one tapped with the
// taps it takes (服用 · 佩戴 · 卖 · 丢). The tabs and the grid are one component
// (bagGridHtml): the 饭桶's 开炉 and the 「储物袋满了」 card draw the same bag.
// Every tap is the page's own verb (trade, bag, deck); nothing asks Ling.
import { esc } from './esc.js';
import { deckHtml, gearFightHtml, herCardHtml, itemDoes, liftSaid, tamesLine } from './cards.js';
import { PANGLU_WORDS, pangluHtml } from './panglu.js';

export const POUCH_WORDS = {
  zh: {
    title: '储物袋', close: '合上', used: '{used}/{cap} 格', over: '超出 {n} 格：新得的东西要你定夺。',
    fullTitle: '储物袋满了', fullSwap: '丢一样换它', fullTake: '收下', fullLet: '不要了', fullPick: '点一样丢掉，换{name}', fullBack: '先不换',
    tabs: { all: '全部', pill: '丹药', arms: '法器', material: '材料', charm: '符', story: '剧情' },
    deck: '牌组', deckNew: '新 {n}', empty: '储物袋是空的。', tabEmpty: '这里还没有东西。', pick: '点一样东西看看。',
    take: '服用', wear: '佩戴', study: '参悟', carry: '换上 · 多 {n} 格', use: '使用', sell: '卖 {n}', toss: '丢',
    tossAsk: '丢掉{name} ×{n}？丢了就找不回了。', tossYes: '丢掉', tossNo: '留着',
    free: '剧情所需，不占格', fantong: '饭桶',
    pouchSlot: '储物袋', pouchPlain: '随身储物袋', pouchCap: '{name} · {n} 格', pouchDup: '这样的储物袋已在身上，再用无益。',
  },
  en: {
    title: 'Storage Pouch', close: 'Close', used: '{used}/{cap} slots', over: '{n} over: new things wait on your choice.',
    fullTitle: 'The pouch is full', fullSwap: 'Drop one for it', fullTake: 'Take it', fullLet: 'Let it go', fullPick: 'Tap a thing to drop for {name}', fullBack: 'Not now',
    tabs: { all: 'All', pill: 'Pills', arms: 'Arms', material: 'Materials', charm: 'Talismans', story: 'Story' },
    deck: 'Deck', deckNew: '{n} new', empty: 'The pouch is empty.', tabEmpty: 'Nothing here yet.', pick: 'Tap a thing to look at it.',
    take: 'Take', wear: 'Wear', study: 'Study', carry: 'Carry it · +{n} slots', use: 'Use', sell: 'Sell {n}', toss: 'Drop',
    tossAsk: 'Throw away {name} ×{n}? It is gone for good.', tossYes: 'Throw away', tossNo: 'Keep it',
    free: 'the story needs it — takes no slot', fantong: 'Rice Bucket',
    pouchSlot: 'Pouch', pouchPlain: 'Plain pouch', pouchCap: '{name} · {n} slots', pouchDup: 'You carry one like it already; another adds nothing.',
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
  return `<div class="pwornrow">${slots}${pouchCellHtml(g.pouch, ctx)}${treasure}${her}</div>${gearFightHtml(g.fight, ctx)}${g.her ? herCardHtml(g.her, ctx) : ''}`;
}

/* 储物袋 — the pouch he carries, a cell of the worn row: the bigger ones put to use (rules/pouch.mjs `carried`,
   biggest first), or the realm's plain one, and the room it gives (Hanli 11-02: 「看不出来在身上」). Used for good: no 卸下. */
function pouchCellHtml(p, ctx) {
  if (p?.cap == null) return '';
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh;
  const name = p.carried?.length ? p.carried.map((c) => c.name).join(ctx.lang === 'en' ? ' + ' : '、') : pw.pouchPlain;
  return `<div class="pworn ppouch"><span class="lbl">${esc(pw.pouchSlot)}</span><b>${esc(say(pw.pouchCap, { name, n: p.cap }))}</b></div>`;
}
/* A bigger pouch of a kind he already carries: another adds nothing (travel.mjs `pouch-used`), so it shows as on him. */
const carriedKind = (i, g) => Boolean(i.effect?.pouch && g?.pouch?.carried?.some((c) => c.id === i.id));

const artOf = (i, ctx) => (i.art ? `<img src="${esc((ctx.artBase ?? '') + i.art)}" alt="" loading="lazy">` : '<i class="noart" aria-hidden="true"></i>');

/// One tile of the bag. `o.attr` is the tap it carries (the panel's data-pouch-item; the 饭桶's, the swap's);
/// `o.off` a short reason it cannot be had here (the rules' words) — dimmed, said on a chip, no tap.
export function tileHtml(i, ctx, o = {}) {
  // `off` '' : resting (a cooldown) — no tap, no chip.
  // `o.look`: a tap still opens its detail when it cannot be had here (the 饭桶's, to say why) — dimmed, not disabled.
  const on = i.worn || carriedKind(i, o.g), attr = o.attr ?? 'data-pouch-item', off = o.off ?? null, dead = off != null, tap = !dead || o.look;
  return `<button class="ptile${o.sel === i.id ? ' sel' : ''}${on ? ' worn' : ''}${i.free ? ' free' : ''}${i.glow ? ' glow' : ''}${dead ? ' off' : ''}"${tap ? ` ${attr}="${esc(i.id)}"` : ' aria-disabled="true"'} aria-pressed="${o.sel === i.id}">
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
  else if (e.pouch && !carriedKind(i, g)) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(say(pw.carry, { n: e.pouch }))}</button>`);
  else if (e.stamina) acts.push(`<button class="act" data-use="${esc(i.id)}">${esc(pw.use)}</button>`);
  if (i.slot && !i.worn) acts.push(`<button class="act" data-wear="${esc(i.id)}">${esc(say(w.gearTo, { slot: w.gearSlots[i.slot] ?? g.her?.name ?? i.slot }))}</button>`);
  if (i.worn && (g.slots ?? []).some((s) => s.item?.id === i.id)) acts.push(`<button class="act quiet" data-remove="${esc(i.id)}">${esc(w.gearOff)}</button>`);
  if (g.market && i.sell > 0 && !i.free) acts.push(`<button class="act quiet" data-sell="${esc(i.id)}">${esc(say(pw.sell, { n: i.sell }))}</button>`);
  if (!i.free && !i.worn) acts.push(`<button class="act quiet danger" data-toss="${esc(i.id)}">${esc(pw.toss)}</button>`);
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
/// tapped), `toss` (the item asking 丢?), `pane` ('deck' | 'fantong' | 'panglu' | null).
/// Its head is one row of segments — 储物袋 (the grid) · 饭桶 · 旁炉 · 牌组 — and one 合上 at
/// the right; a segment is the way between them, so no pane carries a 「回储物袋」 of its own
/// (Hanli 10-27: 「回储物袋这个按钮和其他几个关系不合理」). The 牌组 is its own panel, off its own chip.
export function pouchHtml(ctx, ui = {}) {
  const pw = POUCH_WORDS[ctx.lang] ?? POUCH_WORDS.zh, g = ctx.gear;
  const close = `<button class="act quiet" data-pouch-close>${esc(pw.close)}</button>`;
  if (!g) return `<div class="lu pouch"><header class="luhead"><b>${esc(pw.title)}</b>${close}</header><div class="loading">…</div></div>`;
  const p = g.pouch ?? { used: g.bag.length, cap: null };
  // 饭桶 (fantong-kailu.js): the 开炉 game in the grid's place, its pane drawn by the page and handed in as `ctx.fantongPane`.
  // 人间功课 is the 事 book's (cards.js choreRow; Hanli 11-02: 「人间功课也在物品UI里显示, 应该在任务里吧. 任务里已经有了」).
  const pane = ui.pane === 'deck' && g.cards?.length ? 'deck' : ui.pane === 'fantong' && g.fantong ? 'fantong'
    : ui.pane === 'panglu' && g.panglu ? 'panglu' : null;
  // 储物袋满了 stands in the panel too, over every pane: the 饭桶's outputs land while he is in here.
  const note = (ctx.gearNote ? `<div class="donote">${esc(ctx.gearNote)}</div>` : '') + fullOfferHtml(ctx.look?.full_offer, ctx, { swap: ui.offerSwap, tab: ui.tab });
  const used = p.cap != null ? `<span class="pused${p.used > p.cap ? ' over' : p.used >= p.cap ? ' full' : ''}">${esc(say(pw.used, p))}</span>` : '';
  const seg = (id, label, extra = '') => `<button role="tab" class="pseg${pane === id ? ' on' : ''}" data-pouch-pane="${id ?? ''}" aria-selected="${pane === id}">${esc(label)}${extra}</button>`;
  const segs = [seg(null, pw.title, used), g.fantong ? seg('fantong', pw.fantong) : '',
    // 旁炉 (panglu.js): at the 丹房's side furnace once it is his (rules/panglu.mjs) — Look's `panglu`, the last batch the page's.
    g.panglu ? seg('panglu', (PANGLU_WORDS[ctx.lang] ?? PANGLU_WORDS.zh).chip) : '',
    // 牌组 — the last tab (Hanli, 2026-10-27: 「牌组合进储物袋吧, 放到功课后面」), 新 n on cards not yet played.
    g.cards?.length ? seg('deck', pw.deck, ctx.look?.cards_new?.length ? ` <b class="pnew">${esc(say(pw.deckNew, { n: ctx.look.cards_new.length }))}</b>` : '') : ''].join('');
  const head = `<header class="luhead phead"><div class="psegs" role="tablist">${segs}</div>${close}</header>`;
  const shell = (body) => `<div class="lu pouch" role="dialog" aria-label="${esc(pw.title)}">${head}${note}${body}</div>`;
  if (pane === 'fantong') return shell(ctx.fantongPane ?? '');
  if (pane === 'panglu') return shell(pangluHtml(ctx.look?.panglu ?? null, ctx.pangluLast ?? null, ctx.lang, ctx.artBase ?? ''));
  if (pane === 'deck') return shell(`<section class="psec">${deckHtml(g, ctx)}</section>`);
  const over = p.cap != null && p.used > p.cap ? `<p class="small pover">${esc(say(pw.over, { n: p.used - p.cap }))}</p>` : '';
  // 丹毒 (rules/dandu.mjs): the turns owed and what they take off the 体力 pool, in the rules' words — a fact on the page.
  const dandu = ctx.look?.dandu ? `<p class="small pdandu">${esc(ctx.look.dandu.say)}</p>` : '';
  const worn = `<section class="psec">${wornHtml(g, ctx)}</section>`;
  const sel = g.bag.find((i) => i.id === ui.sel) ?? null;
  const { tabs, grid } = bagGridHtml(g.bag, ctx, { tab: ui.tab, tile: (i) => tileHtml(i, ctx, { sel: ui.sel, g }) });
  return shell(`${worn}<section class="psec">${over}${dandu}${tabs}<div class="pbody">${grid}${g.bag.length ? detailHtml(sel, g, ctx, pw, ui) : ''}</div></section>`);
}
