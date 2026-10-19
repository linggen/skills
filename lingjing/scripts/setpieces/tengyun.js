// setpieces/tengyun.js — 腾云 (第一回, 00-yinyue): the demon queen's cloud, and how far it got.
// The book (01-第一回.md): 「说着两只光脚在地下轻轻一跺，只见她脚底下腾起一团白蒙蒙的云气，托着她，悠悠地
// 升了起来……升到半丈来高，那团云忽然晃了一晃……『噗』的一声，散了。她……『扑通』一屁股坐在了草地上……那草
// 一圈一圈地亮开去」 (Hanli, 2026-10-16: 「可以」).
//
// One beat on the paragraph the scene marks `{景=tengyun}` (lingjing.js beatPiece lays it under its
// words): she stamps; a small cloud gathers under her bare feet and lifts her, slowly; at half a
// zhang it wobbles and pops; she drops and sits; and the grass lights up in rings around where she
// sits. Small on purpose, beside the boast (setpieces/yaowang.js): the same girl, the same valley.
// Paced to lines.js's 自动 (zh: 「散了」 comes up ~5.8 s in, 「扑通」 ~8.2 s; en a little later — `TEMPO`).
//
// Painted, never drawn: the valley is the house painting of 银叶谷 (art/places/yingu.webp); she
// standing, she sitting, the cloud and the ring of lit grass are cut-outs (tools/paint-yaowang.py,
// local FLUX). Code places and moves them; it draws nothing.
import { tweenBag } from './bag.js';
import { paintedStage, stillOf } from './painted.js';
import { SPEEDS } from '../lines.js';

export const BEATS = [
  {
    id: 'yun', art: 'vale', ms: 9600,
    line: {
      zh: '说着两只光脚在地下轻轻一跺，只见她脚底下腾起一团白蒙蒙的云气，托着她，悠悠地升了起来',
      en: 'She stamped her two bare feet lightly on the ground, and a puff of milky cloud rose up under her and bore her up, floating gently',
    },
  },
];

export const TITLE = { zh: '腾云', en: 'Riding the Cloud' };
/// The valley (the house's 银叶谷) and four cut-outs, each at a fixed size (`SIZES`, w×h px).
export const ART = {
  vale: 'art/places/yingu.webp', stand: 'art/setpiece/tengyun-stand.webp', sit: 'art/setpiece/tengyun-sit.webp',
  cloud: 'art/setpiece/tengyun-cloud.webp', ring: 'art/setpiece/tengyun-ring.webp',
};
export const SIZES = { vale: [1536, 1024], stand: [384, 768], sit: [512, 448], cloud: [512, 320], ring: [512, 512] };
/// The ring of lit grass lies on the ground: its painting (seen from above) laid flat.
const FLAT = 0.34;
export const TEMPO = { zh: 1, en: 1.1 };
/// Timed at 自动 ×0.45; it keeps up with 自动 as it reads now (SPEEDS.mid, ×0.33 since 2026-10-19).
export const tempoOf = (lang) => (TEMPO[lang] ?? 1) * (SPEEDS.mid / 0.45);
/// The camera on the valley: a little low, on the grass before the stream.
export const SHOT = [{ s: 1.3, fx: 0.42, fy: 0.74 }, { s: 1.3, fx: 0.42, fy: 0.74 }]; // held: she stands on its grass

/// Where she stands and how tall, in the frame's units (W × H: wide on a desk, tall on a phone). Pure.
export function layout(W, H) {
  const tall = H > W;
  const h = Math.min(H * (tall ? 0.3 : 0.4), W * (tall ? 0.44 : 0.3));
  // Her feet above the words' band over the stage's lower third (live, 2026-10-19: at 0.86 she sat under the text).
  const x = W * (tall ? 0.5 : 0.44), y = H * (tall ? 0.58 : 0.7);
  return { x, y, h, rise: h * 0.62, ringW: h * 1.05 };
}

const STAMP = 2.2, RISE = [2.5, 3.1], WOBBLE = [5.9, 1.0], POP = 7.0, DROP_S = 0.36, RINGS = 7.5, RING_GAP = 0.4, END = 9.6;

