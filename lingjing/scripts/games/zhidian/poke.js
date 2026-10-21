// poke.js — a jab at the camera, the 火蛋's trigger (隔空指点, games/zhidian.js). Pure: one sample a camera frame in,
// a shot (or none) out. Every number is the level's `poke` (worlds/jiuding/levels/zhidian.json).
//
// The landmarker's world points are centred on the hand and its picture depth is the wrist's own, so neither says how
// near the hand is; its size in the picture does. A jab grows it fast (×1.2–1.4 in ~200 ms); a hand drifting nearer
// grows it slowly (a few % in the same window), a hand trembling by a few % either way. So: the size now over the
// smallest in the last `windowMs`, past `grow` → a shot.
//
//   sizeOf(hand)                          → the hand's size in the picture (three palm lengths, summed)
//   poke(state, { t, size, aim, sealed }, knobs) → { state, shot: { aim, at } | null }
//       t ms · size sizeOf · aim the 准星 on the field now · sealed: 剑诀 held. A shot goes where the 准星 stood at
//       the window's smallest (the fingertips move in the picture while the hand jabs).
import { pointIndex } from '../jieyin/judge.js';

const PAIRS = [['wrist', 'index.mcp'], ['wrist', 'pinky.mcp'], ['index.mcp', 'pinky.mcp']].map((p) => p.map(pointIndex));

export function sizeOf(hand) {
  return PAIRS.reduce((t, [a, b]) => t + Math.hypot(hand[a].x - hand[b].x, hand[a].y - hand[b].y), 0);
}

export const startPoke = () => ({ seen: [], coolTo: -Infinity });

const smallest = (seen) => seen.reduce((m, s) => (s.size < m.size ? s : m), seen[0]);
const moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function poke(state, sample, knobs) {
  const { t } = sample;
  if (!sample.size || !sample.aim) return { state: startPoke(), shot: null }; // no hand: start over
  const seen = [...state.seen.filter((s) => t - s.t <= knobs.windowMs), sample];
  const keep = { ...state, seen };
  if (!sample.sealed || t < state.coolTo || seen.length < 2) return { state: keep, shot: null };
  const low = smallest(seen);
  if (sample.size < low.size * knobs.grow) return { state: keep, shot: null };
  if (moved(low.aim, sample.aim) > knobs.maxShift) return { state: keep, shot: null }; // a sweep or a lost track
  return { state: { seen: [sample], coolTo: t + knobs.coolMs }, shot: { aim: low.aim, at: t } };
}
