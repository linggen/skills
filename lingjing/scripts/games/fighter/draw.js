// fighter/draw.js — 格斗's picture: ink-and-wash shadow-puppets (皮影) on a paper stage, drawn on one canvas. Procedural
// on purpose (v2, Hanli 10-27: 「需要美观和优化 … 美化一下应该可以玩」): every frame of a fighter is the same shapes on
// one skeleton — tapered limbs, a robe skirt that sways with the body's speed, wide sleeves that sag, boots, a profile
// head with its hair — so a pose is a handful of angles (POSES), eased into from the last, and every frame matches.
// A level dresses its fighters by data (`me.look`, `foe.look`: ink, robe, trousers, sash, hair, weapon) and its stage
// (`stage.look`). Game feel lives here too: the sword-qi trail, ink-splash sparks, dust, screen shake, the 绝's cut-in,
// the crowd bobbing on a big blow, and the KO's vignette. Nothing here plays: it reads a state.

const W = 960, H = 540, FLOOR = 432;
export const FIELD = { w: W, h: H, floor: FLOOR };
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
  crouch: P(10, [72, -10], [8, -60], [44, 110], [30, 96], { drop: 36 }),
  light: P(14, [24, 6], [-22, -8], [88, 90], [16, 62]),
  lightUp: P(10, [22, 6], [-18, -8], [44, 64], [20, 70]),
  heavy: P(-16, [84, 94], [44, -44], [46, 70], [-40, -12]), // 勾: low along the boards, the back knee bent
  heavyUp: P(-6, [50, 10], [30, -36], [36, 82], [10, 52]),
  airKick: P(-6, [92, 96], [10, -40], [60, 90], [-30, 20], { drop: 0 }),
  rise: P(-10, [40, 0], [-30, -30], [150, 170], [-20, 10], { drop: 0, head: -10 }),
  riseUp: P(16, [60, -10], [0, -50], [60, 30], [20, 40], { drop: 30 }),
  block: P(-6, [16, 2], [-24, -10], [64, 162], [48, 152], { head: -6 }),
  crouchBlock: P(4, [72, -10], [8, -60], [70, 160], [56, 150], { drop: 36, head: -4 }),
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
    if (a.k === 'palmfire') return up ? 'cast' : 'palmfire';
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
function ridge(ctx, y0, amp, f1, f2, ph, color, w = W + 120) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y0 - amp * Math.sin(x / f1 + ph) - amp * 0.5 * Math.sin(x / f2 + ph * 2));
  ctx.lineTo(w, H); ctx.closePath(); ctx.fill();
}
function paintSky(ctx, look = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, look.sky ?? '#f3ecd9'); g.addColorStop(0.62, look.paper ?? '#e9dcc0'); g.addColorStop(1, '#d9c9a6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // a pale sun behind the haze
  const s = ctx.createRadialGradient(720, 120, 4, 720, 120, 80);
  s.addColorStop(0, 'rgba(255,248,230,.9)'); s.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = s; ctx.fillRect(600, 20, 240, 220);
}
function paintFar(ctx) { ridge(ctx, 250, 46, 140, 57, 0.4, 'rgba(70,72,66,.13)'); ridge(ctx, 286, 30, 100, 41, 2.1, 'rgba(60,60,54,.16)'); }
function paintNear(ctx) {
  ridge(ctx, 330, 22, 80, 31, 1.2, 'rgba(48,46,40,.20)');
  // the temple's roofline (沉鼎观) and a pine
  ctx.fillStyle = 'rgba(32,30,26,.26)';
  ctx.beginPath(); ctx.moveTo(560, 300); ctx.quadraticCurveTo(660, 270, 760, 300); ctx.lineTo(740, 288); ctx.lineTo(580, 288); ctx.fill();
  ctx.fillRect(600, 300, 120, 54);
  ctx.beginPath(); ctx.moveTo(596, 300); ctx.lineTo(724, 300); ctx.lineTo(716, 308); ctx.lineTo(604, 308); ctx.fill();
  ctx.strokeStyle = 'rgba(30,28,24,.3)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(130, 360); ctx.quadraticCurveTo(140, 300, 120, 240); ctx.stroke();
  ctx.fillStyle = 'rgba(30,40,30,.22)';
  for (const [x, y, r] of [[100, 250, 34], [150, 268, 28], [118, 222, 26], [160, 236, 22]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, -0.2, 0, Math.PI * 2); ctx.fill(); }
}
function paintStage(ctx, st) {
  const L = st.left, R = st.right, look = st.look ?? {};
  // frozen ground off the boards
  const g = ctx.createLinearGradient(0, FLOOR + 40, 0, H);
  g.addColorStop(0, 'rgba(92,84,68,.34)'); g.addColorStop(1, 'rgba(60,54,44,.5)');
  ctx.fillStyle = g; ctx.fillRect(0, FLOOR + 40, W, H - FLOOR - 40);
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
}

