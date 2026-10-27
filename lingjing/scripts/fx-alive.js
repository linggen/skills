// fx-alive.js — the paintings breathe (design.md § 画面效果; Hanli 2026-10-20: 「start the
// Pixi pass after 砸寨」). A still painting on the stage — the place's, the sky's, a beast's
// 出场 — drawn on a Phaser Plane whose grid bends a little where the painting has something
// that moves: trees and grass sway from their roots, cloth from where it hangs, water
// shimmers, smoke and steam and flame waver up, mist drifts, a beast breathes. Ink, not a
// cartoon: a tree's crown moves a few pixels.
//
// Which painting moves, and where, is data (worlds/<w>/backdrops.json `alive`, keyed by the
// painting's path; `alive_creature` for every beast's painting without its own row), never a
// list here. The motion itself is pure (motionAt — the tests drive it). The stage's painting is
// drawn on the stage's one Phaser game (kit/stage.js, layer `alive`, in the painting's own box
// under the season's tint and the shade), taking the .bd's look each frame; a beast's 出场 stands
// over the words, so it breathes on a short-lived game of its own (game-kit.md § One engine,
// step 7). A painting lives as long as it stands: 30 fps, asleep while covered (a set piece, a
// fight) or the tab is hidden, gone with the painting. The CSS still stays under the canvas: no
// WebGL, reduced motion, nothing declared — the still is all there is.
import { glOK, loadPhaser } from './fx.js';
import { bootGame, dprOf, stageOf } from './kit/stage.js';

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
const loadImage = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };

/* ── Drawing: a Phaser Plane whose grid the regions bend ── */

/// The CSS `filter` a painting wears (a night's `dim`), as ColorMatrix steps on Phaser's FX:
/// [[method, value]] — brightness ×, saturate (0 = as is, −1 grey), hue (°), contrast. Others drop.
export function filterSteps(css = 'none') {
  const steps = [];
  for (const [, fn, arg] of String(css).matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
    const n = Number.parseFloat(arg), v = /%$/.test(arg.trim()) ? n / 100 : n;
    if (!Number.isFinite(v)) continue;
    if (fn === 'brightness') steps.push(['brightness', v]);
    else if (fn === 'saturate') steps.push(['saturate', v - 1]);
    else if (fn === 'grayscale') steps.push(['saturate', -v]);
    else if (fn === 'hue-rotate') steps.push(['hue', /rad$/.test(arg) ? (v * 180) / Math.PI : v]);
    else if (fn === 'contrast') steps.push(['contrast', v - 1]);
  }
  return steps;
}

/// The painting `key` on a Plane of GRID's points (Phaser lays 6 vertices a cell): each vertex
/// mapped once to its grid point, so a frame writes only the vertices a region moves, in the
/// painting's own pixels (tw×th) before the plane's place and scale. Mesh.preUpdate leaves the
/// written vertices alone while the plane's 3D model is still (it never moves here).
function bendingPlane(scene, key, regions) {
  const gx = GRID.x, gy = GRID.y;
  const plane = scene.add.plane(0, 0, key, undefined, gx - 1, gy - 1);
  plane.hideCCW = false;
  const fr = plane.frame, tw = fr.width, th = fr.height;
  const at = (v, a, b, n) => Math.round(((v - a) / (b - a || 1)) * (n - 1));
  const gridOf = plane.vertices.map((v) => at(v.v, fr.v0, fr.v1, gy) * gx + at(v.u, fr.u0, fr.u1, gx));
  const base = new Float32Array(gx * gy * 2);
  for (let i = 0; i < gy; i += 1) for (let j = 0; j < gx; j += 1) { base[(i * gx + j) * 2] = (j / (gx - 1)) * tw; base[(i * gx + j) * 2 + 1] = (i / (gy - 1)) * th; }
  const pos = Float32Array.from(base);
  const bendAt = bender(regions, tw, th);
  const moved = new Set(touched(regions).map((p) => p.k));
  const live = plane.vertices.map((v, i) => [v, gridOf[i]]).filter(([, k]) => moved.has(k));
  const write = (list) => { for (const [v, k] of list) { v.vx = pos[k * 2]; v.vy = pos[k * 2 + 1]; } };
  const all = plane.vertices.map((v, i) => [v, gridOf[i]]);
  return {
    plane, tw, th, count: bendAt.count,
    /// Lay every vertex flat (once after the plane's first projection, and now and then).
    flat: () => write(all),
    bend(t, wind) { bendAt(base, pos, t, wind); write(live); },
  };
}

