// setpieces/ershisan.js — 二十三下 (古五, wm-chu): at the 秘境's stone door, the twenty-three blows owed since the woodshed.
// The book (05-第五回.md): 「小满站起身，一拳迎在他鼻梁上。『一。』……小满一下一下地数，不快，不慢，像他爹剥兔子皮，有个
// 次第：鼻梁，左肋，右肋，肚子。四层的灵力，他只使了三成——使足了，这人就没了。……数到『二十三』，最后一下不轻不重，点在
// 马小宝的肩膀上，倒像是给这件事盖了个戳。」
//
// The reading cap (Hanli 2026-10-20: 「剧情连续阅读太长的地方, 你处理一下, 看是否可以加个小游戏等」; the standing rule of
// 10-19): wm-kaikai → 讲堂 read 3,811 字 without play; no kit's verb is a reckoning, so the book's own big moment is a short
// 大场面. One beat on the paragraph the scene marks `{景=ershisan}` (lingjing.js beatPiece lays it under its words): the
// ledge under the cliff soaks in, the iron stake where he sat and waited; the fist comes in — the first blow, the second,
// then the count, not fast, not slow, in its order (鼻梁 · 左肋 · 右肋 · 肚子, round and round), each a jolt of the camera
// and a cold flash where it lands; a breath; the twenty-third, a light tap. ~4.8 s at its own pace (`TEMPO`), never the
// words' speed; the words wait for the picture (`CUES`): 「二十三」 once the last tap has landed. No faces: the camera keeps
// to the fist, the stake and the stone.
//
// Painted, never drawn: the ledge (art/setpiece/ershisan-ya.webp) and the fist (a cut-out) are local FLUX
// (tools/paint-ershisan.py). Code only places and moves them, and lights a flash where a blow lands.
import { tweenBag } from './bag.js';
import { paintedStage, frameOf, stillOf } from './painted.js';

export const BEATS = [
  {
    id: 'shu', art: 'ya', ms: 4800,
    line: {
      zh: '小满站起身，一拳迎在他鼻梁上。',
      en: 'Xiaoman stood up and met him with a fist to the bridge of the nose.',
    },
  },
];

export const TITLE = { zh: '二十三下', en: 'Twenty-three blows' };
export const ART = { ya: 'art/setpiece/ershisan-ya.webp', quan: 'art/setpiece/ershisan-quan.webp' };
/// Each picture's size (w×h px): the ledge whole, the fist at its fixed size.
export const SIZES = { ya: [1536, 1024], quan: [480, 480] };
/// Where things are in the ledge painting (0–1 of it), measured on the file: the stake he sat by, the stone before the door.
export const MARKS = { stake: [0.2, 0.45], stone: [0.6, 0.68] };
/// The camera on the ledge: from the stake, a slow push toward the stone where the blows land.
export const SHOT = [{ s: 1.3, fx: 0.32, fy: 0.5 }, { s: 1.5, fx: 0.48, fy: 0.56 }]; // the painter's seal low right stays out
/// The piece's own pace (×its drawn length), apart from the words' speed: ~4.8 s.
export const TEMPO = { zh: 1, en: 1 };
export const tempoOf = (lang) => TEMPO[lang] ?? TEMPO.zh;

// Seconds on the drawn timeline. The blows: the first and the second alone, then the count — twenty more, not fast, not
// slow — then a breath, and the twenty-third, light.
const SOAK = 0.9, FIRST = 1.05, SECOND = 1.6, COUNT = [2.05, 3.85], LAST = 4.3, END = 4.8;
/// When each of the 23 lands.
export const BLOWS = [FIRST, SECOND, ...Array.from({ length: 20 }, (_, k) => COUNT[0] + (k * (COUNT[1] - COUNT[0])) / 19), LAST];
/// Where each lands, round and round in the book's order — 鼻梁 · 左肋 · 右肋 · 肚子 — as offsets (frame heights) from the stone.
const SPOTS = [[0, -0.1], [-0.05, 0.02], [0.05, 0.03], [0, 0.1]];
/// The words that wait for the picture (lingjing.js pieceGate): 「二十三」 once the last tap has landed.
export const CUES = [{ beat: 'shu', t: LAST + 0.15, text: { zh: '二十三', en: 'Twenty-three' } }];

