// rules/arms.mjs — 本命法宝 and 功法: the bound treasure, the sword, the 符 and the learned arts.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, lockedOf, pick, tierOf, seedOf } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf } from './errands.mjs';
import { hashOf } from './travel.mjs';
import { ofJuan, tierIndex } from './world.mjs';
import { hasFound, stow } from './pouch.mjs';

/* ── 本命法宝: the treasure a cultivator binds at 结丹 ── */

/* What a subdued creature leaves behind: the one thing it carries
   (creatures.json `drops`: one id, or a list — a man killed is searched,
   杀人必摸尸, design.md § Items), and on one win in `fight_one_in` a 符 (rewards.json
   `growth.charm` — 写符 was cut, redesign-v2 § 四). The 妖丹 it left went with
   强化. Both go into the 储物袋 — or, full, wait at the 洞府 (pouch.mjs). */
function drop(content, state, creature, now, { loot = false } = {}) {
  const got = [];
  const one = content.rewards.growth?.charm?.fight_one_in, charm = charmOf(content);
  const lucky = one && charm && hashOf(`${dayKey(now)}|${creature.id}|${seedOf(state)}|charm`) % one === 0;
  // An id named twice is two of it, one line in 所得 (邹青松's 火符).
  const counts = new Map();
  for (const id of [...dropsOf(creature), lucky ? charm.id : null].filter(Boolean)) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    // A thing of a 卷 not open is never dropped (world.mjs ofJuan).
    if (!itemOf(content, id) || !ofJuan(content, itemOf(content, id), now)) continue;
    got.push(stow(content, state, id, n));
  }
  // A beast of the wild (a pool's, a haunt's) leaves one thing more off its `loot`.
  const rolled = loot ? lootOf(content, state, creature, now) : null;
  if (rolled) got.push(rolled.dup ? convertDup(content, state, rolled) : stow(content, state, rolled.item, rolled.n ?? 1));
  return got;
}

/* 不拿重复的物品 (Hanli, 2026-10-15) — creatures.json `loot`: the table a beast of the wild leaves
   one thing from, `[{item, w, n?, dup?}]`. The roll weighs a thing he never had (pouch.mjs
   hasFound) `loot.fresh` times (creatures.json `loot_rules`); a one-off (the item's `once`) he has
   had comes as something useful instead — the row's `dup` ({item} or {wealth}), else the thing's
   own market price (`sell`) in 灵石, as if sold where it lay. Only things of an open 卷. A hash of
   the day, the save, the beast and how often it was beaten: the same on every device. */
const LOOT = { fresh: 3 };
function lootOf(content, state, creature, now) {
  const rows = (creature.loot ?? []).filter(r => itemOf(content, r.item) && ofJuan(content, itemOf(content, r.item), now) && (r.w ?? 1) > 0);
  if (!rows.length) return null;
  const rules = { ...LOOT, ...(content.creatures?.loot_rules ?? {}) };
  const w = r => (r.w ?? 1) * (hasFound(state, r.item) ? 1 : rules.fresh);
  const h = hashOf(`${dayKey(now)}|${seedOf(state)}|${creature.id}|loot|${state.beasts?.[creature.id]?.won ?? 0}`), x = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  let at = ((x ^ (x >>> 16)) >>> 0) % rows.reduce((t, r) => t + w(r), 0);
  const row = rows.find(r => (at -= w(r)) < 0);
  return itemOf(content, row.item).once && hasFound(state, row.item) ? { ...row, dup: true } : row;
}
/* A one-off had before, turned into what it is worth: the row's `dup`, else its price in 灵石. */
function convertDup(content, state, row) {
  const item = itemOf(content, row.item), lang = state.lang, name = pick(item.name, lang);
  if (row.dup?.item && itemOf(content, row.dup.item)) return { ...stow(content, state, row.dup.item, row.dup.n ?? 1), instead_of: { id: item.id, name } };
  // Before the 灵石 are the story's (state.mjs lockedOf), a one-off had before is simply not found again.
  const wealth = lockedOf(content, state).includes('wealth') ? 0 : Math.max(0, Math.round(row.dup?.wealth ?? item.sell ?? 0));
  state.wealth = (state.wealth ?? 0) + wealth;
  if (state.day) state.day.wealth = (state.day.wealth ?? 0) + wealth;
  return { id: 'wealth', name: pick({ zh: '灵石', en: 'spirit stones' }, lang), n: wealth, wealth, instead_of: { id: item.id, name } };
}

