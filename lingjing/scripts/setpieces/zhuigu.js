// setpieces/zhuigu.js — 暴雨坠谷 (第一回, 00-fall): the storm on 黑松岭, 爹 hauled in against the rock, and 小满 over
// the edge. The book (01-第一回.md): 「小满滚了下去。泥浆、石头、断枝、雨水劈头盖脸而来，天和地在他眼前翻了不知多少个
// 跟头，翻得他连哪边是天都分不清了。…竟抓住了一根藤。那藤绷得笔直，硬生生把他往下掉的势头拽住了一下，跟着便断了。」
//
// Hanli 10-22 (「1-6 都是好主意, 按你说的改一遍. 关键是能留住玩家」): the cut 拽爹上崖 board's slot becomes a ~10 s 大场面,
// no input — it breaks the long read from 石上的痕迹 to 守火. Tied to its paragraph: 00-fall's way on marks the fall
// `{景=zhuigu}` (rules/tell.mjs beatsOf `piece`), and the page lays the piece under its words (lingjing.js beatPiece).
// Three beats at the piece's own pace (`TEMPO`), never the words':
//   ya   — the narrow slope in the storm, the rain driving: 爹 slammed into the rock, the boy flung out past the edge;
//          the camera jolts with the yank and leans out after him;
//   gun  — down the cliff face: the camera falls with him, fast, shaking, mud and stones and rain;
//   tai  — the vine, the snap, the cliff's foot: the camera drops the last of the way and settles on the moss.
//
// Painted, never drawn (his, 2026-09-30: paint first, then animate): three 水墨 paintings, the story stage's own style
// (art/setpiece/zhuigu-ya, -gun, -tai; local FLUX, tools/paint-zhuigu.py). Code only moves the camera over them, soaks
// one into the next (painted.js), shakes the frame on the yank and the fall, and lays the grain. The rain is painted.
import { tweenBag } from './bag.js';
import { paintedStage, shotOn, stillOf } from './painted.js';

/// The beats in the book's order: `ms` each one's drawn length (zh, TEMPO 1), `line` the book's words for it,
/// verbatim (a piece of paragraph 199 of 01-第一回.md and of en/h01.md).
export const BEATS = [
  { id: 'ya', art: 'ya', ms: 2800, line: { zh: '小满滚了下去。', en: 'Xiaoman fell.' } },
  { id: 'gun', art: 'gun', ms: 4000, line: {
    zh: '泥浆、石头、断枝、雨水劈头盖脸而来，天和地在他眼前翻了不知多少个跟头，翻得他连哪边是天都分不清了。',
    en: "Mud, stones, broken branches and rain came at him from every side; sky and earth turned more somersaults in front of his eyes than he could count, until he couldn't tell which way was up.",
  } },
  { id: 'tai', art: 'tai', ms: 3200, line: {
    zh: '那藤绷得笔直，硬生生把他往下掉的势头拽住了一下，跟着便断了。',
    en: 'The vine went taut and, for one moment, it jerked his fall to a stop; then it snapped.',
  } },
];

export const TITLE = { zh: '暴雨坠谷', en: 'Over the Edge in the Storm' };
/// The paintings (local FLUX.2 klein, 2026-10-22; art/CREDITS.md, tools/paint-zhuigu.py), 1536×1024 each.
export const ART = { ya: 'art/setpiece/zhuigu-ya.webp', gun: 'art/setpiece/zhuigu-gun.webp', tai: 'art/setpiece/zhuigu-tai.webp' };
export const SIZES = { ya: [1536, 1024], gun: [1536, 1024], tai: [1536, 1024] };

/// Where things are in the paintings (0–1 of each), measured on the files; the test holds them in range.
export const MARKS = {
  father: [0.22, 0.75], // ya: 爹 crouched against the rock wall, the pack and bow on his back
  boy: [0.79, 0.59], // ya: the boy flung out over the misty void, arms wide
  top: [0.55, 0.08], // gun: the rock face where the fall starts (it runs off the top)
  falling: [0.49, 0.54], // gun: the boy, in the middle third
  foot: [0.3, 0.92], // gun: the cliff base going into the white mist
  vine: [0.535, 0.44], // tai: the vine's end, hanging from above
  moss: [0.55, 0.73], // tai: the boy half sunk in the moss
};