/* One breathing painting in `scene`: its plane in a box that takes the .bd's look each frame. */
function paintingIn(scene, key, regions, place) {
  const box = scene.add.container(0, 0);
  const p = bendingPlane(scene, key, regions);
  box.add(p.plane);
  let filter = 'none', laid = 0, cost = 0, frames = 0;
  const look = (css) => {
    if (css === filter) return;
    filter = css;
    box.postFX.clear();
    const steps = filterSteps(css);
    if (!steps.length) return;
    const cm = box.postFX.addColorMatrix();
    steps.forEach(([m, v], i) => cm[m](v, i > 0));
  };
  return {
    box, count: p.count,
    /// A frame at `t` (s): placed and looked as `place()` says ({x, y, sx, sy, alpha, filter, m: [a, d, e, f]}).
    frame(t, wind) {
      const a = performance.now();
      const at = place(p.tw, p.th);
      if (!at) { box.setVisible(false); return; }
      box.setVisible(true).setAlpha(at.alpha).setScale(at.m[0], at.m[1]).setPosition(at.m[2], at.m[3]);
      p.plane.setPosition(at.x, at.y).setScale(at.sx, at.sy);
      look(at.filter);
      if (laid < 2) { p.flat(); laid += 1; }
      p.bend(t, wind);
      cost += performance.now() - a;
      frames += 1;
    },
    stats: () => ({ bendMs: frames ? +(cost / frames).toFixed(3) : 0, frames, fps: FPS, verts: p.count }),
    destroy: () => box.destroy(true),
  };
}

/* A CSS transform as [a, d, e, f] (scale and move: the ken drift is no more), about the box's centre. */
const matrixOf = (tf) => {
  const m = /matrix\(([^)]+)\)/.exec(tf ?? '');
  if (!m) return [1, 1, 0, 0];
  const [a, , , d, e, f] = m[1].split(',').map(Number);
  return [a, d, e, f];
};

/* ── The stage's painting: a scene on the stage game (kit/stage.js `alive`) ── */

/* The alive layer's scene: every breathing painting on the stage, a frame each 30th of a second. */
const aliveScene = {
  create() { this.paintings = new Set(); this.t0 = performance.now(); },
  update() {
    const t = (performance.now() - this.t0) / 1000;
    for (const p of this.paintings) p.frame(t);
  },
};
const scenes = new WeakMap(); // host → Promise<scene>
function aliveSceneOf(host, under) {
  const now = host.sceneOf('alive');
  if (now && scenes.has(host)) return scenes.get(host);
  const made = host.run('alive', aliveScene, {}, { under });
  scenes.set(host, made);
  return made;
}

/// The stage's backdrop painting `bd` (lingjing.js paintBackdrop's `.bd`) breathing on the stage's
/// game, under the season's tint, the shade and the words: it takes the .bd's own look each frame
/// (the ken drift, the cross-fade, a night's dim), sleeps while covered (a set piece, a fight, a
/// hidden tab) and is gone with the .bd. Resolves to {canvas, stats(), destroy()} or null.
async function stagePainting(bd, src, regions) {
  const view = bd.closest('.view');
  const [host, img] = await Promise.all([stageOf(view), loadImage(src).catch(() => null)]);
  if (!host || !img || !bd.isConnected || bd.classList.contains('going')) return null;
  const scene = await aliveSceneOf(host, bd.parentElement);
  const key = host.texture('alive', img);
  let wind = windOf(bd), dead = false;
  const t0 = performance.now();
  const covered = () => document.hidden || document.body.classList.contains('fighting') || Boolean(view.querySelector('.spback'));
  // Where the .bd stands now, in canvas px: the cover fit, its transform about the centre, its fade and filter.
  const place = (tw, th) => {
    const { dpr } = host.size, W = bd.clientWidth, H = bd.clientHeight;
    if (!W || !H) return null;
    const cs = getComputedStyle(bd), f = fitOf(tw, th, W, H), [a, d, e, g] = matrixOf(cs.transform);
    const cx = (W * dpr) / 2, cy = (H * dpr) / 2;
    const ramp = Math.min(1, (performance.now() - t0) / 800);
    return { x: f.x * dpr, y: f.y * dpr, sx: f.sx * dpr, sy: f.sy * dpr, alpha: Number(cs.opacity) * ramp, filter: cs.filter, m: [a, d, cx * (1 - a) + e * dpr, cy * (1 - d) + g * dpr] };
  };
  const p = paintingIn(scene, key, regions, place);
  const painting = { frame: (t) => p.frame(t, wind) };
  scene.paintings.add(painting);
  const destroy = () => {
    if (dead) return;
    dead = true;
    clearInterval(watch);
    scene.paintings.delete(painting);
    p.destroy();
    host.free('alive', key);
    if (!scene.paintings.size && host.sceneOf('alive') === scene) { scenes.delete(host); host.stop('alive'); }
  };
  // Once a second: the .bd gone → so is this; covered → the layer idles; the wind as the stage has it now.
  const watch = setInterval(() => {
    if (!bd.isConnected || host.sceneOf('alive') !== scene) return destroy();
    wind = windOf(bd);
    host.idle('alive', covered());
  }, 1000);
  return { canvas: host.game.canvas, stats: () => ({ ...p.stats(), res: host.size.dpr }), destroy };
}

