// fx-weather.js — the weather's particles in WebGL (design.md § 画面效果 「weather particles」, §
// 真实世界). atmos.js names what falls and writes a few dozen CSS spans; where it pays off — snow,
// rain, fog, the three the sky brings — this draws them instead on the stage's one Phaser game
// (kit/stage.js, layer `weather`, in the painting's box: over the painting, under the shade and the
// cards — game-kit.md § One engine, § 5 q4): snow in three depths,
// each flake its own speed and sway, carried by the stage's wind; rain as fine leaning streaks with
// rings where it lands on the lower stage; fog as two sheets of soft paper-cloud drifting at
// different speeds. Everything else (petals, leaves, fireflies, a festival's sparks) stays CSS.
//
// Like a living painting (fx-alive.js) the layer lives while the weather stands: 30 fps, asleep
// while the layer is hidden (a fight, a set piece, a hidden tab), gone when atmos.js lays the next
// layer. Its spans for the kinds drawn here are hidden, not removed: no WebGL, reduced motion, a
// failure — the CSS particles are all there is (and with reduced motion they stand still).
import { glOK } from './fx.js';
import { stageOf } from './kit/stage.js';

/// What this draws, of atmos.js PARTICLES.
export const GL_KINDS = ['snow', 'rain', 'fog'];
/// How many of each at the 1280×720 stage; a phone's smaller stage takes fewer (countFor).
export const DENSITY = { snow: 170, rain: 200, fog: 2 };
const FPS = 30;

/// The kinds of `particles` this draws.
export const glKinds = (particles = []) => particles.filter((k) => GL_KINDS.includes(k));

/// How many of `kind` for a W×H stage: by area, never under a fifth of the full count.
export function countFor(kind, W, H) {
  const n = DENSITY[kind] ?? 0;
  if (kind === 'fog') return n;
  return Math.round(n * Math.min(1.4, Math.max(0.2, (W * H) / (1280 * 720))));
}

