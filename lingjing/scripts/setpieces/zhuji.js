// setpieces/zhuji.js — 筑基天象 (第九回, 09-cliff): the moment 沈小满 lays his
// foundation on the 沉鼎观 cliff, in the book's order (09-第九回.md, 九月初三):
//   gather — one grey-white cloud over this cliff alone turns into an upturned
//            锅; every wind stops (a 锅盖云, the wide view);
//   light  — a thread of light from the cloud's heart onto his crown;
//   tai    — inside: stones rise from the lake's floor and stack into a 台;
//            the five doors, 金木水火土, light one after another;
//   door   — the 台 sways; an old door, its note unreadable (「勿入」, he is sure)
//            — and the note soaks into 爹's 「今日放学」 as the camera pushes in;
//   zhu    — 「上有黄庭下关元，后有幽阙前命门」: four piles, the 台 holds — still inside,
//            the camera easing back from the 台 into the small cosmos around it;
//   stars  — he opens his eyes: the cosmos falls away behind the camera as the cliff
//            soaks in from where he sits, and the camera rises to the stars — the 锅
//            thinned away, the stars a little brighter;
//   settle — 瞿老 in the starlight: 「几道纹？」「……一道。」 — over it, the night closes.
//
// Small on purpose (his, 2026-09-30: 「设计的时候要考虑后面更高境界, 别太过了……应该一层
// 更比一层震撼」, then 「筑基有一点天象就可以」): 筑基 is the first rung, so one cliff top, one
// small cloud, a faint thread of light, stars only a little clearer — 「天地看了他一眼」.
// Two worlds no viewer can mix up (his, 2026-09-30: 「筑基的图片在小满旁边画了个台子, 其实
// 应该是内景的台子吧」 — the 台 is inside him, DESIGN 内景的阶梯): OUTSIDE (a, b, e2) is
// monochrome ink on paper; INSIDE (c, d1/d2, e1) is a small cosmos — a dark void, a
// faint starfield, nebula-like ink, the black lake floating in it, soft coloured glows.
// The cliff and the 台 never share a painting.
// The camera only pushes and rises slowly: no shake, no flash. Lightning, dragons, a
// sky-wide swirl, a star-fall are all kept for the realms after.
//
// Painted, not drawn (his, 2026-09-30: the code-drawn 筑基天象 was 「太假」 — the
// method 漳水立起 was rebuilt on: paint first, then animate). The picture is seven
// paintings (art/setpiece/zhuji-a,b,c,d1,d2,e1,e2.webp; d twice, the note unreadable
// and then 「今日放学」; e twice, inside and out); code only moves the camera over them, soaks one into the
// next (painted.js: the 鼎归 ink bleed), and brightens glows the paintings hold
// (the faint light on his crown, the five doors). Nothing pictorial is drawn in code;
// the book's words come back through onBeat for the page to say.
import { tweenBag } from './bag.js';
import { INK, SOAK_S, paintedStage, shotOn, stillOf } from './painted.js';

