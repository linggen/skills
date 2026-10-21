// pose.js — a made-up hand in MediaPipe's 21 points (centimetres, wrist at 0, fingers up = −y, toward the camera = −z),
// built from a few words: which fingers are straight, folded, or pinched by the thumb. Two uses: each seal's icon is
// its own rule drawn as a hand (so the icon shows exactly what the judge wants), and the tests' hands.

const FINGERS = ['index', 'middle', 'ring', 'pinky'];
const ROOT = { index: [-2.4, -9, 0], middle: [-0.6, -9.5, 0], ring: [1.2, -9, 0], pinky: [2.8, -8, 0] };
const LEN = { index: [3.8, 2.4, 1.9], middle: [4, 2.5, 2], ring: [3.8, 2.4, 1.9], pinky: [3.2, 2, 1.6] };

const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
const turn = ([x, y, z], deg) => { const r = (deg * Math.PI) / 180; return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r), z]; };
const Z = [0, 0, -1];

/** A finger's mcp · pip · dip · tip: 'ext' straight along `dir`, 'curl' folded into the palm, 'pinch' bent to meet the thumb. */
function finger(name, how, dir) {
  const m = ROOT[name], [a, b, c] = LEN[name];
  if (how === 'curl') {
    const p = add(add(m, dir, a * 0.4), Z, a * 0.9), d = add(add(p, dir, -b * 0.6), Z, b * 0.6);
    return [m, p, d, add(add(d, dir, -c * 0.9), Z, -c * 0.3)];
  }
  if (how === 'pinch') {
    const p = add(add(m, dir, a * 0.8), Z, a * 0.6), d = add(add(p, dir, b * 0.3), Z, b * 0.9);
    return [m, p, d, add(add(d, dir, -c * 0.3), Z, c * 0.9)];
  }
  const p = add(m, dir, a), d = add(p, dir, b);
  return [m, p, d, add(d, dir, c)];
}

/** The thumb's cmc · mcp · ip · tip, its tip at `to` (or spread out when none). */
function thumb(to) {
  const cmc = [-2.2, -2, 0];
  if (!to) return [cmc, [-4.6, -3.8, 0], [-6.4, -5.4, 0], [-8, -6.6, 0]];
  const along = (k, out) => add(add(cmc, add(to, cmc, -1), k), [-out, 0, 0]); // bowed outward, as a thumb bends
  return [cmc, along(0.4, 1.4), along(0.72, 0.9), to];
}

/** A hand: { ext: [...], curl: [...], pinch: finger | null, together: [finger, finger] | null, spread: degrees,
    thumbTo: [x, y, z] (where the thumb tip goes; else onto the pinched tip, over the folded fingers, or spread) }.
    Fingers not named are straight. Answers 21 {x, y, z}. */
export function buildHand({ curl = [], pinch = null, together = null, spread = 6, thumbTo = null } = {}) {
  const pts = {};
  FINGERS.forEach((f, i) => {
    const fan = together?.includes(f) ? (together.indexOf(f) ? -1 : 1) * 1 : (i - 1.5) * spread;
    const dir = unit(turn([ROOT[f][0] * 0.08, -1, 0], fan));
    pts[f] = finger(f, f === pinch ? 'pinch' : curl.includes(f) ? 'curl' : 'ext', dir);
  });
  const folded = curl.filter((f) => f !== pinch);
  const to = thumbTo ?? (pinch ? add(pts[pinch][3], [-0.4, 0.2, -0.3])
    : folded.length ? add(pts[folded[0]][2], [0, 0, -1.2]) : null);
  const all = [[0, 0, 0], ...thumb(to), ...FINGERS.flatMap((f) => pts[f])];
  return all.map(([x, y, z]) => ({ x, y, z }));
}

/** The hand a seal's rule asks for (worlds/jiuding/levels/jieyin.json `seals`). */
export function poseOf(seal) {
  const pair = (seal.near ?? []).find(([a, b]) => a === 'thumb.tip' || b === 'thumb.tip');
  const pinch = pair ? (pair[0] === 'thumb.tip' ? pair[1] : pair[0]).split('.')[0] : null;
  const tog = (seal.near ?? []).find(([a, b]) => a !== 'thumb.tip' && b !== 'thumb.tip');
  return buildHand({ curl: seal.curl ?? [], pinch, together: tog ? tog.map((p) => p.split('.')[0]) : null });
}

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export { BONES };

/** A seal's icon: its pose as a small SVG hand (x, y only), in `currentColor`. */
export function iconSvg(seal, size = 40) {
  const h = poseOf(seal), xs = h.map((p) => p.x), ys = h.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, hh = Math.max(...ys) - y0, s = Math.max(w, hh) + 3;
  const X = (p) => (p.x - x0 + (s - w) / 2).toFixed(2), Y = (p) => (p.y - y0 + (s - hh) / 2).toFixed(2);
  const lines = BONES.map(([a, b]) => `<line x1="${X(h[a])}" y1="${Y(h[a])}" x2="${X(h[b])}" y2="${Y(h[b])}"/>`).join('');
  const tips = [4, 8, 12, 16, 20].map((i) => `<circle cx="${X(h[i])}" cy="${Y(h[i])}" r="0.75"/>`).join('');
  return `<svg class="jy-hand" viewBox="0 0 ${s.toFixed(2)} ${s.toFixed(2)}" width="${size}" height="${size}" aria-hidden="true">`
    + `<g stroke="currentColor" stroke-width="0.9" stroke-linecap="round" fill="none">${lines}</g><g fill="currentColor">${tips}</g></svg>`;
}
