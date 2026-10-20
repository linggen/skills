// fx.js — 守墙关's effects: the particle textures (made once on a canvas: glows, streaks, shards, stars, rings),
// one emitter per preset (fired with explode / emitParticleAt, never one emitter per shot), the damage-number font
// (drawn once from the game font into a bitmap font, so a crowd of numbers costs nothing), lightning, shake, flash.
import * as Phaser from 'phaser';

export const FONT = 'SQKuaiLe, "PingFang SC", "Microsoft YaHei", sans-serif';

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  draw(t.getContext(), w, h);
  t.refresh();
}

function radial(ctx, w, h, stops) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
  for (const [at, c] of stops) g.addColorStop(at, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** The particle and overlay textures. */
export function makeTextures(scene) {
  canvasTex(scene, 'glow', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]));
  canvasTex(scene, 'soft', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]));
  canvasTex(scene, 'streak', 64, 16, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(w / 2, h / 2, w / 2, h / 2.6, 0, 0, Math.PI * 2); c.fill();
  });
  canvasTex(scene, 'shard', 24, 40, (c, w, h) => {
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(40,90,140,0.9)'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(w / 2, 2); c.lineTo(w - 3, h * 0.45); c.lineTo(w / 2, h - 2); c.lineTo(3, h * 0.45); c.closePath(); c.fill(); c.stroke();
  });
  canvasTex(scene, 'star', 40, 40, (c, w, h) => {
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(90,50,0,0.85)'; c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 ? 8 : 18, a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    c.closePath(); c.fill(); c.stroke();
  });
  canvasTex(scene, 'ring', 128, 128, (c, w) => {
    c.strokeStyle = '#fff'; c.lineWidth = 10; c.shadowColor = '#fff'; c.shadowBlur = 12;
    c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2); c.stroke();
  });
  canvasTex(scene, 'chunk', 20, 20, (c) => {
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(40,30,20,0.9)'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(3, 6); c.lineTo(14, 2); c.lineTo(18, 13); c.lineTo(7, 18); c.closePath(); c.fill(); c.stroke();
  });
  canvasTex(scene, 'scorch', 128, 80, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(30,10,0,0.75)'); g.addColorStop(0.6, 'rgba(60,20,0,0.45)'); g.addColorStop(1, 'rgba(60,20,0,0)');
    c.fillStyle = g; c.scale(1, h / w); c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.fill();
  });
  canvasTex(scene, 'shadow', 64, 24, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.save(); c.scale(1, h / w); c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.fill(); c.restore();
  });
  canvasTex(scene, 'vignette', 270, 480, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h * 0.45, h * 0.28, w / 2, h * 0.45, h * 0.62);
    g.addColorStop(0, 'rgba(10,6,20,0)'); g.addColorStop(1, 'rgba(10,6,20,0.62)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 'band', 256, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,248,220,0)'); g.addColorStop(0.5, 'rgba(255,248,220,0.55)'); g.addColorStop(1, 'rgba(255,248,220,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 'reticle', 96, 96, (c, w) => {
    c.strokeStyle = '#ff3b30'; c.lineWidth = 6; c.shadowColor = '#ff3b30'; c.shadowBlur = 8;
    c.beginPath(); c.arc(w / 2, w / 2, 32, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 7;
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2;
      c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * 24, w / 2 + Math.sin(a) * 24); c.lineTo(w / 2 + Math.cos(a) * 44, w / 2 + Math.sin(a) * 44); c.stroke();
    }
  });
}