/// The beats in the book's order: `ms` the beat's length as the book paces it,
/// `line` its words (the page's dialogue box says them), `art` its painting.
export const BEATS = [
  { id: 'gather', art: 'a', ms: 2600, line: { zh: '天忽然暗了下来。一团云只罩着这一座崖顶，越转越快，转成一口倒扣的大锅。四下里的风，一齐停了。', en: 'The sky darkened. A single cloud hung over this one cliff, turning faster and faster into an upturned cauldron. Every wind stopped.' } },
  { id: 'light', art: 'b', ms: 1300, line: { zh: '云心里透下一缕光来，不偏不倚，正照在他头顶上。', en: 'From the heart of the cloud a thread of light came down, straight onto the crown of his head.' } },
  { id: 'tai', art: 'c', ms: 2600, line: { zh: '丹田湖底，一块一块，垒起了一座台子。金木水火土五扇门，一扇接一扇地亮起来。', en: 'From the floor of the lake within, stone by stone, a platform rose. The five doors — metal, wood, water, fire, earth — lit one after another.' } },
  { id: 'door', art: 'd1', ms: 2800, line: { zh: '台子晃了一晃。他看见一扇门，门上的字，他只觉得写的是「勿入」。——可他爹早就进过这扇门了。写的是「今日放学」。', en: 'The platform swayed. He saw a door, and the words on it, he was sure, said Keep Out. — But his father had walked through this door long ago. It said: No School Today.' } },
  { id: 'zhu', art: 'e1', ms: 1400, line: { zh: '上有黄庭下关元，后有幽阙前命门。四根桩一落定，那台子便稳了。', en: 'Yellow Court above, the Pass Gate below; the Hidden Gate behind, the Gate of Life before. Four piles driven home, and the platform held.' } },
  { id: 'stars', art: 'e2', ms: 1900, line: { zh: '头顶那口锅悄没声地散了。云开处，星星比平日亮了一些，近了一些。', en: 'The cauldron overhead thinned away without a sound. Where the cloud parted, the stars were a little brighter than usual, a little nearer.' } },
  { id: 'settle', art: 'e2', ms: 0, line: { zh: '「几道纹？」「……一道。」「嗯。一道。」', en: '"How many lines?" "…One." "Mm. One."' } },
];

export const TITLE = { zh: '筑基天象', en: 'Laying the Foundation' };
/// The paintings (FLUX, 2026-09-30; art/CREDITS.md, tools/paint-zhuji.py), all 1536×1024.
export const ART = {
  a: 'art/setpiece/zhuji-a.webp', b: 'art/setpiece/zhuji-b.webp', c: 'art/setpiece/zhuji-c.webp',
  d1: 'art/setpiece/zhuji-d1.webp', d2: 'art/setpiece/zhuji-d2.webp',
  e1: 'art/setpiece/zhuji-e1.webp', e2: 'art/setpiece/zhuji-e2.webp',
};
/// Which world each painting is in: outside (monochrome ink) or inside him (the small cosmos).
export const WORLD = { a: 'outer', b: 'outer', c: 'inner', d1: 'inner', d2: 'inner', e1: 'inner', e2: 'outer' };
/// The frame the piece is played in: 16:9, letterboxed by the runner.
export const ASPECT = 9 / 16;

/// The door's words, before and after: d1's note (he reads 「勿入」 into it) and
/// d2's (painted: 「今日放学」). Said by the beat's line, painted only on d2.
export const DOOR_WORDS = { zh: ['勿入', '今日放学'], en: ['KEEP OUT', 'NO SCHOOL TODAY'] };
/// The five doors in the book's order, and the muted 五色 their glows take.
export const FIVE = [
  { id: 'jin', zh: '金', en: 'Metal', rgb: [226, 204, 140] },
  { id: 'mu', zh: '木', en: 'Wood', rgb: [150, 190, 140] },
  { id: 'shui', zh: '水', en: 'Water', rgb: [120, 150, 200] },
  { id: 'huo', zh: '火', en: 'Fire', rgb: [220, 120, 96] },
  { id: 'tu', zh: '土', en: 'Earth', rgb: [214, 176, 110] },
];

/// Where things are in the paintings (0–1 of the painting): the camera's aims
/// and the glows. Measured on the files; the test holds them in range.
export const MARKS = {
  boy: [0.658, 0.45], // a: him on the 青石, the 锅盖云 just over him
  crown: [0.495, 0.34], // b: the light on his crown (his topknot)
  tai: [0.51, 0.62], // c: the platform
  doors: [[0.17, 0.47], [0.3, 0.35], [0.67, 0.32], [0.765, 0.34], [0.865, 0.46]], // c: 金木水火土, gateways round the lake
  note: [0.49, 0.36], // d1/d2: the paper on the door
  piles: [0.5, 0.6], // e1: the 台 on its four piles, in the black lake afloat in the cosmos
  him: [0.353, 0.8], // e2: him alone on the cliff, looking up
  sky: [0.5, 0.3], // e2: the night sky where the 锅 thinned away
};

