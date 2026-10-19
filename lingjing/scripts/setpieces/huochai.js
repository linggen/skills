// setpieces/huochai.js — 扔了干净 (第七回, 09-snow): the 饭桶 eats the rubbish and spits out 火柴.
// The book (07-第七回.md): 「他摸进柴房，按开饭桶，一股脑儿倒了进去，心里什么也没想——扔了干净。」
// 「饭桶嚼了很久。「咯嘣」，「咯嘣」，嚼一阵，歇一歇，像一个没牙的老头啃一块冻硬了的饼；歇一回，吸他一口气，吸到
// 第五口，他眼前一阵一阵发黑。末了，盖子「咔哒」一弹，一道红光窜出来，「笃」的一声，钉在了门板上，剑柄还在嗡嗡地颤。
// 小狰一头扎进了柴堆。」 (Hanli, 2026-10-19: 「「扔了干净」这一幕改成大场面」 — it was the board 喂饭桶 · 扔了干净.)
//
// On the chewing paragraph of 09-snow's way on (`{景=huochai}`; lingjing.js beatPiece lays it under its words),
// five beats at the piece's own pace (`TEMPO`), never the words' — ~13 s, the punch on the sword:
//   feed    — the woodshed at night soaks in; the lid lifts, the gourd and the shards tumble into the dark
//             mouth, the lid drops back;
//   chew    — 嚼一阵，歇一歇: the lid trembling, the body shuddering, in bursts with rests;
//   breaths — five rests, each one a breath drawn out of him into the lid's seam, and each one the
//             edge of the frame darker (his sight going, 一阵一阵), a pause between;
//   sword   — 「咔哒」: the lid snaps up, a red light flares, the sword streaks across and 「笃」 nails into
//             the door, the frame jolts, the hilt quivering on and on;
//   dive    — 小狰 springs from behind the 饭桶 and dives headfirst into the woodpile, a puff of dust.
// The words wait for the picture (`CUES`): 「饭桶嚼了很久」 as it starts chewing, 「末了…「咔哒」」 at the snap,
// 「小狰一头扎进了柴堆」 as he leaps.
//
// Painted, never drawn: the stage is the house's woodshed at night (art/places/chaifang-night.webp); the
// 饭桶's body and lid, the gourd, a shard, the sword and 小狰 diving are local-FLUX edit passes from the
// house's 饭桶 and 小狰 (tools/paint-huochai.py); the breath is the house's painted wisp (tengyun-cloud),
// the red light painted.js's glow. Everything stands on the painting (its own pixels), so the camera can
// move over it — a desk sees the whole shed; a phone's narrow frame follows the pot, the door, the woodpile.
// The one thing made in code is the darkening edge (a soft radial shade, like the grain): his sight, not a picture.
import { tweenBag } from './bag.js';
import { frameOf, paintedStage, stillOf } from './painted.js';

/// The beats: `ms` each one's drawn length (zh, TEMPO 1), `hold: 0` — they run straight on into each other
/// (a still beat stands its own length, setpiece.js heldFor), `line` the book's words for it, verbatim.
export const BEATS = [
  { id: 'feed', ms: 2400, hold: 0, line: { zh: '他摸进柴房，按开饭桶，一股脑儿倒了进去', en: 'He slipped into the woodshed, opened the Rice Bucket and tipped the lot in' } },
  { id: 'chew', ms: 2200, hold: 0, line: { zh: '饭桶嚼了很久。「咯嘣」，「咯嘣」，嚼一阵，歇一歇', en: 'The Rice Bucket chewed for a long time. *Crunch*, *crunch*: it chewed a while, rested a while' } },
  { id: 'breaths', ms: 4900, hold: 0, line: { zh: '歇一回，吸他一口气，吸到第五口，他眼前一阵一阵发黑。', en: 'Each time it rested it drew a breath from him, and by the fifth breath his sight was going dark in waves.' } },
  { id: 'sword', ms: 2000, hold: 0, line: { zh: '末了，盖子「咔哒」一弹，一道红光窜出来，「笃」的一声，钉在了门板上，剑柄还在嗡嗡地颤。', en: 'At last the lid sprang open with a *click*, a red light shot out, and with a *thock* it stuck fast in the door, the hilt still humming.' } },
  { id: 'dive', ms: 1600, hold: 0, line: { zh: '小狰一头扎进了柴堆。', en: 'The little zheng dived headfirst into the woodpile.' } },
];

