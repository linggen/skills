// setpieces/chending.js — 沉鼎山 (古三, 00-gate): the first sight of the mountain, as the
// book tells it (03-第三回.md, 九月初八傍晚): 「沉鼎山并不怎么高，只是陡。…小满张着嘴，半天合不上。」
//
// A still, not a 大场面: one painting (art/setpiece/chendingshan.webp — FLUX, Hanli's pick
// 「图用4」, 2026-10-14): the river bank at dusk, 小满 and 舅舅 seen from behind, the cliffs in
// the fog, the stair faint up the middle, two cranes. Code only moves the camera — one slow
// push from the two of them up the stair into the fog, where the gate is that no one can see
// — and lays the paper's grain over it. Nothing pictorial is drawn in code; the book's words
// come back through onBeat for the page to say.
//
// It is tied to its paragraph, not to a choice: the scene passage marks it `{景=chending}`
// (rules/tell.mjs beatsOf `piece`), and the page plays it when the box comes to that beat
// (lingjing.js beatPiece) — after 第二回's last words, the 回's turn and 第三回's first five beats.
import { tweenBag } from './bag.js';
import { paintedStage, shotOn, stillOf } from './painted.js';

/// The one beat: `ms` its length as the book paces it (a long look), `line` its words, verbatim.
export const BEATS = [
  {
    id: 'shan', art: 'a', ms: 8000,
    line: {
      zh: '沉鼎山并不怎么高，只是陡。山脚下的松林里浮着一层极淡的白气，在树梢中间慢慢地游；山腰以上，云雾缠得严严实实，一道石阶从山脚笔直地插进雾里去，瞧不见尽头。云里头隐隐约约一点白，一闪，又一闪，是两只鹤，绕着那看不见的山顶转了一圈，没进雾里去了。石阶顶上，就是沉鼎观的山门。小满张着嘴，半天合不上。',
      en: "Sunken Cauldron Mountain wasn't very tall, only steep. In the pines at its foot hung a faint white haze, drifting slowly between the treetops. Above the mountain's waist the cloud was wound on tight, and a flight of stone steps ran straight up from the foot into the mist, with no end in sight. Somewhere in the cloud a speck of white flashed, and flashed again: two cranes, circling the summit no one could see before they slipped back into the mist. At the top of the steps was the gate of the Sunken Cauldron Abbey. Xiaoman stood with his mouth open for a long time.",
    },
  },
];

export const TITLE = { zh: '沉鼎山', en: 'Sunken Cauldron Mountain' };
/// The painting (FLUX.2 klein 4B, 2026-10-14; art/CREDITS.md, tools/paint-chending.py), 1536×1024.
export const ART = { a: 'art/setpiece/chendingshan.webp' };
/// The frame the piece is played in: 16:9, letterboxed by the runner.
export const ASPECT = 9 / 16;

/// Where things are in the painting (0–1 of it), measured on the file; the test holds them in range.
export const MARKS = {
  boy: [0.47, 0.85], // 小满 from behind, the bow on his back
  uncle: [0.545, 0.83], // 舅舅 in his grey gown
  stairFoot: [0.51, 0.56], // the stair where the cliff comes out of the pines
  stairTop: [0.495, 0.33], // where the stair goes into the fog
  cranes: [[0.415, 0.48], [0.63, 0.54]],
};

/// The camera: [from, to] of {s: zoom over the cover fit, fx/fy: the point held at the frame's
/// centre}. From the two of them on the bank, a slow push up the stair into the fog.
export const SHOTS = {
  shan: [
    { s: 1.35, fx: (MARKS.boy[0] + MARKS.uncle[0]) / 2, fy: 0.7 },
    { s: 1.7, fx: MARKS.stairTop[0], fy: MARKS.stairTop[1] + 0.02 },
  ],
};
const SOAK_FROM = [0.5, 0.8]; // the painting soaks in from the two of them
const MIN_S = 9; // the long look: no camera move hurried

/// The seconds a beat's camera takes: the book's pace, never hurried.
export const camSeconds = (b) => Math.max(b.ms / 1000, MIN_S);

/// Build the stage and one paused timeline per beat (setpiece.js hands in the env).
export function build({ PIXI, gsap, app, root, W, H, art }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const L = { shan: stage.layer('a', { ...SHOTS.shan[0] }, { from: SOAK_FROM }) };
  stage.grain();
  const beats = {
    shan: () => shotOn(bag, L.shan, SHOTS.shan, camSeconds(BEATS[0]), { ease: 'sine.inOut' }),
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

/* ── No WebGL: the painting, still, cropped where the camera ends ── */
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const b = BEATS.find((x) => x.id === id) ?? BEATS[0];
  return stillOf(arts[b.art] ?? ART[b.art], SHOTS[b.id][1], { W, H });
}