/// The camera, beat by beat: [from, to] of {s: zoom over the painting's cover
/// fit, fx/fy: the point held at the frame's centre}.
export const SHOTS = {
  gather: [{ s: 1.8, fx: MARKS.boy[0], fy: MARKS.boy[1] - 0.04 }, { s: 1.0, fx: 0.5, fy: 0.5 }],
  light: [{ s: 1.05, fx: 0.5, fy: 0.4 }, { s: 1.45, fx: MARKS.crown[0], fy: MARKS.crown[1] + 0.08 }],
  tai: [{ s: 1.7, fx: MARKS.tai[0], fy: MARKS.tai[1] }, { s: 1.05, fx: 0.5, fy: 0.5 }],
  door: [{ s: 1.05, fx: 0.5, fy: 0.5 }, { s: 2.0, fx: MARKS.note[0], fy: MARKS.note[1] }],
  // Inside: close on the piles, then easing back into the cosmos the 台 floats in…
  zhu: [{ s: 1.9, fx: MARKS.piles[0], fy: MARKS.piles[1] }, { s: 1.3, fx: MARKS.piles[0], fy: MARKS.piles[1] - 0.04 }],
  // …outside: from him, close, the camera rises to the sky.
  stars: [{ s: 1.7, fx: MARKS.him[0], fy: MARKS.him[1] - 0.06 }, { s: 1.0, fx: MARKS.sky[0], fy: MARKS.sky[1] }],
  settle: [{ s: 1.0, fx: MARKS.sky[0], fy: MARKS.sky[1] }, { s: 1.25, fx: MARKS.him[0], fy: MARKS.him[1] - 0.04 }],
};

/// Where each painting soaks in from (the ink's first drop), 0–1 of the frame.
/// `stars` soaks from where he sits (the stars' first camera holds him at the frame's centre):
/// the cliff comes back from him outward — he opened his eyes.
const SOAK_FROM = { gather: [0.5, 0.35], light: [0.5, 0.05], tai: [0.5, 0.62], door: [0.5, 0.5], note: [0.5, 0.5], zhu: [0.5, 0.6], stars: [0.5, 0.6] };
const MIN_S = 3.2; // no camera move is hurried (his: the camera moves over paintings, slowly)
const DOOR_TURN = 2.0; // seconds into `door` when 爹's note starts to soak in
const RISE_S = 5.5; // the camera's slow rise from him to the stars
const OUT_OF = 1.0; // how far the inner cosmos falls back (its zoom at the end) as the cliff soaks in
const SWAY = 0.006; // how far the frame drifts, slowly, as the 台 sways (a share of the painting)
const SETTLE_DARK = 0.5; // how far the night closes over the last painting
const DUSK = 0.22; // how far the sky darkens as the cloud gathers

/// The seconds a beat's camera takes: the book's pace, never hurried.
export const camSeconds = (b) => Math.max(b.ms / 1000, MIN_S);