export const TITLE = { zh: '扔了干净', en: 'Good riddance' };
/// The woodshed (the house's, 1536×1024) and the cut-outs, each at a fixed size (`SIZES`, w×h px).
export const ART = {
  shed: 'art/places/chaifang-night.webp', body: 'art/setpiece/huochai-body.webp', lid: 'art/setpiece/huochai-lid.webp',
  gourd: 'art/setpiece/huochai-gourd.webp', shard: 'art/setpiece/huochai-shard.webp', sword: 'art/setpiece/huochai-sword.webp',
  zheng: 'art/setpiece/huochai-zheng.webp', wisp: 'art/setpiece/tengyun-cloud.webp',
};
export const SIZES = {
  shed: [1536, 1024], body: [512, 512], lid: [512, 320], gourd: [256, 384], shard: [256, 256], sword: [768, 160], zheng: [512, 512], wisp: [512, 320],
};
/// Where things are in the cut-outs (0–1 of each box): the body's rim (its middle, its width), the lid's
/// foot, the sword's point and its hilt's end (the sword is laid point right).
export const MARKS = { rim: { x: 0.49, y: 0.37, w: 0.86 }, lid: { w: 0.89 }, sword: { tip: [0.995, 0.5], pommel: [0.005, 0.5] } };

/// Where everything stands on the woodshed painting (0–1 of it): the 饭桶 on the floor before the bed, the
/// door the sword nails into, the woodpile 小狰 dives into, and where he breathes from (the frame's foot, him).
export const SPOTS = { pot: { x: 0.4, y: 0.79, h: 0.26 }, door: { x: 0.69, y: 0.44 }, pile: { x: 0.12, y: 0.58 }, him: { x: 0.36, y: 1.02 } };
/// The sword's length (× the pot's height) and how deep it sinks into the door (× its length).
const SWORD_L = 1.35, SINK = 0.2;
/// The cut-outs dimmed to the shed's night (multiplied over them).
const NIGHT = 0xa39b8f, NIGHT_RED = 0xc4b2a6;

/// The piece's own pace (×its drawn length), apart from the words' speed: zh ~13 s; en a touch longer (its words read longer).
export const TEMPO = { zh: 1, en: 1.05 };
export const tempoOf = (lang) => TEMPO[lang] ?? TEMPO.zh;

/// The camera for each beat ({s, fx, fy} on the painting, painted.js frameOf), wide (a desk sees the whole
/// shed, the camera only leans in) or tall (a phone's frame is a third of the painting's width: it follows
/// the pot, whips to the door with the sword, and swings to the woodpile for 小狰). Pure.
export function shots(W, H) {
  if (H > W) {
    const pot = { s: 1.45, fx: SPOTS.pot.x, fy: 0.68 };
    return {
      feed: [{ s: 1.3, fx: SPOTS.pot.x - 0.02, fy: 0.66 }, pot], chew: [pot, { ...pot, s: 1.5 }], breaths: [{ ...pot, s: 1.5 }, { ...pot, s: 1.58 }],
      sword: [{ ...pot, s: 1.58 }, { s: 1.45, fx: SPOTS.door.x - 0.08, fy: 0.6 }], dive: [{ s: 1.45, fx: SPOTS.door.x - 0.08, fy: 0.6 }, { s: 1.45, fx: 0.2, fy: 0.6 }],
    };
  }
  const wide = { s: 1.12, fx: 0.42, fy: 0.62 };
  return {
    feed: [{ s: 1.04, fx: 0.42, fy: 0.6 }, wide], chew: [wide, { ...wide, s: 1.18, fx: 0.41 }], breaths: [{ ...wide, s: 1.18, fx: 0.41 }, { ...wide, s: 1.26, fx: 0.41 }],
    sword: [{ ...wide, s: 1.26, fx: 0.41 }, { s: 1.14, fx: 0.46, fy: 0.6 }], dive: [{ s: 1.14, fx: 0.46, fy: 0.6 }, { s: 1.14, fx: 0.42, fy: 0.6 }],
  };
}

