// rules/pin.mjs — 品: a card's grade, read off where it is found (design.md § 斗法 v4 · 品 · 框 · the 卡册).
// Never typed on the card: cards.json holds no grade, so a card keeps its 品 through every cost audit. Pure and
// import-free — the rules, the page (its frames) and the card game's room (games/kapai.js) read the same function.
// `content` needs `cards` (cards.json) and `mijing` (mijing.json: where a beast stands as a 重's 大妖).

/* The grades, commonest first. 凡 wears no frame. */
export const PINS = ['fan', 'yin', 'jin', 'baoshi', 'zuanshi'];

/* A `foe-*` creature is a person: a person's art stays theirs (never collected). */
const isPerson = id => String(id ?? '').startsWith('foe-');

/* The 大妖 of every 重 (mijing.json tiers[].boss) — a beast's own card from one of them is 宝石. */
const bossMemo = new WeakMap();
function bossesOf(content) {
  const key = content?.mijing ?? content;
  if (key && typeof key === 'object' && bossMemo.has(key)) return bossMemo.get(key);
  const set = new Set((content?.mijing?.tiers ?? []).map(t => t.boss?.creature).filter(Boolean));
  if (key && typeof key === 'object') bossMemo.set(key, set);
  return set;
}

/* One `from` row → its grade, or null (a source that is not a way to have the card). */
const BY_KIND = {
  story: () => 'fan', beat: () => 'fan', tale: () => 'fan', shop: () => 'fan',
  beast: () => 'yin',
  foe: (f, content) => (isPerson(f.creature) ? null : bossesOf(content).has(f.creature) ? 'baoshi' : 'jin'),
  tame: () => 'zuanshi', summon: () => 'zuanshi',
};
export const rowPin = (content, f) => BY_KIND[f?.kind]?.(f, content) ?? null;

/* The row a card is graded by: the commonest way it can be had (the lowest grade); null when none is a way. */
export function pinRow(content, card) {
  if (!card || card.owner || card.lent) return null; // a companion's card is theirs; a person's art (owner foe-*) theirs too
  const rows = (card.from ?? []).map(f => ({ f, pin: rowPin(content, f) })).filter(r => r.pin);
  if (!rows.length) return null; // tokens and blows: no `from` at all
  return rows.reduce((a, b) => (PINS.indexOf(b.pin) < PINS.indexOf(a.pin) ? b : a));
}

/// A card's 品: 'fan' · 'yin' · 'jin' · 'baoshi' · 'zuanshi', or null for a card not collected.
export const pinOf = (content, card) => pinRow(content, card)?.pin ?? null;

/// Every collected card's 品, by id — what a frame reads (ctx.pins on the page).
export function pinsOf(content) {
  const out = {};
  for (const c of content?.cards?.cards ?? []) { const p = pinOf(content, c); if (p) out[c.id] = p; }
  return out;
}

/// A frame's class on a card's markup: '' for 凡 and for a card not collected, so a plain card is drawn as it always was.
export const pinClass = (pin, prefix = ' pin-') => (pin && pin !== 'fan' ? `${prefix}${pin}` : '');
