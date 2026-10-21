// spell.js — 掐 · 扣 · 松: a spell made the way 褚先生 teaches it in 古六 (story/jiuding-lu/06-第六回.md, 第三天 the 扣):
// pinch the spell's 文, close the four fingers over the thumb into a fist to HOLD it (扣), then let it go — the cast: by a
// PUSH of the hand toward the lens (拍, 手势斗法: `knobs.release` 'push', the motion is motion.js's, passed in as `pushes`),
// or by opening the hand (松, `release` 'open', the first cut). Pure, per hand, as time passes (the judge's shapes each frame go in, what happened comes out).
//
//   const s = spellStart(kit, ids)                       ids: spells this game offers (kit.moves.wuxing.spells …)
//   const { state, events, held } = spellStep(s, { world, handed, pushes? }, dtMs, kit)   pushes: keys of hands that thrust now
//     events: { type: 'wen' | 'kou' | 'cast' | 'fade' | 'drop', spell, hand, heldMs?, left? }
//       wen   the spell's 文 held (`judge.holdMs`): ready to 扣
//       kou   the fist closed over it (`spells.knobs.fistMs`): the spell is held; its leak starts
//       cast  released while it held one — a push (or the hand opened, `release` 'open'); `heldMs` how long, `left` 1…0 of it
//       fade  held past `fadeMs`: leaked away, 白掐一回
//       drop  a 文 never closed into a fist (`kouGapMs` with the 文 gone)
//     held: [{ hand, spell, left, glow }] — the hands holding a spell now (for the hint's 拳心 glow: hint.js `held`)
//
// The book's rules, kept: one hand holds one (two hands, at most two); a held spell leaks and is gone if held too long;
// the fist glows the spell's colour (拳心透红是火，透白是金，透青是木，透一点墨色是水，透黄是土). A spell with `kou: false`
// (飞剑: 剑诀 alone) casts as soon as its 文 is held, once per making. Hands are told apart by `handed` ('Left' |
// 'Right', eye.js), else by their order. The 扣 is any fist — the thumb inside or out (`spells.kou`: four fingers folded).

import { handSeal, makes } from './judge.js';

const KNOBS = { fistMs: 250, openMs: 200, fadeMs: 8000, kouGapMs: 1500, graceMs: 200, release: 'push' };

/** A fresh state for these spells (ids in kit.spells). */
export function spellStart(kit, ids) {
  const list = (ids ?? []).filter((id) => kit.spells?.[id]);
  return { ids: list, hands: {} };
}

const knobsOf = (kit) => ({ ...KNOBS, ...(kit.spells?.knobs ?? {}) });

/** What one hand shows: 'kou' (a fist), the 文 of one of `ids`, 'song' (open — four fingers out; after the 文s, so a
    文 with the fingers straight, 酉 or 子, is read as itself), else null. */
export function shapeOf(hand, kit, ids, held = null) {
  if (!Array.isArray(hand) || hand.length < 21) return null;
  const sp = kit.spells;
  if (makes(hand, sp.kou, kit.judge)) return 'kou';
  const wen = Object.fromEntries(ids.map((id) => [sp[id].wen, kit.seals[sp[id].wen]]).filter(([, s]) => s));
  return handSeal(hand, wen, kit.judge, held) ?? (makes(hand, sp.song, kit.judge) ? 'song' : null);
}

const spellOfWen = (kit, ids, wen) => ids.find((id) => kit.spells[id].wen === wen) ?? null;

/** The shape a hand holds, steadied: a new shape restarts the clock; a short gap (graceMs) keeps it. */
function steady(h, shape, dt, k) {
  if (shape == null) {
    const gap = h.gap + dt;
    return gap > k.graceMs ? { ...h, cur: null, curMs: 0, gap: 0 } : { ...h, gap };
  }
  if (shape !== h.cur) return { ...h, cur: shape, curMs: 0, gap: 0 };
  return { ...h, curMs: h.curMs + dt, gap: 0 };
}