export function build({ PIXI, gsap, app, root, W, H, art, lang = 'zh' }) {
  const bag = tweenBag(gsap);
  const stage = paintedStage({ PIXI, app, root, W, H, art });
  const T = stage.tex;
  const lay = layout(W, H);
  const L = stage.layer('vale', { ...SHOT[0] }, { from: [lay.x / W, lay.y / H] });
  const place = (key, { x, y, w, ax = 0.5, ay = 1 }) => {
    const [pw, ph] = SIZES[key];
    const s = T[key] ? new PIXI.Sprite(T[key]) : new PIXI.Graphics().rect(0, 0, pw, ph).fill({ color: 0x9a9184, alpha: 0.5 });
    const k = w / pw;
    if (s.anchor) s.anchor.set(ax, ay); else s.pivot.set(pw * ax, ph * ay);
    s.scale.set(k);
    s.position.set(x, y);
    return s;
  };
  const standW = lay.h * (SIZES.stand[0] / SIZES.stand[1]);
  const rings = [1, 1.75, 2.6].map(() => place('ring', { x: lay.x, y: lay.y - lay.h * 0.02, w: lay.ringW, ay: 0.5 }));
  for (const r of rings) r.blendMode = 'screen'; // lit, not laid on
  const cloud = place('cloud', { x: lay.x, y: lay.y + lay.h * 0.04, w: standW * 2.1, ay: 0.62 });
  const stand = place('stand', { x: lay.x, y: lay.y, w: standW });
  const sit = place('sit', { x: lay.x, y: lay.y + lay.h * 0.03, w: lay.h * 0.86 });
  const her = new PIXI.Container();
  her.addChild(cloud, stand);
  L.pic.addChild(...rings, her, sit);
  const unseen = () => {
    her.position.set(0, 0); her.rotation = 0;
    cloud.alpha = 0; stand.alpha = 1; sit.alpha = 0;
    rings.forEach((r) => { r.alpha = 0; });
  };
  unseen();
  stage.grain();
  const tempo = tempoOf(lang);
  const ringScale = rings[0].scale.x;

  const beats = {
    yun: () => {
      const tl = bag.timeline({ paused: true });
      const cs = cloud.scale.x, ss = stand.scale.x;
      tl.call(unseen, null, 0)
        .fromTo(L.soak, { v: 0 }, { v: 1, duration: 1.4, ease: 'power1.inOut' }, 0)
        .fromTo(L.view, { ...SHOT[0] }, { ...SHOT[1], duration: END, ease: 'sine.inOut' }, 0)
        // The stamp: a little dip, and the cloud gathers under her feet.
        .fromTo(stand.scale, { y: ss }, { y: ss * 0.96, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' }, STAMP)
        .fromTo(cloud, { alpha: 0 }, { alpha: 1, duration: 0.6, ease: 'sine.out' }, STAMP + 0.1)
        .fromTo(cloud.scale, { x: cs * 0.4, y: cs * 0.4 }, { x: cs, y: cs, duration: 0.8, ease: 'power2.out' }, STAMP + 0.1)
        // 悠悠地升了起来.
        .fromTo(her, { y: 0 }, { y: -lay.rise, duration: RISE[1], ease: 'sine.inOut' }, RISE[0])
        .fromTo(her, { x: 0 }, { x: lay.h * 0.03, duration: RISE[1] / 2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, RISE[0])
        // 那团云忽然晃了一晃.
        .to(her, { keyframes: [{ rotation: 0.07, x: -lay.h * 0.03, duration: 0.2 }, { rotation: -0.09, x: lay.h * 0.04, duration: 0.25 }, { rotation: 0.05, x: -lay.h * 0.02, duration: 0.25 }, { rotation: -0.03, x: 0, duration: 0.3 }], ease: 'sine.inOut' }, WOBBLE[0])
        // 「噗」: the cloud bursts and is gone.
        .to(cloud.scale, { x: cs * 1.7, y: cs * 1.5, duration: 0.3, ease: 'power2.out' }, POP)
        .to(cloud, { alpha: 0, duration: 0.3, ease: 'power1.in' }, POP)
        // …and she drops, and sits.
        .to(her, { y: 0, rotation: 0, duration: DROP_S, ease: 'power2.in' }, POP + 0.05)
        .set(stand, { alpha: 0 }, POP + 0.05 + DROP_S)
        .set(sit, { alpha: 1 }, POP + 0.05 + DROP_S)
        .fromTo(sit.scale, { y: sit.scale.y * 0.9 }, { y: sit.scale.y, duration: 0.3, ease: 'back.out(3)' }, POP + 0.05 + DROP_S);
      // 那草一圈一圈地亮开去: ring after ring of lit grass opens out from where she sits, and stays faintly lit.
      rings.forEach((r, k) => {
        const to = ringScale * [1, 1.75, 2.6][k];
        tl.fromTo(r.scale, { x: to * 0.35, y: to * 0.35 * FLAT }, { x: to, y: to * FLAT, duration: 1.4, ease: 'power2.out' }, RINGS + k * RING_GAP)
          .fromTo(r, { alpha: 0 }, { keyframes: [{ alpha: 0.95, duration: 0.45 }, { alpha: [0.7, 0.5, 0.35][k], duration: 0.95 }], ease: 'sine.out' }, RINGS + k * RING_GAP);
      });
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

/* ── No WebGL: the valley where the camera ends, her sitting in the rings ── */
export function stillSvg(id, { W = 1000, H = 1000, arts = {} } = {}) {
  const a = (k) => arts[k] ?? ART[k];
  const lay = layout(W, H);
  const valley = stillOf(a('vale'), SHOT[1], { W, H }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const box = stillOf(a('vale'), SHOT[1], { W, H }).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  // The cut-outs in the frame's units, laid over the valley's crop (its own viewBox) as a nested svg.
  const im = (k, x, y, w, ay, op = 1, flat = 1) => { const h = w * (SIZES[k][1] / SIZES[k][0]) * flat; return `<image href="${a(k)}" x="${(x - w / 2).toFixed(1)}" y="${(y - ay * h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" opacity="${op}" preserveAspectRatio="none"/>`; };
  const rings = [1, 1.75, 2.6].map((k, i) => im('ring', lay.x, lay.y - lay.h * 0.02, lay.ringW * k, 0.5, [0.7, 0.5, 0.35][i], FLAT)).join('');
  return `<svg class="spstill" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><svg viewBox="${box.join(' ')}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${valley}</svg>${rings}${im('sit', lay.x, lay.y + lay.h * 0.03, lay.h * 0.86, 1)}</svg>`;
}
