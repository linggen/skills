// setpieces/diche.js — 底册 · 看完烧了 (古六, wm-laba): the page 阿禾 slipped under his bowl, burnt at the 灶口.
// The book (06-第六回.md): 「看到最后一行——祁长松——只有四个字，他抬起头来。阿禾吸溜着粥，面无表情：『看完烧了。』…
// 小满把那张纸凑到灶口，看着它卷起来，黑了。纸上的字，他已经一个一个记进了肚子里。」
//
// The standing rule Hanli approved 2026-10-19 (「我和 agent 照规矩直接处理, 可以, 按你说的做」): the 底册 board (read each
// line twice, then burn it — reading, no game) became a short 大场面. One beat on the paragraph the scene marks
// `{景=diche}` (lingjing.js beatPiece lays it under its words): the kitchen before dawn soaks in from the lamp; the
// page lies open under it and its lines light one after another — 卢方's, 秦雁's, and last 祁长松's four words, the
// brightest; it is carried to the stove mouth, the fire flares, and the paper curls, goes black and is gone.
// ~4 s at its own pace (`TEMPO`), never the words' speed; the words wait for the picture (`CUES`): 「黑了」 as it curls.
//
// Painted, never drawn: the kitchen (art/setpiece/diche-zao.webp), the page and the page burning (cut-outs) are local
// FLUX (tools/paint-diche.py). FLUX can't write, so the page's rows are ant-sized ink — the box says the book's words.
// Code only places and moves them, and brightens light the paintings already hold (the lamp, the lines, the fire).
import { tweenBag } from './bag.js';
import { paintedStage, frameOf, stillOf } from './painted.js';

export const BEATS = [
  {
    id: 'shao', art: 'zao', ms: 4000,
    line: {
      zh: '小满把那张纸凑到灶口，看着它卷起来，黑了。',
      en: 'Xiaoman held the paper to the mouth of the stove and watched it curl up and go black.',
    },
  },
];

export const TITLE = { zh: '看完烧了', en: 'Read, then burn it' };
export const ART = { zao: 'art/setpiece/diche-zao.webp', page: 'art/setpiece/diche-page.webp', burn: 'art/setpiece/diche-burn.webp' };
/// Each picture's size (w×h px): the kitchen whole, the two cut-outs at their fixed size.
export const SIZES = { zao: [1536, 1024], page: [480, 640], burn: [480, 640] };
/// Where things are in the kitchen painting (0–1 of it), measured on the file.
export const MARKS = { lamp: [0.17, 0.53], mouth: [0.49, 0.77] };
/// Where the page's rows lie on its cut-out (0–1 of its height), and how wide each lights: 卢方's, 秦雁's, and
/// 祁长松's four words — the last, short and the brightest.
export const ROWS = [{ y: 0.36, w: 0.7, a: 0.8 }, { y: 0.53, w: 0.7, a: 0.8 }, { y: 0.76, w: 0.36, a: 1 }];
/// The camera on the kitchen: from the lamp and the page by it, a slow push to the stove mouth.
export const SHOT = [{ s: 1.45, fx: 0.4, fy: 0.58 }, { s: 1.6, fx: 0.47, fy: 0.63 }]; // the paper's deckle edge and the painter's seal stay out
/// The piece's own pace (×its drawn length), apart from the words' speed: ~4 s.
export const TEMPO = { zh: 1, en: 1 };
export const tempoOf = (lang) => TEMPO[lang] ?? TEMPO.zh;

// Seconds on the drawn timeline.
const SOAK = 0.9, PAGE_IN = 0.3, LIT = [1.0, 1.4, 1.85], LIT_S = 0.35, CARRY = [2.25, 0.65], BURN = 2.85, CURL = [3.05, 0.8], END = 4.0;
/// The words that wait for the picture (lingjing.js pieceGate): 「黑了」 once the paper has curled at the stove mouth.
export const CUES = [{ beat: 'shao', t: CURL[0] + 0.2, text: { zh: '黑了', en: 'go black' } }];

/// Where the page lies, and where it is carried (the stove mouth as the camera ends), in the frame's units. Pure.
export function layout(W, H) {
  const tall = H > W;
  const h = Math.min(H * (tall ? 0.3 : 0.46), W * (tall ? 0.52 : 0.3));
  const at = (view, [u, v]) => { const f = frameOf(view, ...SIZES.zao, W, H); return [f.x + u * SIZES.zao[0] * f.s, f.y + v * SIZES.zao[1] * f.s]; };
  const [mx, my] = at(SHOT[1], MARKS.mouth);
  // Opened by the lamp, a little in from it; above the words' band over the stage's lower third.
  const [lx] = at(SHOT[0], MARKS.lamp);
  return { h, x: Math.max(W * (tall ? 0.5 : 0.3), lx + W * 0.12), y: H * (tall ? 0.44 : 0.4), mouth: [mx, Math.min(my, H * 0.7)] };
}