/// A point on the painting (u, v: 0–1 of it) where the frame shows it under camera `view` (W × H units). Pure.
export function onFrame(view, [u, v], W, H) {
  const [iw, ih] = SIZES.shed;
  const f = frameOf(view, iw, ih, W, H);
  return [f.x + u * iw * f.s, f.y + v * ih * f.s];
}

/// The pieces' sizes and spots in the painting's pixels. Pure (the tests read it).
export function layout() {
  const [iw, ih] = SIZES.shed;
  const potH = SPOTS.pot.h * ih, k = potH / SIZES.body[1]; // the body's box scaled so it stands potH tall
  const foot = [SPOTS.pot.x * iw, SPOTS.pot.y * ih];
  const rim = [foot[0] + (MARKS.rim.x - 0.5) * SIZES.body[0] * k, foot[1] - (1 - MARKS.rim.y) * SIZES.body[1] * k];
  const lidW = MARKS.rim.w * SIZES.body[0] * k / MARKS.lid.w; // the lid's box, its painted rim as wide as the body's
  const swordW = potH * SWORD_L;
  const door = [SPOTS.door.x * iw, SPOTS.door.y * ih];
  return {
    iw, ih, foot, potH, rim, lidW, swordW, door,
    // The sword flies from the mouth to the door, point first, a little uphill; it stops sunk SINK deep.
    flight: { from: [rim[0], rim[1] - potH * 0.1], to: [door[0] + swordW * SINK, door[1]] },
    pile: [SPOTS.pile.x * iw, SPOTS.pile.y * ih], him: [SPOTS.him.x * iw, SPOTS.him.y * ih],
    zhengW: potH * 0.62, gourdW: potH * 0.3, shardW: potH * 0.2,
  };
}

// Seconds on each beat's drawn timeline.
const SOAK = 1.0, LIFT = [0.55, 0.45], GOURD = [1.0, 0.5], SHARDS = [1.2, 0.45], SHUT = [1.85, 0.25];
const CHEW = [[0.05, 0.8], [1.2, 0.9]]; // 嚼一阵 (from, for) — and 歇一歇 between
const BREATH = { first: 0.2, every: 0.96, draw: 0.55 }; // five: each a rest with a breath drawn, then a short chew
const SHADE = [0.3, 0.45, 0.6, 0.72, 0.85]; // the edge after each breath (his sight going)
const SNAP = 0.05, FLY = [0.18, 0.26], NAIL = FLY[0] + FLY[1], QUIVER = 1.5;
const LEAP = [0.12, 0.62], DUST = 0.62;
/// The words that wait for the picture (lingjing.js pieceGate): a sentence holding `text` comes up only once beat
/// `beat` stands at `t` (s, its own timeline). zh's 「咯嘣」 sentence runs on through the five breaths (its 「；」
/// does not end it), so 「吸他一口气」 waits on nothing there; en's breath is its own sentence.
export const CUES = [
  { beat: 'chew', t: 0.1, text: { zh: '饭桶嚼了很久', en: 'chewed for a long time' } },
  { beat: 'chew', t: 0.9, text: { zh: '咯嘣', en: 'Crunch' } },
  { beat: 'breaths', t: BREATH.first + 0.1, text: { zh: '吸他一口气', en: 'drew a breath' } },
  { beat: 'sword', t: SNAP, text: { zh: '咔哒', en: 'click' } },
  { beat: 'dive', t: LEAP[0], text: { zh: '扎进了柴堆', en: 'into the woodpile' } },
];

