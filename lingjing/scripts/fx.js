// fx.js — 画面效果 in WebGL: the 鼎归 moment (哇时刻 ①) drawn with PixiJS and
// choreographed with GSAP (both vendored in scripts/vendor/, never a CDN).
//
// Loaded only when the moment plays: Pixi by dynamic import(), GSAP by a
// script tag (its UMD build sets window.gsap). One Application per moment,
// destroyed on close, so it never fights the pet stage's WebGL. The SVG
// version (inkmap.js) stays the fallback — no WebGL, reduced motion, tests.
//
// The picture: rice paper; the painted map (jiuzhou-ink.webp) faint in every
// walked province and whole where a 鼎 is home, each clipped to its province;
// the moment's province soaks in from the find spot — a white disc grown in
// an offscreen texture, torn by a DisplacementFilter over a paper-fibre noise
// and blurred soft, used as the painting's mask — with a darker bleed ring at
// the edge that fades. A fine grain lies over all of it. What must stay crisp
// (borders, rivers, seal, moon) is the SVG overlay above the canvas; the words
// are the card's own DOM.
import { camOf, HOMING_MS, inkMapSvg } from './inkmap.js';

const PIXI_URL = new URL('./vendor/pixi-8.21.0.min.mjs', import.meta.url).href;
const GSAP_URL = new URL('./vendor/gsap-3.15.0.min.js', import.meta.url).href;

let pixiP = null, gsapP = null;
/// How long the libraries took on first open (ms), for the log and the report.
export const fxTimes = { pixi: null, gsap: null };

export function loadPixi() {
  if (!pixiP) {
    const t = performance.now();
    pixiP = import(PIXI_URL).then((m) => { fxTimes.pixi = Math.round(performance.now() - t); return m; });
  }
  return pixiP;
}
export function loadGsap() {
  if (!gsapP) {
    const t = performance.now();
    gsapP = globalThis.gsap ? Promise.resolve(globalThis.gsap) : new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = GSAP_URL;
      s.onload = () => { fxTimes.gsap = Math.round(performance.now() - t); ok(globalThis.gsap); };
      s.onerror = () => { gsapP = null; no(new Error('gsap did not load')); };
      document.head.appendChild(s);
    });
  }
  return gsapP;
}

