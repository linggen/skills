// rules/wear.mjs — who wears what (Hanli 11-03: 「银月也可以装备」). Part of the rules engine; rules.mjs is its one door.
//
// `state.wear` is one flat map: his three slots (`weapon` · `robe` · `pendant`), the abode's flag (`abode`), and
// hers — the companion's same three, keyed `<her id>.<slot>` (`yinyue.weapon` …). Flat, so every reader that asks
// "is it worn by anyone" (Object.values) stays true. One id may be worn in as many slots as copies are held, never
// more: a thing on her is not on him (`worn-elsewhere`). Whatever is worn takes no slot of the 储物袋 (pouch.mjs).
// Pure and import-free: state.mjs (the page's too) carries old saves with it.

const GEAR_SLOTS = ['weapon', 'robe', 'pendant'];
/* An arm's kind is its slot (content.mjs re-exports this). */
const ARM_SLOTS = new Map(GEAR_SLOTS.map(k => [k, k]));
const herKey = (her, slot) => `${her}.${slot}`;

/* The slot a thing goes in. His: an arm by its kind. Hers: an arm by its kind too, or one of her own things
   (`effect.wear: <her id>`) in the slot it names (items.json `slot`; agent's pick, Hanli delegated 11-03:
   her bells a 佩, 齐纨 a 法衣), a 佩 if it names none. */
const armSlot = item => ARM_SLOTS.get(item?.kind) ?? null;
const herSlot = (item, her) => armSlot(item) ?? (item?.effect?.wear === her ? (GEAR_SLOTS.includes(item.slot) ? item.slot : 'pendant') : null);

/* How many slots wear this id, and the ones that do (his first, hers after). */
const wornSlots = (state, id) => Object.keys(state.wear ?? {}).filter(k => state.wear[k] === id);
const wornCount = (state, id) => wornSlots(state, id).length;

/* Worn in more slots than copies held (one sold, spent, fed or taken by the story): hers come off first, then his.
   Mutates `s` (a clone). */
function fitWear(s) {
  for (const id of new Set(Object.values(s.wear ?? {}))) {
    const slots = wornSlots(s, id).sort((a, b) => Number(a.includes('.')) - Number(b.includes('.')));
    while (slots.length > Math.max(0, s.bag?.[id] ?? 0)) delete s.wear[slots.pop()];
  }
  return s;
}

/* A save from before v16: her one slot (`wear[<her id>]`) moves to the slot her thing goes in. The state itself
   when there is nothing to move. */
function herSlotsCarry(content, saved) {
  const { her_slots, ...state } = saved, her = content.world?.companion?.id ?? null;
  const id = her ? state.wear?.[her] : null;
  if (!id) return 'her_slots' in saved ? state : saved;
  const item = content.items.items.find(i => i.id === id), slot = herSlot(item, her) ?? 'pendant';
  const { [her]: _, ...wear } = state.wear;
  return { ...state, wear: { ...wear, [herKey(her, slot)]: wear[herKey(her, slot)] ?? id } };
}

export { ARM_SLOTS, armSlot, fitWear, GEAR_SLOTS, herKey, herSlot, herSlotsCarry, wornCount, wornSlots };
