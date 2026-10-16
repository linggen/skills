// setpieces/yaowang.js — 青丘之主 (第一回, 00-yinyue): her boast made visible, then the bread.
// The book (01-第一回.md): 「本王乃青丘之主，仙界妖王。统御万妖，号令八荒，一怒则山崩，一笑则花开——」
// 小满插口道：「那你为什么吃我的饼？」她道：「——饿了。」 (Hanli, 2026-10-16: 「可以」.)
//
// Two beats on the one paragraph (the scene marks it `{景=yaowang}`; the page lays the piece under
// its words, lingjing.js beatPiece):
//   vision — the cave soaks away into a night sky; a huge moon rises over the 八荒 ridges; nine
//            silver tails unfurl one by one across the sky; ranks of 万妖 rise among the ridges and
//            bow; on 一怒 a peak cracks and falls in its dust; on 一笑 the slopes burst into flower;
//   cut    — 「那你为什么吃我的饼？」: the vision runs like ink dropped in water and the cave mouth
//            soaks back over it — a barefoot girl, her back to him, chewing his bread-corner.
// The comedy is the contrast: the vision is the whole stage, grand, ~6–8 s, paced to the words as
// lines.js paces them at 自动 (zh: 「饿了」 comes up ~7 s in; en reads longer — `TEMPO`). Its nine
// tails are the ones the stumps at her one tail's root will be counted against later.
//
// Painted, never drawn (his rule, 2026-09-30): every picture is a painting (tools/paint-yaowang.py,
// local FLUX; art/CREDITS.md). Code only places, moves and composites them — one tail painted once
// and laid nine times round the fan, one 万妖 rank laid twice, one flower spray laid many times —
// soaks one picture into the next (painted.js), and runs the vision through a displacement as it
// goes. Nothing pictorial is drawn here; the masks that split the peak are plain rectangles.
import { tweenBag } from './bag.js';
import { paintedStage } from './painted.js';
import { fibreCanvas } from '../fx.js';

const BOOK_ZH = '本王乃青丘之主，仙界妖王。统御万妖，号令八荒，一怒则山崩，一笑则花开——」小满插口道：「那你为什么吃我的饼？」';
const BOOK_EN = '"This queen is Lady of Qingqiu, Demon Queen of the immortal realm. Ten thousand demons answer to me; the eight wildernesses obey my word. When I rage, mountains fall; when I smile, flowers bloom—" Xiaoman cut in: "Then why are you eating my flatbread?"';

/// The beats: `ms` the vision's own length at zh's pace, `hold` how long it stands before the cut
/// (short: the question cuts in), `line` the book's words for it, verbatim (the test holds them so).
export const BEATS = [
  { id: 'vision', art: 'sky', ms: 5800, hold: 200, line: { zh: BOOK_ZH.slice(0, BOOK_ZH.indexOf('」')), en: BOOK_EN.slice(0, BOOK_EN.indexOf('" Xiaoman') + 1) } },
  { id: 'cut', art: 'cave', ms: 1500, line: { zh: '小满插口道：「那你为什么吃我的饼？」她道：「——饿了。」', en: 'Xiaoman cut in: "Then why are you eating my flatbread?" She said, "—I was hungry."' } },
];

export const TITLE = { zh: '青丘之主', en: 'Lady of Qingqiu' };

/// The paintings (local FLUX, 2026-10-16; tools/paint-yaowang.py): two full scenes (the cave mouth,
/// the night sky) and seven cut-outs on clear ground, each at a fixed size (`SIZES`, w×h px).
export const ART = {
  cave: 'art/setpiece/yaowang-cave.webp', sky: 'art/setpiece/yaowang-sky.webp', moon: 'art/setpiece/yaowang-moon.webp',
  tail: 'art/setpiece/yaowang-tail.webp', ridge: 'art/setpiece/yaowang-ridge.webp', yao: 'art/setpiece/yaowang-yao.webp',
  peak: 'art/setpiece/yaowang-peak.webp', flower: 'art/setpiece/yaowang-flower.webp', dust: 'art/setpiece/tengyun-cloud.webp',
};
export const SIZES = {
  cave: [1536, 1024], sky: [1536, 1024], moon: [640, 640], tail: [384, 768], ridge: [1536, 512],
  yao: [1536, 384], peak: [512, 768], flower: [384, 288], dust: [512, 320],
};

