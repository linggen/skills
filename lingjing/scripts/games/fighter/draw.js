// fighter/draw.js — 格斗's picture: ink-and-wash shadow-puppets (皮影) on a paper stage, drawn on one canvas. Procedural
// on purpose (v2, Hanli 10-27: 「需要美观和优化 … 美化一下应该可以玩」): every frame of a fighter is the same shapes on
// one skeleton — tapered limbs, a robe skirt that sways with the body's speed, wide sleeves that sag, boots, a profile
// head with its hair — so a pose is a handful of angles (POSES), eased into from the last, and every frame matches.
// A level dresses its fighters by data (`me.look`, `foe.look`: ink, robe, trousers, sash, hair, weapon) and its stage
// (`stage.look`). Game feel lives here too: the sword-qi trail, ink-splash sparks, dust, screen shake, the 绝's cut-in,
// the crowd bobbing on a big blow, and the KO's vignette. Nothing here plays: it reads a state.

import { loopAt } from '../jieyin/flight.js';
import { QI } from './core.js';

const W = 960, H = 540, FLOOR = 432;
/* The painted fighters stand ~245 units tall (KOF scale: near half the field); the core counts heights for ~190: what it
   places at a height (a spark, a shot) is drawn that much higher. Her ice flies at the head of a man standing. */
const FY = 1.3, FY_ICE = 1.85;
/* The bout ended his way (core.js endWon: `end.won`, an old `out` always his). */
const won = (e) => Boolean(e && (e.won ?? e.kind === 'out'));
export const FIELD = { w: W, h: H, floor: FLOOR };
/* A wider screen (a phone on its side, ~2.16:1; Hanli 11-03: 「手机上的游戏画面能再宽点, 两边目前黑的比较多」): the canvas
   takes the box's own shape, never stretched — its height is the field's H, and what is wider than W is more of the world
   at each side (EDGE logical px each): the paper, the hills, the ground and the crowd reach it; the boards, where the
   two can walk, stay STAGE's (the edge, the slick and the corner keep their distances), and the bars and words stay
   centred over them. `fieldOf(w, h)` → { k, edge } for a canvas w × h px. */
export const WIDE_MAX = 2.4; // the widest a field is drawn (w : h); past it, bands
export function fieldOf(w, h) {
  const k = Math.min(h / H, w / W), vw = Math.min(w / k, H * WIDE_MAX);
  // A field taller than 16:9 (a narrow or upright page, 11-05: the field had been a 190 px strip under its keys): the
  // world at the field's width, set down so the boards run on below it — a little more sky above (TOP_SHARE of the
  // spare height), the rest boards, where the keys lie clear of the fighters.
  const top = Math.max(0, (h - H * k) * TOP_SHARE);
  return { k, edge: Math.max(0, (vw - W) / 2), left: Math.max(0, (w / k - vw) / 2), top };
}
export const TOP_SHARE = 0.35;
let EDGE = 0; // this frame's (painter)
const SERIF = '"Songti SC","STSong","Noto Serif SC",serif';

/* The skeleton (units): thigh, shin, torso, neck, head radius, upper arm, forearm. */
const BONE = { thigh: 47, shin: 47, torso: 62, neck: 9, head: 15, upper: 34, fore: 32 };

/* Poses: lean (torso, degrees forward), head tilt, and each limb as [upper, lower] — angles from straight down,
   positive toward the way it faces. `drop` lowers the hips (a crouch, a sit); `rot` turns the whole body (a fall). */
const P = (lean, legF, legB, armF, armB, o = {}) => ({ lean, legF, legB, armF, armB, head: o.head ?? 0, drop: o.drop ?? 0, rot: o.rot ?? 0 });
export const POSES = {
  idle: P(4, [20, 4], [-16, -6], [40, 96], [24, 78]),
  walkA: P(7, [32, 8], [-28, -14], [34, 86], [28, 70]),
  walkB: P(7, [-8, -20], [12, 2], [44, 100], [16, 62]),
  air: P(10, [74, 14], [28, -44], [44, 116], [10, 64], { drop: -6 }),
  crouch: P(30, [76, -6], [26, -76], [50, 110], [30, 96]), // low and leaning in, the back knee near the boards: her ice flies over
  lkick: P(-8, [84, 88], [-14, -6], [40, 92], [8, 60]),
  hpunch: P(24, [42, 10], [-32, -14], [92, 92], [-24, 16]),
  hpunchUp: P(-8, [26, 6], [-22, -8], [10, 40], [34, 70]),
  blow: P(20, [46, 10], [-38, -16], [88, 72], [84, 76]),
  light: P(14, [24, 6], [-22, -8], [88, 90], [16, 62]),
  lightUp: P(10, [22, 6], [-18, -8], [44, 64], [20, 70]),
  heavy: P(-16, [84, 94], [44, -44], [46, 70], [-40, -12]), // 勾: low along the boards, the back knee bent
  heavyUp: P(-6, [50, 10], [30, -36], [36, 82], [10, 52]),
  airKick: P(-6, [92, 96], [10, -40], [60, 90], [-30, 20], { drop: 0 }),
  rise: P(-10, [40, 0], [-30, -30], [150, 170], [-20, 10], { drop: 0, head: -10 }),
  riseUp: P(16, [60, -10], [0, -50], [60, 30], [20, 40], { drop: 30 }),
  block: P(-6, [16, 2], [-24, -10], [64, 162], [48, 152], { head: -6 }),
  crouchBlock: P(24, [76, -6], [26, -76], [74, 160], [58, 150], { head: -4 }),
  parry: P(10, [30, 8], [-26, -10], [110, 70], [40, 120], { head: 4 }),
  hit: P(-22, [14, 0], [-30, -16], [-20, 10], [-46, -14], { head: -18 }),
  down: P(-16, [86, 70], [70, 60], [-30, -20], [-50, -40], { drop: 50, head: -10 }),
  knock: P(0, [10, 0], [-6, 0], [150, 160], [-150, -160], { rot: -88, drop: 0 }),
  cast: P(12, [28, 6], [-22, -8], [84, 86], [-30, 0]),
  palmfire: P(16, [36, 10], [-30, -14], [88, 92], [80, 92], { drop: 10 }),
  super: P(-8, [40, 10], [-40, -10], [120, 150], [-120, -150], { drop: 14, head: -8 }),
  ying: P(36, [46, 10], [-42, -20], [66, 72], [40, 92], { drop: 12 }),
  roll: P(60, [100, -30], [60, -80], [80, 150], [60, 140], { drop: 58, head: 20 }),
  dash: P(30, [60, 10], [-50, -30], [70, 100], [-40, -10], { drop: 8 }),
  // hers
  guard: P(4, [18, 4], [-18, -8], [52, 80], [12, 22]),
  pokeUp: P(-4, [18, 4], [-22, -8], [20, 4], [12, 22]),
  poke: P(16, [32, 8], [-26, -10], [88, 90], [8, 18]),
  thrustUp: P(-12, [32, 30], [-32, -20], [2, -26], [16, 28], { drop: 16 }),
  thrust: P(32, [54, 12], [-46, -20], [90, 90], [-10, 10], { drop: 10 }),
  jianqiUp: P(-16, [40, 30], [-30, -30], [-60, -100], [20, 40], { drop: 18 }),
  jianqi: P(30, [70, 40], [-50, -30], [100, 110], [-30, -10], { drop: 34 }),
  ice: P(2, [18, 4], [-18, -8], [46, 74], [98, 152]),
  edge: P(8, [22, 6], [-22, -8], [90, 92], [10, 22]),
  glow: P(6, [20, 4], [-20, -8], [-36, -16], [64, 106]),
  hold: P(-18, [24, 10], [-12, -28], [-32, -12], [58, 98], { drop: 12, head: -8 }),
  strike: P(20, [30, 6], [-26, -10], [-22, -6], [90, 92]),
  sblock: P(-4, [16, 4], [-24, -10], [46, 126], [10, 22]),
  slip: P(-48, [72, 76], [32, 10], [-62, -92], [100, 142], { head: -20 }),
  stand: P(0, [10, 0], [-10, 0], [22, 12], [12, 8]),
};

const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, k) => a + (b - a) * k;
const lerpPose = (a, b, k) => ({
  lean: lerp(a.lean, b.lean, k), head: lerp(a.head, b.head, k), drop: lerp(a.drop, b.drop, k), rot: lerp(a.rot ?? 0, b.rot ?? 0, k),
  legF: [lerp(a.legF[0], b.legF[0], k), lerp(a.legF[1], b.legF[1], k)], legB: [lerp(a.legB[0], b.legB[0], k), lerp(a.legB[1], b.legB[1], k)],
  armF: [lerp(a.armF[0], b.armF[0], k), lerp(a.armF[1], b.armF[1], k)], armB: [lerp(a.armB[0], b.armB[0], k), lerp(a.armB[1], b.armB[1], k)],
});

/* What pose a body takes this instant, from the state. */
function mePose(s) {
  const me = s.me, t = s.t;
  if (s.end?.kind === 'down' || me.down > t) return 'knock';
  if (me.stun > t && !me.guard) return 'hit';
  const a = me.act;
  if (a?.k === 'ying') return 'ying';
  if (a?.k === 'roll') return 'roll';
  if (a?.k === 'dash') return 'dash';
  if (a?.k === 'backstep') return 'air';
  if (a) {
    const e = t - a.at, m = a.m, up = e < m.startup;
    if (a.k === 'special') return 'cast';
    if (a.k === 'palmfire' || a.k === 'palmfireH') return up ? 'cast' : 'palmfire';
    if (a.k === 'lkick') return up ? 'heavyUp' : e < m.startup + m.active + 60 ? 'lkick' : 'heavyUp';
    if (a.k === 'hpunch') return up ? 'hpunchUp' : e < m.startup + m.active + 100 ? 'hpunch' : 'lightUp';
    if (a.k === 'blow') return up ? 'hpunchUp' : 'blow';
    if (a.k === 'super') return 'super';
    if (a.k === 'air') return up ? 'air' : 'airKick';
    if (a.k === 'rise') return up ? 'riseUp' : 'rise';
    if (a.k === 'light') return me.crouch ? 'crouch' : up ? 'lightUp' : e < m.startup + m.active + 60 ? 'light' : 'lightUp';
    if (a.k === 'heavy') return up ? 'heavyUp' : e < m.startup + m.active + 120 ? 'heavy' : 'heavyUp';
  }
  if (me.air) return 'air';
  if (me.crouch) return me.guard ? 'crouchBlock' : 'crouch';
  if (me.guard) return 'block';
  if (Math.abs(me.vx) > 20) return (Math.floor(t / 170) % 2) ? 'walkA' : 'walkB';
  return 'idle';
}
function foePose(s) {
  const foe = s.foe, t = s.t;
  if (s.end?.kind === 'out') return foe.x < (s.R.stage.left - 4) || foe.x > (s.R.stage.right + 4) ? 'stand' : 'slip';
  if (s.palm) return { glow: 'glow', hold: 'hold', strike: 'strike', after: 'strike', done: 'guard' }[s.palm.phase] ?? 'glow';
  if (s.edge) return 'edge';
  if (foe.stun > t) return 'hit';
  const a = foe.act;
  if (a) {
    const e = t - a.at, m = a.m;
    if (a.k === 'block') return 'sblock';
    if (a.k === 'ice') return 'ice';
    if (a.k === 'poke') return e < m.startup ? 'pokeUp' : e < m.startup + m.active + 80 ? 'poke' : 'guard';
    if (a.k === 'thrust') return e < m.startup ? 'thrustUp' : e < m.startup + m.active + 160 ? 'thrust' : 'guard';
    if (a.k === 'jianqi') return e < m.startup ? 'jianqiUp' : e < m.startup + m.active + 200 ? 'jianqi' : 'guard';
  }
  if (Math.abs(foe.vx) > 20 && foe.stun <= t) return (Math.floor(t / 200) % 2) ? 'walkA' : 'walkB';
  return 'guard';
}

