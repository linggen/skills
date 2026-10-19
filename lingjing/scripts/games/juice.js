// juice.js — 射鹿's feel (Hanli 10-19: 「能做到愤怒小鸟那个水平吗?」): what the eye and the ear get
// from the physics, drawn at the screen's rate. Draws and plays only; nothing here runs in node and
// nothing here changes a shot (the world's own cues — smash.js `cue` — are only read).
//
//   particles  painted pieces (games.json `art`: specks · dust · chip · straw · grass · splash · leaf)
//              thrown from where a thing broke, an arrow struck or the stag bolted, on a canvas laid
//              over the scene (one per board, kept by the repaint: morph leaves a canvas alone);
//   camera     in flight the view leans in after the arrow and eases back when it lands;
//   shake      a short damped shake on a heart hit and a big collapse;
//   sound      CC0 clips (worlds/jiuding/sound/deer, CREDITS.md), behind a mute remembered per browser.
// Reduced motion: no camera, no shake, no particles; the sound stays (it is behind its own toggle).
import { still } from './ink.js';

const W = 480, H = 300, DPR = 2;
const SOUNDS = ['creak', 'twang', 'whoosh', 'thud', 'grass', 'splash', 'snap', 'crack', 'wood', 'logs', 'shatter', 'straw', 'stone', 'hit', 'bolt', 'chime', 'pop'];
const soundUrl = (k) => new URL(`../../worlds/jiuding/sound/deer/${k}.mp3`, import.meta.url).href;
const KEY = 'lj.deer.mute';

/* ── Sound ─────────────────────────────────────────────────────────────────────────────────── */

let ctx = null, buffers = null, unlocked = false;
export function muted() {
  try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; }
}
function setMuted(v) {
  try { globalThis.localStorage?.setItem(KEY, v ? '1' : '0'); } catch { /* a private window: this page only */ }
  memMute = v;
}
let memMute = null;
const isMuted = () => (memMute ?? muted());

function unlock() {
  if (unlocked || typeof AudioContext === 'undefined') return;
  unlocked = true;
  ctx = new AudioContext();
  buffers = {};
  for (const k of SOUNDS) {
    fetch(soundUrl(k)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => { buffers[k] = buf; }).catch(() => {});
  }
}
/** Play a clip: `vol` 0–1, `rate` its speed (a little variety: no two cracks the same). */
export function play(k, vol = 1, rate = 1) {
  if (!ctx || isMuted() || !buffers?.[k]) return;
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffers[k];
  src.playbackRate.value = rate;
  g.gain.value = Math.max(0, Math.min(1, vol));
  src.connect(g).connect(ctx.destination);
  src.start();
}

if (typeof document !== 'undefined') {
  // The first touch anywhere opens the ear (a browser plays nothing before one).
  document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  // The mute toggle on the board (never a game verb: the board's state knows nothing of it).
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-da-mute]');
    if (!b) return;
    const now = !isMuted();
    setMuted(now);
    b.setAttribute('aria-pressed', String(now));
    b.textContent = muteLabel(now, b.dataset.lang);
    if (!now) { unlock(); play('pop', 0.6); }
  });
}
export const muteLabel = (m, lang = 'zh') => (lang === 'en' ? (m ? 'Sound off' : 'Sound on') : (m ? '静音' : '有声'));

/* ── Images ─────────────────────────────────────────────────────────────────────────────────── */

const IMGS = new Map();
function img(url) {
  if (!url) return null;
  let im = IMGS.get(url);
  if (!im) { im = new Image(); im.src = url; IMGS.set(url, im); }
  return im.complete && im.naturalWidth ? im : null;
}

/* ── What each cue looks and sounds like ───────────────────────────────────────────────────── */