/// The nine tails, left to right as they unfurl: the angle off upright (degrees) and the length (× the
/// fan's reach). The left ones are the painting mirrored, so every tail curls outward.
export const TAILS = [-76, -57, -38, -19, 0, 19, 38, 57, 76].map((deg, k) => ({ deg, len: [0.86, 0.94, 1, 1.04, 1.08, 1.04, 1, 0.94, 0.86][k] }));
/// zh's words are paced quicker than en's (lines.js paceOf): the vision slows to the language's.
export const TEMPO = { zh: 1, en: 1.35 };
/// Where the cave mouth's girl sits in yaowang-cave.webp (0–1): the cut soaks back from her.
export const MARKS = { girl: [0.5, 0.56] };

/// Where everything stands at the vision's end, in the frame's units (W × H — wide on a desk, tall on
/// a phone): the moon over the fan, the tails fanned from behind the far ridges, the 万妖 between the
/// far ridges and the near, the peak on the right, the flowers on the near slopes. Pure (the test
/// checks the fan fits the frame at 1440 and at 390).
export function layout(W, H) {
  const tall = H > W;
  const yh = H * (tall ? 0.56 : 0.7); // the far ridges' crest
  const reach = Math.min(H * (tall ? 0.4 : 0.6), W * 0.47); // a tail's length
  const base = { x: W / 2, y: yh + reach * 0.08 };
  const ridgeW = W * 1.25, ridgeH = ridgeW * (SIZES.ridge[1] / SIZES.ridge[0]);
  const nearY = yh + Math.max(ridgeH * 0.42, (H - yh) * 0.38);
  const nearScale = Math.max(1.3, (H - nearY) / (ridgeH * 0.7) + 0.05);
  const yaoW = W * 1.1, yaoH = yaoW * (SIZES.yao[1] / SIZES.yao[0]);
  const peakH = reach * (tall ? 1.1 : 0.95), peakW = peakH * (SIZES.peak[0] / SIZES.peak[1]);
  const flowerW = Math.min(W * 0.16, reach * 0.42);
  const sprays = [[0.5, 0.0], [0.34, 0.04], [0.66, 0.05], [0.18, 0.1], [0.82, 0.08], [0.06, 0.16], [0.95, 0.15], [0.42, 0.22], [0.6, 0.26]];
  return {
    tall, yh, reach, base,
    moon: { x: W / 2, y: yh - reach * 0.5, d: reach * 0.92 },
    tails: TAILS.map((t) => ({ ...base, rot: (t.deg * Math.PI) / 180, len: reach * t.len, flip: t.deg < 0 })),
    far: { x: W / 2, y: yh, w: ridgeW, h: ridgeH, ay: 0.3 },
    yao: { x: W / 2, y: nearY + ridgeH * nearScale * 0.12, w: yaoW, h: yaoH },
    near: { x: W / 2, y: nearY, w: ridgeW * nearScale, h: ridgeH * nearScale, ay: 0.3 },
    peak: { x: W * (tall ? 0.74 : 0.77), y: yh + ridgeH * 0.35, w: peakW, h: peakH },
    flowers: sprays.map(([u, dv], k) => ({ x: W * u, y: nearY + ridgeH * nearScale * (0.02 + dv), w: flowerW * (k % 3 === 0 ? 1.15 : 0.9), flip: k % 2 === 1 })),
  };
}

// Seconds into the beat, at zh's pace (lines.js, 自动): 「放下。」 first, then the boast from ~1.5 s.
const OPEN = 1.3; // the vision soaks in over the cave as 「本王乃青丘之主」 comes up
const SOAK_IN = 1.0;
const MOON_RISE = [1.45, 2.2]; // start, length
const TAIL_AT = 2.3, TAIL_GAP = 0.17, TAIL_S = 0.8; // the fan: the first tail, the stagger, each one's unfurling
const YAO_AT = 3.5, BOW_AT = 4.0; // 统御万妖 · 号令八荒
const CRACK_AT = 4.4; // 一怒则山崩
const BLOOM_AT = 5.0; // 一笑则花开
const VISION_END = 5.8;
const CUT_S = 1.2; // the cut: the cave soaks back over the running ink, done as 「——饿了」 comes up

