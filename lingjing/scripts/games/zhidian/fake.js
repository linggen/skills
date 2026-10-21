// fake.js — made-up hands for 隔空指点: the tests' fixtures and the dev feed (`?dev=1&feed=1`, games/zhidian.js), never
// a player's. A hand is what the landmarker gives: `world` (centimetres here — the judge reads angles and ratios, so
// any one unit does) and `image` (0…1 of the picture).
//
//   pointing(hand, deg, squash?) → the hand turned `deg` from fingers-up toward the camera (90 = straight at it), its
//                                  depth squashed by `squash` (the landmarker's depth is weak along the line of sight)
//   handsAt({ at, size, world }) → { world: [hand], image: [hand] }: the fingertips' midpoint at picture point `at`,
//                                  the hand `size` big there (poke.js sizeOf)
//   bot(botState, t, seal) → { hands, bot }: a player who holds 剑诀 at the lens and jabs, frame by frame
import { buildHand, poseOf } from '../jieyin/pose.js';
import { pointIndex } from '../jieyin/judge.js';
import { sizeOf } from './poke.js';

export function pointing(hand, deg, squash = 1) {
  const r = (-deg * Math.PI) / 180;
  return hand.map(({ x, y, z }) => ({ x, y: y * Math.cos(r) - z * Math.sin(r), z: (y * Math.sin(r) + z * Math.cos(r)) * squash }));
}

/** The 剑诀 hand, pointed `deg` at the camera (jieyin.json's rule drawn by pose.js). */
export const jianHand = (seal, deg = 75, squash = 0.4) => pointing(poseOf(seal), deg, squash);

/** Other hands, for the near-misses. */
export const shapes = {
  v: () => buildHand({ curl: ['ring', 'pinky'], spread: 14 }), // 剑指 spread into a V
  one: () => buildHand({ curl: ['middle', 'ring', 'pinky'] }), // the index alone
  three: () => buildHand({ curl: ['pinky'], together: ['index', 'middle'] }), // the ring finger left up
  open: () => buildHand({}),
  fist: () => buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] }),
};

export function handsAt({ at, size, world }) {
  const flat = pointing(world, 50).map(({ x, y }) => ({ x, y })); // a picture of a hand half-turned to the lens
  const k = size / sizeOf(flat);
  const [a, b] = [flat[pointIndex('index.tip')], flat[pointIndex('middle.tip')]];
  const tip = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const image = flat.map((p) => ({ x: at.x + (p.x - tip.x) * k, y: at.y + (p.y - tip.y) * k, z: 0 }));
  return { world: [world], image: [image] };
}

/* The bot: holds (`holdMs`), jabs (`jabMs`, the hand grows ×`jab`), draws back, again; the egg aims itself. */
const BOT = { holdMs: 300, jabMs: 160, backMs: 260, base: 0.32, jab: 1.25 };
const NEXT = { hold: 'jab', jab: 'back', back: 'hold' };

export function bot(s, t, seal) {
  let b = s ?? { phase: 'hold', since: t };
  const dur = { hold: BOT.holdMs, jab: BOT.jabMs, back: BOT.backMs }[b.phase];
  if (t - b.since >= dur) b = { phase: NEXT[b.phase], since: t };
  const k = Math.min(1, (t - b.since) / (b.phase === 'jab' ? BOT.jabMs : BOT.backMs));
  const grow = b.phase === 'jab' ? 1 + (BOT.jab - 1) * k : b.phase === 'back' ? BOT.jab - (BOT.jab - 1) * k : 1;
  return { hands: handsAt({ at: { x: 0.5, y: 0.45 }, size: BOT.base * grow, world: jianHand(seal) }), bot: b };
}
