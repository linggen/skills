// fingers.js — the player's hand (MediaPipe's 21 world points, eye.js) as the bone turns of a VRM 1.0 humanoid's hand:
// 施法特写's 3D close-up (texie/vrm.js) bends Yinyue's stand-in fingers with these. Pure, no three.js — the tests read it.
//
// The rig is three-vrm's NORMALIZED humanoid: every bone's rest turn is none, the model faces +Z, its left is +X, the
// arms out along ±X in a T-pose with the palms down (−Y). So a finger bends toward the palm by a turn about Z — plus for
// the right hand (its fingers point −X), minus for the left — and the thumb, which points forward-out, folds across the
// palm by a turn about Y (minus right, plus left) with a little toward the palm.
//
// The player's own right hand drives HER right hand (no mirror): as if she stood where the player stands, facing the
// camera. The camera's frame (x across the picture, y down, z away from the lens) → the rig's: (x, −y, −z).
//
//   curlsOf(hand)            → { thumb: [a, b, c], index: […], middle, ring, little } — each joint's bend, radians (0 straight)
//   fingerTurns(curls, side) → { rightIndexProximal: [x, y, z], … } Euler radians (XYZ) for the 15 finger bones of `side`
//   handTurn(hand, side)     → [x, y, z, w]: the hand's turn in the rig's frame (the world quaternion of the hand bone),
//                              none when the hand is held as in the T-pose
//   sideOf(handed, image)    → 'left' | 'right': which of her hands a player's hand drives

const CHAINS = { thumb: [1, 2, 3, 4], index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], little: [17, 18, 19, 20] };
const BONES = { thumb: ['ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal'], index: ['IndexProximal', 'IndexIntermediate', 'IndexDistal'],
  middle: ['MiddleProximal', 'MiddleIntermediate', 'MiddleDistal'], ring: ['RingProximal', 'RingIntermediate', 'RingDistal'],
  little: ['LittleProximal', 'LittleIntermediate', 'LittleDistal'] };
// How far a joint may bend (radians): a finger's root and middle joints fold to ~90°, the end ~75°; the thumb less.
const MAX = { thumb: [0.9, 0.9, 1.2], finger: [1.6, 1.75, 1.3] };

const sub = (a, b) => [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b)))));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Each finger's three joint bends, from its four points and the wrist (the root joint against wrist → root). */
export function curlsOf(hand) {
  const out = {};
  for (const [f, [a, b, c, d]] of Object.entries(CHAINS)) {
    const w = hand[0], max = f === 'thumb' ? MAX.thumb : MAX.finger;
    const segs = [sub(hand[a], w), sub(hand[b], hand[a]), sub(hand[c], hand[b]), sub(hand[d], hand[c])];
    out[f] = [0, 1, 2].map((i) => clamp(angle(segs[i], segs[i + 1]), 0, max[i]));
  }
  // The root joints: a straight finger still leans a little off the wrist → root line (the palm fans) — take the
  // little finger's lean as none, so an open hand reads straight.
  const lean = 0.12;
  for (const f of ['index', 'middle', 'ring', 'little']) out[f][0] = Math.max(0, out[f][0] - lean);
  return out;
}

/** The 15 finger bones of one hand, as Euler turns (XYZ, radians) on the normalized rig. */
export function fingerTurns(curls, side = 'right') {
  const s = side === 'left' ? -1 : 1, P = side === 'left' ? 'left' : 'right', out = {};
  for (const [f, bones] of Object.entries(BONES)) {
    bones.forEach((b, i) => {
      const a = curls?.[f]?.[i] ?? 0;
      out[`${P}${b}`] = f === 'thumb' ? [0, -s * a * 0.9, s * a * 0.35] : [0, 0, s * a];
    });
  }
  return out;
}

/** Camera frame → the rig's. */
export const toRig = (v) => [v[0], -v[1], -v[2]];

/** A hand's frame: `d` wrist → middle root, `n` the palm normal (wrist → index root × wrist → little root), made square. */
function frameOf(d, a, b) {
  const n0 = norm(cross(a, b)), dd = norm(d);
  const n = norm(sub({ x: n0[0], y: n0[1], z: n0[2] }, { x: dd[0] * dot(n0, dd), y: dd[1] * dot(n0, dd), z: dd[2] * dot(n0, dd) }));
  return [dd, n, cross(dd, n)];
}

/** The rig's hand at rest (T-pose, palm down), in the same frame. */
export function restFrame(side = 'right') {
  const x = side === 'left' ? 1 : -1;
  return frameOf([x, 0, 0], [x, 0, 0.25], [x, 0, -0.35]);
}

/** The player's hand's frame, in the rig's axes. */
export function liveFrame(hand) {
  const r = (i) => toRig(sub(hand[i], hand[0]));
  return frameOf(r(9), r(5), r(17));
}

/** The turn taking frame `a` onto frame `b` (each [d, n, s], orthonormal) — R = B·Aᵀ — as a quaternion [x, y, z, w]. */
export function turnBetween(a, b) {
  const m = [0, 1, 2].map((i) => [0, 1, 2].map((j) => a.reduce((t, _, k) => t + b[k][i] * a[k][j], 0)));
  return quatOf(m);
}

/** A rotation matrix (rows) as a quaternion [x, y, z, w]. */
export function quatOf(m) {
  const tr = m[0][0] + m[1][1] + m[2][2];
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m[2][1] - m[1][2]) * s; y = (m[0][2] - m[2][0]) * s; z = (m[1][0] - m[0][1]) * s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]);
    w = (m[2][1] - m[1][2]) / s; x = 0.25 * s; y = (m[0][1] + m[1][0]) / s; z = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]);
    w = (m[0][2] - m[2][0]) / s; x = (m[0][1] + m[1][0]) / s; y = 0.25 * s; z = (m[1][2] + m[2][1]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]);
    w = (m[1][0] - m[0][1]) / s; x = (m[0][2] + m[2][0]) / s; y = (m[1][2] + m[2][1]) / s; z = 0.25 * s;
  }
  return [x, y, z, w];
}

/** The hand bone's turn in the rig (world) frame: rest → live. */
export const handTurn = (hand, side = 'right') => turnBetween(restFrame(side), liveFrame(hand));

/** Which of her hands a player's hand drives: its handedness (the player's own, eye.js), else by where it is in the
    (unmirrored) picture — the player's right hand shows on the picture's left. */
export const sideOf = (handed, image) => (handed === 'Right' ? 'right' : handed === 'Left' ? 'left' : (image?.[0]?.x ?? 0.5) < 0.5 ? 'right' : 'left');
