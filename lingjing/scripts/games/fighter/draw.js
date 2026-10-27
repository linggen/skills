// fighter/draw.js — 格斗's picture: ink shadow-puppets (皮影) on a paper stage, drawn on one canvas. Procedural on
// purpose: every frame of a fighter is the same few strokes on one skeleton, so a pose is a handful of angles
// (POSES), eased into from the last — no painted frames to keep consistent. A level dresses its fighters by data
// (`me.look`, `foe.look`: ink, robe, hair, weapon) and its stage (`stage.look`). Nothing here plays: it reads a state.

const W = 960, H = 540, FLOOR = 432;
export const FIELD = { w: W, h: H, floor: FLOOR };

/* The skeleton (units): thigh, shin, torso, neck, head radius, upper arm, forearm. */
const BONE = { thigh: 44, shin: 44, torso: 58, neck: 8, head: 14, upper: 32, fore: 30 };

/* Poses: lean (torso, degrees forward), head tilt, and each limb as [upper, lower] — angles from straight down,
   positive toward the way it faces. `drop` lowers the hips (a crouch, a sit). */
const P = (lean, legF, legB, armF, armB, o = {}) => ({ lean, legF, legB, armF, armB, head: o.head ?? 0, drop: o.drop ?? 0 });
export const POSES = {
  idle: P(4, [20, 4], [-16, -6], [36, 92], [22, 74]),
  walkA: P(6, [30, 8], [-26, -14], [32, 86], [26, 70]),
  walkB: P(6, [-6, -18], [10, 2], [40, 96], [16, 64]),
  air: P(8, [70, 14], [26, -40], [40, 110], [10, 60], { drop: -6 }),
  light: P(12, [24, 6], [-22, -8], [86, 90], [14, 60]),
  lightUp: P(10, [22, 6], [-18, -8], [40, 60], [20, 70]),
  heavy: P(-12, [82, 88], [-10, -2], [44, 70], [-36, -10], { drop: 18 }),
  heavyUp: P(-4, [40, 20], [-12, -4], [34, 80], [10, 50], { drop: 8 }),
  block: P(-6, [16, 2], [-24, -10], [64, 160], [46, 150], { head: -6 }),
  hit: P(-22, [14, 0], [-30, -16], [-20, 10], [-46, -14], { head: -18 }),
  down: P(-16, [86, 70], [70, 60], [-30, -20], [-50, -40], { drop: 50, head: -10 }),
  cast: P(10, [26, 6], [-20, -8], [80, 84], [-30, 0]),
  ying: P(34, [44, 10], [-40, -20], [64, 70], [40, 90], { drop: 10 }),
  // hers
  guard: P(4, [18, 4], [-18, -8], [50, 78], [12, 22]),
  pokeUp: P(-2, [18, 4], [-20, -8], [22, 6], [12, 22]),
  poke: P(14, [30, 8], [-24, -10], [86, 90], [8, 18]),
  thrustUp: P(-10, [30, 30], [-30, -20], [4, -24], [16, 28], { drop: 14 }),
  thrust: P(30, [52, 12], [-44, -20], [88, 90], [-10, 10], { drop: 8 }),
  ice: P(2, [18, 4], [-18, -8], [44, 72], [96, 150]),
  edge: P(8, [22, 6], [-22, -8], [88, 92], [10, 22]),
  glow: P(6, [20, 4], [-20, -8], [-34, -14], [62, 104]),
  hold: P(-16, [24, 10], [-12, -26], [-30, -10], [56, 96], { drop: 10, head: -8 }),
  strike: P(18, [28, 6], [-24, -10], [-20, -4], [88, 92]),
  sblock: P(-4, [16, 4], [-24, -10], [44, 124], [10, 22]),
  slip: P(-46, [70, 74], [30, 10], [-60, -90], [100, 140], { drop: 0, head: -20 }),
  stand: P(0, [10, 0], [-10, 0], [20, 10], [10, 6]),
};

