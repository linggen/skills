// rules/arms.mjs — 本命法宝 and 功法: the bound treasure, the sword, the 符 and the learned arts.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, tierOf } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf } from './errands.mjs';
import { hashOf } from './travel.mjs';
import { tierIndex } from './world.mjs';

/* ── 本命法宝: the treasure a cultivator binds at 结丹 ── */

/* What a subdued creature leaves behind: the one thing it carries
   (creatures.json `drops`), and on one win in `fight_one_in` a 符 (rewards.json
   `growth.charm` — 写符 was cut, redesign-v2 § 四). The 妖丹 it left went with
   强化. Both go into the bag; the catalog owns their words and their worth. */
function drop(content, state, creature, now) {
  const lang = state.lang, got = [];
  const one = content.rewards.growth?.charm?.fight_one_in, charm = charmOf(content);
  const lucky = one && charm && hashOf(`${dayKey(now)}|${creature.id}|${state.name ?? ''}|charm`) % one === 0;
  for (const id of [creature.drops, lucky ? charm.id : null].filter(Boolean)) {
    const item = itemOf(content, id);
    if (!item) continue;
    state.bag[id] = (state.bag[id] ?? 0) + 1;
    got.push({ id, name: pick(item.name, lang), n: state.bag[id] });
  }
  return got;
}

/* One 符 into the bag — a rumor's finale leaves it. Null when the world has none. */
function giveCharm(content, state) {
  const charm = charmOf(content), n = content.rewards.growth?.charm?.tale_end ?? 0;
  if (!charm || !n) return null;
  state.bag[charm.id] = (state.bag[charm.id] ?? 0) + n;
  return { id: charm.id, name: pick(charm.name, state.lang), n: state.bag[charm.id] };
}

/* 一重 … 九重. The treasure grows with the story, never from a daily tap
   (redesign-v2 § 四: 温养 and 强化 were cut): one 重 each time a chapter ends
   and each time 今日传闻's finale is won (rewards.json `growth.treasure`). */
export const TREASURE_TOP = 9;
/* The realm a cultivator may bind one at, and the material that names its element. */
const REFINE_TIER = 'core';
const coreOf = (content, id) => content.items.items.find(i => i.id === id && i.effect?.core);
const canRefine = (content, state) => tierRank(content, REFINE_TIER) <= tierIndex(content, state);

/* The treasure as the card and Look tell it. */
function treasureBrief(content, state) {
  const t = state.treasure;
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
  if (!state.treasure || !n || state.treasure.level >= TREASURE_TOP) return null;
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
   player's own treasure, and the player names it as they named their 道号.
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

/* The same day, creature and 道号 draw the same creature — an undo cannot
   fish for an easier one. */
const duelSeed = (state, creature, now) => `${dayKey(now)}|${creature.id}|${state.name ?? ''}`;

export { artBrief, artOf, artsBrief, canRefine, charmOf, drop, duelSeed, giveCharm, growTreasure, learn, refineWith, tierRank, treasureBrief, wornOf };
