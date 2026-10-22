// setpieces/tengyun.js — 腾云 (第一回, 00-yinyue): the demon queen's cloud, and how far it got.
// The book (01-第一回.md): 「说着两只光脚在地下轻轻一跺，只见她脚底下腾起一团白蒙蒙的云气，托着她，悠悠地
// 升了起来……升到半丈来高，那团云忽然晃了一晃……『噗』的一声，散了。她……『扑通』一屁股坐在了草地上……那草
// 一圈一圈地亮开去」 (Hanli, 2026-10-16: 「可以」).
//
// One beat on the paragraph the scene marks `{景=tengyun}` (lingjing.js beatPiece lays it under its
// words): she stamps; a small cloud gathers under her bare feet and lifts her, slowly; at half a
// zhang it wobbles and pops; she drops and sits; and the grass lights up in rings around where she
// sits. Small on purpose, beside the boast (setpieces/yaowang.js): the same girl, the same valley.
// At its own pace, ~6 s, never the words' (Hanli, 2026-10-19: 「动画太快了」); the words wait for it (`CUES`):
// 「晃了一晃…散了」 as the cloud wobbles, 「扑通」 as she lands.
//
// Painted, never drawn: the valley is the house painting of 银叶谷 (art/places/yingu.webp); she
// standing, she sitting, the cloud and the ring of lit grass are cut-outs (tools/paint-yaowang.py,
// local FLUX). Code places and moves them; it draws nothing but light (the soft puffs, the sparks).
//
// On Phaser since 10-22 (Hanli: 「yinyue飞天那一场, 是否也可以用游戏引擎改, 那个支持重力? phraser?」 → 「A」:
// the same beat, no input, real physics for the motion). The piece is a scene on the stage's one game
// (kit/stage.js, layer `piece`), the clock kit/timeline.js, the valley's soak kit/fx/ink.js. The motion
// is a small matter.js world (games/physics.js, the games' own): she is a body standing on the ground,
// then on the cloud — a body hung on two springs from a point the rise lifts — so the rise bobs and the
// wobble is the cloud really rocking under her; at 「噗」 the cloud goes and she falls under gravity onto
// the grass, with a small bounce. The world steps at a fixed 1/60 s on the piece's own clock, so it
// lands on the same second however the frames come, and a tap's `progress(1)` just steps it to the end.
// Its gravity is set from the fall's length (`FALL`): the landing is the cue 「扑通」 waits for.
import { Matter } from '../games/physics.js';
import { soakLayer, grainCanvas } from '../kit/fx/ink.js';
import { clockOf } from '../kit/timeline.js';
import { tweenBag } from './bag.js';
import { INK, PAPER, frameOf, glowCanvas, stillOf } from './painted.js';

/// Drawn by the stage's Phaser (setpiece.js runs it as a scene there), not Pixi.
export const ENGINE = 'phaser';