/* ── Paper, hills, the temple: painted once a size, each on its own layer (they slide apart a little: parallax). ── */
function layer(w, h, paint) {
  const c = globalThis.document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'));
  return c;
}
function ridge(ctx, y0, amp, f1, f2, ph, color, w = W + 2 * EDGE + 120) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y0 - amp * Math.sin(x / f1 + ph) - amp * 0.5 * Math.sin(x / f2 + ph * 2));
  ctx.lineTo(w, H); ctx.closePath(); ctx.fill();
}
function paintSky(ctx, look = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, look.sky ?? '#f3ecd9'); g.addColorStop(0.62, look.paper ?? '#e9dcc0'); g.addColorStop(1, '#d9c9a6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W + 2 * EDGE, H);
  // a pale sun behind the haze
  const s = ctx.createRadialGradient(EDGE + 720, 120, 4, EDGE + 720, 120, 80);
  s.addColorStop(0, 'rgba(255,248,230,.9)'); s.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = s; ctx.fillRect(EDGE + 600, 20, 240, 220);
}
function paintFar(ctx) { ridge(ctx, 250, 46, 140, 57, 0.4, 'rgba(70,72,66,.13)'); ridge(ctx, 286, 30, 100, 41, 2.1, 'rgba(60,60,54,.16)'); }
function paintNear(ctx) {
  ridge(ctx, 330, 22, 80, 31, 1.2, 'rgba(48,46,40,.20)');
  // the temple's roofline (沉鼎观) and a pine, where they stand over the boards
  ctx.translate(EDGE, 0);
  ctx.fillStyle = 'rgba(32,30,26,.26)';
  ctx.beginPath(); ctx.moveTo(560, 300); ctx.quadraticCurveTo(660, 270, 760, 300); ctx.lineTo(740, 288); ctx.lineTo(580, 288); ctx.fill();
  ctx.fillRect(600, 300, 120, 54);
  ctx.beginPath(); ctx.moveTo(596, 300); ctx.lineTo(724, 300); ctx.lineTo(716, 308); ctx.lineTo(604, 308); ctx.fill();
  ctx.strokeStyle = 'rgba(30,28,24,.3)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(130, 360); ctx.quadraticCurveTo(140, 300, 120, 240); ctx.stroke();
  ctx.fillStyle = 'rgba(30,40,30,.22)';
  for (const [x, y, r] of [[100, 250, 34], [150, 268, 28], [118, 222, 26], [160, 236, 22]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, -0.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.translate(-EDGE, 0);
}
function paintStage(ctx, st) {
  const L = st.left, R = st.right, look = st.look ?? {};
  // frozen ground off the boards
  const g = ctx.createLinearGradient(0, FLOOR + 40, 0, H);
  g.addColorStop(0, 'rgba(92,84,68,.34)'); g.addColorStop(1, 'rgba(60,54,44,.5)');
  ctx.fillStyle = g; ctx.fillRect(0, FLOOR + 40, W + 2 * EDGE, H - FLOOR - 40);
  ctx.translate(EDGE, 0); // the boards stand where the rules have them
  // the boards: a slab of 青石, its top lit, its front in shade, joints and a worn edge
  ctx.fillStyle = look.top ?? '#9aa19a';
  ctx.beginPath(); ctx.moveTo(L - 8, FLOOR); ctx.lineTo(R + 8, FLOOR); ctx.lineTo(R + 2, FLOOR + 12); ctx.lineTo(L - 2, FLOOR + 12); ctx.fill();
  const f = ctx.createLinearGradient(0, FLOOR + 12, 0, FLOOR + 64);
  f.addColorStop(0, look.face ?? '#646a64'); f.addColorStop(1, '#3f433f');
  ctx.fillStyle = f; ctx.fillRect(L - 2, FLOOR + 12, R - L + 4, 52);
  ctx.strokeStyle = 'rgba(20,20,18,.6)'; ctx.lineWidth = 2;
  ctx.strokeRect(L - 2, FLOOR + 12, R - L + 4, 52);
  ctx.strokeStyle = 'rgba(20,20,18,.28)'; ctx.lineWidth = 1;
  for (let x = L + 62; x < R; x += 84) { ctx.beginPath(); ctx.moveTo(x, FLOOR + 12); ctx.lineTo(x + 3, FLOOR + 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 30, FLOOR + 1); ctx.lineTo(x - 22, FLOOR + 11); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(L - 8, FLOOR + 0.5); ctx.lineTo(R + 8, FLOOR + 0.5); ctx.stroke();
  // the slick (那摊红油), its sheen, pepper grains stuck in it
  if (st.oil) {
    const a = st.oil.from, b = st.oil.to, cx = (a + b) / 2;
    ctx.fillStyle = look.oil ?? 'rgba(168,44,32,.66)';
    ctx.beginPath(); ctx.ellipse(cx, FLOOR + 5, (b - a) / 2, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,160,.35)'; ctx.beginPath(); ctx.ellipse(cx - 12, FLOOR + 3, (b - a) / 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(30,10,6,.75)';
    for (let i = 0; i < 11; i += 1) { ctx.beginPath(); ctx.arc(a + 10 + ((i * 37) % (b - a - 16)), FLOOR + 3 + (i % 3) * 2, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.translate(-EDGE, 0);
}

/* The banners on their poles behind the boards: 大比 · 沉鼎, swaying. */
function banners(ctx, t, look = {}) {
  if (look.banners === false) return; // the cliff: no 大比 banners
  for (const [x, word, color] of [[260, look.bannerA ?? '大比', '#8e2b22'], [820, look.bannerB ?? '沉鼎', '#2f3a40']]) {
    ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x, 170); ctx.stroke();
    ctx.fillStyle = '#b8925a'; ctx.beginPath(); ctx.arc(x, 166, 5, 0, Math.PI * 2); ctx.fill();
    const sw = Math.sin(t / 700 + x) * 6;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x + 2, 178); ctx.lineTo(x + 40, 178);
    ctx.quadraticCurveTo(x + 44 + sw, 250, x + 40 + sw * 1.4, 318); ctx.lineTo(x + 28 + sw * 1.4, 306); ctx.lineTo(x + 16 + sw * 1.4, 320);
    ctx.quadraticCurveTo(x + 4 + sw, 250, x + 2, 178); ctx.fill();
    ctx.fillStyle = 'rgba(232,206,150,.92)'; ctx.font = `700 22px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [...word].forEach((ch, i) => ctx.fillText(ch, x + 21 + sw * (0.4 + i * 0.3), 212 + i * 34));
  }
}

/* The crowd below the boards' front: heads and shoulders, bobbing; a big blow lifts them. */
function crowd(ctx, t, lift) {
  for (let i = 0, x = 4 - EDGE; x < W + EDGE; i += 1, x += 22) {
    const row = i % 2, y = FLOOR + 82 + row * 10 + ((x * 7) % 9) - Math.max(0, Math.sin(t / 260 + i * 1.7)) * (1 + lift * 7);
    ctx.fillStyle = row ? 'rgba(20,18,16,.62)' : 'rgba(34,30,26,.5)';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 14, y + 44); ctx.quadraticCurveTo(x - 13, y + 8, x, y + 8); ctx.quadraticCurveTo(x + 13, y + 8, x + 14, y + 44); ctx.fill();
    if (lift > 0.4 && i % 5 === 0) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 8, y + 14); ctx.lineTo(x + 14, y - 16 * lift); ctx.stroke(); }
  }
}

/* ── A body ── */
/* A tapered bone from (x1,y1) to (x2,y2): widths w1 → w2, round at both ends. */
function bone(ctx, x1, y1, x2, y2, w1, w2) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  ctx.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
  ctx.arc(x2, y2, w2 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI);
  ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
  ctx.arc(x1, y1, w1 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI);
  ctx.closePath();
  ctx.fill();
}
const joint = (x, y, a, l) => [x + Math.sin(a) * l, y + Math.cos(a) * l];

/* A leg: trouser bone, shin, a boot pointing forward. Answers the knee. */
function leg(ctx, x, y, p, cTrousers, cBoot) {
  const [kx, ky] = joint(x, y, rad(p[0]), BONE.thigh), [fx, fy] = joint(kx, ky, rad(p[1]), BONE.shin);
  ctx.fillStyle = cTrousers;
  bone(ctx, x, y, kx, ky, 17, 13);
  bone(ctx, kx, ky, fx, fy, 13, 10);
  ctx.fillStyle = cBoot;
  ctx.beginPath(); ctx.ellipse(fx + 6, fy + 2, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  return { kx, ky, fx, fy };
}
/* An arm in a wide sleeve: the upper arm, the forearm, and the sleeve's mouth sagging below the wrist. */
function arm(ctx, x, y, p, cSleeve, cEdge, cHand, sag) {
  const a1 = rad(p[0]), a2 = rad(p[1]);
  const [ex, ey] = joint(x, y, a1, BONE.upper), [hx, hy] = joint(ex, ey, a2, BONE.fore);
  ctx.fillStyle = cSleeve;
  bone(ctx, x, y, ex, ey, 15, 13);
  bone(ctx, ex, ey, hx - Math.sin(a2) * 6, hy - Math.cos(a2) * 6, 13, 19);
  // the sleeve's mouth hangs down from the wrist, swaying
  const mx = hx - Math.sin(a2) * 8, my = hy - Math.cos(a2) * 8;
  ctx.beginPath(); ctx.moveTo(mx - 9, my - 2); ctx.quadraticCurveTo(mx - 6 + sag, my + 18, mx + 4 + sag * 1.4, my + 22); ctx.lineTo(mx + 9, my + 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = cEdge; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx - 9, my - 2); ctx.quadraticCurveTo(mx - 6 + sag, my + 18, mx + 4 + sag * 1.4, my + 22); ctx.stroke();
  ctx.fillStyle = cHand;
  ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill();
  return { ex, ey, hx, hy };
}

/* One fighter at (x, feet y), facing `face`, in pose `p`, dressed by `look`. Answers where its sword tip is. */
function figure(ctx, x, y, face, p, look, extra = {}) {
  const ink = look.ink ?? '#1c1a16', robe = look.robe ?? '#5b4f42', edge = look.edge ?? '#8a7a66', trousers = look.trousers ?? '#2a2622';
  const far = look.far ?? '#3a342c', boot = look.boot ?? '#141210', skin = look.skin ?? ink, sway = extra.sway ?? 0, t = extra.t ?? 0;
  if (!extra.noShadow) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x, y + (extra.floorAt ?? 0), 38 - Math.min(18, (extra.floorAt ?? 0) / 7), 6, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  if (p.rot) { ctx.translate(0, -16); ctx.rotate(rad(p.rot)); }
  const legH = (a) => BONE.thigh * Math.cos(rad(a[0])) + BONE.shin * Math.cos(rad(a[1]));
  const breath = extra.breath ?? 0;
  // the feet stay on the boards: the legs' own bend sets the hips (a crouch is in its angles); only a lift (drop < 0) raises them
  const hip = Math.max(legH(p.legF), legH(p.legB), 30) - Math.min(0, p.drop), hy = -hip + breath;
  const lean = rad(p.lean);
  const sx = Math.sin(lean) * BONE.torso, sy = hy - Math.cos(lean) * BONE.torso;
  // far side first, darker (a 皮影's back pieces)
  const lb = leg(ctx, -2, hy, p.legB, far, boot);
  arm(ctx, sx * 0.9 - 3, sy + 6, p.armB, far, 'rgba(0,0,0,.3)', far, -sway * 0.6);
  // the robe's skirt: waist to below the knees, flaring, swinging with the body's speed
  const lf = { kx: Math.sin(rad(p.legF[0])) * BONE.thigh, ky: hy + Math.cos(rad(p.legF[0])) * BONE.thigh };
  const hemY = Math.max(lf.ky, lb.ky) + (look.long ?? 22), front = Math.max(lf.kx, lb.kx) + 14, back = Math.min(lf.kx, lb.kx) - 14;
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-14, hy - 4);
  ctx.quadraticCurveTo(front * 0.6 + 6, hy + 10, front + sway * 0.5, hemY - 4);
  ctx.quadraticCurveTo((front + back) / 2 + sway, hemY + 8 + Math.sin(t / 300) * 1.5, back + sway * 1.3, hemY);
  ctx.quadraticCurveTo(back * 0.6 - 4, hy + 10, 14, hy - 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5;
  for (const k of [0.3, 0.62]) { ctx.beginPath(); ctx.moveTo(lerp(-6, 6, k), hy + 2); ctx.quadraticCurveTo(lerp(back, front, k) + sway * 0.6, hemY - 18, lerp(back, front, k) + sway, hemY); ctx.stroke(); }
  // front leg below the robe
  leg(ctx, 2, hy, p.legF, trousers, boot);
  // torso: the robe's top, the collar crossed, the sash
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-13, hy + 2); ctx.lineTo(13, hy + 2);
  ctx.lineTo(sx + Math.cos(lean) * 17, sy + Math.sin(lean) * 17 + 4);
  ctx.quadraticCurveTo(sx, sy - 6, sx - Math.cos(lean) * 17, sy - Math.sin(lean) * 17 + 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = look.collar ?? '#efe6d2'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx - Math.cos(lean) * 6, sy + 2); ctx.lineTo(sx * 0.55 + 4, (sy + hy) * 0.5); ctx.lineTo(sx + Math.cos(lean) * 7, sy + 3); ctx.stroke();
  ctx.fillStyle = look.sash ?? '#2b2520';
  ctx.beginPath(); ctx.moveTo(-14, hy - 10); ctx.lineTo(14 + Math.sin(lean) * 4, hy - 12); ctx.lineTo(14, hy - 2); ctx.lineTo(-14, hy); ctx.fill();
  ctx.strokeStyle = look.sash ?? '#2b2520'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, hy - 6); ctx.quadraticCurveTo(-26 - sway * 0.4, hy + 6, -34 - sway * 1.2, hy + 26 + Math.sin(t / 240) * 2); ctx.stroke();
  // head: a profile in ink, its hair
  const hd = rad(p.lean + p.head);
  const hx = sx + Math.sin(hd) * (BONE.neck + BONE.head), hyy = sy - Math.cos(hd) * (BONE.neck + BONE.head);
  ctx.fillStyle = skin;
  bone(ctx, sx, sy, hx, hyy, 9, 9);
  ctx.beginPath(); ctx.ellipse(hx, hyy, BONE.head * 0.86, BONE.head, hd, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx + 11, hyy - 3); ctx.lineTo(hx + 16, hyy + 2); ctx.lineTo(hx + 11, hyy + 4); ctx.fill(); // the nose
  ctx.fillStyle = look.hairColor ?? '#0e0d0b';
  ctx.beginPath(); ctx.ellipse(hx - 3, hyy - 5, BONE.head * 0.9, BONE.head * 0.75, hd - 0.3, Math.PI, Math.PI * 2.1); ctx.fill();
  if (look.hair === 'bun') {
    ctx.beginPath(); ctx.arc(hx - 7, hyy - 16, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = look.pin ?? '#8a6a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 17, hyy - 18); ctx.lineTo(hx + 2, hyy - 14); ctx.stroke();
  }
  if (look.hair === 'tail') {
    ctx.strokeStyle = look.hairColor ?? '#0e0d0b'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - 9, hyy - 9); ctx.quadraticCurveTo(hx - 34 - sway, hyy - 6 + Math.sin(t / 260) * 4, hx - 40 - sway * 1.6, hyy + 30); ctx.stroke();
    if (look.ribbon) { ctx.strokeStyle = look.ribbon; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 10, hyy - 10); ctx.quadraticCurveTo(hx - 26 - sway, hyy - 18, hx - 32 - sway * 1.5 + Math.sin(t / 200) * 5, hyy - 4); ctx.stroke(); }
  }
  // the front arm in its sleeve, and what it holds
  const af = arm(ctx, sx + 2, sy + 5, p.armF, robe, edge, skin, -sway * 0.8);
  let tip = null;
  if (look.weapon === 'sword' && !extra.noSword) {
    const a = rad(p.armF[1]), len = 100;
    const tx = af.hx + Math.sin(a) * len, ty = af.hy + Math.cos(a) * len;
    ctx.strokeStyle = look.blade ?? '#dfe4e6'; ctx.lineWidth = 3.6; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(af.hx, af.hy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,20,20,.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = '#b8925a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(af.hx - Math.cos(a) * 8, af.hy + Math.sin(a) * 8); ctx.lineTo(af.hx + Math.cos(a) * 8, af.hy - Math.sin(a) * 8); ctx.stroke();
    if (extra.qi) { ctx.strokeStyle = `rgba(90,200,155,${extra.qi})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.sin(a) * 90, ty + Math.cos(a) * 90); ctx.stroke(); }
    // the tip in the field's own units, for the trail
    const m = ctx.getTransform(), inv = extra.inv;
    if (inv) { const px = m.a * tx + m.c * ty + m.e, py = m.b * tx + m.d * ty + m.f; tip = { x: inv.a * px + inv.c * py + inv.e, y: inv.b * px + inv.d * py + inv.f }; }
  }
  if (look.weapon === 'sword' && extra.scabbard) {
    const ab = joint(...joint(sx * 0.9 - 3, sy + 6, rad(p.armB[0]), BONE.upper), rad(p.armB[1]), BONE.fore), a = rad(p.armB[1]);
    ctx.strokeStyle = look.scabbard ?? '#4a3826'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ab[0] - Math.sin(a) * 12, ab[1] - Math.cos(a) * 12); ctx.lineTo(ab[0] + Math.sin(a) * 62, ab[1] + Math.cos(a) * 62); ctx.stroke();
  }
  // the green palm (her back hand)
  if (extra.glow) {
    const [gx, gy] = joint(...joint(sx * 0.9 - 3, sy + 6, rad(p.armB[0]), BONE.upper), rad(p.armB[1]), BONE.fore), r = 24 + 32 * extra.glow;
    const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, r);
    g.addColorStop(0, `rgba(190,255,220,${0.95 * extra.glow})`); g.addColorStop(0.4, `rgba(80,200,150,${0.6 * extra.glow})`); g.addColorStop(1, 'rgba(80,200,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
  }
  if (extra.fire) {
    const g = ctx.createRadialGradient(af.hx, af.hy, 1, af.hx, af.hy, 24 * extra.fire);
    g.addColorStop(0, 'rgba(255,226,130,.95)'); g.addColorStop(1, 'rgba(220,70,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(af.hx, af.hy, 24 * extra.fire, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return tip;
}


/* ── The painted frames (Hanli 10-27: the rig 「像纸片人」 → frame by frame, as KOF '97 is made): every pose of a fighter
   painted by hand (tools/fighter-frames.py → art/games/fighter/<who>.webp, one sheet, + .json: each frame's rect and
   its anchor — the standing feet — and the clips). A state picks a clip; a clip plays its frames at its fps on the
   bout's clock (s.t), so a hit-stop holds the picture too; a blow's frames are laid on the move's own startup · active ·
   recover, its strike frame (`hit`) exactly while the blow can land. Mirrored by facing. Reduced motion plays only a
   clip's `calm` frames and never crossfades. ── */

/** A loaded sheet: the picture and its frames, `u` units a sheet pixel (the standing figure `height` units tall). */
export function makeSheet(meta, img, height = 245) {
  return { meta, img, u: height / meta.stand };
}

/** Which frame of a clip shows `e` ms into it. With a move (`m`: startup · active · recover) and a strike frame, the
    frames before it share the startup, the strike holds through the active part, the rest share the recovery. */
export function frameOf(clip, e, m = null, calm = false) {
  const F = clip.frames, n = F.length;
  let i;
  if (m && clip.hit != null) {
    const act = (m.active ?? 0) + 60;
    if (e < m.startup) i = Math.min(clip.hit - 1, Math.floor((e / m.startup) * clip.hit));
    else if (e < m.startup + act) i = clip.hit;
    else i = Math.min(n - 1, clip.hit + 1 + Math.floor(((e - m.startup - act) / Math.max(1, m.recover)) * (n - clip.hit - 1)));
    i = Math.max(0, i);
  } else {
    const k = Math.floor((Math.max(0, e) * (clip.fps ?? 8)) / 1000);
    i = clip.loop ? k % n : Math.min(n - 1, k);
  }
  if (!calm || !clip.calm?.length || clip.calm.includes(F[i])) return F[i];
  // reduced motion: the last calm frame at or before this one
  let pick = clip.calm[0];
  for (const c of clip.calm) if (F.indexOf(c) <= i) pick = c;
  return pick;
}

const CROUCHED = { light: 'clight', lkick: 'clkick', hpunch: 'chpunch', heavy: 'cheavy' };
/* His clip now: [clip, start (ms on the bout's clock, or null: since the clip began), the move]. */
function meClip(s) {
  const me = s.me, t = s.t, a = me.act;
  if (s.end?.kind === 'outlast') return ['idle', 0]; // he stood through it; her point rests at his heart
  if (s.end) return won(s.end) ? ['win', s.end.at] : ['lose', s.end.at];
  // the hero's stance before the first exchange (Hanli 11-01: 「主角光环还是要有」): his 抱拳 as the bout opens
  if (t < Math.max(700, s.intro ?? 0) && !a && !me.air && Math.abs(me.vx) < 20 && me.stun <= t) return ['win', 0];
  if (me.down > t) return ['knock', null];
  if (me.stun > t && !me.guard) return ['hit', null];
  if (a) {
    if (a.k === 'roll') return ['roll', a.at];
    if (a.k === 'throw') return ['blow', a.at, a.m]; // his throw: the 双推掌's hands on her
    if (a.k === 'max') return ['super', a.at, { startup: 0, active: 200, recover: 60 }]; // 爆气: the 绝's gathering
    if (['clight', 'clkick', 'chpunch', 'cheavy'].includes(a.k)) return [a.k, a.at, a.m];
    if (a.k === 'ying' || a.k === 'dash') return ['dash', a.at];
    if (a.k === 'backstep') return ['back', a.at];
    if (['special', 'palmfire', 'palmfireH', 'feijian', 'fuwen'].includes(a.k)) return ['cast', a.at, a.m];
    if (CROUCHED[a.k]) return [me.crouch ? CROUCHED[a.k] : a.k, a.at, a.m];
    if (['blow', 'super', 'air', 'rise'].includes(a.k)) return [a.k, a.at, a.m];
  }
  if (me.air) return ['jump', me.jumpAt ?? t];
  if (me.running) return ['dash', null];
  if (me.crouch) return [me.guard ? 'cblock' : 'crouch', null];
  if (me.guard) return ['block', null];
  if (Math.abs(me.vx) > 20) return [Math.sign(me.vx) === me.face ? 'walk' : 'back', 0];
  return ['idle', 0];
}
/* Hers. KOF's new states (v7) by name — `jump` · `air` · `sweep` · `aa` · `throw` · `roll` · `knock` · `run` ·
   `lowblock` · `land` — each shown on the sheet's own clip if it has one (小满's, for 心魔), else on the one that reads
   as it (FOE_AS: the robed foes' sheets have no jump or fall painted). */
function foeClip(s) {
  const foe = s.foe, t = s.t, a = foe.act;
  if (s.end?.kind === 'out') return [foe.x < s.R.stage.left - 4 || foe.x > s.R.stage.right + 4 ? 'lose' : 'slip', s.end.at];
  if (s.end) return [won(s.end) ? 'lose' : 'win', s.end.at]; // she yields (切磋) or stands over him
  if (s.palm) return [{ glow: 'glow', hold: 'hold', strike: 'strike', after: 'strike' }[s.palm.phase] ?? 'idle', null];
  if (s.edge) return ['edge', null];
  if (foe.down > t) return ['knock', null];
  if (s.grab) return ['throw', s.grab.at, { startup: 0, active: 1e9, recover: 0 }];
  if (foe.air) return a?.swung ? ['air', a.swung, { startup: 0, active: 1e9, recover: 0 }] : ['jump', a?.at ?? null];
  if (foe.stun > t) return ['hit', null];
  if (a) {
    if (a.k === 'block') return [a.low ? 'lowblock' : 'block', a.at];
    if (a.k === 'roll') return ['roll', a.at];
    if (a.k === 'land') return ['land', a.at];
    if (['ice', 'poke', 'thrust', 'jianqi', 'feijian', 'sweep', 'aa', 'throw'].includes(a.k)) return [a.k, a.at, a.m];
  }
  if (foe.run > t) return ['run', 0];
  if (Math.abs(foe.vx) > 20) return [Math.sign(foe.vx) === foe.face ? 'walk' : 'back', 0];
  return ['idle', 0];
}
/* A robed foe's sheet (no jump, fall, crouch painted): the clip that reads as each new state. */
const FOE_LAID = {
  sweep: { frames: ['jianqi2', 'jianqi1', 'thrust4'], hit: 1, fps: 8 },
  aa: { frames: ['poke1', 'jianqi2', 'poke3'], hit: 1, fps: 8 },
};
const FOE_AS = { jump: 'poke', air: 'thrust', sweep: 'jianqi', aa: 'poke', throw: 'strike', roll: 'back', knock: 'slip', run: 'walk', lowblock: 'block', land: 'idle' };

/* The frame a fighter shows: its clip, how far in, its frame; `track` remembers when a clip with no clock of its own
   began (a hit, a crouch, a fall). A fall's frames go by what is left of it: thrown, down, getting up. */
function pick(sheet, who, s, track, calm) {
  const [said, at, m] = who === 'me' ? meClip(s) : foeClip(s);
  // a foe on another fighter's sheet (心魔 on 小满's) names its clips by its own moves: `foe.look.clips` maps them
  const clips = sheet.meta.clips;
  let name = (who === 'foe' && s.level?.foe?.look?.clips?.[said]) || said;
  // a robed sheet: a clip laid from its own frames (FOE_LAID — the sword raised then cut low for the sweep, raised
  // high for the rising cut), else the clip that reads as it
  const laid = !clips[name] && who === 'foe' && FOE_LAID[said]?.frames.every((f) => sheet.meta.frames[f]) ? FOE_LAID[said] : null;
  if (laid) name = `laid:${said}`;
  else if (!clips[name] && who === 'foe' && FOE_AS[said]) name = FOE_AS[said];
  const clip = laid ?? clips[name] ?? (said === 'feijian' ? clips.ice : null) ?? clips.idle;
  if (track.name !== name) { track.name = name; track.at = s.t; }
  const e = s.t - (at ?? track.at);
  const body = who === 'me' ? s.me : s.foe;
  // a fall's frames by what is left of it, a jump's by its rise and fall — on a sheet that has them painted
  if (name === 'knock' && clip.frames.length >= 3) {
    const [thrown, down, up] = clip.frames;
    return { clip, name, frame: body.down - s.t < 260 ? up : e < 220 && !calm ? thrown : down, e };
  }
  if (name === 'jump' && clip.frames.length >= 3) {
    const [spring, rise, fall] = clip.frames;
    return { clip, name, frame: calm ? rise : e < 70 ? spring : body.vy > -250 ? rise : fall, e };
  }
  if (name === 'run' || (said === 'run' && name === 'walk')) return { clip, name, frame: frameOf({ ...clip, fps: (clip.fps ?? 8) * 1.8 }, e, null, calm), e };
  return { clip, name, frame: frameOf(clip, e, m, calm), e };
}

/* A fighter's frame on the stage: its feet at (x, y), facing `face`, laid on with a pale rim and its shadow on the
   boards. Answers its sword's tip and hands in the field's units. */
function sprite(ctx, sheet, got, x, y, face, k, extra) {
  const fr = sheet.meta.frames[got.frame];
  if (!fr) return {};
  const u = sheet.u, [rx, ry, rw, rh] = fr.rect, [ax, ay] = fr.anchor;
  if (!extra.noShadow) { ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(x, y + (extra.floorAt ?? 0), 50 - Math.min(24, (extra.floorAt ?? 0) / 6), 8, 0, 0, Math.PI * 2); ctx.fill(); }
  const lay = (name, alpha) => {
    const f = sheet.meta.frames[name];
    if (!f) return;
    ctx.save();
    ctx.translate(x + (extra.jolt ?? 0), y);
    if (extra.spin) { ctx.translate(0, -60); ctx.rotate(rad(extra.spin) * face); ctx.translate(0, 60); }
    if (extra.lie) { ctx.translate(-face * 10, 0); ctx.rotate(-rad(extra.lie) * face); } // a robed foe down: laid on her back
    ctx.scale(face * u, u);
    ctx.globalAlpha = alpha * (extra.ghost ?? 1);
    ctx.shadowColor = 'rgba(255,247,228,.9)'; ctx.shadowBlur = 7 * k;
    ctx.drawImage(sheet.img, f.rect[0], f.rect[1], f.rect[2], f.rect[3], -f.anchor[0], -f.anchor[1], f.rect[2], f.rect[3]);
    ctx.restore();
  };
  lay(got.frame, 1);
  // a slow loop (breathing) may melt into its next frame; never under reduced motion
  if (got.clip.fade && !extra.calm && got.clip.loop) {
    const per = 1000 / (got.clip.fps ?? 4), kk = (got.e % per) / per, F = got.clip.frames;
    const next = F[(F.indexOf(got.frame) + 1) % F.length];
    if (next !== got.frame && kk > 0.5) lay(next, (kk - 0.5) * 1.6);
  }
  const field = (p) => (p ? { x: x + face * (p[0] - ax) * u, y: y + (p[1] - ay) * u } : null);
  return { tip: field(fr.tip), handF: field(fr.handF), handB: field(fr.handB) };
}

/* A builder's check, never on in play (globalThis.LINGJING_HITBOX): his blow's reach from his feet (red while it can land,
   grey before and after), the step his 上步 may take (dashed), and her poke's and thrust's reach (blue). */
function hitboxes(ctx, s, meY, foeY) {
  const me = s.me, a = me.act, sd = s.order ?? 1;
  ctx.save(); ctx.lineWidth = 3;
  if (a?.m?.reach) {
    const e = s.t - a.at, live = e >= a.m.startup && e < a.m.startup + (a.m.active ?? 0);
    ctx.strokeStyle = live ? 'rgba(220,30,30,.9)' : 'rgba(80,80,80,.6)';
    ctx.beginPath(); ctx.moveTo(me.x, meY - 120); ctx.lineTo(me.x + sd * a.m.reach, meY - 120); ctx.stroke();
    if (a.m.lunge) { ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(me.x + sd * a.m.reach, meY - 120); ctx.lineTo(me.x + sd * (a.m.reach + a.m.lunge), meY - 120); ctx.stroke(); ctx.setLineDash([]); }
  }
  const M = s.R.foe.moves;
  ctx.strokeStyle = 'rgba(40,90,220,.7)';
  for (const [r, y] of [[M.poke.reach, 100], [M.thrust.reach, 90]]) { ctx.beginPath(); ctx.moveTo(s.foe.x, foeY - y); ctx.lineTo(s.foe.x - sd * r, foeY - y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.font = '14px sans-serif';
  ctx.fillText(`d ${Math.round(Math.abs(s.foe.x - me.x))}`, (me.x + s.foe.x) / 2 - 20, meY - 250);
  ctx.restore();
}

/* What lights a hand: her palm's green, his fire. */
function handLight(ctx, at, r, inner, outer) {
  if (!at) return;
  const g = ctx.createRadialGradient(at.x, at.y, 1, at.x, at.y, r);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(at.x, at.y, r, 0, Math.PI * 2); ctx.fill();
}

/* ── Effects ── */
function splat(ctx, x, y, age, id, big) {
  const k = age / 480;
  if (k >= 1) return;
  ctx.fillStyle = `rgba(18,16,14,${0.88 * (1 - k)})`;
  const r = (big ? 22 : 12) * (0.6 + k * 0.8);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < (big ? 10 : 6); i += 1) {
    const a = ((id * 97 + i * 53) % 360) * Math.PI / 180, d = r * (1.3 + ((id + i * 7) % 5) * 0.35) * (0.6 + k);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.16 + ((i * 3 + id) % 4) * 0.05), 0, Math.PI * 2); ctx.fill();
  }
  if (big) {
    ctx.fillRect(x - 2, y + r * 0.6, 3, 10 + k * 26); ctx.fillRect(x + r * 0.5, y + r * 0.4, 2, 6 + k * 18);
    // KOF's big impact, in ink and paper: a starburst of brush rays, first white then gone
    if (age < 200) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(id);
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * Math.PI * 2, l = 34 + (i % 3) * 16 + age / 4;
        ctx.fillStyle = i % 2 ? `rgba(255,250,236,${1 - age / 200})` : `rgba(20,18,16,${0.8 - age / 250})`;
        ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * 10, Math.sin(a - 0.12) * 10); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.lineTo(Math.cos(a + 0.12) * 10, Math.sin(a + 0.12) * 10); ctx.fill();
      }
      ctx.restore();
    }
  }
}
/* 飞剑 in flight (jieyin/flight.js's loop, the 结印 look): from his hand up over the stage and down on her where she
   stands; a glowing trail behind it. Reduced motion: no loop — the sword hangs over her and drops. */
