// judge.js — which hand seal the hands are making, by the RULES a level declares (worlds/jiuding/levels/jieyin.json
// `seals`, `judge`), never by a model. Pure: a hand is MediaPipe's 21 points ({x, y, z}, any one metric — the
// landmarker's world points, metres round the hand's middle), so a test feeds it made-up hands.
//
//   sealOf(hands, seals, knobs, held?, { image, aspect }?) → seal id | null
//
// `held`: the seal the player is holding now — it is judged with looser numbers (`knobs.loose`), so a seal does not
// flicker off while a hand trembles at the edge. Shape only: either hand, mirrored or not.
//
// A one-hand seal (`hands` 1, the default) is judged on one hand's world points: `ext` · `curl` · `near` · `far` ·
// `nearest` (the thumb on THIS joint and not its neighbour — 掐诀 on a joint, where joints sit 2 cm apart).
// A two-hand seal (`hands` 2, a Mac's) needs both hands: each hand's shape (`each`, or `a` and `b` — either hand may
// be either) on its world points, and how they stand to each other (`between`) on the picture's points — `image`,
// the same hands in the same order, 0…1 of the frame; `aspect` the frame's width / height. Without `image` a two-hand
// seal never fires. With two hands in view a two-hand seal is judged before the one-hand ones.

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

/** The seal's hand count: 1 unless it says 2. */
export const handsOf = (seal) => (seal?.hands === 2 ? 2 : 1);

/** Does `hand` keep a shape's rules? `slack` (0 strict … knobs.loose) widens every number for a seal already held. */
export function makes(hand, seal, knobs, slack = 0) {
  if (!Array.isArray(hand) || hand.length < 21) return false;
  const k = { ext: knobs.ext / (1 + slack), curl: knobs.curl * (1 + slack), near: knobs.near * (1 + slack), far: knobs.far / (1 + slack) };
  return (seal.ext ?? []).every((f) => reach(hand, f) > k.ext)
    && (seal.curl ?? []).every((f) => reach(hand, f) < k.curl)
    && (seal.near ?? []).every(([a, b]) => gap(hand, a, b) < k.near)
    && (seal.far ?? []).every(([a, b]) => gap(hand, a, b) > k.far)
    && (seal.nearest ?? []).every(([p, to, others]) => gap(hand, p, to) < k.near && others.every((o) => gap(hand, p, o) > gap(hand, p, to)));
}

/* ── Two hands: how they stand to each other, on the picture ── */

/** The picture's points with x stretched to the frame's shape, so a distance is a distance. */
const flat = (hand, aspect) => hand.map((p) => ({ x: p.x * aspect, y: p.y, z: 0 }));
const pt = (pair, name) => { const [h, ...rest] = name.split('.'); return at(pair[h], rest.join('.')); };

/** Do two hands on the picture keep `between`? Hand-lengths are the larger hand's there (a flat palm looks short). */
export function stands(pair, between = {}, k, slack = 0) {
  const unit = Math.max(handSize(pair.a), handSize(pair.b));
  const d = (p, q) => dist(pt(pair, p), pt(pair, q)) / unit;
  const dy = (p, q) => (pt(pair, q).y - pt(pair, p).y) / unit; // > 0: p stands above q
  const dx = (p, q) => Math.abs(pt(pair, q).x - pt(pair, p).x) / unit;
  const s = 1 + slack;
  return (between.near ?? []).every(([p, q]) => d(p, q) < k.near * s)
    && (between.far ?? []).every(([p, q]) => d(p, q) > k.far / s)
    && (between.above ?? []).every(([p, q]) => dy(p, q) > k.above / s)
    && (between.level ?? []).every(([p, q]) => Math.abs(dy(p, q)) < k.level * s)
    && (between.column ?? []).every(([p, q]) => dx(p, q) < k.column * s);
}

/** Do these two hands make a two-hand seal — either hand as `a`? */
export function makesTwo(world, image, seal, knobs, slack = 0, aspect = 1) {
  if (world?.length < 2 || image?.length < 2) return false;
  const shapeA = seal.a ?? seal.each ?? {}, shapeB = seal.b ?? seal.each ?? {};
  const pic = [flat(image[0], aspect), flat(image[1], aspect)];
  return [[0, 1], [1, 0]].some(([i, j]) => makes(world[i], shapeA, knobs, slack) && makes(world[j], shapeB, knobs, slack)
    && stands({ a: pic[i], b: pic[j] }, seal.between, knobs.pair ?? {}, slack));
}

/** The seal one hand makes: the held one first (loosely), else the first one-hand seal in the table it makes strictly. */
export function handSeal(hand, seals, knobs, held = null) {
  const one = (id) => handsOf(seals[id]) === 1;
  if (held && seals[held] && one(held) && makes(hand, seals[held], knobs, knobs.loose ?? 0)) return held;
  return Object.keys(seals).find((id) => one(id) && makes(hand, seals[id], knobs)) ?? null;
}

/** The two-hand seal both hands make: the held one first (loosely), else the first in the table. */
export function pairSeal(world, image, seals, knobs, held = null, aspect = 1) {
  const two = (id) => handsOf(seals[id]) === 2;
  if (held && seals[held] && two(held) && makesTwo(world, image, seals[held], knobs, knobs.loose ?? 0, aspect)) return held;
  return Object.keys(seals).find((id) => two(id) && makesTwo(world, image, seals[id], knobs, 0, aspect)) ?? null;
}

/** The seal the hands in view make: a two-hand seal if both make one, else the held one if any hand still makes it,
    else the first hand's that makes one. */
export function sealOf(hands, seals, knobs, held = null, { image = null, aspect = 1 } = {}) {
  const both = (hands?.length ?? 0) >= 2 && image?.length >= 2 ? pairSeal(hands, image, seals, knobs, held, aspect) : null;
  if (both) return both;
  const each = (hands ?? []).map((h) => handSeal(h, seals, knobs, held));
  if (held && each.includes(held)) return held;
  return each.find(Boolean) ?? null;
}