export const BEATS = [
  {
    id: 'yun', art: 'vale', ms: 6100,
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
/// The piece's own pace (×its drawn length), apart from the words' speed: ~6 s, she sits at ~4.6 s.
export const TEMPO = { zh: 1, en: 1 };
export const tempoOf = (lang) => TEMPO[lang] ?? TEMPO.zh;
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

// Seconds on the drawn timeline: the valley soaks in, she stamps, rises slowly, wobbles, pops, falls, sits, the grass lights.
const SOAK = 1.0, STAMP = 1.5, RISE = [1.8, 1.4], WOBBLE = [3.2, 1.0], POP = 4.25, RING_GAP = 0.2, RING_S = 1.0, END = 6.1;
/// From 「噗」 to the grass: a real fall of half a zhang, not rushed (Hanli 10-19: 「动画太快了」).
export const FALL = 0.45;
export const LAND = POP + FALL;
const RINGS = LAND + 0.02;
export const TIMES = { SOAK, STAMP, RISE, WOBBLE, POP, FALL, LAND, RINGS, END };
/// The words that wait for the picture (lingjing.js pieceGate): a sentence holding `text` comes up only once
/// beat `beat` stands at `t` (s, its own timeline) — the wobble with 「晃了一晃」, the landing with 「扑通」.
export const CUES = [
  { beat: 'yun', t: WOBBLE[0], text: { zh: '晃了一晃', en: 'wobbled' } },
  { beat: 'yun', t: LAND, text: { zh: '扑通', en: 'thump' } },
];

/* ── The world: pure, engine-free (Matter by injection), stepped on the piece's clock ── */

const DT = 1000 / 60; // ms a step
const sineInOut = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
/// How high the springs' hold has lifted at `t` (frame units): 悠悠地 — slow in, slow out.
export const liftAt = (t, rise) => rise * sineInOut(clamp01((t - RISE[0]) / RISE[1]));
/// The bodies' shapes, as shares of her height `h` (and her standing width): her body feet to crown, the
/// cloud's back she stands on, the springs' spread on it and their give, the wobble's push.
export const BODY = { herW: 0.34, herH: 0.92, herTurn: 1.6, cloudW: 1.25, cloudH: 0.12, arm: 0.18, stiff: 0.025, damp: 0.05, kick: 0.07, shove: 0.002, bounce: 0.22 };

/// The 腾云 world for layout `lay`. `to(t)` steps it to `t` (s; back in time it starts over — it is a
/// function of time); `her()`, `cloud()` the bodies' poses (centre, angle, her feet, the cloud's back);
/// `landed` {t, x} once she is down; `popAt` her pose when the cloud went.
export function skyOf(M, lay) {
  const { Engine, Bodies, Body, Composite, Constraint, Events } = M;
  const B = BODY;
  const standW = lay.h * (SIZES.stand[0] / SIZES.stand[1]);
  const hw = standW * B.herW, hh = lay.h * B.herH, cw = standW * B.cloudW, ch = lay.h * B.cloudH, arm = cw * B.arm;
  const ground = lay.y;
  // Gravity (frame units per ms²) that brings a body down `d` in `s` seconds of whole steps.
  const gFor = (d, s) => { const n = Math.max(1, Math.round((s * 1000) / DT)); return (2 * d) / (DT * DT * n * (n + 1)); };
  let engine, floor, her, cloud, springs, g, t, n, landed, popAt, kicked, risen;
  const reset = () => {
    engine = Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    // Only she has weight (applied by hand, below): the cloud floats on its springs.
    floor = Bodies.rectangle(lay.x, ground + 500, 8000, 1000, { isStatic: true, friction: 1, collisionFilter: { category: 1, mask: 2 } });
    her = Bodies.rectangle(lay.x, ground - hh / 2, hw, hh, { friction: 1, frictionStatic: 4, frictionAir: 0, restitution: B.bounce, density: 0.002, collisionFilter: { category: 2, mask: 1 | 4 } });
    Body.setInertia(her, her.inertia * B.herTurn);
    cloud = Bodies.rectangle(lay.x, ground + ch / 2, cw, ch, { chamfer: { radius: ch * 0.45 }, friction: 1, frictionStatic: 4, frictionAir: 0.04, density: 0.004, collisionFilter: { category: 4, mask: 2 } });
    springs = [-1, 1].map((sx) => Constraint.create({ pointA: { x: lay.x + sx * arm, y: ground + ch / 2 }, bodyB: cloud, pointB: { x: sx * arm, y: 0 }, length: 0, stiffness: B.stiff, damping: B.damp }));
    Composite.add(engine.world, [floor, her]);
    g = gFor(lay.rise, FALL);
    t = 0; n = 0; landed = null; popAt = null; kicked = false; risen = false;
    Events.on(engine, 'collisionStart', (e) => {
      if (!popAt || landed) return;
      if (e.pairs.some((p) => p.bodyA === floor || p.bodyB === floor)) landed = { t, x: her.position.x };
    });
  };
  const stepOnce = () => {
    t = ((n + 1) * DT) / 1000;
    // The stamp gathered the cloud under her feet: from the rise it holds her.
    if (!risen && t >= RISE[0]) { risen = true; Composite.add(engine.world, [cloud, ...springs]); }
    if (risen && !popAt) {
      const ay = ground + ch / 2 - liftAt(t, lay.rise);
      springs.forEach((s, i) => { s.pointA.x = lay.x + (i ? 1 : -1) * arm; s.pointA.y = ay; });
    }
    // 那团云忽然晃了一晃: a push that rocks it, and her on it, till the springs settle it.
    if (!kicked && t >= WOBBLE[0]) { kicked = true; Body.setAngularVelocity(cloud, B.kick); Body.setVelocity(cloud, { x: -lay.h * B.shove, y: 0 }); }
    // 「噗」: the cloud is gone; she keeps her lean (no spin in the air) and falls the rest in FALL.
    if (!popAt && t >= POP) {
      popAt = { t, x: her.position.x, y: her.position.y, a: her.angle, cloud: { x: cloud.position.x, y: cloud.position.y, a: cloud.angle } };
      Composite.remove(engine.world, [cloud, ...springs]);
      Body.setInertia(her, Infinity);
      Body.setAngularVelocity(her, 0);
      g = gFor(Math.max(1, ground - her.bounds.max.y), LAND - t);
    }
    Body.applyForce(her, her.position, { x: 0, y: her.mass * g });
    Engine.update(engine, DT);
    n += 1;
  };
  reset();
  const sky = {
    get t() { return t; },
    to(T) { if (T < t - 1e-6) reset(); while (((n + 1) * DT) / 1000 <= T + 1e-9) stepOnce(); return sky; },
    get landed() { return landed; },
    get popAt() { return popAt; },
    get risen() { return risen; },
    ground, hh, ch,
    her: () => ({ x: her.position.x, y: her.position.y, a: her.angle, feet: her.position.y + hh / 2 }),
    cloud: () => ({ x: cloud.position.x, y: cloud.position.y, a: cloud.angle, back: cloud.position.y - ch / 2 }),
  };
  return sky;
}

/* ── The light, as functions of time (seekable as the world is) ── */

const rngOf = (seed) => { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; };
/// The puffs that gather into the cloud and burst from it: painted cloudlets (the cloud's own cut-out,
/// small) and soft light. Each: where it comes from, its place on the cloud, its size, its way out.
export function puffsOf(lay, n = 16) {
  const r = rngOf('tengyun:puffs'), standW = lay.h * (SIZES.stand[0] / SIZES.stand[1]);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + r() * 0.4, cloudlet = i % 2 === 0;
    return {
      cloudlet,
      from: [Math.cos(a) * standW * (1.1 + r() * 0.9), lay.h * (0.02 + r() * 0.06)], // off the grass, round her feet
      slot: [Math.cos(a) * standW * (0.55 + r() * 0.35), Math.sin(a) * lay.h * 0.05 + lay.h * 0.02],
      size: standW * (cloudlet ? 0.3 + r() * 0.22 : 0.45 + r() * 0.4),
      out: ((dx, dy, m) => [(dx / Math.hypot(dx, dy)) * m, (dy / Math.hypot(dx, dy)) * m])(Math.cos(a), Math.sin(a) * 0.5 - 0.45, 1 + r() * 0.6), // the burst: out, and a little up
      lag: r() * 0.35,
      bob: r() * Math.PI * 2,
    };
  });
}
/// Puff `p` at `t`: offset from the cloud's centre (frame units, before the cloud's turn), scale (×size), alpha.
export function puffAt(p, t, lay) {
  const g0 = STAMP + 0.1 + p.lag, g1 = g0 + 0.7;
  if (t < g0) return null;
  if (t < POP) {
    const u = 1 - (1 - clamp01((t - g0) / (g1 - g0))) ** 3; // drawn in, slowing as it arrives
    const bob = Math.sin(t * 3 + p.bob) * lay.h * 0.008;
    return { x: p.from[0] + (p.slot[0] - p.from[0]) * u, y: p.from[1] + (p.slot[1] - p.from[1]) * u + bob, s: 0.55 + 0.45 * u, a: (p.cloudlet ? 0.9 : 0.5) * clamp01(u * 1.6) };
  }
  const tau = t - POP, reach = lay.h * 0.55 * (1 - Math.exp(-tau / 0.16)); // flung, slowed by the air
  if (tau > 0.7) return null;
  return { x: p.slot[0] + p.out[0] * reach, y: p.slot[1] + p.out[1] * reach, s: 1 + tau * 1.4, a: (p.cloudlet ? 0.9 : 0.5) * (1 - clamp01(tau / 0.6)) };
}
/// What the landing kicks up: bits of the lit grass (its own painting, cut small) and sparks of light.
export function kickOf(lay, n = 18) {
  const r = rngOf('tengyun:kick');
  return Array.from({ length: n }, (_, i) => {
    const side = i % 2 ? 1 : -1, grass = i % 3 !== 0;
    return { grass, frame: i % 4, x0: side * lay.h * (0.08 + r() * 0.22), vx: side * lay.h * (0.25 + r() * 0.6), vy: -lay.h * (0.9 + r() * 1.2), spin: (r() - 0.5) * 9, size: lay.h * (grass ? 0.06 + r() * 0.05 : 0.025 + r() * 0.025), life: 0.55 + r() * 0.45 };
  });
}
/// Bit `k` at `tau` s after the landing: offset from where she sat, its turn and alpha (or null, gone).
export function kickAt(k, tau, lay) {
  if (tau < 0 || tau > k.life) return null;
  const g = lay.h * 4.2;
  return { x: k.x0 + k.vx * tau, y: k.vy * tau + 0.5 * g * tau * tau, a: 1 - (tau / k.life) ** 2, rot: k.spin * tau };
}
/// Her sitting, as she lands: squashed down and wide, springing back (scale y, scale x) at `tau` s after.
export function squashAt(tau) {
  if (tau < 0) return [1, 1];
  const d = 0.14 * Math.exp(-tau / 0.11) * Math.cos(tau * 2 * Math.PI / 0.32);
  return [1 - d, 1 + d * 0.6];
}


