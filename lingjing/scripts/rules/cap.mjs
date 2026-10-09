// rules/cap.mjs — 修为 stops where the book stands (Hanli, 2026-10-05: 「游戏里修炼有个上限吧?
// 和故事对齐」). Part of the rules engine; rules.mjs is its one door.
//
// The world declares, per 回 (ladder.json `caps.hui`), the highest step a player's
// own work reaches there (`tier` + `layer`) and, when the 回's scenes carry him
// further (息壤's 四层, the cliff's 筑基), the highest its story reaches
// (`story`; else the same). A 回 with no entry takes the nearest earlier one's
// in the book's order (a 今 interlude takes the 古 回 before it). After 卷一 the
// save waits in 古九's chapter (卷二 · 即将开放), so 古九's cap holds: 筑基小成.
// A chapter with no 回 yet (the old spine) has none — its realm gate rules it,
// as before; a world without `caps` has none.
//
// What it does: 修为 fills the layer at the cap and stops there — what would
// spill over is held back (state.mjs addProgress, as at a realm's peak); a
// story's rise or breakthrough past `story` is refused in the world's words.
// A save already past the cap (one played before 2026-10-05) is never pulled
// down: it keeps its layer and fills it, and goes no higher until the story
// catches up.
import { pick, threshold, tierOf } from '../state.mjs';
import { huiNow, huiOrder } from './hui.mjs';

/* A realm and layer as one number, low to high: tier index, then layer. */
export const rankOf = (content, tier, step) => content.ladder.tiers.findIndex(t => t.id === tier) * 100 + step;
const rankAt = (content, at) => rankOf(content, at.tier, at.layer - 1);

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
  return { grind: Math.max(rankAt(content, e), now), story: rankAt(content, e.story ?? e), at: { tier: e.tier, layer: e.layer } };
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
  if (!content.ladder.caps || !tier || state.step >= tier.thresholds.length - 1) return null;
  if ((state.progress ?? 0) < threshold(content, state) || underCap(content, state, state.tier, state.step + 1)) return null;
  return { say: pick(content.ladder.caps.say, lang) };
}

/* A breakthrough past the cap, refused in the world's words. */
export const pastCapSay = (content, lang) => pick(content.ladder.caps?.refuse, lang);
