// view.js — 守山门's camera: the road seen from behind the wall, looking up it (pseudo-3D). The engine's road (z 0 at
// the wall … TOP at the far end; u −1 … 1 across) maps to the 540×960 board by one perspective: a thing `z` up the road
// is drawn at scale s(z) = D / (D + z), its y between the wall line and the horizon by the same s, its x narrowed by it.

export const W = 540, H = 960;
export const CX = W / 2;
export const Y0 = 800;          // the wall's line: z = 0
export const HY = 128;          // the horizon (z → ∞)
export const HALF = 250;        // the road's half-width at the wall (px)
export const D = 60;            // the camera's distance (z units): s(TOP = 100) ≈ 0.38

export const sOf = (z) => D / (D + Math.max(-D * 0.6, z));
export const yOf = (z) => HY + (Y0 - HY) * sOf(z);
export const xOf = (u, z) => CX + u * HALF * sOf(z);
/** The road's z under a screen y (for the ground painting), and the u under a screen x at the wall (the aim). */
export const zOfY = (y) => D * ((Y0 - HY) / Math.max(1e-3, y - HY) - 1);
export const uOfX = (x) => (x - CX) / HALF;
