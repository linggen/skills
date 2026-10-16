// danang.js — 丹囊 on the page (battle.js § pills, Hanli 2026-10-16): at the door, which pills he
// carries in (up to three from the bag, his last pick lit); in the fight, the pills by the hand —
// a tap takes one (a 回春丹 then asks whom: himself, or a member beside him). Pure strings.
import { esc } from './esc.js';

const W = {
  zh: { pouch: '丹囊', clear: '清空', none: '不带丹药', heal: '气血 +{n}', mana: '灵力 +{n}', used: '这回合已服过', whom: '给谁服？点自己或同伴' },
  en: { pouch: 'Pill pouch', clear: 'Clear', none: 'No pills', heal: 'Life +{n}', mana: 'Force +{n}', used: 'One pill a turn', whom: 'For whom? Tap yourself or a companion' },
};
const words = lang => W[lang] ?? W.zh;
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const does = (p, w) => (p.heal ? fill(w.heal, { n: p.heal }) : p.mana ? fill(w.mana, { n: p.mana }) : '');

/// The pick as it stands at this door: the page's own while he changes it, else the rules' (his last).
export const pickNow = (brief, ctx) => ctx.pillPick?.[brief.id] ?? brief.pouch?.pick ?? [];

/// The door's row: each pill in the bag, how many are packed of how many held; a tap packs one more.
export function pouchPickHtml(brief, ctx) {
  const p = brief.pouch;
  if (!p?.pills?.length) return '';
  const w = words(ctx.lang), pick = pickNow(brief, ctx);
  const chips = p.pills.map((x) => {
    const k = pick.filter((id) => id === x.id).length, full = pick.length >= p.max || k >= x.n;
    return `<button class="dn-chip${k ? ' on' : ''}" data-pill-add="${esc(brief.id)}|${esc(x.id)}"${full ? ' aria-disabled="true"' : ''} title="${esc(does(x, w))}">
      ${x.art ? `<img src="${esc(ctx.artBase ?? '')}${esc(x.art)}" alt="">` : ''}<b>${esc(x.name)}</b><small>${k}/${x.n}</small></button>`;
  }).join('');
  return `<div class="dn-pick"><span class="dn-title">${esc(w.pouch)} <b>${pick.length}/${p.max}</b></span>${chips}${pick.length ? `<button class="dn-clear" data-pill-clear="${esc(brief.id)}">${esc(w.clear)}</button>` : `<small class="dn-none">${esc(w.none)}</small>`}</div>`;
}

/// The pills by the hand in a fight; the held one lit, all dim once one was taken this turn.
export function pillTrayHtml(st, ctx, picked) {
  const pouch = st.you.pouch ?? [];
  if (!pouch.length) return '';
  const w = words(ctx.lang), used = st.you.pillUsed || st.whose !== 'you' || st.outcome !== 'open';
  const pills = pouch.map((p, index) => {
    const name = ctx.pillNames?.[p.id] ?? p.id, held = picked?.from === 'pill' && picked.index === index;
    return `<button class="dn-pill${held ? ' held' : ''}${used ? ' dim' : ''}" data-spot="pill" data-index="${index}" title="${esc(used ? w.used : does(p, w))}">
      ${ctx.pillArt?.[p.id] ? `<img src="${esc(ctx.artBase ?? '')}${esc(ctx.pillArt[p.id])}" alt="">` : '<i aria-hidden="true">丹</i>'}<small>${esc(name)}</small></button>`;
  }).join('');
  return `<div class="dn-tray" aria-label="${esc(w.pouch)}"><span class="dn-seal">丹</span>${pills}${picked?.from === 'pill' ? `<small class="dn-whom">${esc(w.whom)}</small>` : ''}</div>`;
}

/// The pick after a tap at the door: one more of `id` (as the bag and the pouch allow), or cleared.
export function pickAfter(brief, ctx, id) {
  const p = brief.pouch, pick = [...pickNow(brief, ctx)];
  if (!id) return [];
  const held = p?.pills?.find((x) => x.id === id)?.n ?? 0;
  if (pick.length < (p?.max ?? 3) && pick.filter((x) => x === id).length < held) pick.push(id);
  return pick;
}