/* The banners on their poles behind the boards: 大比 · 沉鼎, swaying. */
function banners(ctx, t, look = {}) {
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
  for (let i = 0, x = 4; x < W; i += 1, x += 22) {
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
function effects(ctx, s) {
  for (const f of s.fx) {
    const age = s.t - f.at, x = f.x, y = FLOOR - f.y;
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
  for (const x of s.shots) {
    const px = x.x, py = FLOOR - x.y, d = Math.sign(x.vx);
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
  ctx.textBaseline = 'middle';
  ctx.font = `600 15px ${SERIF}`;
  const name = (n, b) => `${say(n, lang)} · ${say(b, lang)}`;
  const tl = name(me.name, me.bar), tr = name(foe.name, foe.bar);
  const wl = ctx.measureText(tl).width + 22, wr = ctx.measureText(tr).width + 22;
  plate(ctx, 82, 12, wl, 23); plate(ctx, W - 82 - wr, 12, wr, 23);
  ctx.fillStyle = '#f1e6cf'; ctx.textAlign = 'left'; ctx.fillText(tl, 93, 24);
  ctx.textAlign = 'right'; ctx.fillText(tr, W - 93, 24);
  ctx.font = `700 11px ${SERIF}`; ctx.fillStyle = '#e7c06a';
  const stocks = (q) => Math.floor((q ?? 0) / 100), full = say(lv.words?.full, lang) || '绝';
  if (stocks(s.me.qi)) { ctx.textAlign = 'left'; ctx.fillText(`${full} ×${stocks(s.me.qi)}`, 86 + BW * 0.62 + 8, 64); }
  if (stocks(s.foe.qi)) { ctx.textAlign = 'right'; ctx.fillText(`${full} ×${stocks(s.foe.qi)}`, W - 86 - BW * 0.62 - 8, 64); }
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
  ring(96, say(me.specialName, lang) || '火', 1 - s.me.cd / s.R.me.special.cd);
  ring(120, say(lv.words?.palmfire, lang)?.[0] || '掌', 1 - (s.me.cdPf ?? 0) / s.R.me.palmfire.cd);
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

function cueMark(ctx, s, lang) {
  const c = s.cue;
  if (!c) return;
  const word = say(s.level?.cues?.[c.k], lang) || (c.k === 'ying' ? '迎' : '勾');
  const age = s.t - c.at, k = Math.min(1, age / 140), x = s.me.x, y = FLOOR - 240;
  ctx.save();
  ctx.globalAlpha = 1 - Math.max(0, age - 600) / 300;
  ctx.fillStyle = 'rgba(178,34,24,.92)';
  ctx.beginPath(); ctx.arc(x, y, 30 * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f6eedc'; ctx.font = `700 ${Math.round(34 * (0.6 + 0.4 * k))}px ${SERIF}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(word, x, y + 1);
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

/* The 绝's cut-in: a band of ink across the field, the face, the move's name in a big brush. */
function cutIn(ctx, c, img, lang, age) {
  const k = Math.min(1, age / 160), out = age > 700 ? Math.min(1, (age - 700) / 200) : 0, mine = c.who === 'me';
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.fillStyle = 'rgba(12,10,8,.55)'; ctx.fillRect(0, 0, W, H);
  ctx.translate(mine ? -W * (1 - k) : W * (1 - k), 0);
  ctx.fillStyle = mine ? '#1d1712' : '#14202a';
  ctx.beginPath(); ctx.moveTo(0, 180); ctx.lineTo(W, 140); ctx.lineTo(W, 330); ctx.lineTo(0, 370); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = mine ? '#c2481f' : '#5fbf98'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(0, 176); ctx.lineTo(W, 136); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 374); ctx.lineTo(W, 334); ctx.stroke();
  if (img?.complete && img.naturalWidth) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 180); ctx.lineTo(W, 140); ctx.lineTo(W, 330); ctx.lineTo(0, 370); ctx.closePath(); ctx.clip();
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
export function painter(canvas, { art = {} } = {}) {
  const ctx = canvas.getContext('2d');
  let layers = null, layersFor = null;
  const eased = { me: null, foe: null }, sway = { me: 0, foe: 0 };
  const view = { ghostMe: 1, ghostFoe: 1, chain: null, now: 0, lift: 0, trail: [], cut: null, cutAt: 0 };
  let shake = 0, lastBig = 0, lastHit = 0, last = 0;
  return function draw(s, lang = 'zh', text = '') {
    const w = canvas.width, h = canvas.height, k = w / W, now = globalThis.performance?.now?.() ?? Date.now();
    const dtf = last ? Math.min(3, (now - last) / 16.7) : 1;
    last = now; view.now = now;
    if (layersFor !== `${w}x${h}`) {
      const make = (lw, paint) => layer(Math.round(lw * k), h, (c) => { c.setTransform(k, 0, 0, k, 0, 0); paint(c); });
      layers = {
        sky: make(W, (c) => paintSky(c, s.level?.stage?.look)),
        far: make(W + 120, paintFar), near: make(W + 120, paintNear),
        stage: make(W, (c) => paintStage(c, s.R.stage)),
      };
      layersFor = `${w}x${h}`;
    }
    const mid = (s.me.x + s.foe.x) / 2 - W / 2;
    // a heavy blow shakes the paper and lifts the crowd
    const big = (s.snd.heavy ?? 0) + (s.snd.hook ?? 0) + (s.snd.palm ?? 0) + (s.snd.super ?? 0) + (s.snd.knock ?? 0);
    const hits = (s.snd.hit ?? 0) + big;
    if (big > lastBig) { shake = 9; view.lift = 1; }
    if (hits > lastHit) view.lift = Math.max(view.lift, 0.5);
    lastBig = big; lastHit = hits;
    shake *= Math.pow(0.85, dtf);
    view.lift *= Math.pow(0.95, dtf);
    const ox = shake > 0.3 ? Math.sin(now / 17) * shake : 0, oy = shake > 0.3 ? Math.cos(now / 23) * shake * 0.5 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layers.sky, 0, 0);
    ctx.drawImage(layers.far, Math.round((-60 - mid * 0.04) * k), 0);
    ctx.drawImage(layers.near, Math.round((-60 - mid * 0.09) * k), 0);
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
    banners(ctx, s.t, s.level?.stage?.look);
    ctx.setTransform(1, 0, 0, 1, ox * k, oy * k);
    ctx.drawImage(layers.stage, 0, 0);
    ctx.setTransform(k, 0, 0, k, ox * k, oy * k);
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
    const tip = figure(ctx, s.foe.x, foeY, s.foe.face, fp, foeLook, { t: s.t, qi, glow, sway: sway.foe, breath: breath(s.t + 300), scabbard: !palm && !s.hooked && !s.end, noShadow: s.foe.y < 0, inv });
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
    const casting = ['special', 'palmfire', 'super'].includes(s.me.act?.k) ? 1 : 0;
    figure(ctx, s.me.x, meY, s.me.face, mp, meLook, { t: s.t, fire: casting, sway: sway.me, breath: s.me.act || s.me.air ? 0 : breath(s.t), floorAt: s.me.y, inv });
    effects(ctx, s);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    crowd(ctx, s.t, view.lift);
    // the bars' ghosts fall behind the bars
    view.ghostMe = Math.max(s.me.hp / s.R.me.hp, view.ghostMe - 0.006 * dtf);
    view.ghostFoe = Math.max(s.foe.bal / s.R.foe.bal, view.ghostFoe - 0.006 * dtf);
    view.t = s.t;
    if (s.combo?.n >= 2 && s.combo.who === 'me') view.chain = { n: s.combo.n, at: view.chain?.n === s.combo.n ? view.chain.at : s.t };
    hud(ctx, s, art, lang, view);
    chain(ctx, view, lang, say(lv.words?.chain, lang) || '连');
    cueMark(ctx, s, lang);
    if (s.end) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 560);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,8,6,.45)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    lineBand(ctx, text);
    if (s.end) seal(ctx, say(s.end.kind === 'out' ? lv.seal?.won : lv.seal?.lost, lang) || (s.end.kind === 'out' ? '胜' : '负'), s.t - s.end.at - 300);
    // the 绝: its cut-in plays on the page's clock (the bout's is held through it)
    if (s.cutin && s.cutin !== view.cut) { view.cut = s.cutin; view.cutAt = now; }
    if (view.cut && now - view.cutAt < 900) cutIn(ctx, view.cut, view.cut.who === 'me' ? art.me : art.foe, lang, now - view.cutAt);
  };
}
