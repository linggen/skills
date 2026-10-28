// shopmark.js — 铺子 on the map (Hanli, 2026-10-27: 「现在看地图也不知到商店在哪里」): a place
// whose shelf is open wears a small vermilion seal of its kind (药 · 符 · 市 …) on the map, the
// plate and the 去往 list, and the header says 「有铺子」 where he stands at one. Look's `shops`
// (rules/shops.mjs shopsNear) decides every one; the page only draws. Every word esc()'d.
import { esc } from './esc.js';

export const SHOP_WORDS = { zh: { here: '有铺子' }, en: { here: 'Shop here' } };

/// Look's shops by place id.
export const shopsById = (look) => new Map((look?.shops ?? []).map((s) => [s.id, s]));

/// The shop where he stands (0 roads away), or null.
export const shopHere = (look) => (look?.shops ?? []).find((s) => s.steps === 0) ?? null;

/// A shop's title: its kind, its own name.
export const shopTitle = (s) => [s.label, s.shop].filter(Boolean).join(' · ');

/// The small seal: the kind's one character, its word and name on hover.
export const shopMarkHtml = (s) => (s ? `<b class="shopmark k-${esc(s.kind)}" title="${esc(shopTitle(s))}">${esc(s.mark)}</b>` : '');

/// The 去往 chip's tag: the kind's word, small after the road's name.
export const shopTagHtml = (s) => (s ? `<small class="shoptag k-${esc(s.kind)}" title="${esc(shopTitle(s))}">${esc(s.label)}</small>` : '');

/// The header's 「有铺子 · 药铺」 where he stands at an open shop, else ''.
export function shopHereHtml(look, lang = 'zh') {
  const s = shopHere(look);
  if (!s) return '';
  const w = SHOP_WORDS[lang] ?? SHOP_WORDS.zh;
  // A tap brings back a shelf he put away (lingjing.js `shopShut`).
  return `<button type="button" class="shophere k-${esc(s.kind)}" data-shop-open title="${esc(shopTitle(s))}">${esc(w.here)} · ${esc(s.label)}</button>`;
}