/// Build the stage and one paused timeline per beat. `env` is {PIXI, gsap, app,
/// root, W, H, art: {a,b,c,d1,d2,e1,e2: HTMLImageElement}}; everything is in W×H
/// units under `root`.
export function build({ PIXI, gsap, app, root, W, H, art }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const beatOf = (id) => BEATS.find((b) => b.id === id);

  /// One use of a painting, bottom to top, with its own camera (unless handed one).
  const use = (key, id, { view = { ...SHOTS[id][0] }, from = SOAK_FROM[id], ...opts } = {}) => stage.layer(key, view, { from, ...opts });
  // The sky darkening as the cloud gathers: a colour matrix on the wide view.
  const dusk = new PIXI.ColorMatrixFilter();
  const L = {};
  L.gather = use('a', 'gather', { view: { ...SHOTS.gather[0], dim: 0 }, filter: dusk, each: () => dusk.brightness(1 - L.gather.view.dim, false) });
  L.light = use('b', 'light');
  L.tai = use('c', 'tai');
  L.door = use('d1', 'door', { view: { ...SHOTS.door[0], dx: 0 } });
  L.note = use('d2', 'door', { view: L.door.view, from: SOAK_FROM.note }); // the same camera: only the note changes
  L.zhu = use('e1', 'zhu');
  L.stars = use('e2', 'stars');
  L.settle = L.stars; // the night closes over the same painting

  // The light on his crown: pale, grey-white, faint — almost missable.
  const crown = L.light.glow(...MARKS.crown, 0.07, stage.glowTex([232, 232, 226]));
  const doors = MARKS.doors.map(([u, v], k) => L.tai.glow(u, v, 0.1, stage.glowTex(FIVE[k].rgb)));
  // The night closing over the last painting as 瞿老 asks.
  const night = new PIXI.Graphics().rect(0, 0, W, H).fill(INK);
  night.alpha = 0;
  L.stars.pic.addChild(night);
  stage.grain();

  const shot = (id, { seconds = camSeconds(beatOf(id)), ...opts } = {}) => shotOn(bag, L[id], SHOTS[id], seconds, opts);
  const beats = {
    gather: () => shot('gather', { ease: 'power1.inOut' })
      .fromTo(L.gather.view, { dim: 0 }, { dim: DUSK, duration: camSeconds(beatOf('gather')), ease: 'sine.inOut' }, 0),
    light: () => shot('light', { ease: 'power2.inOut' })
      .fromTo(crown, { alpha: 0 }, { alpha: 0.3, duration: 2.0, ease: 'sine.inOut' }, 1.2),
    tai: () => doors.reduce((tl, g, k) => tl.fromTo(g, { alpha: 0 }, { alpha: 0.55, duration: 0.5, ease: 'sine.out' }, 1.0 + k * 0.4), shot('tai', { ease: 'power2.out' })),
    door: () => shot('door', { ease: 'power1.inOut', seconds: DOOR_TURN + SOAK_S })
      // 台子晃了一晃: the frame drifts once, slowly, as the door comes.
      .fromTo(L.door.view, { dx: 0 }, { keyframes: [{ dx: SWAY, duration: 0.7, ease: 'sine.inOut' }, { dx: 0, duration: 0.9, ease: 'sine.inOut' }] }, 0.2)
      // …and 爹's note soaks in over the one he could not read.
      .set(L.note.soak, { v: 0 }, 0)
      .to(L.note.soak, { v: 1, duration: SOAK_S, ease: 'power1.inOut' }, DOOR_TURN),
    zhu: () => shot('zhu', { ease: 'sine.out' }),
    // He opens his eyes: the cosmos keeps falling back behind the camera while the cliff
    // soaks in over it from where he sits; then the camera rises.
    stars: () => shot('stars', { ease: 'sine.inOut', seconds: RISE_S })
      .fromTo(L.zhu.view, { ...SHOTS.zhu[1] }, { s: OUT_OF, fx: 0.5, fy: 0.5, duration: SOAK_S + 0.4, ease: 'sine.in' }, 0),
    settle: () => shot('settle', { soakIn: false, ease: 'sine.inOut' })
      .fromTo(night, { alpha: 0 }, { alpha: SETTLE_DARK, duration: 5, ease: 'sine.in' }, 0.4),
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

/* ── No WebGL: the painting of each beat, still, cropped where its camera ends ── */

/// The painting a beat ends on (the door ends on 爹's note).
const lastArt = (b) => (b.id === 'door' ? 'd2' : b.art);

export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const b = BEATS.find((x) => x.id === id) ?? BEATS[0];
  const art = lastArt(b);
  return stillOf(arts[art] ?? ART[art], SHOTS[b.id][1], { W, H });
}
