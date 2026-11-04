// rules/gearhint.mjs — a story fight weighed with a thing worn, and he is not wearing it (Hanli 2026-11-04: 「要加」).
// Part of the rules engine; rules.mjs is its one door.
//
// A story duel's game may say what it was weighed with on the lead (`weighed_with: { wear: { <slot>: <item id> } }` —
// 09-lingcao's 犰狳 at 五层 with 火柴 worn, tools/story-fights.mjs). While that fight is up, not won and not already
// open (an open fight's setup is locked, and the world holds still: tasks.mjs FIGHT_HOLDS), the door's brief carries one
// fact when the lead lacks the thing but owns it: `gear_hint`. Where it is (`on`): 'bag' (a copy no one wears), or the
// one who wears it (the wear key's owner — 银月's `yinyue`). Not owned at all: no fact. Facts only; the page and 银月 say it.
import { pick } from '../state.mjs';
import { itemOf } from './errands.mjs';
import { nameOf } from './look.mjs';
import { creatureOf } from './world.mjs';
import { GEAR_SLOTS, wornSlots } from './wear.mjs';

/* Where a copy of `id` is that the lead could put on: a spare in the bag first, else the first one who wears it. */
function whereOf(state, id) {
  const worn = wornSlots(state, id);
  if ((state.bag?.[id] ?? 0) > worn.length) return 'bag';
  return worn.find(k => k.includes('.'))?.split('.')[0] ?? null;
}

/* What the beast lets through and what it shrugs off (creatures.json `feint`: 犰狳's 装睡 — plain blows glance, metal goes in). */
function resistsOf(content, game, lang) {
  const f = creatureOf(content, game.creature)?.feint;
  if (!f) return null;
  const el = id => pick(content.traits.elements[id], lang) ?? id;
  return { name: pick(f.name, lang), lets: (f.pierce ?? []).map(el) };
}

/* The one fact, or null. Several things declared: the first one he lacks and owns. */
export function gearHint(content, state, game) {
  const want = game?.weighed_with?.wear;
  if (!want || state.wins?.[game.id] || state.fight) return null;
  const lang = state.lang;
  for (const [slot, id] of Object.entries(want)) {
    if (!GEAR_SLOTS.includes(slot) || state.wear?.[slot] === id) continue;
    const on = whereOf(state, id), item = itemOf(content, id);
    if (!on || !item) continue;
    const her = content.world?.companion?.id ?? null;
    const strike = item.effect?.strike ? content.cards?.cards?.find(c => c.id === item.effect.strike) : null;
    return {
      item: id, name: pick(item.name, lang) ?? id, slot, on, lead: state.name ?? null,
      ...(on !== 'bag' && on === her ? { on_name: nameOf(content, her, lang) ?? null } : {}),
      ...(state.wear?.[slot] ? { now: { item: state.wear[slot], name: pick(itemOf(content, state.wear[slot])?.name, lang) ?? state.wear[slot] } } : {}),
      ...(strike ? { strike: pick(strike.name, lang) ?? strike.id } : {}),
      ...(resistsOf(content, game, lang) ? { resists: resistsOf(content, game, lang) } : {}),
      lost: state.fight_losses?.[game.id] ?? 0,
    };
  }
  return null;
}