/// The darkening edge: clear in the middle, dark at the rim — a canvas, the way fx.js makes the grain.
function shadeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w / 2));
  c.height = Math.max(2, Math.round(h / 2));
  const g = c.getContext('2d');
  const r = Math.hypot(c.width, c.height) / 2;
  const grad = g.createRadialGradient(c.width / 2, c.height / 2, r * 0.22, c.width / 2, c.height / 2, r);
  grad.addColorStop(0, 'rgba(12,8,6,0)');
  grad.addColorStop(0.5, 'rgba(12,8,6,0.7)');
  grad.addColorStop(1, 'rgba(12,8,6,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function build({ PIXI, gsap, app, root, W, H, art, lang = 'zh' }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const T = stage.tex;
  const S = shots(W, H);
  const lay = layout();
  const view = { ...S.feed[0] };
  const L = stage.layer('shed', view, { from: [0.42, 0.6] });
  // A cut-out on the painting (its pixels): `w` wide, anchored at (ax, ay) of its box.
  const place = (key, { x, y, w, ax = 0.5, ay = 1 }) => {
    const [pw, ph] = SIZES[key];
    const s = T[key] ? new PIXI.Sprite(T[key]) : new PIXI.Graphics().rect(0, 0, pw, ph).fill({ color: 0x9a9184, alpha: 0.5 });
    if (s.anchor) s.anchor.set(ax, ay); else s.pivot.set(pw * ax, ph * ay);
    s.scale.set(w / pw);
    s.position.set(x, y);
    return s;
  };
  const bodyW = SIZES.body[0] * (lay.potH / SIZES.body[1]);
  // Back to front: 小狰 hiding behind the pot, the rubbish falling in (behind the body, so the rim swallows it),
  // the body, the lid, the breath, the red light, the sword.
  const zheng = place('zheng', { x: lay.foot[0] + bodyW * 0.18, y: lay.foot[1] - lay.potH * 0.45, w: lay.zhengW, ay: 0.5 });
  // Painted diving left: he faces the woodpile as he is.
  const zs = { x: zheng.scale.x, y: zheng.scale.y }, zhome = [zheng.x, zheng.y];
  const gourd = place('gourd', { x: 0, y: 0, w: lay.gourdW, ay: 0.5 });
  const shards = [0, 1, 2].map(() => place('shard', { x: 0, y: 0, w: lay.shardW, ay: 0.5 }));
  const body = place('body', { x: lay.foot[0], y: lay.foot[1], w: bodyW });
  const lidFoot = lay.rim[1];
  const lid = place('lid', { x: lay.rim[0], y: lidFoot, w: lay.lidW });
  const wisp = place('wisp', { x: lay.him[0], y: lay.him[1], w: lay.potH * 0.32, ay: 0.5 });
  const dust = place('wisp', { x: lay.pile[0], y: lay.pile[1], w: lay.potH * 0.9, ay: 0.5 });
  dust.tint = 0x8a7f70;
  const ds = { x: dust.scale.x, y: dust.scale.y };
  const red = new PIXI.Sprite(stage.glowTex([255, 70, 40]));
  red.anchor.set(0.5);
  red.blendMode = 'add';
  const streak = new PIXI.Sprite(stage.glowTex([255, 96, 56]));
  streak.anchor.set(1, 0.5);
  streak.blendMode = 'add';
  const sword = place('sword', { x: 0, y: 0, w: lay.swordW, ax: MARKS.sword.tip[0], ay: MARKS.sword.tip[1] });
  // The door swallows the point: the sword shows only on this side of the door's face.
  const doorFace = new PIXI.Graphics().rect(0, 0, lay.door[0], lay.ih).fill(0xffffff);
  sword.mask = doorFace;
  // The night: the paintings were made on daylit paper; in the shed they take its dark (a multiply tint, no new picture).
  for (const s of [body, lid, gourd, ...shards, zheng]) s.tint = NIGHT;
  sword.tint = NIGHT_RED;
  L.cam.addChild(zheng, gourd, ...shards, body, lid, wisp, dust, red, streak, sword, doorFace);
  // His sight: over the whole frame, under the grain.
  const shadeTex = PIXI.Texture.from(shadeCanvas(W, H));
  const shade = new PIXI.Sprite(shadeTex);
  shade.width = W;
  shade.height = H;
  root.addChild(shade);
  stage.grain();
  const tempo = tempoOf(lang);
  const gs = { x: gourd.scale.x, y: gourd.scale.y }, ss = { x: shards[0].scale.x, y: shards[0].scale.y };
  const ls = { x: lid.scale.x, y: lid.scale.y }, bs = { x: body.scale.x, y: body.scale.y };
  const sw = sword.scale.x;
  const mouth = [lay.rim[0], lay.rim[1] + lay.potH * 0.04];
  const angle = Math.atan2(lay.flight.to[1] - lay.flight.from[1], lay.flight.to[0] - lay.flight.from[0]);
  const glowR = lay.potH * 0.9; // the red light's size, at its flare

  const unseen = () => {
    gourd.alpha = 0; shards.forEach((s) => { s.alpha = 0; });
    lid.position.set(lay.rim[0], lidFoot); lid.rotation = 0; lid.scale.set(ls.x, ls.y);
    body.scale.set(bs.x, bs.y); body.rotation = 0;
    wisp.alpha = 0; dust.alpha = 0; red.alpha = 0; streak.alpha = 0; sword.alpha = 0;
    zheng.alpha = 0; zheng.rotation = 0;
    shade.alpha = 0;
  };
  unseen();
  /// 嚼: the lid jitters on the rim, the body squats and swells — a burst `dur` long from `at`.
  const chewOn = (tl, at, dur) => {
    const n = Math.max(2, Math.round(dur / 0.11));
    const lk = [], bk = [];
    for (let i = 0; i < n; i += 1) {
      const a = i % 2 ? -1 : 1;
      lk.push({ y: lidFoot - lay.potH * (0.018 + 0.012 * (i % 3)), rotation: a * 0.035, duration: dur / n / 2 }, { y: lidFoot, rotation: 0, duration: dur / n / 2 });
      bk.push({ x: bs.x * 1.025, y: bs.y * 0.975, duration: dur / n / 2 }, { x: bs.x, y: bs.y, duration: dur / n / 2 });
    }
    tl.to(lid, { keyframes: lk, ease: 'none' }, at).to(body.scale, { keyframes: bk, ease: 'none' }, at);
  };

  const beats = {
    feed: () => {
      const tl = bag.timeline({ paused: true });
      const [fx0, fy0] = [mouth[0] - lay.potH * 0.55, mouth[1] - lay.potH * 0.75];
      tl.call(unseen, null, 0)
        .fromTo(L.soak, { v: 0 }, { v: 1, duration: SOAK, ease: 'power1.inOut' }, 0)
        .fromTo(view, { ...S.feed[0] }, { ...S.feed[1], duration: 2.4, ease: 'sine.inOut' }, 0)
        // 按开饭桶: the lid lifts and tips aside.
        .fromTo(lid, { y: lidFoot, x: lay.rim[0], rotation: 0 }, { y: lidFoot - lay.potH * 0.42, x: lay.rim[0] + lay.potH * 0.22, rotation: 0.35, duration: LIFT[1], ease: 'power2.out' }, LIFT[0])
        // 一股脑儿倒了进去: the gourd, then the shards, tumble in and the rim takes them.
        .fromTo(gourd, { x: fx0, y: fy0, rotation: -0.6, alpha: 0 }, { x: mouth[0], y: mouth[1] + lay.potH * 0.3, rotation: 1.4, alpha: 1, duration: GOURD[1], ease: 'power2.in' }, GOURD[0]);
      shards.forEach((s, i) => {
        tl.fromTo(s, { x: fx0 + lay.potH * (0.06 * i), y: fy0 - lay.potH * 0.06 * i, rotation: i, alpha: 0 }, { x: mouth[0] + lay.potH * (0.05 * (i - 1)), y: mouth[1] + lay.potH * 0.25, rotation: i + 2.2, alpha: 1, duration: SHARDS[1], ease: 'power2.in' }, SHARDS[0] + i * 0.12);
      });
      // …and the lid drops back on, with a little bounce.
      tl.to(lid, { y: lidFoot, x: lay.rim[0], rotation: 0, duration: SHUT[1], ease: 'power3.in' }, SHUT[0])
        .to(lid, { keyframes: [{ y: lidFoot - lay.potH * 0.03, duration: 0.08 }, { y: lidFoot, duration: 0.1 }], ease: 'sine.out' }, SHUT[0] + SHUT[1])
        .set([gourd, ...shards], { alpha: 0 }, SHUT[0] + SHUT[1])
        .to({}, { duration: 0.01 }, 2.39);
      return tl.timeScale(1 / tempo);
    },
    chew: () => {
      const tl = bag.timeline({ paused: true });
      tl.fromTo(view, { ...S.chew[0] }, { ...S.chew[1], duration: 2.2, ease: 'sine.inOut' }, 0);
      for (const [at, dur] of CHEW) chewOn(tl, at, dur);
      tl.to({}, { duration: 0.01 }, 2.19);
      return tl.timeScale(1 / tempo);
    },
    breaths: () => {
      const tl = bag.timeline({ paused: true });
      tl.fromTo(view, { ...S.breaths[0] }, { ...S.breaths[1], duration: 4.9, ease: 'sine.inOut' }, 0)
        .fromTo(shade, { alpha: 0 }, { alpha: 0, duration: 0.01 }, 0);
      SHADE.forEach((dark, i) => {
        const at = BREATH.first + i * BREATH.every;
        // 歇一回，吸他一口气: a wisp drawn from him into the lid's seam…
        tl.fromTo(wisp, { x: lay.him[0], y: lay.him[1], alpha: 0, rotation: 0 }, { keyframes: [
          { alpha: 0.75, duration: BREATH.draw * 0.3 },
          { x: mouth[0], y: lidFoot - lay.potH * 0.04, alpha: 0, rotation: 0.6, duration: BREATH.draw * 0.7 },
        ], ease: 'power1.in' }, at)
          .fromTo(wisp.scale, { x: 1, y: 1 }, { x: 0.35, y: 0.35, duration: BREATH.draw, ease: 'power1.in' }, at)
          // …and his sight goes dark in a wave, and comes back a little less.
          .to(shade, { keyframes: [{ alpha: Math.min(0.92, dark + 0.16), duration: 0.22 }, { alpha: dark, duration: 0.34 }], ease: 'sine.inOut' }, at + BREATH.draw * 0.7);
        // The short chew after it (none after the fifth: it holds its breath for the snap).
        if (i < 4) chewOn(tl, at + BREATH.draw + 0.08, BREATH.every - BREATH.draw - 0.12);
      });
      tl.to({}, { duration: 0.01 }, 4.89);
      return tl.timeScale(1 / tempo);
    },
    sword: () => {
      const tl = bag.timeline({ paused: true });
      const [a, b] = [lay.flight.from, lay.flight.to];
      tl.fromTo(view, { ...S.sword[0] }, { ...S.sword[1], duration: NAIL - 0.06, ease: 'power3.inOut' }, 0.06)
        // 「咔哒」一弹: the lid jumps.
        .fromTo(lid, { y: lidFoot, rotation: 0 }, { keyframes: [{ y: lidFoot - lay.potH * 0.2, rotation: -0.22, duration: 0.09 }, { y: lidFoot, rotation: 0, duration: 0.16 }], ease: 'power2.out' }, SNAP)
        .fromTo(body.scale, { x: bs.x, y: bs.y }, { keyframes: [{ x: bs.x * 1.06, y: bs.y * 0.93, duration: 0.07 }, { x: bs.x, y: bs.y, duration: 0.2 }], ease: 'back.out(3)' }, SNAP)
        // 一道红光窜出来: the light flares at the seam…
        .set(red, { x: mouth[0], y: lidFoot - lay.potH * 0.05 }, 0)
        .fromTo(red, { alpha: 0, width: glowR * 0.2, height: glowR * 0.2 }, { keyframes: [{ alpha: 1, width: glowR, height: glowR, duration: 0.14 }, { alpha: 0, width: glowR * 1.3, height: glowR * 1.3, duration: 0.5 }], ease: 'power2.out' }, SNAP)
        // …and the sword in it streaks for the door, point first.
        .set(sword, { rotation: angle, alpha: 1 }, FLY[0])
        .fromTo(sword, { x: a[0], y: a[1] }, { x: b[0], y: b[1], duration: FLY[1], ease: 'power2.in' }, FLY[0])
        .set(streak, { rotation: angle, alpha: 0.9 }, FLY[0])
        .fromTo(streak, { x: a[0], y: a[1], width: lay.swordW * 0.3, height: lay.potH * 0.22 }, { x: b[0] - lay.swordW * SINK, y: b[1], width: lay.swordW * 1.6, height: lay.potH * 0.16, duration: FLY[1], ease: 'power2.in' }, FLY[0])
        .to(streak, { alpha: 0, duration: 0.35, ease: 'power1.out' }, NAIL)
        // 「笃」: it bites; the frame jolts; a last red flash at the door.
        .fromTo(view, { fy: S.sword[1].fy }, { keyframes: [{ fy: S.sword[1].fy - 0.006, duration: 0.04 }, { fy: S.sword[1].fy + 0.004, duration: 0.05 }, { fy: S.sword[1].fy, duration: 0.07 }], ease: 'none', immediateRender: false }, NAIL)
        .set(red, { x: lay.door[0], y: lay.door[1] }, NAIL)
        .fromTo(red, { alpha: 0.9, width: glowR * 0.5, height: glowR * 0.5 }, { alpha: 0, width: glowR * 0.8, height: glowR * 0.8, duration: 0.45, ease: 'power2.out', immediateRender: false }, NAIL)
        .to(shade, { alpha: SHADE.at(-1) - 0.2, duration: 0.6, ease: 'sine.out' }, NAIL);
      // 剑柄还在嗡嗡地颤: the hilt quivers about the point, dying away.
      const q = [];
      for (let i = 0; i < 14; i += 1) q.push({ rotation: angle + (i % 2 ? -1 : 1) * 0.07 * (1 - i / 14), duration: QUIVER / 14 });
      q.push({ rotation: angle, duration: 0.05 });
      tl.to(sword, { keyframes: q, ease: 'sine.inOut' }, NAIL)
        .to({}, { duration: 0.01 }, 1.99);
      return tl.timeScale(1 / tempo);
    },
    dive: () => {
      const tl = bag.timeline({ paused: true });
      const from = zhome, peak = [(from[0] + lay.pile[0]) / 2, Math.min(from[1], lay.pile[1]) - lay.potH * 0.55];
      tl.fromTo(view, { ...S.dive[0] }, { ...S.dive[1], duration: 1.0, ease: 'power2.inOut' }, 0)
        // 小狰一头扎进了柴堆: up from behind the pot, over, headfirst into the pile.
        .fromTo(zheng, { alpha: 0, x: from[0], y: from[1], rotation: 0.2 }, { keyframes: [
          { alpha: 1, x: peak[0], y: peak[1], rotation: -0.15, duration: LEAP[1] * 0.45, ease: 'power2.out' },
          { x: lay.pile[0], y: lay.pile[1], rotation: -0.55, duration: LEAP[1] * 0.55, ease: 'power2.in' },
          { alpha: 0, duration: 0.08 },
        ] }, LEAP[0])
        .fromTo(zheng.scale, { x: zs.x, y: zs.y }, { x: zs.x * 0.75, y: zs.y * 0.75, duration: LEAP[1], ease: 'power1.in' }, LEAP[0])
        .fromTo(dust, { alpha: 0 }, { keyframes: [{ alpha: 0.7, duration: 0.12 }, { alpha: 0, duration: 0.8 }], ease: 'sine.out' }, DUST + LEAP[0])
        .fromTo(dust.scale, { x: ds.x * 0.5, y: ds.y * 0.5 }, { x: ds.x * 1.2, y: ds.y * 1.1, duration: 0.9, ease: 'power2.out' }, DUST + LEAP[0])
        .to({}, { duration: 0.01 }, 1.59);
      return tl.timeScale(1 / tempo);
    },
  };
  // A beat that is not the first is never the first frame: it starts where the beats before it left things.
  stage.apply();
  return {
    beat(id) { return beats[id](); },
    step() { stage.apply(); },
    destroy() {
      bag.killAll();
      stage.destroy();
      shadeTex.destroy(true);
    },
  };
}