/** One hand's step: its phase on with the shape it shows. */
function handStep(h, kit, ids, dt, k, key, pushed = false) {
  const ev = [], say = (type, more = {}) => ev.push({ type, spell: h.spell, hand: key, ...more });
  const sp = kit.spells, hold = kit.judge.holdMs;
  const wenSpell = h.cur && h.cur !== 'kou' && h.cur !== 'song' ? spellOfWen(kit, ids, h.cur) : null;
  if (h.phase === 'spent') { // a 飞剑 made: once per making — wait for the hand to change
    if (h.cur !== h.spellWen) h = { ...h, phase: 'idle', spell: null, spellWen: null };
    return { h, ev };
  }
  if (h.phase === 'kou') {
    h = { ...h, t: h.t + dt };
    if (h.t >= k.fadeMs) { say('fade', { heldMs: h.t }); return { h: { ...h, phase: 'idle', spell: null, t: 0 }, ev }; }
    if (k.release === 'open' ? h.cur === 'song' && h.curMs >= k.openMs : pushed) { say('cast', { heldMs: h.t, left: Math.max(0, 1 - h.t / k.fadeMs) }); return { h: { ...h, phase: 'idle', spell: null, t: 0 }, ev }; }
    return { h, ev };
  }
  if (wenSpell && h.curMs >= hold && !(h.phase === 'wen' && h.spell === wenSpell)) { // a 文 made (or another one over it)
    h = { ...h, phase: 'wen', spell: wenSpell, t: 0 };
    if (sp[wenSpell].kou === false) { say('wen'); say('cast', { heldMs: 0, left: 1 }); return { h: { ...h, phase: 'spent', spellWen: h.cur }, ev }; }
    say('wen');
    return { h, ev };
  }
  if (h.phase === 'wen') {
    if (h.cur === 'kou' && h.curMs >= k.fistMs) { say('kou'); return { h: { ...h, phase: 'kou', t: 0 }, ev }; }
    const t = h.cur === sp[h.spell].wen ? 0 : h.t + dt; // still on the 文: no hurry
    if (t > k.kouGapMs) { say('drop'); return { h: { ...h, phase: 'idle', spell: null, t: 0 }, ev }; }
    return { h: { ...h, t }, ev };
  }
  return { h, ev };
}

/** A frame: each hand in view by its key ('Left' | 'Right', else its order), each hand out of view on its clock. */
export function spellStep(state, { world = [], handed = [], pushes = [] } = {}, dt, kit) {
  const k = knobsOf(kit), hands = { ...state.hands }, events = [];
  const seen = new Map(world.map((w, i) => [handed[i] ?? `#${i}`, w]));
  for (const key of new Set([...Object.keys(hands), ...seen.keys()])) {
    const h0 = hands[key] ?? { phase: 'idle', spell: null, t: 0, cur: null, curMs: 0, gap: 0 };
    const shape = seen.has(key) ? shapeOf(seen.get(key), kit, state.ids, h0.cur) : null;
    const { h, ev } = handStep(steady(h0, shape, dt, k), kit, state.ids, dt, k, key, pushes.includes(key));
    hands[key] = h;
    events.push(...ev);
  }
  const held = Object.entries(hands).filter(([, h]) => h.phase === 'kou')
    .map(([hand, h]) => ({ hand, spell: h.spell, left: Math.max(0, 1 - h.t / k.fadeMs), glow: kit.spells[h.spell].glow }));
  return { state: { ...state, hands }, events, held };
}

/** The held spells laid onto this frame's hands, for the hint: [{ at: index in world/image, glow, left, spell }]. */
export function heldAt(held, handed = [], count = handed.length) {
  return held.map((x) => ({ ...x, at: handed.indexOf(x.hand) >= 0 ? handed.indexOf(x.hand) : Number(String(x.hand).replace('#', '')) }))
    .filter((x) => Number.isInteger(x.at) && x.at >= 0 && x.at < count);
}
