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

/// A place's name on the map, short where its town stands named beside it: 「邺城 · 香烛铺」 reads
/// 「香烛铺」 when 「邺城」 is on the map too (the town's inner places sit in a ring around it).
export function mapName(name, shown = []) {
  const at = String(name ?? '').indexOf(' · ');
  if (at < 0) return name;
  return shown.includes(name.slice(0, at)) ? name.slice(at + 3) : name;
}

/// Where each label goes beside its dot, so no two names lie over each other or over a dot
/// (古九's tester, 2026-10-15: 邺城 and its five shops, one blot of ink). Greedy, in the order given
/// (the caller ranks here and the roads first; `rank` per dot, lower first): right, then left, above, below — inside the map —
/// else no label (the dot stays, its name its title). Sizes in the card's pixels at `width`
/// (12px type; a Latin letter about half a character). Returns 'r' | 'l' | 'a' | 'b' | null per dot.
export function placeLabels(dots, { width = 560, height = 420 } = {}) {
  // A name may lie over a dot of lower rank (later in the order), never over one of its own rank or higher:
  // the town's name over its shops' dots, not a shop's name over the town's.
  const rank = dots.map((d, i) => d.rank ?? i);
  const placed = dots.map((d, i) => ({ x: (d.left / 100) * width - 5, y: (d.top / 100) * height - 5, w: 10, h: 10, rank: rank[i] }));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const fits = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= width && r.y + r.h <= height;
  const out = [];
  dots.forEach((d, i) => {
    const x = (d.left / 100) * width, y = (d.top / 100) * height;
    const text = String(d.name ?? '');
    const w = [...text].reduce((n, c) => n + (/[\u0000-ɏ]/.test(c) ? 6.5 : 12), 8), h = 16;
    const tries = { r: { x: x + 7, y: y - h / 2, w, h }, l: { x: x - 7 - w, y: y - h / 2, w, h }, a: { x: x - w / 2, y: y - 7 - h, w, h }, b: { x: x - w / 2, y: y + 7, w, h } };
    const order = d.flip ? ['l', 'r', 'a', 'b'] : ['r', 'l', 'a', 'b'];
    const side = order.find((k) => fits(tries[k]) && !placed.some((p, j) => j !== i && (p.rank == null || p.rank <= rank[i]) && hit(p, tries[k])));
    if (side) placed.push({ ...tries[side], rank: null });
    out.push(side ?? null);
  });
  return out;
}
