// setpieces/zhang.js — 卷一's one 大场面 (哇时刻 ②, Hanli 2026-09-30): 漳水立起.
// 第十回, as the book tells it: the river stops, stands up as a wall with a
// thousand fish leaping in it, 冰夷 rises from the black water on his two
// dragons, the dragons try the boy who would not kneel, the wall falls back;
// under the river the 洛书 seal opens, and the first 鼎 rises as her second
// tail lights. After it the page plays what already exists — 银月's memory 1
// (memory.js) and 鼎归 (fx.js / inkmap.js); this piece never draws them again.
//
// Painted, not drawn (his, 2026-09-30: the code-drawn version was 「太不好看,
// 粗糙, 太假」 — paint first, then animate). The picture is five paintings
// (art/setpiece/zhang-a,b,c,e,f.webp); code only moves the camera over them
// (slow pans and pushes), soaks one into the next the way ink wicks through
// 宣纸 (the 鼎归 soak: a disc torn by paper fibres, used as the painting's
// mask), lays a faint grain over all, and lights two glows the paintings
// already hold (the centre stone, the token). No figure, fish, stone or
// dragon is drawn in code. Words are never painted — each beat names the
// book line it goes with, and the dialogue box (or the preview) says it.
// `build` is handed Pixi and GSAP by setpiece.js and returns one paused
// timeline per beat; the runner plays them, holds between, and skips.
import { tweenBag } from './bag.js';
import { fibreCanvas, grainCanvas } from '../fx.js';

/// The beats in the book's order. `ms` is the beat's own length; `line` is the
/// passage it follows — a verbatim piece of 10-第十回.md (the test holds it so);
/// `art` is the painting it plays on.
export const BEATS = [
  { id: 'still', art: 'a', ms: 4500, line: { zh: '不是退，是停：河面上的浪一道一道，全悬在了半空，一滴也不落下来。', en: 'Not ebbing — stopping. Wave after wave hung in the air, and not one drop fell.' } },
  { id: 'rise', art: 'a', ms: 6500, line: { zh: '话音未落，漳水竟站了起来。不是涨，是站——一整条河从河床上立起来，立成了一道墙。', en: 'Before she had finished, the Zhang stood up. Not rising — standing: a whole river lifted off its bed into a wall.' } },
  { id: 'bingyi', art: 'b', ms: 6000, line: { zh: '水墙正中，那片最深的黑水里，慢慢浮上来一个人影：人的脸，披着水做的衣裳，脚底下踩着两条龙', en: 'At the heart of the wall, in the deepest black water, a figure rose: a man’s face, a robe of water, two dragons under his feet.' } },
  { id: 'trial', art: 'c', ms: 5500, line: { zh: '两颗比灶屋还大的龙头，在他面前一尺的地方停住了。', en: 'Two dragon heads, each bigger than the kitchen hut, stopped a foot from his face.' } },
  { id: 'fall', art: 'a', ms: 5000, line: { zh: '他身后那道水墙，慢慢地、慢慢地落了下去。', en: 'Behind him the wall of water came down, slowly, slowly.' } },
  { id: 'seal', art: 'e', ms: 6000, line: { zh: '他拿起最后那块石头，五个点的，按进了正中那一格', en: 'He took the last stone, the one with five dots, and pressed it into the middle square.' } },
  { id: 'ding', art: 'f', ms: 7000, line: { zh: '木牌上那只蜷着的小狐狸，九条尾巴里，第二条亮了。', en: 'On the token, of the curled fox’s nine tails, the second lit.' } },
];

export const TITLE = { zh: '漳水立起', en: 'The Zhang Stands Up' };
/// The paintings (Codex, 2026-09-30; art/CREDITS.md), all 1536×1024.
export const ART = {
  a: 'art/setpiece/zhang-a.webp', b: 'art/setpiece/zhang-b.webp', c: 'art/setpiece/zhang-c.webp',
  e: 'art/setpiece/zhang-e.webp', f: 'art/setpiece/zhang-f.webp',
};
/// The frame the piece is played in: 16:9, letterboxed by the runner.
export const ASPECT = 9 / 16;

/// 洛书 as the stones lie: 戴九履一，左三右七，二四为肩，六八为足，五居中央.
export const LUOSHU = [[4, 9, 2], [3, 5, 7], [8, 1, 6]];

