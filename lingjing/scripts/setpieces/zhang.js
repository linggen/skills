// setpieces/zhang.js — 卷一's one 大场面 (哇时刻 ②, Hanli 2026-09-30): 漳水立起.
// 古十, as the book tells it: the river stops, stands up as a wall with a
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
import { PAPER, paintedStage, shotOn, stillOf } from './painted.js';

/// The beats in the book's order. `ms` is the beat's own length; `line` is the
/// passage it follows — a verbatim piece of 09-第九回.md (the test holds it so);
/// `art` is the painting it plays on.
export const BEATS = [
  { id: 'still', art: 'a', ms: 4500, line: { zh: '不是退，是停：河面上的浪一道一道，全悬在了半空，一滴也不落下来。', en: 'Not ebbing — stopping. Wave after wave hung in the air, and not one drop fell.' } },
  { id: 'rise', art: 'a', ms: 6500, line: { zh: '话音未落，漳水竟站了起来。不是涨，是站——一整条河从河床上立起来，立成了一道墙。', en: 'Before she had finished, the Zhang stood up. Not rising — standing: a whole river lifted off its bed into a wall.' } },
  { id: 'bingyi', art: 'b', ms: 6000, line: { zh: '水墙正中，那片最深的黑水里，慢慢浮上来一个人影：人的脸，披着水做的衣裳，脚底下踩着两条龙', en: 'At the heart of the wall, in the deepest black water, a figure rose: a man’s face, a robe of water, two dragons under his feet.' } },
  { id: 'trial', art: 'c', ms: 5500, line: { zh: '两颗比灶屋还大的龙头，在他面前一尺的地方停住了。', en: 'Two dragon heads, each bigger than the kitchen hut, stopped a foot from his face.' } },
  { id: 'fall', art: 'a', ms: 5000, line: { zh: '他身后那道水墙，慢慢地、慢慢地落了下去。', en: 'Behind him the wall of water came down, slowly, slowly.' } },
  { id: 'seal', art: 'e', ms: 6000, line: { zh: '五个点的石头，最后一块——第九块——按进了正中那一格', en: 'The five-dot stone, the last one — the ninth — pressed into the middle square.' } },
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
/// under `root` (painted.js: the paintings' layers, the soak, the grain).
export function build({ PIXI, gsap, app, root, W, H, art }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });

  /// One use of a painting: its own camera and soak. The stillness (`cold`) is a
  /// colour matrix on the river's painting only.
  const layers = {};
  const layer = (id) => {
    const [from, to] = SHOTS[id];
    const view = { ...from, cold: from.cold ?? 0 };
    let cm = null;
    if (from.cold !== undefined && to.cold !== undefined) cm = new PIXI.ColorMatrixFilter();
    layers[id] = stage.layer(BEATS.find((b) => b.id === id).art, view, { from: SOAK_FROM[id], filter: cm, each: cm && (() => { cm.matrix = coldMatrix(view.cold); }) });
  };
  // The uses, bottom to top: the river (stopped, then standing), 冰夷, the trial,
  // the river again (the wall coming down), the seal under the water, the 鼎.
  for (const b of BEATS) if (b.id !== 'rise') layer(b.id);
  layers.rise = layers.still; // the wall stands on the same painting the river stopped on

  // A pale wash that passes over as the wall comes down.
  const wash = new PIXI.Graphics().rect(0, 0, W, H).fill(PAPER);
  wash.alpha = 0;
  layers.fall.pic.addChild(wash);

  const sealGlow = layers.seal.glow(...MARKS.sealCentre, 0.2);
  // The token's light: warm silver, the painting's own glow breathing — never a white blot.
  const tokenGlow = layers.ding.glow(...MARKS.token, 0.05, stage.glowTex([226, 222, 206]));
  stage.grain();

  const sec = (ms) => ms / 1000;
  /// A beat: the painting soaks in (unless it is already up), and the camera moves.
  const shot = (id, opts) => shotOn(bag, layers[id], SHOTS[id], sec(BEATS.find((x) => x.id === id).ms), opts);

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
      .fromTo(tokenGlow, { alpha: 0 }, { keyframes: [{ alpha: 0.3, duration: 1.2, ease: 'sine.inOut' }, { alpha: 0.16, duration: 1.0, ease: 'sine.inOut' }, { alpha: 0.28, duration: 1.1, ease: 'sine.inOut' }] }, 3.8),
  };
  // Hold the camera still at its start until a beat plays (the soak begins unseen).
  stage.apply();
  return {
    beat(id) { return beats[id](); },
    /// One frame of the per-frame work (the cameras, the masks) — for a still or a seek.
    step() { stage.apply(); },
    destroy() {
      bag.killAll();
      stage.destroy();
    },
  };
}

/* ── No WebGL: the painting of each beat, still (the tap moves on) ── */

export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const b = BEATS.find((x) => x.id === id) ?? BEATS[0];
  // The beat's last frame: the painting cropped where the camera ends.
  return stillOf(arts[b.art] ?? ART[b.art], SHOTS[b.id][1], { W, H });
}