// [sound, volume, particles: [art key, count, size, speed, up, gravity, life ms], shake, camera kick]
const LOOKS = {
  twang: { s: ['twang', 0.8], also: ['whoosh', 0.45, 70] },
  creak: { s: ['creak', 0.35] },
  thud: { s: ['thud', 0.7], p: [['dust', 3, 22, 0.6, 0.6, 0.02, 650], ['grass', 3, 12, 1.4, 1.6, 0.12, 700]] },
  grass: { s: ['grass', 0.6], p: [['grass', 3, 11, 1.2, 1.2, 0.1, 600]] },
  splash: { s: ['splash', 0.8], p: [['splash', 1, 34, 0, 0, 0, 520], ['specks', 2, 14, 1.4, 1.8, 0.1, 600]] },
  snap: { s: ['snap', 0.8], p: [['straw', 5, 12, 1.6, 1.4, 0.08, 900], ['specks', 2, 12, 1.2, 1, 0.08, 500]] },
  crack: { s: ['crack', 0.9], p: [['chip', 6, 10, 2, 1.8, 0.14, 1000], ['dust', 2, 24, 0.5, 0.4, 0.01, 700]], shake: 2 },
  wood: { s: ['wood', 0.8], p: [['chip', 3, 8, 1.5, 1.4, 0.14, 800], ['dust', 1, 18, 0.4, 0.3, 0.01, 600]] },
  logs: { s: ['logs', 1], p: [['dust', 4, 30, 0.6, 0.5, 0.01, 900]], shake: 3 },
  shatter: { s: ['shatter', 0.9], p: [['specks', 3, 16, 2.2, 1.8, 0.12, 700], ['dust', 2, 26, 0.6, 0.5, 0.01, 800]], shake: 2.5 },
  clink: { s: ['stone', 0.5] },
  straw: { s: ['straw', 0.9], p: [['straw', 9, 14, 2.2, 2, 0.06, 1300], ['dust', 2, 26, 0.5, 0.5, 0.01, 800]], shake: 1.5 },
  stone: { s: ['stone', 0.8], p: [['dust', 2, 14, 0.8, 0.8, 0.02, 500], ['specks', 1, 10, 1, 1, 0.1, 400]] },
  hit: { s: ['hit', 1], also: ['bolt', 0.8, 260], p: [['specks', 6, 20, 2.6, 2, 0.12, 900], ['dust', 2, 30, 0.7, 0.6, 0.01, 800]], shake: 4 },
  bolt: { s: ['bolt', 0.9], p: [['grass', 4, 12, 1.4, 1.6, 0.12, 700], ['dust', 3, 26, 0.6, 0.4, 0.01, 800]] },
  chime: { s: ['chime', 0.7] },
  pop: { s: ['pop', 0.6] },
};

/* ── The per-board state (keyed by the world: a new level is a new world) ─────────────────── */

const FX = new WeakMap();
function fxOf(w) {
  let f = FX.get(w);
  if (!f) { f = { read: w.cueN ?? 0, parts: [], shake: 0, cam: { x: W / 2, y: H / 2, z: 1 }, last: performance.now(), flying: 0 }; FX.set(w, f); }
  return f;
}

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function spawn(f, art, c, [key, count, size, speed, up, grav, life]) {
  const a = art?.[key];
  if (!a?.file) return;
  const url = new URL(`../../worlds/jiuding/art/${a.file}`, import.meta.url).href;
  const k = 0.5 + (c.p ?? 1) * 0.7;
  for (let i = 0; i < count; i++) {
    const ang = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.3;
    const v = speed * k * (0.5 + rnd());
    f.parts.push({ url, x: c.at[0] + (rnd() - 0.5) * 6, y: c.at[1] + (rnd() - 0.5) * 6, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - up * k * rnd() * 0.6,
      r: rnd() * 6.28, vr: (rnd() - 0.5) * 0.3, s: size * (0.6 + rnd() * 0.6) * (key === 'splash' || key === 'dust' ? k : 1), g: grav, life, age: 0, grow: key === 'dust' ? 0.9 : key === 'splash' ? 0.5 : 0 });
  }
  if (f.parts.length > 160) f.parts.splice(0, f.parts.length - 160);
}

/** New cues since the last frame: their sound, their particles, their shake. */
function hear(f, w, calm) {
  const cues = w.cues ?? [];
  for (const c of cues) {
    if (c.n <= f.read) continue;
    f.read = c.n;
    const look = LOOKS[c.k];
    if (!look) continue;
    const vol = look.s[1] * (0.45 + 0.55 * Math.min(1, c.p ?? 1));
    play(look.s[0], vol, 0.92 + rnd() * 0.16);
    if (look.also) setTimeout(() => play(look.also[0], look.also[1]), look.also[2]);
    if (calm) continue;
    for (const p of look.p ?? []) spawn(f, w.art, c, p);
    if (look.shake) f.shake = Math.max(f.shake, look.shake * (c.big ? 1.4 : 1) * (0.5 + 0.5 * (c.p ?? 1)));
  }
}