function flyingSword(ctx, s, x, art, calm) {
  const target = x.who === 'me' ? s.foe : s.me;
  const a = { x: x.from.x, y: FLOOR - x.from.y * FY }, b = { x: target.x, y: FLOOR - 120 * FY };
  const k = Math.max(0, Math.min(1, (s.t - x.at) / Math.max(1, x.land - x.at)));
  const at = (kk) => (calm ? { x: b.x, y: b.y - 120 * (1 - kk), rot: Math.PI / 2 } : loopAt(a, b, kk, { w: W, h: H }));
  const p = at(k), rgb = x.who === 'me' ? '143,212,255' : '120,90,160';
  if (!calm) {
    ctx.lineCap = 'round';
    for (let i = 1; i <= 8; i += 1) {
      const q0 = at(Math.max(0, k - i * 0.025)), q1 = at(Math.max(0, k - (i - 1) * 0.025));
      ctx.strokeStyle = `rgba(${rgb},${0.5 * (1 - i / 9)})`; ctx.lineWidth = 12 * (1 - i / 9) + 2;
      ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
    }
  }
  const img = art.feijian, size = 92;
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.rot + Math.PI / 4);
  ctx.shadowColor = `rgba(${rgb},.95)`; ctx.shadowBlur = 16;
  if (img?.complete && img.naturalWidth) ctx.drawImage(img, -size / 2, -size / 2, size, size);
  else { ctx.rotate(-Math.PI / 4); ctx.fillStyle = '#e8f4fb'; ctx.fillRect(-30, -3, 60, 6); ctx.fillStyle = '#5b4f42'; ctx.fillRect(-38, -4, 10, 8); }
  ctx.restore();
}
/* 符文 on the boards: a yellow talisman strip and its rune circle, turning as it arms; bound, it flares; fizzled, it fades. */
function rune(ctx, s, r) {
  const arming = Math.min(1, (s.t - r.at) / Math.max(1, r.arm - r.at)), after = s.t - r.arm;
  const fade = r.done ? Math.max(0, 1 - after / 600) : 1;
  if (fade <= 0) return;
  const cx = r.x, cy = FLOOR + 4, R = 58;
  ctx.save();
  ctx.globalAlpha = fade * (r.fizzled ? 0.5 : 1);
  ctx.translate(cx, cy); ctx.scale(1, 0.28);
  ctx.strokeStyle = r.bound ? 'rgba(255,214,90,.95)' : `rgba(226,170,60,${0.5 + 0.5 * arming})`; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * arming); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.66, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(s.t / 500);
  ctx.fillStyle = ctx.strokeStyle; ctx.font = `700 22px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ['敕', '令', '缚', '镇'].forEach((c, i) => { const a = (i / 4) * Math.PI * 2; ctx.fillText(c, Math.cos(a) * R * 0.83, Math.sin(a) * R * 0.83); });
  ctx.restore();
  if (!r.done) { // the strip itself, standing on the boards over the circle
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = '#e8c45a'; ctx.strokeStyle = '#7a2a18'; ctx.lineWidth = 1.5;
    const y0 = FLOOR - 52 - Math.sin(s.t / 160) * 3;
    ctx.fillRect(cx - 9, y0, 18, 44); ctx.strokeRect(cx - 9, y0, 18, 44);
    ctx.fillStyle = '#a3261c'; ctx.font = `700 13px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('敕', cx, y0 + 13); ctx.fillText('令', cx, y0 + 31);
    ctx.restore();
  }
}
/* A number off a blow: what it took (her 稳, his 血), rising and fading. */
function numberPop(ctx, f, x, y, age) {
  const k = Math.min(1, age / 120), up = age / 14, a = age < 600 ? 1 : 1 - (age - 600) / 300;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.translate(x, y - up);
  ctx.scale(1.4 - 0.4 * k, 1.4 - 0.4 * k);
  ctx.font = `800 30px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(246,238,220,.95)'; ctx.strokeText(`-${f.n}`, 0, 0);
  ctx.fillStyle = f.who === 'me' ? '#a3261c' : '#2f6a8a'; ctx.fillText(`-${f.n}`, 0, 0);
  ctx.restore();
}
/* A word off a moment (KOF's 「COUNTER」, 「GUARD CRUSH」): 反击 · 破防 · 拆, stamped and rising. */
const CALL = { counter: { zh: '反击', en: 'Counter', c: '#a3261c' }, crush: { zh: '破防', en: 'Guard Crush', c: '#b3261e' }, tech: { zh: '拆', en: 'Break', c: '#2f6a8a' } };
function callout(ctx, f, x, y, age, lang) {
  const w = CALL[f.kind], k = Math.min(1, age / 90), a = age < 480 ? 1 : 1 - (age - 480) / 220;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.translate(x, y - age / 12);
  ctx.rotate(-0.05);
  ctx.scale(1.5 - 0.5 * k, 1.5 - 0.5 * k);
  ctx.font = `800 ${lang === 'en' ? 26 : 34}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(246,238,220,.95)'; ctx.strokeText(w[lang] ?? w.zh, 0, 0);
  ctx.fillStyle = w.c; ctx.fillText(w[lang] ?? w.zh, 0, 0);
  ctx.restore();
}
function effects(ctx, s, art = {}, calm = false, lang = 'zh') {
  for (const f of s.fx) {
    const age = s.t - f.at, x = f.x, y = FLOOR - f.y * FY;
    if (f.kind === 'ink' || f.kind === 'cut') splat(ctx, x, y, age, f.id, f.big || f.kind === 'cut');
    if (f.kind === 'cut' && age < 400) { ctx.strokeStyle = `rgba(140,24,18,${1 - age / 400})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 40, y - 20); ctx.lineTo(x + 40, y + 16); ctx.stroke(); }
    if (f.kind === 'spark' && age < 280) {
      ctx.strokeStyle = `rgba(250,245,230,${1 - age / 280})`; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) { const a = (i / 6) * Math.PI * 2 + f.id; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.lineTo(x + Math.cos(a) * (16 + age / 10), y + Math.sin(a) * (16 + age / 10)); ctx.stroke(); }
      ctx.strokeStyle = `rgba(40,40,40,${0.7 - age / 400})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 10 + age / 14, 0, Math.PI * 2); ctx.stroke();
    }
    if (f.kind === 'parry' && age < 420) {
      ctx.strokeStyle = `rgba(230,180,70,${1 - age / 420})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, 14 + age / 6, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6 + age / 10, 0, Math.PI * 2); ctx.stroke();
    }
    if (f.kind === 'qi' && age < 240) {
      ctx.strokeStyle = `rgba(90,200,155,${0.75 * (1 - age / 240)})`; ctx.lineWidth = f.big ? 22 : 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(f.to, y + 2); ctx.stroke();
    }
    if (f.kind === 'glow' && age < 500) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 64);
      g.addColorStop(0, `rgba(180,255,215,${0.9 * (1 - age / 500)})`); g.addColorStop(1, 'rgba(80,200,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 64, 0, Math.PI * 2); ctx.fill();
    }
    if (f.kind === 'steam' && age < 600) {
      ctx.fillStyle = `rgba(250,250,250,${0.7 * (1 - age / 600)})`;
      for (let i = 0; i < 4; i += 1) { ctx.beginPath(); ctx.arc(x + (i - 1.5) * 12, y - age / 20 - i * 4, 10 + age / 60, 0, Math.PI * 2); ctx.fill(); }
    }
    if (f.kind === 'flash' && age < 260) { // a flying sword strikes home
      const g = ctx.createRadialGradient(x, y, 2, x, y, 70);
      g.addColorStop(0, `rgba(235,248,255,${1 - age / 260})`); g.addColorStop(1, 'rgba(143,212,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();
    }
    if (f.kind === 'bind' && age < 700) { // the talisman closes: gold chains of light rise round her
      ctx.strokeStyle = `rgba(240,196,80,${0.9 * (1 - age / 700)})`; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.ellipse(x, FLOOR - 40 - i * 46 - age / 12, 46 - i * 4, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (f.kind === 'num' && age < 900) numberPop(ctx, f, x, FLOOR - f.y * FY, age);
    if (['counter', 'crush', 'tech'].includes(f.kind) && age < 700) callout(ctx, f, x, y, age, lang);
    if (f.kind === 'max' && age < 420) { // 爆气 (and a guard cancel, small): a ring of gold bursting off him
      const r = (f.small ? 40 : 70) + age / (f.small ? 5 : 2.6);
      ctx.strokeStyle = `rgba(255,170,60,${0.9 * (1 - age / 420)})`; ctx.lineWidth = f.small ? 4 : 8;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (f.kind === 'dust' && age < 420) {
      ctx.fillStyle = `rgba(150,138,112,${0.55 * (1 - age / 420)})`;
      const n = f.small ? 2 : 4;
      for (let i = 0; i < n; i += 1) { const d = (i - (n - 1) / 2) * (10 + age / 14); ctx.beginPath(); ctx.ellipse(x + d, y - 4 - age / 40, 7 + age / 30, 4 + age / 60, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  if (s.wall) {
    const age = s.t - s.wall.at, h = Math.min(1, age / 140) * 96 * (s.t > s.wall.until - 200 ? (s.wall.until - s.t) / 200 : 1);
    ctx.fillStyle = '#6f5a3e'; ctx.strokeStyle = '#2a2016'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.wall.x - 18, FLOOR); ctx.lineTo(s.wall.x - 14, FLOOR - h); ctx.lineTo(s.wall.x + 2, FLOOR - h - 8); ctx.lineTo(s.wall.x + 16, FLOOR - h + 4); ctx.lineTo(s.wall.x + 18, FLOOR); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  for (const r of s.runes ?? []) rune(ctx, s, r);
  for (const x of s.shots) {
    if (x.kind === 'feijian') { flyingSword(ctx, s, x, art, calm); continue; }
    const px = x.x, py = FLOOR - x.y * (x.kind === 'ice' ? FY_ICE : FY), d = Math.sign(x.vx);
    if (x.kind === 'blade') { // 金刃: a white crescent skimming the boards
      ctx.fillStyle = 'rgba(246,244,232,.96)'; ctx.strokeStyle = 'rgba(90,90,80,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px + d * 26, py); ctx.quadraticCurveTo(px - d * 4, py - 16, px - d * 22, py - 4); ctx.quadraticCurveTo(px - d * 2, py - 6, px + d * 26, py); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,238,220,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - d * 20, py - 2); ctx.lineTo(px - d * 56, py - 1); ctx.stroke();
      continue;
    }
    if (x.kind === 'beam') { // 马小宝's 铜镜: a bar of yellow light from the mirror to its head
      const from = x.from ?? px + d * 200, g = ctx.createLinearGradient(from, 0, px, 0);
      g.addColorStop(0, 'rgba(255,236,150,0)'); g.addColorStop(1, 'rgba(255,226,110,.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 14; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(from, py); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = 'rgba(255,250,220,.95)'; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (x.kind === 'quake') { // 土: the boards heave in a running ridge
      ctx.fillStyle = 'rgba(150,118,70,.92)'; ctx.strokeStyle = 'rgba(60,44,24,.9)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i += 1) { const qx = px - d * i * 18, qh = 22 - i * 6 + Math.sin(s.t / 40 + i) * 3; ctx.beginPath(); ctx.moveTo(qx - 12, FLOOR); ctx.lineTo(qx - 4, FLOOR - qh); ctx.lineTo(qx + 6, FLOOR - qh + 5); ctx.lineTo(qx + 12, FLOOR); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      continue;
    }
    if (x.kind === 'ice') {
      ctx.fillStyle = 'rgba(205,234,250,.96)'; ctx.strokeStyle = 'rgba(40,70,90,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px + d * 24, py); ctx.lineTo(px - d * 16, py - 6); ctx.lineTo(px - d * 10, py); ctx.lineTo(px - d * 16, py + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,232,248,.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - d * 16, py); ctx.lineTo(px - d * 46, py); ctx.stroke();
    } else if (x.kind === 'wave') {
      for (let i = 0; i < 6; i += 1) {
        const fx_ = px - d * i * 16, fl = 34 + Math.sin(s.t / 50 + i) * 8 - i * 3;
        const g = ctx.createLinearGradient(0, FLOOR, 0, FLOOR - fl);
        g.addColorStop(0, 'rgba(230,80,30,.95)'); g.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx_ - 10, FLOOR); ctx.quadraticCurveTo(fx_ - 6, FLOOR - fl * 0.6, fx_, FLOOR - fl); ctx.quadraticCurveTo(fx_ + 6, FLOOR - fl * 0.6, fx_ + 10, FLOOR); ctx.fill();
      }
    } else {
      const big = x.kind === 'palmfire', r0 = big ? 22 : 10, fl = r0 + Math.sin(s.t / 40 + x.id) * 3;
      ctx.fillStyle = 'rgba(40,20,10,.35)';
      for (let i = 1; i <= 3; i += 1) { ctx.beginPath(); ctx.arc(px - d * i * 12, py + Math.sin(s.t / 60 + i) * 2, fl * (1 - i * 0.22), 0, Math.PI * 2); ctx.fill(); }
      const g = ctx.createRadialGradient(px, py, 1, px, py, fl + 10);
      g.addColorStop(0, 'rgba(255,236,150,1)'); g.addColorStop(0.5, 'rgba(232,96,34,.92)'); g.addColorStop(1, 'rgba(120,20,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, fl + 10, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ── The bars, the 气, the incense, the chain, the cue, the line ── */
const say = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.zh ?? '' : x ?? '');
function plate(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(28,24,19,.86)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = '#b8925a'; ctx.lineWidth = 1.5; ctx.stroke();
}
function bar(ctx, x, w, frac, ghost, color, right) {
  ctx.fillStyle = 'rgba(20,18,15,.82)'; ctx.fillRect(x - 3, 40, w + 6, 18);
  ctx.fillStyle = 'rgba(236,226,206,.45)'; ctx.fillRect(x, 43, w, 12);
  const g = Math.max(0, Math.min(1, ghost)) * w, f = Math.max(0, Math.min(1, frac)) * w;
  ctx.fillStyle = 'rgba(250,240,220,.9)'; ctx.fillRect(right ? x + w - g : x, 43, g, 12);
  ctx.fillStyle = color; ctx.fillRect(right ? x + w - f : x, 43, f, 12);
  ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(right ? x + w - f : x, 43, f, 4);
}
/* 气: three stocks; each full one glows, the one filling is dim. */
function qiBar(ctx, x, w, qi, t, right) {
  const y = 61, seg = w / 3;
  ctx.fillStyle = 'rgba(20,18,15,.7)'; ctx.fillRect(x - 2, y - 2, w + 4, 9);
  for (let i = 0; i < 3; i += 1) {
    const f = Math.max(0, Math.min(1, qi / 100 - i)), sx = right ? x + w - (i + 1) * seg : x + i * seg;
    if (!f) continue;
    ctx.fillStyle = f >= 1 ? `rgba(240,${186 + Math.round(Math.sin(t / 90 + i) * 34)},70,1)` : 'rgba(201,154,62,.7)';
    ctx.fillRect(right ? sx + seg - f * seg + 1 : sx + 1, y, f * seg - 2, 5);
  }
}
function hud(ctx, s, art, lang, view) {
  const lv = s.level ?? {}, me = lv.me ?? {}, foe = lv.foe ?? {}, BW = 320;
  bar(ctx, 86, BW, s.me.hp / s.R.me.hp, view.ghostMe, me.look?.bar ?? '#a33025', false);
  bar(ctx, W - 86 - BW, BW, s.foe.bal / s.R.foe.bal, view.ghostFoe, foe.look?.bar ?? '#3e8068', true);
  qiBar(ctx, 86, BW * 0.62, s.me.qi ?? 0, s.t, false);
  qiBar(ctx, W - 86 - BW * 0.62, BW * 0.62, s.foe.qi ?? 0, s.t, true);
  // the guards' meters (KOF's guard crush), a thin line under each bar while it fills: red near breaking
  const full = s.R.me.guard?.full ?? 100;
  for (const [who, x, right] of [[s.me, 86, false], [s.foe, W - 86 - BW, true]]) {
    const f = Math.min(1, (who.gp ?? 0) / full);
    if (f <= 0.02) continue;
    ctx.fillStyle = 'rgba(20,18,15,.6)'; ctx.fillRect(x, 36, BW, 3);
    ctx.fillStyle = f > 0.7 ? '#c2381e' : '#d8c8a0'; ctx.fillRect(right ? x + BW - f * BW : x, 36, f * BW, 3);
  }
  // 爆气: its time left, burning down under his 气
  if (s.me.max > s.t) {
    const left = (s.me.max - s.t) / (s.R.me.max?.ms ?? 10000), y = 69;
    ctx.fillStyle = 'rgba(20,18,15,.7)'; ctx.fillRect(84, y, BW * 0.62 + 4, 5);
    ctx.fillStyle = `rgba(255,${130 + Math.round(Math.sin(s.t / 60) * 40)},50,1)`; ctx.fillRect(86, y + 1, BW * 0.62 * left, 3);
  }
  ctx.textBaseline = 'middle';
  ctx.font = `600 15px ${SERIF}`;
  const name = (n, b) => `${say(n, lang)} · ${say(b, lang)}`;
  const tl = name(me.name, me.bar), tr = name(foe.name, foe.bar);
  const wl = ctx.measureText(tl).width + 22, wr = ctx.measureText(tr).width + 22;
  plate(ctx, 82, 12, wl, 23); plate(ctx, W - 82 - wr, 12, wr, 23);
  ctx.fillStyle = '#f1e6cf'; ctx.textAlign = 'left'; ctx.fillText(tl, 93, 24);
  ctx.textAlign = 'right'; ctx.fillText(tr, W - 93, 24);
  ctx.font = `700 11px ${SERIF}`; ctx.fillStyle = '#e7c06a';
  const stocks = (q) => Math.floor((q ?? 0) / 100), fullW = say(lv.words?.full, lang) || (lang === 'en' ? 'MAX' : '绝');
  if (s.me.max > s.t) { ctx.textAlign = 'left'; ctx.fillStyle = '#ff9a3c'; ctx.fillText(lang === 'en' ? 'MAX' : '爆气', 86 + BW * 0.62 + 8, 64); ctx.fillStyle = '#e7c06a'; }
  else if (stocks(s.me.qi)) { ctx.textAlign = 'left'; ctx.fillText(`${fullW} ×${stocks(s.me.qi)}`, 86 + BW * 0.62 + 8, 64); }
  if (stocks(s.foe.qi)) { ctx.textAlign = 'right'; ctx.fillText(`${fullW} ×${stocks(s.foe.qi)}`, W - 86 - BW * 0.62 - 8, 64); }
  for (const [img, cx] of [[art.me, 44], [art.foe, W - 44]]) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, 40, 32, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#d8ccb0'; ctx.fill();
    ctx.clip();
    if (img?.complete && img.naturalWidth) { const k = 80 / Math.min(img.naturalWidth, img.naturalHeight * 0.75); ctx.drawImage(img, cx - (img.naturalWidth * k) / 2, 6, img.naturalWidth * k, img.naturalHeight * k); }
    ctx.restore();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1c1a16'; ctx.beginPath(); ctx.arc(cx, 40, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#b8925a'; ctx.beginPath(); ctx.arc(cx, 40, 35, 0, Math.PI * 2); ctx.stroke();
  }
  // the spells' readiness, under his 气
  const ring = (cx, label, ready) => {
    ctx.fillStyle = 'rgba(28,24,19,.55)'; ctx.beginPath(); ctx.arc(cx, 82, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ready >= 1 ? '#c2481f' : 'rgba(194,72,31,.5)';
    ctx.beginPath(); ctx.moveTo(cx, 82); ctx.arc(cx, 82, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ready)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f6eedc'; ctx.font = `700 10px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillText(label, cx, 83);
  };
  ring(96, say(lv.words?.palmfire, lang)?.[0] || (lang === 'en' ? 'P' : '掌'), 1 - (s.me.cdPf ?? 0) / s.R.me.palmfire.cd); // 掌心火's readiness
  if (s.R.me.feijian) ring(120, say(lv.words?.feijian, lang)?.[0] || (lang === 'en' ? 'S' : '剑'), 1 - (s.me.cdFj ?? 0) / s.R.me.feijian.cd); // 飞剑's
  if (s.R.me.fuwen) ring(144, say(lv.words?.fuwen, lang)?.[0] || (lang === 'en' ? 'T' : '符'), 1 - (s.me.cdFw ?? 0) / s.R.me.fuwen.cd); // 符文's
  // the incense (the bout's clock, burning down) and her count of moves, small
  const total = lv.time ?? 120000, left = Math.max(0.06, 1 - s.t / total), ix = W / 2, top = 14, len = 34;
  ctx.fillStyle = '#6b4b2a'; ctx.fillRect(ix - 1.5, top + len * (1 - left), 3, len * left);
  ctx.fillStyle = '#e24a1b'; ctx.beginPath(); ctx.arc(ix, top + len * (1 - left), 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,80,80,.35)'; ctx.lineWidth = 1;
  const sy0 = top + len * (1 - left);
  ctx.beginPath(); ctx.moveTo(ix, sy0); ctx.bezierCurveTo(ix + 6, sy0 - 6, ix - 6, sy0 - 12, ix + 3 + Math.sin(s.t / 500) * 3, sy0 - 20); ctx.stroke();
  ctx.fillStyle = '#4a4034'; ctx.fillRect(ix - 9, top + len, 18, 4);
  ctx.textAlign = 'center'; ctx.font = `600 11px ${SERIF}`; ctx.fillStyle = 'rgba(28,26,22,.8)';
  const count = lv.count?.[lang] ?? lv.count?.zh;
  if (count) ctx.fillText(count.replace('{n}', String(s.foe.moves)), ix, top + len + 14);
}

