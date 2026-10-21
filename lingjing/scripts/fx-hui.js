// fx-hui.js — a new 回 turns the page (design.md § 画面效果 「chapter transitions」). When 「新的一回」's
// seal rises (lingjing.js featNow), the stage's painting goes under fresh 宣纸 — the paper soaks over
// it from the middle, the way ink wicks, a light rim at its edge — so the seal stands on a blank title
// page; then the painting soaks back in from where the seal stood, and the canvas is gone. A book's
// page, not a curtain: nothing darkens, nothing is drawn but the paper and the painting already up.
//
// One canvas over the stage, under the seal (the seal and its words are the page's DOM, never
// painted), ~3.6 s — the seal's own time — then destroyed. No painting on the stage (今线's pale stage),
// no WebGL, reduced motion: nothing; the seal alone, as before. Built on setpieces/painted.js (the
// soak, the camera, the grain) and fx.js's loaders.
import { glOK, loadGsap, loadPixi } from './fx.js';
import { PAPER, paintedStage } from './setpieces/painted.js';

/// The turn's clock (s): the paper soaks over the painting, holds under the seal, the painting soaks back.
export const HUI_FX = { cover: 1.1, hold: 1.2, back: 1.3 };
export const HUI_MS = Math.round((HUI_FX.cover + HUI_FX.hold + HUI_FX.back) * 1000);

/// The painting's `fy` for painted.js frameOf that sits it where the CSS still sits it (`center 40%`):
/// a painting iw×ih covering W×H shows 40% of its overflow above.
export function fyOf(iw, ih, W, H) {
  const s = Math.max(W / iw, H / ih), h = ih * s;
  return h <= H ? 0.5 : (H / 2 - 0.4 * (H - h)) / h;
}

/* Rice paper as a picture: the paper colour with a faint fibre mottle, so the blank page is paper, not a fill. */
function paperCanvas(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = `#${PAPER.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, w, h);
  g.filter = 'blur(10px)';
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(${200 + Math.random() * 30 | 0},${190 + Math.random() * 30 | 0},${165 + Math.random() * 30 | 0},.18)`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/* The stage's painting now: the newest backdrop that is not leaving (paintBackdrop's `.bd`). */
function paintingOf(view) {
  const bd = [...view.querySelectorAll('#backdrop .bd:not(.going)')].at(-1);
  const m = bd?.style.getPropertyValue('--art').match(/url\("?(.*?)"?\)$/);
  return m ? new URL(m[1].replace(/%22/g, '"'), location.href).href : null;
}
const loadImage = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });

/// Turn the page on `view` (the stage, #view), starting after `delay` ms (the seal's own delay).
/// `seal` the seal's element: tapped away early, the painting comes back at once.
/// Resolves to {destroy()} or null (no painting, no WebGL, reduced motion).
export async function huiTurn(view, delay = 0, seal = null) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const src = view && paintingOf(view);
  if (!src || still || !glOK()) return null;
  const [PIXI, gsap, im] = await Promise.all([loadPixi(), loadGsap(), loadImage(src)]);
  const host = document.createElement('div');
  host.className = 'fxhui';
  Object.assign(host.style, { position: 'absolute', inset: '0', zIndex: '31', pointerEvents: 'none' });
  view.appendChild(host);
  const Wpx = Math.max(1, view.clientWidth), Hpx = Math.max(1, view.clientHeight);
  const app = new PIXI.Application();
  await app.init({ width: Wpx, height: Hpx, backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 1.5), autoDensity: true, preference: 'webgl' });
  host.appendChild(app.canvas);
  const W = 1000, H = Math.round(W * Hpx / Wpx);
  const root = new PIXI.Container();
  root.scale.set(Wpx / W);
  app.stage.addChild(root);
  const stage = paintedStage({ PIXI, app, root, W, H, art: { now: im, paper: paperCanvas(), back: im } });
  const view0 = { s: 1, fx: 0.5, fy: fyOf(im.naturalWidth, im.naturalHeight, W, H) };
  const light = { color: 0xfff6dc, blend: 'add', alpha: 0.3 };
  const now = stage.layer('now', view0);
  now.soak.v = 1;
  const paper = stage.layer('paper', { s: 1, fx: 0.5, fy: 0.5 }, { from: [0.5, 0.42], rim: light });
  // The painting comes back a breath closer, settling to where it stands.
  const backView = { ...view0, s: 1.04 };
  const back = stage.layer('back', backView, { from: [0.5, 0.42], rim: light });
  stage.grain();
  const F = HUI_FX;
  const tl = gsap.timeline({ paused: true, delay: delay / 1000 });
  tl.fromTo(paper.soak, { v: 0 }, { v: 1, duration: F.cover, ease: 'power1.inOut' }, 0)
    .fromTo(back.soak, { v: 0 }, { v: 1, duration: F.back, ease: 'power1.inOut' }, F.cover + F.hold)
    .to(backView, { s: 1, duration: F.back + 0.4, ease: 'sine.out' }, F.cover + F.hold)
    .to(host, { opacity: 0, duration: 0.3 }, F.cover + F.hold + F.back);
  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    tl.kill();
    stage.destroy();
    app.destroy(true, { children: true });
    host.remove();
  };
  tl.eventCallback('onComplete', destroy);
  stage.apply();
  tl.play();
  // A page that went away mid-turn (a reload of the stage, a fight) takes the turn with it; a seal
  // tapped away before the paper's hold is over sends the painting back now.
  const backAt = F.cover + F.hold;
  const watch = setInterval(() => {
    if (dead || !host.isConnected) { clearInterval(watch); destroy(); return; }
    if (seal && !seal.isConnected && tl.time() < backAt) tl.time(backAt);
  }, 200);
  return { destroy };
}