/** The camera: in flight it leans in on the arrow (a little closer, the arrow ahead of centre);
    otherwise it eases home. A pure function of what it was and where the arrow is. */
function steer(f, w, dt) {
  const ar = w.arrow, fly = ar && !ar.done && w.phase === 'fly';
  const goal = fly ? { x: Math.max(W / 2 / 1.22, Math.min(W - W / 2 / 1.22, ar.body.position.x - 30)), y: Math.max(H / 2 / 1.22, Math.min(H - H / 2 / 1.22, ar.body.position.y + 10)), z: 1.22 } : { x: W / 2, y: H / 2, z: 1 };
  const k = 1 - Math.exp(-dt / (fly ? 260 : 420));
  f.cam.x += (goal.x - f.cam.x) * k;
  f.cam.y += (goal.y - f.cam.y) * k;
  f.cam.z += (goal.z - f.cam.z) * k;
}

/** The view's transform (the camera and the shake), for the scene's world group and the canvas. */
function viewOf(f) {
  const { x, y, z } = f.cam;
  const sx = f.shake ? (rnd() - 0.5) * 2 * f.shake : 0, sy = f.shake ? (rnd() - 0.5) * 2 * f.shake : 0;
  return { z, tx: W / 2 - x * z + sx, ty: H / 2 - y * z + sy };
}

/** One frame for a board: called by deerarc.js's painter at the screen's rate. */
export function frame(svg, w) {
  const f = fxOf(w), now = performance.now(), dt = Math.min(64, now - f.last), calm = still();
  f.last = now;
  hear(f, w, calm);
  if (calm) { w.view = null; return; }
  steer(f, w, dt);
  f.shake *= Math.exp(-dt / 90);
  if (f.shake < 0.05) f.shake = 0;
  const v = viewOf(f);
  // The view rides on the world (deerarc.js html() writes it too, so a repaint never snaps it back).
  w.view = Math.abs(v.z - 1) < 0.002 && !f.shake && Math.abs(v.tx) < 0.05 && Math.abs(v.ty) < 0.05 ? null : v;
  const g = svg.querySelector('.g-da-world');
  if (g) {
    if (w.view) g.setAttribute('transform', viewAttr(w.view));
    else g.removeAttribute('transform');
  }
  paintParts(svg, f, dt, w.view);
}

export const viewAttr = (v) => `translate(${v.tx.toFixed(2)} ${v.ty.toFixed(2)}) scale(${v.z.toFixed(4)})`;

function paintParts(svg, f, dt, view) {
  const cv = svg.parentElement?.querySelector('canvas[data-fx]');
  if (!cv) return;
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  if (!f.parts.length) return;
  const k = cv.width / W;
  c.setTransform(k, 0, 0, k, 0, 0);
  if (view) { c.translate(view.tx, view.ty); c.scale(view.z, view.z); }
  const step = dt / 16.67;
  f.parts = f.parts.filter((p) => {
    p.age += dt;
    if (p.age > p.life) return false;
    p.vy += p.g * step;
    p.vx *= 0.985;
    p.x += p.vx * step;
    p.y += p.vy * step;
    if (p.g && p.y > 250) { p.y = 250; p.vy *= -0.25; p.vx *= 0.6; p.vr *= 0.6; } // they come to rest in the grass
    p.r += p.vr * step;
    const im = img(p.url);
    if (!im) return true;
    const life = p.age / p.life, s = p.s * (1 + p.grow * life);
    c.globalAlpha = life < 0.7 ? 1 : 1 - (life - 0.7) / 0.3;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.r * (p.grow ? 0.1 : 1));
    const ar = im.naturalHeight / im.naturalWidth;
    c.drawImage(im, -s / 2, (-s * ar) / 2, s, s * ar);
    c.restore();
    return true;
  });
  c.globalAlpha = 1;
}

export { DPR };
