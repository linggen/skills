// fx.js — 撒豆成兵's effects: particle and overlay textures (made once on a canvas), one pooled emitter per preset
// (fired with explode, never one emitter per event), and the big outlined number font (drawn once from the game font
// into a bitmap font, so a storm of numbers costs nothing).
import * as Phaser from 'phaser';

export const FONT = 'SDKuaiLe, "PingFang SC", "Microsoft YaHei", sans-serif';

export function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  draw(t.getContext(), w, h);
  t.refresh();
}

function radial(c, w, h, stops) {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
  for (const [at, col] of stops) g.addColorStop(at, col);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

export function rounded(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Particle and overlay textures. */
export function makeTextures(scene) {
  canvasTex(scene, 'glow', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]));
  canvasTex(scene, 'soft', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]));
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
  canvasTex(scene, 'paper', 16, 22, (c, w, h) => {
    c.fillStyle = '#fff6c8'; c.strokeStyle = 'rgba(120,60,0,0.8)'; c.lineWidth = 2;
    c.fillRect(2, 2, w - 4, h - 4); c.strokeRect(2, 2, w - 4, h - 4);
    c.strokeStyle = 'rgba(200,30,20,0.9)'; c.beginPath(); c.moveTo(5, 6); c.lineTo(w - 5, 9); c.lineTo(5, 13); c.lineTo(w - 5, 16); c.stroke();
  });
  canvasTex(scene, 'shadow', 64, 24, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.save(); c.scale(1, h / w); c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.fill(); c.restore();
  });
  canvasTex(scene, 'vignette', 270, 480, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h * 0.55, h * 0.3, w / 2, h * 0.55, h * 0.66);
    g.addColorStop(0, 'rgba(10,6,20,0)'); g.addColorStop(1, 'rgba(10,6,20,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 'zone', 64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,40,20,0.15)'); g.addColorStop(0.8, 'rgba(255,40,20,0.55)'); g.addColorStop(1, 'rgba(255,40,20,0.0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

/**
 * Digits and the gate signs (+ − × ÷), drawn once from the game font: a fat dark outline, a gradient fill.
 * The text is ASCII: '+', '-' → −, 'x' → ×, '/' → ÷.
 */
export function makeNumberFont(scene, key, { fill, stroke = '#1b0d05', size = 52, line = 11 }) {
  if (scene.cache.bitmapFont.exists(key)) return;
  const chars = '0123456789+-x/!';
  const shown = { '-': '−', x: '×', '/': '÷' };
  const pad = Math.ceil(line / 2) + 3, h = Math.round(size * 1.3);
  const can = document.createElement('canvas');
  const ctx = can.getContext('2d');
  ctx.font = `${size}px ${FONT}`;
  const ws = [...chars].map((ch) => Math.ceil(ctx.measureText(shown[ch] ?? ch).width) + pad * 2);
  can.width = ws.reduce((a, b) => a + b, 0);
  can.height = h + pad * 2;
  ctx.font = `${size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let x = 0;
  const data = { retroFont: true, font: key, size: h, lineHeight: h, chars: {} };
  [...chars].forEach((ch, i) => {
    const glyph = shown[ch] ?? ch;
    const cx = x + pad, cy = can.height / 2;
    ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.strokeText(glyph, cx, cy + 2);
    ctx.strokeText(glyph, cx, cy);
    const g = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
    fill.forEach((col, j) => g.addColorStop(j / Math.max(1, fill.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillText(glyph, cx, cy);
    const w = ws[i];
    data.chars[ch.charCodeAt(0)] = { x, y: 0, width: w, height: can.height, centerX: w / 2, centerY: can.height / 2, xOffset: 0, yOffset: 0,
      xAdvance: w - pad * 2 + 1, data: {}, kerning: {}, u0: x / can.width, v0: 0, u1: (x + w) / can.width, v1: 1 };
    x += w;
  });
  scene.textures.addCanvas(key, can);
  scene.cache.bitmapFont.add(key, { data, texture: key, frame: null });
}

// Presets: texture, then the emitter config. `burst(name, n, x, y)` fires.
const PRESETS = {
  spark: ['glow', { speed: { min: 140, max: 380 }, lifespan: { min: 200, max: 380 }, scale: { start: 0.45, end: 0 }, blendMode: 'ADD', tint: [0xffffff, 0xbfe6ff, 0xfff1a8] }],
  gold: ['glow', { speed: { min: 120, max: 420 }, lifespan: { min: 300, max: 600 }, scale: { start: 0.6, end: 0 }, blendMode: 'ADD', tint: [0xfff6c2, 0xffd23f, 0x7fe0ff] }],
  bad: ['soft', { speed: { min: 60, max: 260 }, lifespan: { min: 400, max: 700 }, scale: { start: 0.7, end: 1.6 }, alpha: { start: 0.8, end: 0 }, tint: [0x3a0d14, 0x7a1020, 0x1c0a10] }],
  blood: ['glow', { speed: { min: 80, max: 260 }, lifespan: { min: 200, max: 420 }, scale: { start: 0.35, end: 0 }, blendMode: 'ADD', tint: [0xff5a3a, 0xffb347] }],
  poof: ['soft', { speed: { min: 40, max: 160 }, lifespan: { min: 300, max: 520 }, scale: { start: 0.5, end: 1.2 }, alpha: { start: 0.85, end: 0 }, tint: [0xffffff, 0xf3ead7] }],
  paper: ['paper', { speed: { min: 120, max: 300 }, angle: { min: 200, max: 340 }, lifespan: 700, scale: { min: 0.5, max: 0.9 }, gravityY: 700, rotate: { min: 0, max: 360 } }],
  beans: ['glow', { speed: { min: 60, max: 200 }, lifespan: { min: 300, max: 500 }, scale: { start: 0.4, end: 0 }, blendMode: 'ADD', tint: [0xffe066, 0xfff6c2] }],
  dust: ['soft', { speed: { min: 60, max: 200 }, lifespan: { min: 500, max: 900 }, scale: { start: 0.8, end: 2.2 }, alpha: { start: 0.6, end: 0 }, tint: [0xcdb89a, 0xa89277] }],
  debris: ['chunk', { speed: { min: 180, max: 420 }, angle: { min: 200, max: 340 }, lifespan: 800, scale: { min: 0.6, max: 1.3 }, gravityY: 900, rotate: { min: 0, max: 360 }, tint: [0x8a6d4e, 0x6b5a48, 0x9e8a6a] }],
  fire: ['glow', { speed: { min: 60, max: 360 }, lifespan: { min: 300, max: 700 }, scale: { start: 1.3, end: 0.1 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', color: [0xfff6b0, 0xffb02e, 0xff5a1a, 0x7a1d00], gravityY: -160 }],
  stars: ['star', { speed: { min: 140, max: 340 }, lifespan: 700, scale: { start: 0.9, end: 0.2 }, rotate: { min: 0, max: 360 }, gravityY: 500, tint: [0xffe14d, 0xfff6c2] }],
};

export function makeEmitters(scene, depth, budget = 1) {
  const em = {};
  for (const [name, [tex, cfg]] of Object.entries(PRESETS)) {
    em[name] = scene.add.particles(0, 0, tex, { ...cfg, emitting: false }).setDepth(depth);
  }
  em.burst = (name, n, x, y) => em[name].explode(Math.max(1, Math.round(n * budget)), x, y);
  return em;
}

/** A small seeded RNG for the scenery (the same road every play). */
export function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = Phaser.Math.Linear;
