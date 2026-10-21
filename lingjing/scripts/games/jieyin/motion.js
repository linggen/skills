// motion.js — a hand thrust at the camera: the one motion detector for every hand move (手势斗法, doc/games.md; moved here
// from 隔空指点's zhidian/poke.js, which now re-exports it). Pure: one sample a camera frame in, a thrust (or none) out.
//
// The landmarker's world points are centred on the hand and its picture depth is the wrist's own, so neither says how
// near the hand is; its size in the picture does. A thrust grows it fast (×1.15–1.4 in ~200 ms); a hand drifting nearer
// grows it slowly, a hand trembling by a few % either way. So: the size now over the smallest in the last `windowMs`,
// past `grow` → a thrust. Where the hand points or moves sideways does not matter (moves aim themselves).
// What KIND of thrust is the shape's, not the motion's: fingers (剑诀, 单剑指) make a jab (戳), a palm or a fist a push (推 · 拍).
//
//   sizeOf(hand)                                → the hand's size in the picture (three palm lengths, summed)
//   poke(state, { t, size, sealed }, knobs)     → { state, shot: { at } | null }   t ms · sealed: the shape is one that may thrust
//   thrustOf(shape, kinds)                      → 'jab' | 'push' | null   (kinds: jieyin.json `doufa.thrust`)

import { pointIndex } from './judge.js';

const PAIRS = [['wrist', 'index.mcp'], ['wrist', 'pinky.mcp'], ['index.mcp', 'pinky.mcp']].map((p) => p.map(pointIndex));

export function sizeOf(hand) {
  return PAIRS.reduce((t, [a, b]) => t + Math.hypot(hand[a].x - hand[b].x, hand[a].y - hand[b].y), 0);
}

export const startPoke = () => ({ seen: [], coolTo: -Infinity });

const smallest = (seen) => seen.reduce((m, s) => Math.min(m, s.size), Infinity);

export function poke(state, sample, knobs) {
  const { t } = sample;
  if (!sample.size) return { state: startPoke(), shot: null }; // no hand: start over
  const seen = [...state.seen.filter((s) => t - s.t <= knobs.windowMs), { t, size: sample.size }];
  const keep = { ...state, seen };
  if (!sample.sealed || t < state.coolTo || seen.length < 2) return { state: keep, shot: null };
  if (sample.size < smallest(seen) * knobs.grow) return { state: keep, shot: null };
  return { state: { seen: [{ t, size: sample.size }], coolTo: t + knobs.coolMs }, shot: { at: t } };
}

/** The kind of thrust a shape makes: `kinds` { jab: [shapes], push: [shapes] }. */
export function thrustOf(shape, kinds = {}) {
  if (shape == null) return null;
  if (kinds.jab?.includes(shape)) return 'jab';
  if (kinds.push?.includes(shape)) return 'push';
  return null;
}