/// Where things are in the paintings (0–1 of the painting): the camera's aims
/// and the two glows. Measured on the files; the test holds them in range.
export const MARKS = {
  sealCentre: [0.465, 0.485], // e: the five-dot stone under his hand
  token: [0.258, 0.622], // f: the fox token at his chest
  ding: [0.62, 0.19], // f: the 鼎 in the beam
};

/// The camera, beat by beat: [from, to] of {s: zoom over the painting's cover
/// fit, fx/fy: the point held at the frame's centre}. `cold` is the stillness
/// (the colour draining as the river stops).
export const SHOTS = {
  still: [{ s: 1.95, fx: 0.4, fy: 0.8, cold: 0 }, { s: 1.82, fx: 0.44, fy: 0.78, cold: 0.7 }],
  rise: [{ s: 1.82, fx: 0.44, fy: 0.78, cold: 0.7 }, { s: 1.12, fx: 0.55, fy: 0.36, cold: 0.1 }],
  bingyi: [{ s: 1.05, fx: 0.5, fy: 0.62 }, { s: 1.55, fx: 0.5, fy: 0.3 }],
  trial: [{ s: 1.4, fx: 0.5, fy: 0.46 }, { s: 1.08, fx: 0.48, fy: 0.52 }],
  fall: [{ s: 1.15, fx: 0.55, fy: 0.34 }, { s: 1.0, fx: 0.5, fy: 0.64 }],
  seal: [{ s: 1.15, fx: 0.5, fy: 0.42 }, { s: 2.35, fx: MARKS.sealCentre[0], fy: MARKS.sealCentre[1] }],
  ding: [{ s: 2.1, fx: MARKS.ding[0], fy: MARKS.ding[1] + 0.03 }, { s: 1.0, fx: 0.5, fy: 0.5 }],
};

/// Where each painting soaks in from (the ink's first drop), 0–1 of the frame.
const SOAK_FROM = { still: [0.5, 0.7], bingyi: [0.5, 0.42], trial: [0.5, 0.58], fall: [0.5, 0.08], seal: [0.47, 0.5], ding: [0.62, 0.22] };
const SOAK_S = 2.4; // seconds for a painting to soak in over the last
const PAPER = 0xf5efe1;

/// A soft round light (the paintings' own glows, brightened): white at the
/// heart, gone at the rim — no edge.
function glowCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,246,214,0.95)');
  grad.addColorStop(0.35, 'rgba(255,236,190,0.45)');
  grad.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/// The stillness as a colour matrix: 0 = the painting as painted, 1 = drained
/// toward a cold grey (the river stopped, the air gone cold).
export function coldMatrix(k) {
  const L = [0.299, 0.587, 0.114];
  const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  const tint = [0.96, 1.0, 1.08]; // a little blue
  const m = id.slice();
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) m[r * 5 + c] = (1 - k * 0.72) * id[r * 5 + c] + k * 0.72 * L[c] * tint[r];
  }
  return m;
}

