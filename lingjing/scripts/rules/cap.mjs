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
import { addProgress, pick, stageDoor, stepOfLayer, threshold, tierOf, zeroAt } from '../state.mjs';
import { huiNow, huiOrder } from './hui.mjs';
import { atScene, inMade, placeName, placeOf, sceneOf } from './world.mjs';

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
  const holds = (e.holds ?? []).filter(h => !holdReached(state, h, content)).map(h => rankAt(content, { tier: h.tier ?? first, layer: h.layer }));
  const all = [...ahead, ...holds];
  return all.length ? Math.min(...all) : Infinity;
}

/* Each scene's place on its chapter's spine: [chapter, steps from its first scene along the ways on (`next`)], the fewest. */
const SPINE = new WeakMap();
function spineOf(content) {
  if (SPINE.has(content.chapters)) return SPINE.get(content.chapters);
  const at = new Map();
  for (const ch of Object.values(content.chapters ?? {})) {
    const queue = ch.scenes?.[ch.first_scene] ? [[ch.first_scene, 0]] : [];
    while (queue.length) {
      const [id, n] = queue.shift();
      if (at.has(id) || !ch.scenes[id]) continue;
      at.set(id, [ch.id, n]);
      for (const e of ch.scenes[id].exits ?? []) if (e.next && !at.has(e.next)) queue.push([e.next, n + 1]);
    }
  }
  SPINE.set(content.chapters, at);
  return at;
}
/* The save stands past `scene` on the book's line: a later chapter, or further along the same chapter's ways on. */
function standsPast(content, state, scene) {
  const spine = spineOf(content), here = state.scene != null ? spine.get(state.scene) : null, there = spine.get(scene);
  if (!there || (state.chapter == null && !here)) return false;
  const chapter = here?.[0] ?? state.chapter;
  if (chapter !== there[0]) return chapter > there[0];
  return Boolean(here) && here[1] > there[1];
}

/* A hold (ladder.json caps.hui.<回>.holds `{layer, until}`) is let go once the story stands at its scene or past it —
   past it in the book's order too, not only by its id in `done_scenes`: a save made before a scene was cut into the
   line (wm-mingpai, 2026-10-31) never walked it, and a hold until it would never let go. */
export const holdReached = (state, h, content = null) => state.scene === h.until || (state.done_scenes ?? []).includes(h.until)
  || Boolean(content && standsPast(content, state, h.until));

/* A share hold (`{layer, share, until}`, Hanli 11-03: 「应该让玩家在破镜前的剧情刚好圆满」): until the story reaches its scene,
   the bar on that layer stops at `share` of it — 圆满 lands near the book's breakthrough, not scenes ahead of it. It holds
   the layer too (heldBy: no step past it). The mark on the layer he stands on, or null where none binds. */
export function shareMark(content, state) {
  const e = entryOf(content, state);
  if (!e || !tierOf(content, state.tier) || zeroAt(content, state.tier, state.step)) return null;
  const first = content.ladder.tiers[0].id, now = rankOf(content, state.tier, state.step);
  const shares = (e.holds ?? []).filter(h => h.share != null && !holdReached(state, h, content) && rankAt(content, { tier: h.tier ?? first, layer: h.layer }) === now).map(h => h.share);
  return shares.length ? Math.floor(Math.min(...shares) * threshold(content, state)) : null;
}

/* The room under the share mark: what of `amount` the bar may take now (all of it where no mark binds). */
export const shareRoom = (content, state) => { const m = shareMark(content, state); return m == null ? Infinity : Math.max(0, m - (state.progress ?? 0)); };

/* 修为 past a share mark waits in the 丹田 (`banked` — the cap's own 「一分不丢」) and comes back as the mark lifts or he
   steps on. Never pulls a save down: only a carry just made (`carried`, a step this pay made) is banked past the mark.
   Mutates `s`. */
export function rebank(content, s, carried = false) {
  const m = shareMark(content, s);
  if (carried && m != null && (s.progress ?? 0) > m) { s.banked = (s.banked ?? 0) + s.progress - m; s.progress = m; }
  const back = Math.min(s.banked ?? 0, m == null ? Infinity : Math.max(0, m - (s.progress ?? 0)));
  if (back > 0) { s.progress += back; s.banked -= back; }
  if (s.banked != null && s.banked <= 0) delete s.banked;
  return s;
}

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
  if (!content.ladder.caps || !tier || zeroAt(content, state.tier, state.step)) return null;
  // At a share mark (shareMark): the bar stops short, the same words — the way on is the story.
  const m = shareMark(content, state);
  if (m != null && (state.progress ?? 0) >= m && (state.progress ?? 0) < threshold(content, state)) return { say: pick(content.ladder.caps.say, lang), share: true };
  if (state.step >= tier.thresholds.length - 1) return null;
  if ((state.progress ?? 0) < threshold(content, state) || underCap(content, state, state.tier, state.step + 1)) return null;
  return { say: pick(content.ladder.caps.say, lang) };
}

/* Where the story goes on while the cap holds — the way past it (Hanli 11-03: 「走剧情破境」). Standing in a scene of the
   story: `here`, and its place. Else the goal line's (errands.mjs waypointOf `way`): its words, its place and first road.
   Null when there is no story ahead to point at. */
export function capStory(content, state, way) {
  if (!inMade(state) && atScene(content, state)) {
    const sc = sceneOf(content, state), p = placeOf(content, sc?.at ?? state.place);
    return { here: true, scene: sc.id, ...(p ? { place: placeName(content, state, p) } : {}) };
  }
  if (!way) return null;
  return { text: way.text ?? way.title ?? '', ...(way.place ? { place: way.place } : {}), ...(way.toward ? { toward: way.toward } : {}),
    ...(way.coming ? { coming: true } : {}), ...(way.held ? { held: true } : {}) };
}

/* A 修为 pill at the cap, kept, in the world's words (rules/travel.mjs `xw-full`). */
export const capPillSay = (content, lang) => pick(content.ladder.caps?.pill ?? content.ladder.caps?.say, lang);

/* A breakthrough past the cap, refused in the world's words. */
export const pastCapSay = (content, lang) => pick(content.ladder.caps?.refuse, lang);

/* A full layer whose door has opened since (a gate passed, the next 回's cap) steps now: the 修为
   already past its mark carries him up as the next grant would (Hanli 10-27: the bar stood at
   「一层圆满 · 候」 while the book had him at 二层). Run on every load (rules.mjs), as settleStages;
   a save with nothing to step comes back as it was (the same object). */
export function settleHeld(content, state) {
  if (!state || !content.ladder?.caps || !tierOf(content, state.tier) || zeroAt(content, state.tier, state.step)) return state;
  // 修为 banked past a share mark comes back as the mark lifts (rebank).
  const back = state.banked > 0 && shareRoom(content, state) > 0;
  if (!back && (state.progress ?? 0) < threshold(content, state)) return state;
  const s = structuredClone(state);
  if (back) rebank(content, s);
  // Never through a 段 door (四层, 七层 of a realm in 段): that step is the trial's, thrown by the next pay (rules/breakthrough.mjs).
  const { levels } = addProgress(content, s, 0, (tier, step) => underCap(content, s, tier, step) && !stageDoor(content, tier, step));
  if (levels.length) rebank(content, s, true);
  return levels.length || back ? s : state;
}