const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, k) => a + (b - a) * k;
const lerpPose = (a, b, k) => ({
  lean: lerp(a.lean, b.lean, k), head: lerp(a.head, b.head, k), drop: lerp(a.drop, b.drop, k),
  legF: [lerp(a.legF[0], b.legF[0], k), lerp(a.legF[1], b.legF[1], k)], legB: [lerp(a.legB[0], b.legB[0], k), lerp(a.legB[1], b.legB[1], k)],
  armF: [lerp(a.armF[0], b.armF[0], k), lerp(a.armF[1], b.armF[1], k)], armB: [lerp(a.armB[0], b.armB[0], k), lerp(a.armB[1], b.armB[1], k)],
});

/* What pose a body takes this instant, from the state. */
function mePose(s) {
  const me = s.me, t = s.t;
  if (s.end?.kind === 'down') return 'down';
  if (me.stun > t && !me.guard) return 'hit';
  if (me.act?.k === 'ying') return 'ying';
  if (me.act) {
    const e = t - me.act.at, m = me.act.m;
    if (me.act.k === 'special') return 'cast';
    const up = e < m.startup;
    if (me.act.k === 'light') return up ? 'lightUp' : e < m.startup + m.active + 60 ? 'light' : 'lightUp';
    if (me.act.k === 'heavy') return up ? 'heavyUp' : e < m.startup + m.active + 120 ? 'heavy' : 'heavyUp';
  }
  if (me.air) return 'air';
  if (me.guard) return 'block';
  if (Math.abs(me.vx) > 20) return (Math.floor(t / 180) % 2) ? 'walkA' : 'walkB';
  return 'idle';
}
function foePose(s) {
  const foe = s.foe, t = s.t;
  if (s.end?.kind === 'out') return foe.x < (s.R.stage.left - 4) ? 'stand' : 'slip';
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
  }
  if (Math.abs(foe.vx) > 20 && foe.stun <= t) return (Math.floor(t / 200) % 2) ? 'walkA' : 'walkB';
  return 'guard';
}

/* ── Paper and stage, painted once a size ── */
function paintBack(ctx, look = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, look.sky ?? '#f1e9d6');
  g.addColorStop(1, look.paper ?? '#e4d6b8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // far hills in wash
  ctx.fillStyle = 'rgba(60,58,50,.10)';
  ctx.beginPath(); ctx.moveTo(0, 300);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x, 270 - 50 * Math.sin(x / 150) - 26 * Math.sin(x / 61 + 1));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  ctx.fillStyle = 'rgba(40,38,32,.14)';
  ctx.beginPath(); ctx.moveTo(0, 340);
  for (let x = 0; x <= W; x += 30) ctx.lineTo(x, 320 - 26 * Math.sin(x / 90 + 2) - 12 * Math.sin(x / 33));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // the temple's roof far behind (沉鼎观)
  ctx.fillStyle = 'rgba(30,28,24,.16)';
  ctx.beginPath(); ctx.moveTo(610, 262); ctx.quadraticCurveTo(700, 238, 790, 262); ctx.lineTo(770, 252); ctx.lineTo(630, 252); ctx.fill();
  ctx.fillRect(650, 262, 120, 40);
}