/// Bring the painting `src` to life in `host` (an element the painting fills) on a short-lived
/// Phaser game of its own: a beast's 出场 (it stands over the words, where the stage's canvas is
/// not) and the 画活 preview. `regions` from aliveOf. `fit`/`px`/`py` as fitOf; `gone()` true once
/// the painting is leaving (its game goes then); `covered()` true while nothing of it shows (it
/// sleeps). Resolves to {canvas, stats(), destroy()} — or null, and the still stands (nothing
/// moves, no WebGL, reduced motion, or the painting left before it loaded).
export async function livePainting(host, src, regions, { fit = 'cover', px = 0.5, py = 0.4, still = stillMotion(), gone = () => false, covered = () => false } = {}) {
  if (!host || !src || !regions?.length || still || !glOK()) return null;
  const [Phaser, img] = await Promise.all([loadPhaser(), loadImage(src).catch(() => null)]);
  if (!img || !host.isConnected || gone()) return null;
  const box = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  let { w: W, h: H } = box();
  // No more pixels than the painting has: a 1536-wide painting gains nothing at 2× on a wide screen.
  const res = Math.max(1, Math.min(dprOf(globalThis.devicePixelRatio), img.naturalWidth / W));
  let p = null, wind = windOf(host);
  const t0 = performance.now();
  const scene = {
    key: 'alive',
    create() {
      this.textures.addImage('painting', img);
      p = paintingIn(this, 'painting', regions, (tw, th) => {
        const f = fitOf(tw, th, W, H, { fit, px, py });
        return { x: f.x * res, y: f.y * res, sx: f.sx * res, sy: f.sy * res, alpha: Math.min(1, (performance.now() - t0) / 800), filter: 'none', m: [1, 1, 0, 0] };
      });
    },
    update() { p?.frame((performance.now() - t0) / 1000, wind); },
  };
  const game = await bootGame(Phaser, host, { w: W, h: H }, res, [scene]);
  const canvas = game.canvas;
  canvas.className = 'fxalive';
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  game.loop._limitRate = 900 / FPS;
  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    clearInterval(watch);
    ro?.disconnect();
    game.destroy(true);
  };
  // Once a second: gone → destroyed; covered → asleep; the wind as the stage has it now.
  const watch = setInterval(() => {
    if (!host.isConnected || gone()) return destroy();
    wind = windOf(host);
    if (covered()) { if (game.loop.running) game.loop.sleep(); } else if (!game.loop.running) game.loop.wake();
  }, 1000);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (dead) return;
    ({ w: W, h: H } = box());
    game.scale.resize(Math.round(W * res), Math.round(H * res));
  }) : null;
  ro?.observe(host);
  return { canvas, stats: () => ({ ...(p?.stats() ?? {}), res }), destroy };
}

/* ── The stage's two paintings ── */

/// The stage's backdrop (lingjing.js paintBackdrop's `.bd`): the painting `art` (the world's path)
/// at `src`, if its row in backdrops.json `alive` says something in it moves — on the stage's one
/// game (stagePainting). Gone when the backdrop cross-fades out (`.going`, then removed); asleep
/// under a set piece.
export function liveBackdrop(bd, src, table, art) {
  const regions = aliveOf(table, art);
  if (!bd || !src || !regions.length || stillMotion() || !glOK()) return Promise.resolve(null);
  return stagePainting(bd, src, regions).catch(() => null);
}

/// What the breathing canvas's frame takes from the 出场's picture (`box` its inline place, `cs` its computed
/// style), so the canvas reads as the picture itself: its place; its look — the ink filter every picture wears
/// (memory.css), the colour after the ninth, its fade; its feathered edges (story.css `.appearart.fit`'s mask:
/// without it a hard-edged rectangle stood over the soft plate); and its slow push in.
export function pictureLook(box, cs) {
  const get = (k) => cs?.getPropertyValue?.(k) ?? '';
  return {
    left: box.left, top: box.top, width: box.width, height: box.height,
    opacity: cs.opacity, filter: cs.filter, transform: cs.transform,
    maskImage: get('mask-image'), maskComposite: get('mask-composite'),
    webkitMaskImage: get('-webkit-mask-image'), webkitMaskComposite: get('-webkit-mask-composite'),
  };
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
  const sync = () => Object.assign(frame.style, pictureLook(img.style, getComputedStyle(img)));
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
