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

const JOINT = { cmc: 0, mcp: 0, ip: 2, pip: 1, dip: 2, tip: 3 };

/** The hand a one-hand rule asks for (worlds/jiuding/levels/jieyin.json `seals`, or a two-hand seal's `each` · `a` ·
    `b`): the thumb onto the fingertip a `near` names (that finger bent to meet it), or onto the joint a `nearest`
    names (the finger straight, the thumb laid on it), else tucked over folded fingers, else spread. */
export function poseOf(seal) {
  const onThumb = (pairs) => (pairs ?? []).find(([a, b]) => a === 'thumb.tip' || b === 'thumb.tip');
  const pair = onThumb(seal.near) ?? onThumb((seal.nearest ?? []).map(([a, b]) => [a, b]));
  const target = pair ? (pair[0] === 'thumb.tip' ? pair[1] : pair[0]) : null;
  const [finger, joint] = target ? target.split('.') : [];
  const tog = (seal.near ?? []).find(([a, b]) => a !== 'thumb.tip' && b !== 'thumb.tip');
  const base = { curl: seal.curl ?? [], together: tog ? tog.map((p) => p.split('.')[0]) : null };
  if (!target || joint === 'tip') return buildHand({ ...base, pinch: finger ?? null });
  const open = buildHand(base), j = open[1 + FINGERS.indexOf(finger) * 4 + 4 + JOINT[joint]];
  return buildHand({ ...base, thumbTo: [j.x - 0.3, j.y, j.z - 0.6] });
}

/* ── Two hands, as the picture shows them ── */

const mirror = (hand) => hand.map(({ x, y, z }) => ({ x: -x, y, z }));
const spin = (hand, deg) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return hand.map(({ x, y, z }) => ({ x: x * c - y * s, y: x * s + y * c, z })); };
const shift = (hand, dx, dy) => hand.map(({ x, y, z }) => ({ x: x + dx, y: y + dy, z }));
const HAND_LEN = 9.52; // the template's hand-length (wrist → middle root), cm

/** Both hands of a two-hand seal, by its `layout` (hand-lengths, the picture's y down): `{ dx, dy }` where b's wrist
    stands from a's, `turn: [a°, b°]`, `mirror` (b is the other hand), or `touch: [p, q]` — two mirrored hands whose
    p and q meet on the middle line (三角: index tips and thumb tips). Answers { world: [a, b], image: [a, b] } — the
    image in centimetres on an even frame (aspect 1); a one-hand seal answers its one hand in both. */
export function posesOf(seal) {
  if (seal.hands !== 2) { const h = poseOf(seal); return { world: [h], image: [h] }; }
  const L = seal.layout ?? {};
  let a = poseOf(seal.a ?? seal.each ?? {}), b = poseOf(seal.b ?? seal.each ?? {});
  if (L.mirror || L.touch) b = mirror(b);
  const world = [a, b];
  if (L.touch) {
    const [p, q] = L.touch.map((n) => a[pointOf(n)]);
    const deg = (Math.atan2(p.x - q.x, -(p.y - q.y)) * 180) / Math.PI; // turn a so q → p points straight up
    let ia = spin(a, -deg);
    ia = shift(ia, -(ia[pointOf(L.touch[0])].x), 0);
    return { world, image: [ia, mirror(ia)] };
  }
  const [ta = 0, tb = 0] = L.turn ?? [];
  return { world, image: [spin(a, ta), shift(spin(b, tb), (L.dx ?? 0) * HAND_LEN, (L.dy ?? 0) * HAND_LEN)] };
}
const pointOf = (name) => { if (name === 'wrist') return 0; const [f, j] = name.split('.'); return f === 'thumb' ? 1 + ['cmc', 'mcp', 'ip', 'tip'].indexOf(j) : 1 + FINGERS.indexOf(f) * 4 + 4 + ['mcp', 'pip', 'dip', 'tip'].indexOf(j); };

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
export { BONES };

/** A seal's icon: its pose (both hands for a two-hand seal) as a small SVG drawing (x, y only), in `currentColor`. */
export function iconSvg(seal, size = 40) {
  const hands = posesOf(seal).image, all = hands.flat(), xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, hh = Math.max(...ys) - y0, s = Math.max(w, hh) + 3;
  const k = s / 22; // strokes keep one weight whatever the drawing's span
  const X = (p) => (p.x - x0 + (s - w) / 2).toFixed(2), Y = (p) => (p.y - y0 + (s - hh) / 2).toFixed(2);
  const lines = hands.map((h) => BONES.map(([a, b]) => `<line x1="${X(h[a])}" y1="${Y(h[a])}" x2="${X(h[b])}" y2="${Y(h[b])}"/>`).join('')).join('');
  const tips = hands.map((h) => [4, 8, 12, 16, 20].map((i) => `<circle cx="${X(h[i])}" cy="${Y(h[i])}" r="${(0.75 * k).toFixed(2)}"/>`).join('')).join('');
  return `<svg class="jy-hand" viewBox="0 0 ${s.toFixed(2)} ${s.toFixed(2)}" width="${size}" height="${size}" aria-hidden="true">`
    + `<g stroke="currentColor" stroke-width="${(0.9 * k).toFixed(2)}" stroke-linecap="round" fill="none">${lines}</g><g fill="currentColor">${tips}</g></svg>`;
}