/** Digits (and + − ! ×) drawn once from the game font: thick dark outline, a fill to tint. */
export function makeNumberFont(scene, key, { fill, stroke = '#2a1206', size = 46 }) {
  if (scene.cache.bitmapFont.exists(key)) return;
  const chars = '0123456789+-!x';
  const pad = 8, h = Math.round(size * 1.25);
  const can = document.createElement('canvas');
  const ctx = can.getContext('2d');
  ctx.font = `${size}px ${FONT}`;
  const ws = [...chars].map((ch) => Math.ceil(ctx.measureText(ch).width) + pad * 2);
  can.width = ws.reduce((a, b) => a + b, 0);
  can.height = h + pad * 2;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let x = 0;
  const data = { retroFont: true, font: key, size: h, lineHeight: h, chars: {} };
  [...chars].forEach((ch, i) => {
    const cx = x + pad, cy = can.height / 2;
    ctx.lineWidth = 10; ctx.strokeStyle = stroke; ctx.strokeText(ch, cx, cy);
    if (Array.isArray(fill)) {
      const g = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
      fill.forEach((c, j) => g.addColorStop(j / (fill.length - 1), c));
      ctx.fillStyle = g;
    } else ctx.fillStyle = fill;
    ctx.fillText(ch, cx, cy);
    const w = ws[i];
    data.chars[ch.charCodeAt(0)] = { x, y: 0, width: w, height: can.height, centerX: w / 2, centerY: can.height / 2, xOffset: 0, yOffset: 0,
      xAdvance: w - pad * 2 + 2, data: {}, kerning: {}, u0: x / can.width, v0: 0, u1: (x + w) / can.width, v1: 1 };
    x += w;
  });
  scene.textures.addCanvas(key, can);
  scene.cache.bitmapFont.add(key, { data, texture: key, frame: null });
}