function paintStage(ctx, st) {
  const L = st.left, R = st.right, look = st.look ?? {};
  // frozen ground off the boards
  ctx.fillStyle = look.ground ?? 'rgba(70,64,52,.28)';
  ctx.fillRect(0, FLOOR + 62, W, H - FLOOR - 62);
  // the boards: a slab of 青石 with its front face
  ctx.fillStyle = look.top ?? '#8f9690';
  ctx.fillRect(L, FLOOR, R - L, 10);
  ctx.fillStyle = look.face ?? '#5d635e';
  ctx.fillRect(L, FLOOR + 10, R - L, 52);
  ctx.strokeStyle = 'rgba(20,20,18,.55)'; ctx.lineWidth = 2;
  ctx.strokeRect(L, FLOOR, R - L, 62);
  ctx.strokeStyle = 'rgba(20,20,18,.25)'; ctx.lineWidth = 1;
  for (let x = L + 70; x < R; x += 88) { ctx.beginPath(); ctx.moveTo(x, FLOOR + 10); ctx.lineTo(x + 4, FLOOR + 62); ctx.stroke(); }
  // the slick (那摊红油), pepper grains stuck in it
  if (st.oil) {
    const a = st.oil.from, b = st.oil.to;
    ctx.fillStyle = look.oil ?? 'rgba(168,44,32,.62)';
    ctx.beginPath(); ctx.ellipse((a + b) / 2, FLOOR + 4, (b - a) / 2, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(30,10,6,.7)';
    for (let i = 0; i < 9; i += 1) { ctx.beginPath(); ctx.arc(a + 10 + ((i * 37) % (b - a - 16)), FLOOR + 2 + (i % 3) * 2, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }
  // the crowd below the boards' front: heads, close
  ctx.fillStyle = 'rgba(25,23,20,.5)';
  for (let x = 6; x < W; x += 23) {
    const y = FLOOR + 84 + ((x * 7) % 13);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x - 12, y + 6, 24, 40);
  }
}

/* ── A body ── */
function limb(ctx, x, y, a1, a2, l1, l2, w1, w2, color) {
  const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
  const fx = kx + Math.sin(a2) * l2, fy = ky + Math.cos(a2) * l2;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = w1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.lineWidth = w2; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
  return { kx, ky, fx, fy };
}

/* One fighter at (x, feet y), facing `face`, in pose `p`, dressed by `look`. Answers where its hands are. */
function figure(ctx, x, y, face, p, look, extra = {}) {
  const ink = look.ink ?? '#1c1a16', robe = look.robe ?? '#3b342b';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  const legH = (a) => BONE.thigh * Math.cos(rad(a[0])) + BONE.shin * Math.cos(rad(a[1]));
  const hip = Math.max(legH(p.legF), legH(p.legB), 30) - p.drop;
  // up is -y on the canvas; the bones hang down from the hip, so angles keep their sense with y flipped below
  const hy = -hip;
  // shadow on the boards
  if (!extra.noShadow) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0, extra.floorAt ?? 0, 34 - Math.min(16, (extra.floorAt ?? 0) / 8), 6, 0, 0, Math.PI * 2); ctx.fill(); }
  const lean = rad(p.lean);
  const sx = Math.sin(lean) * BONE.torso, sy = hy - Math.cos(lean) * BONE.torso;
  // back limbs first (a shade lighter, as a 皮影's far side)
  const far = look.far ?? '#3a362f';
  const lb = limb(ctx, 0, hy, rad(p.legB[0]), rad(p.legB[1]), BONE.thigh, BONE.shin, 13, 10, far);
  const ab = limb(ctx, sx * 0.92, sy + 4, rad(p.armB[0]), rad(p.armB[1]), BONE.upper, BONE.fore, 10, 8, far);
  // robe: shoulders to the hem by the knees
  const lf = { kx: Math.sin(rad(p.legF[0])) * BONE.thigh, ky: hy + Math.cos(rad(p.legF[0])) * BONE.thigh };
  const hem = look.hem ?? 0.9;
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(sx - 12, sy + 2);
  ctx.lineTo(sx + 12, sy + 2);
  ctx.lineTo(Math.max(lf.kx, lb.kx) * hem + 14, Math.max(lf.ky, lb.ky) * hem + hy * (1 - hem) + 6);
  ctx.quadraticCurveTo(0, Math.max(lf.ky, lb.ky) + 10, Math.min(lf.kx, lb.kx) * hem - 14, Math.max(lf.ky, lb.ky) * hem + hy * (1 - hem) + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
  // sash
  if (look.sash) { ctx.strokeStyle = look.sash; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(sx * 0.15 - 12, hy - 6); ctx.quadraticCurveTo(-26, hy + 4, -40 - Math.abs(p.lean) * 0.4, hy + 18); ctx.stroke(); }
  // front leg, torso
  limb(ctx, 0, hy, rad(p.legF[0]), rad(p.legF[1]), BONE.thigh, BONE.shin, 14, 11, ink);
  ctx.strokeStyle = ink; ctx.lineWidth = 17; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(sx, sy); ctx.stroke();
  // head
  const head = rad(p.lean + p.head);
  const hx = sx + Math.sin(head) * (BONE.neck + BONE.head), hyy = sy - Math.cos(head) * (BONE.neck + BONE.head);
  ctx.fillStyle = ink;
  ctx.beginPath(); ctx.ellipse(hx, hyy, BONE.head * 0.86, BONE.head, head, 0, Math.PI * 2); ctx.fill();
  if (look.hair === 'bun') { ctx.beginPath(); ctx.arc(hx - Math.sin(head + 0.5) * 2 - 6, hyy - 13, 6, 0, Math.PI * 2); ctx.fill(); }
  if (look.hair === 'tail') {
    ctx.strokeStyle = ink; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(hx - 8, hyy - 8); ctx.quadraticCurveTo(hx - 30, hyy - 4 + Math.sin(extra.t / 260) * 4, hx - 36, hyy + 26); ctx.stroke();
    if (look.ribbon) { ctx.strokeStyle = look.ribbon; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 10, hyy - 9); ctx.quadraticCurveTo(hx - 24, hyy - 16, hx - 30 + Math.sin(extra.t / 200) * 5, hyy - 4); ctx.stroke(); }
  }
  // front arm, and what it holds
  const af = limb(ctx, sx, sy + 4, rad(p.armF[0]), rad(p.armF[1]), BONE.upper, BONE.fore, 11, 9, ink);
  if (look.weapon === 'sword' && !extra.noSword) {
    const a = rad(p.armF[1]), len = 96;
    const tx = af.fx + Math.sin(a) * len, ty = af.fy + Math.cos(a) * len;
    ctx.strokeStyle = look.blade ?? '#d8dde0'; ctx.lineWidth = 3.4; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(af.fx, af.fy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(af.fx - Math.cos(a) * 7, af.fy + Math.sin(a) * 7); ctx.lineTo(af.fx + Math.cos(a) * 7, af.fy - Math.sin(a) * 7); ctx.stroke();
    if (extra.qi) { ctx.strokeStyle = `rgba(90,190,150,${extra.qi})`; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.sin(a) * 90, ty + Math.cos(a) * 90); ctx.stroke(); }
  }
  if (look.weapon === 'sword' && extra.scabbard) {
    const a = rad(p.armB[1]);
    ctx.strokeStyle = look.scabbard ?? '#4a3826'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ab.fx - Math.sin(a) * 12, ab.fy - Math.cos(a) * 12); ctx.lineTo(ab.fx + Math.sin(a) * 60, ab.fy + Math.cos(a) * 60); ctx.stroke();
  }
  // the green palm
  if (extra.glow) {
    const gx = ab.fx, gy = ab.fy, r = 22 + 30 * extra.glow;
    const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, r);
    g.addColorStop(0, `rgba(170,255,210,${0.95 * extra.glow})`);
    g.addColorStop(0.4, `rgba(80,200,150,${0.6 * extra.glow})`);
    g.addColorStop(1, 'rgba(80,200,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
  }
  if (extra.fire) {
    const g = ctx.createRadialGradient(af.fx, af.fy, 1, af.fx, af.fy, 20);
    g.addColorStop(0, 'rgba(255,220,120,.95)'); g.addColorStop(1, 'rgba(220,70,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(af.fx, af.fy, 20, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* ── Effects ── */
function splat(ctx, x, y, age, id, big) {
  const k = age / 460;
  if (k >= 1) return;
  ctx.fillStyle = `rgba(18,16,14,${0.85 * (1 - k)})`;
  const r = (big ? 22 : 12) * (0.6 + k * 0.8);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < (big ? 9 : 6); i += 1) {
    const a = ((id * 97 + i * 53) % 360) * Math.PI / 180, d = r * (1.3 + ((id + i * 7) % 5) * 0.35) * (0.6 + k);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.16 + ((i * 3 + id) % 4) * 0.05), 0, Math.PI * 2); ctx.fill();
  }
}
function effects(ctx, s) {
  for (const f of s.fx) {
    const age = s.t - f.at, x = f.x, y = FLOOR - f.y;
    if (f.kind === 'ink' || f.kind === 'cut') splat(ctx, x, y, age, f.id, f.big || f.kind === 'cut');
    if (f.kind === 'cut' && age < 400) { ctx.strokeStyle = `rgba(140,24,18,${1 - age / 400})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 40, y - 20); ctx.lineTo(x + 40, y + 16); ctx.stroke(); }
    if (f.kind === 'spark' && age < 260) {
      ctx.strokeStyle = `rgba(60,60,60,${1 - age / 260})`; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) { const a = (i / 5) * Math.PI * 2 + f.id; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.lineTo(x + Math.cos(a) * (14 + age / 12), y + Math.sin(a) * (14 + age / 12)); ctx.stroke(); }
    }
    if (f.kind === 'qi' && age < 220) {
      ctx.strokeStyle = `rgba(90,190,150,${0.7 * (1 - age / 220)})`; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(f.to, y + 2); ctx.stroke();
    }
    if (f.kind === 'glow' && age < 500) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 60);
      g.addColorStop(0, `rgba(170,255,210,${0.9 * (1 - age / 500)})`); g.addColorStop(1, 'rgba(80,200,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 60, 0, Math.PI * 2); ctx.fill();
    }
    if (f.kind === 'steam' && age < 600) {
      ctx.fillStyle = `rgba(250,250,250,${0.7 * (1 - age / 600)})`;
      for (let i = 0; i < 4; i += 1) { ctx.beginPath(); ctx.arc(x + (i - 1.5) * 12, y - age / 20 - i * 4, 10 + age / 60, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  for (const x of s.shots) {
    const px = x.x, py = FLOOR - x.y;
    if (x.kind === 'ice') {
      const d = Math.sign(x.vx);
      ctx.fillStyle = 'rgba(200,232,248,.95)'; ctx.strokeStyle = 'rgba(40,70,90,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px + d * 22, py); ctx.lineTo(px - d * 14, py - 5); ctx.lineTo(px - d * 14, py + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      const fl = 10 + Math.sin(s.t / 40 + x.id) * 3;
      const g = ctx.createRadialGradient(px, py, 1, px, py, fl + 8);
      g.addColorStop(0, 'rgba(255,230,140,1)'); g.addColorStop(0.5, 'rgba(230,90,30,.9)'); g.addColorStop(1, 'rgba(120,20,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, fl + 8, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ── The bars, the incense, the cue, the line ── */
const say = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.zh ?? '' : x ?? '');
function bar(ctx, x, w, frac, color, right) {
  ctx.fillStyle = 'rgba(20,18,15,.75)';
  ctx.fillRect(x - 3, 30, w + 6, 20);
  ctx.fillStyle = 'rgba(240,230,210,.5)';
  ctx.fillRect(x, 33, w, 14);
  ctx.fillStyle = color;
  const f = Math.max(0, Math.min(1, frac)) * w;
  ctx.fillRect(right ? x + w - f : x, 33, f, 14);
}
function hud(ctx, s, art, lang) {
  const lv = s.level ?? {}, me = lv.me ?? {}, foe = lv.foe ?? {};
  const BW = 330;
  bar(ctx, 76, BW, s.me.hp / s.R.me.hp, me.look?.bar ?? '#9a2c21', false);
  bar(ctx, W - 76 - BW, BW, s.foe.bal / s.R.foe.bal, foe.look?.bar ?? '#3e8068', true);
  ctx.fillStyle = '#1c1a16';
  ctx.font = '600 20px "Songti SC","STSong","Noto Serif SC",serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(`${say(me.name, lang)}  ${say(me.bar, lang)}`, 78, 24);
  ctx.textAlign = 'right';
  ctx.fillText(`${say(foe.bar, lang)}  ${say(foe.name, lang)}`, W - 78, 24);
  for (const [img, cx] of [[art.me, 40], [art.foe, W - 40]]) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, 40, 30, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#d8ccb0'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#1c1a16'; ctx.stroke();
    ctx.clip();
    if (img?.complete && img.naturalWidth) { const k = 74 / Math.min(img.naturalWidth, img.naturalHeight * 0.75); ctx.drawImage(img, cx - (img.naturalWidth * k) / 2, 10, img.naturalWidth * k, img.naturalHeight * k); }
    ctx.restore();
  }
  // the special's readiness, under his bar
  const sp = s.R.me.special, ready = 1 - s.me.cd / sp.cd;
  ctx.fillStyle = ready >= 1 ? '#b8401f' : 'rgba(60,50,40,.45)';
  ctx.beginPath(); ctx.moveTo(90, 66); ctx.arc(90, 66, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ready)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1c1a16'; ctx.font = '600 15px "Songti SC","STSong",serif'; ctx.textAlign = 'left';
  ctx.fillText(say(me.specialName, lang), 106, 72);
  // the incense (the bout's clock, burning down) and her count of moves
  const total = lv.time ?? 120000, left = Math.max(0.06, 1 - s.t / total);
  const ix = W / 2, top = 18, len = 64;
  ctx.fillStyle = '#6b4b2a'; ctx.fillRect(ix - 2, top + len * (1 - left), 4, len * left);
  ctx.fillStyle = '#e24a1b'; ctx.beginPath(); ctx.arc(ix, top + len * (1 - left), 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,80,80,.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); const sy0 = top + len * (1 - left);
  ctx.moveTo(ix, sy0); ctx.bezierCurveTo(ix + 8, sy0 - 10, ix - 8, sy0 - 20, ix + 4 + Math.sin(s.t / 500) * 4, sy0 - 34); ctx.stroke();
  ctx.fillStyle = '#4a4034'; ctx.fillRect(ix - 14, top + len, 28, 7);
  ctx.textAlign = 'center'; ctx.font = '600 14px "Songti SC","STSong",serif'; ctx.fillStyle = '#1c1a16';
  const count = lv.count?.[lang] ?? lv.count?.zh;
  if (count) ctx.fillText(count.replace('{n}', String(s.foe.moves)), ix, top + len + 24);
}

function cueMark(ctx, s, lang) {
  const c = s.cue;
  if (!c) return;
  const word = say(s.level?.cues?.[c.k], lang) || (c.k === 'ying' ? '迎' : '勾');
  const age = s.t - c.at, k = Math.min(1, age / 140), x = s.me.x, y = FLOOR - 230;
  ctx.save();
  ctx.globalAlpha = 1 - Math.max(0, age - 600) / 300;
  ctx.fillStyle = 'rgba(178,34,24,.9)';
  ctx.beginPath(); ctx.arc(x, y, 30 * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f6eedc'; ctx.font = `700 ${Math.round(34 * (0.6 + 0.4 * k))}px "Songti SC","STSong","Noto Serif SC",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(word, x, y + 1);
  ctx.restore();
}

function lineBand(ctx, s, lang, text) {
  if (!text) return;
  ctx.save();
  ctx.font = '500 22px "Songti SC","STSong","Noto Serif SC",serif';
  const w = Math.min(W - 40, ctx.measureText(text).width + 40);
  ctx.fillStyle = 'rgba(246,238,220,.88)';
  ctx.fillRect((W - w) / 2, H - 44, w, 34);
  ctx.fillStyle = '#1c1a16'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H - 27, W - 60);
  ctx.restore();
}

function seal(ctx, word, age) {
  if (age < 0) return;
  const k = Math.min(1, age / 220);
  ctx.save();
  ctx.translate(W / 2, 200);
  ctx.rotate(-0.08);
  ctx.scale(1.6 - 0.6 * k, 1.6 - 0.6 * k);
  ctx.globalAlpha = k;
  ctx.fillStyle = '#b3261e';
  ctx.fillRect(-46, -46, 92, 92);
  ctx.fillStyle = '#f6eedc'; ctx.font = '700 62px "Songti SC","STSong",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(word, 0, 4);
  ctx.restore();
}

/** A painter for one canvas: `draw(state, lang, text)` each frame; the poses ease from the last. */
export function painter(canvas, { art = {} } = {}) {
  const ctx = canvas.getContext('2d');
  const back = canvas.ownerDocument.createElement('canvas');
  let backFor = null;
  const eased = { me: null, foe: null };
  let shake = 0, lastBig = 0;
  return function draw(s, lang = 'zh', text = '') {
    const w = canvas.width, h = canvas.height, k = w / W;
    if (backFor !== `${w}x${h}`) {
      back.width = w; back.height = h;
      const b = back.getContext('2d');
      b.setTransform(k, 0, 0, k, 0, 0);
      paintBack(b, s.level?.stage?.look);
      paintStage(b, s.R.stage);
      backFor = `${w}x${h}`;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(back, 0, 0);
    // a heavy blow shakes the paper a little
    const big = (s.snd.heavy ?? 0) + (s.snd.hook ?? 0) + (s.snd.palm ?? 0);
    if (big > lastBig) shake = 7;
    lastBig = big;
    shake *= 0.86;
    const ox = shake > 0.3 ? Math.sin(s.t / 17) * shake : 0;
    ctx.setTransform(k, 0, 0, k, ox * k, 0);
    const toward = (a) => POSES[a];
    const ease = (who, name) => { const target = toward(name); eased[who] = eased[who] ? lerpPose(eased[who], target, 0.38) : target; return eased[who]; };
    const lv = s.level ?? {};
    const meLook = { hair: 'bun', ...(lv.me?.look ?? {}) }, foeLook = { hair: 'tail', weapon: 'sword', ...(lv.foe?.look ?? {}) };
    const fp = ease('foe', foePose(s)), mp = ease('me', mePose(s));
    const fa = s.foe.act, palm = s.palm;
    const qi = fa && (fa.k === 'poke' || fa.k === 'thrust') && s.t - fa.at >= fa.m.startup && s.t - fa.at < fa.m.startup + fa.m.active + 80 ? 0.6 : s.edge ? 0.35 : 0;
    const glow = palm ? (palm.phase === 'glow' ? Math.min(1, (s.t - palm.at) / 500) : palm.phase === 'hold' ? 0.55 : palm.phase === 'strike' ? 0.4 : 0.12) : 0;
    const foeY = FLOOR - (s.foe.y ?? 0), meY = FLOOR - s.me.y;
    figure(ctx, s.foe.x, foeY, s.foe.face, fp, foeLook, { t: s.t, qi, glow, scabbard: !palm && !s.hooked && !s.end, floorAt: 0, noShadow: s.foe.y < 0 });
    figure(ctx, s.me.x, meY, s.me.face, mp, meLook, { t: s.t, fire: s.me.act?.k === 'special', floorAt: s.me.y });
    effects(ctx, s);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    hud(ctx, s, art, lang);
    cueMark(ctx, s, lang);
    lineBand(ctx, s, lang, text);
    if (s.end) seal(ctx, say(s.end.kind === 'out' ? lv.seal?.won : lv.seal?.lost, lang) || (s.end.kind === 'out' ? '胜' : '负'), s.t - s.end.at - 300);
  };
}
