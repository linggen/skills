// fx-alive.js — the paintings breathe (design.md § 画面效果; Hanli 2026-10-20: 「start the
// Pixi pass after 砸寨」). A still painting on the stage — the place's, the sky's, a beast's
// 出场 — drawn on a PixiJS MeshPlane whose grid bends a little where the painting has
// something that moves: trees and grass sway from their roots, cloth from where it hangs,
// water shimmers, smoke and steam and flame waver up, mist drifts, a beast breathes. Ink, not
// a cartoon: a tree's crown moves a few pixels.
//
// Which painting moves, and where, is data (worlds/<w>/backdrops.json `alive`, keyed by the
// painting's path; `alive_creature` for every beast's painting without its own row), never a
// list here. The motion itself is pure (motionAt — the tests drive it); the drawing is
// one Application per painting on the stage, destroyed when the painting goes. A painting is
// not a moment: it lives as long as it stands, so its canvas runs at 30 fps, sleeps while it is
// covered (a set piece over the stage) or the tab is hidden, and is gone with the painting.
// The CSS still stays under the canvas: no WebGL, reduced motion, nothing declared — the
// still is all there is, and a frame the canvas misses shows the same painting.
import { glOK, loadPixi } from './fx.js';

/// What may move, and how far at full strength (a share of the painting's width).
export const KINDS = { sway: 0.007, cloth: 0.004, water: 0.0018, rise: 0.006, drift: 0.012, breathe: 0.008 };
/// The grid the painting is drawn on: fine enough for a ripple, cheap enough for a phone.
export const GRID = { x: 64, y: 44 };
const FPS = 30;
const TAU = Math.PI * 2;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a || 1e-6)); return t * t * (3 - 2 * t); };
const okBox = (b) => Array.isArray(b) && b.length === 4 && b.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) && b[0] < b[2] && b[1] < b[3];

/// One painting's moving parts: [{kind, box: [x0, y0, x1, y1] (0–1 of the painting), amp}].
/// `art` the painting's path as the world names it ("art/places/heisong.webp"); `creature`: a
/// beast's painting, which takes `alive_creature` when it has no row of its own. Bad rows drop.
export function aliveOf(table, art, { creature = false } = {}) {
  const rows = table?.alive?.[art] ?? (creature ? table?.alive_creature : null);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => Object.hasOwn(KINDS, r?.kind) && okBox(r.box))
    .map((r) => ({ kind: r.kind, box: r.box, amp: Number.isFinite(r.amp) ? Math.min(2, Math.max(0, r.amp)) : 1 }));
}

/* How much of a region a point is in: 1 inside, easing to 0 across a feather at the edges.
   `open` names an edge left hard (the root a tree sways from carries no feather: its height does). */
function weightIn([x0, y0, x1, y1], u, v, open = '') {
  if (u < x0 || u > x1 || v < y0 || v > y1) return 0;
  const fx = (x1 - x0) * 0.18, fy = (y1 - y0) * 0.18;
  const wx = smooth(x0, x0 + fx, u) * (1 - smooth(x1 - fx, x1, u));
  const top = open === 'top' ? 1 : smooth(y0, y0 + fy, v);
  const bottom = open === 'bottom' ? 1 : 1 - smooth(y1 - fy, y1, v);
  return wx * top * bottom;
}

/* Each kind's bend at (u, v), time t (s), before its weight: [dx, dy] as shares of width/height. */
const MOVES = {
  // A tree or grass from its root (the box's bottom): the crown moves most, with the wind's lean.
  sway: ([, y0, , y1], u, v, t, w) => {
    const h = clamp01((y1 - v) / (y1 - y0)), bend = h * h;
    const s = Math.sin(TAU * t / 5.2 + u * 5) + 0.35 * Math.sin(TAU * t / 2.1 + u * 8.5);
    const k = 0.6 + w.force;
    return [bend * k * (s + w.sign * w.force * 0.8), -0.25 * bend * Math.abs(s) * k];
  },
  // Cloth from where it hangs (the box's top): slower, the hem moves most.
  cloth: ([, y0, , y1], u, v, t, w) => {
    const h = clamp01((v - y0) / (y1 - y0)), bend = h * h;
    return [bend * (Math.sin(TAU * t / 6.5 + v * 4) + 0.3 * Math.sin(TAU * t / 2.7 + u * 6)) * (0.7 + w.force * 0.6), 0];
  },
  // Water: a shimmer across, a slow swell along.
  water: (b, u, v, t) => [Math.sin(v * 140 + t * 1.7 + Math.sin(u * 9) * 2), 0.5 * Math.sin(u * 60 - t * 1.2)],
  // Smoke, steam, flame from its source (the box's bottom): wavering more the higher it goes.
  rise: ([, y0, , y1], u, v, t) => {
    const h = clamp01((y1 - v) / (y1 - y0));
    return [h * Math.sin(v * 30 + t * 2.4 + u * 4), -0.5 * h * (0.5 + 0.5 * Math.sin(t * 1.3 + u * 7))];
  },
  // Mist and cloud: a slow drift and back.
  drift: (b, u, v, t, w) => [Math.sin(TAU * t / 14 + u * 2) + w.sign * w.force * 0.5, 0.2 * Math.sin(TAU * t / 9 + u * 3)],
  // A body breathing, its feet where they stand (the box's bottom): the chest swells and settles.
  breathe: ([x0, , x1, y1], u, v, t) => {
    const s = 0.5 + 0.5 * Math.sin(TAU * t / 4.8);
    return [(u - (x0 + x1) / 2) * s, (v - y1) * s * 0.6];
  },
};
const OPEN = { sway: 'bottom', rise: 'bottom', breathe: 'bottom', cloth: 'top' };