// Presets: texture, then the emitter config. `explode(n, x, y)` fires a burst; trails emit one at a time.
const PRESETS = {
  spark: ['glow', { speed: { min: 120, max: 340 }, lifespan: { min: 180, max: 340 }, scale: { start: 0.42, end: 0 }, blendMode: 'ADD', tint: [0xffffff, 0xbfe6ff, 0xfff1a8] }],
  hitStreak: ['streak', { speed: { min: 220, max: 480 }, lifespan: 200, scaleX: { start: 0.9, end: 0.1 }, scaleY: 0.5, rotate: { onEmit: (p) => Phaser.Math.RadToDeg(Math.atan2(p.velocityY, p.velocityX)) }, blendMode: 'ADD', tint: [0xffffff, 0xd8f0ff] }],
  fire: ['glow', { speed: { min: 60, max: 330 }, lifespan: { min: 300, max: 650 }, scale: { start: 1.25, end: 0.1 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', color: [0xfff6b0, 0xffb02e, 0xff5a1a, 0x7a1d00], gravityY: -160 }],
  smoke: ['soft', { speed: { min: 20, max: 110 }, lifespan: { min: 600, max: 1000 }, scale: { start: 0.9, end: 2.2 }, alpha: { start: 0.55, end: 0 }, tint: [0x5c4a3f, 0x3d342f, 0x786457], gravityY: -40 }],
  debris: ['chunk', { speed: { min: 160, max: 380 }, angle: { min: 200, max: 340 }, lifespan: 700, scale: { min: 0.5, max: 1.1 }, gravityY: 900, rotate: { min: 0, max: 360 }, tint: [0x8a6d4e, 0x6b5a48, 0x9e8a6a] }],
  frost: ['shard', { speed: { min: 120, max: 320 }, lifespan: { min: 380, max: 620 }, scale: { start: 0.9, end: 0.2 }, rotate: { min: 0, max: 360 }, tint: [0xffffff, 0xb8f0ff, 0x7fd6ff], alpha: { start: 1, end: 0 } }],
  snow: ['glow', { speed: { min: 30, max: 160 }, lifespan: { min: 500, max: 900 }, scale: { start: 0.35, end: 0 }, blendMode: 'ADD', tint: [0xe8fbff, 0x9fe4ff], gravityY: 40 }],
  bolt: ['glow', { speed: { min: 80, max: 260 }, lifespan: { min: 120, max: 260 }, scale: { start: 0.5, end: 0 }, blendMode: 'ADD', tint: [0xffffff, 0xfff27a, 0xd1a6ff] }],
  foxfire: ['glow', { speed: { min: 60, max: 220 }, lifespan: { min: 250, max: 520 }, scale: { start: 1, end: 0 }, blendMode: 'ADD', color: [0xffffff, 0x9fe8ff, 0x3d8bff, 0x1b2f9e], gravityY: -120 }],
  poof: ['soft', { speed: { min: 60, max: 200 }, lifespan: { min: 380, max: 620 }, scale: { start: 0.9, end: 1.8 }, alpha: { start: 0.9, end: 0 }, tint: [0xffffff, 0xf3ead7] }],
  stars: ['star', { speed: { min: 140, max: 320 }, lifespan: 600, scale: { start: 0.8, end: 0.2 }, rotate: { min: 0, max: 360 }, gravityY: 500, tint: [0xffe14d, 0xfff6c2] }],
  gold: ['star', { speed: { min: 200, max: 420 }, angle: { min: 220, max: 320 }, lifespan: 800, scale: { start: 0.55, end: 0.3 }, gravityY: 700, rotate: { min: 0, max: 360 }, tint: [0xffd23f] }],
  // Trails: one particle per shot per frame.
  trailSword: ['glow', { speed: 0, lifespan: 240, scale: { start: 0.42, end: 0 }, alpha: { start: 0.85, end: 0 }, blendMode: 'ADD', tint: [0x4fb8ff, 0x8fd8ff] }],
  trailFox: ['glow', { speed: 10, lifespan: 300, scale: { start: 0.6, end: 0 }, blendMode: 'ADD', tint: [0xd8f4ff, 0x8fb8ff] }],
  trailFoxfire: ['glow', { speed: 30, lifespan: 380, scale: { start: 0.9, end: 0 }, blendMode: 'ADD', color: [0xffffff, 0x7fd8ff, 0x2a5cff] }],
  trailHuo: ['glow', { speed: 20, lifespan: 360, scale: { start: 0.8, end: 0 }, blendMode: 'ADD', color: [0xfff3a0, 0xff8a1f, 0xb02800] }],
  trailHan: ['glow', { speed: 20, lifespan: 360, scale: { start: 0.7, end: 0 }, blendMode: 'ADD', tint: [0xe6fbff, 0x8ad8ff] }],
  burn: ['glow', { speed: { min: 10, max: 50 }, lifespan: { min: 300, max: 600 }, scale: { start: 0.7, end: 0 }, blendMode: 'ADD', color: [0xfff09a, 0xff8a1f, 0xc23200], gravityY: -180 }],
  dust: ['soft', { speed: { min: 30, max: 90 }, angle: { min: 180, max: 360 }, lifespan: 500, scale: { start: 0.5, end: 1.2 }, alpha: { start: 0.6, end: 0 }, tint: [0xcdb89a, 0xa89277] }],
};

/** One emitter per preset, all idle until fired. `budget` thins bursts under reduced motion. */
export function makeEmitters(scene, depth, budget = 1) {
  const em = {};
  for (const [name, [tex, cfg]] of Object.entries(PRESETS)) {
    em[name] = scene.add.particles(0, 0, tex, { ...cfg, emitting: false }).setDepth(depth);
  }
  em.burst = (name, n, x, y) => em[name].explode(Math.max(1, Math.round(n * budget)), x, y);
  return em;
}

/** A jagged bolt between points: drawn into `gfx` (a white core over a coloured glow), cleared by the caller. */
export function jag(gfx, pts, { color = 0xc89bff, width = 10, rnd = Math.random } = {}) {
  const path = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 22));
    for (let k = 0; k < n; k += 1) {
      const t = k / n, off = k === 0 ? 0 : (rnd() - 0.5) * 26;
      const nx = -(b.y - a.y), ny = b.x - a.x, len = Math.hypot(nx, ny) || 1;
      path.push({ x: a.x + (b.x - a.x) * t + (nx / len) * off, y: a.y + (b.y - a.y) * t + (ny / len) * off });
    }
  }
  path.push(pts.at(-1));
  for (const [w, c, al] of [[width * 2.4, color, 0.25], [width, color, 0.85], [width * 0.4, 0xffffff, 1]]) {
    gfx.lineStyle(w, c, al);
    gfx.beginPath();
    gfx.moveTo(path[0].x, path[0].y);
    for (const p of path.slice(1)) gfx.lineTo(p.x, p.y);
    gfx.strokePath();
  }
}