/// Whether this browser can draw WebGL at all (the fallback is the SVG moment).
export function glOK() {
  try {
    const c = globalThis.document?.createElement('canvas');
    return Boolean(c && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/* ── Textures made on the spot: no image files ── */

/// Paper fibres: short soft strokes in every direction over blotches — the
/// displacement that tears the ink's edge like 宣纸 wicking it.
function fibreCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  g.filter = 'blur(6px)';
  for (let i = 0; i < 90; i += 1) {
    g.fillStyle = `rgb(${Math.random() * 255 | 0},${Math.random() * 255 | 0},128)`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 6 + Math.random() * 26, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'blur(1px)';
  g.lineCap = 'round';
  for (let i = 0; i < 260; i += 1) {
    const x = Math.random() * size, y = Math.random() * size, a = Math.random() * Math.PI, l = 6 + Math.random() * 22;
    g.strokeStyle = `rgba(${Math.random() * 255 | 0},${Math.random() * 255 | 0},128,0.6)`;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

/// Rice-paper grain: fine speckle, laid over everything very faintly.
function grainCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 150 + Math.random() * 105 | 0;
    img.data[i] = v; img.data[i + 1] = v - 6; img.data[i + 2] = v - 18; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const provinceSvg = (d) => `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#ffffff"/></svg>`;

/// The moment in `slot` (the card's empty map box). Resolves to
/// {host, skip(), destroy()} — or throws, and the page draws the SVG moment.
/// `still` (reduced motion) is the last frame at once.
export async function playHoming(slot, { geo, ink, province, frame, paint, names = {}, labels = {}, lang = 'zh', still = false }) {
  const [PIXI, gsap] = await Promise.all([loadPixi(), loadGsap()]);
  const host = document.createElement('div');
  host.className = 'fxhost';
  slot.appendChild(host);
  const width = Math.max(200, slot.clientWidth || 460), height = Math.round(width * geo.h / geo.w);
  const app = new PIXI.Application();
  await app.init({ width, height, backgroundAlpha: 0, antialias: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
  host.appendChild(app.canvas);
  // The crisp layer: borders, rivers, seals, moons — the SVG's own, in overlay mode.
  host.insertAdjacentHTML('beforeend', inkMapSvg(geo, ink, { names, labels, lang, moment: { province, frame }, id: 'fx', overlay: true }));
  const svg = host.querySelector('svg.inkmap');

  const pv = ink.provinces;
  const root = new PIXI.Container();
  root.scale.set(width / geo.w);
  app.stage.addChild(root);
  const cam = new PIXI.Container();
  root.addChild(cam);
  cam.addChild(new PIXI.Graphics().rect(0, 0, geo.w, geo.h).fill(0xf5efe1));

  // The painting, from a fresh image each moment: a texture cached across Applications
  // is left bound to a destroyed renderer (seen live: a second moment drew blank paper).
  const img = new Image();
  img.src = paint.href;
  await img.decode();
  const tex = PIXI.Texture.from(img);
  const painting = (alpha) => { const s = new PIXI.Sprite(tex); s.width = geo.w; s.height = geo.h; s.alpha = alpha; return s; };
  const clipped = (p) => {
    const c = new PIXI.Container();
    const m = new PIXI.Graphics().svg(provinceSvg(geo.provinces[p]));
    c.addChild(m);
    c.mask = m;
    cam.addChild(c);
    return c;
  };
  for (const p of Object.keys(geo.provinces)) {
    if (p === province || !['wash', 'ink'].includes(pv[p]?.state)) continue;
    clipped(p).addChild(painting(pv[p].state === 'ink' ? 1 : 0.3));
  }

  // The soak: a white disc grown offscreen, torn by paper fibres, softened, and used as the painting's mask.
  const find = (pv[province].home?.map ?? [0.5, 0.5]).map((v, i) => v * (i ? geo.h : geo.w));
  const R = Math.max(frame.w * geo.w, frame.h * geo.h) * 1.25;
  const fibreTex = PIXI.Texture.from(fibreCanvas());
  fibreTex.source.addressMode = 'repeat';
  // A displacement map is a sprite placed in the scene: one beside the mask's disc, one beside the bleed.
  const fibresOf = () => { const f = new PIXI.Sprite(fibreTex); f.scale.set(R / 160); f.renderable = false; return f; };
  const fibres = fibresOf(), fibres2 = fibresOf();
  const K = 0.5; // the mask's texture at half the map's units: soft enough, and cheap
  const soakSrc = new PIXI.Container();
  soakSrc.scale.set(K);
  const blob = new PIXI.Graphics().circle(0, 0, R).fill(0xffffff);
  blob.position.set(find[0], find[1]);
  blob.scale.set(0.001);
  const tear = new PIXI.DisplacementFilter({ sprite: fibres, scale: R * 0.22 });
  blob.filters = [tear, new PIXI.BlurFilter({ strength: 4, quality: 3 })];
  soakSrc.addChild(fibres, blob);
  const rt = PIXI.RenderTexture.create({ width: Math.ceil(geo.w * K), height: Math.ceil(geo.h * K) });
  const soakMask = new PIXI.Sprite(rt);
  soakMask.scale.set(1 / K);

  const here = clipped(province);
  here.addChild(painting(0.15)); // fainter than a walked province, so the soak reads
  const whole = painting(1);
  here.addChild(whole, soakMask);
  whole.mask = soakMask;
  const bleed = new PIXI.Graphics().circle(0, 0, R).stroke({ width: R * 0.008, color: 0x231f1a, alpha: 1 });
  bleed.position.set(find[0], find[1]);
  bleed.scale.set(0.001);
  bleed.alpha = 0;
  // The same tear as the mask's edge, so the ring rides the soak's rim.
  bleed.filters = [new PIXI.DisplacementFilter({ sprite: fibres2, scale: R * 0.22 }), new PIXI.BlurFilter({ strength: 1.5 })];
  here.addChild(bleed, fibres2);
  const drop = new PIXI.Graphics().circle(0, 0, geo.w * 0.006).fill(0x231f1a);
  drop.position.set(find[0], find[1] - geo.h * 0.12);
  drop.alpha = 0;
  cam.addChild(drop);

  const grainTex = PIXI.Texture.from(grainCanvas());
  grainTex.source.addressMode = 'repeat';
  const grain = new PIXI.TilingSprite({ texture: grainTex, width: geo.w, height: geo.h });
  grain.alpha = 0.1;
  grain.blendMode = 'multiply';
  root.addChild(grain);

  // Each frame: the camera where the timeline has it (never a tween callback, which a seek may skip), then the soak's mask.
  let aim = () => {};
  const drawSoak = () => { aim(); app.renderer.render({ container: soakSrc, target: rt, clear: true }); };
  app.ticker.add(drawSoak);

  // One timeline: the camera, the drop, the soak and its bleed, the rivers, the seal (and a small shake), the water, the moons.
  const target = camOf(geo, frame);
  const view = { s: 1, tx: 0, ty: 0 };
  const svgCam = svg.querySelector('.cam');
  aim = () => {
    cam.scale.set(view.s); cam.position.set(view.tx, view.ty);
    svgCam.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
  };
  drawSoak();
  const at = (ms) => ms / 1000;
  const rivers = svg.querySelectorAll('.rivers.draw path');
  const seal = svg.querySelector('.inkseal.thud .sealbody');
  const waters = svg.querySelectorAll('.waters path');
  const moons = svg.querySelectorAll('.inkmoon .moonbody');
  gsap.set(rivers, { strokeDasharray: 1, strokeDashoffset: 1 });
  if (seal) gsap.set(seal, { opacity: 0, scale: 2.4, transformOrigin: '50% 50%' });
  gsap.set(moons, { opacity: 0, y: 6 });
  const tl = gsap.timeline({ paused: true });
  tl.to(view, { s: target.s, tx: target.tx, ty: target.ty, duration: 1.4, ease: 'power2.inOut' }, at(HOMING_MS.zoom))
    .to(drop, { alpha: 1, duration: 0.25 }, at(HOMING_MS.drop))
    .to(drop.position, { y: find[1], duration: 0.4, ease: 'power2.in' }, at(HOMING_MS.drop))
    .to(drop, { alpha: 0, duration: 0.3 }, at(HOMING_MS.spread) + 0.05)
    .to([blob.scale, bleed.scale], { x: 1, y: 1, duration: 3, ease: 'power1.inOut' }, at(HOMING_MS.spread))
    .to(bleed, { keyframes: [{ alpha: 0.45, duration: 0.5 }, { alpha: 0.2, duration: 1.6 }, { alpha: 0, duration: 0.9 }] }, at(HOMING_MS.spread))
    .to(rivers, { strokeDashoffset: 0, duration: 1.6, ease: 'power1.out', stagger: 0.02 }, at(HOMING_MS.rivers))
    .to(waters, { keyframes: [{ strokeWidth: 7, duration: 0.6 }, { strokeWidth: 1, duration: 1 }] }, at(HOMING_MS.rise))
    .to(moons, { opacity: 1, y: 0, duration: 1.2, ease: 'power2.out' }, at(HOMING_MS.moons));
  if (seal) {
    tl.to(seal, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2.2)' }, at(HOMING_MS.seal))
      .to(host, { keyframes: [{ x: 3, y: 1, duration: 0.05 }, { x: -3, y: -1, duration: 0.05 }, { x: 2, y: -1, duration: 0.05 }, { x: 0, y: 0, duration: 0.05 }] }, at(HOMING_MS.seal) + 0.3);
  }
  if (still) { tl.progress(1); drawSoak(); } else tl.play();

  let gone = false;
  return {
    host,
    skip() { tl.progress(1); drawSoak(); },
    done: () => tl.progress() >= 1,
    destroy() {
      if (gone) return;
      gone = true;
      tl.kill();
      app.ticker.remove(drawSoak);
      rt.destroy(true);
      app.destroy(true, { children: true });
      for (const t of [tex, fibreTex, grainTex]) t.destroy(true);
      host.remove();
    },
  };
}
