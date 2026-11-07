// rules/wear.mjs — who wears what (Hanli 11-03: 「银月也可以装备」). Part of the rules engine; rules.mjs is its one door.
//
// `state.wear` is one flat map: his slots (items.json `slots`: `weapon` · `robe` · `pendant` · `shoes`), the abode's
// flag (`abode`), and hers — the companion's same slots, keyed `<her id>.<slot>` (`yinyue.weapon` …). Flat, so every reader that asks
// "is it worn by anyone" (Object.values) stays true. One id may be worn in as many slots as copies are held, never
// more: a thing on her is not on him (`worn-elsewhere`). Whatever is worn takes no slot of the 储物袋 (pouch.mjs).
// Pure and import-free: state.mjs (the page's too) carries old saves with it.

/* The slots are the world's (items.json `slots`, each `{id, name, arms}`: the one number a thing worn there carries —
   器攻 `atk`, 防 `def`, 抗 `ward`). content.mjs declares them at load (declareSlots); these are the defaults until then,
   the same list, so a reader with no world at hand still knows them. One array and one map, filled in place, so every
   module that imported them reads the world's. (Hanli 11-07: 「顺风溜鞋子，不能算法衣。装备栏加个鞋子吧」.) */
const GEAR_SLOTS = ['weapon', 'robe', 'pendant', 'shoes'];
/* An arm's kind is its slot (content.mjs re-exports this); the value is the number it carries. */
const ARM_SLOTS = new Map([['weapon', 'atk'], ['robe', 'def'], ['pendant', 'ward'], ['shoes', 'def']]);
function declareSlots(list) {
  if (!Array.isArray(list) || !list.length) return;
  GEAR_SLOTS.splice(0, GEAR_SLOTS.length, ...list.map(s => s.id));
  ARM_SLOTS.clear();
  for (const s of list) ARM_SLOTS.set(s.id, s.arms);
}
const herKey = (her, slot) => `${her}.${slot}`;

/* The slot a thing goes in. His: an arm by its kind. Hers: an arm by its kind too, or one of her own things
   (`effect.wear: <her id>`) in the slot it names (items.json `slot`; agent's pick, Hanli delegated 11-03:
   her bells a 佩, 齐纨 a 法衣), a 佩 if it names none. */
const armSlot = item => (ARM_SLOTS.has(item?.kind) ? item.kind : null);
const herSlot = (item, her) => armSlot(item) ?? (item?.effect?.wear === her ? (GEAR_SLOTS.includes(item.slot) ? item.slot : 'pendant') : null);

/* What a set of worn things adds up to, whichever slots they sit in: the biggest 器攻 (one hand), every 防 summed
   (a 法衣 and the shoes both give 护体), every 抗 summed by element. */
function armsOf(items) {
  const out = { atk: 0, def: 0, ward: {} };
  for (const e of items.filter(Boolean).map(i => i.effect ?? {})) {
    out.atk = Math.max(out.atk, e.atk ?? 0);
    out.def += e.def ?? 0;
    for (const [el, n] of Object.entries(e.ward ?? {})) out.ward[el] = (out.ward[el] ?? 0) + n;
  }
  return out;
}

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

/* A thing worn in a slot its kind no longer goes in (a slot added since: 顺风溜 was a 法衣 until 11-07, now 鞋) moves to
   its own slot when that is free, else comes off into the bag. His and hers alike; unmarked, so it runs on every load
   and leaves a save that fits as it was. */
function slotsCarry(content, saved) {
  const wear = saved.wear ?? {}, item = id => content.items.items.find(i => i.id === id);
  let moved = null;
  for (const [key, id] of Object.entries(wear)) {
    const dot = key.lastIndexOf('.'), who = dot < 0 ? '' : key.slice(0, dot + 1), slot = key.slice(dot + 1);
    if (!GEAR_SLOTS.includes(slot)) continue;
    const own = armSlot(item(id));
    if (!own || own === slot) continue;
    moved ??= { ...wear };
    delete moved[key];
    if (moved[who + own] == null) moved[who + own] = id;
  }
  return moved ? { ...saved, wear: moved } : saved;
}

export { ARM_SLOTS, armSlot, armsOf, declareSlots, fitWear, GEAR_SLOTS, herKey, herSlot, herSlotsCarry, slotsCarry, wornCount, wornSlots };
