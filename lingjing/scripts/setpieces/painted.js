// setpieces/painted.js — what every painted set piece shares (漳水立起, 筑基天象).
// His ruling (2026-09-30, the code-drawn pieces were 「太假」): paint first, then
// animate. A piece is a few paintings; code only moves a camera over each one
// (a pan, a push), soaks one into the next the way ink wicks through 宣纸 (the
// 鼎归 soak: a disc torn by paper fibres, used as the painting's mask, with a wet
// dark rim running just ahead), lays a faint grain over all, and brightens a few
// glows the paintings already hold. Nothing pictorial is drawn here.
import { fibreCanvas, grainCanvas } from '../fx.js';

export const PAPER = 0xf5efe1, INK = 0x2a241e;
export const SOAK_S = 2.4; // seconds for a painting to soak in over the last
const RIM = 0.008; // the wet rim's width, as a share of the soak's reach
const RIM_INK = 0.55; // how dark the wet rim goes (multiplied over the painting under it)
const K = 0.5; // the masks drawn at half size: soft and cheap
const PW = 1536, PH = 1024; // a painting's size when its file is missing

/// A soft round light (the paintings' own glows, brightened): white at the
/// heart, gone at the rim — no edge.
export function glowCanvas(size = 256, [r0, g0, b0] = [255, 240, 200]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${r0},${g0},${b0},0.9)`);
  grad.addColorStop(0.35, `rgba(${r0},${g0},${b0},0.4)`);
  grad.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/// Where the camera sits for `view` ({s: zoom over the cover fit, fx/fy: the
/// point held at the frame's centre; optional dx: a drift across it}) —
/// never showing past the painting.
export function frameOf(view, iw, ih, W, H) {
  const s = Math.max(W / iw, H / ih) * view.s;
  const w = iw * s, h = ih * s;
  const x = Math.min(0, Math.max(W - w, W / 2 - (view.fx + (view.dx ?? 0)) * w));
  const y = Math.min(0, Math.max(H - h, H / 2 - view.fy * h));
  return { s, x, y };
}

/// The stage under `root`: paper, then the paintings' layers as `layer()` adds
/// them (each above the last), then the grain (`grain()`, once, last). The
/// ticker puts every camera and soak where its values say.
export function paintedStage({ PIXI, app, root, W, H, art }) {
  const made = []; // textures and render targets to free
  const tex = {};
  for (const [k, im] of Object.entries(art)) if (im) made.push(tex[k] = PIXI.Texture.from(im));
  root.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill(PAPER));
  const fibreTex = PIXI.Texture.from(fibreCanvas());
  fibreTex.source.addressMode = 'repeat';
  made.push(fibreTex);
  const R = Math.hypot(W, H) * 1.15; // a soak from anywhere covers the frame
  const glowTex = PIXI.Texture.from(glowCanvas());
  made.push(glowTex);
  const rtOf = () => { const t = PIXI.RenderTexture.create({ width: Math.ceil(W * K), height: Math.ceil(H * K) }); made.push(t); return t; };
  const layers = [];

  /// The soak's mask source: a disc grown in an offscreen texture, torn by paper
  /// fibres twice (the front's broad wander, the fine fibres at its lip).
  const soakSource = ([ox, oy]) => {
    const fibres = new PIXI.Sprite(fibreTex);
    fibres.scale.set(R / 160);
    fibres.renderable = false;
    const fine = new PIXI.Sprite(fibreTex);
    fine.scale.set(R / 900);
    fine.renderable = false;
    const blob = new PIXI.Graphics().circle(0, 0, R).fill(0xffffff);
    blob.position.set(ox * W, oy * H);
    blob.scale.set(0.001);
    const sheet = new PIXI.Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.001 });
    const soakLayer = new PIXI.Container();
    soakLayer.addChild(sheet, blob);
    const soften = new PIXI.BlurFilter({ strength: 1.2, quality: 2 });
    soakLayer.filters = [new PIXI.DisplacementFilter({ sprite: fibres, scale: R * 0.22 }), new PIXI.DisplacementFilter({ sprite: fine, scale: R * 0.012 }), soften];
    const src = new PIXI.Container();
    src.scale.set(K);
    src.addChild(fibres, fine, soakLayer);
    return { src, blob, soften };
  };
  const maskOf = (t) => { const m = new PIXI.Sprite(t); m.scale.set(1 / K); return m; };

  /// One use of painting `key`: its own camera (`view`, a live object the beats
  /// tween — two uses may share one), its own soak (`soak.v`: 0 unseen … 1 whole)
  /// grown from `from` (0–1 of the frame). `filter`: a filter on the painting,
  /// `each()`: what else follows the view every frame (the filter's own values).
  const layer = (key, view, { from = [0.5, 0.5], filter = null, each = null } = {}) => {
    const t = tex[key];
    const whole = new PIXI.Container();
    const pic = new PIXI.Container();
    const cam = new PIXI.Container();
    cam.addChild(t ? new PIXI.Sprite(t) : new PIXI.Graphics().rect(0, 0, PW, PH).fill(0xd9cfbb));
    if (filter) cam.filters = [filter];
    pic.addChild(cam);
    const iw = t?.width ?? PW, ih = t?.height ?? PH;
    const { src, blob, soften } = soakSource(from);
    const rt = rtOf(), rimRt = rtOf();
    // The wet rim: the same torn disc a little ahead, masking a wash of ink over what
    // lies under — where the new painting eats the old, the old goes dark and wet first.
    const rimMask = maskOf(rimRt);
    const rim = new PIXI.Graphics().rect(0, 0, W, H).fill(INK);
    rim.blendMode = 'multiply';
    rim.alpha = 0;
    rim.mask = rimMask;
    const mask = maskOf(rt);
    whole.addChild(rim, rimMask, pic, mask);
    pic.mask = mask;
    root.addChild(whole);
    const soak = { v: 0 };
    let drawn = -1;
    const drawSoak = () => {
      drawn = soak.v;
      blob.scale.set(Math.max(0.001, soak.v + RIM));
      soften.strength = 1.5;
      app.renderer.render({ container: src, target: rimRt, clear: true });
      blob.scale.set(Math.max(0.001, soak.v));
      soften.strength = 1.2;
      app.renderer.render({ container: src, target: rt, clear: true });
      rim.alpha = soak.v >= 1 ? 0 : RIM_INK * Math.min(1, soak.v * 6) * Math.min(1, (1 - soak.v) * 3);
    };
    const L = {
      view, soak, whole, pic, cam, iw, ih,
      /// Put the camera where `view` says, the mask where `soak` says.
      apply() {
        const f = frameOf(view, iw, ih, W, H);
        cam.scale.set(f.s);
        cam.position.set(f.x, f.y);
        each?.();
        whole.visible = soak.v > 0.0005;
        if (soak.v !== drawn && whole.visible) drawSoak();
      },
      /// A soft light on the painting at (u, v) of it, `size` of the painting's width.
      glow(u, v, size, gt = glowTex) {
        const g = new PIXI.Sprite(gt);
        g.anchor.set(0.5);
        g.position.set(u * iw, v * ih);
        g.width = g.height = size * iw;
        g.alpha = 0;
        g.blendMode = 'add';
        cam.addChild(g);
        return g;
      },
    };
    layers.push(L);
    return L;
  };

  const apply = () => {
    // A painting wholly soaked hides the ones under it (they cost nothing then).
    let covered = false;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const L = layers[i];
      L.apply();
      L.whole.renderable = !covered;
      if (L.soak.v >= 1) covered = true;
    }
  };
  app.ticker.add(apply);

  return {
    layer,
    /// A light texture in another colour (the token's silver, a door's tint).
    glowTex(rgb) { const g = PIXI.Texture.from(glowCanvas(256, rgb)); made.push(g); return g; },
    /// Rice-paper grain over all of it, very faint — call once, after the layers.
    grain() {
      const grainTex = PIXI.Texture.from(grainCanvas());
      grainTex.source.addressMode = 'repeat';
      made.push(grainTex);
      const grain = new PIXI.TilingSprite({ texture: grainTex, width: W, height: H });
      grain.alpha = 0.07;
      grain.blendMode = 'multiply';
      root.addChild(grain);
    },
    apply,
    destroy() {
      app.ticker.remove(apply);
      for (const t of made) t.destroy(true);
    },
  };
}

/// A beat's timeline on `layer`: the painting soaks in over the last (unless it
/// is already up), and the camera moves `from` → `to` over `seconds`.
export function shotOn(bag, L, [from, to], seconds, { soakIn = true, ease = 'sine.inOut' } = {}) {
  const tl = bag.timeline({ paused: true });
  tl.set(L.view, { ...from }, 0);
  if (soakIn) tl.fromTo(L.soak, { v: 0 }, { v: 1, duration: SOAK_S, ease: 'power1.inOut' }, 0);
  else tl.set(L.soak, { v: 1 }, 0);
  tl.to(L.view, { ...to, duration: seconds, ease }, 0);
  return tl;
}

/// No WebGL: the painting at `href` (`size` [w, h] in pixels), still, cropped
/// where the camera ends (`to`) — the frame's cover fit, as the camera's.
export function stillOf(href, to, { W = 1000, H = 1000, size: [pw, ph] = [PW, PH] } = {}) {
  const cover = Math.max(W / pw, H / ph) * to.s;
  const vw = W / cover, vh = H / cover;
  const x = Math.max(0, Math.min(pw - vw, to.fx * pw - vw / 2)), y = Math.max(0, Math.min(ph - vh, to.fy * ph - vh / 2));
  return `<svg class="spstill" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="${pw}" height="${ph}" fill="#f5efe1"/><image href="${href}" x="0" y="0" width="${pw}" height="${ph}" preserveAspectRatio="none"/></svg>`;
}
