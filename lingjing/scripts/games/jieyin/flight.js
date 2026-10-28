// flight.js — how a 结印 spell LOOKS in flight, one place for the three 兽潮 kits (守墙关 · 守山门 · 守炉), which each
// draw it in their own engine (Phaser, Phaser, canvas). Pure: numbers in, a point out.
//
// Hanli 10-28 (of 守墙关 after the 结印 box moved aside): 「游戏画面里要有特效啊, 剑诀可以出来一把飞剑, 飞一圈打中怪物.
// 显示伤害. 给玩家成就感」. 剑诀's 飞剑 (and 金刃, the blade) rises from 小满, sweeps one wide loop over the field, and dives
// into the beast; 冰锥 is a fan of ice shards; 火弹 a fireball in a high arc. The damage is never decided here — a
// kit shows the number its own cast reports.
//
//   lookOf(move)                  → { kind: 'loop' | 'volley' | 'arc', art, tint, size, fly } — a move's flight (null: none)
//   loopAt(a, b, k, { w, h })     → { x, y, rot } on the sword's loop from `a` (the hand) to `b` (the beast), k 0…1
//   arcAt(a, b, k, lift)          → { x, y } on a lob (the fireball)
//   fanAt(a, b, k, i, n, spread)  → { x, y, rot } shard i of n of a volley
//
// `rot` is the heading in radians (atan2 of the path). feijian.webp's blade points up-right (−45°): a sprite is drawn at
// `rot + π/4`.

/** A move's look. `fly`: seconds in the air for a kit whose damage waits for the landing (data may override). */
const LOOKS = {
  feijian: { rgb: '143,212,255', kind: 'loop', art: 'feijian', tint: 0x8fd4ff, size: 150, fly: 0.95 },
  jinren: { rgb: '255,226,150', kind: 'loop', art: 'jinren', tint: 0xfff2c0, size: 112, fly: 0.95, spin: true },
  bingzhui: { rgb: '159,224,255', kind: 'volley', art: 'bingzhui', tint: 0x9fe0ff, size: 86, fly: 0.7, n: 3 },
  huodan: { rgb: '255,150,60', kind: 'arc', art: 'huodan', tint: 0xffa040, size: 112, fly: 0.7 },
  huodan4: { rgb: '255,110,50', kind: 'arc', art: 'huodan', tint: 0xff7a3a, size: 150, fly: 0.8 },
};
export const lookOf = (move) => LOOKS[move] ?? null;
/** The moves whose art a kit loads (games/jieyin/art/<art>.webp). */
export const lookArts = () => [...new Set(Object.values(LOOKS).map((l) => l.art))];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (k) => 0.55 * k + 0.45 * k * k; // slow to rise, quick in the dive

function catmull(pts, u) {
  const n = pts.length - 1, f = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
  return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) };
}

/** The sword's way: up and out to one side of 小满, across over the field, round the far side and down onto the beast —
    one wide loop (the way swings to the side with more room). */
export function loopPath(a, b, { w, h }) {
  const side = a.x > w / 2 ? -1 : 1, cx = (a.x + b.x) / 2;
  const top = clamp(Math.min(a.y, b.y) - 0.34 * h, 0.07 * h, 0.5 * h);
  const px = (x) => clamp(x, 0.06 * w, 0.94 * w);
  return [
    a,
    { x: px(a.x + side * 0.12 * w), y: a.y - 0.2 * h },
    { x: px(a.x + side * 0.34 * w), y: (a.y + top) / 2 },
    { x: px(cx + side * 0.18 * w), y: top },
    { x: px(cx - side * 0.3 * w), y: top + 0.1 * h },
    { x: px(b.x - side * 0.2 * w), y: (top + b.y) / 2 },
    { x: px(b.x + side * 0.05 * w), y: Math.min(b.y - 0.12 * h, (top + b.y) / 2 + 0.1 * h) },
    b,
  ];
}

export function loopAt(a, b, k, box) {
  const pts = loopPath(a, b, box), u = ease(clamp(k, 0, 1)), e = 0.015;
  const p = catmull(pts, u), q = catmull(pts, clamp(u + e, 0, 1)), r = catmull(pts, clamp(u - e, 0, 1));
  const dx = q.x - r.x, dy = q.y - r.y;
  return { x: p.x, y: p.y, rot: Math.atan2(dy, dx) };
}

export function arcAt(a, b, k, lift = 120) {
  const u = clamp(k, 0, 1);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * lift };
}

/** Shard i of n: fanned out from the hand, closing on the beast. */
export function fanAt(a, b, k, i, n = 3, spread = 90) {
  const u = clamp(k, 0, 1), off = (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = Math.sin(u * Math.PI) * spread * off; // wide in the middle, all of them on the beast at the end
  return { x: a.x + dx * u + (-dy / len) * bend, y: a.y + dy * u + (dx / len) * bend - Math.sin(u * Math.PI) * 40, rot: Math.atan2(dy, dx) + off * 0.35 * (1 - u) };
}