/// The camera, beat by beat: [from, to] of {s: zoom over the cover fit, fx/fy: the point held at the frame's centre}.
export const SHOTS = {
  ya: [{ s: 1.2, fx: (MARKS.father[0] + MARKS.boy[0]) / 2, fy: 0.62 }, { s: 1.5, fx: MARKS.boy[0] - 0.06, fy: MARKS.boy[1] }],
  gun: [{ s: 1.7, fx: MARKS.falling[0], fy: MARKS.top[1] + 0.04 }, { s: 1.7, fx: (MARKS.falling[0] + MARKS.foot[0]) / 2, fy: MARKS.foot[1] - 0.04 }],
  tai: [{ s: 1.6, fx: MARKS.vine[0], fy: MARKS.vine[1] }, { s: 1.3, fx: MARKS.moss[0] + 0.04, fy: MARKS.moss[1] - 0.06 }],
};
/// Where each painting soaks in from (0–1 of the frame): the storm from the edge, the fall from the top, the foot from below.
const SOAK_FROM = { ya: [0.55, 0.45], gun: [0.5, 0.05], tai: [0.5, 0.95] };
/// The jolts: the yank (ya, at `at` s), the fall's tumbling (gun, all through), the snap (tai) — a share of the
/// painting the frame is knocked, then back.
const JOLT = { ya: { at: 0.6, d: 0.02 }, gun: { d: 0.012, n: 7 }, tai: { at: 1.0, d: 0.016 } };

/// The piece's own pace (×its drawn length), apart from the words' speed: ~10 s; en a touch longer.
export const TEMPO = { zh: 1, en: 1.05 };
export const tempoOf = (lang) => TEMPO[lang] ?? TEMPO.zh;

/// A knock of the frame: out by `d` and back, starting at `at` (a timeline's seconds).
const knock = (tl, view, at, d, k = 1) => tl.to(view, { keyframes: [{ dx: d * k, duration: 0.07 }, { dx: -d * 0.6 * k, duration: 0.09 }, { dx: 0, duration: 0.18 }], ease: 'sine.inOut' }, at);

export function build({ PIXI, gsap, app, root, W, H, art, lang = 'zh' }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const L = {};
  for (const b of BEATS) L[b.id] = stage.layer(b.art, { ...SHOTS[b.id][0], dx: 0 }, { from: SOAK_FROM[b.id] });
  stage.grain();
  const tempo = tempoOf(lang);
  const sec = (id) => BEATS.find((b) => b.id === id).ms / 1000;
  const shot = (id, ease) => shotOn(bag, L[id], SHOTS[id], sec(id), { ease });

  const beats = {
    // The yank: the frame knocked as 爹 slams into the rock, then the camera leans out after the boy.
    ya: () => knock(shot('ya', 'power2.inOut'), L.ya.view, JOLT.ya.at, JOLT.ya.d).timeScale(1 / tempo),
    // The fall: the camera drops down the cliff with him, knocked again and again as he tumbles.
    gun: () => {
      const tl = shot('gun', 'power1.in');
      const { d, n } = JOLT.gun;
      for (let k = 0; k < n; k += 1) knock(tl, L.gun.view, 0.35 + k * (sec('gun') - 0.8) / n, d, k % 2 ? -1 : 1);
      return tl.timeScale(1 / tempo);
    },
    // The vine: held a moment, the snap, and the last drop to the moss — the camera settles.
    tai: () => knock(shot('tai', 'power2.out'), L.tai.view, JOLT.tai.at, JOLT.tai.d).timeScale(1 / tempo),
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

/* ── No WebGL: the painting of each beat, still, where its camera ends ── */
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const b = BEATS.find((x) => x.id === id) ?? BEATS.at(-1);
  return stillOf(arts[b.art] ?? ART[b.art], SHOTS[b.id][1], { W, H, size: SIZES[b.art] });
}