/// Build the stage and one paused timeline per beat. `env` is {PIXI, gsap, app,
/// root, W, H, art: {a,b,c,e,f: HTMLImageElement}}; everything is in W×H units
/// under `root`.
export function build({ PIXI, gsap, app, root, W, H, art }) {
  const bag = tweenBag(gsap);
  const made = []; // textures and render targets to free
  const tex = {};
  for (const k of Object.keys(ART)) if (art[k]) made.push(tex[k] = PIXI.Texture.from(art[k]));
  root.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill(PAPER));

  // Paper fibres: the displacement that tears each soak's edge (the 鼎归 soak's own).
  const fibreTex = PIXI.Texture.from(fibreCanvas());
  fibreTex.source.addressMode = 'repeat';
  made.push(fibreTex);
  const R = Math.hypot(W, H) * 1.15; // a soak from anywhere covers the frame
  const K = 0.5; // the masks drawn at half size: soft and cheap

  /// One use of a painting: its own camera, its own soak mask, stacked above
  /// the uses before it. A use is unseen until its soak grows.
  const layers = {};
  const layer = (id) => {
    const key = BEATS.find((b) => b.id === id).art;
    const t = tex[key];
    const [from] = SHOTS[id];
    const view = { ...from, cold: from.cold ?? 0 };
    // whole = [pic (masked) = [cam = [painting, glows], overlays], mask]: the mask beside what it masks.
    const whole = new PIXI.Container();
    const pic = new PIXI.Container();
    const cam = new PIXI.Container();
    const sprite = t ? new PIXI.Sprite(t) : new PIXI.Graphics().rect(0, 0, 1536, 1024).fill(0xd9cfbb);
    cam.addChild(sprite);
    pic.addChild(cam);
    whole.addChild(pic);
    const iw = t?.width ?? 1536, ih = t?.height ?? 1024;
    const cover = Math.max(W / iw, H / ih);
    let cm = null;
    if (view.cold !== undefined && SHOTS[id][1].cold !== undefined) { cm = new PIXI.ColorMatrixFilter(); cam.filters = [cm]; }
    // The soak: a disc grown in an offscreen texture, torn by fibres, softened, used as the mask.
    const [ox, oy] = SOAK_FROM[id] ?? [0.5, 0.5];
    const fibres = new PIXI.Sprite(fibreTex);
    fibres.scale.set(R / 160);
    fibres.renderable = false;
    const blob = new PIXI.Graphics().circle(0, 0, R).fill(0xffffff);
    blob.position.set(ox * W, oy * H);
    blob.scale.set(0.001);
    const sheet = new PIXI.Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.001 });
    const soakLayer = new PIXI.Container();
    soakLayer.addChild(sheet, blob);
    soakLayer.filters = [new PIXI.DisplacementFilter({ sprite: fibres, scale: R * 0.16 }), new PIXI.BlurFilter({ strength: 6, quality: 3 })];
    const src = new PIXI.Container();
    src.scale.set(K);
    src.addChild(fibres, soakLayer);
    const rt = PIXI.RenderTexture.create({ width: Math.ceil(W * K), height: Math.ceil(H * K) });
    made.push(rt);
    const mask = new PIXI.Sprite(rt);
    mask.scale.set(1 / K);
    whole.addChild(mask);
    pic.mask = mask;
    root.addChild(whole);
    const soak = { v: 0 }; // 0 unseen … 1 the painting whole
    let drawn = -1;
    const L = {
      id, view, soak, whole, pic, cam,
      glows: [],
      /// Put the camera where `view` says, the mask where `soak` says.
      apply() {
        const s = cover * view.s;
        const w = iw * s, h = ih * s;
        let x = W / 2 - view.fx * w, y = H / 2 - view.fy * h;
        x = Math.min(0, Math.max(W - w, x));
        y = Math.min(0, Math.max(H - h, y));
        cam.scale.set(s);
        cam.position.set(x, y);
        if (cm) cm.matrix = coldMatrix(view.cold);
        whole.visible = soak.v > 0.0005;
        if (soak.v !== drawn && whole.visible) {
          drawn = soak.v;
          blob.scale.set(Math.max(0.001, soak.v));
          app.renderer.render({ container: src, target: rt, clear: true });
        }
      },
      /// A soft light on the painting at (u, v) of it, `size` of the painting's width.
      glow(u, v, size) {
        const g = new PIXI.Sprite(glowTex);
        g.anchor.set(0.5);
        g.position.set(u * iw, v * ih);
        g.width = g.height = size * iw;
        g.alpha = 0;
        g.blendMode = 'add';
        cam.addChild(g);
        return g;
      },
    };
    layers[id] = L;
    return L;
  };
  const glowTex = PIXI.Texture.from(glowCanvas());
  made.push(glowTex);

  // The uses, bottom to top: the river (stopped, then standing), 冰夷, the trial,
  // the river again (the wall coming down), the seal under the water, the 鼎.
  for (const b of BEATS) if (b.id !== 'rise') layer(b.id);
  layers.rise = layers.still; // the wall stands on the same painting the river stopped on

  // A pale wash that passes over as the wall comes down.
  const wash = new PIXI.Graphics().rect(0, 0, W, H).fill(PAPER);
  wash.alpha = 0;
  layers.fall.pic.addChild(wash);

  const sealGlow = layers.seal.glow(...MARKS.sealCentre, 0.2);
  const tokenGlow = layers.ding.glow(...MARKS.token, 0.12);

  // Rice-paper grain over all of it, very faint.
  const grainTex = PIXI.Texture.from(grainCanvas());
  grainTex.source.addressMode = 'repeat';
  made.push(grainTex);
  const grain = new PIXI.TilingSprite({ texture: grainTex, width: W, height: H });
  grain.alpha = 0.07;
  grain.blendMode = 'multiply';
  root.addChild(grain);

  const all = [...new Set(Object.values(layers))];
  const apply = () => {
    // A painting wholly soaked hides the ones under it (they cost nothing then).
    let covered = false;
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const L = all[i];
      L.apply();
      L.whole.renderable = !covered;
      if (L.soak.v >= 1) covered = true;
    }
  };
  app.ticker.add(apply);

  const sec = (ms) => ms / 1000;
  /// A beat: the painting soaks in (unless it is already up), and the camera moves.
  const shot = (id, { soakIn = true, ease = 'sine.inOut' } = {}) => {
    const L = layers[id];
    const b = BEATS.find((x) => x.id === id);
    const [from, to] = SHOTS[id];
    const tl = bag.timeline({ paused: true });
    tl.set(L.view, { ...from, cold: from.cold ?? L.view.cold ?? 0 }, 0);
    if (soakIn) tl.fromTo(L.soak, { v: 0 }, { v: 1, duration: SOAK_S, ease: 'power1.inOut' }, 0);
    else tl.set(L.soak, { v: 1 }, 0);
    tl.to(L.view, { ...to, duration: sec(b.ms), ease }, 0);
    return tl;
  };

  const beats = {
    still: () => shot('still', { ease: 'power1.out' }),
    rise: () => shot('rise', { soakIn: false, ease: 'power2.inOut' }),
    bingyi: () => shot('bingyi', { ease: 'power1.inOut' }),
    trial: () => shot('trial', { ease: 'power2.out' }),
    fall: () => shot('fall', { ease: 'power1.inOut' })
      .fromTo(wash, { alpha: 0 }, { keyframes: [{ alpha: 0.32, duration: 1.4, ease: 'sine.out' }, { alpha: 0, duration: 2.2, ease: 'sine.in' }] }, 0.4),
    seal: () => shot('seal', { ease: 'power2.inOut' })
      .fromTo(sealGlow, { alpha: 0 }, { alpha: 0.85, duration: 2.4, ease: 'sine.in' }, 3.2)
      .fromTo(sealGlow.scale, { x: sealGlow.scale.x * 0.6, y: sealGlow.scale.y * 0.6 }, { x: sealGlow.scale.x * 1.15, y: sealGlow.scale.y * 1.15, duration: 2.6, ease: 'sine.out' }, 3.2),
    ding: () => shot('ding', { ease: 'power2.inOut' })
      .fromTo(tokenGlow, { alpha: 0 }, { keyframes: [{ alpha: 0.9, duration: 0.6 }, { alpha: 0.45, duration: 0.5 }, { alpha: 0.85, duration: 0.8 }] }, 4.6),
  };
  // Hold the camera still at its start until a beat plays (the soak begins unseen).
  apply();
  return {
    beat(id) { return beats[id](); },
    /// One frame of the per-frame work (the cameras, the masks) — for a still or a seek.
    step() { apply(); },
    destroy() {
      bag.killAll();
      app.ticker.remove(apply);
      for (const t of made) t.destroy(true);
    },
  };
}

/* ── No WebGL: the painting of each beat, still (the tap moves on) ── */

export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const b = BEATS.find((x) => x.id === id) ?? BEATS[0];
  const href = arts[b.art] ?? ART[b.art];
  const [, to] = SHOTS[b.id];
  // The beat's last frame: the painting cropped where the camera ends.
  const vw = 1536 / to.s, vh = vw * (H / W);
  const x = Math.max(0, Math.min(1536 - vw, to.fx * 1536 - vw / 2)), y = Math.max(0, Math.min(1024 - vh, to.fy * 1024 - vh / 2));
  return `<svg class="spstill" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="1536" height="1024" fill="#f5efe1"/><image href="${href}" x="0" y="0" width="1536" height="1024" preserveAspectRatio="none"/></svg>`;
}
