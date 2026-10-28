// rules/shops.mjs — 铺子在哪 (Hanli, 2026-10-27: 「现在看地图也不知到商店在哪里」): every shop
// he can walk to now, what kind it is, and how many roads away.
// Part of the rules engine; rules.mjs is its one door.
//
// A place's shop is its `has.shop` (look.mjs shopOf, its own goods, shut until `opens.done`), the
// province's catalog (`shop: true`), or a visiting shop on its day (rules/visiting.mjs). Only a
// shelf with something on it now counts. Its kind comes from its goods — never a place's name —
// or a shop's own `kind` (one of SHOP_KINDS) where the data says it: one class of goods holding
// more than half the shelf names it (药铺 · 符箓 · 兵器 …); a shelf of many things is a 坊市,
// of two a 杂货.
// Look carries the list as `shops` (the map's marks, the 去往 list, 「有铺子」, the phone).
import { pick } from '../state.mjs';
import { companionOf } from './companion.mjs';
import { shelfOf } from './look.mjs';
import { visitorHere } from './visiting.mjs';
import { allPlaces, hiddenRoom, pathOf, placeName, placeOf } from './world.mjs';

/* A shop's kind: its word (≤ 2 characters in zh) and the one character on the map's mark. */
export const SHOP_KINDS = {
  yao: { zh: '药铺', en: 'Apothecary', mark: { zh: '药', en: 'Rx' } },
  fu: { zh: '符箓', en: 'Talismans', mark: { zh: '符', en: 'Ta' } },
  qi: { zh: '兵器', en: 'Arms', mark: { zh: '器', en: 'Ar' } },
  yi: { zh: '衣铺', en: 'Clothier', mark: { zh: '衣', en: 'Cl' } },
  yu: { zh: '玉器', en: 'Jade', mark: { zh: '玉', en: 'Ja' } },
  shu: { zh: '书铺', en: 'Books', mark: { zh: '书', en: 'Bk' } },
  liang: { zh: '粮铺', en: 'Provisions', mark: { zh: '粮', en: 'Pr' } },
  za: { zh: '杂货', en: 'Sundries', mark: { zh: '杂', en: 'Su' } },
  shi: { zh: '坊市', en: 'Market', mark: { zh: '市', en: 'Mk' } },
  // A sect's own store, sold from the common account (外门库房): never a 坊市, whatever its shelf holds.
  ku: { zh: '库房', en: 'Stores', mark: { zh: '库', en: 'St' } },
};

/* The class of one good, by the catalog's `kind`: a herb (herbs.json) is the apothecary's too. */
const CLASS_OF = { pill: 'yao', charm: 'fu', weapon: 'qi', treasure: 'qi', artifact: 'qi', pouch: 'qi', robe: 'yi', pendant: 'yu', scroll: 'shu', material: 'liang' };
function classOf(content, item) {
  if (item.kind === 'material' && (content.herbs?.herbs ?? []).some(h => h.id === item.id)) return 'yao';
  return CLASS_OF[item.kind] ?? null;
}

/* The kind of a shelf: one class holding more than half of it; else 坊市 for three classes or
   more (a market's spread), 杂货 for two (an inn's rations and pills). */
export function shopKind(content, items, declared = null) {
  if (declared && SHOP_KINDS[declared]) return declared;
  const tally = {};
  for (const i of items) { const c = classOf(content, i); if (c) tally[c] = (tally[c] ?? 0) + 1; }
  const [top, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (top && n * 2 > items.length) return top;
  return Object.keys(tally).length >= 3 ? 'shi' : 'za';
}

/* The shop standing at a place now: its own, the catalog's, or a visitor on its day — else null. */
const shopAt = (content, state, place, now) => (place?.has?.shop ? place.has.shop : visitorHere(content, state, place, now));

/* Each open shop he can walk to now, nearest first:
   [{ id, name, province, shop, kind, label, mark, steps, goods: [item ids], visitor? }] —
   `id`/`name` the place's, `shop` the shop's own name (or null), `kind` a SHOP_KINDS key and
   `label`/`mark` its word and character in his language, `steps` the roads walked (0 = here,
   the same way Move walks, world.mjs pathOf), `goods` what its shelf holds now. A shop shut
   (look.mjs shopOpen), empty, beyond the 卷, or with no way to it is not listed. */
export function shopsNear(content, state, now = new Date()) {
  const here = placeOf(content, state?.place);
  if (!here) return [];
  const lang = state.lang, bell = companionOf(content)?.bell ?? null;
  const out = [];
  for (const p of allPlaces(content)) {
    const shop = shopAt(content, state, p, now);
    if (!shop || hiddenRoom(content, state, p)) continue;
    const steps = p.id === here.id ? 0 : pathOf(content, state, here, p, now)?.length ?? null;
    if (steps == null) continue;
    // Her bell sits on every shelf while she is still to be found (look.mjs shelfOf): not the shop's own.
    const items = shelfOf(content, p, state, now).filter(i => i.id !== bell);
    if (!items.length) continue;
    const kind = shopKind(content, items, typeof shop === 'object' ? shop.kind : null), k = SHOP_KINDS[kind];
    out.push({
      ...placeName(content, state, p), province: p.province,
      shop: typeof shop === 'object' ? pick(shop.name, lang) ?? null : null,
      kind, label: pick(k, lang), mark: pick(k.mark, lang), steps,
      goods: items.map(i => i.id),
      ...(p.has?.shop ? {} : { visitor: true }),
    });
  }
  return out.sort((a, b) => a.steps - b.steps);
}
