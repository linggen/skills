// fx-memory.js — 银月的记忆是彩色的 in WebGL (哇时刻 ③, design.md § 画面效果 「her colour memories
// in WebGL」). The memory card (memory.js) blooms her picture from grey ink to colour with a CSS
// filter; here the colour SOAKS in instead, the way ink wicks through 宣纸 — from low in the
// picture's heart, a torn front with a warm light rim running just ahead, a soft glow where it
// began, a slow push in, faint paper grain. A reward brightens, never darkens: the rim is light.
//
// The card is redrawn with every render (its bloom's age rides in its markup), so the moment is
// not inside it: one canvas laid over the picture's box (`position: fixed`, following it each
// frame), started when a blooming picture appears and gone when it ends or the card goes. It runs
// on the card's own clock (`--mem-age`), so a redraw never restarts it and a late start begins
// where the bloom stands. Words are never painted — her lines stay the card's. No WebGL, reduced
// motion: the CSS bloom (or the colour at once) is all there is. Built on setpieces/painted.js
// (the soak, the camera, the grain) and fx.js's loaders: one Application per moment.
import { dropApp, glOK, loadGsap, loadPixi } from './fx.js';
import { BLOOM_MS } from './memory.js';
import { paintedStage } from './setpieces/painted.js';

/// The moment's clock (s): grey a breath, then the colour soaks in; the canvas fades off at the
/// end onto the card's picture, already in colour by then.
export const MEM_FX = { hold: 0.5, soak: 3.2, from: [0.5, 0.62], push: 1.05, fade: 0.6 };

/// CSS's `grayscale(1) sepia(a)` as one colour matrix (Pixi's 5×4, rows r g b a): the grey ink the
/// card's picture starts in, so the canvas takes over without a jump.
export function inkMatrix(a = 0.35) {
  const G = [0.2126, 0.7152, 0.0722];
  const S = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
  const sum = S.map((r) => r[0] + r[1] + r[2]);
  // A grey pixel (L, L, L) through sepia(a): each row's weight on L.
  const rowL = [0, 1, 2].map((i) => (1 - a) + a * sum[i]);
  const m = [];
  for (let i = 0; i < 3; i += 1) m.push(...G.map((g) => g * rowL[i]), 0, 0);
  m.push(0, 0, 0, 1, 0);
  return m;
}

/// How far the moment is at `age` ms of the bloom: {soak 0–1, push 0–1, gone 0–1 (the fade off)}.
export function memAt(age) {
  const t = age / 1000, F = MEM_FX;
  const soak = Math.min(1, Math.max(0, (t - F.hold) / F.soak));
  const end = BLOOM_MS / 1000;
  return { soak, push: Math.min(1, t / end), gone: Math.min(1, Math.max(0, (t - end) / F.fade)) };
}

const ageOf = (card) => -Number.parseFloat(card?.style.getPropertyValue('--mem-age') || '0') || 0;
const loadImage = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });

/// The moment over the picture of `card` (a `.card.memory`): resolves to {destroy()} or null.
/// `find()` the card now (the page may have redrawn it); it ends by itself.
export async function playMemoryBloom(find, src) {
  const [PIXI, gsap, im] = await Promise.all([loadPixi(), loadGsap(), loadImage(src)]);
  let card = find();
  const fig = () => card?.querySelector('.memfig');
  if (!fig()) return null;
  const host = document.createElement('div');
  host.className = 'fxmem';
  Object.assign(host.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '35', borderRadius: '4px', overflow: 'hidden' });
  document.body.appendChild(host);
  let box = fig().getBoundingClientRect();
  const W = 1000, H = Math.round(W * im.naturalHeight / im.naturalWidth);
  const app = new PIXI.Application();
  await app.init({ width: Math.max(1, box.width), height: Math.max(1, box.width * H / W), backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
  host.appendChild(app.canvas);
  const root = new PIXI.Container();
  app.stage.addChild(root);
  const stage = paintedStage({ PIXI, app, root, W, H, art: { grey: im, colour: im } });
  const view = { s: 1, fx: 0.5, fy: 0.5 };
  const ink = new PIXI.ColorMatrixFilter();
  ink.matrix = inkMatrix();
  const grey = stage.layer('grey', view, { filter: ink });
  grey.soak.v = 1;
  // The colour a touch bright while it comes (a reward brightens), easing to the picture's own.
  const lift = new PIXI.ColorMatrixFilter();
  const colour = stage.layer('colour', view, { from: MEM_FX.from, filter: lift, rim: { color: 0xfff1c8, blend: 'add', alpha: 0.35 } });
  const glow = colour.glow(MEM_FX.from[0], MEM_FX.from[1], 0.7);
  stage.grain();
  const tl = gsap.timeline({ paused: true });
  const end = BLOOM_MS / 1000;
  tl.to(view, { s: MEM_FX.push, duration: end, ease: 'sine.inOut' }, 0)
    .fromTo(colour.soak, { v: 0 }, { v: 1, duration: MEM_FX.soak, ease: 'power1.inOut' }, MEM_FX.hold)
    .fromTo(glow, { alpha: 0 }, { keyframes: [{ alpha: 0.5, duration: 0.8 }, { alpha: 0, duration: 2.2 }] }, MEM_FX.hold)
    .to(host, { opacity: 0, duration: MEM_FX.fade }, end);
  const lifted = () => { const k = 1 + 0.12 * (1 - Math.abs(colour.soak.v * 2 - 1)); lift.brightness(k, false); };

  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    app.ticker.remove(tick);
    tl.kill();
    stage.destroy();
    dropApp(app);
    host.remove();
  };
  // Each frame: the card's clock, the card's box (a redraw is a new card in the same place).
  const tick = () => {
    if (!card?.isConnected) card = find();
    const f = fig();
    if (!f) return destroy();
    const age = ageOf(card);
    if (age / 1000 >= tl.duration()) return destroy();
    box = f.getBoundingClientRect();
    host.style.transform = `translate(${box.left}px, ${box.top}px)`;
    if (Math.abs(app.screen.width - box.width) > 0.5) { app.renderer.resize(box.width, box.height); }
    root.scale.set(app.screen.width / W);
    tl.time(Math.max(0, age / 1000));
    lifted();
    stage.apply();
  };
  app.ticker.add(tick);
  tick();
  return { destroy };
}

/// Watch the page for a blooming memory (memory.js memoryCardHtml's `.memart.bloom`) and play the
/// moment over it — once per showing: a replay from the album is a new showing. One call, at start.
export function watchMemories(root = document.body) {
  if (!glOK() || typeof MutationObserver !== 'function') return null;
  const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = null, queued = false;
  const look = () => {
    queued = false;
    const card = root.querySelector('.card.memory:not(.still)');
    const art = card?.querySelector('.memart.bloom');
    if (!art) { playing = null; return; }
    // One showing: the memory's number and when its bloom began (the card's clock: a redraw is the
    // same showing; 再看一遍 starts the clock again, a new one).
    const n = card.dataset.mem, start = performance.now() - ageOf(card);
    if ((playing?.n === n && Math.abs(playing.start - start) < 1000) || still() || ageOf(card) > BLOOM_MS - 600) return;
    playing?.moment?.then((m) => m?.destroy());
    playing = { n, start };
    playing.moment = playMemoryBloom(() => root.querySelector(`.card.memory[data-mem="${CSS.escape(n)}"]`), art.currentSrc || art.src).catch(() => null);
  };
  const mo = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(look); } });
  mo.observe(root, { childList: true, subtree: true });
  look();
  return { stop: () => mo.disconnect() };
}
