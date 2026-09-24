// rules/arms.mjs — 本命法宝 and 功法: the bound treasure, the sword, the 符 and the learned arts.
// Part of the rules engine; rules.mjs is its one door.
import { dayKey, pick, tierOf } from '../state.mjs';
import { clone, refuse } from './core.mjs';
import { itemOf } from './errands.mjs';
import { boutFortune } from './fortune.mjs';
import { tierIndex } from './world.mjs';

/* ── 本命法宝: the treasure a cultivator binds at 结丹 ── */

/* What a subdued creature leaves behind: the 妖丹 of the realm it was met at,
   and the one thing this creature carries (creatures.json `drops`). Both go
   into the bag; the catalog owns their words and their worth. */
function drop(content, state, creature) {
  const lang = state.lang, got = [];
  for (const id of [TIER_TEMPER[state.tier], creature.drops].filter(Boolean)) {
    const item = itemOf(content, id);
    if (!item) continue;
    state.bag[id] = (state.bag[id] ?? 0) + 1;
    got.push({ id, name: pick(item.name, lang), n: state.bag[id] });
  }
  return got;
}

/* 一重 … 九重: what each 重 asks in 温养 and 妖丹 before the next. */
export const TREASURE_TOP = 9;
export const NOURISH = 1; // 温养, once a day
const expFor = level => 10 + (level - 1) * 5;
const TIER_TEMPER = { qi: 'yaodan-1', foundation: 'yaodan-1', core: 'yaodan-2', nascent: 'yaodan-3' };
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
    atk: t.base + t.level, exp: t.exp, needs: t.level >= TREASURE_TOP ? null : expFor(t.level),
    nourished: state.day?.nourished === dayKey(new Date(state.updated ?? Date.now())) ? true : undefined,
  };
}

/* Feed a treasure: exp in, 重 out. Never past 九重. */
function grow(treasure, exp) {
  const t = { ...treasure, exp: treasure.exp + exp };
  const gained = [];
  while (t.level < TREASURE_TOP && t.exp >= expFor(t.level)) { t.exp -= expFor(t.level); t.level += 1; gained.push(t.level); }
  if (t.level >= TREASURE_TOP) t.exp = 0;
  return { treasure: t, gained };
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
  s.treasure = { name, base: weapon.effect?.atk ?? 0, element: material.effect.core, level: 1, exp: 0 };
  return { state: s, result: { ok: true, refined: { from: pick(weapon.name, lang), with: pick(material.name, lang) }, treasure: treasureBrief(content, s), show: [{ card: 'treasure' }] } };
}

/* 温养 — once a day, a quiet hour with it: one breath of growth. The page
   taps it; no model decides it. */
export function nourish(state, content, ctx, args) {
  if (!state.treasure) return refuse('no-treasure', null);
  const day = dayKey(ctx.now);
  if (state.day?.nourished === day) return refuse('nourished-today', null, { treasure: treasureBrief(content, state) });
  if (state.treasure.level >= TREASURE_TOP) return refuse('at-top', null, { treasure: treasureBrief(content, state) });
  const s = clone(state);
  const { treasure, gained } = grow(s.treasure, NOURISH);
  s.treasure = treasure;
  s.day = { ...(s.day ?? {}), key: day, nourished: day };
  return { state: s, result: { ok: true, nourished: NOURISH, ...(gained.length ? { rose: gained } : {}), treasure: treasureBrief(content, s) } };
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

/* What the player stands in a fight with — duel.js reads it, the card too:
   their roots and realm, the arms they wear, the 符 in the bag, the arts
   they know, the day's cast and their 日主. */
const wornOf = (content, state, slot) => (state.wear?.[slot] && state.bag[state.wear[slot]] ? itemOf(content, state.wear[slot]) : null);

function kitOf(content, state, now = null) {
  const weapon = wornOf(content, state, 'weapon'), robe = wornOf(content, state, 'robe'), pendant = wornOf(content, state, 'pendant');
  const charm = charmOf(content);
  const arts = {};
  for (const id of state.arts ?? []) { const a = artOf(content, id); if (a) arts[id] = { effect: a.effect, ready: artReady(content, state, a) }; }
  // A 本命法宝 is the weapon from the day it is refined, and lends its own
  // element the way a 法器 lends its root.
  const treasure = state.treasure ? { ...state.treasure } : null;
  return {
    roots: state.traits ?? [], tier: state.tier, step: state.step ?? 0,
    sword: treasure?.element ?? weapon?.effect?.root ?? null,
    weapon: weapon ? { id: weapon.id, atk: weapon.effect?.atk ?? 0 } : null,
    ...(treasure ? { treasure } : {}),
    robe: robe ? { id: robe.id, def: robe.effect.def } : null,
    pendant: pendant ? { id: pendant.id, ward: pendant.effect.ward } : null,
    charm: charm ? { id: charm.id, held: state.bag[charm.id] ?? 0 } : null, arts,
    ...(now && boutFortune(content, state, now) ? { fortune: boutFortune(content, state, now) } : {}),
    ...(state.fate?.element ? { fate: { root: state.fate.element } } : {}),
  };
}

/* The same day, creature and 道号 draw the same creature — an undo cannot
   fish for an easier one. */
const duelSeed = (state, creature, now) => `${dayKey(now)}|${creature.id}|${state.name ?? ''}`;

export { artBrief, artOf, artsBrief, canRefine, charmOf, drop, duelSeed, grow, kitOf, learn, tierRank, treasureBrief, wornOf };
