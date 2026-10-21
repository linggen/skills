// judge3d.js — the seal judge by JOINT ANGLES on MediaPipe's 3D world points, so a seal counts with the fingers
// pointing up OR straight at the lens (隔空指点, games/zhidian.js; Hanli 10-21: 「如果手指指向屏幕, 是否可行」).
// The same seal rules as judge.js (worlds/jiuding/levels/jieyin.json `seals`: ext · curl · near · far) and the same
// calls, so a host swaps one import; only the knobs differ (a level's `judge3d`).
//
// Why angles: judge.js reads "straight" as the tip reaching farther from the wrist than the middle joint. A finger
// pointed at the camera lies along the depth axis, and the landmarker's depth (world z) comes out squashed and noisy
// there — squash z and that ratio sinks toward 1, a straight finger reads bent. A straight finger's joints stay in
// one line however an axis is squashed, so the bend at each joint stays near 0°.
//
//   bendOf(hand, finger) → degrees: the finger's own bend, at its middle and end joints (root → middle → end → tip).
//                          The root joint is left out on purpose: pointing at the screen, many hands keep the palm up
//                          and bend the straight fingers forward at the knuckles — still straight fingers.
//   makes3d(hand, seal, knobs, slack?) · handSeal3d(hand, seals, knobs, held?) · sealOf3d(hands, seals, knobs, held?)
//
// knobs: { extDeg: a finger is straight when it bends less than this in all, curlDeg: folded when more than this,
// near / far: two points' distance in palm-widths (index root → little-finger root: it lies across the hand, not
// along the depth a pointing hand is squashed in), loose: the slack a seal already held is judged with }.
import { pointIndex } from './judge.js';

const CHAIN = { thumb: ['thumb.cmc', 'thumb.mcp', 'thumb.ip', 'thumb.tip'] };
const chainOf = (f) => CHAIN[f] ?? [`${f}.mcp`, `${f}.pip`, `${f}.dip`, `${f}.tip`];

const sub = (a, b) => [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const dist = (a, b) => len(sub(a, b));
const at = (hand, name) => hand[pointIndex(name)];

/** The angle, in degrees, between two directions (0 = the same way). */
function turnDeg(u, v) {
  const n = len(u) * len(v);
  if (!n) return 0;
  const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / n;
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** How much a finger bends in itself, in degrees: root → middle → end → tip, the turn at its middle and end joints. */
export function bendOf(hand, finger) {
  const pts = chainOf(finger).map((n) => at(hand, n));
  let deg = 0;
  for (let i = 1; i < pts.length - 1; i += 1) deg += turnDeg(sub(pts[i], pts[i - 1]), sub(pts[i + 1], pts[i]));
  return deg;
}

/** One palm-width: the index finger's root → the little finger's root. */
export const palmOf = (hand) => dist(at(hand, 'index.mcp'), at(hand, 'pinky.mcp')) || 1;

/** Two points' distance in palm-widths. */
export const gap3d = (hand, a, b) => dist(at(hand, a), at(hand, b)) / palmOf(hand);

/** Does `hand` make `seal`? `slack` (0 strict … knobs.loose) widens every number for a seal already held. */
export function makes3d(hand, seal, knobs, slack = 0) {
  if (!Array.isArray(hand) || hand.length < 21) return false;
  const k = { ext: knobs.extDeg * (1 + slack), curl: knobs.curlDeg / (1 + slack), near: knobs.near * (1 + slack), far: knobs.far / (1 + slack) };
  return (seal.ext ?? []).every((f) => bendOf(hand, f) < k.ext)
    && (seal.curl ?? []).every((f) => bendOf(hand, f) > k.curl)
    && (seal.near ?? []).every(([a, b]) => gap3d(hand, a, b) < k.near)
    && (seal.far ?? []).every(([a, b]) => gap3d(hand, a, b) > k.far);
}

/** The seal one hand makes: the held one first (loosely), else the first in the table it makes strictly. */
export function handSeal3d(hand, seals, knobs, held = null) {
  if (held && seals[held] && makes3d(hand, seals[held], knobs, knobs.loose ?? 0)) return held;
  return Object.keys(seals).find((id) => makes3d(hand, seals[id], knobs)) ?? null;
}

/** The seal the hands in view make: the held one if any hand still makes it, else the first hand's that makes one. */
export function sealOf3d(hands, seals, knobs, held = null) {
  const each = (hands ?? []).map((h) => handSeal3d(h, seals, knobs, held));
  if (held && each.includes(held)) return held;
  return each.find(Boolean) ?? null;
}
