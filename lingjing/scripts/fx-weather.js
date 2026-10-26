// fx-weather.js — the weather's particles in WebGL (design.md § 画面效果 「weather particles」, §
// 真实世界). atmos.js names what falls and writes a few dozen CSS spans; where it pays off — snow,
// rain, fog, the three the sky brings — this draws them instead with PixiJS: snow in three depths,
// each flake its own speed and sway, carried by the stage's wind; rain as fine leaning streaks with
// rings where it lands on the lower stage; fog as two sheets of soft paper-cloud drifting at
// different speeds. Everything else (petals, leaves, fireflies, a festival's sparks) stays CSS.
//
// Like a living painting (fx-alive.js) the layer lives while the weather stands: 30 fps, asleep
// while the layer is hidden (a fight, a set piece, a hidden tab), gone when atmos.js lays the next
// layer. Its spans for the kinds drawn here are hidden, not removed: no WebGL, reduced motion, a
// failure — the CSS particles are all there is (and with reduced motion they stand still).
import { dropApp, glOK, loadPixi } from './fx.js';

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

/* Each kind: build its sprites in `layer`, return a step(dt, t). */
const BUILD = {
  snow({ PIXI, layer, W, H, r, made }) {
    const tex = PIXI.Texture.from(flakeCanvas());
    made.push(tex);
    const flakes = Array.from({ length: countFor('snow', W(), H()) }, () => {
      const p = flakeOf(r, W(), H());
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      s.width = s.height = p.size * 2;
      s.alpha = p.alpha;
      layer.addChild(s);
      return { p, s };
    });
    return (dt, t, wind) => { for (const { p, s } of flakes) { fallStep(p, dt, t, W(), H(), wind.wdx); s.position.set(p.x, p.y); } };
  },
  rain({ PIXI, layer, W, H, r, made }) {
    const tex = PIXI.Texture.from(streakCanvas()), ringTex = PIXI.Texture.from(ringCanvas());
    made.push(tex, ringTex);
    const drops = Array.from({ length: countFor('rain', W(), H()) }, () => {
      const p = dropOf(r, W(), H());
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5, 1);
      s.height = p.len;
      s.width = 1.6;
      s.alpha = p.alpha;
      layer.addChild(s);
      return { p, s };
    });
    // Rings on the lower stage (the ground, the water), a few at a time.
    const rings = Array.from({ length: 8 }, () => { const s = new PIXI.Sprite(ringTex); s.anchor.set(0.5); s.alpha = 0; layer.addChild(s); return { s, age: r() * 0.7, x: 0, y: 0 }; });
    return (dt, t, wind) => {
      const lean = Math.atan(wind.wdx);
      for (const { p, s } of drops) { fallStep(p, dt, t, W(), H(), wind.wdx); s.position.set(p.x, p.y); s.rotation = -lean; }
      for (const g of rings) {
        g.age += dt;
        if (g.age > 0.7) { g.age = 0; g.x = r() * W(); g.y = H() * (0.78 + r() * 0.2); }
        const k = g.age / 0.7;
        g.s.position.set(g.x, g.y);
        g.s.width = 6 + 34 * k;
        g.s.height = 2 + 10 * k;
        g.s.alpha = 0.35 * (1 - k);
      }
    };
  },
  fog({ PIXI, layer, W, H, r, made }) {
    const sheets = [0, 1].map((i) => {
      const tex = PIXI.Texture.from(fogCanvas(r));
      tex.source.addressMode = 'repeat';
      made.push(tex);
      const s = new PIXI.TilingSprite({ texture: tex, width: W(), height: H() * 0.6 });
      s.position.set(0, H() * (0.3 + i * 0.12));
      s.tileScale.set(1.6 + i * 0.9, 1.4 + i * 0.6);
      s.alpha = 0.55 - i * 0.15;
      layer.addChild(s);
      return { s, speed: 9 + i * 7 };
    });
    return (dt, t, wind) => {
      for (const [i, f] of sheets.entries()) {
        f.s.width = W();
        f.s.height = H() * 0.6;
        f.s.y = H() * (0.3 + i * 0.12);
        f.s.tilePosition.x += (f.speed * (0.6 + wind.force) * (wind.wdx > 0 ? 1 : -1)) * dt;
        f.s.alpha = (0.55 - i * 0.15) * (0.85 + 0.15 * Math.sin(t / 5 + i * 2));
      }
    };
  },
};