/* 「3 连」: the chain, by his side, while it lasts and a moment after. */
function chain(ctx, view, lang, word) {
  const c = view.chain;
  if (!c || c.n < 2) return;
  const age = view.t - c.at; // the bout's clock: a pause holds it
  if (age > 1000) return;
  const k = Math.min(1, age / 90), a = age < 700 ? 1 : 1 - (age - 700) / 300;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(176, 150);
  ctx.rotate(-0.06);
  ctx.scale(1.5 - 0.5 * k, 1.5 - 0.5 * k);
  ctx.font = `800 46px ${SERIF}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(246,238,220,.9)'; ctx.strokeText(String(c.n), 0, 0);
  ctx.fillStyle = '#a3261c'; ctx.fillText(String(c.n), 0, 0);
  ctx.font = `700 24px ${SERIF}`; ctx.textAlign = 'left';
  ctx.strokeText(word, 4, -4); ctx.fillStyle = '#1c1a16'; ctx.fillText(word, 4, -4);
  ctx.restore();
}

/** The words of a cue (`level.cues.ying` · `.hook`): the word, and on the keys what to press — `keys`, with `{f}` the key
    toward her (A or D: after 迎 she stands on his left). On a phone the cue is a button of its own (the mount's). */
export function cueText(s, lang = 'zh', kind = 'desk') {
  const c = s?.cue;
  if (!c) return '';
  const def = s.level?.cues?.[c.k];
  const word = say(def, lang) || (lang === 'en' ? (c.k === 'ying' ? 'In!' : 'Hook!') : (c.k === 'ying' ? '迎' : '勾'));
  if (kind === 'touch' || !def?.keys) return word;
  const toward = (s.order ?? (Math.sign(s.foe.x - s.me.x) || 1)) < 0 ? 'A' : 'D';
  return `${word} ${String(def.keys).replaceAll('{f}', toward)}`;
}
function cueMark(ctx, s, lang, kind) {
  const c = s.cue;
  if (!c) return;
  const text = cueText(s, lang, kind);
  const age = s.t - c.at, k = Math.min(1, age / 140), x = Math.max(160, Math.min(W - 160, s.me.x)), y = FLOOR - 320;
  ctx.save(); // full while its window is open: the rules take the cue away as it shuts
  ctx.font = `800 ${Math.round(40 * (0.7 + 0.3 * k))}px ${SERIF}`;
  const w = ctx.measureText(text).width + 44, h = 62 * (0.7 + 0.3 * k);
  ctx.fillStyle = 'rgba(178,34,24,.94)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(246,238,220,.85)'; ctx.stroke();
  ctx.fillStyle = '#f6eedc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 2);
  ctx.restore();
}

function lineBand(ctx, text) {
  if (!text) return;
  ctx.save();
  ctx.font = `500 21px ${SERIF}`;
  const w = Math.min(W - 40, ctx.measureText(text).width + 44);
  ctx.fillStyle = 'rgba(24,20,16,.72)';
  ctx.beginPath(); ctx.roundRect((W - w) / 2, H - 46, w, 34, 6); ctx.fill();
  ctx.fillStyle = '#f3e9d2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H - 29, W - 60);
  ctx.restore();
}

function seal(ctx, word, age) {
  if (age < 0) return;
  const k = Math.min(1, age / 220);
  ctx.save();
  ctx.translate(W / 2, 210);
  ctx.rotate(-0.08);
  ctx.scale(1.6 - 0.6 * k, 1.6 - 0.6 * k);
  ctx.globalAlpha = k;
  ctx.fillStyle = '#b3261e';
  ctx.fillRect(-48, -48, 96, 96);
  ctx.strokeStyle = 'rgba(246,238,220,.6)'; ctx.lineWidth = 3; ctx.strokeRect(-40, -40, 80, 80);
  ctx.fillStyle = '#f6eedc'; ctx.font = `700 60px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(word, 0, 4);
  ctx.restore();
}