/* What a creature carries, as a list: `drops` is one id or several. */
export const dropsOf = creature => [creature?.drops ?? []].flat().filter(Boolean);

/* One 符 into the bag — a rumor's finale leaves it. Null when the world has none. */
function giveCharm(content, state) {
  const charm = charmOf(content), n = content.rewards.growth?.charm?.tale_end ?? 0;
  if (!charm || !n) return null;
  return stow(content, state, charm.id, n);
}

/* 一重 … 九重. The treasure grows with the story, never from a daily tap
   (redesign-v2 § 四: 温养 and 强化 were cut): one 重 each time a chapter ends
   and each time 今日传闻's finale is won (rewards.json `growth.treasure`). */
export const TREASURE_TOP = 9;
/* The realm a cultivator may bind one at, and the material that names its element. */
const REFINE_TIER = 'core';
const coreOf = (content, id) => content.items.items.find(i => i.id === id && i.effect?.core);
const canRefine = (content, state) => tierRank(content, REFINE_TIER) <= tierIndex(content, state);
/* The treasure that counts: 法宝 and 本命法宝 begin at 结丹 (story DESIGN, 2026-10-03 —
   练气 and 筑基 carry 法器). Below it a treasure a save holds (an old one, or a
   world that grants it early) is kept and never lost, but nothing reads it —
   it does not grow, fight, lend or show — until the realm reaches 结丹. */
export const boundOf = (content, state) => (state.treasure && canRefine(content, state) ? state.treasure : null);

/* The treasure as the card and Look tell it. */
function treasureBrief(content, state) {
  const t = boundOf(content, state);
  if (!t) return null;
  const lang = state.lang, steps = content.ladder.treasure_steps ?? null;
  return {
    name: t.name, level: t.level, step: steps ? pick(steps, lang)?.[t.level - 1] ?? String(t.level) : String(t.level),
    element: t.element, element_name: pick(content.traits.elements[t.element], lang),
    atk: t.base + t.level, top: t.level >= TREASURE_TOP,
  };
}

/* The story's growth, by what happened (`chapter` or `tale_end`): the 重 it
   rose to, or null when there is no treasure, nothing to give, or it is at 九重. */
function growTreasure(content, state, why) {
  const n = content.rewards.growth?.treasure?.[why] ?? 0;
  if (!boundOf(content, state) || !n || state.treasure.level >= TREASURE_TOP) return null;
  const level = Math.min(TREASURE_TOP, state.treasure.level + n);
  state.treasure = { ...state.treasure, level };
  return { name: state.treasure.name, level, why };
}

/* What a binding would take, held now: the weapon in hand and the 天材地宝 in
   the bag — so the treasure card can offer them, and the player picks one and
   names it on the card (his, 2026-09-24: no model turn for a tap). */
function refineWith(content, state) {
  const weapon = wornOf(content, state, 'weapon'), lang = state.lang;
  const materials = content.items.items.filter(i => i.effect?.core && state.bag[i.id] > 0)
    .map(i => ({ id: i.id, name: pick(i.name, lang), element: i.effect.core, n: state.bag[i.id] }));
  return { weapon: weapon ? pick(weapon.name, lang) : null, materials };
}

/* 炼化本命 — once, at 结丹: the worn weapon and one core material become the
   player's own treasure, and the player names it as they named themselves.
   The weapon and the material are spent; a treasure is never lost. */
