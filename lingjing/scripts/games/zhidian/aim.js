// aim.js — where the 准星 stands (隔空指点, games/zhidian.js). Pure: a hand in the camera's picture (MediaPipe's
// image points, 0…1 of the frame) in, a point on the field (0…1 each way) out. Every number is the level's `aim`
// (worlds/jiuding/levels/zhidian.json).
//
//   aimPoint(hand, aim)            → { x, y } in the picture: the midpoint of `aim.from` (the two fingertips)
//   toField(p, aim)                → { x, y } on the field: mirrored (as in a mirror), the picture's inner `box`
//                                    stretched to the whole field, clamped
//   follow(shown, target, dt, aim) → the 准星 after `dt` ms: still inside `dead`, else eased over `tauMs`
import { pointIndex } from '../jieyin/judge.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function aimPoint(hand, aim) {
  const pts = aim.from.map((n) => hand[pointIndex(n)]);
  return { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
}

export function toField(p, aim) {
  const [x0, y0, x1, y1] = aim.box;
  return { x: clamp01((1 - p.x - x0) / (x1 - x0)), y: clamp01((p.y - y0) / (y1 - y0)) };
}

/** The picture point that lands on field point `f` — toField's inverse (the dev feed aims with it). */
export function fromField(f, aim) {
  const [x0, y0, x1, y1] = aim.box;
  return { x: 1 - (x0 + f.x * (x1 - x0)), y: y0 + f.y * (y1 - y0) };
}

export function follow(shown, target, dt, aim) {
  if (!target) return shown;
  if (!shown) return { ...target };
  const dx = target.x - shown.x, dy = target.y - shown.y;
  if (Math.hypot(dx, dy) < aim.dead) return shown;
  const k = 1 - Math.exp(-Math.max(0, dt) / aim.tauMs);
  return { x: shown.x + dx * k, y: shown.y + dy * k };
}
