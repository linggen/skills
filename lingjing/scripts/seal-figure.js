// seal-figure.js — a seal's gesture figure as plain geometry (师父传印, 2026-11-11): the hand pose.js builds from the seal's own
// rule, as strokes in a 0…100 box, so a card drawn on a canvas (seal-share.js) and the phone's painter (the 印谱 sheet,
// Dart) draw the same figure the page's SVG icon (pose.js iconSvg) does. Pure; no DOM.
//
//   figureOf(seal) → { hands: [ { lines: [[x1, y1, x2, y2, w]…], poly: [[x, y]…], dots: [[x, y, r]…] } … ] }
//   (every number in the 100-box; `w` a stroke's width, `r` a dot's radius; the palm `poly` is a wash.)
import { BONES, posesOf } from './games/jieyin/pose.js';

const HAND_LEN = 9.52;
const PALM = [0, 1, 5, 9, 13, 17];
const ROOTS = new Set([1, 5, 9, 13, 17]);
const widthOf = ([a, b]) => (a === 0 || ROOTS.has(b) ? 0.2 : [0.16, 0.13, 0.1][((b - 1) % 4) - 1]);
const r1 = (n) => Math.round(n * 10) / 10;

export function figureOf(seal) {
  if (!seal) return { hands: [] };
  // As the player sees it — mirrored, like pose.js iconSvg (a one-hand right-hand seal is the template drawn as the right).
  const k = seal.hand === 'right' && !(seal.a || seal.b || seal.each) ? 1 : -1;
  const hands = posesOf(seal).image.map((h) => h.map((p) => ({ x: k * p.x, y: p.y })));
  const all = hands.flat(), two = hands.length > 1;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0, hh = Math.max(...ys) - y0, s = Math.max(w, hh) + (two ? 8 : 4);
  const unit = HAND_LEN * (two ? 1.25 : 1), to = 100 / s;
  return {
    hands: hands.map((h) => {
      const m = h.map((p) => ({ x: (p.x - x0 + (s - w) / 2) * to, y: (p.y - y0 + (s - hh - (two ? 4 : 0)) / 2) * to }));
      return {
        poly: PALM.map((i) => [r1(m[i].x), r1(m[i].y)]),
        lines: BONES.map(([a, b]) => [r1(m[a].x), r1(m[a].y), r1(m[b].x), r1(m[b].y), r1(unit * to * widthOf([a, b]))]),
        dots: [4, 8, 12, 16, 20].map((i) => [r1(m[i].x), r1(m[i].y), r1(unit * to * 0.06)]),
      };
    }),
  };
}
