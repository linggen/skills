// poke.js — a jab at the camera, the 火蛋's trigger (隔空指点, games/zhidian.js). Pure: one sample a camera frame in,
// a shot (or none) out. Every number is the level's `poke` (worlds/jiuding/levels/zhidian.json).
//
// The landmarker's world points are centred on the hand and its picture depth is the wrist's own, so neither says how
// near the hand is; its size in the picture does. A jab grows it fast (×1.15–1.4 in ~200 ms); a hand drifting nearer
// grows it slowly, a hand trembling by a few % either way. So: the size now over the smallest in the last `windowMs`,
// past `grow` → a shot. Where the hand points does not matter (the egg aims itself, core.js targetOf), so a jab that
// also moves sideways counts (Hanli 10-21, on the real camera: 「剑诀往前戳, 不好操作」「往前戳触发攻击, 但自动瞄准也可以」).
//
//   sizeOf(hand)                                → the hand's size in the picture (three palm lengths, summed)
//   poke(state, { t, size, sealed }, knobs)     → { state, shot: { at } | null }   t ms · sealed: 剑诀 held

import { pointIndex } from '../jieyin/judge.js';

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
