// shoulu/draw.js — 守炉's painting: the board (paper, road, decor), the furnace, the talismans, the
// beasts, 银月, the shots and the marks. 银月 is painted (comic frames, tools/paint-shoulu.py); the rest is still
// code-drawn, a stopgap: the small games go comic (Angry-Birds cartoon) — every figure here is one function, so a
// sprite can replace it alone.
// Pure canvas: it reads the game (core.js) and never changes it.
import { BEASTS, HERO, SKILLS, TOWERS, W, H, posOnPath, offRoad, cleared, waves, lightOf } from './core.js';

export const INK = '#2a241d';
const LVNAME = { zh: ['一重', '二重', '三重'], en: ['I', 'II', 'III'] };

// The board's pictures (2026-10-20, Hanli: 「代码画的都查一下, 用flux画吧」): the beasts are 守墙's comic frames packed on
// art/beasts.webp (+ FLUX's second steps), the talismans, the 丹炉, the ground of each map and its pines / rocks /
// bushes painted by the local FLUX (tools/paint-shoulu-flux.py). Each draw falls back to its code figure while a
// picture loads or if it fails; the road stays drawn from the level's data, on the painted ground.
const ART = { cells: null, beasts: null, img: {} };
const okImg = (im) => im && im.complete && im.naturalWidth > 0;
function artImg(doc, name, then) {
  let im = ART.img[name];
  if (!im) { im = ART.img[name] = doc.createElement('img'); im.src = new URL(`./art/${name}.webp`, import.meta.url).href; }
  if (then && !okImg(im)) im.addEventListener('load', then, { once: true });
  return im;
}
function loadBoardArt(doc) {
  if (ART.beasts) return;
  ART.beasts = doc.createElement('img');
  fetch(new URL('./art/beasts.json', import.meta.url)).then((r) => r.json()).then((m) => {
    ART.cells = m.cells; ART.beasts.src = new URL('./art/beasts.webp', import.meta.url).href;
  }).catch(() => {});
  artImg(doc, 'furnace');
  for (const k of Object.keys(TOWERS)) for (let lv = 1; lv <= 3; lv += 1) artImg(doc, `tower-${k}-${lv}`);
}

