// fx-hui.js — a new 回 turns the page (design.md § 画面效果 「chapter transitions」). When 「新的一回」's
// seal rises (lingjing.js featNow), the stage's painting goes under fresh 宣纸 — the paper soaks over
// it from the middle, the way ink wicks, a light rim at its edge — so the seal stands on a blank title
// page; then the painting soaks back in from where the seal stood, and the layer is gone. A book's
// page, not a curtain: nothing darkens, nothing is drawn but the paper and the painting already up.
//
// The `moment` layer of the stage's one Phaser game (kit/stage.js), over the stage, under the seal
// (the seal and its words are the page's DOM, never painted), ~3.6 s — the seal's own time — then
// the layer ends and the game stays. The soak is kit/fx/ink.js's (one shader pass a painting), the
// clock kit/timeline.js. No painting on the stage (今线's pale stage), no WebGL, reduced motion:
// nothing; the seal alone, as before.
import { glOK } from './fx.js';
import { grainCanvas, soakLayer } from './kit/fx/ink.js';
import { stageOf } from './kit/stage.js';
import { timeline } from './kit/timeline.js';
import { PAPER, frameOf } from './setpieces/painted.js';

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

const LIGHT = { color: 0xfff6dc, blend: 'add', alpha: 0.3 };
const FROM = [0.5, 0.42]; // where the seal stands: the paper soaks from there, and the painting back

/* The turn as a scene on the stage game: `this` the Phaser scene; `d` {host, im, delay, done()}. */
const huiScene = {
  create(d) {
    const { host, im } = d;
    const W = 1000, H = Math.round(W * host.size.h / host.size.w), k = this.scale.width / W;
    const rect = this.add.rectangle(0, 0, W * k, H * k, PAPER).setOrigin(0);
    const nowKey = host.texture('moment', im), paperKey = host.texture('moment', paperCanvas()), grainKey = host.texture('moment', grainCanvas());
    const view0 = { s: 1, fx: 0.5, fy: fyOf(im.naturalWidth, im.naturalHeight, W, H) };
    const backView = { ...view0, s: 1.04 }; // the painting comes back a breath closer, settling to where it stands
    const at = { W, H, k, from: FROM, rim: LIGHT };
    const layers = [
      [soakLayer(host.Phaser, this, nowKey, at), view0],
      [soakLayer(host.Phaser, this, paperKey, at), { s: 1, fx: 0.5, fy: 0.5 }],
      [soakLayer(host.Phaser, this, nowKey, at), backView],
    ];
    const [now, paper, back] = layers.map(([L]) => L);
    now.soak.v = 1;
    const grain = this.add.tileSprite(0, 0, W * k, H * k, grainKey).setOrigin(0).setTileScale(k).setAlpha(0.07).setBlendMode(host.Phaser.BlendModes.MULTIPLY);
    const fade = { a: 1 };
    const F = HUI_FX;
    const tl = timeline({ delay: d.delay / 1000, onComplete: () => d.done() })
      .fromTo(paper.soak, { v: 0 }, { v: 1, duration: F.cover, ease: 'power1.inOut' }, 0)
      .fromTo(back.soak, { v: 0 }, { v: 1, duration: F.back, ease: 'power1.inOut' }, F.cover + F.hold)
      .to(backView, { s: 1, duration: F.back + 0.4, ease: 'sine.out' }, F.cover + F.hold)
      .to(fade, { a: 0, duration: 0.3 }, F.cover + F.hold + F.back);
    // Each frame: every painting where its camera and soak say; one wholly soaked hides those under it.
    this.apply = () => {
      let covered = false;
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const [L, v] = layers[i];
        L.place(frameOf(v, L.iw, L.ih, W, H));
        L.image.setAlpha(fade.a);
        L.apply();
        if (covered) L.image.setVisible(false);
        if (L.soak.v >= 1) covered = true;
      }
      rect.setAlpha(fade.a).setVisible(!covered);
      grain.setAlpha(0.07 * fade.a);
    };
    this.tl = tl;
    this.apply();
  },
  update(time, delta) {
    this.tl.tick(Math.min(0.1, delta / 1000));
    this.apply();
  },
};

/// Turn the page on `view` (the stage, #view), starting after `delay` ms (the seal's own delay).
/// `seal` the seal's element: tapped away early, the painting comes back at once.
/// Resolves to {destroy()} or null (no painting, no WebGL, reduced motion).
export async function huiTurn(view, delay = 0, seal = null) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const src = view && paintingOf(view);
  if (!src || still || !glOK()) return null;
  const [host, im] = await Promise.all([stageOf(view), loadImage(src)]);
  if (!host) return null;
  let scene = null, dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    clearInterval(watch);
    if (host.owns('moment', scene)) host.stop('moment');
  };
  // A seal tapped away before the paper's hold is over sends the painting back now; a turn whose
  // layer was taken (the stage put away, another moment) is over.
  const backAt = HUI_FX.cover + HUI_FX.hold;
  const watch = setInterval(() => {
    if (!scene) return;
    if (!host.owns('moment', scene)) { destroy(); return; }
    if (seal && !seal.isConnected && scene.tl.time() < backAt) scene.tl.time(backAt);
  }, 200);
  scene = await host.run('moment', huiScene, { host, im, delay, done: () => destroy() });
  return { destroy };
}