/// Build the stage and one paused timeline per beat (setpiece.js hands in the env).
export function build({ PIXI, gsap, app, root, W, H, art, lang = 'zh' }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const made = [];
  const T = stage.tex;
  /// One painting placed: anchored, sized by width; a grey slab while the file is missing.
  const place = (key, { x, y, w, ax = 0.5, ay = 1, flip = false }) => {
    const [pw, ph] = SIZES[key];
    const s = T[key] ? new PIXI.Sprite(T[key]) : new PIXI.Graphics().rect(0, 0, pw, ph).fill({ color: 0x9a9184, alpha: 0.5 });
    const k = w / pw;
    if (s.anchor) s.anchor.set(ax, ay); else s.pivot.set(pw * ax, ph * ay);
    s.scale.set(flip ? -k : k, k);
    s.position.set(x, y);
    return s;
  };
  const lay = layout(W, H);
  const cover = { s: 1.06, fx: MARKS.girl[0], fy: MARKS.girl[1] - 0.06 };

  // The cave at the start (as the stage stood), the vision over it, the cave again over that for the cut.
  const L = {};
  L.base = stage.layer('cave', { ...cover }, {});
  L.base.soak.v = 1;
  L.sky = stage.layer('sky', { s: 1.08, fx: 0.5, fy: 0.42 }, { from: [0.5, 0.42] });
  L.back = stage.layer('cave', { s: 1.2, fx: MARKS.girl[0], fy: MARKS.girl[1] }, { from: [0.5, 0.56] });

  // The vision: every cut-out above the sky's painting, in the frame's units, under the sky's soak.
  const V = new PIXI.Container();
  L.sky.pic.addChild(V);
  const moon = place('moon', { x: lay.moon.x, y: lay.moon.y, w: lay.moon.d, ay: 0.5 });
  const tails = lay.tails.map((t) => place('tail', { x: t.x, y: t.y, w: t.len * (SIZES.tail[0] / SIZES.tail[1]), ay: 0.97, flip: t.flip }));
  const far = place('ridge', { ...lay.far, ay: lay.far.ay });
  const yao = [place('yao', { ...lay.yao }), place('yao', { ...lay.yao, x: lay.yao.x + lay.yao.w * 0.18, y: lay.yao.y + lay.yao.h * 0.18, flip: true })];
  const near = place('ridge', { ...lay.near, ay: lay.near.ay, flip: true });
  if (near.tint !== undefined) near.tint = 0x8a8178; // nearer, darker
  for (const y of yao) if (y.tint !== undefined) y.tint = 0x6a645e; // the 万妖 as dark shapes against the moonlit sky
  // The peak in two halves: the one painting twice, each masked by a tilted rectangle along the crack.
  const P = lay.peak, crackAngle = 0.16;
  const halves = [-1, 1].map((side) => {
    const half = place('peak', { x: P.x, y: P.y, w: P.w });
    const m = new PIXI.Graphics().rect(side < 0 ? -P.w * 2 : 0, -P.h * 2, P.w * 2, P.h * 4).fill(0xffffff);
    m.position.set(P.x, P.y - P.h * 0.5);
    m.rotation = crackAngle;
    half.mask = m;
    const g = new PIXI.Container();
    g.addChild(half, m);
    g.pivot.set(P.x, P.y);
    g.position.set(P.x, P.y);
    return g;
  });
  const dust = [0, 1, 2].map((k) => place('dust', { x: P.x + (k - 1) * P.w * 0.45, y: P.y - P.h * 0.05, w: P.w * (1.1 + k * 0.15), ay: 0.7, flip: k === 1 }));
  for (const d of dust) if (d.tint !== undefined) d.tint = 0x7d746a;
  const flowers = lay.flowers.map((f) => place('flower', { ...f, ay: 0.8 }));
  V.addChild(moon, ...tails, far, ...halves, ...yao, near, ...dust, ...flowers);

  // The running ink (the cut): the vision pulled through paper fibres and blurred as the cave comes back.
  const fibreTex = PIXI.Texture.from(fibreCanvas());
  fibreTex.source.addressMode = 'repeat';
  made.push(fibreTex);
  const fibres = new PIXI.Sprite(fibreTex);
  fibres.scale.set(Math.max(W, H) / 220);
  fibres.renderable = false;
  V.addChild(fibres);
  const run = new PIXI.DisplacementFilter({ sprite: fibres, scale: 0 });
  const blur = new PIXI.BlurFilter({ strength: 0, quality: 2 });
  const ink = { run: 0 };
  L.sky.pic.filters = [run, blur];
  app.ticker.add(applyInk);
  function applyInk() { run.scale.x = run.scale.y = ink.run * W * 0.16; blur.strength = ink.run * 9; L.sky.pic.alpha = 1 - ink.run * 0.35; }

  // The start: nothing of the vision up yet.
  const unseen = () => {
    moon.alpha = 0; moon.y = lay.moon.y + lay.reach * 1.1;
    tails.forEach((t) => { t.alpha = 0; t.rotation = 0; t.scale.y = 0.0001; });
    yao.forEach((y) => { y.alpha = 0; y.skew.x = 0; });
    halves.forEach((h) => { h.rotation = 0; h.position.set(P.x, P.y); });
    dust.forEach((d) => { d.alpha = 0; });
    flowers.forEach((f) => { f.alpha = 0; });
  };
  unseen();
  stage.grain();
  const tempo = TEMPO[lang] ?? 1;

  const beats = {
    vision: () => {
      const tl = bag.timeline({ paused: true });
      tl.set(L.back.soak, { v: 0 }, 0).set(ink, { run: 0 }, 0).call(unseen, null, 0)
        .fromTo(L.sky.soak, { v: 0 }, { v: 1, duration: SOAK_IN, ease: 'power1.inOut' }, OPEN)
        .fromTo(L.sky.view, { s: 1.08, fy: 0.42 }, { s: 1.0, fy: 0.5, duration: VISION_END - OPEN, ease: 'sine.out' }, OPEN)
        .fromTo(moon, { alpha: 0, y: lay.moon.y + lay.reach * 1.1 }, { alpha: 1, y: lay.moon.y, duration: MOON_RISE[1], ease: 'power2.out' }, MOON_RISE[0])
        .fromTo(V.scale, { x: 1, y: 1 }, { x: 1.04, y: 1.04, duration: VISION_END, ease: 'sine.inOut' }, 0)
        .fromTo(V.pivot, { x: 0, y: 0 }, { x: W * 0.02, y: lay.yh * 0.04, duration: VISION_END, ease: 'sine.inOut' }, 0);
      tails.forEach((t, k) => {
        const end = lay.tails[k], kx = Math.abs(t.scale.x), sx = Math.sign(t.scale.x);
        tl.fromTo(t, { alpha: 0, rotation: 0 }, { alpha: 0.92, rotation: end.rot, duration: TAIL_S, ease: 'power2.out' }, TAIL_AT + k * TAIL_GAP)
          .fromTo(t.scale, { x: sx * kx * 0.4, y: 0.0001 }, { x: sx * kx, y: kx, duration: TAIL_S, ease: 'back.out(1.4)' }, TAIL_AT + k * TAIL_GAP);
      });
      // 统御万妖，号令八荒: the ranks come up among the ridges, then bow, the far rank a breath after.
      yao.forEach((y, k) => {
        const y0 = y.y;
        tl.fromTo(y, { alpha: 0, y: y0 + lay.yao.h * 0.5 }, { alpha: 1, y: y0, duration: 0.7, ease: 'power2.out' }, YAO_AT + k * 0.15)
          .to(y, { y: y0 + lay.yao.h * 0.16, duration: 0.5, ease: 'power2.inOut' }, BOW_AT + k * 0.2)
          .to(y.skew, { x: 0.08, duration: 0.5, ease: 'power2.inOut' }, BOW_AT + k * 0.2)
          .to(y.scale, { y: Math.abs(y.scale.y) * 0.86, duration: 0.5, ease: 'power2.inOut' }, BOW_AT + k * 0.2);
      });
      // 一怒则山崩: a shudder, the crack opens, the halves lean apart and sink into their dust.
      tl.to(halves, { x: `+=${P.w * 0.02}`, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, CRACK_AT);
      halves.forEach((h, k) => {
        const side = k ? 1 : -1;
        tl.to(h, { rotation: side * 0.2, x: P.x + side * P.w * 0.18, y: P.y + P.h * 0.55, duration: 1.1, ease: 'power2.in' }, CRACK_AT + 0.3 + k * 0.08);
      });
      dust.forEach((d, k) => {
        const s = d.scale.x;
        tl.fromTo(d, { alpha: 0 }, { alpha: 0.75, duration: 0.5, ease: 'sine.out' }, CRACK_AT + 0.5 + k * 0.1)
          .fromTo(d.scale, { x: s * 0.5, y: Math.abs(s) * 0.5 }, { x: s * 1.2, y: Math.abs(s) * 1.2, duration: 1.2, ease: 'power1.out' }, CRACK_AT + 0.5 + k * 0.1);
      });
      // 一笑则花开: from the middle outward, spray after spray bursts open on the slopes.
      flowers.forEach((f, k) => {
        const s = f.scale.x;
        tl.fromTo(f, { alpha: 0 }, { alpha: 1, duration: 0.35, ease: 'sine.out' }, BLOOM_AT + k * 0.08)
          .fromTo(f.scale, { x: s * 0.2, y: Math.abs(s) * 0.2 }, { x: s, y: Math.abs(s), duration: 0.6, ease: 'back.out(2)' }, BLOOM_AT + k * 0.08);
      });
      tl.to({}, { duration: 0.01 }, VISION_END);
      return tl.timeScale(1 / tempo);
    },
    // 「那你为什么吃我的饼？」: the ink runs, the cave mouth soaks back from her.
    cut: () => bag.timeline({ paused: true })
      .fromTo(ink, { run: 0 }, { run: 1, duration: CUT_S, ease: 'power1.in' }, 0)
      .fromTo(L.back.soak, { v: 0 }, { v: 1, duration: CUT_S, ease: 'power2.in' }, 0.1)
      .fromTo(L.back.view, { s: 1.2 }, { s: 1.06, fy: cover.fy, duration: CUT_S + 0.6, ease: 'power2.out' }, 0.1),
  };
  stage.apply();
  return {
    beat(id) { return beats[id](); },
    step() { stage.apply(); applyInk(); },
    destroy() {
      bag.killAll();
      app.ticker.remove(applyInk);
      stage.destroy();
      for (const t of made) t.destroy(true);
    },
  };
}

/* ── No WebGL: the vision's last frame composed from its paintings, or the cave mouth ── */
const img = (href, [pw, ph], { x, y, w, ax = 0.5, ay = 1, flip = false, rot = 0, op = 1 }) => {
  const h = w * (ph / pw);
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((rot * 180) / Math.PI).toFixed(1)}) scale(${flip ? -1 : 1} 1)`;
  return `<image href="${href}" transform="${t}" x="${(-ax * w).toFixed(1)}" y="${(-ay * h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" opacity="${op}" preserveAspectRatio="none"/>`;
};
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const a = (k) => arts[k] ?? ART[k];
  const fill = (k) => `<image href="${a(k)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
  const head = `<svg class="spstill" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="${W}" height="${H}" fill="#f5efe1"/>`;
  if (id !== 'vision') return `${head}${fill('cave')}</svg>`;
  const L = layout(W, H), P = L.peak;
  const parts = [
    fill('sky'),
    img(a('moon'), SIZES.moon, { x: L.moon.x, y: L.moon.y, w: L.moon.d, ay: 0.5 }),
    ...L.tails.map((t) => img(a('tail'), SIZES.tail, { x: t.x, y: t.y, w: t.len * (SIZES.tail[0] / SIZES.tail[1]), ay: 0.97, flip: t.flip, rot: t.rot, op: 0.92 })),
    img(a('ridge'), SIZES.ridge, { ...L.far, ay: L.far.ay }),
    img(a('peak'), SIZES.peak, { x: P.x - P.w * 0.18, y: P.y + P.h * 0.55, w: P.w, rot: -0.2 }),
    img(a('yao'), SIZES.yao, { ...L.yao, y: L.yao.y + L.yao.h * 0.16 }),
    img(a('ridge'), SIZES.ridge, { ...L.near, ay: L.near.ay, flip: true }),
    img(a('dust'), SIZES.dust, { x: P.x, y: P.y, w: P.w * 1.4, ay: 0.7, op: 0.75 }),
    ...L.flowers.map((f) => img(a('flower'), SIZES.flower, { ...f, ay: 0.8 })),
  ];
  return `${head}${parts.join('')}</svg>`;
}