function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/** The board under everything, painted once a level: paper, hills, grass, rocks and pines off the road, the road. */
export function makePaper(doc, L, label) {
  if (L.fire) loadFireArt(doc);
  if (L.keep) artImg(doc, L.keep); // a story level's kept one, drawn where the furnace stands (坑底: 孙二狗)
  const k = 2, p = doc.createElement('canvas');
  p.width = W * k; p.height = H * k;
  const pics = ['pine', 'rock', 'bush', `ground-${L.ground ?? L.id}`]; // `ground`: another level's painting (the 秘境's rows)
  const paint = () => {
    const ready = pics.map((n) => artImg(doc, n)).every(okImg);
    const c = p.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, W, H);
    paintBoard(c, L, label, ready ? Object.fromEntries(pics.map((n) => [n.startsWith('ground') ? 'ground' : n, ART.img[n]])) : null);
  };
  let left = pics.length;
  pics.forEach((n) => artImg(doc, n, () => { left -= 1; if (left <= 0 || pics.every((m) => okImg(ART.img[m]))) paint(); }));
  paint();
  return p;
}
function paintBoard(c, L, label, art) {
  const r = rnd(7 + L.road.points.length * 13);
  if (art) c.drawImage(art.ground, 0, 0, W, H);
  const gr = c.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, L.paper?.[0] ?? '#f4ecda'); gr.addColorStop(1, L.paper?.[1] ?? '#efe4cc');
  if (!art) c.fillStyle = gr, c.fillRect(0, 0, W, H);
  for (let i = 0; i < (art ? 0 : 900); i += 1) {
    c.strokeStyle = `rgba(120,95,60,${0.03 + r() * 0.05})`; c.lineWidth = 0.5;
    const x = r() * W, y = r() * H, a = r() * 6.28, l = 2 + r() * 8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  const rr = rnd(3);
  const mg = c.createLinearGradient(0, 0, 0, 70);
  mg.addColorStop(0, 'rgba(60,100,120,0)'); mg.addColorStop(1, 'rgba(60,100,120,0.16)');
  c.fillStyle = mg; c.beginPath(); c.moveTo(0, 62);
  for (let x = 0; x <= W; x += 40) c.lineTo(x, 30 + rr() * 28);
  c.lineTo(W, 62); c.closePath(); c.fill();
  const free = (x, y, m) => offRoad(L.road, x, y) > m && L.spots.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > (m > 40 ? 60 : 34)) && Math.hypot(L.furn.x - x, L.furn.y - y) > 60;
  for (let i = 0; i < (art ? 0 : 160); i += 1) {
    const x = r() * W, y = 70 + r() * (H - 70);
    if (!free(x, y, 30)) continue;
    c.strokeStyle = `rgba(70,90,60,${0.12 + r() * 0.15})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 2, y - 5, x + (r() * 6 - 3), y - 8 - r() * 5); c.stroke();
  }
  const sprite = (im, x, y, h) => { const w = im.naturalWidth * h / im.naturalHeight; c.drawImage(im, x - w / 2, y - h, w, h); };
  const rock = (x, y, s) => {
    if (art) return sprite(r() < 0.5 ? art.rock : art.bush, x, y + s * 0.4, s * 2.6);
    c.fillStyle = 'rgba(80,75,70,0.16)'; c.beginPath(); c.moveTo(x - s, y);
    c.quadraticCurveTo(x - s * 0.6, y - s * 1.1, x, y - s * 0.9); c.quadraticCurveTo(x + s * 0.8, y - s * 0.8, x + s, y); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(42,36,29,0.45)'; c.lineWidth = 1; c.stroke();
  };
  const pine = (x, y, s) => {
    if (art) return sprite(art.pine, x, y + s * 0.2, s * 3.2);
    c.strokeStyle = 'rgba(42,36,29,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 3, y - s, x + 2, y - s * 2); c.stroke();
    for (let j = 0; j < 3; j += 1) {
      const yy = y - s * 0.8 - j * s * 0.45, w = s * (1.1 - j * 0.25);
      c.fillStyle = `rgba(45,70,60,${0.35 + j * 0.1})`; c.beginPath(); c.ellipse(x + (j % 2 ? 3 : -3), yy, w, s * 0.25, 0, 0, 6.28); c.fill();
    }
  };
  const pines = L.decor?.pines ?? 6;
  for (let i = 0, n = 0; i < 400 && n < pines + 5; i += 1) {
    const x = 20 + r() * (W - 40), y = 110 + r() * (H - 130);
    if (!free(x, y, 46)) continue;
    if (n < pines) pine(x, y, 16 + r() * 10); else rock(x, y, 9 + r() * 7);
    n += 1;
  }
  const pts = L.road.points;
  const road = (w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts) c.lineTo(x, y); c.stroke(); };
  if (L.trail === 'faint') { c.setLineDash([6, 10]); road(14, 'rgba(120,110,90,0.28)'); c.setLineDash([]); } // 守火: only a trodden track out of the dark
  else if (art) { road(50, '#4a3320'); road(44, '#b98a52'); road(30, 'rgba(226,190,130,0.75)'); } // a comic dirt road, outlined
  else { road(56, 'rgba(60,48,35,0.10)'); road(48, 'rgba(60,48,35,0.16)'); road(42, '#e9dcc0'); road(30, 'rgba(250,244,230,0.55)'); }
  for (let i = 0; i < 400; i += 1) { const pp = posOnPath(L.road, r() * L.road.len, (r() * 2 - 1) * 20); c.fillStyle = `rgba(90,70,50,${0.08 + r() * 0.12})`; c.beginPath(); c.arc(pp.x, pp.y, 0.6 + r() * 1.4, 0, 6.28); c.fill(); }
  for (let i = 0; i < 160; i += 1) { const side = r() < 0.5 ? -1 : 1, pp = posOnPath(L.road, r() * L.road.len, side * 22); c.strokeStyle = `rgba(42,36,29,${0.15 + r() * 0.2})`; c.lineWidth = 0.8 + r(); c.beginPath(); c.moveTo(pp.x, pp.y); c.lineTo(pp.x + (r() * 6 - 3), pp.y + (r() * 6 - 3)); c.stroke(); }
  if (L.air) { // the fliers' line: a faint dashed sky-way
    c.setLineDash([3, 9]); c.strokeStyle = 'rgba(42,42,49,0.18)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(L.air.x, L.air.y); c.lineTo(L.furn.x, L.furn.y - 18); c.stroke(); c.setLineDash([]);
  }
  const [sx, sy] = pts[1], [ex, ey] = pts[0];
  const lx = Math.max(8, Math.min(W - 70, (ex < 0 ? 6 : ex > W ? sx - 60 : ex))), ly = Math.max(28, Math.min(H - 10, sy - 28));
  c.fillStyle = 'rgba(42,36,29,0.55)'; c.font = 'bold 15px "Songti SC","STSong",serif'; c.fillText(label, lx, ly);
  c.strokeStyle = 'rgba(176,65,46,0.7)'; c.lineWidth = 1.5; c.strokeRect(W - 40, H - 42, 26, 26);
  c.fillStyle = 'rgba(176,65,46,0.75)'; c.font = 'bold 11px serif'; c.fillText('守', W - 33, H - 31); c.fillText('炉', W - 33, H - 19);
}

/** Two eyes that shine in the dark (守火): yellow-green, a glow round each. */
function glowEyes(c, x, y, gap, a) {
  c.save(); c.globalAlpha = a;
  for (const dx of [-gap, gap]) {
    const gl = c.createRadialGradient(x + dx, y, 0, x + dx, y, 7); gl.addColorStop(0, 'rgba(255,240,140,0.9)'); gl.addColorStop(1, 'rgba(255,220,90,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(x + dx, y, 7, 0, 6.28); c.fill();
    c.fillStyle = '#fff6b0'; c.beginPath(); c.ellipse(x + dx, y, 2.6, 1.9, 0, 0, 6.28); c.fill();
    c.fillStyle = '#1a1206'; c.fillRect(x + dx - 0.5, y - 1.6, 1, 3.2);
  }
  c.restore();
}
function eye(c, x, y, r, red) { c.fillStyle = red ? '#e8d4b0' : '#f6efe0'; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill(); c.fillStyle = red ? '#b0412e' : '#111'; c.beginPath(); c.arc(x + r * 0.25, y, r * 0.55, 0, 6.28); c.fill(); }
function blob(c, fill) { c.fillStyle = fill; c.fill(); c.strokeStyle = 'rgba(20,15,10,0.65)'; c.lineWidth = 1.2; c.stroke(); }

const FIGURES = {
  // 守火's eyes in the dark (the code stand-in for art/yanjing.webp): a shaggy dark shape, two eyes that catch the fire
  yanjing(c, r, col, t, bob) {
    c.beginPath(); c.ellipse(0, bob * 0.3, r * 1.25, r * 0.85, 0, 0, 6.28); blob(c, col);
    c.beginPath(); c.moveTo(r * 0.3, -r * 0.6); c.lineTo(r * 0.55, -r * 1.25); c.lineTo(r * 0.85, -r * 0.6); c.closePath(); blob(c, col);
    c.beginPath(); c.moveTo(-r * 0.4, -r * 0.6); c.lineTo(-r * 0.15, -r * 1.25); c.lineTo(r * 0.1, -r * 0.6); c.closePath(); blob(c, col);
    glowEyes(c, r * 0.05, -r * 0.2, r * 0.35, 1);
  },
  yezhu(c, r, col, t, bob) {
    c.strokeStyle = 'rgba(20,15,10,0.8)'; c.lineWidth = 2.2;
    for (const lx of [-6, -2, 3, 7]) { c.beginPath(); c.moveTo(lx, 4); c.lineTo(lx + Math.sin(t * 12 + lx) * 2, r * 0.85); c.stroke(); }
    c.beginPath(); c.ellipse(0, bob * 0.3, r * 1.2, r * 0.8, 0, 0, 6.28); blob(c, col);
    c.beginPath(); c.arc(r * 0.95, -1 + bob * 0.3, r * 0.58, 0, 6.28); blob(c, col);
    c.beginPath(); c.ellipse(r * 1.45, 1, 3, 3.2, 0, 0, 6.28); blob(c, '#7a5f4a');
    c.strokeStyle = '#efe6d2'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(r * 1.3, 3); c.quadraticCurveTo(r * 1.6, 4, r * 1.55, -1); c.stroke();
    c.strokeStyle = 'rgba(20,15,10,0.7)'; c.lineWidth = 1;
    for (let k = -3; k < 4; k += 2) { c.beginPath(); c.moveTo(k, -r * 0.75); c.lineTo(k - 2, -r * 1.0); c.stroke(); }
    eye(c, r * 1.05, -3, 2.3);
  },
  zheng(c, r, col, t, bob) {
    c.strokeStyle = col; c.lineWidth = 2;
    for (let k = 0; k < 5; k += 1) { c.beginPath(); c.moveTo(-r * 1.0, -1); c.quadraticCurveTo(-r * 1.7, -4 - k * 2, -r * 2.1 + Math.sin(t * 9 + k) * 2, -6 - k * 2.5); c.stroke(); }
    c.strokeStyle = 'rgba(20,15,10,0.8)'; c.lineWidth = 1.8;
    for (const lx of [-6, -3, 4, 7]) { c.beginPath(); c.moveTo(lx, 2); c.lineTo(lx + Math.sin(t * 16 + lx) * 3, r * 0.85); c.stroke(); }
    c.beginPath(); c.ellipse(0, bob * 0.4, r * 1.3, r * 0.55, 0, 0, 6.28); blob(c, col);
    c.beginPath(); c.arc(r * 1.15, -r * 0.35, r * 0.5, 0, 6.28); blob(c, col);
    c.beginPath(); c.moveTo(r * 0.9, -r * 0.7); c.lineTo(r * 1.0, -r * 1.3); c.lineTo(r * 1.25, -r * 0.8); c.closePath(); blob(c, col);
    eye(c, r * 1.25, -r * 0.4, 1.9, true);
  },
  qiuyu(c, r, col, t, bob, flash) {
    c.fillStyle = 'rgba(20,15,10,0.8)';
    for (const lx of [-7, -2, 3, 8]) c.fillRect(lx - 1.5, 2, 3, r * 0.7 + Math.sin(t * 6 + lx) * 1);
    c.strokeStyle = 'rgba(40,40,30,0.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 1.2, 2); c.quadraticCurveTo(-r * 1.9, 6, -r * 2.0, -2 + Math.sin(t * 5) * 2); c.stroke();
    c.beginPath(); c.moveTo(r * 1.1, -2); c.lineTo(r * 1.75, 1); c.lineTo(r * 1.1, 3); c.closePath(); blob(c, '#9c5f2e');
    c.beginPath(); c.moveTo(-r * 1.3, 3); c.quadraticCurveTo(-r * 1.2, -r * 1.15, 0, -r * 1.1); c.quadraticCurveTo(r * 1.2, -r * 1.15, r * 1.25, 3); c.closePath(); blob(c, col);
    c.strokeStyle = flash > 0 ? '#d9cdb4' : '#a3ad8a'; c.lineWidth = 1.4;
    for (let k = -2; k <= 2; k += 1) { c.beginPath(); c.moveTo(k * r * 0.42, 2); c.quadraticCurveTo(k * r * 0.45, -r * 0.6, k * r * 0.3, -r * 1.0); c.stroke(); }
    eye(c, r * 0.95, -r * 0.45, 2.4);
  },
  qique(c, r, col, t) {
    const fl = Math.sin(t * 14);
    c.beginPath(); c.moveTo(-2, -2); c.lineTo(-r * 0.6, -r * 1.4 * fl - 2); c.lineTo(r * 0.5, -3); c.closePath(); blob(c, col);
    c.beginPath(); c.moveTo(-r * 1.1, 0); c.lineTo(-r * 1.8, -3); c.lineTo(-r * 1.7, 4); c.closePath(); blob(c, col);
    c.beginPath(); c.ellipse(0, 0, r * 1.05, r * 0.55, 0, 0, 6.28); blob(c, col);
    c.beginPath(); c.arc(r * 0.95, -r * 0.3, r * 0.48, 0, 6.28); blob(c, '#e6ddcc');
    c.beginPath(); c.moveTo(r * 1.35, -r * 0.4); c.lineTo(r * 1.85, -r * 0.15); c.lineTo(r * 1.35, 0); c.closePath(); blob(c, '#9c5f2e');
    c.beginPath(); c.moveTo(2, 0); c.lineTo(r * 0.4, r * 1.2 * fl + 2); c.lineTo(r * 0.9, -1); c.closePath(); blob(c, col);
    c.strokeStyle = '#9c5f2e'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-2, r * 0.5); c.lineTo(-1, r * 0.95); c.moveTo(2, r * 0.5); c.lineTo(3, r * 0.95); c.stroke();
    eye(c, r * 1.05, -r * 0.35, 1.6, true);
  },
  // 合窳: a pig bigger than an ox, yellow, a red tail like fire, a man's face; it wails like a baby
  heyu(c, r, col, t, bob, flash, b) {
    const st = Math.sin(t * 4), crying = b?.crying > 0;
    c.strokeStyle = 'rgba(20,15,10,0.85)'; c.lineWidth = 6;
    for (const lx of [-r * 0.8, -r * 0.3, r * 0.3, r * 0.8]) { c.beginPath(); c.moveTo(lx, 4); c.lineTo(lx + (crying ? 0 : st * 3), r * 0.9); c.stroke(); }
    for (let k = 0; k < 4; k += 1) { // the tail, a flame
      c.strokeStyle = `rgba(${200 + k * 12},${60 + k * 25},40,${0.9 - k * 0.15})`; c.lineWidth = 5 - k;
      c.beginPath(); c.moveTo(-r * 1.2, -4); c.quadraticCurveTo(-r * 1.8, -r * 0.4 - k * 3, -r * 2.0 + Math.sin(t * 6 + k) * 4, -r * 0.9 - k * 4); c.stroke();
    }
    c.beginPath(); c.ellipse(0, -2 + st, r * 1.35, r * 0.85, 0, 0, 6.28); blob(c, col);
    c.strokeStyle = 'rgba(120,80,20,0.45)'; c.lineWidth = 1.5;
    for (let k = -3; k <= 3; k += 1) { c.beginPath(); c.moveTo(k * 6, -r * 0.75 + st); c.lineTo(k * 6 - 3, -r * 0.95 + st); c.stroke(); }
    c.beginPath(); c.ellipse(r * 1.25, -r * 0.3 + st, r * 0.52, r * 0.56, 0, 0, 6.28); blob(c, flash > 0 ? '#fff' : '#f0d9bd');
    c.fillStyle = '#1a1a22';
    c.beginPath(); c.arc(r * 1.12, -r * 0.42 + st, 2.2, 0, 6.28); c.arc(r * 1.45, -r * 0.42 + st, 2.2, 0, 6.28); c.fill();
    c.strokeStyle = '#5a2a1a'; c.lineWidth = 1.6; c.beginPath();
    if (crying) { c.ellipse(r * 1.28, -r * 0.05 + st, 4, 5, 0, 0, 6.28); c.stroke(); c.fillStyle = 'rgba(120,180,230,0.9)'; c.beginPath(); c.arc(r * 1.08, -r * 0.2 + st + (t * 30) % 10, 1.8, 0, 6.28); c.arc(r * 1.5, -r * 0.2 + st + (t * 30 + 5) % 10, 1.8, 0, 6.28); c.fill(); } else { c.moveTo(r * 1.15, -r * 0.08 + st); c.quadraticCurveTo(r * 1.28, -r * 0.02 + st, r * 1.42, -r * 0.08 + st); c.stroke(); }
  },
};
export function drawBeast(c, type, x, y, t, face, flash, s = 1, b = null) {
  const B = BEASTS[type], r = B.r;
  c.save(); c.translate(x, y);
  if (!B.fly) { c.fillStyle = 'rgba(40,30,20,0.16)'; c.beginPath(); c.ellipse(0, r * 0.85 * s, r * 1.2 * s, r * 0.3 * s, 0, 0, 6.28); c.fill(); }
  if (B.cry) { // 护体灵光: thick, and thin while it wails
    const thin = b?.crying > 0 || b?.bareT > 0; // it wails, or 狐毛 has it bare
    c.strokeStyle = thin ? 'rgba(230,200,120,0.25)' : 'rgba(230,200,120,0.75)'; c.lineWidth = thin ? 1 : 3;
    c.setLineDash(thin ? [3, 6] : []); c.beginPath(); c.ellipse(0, -2, r * 2.2 * s, r * 1.4 * s, 0, 0, 6.28); c.stroke(); c.setLineDash([]);
  }
  if (beastArt(c, type, B, t, face, flash || (b?.crying > 0 ? 1 : 0), s)) { c.restore(); return; } // wailing 合窳: its hit frame
  c.scale(face * s, s);
  const col = flash > 0 ? '#fff4dc' : B.color;
  FIGURES[type](c, r, col, t, Math.sin(t * 10) * 1.2, flash, b);
  c.restore();
}
/** A beast's painted height on the board (its figure's r is the hit size; the picture reads a little bigger). */
const BEAST_H = { yezhu: 50, zheng: 43, qiuyu: 52, qique: 44, heyu: 112, yanjing: 44 };
/** The painted beast (walk steps, the hit frame while it flashes); false while the sheet loads. The art faces left. */
function beastArt(c, type, B, t, face, flash, s) {
  if (B.shade) { // one painted picture (art/<type>.webp), breathing; the code figure while it loads
    const pic = ART.img[type];
    if (!okImg(pic)) return false;
    const hh = BEAST_H[type] * s * (1 + Math.sin(t * 5) * 0.03), ww = pic.naturalWidth * hh / pic.naturalHeight;
    c.scale(-face, 1); c.globalAlpha = flash > 0 ? 0.7 : 1;
    c.drawImage(pic, -ww / 2, B.r * 0.85 * s - hh, ww, hh); c.globalAlpha = 1;
    return true;
  }
  const cells = ART.cells;
  if (!cells || !okImg(ART.beasts)) return false;
  const step = `${type}-walk-${1 + (Math.floor(t * (B.fly ? 9 : 6)) % 2)}`;
  const cell = (flash > 0 && cells[`${type}-hit`]) || cells[step] || cells[`${type}-walk-1`];
  if (!cell) return false;
  const [sx, sy, w, h] = cell, hh = BEAST_H[type] * s, ww = w * hh / h, foot = B.fly ? hh / 2 : B.r * 0.85 * s;
  c.scale(-face, 1);
  c.drawImage(ART.beasts, sx, sy, w, h, -ww / 2, foot - hh + (B.fly ? 0 : Math.abs(Math.sin(t * 10)) * -1.5), ww, hh);
  return true;
}
function hpBar(c, b) {
  if (BEASTS[b.type].shade) return; // eyes in the dark: their nerve is never a bar
  const B = BEASTS[b.type], w = B.boss ? 54 : 22, x = b.x - w / 2, y = b.y - B.r - (B.fly ? 14 : 10) - (B.boss ? 14 : 0), h = B.boss ? 6 : 4;
  c.fillStyle = 'rgba(42,36,29,0.55)'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = '#e9dfcc'; c.fillRect(x, y, w, h);
  const k = Math.max(0, b.hp / b.max);
  c.fillStyle = k > 0.5 ? '#5c7d4e' : k > 0.25 ? '#b9842f' : '#b0412e'; c.fillRect(x, y, w * k, h);
  if (b.slowT > 0) { c.fillStyle = 'rgba(63,135,166,0.9)'; c.fillRect(x, y + h + 1, w, 1.5); }
  if (b.bareT > 0) { c.strokeStyle = 'rgba(200,215,240,0.95)'; c.lineWidth = 1.2; for (let k = 0; k < 3; k += 1) { const sx = x + 3 + k * (w - 6) / 2; c.beginPath(); c.moveTo(sx - 3, y - 6); c.quadraticCurveTo(sx + 2, y - 9, sx + 3, y - 3); c.stroke(); } }
  if (b.burnT > 0) { c.fillStyle = 'rgba(80,150,240,0.9)'; c.beginPath(); c.arc(x + w + 4, y + 1, 2.4, 0, 6.28); c.fill(); }
  if (b.stunT > 0) { c.fillStyle = '#d6b052'; c.font = 'bold 11px serif'; c.textAlign = 'center'; c.fillText('✦ ✦', b.x, y - 3); c.textAlign = 'left'; }
}
// ── 守火 (a `fire` level): the campfire is the 炉, the fox by it, the 枯枝 at the cliff's foot, the dark beyond the light ──
const FIRE_ART = ['campfire', 'kuzhi', 'fox-sleep', 'yanjing', 'xiaoman-idle', 'xiaoman-throw', 'xiaoman-carry'];
function loadFireArt(doc) { for (const n of FIRE_ART) artImg(doc, n); }
function drawCampfire(c, g, t) {
  const F = g.L.fire, x = g.L.furn.x, y = g.L.furn.y, k = Math.max(0, g.hp) / F.max, fl = 0.9 + 0.07 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23);
  const R = lightOf(g) * fl;
  const gl = c.createRadialGradient(x, y - 8, 6, x, y - 8, R);
  gl.addColorStop(0, `rgba(255,170,70,${0.25 + 0.3 * k})`); gl.addColorStop(0.6, `rgba(240,120,50,${0.08 + 0.12 * k})`); gl.addColorStop(1, 'rgba(240,120,50,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(x, y - 8, R, 0, 6.28); c.fill();
  const pic = ART.img.campfire;
  if (okImg(pic)) { const h = 40 + 34 * k, w = pic.naturalWidth * h / pic.naturalHeight; c.drawImage(pic, x - w / 2, y + 18 - h, w, h); }
  else {
    c.strokeStyle = '#5a3a20'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 20, y + 14); c.lineTo(x + 20, y + 4); c.moveTo(x + 20, y + 14); c.lineTo(x - 20, y + 4); c.stroke();
    for (let n = 0; n < 3; n += 1) {
      const fx = x - 9 + n * 9, h = (12 + 22 * k) * (0.8 + 0.2 * Math.sin(t * 12 + n * 2));
      c.fillStyle = n === 1 ? 'rgba(255,200,80,0.95)' : 'rgba(235,100,40,0.9)';
      c.beginPath(); c.moveTo(fx - 6, y + 10); c.quadraticCurveTo(fx - 5, y + 10 - h * 0.6, fx, y + 10 - h); c.quadraticCurveTo(fx + 5, y + 10 - h * 0.6, fx + 6, y + 10); c.closePath(); c.fill();
    }
  }
  if (g.furnFlash > 0) { c.fillStyle = `rgba(200,40,30,${g.furnFlash * 0.5})`; c.beginPath(); c.arc(x, y, 36, 0, 6.28); c.fill(); }
  const [fx, fy] = F.fox ?? [x + 50, y + 26], fox = ART.img['fox-sleep'];
  if (okImg(fox)) { const h = 34, w = fox.naturalWidth * h / fox.naturalHeight; c.drawImage(fox, fx - w / 2, fy + 8 - h + Math.sin(t * 2) * 0.6, w, h); }
  else { c.fillStyle = '#e6eaf1'; c.beginPath(); c.ellipse(fx, fy, 18, 9, 0, 0, 6.28); c.fill(); c.strokeStyle = 'rgba(30,30,40,0.6)'; c.stroke(); }
}
function drawSticks(c, g, t) {
  const pic = ART.img.kuzhi;
  for (const s of g.sticks) {
    if (!s.up) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.i);
    const gl = c.createRadialGradient(s.x, s.y, 2, s.x, s.y, 26); gl.addColorStop(0, `rgba(255,236,170,${0.22 + 0.18 * pulse})`); gl.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(s.x, s.y, 26, 0, 6.28); c.fill();
    if (okImg(pic)) { const h = 30, w = pic.naturalWidth * h / pic.naturalHeight; c.drawImage(pic, s.x - w / 2, s.y + 8 - h, w, h); }
    else { c.strokeStyle = '#7a5532'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(s.x - 14, s.y + 4); c.lineTo(s.x + 14, s.y - 4); c.moveTo(s.x - 6, s.y - 6); c.lineTo(s.x + 8, s.y + 6); c.stroke(); }
  }
}
/** The night beyond the fire: dark, with a hole where the light reaches and a small one round 小满 (he carries no torch,
    but the player must see him); the eyes of whatever stands in the dark still shine through. */
function drawNight(c, g, t) {
  const F = g.L.fire, x = g.L.furn.x, y = g.L.furn.y - 8, R = lightOf(g) * (0.94 + 0.04 * Math.sin(t * 9)), h = g.hero;
  c.save();
  const night = c.createRadialGradient(x, y, R * 0.55, x, y, R * 1.25);
  night.addColorStop(0, 'rgba(6,8,22,0)'); night.addColorStop(1, `rgba(6,8,22,${F.dark ?? 0.78})`);
  c.fillStyle = night; c.fillRect(0, 0, W, H);
  c.restore();
  if (h.dead <= 0 && Math.hypot(h.x - x, h.y - y) > R * 0.8) { const gl = c.createRadialGradient(h.x, h.y - 20, 4, h.x, h.y - 20, 46); gl.addColorStop(0, 'rgba(255,230,180,0.18)'); gl.addColorStop(1, 'rgba(255,230,180,0)'); c.fillStyle = gl; c.beginPath(); c.arc(h.x, h.y - 20, 46, 0, 6.28); c.fill(); }
  for (const b of g.beasts) if (!b.dead && BEASTS[b.type].shade && Math.hypot(b.x - x, b.y - y) > R * 0.7) glowEyes(c, b.x + b.face * 3, b.y - BEASTS[b.type].r * 0.6, 4.5, 0.6 + 0.4 * Math.abs(Math.sin(t * 1.3 + b.id)));
  drawSticks(c, g, t); // the 枯枝 glint through the dark: the player must find them
}
/** 小满, a story level's hero (守火): painted standing, throwing, carrying sticks; a code figure while they load. */
function drawXiaoman(c, h, t, moving) {
  const pic = ART.img[h.carry > 0 ? 'xiaoman-carry' : h.threw > 0 ? 'xiaoman-throw' : 'xiaoman-idle'] ?? ART.img['xiaoman-idle'];
  const bob = moving ? Math.abs(Math.sin(t * 12)) * -2 : Math.sin(t * 2.4) * 0.5;
  if (okImg(pic)) { const hh = 62, ww = pic.naturalWidth * hh / pic.naturalHeight; c.drawImage(pic, -ww / 2, FOOT - hh + bob, ww, hh); return; }
  c.fillStyle = '#e8dcc0'; c.beginPath(); c.ellipse(0, -16 + bob, 9, 14, 0, 0, 6.28); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
  c.fillStyle = '#2a241d'; c.beginPath(); c.arc(0, -36 + bob, 8, 0, 6.28); c.fill();
  if (h.carry > 0) { c.strokeStyle = '#7a5532'; c.lineWidth = 3; c.beginPath(); c.moveTo(-12, -18); c.lineTo(12, -24); c.stroke(); }
}
function drawStone(c, p) { c.fillStyle = '#8c8577'; c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.ellipse(p.x, p.y, 4, 3.2, p.ang, 0, 6.28); c.fill(); c.stroke(); }

/** A person kept where the furnace stands (`keep`: 坑底's 孙二狗, huddled in the pit's corner — he cannot move): his
    picture, a dim light from above on him, the flash when a beast reaches him. */
function drawKept(c, g, t) {
  const x = g.L.furn.x, y = g.L.furn.y, pic = ART.img[g.L.keep];
  const gl = c.createRadialGradient(x, y - 20, 6, x, y - 20, 70);
  gl.addColorStop(0, 'rgba(220,230,255,0.28)'); gl.addColorStop(1, 'rgba(220,230,255,0)');
  c.fillStyle = gl; c.beginPath(); c.arc(x, y - 20, 70, 0, 6.28); c.fill();
  if (okImg(pic)) { const h = 70, w = pic.naturalWidth * h / pic.naturalHeight, shiver = Math.sin(t * 21) * (g.furnFlash > 0 ? 2 : 0.4); c.drawImage(pic, x - w / 2 + shiver, y + 26 - h, w, h); }
  else { c.fillStyle = '#9a948a'; c.beginPath(); c.ellipse(x, y + 6, 16, 20, 0, 0, 6.28); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke(); }
  if (g.furnFlash > 0) { c.fillStyle = `rgba(200,40,30,${g.furnFlash * 0.6})`; c.beginPath(); c.arc(x, y, 38, 0, 6.28); c.fill(); }
}
function drawFurnace(c, g, t) {
  if (g.L.fire) return drawCampfire(c, g, t);
  if (g.L.keep) return drawKept(c, g, t);
  const prog = cleared(g) / waves(g), x = g.L.furn.x, y = g.L.furn.y;
  const fl = 0.88 + 0.08 * Math.sin(t * 7) + 0.04 * Math.sin(t * 23), R = (44 + prog * 60) * fl;
  const gr = c.createRadialGradient(x, y - 4, 4, x, y - 4, R);
  gr.addColorStop(0, `rgba(232,128,50,${0.28 + 0.45 * prog})`); gr.addColorStop(0.5, `rgba(220,110,50,${0.1 + 0.22 * prog})`); gr.addColorStop(1, 'rgba(220,110,50,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(x, y - 4, R, 0, 6.28); c.fill();
  for (let k = 0; k < 3; k += 1) {
    const fx = x - 10 + k * 10, h = 8 + 4 * Math.sin(t * 12 + k * 2) + prog * 6;
    c.fillStyle = k === 1 ? 'rgba(240,170,60,0.9)' : 'rgba(214,92,40,0.85)';
    c.beginPath(); c.moveTo(fx - 5, y + 24); c.quadraticCurveTo(fx - 4, y + 24 - h * 0.6, fx, y + 24 - h); c.quadraticCurveTo(fx + 4, y + 24 - h * 0.6, fx + 5, y + 24); c.closePath(); c.fill();
  }
  const pic = ART.img.furnace;
  if (okImg(pic)) { // the painted 丹炉, reddening as the waves are held
    const h = 84, w = pic.naturalWidth * h / pic.naturalHeight, heat = Math.min(1, prog);
    c.save(); if (heat > 0.05) { c.shadowColor = `rgba(240,120,40,${0.5 * heat})`; c.shadowBlur = 18 * heat; }
    c.drawImage(pic, x - w / 2, y + 30 - h, w, h); c.restore();
    if (g.furnFlash > 0) { c.fillStyle = `rgba(200,40,30,${g.furnFlash * 0.6})`; c.beginPath(); c.arc(x, y, 40, 0, 6.28); c.fill(); }
    c.strokeStyle = `rgba(90,90,95,${0.18 + prog * 0.15})`; c.lineWidth = 2;
    for (let k = 0; k < 3; k += 1) { c.beginPath(); const sx = x - 10 + k * 10; c.moveTo(sx, y - 40); for (let j = 1; j < 6; j += 1) c.lineTo(sx + Math.sin(t * 1.5 + j * 0.9 + k) * 6, y - 40 - j * 8 - prog * 6); c.stroke(); }
    return;
  }
  c.strokeStyle = INK; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - 18, y + 8); c.lineTo(x - 22, y + 28); c.moveTo(x + 18, y + 8); c.lineTo(x + 22, y + 28); c.stroke();
  const heat = Math.min(1, prog);
  c.beginPath(); c.moveTo(x - 27, y - 12); c.quadraticCurveTo(x - 30, y + 16, x, y + 16); c.quadraticCurveTo(x + 30, y + 16, x + 27, y - 12); c.closePath();
  c.fillStyle = `rgb(${Math.round(112 + heat * 60)},${Math.round(92 - heat * 20)},${Math.round(68 - heat * 20)})`; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
  c.fillStyle = '#4e4033'; c.fillRect(x - 31, y - 17, 62, 6); c.strokeRect(x - 31, y - 17, 62, 6);
  c.lineWidth = 3; c.beginPath();
  c.moveTo(x - 24, y - 17); c.lineTo(x - 24, y - 27); c.lineTo(x - 15, y - 27); c.lineTo(x - 15, y - 17);
  c.moveTo(x + 24, y - 17); c.lineTo(x + 24, y - 27); c.lineTo(x + 15, y - 27); c.lineTo(x + 15, y - 17); c.stroke();
  c.fillStyle = `rgba(255,${Math.round(200 - heat * 80)},120,${0.4 + heat * 0.5})`; c.font = 'bold 13px "Songti SC",serif'; c.textAlign = 'center'; c.fillText('丹', x, y + 9); c.textAlign = 'left';
  if (g.furnFlash > 0) { c.fillStyle = `rgba(200,40,30,${g.furnFlash * 0.8})`; c.beginPath(); c.arc(x, y, 40, 0, 6.28); c.fill(); }
  c.strokeStyle = `rgba(90,90,95,${0.18 + prog * 0.15})`; c.lineWidth = 2;
  for (let k = 0; k < 3; k += 1) { c.beginPath(); const sx = x - 10 + k * 10; c.moveTo(sx, y - 20); for (let j = 1; j < 6; j += 1) c.lineTo(sx + Math.sin(t * 1.5 + j * 0.9 + k) * 6, y - 20 - j * 8 - prog * 6); c.stroke(); }
}
function drawSword(c, s) {
  c.save(); c.scale(s, s);
  c.strokeStyle = '#cfd8de'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-6, 0); c.lineTo(10, 0); c.stroke();
  c.strokeStyle = '#35566e'; c.lineWidth = 1; c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -4); c.lineTo(-6, 4); c.moveTo(-6, 0); c.lineTo(-11, 0); c.stroke();
  c.restore();
}
function drawTower(c, tw, t) {
  const D = TOWERS[tw.type], x = tw.x, y = tw.y, pic = ART.img[`tower-${tw.type}-${Math.min(3, tw.lvl + 1)}`];
  if (okImg(pic)) { // the painted talisman: it rocks back as it fires, glowing its colour
    const h = 66 + tw.lvl * 6, w = pic.naturalWidth * h / pic.naturalHeight;
    c.fillStyle = 'rgba(40,30,20,0.22)'; c.beginPath(); c.ellipse(x, y + 10, 20, 7, 0, 0, 6.28); c.fill();
    c.save(); c.translate(x, y + 12); c.rotate(tw.anim > 0 ? -0.12 * tw.anim : Math.sin(t * 2 + x * 0.1) * 0.02);
    if (tw.anim > 0) { c.shadowColor = D.color; c.shadowBlur = 14; }
    c.drawImage(pic, -w / 2, -h, w, h); c.restore();
    if (tw.type === 'lei' && tw.anim > 0) { c.strokeStyle = 'rgba(150,110,230,0.85)'; c.lineWidth = 1.4; for (let k = 0; k < 3; k += 1) { const a = Math.random() * 6.28; c.beginPath(); c.moveTo(x, y - h * 0.6); c.lineTo(x + Math.cos(a) * 18, y - h * 0.6 + Math.sin(a) * 12); c.stroke(); } }
    return;
  }
  c.fillStyle = 'rgba(60,50,40,0.18)'; c.beginPath(); c.ellipse(x, y + 10, 22, 8, 0, 0, 6.28); c.fill();
  c.fillStyle = '#d6cbb3'; c.beginPath(); c.ellipse(x, y + 6, 18, 7, 0, 0, 6.28); c.fill(); c.strokeStyle = 'rgba(42,36,29,0.6)'; c.lineWidth = 1; c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y - 34); c.stroke();
  const sw = Math.sin(t * 2 + x * 0.1) * 0.06 + (tw.anim > 0 ? -0.5 * tw.anim : 0);
  c.save(); c.translate(x, y - 33); c.rotate(sw);
  const w = 20 + tw.lvl * 2, h = 30 + tw.lvl * 3;
  if (tw.anim > 0) { c.shadowColor = D.color; c.shadowBlur = 12; }
  c.fillStyle = '#ecd291'; c.fillRect(-w / 2, 2, w, h); c.shadowBlur = 0;
  c.strokeStyle = D.color; c.lineWidth = 1.6; c.strokeRect(-w / 2, 2, w, h); c.lineWidth = 0.7; c.strokeRect(-w / 2 + 2.5, 4.5, w - 5, h - 5);
  c.fillStyle = D.color; c.font = `bold ${14 + tw.lvl}px "Songti SC","STSong",serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(D.glyph, 0, 2 + h / 2);
  c.restore(); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  for (let k = 0; k <= tw.lvl; k += 1) { const px = x - (tw.lvl * 6) / 2 + k * 6; c.fillStyle = '#b0412e'; c.beginPath(); c.moveTo(px, y + 15); c.lineTo(px + 2.5, y + 18); c.lineTo(px, y + 21); c.lineTo(px - 2.5, y + 18); c.closePath(); c.fill(); }
  if (tw.type === 'jian') { const a = t * 2.5 + x; c.save(); c.translate(x + Math.cos(a) * 13, y - 26 + Math.sin(a) * 4); c.rotate(tw.anim > 0 ? tw.ang : -1.2); drawSword(c, 0.7); c.restore(); }
  if (tw.type === 'lei' && tw.anim > 0) { c.strokeStyle = 'rgba(110,80,180,0.8)'; c.lineWidth = 1.3; for (let k = 0; k < 3; k += 1) { const a = Math.random() * 6.28; c.beginPath(); c.moveTo(x, y - 18); c.lineTo(x + Math.cos(a) * 16, y - 18 + Math.sin(a) * 16); c.stroke(); } }
}
// 银月 is painted (tools/paint-shoulu.py: comic frames on one atlas, art/yinyue.webp + yinyue.json); the code only
// picks the frame for what she is doing. The blob below is the fallback while the picture loads or if it fails.
const YY = { img: null, skills: null, meta: null }, HERO_H = 64, FOOT = 12, seen = new WeakMap();
/** Load 银月's frames once (the page calls it; the tests never do): her sheet, and her skills' (pounce, cast, fox-fire). */
export function loadArt(doc) {
  loadBoardArt(doc);
  if (YY.img) return;
  const img = doc.createElement('img'), sk = doc.createElement('img');
  YY.img = img; YY.skills = sk;
  fetch(new URL('./art/yinyue.json', import.meta.url)).then((r) => r.json()).then((m) => {
    YY.meta = m; img.src = new URL('./art/yinyue.webp', import.meta.url).href; sk.src = new URL('./art/yinyue-skills.webp', import.meta.url).href;
  }).catch(() => {});
}
const artReady = () => YY.meta && YY.img.naturalWidth;
/** A frame by name, from whichever sheet holds it: [image, x, y] (null while loading). */
function frameAt(f) {
  const m = YY.meta;
  if (m.sheets.yinyue[f]) return [YY.img, ...m.sheets.yinyue[f]];
  const at = m.sheets['yinyue-skills']?.[f];
  return at && YY.skills.naturalWidth ? [YY.skills, ...at] : null;
}
/** 狐火's flame (foxfire-1…3), drawn `hgt` tall with its foot at (x, y). */
function drawFlame(c, x, y, hgt, n, alpha) {
  const at = artReady() && frameAt(`foxfire-${n}`);
  c.globalAlpha = alpha;
  if (at) { const [img, sx, sy] = at, [cw, ch] = YY.meta.cell, k = hgt / 150; c.drawImage(img, sx, sy, cw, ch, x - cw / 2 * k, y - YY.meta.foot * k, cw * k, ch * k); }
  else { c.fillStyle = 'rgba(90,160,245,0.8)'; c.beginPath(); c.ellipse(x, y - hgt * 0.35, hgt * 0.22, hgt * 0.35, 0, 0, 6.28); c.fill(); }
  c.globalAlpha = 1;
}
/** Which frame: dead → fade, a dash → pounce, a skill → howl / cast, a bite → bite, a hard hit → hurt, moving → run,
    idle — sniffing (crouched), sitting, a tail flick, else breathing. */