export function build({ PIXI, gsap, app, root, W, H, art, lang = 'zh' }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const T = stage.tex;
  const lay = layout(W, H);
  const L = stage.layer('zao', { ...SHOT[0] }, { from: [lay.x / W, lay.y / H] });
  const lamp = L.glow(...MARKS.lamp, 0.16), fire = L.glow(MARKS.mouth[0], MARKS.mouth[1] - 0.04, 0.34);
  const sheet = (key) => {
    const [pw, ph] = SIZES[key];
    const s = T[key] ? new PIXI.Sprite(T[key]) : new PIXI.Graphics().rect(0, 0, pw, ph).fill({ color: 0xd9cfbb, alpha: 0.6 });
    if (s.anchor) s.anchor.set(0.5); else s.pivot.set(pw / 2, ph / 2);
    s.scale.set(lay.h / ph);
    return s;
  };
  // The page and its burning, one over the other in a holder that is carried; the rows' light laid on the page.
  const holder = new PIXI.Container();
  const page = sheet('page'), burn = sheet('burn');
  const warm = stage.glowTex([255, 214, 140]);
  const rows = ROWS.map((r) => {
    const g = new PIXI.Sprite(warm);
    g.anchor.set(0.5);
    g.blendMode = 'add';
    const ph = SIZES.page[1] * page.scale.y, pw = SIZES.page[0] * page.scale.x;
    g.position.set(0, (r.y - 0.5) * ph);
    g.width = pw * r.w; g.height = ph * 0.11;
    return g;
  });
  holder.addChild(page, ...rows, burn);
  L.pic.addChild(holder);
  const unseen = () => {
    holder.position.set(lay.x, lay.y); holder.rotation = -0.08; holder.scale.set(1);
    page.alpha = 0; burn.alpha = 0; rows.forEach((g) => { g.alpha = 0; });
    lamp.alpha = 0; fire.alpha = 0;
  };
  unseen();
  stage.grain();
  const tempo = tempoOf(lang);

  const beats = {
    shao: () => {
      const tl = bag.timeline({ paused: true });
      tl.call(unseen, null, 0)
        .fromTo(L.soak, { v: 0 }, { v: 1, duration: SOAK, ease: 'power1.inOut' }, 0)
        .fromTo(L.view, { ...SHOT[0] }, { ...SHOT[1], duration: END, ease: 'sine.inOut' }, 0)
        // The lamp's small flame; the page lies open under it.
        .fromTo(lamp, { alpha: 0 }, { alpha: 0.55, duration: 0.6, ease: 'sine.out' }, 0.2)
        .fromTo(page, { alpha: 0 }, { alpha: 1, duration: 0.5, ease: 'sine.out' }, PAGE_IN)
        .fromTo(holder.scale, { x: 0.94, y: 0.94 }, { x: 1, y: 1, duration: 0.5, ease: 'power2.out' }, PAGE_IN);
      // Read twice, line by line: 卢方, 秦雁, and 祁长松's four words, the last the brightest.
      rows.forEach((g, k) => {
        tl.fromTo(g, { alpha: 0 }, { keyframes: [{ alpha: ROWS[k].a, duration: LIT_S }, { alpha: ROWS[k].a * 0.45, duration: 0.4 }], ease: 'sine.out' }, LIT[k]);
      });
      // Carried to the stove mouth: the lamp left behind, the fire's light rising.
      tl.to(holder, { x: lay.mouth[0], y: lay.mouth[1], rotation: 0.12, duration: CARRY[1], ease: 'power2.inOut' }, CARRY[0])
        .to(holder.scale, { x: 0.72, y: 0.72, duration: CARRY[1], ease: 'power2.inOut' }, CARRY[0])
        .to(lamp, { alpha: 0.2, duration: 0.5 }, CARRY[0])
        .fromTo(fire, { alpha: 0.25 }, { keyframes: [{ alpha: 0.95, duration: 0.35 }, { alpha: 0.5, duration: 0.9 }], ease: 'sine.inOut' }, BURN - 0.1)
        // The fire takes it: the page goes to the burning page, the rows' light out.
        .to(rows, { alpha: 0, duration: 0.25 }, BURN)
        .to(burn, { alpha: 1, duration: 0.3, ease: 'sine.in' }, BURN)
        .to(page, { alpha: 0, duration: 0.3, ease: 'sine.in' }, BURN + 0.1)
        // 卷起来，黑了: it curls in on itself, rises a little on the heat, and is gone.
        .to(holder.scale, { x: 0.36, y: 0.5, duration: CURL[1], ease: 'power2.in' }, CURL[0])
        .to(holder, { y: lay.mouth[1] - lay.h * 0.18, rotation: 0.34, duration: CURL[1], ease: 'sine.in' }, CURL[0])
        .to(burn, { alpha: 0, duration: 0.35, ease: 'power1.in' }, CURL[0] + CURL[1] - 0.3);
      tl.to({}, { duration: 0.01 }, END);
      return tl.timeScale(1 / tempo);
    },
  };
  stage.apply();
  return {
    beat(id) { return beats[id](); },
    step() { stage.apply(); },
    destroy() {
      bag.killAll();
      stage.destroy();
    },
  };
}

/* ── No WebGL: the stove mouth where the camera ends, the page gone into the fire ── */
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  return stillOf(arts.zao ?? ART.zao, SHOT[1], { W, H, size: SIZES.zao });
}