/// Where the blows land (the stone before the door as the camera ends) and how big the fist is, in the frame's units. Pure.
export function layout(W, H) {
  const tall = H > W;
  const h = Math.min(H * (tall ? 0.22 : 0.3), W * (tall ? 0.4 : 0.26));
  const f = frameOf(SHOT[1], ...SIZES.ya, W, H);
  const [sx, sy] = [f.x + MARKS.stone[0] * SIZES.ya[0] * f.s, f.y + MARKS.stone[1] * SIZES.ya[1] * f.s];
  // Above the words' band over the stage's lower third, inside the frame.
  const hit = [Math.min(W * 0.8, Math.max(W * 0.45, sx)), Math.min(H * 0.72 - h * 0.62, Math.max(H * 0.3, sy))];
  return { h, hit, from: [-h, hit[1]] };
}

export function build({ PIXI, gsap, app, root, W, H, art, lang = 'zh' }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const T = stage.tex;
  const lay = layout(W, H);
  const L = stage.layer('ya', { ...SHOT[0] }, { from: [MARKS.stake[0], 0.5] });
  const cold = L.glow(0.5, 0.12, 0.5); // the thin cold light from above, the painting's own
  const [fw, fh] = SIZES.quan;
  const fist = T.quan ? new PIXI.Sprite(T.quan) : new PIXI.Graphics().rect(0, 0, fw, fh).fill({ color: 0x8a7a66, alpha: 0.6 });
  if (fist.anchor) fist.anchor.set(0.9, 0.42); else fist.pivot.set(fw * 0.9, fh * 0.42); // the knuckles, measured on the file
  fist.scale.set(lay.h / fh);
  const flashTex = stage.glowTex([236, 242, 255]);
  const flash = new PIXI.Sprite(flashTex);
  flash.anchor.set(0.5);
  flash.blendMode = 'add';
  flash.width = flash.height = lay.h * 1.2;
  root.addChild(flash, fist);
  const unseen = () => {
    fist.position.set(...lay.from); fist.alpha = 0; fist.rotation = 0;
    flash.alpha = 0; flash.position.set(...lay.hit); cold.alpha = 0;
  };
  unseen();
  stage.grain();
  const tempo = tempoOf(lang);

  const beats = {
    shu: () => {
      const tl = bag.timeline({ paused: true });
      tl.call(unseen, null, 0)
        .fromTo(L.soak, { v: 0 }, { v: 1, duration: SOAK, ease: 'power1.inOut' }, 0)
        .fromTo(L.view, { ...SHOT[0] }, { ...SHOT[1], duration: END, ease: 'sine.inOut' }, 0)
        .fromTo(cold, { alpha: 0 }, { alpha: 0.35, duration: 0.8, ease: 'sine.out' }, 0.2)
        .to(fist, { alpha: 1, duration: 0.2 }, FIRST - 0.35);
      BLOWS.forEach((at, k) => {
        const last = k === BLOWS.length - 1, big = k < 2;
        const [ox, oy] = SPOTS[k % SPOTS.length];
        const x = lay.hit[0] + ox * lay.h * 2, y = lay.hit[1] + oy * lay.h * 2;
        const back = last ? 0.5 : big ? 0.35 : 0.16, reach = last ? 0.3 : big ? 0.12 : 0.06;
        const jolt = last ? 0 : big ? 0.006 : 0.0025;
        // The fist drawn back, then in: lands at `at`; the camera jolts and settles; a cold flash where it lands.
        tl.to(fist, { x: x - lay.h * 0.9, y, rotation: -0.06, duration: back * 0.6, ease: 'power1.out' }, at - back)
          .to(fist, { x, y, rotation: 0, duration: reach, ease: last ? 'sine.inOut' : 'power3.in' }, at - reach)
          .fromTo(flash, { alpha: 0, x, y }, { keyframes: [{ alpha: last ? 0.35 : big ? 0.95 : 0.6, duration: 0.04 }, { alpha: 0, duration: last ? 0.5 : 0.2 }], ease: 'sine.out' }, at)
          // the jolt shakes the whole frame a few px (never the camera, whose push runs under it)
          .to(root, { keyframes: [{ x: -jolt * W, y: (jolt / 2) * H, duration: 0.04 }, { x: 0, y: 0, duration: 0.12 }] }, at);
      });
      // A breath before the twenty-third; after it, the fist lowered and still.
      tl.to(fist, { x: lay.hit[0] - lay.h * 0.7, y: lay.hit[1] + lay.h * 0.25, alpha: 0.85, rotation: 0.08, duration: 0.45, ease: 'sine.out' }, LAST + 0.05);
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

/* ── No WebGL: the ledge where the camera ends, the stone before the door ── */
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  return stillOf(arts.ya ?? ART.ya, SHOT[1], { W, H, size: SIZES.ya });
}
