// view.js — 守山门's camera: the road seen from behind the wall, looking up it (pseudo-3D). The engine's road (z 0 at
// the wall … TOP at the far end; u −1 … 1 across) maps to the board by one perspective: a thing `z` up the road
// is drawn at scale s(z) = D / (D + z), its y between the wall line and the horizon by the same s, its x narrowed by it.
//
// Two boards, picked once at the start (setBoard, before the Phaser game is made): the phone's portrait 540×960, and a
// wider 760×960 for a landscape window (Hanli 10-21: 「目前画面有点拥挤, 可以宽一些吗」) — the road spans more of it and
// the cards fill less of their column, while the beasts, the squad and the numbers keep their pixel sizes, so the
// three columns breathe. The height and every y are the same on both.

export const BOARDS = {
  narrow: { W: 540, HALF: 250, CARD: 0.86 },
  wide: { W: 760, HALF: 340, CARD: 0.74 },
};
export let W = BOARDS.narrow.W;
export let CX = W / 2;
export let HALF = BOARDS.narrow.HALF; // the road's half-width at the wall (px)
export let CARD = BOARDS.narrow.CARD;  // a card's width, a share of its column's
export const H = 960;
export const Y0 = 800;          // the wall's line: z = 0
export const HY = 128;          // the horizon (z → ∞)
export const D = 60;            // the camera's distance (z units): s(TOP = 100) ≈ 0.38

/** Pick the board (`wide` or the phone's `narrow`); returns its size. */
export function setBoard(wide) {
  const b = wide ? BOARDS.wide : BOARDS.narrow;
  W = b.W; CX = W / 2; HALF = b.HALF; CARD = b.CARD;
  return { W, H };
}

export const sOf = (z) => D / (D + Math.max(-D * 0.6, z));
export const yOf = (z) => HY + (Y0 - HY) * sOf(z);
export const xOf = (u, z) => CX + u * HALF * sOf(z);
/** The road's z under a screen y (for the ground painting), and the u under a screen x at the wall (the aim). */
export const zOfY = (y) => D * ((Y0 - HY) / Math.max(1e-3, y - HY) - 1);
export const uOfX = (x) => (x - CX) / HALF;