/* ── No WebGL: each beat's last frame — the shed where the camera ends, the pot, and what stands ── */
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const a = (k) => arts[k] ?? ART[k];
  const S = shots(W, H)[id] ?? shots(W, H).dive;
  const lay = layout();
  const svg = stillOf(a('shed'), S[1], { W, H });
  const k = BEATS.findIndex((b) => b.id === id);
  const im = (key, x, y, w, ax, ay, extra = '') => { const h = w * (SIZES[key][1] / SIZES[key][0]); return `<image href="${a(key)}" x="${(x - ax * w).toFixed(1)}" y="${(y - ay * h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="none"${extra}/>`; };
  const bodyW = SIZES.body[0] * (lay.potH / SIZES.body[1]);
  let over = im('body', lay.foot[0], lay.foot[1], bodyW, 0.5, 1) + im('lid', lay.rim[0], lay.rim[1], lay.lidW, 0.5, 1);
  if (k >= 3) {
    const [x, y] = lay.flight.to, deg = (Math.atan2(y - lay.flight.from[1], x - lay.flight.from[0]) * 180) / Math.PI;
    over += `<clipPath id="hc-door"><rect x="0" y="0" width="${lay.door[0].toFixed(1)}" height="${lay.ih}"/></clipPath>`
      + `<g clip-path="url(#hc-door)"><g transform="rotate(${deg.toFixed(2)} ${x.toFixed(1)} ${y.toFixed(1)})">${im('sword', x, y, lay.swordW, MARKS.sword.tip[0], MARKS.sword.tip[1])}</g></g>`;
  }
  // His sight, gone dark at the edge after the breaths (a shade, like the game's).
  const dark = k >= 3 ? SHADE.at(-1) - 0.2 : k === 2 ? SHADE.at(-1) : 0;
  const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const shade = dark ? `<radialGradient id="hc-shade" cx="50%" cy="50%" r="72%"><stop offset="0.32" stop-color="#0c0806" stop-opacity="0"/><stop offset="0.7" stop-color="#0c0806" stop-opacity="${(0.55 * dark).toFixed(2)}"/><stop offset="1" stop-color="#0c0806" stop-opacity="${dark.toFixed(2)}"/></radialGradient><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="url(#hc-shade)"/>` : '';
  return svg.replace(/<\/svg>$/, `${over}${shade}</svg>`);
}