export function refine(state, content, ctx, args) {
  const lang = state.lang;
  if (state.treasure) return refuse('already-bound', pick({ zh: `你已有本命法宝${state.treasure.name}。`, en: `${state.treasure.name} is already yours.` }, lang), { treasure: treasureBrief(content, state) });
  if (!canRefine(content, state)) {
    const tier = pick(tierOf(content, REFINE_TIER)?.name, lang);
    return refuse('needs-tier', pick({ zh: `炼化本命须结丹之后。`, en: `A treasure is bound at ${tier}, not before.` }, lang), { tier: REFINE_TIER });
  }
  const weapon = wornOf(content, state, 'weapon');
  if (!weapon) return refuse('no-weapon', pick({ zh: '手中无器可炼。', en: 'There is nothing in your hand to refine.' }, lang));
  const material = coreOf(content, String(args.material ?? '').trim());
  if (!material) return refuse('needs-material', pick({ zh: '还须一味天材地宝。', en: 'It wants a material of the five.' }, lang), { materials: content.items.items.filter(i => i.effect?.core).map(i => ({ id: i.id, name: pick(i.name, lang), element: i.effect.core, held: state.bag[i.id] ?? 0 })) });
  if (!(state.bag[material.id] > 0)) return refuse('not-in-bag', null, { needs: { id: material.id, name: pick(material.name, lang) } });
  const name = String(args.name ?? '').trim();
  if (!name || name.length > 12) return refuse('needs-name', pick({ zh: '它还没有名字。', en: 'It has no name yet.' }, lang));
  const s = clone(state);
  s.bag[material.id] -= 1;
  if (!s.bag[material.id]) delete s.bag[material.id];
  s.bag[weapon.id] -= 1;
  if (!s.bag[weapon.id]) delete s.bag[weapon.id];
  if (s.wear?.weapon === weapon.id) delete s.wear.weapon;
  s.treasure = { name, base: weapon.effect?.atk ?? 0, element: material.effect.core, level: 1 };
  return { state: s, result: { ok: true, refined: { from: pick(weapon.name, lang), with: pick(material.name, lang) }, treasure: treasureBrief(content, s), show: [{ card: 'treasure' }] } };
}

/* ── 功法: the sword, the 符 and the learned arts ── */

const artOf = (content, id) => (content.arts?.arts ?? []).find(a => a.id === id);
const tierRank = (content, id) => content.ladder.tiers.findIndex(t => t.id === id);
const artReady = (content, state, art) => tierRank(content, art.tier) <= tierIndex(content, state);
const charmOf = content => content.items.items.find(i => i.effect?.charm) ?? null;

function artBrief(content, state, art) {
  const lang = state.lang, ready = artReady(content, state, art);
  return {
    id: art.id, name: pick(art.name, lang), about: pick(art.about, lang), source: pick(art.source, lang), effect: art.effect,
    tier: { id: art.tier, name: pick(tierOf(content, art.tier)?.name, lang) }, ready, why: ready ? null : 'art-needs-tier',
  };
}
const artsBrief = (content, state) => (state.arts ?? []).map(id => artOf(content, id)).filter(Boolean).map(a => artBrief(content, state, a));

/* An art learned, never bought: null when unknown or already known. */
function learn(content, state, id) {
  const art = artOf(content, id);
  if (!art || state.arts?.includes(id)) return null;
  state.arts = [...(state.arts ?? []), id];
  return artBrief(content, state, art);
}

/* What the player wears in a slot, while it is still in the bag. */
const wornOf = (content, state, slot) => (state.wear?.[slot] && state.bag[state.wear[slot]] ? itemOf(content, state.wear[slot]) : null);

/* The same day, creature and 名字 draw the same creature — an undo cannot
   fish for an easier one. */
const duelSeed = (state, creature, now) => `${dayKey(now)}|${creature.id}|${seedOf(state)}`;

export { lootOf, convertDup, artBrief, artOf, artsBrief, canRefine, charmOf, drop, duelSeed, giveCharm, growTreasure, learn, refineWith, tierRank, treasureBrief, wornOf };
