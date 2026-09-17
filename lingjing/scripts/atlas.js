// atlas.js — the part of the world map a card shows. Every position is a
// fraction of the map ([x, y], 0..1); `aspect` is the map's width over its
// height, so a frame is measured in the map's own pixels when it is drawn.

const PAD = 0.035; //      around the places, as a fraction of the map's width
const MIN_W = 0.14; //     a province never zooms in closer than this
const WIDEST = 1.9; //     the frame's shape on the card, width over height
const TALLEST = 1.2;

/// The frame around `points` — padded, never too close, shaped for a card,
/// and inside the map. Returns {x, y, w, h}, fractions of the map.
export function frameOf(points, aspect) {
  if (!points.length) return { x: 0, y: 0, w: 1, h: 1 };
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  let x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD;
  let y0 = Math.min(...ys) - PAD * aspect, y1 = Math.max(...ys) + PAD * aspect;
  let w = Math.max(x1 - x0, MIN_W), h = Math.max(y1 - y0, MIN_W * aspect / WIDEST);
  // The shape in the map's pixels: grow the short side about the middle.
  const shape = (w * aspect) / h;
  if (shape > WIDEST) h = (w * aspect) / WIDEST;
  if (shape < TALLEST) w = (h * TALLEST) / aspect;
  w = Math.min(w, 1); h = Math.min(h, 1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const clamp = (v, span) => Math.min(Math.max(v, 0), 1 - span);
  return { x: clamp(cx - w / 2, w), y: clamp(cy - h / 2, h), w, h };
}

/// A map position within a frame, as percentages of the card's box.
export function within(frame, [x, y]) {
  return { left: ((x - frame.x) / frame.w) * 100, top: ((y - frame.y) / frame.h) * 100 };
}

/// Whether a position shows inside the frame.
export const inside = (frame, p) => p[0] >= frame.x && p[0] <= frame.x + frame.w && p[1] >= frame.y && p[1] <= frame.y + frame.h;
