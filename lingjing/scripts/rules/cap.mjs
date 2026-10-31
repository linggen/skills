// rules/cap.mjs — 修为 stops where the book stands (Hanli, 2026-10-05: 「游戏里修炼有个上限吧?
// 和故事对齐」). Part of the rules engine; rules.mjs is its one door.
//
// The world declares, per 回 (ladder.json `caps.hui`), the highest step a player's
// own work reaches there (`tier` + `layer`) and, when the 回's scenes carry him
// further (息壤's 四层, the cliff's 筑基), the highest its story reaches
// (`story`; else the same). `holds` keep grinding lower until the story reaches a
// scene of the 回 (`{layer, until}`): the cap opens where the book climbs, not at the 回's door. A 回 with no entry takes the nearest earlier one's
// in the book's order (a 今 interlude takes the 古 回 before it). After 卷一 the
// save waits in 古九's chapter (卷二 · 即将开放), so 古九's cap holds: 筑基小成.
// A chapter with no 回 yet (the old spine) has none — its realm gate rules it,
// as before; a world without `caps` has none.
//
// What it does: grinding fills the layer at the cap and steps no further — the
// 修为 counts on past its mark (Hanli, 2026-10-15; state.mjs addProgress) and
// the story's rise carries it; a story's rise or breakthrough past `story` is
// refused in the world's words.
// A save already past the cap (one played before 2026-10-05) is never pulled
// down: it keeps its layer and fills it, and goes no higher until the story
// catches up.
import { addProgress, pick, stepOfLayer, threshold, tierOf, zeroAt } from '../state.mjs';
import { huiNow, huiOrder } from './hui.mjs';

/* A realm and layer as one number, low to high: tier index, then layer. */
export const rankOf = (content, tier, step) => content.ladder.tiers.findIndex(t => t.id === tier) * 100 + step;
const rankAt = (content, at) => rankOf(content, at.tier, stepOfLayer(content, at.tier, at.layer));

/* The 回's entry: its own, else the nearest earlier one's. */
function entryOf(content, state) {
  const caps = content.ladder.caps?.hui;
  if (!caps) return null;
  const sorted = Object.keys(caps).filter(k => !k.startsWith('_')).sort((a, b) => huiOrder(content, a) - huiOrder(content, b));
  if (!sorted.length) return null;
  const here = huiNow(content, state);
  if (!here) return null;
  const at = huiOrder(content, here);
  const before = sorted.filter(id => huiOrder(content, id) <= at).at(-1);
  return before ? caps[before] : null;
}

/* The cap where the save stands: `grind` the rank his own work may step up to
   (never below where he already is), `story` the rank a scene may carry him to.
   Null: no cap. */
export function capOf(content, state) {
  const e = entryOf(content, state);
  if (!e) return null;
  const now = rankOf(content, state.tier, state.step);
  return { grind: Math.max(Math.min(rankAt(content, e), heldBy(content, state, e)), now), story: rankAt(content, e.story ?? e), at: { tier: e.tier, layer: e.layer } };
}

/* The cap follows the book's own rises inside the 回 (2026-10-16): while a stage quest of the 回
   (`gates`, rules/gates.mjs) is still ahead, grinding reaches no further than the lowest layer one
   of them asks full — so no rise of the book ever lands on a layer already ground past (古七's
   定风: 「可缸涨了，层不动」). Past every gate, the 回's own cap. */
function heldBy(content, state, e) {
  const first = content.ladder.tiers[0].id;
  const ahead = (e.gates ?? []).filter(g => !gatePassed(content, state, g)).map(g => rankAt(content, { tier: g.tier ?? first, layer: g.layer }));
  // …and a hold of the 回 (`holds`, 2026-10-31): until the story reaches its scene, no further than its layer — the 回's
  // cap opens mid-回 where the book climbs (古五: 二层 through the 秘境's rooms, 四层圆满 only in the 石室, wm-kaikai).
  const holds = (e.holds ?? []).filter(h => !holdReached(state, h)).map(h => rankAt(content, { tier: h.tier ?? first, layer: h.layer }));
  const all = [...ahead, ...holds];
  return all.length ? Math.min(...all) : Infinity;
}

/* A hold (ladder.json caps.hui.<回>.holds `{layer, until}`) is let go once the story stands at its scene or past it. */
export const holdReached = (state, h) => state.scene === h.until || (state.done_scenes ?? []).includes(h.until);

/* A gate (ladder.json caps.hui.<回>.gates) walked through: its scene passed, or one of its ways
   taken that stays in the scene and marks it (古八's 腊八 · 再上五行台, `mark: y-dabi`, before 入秋
   in the same scene — 2026-10-16: two gates, one scene). */
export function gatePassed(content, state, g) {
  if ((state.done_scenes ?? []).includes(g.scene)) return true;
  const sc = Object.values(content.chapters ?? {}).map(ch => ch.scenes?.[g.scene]).find(Boolean);
  const marks = new Set(state.marks ?? []);
  return (sc?.exits ?? []).some(x => g.exits.includes(x.id) && x.mark && !x.next && !x.ends && marks.has(x.mark));
}

/* May the realm step from where it is to (tier, step)? A gain that would cross the cap is held. */
export const underCap = (content, state, tier, step) => {
  const cap = capOf(content, state);
  return !cap || rankOf(content, tier, step) <= cap.grind;
};

/* May a scene carry him to (tier, step)? */
export const storyAllows = (content, state, tier, step) => {
  const cap = capOf(content, state);
  return !cap || rankOf(content, tier, step) <= cap.story;
};

/* At the cap now: the layer filled, the next one past it, and not a realm's
   peak (that is the cauldron's, the breakthrough). Look carries the world's
   line so the full bar reads as a wait, not a fault. Null otherwise. */
export function capLook(content, state, lang) {
  const tier = tierOf(content, state.tier);
  if (!content.ladder.caps || !tier || state.step >= tier.thresholds.length - 1 || zeroAt(content, state.tier, state.step)) return null;
  if ((state.progress ?? 0) < threshold(content, state) || underCap(content, state, state.tier, state.step + 1)) return null;
  return { say: pick(content.ladder.caps.say, lang) };
}

/* A breakthrough past the cap, refused in the world's words. */
export const pastCapSay = (content, lang) => pick(content.ladder.caps?.refuse, lang);

/* A full layer whose door has opened since (a gate passed, the next 回's cap) steps now: the 修为
   already past its mark carries him up as the next grant would (Hanli 10-27: the bar stood at
   「一层圆满 · 候」 while the book had him at 二层). Run on every load (rules.mjs), as settleStages;
   a save with nothing to step comes back as it was (the same object). */
export function settleHeld(content, state) {
  if (!state || !content.ladder?.caps || !tierOf(content, state.tier) || zeroAt(content, state.tier, state.step)) return state;
  if ((state.progress ?? 0) < threshold(content, state)) return state;
  const s = structuredClone(state);
  const { levels } = addProgress(content, s, 0, (tier, step) => underCap(content, state, tier, step));
  return levels.length ? s : state;
}