/// The weather in WebGL over the stage: `pts` the layer's box (#atmosPts, just laid by atmos.js
/// particlesHtml), `particles` its kinds, `seed` its seed (the day). Hides the CSS spans of the kinds
/// it draws once it draws. Resolves to {stats(), destroy()} or null (nothing of ours falls, no WebGL,
/// reduced motion, or the layer was laid again before it loaded).
let latest = 0, current = null;
export async function liveWeather(pts, particles, seed = 'lingjing') {
  // The newest layer wins: one laid while an older one was still loading takes its place.
  const mine = ++latest;
  current?.destroy();
  current = null;
  const kinds = glKinds(particles);
  if (!pts || !kinds.length || stillMotion() || !glOK()) return null;
  const PIXI = await loadPixi();
  if (mine !== latest || !pts.isConnected) return null;
  const wrap = document.createElement('div');
  wrap.className = 'pts p-fx';
  pts.appendChild(wrap);
  // The layer's box is the stage's .atmos (#atmosPts itself is a bare div; its groups are placed against .atmos).
  const stage = pts.closest('.atmos') ?? pts.parentElement;
  const size = () => ({ w: Math.max(1, stage.clientWidth), h: Math.max(1, stage.clientHeight) });
  let { w, h } = size();
  const app = new PIXI.Application();
  await app.init({ width: w, height: h, backgroundAlpha: 0, antialias: false, resolution: Math.min(globalThis.devicePixelRatio || 1, 1.5), autoDensity: true, preference: 'webgl' });
  if (mine !== latest || !wrap.isConnected) { dropApp(app); wrap.remove(); return null; }
  Object.assign(app.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  wrap.appendChild(app.canvas);
  const made = [];
  const r = rngOf(`${seed}:gl`);
  const W = () => w, H = () => h;
  // Laid over the stage's size; laid again when the stage changes size (a resize, or a layer laid while hidden).
  let steps = [];
  const build = () => {
    app.stage.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const t of made.splice(0)) t.destroy(true);
    steps = kinds.map((k) => { const layer = new PIXI.Container(); app.stage.addChild(layer); return BUILD[k]({ PIXI, layer, W, H, r, made }); });
  };
  build();
  // Ours drawn: the CSS spans of the same kinds step aside.
  for (const k of kinds) for (const el of pts.querySelectorAll(`.pts.p-${k}`)) el.style.display = 'none';
  let wind = windOf(pts), cost = 0, frames = 0;
  const step = (ticker) => {
    const a = performance.now(), dt = Math.min(0.1, ticker.deltaMS / 1000), t = a / 1000;
    for (const s of steps) s(dt, t, wind);
    cost += performance.now() - a;
    frames += 1;
  };
  app.ticker.maxFPS = FPS;
  app.ticker.add(step);
  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    clearInterval(watch);
    dropApp(app);
    for (const t of made) t.destroy(true);
    wrap.remove();
  };
  // Once a second: laid again → gone; hidden (a fight, a set piece, a hidden tab) → asleep; the wind now; the size.
  const watch = setInterval(() => {
    if (!wrap.isConnected) return destroy();
    wind = windOf(pts);
    const hidden = document.hidden || !stage.offsetParent || getComputedStyle(wrap).opacity === '0';
    if (hidden) { app.ticker.stop(); return; }
    if (!app.ticker.started) app.ticker.start();
    const now = size();
    if (now.w !== w || now.h !== h) { ({ w, h } = now); app.renderer.resize(w, h); build(); }
  }, 1000);
  current = { stats: () => ({ stepMs: frames ? +(cost / frames).toFixed(3) : 0, frames, kinds }), destroy };
  return current;
}