/// A small seeded random (a redraw lays the same weather).
export function rngOf(seed = 'lingjing') {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

/// A flake: depth 0 (far: small, slow, faint) … 2 (near). Speeds in px/s at a 720-tall stage.
export function flakeOf(r, W, H) {
  const depth = r() < 0.5 ? 0 : r() < 0.7 ? 1 : 2;
  return { depth, x: r() * W, y: r() * H, size: [1.6, 2.8, 4.4][depth] * (0.75 + r() * 0.5), fall: [22, 38, 62][depth] * (0.8 + r() * 0.4) * (H / 720), sway: 6 + r() * 14, phase: r() * Math.PI * 2, alpha: [0.55, 0.75, 0.92][depth] };
}

/// A rain streak: fast, a little longer and brighter the nearer.
export function dropOf(r, W, H) {
  const near = r();
  return { x: r() * W, y: r() * H, len: 12 + near * 18, fall: (620 + near * 380) * (H / 720), alpha: 0.18 + near * 0.3 };
}

/// One step of a falling thing: down by its fall, across by the wind's carry (atmos.js windVars
/// `--wdx`, across per unit of fall) and its own sway; off the bottom or a side it comes back at the
/// top, upwind.
export function fallStep(p, dt, t, W, H, wdx = 0) {
  const dy = p.fall * dt;
  p.y += dy;
  p.x += wdx * dy + (p.sway ? Math.cos(t * 0.9 + p.phase) * p.sway * dt : 0);
  if (p.y > H + 20) { p.y -= H + 40; p.x = ((p.x % W) + W) % W; }
  if (p.x < -20) p.x += W + 40;
  else if (p.x > W + 20) p.x -= W + 40;
  return p;
}

/* ── Textures made on the spot: no image files ── */

const canvasOf = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
/* A flake: a soft white disc with a faint cool edge (the CSS flake's shadow). */
const flakeCanvas = () => canvasOf(32, 32, (g) => {
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(250,252,255,.95)');
  grad.addColorStop(0.68, 'rgba(120,138,156,.5)'); // a cool rim, so a flake reads on white paper too
  grad.addColorStop(1, 'rgba(120,138,156,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
});
/* A streak: clear at the top, the rain's grey-blue at the foot (the CSS streak). */
const streakCanvas = () => canvasOf(4, 64, (g) => {
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(94,113,130,0)');
  grad.addColorStop(1, 'rgba(94,113,130,1)');
  g.fillStyle = grad;
  g.fillRect(1, 0, 2, 64);
});
/* A ring where a drop lands. */
const ringCanvas = () => canvasOf(64, 24, (g) => {
  g.strokeStyle = 'rgba(94,113,130,.9)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(32, 12, 30, 10, 0, 0, Math.PI * 2);
  g.stroke();
});
/* Paper-cloud: soft white blobs on clear, blurred — tiled and drifted, it reads as fog. */
const fogCanvas = (r) => canvasOf(512, 256, (g, w, h) => {
  g.filter = 'blur(22px)';
  for (let i = 0; i < 26; i += 1) {
    const x = r() * w, y = h * (0.2 + r() * 0.6), rx = 40 + r() * 110, ry = 18 + r() * 40;
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`;
    for (const dx of [-w, 0, w]) { g.beginPath(); g.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  }
});

/* The stage's wind as paintAtmos set it: the carry across (--wdx) and the force (--wf). */
function windOf(el) {
  const v = el?.closest?.('.view') ?? document.getElementById('view');
  const cs = v ? getComputedStyle(v) : null;
  const wdx = Number.parseFloat(cs?.getPropertyValue('--wdx')), wf = Number.parseFloat(cs?.getPropertyValue('--wf'));
  return { wdx: Number.isFinite(wdx) ? wdx : -0.1, force: Number.isFinite(wf) ? wf : 0.3 };
}

const stillMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Each kind: lay its images in `layer` (a container in CSS px), return a step(dt, t, wind).
   `tex(canvas)` makes a texture for the layer's run. */
const BUILD = {
  snow({ scene, layer, W, H, r, tex }) {
    const key = tex(flakeCanvas());
    const flakes = Array.from({ length: countFor('snow', W(), H()) }, () => {
      const p = flakeOf(r, W(), H());
      const s = scene.add.image(p.x, p.y, key).setDisplaySize(p.size * 2, p.size * 2).setAlpha(p.alpha);
      layer.add(s);
      return { p, s };
    });
    return (dt, t, wind) => { for (const { p, s } of flakes) { fallStep(p, dt, t, W(), H(), wind.wdx); s.setPosition(p.x, p.y); } };
  },
  rain({ scene, layer, W, H, r, tex }) {
    const key = tex(streakCanvas()), ringKey = tex(ringCanvas());
    const drops = Array.from({ length: countFor('rain', W(), H()) }, () => {
      const p = dropOf(r, W(), H());
      const s = scene.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDisplaySize(1.6, p.len).setAlpha(p.alpha);
      layer.add(s);
      return { p, s };
    });
    // Rings on the lower stage (the ground, the water), a few at a time.
    const rings = Array.from({ length: 8 }, () => { const s = scene.add.image(0, 0, ringKey).setAlpha(0); layer.add(s); return { s, age: r() * 0.7, x: 0, y: 0 }; });
    return (dt, t, wind) => {
      const lean = Math.atan(wind.wdx);
      for (const { p, s } of drops) { fallStep(p, dt, t, W(), H(), wind.wdx); s.setPosition(p.x, p.y).setRotation(-lean); }
      for (const g of rings) {
        g.age += dt;
        if (g.age > 0.7) { g.age = 0; g.x = r() * W(); g.y = H() * (0.78 + r() * 0.2); }
        const k = g.age / 0.7;
        g.s.setPosition(g.x, g.y).setDisplaySize(6 + 34 * k, 2 + 10 * k).setAlpha(0.35 * (1 - k));
      }
    };
  },
  fog({ scene, layer, W, H, r, tex }) {
    const sheets = [0, 1].map((i) => {
      const s = scene.add.tileSprite(0, H() * (0.3 + i * 0.12), W(), H() * 0.6, tex(fogCanvas(r))).setOrigin(0).setTileScale(1.6 + i * 0.9, 1.4 + i * 0.6).setAlpha(0.55 - i * 0.15);
      layer.add(s);
      return { s, speed: 9 + i * 7, x: 0 };
    });
    return (dt, t, wind) => {
      for (const [i, f] of sheets.entries()) {
        f.x += (f.speed * (0.6 + wind.force) * (wind.wdx > 0 ? 1 : -1)) * dt;
        // The tile offset is in the texture's own pixels: the drift is in the stage's.
        f.s.setTilePosition(-f.x / f.s.tileScaleX, 0).setAlpha((0.55 - i * 0.15) * (0.85 + 0.15 * Math.sin(t / 5 + i * 2)));
      }
    };
  },
};

/* Lay the weather on `scene` (its `d`: {kinds, seed, host, wind()}) in CSS px, under one root scaled
   to the canvas — again when the stage changes size. */
function layWeather(scene) {
  const { host, kinds, seed } = scene.d;
  for (const k of scene.made ?? []) host.free('weather', k);
  scene.root.removeAll(true);
  scene.made = [];
  const { w, h, dpr } = host.size;
  scene.at = `${w}×${h}@${dpr}`;
  scene.root.setScale(dpr);
  const r = rngOf(`${seed}:gl`);
  const tex = (c) => { const k = host.texture('weather', c); scene.made.push(k); return k; };
  scene.steps = kinds.map((k) => { const layer = scene.add.container(0, 0); scene.root.add(layer); return BUILD[k]({ scene, layer, W: () => w, H: () => h, r, tex }); });
}

/* The weather layer's scene on the stage game. */
const weatherScene = {
  create(d) {
    this.d = d;
    this.root = this.add.container(0, 0);
    this.cost = 0;
    this.frames = 0;
    layWeather(this);
  },
  update(time, delta) {
    const { host } = this.d, { w, h, dpr } = host.size;
    if (`${w}×${h}@${dpr}` !== this.at) layWeather(this);
    const a = performance.now(), dt = Math.min(0.1, delta / 1000), t = a / 1000, wind = this.d.wind();
    for (const s of this.steps) s(dt, t, wind);
    this.cost += performance.now() - a;
    this.frames += 1;
  },
};

/// The weather on the stage's one Phaser game (kit/stage.js, layer `weather`, in the painting's box:
/// under the shade and the cards, over the painting): `pts` the layer's box (#atmosPts, just laid by
/// atmos.js particlesHtml), `particles` its kinds, `seed` its seed (the day). Hides the CSS spans of
/// the kinds it draws once it draws. Resolves to {stats(), destroy()} or null (nothing of ours falls,
/// no WebGL, reduced motion, or the layer was laid again before it loaded).
let latest = 0, current = null;
export async function liveWeather(pts, particles, seed = 'lingjing') {
  // The newest layer wins: one laid while an older one was still loading takes its place.
  const mine = ++latest;
  current?.destroy();
  current = null;
  const kinds = glKinds(particles);
  if (!pts || !kinds.length || stillMotion() || !glOK()) return null;
  const view = pts.closest('.view');
  const host = await stageOf(view);
  if (!host || mine !== latest || !pts.isConnected) return null;
  // A mark in the layer: laid again (atmos.js replaces #atmosPts' content), the mark is gone and so is this.
  const mark = document.createElement('i');
  mark.className = 'pts p-fx';
  mark.hidden = true;
  pts.appendChild(mark);
  const atmos = pts.closest('.atmos') ?? pts.parentElement;
  let wind = windOf(pts);
  const scene = await host.run('weather', weatherScene, { kinds, seed, host, wind: () => wind }, { under: view.querySelector('.backdrop') ?? atmos });
  if (mine !== latest || !mark.isConnected) { if (host.sceneOf('weather') === scene) host.stop('weather'); return null; }
  // Ours drawn: the CSS spans of the same kinds step aside.
  for (const k of kinds) for (const el of pts.querySelectorAll(`.pts.p-${k}`)) el.style.display = 'none';
  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    clearInterval(watch);
    if (host.sceneOf('weather') === scene) host.stop('weather');
    mark.remove();
  };
  // Once a second: laid again → gone; hidden (a fight, 今线, a hidden tab) → idle; the wind now.
  const watch = setInterval(() => {
    if (!mark.isConnected || host.sceneOf('weather') !== scene) return destroy();
    wind = windOf(pts);
    const hidden = document.hidden || !atmos.offsetParent || getComputedStyle(atmos).opacity === '0';
    scene.root.setVisible(!hidden);
    host.idle('weather', hidden);
  }, 1000);
  current = { stats: () => ({ stepMs: scene.frames ? +(scene.cost / scene.frames).toFixed(3) : 0, frames: scene.frames, kinds }), destroy };
  return current;
}
