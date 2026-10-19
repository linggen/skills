// targets.js — what a throw on the 射鹿 board is aimed at, when it is not the stag (deerarc.js keeps
// the stag). A level names its target by `target.kind`; each kind says how a throw is judged and how
// the target is drawn, so every throw in 卷一 plays on one board (Hanli 2026-10-16: 「投掷类都可以换」):
//   zone — 扔石听声 (00-cave): where the stone comes to rest; deep is the sound he listens for.
//   lu   — 芦苇里那一等 (09-yishui): the 鯥 pinned on the shoal; only the wing root, in the instant it
//          opens as it breathes in, takes the blade; anywhere else the hide turns it.
// And the small geometry the board judges every throw by.
import { n } from './ink.js';

/* ── Geometry ─────────────────────────────────────────────────────────────────────────────── */

function closest(p, q, c) {
  const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / l2)) : 0;
  return [p[0] + dx * t, p[1] + dy * t];
}
/** Segment p–q comes within `r` of point `c`. */
export const segCircle = (p, q, c, r) => { const k = closest(p, q, c); return Math.hypot(k[0] - c[0], k[1] - c[1]) <= r; };
/** Segment p–q (sampled; a step is short) enters the ellipse [cx, cy, rx, ry]. */
export function segEllipse(p, q, [cx, cy, rx, ry]) {
  for (let i = 0; i <= 4; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 4, y = p[1] + ((q[1] - p[1]) * i) / 4;
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) return true;
  }
  return false;
}
/** Segments p–q and a–b come within `r` of each other (sampled along p–q). */
export function segSeg(p, q, a, b, r) {
  for (let i = 0; i <= 4; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 4, y = p[1] + ((q[1] - p[1]) * i) / 4;
    if (segCircle(a, b, [x, y], r)) return true;
  }
  return false;
}

const RAMP = 260;
const ease = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };
const inRange = (x, [a, b]) => x >= Math.min(a, b) && x <= Math.max(a, b);

/* ── zone · 扔石听声: the stone thrown into the cave, judged where it lands ───────────────────── */

const zone = {
  /** Nothing to strike in the air: a stone in a cave is judged where it comes down. */
  hit: () => null,
  /** Deep (`deep` [x0, x1]) is the echo he listens for — clean; `mid` is a dull knock — a hit. */
  land(level, [x]) {
    const z = level.target;
    return inRange(x, z.deep) ? 'clean' : z.mid && inRange(x, z.mid) ? 'body' : null;
  },
  /** The deep of the cave: a faint ring on the floor where a stone must come down. */
  picture(level, s) {
    const [a, b] = level.target.deep, cx = (a + b) / 2, rx = Math.abs(b - a) / 2, y = level.target.floor ?? 252;
    return `<ellipse class="g-tg-deep" cx="${n(cx)}" cy="${n(y - 2)}" rx="${n(rx)}" ry="5"/>`;
  },
  /** The echo: rings going out from where it landed, slow, and the stars over it. */
  burst(s, still) {
    const [x, y] = s.at, rings = still ? [0] : [0, 1, 2];
    return rings.map((i) => {
      const k = still ? 0.6 : Math.max(0, Math.min(1, (s.t - i * 220) / 1100));
      return k > 0 ? `<ellipse class="g-tg-echo" cx="${n(x)}" cy="${n(y - 4)}" rx="${n(8 + k * 70)}" ry="${n(4 + k * 28)}" opacity="${n(1 - k, 2)}"/>` : '';
    }).join('');
  },
};

/* ── lu · 鯥: pinned on the shoal; the wing root opens as it breathes in ────────────────────── */

// In its own frame (facing −x: its ox head toward 孙二狗's board on the left; feet at 0), × `size` —
// fitted to the painted 鯥 (art/games/lu/lu.webp): the barrel, the wing root where the pink shows, the head.
const LU = { body: [0, -21, 34, 16], root: [3, -30], rootR: 9, head: [-28, -11] };

/** Where the 鯥 is at `ms`: its `open` (0 shut … 1 the wing root showing), eased in and out. */
export function luAt(level, ms) {
  const t = level.target, o = t.open, u = Math.max(0, ms) % o.every, w = u - (o.every - o.for);
  return { x: t.x, size: t.size ?? 1.6, open: w < 0 ? 0 : ease(Math.min(w, o.for - w) / RAMP) };
}