/* Each vertex's share of each region it lies in: fixed for a painting, so a frame only turns the waves. */
function weightsAt(regions, u, v) {
  const out = [];
  for (const r of regions) {
    const wt = weightIn(r.box, u, v, OPEN[r.kind]);
    if (wt) out.push([MOVES[r.kind], r.box, KINDS[r.kind] * r.amp * wt]);
  }
  return out;
}
const bendBy = (parts, u, v, t, wind) => {
  let dx = 0, dy = 0;
  for (const [move, box, a] of parts) {
    const [mx, my] = move(box, u, v, t, wind);
    dx += mx * a;
    dy += my * a;
  }
  return [dx, dy];
};

/// Where the point (u, v) of the painting is at time t (s): [dx, dy], shares of its width and
/// height. `wind`: {force 0–1, sign ±1} (atmos.js windVars — the stage's own wind).
export const motionAt = (regions, u, v, t, wind = { force: 0.3, sign: -1 }) => bendBy(weightsAt(regions, u, v), u, v, t, wind);

/// The grid vertices any region moves, each with its weights: [{k (index), u, v, parts}] — a
/// frame bends only these (bender).
export function touched(regions, gx = GRID.x, gy = GRID.y) {
  const out = [];
  for (let i = 0; i < gy; i += 1) {
    for (let j = 0; j < gx; j += 1) {
      const u = j / (gx - 1), v = i / (gy - 1), parts = weightsAt(regions, u, v);
      if (parts.length) out.push({ k: i * gx + j, u, v, parts });
    }
  }
  return out;
}

/// A frame's bend: writes each moved vertex of `base` (the plane's rest positions, tw×th
/// units) into `pos` at time t.
export function bender(regions, tw, th) {
  const verts = touched(regions);
  const bend = (base, pos, t, wind) => {
    for (const { k, u, v, parts } of verts) {
      const [dx, dy] = bendBy(parts, u, v, t, wind);
      pos[k * 2] = base[k * 2] + dx * tw;
      pos[k * 2 + 1] = base[k * 2 + 1] + dy * th;
    }
  };
  bend.count = verts.length;
  return bend;
}

/// Where a painting of tw×th sits in a W×H box: `cover` at the CSS background's position
/// (px, py: 0.5, 0.4 is `center 40%`), or `fill` (the box is the painting's own shape).
export function fitOf(tw, th, W, H, { fit = 'cover', px = 0.5, py = 0.4 } = {}) {
  if (fit === 'fill') return { sx: W / tw, sy: H / th, x: 0, y: 0 };
  const s = Math.max(W / tw, H / th);
  return { sx: s, sy: s, x: (W - tw * s) * px, y: (H - th * s) * py };
}

/* The stage's wind, as paintAtmos set it on the view (--wf force, --wsign which way). */
function windOf(el) {
  const v = el?.closest?.('.view') ?? document.getElementById('view');
  if (!v) return { force: 0.3, sign: -1 };
  const cs = getComputedStyle(v);
  const force = Number.parseFloat(cs.getPropertyValue('--wf')), sign = Number.parseFloat(cs.getPropertyValue('--wsign'));
  return { force: Number.isFinite(force) ? force : 0.3, sign: sign >= 0 ? 1 : -1 };
}

const stillMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/// Bring the painting `src` to life in `host` (an element the painting fills). `regions` from
/// aliveOf. `fit`/`px`/`py` as fitOf; `gone()` true once the painting is leaving (its canvas goes
/// then); `covered()` true while nothing of it shows (the canvas sleeps). Resolves to
/// {canvas, stats(), destroy()} — or null, and the still stands (nothing moves, no WebGL,
/// reduced motion, or the painting left before it loaded).
export async function livePainting(host, src, regions, { fit = 'cover', px = 0.5, py = 0.4, still = stillMotion(), gone = () => false, covered = () => false } = {}) {
  if (!host || !src || !regions?.length || still || !glOK()) return null;
  const PIXI = await loadPixi();
  const img = new Image();
  img.src = src;
  try { await img.decode(); } catch { return null; }
  if (!host.isConnected || gone()) return null;
  const box = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  let { w: W, h: H } = box();
  const app = new PIXI.Application();
  // No more pixels than the painting has: a 1536-wide painting gains nothing at 2× on a wide screen.
  const res = Math.max(1, Math.min(globalThis.devicePixelRatio || 1, 2, img.naturalWidth / W));
  await app.init({ width: W, height: H, backgroundAlpha: 0, antialias: false, resolution: res, autoDensity: true, preference: 'webgl' });
  const canvas = app.canvas;
  canvas.className = 'fxalive';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', opacity: '0', transition: 'opacity .8s ease' });
  host.appendChild(canvas);
  // The painting from a fresh image (fx.js: a texture cached across Applications drew blank).
  const tex = PIXI.Texture.from(img);
  const tw = tex.width, th = tex.height;
  const plane = new PIXI.MeshPlane({ texture: tex, verticesX: GRID.x, verticesY: GRID.y });
  app.stage.addChild(plane);
  const place = () => { const f = fitOf(tw, th, W, H, { fit, px, py }); plane.scale.set(f.sx, f.sy); plane.position.set(f.x, f.y); };
  place();

  const buf = plane.geometry.getBuffer('aPosition');
  const base = Float32Array.from(buf.data);
  const bendAt = bender(regions, tw, th);
  let wind = windOf(host), cost = 0, frames = 0;
  const t0 = performance.now();
  const bend = () => {
    const a = performance.now();
    bendAt(base, buf.data, (a - t0) / 1000, wind);
    buf.update();
    cost += performance.now() - a;
    frames += 1;
  };
  app.ticker.maxFPS = FPS;
  app.ticker.add(bend);
  requestAnimationFrame(() => { canvas.style.opacity = '1'; });

  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    clearInterval(watch);
    ro?.disconnect();
    app.destroy(true, { children: true });
    tex.destroy(true);
  };
  // Once a second: gone → destroyed; covered → asleep; the wind as the stage has it now.
  const watch = setInterval(() => {
    if (!host.isConnected || gone()) return destroy();
    wind = windOf(host);
    if (covered()) app.ticker.stop(); else if (!app.ticker.started) app.ticker.start();
  }, 1000);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (dead) return;
    ({ w: W, h: H } = box());
    app.renderer.resize(W, H);
    place();
  }) : null;
  ro?.observe(host);

  return {
    canvas,
    /// The frame's own cost so far: the bend (ms, mean) and frames drawn — for the preview and the report.
    stats: () => ({ bendMs: frames ? +(cost / frames).toFixed(3) : 0, frames, fps: FPS, verts: bendAt.count, res }),
    destroy,
  };
}

/* ── The stage's two paintings ── */

/// The stage's backdrop (lingjing.js paintBackdrop's `.bd`): the painting `art` (the world's path)
/// at `src`, if its row in backdrops.json `alive` says something in it moves. Gone when the
/// backdrop cross-fades out (`.going`); asleep under a set piece (story.css hides the backdrop then).
export function liveBackdrop(bd, src, table, art) {
  const regions = aliveOf(table, art);
  return livePainting(bd, src, regions, {
    gone: () => bd.classList.contains('going'),
    covered: () => document.hidden || Boolean(bd.closest('.view')?.querySelector('.spback')),
  }).catch(() => null);
}

/// A beast's 出场 painting (`.appearart`, fitted to its own shape by lingjing.js fitAppear):
/// it breathes (backdrops.json `alive_creature`, or its own row). The canvas lies over the
/// picture's box and takes its fade; the picture stays under it.
export function liveCreature(appear, table, art) {
  const img = appear?.querySelector('.appearart');
  if (!img) return Promise.resolve(null);
  const regions = aliveOf(table, art, { creature: true });
  const frame = document.createElement('div');
  frame.className = 'fxaliveframe';
  Object.assign(frame.style, { position: 'absolute', pointerEvents: 'none' });
  const sync = () => {
    Object.assign(frame.style, { left: img.style.left, top: img.style.top, width: img.style.width, height: img.style.height, opacity: getComputedStyle(img).opacity });
  };
  img.after(frame);
  const fitted = () => img.classList.contains('fit');
  const go = async () => {
    sync();
    const live = await livePainting(frame, img.currentSrc || img.src, regions, { fit: 'fill', gone: () => !appear.isConnected });
    if (!live) { frame.remove(); return null; }
    // The picture's box moves with the stage (fitAppear on a resize) and fades in: follow both.
    const follow = setInterval(() => (appear.isConnected ? sync() : clearInterval(follow)), 250);
    return live;
  };
  if (fitted()) return go().catch(() => null);
  return new Promise((ok) => {
    const mo = new MutationObserver(() => { if (fitted()) { mo.disconnect(); ok(go().catch(() => null)); } });
    mo.observe(img, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); if (!fitted()) { frame.remove(); ok(null); } }, 4000);
  });
}