function heroFrame(h, t, moving) {
  const m = seen.get(h) ?? { hp: h.hp, dmg: 0, hurt: 0, t };
  const dt = Math.max(0, Math.min(0.1, t - m.t)); m.t = t;
  if (h.hp < m.hp) m.dmg += m.hp - h.hp; else m.dmg = Math.max(0, m.dmg - dt * 20);
  m.hp = h.hp; m.hurt = Math.max(0, m.hurt - dt);
  if (m.dmg > HERO.hp[h.lvl] * 0.08) { m.dmg = 0; m.hurt = 0.2; }
  seen.set(h, m);
  if (h.dead > 0) return 'fade';
  if (h.dash) return h.cast?.k === 'w' && h.cast.t > 0.22 ? 'pounce-1' : 'pounce-2';
  const k = h.cast?.k, ct = h.cast ? h.cast.max - h.cast.t : 0;
  if (k === 'q') return ct < 0.15 ? 'howl-1' : 'howl-2';
  if (k === 'e' || k === 'r') return ct < 0.18 ? 'cast-1' : 'cast-2';
  if (h.anim > 0) return h.anim > 0.1 ? 'bite-2' : 'bite-1';
  if (m.hurt > 0) return 'hurt';
  if (moving) return `run-${1 + (Math.floor(t * (h.wanderTo ? 7 : 12)) % 4)}`;
  if (h.held.length && h.cd < 0.25) return 'bite-1';
  if (h.act?.k === 'sniff') return 'pounce-1';
  if (h.act?.k === 'flick') return Math.floor(t / 0.18) % 2 ? 'idle-2' : 'idle-1';
  return Math.floor(t / 0.7) % 2 ? 'idle-2' : 'idle-1';
}
function drawHeroArt(c, f, t, sit) {
  const m = YY.meta, at = frameAt(f) ?? frameAt('idle-1'), [cw, ch] = m.cell, k = HERO_H / m.h0;
  const bob = f.startsWith('idle') ? Math.sin(t * 2.4) * 0.6 : 0;
  if (sit) { c.translate(0, FOOT); c.scale(1, 0.9); c.translate(0, -FOOT); } // she sits: a little lower
  c.drawImage(at[0], at[1], at[2], cw, ch, -cw / 2 * k, FOOT - m.foot * k + bob, cw * k, ch * k);
}
function drawHeroBlob(c, h, t, moving) {
  const run = moving ? Math.sin(t * 16) : 0, breath = Math.sin(t * 3) * 0.6, lunge = h.anim > 0 ? h.anim * 16 : 0;
  c.strokeStyle = 'rgba(30,30,40,0.75)'; c.lineWidth = 2.6; c.lineCap = 'round';
  for (const [lx, ph] of [[-9, 0], [-4, 2], [6, 1], [11, 3]]) { c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx + Math.sin(t * 16 + ph) * (moving ? 4 : 0), 11); c.stroke(); }
  c.beginPath(); c.moveTo(-13, -4); c.quadraticCurveTo(-26, -6 + run * 2, -30, -16 + run * 3); c.quadraticCurveTo(-22, -12, -14, -9); c.closePath(); blob(c, '#cfd6e2');
  c.beginPath(); c.ellipse(0, -3 + breath * 0.4, 16, 9, 0, 0, 6.28); blob(c, '#e6eaf1');
  c.save(); c.translate(lunge * 0.6, 0);
  c.beginPath(); c.moveTo(16, -17); c.lineTo(13, -27); c.lineTo(20, -19); c.closePath(); blob(c, '#e6eaf1');
  c.beginPath(); c.moveTo(20, -17); c.lineTo(22, -27); c.lineTo(25, -17); c.closePath(); blob(c, '#e6eaf1');
  c.beginPath(); c.arc(18, -12, 8, 0, 6.28); blob(c, '#eef1f6');
  c.beginPath(); c.moveTo(23, -15); c.lineTo(32 + lunge * 0.3, -9); c.lineTo(23, -6); c.closePath(); blob(c, '#eef1f6');
  c.fillStyle = '#4a8fd0'; c.beginPath(); c.arc(20, -13, 1.9, 0, 6.28); c.fill();
  c.strokeStyle = '#c99a2e'; c.lineWidth = 1.6; c.beginPath(); c.arc(16, -17, 3, 0.6, 3.6); c.stroke();
  c.restore();
}
/** Under her, while she is selected: her guard post, and the way her orders go (queued moves, the beast she hunts). */
function drawOrders(c, h, t) {
  if (h.dead > 0) return;
  const p = h.post;
  c.strokeStyle = 'rgba(60,100,120,0.55)'; c.lineWidth = 1.4; c.setLineDash([2, 4]);
  c.beginPath(); c.ellipse(p.x, p.y + FOOT, HERO.wander, HERO.wander * 0.35, 0, 0, 6.28); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#3c6478'; c.beginPath(); c.moveTo(p.x, p.y + FOOT); c.lineTo(p.x, p.y + FOOT - 16); c.stroke();
  c.beginPath(); c.moveTo(p.x, p.y + FOOT - 16); c.lineTo(p.x + 9, p.y + FOOT - 13); c.lineTo(p.x, p.y + FOOT - 10); c.fill();
  let from = { x: h.x, y: h.y };
  c.setLineDash([3, 5]); c.lineWidth = 1.5;
  for (const o of h.orders) {
    const to = o.b ?? o.at?.b ?? o.at ?? o;
    c.strokeStyle = o.k === 'attack' ? 'rgba(176,65,46,0.6)' : 'rgba(60,100,120,0.6)';
    c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
    c.beginPath(); c.arc(to.x, to.y, 5, 0, 6.28); c.stroke();
    from = to;
  }
  c.setLineDash([]);
  const foe = h.foe && !h.foe.dead ? h.foe : null;
  if (foe) { const r = BEASTS[foe.type].r + 6, a = t * 3; c.strokeStyle = 'rgba(176,65,46,0.85)'; c.lineWidth = 2; for (let k = 0; k < 4; k += 1) { c.beginPath(); c.arc(foe.x, foe.y, r, a + k * 1.57, a + k * 1.57 + 0.9); c.stroke(); } }
}
function drawHero(c, h, t, sel, lang, says, g = null) {
  const HS = g?.HS ?? HERO;
  const moving = !h.dead && h.moving, f = heroFrame(h, t, moving);
  const gone = h.dead > 0 ? Math.min(1, (HS.respawn - h.dead) / 1.1) : 0; // she fades out over a second, then is away
  if (gone >= 1) return;
  if (h.dash) { c.strokeStyle = 'rgba(190,210,245,0.5)'; c.lineWidth = 3; for (let k = 1; k <= 3; k += 1) { c.beginPath(); c.moveTo(h.x - h.face * (10 + k * 12), h.y - 16 + k * 5); c.lineTo(h.x - h.face * (30 + k * 14), h.y - 16 + k * 5); c.stroke(); } }
  c.save(); c.translate(h.x - gone * 14 * h.face, h.y); c.globalAlpha = 1 - gone;
  if (g?.who !== 'xiaoman') { const glow = c.createRadialGradient(0, -18, 4, 0, -18, 46); glow.addColorStop(0, 'rgba(200,220,250,0.42)'); glow.addColorStop(1, 'rgba(190,210,240,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(0, -18, 46, 0, 6.28); c.fill(); }
  if (sel) { c.setLineDash([5, 4]); c.strokeStyle = '#3c6478'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, FOOT, 30, 10, 0, 0, 6.28); c.stroke(); c.setLineDash([]); }
  c.fillStyle = 'rgba(40,30,20,0.18)'; c.beginPath(); c.ellipse(0, FOOT, 22, 5.5, 0, 0, 6.28); c.fill();
  c.scale(h.face, 1);
  if (g?.who === 'xiaoman') drawXiaoman(c, h, t, moving);
  else if (artReady()) drawHeroArt(c, f, t, h.act?.k === 'sit' && !moving); else drawHeroBlob(c, h, t, moving);
  c.restore();
  if (gone > 0) return;
  const w = 34, x = h.x - w / 2, y = h.y - HERO_H - 2;
  c.fillStyle = 'rgba(42,36,29,0.55)'; c.fillRect(x - 1, y - 1, w + 2, 6); c.fillStyle = '#e9dfcc'; c.fillRect(x, y, w, 4);
  c.fillStyle = '#5a8fc0'; c.fillRect(x, y, w * Math.max(0, h.hp / HS.hp[h.lvl]), 4);
  if (h.lvl > 0) { c.fillStyle = '#c99a2e'; c.font = 'bold 9px serif'; c.fillText(LVNAME[lang][h.lvl], x + w + 3, y + 5); }
  if (h.say) {
    const s = says[h.say.k] ?? '';
    c.font = 'bold 13px "Songti SC","STSong",serif';
    const tw = c.measureText(s).width + 16, bx = Math.max(4, Math.min(W - tw - 4, h.x - tw / 2)), by = h.y - HERO_H - 36;
    c.globalAlpha = Math.min(1, h.say.life * 2); c.fillStyle = '#fbf6ea'; c.strokeStyle = 'rgba(42,36,29,0.7)'; c.lineWidth = 1.2;
    c.beginPath(); c.roundRect(bx, by, tw, 24, 8); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(h.x - 5, by + 24); c.lineTo(h.x, by + 31); c.lineTo(h.x + 5, by + 24); c.fill();
    c.fillStyle = INK; c.textAlign = 'center'; c.fillText(s, bx + tw / 2, by + 17); c.textAlign = 'left'; c.globalAlpha = 1;
  }
}

/** One frame. `v`: { paper, sc, dpr, t, heroSel, sel, aim, paused, lang, says, bossName } — `aim`: { key, x, y } while a skill is aimed. */
export function draw(ctx, g, v) {
  const { sc, dpr, t } = v;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  let ox = 0, oy = 0;
  if (g.shake > 0.2) { ox = (Math.random() * 2 - 1) * g.shake; oy = (Math.random() * 2 - 1) * g.shake; }
  ctx.setTransform(sc * dpr, 0, 0, sc * dpr, ox * sc * dpr, oy * sc * dpr);
  ctx.drawImage(v.paper, 0, 0, W, H);
  for (const f of g.fx) if (f.k === 'ink') {
    ctx.fillStyle = f.col; ctx.globalAlpha = Math.min(1, f.life / f.max * 1.5) * 0.55;
    for (const [bx, by, br] of f.blobs) { ctx.beginPath(); ctx.arc(f.x + bx, f.y + by, br * (1.3 - f.life / f.max * 0.3), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  g.L.spots.forEach(([x, y], i) => {
    if (g.towers[i]) return;
    const sel = v.sel === i;
    ctx.fillStyle = sel ? 'rgba(176,65,46,0.12)' : 'rgba(250,244,230,0.5)'; ctx.beginPath(); ctx.arc(x, y, 21, 0, 6.28); ctx.fill();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = sel ? '#b0412e' : 'rgba(42,36,29,0.45)'; ctx.lineWidth = sel ? 2 : 1.4; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = sel ? 'rgba(176,65,46,0.6)' : 'rgba(42,36,29,0.28)'; ctx.font = '14px "Songti SC",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('符', x, y + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  });
  if (v.sel >= 0 && g.towers[v.sel]) {
    const tw = g.towers[v.sel], R = TOWERS[tw.type].range[tw.lvl];
    ctx.fillStyle = 'rgba(60,100,120,0.08)'; ctx.beginPath(); ctx.arc(tw.x, tw.y, R, 0, 6.28); ctx.fill();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(60,100,120,0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  }
  for (const f of g.fx) if (f.k === 'frost') { const k = 1 - f.life / f.max; ctx.strokeStyle = `rgba(63,135,166,${0.45 * (1 - k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, 6.28); ctx.stroke(); ctx.fillStyle = `rgba(120,180,210,${0.08 * (1 - k)})`; ctx.fill(); }
  for (const f of g.fires) drawFire(ctx, f, t);
  if (v.heroSel) drawOrders(ctx, g.hero, t);
  if (v.aim) drawAim(ctx, g, v.aim);
  drawFurnace(ctx, g, t);
  const items = [];
  for (const b of g.beasts) items.push({ y: b.y + (b.fly ? 60 : 0), b });
  g.towers.forEach((tw) => { if (tw) items.push({ y: tw.y + 4, tw }); });
  items.push({ y: g.hero.y, hero: 1 });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.hero) drawHero(ctx, g.hero, t, v.heroSel, v.lang, v.says, g);
    else if (it.tw) drawTower(ctx, it.tw, t);
    else drawBeast(ctx, it.b.type, it.b.x, it.b.y, t + it.b.id, it.b.face, it.b.flash, 1, it.b);
  }
  if (g.L.fire) drawNight(ctx, g, t);
  for (const b of g.beasts) hpBar(ctx, b);
  for (const p of g.proj) {
    if (p.k === 'stone') drawStone(ctx, p);
    else if (p.k === 'sword') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.strokeStyle = 'rgba(53,86,110,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-8, 0); ctx.stroke(); drawSword(ctx, 1); ctx.restore(); }
    else { ctx.fillStyle = 'rgba(240,160,70,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 6.28); ctx.fill(); ctx.fillStyle = '#c94a2a'; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 6.28); ctx.fill(); }
  }
  for (const f of g.fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'howl') { const k = 1 - a; ctx.strokeStyle = `rgba(150,185,230,${0.8 * a})`; ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, 6.28); ctx.stroke(); ctx.fillStyle = `rgba(190,210,240,${0.12 * a})`; ctx.fill(); }
    else if (f.k === 'hair') { const k = 1 - a; ctx.strokeStyle = `rgba(215,225,245,${a})`; ctx.lineWidth = 1.6; for (let n = 0; n < 14; n += 1) { const an = n * 0.449 + f.x, r0 = f.r * 0.2 * k, r1 = f.r * (0.35 + 0.65 * k); ctx.beginPath(); ctx.moveTo(f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0 * 0.6); ctx.quadraticCurveTo(f.x + Math.cos(an + 0.3) * r1 * 0.7, f.y + Math.sin(an + 0.3) * r1 * 0.42 - 6, f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1 * 0.6); ctx.stroke(); } ctx.strokeStyle = `rgba(160,180,215,${0.6 * a})`; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.28); ctx.stroke(); }
    else if (f.k === 'pounce') { const k = 1 - a; ctx.strokeStyle = `rgba(190,210,245,${a})`; ctx.lineWidth = 3 * a + 1; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.4 + 0.8 * k), f.r * (0.25 + 0.5 * k), 0, 0, 6.28); ctx.stroke(); }
    else if (f.k === 'ping') { const k = 1 - a; ctx.strokeStyle = `rgba(60,100,120,${a})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.x, f.y - 20, 20 + 40 * k, 0, 6.28); ctx.stroke(); }
    else if (f.k === 'mark') { ctx.strokeStyle = `rgba(60,100,120,${a})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + 14 * (1 - a), 0, 6.28); ctx.stroke(); }
    else if (f.k === 'boom') { const k = 1 - a; ctx.fillStyle = `rgba(225,100,45,${0.35 * a})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, 6.28); ctx.fill(); ctx.strokeStyle = `rgba(176,65,46,${0.7 * a})`; ctx.lineWidth = 2; ctx.stroke(); }
    else if (f.k === 'blink') { const k = 1 - a; glowEyes(ctx, f.x + k * 12, f.y - k * 10, 4.5, a * (Math.sin(k * 20) > -0.3 ? 1 : 0)); }
    else if (f.k === 'leaf') { ctx.fillStyle = `rgba(215,225,240,${a})`; ctx.beginPath(); ctx.ellipse(f.x, f.y, 3, 1.6, f.vx * 0.02, 0, 6.28); ctx.fill(); }
    else if (f.k === 'spark') { ctx.fillStyle = `rgba(235,140,50,${a})`; ctx.beginPath(); ctx.arc(f.x, f.y, 2, 0, 6.28); ctx.fill(); }
    else if (f.k === 'drop') { ctx.fillStyle = `rgba(30,25,20,${a * 0.8})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.28); ctx.fill(); }
    else if (f.k === 'bolt') { ctx.strokeStyle = `rgba(150,120,230,${a})`; ctx.lineWidth = 4; ctx.beginPath(); f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.strokeStyle = `rgba(255,250,255,${a})`; ctx.lineWidth = 1.5; ctx.stroke(); }
    else if (f.k === 'txt') { ctx.globalAlpha = Math.min(1, a * 2); ctx.font = `${f.bold ? 'bold ' : ''}${f.size}px "Songti SC","STSong",serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(246,239,223,0.9)'; ctx.strokeText(f.s, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.s, f.x, f.y); ctx.textAlign = 'left'; ctx.globalAlpha = 1; }
  }
  const boss = g.beasts.find((b) => BEASTS[b.type].boss);
  if (boss) {
    const bw = 260, bx = (W - bw) / 2, by = 16;
    ctx.fillStyle = 'rgba(42,36,29,0.75)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14); ctx.fillStyle = '#e9dfcc'; ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = boss.crying > 0 ? '#e0a040' : '#b0412e'; ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.max), 10);
    ctx.fillStyle = INK; ctx.font = 'bold 13px "Songti SC",serif'; ctx.textAlign = 'center';
    ctx.fillText(`${v.bossName} ${Math.ceil(Math.max(0, boss.hp))} / ${boss.max}${boss.crying > 0 ? ` · ${v.says.cry}` : ''}`, W / 2, by + 28); ctx.textAlign = 'left';
  }
  if (v.paused && !g.over) { ctx.fillStyle = 'rgba(42,36,29,0.25)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#f6efdf'; ctx.font = 'bold 34px "Songti SC",serif'; ctx.textAlign = 'center'; ctx.fillText(v.says.paused, W / 2, H / 2); ctx.textAlign = 'left'; }
}

/** 狐火 on the ground: a blue glow and flames that flicker, fading in its last second. */
function drawFire(c, f, t) {
  const fade = Math.min(1, f.t, (f.max - f.t) * 4);
  const gl = c.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r);
  gl.addColorStop(0, `rgba(110,170,255,${0.42 * fade})`); gl.addColorStop(1, 'rgba(110,170,255,0)');
  c.fillStyle = gl; c.beginPath(); c.ellipse(f.x, f.y, f.r, f.r * 0.6, 0, 0, 6.28); c.fill();
  const spots = [[0, 0], [-0.55, -0.15], [0.55, -0.1], [-0.3, 0.35], [0.3, 0.38], [0, -0.45]];
  spots.forEach(([dx, dy], i) => drawFlame(c, f.x + dx * f.r * 0.8, f.y + dy * f.r * 0.5, 22 + (i % 3) * 4, 1 + ((Math.floor(t * 8) + i) % 3), 0.9 * fade));
}
/** Aiming a skill: her reach, and the ground it will take. `aim`: { key, x, y } (the pointer, on the board). */
function drawAim(c, g, aim) {
  const h = g.hero, S = SKILLS[aim.key];
  if (h.dead > 0 || !S) return;
  c.setLineDash([6, 5]); c.strokeStyle = 'rgba(60,100,120,0.6)'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(h.x, h.y, S.range, 0, 6.28); c.stroke(); c.setLineDash([]);
  if (aim.x == null) return;
  const inR = Math.hypot(aim.x - h.x, aim.y - h.y) <= S.range;
  c.fillStyle = aim.key === 'e' ? 'rgba(90,150,240,0.18)' : aim.key === 'r' ? 'rgba(200,210,235,0.22)' : 'rgba(176,65,46,0.14)';
  c.strokeStyle = inR ? 'rgba(42,36,29,0.75)' : 'rgba(176,65,46,0.8)'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(aim.x, aim.y, S.r, S.r * 0.6, 0, 0, 6.28); c.fill(); c.stroke();
}

/** The page's own marks for what the engine reports (kills, booms): ink, drops, sparks. */
export function markEvent(g, e) {
  if (e.kill && BEASTS[e.kill].shade) { // eyes in the dark, beaten: they blink, and slink off — no ink, nothing to pick up
    g.fx.push({ k: 'blink', x: e.x, y: e.y - BEASTS[e.kill].r * 0.6, life: 0.9, max: 0.9 });
    return;
  }
  if (e.fed) g.fx.push({ k: 'txt', x: g.L.furn.x, y: g.L.furn.y - 46, s: `+${e.fed}`, col: '#d9822b', life: 1.1, max: 1.1, vy: -26, size: 16, bold: true });
  if (e.snap) for (let k = 0; k < 6; k += 1) { const a = Math.random() * 6.28, s = 30 + Math.random() * 50; g.fx.push({ k: 'leaf', x: e.snap[0], y: e.snap[1] - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.8, max: 0.8 }); }
  if (e.kill) {
    const r = BEASTS[e.kill].r, blobs = [];
    for (let k = 0; k < 7; k += 1) { const a = Math.random() * 6.28, dd = Math.random() * r * 1.4; blobs.push([Math.cos(a) * dd, Math.sin(a) * dd * 0.6, r * (0.3 + Math.random() * 0.5)]); }
    g.fx.push({ k: 'ink', x: e.x, y: e.y + r * 0.3, blobs, life: 1.6, max: 1.6, col: BEASTS[e.kill].color });
    for (let k = 0; k < 10; k += 1) { const a = Math.random() * 6.28, s = 40 + Math.random() * 90; g.fx.push({ k: 'drop', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, r: 1.5 + Math.random() * 2.5, life: 0.6, max: 0.6 }); }
    g.fx.push({ k: 'txt', x: e.x, y: e.y - 14, s: `+${e.reward}`, col: '#9a7418', life: 1, max: 1, vy: -26, size: 14, bold: true });
  }
  if (e.boom) for (let k = 0; k < 8; k += 1) { const a = Math.random() * 6.28, s = 50 + Math.random() * 80; g.fx.push({ k: 'spark', x: e.boom[0], y: e.boom[1], vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: 0.5, max: 0.5 }); }
  if (e.leak) g.fx.push({ k: 'txt', x: g.L.furn.x, y: g.L.furn.y - 40, s: `-${e.leak}`, col: '#b0412e', life: 1.2, max: 1.2, vy: -24, size: 16, bold: true });
}
export function stepFx(g, dt) {
  for (const f of g.fx) { f.life -= dt; if (f.vx !== undefined) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += (f.k === 'drop' ? 260 : 120) * dt; } else if (f.vy) f.y += f.vy * dt; }
  g.fx = g.fx.filter((f) => f.life > 0);
  g.shake = Math.max(0, g.shake - dt * 30); g.furnFlash = Math.max(0, g.furnFlash - dt);
  const h = g.hero;
  if (h.say) { h.say.life -= dt; if (h.say.life <= 0) h.say = null; }
}
/** The beasts' sheet has loaded (a wave chip drawn before it would be the code figure: don't cache that one). */
export const beastArtReady = () => !!ART.cells && okImg(ART.beasts);
/** A small picture of a beast (the wave preview's chips). */
export function beastIcon(doc, type) {
  const c = doc.createElement('canvas'); c.width = 56; c.height = 56;
  const x = c.getContext('2d'), big = BEASTS[type].boss;
  drawBeast(x, type, big ? 30 : 28, 32, 0.3, 1, 0, big ? 0.6 : 1.7);
  return c.toDataURL();
}
/** 银月's portrait for the hero panel: her idle frame's head, as a CSS background (null while the art loads). */
export function portraitStyle(px) {
  if (!artReady()) return null;
  const m = YY.meta, [x, y] = m.sheets.yinyue['idle-1'], [cw] = m.cell, k = px / 70; // the head is ~70 px of her cell
  const [iw, ih] = [YY.img.naturalWidth, YY.img.naturalHeight];
  return { backgroundImage: `url("${YY.img.src}")`, backgroundSize: `${iw * k}px ${ih * k}px`, backgroundPosition: `${-(x + cw - 92) * k}px ${-(y + 14) * k}px` };
}