/* ── Drawn: a scene on the stage's Phaser (setpiece.js) ── */

/// The piece on `scene` (a Phaser scene of the stage game `host`, layer `piece`), W×H frame units drawn
/// at `host.size` · dpr. The runner calls `step(ms)` each frame.
export function build({ Phaser, host, scene, W, H, art, lang = 'zh' }) {
  const clock = clockOf();
  const bag = tweenBag(clock);
  const lay = layout(W, H);
  const px = () => host.size.w * host.size.dpr;
  const k = px() / W;
  const cam = scene.cameras.main;
  const tex = (key) => {
    if (art[key]) return host.texture('piece', art[key]);
    const [w, h] = SIZES[key], c = document.createElement('canvas'); // its painting missing: a grey card its size
    c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(154,145,132,.5)'; g.fillRect(0, 0, w, h);
    return host.texture('piece', c);
  };
  const T = Object.fromEntries(Object.keys(ART).map((key) => [key, tex(key)]));
  const glowKey = host.texture('piece', glowCanvas(128, [255, 250, 236]));
  const sparkKey = host.texture('piece', glowCanvas(64, [236, 250, 200]));
  // The lit grass cut small: four bits of the ring's painting, for what the landing kicks up.
  const ringTex = scene.textures.get(T.ring);
  [[60, 250], [440, 240], [250, 80], [250, 420]].forEach(([x, y], i) => ringTex.add(`bit${i}`, 0, x - 34, y - 34, 68, 68));

  scene.add.rectangle(0, 0, W * k, H * k, PAPER).setOrigin(0);
  const vale = soakLayer(Phaser, scene, T.vale, { W, H, k, from: [lay.x / W, lay.y / H], rim: { color: INK, blend: 'multiply', alpha: 0.55 } });
  const view = { ...SHOT[0] };
  const fig = scene.add.container(0, 0).setScale(k); // the cut-outs, in the frame's units
  const img = (key, frame) => scene.add.image(0, 0, key, frame);
  const sized = (im, w) => im.setScale(w / im.width);
  const standW = lay.h * (SIZES.stand[0] / SIZES.stand[1]);
  const ringBase = lay.ringW / SIZES.ring[0];
  // '__BASE': the whole painting (adding the bits above made the first bit the texture's default frame).
  const rings = [1, 1.75, 2.6].map(() => img(T.ring, '__BASE').setBlendMode(Phaser.BlendModes.SCREEN).setAlpha(0)); // lit, not laid on
  // The light each ring carries out over the grass (screen alone hardly shows on the pale painting).
  const lightKey = host.texture('piece', glowCanvas(256, [222, 255, 176]));
  const lights = rings.map(() => img(lightKey).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
  const puffs = puffsOf(lay), puffIm = puffs.map((p) => sized(p.cloudlet ? img(T.cloud) : img(glowKey), p.size).setVisible(false));
  for (const [i, p] of puffs.entries()) if (!p.cloudlet) puffIm[i].setBlendMode(Phaser.BlendModes.SCREEN);
  const cloudW = standW * 2.1;
  const cloud = sized(img(T.cloud), cloudW).setOrigin(0.5, 0.62).setAlpha(0);
  const stand = sized(img(T.stand), standW).setOrigin(0.5, 1);
  const sitW = lay.h * 0.86;
  const sit = sized(img(T.sit), sitW).setOrigin(0.5, 1).setVisible(false);
  const kicks = kickOf(lay), kickIm = kicks.map((b) => {
    const im = b.grass ? img(T.ring, `bit${b.frame}`) : img(sparkKey).setBlendMode(Phaser.BlendModes.ADD);
    return sized(im, b.size).setVisible(false);
  });
  // Behind her: the rings and the puffs at the cloud's back; before her: the front puffs and the kicked grass.
  const back = puffIm.filter((_, i) => puffs[i].slot[1] < lay.h * 0.02), front = puffIm.filter((_, i) => puffs[i].slot[1] >= lay.h * 0.02);
  fig.add([...lights, ...rings, ...back, cloud, stand, sit, ...front, ...kickIm]);
  const grain = scene.add.tileSprite(0, 0, W * k, H * k, host.texture('piece', grainCanvas())).setOrigin(0).setAlpha(0.07).setBlendMode(Phaser.BlendModes.MULTIPLY);

  const sky = skyOf(Matter, lay);
  const fx = { dip: 1, gather: 0, cloudS: 0.4, burst: 1, cloudA: 1 }; // what the timeline moves besides the world
  let cur = null, dead = false, size = host.size;
  const tempo = tempoOf(lang);

  /* Everything where the clock says: the camera and soak, the world stepped to now, the light from it. */
  const apply = () => {
    if (dead) return;
    const t = cur ? cur.time() : 0;
    sky.to(t);
    vale.place(frameOf(view, vale.iw, vale.ih, W, H));
    vale.apply();
    const her = sky.her(), land = sky.landed, pop = sky.popAt;
    // Standing: on her feet where the world has her, turned as she leans; she soaks in with the valley (she stands at its start).
    stand.setVisible(!land).setAlpha(clamp01(vale.soak.v * 6));
    if (!land) {
      const fallU = pop ? clamp01((t - pop.t) / FALL) : 0, a = her.a * (1 - fallU); // in the air she rights herself
      stand.setPosition(her.x - Math.sin(her.a) * sky.hh / 2, her.y + Math.cos(her.a) * sky.hh / 2).setRotation(a);
      stand.setScale(standW / stand.width, (standW / stand.width) * fx.dip);
    }
    // The cloud: gathered under her feet, then riding its body, then gone in a burst where it was.
    const c = pop ? pop.cloud : sky.risen ? sky.cloud() : { x: lay.x, y: lay.y + sky.ch / 2, a: 0 };
    const back$ = c.y - sky.ch / 2;
    const s0 = cloudW / cloud.width;
    cloud.setPosition(c.x, back$ + lay.h * 0.04).setRotation(c.a).setScale(s0 * fx.cloudS * fx.burst, s0 * fx.cloudS * (1 + (fx.burst - 1) * 0.7)).setAlpha(fx.gather * fx.cloudA);
    const cos = Math.cos(c.a), sin = Math.sin(c.a);
    puffs.forEach((p, i) => {
      const at = puffAt(p, t, lay), im = puffIm[i];
      if (!at) { im.setVisible(false); return; }
      const ox = at.x, oy = at.y;
      im.setVisible(true).setPosition(c.x + ox * cos - oy * sin, back$ + lay.h * 0.04 + ox * sin + oy * cos).setScale((p.size / im.width) * at.s).setAlpha(at.a);
    });
    // Down: sitting where she landed, bounced by the world, squashed and springing back.
    if (land) {
      const tau = t - land.t, [sy, sx] = squashAt(tau), up = Math.max(0, sky.ground - her.feet);
      sit.setVisible(true).setPosition(land.x, sky.ground + lay.h * 0.03 - up).setScale((sitW / sit.width) * sx, (sitW / sit.width) * sy);
      kicks.forEach((b, i) => {
        const at = kickAt(b, tau, lay), im = kickIm[i];
        if (!at) { im.setVisible(false); return; }
        im.setVisible(true).setPosition(land.x + at.x, sky.ground - lay.h * 0.02 + at.y).setRotation(at.rot).setAlpha(at.a);
      });
    } else { sit.setVisible(false); kickIm.forEach((im) => im.setVisible(false)); }
    // 那草一圈一圈地亮开去 — from where she sat.
    const rx = land ? land.x : lay.x;
    for (const r of [...rings, ...lights]) r.setPosition(rx, lay.y - lay.h * 0.02);
  };
  /* The stage resized under it (a phone turned): the same picture, scaled to the new width. */
  const fit = () => {
    const now = host.size;
    if (now.w === size.w && now.h === size.h && now.dpr === size.dpr) return;
    size = now;
    cam.setViewport(0, 0, now.w * now.dpr, now.h * now.dpr).setOrigin(0, 0).setZoom(px() / W / k);
  };

  const beats = {
    yun: () => {
      cur?.kill();
      // From the start, whatever a run before left (a seek, a replay): the timeline reads its from-values off them.
      for (const im of [...rings, ...lights]) im.setAlpha(0);
      const tl = bag.timeline({ paused: true });
      const ringTo = (i) => ringBase * [1, 1.75, 2.6][i];
      tl.set(fx, { dip: 1, gather: 0, cloudS: 0.4, burst: 1, cloudA: 1 }, 0)
        .fromTo(vale.soak, { v: 0 }, { v: 1, duration: SOAK, ease: 'power1.inOut' }, 0)
        .fromTo(view, { ...SHOT[0] }, { ...SHOT[1], duration: END, ease: 'sine.inOut' }, 0)
        // The stamp: a little dip, and the cloud gathers under her feet (its puffs drawn in: puffAt).
        .fromTo(fx, { dip: 1 }, { dip: 0.96, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.inOut' }, STAMP)
        .fromTo(fx, { gather: 0 }, { gather: 1, duration: 0.6, ease: 'sine.out' }, STAMP + 0.1)
        .fromTo(fx, { cloudS: 0.4 }, { cloudS: 1, duration: 0.8, ease: 'power2.out' }, STAMP + 0.1)
        // 「噗」: the cloud bursts and is gone (its puffs flung out: puffAt).
        .fromTo(fx, { burst: 1 }, { burst: 1.7, duration: 0.3, ease: 'power2.out' }, POP)
        .fromTo(fx, { cloudA: 1 }, { cloudA: 0, duration: 0.3, ease: 'power1.in' }, POP);
      rings.forEach((r, i) => {
        const to = ringTo(i);
        tl.fromTo(r, { scaleX: to * 0.35, scaleY: to * 0.35 * FLAT }, { scaleX: to, scaleY: to * FLAT, duration: RING_S, ease: 'power2.out' }, RINGS + i * RING_GAP)
          .fromTo(r, { alpha: 0 }, { keyframes: [{ alpha: 0.95, duration: 0.4 }, { alpha: [0.7, 0.5, 0.35][i], duration: RING_S - 0.4 }], ease: 'sine.out' }, RINGS + i * RING_GAP);
        const lw = (lay.ringW * [1, 1.75, 2.6][i] * 1.1) / 256;
        tl.fromTo(lights[i], { scaleX: lw * 0.3, scaleY: lw * 0.3 * FLAT }, { scaleX: lw, scaleY: lw * FLAT, duration: RING_S, ease: 'power2.out' }, RINGS + i * RING_GAP)
          .fromTo(lights[i], { alpha: 0 }, { keyframes: [{ alpha: [0.5, 0.4, 0.3][i], duration: 0.35 }, { alpha: [0.2, 0.14, 0.1][i], duration: RING_S - 0.35 }], ease: 'sine.out' }, RINGS + i * RING_GAP);
      });
      tl.to({}, { duration: 0.01 }, END);
      cur = tl;
      return tl;
    },
  };
  apply();
  return {
    beat(id) { return beats[id](); },
    /// One frame (ms since the last): the clock on, at the piece's own pace, and the picture where it says.
    step(ms = 16) {
      if (dead) return;
      clock.tick(Math.min(0.1, ms / 1000) / tempo);
      fit();
      apply();
    },
    /// Where the world stands (for the page's checks and a test): her, the cloud, the landing.
    get sky() { return sky; },
    destroy() {
      bag.killAll();
      clock.killAll();
      dead = true;
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