/* The bout's call (KOF's 「ROUND 1 · READY · GO」): 「比武」 while the hands wait, then 「开始！」 as they go. */
function intro(ctx, s, lang, lv) {
  const left = s.intro - s.t, go = left <= 0;
  const word = go ? say(lv.words?.go, lang) || (lang === 'en' ? 'Fight!' : '开始！') : say(lv.words?.ready, lang) || (lang === 'en' ? 'Ready' : '比武');
  const age = go ? -left : s.t, k = Math.min(1, age / 160), a = go ? Math.max(0, 1 - -left / 500) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(20,16,12,.55)'; ctx.fillRect(-EDGE, 214, W + 2 * EDGE, 92);
  ctx.translate(W / 2, 262);
  ctx.scale(1.6 - 0.6 * k, 1.6 - 0.6 * k);
  ctx.font = `800 ${go ? 72 : 58}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(word, 0, 0);
  ctx.fillStyle = go ? '#f2d38a' : '#f3e9d2'; ctx.fillText(word, 0, 0);
  ctx.restore();
}

/* The 绝's cut-in: a band of ink across the field, the face, the move's name in a big brush. */
function cutIn(ctx, c, img, lang, age) {
  const k = Math.min(1, age / 160), out = age > 700 ? Math.min(1, (age - 700) / 200) : 0, mine = c.who === 'me';
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.fillStyle = 'rgba(12,10,8,.55)'; ctx.fillRect(-EDGE, 0, W + 2 * EDGE, H);
  ctx.translate(mine ? -(W + 2 * EDGE) * (1 - k) : (W + 2 * EDGE) * (1 - k), 0);
  const a0 = -EDGE, a1 = W + EDGE; // the band from edge to edge of the field
  ctx.fillStyle = mine ? '#1d1712' : '#14202a';
  ctx.beginPath(); ctx.moveTo(a0, 180); ctx.lineTo(a1, 140); ctx.lineTo(a1, 330); ctx.lineTo(a0, 370); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = mine ? '#c2481f' : '#5fbf98'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(a0, 176); ctx.lineTo(a1, 136); ctx.stroke(); ctx.beginPath(); ctx.moveTo(a0, 374); ctx.lineTo(a1, 334); ctx.stroke();
  if (img?.complete && img.naturalWidth) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(a0, 180); ctx.lineTo(a1, 140); ctx.lineTo(a1, 330); ctx.lineTo(a0, 370); ctx.closePath(); ctx.clip();
    // the face and shoulders: the painting's top part, large
    const sh = img.naturalHeight * 0.42, h = 250, w = (img.naturalWidth / sh) * h;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, 0, 0, img.naturalWidth, sh, mine ? 60 : W - 60 - w, 132, w, h);
    ctx.restore();
  }
  ctx.font = `800 76px ${SERIF}`; ctx.textAlign = mine ? 'right' : 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)';
  const tx = mine ? W - 70 : 70, word = say(c.name, lang);
  ctx.strokeText(word, tx, 262); ctx.fillStyle = mine ? '#f2d38a' : '#bff0dc'; ctx.fillText(word, tx, 262);
  ctx.restore();
}

/** A painter for one canvas: `draw(state, lang, text)` each frame; the poses ease from the last. */
export function painter(canvas, { art = {}, sheets = {}, calm = () => false, kind = 'desk' } = {}) {
  const ctx = canvas.getContext('2d');
  const track = { me: {}, foe: {} };
  let layers = null, layersFor = null;
  const eased = { me: null, foe: null }, sway = { me: 0, foe: 0 };
  const view = { ghostMe: 1, ghostFoe: 1, chain: null, now: 0, lift: 0, trail: [], cut: null, cutAt: 0 };
  let shake = 0, lastBig = 0, lastHit = 0, last = 0;
  return function draw(s, lang = 'zh', text = '') {
    const w = canvas.width, h = canvas.height, fit = fieldOf(w, h), k = fit.k, now = globalThis.performance?.now?.() ?? Date.now();
    EDGE = fit.edge;
    const X0 = (fit.left + EDGE) * k; // where the field's x = 0 (the rules') lands on the canvas, in px
    const dtf = last ? Math.min(3, (now - last) / 16.7) : 1;
    last = now; view.now = now;
    if (layersFor !== `${w}x${h}`) {
      const make = (lw, paint) => layer(Math.round(lw * k), h, (c) => { c.setTransform(k, 0, 0, k, 0, 0); paint(c); });
      layers = {
        sky: make(W + 2 * EDGE, (c) => paintSky(c, s.level?.stage?.look)),
        far: make(W + 2 * EDGE + 120, paintFar), near: make(W + 2 * EDGE + 120, paintNear),
        stage: make(W + 2 * EDGE, (c) => paintStage(c, s.R.stage)),
      };
      layersFor = `${w}x${h}`;
    }
    const mid = (s.me.x + s.foe.x) / 2 - W / 2;
    // a heavy blow shakes the paper and lifts the crowd
    const big = (s.snd.heavy ?? 0) + (s.snd.hook ?? 0) + (s.snd.palm ?? 0) + (s.snd.super ?? 0) + (s.snd.knock ?? 0);
    const hits = (s.snd.hit ?? 0) + big;
    if (big > lastBig) { shake = 9; view.lift = 1; }
    if (hits > lastHit) { view.lift = Math.max(view.lift, 0.5); shake = Math.max(shake, 2.5); } // a light's tap: the paper hardly moves
    if (calm()) shake = 0; // reduced motion: the paper holds still
    lastBig = big; lastHit = hits;
    shake *= Math.pow(0.85, dtf);
    view.lift *= Math.pow(0.95, dtf);
    const ox = shake > 0.3 ? Math.sin(now / 17) * shake : 0, oy = shake > 0.3 ? Math.cos(now / 23) * shake * 0.5 : 0;
    const L0 = fit.left * k; // past WIDE_MAX: the field centred, bands beside it
    const T = Math.round(fit.top), Hk = Math.round(H * k); // a tall field: the world set down by T, sky above, boards below
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (L0 > 0) { ctx.fillStyle = '#0b0f0a'; ctx.fillRect(0, 0, w, h); }
    if (T > 0) ctx.drawImage(layers.sky, 0, 0, layers.sky.width, 2, L0, 0, layers.sky.width, T + 1);
    ctx.drawImage(layers.sky, L0, T);
    ctx.drawImage(layers.far, L0 + Math.round((-60 - mid * 0.04) * k), T);
    ctx.drawImage(layers.near, L0 + Math.round((-60 - mid * 0.09) * k), T);
    ctx.setTransform(k, 0, 0, k, X0 + ox * k, oy * k + T);
    banners(ctx, s.t, s.level?.stage?.look);
    ctx.setTransform(1, 0, 0, 1, L0 + ox * k, oy * k + T);
    ctx.drawImage(layers.stage, 0, 0);
    if (h > T + Hk) ctx.drawImage(layers.stage, 0, Hk - 3, layers.stage.width, 3, 0, Hk - 1, layers.stage.width, h - T - Hk + 2);
    ctx.setTransform(k, 0, 0, k, X0 + ox * k, oy * k + T);
    const inv = ctx.getTransform().invertSelf();
    const lv = s.level ?? {};
    const meLook = { hair: 'bun', ...(lv.me?.look ?? {}) }, foeLook = { hair: 'tail', weapon: 'sword', ...(lv.foe?.look ?? {}) };
    const ease = (who, name) => { const target = POSES[name]; eased[who] = eased[who] ? lerpPose(eased[who], target, Math.min(1, 0.4 * dtf)) : target; return eased[who]; };
    const clamp = (v) => Math.max(-16, Math.min(16, v)); // a robe swings, never flies flat
    sway.me += (clamp(-s.me.vx * 0.035) - sway.me) * Math.min(1, 0.15 * dtf);
    sway.foe += (clamp(-s.foe.vx * 0.035) - sway.foe) * Math.min(1, 0.15 * dtf);
    const fp = ease('foe', foePose(s)), mp = ease('me', mePose(s));
    const fa = s.foe.act, palm = s.palm;
    const striking = fa && ['poke', 'thrust', 'jianqi'].includes(fa.k) && s.t - fa.at >= fa.m.startup - 60 && s.t - fa.at < fa.m.startup + fa.m.active + 120;
    const qi = striking ? 0.6 : s.edge ? 0.35 : 0;
    const glow = palm ? (palm.phase === 'glow' ? Math.min(1, (s.t - palm.at) / 500) : palm.phase === 'hold' ? 0.55 : palm.phase === 'strike' ? 0.4 : 0.12) : 0;
    const foeY = FLOOR - (s.foe.y ?? 0) - (s.foe.lift && s.t - s.foe.lift < 360 ? Math.sin(((s.t - s.foe.lift) / 360) * Math.PI) * 40 : 0), meY = FLOOR - s.me.y;
    const breath = (t) => Math.sin(t / 420) * 1.4;
    const foeExtra = { t: s.t, qi, glow, sway: sway.foe, breath: breath(s.t + 300), scabbard: !palm && !s.hooked && !s.end, noShadow: s.foe.y < 0, floorAt: Math.max(0, s.foe.y ?? 0), inv }; // up in her jump: her shadow stays on the boards
    const still = calm();
    // a hit-stop: the one struck shivers in place while the bout's clock holds
    const jolt = (who) => (s.freeze > 0 && who.stun > s.t ? (Math.floor(now / 30) % 2 ? 2.5 : -2.5) : 0);
    let tip = null;
    if (sheets.foe) {
      const gotF = pick(sheets.foe, 'foe', s, track.foe, still);
      // on a robed sheet (no fall, no roll painted): down, laid on the boards; rolling, a blur along them
      const lie = s.foe.down > s.t && gotF.name !== 'knock' ? Math.min(14, ((s.t - (s.foe.down - 900)) / 160) * 14) : 0;
      const ghost = s.foe.act?.k === 'roll' && gotF.name !== 'roll' ? 0.5 : 1;
      if (ghost < 1 && !still) sprite(ctx, sheets.foe, gotF, s.foe.x - s.foe.vx * 0.06, foeY, s.foe.face, k, { ...foeExtra, calm: still, ghost: 0.25, noShadow: true });
      const at = sprite(ctx, sheets.foe, gotF, s.foe.x, foeY, s.foe.face, k, { ...foeExtra, calm: still, jolt: jolt(s.foe), lie: Math.max(0, lie), ghost, noShadow: foeExtra.noShadow });
      tip = at.tip;
      // her qi's colour (`foe.look.qi`: [r, g, b] — 秦雁's green by default; 卢方's metal white, 祁长松's earth yellow)
      const [qr, qg, qb] = lv.foe?.look?.qi ?? [150, 240, 200];
      if (qi && tip) handLight(ctx, tip, 26, `rgba(${qr},${qg},${qb},.7)`, `rgba(${qr},${qg},${qb},0)`);
      if (glow) handLight(ctx, (lv.foe?.look?.glowHand === 'F' ? at.handF : at.handB) ?? at.handB, 26 + 34 * glow, `rgba(${qr},${qg},${qb},${0.95 * glow})`, `rgba(${qr},${qg},${qb},0)`);
    } else tip = figure(ctx, s.foe.x, foeY, s.foe.face, fp, foeLook, foeExtra);
    // the sword's trail: where its tip has been these last frames, while it cuts
    if (tip && striking) view.trail.push({ ...tip, at: now }); else if (!striking) view.trail.length = 0;
    view.trail = view.trail.filter((p) => now - p.at < 140);
    if (view.trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < view.trail.length; i += 1) {
        const a = view.trail[i - 1], b = view.trail[i], age = (now - b.at) / 140;
        ctx.strokeStyle = `rgba(110,215,170,${0.55 * (1 - age)})`; ctx.lineWidth = 12 * (1 - age) + 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    const casting = ['special', 'palmfire', 'palmfireH', 'super', 'feijian', 'fuwen'].includes(s.me.act?.k) ? 1 : 0;
    const rollK = s.me.act?.k === 'roll' ? Math.min(1, (s.t - s.me.act.at) / s.R.me.roll.ms) : null;
    const meExtra = { t: s.t, fire: casting, sway: sway.me, breath: s.me.act || s.me.air ? 0 : breath(s.t), floorAt: s.me.y, inv, spin: rollK == null ? 0 : rollK * 360 * (s.me.act.dir === s.me.face ? 1 : -1) };
    // 灵气 about him while a stock of 气 is full (主角光环): a warm gold glow behind the figure, breathing — on the pale
    // paper a pale glow never showed (11-01's live check), so it is gold and rimmed. 爆气 (MAX): a brighter, quicker
    // flame of it. Still under reduced motion.
    const maxOn = s.me.max > s.t;
    if (sheets.me && ((s.me.qi ?? 0) >= QI || maxOn)) {
      const a = (maxOn ? 0.42 : 0.26) + (still ? 0 : (maxOn ? 0.12 : 0.08) * Math.sin(now / (maxOn ? 120 : 380))), cy = meY - 120;
      const g = ctx.createRadialGradient(s.me.x, cy, 20, s.me.x, cy, 165);
      const [r0, g0, b0] = maxOn ? [255, 150, 60] : [246, 196, 92];
      g.addColorStop(0, `rgba(${r0},${g0},${b0},${a})`); g.addColorStop(0.55, `rgba(${r0},${g0},${b0},${a * 0.45})`); g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s.me.x, cy, 112, 165, 0, 0, Math.PI * 2); ctx.fill();
      if (maxOn) { // 爆气 alone carries a rim, flickering: the stock's glow stays soft
        ctx.strokeStyle = `rgba(${r0},${Math.max(0, g0 - 40)},${b0 - 40},${a * 0.6})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(s.me.x, cy, 70 + (still ? 0 : Math.sin(now / 90) * 5), 140, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (sheets.me) {
      const at = sprite(ctx, sheets.me, pick(sheets.me, 'me', s, track.me, still), s.me.x, meY, s.me.face, k, { ...meExtra, calm: still, jolt: jolt(s.me) });
      if (casting) handLight(ctx, at.handF, 28, 'rgba(255,226,130,.95)', 'rgba(220,70,30,0)');
    } else figure(ctx, s.me.x, meY, s.me.face, mp, meLook, meExtra);
    effects(ctx, s, art, still, lang);
    if (globalThis.LINGJING_HITBOX) hitboxes(ctx, s, meY, foeY);
    ctx.setTransform(k, 0, 0, k, X0, T); // the bars and the words over the boards; what fills the field reaches EDGE
    if (s.level?.stage?.look?.crowd !== false) crowd(ctx, s.t, view.lift); // the cliff has no crowd below it
    // the bars' ghosts fall behind the bars
    view.ghostMe = Math.max(s.me.hp / s.R.me.hp, view.ghostMe - 0.006 * dtf);
    view.ghostFoe = Math.max(s.foe.bal / s.R.foe.bal, view.ghostFoe - 0.006 * dtf);
    view.t = s.t;
    if (s.combo?.n >= 2 && s.combo.who === 'me') view.chain = { n: s.combo.n, at: view.chain?.n === s.combo.n ? view.chain.at : s.t };
    hud(ctx, s, art, lang, view);
    chain(ctx, view, lang, say(lv.words?.chain, lang) || (lang === 'en' ? 'hits' : '连'));
    cueMark(ctx, s, lang, kind);
    if (s.end) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 560);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,8,6,.45)');
      ctx.fillStyle = g; ctx.fillRect(-EDGE, 0, W + 2 * EDGE, H);
    }
    // KO: a white flash as it falls (the slow-down is the mount's)
    if (s.end && s.t - s.end.at < 220 && !still) { ctx.fillStyle = `rgba(255,252,240,${0.75 * (1 - (s.t - s.end.at) / 220)})`; ctx.fillRect(-EDGE, 0, W + 2 * EDGE, H); }
    if (s.intro && s.t < s.intro + 500) intro(ctx, s, lang, lv);
    lineBand(ctx, text);
    if (s.end) seal(ctx, say(won(s.end) ? lv.seal?.won : lv.seal?.lost, lang) || (lang === 'en' ? (won(s.end) ? 'Won' : 'Out') : (won(s.end) ? '胜' : '负')), s.t - s.end.at - 300);
    // the 绝: its cut-in plays on the page's clock (the bout's is held through it)
    if (s.cutin && s.cutin !== view.cut) { view.cut = s.cutin; view.cutAt = now; }
    if (view.cut && now - view.cutAt < 900) cutIn(ctx, view.cut, view.cut.who === 'me' ? art.me : art.foe, lang, now - view.cutAt);
  };
}
