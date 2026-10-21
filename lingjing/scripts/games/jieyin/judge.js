// judge.js — which hand seal a hand is making, by the RULES a level declares (worlds/jiuding/levels/jieyin.json
// `seals`, `judge`), never by a model. Pure: a hand is MediaPipe's 21 points ({x, y, z}, any one metric — the
// landmarker's world points, metres round the hand's middle), so a test feeds it made-up hands.
//
//   sealOf(hands, seals, knobs, held?) → seal id | null
//
// `held`: the seal the player is holding now — it is judged with looser numbers (`knobs.loose`), so a seal does not
// flicker off while a hand trembles at the edge. Shape only: either hand, mirrored or not.

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const JOINTS = { thumb: ['cmc', 'mcp', 'ip', 'tip'], other: ['mcp', 'pip', 'dip', 'tip'] };

/** A point's index in MediaPipe's 21: `wrist`, or `<finger>.<joint>`. */
export function pointIndex(name) {
  if (name === 'wrist') return 0;
  const [f, j] = String(name).split('.');
  const fi = FINGERS.indexOf(f);
  const ji = (f === 'thumb' ? JOINTS.thumb : JOINTS.other).indexOf(j);
  if (fi < 0 || ji < 0) throw new Error(`jieyin: no point ${name}`);
  return 1 + fi * 4 + ji;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const at = (hand, name) => hand[pointIndex(name)];
/** One hand-length: wrist → the middle finger's root. */
export const handSize = (hand) => dist(hand[0], hand[9]) || 1;

/** How far out a finger reaches: its tip's distance from the wrist over its middle joint's (>1 straight, <1 folded). */
export function reach(hand, finger) {
  const w = hand[0];
  return dist(w, at(hand, `${finger}.tip`)) / (dist(w, at(hand, `${finger}.pip`)) || 1);
}

/** Two points' distance in hand-lengths. */
export const gap = (hand, a, b) => dist(at(hand, a), at(hand, b)) / handSize(hand);

/** Does `hand` make `seal`? `slack` (0 strict … knobs.loose) widens every number for a seal already held. */
export function makes(hand, seal, knobs, slack = 0) {
  if (!Array.isArray(hand) || hand.length < 21) return false;
  const k = { ext: knobs.ext / (1 + slack), curl: knobs.curl * (1 + slack), near: knobs.near * (1 + slack), far: knobs.far / (1 + slack) };
  return (seal.ext ?? []).every((f) => reach(hand, f) > k.ext)
    && (seal.curl ?? []).every((f) => reach(hand, f) < k.curl)
    && (seal.near ?? []).every(([a, b]) => gap(hand, a, b) < k.near)
    && (seal.far ?? []).every(([a, b]) => gap(hand, a, b) > k.far);
}

/** The seal one hand makes: the held one first (loosely), else the first in the table that it makes strictly. */
export function handSeal(hand, seals, knobs, held = null) {
  if (held && seals[held] && makes(hand, seals[held], knobs, knobs.loose ?? 0)) return held;
  return Object.keys(seals).find((id) => makes(hand, seals[id], knobs)) ?? null;
}

/** The seal the hands in view make: the held one if any hand still makes it, else the first hand's that makes one. */
export function sealOf(hands, seals, knobs, held = null) {
  const each = (hands ?? []).map((h) => handSeal(h, seals, knobs, held));
  if (held && each.includes(held)) return held;
  return each.find(Boolean) ?? null;
}