const lu = {
  /** The wing root while it shows takes the blade — clean; the hide anywhere else turns it. */
  hit(level, ms, a, b, groundAt) {
    const d = luAt(level, ms), gy = groundAt(d.x), k = d.size;
    const local = ([x, y]) => [(x - d.x) / k, (y - gy) / k];
    const [p, q] = [local(a), local(b)];
    if (d.open > 0.5 && segCircle(p, q, LU.root, LU.rootR)) return 'clean';
    return segEllipse(p, q, LU.body) || segCircle(p, q, LU.head, 12) ? 'glance' : null;
  },
  land: () => null,
  /** In ink until it is painted: the barrel, the ox head and horns, the bat wing (folded, or half
      lifted with the pink root showing), the snake tail, and 阿禾's brambles round its hind legs. */
  picture(level, s, groundAt, sprite) {
    const d = luAt(level, s.clock), gy = groundAt(d.x), o = d.open;
    if (s.art?.lu && sprite) return paintedLu(s.art.lu, d, gy, sprite, s.art.lu_folded ?? null, String(s.seed ?? 'lu').replace(/[^a-z0-9]/gi, '').slice(-10) || 'lu');
    const wingTip = [-10 + o * 6, -62 - o * 26];
    const wing = `<path class="g-tg-wing" d="M${LU.root[0]} ${LU.root[1]} Q${n(-20)} ${n(-50 - o * 20)} ${n(wingTip[0])} ${n(wingTip[1])} Q${n(16 + o * 10)} ${n(-48 - o * 10)} ${n(30)} ${n(-38)}Z"/>`;
    const root = o > 0.05 ? `<ellipse class="g-tg-root" cx="${LU.root[0]}" cy="${LU.root[1]}" rx="${n(3 + o * 6)}" ry="${n(2 + o * 4)}" opacity="${n(o, 2)}"/>` : '';
    const body = `<ellipse class="g-tg-body" cx="${LU.body[0]}" cy="${LU.body[1]}" rx="${LU.body[2]}" ry="${LU.body[3]}"/>`;
    const head = `<path class="g-tg-head" d="M-28 -40 Q-46 -50 -54 -36 Q-50 -26 -32 -26Z"/><path class="g-tg-horn" d="M-40 -46 q-6 -10 2 -16 M-34 -46 q2 -10 10 -12"/>`;
    const legs = '<path class="g-tg-leg" d="M-22 -18 L-24 0 M-12 -16 L-10 0 M14 -16 L12 0 M24 -18 L28 0"/>';
    const tail = '<path class="g-tg-tail" d="M32 -30 Q52 -28 50 -12 Q48 2 62 0"/>';
    const thorns = '<path class="g-tg-thorn" d="M8 0 q6 -10 12 -2 q6 -12 12 -2 q4 -8 10 0 M10 -4 l-3 -3 M22 -6 l2 -4 M34 -5 l3 -3"/>';
    return `<g class="g-tg-lu" transform="translate(${n(d.x)} ${n(gy)}) scale(${n(d.size, 2)})">${tail}${legs}${body}${wing}${root}${head}${thorns}</g>`;
  },
};

/** The painted 鯥 (games.json art `lu`, in its own frame like the stag's poses), breathing (Hanli 10-19:
    「翅膀也不张开」 — it was one sprite, wings always spread): its body with the wings folded (`lu_folded`),
    and over it the spread wings (`lu`, cut to `wing` [x0, y0, x1, y1]) lifting out from the root as it
    breathes in — up from flat along the back, the pink root showing — and folding again. With no folded
    painting, the spread one alone, its wings still lifting. */
export const LU_WING = [-10, -72, 62, -26];
function paintedLu(a, d, gy, sprite, folded = null, clip = 'lu') {
  const [rx, ry] = a.root ?? LU.root, o = d.open, [x0, y0, x1, y1] = a.wing ?? LU_WING;
  const glow = o > 0.05 ? `<ellipse class="g-tg-root" cx="${rx}" cy="${ry}" rx="${n(3 + o * 6)}" ry="${n(2 + o * 4)}" opacity="${n(o, 2)}"/>` : '';
  // Shut, the wings lie flat along the back (squashed to the root and turned down a little); open, as painted.
  const lift = `translate(${rx} ${ry}) rotate(${n(14 * (1 - o))}) scale(${n(0.7 + 0.3 * o, 3)} ${n(0.25 + 0.75 * o, 3)}) translate(${-rx} ${-ry})`;
  const id = `g-tg-wing-${clip}`;
  const wings = `<clipPath id="${id}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath>`
    + `<g class="g-tg-wings" transform="${lift}"><g clip-path="url(#${id})">${sprite(a, folded ? Math.min(1, o * 1.6) : 1)}</g></g>`;
  const body = folded ? sprite(folded, 1) : `<clipPath id="${id}-b"><path d="M-200 -200 H200 V200 H-200Z M${x0} ${y0} V${y1} H${x1} V${y0}Z" clip-rule="evenodd"/></clipPath><g clip-path="url(#${id}-b)">${sprite(a, 1)}</g>`;
  return `<g class="g-tg-lu" data-open="${n(o, 2)}" transform="translate(${n(d.x)} ${n(gy)}) scale(${n(d.size, 2)})">${body}${wings}${glow}</g>`;
}

/** The kinds, by `level.target.kind`. */
export const TARGETS = { zone, lu };
export const targetOf = (level) => (level?.target ? TARGETS[level.target.kind] ?? null : null);
